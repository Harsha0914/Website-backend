from pydantic_settings import BaseSettings
from pydantic import validator
from typing import List
from pathlib import Path

import os

def _resolve_db_path() -> str:
    if os.environ.get("VERCEL"):
        return "/tmp/shop.db"
    current_file = Path(__file__).resolve()
    backend_dir = current_file.parent.parent
    workspace_root = backend_dir.parent
    candidates = [
        backend_dir / "shop.db",
        workspace_root / "shop.db",
        Path("/app/shop.db"),
        Path("/tmp/shop.db"),
    ]
    existing = [c for c in candidates if c.is_file()]
    if existing:
        return max(existing, key=lambda p: p.stat().st_size).as_posix()
    return (backend_dir / "shop.db").as_posix()

_DB_PATH = _resolve_db_path()

class Settings(BaseSettings):
    # App
    APP_NAME: str = "ShopPresence"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # Database
    DATABASE_URL: str = os.environ.get("DATABASE_URL") or f"sqlite:///{_DB_PATH}"

    # MongoDB
    # No default: MongoDB mirroring is simply disabled until MONGODB_URI is provided.
    MONGODB_URI: str = os.environ.get("MONGODB_URI") or ""
    MONGODB_DB_NAME: str = os.environ.get("MONGODB_DB_NAME") or "shop_presence"

    # Admin Registration Secret Code
    # Admin self-registration is DISABLED unless this is set (use a long random value).
    ADMIN_SECRET_CODE: str = ""

    # Google Sign-In: the OAuth client id the ID token must have been issued for.
    GOOGLE_CLIENT_ID: str = ""

    # Login / OTP abuse protection
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_MAX_FAILURES: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60

    # JWT (must be overridden outside development: see validation at the bottom)
    JWT_SECRET_KEY: str = "shop-presence-development-jwt-secret-key-12345"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        # A wildcard is never honoured; *.vercel.app / *.pages.dev / *.onrender.com are
        # allowed through allow_origin_regex in main.py, anything else must be listed.
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() not in ("development", "dev", "local", "test", "testing")

    # Google Places
    # No default: without a key the OpenStreetMap provider is used.
    GOOGLE_PLACES_API_KEY: str = ""
    USE_MOCK_PLACES: bool = False
    # When a Google key is configured, search Google live and never replace its answer with saved
    # (possibly stale or OpenStreetMap) rows. Set false only to save Google quota.
    PLACES_PREFER_LIVE_GOOGLE: bool = True

    # Gemini AI
    GEMINI_API_KEY: str = ""
    USE_RULE_BASED_CHAT: bool = False

    # OpenAI / Open Chat AI API
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # WhatsApp Integration Provider: "mr_lad" (LexonIT WhatsApp API via Mr LAD) or "meta_cloud"
    WHATSAPP_PROVIDER: str = "mr_lad"
    WHATSAPP_PHONE_NUMBER: str = "+917780181920"

    # Mr LAD API (LexonIT WhatsApp Integration)
    LAD_API_BASE_URL: str = "https://lad-waba-comms-stage-asia-axxjxdzmbq-el.a.run.app"
    LAD_AUTH_BASE_URL: str = "https://lad-backend-stage-axxjxdzmbq-uc.a.run.app"
    # Account identifier (not a secret). The password must come from LAD_AUTH_PASSWORD.
    LAD_AUTH_EMAIL: str = "api@lexonit.com"
    LAD_AUTH_PASSWORD: str = ""
    LAD_API_TOKEN: str = ""
    WHATSAPP_DEFAULT_TEMPLATE_NAME: str = "lexon_offer_link_v3"

    # Meta WhatsApp Cloud API (direct fallback)
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = "1407135925808911"
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = "2912980445715643"
    WHATSAPP_API_VERSION: str = "v22.0"
    # No default: the webhook handshake is refused until a token is configured.
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = ""
    # Meta App Secret, used to verify X-Hub-Signature-256 on incoming webhooks.
    WHATSAPP_APP_SECRET: str = ""
    # Escape hatch for local development only; never enable in production.
    WHATSAPP_ALLOW_UNSIGNED_WEBHOOK: bool = False
    WHATSAPP_IS_TEST_MODE: bool = False

    # WhatsApp automation safety limits
    WHATSAPP_DAILY_SEND_LIMIT: int = 200           # max outbound messages per rolling 24h
    WHATSAPP_MAX_BROADCAST_BATCH: int = 50         # max recipients per broadcast request
    WHATSAPP_BROADCAST_DELAY_SECONDS: float = 1.5  # pause between broadcast sends
    WHATSAPP_REPEAT_COOLDOWN_DAYS: int = 7         # no repeat pitch to the same number inside this window
    # Public address of this backend (e.g. https://my-api.onrender.com). Used for the picture links added to
    # Mr LAD notes. Leave empty on Render: its own address is detected automatically.
    PUBLIC_BASE_URL: str = ""
    WHATSAPP_POLLER_ENABLED: bool = True
    WHATSAPP_POLL_INTERVAL_SECONDS: int = 30
    WHATSAPP_REPLY_MAX_AGE_MINUTES: int = 15       # never auto-reply to inbound messages older than this
    # Off by default: a pitch goes ONLY to the shop it was sent to. (Messages sent through Mr LAD already
    # appear in the Mr LAD inbox and the WhatsApp Business account.) If set, a real copy of every pitch is
    # also sent into this number's chat, which is why it must stay empty unless that is wanted.
    WHATSAPP_ADMIN_COPY_NUMBER: str = ""

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Website Analysis
    WEBSITE_CHECK_TIMEOUT_SECONDS: int = 10
    MAX_REDIRECT_FOLLOW: int = 5

    class Config:
        import os
        _cur_dir = os.path.dirname(os.path.abspath(__file__))
        _backend_dir = os.path.dirname(_cur_dir)
        _root_dir = os.path.dirname(_backend_dir)
        env_file = (
            os.path.join(_root_dir, ".env"),
            os.path.join(_backend_dir, ".env"),
            ".env",
        )
        case_sensitive = True
        extra = "ignore"


settings = Settings()


_KNOWN_WEAK_JWT_SECRETS = {
    "shop-presence-development-jwt-secret-key-12345",
    "default-secret-key-change-in-production",
    "change-this-to-a-long-random-secret-key-in-production",
}

if settings.JWT_SECRET_KEY in _KNOWN_WEAK_JWT_SECRETS or len(settings.JWT_SECRET_KEY) < 32:
    import secrets as _secrets
    import warnings
    if settings.is_production:
        # Never run with a published/guessable signing key. Rather than crash a deployment
        # that has not been configured yet, fall back to a random per-process secret:
        # safe, but every restart signs all users out. Set JWT_SECRET_KEY to make it permanent
        # (required as soon as more than one worker/instance is used).
        settings.JWT_SECRET_KEY = _secrets.token_urlsafe(48)
        warnings.warn(
            "JWT_SECRET_KEY is missing/weak: using a random per-process secret. "
            "Users are signed out on every restart. Set JWT_SECRET_KEY (32+ random chars).",
            stacklevel=2,
        )
    else:
        warnings.warn("Using a weak JWT_SECRET_KEY: acceptable for development only.", stacklevel=2)
