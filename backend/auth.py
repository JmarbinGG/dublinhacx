import secrets
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session as DbSession

from database import get_db
from models import Session, User
from schemas import AuthResponse, LoginRequest, SignupRequest, UserPrivate

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip() or None


def optional_user(
    authorization: Optional[str] = Header(None), db: DbSession = Depends(get_db)
) -> Optional[User]:
    """The signed-in user, or None - for routes that work either way."""
    token = _bearer_token(authorization)
    if token is None:
        return None
    session = db.get(Session, token)
    return session and db.get(User, session.user_id)


def current_user(user: Optional[User] = Depends(optional_user)) -> User:
    """The signed-in user, or 401."""
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user


def _start_session(db: DbSession, user: User) -> AuthResponse:
    token = secrets.token_urlsafe(32)
    db.add(Session(token=token, user_id=user.id))
    db.commit()
    return AuthResponse(token=token, user=UserPrivate.model_validate(user))


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: DbSession = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=body.name,
        email=email,
        password=hash_password(body.password),
        community=body.community,
        bio=body.bio,
        photo=body.photo,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _start_session(db, user)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: DbSession = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _start_session(db, user)


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None), db: DbSession = Depends(get_db)):
    token = _bearer_token(authorization)
    if token:
        db.query(Session).filter(Session.token == token).delete()
        db.commit()
    return {"status": "logged out"}


@router.get("/me", response_model=UserPrivate)
def me(user: User = Depends(current_user)):
    return UserPrivate.model_validate(user)
