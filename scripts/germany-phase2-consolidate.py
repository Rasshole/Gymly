#!/usr/bin/env python3
"""
Germany Phase 2 consolidate: merge Phase 2 scrapes into staging, geocode,
duplicate analysis vs live catalog, readiness report.

Does NOT modify src/data/centers.json.
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
OUT = ROOT / "data/germany"
SCRAPES = OUT / "scrapes"
PHASE2 = OUT / "phase2"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "germany_centers_staging.json"
PHASE1_SNAPSHOT = PHASE2 / "phase1_staging_snapshot_counts.json"

ctx = ssl.create_default_context()
UA = "GymlyGermanyGeocoder/2.0 (catalog research)"
DE_BOUNDS = (47.0, 55.5, 5.5, 15.5)

# Approximate official / current German counts for coverage table
OFFICIAL_EST = {
    "clever fit": 400,
    "McFIT": 200,
    "FitX": 112,  # sitemap count used as official proxy after Phase 2
    "EASYFITNESS": 205,
    "Fitness First": 107,
    "JOHN REED": 40,
    "Gold's Gym": 5,  # Magicline DE-only; prior ~8 included AT/IT
    "all inclusive Fitness": 183,
    "INJOY": 70,  # sitemap DE studios after filters
    "ELBGYM": 0,  # absorbed into Fitness First / LifeFit
    "PRIME TIME fitness": 25,
    "jumpers fitness": 0,
}


def make_id(brand, address, postal, city):
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "germany",
        ]
    )
    return "de_" + hashlib.md5(key.encode()).hexdigest()[:10]


def norm(s):
    s = (s or "").lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def to_float(v):
    try:
        if v is None or v == "":
            return None
        f = float(v)
        return f if abs(f) > 0.01 else None
    except Exception:
        return None


def in_de(lat, lng):
    if lat is None or lng is None:
        return False
    lo, hi, w, e = DE_BOUNDS
    return lo <= lat <= hi and w <= lng <= e


def classify(r):
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    lat, lng = to_float(r.get("lat")), to_float(r.get("lng"))
    if lat is not None and lng is not None and math.isfinite(lat) and math.isfinite(lng):
        if in_de(lat, lng):
            r["lat"], r["lng"] = lat, lng
            r["import_category"] = "READY_TO_IMPORT"
            return r
        r["notes"] = ((r.get("notes") or "") + "; coord_outside_de_bbox").strip("; ")
        r["lat"] = r["lng"] = None
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "FOREIGN_OR_INVALID"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    return r


def load_json(path: Path):
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def is_foreign_name_city(r):
    blob = " ".join(
        [
            str(r.get("name") or ""),
            str(r.get("city") or ""),
            str(r.get("address") or ""),
            str(r.get("website") or ""),
        ]
    ).lower()
    foreign_tokens = (
        "vösendorf",
        "voesendorf",
        "wien",
        "vienna",
        "österreich",
        "austria",
        "zürich",
        "zurich",
        "schweiz",
        "switzerland",
        "salzburg",
        "innsbruck",
        "linz",
    )
    return any(t in blob for t in foreign_tokens)


def merge_staging():
    base = load_json(STAGING)
    phase1_total = len(base)
    phase1_ready = sum(1 for r in base if r.get("import_category") == "READY_TO_IMPORT")
    PHASE2.mkdir(parents=True, exist_ok=True)
    PHASE1_SNAPSHOT.write_text(
        json.dumps(
            {
                "phase1_total": phase1_total,
                "phase1_ready": phase1_ready,
                "by_brand": dict(Counter(r.get("brand") for r in base)),
                "by_category": dict(Counter(r.get("import_category") for r in base)),
            },
            indent=2,
        )
        + "\n"
    )

    # Drop brands we fully replace / refresh
    replace_brands = {"FitX", "INJOY", "ELBGYM", "Gold's Gym"}
    kept = [r for r in base if r.get("brand") not in replace_brands]

    # Drop known foreign / invalid FF
    cleaned = []
    removed = []
    for r in kept:
        if r.get("brand") == "Fitness First" and is_foreign_name_city(r):
            removed.append({"reason": "foreign_fitness_first", "name": r.get("name"), "city": r.get("city")})
            continue
        lat, lng = to_float(r.get("lat")), to_float(r.get("lng"))
        if lat is not None and lng is not None and not in_de(lat, lng):
            removed.append(
                {
                    "reason": "coords_outside_de",
                    "name": r.get("name"),
                    "lat": lat,
                    "lng": lng,
                }
            )
            r = dict(r)
            r["lat"] = r["lng"] = None
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = ((r.get("notes") or "") + "; removed_non_de_coords").strip("; ")
        cleaned.append(r)

    extras = []
    for name in (
        "fitx_germany.json",
        "injoy_germany.json",
        "elbgym_germany.json",
        "golds_germany.json",
    ):
        rows = load_json(SCRAPES / name)
        print("load", name, len(rows))
        extras.extend(rows)

    rows = cleaned + extras
    for r in rows:
        if not r.get("id"):
            r["id"] = make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"))
        r["country"] = "Germany"
        # strip remaining foreign after merge
        if is_foreign_name_city(r) and r.get("brand") in {"Fitness First", "INJOY", "FitX"}:
            removed.append({"reason": "foreign_post_merge", "name": r.get("name"), "brand": r.get("brand")})
            continue
    rows = [
        r
        for r in rows
        if not (
            is_foreign_name_city(r)
            and r.get("brand") in {"Fitness First", "INJOY", "FitX", "Gold's Gym"}
        )
    ]

    # ensure no jumpers brand rows
    jumpers_dropped = [r for r in rows if "jumper" in (r.get("brand") or "").lower()]
    rows = [r for r in rows if "jumper" not in (r.get("brand") or "").lower()]

    PHASE2.joinpath("removed_rows.json").write_text(
        json.dumps(
            {"removed": removed, "jumpers_dropped": [r.get("name") for r in jumpers_dropped]},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    return rows, phase1_total, phase1_ready


def dedupe(rows):
    by_id = {}
    events = []
    for r in rows:
        rid = r["id"]
        if rid in by_id:
            old = by_id[rid]
            score = lambda x: (
                1 if x.get("lat") is not None else 0,
                1 if x.get("address") else 0,
                1 if x.get("phase") == "germany_phase2" else 0,
            )
            if score(r) > score(old):
                events.append({"reason": "same_id_replaced", "kept": r.get("name"), "dropped": old.get("name")})
                by_id[rid] = r
            else:
                events.append({"reason": "same_id_kept", "kept": old.get("name"), "dropped": r.get("name")})
            continue
        by_id[rid] = r

    keep = list(by_id.values())
    by_key = {}
    final = []
    for r in keep:
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in by_key:
            events.append(
                {
                    "reason": "same_brand_address",
                    "a": by_key[key].get("name"),
                    "b": r.get("name"),
                }
            )
            continue
        if key[1]:
            by_key[key] = r
        final.append(r)

    # proximity same brand ≤50m
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
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 50:
                events.append(
                    {
                        "reason": "proximity_same_brand",
                        "a": a.get("name"),
                        "b": b.get("name"),
                        "distance_m": round(d),
                    }
                )
                # keep better filled
                drop_ids.add(b["id"])
    final = [r for r in final if r["id"] not in drop_ids]

    # same-address different-brand (document, do not auto-drop — may be co-located)
    by_addr = defaultdict(list)
    for r in final:
        if not r.get("address"):
            continue
        by_addr[(norm(r.get("address")), str(r.get("postal_code") or ""))].append(r)
    same_addr_diff_brand = []
    for k, group in by_addr.items():
        brands = {norm(x.get("brand")) for x in group}
        if len(brands) > 1:
            same_addr_diff_brand.append(
                {
                    "address": group[0].get("address"),
                    "postal": group[0].get("postal_code"),
                    "names": [x.get("name") for x in group],
                    "brands": [x.get("brand") for x in group],
                }
            )

    return final, events, same_addr_diff_brand


def nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "de",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_de(lat, lng):
        return None, ["outside_de"], lat, lng

    t = (item.get("type") or item.get("class") or "").lower()
    if t in {
        "country",
        "state",
        "county",
        "municipality",
        "city",
        "town",
        "village",
        "administrative",
        "postcode",
    }:
        return None, ["coarse_type:" + t], lat, lng

    pc = str(addr.get("postcode") or "")
    if postal and pc == postal:
        score += 5
        reasons.append("postal_exact")
    elif postal and pc and pc[:3] == postal[:3]:
        score += 1
        reasons.append("postal_soft")

    city_n = norm(city)
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb")
    )
    if city_n and city_n in city_fields:
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    if road and street_n and (road in street_n or street_n in display):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", street.lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")

    if score < 6:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    queries = [
        f"{street}, {postal} {city}, Germany",
        f"{street}, {postal}, Germany",
        f"{street}, {city}, Germany",
    ]
    all_rej = []
    for q in queries:
        try:
            items = nominatim(q)
            time.sleep(1.1)
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
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:5]
    r["lat"] = r["lng"] = None
    return r


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    live_de = [c for c in centers if (c.get("country") or "").lower() in ("germany", "de")]
    all_ids = {c["id"] for c in centers}
    report = {
        "existing_germany_in_catalog": len(live_de),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
        "border_proximity_other_country": [],
    }
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers
        if c.get("address")
    }
    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append(
                {
                    "staging": r.get("name"),
                    "live": live_addr[key].get("name"),
                    "live_country": live_addr[key].get("country"),
                }
            )
        if r.get("lat") is None:
            continue
        for c in centers:
            if c.get("lat") is None or c.get("lng") is None:
                continue
            try:
                d = haversine(float(r["lat"]), float(r["lng"]), float(c["lat"]), float(c["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 50 and norm(c.get("brand")) == norm(r.get("brand")):
                report["proximity_same_brand"].append(
                    {
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "distance_m": round(d),
                        "live_country": c.get("country"),
                    }
                )
            # border check: very close to a non-Germany live center
            live_country = (c.get("country") or "").lower()
            if live_country not in ("germany", "de", "") and d <= 200:
                report["border_proximity_other_country"].append(
                    {
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "live_country": c.get("country"),
                        "distance_m": round(d),
                    }
                )
    return report, centers


def write_excel(rows, path: Path):
    cols = [
        "id",
        "brand",
        "name",
        "center_name",
        "address",
        "postal_code",
        "city",
        "country",
        "latitude",
        "longitude",
        "import_category",
        "verification_status",
        "geocode_status",
        "source_url",
        "website",
        "legacy_brand",
        "notes",
        "phase",
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
    ws.title = "Germany Centers"
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
                r.get("lat"),
                r.get("lng"),
                r.get("import_category"),
                r.get("verification_status"),
                r.get("geocode_status"),
                r.get("source_url"),
                r.get("website"),
                r.get("legacy_brand"),
                r.get("notes"),
                r.get("phase"),
            ]
        )
    wb.save(path)
    # CSV
    csv_path = path.with_suffix(".csv")
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
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("verification_status"),
                    r.get("geocode_status"),
                    r.get("source_url"),
                    r.get("website"),
                    r.get("legacy_brand"),
                    r.get("notes"),
                    r.get("phase"),
                ]
            )
    return csv_path


def coverage_status(brand, discovered, ready, official):
    if brand == "ELBGYM":
        return "ABSORBED_INTO_FITNESS_FIRST"
    if brand == "jumpers fitness":
        return "ABSORBED_INTO_ALL_INCLUSIVE"
    if official <= 0:
        return "N/A"
    pct = 100.0 * discovered / official
    if pct >= 90:
        return "COMPLETE_OR_NEAR"
    if discovered == 0:
        return "DISCOVERY_INCOMPLETE"
    return "DISCOVERY_INCOMPLETE" if pct < 85 else "COMPLETE_OR_NEAR"


def write_report(rows, phase1_total, phase1_ready, dedupe_events, same_addr, live_report, centers_sha):
    cats = Counter(r.get("import_category") for r in rows)
    brands = Counter(r.get("brand") for r in rows)
    verified = sum(
        1
        for r in rows
        if r.get("verification_status") in (None, "VERIFIED_CURRENT")
        or r.get("import_category") in ("READY_TO_IMPORT", "NEEDS_COORDINATES")
    )
    geocoded = sum(1 for r in rows if r.get("lat") is not None and r.get("lng") is not None)
    ready = cats.get("READY_TO_IMPORT", 0)
    soft = sum(1 for r in rows if r.get("geocode_status") == "suspicious" or "soft_postal" in (r.get("notes") or ""))
    ambiguous = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")
    missing_coords = sum(1 for r in rows if r.get("lat") is None or r.get("lng") is None)

    chain_rows = []
    for brand in [
        "clever fit",
        "McFIT",
        "FitX",
        "EASYFITNESS",
        "Fitness First",
        "JOHN REED",
        "Gold's Gym",
        "all inclusive Fitness",
        "INJOY",
        "ELBGYM",
        "PRIME TIME fitness",
        "jumpers fitness",
    ]:
        subset = [r for r in rows if r.get("brand") == brand]
        disc = len(subset)
        ready_b = sum(1 for r in subset if r.get("import_category") == "READY_TO_IMPORT")
        unresolved = sum(
            1
            for r in subset
            if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
        )
        official = OFFICIAL_EST.get(brand, disc)
        pct = (100.0 * disc / official) if official else 0
        chain_rows.append(
            {
                "brand": brand,
                "official_estimated": official,
                "discovered": disc,
                "READY": ready_b,
                "unresolved": unresolved,
                "coverage_pct": round(pct, 1),
                "status": coverage_status(brand, disc, ready_b, official),
            }
        )

    additional = load_json(PHASE2 / "additional_chains_audit.json")
    jumpers = load_json(PHASE2 / "jumpers_audit.json")
    elbgym = load_json(PHASE2 / "elbgym_research.json")
    golds = load_json(PHASE2 / "golds_magicline_audit.json")
    ff_audit = load_json(PHASE2 / "fitness_first_audit.json")
    removed = load_json(PHASE2 / "removed_rows.json")

    live_total = len(json.loads(CENTERS.read_text(encoding="utf-8")))
    proposed = ready
    expected = live_total + proposed

    md = []
    md.append("# Germany Phase 2 Readiness Report")
    md.append("")
    md.append(f"**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256={centers_sha[:16]}…`).")
    md.append("Awaiting explicit merge approval.")
    md.append("")
    md.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Overall")
    md.append("")
    md.append("| Metric | Count |")
    md.append("|--------|------:|")
    md.append(f"| Phase 1 discovered | **{phase1_total}** |")
    md.append(f"| Phase 1 READY | {phase1_ready} |")
    md.append(f"| Phase 2 total unique Germany locations | **{len(rows)}** |")
    md.append(f"| Additional vs Phase 1 (net) | **{len(rows) - phase1_total}** |")
    md.append(f"| Verified current (approx) | {verified} |")
    md.append(f"| Successfully geocoded / official coords | {geocoded} |")
    md.append(f"| READY_TO_IMPORT | **{ready}** |")
    md.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    md.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    md.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    md.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    md.append(f"| Internal dedupe events | {len(dedupe_events)} |")
    md.append(f"| Foreign/invalid removed | {len(removed.get('removed') or [])} |")
    md.append("")
    md.append("Live catalog untouched: DK/SE/NO unchanged. Existing Germany in live catalog: **0**.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Chain coverage")
    md.append("")
    md.append("| Chain | Official/est. | Discovered | READY | Unresolved | Coverage % | Status |")
    md.append("|-------|-------------:|-----------:|------:|-----------:|-----------:|--------|")
    for c in chain_rows:
        md.append(
            f"| {c['brand']} | {c['official_estimated']} | {c['discovered']} | {c['READY']} | {c['unresolved']} | {c['coverage_pct']} | {c['status']} |"
        )
    md.append("")
    md.append("### Brand counts in staging")
    md.append(str(dict(brands)))
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Specific answers")
    md.append("")
    fitx = next(c for c in chain_rows if c["brand"] == "FitX")
    injoy = next(c for c in chain_rows if c["brand"] == "INJOY")
    elb = next(c for c in chain_rows if c["brand"] == "ELBGYM")
    gold = next(c for c in chain_rows if c["brand"] == "Gold's Gym")
    md.append(f"1. **Final FitX count:** {fitx['discovered']} discovered / {fitx['READY']} READY (official sitemap **112**).")
    md.append(f"2. **Final INJOY count:** {injoy['discovered']} discovered / {injoy['READY']} READY (sitemap studio pages; teststudio excluded).")
    md.append(
        f"3. **Final ELBGYM count:** {elb['discovered']}. `elbgym.de` redirects to Fitness First; no standalone ELBGYM club pages found. Treated as absorbed into Fitness First / LifeFit."
    )
    md.append(
        f"4. **Final Gold's Gym count:** {gold['discovered']} DE (Magicline). Worldwide Gold's in API = {len(golds.get('all_golds_worldwide_in_api') or [])} (includes AT/IT). Germany is complete at 5 — prior ~8 estimate was not DE-only."
    )
    ff_removed = [x for x in (removed.get("removed") or []) if "fitness" in (x.get("reason") or "") or "Vöse" in str(x.get("name"))]
    md.append(
        f"5. **Fitness First 107 validity:** Official club hrefs = {ff_audit.get('official_club_hrefs')}. "
        f"**Fitness First Vösendorf removed** (Austria, coords outside DE). Remaining German FF count after purge should be **106** if it was in staging. "
        f"Audit verdict before purge: {ff_audit.get('verdict')}."
    )
    md.append(
        "6. **jumpers → all inclusive:** `jumpers-fitness.de` redirects to `ai-fitness.de` (all inclusive Fitness). "
        "No jumpers fitness brand rows staged. `jumpers.de` is an unrelated youth/social organization — not the gym chain."
    )
    md.append(
        "7. **Major conventional chains still missing / not staged:** Kieser Training (locator exists), Pfitzenmeier, FitnessLOFT, ELEMENTS/HealthCity (probe incomplete). "
        "EMS-only Bodystreet & Körperformen documented separately — **not** added to normal catalog."
    )
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Quality")
    md.append("")
    md.append("| Issue | Count |")
    md.append("|-------|------:|")
    md.append(f"| Missing coordinates | {missing_coords} |")
    md.append(f"| Soft postal geocodes | {soft} |")
    md.append(f"| Ambiguous geocodes | {ambiguous} |")
    md.append(f"| Same-address different-brand | {len(same_addr)} |")
    md.append(f"| ID collisions vs live | {len(live_report.get('id_collisions') or [])} |")
    md.append(f"| Border proximity ≤200 m vs non-DE live | {len(live_report.get('border_proximity_other_country') or [])} |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Proposed first production merge")
    md.append("")
    md.append(f"Recommend merging only **{proposed} READY_TO_IMPORT** rows with finite DE coordinates.")
    md.append("")
    md.append(f"Expected catalog if approved: **{live_total} + {proposed} ≈ {expected}** centers.")
    md.append("")
    md.append("Do **not** merge in this phase.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Scale")
    md.append("")
    md.append(f"Current production: **{live_total}**. After proposed Germany merge: **~{expected}**.")
    md.append("Client-side `centers.json` remains workable but heavier — monitor search/map performance after merge.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Files")
    md.append("")
    md.append("- `data/germany/germany_centers_staging.json`")
    md.append("- `data/germany/phase2/` (audits, notes, removed rows)")
    md.append("- `data/germany/scrapes/fitx_germany.json`")
    md.append("- `data/germany/scrapes/injoy_germany.json`")
    md.append("- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`")
    md.append("- `data/germany/GERMANY_PHASE2_READINESS_REPORT.md`")
    md.append("")
    md.append("**Not modified:** `src/data/centers.json`")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## STOP")
    md.append("")
    md.append("No production merge performed. Waiting for explicit approval.")
    md.append("")

    report_path = OUT / "GERMANY_PHASE2_READINESS_REPORT.md"
    report_path.write_text("\n".join(md), encoding="utf-8")

    summary = {
        "phase1_total": phase1_total,
        "phase1_ready": phase1_ready,
        "phase2_total": len(rows),
        "categories": dict(cats),
        "brands": dict(brands),
        "chain_coverage": chain_rows,
        "proposed_first_merge": proposed,
        "expected_catalog_after_merge": expected,
        "centers_json_unmodified": True,
        "centers_sha256": centers_sha,
        "same_address_diff_brand": same_addr[:50],
        "live_dup_report": {
            k: (v if not isinstance(v, list) else v[:30]) for k, v in live_report.items()
        },
        "additional_chains": additional,
        "jumpers": jumpers.get("conclusion") if isinstance(jumpers, dict) else jumpers,
        "elbgym_conclusion": elbgym.get("conclusion") if isinstance(elbgym, dict) else elbgym,
    }
    PHASE2.joinpath("phase2_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"proposed_first_merge": proposed, "total": len(rows), "cats": dict(cats)}, indent=2))
    return report_path


def main():
    before = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    rows, phase1_total, phase1_ready = merge_staging()
    print("merged raw", len(rows))
    for r in rows:
        classify(r)
    rows, events, same_addr = dedupe(rows)
    print("deduped", len(rows), Counter(r.get("import_category") for r in rows))
    print("brands", Counter(r.get("brand") for r in rows))

    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
    ]
    print("geocode todo", len(todo))
    review = []
    for i, r in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {r.get('brand')} {r.get('name')}")
        geocode_row(r)
        review.append(
            {
                "id": r.get("id"),
                "brand": r.get("brand"),
                "name": r.get("name"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "import_category": r.get("import_category"),
                "geocode_status": r.get("geocode_status"),
                "geocode_reasons": r.get("geocode_reasons"),
                "geocode_display": r.get("geocode_display"),
            }
        )

    for r in rows:
        classify(r)

    live_report, _ = vs_live(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT.joinpath("germany_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    OUT.joinpath("germany_duplicate_analysis.json").write_text(
        json.dumps(
            {
                "internal_events": events,
                "same_address_diff_brand": same_addr,
                "vs_live": live_report,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_excel(rows, OUT / "Gymly_Germany_All_Discovered_Centers.xlsx")
    after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert before == after, "centers.json was modified — abort"
    write_report(rows, phase1_total, phase1_ready, events, same_addr, live_report, before)
    print("BEFORE", before)
    print("AFTER", after)
    print("CENTERS_UNCHANGED")


if __name__ == "__main__":
    main()
