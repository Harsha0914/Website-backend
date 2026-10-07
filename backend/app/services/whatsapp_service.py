import os
# pyrefly: ignore [missing-import]
import httpx

import json
import re
import time
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any, List

# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

# pyrefly: ignore [missing-import]
from sqlalchemy import func, distinct, or_, and_

from app.models.whatsapp import (
    WhatsAppConversation,
    WhatsAppMessage,
    WhatsAppDirection,
    WhatsAppSenderType,
    LeadStatus,
)

from app.models.ai_conversation import (
    AIKnowledgeBase,
    AISettings,
    AIMessageLog,
    FollowUpSchedule,
    AIIntent,
    ConversationState,
)

from app.models.business import Business, WebsiteStatus

from app.services.ai_sales_agent import (
    classify_intent_and_sentiment,
    calculate_lead_score_and_status,
    generate_ai_sales_response,
    generate_suggested_replies,
    get_ai_settings,
    get_default_knowledge_base,
)

# IMPORTANT:
# Real Meta WhatsApp Cloud API client
from app.services.whatsapp_cloud_client import WhatsAppCloudClient
from app.services.whatsapp_guard import (
    OPT_OUT_CONFIRMATION,
    SendBlocked,
    can_message,
    delivery_status,
    phone_key,
)


# ─────────────────────────────────────────────────────────────────────────────
# BUSINESS REQUIREMENT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_business_details(
    current_details_json: str,
    message_text: str,
    shop_category: str = ""
) -> dict:
    """
    Intelligently extracts key business requirements
    from WhatsApp conversations.
    """

    details = {}

    if current_details_json:
        try:
            details = json.loads(current_details_json)
        except Exception:
            details = {}

    lower = message_text.lower().strip()

    # 1. Location extraction
    cities = [
        "hyderabad",
        "bangalore",
        "bengaluru",
        "chennai",
        "mumbai",
        "delhi",
        "pune",
        "vijayawada",
        "visakhapatnam",
        "vizag",
        "tirupati",
        "kadapa",
        "madhapur",
        "gachibowli",
        "kukatpally",
        "secunderabad",
        "rajampet",
        "pullampet",
    ]

    for city in cities:
        if city in lower:
            details["location"] = city.capitalize()

    # 2. Branches count
    branch_match = re.search(
        r"(\d+)\s*(branch|branches|locations|outlets|stores)",
        lower
    )

    if branch_match:
        details["branches"] = int(branch_match.group(1))

    # 3. Business type / category
    if any(
        k in lower
        for k in ["gym", "fitness", "workout", "crossfit"]
    ):
        details["business_type"] = "Gym & Fitness Centre"

    elif any(
        k in lower
        for k in [
            "restaurant",
            "hotel",
            "food",
            "tiffins",
            "tiffin",
            "cafe",
            "bakery",
            "sweet",
        ]
    ):
        details["business_type"] = "Restaurant & Food Services"

    elif any(
        k in lower
        for k in [
            "grocery",
            "supermarket",
            "kirana",
            "provision",
        ]
    ):
        details["business_type"] = "Grocery & Supermarket"

    elif any(
        k in lower
        for k in [
            "cloth",
            "boutique",
            "tailor",
            "garment",
            "fashion",
            "dress",
        ]
    ):
        details["business_type"] = "Clothing & Fashion"

    elif any(
        k in lower
        for k in [
            "pharmacy",
            "medical",
            "chemist",
            "clinic",
        ]
    ):
        details["business_type"] = "Pharmacy & Healthcare"

    elif shop_category and not details.get("business_type"):
        details["business_type"] = shop_category

    # 4. Feature requirements
    features = details.get("required_features", [])

    if isinstance(features, str):
        features = [features]

    if not isinstance(features, list):
        features = []

    if "membership" in lower or "plans" in lower:
        if "Membership Plans" not in features:
            features.append("Membership Plans")

    if any(
        k in lower
        for k in [
            "order",
            "ordering",
            "menu",
            "catalog",
            "products",
            "cart",
        ]
    ):
        if "WhatsApp Ordering / Catalog" not in features:
            features.append("WhatsApp Ordering / Catalog")

    if any(
        k in lower
        for k in [
            "map",
            "maps",
            "location",
            "direction",
            "google",
        ]
    ):
        if "Google Maps & Local SEO" not in features:
            features.append("Google Maps & Local SEO")

    if any(
        k in lower
        for k in [
            "photo",
            "photos",
            "gallery",
            "images",
        ]
    ):
        if "Photo Gallery" not in features:
            features.append("Photo Gallery")

    if any(
        k in lower
        for k in [
            "contact",
            "call",
            "phone",
        ]
    ):
        if "Contact & Direct Call" not in features:
            features.append("Contact & Direct Call")

    if features:
        details["required_features"] = features

    # 5. Website requirement
    if any(
        k in lower
        for k in [
            "need website",
            "want website",
            "need a website",
            "want a website",
            "create website",
            "make website",
            "interested",
            "yes",
        ]
    ):
        details["website_requirement"] = "Yes (Interested)"

    # 6. Budget detection
    budget_match = re.search(
        r"(?:₹|rs\.?|inr)?\s*(\d{3,6})",
        lower
    )

    if budget_match and any(
        b in lower
        for b in [
            "budget",
            "price",
            "pay",
            "cost",
            "₹",
            "rs",
        ]
    ):
        details["budget"] = f"₹{budget_match.group(1)}"

    return details


# ─────────────────────────────────────────────────────────────────────────────
# PHONE NUMBER NORMALIZATION
# ─────────────────────────────────────────────────────────────────────────────

def normalize_whatsapp_phone(phone: str | None) -> str:
    """
    Normalizes phone number to uniform format.

    Example:
        9100166100      -> 919100166100
        09100166100     -> 919100166100
        919100166100    -> 919100166100
    """

    if not phone:
        return ""

    digits = "".join(
        c for c in str(phone)
        if c.isdigit()
    )

    if (
        len(digits) == 11
        and digits.startswith("0")
        and digits[1] in "6789"
    ):
        return f"91{digits[1:]}"

    if (
        len(digits) == 12
        and digits.startswith("91")
    ):
        return digits

    if (
        len(digits) == 10
        and digits[0] in "6789"
    ):
        return f"91{digits}"

    if (
        len(digits) > 10
        and digits.startswith("91")
    ):
        return digits

    return digits or str(phone).strip()


# ─────────────────────────────────────────────────────────────────────────────
# GET OR CREATE CONVERSATION
# ─────────────────────────────────────────────────────────────────────────────

def get_or_create_whatsapp_conversation(
    db: Session,
    phone_number: str,
    shop_name: str = "Local Shop",
    business_id: Optional[int] = None,
) -> WhatsAppConversation:

    norm_phone = normalize_whatsapp_phone(phone_number)

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            or_(
                WhatsAppConversation.phone_number == norm_phone,
                WhatsAppConversation.phone_number == phone_number,
            )
        )
        .first()
    )

    if not conv:

        if (
            not business_id
            and shop_name != "Local Shop"
        ):
            biz = (
                db.query(Business)
                .filter(Business.name == shop_name)
                .first()
            )

            if biz:
                business_id = biz.id

        conv = WhatsAppConversation(
            phone_number=norm_phone or phone_number,
            shop_name=shop_name,
            business_id=business_id,

            # AI enabled for every new WhatsApp conversation
            auto_ai_enabled=True,

            lead_status=LeadStatus.CONTACTED.value,
            lead_score=20,
            detected_intent="UNKNOWN",
            sentiment="NEUTRAL",
            priority="MEDIUM",

            conversation_status="AI_ACTIVE",

            unread_count=0,
            human_takeover=False,

            business_details_extracted="{}",

            last_message_at=datetime.utcnow(),
        )

        db.add(conv)
        db.commit()
        db.refresh(conv)

    else:

        if business_id and not conv.business_id:
            conv.business_id = business_id
            db.commit()

        if (
            norm_phone
            and conv.phone_number != norm_phone
        ):
            conv.phone_number = norm_phone
            db.commit()

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# PROCESS INCOMING WHATSAPP MESSAGE
# ─────────────────────────────────────────────────────────────────────────────

_RESUBSCRIBE_WORDS = {"start", "subscribe", "unstop", "resume", "yes start"}


def _link_business_by_phone(db: Session, conv: WhatsAppConversation) -> Optional[Business]:
    """Attach an inbound conversation to the scraped Business that owns the number."""
    key = phone_key(conv.phone_number)
    if len(key) < 10:
        return None
    candidates = (
        db.query(Business)
        .filter(Business.phone.isnot(None), Business.phone.like(f"%{key[-3:]}%"))
        .limit(300)
        .all()
    )
    for biz in candidates:
        if phone_key(biz.phone) == key:
            conv.business_id = biz.id
            return biz
    return None


def _record_outbound(
    db: Session,
    conv: WhatsAppConversation,
    text: str,
    status: str,
    *,
    sender_type: WhatsAppSenderType = WhatsAppSenderType.AI_BOT,
    sender_name: str = "Lexon IT AI Assistant",
    ai_generated: bool = True,
    intent: Optional[str] = None,
    confidence: Optional[float] = None,
    external_message_id: Optional[str] = None,
) -> WhatsAppMessage:
    msg = WhatsAppMessage(
        conversation_id=conv.id,
        direction=WhatsAppDirection.OUTBOUND,
        sender_type=sender_type,
        sender_name=sender_name,
        message_body=text,
        intent=intent,
        confidence_score=confidence,
        ai_generated=ai_generated,
        tokens_used=len(text.split()),
        status=status,
        is_read=True,
        external_message_id=external_message_id,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    conv.last_message_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def process_incoming_whatsapp_message(
    db: Session,
    phone_number: str,
    message_text: str,
    sender_name: str = "Shop Owner",
    business_id: Optional[int] = None,
    shop_name: Optional[str] = None,
    external_message_id: Optional[str] = None,
    allow_reply: bool = True,
    dry_run: bool = False,
    message_type: str = "text",
) -> Tuple[
    WhatsAppMessage,
    Optional[WhatsAppMessage],
    bool
]:
    """
    Complete WhatsApp AI conversation flow.

    1. De-duplicate by provider message id (webhook retries / poller overlap)
    2. Find/create conversation, link it to the scraped business
    3. Classify intent + sentiment, save the inbound message
    4. Apply opt-out / re-subscribe, update lead score
    5. Decide whether the bot may answer (human takeover, caps, opt-out, send gate)
    6. Generate, vet and SEND the reply; record its TRUE delivery status

    allow_reply=False  -> classify and store only (used for historical / stale messages).
    dry_run=True       -> run the whole pipeline but never touch the real WhatsApp API
                          (used by the simulate endpoints).
    """
    start_time = time.time()

    # 1. Idempotency
    if external_message_id:
        dup = (
            db.query(WhatsAppMessage)
            .filter(WhatsAppMessage.external_message_id == str(external_message_id))
            .first()
        )
        if dup:
            return dup, None, False

    biz_name = shop_name or "Local Shop"
    biz = None
    if business_id:
        biz = db.query(Business).filter(Business.id == business_id).first()
        if biz:
            biz_name = biz.name

    # 2. Conversation
    conv = get_or_create_whatsapp_conversation(
        db=db,
        phone_number=phone_number,
        shop_name=biz_name,
        business_id=business_id,
    )
    if not biz and conv.business_id:
        biz = db.query(Business).filter(Business.id == conv.business_id).first()
    if not biz and not conv.business_id:
        biz = _link_business_by_phone(db, conv)

    was_opted_out = bool(conv.opt_out)
    was_human_takeover = bool(conv.human_takeover)
    display_sender = sender_name or conv.shop_name or "Shop Owner"

    # Non-text (image / voice / location ...): we cannot understand it, so flag a human.
    if message_type != "text":
        media_msg = WhatsAppMessage(
            conversation_id=conv.id,
            direction=WhatsAppDirection.INBOUND,
            sender_type=WhatsAppSenderType.CUSTOMER,
            sender_name=display_sender,
            message_body=f"[{message_type} message received - please review in WhatsApp]",
            status="received",
            is_read=False,
            external_message_id=str(external_message_id) if external_message_id else None,
            created_at=datetime.utcnow(),
        )
        db.add(media_msg)
        conv.last_message_at = datetime.utcnow()
        conv.unread_count = (conv.unread_count or 0) + 1
        if not conv.opt_out:
            conv.conversation_status = "HUMAN_HANDOFF"
            conv.human_takeover = True
            conv.priority = "HIGH"
        db.commit()
        db.refresh(media_msg)
        return media_msg, None, False

    # 3. Classify + store inbound
    intent, confidence, sentiment, score_delta = classify_intent_and_sentiment(
        message_text=message_text,
        previous_intent=conv.detected_intent,
    )

    inbound_msg = WhatsAppMessage(
        conversation_id=conv.id,
        direction=WhatsAppDirection.INBOUND,
        sender_type=WhatsAppSenderType.CUSTOMER,
        sender_name=display_sender,
        message_body=message_text,
        intent=intent.value,
        confidence_score=confidence,
        status="received",
        is_read=False,
        external_message_id=str(external_message_id) if external_message_id else None,
        created_at=datetime.utcnow(),
    )
    db.add(inbound_msg)
    conv.last_message_at = datetime.utcnow()
    conv.unread_count = (conv.unread_count or 0) + 1
    conv.detected_intent = intent.value
    conv.sentiment = sentiment

    # 4a. Opt-out / re-subscribe
    just_opted_out = False
    bare_text = re.sub(r"[^\w\s]", "", (message_text or "").lower()).strip()
    if intent == AIIntent.STOP_CONTACT:
        just_opted_out = not was_opted_out
        conv.opt_out = True
        conv.lead_status = LeadStatus.DO_NOT_CONTACT.value
        conv.auto_ai_enabled = False
        conv.conversation_status = "RESOLVED"
    elif conv.opt_out and bare_text in _RESUBSCRIBE_WORDS:
        conv.opt_out = False
        conv.auto_ai_enabled = True
        conv.human_takeover = False
        conv.conversation_status = "AI_ACTIVE"

    # 4b. Lead score / status
    updated_score, new_lead_status, priority, conv_status = calculate_lead_score_and_status(
        current_score=conv.lead_score or 20,
        intent=intent,
        sentiment=sentiment,
        business=biz,
    )
    conv.lead_score = updated_score
    conv.lead_status = new_lead_status.value
    conv.priority = priority
    if conv.opt_out:
        # an opted-out number can never drift back into an active lead state
        conv.lead_status = LeadStatus.DO_NOT_CONTACT.value
        conv.conversation_status = "RESOLVED"
    elif conv_status == "HUMAN_HANDOFF":
        conv.conversation_status = "HUMAN_HANDOFF"
        conv.human_takeover = True

    # 4c. Requirements extraction
    biz_category = biz.category if biz else "Local Business"
    updated_details = extract_business_details(
        conv.business_details_extracted,
        message_text,
        biz_category,
    )
    conv.business_details_extracted = json.dumps(updated_details)

    db.commit()
    db.refresh(inbound_msg)

    if not allow_reply:
        return inbound_msg, None, False

    # Courtesy confirmation for a fresh STOP (the only message an opted-out number may get)
    if just_opted_out:
        ok, raw_err, raw = True, None, {"mode": "simulator"}
        if not dry_run:
            ok, raw_err, raw = WhatsAppCloudClient.send_text(
                db=db, to_phone=conv.phone_number, text_body=OPT_OUT_CONFIRMATION, preview_url=False,
                enforce_gate=False,
            )
        confirm = _record_outbound(
            db, conv, OPT_OUT_CONFIRMATION, delivery_status(ok, raw),
            intent=intent.value, confidence=confidence,
        )
        return inbound_msg, confirm, bool(ok)

    # 5. May the bot answer?
    ai_cfg = get_ai_settings(db)
    if not ai_cfg.ai_enabled or not ai_cfg.ai_auto_reply_enabled:
        return inbound_msg, None, False

    # A human owns the thread (set BEFORE this message): the bot stays silent.
    if was_human_takeover:
        return inbound_msg, None, False

    if not conv.auto_ai_enabled or conv.opt_out:
        return inbound_msg, None, False

    # Hard cap on bot messages per conversation (prevents bot-to-bot / runaway loops)
    ai_sent = (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.conversation_id == conv.id,
            WhatsAppMessage.direction == WhatsAppDirection.OUTBOUND,
            WhatsAppMessage.ai_generated.is_(True),
            WhatsAppMessage.status.in_(("sent", "simulated")),
        )
        .count()
    )
    max_ai = ai_cfg.max_ai_messages_per_conv or 0
    if max_ai and ai_sent >= max_ai:
        conv.conversation_status = "HUMAN_HANDOFF"
        conv.human_takeover = True
        db.commit()
        return inbound_msg, None, False

    # Single send gate: valid number, not opted out, daily cap
    if not dry_run:
        allowed, _reason = can_message(db, conv.phone_number)
        if not allowed:
            return inbound_msg, None, False

    # 6. Generate reply
    reply_text, is_handoff, handoff_reason = generate_ai_sales_response(
        db=db,
        conversation=conv,
        incoming_message=message_text,
        intent=intent,
        sentiment=sentiment,
        business=biz,
        confidence=confidence,
    )
    latency = int((time.time() - start_time) * 1000)

    if is_handoff:
        conv.conversation_status = "HUMAN_HANDOFF"
        conv.human_takeover = True
        conv.lead_status = LeadStatus.HUMAN_HANDOFF.value

    # 7. Send
    whatsapp_sent, whatsapp_error, whatsapp_response = False, None, None
    if dry_run:
        whatsapp_sent, whatsapp_response = True, {"mode": "simulator"}
    else:
        try:
            whatsapp_sent, whatsapp_result, whatsapp_response = WhatsAppCloudClient.send_text(
                db=db,
                to_phone=conv.phone_number,
                text_body=reply_text,
                preview_url=True,
            )
            if not whatsapp_sent:
                whatsapp_error = whatsapp_result
                print(f"[WhatsApp AI] Failed to send message to {conv.phone_number}: {whatsapp_error}")
        except Exception as e:
            whatsapp_error = str(e)
            print(f"[WhatsApp AI] Exception while sending message to {conv.phone_number}: {e}")

    status = delivery_status(whatsapp_sent, whatsapp_response)

    # 8. Record the reply with its TRUE status
    outbound_msg = _record_outbound(
        db, conv, reply_text, status,
        sender_name=f"{ai_cfg.ai_tone.title()} AI Assistant",
        intent=intent.value, confidence=confidence,
    )

    # 9. AI audit log
    db.add(AIMessageLog(
        conversation_id=conv.id,
        incoming_message_id=inbound_msg.id,
        incoming_text=message_text,
        ai_response_text=reply_text,
        model_used="gpt-4o-mini",
        intent=intent.value,
        confidence=confidence,
        sentiment=sentiment,
        tokens_used=len(reply_text.split()),
        latency_ms=latency,
        was_sent=(status == "sent"),
        is_human_override=False,
        triggered_handoff=is_handoff,
        handoff_reason=handoff_reason or (f"send failed: {whatsapp_error}" if whatsapp_error else None),
        created_at=datetime.utcnow(),
    ))
    db.commit()

    return inbound_msg, outbound_msg, bool(whatsapp_sent)


# ─────────────────────────────────────────────────────────────────────────────
# MANUAL OPERATOR MESSAGE
# ─────────────────────────────────────────────────────────────────────────────

def send_manual_operator_message(
    db: Session,
    conversation_id: int,
    message_text: str,
    operator_name: str = "Lexon IT Team",
) -> WhatsAppMessage:
    """
    Sends a manual operator message to the shop owner
    through the real WhatsApp Cloud API.
    """

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    # Same gate as every other send path: opt-out, valid number, daily cap.
    allowed, block_reason = can_message(db, conv.phone_number)
    if not allowed:
        raise SendBlocked(block_reason or "blocked")

    # ─────────────────────────────────────────────────────────────────────
    # Send through the configured WhatsApp provider
    # ─────────────────────────────────────────────────────────────────────

    whatsapp_sent = False

    whatsapp_message_id = None

    send_raw = None

    try:

        whatsapp_sent, whatsapp_result, send_raw = (
            WhatsAppCloudClient.send_text(
                db=db,
                to_phone=conv.phone_number,
                text_body=message_text,
                preview_url=True,
            )
        )

        if whatsapp_sent:

            whatsapp_message_id = whatsapp_result

            print(
                f"[WhatsApp Manual] Message sent to "
                f"{conv.phone_number}"
            )

        else:

            print(
                f"[WhatsApp Manual] Failed to send: "
                f"{whatsapp_result}"
            )

    except Exception as e:

        print(
            f"[WhatsApp Manual] Exception: {e}"
        )

    # ─────────────────────────────────────────────────────────────────────
    # Save message
    # ─────────────────────────────────────────────────────────────────────

    outbound_msg = WhatsAppMessage(
        conversation_id=conv.id,

        direction=WhatsAppDirection.OUTBOUND,

        sender_type=WhatsAppSenderType.MANUAL_OPERATOR,

        sender_name=(
            operator_name
            or "Human Specialist"
        ),

        message_body=message_text,

        ai_generated=False,

        status=delivery_status(whatsapp_sent, send_raw),

        is_read=True,

        created_at=datetime.utcnow(),
    )

    db.add(outbound_msg)

    conv.last_message_at = datetime.utcnow()

    db.commit()

    db.refresh(outbound_msg)

    return outbound_msg


# ─────────────────────────────────────────────────────────────────────────────
# TOGGLE AI BOT
# ─────────────────────────────────────────────────────────────────────────────

def toggle_whatsapp_ai_bot(
    db: Session,
    conversation_id: int,
    enabled: bool,
) -> WhatsAppConversation:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    conv.auto_ai_enabled = enabled

    if enabled:

        conv.human_takeover = False

        conv.conversation_status = "AI_ACTIVE"

    else:

        conv.conversation_status = "OPEN"

    db.commit()

    db.refresh(conv)

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# HUMAN TAKEOVER
# ─────────────────────────────────────────────────────────────────────────────

def toggle_human_takeover(
    db: Session,
    conversation_id: int,
    takeover: bool,
) -> WhatsAppConversation:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    conv.human_takeover = takeover

    if takeover:

        conv.auto_ai_enabled = False

        conv.conversation_status = "HUMAN_HANDOFF"

        conv.lead_status = (
            LeadStatus.HUMAN_HANDOFF.value
        )

    else:

        conv.auto_ai_enabled = True

        conv.conversation_status = "AI_ACTIVE"

    db.commit()

    db.refresh(conv)

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# MARK CONVERSATION AS READ
# ─────────────────────────────────────────────────────────────────────────────

def mark_conversation_as_read(
    db: Session,
    conversation_id: int,
) -> WhatsAppConversation:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    conv.unread_count = 0

    (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.conversation_id
            == conversation_id
        )
        .update(
            {"is_read": True}
        )
    )

    db.commit()

    db.refresh(conv)

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE LEAD STATUS
# ─────────────────────────────────────────────────────────────────────────────

def update_conversation_lead_status(
    db: Session,
    conversation_id: int,
    lead_status: str,
) -> WhatsAppConversation:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    conv.lead_status = lead_status

    db.commit()

    db.refresh(conv)

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE FOLLOW UP
# ─────────────────────────────────────────────────────────────────────────────

def schedule_follow_up(
    db: Session,
    conversation_id: int,
    scheduled_for: datetime,
    note: str,
    assigned_user_id: Optional[int] = None,
) -> FollowUpSchedule:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    conv.follow_up_date = scheduled_for

    conv.follow_up_note = note

    conv.lead_status = (
        LeadStatus.FOLLOW_UP_REQUIRED.value
    )

    follow_up = FollowUpSchedule(
        conversation_id=conv.id,

        business_id=conv.business_id,

        assigned_user_id=assigned_user_id,

        scheduled_for=scheduled_for,

        note=note,

        status="PENDING",

        created_at=datetime.utcnow(),
    )

    db.add(follow_up)

    db.commit()

    db.refresh(follow_up)

    return follow_up


# ─────────────────────────────────────────────────────────────────────────────
# WHATSAPP ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

def get_comprehensive_whatsapp_analytics(
    db: Session,
    period: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:

    now = datetime.utcnow()

    # ─────────────────────────────────────────────────────────────────────
    # Date range
    # ─────────────────────────────────────────────────────────────────────

    if period == "yesterday":

        yest = now - timedelta(days=1)

        start_dt = yest.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        end_dt = yest.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    elif period == "7days":

        start_dt = (
            now - timedelta(days=6)
        ).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        end_dt = now.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    elif period == "30days":

        start_dt = (
            now - timedelta(days=29)
        ).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        end_dt = now.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    elif period == "custom" and start_date:

        try:

            if "T" in start_date:

                start_dt = datetime.fromisoformat(
                    start_date.replace(
                        "Z",
                        "+00:00",
                    )
                ).replace(
                    tzinfo=None
                )

            else:

                s_parts = [
                    int(p)
                    for p in start_date.split("-")
                ]

                start_dt = datetime(
                    s_parts[0],
                    s_parts[1],
                    s_parts[2],
                    0,
                    0,
                    0,
                    0,
                )

            if end_date:

                if "T" in end_date:

                    end_dt = datetime.fromisoformat(
                        end_date.replace(
                            "Z",
                            "+00:00",
                        )
                    ).replace(
                        tzinfo=None
                    )

                else:

                    e_parts = [
                        int(p)
                        for p in end_date.split("-")
                    ]

                    end_dt = datetime(
                        e_parts[0],
                        e_parts[1],
                        e_parts[2],
                        23,
                        59,
                        59,
                        999999,
                    )

            else:

                end_dt = start_dt.replace(
                    hour=23,
                    minute=59,
                    second=59,
                    microsecond=999999,
                )

        except Exception:

            start_dt = now.replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            )

            end_dt = now.replace(
                hour=23,
                minute=59,
                second=59,
                microsecond=999999,
            )

    else:

        start_dt = now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        end_dt = now.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )

    # ─────────────────────────────────────────────────────────────────────
    # Messages
    # ─────────────────────────────────────────────────────────────────────

    messages_in_range = (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.created_at >= start_dt,
            WhatsAppMessage.created_at <= end_dt,
        )
        .all()
    )

    # ─────────────────────────────────────────────────────────────────────
    # Conversations
    # ─────────────────────────────────────────────────────────────────────

    all_conversations = (
        db.query(WhatsAppConversation)
        .all()
    )

    conv_ids_in_range = {
        m.conversation_id
        for m in messages_in_range
    }

    conversations_in_range = [
        c
        for c in all_conversations
        if c.id in conv_ids_in_range
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Core metrics
    # ─────────────────────────────────────────────────────────────────────

    total_numbers_contacted = len(
        conv_ids_in_range
    )

    total_messages_sent = sum(
        1
        for m in messages_in_range
        if m.direction
        == WhatsAppDirection.OUTBOUND
    )

    messages_received = sum(
        1
        for m in messages_in_range
        if m.direction
        == WhatsAppDirection.INBOUND
    )

    ai_replies_sent = sum(
        1
        for m in messages_in_range
        if (
            m.sender_type
            in (
                WhatsAppSenderType.AI_BOT,
                WhatsAppSenderType.AI,
            )
            or m.ai_generated
        )
        and m.direction
        == WhatsAppDirection.OUTBOUND
    )

    manual_replies_sent = sum(
        1
        for m in messages_in_range
        if (
            m.sender_type
            in (
                WhatsAppSenderType.MANUAL_OPERATOR,
                WhatsAppSenderType.HUMAN,
                WhatsAppSenderType.LEXON_IT_TEAM,
                WhatsAppSenderType.LEXONITY_TEAM,
            )
        )
        and m.direction
        == WhatsAppDirection.OUTBOUND
    )

    # ─────────────────────────────────────────────────────────────────────
    # Responded
    # ─────────────────────────────────────────────────────────────────────

    responded_conv_ids = {
        m.conversation_id
        for m in messages_in_range
        if m.direction
        == WhatsAppDirection.INBOUND
    }

    people_responded = len(
        responded_conv_ids
    )

    people_not_responded = max(
        0,
        total_numbers_contacted
        - people_responded,
    )

    # ─────────────────────────────────────────────────────────────────────
    # Active conversations
    # ─────────────────────────────────────────────────────────────────────

    active_conversations_count = len(
        conv_ids_in_range
    )

    active_ai_conversations = sum(
        1
        for c in conversations_in_range
        if c.auto_ai_enabled
        and not c.human_takeover
    )

    active_manual_conversations = sum(
        1
        for c in conversations_in_range
        if c.human_takeover
        or not c.auto_ai_enabled
    )

    # ─────────────────────────────────────────────────────────────────────
    # AI logs
    # ─────────────────────────────────────────────────────────────────────

    ai_logs = (
        db.query(AIMessageLog)
        .filter(
            AIMessageLog.created_at >= start_dt,
            AIMessageLog.created_at <= end_dt,
        )
        .all()
    )

    ai_conversations_count = len(
        {
            l.conversation_id
            for l in ai_logs
        }
    )

    ai_responses_count = len(
        ai_logs
    )

    ai_handoffs_count = (
        sum(
            1
            for l in ai_logs
            if l.triggered_handoff
        )
        +
        sum(
            1
            for c in conversations_in_range
            if c.conversation_status
            == "HUMAN_HANDOFF"
        )
    )

    avg_latency = (
        round(
            sum(
                l.latency_ms
                for l in ai_logs
            )
            / len(ai_logs),
            0,
        )
        if ai_logs
        else 0
    )

    # ─────────────────────────────────────────────────────────────────────
    # Rates
    # ─────────────────────────────────────────────────────────────────────

    response_rate = (
        round(
            (
                people_responded
                / total_numbers_contacted
                * 100
            ),
            1,
        )
        if total_numbers_contacted > 0
        else 0.0
    )

    ai_response_rate = (
        round(
            (
                ai_replies_sent
                / max(
                    1,
                    messages_received,
                )
                * 100
            ),
            1,
        )
        if messages_received > 0
        else (
            100.0
            if ai_replies_sent > 0
            else 0.0
        )
    )

    ai_resolution_rate = (
        round(
            (
                (
                    ai_responses_count
                    - ai_handoffs_count
                )
                / max(
                    1,
                    ai_responses_count,
                )
                * 100
            ),
            1,
        )
        if ai_responses_count > 0
        else 0.0
    )

    human_handoff_rate = (
        round(
            (
                ai_handoffs_count
                / max(
                    1,
                    total_numbers_contacted,
                )
                * 100
            ),
            1,
        )
        if total_numbers_contacted > 0
        else 0.0
    )

    # ─────────────────────────────────────────────────────────────────────
    # Lead conversion
    # ─────────────────────────────────────────────────────────────────────

    interested_leads = sum(
        1
        for c in conversations_in_range
        if c.lead_status
        in (
            "INTERESTED",
            "QUALIFIED",
            "CALL_REQUESTED",
            "DEMO_REQUESTED",
            "QUOTATION_REQUESTED",
            "CUSTOMER",
        )
    )

    qualified_leads = sum(
        1
        for c in conversations_in_range
        if c.lead_status
        in (
            "QUALIFIED",
            "CALL_REQUESTED",
            "QUOTATION_REQUESTED",
            "CUSTOMER",
        )
    )

    lead_conversion_rate = (
        round(
            (
                qualified_leads
                / total_numbers_contacted
                * 100
            ),
            1,
        )
        if total_numbers_contacted > 0
        else 0.0
    )

    # ─────────────────────────────────────────────────────────────────────
    # Time series
    # ─────────────────────────────────────────────────────────────────────

    time_series = []

    days_span = max(
        1,
        (
            end_dt.date()
            - start_dt.date()
        ).days
        + 1,
    )

    bucket_count = min(
        30,
        days_span,
    )

    for i in range(bucket_count):

        bucket_date = (
            start_dt
            + timedelta(days=i)
        ).date()

        date_label = bucket_date.strftime(
            "%b %d"
        )

        day_msgs = [
            m
            for m in messages_in_range
            if m.created_at.date()
            == bucket_date
        ]

        sent_c = sum(
            1
            for m in day_msgs
            if m.direction
            == WhatsAppDirection.OUTBOUND
        )

        rec_c = sum(
            1
            for m in day_msgs
            if m.direction
            == WhatsAppDirection.INBOUND
        )

        ai_c = sum(
            1
            for m in day_msgs
            if (
                m.sender_type
                in (
                    WhatsAppSenderType.AI_BOT,
                    WhatsAppSenderType.AI,
                )
                or m.ai_generated
            )
            and m.direction
            == WhatsAppDirection.OUTBOUND
        )

        man_c = sum(
            1
            for m in day_msgs
            if (
                m.sender_type
                in (
                    WhatsAppSenderType.MANUAL_OPERATOR,
                    WhatsAppSenderType.HUMAN,
                    WhatsAppSenderType.LEXON_IT_TEAM,
                    WhatsAppSenderType.LEXONITY_TEAM,
                )
            )
            and m.direction
            == WhatsAppDirection.OUTBOUND
        )

        time_series.append(
            {
                "date": date_label,
                "sent": sent_c,
                "received": rec_c,
                "ai_replies": ai_c,
                "manual_replies": man_c,
                "total_messages": len(day_msgs),
            }
        )

    # ─────────────────────────────────────────────────────────────────────
    # Lead funnel
    # ─────────────────────────────────────────────────────────────────────

    lead_funnel = [
        {
            "stage": "Contacted",
            "count": total_numbers_contacted,
        },
        {
            "stage": "Responded",
            "count": people_responded,
        },
        {
            "stage": "Interested",
            "count": interested_leads,
        },
        {
            "stage": "Qualified",
            "count": qualified_leads,
        },
        {
            "stage": "Handoff / Call",
            "count": sum(
                1
                for c in conversations_in_range
                if c.lead_status
                in (
                    "CALL_REQUESTED",
                    "HUMAN_HANDOFF",
                    "QUOTATION_REQUESTED",
                )
            ),
        },
        {
            "stage": "Customer",
            "count": sum(
                1
                for c in conversations_in_range
                if c.lead_status
                == "CUSTOMER"
            ),
        },
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Recent activity
    # ─────────────────────────────────────────────────────────────────────

    recent_messages = (
        db.query(WhatsAppMessage)
        .filter(
            WhatsAppMessage.created_at >= start_dt,
            WhatsAppMessage.created_at <= end_dt,
        )
        .order_by(
            WhatsAppMessage.created_at.desc()
        )
        .limit(10)
        .all()
    )

    if not recent_messages:

        recent_messages = (
            db.query(WhatsAppMessage)
            .order_by(
                WhatsAppMessage.created_at.desc()
            )
            .limit(10)
            .all()
        )

    conv_map = {
        c.id: c
        for c in all_conversations
    }

    recent_activity = [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,

            "shop_name": (
                conv_map.get(
                    m.conversation_id
                ).shop_name
                if conv_map.get(
                    m.conversation_id
                )
                else "Shop"
            ),

            "phone_number": (
                conv_map.get(
                    m.conversation_id
                ).phone_number
                if conv_map.get(
                    m.conversation_id
                )
                else ""
            ),

            "direction": m.direction.value,

            "sender_type": m.sender_type.value,

            "sender_name": m.sender_name,

            "message_body": m.message_body,

            "intent": (
                m.intent
                or "GENERAL"
            ),

            "status": m.status,

            "created_at": (
                m.created_at.isoformat()
            ),
        }
        for m in recent_messages
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Human handoff alerts
    # ─────────────────────────────────────────────────────────────────────

    handoff_alerts = [
        {
            "conversation_id": c.id,

            "shop_name": c.shop_name,

            "phone_number": c.phone_number,

            "lead_status": c.lead_status,

            "intent": c.detected_intent,

            "priority": c.priority,

            "last_message_at": (
                c.last_message_at.isoformat()
            ),
        }

        for c in conversations_in_range

        if c.conversation_status
        == "HUMAN_HANDOFF"
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Return analytics
    # ─────────────────────────────────────────────────────────────────────

    return {
        "period": period,

        "start_date": start_dt.isoformat(),

        "end_date": end_dt.isoformat(),

        # Core KPIs
        "numbers_contacted":
            total_numbers_contacted,

        "messages_sent":
            total_messages_sent,

        "people_responded":
            people_responded,

        "people_not_responded":
            people_not_responded,

        "messages_received":
            messages_received,

        "ai_replies_sent":
            ai_replies_sent,

        "manual_replies_sent":
            manual_replies_sent,

        "active_conversations":
            active_conversations_count,

        "active_ai_conversations":
            active_ai_conversations,

        "active_manual_conversations":
            active_manual_conversations,

        # Rates
        "ai_response_rate":
            ai_response_rate,

        "response_rate":
            response_rate,

        "lead_conversion_rate":
            lead_conversion_rate,

        "interested_leads":
            interested_leads,

        "qualified_leads":
            qualified_leads,

        "human_handoffs":
            ai_handoffs_count,

        "human_handoff_rate":
            human_handoff_rate,

        # AI
        "ai_conversations":
            ai_conversations_count,

        "ai_responses":
            ai_responses_count,

        "ai_resolution_rate":
            ai_resolution_rate,

        "avg_ai_response_time_ms":
            avg_latency,

        # Charts
        "time_series":
            time_series,

        "lead_funnel":
            lead_funnel,

        "recent_logs":
            recent_activity,

        "recent_activity":
            recent_activity,

        "handoff_alerts":
            handoff_alerts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ANALYTICS STATS ALIAS
# ─────────────────────────────────────────────────────────────────────────────

def get_whatsapp_analytics_stats(
    db: Session,
    period: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:

    return get_comprehensive_whatsapp_analytics(
        db=db,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE CONVERSATION REQUIREMENTS
# ─────────────────────────────────────────────────────────────────────────────

def update_conversation_requirements(
    db: Session,
    conversation_id: int,
    details: dict,
) -> WhatsAppConversation:

    conv = (
        db.query(WhatsAppConversation)
        .filter(
            WhatsAppConversation.id
            == conversation_id
        )
        .first()
    )

    if not conv:
        raise ValueError(
            f"WhatsApp conversation with ID "
            f"{conversation_id} not found"
        )

    if isinstance(details, dict):

        conv.business_details_extracted = (
            json.dumps(details)
        )

    elif isinstance(details, str):

        conv.business_details_extracted = details

    db.commit()

    db.refresh(conv)

    return conv


# ─────────────────────────────────────────────────────────────────────────────
# TRACK OUTBOUND CONTACT
# ─────────────────────────────────────────────────────────────────────────────

def track_whatsapp_outbound_contact(
    db: Session,
    phone_number: str,
    shop_name: str,
    business_id: Optional[int] = None,
    message_text: Optional[str] = None,
) -> WhatsAppMessage:

    conv = get_or_create_whatsapp_conversation(
        db=db,
        phone_number=phone_number,
        shop_name=shop_name,
        business_id=business_id,
    )

    body = (
        message_text
        or
        f"Hello {shop_name}, "
        f"reaching out to discuss your "
        f"business website and online presence."
    )

    outbound_msg = WhatsAppMessage(
        conversation_id=conv.id,

        direction=WhatsAppDirection.OUTBOUND,

        sender_type=WhatsAppSenderType.HUMAN,

        sender_name="Lexon IT Agent",

        message_body=body,

        ai_generated=False,

        status="sent",

        is_read=True,

        created_at=datetime.utcnow(),
    )

    db.add(outbound_msg)

    conv.last_message_at = datetime.utcnow()

    conv.lead_status = (
        LeadStatus.CONTACTED.value
    )

    db.commit()

    db.refresh(outbound_msg)

    return outbound_msg


# ─────────────────────────────────────────────────────────────────────────────
# RESET WHATSAPP HISTORY
# ─────────────────────────────────────────────────────────────────────────────

def reset_whatsapp_history(
    db: Session,
) -> dict:

    try:

        db.query(AIMessageLog).delete()

        db.query(FollowUpSchedule).delete()

        db.query(WhatsAppMessage).delete()

        db.query(WhatsAppConversation).delete()

        db.commit()

        return {
            "status": "success",
            "message":
                "All WhatsApp conversations "
                "and logs have been reset.",
        }

    except Exception as e:

        db.rollback()

        return {
            "status": "error",
            "message": str(e),
        }