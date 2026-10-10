"""
First messages go as approved templates; free text and pictures only inside WhatsApp's 24-hour window.
A message with a picture uses the picture-header template and passes the picture; one without uses the text template.
Mr LAD is replaced by stand-ins: nothing here reaches a network.
"""
from datetime import datetime, timedelta

from app.auth.jwt import create_access_token
from app.config import settings
from app.models.user import User, UserRole
from app.services.mr_lad_client import MrLadWhatsAppClient as Lad
from app.utils.security import hash_password


def _catalog(**spec):
    """spec: name=(status, header_type)"""
    return {name: {"status": status, "header_type": header, "body": "Hello {{1}}, about {{2}}."} for name, (status, header) in spec.items()}


ALL_APPROVED = _catalog(
    lexon_offer_link_v1=("APPROVED", "image"), lexon_offer_link_v2=("APPROVED", ""),
    lexon_offer_link_v3=("APPROVED", ""), lexon_offer_link_v4=("APPROVED", "image"),
    lexon_about_company_v1=("APPROVED", "image"), lexon_about_company_v2=("APPROVED", ""),
    lexon_about_company_v3=("APPROVED", ""), lexon_about_company_v4=("APPROVED", "image"),
    lexon_official_pitch=("APPROVED", ""),
)


def _use(monkeypatch, catalog):
    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: catalog))


def test_each_message_uses_its_own_template_with_or_without_a_picture(monkeypatch):
    _use(monkeypatch, ALL_APPROVED)
    assert Lad.pick_template("offer-link") == ("lexon_offer_link_v3", True)
    assert Lad.pick_template("about-company") == ("lexon_about_company_v3", True)     # not the same template for both
    assert Lad.pick_template("offer-link", with_picture=True) == ("lexon_offer_link_v4", True)
    assert Lad.pick_template("about-company", with_picture=True) == ("lexon_about_company_v4", True)
    assert Lad.pick_template(None) == ("lexon_offer_link_v3", True)


def test_the_button_versions_are_used_only_until_the_plain_ones_are_approved(monkeypatch):
    catalog = dict(ALL_APPROVED)
    catalog["lexon_offer_link_v4"] = {"status": "PENDING", "header_type": "image", "body": ""}
    catalog["lexon_offer_link_v3"] = {"status": "PENDING", "header_type": "", "body": ""}
    _use(monkeypatch, catalog)
    assert Lad.pick_template("offer-link", with_picture=True) == ("lexon_offer_link_v1", True)
    assert Lad.pick_template("offer-link") == ("lexon_offer_link_v2", True)


def test_nothing_else_is_ever_substituted(monkeypatch):
    _use(monkeypatch, _catalog(lexon_official_pitch=("APPROVED", ""), lexon_offer_link_v3=("PENDING", ""),
                               lexon_offer_link_v4=("REJECTED", "image"), lexon_about_company_v3=("PENDING", "")))
    assert Lad.pick_template("offer-link") == (None, False)
    assert Lad.pick_template("offer-link", with_picture=True) == (None, False)
    assert Lad.pick_template("about-company") == (None, False)
    _use(monkeypatch, {})   # the list cannot be read: trust the configured name and let the gateway decide
    assert Lad.pick_template("about-company") == ("lexon_about_company_v3", True)
    assert Lad.pick_template("about-company", with_picture=True) == ("lexon_about_company_v4", True)


def test_the_real_wording_of_a_template_is_rendered_for_the_mr_lad_note(monkeypatch):
    _use(monkeypatch, _catalog(t=("APPROVED", "")))
    assert Lad.render_template("t", ["Rahul", "Rahul Cafe"]) == "Hello Rahul, about Rahul Cafe."
    assert Lad.render_template("missing", ["x"]) == ""


def test_the_window_is_open_only_if_the_shop_wrote_in_the_last_24_hours(monkeypatch):
    def fake_get(rows):
        class R:
            status_code = 200

            def json(self):
                return {"data": rows}
        return lambda url, **kw: R()

    import app.services.mr_lad_client as module
    now = datetime.utcnow()
    iso = lambda dt: dt.isoformat() + "+00:00"  # noqa: E731

    monkeypatch.setattr(module.requests, "get", fake_get([{"role": "user", "created_at": iso(now - timedelta(hours=2))}]))
    assert Lad.window_open("c1", "tok") is True
    monkeypatch.setattr(module.requests, "get", fake_get([{"role": "user", "created_at": iso(now - timedelta(hours=30))}]))
    assert Lad.window_open("c1", "tok") is False                                     # replied, but too long ago
    monkeypatch.setattr(module.requests, "get", fake_get([{"role": "assistant", "created_at": iso(now)}]))
    assert Lad.window_open("c1", "tok") is False                                     # only WE wrote: never replied
    monkeypatch.setattr(module.requests, "get", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert Lad.window_open("c1", "tok") is False                                     # unknown: be safe, use the template


# ─── what is really sent to the gateway ──────────────────────────────────────
def _capture_send(monkeypatch, **send_kwargs):
    import app.services.mr_lad_client as module
    sent = {}

    class Resp:
        status_code = 200
        headers = {"content-type": "application/json"}
        text = "{}"

        def json(self):
            return {"success": True, "sent": 1, "failed": 0, "results": [{"status": "sent", "message_id": "wamid.X", "conversation_id": "conv-1"}]}

    def fake_post(url, **kw):
        if url.endswith("/send-template-to-members"):
            sent["payload"] = kw.get("json")
        return Resp()

    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", False)
    monkeypatch.setattr(settings, "LAD_API_TOKEN", "x")
    monkeypatch.setattr(Lad, "get_token", classmethod(lambda cls, force_refresh=False: ("tok", None)))
    monkeypatch.setattr(Lad, "_find_conversation_id", classmethod(lambda cls, phone, token: "conv-1"))
    monkeypatch.setattr(Lad, "window_open", classmethod(lambda cls, conv, token: False))   # a cold shop
    monkeypatch.setattr(Lad, "add_note", classmethod(lambda cls, conv, content: sent.setdefault("notes", []).append(content) or True))
    monkeypatch.setattr(module.requests, "post", fake_post)
    ok, result, raw = Lad.send_message("919876543210", "typed text", recipient_name="Chai Corner", sync_admin_copy=False, **send_kwargs)
    return ok, result, raw, sent


def test_a_cold_shop_gets_the_picture_template_with_the_picture_in_its_header(monkeypatch):
    _use(monkeypatch, ALL_APPROVED)
    ok, _result, raw, sent = _capture_send(monkeypatch, send_flyer=True, image_url="https://api.example/pic/abc", template_key="about-company")
    assert ok and raw["mode"] == "template" and raw["template"] == "lexon_about_company_v4"
    payload = sent["payload"]
    assert payload["template_name"] == "lexon_about_company_v4"
    assert payload["header_type"] == "image" and payload["header_url"] == "https://api.example/pic/abc"   # BOTH, or it is refused
    assert payload["members"][0]["params"] == ["Chai Corner", "Chai Corner"]
    assert any("https://api.example/pic/abc" in note for note in sent["notes"])


def test_a_cold_shop_without_a_picture_gets_the_plain_text_template_and_no_header(monkeypatch):
    _use(monkeypatch, ALL_APPROVED)
    ok, _result, raw, sent = _capture_send(monkeypatch, send_flyer=False, image_url=None, template_key="offer-link")
    assert ok and raw["template"] == "lexon_offer_link_v3"
    assert "header_type" not in sent["payload"] and "header_url" not in sent["payload"]


def test_a_cold_shop_is_refused_clearly_when_the_templates_are_not_approved(monkeypatch):
    _use(monkeypatch, _catalog(lexon_offer_link_v4=("PENDING", "image"), lexon_offer_link_v1=("DISABLED", "image")))
    ok, message, _raw, sent = _capture_send(monkeypatch, send_flyer=True, image_url="https://api.example/pic/abc", template_key="offer-link")
    assert ok is False and "not approved" in str(message)
    assert "payload" not in sent        # nothing was sent


# ─── the dialog's pre-send answer ────────────────────────────────────────────
def _user(db):
    u = User(full_name="Owner", email="owner@example.test", password_hash=hash_password("Password123"), role=UserRole.USER, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


def test_send_mode_tells_the_dialog_how_the_message_will_really_go(client, db_session, monkeypatch):
    headers = _user(db_session)
    _use(monkeypatch, ALL_APPROVED)
    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", False)
    monkeypatch.setattr(settings, "LAD_API_TOKEN", "x")
    monkeypatch.setattr(Lad, "get_token", classmethod(lambda cls, force_refresh=False: ("tok", None)))
    monkeypatch.setattr(Lad, "_find_conversation_id", classmethod(lambda cls, phone, token: "conv-1"))

    monkeypatch.setattr(Lad, "window_open", classmethod(lambda cls, conv, token: False))
    cold = client.get("/api/ai-whatsapp/send-mode?phone=919876543210&template_key=offer-link&picture=true", headers=headers).json()
    assert cold == {"mode": "template", "template": "lexon_offer_link_v4", "template_ready": True, "with_picture": True}
    plain = client.get("/api/ai-whatsapp/send-mode?phone=919876543210&template_key=about-company", headers=headers).json()
    assert plain["template"] == "lexon_about_company_v3" and plain["with_picture"] is False

    monkeypatch.setattr(Lad, "window_open", classmethod(lambda cls, conv, token: True))
    assert client.get("/api/ai-whatsapp/send-mode?phone=919876543210&template_key=offer-link", headers=headers).json()["mode"] == "free"


def test_send_mode_requires_login_and_is_free_in_test_mode(client, db_session, monkeypatch):
    assert client.get("/api/ai-whatsapp/send-mode?phone=919876543210").status_code in (401, 403)
    headers = _user(db_session)
    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", True)
    assert client.get("/api/ai-whatsapp/send-mode?phone=919876543210", headers=headers).json()["mode"] == "free"
