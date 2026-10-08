"""Upgrading an older database (the bundled shop.db) so that chats belong to accounts."""
import shutil
from pathlib import Path

# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine, text

import app.main  # noqa: F401  (loads every model)
from app.database import Base
from app.db_migrations import migrate_whatsapp_ownership

BUNDLED = Path(__file__).resolve().parent.parent / "shop.db"


def test_bundled_database_is_upgraded_in_place_and_keeps_every_chat(tmp_path):
    copy = tmp_path / "old.db"
    shutil.copy(BUNDLED, copy)
    engine = create_engine(f"sqlite:///{copy}")
    with engine.connect() as c:
        before_conv = c.execute(text("SELECT COUNT(*) FROM whatsapp_conversations")).scalar()
        before_msg = c.execute(text("SELECT COUNT(*) FROM whatsapp_messages")).scalar()
        first_user = c.execute(text("SELECT MIN(id) FROM users")).scalar()

    assert migrate_whatsapp_ownership(engine, Base.metadata) is True

    with engine.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM whatsapp_conversations")).scalar() == before_conv
        assert c.execute(text("SELECT COUNT(*) FROM whatsapp_messages")).scalar() == before_msg
        # chats that predate accounts go to the first account, and to nobody else
        owners = {r[0] for r in c.execute(text("SELECT DISTINCT owner_id FROM whatsapp_conversations"))}
        assert owners <= {first_user}
        # every message still points at an existing conversation
        orphans = c.execute(text(
            "SELECT COUNT(*) FROM whatsapp_messages m LEFT JOIN whatsapp_conversations v "
            "ON v.id = m.conversation_id WHERE v.id IS NULL")).scalar()
        assert orphans == 0
        # the same shop number may now exist once per account
        c.execute(text("INSERT INTO users (id, full_name, email, password_hash, role, is_active, created_at, updated_at) "
                       "VALUES (9001, 'Other', 'other@example.test', 'x', 'USER', 1, '2026-01-01', '2026-01-01')"))
        c.execute(text(
            "INSERT INTO whatsapp_conversations (owner_id, phone_number, shop_name, auto_ai_enabled, lead_status, lead_score, "
            "detected_intent, sentiment, priority, conversation_status, unread_count, human_takeover, opt_out, "
            "business_details_extracted, last_message_at, created_at, updated_at) "
            "SELECT 9001, phone_number, shop_name, 1, 'CONTACTED', 20, 'UNKNOWN', 'NEUTRAL', 'MEDIUM', 'AI_ACTIVE', 0, 0, 0, "
            "'{}', '2026-01-01', '2026-01-01', '2026-01-01' FROM whatsapp_conversations LIMIT 1"))
        c.commit()

    # running it again changes nothing
    assert migrate_whatsapp_ownership(engine, Base.metadata) is False
