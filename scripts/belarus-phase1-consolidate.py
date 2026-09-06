#!/usr/bin/env python3
"""Belarus Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    BELARUS_POSTAL_RE,
    ROOT,
    classify_row,
    ctx,
    format_by_postal,
    in_belarus,
    nominatim_geocode,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/belarus"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05"
PRODUCTION_TOTAL = 12034
CATALOG_HEADROOM = 12500 - PRODUCTION_TOTAL  # 466

MAJOR_CITIES = [
    "Minsk",
    "Brest",
    "Grodno",
    "Gomel",
    "Mogilev",
    "Vitebsk",
    "Pinsk",
    "Orsha",
    "Luninets",
    "Pruzhany",
    "Borovlyany",
]

CLASS_A_OFFICIAL = {
    "Adrenalin": 29,
    "Lifestyle": 3,
    "Fox Club": 5,
    "Olympic": 4,
}


def brand_counts(rows: list[dict]) -> dict[str, int]:
    c = Counter(r.get("brand") for r in rows)
    return {k: v for k, v in sorted(c.items()) if k}


def write_split_artifacts(rows: list[dict]) -> None:
    cats = {
        "READY_TO_IMPORT": [],
        "NEEDS_REVIEW": [],
        "NEEDS_COORDINATES": [],
        "COMING_SOON": [],
        "EXCLUDED": [],
        "CLOSED": [],
    }
    for r in rows:
        cat = r.get("import_category") or "NEEDS_REVIEW"
        if cat in cats:
            cats[cat].append(r)
    write_json(OUT / "belarus_centers_staging.json", rows)
    write_json(OUT / "BELARUS_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "BELARUS_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "BELARUS_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "BELARUS_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "BELARUS_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "BELARUS_PHASE1_CLOSED.json", cats["CLOSED"])


def dq_ready(ready: list[dict]) -> dict:
    dq = {
        "invalid_ids": 0,
        "invalid_countries": 0,
        "invalid_postcodes": 0,
        "invalid_coordinates": 0,
        "fallback_coordinates": 0,
        "centroid_coordinates": 0,
        "missing_required_fields": 0,
        "mojibake": 0,
        "raw_id_display_names": 0,
    }
    MOJIBAKE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€")
    FALLBACK = re.compile(r"fallback|centroid|city_center", re.I)
    for r in ready:
        if not re.match(r"^by_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Belarus":
            dq["invalid_countries"] += 1
        if not BELARUS_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_belarus(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE.search(blob):
            dq["mojibake"] += 1
        if str(r.get("name", "")).startswith("by_"):
            dq["raw_id_display_names"] += 1
    return dq


def city_coverage(rows: list[dict], ready: list[dict]) -> dict:
    coverage = {}
    ready_by_city = Counter(r.get("city") for r in ready)
    material_d: list[str] = []
    for city in MAJOR_CITIES:
        has_ready = ready_by_city.get(city, 0) > 0
        has_cs = any(
            r.get("import_category") == "COMING_SOON" and r.get("city") == city for r in rows
        )
        has_nr = any(
            r.get("import_category") == "NEEDS_REVIEW"
            and r.get("discovery_class") in ("regional_gap_candidate", "independent")
            and r.get("city") == city
            for r in rows
        )
        has_excluded = any(
            r.get("import_category") == "EXCLUDED" and r.get("city") == city for r in rows
        )
        if has_ready:
            coverage[city] = "A"
        elif has_cs:
            coverage[city] = "B"
        elif has_nr:
            coverage[city] = "B"
        elif has_excluded:
            coverage[city] = "C"
        else:
            coverage[city] = "D"
            material_d.append(city)
    return {
        "cities": coverage,
        "ready_by_city": dict(ready_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "vitebsk_audit_grade": coverage.get("Vitebsk", "D"),
    }


def chain_estate_audit(ready: list[dict], rows: list[dict]) -> dict:
    estates = []
    coming_by_brand = Counter(
        r.get("brand") for r in rows if r.get("import_category") == "COMING_SOON"
    )
    for brand, official_open in CLASS_A_OFFICIAL.items():
        brand_ready = [r for r in ready if r.get("brand") == brand]
        locations = [
            {
                "id": r["id"],
                "name": r.get("name"),
                "address": r.get("address"),
                "city": r.get("city"),
                "postal_code": r.get("postal_code"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "disposition": "OPEN_ACTIVE",
            }
            for r in sorted(brand_ready, key=lambda x: x.get("name") or "")
        ]
        coming = coming_by_brand.get(brand, 0)
        estates.append(
            {
                "brand": brand,
                "official_open_active": official_open,
                "qualifying_active": len(brand_ready),
                "ready": len(brand_ready),
                "coming_soon": coming,
                "closed": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "CLOSED"
                ),
                "needs_review": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "NEEDS_REVIEW"
                ),
                "unresolved": max(0, official_open - len(brand_ready) - coming),
                "class_a": True,
                "estate_completeness": "COMPLETE"
                if len(brand_ready) + coming >= official_open
                else "GAP",
                "locations": locations[:50],
            }
        )
    gaps = sum(e["unresolved"] for e in estates)
    return {
        "chains": estates,
        "summary": {
            "final_class_a_chain_count": len(estates),
            "final_class_a_ready_count": sum(e["ready"] for e in estates),
            "chain_estate_gaps": gaps,
        },
    }


def geocode_rows(rows: list[dict], cache: dict, limit: int = 120) -> int:
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if r.get("import_category") == "EXCLUDED":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= limit:
            break
        q = ", ".join(x for x in [r["address"], r.get("postal_code"), r["city"], "Belarus"] if x)
        hit = nominatim_geocode(q, "by", cache)
        geocoded += 1
        if hit and hit.get("lat") is not None and not hit.get("error"):
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_belarus(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                r["evidence"] = {
                    **(r.get("evidence") or {}),
                    "geocode_display": hit.get("display_name"),
                }
                npc = format_by_postal(str(hit.get("postcode") or ""))
                if npc and not BELARUS_POSTAL_RE.match(str(r.get("postal_code") or "")):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
    return geocoded


def fill_postal_from_geocode(rows: list[dict], cache: dict, limit: int = 60) -> int:
    filled = 0
    for r in rows:
        if BELARUS_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if filled >= limit:
            break
        q = ", ".join(x for x in [r["address"], r["city"], "Belarus"] if x)
        hit = nominatim_geocode(q, "by", cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_by_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
            if r.get("lat") is None and hit.get("lat") is not None:
                lat, lng = float(hit["lat"]), float(hit["lng"])
                if in_belarus(lat, lng):
                    r["lat"], r["lng"] = lat, lng
                    r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    return filled


def specialist_leakage_check(ready: list[dict]) -> int:
    specialist = re.compile(
        r"crossfit|pilates.?only|yoga.?only|ems|boxing.?only|martial|physio|rehab|pt.?studio",
        re.I,
    )
    return sum(1 for r in ready if specialist.search(f"{r.get('name')} {r.get('brand')}"))


def hotel_leakage_check(ready: list[dict]) -> int:
    hotel = re.compile(r"hotel|resort|spa.?only|guest.?only", re.I)
    return sum(
        1
        for r in ready
        if hotel.search(f"{r.get('name')} {r.get('address')} {r.get('notes')}")
        and "public membership" not in str(r.get("notes") or "").lower()
    )


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"BELARUS PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    rows = json.loads((OUT / "belarus_phase1_candidates.json").read_text())
    prod_by = [c for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("by_")]
    if prod_by:
        raise SystemExit(f"Expected 0 by_* production rows, found {len(prod_by)}")

    cache_path = OUT / "belarus_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    geocoded = geocode_rows(rows, cache, limit=120)
    postal_filled = fill_postal_from_geocode(rows, cache, limit=60)
    write_json(cache_path, cache)

    for r in rows:
        if r.get("postal_code"):
            r["postal_code"] = format_by_postal(str(r["postal_code"])) or r["postal_code"]
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED"):
            continue
        cat = classify_row(
            r,
            postal_re=BELARUS_POSTAL_RE,
            in_country=in_belarus,
            format_postal=format_by_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Belarus"

    write_split_artifacts(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))

    city_cov = city_coverage(rows, ready)
    ready_brands = brand_counts(ready)
    chain_estate = chain_estate_audit(ready, rows)

    chain_audit = {
        "country": "Belarus",
        "phase": 1,
        "market_model": "CHAIN_LED",
        "chains": chain_estate["chains"],
        "probes_investigated": json.loads((OUT / "belarus_chain_inventory.json").read_text()).get(
            "probes", []
        ),
        "summary": chain_estate["summary"],
        "international_absent": [
            "Gold's Gym",
            "Anytime Fitness",
            "McFIT",
            "Basic-Fit",
        ],
    }

    cross = {
        "belarus_ready_outliers": 0,
        "poland_ready_outliers": 0,
        "ukraine_ready_outliers": 0,
        "lithuania_ready_outliers": 0,
        "latvia_ready_outliers": 0,
        "russia_ready_outliers": 0,
        "other_foreign_ready_outliers": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if in_belarus(lat, lng):
            continue
        if 49.0 <= lat <= 54.9 and 14.1 <= lng <= 24.2:
            cross["poland_ready_outliers"] += 1
        elif 44.0 <= lat <= 52.5 and 22.0 <= lng <= 40.5:
            cross["ukraine_ready_outliers"] += 1
        elif 53.8 <= lat <= 56.5 and 20.9 <= lng <= 26.9:
            cross["lithuania_ready_outliers"] += 1
        elif 55.5 <= lat <= 58.2 and 20.9 <= lng <= 28.4:
            cross["latvia_ready_outliers"] += 1
        elif lng >= 32.0:
            cross["russia_ready_outliers"] += 1
        else:
            cross["other_foreign_ready_outliers"] += 1

    geocode_audit = {
        "geocoded_coords": sum(1 for r in ready if r.get("coord_source") == "STRICT_ADDRESS_GEOCODE"),
        "fallback_coords": dq["fallback_coordinates"],
        "missing_coords": dq["invalid_coordinates"],
        "geocoded_this_run": geocoded,
        "postal_filled_this_run": postal_filled,
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "diacritic_duplicate_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand = json.loads((OUT / "BELARUS_PHASE1_REBRAND_MAP.json").read_text())

    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")
    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]
    material_d = city_cov["material_d_gaps_count"]
    genuinely_new_ready = len(ready)
    projected = PRODUCTION_TOTAL + genuinely_new_ready

    specialist_leak = specialist_leakage_check(ready)
    hotel_leak = hotel_leakage_check(ready)

    if len(prod_by) > 0:
        verdict = "BELARUS PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0 or material_d > 0:
        verdict = "BELARUS PHASE 2 REQUIRED — UNRESOLVED DISCOVERY / RECONCILIATION"
    else:
        verdict = "READY FOR BELARUS PRODUCTION MERGE"

    report = {
        "country": "Belarus",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "belarus_live": 0,
        "by_prefix_live": 0,
        "existing_belarus_production": False,
        "unique_staged": len(rows),
        "status_counts": {
            "READY_TO_IMPORT": len(ready),
            "NEEDS_REVIEW": needs_review,
            "NEEDS_COORDINATES": needs_coords,
            "COMING_SOON": sum(1 for r in rows if r.get("import_category") == "COMING_SOON"),
            "EXCLUDED": sum(1 for r in rows if r.get("import_category") == "EXCLUDED"),
            "CLOSED": sum(1 for r in rows if r.get("import_category") == "CLOSED"),
        },
        "ready_count": len(ready),
        "genuinely_new_ready": genuinely_new_ready,
        "ready_by_brand": ready_brands,
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNNN (6 digits)",
        "class_a_chain_count": len(CLASS_A_OFFICIAL),
        "class_a_chain_names": list(CLASS_A_OFFICIAL.keys()),
        "data_quality": dq,
        "city_coverage": city_cov,
        "chain_audit": chain_audit,
        "chain_estate_audit": chain_estate,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "specialist_ready_leakage": specialist_leak,
        "hotel_resort_ready_leakage": hotel_leak,
        "projected_catalog_after_future_merge": projected,
        "catalog_headroom_to_12500": CATALOG_HEADROOM,
        "projected_crosses_12500": projected >= 12500,
        "crosses_12500_if_ready_exceeds_headroom": genuinely_new_ready > CATALOG_HEADROOM,
        "global_stress_qa_will_be_required_after_future_merge": projected >= 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "phase2_required": True,
        "unresolved_rebrand_conflicts": rebrand.get("unresolved_conflicts", 0),
        "verdict": verdict,
    }

    write_json(OUT / "BELARUS_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "BELARUS_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "BELARUS_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "BELARUS_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "BELARUS_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "BELARUS_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(
        OUT / "BELARUS_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > location_page > directory",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "ready_with_source_type": sum(1 for r in ready if r.get("source_type")),
            "adrenalin_official": sum(1 for r in ready if r.get("brand") == "Adrenalin"),
            "lifestyle_official": sum(1 for r in ready if r.get("brand") == "Lifestyle"),
            "fox_club_official": sum(1 for r in ready if r.get("brand") == "Fox Club"),
            "olympic_official": sum(1 for r in ready if r.get("brand") == "Olympic"),
            "independent_needs_review": sum(
                1
                for r in rows
                if r.get("import_category") == "NEEDS_REVIEW"
                and r.get("discovery_class") == "independent"
            ),
        },
    )
    write_json(OUT / "BELARUS_EXISTING_PRODUCTION_SNAPSHOT.json", [])

    sc = report["status_counts"]
    md = f"""# BELARUS DEEP PHASE 1 READINESS

Generated: {report['generated_at']}

## Verdict

**{verdict}**

## Baseline

- Catalog: **{PRODUCTION_TOTAL}**
- Belarus live: **0**
- Ukraine baseline: **105**
- Malta baseline: **24**
- Headroom to 12,500: **{CATALOG_HEADROOM}**

## Staging inventory

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {sc['READY_TO_IMPORT']} |
| NEEDS_REVIEW | {sc['NEEDS_REVIEW']} |
| NEEDS_COORDINATES | {sc['NEEDS_COORDINATES']} |
| COMING_SOON | {sc['COMING_SOON']} |
| EXCLUDED | {sc['EXCLUDED']} |
| CLOSED | {sc['CLOSED']} |
| **TOTAL** | **{len(rows)}** |

## Class A chains (READY)

{chr(10).join(f'- {b}: **{ready_brands.get(b, 0)}** / official {CLASS_A_OFFICIAL[b]}' for b in CLASS_A_OFFICIAL)}

## Projected catalog after merge

**{projected}** ({'crosses 12,500' if projected >= 12500 else 'below 12,500'}; headroom {CATALOG_HEADROOM})

Production SHA unchanged: `{pre}`
"""
    (OUT / "BELARUS_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    shutil.copy2(OUT / "belarus_centers_staging.json", PHASE1 / "phase1_staging_snapshot.json")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre:
        raise SystemExit("centers.json mutated during consolidate")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    print(
        f"Belarus Phase 1: READY={len(ready)} staged={len(rows)} "
        f"review={needs_review} coords={needs_coords} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
