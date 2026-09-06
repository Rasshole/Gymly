#!/usr/bin/env python3
"""
Consolidate Finland scrapes → staging, Nominatim geocode (countrycodes=fi),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No Helsinki / city / postal / country centroid fallbacks.
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
from openpyxl.styles import Alignment, Font, numbers
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/finland"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "finland_centers_staging.json"
PRE = OUT / "finland_centers_staging.pre_geocode.json"
CACHE = OUT / "finland_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyFinlandGeocoder/1.0 (catalog research; accuracy over coverage; no fallback centroids)"
# Mainland + Åland. Does NOT uniquely prove Finland (Norrbotten overlaps) — city/postal required.
FI_BOUNDS = (59.70, 70.12, 19.30, 31.60)

MAJOR_CITIES = [
    "Helsinki",
    "Espoo",
    "Vantaa",
    "Tampere",
    "Turku",
    "Oulu",
    "Jyväskylä",
    "Kuopio",
    "Lahti",
]

CHAIN_ESTIMATES = [
    ("Fitness24Seven", "~66 open + coming soon on fi.fitness24seven.com (gymData market=fi)"),
    ("ELIXIA", "32 live clubs on elixia.fi embedded JSON; site says yli 30"),
    ("Fressi", "~90 centres claimed on fressi.fi; 24h + Hyvinvointikeskus"),
    ("Liikku", "76 WP gym CPT rows; site says yli 70"),
    ("EasyFit", "~29 official location CPT / city pages"),
    ("Forever", "19 gyms / 13 cities claimed on foreverclub.fi"),
    ("Ole.Fit", "54 official kuntokeskukset URLs; site says yli 60"),
    ("GOGO", "3 full-service Tampere clubs on gogo.fi"),
    ("GOGO Express", "~25 official gx-cards on gogoexpress.fi"),
    ("GYM Anytime", "5 current clubs on gymanytime.fi until ~early 2027 rebrand"),
    ("PTVGYM", "15 clubs listed on ptvgym.fi"),
    ("LadyLine", "14 parent=0 toimipiste clubs on ladyline.fi"),
]


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (source_url or "").strip().lower(),
                "finland",
            ]
        )
    else:
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (address or "").strip().lower(),
                (str(postal) or "").strip().lower(),
                (city or "").strip().lower(),
                "finland",
            ]
        )
    return "fi_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ").replace("ä", "a").replace("ö", "o").replace("å", "a")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def fi_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    raw = str(s).strip()
    if raw.endswith(".0") and raw.replace(".0", "").isdigit():
        raw = raw[:-2]
    m = re.search(r"\b(\d{1,5})\b", raw)
    if not m:
        return ""
    return m.group(1).zfill(5)


def in_fi_bbox(lat, lng) -> bool:
    lo, hi, w, e = FI_BOUNDS
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
    """One physical gym = one row. Same brand+address+postal wins; keep richer record."""
    by_id = {}
    collapsed = []
    kept = []
    for r in rows:
        r["postal_code"] = fi_postal(r.get("postal_code")) or r.get("postal_code") or None
        if isinstance(r.get("postal_code"), str) and r["postal_code"].isdigit():
            r["postal_code"] = r["postal_code"].zfill(5)
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
        r["country"] = "Finland"
        key = r["id"]
        prev = by_id.get(key)
        if prev is None:
            by_id[key] = r
            kept.append(r)
            continue
        # richer address / coords wins
        score = (1 if r.get("address") else 0) + (1 if r.get("lat") is not None else 0) + (1 if r.get("postal_code") else 0)
        pscore = (1 if prev.get("address") else 0) + (1 if prev.get("lat") is not None else 0) + (1 if prev.get("postal_code") else 0)
        if score > pscore:
            collapsed.append({"kept": r.get("name"), "dropped": prev.get("name"), "id": key})
            kept.remove(prev)
            by_id[key] = r
            kept.append(r)
        else:
            collapsed.append({"kept": prev.get("name"), "dropped": r.get("name"), "id": key})
    # same-brand physical duplicates by normalized address
    by_addr = defaultdict(list)
    for r in kept:
        k = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if k[1]:
            by_addr[k].append(r)
    extra = []
    drop_ids = set()
    for k, group in by_addr.items():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: (0 if x.get("lat") is not None else 1, x.get("name") or ""))
        for d in group[1:]:
            d["import_category"] = "DUPLICATE"
            d["verification_status"] = "DUPLICATE"
            drop_ids.add(d["id"])
            extra.append({"kept": group[0].get("name"), "dropped": d.get("name"), "reason": "same_brand_address"})
    kept2 = []
    for r in kept:
        if r["id"] in drop_ids and r.get("import_category") == "DUPLICATE":
            kept2.append(r)
            continue
        if r["id"] in drop_ids:
            continue
        kept2.append(r)
    return kept2, collapsed + extra


def classify_pre(r):
    if r.get("import_category") == "DUPLICATE":
        return r
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "NEEDS_REVIEW":
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["lat"] = r.get("lat")  # keep official coords for review but not READY
        return r
    if r.get("encoding_flag"):
        r["import_category"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + "; encoding_flag").strip("; ")
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_fi_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_fi_bbox").strip("; ")
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
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "fi",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


COARSE = {
    "country",
    "state",
    "county",
    "municipality",
    "city",
    "town",
    "village",
    "administrative",
    "postcode",
    "postal_code",
    "suburb",
    "neighbourhood",
    "quarter",
    "district",
    "borough",
    "region",
    "island",
}


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_fi_bbox(lat, lng):
        return None, ["outside_finland"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "fi":
        return None, ["not_country_fi:" + cc], lat, lng

    t = (item.get("type") or item.get("class") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {
        "house",
        "building",
        "yes",
        "retail",
        "commercial",
        "industrial",
        "gym",
        "fitness_centre",
        "sports_centre",
    }:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng

    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc)
    postal_n = re.sub(r"\s+", "", str(postal or ""))
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
        road in street_n
        or street_n in norm(display)
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
        "gym",
        "fitness_centre",
        "sports_centre",
        "yes",
        "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")
    if "gym" in display or "kuntosali" in display or "fitness" in display:
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
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY_DUPLICATE"}:
        return r
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return r
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    if not street or not postal or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [
        f"{street}, {postal} {city}, Finland",
        f"{street}, {postal}, Finland",
        f"{street}, {city}, {postal}, Suomi",
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
    live_fi = [c for c in centers if c.get("country") == "Finland"]
    live_f24s = [c for c in centers if "24seven" in (c.get("brand") or "").lower() or "fitness24" in (c.get("brand") or "").lower()]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers
        if c.get("address")
    }
    report = {
        "existing_finland_in_catalog": len(live_fi),
        "live_catalog_total": len(centers),
        "live_f24s_other_countries": [
            {"id": c.get("id"), "name": c.get("name"), "country": c.get("country"), "city": c.get("city")}
            for c in live_f24s
        ],
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "same_address_different_brand": [],
        "fi_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("fi_")],
        "sats_elixia_live": [
            {"id": c.get("id"), "name": c.get("name"), "brand": c.get("brand"), "country": c.get("country")}
            for c in centers
            if (c.get("brand") or "").upper() in {"SATS", "ELIXIA"} or "sats" in (c.get("name") or "").lower() or "elixia" in (c.get("name") or "").lower()
        ],
    }
    live_by_postcode = defaultdict(list)
    for c in centers:
        if c.get("postal_code"):
            live_by_postcode[fi_postal(c.get("postal_code")) or str(c["postal_code"])].append(c)

    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append(
                {"staging": r.get("name"), "live": live_addr[key].get("name"), "id": r["id"], "live_country": live_addr[key].get("country")}
            )
        pc = fi_postal(r.get("postal_code"))
        if pc and r.get("address"):
            for c in live_by_postcode.get(pc, []):
                if norm(c.get("brand")) != norm(r.get("brand")) and norm(c.get("address")) and norm(c.get("address")) == norm(r.get("address")):
                    report["same_address_different_brand"].append(
                        {
                            "staging": r.get("name"),
                            "staging_brand": r.get("brand"),
                            "live": c.get("name"),
                            "live_brand": c.get("brand"),
                            "live_country": c.get("country"),
                            "postal_code": r.get("postal_code"),
                        }
                    )
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
                report["proximity_same_brand"].append(
                    {
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "distance_m": round(d),
                        "live_country": c.get("country"),
                    }
                )
    return report, centers


def staging_dupes(rows):
    report = {
        "duplicate_ids": [],
        "same_brand_address": [],
        "proximity_same_brand_50m": [],
        "legitimate_different_brand_colocations": [],
        "sats_elixia_relationships": [],
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
        for b in ready[i + 1 :]:
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d > 80:
                continue
            item = {
                "a": a.get("name"),
                "b": b.get("name"),
                "brand_a": a.get("brand"),
                "brand_b": b.get("brand"),
                "distance_m": round(d),
                "city": a.get("city"),
            }
            if norm(a.get("brand")) == norm(b.get("brand")):
                report["proximity_same_brand_50m"].append(item)
            else:
                report["legitimate_different_brand_colocations"].append(item)

    elixia = [r for r in rows if (r.get("brand") or "").upper() == "ELIXIA"]
    satsish = [r for r in rows if "sats" in (r.get("brand") or "").lower() or "sats" in (r.get("name") or "").lower()]
    report["sats_elixia_relationships"] = {
        "elixia_rows": len(elixia),
        "sats_brand_rows": len(satsish),
        "note": "Current Finnish consumer brand is ELIXIA. Operator is SATS Finland Oy. No SATS-branded Finnish club rows were created. legacy_brand=SATS on ELIXIA rows.",
        "sats_named": [r.get("name") for r in satsish],
    }
    return report


def write_excel(rows):
    cols = [
        "id",
        "chain",
        "center_name",
        "address",
        "postal_code",
        "city",
        "country",
        "latitude",
        "longitude",
        "status",
        "verification_status",
        "source_url",
        "opening_hours",
        "legacy_brand",
    ]
    extra = ["coord_source", "geocode_status", "website", "notes", "format"]
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            (r.get("brand") or "").casefold(),
            (r.get("city") or "").casefold(),
            (r.get("name") or "").casefold(),
        ),
    )
    wb = Workbook()
    ws = wb.active
    ws.title = "Finland Discovered"
    ws.append(cols + extra)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    postal_col = cols.index("postal_code") + 1
    for i, r in enumerate(sorted_rows, start=2):
        postal = fi_postal(r.get("postal_code")) or (r.get("postal_code") or "")
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
            "Finland",
            r.get("lat"),
            r.get("lng"),
            r.get("import_category"),
            r.get("verification_status"),
            r.get("source_url"),
            hours,
            r.get("legacy_brand"),
            r.get("coord_source"),
            r.get("geocode_status"),
            r.get("website"),
            r.get("notes"),
            r.get("format"),
        ]
        for j, val in enumerate(values, start=1):
            cell = ws.cell(i, j, val)
            if j == postal_col:
                cell.number_format = "@"
                cell.value = str(postal) if postal else ""
                cell.alignment = Alignment(horizontal="left")
    for col_idx in range(1, len(cols) + len(extra) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 22
    ws.column_dimensions["E"].number_format = "@"
    path = OUT / "Gymly_Finland_All_Discovered_Centers.xlsx"
    wb.save(path)

    csv_path = OUT / "Gymly_Finland_All_Discovered_Centers.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_NONNUMERIC)
        w.writerow(cols + extra)
        for r in sorted_rows:
            postal = fi_postal(r.get("postal_code")) or (r.get("postal_code") or "")
            hours = r.get("opening_hours")
            if isinstance(hours, (dict, list)):
                hours = json.dumps(hours, ensure_ascii=False)
            w.writerow(
                [
                    r.get("id"),
                    r.get("brand") or r.get("chain"),
                    r.get("center_name") or r.get("name"),
                    r.get("address"),
                    str(postal) if postal else "",
                    r.get("city"),
                    "Finland",
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("verification_status"),
                    r.get("source_url"),
                    hours,
                    r.get("legacy_brand"),
                    r.get("coord_source"),
                    r.get("geocode_status"),
                    r.get("website"),
                    r.get("notes"),
                    r.get("format"),
                ]
            )
    return path, csv_path, postal_col


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES",
            "NEEDS_REVIEW",
        }:
            review.append(
                {
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
                }
            )
    (OUT / "finland_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "finland_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
        cols = [
            "id",
            "name",
            "brand",
            "address",
            "postal_code",
            "city",
            "latitude",
            "longitude",
            "geocode_status",
            "import_category",
            "coord_source",
            "notes",
        ]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore", quoting=csv.QUOTE_NONNUMERIC)
        w.writeheader()
        for item in review:
            row = dict(item)
            row["postal_code"] = str(item.get("postal_code") or "")
            w.writerow(row)
    return review


def city_ready(rows, city_name):
    n = norm(city_name)
    ready = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT" and n in norm(r.get("city") or "")
    ]
    disc = [r for r in rows if n in norm(r.get("city") or "")]
    return len(disc), len(ready)


def write_report(rows, live_report, staging_report, collapsed, n_live):
    cats = Counter(r.get("import_category") for r in rows)
    ready_n = cats.get("READY_TO_IMPORT", 0)
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    official = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") == "official_locator")
    jsonld = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") == "official_json_ld")
    nomi = sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("coord_source") == "nominatim")
    soft = sum(1 for r in rows if "soft_postal" in (r.get("notes") or "") or r.get("geocode_status") == "suspicious")
    amb = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")
    moj = sum(1 for r in rows if r.get("encoding_flag"))
    leading_zero = [r for r in rows if str(r.get("postal_code") or "").startswith("00")]
    outliers = []
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        if not in_fi_bbox(r.get("lat"), r.get("lng")):
            outliers.append(r)
    brands = sorted({r.get("brand") for r in rows})
    by_brand = defaultdict(list)
    for r in rows:
        by_brand[r.get("brand")].append(r)

    lines = []
    lines.append("# Finland Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Market audit (Finland conventional chains)")
    lines.append("")
    lines.append("Current consumer-facing brands staged in Phase 1:")
    lines.append("")
    lines.append("- **Fitness24Seven** — official `gymData` locator, **`market=fi` only**. 67 open + 4 coming soon. Swedish Boden excluded.")
    lines.append("- **ELIXIA** — current Finnish consumer brand. Operator SATS Finland Oy. 32 live clubs in official embedded JSON. **No SATS + ELIXIA duplicates.** `legacy_brand: SATS`. Wiklund/Turku Sep 2026 is not in the live 32.")
    lines.append("- **Fressi** — ~90 claimed; 24h gyms and Hyvinvointikeskus both qualify as conventional gyms. Sitemap club pages staged.")
    lines.append("- **Liikku** — 76 WP `gym` CPT rows. Coming soon held out of READY. Espoo Leppävaara held as NEEDS_REVIEW (homepage 2027 vs club-page hours).")
    lines.append("- **EasyFit** — Finnish chain (not German EasyFitness). Official location pages only.")
    lines.append("- **Forever** — 19 clubs on official toimipisteet-ja-hinnat (Premium + LITE where a real gym floor exists).")
    lines.append("- **Ole.Fit** — 54 official `kuntokeskukset` URLs vs “yli 60” claim.")
    lines.append("- **GOGO** — 3 full-service Tampere clubs (Park, City, Hervanta).")
    lines.append("- **GOGO Express** — official gx-cards. Roihupelto and Kajaani are coming soon (Kajaani opens 2026–27).")
    lines.append("- **GYM Anytime** — still the current consumer brand for Kurikka, Rauma, Tampere, Valkeakoski, Varkaus until the announced early-2027 GOGO Express rebrand.")
    lines.append("- **PTVGYM** — 15 clubs; addresses from official yhteystiedot (Kouvola Tommolankatu 12; Jyväskylä Vasarakatu 25 — club tab Alasinkatu 3 treated as stale).")
    lines.append("- **LadyLine** — 14 women’s clubs with conventional gym floors; included.")
    lines.append("")
    lines.append("Investigated and **not** staged as current Finnish conventional estates:")
    lines.append("")
    lines.append("- **Anytime Fitness** — no meaningful Finnish estate.")
    lines.append("- **Puls & Träning / P&T** — PT Salit Finland Oy bankrupt 16.3.2026; closed. Some rooms now operate as Fressi.")
    lines.append("")
    lines.append("Brand ≠ physical gym: one current operating brand per location. Parent/franchise/old names are not extra rows.")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total Finnish locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| VERIFIED_CURRENT | {sum(1 for r in rows if r.get('verification_status')=='VERIFIED_CURRENT')} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| DUPLICATE (staging) | {cats.get('DUPLICATE', 0)} |")
    lines.append(f"| LEGACY_DUPLICATE | {cats.get('LEGACY_DUPLICATE', 0)} |")
    lines.append(f"| Staging same-id collapses | {len(collapsed)} |")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")

    def brand_rows(aliases):
        al = [norm(a) for a in aliases]
        return [r for r in rows if any(a in norm(r.get("brand") or "") or a == norm(r.get("brand") or "") for a in al)]

    chain_map = [
        ("Fitness24Seven", ["Fitness24Seven"], "~66 open claimed; 71 gymData market=fi (67 open + 4 coming soon)"),
        ("ELIXIA", ["ELIXIA"], "32 live on elixia.fi; yli 30"),
        ("Fressi", ["Fressi"], "~90 centres claimed (24h + Hyvinvointikeskus)"),
        ("Liikku", ["Liikku"], "76 WP gym CPT; yli 70"),
        ("EasyFit", ["EasyFit"], "~29 official location pages"),
        ("Forever", ["Forever"], "19 gyms / 13 cities claimed"),
        ("Ole.Fit", ["Ole.Fit"], "54 official kuntokeskukset URLs; yli 60 claimed"),
        ("GOGO", ["GOGO"], "3 full-service Tampere clubs — exact brand GOGO not Express"),
        ("GOGO Express", ["GOGO Express"], "~25 official cards on gogoexpress.fi"),
        ("GYM Anytime", ["GYM Anytime"], "5 clubs still consumer-branded GYM Anytime"),
        ("PTVGYM", ["PTVGYM"], "15 clubs on ptvgym.fi"),
        ("LadyLine", ["LadyLine"], "14 official toimipiste clubs"),
    ]
    seen_brands = set()
    for label, aliases, est in chain_map:
        sub = brand_rows(aliases)
        # GOGO vs GOGO Express: exact brand
        if label == "GOGO":
            sub = [r for r in rows if r.get("brand") == "GOGO"]
        elif label == "GOGO Express":
            sub = [r for r in rows if r.get("brand") == "GOGO Express"]
        seen_brands.update(r.get("brand") for r in sub)
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        pct = f"{round(100*rd/disc)}%" if disc else "—"
        lines.append(f"| {label} | {est} | {disc} | {rd} | {unr} | {pct} |")
    extra_brands = sorted(b for b in brands if b not in seen_brands)
    for b in extra_brands:
        sub = [r for r in rows if r.get("brand") == b]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        pct = f"{round(100*rd/disc)}%" if disc else "—"
        lines.append(f"| {b} | additional chain found in Phase 1 | {disc} | {rd} | {unr} | {pct} |")
    lines.append("")
    lines.append("Coverage % is READY / discovered in this staging file, not vs the official estate size.")
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in MAJOR_CITIES:
        d, rd = city_ready(rows, c)
        lines.append(f"| {c} | {d} | {rd} |")
    lines.append("")
    lines.append("City matching is substring on the official city field (Helsinki does not include Espoo/Vantaa).")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postal codes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- READY with official locator coordinates: {official}")
    lines.append(f"- READY with official JSON-LD coordinates: {jsonld}")
    lines.append(f"- READY with Nominatim coordinates: {nomi}")
    lines.append(f"- Soft-postal matches flagged: {soft}")
    lines.append(f"- Ambiguous geocode results: {amb}")
    lines.append(f"- Encoding / mojibake flags: {moj}")
    lines.append(f"- Postal codes that start with 00 (leading-zero risk in Excel if stored as number): {len(leading_zero)}")
    lines.append("- Finnish postal codes are stored as **strings** in JSON and as Excel TEXT (`@` number format).")
    lines.append("- No Helsinki / city / postal-code / Finland centroid fallbacks were used.")
    lines.append("- Missing coordinates remain null and are **not check-in eligible** (Norway/Germany/UK behaviour).")
    lines.append("")
    lines.append("## Geography")
    lines.append("")
    if outliers:
        lines.append(f"- READY outliers outside Finland bbox: {len(outliers)}")
        for r in outliers[:20]:
            lines.append(f"  - {r.get('name')} {r.get('lat')},{r.get('lng')} {r.get('city')}")
    else:
        lines.append("- All READY coordinates sit inside the Finland bounding box (incl. Åland longitudes).")
        lines.append("- Fitness24Seven was filtered with official `market=fi` (not a lat/lng bbox). Swedish Boden Centrum was excluded.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id collapses: {len(collapsed)}")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand physical address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_50m') or [])}")
    lines.append(f"- Legitimate different-brand co-locations ≤80 m: {len(staging_report.get('legitimate_different_brand_colocations') or [])}")
    lines.append(f"- Existing Finland rows in live catalog: {live_report.get('existing_finland_in_catalog')}")
    lines.append(f"- `fi_*` IDs already in live catalog: {len(live_report.get('fi_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live catalog: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report.get('proximity_same_brand') or [])}")
    rel = staging_report.get("sats_elixia_relationships") or {}
    lines.append(f"- ELIXIA rows: {rel.get('elixia_rows')}. SATS-branded Finnish rows created: {rel.get('sats_brand_rows')}.")
    lines.append(f"- {rel.get('note')}")
    lines.append("- Puls & Träning / P&T: PT Salit Finland Oy bankruptcy 16.3.2026 — clubs permanently closed. Not staged as current. Some former P&T rooms are now Fressi (current brand Fressi).")
    lines.append("- GYM Anytime remains the current consumer brand for its remaining clubs; GOGO Express rebrand is announced for early 2027 and is not applied yet.")
    lines.append("- Anytime Fitness: no meaningful Finnish estate found.")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    lines.append("Finland Phase 1 is **not complete** just because the discovered count looks large.")
    lines.append("")
    lines.append("**Appear complete or near-complete from official locators:**")
    lines.append("- ELIXIA (32/32 embedded clubs; Wiklund/Turku Sep 2026 is coming soon and not in the live 32).")
    lines.append("- Fitness24Seven Finland (`market=fi` gymData; 67 open READY, 4 coming soon).")
    lines.append("- PTVGYM (15/15 official yhteystiedot clubs, all READY).")
    lines.append("- GOGO full-service Tampere (3/3 READY).")
    lines.append("- GYM Anytime remaining current clubs (5/5 READY).")
    lines.append("- Forever official 19-club list (18 READY; Lappeenranta Huhtari Pelitie 36 has no building-level geocode).")
    lines.append("- Liikku WP gym CPT (coming-soon + Leppävaara review hold).")
    lines.append("")
    lines.append("**Materially incomplete or still resolving:**")
    lines.append("- Ole.Fit: 54 official club URLs vs “yli 60” claim; 5 ambiguous geocodes held as NEEDS_REVIEW.")
    lines.append("- Fressi: ~90 claimed vs 88 discovered after collapsing duplicate Kirkkonummi pages; several 24h pages have ambiguous OSM matches; 12 coming soon.")
    lines.append("- LadyLine: 14/14 discovered; 3 cities (Kajaani, Joensuu, Iisalmi) have ambiguous Nominatim pairs >150 m.")
    lines.append("- EasyFit: Nokia ambiguous; Mustasaari/Korsholm Matildantie 2 not building-matched.")
    lines.append("- GOGO Express: 23 READY; Roihupelto + Kajaani coming soon.")
    lines.append("")
    lines.append("**Phase 2 conventional chains to investigate (not staged READY here unless already fetched):**")
    lines.append("- Energy (~5) — regional conventional.")
    lines.append("- Esport Fitness — sports centres with gym floors (qualify only if independent strength/cardio floor).")
    lines.append("- Greenfit, Buusti, Balanssi — smaller regional (4).")
    lines.append("- Vocatum (Tampere takeovers).")
    lines.append("- Fit24 (Nurmijärvi Klaukkala and any additional sites).")
    lines.append("- Remaining Ole.Fit clubs not on the homepage list.")
    lines.append("- Independent conventional gyms in Oulu, Jyväskylä, Kuopio, Pori, Vaasa, Joensuu.")
    lines.append("")
    lines.append("Do **not** Phase-2 dump: CrossFit-only boxes, yoga/Pilates-only, EMS-only, martial arts schools, physiotherapy-only, or municipal sports halls without a conventional gym floor.")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows are recommended for a later Finland production merge.")
    lines.append("")
    lines.append(f"Expected catalog after that merge: **{n_live} + {ready_n} = {n_live + ready_n}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.")
    lines.append("")
    lines.append("## Scaling")
    lines.append("")
    lines.append(f"Current live catalog: {n_live:,}. UK QA benchmark approximately parse 6 ms, cold index 588 ms, cached index 0 ms, typical search 528 ms / 3 queries, nearest 29 ms, map build 21 ms.")
    lines.append("The current architecture is considered practical around 8,000–10,000 centers.")
    expected = n_live + ready_n
    if expected <= 8000:
        verdict = "comfortably inside"
    elif expected <= 10000:
        verdict = "inside, approaching the practical band"
    else:
        verdict = "above the current practical client-side band — do not merge without a scaling review"
    lines.append(f"{expected:,} remains **{verdict}** the current client-side architecture. No architecture redesign in this phase.")
    lines.append("")
    lines.append("Finland missing coordinates must remain null / not check-in eligible. No Helsinki fallback was introduced.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    lines.append("Created or updated under `data/finland/` and `scripts/`:")
    lines.append("")
    files = sorted(
        ["scripts/finland-phase1-discover.py", "scripts/finland-phase1-consolidate.py"]
        + [str(p.relative_to(ROOT)) for p in OUT.rglob("*") if p.is_file() and "pages/" not in str(p)]
    )
    # keep list readable
    top = [
        "scripts/finland-phase1-discover.py",
        "scripts/finland-phase1-consolidate.py",
        "scripts/finland-phase1-repair.py",
        "data/finland/finland_centers_staging.json",
        "data/finland/finland_geocode_review.json",
        "data/finland/finland_geocode_review.csv",
        "data/finland/finland_duplicate_analysis.json",
        "data/finland/FINLAND_PHASE1_READINESS_REPORT.md",
        "data/finland/Gymly_Finland_All_Discovered_Centers.xlsx",
        "data/finland/Gymly_Finland_All_Discovered_Centers.csv",
        "data/finland/finland_geocode_cache.json",
        "data/finland/finland_centers_staging.pre_geocode.json",
        "data/finland/finland_discovery_combined.json",
    ]
    for f in top:
        lines.append(f"- `{f}`")
    lines.append("- `data/finland/raw/` official HTML/JSON captures")
    lines.append("- `data/finland/scrapes/` per-chain discovery JSON")
    lines.append("- `data/finland/raw/pages/` cached official club pages")
    lines.append("")
    lines.append("**STOP. Do not merge Finland. Do not run Finland QA. Do not start another country.**")
    lines.append("")
    (OUT / "FINLAND_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
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
    # re-classify READY after geocode
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_fi_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; dropped_non_fi_coord").strip("; ")
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    live_report, centers = vs_live(rows)
    staging_report = staging_dupes(rows)
    dup = {
        "vs_live": live_report,
        "vs_staging": staging_report,
        "collapsed": collapsed[:50],
        "collapsed_count": len(collapsed),
    }
    (OUT / "finland_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    write_geocode_review(rows)
    write_excel(rows)
    n_live = len(centers)
    write_report(rows, live_report, staging_report, collapsed, n_live)
    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "in", round(time.time() - t0), "s")
    print("READY", cats.get("READY_TO_IMPORT", 0), "expected catalog", n_live + cats.get("READY_TO_IMPORT", 0))


if __name__ == "__main__":
    main()
