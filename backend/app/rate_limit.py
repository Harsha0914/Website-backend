"""Shared slowapi limiter (imported by main.py and by routers that need per-route limits)."""
# pyrefly: ignore [missing-import]
from slowapi import Limiter
# pyrefly: ignore [missing-import]
from starlette.requests import Request

from app.config import settings


def client_key(request: Request) -> str:
    """
    Client identity for rate limiting behind a reverse proxy (Render / Vercel rewrite).
    The right-most X-Forwarded-For entry is the one appended by OUR trusted proxy; the
    left-most entries are client-controlled and must never be used.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_key, enabled=settings.RATE_LIMIT_ENABLED)
