import io
import json
import os
import re
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional, get_args

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, or_
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

from ai.base import AnalysisResult
from ai.categories import CATEGORIES
from ai.factory import get_classifier
from seed import seed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# A new file rather than the old listings.db: the schema changed (items,
# communities, sync_queue) and create_all can't migrate an existing table.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'marketplace.db')}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Community(Base):
    __tablename__ = "communities"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    approximate_population = Column(Integer)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)  # always lowercased
    password = Column(String, nullable=False)  # bcrypt hash
    community_id = Column(String, ForeignKey("communities.id"), nullable=True)


class Item(Base):
    __tablename__ = "items"

    id = Column(String, primary_key=True, default=new_uuid)
    community_id = Column(String, ForeignKey("communities.id"), nullable=False, index=True)
    category = Column(String, nullable=False, index=True)  # one of ai.categories.CATEGORIES
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    price_or_exchange = Column(String, default="")
    image_url = Column(String, nullable=True)
    image_size_kb = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    quantity = Column(String)
    tags = Column(String)  # comma-separated keywords
    status = Column(String, default="available")
    owner = Column(String)  # display name - from the account, never the client
    contact_email = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for seed data


class SyncQueue(Base):
    """Listings created offline on a device and replayed via POST /api/sync.
    The client generates the id, so a retried sync is idempotent."""

    __tablename__ = "sync_queue"

    id = Column(String, primary_key=True)
    payload_json = Column(Text, nullable=False)
    status = Column(String, default="pending")  # pending | synced
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    item_id = Column(String, nullable=True)


Base.metadata.create_all(bind=engine)

with SessionLocal() as _db:
    seed(_db, Community, Item)


# ---- schemas ----

Category = Literal["produce", "seeds", "heavy_tools", "skills_services", "general"]
assert set(get_args(Category)) == set(CATEGORIES)  # keep the AI label set in lockstep


def bounded_str(max_length: int, min_length: int = 0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


# Only images this server processed and stored - see /api/analyze.
UPLOAD_URL_RE = re.compile(r"^/uploads/[0-9a-f]{32}\.jpg$")


class ItemIn(BaseModel):
    community_id: str
    category: Category
    title: bounded_str(120, min_length=2)
    description: bounded_str(1000) = ""
    price_or_exchange: bounded_str(120) = ""
    quantity: Optional[bounded_str(60)] = None
    tags: Optional[bounded_str(200)] = None
    contact_email: Optional[EmailStr] = None
    image_url: Optional[str] = None

    @field_validator("image_url")
    @classmethod
    def image_must_be_ours(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not UPLOAD_URL_RE.match(value):
            raise ValueError("image_url must come from /api/analyze")
        return value


class ItemOut(BaseModel):
    id: str
    community_id: str
    category: str
    title: str
    description: Optional[str] = ""
    price_or_exchange: Optional[str] = ""
    image_url: Optional[str] = None
    image_size_kb: Optional[int] = None
    created_at: datetime
    quantity: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True


class ItemDetail(ItemOut):
    # Only filled in for signed-in viewers, so contact emails can't be
    # scraped anonymously from the public list.
    contact_email: Optional[str] = None


class CommunityOut(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    approximate_population: Optional[int] = None

    class Config:
        from_attributes = True


class SignupRequest(BaseModel):
    name: bounded_str(80, min_length=1)
    email: EmailStr
    # bcrypt only looks at the first 72 bytes - reject longer rather than
    # silently ignoring the tail.
    password: str = Field(min_length=8, max_length=72)
    community_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    community_id: Optional[str] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class SyncEntry(BaseModel):
    client_id: str = Field(min_length=8, max_length=64)
    item: ItemIn


class SyncRequest(BaseModel):
    entries: list[SyncEntry] = Field(max_length=50)


# ---- auth ----

# token -> (user id, expiry epoch seconds). In memory, so a restart signs
# everyone out; the frontend notices via /api/me and drops its stored token.
SESSIONS: dict[str, tuple[int, float]] = {}
SESSION_TTL_SECONDS = 7 * 24 * 3600


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# Compared against when the email isn't registered, so a login for an unknown
# email takes as long as a wrong password (no account enumeration by timing).
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = (user_id, time.time() + SESSION_TTL_SECONDS)
    return token


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.strip().partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None


def get_current_user_id(authorization: Optional[str] = Header(None)) -> Optional[int]:
    token = bearer_token(authorization)
    session = SESSIONS.get(token) if token else None
    if not session:
        return None
    user_id, expires = session
    if expires < time.time():
        SESSIONS.pop(token, None)
        return None
    return user_id


def require_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    user_id = get_current_user_id(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user_id


# ---- rate limiting (in memory, per client IP) ----

_HITS: dict[str, deque] = defaultdict(deque)


def rate_limit(name: str, limit: int, window_seconds: int):
    def dependency(request: Request):
        key = f"{name}:{request.client.host if request.client else 'unknown'}"
        now = time.time()
        hits = _HITS[key]
        while hits and hits[0] < now - window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests - please wait a minute and try again")
        hits.append(now)

    return Depends(dependency)


# ---- app ----

app = FastAPI(docs_url="/docs" if os.getenv("ENABLE_DOCS", "1") == "1" else None, redoc_url=None)

# Localhost, LAN (phones testing the dev server) and ngrok tunnels by default;
# CORS_ORIGINS adds exact origins, e.g. a deployed frontend.
DEFAULT_ORIGIN_REGEX = (
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?"
    r"|https://[a-z0-9-]+\.ngrok(-free)?\.(app|dev|io)"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", DEFAULT_ORIGIN_REGEX),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning"],
)
# Low-bandwidth users: JSON lists compress ~5-10x.
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/uploads/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---- photo upload + AI suggestions ----

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_EDGE = 800  # px - plenty for a phone screen, ~50-120 KB as JPEG
JPEG_QUALITY = 70
Image.MAX_IMAGE_PIXELS = 40_000_000  # refuse decompression bombs


def compress_image(raw: bytes) -> bytes:
    """Decode (which also proves it's really an image), drop EXIF/GPS by
    re-encoding, shrink and recompress as a progressive JPEG."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            return out.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise HTTPException(status_code=400, detail="That file isn't a supported image")


@app.post("/api/analyze", dependencies=[rate_limit("analyze", 10, 60)])
def analyze_image(image: UploadFile = File(...), _user_id: int = Depends(require_current_user_id)):
    """Compress an uploaded photo, store it, and return AI-suggested listing
    fields plus the stored image's size. Sync `def` on purpose: the AI call
    blocks, and FastAPI runs sync routes in a thread pool."""
    raw = image.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Photo is too large (max 10 MB)")

    compressed = compress_image(raw)
    filename = f"{uuid.uuid4().hex}.jpg"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(compressed)

    # The photo is saved either way - AI suggestions are only a convenience.
    try:
        result = get_classifier().analyze(compressed)
        tags = result.tags if isinstance(result.tags, list) else []
        suggestion = {
            "title": str(result.name or ""),
            "category": result.category if result.category in CATEGORIES else "general",
            "description": str(result.description or ""),
            "tags": ",".join(str(t) for t in tags),
            "quantity": str(result.quantity or ""),
            "confidence": float(result.confidence or 0.0),
        }
    except Exception as exc:
        print(f"[analyze] classifier failed: {exc!r}")
        suggestion = {"title": "", "category": "", "description": "", "tags": "", "quantity": "", "confidence": 0.0}

    return {**suggestion, "image_url": f"/uploads/{filename}", "image_size_kb": max(1, round(len(compressed) / 1024))}


# ---- communities ----

@app.get("/api/communities", response_model=list[CommunityOut])
def list_communities():
    with SessionLocal() as db:
        return db.query(Community).order_by(Community.name).all()


# ---- items ----

SYNONYM_GROUPS = [
    {"seed", "seeds", "heirloom", "seed saving"},
    {"tractor", "equipment", "machinery", "heavy_tools", "rental"},
    {"produce", "vegetables", "food", "eggs", "honey"},
    {"repair", "welding", "skills_services", "service", "labor"},
    {"wood", "lumber", "timber", "pallets", "firewood"},
    {"metal", "steel", "scrap", "scrap metal"},
]


def expand_query_terms(query: str) -> set[str]:
    q = query.strip().lower()
    if not q:
        return set()
    terms = {q}
    for group in SYNONYM_GROUPS:
        if q in group:
            terms |= group
    return terms


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/items", response_model=list[ItemOut])
def list_items(q: str = "", category: Optional[Category] = None, limit: int = Query(200, ge=1, le=500)):
    with SessionLocal() as db:
        query = db.query(Item)
        if category:
            query = query.filter(Item.category == category)
        terms = expand_query_terms(q[:100])
        if terms:
            filters = []
            for term in terms:
                like = f"%{escape_like(term)}%"
                for column in (Item.title, Item.description, Item.category, Item.tags, Item.price_or_exchange):
                    filters.append(column.ilike(like, escape="\\"))
            query = query.filter(or_(*filters))
        return query.order_by(Item.created_at.desc()).limit(limit).all()


@app.get("/api/items/mine", response_model=list[ItemOut])
def my_items(user_id: int = Depends(require_current_user_id)):
    with SessionLocal() as db:
        return db.query(Item).filter(Item.owner_id == user_id).order_by(Item.created_at.desc()).all()


@app.get("/api/items/{item_id}", response_model=ItemDetail)
def get_item(item_id: str, user_id: Optional[int] = Depends(get_current_user_id)):
    with SessionLocal() as db:
        item = db.get(Item, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Listing not found")
        detail = ItemDetail.model_validate(item)
        if user_id is None:
            detail.contact_email = None
        return detail


def build_item(db, body: ItemIn, user: User) -> Item:
    if not db.get(Community, body.community_id):
        raise HTTPException(status_code=400, detail="Unknown community")

    image_size_kb = None
    if body.image_url:
        path = os.path.join(UPLOAD_DIR, os.path.basename(body.image_url))
        if not os.path.isfile(path):
            raise HTTPException(status_code=400, detail="Uploaded photo not found - please re-upload it")
        image_size_kb = max(1, round(os.path.getsize(path) / 1024))

    return Item(
        **body.model_dump(exclude={"contact_email"}),
        contact_email=body.contact_email or user.email,
        image_size_kb=image_size_kb,
        owner=user.name,
        owner_id=user.id,
    )


@app.post("/api/items", response_model=ItemOut, dependencies=[rate_limit("create", 20, 60)])
def create_item(body: ItemIn, user_id: int = Depends(require_current_user_id)):
    with SessionLocal() as db:
        item = build_item(db, body, db.get(User, user_id))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item


@app.delete("/api/items/{item_id}")
def delete_item(item_id: str, user_id: int = Depends(require_current_user_id)):
    with SessionLocal() as db:
        item = db.get(Item, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Listing not found")
        if item.owner_id != user_id:
            raise HTTPException(status_code=403, detail="You don't own this listing")
        image_url = item.image_url
        db.delete(item)
        db.commit()

    if image_url and UPLOAD_URL_RE.match(image_url):
        try:
            os.remove(os.path.join(UPLOAD_DIR, os.path.basename(image_url)))
        except FileNotFoundError:
            pass
    return {"status": "deleted"}


@app.post("/api/sync", dependencies=[rate_limit("sync", 10, 60)])
def sync_offline_items(body: SyncRequest, user_id: int = Depends(require_current_user_id)):
    """Replay listings a device queued while offline. Each entry is recorded
    in sync_queue under its client-generated id first, so re-sending an
    already-synced entry returns the same item instead of a duplicate."""
    results = []
    with SessionLocal() as db:
        user = db.get(User, user_id)
        for entry in body.entries:
            row = db.get(SyncQueue, entry.client_id)
            if row and row.user_id != user_id:
                results.append({"client_id": entry.client_id, "status": "error", "detail": "Conflicting id"})
                continue
            if row and row.status == "synced":
                results.append({"client_id": entry.client_id, "status": "synced", "item_id": row.item_id})
                continue
            if not row:
                row = SyncQueue(id=entry.client_id, payload_json=entry.item.model_dump_json(), user_id=user_id)
                db.add(row)
                db.commit()
            try:
                item = build_item(db, entry.item, user)
            except HTTPException as exc:
                results.append({"client_id": entry.client_id, "status": "error", "detail": exc.detail})
                continue
            db.add(item)
            db.flush()
            row.status = "synced"
            row.item_id = item.id
            db.commit()
            results.append({"client_id": entry.client_id, "status": "synced", "item_id": item.id})
    return {"results": results}


# ---- accounts ----

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/signup", response_model=AuthResponse, dependencies=[rate_limit("signup", 5, 60)])
def signup(body: SignupRequest):
    email = body.email.lower()
    with SessionLocal() as db:
        if body.community_id and not db.get(Community, body.community_id):
            raise HTTPException(status_code=400, detail="Unknown community")
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=400, detail="Could not create an account with that email")

        user = User(name=body.name, email=email, password=hash_password(body.password), community_id=body.community_id)
        db.add(user)
        db.commit()
        db.refresh(user)
        return AuthResponse(token=new_session(user.id), user=UserOut.model_validate(user))


@app.post("/api/login", response_model=AuthResponse, dependencies=[rate_limit("login", 10, 60)])
def login(body: LoginRequest):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.email.lower()).first()
        if not verify_password(body.password, user.password if user else _DUMMY_HASH) or not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return AuthResponse(token=new_session(user.id), user=UserOut.model_validate(user))


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(None)):
    token = bearer_token(authorization)
    if token:
        SESSIONS.pop(token, None)
    return {"status": "signed out"}


@app.get("/api/me", response_model=UserOut)
def me(user_id: int = Depends(require_current_user_id)):
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=401, detail="Sign in required")
        return user


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=os.getenv("RELOAD", "1") == "1")
