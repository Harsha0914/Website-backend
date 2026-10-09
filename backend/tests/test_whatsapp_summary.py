"""The WhatsApp activity summary: Indian days, own chats only, honest counts."""
from datetime import datetime

from app.auth.jwt import create_access_token
from app.models.user import User, UserRole
from app.models.whatsapp import (
    WhatsAppConversation, WhatsAppDirection, WhatsAppMessage, WhatsAppSenderType,
)
from app.services.whatsapp_summary import build_summary
from app.utils.security import hash_password

# 15:30 in India on 9 Oct 2026
NOW = datetime(2026, 10, 9, 10, 0, 0)


def _user(db, name, email):
    u = User(full_name=name, email=email, password_hash=hash_password("Password123"), role=UserRole.USER, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _chat(db, owner, phone, name="Shop"):
    c = WhatsAppConversation(owner_id=owner.id, phone_number=phone, shop_name=name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _msg(db, conv, direction, status, when, body="x"):
    db.add(WhatsAppMessage(
        conversation_id=conv.id, direction=direction, status=status, created_at=when, message_body=body,
        sender_type=WhatsAppSenderType.AI_BOT if direction == WhatsAppDirection.OUTBOUND else WhatsAppSenderType.CUSTOMER,
        sender_name="n"))
    db.commit()


OUT, IN = WhatsAppDirection.OUTBOUND, WhatsAppDirection.INBOUND


def test_days_follow_indian_midnight_not_utc(db_session):
    me = _user(db_session, "Me", "me@example.test")
    shop_a = _chat(db_session, me, "919000000001")
    shop_b = _chat(db_session, me, "919000000002")
    # 00:30 IST on 9 Oct (= 19:00 UTC on 8 Oct): TODAY in India
    _msg(db_session, shop_a, OUT, "sent", datetime(2026, 10, 8, 19, 0))
    # 23:30 IST on 8 Oct (= 18:00 UTC on 8 Oct): YESTERDAY in India
    _msg(db_session, shop_b, OUT, "sent", datetime(2026, 10, 8, 18, 0))

    p = build_summary(db_session, me.id, NOW)["periods"]
    assert p["today"]["sent"] == 1 and p["today"]["contacted"] == 1
    assert p["yesterday"]["sent"] == 1 and p["yesterday"]["contacted"] == 1
    assert p["last_7_days"]["sent"] == 2 and p["last_30_days"]["contacted"] == 2


def test_counts_are_honest_and_replies_are_per_shop(db_session):
    me = _user(db_session, "Me", "me@example.test")
    a = _chat(db_session, me, "919000000001")
    b = _chat(db_session, me, "919000000002")
    _msg(db_session, a, OUT, "sent", datetime(2026, 10, 9, 5, 0))
    _msg(db_session, b, OUT, "failed", datetime(2026, 10, 9, 5, 1))
    _msg(db_session, b, OUT, "simulated", datetime(2026, 10, 9, 5, 2))
    _msg(db_session, a, IN, "received", datetime(2026, 10, 9, 6, 0))
    _msg(db_session, a, IN, "received", datetime(2026, 10, 9, 6, 5))

    t = build_summary(db_session, me.id, NOW)["periods"]["today"]
    assert t == {"sent": 1, "contacted": 1, "replies": 2, "replied": 1, "failed": 1, "not_sent": 1, "reply_rate": 100}


def test_a_shop_is_contacted_only_once_even_if_messaged_again(db_session):
    me = _user(db_session, "Me", "me@example.test")
    a = _chat(db_session, me, "919000000001")
    _msg(db_session, a, OUT, "sent", datetime(2026, 10, 8, 5, 0))   # yesterday: first contact
    _msg(db_session, a, OUT, "sent", datetime(2026, 10, 9, 5, 0))   # today: a follow-up, not a new contact
    p = build_summary(db_session, me.id, NOW)["periods"]
    assert p["yesterday"]["contacted"] == 1 and p["today"]["contacted"] == 0 and p["today"]["sent"] == 1


def test_chart_has_seven_indian_days_oldest_first(db_session):
    me = _user(db_session, "Me", "me@example.test")
    a = _chat(db_session, me, "919000000001")
    _msg(db_session, a, OUT, "sent", datetime(2026, 10, 9, 5, 0))
    daily = build_summary(db_session, me.id, NOW)["daily"]
    assert [d["date"] for d in daily] == ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]
    assert daily[-1]["sent"] == 1 and sum(d["sent"] for d in daily[:-1]) == 0


def test_only_your_own_chats_are_counted(client, db_session):
    alice = _user(db_session, "Alice", "alice@example.test")
    bob = _user(db_session, "Bob", "bob@example.test")
    _msg(db_session, _chat(db_session, alice, "919000000001"), OUT, "sent", datetime.utcnow())

    hdr = lambda u: {"Authorization": f"Bearer {create_access_token(u.id)}"}  # noqa: E731
    mine = client.get("/api/whatsapp/summary", headers=hdr(alice)).json()
    theirs = client.get("/api/whatsapp/summary", headers=hdr(bob)).json()
    assert mine["chats"] == 1 and mine["periods"]["last_30_days"]["sent"] == 1
    assert theirs["chats"] == 0 and theirs["periods"]["last_30_days"]["sent"] == 0
    assert client.get("/api/whatsapp/summary").status_code in (401, 403)


def test_day_detail_lists_the_chats_active_on_that_indian_day(client, db_session):
    me = _user(db_session, "Me", "me@example.test")
    a = _chat(db_session, me, "919000000001", "Shop A")
    b = _chat(db_session, me, "919000000002", "Shop B")
    c = _chat(db_session, me, "919000000003", "Shop C")
    _msg(db_session, a, OUT, "sent", datetime(2026, 10, 8, 19, 0))     # 00:30 IST on 9 Oct
    _msg(db_session, a, IN, "received", datetime(2026, 10, 9, 3, 0))   # 08:30 IST on 9 Oct
    _msg(db_session, b, OUT, "failed", datetime(2026, 10, 9, 5, 0))    # 10:30 IST on 9 Oct
    _msg(db_session, c, OUT, "sent", datetime(2026, 10, 8, 18, 0))     # 23:30 IST on 8 Oct: another day

    hdr = {"Authorization": f"Bearer {create_access_token(me.id)}"}
    nine = client.get("/api/whatsapp/day?date=2026-10-09", headers=hdr).json()
    assert nine["chat_count"] == 2 and {x["shop_name"] for x in nine["chats"]} == {"Shop A", "Shop B"}
    assert (nine["sent"], nine["received"], nine["failed"]) == (1, 1, 1)
    eight = client.get("/api/whatsapp/day?date=2026-10-08", headers=hdr).json()
    assert [x["shop_name"] for x in eight["chats"]] == ["Shop C"]
    assert client.get("/api/whatsapp/day?date=2026-10-01", headers=hdr).json()["chats"] == []


def test_day_detail_is_private_and_validates_the_date(client, db_session):
    alice = _user(db_session, "Alice", "alice@example.test")
    bob = _user(db_session, "Bob", "bob@example.test")
    _msg(db_session, _chat(db_session, alice, "919000000001"), OUT, "sent", datetime(2026, 10, 9, 5, 0))
    hdr = lambda u: {"Authorization": f"Bearer {create_access_token(u.id)}"}  # noqa: E731

    assert client.get("/api/whatsapp/day?date=2026-10-09", headers=hdr(alice)).json()["chat_count"] == 1
    assert client.get("/api/whatsapp/day?date=2026-10-09", headers=hdr(bob)).json()["chat_count"] == 0
    assert client.get("/api/whatsapp/day?date=not-a-date", headers=hdr(alice)).status_code == 400
    assert client.get("/api/whatsapp/day?date=2026-10-09").status_code in (401, 403)
