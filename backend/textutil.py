"""Small text helpers shared by search, the AI endpoints and logging:
query parsing, LIKE escaping, URL stripping and personal-data redaction."""

import re
from typing import Optional

MAX_QUERY_CHARS = 200
MAX_QUERY_WORDS = 8

# Words that carry no meaning for matching listings.
STOPWORDS = {
    "a", "an", "and", "any", "anyone", "are", "can", "for", "from", "get", "has", "have",
    "i", "in", "is", "it", "me", "my", "need", "near", "of", "on", "or", "please", "some",
    "someone", "somebody", "the", "to", "who", "with", "want", "looking", "find", "help",
    "where", "what", "there", "here", "do", "does", "you", "your", "our", "we", "us",
}

_URL_RE = re.compile(r"(https?://|www\.)\S+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
# 7+ digits, optionally broken up by spaces, dots, dashes or brackets, with an optional +country code.
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{5,}\d")


def query_words(q: Optional[str], drop_stopwords: bool = False) -> list[str]:
    """Lowercased alphanumeric words, de-duplicated, capped at MAX_QUERY_WORDS."""
    if not q:
        return []
    cleaned = "".join(c if c.isalnum() else " " for c in q[:MAX_QUERY_CHARS].lower())
    words: list[str] = []
    for w in cleaned.split():
        if drop_stopwords and (w in STOPWORDS or len(w) < 3):
            continue
        if w not in words:
            words.append(w)
    return words[:MAX_QUERY_WORDS]


def like_pattern(word: str) -> str:
    """%word% with LIKE wildcards in the word escaped. Use with escape="\\"."""
    escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def strip_urls(text: Optional[str]) -> str:
    return _URL_RE.sub("[link removed]", text or "")


def redact(text: Optional[str]) -> str:
    """Mask emails and phone numbers - for logs and stored transcripts."""
    text = _EMAIL_RE.sub("[email]", text or "")
    return _PHONE_RE.sub("[phone]", text)


def clip(text: Optional[str], limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def distance_bucket(km: Optional[float]) -> str:
    """Coarse distance for prompts - the model never sees coordinates."""
    if km is None:
        return "distance unknown"
    if km < 1:
        return "same town"
    if km <= 10:
        return "under 10 km"
    if km <= 50:
        return "10-50 km"
    if km <= 200:
        return "50-200 km"
    return "over 200 km"
