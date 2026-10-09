from datetime import datetime

# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, LargeBinary

from app.database import Base


class MessageImage(Base):
    """
    A picture an account keeps in its own library to send with WhatsApp messages (a cafe photo, a restaurant
    photo, ...). Private to the account that uploaded it.
    """

    __tablename__ = "message_images"

    id = Column(Integer, primary_key=True, index=True)
    # Stable identity that survives the database being rebuilt (ids can change, this never does).
    uid = Column(String(32), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(40), default="General", nullable=False, index=True)
    label = Column(String(80), default="", nullable=False)
    mime = Column(String(30), default="image/jpeg", nullable=False)
    size = Column(Integer, default=0, nullable=False)
    data = Column(LargeBinary, nullable=False)          # the picture that is sent
    thumb = Column(Text, default="", nullable=False)    # small data URL for previews in the app
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
