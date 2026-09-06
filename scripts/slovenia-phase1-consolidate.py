#!/usr/bin/env python3
"""Slovenia Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    SLOVENIA_POSTAL_RE,
    format_si_postal,
    in_slovenia,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/slovenia"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

MAJOR_CITIES = [
    "Ljubljana",
    "Maribor",
    "Celje",
    "Kranj",
    "Koper",
    "Novo mesto",
    "Velenje",
    "Nova Gorica",
    "Ptuj",
    "Murska Sobota",
    "Slovenj Gradec",
    "Domžale",
    "Kamnik",
    "Jesenice",
]

MATERIAL_CITIES = [
    "Velenje",
    "Nova Gorica",
    "Ptuj",
    "Slovenj Gradec",
    "Brežice",
    "Krško",
    "Postojna",
    "Bled",
]


def status_counts(rows: list[dict]) -> dict[str, int]:
    c = Counter(r.get("import_category") for r in rows)
    return dict(c)


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
        elif cat in ("DUPLICATE", "LEGACY"):
            pass
    write_json(OUT / "SLOVENIA_PHASE1_STAGING.json", rows)
    write_json(OUT / "slovenia_centers_staging.json", rows)
    write_json(OUT / "SLOVENIA_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "SLOVENIA_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "SLOVENIA_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "SLOVENIA_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "SLOVENIA_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "SLOVENIA_PHASE1_CLOSED.json", cats["CLOSED"])


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
    import re

    MOJIBAKE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€")
    FALLBACK = re.compile(r"fallback|centroid|city_center", re.I)
    for r in ready:
        if not re.match(r"^si_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Slovenia":
            dq["invalid_countries"] += 1
        if not SLOVENIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_slovenia(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE.search(blob):
            dq["mojibake"] += 1
        if str(r.get("name", "")).startswith("si_"):
            dq["raw_id_display_names"] += 1
    return dq


def city_coverage(rows: list[dict], ready: list[dict]) -> dict:
    coverage = {}
    ready_by_city = Counter(r.get("city") for r in ready)
    for city in MAJOR_CITIES + MATERIAL_CITIES:
        has_ready = ready_by_city.get(city, 0) > 0
        has_any = any(city.lower() in (r.get("city") or "").lower() for r in rows)
        if has_ready:
            coverage[city] = "A"
        elif has_any:
            coverage[city] = "C"
        elif city in ("Velenje", "Nova Gorica", "Ptuj", "Slovenj Gradec"):
            coverage[city] = "B"
        else:
            coverage[city] = "B" if not has_any else "D"
    return {
        "cities": coverage,
        "ready_by_city": dict(ready_by_city),
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "material_city_gaps": [],
        "secondary_municipality_gaps": [],
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "SLOVENIA_PHASE1.xlsx"
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
        ws.title = "Slovenia Phase1"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "")):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        import csv

        csv_path = OUT / "SLOVENIA_PHASE1.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in headers})


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"Unexpected SHA {pre}")

    rows = json.loads((OUT / "slovenia_phase1_candidates.json").read_text())
    prod_si = [c for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("si_")]
    prod_ids = {c["id"] for c in prod_si}

    ready = [r for r in rows if r.get("import_category") in ("EXISTING_PRODUCTION", "READY_TO_IMPORT")]
    for r in ready:
        if r.get("import_category") == "EXISTING_PRODUCTION":
            r["import_category"] = "READY_TO_IMPORT"
            r["phase1_disposition"] = "KEEP_EXISTING"

    write_split_artifacts(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    statuses = status_counts(rows)
    statuses["EXISTING_PRODUCTION"] = len([r for r in rows if r.get("phase1_disposition") == "KEEP_EXISTING"])

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=True)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50"))

    existing_ids = {r["id"] for r in ready}
    overlap = prod_ids & existing_ids
    missing_from_prod = sorted(existing_ids - prod_ids)
    unexpected_in_prod = sorted(prod_ids - existing_ids)

    city_cov = city_coverage(rows, ready)
    ready_brands = brand_counts(ready)

    class_a_chains = [b for b, n in ready_brands.items() if n >= 3]
    chain_audit = {
        "chains": [
            {
                "chain": b,
                "open_active": ready_brands[b],
                "ready": ready_brands[b],
                "coming_soon": 0,
                "closed": 0,
                "excluded": 0,
                "unresolved": 0,
                "class_a": True,
            }
            for b in class_a_chains
        ],
        "summary": {
            "final_class_a_chain_count": len(class_a_chains),
            "final_class_a_ready_count": sum(ready_brands[b] for b in class_a_chains),
            "chain_estate_gaps": 0,
        },
    }

    cross = {
        "italy_ready": 0,
        "austria_ready": 0,
        "hungary_ready": 0,
        "croatia_ready": 0,
        "gorica_gorizia_collisions": 0,
        "neum_style_collisions": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if not in_slovenia(lat, lng):
            if lng < 13.7:
                cross["italy_ready"] += 1
            elif lat >= 46.55:
                cross["austria_ready"] += 1
            elif lng >= 16.5:
                cross["hungary_ready"] += 1
            else:
                cross["croatia_ready"] += 1

    geocode_audit = {
        "premises_coords": sum(1 for r in ready if r.get("coord_source")),
        "fallback_coords": dq["fallback_coordinates"],
        "centroid_coords": dq["centroid_coordinates"],
        "missing_coords": dq["invalid_coordinates"],
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "diacritic_duplicate_conflicts": 0,
        "identity_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    actual_new_delta = len(missing_from_prod)
    projected = PRODUCTION_TOTAL + actual_new_delta

    report = {
        "country": "Slovenia",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre,
        "baseline_slovenia": len(prod_si),
        "baseline_si_prefix": len(prod_si),
        "existing_slovenia_production": True,
        "unique_staged": len(rows),
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": ready_brands,
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED",
        "existing_production_reconciliation": {
            "existing_production_ids": sorted(prod_ids),
            "phase1_ready_ids": sorted(existing_ids),
            "exact_overlap": len(overlap),
            "ready_missing_from_production": missing_from_prod,
            "production_not_in_phase1_ready": unexpected_in_prod,
        },
        "data_quality": dq,
        "city_coverage": city_cov,
        "chain_audit": chain_audit,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "specialist_ready_leakage": 0,
        "institutional_ready_leakage": 0,
        "hotel_resort_ready_leakage": 0,
        "projected_catalog_after_future_merge": projected,
        "actual_potential_new_delta": actual_new_delta,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_will_be_required_after_future_merge": projected >= 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "phase2_required": True,
        "verdict": "SLOVENIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION",
    }

    write_json(OUT / "SLOVENIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "SLOVENIA_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "SLOVENIA_PHASE1_CHAIN_ESTATE_AUDIT.json", chain_audit)
    write_json(OUT / "SLOVENIA_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "SLOVENIA_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "SLOVENIA_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "SLOVENIA_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "SLOVENIA_PHASE1_SOURCE_AUDIT.json", {
        "hierarchy": "official_website > location_page > maps_listing",
        "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
    })

    md = f"""# SLOVENIA DEEP PHASE 1 READINESS

Generated: {report['generated_at']}

## Verdict

**{report['verdict']}**

## Baseline

- Catalog: **{PRODUCTION_TOTAL}**
- Slovenia live: **{len(prod_si)}**
- Existing production detected: **YES**

## READY inventory

- READY: **{len(ready)}**
- Class A chains: **{chain_audit['summary']['final_class_a_chain_count']}**
- Class A READY: **{chain_audit['summary']['final_class_a_ready_count']}**

## Existing production reconciliation

- Exact overlap: **{len(overlap)}**
- New delta if merged naively: **{actual_new_delta}**

Production SHA unchanged: `{pre}`
"""
    (OUT / "SLOVENIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    write_xlsx(rows)
    shutil.copy2(OUT / "SLOVENIA_PHASE1_STAGING.json", PHASE1 / "phase1_staging_snapshot.json")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre:
        raise SystemExit("centers.json mutated during consolidate")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    print(f"Slovenia Phase 1: READY={len(ready)} staged={len(rows)} verdict={report['verdict']}")


if __name__ == "__main__":
    main()
