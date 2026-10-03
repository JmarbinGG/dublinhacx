import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from auth import current_user
from limits import UPLOAD_LIMIT, hit
from models import User
from storage import UPLOAD_DIR, URL_PREFIX, size_kb

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000  # anything bigger is treated as a decompression bomb
MAX_SIDE = 1024  # stored images are downscaled to fit this - low bandwidth
WEBP_QUALITY = 80
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS

router = APIRouter(tags=["uploads"])


def _reencode(contents: bytes) -> bytes:
    """Decode with Pillow and write a fresh WebP. Rejects anything that isn't
    really an image, and the re-encode drops EXIF/GPS metadata and any
    non-image bytes smuggled into the file (polyglots)."""
    try:
        with Image.open(io.BytesIO(contents)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, WebP or GIF image")
            if probe.width * probe.height > MAX_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
            probe.verify()  # structural check; the image is unusable afterwards

        with Image.open(io.BytesIO(contents)) as img:
            img.seek(0)  # animated GIF/WebP: keep the first frame only
            img = ImageOps.exif_transpose(img)  # bake in rotation before EXIF is dropped
            img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
            return out.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise HTTPException(status_code=415, detail="That file isn't a valid image")


@router.post("/api/uploads")
def upload_image(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Store a profile photo or listing image. Returns a URL to put in
    `photo` (PATCH /api/users/me) or `image` (POST/PATCH /api/listings),
    plus its size so the client can show it before loading.

    The original is never stored: it's re-encoded to WebP, max 1024px."""
    hit(f"upload:user:{user.id}", UPLOAD_LIMIT)

    contents = file.file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller")

    data = _reencode(contents)
    filename = f"{uuid.uuid4().hex}.webp"  # never derived from the client's filename
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(data)

    url = f"{URL_PREFIX}{filename}"
    return {"url": url, "size_kb": size_kb(url)}
