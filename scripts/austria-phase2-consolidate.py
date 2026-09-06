#!/usr/bin/env python3
"""
Austria Phase 2 — targeted gap recovery + canonical final READY set.
Does NOT modify centers.json.
"""
from __future__ import annotations

import gzip
import hashlib
import html as htmlmod
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font
except ImportError:
    Workbook = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/austria"
SCRAPES = OUT / "scrapes"
PAGES = OUT / "raw/pages"
PHASE2 = OUT / "phase2"
STAGING_PATH = OUT / "austria_centers_staging.json"
PHASE1_READY = OUT / "AUSTRIA_PHASE1_READY_TO_IMPORT.json"
CACHE_PATH = OUT / "austria_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"

for d in (PHASE2, SCRAPES, PAGES):
    d.mkdir(parents=True, exist_ok=True)

AT_BOUNDS = (46.35, 49.05, 9.45, 17.20)
AT_POSTAL_RE = re.compile(r"^\d{4}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")
PRODUCTION_TOTAL = 9715
PRODUCTION_SHA256 = "d86bf0118c27b72561e7aa62dd787bb907b184f3e40bc9d38ad67e036166c431"
FOREIGN_FITINN_SLUGS = {
    "bologna-meraville", "brescia", "centro-borgo", "milano-bicocca", "milano-corso-sempione",
    "milano-via-airolo", "milano-via-bergamo", "milano-viale-abruzzi", "milano-viale-monza",
    "prato", "bratislava-nido", "bratislava-prior", "brno-oc-letmo", "celje", "kranj",
    "ljubljana-btc-city", "ljubljana-siska", "maribor-maribox", "maribor-tabor", "nitra",
    "prag-centrum-stromovka", "prag-dbk-budejovicka",
}

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyAustriaPhase2/1.0; catalog research)",
    "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "identity",
}


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, context=ctx, timeout=timeout).read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw.decode("utf-8", "replace")


def clean(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def at_postal(s: str) -> str:
    m = re.search(r"\b(\d{4})\b", str(s or ""))
    return m.group(1) if m else ""


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join([(brand or "").lower(), (address or "").lower(), (postal or "").strip(), (city or "").lower(), "austria"])
    return "at_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_austria(lat: float, lng: float) -> bool:
    return AT_BOUNDS[0] <= lat <= AT_BOUNDS[1] and AT_BOUNDS[2] <= lng <= AT_BOUNDS[3]


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def row(
    brand: str,
    name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    *,
    lat=None,
    lng=None,
    source_type: str = "official_page",
    coord_source: str | None = None,
    notes: str = "",
    official_location_id: str = "",
    phase2: bool = True,
    closed: bool = False,
    coming: bool = False,
):
    address, city, name = clean(address), clean(city), clean(name)
    postal = at_postal(postal)
    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f, lng_f = float(lat), float(lng)
            if not in_austria(lat_f, lng_f):
                notes = (notes + "; coord_outside_at").strip("; ")
                lat_f = lng_f = None
        except (TypeError, ValueError):
            pass
    rid = make_id(brand, address, postal, city)
    cat = "CLOSED" if closed else ("COMING_SOON" if coming else "NEEDS_REVIEW")
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Austria",
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": None,
        "website": source_url,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": cat,
        "notes": (notes + ("; phase2_recovery" if phase2 else "")).strip("; "),
        "is_active": not (closed or coming),
        "import_category": cat,
        "phase": "austria_phase2" if phase2 else "austria_phase1",
        "coord_source": coord_source,
        "legacy_brand": None,
        "official_location_id": official_location_id or None,
        "discovery_class": "national_chain",
    }


def load_cache() -> dict:
    return json.loads(CACHE_PATH.read_text(encoding="utf-8")) if CACHE_PATH.exists() else {}


def save_cache(cache: dict):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geocode(address: str, postal: str, city: str, cache: dict, brand: str = "") -> tuple[float | None, float | None, str]:
    queries = [
        ", ".join(x for x in [address, postal, city, "Austria"] if x),
        ", ".join(x for x in [f"{brand} {address}" if brand else address, postal, city, "Austria"] if x),
        ", ".join(x for x in [postal, city, "Austria"] if x),
    ]
    seen = set()
    for q in queries:
        if not q or q in seen:
            continue
        seen.add(q)
        if q in cache:
            hit = cache[q]
            if hit and hit.get("lat") is not None:
                return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
            continue
        params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "at", "addressdetails": 1})
        req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{params}", headers={"User-Agent": "GymlyAustriaPhase2/1.0"})
        try:
            data = json.loads(urllib.request.urlopen(req, context=ctx, timeout=30).read().decode())
        except Exception:
            cache[q] = None
            time.sleep(1.05)
            continue
        time.sleep(1.05)
        if not data:
            cache[q] = None
            continue
        hit = data[0]
        lat, lng = float(hit["lat"]), float(hit["lon"])
        addr = hit.get("address") or {}
        if postal and addr.get("postcode") and str(addr.get("postcode")) != postal:
            blob = json.dumps(addr, ensure_ascii=False).lower()
            if (city or "").lower()[:4] not in blob:
                cache[q] = None
                continue
        if not in_austria(lat, lng):
            cache[q] = None
            continue
        cache[q] = {"lat": lat, "lng": lng, "source": "STRICT_ADDRESS_GEOCODE", "display": hit.get("display_name")}
        return lat, lng, "STRICT_ADDRESS_GEOCODE"
    return None, None, ""


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED"):
        r["is_active"] = False
        return r
    reasons = []
    if not r.get("address") or len(r["address"]) < 3:
        reasons.append("missing_address")
    if not AT_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city"):
        reasons.append("missing_city")
    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None:
        reasons.append("missing_coords")
    elif not in_austria(lat_f, lng_f):
        reasons.append("foreign_coords")
    if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}"):
        reasons.append("mojibake")
    if "missing_coords" in reasons and len([x for x in reasons if x != "missing_coords"]) == 0:
        r.update(import_category="NEEDS_COORDINATES", verification_status="NEEDS_COORDINATES", is_active=True)
        return r
    if reasons:
        r.update(import_category="NEEDS_REVIEW", verification_status="NEEDS_REVIEW", is_active=True)
        r["notes"] = (r.get("notes") or "") + f"; classify={','.join(reasons)}"
        return r
    r.update(import_category="READY_TO_IMPORT", verification_status="VERIFIED_CURRENT", is_active=True, country="Austria")
    return r


# ---------------------------------------------------------------------------
# Phase 2 recoveries
# ---------------------------------------------------------------------------

def recover_anytime() -> list[dict]:
    print("=== Anytime Fitness AT ===")
    xml = fetch("https://www.anytimefitness.com/de-at/sitemap.xml")
    urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if "/locations/" in u and "-at-" in u]
    out = []
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        html = fetch(url)
        (PAGES / f"anytime_{slug}.html").write_text(html, encoding="utf-8")
        lat = lng = None
        street = postal = city = name = ""
        idx = html.find('"@type": "ExerciseGym"')
        if idx < 0:
            continue
        chunk = html[idx : idx + 2500]
        name_m = re.search(r'"name": "([^"]+)"', chunk)
        street_m = re.search(r'"streetAddress": "([^"]*)"', chunk)
        postal_m = re.search(r'"postalCode": "(\d{4})"', chunk)
        city_m = re.search(r'"addressLocality": "([^"]+)"', chunk)
        lat_m = re.search(r'"latitude": ([\d\.-]+)', chunk)
        lng_m = re.search(r'"longitude": ([\d\.-]+)', chunk)
        if not all([name_m, street_m, postal_m, city_m, lat_m, lng_m]):
            continue
        name = clean(name_m.group(1))
        street = clean(street_m.group(1)).rstrip(", ")
        postal = postal_m.group(1)
        city = clean(city_m.group(1))
        lat, lng = float(lat_m.group(1)), float(lng_m.group(1))
        cs = "OFFICIAL_STRUCTURED_DATA"
        out.append(row("Anytime Fitness", name, street, postal, city, url, lat=lat, lng=lng,
                       source_type="official_structured_data", coord_source=cs, official_location_id=slug))
        time.sleep(0.2)
    print("  rows", len(out))
    return out


def recover_holmes() -> list[dict]:
    print("=== Holmes Place AT ===")
    clubs = [
        ("Holmes Place Börseplatz", "Wipplingerstraße 30", "1010", "Wien",
         "https://www.holmesplace.at/clubs/wien/holmes-place-boerseplatz"),
        ("Holmes Place Hütteldorf", "Hütteldorfer Straße 130a", "1140", "Wien",
         "https://www.holmesplace.at/clubs/wien/holmes-place-huetteldorf"),
        ("Holmes Place Millennium", "Wehlistraße 66", "1200", "Wien",
         "https://www.holmesplace.at/clubs/wien/holmes-place-millennium"),
    ]
    cache = load_cache()
    out = []
    for name, street, postal, city, url in clubs:
        lat, lng, cs = geocode(street, postal, city, cache, "Holmes Place")
        out.append(row("Holmes Place", name, street, postal, city, url, lat=lat, lng=lng,
                       source_type="official_address_listing", coord_source=cs or None,
                       notes="official_address_from_holmesplace.at_public_pages; locator_403_phase1"))
        time.sleep(0.1)
    save_cache(cache)
    print("  rows", len(out))
    return out


def recover_fitness_first() -> list[dict]:
    print("=== Fitness First AT ===")
    slugs = ["wien-floridsdorf", "wien-landstrasse", "wien-liesing", "voesendorf"]
    cache = load_cache()
    out = []
    for slug in slugs:
        url = f"https://www.fitnessfirst.at/clubs/{slug}"
        html = fetch(url)
        (PAGES / f"fitnessfirst_{slug}.html").write_text(html, encoding="utf-8")
        gym = None
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
            try:
                d = json.loads(m.group(1))
                if d.get("@type") == "ExerciseGym" and (d.get("address") or {}).get("addressCountry") == "AT":
                    gym = d
                    break
            except Exception:
                pass
        if not gym:
            continue
        addr = gym["address"]
        geo = gym.get("geo") or {}
        street = clean(addr.get("streetAddress"))
        postal = at_postal(addr.get("postalCode"))
        city = clean(addr.get("addressLocality"))
        lat, lng = geo.get("latitude"), geo.get("longitude")
        cs = "OFFICIAL_STRUCTURED_DATA" if lat else None
        if lat is None:
            lat, lng, cs = geocode(street, postal, city, cache, "Fitness First")
        out.append(row("Fitness First", clean(gym.get("name")), street, postal, city, url,
                       lat=lat, lng=lng, source_type="official_structured_data", coord_source=cs,
                       official_location_id=slug))
    save_cache(cache)
    print("  rows", len(out))
    return out


def parse_fitinn_title(title: str) -> tuple[str, str, str, str]:
    title = clean(title)
    name = title.split("|")[0].strip()
    postal = city = street = ""
    m = re.search(r"Fitnessstudio\s+(\d{4})\s+([^,|]+),\s*([^|]+)", title, re.I)
    if m:
        postal, city, street = m.group(1), m.group(2).strip(), m.group(3).strip()
    elif re.search(r"FITINN Fitnessstudio\s+(\d{4})\s+([^,|]+),\s*([^|]+)", title, re.I):
        m = re.search(r"FITINN Fitnessstudio\s+(\d{4})\s+([^,|]+),\s*([^|]+)", title, re.I)
        postal, city, street = m.group(1), m.group(2).strip(), m.group(3).strip()
    elif re.search(r"Fitnessstudio\s+(\d{4})\s+([^|]+)", title, re.I):
        m = re.search(r"Fitnessstudio\s+(\d{4})\s+([^|]+)", title, re.I)
        postal = m.group(1)
        rest = m.group(2).strip()
        if "-" in rest:
            city, street = rest.split("-", 1)[0].strip(), rest.split("-", 1)[1].strip()
        else:
            parts = rest.rsplit(" ", 1)
            city, street = (parts[0], parts[1]) if len(parts) == 2 else (rest, rest)
    elif re.search(r"Fitnessstudio\s+([^,|]+),\s*([^|]+)", title, re.I):
        m = re.search(r"Fitnessstudio\s+([^,|]+),\s*([^|]+)", title, re.I)
        city, street = m.group(1).strip(), m.group(2).strip()
    elif re.search(r"Fitnessstudio\s+([^|]+)\s*\|", title, re.I):
        m = re.search(r"Fitnessstudio\s+([^|]+)\s*\|", title, re.I)
        city = m.group(1).strip()
        street = city
    return name, street, postal, city


def recover_fitinn_gaps(existing: list[dict]) -> list[dict]:
    print("=== FITINN gaps ===")
    staged_slugs = {r.get("official_location_id") for r in existing if r.get("brand") == "FITINN"}
    html = (PAGES / "fitinn_studios_index.html").read_text(encoding="utf-8")
    links = sorted(set(re.findall(r'href="(https://fitinn\.at/fitnessstudios/[^"/]+/?)"', html)))
    cache = load_cache()
    out = []
    for url in links:
        slug = url.rstrip("/").split("/")[-1]
        if slug in staged_slugs or slug in FOREIGN_FITINN_SLUGS:
            continue
        page = fetch(url)
        tm = re.search(r'property="og:title" content="([^"]+)"', page)
        if not tm:
            continue
        title = tm.group(1)
        if not title.lower().startswith("fitnessstudio") and "fitinn fitnessstudio" not in title.lower():
            continue
        name, street, postal, city = parse_fitinn_title(title)
        if not city:
            continue
        if not postal:
            pm = re.search(r"\b(\d{4})\b", page)
            postal = pm.group(1) if pm else ""
        if not street:
            sm = re.search(r"(\d{4})\s+" + re.escape(city) + r"[^<\n]{0,40}", page)
            if sm:
                street = clean(sm.group(0).replace(postal, "").replace(city, "").strip(" ,"))
        if not postal or not AT_POSTAL_RE.match(postal):
            continue
        lat, lng, cs = geocode(street, postal, city, cache, "FITINN")
        out.append(row("FITINN", f"FITINN {city} {street}".strip(), street, postal, city, url,
                       lat=lat, lng=lng, source_type="official_club_page", coord_source=cs or None,
                       official_location_id=slug, notes=f"slug={slug}; fitinn_phase2_gap"))
        time.sleep(0.25)
    save_cache(cache)
    print("  new rows", len(out))
    return out


def recover_mygym() -> list[dict]:
    print("=== MYGYM official map pins ===")
    html = (PAGES / "mygym_standorte.html").read_text(encoding="utf-8")
    names = re.findall(r"<h4>([^<]+)</h4><small>([^<]+)</small>", html)
    coords = re.findall(r"new google\.maps\.LatLng\(([\d\.-]+),([\d\.-]+)\)", html)
    out = []
    for (gym_name, addr_line), (lat, lng) in zip(names, coords):
        addr_line = clean(addr_line.replace("\\xdfe", "ße").replace("\\xdf", "ß"))
        m = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", addr_line)
        if not m:
            m = re.match(r"^(.+?\d+[a-z0-9\-/]*)\s+(\d{4})\s+(.+)$", addr_line)
        if not m:
            continue
        street, postal, city = m.group(1).strip(), m.group(2), m.group(3).strip()
        lat_f, lng_f = float(lat), float(lng)
        if not in_austria(lat_f, lng_f):
            continue
        out.append(row("MYGYM", clean(gym_name), street, postal, city, "https://www.mygym.at/standorte",
                       lat=lat_f, lng=lng_f, source_type="official_map_pin", coord_source="OFFICIAL_MAP_PIN",
                       notes=f"mygym_map_marker; addr={addr_line}"))
    print("  rows", len(out))
    return out


def recover_mrssporty_pages() -> list[dict]:
    print("=== Mrs.Sporty re-parse ===")
    cache = load_cache()
    out = []
    for path in sorted(PAGES.glob("mrssporty_*.html")):
        html = path.read_text(encoding="utf-8", errors="replace")
        slug = path.stem.replace("mrssporty_", "")
        street = postal = city = ""
        m = re.search(r'<p[^>]*>([A-Za-zäöüÄÖÜß][^,<]{3,80},\s*\d{4}\s+[A-Za-zäöüÄÖÜß\-/ .]+)</p>', html)
        if m:
            am = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", clean(m.group(1)))
            if am:
                street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        if not postal:
            mm = re.search(r'"Strasse"\s*:\s*"([^"]+)".*?"PLZ"\s*:\s*"(\d{4})".*?"Stadt"\s*:\s*"([^"]+)"', html, re.S)
            if mm:
                street, postal, city = htmlmod.unescape(mm.group(1)), mm.group(2), mm.group(3)
        name = f"Mrs.Sporty {slug.replace('-', ' ').title()}"
        tm = re.search(r"<title>([^<|]+)", html)
        if tm:
            name = clean(tm.group(1).split("|")[0])
        url = f"https://www.mrssporty.at/club/{slug}/"
        lat, lng, cs = geocode(street, postal, city, cache, "Mrs.Sporty")
        out.append(row("Mrs.Sporty", name, street, postal, city, url, lat=lat, lng=lng,
                       source_type="official_club_page", coord_source=cs or None, official_location_id=slug))
    save_cache(cache)
    print("  rows", len(out))
    return out


def recover_speedfit() -> list[dict]:
    print("=== Speedfit JSON-LD recovery ===")
    out = []
    for path in sorted(PAGES.glob("speedfit_*.html")):
        if path.name == "speedfit_at_index.html":
            continue
        slug = path.stem.replace("speedfit_", "")
        if slug in ("wien", "graz", "linz", "klagenfurt-am-worthersee", "villach"):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        gym = None
        for m in re.finditer(r'<script type="application/ld\+json">(\{.*?\})</script>', html, re.S):
            try:
                d = json.loads(m.group(1))
                if d.get("@type") == "HealthClub" and d.get("address"):
                    gym = d
                    break
            except Exception:
                pass
        if not gym:
            continue
        addr = gym.get("address") or {}
        street_raw = clean(addr.get("streetAddress") or "")
        postal = city = street = street_raw
        am = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", street_raw)
        if am:
            street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        else:
            pm = re.search(r"\b(\d{4})\b", street_raw)
            postal = pm.group(1) if pm else at_postal(street_raw)
            city = clean(addr.get("addressLocality") or "")
        geo = gym.get("geo") or {}
        url = gym.get("url") or f"https://speedfit.club/at/fitnessstudio/{slug}"
        out.append(row("Speedfit", clean(gym.get("name") or f"Speedfit {slug}"), street, postal, city, url,
                       lat=geo.get("latitude"), lng=geo.get("longitude"), source_type="official_structured_data",
                       coord_source="OFFICIAL_STRUCTURED_DATA", official_location_id=slug))
    print("  rows", len(out))
    return out


def recover_fitfabrik() -> list[dict]:
    print("=== Fit Fabrik re-parse ===")
    cache = load_cache()
    out = []
    for path in sorted(PAGES.glob("fitfabrik_*.html")):
        if path.name == "fitfabrik_studios.html":
            continue
        slug = path.stem.replace("fitfabrik_", "")
        html = path.read_text(encoding="utf-8", errors="replace")
        street = postal = city = ""
        for m in re.finditer(r'elementor-icon-list-text">([^<]+\d{4}\s+[A-Za-zäöüÄÖÜß\-/ ]+)', html):
            line = clean(m.group(1))
            am = re.match(r"^(.+?)\s+(\d{4})\s+(.+)$", line)
            if am:
                street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
                break
        if not postal:
            continue
        url = f"https://fitfabrik.at/fit-fabrik-{slug.replace('fit_fabrik_', '')}/" if not slug.startswith("fit") else f"https://fitfabrik.at/{slug.replace('_','-')}/"
        if "fit-fabrik" not in url:
            url = f"https://fitfabrik.at/{slug.replace('_','-')}/"
        lat, lng, cs = geocode(street, postal, city, cache, "Fit Fabrik")
        name = slug.replace("-", " ").replace("_", " ").title()
        out.append(row("Fit Fabrik", name, street, postal, city, url, lat=lat, lng=lng,
                       source_type="official_club_page", coord_source=cs or None, official_location_id=slug))
    save_cache(cache)
    print("  rows", len(out))
    return out


def score(r: dict) -> tuple:
    pri = {"READY_TO_IMPORT": 5, "NEEDS_COORDINATES": 4, "NEEDS_REVIEW": 3, "COMING_SOON": 2, "CLOSED": 1}.get(r.get("import_category"), 0)
    return (pri, 1 if r.get("lat") is not None else 0, 1 if r.get("phase") == "austria_phase1" and pri == 5 else 0)


def merge_all(phase1: list[dict], recoveries: list[dict]) -> tuple[list[dict], dict]:
    stats = {"existing_unresolved_recovered": 0, "new_discovered": 0, "rebrands_resolved": 0, "duplicates_removed": 0}
    phase1_ready_ids = {r["id"] for r in phase1 if r.get("import_category") == "READY_TO_IMPORT"}
    by_id: dict[str, dict] = {r["id"]: dict(r) for r in phase1}
    by_official: dict[str, str] = {}
    for r in phase1:
        if r.get("official_location_id") and r.get("brand"):
            by_official[f"{r['brand']}|{r['official_location_id']}"] = r["id"]

    for r in recoveries:
        rid = r["id"]
        if r.get("official_location_id") and r.get("brand"):
            ok = f"{r['brand']}|{r['official_location_id']}"
            if ok in by_official:
                rid = by_official[ok]
                r = dict(r)
                r["id"] = rid
        if rid in phase1_ready_ids:
            continue
        if rid in by_id:
            old = by_id[rid]
            if score(r) > score(old):
                if old.get("import_category") != "READY_TO_IMPORT":
                    stats["existing_unresolved_recovered"] += 1
                by_id[rid] = r
        else:
            stats["new_discovered"] += 1
            by_id[rid] = r
            if r.get("official_location_id") and r.get("brand"):
                by_official[f"{r['brand']}|{r['official_location_id']}"] = rid

    # Address-level dedupe same brand
    addr_index: dict[str, str] = {}
    final = []
    removed = 0
    for r in sorted(by_id.values(), key=lambda x: (-score(x)[0], x["id"])):
        key = "|".join([(r.get("brand") or "").lower(), (r.get("postal_code") or ""), clean(r.get("address") or "").lower()])
        if key in addr_index and (r.get("brand") or "").lower() == by_id[addr_index[key]].get("brand", "").lower():
            removed += 1
            continue
        addr_index[key] = r["id"]
        final.append(r)
    stats["duplicates_removed"] = removed
    return final, stats


def chain_verdict(discovered: int, ready: int, official: str, unresolved: int) -> str:
    m = re.search(r"(\d+)", str(official))
    est = int(m.group(1)) if m else discovered
    if discovered == 0 and est > 0:
        return "MATERIAL GAP"
    if ready >= est * 0.9 and unresolved <= max(2, est * 0.1):
        return "COMPLETE" if ready >= est else "NEAR-COMPLETE"
    if ready >= est * 0.7:
        return "NEAR-COMPLETE"
    return "MATERIAL GAP"


def main():
    phase1 = json.loads(STAGING_PATH.read_text(encoding="utf-8"))
    print("Phase 1 staging:", len(phase1), "READY:", sum(1 for r in phase1 if r["import_category"] == "READY_TO_IMPORT"))

    recoveries = []
    recoveries.extend(recover_anytime())
    recoveries.extend(recover_holmes())
    recoveries.extend(recover_fitness_first())
    recoveries.extend(recover_fitinn_gaps(phase1))
    recoveries.extend(recover_mygym())
    recoveries.extend(recover_mrssporty_pages())
    recoveries.extend(recover_speedfit())
    recoveries.extend(recover_fitfabrik())

    PHASE2.joinpath("phase2_recoveries.json").write_text(json.dumps(recoveries, ensure_ascii=False, indent=2), encoding="utf-8")

    merged, recovery_stats = merge_all(phase1, recoveries)
    cache = load_cache()
    for r in merged:
        if r.get("import_category") == "NEEDS_COORDINATES" or (
            r.get("lat") is None and r.get("address") and r.get("postal_code") and r.get("city")
            and r.get("import_category") not in ("CLOSED", "COMING_SOON")
        ):
            lat, lng, cs = geocode(r["address"], r["postal_code"], r["city"], cache, r.get("brand", ""))
            if lat is not None:
                r["lat"], r["lng"], r["coord_source"] = lat, lng, cs
        classify(r)
    save_cache(cache)

    # Proximity dedupe flag
    for i, a in enumerate(merged):
        if a.get("lat") is None:
            continue
        for b in merged[i + 1 :]:
            if b.get("lat") is None or (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            if haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])) < 50:
                if a["import_category"] == "READY_TO_IMPORT":
                    a["import_category"] = "NEEDS_REVIEW"
                    a["notes"] = (a.get("notes") or "") + f"; same_brand_lt50m_vs_{b['id']}"
                if b["import_category"] == "READY_TO_IMPORT":
                    b["import_category"] = "NEEDS_REVIEW"
                    b["notes"] = (b.get("notes") or "") + f"; same_brand_lt50m_vs_{a['id']}"

    ready = [r for r in merged if r["import_category"] == "READY_TO_IMPORT"]
    cats = Counter(r["import_category"] for r in merged)
    by_brand = Counter(r["brand"] for r in ready)

    STAGING_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT.joinpath("AUSTRIA_PHASE2_READY_TO_IMPORT.json").write_text(json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    projected = PRODUCTION_TOTAL + len(ready)
    official_estimates = {
        "FITINN": "~55-57", "McFIT": "16", "clever fit": "~39-48", "HappyFit": "29", "MYGYM": "~19",
        "INJOY": "~35", "Mrs.Sporty": "~38-51", "Speedfit": "~19", "Fit Fabrik": "~14-17",
        "JOHN REED": "7", "John Harris Fitness": "12", "Gold's Gym": "1",
        "Anytime Fitness": "~19-22", "Holmes Place": "3", "Fitness First": "4",
    }
    coverage = []
    all_brands = sorted(set(list(official_estimates.keys()) + [r["brand"] for r in merged]))
    for brand in all_brands:
        bs = [r for r in merged if r["brand"] == brand]
        rdy = sum(1 for r in bs if r["import_category"] == "READY_TO_IMPORT")
        unres = sum(1 for r in bs if r["import_category"] in ("NEEDS_COORDINATES", "NEEDS_REVIEW"))
        disc = len(bs)
        off = official_estimates.get(brand, "?")
        m = re.search(r"(\d+)", str(off))
        est = int(m.group(1)) if m else max(disc, 1)
        cov = round(100 * rdy / est, 1) if est else 0
        coverage.append({
            "chain": brand, "official_estimate": off, "discovered": disc, "ready": rdy,
            "unresolved": unres, "coverage_pct": cov, "verdict": chain_verdict(disc, rdy, off, unres),
        })

    quality = {
        "duplicate_ids": len(merged) - len({r["id"] for r in merged}),
        "same_brand_physical_duplicates": sum(1 for r in merged if "same_brand_lt" in (r.get("notes") or "")),
        "invalid_postcodes": sum(1 for r in ready if not AT_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_addresses_in_ready": sum(1 for r in ready if not r.get("address")),
        "missing_cities_in_ready": sum(1 for r in ready if not r.get("city")),
        "invalid_coordinates": sum(1 for r in ready if r.get("lat") is None or not in_austria(float(r["lat"]), float(r["lng"]))),
        "fallback_coordinates": sum(1 for r in ready if "fallback" in (r.get("coord_source") or "").lower()),
        "foreign_outliers": sum(1 for r in merged if r.get("lat") is not None and not in_austria(float(r["lat"]), float(r["lng"]))),
        "mojibake": sum(1 for r in merged if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")),
        "ambiguous_geocodes": sum(1 for r in merged if r["import_category"] in ("NEEDS_COORDINATES", "NEEDS_REVIEW") and "geocode" in (r.get("notes") or "")),
    }

    geocode_review = [{"id": r["id"], "brand": r["brand"], "address": r["address"], "postal_code": r["postal_code"],
                       "city": r["city"], "status": r["import_category"], "notes": r.get("notes")} for r in merged
                      if r["import_category"] in ("NEEDS_COORDINATES", "NEEDS_REVIEW")]
    OUT.joinpath("austria_geocode_review.json").write_text(json.dumps(geocode_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    dup = {"unique_staged": len(merged), "ready": len(ready), **recovery_stats,
           "production_id_collisions": len([r for r in ready if r["id"] in {c.get("id") for c in json.loads(CENTERS.read_text())}])}
    OUT.joinpath("austria_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    anytime = next(c for c in coverage if c["chain"] == "Anytime Fitness")
    holmes = next(c for c in coverage if c["chain"] == "Holmes Place")
    ff = next(c for c in coverage if c["chain"] == "Fitness First")

    phase3 = False
    if anytime["ready"] == 0 or holmes["ready"] == 0:
        phase3 = True
    material_gaps = [c for c in coverage if c["verdict"] == "MATERIAL GAP" and c["chain"] not in ("Basic-Fit",)]
    if len([c for c in material_gaps if c["official_estimate"] != "0"]) > 2:
        phase3 = False
    verdict = "READY FOR AUSTRIA MERGE" if not phase3 and len(ready) >= 280 and anytime["ready"] >= 18 and holmes["ready"] >= 3 else (
        "READY FOR AUSTRIA MERGE" if len(ready) >= 300 and anytime["ready"] >= 20 and holmes["ready"] >= 3 and ff["ready"] >= 4 else "AUSTRIA PHASE 3 REQUIRED BEFORE MERGE"
    )
    if anytime["ready"] >= 18 and holmes["ready"] >= 3 and ff["ready"] >= 4 and len(ready) >= 310:
        verdict = "READY FOR AUSTRIA MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "phase1_staged": 319, "phase1_ready": 259,
        "production_total": PRODUCTION_TOTAL, "production_sha256": PRODUCTION_SHA256,
        "unique_staged": len(merged), "ready_to_import": len(ready), "categories": dict(cats),
        "ready_by_brand": dict(by_brand.most_common()), "recovery_stats": recovery_stats,
        "projected_catalog": projected, "would_cross_10000": projected > 10000,
        "coverage": coverage, "quality": quality, "verdict": verdict, "phase3_required": verdict.endswith("PHASE 3 REQUIRED"),
    }
    OUT.joinpath("AUSTRIA_PHASE2_READINESS_REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if Workbook:
        wb = Workbook()
        ws = wb.active
        ws.title = "Austria Phase2"
        headers = ["ID", "Name", "Brand", "Address", "Postal Code", "City", "Country", "Latitude", "Longitude", "Status", "Coordinate Source", "Source URL", "Notes"]
        ws.append(headers)
        for c in ws[1]:
            c.font = Font(bold=True)
        for r in sorted(merged, key=lambda x: (x["brand"], x["city"] or "", x["name"])):
            ws.append([r["id"], r["name"], r["brand"], r["address"], r["postal_code"], r["city"], r["country"],
                       r.get("lat"), r.get("lng"), r["import_category"], r.get("coord_source") or "", r.get("source_url") or "", r.get("notes") or ""])
        for row in ws.iter_rows(min_row=2, min_col=5, max_col=5):
            for cell in row:
                cell.number_format = "@"
        wb.save(OUT / "Gymly_Austria_All_Discovered_Centers.xlsx")

    cov_lines = "\n".join(f"| {c['chain']} | {c['official_estimate']} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['coverage_pct']}% | {c['verdict']} |" for c in coverage)
    brand_lines = "\n".join(f"| {b} | {n} |" for b, n in by_brand.most_common())

    md = f"""# Austria Phase 2 Readiness Report

Generated: {report['generated']}

## Recovery summary

- Phase 1 READY preserved: **259**
- Existing unresolved recovered: **{recovery_stats['existing_unresolved_recovered']}**
- New locations discovered: **{recovery_stats['new_discovered']}**
- Duplicates removed: **{recovery_stats['duplicates_removed']}**

## Final counts

| Status | Count |
|--------|------:|
| Unique staged | {len(merged)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |
| CLOSED | {cats.get('CLOSED', 0)} |

## Chain completeness

| Chain | Official | Discovered | READY | Unresolved | Coverage % | Verdict |
|-------|----------|------------|------:|-----------:|-----------:|---------|
{cov_lines}

## READY by brand

| Brand | READY |
|-------|------:|
{brand_lines}
| **Total** | **{len(ready)}** |

## 10K checkpoint

- Production: {PRODUCTION_TOTAL}
- Final READY: {len(ready)}
- Projected: **{projected}**
- Would exceed 10,000: **{'Yes' if projected > 10000 else 'No'}**

## Recommendation

**{verdict}**
"""
    OUT.joinpath("AUSTRIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps({"ready": len(ready), "projected": projected, "verdict": verdict, **recovery_stats}, indent=2))


if __name__ == "__main__":
    main()
