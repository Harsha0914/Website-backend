import os
# pyrefly: ignore [missing-import]
from fastapi import Depends, FastAPI
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from slowapi import _rate_limit_exceeded_handler
# pyrefly: ignore [missing-import]
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.auth.dependencies import require_admin
from app.database import engine, Base
import app.models  # Ensure all models are registered with Base

from app.routers import (
    auth,
    users,
    businesses,
    searches,
    website,
    chat,
    admin,
    whatsapp,
    ai_whatsapp_hub,
)

# Initialize database tables on startup
Base.metadata.create_all(bind=engine)

# A brand-new external database (DATABASE_URL set to PostgreSQL) gets the accounts and chats that ship
# with the app copied in once, so nobody has to re-register. Does nothing for SQLite or a used database.
from app.db_bootstrap import seed_empty_database  # noqa: E402
from app.db_migrations import migrate_whatsapp_ownership  # noqa: E402
from app.config import _DB_PATH  # noqa: E402
migrate_whatsapp_ownership(engine, Base.metadata)  # older databases: chats become per-account
seed_empty_database(engine, Base.metadata, _DB_PATH)

# Chats are mirrored to MongoDB (when configured) so they survive restarts; copy what already exists once.
from app.services import chat_durability  # noqa: E402  (importing installs the change listeners)
from app.database import SessionLocal  # noqa: E402
chat_durability.start_backfill(SessionLocal)

def _ensure_sqlite_columns():
    try:
        # Only run on SQLite
        if not str(engine.url).startswith("sqlite"):
            return
        # pyrefly: ignore [missing-import]
        from sqlalchemy import text
        with engine.connect() as conn:
            # Check businesses columns
            result = conn.execute(text("PRAGMA table_info(businesses)"))
            columns = [row[1] for row in result.fetchall()]
            if columns:
                if "short_address" not in columns:
                    conn.execute(text("ALTER TABLE businesses ADD COLUMN short_address VARCHAR(255)"))
                if "google_maps_uri" not in columns:
                    conn.execute(text("ALTER TABLE businesses ADD COLUMN google_maps_uri VARCHAR(500)"))
            
            # Check whatsapp_conversations columns
            res_c = conn.execute(text("PRAGMA table_info(whatsapp_conversations)"))
            c_cols = [row[1] for row in res_c.fetchall()]
            if c_cols:
                if "owner_name" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN owner_name VARCHAR(255)"))
                if "lead_score" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN lead_score INTEGER DEFAULT 20"))
                if "detected_intent" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN detected_intent VARCHAR(50) DEFAULT 'UNKNOWN'"))
                if "sentiment" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN sentiment VARCHAR(20) DEFAULT 'NEUTRAL'"))
                if "priority" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN priority VARCHAR(20) DEFAULT 'MEDIUM'"))
                if "conversation_status" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN conversation_status VARCHAR(50) DEFAULT 'AI_ACTIVE'"))
                if "assigned_user_id" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN assigned_user_id INTEGER"))
                if "follow_up_date" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN follow_up_date DATETIME"))
                if "follow_up_note" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN follow_up_note TEXT"))
                if "opt_out" not in c_cols:
                    conn.execute(text("ALTER TABLE whatsapp_conversations ADD COLUMN opt_out BOOLEAN DEFAULT 0"))

            # Check whatsapp_messages columns
            res_m = conn.execute(text("PRAGMA table_info(whatsapp_messages)"))
            m_cols = [row[1] for row in res_m.fetchall()]
            if m_cols:
                if "intent" not in m_cols:
                    conn.execute(text("ALTER TABLE whatsapp_messages ADD COLUMN intent VARCHAR(50)"))
                if "confidence_score" not in m_cols:
                    conn.execute(text("ALTER TABLE whatsapp_messages ADD COLUMN confidence_score FLOAT DEFAULT 0.85"))
                if "ai_generated" not in m_cols:
                    conn.execute(text("ALTER TABLE whatsapp_messages ADD COLUMN ai_generated BOOLEAN DEFAULT 0"))
                if "tokens_used" not in m_cols:
                    conn.execute(text("ALTER TABLE whatsapp_messages ADD COLUMN tokens_used INTEGER DEFAULT 0"))

            conn.commit()
    except Exception as e:
        print(f"Database column migration note: {e}")

_ensure_sqlite_columns()

from app.rate_limit import limiter

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Nearby Grocery & Shop Website Presence Detection Platform API",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list + [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://localhost:8001",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_origin_regex=r"https://.*(\.vercel\.app|\.pages\.dev|\.onrender\.com)",
    allow_credentials=False,  # auth is a Bearer header, never a cookie: nothing needs credentialed CORS
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(businesses.router)
app.include_router(searches.router)
app.include_router(website.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(whatsapp.router)
app.include_router(whatsapp.webhook_router)
app.include_router(ai_whatsapp_hub.router)

# Serve flyer image directly
from fastapi.responses import FileResponse
@app.get("/images/easybillbro-flyer.jpg")
@app.get("/images/flyer.jpg")
@app.get("/static/images/easybillbro-flyer.jpg")
def get_flyer_image():
    for candidate in [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static", "images", "easybillbro-flyer.jpg")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "images", "easybillbro-flyer.jpg")),
    ]:
        if os.path.exists(candidate):
            return FileResponse(candidate, media_type="image/jpeg")
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Flyer image not found")

@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs"
    }

@app.get("/health")
@app.get("/api/health")
def health_check():
    """Public liveness probe: deliberately reveals nothing about infrastructure."""
    return {"status": "healthy"}


@app.get("/api/health/mongodb", dependencies=[Depends(require_admin)])
def mongodb_health():
    from app.mongodb import get_mongo_status
    return get_mongo_status()


@app.on_event("startup")
async def start_whatsapp_background_poller():
    """
    Background worker that syncs incoming WhatsApp messages from the Mr LAD API and runs
    each new one through the same AI pipeline as the Meta webhook.

    Safe by default: honours WHATSAPP_POLLER_ENABLED, polls every
    WHATSAPP_POLL_INTERVAL_SECONDS (default 30s, minimum 10s), backs off on repeated
    failures and logs errors instead of swallowing them.
    """
    import asyncio
    import logging

    if not settings.WHATSAPP_POLLER_ENABLED:
        return
    if (settings.WHATSAPP_PROVIDER or "").lower() != "mr_lad":
        return

    log = logging.getLogger("whatsapp.poller")

    async def _poller():
        await asyncio.sleep(2)
        interval = max(10, int(settings.WHATSAPP_POLL_INTERVAL_SECONDS or 30))
        failures = 0
        while True:
            try:
                from app.database import SessionLocal
                from app.services.mr_lad_client import MrLadWhatsAppClient

                db = SessionLocal()
                try:
                    result = await asyncio.to_thread(MrLadWhatsAppClient.sync_recent_conversations, db)
                finally:
                    db.close()
                if result.get("status") == "error":
                    failures += 1
                    log.warning("WhatsApp sync error: %s", result.get("message"))
                else:
                    failures = 0
            except Exception:
                failures += 1
                log.exception("WhatsApp poller iteration failed")
            # exponential back-off (max 10 minutes) while the gateway is failing
            await asyncio.sleep(min(interval * (2 ** min(failures, 5)), 600) if failures else interval)

    asyncio.create_task(_poller())
