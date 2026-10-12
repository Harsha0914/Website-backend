"""
Chats, messages, contacts and sending history are private to the account that created them.
Two ordinary users and an administrator must never see or change each other's WhatsApp data.
"""
import pytest

from app.auth.jwt import create_access_token
from app.models.user import User, UserRole
from app.models.whatsapp import WhatsAppConversation, WhatsAppMessage
from app.utils.security import hash_password

PHONE = "919876543210"


def _user(db, name, email, role=UserRole.USER):
    u = User(full_name=name, email=email, password_hash=hash_password("Password123"), role=role, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _hdr(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def alice(db_session):
    return _user(db_session, "Alice", "alice@example.test")


@pytest.fixture
def bob(db_session):
    return _user(db_session, "Bob", "bob@example.test")


@pytest.fixture
def boss(db_session):
    return _user(db_session, "Boss", "boss@example.test", UserRole.ADMIN)


def _pitch(client, user, text):
    """A message to a shop through the real broadcast route (no gateway credentials in tests)."""
    res = client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(user), json={
        "shops": [{"name": "Shared Shop", "phone": PHONE}], "custom_message": text, "include_flyer": False})
    assert res.status_code == 200, res.text
    return res.json()["results"][0]


def _alice_chat(client, alice, text="Secret pitch for Alice"):
    result = _pitch(client, alice, text)
    assert result["status"] in ("sent", "simulated"), result
    return result


def test_a_chat_is_visible_only_to_the_account_that_made_it(client, alice, bob):
    cid = _alice_chat(client, alice)["conversation_id"]

    mine = client.get("/api/whatsapp/conversations", headers=_hdr(alice)).json()
    assert [c["id"] for c in mine] == [cid]
    assert client.get("/api/whatsapp/conversations", headers=_hdr(bob)).json() == []
    assert client.get("/api/ai-whatsapp/conversations", headers=_hdr(bob)).json()["conversations"] == []
    assert client.get("/api/ai-whatsapp/conversations", headers=_hdr(alice)).json()["total"] == 1


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/whatsapp/conversations/{id}", None),
    ("get", "/api/ai-whatsapp/conversations/{id}", None),
    ("post", "/api/whatsapp/conversations/{id}/messages", {"message": "hi"}),
    ("post", "/api/ai-whatsapp/conversations/{id}/messages", {"message_text": "hi"}),
    ("put", "/api/whatsapp/conversations/{id}/toggle-ai", {"enabled": False}),
    ("post", "/api/ai-whatsapp/conversations/{id}/toggle-ai", {"enabled": False}),
    ("put", "/api/whatsapp/conversations/{id}/takeover", {"takeover": True}),
    ("post", "/api/ai-whatsapp/conversations/{id}/takeover", {"takeover": True}),
    ("post", "/api/whatsapp/conversations/{id}/mark-read", None),
    ("post", "/api/ai-whatsapp/conversations/{id}/read", None),
    ("put", "/api/whatsapp/conversations/{id}/status", {"lead_status": "INTERESTED"}),
    ("put", "/api/whatsapp/conversations/{id}/requirements", {"details": {"x": "y"}}),
    ("get", "/api/ai-whatsapp/conversations/{id}/suggested-replies", None),
    ("post", "/api/ai-whatsapp/conversations/{id}/follow-up", {"scheduled_for": "2030-01-01T10:00:00", "note": "n"}),
])
def test_other_accounts_cannot_open_or_change_someone_elses_chat(client, alice, bob, boss, method, path, body):
    cid = _alice_chat(client, alice)["conversation_id"]
    url = path.replace("{id}", str(cid))
    for intruder in (bob, boss):  # an administrator is no exception
        kwargs = {"headers": _hdr(intruder)}
        if body is not None:
            kwargs["json"] = body
        res = getattr(client, method)(url, **kwargs)
        assert res.status_code == 404, f"{method.upper()} {url} by {intruder.full_name}: {res.status_code} {res.text[:120]}"


def test_each_account_gets_its_own_separate_chat_with_the_same_shop(client, alice, bob):
    a = _alice_chat(client, alice, "words from alice")
    b = _pitch(client, bob, "words from bob")

    # The cooldown is per account, so Bob is not told that Alice already contacted this shop.
    assert b["status"] != "skipped", b
    assert a["conversation_id"] != b["conversation_id"]

    a_body = client.get(f"/api/whatsapp/conversations/{a['conversation_id']}", headers=_hdr(alice)).json()
    b_body = client.get(f"/api/whatsapp/conversations/{b['conversation_id']}", headers=_hdr(bob)).json()
    assert all("bob" not in m["message_body"] for m in a_body["messages"])
    assert all("alice" not in m["message_body"] for m in b_body["messages"])


def test_stats_count_only_your_own_messages(client, alice, bob):
    _alice_chat(client, alice)
    mine = client.get("/api/whatsapp/stats?period=30days", headers=_hdr(alice)).json()
    theirs = client.get("/api/whatsapp/stats?period=30days", headers=_hdr(bob)).json()
    assert "Shared Shop" in str(mine)
    assert "Shared Shop" not in str(theirs)
    ai_mine = client.get("/api/ai-whatsapp/analytics?period=30days", headers=_hdr(alice)).json()
    ai_theirs = client.get("/api/ai-whatsapp/analytics?period=30days", headers=_hdr(bob)).json()
    assert "Shared Shop" in str(ai_mine) and "Shared Shop" not in str(ai_theirs)


def test_reset_and_delete_only_touch_your_own_data(client, db_session, alice, bob):
    a = _alice_chat(client, alice)
    msg_id = db_session.query(WhatsAppMessage).filter(WhatsAppMessage.conversation_id == a["conversation_id"]).first().id
    assert client.delete(f"/api/whatsapp/messages/{msg_id}", headers=_hdr(bob)).status_code == 404
    assert client.delete("/api/whatsapp/reset", headers=_hdr(bob)).status_code == 200
    assert db_session.query(WhatsAppConversation).filter(WhatsAppConversation.id == a["conversation_id"]).count() == 1
    assert client.delete("/api/whatsapp/reset", headers=_hdr(alice)).status_code == 200
    assert db_session.query(WhatsAppConversation).filter(WhatsAppConversation.owner_id == alice.id).count() == 0


def test_a_shop_reply_lands_only_in_the_chat_of_the_account_that_messaged_it(client, db_session, alice, bob):
    from app.services.whatsapp_service import process_incoming_whatsapp_message
    a = _alice_chat(client, alice)

    # the shop answers through the webhook / poller path: no logged-in user
    process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text="Yes I am interested",
                                      sender_name="Shared Shop", allow_reply=False, dry_run=True)

    alice_chat = client.get(f"/api/whatsapp/conversations/{a['conversation_id']}", headers=_hdr(alice)).json()
    assert any("interested" in m["message_body"] for m in alice_chat["messages"])
    assert client.get("/api/whatsapp/conversations", headers=_hdr(bob)).json() == []


def test_a_message_from_a_number_nobody_contacted_belongs_to_nobody(client, db_session, alice):
    from app.services.whatsapp_service import process_incoming_whatsapp_message
    process_incoming_whatsapp_message(db=db_session, phone_number="919000011122", message_text="Hello?",
                                      sender_name="Stranger", allow_reply=False, dry_run=True)
    assert client.get("/api/whatsapp/conversations", headers=_hdr(alice)).json() == []
    orphan = db_session.query(WhatsAppConversation).filter(WhatsAppConversation.phone_number.like("%9000011122")).first()
    assert orphan is not None and orphan.owner_id is None


def test_opt_out_by_a_shop_blocks_every_account(client, db_session, alice, bob):
    from app.services.whatsapp_service import process_incoming_whatsapp_message
    _alice_chat(client, alice)
    process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text="STOP", sender_name="Shop",
                                      allow_reply=False, dry_run=True)
    res = _pitch(client, bob, "hello")
    assert res["status"] == "skipped" and res["error"] == "opted_out"


def test_nothing_is_readable_without_signing_in(client):
    for path in ("/api/whatsapp/conversations", "/api/ai-whatsapp/conversations", "/api/whatsapp/stats"):
        assert client.get(path).status_code in (401, 403)


def test_in_app_chat_conversations_are_private_even_from_administrators(client, db_session, alice, bob, boss):
    from app.models.business import Business
    from app.models.conversation import ConversationType
    biz = Business(external_place_id="chat-priv-1", name="Chat Shop", latitude=17.4, longitude=78.4)
    db_session.add(biz)
    db_session.commit()
    kind = list(ConversationType)[0].value
    made = client.post("/api/chat/conversations", headers=_hdr(alice), json={"business_id": biz.id, "conversation_type": kind})
    assert made.status_code == 200, made.text
    cid = made.json()["id"]

    assert client.get(f"/api/chat/conversations/{cid}", headers=_hdr(alice)).status_code == 200
    for intruder in (bob, boss):
        assert client.get(f"/api/chat/conversations/{cid}", headers=_hdr(intruder)).status_code == 404
        assert client.post(f"/api/chat/conversations/{cid}/messages", headers=_hdr(intruder), json={"message": "hi"}).status_code == 404
    assert client.get("/api/chat/conversations", headers=_hdr(bob)).json() == []


# ─── "already contacted" markers on the shop cards ───────────────────────────
def _outbound(db, conv, status, when):
    from app.models.whatsapp import WhatsAppDirection, WhatsAppSenderType
    db.add(WhatsAppMessage(conversation_id=conv.id, direction=WhatsAppDirection.OUTBOUND, status=status, created_at=when,
                           message_body="hi", sender_type=WhatsAppSenderType.AI_BOT, sender_name="n"))
    db.commit()


def test_recently_contacted_lists_only_my_own_shops_from_the_last_30_days(client, db_session, alice, bob):
    from datetime import datetime, timedelta
    now = datetime.utcnow()

    def chat(owner, phone):
        c = WhatsAppConversation(owner_id=owner.id, phone_number=phone, shop_name="S")
        db_session.add(c)
        db_session.commit()
        db_session.refresh(c)
        return c

    _outbound(db_session, chat(alice, "919876543210"), "sent", now - timedelta(days=2))
    _outbound(db_session, chat(alice, "919811122233"), "sent", now - timedelta(days=31))     # window over: can be messaged again
    _outbound(db_session, chat(alice, "919822233344"), "failed", now - timedelta(days=1))    # never left: not contacted
    _outbound(db_session, chat(alice, "919833344455"), "simulated", now - timedelta(days=1)) # test mode: not contacted
    _outbound(db_session, chat(bob, "919844455566"), "sent", now - timedelta(days=1))        # someone else's shop

    mine = client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(alice)).json()
    assert mine["days"] == 30
    assert [c["phone_key"] for c in mine["contacted"]] == ["9876543210"]
    assert mine["contacted"][0]["last_sent_at"].startswith(str(now.year))

    theirs = client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(bob)).json()
    assert [c["phone_key"] for c in theirs["contacted"]] == ["9844455566"]


def test_recently_contacted_needs_a_login(client):
    assert client.get("/api/ai-whatsapp/recently-contacted").status_code in (401, 403)


def test_a_shop_can_be_contacted_again_after_30_days_and_then_the_window_restarts(client, db_session, alice):
    """Contacted -> 30 days pass -> can message again -> contacted again for another 30 days."""
    from datetime import datetime, timedelta
    conv = WhatsAppConversation(owner_id=alice.id, phone_number="919876500001", shop_name="Loop Shop")
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    def contacted_keys():
        return [c["phone_key"] for c in client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(alice)).json()["contacted"]]

    assert contacted_keys() == []                                                              # never messaged: button says Send Message
    _outbound(db_session, conv, "sent", datetime.utcnow() - timedelta(days=29, hours=23))
    assert contacted_keys() == ["9876500001"]                                                  # day 29: still Already Contacted
    db_session.query(WhatsAppMessage).delete()
    db_session.commit()
    _outbound(db_session, conv, "sent", datetime.utcnow() - timedelta(days=30, hours=1))
    assert contacted_keys() == []                                                              # past 30 days: Send Message again
    _outbound(db_session, conv, "sent", datetime.utcnow())                                     # messaged again
    assert contacted_keys() == ["9876500001"]                                                  # Already Contacted for another 30 days


# ─── the daily sending limit (per account, per Indian day) ───────────────────
def _really_sent(monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_guard.delivery_status", lambda ok, raw=None: "sent")
    monkeypatch.setattr("app.routers.ai_whatsapp_hub.delivery_status", lambda ok, raw=None: "sent")


def _send_to(client, user, phone):
    res = client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(user), json={
        "shops": [{"name": "Shop " + phone[-4:], "phone": phone}], "custom_message": "hi", "include_flyer": False})
    assert res.status_code == 200, res.text
    return res.json()


def test_the_daily_limit_is_100_with_a_heads_up_at_50():
    from app.config import settings
    assert settings.WHATSAPP_DAILY_SEND_LIMIT == 100 and settings.WHATSAPP_DAILY_WARNING_AT == 50


def test_the_status_tells_the_app_when_to_warn(client, db_session, alice):
    status = client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(alice)).json()
    assert status["limit"] == 100 and status["warn_at"] == 50
    assert status["sent_today"] == 0 and status["remaining"] == 100 and status["reached"] is False


def test_the_daily_limit_stops_an_account_and_says_so(client, alice, bob, monkeypatch):
    from app.config import settings
    _really_sent(monkeypatch)
    monkeypatch.setattr(settings, "WHATSAPP_DAILY_SEND_LIMIT", 2)

    first = _send_to(client, alice, "919800000001")
    assert first["results"][0]["status"] == "sent" and first["daily_limit"]["sent_today"] == 1 and first["daily_limit"]["remaining"] == 1
    second = _send_to(client, alice, "919800000002")
    assert second["daily_limit"] == {**second["daily_limit"], "sent_today": 2, "remaining": 0, "reached": True, "limit": 2}

    third = _send_to(client, alice, "919800000003")
    assert third["results"][0]["status"] == "skipped" and third["results"][0]["error"] == "daily_limit_reached"
    assert third["daily_limit"]["reached"] is True

    status = client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(alice)).json()
    assert status["reached"] is True and status["sent_today"] == 2 and status["resets_at"]

    # the limit is shared: Bob sees Alice's 2 messages and is stopped too
    bob_status = client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(bob)).json()
    assert bob_status["sent_today"] == 2 and bob_status["reached"] is True and bob_status["my_sent_today"] == 0
    blocked = _send_to(client, bob, "919800000004")
    assert blocked["results"][0]["status"] == "skipped" and blocked["results"][0]["error"] == "daily_limit_reached"


def test_one_shared_daily_limit_counts_every_account_together(client, alice, bob, monkeypatch):
    from app.config import settings
    _really_sent(monkeypatch)
    monkeypatch.setattr(settings, "WHATSAPP_DAILY_SEND_LIMIT", 100)
    for n in range(15):
        _send_to(client, alice, f"91981000{n:04d}")          # Alice sends 15
    for n in range(20):
        _send_to(client, bob, f"91982000{n:04d}")            # Bob sends 20
    for who, mine in ((alice, 15), (bob, 20)):
        status = client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(who)).json()
        assert status["sent_today"] == 35 and status["remaining"] == 65 and status["reached"] is False
        assert status["my_sent_today"] == mine and status["warn_at"] == 50


def test_yesterdays_messages_do_not_count_after_midnight_in_india(client, db_session, alice, monkeypatch):
    from datetime import datetime, timedelta
    from app.config import settings
    from app.services.whatsapp_guard import ist_day_start_utc
    monkeypatch.setattr(settings, "WHATSAPP_DAILY_SEND_LIMIT", 1)
    conv = WhatsAppConversation(owner_id=alice.id, phone_number="919800000009", shop_name="Old")
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)
    _outbound(db_session, conv, "sent", ist_day_start_utc() - timedelta(minutes=1))     # 11:59 PM yesterday (IST)
    assert client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(alice)).json()["reached"] is False
    _outbound(db_session, conv, "sent", ist_day_start_utc() + timedelta(minutes=1))     # 12:01 AM today (IST)
    assert client.get("/api/ai-whatsapp/daily-limit", headers=_hdr(alice)).json()["reached"] is True


def test_daily_limit_needs_a_login(client):
    assert client.get("/api/ai-whatsapp/daily-limit").status_code in (401, 403)


# ─── the admin's view: every account's count and the total ───────────────────
def test_admin_sees_each_accounts_count_and_the_total(client, db_session, alice, bob, boss, monkeypatch):
    _really_sent(monkeypatch)
    for n in range(9):
        _send_to(client, alice, f"91980010{n:04d}")          # Alice sends 9
    for n in range(5):
        _send_to(client, bob, f"91980020{n:04d}")            # Bob sends 5

    report = client.get("/api/admin/message-usage", headers=_hdr(boss))
    assert report.status_code == 200, report.text
    data = report.json()
    by_email = {a["email"]: a for a in data["accounts"]}
    assert by_email["alice@example.test"]["sent_today"] == 9 and by_email["alice@example.test"]["sent_all_time"] == 9
    assert by_email["bob@example.test"]["sent_today"] == 5 and by_email["bob@example.test"]["shops_contacted"] == 5
    assert by_email["boss@example.test"]["sent_today"] == 0                                  # an account that sent nothing is listed with 0
    assert data["totals"]["sent_today"] == 14 and data["totals"]["sent_all_time"] == 14      # 9 + 5
    assert data["totals"]["accounts_total"] == 3 and data["totals"]["accounts_sent_today"] == 2
    assert [a["email"] for a in data["accounts"]][:2] == ["alice@example.test", "bob@example.test"]   # busiest first
    assert data["daily_limit"] == 100 and by_email["alice@example.test"]["limit_reached"] is False


def test_the_total_goes_up_by_itself_when_anyone_sends(client, alice, boss, monkeypatch):
    _really_sent(monkeypatch)
    total = lambda: client.get("/api/admin/message-usage", headers=_hdr(boss)).json()["totals"]["sent_today"]  # noqa: E731
    assert total() == 0
    _send_to(client, alice, "919800030001")
    assert total() == 1
    _send_to(client, alice, "919800030002")
    assert total() == 2


def test_failed_and_test_mode_messages_are_not_counted_and_old_days_stay_in_the_all_time_total(client, db_session, alice, boss):
    from datetime import timedelta
    from app.services.whatsapp_guard import ist_day_start_utc
    conv = WhatsAppConversation(owner_id=alice.id, phone_number="919800040001", shop_name="S")
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)
    _outbound(db_session, conv, "failed", ist_day_start_utc() + timedelta(minutes=5))
    _outbound(db_session, conv, "simulated", ist_day_start_utc() + timedelta(minutes=6))
    _outbound(db_session, conv, "sent", ist_day_start_utc() - timedelta(days=3))
    me = {a["email"]: a for a in client.get("/api/admin/message-usage", headers=_hdr(boss)).json()["accounts"]}["alice@example.test"]
    assert me["sent_today"] == 0 and me["sent_7_days"] == 1 and me["sent_all_time"] == 1


def test_only_an_admin_can_see_the_counts(client, alice):
    assert client.get("/api/admin/message-usage", headers=_hdr(alice)).status_code in (401, 403)
    assert client.get("/api/admin/message-usage").status_code in (401, 403)
