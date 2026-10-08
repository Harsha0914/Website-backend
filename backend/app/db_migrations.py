"""
One-time, idempotent schema upgrade for per-account WhatsApp data.

Older databases have `whatsapp_conversations` without `owner_id` and with the phone number unique across
the whole table. After the upgrade every conversation belongs to exactly one account and the same shop
number can exist once per account. Conversations that existed before accounts owned chats are given to the
first account that was created (the original owner of this installation).
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateIndex, CreateTable

logger = logging.getLogger("db_migrations")

TABLE = "whatsapp_conversations"


def assign_legacy_conversations(engine: Engine) -> int:
    """Give every ownerless conversation to the first account. Returns how many rows changed."""
    try:
        with engine.begin() as conn:
            first_user = conn.execute(text("SELECT MIN(id) FROM users")).scalar()
            if not first_user:
                return 0
            result = conn.execute(
                text(f"UPDATE {TABLE} SET owner_id = :uid WHERE owner_id IS NULL"), {"uid": first_user})
            return result.rowcount or 0
    except Exception as err:
        logger.error("[migrate] could not assign existing chats to the first account: %s", err)
        return 0


def _rebuild_sqlite(engine: Engine, table) -> None:
    """SQLite cannot drop a UNIQUE constraint in place, so rebuild the table with the new definition."""
    raw = engine.raw_connection()
    try:
        raw.isolation_level = None  # we control the transaction explicitly
        cur = raw.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.execute("PRAGMA legacy_alter_table=ON")  # keep child tables pointing at the NAME, not the renamed table
        cur.execute("BEGIN")
        try:
            cur.execute(f"ALTER TABLE {TABLE} RENAME TO _wc_legacy")
            for (name,) in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='_wc_legacy' AND sql IS NOT NULL"
            ).fetchall():
                cur.execute(f'DROP INDEX IF EXISTS "{name}"')
            dialect = engine.dialect
            cur.execute(str(CreateTable(table).compile(dialect=dialect)))
            for index in table.indexes:
                cur.execute(str(CreateIndex(index).compile(dialect=dialect)))
            old_cols = {row[1] for row in cur.execute("PRAGMA table_info(_wc_legacy)").fetchall()}
            common = [c.name for c in table.c if c.name in old_cols]
            cols = ", ".join(f'"{c}"' for c in common)
            cur.execute(f"INSERT INTO {TABLE} ({cols}) SELECT {cols} FROM _wc_legacy")
            cur.execute("DROP TABLE _wc_legacy")
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise
        finally:
            cur.execute("PRAGMA legacy_alter_table=OFF")
            cur.execute("PRAGMA foreign_keys=ON")
    finally:
        raw.close()


def _upgrade_postgres(engine: Engine) -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
        for uc in insp.get_unique_constraints(TABLE):
            if uc.get("column_names") == ["phone_number"] and uc.get("name"):
                conn.execute(text(f'ALTER TABLE {TABLE} DROP CONSTRAINT "{uc["name"]}"'))
        for ix in insp.get_indexes(TABLE):
            if ix.get("unique") and ix.get("column_names") == ["phone_number"]:
                conn.execute(text(f'DROP INDEX IF EXISTS "{ix["name"]}"'))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{TABLE}_phone_number ON {TABLE} (phone_number)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{TABLE}_owner_id ON {TABLE} (owner_id)"))
        conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_owner_phone ON {TABLE} (owner_id, phone_number)"))


def migrate_whatsapp_ownership(engine: Engine, metadata) -> bool:
    """Upgrade an older database in place. Returns True if an upgrade was performed. Never raises."""
    try:
        insp = inspect(engine)
        if TABLE not in insp.get_table_names():
            return False
        if "owner_id" in {c["name"] for c in insp.get_columns(TABLE)}:
            return False
        if engine.dialect.name == "sqlite":
            _rebuild_sqlite(engine, metadata.tables[TABLE])
        elif engine.dialect.name == "postgresql":
            _upgrade_postgres(engine)
        else:
            return False
        moved = assign_legacy_conversations(engine)
        logger.warning("[migrate] chats are now per account; %s existing chat(s) given to the first account", moved)
        return True
    except Exception as err:
        logger.error("[migrate] per-account chat upgrade failed: %s", err)
        return False
