import json
import time
from typing import List, Optional, Dict, Any
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from datetime import datetime
# pyrefly: ignore [missing-import]
from pydantic import BaseModel

from app.database import get_db
from app.config import settings
from app.auth.dependencies import get_current_user, require_admin
from app.services.whatsapp_guard import (
    SendBlocked,
    can_message,
    delivery_status,
    is_valid_phone,
)
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
)
from app.models.business import Business
from app.services.whatsapp_service import (
    get_or_create_whatsapp_conversation,
    process_incoming_whatsapp_message,
    send_manual_operator_message,
    toggle_whatsapp_ai_bot,
    toggle_human_takeover,
    mark_conversation_as_read,
    update_conversation_lead_status,
    schedule_follow_up,
    get_comprehensive_whatsapp_analytics,
    normalize_whatsapp_phone,
)
from app.services.whatsapp_cloud_client import WhatsAppCloudClient
from app.services.ai_sales_agent import (
    get_default_knowledge_base,
    get_ai_settings,
    generate_suggested_replies,
)

from app.services.whatsapp_access import owned_conversation_or_404, own_conversations  # noqa: E402

router = APIRouter(
    prefix="/api/ai-whatsapp",
    tags=["AI WhatsApp Sales & Conversation Hub"],
    dependencies=[Depends(get_current_user)],
)


# ─── Pydantic Schemas ────────────────────────────────────────────────────────
class BulkWhatsAppBroadcastSchema(BaseModel):
    shops: List[Dict[str, Any]]
    custom_message: Optional[str] = None
    auto_ai_enabled: Optional[bool] = True
    operator_name: Optional[str] = "Lexon IT AI Specialist"
    include_flyer: Optional[bool] = True
    image_id: Optional[int] = None   # a picture from the signed-in account's own library
    template_key: Optional[str] = None  # 'offer-link' | 'about-company': which message the user chose

class MessageSendSchema(BaseModel):
    message_text: str
    operator_name: Optional[str] = "Lexon IT Team"

class ToggleAISchema(BaseModel):
    enabled: bool

class TakeoverSchema(BaseModel):
    takeover: bool

class FollowUpCreateSchema(BaseModel):
    scheduled_for: str
    note: str

class SimulateMessageSchema(BaseModel):
    phone_number: str
    message_text: str
    shop_name: Optional[str] = "Local Store"
    business_id: Optional[int] = None

class KnowledgeBaseUpdateSchema(BaseModel):
    company_name: Optional[str] = None
    company_description: Optional[str] = None
    website_services: Optional[List[str]] = None
    website_packages: Optional[List[Dict[str, Any]]] = None
    portfolio_links: Optional[List[Dict[str, Any]]] = None
    faqs: Optional[List[Dict[str, str]]] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    business_hours: Optional[str] = None
    terms_and_notes: Optional[str] = None

class AISettingsUpdateSchema(BaseModel):
    ai_enabled: Optional[bool] = None
    ai_auto_reply_enabled: Optional[bool] = None
    confidence_threshold: Optional[float] = None
    max_ai_messages_per_conv: Optional[int] = None
    human_handoff_enabled: Optional[bool] = None
    auto_lead_classification: Optional[bool] = None
    auto_intent_detection: Optional[bool] = None
    auto_follow_up_enabled: Optional[bool] = None
    ai_tone: Optional[str] = None
    ai_language: Optional[str] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None


# ─── 1. Conversations List with Filter Tabs ──────────────────────────────────
@router.get("/conversations")
def get_conversations(
    filter_tab: str = Query("all", description="all, unread, ai_active, human_assigned, interested, hot_leads, not_interested, needs_follow_up"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.services.chat_durability import restore_for_user
    restore_for_user(db, current_user)  # after a restart, bring this account's chats back from MongoDB
    query = own_conversations(db, current_user)  # only the signed-in account's chats

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (WhatsAppConversation.shop_name.ilike(s)) |
            (WhatsAppConversation.phone_number.ilike(s)) |
            (WhatsAppConversation.owner_name.ilike(s))
        )

    if filter_tab == "unread":
        query = query.filter(WhatsAppConversation.unread_count > 0)
    elif filter_tab == "ai_active":
        query = query.filter(WhatsAppConversation.auto_ai_enabled == True, WhatsAppConversation.human_takeover == False)
    elif filter_tab == "human_assigned":
        query = query.filter(WhatsAppConversation.human_takeover == True)
    elif filter_tab == "interested":
        query = query.filter(WhatsAppConversation.lead_status.in_(["INTERESTED", "QUALIFIED", "CALL_REQUESTED", "QUOTE_REQUESTED"]))
    elif filter_tab == "hot_leads":
        query = query.filter(WhatsAppConversation.lead_score >= 70)
    elif filter_tab == "not_interested":
        query = query.filter(WhatsAppConversation.lead_status.in_(["NOT_INTERESTED", "DO_NOT_CONTACT"]))
    elif filter_tab == "needs_follow_up":
        query = query.filter(WhatsAppConversation.lead_status == "FOLLOW_UP_REQUIRED")

    conversations = query.order_by(WhatsAppConversation.last_message_at.desc()).all()

    results = []
    for c in conversations:
        last_msg = (
            db.query(WhatsAppMessage)
            .filter(WhatsAppMessage.conversation_id == c.id)
            .order_by(WhatsAppMessage.created_at.desc())
            .first()
        )

        biz = db.query(Business).filter(Business.id == c.business_id).first() if c.business_id else None

        results.append({
            "id": c.id,
            "business_id": c.business_id,
            "shop_name": c.shop_name,
            "owner_name": c.owner_name or (biz.name if biz else None),
            "phone_number": c.phone_number,
            "category": biz.category if biz else "Local Business",
            "website_url": biz.website_url if biz else None,
            "website_status": biz.website_status.value if (biz and hasattr(biz.website_status, 'value')) else (biz.website_status if biz else "NO_WEBSITE"),
            "website_score": biz.website_score if biz else None,
            "auto_ai_enabled": c.auto_ai_enabled,
            "human_takeover": c.human_takeover,
            "lead_status": c.lead_status,
            "lead_score": c.lead_score,
            "detected_intent": c.detected_intent,
            "sentiment": c.sentiment,
            "priority": c.priority,
            "conversation_status": c.conversation_status,
            "unread_count": c.unread_count,
            "opt_out": c.opt_out,
            "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
            "follow_up_note": c.follow_up_note,
            "last_message": {
                "text": last_msg.message_body if last_msg else None,
                "sender_type": last_msg.sender_type.value if last_msg else None,
                "created_at": last_msg.created_at.isoformat() if last_msg else c.last_message_at.isoformat(),
            } if last_msg else None,
            "created_at": c.created_at.isoformat(),
            "last_message_at": c.last_message_at.isoformat(),
        })

    return {
        "filter_tab": filter_tab,
        "total": len(results),
        "conversations": results
    }


# ─── 2. Conversation Details & Message History ──────────────────────────────
@router.get("/conversations/{conversation_id}")
def get_conversation_detail(conversation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    conv = owned_conversation_or_404(db, conversation_id, current_user)

    messages = (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.conversation_id == conv.id)
        .order_by(WhatsAppMessage.created_at.asc())
        .all()
    )

    biz = db.query(Business).filter(Business.id == conv.business_id).first() if conv.business_id else None

    # Extracted requirements JSON
    reqs = {}
    try:
        reqs = json.loads(conv.business_details_extracted or "{}")
    except Exception:
        reqs = {}

    return {
        "id": conv.id,
        "business_id": conv.business_id,
        "shop_name": conv.shop_name,
        "owner_name": conv.owner_name,
        "phone_number": conv.phone_number,
        "auto_ai_enabled": conv.auto_ai_enabled,
        "human_takeover": conv.human_takeover,
        "lead_status": conv.lead_status,
        "lead_score": conv.lead_score,
        "detected_intent": conv.detected_intent,
        "sentiment": conv.sentiment,
        "priority": conv.priority,
        "conversation_status": conv.conversation_status,
        "unread_count": conv.unread_count,
        "opt_out": conv.opt_out,
        "follow_up_date": conv.follow_up_date.isoformat() if conv.follow_up_date else None,
        "follow_up_note": conv.follow_up_note,
        "business_details_extracted": reqs,
        "business": {
            "id": biz.id if biz else None,
            "name": biz.name if biz else conv.shop_name,
            "category": biz.category if biz else "Business",
            "address": biz.address if biz else None,
            "phone": biz.phone if biz else conv.phone_number,
            "website_url": biz.website_url if biz else None,
            "website_status": biz.website_status.value if (biz and hasattr(biz.website_status, 'value')) else (biz.website_status if biz else "NO_WEBSITE"),
            "website_score": biz.website_score if biz else None,
            "rating": biz.rating if biz else None,
        } if biz else None,
        "messages": [
            {
                "id": m.id,
                "direction": m.direction.value,
                "sender_type": m.sender_type.value,
                "sender_name": m.sender_name,
                "message_body": m.message_body,
                "intent": m.intent,
                "confidence_score": m.confidence_score,
                "ai_generated": m.ai_generated,
                "status": m.status,
                "is_read": m.is_read,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


# ─── 3. Manual Operator Send Message ─────────────────────────────────────────
@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    payload: MessageSendSchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    owned_conversation_or_404(db, conversation_id, current_user)
    try:
        msg = send_manual_operator_message(
            db=db,
            conversation_id=conversation_id,
            message_text=payload.message_text,
            operator_name=payload.operator_name or "Lexon IT Specialist"
        )
        return {
            "status": "success",
            "message_id": msg.id,
            "message_body": msg.message_body,
            "sender_type": msg.sender_type.value,
            "created_at": msg.created_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SendBlocked as e:
        raise HTTPException(status_code=409, detail=f"Message not sent: {e.reason}")


# ─── 4. Toggle AI Controls ───────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/toggle-ai")
def toggle_ai(
    conversation_id: int,
    payload: ToggleAISchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    owned_conversation_or_404(db, conversation_id, current_user)
    try:
        conv = toggle_whatsapp_ai_bot(db=db, conversation_id=conversation_id, enabled=payload.enabled)
        return {
            "status": "success",
            "conversation_id": conv.id,
            "auto_ai_enabled": conv.auto_ai_enabled,
            "conversation_status": conv.conversation_status,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/conversations/{conversation_id}/takeover")
def takeover_conversation(
    conversation_id: int,
    payload: TakeoverSchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    owned_conversation_or_404(db, conversation_id, current_user)
    try:
        conv = toggle_human_takeover(db=db, conversation_id=conversation_id, takeover=payload.takeover)
        return {
            "status": "success",
            "conversation_id": conv.id,
            "human_takeover": conv.human_takeover,
            "auto_ai_enabled": conv.auto_ai_enabled,
            "conversation_status": conv.conversation_status,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── 5. AI Suggested Replies ─────────────────────────────────────────────────
@router.get("/conversations/{conversation_id}/suggested-replies")
def get_ai_suggested_replies(conversation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    conv = owned_conversation_or_404(db, conversation_id, current_user)

    last_cust_msg = (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.conversation_id == conv.id, WhatsAppMessage.direction == WhatsAppDirection.INBOUND)
        .order_by(WhatsAppMessage.created_at.desc())
        .first()
    )

    text_context = last_cust_msg.message_body if last_cust_msg else "How can you help my shop?"
    suggestions = generate_suggested_replies(db=db, conversation=conv, last_customer_message=text_context)
    return {"suggestions": suggestions}


# ─── 6. Schedule Follow Up ───────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/follow-up")
def add_follow_up(
    conversation_id: int,
    payload: FollowUpCreateSchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    owned_conversation_or_404(db, conversation_id, current_user)
    try:
        dt = datetime.fromisoformat(payload.scheduled_for.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        dt = datetime.utcnow()

    follow_up = schedule_follow_up(
        db=db,
        conversation_id=conversation_id,
        scheduled_for=dt,
        note=payload.note
    )
    return {
        "status": "success",
        "follow_up_id": follow_up.id,
        "scheduled_for": follow_up.scheduled_for.isoformat(),
        "note": follow_up.note
    }


# ─── 7. Mark As Read ─────────────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/read")
def mark_read(conversation_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    owned_conversation_or_404(db, conversation_id, current_user)
    conv = mark_conversation_as_read(db=db, conversation_id=conversation_id)
    return {"status": "success", "unread_count": conv.unread_count}


# ─── 8. Real Database Analytics Endpoint ─────────────────────────────────────
@router.get("/analytics")
def get_analytics(
    period: str = Query("today", description="today, yesterday, 7days, 30days, custom"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = get_comprehensive_whatsapp_analytics(
        db=db,
        period=period,
        start_date=start_date,
        end_date=end_date,
        owner_id=current_user.id,
    )
    return data


# ─── 9. AI Knowledge Base Management ─────────────────────────────────────────
@router.get("/knowledge-base")
def get_knowledge_base(db: Session = Depends(get_db)):
    kb = get_default_knowledge_base(db)
    return {
        "id": kb.id,
        "company_name": kb.company_name,
        "company_description": kb.company_description,
        "website_services": kb.website_services or [],
        "website_packages": kb.website_packages or [],
        "portfolio_links": kb.portfolio_links or [],
        "faqs": kb.faqs or [],
        "contact_phone": kb.contact_phone,
        "contact_email": kb.contact_email,
        "business_hours": kb.business_hours,
        "terms_and_notes": kb.terms_and_notes,
        "updated_at": kb.updated_at.isoformat(),
    }


@router.put("/knowledge-base", dependencies=[Depends(require_admin)])
def update_knowledge_base(payload: KnowledgeBaseUpdateSchema, db: Session = Depends(get_db)):
    kb = get_default_knowledge_base(db)
    
    if payload.company_name is not None:
        kb.company_name = payload.company_name
    if payload.company_description is not None:
        kb.company_description = payload.company_description
    if payload.website_services is not None:
        kb.website_services = payload.website_services
    if payload.website_packages is not None:
        kb.website_packages = payload.website_packages
    if payload.portfolio_links is not None:
        kb.portfolio_links = payload.portfolio_links
    if payload.faqs is not None:
        kb.faqs = payload.faqs
    if payload.contact_phone is not None:
        kb.contact_phone = payload.contact_phone
    if payload.contact_email is not None:
        kb.contact_email = payload.contact_email
    if payload.business_hours is not None:
        kb.business_hours = payload.business_hours
    if payload.terms_and_notes is not None:
        kb.terms_and_notes = payload.terms_and_notes

    db.commit()
    db.refresh(kb)
    return {"status": "success", "message": "AI Knowledge Base updated successfully"}


# ─── 10. AI Settings Management ──────────────────────────────────────────────
@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    ai_cfg = get_ai_settings(db)
    return {
        "id": ai_cfg.id,
        "ai_enabled": ai_cfg.ai_enabled,
        "ai_auto_reply_enabled": ai_cfg.ai_auto_reply_enabled,
        "confidence_threshold": ai_cfg.confidence_threshold,
        "max_ai_messages_per_conv": ai_cfg.max_ai_messages_per_conv,
        "human_handoff_enabled": ai_cfg.human_handoff_enabled,
        "auto_lead_classification": ai_cfg.auto_lead_classification,
        "auto_intent_detection": ai_cfg.auto_intent_detection,
        "auto_follow_up_enabled": ai_cfg.auto_follow_up_enabled,
        "ai_tone": ai_cfg.ai_tone,
        "ai_language": ai_cfg.ai_language,
        "working_hours_start": ai_cfg.working_hours_start,
        "working_hours_end": ai_cfg.working_hours_end,
        "updated_at": ai_cfg.updated_at.isoformat(),
    }


@router.put("/settings", dependencies=[Depends(require_admin)])
def update_settings(payload: AISettingsUpdateSchema, db: Session = Depends(get_db)):
    ai_cfg = get_ai_settings(db)

    for field, val in payload.dict(exclude_unset=True).items():
        setattr(ai_cfg, field, val)

    db.commit()
    db.refresh(ai_cfg)
    return {"status": "success", "message": "AI Settings updated successfully"}


# ─── 11. Developer / Live Message Simulator ──────────────────────────────────
@router.post("/simulate-incoming")
def simulate_incoming(payload: SimulateMessageSchema, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    inbound, outbound, is_replied = process_incoming_whatsapp_message(
        db=db,
        phone_number=payload.phone_number,
        message_text=payload.message_text,
        shop_name=payload.shop_name or "Local Store",
        business_id=payload.business_id,
        dry_run=True,
        owner_id=current_user.id,
    )

    return {
        "status": "success",
        "inbound_message": {
            "id": inbound.id,
            "text": inbound.message_body,
            "intent": inbound.intent,
            "confidence": inbound.confidence_score,
            "created_at": inbound.created_at.isoformat(),
        },
        "ai_auto_replied": is_replied,
        "outbound_reply": {
            "id": outbound.id,
            "text": outbound.message_body,
            "sender_name": outbound.sender_name,
            "created_at": outbound.created_at.isoformat(),
        } if outbound else None,
    }


# ─── 12a. Diagnostic: Test Flyer Send ────────────────────────────────────────
@router.get("/test-flyer-send", dependencies=[Depends(require_admin)])
def test_flyer_send(to_phone: str = Query(..., description="Phone number to test send")):
    """
    Diagnostic endpoint: tests finding the flyer image and sending it via Mr LAD API.
    Returns detailed status about the image resolution and API response.
    """
    from app.services.mr_lad_client import MrLadWhatsAppClient
    import os

    flyers = MrLadWhatsAppClient._resolve_flyer_paths()
    img_path = flyers.get("easybillbro") or flyers.get("lexonit")

    result = {
        "flyer_paths_found": flyers,
        "selected_image": img_path,
        "image_exists_on_disk": os.path.exists(img_path) if img_path else False,
        "cwd": os.getcwd(),
        "to_phone": to_phone,
    }

    if not img_path:
        result["status"] = "error"
        result["error"] = "No flyer image found on disk"
        return result

    # Try to find a conversation for this phone
    token, auth_err = MrLadWhatsAppClient.get_token()
    if not token:
        result["status"] = "error"
        result["error"] = f"Auth failed: {auth_err}"
        return result

    clean = MrLadWhatsAppClient._clean_phone(to_phone)
    conv_id = MrLadWhatsAppClient._find_conversation_id(clean, token)
    result["conversation_id"] = conv_id

    if not conv_id:
        result["status"] = "error"
        result["error"] = f"No conversation found for {clean}"
        return result

    # Attempt to send the flyer with a test caption
    test_caption = "🧪 TEST: This is a flyer image + caption combined in ONE message from Lexon IT."
    ok, msg_id, raw = MrLadWhatsAppClient.send_image_message(
        conv_id=conv_id,
        img_path=img_path,
        caption=test_caption
    )
    result["send_success"] = ok
    result["message_id"] = msg_id
    result["api_response"] = raw
    result["status"] = "success" if ok else "failed"
    return result


def _public_picture_url(request, name: str, square: bool = False) -> str:
    """Public link to a picture (the built-in flyer is called 'flyer'). square=True is the whole picture on a square canvas."""
    import os
    base = (settings.PUBLIC_BASE_URL or os.environ.get("RENDER_EXTERNAL_URL") or (str(request.base_url) if request is not None else "")).rstrip("/")
    return f"{base}/api/public/pictures/{name}{'/square' if square else ''}" if base else ""


@router.get("/send-mode")
def send_mode(
    phone: str = Query(..., description="The shop's phone number"),
    template_key: Optional[str] = Query(None),
    picture: bool = Query(False, description="True when a picture is attached to the message"),
    current_user=Depends(get_current_user),
):
    """
    How a message to this number will really be sent. WhatsApp allows free text and pictures only to someone who
    wrote in the last 24 hours; everyone else can only be sent an approved template.
    """
    from app.services.mr_lad_client import MrLadWhatsAppClient as Lad

    if settings.WHATSAPP_IS_TEST_MODE or not (settings.LAD_API_TOKEN or settings.LAD_AUTH_PASSWORD):
        return {"mode": "free", "template": None, "template_ready": True, "note": "test mode"}
    with_picture = bool(picture)
    template, ready = Lad.pick_template(template_key, with_picture=with_picture)
    try:
        token, _ = Lad.get_token()
        conv_id = Lad._find_conversation_id(Lad._clean_phone(phone), token) if token else None
        open_window = bool(conv_id and token and Lad.window_open(conv_id, token))
    except Exception:
        open_window = False
    return {
        "mode": "free" if open_window else "template",
        "template": template,
        "template_ready": bool(template and ready),
        "with_picture": with_picture and bool(template),
    }


# ─── 12. Bulk AI WhatsApp Broadcast to Multiple Shops ────────────────────────
@router.post("/broadcast-all")
def broadcast_all_whatsapp_shops(payload: BulkWhatsAppBroadcastSchema, db: Session = Depends(get_db), current_user=Depends(get_current_user), request: Request = None):
    """
    Sends a personalised website pitch to multiple shops.

    Guard rails (all enforced server-side):
      * caller must be logged in;
      * batch size, daily cap and a repeat-contact cooldown are enforced;
      * numbers must be real mobile numbers - nothing is ever invented;
      * opted-out numbers and live human conversations are skipped;
      * every pitch carries an opt-out line;
      * each message is recorded with its TRUE delivery status.
    """
    if not payload.shops:
        raise HTTPException(status_code=400, detail="No shops provided for broadcast.")
    max_batch = int(settings.WHATSAPP_MAX_BROADCAST_BATCH or 0)
    if max_batch and len(payload.shops) > max_batch:
        raise HTTPException(
            status_code=400,
            detail=f"Too many recipients ({len(payload.shops)}). Maximum per broadcast is {max_batch}.",
        )

    # The picture to attach (the account's own, never anyone else's).
    image_path = None
    image_label = None
    image_url = None
    image_header_url = None
    if payload.image_id:
        from app.models.message_image import MessageImage
        from app.services.message_images import file_for_sending
        chosen = db.query(MessageImage).filter(MessageImage.id == payload.image_id, MessageImage.owner_id == current_user.id).first()
        if not chosen:
            raise HTTPException(status_code=404, detail="Picture not found")
        image_path = file_for_sending(chosen)
        image_label = chosen.label
        image_url = _public_picture_url(request, chosen.uid)
        image_header_url = _public_picture_url(request, chosen.uid, square=True)

    default_template = (
        "Hello {shop_name},\n\n"
        "This is Lexon IT. We help businesses grow online by building professional websites, web applications, and mobile apps tailored to their needs.\n\n"
        "We noticed that {shop_name} doesn’t currently have a website. Today, customers often search online before choosing a business or service. A professional online presence can help you showcase your products or services, share important information, build trust, and make it easier for customers to contact you — 24/7.\n\n"
        "Whether you need a simple website, an online booking or ordering system, a custom web application, or a mobile app, our team can build it for you at an affordable price.\n\nhttps://easybillbro.com/"
    )

    template = payload.custom_message.strip() if payload.custom_message and payload.custom_message.strip() else default_template

    results = []
    sent_count = 0
    skipped_count = 0
    seen_phones: set = set()
    attempted_send = False

    for shop in payload.shops:
        s_name = str(shop.get("name") or shop.get("shop_name") or "Local Shop").strip()
        raw_phone = str(shop.get("phone") or shop.get("phone_number") or "").strip()
        b_id = shop.get("business_id") or shop.get("id")
        if isinstance(b_id, str) and not b_id.isdigit():
            b_id = None
        elif b_id is not None:
            try:
                b_id = int(b_id)
            except Exception:
                b_id = None

        s_category = str(shop.get("category") or "Shop").strip()
        norm_phone = normalize_whatsapp_phone(raw_phone) if raw_phone else ""

        def _skip(reason: str):
            nonlocal skipped_count
            skipped_count += 1
            results.append({
                "shop_name": s_name,
                "phone_number": norm_phone or None,
                "status": "skipped",
                "error": reason,
            })

        # Never invent a number: no phone / junk phone means no message.
        if not is_valid_phone(norm_phone):
            _skip("no_valid_phone")
            continue
        if norm_phone in seen_phones:
            _skip("duplicate_in_batch")
            continue
        seen_phones.add(norm_phone)

        allowed, reason = can_message(db, norm_phone, owner_id=current_user.id, check_cooldown=True)
        if not allowed:
            _skip(reason or "blocked")
            continue

        personalized_msg = (
            template
            .replace("{shop_name}", s_name)
            .replace("[Business Name]", s_name)
            .replace("{Business Name}", s_name)
            .replace("{category}", s_category)
            .replace("{ShopName}", s_name)
        )

        try:
            conv = get_or_create_whatsapp_conversation(
                db=db,
                phone_number=norm_phone,
                shop_name=s_name,
                business_id=b_id,
                owner_id=current_user.id,
            )

            # A person is already handling this lead: don't let a cold pitch cut across them.
            if conv.human_takeover or conv.conversation_status == "HUMAN_HANDOFF":
                _skip("active_human_conversation")
                continue

            conv.auto_ai_enabled = bool(payload.auto_ai_enabled)
            if conv.lead_status in (None, "", "NEW", "CONTACTED"):
                conv.lead_status = LeadStatus.CONTACTED.value
            conv.conversation_status = "AI_ACTIVE"
            conv.last_message_at = datetime.utcnow()

            if attempted_send:
                time.sleep(float(settings.WHATSAPP_BROADCAST_DELAY_SECONDS or 0))
            attempted_send = True

            should_send_flyer = bool(getattr(payload, "include_flyer", True)) and not image_path
            whatsapp_sent, w_res, w_raw = False, None, None
            try:
                whatsapp_sent, w_res, w_raw = WhatsAppCloudClient.send_text(
                    db=db,
                    to_phone=conv.phone_number,
                    text_body=personalized_msg,
                    preview_url=True,
                    recipient_name=s_name,
                    send_flyer=should_send_flyer,
                    image_path=image_path,
                    image_url=image_url or (_public_picture_url(request, "flyer") if should_send_flyer else None),
                    template_key=payload.template_key,
                    image_header_url=image_header_url or (_public_picture_url(request, "flyer", square=True) if should_send_flyer else None),
                )
            except Exception as w_err:
                whatsapp_sent, w_res = False, str(w_err)

            status = delivery_status(whatsapp_sent, w_raw)

            if image_path:
                msg_body_record = f"[Attached picture #{payload.image_id}: {image_label}]\n\n{personalized_msg}"
            elif should_send_flyer:
                msg_body_record = f"[Attached: EasyBillBro Restaurant Billing & POS Flyer]\n\n{personalized_msg}"
            else:
                msg_body_record = personalized_msg
            sent_as = w_raw.get("template") if isinstance(w_raw, dict) and w_raw.get("mode") == "template" else None
            if sent_as:  # the shop had not written in the last 24 hours: only an approved template could be sent
                picture_marker = ""
                if image_path:
                    picture_marker = f"[Attached picture #{payload.image_id}: {image_label}]\n\n"
                elif should_send_flyer:
                    picture_marker = "[Attached: EasyBillBro Restaurant Billing & POS Flyer]\n\n"
                msg_body_record = f"{picture_marker}[Sent as the approved WhatsApp template: {sent_as}]\n\n{personalized_msg}"
            outbound_msg = WhatsAppMessage(
                conversation_id=conv.id,
                direction=WhatsAppDirection.OUTBOUND,
                sender_type=WhatsAppSenderType.AI_BOT if payload.auto_ai_enabled else WhatsAppSenderType.MANUAL_OPERATOR,
                sender_name=payload.operator_name or "Lexon IT AI Assistant",
                message_body=msg_body_record,
                ai_generated=bool(payload.auto_ai_enabled),
                status=status,
                is_read=True,
                created_at=datetime.utcnow(),
            )
            db.add(outbound_msg)

            if payload.auto_ai_enabled:
                db.add(AIMessageLog(
                    conversation_id=conv.id,
                    incoming_text="Bulk AI Outreach Broadcast (No-Website Shops)",
                    ai_response_text=personalized_msg,
                    model_used="template",
                    intent="OUTREACH_WEBSITE_PITCH",
                    confidence=0.98,
                    sentiment="POSITIVE",
                    tokens_used=len(personalized_msg.split()),
                    latency_ms=0,
                    was_sent=(status == "sent"),
                ))

            db.commit()
            if status == "sent":
                sent_count += 1

            results.append({
                "conversation_id": conv.id,
                "shop_name": s_name,
                "phone_number": norm_phone,
                "status": status if status != "failed" else "error",
                "error": None if status != "failed" else str(w_res or "Failed to deliver WhatsApp message"),
                "message_id": outbound_msg.id,
                "auto_ai_enabled": conv.auto_ai_enabled,
                "sent_as_template": sent_as,
            })
        except Exception as err:
            db.rollback()
            results.append({
                "shop_name": s_name,
                "phone_number": norm_phone,
                "status": "error",
                "error": str(err),
            })

    return {
        "status": "success",
        "total_targeted": len(payload.shops),
        "total_sent": sent_count,
        "total_skipped": skipped_count,
        "results": results,
    }
