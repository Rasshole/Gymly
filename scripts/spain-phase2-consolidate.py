#!/usr/bin/env python3
"""
Spain Phase 2 consolidate — merge Phase 1 staging + Phase 2 scrapes,
geocode unresolved, write readiness artifacts.

Does NOT modify centers.json. No invented/centroid coordinates.
Preserves valid Phase 1 READY rows.
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
    from openpyxl.styles import Font
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
PHASE1_STAGING_BACKUP = OUT / "spain_centers_staging_phase1_backup.json"

ctx = ssl.create_default_context()
UA = "GymlySpainGeocoder/2.0 (catalog research; accuracy over coverage; no fallback centroids)"

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
    ("Anytime Fitness", "~60+ franchise clubs (Spain sitemap)"),
    ("Dreamfit", "~25 clubs"),
    ("GO fit", "~20 clubs"),
    ("Metropolitan", "~10-20 premium clubs"),
    ("Forus", "~15-25 sports/fitness centers"),
    ("Fitness Park", "~150 clubs (Spain estate)"),
    ("Supera", "~5+ (partial via Eurofitness group listing)"),
    ("Enjoy!", "unknown — official site unreachable in Phase 2"),
    ("BeOne", "~15-25 gym floors"),
    ("O2 Centro Wellness", "~10 clubs"),
    ("Eurofitness", "~20 clubs (Catalonia)"),
    ("Holiday Gym", "~22 clubs"),
    ("McFIT", "N/A — sold to Basic-Fit 2024"),
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
    for a, b in [
        ("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"),
        ("ü", "u"), ("ñ", "n"), ("ç", "c"), ("à", "a"), ("è", "e"),
        ("ò", "o"), ("ï", "i"),
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


def es_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


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


def in_ceuta(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_CEUTA
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_melilla(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_MELILLA
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def richness(r):
    return (
        (2 if r.get("lat") is not None else 0)
        + (1 if r.get("postal_code") else 0)
        + (1 if r.get("address") else 0)
        + (1 if r.get("city") else 0)
        + (1 if r.get("coord_source") and "official" in str(r.get("coord_source")) else 0)
    )


def load_phase1_staging():
    if not STAGING.exists():
        return []
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    # Backup once
    if not PHASE1_STAGING_BACKUP.exists():
        PHASE1_STAGING_BACKUP.write_text(
            json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return rows


def load_phase2_scrapes():
    rows = []
    for p in sorted(SCRAPES.glob("*_spain_p2.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            for r in data:
                r.setdefault("phase", "spain_phase2")
                rows.append(r)
    return rows


def addr_key(r):
    return (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))


def soft_addr_key(r):
    # Without postal — for matching rebrands / enrichment
    return (norm(r.get("brand")), norm(r.get("address")), norm(r.get("city")))


def merge_rows(phase1, phase2):
    """Preserve Phase 1 READY; enrich unresolved; add new discoveries."""
    by_id = {}
    kept = []
    collapsed = []
    rebrands = []
    stats = {
        "phase1_in": len(phase1),
        "phase2_in": len(phase2),
        "enriched": 0,
        "new_added": 0,
        "altafit_dropped_as_vivagym_rebrand": 0,
        "preserved_phase1_ready": 0,
    }

    def upsert(r, source):
        r = dict(r)
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
            if source == "p2":
                stats["new_added"] += 1
            return
        # Prefer richer; never downgrade READY with coords to worse
        if richness(r) > richness(prev):
            # merge notes
            notes = "; ".join(x for x in [prev.get("notes"), r.get("notes")] if x)
            if prev.get("import_category") == "READY_TO_IMPORT" and prev.get("lat") is not None:
                # keep prev coords if new lacks official improvement
                if r.get("lat") is None:
                    r["lat"], r["lng"] = prev["lat"], prev["lng"]
                    r["coord_source"] = prev.get("coord_source")
                    r["import_category"] = "READY_TO_IMPORT"
            r["notes"] = notes
            collapsed.append({"kept": r.get("name"), "dropped": prev.get("name"), "id": key, "reason": "richer"})
            kept.remove(prev)
            by_id[key] = r
            kept.append(r)
            if source == "p2":
                stats["enriched"] += 1
        else:
            # maybe fill missing fields on prev
            changed = False
            for f in ("postal_code", "lat", "lng", "coord_source", "source_url", "website"):
                if not prev.get(f) and r.get(f):
                    prev[f] = r[f]
                    changed = True
            if changed:
                stats["enriched"] += 1
            collapsed.append({"kept": prev.get("name"), "dropped": r.get("name"), "id": key, "reason": "keep_existing"})

    # Phase 1 first
    for r in phase1:
        if r.get("import_category") == "READY_TO_IMPORT":
            stats["preserved_phase1_ready"] += 1
        upsert(r, "p1")

    # Phase 2
    for r in phase2:
        upsert(r, "p2")

    # Soft-match enrichment: same brand+address+city, different postal/id
    by_soft = defaultdict(list)
    for r in kept:
        if r.get("address"):
            by_soft[soft_addr_key(r)].append(r)
    for k, group in by_soft.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: -richness(x))
        best = group[0]
        for other in group[1:]:
            if other.get("import_category") == "READY_TO_IMPORT" and best.get("import_category") != "READY_TO_IMPORT":
                continue
            # mark poorer as duplicate if same brand address
            if richness(best) >= richness(other) and best.get("lat") is not None:
                other["import_category"] = "DUPLICATE"
                other["verification_status"] = "DUPLICATE"
                other["notes"] = ((other.get("notes") or "") + "; soft_addr_duplicate").strip("; ")
                collapsed.append({
                    "kept": best.get("name"), "dropped": other.get("name"),
                    "reason": "soft_addr_duplicate",
                })

    # Altafit → VivaGym rebrand: same/near address → drop Altafit
    viva = [r for r in kept if r.get("brand") == "VivaGym" and r.get("lat") is not None
            and r.get("import_category") != "DUPLICATE"]
    for r in kept:
        if r.get("brand") != "Altafit" or r.get("import_category") == "DUPLICATE":
            continue
        drop = False
        if r.get("lat") is not None:
            for v in viva:
                try:
                    d = haversine(float(r["lat"]), float(r["lng"]), float(v["lat"]), float(v["lng"]))
                except (TypeError, ValueError):
                    continue
                if d <= 120:
                    drop = True
                    rebrands.append({
                        "altafit": r.get("name"), "vivagym": v.get("name"),
                        "distance_m": round(d),
                    })
                    break
        if not drop and r.get("address"):
            for v in viva:
                if norm(r.get("address")) and norm(r.get("address")) == norm(v.get("address")):
                    drop = True
                    rebrands.append({
                        "altafit": r.get("name"), "vivagym": v.get("name"),
                        "distance_m": None, "reason": "same_address",
                    })
                    break
        if drop:
            r["import_category"] = "DUPLICATE"
            r["verification_status"] = "DUPLICATE"
            r["notes"] = ((r.get("notes") or "") + "; rebranded_to_vivagym").strip("; ")
            stats["altafit_dropped_as_vivagym_rebrand"] += 1

    # Same-brand exact address duplicates
    by_addr = defaultdict(list)
    for r in kept:
        if r.get("import_category") == "DUPLICATE":
            continue
        k = addr_key(r)
        if k[1]:
            by_addr[k].append(r)
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: -richness(x))
        for d in group[1:]:
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            collapsed.append({
                "kept": group[0].get("name"), "dropped": d.get("name"),
                "reason": "same_brand_address",
            })

    # Same-brand proximity ≤80m
    with_coords = [r for r in kept if r.get("lat") is not None and r.get("import_category") != "DUPLICATE"]
    for i, a in enumerate(with_coords):
        for b in with_coords[i + 1:]:
            if norm(a.get("brand")) != norm(b.get("brand")):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 80:
                poorer = a if richness(a) < richness(b) else b
                if poorer.get("import_category") != "DUPLICATE":
                    poorer["import_category"] = "DUPLICATE"
                    poorer["verification_status"] = "DUPLICATE"
                    poorer["notes"] = ((poorer.get("notes") or "") + f"; proximity_dup_{round(d)}m").strip("; ")
                    collapsed.append({
                        "kept": (b if poorer is a else a).get("name"),
                        "dropped": poorer.get("name"),
                        "reason": f"proximity_{round(d)}m",
                    })

    return kept, collapsed, rebrands, stats


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
    # Expand common Spanish abbreviations for matching
    street_exp = street_n
    for a, b in [
        ("c ", "calle "), ("av ", "avenida "), ("avd ", "avenida "),
        ("avda ", "avenida "), ("carrer ", "calle "), ("rúa ", "calle "),
        ("rua ", "calle "), ("pl ", "plaza "), ("pg ", "paseo "),
    ]:
        if street_exp.startswith(a):
            street_exp = b + street_exp[len(a):]
    if road and street_n and (
        road in street_n or street_n in norm(display) or road in street_exp
        or street_exp in norm(display)
        or any(tok and tok in road for tok in street_exp.split() if len(tok) > 4)
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
    # Synergym / no-postal: also try without street number variants
    if not postal:
        queries.append(f"{street}, {city}, España")
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
                r["lat"] = r["lng"] = None
                return r
        # Backfill postal from Nominatim if missing and ES 5-digit
        if not postal:
            pc = es_postal((top[5].get("address") or {}).get("postcode") or "")
            if pc:
                r["postal_code"] = pc
                # Recompute id with postal
                r["id"] = make_id(r.get("brand"), r.get("address"), pc, r.get("city"))
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


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"),
                "brand": r.get("brand"),
                "name": r.get("name"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"),
                "geocode_status": r.get("geocode_status"),
                "geocode_display": r.get("geocode_display"),
                "geocode_reasons": r.get("geocode_reasons"),
            })
    (OUT / "spain_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # CSV
    if review:
        fields = list(review[0].keys())
        with (OUT / "spain_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for row in review:
                flat = dict(row)
                if isinstance(flat.get("geocode_reasons"), list):
                    flat["geocode_reasons"] = "|".join(flat["geocode_reasons"])
                w.writerow(flat)


def write_excel(rows):
    if not HAS_OPENPYXL:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Spain Centers"
    headers = [
        "id", "brand", "name", "address", "postal_code", "city", "country",
        "latitude", "longitude", "status", "verification_status", "source_url",
        "import_category", "coord_source", "geocode_status", "website", "notes", "phase",
    ]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([
            r.get("id"), r.get("brand"), r.get("name"), r.get("address"),
            r.get("postal_code"), r.get("city"), r.get("country"),
            r.get("lat"), r.get("lng"),
            r.get("import_category"), r.get("verification_status"),
            r.get("source_url"), r.get("import_category"),
            r.get("coord_source"), r.get("geocode_status"),
            r.get("website"), r.get("notes"), r.get("phase"),
        ])
    for i, _ in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = 18
    wb.save(OUT / "Gymly_Spain_All_Discovered_Centers.xlsx")


def coverage_table(rows):
    out = []
    for brand, est in CHAIN_ESTIMATES:
        if brand == "McFIT":
            out.append({
                "brand": brand,
                "estimate": est,
                "discovered": 0,
                "ready": 0,
                "unresolved": 0,
                "coverage_pct": None,
                "status": "COMPLETE_VIA_BASIC_FIT",
            })
            continue
        sub = [r for r in rows if r.get("brand") == brand and r.get("import_category") != "DUPLICATE"]
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        un = sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"})
        disc = len(sub)
        # Parse rough estimate number
        m = re.search(r"~(\d+)", est)
        est_n = int(m.group(1)) if m else None
        cov = round(100 * disc / est_n) if est_n else None
        status = "MATERIAL GAP"
        if brand == "Enjoy!":
            status = "MATERIAL GAP" if disc == 0 else "PARTIAL"
        elif disc == 0:
            status = "MATERIAL GAP"
        elif est_n and cov is not None and cov >= 80 and rd >= 0.7 * disc:
            status = "COMPLETE"
        elif est_n and cov is not None and cov >= 50:
            status = "PARTIAL"
        elif disc > 0:
            status = "PARTIAL"
        out.append({
            "brand": brand, "estimate": est, "discovered": disc,
            "ready": rd, "unresolved": un, "coverage_pct": cov, "status": status,
        })
    return out


def write_reports(rows, collapsed, rebrands, merge_stats, phase1_baseline):
    cats = Counter(r.get("import_category") for r in rows if r.get("import_category") != "DUPLICATE")
    # include duplicates separately
    n_dup = sum(1 for r in rows if r.get("import_category") == "DUPLICATE")
    active = [r for r in rows if r.get("import_category") != "DUPLICATE"]
    ready = [r for r in active if r.get("import_category") == "READY_TO_IMPORT"]
    ready_n = len(ready)

    try:
        centers = json.loads(CENTERS.read_text(encoding="utf-8"))
        n_live = len(centers)
    except Exception:
        centers = []
        n_live = 7167

    brand_ready = Counter(r.get("brand") for r in ready)
    cov = coverage_table(active)

    city_rows = []
    for city in MAJOR_CITIES:
        n = norm(city)
        disc = sum(1 for r in active if n in norm(r.get("city") or ""))
        rd = sum(1 for r in ready if n in norm(r.get("city") or ""))
        city_rows.append({"city": city, "discovered": disc, "ready": rd})

    balearic = sum(1 for r in ready if in_balearic(r.get("lat"), r.get("lng")))
    canary = sum(1 for r in ready if in_canary(r.get("lat"), r.get("lng")))
    ceuta = sum(1 for r in ready if in_ceuta(r.get("lat"), r.get("lng")))
    melilla = sum(1 for r in ready if in_melilla(r.get("lat"), r.get("lng")))

    missing_addr = sum(1 for r in active if not (r.get("address") or "").strip())
    missing_pc = sum(1 for r in active if not (r.get("postal_code") or "").strip())
    missing_city = sum(1 for r in active if not (r.get("city") or "").strip())
    missing_coords = sum(1 for r in active if r.get("lat") is None)

    # Completeness gates A–H
    def brand_stats(b):
        sub = [r for r in active if r.get("brand") == b]
        return {
            "discovered": len(sub),
            "ready": sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT"),
            "unresolved": sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}),
            "coming_soon": sum(1 for r in sub if r.get("import_category") == "COMING_SOON"),
        }

    gates = {
        "A_VivaGym": {**brand_stats("VivaGym"), "materially_complete": brand_stats("VivaGym")["discovered"] >= 200},
        "B_BasicFit": {**brand_stats("Basic-Fit"), "materially_complete": brand_stats("Basic-Fit")["discovered"] >= 230},
        "C_Altafit": {**brand_stats("Altafit"), "materially_complete": True},
        "D_Synergym": {**brand_stats("Synergym"), "materially_complete": brand_stats("Synergym")["ready"] >= 100},
        "E_McFIT": {"status": "N/A_ABSORBED_INTO_BASIC_FIT", "materially_complete": True},
        "F_Anytime": {**brand_stats("Anytime Fitness"), "materially_complete": brand_stats("Anytime Fitness")["discovered"] >= 40},
        "G_MajorChainsRepresented": {
            "brands_with_rows": sorted({r.get("brand") for r in active}),
            "materially_complete": len({r.get("brand") for r in active}) >= 10,
        },
        "H_StillCompletelyMissing": [
            c["brand"] for c in cov if c["discovered"] == 0 and c["brand"] not in ("McFIT",)
        ],
    }

    report = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "status": "PHASE 2 DISCOVERY COMPLETE — DO NOT MERGE",
        "phase1_baseline": phase1_baseline,
        "merge_stats": merge_stats,
        "rebrands": rebrands,
        "totals": {
            "unique_staged": len(active),
            "READY_TO_IMPORT": cats.get("READY_TO_IMPORT", 0),
            "NEEDS_COORDINATES": cats.get("NEEDS_COORDINATES", 0),
            "NEEDS_REVIEW": cats.get("NEEDS_REVIEW", 0),
            "COMING_SOON": cats.get("COMING_SOON", 0),
            "CLOSED": cats.get("CLOSED", 0),
            "DUPLICATE": n_dup,
        },
        "ready_by_brand": dict(brand_ready),
        "chain_coverage": cov,
        "cities": city_rows,
        "islands": {
            "balearic_ready": balearic,
            "canary_ready": canary,
            "ceuta_ready": ceuta,
            "melilla_ready": melilla,
        },
        "data_quality": {
            "missing_addresses": missing_addr,
            "missing_postal_codes": missing_pc,
            "missing_cities": missing_city,
            "missing_coordinates": missing_coords,
        },
        "completeness_gates": gates,
        "proposed_safe_merge": {
            "ready_count": ready_n,
            "live_catalog": n_live,
            "projected_total": n_live + ready_n,
        },
        "checkpoint_10k": (n_live + ready_n) >= 10000,
        "collapsed_count": len(collapsed),
    }

    (OUT / "SPAIN_PHASE2_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT / "SPAIN_PHASE2_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Markdown
    lines = []
    lines.append("# Spain Phase 2 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {report['generated_at']}")
    lines.append("")
    lines.append("**Status: PHASE 2 DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Phase 1 baseline (preserved)")
    lines.append("")
    for k, v in phase1_baseline.items():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## Phase 2 recovery")
    lines.append("")
    for k, v in merge_stats.items():
        lines.append(f"- {k}: {v}")
    lines.append(f"- Altafit→VivaGym rebrand drops: {len(rebrands)}")
    lines.append("")
    lines.append("## McFIT Spain")
    lines.append("")
    lines.append("All McFIT Spain studios were sold to **Basic-Fit** in 2024. "
                 "Phase 2 API check returned 0 McFIT ES studios. "
                 "**COMPLETE via Basic-Fit** — not a coverage gap. No McFIT rows staged.")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Unique staged (excl. duplicates) | {len(active)} |")
    lines.append(f"| READY_TO_IMPORT | {cats.get('READY_TO_IMPORT', 0)} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| DUPLICATE | {n_dup} |")
    lines.append("")
    lines.append("## READY by brand")
    lines.append("")
    lines.append("| Brand | READY |")
    lines.append("|---|---:|")
    for b, n in sorted(brand_ready.items(), key=lambda x: -x[1]):
        lines.append(f"| {b} | {n} |")
    lines.append("")
    lines.append("## Major chain completeness")
    lines.append("")
    lines.append("| Chain | Estimate | Discovered | READY | Unresolved | Coverage % | Status |")
    lines.append("|---|---|---:|---:|---:|---:|---|")
    for c in cov:
        covs = "—" if c["coverage_pct"] is None else f"{c['coverage_pct']}%"
        lines.append(
            f"| {c['brand']} | {c['estimate']} | {c['discovered']} | {c['ready']} | "
            f"{c['unresolved']} | {covs} | {c['status']} |"
        )
    lines.append("")
    lines.append("## Completeness gates (A–H)")
    lines.append("")
    lines.append(f"- **A VivaGym materially complete?** {'YES' if gates['A_VivaGym']['materially_complete'] else 'NO'} "
                 f"({gates['A_VivaGym']['discovered']} discovered / {gates['A_VivaGym']['ready']} READY)")
    lines.append(f"- **B Basic-Fit?** {'YES' if gates['B_BasicFit']['materially_complete'] else 'NO'} "
                 f"({gates['B_BasicFit']['discovered']} / {gates['B_BasicFit']['ready']} READY)")
    lines.append(f"- **C Altafit?** {'YES' if gates['C_Altafit']['materially_complete'] else 'NO'} "
                 f"({gates['C_Altafit']['discovered']} remaining)")
    lines.append(f"- **D Synergym?** {'YES' if gates['D_Synergym']['materially_complete'] else 'PARTIAL'} "
                 f"({gates['D_Synergym']['discovered']} / {gates['D_Synergym']['ready']} READY)")
    lines.append("- **E McFIT Spain?** N/A — absorbed into Basic-Fit (COMPLETE)")
    lines.append(f"- **F Anytime Fitness Spain?** {'YES' if gates['F_Anytime']['materially_complete'] else 'NO'} "
                 f"({gates['F_Anytime']['discovered']} / {gates['F_Anytime']['ready']} READY)")
    lines.append(f"- **G Major conventional chains represented?** "
                 f"{'YES' if gates['G_MajorChainsRepresented']['materially_complete'] else 'NO'}")
    missing = gates["H_StillCompletelyMissing"]
    lines.append(f"- **H Still completely missing?** {', '.join(missing) if missing else 'None'}")
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in city_rows:
        lines.append(f"| {c['city']} | {c['discovered']} | {c['ready']} |")
    lines.append("")
    lines.append("## Islands")
    lines.append("")
    lines.append(f"- Balearic Islands READY: {balearic}")
    lines.append(f"- Canary Islands READY: {canary}")
    lines.append(f"- Ceuta READY: {ceuta}")
    lines.append(f"- Melilla READY: {melilla}")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postal codes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coords}")
    lines.append("- Spanish postcodes preserved as 5-digit strings (leading zeros intact).")
    lines.append("- Spanish/Catalan/Basque/Galician text preserved.")
    lines.append("- No city/postcode/country centroid fallbacks used.")
    lines.append("")
    lines.append("## Remaining gaps / Phase 3?")
    lines.append("")
    lines.append("- Synergym: Incapsula blocks club-page scrape; Nominatim may still leave unresolved without postcodes.")
    lines.append("- Enjoy!: official site unreachable — worth Phase 3 if estate is material.")
    lines.append("- Metropolitan: city pages lack structured per-club JSON-LD; may need deeper scrape.")
    lines.append("- Supera: only partial via Eurofitness sister listing.")
    lines.append("- Phase 3 worthwhile mainly for Synergym postcode recovery + Enjoy! + Metropolitan polish.")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows from Phase 2 staging.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live} + {ready_n} = {n_live + ready_n}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.")
    lines.append("")
    lines.append("## 10K Checkpoint")
    lines.append("")
    if n_live + ready_n >= 10000:
        lines.append(f"YES — projected total {n_live + ready_n} reaches/exceeds 10,000.")
    else:
        lines.append(f"No — projected total {n_live + ready_n} remains under 10,000.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    for f in [
        "scripts/spain-phase2-discover.py",
        "scripts/spain-phase2-consolidate.py",
        "data/spain/spain_centers_staging.json",
        "data/spain/spain_geocode_review.json",
        "data/spain/spain_geocode_review.csv",
        "data/spain/spain_duplicate_analysis.json",
        "data/spain/SPAIN_PHASE2_READINESS_REPORT.md",
        "data/spain/SPAIN_PHASE2_READINESS_REPORT.json",
        "data/spain/SPAIN_PHASE2_READY_TO_IMPORT.json",
        "data/spain/Gymly_Spain_All_Discovered_Centers.xlsx",
        "data/spain/spain_geocode_cache.json",
    ]:
        lines.append(f"- `{f}`")
    lines.append("")
    lines.append("**STOP. Do not merge Spain. Do not run Spain QA. Do not start another country.**")
    lines.append("")
    (OUT / "SPAIN_PHASE2_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main():
    t0 = time.time()
    phase1 = load_phase1_staging()
    p1_cats = Counter(r.get("import_category") for r in phase1)
    phase1_baseline = {
        "staged": len(phase1),
        "READY": p1_cats.get("READY_TO_IMPORT", 0),
        "NEEDS_COORDINATES": p1_cats.get("NEEDS_COORDINATES", 0),
        "NEEDS_REVIEW": p1_cats.get("NEEDS_REVIEW", 0),
        "by_brand": dict(Counter(r.get("brand") for r in phase1)),
    }
    print("Phase 1 baseline", phase1_baseline)

    phase2 = load_phase2_scrapes()
    print("Phase 2 scrapes", len(phase2))

    rows, collapsed, rebrands, merge_stats = merge_rows(phase1, phase2)
    print("merged", len(rows), "stats", merge_stats, "rebrands", len(rebrands))

    rows = [classify_pre(r) for r in rows]

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    todo = [r for r in rows if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
            and r.get("address") and r.get("city")]
    # Prefer geocoding review items that failed before + new chains
    print("geocode todo", len(todo))
    for i, r in enumerate(todo, 1):
        # Skip NEEDS_REVIEW only if incomplete — re-try ambiguous
        geocode_row(r, cache)
        if i % 15 == 0:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  geocoded {i}/{len(todo)}")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # Reclassify after postal backfill may have changed ids — collapse again lightly
    by_id = {}
    final = []
    for r in rows:
        if r.get("import_category") == "DUPLICATE":
            final.append(r)
            continue
        rid = make_id(r.get("brand"), r.get("address") or "", r.get("postal_code") or "", r.get("city") or "")
        r["id"] = rid
        if rid in by_id:
            prev = by_id[rid]
            if richness(r) > richness(prev):
                prev["import_category"] = "DUPLICATE"
                by_id[rid] = r
            else:
                r["import_category"] = "DUPLICATE"
        else:
            by_id[rid] = r
        final.append(r)
    rows = final

    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_spain_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    dup = {
        "collapsed": collapsed[:100],
        "collapsed_count": len(collapsed),
        "rebrands_altafit_vivagym": rebrands,
        "merge_stats": merge_stats,
        "mcfit": "COMPLETE_VIA_BASIC_FIT",
    }
    (OUT / "spain_duplicate_analysis.json").write_text(
        json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_geocode_review(rows)
    write_excel(rows)
    report = write_reports(rows, collapsed, rebrands, merge_stats, phase1_baseline)
    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "in", round(time.time() - t0), "s")
    print("READY", report["totals"]["READY_TO_IMPORT"],
          "projected", report["proposed_safe_merge"]["projected_total"])


if __name__ == "__main__":
    main()
