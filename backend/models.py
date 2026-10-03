from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base

# Listing.type - what's being shared.
LISTING_TYPES = ("material", "equipment", "skill")
# Listing.kind - "offer" = I have this; "request" = I need this (a job posting
# is a "request" of type "skill").
LISTING_KINDS = ("offer", "request")
# Listing.exchange - how it changes hands. "lend" only makes sense for
# equipment; "paid" covers both selling an item and paid work.
EXCHANGE_TYPES = ("free", "lend", "trade", "paid")
LISTING_STATUSES = ("available", "pending", "closed")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)  # login only, never public
    password = Column(String, nullable=False)  # bcrypt hash
    photo = Column(String)  # URL, e.g. /uploads/<uuid>.jpg
    bio = Column(String)  # short description, see schemas.BIO_MAX
    community = Column(String, index=True)  # town/village, e.g. "Ennistymon, Co. Clare"
    latitude = Column(Float)
    longitude = Column(Float)
    contact = Column(String)  # whatever the user chooses to make public: phone, email, etc.
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    listings = relationship(
        "Listing", back_populates="owner", cascade="all, delete-orphan", order_by="Listing.id.desc()"
    )


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False, index=True)  # LISTING_TYPES
    kind = Column(String, nullable=False, default="offer")  # LISTING_KINDS
    title = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, index=True)  # free-form, e.g. "timber", "farm machinery", "carpentry"
    tags = Column(String)  # comma-separated; exposed as a list by the API
    image = Column(String)
    quantity = Column(String)  # mostly for materials, e.g. "40 sheets"
    exchange = Column(String, nullable=False, default="free")  # EXCHANGE_TYPES
    price = Column(String)  # free text, e.g. "€20/day", "swap for firewood"
    status = Column(String, nullable=False, default="available")  # LISTING_STATUSES
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    owner = relationship("User", back_populates="listings")


class Session(Base):
    """Bearer tokens. Stored in the DB (not memory) so logins survive restarts."""

    __tablename__ = "sessions"

    token = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
