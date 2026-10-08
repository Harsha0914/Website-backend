"""
Who may see which WhatsApp data.

Every conversation belongs to exactly one account (WhatsAppConversation.owner_id) and every message,
AI log and follow-up hangs off a conversation. An account can only ever read or change its own. This holds
for administrators too: admins manage the system, they do not get to read other accounts' chats.
"""
from typing import List

# pyrefly: ignore [missing-import]
from fastapi import HTTPException, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.models.whatsapp import WhatsAppConversation, WhatsAppMessage


def own_conversations(db: Session, user):
    """A query over ONLY the signed-in user's conversations."""
    return db.query(WhatsAppConversation).filter(WhatsAppConversation.owner_id == user.id)


def owned_conversation_or_404(db: Session, conversation_id: int, user) -> WhatsAppConversation:
    """
    The conversation, only if it belongs to `user`. Someone else's conversation looks exactly like one that
    does not exist (404, not 403), so ids cannot be probed.
    """
    conv = (
        db.query(WhatsAppConversation)
        .filter(WhatsAppConversation.id == conversation_id, WhatsAppConversation.owner_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


def own_conversation_ids(db: Session, user) -> List[int]:
    return [r[0] for r in db.query(WhatsAppConversation.id).filter(WhatsAppConversation.owner_id == user.id).all()]


def owned_message_or_404(db: Session, message_id: int, user) -> WhatsAppMessage:
    msg = (
        db.query(WhatsAppMessage)
        .join(WhatsAppConversation, WhatsAppConversation.id == WhatsAppMessage.conversation_id)
        .filter(WhatsAppMessage.id == message_id, WhatsAppConversation.owner_id == user.id)
        .first()
    )
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return msg
