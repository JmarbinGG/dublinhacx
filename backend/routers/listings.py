import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Query as OrmQuery, Session as DbSession, joinedload

from auth import current_user
from database import get_db
from models import Listing, User
from storage import delete_if_orphaned
from schemas import (
    BatchRequest,
    BatchResponse,
    BatchResult,
    ListingCreate,
    ListingKind,
    ListingOut,
    ListingStatus,
    ListingType,
    ListingUpdate,
)

router = APIRouter(prefix="/api/listings", tags=["listings"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def listing_out(listing: Listing, distance_km: Optional[float] = None) -> ListingOut:
    """Serialize while the DB session is still open (owner is a relationship)."""
    out = ListingOut.model_validate(listing)
    if distance_km is not None:
        out.distance_km = round(distance_km, 1)
    return out


def base_query(db: DbSession) -> OrmQuery:
    return db.query(Listing).join(Listing.owner).options(joinedload(Listing.owner))


def keyword_filter(q: str):
    """Every word must appear somewhere in the listing or its owner's community."""
    clauses = []
    for word in q.lower().split():
        like = f"%{word}%"
        clauses.append(
            or_(
                Listing.title.ilike(like),
                Listing.description.ilike(like),
                Listing.category.ilike(like),
                Listing.tags.ilike(like),
                User.community.ilike(like),
            )
        )
    return clauses


def apply_distance(
    listings: list[Listing], lat: Optional[float], lng: Optional[float], radius_km: Optional[float]
) -> list[ListingOut]:
    """With lat/lng: nearest first, owners without a location last, optionally
    cut to radius_km. Without: unchanged order, no distances."""
    if lat is None or lng is None:
        return [listing_out(l) for l in listings]

    located, unlocated = [], []
    for l in listings:
        if l.owner.latitude is None or l.owner.longitude is None:
            unlocated.append(l)
            continue
        d = haversine_km(lat, lng, l.owner.latitude, l.owner.longitude)
        if radius_km is None or d <= radius_km:
            located.append((d, l))
    located.sort(key=lambda pair: pair[0])
    out = [listing_out(l, d) for d, l in located]
    if radius_km is None:
        out += [listing_out(l) for l in unlocated]
    return out


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
    status: Optional[ListingStatus] = "available",
    category: Optional[str] = None,
    community: Optional[str] = None,
    exclude_community: Optional[str] = Query(
        None, description="Hide listings from this community - for 'beyond my town' views"
    ),
    owner_id: Optional[int] = None,
    q: Optional[str] = Query(None, description="Plain keyword filter (not the AI search)"),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: Optional[float] = Query(None, gt=0),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: DbSession = Depends(get_db),
):
    query = base_query(db)
    if type:
        query = query.filter(Listing.type == type)
    if kind:
        query = query.filter(Listing.kind == kind)
    if status:
        query = query.filter(Listing.status == status)
    if category:
        query = query.filter(Listing.category.ilike(category))
    if community:
        query = query.filter(User.community.ilike(community))
    if exclude_community:
        query = query.filter(or_(User.community.is_(None), ~User.community.ilike(exclude_community)))
    if owner_id is not None:
        query = query.filter(Listing.owner_id == owner_id)
    if q:
        query = query.filter(*keyword_filter(q))

    query = query.order_by(Listing.created_at.desc(), Listing.id.desc())
    if lat is None or lng is None:
        return [listing_out(l) for l in query.offset(offset).limit(limit).all()]
    # Distance sort happens in Python, so page after sorting.
    return apply_distance(query.all(), lat, lng, radius_km)[offset : offset + limit]


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
