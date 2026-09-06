#!/usr/bin/env python3
"""
Romania Deep Phase 2 — postcode recovery + Stay Fit estate rebuild.

Does NOT modify src/data/centers.json.
Preserves Phase 1 READY rows / stable ro_* IDs where the physical club is unchanged.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROMANIA_POSTAL_RE,
    ROOT,
    base_row,
    classify_row,
    clean_text,
    dedupe_by_id,
    format_ro_postal,
    haversine,
    in_romania,
    make_id,
    nominatim_geocode,
    norm_addr,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/romania"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, PHASE2, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

PRODUCTION_TOTAL = 11063
PROD_SHA_EXPECTED = "365a1bd25c1fad250172099a0430d9475899859c11a8e07e2ae05ea471dba75a"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
CTX = ssl.create_default_context()

CITY_CANON = {
    "bucuresti": "București",
    "bucurești": "București",
    "cluj": "Cluj-Napoca",
    "cluj-napoca": "Cluj-Napoca",
    "cluj napoca": "Cluj-Napoca",
    "timisoara": "Timișoara",
    "timișoara": "Timișoara",
    "iasi": "Iași",
    "iași": "Iași",
    "brasov": "Brașov",
    "brașov": "Brașov",
    "constanta": "Constanța",
    "constanța": "Constanța",
    "craiova": "Craiova",
    "galati": "Galați",
    "galați": "Galați",
    "pitesti": "Pitești",
    "pitești": "Pitești",
    "ploiesti": "Ploiești",
    "ploiești": "Ploiești",
    "sibiu": "Sibiu",
    "oradea": "Oradea",
    "arad": "Arad",
    "bacau": "Bacău",
    "bacău": "Bacău",
    "baia mare": "Baia Mare",
    "buzau": "Buzău",
    "buzău": "Buzău",
    "targu mures": "Târgu Mureș",
    "târgu mureș": "Târgu Mureș",
    "otopeni": "Otopeni",
    "voluntari": "Voluntari",
    "chiajna": "Chiajna",
    "chitila": "Chitila",
    "balotesti": "Balotești",
    "balotești": "Balotești",
    "floresti": "Florești",
    "florești": "Florești",
    "alba iulia": "Alba Iulia",
    "alba-iulia": "Alba Iulia",
    "braila": "Brăila",
    "brăila": "Brăila",
    "vaslui": "Vaslui",
    "targoviste": "Târgoviște",
    "târgoviște": "Târgoviște",
    "targu-jiu": "Târgu Jiu",
    "târgu jiu": "Târgu Jiu",
    "valcea": "Râmnicu Vâlcea",
    "râmnicu vâlcea": "Râmnicu Vâlcea",
    "ramnicu valcea": "Râmnicu Vâlcea",
    "piatra-neamt": "Piatra Neamț",
    "piatra neamt": "Piatra Neamț",
    "piatra neamț": "Piatra Neamț",
    "satu mare": "Satu Mare",
    "suceava": "Suceava",
    "crevedia": "Crevedia",
    "stefanestii de jos": "Ștefăneștii de Jos",
    "ștefăneștii de jos": "Ștefăneștii de Jos",
    "mosnita": "Moșnița Nouă",
    "moșnița": "Moșnița Nouă",
    "giroc": "Giroc",
    "popesti-leordeni": "Popești-Leordeni",
    "popești-leordeni": "Popești-Leordeni",
}

MAJOR_CITIES = [
    "București",
    "Cluj-Napoca",
    "Timișoara",
    "Iași",
    "Constanța",
    "Brașov",
    "Craiova",
    "Galați",
    "Ploiești",
    "Oradea",
    "Sibiu",
    "Arad",
    "Pitești",
    "Râmnicu Vâlcea",
    "Târgu Mureș",
    "Baia Mare",
    "Bacău",
    "Buzău",
    "Satu Mare",
    "Suceava",
]

SKIP_PAGE_SLUGS = {
    "cluburi",
    "contact",
    "blog",
    "cariere",
    "servicii",
    "fitness",
    "cycling",
    "black",
    "plus",
    "corporate",
    "personal-trainer",
    "intrebari-frecvente",
    "viitoare-centre",
    "parteneriate",
    "politica-de-cookie",
    "politica-de-confidentialitate",
    "termeni-si-conditii",
    "feed",
    "one-day-pass",
    "active-superactive",
    "alege-abonament",
    "retea-nationala",
    "retea-regionala",
    "iron-hub",
    "reformer",
    "functional-training",
    "kids",
    "cardio",
    "clase-de-grup",
    "concurs-nibiru",
    "wp-content",
    "wp-json",
}


def production_sha() -> str:
    return hashlib.sha256((ROOT / "src/data/centers.json").read_bytes()).hexdigest()


def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def curl_fetch(url: str, out_path: Path | None = None, timeout: int = 45) -> str:
    cmd = [
        "curl",
        "-fsSL",
        "-A",
        UA,
        "-L",
        "--max-time",
        str(timeout),
        url,
    ]
    try:
        body = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        text = body.decode("utf-8", "replace")
        if out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(text)
        return text
    except Exception as e:
        return f"ERR:{type(e).__name__}:{e}"


def canonical_city(raw: str) -> str:
    s = clean_text(raw or "")
    key = s.lower().replace("-", " ").strip()
    if key in CITY_CANON:
        return CITY_CANON[key]
    key2 = key.replace(" ", "-")
    if key2 in CITY_CANON:
        return CITY_CANON[key2]
    return s


def reverse_geocode(cache: dict, lat: float, lng: float) -> dict | None:
    key = f"rev|{lat:.6f}|{lng:.6f}"
    if key in cache:
        return cache[key]
    params = urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
            "zoom": 18,
        }
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GymlyRomaniaPhase2/1.0 (catalog research; contact: gymly)",
            "Accept": "application/json",
        },
    )
    time.sleep(1.1)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]
    addr = data.get("address") or {}
    pc = format_ro_postal(addr.get("postcode") or "")
    cache[key] = {
        "lat": float(data.get("lat") or lat),
        "lng": float(data.get("lon") or lng),
        "postcode": pc,
        "display_name": data.get("display_name"),
        "road": addr.get("road") or "",
        "city": addr.get("city")
        or addr.get("town")
        or addr.get("municipality")
        or addr.get("village")
        or "",
        "country_code": (addr.get("country_code") or "").lower(),
    }
    return cache[key]


def recover_postal_for_row(r: dict, cache: dict, meta: dict) -> bool:
    """Try to fill missing 6-digit postcode. Returns True if recovered."""
    if ROMANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
        return False
    lat, lng = r.get("lat"), r.get("lng")
    address = r.get("address") or ""
    city = r.get("city") or ""

    # 1) Reverse from official coords
    if (
        isinstance(lat, (int, float))
        and isinstance(lng, (int, float))
        and math.isfinite(lat)
        and math.isfinite(lng)
        and in_romania(float(lat), float(lng))
    ):
        hit = reverse_geocode(cache, float(lat), float(lng))
        if hit and hit.get("postcode") and hit.get("country_code") in ("", "ro"):
            pc = hit["postcode"]
            if ROMANIA_POSTAL_RE.match(pc):
                road = norm_addr(hit.get("road") or "")
                addr_n = norm_addr(address)
                tokens = [t for t in road.split() if len(t) > 3] if road and addr_n else []
                road_ok = (not tokens) or any(t in addr_n for t in tokens)
                city_hit = canonical_city(hit.get("city") or "")
                city_ok = (
                    not city
                    or not city_hit
                    or city_hit.lower() == canonical_city(city).lower()
                    or canonical_city(city).lower()
                    in (hit.get("display_name") or "").lower()
                )
                # Official coords + RO postcode: accept when road OR city agrees (malls often differ)
                if road_ok or city_ok:
                    r["postal_code"] = pc
                    r["postcode_source"] = "NOMINATIM_REVERSE_OFFICIAL_COORDS"
                    r["notes"] = (r.get("notes") or "") + "; postal_from_reverse"
                    meta.setdefault("recovered_postcodes", []).append(
                        {"id": r["id"], "pc": pc, "src": "reverse"}
                    )
                    return True
                meta.setdefault("reverse_rejected", []).append(
                    {
                        "id": r["id"],
                        "reason": "road_and_city_mismatch",
                        "road": hit.get("road"),
                        "pc": pc,
                    }
                )

    # 2) Strict forward geocode
    if address and city:
        q = f"{address}, {city}, Romania"
        hit = nominatim_geocode(q, "ro", cache, sleep=1.1)
        if hit and hit.get("country_code", "ro") in ("ro", ""):
            pc = format_ro_postal(hit.get("postcode") or "")
            if ROMANIA_POSTAL_RE.match(pc):
                r["postal_code"] = pc
                r["postcode_source"] = "STRICT_ADDRESS_GEOCODE"
                r["notes"] = (r.get("notes") or "") + "; postal_from_forward_geocode"
                if r.get("lat") is None and hit.get("lat") is not None:
                    plat, plng = float(hit["lat"]), float(hit["lng"])
                    if in_romania(plat, plng):
                        r["lat"], r["lng"] = plat, plng
                        r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                meta.setdefault("recovered_postcodes", []).append(
                    {"id": r["id"], "pc": pc, "src": "forward"}
                )
                return True
    return False


# ---------------------------------------------------------------------------
# World Class refresh from API + postcode recovery
# ---------------------------------------------------------------------------

def discover_world_class(meta: dict) -> list[dict]:
    body = curl_fetch(
        "https://www.worldclass.ro/wp-json/clubs/v1/club",
        SCRAPES / "worldclass_clubs_api_phase2.json",
    )
    data = json.loads(body) if not body.startswith("ERR") else load_json(
        SCRAPES / "worldclass_clubs_api.json", {}
    )
    clubs = data.get("clubs") or []
    rows = []
    for club in clubs:
        if club.get("post_status") != "publish":
            continue
        acf = club.get("acf") or {}
        loc = acf.get("locatie") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        postal = format_ro_postal(loc.get("post_code") or "")
        address = clean_text(acf.get("adresa") or loc.get("address") or "")
        city_raw = acf.get("oras") or loc.get("city") or ""
        city = canonical_city(city_raw)
        # Prefer official locality when Ilfov/metro
        loc_city = loc.get("city") or ""
        if loc_city and loc_city.lower() not in ("bucuresti", "bucurești", "bucharest"):
            if "ilfov" in str(loc.get("state", "")).lower() or loc_city.lower() in CITY_CANON:
                city = canonical_city(loc_city)
        name = clean_text(club.get("post_title") or "World Class")
        if not name.lower().startswith("world class"):
            name = f"World Class {name}"
        r = base_row(
            prefix="ro_",
            country="Romania",
            brand="World Class",
            name=name,
            address=address,
            postal_code=postal,
            city=city,
            source_url=club.get("link") or "https://www.worldclass.ro/harta-cluburi/",
            lat=lat_f,
            lng=lng_f,
            coord_source="OFFICIAL_API" if lat_f and lng_f else None,
            notes=f"tip_club={acf.get('tip_club')}; wc_api_p2",
            chain_key="world_class",
        )
        if postal:
            r["postcode_source"] = "OFFICIAL_API"
        rows.append(r)
    meta["world_class_api_count"] = len(rows)
    return rows


# ---------------------------------------------------------------------------
# 18GYM
# ---------------------------------------------------------------------------

def parse_coming_soon_page(html: str) -> bool | None:
    """True if coming soon, False if open, None if unclear."""
    if html.startswith("ERR"):
        return None
    low = html.lower()
    # strong coming-soon signals
    if re.search(
        r"în\s*curând|in\s*curand|coming\s*soon|presale|pre[-\s]?sale|deschidere\s+în|lansare\s+în",
        low,
    ):
        # exclude footer noise: if page also has clear open hours schedule, may still be open
        if re.search(r"program\s*(de\s*)?func[țt]ionare|orar\s*club|luni\s*[-–]\s*vineri\s*:?\s*\d", low):
            # if "în curând" appears near title/hero only
            pass
        return True
    # open hours with real times
    if re.search(r"L-V:\s*\d{1,2}|Luni.*?(\d{1,2}:\d{2})", html):
        return False
    return None


def discover_18gym(meta: dict) -> list[dict]:
    body = curl_fetch(
        "https://18gym.ro/wp-admin/admin-ajax.php?action=asl_load_stores&nonce=0",
        SCRAPES / "18gym_stores_phase2.json",
    )
    stores = json.loads(body) if not body.startswith("ERR") else load_json(
        SCRAPES / "18gym_stores.json", []
    )
    if not isinstance(stores, list):
        stores = []
    rows = []
    coming_recheck = []
    for s in stores:
        title = clean_text(s.get("title") or "18GYM")
        street = clean_text(s.get("street") or "")
        city = canonical_city(s.get("city") or "")
        lat = s.get("lat")
        lng = s.get("lng")
        try:
            lat_f = float(lat) if lat else None
            lng_f = float(lng) if lng else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        postal = format_ro_postal(s.get("postal_code") or "")
        desc = s.get("description") or ""
        website = s.get("website") or "https://18gym.ro/locatii/"
        # Phase 1 heuristic
        coming = bool(re.search(r"L-V:\s*-|program:\s*-|În curând|in curand", desc, re.I))
        # Recheck known/suspected coming-soon pages
        if coming or any(
            k in website
            for k in ("lujerului", "otopeni", "edgar-quinet", "cluj-era", "cluj-via", "/era/", "/via/")
        ):
            slug = website.rstrip("/").split("/")[-1]
            html = curl_fetch(website, PAGES / f"18gym_p2_{slug}.html")
            time.sleep(0.35)
            status = parse_coming_soon_page(html)
            coming_recheck.append(
                {"name": title, "url": website, "page_status": status, "desc_flag": coming}
            )
            if status is True:
                coming = True
            elif status is False:
                coming = False
            # else keep desc_flag
        r = base_row(
            prefix="ro_",
            country="Romania",
            brand="18GYM",
            name=title if title.lower().startswith("18") else f"18GYM {title}",
            address=street,
            postal_code=postal,
            city=city,
            source_url=website,
            lat=lat_f,
            lng=lng_f,
            coord_source="OFFICIAL_MAP_PIN" if lat_f and lng_f else None,
            coming=coming,
            notes="18gym_asl_phase2",
            chain_key="18gym",
        )
        if postal:
            r["postcode_source"] = "OFFICIAL_MAP_PIN"
        rows.append(r)
    meta["18gym_store_count"] = len(rows)
    meta["18gym_coming_recheck"] = coming_recheck
    return rows


# ---------------------------------------------------------------------------
# Stay Fit — rebuild from individual club pages
# ---------------------------------------------------------------------------

GMAPS_DIR_RE = re.compile(
    r"https?://(?:www\.)?google\.[^\"'\s]+/maps/dir//([^\"'\s]+)",
    re.I,
)
GMAPS_Q_RE = re.compile(
    r"https?://maps\.google\.com/maps\?q=([^\"'&]+)",
    re.I,
)
GMAPS_AT_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")
GMAPS_2D_RE = re.compile(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)|!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)")


def parse_stayfit_maps(html: str) -> dict:
    """Extract address, postcode, lat, lng from Google Maps embeds on Stay Fit pages."""
    out: dict = {}
    # Prefer /maps/dir/ URLs with encoded address + postcode
    for m in GMAPS_DIR_RE.finditer(html):
        raw = urllib.parse.unquote(m.group(1).replace("+", " "))
        # strip path after @
        if "@" in raw:
            addr_part, rest = raw.split("@", 1)
            coords = GMAPS_AT_RE.search("@" + rest)
            if coords:
                out["lat"] = float(coords.group(1))
                out["lng"] = float(coords.group(2))
        else:
            addr_part = raw.split("/")[0]
        addr_part = addr_part.split("?")[0].strip()
        pc = format_ro_postal(addr_part)
        # postcode often at end: "..., București 011138"
        m_pc = re.search(r"\b(\d{6})\b\s*$", addr_part.strip())
        if m_pc:
            pc = m_pc.group(1)
            addr_part = addr_part[: m_pc.start()].strip(" ,")
        if addr_part and len(addr_part) > 8:
            out["address"] = clean_text(addr_part)
            if pc:
                out["postal_code"] = pc
                out["postcode_source"] = "OFFICIAL_MAP_PIN"
            out["coord_source"] = "OFFICIAL_MAP_PIN"
            # also try !1d!2d in full match string
            full = m.group(0)
            m2 = re.search(r"!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)", urllib.parse.unquote(full))
            if m2:
                # Google uses !1d lng !2d lat in some dir URLs
                out["lng"] = float(m2.group(1))
                out["lat"] = float(m2.group(2))
            m3 = re.search(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", urllib.parse.unquote(full))
            if m3:
                out["lng"] = float(m3.group(1))
                out["lat"] = float(m3.group(2))
            break
    if not out.get("address"):
        for m in GMAPS_Q_RE.finditer(html):
            q = urllib.parse.unquote(m.group(1).replace("+", " "))
            q = unescape(q.replace("&#038;", "&"))
            if len(q) > 8 and not q.lower().startswith("stay fit"):
                out["address"] = clean_text(q)
                break
            if "stay fit" in q.lower() and len(q) > 20:
                # named POI query — keep for geocode
                out["poi_query"] = clean_text(q)
    # coming soon
    if re.search(r"în\s*curând|in\s*curand|coming\s*soon|presale|viitor(?:ul)?\s+centru", html, re.I):
        # only if hero/title area suggests it
        if re.search(r"viitor|în curând|coming soon|presale", html[:8000], re.I):
            out["coming"] = True
    return out


def infer_city_from_url_and_address(url: str, address: str) -> str:
    parts = url.rstrip("/").split("/")
    city_slug = parts[3] if len(parts) > 3 else ""
    city = canonical_city(city_slug.replace("-", " "))
    # Override from address locality
    for pat, label in [
        (r"Sector\s+\d+", "București"),
        (r",\s*(Otopeni)\b", None),
        (r",\s*(Voluntari)\b", None),
        (r",\s*(Chitila)\b", None),
        (r",\s*(Balotești|Balotesti)\b", None),
        (r",\s*(Florești|Floresti)\b", None),
        (r",\s*(Crevedia)\b", None),
        (r",\s*(Popești-Leordeni|Popesti-Leordeni)\b", None),
        (r",\s*(Moșnița(?:\s+Nouă)?|Mosnita(?:\s+Noua)?)\b", None),
        (r",\s*(Giroc)\b", None),
    ]:
        m = re.search(pat, address or "", re.I)
        if m:
            if label:
                return label
            return canonical_city(m.group(1))
    return city


def discover_stay_fit(meta: dict) -> list[dict]:
    # Canonical estate from CPT
    api_body = curl_fetch(
        "https://stayfit.ro/wp-json/wp/v2/centru-sfg?per_page=100",
        SCRAPES / "stayfit_centru_sfg_api.json",
    )
    api_clubs = json.loads(api_body) if not api_body.startswith("ERR") else []
    meta["stayfit_cpt_count"] = len(api_clubs)

    # Club pages from sitemap
    sm = curl_fetch(
        "https://stayfit.ro/wp-sitemap-posts-page-1.xml",
        SCRAPES / "stayfit_pages_sitemap.xml",
    )
    locs = re.findall(r"<loc>([^<]+)</loc>", sm) if not sm.startswith("ERR") else []
    club_urls = []
    for u in locs:
        parts = u.rstrip("/").split("/")
        if len(parts) < 5:
            continue
        city_slug, club_slug = parts[3], parts[4]
        if city_slug in SKIP_PAGE_SLUGS or club_slug in SKIP_PAGE_SLUGS:
            continue
        if city_slug in {"wp-content", "wp-json", "category", "tag", "author", "centru-sfg"}:
            continue
        club_urls.append(u)
    # Deduplicate
    club_urls = list(dict.fromkeys(club_urls))
    meta["stayfit_club_page_urls"] = len(club_urls)

    rows = []
    for url in club_urls:
        slug = url.rstrip("/").replace("https://stayfit.ro/", "").replace("/", "_")
        html = curl_fetch(url, PAGES / f"stayfit_p2_{slug[:80]}.html")
        time.sleep(0.3)
        if html.startswith("ERR"):
            continue
        parsed = parse_stayfit_maps(html)
        # Title from H1
        h1 = re.search(
            r'<h1[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([^<]+)</h1>',
            html,
            re.I,
        )
        if not h1:
            h1 = re.search(r"<h1[^>]*>([^<]{5,80})</h1>", html, re.I)
        name = clean_text(h1.group(1) if h1 else url.rstrip("/").split("/")[-1].replace("-", " "))
        if not name.lower().startswith("stay fit"):
            name = f"Stay Fit Gym {name}"
        address = parsed.get("address") or ""
        # Fallback: maps q= or paragraph addresses
        if not address:
            addrs = re.findall(
                r"<p[^>]*>\s*((?:Str(?:ada|\.|eet)?|Bd\.?|Bulevard|Șos(?:eaua)?|Sos\.|Calea|Aleea)[^<]{8,200})</p>",
                html,
                re.I,
            )
            if addrs:
                address = clean_text(addrs[0])
        if not address and parsed.get("poi_query"):
            address = parsed["poi_query"]
        if not address or len(address) < 8:
            meta.setdefault("stayfit_no_address", []).append(url)
            continue
        city = infer_city_from_url_and_address(url, address)
        postal = parsed.get("postal_code") or format_ro_postal(address)
        lat = parsed.get("lat")
        lng = parsed.get("lng")
        # Sanity: reject coords far from Romania or obvious wrong-city pins
        if lat is not None and lng is not None:
            if not in_romania(float(lat), float(lng)):
                lat = lng = None
                parsed["coord_source"] = None
        coming = bool(parsed.get("coming"))
        # Future centres page cross-check
        if "viitor" in name.lower() or "coming" in name.lower():
            coming = True
        r = base_row(
            prefix="ro_",
            country="Romania",
            brand="Stay Fit Gym",
            name=name,
            address=address,
            postal_code=postal or "",
            city=city,
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source=parsed.get("coord_source") if lat else None,
            coming=coming,
            notes="stayfit_club_page_p2",
            chain_key="stay_fit",
        )
        if postal:
            r["postcode_source"] = parsed.get("postcode_source") or "OFFICIAL_MAP_PIN"
        rows.append(r)

    # Merge CPT titles not found on pages (edge)
    page_names = {norm_addr(r["name"]) for r in rows}
    for item in api_clubs:
        title = clean_text((item.get("title") or {}).get("rendered") or "")
        if not title:
            continue
        if norm_addr(title) in page_names:
            continue
        # try city page path from link
        link = item.get("link") or ""
        meta.setdefault("stayfit_cpt_only", []).append({"title": title, "link": link})

    meta["stayfit_discovered_pages"] = len(rows)
    return rows


# ---------------------------------------------------------------------------
# Secondary chains (light probe)
# ---------------------------------------------------------------------------

def probe_secondary(meta: dict) -> list[dict]:
    """Only add rows when multi-site conventional operator confirmed with concrete locations."""
    inventory = []
    rows: list[dict] = []

    probes = [
        ("One Fitness", "https://onefitness.ro/", "https://onefitness.ro/locatii/"),
        ("SAS Gym", "https://sasgym.ro/", "https://sasgym.ro/"),
        ("Downtown Fitness", "https://downtownfitness.ro/", "https://downtownfitness.ro/"),
        ("Anytime Fitness Romania", "https://www.anytimefitness.ro/", "https://www.anytimefitness.ro/"),
        ("Nextfit", "https://nextfit.ro/", "https://nextfit.ro/"),
        ("Burn Fitness", "https://burnfitness.ro/", "https://burnfitness.ro/"),
    ]
    for brand, home, loc in probes:
        html = curl_fetch(loc, PAGES / f"secondary_p2_{brand.lower().replace(' ', '_')}.html")
        time.sleep(0.4)
        ok = not html.startswith("ERR") and len(html) > 500
        # crude multi-site signal
        loc_hits = len(re.findall(r"loca[țt]i|cluburi|săli|sali|gym", html, re.I)) if ok else 0
        inventory.append(
            {
                "chain": brand,
                "url": loc,
                "reachable": ok,
                "loc_keyword_hits": loc_hits,
                "verdict": "NEEDS_REVIEW" if ok else "BLOCKED",
                "notes": "Phase 2 light probe — no READY import without structured multi-site extraction",
            }
        )
    # ESX remains excluded
    inventory.append(
        {
            "chain": "ESX",
            "url": "https://esx.ro/",
            "reachable": True,
            "physical_clubs": 0,
            "verdict": "EXCLUDED",
            "notes": "Membership aggregator — partner gyms not imported",
        }
    )
    meta["secondary_probes"] = inventory
    return rows


# ---------------------------------------------------------------------------
# ID preservation from Phase 1
# ---------------------------------------------------------------------------

def preserve_ids(new_rows: list[dict], phase1: list[dict]) -> tuple[list[dict], dict]:
    """Match Phase 1 rows by brand+norm address or brand+coords; keep stable IDs."""
    stats = {"preserved": 0, "new": 0, "phase1_ready_kept": 0}
    p1_by_key = {}
    p1_by_coord = {}
    for r in phase1:
        key = (
            (r.get("brand") or "").lower(),
            norm_addr(r.get("address") or ""),
            str(r.get("postal_code") or "").replace(" ", ""),
        )
        p1_by_key[key] = r
        if r.get("lat") is not None and r.get("lng") is not None:
            ck = (
                (r.get("brand") or "").lower(),
                round(float(r["lat"]), 5),
                round(float(r["lng"]), 5),
            )
            p1_by_coord[ck] = r

    out = []
    for r in new_rows:
        key = (
            (r.get("brand") or "").lower(),
            norm_addr(r.get("address") or ""),
            str(r.get("postal_code") or "").replace(" ", ""),
        )
        match = p1_by_key.get(key)
        if not match and r.get("lat") is not None:
            ck = (
                (r.get("brand") or "").lower(),
                round(float(r["lat"]), 5),
                round(float(r["lng"]), 5),
            )
            match = p1_by_coord.get(ck)
        # softer: brand + address only
        if not match:
            soft = (
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
            )
            for p in phase1:
                if (
                    (p.get("brand") or "").lower(),
                    norm_addr(p.get("address") or ""),
                ) == soft:
                    match = p
                    break
        if match:
            r["id"] = match["id"]
            stats["preserved"] += 1
            if match.get("import_category") == "READY_TO_IMPORT":
                stats["phase1_ready_kept"] += 1
                # Prefer Phase 1 READY fields if new lacks postcode/coords
                if not ROMANIA_POSTAL_RE.match(str(r.get("postal_code") or "")) and ROMANIA_POSTAL_RE.match(
                    str(match.get("postal_code") or "")
                ):
                    r["postal_code"] = match["postal_code"]
                    r["postcode_source"] = match.get("postcode_source") or "PHASE1_PRESERVED"
                if r.get("lat") is None and match.get("lat") is not None:
                    r["lat"] = match["lat"]
                    r["lng"] = match["lng"]
                    r["coord_source"] = match.get("coord_source")
        else:
            stats["new"] += 1
        out.append(r)
    return out, stats


def classify_all(rows: list[dict]) -> list[dict]:
    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY"):
            continue
        cat = classify_row(
            r,
            postal_re=ROMANIA_POSTAL_RE,
            in_country=in_romania,
            format_postal=format_ro_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Romania"
        r["is_active"] = not r.get("is_closed") and not r.get("is_coming_soon")
    return rows


def mark_duplicates(rows: list[dict]) -> list[dict]:
    by_addr: dict[str, dict] = {}
    for r in rows:
        if r.get("import_category") in ("CLOSED", "COMING_SOON", "LEGACY"):
            continue
        key = "|".join(
            [
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
                str(r.get("postal_code") or "").upper().replace(" ", ""),
            ]
        )
        if not norm_addr(r.get("address") or ""):
            continue
        if key not in by_addr:
            by_addr[key] = r
            continue
        existing = by_addr[key]

        def score(x):
            return (
                1 if ROMANIA_POSTAL_RE.match(str(x.get("postal_code") or "")) else 0,
                1 if x.get("lat") is not None else 0,
                len(str(x.get("name") or "")),
            )

        if score(r) > score(existing):
            existing["import_category"] = "DUPLICATE"
            existing["notes"] = (existing.get("notes") or "") + "; same_address_duplicate"
            by_addr[key] = r
        else:
            r["import_category"] = "DUPLICATE"
            r["notes"] = (r.get("notes") or "") + "; same_address_duplicate"

    by_coord: dict[tuple, list] = defaultdict(list)
    for r in rows:
        if r.get("lat") is None or r.get("import_category") in ("DUPLICATE", "CLOSED", "COMING_SOON"):
            continue
        key = (
            round(float(r["lat"]), 6),
            round(float(r["lng"]), 6),
            (r.get("brand") or "").lower(),
        )
        by_coord[key].append(r)
    for key, group in by_coord.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda x: 0 if x.get("import_category") == "READY_TO_IMPORT" else 1)
        for dup in group[1:]:
            if dup.get("import_category") == "READY_TO_IMPORT":
                dup["import_category"] = "DUPLICATE"
                dup["notes"] = (dup.get("notes") or "") + "; identical_coords_duplicate"
    return rows


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Romania_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Romania Discovered"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "postal_code",
        "city",
        "country",
        "lat",
        "lng",
        "import_category",
        "coord_source",
        "postcode_source",
        "source_url",
        "notes",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in sorted(
        rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
    ):
        ws.append([r.get(h, "") for h in headers])
    wb.save(path)


def chain_stats(rows: list[dict], brand: str, official: int) -> dict:
    subset = [r for r in rows if r.get("brand") == brand]
    ready = [r for r in subset if r.get("import_category") == "READY_TO_IMPORT"]
    coming = sum(1 for r in subset if r.get("import_category") == "COMING_SOON")
    closed = sum(1 for r in subset if r.get("import_category") == "CLOSED")
    unresolved = sum(
        1
        for r in subset
        if r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    )
    cov = round(100 * len(ready) / official, 1) if official else 0
    if cov >= 95:
        verdict = "COMPLETE"
    elif cov >= 85:
        verdict = "NEAR-COMPLETE"
    elif cov >= 50:
        verdict = "PARTIAL"
    else:
        verdict = "BLOCKED"
    return {
        "official_current": official,
        "discovered": len(subset),
        "ready": len(ready),
        "unresolved": unresolved,
        "coming_soon": coming,
        "closed": closed,
        "coverage_pct": cov,
        "verdict": verdict,
    }


def main() -> None:
    sha_before = production_sha()
    assert sha_before == PROD_SHA_EXPECTED, f"Unexpected production SHA {sha_before}"

    phase1 = load_json(OUT / "romania_centers_staging.json", [])
    phase1_ready = [
        r for r in phase1 if r.get("import_category") == "READY_TO_IMPORT"
    ]
    meta: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sha_before": sha_before,
        "phase1_staged": len(phase1),
        "phase1_ready": len(phase1_ready),
    }

    cache = load_json(OUT / "romania_geocode_cache.json", {})

    print("=== World Class ===")
    wc = discover_world_class(meta)
    print(f"  API clubs: {len(wc)}")

    print("=== 18GYM ===")
    g18 = discover_18gym(meta)
    print(f"  stores: {len(g18)}")

    print("=== Stay Fit ===")
    sf = discover_stay_fit(meta)
    print(f"  club pages parsed: {len(sf)}")

    print("=== Secondary probes ===")
    secondary = probe_secondary(meta)

    rows = wc + g18 + sf + secondary
    rows, id_stats = preserve_ids(rows, phase1)
    meta["id_preservation"] = id_stats

    # Postcode recovery for unresolved
    print("=== Postcode recovery ===")
    for r in rows:
        if r.get("is_coming_soon") or r.get("is_closed"):
            continue
        if ROMANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        recover_postal_for_row(r, cache, meta)

    # Geocode missing coords when postcode+address present
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None:
            continue
        if r.get("is_coming_soon") or r.get("is_closed"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if not ROMANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if geocoded >= 80:
            break
        q = f"{r['address']}, {r['postal_code']} {r['city']}, Romania"
        hit = nominatim_geocode(q, "ro", cache, sleep=1.1)
        geocoded += 1
        if hit and hit.get("lat") is not None:
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_romania(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"

    write_json(OUT / "romania_geocode_cache.json", cache)

    rows = dedupe_by_id(rows)
    rows = classify_all(rows)
    rows = mark_duplicates(rows)
    # Re-classify after dup marks (dup stays)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    # DQ
    dq = {
        "duplicate_ids": [],
        "invalid_ready_postcodes": [],
        "missing_ready_fields": [],
        "invalid_ready_coords": [],
        "fallback_coords": [],
        "foreign_outliers": [],
        "mojibake": [],
        "moldova": [],
    }
    seen = set()
    for r in ready:
        rid = r["id"]
        if rid in seen:
            dq["duplicate_ids"].append(rid)
        seen.add(rid)
        if not ROMANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_ready_postcodes"].append(rid)
        if not (r.get("name") and r.get("address") and r.get("city")):
            dq["missing_ready_fields"].append(rid)
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and math.isfinite(lat)
            and math.isfinite(lng)
        ):
            dq["invalid_ready_coords"].append(rid)
        elif not in_romania(float(lat), float(lng)):
            dq["foreign_outliers"].append(rid)
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            dq["fallback_coords"].append(rid)
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE_RE.search(blob):
            dq["mojibake"].append(rid)
        if re.search(r"\b(chișinău|chisinau)\b", blob, re.I) and re.search(
            r"\b(moldova|republica moldova)\b", blob, re.I
        ):
            dq["moldova"].append(rid)
        # Street "Bulevardul Chișinău" in Bucharest is NOT Moldova contamination
        if (r.get("city") or "").lower() in ("chișinău", "chisinau") or (
            r.get("country") or ""
        ).lower() == "moldova":
            if rid not in dq["moldova"]:
                dq["moldova"].append(rid)

    prox = proximity_pairs(ready)
    statuses = dict(Counter(r.get("import_category") for r in rows))
    ready_brands = dict(Counter(r.get("brand") for r in ready))

    # City coverage
    city_hits = {}
    for c in MAJOR_CITIES:
        city_hits[c] = sum(
            1
            for r in ready
            if c.lower() in (r.get("city") or "").lower()
            or c.lower() in (r.get("address") or "").lower()
        )

    wc_s = chain_stats(rows, "World Class", 45)
    sf_s = chain_stats(rows, "Stay Fit Gym", 74)
    g18_s = chain_stats(rows, "18GYM", 47)

    # Phase 2 merge readiness
    major_gap = False
    if wc_s["coverage_pct"] < 85:
        major_gap = True
    if sf_s["coverage_pct"] < 70:
        major_gap = True
    if g18_s["coverage_pct"] < 70:
        major_gap = True
    clean_dq = all(len(v) == 0 for v in dq.values())
    # proximity identical same-brand is a gap
    if prox.get("identical"):
        major_gap = True
    verdict = (
        "ROMANIA PHASE 3 REQUIRED BEFORE MERGE"
        if major_gap or not clean_dq
        else "READY FOR ROMANIA MERGE"
    )

    # Phase 1 READY preservation check
    p1_ids = {r["id"] for r in phase1_ready}
    ready_ids = {r["id"] for r in ready}
    preserved_ready = len(p1_ids & ready_ids)
    lost_ready = p1_ids - ready_ids
    meta["phase1_ready_ids_preserved_in_p2_ready"] = preserved_ready
    meta["phase1_ready_ids_lost"] = sorted(lost_ready)[:30]
    meta["phase1_ready_ids_lost_count"] = len(lost_ready)

    report = {
        "country": "Romania",
        "phase": 2,
        "generated_at": meta["generated_at"],
        "production_total": PRODUCTION_TOTAL,
        "sha_before": sha_before,
        "phase1_staged": len(phase1),
        "phase1_ready": len(phase1_ready),
        "unique_staged": len(rows),
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": ready_brands,
        "chain_completeness": {
            "World Class": wc_s,
            "Stay Fit Gym": sf_s,
            "18GYM": g18_s,
        },
        "city_coverage_ready": city_hits,
        "data_quality": {k: len(v) for k, v in dq.items()},
        "proximity_summary": {k: len(v) for k, v in prox.items()},
        "projected_catalog_if_merged_alone": PRODUCTION_TOTAL + len(ready),
        "crosses_12500": PRODUCTION_TOTAL + len(ready) > 12500,
        "verdict": verdict,
        "id_preservation": id_stats,
        "recovered_postcodes": len(meta.get("recovered_postcodes") or []),
        "meta_summary": {
            "world_class_api": meta.get("world_class_api_count"),
            "stayfit_cpt": meta.get("stayfit_cpt_count"),
            "stayfit_pages": meta.get("stayfit_discovered_pages"),
            "stayfit_no_address": len(meta.get("stayfit_no_address") or []),
            "18gym_coming_recheck": meta.get("18gym_coming_recheck"),
            "secondary": meta.get("secondary_probes"),
        },
    }

    # Outputs
    write_json(OUT / "romania_centers_staging.json", rows)
    write_json(OUT / "ROMANIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "ROMANIA_PHASE2_READINESS_REPORT.json", report)
    write_json(PHASE2 / "phase2_meta.json", meta)
    write_json(
        OUT / "romania_duplicate_analysis.json",
        {
            "proximity": prox,
            "dq": {k: len(v) for k, v in dq.items()},
            "dq_detail": dq,
            "phase1_ready_lost": sorted(lost_ready),
        },
    )
    write_json(
        OUT / "romania_geocode_review.json",
        [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "coord_source": r.get("coord_source"),
                "postcode_source": r.get("postcode_source"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "postal_code": r.get("postal_code"),
                "category": r.get("import_category"),
            }
            for r in rows
        ],
    )
    write_json(
        OUT / "ROMANIA_PHASE2_REBRAND_MAP.json",
        {
            "generated_at": meta["generated_at"],
            "mappings": [
                {
                    "from": "World Class legacy acquired clubs",
                    "to": "World Class",
                    "action": "current_identity_only",
                },
                {
                    "from": "Stay Fit city-hub parser noise (Phase 1)",
                    "to": "Stay Fit Gym club pages (Phase 2)",
                    "action": "rebuild_from_centru_sfg_and_club_pages",
                },
                {
                    "from": "ESX partner gyms",
                    "to": "N/A",
                    "action": "exclude_aggregator",
                },
            ],
        },
    )

    # Update chain inventory
    inv = load_json(OUT / "romania_chain_inventory.json", {})
    inv["phase2"] = {
        "status_counts": statuses,
        "ready_by_brand": ready_brands,
        "chain_completeness": report["chain_completeness"],
        "secondary_probes": meta.get("secondary_probes"),
        "verdict": verdict,
    }
    write_json(OUT / "romania_chain_inventory.json", inv)

    md = f"""# ROMANIA PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Summary

| Metric | Value |
|--------|-------|
| Phase 1 staged | {len(phase1)} |
| Phase 1 READY | {len(phase1_ready)} |
| Unique staged (P2) | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {statuses.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {statuses.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {statuses.get('COMING_SOON', 0)} |
| CLOSED | {statuses.get('CLOSED', 0)} |
| DUPLICATE/LEGACY | {statuses.get('DUPLICATE', 0) + statuses.get('LEGACY', 0)} |
| Projected catalog | {PRODUCTION_TOTAL + len(ready)} |
| Crosses 12,500 | {report['crosses_12500']} |

## Chain completeness

| Chain | Official | Discovered | READY | Coverage | Verdict |
|-------|----------|------------|-------|----------|---------|
| World Class | {wc_s['official_current']} | {wc_s['discovered']} | {wc_s['ready']} | {wc_s['coverage_pct']}% | {wc_s['verdict']} |
| Stay Fit Gym | {sf_s['official_current']} | {sf_s['discovered']} | {sf_s['ready']} | {sf_s['coverage_pct']}% | {sf_s['verdict']} |
| 18GYM | {g18_s['official_current']} | {g18_s['discovered']} | {g18_s['ready']} | {g18_s['coverage_pct']}% | {g18_s['verdict']} |

## READY by brand

{chr(10).join(f"- {b}: {c}" for b, c in sorted(ready_brands.items(), key=lambda x: -x[1])) or "- (none)"}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
SHA before: `{sha_before}`
"""
    (OUT / "ROMANIA_PHASE2_READINESS_REPORT.md").write_text(md)
    write_xlsx(rows)

    sha_after = production_sha()
    assert sha_after == sha_before, "PRODUCTION MODIFIED — FAIL"
    meta["sha_after"] = sha_after
    write_json(PHASE2 / "phase2_meta.json", meta)

    print(
        f"Romania Phase 2: staged={len(rows)} ready={len(ready)} "
        f"WC={wc_s['ready']}/{wc_s['discovered']} SF={sf_s['ready']}/{sf_s['discovered']} "
        f"18={g18_s['ready']}/{g18_s['discovered']} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
