"""Communities aren't a table: a community is the set of users sharing the
same `community` string. Each gets a stable slug id and a centre point (the
average of its members' coordinates). Distances are always measured between
community centres, so no endpoint ever reveals where an individual lives."""

import math
import re
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from models import Listing, User


@dataclass
class Community:
    id: str
    name: str
    lat: Optional[float]
    lng: Optional[float]
    members: int
    listings: int


def slugify(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def all_communities(db: DbSession) -> dict[str, Community]:
    """slug -> Community, for every community with at least one member."""
    rows = (
        db.query(User.community, func.count(User.id), func.avg(User.latitude), func.avg(User.longitude))
        .filter(User.community.isnot(None))
        .group_by(User.community)
        .all()
    )
    listing_counts = dict(
        db.query(User.community, func.count(Listing.id))
        .join(Listing.owner)
        .filter(User.community.isnot(None), Listing.status == "available")
        .group_by(User.community)
        .all()
    )
    out: dict[str, Community] = {}
    for name, members, lat, lng in rows:
        slug = slugify(name)
        if not slug:
            continue
        if slug in out:  # "Greenfield" and "greenfield" - merge
            out[slug].members += members
            out[slug].listings += listing_counts.get(name, 0)
            continue
        out[slug] = Community(
            id=slug,
            name=name,
            # Rounded to ~1 km: a town centre, not a house.
            lat=round(lat, 2) if lat is not None else None,
            lng=round(lng, 2) if lng is not None else None,
            members=members,
            listings=listing_counts.get(name, 0),
        )
    return out


def resolve(db: DbSession, community_id: Optional[str]) -> Optional[Community]:
    """Look up a community by slug; 404 if given but unknown, None if not given."""
    if not community_id:
        return None
    community = all_communities(db).get(community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Unknown community")
    return community


def distance_between(index: dict[str, Community], origin: Optional[Community], name: Optional[str]) -> Optional[float]:
    """km between `origin` and the community called `name`, centre to centre."""
    if origin is None or origin.lat is None or origin.lng is None:
        return None
    target = index.get(slugify(name) or "")
    if target is None or target.lat is None or target.lng is None:
        return None
    if target.id == origin.id:
        return 0.0
    return haversine_km(origin.lat, origin.lng, target.lat, target.lng)
