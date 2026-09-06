#!/usr/bin/env python3
"""
Consolidate Italy Phase 1 scrapes → staging, Nominatim geocode (countrycodes=it),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No Rome / Milan / CAP / country centroid fallbacks.
Rejects San Marino, Vatican, and neighbor-country geocodes.
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
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "italy_centers_staging.json"
CACHE = OUT / "italy_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyItalyGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"

IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)

# Approximate regional bands for reporting only
NORTH_LAT = 44.0
SOUTH_LAT = 41.0

MAJOR_CITIES = [
    "Roma", "Milano", "Torino", "Napoli", "Palermo", "Genova", "Bologna",
    "Firenze", "Bari", "Catania", "Venezia", "Verona", "Padova", "Trieste",
    "Brescia", "Parma", "Modena", "Cagliari", "Messina", "Reggio Emilia",
]

CHAIN_ESTIMATES = [
    ("FitActive", "~172–188 clubs Italy (largest Italian group; FR/ES/BR excluded)"),
    ("McFIT", "~42–46 clubs (RSG Group; Magicline)"),
    ("JOHN REED", "~0–2 Italy (RSG)"),
    ("Gold's Gym", "~2 Italy (RSG)"),
    ("Virgin Active", "~42 premium clubs"),
    ("FitUP", "~120–150 target YE2026; ~80+ listed on site"),
    ("Fit Express", "~70 clubs (24/7 franchise)"),
    ("Anytime Fitness", "~60–66 clubs (JS locator — Phase 2)"),
    ("Orange", "~23–33 clubs (incl. GetFIT acquisition; Livewire hostile — Phase 2)"),
    ("WebFit", "~16 clubs (official map)"),
    ("20Hours", "~7 Milan-area clubs"),
    ("Fitness Park", "1 open (RomaEst, Jul 2026)"),
    ("Basic-Fit", "0 Italy clubs (locale club-finder empty / NL bleed)"),
    ("GetFIT", "6 of 8 acquired by Orange Jul 2026 — brand retiring"),
    ("Fit And Go", "EXCLUDE — EMS / Vacufit boutique"),
]

COARSE = {
    "country", "state", "region", "county", "postcode", "municipality",
    "city", "town", "village", "suburb", "neighbourhood", "quarter",
    "district", "borough", "province", "island",
}

FORBIDDEN_CC = {"sm", "va", "fr", "ch", "at", "si", "hr", "mt"}


def make_id(brand, address, postal, city):
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (str(postal) or "").strip().lower(),
        (city or "").strip().lower(),
        "italy",
    ])
    return "it_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    for a, b in [
        ("à", "a"), ("á", "a"), ("â", "a"), ("ä", "a"),
        ("è", "e"), ("é", "e"), ("ê", "e"), ("ë", "e"),
        ("ì", "i"), ("í", "i"), ("î", "i"), ("ï", "i"),
        ("ò", "o"), ("ó", "o"), ("ô", "o"), ("ö", "o"),
        ("ù", "u"), ("ú", "u"), ("û", "u"), ("ü", "u"),
        ("ç", "c"), ("ñ", "n"), ("’", "'"), ("'", " "),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def it_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


def in_italy_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in (IT_MAINLAND, IT_SICILY, IT_SARDINIA):
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def in_sicily(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = IT_SICILY
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_sardinia(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = IT_SARDINIA
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def load_scrapes() -> list[dict]:
    rows = []
    for p in sorted(SCRAPES.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows.extend(data)
    return rows


def collapse_staging(rows):
    by_id = {}
    collapsed = []
    kept = []
    for r in rows:
        r["postal_code"] = it_postal(r.get("postal_code")) or it_postal(r.get("address")) or None
        if r.get("address"):
            r["address"] = str(r["address"]).strip(" ,")
        if r.get("city"):
            r["city"] = str(r["city"]).strip(" ,.")
        r["id"] = make_id(
            r.get("brand") or r.get("chain"),
            r.get("address") or "",
            r.get("postal_code") or "",
            r.get("city") or "",
        )
        r["chain"] = r.get("chain") or r.get("brand")
        r["center_name"] = r.get("center_name") or r.get("name")
        r["country"] = "Italy"
        key = r["id"]
        prev = by_id.get(key)
        if prev is None:
            by_id[key] = r
            kept.append(r)
            continue
        score = (1 if r.get("address") else 0) + (1 if r.get("lat") is not None else 0) + (1 if r.get("postal_code") else 0)
        pscore = (1 if prev.get("address") else 0) + (1 if prev.get("lat") is not None else 0) + (1 if prev.get("postal_code") else 0)
        if score > pscore:
            collapsed.append({"kept": r.get("name"), "dropped": prev.get("name"), "id": key})
            kept.remove(prev)
            by_id[key] = r
            kept.append(r)
        else:
            collapsed.append({"kept": prev.get("name"), "dropped": r.get("name"), "id": key})

    by_addr = defaultdict(list)
    for r in kept:
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if k[1]:
            by_addr[k].append(r)
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: (0 if x.get("lat") is not None else 1, x.get("name") or ""))
        for d in group[1:]:
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            collapsed.append({"kept": group[0].get("name"), "dropped": d.get("name"), "reason": "same_brand_address"})

    return kept, collapsed


def classify_pre(r):
    if r.get("import_category") == "DUPLICATE":
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        return r
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if not r.get("address") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if not it_postal(r.get("postal_code") or ""):
        # allow proceed to geocode attempt but not READY yet without CAP
        pass
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_italy_bbox(lat, lng) and it_postal(r.get("postal_code") or ""):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                if not r.get("coord_source"):
                    r["coord_source"] = "OFFICIAL_COORDINATE"
                return r
            if not in_italy_bbox(lat, lng):
                r["notes"] = ((r.get("notes") or "") + "; coord_outside_italy_bbox").strip("; ")
                r["lat"] = r["lng"] = None
                r["coord_source"] = None
            elif not it_postal(r.get("postal_code") or ""):
                # has coords but missing CAP → still not READY
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = ((r.get("notes") or "") + "; missing_cap").strip("; ")
                return r
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    if not it_postal(r.get("postal_code") or ""):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    return r


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "it",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_italy_bbox(lat, lng):
        return None, ["outside_italy"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "it":
        return None, ["not_country_it:" + cc], lat, lng
    if cc in FORBIDDEN_CC:
        return None, ["forbidden_cc:" + cc], lat, lng

    t = (item.get("type") or item.get("class") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {
        "house", "building", "yes", "retail", "commercial", "industrial",
        "gym", "fitness_centre", "sports_centre",
    }:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng

    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc).upper()
    postal_n = re.sub(r"\s+", "", str(postal or "")).upper()
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:2] == postal_n[:2]:
        score += 1
        reasons.append("postal_soft")

    city_n = norm(city)
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb", "city_district")
    )
    if city_n and (city_n in city_fields or city_n in norm(display)):
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    if road and street_n and (
        road in street_n or street_n in norm(display)
        or any(tok and tok in road for tok in street_n.split() if len(tok) > 4)
    ):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z/]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")

    # Named gym POI bonus
    if "gym" in t or "fitness" in t or "fitness" in display:
        score += 2
        reasons.append("named_gym_poi")

    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons and "named_gym_poi" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache):
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        return r
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return r
    street = r.get("address") or ""
    postal = r.get("postal_code") or ""
    city = r.get("city") or ""
    if not street or not postal or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        # keep official coords if any? task says READY needs CAP — leave NEEDS_REVIEW
        if r.get("lat") is not None and not it_postal(postal):
            pass
        else:
            if r.get("import_category") != "READY_TO_IMPORT":
                r["lat"] = r["lng"] = None if not r.get("coord_source") else r.get("lat")
        return r
    # Already has official coords + CAP → READY
    if r.get("lat") is not None and r.get("lng") is not None and it_postal(postal):
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_italy_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                return r
        except (TypeError, ValueError):
            pass

    queries = [
        f"{street}, {postal} {city}, Italy",
        f"{street}, {postal}, Italy",
        f"{street}, {city}, Italy",
    ]
    # Named gym POI query
    brand = r.get("brand") or ""
    if brand and city:
        queries.insert(0, f"{brand} {r.get('name') or ''}, {street}, {postal} {city}, Italy")

    for q in queries:
        try:
            items = nominatim(q, cache)
        except Exception as e:
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
            if sc is None:
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name"), it))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        top = scored[0]
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
                r["lat"] = r["lng"] = None
                return r
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        # Prefer NAMED_GYM_POI if amenity gym matched
        if "named_gym_poi" in top[1]:
            r["coord_source"] = "NAMED_GYM_POI"
        else:
            r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    if not r.get("coord_source"):
        r["lat"] = r["lng"] = None
    return r


def ready_gate(r) -> bool:
    if r.get("import_category") != "READY_TO_IMPORT":
        return False
    if not str(r.get("id") or "").startswith("it_"):
        return False
    if not r.get("is_active"):
        return False
    if not r.get("name") or not r.get("brand"):
        return False
    if not r.get("address") or not r.get("city"):
        return False
    if r.get("country") != "Italy":
        return False
    if not it_postal(r.get("postal_code") or ""):
        return False
    try:
        lat, lng = float(r["lat"]), float(r["lng"])
        if not (math.isfinite(lat) and math.isfinite(lng)):
            return False
        if not in_italy_bbox(lat, lng):
            return False
    except (TypeError, ValueError, KeyError):
        return False
    return True


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    all_ids = {c["id"] for c in centers}
    live_it = [c for c in centers if c.get("country") == "Italy"]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers if c.get("address")
    }
    report = {
        "existing_italy_in_catalog": len(live_it),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "it_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("it_")],
    }
    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append({
                "staging": r.get("name"), "live": live_addr[key].get("name"),
                "id": r["id"], "live_country": live_addr[key].get("country"),
            })
        if r.get("lat") is None:
            continue
        for c in centers:
            if c.get("lat") is None or c.get("lng") is None:
                continue
            if norm(c.get("brand")) != norm(r.get("brand")):
                continue
            try:
                d = haversine(float(r["lat"]), float(r["lng"]), float(c["lat"]), float(c["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 50:
                report["proximity_same_brand"].append({
                    "staging": r.get("name"), "live": c.get("name"),
                    "distance_m": round(d), "live_country": c.get("country"),
                })
    return report, centers


def staging_dupes(rows):
    report = {"duplicate_ids": [], "same_brand_address": [], "proximity_same_brand_80m": []}
    ids = defaultdict(list)
    for r in rows:
        ids[r["id"]].append(r.get("name"))
    report["duplicate_ids"] = [{"id": i, "names": n} for i, n in ids.items() if len(n) > 1]

    by_addr = defaultdict(list)
    for r in rows:
        if r.get("import_category") in {"DUPLICATE", "CLOSED"}:
            continue
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if k[1]:
            by_addr[k].append(r)
    for k, g in by_addr.items():
        if len(g) > 1:
            report["same_brand_address"].append([x.get("name") for x in g])

    with_coords = [r for r in rows if r.get("lat") is not None and r.get("import_category") not in {"DUPLICATE", "CLOSED"}]
    for i, a in enumerate(with_coords):
        for b in with_coords[i + 1:]:
            if norm(a.get("brand")) != norm(b.get("brand")):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 80:
                report["proximity_same_brand_80m"].append({
                    "a": a.get("name"), "b": b.get("name"), "distance_m": round(d),
                })
    return report


def write_excel(rows):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("openpyxl not available, skipping Excel export")
        return None

    cols = [
        "id", "chain", "center_name", "address", "postal_code", "city", "country",
        "latitude", "longitude", "status", "verification_status", "source_url",
        "opening_hours",
    ]
    extra = ["coord_source", "geocode_status", "website", "region", "legacy_brand", "notes"]
    sorted_rows = sorted(rows, key=lambda r: (
        (r.get("brand") or "").casefold(),
        (r.get("city") or "").casefold(),
        (r.get("name") or "").casefold(),
    ))
    wb = Workbook()
    ws = wb.active
    ws.title = "Italy Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = it_postal(r.get("postal_code")) or (r.get("postal_code") or "")
        hours = r.get("opening_hours")
        if isinstance(hours, (dict, list)):
            hours = json.dumps(hours, ensure_ascii=False)
        values = [
            r.get("id"),
            r.get("brand") or r.get("chain"),
            r.get("center_name") or r.get("name"),
            r.get("address"),
            postal,
            r.get("city"),
            "Italy",
            r.get("lat"),
            r.get("lng"),
            r.get("import_category"),
            r.get("verification_status"),
            r.get("source_url"),
            hours,
            r.get("coord_source"),
            r.get("geocode_status"),
            r.get("website"),
            r.get("region"),
            r.get("legacy_brand"),
            r.get("notes"),
        ]
        for j, val in enumerate(values, start=1):
            cell = ws.cell(i, j, val)
            if j == postal_col:
                cell.number_format = "@"
                cell.value = str(postal) if postal else ""
                cell.alignment = Alignment(horizontal="left")
    for col_idx in range(1, len(cols) + len(extra) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 22
    path = OUT / "Gymly_Italy_All_Discovered_Centers.xlsx"
    wb.save(path)
    return path


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") in {"STRICT_ADDRESS_GEOCODE", "NAMED_GYM_POI", "nominatim"} or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"), "name": r.get("name"), "brand": r.get("brand"),
                "address": r.get("address"), "postal_code": r.get("postal_code"),
                "city": r.get("city"), "latitude": r.get("lat"), "longitude": r.get("lng"),
                "geocode_status": r.get("geocode_status"), "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"), "notes": r.get("notes"),
            })
    (OUT / "italy_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    return review


def city_ready(rows, city_name):
    n = norm(city_name)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and n in norm(r.get("city") or "")]
    disc = [r for r in rows if n in norm(r.get("city") or "")]
    return len(disc), len(ready)


def geo_bucket(r):
    try:
        lat, lng = float(r["lat"]), float(r["lng"])
    except (TypeError, ValueError, KeyError):
        return "unknown"
    if in_sicily(lat, lng):
        return "sicily"
    if in_sardinia(lat, lng):
        return "sardinia"
    if lat >= NORTH_LAT:
        return "north"
    if lat <= SOUTH_LAT:
        return "south"
    return "central"


def write_report(rows, live_report, staging_report, collapsed, n_live, market_audit: list[str]):
    cats = Counter(r.get("import_category") for r in rows)
    ready_rows = [r for r in rows if ready_gate(r)]
    # Downgrade any that failed gate
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not ready_gate(r):
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = ((r.get("notes") or "") + "; failed_ready_gate").strip("; ")
    cats = Counter(r.get("import_category") for r in rows)
    ready_rows = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_n = len(ready_rows)

    lines = []
    lines.append("# Italy Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")

    lines.append("## Market Audit")
    lines.append("")
    for block in market_audit:
        lines.append(block)
    lines.append("")

    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total Italy locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| DUPLICATE (staging) | {cats.get('DUPLICATE', 0)} |")
    lines.append(f"| Staging same-id collapses | {len(collapsed)} |")
    lines.append("")

    lines.append("## READY by brand")
    lines.append("")
    lines.append("| Brand | READY |")
    lines.append("|---|---:|")
    by_brand = Counter(r.get("brand") for r in ready_rows)
    for b, n in by_brand.most_common():
        lines.append(f"| {b} | {n} |")
    lines.append("")

    lines.append("## Chain Coverage")
    lines.append("")
    lines.append("| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for label, est in CHAIN_ESTIMATES:
        sub = [r for r in rows if r.get("brand") == label]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        cov = f"{round(100 * rd / disc)}%" if disc else "—"
        lines.append(f"| {label} | {est} | {disc} | {rd} | {unr} | {cov} |")
    lines.append("")

    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for city in MAJOR_CITIES:
        d, rd = city_ready(rows, city)
        if d:
            lines.append(f"| {city} | {d} | {rd} |")
    lines.append("")

    lines.append("## Geography (READY)")
    lines.append("")
    buckets = Counter(geo_bucket(r) for r in ready_rows)
    lines.append("| Band | READY |")
    lines.append("|---|---:|")
    for k in ("north", "central", "south", "sicily", "sardinia", "unknown"):
        lines.append(f"| {k.title()} | {buckets.get(k, 0)} |")
    lines.append("")

    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Missing addresses: {sum(1 for r in rows if not r.get('address'))}")
    lines.append(f"- Missing postal codes (CAP): {sum(1 for r in rows if not it_postal(r.get('postal_code') or ''))}")
    lines.append(f"- Missing cities: {sum(1 for r in rows if not r.get('city'))}")
    lines.append(f"- Missing coordinates: {sum(1 for r in rows if r.get('lat') is None)}")
    lines.append("- Italian CAP preserved as 5-digit strings (leading zeros intact).")
    lines.append("- Italian text preserved (à, è, é, ì, ò, ù, apostrophes).")
    lines.append("- No city/CAP/country centroid fallbacks used.")
    lines.append("- San Marino / Vatican / FR / CH / AT / SI / HR / MT geocodes rejected.")
    lines.append("")

    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_80m') or [])}")
    lines.append(f"- Existing Italy in live catalog: {live_report.get('existing_italy_in_catalog')}")
    lines.append(f"- `it_*` IDs already in live catalog: {len(live_report.get('it_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append("")

    lines.append("## Completeness")
    lines.append("")
    lines.append("**Strong Phase 1 coverage:** FitActive (official JSON), McFIT/RSG (Magicline), Virgin Active (locator attrs).")
    lines.append("")
    lines.append("**Partial:** FitUP, Fit Express, WebFit, 20Hours, Fitness Park.")
    lines.append("")
    lines.append("**Phase 2 priorities:**")
    lines.append("- Anytime Fitness Italy (~60–66) — Webflow/JS locator")
    lines.append("- Orange / Gym Nation / GetFIT rebrands (~23–33) — Livewire CSRF-protected club data")
    lines.append("- FitUP remaining address/coord gaps + growth toward 150")
    lines.append("- Fit Express CAP/address cleanup + geocode")
    lines.append("- WebFit missing CAP enrichment")
    lines.append("- Regional independents (Lombardia, Lazio, Piemonte, Veneto, Emilia-Romagna, Toscana, Campania, Sicilia, Puglia, Liguria, Sardegna)")
    lines.append("- Tonic, Audace, Hard Candy Fitness verification (presence unclear / boutique risk)")
    lines.append("")

    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows from Phase 1.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live:,} + {ready_n} = {n_live + ready_n:,}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.")
    lines.append("")

    lines.append("## 10K Checkpoint")
    lines.append("")
    expected = n_live + ready_n
    if expected > 10000:
        lines.append(f"**YES — merge would exceed 10,000 ({expected:,}).**")
        lines.append("After Italy merge + Italy QA → run GLOBAL 10K+ stress QA before next country.")
    else:
        lines.append(f"No — projected total {expected:,} remains under 10,000 (headroom {10000 - expected:,}).")
    lines.append("")

    lines.append("## Files")
    lines.append("")
    for f in [
        "scripts/italy-phase1-discover.py",
        "scripts/italy-phase1-consolidate.py",
        "data/italy/italy_centers_staging.json",
        "data/italy/italy_geocode_review.json",
        "data/italy/italy_duplicate_analysis.json",
        "data/italy/ITALY_PHASE1_READINESS_REPORT.md",
        "data/italy/ITALY_PHASE1_READINESS_REPORT.json",
        "data/italy/ITALY_PHASE1_READY_TO_IMPORT.json",
        "data/italy/Gymly_Italy_All_Discovered_Centers.xlsx",
        "data/italy/italy_geocode_cache.json",
        "data/italy/italy_discovery_combined.json",
    ]:
        lines.append(f"- `{f}`")
    lines.append("- `data/italy/raw/` official HTML/JSON captures")
    lines.append("- `data/italy/scrapes/` per-chain discovery JSON")
    lines.append("")
    lines.append("**STOP. Do not merge Italy. Do not run Italy QA. Do not start another country.**")
    lines.append("")
    (OUT / "ITALY_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    report_json = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "production_before": n_live,
        "italy_live_before": live_report.get("existing_italy_in_catalog"),
        "production_modified": False,
        "discovered": len(rows),
        "categories": dict(cats),
        "ready_to_import": ready_n,
        "ready_by_brand": dict(by_brand),
        "projected_catalog": n_live + ready_n,
        "crosses_10k": (n_live + ready_n) > 10000,
        "recommendation": (
            "ITALY PHASE 2 REQUIRED BEFORE MERGE"
            if ready_n < 200 or cats.get("NEEDS_REVIEW", 0) + cats.get("NEEDS_COORDINATES", 0) > ready_n
            else "READY FOR ITALY MERGE"
        ),
        "geography_ready": dict(buckets),
        "live_dupes": live_report,
        "staging_dupes": staging_report,
        "collapsed": len(collapsed),
    }
    # Prefer Phase 2 if major chains incomplete
    if by_brand.get("FitActive", 0) < 100 or ready_n < 250:
        report_json["recommendation"] = "ITALY PHASE 2 REQUIRED BEFORE MERGE"
    (OUT / "ITALY_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(report_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return ready_n, report_json


MARKET_AUDIT = [
    "### Brand relationships",
    "",
    "- **FitActive**: Largest Italian-owned group (~172–188 IT). 24/7 budget franchise. Official Club/Club JSON includes lat/lng + CAP.",
    "- **McFIT / JOHN REED / Gold's Gym**: RSG Group. Magicline API lists ~48 IT studios (mostly McFIT). Expansion toward ~100 claimed.",
    "- **Virgin Active**: Premium leader (~42 IT). Official club finder exposes address + CAP + coords.",
    "- **FitUP**: Fast-growing 24/7 chain (~80+ on site; target 150 YE2026). WordPress club CPT; addresses on Elementor pages.",
    "- **Fit Express**: ~70 24/7 clubs. WP club CPT; addresses on club-hero.",
    "- **Anytime Fitness**: ~60–66 IT; target 100 by 2027. Webflow JS locator → Phase 2.",
    "- **Orange / Gym Nation (Vam)**: ~23–33 clubs after GetFIT acquisition (Jul 2026). Livewire locator hostile → Phase 2.",
    "- **GetFIT**: 6/8 clubs sold to Orange; 2 retained by founders. Treat as Orange rebrand / legacy.",
    "- **WebFit**: Regional innovative clubs; official map markers with coords (CAP often missing).",
    "- **20Hours**: Small Milan-area chain (~7).",
    "- **Fitness Park**: First Italy club RomaEst opened Jul 2026.",
    "- **Basic-Fit**: No material Italy club list on it-it club-finder (empty / wrong-locale bleed).",
    "- **Fit And Go**: EMS/Vacufit — **EXCLUDE**.",
    "- **Brooklyn Fitboxing / Orangetheory**: Boutique class formats — **EXCLUDE**.",
    "",
    "### Qualification decisions",
    "",
    "| Chain | Decision | Reason | Source accessibility |",
    "|---|---|---|---|",
    "| FitActive | INCLUDE | Conventional 24/7 strength/cardio | Easy — embedded JSON |",
    "| McFIT | INCLUDE | Budget conventional | Easy — Magicline API |",
    "| JOHN REED | INCLUDE | Conventional (RSG) | Easy — Magicline |",
    "| Gold's Gym | INCLUDE | Conventional (RSG IT) | Easy — Magicline |",
    "| Virgin Active | INCLUDE | Premium conventional | Easy — HTML data attrs |",
    "| FitUP | INCLUDE | 24/7 conventional | Medium — WP + page scrape |",
    "| Fit Express | INCLUDE | 24/7 conventional | Medium — WP + page scrape |",
    "| WebFit | INCLUDE | Conventional multi-location | Easy — map markers |",
    "| 20Hours | INCLUDE | Conventional | Medium — club pages |",
    "| Fitness Park | INCLUDE | Premium-accessible | Easy — club page |",
    "| Orange | INCLUDE | Conventional; incomplete Phase 1 | Hostile — Livewire |",
    "| Anytime Fitness | LATER | Conventional; JS locator | Hostile — Phase 2 |",
    "| GetFIT | LATER | Acquired/rebranding to Orange | Partial |",
    "| Basic-Fit | EXCLUDE (IT) | No Italy clubs found | N/A |",
    "| Fit And Go | EXCLUDE | EMS boutique | N/A |",
    "| Tonic / Audace / Hard Candy | LATER/NEEDS_REVIEW | Presence/format unclear | Weak websites |",
]


def main():
    t0 = time.time()
    raw_rows = load_scrapes()
    print("loaded scrapes", len(raw_rows))
    rows, collapsed = collapse_staging(raw_rows)
    print("after collapse", len(rows), "collapsed", len(collapsed))
    rows = [classify_pre(r) for r in rows]

    cache = {}
    if CACHE.exists():
        try:
            cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    need = [r for r in rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print("geocode candidates", len(need))
    for i, r in enumerate(need, 1):
        geocode_row(r, cache)
        if i % 25 == 0:
            print(f"  geocoded {i}/{len(need)}")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # Re-apply ready gate
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not ready_gate(r):
            if r.get("lat") is None:
                r["import_category"] = "NEEDS_COORDINATES"
            else:
                r["import_category"] = "NEEDS_REVIEW"

    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    n_live = len(centers)

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and ready_gate(r)]
    (OUT / "ITALY_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    dup_path = OUT / "italy_duplicate_analysis.json"
    dup_path.write_text(
        json.dumps({"live": live_report, "staging": staging_report, "collapsed": collapsed}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_geocode_review(rows)
    write_excel(rows)
    ready_n, report_json = write_report(rows, live_report, staging_report, collapsed, n_live, MARKET_AUDIT)

    print("READY", ready_n)
    print("cats", Counter(r.get("import_category") for r in rows))
    print("recommendation", report_json.get("recommendation"))
    print("elapsed_s", round(time.time() - t0))
    print("centers.json untouched; bytes", CENTERS.stat().st_size)


if __name__ == "__main__":
    main()
