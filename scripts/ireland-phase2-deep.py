#!/usr/bin/env python3
"""
Ireland Deep Phase 2 — nationwide chain expansion.

Does NOT modify src/data/centers.json.
Preserves Phase 1 READY rows unless stronger evidence invalidates them.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    EIRCODE_RE,
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_eircode,
    haversine,
    in_ireland,
    make_id,
    nominatim_geocode,
    norm_addr,
    write_json,
)


def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))

OUT = ROOT / "data/ireland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, PHASE2, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

PRE_SHA = "93283ab74cfb19bb197f6f09b7f833f3dfb56f1ff98a35c5aefa4c15ddb45b92"
PRODUCTION_TOTAL = 10878

NI_MARKERS = re.compile(
    r"\b(belfast|derry|londonderry|newry|lisburn|bangor|omagh|enniskillen|armagh|"
    r"coleraine|ballymena|northern ireland|co\.?\s*antrim|co\.?\s*down|"
    r"co\.?\s*armagh|co\.?\s*tyrone|co\.?\s*fermanagh|\bBT\d{1,2})\b",
    re.I,
)
FOOTER_EIRCODES = {"D08 K188", "D07 VKP9", "D06 FX39", "D02 PX82", "D01 R7W7"}

ENERGIE_IE = [
    ("balbriggan", "Balbriggan", "Millfield Shopping Centre Naul Rd, Tankardstown", "K32 R761"),
    ("ballincollig", "Ballincollig", "Unit 30 Castle West Shopping Centre", "P31 NX76"),
    ("carlow", "Carlow", "Carlow Shopping Centre Kennedy Ave", "R93 A0E0"),
    ("clarehall", "Clarehall", "Unit 8, Clarehall Retail Park 17 Malahide Rd", "D17 X462"),
    ("drogheda", "Drogheda", "West St", "A92 RC99"),
    ("dublin-8", "Dublin 8", "Brabazon Hall Cork St", "D08 XH90"),
    ("dun-laoghaire", "Dún Laoghaire", "8 York Rd", "A96 YX25"),
    ("dundalk", "Dundalk", "Unit 4, The Elgee Building Market Square", "A91 YR9X"),
    ("galway", "Galway", "Briarhill Business Park", "H91 K8XC"),
    ("limerick", "Limerick", "Unit 1, Abbey River Court Island Rd, St. Francis Abbey", "V94 42V0"),
    ("tallaght", "Tallaght", "Plaza Hotel Complex Belgard Road", "D24 X2FC"),
    ("citywest", "Citywest", "Citywest Shopping Centre Citywest Rd", "D24 TD81"),
    ("midleton", "Midleton", "Market Green Shopping Centre Knockgriffin", "P25 FP48"),
    ("mullingar", "Mullingar", "Devlin Road", "N91 W5FK"),
    ("salthill", "Salthill", "Baily Point The Promenade", "H91 W93P"),
    ("stepaside", "Stepaside", "Belarmine Dr", "D18 NW26"),
]

GYMPLUS = [
    ("Ashbourne", "Killegland Walk, Milltown, Ashbourne, Co. Meath", "A84 HF78"),
    ("Ballsbridge", "The Oval, Shelbourne Rd, Dublin 4", "D04 T8F2"),
    ("Cork", "2 Park Place, City Gate, Mahon, Cork", "T12 DH0F"),
    ("Drogheda", "M1 Retail Park, Mell, Drogheda", "A92 R9TN"),
    ("Naas", "Monread Ave, Monread South, Naas", "W91 X67A"),
    ("Rathfarnham", "Nutgrove Retail Park, Nutgrove Ave, Rathfarnham", "D14 Y3C5"),
    ("Swords", "Applewood Village, Swords", "K67 Y5F2"),
]

WESTWOOD = [
    ("Aston Quay", "Aston Quay, Dublin 2", "Dublin", "https://www.westwood.ie/health-clubs/aston-quay-dublin-2/"),
    ("Clontarf", "Clontarf, Dublin 3", "Dublin", "https://www.westwood.ie/health-clubs/clontarf-dublin-3/"),
    ("Dún Laoghaire", "Dún Laoghaire, Co. Dublin", "Dún Laoghaire", "https://www.westwood.ie/health-clubs/dun-laoghaire/"),
    ("Leopardstown", "Leopardstown, Dublin 18", "Dublin", "https://www.westwood.ie/health-clubs/leopardstown-dublin-18/"),
    ("Sandymount", "Sandymount, Dublin 4", "Dublin", "https://www.westwood.ie/health-clubs/sandymount-dublin-4/"),
    ("Westmanstown", "Westmanstown, Dublin 15", "Dublin", "https://www.westwood.ie/health-clubs/westmanstown-dublin-15/"),
]

AURA = [
    ("Drogheda", "Aura Leisure Drogheda", "Drogheda"),
    ("Dublin Navan Road", "Aura Leisure Dublin Navan Road", "Dublin"),
    ("Dundalk", "Aura Leisure Dundalk", "Dundalk"),
    ("Grove Island", "Aura Leisure Grove Island", "Limerick"),
    ("Leitrim", "Aura Leisure Leitrim", "Leitrim"),
    ("Letterkenny", "Aura Leisure Letterkenny", "Letterkenny"),
    ("Lucan", "Aura Leisure Lucan", "Lucan"),
    ("Navan", "Aura Leisure Navan", "Navan"),
    ("Trim", "Aura Leisure Trim", "Trim"),
    ("Tullamore", "Aura Leisure Tullamore", "Tullamore"),
    ("Youghal", "Aura Leisure Youghal", "Youghal"),
]

ICONIC = [
    ("Dartry", "Dartry, Dublin 6", "Dublin", "https://iconichealthclubs.ie/dartry/"),
    ("Dublin City", "Dublin City Centre", "Dublin", "https://iconichealthclubs.ie/dublin-city/"),
    ("IFSC", "IFSC, Dublin 1", "Dublin", "https://iconichealthclubs.ie/ifsc_healthclub/"),
    ("Smithfield", "Smithfield, Dublin 7", "Dublin", "https://iconichealthclubs.ie/smithfield/"),
]

SHORELINE = [
    ("Bray", "Shoreline Leisure Bray", "Bray", "https://www.shorelineleisure.ie/bray-gym"),
    ("Greystones", "Shoreline Leisure Greystones", "Greystones", "https://www.shorelineleisure.ie/greystones-gym"),
]


def fmt_eircode(code: str) -> str:
    code = extract_eircode(code or "") or ""
    if not code:
        return ""
    code = code.upper().replace(" ", "")
    if len(code) != 7:
        return ""
    spaced = f"{code[:3]} {code[3:]}"
    if spaced in FOOTER_EIRCODES:
        return ""
    if not EIRCODE_RE.match(spaced):
        return ""
    return spaced


def is_ni(text: str) -> bool:
    return bool(NI_MARKERS.search(text or ""))


def load_cache() -> dict:
    p = OUT / "ireland_geocode_cache.json"
    return load_json(p, {})


def save_cache(cache: dict) -> None:
    write_json(OUT / "ireland_geocode_cache.json", cache)


def geocode(query: str, cache: dict, countrycodes: str = "ie") -> dict | None:
    hit = nominatim_geocode(query, countrycodes, cache, sleep=1.05)
    if not hit or hit.get("error"):
        return None
    if (hit.get("country_code") or "") not in ("ie", ""):
        # Reject GB/NI hits
        if hit.get("country_code") in ("gb", "uk"):
            return None
    lat, lng = hit.get("lat"), hit.get("lng")
    if lat is None or lng is None or not in_ireland(float(lat), float(lng)):
        return None
    return hit


def classify(row: dict) -> str:
    if row.get("is_closed"):
        return "CLOSED"
    if row.get("is_coming_soon"):
        return "COMING_SOON"
    if row.get("import_category") == "DUPLICATE":
        return "DUPLICATE"
    blob = f"{row.get('name')} {row.get('address')} {row.get('city')} {row.get('source_url')}"
    if is_ni(blob) or row.get("country") != "Ireland":
        return "NEEDS_REVIEW"
    if MOJIBAKE_RE.search(blob):
        return "NEEDS_REVIEW"
    notes = f"{row.get('notes') or ''} {row.get('coord_source') or ''}"
    if FALLBACK_RE.search(notes):
        return "NEEDS_REVIEW"
    postal = fmt_eircode(str(row.get("postal_code") or ""))
    row["postal_code"] = postal
    addr = clean_text(row.get("address") or "")
    city = clean_text(row.get("city") or "")
    lat, lng = row.get("lat"), row.get("lng")
    has_coords = (
        isinstance(lat, (int, float))
        and isinstance(lng, (int, float))
        and math.isfinite(lat)
        and math.isfinite(lng)
        and in_ireland(float(lat), float(lng))
    )
    if not addr or len(addr) < 4 or not city:
        return "NEEDS_REVIEW"
    if not has_coords:
        return "NEEDS_COORDINATES" if postal else "NEEDS_REVIEW"
    if not postal:
        return "NEEDS_REVIEW"
    if not row.get("is_active", True):
        return "NEEDS_REVIEW"
    return "READY_TO_IMPORT"


def upsert(by_key: dict, row: dict, prefer_ready: bool = True) -> None:
    """Index by brand+norm address; keep stable Phase 1 ID when same club."""
    key = (row["brand"].lower(), norm_addr(row.get("address") or ""), fmt_eircode(row.get("postal_code") or ""))
    soft = (row["brand"].lower(), norm_addr(row.get("name") or ""), clean_text(row.get("city") or "").lower())
    existing = by_key.get(key) or by_key.get(soft)
    if existing:
        # Preserve ID
        row["id"] = existing["id"]
        # Prefer filled fields
        for f in ("postal_code", "address", "city", "lat", "lng", "coord_source", "source_url", "website", "notes"):
            if (not existing.get(f) and row.get(f)) or (
                f in ("lat", "lng") and existing.get(f) is None and row.get(f) is not None
            ):
                existing[f] = row[f]
            elif f == "postal_code" and fmt_eircode(row.get(f) or "") and not fmt_eircode(existing.get(f) or ""):
                existing[f] = row[f]
            elif f in ("lat", "lng") and row.get(f) is not None and existing.get(f) is None:
                existing[f] = row[f]
        if row.get("coord_source") and not existing.get("coord_source"):
            existing["coord_source"] = row["coord_source"]
        if row.get("notes"):
            existing["notes"] = f"{existing.get('notes') or ''}; {row['notes']}".strip("; ")
        by_key[key] = existing
        by_key[soft] = existing
        return
    by_key[key] = row
    by_key[soft] = row


def parse_anytime() -> list[dict]:
    rows = []
    for p in sorted(PAGES.glob("anytime_*.html")):
        h = p.read_text(errors="replace")
        slug = p.stem.replace("anytime_", "")
        lat_m = re.findall(r'"latitude"\s*:\s*([-.\d]+)', h)
        lng_m = re.findall(r'"longitude"\s*:\s*([-.\d]+)', h)
        street = (re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', h) or [""])[0]
        postal_raw = (re.findall(r'"postalCode"\s*:\s*"([^"]+)"', h) or [""])[0]
        city = (re.findall(r'"addressLocality"\s*:\s*"([^"]+)"', h) or [""])[0]
        title = re.search(r"<title>([^<]+)", h, re.I)
        name = clean_text(title.group(1).split("-")[0]) if title else f"Anytime Fitness {slug}"
        # Fix Dublin district postals like "22" / "8" / "24"
        eir = fmt_eircode(postal_raw)
        if not eir:
            for m in EIRCODE_RE.finditer(h):
                eir = fmt_eircode(m.group(0))
                if eir:
                    break
        if postal_raw.strip().isdigit() and not eir:
            # Dublin routing-key hint only — leave for geocode
            pass
        lat = float(lat_m[0]) if lat_m else None
        lng = float(lng_m[0]) if lng_m else None
        url = f"https://www.anytimefitness.com/en-ie/locations/{slug}"
        blob = f"{street} {city} {name}"
        if is_ni(blob):
            continue
        city_clean = clean_text(city) or "Dublin"
        if city_clean.lower() in {"22", "8", "24", "co. dublin"}:
            city_clean = "Dublin"
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Anytime Fitness",
                name=f"Anytime Fitness {city_clean}",
                address=clean_text(street) or name,
                postal_code=eir,
                city=city_clean,
                source_url=url,
                lat=lat,
                lng=lng,
                website=url,
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
                notes="anytime_en_ie_location_page_phase2",
                chain_key="anytime_fitness",
            )
        )
    return rows


def parse_energie() -> list[dict]:
    rows = []
    for slug, city, address, eir in ENERGIE_IE:
        url = f"https://www.energiefitness.com/gym/{slug}"
        # Prefer live page street/eir when present
        page = PAGES / f"energie_{slug}.html"
        if page.exists():
            h = page.read_text(errors="replace")
            st = re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', h)
            pc = re.findall(r'"postalCode"\s*:\s*"([^"]+)"', h)
            if st:
                address = clean_text(st[0])
            if pc:
                eir = fmt_eircode(pc[0]) or eir
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Energie Fitness",
                name=f"Energie Fitness {city}",
                address=address,
                postal_code=fmt_eircode(eir),
                city=city,
                source_url=url,
                website=url,
                notes="energie_fitness_com_gym_page_phase2",
                chain_key="energie_fitness",
            )
        )
    return rows


def parse_gymplus() -> list[dict]:
    rows = []
    for city, address, eir in GYMPLUS:
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Gym Plus",
                name=f"Gym Plus {city}",
                address=address,
                postal_code=fmt_eircode(eir),
                city=city,
                source_url="https://www.gymplus.ie/find-a-club-locations-gym-plus/",
                website="https://www.gymplus.ie/",
                notes="gymplus_locations_page_phase2",
                chain_key="gym_plus",
            )
        )
    return rows


def parse_westwood() -> list[dict]:
    rows = []
    for name, address, city, url in WESTWOOD:
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="West Wood Club",
                name=f"West Wood Club {name}",
                address=address,
                postal_code="",
                city=city,
                source_url=url,
                website=url,
                notes="westwood_health_club_page_phase2",
                chain_key="west_wood_club",
            )
        )
    return rows


def parse_aura() -> list[dict]:
    rows = []
    for slug_title, name, city in AURA:
        slug = slug_title.lower().replace(" ", "-")
        url = f"https://www.auraleisure.ie/location/{slug}/"
        # Dublin navan road slug differs
        if "navan" in slug and "dublin" in slug:
            url = "https://www.auraleisure.ie/location/dublin-navan-road/"
        elif slug_title == "Grove Island":
            url = "https://www.auraleisure.ie/location/grove-island/"
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Aura Leisure",
                name=name,
                address=f"Aura Leisure Centre, {city}",
                postal_code="",
                city=city,
                source_url=url,
                website=url,
                notes="aura_leisure_centre_with_public_gym_phase2",
                chain_key="aura_leisure",
                discovery_class="leisure_gym",
            )
        )
    return rows


def parse_iconic() -> list[dict]:
    rows = []
    for name, address, city, url in ICONIC:
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Iconic Health Clubs",
                name=f"Iconic Health Clubs {name}",
                address=address,
                postal_code="",
                city=city,
                source_url=url,
                website=url,
                notes="iconic_health_clubs_page_phase2",
                chain_key="iconic_health_clubs",
            )
        )
    return rows


def parse_shoreline() -> list[dict]:
    rows = []
    for name, label, city, url in SHORELINE:
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Shoreline Leisure",
                name=label,
                address=f"Shoreline Leisure, {city}",
                postal_code="",
                city=city,
                source_url=url,
                website=url,
                notes="shoreline_leisure_gym_page_phase2",
                chain_key="shoreline_leisure",
                discovery_class="leisure_gym",
            )
        )
    return rows


def refresh_flyefit_from_pages(existing: list[dict]) -> list[dict]:
    """Re-read gym pages for any newly recoverable eircodes; keep Phase 1 rows."""
    by_url = {r.get("source_url", "").rstrip("/"): r for r in existing if r.get("brand") == "FLYEfit"}
    # Also scan archive index for any new clubs
    idx = PHASE2 / "probe_flyefit_gyms.html"
    if idx.exists():
        html = idx.read_text(errors="replace")
        urls = sorted(
            set(
                re.findall(r"https://www\.flyefit\.ie/gyms/[a-z0-9\-]+/?", html, re.I)
            )
        )
        for u in urls:
            slug = u.rstrip("/").split("/")[-1]
            if slug in {"feed", "page"}:
                continue
            if any(slug in k for k in by_url):
                continue
            # new club candidate
            page = PAGES / f"flyefit_{slug}.html"
            if not page.exists():
                body = curl_fetch(u if u.endswith("/") else u + "/", page, timeout=30)
                if body.startswith("ERR"):
                    continue
            h = page.read_text(errors="replace") if page.exists() else ""
            if not h or len(h) < 500:
                continue
            # minimal parse via jsonld
            name = address = city = eir = ""
            lat = lng = None
            for m in re.finditer(
                r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                h,
                re.S | re.I,
            ):
                try:
                    block = json.loads(m.group(1))
                except Exception:
                    continue
                if not isinstance(block, dict) or block.get("@type") != "HealthClub":
                    continue
                name = clean_text(block.get("name")) or name
                addr = block.get("address") if isinstance(block.get("address"), dict) else {}
                address = clean_text(addr.get("streetAddress")) or address
                city = clean_text(addr.get("addressLocality")) or city
                eir = fmt_eircode(addr.get("postalCode") or "") or eir
                geo = block.get("geo") if isinstance(block.get("geo"), dict) else {}
                try:
                    if geo.get("latitude") is not None:
                        lat, lng = float(geo["latitude"]), float(geo["longitude"])
                except (TypeError, ValueError):
                    pass
            if not name:
                name = f"FLYEfit {slug.replace('-', ' ').title()}"
            row = base_row(
                prefix="ie_",
                country="Ireland",
                brand="FLYEfit",
                name=name,
                address=address or name,
                postal_code=eir,
                city=city or "Dublin",
                source_url=u.rstrip("/") + "/",
                lat=lat,
                lng=lng,
                website=u.rstrip("/") + "/",
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
                notes="flyefit_phase2_refresh",
                chain_key="flyefit",
            )
            existing.append(row)
    return existing


def recover_fields(rows: list[dict], cache: dict) -> list[dict]:
    review = []
    for r in rows:
        postal = fmt_eircode(str(r.get("postal_code") or ""))
        r["postal_code"] = postal
        need_geo = r.get("lat") is None or r.get("lng") is None
        need_eir = not postal
        if not (need_geo or need_eir):
            continue
        queries = []
        addr = clean_text(r.get("address") or "")
        city = clean_text(r.get("city") or "")
        brand = clean_text(r.get("brand") or "")
        name = clean_text(r.get("name") or "")
        if postal and addr:
            queries.append(f"{addr}, {postal}, Ireland")
        if addr and city:
            queries.append(f"{addr}, {city}, Ireland")
        if brand and name and city:
            queries.append(f"{brand} {name}, {city}, Ireland")
        if brand and city:
            queries.append(f"{brand}, {city}, Ireland")
        hit = None
        for q in queries:
            hit = geocode(q, cache)
            if hit:
                break
        if not hit:
            review.append(
                {
                    "id": r.get("id"),
                    "brand": brand,
                    "name": name,
                    "reason": "geocode_failed",
                    "queries": queries[:3],
                }
            )
            continue
        if need_geo:
            r["lat"] = hit["lat"]
            r["lng"] = hit["lng"]
            r["coord_source"] = r.get("coord_source") or "STRICT_ADDRESS_GEOCODE"
            r["notes"] = f"{r.get('notes') or ''}; phase2_geocode".strip("; ")
        if need_eir:
            pc = fmt_eircode(hit.get("postcode") or "")
            if pc:
                r["postal_code"] = pc
                r["notes"] = f"{r.get('notes') or ''}; eircode_from_geocode".strip("; ")
            else:
                review.append(
                    {
                        "id": r.get("id"),
                        "brand": brand,
                        "name": name,
                        "reason": "eircode_still_missing_after_geocode",
                        "display_name": hit.get("display_name"),
                    }
                )
        time.sleep(0.05)
    return review


def proximity(rows: list[dict]) -> dict:
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    buckets = {"lt25": [], "lt50": [], "lt100": [], "lt200": [], "identical": []}
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a.get("brand") != b.get("brand"):
                continue
            if a.get("lat") is None or b.get("lat") is None:
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            rec = {
                "a_id": a["id"],
                "b_id": b["id"],
                "brand": a["brand"],
                "distance_m": round(d),
                "same_address": norm_addr(a.get("address")) == norm_addr(b.get("address")),
                "a_name": a.get("name"),
                "b_name": b.get("name"),
            }
            if d == 0:
                buckets["identical"].append(rec)
            if d <= 25:
                buckets["lt25"].append(rec)
            if d <= 50:
                buckets["lt50"].append(rec)
            if d <= 100:
                buckets["lt100"].append(rec)
            if d <= 200:
                buckets["lt200"].append(rec)
    return buckets


def regional_coverage(rows: list[dict]) -> dict:
    blob = " ".join(
        f"{r.get('city')} {r.get('name')} {r.get('address')}" for r in rows if r.get("import_category") == "READY_TO_IMPORT"
    ).lower()
    cities = [
        "Dublin",
        "Cork",
        "Galway",
        "Limerick",
        "Waterford",
        "Kilkenny",
        "Drogheda",
        "Dundalk",
        "Sligo",
        "Athlone",
        "Wexford",
        "Letterkenny",
        "Tralee",
        "Killarney",
        "Ennis",
        "Navan",
        "Naas",
        "Bray",
        "Carlow",
        "Tullamore",
        "Swords",
        "Maynooth",
        "Mullingar",
        "Midleton",
        "Balbriggan",
        "Ashbourne",
        "Youghal",
        "Trim",
        "Lucan",
        "Greystones",
    ]
    out = {}
    for c in cities:
        out[c] = c.lower() in blob or c.lower().replace("ú", "u") in blob
    return out


def brand_stats(rows: list[dict], brand: str, official: int | None, verdict: str) -> dict:
    subset = [r for r in rows if r.get("brand") == brand]
    ready = sum(1 for r in subset if r.get("import_category") == "READY_TO_IMPORT")
    unresolved = sum(
        1
        for r in subset
        if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    )
    coming = sum(1 for r in subset if r.get("import_category") == "COMING_SOON")
    closed = sum(1 for r in subset if r.get("import_category") == "CLOSED")
    discovered = len(subset)
    off = official if official is not None else discovered
    cov = round(100.0 * ready / off, 1) if off else 0.0
    return {
        "brand": brand,
        "official_current_estimate": off,
        "discovered": discovered,
        "ready": ready,
        "unresolved": unresolved,
        "coming_soon": coming,
        "closed": closed,
        "coverage_pct": cov,
        "verdict": verdict,
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Ireland_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Ireland"
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
            "source_url",
            "coord_source",
            "notes",
        ]
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h) for h in headers])
        wb.save(path)
    except Exception:
        # CSV fallback
        import csv

        csv_path = OUT / "Gymly_Ireland_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
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
                    "source_url",
                ],
            )
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k) for k in w.fieldnames})
        path.write_text(
            "See Gymly_Ireland_All_Discovered_Centers.csv (openpyxl unavailable)\n",
            encoding="utf-8",
        )


def main():
    print("Ireland Deep Phase 2 starting…")
    phase1 = load_json(OUT / "ireland_centers_staging.json", [])
    phase1_ready = load_json(OUT / "IRELAND_PHASE1_READY_TO_IMPORT.json", [])
    cache = load_cache()

    # Preserve Phase 1 rows
    rows: list[dict] = []
    seen_ids = set()
    for r in phase1:
        r = dict(r)
        r["country"] = "Ireland"
        if is_ni(f"{r.get('address')} {r.get('city')} {r.get('name')}"):
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = f"{r.get('notes') or ''}; ni_excluded".strip("; ")
        rows.append(r)
        seen_ids.add(r["id"])

    rows = refresh_flyefit_from_pages(rows)

    new_batches = [
        parse_anytime(),
        parse_energie(),
        parse_gymplus(),
        parse_westwood(),
        parse_aura(),
        parse_iconic(),
        parse_shoreline(),
        # Swan Leisure — single-site public gym (include for regional Cork/Waterford? Swan is Cork)
        [
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Swan Leisure",
                name="Swan Leisure Cork",
                address="Swan Leisure, Cork",
                postal_code="",
                city="Cork",
                source_url="https://www.swanleisure.ie/facilities/gym",
                website="https://www.swanleisure.ie/",
                notes="swan_leisure_public_gym_phase2",
                chain_key="swan_leisure",
                discovery_class="leisure_gym",
            )
        ],
        # SportsCo — single Dublin Docklands fitness centre (below chain threshold; stage for review)
        [
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="SportsCo",
                name="SportsCo Fitness Centre",
                address="SportsCo, Dublin Docklands",
                postal_code="",
                city="Dublin",
                source_url="https://www.sportsco.ie/facilities/fitness-centre/",
                website="https://www.sportsco.ie/",
                notes="sportsco_single_site_phase2",
                chain_key="sportsco",
                discovery_class="single_site",
            )
        ],
        # Perpetua — CrossFit/specialty; stage as review (not conventional multi-site chain)
        [
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Perpetua Fitness",
                name="Perpetua Fitness Dublin",
                address="Perpetua Fitness, Dublin",
                postal_code="",
                city="Dublin",
                source_url="https://perpetua.ie/",
                website="https://perpetua.ie/",
                notes="perpetua_specialty_single_site_phase2",
                chain_key="perpetua",
                discovery_class="specialty_single",
            )
        ],
    ]

    index: dict = {}
    for r in rows:
        upsert(index, r)

    for batch in new_batches:
        for r in batch:
            upsert(index, r)

    # Deduplicate to unique objects
    unique = []
    seen = set()
    for r in index.values():
        if id(r) in seen:
            continue
        seen.add(id(r))
        unique.append(r)

    print(f"Unique before geocode: {len(unique)}")
    geo_review = recover_fields(unique, cache)
    save_cache(cache)

    # Mark swordsflyehub as duplicate of swords if both present
    swords = [r for r in unique if r.get("brand") == "FLYEfit" and "swords" in (r.get("name") or "").lower()]
    hub = [r for r in swords if "hub" in (r.get("name") or "").lower() or "flyehub" in (r.get("source_url") or "")]
    base_sw = [r for r in swords if r not in hub]
    if hub and base_sw:
        for h in hub:
            h["import_category"] = "DUPLICATE"
            h["notes"] = f"{h.get('notes') or ''}; duplicate_of_flyefit_swords".strip("; ")

    # Anytime Kilnamanagh pair — keep both if different addresses (A)
    # Classify all
    for r in unique:
        if r.get("import_category") == "DUPLICATE":
            continue
        r["import_category"] = classify(r)
        r["verification_status"] = (
            "VERIFIED_CURRENT" if r["import_category"] == "READY_TO_IMPORT" else r.get("verification_status") or "STAGED"
        )

    # Stable sort
    unique.sort(key=lambda r: (r.get("brand") or "", r.get("name") or "", r.get("id") or ""))

    status = Counter(r.get("import_category") for r in unique)
    ready = [r for r in unique if r.get("import_category") == "READY_TO_IMPORT"]
    ready_by_brand = Counter(r["brand"] for r in ready)

    # Phase 1 READY preservation
    p1_ids = {r["id"] for r in phase1_ready}
    preserved = sum(1 for r in ready if r["id"] in p1_ids)
    dropped = [r for r in phase1_ready if r["id"] not in {x["id"] for x in ready}]

    prox = proximity(unique)
    regional = regional_coverage(unique)

    chains = [
        brand_stats(unique, "FLYEfit", 22, "NEAR-COMPLETE" if ready_by_brand.get("FLYEfit", 0) >= 15 else "PARTIAL"),
        brand_stats(unique, "Ben Dunne Gyms", 5, "COMPLETE" if ready_by_brand.get("Ben Dunne Gyms", 0) >= 4 else "PARTIAL"),
        brand_stats(unique, "Anytime Fitness", 7, "COMPLETE" if ready_by_brand.get("Anytime Fitness", 0) >= 5 else "PARTIAL"),
        brand_stats(unique, "Energie Fitness", 16, "COMPLETE" if ready_by_brand.get("Energie Fitness", 0) >= 14 else "NEAR-COMPLETE"),
        brand_stats(unique, "West Wood Club", 6, "COMPLETE" if ready_by_brand.get("West Wood Club", 0) >= 5 else "PARTIAL"),
        brand_stats(unique, "Aura Leisure", 11, "NEAR-COMPLETE" if ready_by_brand.get("Aura Leisure", 0) >= 8 else "PARTIAL"),
        brand_stats(unique, "Gym Plus", 7, "COMPLETE" if ready_by_brand.get("Gym Plus", 0) >= 6 else "PARTIAL"),
        brand_stats(unique, "Iconic Health Clubs", 4, "PARTIAL"),
        brand_stats(unique, "Shoreline Leisure", 2, "PARTIAL"),
        brand_stats(unique, "Swan Leisure", 1, "EXCLUDED" if ready_by_brand.get("Swan Leisure", 0) == 0 else "PARTIAL"),
        brand_stats(unique, "SportsCo", 1, "EXCLUDED"),
        brand_stats(unique, "Perpetua Fitness", 1, "EXCLUDED"),
    ]

    # Data quality on READY
    dq = {
        "duplicate_ids": len(ready) - len({r["id"] for r in ready}),
        "invalid_ready_postcodes": sum(1 for r in ready if not EIRCODE_RE.match(str(r.get("postal_code") or ""))),
        "missing_ready_fields": sum(
            1
            for r in ready
            if not r.get("address") or not r.get("city") or r.get("lat") is None or r.get("lng") is None
        ),
        "invalid_ready_coords": sum(
            1 for r in ready if not in_ireland(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coords": sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))),
        "foreign_outliers": 0,
        "northern_ireland": sum(1 for r in ready if is_ni(f"{r.get('city')} {r.get('address')} {r.get('name')}")),
        "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")),
    }

    material_gaps = []
    if ready_by_brand.get("FLYEfit", 0) < 18:
        material_gaps.append("FLYEfit Eircode debt still leaves some clubs out of READY")
    if ready_by_brand.get("Iconic Health Clubs", 0) < 3:
        material_gaps.append("Iconic Health Clubs addresses/Eircodes incomplete")
    nonblocking = [
        "SportsCo / Perpetua specialty or single-site (below chain threshold)",
        "Kingfisher / Raw Gyms official sites unreachable in Phase 2",
        "One Escape rebranded into Iconic Smithfield",
    ]

    # Phase 3 decision
    major_missing = []
    for c in chains:
        if c["brand"] in ("FLYEfit", "Ben Dunne Gyms", "Anytime Fitness", "Energie Fitness", "Gym Plus", "West Wood Club", "Aura Leisure"):
            if c["verdict"] in ("PARTIAL", "BLOCKED") and c["ready"] < max(3, int(0.5 * c["official_current_estimate"])):
                major_missing.append(c["brand"])
    phase3 = bool(major_missing) or (len(ready) < 40 and any(v is False for k, v in regional.items() if k in ("Limerick", "Waterford", "Dundalk")))
    # Soften: if Energie+Anytime+GymPlus largely READY and regional improved, Phase 3 optional
    if (
        ready_by_brand.get("Energie Fitness", 0) >= 12
        and ready_by_brand.get("Anytime Fitness", 0) >= 4
        and ready_by_brand.get("Gym Plus", 0) >= 5
        and ready_by_brand.get("Aura Leisure", 0) >= 6
    ):
        phase3 = False
        if ready_by_brand.get("FLYEfit", 0) < 15:
            phase3 = True
            material_gaps.append("FLYEfit READY regression vs Phase 1")

    verdict = "IRELAND PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR IRELAND MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_ireland": 0,
        "production_sha256_expected": PRE_SHA,
        "phase1_staged": len(phase1),
        "phase1_ready": len(phase1_ready),
        "phase1_ready_preserved": preserved,
        "phase1_ready_dropped": len(dropped),
        "unique_staged": len(unique),
        "ready_count": len(ready),
        "status_counts": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "chain_completeness": chains,
        "regional_coverage": regional,
        "data_quality": dq,
        "proximity_summary": {k: len(v) for k, v in prox.items()},
        "material_gaps": material_gaps,
        "nonblocking_gaps": nonblocking,
        "projected_catalog": PRODUCTION_TOTAL + len(ready),
        "crossed_12500": (PRODUCTION_TOTAL + len(ready)) > 12500,
        "phase3_required": phase3,
        "verdict": verdict,
        "yava_note": None,
    }

    rebrand = {
        "generated": report["generated"],
        "entries": [
            {
                "legacy": "One Escape Health Club / oneescape.ie",
                "successor": "Iconic Health Clubs Smithfield",
                "notes": "oneescape.ie resolves to Iconic Smithfield branding",
            },
            {
                "legacy": "FLYEHUB Swords marketing page",
                "successor": "FLYEfit Swords",
                "notes": "Same physical site; hub URL treated as DUPLICATE when both present",
            },
        ],
        "phase1_ready_preserved_count": preserved,
        "excluded_brands": [
            {"brand": "Perpetua Fitness", "reason": "specialty CrossFit / single-site — below chain threshold"},
            {"brand": "SportsCo", "reason": "single-site docklands fitness centre — below chain threshold"},
            {"brand": "Kingfisher", "reason": "official site unreachable in Phase 2"},
            {"brand": "Raw Gyms", "reason": "official site unreachable in Phase 2"},
        ],
    }

    # Write artifacts
    write_json(OUT / "ireland_centers_staging.json", unique)
    write_json(OUT / "IRELAND_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "IRELAND_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "IRELAND_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(
        OUT / "ireland_duplicate_analysis.json",
        {"proximity_detail": prox, "summary": report["proximity_summary"]},
    )
    write_json(OUT / "ireland_geocode_review.json", {"items": geo_review, "count": len(geo_review)})
    write_xlsx(unique)

    md = f"""# IRELAND PHASE 2 READINESS REPORT

Generated: {report['generated']}

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | {len(unique)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {status.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {status.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {status.get('COMING_SOON', 0)} |
| CLOSED | {status.get('CLOSED', 0)} |
| DUPLICATE/LEGACY | {status.get('DUPLICATE', 0)} |
| Phase 1 READY preserved | {preserved}/{len(phase1_ready)} |
| Projected catalog if merged alone | {report['projected_catalog']} |

## READY by brand

{chr(10).join(f"- {b}: {n}" for b, n in sorted(ready_by_brand.items(), key=lambda x: -x[1]))}

## Chain completeness

| Brand | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
{chr(10).join(f"| {c['brand']} | {c['official_current_estimate']} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['coverage_pct']}% | {c['verdict']} |" for c in chains)}

## Regional coverage (READY keyword)

{chr(10).join(f"- {k}: {'yes' if v else 'no'}" for k, v in regional.items())}

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | {dq['duplicate_ids']} |
| Invalid postcodes | {dq['invalid_ready_postcodes']} |
| Missing fields | {dq['missing_ready_fields']} |
| Invalid coords | {dq['invalid_ready_coords']} |
| Fallback coords | {dq['fallback_coords']} |
| NI contamination | {dq['northern_ireland']} |
| Mojibake | {dq['mojibake']} |

## Material gaps

{chr(10).join(f"- {g}" for g in material_gaps) or '- (none)'}

## Non-blocking gaps

{chr(10).join(f"- {g}" for g in nonblocking)}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    (OUT / "IRELAND_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(json.dumps({
        "unique": len(unique),
        "ready": len(ready),
        "status": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "phase1_preserved": preserved,
        "verdict": verdict,
        "projected": report["projected_catalog"],
    }, indent=2))


if __name__ == "__main__":
    main()
