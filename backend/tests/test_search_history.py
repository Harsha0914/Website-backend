import pytest

BODY = {"latitude": 17.4485, "longitude": 78.3895, "radius_km": 2, "category": "Cafe", "keyword": "cafe"}


@pytest.mark.parametrize("path", ["/api/search", "/api/search/"])
def test_search_is_recorded_without_a_redirect(client, user_token, path):
    """Both URL spellings must answer directly: a 307 redirect drops the Authorization header in browsers."""
    res = client.post(path, json=BODY, headers={"Authorization": f"Bearer {user_token}"}, follow_redirects=False)
    assert res.status_code == 200, res.text
    assert res.json()["keyword"] == "cafe"


def test_search_history_lists_recorded_searches(client, user_token):
    h = {"Authorization": f"Bearer {user_token}"}
    client.post("/api/search", json=BODY, headers=h)
    history = client.get("/api/search/history", headers=h)
    assert history.status_code == 200 and len(history.json()) == 1


def test_search_recording_requires_login(client):
    assert client.post("/api/search", json=BODY, follow_redirects=False).status_code in (401, 403)
