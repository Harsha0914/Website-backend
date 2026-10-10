import os
import logging
import threading
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple, List
# pyrefly: ignore [missing-import]
import requests
from sqlalchemy.orm import Session
from app.config import settings

logger = logging.getLogger(__name__)


class MrLadWhatsAppClient:
    """
    Client for LexonIT WhatsApp API integration through the Mr LAD API gateway.
    Based on LexonIT WhatsApp API Guide (Sep 2026).
    """

    _cached_token: Optional[str] = None
    _token_expiry: Optional[datetime] = None

    @classmethod
    def _clean_phone(cls, phone_number: str) -> str:
        """
        Normalizes phone numbers to international format with leading '+'
        e.g., '+919876543210' as required by Mr LAD API.
        """
        digits = "".join(c for c in phone_number if c.isdigit())
        if len(digits) == 10:
            digits = "91" + digits
        return f"+{digits}"

    @classmethod
    def get_token(cls, force_refresh: bool = False) -> Tuple[Optional[str], Optional[str]]:
        """
        Retrieves a valid JWT Bearer token for Mr LAD API.
        Uses static token if configured, or logs in via auth endpoint and caches for 6 days.
        Returns: (token, error_message)
        """
        if settings.LAD_API_TOKEN and not force_refresh:
            return settings.LAD_API_TOKEN, None

        now = datetime.utcnow()
        if (
            not force_refresh
            and cls._cached_token
            and cls._token_expiry
            and now < cls._token_expiry
        ):
            return cls._cached_token, None

        auth_base = settings.LAD_AUTH_BASE_URL.rstrip("/")
        email = (settings.LAD_AUTH_EMAIL or "").strip().strip('"\'')
        primary_password = (settings.LAD_AUTH_PASSWORD or "").strip().strip('"\'')
        if not email or not primary_password:
            return None, "Mr LAD credentials are not configured (set LAD_AUTH_EMAIL and LAD_AUTH_PASSWORD)"

        passwords_to_try = [primary_password]

        url = f"{auth_base}/api/auth/login"
        last_err = ""

        for pwd in passwords_to_try:
            payload = {"email": email, "password": pwd}
            try:
                logger.info(f"[Mr LAD API] Authenticating {email} at {url}...")
                res = requests.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=15,
                )
                if res.status_code == 200:
                    data = res.json()
                    token = data.get("token") or data.get("access_token") or data.get("jwt")
                    if token:
                        cls._cached_token = token
                        cls._token_expiry = now + timedelta(days=6)
                        logger.info("[Mr LAD API] Authentication successful, token cached.")
                        return token, None
                    return None, f"Login succeeded but no token in response: {data}"
                else:
                    err_text = res.text
                    pwd_hint = "credentials rejected"
                    logger.warning(f"[Mr LAD API Auth Note {res.status_code}] email={email!r}, {pwd_hint}: {err_text}")
                    last_err = f"Auth failed with HTTP {res.status_code} (email={email!r}, {pwd_hint}): {err_text}"
            except Exception as e:
                logger.error(f"[Mr LAD API Auth Exception] {e}")
                last_err = str(e)

        return None, last_err

    # WhatsApp only lets a business send free text or a picture to someone who messaged it in the last 24 hours.
    # Anyone else (every shop that has not replied) can only be sent an APPROVED TEMPLATE.
    # Which approved template carries each of the app's two messages, best first:
    # Each message has a template WITH a picture in its header and a plain-text one, best first.
    #   v4 = picture header, no buttons      v1 = picture header, with two reply buttons (used only until v4 is approved)
    #   v3 = text only, no buttons           v2 = text only, with two reply buttons   (used only until v3 is approved)
    TEMPLATE_PREFERENCE: Dict[str, Dict[str, List[str]]] = {
        "offer-link": {
            "picture": ["lexon_offer_link_v4", "lexon_offer_link_v1"],
            "text": ["lexon_offer_link_v3", "lexon_offer_link_v2"],
        },
        "about-company": {
            "picture": ["lexon_about_company_v4", "lexon_about_company_v1"],
            "text": ["lexon_about_company_v3", "lexon_about_company_v2"],
        },
    }
    DEFAULT_KEY = "offer-link"
    TWO_NAME_TEMPLATES = (
        "lexon_offer_link_v1", "lexon_offer_link_v2", "lexon_offer_link_v3", "lexon_offer_link_v4",
        "lexon_about_company_v1", "lexon_about_company_v2", "lexon_about_company_v3", "lexon_about_company_v4",
    )

    _templates_cache: Tuple[float, Dict[str, Dict[str, Any]]] = (0.0, {})

    @classmethod
    def list_templates(cls, max_age: float = 300.0) -> Dict[str, Dict[str, Any]]:
        """{template name: {status, header_type}} from the gateway, cached for 5 minutes. {} if it cannot be read."""
        fetched_at, cached = cls._templates_cache
        if cached and time.time() - fetched_at < max_age:
            return cached
        ok, data = cls._authed_get("/api/conversations/templates", {})
        if not ok:
            return cached
        items = data.get("data") if isinstance(data, dict) else data
        if isinstance(items, dict):
            items = items.get("templates") or items.get("data") or []
        found = {
            t.get("name"): {"status": str(t.get("status") or "").upper(), "header_type": t.get("header_type") or "", "body": t.get("body") or ""}
            for t in (items or []) if isinstance(t, dict) and t.get("name")
        }
        cls._templates_cache = (time.time(), found)
        return found

    @classmethod
    def pick_template(cls, template_key: Optional[str], with_picture: bool = False) -> Tuple[Optional[str], bool]:
        """
        (the template for this message, ready). Each message has its own templates and nothing else is ever substituted.
        with_picture=True picks a template with a picture header (the picture is passed when sending); otherwise a
        plain text one. If none is approved the answer is (None, False) and the send is refused with a clear reason.
        """
        key = template_key if template_key in cls.TEMPLATE_PREFERENCE else cls.DEFAULT_KEY
        prefs = cls.TEMPLATE_PREFERENCE[key]["picture" if with_picture else "text"]
        known = cls.list_templates()
        if not known:  # the template list could not be read: trust the configured name and let the gateway decide
            return prefs[0], True
        for name in prefs:
            t = known.get(name) or {}
            has_header = bool((t.get("header_type") or "").strip())
            if t.get("status") == "APPROVED" and has_header == with_picture:
                return name, True
        return None, False

    @classmethod
    def render_template(cls, name: str, params: List[str]) -> str:
        """The wording a template message really carries, with its {{1}}, {{2}} filled in ('' if unknown)."""
        body = (cls.list_templates().get(name) or {}).get("body") or ""
        for index, value in enumerate(params or [], start=1):
            body = body.replace("{{" + str(index) + "}}", str(value))
        return body

    @classmethod
    def window_open(cls, conv_id: str, token: str) -> bool:
        """True only if the shop itself wrote in this thread within the last 24 hours (free text is then allowed)."""
        try:
            res = requests.get(
                f"{settings.LAD_API_BASE_URL.rstrip('/')}/api/conversations/{conv_id}/messages",
                headers={"Authorization": f"Bearer {token}"}, params={"limit": 50}, timeout=20,
            )
            if res.status_code != 200:
                return False
            body = res.json()
            rows = body.get("data") if isinstance(body.get("data"), list) else (body.get("data") or {}).get("messages") or body.get("messages") or []
            newest = None
            for row in rows:
                if row.get("role") == "user":
                    when = cls._parse_ts(row)
                    if when and (newest is None or when > newest):
                        newest = when
            return bool(newest and datetime.utcnow() - newest < timedelta(hours=24))
        except Exception as err:
            logger.warning(f"[Mr LAD] could not check the 24-hour window: {err}")
            return False

    @classmethod
    def _find_conversation_id(cls, phone: str, token: str) -> Optional[str]:
        """
        Looks up an existing conversation_id for the given phone number.
        Pages through ALL conversations (not just the first 100) and compares the
        normalized full number, so two different people never share a thread.
        """
        api_base = settings.LAD_API_BASE_URL.rstrip("/")
        h = {"Authorization": f"Bearer {token}"}
        target = cls._clean_phone(phone).lstrip("+")
        page_size, max_pages = 100, 30
        try:
            for page in range(max_pages):
                r = requests.get(
                    f"{api_base}/api/conversations", headers=h,
                    params={"limit": page_size, "offset": page * page_size}, timeout=10,
                )
                if r.status_code != 200:
                    return None
                body = r.json()
                convs = body.get("data", []) if isinstance(body, dict) else body
                if not convs:
                    return None
                for c in convs:
                    c_digits = "".join(ch for ch in (c.get("phone") or "") if ch.isdigit())
                    if not c_digits:
                        continue
                    if len(c_digits) == 10:
                        c_digits = "91" + c_digits
                    if c_digits == target:
                        return c["id"]
                if len(convs) < page_size:
                    return None
        except Exception:
            pass
        return None

    # Class-level caches for flyers (loaded once, reused)
    _flyer_b64_cache: Dict[str, Optional[str]] = {}
    _media_id_cache: Dict[str, Optional[str]] = {}

    @classmethod
    def _resolve_flyer_paths(cls) -> Dict[str, Optional[str]]:
        import os
        # __file__ = backend/app/services/mr_lad_client.py
        # Go up 2 levels -> backend/
        services_dir = os.path.dirname(os.path.abspath(__file__))
        app_dir = os.path.dirname(services_dir)        # backend/app/
        backend_dir = os.path.dirname(app_dir)          # backend/
        repo_dir = os.path.dirname(backend_dir)          # repo root

        def find_img(filename: str) -> Optional[str]:
            candidates = [
                os.path.join(backend_dir, "static", "images", filename),
                os.path.join(repo_dir, "backend", "static", "images", filename),
                os.path.join(repo_dir, "frontend", "public", "images", filename),
                os.path.join(os.getcwd(), "static", "images", filename),
                os.path.join(os.getcwd(), "backend", "static", "images", filename),
                # Render often runs from /app or /backend
                f"/app/static/images/{filename}",
                f"/app/backend/static/images/{filename}",
                f"/backend/static/images/{filename}",
                # Windows local dev
                f"c:/Shop/backend/static/images/{filename}",
                f"c:/Shop/frontend/public/images/{filename}",
            ]
            for c in candidates:
                if os.path.exists(c):
                    logger.debug(f"[Mr LAD Flyer] Found '{filename}' at: {c}")
                    return c
            logger.warning(f"[Mr LAD Flyer] Could NOT find '{filename}'. Tried: {candidates[:5]}...")
            return None

        easybillbro = find_img("easybillbro-flyer.jpg") or find_img("easybillbro-flyer.png")

        return {
            "easybillbro": easybillbro,
        }

    @classmethod
    def _resolve_flyer_path(cls) -> Optional[str]:
        paths = cls._resolve_flyer_paths()
        return paths.get("easybillbro")

    @classmethod
    def _get_flyer_b64(cls, img_path: str) -> Optional[str]:
        """Load and base64-encode a flyer image, using class-level cache."""
        import base64
        if img_path in cls._flyer_b64_cache:
            return cls._flyer_b64_cache[img_path]
        try:
            with open(img_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            cls._flyer_b64_cache[img_path] = b64
            logger.info(f"[Mr LAD Flyer] Cached base64 for '{img_path}' ({len(b64)} chars)")
            return b64
        except Exception as e:
            logger.error(f"[Mr LAD Flyer] Failed to read/encode '{img_path}': {e}")
            cls._flyer_b64_cache[img_path] = None
            return None

    @classmethod
    def _upload_media(cls, img_path: str, token: str) -> Optional[str]:
        """Uploads flyer image via multipart/form-data to Meta media API and caches the media_id."""
        if img_path in cls._media_id_cache and cls._media_id_cache[img_path]:
            return cls._media_id_cache[img_path]

        api_base = settings.LAD_API_BASE_URL.rstrip("/")
        headers = {"Authorization": f"Bearer {token}"}
        content_type = "image/png" if img_path.lower().endswith(".png") else "image/jpeg"
        filename = os.path.basename(img_path)

        try:
            with open(img_path, "rb") as f:
                files = {"file": (filename, f, content_type)}
                res = requests.post(f"{api_base}/api/conversations/upload-media", headers=headers, files=files, timeout=30)
            if res.status_code == 200:
                data = res.json()
                media_id = data.get("media_id")
                if media_id:
                    cls._media_id_cache[img_path] = media_id
                    logger.info(f"[Mr LAD Flyer] Uploaded '{filename}' -> media_id: {media_id}")
                    return media_id
            logger.warning(f"[Mr LAD Flyer] Multipart upload returned {res.status_code}: {res.text[:200]}")
        except Exception as e:
            logger.warning(f"[Mr LAD Flyer] Multipart upload exception for '{img_path}': {e}")
        return None

    @classmethod
    def add_note(cls, conv_id: str, content: str) -> bool:
        """
        Add an internal note to a Mr LAD conversation (best effort, never raises).
        Used to leave a link to the picture that was just sent: Mr LAD's inbox cannot draw pictures sent through
        its API because it does not record which picture it was.
        """
        try:
            token, _ = cls.get_token()
            if not token:
                return False
            api_base = settings.LAD_API_BASE_URL.rstrip("/")
            res = requests.post(
                f"{api_base}/api/conversations/{conv_id}/notes",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"content": content},
                timeout=20,
            )
            return res.status_code == 200
        except Exception as err:
            logger.warning(f"[Mr LAD Note] could not add a note: {err}")
            return False

    @classmethod
    def send_image_message(cls, conv_id: str, img_path: str, caption: str = "") -> Tuple[bool, str, dict]:
        """
        Send a picture with a caption into a conversation as ONE WhatsApp message.

        Mr LAD documents the picture as `type: image` + `file_base64` + `content_type` + `caption`, so that is
        tried first. If it is refused, the picture is uploaded and sent by media id as a second attempt.
        """
        token, _ = cls.get_token()
        if not token:
            return False, "Auth failed", {}
        api_base = settings.LAD_API_BASE_URL.rstrip("/")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{api_base}/api/conversations/{conv_id}/messages"

        content_type = "image/png" if img_path.lower().endswith(".png") else "image/jpeg"
        attempts: List[Tuple[str, dict]] = []
        b64 = cls._get_flyer_b64(img_path)
        if b64:
            attempts.append(("base64", {"type": "image", "file_base64": b64, "content_type": content_type, "caption": caption}))
        if not attempts:
            return False, f"Could not read image file: {img_path}", {}

        last_error = ""
        for index in range(2):
            if index == 1:  # second attempt: upload first, then send by media id
                media_id = cls._upload_media(img_path, token)
                if not media_id:
                    break
                attempts.append(("media_id", {"type": "image", "media_id": media_id, "caption": caption}))
            if index >= len(attempts):
                break
            how, payload = attempts[index]
            try:
                res = requests.post(url, headers=headers, json=payload, timeout=90)
                logger.info(f"[Mr LAD Picture API] ({how}) HTTP {res.status_code} | conv={conv_id} | body={res.text[:300]}")
                data: dict = {}
                try:
                    data = res.json()
                except Exception:
                    data = {"raw": res.text}
                if res.status_code == 200 and (data.get("success") or data.get("id") or data.get("data")):
                    inner = data.get("data") or data
                    msg_id = (inner.get("id") or inner.get("message_id")) if isinstance(inner, dict) else None
                    msg_id = msg_id or f"wamid.LAD_{uuid.uuid4().hex[:12]}"
                    logger.info(f"[Mr LAD API] Picture + caption sent to conv {conv_id} ({how}). ID: {msg_id}")
                    return True, msg_id, data
                last_error = str(data.get("detail") or data.get("error") or data.get("message") or res.text)[:300]
                logger.warning(f"[Mr LAD Picture API] ({how}) not accepted: HTTP {res.status_code} {last_error}")
                print(f"[Mr LAD Picture API] ({how}) not accepted: HTTP {res.status_code} {last_error}")
            except Exception as e:
                last_error = str(e)
                logger.error(f"[Mr LAD Picture API Exception] ({how}) {e}")
                print(f"[Mr LAD Picture API Exception] ({how}) {e}")
        return False, last_error or "The picture could not be sent", {}

    @classmethod
    def _admin_copy_number(cls) -> Optional[str]:
        raw = (settings.WHATSAPP_ADMIN_COPY_NUMBER or "").strip()
        return cls._clean_phone(raw) if raw else None

    @classmethod
    def _is_admin_copy_number(cls, phone: str) -> bool:
        admin = cls._admin_copy_number()
        return bool(admin) and cls._clean_phone(phone) == admin

    @classmethod
    def sync_to_admin(cls, message: str, shop_name: str, shop_phone: str, send_flyer: bool = True):
        """
        Mirrors a dispatched pitch to the admin WhatsApp account named by
        WHATSAPP_ADMIN_COPY_NUMBER so the team can see it. Disabled when unset.
        """
        admin_phone = cls._admin_copy_number()
        if not admin_phone:
            return
        try:
            token, _ = cls.get_token()
            if not token:
                logger.warning("[Admin WhatsApp Sync] No token available for sync")
                return

            admin_conv_id = cls._find_conversation_id(admin_phone, token)
            if not admin_conv_id:
                # The admin number has no thread in Mr LAD yet: create it (same way shop threads are created)
                try:
                    api_base_prov = settings.LAD_API_BASE_URL.rstrip("/")
                    imp = requests.post(
                        f"{api_base_prov}/api/leads/import",
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json={"leads": [{"name": "Lexon IT (copies)", "phone": admin_phone, "company": "Lexon IT"}]},
                        timeout=20,
                    )
                    if imp.status_code == 200:
                        ids = (imp.json().get("data") or {}).get("conversation_ids") or []
                        admin_conv_id = ids[0] if ids else None
                except Exception as prov_err:
                    logger.warning(f"[Admin WhatsApp Sync] Could not create admin thread: {prov_err}")
                if not admin_conv_id:
                    admin_conv_id = cls._find_conversation_id(admin_phone, token)
            if not admin_conv_id:
                logger.warning("[Admin WhatsApp Sync] No conversation for the admin copy number and it could not be created; copy skipped")
                return

            flyers = cls._resolve_flyer_paths()
            flyer_img = flyers.get("easybillbro")
            if send_flyer and flyer_img:
                try:
                    time.sleep(0.4)
                    img_ok, img_id, _ = cls.send_image_message(
                        conv_id=admin_conv_id,
                        img_path=flyer_img,
                        caption=message
                    )
                    if img_ok:
                        logger.info(f"[Admin WhatsApp Sync] Delivered flyer image + pitch ({img_id})")
                        return
                except Exception as img_err:
                    logger.warning(f"[Admin WhatsApp Sync Image Note] {img_err}")

            time.sleep(0.3)
            api_base = settings.LAD_API_BASE_URL.rstrip("/")
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            r = requests.post(
                f"{api_base}/api/conversations/{admin_conv_id}/messages",
                headers=headers,
                json={"content": message},
                timeout=15
            )
            if r.status_code == 200:
                logger.info("[Admin WhatsApp Sync] Delivered pitch copy")
            else:
                logger.warning(f"[Admin WhatsApp Sync Note {r.status_code}] {r.text[:200]}")

        except Exception as sync_err:
            logger.warning(f"[Admin WhatsApp Sync Exception] {sync_err}")

    @classmethod
    def send_message(
        cls,
        to_phone: str,
        text_body: Optional[str] = None,
        recipient_name: Optional[str] = None,
        template_name: Optional[str] = None,
        language_code: str = "en_US",
        template_parameters: Optional[List[str]] = None,
        send_flyer: bool = True,
        sync_admin_copy: bool = True,
        image_path: Optional[str] = None,
        image_url: Optional[str] = None,
        template_key: Optional[str] = None,
        image_header_url: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Sends an outbound WhatsApp message via Mr LAD API.

        Strategy:
        - For EXISTING conversations (e.g. +917780181920): sends free-text directly via
          POST /api/conversations/{id}/messages {"content": "..."}
          No template needed — works immediately and avoids Meta #100 parameter errors.
        - For NEW contacts: uses POST /api/conversations/send-template-to-members
          to open the conversation (template required by Meta for first contact),
          then sends the real custom text as a follow-up free-text message.
        - Sends ONE marketing flyer (EasyBillBro Restaurant Billing) with the Lexon IT pitch as the image caption.
        - Automatically syncs a copy to the admin WhatsApp Business account (+917780181920).
        """
        recipient = cls._clean_phone(to_phone)
        display_name = recipient_name or "Shop Owner"
        # Validate against known approved templates in Mr LAD account
        # The template that carries the message the user chose (offer / about us). Nothing else is substituted.
        wants_picture = bool(image_url) and (bool(image_path) or send_flyer)
        chosen_template, _ready = cls.pick_template(template_key or cls.DEFAULT_KEY, with_picture=wants_picture)

        # Check for test mode or missing credentials
        has_creds = bool(settings.LAD_API_TOKEN or settings.LAD_AUTH_PASSWORD)
        if settings.WHATSAPP_IS_TEST_MODE or not has_creds:
            mock_id = f"wamid.LAD_{uuid.uuid4().hex[:16]}"
            logger.info(
                f"[Mr LAD API Simulator] Sent to {recipient} (Name: {display_name}): "
                f"Text: '{text_body[:50] if text_body else '[no text]'}' (ID: {mock_id})"
            )
            return True, mock_id, {
                "success": True,
                "sent": 1,
                "failed": 0,
                "mode": "simulator",
                "results": [{"id": mock_id, "phone": recipient, "status": "simulated_accepted"}]
            }

        token, auth_err = cls.get_token()
        if not token:
            logger.error(f"[Mr LAD API Send Error] Auth failed: {auth_err}")
            return False, f"Authentication error: {auth_err}", None

        api_base = settings.LAD_API_BASE_URL.rstrip("/")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Auto-refresh expired token on 401
        def _post(url: str, payload: dict) -> requests.Response:
            res = requests.post(url, headers=headers, json=payload, timeout=20)
            if res.status_code in (190, 401):
                new_tok, _ = cls.get_token(force_refresh=True)
                if new_tok:
                    headers["Authorization"] = f"Bearer {new_tok}"
                    res = requests.post(url, headers=headers, json=payload, timeout=20)
            return res

        def _send_freetext(conv_id: str, message: str) -> Tuple[bool, str, dict]:
            """
            Send a free-text message into an existing conversation.
            Uses POST /api/conversations/{id}/messages with {"content": "..."}
            """
            res = _post(f"{api_base}/api/conversations/{conv_id}/messages", {"content": message})
            if res.status_code == 200:
                data = res.json()
                if data.get("success"):
                    inner = data.get("data", {})
                    msg_id = inner.get("id") or inner.get("message_id") or f"wamid.LAD_{uuid.uuid4().hex[:12]}"
                    logger.info(f"[Mr LAD API] Free-text sent to {recipient}. ID: {msg_id}")
                    return True, msg_id, data
            err_data = {}
            try:
                err_data = res.json()
            except Exception:
                pass
            err = err_data.get("detail") or err_data.get("error") or res.text
            logger.error(f"[Mr LAD API Free-text Error {res.status_code}] {err}")
            return False, str(err), err_data

        def _send_both_flyers(conv_id: str):
            """Dispatches BOTH marketing flyers: EasyBillBro Restaurant Billing + Lexon IT Website Pitch"""
            flyers = cls._resolve_flyer_paths()
            # 1. EasyBillBro flyer
            if flyers.get("easybillbro"):
                try:
                    time.sleep(0.6)
                    cls.send_image_message(
                        conv_id=conv_id,
                        img_path=flyers["easybillbro"],
                        caption="EasyBillBro - Restaurant Billing & POS"
                    )
                except Exception as e1:
                    logger.warning(f"[Flyer 1 Send Error] {e1}")

            # 2. Lexon IT flyer
            if flyers.get("lexonit"):
                try:
                    time.sleep(0.6)
                    cls.send_image_message(
                        conv_id=conv_id,
                        img_path=flyers["lexonit"],
                        caption="Lexon IT - Professional Website Development & Digital Growth"
                    )
                except Exception as e2:
                    logger.warning(f"[Flyer 2 Send Error] {e2}")

        # Build the actual message to show the shop owner
        outbound_message = text_body or (
            f"Hello {display_name},\n\n"
            "This is Lexon IT. We help businesses grow online by building professional websites, web applications, and mobile apps tailored to their needs.\n\n"
            f"We noticed that {display_name} doesn’t currently have a website. Today, customers often search online before choosing a business or service. A professional online presence can help you showcase your products or services, share important information, build trust, and make it easier for customers to contact you — 24/7.\n\n"
            "Whether you need a simple website, an online booking or ordering system, a custom web application, or a mobile app, our team can build it for you at an affordable price.\n\nhttps://easybillbro.com/"
        )

        try:
            # 1. Resolve or provision conversation in Mr LAD
            existing_conv_id = cls._find_conversation_id(recipient, token)

            if not existing_conv_id:
                # Auto-create conversation thread in Mr LAD via leads import without sending preliminary text messages
                try:
                    phone_import = f"+{''.join(c for c in recipient if c.isdigit())}"
                    logger.info(f"[Mr LAD API] Provisioning conversation for {phone_import} ({display_name}) via leads import...")
                    import_res = _post(f"{api_base}/api/leads/import", {
                        "leads": [
                            {
                                "name": display_name,
                                "phone": phone_import,
                                "company": display_name,
                            }
                        ]
                    })
                    if import_res.status_code == 200:
                        c_ids = import_res.json().get("data", {}).get("conversation_ids", [])
                        if c_ids:
                            existing_conv_id = c_ids[0]
                            logger.info(f"[Mr LAD API] Provisioned new conversation thread {existing_conv_id} for {recipient}.")
                except Exception as imp_err:
                    logger.warning(f"[Mr LAD API Leads Import Note] {imp_err}")

                if not existing_conv_id:
                    existing_conv_id = cls._find_conversation_id(recipient, token)

            # 2. DISPATCH AS ONE SINGLE COMBINED MESSAGE (Flyer Image + Pitch Description Caption)
            # Free text and pictures may only go to someone who messaged us in the last 24 hours. Everyone else
            # gets the approved template (step 3), because WhatsApp silently drops anything else.
            window_is_open = bool(existing_conv_id) and cls.window_open(existing_conv_id, token)
            if existing_conv_id and not window_is_open:
                logger.info(f"[Mr LAD API] {recipient} has not written in the last 24 hours: sending the approved template '{chosen_template}'.")
            if existing_conv_id and window_is_open:
                flyers = cls._resolve_flyer_paths()
                # A picture chosen by the user replaces the built-in flyer.
                flyer_img = image_path or flyers.get("easybillbro")
                with_image = bool(image_path) or send_flyer

                if with_image and flyer_img:
                    logger.info(f"[Mr LAD API] Dispatching single combined message (image + description) to {recipient} ({existing_conv_id})...")
                    # WhatsApp allows at most 1024 characters in a picture's caption; longer text follows as its own message.
                    caption_fits = len(outbound_message) <= 1024
                    img_ok, img_id, img_data = cls.send_image_message(
                        conv_id=existing_conv_id,
                        img_path=flyer_img,
                        caption=outbound_message if caption_fits else ""
                    )
                    if img_ok and not caption_fits:
                        _send_freetext(existing_conv_id, outbound_message)
                    if img_ok and image_url:
                        cls.add_note(existing_conv_id, f"Picture sent with this message: {image_url}")
                    if img_ok:
                        logger.info(f"[Mr LAD API] Successfully dispatched flyer image with description in 1 message to {recipient} ({img_id})")
                        if sync_admin_copy and not cls._is_admin_copy_number(recipient):
                            cls.sync_to_admin(outbound_message, display_name, recipient, send_flyer=send_flyer)
                        return True, img_id, {
                            "success": True,
                            "conversation_id": existing_conv_id,
                            "message_id": img_id,
                            "data": img_data,
                            "mode": "image_with_caption"
                        }
                    logger.warning(f"[Mr LAD API] Combined image send failed ({img_id}), attempting freetext into thread...")

                # If no flyer requested or image failed, send freetext into the thread
                ft_ok, ft_id, ft_data = _send_freetext(existing_conv_id, outbound_message)
                if ft_ok:
                    if sync_admin_copy and not cls._is_admin_copy_number(recipient):
                        cls.sync_to_admin(outbound_message, display_name, recipient, send_flyer=send_flyer)
                    return True, ft_id, {
                        "success": True,
                        "conversation_id": existing_conv_id,
                        "message_id": ft_id,
                        "data": ft_data,
                        "mode": "existing_thread"
                    }

            # 3. FALLBACK ONLY: If conversation could not be created or direct send failed, use official pitch template
            if not language_code or language_code == "en":
                language_code = "en_US"

            if not chosen_template:
                return False, "The WhatsApp template for this message is not approved yet, so it cannot be sent to a shop that has not written to you.", {"mode": "template", "template": None}
            logger.info(f"[Mr LAD API] Template dispatch to {recipient} with template '{chosen_template}'...")
            if template_parameters is not None:
                params_list = template_parameters
            elif chosen_template in cls.TWO_NAME_TEMPLATES:
                params_list = [display_name, display_name]
            else:
                params_list = [display_name]

            member_obj: Dict[str, Any] = {
                "phone": recipient,
                "name": display_name,
                "params": params_list,
                "text": outbound_message,
            }
            init_payload = {
                "members": [member_obj],
                "template_name": chosen_template,
                "language_code": language_code,
            }
            if wants_picture and (cls.list_templates().get(chosen_template, {}).get("header_type") or "").strip():
                # a picture-header template: the gateway needs BOTH of these to fill the header (a URL alone is refused)
                init_payload["header_type"] = "image"
                init_payload["header_url"] = image_header_url or image_url   # the square version, so nothing is cropped
            res = _post(f"{api_base}/api/conversations/send-template-to-members", init_payload)
            init_data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

            results = init_data.get("results", [])
            first_status = results[0].get("status") if results else ""
            if res.status_code != 200 or first_status == "failed":
                err_text = (results[0].get("error") if results else None) or init_data.get("error") or init_data.get("message") or res.text
            if res.status_code != 200 or first_status == "failed":
                err_text = (results[0].get("error") if results else None) or init_data.get("error") or init_data.get("message") or res.text
                logger.error(f"[Mr LAD API Send Error {res.status_code}] {err_text}")
                return False, f"HTTP {res.status_code}: {err_text}", init_data

            msg_id = (results[0].get("message_id") or results[0].get("id") or "") if results else ""
            if not msg_id:
                msg_id = f"wamid.LAD_{uuid.uuid4().hex[:12]}"
            logger.info(f"[Mr LAD API] Sent template '{chosen_template}' to {recipient} (ID: {msg_id})")
            if sync_admin_copy and not cls._is_admin_copy_number(recipient):
                cls.sync_to_admin(outbound_message, display_name, recipient, send_flyer=send_flyer)
            try:
                wording = cls.render_template(chosen_template, params_list)
                note_conv = existing_conv_id or (results[0].get("conversation_id") if results else None) or cls._find_conversation_id(recipient, token)
                if wording and note_conv:
                    picture_line = f"\n\nPicture in the header: {image_url}" if "header_url" in init_payload else ""
                    cls.add_note(note_conv, f"WhatsApp message sent as template \u201c{chosen_template}\u201d:\n\n{wording}{picture_line}")
            except Exception as note_err:
                logger.warning(f"[Mr LAD] could not add the wording note: {note_err}")
            if isinstance(init_data, dict):
                init_data = {**init_data, "mode": "template", "template": chosen_template}
            return True, msg_id, init_data

        except Exception as e:
            logger.error(f"[Mr LAD API Send Exception] {e}")
            return False, str(e), None

    @classmethod
    def _authed_get(cls, path: str, params: dict) -> Tuple[bool, Any]:
        """GET with the cached token, refreshing it once on 401/403."""
        token, auth_err = cls.get_token()
        if not token:
            return False, auth_err
        url = f"{settings.LAD_API_BASE_URL.rstrip('/')}{path}"
        try:
            res = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=15)
            if res.status_code in (401, 403):
                token, auth_err = cls.get_token(force_refresh=True)
                if not token:
                    return False, auth_err
                res = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=15)
            if res.status_code == 200:
                return True, res.json()
            return False, f"HTTP {res.status_code}: {res.text}"
        except Exception as e:
            return False, str(e)

    @classmethod
    def get_conversations(cls, limit: int = 50, offset: int = 0) -> Tuple[bool, Any]:
        """Reads conversation threads: GET {api-base}/api/conversations"""
        return cls._authed_get("/api/conversations", {"limit": limit, "offset": offset})

    @classmethod
    def get_messages(cls, conversation_id: str, limit: int = 50) -> Tuple[bool, Any]:
        """Reads messages in a thread: GET {api-base}/api/conversations/{id}/messages"""
        return cls._authed_get(f"/api/conversations/{conversation_id}/messages", {"limit": limit})

    # Per-thread change signature so unchanged threads cost zero extra API calls.
    _thread_signatures: Dict[str, str] = {}
    _sync_lock = threading.Lock()

    @staticmethod
    def _parse_ts(m: Dict[str, Any]) -> Optional[datetime]:
        """Best-effort UTC timestamp of a gateway message; None when unknown."""
        for key in ("created_at", "timestamp", "sent_at", "time", "date"):
            v = m.get(key)
            if v in (None, ""):
                continue
            try:
                if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
                    n = float(v)
                    if n > 1e11:  # milliseconds
                        n /= 1000.0
                    return datetime.utcfromtimestamp(n)
                dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                if dt.tzinfo is not None:
                    dt = (dt - dt.utcoffset()).replace(tzinfo=None)
                return dt
            except Exception:
                continue
        return None

    @classmethod
    def sync_recent_conversations(cls, db: Session) -> Dict[str, Any]:
        """
        Polls Mr LAD for recent threads and runs every NEW inbound message through the
        same pipeline as the Meta webhook (classification, opt-out, lead score, AI reply).

        Safety rules:
          * only the newest inbound message of a thread may trigger an auto-reply, and only
            if it is recent (WHATSAPP_REPLY_MAX_AGE_MINUTES) and nobody answered it yet;
          * older / historical messages are stored and classified (so a STOP is always
            honoured) but never answered;
          * messages without a usable timestamp are stored but never auto-answered;
          * overlapping runs (poller + /sync) are serialised by a lock.
        """
        if settings.WHATSAPP_IS_TEST_MODE or not (
            settings.LAD_API_TOKEN or (settings.LAD_AUTH_EMAIL and settings.LAD_AUTH_PASSWORD)
        ):
            return {"status": "skipped", "message": "Test mode active or credentials missing"}

        if not cls._sync_lock.acquire(blocking=False):
            return {"status": "skipped", "message": "Sync already running"}

        try:
            from app.models.whatsapp import WhatsAppMessage
            from app.services.whatsapp_service import process_incoming_whatsapp_message

            success, conv_data = cls.get_conversations(limit=20)
            if not success:
                logger.error(f"[Mr LAD Sync] Failed to fetch conversations: {conv_data}")
                return {"status": "error", "message": str(conv_data)}

            threads = conv_data.get("data", []) if isinstance(conv_data, dict) else (conv_data if isinstance(conv_data, list) else [])
            synced_threads = new_inbound = replied = 0
            max_age = timedelta(minutes=int(settings.WHATSAPP_REPLY_MAX_AGE_MINUTES or 15))
            now = datetime.utcnow()

            for thread in threads:
                thread_id = str(thread.get("id") or thread.get("_id") or "")
                customer_phone = thread.get("phone") or thread.get("customer_phone") or thread.get("recipient")
                if not thread_id or not customer_phone:
                    continue

                sig = thread.get("last_message_at") or thread.get("updated_at") or thread.get("last_message_time")
                sig = str(sig) if sig else None
                if sig and cls._thread_signatures.get(thread_id) == sig:
                    continue  # nothing new in this thread

                clean_digits = "".join(c for c in str(customer_phone) if c.isdigit())
                if len(clean_digits) == 10:
                    clean_digits = "91" + clean_digits

                ok, msgs_data = cls.get_messages(thread_id, limit=20)
                if not ok:
                    continue
                msgs = msgs_data.get("data", []) if isinstance(msgs_data, dict) else (msgs_data if isinstance(msgs_data, list) else [])
                synced_threads += 1

                inbound, outbound_times = [], []
                for m in msgs:
                    role = (m.get("role") or "").lower()
                    direction = (m.get("direction") or "").lower()
                    is_in = (role == "user") or direction in ("inbound", "incoming", "in") or m.get("from_customer") is True
                    ts = cls._parse_ts(m)
                    if is_in:
                        text = (m.get("content") or m.get("text") or m.get("body") or "").strip()
                        msg_id = m.get("id") or m.get("wamid") or m.get("_id") or m.get("external_message_id")
                        if text and msg_id:
                            inbound.append((ts, str(msg_id), text, m))
                    elif ts:
                        outbound_times.append(ts)

                inbound.sort(key=lambda x: (x[0] is not None, x[0] or datetime.min))
                newest = inbound[-1] if inbound else None

                for ts, msg_id, text, m in inbound:
                    already = db.query(WhatsAppMessage.id).filter(WhatsAppMessage.external_message_id == msg_id).first()
                    if already:
                        continue
                    new_inbound += 1
                    is_target = (
                        newest is not None and msg_id == newest[1]
                        and ts is not None
                        and (now - ts) <= max_age
                        and not any(o >= ts for o in outbound_times)
                    )
                    sender_name = m.get("sender_name") or m.get("name") or thread.get("contact_name") or "Shop Owner"
                    try:
                        _, out_msg, _ = process_incoming_whatsapp_message(
                            db=db,
                            phone_number=clean_digits,
                            message_text=text,
                            sender_name=sender_name,
                            shop_name=thread.get("company") or None,
                            external_message_id=msg_id,
                            allow_reply=is_target,
                        )
                        if out_msg is not None:
                            replied += 1
                    except Exception as proc_err:
                        db.rollback()
                        logger.error(f"[Mr LAD Sync] Error processing message {msg_id}: {proc_err}")

                if sig:
                    cls._thread_signatures[thread_id] = sig

            return {
                "status": "success",
                "synced_threads": synced_threads,
                "new_inbound_messages": new_inbound,
                "ai_replies_sent": replied,
            }
        finally:
            cls._sync_lock.release()
