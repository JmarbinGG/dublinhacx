from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as DbSession

from auth import current_user
from database import get_db
from models import Listing, User
from routers.listings import haversine_km, listing_out
from schemas import CommunityOut, ProfileOut, UserPrivate, UserPublic, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/api/users", response_model=list[UserPublic])
def list_users(
    community: Optional[str] = None,
    q: Optional[str] = Query(None, description="Keyword match on name, bio, community"),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: Optional[float] = Query(None, gt=0),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: DbSession = Depends(get_db),
):
    query = db.query(User)
    if community:
        query = query.filter(User.community.ilike(community))
    for word in (q or "").lower().split():
        like = f"%{word}%"
        query = query.filter(or_(User.name.ilike(like), User.bio.ilike(like), User.community.ilike(like)))
    users = query.order_by(User.id).all()

    if lat is not None and lng is not None:
        located = [
            (haversine_km(lat, lng, u.latitude, u.longitude), u)
            for u in users
            if u.latitude is not None and u.longitude is not None
        ]
        located = [p for p in located if radius_km is None or p[0] <= radius_km]
        users = [u for _, u in sorted(located, key=lambda p: p[0])]

    return [UserPublic.model_validate(u) for u in users[offset : offset + limit]]


# Declared before /api/users/{user_id} so "me" isn't parsed as an id.
@router.patch("/api/users/me", response_model=UserPrivate)
def update_me(body: UserUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"]:
        raise HTTPException(status_code=422, detail="name can't be empty")
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserPrivate.model_validate(user)


@router.get("/api/users/{user_id}", response_model=ProfileOut)
def get_profile(user_id: int, include_closed: bool = False, db: DbSession = Depends(get_db)):
    """Public profile: photo, name, bio, community, contact + their listings."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    listings = [l for l in user.listings if include_closed or l.status != "closed"]
    return ProfileOut(
        **UserPublic.model_validate(user).model_dump(),
        listings=[listing_out(l) for l in listings],
    )


@router.get("/api/communities", response_model=list[CommunityOut])
def list_communities(db: DbSession = Depends(get_db)):
    """Every community with at least one member, busiest first."""
    members = dict(
        db.query(User.community, func.count(User.id))
        .filter(User.community.isnot(None))
        .group_by(User.community)
        .all()
    )
    listings = dict(
        db.query(User.community, func.count(Listing.id))
        .join(Listing.owner)
        .filter(User.community.isnot(None), Listing.status == "available")
        .group_by(User.community)
        .all()
    )
    out = [CommunityOut(name=name, members=n, listings=listings.get(name, 0)) for name, n in members.items()]
    return sorted(out, key=lambda c: (-c.listings, c.name))
