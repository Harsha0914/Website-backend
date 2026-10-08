"""
First-start import of the bundled starter database into a permanent (external) database.

Why this exists: the app ships a small SQLite file (shop.db). On a host whose disk is wiped on every
deploy (Render's free plan), anything stored in that file is lost at the next deploy. Pointing
DATABASE_URL at an external PostgreSQL database keeps accounts and WhatsApp chats for good. That empty
database starts with no accounts, so on its very first start the accounts, chats and saved shops that
shipped with the app are copied in once. After that the external database is the only source of truth.
"""
import logging
import os
from typing import Dict, Optional

from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine

logger = logging.getLogger("db_bootstrap")

CHUNK = 1000


def _fix_postgres_sequences(conn, tables) -> None:
    """After inserting rows with explicit ids, move each id sequence past the highest id."""
    for table in tables:
        if "id" not in table.c or not table.c.id.primary_key:
            continue
        try:
            conn.execute(text(
                "SELECT setval(pg_get_serial_sequence(:t, 'id'), "
                f'(SELECT COALESCE(MAX(id), 0) + 1 FROM "{table.name}"), false)'), {"t": f'"{table.name}"'})
        except Exception as err:  # a table without a serial id is fine
            logger.debug("sequence fix skipped for %s: %s", table.name, err)


def seed_empty_database(target_engine: Engine, metadata, seed_path: Optional[str], allow_sqlite: bool = False) -> Dict[str, int]:
    """
    Copy every row of the bundled SQLite file into `target_engine`, but only when the target has no
    users yet (a brand-new database). Returns {table_name: rows_copied}. Never raises.
    """
    copied: Dict[str, int] = {}
    try:
        if target_engine.dialect.name == "sqlite" and not allow_sqlite:
            return copied  # the SQLite file already is the data
        if not seed_path or not os.path.exists(seed_path):
            return copied
        users = metadata.tables.get("users")
        if users is None:
            return copied
        with target_engine.connect() as conn:
            if (conn.execute(select(func.count()).select_from(users)).scalar() or 0) > 0:
                return copied  # not a fresh database: leave it alone

        source = create_engine(f"sqlite:///{seed_path}")
        source_tables = set()
        with source.connect() as sconn:
            source_tables = {r[0] for r in sconn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}

        for table in metadata.sorted_tables:  # parents before children
            if table.name not in source_tables:
                continue
            try:
                with source.connect() as sconn:
                    source_cols = {r[1] for r in sconn.execute(text(f'PRAGMA table_info("{table.name}")'))}
                    cols = [c for c in table.c if c.name in source_cols]
                    if not cols:
                        continue
                    result = sconn.execute(select(*cols))
                    total = 0
                    with target_engine.begin() as tconn:
                        while True:
                            rows = result.fetchmany(CHUNK)
                            if not rows:
                                break
                            tconn.execute(table.insert(), [dict(r._mapping) for r in rows])
                            total += len(rows)
                if total:
                    copied[table.name] = total
            except Exception as err:
                logger.warning("[db_bootstrap] could not copy table %s: %s", table.name, err)

        if "whatsapp_conversations" in copied:
            from app.db_migrations import assign_legacy_conversations
            assign_legacy_conversations(target_engine)  # bundled chats predate accounts: first account owns them
        if target_engine.dialect.name == "postgresql" and copied:
            with target_engine.begin() as conn:
                _fix_postgres_sequences(conn, metadata.sorted_tables)
        if copied:
            logger.warning("[db_bootstrap] first start: copied starter data into the external database: %s", copied)
        source.dispose()
    except Exception as err:
        logger.error("[db_bootstrap] starter import failed (the app will continue with an empty database): %s", err)
    return copied
