import csv
import io
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.user import User, UserRole
from app.models.business import Business, WebsiteStatus, WebsiteQuality
from app.models.website_request import WebsiteRequest, RequestStatus
from app.models.conversation import Conversation
from app.schemas.user import UserOut, AdminUserUpdate
from app.schemas.business import BusinessOut
from app.schemas.website import WebsiteRequestOut, WebsiteRequestUpdate
from app.schemas.chat import ConversationOut
from app.auth.dependencies import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

def _guard_last_admin(db: Session, user: User, req: Optional[AdminUserUpdate]) -> None:
    """Never allow the last active admin to be removed, demoted or deactivated."""
    if user.role != UserRole.ADMIN or not user.is_active:
        return
    removing = req is None or req.is_active is False or (req.role is not None and req.role != UserRole.ADMIN)
    if not removing:
        return
    others = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active.is_(True), User.id != user.id).count()
    if others == 0:
        raise HTTPException(status_code=400, detail="At least one active administrator must remain.")


@router.get("/statistics")
def get_statistics(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_biz = db.query(Business).count()
    with_web = db.query(Business).filter(Business.website_status == WebsiteStatus.WEBSITE_AVAILABLE).count()
    no_web = db.query(Business).filter(Business.website_status.in_([WebsiteStatus.NO_WEBSITE, WebsiteStatus.WEBSITE_UNREACHABLE])).count()
    good_web = db.query(Business).filter(Business.website_quality == WebsiteQuality.GOOD).count()
    needs_imp = db.query(Business).filter(Business.website_quality.in_([WebsiteQuality.NEEDS_IMPROVEMENT, WebsiteQuality.AVERAGE, WebsiteQuality.POOR])).count()
    total_reqs = db.query(WebsiteRequest).count()
    pending_reqs = db.query(WebsiteRequest).filter(WebsiteRequest.status == RequestStatus.PENDING).count()
    total_convs = db.query(Conversation).count()

    return {
        "total_users": total_users,
        "total_businesses": total_biz,
        "website_available": with_web,
        "no_website": no_web,
        "good_websites": good_web,
        "needs_improvement": needs_imp,
        "total_website_requests": total_reqs,
        "pending_website_requests": pending_reqs,
        "total_conversations": total_convs,
    }

# ─── Businesses Management ───────────────────────────────────────────────────

@router.get("/businesses", response_model=list[BusinessOut])
def get_all_businesses(
    search: Optional[str] = None,
    website_status: Optional[WebsiteStatus] = None,
    website_quality: Optional[WebsiteQuality] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Business)
    if search:
        query = query.filter(Business.name.ilike(f"%{search}%"))
    if website_status:
        query = query.filter(Business.website_status == website_status)
    if website_quality:
        query = query.filter(Business.website_quality == website_quality)
    if category:
        query = query.filter(Business.category == category)

    return query.order_by(Business.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/businesses/{business_id}", response_model=BusinessOut)
def update_business(
    business_id: int,
    website_status: Optional[WebsiteStatus] = None,
    website_quality: Optional[WebsiteQuality] = None,
    website_score: Optional[int] = None,
    db: Session = Depends(get_db)
):
    biz = db.query(Business).filter(Business.id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
    if website_status is not None:
        biz.website_status = website_status
    if website_quality is not None:
        biz.website_quality = website_quality
    if website_score is not None:
        biz.website_score = website_score
    db.commit()
    db.refresh(biz)
    return biz

@router.delete("/businesses/{business_id}")
def delete_business(business_id: int, db: Session = Depends(get_db)):
    biz = db.query(Business).filter(Business.id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
    db.delete(biz)
    db.commit()
    return {"message": "Business deleted successfully"}

# ─── Users Management ─────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
def get_all_users(
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if search:
        query = query.filter(
            (User.full_name.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
        )
    if role:
        query = query.filter(User.role == role)
    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/users/{user_id}", response_model=UserOut)
def update_user_status(
    user_id: int,
    req: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # An admin can neither lock themselves out nor demote themselves (avoids orphaned systems).
    if user.id == admin.id and (
        req.is_active is False or (req.role is not None and req.role != UserRole.ADMIN)
    ):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account.")
    _guard_last_admin(db, user, req)
    if req.full_name is not None:
        user.full_name = req.full_name
    if req.phone is not None:
        user.phone = req.phone
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.role is not None:
        user.role = req.role
    db.commit()
    db.refresh(user)

    try:
        from app.mongodb import upsert_user
        upsert_user({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone or "",
            "password_hash": user.password_hash,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "is_active": user.is_active,
        })
    except Exception as e:
        print(f"MongoDB admin user update sync note: {e}")

    return user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    _guard_last_admin(db, user, None)
    user_email = user.email
    db.delete(user)
    db.commit()

    try:
        from app.mongodb import get_mongo_db
        m_db = get_mongo_db()
        if m_db is not None:
            m_db.users.delete_one({"$or": [{"id": user_id}, {"email": user_email}]})
    except Exception as e:
        print(f"MongoDB user delete note: {e}")

    return {"message": "User deleted successfully"}

# ─── Website Requests Management ──────────────────────────────────────────────

@router.get("/website-requests", response_model=list[WebsiteRequestOut])
def get_all_website_requests(
    status_filter: Optional[RequestStatus] = None,
    db: Session = Depends(get_db)
):
    query = db.query(WebsiteRequest)
    if status_filter:
        query = query.filter(WebsiteRequest.status == status_filter)
    return query.order_by(WebsiteRequest.created_at.desc()).all()

@router.put("/website-requests/{request_id}", response_model=WebsiteRequestOut)
def update_website_request(
    request_id: int,
    req: WebsiteRequestUpdate,
    db: Session = Depends(get_db)
):
    wr = db.query(WebsiteRequest).filter(WebsiteRequest.id == request_id).first()
    if not wr:
        raise HTTPException(status_code=404, detail="Website request not found")
    if req.status is not None:
        wr.status = req.status
    if req.admin_notes is not None:
        wr.admin_notes = req.admin_notes
    db.commit()
    db.refresh(wr)
    return wr

# ─── Reports & CSV Export ────────────────────────────────────────────────────

@router.get("/reports/csv")
def export_csv_report(
    website_status: Optional[WebsiteStatus] = None,
    website_quality: Optional[WebsiteQuality] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Business)
    if website_status:
        query = query.filter(Business.website_status == website_status)
    if website_quality:
        query = query.filter(Business.website_quality == website_quality)
    if category:
        query = query.filter(Business.category == category)

    businesses = query.order_by(Business.name.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Business Name", "Category", "Address", "Phone",
        "Website URL", "Website Status", "Website Quality",
        "Website Score", "Rating", "Review Count", "Last Checked", "Created At"
    ])

    for b in businesses:
        writer.writerow([
            b.id,
            b.name,
            b.category or "N/A",
            b.address or "N/A",
            b.phone or "N/A",
            b.website_url or "N/A",
            b.website_status.value if b.website_status else "UNKNOWN",
            b.website_quality.value if b.website_quality else "UNANALYZED",
            b.website_score if b.website_score is not None else "N/A",
            b.rating or "N/A",
            b.review_count or 0,
            b.last_website_check.strftime("%Y-%m-%d %H:%M") if b.last_website_check else "Never",
            b.created_at.strftime("%Y-%m-%d %H:%M") if b.created_at else "N/A"
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=shop_presence_report.csv"}
    )
