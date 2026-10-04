"""Listings and bios in Spanish and Hindi, translated ahead of time.

The client sends `X-Lang: es` or `X-Lang: hi` with every request (the app
does this once the user picks a language). Responses then carry the
translated title, description, quantity, price, tags and bio in place of
the originals - same fields and shape, so nothing else in the client changes.
English, or no header, returns what people wrote.

Translations are stored per item and language with a hash of the source
text. Editing a listing makes its old translation stale: the original is
shown until the new one is ready (a background job re-translates with the
LLM a few seconds after any create or edit, and at startup catches up on
anything missing). Search and the AI features keep working on the
originals.
"""

import hashlib
import json
import logging
import os
import re
import threading
from contextvars import ContextVar
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

log = logging.getLogger(__name__)

LANGS = ("es", "hi")
LANG_NAMES = {"es": "Spanish", "hi": "Hindi"}
FIELDS = {
    "listing": ("title", "description", "quantity", "price", "tags"),
    "user": ("bio",),
}

current_lang: ContextVar[str] = ContextVar("lang", default="en")

# (kind, item_id, lang) -> {"hash": ..., "data": {field: text}}. Small (a
# few KB per hundred listings), so all of it lives in memory.
_cache: dict[tuple[str, int, str], dict] = {}
_lock = threading.Lock()


class LangMiddleware:
    """Pure ASGI, so the language is set in the context the endpoint
    (and its thread-pool worker) actually runs in."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        lang = "en"
        for key, value in scope.get("headers", []):
            if key == b"x-lang":
                v = value.decode("latin-1").strip().lower()
                lang = v if v in LANGS else "en"
                break
        token = current_lang.set(lang)

        async def send_vary(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + [(b"vary", b"X-Lang")]
            await send(message)

        try:
            await self.app(scope, receive, send_vary)
        finally:
            current_lang.reset(token)


# ---------- source text ----------


def source_of(kind: str, item) -> dict:
    """The translatable fields of an ORM row or a pydantic model."""
    out = {}
    for f in FIELDS[kind]:
        v = getattr(item, f, None)
        if f == "tags" and isinstance(v, str):
            v = [t.strip() for t in v.split(",") if t.strip()]
        out[f] = v or ([] if f == "tags" else None)
    return out


def source_hash(source: dict) -> str:
    return hashlib.sha1(json.dumps(source, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


# ---------- reading ----------


def load(db: DbSession) -> None:
    from models import Translation

    with _lock:
        _cache.clear()
        for row in db.query(Translation).all():
            _cache[(row.kind, row.item_id, row.lang)] = {"hash": row.src_hash, "data": json.loads(row.data)}


def lookup(kind: str, item_id: int, source: dict, lang: Optional[str] = None) -> Optional[dict]:
    """Translated fields for the request's language, or None (English, not
    translated yet, or stale after an edit)."""
    lang = lang or current_lang.get()
    if lang not in LANGS:
        return None
    hit = _cache.get((kind, item_id, lang))
    if not hit or hit["hash"] != source_hash(source):
        return None
    return hit["data"]


def apply(kind: str, item_id: int, model) -> None:
    """Swap translated text into a response model, in place."""
    data = lookup(kind, item_id, source_of(kind, model))
    if not data:
        return
    for f in FIELDS[kind]:
        v = data.get(f)
        if f == "tags":
            if isinstance(v, list) and len(v) == len(getattr(model, f) or []):
                setattr(model, f, [str(t) for t in v])
        elif isinstance(v, str) and v.strip() and getattr(model, f, None):
            setattr(model, f, v)


# ---------- writing ----------


def save(db: DbSession, kind: str, item_id: int, lang: str, source: dict, data: dict) -> None:
    from models import Translation

    clean = {f: data[f] for f in FIELDS[kind] if f in data and data[f] not in (None, "", [])}
    row = db.get(Translation, (kind, item_id, lang))
    if row is None:
        row = Translation(kind=kind, item_id=item_id, lang=lang)
        db.add(row)
    row.src_hash = source_hash(source)
    row.data = json.dumps(clean, ensure_ascii=False)
    db.commit()
    with _lock:
        _cache[(kind, item_id, lang)] = {"hash": row.src_hash, "data": clean}


def missing(kind: str, item_id: int, source: dict) -> list[str]:
    h = source_hash(source)
    return [l for l in LANGS if (_cache.get((kind, item_id, l)) or {}).get("hash") != h]


# ---------- machine translation for new and edited posts ----------

TRANSLATE_PROMPT = """You translate posts on Banyan, an app where neighbours in small farming \
towns share spare materials, tools and skills. Translate the JSON fields into {langs}.

Rules:
- Plain, everyday words a villager would use - not formal or literary language.
- Keep numbers, units (kg, HP, ft, W), measurements and brand names exactly as written.
- Keep people's and towns' names unchanged.
- Translate meaning, not word by word: "need a hand" -> the natural local phrase.
- Hindi in Devanagari. Common borrowed words people actually say (पंप, मोटर, ट्रैक्टर, \
सोलर) stay as they are.
- tags: translate each tag; same number of tags, same order.
- Return null for any field that is null.

Reply with JSON only, shaped {{"es": {{...same keys...}}, "hi": {{...same keys...}}}}, \
with only the languages asked for."""


class _Fields(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[str] = None
    price: Optional[str] = None
    tags: Optional[list[str]] = None
    bio: Optional[str] = None


class _Out(BaseModel):
    es: Optional[_Fields] = None
    hi: Optional[_Fields] = None


def translate_model() -> str:
    # Hindi needs more than a 4B model: Qwen3-4B turns "borewell pump"
    # into nonsense; the 30B MoE is accurate and still ~3 s.
    return os.getenv("TRANSLATE_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507")


def machine_translate(kind: str, source: dict, langs: list[str]) -> Optional[dict]:
    import llm

    if not llm.configured() or not langs:
        return None
    payload = {k: v for k, v in source.items() if v not in (None, "", [])}
    if not payload:
        return None
    prompt = TRANSLATE_PROMPT.format(langs=" and ".join(f"{LANG_NAMES[l]} ({l})" for l in langs))
    try:
        out, _ = llm.complete_json(
            [{"role": "system", "content": prompt},
             {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            _Out, timeout=40, model=translate_model(), max_tokens=1200,
        )
    except Exception as exc:
        log.warning("Translation failed (%s %s): %s", kind, langs, exc)
        return None
    result = {}
    for lang in langs:
        fields = getattr(out, lang)
        if fields is not None:
            data = fields.model_dump(exclude_none=True)
            if kind == "listing" and source.get("tags") and len(data.get("tags") or []) != len(source["tags"]):
                data.pop("tags", None)  # mismatched tags would mislabel; keep originals
            result[lang] = data
    return result


def translate_item(kind: str, item_id: int) -> None:
    """Fill any missing or stale translations for one listing or user."""
    from database import SessionLocal
    from models import Listing, User

    with SessionLocal() as db:
        item = db.get(Listing if kind == "listing" else User, item_id)
        if item is None:
            return
        source = source_of(kind, item)
        langs = missing(kind, item_id, source)
        if not langs or not any(v for v in source.values()):
            return
        result = machine_translate(kind, source, langs) or {}
        for lang, data in result.items():
            save(db, kind, item_id, lang, source, data)


def translate_later(kind: str, item_id: int) -> None:
    """After a create or edit: translate in the background, off the request."""
    threading.Thread(target=translate_item, args=(kind, item_id), daemon=True).start()


def backfill() -> None:
    """Startup: translate anything posted while the model was unavailable."""
    from database import SessionLocal
    from models import Listing, User

    with SessionLocal() as db:
        todo = [("listing", l.id) for l in db.query(Listing).all() if missing("listing", l.id, source_of("listing", l))]
        todo += [("user", u.id) for u in db.query(User).all() if u.bio and missing("user", u.id, source_of("user", u))]
    for kind, item_id in todo[:200]:
        translate_item(kind, item_id)


# ---------- searches typed in Spanish or Hindi ----------

# Listings are searched in the language they were written in (English, for
# now), so a search like "पंप" or "semillas" is turned into English first:
# from the tag translations above when every word is known (no model call),
# else by the translation model. Cached either way.

_STOP = {
    "es": {"para", "de", "del", "mí", "mi", "aquí", "la", "el", "los", "las", "un", "una", "unos", "unas", "con", "que", "mi", "mis",
           "algo", "alguien", "necesito", "busco", "quiero", "y", "o", "en", "por", "a", "se", "me", "tu"},
    "hi": {"के", "का", "मेरे", "यहाँ", "यहां", "की", "को", "में", "से", "पर", "और", "या", "लिए", "चाहिए", "है", "हैं", "मुझे", "कोई",
           "एक", "मेरे", "मेरा", "मेरी", "वाला", "वाली", "वाले", "ढूंढ", "रहा", "रही", "हूं", "हूँ"},
}
# Filter words typed into the search box ("bomba cerca de mí", "मुफ़्त पंप पास में"):
# mapped to the English the search rules understand (free, lend, near, within N km).
_FILTER_WORDS = {
    "gratis": "free", "regalo": "free", "prestado": "lend", "prestar": "lend", "préstamo": "lend",
    "cerca": "near", "cercano": "near", "cercanos": "near", "dentro": "within", "km": "km",
    "kilómetros": "km", "intercambio": "trade", "cambio": "trade",
    "मुफ़्त": "free", "मुफ्त": "free", "फ्री": "free", "उधार": "lend", "पास": "near", "नज़दीक": "near",
    "नजदीक": "near", "अंदर": "within", "भीतर": "within", "किमी": "km", "किलोमीटर": "km", "बदले": "trade",
}
_glossary: dict[str, str] = {}
_glossary_key = None
_query_cache: dict[str, Optional[str]] = {}


def _norm(text: str) -> str:
    return " ".join(text.lower().replace(",", " ").replace("?", " ").replace("!", " ").split())


def _build_glossary(db: DbSession) -> dict[str, str]:
    """Translated tag or title -> English, from our own translations."""
    from models import Listing

    global _glossary, _glossary_key
    key = len(_cache)
    if key == _glossary_key:
        return _glossary
    gloss: dict[str, str] = {}
    for l in db.query(Listing).all():
        src = source_of("listing", l)
        for lang in LANGS:
            data = (_cache.get(("listing", l.id, lang)) or {}).get("data") or {}
            for en, tr in zip(src["tags"], data.get("tags") or []):
                gloss.setdefault(_norm(tr), en)
            if data.get("title"):
                gloss.setdefault(_norm(data["title"]), src["title"])
    _glossary, _glossary_key = gloss, key
    return gloss


def needs_english(text: str) -> bool:
    return current_lang.get() in LANGS or not text.isascii()


def _from_glossary(db: DbSession, text: str) -> Optional[str]:
    gloss = _build_glossary(db)
    norm = _norm(text)
    if norm in gloss:
        return gloss[norm]
    words, out, i = norm.split(), [], 0
    stop = _STOP["es"] | _STOP["hi"]
    while i < len(words):
        for size in (3, 2, 1):  # longest known phrase first ("máquina de coser")
            phrase = " ".join(words[i : i + size])
            hit = (_FILTER_WORDS.get(phrase) if size == 1 else None) or gloss.get(phrase) or (gloss.get(phrase[:-1]) if phrase.endswith("s") else None) \
                or (gloss.get(phrase[:-2]) if phrase.endswith("es") else None)
            if hit:
                out.append(hit)
                i += size
                break
        else:
            if words[i] not in stop and not (words[i].isascii() and words[i].isdigit()):
                return None  # an unknown word: let the model translate the whole thing
            if words[i].isdigit():
                out.append(words[i])
            i += 1
    english = " ".join(out)
    # Hindi puts "within" after the distance ("10 किमी के अंदर" -> "10 km within").
    english = re.sub(r"\b(\d{1,3}) km within\b", r"within \1 km", english)
    return english or None


class _Query(BaseModel):
    en: str


def to_english(db: DbSession, text: str) -> str:
    """A search or refinement in English, or `text` unchanged when it
    already is (or nothing could translate it)."""
    if not text.strip() or not needs_english(text):
        return text
    key = _norm(text)
    if key in _query_cache:
        return _query_cache[key] or text
    english = _from_glossary(db, text)
    if english is None:
        import llm

        if llm.configured():
            try:
                out, _ = llm.complete_json(
                    [{"role": "system", "content": "Translate this search from a farming-village sharing app "
                      "into short plain English. Keep numbers. If it is already English, return it unchanged. "
                      'Reply with JSON only: {"en": "..."}'},
                     {"role": "user", "content": text}],
                    _Query, timeout=8, model=translate_model(), max_tokens=60,
                )
                english = " ".join(out.en.split())[:200] or None
            except Exception as exc:
                log.warning("Query translation failed: %s", exc)
                return text  # don't cache: try again next time
    if len(_query_cache) > 2000:
        _query_cache.clear()
    _query_cache[key] = english
    return english or text
