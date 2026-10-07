import hmac
import os
import secrets
import smtplib
import threading
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, List, Tuple

from app.config import settings

# In-memory OTP storage: email -> [otp_code, expires_at, failed_attempts, issued_at]
# (single-instance; move to Redis if you run several workers)
_OTP_CACHE: Dict[str, List] = {}
_OTP_LOCK = threading.Lock()


def generate_otp(length: int = 6) -> str:
    """Cryptographically secure numeric OTP."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def can_issue_otp(email: str) -> bool:
    """False while the previous code for this address is still inside the resend cooldown."""
    clean_email = email.lower().strip()
    with _OTP_LOCK:
        entry = _OTP_CACHE.get(clean_email)
        if not entry:
            return True
        return time.time() - entry[3] >= settings.OTP_RESEND_COOLDOWN_SECONDS


def store_otp(email: str, otp: str, expire_seconds: int = 600) -> None:
    """Store OTP for email with expiration (replaces any previous code)."""
    clean_email = email.lower().strip()
    now = time.time()
    with _OTP_LOCK:
        _OTP_CACHE[clean_email] = [otp, now + expire_seconds, 0, now]


def verify_otp(email: str, otp: str) -> bool:
    """
    Verify an OTP. There are NO universal/test codes. A code is single-use, expires, and
    is destroyed after OTP_MAX_ATTEMPTS wrong guesses (stops brute-forcing the 6 digits).
    """
    clean_email = email.lower().strip()
    clean_otp = str(otp).strip()
    with _OTP_LOCK:
        entry = _OTP_CACHE.get(clean_email)
        if not entry:
            return False
        stored_otp, expires_at, attempts, _issued = entry
        if time.time() > expires_at or attempts >= settings.OTP_MAX_ATTEMPTS:
            _OTP_CACHE.pop(clean_email, None)
            return False
        if hmac.compare_digest(stored_otp.encode(), clean_otp.encode()):
            _OTP_CACHE.pop(clean_email, None)  # single use
            return True
        entry[2] = attempts + 1
        if entry[2] >= settings.OTP_MAX_ATTEMPTS:
            _OTP_CACHE.pop(clean_email, None)
        return False


def reset_otp_cache() -> None:
    with _OTP_LOCK:
        _OTP_CACHE.clear()


def send_otp_email(recipient_email: str, otp: str) -> dict:
    """
    Send OTP verification email via SMTP if configured, or return simulated delivery.
    """
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM", smtp_user or "noreply@shoppresence.com").strip()

    email_subject = f"Your Verification OTP: {otp} - Website Presence Detection"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }}
            .card {{ max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }}
            .logo {{ font-size: 20px; font-weight: 800; color: #2563eb; margin-bottom: 24px; text-align: center; }}
            .title {{ font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }}
            .text {{ font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }}
            .otp-box {{ background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 12px; padding: 16px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1d4ed8; margin: 20px 0; }}
            .footer {{ font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">🏪 Website Presence Detection</div>
            <div class="title">Password Reset OTP</div>
            <p class="text">We received a request to reset your password. Use the verification code below to complete the reset:</p>
            <div class="otp-box">{otp}</div>
            <p class="text">This code will expire in <strong>10 minutes</strong>. If you did not request this password reset, please ignore this email.</p>
            <div class="footer">© 2026 Website Presence Detection. All rights reserved.</div>
        </div>
    </body>
    </html>
    """

    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = email_subject
            msg["From"] = smtp_from
            msg["To"] = recipient_email
            
            part_text = MIMEText(f"Your Website Presence Detection OTP code is {otp}. Valid for 10 minutes.", "plain")
            part_html = MIMEText(html_content, "html")
            msg.attach(part_text)
            msg.attach(part_html)

            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.ehlo()
            if smtp_port in (587, 25, 2525):
                server.starttls()
                server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [recipient_email], msg.as_string())
            server.quit()
            return {"sent": True, "method": "smtp", "message": "OTP email sent successfully"}
        except Exception as e:
            print(f"SMTP send failed: {e}")
            return {"sent": False, "method": "smtp_error", "error": "SMTP delivery failed"}
    
    # SMTP is not configured. Only outside production is the code written to the server log
    # (so local development works); in production it is never logged or returned.
    if settings.is_production:
        print("[OTP DELIVERY] SMTP is not configured: reset code could not be delivered.")
    else:
        print(f"[OTP DELIVERY][dev only] OTP {otp} for {recipient_email}")
    return {"sent": False, "method": "simulated", "message": "SMTP not configured"}
