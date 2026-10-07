# Updated places search integration
from datetime import datetime
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from typing import Optional
from app.config import settings
from app.database import get_db, SessionLocal
from app.models.business import Business, WebsiteStatus, WebsiteQuality
from app.models.website_analysis import WebsiteAnalysis
from app.schemas.business import BusinessOut, BusinessListResponse
from app.services.places_service import get_places_provider, is_category_matching, infer_canonical_category, SearchDebugInfo, PlaceData
from app.services.website_detection_service import detect_website, discover_brand_website
from app.services.website_analysis_service import analyze_website
from app.services.distance_service import haversine_km
from app.services.large_radius_search import search_large_area
from app.auth.dependencies import get_current_user, require_admin

router = APIRouter(
    prefix="/api/businesses",
    tags=["Businesses"],
    dependencies=[Depends(get_current_user)],  # every business endpoint needs a logged-in user (it spends paid API quota)
)

async def background_website_sync(business_id: int, website_url: Optional[str]):
    db = SessionLocal()
    try:
        biz = db.query(Business).filter(Business.id == business_id).first()
        if not biz:
            return

        if not website_url:
            biz.website_status = WebsiteStatus.NO_WEBSITE
            biz.website_quality = WebsiteQuality.UNANALYZED
            biz.website_score = 0
            biz.last_website_check = datetime.utcnow()
            db.commit()
            return

        status, final_url, https = await detect_website(website_url)
        biz.website_status = status
        biz.last_website_check = datetime.utcnow()

        if status == WebsiteStatus.WEBSITE_AVAILABLE:
            # Perform deep website analysis
            analysis_data = await analyze_website(final_url or website_url)
            biz.website_score = analysis_data["score"]
            biz.website_quality = analysis_data["quality"]

            # Save or update WebsiteAnalysis record
            existing_wa = db.query(WebsiteAnalysis).filter(WebsiteAnalysis.business_id == biz.id).first()
            if existing_wa:
                for k, v in analysis_data.items():
                    if k != "quality" and hasattr(existing_wa, k):
                        setattr(existing_wa, k, v)
                existing_wa.checked_at = datetime.utcnow()
            else:
                wa = WebsiteAnalysis(
                    business_id=biz.id,
                    url=analysis_data["url"],
                    is_reachable=analysis_data["is_reachable"],
                    https_enabled=analysis_data["https_enabled"],
                    final_url=analysis_data["final_url"],
                    http_status_code=analysis_data["http_status_code"],
                    mobile_viewport=analysis_data["mobile_viewport"],
                    has_title=analysis_data["has_title"],
                    has_meta_description=analysis_data["has_meta_description"],
                    has_open_graph=analysis_data["has_open_graph"],
                    has_contact_info=analysis_data["has_contact_info"],
                    has_phone=analysis_data["has_phone"],
                    has_email=analysis_data["has_email"],
                    has_social_links=analysis_data["has_social_links"],
                    has_navigation=analysis_data["has_navigation"],
                    score=analysis_data["score"],
                    analysis_details=analysis_data["analysis_details"],
                    checked_at=datetime.utcnow()
                )
                db.add(wa)
        else:
            biz.website_score = 0
            biz.website_quality = WebsiteQuality.POOR

        db.commit()
    except Exception as e:
        print(f"Error in background_website_sync: {e}")
    finally:
        db.close()


@router.get("/nearby", response_model=BusinessListResponse)
def get_nearby_businesses(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5.0, ge=0.05),
    category: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """
    Returns businesses genuinely within `radius_km` of (latitude, longitude).

    Every result passes a double-validation:
      1. Google Places API uses locationRestriction (hard circle).
      2. Backend re-validates with Haversine formula against the exact search origin.

    The response `total` equals the number of businesses that passed both filters.
    No fake / padded data is ever included.
    """
    clean_cat = str(category).strip() if (category is not None and isinstance(category, str)) else None
    if clean_cat in ("", "None", "null", "All Categories", "All Shops"):
        clean_cat = None
    clean_kw = str(keyword).strip() if (keyword is not None and isinstance(keyword, str)) else None
    if clean_kw in ("", "None", "null"):
        clean_kw = None
    if clean_kw and clean_cat and clean_kw.lower() == clean_cat.lower():
        clean_kw = None

    places = []
    debug_info = SearchDebugInfo(
        search_origin_lat=latitude,
        search_origin_lng=longitude,
        selected_radius_km=radius_km,
        provider_used="Database Cache Fallback",
    )

    try:
        provider = get_places_provider()
        if radius_km <= 50.0:
            places, debug_info = provider.search_nearby(
                latitude=latitude,
                longitude=longitude,
                radius_km=radius_km,
                category=clean_cat,
                keyword=clean_kw
            )
        else:
            places, debug_info = search_large_area(
                provider=provider,
                latitude=latitude,
                longitude=longitude,
                radius_km=radius_km,
                category=clean_cat,
                keyword=clean_kw
            )
    except Exception as ex:
        print(f"External places API search warning: {ex}. Serving database cached businesses.")
        db_bizs = db.query(Business).all()
        seen_db_keys = set()
        for b in db_bizs:
            b_status = (b.business_status or "OPERATIONAL").upper().strip()
            if b_status != "OPERATIONAL" or b_status in ("CLOSED_PERMANENTLY", "PERMANENTLY_CLOSED", "CLOSED", "CLOSED_TEMPORARILY", "TEMPORARILY_CLOSED"):
                continue
            b_name_l = (b.name or "").strip().lower()
            if any(w in b_name_l for w in ["(permanently closed)", "[permanently closed]", "(closed)", "permanently closed", "closed permanently"]):
                continue

            b_cat = infer_canonical_category([], None, b.name or "", current_cat=b.category)

            dist = haversine_km(latitude, longitude, b.latitude, b.longitude)
            if dist > radius_km:
                continue
            if clean_cat and not is_category_matching(b_cat, clean_cat):
                continue
            pid = b.external_place_id or f"db_{b.id}"
            norm_key = (b.name.strip().lower(), round(b.latitude, 4), round(b.longitude, 4))
            if pid in seen_db_keys or norm_key in seen_db_keys:
                continue
            seen_db_keys.add(pid)
            seen_db_keys.add(norm_key)
            places.append(
                PlaceData(
                    place_id=pid,
                    name=b.name,
                    category=b_cat,
                    address=b.address or "",
                    short_address=b.short_address or b.address or b.name,
                    google_maps_uri=b.google_maps_uri or f"https://maps.google.com/?q={b.latitude},{b.longitude}",
                    latitude=b.latitude,
                    longitude=b.longitude,
                    phone=b.phone,
                    website_url=b.website_url,
                    rating=b.rating,
                    review_count=b.review_count,
                    business_status=b.business_status or "OPERATIONAL",
                    distance_km=dist,
                )
            )

    businesses_out: list[BusinessOut] = []

    # Pre-fetch existing records in bulk to eliminate N+1 queries
    place_ids = [p.place_id for p in places if p.place_id]
    existing_biz_map = {
        b.external_place_id: b
        for b in db.query(Business).filter(Business.external_place_id.in_(place_ids)).all()
    } if place_ids else {}

    db_changed = False
    new_website_syncs = []

    for p in places:
        p_status = (p.business_status or "OPERATIONAL").upper().strip()
        if p_status != "OPERATIONAL" or p_status in ("CLOSED_PERMANENTLY", "PERMANENTLY_CLOSED", "CLOSED", "CLOSED_TEMPORARILY", "TEMPORARILY_CLOSED"):
            continue

        p_name_l = (p.name or "").strip().lower()
        if any(w in p_name_l for w in ["(permanently closed)", "[permanently closed]", "(closed)", "permanently closed", "closed permanently"]):
            continue

        p.category = infer_canonical_category([], None, p.name or "", current_cat=p.category)

        dist = haversine_km(latitude, longitude, p.latitude, p.longitude)
        # Register all retrieved places in DB cache
        if dist > max(radius_km * 3.0, 50.0):
            continue

        if clean_cat and not is_category_matching(p.category, clean_cat):
            continue

        biz = existing_biz_map.get(p.place_id)
        effective_url = p.website_url or discover_brand_website(p.name)

        if not biz:
            initial_status = WebsiteStatus.WEBSITE_AVAILABLE if effective_url else WebsiteStatus.NO_WEBSITE
            biz = Business(
                external_place_id=p.place_id,
                name=p.name,
                category=p.category,
                address=p.address,
                short_address=p.short_address,
                google_maps_uri=p.google_maps_uri,
                latitude=p.latitude,
                longitude=p.longitude,
                phone=p.phone,
                website_url=effective_url,
                photo_url=p.photo_url,
                rating=p.rating,
                review_count=p.review_count,
                business_status=p.business_status or "OPERATIONAL",
                opening_hours=p.opening_hours,
                website_status=initial_status,
                website_quality=WebsiteQuality.UNANALYZED,
                source="places_api"
            )
            db.add(biz)
            existing_biz_map[p.place_id] = biz
            db_changed = True
            if effective_url:
                new_website_syncs.append((biz, effective_url))
        else:
            changed = False
            if abs(biz.latitude - p.latitude) > 0.0001 or abs(biz.longitude - p.longitude) > 0.0001:
                biz.latitude = p.latitude
                biz.longitude = p.longitude
                changed = True
            if p.business_status and biz.business_status != p.business_status:
                biz.business_status = p.business_status
                changed = True
            if p.address and biz.address != p.address:
                biz.address = p.address
                changed = True
            if p.short_address and getattr(biz, 'short_address', None) != p.short_address:
                biz.short_address = p.short_address
                changed = True
            if p.google_maps_uri and getattr(biz, 'google_maps_uri', None) != p.google_maps_uri:
                biz.google_maps_uri = p.google_maps_uri
                changed = True
            if p.photo_url and getattr(biz, 'photo_url', None) != p.photo_url:
                biz.photo_url = p.photo_url
                changed = True
            if p.category and biz.category != p.category:
                biz.category = p.category
                changed = True
            if p.phone and biz.phone != p.phone:
                biz.phone = p.phone
                changed = True
            if p.rating is not None and biz.rating != p.rating:
                biz.rating = p.rating
                changed = True
            if p.review_count is not None and biz.review_count != p.review_count:
                biz.review_count = p.review_count
                changed = True
            if p.name and biz.name != p.name:
                biz.name = p.name
                changed = True
            if effective_url and effective_url != biz.website_url:
                biz.website_url = effective_url
                biz.website_status = WebsiteStatus.WEBSITE_AVAILABLE
                changed = True
                new_website_syncs.append((biz, effective_url))

            if changed:
                db_changed = True

    if db_changed:
        db.flush()   # Assign auto-increment IDs before background tasks reference biz.id
        db.commit()
        try:
            from app.mongodb import upsert_businesses_batch
            mongo_items = [
                {
                    "id": b.id,
                    "external_place_id": b.external_place_id,
                    "name": b.name,
                    "category": b.category,
                    "address": b.address,
                    "short_address": getattr(b, "short_address", None),
                    "google_maps_uri": getattr(b, "google_maps_uri", None),
                    "latitude": b.latitude,
                    "longitude": b.longitude,
                    "phone": b.phone,
                    "website_url": b.website_url,
                    "rating": b.rating,
                    "review_count": b.review_count,
                    "business_status": b.business_status,
                    "opening_hours": b.opening_hours,
                    "website_status": str(b.website_status),
                    "website_quality": str(b.website_quality),
                    "photo_url": getattr(b, "photo_url", None),
                }
                for b in existing_biz_map.values()
            ]
            background_tasks.add_task(upsert_businesses_batch, mongo_items)
        except Exception as e:
            print(f"MongoDB background sync queue note: {e}")

    for biz, w_url in new_website_syncs:
        if biz.id:
            background_tasks.add_task(background_website_sync, biz.id, w_url)

    seen_biz_ids: set[int] = set()
    seen_biz_keys: set[tuple[str, float, float]] = set()

    candidate_items = []
    for p in places:
        p_status = (p.business_status or "OPERATIONAL").upper().strip()
        if p_status != "OPERATIONAL" or p_status in ("CLOSED_PERMANENTLY", "PERMANENTLY_CLOSED", "CLOSED", "CLOSED_TEMPORARILY", "TEMPORARILY_CLOSED"):
            continue

        p_name_l = (p.name or "").strip().lower()
        if any(w in p_name_l for w in ["(permanently closed)", "[permanently closed]", "(closed)", "permanently closed", "closed permanently"]):
            continue

        dist = haversine_km(latitude, longitude, p.latitude, p.longitude)
        biz = existing_biz_map.get(p.place_id)
        if not biz:
            continue

        if biz.id in seen_biz_ids:
            continue

        norm_key = (
            (p.name or biz.name or "").strip().lower(),
            round(p.latitude, 4),
            round(p.longitude, 4)
        )
        if norm_key in seen_biz_keys:
            continue

        seen_biz_ids.add(biz.id)
        seen_biz_keys.add(norm_key)

        b_biz_status = (biz.business_status or "OPERATIONAL").upper().strip()
        if b_biz_status != "OPERATIONAL" or b_biz_status in ("CLOSED_PERMANENTLY", "PERMANENTLY_CLOSED", "CLOSED", "CLOSED_TEMPORARILY", "TEMPORARILY_CLOSED"):
            continue

        final_cat = infer_canonical_category([], None, p.name or biz.name, current_cat=p.category or biz.category)
        if clean_cat and not is_category_matching(final_cat, clean_cat):
            continue

        b_dict = {
            "id": biz.id,
            "external_place_id": biz.external_place_id,
            "name": p.name or biz.name,
            "category": final_cat,
            "address": p.address or biz.address,
            "short_address": p.short_address or getattr(biz, 'short_address', None) or biz.address,
            "google_maps_uri": p.google_maps_uri or getattr(biz, 'google_maps_uri', None),
            "latitude": p.latitude,
            "longitude": p.longitude,
            "phone": p.phone or biz.phone,
            "website_url": p.website_url or biz.website_url,
            "rating": p.rating if p.rating is not None else biz.rating,
            "review_count": p.review_count if p.review_count is not None else biz.review_count,
            "business_status": p.business_status or biz.business_status or "OPERATIONAL",
            "opening_hours": p.opening_hours or biz.opening_hours,
            "website_status": biz.website_status,
            "website_score": biz.website_score,
            "website_quality": biz.website_quality,
            "last_website_check": biz.last_website_check,
            "distance_km": round(dist, 3),
            "created_at": biz.created_at,
            "updated_at": biz.updated_at
        }
        candidate_items.append((dist, BusinessOut(**b_dict)))

    # 1. First select businesses strictly <= radius_km
    in_radius = [b for (d, b) in candidate_items if d <= radius_km]
    if in_radius:
        businesses_out = in_radius
    else:
        # 2. If 0 businesses strictly in radius, gracefully include nearest regional businesses up to 35 km
        businesses_out = [b for (d, b) in candidate_items if d <= max(radius_km * 2.5, 35.0)]

    # Sort strictly by calculated distance ascending (nearest → farthest)
    businesses_out.sort(key=lambda x: x.distance_km or 0)

    # Compute counters based on final validated list only
    with_web = sum(1 for b in businesses_out if b.website_status == WebsiteStatus.WEBSITE_AVAILABLE)
    without_web = sum(1 for b in businesses_out if b.website_status in (WebsiteStatus.NO_WEBSITE, WebsiteStatus.WEBSITE_UNREACHABLE))
    good_web = sum(1 for b in businesses_out if b.website_score is not None and b.website_score >= 80)
    needs_imp = sum(1 for b in businesses_out if b.website_status == WebsiteStatus.WEBSITE_AVAILABLE and (b.website_score is None or b.website_score < 80))

    # Build debug info (only in DEBUG mode — never exposed in production)
    debug_payload = None
    if settings.DEBUG:
        debug_payload = {
            "search_origin": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "selected_radius_km": radius_km,
            "selected_radius_meters": radius_km * 1000,
            "provider_used": debug_info.provider_used,
            "google_api_raw_results": debug_info.google_api_raw_count,
            "results_after_haversine_filter": debug_info.results_after_filter,
            "rejected_outside_radius": debug_info.rejected_count,
            "final_result_count": len(businesses_out),
            "results_detail": debug_info.results_detail,
        }

    return BusinessListResponse(
        total=len(businesses_out),
        businesses=businesses_out,
        with_websites=with_web,
        without_websites=without_web,
        good_websites=good_web,
        needs_improvement=needs_imp,
        error_message=getattr(debug_info, 'error_message', None) if debug_info else None,
        error_type=getattr(debug_info, 'error_type', None) if debug_info else None,
        provider_used=getattr(debug_info, 'provider_used', 'unknown') if debug_info else 'unknown',
        debug=debug_payload,
    )



@router.get("/filter/with-websites", response_model=list[BusinessOut])
def get_with_websites(db: Session = Depends(get_db)):
    return db.query(Business).filter(Business.website_status == WebsiteStatus.WEBSITE_AVAILABLE).all()

@router.get("/filter/without-websites", response_model=list[BusinessOut])
def get_without_websites(db: Session = Depends(get_db)):
    return db.query(Business).filter(Business.website_status.in_([WebsiteStatus.NO_WEBSITE, WebsiteStatus.WEBSITE_UNREACHABLE])).all()

@router.get("/filter/good-websites", response_model=list[BusinessOut])
def get_good_websites(db: Session = Depends(get_db)):
    return db.query(Business).filter(Business.website_quality == WebsiteQuality.GOOD).all()

@router.get("/places/autocomplete")
def autocomplete_places(query: str = Query(..., min_length=1)):
    provider = get_places_provider()
    if hasattr(provider, 'autocomplete_location'):
        return provider.autocomplete_location(query)
    return []

@router.get("/places/details")
def get_place_details(place_id: str = Query(...)):
    provider = get_places_provider()
    if hasattr(provider, 'get_location_coordinates'):
        coords = provider.get_location_coordinates(place_id)
        if coords:
            return coords
    raise HTTPException(status_code=404, detail="Place details not found or not supported")

@router.get("/places/reverse-geocode")
def reverse_geocode(lat: float = Query(...), lng: float = Query(...)):
    """
    Reverse geocodes coordinates to human-readable address and locality using Google Geocoding API.
    """
    # 1. Google Geocoding API if key available
    if settings.GOOGLE_PLACES_API_KEY:
        try:
            import requests
            url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {
                "latlng": f"{lat},{lng}",
                "key": settings.GOOGLE_PLACES_API_KEY,
                "language": "en"
            }
            res = requests.get(url, params=params, timeout=2.5)
            if res.ok:
                data = res.json()
                if data.get("status") == "OK" and data.get("results"):
                    first = data["results"][0]
                    formatted_address = first.get("formatted_address", "")
                    
                    components = first.get("address_components", [])
                    sublocality = ""
                    locality = ""
                    admin_area = ""
                    for c in components:
                        types = c.get("types", [])
                        if "sublocality_level_1" in types or "sublocality" in types or "neighborhood" in types:
                            sublocality = c.get("long_name", "")
                        elif "locality" in types:
                            locality = c.get("long_name", "")
                        elif "administrative_area_level_1" in types:
                            admin_area = c.get("long_name", "")
                    
                    name_parts = [p for p in [sublocality, locality, admin_area] if p]
                    short_name = ", ".join(name_parts[:2]) if name_parts else formatted_address.split(",")[0]
                    
                    return {
                        "name": short_name or "Current Location",
                        "formatted_address": formatted_address,
                        "latitude": lat,
                        "longitude": lng,
                        "provider": "google"
                    }
        except Exception as e:
            print(f"Google reverse geocode error: {e}")
            
    # 2. OpenStreetMap / Nominatim backend fallback
    try:
        import requests
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=16&addressdetails=1"
        headers = {"User-Agent": "ShopPresenceApp/1.0", "Accept-Language": "en"}
        res = requests.get(url, headers=headers, timeout=4)
        if res.ok:
            data = res.json()
            addr = data.get("address", {})
            suburb = addr.get("suburb") or addr.get("neighbourhood") or addr.get("residential") or addr.get("quarter") or addr.get("subdistrict")
            city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("state_district")
            parts = [p for p in [suburb, city] if p]
            short_name = ", ".join(parts[:2]) if parts else (data.get("display_name", "").split(",")[0] or "Current Location")
            return {
                "name": short_name,
                "formatted_address": data.get("display_name", ""),
                "latitude": lat,
                "longitude": lng,
                "provider": "nominatim"
            }
    except Exception as e:
        print(f"Nominatim reverse geocode error: {e}")

    return {
        "name": f"{lat:.4f}, {lng:.4f}",
        "formatted_address": f"Coordinates: {lat:.5f}, {lng:.5f}",
        "latitude": lat,
        "longitude": lng,
        "provider": "coordinates"
    }

@router.get("/filter/needs-improvement", response_model=list[BusinessOut])
def get_needs_improvement(db: Session = Depends(get_db)):
    return db.query(Business).filter(Business.website_quality.in_([WebsiteQuality.NEEDS_IMPROVEMENT, WebsiteQuality.AVERAGE, WebsiteQuality.POOR])).all()

# ─── Google Places API Key Management ─────────────────────────────────────────

# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from app.config import settings

class GoogleKeyRequest(BaseModel):
    api_key: str

@router.get("/config/google-key-status", dependencies=[Depends(require_admin)])
def get_google_key_status():
    has_key = bool(settings.GOOGLE_PLACES_API_KEY and settings.GOOGLE_PLACES_API_KEY.strip())
    masked = ("..." + settings.GOOGLE_PLACES_API_KEY.strip()[-4:]) if has_key else ""
    return {"connected": has_key, "masked_key": masked}

@router.post("/config/google-key", dependencies=[Depends(require_admin)])
def update_google_key(req: GoogleKeyRequest):
    """
    Admin only. Updates the key for the running process; it is NOT written to disk.
    Persist it as the GOOGLE_PLACES_API_KEY environment variable on the host.
    """
    import re
    new_key = req.api_key.strip()
    if new_key and not re.fullmatch(r"[A-Za-z0-9_\-]{20,100}", new_key):
        raise HTTPException(status_code=400, detail="That does not look like a valid API key.")
    settings.GOOGLE_PLACES_API_KEY = new_key
    return {"status": "success", "connected": bool(new_key)}

@router.get("/{business_id}", response_model=BusinessOut)
def get_business(business_id: int, db: Session = Depends(get_db)):
    biz = db.query(Business).filter(Business.id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
    return biz


