from datetime import datetime
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.business import Business, WebsiteStatus
from app.models.website_analysis import WebsiteAnalysis
from app.models.website_request import WebsiteRequest, RequestStatus
from app.models.user import User
from app.schemas.website import (
    WebsiteAnalysisOut,
    WebsiteRequestCreate,
    WebsiteRequestOut
)
from app.services.website_detection_service import detect_website
from app.services.website_analysis_service import analyze_website
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/websites", tags=["Websites & Analysis"])

@router.post("/requests", response_model=WebsiteRequestOut, status_code=status.HTTP_201_CREATED)
def create_website_request(
    req: WebsiteRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    biz = db.query(Business).filter(Business.id == req.business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    request_record = WebsiteRequest(
        user_id=current_user.id,
        business_id=biz.id,
        status=RequestStatus.PENDING,
        message=req.message
    )
    db.add(request_record)
    db.commit()
    db.refresh(request_record)
    return request_record

@router.get("/requests/my", response_model=list[WebsiteRequestOut])
def get_my_website_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return (
        db.query(WebsiteRequest)
        .filter(WebsiteRequest.user_id == current_user.id)
        .order_by(WebsiteRequest.created_at.desc())
        .all()
    )

@router.get("/{business_id}", response_model=WebsiteAnalysisOut)
def get_website_analysis(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wa = db.query(WebsiteAnalysis).filter(WebsiteAnalysis.business_id == business_id).first()
    if not wa:
        biz = db.query(Business).filter(Business.id == business_id).first()
        if not biz:
            raise HTTPException(status_code=404, detail="Business not found")
        raise HTTPException(status_code=404, detail="No website analysis available for this business yet")
    return wa

@router.post("/{business_id}/analyze", response_model=WebsiteAnalysisOut)
async def trigger_analysis(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    biz = db.query(Business).filter(Business.id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    if not biz.website_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Business does not have a recorded website URL to analyze."
        )

    # 1. Detect reachability & HTTPS
    status_val, final_url, https = await detect_website(biz.website_url)
    biz.website_status = status_val
    biz.last_website_check = datetime.utcnow()

    # 2. Deep quality analysis
    target_url = final_url or biz.website_url
    analysis_data = await analyze_website(target_url)
    biz.website_score = analysis_data["score"]
    biz.website_quality = analysis_data["quality"]

    wa = db.query(WebsiteAnalysis).filter(WebsiteAnalysis.business_id == biz.id).first()
    if not wa:
        wa = WebsiteAnalysis(business_id=biz.id)
        db.add(wa)

    wa.url = analysis_data["url"]
    wa.is_reachable = analysis_data["is_reachable"]
    wa.https_enabled = analysis_data["https_enabled"]
    wa.final_url = analysis_data["final_url"]
    wa.http_status_code = analysis_data["http_status_code"]
    wa.mobile_viewport = analysis_data["mobile_viewport"]
    wa.has_title = analysis_data["has_title"]
    wa.has_meta_description = analysis_data["has_meta_description"]
    wa.has_open_graph = analysis_data["has_open_graph"]
    wa.has_contact_info = analysis_data["has_contact_info"]
    wa.has_phone = analysis_data["has_phone"]
    wa.has_email = analysis_data["has_email"]
    wa.has_social_links = analysis_data["has_social_links"]
    wa.has_navigation = analysis_data["has_navigation"]
    wa.score = analysis_data["score"]
    wa.analysis_details = analysis_data["analysis_details"]
    wa.checked_at = datetime.utcnow()

    db.commit()
    db.refresh(wa)
    return wa

