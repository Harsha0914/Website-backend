"""
Chats are mirrored to MongoDB and come back after the SQL database is reset (a redeploy), only for their owner.
A small in-memory stand-in plays the part of MongoDB; nothing here touches a real database.
"""
import pytest

from app.auth.jwt import create_access_token
from app.models.user import User, UserRole
from app.models.whatsapp import WhatsAppConversation, WhatsAppMessage
from app.services import chat_durability as cd
from app.utils.security import hash_password

PHONE = "919876543210"


class FakeCursor(list):
    def sort(self, *_a, **_k):
        return self


class FakeColl:
    def __init__(self):
        self.docs = {}

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt["_id"]] = dict(doc)

    def delete_one(self, flt):
        self.docs.pop(flt["_id"], None)

    def delete_many(self, flt):
        for k, d in list(self.docs.items()):
            if all(_match(d, f, v) for f, v in flt.items()):
                self.docs.pop(k)

    def find(self, flt):
        return FakeCursor(dict(d) for d in self.docs.values() if all(_match(d, f, v) for f, v in flt.items()))


def _match(doc, field, cond):
    value = doc.get(field)
    if isinstance(cond, dict) and "$regex" in cond:
        import re
        return re.search(cond["$regex"], str(value)) is not None
    return value == cond


class FakeMongo:
    def __init__(self):
        self.colls = {}

    def __getitem__(self, name):
        return self.colls.setdefault(name, FakeColl())


@pytest.fixture
def mongo(monkeypatch):
    fake = FakeMongo()
    monkeypatch.setattr(cd, "_db", lambda: fake)
    monkeypatch.setattr(cd, "RUN_SYNC", True)
    cd._restored_users.clear()
    cd._email_cache.clear()
    yield fake
    cd._restored_users.clear()
    cd._email_cache.clear()


def _user(db, name, email):
    u = User(full_name=name, email=email, password_hash=hash_password("Password123"), role=UserRole.USER, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _hdr(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _pitch(client, user, text):
    res = client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(user), json={
        "shops": [{"name": "Chai Corner", "phone": PHONE}], "custom_message": text, "include_flyer": False})
    assert res.status_code == 200, res.text
    return res.json()["results"][0]


def _wipe_sql(db):
    """What a redeploy does: the SQL database goes back to an empty starter."""
    cd_skip = db.info
    cd_skip[cd._SKIP] = True
    db.query(WhatsAppMessage).delete()
    db.query(WhatsAppConversation).delete()
    db.commit()
    cd_skip.pop(cd._SKIP, None)


def test_every_saved_chat_is_copied_to_mongodb(client, db_session, mongo):
    alice = _user(db_session, "Alice", "alice@example.test")
    _pitch(client, alice, "hello from alice")

    convs = mongo[cd.CONV_COLL].docs
    msgs = mongo[cd.MSG_COLL].docs
    assert list(convs) == [f"alice@example.test|{PHONE}"]
    assert convs[f"alice@example.test|{PHONE}"]["shop_name"] == "Chai Corner"
    assert any("hello from alice" in d["message_body"] for d in msgs.values())
    assert all(d["conv_key"] == f"alice@example.test|{PHONE}" for d in msgs.values())


def test_chats_come_back_after_the_sql_database_is_reset(client, db_session, mongo):
    alice = _user(db_session, "Alice", "alice@example.test")
    first = _pitch(client, alice, "message one")
    assert first["status"] in ("sent", "simulated")
    before = client.get(f"/api/whatsapp/conversations/{first['conversation_id']}", headers=_hdr(alice)).json()["messages"]

    _wipe_sql(db_session)
    assert db_session.query(WhatsAppConversation).count() == 0

    # opening the chat list restores them (even though the user id could differ after a rebuild)
    listed = client.get("/api/whatsapp/conversations", headers=_hdr(alice)).json()
    assert len(listed) == 1 and listed[0]["shop_name"] == "Chai Corner"
    after = client.get(f"/api/whatsapp/conversations/{listed[0]['id']}", headers=_hdr(alice)).json()["messages"]
    assert [m["message_body"] for m in after] == [m["message_body"] for m in before]

    # asking again does not duplicate anything
    cd._restored_users.clear()
    client.get("/api/whatsapp/conversations", headers=_hdr(alice))
    assert db_session.query(WhatsAppMessage).count() == len(before)


def test_restored_chats_belong_only_to_their_owner(client, db_session, mongo):
    alice = _user(db_session, "Alice", "alice@example.test")
    bob = _user(db_session, "Bob", "bob@example.test")
    _pitch(client, alice, "private to alice")
    _wipe_sql(db_session)

    assert client.get("/api/whatsapp/conversations", headers=_hdr(bob)).json() == []
    assert client.get("/api/ai-whatsapp/conversations", headers=_hdr(bob)).json()["conversations"] == []
    assert len(client.get("/api/whatsapp/conversations", headers=_hdr(alice)).json()) == 1


def test_new_messages_after_a_restart_are_merged_with_the_old_ones(client, db_session, mongo):
    alice = _user(db_session, "Alice", "alice@example.test")
    _pitch(client, alice, "before the restart")
    _wipe_sql(db_session)
    cd._restored_users.clear()

    # a fresh chat is started before the account has opened its list (the restart case)
    _pitch(client, alice, "after the restart")
    client.get("/api/whatsapp/conversations", headers=_hdr(alice))

    bodies = [m.message_body for m in db_session.query(WhatsAppMessage).all()]
    assert any("before the restart" in b for b in bodies)
    assert any("after the restart" in b for b in bodies)


def test_reset_removes_the_copy_in_mongodb_too(client, db_session, mongo):
    alice = _user(db_session, "Alice", "alice@example.test")
    _pitch(client, alice, "to be reset")
    assert mongo[cd.CONV_COLL].docs

    assert client.delete("/api/whatsapp/reset", headers=_hdr(alice)).status_code == 200
    assert mongo[cd.CONV_COLL].docs == {} and mongo[cd.MSG_COLL].docs == {}


def test_a_mongodb_outage_never_breaks_sending(client, db_session, monkeypatch):
    monkeypatch.setattr(cd, "RUN_SYNC", True)
    monkeypatch.setattr(cd, "_db", lambda: None)  # MongoDB not configured or down
    alice = _user(db_session, "Alice", "alice@example.test")
    assert _pitch(client, alice, "still works")["status"] in ("sent", "simulated")
    assert len(client.get("/api/whatsapp/conversations", headers=_hdr(alice)).json()) == 1

    class Broken:
        def __getitem__(self, _):
            raise RuntimeError("mongo is down")

    monkeypatch.setattr(cd, "_db", lambda: Broken())
    cd._restored_users.clear()
    assert _pitch(client, alice, "still works 2")["status"] in ("sent", "simulated", "skipped")
    assert client.get("/api/whatsapp/conversations", headers=_hdr(alice)).status_code == 200
