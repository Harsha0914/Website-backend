"""
Regression tests for the non-WhatsApp security audit (auth, secrets, SSRF, CORS, exposure).
"""
import asyncio
import os
import subprocess
import sys

# pyrefly: ignore [missing-import]
import httpx
# pyrefly: ignore [missing-import]
import pytest

from app.config import settings
from app.models.user import User, UserRole
from app.rate_limit import limiter
from app.services import email_service
from app.utils import login_throttle, net_safety
from app.utils.security import hash_password, verify_password

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN_CODE = "test-admin-code-123"
STRONG = "NewPassw0rd!"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register(client, **over):
    body = {
        "username": "alice", "full_name": "Alice", "email": "alice@example.com",
        "password": "AlicePass1", "confirm_password": "AlicePass1", "role": "USER",
    }
    body.update(over)
    return client.post("/api/auth/register", json=body)


# ── Password reset ───────────────────────────────────────────────────────────
def test_reset_password_requires_current_password(client, normal_user, db_session):
    res = client.post("/api/auth/reset-password", json={"email": "user@example.com", "new_password": STRONG})
    assert res.status_code == 422  # old_password is mandatory
    res = client.post("/api/auth/reset-password",
                      json={"email": "user@example.com", "old_password": "WrongPass1", "new_password": STRONG})
    assert res.status_code == 400
    assert verify_password("Password123", db_session.query(User).filter_by(email="user@example.com").one().password_hash)


def test_reset_password_never_provisions_accounts(client, db_session):
    for email in ("someone@example.com", "admin@evil.example", "boss@shoppresence.com"):
        res = client.post("/api/auth/reset-password",
                          json={"email": email, "old_password": "Whatever1", "new_password": STRONG})
        assert res.status_code == 400
        res = client.post("/api/auth/forgot-password", json={"email": email})
        assert res.status_code == 200
    assert db_session.query(User).count() == 0


def test_reset_password_with_correct_old_password(client, normal_user):
    res = client.post("/api/auth/reset-password",
                      json={"email": "user@example.com", "old_password": "Password123", "new_password": STRONG})
    assert res.status_code == 200
    assert client.post("/api/auth/login", json={"username": "user@example.com", "password": STRONG}).status_code == 200


def test_otp_request_response_is_identical_for_unknown_and_known_accounts(client, normal_user):
    known = client.post("/api/auth/send-otp", json={"email": "user@example.com"}).json()
    unknown = client.post("/api/auth/send-otp", json={"email": "ghost@example.com"}).json()
    assert known["message"] == unknown["message"]
    assert set(known) == set(unknown)
    assert "dev_otp" not in known and "otp" not in known


def test_otp_is_never_returned_in_production(client, normal_user, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    res = client.post("/api/auth/send-otp", json={"email": "user@example.com"}).json()
    assert "dev_otp" not in res


def test_no_backdoor_otp(client, normal_user):
    for code in ("123456", "999999"):
        res = client.post("/api/auth/verify-otp-reset-password", json={
            "email": "user@example.com", "otp": code, "new_password": STRONG, "confirm_password": STRONG})
        assert res.status_code == 400
    email_service.store_otp("user@example.com", "482913")
    for code in ("123456", "999999"):  # still not accepted while a real code exists
        assert email_service.verify_otp("user@example.com", code) is False


def test_otp_flow_is_single_use_and_changes_password(client, normal_user):
    email_service.store_otp("user@example.com", "482913")
    body = {"email": "user@example.com", "otp": "482913", "new_password": STRONG, "confirm_password": STRONG}
    assert client.post("/api/auth/verify-otp-reset-password", json=body).status_code == 200
    assert client.post("/api/auth/verify-otp-reset-password", json=body).status_code == 400  # replay
    assert client.post("/api/auth/login", json={"username": "user@example.com", "password": STRONG}).status_code == 200


def test_otp_dies_after_too_many_wrong_guesses():
    email_service.store_otp("a@example.com", "111111")
    for _ in range(settings.OTP_MAX_ATTEMPTS):
        assert email_service.verify_otp("a@example.com", "000000") is False
    assert email_service.verify_otp("a@example.com", "111111") is False  # burnt


def test_otp_expires(monkeypatch):
    email_service.store_otp("a@example.com", "111111", expire_seconds=-1)
    assert email_service.verify_otp("a@example.com", "111111") is False


def test_otp_resend_cooldown():
    assert email_service.can_issue_otp("a@example.com") is True
    email_service.store_otp("a@example.com", "111111")
    assert email_service.can_issue_otp("a@example.com") is False


def test_otp_is_generated_with_csprng():
    codes = {email_service.generate_otp(6) for _ in range(50)}
    assert all(len(c) == 6 and c.isdigit() for c in codes) and len(codes) > 40


def test_reset_cannot_reactivate_deactivated_account(client, normal_user, db_session):
    normal_user.is_active = False
    db_session.commit()
    email_service.store_otp("user@example.com", "482913")
    res = client.post("/api/auth/verify-otp-reset-password", json={
        "email": "user@example.com", "otp": "482913", "new_password": STRONG, "confirm_password": STRONG})
    assert res.status_code == 400
    db_session.refresh(normal_user)
    assert normal_user.is_active is False


# ── Registration / admin code ────────────────────────────────────────────────
def test_admin_registration_requires_the_configured_code(client):
    assert _register(client, role="ADMIN").status_code == 403                         # code omitted (old bypass)
    assert _register(client, role="ADMIN", admin_code="WRONG").status_code == 403
    assert _register(client, role="ADMIN", admin_code="ADMIN2026").status_code == 403  # old published default
    ok = _register(client, role="ADMIN", admin_code=ADMIN_CODE)
    assert ok.status_code == 201 and ok.json()["role"] == "ADMIN"


def test_admin_registration_disabled_when_no_code_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_SECRET_CODE", "")
    assert _register(client, role="ADMIN", admin_code="").status_code == 403
    assert _register(client, role="ADMIN", admin_code="anything").status_code == 403
    assert _register(client, username="bob", email="bob@example.com").status_code == 201  # normal users unaffected


def test_unknown_role_string_never_becomes_admin(client):
    res = _register(client, role="SUPERUSER")
    assert res.status_code == 201 and res.json()["role"] == "USER"


# ── Login ────────────────────────────────────────────────────────────────────
def test_login_errors_do_not_reveal_whether_account_exists(client, normal_user):
    unknown = client.post("/api/auth/login", json={"username": "nobody@example.com", "password": "Password123"})
    wrong = client.post("/api/auth/login", json={"username": "user@example.com", "password": "Wrong12345"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


def test_login_does_not_reactivate_deactivated_accounts(client, normal_user, db_session):
    normal_user.is_active = False
    db_session.commit()
    res = client.post("/api/auth/login", json={"username": "user@example.com", "password": "Password123"})
    assert res.status_code == 403
    db_session.refresh(normal_user)
    assert normal_user.is_active is False


def test_login_lockout_after_repeated_failures(client, normal_user):
    for _ in range(settings.LOGIN_MAX_FAILURES):
        assert client.post("/api/auth/login", json={"username": "user@example.com", "password": "Bad123456"}).status_code == 401
    locked = client.post("/api/auth/login", json={"username": "user@example.com", "password": "Password123"})
    assert locked.status_code == 429  # even the right password is refused while locked


def test_successful_login_clears_failure_counter(client, normal_user):
    for _ in range(settings.LOGIN_MAX_FAILURES - 1):
        client.post("/api/auth/login", json={"username": "user@example.com", "password": "Bad123456"})
    assert client.post("/api/auth/login", json={"username": "user@example.com", "password": "Password123"}).status_code == 200
    assert login_throttle.is_locked("user@example.com") is False


def test_per_ip_rate_limit_on_otp_requests(client, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    try:
        codes = [client.post("/api/auth/send-otp", json={"email": "x@example.com"}).status_code for _ in range(7)]
    finally:
        limiter.reset()
    assert codes[:5] == [200] * 5 and 429 in codes[5:]


def test_plaintext_password_fallback_is_gone():
    assert verify_password("secret", "secret") is False
    assert verify_password("", hash_password("x")) is False
    assert verify_password("Password123", hash_password("Password123")) is True


def test_refresh_rejects_access_tokens(client, normal_user, user_token):
    res = client.post("/api/auth/refresh", json={"refresh_token": user_token})
    assert res.status_code == 401


# ── Google sign-in ───────────────────────────────────────────────────────────
def test_google_login_disabled_without_client_id(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    assert client.post("/api/auth/google", json={"id_token": "x"}).status_code == 503


def test_google_login_ignores_unverified_email_payloads(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid")
    # the old contract (email + role in the body) is no longer accepted at all
    assert client.post("/api/auth/google", json={"email": "victim@example.com", "role": "ADMIN"}).status_code == 422


def test_google_login_rejects_bad_token(client, monkeypatch):
    from app.utils import google_auth
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid")

    class R:
        status_code = 400
        def json(self): return {}
    monkeypatch.setattr(google_auth.requests, "get", lambda *a, **k: R())
    assert client.post("/api/auth/google", json={"id_token": "forged"}).status_code == 401


@pytest.mark.parametrize("claims,ok", [
    ({"aud": "cid", "iss": "accounts.google.com", "email_verified": "true", "email": "g@example.com", "exp": "9999999999"}, True),
    ({"aud": "other", "iss": "accounts.google.com", "email_verified": "true", "email": "g@example.com", "exp": "9999999999"}, False),
    ({"aud": "cid", "iss": "evil.example", "email_verified": "true", "email": "g@example.com", "exp": "9999999999"}, False),
    ({"aud": "cid", "iss": "accounts.google.com", "email_verified": "false", "email": "g@example.com", "exp": "9999999999"}, False),
    ({"aud": "cid", "iss": "accounts.google.com", "email_verified": "true", "email": "g@example.com", "exp": "1"}, False),
])
def test_google_token_validation_rules(client, monkeypatch, claims, ok):
    from app.utils import google_auth
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid")

    class R:
        status_code = 200
        def json(self): return claims
    monkeypatch.setattr(google_auth.requests, "get", lambda *a, **k: R())
    res = client.post("/api/auth/google", json={"id_token": "tok"})
    assert (res.status_code == 200) is ok
    if ok:
        assert res.json()["role"] == "USER"  # never admin


# ── Secrets / configuration ──────────────────────────────────────────────────
def _import_config(env_overrides):
    env = {k: v for k, v in os.environ.items() if k not in ("JWT_SECRET_KEY", "ENVIRONMENT")}
    env.update(env_overrides)
    return subprocess.run([sys.executable, "-c", "import app.config"], cwd=BACKEND_DIR, env=env,
                          capture_output=True, text=True)


def _jwt_secret_in_subprocess(env_overrides):
    env = {k: v for k, v in os.environ.items() if k not in ("JWT_SECRET_KEY", "ENVIRONMENT")}
    env.update(env_overrides)
    out = subprocess.run(
        [sys.executable, "-W", "ignore", "-c", "from app.config import settings; print(settings.JWT_SECRET_KEY)"],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def test_production_never_uses_a_published_or_weak_jwt_secret():
    published = {"shop-presence-development-jwt-secret-key-12345", "default-secret-key-change-in-production"}
    for override in ({}, {"JWT_SECRET_KEY": "short"},
                     {"JWT_SECRET_KEY": "default-secret-key-change-in-production"}):
        secret = _jwt_secret_in_subprocess({"ENVIRONMENT": "production", **override})
        assert secret not in published and len(secret) >= 32
    # random per process: two boots never share a key
    assert _jwt_secret_in_subprocess({"ENVIRONMENT": "production"}) != _jwt_secret_in_subprocess({"ENVIRONMENT": "production"})


def test_configured_jwt_secret_is_used_as_is():
    assert _jwt_secret_in_subprocess({"ENVIRONMENT": "production", "JWT_SECRET_KEY": "x" * 48}) == "x" * 48


def test_no_secrets_baked_into_source():
    root = os.path.join(BACKEND_DIR, "app")
    needles = ["lhLFCsQF3TZgLbcv", "AIzaSyCpffOtfEnMdrrv16", "Solution@lit123", "ADMIN2026",
               "shoppresence_whatsapp_webhook_token_123", "harshavardhan_db_user"]
    hits = []
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.endswith(".py"):
                text = open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read()
                hits += [(f, n) for n in needles if n in text]
    assert hits == []
    assert settings.MONGODB_URI == "" and settings.GOOGLE_PLACES_API_KEY == ""


def test_cors_wildcard_is_ignored_and_foreign_origins_are_not_allowed(client, monkeypatch):
    monkeypatch.setattr(settings, "CORS_ORIGINS", "*, https://good.example")
    assert settings.cors_origins_list == ["https://good.example"]
    evil = client.options("/api/auth/login", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in evil.headers
    ok = client.options("/api/auth/login", headers={
        "Origin": "https://my-app.vercel.app", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "https://my-app.vercel.app"
    assert "access-control-allow-credentials" not in ok.headers


# ── Endpoint exposure ────────────────────────────────────────────────────────
@pytest.mark.parametrize("method,path", [
    ("get", "/api/businesses/nearby?latitude=17.4&longitude=78.3&radius_km=1"),
    ("get", "/api/businesses/1"),
    ("get", "/api/businesses/places/autocomplete?query=hyd"),
    ("get", "/api/businesses/config/google-key-status"),
    ("post", "/api/businesses/config/google-key"),
    ("get", "/api/websites/1"),
    ("get", "/api/health/mongodb"),
])
def test_endpoints_require_authentication(client, method, path):
    assert getattr(client, method)(path).status_code in (401, 403)


def test_google_key_config_is_admin_only_and_never_written_to_disk(client, user_token, admin_token, monkeypatch, tmp_path):
    assert client.post("/api/businesses/config/google-key", headers=_auth(user_token),
                       json={"api_key": "A" * 30}).status_code == 403
    assert client.post("/api/businesses/config/google-key", headers=_auth(admin_token),
                       json={"api_key": "not a key!"}).status_code == 400
    orig = settings.GOOGLE_PLACES_API_KEY
    try:
        opened = []
        real_open = open
        monkeypatch.setattr("builtins.open", lambda f, *a, **k: (opened.append(str(f)), real_open(f, *a, **k))[1])
        ok = client.post("/api/businesses/config/google-key", headers=_auth(admin_token), json={"api_key": "A" * 30})
        assert ok.status_code == 200
        assert not any(p.endswith(".env") for p in opened)
        status = client.get("/api/businesses/config/google-key-status", headers=_auth(admin_token)).json()
        assert status["masked_key"] == "..." + "A" * 4
    finally:
        settings.GOOGLE_PLACES_API_KEY = orig


def test_public_health_reveals_nothing(client, admin_token):
    res = client.get("/health")
    assert res.json() == {"status": "healthy"}
    assert client.get("/api/health/mongodb", headers=_auth(admin_token)).status_code == 200


def test_assistant_input_is_bounded(client):
    assert client.post("/api/chat/assistant", json={"message": "x" * 2001}).status_code == 422
    assert client.post("/api/chat/assistant", json={"message": "I need a cafe website"}).status_code == 200


# ── Admin safety ─────────────────────────────────────────────────────────────
def test_admin_cannot_delete_or_demote_or_deactivate_self(client, admin_user, admin_token):
    h = _auth(admin_token)
    assert client.delete(f"/api/admin/users/{admin_user.id}", headers=h).status_code == 400
    assert client.put(f"/api/admin/users/{admin_user.id}", headers=h, json={"role": "USER"}).status_code == 400
    assert client.put(f"/api/admin/users/{admin_user.id}", headers=h, json={"is_active": False}).status_code == 400


def test_last_active_admin_is_protected_but_others_can_be_managed(client, admin_user, admin_token, db_session):
    second = User(full_name="Second", email="second@example.com", password_hash=hash_password("Password123"),
                  role=UserRole.ADMIN, is_active=True)
    db_session.add(second)
    db_session.commit()
    h = _auth(admin_token)
    assert client.put(f"/api/admin/users/{second.id}", headers=h, json={"role": "USER"}).status_code == 200
    # first admin is now the only admin: a (hypothetical) other admin could not remove them
    from app.routers.admin import _guard_last_admin
    from fastapi import HTTPException
    from app.schemas.user import AdminUserUpdate
    with pytest.raises(HTTPException):
        _guard_last_admin(db_session, admin_user, AdminUserUpdate(is_active=False))
    with pytest.raises(HTTPException):
        _guard_last_admin(db_session, admin_user, None)


# ── SSRF ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("ip,public", [
    ("8.8.8.8", True), ("93.184.216.34", True),
    ("127.0.0.1", False), ("10.1.2.3", False), ("172.16.0.5", False), ("192.168.1.1", False),
    ("169.254.169.254", False), ("0.0.0.0", False), ("::1", False), ("fe80::1", False),
    ("::ffff:127.0.0.1", False), ("224.0.0.1", False), ("not-an-ip", False),
])
def test_is_public_ip(ip, public):
    assert net_safety.is_public_ip(ip) is public


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5:8080/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com/",
    "http://user:pw@93.184.216.34/", "http://93.184.216.34:22/", "gopher://93.184.216.34/",
])
def test_assert_public_url_blocks_internal_targets(url):
    with pytest.raises(net_safety.UnsafeURL):
        asyncio.run(net_safety.assert_public_url(url))


def test_assert_public_url_allows_public_literal():
    asyncio.run(net_safety.assert_public_url("https://93.184.216.34/"))


def _mock_client(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(net_safety.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_redirect_to_internal_address_is_blocked(monkeypatch):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    _mock_client(monkeypatch, handler)

    async def go():
        async with net_safety.SafeClient(timeout=3) as c:
            return await c.get("http://93.184.216.34/")
    with pytest.raises(net_safety.UnsafeURL):
        asyncio.run(go())
    assert calls == ["http://93.184.216.34/"]  # the internal hop was never requested


def test_safe_client_follows_public_redirects_and_caps_body(monkeypatch):
    def handler(request):
        if request.url.path == "/":
            return httpx.Response(301, headers={"location": "/final"})
        return httpx.Response(200, content=b"A" * 5_000_000, headers={"content-type": "text/html"})

    _mock_client(monkeypatch, handler)

    async def go():
        async with net_safety.SafeClient(timeout=3, max_bytes=10_000) as c:
            return await c.get("http://93.184.216.34/")
    res = asyncio.run(go())
    assert res.status_code == 200 and res.url.endswith("/final") and len(res.text) <= 10_000


def test_redirect_loops_are_bounded(monkeypatch):
    _mock_client(monkeypatch, lambda r: httpx.Response(302, headers={"location": "http://93.184.216.34/again"}))

    async def go():
        async with net_safety.SafeClient(timeout=3, max_redirects=3) as c:
            return await c.get("http://93.184.216.34/")
    with pytest.raises(httpx.TooManyRedirects):
        asyncio.run(go())


def test_detect_website_never_connects_to_internal_hosts(monkeypatch):
    from app.models.business import WebsiteStatus
    from app.services.website_detection_service import detect_website

    def boom(**kw):
        raise AssertionError("must not open a connection to an internal address")
    monkeypatch.setattr(net_safety.httpx, "AsyncClient", boom)
    status, final_url, https = asyncio.run(detect_website("http://127.0.0.1:8080/admin"))
    assert status == WebsiteStatus.WEBSITE_UNREACHABLE and final_url is None
    status, _, _ = asyncio.run(detect_website("169.254.169.254/latest/meta-data"))
    assert status == WebsiteStatus.WEBSITE_UNREACHABLE


def test_analyze_website_refuses_internal_hosts(monkeypatch):
    from app.services.website_analysis_service import analyze_website
    monkeypatch.setattr(net_safety.httpx, "AsyncClient",
                        lambda **kw: (_ for _ in ()).throw(AssertionError("no connection allowed")))
    result = asyncio.run(analyze_website("http://10.0.0.1/"))
    assert result["is_reachable"] is False and "error" in result["analysis_details"]
