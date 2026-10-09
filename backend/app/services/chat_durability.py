"""
Keep WhatsApp chats safe across restarts and redeploys by mirroring them into MongoDB.

Why: on a host whose disk is reset at every deploy (Render's free plan) the SQL database is rebuilt from the
bundled file each time, so chats created since would vanish. MongoDB is already connected (it holds the user
accounts), so every conversation and message is copied there as it is saved, and an account's chats are
restored from it the first time that account opens its chat list after a restart.

Rules:
  * It can never break the app: every MongoDB call is wrapped; if MongoDB is not configured or is down the app
    simply behaves as before.
  * Chats are stored under the owner's e-mail address (user ids change when accounts are re-created), and are
    only ever restored to the account with that same e-mail, so privacy is preserved.
  * Writes happen on a background thread, after the SQL transaction commits, so sending is never slowed down.
"""
import hashlib
import logging
import queue
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# pyrefly: ignore [missing-import]
from sqlalchemy import event
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.models.message_image import MessageImage
from app.models.user import User
from app.models.whatsapp import (
    WhatsAppConversation,
    WhatsAppDirection,
    WhatsAppMessage,
    WhatsAppSenderType,
)

logger = logging.getLogger("chat_durability")

CONV_COLL = "whatsapp_chat_conversations"
MSG_COLL = "whatsapp_chat_messages"
IMG_COLL = "whatsapp_message_images"

CONV_FIELDS = [
    "phone_number", "shop_name", "owner_name", "auto_ai_enabled", "lead_status", "lead_score",
    "detected_intent", "sentiment", "priority", "conversation_status", "unread_count", "human_takeover",
    "follow_up_date", "follow_up_note", "opt_out", "business_details_extracted",
    "last_message_at", "created_at", "updated_at",
]
MSG_FIELDS = [
    "sender_name", "message_body", "intent", "confidence_score", "ai_generated", "tokens_used", "status",
    "is_read", "external_message_id", "created_at",
]

_PENDING = "chat_durability_pending"
_SKIP = "chat_durability_skip"

RUN_SYNC = False  # tests set this so mirroring happens immediately instead of on the worker thread

_queue: "queue.Queue[Tuple[str, str, str, Optional[dict]]]" = queue.Queue(maxsize=20000)
_worker_started = False
_worker_lock = threading.Lock()
_email_cache: Dict[int, str] = {}
_restored_users: set = set()
_restored_image_users: set = set()
_last_warning = 0.0


# ─── MongoDB access (patched in tests) ───────────────────────────────────────
_db_cache: Tuple[float, Any] = (0.0, None)


def _db():
    """The MongoDB database, or None. The answer is cached for 30 s so a busy chat never pings MongoDB per message."""
    global _db_cache
    now = time.time()
    if now - _db_cache[0] < 30:
        return _db_cache[1]
    handle = None
    try:
        from app.mongodb import get_mongo_db
        handle = get_mongo_db()
    except Exception:
        handle = None
    _db_cache = (now, handle)
    return handle


def _warn(msg: str) -> None:
    global _last_warning
    if time.time() - _last_warning > 60:
        _last_warning = time.time()
        logger.warning(msg)


# ─── keys and documents ──────────────────────────────────────────────────────
def _ms(dt: Optional[datetime]) -> Optional[datetime]:
    """MongoDB keeps milliseconds only; use the same precision everywhere so keys always match."""
    return dt.replace(microsecond=(dt.microsecond // 1000) * 1000) if dt else dt


def conv_key(email: str, phone: str) -> str:
    return f"{(email or '').strip().lower()}|{phone}"


def message_uid(key: str, direction: str, created_at: Optional[datetime], body: str) -> str:
    raw = f"{key}|{direction}|{_ms(created_at).isoformat() if created_at else ''}|{body or ''}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _email_for(session: Session, owner_id: Optional[int]) -> Optional[str]:
    if not owner_id:
        return None
    if owner_id in _email_cache:
        return _email_cache[owner_id]
    with session.no_autoflush:
        email = session.query(User.email).filter(User.id == owner_id).scalar()
    if email:
        _email_cache[owner_id] = email.strip().lower()
        return _email_cache[owner_id]
    return None


def _conv_doc(conv: WhatsAppConversation, email: str) -> Tuple[str, dict]:
    key = conv_key(email, conv.phone_number)
    doc = {f: getattr(conv, f) for f in CONV_FIELDS}
    for f in ("follow_up_date", "last_message_at", "created_at", "updated_at"):
        doc[f] = _ms(doc[f])
    doc["_id"] = key
    doc["owner_email"] = email
    return key, doc


def _image_doc(img: MessageImage, email: str) -> dict:
    return {
        "_id": f"{email}|{img.uid}", "owner_email": email, "uid": img.uid, "category": img.category,
        "label": img.label, "mime": img.mime, "size": img.size, "data": bytes(img.data), "thumb": img.thumb,
        "created_at": _ms(img.created_at), "updated_at": _ms(img.updated_at),
    }


def _msg_doc(msg: WhatsAppMessage, key: str) -> Tuple[str, dict]:
    direction = _enum_value(msg.direction)
    uid = message_uid(key, direction, msg.created_at, msg.message_body)
    doc = {f: getattr(msg, f) for f in MSG_FIELDS}
    doc["created_at"] = _ms(doc["created_at"])
    doc.update({"_id": uid, "conv_key": key, "direction": direction, "sender_type": _enum_value(msg.sender_type)})
    return uid, doc


# ─── background writer ───────────────────────────────────────────────────────
def _apply(op: str, coll: str, _id: str, doc: Optional[dict]) -> None:
    mdb = _db()
    if mdb is None:
        return
    try:
        if op == "upsert":
            mdb[coll].replace_one({"_id": _id}, doc, upsert=True)
        elif op == "delete":
            mdb[coll].delete_one({"_id": _id})
        elif op == "delete_owner":
            mdb[CONV_COLL].delete_many({"owner_email": _id})
            mdb[MSG_COLL].delete_many({"conv_key": {"$regex": "^" + _re_escape(_id) + r"\|"}})
    except Exception as err:
        _warn(f"[chat_durability] could not save to MongoDB: {err}")


def _re_escape(text: str) -> str:
    import re
    return re.escape(text)


def _worker() -> None:
    while True:
        op, coll, _id, doc = _queue.get()
        try:
            _apply(op, coll, _id, doc)
        finally:
            _queue.task_done()


def _enqueue(item: Tuple[str, str, str, Optional[dict]]) -> None:
    global _worker_started
    if RUN_SYNC:
        _apply(*item)
        return
    if _db() is None and not _worker_started:
        return  # MongoDB is not configured: nothing to do
    with _worker_lock:
        if not _worker_started:
            threading.Thread(target=_worker, name="chat-durability", daemon=True).start()
            _worker_started = True
    try:
        _queue.put_nowait(item)
    except queue.Full:
        _warn("[chat_durability] queue full; some chats were not mirrored")


def flush(timeout: float = 5.0) -> None:
    """Wait until queued writes are done (tests and shutdown)."""
    end = time.time() + timeout
    while _queue.unfinished_tasks and time.time() < end:
        time.sleep(0.01)


# ─── capture changes while the SQL transaction runs ──────────────────────────
@event.listens_for(Session, "after_flush")
def _collect(session: Session, _ctx) -> None:
    if session.info.get(_SKIP):
        return
    pending: List[Tuple[str, str, str, Optional[dict]]] = session.info.setdefault(_PENDING, [])
    try:
        for obj in list(session.new) + list(session.dirty):
            if isinstance(obj, WhatsAppConversation) and obj.owner_id and obj.phone_number:
                email = _email_for(session, obj.owner_id)
                if email:
                    key, doc = _conv_doc(obj, email)
                    pending.append(("upsert", CONV_COLL, key, doc))
            elif isinstance(obj, WhatsAppMessage) and obj.conversation_id:
                conv = session.get(WhatsAppConversation, obj.conversation_id)
                email = _email_for(session, conv.owner_id) if conv else None
                if conv and email:
                    key = conv_key(email, conv.phone_number)
                    uid, doc = _msg_doc(obj, key)
                    pending.append(("upsert", MSG_COLL, uid, doc))
            elif isinstance(obj, MessageImage) and obj.owner_id and obj.uid:
                email = _email_for(session, obj.owner_id)
                if email:
                    pending.append(("upsert", IMG_COLL, f"{email}|{obj.uid}", _image_doc(obj, email)))
        for obj in list(session.deleted):
            if isinstance(obj, WhatsAppMessage) and obj.conversation_id:
                conv = session.get(WhatsAppConversation, obj.conversation_id)
                email = _email_for(session, conv.owner_id) if conv else None
                if conv and email:
                    key = conv_key(email, conv.phone_number)
                    pending.append(("delete", MSG_COLL, message_uid(key, _enum_value(obj.direction), obj.created_at, obj.message_body), None))
            elif isinstance(obj, WhatsAppConversation) and obj.owner_id:
                email = _email_for(session, obj.owner_id)
                if email:
                    pending.append(("delete", CONV_COLL, conv_key(email, obj.phone_number), None))
            elif isinstance(obj, MessageImage) and obj.owner_id and obj.uid:
                email = _email_for(session, obj.owner_id)
                if email:
                    pending.append(("delete", IMG_COLL, f"{email}|{obj.uid}", None))
    except Exception as err:  # never let mirroring break a save
        _warn(f"[chat_durability] could not prepare a chat for MongoDB: {err}")


@event.listens_for(Session, "after_commit")
def _publish(session: Session) -> None:
    pending = session.info.pop(_PENDING, None)
    for item in pending or []:
        _enqueue(item)


@event.listens_for(Session, "after_rollback")
def _discard(session: Session) -> None:
    session.info.pop(_PENDING, None)


def forget_owner(session: Session, owner_id: int) -> None:
    """An account deleted all of its WhatsApp history (bulk delete bypasses the change events)."""
    email = _email_for(session, owner_id)
    if email:
        _enqueue(("delete_owner", CONV_COLL, email, None))


# ─── restore ─────────────────────────────────────────────────────────────────
def restore_for_user(db: Session, user: User) -> int:
    """
    Bring this account's chats back from MongoDB after the SQL database was reset. Runs once per account per
    process, is safe to call on every request, and returns how many messages were restored.
    """
    if user is None or user.id in _restored_users:
        return 0
    mdb = _db()
    if mdb is None:
        return 0
    email = (user.email or "").strip().lower()

    # 1. Read from MongoDB first. A MongoDB problem here must never touch the SQL session.
    try:
        conv_docs = list(mdb[CONV_COLL].find({"owner_email": email}))
        msg_docs = {c["_id"]: list(mdb[MSG_COLL].find({"conv_key": c["_id"]})) for c in conv_docs}
    except Exception as err:
        _warn(f"[chat_durability] could not read chats from MongoDB: {err}")
        return 0
    _restored_users.add(user.id)
    if not conv_docs:
        return 0

    # 2. Write what is missing into the SQL database.
    restored = 0
    db.info[_SKIP] = True  # restoring must not echo the same data straight back to MongoDB
    try:
        for cdoc in conv_docs:
            conv = (
                db.query(WhatsAppConversation)
                .filter(WhatsAppConversation.owner_id == user.id, WhatsAppConversation.phone_number == cdoc["phone_number"])
                .first()
            )
            if conv is None:
                kwargs = {f: cdoc[f] for f in CONV_FIELDS if cdoc.get(f) is not None}
                conv = WhatsAppConversation(owner_id=user.id, **kwargs)
                db.add(conv)
                db.flush()
            key = cdoc["_id"]
            have = {
                message_uid(key, _enum_value(m.direction), m.created_at, m.message_body)
                for m in db.query(WhatsAppMessage).filter(WhatsAppMessage.conversation_id == conv.id).all()
            }
            for mdoc in msg_docs[key]:
                if mdoc["_id"] in have:
                    continue
                db.add(WhatsAppMessage(
                    conversation_id=conv.id,
                    direction=WhatsAppDirection(mdoc["direction"]),
                    sender_type=WhatsAppSenderType(mdoc["sender_type"]),
                    **{f: mdoc[f] for f in MSG_FIELDS if mdoc.get(f) is not None},
                ))
                restored += 1
        db.commit()
        if restored:
            logger.warning("[chat_durability] restored %s message(s) for account %s from MongoDB", restored, user.id)
    except Exception as err:
        db.rollback()
        _restored_users.discard(user.id)  # try again on the next request
        _warn(f"[chat_durability] restore failed: {err}")
        restored = 0
    finally:
        db.info.pop(_SKIP, None)
    return restored


def restore_images_for_user(db: Session, user: User) -> int:
    """Bring this account's picture library back from MongoDB after the SQL database was reset (once per process)."""
    if user is None or user.id in _restored_image_users:
        return 0
    mdb = _db()
    if mdb is None:
        return 0
    email = (user.email or "").strip().lower()
    try:
        docs = list(mdb[IMG_COLL].find({"owner_email": email}))
    except Exception as err:
        _warn(f"[chat_durability] could not read pictures from MongoDB: {err}")
        return 0
    _restored_image_users.add(user.id)
    if not docs:
        return 0
    restored = 0
    db.info[_SKIP] = True
    try:
        have = {r[0] for r in db.query(MessageImage.uid).filter(MessageImage.owner_id == user.id).all()}
        for d in docs:
            if d["uid"] in have:
                continue
            db.add(MessageImage(
                uid=d["uid"], owner_id=user.id, category=d.get("category") or "General", label=d.get("label") or "",
                mime=d.get("mime") or "image/jpeg", size=d.get("size") or len(d["data"]), data=bytes(d["data"]),
                thumb=d.get("thumb") or "",
            ))
            restored += 1
        db.commit()
    except Exception as err:
        db.rollback()
        _restored_image_users.discard(user.id)
        _warn(f"[chat_durability] picture restore failed: {err}")
        restored = 0
    finally:
        db.info.pop(_SKIP, None)
    return restored


# ─── one-time copy of everything already in the SQL database ─────────────────
def backfill_all(session_factory) -> int:
    """Copy all existing chats to MongoDB (idempotent). Called once at startup on a background thread."""
    if _db() is None:
        return 0
    copied = 0
    db = session_factory()
    try:
        users = {u.id: (u.email or "").strip().lower() for u in db.query(User).all()}
        convs = db.query(WhatsAppConversation).filter(WhatsAppConversation.owner_id.isnot(None)).all()
        for conv in convs:
            email = users.get(conv.owner_id)
            if not email:
                continue
            key, cdoc = _conv_doc(conv, email)
            _enqueue(("upsert", CONV_COLL, key, cdoc))
            for msg in db.query(WhatsAppMessage).filter(WhatsAppMessage.conversation_id == conv.id).all():
                uid, mdoc = _msg_doc(msg, key)
                _enqueue(("upsert", MSG_COLL, uid, mdoc))
                copied += 1
        for img in db.query(MessageImage).all():
            email = users.get(img.owner_id)
            if email:
                _enqueue(("upsert", IMG_COLL, f"{email}|{img.uid}", _image_doc(img, email)))
                copied += 1
    except Exception as err:
        _warn(f"[chat_durability] backfill failed: {err}")
    finally:
        db.close()
    return copied


def start_backfill(session_factory) -> None:
    threading.Thread(target=backfill_all, args=(session_factory,), name="chat-backfill", daemon=True).start()
