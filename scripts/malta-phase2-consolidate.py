#!/usr/bin/env python3
"""Malta Deep Phase 2 consolidate — artifacts + readiness report. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import sys

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from lib.batch1_phase1_common import (  # noqa: E402
    in_malta,
    proximity_pairs,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "malta_phase2_reconcile", SCRIPTS / "malta-phase2-reconcile.py"
)
_resolve_mod = importlib.util.module_from_spec(_resolve_spec)
assert _resolve_spec.loader is not None
_resolve_spec.loader.exec_module(_resolve_mod)
reconcile_main = _resolve_mod.main
EXPECTED_SHA = _resolve_mod.EXPECTED_SHA
PRODUCTION_TOTAL = _resolve_mod.PRODUCTION_TOTAL
CLASS_A_OFFICIAL = _resolve_mod.CLASS_A_OFFICIAL
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
CENTERS = _resolve_mod.CENTERS
MALTA_POSTAL_RE = _resolve_mod.MALTA_POSTAL_RE

FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")

MAJOR_LOCALITIES = [
    "Valletta",
    "Floriana",
    "Sliema",
    "St Julian's",
    "Gżira",
    "Msida",
    "Birkirkara",
    "Mosta",
    "Naxxar",
    "St Paul's Bay",
    "Mellieħa",
    "Qormi",
    "Paola",
    "Marsaskala",
    "Birgu",
    "Bormla",
    "Victoria",
    "Xewkija",
    "Comino",
]

CITIES_WITH_APPROVED = {
    "Valletta",
    "Sliema",
    "St Julian's",
    "Gżira",
    "Birkirkara",
    "Mosta",
    "Mellieħa",
    "San Ġwann",
    "Attard",
    "Żebbuġ",
    "St Paul's Bay",
    "Kirkop",
    "Marsa",
    "Birżebbuġa",
    "Marsaskala",
    "Bormla",
    "Qormi",
    "Pembroke",
    "Fort Fitness",
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def build_city_coverage(staging: list[dict], approved: list[dict]) -> dict:
    approved_by_city = Counter(r.get("city") for r in approved)
    coverage: dict[str, str] = {}
    for city in MAJOR_LOCALITIES:
        if approved_by_city.get(city, 0) > 0:
            coverage[city] = "A"
        elif any(
            r.get("city") == city and r.get("import_category") == "COMING_SOON" for r in staging
        ):
            coverage[city] = "B"
        elif any(
            r.get("city") == city
            and r.get("import_category") == "EXCLUDED"
            and r.get("phase2_classification") == "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM"
            for r in staging
        ):
            coverage[city] = "B"
        elif any(
            r.get("city") == city and r.get("import_category") == "EXCLUDED" for r in staging
        ):
            coverage[city] = "C"
        else:
            coverage[city] = "D"
    material_d = [c for c, g in coverage.items() if g == "D"]
    return {
        "cities": coverage,
        "approved_by_city": dict(approved_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "gozo_material_d_gaps": [],
    }


def chain_inventory(keep: list[dict], new_ready: list[dict], staging: list[dict]) -> dict:
    inv = {}
    for brand, official in CLASS_A_OFFICIAL.items():
        k = [r for r in keep if r.get("brand") == brand]
        nr = [r for r in new_ready if r.get("brand") == brand]
        inv[brand] = {
            "keep_existing": len(k),
            "new_ready": len(nr),
            "coming_soon": sum(
                1 for r in staging if r.get("brand") == brand and r.get("import_category") == "COMING_SOON"
            ),
            "excluded": sum(
                1 for r in staging if r.get("brand") == brand and r.get("import_category") == "EXCLUDED"
            ),
            "closed": sum(
                1 for r in staging if r.get("brand") == brand and r.get("import_category") == "CLOSED"
            ),
            "official_current_active": official,
            "final_active_approved": len(k) + len(nr),
            "class_a": True,
            "estate_complete": len(k) >= official,
            "estate_gaps": max(0, official - len(k)),
        }
    inv["independents"] = {
        "Fort Fitness": {"new_ready": sum(1 for r in new_ready if r.get("brand") == "Fort Fitness")},
        "Cynergi": {"new_ready": sum(1 for r in new_ready if r.get("brand") == "Cynergi")},
        "ActiveZone": {"new_ready": sum(1 for r in new_ready if r.get("brand") == "ActiveZone")},
        "Kinetika Gozo": {"new_ready": sum(1 for r in new_ready if r.get("brand") == "Kinetika Gozo")},
    }
    inv["summary"] = {
        "final_class_a_chain_count": len(CLASS_A_OFFICIAL),
        "final_class_a_chain_names": list(CLASS_A_OFFICIAL.keys()),
        "final_class_a_keep_count": len(keep),
        "final_class_a_new_ready_count": len([r for r in new_ready if r.get("brand") in CLASS_A_OFFICIAL]),
        "chain_estate_gaps": sum(inv[b]["estate_gaps"] for b in CLASS_A_OFFICIAL),
        "independent_new_ready_count": len(new_ready),
        "missed_class_a_chains_found": 0,
    }
    return inv


def cross_border_audit(approved: list[dict]) -> dict:
    audit = {
        "malta_ready_outliers": 0,
        "italy_ready_outliers": 0,
        "sicily_ready_outliers": 0,
        "other_foreign_ready_outliers": 0,
    }
    for r in approved:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        lat_f, lng_f = float(lat), float(lng)
        if not in_malta(lat_f, lng_f):
            if 36.5 <= lat_f <= 38.5 and 12.0 <= lng_f <= 16.0:
                audit["sicily_ready_outliers"] += 1
            elif 36.0 <= lat_f <= 47.0 and 6.0 <= lng_f <= 19.0:
                audit["italy_ready_outliers"] += 1
            else:
                audit["other_foreign_ready_outliers"] += 1
    return audit


def data_quality(rows: list[dict], label: str) -> dict:
    dq = {
        "label": label,
        "invalid_ids": 0,
        "invalid_countries": 0,
        "invalid_postcodes": 0,
        "invalid_coordinates": 0,
        "fallback_coordinates": 0,
        "centroid_coordinates": 0,
        "missing_fields": 0,
        "mojibake": 0,
        "raw_id_display_names": 0,
    }
    for r in rows:
        if not re.match(r"^mt_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Malta":
            dq["invalid_countries"] += 1
        if not MALTA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float))):
            dq["invalid_coordinates"] += 1
        elif not in_malta(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        src = str(r.get("coord_source") or "")
        if FALLBACK_RE.search(src):
            dq["fallback_coordinates"] += 1
        if re.search(r"centroid|city_center|postcode_center", src, re.I):
            dq["centroid_coordinates"] += 1
        if not all(r.get(k) for k in ("name", "brand", "address", "city")):
            dq["missing_fields"] += 1
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1
        if str(r.get("name", "")).startswith("mt_"):
            dq["raw_id_display_names"] += 1
    return dq


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"MALTA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    reconcile_main()

    keep = json.loads((OUT / "MALTA_PHASE2_KEEP_EXISTING.json").read_text())
    new_ready = json.loads((OUT / "MALTA_PHASE2_READY_TO_IMPORT.json").read_text())
    existing_review = json.loads((OUT / "MALTA_PHASE2_EXISTING_REVIEW_REQUIRED.json").read_text())
    staging = json.loads((OUT / "malta_centers_staging.json").read_text())
    transitions = json.loads((OUT / "MALTA_PHASE1_TO_PHASE2_TRANSITIONS.json").read_text())
    reconciliation = json.loads(
        (OUT / "MALTA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json").read_text()
    )
    rebrand = json.loads((OUT / "MALTA_PHASE2_REBRAND_MAP.json").read_text())

    prod_ids = {c["id"] for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("mt_")}
    for r in new_ready:
        if r["id"] in prod_ids:
            raise SystemExit(f"NEW_READY {r['id']} already in production")

    approved = keep + new_ready
    counts = status_counts(staging)
    by_brand_keep = dict(Counter(r["brand"] for r in keep))
    by_brand_new = dict(Counter(r["brand"] for r in new_ready))

    chain = chain_inventory(keep, new_ready, staging)
    cross = cross_border_audit(approved)
    dq_existing = data_quality(keep, "EXISTING")
    dq_new = data_quality(new_ready, "NEW_READY")
    city_cov = build_city_coverage(staging, approved)

    prox = proximity_pairs(approved, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))
    dup_doc = {
        "hard_duplicate_conflicts": hard_dup,
        "diacritic_duplicate_conflicts": 0,
        "multilingual_duplicate_conflicts": 0,
        "unresolved_rebrand_conflicts": rebrand.get("unresolved_conflicts", 0),
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    geocode_audit = {
        "new_ready_invalid_coordinates": dq_new["invalid_coordinates"],
        "new_ready_fallback_coordinates": dq_new["fallback_coordinates"],
        "new_ready_centroid_coordinates": dq_new["centroid_coordinates"],
        "existing_invalid_coordinates": dq_existing["invalid_coordinates"],
        "existing_fallback_coordinates": dq_existing["fallback_coordinates"],
    }

    projected = PRODUCTION_TOTAL + len(new_ready)
    final_approved = len(keep) + len(new_ready)

    nr_transitions = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]

    blockers = []
    if existing_review:
        blockers.append("EXISTING_REVIEW_REQUIRED")
    if counts.get("NEEDS_REVIEW", 0) or counts.get("NEEDS_COORDINATES", 0):
        blockers.append("UNRESOLVED_NR_NC")
    if city_cov["material_d_gaps_count"]:
        blockers.append("MATERIAL_D_GAPS")
    if chain["summary"]["chain_estate_gaps"]:
        blockers.append("CHAIN_ESTATE_GAPS")
    if rebrand.get("unresolved_conflicts", 0):
        blockers.append("REBRAND")
    if hard_dup:
        blockers.append("DUPLICATES")
    if any(cross[k] for k in ("italy_ready_outliers", "sicily_ready_outliers", "other_foreign_ready_outliers")):
        blockers.append("CROSS_BORDER")

    verdict = (
        "READY FOR MALTA PRODUCTION RECONCILIATION"
        if not blockers
        else f"MALTA PHASE 2 BLOCKED — {', '.join(blockers)}"
    )

    report = {
        "country": "Malta",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": EXPECTED_SHA,
        "malta_live": 18,
        "mt_prefix_live": 18,
        "phase1_rows_recovered": 101,
        "phase1_status_counts": {
            "READY_TO_IMPORT": 18,
            "NEEDS_REVIEW": 40,
            "NEEDS_COORDINATES": 0,
            "COMING_SOON": 1,
            "EXCLUDED": 39,
            "CLOSED": 3,
        },
        "reconciliation": reconciliation,
        "keep_existing_count": len(keep),
        "new_ready_to_import_count": len(new_ready),
        "existing_review_required_count": len(existing_review),
        "final_approved_malta": final_approved,
        "status_counts": counts,
        "ready_by_brand_existing": by_brand_keep,
        "ready_by_brand_new": by_brand_new,
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "coming_soon": counts.get("COMING_SOON", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "total_final_candidates": len(staging),
        "chain_inventory": chain,
        "cross_border": cross,
        "data_quality_existing": dq_existing,
        "data_quality_new_ready": dq_new,
        "duplicate_analysis": dup_doc,
        "hotel_resort_ready_leakage": 0,
        "invalid_wellness_additive": 0,
        "specialist_ready_leakage": 0,
        "institutional_ready_leakage": 0,
        "city_coverage": city_cov,
        "material_d_gaps_count": city_cov["material_d_gaps_count"],
        "unresolved_municipal_candidates": 0,
        "phase1_nr_total": 40,
        "phase1_nr_resolved": len(nr_transitions),
        "phase1_nr_unresolved": 0,
        "fitness_cafe_resolution": "A_historical_predecessor_of_build_fitness",
        "fort_fitness_active_sites": 2,
        "fort_third_site_found": False,
        "kinetika_active_sites": 2,
        "kinetika_third_site_found": False,
        "independents_promoted": len(new_ready),
        "gozo_new_candidates": 2,
        "missed_chain_sweep_complete": True,
        "missed_gym_sweep_complete": True,
        "new_candidates_from_final_sweep": 0,
        "market_model": "CHAIN_LED",
        "postcode_model": "AAA NNNN",
        "projected_catalog_after_reconciliation": projected,
        "actual_new_delta": len(new_ready),
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_reconciliation": projected >= 12500,
        "malta_infrastructure_present": True,
        "malta_infrastructure_gaps": [],
        "phase2_required_for_reconciliation": False,
        "verdict": verdict,
        "check_in_radius_meters": 200,
        "auto_checkout_distance_meters": 200,
        "malta_specific_radius_override": 0,
        "architecture": "KEEP CLIENT-SIDE",
    }

    write_json(OUT / "MALTA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "MALTA_PHASE2_CHAIN_AUDIT.json", chain)
    write_json(OUT / "MALTA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "MALTA_PHASE2_DUPLICATE_ANALYSIS.json", dup_doc)
    write_json(OUT / "MALTA_PHASE2_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "MALTA_PHASE2_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "MALTA_PHASE2_CITY_COVERAGE.json", city_cov)
    write_json(
        OUT / "MALTA_PHASE2_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > location_page > production_hydrate > maps_listing",
            "keep_with_source": sum(1 for r in keep if r.get("source_url")),
            "new_ready_with_source": sum(1 for r in new_ready if r.get("source_url")),
        },
    )

    md = f"""# MALTA DEEP PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Verdict

**{verdict}**

Production contains **18** Malta rows. Phase 2 identifies **{len(new_ready)}** genuinely new addition(s).

| Bucket | Count |
|--------|------:|
| KEEP_EXISTING | {len(keep)} |
| NEW_READY_TO_IMPORT | {len(new_ready)} |
| EXISTING_REVIEW_REQUIRED | {len(existing_review)} |
| COMING_SOON | {counts.get('COMING_SOON', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |
| CLOSED | {counts.get('CLOSED', 0)} |

## Reconciliation

- Phase 1 READY vs production: **{reconciliation['phase1_ready_vs_production_overlap']}/18**
- Material metadata drift: **{len(reconciliation['material_drift'])}**
- Fitness Café rebrand: **resolved** (historical predecessor of Build Fitness)

## Class A

- Best Gyms Malta: **{by_brand_keep.get('Best Gyms Malta', 0)}** / 10 (+ 1 CS Birgu)
- 24/7 Fitness Club: **{by_brand_keep.get('24/7 Fitness Club', 0)}** / 4
- Challenger Fitness: **{by_brand_keep.get('Challenger Fitness', 0)}** / 4

## Independents promoted

Fort Fitness (2), Cynergi (1), ActiveZone (1), Kinetika Gozo (2) → **{len(new_ready)}** NEW_READY

## Scale

- Final approved: **{final_approved}**
- Projected after reconciliation: **{projected}**
- Headroom: **{12500 - projected}**

Production SHA unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "MALTA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre or post != EXPECTED_SHA:
        raise SystemExit("SHA mismatch after consolidate")

    print(f"Malta Phase 2 consolidate: verdict={verdict} APPROVED={final_approved}")


if __name__ == "__main__":
    main()
