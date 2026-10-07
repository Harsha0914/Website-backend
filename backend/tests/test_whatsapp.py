# pyrefly: ignore [missing-import]
import pytest

from app.config import settings

VERIFY_TOKEN = "unit_test_verify_token"


@pytest.fixture(autouse=True)
def _webhook_token(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN)


def test_whatsapp_webhook_verification(client):
    response = client.get(
        f"/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token={VERIFY_TOKEN}&hub.challenge=test_challenge_123"
    )
    assert response.status_code == 200
    assert response.text == "test_challenge_123"


def test_whatsapp_webhook_verification_failure(client):
    response = client.get(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_123"
    )
    assert response.status_code == 403


def test_whatsapp_webhook_refuses_when_no_token_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
    response = client.get(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=abc"
    )
    assert response.status_code == 403


def test_whatsapp_ai_auto_reply_and_manual_toggle(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Simulate incoming message with AI Auto Bot Enabled (default: True)
    sim_resp = client.post(
        "/api/whatsapp/simulate-incoming",
        headers=headers,
        json={
            "phone_number": "919849012345",
            "shop_name": "Test Supermarket",
            "message": "Hello, how can I set up a website for my store?",
            "sender_name": "Test Shop Owner"
        }
    )
    assert sim_resp.status_code == 200
    data = sim_resp.json()
    assert data["status"] == "success"
    assert data["auto_ai_enabled"] is True
    assert data["is_ai_replied"] is True
    assert data["ai_reply_message"] is not None
    assert "AI Assistant" in data["ai_reply_message"]["sender_name"]
    # simulations never reach the real WhatsApp API
    assert data["ai_reply_message"]["status"] == "simulated"
    conv_id = data["conversation_id"]

    # 2. Toggle AI Auto Bot to OFF (Manual Operator Mode)
    toggle_resp = client.put(
        f"/api/whatsapp/conversations/{conv_id}/toggle-ai",
        headers=headers,
        json={"enabled": False}
    )
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["auto_ai_enabled"] is False

    # 3. Simulate another incoming message while AI Auto Bot is OFF
    sim_resp2 = client.post(
        "/api/whatsapp/simulate-incoming",
        headers=headers,
        json={
            "phone_number": "919849012345",
            "shop_name": "Test Supermarket",
            "message": "Are you there?",
            "sender_name": "Test Shop Owner"
        }
    )
    assert sim_resp2.status_code == 200
    data2 = sim_resp2.json()
    assert data2["auto_ai_enabled"] is False
    assert data2["is_ai_replied"] is False
    assert data2["ai_reply_message"] is None  # Paused for manual operator

    # 4. Send manual operator reply over WhatsApp
    manual_resp = client.post(
        f"/api/whatsapp/conversations/{conv_id}/messages",
        headers=headers,
        json={
            "message": "Hello! I am a human agent. I will assist you with website creation personally.",
            "operator_name": "Lead Agent"
        }
    )
    assert manual_resp.status_code == 200
    m_data = manual_resp.json()
    assert m_data["sender_type"] == "MANUAL_OPERATOR"
    assert m_data["sender_name"] == "Lead Agent"
    assert "human agent" in m_data["message_body"]

    # 5. Get conversation thread details
    thread_resp = client.get(f"/api/whatsapp/conversations/{conv_id}", headers=headers)
    assert thread_resp.status_code == 200
    t_data = thread_resp.json()
    assert len(t_data["messages"]) == 4  # Inbound1, OutboundAI, Inbound2, OutboundManual
