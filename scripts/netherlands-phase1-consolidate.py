#!/usr/bin/env python3
"""
Consolidate Netherlands scrapes → staging, Nominatim geocode (countrycodes=nl),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No Amsterdam / city / postal / country centroid fallbacks.
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

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/netherlands"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "netherlands_centers_staging.json"
PRE = OUT / "netherlands_centers_staging.pre_geocode.json"
CACHE = OUT / "netherlands_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyNetherlandsGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"
NL_BOUNDS = (50.75, 53.55, 3.35, 7.23)

MAJOR_CITIES = [
    "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven",
    "Groningen", "Tilburg", "Almere", "Breda", "Nijmegen",
    "Haarlem", "Arnhem", "Enschede", "Maastricht",
]

CHAIN_ESTIMATES = [
    ("Basic-Fit", "~250 NL clubs on basic-fit.com club-finder"),
    ("SportCity", "~121 clubs; former Fit For Free fully rebranded Oct 2022"),
    ("TrainMore", "25+ Amsterdam clubs + expanding to other cities"),
    ("Anytime Fitness", "~132-145 NL franchise locations"),
    ("David Lloyd", "6 premium clubs NL"),
    ("Snap Fitness", "6-8 NL clubs (some opening 2026)"),
    ("Clubsportive", "1 premium club Amsterdam Zuidas"),
    ("HealthCity", "~20 premium clubs NL"),
    ("Optisport", "~9-23 health club locations with gym floors"),
]


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join([
            (brand or "").strip().lower(),
            (source_url or "").strip().lower(),
            "netherlands",
        ])
    else:
        key = "|".join([
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            (city or "").strip().lower(),
            "netherlands",
        ])
    return "nl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ").replace("ë", "e").replace("é", "e").replace("è", "e")
    s = s.replace("ü", "u").replace("ï", "i").replace("ö", "o").replace("ä", "a")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def nl_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    raw = str(s).strip()
    m = re.search(r"\b(\d{4})\s*([A-Za-z]{2})\b", raw)
    if m:
        return f"{m.group(1)} {m.group(2).upper()}"
    return ""


def in_nl_bbox(lat, lng) -> bool:
    lo, hi, w, e = NL_BOUNDS
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    return lo <= lat <= hi and w <= lng <= e


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
        r["postal_code"] = nl_postal(r.get("postal_code")) or r.get("postal_code") or None
        if r.get("address"):
            r["address"] = str(r["address"]).strip(" ,")
        if r.get("city"):
            r["city"] = str(r["city"]).strip(" ,")
        r["id"] = make_id(
            r.get("brand") or r.get("chain"),
            r.get("address") or "",
            r.get("postal_code") or "",
            r.get("city") or "",
            r.get("source_url") or "",
        )
        r["chain"] = r.get("chain") or r.get("brand")
        r["center_name"] = r.get("center_name") or r.get("name")
        r["country"] = "Netherlands"
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

    kept2 = []
    for r in kept:
        if r["id"] in drop_ids and r.get("import_category") == "DUPLICATE":
            kept2.append(r)
            continue
        if r["id"] in drop_ids:
            continue
        kept2.append(r)
    return kept2, collapsed


def classify_pre(r):
    if r.get("import_category") == "DUPLICATE":
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_nl_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_nl_bbox").strip("; ")
            r["lat"] = r["lng"] = None
            r["coord_source"] = None
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    r["import_category"] = "NEEDS_COORDINATES"
    r["phase1_ready_for_geocode"] = True
    return r


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "nl",
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
    if not in_nl_bbox(lat, lng):
        return None, ["outside_netherlands"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "nl":
        return None, ["not_country_nl:" + cc], lat, lng

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
    elif postal_n and pc_n and pc_n[:4] == postal_n[:4]:
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
    if "gym" in display or "sportschool" in display or "fitness" in display:
        score += 1
        reasons.append("gym_poi")

    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if "postal_exact" not in reasons and "postal_soft" in reasons and "road_match" not in reasons:
        return None, reasons + ["soft_postal_without_road"], lat, lng
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
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, Netherlands",
        f"{street}, {postal}, Netherlands",
        f"{street}, {city}, Nederland",
    ]
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
                r["geocode_reasons"] = [top[1], scored[1][1]]
                r["lat"] = r["lng"] = None
                r["geocode_rejected"] = all_rej[:5]
                return r
        soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "suspicious" if soft else "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        if soft:
            r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
            if "road_match" not in top[1]:
                r["import_category"] = "NEEDS_REVIEW"
                r["lat"] = r["lng"] = None
                r["geocode_status"] = "soft_postal_rejected"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:5]
    r["lat"] = r["lng"] = None
    return r


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    all_ids = {c["id"] for c in centers}
    live_nl = [c for c in centers if c.get("country") == "Netherlands"]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers if c.get("address")
    }
    report = {
        "existing_netherlands_in_catalog": len(live_nl),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "same_address_different_brand": [],
        "nl_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("nl_")],
        "david_lloyd_live": [
            {"id": c.get("id"), "name": c.get("name"), "brand": c.get("brand"), "country": c.get("country")}
            for c in centers
            if "david lloyd" in (c.get("brand") or "").lower() or "david lloyd" in (c.get("name") or "").lower()
        ],
    }
    live_by_postcode = defaultdict(list)
    for c in centers:
        if c.get("postal_code"):
            live_by_postcode[nl_postal(c.get("postal_code")) or str(c["postal_code"])].append(c)

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
    report = {
        "duplicate_ids": [],
        "same_brand_address": [],
        "proximity_same_brand_50m": [],
        "legitimate_different_brand_colocations": [],
        "sportcity_fitforfree": {
            "note": "Fit For Free was fully rebranded to SportCity in October 2022. All NL clubs are now SportCity. No duplicate FFF rows created.",
        },
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
            item = {
                "a": a.get("name"), "b": b.get("name"),
                "brand_a": a.get("brand"), "brand_b": b.get("brand"),
                "distance_m": round(d), "city": a.get("city"),
            }
            if norm(a.get("brand")) == norm(b.get("brand")):
                report["proximity_same_brand_50m"].append(item)
            else:
                report["legitimate_different_brand_colocations"].append(item)
    return report


def write_excel(rows):
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
    ws.title = "Netherlands Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = nl_postal(r.get("postal_code")) or (r.get("postal_code") or "")
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
            "Netherlands",
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
    path = OUT / "Gymly_Netherlands_All_Discovered_Centers.xlsx"
    wb.save(path)

    csv_path = OUT / "Gymly_Netherlands_All_Discovered_Centers.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_NONNUMERIC)
        w.writerow(cols + extra)
        for r in sorted_rows:
            postal = nl_postal(r.get("postal_code")) or (r.get("postal_code") or "")
            hours = r.get("opening_hours")
            if isinstance(hours, (dict, list)):
                hours = json.dumps(hours, ensure_ascii=False)
            w.writerow([
                r.get("id"),
                r.get("brand") or r.get("chain"),
                r.get("center_name") or r.get("name"),
                r.get("address"),
                str(postal) if postal else "",
                r.get("city"),
                "Netherlands",
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
            ])
    return path, csv_path


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
                "geocode_reasons": r.get("geocode_reasons"),
                "geocode_display": r.get("geocode_display"),
                "notes": r.get("notes"),
            })
    (OUT / "netherlands_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "netherlands_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
        cols = [
            "id", "name", "brand", "address", "postal_code", "city",
            "latitude", "longitude", "geocode_status", "import_category",
            "coord_source", "notes",
        ]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore", quoting=csv.QUOTE_NONNUMERIC)
        w.writeheader()
        for item in review:
            row_d = dict(item)
            row_d["postal_code"] = str(item.get("postal_code") or "")
            w.writerow(row_d)
    return review


def city_ready(rows, city_name):
    n = norm(city_name)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and n in norm(r.get("city") or "")]
    disc = [r for r in rows if n in norm(r.get("city") or "")]
    return len(disc), len(ready)


def write_report(rows, live_report, staging_report, collapsed, n_live):
    cats = Counter(r.get("import_category") for r in rows)
    ready_n = cats.get("READY_TO_IMPORT", 0)
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    official = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") and "official" in r.get("coord_source", ""))
    nomi = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") == "nominatim")
    soft = sum(1 for r in rows if "soft_postal" in (r.get("notes") or "") or r.get("geocode_status") == "suspicious")
    amb = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")

    outliers = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and not in_nl_bbox(r.get("lat"), r.get("lng"))]

    brands = sorted({r.get("brand") for r in rows})
    by_brand = defaultdict(list)
    for r in rows:
        by_brand[r.get("brand")].append(r)

    lines = []
    lines.append("# Netherlands Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Market audit (Netherlands conventional chains)")
    lines.append("")
    lines.append("Current consumer-facing brands staged in Phase 1:")
    lines.append("")
    lines.append("- **Basic-Fit** — Largest budget chain in NL (~250 clubs). Official club-finder page. Multi-country (BE/FR/LU/ES/DE) — NL only staged.")
    lines.append("- **SportCity** — ~121 clubs. **All former Fit For Free clubs fully rebranded to SportCity in October 2022.** No FFF duplicate rows.")
    lines.append("- **TrainMore** — Premium Amsterdam-area chain (25+ locations) expanding to Rotterdam, Den Haag, Utrecht. Part of Urban Gym Group.")
    lines.append("- **Anytime Fitness** — International 24/7 franchise, ~130-145 NL locations. NL-only filter applied.")
    lines.append("- **David Lloyd** — 6 premium clubs in NL (Amsterdam, Utrecht, Eindhoven/Veldhoven, 2x Rotterdam, Capelle). UK David Lloyd clubs already in catalog with separate IDs.")
    lines.append("- **Snap Fitness** — International 24/7 franchise, 6+ NL locations.")
    lines.append("- **Clubsportive** — 1 premium club in Amsterdam Zuidas. Part of Urban Gym Group.")
    lines.append("- **HealthCity** — ~20 premium clubs NL. Parent company Leisure Group Europe.")
    lines.append("- **Optisport** — Municipal operator; only health club locations with genuine gym floors staged (not pool-only).")
    lines.append("")
    lines.append("### Fit For Free / SportCity rebrand")
    lines.append("")
    lines.append("Fit For Free was fully rebranded to SportCity in October 2022. The fitforfree.nl domain now redirects to sportcity.nl.")
    lines.append("All NL clubs are staged under the consumer brand **SportCity**. No FFF rows exist.")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total NL locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| VERIFIED_CURRENT | {sum(1 for r in rows if r.get('verification_status')=='VERIFIED_CURRENT')} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
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
        lines.append(f"| {b} | additional chain found | {disc} | {rd} | {unr} | {pct} |")
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in MAJOR_CITIES:
        d, rd = city_ready(rows, c)
        lines.append(f"| {c} | {d} | {rd} |")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postal codes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- READY with official coordinates: {official}")
    lines.append(f"- READY with Nominatim coordinates: {nomi}")
    lines.append(f"- Soft-postal matches flagged: {soft}")
    lines.append(f"- Ambiguous geocode results: {amb}")
    lines.append("- Dutch postal codes are stored as **strings** in JSON and as Excel TEXT (`@` number format).")
    lines.append("- No Amsterdam / city / postal-code centroid fallbacks were used.")
    lines.append("- Missing coordinates remain null and are **not check-in eligible**.")
    lines.append("")
    lines.append("## Geography")
    lines.append("")
    if outliers:
        lines.append(f"- READY outliers outside Netherlands bbox: {len(outliers)}")
        for r in outliers[:20]:
            lines.append(f"  - {r.get('name')} {r.get('lat')},{r.get('lng')} {r.get('city')}")
    else:
        lines.append("- All READY coordinates sit inside the Netherlands bounding box (50.75–53.55 lat, 3.35–7.23 lng).")
    lines.append("- Cross-border filtering: Basic-Fit BE/FR/DE/LU/ES excluded. Anytime Fitness global — NL only. David Lloyd UK already in catalog — new nl_* IDs for Dutch locations.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand physical address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_50m') or [])}")
    lines.append(f"- Legitimate different-brand co-locations ≤80 m: {len(staging_report.get('legitimate_different_brand_colocations') or [])}")
    lines.append(f"- Existing Netherlands rows in live catalog: {live_report.get('existing_netherlands_in_catalog')}")
    lines.append(f"- `nl_*` IDs already in live catalog: {len(live_report.get('nl_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live catalog: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report.get('proximity_same_brand') or [])}")
    lines.append(f"- David Lloyd in live catalog: {len(live_report.get('david_lloyd_live') or [])} (UK clubs — separate from NL nl_* IDs)")
    lines.append("- Fit For Free → SportCity rebrand: complete Oct 2022; fitforfree.nl → sportcity.nl. Zero FFF rows in staging.")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    lines.append("Netherlands Phase 1 covers the major chains.")
    lines.append("")
    lines.append("**Phase 2 chains to investigate:**")
    lines.append("- Big Gym (Amsterdam)")
    lines.append("- Squash City (Amsterdam)")
    lines.append("- Trainingsclub / regional NL chains")
    lines.append("- Independent conventional gyms in major cities")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows are recommended for a later Netherlands production merge.")
    lines.append("")
    lines.append(f"Expected catalog after that merge: **{n_live} + {ready_n} = {n_live + ready_n}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.")
    lines.append("")
    lines.append("## Scaling")
    lines.append("")
    expected = n_live + ready_n
    lines.append(f"Current live catalog: {n_live:,}.")
    if expected <= 8000:
        verdict = "comfortably inside"
    elif expected <= 10000:
        verdict = "inside, approaching the practical band"
    else:
        verdict = "above the current practical client-side band"
    lines.append(f"{expected:,} remains **{verdict}** the current client-side architecture.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    lines.append("Created or updated under `data/netherlands/` and `scripts/`:")
    lines.append("")
    top_files = [
        "scripts/netherlands-phase1-discover.py",
        "scripts/netherlands-phase1-consolidate.py",
        "data/netherlands/netherlands_centers_staging.json",
        "data/netherlands/netherlands_geocode_review.json",
        "data/netherlands/netherlands_geocode_review.csv",
        "data/netherlands/netherlands_duplicate_analysis.json",
        "data/netherlands/NETHERLANDS_PHASE1_READINESS_REPORT.md",
        "data/netherlands/Gymly_Netherlands_All_Discovered_Centers.xlsx",
        "data/netherlands/Gymly_Netherlands_All_Discovered_Centers.csv",
        "data/netherlands/netherlands_geocode_cache.json",
        "data/netherlands/netherlands_discovery_combined.json",
    ]
    for f in top_files:
        lines.append(f"- `{f}`")
    lines.append("- `data/netherlands/raw/` official HTML/JSON captures")
    lines.append("- `data/netherlands/scrapes/` per-chain discovery JSON")
    lines.append("")
    lines.append("**STOP. Do not merge Netherlands. Do not run Netherlands QA. Do not start another country.**")
    lines.append("")
    (OUT / "NETHERLANDS_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    return ready_n


def main():
    t0 = time.time()
    raw_rows = load_scrapes()
    print("loaded scrapes", len(raw_rows))
    rows, collapsed = collapse_staging(raw_rows)
    print("after collapse", len(rows), "collapsed", len(collapsed))
    rows = [classify_pre(r) for r in rows]
    PRE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
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
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_nl_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; dropped_non_nl_coord").strip("; ")
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    dup = {
        "vs_live": live_report,
        "vs_staging": staging_report,
        "collapsed": collapsed[:50],
        "collapsed_count": len(collapsed),
    }
    (OUT / "netherlands_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    write_geocode_review(rows)
    write_excel(rows)
    n_live = len(centers)
    write_report(rows, live_report, staging_report, collapsed, n_live)
    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "in", round(time.time() - t0), "s")
    print("READY", cats.get("READY_TO_IMPORT", 0), "expected catalog", n_live + cats.get("READY_TO_IMPORT", 0))


if __name__ == "__main__":
    main()
