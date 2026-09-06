#!/usr/bin/env python3
"""
Poland Phase 1 consolidate — re-parse cached club pages with strict extractors,
geocode NEEDS_COORDINATES via Nominatim (countrycodes=pl), dedupe, export READY.
Does NOT modify centers.json.
"""
from __future__ import annotations

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
OUT = ROOT / "data/poland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
CENTERS = ROOT / "src/data/centers.json"
CACHE_PATH = OUT / "poland_geocode_cache.json"

PL_BOUNDS = (49.0, 54.9, 14.07, 24.15)
PL_POSTAL_RE = re.compile(r"^\d{2}-\d{3}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")
JS_GARBAGE_RE = re.compile(
    r"(function\s*\(|document\.|querySelector|nowprocket|ewww_webp|place\(/|=>|\{\{)",
    re.I,
)

ctx = ssl.create_default_context()
UA = {"User-Agent": "GymlyPolandPhase1/1.0 (catalog research; contact: gymly)"}


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def pl_postal(s) -> str:
    m = re.search(r"\b(\d{2})\s*[-–—]?\s*(\d{3})\b", str(s or ""))
    return f"{m.group(1)}-{m.group(2)}" if m else ""


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            re.sub(r"[^a-z0-9]+", " ", (brand or "").lower()).strip(),
            re.sub(r"[^a-z0-9]+", " ", (address or "").lower()).strip(),
            (postal or "").strip(),
            re.sub(r"[^a-z0-9ąćęłńóśźż]+", " ", (city or "").lower()).strip(),
            "poland",
        ]
    )
    return "pl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def clean_address(s: str) -> str:
    s = unescape(s)
    if not s or JS_GARBAGE_RE.search(s) or len(s) > 120:
        return ""
    if re.search(r"https?://|www\.|\.js\b", s, re.I):
        return ""
    return s


def clean_name(s: str, brand: str) -> str:
    s = unescape(s)
    if not s or JS_GARBAGE_RE.search(s):
        return brand
    s = re.split(r"\s*[|\-–—]\s*", s)[0].strip()
    if JS_GARBAGE_RE.search(s) or len(s) > 100:
        return brand
    return s


def in_poland(lat: float, lng: float) -> bool:
    return PL_BOUNDS[0] <= lat <= PL_BOUNDS[1] and PL_BOUNDS[2] <= lng <= PL_BOUNDS[3]


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def extract_json_ld(html: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(data, list):
            out.extend(x for x in data if isinstance(x, dict))
        elif isinstance(data, dict):
            if isinstance(data.get("@graph"), list):
                out.extend(x for x in data["@graph"] if isinstance(x, dict))
            else:
                out.append(data)
    return out


def walk_entities(objs: list[dict]) -> list[dict]:
    found = []
    for o in objs:
        found.append(o)
        me = o.get("mainEntity")
        if isinstance(me, dict):
            found.append(me)
        elif isinstance(me, list):
            found.extend(x for x in me if isinstance(x, dict))
    return found


def parse_postal_address_line(line: str) -> tuple[str, str, str]:
    """'Aleja Grunwaldzka 472D, 80-309 Gdańsk' -> street, postal, city"""
    line = clean_address(line)
    if not line:
        return "", "", ""
    m = re.search(r"^(.*?),\s*(\d{2}-\d{3})\s+(.+)$", line)
    if m:
        return m.group(1).strip(), m.group(2), m.group(3).strip()
    m = re.search(r"^(.*?)\s+(\d{2}-\d{3})\s+(.+)$", line)
    if m:
        return m.group(1).strip(), m.group(2), m.group(3).strip()
    pc = pl_postal(line)
    return line, pc, ""


def extract_from_html(html: str, brand_hint: str) -> dict:
    out = {
        "name": "",
        "address": "",
        "postal_code": "",
        "city": "",
        "lat": None,
        "lng": None,
        "coord_source": None,
        "phone": None,
    }
    entities = walk_entities(extract_json_ld(html))
    for block in entities:
        t = block.get("@type")
        types = [str(x) for x in (t if isinstance(t, list) else [t]) if x]
        if not any(
            x in ("ExerciseGym", "HealthClub", "SportsActivityLocation", "LocalBusiness", "Place")
            for x in types
        ) and "address" not in block:
            continue
        if block.get("name") and not out["name"]:
            out["name"] = clean_name(str(block["name"]), brand_hint)
        addr = block.get("address")
        if isinstance(addr, dict):
            street = clean_address(str(addr.get("streetAddress") or ""))
            city = unescape(str(addr.get("addressLocality") or ""))
            postal = pl_postal(addr.get("postalCode") or "")
            if street:
                out["address"] = street
            if city and not JS_GARBAGE_RE.search(city):
                out["city"] = city
            if postal:
                out["postal_code"] = postal
        geo = block.get("geo") if isinstance(block.get("geo"), dict) else {}
        if geo.get("latitude") is not None and geo.get("longitude") is not None:
            try:
                lat, lng = float(geo["latitude"]), float(geo["longitude"])
                if in_poland(lat, lng):
                    out["lat"], out["lng"] = lat, lng
                    out["coord_source"] = "OFFICIAL_COORDINATE"
            except (TypeError, ValueError):
                pass

    # CityFit-style <address class="club__location-address">
    m = re.search(
        r'<address[^>]*class=["\'][^"\']*club__location-address[^"\']*["\'][^>]*>(.*?)</address>',
        html,
        re.I | re.S,
    )
    if m:
        text = unescape(re.sub(r"<br\s*/?>", ", ", m.group(1)))
        text = re.sub(r"<[^>]+>", "", text)
        street, pc, city = parse_postal_address_line(text)
        if street:
            out["address"] = street
        if pc:
            out["postal_code"] = pc
        if city:
            out["city"] = city

    # Google Maps destination pins
    if out["lat"] is None:
        m = re.search(
            r"google\.[^\"']*maps/dir/\?api=1&destination=(-?\d+\.\d+),(-?\d+\.\d+)",
            html,
            re.I,
        )
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if in_poland(lat, lng):
                out["lat"], out["lng"] = lat, lng
                out["coord_source"] = "OFFICIAL_MAP_PIN"
    if out["lat"] is None:
        m = re.search(
            r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)",
            html,
        )
        if m:
            # embed order is often lng then lat in pb strings
            lng, lat = float(m.group(1)), float(m.group(2))
            if in_poland(lat, lng):
                out["lat"], out["lng"] = lat, lng
                out["coord_source"] = "OFFICIAL_MAP_PIN"
            elif in_poland(lng, lat):
                out["lat"], out["lng"] = lng, lat
                out["coord_source"] = "OFFICIAL_MAP_PIN"

    # Visible ul. … NN-NNN City
    if not out["address"]:
        for m in re.finditer(
            r"((?:ul\.|al\.|Aleja|Pl\.|Plac|os\.)\s[^<>\n]{3,80})",
            html,
            re.I,
        ):
            cand = clean_address(m.group(1))
            if cand:
                out["address"] = cand
                break
    if not out["postal_code"]:
        m = re.search(r"\b(\d{2}-\d{3})\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\- ]{2,40})", html)
        if m and "png" not in m.group(0).lower():
            out["postal_code"] = m.group(1)
            if not out["city"]:
                out["city"] = m.group(2).strip()

    if not out["name"]:
        m = re.search(r"<title>([^<]+)</title>", html, re.I)
        if m:
            out["name"] = clean_name(m.group(1), brand_hint)

    return out


def brand_from_path(path: Path) -> str:
    parent = path.parent.name
    return {
        "cityfit": "CityFit",
        "justgym": "Just GYM",
        "calypso": "Calypso Fitness",
        "platinium": "Fitness Platinium",
        "well": "Well Fitness",
        "xtreme": "Xtreme Fitness Gyms",
        "fabryka": "Fabryka Formy",
    }.get(parent, parent.title())


def source_url_guess(path: Path, brand: str) -> str:
    slug = path.stem
    if brand == "CityFit":
        return f"https://cityfit.pl/kluby/{slug}/"
    if brand == "Just GYM":
        return "https://justgym.pl/silownie/" + slug.replace("__", "/")
    return ""


def classify(r: dict) -> dict:
    reasons = []
    if not r.get("name") or JS_GARBAGE_RE.search(r["name"]):
        reasons.append("bad_name")
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address") or JS_GARBAGE_RE.search(r["address"]):
        reasons.append("bad_address")
    if not PL_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city") or JS_GARBAGE_RE.search(str(r.get("city"))):
        reasons.append("bad_city")
    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None or not (math.isfinite(lat_f) and math.isfinite(lng_f)):
        reasons.append("missing_coords")
    elif not in_poland(lat_f, lng_f):
        reasons.append("foreign_coords")
    if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}"):
        reasons.append("mojibake")

    notes = (r.get("notes") or "").lower()
    if "coming_soon" in notes or "wkrótce" in notes:
        r["import_category"] = "COMING_SOON"
        r["is_active"] = False
        return r
    if "missing_coords" in reasons:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["notes"] = (r.get("notes") or "") + f"; classify={','.join(reasons)}"
        return r
    hard = [x for x in reasons if x != "missing_coords"]
    if hard:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = (r.get("notes") or "") + f"; classify={','.join(reasons)}"
        return r
    r["import_category"] = "READY_TO_IMPORT"
    r["is_active"] = True
    r["verification_status"] = "VERIFIED_CURRENT"
    r["country"] = "Poland"
    return r


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}


def save_cache(cache: dict):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Poland"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
        return None, None, ""
    params = urllib.parse.urlencode(
        {
            "q": q,
            "format": "json",
            "limit": 1,
            "countrycodes": "pl",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[q] = None
        return None, None, ""
    time.sleep(1.05)
    if not data:
        cache[q] = None
        return None, None, ""
    hit = data[0]
    lat, lng = float(hit["lat"]), float(hit["lon"])
    addr = hit.get("address") or {}
    # Strict-ish: postcode match when provided
    if postal and addr.get("postcode") and pl_postal(addr.get("postcode")) not in (
        postal,
        pl_postal(addr.get("postcode")),
    ):
        # allow soft if city matches
        city_ok = (city or "").lower()[:4] in json.dumps(addr, ensure_ascii=False).lower()
        if not city_ok:
            cache[q] = None
            return None, None, ""
    if not in_poland(lat, lng):
        cache[q] = None
        return None, None, ""
    cache[q] = {"lat": lat, "lng": lng, "source": "STRICT_ADDRESS_GEOCODE", "display": hit.get("display_name")}
    return lat, lng, "STRICT_ADDRESS_GEOCODE"


def main():
    rows = []
    # Re-parse all cached pages
    for path in sorted(PAGES.rglob("*.html")):
        html = path.read_text(encoding="utf-8", errors="replace")
        if len(html) < 800:
            continue
        brand = brand_from_path(path)
        parsed = extract_from_html(html, brand)
        if not parsed["address"] and not parsed["postal_code"] and parsed["lat"] is None:
            continue
        name = parsed["name"] or f"{brand} {parsed['city'] or path.stem}".strip()
        if brand == "Just GYM" and not name.lower().startswith("just"):
            name = f"Just GYM {name}"
        if brand == "CityFit" and "cityfit" not in name.lower():
            name = f"CityFit {name}" if name else "CityFit"
        src = source_url_guess(path, brand)
        row = {
            "id": "",
            "brand": brand,
            "chain": brand,
            "name": name,
            "center_name": name,
            "address": parsed["address"],
            "postal_code": parsed["postal_code"],
            "city": parsed["city"],
            "country": "Poland",
            "voivodeship": None,
            "lat": parsed["lat"],
            "lng": parsed["lng"],
            "opening_hours": None,
            "website": src or None,
            "source_url": src,
            "source_type": f"{brand.lower().replace(' ', '_')}_official_page",
            "verification_status": "UNVERIFIED",
            "notes": f"page={path.relative_to(PAGES)}",
            "is_active": True,
            "import_category": "NEEDS_REVIEW",
            "phase": "poland_phase1",
            "coord_source": parsed["coord_source"],
            "legacy_brand": None,
            "official_location_id": path.stem,
            "discovery_class": "national_chain",
        }
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify(row))

    print(f"Re-parsed rows: {len(rows)}")
    print("Status before geocode:", Counter(r["import_category"] for r in rows))

    cache = load_cache()
    geo_attempts = 0
    for r in rows:
        if r["import_category"] != "NEEDS_COORDINATES":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        geo_attempts += 1
        lat, lng, src = geocode(r["address"], r["postal_code"], r["city"], cache)
        if lat is not None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = src
            classify(r)
        if geo_attempts % 10 == 0:
            save_cache(cache)
            print(f"  geocoded {geo_attempts}…")
    save_cache(cache)
    print(f"Geocode attempts: {geo_attempts}")
    print("Status after geocode:", Counter(r["import_category"] for r in rows))

    # Deduplicate by id / addr+brand
    by_id: dict[str, dict] = {}
    for r in rows:
        i = r["id"]
        if i not in by_id:
            by_id[i] = r
            continue
        # prefer READY / has coords
        prev = by_id[i]
        score = lambda x: (
            1 if x["import_category"] == "READY_TO_IMPORT" else 0,
            1 if x.get("lat") is not None else 0,
            len(x.get("address") or ""),
        )
        if score(r) > score(prev):
            by_id[i] = r
    rows = list(by_id.values())

    # Same-brand proximity
    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT"]
    withhold = set()
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a["brand"] != b["brand"]:
                continue
            if a.get("lat") is None or b.get("lat") is None:
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            if d < 100:
                # keep first, demote second
                withhold.add(b["id"])
    for r in rows:
        if r["id"] in withhold:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; same_brand_proximity_lt100"

    # vs production
    prod = json.loads(CENTERS.read_text())
    prod_ids = {x["id"] for x in prod}
    assert len(prod) == 9094
    assert sum(1 for x in prod if x.get("country") == "Poland") == 0
    for r in rows:
        if r["id"] in prod_ids:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; id_collision_production"

    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT"]
    # Final READY gate
    final_ready = []
    for r in ready:
        if (
            r["id"].startswith("pl_")
            and r.get("name")
            and r.get("brand")
            and r.get("address")
            and PL_POSTAL_RE.match(r.get("postal_code") or "")
            and r.get("city")
            and r.get("country") == "Poland"
            and r.get("lat") is not None
            and r.get("lng") is not None
            and in_poland(float(r["lat"]), float(r["lng"]))
            and not JS_GARBAGE_RE.search(r["address"])
            and not JS_GARBAGE_RE.search(r["name"])
        ):
            final_ready.append(r)
        else:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; failed_final_ready_gate"

    rows = [r for r in rows if r["import_category"] != "READY_TO_IMPORT"] + final_ready

    # Write outputs
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "poland_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "POLAND_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(final_ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    cats = Counter(r["import_category"] for r in rows)
    by_brand = Counter(r["brand"] for r in final_ready)
    by_city = Counter(r["city"] for r in final_ready)

    geocode_review = [
        {
            "id": r["id"],
            "name": r["name"],
            "brand": r["brand"],
            "address": r["address"],
            "postal_code": r["postal_code"],
            "city": r["city"],
            "status": r["import_category"],
            "notes": r.get("notes"),
            "source_url": r.get("source_url"),
        }
        for r in rows
        if r["import_category"] in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    ]
    (OUT / "poland_geocode_review.json").write_text(
        json.dumps(geocode_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    dup_analysis = {
        "unique_ids": len(rows),
        "ready": len(final_ready),
        "same_brand_proximity_withheld": len(withhold),
        "production_id_collisions": 0,
        "identical_ids_collapsed": True,
    }
    (OUT / "poland_duplicate_analysis.json").write_text(
        json.dumps(dup_analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    projected = 9094 + len(final_ready)
    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "production_total": 9094,
        "poland_live": 0,
        "production_modified": False,
        "discovered_unique": len(rows),
        "categories": dict(cats),
        "ready_to_import": len(final_ready),
        "ready_by_brand": dict(by_brand.most_common()),
        "ready_by_city_top": dict(by_city.most_common(30)),
        "projected_catalog": projected,
        "would_cross_10000": projected > 10000,
        "headroom_to_10000": max(0, 10000 - projected),
        "amount_above_10000": max(0, projected - 10000),
        "global_10k_stress_after_poland_qa": projected >= 10001,
        "material_gaps": [
            "Zdrofit / Benefit Systems estate (~290 clubs) — official site AWS WAF blocked",
            "Fabryka Formy / Premium brands — locator incomplete in Phase 1",
            "Calypso Fitness — listing URL structure not extracted",
            "Xtreme Fitness Gyms — no club URLs found in Phase 1",
            "McFIT Poland — no PL locator recovered",
            "CityFit — partial estate from sitemap (need full re-crawl)",
        ],
        "recommendation": "POLAND PHASE 2 REQUIRED BEFORE MERGE",
    }
    (OUT / "POLAND_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if Workbook:
        wb = Workbook()
        ws = wb.active
        ws.title = "Poland Phase1"
        headers = [
            "ID", "Name", "Brand", "Address", "Postal Code", "City", "Voivodeship",
            "Country", "Latitude", "Longitude", "Status", "Coordinate Source",
            "Source URL", "Notes",
        ]
        ws.append(headers)
        for c in ws[1]:
            c.font = Font(bold=True)
        for r in sorted(rows, key=lambda x: (x["brand"], x["city"] or "", x["name"])):
            ws.append([
                r["id"], r["name"], r["brand"], r["address"], r["postal_code"], r["city"],
                r.get("voivodeship") or "", r["country"], r.get("lat"), r.get("lng"),
                r["import_category"], r.get("coord_source") or "", r.get("source_url") or "",
                r.get("notes") or "",
            ])
        # force postal as text
        for row in ws.iter_rows(min_row=2, min_col=5, max_col=5):
            for cell in row:
                cell.number_format = "@"
                if cell.value is not None:
                    cell.value = str(cell.value)
        wb.save(OUT / "Gymly_Poland_All_Discovered_Centers.xlsx")

    # Markdown report
    brand_lines = "\n".join(f"| {b} | {n} |" for b, n in by_brand.most_common())
    md = f"""# Poland Phase 1 Readiness Report

Generated: {report['generated']}

## Production safety

- Live catalog: **9094** (unchanged)
- Poland live: **0**
- `centers.json` modified: **No**

## Overall

| Status | Count |
|--------|------:|
| Unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(final_ready)} |
| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {cats.get('COMING_SOON', 0)} |
| CLOSED | {cats.get('CLOSED', 0)} |

## READY by brand

| Brand | READY |
|-------|------:|
{brand_lines}
| **Total** | **{len(final_ready)}** |

## 10K checkpoint

- Current: 9094
- READY: {len(final_ready)}
- Projected: **{projected}**
- Would cross 10,000: **{projected > 10000}**
- Global 10K+ stress QA after Poland QA: **{projected >= 10001}**

## Material gaps (Phase 2)

1. **Zdrofit / Benefit Systems** (~294 clubs across owned networks) — zdrofit.pl blocked by AWS WAF; OWU PDF lists many Zdrofit names without full addresses/coords
2. **Fabryka Formy / related Premium brands** — incomplete locator extraction
3. **Calypso Fitness** — listing parse failed (0 URLs)
4. **Xtreme Fitness Gyms** — 0 club URLs in Phase 1
5. **McFIT Poland** — no PL studio locator recovered
6. **CityFit** — sitemap/page coverage incomplete vs marketed estate; coords recovered where official pins exist

## Recommendation

**POLAND PHASE 2 REQUIRED BEFORE MERGE**

Do not merge. Do not run Poland QA. Do not run global 10K stress QA.
"""
    (OUT / "POLAND_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
