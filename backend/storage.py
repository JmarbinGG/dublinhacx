"""Files on disk under /uploads: where they live, how big they are, and
deleting ones nothing points at any more."""

import os
from typing import Optional

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
URL_PREFIX = "/uploads/"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _local_path(url: Optional[str]) -> Optional[str]:
    """Disk path for one of our own upload URLs; None for external URLs or
    anything that tries to escape UPLOAD_DIR."""
    if not url or not url.startswith(URL_PREFIX):
        return None
    name = url.removeprefix(URL_PREFIX)
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return None
    return os.path.join(UPLOAD_DIR, name)


def size_kb(url: Optional[str]) -> Optional[int]:
    """Size of an uploaded file in KB (rounded up), or None if it isn't one of
    ours / doesn't exist. External seed images report None."""
    path = _local_path(url)
    if path is None:
        return None
    try:
        return -(-os.path.getsize(path) // 1024)
    except OSError:
        return None


def delete_if_orphaned(db, url: Optional[str]) -> None:
    """Remove an uploaded file once no listing image or user photo uses it.
    Call after the change that dropped the reference has been committed."""
    path = _local_path(url)
    if path is None:
        return
    from models import Listing, User  # local import: models doesn't need storage

    still_used = (
        db.query(Listing.id).filter(Listing.image == url).first()
        or db.query(User.id).filter(User.photo == url).first()
    )
    if not still_used:
        try:
            os.remove(path)
        except OSError:
            pass
