import enum
from datetime import datetime
# pyrefly: ignore [missing-import]
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text,
    Boolean, Enum as SAEnum, Float, JSON, Index
)
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
from app.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    MESSAGE_SENT = "MESSAGE_SENT"
    REPLIED = "REPLIED"
    INTERESTED = "INTERESTED"
    NOT_INTERESTED = "NOT_INTERESTED"
    FOLLOW_UP = "FOLLOW_UP"
    WEBSITE_PROPOSAL_SENT = "WEBSITE_PROPOSAL_SENT"
    CONVERTED = "CONVERTED"
    CLOSED = "CLOSED"
    NO_RESPONSE = "NO_RESPONSE"


class MessageDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"
    RECEIVED = "received"


class ConversationState(str, enum.Enum):
    OPEN = "Open"
    WAITING_FOR_REPLY = "Waiting for Reply"
    FOLLOW_UP = "Follow Up"
    CLOSED = "Closed"


class CampaignStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    PAUSED = "PAUSED"


class FollowUpStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class CrmUserRole(str, enum.Enum):
    ADMIN = "Admin"
    MANAGER = "Manager"
    SALESPERSON = "Salesperson"


# ─── 1. Store / Business Entity ───────────────────────────────────────────────
class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    external_place_id = Column(String(255), unique=True, index=True, nullable=True)
    name = Column(String(255), nullable=False, index=True)
    owner_name = Column(String(255), nullable=True)
    whatsapp_number = Column(String(50), nullable=False, index=True, unique=True)
    location = Column(Text, nullable=True)
    category = Column(String(100), nullable=True, index=True)
    website_url = Column(String(500), nullable=True)
    website_status = Column(String(50), default="NO_WEBSITE", nullable=False)
    website_score = Column(Integer, nullable=True)
    
    lead_status = Column(
        SAEnum(LeadStatus),
        default=LeadStatus.NEW,
        nullable=False,
        index=True
    )
    notes = Column(Text, nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    opt_in_status = Column(Boolean, default=True, nullable=False)
    
    first_contacted_date = Column(DateTime, nullable=True)
    last_contacted_date = Column(DateTime, nullable=True, index=True)
    last_reply_date = Column(DateTime, nullable=True, index=True)
    follow_up_date = Column(DateTime, nullable=True, index=True)
    follow_up_note = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    conversation = relationship("WhatsAppCrmConversation", back_populates="store", uselist=False, cascade="all, delete-orphan")
    messages = relationship("WhatsAppCrmMessage", back_populates="store", cascade="all, delete-orphan")
    status_history = relationship("LeadStatusHistory", back_populates="store", cascade="all, delete-orphan", order_by="LeadStatusHistory.created_at.desc()")
    follow_ups = relationship("FollowUp", back_populates="store", cascade="all, delete-orphan", order_by="FollowUp.follow_up_date")

    def __repr__(self):
        return f"<Store id={self.id} name={self.name} phone={self.whatsapp_number} status={self.lead_status}>"


# ─── 2. Lead Status History ──────────────────────────────────────────────────
class LeadStatusHistory(Base):
    __tablename__ = "lead_status_history"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    old_status = Column(SAEnum(LeadStatus), nullable=True)
    new_status = Column(SAEnum(LeadStatus), nullable=False)
    changed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    store = relationship("Store", back_populates="status_history")
    changed_by = relationship("User")


# ─── 3. WhatsApp Conversation ─────────────────────────────────────────────────
class WhatsAppCrmConversation(Base):
    __tablename__ = "whatsapp_crm_conversations"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    whatsapp_number = Column(String(50), nullable=False, index=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    first_message_at = Column(DateTime, nullable=True)
    last_message_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_inbound_message_at = Column(DateTime, nullable=True, index=True)
    last_outbound_message_at = Column(DateTime, nullable=True, index=True)
    
    total_messages = Column(Integer, default=0, nullable=False)
    inbound_messages = Column(Integer, default=0, nullable=False)
    outbound_messages = Column(Integer, default=0, nullable=False)
    unread_messages = Column(Integer, default=0, nullable=False)
    
    status = Column(SAEnum(ConversationState), default=ConversationState.OPEN, nullable=False)
    lead_status = Column(SAEnum(LeadStatus), default=LeadStatus.NEW, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    store = relationship("Store", back_populates="conversation")
    assigned_user = relationship("User")
    messages = relationship("WhatsAppCrmMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="WhatsAppCrmMessage.created_at")

    def __repr__(self):
        return f"<WhatsAppCrmConversation id={self.id} store={self.store_id} state={self.status}>"


# ─── 4. WhatsApp Message ──────────────────────────────────────────────────────
class WhatsAppCrmMessage(Base):
    __tablename__ = "whatsapp_crm_messages"

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_message_id = Column(String(128), unique=True, index=True, nullable=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("whatsapp_crm_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    
    direction = Column(SAEnum(MessageDirection), nullable=False, index=True)
    message_type = Column(String(50), default="text", nullable=False)  # text, template, image, document
    message_content = Column(Text, nullable=False)
    template_name = Column(String(100), nullable=True)
    
    status = Column(SAEnum(MessageStatus), default=MessageStatus.QUEUED, nullable=False, index=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    
    sent_at = Column(DateTime, nullable=True, index=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True, index=True)
    
    campaign_id = Column(Integer, ForeignKey("whatsapp_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    sender_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    store = relationship("Store", back_populates="messages")
    conversation = relationship("WhatsAppCrmConversation", back_populates="messages")
    sender_user = relationship("User")
    campaign = relationship("WhatsAppCampaign", back_populates="messages")

    def __repr__(self):
        return f"<WhatsAppCrmMessage id={self.id} direction={self.direction} status={self.status}>"


# ─── 5. WhatsApp Campaign ─────────────────────────────────────────────────────
class WhatsAppCampaign(Base):
    __tablename__ = "whatsapp_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    template_name = Column(String(100), nullable=False)
    language_code = Column(String(10), default="en", nullable=False)
    message_variables = Column(JSON, default={}, nullable=False)
    
    target_category = Column(String(100), nullable=True)
    target_lead_status = Column(String(100), nullable=True)
    target_location = Column(String(100), nullable=True)
    
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(SAEnum(CampaignStatus), default=CampaignStatus.DRAFT, nullable=False, index=True)
    
    scheduled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Aggregated metrics for fast reporting
    total_recipients = Column(Integer, default=0, nullable=False)
    messages_attempted = Column(Integer, default=0, nullable=False)
    messages_sent = Column(Integer, default=0, nullable=False)
    messages_delivered = Column(Integer, default=0, nullable=False)
    messages_read = Column(Integer, default=0, nullable=False)
    messages_failed = Column(Integer, default=0, nullable=False)
    replies_received = Column(Integer, default=0, nullable=False)
    unique_replied = Column(Integer, default=0, nullable=False)
    interested_leads = Column(Integer, default=0, nullable=False)
    converted_leads = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    created_by = relationship("User")
    recipients = relationship("CampaignRecipient", back_populates="campaign", cascade="all, delete-orphan")
    messages = relationship("WhatsAppCrmMessage", back_populates="campaign")


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("whatsapp_campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    whatsapp_number = Column(String(50), nullable=False)
    
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING, SENT, DELIVERED, READ, FAILED, REPLIED
    whatsapp_message_id = Column(String(128), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    campaign = relationship("WhatsAppCampaign", back_populates="recipients")
    store = relationship("Store")


# ─── 6. Follow-Up Schedule ───────────────────────────────────────────────────
class FollowUp(Base):
    __tablename__ = "follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    follow_up_date = Column(DateTime, nullable=False, index=True)
    follow_up_time = Column(String(20), nullable=True)  # e.g., "11:00 AM"
    note = Column(Text, nullable=False)
    status = Column(SAEnum(FollowUpStatus), default=FollowUpStatus.PENDING, nullable=False, index=True)
    
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    store = relationship("Store", back_populates="follow_ups")
    assigned_user = relationship("User")


# ─── 7. WhatsApp Template Library ─────────────────────────────────────────────
class WhatsAppTemplate(Base):
    __tablename__ = "whatsapp_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    category = Column(String(50), default="MARKETING", nullable=False)  # MARKETING, UTILITY
    language = Column(String(10), default="en", nullable=False)
    header_text = Column(String(255), nullable=True)
    body_text = Column(Text, nullable=False)
    footer_text = Column(String(255), nullable=True)
    variables_json = Column(JSON, default=[], nullable=False)  # e.g., ["store_name", "category", "website_price"]
    buttons_json = Column(JSON, default=[], nullable=False)
    meta_status = Column(String(50), default="APPROVED", nullable=False)  # APPROVED, PENDING, REJECTED
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# ─── 8. Webhook Events (Idempotency & Audit Log) ──────────────────────────────
class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(128), unique=True, index=True, nullable=False)
    event_type = Column(String(100), nullable=False)  # messages, statuses
    payload_json = Column(Text, nullable=False)
    processed = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


# ─── 9. Meta API Config Settings (Persisted in DB with fallback to .env) ──────
class WhatsAppApiSettings(Base):
    __tablename__ = "whatsapp_api_settings"

    id = Column(Integer, primary_key=True, index=True)
    meta_app_id = Column(String(100), nullable=True)
    meta_app_secret = Column(String(100), nullable=True)
    business_account_id = Column(String(100), nullable=True)
    phone_number_id = Column(String(100), nullable=True)
    access_token = Column(Text, nullable=True)
    webhook_verify_token = Column(String(100), default="", nullable=False)
    api_version = Column(String(20), default="v21.0", nullable=False)
    is_test_mode = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
