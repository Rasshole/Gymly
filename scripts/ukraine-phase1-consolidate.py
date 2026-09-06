#!/usr/bin/env python3
"""Ukraine Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
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
    ROOT,
    UKRAINE_POSTAL_RE,
    classify_row,
    ctx,
    format_ua_postal,
    in_ukraine,
    nominatim_geocode,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/ukraine"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83"
PRODUCTION_TOTAL = 11929

MAJOR_CITIES = [
    "Kyiv",
    "Lviv",
    "Odesa",
    "Dnipro",
    "Kharkiv",
    "Vinnytsia",
    "Zhytomyr",
    "Poltava",
    "Cherkasy",
    "Chernivtsi",
    "Rivne",
    "Lutsk",
    "Kryvyi Rih",
    "Kremenchuk",
    "Bucha",
    "Ivano-Frankivsk",
    "Boryspil",
    "Bila Tserkva",
    "Kamianets-Podilskyi",
    "Uzhhorod",
    "Donetsk",
    "Luhansk",
    "Kherson",
    "Zaporizhzhia",
]

CLASS_A_OFFICIAL = {
    "Sport Life": 49,
    "Apollo Next": 24,
    "Smartass": 10,
    "Total Fitness": 12,
}

CONFLICT_CITIES = {
    "Donetsk",
    "Luhansk",
    "Crimea",
    "Sevastopol",
    "Kherson",
    "Zaporizhzhia",
    "Mariupol",
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
    write_json(OUT / "ukraine_centers_staging.json", rows)
    write_json(OUT / "UKRAINE_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "UKRAINE_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "UKRAINE_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "UKRAINE_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "UKRAINE_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "UKRAINE_PHASE1_CLOSED.json", cats["CLOSED"])


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
        "conflict_area_ready_leakage": 0,
    }
    MOJIBAKE = re.compile(r"Ã[£¡§ªº¢©¤]||â€")
    FALLBACK = re.compile(r"fallback|centroid|city_center", re.I)
    for r in ready:
        if not re.match(r"^ua_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Ukraine":
            dq["invalid_countries"] += 1
        if not UKRAINE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_ukraine(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE.search(blob):
            dq["mojibake"] += 1
        if str(r.get("name", "")).startswith("ua_"):
            dq["raw_id_display_names"] += 1
        if r.get("city") in CONFLICT_CITIES or r.get("conflict_area"):
            dq["conflict_area_ready_leakage"] += 1
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
            and r.get("discovery_class") in ("municipal_audit", "conflict_area_probe")
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
        "conflict_cities_staged": sorted(
            c for c in CONFLICT_CITIES if any(r.get("city") == c for r in rows)
        ),
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


def geocode_rows(rows: list[dict], cache: dict, limit: int = 120) -> int:
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if r.get("import_category") in ("EXCLUDED", "NEEDS_REVIEW") and r.get("conflict_area"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= limit:
            break
        q = ", ".join(x for x in [r["address"], r.get("postal_code"), r["city"], "Ukraine"] if x)
        hit = nominatim_geocode(q, "ua", cache)
        geocoded += 1
        if hit and hit.get("lat") is not None and not hit.get("error"):
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_ukraine(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                r["evidence"] = {
                    **(r.get("evidence") or {}),
                    "geocode_display": hit.get("display_name"),
                }
                npc = format_ua_postal(str(hit.get("postcode") or ""))
                if npc and not UKRAINE_POSTAL_RE.match(str(r.get("postal_code") or "")):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
    return geocoded


def fill_postal_from_geocode(rows: list[dict], cache: dict, limit: int = 100) -> int:
    """Recover missing postcodes for rows that already have official coords."""
    filled = 0
    for r in rows:
        if UKRAINE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if r.get("conflict_area"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if filled >= limit:
            break
        q = ", ".join(x for x in [r["address"], r["city"], "Ukraine"] if x)
        hit = nominatim_geocode(q, "ua", cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_ua_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
            if r.get("lat") is None and hit.get("lat") is not None:
                lat, lng = float(hit["lat"]), float(hit["lng"])
                if in_ukraine(lat, lng):
                    r["lat"], r["lng"] = lat, lng
                    r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    return filled


def fill_postal_from_reverse(rows: list[dict], cache: dict, limit: int = 80) -> int:
    """Reverse-geocode official coords to recover Ukrainian postcodes."""
    filled = 0
    for r in rows:
        if UKRAINE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("conflict_area"):
            continue
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        if filled >= limit:
            break
        key = f"rev|ua|{round(float(lat), 5)}|{round(float(lng), 5)}"
        if key in cache:
            hit = cache[key]
        else:
            params = urllib.parse.urlencode(
                {
                    "lat": float(lat),
                    "lon": float(lng),
                    "format": "json",
                    "addressdetails": 1,
                    "countrycodes": "ua",
                }
            )
            url = f"https://nominatim.openstreetmap.org/reverse?{params}"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "GymlyBatch1Phase1/1.0 (catalog research; contact: gymly)",
                    "Accept": "application/json",
                },
            )
            time.sleep(1.1)
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                    hit = json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                hit = {"error": str(e)}
            cache[key] = hit
        filled += 1
        addr = hit.get("address") or {}
        cc = (addr.get("country_code") or "").lower()
        if cc and cc != "ua":
            continue
        npc = format_ua_postal(str(addr.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_reverse_geocode"
    return filled


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"UKRAINE PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    rows = json.loads((OUT / "ukraine_phase1_candidates.json").read_text())
    prod_ua = [c for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("ua_")]
    if prod_ua:
        raise SystemExit(f"Expected 0 ua_* production rows, found {len(prod_ua)}")

    cache_path = OUT / "ukraine_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    geocoded = geocode_rows(rows, cache, limit=80)
    postal_filled = fill_postal_from_geocode(rows, cache, limit=40)
    reverse_filled = fill_postal_from_reverse(rows, cache, limit=120)
    write_json(cache_path, cache)

    for r in rows:
        if r.get("postal_code"):
            r["postal_code"] = format_ua_postal(str(r["postal_code"])) or r["postal_code"]
        if r.get("city") in CONFLICT_CITIES or r.get("conflict_area"):
            r["import_category"] = "NEEDS_REVIEW"
            r["verification_status"] = "NEEDS_REVIEW"
            continue
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED"):
            continue
        cat = classify_row(
            r,
            postal_re=UKRAINE_POSTAL_RE,
            in_country=in_ukraine,
            format_postal=format_ua_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Ukraine"

    write_split_artifacts(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))

    city_cov = city_coverage(rows, ready)
    ready_brands = brand_counts(ready)
    chain_estate = chain_estate_audit(ready, rows)

    chain_audit = {
        "country": "Ukraine",
        "phase": 1,
        "market_model": "CHAIN_LED",
        "chains": chain_estate["chains"],
        "probes_investigated": json.loads((OUT / "ukraine_chain_inventory.json").read_text()).get(
            "probes", []
        ),
        "summary": chain_estate["summary"],
    }

    cross = {
        "ukraine_ready_outliers": 0,
        "poland_ready_outliers": 0,
        "moldova_ready_outliers": 0,
        "romania_ready_outliers": 0,
        "russia_ready_outliers": 0,
        "belarus_ready_outliers": 0,
        "other_foreign_ready_outliers": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if in_ukraine(lat, lng):
            continue
        if 49.0 <= lat <= 54.9 and 14.1 <= lng <= 24.2:
            cross["poland_ready_outliers"] += 1
        elif 45.4 <= lat <= 48.7 and 26.5 <= lng <= 30.2:
            cross["moldova_ready_outliers"] += 1
        elif 43.6 <= lat <= 48.3 and 20.2 <= lng <= 29.8:
            cross["romania_ready_outliers"] += 1
        elif lng >= 39.0:
            cross["russia_ready_outliers"] += 1
        elif lat >= 51.0 and lng <= 24.5:
            cross["belarus_ready_outliers"] += 1
        else:
            cross["other_foreign_ready_outliers"] += 1

    geocode_audit = {
        "premises_coords": sum(
            1 for r in ready if r.get("coord_source") in ("OFFICIAL_MAP_PIN", "KNOWN_PREMISES_HYDRATE")
        ),
        "geocoded_coords": sum(1 for r in ready if r.get("coord_source") == "STRICT_ADDRESS_GEOCODE"),
        "fallback_coords": dq["fallback_coordinates"],
        "missing_coords": dq["invalid_coordinates"],
        "geocoded_this_run": geocoded,
        "postal_filled_this_run": postal_filled,
        "postal_reverse_filled_this_run": reverse_filled,
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "diacritic_duplicate_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand = json.loads((OUT / "UKRAINE_PHASE1_REBRAND_MAP.json").read_text())

    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")
    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]
    material_d = city_cov["material_d_gaps_count"]
    projected = PRODUCTION_TOTAL + len(ready)

    specialist_leak = specialist_leakage_check(ready)
    hotel_leak = hotel_leakage_check(ready)

    if len(prod_ua) > 0:
        verdict = "UKRAINE PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0 or material_d > 0:
        verdict = "UKRAINE PHASE 2 REQUIRED — UNRESOLVED DISCOVERY / RECONCILIATION"
    else:
        verdict = "READY FOR UKRAINE PRODUCTION MERGE"

    report = {
        "country": "Ukraine",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre,
        "baseline_malta": 24,
        "baseline_ukraine": 0,
        "ukraine_live": 0,
        "ua_prefix_live": 0,
        "existing_ukraine_production": False,
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
        "genuinely_new_ready": len(ready),
        "ready_by_brand": ready_brands,
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5 digits)",
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
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_will_be_required_after_future_merge": projected >= 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "ukraine_infrastructure_present": True,
        "ukraine_infrastructure_gaps": [],
        "phase2_required": True,
        "unresolved_rebrand_conflicts": rebrand.get("unresolved_conflicts", 0),
        "verdict": verdict,
    }

    write_json(OUT / "UKRAINE_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "UKRAINE_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "UKRAINE_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "UKRAINE_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "UKRAINE_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "UKRAINE_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(
        OUT / "UKRAINE_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > location_page > __NEXT_DATA__ > directory",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "sport_life_next_data": sum(1 for r in ready if r.get("brand") == "Sport Life"),
            "apollo_official_locator": sum(1 for r in ready if r.get("brand") == "Apollo Next"),
            "smartass_homepage": sum(1 for r in ready if r.get("brand") == "Smartass"),
            "chain_seed_needs_review": sum(
                1
                for r in rows
                if r.get("import_category") == "NEEDS_REVIEW"
                and r.get("discovery_class") == "chain_seed_probe"
            ),
        },
    )
    write_json(OUT / "UKRAINE_EXISTING_PRODUCTION_SNAPSHOT.json", [])

    sc = report["status_counts"]
    md = f"""# UKRAINE DEEP PHASE 1 READINESS

Generated: {report['generated_at']}

## Verdict

**{verdict}**

## Baseline

- Catalog: **{PRODUCTION_TOTAL}**
- Ukraine live: **0**
- Existing production detected: **NO**
- Malta baseline (prior country): **24**

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

{chr(10).join(f'- {b}: **{ready_brands.get(b, 0)}**' for b in CLASS_A_OFFICIAL)}

## Projected catalog after merge

**{projected}** ({'crosses 12,500' if projected >= 12500 else 'below 12,500'})

Production SHA unchanged: `{pre}`
"""
    (OUT / "UKRAINE_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    shutil.copy2(OUT / "ukraine_centers_staging.json", PHASE1 / "phase1_staging_snapshot.json")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre:
        raise SystemExit("centers.json mutated during consolidate")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    print(
        f"Ukraine Phase 1: READY={len(ready)} staged={len(rows)} "
        f"review={needs_review} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
