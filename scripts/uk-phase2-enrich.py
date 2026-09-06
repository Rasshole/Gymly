#!/usr/bin/env python3
"""
UK Phase 2 enrichment — close coverage gaps without merging production.

Loads existing uk_centers_staging.json, improves official fields, adds new chains,
then geocodes remaining NEEDS_COORDINATES with stricter-but-smarter Nominatim
(brand/POI queries; still no postcode/city centroids).
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
STAGING = OUT / "uk_centers_staging.json"
CACHE = OUT / "uk_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}
GEO_UA = "GymlyUKGeocoder/1.1 (catalog research; accuracy over coverage)"
UK_BOUNDS = (49.80, 60.90, -8.20, 1.80)
UK_POSTCODE_RE = re.compile(r"\b([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\b", re.I)
COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


class Follow308(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code == 308:
            code = 302
        return urllib.request.HTTPRedirectHandler.redirect_request(
            self, req, fp, code, msg, headers, newurl
        )


opener = urllib.request.build_opener(Follow308, urllib.request.HTTPSHandler(context=ctx))


def log(*a):
    print(*a, flush=True)


def page_cache_path(url: str) -> Path:
    return PAGES / f"{hashlib.sha1(url.encode()).hexdigest()}.html"


def fetch(url: str, timeout: int = 25, use_cache: bool = True) -> str:
    cache = page_cache_path(url)
    if use_cache and cache.exists() and cache.stat().st_size > 400:
        return cache.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers=UA)
    with opener.open(req, timeout=timeout) as r:
        data = r.read().decode("utf-8", "replace")
    cache.write_text(data, encoding="utf-8")
    return data


def fetch_safe(url: str, timeout: int = 25) -> tuple[str, str | None]:
    try:
        return fetch(url, timeout=timeout), None
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", str(s))
    s = (
        s.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#8211;", "–")
        .replace("&nbsp;", " ")
        .replace("\xa0", " ")
    )
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s


def normalize_postcode(s: str | None) -> str:
    if not s:
        return ""
    m = UK_POSTCODE_RE.search(str(s).upper())
    if not m:
        return ""
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def is_crown(postal: str) -> bool:
    out = (postal or "").upper().split(" ")[0]
    return out.startswith("GY") or out.startswith("JE") or out.startswith("IM")


def coords_ok(lat, lng):
    try:
        lat_f, lng_f = float(lat), float(lng)
    except (TypeError, ValueError):
        return None, None
    if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
        return None, None
    if lat_f == 0 and lng_f == 0:
        return None, None
    lo, hi, w, e = UK_BOUNDS
    if not (lo <= lat_f <= hi and w <= lng_f <= e):
        return None, None
    return lat_f, lng_f


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join([(brand or "").strip().lower(), (source_url or "").strip().lower(), "united kingdom"])
    else:
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (address or "").strip().lower(),
                (postal or "").strip().lower(),
                (city or "").strip().lower(),
                "united kingdom",
            ]
        )
    return "gb_" + hashlib.md5(key.encode()).hexdigest()[:10]


def constituent_country(postal: str, city: str = "") -> str:
    out = (postal or "").upper().split(" ")[0]
    letters = re.sub(r"\d.*", "", out)
    if letters == "BT":
        return "Northern Ireland"
    if letters in {"AB", "DD", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "TD", "ZE"}:
        return "Scotland"
    if letters in {"CF", "LD", "LL", "NP", "SA"}:
        return "Wales"
    if letters == "SY":
        city_n = (city or "").lower()
        if any(x in city_n for x in ["wrexham", "welshpool", "newtown", "aberystwyth", "llandrindod"]):
            return "Wales"
        return "England"
    return "England"


def parse_uk_blob(text: str) -> dict:
    text = clean_text(text)
    postal = normalize_postcode(text)
    city, address = "", text
    if postal:
        parts = [p.strip() for p in text.split(",") if p.strip()]
        if parts and normalize_postcode(parts[-1]) == postal:
            parts = parts[:-1]
        if parts:
            city = parts[-1]
            if re.fullmatch(r"[A-Za-z][A-Za-z' \-]{1,40}", city):
                address = ", ".join(parts[:-1]) if len(parts) > 1 else parts[0]
            else:
                city = ""
                address = ", ".join(parts)
        address = clean_text(address.replace(postal, ""))
    if city.isupper() and len(city) > 2:
        city = city.title()
    return {"address": address, "postal_code": postal, "city": city}


def ld_blocks(html: str) -> list[dict]:
    out = []
    for raw in re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        try:
            data = json.loads(raw, strict=False)
        except json.JSONDecodeError:
            try:
                data = json.loads(re.sub(r"[\r\n\t]+", " ", raw), strict=False)
            except json.JSONDecodeError:
                continue
        if isinstance(data, list):
            out.extend([x for x in data if isinstance(x, dict)])
        elif isinstance(data, dict):
            if isinstance(data.get("@graph"), list):
                out.extend([x for x in data["@graph"] if isinstance(x, dict)])
            else:
                out.append(data)
    return out


def first_gym_ld(blocks: list[dict]) -> dict | None:
    prefer = {"HealthClub", "ExerciseGym", "Gym", "SportsActivityLocation", "LocalBusiness"}
    for b in blocks:
        t = b.get("@type")
        types = {t} if isinstance(t, str) else set(t or [])
        if types & prefer:
            return b
    return None


def extract_ld(html: str) -> dict:
    place = first_gym_ld(ld_blocks(html)) or {}
    addr = place.get("address") or {}
    if isinstance(addr, list) and addr:
        addr = addr[0]
    if not isinstance(addr, dict):
        addr = {}
    street = clean_text(addr.get("streetAddress") or "")
    city = clean_text(addr.get("addressLocality") or "")
    postal = normalize_postcode(addr.get("postalCode") or "")
    geo = place.get("geo") or {}
    lat, lng = coords_ok(geo.get("latitude") if isinstance(geo, dict) else None, geo.get("longitude") if isinstance(geo, dict) else None)
    return {
        "name": clean_text(place.get("name") or ""),
        "address": street,
        "city": city.title() if city.isupper() else city,
        "postal_code": postal,
        "lat": lat,
        "lng": lng,
        "hours": place.get("openingHoursSpecification") or place.get("openingHours"),
    }


def maps_q_coords(html: str):
    m = re.search(r"maps\.google\.com/\?q=(-?\d+\.\d+),(-?\d+\.\d+)", html)
    if m:
        return coords_ok(m.group(1), m.group(2))
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+),1[5-9]z", html)
    if m:
        return coords_ok(m.group(1), m.group(2))
    return None, None


def cache_html_for(url: str) -> str:
    for candidate in (url, url.rstrip("/"), url.rstrip("/") + "/"):
        p = page_cache_path(candidate)
        if p.exists() and p.stat().st_size > 400:
            return p.read_text(encoding="utf-8", errors="replace")
    html, err = fetch_safe(url)
    return html if not err else ""


def apply_fields(r: dict, **kwargs):
    for k, v in kwargs.items():
        if v in (None, "", []):
            continue
        if k in {"lat", "lng"} and r.get(k) is not None:
            continue
        if k in {"address", "postal_code", "city"} and r.get(k) and k != "address":
            if k == "address" and len(str(r.get(k) or "")) > 12:
                continue
        if k == "address":
            # replace junk HTML dumps / json dumps
            old = r.get("address") or ""
            if len(old) > 180 or '"@type"' in old or "Skip to content" in old or old.lower() == (r.get("city") or "").lower():
                r["address"] = v
            elif not old:
                r["address"] = v
            continue
        if not r.get(k):
            r[k] = v
    if r.get("postal_code"):
        r["postal_code"] = normalize_postcode(r["postal_code"]) or r["postal_code"]
        r["constituent_country"] = constituent_country(r["postal_code"], r.get("city") or "")
    r["id"] = make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url") or "")
    return r


def row(brand, center_name, address, postal, city, source_url, lat=None, lng=None, notes="", verification_status="VERIFIED_CURRENT", legacy_brand="", coord_source=None, opening_hours=None):
    lat_f, lng_f = coords_ok(lat, lng)
    postal = normalize_postcode(postal)
    city = clean_text(city)
    address = clean_text(address)
    if city.isupper() and len(city) > 2:
        city = city.title()
    if is_crown(postal):
        verification_status = "NEEDS_REVIEW"
        notes = (notes + "; crown_dependency_excluded").strip("; ")
        lat_f = lng_f = None
    name = center_name if center_name.lower().startswith(brand.lower()[:4]) else f"{brand} {center_name}".strip()
    return {
        "id": make_id(brand, address, postal, city, source_url),
        "brand": brand,
        "name": name,
        "center_name": center_name or name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "United Kingdom",
        "constituent_country": constituent_country(postal, city) if postal else None,
        "region": None,
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": opening_hours,
        "website": source_url,
        "source_url": source_url,
        "verification_status": verification_status,
        "legacy_brand": legacy_brand or None,
        "notes": notes or None,
        "is_active": False,
        "import_category": "PENDING_CLASSIFY",
        "phase": "uk_phase2",
        "coord_source": coord_source if lat_f is not None else None,
    }


# ---------------------------------------------------------------------------
# Enrich existing staging
# ---------------------------------------------------------------------------
def enrich_fitness_first(rows):
    n = 0
    for r in rows:
        if r.get("brand") != "Fitness First":
            continue
        html = cache_html_for(r.get("source_url") or "")
        if not html:
            continue
        ld = extract_ld(html)
        apply_fields(
            r,
            address=ld["address"],
            postal_code=ld["postal_code"] or r.get("postal_code"),
            city=ld["city"] or r.get("city"),
            lat=ld["lat"],
            lng=ld["lng"],
            opening_hours=ld["hours"],
        )
        if ld["lat"] is not None:
            r["coord_source"] = "official_json_ld"
            r["notes"] = ((r.get("notes") or "") + "; phase2_json_ld_geo").strip("; ")
            n += 1
    log("Fitness First official geo applied", n)


def enrich_david_lloyd(rows):
    n = 0
    for r in rows:
        if r.get("brand") != "David Lloyd":
            continue
        html = cache_html_for(r.get("source_url") or "")
        if not html:
            continue
        lat, lng = maps_q_coords(html)
        ld = extract_ld(html)
        apply_fields(r, address=ld["address"], postal_code=ld["postal_code"], city=ld["city"] or r.get("city"))
        if lat is not None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = "official_maps_embed"
            r["notes"] = ((r.get("notes") or "") + "; phase2_maps_q").strip("; ")
            n += 1
    log("David Lloyd maps.google.com/?q= applied", n)


def enrich_buzz(rows):
    n = 0
    for r in rows:
        if r.get("brand") != "Buzz Gym":
            continue
        html = cache_html_for(r.get("source_url") or "")
        if not html:
            continue
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        m = re.search(
            r"(?:located at|FIND US|Find Us)[:\s]*([A-Z0-9][^.]{12,90}?" + r"[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})",
            text,
            re.I,
        )
        blob = m.group(1) if m else ""
        if not blob:
            parsed = parse_uk_blob(text)
        else:
            parsed = parse_uk_blob(blob)
        if parsed.get("postal_code"):
            apply_fields(r, address=parsed["address"], postal_code=parsed["postal_code"], city=parsed["city"] or r.get("city"))
            n += 1
    log("Buzz addresses repaired", n)


def enrich_jd(rows):
    n = 0
    for r in rows:
        if r.get("brand") != "JD Gyms":
            continue
        html = cache_html_for(r.get("source_url") or "")
        if not html:
            continue
        pill = re.search(r'data-test-id="gym-location-address-pill"[^>]*>([^<]+)<', html)
        blob = clean_text(pill.group(1) if pill else "")
        if not blob:
            m = re.search(r'data-test-id="gym-location-address"[^>]*>[\s\S]{0,200}?<span>([^<]+)</span>', html)
            blob = clean_text(m.group(1) if m else "")
        parsed = parse_uk_blob(blob)
        if parsed.get("postal_code"):
            apply_fields(r, address=parsed["address"], postal_code=parsed["postal_code"], city=parsed["city"] or r.get("city"))
            n += 1
        if "Opening" in html and re.search(r"Opening \d", html):
            if r.get("verification_status") != "COMING_SOON" and re.search(r"Opening (Soon|\d)", html, re.I):
                # keep existing coming-soon classification
                pass
    log("JD addresses repaired", n)


def enrich_bannatyne(rows):
    n = 0
    for r in rows:
        if r.get("brand") != "Bannatyne":
            continue
        addr = r.get("address") or ""
        parsed = parse_uk_blob(addr)
        if parsed.get("postal_code"):
            # strip brand prefix from street
            street = parsed["address"]
            street = re.sub(r"^Bannatyne Health Club,?\s*", "", street, flags=re.I)
            apply_fields(r, address=street, postal_code=parsed["postal_code"], city=parsed["city"] or r.get("city"))
            n += 1
    log("Bannatyne streets cleaned", n)


def enrich_tgg_map(rows):
    raw = json.loads((RAW / "tgg_finder_next.json").read_text(encoding="utf-8"))
    mapped = raw.get("gymMapData") or []
    by_url = {}
    for item in mapped:
        gym = item.get("gym") or {}
        url = "https://www.thegymgroup.com" + (gym.get("gymPageURL") or "")
        pos = item.get("position") or {}
        parsed = parse_uk_blob(gym.get("gymAddress") or "")
        by_url[url.rstrip("/")] = {
            "name": gym.get("gymName"),
            "address": parsed["address"] or gym.get("gymAddress"),
            "postal_code": parsed["postal_code"],
            "city": parsed["city"] or gym.get("gymName"),
            "lat": pos.get("lat"),
            "lng": pos.get("lng"),
            "page": url,
        }
    log("TGG map points", len(by_url))
    filled = 0
    existing_urls = { (r.get("source_url") or "").rstrip("/") for r in rows if r.get("brand") == "The Gym Group" }
    for r in rows:
        if r.get("brand") != "The Gym Group":
            continue
        key = (r.get("source_url") or "").rstrip("/")
        info = by_url.get(key)
        if not info:
            continue
        apply_fields(
            r,
            address=info["address"],
            postal_code=info["postal_code"],
            city=info["city"],
            center_name=f"The Gym Group {info['name']}" if info.get("name") else r.get("center_name"),
        )
        if r.get("name") in {"The Gym Group", ""} and info.get("name"):
            r["name"] = f"The Gym Group {info['name']}"
            r["center_name"] = r["name"]
        lat, lng = coords_ok(info["lat"], info["lng"])
        if lat is not None and r.get("lat") is None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = "official_locator"
            r["notes"] = ((r.get("notes") or "") + "; phase2_gymMapData").strip("; ")
            if r.get("verification_status") == "NEEDS_REVIEW" and r.get("address") and r.get("postal_code"):
                r["verification_status"] = "VERIFIED_CURRENT"
            filled += 1
    added = 0
    for url, info in by_url.items():
        if url in existing_urls:
            continue
        lat, lng = coords_ok(info["lat"], info["lng"])
        rows.append(
            row(
                "The Gym Group",
                f"The Gym Group {info['name']}",
                info["address"],
                info["postal_code"],
                info["city"],
                info["page"],
                lat,
                lng,
                notes="official_finder_gymMapData; phase2",
                coord_source="official_locator" if lat is not None else None,
            )
        )
        added += 1
    log("TGG map filled existing", filled, "added", added)


def ingest_anytime_phase2(rows):
    p = SCRAPES / "anytime_uk_phase2.json"
    if not p.exists():
        log("Anytime phase2 scrape not ready yet")
        return
    extra = json.loads(p.read_text(encoding="utf-8"))
    log("Anytime phase2 rows", len(extra))
    by_url = {(r.get("source_url") or "").rstrip("/"): r for r in rows if r.get("brand") == "Anytime Fitness"}
    for a in extra:
        url = (a.get("source_url") or "").rstrip("/")
        if is_crown(a.get("postal_code") or ""):
            continue
        if a.get("country") and str(a["country"]).lower() not in {"united kingdom", "uk", "gb", "great britain"}:
            if "ireland" in str(a["country"]).lower():
                continue
        target = by_url.get(url)
        if target:
            apply_fields(
                target,
                address=a.get("address"),
                postal_code=a.get("postal_code"),
                city=a.get("city"),
                lat=a.get("lat"),
                lng=a.get("lng"),
            )
            if a.get("lat") is not None:
                target["coord_source"] = a.get("coord_source") or "official_page"
            if a.get("address") and a.get("postal_code"):
                target["verification_status"] = a.get("verification_status") or "VERIFIED_CURRENT"
                target["notes"] = "official_club_page_webfetch; phase2"
            target["name"] = a.get("center_name") or target.get("name")
            target["center_name"] = target["name"]
        else:
            rows.append(
                row(
                    "Anytime Fitness",
                    a.get("center_name") or a.get("name") or "Anytime Fitness",
                    a.get("address") or "",
                    a.get("postal_code") or "",
                    a.get("city") or "",
                    a.get("source_url") or "",
                    a.get("lat"),
                    a.get("lng"),
                    notes="official_club_page_webfetch; phase2",
                    verification_status=a.get("verification_status") or "VERIFIED_CURRENT",
                    coord_source=a.get("coord_source") if a.get("lat") is not None else None,
                )
            )


# ---------------------------------------------------------------------------
# New chains
# ---------------------------------------------------------------------------
def discover_village() -> list[dict]:
    urls = [u.strip() for u in (RAW / "village_location_urls.txt").read_text().splitlines() if u.strip()]
    out = []
    for url in urls:
        html, err = fetch_safe(url)
        if err or not html:
            continue
        ld = extract_ld(html)
        parsed = parse_uk_blob(ld["address"] + " " + (ld["postal_code"] or ""))
        if not ld["postal_code"]:
            text = re.sub(r"<[^>]+>", " ", html)
            parsed = parse_uk_blob(text[text.lower().find("address") : text.lower().find("address") + 400] if "address" in text.lower() else text)
        slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
        lat, lng = ld["lat"], ld["lng"]
        if lat is None:
            lat, lng = maps_q_coords(html)
        out.append(
            row(
                "Village Gym",
                f"Village Gym {slug}",
                ld["address"] or parsed["address"],
                ld["postal_code"] or parsed["postal_code"],
                ld["city"] or parsed["city"] or slug,
                url,
                lat,
                lng,
                notes="official_location_page; phase2",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    log("Village Gym", len(out), "with pc", sum(1 for r in out if r.get("postal_code")), "with geo", sum(1 for r in out if r.get("lat") is not None))
    return out


def discover_third_space() -> list[dict]:
    # Official clubs listing names + outward postcodes; fetch club pages where possible.
    html, err = fetch_safe("https://www.thirdspace.london/clubs/")
    clubs = [
        ("battersea", "Battersea", "SW11"),
        ("canary-wharf", "Canary Wharf", "E14"),
        ("chelsea", "Chelsea", "SW3 6AP"),
        ("city", "City", "EC3"),
        ("clapham-junction", "Clapham Junction", "SW11"),
        ("islington", "Islington", "N1"),
        ("marylebone", "Marylebone", "W1U"),
        ("mayfair", "Mayfair", "W1J"),
        ("moorgate", "Moorgate", "EC2M"),
        ("paternoster-square", "Paternoster Square", "EC4M 7BW"),
        ("queens-park", "Queen's Park", "NW6"),
        ("richmond", "Richmond", "TW9"),
        ("soho", "Soho", "W1F 9US"),
        ("the-whiteley", "The Whiteley", "W2 4YN"),
        ("tower-bridge", "Tower Bridge", "SE1"),
        ("wimbledon", "Wimbledon", "SW19"),
        ("wood-wharf", "Wood Wharf", "E14"),
    ]
    coming = {"paternoster-square", "queens-park"}
    out = []
    for slug, name, pc_hint in clubs:
        url = f"https://www.thirdspace.london/clubs/{slug}/"
        page, e = fetch_safe(url)
        ld = extract_ld(page) if page else {}
        parsed = parse_uk_blob((ld.get("address") or "") + " " + (ld.get("postal_code") or pc_hint))
        if not parsed.get("postal_code") and page:
            parsed = parse_uk_blob(re.sub(r"<[^>]+>", " ", page))
        postal = ld.get("postal_code") or parsed.get("postal_code") or (pc_hint if " " in pc_hint else "")
        status = "COMING_SOON" if slug in coming else "VERIFIED_CURRENT"
        # outward-only postcode is not a full UK postcode — keep NEEDS_REVIEW unless full
        if postal and " " not in postal:
            postal = ""
            notes = "official_clubs_index; outward_only_postcode"
            if status != "COMING_SOON":
                status = "NEEDS_REVIEW"
        else:
            notes = "official_club_page; phase2"
        lat, lng = ld.get("lat"), ld.get("lng")
        if lat is None and page:
            lat, lng = maps_q_coords(page)
        out.append(
            row(
                "Third Space",
                f"Third Space {name}",
                ld.get("address") or parsed.get("address") or "",
                postal,
                name if name not in {"City"} else "London",
                url,
                lat,
                lng,
                notes=notes,
                verification_status=status,
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    log("Third Space", len(out), "pc", sum(1 for r in out if r.get("postal_code")))
    return out


def discover_gymbox() -> list[dict]:
    html, err = fetch_safe("https://www.gymbox.com/gyms")
    out = []
    if html:
        links = sorted(set(re.findall(r'href="(https://(?:www\.)?gymbox\.com/gyms/[^"#]+)"', html)))
        if not links:
            links = ["https://www.gymbox.com" + u if u.startswith("/") else u for u in sorted(set(re.findall(r'href="(/gyms/[a-z0-9\-]+/?)"', html)))]
        log("gymbox links", links)
        for url in links:
            if url.rstrip("/") in {"https://www.gymbox.com/gyms", "https://gymbox.com/gyms"}:
                continue
            page, e = fetch_safe(url)
            if not page:
                continue
            ld = extract_ld(page)
            parsed = parse_uk_blob(re.sub(r"<[^>]+>", " ", page))
            slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
            lat, lng = ld["lat"], ld["lng"]
            if lat is None:
                lat, lng = maps_q_coords(page)
            out.append(
                row(
                    "Gymbox",
                    ld.get("name") or f"Gymbox {slug}",
                    ld["address"] or parsed["address"],
                    ld["postal_code"] or parsed["postal_code"],
                    ld["city"] or parsed["city"] or "London",
                    url,
                    lat,
                    lng,
                    notes="official_club_page; phase2",
                    coord_source="official_json_ld" if lat is not None else None,
                )
            )
    log("Gymbox", len(out))
    return out


def discover_virgin() -> list[dict]:
    html, err = fetch_safe("https://www.virginactive.co.uk/clubs")
    names = [
        "Aldersgate", "Bank", "Bromley", "Canary Riverside", "Cannon Street (Walbrook)",
        "Chelmsford", "Chiswick Park", "Chiswick Riverside", "Clapham", "Clearview/Brentwood",
        "Crouch End", "Fulham Pools", "Islington Angel", "Kensington", "Mayfair", "Mill Hill",
        "Moorgate", "Northampton Collingtree Park", "Northampton Riverside Park", "Notting Hill",
        "Nottingham", "Repton Park", "Salford Quays", "Sheffield Broadfield Park", "Solihull",
        "Strand", "Streatham", "Swiss Cottage", "Thundersley", "Wandsworth Smugglers Way",
        "Wimbledon Worple Road",
    ]
    out = []
    # try sitemap-like club URLs
    for name in names:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        url = f"https://www.virginactive.co.uk/clubs/{slug}"
        page, e = fetch_safe(url)
        ld = extract_ld(page) if page else {}
        parsed = parse_uk_blob(re.sub(r"<[^>]+>", " ", page) if page else "")
        lat, lng = ld.get("lat"), ld.get("lng")
        if page and lat is None:
            lat, lng = maps_q_coords(page)
        status = "VERIFIED_CURRENT" if (ld.get("address") or parsed.get("address")) else "NEEDS_REVIEW"
        notes = "official_club_page; phase2" if page and not e else "official_clubs_index; page_fetch_failed; phase2"
        if e or not page:
            # still stage the official directory name
            out.append(
                row(
                    "Virgin Active",
                    f"Virgin Active {name}",
                    "",
                    "",
                    name.split()[0],
                    url,
                    notes=notes,
                    verification_status="NEEDS_REVIEW",
                )
            )
            continue
        out.append(
            row(
                "Virgin Active",
                ld.get("name") or f"Virgin Active {name}",
                ld.get("address") or parsed.get("address") or "",
                ld.get("postal_code") or parsed.get("postal_code") or "",
                ld.get("city") or parsed.get("city") or name,
                url,
                lat,
                lng,
                notes="official_club_page; phase2",
                verification_status=status if (ld.get("postal_code") or parsed.get("postal_code")) else "NEEDS_REVIEW",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    log("Virgin Active", len(out), "pc", sum(1 for r in out if r.get("postal_code")), "geo", sum(1 for r in out if r.get("lat") is not None))
    return out


def discover_fitness4less() -> list[dict]:
    clubs = [
        ("Canning Town", "30A Barking Road, Canning Town, London", "E16 1EQ", "London", "https://www.fitness4less.co.uk/locations"),
        ("Colchester", "Unit 2 Phoenix Square, Wyncolls Rd, Colchester", "CO4 9AS", "Colchester", "https://www.fitness4less.co.uk/locations"),
        ("London Cambridge Heath", "Cambridge Heath Road, London", "E2 9BY", "London", "https://www.fitness4less.co.uk/locations"),
        ("New Malden", "23 Blagdon Road, New Malden, Surrey", "KT3 4AH", "New Malden", "https://www.fitness4less.co.uk/contact-us"),
        ("Northampton", "Sol Central, Mare Fair, Northampton", "NN1 1SR", "Northampton", "https://www.fitness4less.co.uk/contact-us"),
        ("Southwark", "23-29 Great Suffolk Street, Southwark, London", "SE1 0UE", "London", "https://www.fitness4less.co.uk/locations"),
        ("Watford", "Cafe Quarter, 46 The Parade, Watford, Hertfordshire", "WD17 1AY", "Watford", "https://www.fitness4less.co.uk/contact-us"),
    ]
    out = []
    for name, address, pc, city, url in clubs:
        out.append(
            row(
                "Fitness4Less",
                f"Fitness4Less {name}",
                address,
                pc,
                city,
                url,
                notes="official_locations_or_contact_page; phase2",
            )
        )
    log("Fitness4Less", len(out))
    return out


def discover_easygym() -> list[dict]:
    html, err = fetch_safe("https://easygym.co.uk/locations/")
    out = []
    if html:
        links = sorted(set(re.findall(r'href="(https://easygym\.co\.uk/[^"]+)"', html)))
        gym_links = [u for u in links if re.search(r"/gym|/location", u) and "locations/" not in u.rstrip("/")]
        if not gym_links:
            # try path slugs
            gym_links = ["https://easygym.co.uk" + u if u.startswith("/") else u for u in sorted(set(re.findall(r'href="(/(?:gyms?|locations?)/[a-z0-9\-]+/?)"', html)))]
        log("easygym links", gym_links[:20], "n", len(gym_links))
        for url in gym_links:
            page, e = fetch_safe(url)
            if not page:
                continue
            ld = extract_ld(page)
            parsed = parse_uk_blob(re.sub(r"<[^>]+>", " ", page))
            slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
            lat, lng = ld["lat"], ld["lng"]
            if lat is None:
                lat, lng = maps_q_coords(page)
            out.append(
                row(
                    "easyGym",
                    ld.get("name") or f"easyGym {slug}",
                    ld["address"] or parsed["address"],
                    ld["postal_code"] or parsed["postal_code"],
                    ld["city"] or parsed["city"] or slug,
                    url,
                    lat,
                    lng,
                    notes="official_location_page; phase2",
                    coord_source="official_json_ld" if lat is not None else None,
                )
            )
    log("easyGym", len(out))
    return out


def discover_total_fitness() -> list[dict]:
    html, err = fetch_safe("https://www.totalfitness.co.uk/clubs/")
    out = []
    if html:
        # embedded club cards
        blocks = re.findall(r"(<h3[^>]*>.*?</h3>[\s\S]{0,400})", html)
        seen = set()
        for b in blocks:
            name = clean_text(re.sub(r"<[^>]+>", " ", re.search(r"<h3[^>]*>([\s\S]*?)</h3>", b).group(1) if re.search(r"<h3", b) else ""))
            parsed = parse_uk_blob(re.sub(r"<[^>]+>", " ", b))
            if not parsed.get("postal_code") or name in seen:
                continue
            seen.add(name)
            href = re.search(r'href="([^"]+)"', b)
            url = href.group(1) if href else "https://www.totalfitness.co.uk/clubs/"
            if url.startswith("/"):
                url = "https://www.totalfitness.co.uk" + url
            out.append(
                row(
                    "Total Fitness",
                    f"Total Fitness {name}",
                    parsed["address"],
                    parsed["postal_code"],
                    parsed["city"] or name,
                    url,
                    notes="official_clubs_directory; phase2",
                )
            )
    log("Total Fitness directory parse", len(out))
    return out


# ---------------------------------------------------------------------------
# Geocode
# ---------------------------------------------------------------------------
def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "gb",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": GEO_UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower().replace("&", " and ")).strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def score_candidate(item, street, postal, city, brand=""):
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    lo, hi, w, e = UK_BOUNDS
    if not (lo <= lat <= hi and w <= lng <= e):
        return None, ["outside_uk"], lat, lng
    t = (item.get("type") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {
        "house", "building", "yes", "retail", "commercial", "industrial",
        "gym", "fitness_centre", "sports_centre", "sports_centre",
    }:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng
    reasons = []
    score = 0
    pc_n = re.sub(r"\s+", "", str(addr.get("postcode") or "").upper())
    postal_n = re.sub(r"\s+", "", (postal or "").upper())
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:4] == postal_n[:4]:
        score += 1
        reasons.append("postal_soft")
    city_n = norm(city)
    city_fields = " ".join(norm(addr.get(k) or "") for k in ("city", "town", "village", "suburb", "city_district"))
    display = (item.get("display_name") or "").lower()
    if city_n and (city_n in city_fields or city_n in display):
        score += 3
        reasons.append("city_ok")
    street_n = norm(street)
    road = norm(addr.get("road") or "")
    if road and street_n and (road in street_n or any(tok in road for tok in street_n.split() if len(tok) > 4)):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    amenity = t in {"gym", "fitness_centre", "sports_centre", "sports_centre", "yes", "retail"} or osm_class in {"building", "amenity", "leisure", "shop"}
    if amenity:
        score += 2
        reasons.append("building_or_amenity")
    brand_n = norm(brand).split(" ")[0] if brand else ""
    name_n = norm(item.get("name") or display[:80])
    if brand_n and len(brand_n) > 3 and brand_n in name_n:
        score += 4
        reasons.append("brand_name_match")
    # Reject centroids: need street, building, or named gym POI with exact postcode
    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons and "brand_name_match" not in reasons:
        return None, reasons + ["no_street_building_or_named_poi"], lat, lng
    if "postal_exact" not in reasons and "postal_soft" in reasons and "road_match" not in reasons and "brand_name_match" not in reasons:
        return None, reasons + ["soft_postal_without_road"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    brand = r.get("brand") or ""
    queries = [
        f"{brand}, {street}, {postal}, United Kingdom",
        f"{street}, {postal}, United Kingdom",
        f"{brand} {city}, {postal}, United Kingdom",
    ]
    all_rej = []
    for q in queries:
        try:
            items = nominatim(q, cache)
        except Exception as e:
            all_rej.append({"query": q, "error": str(e)})
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city, brand)
            if sc is None:
                all_rej.append({"query": q, "reject": reasons, "display": it.get("display_name")})
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name")))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        top = scored[0]
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                r["geocode_status"] = "ambiguous"
                r["lat"] = r["lng"] = None
                r["import_category"] = "NEEDS_REVIEW"
                return r
        soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
        if soft and "road_match" not in top[1] and "brand_name_match" not in top[1]:
            r["import_category"] = "NEEDS_REVIEW"
            r["geocode_status"] = "soft_postal_rejected"
            r["lat"] = r["lng"] = None
            return r
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "suspicious" if soft else "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        if soft:
            r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:4]
    r["lat"] = r["lng"] = None
    return r


def classify(r):
    notes = r.get("notes") or ""
    if "crown_dependency" in notes:
        r["import_category"] = "NEEDS_REVIEW"
        r["lat"] = r["lng"] = None
        return r
    if r.get("verification_status") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        return r
    if r.get("verification_status") == "NEEDS_REVIEW" and not (r.get("lat") and r.get("address") and r.get("postal_code")):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        lat, lng = coords_ok(r["lat"], r["lng"])
        if lat is not None:
            r["lat"], r["lng"] = lat, lng
            r["import_category"] = "READY_TO_IMPORT"
            if r.get("verification_status") == "NEEDS_REVIEW":
                r["verification_status"] = "VERIFIED_CURRENT"
            return r
        r["lat"] = r["lng"] = None
    r["import_category"] = "NEEDS_COORDINATES"
    return r


def main():
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    log("loaded staging", len(rows), Counter(r.get("import_category") for r in rows))

    enrich_fitness_first(rows)
    enrich_david_lloyd(rows)
    enrich_buzz(rows)
    enrich_jd(rows)
    enrich_bannatyne(rows)
    enrich_tgg_map(rows)
    ingest_anytime_phase2(rows)

    new_chains = []
    for fn in [
        discover_village,
        discover_third_space,
        discover_gymbox,
        discover_virgin,
        discover_fitness4less,
        discover_easygym,
        discover_total_fitness,
    ]:
        try:
            new_chains.extend(fn())
        except Exception as e:
            log("NEW CHAIN FAIL", fn.__name__, e)

    (SCRAPES / "phase2_new_chains_uk.json").write_text(json.dumps(new_chains, ensure_ascii=False, indent=2), encoding="utf-8")
    rows.extend(new_chains)

    # reclassify after official coords
    rows = [classify(r) for r in rows]
    log("after enrich", len(rows), Counter(r.get("import_category") for r in rows))

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
        and r.get("verification_status") != "COMING_SOON"
    ]
    log("geocode todo", len(todo))
    for i, r in enumerate(todo):
        log(f"[{i+1}/{len(todo)}] {str(r.get('name') or '')[:70]}")
        geocode_row(r, cache)
        if i % 25 == 24:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    rows = [classify(r) for r in rows]

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log("wrote staging", len(rows), Counter(r.get("import_category") for r in rows))
    log("brands", Counter(r.get("brand") for r in rows))
    for brand, n in Counter(r.get("brand") for r in rows).most_common():
        sub = [r for r in rows if r.get("brand") == brand]
        ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        log(f"  {brand:20} n={n:4} READY={ready:4}")


if __name__ == "__main__":
    main()
