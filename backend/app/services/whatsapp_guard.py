"""
Safety layer shared by every WhatsApp send path (broadcast, AI reply, manual reply)
and by the webhook receiver.

Everything that can put a message on the wire should go through ``can_message``;
everything an LLM writes should go through ``sanitize_ai_reply``; every inbound
webhook should pass ``verify_meta_signature``.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional, Tuple
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.config import settings
from app.models.whatsapp import (
    WhatsAppConversation,
    WhatsAppDirection,
    WhatsAppMessage,
)

OPT_OUT_FOOTER = "Reply STOP to opt out."
OPT_OUT_CONFIRMATION = (
    "No problem at all. You have been removed from our list and we won't message "
    "this number again. Have a great day!"
)

class SendBlocked(Exception):
    """Raised when the send gate refuses a message (opt-out, invalid number, daily cap)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# Statuses that count as "really left our system" for caps and cooldowns.
_DELIVERED_STATUSES = ("sent", "delivered", "read")


# ── Phone helpers ────────────────────────────────────────────────────────────
def digits_only(phone: Optional[str]) -> str:
    return "".join(c for c in str(phone or "") if c.isdigit())


def phone_key(phone: Optional[str]) -> str:
    """Last 10 digits: the stable identity of a phone regardless of country-code formatting."""
    return digits_only(phone)[-10:]


def is_valid_phone(phone: Optional[str]) -> bool:
    """True only for plausible real mobile numbers. Never message anything else."""
    d = digits_only(phone)
    if len(d) == 10:
        return bool(re.fullmatch(r"[6-9]\d{9}", d))
    if d.startswith("91") and len(d) == 12:
        return bool(re.fullmatch(r"91[6-9]\d{9}", d))
    if 11 <= len(d) <= 15 and not d.startswith("0"):
        # Non-Indian international number: accept, but reject obvious junk.
        return len(set(d)) > 3 and not d.startswith("91")
    return False


# ── Send gate ────────────────────────────────────────────────────────────────
_ANY_OWNER = object()


def find_conversation_by_phone(db: Session, phone: str, owner_id=_ANY_OWNER) -> Optional[WhatsAppConversation]:
    """
    The conversation for a phone number. Pass owner_id to look only inside ONE account's chats (the
    normal case: an account must never see another account's chat). Without it the search spans all
    accounts, which is only for the global opt-out check.
    """
    key = phone_key(phone)
    if len(key) < 10:
        return None
    query = db.query(WhatsAppConversation).filter(WhatsAppConversation.phone_number.like(f"%{key}"))
    if owner_id is not _ANY_OWNER:
        query = query.filter(WhatsAppConversation.owner_id == owner_id)
    return query.first()


def is_opted_out(db: Session, phone: str) -> bool:
    """A shop that said STOP is blocked for EVERY account (that is the shop's right, and it is not shown to anyone)."""
    key = phone_key(phone)
    if len(key) < 10:
        return False
    return (
        db.query(WhatsAppConversation.id)
        .filter(
            WhatsAppConversation.phone_number.like(f"%{key}"),
            (WhatsAppConversation.opt_out == True) | (WhatsAppConversation.lead_status == "DO_NOT_CONTACT"),  # noqa: E712
        )
        .first()
        is not None
    )


def outbound_count_last_24h(db: Session) -> int:
    since = datetime.utcnow() - timedelta(hours=24)
    return (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.direction == WhatsAppDirection.OUTBOUND,
            WhatsAppMessage.status.in_(_DELIVERED_STATUSES),
            WhatsAppMessage.created_at >= since,
        )
        .count()
    )


_IST_OFFSET = timedelta(hours=5, minutes=30)


def ist_day_start_utc(now: Optional[datetime] = None) -> datetime:
    """The start of today in India (midnight IST) as a naive UTC time, which is how the database stores times."""
    now = now or datetime.utcnow()
    ist_now = now + _IST_OFFSET
    return ist_now.replace(hour=0, minute=0, second=0, microsecond=0) - _IST_OFFSET


def _contacts_today(db: Session, owner_id=None) -> set:
    """
    The contacts (phone numbers) messaged since midnight IST. A contact counts ONCE however many messages go to it,
    and however many accounts message it. Pass owner_id to look at one account's contacts only.
    """
    query = (
        db.query(WhatsAppConversation.phone_number)
        .join(WhatsAppMessage, WhatsAppConversation.id == WhatsAppMessage.conversation_id)
        .filter(
            WhatsAppMessage.direction == WhatsAppDirection.OUTBOUND,
            WhatsAppMessage.status.in_(_DELIVERED_STATUSES),
            WhatsAppMessage.created_at >= ist_day_start_utc(),
        )
    )
    if owner_id is not None:
        query = query.filter(WhatsAppConversation.owner_id == owner_id)
    return {phone_key(row[0]) for row in query.distinct().all() if phone_key(row[0])}


def outbound_count_today(db: Session, owner_id: int) -> int:
    """Contacts ONE account has messaged since midnight IST."""
    return len(_contacts_today(db, owner_id))


def _restore_every_account(db: Session) -> None:
    """After a redeploy the SQL database starts empty: bring every account's chats back from MongoDB first (once per account per process)."""
    try:
        from app.models.user import User
        from app.services.chat_durability import restore_for_user
        for user in db.query(User).all():
            restore_for_user(db, user)
    except Exception:  # a MongoDB problem must never stop the count
        pass


def outbound_count_today_all(db: Session) -> int:
    """
    Contacts messaged today (Indian day) by EVERY account together: the one shared counter the daily limit is checked
    against. Each contact counts once, no matter how many messages were sent to it or by which account.
    """
    _restore_every_account(db)
    return len(_contacts_today(db))


def daily_limit_status(db: Session, owner_id: Optional[int] = None) -> dict:
    """
    The SHARED daily limit, counted in contacts: {limit, warn_at, sent_today, remaining, reached, resets_at, my_sent_today}.
    sent_today / remaining / reached cover all accounts together; my_sent_today is the calling account's own share.
    """
    from app.services.app_limits import daily_limit as _limit, warn_at as _warn
    limit = _limit()
    sent = outbound_count_today_all(db)
    return {
        "limit": limit,
        "warn_at": _warn(),
        "sent_today": sent,
        "remaining": max(0, limit - sent) if limit > 0 else None,
        "reached": bool(limit > 0 and sent >= limit),
        "resets_at": (ist_day_start_utc() + timedelta(days=1)).isoformat(),
        "my_sent_today": outbound_count_today(db, owner_id) if owner_id is not None else None,
    }


def can_message(
    db: Session,
    phone: Optional[str],
    *,
    owner_id=_ANY_OWNER,
    check_cooldown: bool = False,
    batch_sent_so_far: int = 0,
) -> Tuple[bool, Optional[str]]:
    """
    Single gate for outbound WhatsApp. Returns (allowed, reason_if_blocked).

    check_cooldown: also refuse numbers that already received an outbound message
                    inside WHATSAPP_REPEAT_COOLDOWN_DAYS (used for cold broadcasts).
    batch_sent_so_far: messages already sent by the calling batch but possibly not
                       yet committed, so the daily cap stays accurate inside a loop.
    """
    if not is_valid_phone(phone):
        return False, "invalid_phone"

    if is_opted_out(db, phone):
        return False, "opted_out"

    from app.services.app_limits import daily_limit as _limit
    cap = _limit()
    if cap > 0:
        # One limit shared by every account, per Indian day, counted in CONTACTS. A contact already messaged today is
        # never blocked (it is already counted), only a new contact is once the limit is used up.
        _restore_every_account(db)
        contacts = _contacts_today(db)
        if phone_key(phone) not in contacts and len(contacts) + batch_sent_so_far >= cap:
            return False, "daily_limit_reached"

    if check_cooldown:
        days = int(settings.WHATSAPP_REPEAT_COOLDOWN_DAYS or 0)
        key = phone_key(phone)
        if days > 0 and len(key) == 10:
            since = datetime.utcnow() - timedelta(days=days)
            q = (
                db.query(WhatsAppMessage.id)
                .join(WhatsAppConversation, WhatsAppConversation.id == WhatsAppMessage.conversation_id)
                .filter(
                    WhatsAppConversation.phone_number.like(f"%{key}"),
                    WhatsAppMessage.direction == WhatsAppDirection.OUTBOUND,
                    WhatsAppMessage.status.in_(_DELIVERED_STATUSES),
                    WhatsAppMessage.created_at >= since,
                )
            )
            # shared by all accounts, and the same rule as the "Contacted" list on the results page: a message from ANY
            # account to this number inside the window counts, so two accounts never contact the same shop twice
            _restore_every_account(db)
            if q.first():
                return False, "recently_contacted"

    return True, None


def ensure_opt_out_footer(text: str) -> str:
    """Cold outreach must always tell the recipient how to stop it."""
    if re.search(r"\bstop\b", text or "", re.I):
        return text
    return f"{text.rstrip()}\n\n{OPT_OUT_FOOTER}"


def delivery_status(ok: bool, raw: Any = None) -> str:
    """Truthful message status: 'sent', 'simulated' (test mode / no creds) or 'failed'."""
    if not ok:
        return "failed"
    if isinstance(raw, dict) and raw.get("mode") == "simulator":
        return "simulated"
    return "sent"


# ── Webhook authenticity ─────────────────────────────────────────────────────
def verify_meta_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """
    Validate Meta's X-Hub-Signature-256 header.

    With no WHATSAPP_APP_SECRET configured, unsigned webhooks are rejected unless
    WHATSAPP_ALLOW_UNSIGNED_WEBHOOK is explicitly enabled (local development only).
    """
    secret = (settings.WHATSAPP_APP_SECRET or "").strip()
    if not secret:
        return bool(settings.WHATSAPP_ALLOW_UNSIGNED_WEBHOOK)
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.split("=", 1)[1].strip())


# ── LLM output validation ────────────────────────────────────────────────────
MAX_REPLY_CHARS = 700

_URL_RE = re.compile(r"(https?://[^\s)>\]]+|\bwww\.[^\s)>\]]+)", re.I)
_UPI_RE = re.compile(r"\b[\w.\-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl|sbi|hdfcbank|icici|axisbank)\b", re.I)
_BANK_RE = re.compile(r"\b(?:ifsc|a/c|acc(?:oun)?t\s*(?:no|number)?)\b[^\n]{0,40}\d{6,}", re.I)
_PCT_DISCOUNT_RE = re.compile(r"\b\d{1,3}\s*%\s*(?:off|discount|cashback)|\b(?:flat|upto|up to)\s*\d{1,3}\s*%", re.I)
_AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+)", re.I)
_LEAK_RE = re.compile(r"(system prompt|master prompt|my instructions|ignore (?:all |previous )?instructions)", re.I)


def _host_allowed(url: str, allowed_hosts: Iterable[str]) -> bool:
    raw = url if url.lower().startswith("http") else f"https://{url}"
    host = (urlparse(raw).netloc or "").lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return any(host == h or host.endswith("." + h) for h in allowed_hosts)


def sanitize_ai_reply(
    text: Optional[str],
    allowed_hosts: Iterable[str] = (),
    allowed_amounts: Iterable[str] = (),
) -> Tuple[Optional[str], Optional[str]]:
    """
    Validate LLM output before it is sent to a real person.
    Returns (clean_text, None) when safe, or (None, reason) when the reply must be
    discarded and replaced by a safe fallback / human handoff.
    """
    t = (text or "").strip().strip('"').strip()
    if not t:
        return None, "empty"

    if _LEAK_RE.search(t):
        return None, "prompt_leak"
    if _UPI_RE.search(t) or _BANK_RE.search(t):
        return None, "payment_details"
    if _PCT_DISCOUNT_RE.search(t):
        return None, "invented_discount"

    allowed_hosts = [h.lower().removeprefix("www.") for h in allowed_hosts if h]
    for url in _URL_RE.findall(t):
        if not _host_allowed(url, allowed_hosts):
            return None, "unapproved_link"

    allowed = {re.sub(r"\D", "", a) for a in allowed_amounts if a}
    for amt in _AMOUNT_RE.findall(t):
        if re.sub(r"\D", "", amt) not in allowed:
            return None, "unverified_price"

    if len(t) > MAX_REPLY_CHARS:
        cut = t[:MAX_REPLY_CHARS]
        # trim to the last sentence boundary so we never send half a sentence
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "), cut.rfind("\n"))
        t = cut[: end + 1].strip() if end > 200 else cut.rstrip() + "…"
    return t, None
