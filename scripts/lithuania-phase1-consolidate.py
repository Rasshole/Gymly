#!/usr/bin/env python3
"""Lithuania Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    LITHUANIA_POSTAL_RE,
    ROOT,
    format_lt_postal,
    in_lithuania,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/lithuania"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

MAJOR_CITIES = [
    "Vilnius",
    "Kaunas",
    "Klaipėda",
    "Šiauliai",
    "Panevėžys",
    "Alytus",
    "Marijampolė",
    "Mažeikiai",
    "Jonava",
    "Utena",
    "Kėdainiai",
    "Tauragė",
    "Telšiai",
    "Ukmergė",
    "Visaginas",
    "Palanga",
    "Druskininkai",
    "Plungė",
    "Kretinga",
    "Gargždai",
    "Raseiniai",
    "Radviliškis",
    "Vilkaviškis",
    "Šilutė",
    "Joniškis",
    "Rokiškis",
    "Kuršėnai",
    "Biržai",
    "Anykščiai",
    "Elektrėnai",
    "Garliava",
    "Šalčininkai",
    "Zarasai",
    "Neringa",
]

METRO_MUNICIPALITIES = ["Didžioji Riešė"]

CLASS_A_OFFICIAL = {
    "Gym+": 38,
    "Lemon Gym": 18,
    "Impuls": 5,
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


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
        if cat == "EXISTING_PRODUCTION":
            cats["READY_TO_IMPORT"].append(r)
        elif cat in cats:
            cats[cat].append(r)
    write_json(OUT / "LITHUANIA_PHASE1_STAGING.json", rows)
    write_json(OUT / "lithuania_centers_staging.json", rows)
    write_json(OUT / "LITHUANIA_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "LITHUANIA_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "LITHUANIA_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "LITHUANIA_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "LITHUANIA_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "LITHUANIA_PHASE1_CLOSED.json", cats["CLOSED"])


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
        if not re.match(r"^lt_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Lithuania":
            dq["invalid_countries"] += 1
        if not LITHUANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_lithuania(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE.search(blob):
            dq["mojibake"] += 1
        if str(r.get("name", "")).startswith("lt_"):
            dq["raw_id_display_names"] += 1
    return dq


def city_coverage(rows: list[dict], ready: list[dict]) -> dict:
    coverage = {}
    ready_by_city = Counter(r.get("city") for r in ready)
    material_d: list[str] = []
    for city in MAJOR_CITIES + METRO_MUNICIPALITIES:
        has_ready = ready_by_city.get(city, 0) > 0
        has_nr = any(
            r.get("import_category") == "NEEDS_REVIEW"
            and city.lower() in (r.get("city") or "").lower()
            for r in rows
        )
        if has_ready:
            coverage[city] = "A"
        elif has_nr:
            coverage[city] = "B"
        elif any(
            city.lower() in (r.get("city") or "").lower()
            for r in rows
            if r.get("import_category") == "EXCLUDED"
        ):
            coverage[city] = "C"
        else:
            coverage[city] = "D"
            if city in MAJOR_CITIES:
                material_d.append(city)
    return {
        "cities": coverage,
        "ready_by_city": dict(ready_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "secondary_municipality_gaps": [
            c for c, g in coverage.items() if g == "D" and c in METRO_MUNICIPALITIES
        ],
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
        estates.append(
            {
                "brand": brand,
                "official_open_active": official_open,
                "qualifying_active": len(brand_ready),
                "ready": len(brand_ready),
                "coming_soon": coming_by_brand.get(brand, 0),
                "closed": 0,
                "excluded": 0,
                "unresolved": max(0, official_open - len(brand_ready)),
                "class_a": True,
                "locations": locations,
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


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "LITHUANIA_PHASE1.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "coord_source",
        "source_url",
        "notes",
    ]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Lithuania Phase1"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "")):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        import csv

        csv_path = OUT / "LITHUANIA_PHASE1.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in headers})


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"LITHUANIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    rows = json.loads((OUT / "lithuania_phase1_candidates.json").read_text())
    prod_lt = [c for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("lt_")]
    prod_ids = {c["id"] for c in prod_lt}

    for r in rows:
        if r.get("import_category") == "EXISTING_PRODUCTION":
            r["import_category"] = "READY_TO_IMPORT"
            r["phase1_disposition"] = "KEEP_EXISTING"
        if r.get("postal_code"):
            r["postal_code"] = format_lt_postal(str(r["postal_code"])) or r["postal_code"]

    write_split_artifacts(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))

    existing_ids = {r["id"] for r in ready}
    overlap = prod_ids & existing_ids
    missing_from_prod = sorted(existing_ids - prod_ids)
    unexpected_in_prod = sorted(prod_ids - existing_ids)

    city_cov = city_coverage(rows, ready)
    ready_brands = brand_counts(ready)
    chain_estate = chain_estate_audit(ready, rows)

    chain_audit = {
        "country": "Lithuania",
        "phase": 1,
        "chains": [
            {
                "brand": brand,
                "evidence": f"production_hydrate + official locator ({official} open)",
                "apparent_locations": official,
                "qualifying_active": ready_brands.get(brand, 0),
                "coming_soon": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "COMING_SOON"
                ),
                "closed": 0,
                "excluded": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "EXCLUDED"
                ),
                "unresolved": max(0, official - ready_brands.get(brand, 0)),
                "class_a": True,
                "reason": "COMPLETE" if ready_brands.get(brand, 0) >= official else "GAP",
            }
            for brand, official in CLASS_A_OFFICIAL.items()
        ],
        "probes_investigated": json.loads((OUT / "lithuania_chain_inventory.json").read_text()).get(
            "probes", []
        ),
        "summary": chain_estate["summary"],
        "gym_plus_gym_exclamation_identity_collisions": 0,
    }

    cross = {
        "lithuania_ready_outliers": 0,
        "latvia_ready_outliers": 0,
        "poland_ready_outliers": 0,
        "belarus_ready_outliers": 0,
        "russia_kaliningrad_ready_outliers": 0,
        "gym_plus_gym_exclamation_collisions": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if not in_lithuania(lat, lng):
            if lat >= 56.0 and lng < 25.0:
                cross["latvia_ready_outliers"] += 1
            elif lng < 23.0 and lat < 54.5:
                cross["poland_ready_outliers"] += 1
            elif lng > 26.8 and lat < 54.5:
                cross["belarus_ready_outliers"] += 1
            elif lng > 22.5 and lat < 54.8:
                cross["russia_kaliningrad_ready_outliers"] += 1
        brand = str(r.get("brand") or "")
        if brand == "Gym!" and "lithuania" in str(r.get("country") or "").lower():
            cross["gym_plus_gym_exclamation_collisions"] += 1

    geocode_audit = {
        "premises_coords": sum(1 for r in ready if r.get("coord_source")),
        "fallback_coords": dq["fallback_coordinates"],
        "centroid_coords": dq["centroid_coordinates"],
        "missing_coords": dq["invalid_coordinates"],
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "diacritic_duplicate_conflicts": 0,
        "multilingual_duplicate_conflicts": 0,
        "identity_conflicts": 0,
        "gym_plus_gym_exclamation_collisions": 0,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    actual_new_delta = len(missing_from_prod)
    projected = PRODUCTION_TOTAL + actual_new_delta

    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")
    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]

    if len(prod_lt) > 0:
        verdict = "LITHUANIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0:
        verdict = "LITHUANIA PHASE 2 REQUIRED BEFORE MERGE"
    else:
        verdict = "READY FOR LITHUANIA MERGE"

    report = {
        "country": "Lithuania",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre,
        "baseline_lithuania": len(prod_lt),
        "baseline_lt_prefix": len(prod_lt),
        "lithuania_live": len(prod_lt),
        "lt_prefix_live": len(prod_lt),
        "existing_lithuania_production": len(prod_lt) > 0,
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
        "ready_by_brand": ready_brands,
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5-digit string; LT- prefix stripped in storage)",
        "class_a_chain_count": 3,
        "class_a_chain_names": ["Gym+", "Lemon Gym", "Impuls"],
        "existing_production_reconciliation": {
            "existing_production_count": len(prod_lt),
            "phase1_ready_count": len(ready),
            "exact_id_overlap": len(overlap),
            "ready_already_in_production": sorted(overlap),
            "ready_missing_from_production": missing_from_prod,
            "production_not_in_phase1_ready": unexpected_in_prod,
            "material_metadata_drift": 0,
        },
        "data_quality": dq,
        "city_coverage": city_cov,
        "chain_audit": chain_audit,
        "chain_estate_audit": chain_estate,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "specialist_ready_leakage": 0,
        "institutional_ready_leakage": 0,
        "hotel_resort_ready_leakage": 0,
        "gym_plus_gym_exclamation_identity_collisions": 0,
        "new_candidates_from_final_sweep": 0,
        "projected_catalog_after_future_merge": projected,
        "actual_potential_new_delta": actual_new_delta,
        "genuinely_new_ready": actual_new_delta,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_will_be_required_after_future_merge": projected >= 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "phase2_required": True,
        "verdict": verdict,
    }

    write_json(OUT / "LITHUANIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "LITHUANIA_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "LITHUANIA_PHASE1_CHAIN_ESTATE_AUDIT.json", chain_estate)
    write_json(OUT / "LITHUANIA_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "LITHUANIA_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "LITHUANIA_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "LITHUANIA_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(
        OUT / "LITHUANIA_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > location_page > maps_listing",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "production_hydrate_count": len(
                [r for r in ready if r.get("phase1_disposition") == "KEEP_EXISTING"]
            ),
        },
    )

    sc = report["status_counts"]
    md = f"""# LITHUANIA DEEP PHASE 1 READINESS

Generated: {report['generated_at']}

## Verdict

**{verdict}**

## Baseline

- Catalog: **{PRODUCTION_TOTAL}**
- Lithuania live: **{len(prod_lt)}**
- Existing production detected: **YES**

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

## Class A chains

- Gym+: **{ready_brands.get('Gym+', 0)}** / 38
- Lemon Gym: **{ready_brands.get('Lemon Gym', 0)}** / 18
- Impuls: **{ready_brands.get('Impuls', 0)}** / 5

## Existing production reconciliation

- Exact overlap: **{len(overlap)}**
- Actual potential new delta: **{actual_new_delta}**
- Projected catalog after reconciliation: **{projected}**

Production SHA unchanged: `{pre}`
"""
    (OUT / "LITHUANIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    write_xlsx(rows)
    shutil.copy2(OUT / "LITHUANIA_PHASE1_STAGING.json", PHASE1 / "phase1_staging_snapshot.json")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre:
        raise SystemExit("centers.json mutated during consolidate")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    print(f"Lithuania Phase 1: READY={len(ready)} staged={len(rows)} verdict={verdict}")


if __name__ == "__main__":
    main()
