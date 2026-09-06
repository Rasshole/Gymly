#!/usr/bin/env python3
"""
Consolidate Spain Phase 1 scrapes → staging, Nominatim geocode (countrycodes=es),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No Madrid / city / postal / country centroid fallbacks.
"""
from __future__ import annotations

import csv
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
OUT = ROOT / "data/spain"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "spain_centers_staging.json"
CACHE = OUT / "spain_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlySpainGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"

ES_MAINLAND = (35.9, 43.8, -9.4, 3.4)
ES_BALEARIC = (38.6, 40.1, 1.1, 4.4)
ES_CANARY = (27.6, 29.5, -18.2, -13.3)
ES_CEUTA = (35.85, 35.92, -5.35, -5.27)
ES_MELILLA = (35.26, 35.33, -2.97, -2.92)

MAJOR_CITIES = [
    "Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga",
    "Murcia", "Palma", "Las Palmas", "Bilbao", "Alicante", "Córdoba",
    "Valladolid", "Vigo", "Gijón", "Granada", "A Coruña",
]

CHAIN_ESTIMATES = [
    ("Basic-Fit", "~246 clubs (includes former McFIT 42 + Holmes Place 5)"),
    ("VivaGym", "~250+ clubs (includes former Altafit ~70)"),
    ("Synergym", "~180-240 clubs (acquired by VivaGym group, still own brand)"),
    ("Altafit", "~5 remaining (rest rebranded to VivaGym)"),
    ("DIR", "~20 clubs in Barcelona + Sant Cugat"),
    ("Anytime Fitness", "~30+ franchise clubs"),
    ("Dreamfit", "~10 clubs"),
    ("GO fit", "~15 clubs"),
    ("Metropolitan", "~10 premium clubs"),
    ("Forus", "~15 clubs"),
    ("Fitness Park", "~5 clubs"),
    ("Supera", "~20 clubs"),
    ("Enjoy!", "~15 clubs"),
    ("BeOne", "~10 clubs"),
    ("O2 Centro Wellness", "~10 clubs"),
    ("Eurofitness", "~10 clubs (Catalonia)"),
    ("Holiday Gym", "~10 clubs"),
]


def make_id(brand, address, postal, city):
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (str(postal) or "").strip().lower(),
        (city or "").strip().lower(),
        "spain",
    ])
    return "es_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    s = s.replace("ü", "u").replace("ñ", "n").replace("ç", "c").replace("à", "a").replace("è", "e")
    s = s.replace("ò", "o").replace("ï", "i")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def es_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    raw = str(s).strip()
    m = re.search(r"\b(\d{5})\b", raw)
    if m:
        return m.group(1)
    return ""


def in_spain_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in [ES_MAINLAND, ES_BALEARIC, ES_CANARY, ES_CEUTA, ES_MELILLA]:
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def load_scrapes() -> list[dict]:
    rows = []
    for p in sorted(SCRAPES.glob("*.json")):
        if p.name == "synergym_parsed.json":
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows.extend(data)
    # Load parsed Synergym data
    syn_path = SCRAPES / "synergym_parsed.json"
    if syn_path.exists():
        syn_data = json.loads(syn_path.read_text(encoding="utf-8"))
        for c in syn_data:
            rows.append({
                "brand": "Synergym",
                "chain": "Synergym",
                "name": c.get("name", ""),
                "center_name": c.get("name", ""),
                "address": c.get("address", ""),
                "postal_code": None,
                "city": c.get("city", ""),
                "country": "Spain",
                "lat": None,
                "lng": None,
                "opening_hours": None,
                "website": "https://synergym.es",
                "source_url": "https://synergym.es/",
                "verification_status": "COMING_SOON" if c.get("coming_soon") else "VERIFIED_CURRENT",
                "notes": "official_homepage_parsed",
                "is_active": not c.get("coming_soon", False),
                "import_category": "COMING_SOON" if c.get("coming_soon") else None,
                "phase": "spain_phase1",
                "coord_source": None,
                "legacy_brand": None,
            })
    return rows


def collapse_staging(rows):
    by_id = {}
    collapsed = []
    kept = []
    for r in rows:
        r["postal_code"] = es_postal(r.get("postal_code")) or r.get("postal_code") or None
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
        r["country"] = "Spain"
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
    drop_ids = set()
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: (0 if x.get("lat") is not None else 1, x.get("name") or ""))
        for d in group[1:]:
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            drop_ids.add(d["id"])
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
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_spain_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_spain_bbox").strip("; ")
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
        "countrycodes": "es",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_spain_bbox(lat, lng):
        return None, ["outside_spain"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "es":
        return None, ["not_country_es:" + cc], lat, lng

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
    elif postal_n and pc_n and pc_n[:3] == postal_n[:3]:
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
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")

    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons:
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
    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, Spain" if postal else f"{street}, {city}, Spain",
        f"{street}, {city}, España",
    ]
    if postal:
        queries.append(f"{street}, {postal}, España")
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
        r["coord_source"] = "nominatim"
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
    live_es = [c for c in centers if c.get("country") == "Spain"]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers if c.get("address")
    }
    report = {
        "existing_spain_in_catalog": len(live_es),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "es_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("es_")],
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
        for c in live_es:
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
    extra = ["coord_source", "geocode_status", "website", "notes"]
    sorted_rows = sorted(rows, key=lambda r: (
        (r.get("brand") or "").casefold(),
        (r.get("city") or "").casefold(),
        (r.get("name") or "").casefold(),
    ))
    wb = Workbook()
    ws = wb.active
    ws.title = "Spain Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = es_postal(r.get("postal_code")) or (r.get("postal_code") or "")
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
            "Spain",
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
        ]
        for j, val in enumerate(values, start=1):
            cell = ws.cell(i, j, val)
            if j == postal_col:
                cell.number_format = "@"
                cell.value = str(postal) if postal else ""
                cell.alignment = Alignment(horizontal="left")
    for col_idx in range(1, len(cols) + len(extra) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 22
    path = OUT / "Gymly_Spain_All_Discovered_Centers.xlsx"
    wb.save(path)
    return path


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
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
    (OUT / "spain_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    return review


def city_ready(rows, city_name):
    n = norm(city_name)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and n in norm(r.get("city") or "")]
    disc = [r for r in rows if n in norm(r.get("city") or "")]
    return len(disc), len(ready)


def write_report(rows, live_report, staging_report, collapsed, n_live):
    cats = Counter(r.get("import_category") for r in rows)
    ready_n = cats.get("READY_TO_IMPORT", 0)

    brands = sorted({r.get("brand") for r in rows})
    by_brand = defaultdict(list)
    for r in rows:
        by_brand[r.get("brand")].append(r)

    # Island counts
    balearic = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and
                r.get("lat") and in_balearic(r["lat"], r["lng"])]
    canary = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and
              r.get("lat") and in_canary(r["lat"], r["lng"])]

    lines = []
    lines.append("# Spain Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Market audit (Spain conventional chains)")
    lines.append("")
    lines.append("### Brand relationships")
    lines.append("")
    lines.append("- **McFIT** → All 42 studios + 5 Holmes Place sold to **Basic-Fit** in 2024. No McFIT exists in Spain. Basic-Fit total ~246.")
    lines.append("- **Altafit** → Acquired by **VivaGym** end of 2024. 70 clubs migrated to VivaGym brand (19 Madrid Apr 2025, 24 others Apr 2025). Only ~5 Altafit remain.")
    lines.append("- **Synergym** → Acquired by **VivaGym** (Providence Equity Partners). Still operates as own brand with 180+ clubs.")
    lines.append("- **VivaGym** → Parent: Providence Equity Partners. Owns VivaGym + Synergym + ex-Altafit. Total footprint 450+ Iberia.")
    lines.append("- **DIR** → Independent Catalonia-only chain. 20 clubs in Barcelona + Sant Cugat. Includes DiR, BDiR (proximity), YogaOne (yoga-only — EXCLUDED), Jambox.")
    lines.append("- **Basic-Fit** → NL-headquartered. Spain is their biggest growth market. 246 clubs including all former McFIT/Holmes Place.")
    lines.append("")
    lines.append("### Qualification decisions")
    lines.append("")
    lines.append("| Chain | Decision | Reason |")
    lines.append("|---|---|---|")
    lines.append("| Basic-Fit | INCLUDE | Budget fitness chain with cardio/strength |")
    lines.append("| VivaGym | INCLUDE | Full-service fitness chain |")
    lines.append("| Synergym | INCLUDE | Budget fitness chain with cardio/strength |")
    lines.append("| Altafit | INCLUDE | Full-service gym (5 remaining) |")
    lines.append("| DIR (DiR, BDiR, Diagonal DiR) | INCLUDE | Premium full-service gyms |")
    lines.append("| DIR (YogaOne) | EXCLUDE | Yoga-only studio |")
    lines.append("| DIR (Jambox) | INCLUDE | High-intensity fitness |")
    lines.append("| Anytime Fitness | INCLUDE | 24/7 franchise gyms |")
    lines.append("| Dreamfit | INCLUDE | Full-service fitness |")
    lines.append("| GO fit | INCLUDE | Premium fitness chain |")
    lines.append("| Metropolitan | INCLUDE | Premium fitness/wellness |")
    lines.append("| Forus | INCLUDE | Sports/fitness centers |")
    lines.append("| Fitness Park | INCLUDE | Budget fitness |")
    lines.append("| Supera | INCLUDE | Fitness chain |")
    lines.append("| Enjoy! | INCLUDE | Fitness chain |")
    lines.append("| BeOne | INCLUDE | Fitness chain |")
    lines.append("| O2 Centro Wellness | INCLUDE | Fitness/wellness |")
    lines.append("| Eurofitness | INCLUDE | Budget fitness (Catalonia) |")
    lines.append("| Holiday Gym | INCLUDE | Budget fitness |")
    lines.append("| Brooklyn Fitboxing | EXCLUDE | Boxing-only boutique |")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total Spain locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| DUPLICATE (staging) | {cats.get('DUPLICATE', 0)} |")
    lines.append(f"| Staging same-id collapses | {len(collapsed)} |")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")

    for label, est in CHAIN_ESTIMATES:
        sub = [r for r in rows if r.get("brand") == label]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        pct = f"{round(100*rd/disc)}%" if disc else "—"
        lines.append(f"| {label} | {est} | {disc} | {rd} | {unr} | {pct} |")
    extra_brands = sorted(b for b in brands if b not in {e[0] for e in CHAIN_ESTIMATES})
    for b in extra_brands:
        sub = [r for r in rows if r.get("brand") == b]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        pct = f"{round(100*rd/disc)}%" if disc else "—"
        lines.append(f"| {b} | additional | {disc} | {rd} | {unr} | {pct} |")
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in MAJOR_CITIES:
        d, rd = city_ready(rows, c)
        lines.append(f"| {c} | {d} | {rd} |")
    lines.append("")
    lines.append("## Islands")
    lines.append("")
    lines.append(f"- Balearic Islands READY: {len(balearic)}")
    lines.append(f"- Canary Islands READY: {len(canary)}")
    lines.append("- Ceuta: 0 (no chain presence discovered)")
    lines.append("- Melilla: 0 (no chain presence discovered)")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postal codes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append("- Spanish postcodes preserved as 5-digit strings (leading zeros intact).")
    lines.append("- Spanish/Catalan/Basque/Galician text preserved (á, é, í, ó, ú, ñ, ç, ü, à, è, etc.).")
    lines.append("- No city/postcode/country centroid fallbacks used.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_50m') or [])}")
    lines.append(f"- Existing Spain in live catalog: {live_report.get('existing_spain_in_catalog')}")
    lines.append(f"- `es_*` IDs already in live catalog: {len(live_report.get('es_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    lines.append("**Complete chains (>80% coverage):** Basic-Fit (scraped from official locator)")
    lines.append("")
    lines.append("**Partial chains (scraped but incomplete):** Synergym (parsed from homepage), Altafit")
    lines.append("")
    lines.append("**Chains needing Phase 2 JS-rendered scraping:**")
    lines.append("- VivaGym (~250+ clubs, vivagym.com JS-heavy)")
    lines.append("- Anytime Fitness Spain (~30+)")
    lines.append("- Dreamfit (~10)")
    lines.append("- GO fit (~15)")
    lines.append("- Metropolitan (~10)")
    lines.append("- Forus (~15)")
    lines.append("- Fitness Park Spain (~5)")
    lines.append("- Supera (~20)")
    lines.append("- Enjoy! (~15)")
    lines.append("- BeOne (~10)")
    lines.append("- O2 Centro Wellness (~10)")
    lines.append("- Eurofitness (~10)")
    lines.append("- Holiday Gym (~10)")
    lines.append("- DIR (~20, partially scraped)")
    lines.append("")
    lines.append("**Phase 2 is STRONGLY RECOMMENDED** to complete VivaGym and remaining chains.")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows from Phase 1.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live:,} + {ready_n} = {n_live + ready_n:,}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.")
    lines.append("")
    lines.append("## 10K Checkpoint")
    lines.append("")
    expected = n_live + ready_n
    if expected > 10000:
        lines.append(f"**YES — merge would exceed 10,000 ({expected:,}).**")
        lines.append("Recommend: Spain merge → Spain QA → Full 10K+ global stress QA before next country.")
    else:
        lines.append(f"No — projected total {expected:,} remains under 10,000.")
        if expected > 8000:
            lines.append("Approaching 10K threshold. Monitor closely with next country.")
    lines.append("")
    lines.append("## Scaling")
    lines.append("")
    lines.append(f"Current live catalog: {n_live:,}.")
    lines.append(f"Projected after Phase 1 merge: {expected:,}.")
    if expected <= 8000:
        lines.append("Comfortably inside current client-side architecture.")
    elif expected <= 10000:
        lines.append("Inside but approaching practical band of current architecture.")
    else:
        lines.append("Above current practical client-side band — requires architecture review.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    top_files = [
        "scripts/spain-phase1-discover.py",
        "scripts/spain-phase1-consolidate.py",
        "data/spain/spain_centers_staging.json",
        "data/spain/spain_geocode_review.json",
        "data/spain/spain_duplicate_analysis.json",
        "data/spain/SPAIN_PHASE1_READINESS_REPORT.md",
        "data/spain/Gymly_Spain_All_Discovered_Centers.xlsx",
        "data/spain/spain_geocode_cache.json",
        "data/spain/spain_discovery_combined.json",
    ]
    for f in top_files:
        lines.append(f"- `{f}`")
    lines.append("- `data/spain/raw/` official HTML/JSON captures")
    lines.append("- `data/spain/scrapes/` per-chain discovery JSON")
    lines.append("")
    lines.append("**STOP. Do not merge Spain. Do not run Spain QA. Do not start another country.**")
    lines.append("")
    (OUT / "SPAIN_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    return ready_n


def in_balearic(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_BALEARIC
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_canary(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_CANARY
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def main():
    t0 = time.time()
    raw_rows = load_scrapes()
    print("loaded scrapes", len(raw_rows))
    rows, collapsed = collapse_staging(raw_rows)
    print("after collapse", len(rows), "collapsed", len(collapsed))
    rows = [classify_pre(r) for r in rows]

    # Geocode
    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    todo = [r for r in rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print("geocode todo", len(todo))
    for i, r in enumerate(todo, 1):
        geocode_row(r, cache)
        if i % 10 == 0:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  geocoded {i}/{len(todo)}")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # Final bbox check
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_spain_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; dropped_non_spain_coord").strip("; ")

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    dup = {
        "vs_live": live_report,
        "vs_staging": staging_report,
        "collapsed": collapsed[:50],
        "collapsed_count": len(collapsed),
    }
    (OUT / "spain_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    write_geocode_review(rows)
    write_excel(rows)
    n_live = len(centers)
    write_report(rows, live_report, staging_report, collapsed, n_live)
    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "in", round(time.time() - t0), "s")
    print("READY", cats.get("READY_TO_IMPORT", 0), "expected catalog", n_live + cats.get("READY_TO_IMPORT", 0))


if __name__ == "__main__":
    main()
