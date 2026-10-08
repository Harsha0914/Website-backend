"""The first-start import of the bundled starter database into a new external database."""
import os

# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine, func, select, text

import app.main  # noqa: F401  (loads every model so Base.metadata is complete)
from app.database import Base
from app.db_bootstrap import seed_empty_database


def _make_db(path):
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    return engine


def _count(engine, name):
    with engine.connect() as c:
        return c.execute(select(func.count()).select_from(Base.metadata.tables[name])).scalar()


def _add_user(engine, uid, name, email):
    t = Base.metadata.tables["users"]
    with engine.begin() as c:
        c.execute(t.insert().values(id=uid, full_name=name, email=email, password_hash="x"))


def _starter(path):
    engine = _make_db(path)
    _add_user(engine, 7, "Owner", "owner@example.test")
    T = Base.metadata.tables
    with engine.begin() as c:
        c.execute(T["whatsapp_conversations"].insert().values(id=3, phone_number="919000000001", shop_name="Starter Shop"))
        c.execute(T["whatsapp_messages"].insert().values(
            id=5, conversation_id=3, direction="OUTBOUND", sender_type="MANUAL_OPERATOR", sender_name="Op", message_body="hello"))
    engine.dispose()


def test_empty_database_gets_the_starter_accounts_and_chats(tmp_path):
    seed = str(tmp_path / "seed.db")
    _starter(seed)
    target = _make_db(tmp_path / "target.db")

    copied = seed_empty_database(target, Base.metadata, seed, allow_sqlite=True)

    assert copied["users"] == 1 and copied["whatsapp_conversations"] == 1 and copied["whatsapp_messages"] == 1
    assert _count(target, "users") == 1 and _count(target, "whatsapp_messages") == 1


def test_a_database_that_already_has_users_is_left_alone(tmp_path):
    seed = str(tmp_path / "seed.db")
    _starter(seed)
    target = _make_db(tmp_path / "target.db")
    _add_user(target, 1, "Someone", "s@example.test")

    assert seed_empty_database(target, Base.metadata, seed, allow_sqlite=True) == {}
    assert _count(target, "users") == 1 and _count(target, "whatsapp_messages") == 0


def test_second_start_does_not_import_again(tmp_path):
    seed = str(tmp_path / "seed.db")
    _starter(seed)
    target = _make_db(tmp_path / "target.db")
    seed_empty_database(target, Base.metadata, seed, allow_sqlite=True)
    with target.begin() as c:
        c.execute(text("DELETE FROM whatsapp_messages"))  # the user clears their chats
    assert seed_empty_database(target, Base.metadata, seed, allow_sqlite=True) == {}
    assert _count(target, "whatsapp_messages") == 0


def test_sqlite_target_and_missing_seed_do_nothing(tmp_path):
    target = _make_db(tmp_path / "t.db")
    assert seed_empty_database(target, Base.metadata, str(tmp_path / "nope.db"), allow_sqlite=True) == {}
    seed = str(tmp_path / "seed.db")
    _starter(seed)
    assert seed_empty_database(target, Base.metadata, seed) == {}  # plain SQLite target: never copies
