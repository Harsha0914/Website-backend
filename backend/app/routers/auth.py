# pyrefly: ignore [missing-import]
import hmac
import uuid

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Request, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from jose import JWTError

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.rate_limit import limiter
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SendOtpRequest,
    VerifyOtpResetPasswordRequest,
    GoogleAuthRequest,
)
from app.schemas.user import UserOut
from app.utils import login_throttle
from app.utils.google_auth import GoogleAuthError, verify_google_id_token
from app.utils.security import burn_password_check, hash_password, verify_password
from app.services.email_service import (
    can_issue_otp,
    generate_otp,
    send_otp_email,
    store_otp,
    verify_otp,
)
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

INVALID_CREDENTIALS = "Invalid username/email or password."
OTP_REQUEST_MESSAGE = "If an account exists for this email, a verification code has been sent."


def _sync_user_to_mongo(user: User) -> None:
    """Best-effort mirror of the account to MongoDB (used to restore accounts on ephemeral hosts)."""
    try:
        from app.mongodb import upsert_user
        upsert_user({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone or "",
            "password_hash": user.password_hash,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_active": user.is_active,
            "created_at": str(user.created_at) if user.created_at else None,
            "updated_at": str(user.updated_at) if getattr(user, "updated_at", None) else None,
        })
    except Exception as e:
        print(f"MongoDB user sync note: {e}")


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        token_type="bearer",
        user_id=user.id,
        role=user.role.value,
        full_name=user.full_name,
        username=user.username or user.email,
    )


# ─── Password reset ──────────────────────────────────────────────────────────
@router.post("/send-otp")
@router.post("/forgot-password")
@limiter.limit("5/minute")
def send_forgot_password_otp(request: Request, req: SendOtpRequest, db: Session = Depends(get_db)):
    """
    Always answers the same way, whether or not the account exists (no user enumeration),
    and NEVER creates an account. The code is only delivered by e-mail.
    """
    email_clean = req.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()

    otp_code = None
    if user and user.is_active and can_issue_otp(email_clean):
        otp_code = generate_otp(6)
        store_otp(email_clean, otp_code, expire_seconds=600)
        send_otp_email(email_clean, otp_code)

    response = {
        "success": True,
        "message": OTP_REQUEST_MESSAGE,
        "email": email_clean,
        "expires_in": 600,
    }
    # Convenience for local development ONLY; never present in production.
    if otp_code and settings.DEBUG and not settings.is_production:
        response["dev_otp"] = otp_code
    return response


@router.post("/verify-otp-reset-password")
@limiter.limit("10/minute")
def verify_otp_and_reset_password(
    request: Request, req: VerifyOtpResetPasswordRequest, db: Session = Depends(get_db)
):
    email_clean = req.email.lower().strip()

    if not verify_otp(email_clean, req.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code. Please request a new one.",
        )

    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code. Please request a new one.",
        )

    user.password_hash = hash_password(req.new_password)
    db.commit()
    login_throttle.clear(email_clean)
    _sync_user_to_mongo(user)

    return {
        "success": True,
        "message": "Password has been successfully updated! You can now sign in with your new password.",
    }


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Change a password you still know. The CURRENT password is mandatory.
    Forgotten password? Use /send-otp followed by /verify-otp-reset-password.
    """
    email_clean = req.email.lower().strip()
    if login_throttle.is_locked(email_clean):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Too many failed attempts. Try again later.")

    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not user.is_active:
        burn_password_check(req.old_password)
        login_throttle.register_failure(email_clean)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CREDENTIALS)

    if not verify_password(req.old_password, user.password_hash):
        login_throttle.register_failure(email_clean)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CREDENTIALS)

    user.password_hash = hash_password(req.new_password)
    db.commit()
    login_throttle.clear(email_clean)
    _sync_user_to_mongo(user)
    return {"success": True, "message": "Password changed successfully."}


# ─── Registration ────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    clean_username = (req.username or "").strip().lower()
    clean_email = (req.email or "").strip().lower()

    if not clean_username and not clean_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required for registration.")

    if not clean_username:
        clean_username = clean_email.split("@")[0]

    if not clean_email:
        if "@" in clean_username:
            clean_email = clean_username
        else:
            clean_email = f"{clean_username}@shoppresence.com"

    wants_admin = (req.role or "").upper() == "ADMIN"
    if wants_admin:
        configured = (settings.ADMIN_SECRET_CODE or "").strip()
        if not configured:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Admin self-registration is disabled on this server.")
        supplied = (req.admin_code or "").strip()
        if not supplied or not hmac.compare_digest(supplied.encode(), configured.encode()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Admin Secret Code.")

    if db.query(User).filter(User.username == clean_username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this username already exists.")
    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists.")

    full_name = (req.full_name or clean_username).strip() or clean_username.title()

    new_user = User(
        username=clean_username,
        full_name=full_name,
        email=clean_email,
        phone=req.phone,
        password_hash=hash_password(req.password),
        role=UserRole.ADMIN if wants_admin else UserRole.USER,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    _sync_user_to_mongo(new_user)
    return new_user


# ─── Login / tokens ──────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    identifier = (req.username or req.email or "").strip().lower()
    if not identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email is required.")
    if not req.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required.")

    if login_throttle.is_locked(identifier):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Please try again later.",
        )

    user = db.query(User).filter((User.email == identifier) | (User.username == identifier)).first()

    # Fallback to MongoDB Atlas if not in the local DB (e.g. after an ephemeral-host restart)
    if not user:
        try:
            from app.mongodb import find_user_by_email_or_username
            m_user = find_user_by_email_or_username(identifier)
            if m_user and m_user.get("password_hash"):
                user = User(
                    username=m_user.get("username") or identifier,
                    email=m_user.get("email") or identifier,
                    full_name=m_user.get("full_name") or identifier,
                    phone=m_user.get("phone") or "",
                    password_hash=m_user.get("password_hash"),
                    role=UserRole.ADMIN if str(m_user.get("role")).upper() == "ADMIN" else UserRole.USER,
                    is_active=bool(m_user.get("is_active", True)),
                )
                db.add(user)
                db.commit()
                db.refresh(user)
        except Exception as e:
            print(f"MongoDB user login lookup error: {e}")

    # Same response and same CPU cost whether the account exists or not.
    if not user:
        burn_password_check(req.password)
        login_throttle.register_failure(identifier)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    if not verify_password(req.password, user.password_hash):
        login_throttle.register_failure(identifier)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    # A deactivated account stays deactivated: only an admin can re-enable it.
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated.")

    login_throttle.clear(identifier)
    return _token_response(user)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("60/minute")
def refresh_token_endpoint(request: Request, req: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_token(req.refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user = None
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
    except (ValueError, TypeError):
        user = db.query(User).filter(User.email == str(user_id).lower()).first()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return _token_response(user)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out successfully"}


# ─── Google Sign-In ──────────────────────────────────────────────────────────
@router.post("/google", response_model=TokenResponse)
@limiter.limit("20/minute")
def google_auth(request: Request, req: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Signs in with a Google ID token that is verified server-side with Google (audience,
    issuer, expiry, verified e-mail). The client can never choose the e-mail or the role:
    new accounts are always plain USERs.
    """
    if not (settings.GOOGLE_CLIENT_ID or "").strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Google sign-in is not configured on this server.")
    try:
        info = verify_google_id_token(req.id_token)
    except GoogleAuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    email_clean = info["email"]
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        name_part = (info.get("name") or "").strip() or email_clean.split("@")[0].replace(".", " ").replace("_", " ").title()
        base_username = email_clean.split("@")[0].lower()
        taken = db.query(User).filter(User.username == base_username).first()
        user = User(
            username=base_username if not taken else f"{base_username}_{uuid.uuid4().hex[:4]}",
            full_name=name_part if len(name_part) >= 2 else "Google User",
            email=email_clean,
            phone="",
            password_hash=hash_password(f"GoogleAuth_{uuid.uuid4().hex}{uuid.uuid4().hex}"),
            role=UserRole.USER,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        _sync_user_to_mongo(user)
    elif not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated.")

    return _token_response(user)
