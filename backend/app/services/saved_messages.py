"""
The message text each account last wrote for each message type, kept until the account changes it again.

Stored in MongoDB (so it survives restarts and redeploys, and follows the account to any device), under the owner's
e-mail address and the message type. If MongoDB is not configured the text is kept in memory for as long as the server
runs, so the feature still works but is lost on a restart. Saving a new text always replaces the previous one.
"""
import re
from datetime import datetime
from typing import Dict

from app.services import chat_durability

COLL = "whatsapp_saved_messages"
MAX_LENGTH = 4000
_TEMPLATE_ID = re.compile(r"^[A-Za-z0-9_\-]{1,60}$")

_memory: Dict[str, str] = {}      # fallback when MongoDB is not available: "email|template" -> text


def valid_template_id(template_id: str) -> bool:
    return bool(_TEMPLATE_ID.match(template_id or ""))


def _email(email: str) -> str:
    return (email or "").strip().lower()


def _key(email: str, template_id: str) -> str:
    return f"{_email(email)}|{template_id}"


def get_all(email: str) -> Dict[str, str]:
    """{template_id: text} for this account."""
    result: Dict[str, str] = {}
    prefix = f"{_email(email)}|"
    for key, text in _memory.items():
        if key.startswith(prefix):
            result[key[len(prefix):]] = text
    mdb = chat_durability._db()
    if mdb is not None:
        try:
            for doc in mdb[COLL].find({"owner_email": _email(email)}):
                if doc.get("text"):
                    result[doc["template_id"]] = doc["text"]
        except Exception as err:  # never break the page because of MongoDB
            chat_durability._warn(f"[saved_messages] could not read from MongoDB: {err}")
    return result


def save(email: str, template_id: str, text: str) -> None:
    """Replace the saved text for this message type (an empty text clears it)."""
    text = (text or "")[:MAX_LENGTH]
    if not text.strip():
        delete(email, template_id)
        return
    _memory[_key(email, template_id)] = text
    mdb = chat_durability._db()
    if mdb is not None:
        try:
            mdb[COLL].update_one(
                {"_id": _key(email, template_id)},
                {"$set": {"owner_email": _email(email), "template_id": template_id, "text": text, "updated_at": datetime.utcnow()}},
                upsert=True,
            )
        except Exception as err:
            chat_durability._warn(f"[saved_messages] could not save to MongoDB: {err}")


def delete(email: str, template_id: str) -> None:
    _memory.pop(_key(email, template_id), None)
    mdb = chat_durability._db()
    if mdb is not None:
        try:
            mdb[COLL].delete_one({"_id": _key(email, template_id)})
        except Exception as err:
            chat_durability._warn(f"[saved_messages] could not delete from MongoDB: {err}")
