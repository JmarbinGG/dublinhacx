"""Smart search: one search bar, two model sizes, and refinements.

    POST /api/search/smart

    1. New search   {q, community?}
         A small model decides: is this a SIMPLE search ("screws", "pump set")
         or a COMPLEX one ("things I can use to cut down a tree")?
           simple  -> the small model's keywords query the DB directly
           complex -> the big model works out what's needed and what to
                      search for (axe, saw, chainsaw...), then the DB is queried
         Obvious one- or two-word searches skip the model entirely.
    2. Refine        {state, refine: "5", community?}
         `state` is what the previous response returned. The refinement is
         merged into it ("5" -> quantity 5, "small" -> size, "free" ->
         free only); plain refinements are parsed by rules, anything else
         goes to the small model. The client can also edit the state itself
         (e.g. remove a refinement chip) and send it back without `refine`.
    3. More results  {state, offset}  - no model call at all.

The server keeps no search session: the state round-trips in the request,
so a refinement costs one small request and nothing is stored.

Low data use: results are slim cards (no descriptions, tags, timestamps or
owner photos - open the listing for those), 12 per page, nulls omitted, and
responses are gzipped. Same query + same refinement hits a server cache
instead of the model.

The model never decides what's real: it only produces search terms and
filters, the DB query is ours, and every card is a row we just read.
"""

import json
import logging
import re
import threading
import time
from collections import OrderedDict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession

import categories
import communities
import llm
import storage
from auth import optional_user
from communities import Community
from database import get_db
from limits import ai_allowance
from models import Listing, User
from prompting import SAFETY_RULES, fence
from routers.listings import _word_clause, base_query, with_distances
from schemas import ExchangeType, ListingKind, ListingType
from textutil import MAX_QUERY_CHARS, STOPWORDS, clip, strip_urls

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])

DEFAULT_LIMIT = 12
MAX_LIMIT = 24
CANDIDATE_CAP = 300
MAX_TERMS = 8
SMALL_TIMEOUT_S = 5
BIG_TIMEOUT_S = 8
REQUEST_BUDGET_S = 14  # all model calls for one request; the client gives up at 20s
NEAR_KM = 25
CACHE_SIZE = 512
CACHE_TTL_S = 3600


# ---------- state ----------


def _clean_word_list(values, limit: int, max_len: int) -> list[str]:
    out: list[str] = []
    for v in values or []:
        if not isinstance(v, str):
            continue
        v = re.sub(r"[^a-z0-9 \-]", " ", strip_urls(v).lower())
        v = " ".join(v.split()[:3])[:max_len].strip()
        if v and v not in out:
            out.append(v)
    return out[:limit]


class SearchState(BaseModel):
    """Everything that defines a search. Returned with every response;
    send it back to refine or page."""

    q: str = Field(min_length=1, max_length=MAX_QUERY_CHARS)
    mode: Literal["simple", "complex"] = "simple"
    terms: list[str] = []  # what to look for, e.g. ["axe", "saw"]
    attrs: list[str] = []  # soft preferences that boost matches, e.g. ["small"]
    qty: Optional[int] = Field(None, ge=1, le=100_000)
    type: Optional[ListingType] = None
    kind: Optional[ListingKind] = None
    exchange: Optional[ExchangeType] = None
    category: Optional[str] = None  # one of GET /api/categories ids
    max_km: Optional[float] = Field(None, gt=0, le=500)
    need: Optional[str] = Field(None, max_length=120)  # complex mode: what the shopper is trying to do
    refinements: list[str] = []  # what the shopper typed to refine, oldest first

    @field_validator("terms", mode="before")
    @classmethod
    def _terms(cls, v):
        return _clean_word_list(v, MAX_TERMS, 40)

    @field_validator("attrs", mode="before")
    @classmethod
    def _attrs(cls, v):
        return _clean_word_list(v, 6, 30)

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        return v if v in categories.LABELS else None

    @field_validator("refinements", mode="before")
    @classmethod
    def _refinements(cls, v):
        return [clip(strip_urls(r), 100) for r in (v or []) if isinstance(r, str) and r.strip()][-10:]


class SmartSearchRequest(BaseModel):
    q: Optional[str] = Field(None, max_length=MAX_QUERY_CHARS)
    state: Optional[SearchState] = None
    refine: Optional[str] = Field(None, max_length=100)
    community: Optional[str] = Field(None, max_length=120)
    community_id: Optional[str] = Field(None, max_length=120)
    limit: int = Field(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)
    offset: int = Field(0, ge=0, le=500)

    @model_validator(mode="after")
    def _one_of(self):
        if self.state is None and not (self.q or "").strip():
            raise ValueError("q or state required")
        if self.refine is not None and self.state is None:
            raise ValueError("refine needs state")
        return self


class Card(BaseModel):
    """A listing, slimmed down for result lists. GET /api/listings/{id} for the rest."""

    id: int
    title: str
    type: str
    kind: str
    exchange: str
    price: Optional[str] = None
    quantity: Optional[str] = None
    community: Optional[str] = None
    distance_km: Optional[float] = None
    image: Optional[str] = None
    image_size_kb: Optional[int] = None
    owner_id: int
    owner_name: str
    match: Optional[str] = None  # which search term this matched (complex mode)


class Suggestion(BaseModel):
    label: str  # button text
    refine: str  # send as `refine` when tapped


class SmartSearchResponse(BaseModel):
    mode: Literal["simple", "complex"]
    engine: Literal["ai", "keyword"]  # "ai" if a model shaped this search
    ai: bool
    state: SearchState  # send back to refine/page; state.terms = what was searched, state.need = complex goal
    suggestions: list[Suggestion]
    results: list[Card]
    has_more: bool


# ---------- rules (no model) ----------

SIZE_WORDS = {"small", "tiny", "mini", "little", "medium", "large", "big", "huge", "long", "short",
              "heavy", "light", "thick", "thin", "wide", "narrow", "new", "used", "old"}
EXCHANGE_WORDS = {"free": "free", "lend": "lend", "borrow": "lend", "loan": "lend", "trade": "trade",
                  "swap": "trade", "barter": "trade", "paid": "paid", "buy": "paid", "sell": "paid", "hire": "paid"}
TYPE_WORDS = {"tool": "equipment", "tools": "equipment", "equipment": "equipment", "machine": "equipment",
              "machinery": "equipment", "material": "material", "materials": "material", "supplies": "material",
              "skill": "skill", "skills": "skill", "service": "skill", "services": "skill", "job": "skill",
              "jobs": "skill", "lesson": "skill", "lessons": "skill", "work": "skill"}
KIND_WORDS = {"wanted": "request", "requests": "request", "request": "request", "offers": "offer", "offered": "offer"}
FILLER = STOPWORDS | {"only", "just", "pieces", "piece", "pcs", "units", "unit", "of", "about", "around", "at", "least",
                      "thing", "things", "stuff", "something", "anything", "can", "could", "would", "use", "using",
                      "down", "up", "out", "make", "get", "good", "best", "how", "which", "should", "will"}
ANY_CLEARS = {"size": {"attrs": []}, "amount": {"qty": None}, "quantity": {"qty": None},
              "distance": {"max_km": None}, "price": {"exchange": None}, "category": {"category": None}}
CLEAR_ALL = {"attrs": [], "qty": None, "max_km": None, "exchange": None, "type": None, "kind": None, "category": None}

_DISTANCE_RE = re.compile(r"\bwithin\s+(\d{1,3})\s*(km|kms|kilometres?|kilometers?|mi|miles?)?\b")
_NEAR_RE = re.compile(r"\b(near(by)?|close( by)?|local)\b")
_ANY_RE = re.compile(r"\b(any|clear|reset)\s+(size|amount|quantity|distance|price|category|filters?)\b")
_ONLY_RE = re.compile(r"^only\s+([a-z][a-z0-9 \-]{1,40})$")
_COMPLEX_RE = re.compile(
    r"\b(something|things?|stuff|anything|how|what|which|need to|want to|so (that )?i|i can|help me|"
    r"use (to|for)|for (my|a|an|the)|to (fix|build|make|cut|clean|grow|repair|move|paint|cook|start))\b"
)


def stem(word: str) -> str:
    """Cheap stem: screws -> screw, boxes -> box, welder/welding -> weld.
    Matching is substring, so the stem still finds every longer form."""
    if len(word) > 4 and word.endswith("es") and word[-3] in "sxz":
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        word = word[:-1]
    if len(word) > 6 and word.endswith("ing"):
        return word[:-3]
    if len(word) > 5 and word.endswith("er") and not word.endswith("eer"):
        return word[:-2]
    return word


def stem_phrase(term: str) -> str:
    """Singular words, minus filler ("someone to repair" -> "repair"). "" if nothing's left."""
    return " ".join(stem(w) for w in term.split() if w not in FILLER)


def looks_simple(q: str) -> bool:
    """Short noun-ish searches don't need a model to classify them."""
    return len(q.split()) <= 3 and not _COMPLEX_RE.search(q.lower())


def parse_rules(text: str, initial: bool) -> tuple[dict, list[str]]:
    """Pull structured filters out of plain words. Returns (changes, leftover
    words). On a refinement, type words ("tools") are filters; in an initial
    query they might be the thing itself, so they stay as terms."""
    t = text.lower().strip()
    changes: dict = {}

    if m := _ANY_RE.search(t):
        changes.update(ANY_CLEARS.get(m.group(2), CLEAR_ALL))
        t = _ANY_RE.sub(" ", t)
    if not initial and (m := _ONLY_RE.match(t)) and not set(m.group(1).split()) & (set(EXCHANGE_WORDS) | set(TYPE_WORDS)):
        changes["terms"] = [m.group(1)]
        return changes, []
    if m := _DISTANCE_RE.search(t):
        km = int(m.group(1)) * (1.6 if (m.group(2) or "").startswith("mi") else 1)
        changes["max_km"] = min(500, max(1, round(km)))
        t = _DISTANCE_RE.sub(" ", t)
    elif not initial and _NEAR_RE.search(t):
        changes["max_km"] = NEAR_KM
        t = _NEAR_RE.sub(" ", t)

    leftover, attrs = [], []
    for w in re.findall(r"[a-z0-9]+", t):
        if w.isdigit():
            if 0 < int(w) <= 100_000:
                changes["qty"] = int(w)
        elif w in SIZE_WORDS:
            attrs.append(w)
        elif w in EXCHANGE_WORDS:
            changes["exchange"] = EXCHANGE_WORDS[w]
        elif not initial and w in TYPE_WORDS:
            changes["type"] = TYPE_WORDS[w]
        elif not initial and (cid := categories.match_word(w)):
            changes["category"] = cid
        elif w in KIND_WORDS:
            changes["kind"] = KIND_WORDS[w]
        elif w not in FILLER and len(w) > 1:
            leftover.append(w)
    if attrs:
        changes["add_attrs"] = attrs
    return changes, leftover


def apply_changes(state: SearchState, changes: dict) -> SearchState:
    data = state.model_dump()
    for key, value in changes.items():
        if key == "add_attrs":
            data["attrs"] = list(dict.fromkeys(data["attrs"] + value))
        elif key == "add_terms":
            data["terms"] = list(dict.fromkeys(data["terms"] + value))
        else:
            data[key] = value
    return SearchState.model_validate(data)


# ---------- models ----------


# Models only ever produce search terms. Hard filters (exchange, type,
# quantity, distance) come from rules - i.e. from words the shopper actually
# typed - because small models happily invent them ("lend", "material") and
# a wrong filter silently empties the results.


def _str_list(v) -> list:
    """Accept ["axe"] or [{"name": "axe", ...}] - models do both."""
    out = []
    for item in v if isinstance(v, list) else []:
        if isinstance(item, dict):
            item = next((x for x in item.values() if isinstance(x, str)), None)
        if isinstance(item, str):
            out.append(item)
    return out


class _Route(BaseModel):
    mode: Literal["simple", "complex"]
    terms: list[str] = []

    @field_validator("terms", mode="before")
    @classmethod
    def _t(cls, v):
        return _str_list(v)


class _Expand(BaseModel):
    need: str = Field("", max_length=300)
    terms: list[str] = []

    @field_validator("terms", mode="before")
    @classmethod
    def _t(cls, v):
        return _str_list(v)[:12]


class _Refine(BaseModel):
    terms: Optional[list[str]] = None
    attrs: Optional[list[str]] = None

    @field_validator("terms", "attrs", mode="before")
    @classmethod
    def _t(cls, v):
        return None if v is None else _str_list(v)


ROUTE_PROMPT = """You sort searches on Banyan, a site where neighbours in rural towns share \
spare materials, lend tools and equipment, and offer skills or work.

Decide if the search is:
- "simple": it names the thing wanted. terms = that thing.
- "complex": it describes a goal or problem, and the items needed must be worked out. terms = [].

Examples:
"screws" -> {"mode": "simple", "terms": ["screw"]}
"sewing machine for my daughter" -> {"mode": "simple", "terms": ["sewing machine"]}
"someone to teach english" -> {"mode": "simple", "terms": ["english"]}
"things i can use to cut down a tree" -> {"mode": "complex", "terms": []}
"how do i fix a leaking roof" -> {"mode": "complex", "terms": []}
"need water for my crops" -> {"mode": "complex", "terms": []}

Return only JSON: {"mode": "simple"|"complex", "terms": [...]}

""" + SAFETY_RULES

EXPAND_PROMPT = """You help shoppers on Banyan, a site where neighbours in rural towns share \
spare materials, lend tools and equipment, and offer skills or work.

The shopper described a goal. Work out what they need and what to search for.
Return only JSON: {"need": "<what they're trying to do, under 60 characters>", \
"terms": [up to 6 specific things or skills to search for, most useful first, \
1-2 words each, singular]}
Include hand tools, machinery that could be borrowed or hired (tractor, excavator, \
pump...) and the skill/person who could do it, when those make sense \
(e.g. cutting down a tree: "axe", "chainsaw", "bow saw", "rope", "tree felling"; \
digging a pond: "excavator", "jcb", "shovel", "pond liner", "digging").
Only list things that directly help with the goal.

""" + SAFETY_RULES

REFINE_PROMPT = """You update a search on Banyan (neighbours sharing materials, tools and skills).
You get the current search terms and preferences as JSON, and a refinement the shopper typed.
Return only JSON with the updated lists: {"terms": [...], "attrs": [...]}
"terms" = the things searched for (singular). "attrs" = soft preferences such as material,
colour, size or condition. Keep existing values unless the refinement replaces or removes them.

""" + SAFETY_RULES

_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_cache_lock = threading.Lock()


def _cached(key: str):
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            _cache.move_to_end(key)
            return hit[1]
        return None


def _store(key: str, value: dict) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), value)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)


class _ModelBudget:
    """Model calls for one request: off when unconfigured or rate limited,
    and every call shares one deadline so a slow model can't push the
    request past the client's timeout."""

    def __init__(self, request: Request, user: Optional[User]):
        self.request, self.user = request, user
        self.enabled = llm.configured()
        self.checked = False
        self.used = False
        self.deadline = time.monotonic() + REQUEST_BUDGET_S
        self.degraded = False  # an answer came from a fallback - don't cache it

    def allow(self) -> bool:
        if self.enabled and not self.checked:
            self.checked = True
            self.enabled = ai_allowance("search_smart", self.request, self.user)
        return self.enabled

    def call(self, messages, schema, timeout, model):
        remaining = self.deadline - time.monotonic()
        if not self.allow() or remaining < 1.5:
            return None
        try:
            out, _ = llm.complete_json(messages, schema, timeout=min(timeout, remaining), model=model, max_tokens=250)
            self.used = True
            return out
        except llm.LLMError as e:
            log.warning("Smart search model call failed (%s): %s", model, e)
            return None


def new_search(db: DbSession, q: str, models: _ModelBudget) -> tuple[SearchState, bool]:
    """Returns (state, used_model)."""
    key = "new:" + " ".join(q.lower().split())
    if (hit := _cached(key)) is not None:
        return SearchState.model_validate(hit), True

    changes, leftover = parse_rules(q, initial=True)
    stems = [stem(w) for w in leftover]
    # Simple: the leftover words are one thing ("pump set"). Complex without a
    # model: each meaningful word is searched separately.
    rule_state = apply_changes(SearchState(q=q, terms=[" ".join(stems[:3])] if stems else [q.lower()]), changes)
    word_state = rule_state.model_copy(update={"mode": "complex", "terms": stems[:MAX_TERMS]}) if len(stems) > 1 else rule_state
    if looks_simple(q):
        return rule_state, False

    # 1. Small model: simple or complex? (If it fails, trust the phrasing.)
    state, used = word_state, False
    route = models.call(
        [{"role": "system", "content": ROUTE_PROMPT}, {"role": "user", "content": fence(q)}],
        _Route, SMALL_TIMEOUT_S, llm.small_model(),
    )
    if route is not None:
        used = True
        if route.mode == "simple":
            terms = [p for t in _clean_word_list(route.terms, 4, 40) if (p := stem_phrase(t))] or rule_state.terms
            state = rule_state.model_copy(update={"terms": terms})
    complex_ = route.mode == "complex" if route is not None else len(stems) > 1

    # 2. Big model: what does a complex search actually need?
    expanded = None
    if complex_:
        expanded = expand_search(db, q, word_state, models)
        state = expanded or word_state  # no model could help: search the meaningful words
        used = used or expanded is not None

    # Only cache answers the models fully produced - a timeout today
    # shouldn't pin a worse result for the next hour.
    if used and (not complex_ or expanded is not None) and not models.degraded:
        _store(key, state.model_dump())
    return state, used


def expand_search(db: DbSession, q: str, base: SearchState, models: _ModelBudget) -> Optional[SearchState]:
    """Ask the big model what a goal needs - or, if it's slow or fails, the
    small one with whatever time is left. None if neither could help."""
    messages = [
        {"role": "system", "content": EXPAND_PROMPT},
        {"role": "user", "content": f"Shopper's goal:\n{fence(q)}"},
    ]
    expand = models.call(messages, _Expand, BIG_TIMEOUT_S, llm.big_model())
    if (expand is None or not expand.terms) and llm.small_model() != llm.big_model():
        expand = models.call(messages, _Expand, SMALL_TIMEOUT_S, llm.small_model())
        models.degraded = True  # small model's guess: fine to show, not to cache
    terms = [p for t in _clean_word_list(expand.terms, 6, 40) if (p := stem_phrase(t))] if expand else []
    terms = list(dict.fromkeys(terms))  # "mechanics" and "mechanic" both stem to one
    if not terms:
        return None
    return base.model_copy(update={"mode": "complex", "terms": terms,
                                   "need": clip(strip_urls(expand.need), 120) or None})


def refine_search(state: SearchState, text: str, models: _ModelBudget) -> tuple[SearchState, bool]:
    text = " ".join(strip_urls(text).split())
    changes, leftover = parse_rules(text, initial=False)
    base = state.model_copy(update={"refinements": state.refinements + [text]})
    if not leftover:  # fully understood by rules - no model needed
        return apply_changes(base, changes), False

    key = "refine:" + json.dumps(state.model_dump(exclude={"refinements"}), sort_keys=True) + "|" + text.lower()
    if (hit := _cached(key)) is not None:
        return apply_changes(base, hit), True

    current = {"terms": state.terms, "attrs": state.attrs}
    out = models.call(
        [{"role": "system", "content": REFINE_PROMPT},
         {"role": "user", "content": f"Current search:\n{fence(current)}\n\nRefinement:\n{fence(text)}"}],
        _Refine, SMALL_TIMEOUT_S, llm.small_model(),
    )
    if out is None or (not out.terms and not out.attrs):
        # No model, or nothing usable from it: unknown words become soft preferences.
        changes["add_attrs"] = changes.get("add_attrs", []) + leftover
        return apply_changes(base, changes), False

    model_changes = {k: v for k, v in out.model_dump(exclude_unset=True).items() if v is not None}
    if "terms" in model_changes:
        model_changes["terms"] = [p for t in _clean_word_list(model_changes["terms"], MAX_TERMS, 40) if (p := stem_phrase(t))] or state.terms
    model_changes.update({k: v for k, v in changes.items() if k != "add_attrs"})  # rules win on what they parsed
    if changes.get("add_attrs"):
        model_changes["attrs"] = list(dict.fromkeys((model_changes.get("attrs") or state.attrs) + changes["add_attrs"]))
    try:
        new_state = apply_changes(base, model_changes)
    except ValidationError:  # model gave out-of-range values - use the rules result
        changes["add_attrs"] = changes.get("add_attrs", []) + leftover
        return apply_changes(base, changes), False
    _store(key, model_changes)
    return new_state, True


# ---------- running a state against the DB ----------

_NUMBER_RE = re.compile(r"\d[\d,]*")


def _listing_qty(text: Optional[str]) -> Optional[int]:
    m = _NUMBER_RE.search(text or "")
    return int(m.group().replace(",", "")) if m else None


def run_state(
    db: DbSession, state: SearchState, origin: Optional[Community], limit: int, offset: int
) -> tuple[list[Card], bool]:
    query = base_query(db).filter(Listing.status == "available")
    if state.type:
        query = query.filter(Listing.type == state.type)
    if state.kind:
        query = query.filter(Listing.kind == state.kind)
    if state.exchange:
        query = query.filter(Listing.exchange == state.exchange)
    if state.category:
        query = query.filter(Listing.category == state.category)

    terms = state.terms or state.attrs or [state.q.lower()]
    term_words = [[stem(w) for w in t.split() if w not in STOPWORDS] or [stem(t)] for t in terms]
    words = {w for ws in term_words for w in ws}
    rows = (
        query.filter(or_(*[_word_clause(w) for w in words]))
        .order_by(Listing.created_at.desc(), Listing.id.desc())
        .limit(CANDIDATE_CAP)
        .all()
    )

    scored = []
    for l in rows:
        title, tags = (l.title or "").lower(), (l.tags or "").lower()
        rest = f"{l.category or ''} {l.description or ''} {l.owner.community or ''}".lower()
        hay = f"{title} {tags} {rest}"
        score, match, full, others = 0.0, None, False, 0.0
        for term, ws in zip(terms, term_words):
            # Every word of the term found = full score; some = partial.
            s = sum(3 if w in title else 2 if w in tags else 1 if w in rest else 0 for w in ws) / len(ws)
            is_full = all(w in hay for w in ws)
            others += s
            if (is_full, s) > (full, score):
                score, match, full = s, term, is_full
        if score == 0:
            continue
        if state.mode == "simple":
            # "tractor" + "repair": a listing with both beats one with either.
            score += 0.5 * (others - score)
        score += sum(0.5 for a in state.attrs if a in hay)
        if state.qty:
            have = _listing_qty(l.quantity)
            score += 1 if have is not None and have >= state.qty else -1.5 if have is not None else 0
        scored.append((score, l, match, full))

    # Partial matches ("set" from "pump set") only when nothing matches fully.
    if any(f for *_, f in scored):
        scored = [x for x in scored if x[3]]
    scored = [(s, l, m) for s, l, m, _ in scored]

    pairs = with_distances(db, [l for _, l, _ in scored], origin, None, state.max_km if origin else None)
    dist = {l.id: d for l, d in pairs}
    keep = [(s, l, m) for s, l, m in scored if l.id in dist]
    keep.sort(key=lambda x: (-x[0], dist[x[1].id] if dist[x[1].id] is not None else 1e9, -x[1].id))

    if state.mode == "complex" and len(terms) > 1:
        # Round-robin across terms, so "axe, saw, rope" all show up near the top.
        buckets: dict[str, list] = {t: [] for t in terms}
        for item in keep:
            buckets.setdefault(item[2], []).append(item)
        mixed = []
        while any(buckets.values()):
            for t in list(buckets):
                if buckets[t]:
                    mixed.append(buckets[t].pop(0))
        keep = mixed

    page = keep[offset : offset + limit]
    cards = [
        Card(
            id=l.id, title=l.title, type=l.type, kind=l.kind, exchange=l.exchange, price=l.price,
            quantity=l.quantity, community=l.owner.community,
            distance_km=round(dist[l.id], 1) if dist[l.id] is not None else None,
            image=l.image, image_size_kb=storage.size_kb(l.image), owner_id=l.owner_id,
            owner_name=l.owner.name, match=m if state.mode == "complex" else None,
        )
        for _, l, m in page
    ]
    return cards, len(keep) > offset + limit


def _clean_suggestions(items) -> list[Suggestion]:
    out = []
    for s in items:
        label, refine = clip(strip_urls(s.label), 25), clip(strip_urls(s.refine), 60)
        if label and refine and all(refine != o.refine for o in out):
            out.append(Suggestion(label=label, refine=refine))
    return out[:3]


def _suggestions(state: SearchState, origin: Optional[Community], empty: bool) -> list[Suggestion]:
    out: list[Suggestion] = []
    if empty and state.exchange:
        out.append(Suggestion(label="Any exchange", refine="any price"))
    if empty and state.max_km:
        out.append(Suggestion(label="Any distance", refine="any distance"))
    if empty and state.category:
        out.append(Suggestion(label="Any category", refine="any category"))
    if not state.exchange:
        out.append(Suggestion(label="Free only", refine="free"))
    if origin and not state.max_km:
        out.append(Suggestion(label=f"Within {NEAR_KM} km", refine=f"within {NEAR_KM} km"))
    if state.mode == "complex" and len(state.terms) > 1 and not empty:
        out = [Suggestion(label=f"Only {t}", refine=f"only {t}") for t in state.terms[:2]] + out
    elif state.type is None and state.mode == "simple":
        out.append(Suggestion(label="Tools only", refine="tools"))
    return _clean_suggestions(out)


@router.post("/smart", response_model=SmartSearchResponse, response_model_exclude_none=True)
def smart_search(
    body: SmartSearchRequest,
    request: Request,
    user: Optional[User] = Depends(optional_user),
    db: DbSession = Depends(get_db),
):
    """Sync def: model calls block, so FastAPI runs this in the thread pool."""
    origin = communities.resolve_any(db, body.community_id, body.community)
    if origin is None and user is not None and user.community:
        origin = communities.resolve_any(db, name=user.community)

    models = _ModelBudget(request, user)
    if body.state is None:
        state, used = new_search(db, " ".join(body.q.split()), models)
    elif body.refine and body.refine.strip():
        state, used = refine_search(body.state, body.refine, models)
    else:
        state, used = body.state, False

    if state.max_km is not None and origin is None:
        state = state.model_copy(update={"max_km": None})  # nothing to measure from
    cards, has_more = run_state(db, state, origin, body.limit, body.offset)

    # The small model called it simple but nothing matched (e.g. "start a
    # vegetable garden"): let the big model work out what's needed.
    if not cards and body.state is None and used and state.mode == "simple" and not looks_simple(state.q):
        expanded = expand_search(db, state.q, state, models)
        if expanded is not None:
            state = expanded
            if not models.degraded:
                _store("new:" + " ".join(state.q.lower().split()), state.model_dump())
            cards, has_more = run_state(db, state, origin, body.limit, body.offset)
    return SmartSearchResponse(
        mode=state.mode,
        engine="ai" if used else "keyword",
        ai=used,
        state=state,
        suggestions=_suggestions(state, origin, not cards),
        results=cards,
        has_more=has_more,
    )
