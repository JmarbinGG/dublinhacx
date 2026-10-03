from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator

import storage

BIO_MAX = 280

ListingType = Literal["material", "equipment", "skill"]
ListingKind = Literal["offer", "request"]
ExchangeType = Literal["free", "lend", "trade", "paid"]
ListingStatus = Literal["available", "pending", "closed"]


def _split_tags(value):
    """DB stores tags comma-separated; the API always speaks lists."""
    if value is None:
        return []
    if isinstance(value, str):
        return [t.strip() for t in value.split(",") if t.strip()]
    return value


# ---------- users ----------


class UserSummary(BaseModel):
    """Embedded in every listing so cards can show who posted it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    photo: Optional[str] = None
    community: Optional[str] = None

    @computed_field
    @property
    def photo_size_kb(self) -> Optional[int]:
        """KB on disk for our own uploads; None for external URLs."""
        return storage.size_kb(self.photo)


class UserPublic(UserSummary):
    bio: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact: Optional[str] = None
    created_at: datetime


class UserPrivate(UserPublic):
    """Only ever returned to the user themselves (/api/auth/me, signup, login)."""

    email: str


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    photo: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=BIO_MAX)
    community: Optional[str] = Field(None, max_length=120)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    contact: Optional[str] = Field(None, max_length=200)


# ---------- auth ----------


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6)
    community: Optional[str] = Field(None, max_length=120)
    bio: Optional[str] = Field(None, max_length=BIO_MAX)
    photo: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserPrivate


# ---------- listings ----------


class ListingBase(BaseModel):
    type: ListingType
    kind: ListingKind = "offer"
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=4000)
    category: Optional[str] = Field(None, max_length=60)
    tags: list[str] = []
    image: Optional[str] = None
    quantity: Optional[str] = Field(None, max_length=60)
    exchange: ExchangeType = "free"
    price: Optional[str] = Field(None, max_length=60)

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v):
        return _split_tags(v)


class ListingCreate(ListingBase):
    # Client-generated id (e.g. a UUID) for offline-queued posts. Re-sending
    # the same client_id returns the existing listing instead of a duplicate.
    client_id: Optional[str] = Field(None, min_length=1, max_length=64)


class BatchEntry(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    listing: dict  # validated per entry, so one bad entry doesn't fail the batch


class BatchRequest(BaseModel):
    entries: list[BatchEntry] = Field(max_length=50)


class BatchResult(BaseModel):
    client_id: str
    status: Literal["created", "duplicate", "error"]
    listing_id: Optional[int] = None
    detail: Optional[str] = None


class BatchResponse(BaseModel):
    results: list[BatchResult]


class ListingUpdate(BaseModel):
    """PATCH body - only the fields sent are changed."""

    type: Optional[ListingType] = None
    kind: Optional[ListingKind] = None
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=4000)
    category: Optional[str] = Field(None, max_length=60)
    tags: Optional[list[str]] = None
    image: Optional[str] = None
    quantity: Optional[str] = Field(None, max_length=60)
    exchange: Optional[ExchangeType] = None
    price: Optional[str] = Field(None, max_length=60)
    status: Optional[ListingStatus] = None


class ListingOut(ListingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ListingStatus
    created_at: datetime
    updated_at: datetime
    owner: UserSummary
    # Only set when the request passed lat/lng to sort by distance.
    distance_km: Optional[float] = None

    @computed_field
    @property
    def image_size_kb(self) -> Optional[int]:
        """KB on disk for our own uploads; None for external URLs."""
        return storage.size_kb(self.image)


class ProfileOut(UserPublic):
    listings: list[ListingOut]


# ---------- communities & search ----------


class CommunityOut(BaseModel):
    name: str
    members: int
    listings: int


class SearchResponse(BaseModel):
    query: str
    # "ai" when the Go search service answered, "keyword" for the built-in fallback.
    engine: Literal["ai", "keyword"]
    listings: list[ListingOut]
    users: list[UserPublic]
