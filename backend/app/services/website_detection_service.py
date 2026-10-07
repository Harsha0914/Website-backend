# pyrefly: ignore [missing-import]
import httpx
from urllib.parse import urlparse
from typing import Tuple
from app.models.business import WebsiteStatus
from app.config import settings
from app.utils.net_safety import SafeClient, UnsafeURL

# Domains to treat as social media or aggregator platforms (not official dedicated websites)
SOCIAL_OR_DIRECTORY_DOMAINS = {
    "facebook.com", "fb.com", "m.facebook.com",
    "instagram.com", "instagr.am",
    "twitter.com", "x.com",
    "youtube.com", "youtu.be",
    "linkedin.com",
    "tiktok.com",
    "pinterest.com",
    "google.com", "maps.google.com", "business.google.com",
    "yelp.com", "justdial.com", "yellowpages.com"
}

# Known brand and chain commercial website mappings
BRAND_DOMAINS = {
    "cult.fit": "https://www.cult.fit",
    "cult fit": "https://www.cult.fit",
    "anytime fitness": "https://www.anytimefitness.co.in",
    "gold's gym": "https://goldsgym.in",
    "golds gym": "https://goldsgym.in",
    "snap fitness": "https://www.snapfitness.com",
    "f45": "https://f45training.com",
    "slam fitness": "https://slamfitness.com",
    "talwalkars": "https://talwalkars.net",
    "naturals": "https://naturals.in",
    "jawed habib": "https://jawedhabib.com",
    "geetanjali": "https://geetanjalisalon.com",
    "toni & guy": "https://toniandguy.com",
    "green trends": "https://mygreentrends.in",
    "enrich": "https://enrichsalon.com",
    "vlcc": "https://www.vlcc.com",
    "apollo pharmacy": "https://www.apollopharmacy.in",
    "medplus": "https://www.medplusmart.com",
    "netmeds": "https://www.netmeds.com",
    "1mg": "https://www.1mg.com",
    "wellness forever": "https://wellnessforever.com",
    "ratnadeep": "https://www.ratnadeep.com",
    "vijetha": "https://vijethasupermarkets.com",
    "dmart": "https://www.dmart.in",
    "d-mart": "https://www.dmart.in",
    "more supermarket": "https://moreretail.in",
    "more retail": "https://moreretail.in",
    "reliance smart": "https://www.reliancesmart.in",
    "reliance fresh": "https://www.reliancesmart.in",
    "reliance digital": "https://www.reliancedigital.in",
    "croma": "https://www.croma.com",
    "poorvika": "https://www.poorvika.com",
    "lot mobiles": "https://lotmobiles.com",
    "sangeetha": "https://sangeethamobiles.com",
    "spencer's": "https://www.spencers.in",
    "spencers": "https://www.spencers.in",
    "nature's basket": "https://www.naturesbasket.co.in",
    "karachi bakery": "https://karachibakery.com",
    "pista house": "https://www.pistahouse.in",
    "country oven": "https://www.countryoven.com",
    "almond house": "https://almondhouse.com",
    "ferns n petals": "https://www.fnp.com",
    "bakingo": "https://www.bakingo.com",
    "rameshwaram cafe": "https://therameshwaramcafe.org",
    "paradise biryani": "https://paradisefoodcourt.in",
    "bawarchi": "https://bawarchihyderabad.com",
    "chutneys": "https://chutneys.co.in",
    "domino's": "https://www.dominos.co.in",
    "dominos": "https://www.dominos.co.in",
    "pizza hut": "https://www.pizzahut.co.in",
    "kfc": "https://online.kfc.co.in",
    "mcdonald's": "https://mcdelivery.co.in",
    "mcdonalds": "https://mcdelivery.co.in",
    "burger king": "https://www.burgerking.in",
    "subway": "https://www.subway.com",
    "starbucks": "https://www.starbucks.in",
    "cafe coffee day": "https://www.cafecoffeeday.com",
    "third wave coffee": "https://www.thirdwavecoffee.in",
    "barbeque nation": "https://www.barbequenation.com",
    "haldiram": "https://www.haldirams.com",
    "bikanervala": "https://bikanervala.com",
    "shree mithai": "https://shreemithai.com",
    "zudio": "https://www.zudio.com",
    "westside": "https://www.westside.com",
    "pantaloons": "https://www.pantaloons.com",
    "max fashion": "https://www.maxfashion.in",
    "trends": "https://www.reliancetrends.com",
    "decathlon": "https://www.decathlon.in",
    "lenskart": "https://www.lenskart.com",
    "titan eyeplus": "https://www.titaneyeplus.com",
    "tanishq": "https://www.tanishq.co.in",
    "malabar gold": "https://www.malabargoldanddiamonds.com",
    "kalyan jewellers": "https://www.kalyanjewellers.net",
    "lalitha jewellery": "https://lalithaajewellery.com",
    "joyalukkas": "https://www.joyalukkas.in",
    "fabindia": "https://www.fabindia.com",
    "manyavar": "https://www.manyavar.com",
    "bata": "https://www.bata.in",
    "woodland": "https://www.woodlandworldwide.com",
    "metro shoes": "https://www.metroshoes.net",
}

def discover_brand_website(name: str | None) -> str | None:
    """Matches a business name against known brand/chain official website domains."""
    if not name or not isinstance(name, str):
        return None
    name_clean = name.lower().strip()
    for brand_key, url in BRAND_DOMAINS.items():
        if brand_key in name_clean:
            return url
    return None

def is_social_or_directory(url: str) -> bool:
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return any(netloc == d or netloc.endswith("." + d) for d in SOCIAL_OR_DIRECTORY_DOMAINS)
    except Exception:
        return False

def sanitize_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url

async def detect_website(raw_url: str | None) -> Tuple[WebsiteStatus, str | None, bool]:
    """
    Checks URL validity, reachability, and HTTPS status.
    Returns: (WebsiteStatus, final_url, https_enabled)
    """
    if not raw_url or not raw_url.strip():
        return WebsiteStatus.NO_WEBSITE, None, False

    cleaned_url = sanitize_url(raw_url)

    if is_social_or_directory(cleaned_url):
        return WebsiteStatus.NO_WEBSITE, None, False

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with SafeClient(
            timeout=settings.WEBSITE_CHECK_TIMEOUT_SECONDS,
            verify=False  # Allow self-signed or testing certs without throwing hard exception
        ) as client:
            response = await client.get(cleaned_url, headers=headers)
            final_url = str(response.url)
            https_enabled = final_url.startswith("https://")

            if 200 <= response.status_code < 400:
                return WebsiteStatus.WEBSITE_AVAILABLE, final_url, https_enabled
            elif response.status_code in (401, 403):
                # Site exists but blocked crawler (e.g. Cloudflare / WAF)
                return WebsiteStatus.WEBSITE_AVAILABLE, final_url, https_enabled
            else:
                return WebsiteStatus.WEBSITE_UNREACHABLE, final_url, https_enabled

    except UnsafeURL:
        # internal / non-public targets are never fetched and never count as a real website
        return WebsiteStatus.WEBSITE_UNREACHABLE, None, False
    except httpx.RequestError:
        # Try fallback to http if https failed
        if cleaned_url.startswith("https://"):
            http_fallback = "http://" + cleaned_url[8:]
            try:
                async with SafeClient(
                            timeout=settings.WEBSITE_CHECK_TIMEOUT_SECONDS
                ) as client:
                    resp = await client.get(http_fallback, headers=headers)
                    if 200 <= resp.status_code < 400 or resp.status_code in (401, 403):
                        return WebsiteStatus.WEBSITE_AVAILABLE, str(resp.url), False
            except Exception:
                pass

        return WebsiteStatus.WEBSITE_UNREACHABLE, cleaned_url, False
    except Exception:
        return WebsiteStatus.WEBSITE_UNKNOWN, cleaned_url, False
