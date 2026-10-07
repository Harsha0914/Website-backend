# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.search import Search
from app.models.user import User
from app.schemas.search import SearchCreate, SearchOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/search", tags=["Search History"])

# Both spellings are served directly: a redirect from "/api/search" to "/api/search/" makes browsers
# drop the Authorization header (cross-origin 307), which silently lost every search record.
@router.post("", response_model=SearchOut, include_in_schema=False)
@router.post("/", response_model=SearchOut)
def record_search(
    req: SearchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    search = Search(
        user_id=current_user.id,
        latitude=req.latitude,
        longitude=req.longitude,
        radius_km=req.radius_km,
        category=req.category,
        keyword=req.keyword
    )
    db.add(search)
    db.commit()
    db.refresh(search)
    return search

@router.get("/history", response_model=list[SearchOut])
def get_search_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return (
        db.query(Search)
        .filter(Search.user_id == current_user.id)
        .order_by(Search.created_at.desc())
        .limit(20)
        .all()
    )
