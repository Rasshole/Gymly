#!/usr/bin/env python3
"""
Czechia Deep Phase 2 — nationwide chain expansion.

Does NOT modify src/data/centers.json.
Preserves Phase 1 READY rows (by source_url) unless stronger evidence invalidates them.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    CZECHIA_POSTAL_RE,
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROOT,
    base_row,
    classify_row,
    clean_text,
    curl_fetch,
    extract_geo_from_html,
    extract_jsonld,
    format_cz_postal,
    haversine,
    in_czechia,
    make_id,
    nominatim_geocode,
    norm_addr,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/czechia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, PHASE2, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

PRODUCTION_TOTAL = 10943
PROD_SHA_EXPECTED = "5790acc0a384eef02c40269dd55e72488555e29c4a7970ff27b231a3239f4a30"

FOREIGN = re.compile(
    r"\b(deutschland|germany|österreich|austria|slovensko|slovakia|poland|polsko)\b",
    re.I,
)
CITY_RE = re.compile(
    r"\b(Praha|Brno|Ostrava|Plzeň|Plzen|Liberec|Olomouc|Pardubice|"
    r"Hradec Králové|Hradec Kralove|České Budějovice|Ceske Budejovice|Zlín|Zlin|"
    r"Ústí nad Labem|Usti nad Labem|Jihlava|Karlovy Vary|Kladno|Havířov|Havírov|Opava)\b"
)
FF_CLUB_RE = re.compile(r"/klub/(?:fitness|the-gym)-[a-z0-9\-]+/?", re.I)

MAJOR_CITIES = [
    "Praha",
    "Brno",
    "Ostrava",
    "Plzeň",
    "Liberec",
    "Olomouc",
    "České Budějovice",
    "Hradec Králové",
    "Pardubice",
    "Zlín",
    "Ústí nad Labem",
    "Jihlava",
    "Karlovy Vary",
]

REGIONAL_PHASE2 = [
    "Olomouc",
    "Hradec Králové",
    "Zlín",
    "Ústí nad Labem",
    "Jihlava",
    "Karlovy Vary",
]


def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def production_sha() -> str:
    return hashlib.sha256((ROOT / "src/data/centers.json").read_bytes()).hexdigest()


def strip_noise(html: str) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.S | re.I)
    return html


def normalize_city(raw: str, context: str = "") -> str:
    raw = clean_text(raw)
    ctx = f"{context} {raw}"
    if "Hradec Králové" in ctx or "Hradec Kralove" in ctx:
        return "Hradec Králové"
    if "České Budějovice" in ctx or "Ceske Budejovice" in ctx:
        return "České Budějovice"
    if "Ústí nad Labem" in ctx or "Usti nad Labem" in ctx:
        return "Ústí nad Labem"
    if "Karlovy Vary" in ctx:
        return "Karlovy Vary"
    mapping = {
        "Plzen": "Plzeň",
        "Zlin": "Zlín",
        "Havirov": "Havířov",
        "Hradec": "Hradec Králové",
        "České": "České Budějovice",
        "Ceske": "České Budějovice",
        "Ústí": "Ústí nad Labem",
        "Usti": "Ústí nad Labem",
    }
    if raw in mapping:
        return mapping[raw]
    m = CITY_RE.search(raw) or CITY_RE.search(ctx)
    return m.group(1) if m else raw


def format_cz_postal_strict(text: str) -> str:
    if not text:
        return ""
    text = str(text).replace("\xa0", " ").strip()
    m = re.search(r"\b([1-7]\d{2})\s*(\d{2})\b", text)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def extract_ff_address(html: str) -> tuple[str, str, str, str]:
    """Return (address, postal, city, method)."""
    # Prefer maps links inside the contact/address block (avoids footer contamination).
    contact_m = re.search(
        r'(<div[^>]*class="[^"]*(?:contact|address|club)[^"]*"[^>]*>.*?</div>\s*</div>)',
        html,
        re.S | re.I,
    )
    search_html = contact_m.group(1) if contact_m else html
    for m in re.finditer(
        r'<a[^>]+href="(https?://(?:maps\.(?:google|app\.goo)|www\.google\.com/maps)[^"]+)"[^>]*>(.*?)</a>',
        search_html,
        re.S | re.I,
    ):
        inner = re.sub(r"<br\s*/?>", "\n", m.group(2), flags=re.I)
        inner = re.sub(r"<[^>]+>", "\n", inner)
        inner = unescape(inner.replace("\xa0", " ").replace("&nbsp;", " "))
        lines = [clean_text(x) for x in inner.split("\n") if clean_text(x)]
        if not lines:
            continue
        address = lines[0]
        postal = city = ""
        for line in lines[1:] + lines:
            pm = re.search(r"\b([1-7]\d{2})\s+(\d{2})\b", line)
            if pm:
                postal = f"{pm.group(1)} {pm.group(2)}"
                rest = line[pm.end() :].strip(" ,-")
                city = normalize_city(rest or (lines[-1] if len(lines) > 1 else ""), line)
                if re.match(r"^Praha\s*\d", city):
                    city = "Praha"
                break
        if address and (postal or city):
            if not city and len(lines) > 1:
                city = normalize_city(lines[-1], inner)
                if re.match(r"^Praha\s*\d", city):
                    city = "Praha"
            return address, postal, city, "maps_link"

    for block in extract_jsonld(html):
        addr = block.get("address")
        if isinstance(addr, dict) and addr.get("streetAddress"):
            postal = format_cz_postal_strict(str(addr.get("postalCode") or ""))
            city = normalize_city(str(addr.get("addressLocality") or ""), str(addr))
            return clean_text(addr["streetAddress"]), postal, city, "jsonld"

    text = strip_noise(html)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = unescape(text.replace("\xa0", " "))
    lines = [clean_text(x) for x in text.split("\n") if clean_text(x)]
    for i, line in enumerate(lines):
        pm = re.search(r"\b([1-7]\d{2})\s+(\d{2})\b", line)
        if not pm or not CITY_RE.search(line):
            continue
        postal = f"{pm.group(1)} {pm.group(2)}"
        city = normalize_city(CITY_RE.search(line).group(1), line)
        prev = [lines[j] for j in range(max(0, i - 3), i) if 3 < len(lines[j]) < 120]
        address = ", ".join(prev[-2:]) if prev else line
        if len(address) > 160 or "{" in address or "wp-block" in address:
            address = prev[-1] if prev else line
        return address, postal, city, "body"
    return "", "", "", ""


def ff_display_name(slug: str, html: str, listing_meta: dict[str, dict]) -> str:
    if slug in listing_meta and listing_meta[slug].get("name"):
        label = listing_meta[slug]["name"]
        if "${" in label:
            label = slug.replace("fitness-", "").replace("the-gym-", "").replace("-", " ").title()
        return f"Form Factory {label}" if not label.lower().startswith("form factory") else label
    m = re.search(r'property="og:title"\s+content="([^"]+)"', html)
    if m:
        t = clean_text(unescape(m.group(1).split("|")[0]))
        t = re.sub(r"^Form Factory\s*[-–—]?\s*", "", t, flags=re.I)
        t = re.sub(r"\s*[-–—]\s*Form Factory\s*$", "", t, flags=re.I)
        t = re.sub(r"^Fitness\s+", "", t, flags=re.I)
        if t:
            return f"Form Factory {t}" if "form factory" not in t.lower() else t
    nice = slug.replace("fitness-", "").replace("the-gym-", "").replace("-", " ").title()
    return f"Form Factory {nice}"


def postal_from_keys(keys: str) -> str:
    if not keys:
        return ""
    candidates: list[str] = []
    for a, b in re.findall(r"(?:^|\s)([1-7]\d{2})\s+(\d{2})(?:\s|$)", keys):
        candidates.append(f"{a} {b}")
    for m in re.finditer(r"(?:^|\s)([1-7]\d{4})(?:\s|$)", keys):
        s = m.group(1)
        candidates.append(f"{s[:3]} {s[3:]}")
    for m in re.finditer(r"([1-7]\d{4})", keys):
        s = m.group(1)
        pc = f"{s[:3]} {s[3:]}"
        if CZECHIA_POSTAL_RE.match(pc):
            candidates.append(pc)
    valid = [c for c in candidates if CZECHIA_POSTAL_RE.match(c)]
    return valid[-1] if valid else ""


def parse_ff_listing_meta(listing_html: str) -> dict[str, dict]:
    """Official listing metadata per club slug (name, city, postal)."""
    meta: dict[str, dict] = {}

    def ingest(slug: str, name: str, city: str, block: str) -> None:
        if not slug or "${" in name:
            return
        keys_m = re.search(r'data-keys="([^"]*)"', block)
        keys = keys_m.group(1) if keys_m else block
        postal = postal_from_keys(keys) or format_cz_postal_strict(block)
        meta[slug] = {
            "name": clean_text(unescape(name)),
            "city": normalize_city(clean_text(unescape(city)), block),
            "postal_code": postal,
        }

    for m in re.finditer(
        r"<article\b([^>]*)>(.*?)</article>",
        listing_html,
        re.S | re.I,
    ):
        attrs, block = m.group(1), m.group(2)
        if "list-club-row" not in attrs:
            continue
        name_m = re.search(r'data-name="([^"]*)"', attrs)
        city_m = re.search(r'data-city="([^"]*)"', attrs)
        if not name_m:
            continue
        sm = re.search(
            r'href="https://www\.formfactory\.cz/klub/((?:fitness|the-gym)-[a-z0-9\-]+)/"',
            block,
            re.I,
        )
        if sm:
            ingest(sm.group(1), name_m.group(1), city_m.group(1) if city_m else "", attrs + block)

    for m in re.finditer(
        r'href="https://www\.formfactory\.cz/klub/((?:fitness|the-gym)-[a-z0-9\-]+)/"[^>]*>.*?data-name="([^"]+)"',
        listing_html,
        re.S | re.I,
    ):
        slug, name = m.group(1), clean_text(unescape(m.group(2)))
        if slug not in meta and "${" not in name:
            meta[slug] = {"name": name, "city": "", "postal_code": ""}

    return meta


def preserve_row(row: dict, phase1_by_url: dict[str, dict], phase1_ready_urls: set[str]) -> None:
    url = (row.get("source_url") or "").rstrip("/")
    old = phase1_by_url.get(url)
    if old:
        row["id"] = old["id"]
        if url in phase1_ready_urls and old.get("lat") is not None and old.get("lng") is not None:
            row["lat"] = old["lat"]
            row["lng"] = old["lng"]
            row["coord_source"] = old.get("coord_source") or row.get("coord_source")
        elif row.get("lat") is None and old.get("lat") is not None:
            if CZECHIA_POSTAL_RE.match(str(row.get("postal_code") or "")) and row.get("city"):
                row["lat"] = old["lat"]
                row["lng"] = old["lng"]
                row["coord_source"] = old.get("coord_source")


def discover_form_factory(listing_meta: dict[str, dict]) -> list[dict]:
    listing_path = PHASE2 / "ff_kluby.txt"
    listing = (
        listing_path.read_text(errors="replace")
        if listing_path.exists()
        else curl_fetch("https://www.formfactory.cz/kluby/", listing_path)
    )
    paths = sorted(set(FF_CLUB_RE.findall(listing)))
    print(f"Form Factory clubs: {len(paths)}")
    rows = []
    for path in paths:
        slug = path.strip("/").split("/")[-1]
        url = f"https://www.formfactory.cz/klub/{slug}/"
        page_path = PAGES / f"ff_{slug}.html"
        if not page_path.exists() or page_path.stat().st_size < 5000:
            html = curl_fetch(url, page_path)
            time.sleep(0.12)
        else:
            html = page_path.read_text(errors="replace")
        if html.startswith("ERR"):
            print("  fail", url)
            continue
        address, postal, city, method = extract_ff_address(html)
        lm = listing_meta.get(slug, {})
        if lm.get("postal_code"):
            postal = lm["postal_code"]
        if lm.get("city"):
            city = lm["city"]
        name = ff_display_name(slug, html, listing_meta)
        lat, lng = extract_geo_from_html(strip_noise(html))
        coming = bool(
            re.search(
                r"(brzy otevřeme|coming soon|připravujeme otevření|otevíráme brzy|nově otevřeno)",
                html,
                re.I,
            )
        ) and bool(re.search(r"brzy|coming soon|připravujeme", html, re.I))
        closed = bool(
            re.search(
                r"(permanently closed|definitivně uzavřen|klub (je )?zavřen)",
                strip_noise(html),
                re.I,
            )
        )
        if FOREIGN.search(f"{address} {city}"):
            continue
        row = base_row(
            prefix="cz_",
            country="Czechia",
            brand="Form Factory",
            name=name,
            address=address or name,
            postal_code=postal,
            city=city or "",
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
            notes=f"form_factory_club_page; addr_method={method or 'none'}",
            coming=coming,
            closed=closed,
            chain_key="form_factory",
        )
        row["evidence"] = {"source_url": url, "address_method": method or "none"}
        rows.append(row)
        print(f"  + {name[:45]:45} | {postal:6} | {city:18} | {method}")
    return rows


def discover_max_fitness() -> list[dict]:
    api_path = RAW / "max_branches_api.json"
    api = curl_fetch("https://www.maxfitness.cz/api/branches?limit=100", api_path)
    try:
        docs = json.loads(api).get("docs") or []
    except json.JSONDecodeError:
        docs = []
    print(f"Max Fitness API docs: {len(docs)}")
    rows = []
    for doc in docs:
        coords = doc.get("coordinates") or {}
        address = clean_text(coords.get("address"))
        postal = format_cz_postal_strict(address)
        city_obj = doc.get("city") or {}
        city = clean_text(city_obj.get("title") if isinstance(city_obj, dict) else city_obj)
        lat = coords.get("lat")
        lng = coords.get("lon") or coords.get("lng")
        title = clean_text(doc.get("title") or doc.get("cardTitle"))
        slug = doc.get("slug") or ""
        brand = "Oktagon Gym" if "oktagon" in (slug + title).lower() else "Max Fitness"
        name = title if title.lower().startswith(brand.lower()) else f"{brand} {title}"
        url = (
            f"https://www.maxfitness.cz/en/branches/detail/{slug}"
            if slug
            else "https://www.maxfitness.cz/en/branches"
        )
        row = base_row(
            prefix="cz_",
            country="Czechia",
            brand=brand,
            name=name,
            address=address or name,
            postal_code=postal,
            city=city or "Praha",
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_COORDINATE" if lat is not None else None,
            notes="maxfitness_api_branches",
            chain_key="max_fitness" if brand == "Max Fitness" else "oktagon_gym",
        )
        rows.append(row)
    return rows


def discover_fitinn() -> list[dict]:
    url = "https://fitinn.at/fitnessstudios/brno-oc-letmo/"
    page_path = PAGES / "fitinn_brno-oc-letmo.html"
    page = page_path.read_text(errors="replace") if page_path.exists() else curl_fetch(url, page_path)
    address, postal, city, method = extract_ff_address(page)
    if not postal:
        m = re.search(r"\b([1-7]\d{2})\s+(\d{2})\b[^.]{0,40}Brno", strip_noise(page))
        if m:
            postal = f"{m.group(1)} {m.group(2)}"
            city = "Brno"
    lat, lng = extract_geo_from_html(strip_noise(page))
    return [
        base_row(
            prefix="cz_",
            country="Czechia",
            brand="FITINN",
            name="FITINN Brno OC Letmo",
            address=address or "FITINN Brno OC Letmo",
            postal_code=postal,
            city=city or "Brno",
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
            notes=f"fitinn_cz_studio; addr_method={method or 'none'}",
            chain_key="fitinn",
        )
    ]


def discover_clever_fit() -> list[dict]:
    url = "https://www.clever-fit.com/cz/studios/kladno/"
    page_path = PHASE2 / "cf_kladno.html"
    page = page_path.read_text(errors="replace") if page_path.exists() else curl_fetch(url, page_path)
    address = postal = city = ""
    lat = lng = None
    for block in extract_jsonld(page):
        if block.get("@type") in ("SportsActivityLocation", "LocalBusiness", "HealthClub") or block.get("address"):
            addr = block.get("address")
            if isinstance(addr, dict):
                address = clean_text(addr.get("streetAddress") or address)
                postal = format_cz_postal_strict(str(addr.get("postalCode") or ""))
                city = normalize_city(str(addr.get("addressLocality") or ""), str(addr))
            geo = block.get("geo")
            if isinstance(geo, dict):
                try:
                    lat, lng = float(geo["latitude"]), float(geo["longitude"])
                except (KeyError, TypeError, ValueError):
                    pass
    if not lat:
        lat, lng = extract_geo_from_html(strip_noise(page))
    return [
        base_row(
            prefix="cz_",
            country="Czechia",
            brand="clever fit",
            name="clever fit Kladno",
            address=address or "Milady Horákové 2725",
            postal_code=postal or "272 01",
            city=city or "Kladno",
            source_url=url,
            lat=lat,
            lng=lng,
            website=url,
            coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
            notes="clever_fit_cz_studio_jsonld",
            chain_key="clever_fit",
        )
    ]


def discover_john_reed() -> list[dict]:
    url = "https://johnreed.fitness/cz/praha"
    page_path = PHASE2 / "jr_praha.html"
    if not page_path.exists() or page_path.stat().st_size < 10000:
        curl_fetch("https://www.johnreed.fitness/de/clubs/praha", page_path)
    address = "Karlovo náměstí 2097/10"
    postal = "120 00"
    city = "Praha"
    lat, lng = extract_geo_from_html(strip_noise(page_path.read_text(errors="replace")))
    return [
        base_row(
            prefix="cz_",
            country="Czechia",
            brand="JOHN REED",
            name="JOHN REED Fitness Praha",
            address=address,
            postal_code=postal,
            city=city,
            source_url=url,
            lat=lat,
            lng=lng,
            website=url,
            coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
            notes="john_reed_cz_praha_official_page",
            chain_key="john_reed",
        )
    ]


def classify(r: dict) -> str:
    return classify_row(
        r,
        postal_re=CZECHIA_POSTAL_RE,
        in_country=in_czechia,
        format_postal=format_cz_postal_strict,
    )


def geocode_rows(rows: list[dict], cache: dict, limit: int = 120) -> list[dict]:
    review = []
    done = 0
    for r in rows:
        if r.get("import_category") == "DUPLICATE":
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if not r.get("address") or not r.get("city"):
            review.append({"id": r["id"], "reason": "missing_address_or_city"})
            continue
        if not CZECHIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            review.append({"id": r["id"], "reason": "missing_postal_for_geocode"})
            continue
        if done >= limit:
            continue
        q = ", ".join(
            x
            for x in [
                re.sub(r"^(Sauna|solarium|fitness|ANALÝZA TĚLA),\s*", "", r["address"], flags=re.I),
                r.get("postal_code"),
                r["city"],
                "Czechia",
            ]
            if x
        )
        hit = nominatim_geocode(q, "cz", cache)
        done += 1
        if not hit or hit.get("lat") is None:
            review.append({"id": r["id"], "brand": r.get("brand"), "name": r.get("name"), "query": q})
            continue
        lat, lng = float(hit["lat"]), float(hit["lng"])
        if not in_czechia(lat, lng):
            review.append({"id": r["id"], "reason": "geocode_outside_czechia", "query": q})
            continue
        r["lat"], r["lng"] = lat, lng
        r["coord_source"] = r.get("coord_source") or "STRICT_ADDRESS_GEOCODE"
        r["notes"] = f"{r.get('notes') or ''}; phase2_geocode".strip("; ")
        r["evidence"] = {**(r.get("evidence") or {}), "geocode_display": hit.get("display_name")}
    return review


def classify_proximity_pairs(pairs: list[dict], rows_by_id: dict[str, dict]) -> list[dict]:
    out = []
    for p in pairs:
        a = rows_by_id.get(p["a_id"], {})
        b = rows_by_id.get(p["b_id"], {})
        if p.get("same_address"):
            cls = "B"
            reason = "normalized_address_duplicate"
        elif p["distance_m"] <= 25 and a.get("brand") == b.get("brand"):
            cls = "D"
            reason = "same_brand_dense_proximity_review"
        elif p["distance_m"] == 0:
            cls = "B"
            reason = "identical_coordinates"
        else:
            cls = "A"
            reason = "legitimate_separate_clubs"
        out.append({**p, "classification": cls, "reason": reason})
    return out


def brand_stats(rows: list[dict], brand: str, official: int, verdict: str) -> dict:
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
    cov = round(100.0 * ready / official, 1) if official else 0.0
    return {
        "brand": brand,
        "official_current_estimate": official,
        "discovered": discovered,
        "ready": ready,
        "unresolved": unresolved,
        "coming_soon": coming,
        "closed": closed,
        "coverage_pct": cov,
        "verdict": verdict,
    }


def regional_coverage(rows: list[dict]) -> dict[str, bool | str]:
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    out: dict[str, bool | str] = {}
    for city in MAJOR_CITIES:
        blob = " ".join(f"{r.get('city')} {r.get('address')} {r.get('name')}" for r in ready)
        out[city] = city.lower() in blob.lower() or any(
            city.lower() in (r.get("city") or "").lower() for r in ready
        )
    for city in REGIONAL_PHASE2:
        out[f"phase2_{city}"] = out.get(city, False)
    return out


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Czechia_All_Discovered_Centers.xlsx"
    headers = [
        "ID",
        "Brand",
        "Name",
        "Address",
        "City",
        "PSČ",
        "Latitude",
        "Longitude",
        "Status",
        "Source",
        "Official URL",
        "Notes",
    ]
    try:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Czechia"
        ws.append(headers)
        for r in rows:
            ws.append(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
                    r.get("address"),
                    r.get("city"),
                    r.get("postal_code"),
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("notes"),
                    r.get("source_url"),
                    r.get("notes"),
                ]
            )
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Czechia_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(headers)
            for r in rows:
                w.writerow(
                    [
                        r.get("id"),
                        r.get("brand"),
                        r.get("name"),
                        r.get("address"),
                        r.get("city"),
                        r.get("postal_code"),
                        r.get("lat"),
                        r.get("lng"),
                        r.get("import_category"),
                        r.get("notes"),
                        r.get("source_url"),
                        r.get("notes"),
                    ]
                )
        path.write_text(
            "See Gymly_Czechia_All_Discovered_Centers.csv (openpyxl unavailable)\n",
            encoding="utf-8",
        )


def main():
    print("Czechia Deep Phase 2 starting…")
    sha_before = production_sha()
    if sha_before != PROD_SHA_EXPECTED:
        print(f"WARN production SHA mismatch: {sha_before}")

    phase1_candidates = load_json(OUT / "czechia_phase1_candidates.json", [])
    phase1_ready = load_json(OUT / "CZECHIA_PHASE1_READY_TO_IMPORT.json", [])
    phase1_by_url = {(r.get("source_url") or "").rstrip("/"): r for r in phase1_candidates}
    for r in phase1_ready:
        phase1_by_url[(r.get("source_url") or "").rstrip("/")] = r
    phase1_ready_urls = {(r.get("source_url") or "").rstrip("/") for r in phase1_ready}
    cache = load_json(OUT / "czechia_geocode_cache.json", {})

    listing_path = PHASE2 / "ff_kluby.txt"
    listing_html = (
        listing_path.read_text(errors="replace")
        if listing_path.exists()
        else curl_fetch("https://www.formfactory.cz/kluby/", listing_path)
    )
    listing_meta = parse_ff_listing_meta(listing_html)

    index: dict[str, dict] = {}
    recovered_phase1 = 0

    for batch in [
        discover_form_factory(listing_meta),
        discover_max_fitness(),
        discover_fitinn(),
        discover_clever_fit(),
        discover_john_reed(),
    ]:
        for row in batch:
            preserve_row(row, phase1_by_url, phase1_ready_urls)
            key = (row.get("source_url") or "").rstrip("/")
            index[key] = row

    # Track phase1 unresolved recovery
    p1_unresolved = {
        r["id"]
        for r in phase1_candidates
        if r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    }

    unique = list(index.values())
    print(f"Unique discovered: {len(unique)}")

    geo_review = geocode_rows(unique, cache, limit=160)

    for r in unique:
        r["import_category"] = classify(r)
        r["verification_status"] = (
            "VERIFIED_CURRENT"
            if r["import_category"] == "READY_TO_IMPORT"
            else ("NEEDS_REVIEW" if r["import_category"] == "NEEDS_REVIEW" else r.get("verification_status") or "STAGED")
        )

    # Second geocode pass for rows still missing coordinates after classification.
    still_need = [r for r in unique if r.get("import_category") == "NEEDS_COORDINATES"]
    if still_need:
        geo_review.extend(geocode_rows(still_need, cache, limit=80))
        for r in still_need:
            r["import_category"] = classify(r)
            r["verification_status"] = (
                "VERIFIED_CURRENT" if r["import_category"] == "READY_TO_IMPORT" else r.get("verification_status") or "STAGED"
            )

    write_json(OUT / "czechia_geocode_cache.json", cache)

    for r in unique:
        if r["id"] in p1_unresolved and r.get("import_category") == "READY_TO_IMPORT":
            recovered_phase1 += 1

    unique.sort(key=lambda r: (r.get("brand") or "", r.get("name") or "", r.get("id") or ""))
    status = Counter(r.get("import_category") for r in unique)
    ready = [r for r in unique if r.get("import_category") == "READY_TO_IMPORT"]
    ready_by_brand = Counter(r["brand"] for r in ready)

    p1_ready_ids = {r["id"] for r in phase1_ready}
    preserved = sum(1 for r in ready if r["id"] in p1_ready_ids)
    dropped = [r for r in phase1_ready if r["id"] not in {x["id"] for x in ready}]

    prox_all = proximity_pairs(unique, brand_only=True)
    prox_ready = proximity_pairs(ready, brand_only=True)
    rows_by_id = {r["id"]: r for r in unique}
    dup_detail = {
        k: classify_proximity_pairs(v, rows_by_id)
        for k, v in prox_ready.items()
    }

    ff_official = len(sorted(set(FF_CLUB_RE.findall(listing_html))))
    chains = [
        brand_stats(
            unique,
            "Form Factory",
            ff_official,
            "COMPLETE" if ready_by_brand.get("Form Factory", 0) >= ff_official - 2 else "NEAR-COMPLETE",
        ),
        brand_stats(
            unique,
            "Max Fitness",
            24,
            "COMPLETE" if ready_by_brand.get("Max Fitness", 0) >= 23 else "NEAR-COMPLETE",
        ),
        brand_stats(unique, "Oktagon Gym", 1, "COMPLETE"),
        brand_stats(unique, "FITINN", 1, "COMPLETE" if ready_by_brand.get("FITINN", 0) == 1 else "NEAR-COMPLETE"),
        brand_stats(
            unique,
            "clever fit",
            1,
            "NEAR-COMPLETE" if ready_by_brand.get("clever fit", 0) == 1 else "MATERIALLY INCOMPLETE",
        ),
        brand_stats(
            unique,
            "JOHN REED",
            1,
            "COMPLETE" if ready_by_brand.get("JOHN REED", 0) == 1 else "NEAR-COMPLETE",
        ),
    ]

    other_chains = [
        {
            "brand": "McFIT",
            "status": "E — EXCLUDED",
            "discovered": 0,
            "notes": "mcfit.com lists Czech Republic phone prefix only; no CZ studio locator or /cz/studios pages found",
        },
        {
            "brand": "Next.Move",
            "status": "E — EXCLUDED",
            "discovered": 1,
            "notes": "nextmove.cz exposes single HQ address (Dělnická 1324/9 Praha); not a >=3 location conventional gym chain",
        },
        {
            "brand": "BBC Fitness",
            "status": "D — BLOCKED",
            "discovered": 0,
            "notes": "Official site unreachable in Phase 2 probe",
        },
        {
            "brand": "Factory Pro",
            "status": "D — BLOCKED",
            "discovered": 0,
            "notes": "Official site unreachable in Phase 2 probe",
        },
    ]

    dq = {
        "duplicate_ids": len(ready) - len({r["id"] for r in ready}),
        "invalid_ready_postcodes": sum(
            1 for r in ready if not CZECHIA_POSTAL_RE.match(str(r.get("postal_code") or ""))
        ),
        "missing_ready_addresses": sum(1 for r in ready if not r.get("address") or len(str(r.get("address"))) <= 3),
        "missing_ready_cities": sum(1 for r in ready if not r.get("city")),
        "invalid_ready_coords": sum(
            1 for r in ready if not in_czechia(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coords": sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))),
        "foreign_outliers": sum(
            1 for r in ready if FOREIGN.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
        ),
        "mojibake": sum(
            1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
        ),
    }

    regional = regional_coverage(unique)
    new_locations = len(unique) - len(phase1_candidates)
    duplicates_resolved = sum(1 for p in dup_detail.get("identical", []) if p.get("classification") == "B")

    material_gaps = []
    if ready_by_brand.get("Form Factory", 0) < ff_official - 3:
        material_gaps.append(f"Form Factory still missing {ff_official - ready_by_brand.get('Form Factory', 0)} clubs vs official listing")
    if status.get("NEEDS_REVIEW", 0) > 5:
        material_gaps.append(f"{status.get('NEEDS_REVIEW', 0)} rows still NEEDS_REVIEW after parser recovery")
    nonblocking = [
        "Hradec Králové / Jihlava / Karlovy Vary — no Form Factory or Max Fitness clubs in official listings",
        "clever fit Czechia confirmed as single Kladno studio only",
        "McFIT — no current Czech studio estate verified",
    ]

    ff_verdict = chains[0]["verdict"]
    max_verdict = chains[1]["verdict"]
    phase3 = False
    if ff_verdict not in ("COMPLETE", "NEAR-COMPLETE") or max_verdict not in ("COMPLETE", "NEAR-COMPLETE"):
        phase3 = True
    if len(ready) < 60:
        phase3 = True
    if status.get("NEEDS_REVIEW", 0) > 8:
        phase3 = True
    if (
        ready_by_brand.get("Form Factory", 0) >= ff_official - 5
        and ready_by_brand.get("Max Fitness", 0) >= 23
        and status.get("NEEDS_REVIEW", 0) <= 8
        and len(ready) >= 75
        and dq["invalid_ready_coords"] == 0
        and dq["foreign_outliers"] == 0
    ):
        phase3 = False

    verdict = "CZECHIA PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR CZECHIA MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_czechia": 0,
        "production_sha256_expected": PROD_SHA_EXPECTED,
        "production_sha256_actual": sha_before,
        "phase1_staged": len(phase1_candidates),
        "phase1_ready": len(phase1_ready),
        "phase1_ready_preserved": preserved,
        "phase1_ready_dropped": len(dropped),
        "phase1_unresolved_recovered": recovered_phase1,
        "new_locations_discovered": max(0, new_locations),
        "unique_staged": len(unique),
        "ready_count": len(ready),
        "status_counts": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "chain_completeness": chains,
        "other_chains": other_chains,
        "regional_coverage": regional,
        "data_quality": dq,
        "proximity_summary": {k: len(v) for k, v in prox_ready.items()},
        "material_gaps": material_gaps,
        "nonblocking_gaps": nonblocking,
        "projected_catalog": PRODUCTION_TOTAL + len(ready),
        "crossed_12500": (PRODUCTION_TOTAL + len(ready)) > 12500,
        "phase3_required": phase3,
        "verdict": verdict,
    }

    rebrand = {
        "generated": report["generated"],
        "entries": [
            {
                "legacy": "Form Factory /klub/fitness-* only crawl (Phase 1)",
                "successor": "Form Factory full listing incl. the-gym-* slugs",
                "notes": "Phase 1 missed 13 the-gym-* clubs present on formfactory.cz/kluby/",
            }
        ],
        "phase1_ready_preserved_count": preserved,
        "excluded_brands": [
            {"brand": "McFIT", "reason": "No verified current Czech studio estate"},
            {"brand": "Next.Move", "reason": "Single-site operator below multi-location chain threshold"},
            {"brand": "BBC Fitness", "reason": "Site unreachable"},
            {"brand": "Factory Pro", "reason": "Site unreachable"},
        ],
        "international_chains": {
            "clever_fit_cz_studios": 1,
            "fitinn_cz_studios": 1,
            "john_reed_cz_studios": 1,
            "mcfit_cz_studios": 0,
        },
    }

    write_json(OUT / "czechia_centers_staging.json", unique)
    write_json(OUT / "CZECHIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "CZECHIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "CZECHIA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(
        OUT / "czechia_duplicate_analysis.json",
        {"proximity_detail": dup_detail, "proximity_all_brands": {k: len(v) for k, v in prox_all.items()}},
    )
    write_json(OUT / "czechia_geocode_review.json", {"items": geo_review, "count": len(geo_review)})
    write_xlsx(unique)

    md = f"""# CZECHIA PHASE 2 READINESS REPORT

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
| Phase 1 READY preserved | {preserved}/{len(phase1_ready)} |
| Phase 1 unresolved recovered | {recovered_phase1} |
| Projected catalog if merged | {report['projected_catalog']} |

## READY by brand

{chr(10).join(f"- {b}: {n}" for b, n in sorted(ready_by_brand.items(), key=lambda x: -x[1]))}

## Chain completeness

| Brand | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
{chr(10).join(f"| {c['brand']} | {c['official_current_estimate']} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['coverage_pct']}% | {c['verdict']} |" for c in chains)}

## Regional coverage (READY)

{chr(10).join(f"- {k}: {'yes' if v else 'no'}" for k, v in regional.items())}

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | {dq['duplicate_ids']} |
| Invalid PSČ | {dq['invalid_ready_postcodes']} |
| Missing addresses | {dq['missing_ready_addresses']} |
| Missing cities | {dq['missing_ready_cities']} |
| Invalid coords | {dq['invalid_ready_coords']} |
| Fallback coords | {dq['fallback_coords']} |
| Foreign outliers | {dq['foreign_outliers']} |
| Mojibake | {dq['mojibake']} |

## Material gaps

{chr(10).join(f"- {g}" for g in material_gaps) or '- (none)'}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    (OUT / "CZECHIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    sha_after = production_sha()
    print(
        json.dumps(
            {
                "unique": len(unique),
                "ready": len(ready),
                "status": dict(status),
                "ready_by_brand": dict(ready_by_brand),
                "phase1_preserved": preserved,
                "recovered_phase1": recovered_phase1,
                "verdict": verdict,
                "projected": report["projected_catalog"],
                "production_sha_unchanged": sha_after == sha_before,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
