#!/usr/bin/env python3
"""
Italy Phase 2 consolidate — merge Phase 1 staging + Phase 2 scrapes,
reverse-CAP for official pins, Nominatim geocode, readiness artifacts.

Does NOT modify centers.json. No invented/centroid coordinates.
Preserves Phase 1 READY rows and deterministic it_* IDs for unchanged fields.
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
    from openpyxl.styles import Alignment, Font
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "italy_centers_staging.json"
PHASE1_BACKUP = OUT / "italy_centers_staging_phase1_backup.json"
CACHE = OUT / "italy_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyItalyGeocoder/2.0 (catalog research; accuracy over coverage; no fallback centroids)"

IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)
NORTH_LAT = 44.0
SOUTH_LAT = 41.0

MAJOR_CITIES = [
    "Roma", "Milano", "Torino", "Napoli", "Palermo", "Genova", "Bologna",
    "Firenze", "Bari", "Catania", "Venezia", "Verona", "Padova", "Trieste",
    "Brescia", "Parma", "Modena", "Cagliari", "Messina", "Reggio Emilia",
]

CHAIN_ESTIMATES = [
    ("FitActive", "~172–188 clubs Italy"),
    ("McFIT", "~42–46 clubs (RSG Magicline)"),
    ("JOHN REED", "~1–2 Italy (RSG)"),
    ("Gold's Gym", "~2 Italy (RSG)"),
    ("Virgin Active", "~42 premium clubs"),
    ("FitUP", "~80–150 (site listed ~83)"),
    ("Fit Express", "~70 clubs"),
    ("Anytime Fitness", "~60–66 open (API ~68 status=3)"),
    ("Orange", "~23–33 (incl. GetFIT acquisition)"),
    ("WebFit", "~16 clubs"),
    ("20Hours", "~7 Milan-area"),
    ("Fitness Park", "1 open (RomaEst)"),
    ("Icon Palestre", "~40–55 multi-region conventional"),
    ("GetFIT", "6 acquired by Orange; 2 founder-retained — site 403"),
    ("Basic-Fit", "0 Italy clubs"),
    ("Fit And Go", "EXCLUDE — EMS"),
]

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

PHASE2_SCRAPE_NAMES = [
    "fitup_p2", "fitexpress_p2", "webfit_p2", "20hours_p2", "fitnesspark_p2",
    "orange_p2", "anytime_p2", "icon_p2", "fitactive_cap_p2",
]


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


def slug_key(r):
    url = (r.get("source_url") or r.get("website") or "").rstrip("/")
    brand = norm(r.get("brand"))
    if not url:
        return brand, norm(r.get("name"))
    path = urllib.parse.urlparse(url).path.rstrip("/")
    parts = [p for p in path.split("/") if p]
    slug = parts[-1] if parts else ""
    # Anytime IT-0001
    m = re.search(r"(it-\d{4})", url, re.I)
    if m:
        slug = m.group(1).lower()
    return brand, slug.lower()


def richness(r):
    score = 0
    if r.get("address"):
        score += 2
    if it_postal(r.get("postal_code") or ""):
        score += 2
    if valid_city(r.get("city") or ""):
        score += 1
    if r.get("lat") is not None and r.get("lng") is not None:
        score += 3
    if r.get("coord_source") in ALLOWED_COORD:
        score += 1
    if r.get("import_category") == "READY_TO_IMPORT":
        score += 2
    if r.get("verification_status") == "COMING_SOON":
        score -= 1
    return score


def load_phase1():
    path = PHASE1_BACKUP if PHASE1_BACKUP.exists() else STAGING
    return json.loads(path.read_text(encoding="utf-8"))


def load_phase2():
    rows = []
    for name in PHASE2_SCRAPE_NAMES:
        p = SCRAPES / f"{name}.json"
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows.extend(data)
    return rows


def normalize_row(r):
    r = dict(r)
    r["postal_code"] = it_postal(r.get("postal_code")) or it_postal(r.get("address")) or None
    if r.get("address"):
        r["address"] = str(r["address"]).strip(" ,")
    r["city"] = valid_city(r.get("city") or "")
    r["country"] = "Italy"
    r["chain"] = r.get("chain") or r.get("brand")
    r["center_name"] = r.get("center_name") or r.get("name")
    r["id"] = make_id(
        r.get("brand") or r.get("chain"),
        r.get("address") or "",
        r.get("postal_code") or "",
        r.get("city") or "",
    )
    return r


def merge_rows(phase1, phase2):
    stats = {
        "phase1_in": len(phase1),
        "phase2_in": len(phase2),
        "preserved_phase1_ready": 0,
        "enriched": 0,
        "new_added": 0,
        "replaced_unresolved": 0,
    }
    frozen = {}
    by_slug = {}
    kept = []
    by_id = {}
    collapsed = []

    def add(r, source):
        r = normalize_row(r)
        key = r["id"]
        prev = by_id.get(key)
        if prev is None:
            by_id[key] = r
            kept.append(r)
            sk = slug_key(r)
            by_slug.setdefault(sk, []).append(r)
            if source == "p2":
                stats["new_added"] += 1
            return
        if richness(r) > richness(prev):
            if prev in kept:
                kept.remove(prev)
            notes = "; ".join(x for x in [prev.get("notes"), r.get("notes")] if x)
            r["notes"] = notes
            by_id[key] = r
            kept.append(r)
            if source == "p2":
                stats["enriched"] += 1
            collapsed.append({"kept": r.get("name"), "dropped": prev.get("name"), "id": key})
        else:
            for f in ("postal_code", "lat", "lng", "coord_source", "source_url", "website", "legacy_brand"):
                if not prev.get(f) and r.get(f):
                    prev[f] = r[f]
                    if source == "p2":
                        stats["enriched"] += 1

    # Freeze Phase 1 READY first (preserve IDs/coords)
    for r in phase1:
        r = normalize_row(r)
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            # preserve original Phase 1 id even if normalize would match
            frozen[r["id"]] = r
            stats["preserved_phase1_ready"] += 1
            add(r, "p1")

    # Phase 1 unresolved
    for r in phase1:
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        add(normalize_row(r), "p1")

    # Phase 2 — enrich / add; never overwrite frozen READY with worse/different id
    for r in phase2:
        r = normalize_row(r)
        sk = slug_key(r)
        # If matches a frozen READY slug, only fill missing CAP/fields on frozen
        matched_frozen = None
        for fr in frozen.values():
            if slug_key(fr) == sk:
                matched_frozen = fr
                break
            if (
                norm(fr.get("brand")) == norm(r.get("brand"))
                and fr.get("address")
                and r.get("address")
                and norm(fr.get("address")) == norm(r.get("address"))
                and (fr.get("postal_code") or "") == (r.get("postal_code") or "")
            ):
                matched_frozen = fr
                break
        if matched_frozen is not None:
            changed = False
            for f in ("postal_code", "website", "legacy_brand", "notes"):
                if f == "notes":
                    continue
                if not matched_frozen.get(f) and r.get(f):
                    matched_frozen[f] = r[f]
                    changed = True
            if changed:
                stats["enriched"] += 1
            continue

        # Replace unresolved same slug
        replaced = False
        for other in list(kept):
            if other["id"] in frozen:
                continue
            if slug_key(other) == sk and norm(other.get("brand")) == norm(r.get("brand")):
                if richness(r) >= richness(other):
                    if other in kept:
                        kept.remove(other)
                    by_id.pop(other["id"], None)
                    add(r, "p2")
                    stats["replaced_unresolved"] += 1
                    replaced = True
                    break
        if not replaced:
            add(r, "p2")

    # Soft-dedupe same brand+address+postal
    by_addr = defaultdict(list)
    for r in kept:
        if not r.get("address"):
            continue
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        by_addr[k].append(r)
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: -richness(x))
        best = group[0]
        for other in group[1:]:
            if other["id"] in frozen and best["id"] not in frozen:
                continue
            if other in kept and other["id"] not in frozen:
                other["import_category"] = "DUPLICATE"
                other["verification_status"] = "DUPLICATE"
                collapsed.append({"kept": best.get("name"), "dropped": other.get("name"), "reason": "same_brand_address"})

    return kept, collapsed, stats


def classify_pre(r):
    if r.get("import_category") == "DUPLICATE":
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["is_active"] = False
        return r
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        r["is_active"] = False
        return r
    city = valid_city(r.get("city") or "")
    r["city"] = city
    if not r.get("address") or not city:
        r["import_category"] = "NEEDS_REVIEW"
        return r
    postal = it_postal(r.get("postal_code") or "")
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_italy_bbox(lat, lng) and postal:
                r["lat"], r["lng"] = lat, lng
                r["postal_code"] = postal
                if not r.get("coord_source"):
                    r["coord_source"] = "OFFICIAL_COORDINATE"
                if r.get("coord_source") in ALLOWED_COORD:
                    r["import_category"] = "READY_TO_IMPORT"
                    r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                    r["is_active"] = True
                    return r
            if not in_italy_bbox(lat, lng):
                r["notes"] = ((r.get("notes") or "") + "; coord_outside_italy_bbox").strip("; ")
                r["lat"] = r["lng"] = None
                r["coord_source"] = None
            elif not postal:
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = ((r.get("notes") or "") + "; missing_cap").strip("; ")
                return r
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    if not postal:
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
    """Fill missing CAP from reverse geocode of an official pin (not a centroid invent)."""
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
    # ID changes when CAP fills
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
        return r
    if r.get("lat") is not None and r.get("lng") is not None and it_postal(postal):
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_italy_bbox(lat, lng) and r.get("coord_source") in ALLOWED_COORD:
                r["import_category"] = "READY_TO_IMPORT"
                return r
        except (TypeError, ValueError):
            pass

    queries = [
        f"{street}, {postal} {city}, Italy",
        f"{street}, {postal}, Italy",
        f"{street}, {city}, Italy",
    ]
    brand = r.get("brand") or ""
    if brand and city:
        queries.insert(0, f"{brand} {r.get('name') or ''}, {street}, {postal} {city}, Italy")

    for q in queries:
        try:
            items = nominatim(q, cache)
        except Exception:
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
                if r.get("coord_source") not in {"OFFICIAL_COORDINATE", "OFFICIAL_MAP_PIN"}:
                    r["lat"] = r["lng"] = None
                return r
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        if "named_gym_poi" in top[1]:
            r["coord_source"] = "NAMED_GYM_POI"
        else:
            r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        r["is_active"] = True
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    if r.get("coord_source") not in {"OFFICIAL_COORDINATE", "OFFICIAL_MAP_PIN"}:
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
    if not r.get("address") or not valid_city(r.get("city") or ""):
        return False
    if r.get("country") != "Italy":
        return False
    if not it_postal(r.get("postal_code") or ""):
        return False
    if r.get("coord_source") not in ALLOWED_COORD:
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
    if not HAS_OPENPYXL:
        return None
    cols = [
        "id", "chain", "center_name", "address", "postal_code", "city", "country",
        "latitude", "longitude", "status", "verification_status", "source_url",
        "opening_hours",
    ]
    extra = ["coord_source", "geocode_status", "website", "region", "legacy_brand", "notes", "phase"]
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
            r.get("id"), r.get("brand") or r.get("chain"),
            r.get("center_name") or r.get("name"), r.get("address"), postal,
            r.get("city"), "Italy", r.get("lat"), r.get("lng"),
            r.get("import_category"), r.get("verification_status"),
            r.get("source_url"), hours, r.get("coord_source"),
            r.get("geocode_status"), r.get("website"), r.get("region"),
            r.get("legacy_brand"), r.get("notes"), r.get("phase"),
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


def completeness_label(disc, ready, est_n=None):
    if disc == 0:
        return "MATERIAL GAP"
    if est_n and disc >= 0.85 * est_n and ready >= 0.8 * disc:
        return "COMPLETE"
    if est_n and disc >= 0.7 * est_n and ready >= 0.6 * disc:
        return "NEAR-COMPLETE"
    if ready >= 0.85 * disc and disc >= 5:
        return "NEAR-COMPLETE"
    if disc > 0 and ready / max(disc, 1) >= 0.5:
        return "NEAR-COMPLETE"
    return "MATERIAL GAP"


def write_reports(rows, live_report, staging_report, collapsed, merge_stats, phase1_baseline, n_live):
    cats = Counter(r.get("import_category") for r in rows)
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not ready_gate(r):
            if r.get("lat") is None:
                r["import_category"] = "NEEDS_COORDINATES"
            else:
                r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = ((r.get("notes") or "") + "; failed_ready_gate").strip("; ")
    cats = Counter(r.get("import_category") for r in rows)
    ready_rows = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_n = len(ready_rows)
    by_brand = Counter(r.get("brand") for r in ready_rows)

    lines = []
    lines.append("# Italy Phase 2 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: PHASE 2 DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Phase 1 baseline (preserved)")
    lines.append("")
    lines.append(f"- staged: {phase1_baseline['staged']}")
    lines.append(f"- READY: {phase1_baseline['ready']}")
    lines.append(f"- NEEDS_COORDINATES: {phase1_baseline['needs_coordinates']}")
    lines.append(f"- NEEDS_REVIEW: {phase1_baseline['needs_review']}")
    lines.append(f"- COMING_SOON: {phase1_baseline['coming_soon']}")
    lines.append("")
    lines.append("## Phase 2 recovery")
    lines.append("")
    lines.append(f"- phase1_in: {merge_stats['phase1_in']}")
    lines.append(f"- phase2_in: {merge_stats['phase2_in']}")
    lines.append(f"- enriched: {merge_stats['enriched']}")
    lines.append(f"- new_added: {merge_stats['new_added']}")
    lines.append(f"- replaced_unresolved: {merge_stats['replaced_unresolved']}")
    lines.append(f"- preserved_phase1_ready: {merge_stats['preserved_phase1_ready']}")
    lines.append(f"- Final staged: {len(rows)}")
    lines.append(f"- READY after Phase 2: {ready_n} (Phase 1 had {phase1_baseline['ready']})")
    lines.append(f"- Net READY gained: {ready_n - phase1_baseline['ready']}")
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
    lines.append(f"| Staging collapses / soft merges | {len(collapsed)} |")
    lines.append("")
    lines.append("## READY by brand")
    lines.append("")
    lines.append("| Brand | READY |")
    lines.append("|---|---:|")
    brand_sum = 0
    for b, n in by_brand.most_common():
        lines.append(f"| {b} | {n} |")
        brand_sum += n
    lines.append(f"| **TOTAL** | **{brand_sum}** |")
    lines.append("")
    lines.append("## Chain Coverage")
    lines.append("")
    lines.append("| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % | Status |")
    lines.append("|---|---|---:|---:|---:|---:|---|")
    completeness = {}
    for label, est in CHAIN_ESTIMATES:
        sub = [r for r in rows if r.get("brand") == label and r.get("import_category") != "DUPLICATE"]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"})
        cov = f"{round(100 * rd / disc)}%" if disc else "—"
        m = re.search(r"~(\d+)", est)
        est_n = int(m.group(1)) if m else None
        if label in {"Fit And Go"}:
            status = "EXCLUDED"
        elif label == "GetFIT":
            status = "MATERIAL GAP" if disc == 0 else completeness_label(disc, rd, 6)
        elif label == "Basic-Fit":
            status = "EXCLUDED"
        else:
            status = completeness_label(disc, rd, est_n)
        completeness[label] = status
        lines.append(f"| {label} | {est} | {disc} | {rd} | {unr} | {cov} | {status} |")
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
    lines.append(f"- Missing cities: {sum(1 for r in rows if not valid_city(r.get('city') or ''))}")
    lines.append(f"- Missing coordinates: {sum(1 for r in rows if r.get('lat') is None)}")
    lines.append(f"- READY coord sources: {dict(Counter(r.get('coord_source') for r in ready_rows))}")
    lines.append("- Italian CAP preserved as 5-digit strings (leading zeros intact).")
    lines.append("- Italian text preserved (à, è, é, ì, ò, ù, apostrophes).")
    lines.append("- No city/CAP/country centroid fallbacks used.")
    lines.append("- San Marino / Vatican / FR / CH / AT / SI / HR / MT geocodes rejected.")
    lines.append("- CAP filled from Nominatim reverse only on OFFICIAL_COORDINATE / OFFICIAL_MAP_PIN pins.")
    lines.append("")

    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_80m') or [])}")
    lines.append(f"- Existing Italy in live catalog: {live_report.get('existing_italy_in_catalog')}")
    lines.append(f"- `it_*` IDs already in live catalog: {len(live_report.get('it_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append("")

    # Phase 3 decision
    material_absent = []
    large_recoverable = []
    if by_brand.get("Anytime Fitness", 0) < 40:
        material_absent.append("Anytime Fitness")
    if by_brand.get("Orange", 0) < 15:
        large_recoverable.append("Orange")
    if by_brand.get("FitUP", 0) < 40:
        large_recoverable.append("FitUP")
    getfit_gap = completeness.get("GetFIT") == "MATERIAL GAP"
    phase3 = bool(material_absent or (large_recoverable and ready_n < phase1_baseline["ready"] + 50))
    # Default NO for handful of difficult leftovers (GetFIT site 403 alone)
    if getfit_gap and not material_absent and by_brand.get("Orange", 0) >= 18 and by_brand.get("Anytime Fitness", 0) >= 50:
        phase3 = False
    recommendation = "ITALY PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR ITALY MERGE"

    lines.append("## Completeness")
    lines.append("")
    for k in ("FitActive", "McFIT", "Virgin Active", "FitUP", "Anytime Fitness", "Orange", "Fit Express", "WebFit", "20Hours", "Fitness Park", "Icon Palestre", "JOHN REED", "Gold's Gym", "GetFIT", "Fit And Go"):
        st = completeness.get(k) or ("EXCLUDED" if k == "Fit And Go" else "—")
        lines.append(f"- **{k}**: {st}")
    lines.append("")
    lines.append("## Remaining gaps")
    lines.append("")
    lines.append("- GetFIT: 6 acquired clubs not on Orange sitemap yet; getfit.it returns 403.")
    lines.append("- Orange estate may still expand toward ~33 (Palermo / GetFIT integration incomplete on site).")
    lines.append("- FitUP target 150 YE2026 — current site estate staged; growth continuum.")
    lines.append("- Icon Palestre: some club pages lack structured CAP/coords → geocode leftovers.")
    lines.append("- Tonic / Audace: no verifiable multi-location conventional gym estate.")
    lines.append("")
    lines.append("## Phase 3?")
    lines.append("")
    lines.append("**YES**" if phase3 else "**NO**")
    lines.append("")
    if phase3:
        lines.append(f"Reasons: absent={material_absent}; recoverable={large_recoverable}")
    else:
        lines.append("Major recoverable chains closed enough; leftovers (GetFIT 403, handful of geocode fails) do not justify another full phase.")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows from Phase 2.")
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
    else:
        lines.append(f"No — projected total {expected:,} remains under 10,000 (headroom {10000 - expected:,}).")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    for f in [
        "scripts/italy-phase2-discover.py",
        "scripts/italy-phase2-consolidate.py",
        "data/italy/italy_centers_staging.json",
        "data/italy/italy_centers_staging_phase1_backup.json",
        "data/italy/italy_geocode_review.json",
        "data/italy/italy_duplicate_analysis.json",
        "data/italy/ITALY_PHASE2_READINESS_REPORT.md",
        "data/italy/ITALY_PHASE2_READINESS_REPORT.json",
        "data/italy/ITALY_PHASE2_READY_TO_IMPORT.json",
        "data/italy/Gymly_Italy_All_Discovered_Centers.xlsx",
        "data/italy/italy_geocode_cache.json",
    ]:
        lines.append(f"- `{f}`")
    lines.append("")
    lines.append(f"## FINAL RECOMMENDATION: {recommendation}")
    lines.append("")
    lines.append("**STOP. Do not merge Italy. Do not run Italy QA. Do not start another country.**")
    lines.append("")
    (OUT / "ITALY_PHASE2_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    report_json = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "production_before": n_live,
        "italy_live_before": live_report.get("existing_italy_in_catalog"),
        "production_modified": False,
        "phase1_baseline": phase1_baseline,
        "merge_stats": merge_stats,
        "discovered": len(rows),
        "categories": dict(cats),
        "ready_to_import": ready_n,
        "ready_by_brand": dict(by_brand),
        "ready_by_brand_sum": brand_sum,
        "projected_catalog": n_live + ready_n,
        "crosses_10k": (n_live + ready_n) > 10000,
        "phase3": phase3,
        "recommendation": recommendation,
        "completeness": completeness,
        "geography_ready": dict(buckets),
        "live_dupes": live_report,
        "staging_dupes": staging_report,
        "collapsed": len(collapsed),
    }
    (OUT / "ITALY_PHASE2_READINESS_REPORT.json").write_text(
        json.dumps(report_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return ready_n, report_json


def main():
    t0 = time.time()
    phase1 = load_phase1()
    phase1_baseline = {
        "staged": len(phase1),
        "ready": sum(1 for r in phase1 if r.get("import_category") == "READY_TO_IMPORT"),
        "needs_coordinates": sum(1 for r in phase1 if r.get("import_category") == "NEEDS_COORDINATES"),
        "needs_review": sum(1 for r in phase1 if r.get("import_category") == "NEEDS_REVIEW"),
        "coming_soon": sum(1 for r in phase1 if r.get("import_category") == "COMING_SOON"),
    }
    print("phase1 baseline", phase1_baseline)
    phase2 = load_phase2()
    print("phase2 scrapes", len(phase2))

    rows, collapsed, merge_stats = merge_rows(phase1, phase2)
    print("merged", len(rows), merge_stats)

    # Recompute IDs after merge field fills
    rows = [normalize_row(r) for r in rows]
    # collapse identical ids keeping richest
    by_id = {}
    for r in rows:
        prev = by_id.get(r["id"])
        if prev is None or richness(r) > richness(prev):
            by_id[r["id"]] = r
    rows = list(by_id.values())

    rows = [classify_pre(r) for r in rows]

    cache = {}
    if CACHE.exists():
        try:
            cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    # Reverse CAP for official pins missing CAP
    need_cap = [
        r for r in rows
        if r.get("import_category") in {"NEEDS_REVIEW", "NEEDS_COORDINATES"}
        and not it_postal(r.get("postal_code") or "")
        and r.get("coord_source") in {"OFFICIAL_COORDINATE", "OFFICIAL_MAP_PIN"}
        and r.get("lat") is not None
    ]
    print("reverse CAP candidates", len(need_cap))
    for i, r in enumerate(need_cap, 1):
        fill_cap_from_reverse(r, cache)
        if i % 20 == 0:
            print(f"  reverse {i}/{len(need_cap)}")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # Reclassify after CAP fills (IDs may have changed)
    rows = [classify_pre(normalize_row(r)) for r in rows]
    by_id = {}
    for r in rows:
        prev = by_id.get(r["id"])
        if prev is None or richness(r) > richness(prev):
            by_id[r["id"]] = r
    rows = list(by_id.values())
    rows = [classify_pre(r) for r in rows]

    need = [r for r in rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print("geocode candidates", len(need))
    for i, r in enumerate(need, 1):
        geocode_row(r, cache)
        if i % 25 == 0:
            print(f"  geocoded {i}/{len(need)}")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

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
    (OUT / "ITALY_PHASE2_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT / "italy_duplicate_analysis.json").write_text(
        json.dumps({"live": live_report, "staging": staging_report, "collapsed": collapsed, "merge_stats": merge_stats}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_geocode_review(rows)
    write_excel(rows)
    ready_n, report_json = write_reports(
        rows, live_report, staging_report, collapsed, merge_stats, phase1_baseline, n_live
    )

    # Re-save staging after gate downgrades in write_reports
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and ready_gate(r)]
    (OUT / "ITALY_PHASE2_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("READY", ready_n, "sum_brands", sum(Counter(r.get("brand") for r in ready).values()))
    print("cats", Counter(r.get("import_category") for r in rows))
    print("recommendation", report_json.get("recommendation"))
    print("elapsed_s", round(time.time() - t0))
    print("centers.json untouched; bytes", CENTERS.stat().st_size)


if __name__ == "__main__":
    main()
