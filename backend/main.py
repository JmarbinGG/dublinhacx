import os
import uuid
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, or_, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

from ai.base import AnalysisResult
from ai.factory import get_classifier

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

DATABASE_URL = "sqlite:///./listings.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    image = Column(String)
    owner = Column(String)
    location = Column(String)
    quantity = Column(String)
    email = Column(String)
    mailtolink = Column(String)
    status = Column(String, default="available")
    category = Column(String)
    tags = Column(String)  # comma-separated keywords, e.g. "wood,lumber,pallets"
    owner_id = Column(Integer, nullable=True)  # users.id, if posted while signed in


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password = Column(String, nullable=False)  # bcrypt hash


Base.metadata.create_all(bind=engine)

MOCK_LISTINGS = [
    Listing(
        name="Cardboard Boxes (Bulk)",
        image="https://images.unsplash.com/photo-1607166452427-7e4477079cb9?w=400&h=300&fit=crop",
        owner="Acme Warehousing",
        location="Austin, TX",
        quantity="200 units",
        email="acme@example.com",
        mailtolink="mailto:acme@example.com?subject=Inquiry regarding Cardboard Boxes",
        status="available",
        category="paper",
    ),
    Listing(
        name="Scrap Metal Offcuts",
        image="https://images.unsplash.com/photo-1679996287979-166522b96c39?w=400&h=300&fit=crop",
        owner="Metro Fabrication",
        location="Detroit, MI",
        quantity="1.5 tons",
        email="metro@example.com",
        mailtolink="mailto:metro@example.com?subject=Inquiry regarding Scrap Metal Offcuts",
        status="available",
        category="metal",
    ),
    Listing(
        name="Expired Produce Crates",
        image="https://images.unsplash.com/photo-1757627550652-30788bfce978?w=400&h=300&fit=crop",
        owner="GreenLeaf Grocers",
        location="Sacramento, CA",
        quantity="50 crates",
        email="greenleaf@example.com",
        mailtolink="mailto:greenleaf@example.com?subject=Inquiry regarding Produce Crates",
        status="available",
        category="organic",
    ),
    Listing(
        name="Wood Pallets",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Wooden-pallets%20stacked%207.jpg?width=400",
        owner="Union Logistics",
        location="Portland, OR",
        quantity="80 pallets",
        email="union@example.com",
        mailtolink="mailto:union@example.com?subject=Inquiry regarding Wood Pallets",
        status="available",
        category="wood",
        tags="wood,lumber,timber,shipping",
    ),
    Listing(
        name="Mixed Softwood Scraps",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Wood%20planks.jpg?width=400",
        owner="Cascade Millworks",
        location="Eugene, OR",
        quantity="3 pallets",
        email="cascade@example.com",
        mailtolink="mailto:cascade@example.com?subject=Inquiry regarding Mixed Softwood Scraps",
        status="available",
        category="wood",
        tags="wood,scraps,softwood,offcuts",
    ),
    Listing(
        name="Plywood Offcuts (3/4\" CDX)",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Plywood%20panels%20for%20new%20construction.jpg?width=400",
        owner="Riverside Framing Co.",
        location="Columbus, OH",
        quantity="60 sheets",
        email="riverside@example.com",
        mailtolink="mailto:riverside@example.com?subject=Inquiry regarding Plywood Offcuts",
        status="available",
        category="wood",
        tags="wood,plywood,cdx,offcuts,sheathing",
    ),
    Listing(
        name="Cabinet Panel Scraps (Melamine)",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Birch%20plywood.jpg?width=400",
        owner="Bluepeak Cabinetry",
        location="Charlotte, NC",
        quantity="40 panels",
        email="bluepeak@example.com",
        mailtolink="mailto:bluepeak@example.com?subject=Inquiry regarding Cabinet Panel Scraps",
        status="available",
        category="wood",
        tags="wood,cabinet,melamine,panels,scraps",
    ),
    Listing(
        name="Overstock Shaker Cabinet Doors",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Wood%20planks%20background.jpg?width=400",
        owner="Bluepeak Cabinetry",
        location="Charlotte, NC",
        quantity="25 doors",
        email="bluepeak@example.com",
        mailtolink="mailto:bluepeak@example.com?subject=Inquiry regarding Shaker Cabinet Doors",
        status="available",
        category="wood",
        tags="wood,cabinet,doors,shaker,overstock",
    ),
    Listing(
        name="Kiln-Dried 2x4 Stud Offcuts",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Men%20stacking%20lumber%20at%20Seattle%20Cedar%20Lumber%20Manufacturing%20Company%2C%20ca1920%20(MOHAI%204377).jpg?width=400",
        owner="Northgate Lumber",
        location="Boise, ID",
        quantity="500 linear ft",
        email="northgate@example.com",
        mailtolink="mailto:northgate@example.com?subject=Inquiry regarding 2x4 Stud Offcuts",
        status="available",
        category="wood",
        tags="wood,lumber,studs,framing,offcuts",
    ),
    Listing(
        name="Oak Hardwood Flooring Remnants",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/EbonyWhiteOak.JPG?width=400",
        owner="Heritage Flooring Co.",
        location="Nashville, TN",
        quantity="300 sq ft",
        email="heritage@example.com",
        mailtolink="mailto:heritage@example.com?subject=Inquiry regarding Oak Flooring Remnants",
        status="available",
        category="wood",
        tags="wood,oak,hardwood,flooring,remnants",
    ),
    Listing(
        name="Steel Rebar Offcuts",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/A%20bunch%20of%20rebar%20up%20close.jpg?width=400",
        owner="Ironclad Construction",
        location="Pittsburgh, PA",
        quantity="1,200 lbs",
        email="ironclad@example.com",
        mailtolink="mailto:ironclad@example.com?subject=Inquiry regarding Steel Rebar Offcuts",
        status="available",
        category="metal",
        tags="metal,steel,rebar,offcuts,construction",
    ),
    Listing(
        name="Aluminum Sheet Metal Scraps",
        image="https://images.unsplash.com/photo-1679996287979-166522b96c39?w=400&h=300&fit=crop",
        owner="Summit Fabrication",
        location="Salt Lake City, UT",
        quantity="800 lbs",
        email="summit@example.com",
        mailtolink="mailto:summit@example.com?subject=Inquiry regarding Aluminum Sheet Scraps",
        status="available",
        category="metal",
        tags="metal,aluminum,sheet metal,scraps",
    ),
    Listing(
        name="Structural Steel Beam Offcuts",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Thai%20House%20Steel%20Beams%20Paint.JPG?width=400",
        owner="Ironclad Construction",
        location="Pittsburgh, PA",
        quantity="14 beams",
        email="ironclad@example.com",
        mailtolink="mailto:ironclad@example.com?subject=Inquiry regarding Steel Beam Offcuts",
        status="available",
        category="metal",
        tags="metal,steel,beams,structural,offcuts",
    ),
    Listing(
        name="Copper Wire & Pipe Scraps",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Copper%20scraps.JPG?width=400",
        owner="Voltline Electrical",
        location="Phoenix, AZ",
        quantity="150 lbs",
        email="voltline@example.com",
        mailtolink="mailto:voltline@example.com?subject=Inquiry regarding Copper Wire and Pipe Scraps",
        status="available",
        category="metal",
        tags="metal,copper,wire,pipe,scraps",
    ),
    Listing(
        name="Galvanized Ductwork Scraps",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/HVAC%20Ventilation%20Exhaust.jpg?width=400",
        owner="Apex HVAC Supply",
        location="Kansas City, MO",
        quantity="30 pieces",
        email="apexhvac@example.com",
        mailtolink="mailto:apexhvac@example.com?subject=Inquiry regarding Galvanized Ductwork Scraps",
        status="available",
        category="metal",
        tags="metal,galvanized,ductwork,hvac,scraps",
    ),
    Listing(
        name="Cabinet Hardware Overstock (Hinges & Pulls)",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Kitchen%20cabinet%20hinge%2C%20Frog%20hinge%2001.JPG?width=400",
        owner="Bluepeak Cabinetry",
        location="Charlotte, NC",
        quantity="600 units",
        email="bluepeak@example.com",
        mailtolink="mailto:bluepeak@example.com?subject=Inquiry regarding Cabinet Hardware Overstock",
        status="available",
        category="fixtures",
        tags="fixtures,hardware,cabinet,hinges,pulls",
    ),
    Listing(
        name="Door Hardware Lot (Knobs & Deadbolts)",
        image="https://images.unsplash.com/photo-1613570777861-6e0e591bd8ec?w=400&h=300&fit=crop",
        owner="Riverside Framing Co.",
        location="Columbus, OH",
        quantity="120 units",
        email="riverside@example.com",
        mailtolink="mailto:riverside@example.com?subject=Inquiry regarding Door Hardware Lot",
        status="available",
        category="fixtures",
        tags="fixtures,hardware,door,knobs,deadbolts",
    ),
    Listing(
        name="Commercial LED Light Fixture Overstock",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Ceiling%20fan%20with%20light.png?width=400",
        owner="Voltline Electrical",
        location="Phoenix, AZ",
        quantity="80 fixtures",
        email="voltline@example.com",
        mailtolink="mailto:voltline@example.com?subject=Inquiry regarding LED Light Fixture Overstock",
        status="available",
        category="fixtures",
        tags="fixtures,lighting,led,commercial,overstock",
    ),
    Listing(
        name="Plumbing Fixture Surplus (Faucets & Valves)",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Faucet%20in%20a%20bathroom%20sink.jpg?width=400",
        owner="Apex HVAC Supply",
        location="Kansas City, MO",
        quantity="45 units",
        email="apexhvac@example.com",
        mailtolink="mailto:apexhvac@example.com?subject=Inquiry regarding Plumbing Fixture Surplus",
        status="available",
        category="fixtures",
        tags="fixtures,plumbing,faucets,valves,surplus",
    ),
    Listing(
        name="Ceramic Tile Overstock",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Tesselated%20tile%20floor%20pattern.jpg?width=400",
        owner="Heritage Flooring Co.",
        location="Nashville, TN",
        quantity="500 sq ft",
        email="heritage@example.com",
        mailtolink="mailto:heritage@example.com?subject=Inquiry regarding Ceramic Tile Overstock",
        status="available",
        category="construction",
        tags="construction,tile,ceramic,flooring,overstock",
    ),
    Listing(
        name="Reclaimed Clean Face Brick",
        image="https://images.unsplash.com/photo-1632758821813-eb8248651745?w=400&h=300&fit=crop",
        owner="Ironclad Construction",
        location="Pittsburgh, PA",
        quantity="2,000 bricks",
        email="ironclad@example.com",
        mailtolink="mailto:ironclad@example.com?subject=Inquiry regarding Reclaimed Face Brick",
        status="available",
        category="construction",
        tags="construction,brick,masonry,reclaimed",
    ),
    Listing(
        name="Concrete Block Offcuts",
        image="https://commons.wikimedia.org/wiki/Special:FilePath/Concrete%20Masonry%20blocks.jpg?width=400",
        owner="Summit Fabrication",
        location="Salt Lake City, UT",
        quantity="300 blocks",
        email="summit@example.com",
        mailtolink="mailto:summit@example.com?subject=Inquiry regarding Concrete Block Offcuts",
        status="available",
        category="construction",
        tags="construction,concrete,block,masonry,offcuts",
    ),
    Listing(
        name="Drywall Sheet Offcuts",
        image="https://images.unsplash.com/photo-1777793919680-0123bc31ce36?w=400&h=300&fit=crop",
        owner="Riverside Framing Co.",
        location="Columbus, OH",
        quantity="70 sheets",
        email="riverside@example.com",
        mailtolink="mailto:riverside@example.com?subject=Inquiry regarding Drywall Sheet Offcuts",
        status="available",
        category="construction",
        tags="construction,drywall,sheetrock,offcuts",
    ),
    Listing(
        name="Mixed Construction Debris (Clean Fill)",
        image="https://images.unsplash.com/photo-1777793919680-0123bc31ce36?w=400&h=300&fit=crop",
        owner="Ironclad Construction",
        location="Pittsburgh, PA",
        quantity="10 cubic yards",
        email="ironclad@example.com",
        mailtolink="mailto:ironclad@example.com?subject=Inquiry regarding Mixed Construction Debris",
        status="available",
        category="construction",
        tags="construction,debris,demolition,leftovers,cleanup",
    ),
    Listing(
        name="Used Oak Wine Barrels",
        image="https://images.unsplash.com/photo-1639757664366-83a495f4a9d9?w=400&h=300&fit=crop",
        owner="Napa Valley Cellars",
        location="Napa, CA",
        quantity="40 barrels",
        email="napavalleycellars@example.com",
        mailtolink="mailto:napavalleycellars@example.com?subject=Inquiry regarding Used Oak Wine Barrels",
        status="available",
        category="wood",
        tags="wood,wine barrels,oak,barrels,reclaimed",
    ),
    Listing(
        name="Half-Cut Wine Barrel Planters",
        image="https://images.unsplash.com/photo-1646419081436-b3ea1613accd?w=400&h=300&fit=crop",
        owner="Sonoma Ridge Winery",
        location="Sonoma, CA",
        quantity="15 planters",
        email="sonomaridge@example.com",
        mailtolink="mailto:sonomaridge@example.com?subject=Inquiry regarding Wine Barrel Planters",
        status="available",
        category="wood",
        tags="wood,wine barrels,planters,oak,reclaimed",
    ),
]

with SessionLocal() as _db:
    if _db.query(Listing).count() == 0:
        _db.add_all(MOCK_LISTINGS)
        _db.commit()


class ListingCreate(BaseModel):
    name: str
    image: Optional[str] = None
    owner: Optional[str] = None
    location: Optional[str] = None
    quantity: Optional[str] = None
    email: Optional[str] = None
    mailtolink: Optional[str] = None
    status: Optional[str] = "available"
    category: Optional[str] = None
    tags: Optional[str] = None


class ListingOut(ListingCreate):
    id: int
    # Not on ListingCreate on purpose - a client can never set this directly,
    # only the server derives it from the auth token on creation.
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut


# In-memory token store: token -> user id. Fine for a hackathon; wiped on restart.
SESSIONS: dict[str, int] = {}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def get_current_user_id(authorization: Optional[str] = Header(None)) -> Optional[int]:
    """Looks up the bearer token against SESSIONS. Returns None if there's no
    token or it's not recognized - used where being signed in is optional
    (e.g. creating a listing anonymously is still allowed)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    return SESSIONS.get(token)


def require_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    """Same lookup, but 401s if there's no valid session - for routes where
    being signed in is mandatory (viewing/deleting your own listings)."""
    user_id = get_current_user_id(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user_id


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.post("/api/analyze")
def analyze_image(image: UploadFile = File(...)):
    """Run the configured AI backend (see ai/factory.py) over an uploaded
    photo and return suggested listing fields for the user to review/edit
    before calling /api/upload.

    This is a sync `def`, not `async def`, on purpose: the NVIDIA/CLIP
    backends make a slow, blocking network/inference call. FastAPI runs
    sync routes in a worker thread pool, so that block doesn't freeze the
    single-threaded event loop for every other endpoint - an `async def`
    here previously froze the whole server (including /api/listings and
    /api/search) for the duration of every analyze call.
    """
    contents = image.file.read()

    ext = os.path.splitext(image.filename or "")[1] or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(contents)

    # The photo is already saved above regardless of what happens next - the
    # AI classification is just a convenience autofill on top of it. If it
    # raises (AI backend timeout, network error, etc.) don't 500 the whole
    # request: that would keep the client from ever learning image_url,
    # silently dropping an already-uploaded photo from the listing. Fall back
    # to empty suggestions instead, so the upload always succeeds.
    try:
        result = get_classifier().analyze(contents)
    except Exception:
        result = AnalysisResult(name="", category="", tags=[], quantity="", confidence=0.0)

    return {
        "name": result.name,
        "category": result.category,
        "tags": ",".join(result.tags),
        "quantity": result.quantity,
        "confidence": result.confidence,
        "image_url": f"/uploads/{filename}",
    }


# Synonym groups: searching any term in a group also matches the rest of the group.
SYNONYM_GROUPS = [
    {"wood", "pallets", "lumber", "timber"},
    {"metal", "scrap metal", "steel", "aluminum", "offcuts"},
    {"paper", "cardboard", "boxes", "packaging"},
    {"organic", "produce", "food waste", "compost"},
    {"plastic", "polymer"},
    {"fixtures", "hardware", "hinges", "knobs", "lighting", "plumbing"},
    {"construction", "debris", "demolition", "leftovers", "cleanup"},
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


@app.get("/api/search", response_model=list[ListingOut])
def search_listings(query: str = ""):
    db = SessionLocal()
    try:
        terms = expand_query_terms(query)
        if not terms:
            return db.query(Listing).all()

        filters = []
        for term in terms:
            like = f"%{term}%"
            filters.append(Listing.name.ilike(like))
            filters.append(Listing.category.ilike(like))
            filters.append(Listing.location.ilike(like))
            filters.append(Listing.tags.ilike(like))

        results = db.query(Listing).filter(or_(*filters)).all()
        return results
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/signup", response_model=AuthResponse)
def signup(body: SignupRequest):
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == body.email).first():
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(name=body.name, email=body.email, password=hash_password(body.password))
        db.add(user)
        db.commit()
        db.refresh(user)

        token = str(uuid.uuid4())
        SESSIONS[token] = user.id
        return AuthResponse(token=token, user=UserOut.model_validate(user))
    finally:
        db.close()


@app.post("/api/login", response_model=AuthResponse)
def login(body: LoginRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == body.email).first()
        if not user or not verify_password(body.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = str(uuid.uuid4())
        SESSIONS[token] = user.id
        return AuthResponse(token=token, user=UserOut.model_validate(user))
    finally:
        db.close()

@app.get("/api/listings", response_model=list[ListingOut] | ListingOut)
def get_listings(id: Optional[int] = None):
    db = SessionLocal()
    try:
        if id is not None:
            listing = db.query(Listing).filter(Listing.id == id).first()
            if not listing:
                raise HTTPException(status_code=404, detail="Listing not found")
            return listing
        return db.query(Listing).all()
    finally:
        db.close()


@app.get("/api/listings/mine", response_model=list[ListingOut])
def get_my_listings(user_id: int = Depends(require_current_user_id)):
    """Only what the signed-in user posted - not a public browse endpoint,
    so this requires a valid session rather than taking an owner_id param
    (which would let anyone list anyone else's listings)."""
    db = SessionLocal()
    try:
        return db.query(Listing).filter(Listing.owner_id == user_id).all()
    finally:
        db.close()


@app.post("/api/upload", response_model=ListingOut)
def create_listing(
    listing: ListingCreate,
    owner_id: int = Depends(require_current_user_id),
):
    # Publishing a listing requires an account - anonymous posting used to be
    # allowed but every listing now needs a real owner (for My Listings,
    # delete permissions, and just knowing who posted it).
    db = SessionLocal()
    try:
        new_listing = Listing(**listing.model_dump(), owner_id=owner_id)
        db.add(new_listing)
        db.commit()
        db.refresh(new_listing)
        return new_listing
    finally:
        db.close()


@app.delete("/api/listings/{id}")
def delete_listing(id: int, user_id: int = Depends(require_current_user_id)):
    db = SessionLocal()
    try:
        listing = db.query(Listing).filter(Listing.id == id).first()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")
        if listing.owner_id != user_id:
            raise HTTPException(status_code=403, detail="You don't own this listing")
        db.delete(listing)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
