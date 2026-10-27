"""
The shared daily limit (contacts per Indian day, all accounts together), which an administrator can change from the
Message Counts page. The value is kept in MongoDB (so it survives a redeploy) and cached in memory for a few seconds;
when nobody has set one, the WHATSAPP_DAILY_SEND_LIMIT / WHATSAPP_DAILY_WARNING_AT settings apply.
"""
import time
from typing import Any, Dict, Optional

from app.config import settings

_COLL = "app_settings"
_ID = "daily_limit"
_cache: Dict[str, Any] = {"at": 0.0, "doc": None}
_memory_doc: Optional[Dict[str, Any]] = None      # used when MongoDB is not available (lasts until the next restart)


def _mongo():
    try:
        from app.mongodb import get_mongo_db
        return get_mongo_db()
    except Exception:
        return None


def _stored() -> Optional[Dict[str, Any]]:
    now = time.time()
    if now - _cache["at"] < 5:
        return _cache["doc"]
    doc = _memory_doc
    mdb = _mongo()
    if mdb is not None:
        try:
            found = mdb[_COLL].find_one({"_id": _ID})
            if found:
                doc = found
        except Exception:
            pass
    _cache.update(at=now, doc=doc)
    return doc


def daily_limit() -> int:
    doc = _stored()
    if doc and isinstance(doc.get("limit"), int) and doc["limit"] >= 0:
        return doc["limit"]
    return int(settings.WHATSAPP_DAILY_SEND_LIMIT or 0)


def warn_at() -> int:
    doc = _stored()
    if doc and isinstance(doc.get("warn_at"), int) and doc["warn_at"] >= 0:
        return doc["warn_at"]
    return int(settings.WHATSAPP_DAILY_WARNING_AT or 0)


def limit_info() -> Dict[str, Any]:
    doc = _stored()
    return {"limit": daily_limit(), "warn_at": warn_at(), "source": "admin" if doc else "default",
            "updated_by": (doc or {}).get("updated_by"), "updated_at": (doc or {}).get("updated_at")}


def set_limit(limit: int, warn: Optional[int], updated_by: str = "") -> Dict[str, Any]:
    """Save a new limit. Returns {persisted: bool, ...}; persisted is False when MongoDB is missing (kept only until restart)."""
    global _memory_doc
    limit = int(limit)
    warn = int(warn) if warn is not None else limit // 2
    warn = max(0, min(warn, limit))
    doc = {"_id": _ID, "limit": limit, "warn_at": warn, "updated_by": updated_by, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    _memory_doc = doc
    persisted = False
    mdb = _mongo()
    if mdb is not None:
        try:
            mdb[_COLL].replace_one({"_id": _ID}, doc, upsert=True)
            persisted = True
        except Exception:
            persisted = False
    _cache.update(at=0.0, doc=None)
    return {**limit_info(), "persisted": persisted}
