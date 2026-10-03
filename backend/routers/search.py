"""Search. The real search is an AI service written in Go (not built yet);
until SEARCH_SERVICE_URL is set, a keyword fallback answers instead with the
exact same response shape, so the frontend never has to care which ran.

Contract the Go service needs to implement:

    POST {SEARCH_SERVICE_URL}/search
    {"query": "someone to fix a tractor", "type": "skill" | null,
     "community": "Ennistymon, Co. Clare" | null, "limit": 20}
    ->
    {"listings": [{"id": 12, "score": 0.91}, ...],
     "users":    [{"id": 3,  "score": 0.77}, ...]}

Ids only, best first - this backend hydrates them into full objects. To build
its index the service pulls everything from GET /api/search/corpus (send
X-Search-Key if SEARCH_SERVICE_KEY is set).
"""

import logging
import os
from typing import Optional

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession, joinedload

from database import get_db
from models import Listing, User
from routers.listings import base_query, keyword_filter, listing_out
from schemas import ListingType, SearchResponse, UserPublic

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])

SEARCH_TIMEOUT_S = 5


def _ai_search(q: str, type: Optional[str], community: Optional[str], limit: int) -> Optional[dict]:
    url = os.getenv("SEARCH_SERVICE_URL")
    if not url:
        return None
    try:
        resp = requests.post(
            f"{url.rstrip('/')}/search",
            json={"query": q, "type": type, "community": community, "limit": limit},
            headers={"X-Search-Key": os.getenv("SEARCH_SERVICE_KEY", "")},
            timeout=SEARCH_TIMEOUT_S,
        )
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError) as e:
        log.warning("AI search failed, falling back to keyword: %s", e)
        return None


def _hydrate(db: DbSession, model, ids: list[int], query) -> list:
    """Fetch rows for `ids` and return them in the service's ranked order."""
    rows = {row.id: row for row in query.filter(model.id.in_(ids)).all()}
    return [rows[i] for i in ids if i in rows]


@router.get("", response_model=SearchResponse)
def search(
    q: str = "",
    type: Optional[ListingType] = None,
    community: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    db: DbSession = Depends(get_db),
):
    """Sync def on purpose: the AI call blocks, and FastAPI runs sync routes
    in a thread pool so it can't freeze the event loop for other requests."""
    q = q.strip()
    listing_q = base_query(db).filter(Listing.status == "available")
    if type:
        listing_q = listing_q.filter(Listing.type == type)
    if community:
        listing_q = listing_q.filter(User.community.ilike(community))
    user_q = db.query(User)
    if community:
        user_q = user_q.filter(User.community.ilike(community))

    ai = _ai_search(q, type, community, limit) if q else None
    if ai is not None:
        listing_ids = [int(r["id"]) for r in ai.get("listings", []) if "id" in r]
        user_ids = [int(r["id"]) for r in ai.get("users", []) if "id" in r]
        listings = _hydrate(db, Listing, listing_ids, listing_q)
        users = _hydrate(db, User, user_ids, user_q)
        engine = "ai"
    else:
        if q:
            listing_q = listing_q.filter(*keyword_filter(q))
            for word in q.lower().split():
                like = f"%{word}%"
                user_q = user_q.filter(
                    or_(User.name.ilike(like), User.bio.ilike(like), User.community.ilike(like))
                )
        listings = listing_q.order_by(Listing.created_at.desc()).limit(limit).all()
        users = user_q.order_by(User.id).limit(limit).all() if q else []
        engine = "keyword"

    return SearchResponse(
        query=q,
        engine=engine,
        listings=[listing_out(l) for l in listings[:limit]],
        users=[UserPublic.model_validate(u) for u in users[:limit]],
    )


@router.get("/corpus")
def corpus(x_search_key: Optional[str] = Header(None), db: DbSession = Depends(get_db)):
    """Everything the AI search service needs to index. Closed listings are
    included (with status) so the service can drop them from its index."""
    expected = os.getenv("SEARCH_SERVICE_KEY")
    if expected and x_search_key != expected:
        raise HTTPException(status_code=403, detail="Bad search key")
    return {
        "users": [UserPublic.model_validate(u) for u in db.query(User).all()],
        "listings": [
            listing_out(l) for l in db.query(Listing).options(joinedload(Listing.owner)).all()
        ],
    }
