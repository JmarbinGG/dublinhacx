"""Search.

GET /api/search - the regular search, always available. When
SEARCH_SERVICE_URL is set, the AI search service (Qwen embeddings) ranks
results and they're merged with keyword hits; when it's unset, down, or
returns junk, keyword search answers alone. Same response shape either way.

Contract for the search service:

    POST {SEARCH_SERVICE_URL}/search
    {"query": "someone to fix a tractor", "type": "skill" | null,
     "community": "Greenfield" | null, "limit": 20}
    ->
    {"listings": [{"id": 12, "score": 0.91}, ...],
     "users":    [{"id": 3,  "score": 0.77}, ...]}

Ids only, best first - this backend re-reads the rows, so the service can't
surface anything that isn't real and available. It builds its index from
GET /api/search/corpus, sending SEARCH_SERVICE_KEY as X-Search-Key.

POST /api/search/ai - one-shot LLM overview of the best matches.
"""

import hmac
import logging
import os
from typing import Optional

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession, joinedload

import communities
import llm
from auth import optional_user
from database import get_db
from limits import ai_rate_limit
from models import Listing, User
from prompting import SAFETY_RULES, fence, listing_for_prompt
from routers.listings import base_query, keyword_filter, listing_out, ranked_recall, with_distances
from routers.users import user_keyword_filter
from schemas import (
    AIPick,
    AISearchRequest,
    AISearchResponse,
    ListingType,
    SearchResponse,
    UserPublic,
)
from textutil import MAX_QUERY_CHARS, clip, query_words, redact, strip_urls

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])

SEARCH_TIMEOUT_S = 5
AI_CANDIDATES = 15  # most listings ever sent to the LLM in one call
AI_MAX_PICKS = 5


# ---------- GET /api/search ----------


def _service_ids(raw, key: str) -> list[int]:
    """Ids from the service's reply, tolerating junk: anything that isn't a
    positive int is dropped instead of 500ing."""
    ids: list[int] = []
    items = raw.get(key) if isinstance(raw, dict) else None
    for r in items if isinstance(items, list) else []:
        try:
            i = int(r["id"]) if isinstance(r, dict) else None
        except (KeyError, TypeError, ValueError):
            continue
        if i is not None and i > 0 and i not in ids:
            ids.append(i)
    return ids


def _search_service(q: str, listing_type: Optional[str], community: Optional[str], limit: int) -> Optional[tuple[list[int], list[int]]]:
    """(listing_ids, user_ids) from the AI search service, or None if it's
    unset/failed/returned nothing usable."""
    url = os.getenv("SEARCH_SERVICE_URL")
    if not url:
        return None
    try:
        resp = requests.post(
            f"{url.rstrip('/')}/search",
            json={"query": q, "type": listing_type, "community": community, "limit": limit},
            headers={"X-Search-Key": os.getenv("SEARCH_SERVICE_KEY", "")},
            timeout=SEARCH_TIMEOUT_S,
        )
        resp.raise_for_status()
        raw = resp.json()
    except (requests.RequestException, ValueError) as e:
        log.warning("Search service failed, using keyword: %s", type(e).__name__)
        return None
    listing_ids, user_ids = _service_ids(raw, "listings"), _service_ids(raw, "users")
    if not listing_ids and not user_ids:
        return None
    return listing_ids, user_ids


def _hydrate(model, ids: list[int], query) -> list:
    """Re-read rows for `ids` through `query` (which already applies
    status/type/community filters) and keep the service's order."""
    if not ids:
        return []
    rows = {row.id: row for row in query.filter(model.id.in_(ids)).all()}
    return [rows[i] for i in ids if i in rows]


def _merge(first: list, second: list) -> list:
    seen = {r.id for r in first}
    return first + [r for r in second if r.id not in seen]


@router.get("", response_model=SearchResponse)
def search(
    request: Request,
    q: str = Query("", max_length=MAX_QUERY_CHARS),
    type: Optional[ListingType] = None,
    community_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=1000),
    user: Optional[User] = Depends(optional_user),
    db: DbSession = Depends(get_db),
):
    """Sync def on purpose: the search-service call blocks, and FastAPI runs
    sync routes in a thread pool so it can't freeze other requests."""
    q = q.strip()
    community = communities.resolve(db, community_id)
    listing_q = base_query(db).filter(Listing.status == "available")
    user_q = db.query(User)
    if type:
        listing_q = listing_q.filter(Listing.type == type)
    if community:
        listing_q = listing_q.filter(User.community == community.name)
        user_q = user_q.filter(User.community == community.name)
    listing_q = listing_q.order_by(Listing.created_at.desc(), Listing.id.desc())

    if not q:
        listings = listing_q.offset(offset).limit(limit).all()
        return SearchResponse(query=q, engine="keyword", listings=[listing_out(l) for l in listings],
                              users=[], limit=limit, offset=offset)

    want = offset + limit
    keyword_listings = listing_q.filter(*keyword_filter(q)).limit(want).all()
    keyword_users = user_q.filter(*user_keyword_filter(q)).order_by(User.id).limit(want).all()

    service = None
    if os.getenv("SEARCH_SERVICE_URL"):
        ai_rate_limit("search", request, user)
        service = _search_service(q, type, community.name if community else None, want)

    if service is not None:
        # Hybrid: the service's ranking first, then keyword hits it missed.
        listings = _merge(_hydrate(Listing, service[0], listing_q), keyword_listings)
        users = _merge(_hydrate(User, service[1], user_q), keyword_users)
        engine = "ai"
    else:
        listings = keyword_listings or ranked_recall(listing_q, q, want)
        users = keyword_users
        engine = "keyword"

    return SearchResponse(
        query=q,
        engine=engine,
        listings=[listing_out(l) for l in listings[offset:want]],
        users=[UserPublic.model_validate(u) for u in users[offset:want]],
        limit=limit,
        offset=offset,
    )


# ---------- POST /api/search/ai ----------


class _ModelPick(BaseModel):
    id: int
    why: str = Field(default="", max_length=400)


class _ModelOverview(BaseModel):
    summary: str = Field(max_length=1200)
    picks: list[_ModelPick] = Field(default=[], max_length=10)
    caveats: list[str] = Field(default=[], max_length=6)


AI_SEARCH_PROMPT = """You help people in small rural towns find things on Banyan, a site \
where neighbours share spare materials, lend equipment and tools, and offer or ask for \
skills and work. Many users are on slow phones, so be brief and plain.

Given a shopper's search and candidate listings, write a short overview:
- "summary": at most 2 short sentences (under 300 characters) on what fits best and why.
- "picks": up to 5 of the best listings, best first: {"id": <listing id>, "why": "<under 100 characters>"}.
  Prefer closer listings and ones whose kind is "offer" when the shopper wants something.
  If nothing fits, return no picks and say so in the summary.
- "caveats": up to 2 short notes worth knowing (e.g. "only lent, not given away", \
"50-200 km away"). Use [] if none.

Return JSON: {"summary": "...", "picks": [...], "caveats": [...]}

""" + SAFETY_RULES


def _clean(text: str, limit: int) -> str:
    return clip(strip_urls(redact(text)), limit)


def _keyword_overview(q: str, rows: list[Listing]) -> tuple[str, list[AIPick]]:
    words = query_words(q, drop_stopwords=True)
    picks = []
    for l in rows[:AI_MAX_PICKS]:
        hay = f"{l.title} {l.tags or ''} {l.category or ''}".lower()
        matched = [w for w in words if w in hay]
        picks.append(AIPick(id=l.id, why=f"Matches: {', '.join(matched)}" if matched else "Related listing"))
    summary = (f"Top {len(picks)} keyword matches." if picks
               else "No listings match yet - try other words or post a request.")
    return summary, picks


@router.post("/ai", response_model=AISearchResponse)
def ai_search(
    body: AISearchRequest,
    request: Request,
    user: Optional[User] = Depends(optional_user),
    db: DbSession = Depends(get_db),
):
    """One-shot overview: pre-filter to at most 15 candidates here, let the
    model pick and explain, then re-read its picks from the DB. Falls back to
    a keyword overview (engine "keyword", ai false) if the model is unset,
    over budget, slow, or returns anything invalid."""
    ai_rate_limit("search_ai", request, user)
    q = body.q.strip()
    f = body.filters
    origin = communities.resolve(db, body.community_id)
    if f.max_km is not None and origin is None:
        raise HTTPException(status_code=422, detail="Invalid request")

    query = base_query(db).filter(Listing.status == "available")
    if f.type:
        query = query.filter(Listing.type == f.type)
    if f.kind:
        query = query.filter(Listing.kind == f.kind)
    if f.exchange:
        query = query.filter(Listing.exchange == f.exchange)
    if f.category:
        query = query.filter(Listing.category.ilike(f.category))
    query = query.order_by(Listing.created_at.desc(), Listing.id.desc())

    # Recall: keyword (all words) + ranked any-word + the search service, deduped.
    candidates = _merge(query.filter(*keyword_filter(q)).limit(AI_CANDIDATES).all(),
                        ranked_recall(query, q, AI_CANDIDATES))
    service = _search_service(q, f.type, None, AI_CANDIDATES)
    if service:
        candidates = _merge(_hydrate(Listing, service[0], query), candidates)
    pairs = with_distances(db, candidates, origin, None, f.max_km, "newest")[:AI_CANDIDATES]
    by_id = {l.id: l for l, _ in pairs}
    distances = {l.id: d for l, d in pairs}

    summary, picks, caveats, engine = None, [], [], "keyword"
    if pairs and llm.configured():
        data = [listing_for_prompt(l, d, include_contact=False) for l, d in pairs]
        messages = [
            {"role": "system", "content": AI_SEARCH_PROMPT},
            {"role": "user", "content": f"Shopper's search:\n{fence(q)}\n\nCandidate listings:\n{fence(data)}"},
        ]
        try:
            out, _ = llm.complete_json(messages, _ModelOverview)
            seen: set[int] = set()
            for p in out.picks:
                if p.id in by_id and p.id not in seen and len(picks) < AI_MAX_PICKS:
                    seen.add(p.id)
                    picks.append(AIPick(id=p.id, why=_clean(p.why, 140)))
            summary = _clean(out.summary, 400)
            caveats = [_clean(c, 140) for c in out.caveats[:3] if c.strip()]
            engine = "ai"
        except llm.LLMError as e:
            log.warning("AI search fell back to keyword: %s", e)

    if engine == "keyword":
        summary, picks = _keyword_overview(q, [l for l, _ in pairs])

    return AISearchResponse(
        query=q,
        summary=summary,
        picks=picks,
        caveats=caveats,
        engine=engine,
        ai=engine == "ai",
        listings=[listing_out(by_id[p.id], distances.get(p.id)) for p in picks],
    )


# ---------- GET /api/search/corpus ----------


@router.get("/corpus")
def corpus(x_search_key: Optional[str] = Header(None), db: DbSession = Depends(get_db)):
    """Everything the AI search service indexes. Closed listings are included
    (with status) so it can drop them. Requires SEARCH_SERVICE_KEY in
    production; in development it's open only while no key is set."""
    expected = os.getenv("SEARCH_SERVICE_KEY")
    if not expected:
        if os.getenv("APP_ENV") == "production":
            raise HTTPException(status_code=503, detail="Corpus disabled")
    elif not hmac.compare_digest((x_search_key or "").encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "users": [UserPublic.model_validate(u) for u in db.query(User).all()],
        "listings": [
            listing_out(l) for l in db.query(Listing).options(joinedload(Listing.owner)).all()
        ],
    }
