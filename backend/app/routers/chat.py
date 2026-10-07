from datetime import datetime
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Request, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.conversation import Conversation, Message, ConversationType, SenderType
from app.models.business import Business
from app.models.user import User
from app.schemas.chat import (
    ConversationCreate,
    ConversationOut,
    MessageOut,
    SendMessageRequest
)
from app.services.chat_service import generate_ai_response
from app.auth.dependencies import get_current_user
from app.rate_limit import limiter

router = APIRouter(prefix="/api/chat", tags=["Chat"])

@router.post("/conversations", response_model=ConversationOut)
def create_or_get_conversation(
    req: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    biz = db.query(Business).filter(Business.id == req.business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    # Look for existing active conversation for this user, business, and type
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.business_id == req.business_id,
            Conversation.conversation_type == req.conversation_type
        )
        .first()
    )

    if not conv:
        conv = Conversation(
            user_id=current_user.id,
            business_id=req.business_id,
            conversation_type=req.conversation_type
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Add an initial welcome message from the assistant
        if req.conversation_type == ConversationType.WEBSITE_IMPROVEMENT:
            initial_text = (
                f"Hello! I am your Website Improvement Assistant for **{biz.name}**.\n\n"
                f"I can analyze your online presence, suggest mobile & SEO enhancements, "
                f"or recommend ways to boost local customer conversions. What would you like to improve?"
            )
        elif req.conversation_type == ConversationType.WEBSITE_CREATION:
            initial_text = (
                f"Welcome! I am your Website Creation Assistant for **{biz.name}**.\n\n"
                f"Having an official website helps local customers find your store, see opening hours, "
                f"browse products, and place orders directly. Would you like ideas for a custom website?"
            )
        else:
            initial_text = f"Hello! How can I assist you regarding **{biz.name}** today?"

        welcome_msg = Message(
            conversation_id=conv.id,
            sender_type=SenderType.ASSISTANT,
            message=initial_text
        )
        db.add(welcome_msg)
        db.commit()
        db.refresh(conv)

    return conv

@router.get("/conversations", response_model=list[ConversationOut])
def get_user_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )

@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.user_id != current_user.id and current_user.role.value != "ADMIN":
        raise HTTPException(status_code=403, detail="Unauthorized")
    return conv

@router.post("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def send_message(
    conversation_id: int,
    req: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.user_id != current_user.id and current_user.role.value != "ADMIN":
        raise HTTPException(status_code=403, detail="Unauthorized")

    # 1. Save user message
    user_msg = Message(
        conversation_id=conv.id,
        sender_type=SenderType.USER,
        message=req.message
    )
    db.add(user_msg)
    db.commit()

    # 2. Build history for AI context
    history_records = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history = [{"sender": m.sender_type.value, "text": m.message} for m in history_records]

    # 3. Generate assistant reply
    biz = db.query(Business).filter(Business.id == conv.business_id).first()
    biz_name = biz.name if biz else "Local Business"
    biz_cat = biz.category if biz else "Shop"

    assistant_reply_text = generate_ai_response(
        conversation_type=conv.conversation_type,
        business_name=biz_name,
        business_category=biz_cat,
        history=history,
        user_message=req.message
    )

    # 4. Save assistant reply
    assistant_msg = Message(
        conversation_id=conv.id,
        sender_type=SenderType.ASSISTANT,
        message=assistant_reply_text
    )
    db.add(assistant_msg)
    conv.updated_at = datetime.utcnow()
    db.commit()

    return [user_msg, assistant_msg]


# ─── Public Website AI Consultant Chat Assistant ─────────────────────────────
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class WebAssistantRequest(BaseModel):
    message: str = Field(max_length=2000)
    shop_type: Optional[str] = Field(default=None, max_length=100)
    conversation_history: Optional[List[Dict[str, str]]] = Field(default=None, max_length=20)

@router.post("/assistant")
@limiter.limit("30/minute")
def chat_with_web_assistant(
    request: Request,
    req: WebAssistantRequest,
    db: Session = Depends(get_db)
):
    """
    Public instant AI Website Consultant.
    When a visitor asks e.g. 'I need a cafe type website',
    returns custom tailored features, pricing, demo preview, and quick actions.
    """
    text = (req.message or "").strip()
    text_lower = text.lower()
    
    # Identify category
    category = "General Business"
    demo_url = "https://demo.lexonit.com"
    demo_title = "Modern Business Website Demo"
    
    if any(w in text_lower for w in ["cafe", "coffee", "restaurant", "food", "biryani", "bakery", "hotel", "pizza", "burger", "tea"]):
        category = "Cafe & Restaurant"
        demo_url = "https://demo.lexonit.com/restaurant"
        demo_title = "Live Cafe & Restaurant Menu Demo"
        packages = [
            {"name": "Starter Cafe Website", "price": "₹2,999", "delivery": "3 Days", "features": ["Digital Food & Drink Menu", "Mobile Responsive", "Google Maps Location", "WhatsApp Ordering"]},
            {"name": "Growth Restaurant Suite", "price": "₹5,999", "delivery": "5 Days", "features": ["Menu with Dish Photos", "Online Table Booking", "WhatsApp & UPI Ordering", "SEO Ranking"]}
        ]
        reply = (
            f"☕ **Great choice! For Cafes & Restaurants, here is what we build:**\n\n"
            f"1. **Interactive Digital Menu** – Display drinks, bakery snacks & food items with high-res photos and prices.\n"
            f"2. **Direct WhatsApp Ordering & Table Booking** – Customers tap one button to order or reserve a table directly on your WhatsApp.\n"
            f"3. **Google Maps Direction Pin** – Help nearby customers get turn-by-turn directions to your cafe.\n"
            f"4. **Mobile-First Ultra Fast Loading** – Opens in under 1 second on Android & iPhones.\n\n"
            f"💰 **Pricing**: Starts at just **₹2,999** (delivered in 3 days) with 100% satisfaction guarantee!\n\n"
            f"Would you like to see our live cafe demo or start with a custom design for your brand?"
        )
    elif any(w in text_lower for w in ["gym", "fitness", "yoga", "crossfit", "workout", "trainer"]):
        category = "Gym & Fitness"
        demo_url = "https://demo.lexonit.com/fitness"
        demo_title = "Gym & Fitness Center Demo"
        packages = [
            {"name": "Gym Essential Pack", "price": "₹2,999", "delivery": "3 Days", "features": ["Membership Plans Showcase", "Trainer Profiles", "WhatsApp Join Button", "Location Map"]},
            {"name": "Pro Fitness Club", "price": "₹5,999", "delivery": "5 Days", "features": ["Workout Timetable", "Online Admission Form", "Photo Gallery", "Google SEO"]}
        ]
        reply = (
            f"🏋️ **Awesome! For Gyms & Fitness Centers, we include:**\n\n"
            f"1. **Membership Plan Showcase** – Display Monthly, Quarterly & Annual subscription plans with transparent pricing.\n"
            f"2. **Trainer Profiles & Equipment Gallery** – High quality photos of your gym floor and certified trainers.\n"
            f"3. **WhatsApp Membership Inquiries** – Instant join button for prospective members.\n"
            f"4. **Location & Timings** – Morning/Evening session hours with Google Maps directions.\n\n"
            f"💰 **Pricing**: Starts at **₹2,999** in 3 days."
        )
    elif any(w in text_lower for w in ["supermarket", "grocery", "mart", "store", "shop", "clothes", "fashion", "boutique", "retail"]):
        category = "Supermarket & Retail"
        demo_url = "https://demo.lexonit.com/supermarket"
        demo_title = "Supermarket & Grocery Catalog Demo"
        packages = [
            {"name": "Shop Catalog Pack", "price": "₹2,999", "delivery": "3 Days", "features": ["Digital Product Catalog", "Price List", "WhatsApp Order Cart", "Google Map Pin"]},
            {"name": "Supermarket E-Store", "price": "₹5,999", "delivery": "5 Days", "features": ["Multi-Category Catalog", "Special Offers Banner", "Direct Home Delivery Form", "SEO"]}
        ]
        reply = (
            f"🛒 **Excellent! For Supermarkets & Retail Shops, we provide:**\n\n"
            f"1. **Digital Product Catalog & Price List** – Showcase groceries, daily essentials, or retail items categorized neatly.\n"
            f"2. **WhatsApp Order Cart** – Customers browse products, add to cart, and send their shopping list directly to your WhatsApp for home delivery!\n"
            f"3. **Weekly Offers & Deals Banner** – Promote discounts and festive offers.\n"
            f"4. **Google Maps Store Locator** – Increase local walk-in customers.\n\n"
            f"💰 **Pricing**: Starts at **₹2,999**."
        )
    elif any(w in text_lower for w in ["salon", "spa", "beauty", "hair", "parlour"]):
        category = "Salon & Spa"
        demo_url = "https://demo.lexonit.com/salon"
        demo_title = "Beauty Salon & Spa Demo"
        packages = [
            {"name": "Salon Starter", "price": "₹2,999", "delivery": "3 Days", "features": ["Service Rate Card", "Hair & Beauty Portfolio", "WhatsApp Booking", "Map Location"]}
        ]
        reply = (
            f"💇 **Wonderful! For Beauty Salons & Spas, we build:**\n\n"
            f"1. **Service Rate Card & Packages** – Neatly organized services (Hair, Skin, Spa, Bridal) with clear prices.\n"
            f"2. **Styling Portfolio** – Photo gallery of client transformations.\n"
            f"3. **WhatsApp Appointment Booking** – Customers book time slots with one tap.\n\n"
            f"💰 **Pricing**: Starts at **₹2,999** in 3 days."
        )
    elif any(w in text_lower for w in ["cost", "price", "pricing", "package", "how much", "charges", "rate"]):
        category = "Website Packages"
        packages = [
            {"name": "Starter Essential", "price": "₹2,999", "delivery": "3 Days", "features": ["Single Page Responsive Website", "Product/Service Menu", "WhatsApp Ordering", "Google Maps"]},
            {"name": "Growth Business", "price": "₹5,999", "delivery": "5 Days", "features": ["5-Page Custom Website", "Full Catalog/Menu", "SEO Ranking", "Fast Cloud Hosting"]},
            {"name": "Premium E-Commerce", "price": "₹9,999", "delivery": "7 Days", "features": ["Full E-Commerce Store", "Online Payment Gateway", "Inventory & Order Management"]}
        ]
        reply = (
            f"💼 **Here are our transparent website packages:**\n\n"
            f"• **Starter Essential (₹2,999)** – Perfect for small cafes, local shops & clinics. Includes mobile layout, WhatsApp ordering, Google Maps, and fast cloud hosting.\n"
            f"• **Growth Business (₹5,999)** – Multi-page website with dynamic menus/catalogs, SEO ranking, and custom domain.\n"
            f"• **Premium E-Commerce (₹9,999)** – Full online store with payment gateway and product inventory.\n\n"
            f"All packages include free maintenance support and 100% satisfaction guarantee. What type of website would you like to build?"
        )
    else:
        packages = [
            {"name": "Starter Website", "price": "₹2,999", "delivery": "3 Days", "features": ["Mobile-First Design", "WhatsApp Direct Chat", "Google Maps Location", "Cloud Hosting"]}
        ]
        reply = (
            f"Hello! 👋 I am your **Lexon IT AI Website Consultant**.\n\n"
            f"We build modern, high-speed websites for local businesses (Cafes, Restaurants, Supermarkets, Gyms, Salons, Clinics, and Retail Shops) starting from **₹2,999** with delivery in **3 days**.\n\n"
            f"Tell me about your business (e.g. *'I have a cafe'*, *'I have a grocery store'*), and I will share the perfect features and demo for you!"
        )

    return {
        "status": "success",
        "category": category,
        "reply": reply,
        "demo_url": demo_url,
        "demo_title": demo_title,
        "packages": packages,
        "suggested_questions": [
            "What features are included in the ₹2,999 package?",
            "Can customers place food orders on WhatsApp?",
            "How many days does it take to launch?",
            "Can you show me a demo website?"
        ]
    }

