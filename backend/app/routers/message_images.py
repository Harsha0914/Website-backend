"""
Each account's own picture library for WhatsApp messages: add, list, change, replace, delete.
Every call is limited to the signed-in account's pictures; someone else's picture looks like it does not exist.
"""
import uuid
from typing import Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Response, status
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.message_image import MessageImage
from app.services.message_images import (
    IMAGE_CATEGORIES,
    MAX_IMAGES_PER_ACCOUNT,
    MAX_IMAGE_BYTES,
    MAX_THUMB_BYTES,
    clean_category,
    clean_label,
    decode_data_url,
)

router = APIRouter(
    prefix="/api/whatsapp/images",
    tags=["WhatsApp Pictures"],
    dependencies=[Depends(get_current_user)],
)


class ImageCreate(BaseModel):
    category: str = "General"
    label: str = ""
    data_url: str = Field(..., description="The picture to send, as a JPEG/PNG data URL")
    thumb_url: str = Field(..., description="A small preview of it, as a JPEG/PNG data URL")


class ImageUpdate(BaseModel):
    category: Optional[str] = None
    label: Optional[str] = None
    data_url: Optional[str] = None   # send together with thumb_url to replace the picture itself
    thumb_url: Optional[str] = None


def _meta(img: MessageImage) -> dict:
    return {
        "id": img.id,
        "uid": img.uid,
        "category": img.category,
        "label": img.label,
        "size": img.size,
        "thumb": img.thumb,
        "updated_at": img.updated_at.isoformat() if img.updated_at else None,
    }


def _owned_or_404(db: Session, image_id: int, user) -> MessageImage:
    img = db.query(MessageImage).filter(MessageImage.id == image_id, MessageImage.owner_id == user.id).first()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Picture not found")
    return img


@router.get("")
def list_images(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """The signed-in account's pictures (newest first inside each category) and the categories available."""
    try:
        from app.services.chat_durability import restore_images_for_user
        restore_images_for_user(db, current_user)  # after a restart, bring the pictures back from MongoDB
    except Exception:
        pass
    rows = (
        db.query(MessageImage)
        .filter(MessageImage.owner_id == current_user.id)
        .order_by(MessageImage.category.asc(), MessageImage.updated_at.desc())
        .all()
    )
    return {"categories": IMAGE_CATEGORIES, "limit": MAX_IMAGES_PER_ACCOUNT, "images": [_meta(i) for i in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
def add_image(payload: ImageCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    count = db.query(MessageImage).filter(MessageImage.owner_id == current_user.id).count()
    if count >= MAX_IMAGES_PER_ACCOUNT:
        raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_IMAGES_PER_ACCOUNT} pictures. Delete one to add another.")
    mime, raw = decode_data_url(payload.data_url, MAX_IMAGE_BYTES, "picture")
    decode_data_url(payload.thumb_url, MAX_THUMB_BYTES, "preview")
    img = MessageImage(
        uid=uuid.uuid4().hex,
        owner_id=current_user.id,
        category=clean_category(payload.category),
        label=clean_label(payload.label) or "My picture",
        mime=mime,
        size=len(raw),
        data=raw,
        thumb=payload.thumb_url.strip(),
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return _meta(img)


@router.put("/{image_id}")
def change_image(image_id: int, payload: ImageUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Rename it, move it to another category, and/or replace the picture itself."""
    img = _owned_or_404(db, image_id, current_user)
    if payload.category is not None:
        img.category = clean_category(payload.category)
    if payload.label is not None:
        img.label = clean_label(payload.label) or img.label
    if payload.data_url is not None or payload.thumb_url is not None:
        if not (payload.data_url and payload.thumb_url):
            raise HTTPException(status_code=400, detail="Send the picture and its preview together.")
        mime, raw = decode_data_url(payload.data_url, MAX_IMAGE_BYTES, "picture")
        decode_data_url(payload.thumb_url, MAX_THUMB_BYTES, "preview")
        img.mime, img.size, img.data, img.thumb = mime, len(raw), raw, payload.thumb_url.strip()
    db.commit()
    db.refresh(img)
    return _meta(img)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(image_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    img = _owned_or_404(db, image_id, current_user)
    db.delete(img)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
