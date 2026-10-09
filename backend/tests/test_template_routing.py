"""
First messages go as approved templates; free text and pictures only inside WhatsApp's 24-hour window.
Mr LAD is replaced by stand-ins: nothing here reaches a network.
"""
from datetime import datetime, timedelta

from app.auth.jwt import create_access_token
from app.config import settings
from app.models.user import User, UserRole
from app.services.mr_lad_client import MrLadWhatsAppClient as Lad
from app.utils.security import hash_password


def _templates(**statuses):
    return {name: {"status": status, "header_type": "", "body": ""} for name, status in statuses.items()}


def test_the_new_template_is_used_once_approved_and_the_older_one_until_then(monkeypatch):
    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: _templates(
        lexon_official_pitch="APPROVED", lexon_offer_link_v2="PENDING", lexon_about_company_v2="PENDING")))
    assert Lad.pick_template("offer-link") == ("lexon_official_pitch", False)       # still waiting for WhatsApp
    assert Lad.pick_template("about-company") == ("lexon_official_pitch", False)

    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: _templates(
        lexon_official_pitch="APPROVED", lexon_offer_link_v2="APPROVED", lexon_about_company_v2="REJECTED")))
    assert Lad.pick_template("offer-link") == ("lexon_offer_link_v2", True)         # approved: used
    assert Lad.pick_template("about-company") == ("lexon_official_pitch", False)    # rejected: never used
    assert Lad.pick_template(None) == ("lexon_official_pitch", True)                 # no message chosen: the default itself


def test_templates_with_a_picture_header_are_never_chosen_because_the_gateway_cannot_send_them(monkeypatch):
    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: {
        "lexon_offer_link_v2": {"status": "APPROVED", "header_type": "image", "body": ""},
        "lexon_official_pitch": {"status": "APPROVED", "header_type": "", "body": ""}}))
    assert Lad.pick_template("offer-link") == ("lexon_official_pitch", False)      # the picture one would fail (#132012)

    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: {
        "lexon_offer_link_v2": {"status": "APPROVED", "header_type": "", "body": ""},
        "lexon_official_pitch": {"status": "APPROVED", "header_type": "", "body": ""}}))
    assert Lad.pick_template("offer-link") == ("lexon_offer_link_v2", True)


def test_the_real_wording_of_a_template_is_rendered_for_the_mr_lad_note(monkeypatch):
    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: {
        "t": {"status": "APPROVED", "header_type": "", "body": "Hello {{1}}, about {{2}}."}}))
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


def _user(db):
    u = User(full_name="Owner", email="owner@example.test", password_hash=hash_password("Password123"), role=UserRole.USER, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


def test_send_mode_tells_the_dialog_how_the_message_will_really_go(client, db_session, monkeypatch):
    headers = _user(db_session)
    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", False)
    monkeypatch.setattr(settings, "LAD_API_TOKEN", "x")
    monkeypatch.setattr(Lad, "get_token", classmethod(lambda cls, force_refresh=False: ("tok", None)))
    monkeypatch.setattr(Lad, "_find_conversation_id", classmethod(lambda cls, phone, token: "conv-1"))
    monkeypatch.setattr(Lad, "pick_template", classmethod(lambda cls, key: ("lexon_offer_link_v2", True)))

    monkeypatch.setattr(Lad, "window_open", classmethod(lambda cls, conv, token: False))
    cold = client.get("/api/ai-whatsapp/send-mode?phone=919876543210&template_key=offer-link", headers=headers).json()
    assert cold == {"mode": "template", "template": "lexon_offer_link_v2", "template_ready": True}

    monkeypatch.setattr(Lad, "window_open", classmethod(lambda cls, conv, token: True))
    warm = client.get("/api/ai-whatsapp/send-mode?phone=919876543210&template_key=offer-link", headers=headers).json()
    assert warm["mode"] == "free"



def test_send_mode_requires_login_and_is_free_in_test_mode(client, db_session, monkeypatch):
    assert client.get("/api/ai-whatsapp/send-mode?phone=919876543210").status_code in (401, 403)
    headers = _user(db_session)
    monkeypatch.setattr(settings, "WHATSAPP_IS_TEST_MODE", True)
    assert client.get("/api/ai-whatsapp/send-mode?phone=919876543210", headers=headers).json()["mode"] == "free"
