"""
Regression tests for the WhatsApp automation audit: every loophole found has a test here.
"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta

# pyrefly: ignore [missing-import]
import pytest

from app.config import settings
from app.models.ai_conversation import AIIntent
from app.models.whatsapp import WhatsAppConversation, WhatsAppMessage, WhatsAppDirection
from app.services import whatsapp_guard as guard
from app.services.ai_sales_agent import classify_intent_and_sentiment
from app.services.whatsapp_service import process_incoming_whatsapp_message

PHONE = "919849012345"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 1. Authentication on every WhatsApp route ────────────────────────────────
@pytest.mark.parametrize("method,path", [
    ("post", "/api/ai-whatsapp/broadcast-all"),
    ("post", "/api/whatsapp/broadcast-all"),
    ("post", "/api/ai-whatsapp/simulate-incoming"),
    ("post", "/api/whatsapp/simulate-incoming"),
    ("post", "/api/whatsapp/settings/test"),
    ("get", "/api/ai-whatsapp/test-flyer-send"),
    ("delete", "/api/whatsapp/reset"),
    ("put", "/api/whatsapp/settings"),
    ("get", "/api/whatsapp/conversations"),
])
def test_whatsapp_routes_reject_anonymous(client, method, path):
    res = getattr(client, method)(path)
    assert res.status_code in (401, 403), f"{method.upper()} {path} must require login"


@pytest.mark.parametrize("method,path", [
    ("delete", "/api/whatsapp/reset"),
    ("delete", "/api/whatsapp/messages/1"),
    ("get", "/api/whatsapp/settings"),
    ("put", "/api/whatsapp/settings"),
    ("post", "/api/whatsapp/sync"),
    ("get", "/api/ai-whatsapp/test-flyer-send?to_phone=919849012345"),
])
def test_destructive_and_config_routes_are_admin_only(client, user_token, method, path):
    res = getattr(client, method)(path, headers=_auth(user_token))
    assert res.status_code == 403


def test_settings_never_expose_verify_token(client, admin_token, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "super-secret-token")
    res = client.get("/api/whatsapp/settings", headers=_auth(admin_token))
    assert res.status_code == 200
    assert "super-secret-token" not in res.text
    assert res.json()["webhook_verify_token_configured"] is True


# ── 2. Simulation endpoints can never message a real person ──────────────────
def test_simulate_endpoints_are_dry_run(client, user_token, monkeypatch):
    from app.services.whatsapp_cloud_client import WhatsAppCloudClient

    def boom(*a, **k):
        raise AssertionError("simulate must never call the real WhatsApp client")

    monkeypatch.setattr(WhatsAppCloudClient, "send_text", classmethod(lambda cls, *a, **k: boom()))
    res = client.post(
        "/api/ai-whatsapp/simulate-incoming",
        headers=_auth(user_token),
        json={"phone_number": "919000011111", "message_text": "price?", "shop_name": "X"},
    )
    assert res.status_code == 200
    assert res.json()["ai_auto_replied"] is True


# ── 3. Webhook authenticity ───────────────────────────────────────────────────
def _meta_payload(phone=PHONE, wamid="wamid.AAA", text="hello", mtype="text"):
    msg = {"from": phone, "id": wamid, "type": mtype}
    if mtype == "text":
        msg["text"] = {"body": text}
    return {"entry": [{"changes": [{"value": {
        "metadata": {"phone_number_id": settings.WHATSAPP_PHONE_NUMBER_ID},
        "contacts": [{"wa_id": phone, "profile": {"name": "Owner"}}],
        "messages": [msg],
    }}]}]}


def _sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def captured_webhook(monkeypatch):
    items = []
    monkeypatch.setattr("app.routers.whatsapp._process_webhook_batch", lambda batch: items.extend(batch))
    return items


def test_webhook_rejects_unsigned_when_no_secret(client, monkeypatch, captured_webhook):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "")
    monkeypatch.setattr(settings, "WHATSAPP_ALLOW_UNSIGNED_WEBHOOK", False)
    res = client.post("/api/whatsapp/webhook", json=_meta_payload())
    assert res.status_code == 403
    assert captured_webhook == []


def test_webhook_rejects_bad_signature(client, monkeypatch, captured_webhook):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "s3cret")
    body = json.dumps(_meta_payload()).encode()
    res = client.post("/api/whatsapp/webhook", content=body,
                      headers={"X-Hub-Signature-256": _sign(body, "wrong"), "Content-Type": "application/json"})
    assert res.status_code == 403
    assert captured_webhook == []


def test_webhook_accepts_valid_signature_and_queues(client, monkeypatch, captured_webhook):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "s3cret")
    body = json.dumps(_meta_payload(wamid="wamid.XYZ", text="what is the price")).encode()
    res = client.post("/api/whatsapp/webhook", content=body,
                      headers={"X-Hub-Signature-256": _sign(body, "s3cret"), "Content-Type": "application/json"})
    assert res.status_code == 200
    assert len(captured_webhook) == 1
    assert captured_webhook[0]["external_message_id"] == "wamid.XYZ"
    assert captured_webhook[0]["phone_number"] == PHONE


def test_webhook_ignores_other_phone_number_ids(client, monkeypatch, captured_webhook):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "s3cret")
    payload = _meta_payload()
    payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"] = "999"
    body = json.dumps(payload).encode()
    res = client.post("/api/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": _sign(body, "s3cret")})
    assert res.status_code == 200 and captured_webhook == []


def test_webhook_non_text_is_flagged_for_a_human(client, monkeypatch, captured_webhook):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "s3cret")
    body = json.dumps(_meta_payload(mtype="image")).encode()
    client.post("/api/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": _sign(body, "s3cret")})
    assert captured_webhook[0]["message_type"] == "image"


def test_non_text_message_hands_off_without_ai_reply(db_session):
    inbound, outbound, replied = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="", message_type="image",
        external_message_id="wamid.IMG", dry_run=True,
    )
    assert outbound is None and replied is False
    conv = db_session.query(WhatsAppConversation).filter_by(id=inbound.conversation_id).one()
    assert conv.human_takeover is True and conv.conversation_status == "HUMAN_HANDOFF"


def test_verify_meta_signature_unit(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", "k")
    assert guard.verify_meta_signature(b"{}", _sign(b"{}", "k")) is True
    assert guard.verify_meta_signature(b"{}", None) is False
    assert guard.verify_meta_signature(b"{}", "sha256=deadbeef") is False


# ── 4. Idempotency ────────────────────────────────────────────────────────────
def test_duplicate_webhook_delivery_is_ignored(db_session):
    first, out1, _ = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="hello", external_message_id="wamid.DUP", dry_run=True)
    second, out2, replied2 = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="hello", external_message_id="wamid.DUP", dry_run=True)
    assert second.id == first.id and out2 is None and replied2 is False
    count = db_session.query(WhatsAppMessage).filter_by(external_message_id="wamid.DUP").count()
    assert count == 1


# ── 5. Opt-out is honoured everywhere ────────────────────────────────────────
def test_stop_opts_out_confirms_once_then_silence(db_session):
    inbound, confirm, _ = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="STOP", dry_run=True)
    conv = db_session.query(WhatsAppConversation).filter_by(id=inbound.conversation_id).one()
    assert conv.opt_out is True and conv.lead_status == "DO_NOT_CONTACT"
    assert confirm is not None and "won't message" in confirm.message_body

    _, reply, replied = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="hello again", dry_run=True)
    assert reply is None and replied is False
    db_session.refresh(conv)
    assert conv.opt_out is True and conv.lead_status == "DO_NOT_CONTACT"


def test_resubscribe_clears_opt_out(db_session):
    process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text="stop", dry_run=True)
    inbound, _, _ = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="START", dry_run=True)
    conv = db_session.query(WhatsAppConversation).filter_by(id=inbound.conversation_id).one()
    assert conv.opt_out is False


def test_send_gate_blocks_opted_out_and_invalid_numbers(db_session):
    process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text="stop", dry_run=True)
    assert guard.can_message(db_session, PHONE) == (False, "opted_out")
    assert guard.can_message(db_session, "+91 98490 12345") == (False, "opted_out")  # formatting can't dodge it
    assert guard.can_message(db_session, "12345") == (False, "invalid_phone")
    assert guard.can_message(db_session, "") == (False, "invalid_phone")
    assert guard.can_message(db_session, "919911223344")[0] is True


def test_central_client_gate_blocks_opted_out(db_session):
    from app.services.whatsapp_cloud_client import WhatsAppCloudClient
    process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text="stop", dry_run=True)
    ok, err, _ = WhatsAppCloudClient.send_text(db=db_session, to_phone=PHONE, text_body="pitch")
    assert ok is False and err == "blocked:opted_out"


def test_daily_cap_blocks_sends(db_session, monkeypatch):
    process_incoming_whatsapp_message(db=db_session, phone_number="919000000001", message_text="price", dry_run=True)
    conv = db_session.query(WhatsAppConversation).first()
    db_session.add(WhatsAppMessage(
        conversation_id=conv.id, direction=WhatsAppDirection.OUTBOUND,
        sender_type=conv.messages[0].sender_type, sender_name="x", message_body="y",
        status="sent", created_at=datetime.utcnow()))
    db_session.commit()
    monkeypatch.setattr(settings, "WHATSAPP_DAILY_SEND_LIMIT", 1)
    assert guard.can_message(db_session, "919911223344") == (False, "daily_limit_reached")


# ── 6. Human takeover silences the bot ───────────────────────────────────────
def test_bot_stays_silent_once_human_took_over(db_session):
    inbound, _, _ = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="hello", dry_run=True)
    conv = db_session.query(WhatsAppConversation).filter_by(id=inbound.conversation_id).one()
    conv.human_takeover = True
    db_session.commit()
    _, reply, replied = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="how much does it cost", dry_run=True)
    assert reply is None and replied is False


def test_handoff_request_still_gets_one_courtesy_reply(db_session):
    _, reply, replied = process_incoming_whatsapp_message(
        db=db_session, phone_number=PHONE, message_text="please call me", dry_run=True)
    assert reply is not None and replied is True
    conv = db_session.query(WhatsAppConversation).first()
    assert conv.human_takeover is True


def test_max_ai_messages_cap_stops_runaway_loops(db_session):
    from app.services.ai_sales_agent import get_ai_settings
    cfg = get_ai_settings(db_session)
    cfg.max_ai_messages_per_conv = 2
    db_session.commit()
    results = [
        process_incoming_whatsapp_message(db=db_session, phone_number=PHONE, message_text=t, dry_run=True)[1]
        for t in ("hello", "send demo", "price", "features")
    ]
    assert results[0] is not None and results[1] is not None
    assert results[2] is None and results[3] is None


# ── 7. Intent classification ─────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("STOP", AIIntent.STOP_CONTACT),
    ("please stop messaging me", AIIntent.STOP_CONTACT),
    ("don't call me", AIIntent.STOP_CONTACT),
    ("do not contact me again", AIIntent.STOP_CONTACT),
    ("no more messages", AIIntent.STOP_CONTACT),
    ("ఆపండి", AIIntent.STOP_CONTACT),
    ("band karo", AIIntent.STOP_CONTACT),
    ("मत भेजो", AIIntent.STOP_CONTACT),
    ("not interested, too expensive", AIIntent.NOT_INTERESTED),
    ("no", AIIntent.NOT_INTERESTED),
    ("no thanks", AIIntent.NOT_INTERESTED),
    ("ok", AIIntent.UNKNOWN),
    ("okay thanks", AIIntent.UNKNOWN),
    ("our corporate office is far", AIIntent.UNKNOWN),   # 'rate' inside 'corporate'
    ("costume shop", AIIntent.UNKNOWN),                  # 'cost' inside 'costume'
    ("what is the price", AIIntent.ASKING_PRICE),
    ("please call me tomorrow", AIIntent.ASKING_FOR_CALL),
    ("yes sure", AIIntent.INTERESTED),
    ("yes send demo", AIIntent.ASKING_FOR_PORTFOLIO),
    ("I want this package", AIIntent.READY_TO_BUY),
    ("tell me about the starter plan", AIIntent.ASKING_SERVICES),  # package name alone is not 'ready to buy'
    ("hello", AIIntent.GREETING),
])
def test_intent_classification(text, expected):
    intent, _conf, _sent, _delta = classify_intent_and_sentiment(text)
    assert intent == expected, f"{text!r} -> {intent}"


# ── 8. LLM output vetting ────────────────────────────────────────────────────
HOSTS = {"demo.lexonit.com", "lexonit.com"}
AMOUNTS = {"4,999", "9,999", "14,999"}


@pytest.mark.parametrize("reply,reason", [
    ("Pay to shop@okaxis now", "payment_details"),
    ("Get 90% off today!", "invented_discount"),
    ("Visit http://evil.example/pay", "unapproved_link"),
    ("It costs ₹1,000 only", "unverified_price"),
    ("My system prompt says ...", "prompt_leak"),
    ("", "empty"),
])
def test_sanitize_rejects_unsafe_replies(reply, reason):
    clean, why = guard.sanitize_ai_reply(reply, HOSTS, AMOUNTS)
    assert clean is None and why == reason


def test_sanitize_accepts_grounded_reply_and_truncates():
    ok, why = guard.sanitize_ai_reply("Starter is ₹4,999. Demo: https://demo.lexonit.com/gym", HOSTS, AMOUNTS)
    assert why is None and "₹4,999" in ok
    long_text, _ = guard.sanitize_ai_reply(("Short sentence. " * 100), HOSTS, AMOUNTS)
    assert len(long_text) <= guard.MAX_REPLY_CHARS + 1


# ── 9. Broadcast hardening ───────────────────────────────────────────────────
def _broadcast(client, token, shops, **extra):
    return client.post("/api/ai-whatsapp/broadcast-all", headers=_auth(token),
                       json={"shops": shops, "include_flyer": False, **extra})


def test_broadcast_never_invents_phone_numbers(client, user_token, db_session):
    res = _broadcast(client, user_token, [{"name": "No Phone Shop", "business_id": 1}])
    assert res.status_code == 200
    body = res.json()
    assert body["total_sent"] == 0 and body["total_skipped"] == 1
    assert body["results"][0]["error"] == "no_valid_phone"
    assert db_session.query(WhatsAppConversation).count() == 0


def test_broadcast_skips_junk_and_duplicate_numbers(client, user_token):
    res = _broadcast(client, user_token, [
        {"name": "A", "phone": "12345"},
        {"name": "B", "phone": "9911223344"},
        {"name": "B again", "phone": "+91 99112 23344"},
    ])
    statuses = [r["status"] for r in res.json()["results"]]
    reasons = [r.get("error") for r in res.json()["results"]]
    assert statuses[0] == "skipped" and reasons[0] == "no_valid_phone"
    assert statuses[2] == "skipped" and reasons[2] == "duplicate_in_batch"


def test_broadcast_reports_truthful_status_in_test_mode(client, user_token, db_session):
    res = _broadcast(client, user_token, [{"name": "Real Shop", "phone": "9911223344"}])
    body = res.json()
    # no gateway credentials in tests -> simulator: must NOT be reported as delivered
    assert body["results"][0]["status"] == "simulated"
    assert body["total_sent"] == 0
    msg = db_session.query(WhatsAppMessage).first()
    assert msg.status == "simulated"
    assert "Reply STOP to opt out." not in msg.message_body  # footer removed on request; STOP replies are still honoured


def test_broadcast_skips_opted_out_numbers(client, user_token, db_session):
    process_incoming_whatsapp_message(db=db_session, phone_number="919911223344", message_text="stop", dry_run=True)
    res = _broadcast(client, user_token, [{"name": "Opted Out Shop", "phone": "9911223344"}])
    assert res.json()["results"][0] == {
        "shop_name": "Opted Out Shop", "phone_number": "919911223344", "status": "skipped", "error": "opted_out"}


def test_broadcast_batch_limit(client, user_token, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_MAX_BROADCAST_BATCH", 2)
    res = _broadcast(client, user_token, [{"name": str(i), "phone": f"99112233{i:02d}"} for i in range(3)])
    assert res.status_code == 400


def test_broadcast_cooldown_prevents_repeat_pitch(client, user_token, db_session, monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_guard.delivery_status", lambda ok, raw=None: "sent")
    monkeypatch.setattr("app.routers.ai_whatsapp_hub.delivery_status", lambda ok, raw=None: "sent")
    shop = [{"name": "Repeat Shop", "phone": "9911223344"}]
    first = _broadcast(client, user_token, shop).json()
    second = _broadcast(client, user_token, shop).json()
    assert first["results"][0]["status"] == "sent"
    assert second["results"][0]["status"] == "skipped" and second["results"][0]["error"] == "recently_contacted"


# ── 10. Mr LAD poller ────────────────────────────────────────────────────────
@pytest.fixture
def lad(monkeypatch):
    from app.services.mr_lad_client import MrLadWhatsAppClient as C
    monkeypatch.setattr(settings, "LAD_API_TOKEN", "t")
    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", False)
    C._thread_signatures.clear()
    sent = []

    def fake_send(cls, db, to_phone, text_body, **kw):
        sent.append((to_phone, text_body))
        return True, "wamid.OUT", {"mode": "api"}

    from app.services.whatsapp_cloud_client import WhatsAppCloudClient
    monkeypatch.setattr(WhatsAppCloudClient, "send_text", classmethod(fake_send))
    return C, sent


def _iso(minutes_ago):
    return (datetime.utcnow() - timedelta(minutes=minutes_ago)).isoformat()


def _wire(monkeypatch, C, messages, thread_phone="9911223344"):
    monkeypatch.setattr(C, "get_conversations", classmethod(lambda cls, limit=50, offset=0: (True, {"data": [{"id": "T1", "phone": thread_phone}]})))
    monkeypatch.setattr(C, "get_messages", classmethod(lambda cls, cid, limit=50: (True, {"data": messages})))


def test_poller_runs_ai_pipeline_for_fresh_message(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [{"id": "m1", "role": "user", "content": "what is the price", "created_at": _iso(1)}])
    res = C.sync_recent_conversations(db_session)
    assert res["new_inbound_messages"] == 1 and res["ai_replies_sent"] == 1
    assert len(sent) == 1


def test_poller_never_answers_stale_history_but_honours_old_stop(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [
        {"id": "old1", "role": "user", "content": "STOP", "created_at": _iso(600)},
    ])
    res = C.sync_recent_conversations(db_session)
    assert res["ai_replies_sent"] == 0 and sent == []
    conv = db_session.query(WhatsAppConversation).one()
    assert conv.opt_out is True


def test_poller_only_replies_to_newest_unanswered_message(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [
        {"id": "a", "role": "user", "content": "hello", "created_at": _iso(5)},
        {"id": "b", "role": "user", "content": "send demo", "created_at": _iso(1)},
    ])
    C.sync_recent_conversations(db_session)
    assert len(sent) == 1
    assert db_session.query(WhatsAppMessage).filter_by(direction=WhatsAppDirection.INBOUND).count() == 2


def test_poller_skips_message_a_human_already_answered(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [
        {"id": "a", "role": "user", "content": "price?", "created_at": _iso(3)},
        {"id": "h", "role": "assistant", "content": "Hi, this is Ravi", "created_at": _iso(2)},
    ])
    C.sync_recent_conversations(db_session)
    assert sent == []


def test_poller_does_not_auto_reply_without_timestamps(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [{"id": "n1", "role": "user", "content": "price?"}])
    res = C.sync_recent_conversations(db_session)
    assert res["new_inbound_messages"] == 1 and sent == []


def test_poller_is_idempotent(db_session, lad, monkeypatch):
    C, sent = lad
    _wire(monkeypatch, C, [{"id": "m1", "role": "user", "content": "price?", "created_at": _iso(1)}])
    C.sync_recent_conversations(db_session)
    C._thread_signatures.clear()
    res = C.sync_recent_conversations(db_session)
    assert res["new_inbound_messages"] == 0 and len(sent) == 1


# ── 11. Gateway credentials ──────────────────────────────────────────────────
def test_no_hardcoded_gateway_credentials(monkeypatch):
    from app.services.mr_lad_client import MrLadWhatsAppClient as C
    monkeypatch.setattr(settings, "LAD_API_TOKEN", "")
    monkeypatch.setattr(settings, "LAD_AUTH_EMAIL", "")
    monkeypatch.setattr(settings, "LAD_AUTH_PASSWORD", "")
    C._cached_token = None
    token, err = C.get_token()
    assert token is None and "not configured" in err


def test_admin_copy_is_disabled_unless_configured(monkeypatch):
    from app.services.mr_lad_client import MrLadWhatsAppClient as C
    monkeypatch.setattr(settings, "WHATSAPP_ADMIN_COPY_NUMBER", "")
    assert C._admin_copy_number() is None and C._is_admin_copy_number("917780181920") is False
    monkeypatch.setattr(settings, "WHATSAPP_ADMIN_COPY_NUMBER", "+917780181920")
    assert C._is_admin_copy_number("7780181920") is True


def test_delivery_status_helper():
    assert guard.delivery_status(False, None) == "failed"
    assert guard.delivery_status(True, {"mode": "simulator"}) == "simulated"
    assert guard.delivery_status(True, {"mode": "api"}) == "sent"
