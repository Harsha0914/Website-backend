"""
Rules and helpers for the per-account picture library used by WhatsApp messages.

Pictures are prepared (resized, converted to JPEG) in the browser before upload, so the server only has to
check that what arrives really is a small picture and keep it. Nothing here trusts the browser: type is
checked from the file's own first bytes, sizes are capped, and every picture belongs to exactly one account.
"""
import base64
import hashlib
import os
import re
import tempfile
from typing import Tuple

# pyrefly: ignore [missing-import]
from fastapi import HTTPException

IMAGE_CATEGORIES = [
    "Restaurant", "Cafe", "Bakery", "Grocery", "Clothing & Fashion", "Pharmacy",
    "Salon & Beauty", "Gym", "Electronics", "Hardware & Auto", "General",
]

MAX_IMAGE_BYTES = 1_200_000     # the picture that is sent
MAX_THUMB_BYTES = 200_000       # the preview shown in the app
MAX_IMAGES_PER_ACCOUNT = 60
MAX_LABEL = 80

_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=\r\n]+)$")


def _sniff(raw: bytes) -> str:
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return ""


def decode_data_url(data_url: str, max_bytes: int, what: str = "image") -> Tuple[str, bytes]:
    """Return (mime, bytes) for a JPEG or PNG data URL, or raise a clear 400."""
    match = _DATA_URL.match((data_url or "").strip())
    if not match:
        raise HTTPException(status_code=400, detail=f"The {what} must be a JPEG or PNG picture.")
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail=f"The {what} could not be read.")
    if not raw:
        raise HTTPException(status_code=400, detail=f"The {what} is empty.")
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail=f"The {what} is too big ({len(raw) // 1024} KB). Please use a smaller picture.")
    real = _sniff(raw)
    if not real:  # the label said picture, the content is not one
        raise HTTPException(status_code=400, detail=f"The {what} is not a real JPEG or PNG picture.")
    return real, raw


def clean_category(category: str) -> str:
    value = (category or "General").strip()
    return value if value in IMAGE_CATEGORIES else "General"


def clean_label(label: str) -> str:
    return re.sub(r"\s+", " ", (label or "").strip())[:MAX_LABEL]


def file_for_sending(image) -> str:
    """
    Write the picture to a cache file and return its path (the WhatsApp gateway uploads from a file).
    The name contains a hash of the picture, so a replaced picture gets a new file and nothing stale is reused.
    """
    folder = os.path.join(tempfile.gettempdir(), "wa_images")
    os.makedirs(folder, exist_ok=True)
    digest = hashlib.sha1(image.data).hexdigest()[:16]
    ext = "png" if image.mime == "image/png" else "jpg"
    path = os.path.join(folder, f"{image.uid}_{digest}.{ext}")
    if not os.path.exists(path):
        with open(path, "wb") as handle:
            handle.write(image.data)
    return path
