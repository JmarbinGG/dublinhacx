from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Query as OrmQuery, Session as DbSession, joinedload

import communities
from auth import current_user
from communities import Community
from database import get_db
from models import Listing, User
from storage import delete_if_orphaned
from schemas import (
    BatchRequest,
    ExchangeType,
    BatchResponse,
    BatchResult,
    ListingCreate,
    ListingKind,
    ListingOut,
    ListingStatus,
    ListingType,
    ListingUpdate,
)
from textutil import MAX_QUERY_CHARS, like_pattern, query_words


def name_filter(column, name: str):
    """Case-insensitive exact match on a town name, with LIKE wildcards escaped."""
    return column.ilike(like_pattern(name)[1:-1], escape="\\")

router = APIRouter(prefix="/api/listings", tags=["listings"])


def listing_out(listing: Listing, distance_km: Optional[float] = None) -> ListingOut:
    """Serialize while the DB session is still open (owner is a relationship)."""
    out = ListingOut.model_validate(listing)
    if distance_km is not None:
        out.distance_km = round(distance_km, 1)
    return out


def base_query(db: DbSession) -> OrmQuery:
    return db.query(Listing).join(Listing.owner).options(joinedload(Listing.owner))


def _word_clause(word: str):
    like = like_pattern(word)
    return or_(
        Listing.title.ilike(like, escape="\\"),
        Listing.description.ilike(like, escape="\\"),
        Listing.category.ilike(like, escape="\\"),
        Listing.tags.ilike(like, escape="\\"),
        User.community.ilike(like, escape="\\"),
    )


def keyword_filter(q: str):
    """Every word (max 8) must appear somewhere in the listing or its owner's
    community. % and _ in the query are matched literally."""
    return [_word_clause(w) for w in query_words(q)]


def ranked_recall(query: OrmQuery, q: str, limit: int) -> list[Listing]:
    """Looser than keyword_filter: listings matching ANY meaningful word,
    best first (title hits count most). For natural-language questions like
    "who can fix my tractor", where requiring every word finds nothing."""
    words = query_words(q, drop_stopwords=True)
    if not words:
        return []
    rows = query.filter(or_(*[_word_clause(w) for w in words])).all()

    def score(l: Listing) -> tuple:
        title, tags = (l.title or "").lower(), (l.tags or "").lower()
        other = f"{l.category or ''} {l.description or ''}".lower()
        s = sum(3 * (w in title) + 2 * (w in tags) + (w in other) for w in words)
        return (-s, -l.id)

    return sorted(rows, key=score)[:limit]


def origin_for(
    db: DbSession, from_community: Optional[str], lat: Optional[float], lng: Optional[float]
) -> Optional[Community]:
    """Where distances are measured from: a community centre, or a raw point
    (e.g. the browser's location) - never a member's home."""
    if from_community:
        return communities.resolve(db, from_community)
    if lat is not None and lng is not None:
        return Community(id="", name="", lat=lat, lng=lng, members=0, listings=0)
    return None


def with_distances(
    db: DbSession,
    listings: list[Listing],
    origin: Optional[Community],
    min_km: Optional[float] = None,
    max_km: Optional[float] = None,
    sort: str = "newest",
) -> list[tuple[Listing, Optional[float]]]:
    """Attach distance from `origin`, apply the min/max band and sort.
    Listings with unknown distance are dropped by a band and sorted last."""
    if origin is None:
        return [(l, None) for l in listings]
    index = communities.all_communities(db)
    pairs = [(l, communities.distance_between(index, origin, l.owner.community)) for l in listings]
    if min_km is not None or max_km is not None:
        pairs = [
            (l, d) for l, d in pairs
            if d is not None and (min_km is None or d > min_km) and (max_km is None or d <= max_km)
        ]
    if sort in ("nearest", "farthest"):
        known = [p for p in pairs if p[1] is not None]
        known.sort(key=lambda p: p[1], reverse=sort == "farthest")  # stable: newest first within ties
        pairs = known + [p for p in pairs if p[1] is None]
    return pairs


def owned_listing(db: DbSession, listing_id: int, user: User) -> Listing:
    listing = db.get(Listing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You don't own this listing")
    return listing


@router.get("", response_model=list[ListingOut])
def list_listings(
    type: Optional[ListingType] = None,
    kind: Optional[ListingKind] = None,
    exchange: Optional[ExchangeType] = None,
    status: Optional[ListingStatus] = "available",
    category: Optional[str] = Query(None, max_length=60),
    community_id: Optional[str] = Query(None, description="Only this community (slug from /api/communities)"),
    community: Optional[str] = Query(None, max_length=120, description="...or by town name"),
    exclude_community_id: Optional[str] = Query(None, description="Everything except this community - 'other towns'"),
    exclude_community: Optional[str] = Query(None, max_length=120, description="...or by town name"),
    owner_id: Optional[int] = None,
    q: Optional[str] = Query(None, max_length=MAX_QUERY_CHARS, description="Keyword filter, first 8 words"),
    from_community: Optional[str] = Query(None, description="Measure distance_km from this community's centre"),
    lat: Optional[float] = Query(None, ge=-90, le=90, description="...or from this point"),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    min_km: Optional[float] = Query(None, ge=0, description="Distance band, needs an origin: d > min_km"),
    max_km: Optional[float] = Query(None, gt=0, description="Distance band, needs an origin: d <= max_km"),
    radius_km: Optional[float] = Query(None, gt=0, description="Same as max_km"),
    sort: Optional[Literal["newest", "nearest", "farthest"]] = Query(
        None, description="Default: nearest when an origin is given, else newest"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: DbSession = Depends(get_db),
):
    query = base_query(db)
    if type:
        query = query.filter(Listing.type == type)
    if kind:
        query = query.filter(Listing.kind == kind)
    if exchange:
        query = query.filter(Listing.exchange == exchange)
    if status:
        query = query.filter(Listing.status == status)
    if category:
        query = query.filter(Listing.category.ilike(category))
    if community_id:
        query = query.filter(User.community == communities.resolve(db, community_id).name)
    if community:
        query = query.filter(name_filter(User.community, community))
    if exclude_community_id:
        excluded = communities.resolve(db, exclude_community_id).name
        query = query.filter(or_(User.community.is_(None), User.community != excluded))
    if exclude_community:
        query = query.filter(or_(User.community.is_(None), ~name_filter(User.community, exclude_community)))
    if owner_id is not None:
        query = query.filter(Listing.owner_id == owner_id)
    if q:
        query = query.filter(*keyword_filter(q))
    query = query.order_by(Listing.created_at.desc(), Listing.id.desc())

    max_km = max_km or radius_km
    origin = origin_for(db, from_community, lat, lng)
    sort = sort or ("nearest" if origin else "newest")
    if origin is None:
        if sort != "newest" or min_km is not None or max_km is not None:
            raise HTTPException(status_code=422, detail="Distance sort/band needs from_community or lat+lng")
        return [listing_out(l) for l in query.offset(offset).limit(limit).all()]
    # Distances are computed in Python, so page after sorting.
    pairs = with_distances(db, query.all(), origin, min_km, max_km, sort)
    return [listing_out(l, d) for l, d in pairs[offset : offset + limit]]


@router.get("/{listing_id}", response_model=ListingOut)
def get_listing(listing_id: int, db: DbSession = Depends(get_db)):
    listing = base_query(db).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing_out(listing)


def _create(db: DbSession, body: ListingCreate, user: User) -> tuple[Listing, bool]:
    """Insert a listing, or return the existing one if this owner already
    posted the same client_id. Returns (listing, created)."""
    if body.client_id:
        existing = (
            db.query(Listing)
            .filter(Listing.owner_id == user.id, Listing.client_id == body.client_id)
            .first()
        )
        if existing:
            return existing, False
    data = body.model_dump()
    data["tags"] = ",".join(data["tags"]) or None
    listing = Listing(**data, owner_id=user.id)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing, True


@router.post("", response_model=ListingOut, status_code=201)
def create_listing(body: ListingCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return listing_out(_create(db, body, user)[0])


@router.post("/batch", response_model=BatchResponse)
def create_listings_batch(
    body: BatchRequest, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    """Replay listings queued while offline. Idempotent per client_id: an
    entry that was already created comes back as "duplicate" with its id.
    Entries are independent - one invalid entry doesn't block the rest."""
    results = []
    for entry in body.entries:
        try:
            listing_body = ListingCreate.model_validate({**entry.listing, "client_id": entry.client_id})
        except ValidationError as e:
            err = e.errors()[0]
            field = ".".join(str(p) for p in err["loc"])
            results.append(BatchResult(client_id=entry.client_id, status="error", detail=f"{field}: {err['msg']}"))
            continue
        listing, created = _create(db, listing_body, user)
        results.append(
            BatchResult(
                client_id=entry.client_id,
                status="created" if created else "duplicate",
                listing_id=listing.id,
            )
        )
    return BatchResponse(results=results)


@router.patch("/{listing_id}", response_model=ListingOut)
def update_listing(
    listing_id: int,
    body: ListingUpdate,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    listing = owned_listing(db, listing_id, user)
    changes = body.model_dump(exclude_unset=True)
    for required in ("type", "kind", "title", "exchange", "status"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} can't be null")
    if "tags" in changes:
        changes["tags"] = ",".join(changes["tags"] or []) or None
    old_image = listing.image
    for field, value in changes.items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    if listing.image != old_image:
        delete_if_orphaned(db, old_image)
    return listing_out(listing)


@router.delete("/{listing_id}")
def delete_listing(listing_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    listing = owned_listing(db, listing_id, user)
    image = listing.image
    db.delete(listing)
    db.commit()
    delete_if_orphaned(db, image)
    return {"status": "deleted"}
