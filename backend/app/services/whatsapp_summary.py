"""
A simple picture of one account's WhatsApp activity: today, yesterday, the last 7 and 30 days, and a
day-by-day chart. Days are Indian days (midnight to midnight IST), and only the account's own chats count.
"""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.models.whatsapp import WhatsAppConversation, WhatsAppDirection, WhatsAppMessage

IST_OFFSET = timedelta(hours=5, minutes=30)
SENT_STATUSES = ("sent", "delivered", "read")


def _ist_midnight_utc(now_utc: datetime) -> datetime:
    """The most recent India midnight, expressed as a naive UTC time (that is how messages are stored)."""
    ist_now = now_utc + IST_OFFSET
    return ist_now.replace(hour=0, minute=0, second=0, microsecond=0) - IST_OFFSET


def build_summary(db: Session, owner_id: int, now_utc: Optional[datetime] = None) -> dict:
    now_utc = now_utc or datetime.utcnow()
    today_start = _ist_midnight_utc(now_utc)
    day = timedelta(days=1)

    windows = {
        "today": (today_start, today_start + day),
        "yesterday": (today_start - day, today_start),
        "last_7_days": (today_start - 6 * day, today_start + day),
        "last_30_days": (today_start - 29 * day, today_start + day),
    }

    conv_ids = [r[0] for r in db.query(WhatsAppConversation.id).filter(WhatsAppConversation.owner_id == owner_id).all()]
    rows = []
    first_contact: Dict[int, datetime] = {}
    if conv_ids:
        rows = (
            db.query(WhatsAppMessage.conversation_id, WhatsAppMessage.direction, WhatsAppMessage.status, WhatsAppMessage.created_at)
            .filter(WhatsAppMessage.conversation_id.in_(conv_ids))
            .all()
        )
        for conv_id, direction, status, created_at in rows:
            if direction == WhatsAppDirection.OUTBOUND and status in SENT_STATUSES and created_at:
                if conv_id not in first_contact or created_at < first_contact[conv_id]:
                    first_contact[conv_id] = created_at

    periods: Dict[str, Dict[str, int]] = {}
    for name, (start, end) in windows.items():
        sent = failed = not_sent = replies = 0
        replied_chats = set()
        for conv_id, direction, status, created_at in rows:
            if not created_at or not (start <= created_at < end):
                continue
            if direction == WhatsAppDirection.INBOUND:
                replies += 1
                replied_chats.add(conv_id)
            elif status in SENT_STATUSES:
                sent += 1
            elif status == "failed":
                failed += 1
            elif status == "simulated":
                not_sent += 1
        contacted = sum(1 for t in first_contact.values() if start <= t < end)
        periods[name] = {
            "sent": sent,
            "contacted": contacted,
            "replies": replies,
            "replied": len(replied_chats),
            "failed": failed,
            "not_sent": not_sent,
            "reply_rate": round(100 * len(replied_chats) / contacted) if contacted else 0,
        }

    per_day_sent: Dict[int, int] = defaultdict(int)
    per_day_received: Dict[int, int] = defaultdict(int)
    for _conv_id, direction, status, created_at in rows:
        if not created_at:
            continue
        index = int((created_at - (today_start - 6 * day)) // day)  # 0 = six days ago ... 6 = today
        if 0 <= index <= 6:
            if direction == WhatsAppDirection.INBOUND:
                per_day_received[index] += 1
            elif status in SENT_STATUSES:
                per_day_sent[index] += 1

    daily: List[dict] = []
    for i in range(7):
        start_utc = today_start - (6 - i) * day
        local_day = (start_utc + IST_OFFSET)
        daily.append({
            "date": local_day.strftime("%Y-%m-%d"),
            "label": local_day.strftime("%a %d %b"),
            "sent": per_day_sent[i],
            "received": per_day_received[i],
        })

    return {
        "timezone": "Asia/Kolkata",
        "chats": len(conv_ids),
        "periods": periods,
        "daily": daily,
    }
