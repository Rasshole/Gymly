#!/usr/bin/env python3
"""
Consolidate UK scrapes → staging, geocode missing coords (Nominatim countrycodes=gb),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json. No fallback / postcode-centroid coordinates.
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "uk_centers_staging.json"
PRE = OUT / "uk_centers_staging.pre_geocode.json"
CACHE = OUT / "uk_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyUKGeocoder/1.0 (catalog research; accuracy over coverage)"
UK_BOUNDS = (49.80, 60.90, -8.20, 1.80)

SCOTLAND_OUT = tuple("AB DD EH FK G HS IV KA KW KY ML PA PH TD ZE".split())
WALES_OUT = tuple("CF LD LL NP SA SY".split())  # SY also English border; treat SY as Wales-leaning, refine later
NI_OUT = ("BT",)


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (source_url or "").strip().lower(),
                "united kingdom",
            ]
        )
    else:
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (address or "").strip().lower(),
                (postal or "").strip().lower(),
                (city or "").strip().lower(),
                "united kingdom",
            ]
        )
    return "gb_" + hashlib.md5(key.encode()).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def constituent_country(postal: str, city: str = "") -> str:
    out = (postal or "").upper().split(" ")[0]
    letters = re.sub(r"\d.*", "", out)
    if letters == "BT":
        return "Northern Ireland"
    if letters in SCOTLAND_OUT or letters.startswith("AB") or letters in {"G", "EH", "DD", "FK", "KA", "KY", "ML", "PA", "PH", "TD", "IV", "KW", "HS", "ZE"}:
        return "Scotland"
    # Wales: CF LD LL NP SA; SY mixed — use city hints
    if letters in {"CF", "LD", "LL", "NP", "SA"}:
        return "Wales"
    if letters == "SY":
        city_n = (city or "").lower()
        if any(x in city_n for x in ["wrexham", "welshpool", "newtown", "aberystwyth", "llandrindod"]):
            return "Wales"
        return "England"
    return "England"


def load_scrapes():
    rows = []
    if PRE.exists():
        rows.extend(json.loads(PRE.read_text(encoding="utf-8")))
    else:
        for p in sorted(SCRAPES.glob("*_uk.json")):
            extra = json.loads(p.read_text(encoding="utf-8"))
            print("load", p.name, len(extra))
            rows.extend(extra)
    for r in rows:
        if not r.get("id"):
            r["id"] = make_id(
                r.get("brand"),
                r.get("address"),
                r.get("postal_code"),
                r.get("city"),
                r.get("source_url") or "",
            )
        r["country"] = "United Kingdom"
        if r.get("postal_code") and not r.get("constituent_country"):
            r["constituent_country"] = constituent_country(r.get("postal_code"), r.get("city") or "")
    return rows


def dedupe(rows):
    by_id = {}
    amb = []
    for r in rows:
        rid = r["id"]
        if rid in by_id:
            old = by_id[rid]
            score = lambda x: (
                1 if x.get("lat") is not None else 0,
                1 if x.get("address") else 0,
                1 if x.get("postal_code") else 0,
                len(x.get("address") or ""),
            )
            if score(r) > score(old):
                amb.append({"reason": "same_id_replaced", "kept": r.get("name"), "dropped": old.get("name")})
                by_id[rid] = r
            else:
                amb.append({"reason": "same_id_kept_existing", "kept": old.get("name"), "dropped": r.get("name")})
            continue
        by_id[rid] = r

    keep = list(by_id.values())
    by_key = {}
    final = []
    for r in keep:
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in by_key:
            amb.append({"reason": "same_brand_address", "a": by_key[key].get("name"), "b": r.get("name")})
            continue
        if key[1]:
            by_key[key] = r
        final.append(r)

    # proximity same-brand within staging
    with_coords = [r for r in final if r.get("lat") is not None and r.get("lng") is not None]
    drop_ids = set()
    for i, a in enumerate(with_coords):
        if a["id"] in drop_ids:
            continue
        for b in with_coords[i + 1 :]:
            if b["id"] in drop_ids:
                continue
            if norm(a.get("brand")) != norm(b.get("brand")):
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d <= 40:
                amb.append(
                    {
                        "reason": "staging_proximity_same_brand",
                        "a": a.get("name"),
                        "b": b.get("name"),
                        "distance_m": round(d),
                    }
                )
                # keep the one with fuller address
                loser = a if len(a.get("address") or "") < len(b.get("address") or "") else b
                drop_ids.add(loser["id"])
    final = [r for r in final if r["id"] not in drop_ids]
    return final, amb


def classify(r):
    notes = r.get("notes") or ""
    if "crown_dependency" in notes:
        r["import_category"] = "NEEDS_REVIEW"
        r["lat"] = r["lng"] = None
        return r
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        return r
    if r.get("verification_status") == "NEEDS_REVIEW":
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if math.isfinite(lat) and math.isfinite(lng) and not (lat == 0 and lng == 0):
                lo, hi, w, e = UK_BOUNDS
                if lo <= lat <= hi and w <= lng <= e:
                    r["import_category"] = "READY_TO_IMPORT"
                    r["lat"], r["lng"] = lat, lng
                    return r
                r["notes"] = ((r.get("notes") or "") + "; coord_outside_uk_bbox").strip("; ")
                r["lat"] = r["lng"] = None
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
            "countrycodes": "gb",
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
    lo, hi, w, e = UK_BOUNDS
    if not (lo <= lat <= hi and w <= lng <= e):
        return None, ["outside_uk"], lat, lng

    t = (item.get("type") or item.get("class") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {"house", "building", "yes", "retail", "commercial", "industrial", "gym", "fitness_centre", "sports_centre"}:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng

    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc.upper())
    postal_n = re.sub(r"\s+", "", (postal or "").upper())
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
    if city_n and (city_n in city_fields or city_n in display):
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    if road and street_n and (road in street_n or street_n in display or any(tok and tok in road for tok in street_n.split() if len(tok) > 4)):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", street.lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {"gym", "fitness_centre", "sports_centre", "yes", "retail"}:
        score += 2
        reasons.append("building_or_amenity")

    # Must not accept postcode/city-only. Require a street-level or building hit.
    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if "postal_exact" not in reasons and "postal_soft" in reasons and "road_match" not in reasons:
        return None, reasons + ["soft_postal_without_road"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    queries = [
        f"{street}, {postal}, United Kingdom",
        f"{street}, {city}, {postal}, United Kingdom",
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
                return r
        soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "suspicious" if soft else "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        if soft:
            r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
            # still READY but flagged suspicious — user asked to report soft matches.
            # Keep READY only if road+building also matched.
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
    live_uk = [c for c in centers if c.get("country") == "United Kingdom"]
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers
        if c.get("address")
    }
    report = {
        "existing_uk_in_catalog": len(live_uk),
        "live_catalog_total": len(centers),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "same_address_different_brand": [],
        "gb_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("gb_")],
    }
    live_by_postcode = defaultdict(list)
    for c in centers:
        if c.get("postal_code"):
            live_by_postcode[re.sub(r"\s+", "", str(c["postal_code"]).upper())].append(c)

    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append(
                {"staging": r.get("name"), "live": live_addr[key].get("name"), "id": r["id"]}
            )
        pc = re.sub(r"\s+", "", str(r.get("postal_code") or "").upper())
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


def write_excel(rows):
    cols = [
        "id",
        "brand",
        "name",
        "center_name",
        "address",
        "postal_code",
        "city",
        "country",
        "constituent_country",
        "latitude",
        "longitude",
        "import_category",
        "verification_status",
        "geocode_status",
        "coord_source",
        "source_url",
        "website",
        "opening_hours",
        "legacy_brand",
        "notes",
    ]
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
    ws.title = "UK Discovered"
    ws.append(cols)
    for r in sorted_rows:
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
                r.get("center_name"),
                r.get("address"),
                r.get("postal_code"),
                r.get("city"),
                r.get("country"),
                r.get("constituent_country"),
                r.get("lat"),
                r.get("lng"),
                r.get("import_category"),
                r.get("verification_status"),
                r.get("geocode_status"),
                r.get("coord_source"),
                r.get("source_url"),
                r.get("website"),
                json.dumps(r.get("opening_hours"), ensure_ascii=False)
                if isinstance(r.get("opening_hours"), (dict, list))
                else r.get("opening_hours"),
                r.get("legacy_brand"),
                r.get("notes"),
            ]
        )
    path = OUT / "Gymly_UK_All_Discovered_Centers.xlsx"
    wb.save(path)
    csv_path = OUT / "Gymly_UK_All_Discovered_Centers.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in sorted_rows:
            w.writerow(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
                    r.get("center_name"),
                    r.get("address"),
                    r.get("postal_code"),
                    r.get("city"),
                    r.get("country"),
                    r.get("constituent_country"),
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("verification_status"),
                    r.get("geocode_status"),
                    r.get("coord_source"),
                    r.get("source_url"),
                    r.get("website"),
                    r.get("opening_hours")
                    if not isinstance(r.get("opening_hours"), (dict, list))
                    else json.dumps(r.get("opening_hours"), ensure_ascii=False),
                    r.get("legacy_brand"),
                    r.get("notes"),
                ]
            )
    return path, csv_path


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
    (OUT / "uk_geocode_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "uk_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
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
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for item in review:
            w.writerow(item)
    return review


OFFICIAL_ESTIMATES = {
    "PureGym": "~410 YE2024 corporate; listing had 494 gym URLs",
    "The Gym Group": "264 open as of 30 Jun 2026 (company)",
    "JD Gyms": "113 gym URLs on official sitemap / 'over 100'",
    "David Lloyd": "149 UK+Europe on site; UK-only subset",
    "Nuffield Health": "~110–111 fitness & wellbeing gyms",
    "Anytime Fitness": "~180–189 UK clubs (franchise); Ireland excluded",
    "Energie Fitness": "~60 UK+IE combined; UK-only subset",
    "Bannatyne": "~68 health clubs",
    "Fitness First": "24 UK clubs on official finder (Jersey excluded)",
    "Snap Fitness": "~105 UK (100th club Aug 2025; Ireland mixed in some counts)",
    "Everlast Gyms": "~60 UK+IE; official website timed out",
    "Buzz Gym": "8 open + 3 coming soon on official site",
}


def write_report(rows, amb, live_report, centers, geocode_n):
    cats = Counter(r.get("import_category") for r in rows)
    brands = Counter(r.get("brand") for r in rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    geo_cc = Counter((r.get("constituent_country") or "Unknown") for r in ready)
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    official_coords = sum(1 for r in ready if str(r.get("coord_source") or "").startswith("official"))
    nominatim_coords = sum(1 for r in ready if r.get("coord_source") == "nominatim")
    soft = sum(1 for r in rows if "soft_postal" in (r.get("notes") or "") or r.get("geocode_status") == "suspicious")
    amb_geo = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")

    live_total = live_report["live_catalog_total"]
    proposed = len(ready)
    expected = live_total + proposed

    lines = []
    lines.append("# UK Phase 1 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: DISCOVERY COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"| Metric | Count |")
    lines.append(f"|---|---:|")
    lines.append(f"| Total UK locations discovered (after staging dedupe) | {len(rows)} |")
    lines.append(f"| VERIFIED_CURRENT | {sum(1 for r in rows if r.get('verification_status')=='VERIFIED_CURRENT')} |")
    lines.append(f"| Successfully geocoded / official coords present | {sum(1 for r in rows if r.get('lat') is not None)} |")
    lines.append(f"| READY_TO_IMPORT | {cats.get('READY_TO_IMPORT', 0)} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| Staging duplicates / same-id collapses | {len(amb)} |")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for brand, est in OFFICIAL_ESTIMATES.items():
        subset = [r for r in rows if r.get("brand") == brand]
        rdy = sum(1 for r in subset if r.get("import_category") == "READY_TO_IMPORT")
        unresolved = len(subset) - rdy
        # coverage vs discovered ready / max(discovered, parsed estimate number if any)
        cov = f"{(100 * rdy / len(subset)):.0f}%" if subset else "n/a"
        lines.append(f"| {brand} | {est} | {len(subset)} | {rdy} | {unresolved} | {cov} |")
    extra = sorted(set(brands) - set(OFFICIAL_ESTIMATES))
    for brand in extra:
        subset = [r for r in rows if r.get("brand") == brand]
        rdy = sum(1 for r in subset if r.get("import_category") == "READY_TO_IMPORT")
        lines.append(f"| {brand} | additional | {len(subset)} | {rdy} | {len(subset)-rdy} | {(100*rdy/len(subset)):.0f}% |")
    lines.append("")
    lines.append("Coverage % is READY / discovered in this staging file, not vs the official estate size.")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postcodes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- READY with official coordinates: {official_coords}")
    lines.append(f"- READY with Nominatim coordinates: {nominatim_coords}")
    lines.append(f"- Soft-postcode matches flagged: {soft}")
    lines.append(f"- Ambiguous geocode results: {amb_geo}")
    lines.append(f"- Nominatim lookups attempted this run: {geocode_n}")
    lines.append("- Foreign / non-UK exclusions: Republic of Ireland (Energie + Anytime slug filter), David Lloyd non-GB clubs, Fitness First Jersey, crown-dependency postcodes (GY/JE/IM).")
    lines.append("- No London / country / postcode / city-centroid fallbacks were used.")
    lines.append("")
    lines.append("## Geography (READY only)")
    lines.append("")
    for k, v in sorted(geo_cc.items(), key=lambda kv: -kv[1]):
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("Constituent country is derived from UK postcode outward code (SY treated as England unless the city is a known Welsh SY town). This is staging-only and was not added to the production schema.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id / same-brand-address / proximity collapses: {len(amb)}")
    lines.append(f"- Existing UK rows in live catalog: {live_report['existing_uk_in_catalog']}")
    lines.append(f"- `gb_*` IDs already in live catalog: {len(live_report['gb_prefix_already_used'])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report['id_collisions'])}")
    lines.append(f"- Same brand+address matches vs live catalog: {len(live_report['same_brand_address_matches'])}")
    lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report['proximity_same_brand'])}")
    lines.append(f"- Same address, different brand vs live catalog: {len(live_report['same_address_different_brand'])}")
    lines.append("- Everlast Gyms rows use legacy_brand `DW Sports Fitness` where applicable; current brand is Everlast Gyms.")
    lines.append("- Fitness First Jersey was discovered on the official UK finder and excluded as a Channel Island location.")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    lines.append("UK Phase 1 is **not complete** just because the discovered count is large.")
    lines.append("")
    lines.append("- **Mostly READY from official pages + coordinates:** PureGym (JSON-LD geo; 38 coming-soon held out). The Gym Group (253 club pages parsed vs 264 company open; 20 East-Anglia sitemap URLs currently HTTP 500). Nuffield Health (gym sitemap after dropping marketing URLs).")
    lines.append("- **Official lists are in hand, but mostly not READY:** Nominatim could not confirm a building/street, and postcode centroids were rejected. JD Gyms, David Lloyd (UK-filtered), Bannatyne, Fitness First UK, Snap Fitness, Buzz Gym, Energie UK. Most of these already have addresses; they need a later coordinate pass, not a re-scrape.")
    lines.append("- **Materially incomplete:** Anytime Fitness (official en-gb sitemap URLs; Incapsula blocked club pages). Everlast Gyms (everlastgyms.com timed out; names only from the official membership selector). The Gym Group HTTP 500 club pages.")
    lines.append("")
    lines.append("## Additional chains (Phase 2)")
    lines.append("")
    lines.append("Meaningful conventional chains to consider next, not staged as READY here unless already fetched:")
    lines.append("")
    lines.append("- **Everlast Gyms** — retry when the official site responds; ~60 UK+IE, filter Ireland.")
    lines.append("- **Anytime Fitness** — retry club pages or an official unblocked locator payload; ~180 UK.")
    lines.append("- **Village Gym / Village Hotels** — hotel-attached gyms with conventional floors.")
    lines.append("- **Total Fitness** — regional multi-site operator.")
    lines.append("- **Gymbox** — London conventional/hybrid clubs (~10).")
    lines.append("- **Third Space** — premium clubs with full gym floors (small set).")
    lines.append("- **EasyGym / Fitness4Less** — budget conventional if still operating at 5+ sites.")
    lines.append("- **Virgin Active UK** — historically large; confirm current operating estate before scraping.")
    lines.append("")
    lines.append("Do **not** Phase-2 dump: CrossFit boxes, boutique cycling, yoga studios, martial arts schools, or council leisure (Better / GLL / Places Leisure / Serco) without a separate product decision.")
    lines.append("")
    lines.append("## Proposed first merge")
    lines.append("")
    lines.append(f"**{proposed}** READY_TO_IMPORT rows are recommended for a later UK production merge.")
    lines.append("")
    lines.append(f"Expected catalog after that merge: **{live_total} + {proposed} = {expected}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and name-only Everlast/Anytime rows must stay out.")
    lines.append("")
    lines.append("## Scaling")
    lines.append("")
    lines.append("Current live catalog: 2,952. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.")
    if expected <= 8000:
        lines.append(f"{expected} remains **comfortably inside** the current client-side architecture. No server directory migration is required for this UK merge.")
    elif expected <= 10000:
        lines.append(f"{expected} is still inside the 8–10k comfort band, but closer to the planning threshold. Do not migrate in this task.")
    else:
        lines.append(f"{expected} approaches or exceeds the 10k planning threshold. Still do not migrate in this task; reassess before merge.")
    lines.append("")
    lines.append("UK missing coordinates must remain NaN / not check-in eligible. No London fallback was introduced.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    lines.append("Created or updated under `data/uk/` and `scripts/`:")
    lines.append("")
    lines.append("- `scripts/uk-phase1-discover.py`")
    lines.append("- `scripts/uk-phase1-consolidate.py`")
    lines.append("- `data/uk/uk_centers_staging.json`")
    lines.append("- `data/uk/uk_centers_staging.pre_geocode.json`")
    lines.append("- `data/uk/uk_geocode_review.json`")
    lines.append("- `data/uk/uk_geocode_review.csv`")
    lines.append("- `data/uk/uk_duplicate_analysis.json`")
    lines.append("- `data/uk/uk_discovery_notes.json`")
    lines.append("- `data/uk/UK_PHASE1_READINESS_REPORT.md`")
    lines.append("- `data/uk/Gymly_UK_All_Discovered_Centers.xlsx`")
    lines.append("- `data/uk/Gymly_UK_All_Discovered_Centers.csv`")
    lines.append("- `data/uk/scrapes/*_uk.json`")
    lines.append("- `data/uk/raw/` official HTML/sitemaps and cached club pages")
    lines.append("")
    lines.append("Not modified: `src/data/centers.json`, check-in radius, auto-checkout, workout logging, PR logic, feed, localization, global center architecture.")
    lines.append("")
    lines.append("## Stop")
    lines.append("")
    lines.append("UK Phase 1 stops here. Do not merge UK. Do not run UK QA. Do not start another country.")
    text = "\n".join(lines) + "\n"
    (OUT / "UK_PHASE1_READINESS_REPORT.md").write_text(text, encoding="utf-8")
    return text


def main():
    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    rows = load_scrapes()
    print("loaded raw", len(rows))
    rows, amb = dedupe(rows)
    rows = [classify(r) for r in rows]
    print("deduped", len(rows), Counter(r["import_category"] for r in rows))
    print("brands", Counter(r["brand"] for r in rows))

    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
    ]
    print("geocode todo", len(todo))
    for i, r in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {str(r.get('name') or '')[:60]}")
        geocode_row(r, cache)
        if i % 20 == 19:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    rows = [classify(r) for r in rows]
    live_report, centers = vs_live(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    dup = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "staging_collapses": amb,
        "vs_live": live_report,
        "staging_counts": dict(Counter(r.get("import_category") for r in rows)),
        "brand_counts": dict(Counter(r.get("brand") for r in rows)),
    }
    (OUT / "uk_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    write_geocode_review(rows)
    write_excel(rows)
    write_report(rows, amb, live_report, centers, len(todo))
    print("READY", sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT"))
    print("wrote", STAGING)


if __name__ == "__main__":
    main()
