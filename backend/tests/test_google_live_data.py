"""
Google Places behaviour: live data first, honest errors, no stale rows mixed into a live answer.
"""
import json
import time

# pyrefly: ignore [missing-import]
import httpx
# pyrefly: ignore [missing-import]
import pytest

from app.config import settings
from app.services import places_service as ps
from app.services.places_service import GooglePlacesProvider, SearchDebugInfo, _classify_google_error


def _google_error_body(status, message, reason=None):
    err = {"code": 403, "message": message, "status": status}
    if reason:
        err["details"] = [{"reason": reason}]
    return json.dumps({"error": err})


@pytest.mark.parametrize("code,body,expected", [
    (429, _google_error_body("RESOURCE_EXHAUSTED", "Quota exceeded"), "GOOGLE_QUOTA"),
    (400, _google_error_body("INVALID_ARGUMENT", "API key not valid. Please pass a valid API key."), "GOOGLE_KEY_INVALID"),
    (403, _google_error_body("PERMISSION_DENIED", "Places API (New) has not been used in project 123 before or it is disabled.", "SERVICE_DISABLED"), "GOOGLE_API_DISABLED"),
    (403, _google_error_body("PERMISSION_DENIED", "This API method requires billing to be enabled.", "BILLING_DISABLED"), "GOOGLE_BILLING"),
    (403, _google_error_body("PERMISSION_DENIED", "Requests from this IP address are blocked.", "API_KEY_IP_ADDRESS_BLOCKED"), "GOOGLE_KEY_RESTRICTED"),
    (500, "not json at all", "GOOGLE_UNAVAILABLE"),
])
def test_google_errors_are_explained_in_plain_english(code, body, expected):
    err_type, message = _classify_google_error(code, body)
    assert err_type == expected
    assert "OpenStreetMap" in message
    assert "AIza" not in message  # a key must never be echoed


def _provider_with_transport(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr(ps.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12")
    ps._SEARCH_CACHE.clear()
    GooglePlacesProvider._quota_exhausted_until = 0.0
    GooglePlacesProvider._last_error_type = None
    GooglePlacesProvider._last_error_message = None
    return GooglePlacesProvider()


def test_google_failure_is_reported_not_hidden(monkeypatch):
    def handler(request):
        return httpx.Response(403, text=_google_error_body(
            "PERMISSION_DENIED", "Places API (New) has not been used in project 1 before or it is disabled.", "SERVICE_DISABLED"))

    provider = _provider_with_transport(monkeypatch, handler)
    monkeypatch.setattr(ps, "_get_db_real_places", lambda *a, **k: [])
    osm_debug = SearchDebugInfo(17.4, 78.3, 2.0, provider_used="OSM")
    monkeypatch.setattr(ps.OSMPlacesProvider, "search_nearby", lambda self, *a, **k: ([], osm_debug))

    places, debug = provider.search_nearby(17.4485, 78.3895, 2.0, category="Restaurant")
    assert places == []
    assert debug.error_type == "GOOGLE_API_DISABLED"
    assert "not enabled" in debug.error_message
    # a configuration problem must not lock Google out for an hour (it is retried once fixed)
    assert GooglePlacesProvider._quota_exhausted_until - time.time() < 120


def test_quota_lock_lasts_an_hour(monkeypatch):
    provider = _provider_with_transport(
        monkeypatch, lambda r: httpx.Response(429, text=_google_error_body("RESOURCE_EXHAUSTED", "Quota exceeded")))
    monkeypatch.setattr(ps.OSMPlacesProvider, "search_nearby",
                        lambda self, *a, **k: ([], SearchDebugInfo(1, 1, 1, provider_used="OSM")))
    provider.search_nearby(17.4485, 78.3895, 2.0, category="Restaurant")
    assert GooglePlacesProvider._quota_exhausted_until - time.time() > 3000
    # while locked, the reason is still shown to the user
    _, debug = provider.search_nearby(17.45, 78.39, 2.0, category="Restaurant")
    assert debug.error_type == "GOOGLE_QUOTA"


def _google_place(pid, name, lat, lng, **extra):
    base = {
        "id": pid, "displayName": {"text": name}, "formattedAddress": f"{name}, Hyderabad",
        "location": {"latitude": lat, "longitude": lng}, "types": ["restaurant", "food"], "primaryType": "restaurant",
        "googleMapsUri": f"https://maps.google.com/?cid={pid}", "rating": 4.4, "userRatingCount": 120,
        "businessStatus": "OPERATIONAL",
    }
    base.update(extra)
    return base


def test_live_google_answer_is_used_alone_with_international_phone(monkeypatch):
    places = [
        _google_place("ChIJ_live_1", "Live Biryani House", 17.4490, 78.3900,
                      internationalPhoneNumber="+91 98490 12345", nationalPhoneNumber="098490 12345",
                      websiteUri="https://livebiryani.example"),
        _google_place("ChIJ_live_2", "Live Dosa Corner", 17.4480, 78.3890),
    ]
    provider = _provider_with_transport(monkeypatch, lambda r: httpx.Response(200, json={"places": places}))

    def must_not_be_called(*a, **k):
        raise AssertionError("saved database rows must not be mixed into a live Google answer")

    monkeypatch.setattr(ps, "_get_db_real_places", must_not_be_called)
    monkeypatch.setattr(settings, "PLACES_PREFER_LIVE_GOOGLE", True)

    result, debug = provider.search_nearby(17.4485, 78.3895, 2.0, category="Restaurant")
    names = {p.name for p in result}
    assert names == {"Live Biryani House", "Live Dosa Corner"}
    biryani = next(p for p in result if p.name == "Live Biryani House")
    assert biryani.phone.replace(" ", "").startswith("+91")          # international format kept
    assert biryani.website_url.startswith("https://livebiryani")
    assert debug.provider_used == "GooglePlacesAPI" and debug.error_type is None


def test_field_mask_asks_google_for_the_details_we_show():
    for field in ("places.internationalPhoneNumber", "places.websiteUri", "places.regularOpeningHours",
                  "places.rating", "places.userRatingCount", "places.businessStatus", "places.googleMapsUri"):
        assert field in ps.GOOGLE_FIELD_MASK


def test_key_test_reports_working_and_not_working(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12")
    monkeypatch.setattr(ps.httpx, "post", lambda *a, **k: httpx.Response(200, json={"places": []}))
    assert ps.test_google_key() == (True, "Google Maps data is working.")
    monkeypatch.setattr(ps.httpx, "post", lambda *a, **k: httpx.Response(
        400, text=_google_error_body("INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.")))
    ok, message = ps.test_google_key()
    assert ok is False and "not valid" in message
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "")
    assert ps.test_google_key() == (False, "No Google Maps key is configured.")


def test_key_status_endpoint_for_normal_users_never_shows_the_key(client, user_token, admin_token, monkeypatch):
    from app.routers import businesses
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEWXYZ")
    monkeypatch.setattr("app.services.places_service.test_google_key", lambda: (False, "The Google Maps key is not valid."))
    businesses._KEY_TEST_CACHE.update(at=0.0, ok=None, message="")

    as_user = client.get("/api/businesses/config/google-key-status", headers={"Authorization": f"Bearer {user_token}"}).json()
    assert as_user == {"connected": True, "working": False, "message": "The Google Maps key is not valid."}
    as_admin = client.get("/api/businesses/config/google-key-status", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert as_admin["masked_key"] == "...WXYZ"


def test_saved_rows_filling_in_still_tell_the_user_google_failed(monkeypatch):
    provider = _provider_with_transport(monkeypatch, lambda r: httpx.Response(
        400, text=_google_error_body("INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.")))
    saved = ps.PlaceData(place_id="ChIJ_saved", name="Saved Shop", category="Restaurant", address="x",
                         latitude=17.4486, longitude=78.3896, distance_km=0.02)
    monkeypatch.setattr(ps, "_get_db_real_places", lambda *a, **k: [saved])
    places, debug = provider.search_nearby(17.4485, 78.3895, 2.0, category="Restaurant")
    assert [p.name for p in places] == ["Saved Shop"]
    assert debug.error_type == "GOOGLE_KEY_INVALID" and debug.provider_used == "SavedData"
    assert "saved results" in debug.error_message
