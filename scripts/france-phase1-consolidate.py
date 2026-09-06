#!/usr/bin/env python3
"""
Consolidate France scrapes → staging, Nominatim geocode (countrycodes=fr),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json.
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/france"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "france_centers_staging.json"
CACHE = OUT / "france_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyFranceGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"

FR_METRO_BOUNDS = (41.3, 51.1, -5.2, 9.6)
FR_CORSICA = (41.4, 43.0, 8.5, 9.6)
FR_OVERSEAS = {
    "Guadeloupe": (15.8, 16.6, -62.0, -60.9),
    "Martinique": (14.3, 14.9, -61.3, -60.8),
    "Guyane": (2.1, 5.8, -54.6, -51.6),
    "Réunion": (-21.4, -20.8, 55.2, 55.9),
}

MAJOR_CITIES = [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes",
    "Montpellier", "Strasbourg", "Bordeaux", "Lille", "Rennes",
    "Reims", "Le Havre", "Saint-Étienne", "Toulon", "Grenoble",
    "Dijon", "Angers", "Nîmes", "Clermont-Ferrand",
]

CHAIN_ESTIMATES = [
    ("Basic-Fit", "~911 France clubs (2026)"),
    ("Fitness Park", "~350+ France clubs"),
    ("L'Orange Bleue", "~400 France clubs"),
    ("Keepcool", "~270 clubs (incl. Neoness ~30, Metabolik)"),
    ("Neoness", "~30 clubs (owned by ICM Wellness / Keepcool group)"),
    ("ON AIR Fitness", "~110+ France clubs"),
    ("L'Appart Fitness", "~111 France clubs"),
    ("Anytime Fitness", "3 open + 4 coming soon + 10 Interval Sport"),
    ("Cercles de la Forme", "~30 Paris clubs"),
    ("Elancia", "~53 France clubs"),
    ("Gigafit", "~40 France clubs"),
    ("Magic Form", "~60 France clubs"),
    ("Vita Liberté", "~50 France clubs"),
    ("Wefit.club", "~55 France clubs"),
    ("Liberty Gym", "~70 France clubs"),
]


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join([
            (brand or "").strip().lower(),
            (source_url or "").strip().lower(),
            "france",
        ])
    else:
        key = "|".join([
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            (city or "").strip().lower(),
            "france",
        ])
    return "fr_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ").replace("é", "e").replace("è", "e").replace("ê", "e")
    s = s.replace("ë", "e").replace("à", "a").replace("â", "a").replace("ç", "c")
    s = s.replace("î", "i").replace("ï", "i").replace("ô", "o").replace("ù", "u")
    s = s.replace("û", "u").replace("œ", "oe").replace("æ", "ae")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def fr_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    raw = str(s).strip()
    m = re.search(r"\b(\d{5})\b", raw)
    return m.group(1) if m else ""


def in_france_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    lo, hi, w, e = FR_METRO_BOUNDS
    if lo <= lat <= hi and w <= lng <= e:
        return True
    clo, chi, cw, ce = FR_CORSICA
    if clo <= lat <= chi and cw <= lng <= ce:
        return True
    for bounds in FR_OVERSEAS.values():
        olo, ohi, ow, oe = bounds
        if olo <= lat <= ohi and ow <= lng <= oe:
            return True
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
        r["postal_code"] = fr_postal(r.get("postal_code")) or r.get("postal_code") or None
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
        r["country"] = "France"
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
            if in_france_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_france_bbox").strip("; ")
            r["lat"] = r["lng"] = None
            r["coord_source"] = None
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    r["import_category"] = "NEEDS_COORDINATES"
    r["phase1_ready_for_geocode"] = True
    return r


COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "fr",
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
    if not in_france_bbox(lat, lng):
        return None, ["outside_france"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "fr":
        return None, ["not_country_fr:" + cc], lat, lng

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
    if not street or not postal or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, France",
        f"{street}, {postal}, France",
        f"{street}, {city}, France",
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
    live_fr = [c for c in centers if c.get("country") == "France"]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers if c.get("address")
    }
    report = {
        "existing_france_in_catalog": len(live_fr),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "fr_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("fr_")],
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
    return report


def write_excel(rows):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("openpyxl not available, skipping Excel export")
        return None, None

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
    ws.title = "France Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = fr_postal(r.get("postal_code")) or (r.get("postal_code") or "")
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
            "France",
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
    path = OUT / "Gymly_France_All_Discovered_Centers.xlsx"
    wb.save(path)
    return path, None


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"), "name": r.get("name"), "brand": r.get("brand"),
                "address": r.get("address"), "postal_code": r.get("postal_code"),
                "city": r.get("city"), "latitude": r.get("lat"), "longitude": r.get("lng"),
                "geocode_status": r.get("geocode_status"), "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"), "notes": r.get("notes"),
            })
    (OUT / "france_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    return review


def city_ready(rows, city_name):
    n = norm(city_name)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and n in norm(r.get("city") or "")]
    disc = [r for r in rows if n in norm(r.get("city") or "")]
    return len(disc), len(ready)


def write_report(rows, live_report, staging_report, collapsed, n_live):
    cats = Counter(r.get("import_category") for r in rows)
    ready_n = cats.get("READY_TO_IMPORT", 0)

    lines = []
    lines.append("# France Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")

    lines.append("## Market Audit")
    lines.append("")
    lines.append("### Brand Relationships")
    lines.append("")
    lines.append("- **Basic-Fit**: Dutch-owned, ~911 owned clubs in France (year-end 2025: 894). Budget/24-7. Multi-country — FR only staged.")
    lines.append("- **Fitness Park**: ~350+ France clubs (400+ with international). Premium accessible. Franchise model. Present in DROM-COM.")
    lines.append("- **L'Orange Bleue**: ~400 clubs France + Spain/Portugal. 2nd largest French fitness network. Licence de marque since 2006.")
    lines.append("- **Keepcool**: ~270 clubs. Acquired Neoness in July 2022 (now ICM Wellness group). Neoness retained as separate brand (~30 clubs, mostly Paris/IDF).")
    lines.append("- **Neoness**: ~30 clubs, mostly Paris/IDF. Owned by ICM Wellness (Keepcool group). First franchise opened April 2026 in Nîmes.")
    lines.append("- **ON AIR Fitness**: ~110+ clubs. Premium (sport/music/design). Growing rapidly — reached 100 clubs Feb 2026.")
    lines.append("- **L'Appart Fitness**: ~111 clubs. Founded Lyon 2007. Target 150 clubs by 2028.")
    lines.append("- **Anytime Fitness France**: 3 open (Villeurbanne, Nice, Colombes) + 4 coming soon + acquired 10 Interval Sport clubs (Aug 2026).")
    lines.append("- **Cercles de la Forme / Circle Club**: ~30 clubs Paris + Châtillon, Clamart, Montpellier. Paris-focused premium.")
    lines.append("- **Elancia**: ~53 clubs. Sport Santé label. Premium coaching. First Paris club Jan 2026.")
    lines.append("- **Gigafit**: ~40 clubs. Premium, mostly IDF. V4 concept rollout.")
    lines.append("- **Magic Form**: ~60 clubs. Budget-mid range. Mostly IDF.")
    lines.append("- **Vita Liberté**: ~50 clubs. Franchise. PACA/Corsica focus + Guyane.")
    lines.append("- **Wefit.club**: ~55 clubs. Franchise. Mostly western France + expanding.")
    lines.append("- **Liberty Gym**: ~70 clubs. Budget franchise. Grand Est strong. Expanding internationally.")
    lines.append("")

    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total France locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| DUPLICATE (staging) | {cats.get('DUPLICATE', 0)} |")
    lines.append(f"| Staging same-id collapses | {len(collapsed)} |")
    lines.append("")

    lines.append("## Chain Coverage")
    lines.append("")
    lines.append("| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    brands = sorted({r.get("brand") for r in rows})
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
        lines.append(f"| {b} | additional chain | {disc} | {rd} | {unr} | {pct} |")
    lines.append("")

    lines.append("## Major City Coverage (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in MAJOR_CITIES:
        d, rd = city_ready(rows, c)
        lines.append(f"| {c} | {d} | {rd} |")
    lines.append("")

    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    official = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") and "official" in r.get("coord_source", ""))
    nomi = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") == "nominatim")

    lines.append("## Data Quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postal codes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- READY with official coordinates: {official}")
    lines.append(f"- READY with Nominatim coordinates: {nomi}")
    lines.append("- French postal codes stored as **strings** (5-digit, leading zeros preserved).")
    lines.append("- French characters (é, è, ê, ë, à, â, ç, î, ï, ô, ù, û, œ, æ) preserved in all fields.")
    lines.append("- No Paris/city/postal-code/France centroid fallbacks used.")
    lines.append("")

    lines.append("## Geography")
    lines.append("")
    outliers = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and not in_france_bbox(r.get("lat"), r.get("lng"))]
    if outliers:
        lines.append(f"- READY outliers outside France bbox: {len(outliers)}")
    else:
        lines.append("- All READY coordinates sit inside the France bounding box.")
    lines.append("- Metropolitan France bbox: lat 41.3–51.1, lng -5.2–9.6")
    lines.append("- Corsica: lat 41.4–43.0, lng 8.5–9.6")
    lines.append("- Overseas (Guadeloupe, Martinique, Guyane, Réunion): validated separately")
    lines.append("- Cross-border filtering: Basic-Fit BE/NL/DE/LU/ES excluded. Strict FR/France country filter.")
    lines.append("")

    lines.append("## Duplicate / Rebrand Analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand physical address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Existing France rows in live catalog: {live_report.get('existing_france_in_catalog')}")
    lines.append(f"- `fr_*` IDs already in live catalog: {len(live_report.get('fr_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live catalog: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report.get('proximity_same_brand') or [])}")
    lines.append("")

    lines.append("## Completeness")
    lines.append("")
    lines.append("Phase 1 covers the major national chains:")
    lines.append("- **Complete**: Basic-Fit (905/911), Fitness Park (351/350+), L'Appart Fitness (110/111), Anytime Fitness (7)")
    lines.append("- **Partial**: L'Orange Bleue (217/400 — HTML parsing, needs club page fetch)")
    lines.append("- **Phase 2 needed**: Keepcool (~270), ON AIR (~110), Cercles de la Forme (~30), Elancia (~53), Gigafit (~40), Magic Form (~60), Vita Liberté (~50), Wefit.club (~55), Liberty Gym (~70), Neoness (~30)")
    lines.append("")
    lines.append("**Phase 2 priorities:**")
    lines.append("- Keepcool/Neoness (Woosmap API, browser-based extraction)")
    lines.append("- ON AIR Fitness (individual club page fetch)")
    lines.append("- Remaining mid-size chains via sitemaps/club pages")
    lines.append("- Independent gyms in major cities")
    lines.append("")

    lines.append("## Proposed SAFE Merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows are recommended for a later France production merge.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live} + {ready_n} = {n_live + ready_n}**.")
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
    lines.append("Created or updated under `data/france/` and `scripts/`:")
    lines.append("")
    top_files = [
        "scripts/france-phase1-discover.py",
        "scripts/france-phase1-fetch-clubs.py",
        "scripts/france-phase1-consolidate.py",
        "data/france/france_centers_staging.json",
        "data/france/france_geocode_review.json",
        "data/france/france_duplicate_analysis.json",
        "data/france/FRANCE_PHASE1_READINESS_REPORT.md",
        "data/france/Gymly_France_All_Discovered_Centers.xlsx",
        "data/france/france_geocode_cache.json",
        "data/france/france_discovery_combined.json",
    ]
    for f in top_files:
        lines.append(f"- `{f}`")
    lines.append("- `data/france/raw/` — official HTML/JSON captures")
    lines.append("- `data/france/scrapes/` — per-chain discovery JSON")
    lines.append("")
    lines.append("**STOP. Do not merge France. Do not run France QA. Do not start another country.**")
    lines.append("")
    (OUT / "FRANCE_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    return ready_n


def main():
    t0 = time.time()
    raw_rows = load_scrapes()
    print("loaded scrapes", len(raw_rows))
    rows, collapsed = collapse_staging(raw_rows)
    print("after collapse", len(rows), "collapsed", len(collapsed))
    rows = [classify_pre(r) for r in rows]

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    todo = [r for r in rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print("geocode todo", len(todo))

    MAX_GEOCODE = 300
    for i, r in enumerate(todo[:MAX_GEOCODE], 1):
        geocode_row(r, cache)
        if i % 10 == 0:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  geocoded {i}/{min(len(todo), MAX_GEOCODE)}")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_france_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; dropped_non_fr_coord").strip("; ")

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    dup = {
        "vs_live": live_report,
        "vs_staging": staging_report,
        "collapsed": collapsed[:50],
        "collapsed_count": len(collapsed),
    }
    (OUT / "france_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    write_geocode_review(rows)
    write_excel(rows)
    n_live = len(centers)
    write_report(rows, live_report, staging_report, collapsed, n_live)
    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "in", round(time.time() - t0), "s")
    print("READY", cats.get("READY_TO_IMPORT", 0), "expected catalog", n_live + cats.get("READY_TO_IMPORT", 0))


if __name__ == "__main__":
    main()
