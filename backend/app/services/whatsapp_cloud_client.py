import json
import uuid
import logging
from typing import Dict, Any, Optional, Tuple
# pyrefly: ignore [missing-import]
import requests
from sqlalchemy.orm import Session
from app.models.whatsapp_crm import WhatsAppApiSettings

logger = logging.getLogger(__name__)


def get_whatsapp_settings(db: Session) -> WhatsAppApiSettings:
    """
    Retrieves or creates WhatsApp Cloud API settings.
    Env vars take priority over DB values, so credentials set in .env
    or Render env vars are always respected.
    """
    from app.config import settings as app_settings

    db_settings = db.query(WhatsAppApiSettings).first()
    if not db_settings:
        db_settings = WhatsAppApiSettings(
            meta_app_id="",
            meta_app_secret="",
            business_account_id=app_settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "",
            phone_number_id=app_settings.WHATSAPP_PHONE_NUMBER_ID or "",
            access_token=app_settings.WHATSAPP_ACCESS_TOKEN or "",
            webhook_verify_token=app_settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
            api_version=app_settings.WHATSAPP_API_VERSION,
            is_test_mode=app_settings.WHATSAPP_IS_TEST_MODE,
        )
        db.add(db_settings)
        db.commit()
        db.refresh(db_settings)

    # Always prefer env vars over DB so we don't have to update DB manually
    if app_settings.LAD_API_TOKEN:
        db_settings.access_token = app_settings.LAD_API_TOKEN
    elif app_settings.WHATSAPP_ACCESS_TOKEN:
        db_settings.access_token = app_settings.WHATSAPP_ACCESS_TOKEN
    if app_settings.WHATSAPP_PHONE_NUMBER_ID:
        db_settings.phone_number_id = app_settings.WHATSAPP_PHONE_NUMBER_ID
    if app_settings.WHATSAPP_BUSINESS_ACCOUNT_ID:
        db_settings.business_account_id = app_settings.WHATSAPP_BUSINESS_ACCOUNT_ID
    # Override test mode only if env explicitly sets it to False (production)
    if not app_settings.WHATSAPP_IS_TEST_MODE and (app_settings.LAD_AUTH_PASSWORD or app_settings.LAD_API_TOKEN or app_settings.WHATSAPP_ACCESS_TOKEN):
        db_settings.is_test_mode = False

    return db_settings


class WhatsAppCloudClient:
    """
    Unified WhatsApp Client supporting:
    - Mr LAD API (LexonIT WhatsApp Integration)
    - Meta WhatsApp Cloud API (direct)
    """

    @staticmethod
    def _clean_phone(phone_number: str) -> str:
        """
        Normalizes phone number to digits only with country code (e.g., 919876543210).
        """
        cleaned = "".join(c for c in phone_number if c.isdigit())
        if len(cleaned) == 10:  # Default India code 91 if missing
            cleaned = "91" + cleaned
        return cleaned

    @classmethod
    def send_text(
        cls,
        db: Session,
        to_phone: str,
        text_body: str,
        preview_url: bool = True,
        recipient_name: Optional[str] = None,
        template_name: Optional[str] = None,
        send_flyer: bool = False,
        enforce_gate: bool = True,
        image_path: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Sends standard text message.
        enforce_gate: refuse opted-out / invalid numbers and the daily cap. Only the
        STOP confirmation itself may bypass it.
        Routes via Mr LAD API if provider is "mr_lad", else direct Meta Cloud API.
        Returns: (success: bool, wamid_or_error: str, raw_response: dict)
        """
        from app.config import settings as app_settings

        # ── Central send gate (last line of defence for every code path) ──
        if enforce_gate:
            from app.services.whatsapp_guard import can_message
            allowed, reason = can_message(db, to_phone)
            if not allowed:
                logger.warning(f"[WhatsApp Gate] Blocked send to ***{''.join(c for c in str(to_phone) if c.isdigit())[-4:]}: {reason}")
                return False, f"blocked:{reason}", None

        # ── Route to Mr LAD API ──────────────────────────────────────────
        if getattr(app_settings, "WHATSAPP_PROVIDER", "mr_lad") == "mr_lad":
            from app.services.mr_lad_client import MrLadWhatsAppClient
            return MrLadWhatsAppClient.send_message(
                to_phone=to_phone,
                text_body=text_body,
                recipient_name=recipient_name,
                template_name=template_name,
                send_flyer=send_flyer,
                sync_admin_copy=True,
                image_path=image_path,
            )

        settings = get_whatsapp_settings(db)
        recipient = cls._clean_phone(to_phone)

        # Test Mode / Sandbox Simulation
        if settings.is_test_mode or not settings.access_token or not settings.phone_number_id:
            mock_wamid = f"wamid.HBgL{uuid.uuid4().hex[:16]}="
            logger.info(f"[Meta Cloud API Simulator] Sent TEXT to {recipient}: {text_body[:40]}... (ID: {mock_wamid})")
            return True, mock_wamid, {"messaging_product": "whatsapp", "mode": "simulator", "messages": [{"id": mock_wamid}]}

        url = f"https://graph.facebook.com/{settings.api_version}/{settings.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {settings.access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": text_body,
            },
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            data = res.json()
            if res.status_code == 200 and "messages" in data and len(data["messages"]) > 0:
                wamid = data["messages"][0]["id"]
                return True, wamid, data
            else:
                err_msg = data.get("error", {}).get("message", res.text)
                logger.error(f"[Meta Cloud API Error] {err_msg}")
                return False, err_msg, data
        except Exception as e:
            logger.error(f"[Meta Cloud API Exception] {e}")
            return False, str(e), None

    @classmethod
    def send_template(
        cls,
        db: Session,
        to_phone: str,
        template_name: str,
        language_code: str = "en",
        variables: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Sends approved WhatsApp Template message with variable replacement.
        Routes via Mr LAD API if provider is "mr_lad", else direct Meta Cloud API.
        """
        from app.config import settings as app_settings

        # ── Route to Mr LAD API ──────────────────────────────────────────
        if getattr(app_settings, "WHATSAPP_PROVIDER", "mr_lad") == "mr_lad":
            from app.services.mr_lad_client import MrLadWhatsAppClient
            rec_name = None
            if variables and isinstance(variables, dict):
                rec_name = str(variables.get("name") or variables.get("1") or variables.get("shop_name") or "")
            return MrLadWhatsAppClient.send_message(
                to_phone=to_phone,
                text_body=None,
                recipient_name=rec_name,
                template_name=template_name,
                language_code=language_code,
            )

        settings = get_whatsapp_settings(db)
        recipient = cls._clean_phone(to_phone)

        # Format variables into body components
        body_parameters = []
        if variables:
            for k, v in variables.items():
                body_parameters.append({"type": "text", "text": str(v)})

        components = []
        if body_parameters:
            components.append({"type": "body", "parameters": body_parameters})

        if settings.is_test_mode or not settings.access_token or not settings.phone_number_id:
            mock_wamid = f"wamid.HBgL{uuid.uuid4().hex[:16]}="
            logger.info(f"[Meta Cloud API Simulator] Sent TEMPLATE '{template_name}' to {recipient} (ID: {mock_wamid})")
            return True, mock_wamid, {"messaging_product": "whatsapp", "mode": "simulator", "messages": [{"id": mock_wamid}]}

        url = f"https://graph.facebook.com/{settings.api_version}/{settings.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {settings.access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": components,
            },
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            data = res.json()
            if res.status_code == 200 and "messages" in data and len(data["messages"]) > 0:
                wamid = data["messages"][0]["id"]
                return True, wamid, data
            else:
                err_msg = data.get("error", {}).get("message", res.text)
                logger.error(f"[Meta Cloud API Error] {err_msg}")
                return False, err_msg, data
        except Exception as e:
            logger.error(f"[Meta Cloud API Exception] {e}")
            return False, str(e), None

    @classmethod
    def send_media(
        cls,
        db: Session,
        to_phone: str,
        media_type: str,  # image, document
        media_url: str,
        caption: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Sends image/document media message.
        """
        from app.config import settings as app_settings
        if getattr(app_settings, "WHATSAPP_PROVIDER", "mr_lad") == "mr_lad":
            from app.services.mr_lad_client import MrLadWhatsAppClient
            media_body = f"{caption}\n{media_url}" if caption else media_url
            return MrLadWhatsAppClient.send_message(
                to_phone=to_phone,
                text_body=media_body,
            )

        settings = get_whatsapp_settings(db)
        recipient = cls._clean_phone(to_phone)

        if settings.is_test_mode or not settings.access_token or not settings.phone_number_id:
            mock_wamid = f"wamid.HBgL{uuid.uuid4().hex[:16]}="
            logger.info(f"[Meta Cloud API Simulator] Sent MEDIA ({media_type}) to {recipient} (ID: {mock_wamid})")
            return True, mock_wamid, {"messaging_product": "whatsapp", "mode": "simulator", "messages": [{"id": mock_wamid}]}

        url = f"https://graph.facebook.com/{settings.api_version}/{settings.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {settings.access_token}",
            "Content-Type": "application/json",
        }
        media_payload = {"link": media_url}
        if caption:
            media_payload["caption"] = caption

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": media_type,
            media_type: media_payload,
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            data = res.json()
            if res.status_code == 200 and "messages" in data and len(data["messages"]) > 0:
                wamid = data["messages"][0]["id"]
                return True, wamid, data
            else:
                err_msg = data.get("error", {}).get("message", res.text)
                return False, err_msg, data
        except Exception as e:
            return False, str(e), None
