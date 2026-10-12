"""
Messages sent by every account, counted separately, plus the total across all accounts (for the admin).

The numbers are always worked out from the saved messages, so they update by themselves the moment anyone sends:
each account's count is its own, and the total is exactly the sum of the accounts' counts (9 + 5 = 14).
Only messages that really left the system count (sent / delivered / read), the same rule as the daily limit.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List

# pyrefly: ignore [missing-import]
from sqlalchemy import case, distinct, func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.whatsapp import WhatsAppConversation, WhatsAppDirection, WhatsAppMessage
from app.services.whatsapp_guard import _DELIVERED_STATUSES, ist_day_start_utc


def usage_report(db: Session) -> Dict[str, Any]:
    # After a redeploy an account's chats are only back once it has been looked at: bring every account's back first.
    try:
        from app.services.chat_durability import restore_for_user
        for user in db.query(User).all():
            restore_for_user(db, user)
    except Exception:  # never let a MongoDB problem break the admin page
        pass

    today = ist_day_start_utc()
    week = today - timedelta(days=6)          # today and the 6 days before it (Indian days)
    limit = int(settings.WHATSAPP_DAILY_SEND_LIMIT or 0)

    rows = (
        db.query(
            WhatsAppConversation.owner_id,
            func.count(WhatsAppMessage.id),
            func.sum(case((WhatsAppMessage.created_at >= today, 1), else_=0)),
            func.sum(case((WhatsAppMessage.created_at >= week, 1), else_=0)),
            func.count(distinct(WhatsAppMessage.conversation_id)),
            func.max(WhatsAppMessage.created_at),
        )
        .join(WhatsAppConversation, WhatsAppConversation.id == WhatsAppMessage.conversation_id)
        .filter(
            WhatsAppConversation.owner_id.isnot(None),
            WhatsAppMessage.direction == WhatsAppDirection.OUTBOUND,
            WhatsAppMessage.status.in_(_DELIVERED_STATUSES),
        )
        .group_by(WhatsAppConversation.owner_id)
        .all()
    )
    by_owner = {r[0]: r for r in rows}

    accounts: List[Dict[str, Any]] = []
    shared_reached = bool(limit > 0 and sum(int(r[2] or 0) for r in rows) >= limit)   # the limit is shared by all accounts
    for user in db.query(User).order_by(User.id).all():
        r = by_owner.get(user.id)
        all_time, sent_today, sent_week, shops, last = (int(r[1]), int(r[2] or 0), int(r[3] or 0), int(r[4]), r[5]) if r else (0, 0, 0, 0, None)
        accounts.append({
            "id": user.id,
            "name": user.full_name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_active": bool(user.is_active),
            "sent_today": sent_today,
            "sent_7_days": sent_week,
            "sent_all_time": all_time,
            "shops_contacted": shops,
            "last_sent_at": last.isoformat() if last else None,
            "daily_limit": limit,
            "limit_reached": shared_reached,
        })
    accounts.sort(key=lambda a: (-a["sent_today"], -a["sent_all_time"], a["name"].lower()))

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "daily_limit": limit,
        "totals": {
            # the total is the sum of the accounts, so it always matches the rows beneath it
            "sent_today": sum(a["sent_today"] for a in accounts),
            "sent_7_days": sum(a["sent_7_days"] for a in accounts),
            "sent_all_time": sum(a["sent_all_time"] for a in accounts),
            "accounts_total": len(accounts),
            "accounts_sent_today": sum(1 for a in accounts if a["sent_today"] > 0),
            "accounts_at_limit": sum(1 for a in accounts if a["limit_reached"]),
        },
        "accounts": accounts,
    }
