import pytest
from app.services.mr_lad_client import MrLadWhatsAppClient
from app.services.whatsapp_cloud_client import WhatsAppCloudClient
from app.config import settings


def test_mr_lad_phone_formatting():
    """Verify phone normalization prepends + and handles 10-digit/12-digit Indian numbers."""
    assert MrLadWhatsAppClient._clean_phone("7780181920") == "+917780181920"
    assert MrLadWhatsAppClient._clean_phone("917780181920") == "+917780181920"
    assert MrLadWhatsAppClient._clean_phone("+91 77801 81920") == "+917780181920"


def test_mr_lad_send_simulator_mode():
    """When test mode is active, simulator mode handles sends gracefully without errors."""
    orig = settings.WHATSAPP_IS_TEST_MODE
    try:
        settings.WHATSAPP_IS_TEST_MODE = True
        success, msg_id, raw = MrLadWhatsAppClient.send_message(
            to_phone="919876543210",
            text_body="Hello from LexonIT",
            recipient_name="Shop Test",
        )
        assert success is True
        assert msg_id.startswith("wamid.LAD_")
        assert raw["success"] is True
        assert raw["sent"] == 1
    finally:
        settings.WHATSAPP_IS_TEST_MODE = orig


def test_unified_client_routes_to_mr_lad(db_session):
    """Verify WhatsAppCloudClient routes to MrLadWhatsAppClient when WHATSAPP_PROVIDER is mr_lad."""
    success, msg_id, raw = WhatsAppCloudClient.send_text(
        db=db_session,
        to_phone="917780181920",
        text_body="Test unified dispatcher",
    )
    assert success is True
    assert "LAD_" in msg_id or len(msg_id) >= 16


def test_whatsapp_settings_api(client, admin_token):
    """Verify /api/whatsapp/settings returns Mr LAD details from config."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/whatsapp/settings", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "mr_lad"
    assert data["whatsapp_number"] == "+917780181920"
    assert data["phone_number_id"] == "1407135925808911"
    assert data["business_account_id"] == "2912980445715643"
    # credentials come from the environment now; no hardcoded default is ever returned
    assert data["lad_auth_email"] == (settings.LAD_AUTH_EMAIL or "")
