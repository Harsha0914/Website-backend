import enum
from datetime import datetime
# pyrefly: ignore [missing-import]
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text,
    Boolean, Enum as SAEnum, Float, JSON, UniqueConstraint
)
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
from app.database import Base


class WhatsAppDirection(str, enum.Enum):
    INBOUND = "INBOUND"    # From Shop Owner to Lexon IT
    OUTBOUND = "OUTBOUND"  # From Lexon IT (AI or Manual) to Shop Owner


class WhatsAppSenderType(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    SHOP_OWNER = "SHOP_OWNER"
    AI_BOT = "AI_BOT"
    AI = "AI"
    MANUAL_OPERATOR = "MANUAL_OPERATOR"
    HUMAN = "HUMAN"
    LEXON_IT_TEAM = "LEXON_IT_TEAM"
    LEXONITY_TEAM = "LEXONITY_TEAM"


class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    RESPONDED = "RESPONDED"
    REPLIED = "REPLIED"
    INTERESTED = "INTERESTED"
    QUALIFIED = "QUALIFIED"
    CALL_REQUESTED = "CALL_REQUESTED"
    DEMO_REQUESTED = "DEMO_REQUESTED"
    QUOTATION_REQUESTED = "QUOTATION_REQUESTED"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    CUSTOMER = "CUSTOMER"
    NOT_INTERESTED = "NOT_INTERESTED"
    DO_NOT_CONTACT = "DO_NOT_CONTACT"
    HUMAN_HANDOFF = "HUMAN_HANDOFF"
    FOLLOW_UP_REQUIRED = "FOLLOW_UP_REQUIRED"
    CLOSED = "CLOSED"


class WhatsAppConversation(Base):
    __tablename__ = "whatsapp_conversations"
    # One chat per (account, shop number): two accounts can each message the same shop without ever
    # seeing each other's conversation.
    __table_args__ = (UniqueConstraint("owner_id", "phone_number", name="uq_whatsapp_owner_phone"),)

    id = Column(Integer, primary_key=True, index=True)
    # The account that owns this chat. Every read and write is filtered by it. NULL = nobody's
    # (e.g. an unsolicited message from a number no account ever contacted); such chats are never shown.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True, index=True)
    phone_number = Column(String(50), nullable=False, index=True)
    shop_name = Column(String(255), nullable=False)
    owner_name = Column(String(255), nullable=True)
    
    # Auto AI Bot toggle state: True = AI automatically replies, False = Manual operator mode
    auto_ai_enabled = Column(Boolean, default=True, nullable=False)
    
    # Lead & CRM status
    lead_status = Column(String(50), default="CONTACTED", nullable=False, index=True)
    lead_score = Column(Integer, default=20, nullable=False, index=True)
    detected_intent = Column(String(50), default="UNKNOWN", nullable=False, index=True)
    sentiment = Column(String(20), default="NEUTRAL", nullable=False)
    priority = Column(String(20), default="MEDIUM", nullable=False)
    conversation_status = Column(String(50), default="AI_ACTIVE", nullable=False, index=True)  # OPEN, AI_ACTIVE, HUMAN_HANDOFF, RESOLVED, CLOSED
    
    unread_count = Column(Integer, default=0, nullable=False)
    human_takeover = Column(Boolean, default=False, nullable=False)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Follow-up
    follow_up_date = Column(DateTime, nullable=True, index=True)
    follow_up_note = Column(Text, nullable=True)
    opt_out = Column(Boolean, default=False, nullable=False)  # True = DO_NOT_CONTACT
    
    # Extracted requirements in JSON string (Business type, location, branches, packages, etc.)
    business_details_extracted = Column(Text, default="{}", nullable=False)

    last_message_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business = relationship("Business", backref="whatsapp_conversations")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    messages = relationship(
        "WhatsAppMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="WhatsAppMessage.created_at"
    )

    def __repr__(self):
        return f"<WhatsAppConversation id={self.id} phone={self.phone_number} status={self.lead_status}>"


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("whatsapp_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    direction = Column(SAEnum(WhatsAppDirection), nullable=False, index=True)
    sender_type = Column(SAEnum(WhatsAppSenderType), nullable=False)
    sender_name = Column(String(100), nullable=False)
    message_body = Column(Text, nullable=False)
    
    intent = Column(String(50), default="UNKNOWN", nullable=True)
    confidence_score = Column(Float, default=0.85, nullable=True)
    ai_generated = Column(Boolean, default=False, nullable=False)
    tokens_used = Column(Integer, default=0, nullable=False)
    
    status = Column(String(50), default="sent", nullable=False, index=True)  # queued, sent, delivered, read, received, failed
    is_read = Column(Boolean, default=True, nullable=False)
    external_message_id = Column(String(100), nullable=True, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    conversation = relationship("WhatsAppConversation", back_populates="messages")

    def __repr__(self):
        return f"<WhatsAppMessage id={self.id} sender={self.sender_type} direction={self.direction}>"
