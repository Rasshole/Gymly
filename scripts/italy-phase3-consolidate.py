#!/usr/bin/env python3
"""
Italy Phase 3 consolidate — classify NEW discoveries, geocode, dedupe, reports.

Does NOT modify src/data/centers.json.
Projected catalog = 9056 + NEW_READY_PHASE3 (do not re-add 550).
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

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "italy_centers_staging.json"
CACHE = OUT / "italy_geocode_cache.json"
PHASE3_CACHE = OUT / "italy_phase3_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyItalyGeocoder/3.0 (catalog research; accuracy over coverage; no fallback centroids)"

IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)

ALLOWED_COORD = {
    "OFFICIAL_COORDINATE",
    "OFFICIAL_MAP_PIN",
    "NAMED_GYM_POI",
    "STRICT_ADDRESS_GEOCODE",
}
COARSE = {
    "country", "state", "region", "county", "postcode", "municipality",
    "city", "town", "village", "suburb", "neighbourhood", "quarter",
    "district", "borough", "province", "island",
}
FORBIDDEN_CC = {"sm", "va", "fr", "ch", "at", "si", "hr", "mt"}

# Official estate estimates (CIWAS / press / official sites — verified Phase 3)
LIVE_BRAND_AUDIT = {
    "FitActive": {
        "official_estimate": 172,
        "official_note": "CIWAS 2026: 172 Italy (187 EU+BR); site estate matches production",
        "status_hint": "COMPLETE",
    },
    "FitUP": {
        "official_estimate": 83,
        "official_note": "Site ~80–84; target 100; 4 NEEDS_REVIEW address blanks",
        "status_hint": "COMPLETE",
    },
    "Anytime Fitness": {
        "official_estimate": 66,
        "official_note": "CIWAS: 66 open Italy; API status=3 → 68 LIVE + 13 coming",
        "status_hint": "COMPLETE",
    },
    "Fit Express": {
        "official_estimate": 70,
        "official_note": "~70 claimed; 45 READY + 24 unresolved geocode leftovers",
        "status_hint": "NEAR-COMPLETE",
    },
    "McFIT": {
        "official_estimate": 45,
        "official_note": "RSG/CIWAS ~45 Italy incl brands; Magicline 42 open +1 coming",
        "status_hint": "COMPLETE",
    },
    "Virgin Active": {
        "official_estimate": 42,
        "official_note": "CIWAS/official: 42 Italy premium",
        "status_hint": "COMPLETE",
    },
    "Icon Palestre": {
        "official_estimate": 47,
        "official_note": "Sitemap ~47 pages; 31 READY + 16 unresolved",
        "status_hint": "NEAR-COMPLETE",
    },
    "Orange": {
        "official_estimate": 33,
        "official_note": "Site 23 open; press Jul 2026 → 33 after GetFIT 6 (not yet on locator)",
        "status_hint": "MATERIAL_GAP",
    },
    "WebFit": {
        "official_estimate": 16,
        "official_note": "Official site ~16",
        "status_hint": "COMPLETE",
    },
    "20Hours": {
        "official_estimate": 7,
        "official_note": "Milan-area 7 clubs",
        "status_hint": "COMPLETE",
    },
    "Gold's Gym": {
        "official_estimate": 2,
        "official_note": "RSG Italy ~2",
        "status_hint": "COMPLETE",
    },
    "JOHN REED": {
        "official_estimate": 2,
        "official_note": "RSG ~1–2 Italy (1 live + 1 coming)",
        "status_hint": "NEAR-COMPLETE",
    },
}

MISSING_CHAIN_AUDIT = {
    "FITINN": {
        "decision": "NEW_CHAIN",
        "estate": 10,
        "note": "Austrian low-cost; ex-YouFit Milan + Prato/Bologna/Brescia; official locator",
    },
    "GetFIT": {
        "decision": "NEW_CHAIN_PARTIAL",
        "estate": 8,
        "note": "6→Orange Jul 2026 (not on Orange site yet); 2 founder-retained; site 403; Wayback pins",
    },
    "Dabliu": {
        "decision": "NEW_CHAIN",
        "estate": 5,
        "note": "5 Rome conventional fitness clubs with shared membership",
    },
    "Fitness Park": {
        "decision": "NEW_OR_RECOVER",
        "estate": 1,
        "note": "RomaEst open; further IT expansion planned; was NEEDS_COORDINATES in staging",
    },
    "Palestre Italiane": {
        "decision": "ALREADY_LIVE_UNDER_ORANGE",
        "estate": 0,
        "note": "Brand under Orange/Gym Nation; locator redirects to Orange 23 clubs",
    },
    "Prime Fitness": {
        "decision": "EXCLUDE_BELOW_THRESHOLD",
        "estate": 2,
        "note": "2 Bologna clubs only (<5)",
    },
    "Happy Fit": {
        "decision": "EXCLUDE_ABSORBED",
        "estate": 0,
        "note": "14 clubs → McFIT in 2014",
    },
    "Zero10": {
        "decision": "EXCLUDE_SINGLE",
        "estate": 1,
        "note": "Single Padova SSD",
    },
    "Tonic": {
        "decision": "EXCLUDE_NOT_FOUND",
        "estate": 0,
        "note": "No verifiable multi-site conventional estate",
    },
    "Fit And Go": {
        "decision": "EXCLUDE_EMS",
        "estate": 0,
        "note": "EMS/Vacufit boutique",
    },
    "Heaven": {
        "decision": "EXCLUDE_NOT_FOUND",
        "estate": 0,
        "note": "No independent 5+ conventional chain verified",
    },
    "Forum Sport Center": {
        "decision": "EXCLUDE_SINGLE_COMPLEX",
        "estate": 1,
        "note": "Single Rome multi-sport complex (forumroma.it)",
    },
    "Basic-Fit": {
        "decision": "EXCLUDE_NO_ITALY",
        "estate": 0,
        "note": "No Italy club list",
    },
    "WebFit": {"decision": "ALREADY_LIVE", "estate": 16, "note": "Production complete"},
    "20Hours": {"decision": "ALREADY_LIVE", "estate": 7, "note": "Production complete"},
    "Fit Express": {"decision": "ALREADY_LIVE_NEAR_COMPLETE", "estate": 70, "note": "45 live; geocode leftovers"},
    "Icon Palestre": {"decision": "ALREADY_LIVE_NEAR_COMPLETE", "estate": 47, "note": "31 live; page leftovers"},
}


def log(*a):
    print(*a, flush=True)


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


def valid_city(city) -> str:
    city = str(city or "").strip(" ,.")
    if not city:
        return ""
    if city.isdigit() or it_postal(city) == city:
        return ""
    if len(city) == 2 and city.isupper():
        return ""
    city = re.sub(r"\s+[A-Z]{2}$", "", city).strip()
    return city


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


def load_cache():
    cache = {}
    for path in (CACHE, PHASE3_CACHE):
        if path.exists():
            try:
                cache.update(json.loads(path.read_text(encoding="utf-8")))
            except Exception:
                pass
    return cache


def save_cache(cache):
    PHASE3_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


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


def nominatim_reverse(lat, lng, cache):
    key = f"rev:{round(float(lat),6)},{round(float(lng),6)}"
    if key in cache:
        return cache[key]
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({
        "lat": lat,
        "lon": lng,
        "format": "json",
        "addressdetails": 1,
        "zoom": 18,
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[key] = data
    time.sleep(1.1)
    return data


def fill_cap_from_reverse(r, cache):
    if it_postal(r.get("postal_code") or ""):
        return r
    if r.get("coord_source") not in {"OFFICIAL_COORDINATE", "OFFICIAL_MAP_PIN"}:
        return r
    if r.get("lat") is None or r.get("lng") is None:
        return r
    try:
        data = nominatim_reverse(r["lat"], r["lng"], cache)
    except Exception:
        time.sleep(1.1)
        return r
    addr = (data or {}).get("address") or {}
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "it":
        return r
    if cc in FORBIDDEN_CC:
        return r
    postal = it_postal(addr.get("postcode") or "")
    if not postal:
        return r
    r["postal_code"] = postal
    if not valid_city(r.get("city") or ""):
        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
        r["city"] = valid_city(city or "")
    r["notes"] = ((r.get("notes") or "") + "; cap_from_official_pin_reverse").strip("; ")
    r["id"] = make_id(r.get("brand"), r.get("address") or "", postal, r.get("city") or "")
    return r


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
    if "gym" in t or "fitness" in t or "fitness" in display or "fitinn" in display or "dabliu" in display:
        score += 2
        reasons.append("named_gym_poi")

    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons and "named_gym_poi" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache, review):
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE", "ALREADY_LIVE"}:
        return r
    if r.get("lat") is not None and r.get("lng") is not None and r.get("coord_source") in ALLOWED_COORD and it_postal(r.get("postal_code") or ""):
        r["import_category"] = "READY_TO_IMPORT"
        return r

    street = r.get("address") or ""
    postal = it_postal(r.get("postal_code") or "")
    city = valid_city(r.get("city") or "")
    brand = r.get("brand") or ""

    # Already have official pin but missing CAP → reverse only
    if r.get("lat") is not None and r.get("lng") is not None and r.get("coord_source") in {"OFFICIAL_COORDINATE", "OFFICIAL_MAP_PIN"}:
        r = fill_cap_from_reverse(r, cache)
        if it_postal(r.get("postal_code") or "") and in_italy_bbox(r["lat"], r["lng"]):
            r["import_category"] = "READY_TO_IMPORT"
            r["is_active"] = True
            return r
        r["import_category"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + "; missing_cap_after_reverse").strip("; ")
        return r

    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        return r

    queries = []
    if brand:
        queries.append(f"{brand}, {street}, {postal} {city}, Italy".strip(", "))
        queries.append(f"{brand} {city}, {street}, Italy")
    if postal:
        queries.append(f"{street}, {postal} {city}, Italy")
        queries.append(f"{street}, {postal}, Italy")
    queries.append(f"{street}, {city}, Italy")

    best = None
    best_score = -1
    best_reasons = []
    tried = []
    for q in queries:
        try:
            results = nominatim(q, cache)
        except Exception as e:
            tried.append({"q": q, "error": str(e)})
            time.sleep(1.1)
            continue
        tried.append({"q": q, "n": len(results or [])})
        for item in results or []:
            sc, reasons, lat, lng = score_candidate(item, street, postal, city)
            if sc is None:
                continue
            src = "NAMED_GYM_POI" if "named_gym_poi" in reasons else "STRICT_ADDRESS_GEOCODE"
            if sc > best_score:
                best_score = sc
                best = (lat, lng, src, reasons, item.get("display_name"))
                best_reasons = reasons

    if best:
        lat, lng, src, reasons, disp = best
        r["lat"], r["lng"] = lat, lng
        r["coord_source"] = src
        r["notes"] = ((r.get("notes") or "") + f"; geocode={src}:{','.join(reasons)}").strip("; ")
        if not it_postal(r.get("postal_code") or ""):
            try:
                data = nominatim_reverse(lat, lng, cache)
                addr = (data or {}).get("address") or {}
                cc = (addr.get("country_code") or "").lower()
                pc = it_postal(addr.get("postcode") or "")
                if pc and cc == "it":
                    r["postal_code"] = pc
                    r["notes"] = ((r.get("notes") or "") + "; cap_from_geocode_reverse").strip("; ")
                    r["id"] = make_id(r.get("brand"), r.get("address") or "", pc, r.get("city") or "")
            except Exception:
                time.sleep(1.1)
        if it_postal(r.get("postal_code") or "") and in_italy_bbox(lat, lng):
            r["import_category"] = "READY_TO_IMPORT"
            r["is_active"] = True
            r["geocode_status"] = "ok"
        else:
            r["import_category"] = "NEEDS_REVIEW"
            r["geocode_status"] = "missing_cap"
        review.append({"id": r["id"], "name": r["name"], "status": r["import_category"], "tried": tried, "best": disp})
        return r

    r["import_category"] = "NEEDS_COORDINATES" if postal else "NEEDS_REVIEW"
    r["geocode_status"] = "no_high_confidence_hit"
    review.append({"id": r.get("id"), "name": r.get("name"), "status": r["import_category"], "tried": tried})
    return r


def coverage_status(prod_n, official, hint):
    if official is None or official <= 0:
        return "UNCERTAIN"
    pct = 100.0 * prod_n / official
    if hint == "MATERIAL_GAP":
        return "MATERIAL GAP"
    if pct >= 95:
        return "COMPLETE"
    if pct >= 80:
        return "NEAR-COMPLETE"
    if pct >= 50:
        return "MATERIAL GAP"
    return "MATERIAL GAP"


def dedupe_analysis(candidates, production_all, production_it):
    """Dedupe NEW candidates vs Italy + full catalog."""
    report = {
        "same_id_vs_italy": [],
        "same_id_vs_catalog": [],
        "same_brand_proximity_50m": [],
        "same_brand_proximity_100m": [],
        "cross_brand_proximity_50m": [],
        "internal_phase3_dupes": [],
    }
    prod_ids = {c["id"] for c in production_all}
    it_ids = {c["id"] for c in production_it}
    by_brand = defaultdict(list)
    for c in production_it:
        if c.get("lat") is not None and c.get("lng") is not None:
            by_brand[norm(c.get("brand"))].append(c)
    all_with_coords = [c for c in production_all if c.get("lat") is not None and c.get("lng") is not None]

    seen = {}
    kept = []
    for r in candidates:
        if r["id"] in it_ids:
            report["same_id_vs_italy"].append(r["id"])
            r["import_category"] = "ALREADY_LIVE"
            r["discovery_class"] = "ALREADY_LIVE"
            continue
        if r["id"] in prod_ids:
            report["same_id_vs_catalog"].append(r["id"])
            r["import_category"] = "DUPLICATE"
            continue
        if r["id"] in seen:
            report["internal_phase3_dupes"].append(r["id"])
            continue
        seen[r["id"]] = r

        if r.get("lat") is not None and r.get("lng") is not None and r.get("import_category") != "CLOSED":
            try:
                la, lo = float(r["lat"]), float(r["lng"])
            except (TypeError, ValueError):
                kept.append(r)
                continue
            brand_n = norm(r.get("brand"))
            for p in by_brand.get(brand_n, []):
                d = haversine(la, lo, float(p["lat"]), float(p["lng"]))
                if d < 50:
                    report["same_brand_proximity_50m"].append({
                        "new": r["name"], "live": p.get("name"), "m": round(d, 1), "new_id": r["id"], "live_id": p["id"],
                    })
                    r["import_category"] = "DUPLICATE"
                    r["notes"] = ((r.get("notes") or "") + f"; dup_same_brand_{d:.0f}m").strip("; ")
                    break
                if d < 100:
                    report["same_brand_proximity_100m"].append({
                        "new": r["name"], "live": p.get("name"), "m": round(d, 1), "new_id": r["id"], "live_id": p["id"],
                    })
            if r.get("import_category") == "DUPLICATE":
                continue
            # inspect cross-brand <50m (flag only)
            for p in all_with_coords:
                if norm(p.get("brand")) == brand_n:
                    continue
                try:
                    d = haversine(la, lo, float(p["lat"]), float(p["lng"]))
                except (TypeError, ValueError):
                    continue
                if d < 50:
                    report["cross_brand_proximity_50m"].append({
                        "new": r["name"], "live": p.get("name"), "live_brand": p.get("brand"),
                        "m": round(d, 1),
                    })
        kept.append(r)
    return kept, report


def write_xlsx(rows):
    if not HAS_OPENPYXL:
        log("openpyxl missing — skip xlsx")
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Phase3 Completeness"
    headers = [
        "id", "discovery_class", "import_category", "brand", "name", "address",
        "postal_code", "city", "country", "lat", "lng", "coord_source",
        "source_url", "notes", "phase",
    ]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([
            r.get("id"),
            r.get("discovery_class"),
            r.get("import_category"),
            r.get("brand"),
            r.get("name"),
            r.get("address"),
            str(r.get("postal_code") or ""),  # CAP as TEXT
            r.get("city"),
            r.get("country"),
            r.get("lat"),
            r.get("lng"),
            r.get("coord_source"),
            r.get("source_url"),
            r.get("notes"),
            r.get("phase"),
        ])
    # force CAP column as text
    for cell in ws["G"]:
        cell.number_format = "@"
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = min(40, max(12, len(h) + 2))
    path = OUT / "Gymly_Italy_Phase3_Completeness.xlsx"
    wb.save(path)
    log("Wrote", path)


def main():
    log("Italy Phase 3 consolidate")
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    assert len(centers) == 9056, f"Expected 9056 centers, got {len(centers)}"
    production_it = [c for c in centers if c.get("country") == "Italy" or str(c.get("id", "")).startswith("it_")]
    assert len(production_it) == 550, f"Expected 550 Italy, got {len(production_it)}"
    log(f"Catalog {len(centers)}; Italy {len(production_it)}")

    disc_path = SCRAPES / "phase3_discovery.json"
    discovered = json.loads(disc_path.read_text(encoding="utf-8"))
    log(f"Phase3 discovery in: {len(discovered)}")

    cache = load_cache()
    review = []

    # Process candidates
    processed = []
    for r in discovered:
        r = dict(r)
        r["postal_code"] = it_postal(r.get("postal_code")) or None
        r["city"] = valid_city(r.get("city") or "")
        r["country"] = "Italy"
        if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
            r["import_category"] = "CLOSED"
            r["discovery_class"] = r.get("discovery_class") or "NEW_CANDIDATE"
            processed.append(r)
            continue
        if r.get("discovery_class") == "ALREADY_LIVE":
            r["import_category"] = "ALREADY_LIVE"
            processed.append(r)
            continue
        r = geocode_row(r, cache, review)
        # Final READY gate
        if r.get("import_category") == "READY_TO_IMPORT":
            ok = (
                r.get("id", "").startswith("it_")
                and r.get("name")
                and r.get("brand")
                and r.get("address")
                and bool(re.fullmatch(r"\d{5}", str(r.get("postal_code") or "")))
                and r.get("city")
                and r.get("country") == "Italy"
                and r.get("lat") is not None
                and r.get("lng") is not None
                and math.isfinite(float(r["lat"]))
                and math.isfinite(float(r["lng"]))
                and r.get("coord_source") in ALLOWED_COORD
                and in_italy_bbox(r["lat"], r["lng"])
            )
            if not ok:
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = ((r.get("notes") or "") + "; failed_ready_gate").strip("; ")
        processed.append(r)
        log(f"  {r.get('import_category')}: {r.get('brand')} | {r.get('name')}")

    save_cache(cache)

    new_only = [r for r in processed if r.get("discovery_class") != "ALREADY_LIVE"]
    new_only, dup_report = dedupe_analysis(new_only, centers, production_it)

    ready = [r for r in new_only if r.get("import_category") == "READY_TO_IMPORT"]
    # Ensure CAP is string
    for r in ready:
        r["postal_code"] = str(r["postal_code"])

    # --- Live brand market audit ---
    brand_counts = Counter(c.get("brand") for c in production_it)
    market_audit = {"live_brands": {}, "missing_chains": MISSING_CHAIN_AUDIT, "generated_at": datetime.now(timezone.utc).isoformat()}
    for brand, n in sorted(brand_counts.items(), key=lambda x: -x[1]):
        meta = LIVE_BRAND_AUDIT.get(brand, {})
        official = meta.get("official_estimate")
        missing = max(0, (official or 0) - n) if official else None
        pct = round(100.0 * n / official, 1) if official else None
        status = coverage_status(n, official, meta.get("status_hint"))
        # Orange special: production 23 vs site 23 complete for published locator,
        # but GetFIT integration → MATERIAL GAP vs 33 estate
        if brand == "Orange":
            status = "MATERIAL GAP"
            missing = max(0, 33 - n)
            pct = round(100.0 * n / 33, 1)
        market_audit["live_brands"][brand] = {
            "production_count": n,
            "official_estate_estimate": official,
            "missing_vs_estimate": missing,
            "coverage_pct": pct,
            "status": status,
            "note": meta.get("official_note", ""),
        }

    # New chain coverage addendum
    market_audit["new_phase3_brands"] = {}
    for brand in sorted({r["brand"] for r in new_only}):
        br = [r for r in new_only if r["brand"] == brand]
        market_audit["new_phase3_brands"][brand] = {
            "discovered": len(br),
            "ready": sum(1 for r in br if r.get("import_category") == "READY_TO_IMPORT"),
            "needs_coordinates": sum(1 for r in br if r.get("import_category") == "NEEDS_COORDINATES"),
            "needs_review": sum(1 for r in br if r.get("import_category") == "NEEDS_REVIEW"),
            "coming_soon": sum(1 for r in br if r.get("import_category") == "COMING_SOON"),
            "closed": sum(1 for r in br if r.get("import_category") == "CLOSED"),
            "duplicate": sum(1 for r in br if r.get("import_category") == "DUPLICATE"),
        }

    new_ready_n = len(ready)
    projected = 9056 + new_ready_n
    headroom = 10000 - projected
    exceed_at = 945  # 9056 + 945 = 10001

    # Phase 4 decision
    phase4_reasons = []
    # Major chain materially unresolved
    if market_audit["live_brands"].get("Orange", {}).get("status") == "MATERIAL GAP":
        phase4_reasons.append("Orange estate ~33 vs 23 live; GetFIT 6 acquired not on Orange locator")
    fitinn_ready = market_audit["new_phase3_brands"].get("FITINN", {}).get("ready", 0)
    fitinn_disc = market_audit["new_phase3_brands"].get("FITINN", {}).get("discovered", 0)
    if fitinn_disc >= 5 and fitinn_ready < fitinn_disc:
        phase4_reasons.append(f"FITINN locator unfinished for READY gate ({fitinn_ready}/{fitinn_disc})")
    getfit_ready = market_audit["new_phase3_brands"].get("GetFIT", {}).get("ready", 0)
    getfit_open = sum(
        1 for r in new_only
        if r["brand"] == "GetFIT" and r.get("import_category") not in {"CLOSED"}
    )
    if getfit_open >= 5 and getfit_ready < 6:
        phase4_reasons.append(f"GetFIT/Orange integration extractable but incomplete READY ({getfit_ready} ready of open clubs)")
    # Fit Express / Icon leftovers still material?
    fe_missing = market_audit["live_brands"].get("Fit Express", {}).get("missing_vs_estimate") or 0
    icon_missing = market_audit["live_brands"].get("Icon Palestre", {}).get("missing_vs_estimate") or 0
    if fe_missing >= 15:
        phase4_reasons.append(f"Fit Express material unresolved (~{fe_missing} vs estate)")
    if icon_missing >= 10:
        phase4_reasons.append(f"Icon Palestre material unresolved (~{icon_missing} vs estate)")
    # 100+ recoverable?
    # Rough recoverable: Fit Express 24 + Icon 16 + Orange/GetFIT ~10 + FITINN leftovers + Dabliu leftovers
    staging = []
    if STAGING.exists():
        staging = json.loads(STAGING.read_text(encoding="utf-8"))
    staging_unresolved = [
        c for c in staging
        if c.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        and c.get("brand") in {"Fit Express", "Icon Palestre", "Fitness Park", "FitUP"}
    ]
    p3_unresolved = [
        r for r in new_only
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
    ]
    credible_recoverable = len(staging_unresolved) + len(p3_unresolved) + max(0, 33 - 23 - getfit_ready)
    if credible_recoverable >= 100:
        phase4_reasons.append(f"100+ credible conventional leftovers still recoverable (~{credible_recoverable})")

    # Always Phase 4 if major new national chain not fully imported OR Orange gap
    if fitinn_disc >= 8:
        phase4_reasons.append("Major new national chain FITINN (10 clubs) discovered — completeness merge after Phase 3 READY staging still leaves Orange/GetFIT + Fit Express/Icon gaps")

    # Decision: Phase 4 REQUIRED if any material reason
    # Refine: FITINN being newly staged as READY is good; Phase 4 if still major unresolved after this phase
    phase4_required = False
    decision_reasons = []
    if market_audit["live_brands"]["Orange"]["status"] == "MATERIAL GAP":
        phase4_required = True
        decision_reasons.append("Orange/GetFIT material gap (23/33; acquisition not on official Orange locator)")
    if fe_missing >= 20 or icon_missing >= 12:
        phase4_required = True
        decision_reasons.append("Fit Express and/or Icon still materially incomplete vs official estate")
    if fitinn_ready < 8 and fitinn_disc >= 8:
        phase4_required = True
        decision_reasons.append("FITINN extractable locator not fully READY")
    if getfit_ready < 5:
        phase4_required = True
        decision_reasons.append("GetFIT clubs not sufficiently READY for completeness")
    # If we got most FITINN+GetFIT+Dabliu READY and only residual geocode leftovers <100, may still need Phase 4 for Orange locator
    # Credible recoverable under 100 alone doesn't force Phase 4 unless other triggers
    if not decision_reasons and credible_recoverable >= 100:
        phase4_required = True
        decision_reasons.append(">=100 credible leftovers")

    # Strong trigger: we found a major missing national chain — even if staged, Orange gap remains
    # Final policy from prompt: PHASE 4 if major chain unresolved OR extractable locator unfinished OR major regional gap OR 100+
    final_decision = (
        "ITALY PHASE 4 REQUIRED BEFORE COMPLETENESS MERGE"
        if phase4_required
        else "READY FOR ITALY COMPLETENESS MERGE"
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_catalog": 9056,
        "production_italy": 550,
        "phase3_discovered": len(discovered),
        "phase3_new_candidates": len(new_only),
        "READY_TO_IMPORT": new_ready_n,
        "NEEDS_COORDINATES": sum(1 for r in new_only if r.get("import_category") == "NEEDS_COORDINATES"),
        "NEEDS_REVIEW": sum(1 for r in new_only if r.get("import_category") == "NEEDS_REVIEW"),
        "COMING_SOON": sum(1 for r in new_only if r.get("import_category") == "COMING_SOON"),
        "CLOSED": sum(1 for r in new_only if r.get("import_category") == "CLOSED"),
        "DUPLICATE": sum(1 for r in new_only if r.get("import_category") == "DUPLICATE"),
        "ready_by_brand": dict(Counter(r["brand"] for r in ready)),
        "projected_catalog": projected,
        "headroom_to_10k": headroom,
        "exceed_10k_at_new_ready": exceed_at,
        "credible_recoverable_estimate": credible_recoverable,
        "phase4_required": phase4_required,
        "phase4_reasons": decision_reasons,
        "final_decision": final_decision,
        "live_brand_status": {k: v["status"] for k, v in market_audit["live_brands"].items()},
    }

    # Write outputs
    (OUT / "ITALY_PHASE3_NEW_CANDIDATES.json").write_text(
        json.dumps(new_only, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "ITALY_PHASE3_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "ITALY_PHASE3_GEOCODE_REVIEW.json").write_text(
        json.dumps(review, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "ITALY_PHASE3_DUPLICATE_ANALYSIS.json").write_text(
        json.dumps(dup_report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "ITALY_PHASE3_MARKET_AUDIT.json").write_text(
        json.dumps(market_audit, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "ITALY_PHASE3_COMPLETENESS_REPORT.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Markdown report
    lines = []
    lines.append("# Italy Phase 3 — Deep Market Completeness Audit")
    lines.append("")
    lines.append(f"Generated: {report['generated_at']}")
    lines.append("")
    lines.append("**`src/data/centers.json` was NOT modified.** Production remains **9,056 / Italy 550**.")
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    lines.append(f"**{final_decision}**")
    lines.append("")
    if decision_reasons:
        lines.append("Reasons:")
        for reason in decision_reasons:
            lines.append(f"- {reason}")
        lines.append("")
    lines.append("## Catalog math")
    lines.append("")
    lines.append(f"- Production catalog: **9056**")
    lines.append(f"- Production Italy: **550** (unchanged)")
    lines.append(f"- NEW READY Phase 3: **{new_ready_n}**")
    lines.append(f"- Projected catalog = 9056 + {new_ready_n} = **{projected}**")
    lines.append(f"- Headroom to 10k: **{headroom}** (exceeds at +{exceed_at} NEW READY)")
    lines.append("")
    lines.append("## Existing live Italy brand audit")
    lines.append("")
    lines.append("| Brand | Production | Official est. | Missing | Coverage % | Status |")
    lines.append("|---|---:|---:|---:|---:|---|")
    for brand, n in brand_counts.most_common():
        a = market_audit["live_brands"][brand]
        lines.append(
            f"| {brand} | {a['production_count']} | {a['official_estate_estimate']} | "
            f"{a['missing_vs_estimate']} | {a['coverage_pct']} | {a['status']} |"
        )
    lines.append("")
    lines.append("## Missing / investigated chains")
    lines.append("")
    lines.append("| Chain | Decision | Estate | Note |")
    lines.append("|---|---|---:|---|")
    for name, meta in MISSING_CHAIN_AUDIT.items():
        lines.append(f"| {name} | {meta['decision']} | {meta['estate']} | {meta['note']} |")
    lines.append("")
    lines.append("## Phase 3 NEW candidates")
    lines.append("")
    lines.append(f"- Total NEW staged: **{len(new_only)}**")
    lines.append(f"- READY_TO_IMPORT: **{new_ready_n}**")
    lines.append(f"- NEEDS_COORDINATES: **{report['NEEDS_COORDINATES']}**")
    lines.append(f"- NEEDS_REVIEW: **{report['NEEDS_REVIEW']}**")
    lines.append(f"- CLOSED: **{report['CLOSED']}**")
    lines.append(f"- DUPLICATE: **{report['DUPLICATE']}**")
    lines.append("")
    lines.append("### READY by brand")
    lines.append("")
    lines.append("| Brand | READY |")
    lines.append("|---|---:|")
    for b, n in Counter(r["brand"] for r in ready).most_common():
        lines.append(f"| {b} | {n} |")
    lines.append(f"| **TOTAL** | **{new_ready_n}** |")
    lines.append("")
    lines.append("## Adequacy of 550")
    lines.append("")
    lines.append(
        "550 covers the previously staged national low-cost/premium set well (FitActive, FitUP, "
        "Anytime, McFIT, Virgin, WebFit, 20Hours), but is **not complete** for Italian commercial "
        "chain coverage: FITINN (10) was entirely missing, Dabliu (5) was missing, GetFIT/Orange "
        "integration (~10) is unresolved on the Orange locator, and Fit Express/Icon still have "
        "material geocode leftovers."
    )
    lines.append("")
    lines.append("## Files")
    lines.append("")
    for f in [
        "scripts/italy-phase3-discover.py",
        "scripts/italy-phase3-consolidate.py",
        "data/italy/ITALY_PHASE3_COMPLETENESS_REPORT.md",
        "data/italy/ITALY_PHASE3_COMPLETENESS_REPORT.json",
        "data/italy/ITALY_PHASE3_MARKET_AUDIT.json",
        "data/italy/ITALY_PHASE3_NEW_CANDIDATES.json",
        "data/italy/ITALY_PHASE3_READY_TO_IMPORT.json",
        "data/italy/ITALY_PHASE3_GEOCODE_REVIEW.json",
        "data/italy/ITALY_PHASE3_DUPLICATE_ANALYSIS.json",
        "data/italy/Gymly_Italy_Phase3_Completeness.xlsx",
    ]:
        lines.append(f"- `{f}`")
    lines.append("")
    lines.append(f"## FINAL: {final_decision}")
    lines.append("")

    (OUT / "ITALY_PHASE3_COMPLETENESS_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    write_xlsx(new_only)

    log(json.dumps(report, indent=2))
    log(final_decision)
    log("DONE consolidate")


if __name__ == "__main__":
    main()
