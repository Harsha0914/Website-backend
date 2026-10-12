"""Gemini is reached over its plain web API; a failure must come back as None (never an exception) with the reason printed."""
from app.config import settings
from app.services import gemini_client


class _Resp:
    def __init__(self, status, payload):
        self.status_code, self._payload, self.text = status, payload, str(payload)

    def json(self):
        return self._payload


def test_returns_the_text_and_sends_the_key_in_a_header(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-not-real")
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.update(url=url, headers=headers, body=json)
        return _Resp(200, {"candidates": [{"content": {"parts": [{"text": "Hello "}, {"text": "there"}]}}]})

    monkeypatch.setattr(gemini_client.requests, "post", fake_post)
    assert gemini_client.gemini_generate("hi", "be kind") == "Hello there"
    assert seen["headers"]["x-goog-api-key"] == "test-key-not-real" and "test-key-not-real" not in seen["url"]
    assert seen["body"]["system_instruction"]["parts"][0]["text"] == "be kind"


def test_a_google_error_gives_none_and_prints_the_reason_not_the_key(monkeypatch, capsys):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-not-real")
    monkeypatch.setattr(gemini_client.requests, "post", lambda *a, **k: _Resp(400, {"error": {"message": "API key not valid."}}))
    assert gemini_client.gemini_generate("hi") is None
    out = capsys.readouterr().out
    assert "400" in out and "API key not valid" in out and "test-key-not-real" not in out


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(gemini_client.requests, "post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call")))
    assert gemini_client.gemini_generate("hi") is None
