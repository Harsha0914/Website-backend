# pyrefly: ignore [missing-import]
import httpx
import re
# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup
from typing import Dict, Any, Tuple
from app.models.business import WebsiteQuality
from app.config import settings
from app.utils.net_safety import SafeClient

def calculate_quality_score(metrics: Dict[str, Any]) -> Tuple[int, WebsiteQuality]:
    """
    Quality score breakdown (Total 100 points):
    - Reachable: 15
    - HTTPS enabled: 15
    - Mobile Viewport: 10
    - Title tag: 10
    - Meta description: 10
    - Contact Info section/page: 10
    - Phone number detected: 8
    - Email address detected: 8
    - Navigation menu: 7
    - Social links: 4
    - Open Graph tags: 3
    """
    score = 0
    if metrics.get("is_reachable"): score += 15
    if metrics.get("https_enabled"): score += 15
    if metrics.get("mobile_viewport"): score += 10
    if metrics.get("has_title"): score += 10
    if metrics.get("has_meta_description"): score += 10
    if metrics.get("has_contact_info"): score += 10
    if metrics.get("has_phone"): score += 8
    if metrics.get("has_email"): score += 8
    if metrics.get("has_navigation"): score += 7
    if metrics.get("has_social_links"): score += 4
    if metrics.get("has_open_graph"): score += 3

    if score >= 80:
        quality = WebsiteQuality.GOOD
    elif score >= 60:
        quality = WebsiteQuality.AVERAGE
    elif score >= 40:
        quality = WebsiteQuality.NEEDS_IMPROVEMENT
    else:
        quality = WebsiteQuality.POOR

    return score, quality

async def analyze_website(url: str) -> Dict[str, Any]:
    if not url:
        return {
            "url": None,
            "is_reachable": False,
            "https_enabled": False,
            "final_url": None,
            "http_status_code": None,
            "mobile_viewport": False,
            "has_title": False,
            "has_meta_description": False,
            "has_open_graph": False,
            "has_contact_info": False,
            "has_phone": False,
            "has_email": False,
            "has_social_links": False,
            "has_navigation": False,
            "score": 0,
            "quality": WebsiteQuality.POOR,
            "analysis_details": {"error": "No URL provided"}
        }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with SafeClient(
            timeout=settings.WEBSITE_CHECK_TIMEOUT_SECONDS,
            verify=False
        ) as client:
            resp = await client.get(url, headers=headers)
            final_url = str(resp.url)
            https_enabled = final_url.startswith("https://")
            status_code = resp.status_code
            is_reachable = 200 <= status_code < 400 or status_code in (401, 403)

            html = resp.text
            soup = BeautifulSoup(html, "html.parser")

            # 1. Viewport (Mobile Friendly)
            viewport_tag = soup.find("meta", attrs={"name": re.compile(r"viewport", re.I)})
            mobile_viewport = viewport_tag is not None

            # 2. Title
            title_tag = soup.find("title")
            has_title = bool(title_tag and title_tag.string and len(title_tag.string.strip()) > 2)

            # 3. Meta description
            desc_tag = soup.find("meta", attrs={"name": re.compile(r"description", re.I)})
            has_meta_desc = bool(desc_tag and desc_tag.get("content", "").strip())

            # 4. Open Graph
            og_tag = soup.find("meta", attrs={"property": re.compile(r"og:", re.I)})
            has_og = og_tag is not None

            # 5. Navigation
            nav_tag = soup.find(["nav", "header"]) or soup.find(class_=re.compile(r"nav|menu|navbar", re.I))
            has_nav = nav_tag is not None

            # 6. Contact section/links
            contact_links = soup.find_all("a", href=re.compile(r"contact|about|location", re.I))
            contact_text = soup.find_all(string=re.compile(r"contact us|get in touch|address|hours", re.I))
            has_contact_info = len(contact_links) > 0 or len(contact_text) > 0

            # 7. Phone number detection (href tel: or regex)
            tel_links = soup.find_all("a", href=re.compile(r"^tel:", re.I))
            phone_pattern = re.compile(r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")
            has_phone = len(tel_links) > 0 or bool(phone_pattern.search(html))

            # 8. Email detection (href mailto: or regex)
            mailto_links = soup.find_all("a", href=re.compile(r"^mailto:", re.I))
            email_pattern = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
            has_email = len(mailto_links) > 0 or bool(email_pattern.search(html))

            # 9. Social links
            social_links = soup.find_all("a", href=re.compile(r"facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|linkedin\.com", re.I))
            has_social = len(social_links) > 0

            metrics = {
                "is_reachable": is_reachable,
                "https_enabled": https_enabled,
                "mobile_viewport": mobile_viewport,
                "has_title": has_title,
                "has_meta_description": has_meta_desc,
                "has_open_graph": has_og,
                "has_contact_info": has_contact_info,
                "has_phone": has_phone,
                "has_email": has_email,
                "has_social_links": has_social,
                "has_navigation": has_nav,
            }

            score, quality = calculate_quality_score(metrics)

            details = {
                "title": title_tag.string.strip() if (title_tag and title_tag.string) else None,
                "status_code": status_code,
                "https": https_enabled,
                "recommendations": []
            }

            if not https_enabled:
                details["recommendations"].append("Install an SSL certificate to secure visitor data and improve SEO rankings.")
            if not mobile_viewport:
                details["recommendations"].append("Add a responsive viewport meta tag for mobile device compatibility.")
            if not has_meta_desc:
                details["recommendations"].append("Add a meta description tag to improve search engine click-through rates.")
            if not has_phone:
                details["recommendations"].append("Add a visible phone number or click-to-call link for easy customer contact.")
            if not has_email:
                details["recommendations"].append("Add a business contact email address.")
            if not has_social:
                details["recommendations"].append("Link official social media profiles (Facebook, Instagram) to boost brand trust.")
            if not has_og:
                details["recommendations"].append("Add Open Graph meta tags so links look rich when shared on WhatsApp and social platforms.")

            return {
                "url": url,
                "is_reachable": is_reachable,
                "https_enabled": https_enabled,
                "final_url": final_url,
                "http_status_code": status_code,
                "mobile_viewport": mobile_viewport,
                "has_title": has_title,
                "has_meta_description": has_meta_desc,
                "has_open_graph": has_og,
                "has_contact_info": has_contact_info,
                "has_phone": has_phone,
                "has_email": has_email,
                "has_social_links": has_social,
                "has_navigation": has_nav,
                "score": score,
                "quality": quality,
                "analysis_details": details
            }

    except Exception as e:
        metrics = {
            "is_reachable": False,
            "https_enabled": False,
            "mobile_viewport": False,
            "has_title": False,
            "has_meta_description": False,
            "has_open_graph": False,
            "has_contact_info": False,
            "has_phone": False,
            "has_email": False,
            "has_social_links": False,
            "has_navigation": False,
        }
        score, quality = calculate_quality_score(metrics)
        return {
            "url": url,
            "is_reachable": False,
            "https_enabled": False,
            "final_url": url,
            "http_status_code": None,
            "mobile_viewport": False,
            "has_title": False,
            "has_meta_description": False,
            "has_open_graph": False,
            "has_contact_info": False,
            "has_phone": False,
            "has_email": False,
            "has_social_links": False,
            "has_navigation": False,
            "score": score,
            "quality": quality,
            "analysis_details": {"error": f"Failed to analyze website: {str(e)}"}
        }
