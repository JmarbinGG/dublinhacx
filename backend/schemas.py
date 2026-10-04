from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator

import categories
import i18n
import storage
from communities import slugify
from textutil import MAX_QUERY_CHARS

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
    def community_id(self) -> Optional[str]:
        """Slug of `community` - the id used by /api/communities and filters."""
        return slugify(self.community)

    @computed_field
    @property
    def photo_size_kb(self) -> Optional[int]:
        """KB on disk for our own uploads; None for external URLs."""
        return storage.size_kb(self.photo)


class UserPublic(UserSummary):
    # No coordinates here on purpose: publicly, people are only ever located
    # by their community's centre (see communities.py).
    bio: Optional[str] = None
    contact: Optional[str] = None
    created_at: datetime

    @model_validator(mode="after")
    def _translate(self):
        # Others see the bio in their language (X-Lang); the user's own
        # profile (UserPrivate) always shows what they wrote, for editing.
        if not isinstance(self, UserPrivate):
            i18n.apply("user", self.id, self)
        return self


class UserPrivate(UserPublic):
    """Only ever returned to the user themselves (/api/auth/me, signup, login)."""

    email: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


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
    password: str = Field(min_length=8, max_length=128)
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
    # One of GET /api/categories ids. Labels and old free text are accepted
    # and mapped (e.g. "farm tools" -> "farming").
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

    @model_validator(mode="after")
    def _category(self):
        self.category = categories.normalize(self.category, f"{self.title} {' '.join(self.tags)}")
        return self


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

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        return None if v is None else categories.normalize(v)


class ListingOut(ListingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ListingStatus
    created_at: datetime
    updated_at: datetime
    owner: UserSummary
    # Community centre to community centre, only when the request gave an
    # origin (from_community or lat/lng).
    distance_km: Optional[float] = None

    @model_validator(mode="after")
    def _translate(self):
        i18n.apply("listing", self.id, self)  # X-Lang: es | hi
        return self

    @computed_field
    @property
    def community_id(self) -> Optional[str]:
        return self.owner.community_id

    @computed_field
    @property
    def image_size_kb(self) -> Optional[int]:
        """KB on disk for our own uploads; None for external URLs."""
        return storage.size_kb(self.image)


class ProfileOut(UserPublic):
    listings: list[ListingOut]


# ---------- communities & search ----------


class CategoryOut(BaseModel):
    id: str
    label: str
    count: int  # available listings


class CommunityOut(BaseModel):
    id: str  # slug, e.g. "palm-grove"
    name: str
    lat: Optional[float] = None  # community centre, rounded to ~1 km
    lng: Optional[float] = None
    members: int
    listings: int  # available listings


Engine = Literal["ai", "keyword"]


class SearchResponse(BaseModel):
    query: str
    # "ai" when the AI search service ranked the results (merged with keyword
    # hits), "keyword" for the built-in fallback. Same shape either way.
    engine: Engine
    listings: list[ListingOut]
    users: list[UserPublic]
    limit: int
    offset: int


# ---------- AI search (one-shot overview) ----------


class AISearchFilters(BaseModel):
    type: Optional[ListingType] = None
    kind: Optional[ListingKind] = None
    exchange: Optional[ExchangeType] = None
    category: Optional[str] = Field(None, max_length=60)

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        return None if not v else categories.normalize(v)
    max_km: Optional[float] = Field(None, gt=0, le=1000)  # needs a community
    # The frontend's town scope: town = only the shopper's community,
    # others = everywhere else, near = within 50 km.
    scope: Optional[Literal["all", "town", "others", "near"]] = None


class AISearchRequest(BaseModel):
    q: str = Field(min_length=1, max_length=MAX_QUERY_CHARS)
    filters: AISearchFilters = AISearchFilters()
    community_id: Optional[str] = Field(None, max_length=120)
    community: Optional[str] = Field(None, max_length=120)  # town name; either works


class AIPick(BaseModel):
    id: int
    why: str


class AISearchResponse(BaseModel):
    query: str
    summary: str
    picks: list[AIPick]
    caveats: list[str]
    engine: Engine  # "keyword" = the model wasn't used (down, over budget, bad output)
    ai: bool  # true when the text was written by the AI - label it in the UI
    listings: list[ListingOut]  # the picked rows, re-read from the DB, in pick order


# ---------- AI assistant (multi-turn chat) ----------


class AssistantSessionCreate(BaseModel):
    community_id: Optional[str] = Field(None, max_length=120)
    community: Optional[str] = Field(None, max_length=120)


class AssistantSessionOut(BaseModel):
    session_id: str
    expires_in_s: int  # idle timeout
    max_turns: int
    max_message_chars: int


class AssistantChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=500)
    community_id: Optional[str] = Field(None, max_length=120)
    community: Optional[str] = Field(None, max_length=120)


class Chip(BaseModel):
    code: str  # send back verbatim as the next `message`
    label: str


class AssistantReply(BaseModel):
    text: str
    chips: list[Chip]
    listing_ids: list[int]
    listings: list[ListingOut]  # the same ids, re-read from the DB
    engine: Engine
    ai: bool
    turns_left: int


class AssistantReportRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=500)
