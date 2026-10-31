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
        # the real driver matches on any field; a document is found by its _id or by its (single) filter value
        self.docs[flt.get("_id", next(iter(flt.values())))] = dict(doc)

    def delete_one(self, flt):
        self.docs.pop(flt["_id"], None)

    def delete_many(self, flt):
        for k, d in list(self.docs.items()):
            if all(_match(d, f, v) for f, v in flt.items()):
                self.docs.pop(k)

    def find(self, flt, projection=None):
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
    cd._restored_users.clear()  # a redeploy is also a fresh process: nothing has been restored yet


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


# ─── "Already Contacted" must survive a redeploy ─────────────────────────────
def _really_sent(monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_guard.delivery_status", lambda ok, raw=None: "sent")
    monkeypatch.setattr("app.routers.ai_whatsapp_hub.delivery_status", lambda ok, raw=None: "sent")


def test_the_already_contacted_marker_comes_back_after_a_redeploy(client, db_session, mongo, monkeypatch):
    _really_sent(monkeypatch)
    alice = _user(db_session, "Alice", "alice@example.test")
    assert _pitch(client, alice, "first message")["status"] == "sent"

    _wipe_sql(db_session)
    cd._restored_users.clear()

    # straight to the results page: the chat list was never opened since the redeploy
    marked = client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(alice)).json()
    assert [c["phone_key"] for c in marked["contacted"]] == [PHONE[-10:]]
    assert marked["days"] == 30


def test_a_shop_cannot_be_messaged_twice_in_30_days_even_across_a_redeploy(client, db_session, mongo, monkeypatch):
    _really_sent(monkeypatch)
    alice = _user(db_session, "Alice", "alice@example.test")
    assert _pitch(client, alice, "first message")["status"] == "sent"

    _wipe_sql(db_session)
    cd._restored_users.clear()

    second = _pitch(client, alice, "second message, right after the redeploy")
    assert second["status"] == "skipped" and second["error"] == "recently_contacted"


def test_every_account_sees_the_contacted_shops_after_a_redeploy(client, db_session, mongo, monkeypatch):
    _really_sent(monkeypatch)
    alice = _user(db_session, "Alice", "alice@example.test")
    bob = _user(db_session, "Bob", "bob@example.test")
    _pitch(client, alice, "alice only")
    _wipe_sql(db_session)
    cd._restored_users.clear()

    assert len(client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(bob)).json()["contacted"]) == 1    # shared with every account
    assert len(client.get("/api/ai-whatsapp/recently-contacted", headers=_hdr(alice)).json()["contacted"]) == 1


# ─── Google Maps shops and the daily record ──────────────────────────────────
def _shop(place_id, name, status="NO_WEBSITE", phone="9876500000", lat=17.45, lng=78.39):
    from app.models.business import Business, WebsiteStatus
    return Business(external_place_id=place_id, name=name, category="Cafe", address="Madhapur, Hyderabad", latitude=lat, longitude=lng,
                    phone=phone, rating=4.5, review_count=10, website_status=WebsiteStatus(status), source="google_places")


def _wipe_shops(db):
    from app.models.business import Business
    db.info[cd._SKIP] = True
    db.query(Business).delete()
    db.commit()
    db.info.pop(cd._SKIP, None)


def test_google_maps_shops_are_copied_to_mongodb_when_they_are_saved(db_session, mongo):
    db_session.add(_shop("ChIJ-one", "Prime Cafe"))
    db_session.commit()
    doc = mongo[cd.BIZ_COLL].docs["ChIJ-one"]
    assert doc["name"] == "Prime Cafe" and doc["website_status"] == "NO_WEBSITE" and doc["phone"] == "9876500000"
    assert doc["location"] == {"type": "Point", "coordinates": [78.39, 17.45]}

    # a later change (for example the website check finishing) is copied too
    from app.models.business import Business, WebsiteStatus
    biz = db_session.query(Business).filter_by(external_place_id="ChIJ-one").one()
    biz.website_status = WebsiteStatus.WEBSITE_AVAILABLE
    biz.website_url = "https://primecafe.example"
    db_session.commit()
    doc = mongo[cd.BIZ_COLL].docs["ChIJ-one"]
    assert doc["website_status"] == "WEBSITE_AVAILABLE" and doc["website_url"] == "https://primecafe.example"


def test_shops_come_back_after_a_redeploy_and_are_not_duplicated(db_session, mongo):
    from sqlalchemy.orm import sessionmaker
    from app.models.business import Business, WebsiteStatus
    factory = sessionmaker(bind=db_session.get_bind())
    db_session.add_all([_shop("ChIJ-a", "Shop A"), _shop("ChIJ-b", "Shop B", status="WEBSITE_AVAILABLE", phone=None)])
    db_session.commit()

    _wipe_shops(db_session)                     # what a redeploy does to the SQL database
    assert db_session.query(Business).count() == 0

    assert cd.restore_businesses(factory) == 2
    db_session.expire_all()
    back = {b.external_place_id: b for b in db_session.query(Business).all()}
    assert set(back) == {"ChIJ-a", "ChIJ-b"}
    assert back["ChIJ-a"].name == "Shop A" and back["ChIJ-a"].phone == "9876500000" and back["ChIJ-a"].website_status == WebsiteStatus.NO_WEBSITE
    assert back["ChIJ-b"].website_status == WebsiteStatus.WEBSITE_AVAILABLE and back["ChIJ-b"].phone is None
    assert cd.restore_businesses(factory) == 0  # asking again adds nothing
    assert db_session.query(Business).count() == 2


def test_old_copies_with_the_long_status_text_still_restore(db_session, mongo):
    from sqlalchemy.orm import sessionmaker
    from app.models.business import Business, WebsiteStatus, WebsiteQuality
    mongo[cd.BIZ_COLL].docs["old"] = {"external_place_id": "old", "name": "Old Copy", "latitude": 1.0, "longitude": 2.0,
                                      "website_status": "WebsiteStatus.NO_WEBSITE", "website_quality": "WebsiteQuality.UNANALYZED"}
    assert cd.restore_businesses(sessionmaker(bind=db_session.get_bind())) == 1
    biz = db_session.query(Business).filter_by(external_place_id="old").one()
    assert biz.website_status == WebsiteStatus.NO_WEBSITE and biz.website_quality == WebsiteQuality.UNANALYZED


def test_shops_that_only_exist_in_sql_are_copied_to_mongodb_once(db_session, mongo):
    from sqlalchemy.orm import sessionmaker
    factory = sessionmaker(bind=db_session.get_bind())
    db_session.info[cd._SKIP] = True            # saved before the mirror existed
    db_session.add_all([_shop("ChIJ-x", "X"), _shop("ChIJ-y", "Y")])
    db_session.commit()
    db_session.info.pop(cd._SKIP, None)
    assert mongo[cd.BIZ_COLL].docs == {}
    assert cd.backfill_businesses(factory) == 2
    assert set(mongo[cd.BIZ_COLL].docs) == {"ChIJ-x", "ChIJ-y"}
    assert cd.backfill_businesses(factory) == 0


def test_a_daily_record_is_kept_in_mongodb_for_every_account_and_day(client, db_session, mongo, monkeypatch):
    from datetime import datetime, timedelta
    _really_sent(monkeypatch)
    alice = _user(db_session, "Alice", "alice@example.test")
    _pitch(client, alice, "first message")
    client.post("/api/ai-whatsapp/broadcast-all", headers=_hdr(alice), json={
        "shops": [{"name": "Second Shop", "phone": "919811122233"}], "custom_message": "second", "include_flyer": False})

    today = (datetime.utcnow() + timedelta(hours=5, minutes=30)).date().isoformat()
    doc = mongo[cd.DAILY_COLL].docs[f"alice@example.test|{today}"]
    assert doc["owner_email"] == "alice@example.test" and doc["date"] == today
    assert doc["messages_sent"] == 2 and doc["shops_contacted"] == 2 and doc["replies_received"] == 0


def test_the_daily_record_belongs_to_one_account(client, db_session, mongo, monkeypatch):
    _really_sent(monkeypatch)
    alice = _user(db_session, "Alice", "alice@example.test")
    bob = _user(db_session, "Bob", "bob@example.test")
    _pitch(client, alice, "alice only")
    assert all(k.startswith("alice@example.test|") for k in mongo[cd.DAILY_COLL].docs)
    assert not any(k.startswith("bob@example.test|") for k in mongo[cd.DAILY_COLL].docs)
