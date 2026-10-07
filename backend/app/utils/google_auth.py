"""Server-side verification of Google Sign-In ID tokens."""
import time
from typing import Any, Dict, Optional

# pyrefly: ignore [missing-import]
import requests

from app.config import settings

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleAuthError(Exception):
    pass


def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """
    Validates the ID token with Google and checks audience, issuer, expiry and that the
    email is verified. Returns {"email", "name", "sub"}. Raises GoogleAuthError otherwise.
    """
    client_id = (settings.GOOGLE_CLIENT_ID or "").strip()
    if not client_id:
        raise GoogleAuthError("Google sign-in is not configured on this server.")
    if not id_token or len(id_token) > 4096:
        raise GoogleAuthError("Invalid Google token.")

    try:
        res = requests.get(_TOKENINFO_URL, params={"id_token": id_token}, timeout=8)
    except Exception:
        raise GoogleAuthError("Could not reach Google to verify the token.")
    if res.status_code != 200:
        raise GoogleAuthError("Invalid Google token.")

    data = res.json()
    if data.get("aud") != client_id:
        raise GoogleAuthError("Google token was not issued for this application.")
    if data.get("iss") not in _VALID_ISSUERS:
        raise GoogleAuthError("Invalid Google token issuer.")
    if str(data.get("email_verified")).lower() != "true":
        raise GoogleAuthError("Google account email is not verified.")
    try:
        if int(data.get("exp", 0)) < time.time():
            raise GoogleAuthError("Google token has expired.")
    except ValueError:
        raise GoogleAuthError("Invalid Google token.")

    email: Optional[str] = (data.get("email") or "").strip().lower()
    if not email:
        raise GoogleAuthError("Google token has no email.")
    return {"email": email, "name": data.get("name") or "", "sub": data.get("sub")}
