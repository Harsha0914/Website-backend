"""
The per-account picture library: add / list / change / replace / delete, privacy, safety checks,
sending a chosen picture, and restoring pictures from MongoDB after a reset.
"""
import base64

import pytest

from app.auth.jwt import create_access_token
from app.models.message_image import MessageImage
from app.models.user import User, UserRole
from app.services import chat_durability as cd
from app.utils.security import hash_password

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64            # starts like a real JPEG
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _url(raw, mime="image/jpeg"):
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def _user(db, name, email):
    u = User(full_name=name, email=email, password_hash=hash_password("Password123"), role=UserRole.USER, is_active=True)
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


def _add(client, user, category="Cafe", label="Cozy cafe", raw=JPEG):
    res = client.post("/api/whatsapp/images", headers=_hdr(user), json={
        "category": category, "label": label, "data_url": _url(raw), "thumb_url": _url(raw)})
    assert res.status_code == 201, res.text
    return res.json()


def test_add_list_change_replace_and_delete(client, alice):
    made = _add(client, alice)
    assert made["category"] == "Cafe" and made["label"] == "Cozy cafe" and made["thumb"].startswith("data:image/jpeg")

    listed = client.get("/api/whatsapp/images", headers=_hdr(alice)).json()
    assert [i["id"] for i in listed["images"]] == [made["id"]]
    assert "Cafe" in listed["categories"] and "Restaurant" in listed["categories"]

    # rename + move to another category
    moved = client.put(f"/api/whatsapp/images/{made['id']}", headers=_hdr(alice), json={"category": "Bakery", "label": "Fresh bread"}).json()
    assert (moved["category"], moved["label"]) == ("Bakery", "Fresh bread")

    # replace the picture itself
    replaced = client.put(f"/api/whatsapp/images/{made['id']}", headers=_hdr(alice), json={"data_url": _url(PNG, "image/png"), "thumb_url": _url(PNG, "image/png")}).json()
    assert replaced["id"] == made["id"] and replaced["size"] == len(PNG)

    assert client.delete(f"/api/whatsapp/images/{made['id']}", headers=_hdr(alice)).status_code == 204
    assert client.get("/api/whatsapp/images", headers=_hdr(alice)).json()["images"] == []


def test_pictures_are_private_to_their_account(client, alice, bob):
    made = _add(client, alice)
    assert client.get("/api/whatsapp/images", headers=_hdr(bob)).json()["images"] == []
    assert client.put(f"/api/whatsapp/images/{made['id']}", headers=_hdr(bob), json={"label": "mine now"}).status_code == 404
    assert client.delete(f"/api/whatsapp/images/{made['id']}", headers=_hdr(bob)).status_code == 404
    assert client.get("/api/whatsapp/images").status_code in (401, 403)
    assert client.get("/api/whatsapp/images", headers=_hdr(alice)).json()["images"][0]["label"] == "Cozy cafe"


@pytest.mark.parametrize("kind,expected", [
    ("not_a_data_url", 400),
    ("wrong_type", 400),          # not a picture type at all
    ("wrong_content", 400),       # says picture, is not one
    ("too_big", 413),
])
def test_only_real_small_pictures_are_accepted(client, alice, kind, expected):
    data_url = {
        "not_a_data_url": "not a data url",
        "wrong_type": "data:text/html;base64," + base64.b64encode(b"<script>x</script>").decode(),
        "wrong_content": _url(b"<html>pretending to be a picture</html>"),
        "too_big": _url(JPEG + b"\x00" * 1_300_000),
    }[kind]
    res = client.post("/api/whatsapp/images", headers=_hdr(alice), json={"category": "Cafe", "label": "x", "data_url": data_url, "thumb_url": _url(JPEG)})
    assert res.status_code == expected


def test_unknown_category_falls_back_to_general_and_the_limit_is_enforced(client, db_session, alice, monkeypatch):
    assert _add(client, alice, category="Spaceships")["category"] == "General"
    from app.services import message_images
    monkeypatch.setattr(message_images, "MAX_IMAGES_PER_ACCOUNT", 1)
    from app.routers import message_images as router
    monkeypatch.setattr(router, "MAX_IMAGES_PER_ACCOUNT", 1)
    res = client.post("/api/whatsapp/images", headers=_hdr(alice), json={"category": "Cafe", "label": "two", "data_url": _url(JPEG), "thumb_url": _url(JPEG)})
    assert res.status_code == 400 and "up to 1" in res.json()["detail"]


def test_a_chosen_picture_is_sent_instead_of_the_flyer_and_only_if_it_is_yours(client, db_session, alice, bob, monkeypatch):
    sent = {}

    def fake_send_text(db, to_phone, text_body, **kwargs):
        sent.update(kwargs, to=to_phone, text=text_body)
        return True, "wamid.TEST", {"mode": "simulator"}

    from app.services.whatsapp_cloud_client import WhatsAppCloudClient
    monkeypatch.setattr(WhatsAppCloudClient, "send_text", staticmethod(fake_send_text))

    mine = _add(client, alice, category="Cafe", label="Latte art")
    res = client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(alice), json={
        "shops": [{"name": "Chai Corner", "phone": "919876543210"}], "custom_message": "hello", "include_flyer": True, "image_id": mine["id"]})
    assert res.status_code == 200 and res.json()["results"][0]["status"] in ("simulated", "sent"), res.text
    assert sent["image_path"] and sent["image_path"].endswith(".jpg") and sent["send_flyer"] is False

    # the conversation records which picture went with the message
    from app.models.whatsapp import WhatsAppMessage
    assert any("[Attached picture: Latte art]" in m.message_body for m in db_session.query(WhatsAppMessage).all())

    # someone else's picture cannot be used
    sent.clear()
    stolen = client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(bob), json={
        "shops": [{"name": "Other", "phone": "919811122233"}], "custom_message": "hi", "image_id": mine["id"]})
    assert stolen.status_code == 404 and not sent


def test_without_a_picture_the_flyer_behaviour_is_unchanged(client, alice, monkeypatch):
    sent = {}
    from app.services.whatsapp_cloud_client import WhatsAppCloudClient
    monkeypatch.setattr(WhatsAppCloudClient, "send_text", staticmethod(
        lambda db, to_phone, text_body, **kw: (sent.update(kw) or (True, "wamid.T", {"mode": "simulator"}))))
    client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(alice), json={
        "shops": [{"name": "Chai Corner", "phone": "919876543210"}], "custom_message": "hello", "include_flyer": True})
    assert sent["send_flyer"] is True and sent.get("image_path") is None


# ─── MongoDB durability ──────────────────────────────────────────────────────
class _Coll:
    def __init__(self):
        self.docs = {}

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt["_id"]] = dict(doc)

    def delete_one(self, flt):
        self.docs.pop(flt["_id"], None)

    def delete_many(self, flt):
        pass

    def find(self, flt):
        return [dict(d) for d in self.docs.values() if all(d.get(k) == v for k, v in flt.items() if not isinstance(v, dict))]


class _Mongo:
    def __init__(self):
        self.colls = {}

    def __getitem__(self, name):
        return self.colls.setdefault(name, _Coll())


def test_pictures_survive_a_database_reset(client, db_session, alice, bob, monkeypatch):
    fake = _Mongo()
    monkeypatch.setattr(cd, "_db", lambda: fake)
    monkeypatch.setattr(cd, "RUN_SYNC", True)
    cd._restored_image_users.clear()
    cd._email_cache.clear()

    made = _add(client, alice, label="Survivor")
    assert any(k.startswith("alice@example.test|") for k in fake[cd.IMG_COLL].docs)

    cd._restored_image_users.clear()
    db_session.info[cd._SKIP] = True
    db_session.query(MessageImage).delete()          # what a redeploy does to the SQL database
    db_session.commit()
    db_session.info.pop(cd._SKIP, None)

    assert client.get("/api/whatsapp/images", headers=_hdr(bob)).json()["images"] == []       # privacy holds
    back = client.get("/api/whatsapp/images", headers=_hdr(alice)).json()["images"]
    assert [i["label"] for i in back] == ["Survivor"] and back[0]["uid"] == made["uid"]

    # deleting removes the copy too
    assert client.delete(f"/api/whatsapp/images/{back[0]['id']}", headers=_hdr(alice)).status_code == 204
    assert fake[cd.IMG_COLL].docs == {}
    cd._restored_image_users.clear()
    cd._email_cache.clear()
