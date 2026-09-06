#!/usr/bin/env python3
"""
Consolidate Belgium Phase 1 scrapes → staging, Nominatim geocode (countrycodes=be),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No Brussels / city / postal / country centroid fallbacks.
Rejects NL/FR/DE/LU neighbor geocodes. Belgian postcodes: four-digit strings.
IDs: be_ + md5(brand|address|postal|city|belgium)[:10]
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
OUT = ROOT / "data/belgium"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "belgium_centers_staging.json"
CACHE = OUT / "belgium_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyBelgiumGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"

BE_BOUNDS = (49.45, 51.55, 2.52, 6.42)

# Neighbor bboxes used to reject cross-border geocodes that slip through
NL_BOUNDS = (50.75, 53.55, 3.35, 7.23)
FR_NORD = (48.8, 51.2, 1.4, 4.3)  # northern FR near BE
DE_WEST = (49.0, 52.5, 5.8, 8.5)
LU_BOUNDS = (49.4, 50.2, 5.7, 6.55)

MAJOR_CITIES = [
    "Brussels", "Bruxelles", "Brussel", "Antwerpen", "Antwerp", "Anvers",
    "Gent", "Ghent", "Gand", "Liège", "Liege", "Luik", "Brugge", "Bruges",
    "Namur", "Namen", "Leuven", "Louvain", "Charleroi", "Mons", "Bergen",
    "Hasselt", "Mechelen", "Malines", "Kortrijk", "Courtrai", "Oostende",
    "Genk", "Aalst", "Sint-Niklaas", "Tournai", "Doornik", "Wavre",
]

CHAIN_ESTIMATES = [
    ("Basic-Fit", "~243 BE clubs (official club-finder)"),
    ("JIMS", "~84 BE clubs (jims.be; LU excluded)"),
    ("Anytime Fitness", "~10 BE clubs (.be host)"),
    ("LAGO Club", "~8 boutique fitness clubs"),
    ("Sportoase", "~13 fitness-advertised (of ~20 centres)"),
    ("i-fitness", "~8 clubs"),
    ("Aspria", "3 Brussels premium clubs"),
    ("David Lloyd", "2 Brussels-area clubs"),
    ("Fit-Out", "2 clubs (Destelbergen, Lochristi)"),
    ("Snap Fitness", "≥1 BE (Ingelmunster)"),
]

CITY_ALIASES = {
    "brussel": "brussels", "bruxelles": "brussels", "brussels": "brussels",
    "antwerpen": "antwerp", "anvers": "antwerp", "antwerp": "antwerp",
    "gent": "ghent", "gand": "ghent", "ghent": "ghent",
    "liege": "liege", "luik": "liege", "liège": "liege",
    "brugge": "bruges", "bruges": "bruges",
    "namen": "namur", "namur": "namur",
    "louvain": "leuven", "leuven": "leuven",
    "bergen": "mons", "mons": "mons",
    "malines": "mechelen", "mechelen": "mechelen",
    "courtrai": "kortrijk", "kortrijk": "kortrijk",
    "oostende": "ostend", "ostende": "ostend", "ostend": "ostend",
    "doornik": "tournai", "tournai": "tournai",
}

COARSE = {
    "country", "state", "region", "county", "postcode", "municipality",
    "city", "town", "village", "suburb", "neighbourhood", "quarter",
    "district", "borough", "province", "island", "administrative",
}

FORBIDDEN_CC = {"nl", "fr", "de", "lu"}


def make_id(brand, address, postal, city):
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (str(postal) or "").strip().lower(),
        (city or "").strip().lower(),
        "belgium",
    ])
    return "be_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


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


def city_key(s):
    n = norm(s)
    return CITY_ALIASES.get(n, n)


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def be_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    m = re.search(r"\b(\d{4})\b", str(s).strip())
    return m.group(1) if m else ""


def in_be_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    lo, hi, w, e = BE_BOUNDS
    return lo <= lat <= hi and w <= lng <= e


def in_neighbor_interior(lat, lng) -> bool:
    """True if clearly inside NL/FR/DE/LU interiors (reject)."""
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    # Luxembourg interior
    lo, hi, w, e = LU_BOUNDS
    if lo <= lat <= hi and w <= lng <= e and lng > 5.85:
        # still allow Belgian Ardennes edge — LU is tighter on east
        if lat < 50.2 and lng > 5.9:
            # Belgian east overlaps — use cc from nominatim instead
            pass
    return False


def infer_region(postal: str, city: str) -> str | None:
    pc = be_postal(postal)
    if not pc:
        return None
    try:
        n = int(pc)
    except ValueError:
        return None
    if 1000 <= n <= 1299:
        return "Brussels-Capital"
    # Flanders-ish: 1500-3999, 8000-9999 roughly; Wallonia: 1300-1499, 4000-7999
    if 4000 <= n <= 7999 or 1300 <= n <= 1499:
        return "Wallonia"
    if 1500 <= n <= 3999 or 8000 <= n <= 9999:
        return "Flanders"
    return None


def load_scrapes() -> list[dict]:
    rows = []
    skip = {"all_discovered_belgium.json"}
    for p in sorted(SCRAPES.glob("*.json")):
        if p.name in skip:
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows.extend(data)
    return rows


def collapse_staging(rows):
    by_id = {}
    collapsed = []
    kept = []
    for r in rows:
        r["postal_code"] = be_postal(r.get("postal_code")) or be_postal(r.get("address")) or None
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
        r["country"] = "Belgium"
        if not r.get("region"):
            r["region"] = infer_region(r.get("postal_code") or "", r.get("city") or "")
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

    # Multilingual city alias collapse: same brand+address+postal, different city spelling
    by_addr = defaultdict(list)
    for r in kept:
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if k[1]:
            by_addr[k].append(r)
    drop_ids = set()
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        # Prefer FR/NL official form with coords
        group = sorted(group, key=lambda x: (
            0 if x.get("lat") is not None else 1,
            x.get("name") or "",
        ))
        for d in group[1:]:
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            drop_ids.add(d["id"])
            collapsed.append({
                "kept": group[0].get("name"), "dropped": d.get("name"),
                "reason": "same_brand_address_multilingual",
            })

    # Cross-alias city near-duplicates (Brussel/Bruxelles/Brussels)
    by_soft = defaultdict(list)
    for r in kept:
        if r.get("import_category") == "DUPLICATE":
            continue
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""), city_key(r.get("city")))
        if k[1]:
            by_soft[k].append(r)
    for k, group in by_soft.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: (0 if x.get("lat") is not None else 1, x.get("name") or ""))
        for d in group[1:]:
            if d.get("import_category") == "DUPLICATE":
                continue
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            collapsed.append({
                "kept": group[0].get("name"), "dropped": d.get("name"),
                "reason": "city_alias_dedupe",
            })

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
    if r.get("import_category") == "NEEDS_REVIEW":
        return r
    if not r.get("address") or not r.get("city") or not be_postal(r.get("postal_code") or ""):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_be_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                if r.get("coord_source") in (None, ""):
                    r["coord_source"] = "OFFICIAL_COORDINATE"
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_belgium_bbox").strip("; ")
            r["lat"] = r["lng"] = None
            r["coord_source"] = None
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
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
        "countrycodes": "be",
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
    if not in_be_bbox(lat, lng):
        return None, ["outside_belgium"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "be":
        return None, ["not_country_be:" + cc], lat, lng
    if cc in FORBIDDEN_CC:
        return None, ["neighbor_country:" + cc], lat, lng

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
    pc_n = be_postal(pc)
    postal_n = be_postal(postal)
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:2] == postal_n[:2]:
        score += 1
        reasons.append("postal_soft")

    city_n = city_key(city)
    city_fields = " ".join(
        city_key(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb", "city_district")
    )
    if city_n and (city_n in city_fields or city_n in city_key(display)):
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
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")

    # Named gym POI boost
    if any(x in display for x in ("basic-fit", "basic fit", "jims", "anytime", "fitness", "gym")):
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
    postal = be_postal(r.get("postal_code") or "")
    city = r.get("city") or ""
    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, Belgium" if postal else f"{street}, {city}, Belgium",
        f"{street}, {city}, België",
        f"{street}, {city}, Belgique",
    ]
    if postal:
        queries.append(f"{street}, {postal}, Belgium")
    # Try with brand for named POI
    brand = r.get("brand") or ""
    if brand:
        queries.insert(0, f"{brand}, {street}, {postal} {city}, Belgium" if postal else f"{brand}, {street}, {city}, Belgium")

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
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
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
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
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
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["lat"] = r["lng"] = None
    return r


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    all_ids = {c["id"] for c in centers}
    live_be = [c for c in centers if str(c.get("country", "")).lower() in
               {"belgium", "belgië", "belgie", "belgique", "belgien", "be"}]
    live_bf = [c for c in centers if norm(c.get("brand") or "") in {"basic fit", "basic-fit"}]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers if c.get("address")
    }
    report = {
        "existing_belgium_in_catalog": len(live_be),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "be_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("be_")],
        "cross_border_basicfit_proximity_notes": [],
    }

    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append({
                "staging": r.get("name"), "live": live_addr[key].get("name"),
                "id": r["id"],
            })
        if r.get("lat") is None:
            continue
        # Proximity vs live Basic-Fit in NL/FR/DE/ES — ensure BE clubs don't collapse
        if norm(r.get("brand")) in {"basic fit", "basic-fit"}:
            for c in live_bf:
                if c.get("lat") is None or c.get("lng") is None:
                    continue
                try:
                    d = haversine(float(r["lat"]), float(r["lng"]), float(c["lat"]), float(c["lng"]))
                except (TypeError, ValueError):
                    continue
                if d <= 200:
                    report["cross_border_basicfit_proximity_notes"].append({
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "live_country": c.get("country"),
                        "distance_m": round(d),
                    })
        for c in live_be:
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
                    "distance_m": round(d),
                })
    return report, centers


def staging_dupes(rows):
    report = {
        "duplicate_ids": [],
        "same_brand_address": [],
        "proximity_same_brand_50m": [],
        "multilingual_city_pairs": [],
    }
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

    ready = [r for r in rows if r.get("lat") is not None and r.get("lng") is not None]
    for i, a in enumerate(ready):
        for b in ready[i + 1:]:
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d > 80:
                continue
            if norm(a.get("brand")) == norm(b.get("brand")):
                report["proximity_same_brand_50m"].append({
                    "a": a.get("name"), "b": b.get("name"),
                    "distance_m": round(d), "city": a.get("city"),
                })
            # multilingual city same physical?
            if city_key(a.get("city")) == city_key(b.get("city")) and norm(a.get("address")) == norm(b.get("address")):
                report["multilingual_city_pairs"].append({
                    "a": a.get("name"), "b": b.get("name"),
                    "cities": [a.get("city"), b.get("city")],
                })
    return report


def write_excel(rows):
    if not HAS_OPENPYXL:
        print("openpyxl not available, skipping Excel export")
        return None
    cols = [
        "id", "chain", "center_name", "address", "postal_code", "city", "country",
        "latitude", "longitude", "status", "verification_status", "source_url",
        "opening_hours",
    ]
    extra = ["coord_source", "geocode_status", "website", "notes", "region", "legacy_brand"]
    sorted_rows = sorted(rows, key=lambda r: (
        (r.get("brand") or "").casefold(),
        (r.get("city") or "").casefold(),
        (r.get("name") or "").casefold(),
    ))
    wb = Workbook()
    ws = wb.active
    ws.title = "Belgium Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = be_postal(r.get("postal_code")) or (r.get("postal_code") or "")
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
            "Belgium",
            r.get("lat"),
            r.get("lng"),
            r.get("import_category"),
            r.get("verification_status"),
            r.get("source_url"),
            hours,
            r.get("coord_source"),
            r.get("geocode_status"),
            r.get("website"),
            r.get("notes"),
            r.get("region"),
            r.get("legacy_brand"),
        ]
        for j, val in enumerate(values, start=1):
            cell = ws.cell(i, j, val)
            if j == postal_col:
                cell.number_format = "@"
                cell.value = str(postal) if postal else ""
                cell.alignment = Alignment(horizontal="left")
    for col_idx in range(1, len(cols) + len(extra) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 22
    path = OUT / "Gymly_Belgium_All_Discovered_Centers.xlsx"
    wb.save(path)
    return path


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") in {"STRICT_ADDRESS_GEOCODE", "NAMED_GYM_POI", "nominatim"} or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "latitude": r.get("lat"),
                "longitude": r.get("lng"),
                "geocode_status": r.get("geocode_status"),
                "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"),
                "notes": r.get("notes"),
            })
    (OUT / "belgium_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return review


def city_ready(rows, city_name):
    n = city_key(city_name)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and city_key(r.get("city") or "") == n]
    disc = [r for r in rows if city_key(r.get("city") or "") == n]
    return len(disc), len(ready)


def ready_gate(r) -> bool:
    if r.get("import_category") != "READY_TO_IMPORT":
        return False
    if not str(r.get("id", "")).startswith("be_"):
        return False
    if not r.get("is_active", True):
        return False
    if not r.get("name") or not r.get("brand"):
        return False
    if not r.get("address") or not r.get("city"):
        return False
    if not re.fullmatch(r"\d{4}", str(r.get("postal_code") or "")):
        return False
    if r.get("country") != "Belgium":
        return False
    try:
        lat, lng = float(r["lat"]), float(r["lng"])
    except (TypeError, ValueError, KeyError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng) and in_be_bbox(lat, lng)):
        return False
    return True


def write_report(rows, live_report, staging_report, collapsed, n_live, audit):
    cats = Counter(r.get("import_category") for r in rows)
    ready_rows = [r for r in rows if ready_gate(r)]
    ready_n = len(ready_rows)
    brands = sorted({r.get("brand") for r in rows if r.get("brand")})

    by_region = Counter(r.get("region") or "unknown" for r in rows if r.get("import_category") != "DUPLICATE")

    lines = []
    lines.append("# Belgium Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Market audit")
    lines.append("")
    lines.append("| Chain | Estimate | Decision | Source / notes |")
    lines.append("|---|---|---|---|")
    for c in (audit.get("chains") or []):
        lines.append(
            f"| {c.get('brand')} | {c.get('estimate')} | **{c.get('decision')}** | "
            f"{c.get('source')} — {c.get('notes')} |"
        )
    lines.append("")
    lines.append(f"Regional coverage note: {audit.get('regional_notes')}")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total Belgium locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT (ready gate) | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| DUPLICATE (staging) | {cats.get('DUPLICATE', 0)} |")
    lines.append(f"| Staging same-id collapses | {len(collapsed)} |")
    lines.append(f"| Live catalog total | {n_live} |")
    lines.append(f"| Existing Belgium in live catalog | {live_report.get('existing_belgium_in_catalog')} |")
    lines.append(f"| Headroom to 10k | {10000 - n_live} |")
    lines.append("")
    lines.append("## Region mix (non-duplicate)")
    lines.append("")
    for reg, n in sorted(by_region.items()):
        lines.append(f"- {reg}: {n}")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for label, est in CHAIN_ESTIMATES:
        sub = [r for r in rows if r.get("brand") == label]
        disc = len(sub)
        rd = sum(1 for r in sub if ready_gate(r))
        unr = disc - rd
        pct = f"{round(100 * rd / disc)}%" if disc else "—"
        lines.append(f"| {label} | {est} | {disc} | {rd} | {unr} | {pct} |")
    extra = sorted(b for b in brands if b not in {e[0] for e in CHAIN_ESTIMATES})
    for b in extra:
        sub = [r for r in rows if r.get("brand") == b]
        disc = len(sub)
        rd = sum(1 for r in sub if ready_gate(r))
        unr = disc - rd
        pct = f"{round(100 * rd / disc)}%" if disc else "—"
        lines.append(f"| {b} | additional | {disc} | {rd} | {unr} | {pct} |")
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    seen_keys = set()
    for c in MAJOR_CITIES:
        ck = city_key(c)
        if ck in seen_keys:
            continue
        seen_keys.add(ck)
        d, rd = city_ready(rows, c)
        if d:
            lines.append(f"| {c} | {d} | {rd} |")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not be_postal(r.get("postal_code") or ""))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    bad_pc = [r for r in rows if r.get("postal_code") and not re.fullmatch(r"\d{4}", str(r["postal_code"]))]
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing/invalid 4-digit postal codes: {missing_pc}")
    lines.append(f"- Non-4-digit postal values: {len(bad_pc)}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append("- Belgian postcodes stored as **4-digit strings** (`^\\d{4}$`).")
    lines.append("- Dutch/French/German city names preserved; Brussel/Bruxelles/Brussels deduped as one physical gym.")
    lines.append("- No Brussels / Belgium / postal / city centroid fallbacks used.")
    lines.append("- Cross-border: NL/FR/DE/LU rejected via countrycodes=be + bbox + country_code checks.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_50m') or [])}")
    lines.append(f"- Multilingual city pairs: {len(staging_report.get('multilingual_city_pairs') or [])}")
    lines.append(f"- Existing Belgium in live catalog: {live_report.get('existing_belgium_in_catalog')}")
    lines.append(f"- `be_*` IDs already in live catalog: {len(live_report.get('be_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Basic-Fit ≤200 m vs live foreign Basic-Fit: {len(live_report.get('cross_border_basicfit_proximity_notes') or [])}")
    lines.append("- NRG Fitness BE → JIMS (legacy): brand EXCLUDE; clubs captured under JIMS where listed.")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    lines.append("**Strong Phase 1 coverage:** Basic-Fit (official en-be locator + club pages), JIMS (embedded markers).")
    lines.append("")
    lines.append("**Partial / Phase 2 follow-ups:**")
    lines.append("- Sportoase: confirm gym-floor vs pool-adjacent per centre; fill missing addresses")
    lines.append("- Anytime Fitness: expand if more BE franchises open; keep rejecting NL host bleed")
    lines.append("- Snap Fitness: only Ingelmunster confirmed; watch new BE openings")
    lines.append("- Regional independents (Release, Stadium, World Class): LATER")
    lines.append("- LAGO swim parks (non-Club): EXCLUDE pool-only")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows passing ready gate.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live:,} + {ready_n} = {n_live + ready_n:,}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.")
    lines.append("")
    lines.append("## 10K Checkpoint")
    lines.append("")
    expected = n_live + ready_n
    headroom = 10000 - n_live
    if expected > 10000:
        lines.append(f"**YES — merge would exceed 10,000 ({expected:,}).** Headroom was {headroom}.")
        lines.append("After merge: Belgium QA → GLOBAL 10K+ STRESS QA before Poland.")
    else:
        lines.append(f"No — projected total {expected:,} remains ≤ 10,000 (headroom used: {ready_n} of {headroom}).")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    for f in [
        "scripts/belgium-phase1-discover.py",
        "scripts/belgium-phase1-consolidate.py",
        "data/belgium/belgium_centers_staging.json",
        "data/belgium/belgium_geocode_review.json",
        "data/belgium/belgium_duplicate_analysis.json",
        "data/belgium/BELGIUM_PHASE1_READINESS_REPORT.md",
        "data/belgium/BELGIUM_PHASE1_READINESS_REPORT.json",
        "data/belgium/BELGIUM_PHASE1_READY_TO_IMPORT.json",
        "data/belgium/Gymly_Belgium_All_Discovered_Centers.xlsx",
        "data/belgium/belgium_geocode_cache.json",
        "data/belgium/belgium_market_audit.json",
    ]:
        lines.append(f"- `{f}`")
    lines.append("- `data/belgium/raw/` official HTML/JSON captures")
    lines.append("- `data/belgium/scrapes/` per-chain discovery JSON")
    lines.append("")
    if ready_n >= 200 and cats.get("NEEDS_COORDINATES", 0) + cats.get("NEEDS_REVIEW", 0) < ready_n * 0.35:
        verdict = "READY FOR BELGIUM MERGE"
        lines.append("## Verdict")
        lines.append("")
        lines.append("Phase 1 staging is merge-ready for READY_TO_IMPORT rows only.")
        lines.append("Still recommended: spot-check Sportoase + border Basic-Fit before merge.")
    else:
        verdict = "BELGIUM PHASE 2 REQUIRED BEFORE MERGE"
        lines.append("## Verdict")
        lines.append("")
        lines.append("Additional Phase 2 work recommended before merge (coords/review gaps or incomplete chains).")
    lines.append("")
    lines.append("**STOP. Do not merge Belgium. Do not run Belgium QA. Do not start Poland.**")
    lines.append("")
    (OUT / "BELGIUM_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "live_catalog_total": n_live,
        "discovered": len(rows),
        "ready_to_import": ready_n,
        "needs_coordinates": cats.get("NEEDS_COORDINATES", 0),
        "needs_review": cats.get("NEEDS_REVIEW", 0),
        "coming_soon": cats.get("COMING_SOON", 0),
        "closed": cats.get("CLOSED", 0),
        "duplicate": cats.get("DUPLICATE", 0),
        "projected_after_merge": expected,
        "exceeds_10k": expected > 10000,
        "verdict": verdict,
        "centers_json_modified": False,
    }
    (OUT / "BELGIUM_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT / "BELGIUM_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(ready_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return ready_n, verdict


def main():
    print("=== Belgium Phase 1 consolidate ===", flush=True)
    audit_path = OUT / "belgium_market_audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8")) if audit_path.exists() else {"chains": []}

    raw_rows = load_scrapes()
    print(f"Loaded scrape rows: {len(raw_rows)}", flush=True)
    rows, collapsed = collapse_staging(raw_rows)
    print(f"After collapse: {len(rows)} (collapses={len(collapsed)})", flush=True)

    for r in rows:
        classify_pre(r)

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    need = [r for r in rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print(f"Geocoding {len(need)} rows via Nominatim countrycodes=be...", flush=True)
    for i, r in enumerate(need, 1):
        geocode_row(r, cache)
        if i % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  geocoded {i}/{len(need)}", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    # Re-apply ready gate after geocode
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not ready_gate(r):
            # demote if gate fails
            if r.get("lat") is None:
                r["import_category"] = "NEEDS_COORDINATES"
            else:
                r["import_category"] = "NEEDS_REVIEW"

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {STAGING}", flush=True)

    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    dup_path = OUT / "belgium_duplicate_analysis.json"
    dup_path.write_text(
        json.dumps({"vs_live": live_report, "staging": staging_report, "collapsed": collapsed},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_geocode_review(rows)
    xlsx = write_excel(rows)
    if xlsx:
        print(f"Wrote {xlsx}", flush=True)

    n_live = len(centers)
    ready_n, verdict = write_report(rows, live_report, staging_report, collapsed, n_live, audit)
    print(f"READY_TO_IMPORT: {ready_n}", flush=True)
    print(f"VERDICT: {verdict}", flush=True)
    print("centers.json NOT modified.", flush=True)


if __name__ == "__main__":
    main()
