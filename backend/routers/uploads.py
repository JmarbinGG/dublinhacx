import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth import current_user
from models import User

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_BYTES = 8 * 1024 * 1024
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}

router = APIRouter(tags=["uploads"])


@router.post("/api/uploads")
def upload_image(file: UploadFile = File(...), _: User = Depends(current_user)):
    """Store a profile photo or listing image. Returns a URL to put in
    `photo` (PATCH /api/users/me) or `image` (POST/PATCH /api/listings)."""
    ext = EXTENSIONS.get(file.content_type or "")
    if ext is None:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, WebP or GIF image")

    contents = file.file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller")

    filename = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(contents)
    return {"url": f"/uploads/{filename}"}
