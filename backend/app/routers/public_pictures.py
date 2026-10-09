"""
Public links to the pictures that go out with WhatsApp messages.

Mr LAD's inbox cannot draw a picture that was sent through its API (it does not record which picture it was),
so a note with a link to the picture is added to the Mr LAD thread. The link has to open without logging in,
so it points here. A picture's address contains its random 32-character id, which cannot be guessed, and the
shop receives that same picture on WhatsApp anyway.
"""
import re

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Response
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.message_image import MessageImage

router = APIRouter(prefix="/api/public/pictures", tags=["Public pictures"])

_UID = re.compile(r"^[0-9a-f]{32}$")
_HEADERS = {"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"}


@router.get("/flyer")
def built_in_flyer():
    """The built-in EasyBillBro flyer."""
    from app.services.mr_lad_client import MrLadWhatsAppClient

    path = MrLadWhatsAppClient._resolve_flyer_paths().get("easybillbro")
    if not path:
        raise HTTPException(status_code=404, detail="Not found")
    with open(path, "rb") as handle:
        data = handle.read()
    return Response(content=data, media_type="image/png" if path.lower().endswith(".png") else "image/jpeg", headers=_HEADERS)


@router.get("/{uid}")
def picture_by_id(uid: str, db: Session = Depends(get_db)):
    if not _UID.match(uid or ""):
        raise HTTPException(status_code=404, detail="Not found")
    img = db.query(MessageImage).filter(MessageImage.uid == uid).first()
    if not img:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=bytes(img.data), media_type=img.mime, headers=_HEADERS)
