#!/usr/bin/env python3
"""
Italy Phase 1 discovery — official chain locators / club pages / APIs.

Does NOT merge into centers.json. Does NOT invent coordinates.
IDs: it_ + md5(brand|address|postal|city|italy)[:10]
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()
TODAY = date.today()

# Mainland + Sicily + Sardinia (+ minor islands). Reject SM/VA/FR/CH/AT/SI/HR/MT.
IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)


def log(*a):
    with PRINT_LOCK:
        print(*a, flush=True)


def fetch(url: str, timeout: int = 40, headers: dict | None = None) -> tuple[int, str]:
    hdrs = dict(UA)
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
            enc = "utf-8"
            m = re.search(r"charset=([^\s;]+)", ctype, re.I)
            if m:
                enc = m.group(1).strip("\"'")
            return r.status, raw.decode(enc, errors="replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception as e:
        return 0, str(e)


def fetch_cached(url: str, dest: Path, timeout: int = 40, headers: dict | None = None) -> str:
    if dest.exists() and dest.stat().st_size > 200:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout, headers=headers)
    if code == 200 and text:
        dest.write_text(text, encoding="utf-8")
        return text
    return text if code == 200 else ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("&#xA;", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def it_postal(s: str) -> str:
    if not s:
        return ""
    m = re.search(r"\b(\d{5})\b", str(s))
    return m.group(1) if m else ""


def in_italy_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in (IT_MAINLAND, IT_SICILY, IT_SARDINIA):
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "italy",
        ]
    )
    return "it_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def parse_opening_date(s: str | None):
    """Return date or None from dd/mm/yyyy or ISO-ish strings."""
    if not s:
        return None
    s = str(s).strip()
    m = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def row(
    brand: str,
    name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    opening_hours=None,
    notes="",
    coming=False,
    website=None,
    coord_source=None,
    legacy_brand=None,
    closed=False,
    region=None,
    source_type=None,
) -> dict:
    postal = it_postal(postal) or it_postal(address) or ""
    rid = make_id(brand, address, postal, city)
    if closed:
        status = "CLOSED"
    elif coming:
        status = "COMING_SOON"
    else:
        status = "VERIFIED_CURRENT"
    out = {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": unescape(address or ""),
        "postal_code": postal or None,
        "city": unescape(city or ""),
        "country": "Italy",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming and not closed,
        "import_category": "CLOSED" if closed else ("COMING_SOON" if coming else None),
        "phase": "italy_phase1",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
        "region": region,
    }
    return out


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


def parse_it_address_blob(blob: str) -> tuple[str, str, str]:
    """Best-effort street / CAP / city from Italian address strings."""
    blob = unescape(blob)
    postal = it_postal(blob)
    city = ""
    # Common FitActive form: "Via X, N City (PR) - 12345"
    m_city_cap = re.search(
        r",?\s*([A-Za-zÀ-ú'’.\- ]+?)\s*\(([A-Z]{2})\)\s*-?\s*(\d{5})\s*$",
        blob,
    )
    if m_city_cap:
        city = m_city_cap.group(1).strip(" ,")
        postal = postal or m_city_cap.group(3)
        street = blob[: m_city_cap.start()].strip(" ,")
        return street, postal, city
    # "..., 20124 Milano (MI)" / "..., 00167 Roma RM"
    m = re.search(
        r"\b(\d{5})\s+([A-Za-zÀ-ú'’.\- ]+?)(?:\s*\(([A-Z]{2})\))?(?:\s*[A-Z]{2})?\s*$",
        blob,
    )
    if m:
        city = m.group(2).strip(" ,")
        postal = postal or m.group(1)
    else:
        m3 = re.search(r",\s*([A-Za-zÀ-ú'’.\- ]+?)\s*\(([A-Z]{2})\)", blob)
        if m3:
            city = m3.group(1).strip()
    street = blob
    if postal:
        street = re.split(rf"\b{postal}\b", blob)[0].rstrip(" ,")
    street = re.sub(r",?\s*[A-Za-zÀ-ú'’.\- ]+\s*\([A-Z]{2}\)\s*-?\s*$", "", street).strip(" ,")
    if city and street.lower().endswith(city.lower()):
        street = street[: -len(city)].rstrip(" ,")
    return street.strip(" ,"), postal, city


# ---------------------------------------------------------------------------
# FitActive — embedded JSON on Club/Club (Italy only)
# ---------------------------------------------------------------------------

def discover_fitactive() -> list[dict]:
    log("  FitActive: Club/Club embedded JSON...")
    html = fetch_cached("https://fitactive.it/Club/Club", RAW / "fitactive_clubs.html")
    if not html:
        html = fetch_cached("https://www.fitactive.it/Club/Club", RAW / "fitactive_clubs_www.html")
    idx = html.find('[{"id":')
    if idx < 0:
        log("    FitActive: no JSON array found")
        return []
    data, _ = json.JSONDecoder().raw_decode(html[idx:])
    (RAW / "fitactive_clubs.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = []
    for c in data:
        state = (c.get("state") or "").strip().lower()
        if state not in {"italia", "italy", "it"}:
            continue
        title = unescape(c.get("title") or "")
        name = title if title.lower().startswith("fitactive") else f"FitActive {title}".strip()
        only = unescape(c.get("onlyStreet") or "")
        addr_blob = unescape(c.get("address") or "")
        street, postal, city = parse_it_address_blob(addr_blob)
        if only:
            street = only
        # Prefer city from title when parser grabbed province code (AL/MI/…)
        title_city = re.sub(r"^FitActive\s+", "", title, flags=re.I).strip()
        if (not city) or (len(city) <= 3 and city.isupper()) or city.upper() == city and len(city) == 2:
            city = title_city or city
        elif title_city and len(title_city) > len(city) and title_city.lower().startswith(city.lower()):
            # e.g. city=Bari from address but title=Bari Japigia — keep address city for geocode
            pass
        lat, lng = c.get("latitude"), c.get("longitude")
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            lat = lng = None
        if lat is not None and not in_italy_bbox(lat, lng):
            lat = lng = None
        od = parse_opening_date(c.get("dataApertura"))
        coming = False
        if od and od > TODAY:
            coming = True
        if c.get("opened") in (0, "0", False) and not od:
            # opened flag: treat unknown future carefully
            pass
        src = f"https://fitactive.it/Club/Club#id={c.get('id')}"
        rows.append(
            row(
                "FitActive",
                name,
                street,
                postal,
                city,
                src,
                lat=lat,
                lng=lng,
                opening_hours=c.get("orari"),
                notes=f"fitactive_id={c.get('id')}; placeid={c.get('placeid') or ''}",
                coming=coming,
                website="https://fitactive.it/",
                coord_source="OFFICIAL_COORDINATE" if lat is not None else None,
                region=c.get("region"),
                source_type="official_embedded_json",
            )
        )
    log(f"    FitActive Italy rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# McFIT / JOHN REED / Gold's Gym Italy — RSG Magicline
# ---------------------------------------------------------------------------

def discover_rsg_magicline() -> list[dict]:
    log("  RSG Magicline Italy...")
    code, body = fetch(
        "https://rsg-group.api.magicline.com/connect/v1/studio",
        headers={"Accept": "application/json"},
    )
    if code != 200:
        log(f"    Magicline failed: {code}")
        return []
    data = json.loads(body)
    (RAW / "magicline_studios.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    rows = []
    for s in data:
        addr = s.get("address") or {}
        if (addr.get("countryCodeAlpha2") or "").upper() != "IT":
            continue
        tag_names = []
        for t in s.get("studioTags") or []:
            if isinstance(t, dict):
                tag_names.append((t.get("name") or "").strip())
        tag_set = set(tag_names)
        if "inaktiv" in tag_set or "GHOST-STUDIO" in tag_set:
            closed = True
        elif s.get("closingDate"):
            closed = True
        else:
            closed = False

        if "McFIT" in tag_set or (s.get("studioName") or "").upper().startswith("MCFIT"):
            brand = "McFIT"
        elif "JOHN REED" in tag_set or "JOHN REED" in (s.get("studioName") or "").upper():
            brand = "JOHN REED"
        elif "Gold's Gym" in tag_set or "GOLD" in (s.get("studioName") or "").upper():
            brand = "Gold's Gym"
        else:
            continue

        street = " ".join(x for x in [addr.get("street"), addr.get("houseNumber")] if x).strip()
        if addr.get("streetAddition"):
            street = f"{street}, {addr['streetAddition']}".strip(", ")
        lat, lng = addr.get("latitude"), addr.get("longitude")
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            lat = lng = None
        if lat is not None and not in_italy_bbox(lat, lng):
            notes_extra = "; coord_outside_italy_bbox"
            lat = lng = None
        else:
            notes_extra = ""

        od = None
        if s.get("openingDate"):
            od = parse_opening_date(str(s.get("openingDate"))[:10])
        coming = bool(od and od > TODAY)
        # VVK = Vorverkauf / pre-sale
        if "VVK" in tag_set and not closed:
            coming = True

        rows.append(
            row(
                brand,
                s.get("studioName") or brand,
                street,
                str(addr.get("zipCode") or ""),
                addr.get("city") or "",
                "https://rsg-group.api.magicline.com/connect/v1/studio",
                lat=lat,
                lng=lng,
                opening_hours=s.get("openingHours"),
                notes=f"magicline_id={s.get('id')}; tags={','.join(tag_names[:8])}{notes_extra}",
                coming=coming,
                closed=closed,
                website={
                    "McFIT": "https://www.mcfit.com/it/palestre/",
                    "JOHN REED": "https://www.mcfit.com/it/",
                    "Gold's Gym": "https://www.mcfit.com/it/",
                }.get(brand),
                coord_source="OFFICIAL_COORDINATE" if lat is not None else None,
                source_type="official_api",
            )
        )
    log(f"    RSG Italy rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Virgin Active Italy — club finder data attributes
# ---------------------------------------------------------------------------

def discover_virgin_active() -> list[dict]:
    log("  Virgin Active Italy...")
    html = fetch_cached("https://www.virginactive.it/club", RAW / "virgin_clubs.html")
    if not html:
        return []
    # Parse club cards with data-address-* near clubName / href
    rows = []
    seen = set()
    # clubName appears before data-address-* inside each card
    blocks = re.findall(
        r'class="clubName">([^<]+)[\s\S]{0,1200}?'
        r'data-address-city="([^"]*)"\s*'
        r'data-address-zip="([^"]*)"\s*'
        r'data-address-lon="([^"]*)"\s*'
        r'data-address-lat="([^"]*)"\s*'
        r'data-address-complete="([^"]*)"',
        html,
    )
    # hrefs for club pages (city/club-slug)
    hrefs = re.findall(r'href="(https://virginactive\.it/club/[a-z0-9\-]+/[a-z0-9\-&#;]+)"', html)
    href_by_slug = {}
    for h in hrefs:
        slug = unescape(h).rstrip("/").split("/")[-1]
        href_by_slug[slug] = unescape(h)
    for name, city_s, zipc, lon, lat, complete_s in blocks:
        name = unescape(name)
        city_s = unescape(city_s)
        complete_s = unescape(complete_s)
        if name.lower() in {"scopri revolution"}:
            continue
        postal = it_postal(zipc) or it_postal(complete_s)
        street = complete_s
        if city_s and street.lower().startswith(city_s.lower()):
            street = street[len(city_s) :].strip(" ,")
        street = re.sub(r"\s+\d{5}\s*(IT)?\s*$", "", street, flags=re.I).strip(" ,")
        # Prefer visible clubAddress text when present in complete already
        try:
            lat_f = float(str(lat).replace(",", "."))
            lng_f = float(str(lon).replace(",", "."))
        except ValueError:
            lat_f = lng_f = None
        if lat_f is not None and not in_italy_bbox(lat_f, lng_f):
            lat_f = lng_f = None
        slug_guess = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        src = href_by_slug.get(slug_guess) or f"https://virginactive.it/club/{city_s.lower()}/{slug_guess}"
        key = (name.lower(), postal, street.lower())
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            row(
                "Virgin Active",
                f"Virgin Active {name}".strip(),
                street,
                postal,
                city_s,
                src,
                lat=lat_f,
                lng=lng_f,
                notes="virgin_club_finder_data_attrs",
                website=src,
                coord_source="OFFICIAL_COORDINATE" if lat_f is not None else None,
                source_type="official_locator_html",
            )
        )
    log(f"    Virgin Active rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# FitUP — WP club CPT + Elementor address on club pages
# ---------------------------------------------------------------------------

def discover_fitup() -> list[dict]:
    log("  FitUP: WP clubs + club pages...")
    clubs = []
    page = 1
    while page <= 20:
        url = f"https://fitup.it/wp-json/wp/v2/club?per_page=100&page={page}"
        code, body = fetch(url, headers={"Accept": "application/json"})
        if code != 200:
            break
        batch = json.loads(body)
        if not isinstance(batch, list) or not batch:
            break
        clubs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.25)
    (RAW / "fitup_wp_clubs.json").write_text(json.dumps(clubs, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"    FitUP WP clubs: {len(clubs)}")
    rows = []
    for c in clubs:
        slug = c.get("slug") or ""
        link = c.get("link") or f"https://fitup.it/club/{slug}/"
        title = unescape((c.get("title") or {}).get("rendered") or slug)
        dest = RAW / "fitup_pages" / f"{slug}.html"
        html = fetch_cached(link, dest)
        time.sleep(0.2)
        street = postal = city = ""
        lat = lng = None
        coord_source = None
        # Strip noise then search address lines
        cleaned = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
        cleaned = re.sub(r"<style[\s\S]*?</style>", "", cleaned, flags=re.I)
        text = unescape(re.sub(r"<[^>]+>", "\n", cleaned))
        for line in text.splitlines():
            line = line.strip()
            if not line or len(line) > 120:
                continue
            if not re.search(r"\b(Via|Viale|Corso|Piazza|Largo|Vicolo|Strada)\b", line, re.I):
                continue
            if re.search(r"\b\d{5}\b", line) or re.search(r"\([A-Z]{2}\)", line):
                street, postal, city = parse_it_address_blob(line)
                if not city:
                    mcity = re.search(r",\s*([A-Za-zÀ-ú'’.\- ]+?)(?:\s*\(([A-Z]{2})\))?\s*$", line)
                    if mcity:
                        city = mcity.group(1).strip()
                if street:
                    break
        # Elementor fallback
        if not street:
            for m in re.finditer(
                r'elementor-widget-text-editor[^>]*>[\s\S]*?<div class="elementor-widget-container">\s*([^<]{8,120})\s*</div>',
                html,
            ):
                cand = unescape(m.group(1))
                if re.search(r"\b(Via|Viale|Corso|Piazza|Largo)\b", cand, re.I):
                    street, postal, city = parse_it_address_blob(cand)
                    if street:
                        break
        # Google Maps embed → OFFICIAL_MAP_PIN
        emb = re.search(
            r"google\.com/maps/embed\?[^\"']*!2d([0-9.\-]+)!3d([0-9.\-]+)",
            html,
        )
        if emb:
            try:
                lng = float(emb.group(1))
                lat = float(emb.group(2))
                if in_italy_bbox(lat, lng):
                    coord_source = "OFFICIAL_MAP_PIN"
                else:
                    lat = lng = None
            except ValueError:
                lat = lng = None
        if not city:
            city = title
        rows.append(
            row(
                "FitUP",
                f"FitUP {title}".strip(),
                street,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                notes=f"fitup_wp_id={c.get('id')}",
                website=link,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    log(f"    FitUP rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Fit Express — WP club list + club-hero__addr
# ---------------------------------------------------------------------------

def discover_fitexpress() -> list[dict]:
    log("  Fit Express: WP clubs + club pages...")
    clubs = []
    page = 1
    while page <= 10:
        url = f"https://www.fitexpress.it/wp-json/wp/v2/club?per_page=100&page={page}"
        code, body = fetch(url, headers={"Accept": "application/json"})
        if code != 200:
            break
        batch = json.loads(body)
        if not isinstance(batch, list) or not batch:
            break
        clubs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.25)
    (RAW / "fitexpress_wp_clubs.json").write_text(
        json.dumps(clubs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"    Fit Express WP clubs: {len(clubs)}")
    rows = []
    for c in clubs:
        slug = c.get("slug") or ""
        link = c.get("link") or f"https://www.fitexpress.it/club/{slug}/"
        title = unescape((c.get("title") or {}).get("rendered") or slug)
        dest = RAW / "fitexpress_pages" / f"{slug}.html"
        html = fetch_cached(link, dest)
        time.sleep(0.15)
        street = postal = city = ""
        m = re.search(r'class="club-hero__addr"[^>]*>([\s\S]*?)</p>', html)
        if m:
            blob = unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
            street, postal, city = parse_it_address_blob(blob)
            # FitExpress often duplicates CAP/city — clean street further
            if not city:
                mcity = re.search(r"\b\d{5}\s+([A-Za-zÀ-ú'’.\- ]+?)(?:\s*\([A-Z]{2}\))?\s*$", blob)
                if mcity:
                    city = mcity.group(1).strip()
        if not city:
            city = title
        # Named gym POI via Google Maps search query (not used as coords unless embed)
        lat = lng = None
        coord_source = None
        rows.append(
            row(
                "Fit Express",
                f"Fit Express {title}".strip(),
                street,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                notes=f"fitexpress_wp_id={c.get('id')}",
                website=link,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    log(f"    Fit Express rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# WebFit — map markers on /palestre/
# ---------------------------------------------------------------------------

def discover_webfit() -> list[dict]:
    log("  WebFit palestre markers...")
    html = fetch_cached("https://www.webfit.it/palestre/", RAW / "webfit_palestre.html")
    rows = []
    parts = re.split(r'<div class="marker\b', html)
    for part in parts[1:]:
        lat_m = re.search(r'data-lat="([^"]+)"', part)
        lng_m = re.search(r'data-lng="([^"]+)"', part)
        title_m = re.search(r"<h[1-6][^>]*>([^<]+)", part)
        addr_m = re.search(r"<p[^>]*>([^<]+)</p>", part)
        if not title_m:
            continue
        name = unescape(title_m.group(1))
        addr_blob = unescape(addr_m.group(1)) if addr_m else ""
        street, postal, city = parse_it_address_blob(addr_blob)
        # "Via X - Milano (MI)" often no CAP
        if not city:
            m = re.search(r"-\s*([A-Za-zÀ-ú'’.\- ]+)\s*\(([A-Z]{2})\)", addr_blob)
            if m:
                city = m.group(1).strip()
            street = re.sub(r"\s*-\s*[A-Za-zÀ-ú'’.\- ]+\s*\([A-Z]{2}\)\s*$", "", addr_blob).strip()
        try:
            lat = float(lat_m.group(1)) if lat_m else None
            lng = float(lng_m.group(1)) if lng_m else None
        except ValueError:
            lat = lng = None
        if lat is not None and not in_italy_bbox(lat, lng):
            lat = lng = None
        rows.append(
            row(
                "WebFit",
                name if name.lower().startswith("webfit") else f"WebFit {name}",
                street,
                postal,
                city,
                "https://www.webfit.it/palestre/",
                lat=lat,
                lng=lng,
                notes="webfit_map_marker",
                website="https://www.webfit.it/palestre/",
                coord_source="OFFICIAL_MAP_PIN" if lat is not None else None,
                source_type="official_map_markers",
            )
        )
    log(f"    WebFit rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# 20Hours — club list + club pages
# ---------------------------------------------------------------------------

def discover_20hours() -> list[dict]:
    log("  20Hours palestre...")
    html = fetch_cached("https://www.20hours.it/palestre/", RAW / "20hours_palestre.html")
    hrefs = sorted(
        set(
            re.findall(
                r'href="(/palestre/club-[^"#]+)"',
                html,
            )
        )
    )
    rows = []
    for href in hrefs:
        url = "https://www.20hours.it" + href
        slug = href.rstrip("/").split("/")[-1]
        dest = RAW / "20hours_pages" / f"{slug}.html"
        page = fetch_cached(url, dest)
        time.sleep(0.2)
        name = f"20Hours {slug.replace('club-', '').replace('-', ' ').title()}"
        tm = re.search(r"<h1[^>]*>([^<]+)", page)
        if tm:
            name = unescape(tm.group(1))
            if not name.lower().startswith("20"):
                name = f"20Hours {name}"
        street = postal = city = ""
        lat = lng = None
        coord_source = None
        # JSON-LD
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
            try:
                data = json.loads(m.group(1))
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                if not isinstance(it, dict):
                    continue
                addr = it.get("address")
                if isinstance(addr, dict):
                    street = addr.get("streetAddress") or street
                    postal = it_postal(addr.get("postalCode") or "") or postal
                    city = addr.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    try:
                        lat = float(geo.get("latitude"))
                        lng = float(geo.get("longitude"))
                        if in_italy_bbox(lat, lng):
                            coord_source = "OFFICIAL_COORDINATE"
                        else:
                            lat = lng = None
                    except (TypeError, ValueError):
                        pass
        if not street:
            m = re.search(
                r"((?:Via|Viale|Corso|Piazza)[^<\n]{5,80})",
                page,
            )
            if m:
                street, postal, city = parse_it_address_blob(unescape(m.group(1)))
        rows.append(
            row(
                "20Hours",
                name,
                street,
                postal,
                city or "",
                url,
                lat=lat,
                lng=lng,
                notes="20hours_club_page",
                website=url,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    log(f"    20Hours rows: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Fitness Park Italy — RomaEst
# ---------------------------------------------------------------------------

def discover_fitnesspark() -> list[dict]:
    log("  Fitness Park Italy...")
    url = "https://www.fitnesspark.it/club/romaest/"
    html = fetch_cached(url, RAW / "fitnesspark_romaest.html")
    street = "Centro commerciale RomaEst, Via Collatina"
    postal = "00132"
    city = "Roma"
    lat = lng = None
    coord_source = None
    for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for it in items:
            if not isinstance(it, dict):
                continue
            addr = it.get("address")
            if isinstance(addr, dict):
                street = addr.get("streetAddress") or street
                postal = it_postal(addr.get("postalCode") or "") or postal
                loc = addr.get("addressLocality") or city
                city = re.sub(r"\s*RM\s*$", "", loc).strip() or city
            geo = it.get("geo")
            if isinstance(geo, dict):
                try:
                    lat = float(geo.get("latitude"))
                    lng = float(geo.get("longitude"))
                    if in_italy_bbox(lat, lng):
                        coord_source = "OFFICIAL_COORDINATE"
                    else:
                        lat = lng = None
                except (TypeError, ValueError):
                    pass
    return [
        row(
            "Fitness Park",
            "Fitness Park RomaEst",
            street,
            postal,
            city,
            url,
            lat=lat,
            lng=lng,
            notes="fitnesspark_italy_first_club",
            website=url,
            coord_source=coord_source,
            source_type="official_club_page",
        )
    ]


# ---------------------------------------------------------------------------
# Orange Palestre — list slugs only (detail pages hostile / Livewire CSRF)
# ---------------------------------------------------------------------------

def discover_orange() -> list[dict]:
    log("  Orange Palestre: list pages (addresses incomplete — Phase 2)...")
    rows = []
    seen = set()
    for p in (1, 2, 3):
        url = f"https://www.orangepalestre.it/palestre?p={p}"
        html = fetch_cached(url, RAW / f"orange_palestre_p{p}.html")
        hrefs = sorted(set(re.findall(r'href="(/palestre/[a-z0-9\-]+)"', html)))
        titles = [unescape(t) for t in re.findall(r'club-card-title title-large[^>]*>([^<]+)', html)]
        # titles appear duplicated in hover; unique preserve order
        uniq_titles = []
        for t in titles:
            if t not in uniq_titles:
                uniq_titles.append(t)
        for i, href in enumerate(hrefs):
            slug = href.split("/")[-1]
            if slug in seen:
                continue
            seen.add(slug)
            title = uniq_titles[i] if i < len(uniq_titles) else slug.replace("-", " ").title()
            # Infer city token from slug prefix when multi-word city
            city = title.split()[0] if title else ""
            rows.append(
                row(
                    "Orange",
                    f"Orange {title}".strip(),
                    "",  # no confident street on list/detail HTML
                    "",
                    city,
                    "https://www.orangepalestre.it" + href,
                    notes="orange_list_only_no_address; livewire_hostile_phase2",
                    website="https://www.orangepalestre.it" + href,
                    source_type="official_list_incomplete",
                )
            )
        time.sleep(0.3)
    log(f"    Orange incomplete rows: {len(rows)}")
    return rows


def main():
    log("=== Italy Phase 1 discovery ===")
    all_rows: list[dict] = []
    chains = [
        ("fitactive", discover_fitactive),
        ("rsg_magicline", discover_rsg_magicline),
        ("virgin_active", discover_virgin_active),
        ("fitup", discover_fitup),
        ("fitexpress", discover_fitexpress),
        ("webfit", discover_webfit),
        ("20hours", discover_20hours),
        ("fitnesspark", discover_fitnesspark),
        ("orange", discover_orange),
    ]
    for name, fn in chains:
        log(f"\n[{name}]")
        try:
            rows = fn()
        except Exception as e:
            log(f"  ERROR {name}: {e}")
            rows = []
        dump(name, rows)
        all_rows.extend(rows)

    combined = OUT / "italy_discovery_combined.json"
    combined.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\nTOTAL discovered rows: {len(all_rows)}")
    log(f"Wrote {combined}")


if __name__ == "__main__":
    main()
