"""
Talk to Google Gemini over its plain web API (no extra library), so any key type that Google accepts works.

``gemini_generate`` returns the reply text, or None when Gemini cannot answer. It never raises, and it prints the
reason (Google's own error message, never the key) so the Render logs show exactly why an answer did not come.
"""
from __future__ import annotations

from typing import Optional

import time

import requests

from app.config import settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def gemini_model() -> str:
    return (getattr(settings, "GEMINI_MODEL", "") or "gemini-3.8-flash").strip()


def gemini_generate(user_text: str, system_text: str = "", max_tokens: int = 400, temperature: float = 0.7) -> Optional[str]:
    key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    if not key:
        return None
    model = gemini_model()
    # Newer models spend part of this budget on thinking before they answer, so leave plenty of room; the prompt keeps replies short.
    config = {"temperature": temperature, "maxOutputTokens": max(max_tokens, 1500)}
    if "2.5" in model:
        config["thinkingConfig"] = {"thinkingBudget": 0}   # answer straight away; thinking tokens would eat the reply budget
    body = {"contents": [{"role": "user", "parts": [{"text": user_text}]}], "generationConfig": config}
    if system_text:
        body["system_instruction"] = {"parts": [{"text": system_text}]}
    res = None
    for attempt in range(3):            # Google sometimes answers 503 "high demand" for a moment: try again shortly
        try:
            res = requests.post(f"{_BASE}/{model}:generateContent", headers={"x-goog-api-key": key, "Content-Type": "application/json"}, json=body, timeout=15)
        except Exception as err:
            print(f"[Gemini] request failed: {type(err).__name__}")
            return None
        if res.status_code not in (429, 500, 503) or attempt == 2:
            break
        time.sleep(1.5 * (attempt + 1))
    if res.status_code != 200:
        try:
            reason = (res.json().get("error") or {}).get("message") or res.text
        except Exception:
            reason = res.text
        print(f"[Gemini] HTTP {res.status_code} for model '{model}': {str(reason)[:300]}")
        return None
    try:
        parts = res.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
    except Exception:
        print(f"[Gemini] no usable text in the answer (model '{model}'): {res.text[:300]}")
        return None
    return text or None
