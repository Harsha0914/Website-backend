"""Each account's latest wording for a message type is kept, replaced by every new save, and private to that account."""
import pytest

from app.services import saved_messages
from tests.test_account_privacy import _hdr   # noqa: F401  (same login helpers as the privacy tests)
from tests.test_account_privacy import alice, bob  # noqa: F401


@pytest.fixture(autouse=True)
def _fresh_memory(monkeypatch):
    saved_messages._memory.clear()
    monkeypatch.setattr(saved_messages.chat_durability, "_db", lambda: None)   # no MongoDB in tests: the in-memory fallback is used


def test_the_newest_text_replaces_the_previous_one_and_stays(client, alice):
    url = "/api/ai-whatsapp/saved-messages"
    assert client.get(url, headers=_hdr(alice)).json() == {}
    client.put(f"{url}/lexon_offer_link", json={"text": "Hello {shop_name}, first"}, headers=_hdr(alice))
    client.put(f"{url}/lexon_offer_link", json={"text": "Hello {shop_name}, second"}, headers=_hdr(alice))
    assert client.get(url, headers=_hdr(alice)).json() == {"lexon_offer_link": "Hello {shop_name}, second"}   # still there on the next visit


def test_saved_wording_is_private_and_can_be_cleared(client, alice, bob):
    url = "/api/ai-whatsapp/saved-messages"
    client.put(f"{url}/about", json={"text": "Alice's wording"}, headers=_hdr(alice))
    assert client.get(url, headers=_hdr(bob)).json() == {}
    client.put(f"{url}/about", json={"text": ""}, headers=_hdr(alice))           # an empty text clears it
    assert client.get(url, headers=_hdr(alice)).json() == {}
    client.put(f"{url}/about", json={"text": "again"}, headers=_hdr(alice))
    assert client.delete(f"{url}/about", headers=_hdr(alice)).status_code == 200
    assert client.get(url, headers=_hdr(alice)).json() == {}


def test_bad_ids_and_anonymous_calls_are_refused(client, alice):
    assert client.put("/api/ai-whatsapp/saved-messages/bad id!", json={"text": "x"}, headers=_hdr(alice)).status_code in (400, 404, 422)
    assert client.get("/api/ai-whatsapp/saved-messages").status_code in (401, 403)
