from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession

import communities
from auth import current_user
from database import get_db
from models import User
from routers.listings import listing_out, name_filter, origin_for
from storage import delete_if_orphaned
from schemas import CommunityOut, ProfileOut, UserPrivate, UserPublic, UserUpdate
from textutil import MAX_QUERY_CHARS, like_pattern, query_words

router = APIRouter(tags=["users"])


def user_keyword_filter(q: Optional[str]):
    clauses = []
    for word in query_words(q):
        like = like_pattern(word)
        clauses.append(
            or_(
                User.name.ilike(like, escape="\\"),
                User.bio.ilike(like, escape="\\"),
                User.community.ilike(like, escape="\\"),
            )
        )
    return clauses


@router.get("/api/users", response_model=list[UserPublic])
def list_users(
    community_id: Optional[str] = None,
    community: Optional[str] = Query(None, max_length=120, description="...or by town name"),
    q: Optional[str] = Query(None, max_length=MAX_QUERY_CHARS, description="Keyword match on name, bio, community"),
    from_community: Optional[str] = Query(None, description="With max_km: people within max_km of this community"),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    max_km: Optional[float] = Query(None, gt=0),
    radius_km: Optional[float] = Query(None, gt=0, description="Same as max_km"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: DbSession = Depends(get_db),
):
    query = db.query(User)
    if community_id:
        query = query.filter(User.community == communities.resolve(db, community_id).name)
    if community:
        query = query.filter(name_filter(User.community, community))
    query = query.filter(*user_keyword_filter(q))
    max_km = max_km or radius_km
    users = query.order_by(User.id).all()

    origin = origin_for(db, from_community, lat, lng)
    if origin is not None:
        index = communities.all_communities(db)
        located = [(communities.distance_between(index, origin, u.community), u) for u in users]
        located = [p for p in located if p[0] is not None and (max_km is None or p[0] <= max_km)]
        users = [u for _, u in sorted(located, key=lambda p: p[0])]

    return [UserPublic.model_validate(u) for u in users[offset : offset + limit]]


# Declared before /api/users/{user_id} so "me" isn't parsed as an id.
@router.patch("/api/users/me", response_model=UserPrivate)
def update_me(body: UserUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"]:
        raise HTTPException(status_code=422, detail="name can't be empty")
    old_photo = user.photo
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    if user.photo != old_photo:
        delete_if_orphaned(db, old_photo)
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
    """Every community with at least one member, busiest first. `id` is the
    slug every community_id / from_community parameter takes."""
    out = [CommunityOut(**vars(c)) for c in communities.all_communities(db).values()]
    return sorted(out, key=lambda c: (-c.listings, c.name))
