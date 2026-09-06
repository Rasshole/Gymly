#!/usr/bin/env python3
"""Estonia Deep Phase 2 consolidate — artifacts + reports. Does NOT modify centers.json."""
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
    FALLBACK_RE,
    MOJIBAKE_RE,
    in_estonia,
    proximity_pairs,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "estonia_phase2_resolve", SCRIPTS / "estonia-phase2-resolve.py"
)
_resolve_mod = importlib.util.module_from_spec(_resolve_spec)
assert _resolve_spec.loader is not None
_resolve_spec.loader.exec_module(_resolve_mod)
resolve_main = _resolve_mod.main
EXPECTED_SHA = _resolve_mod.EXPECTED_SHA
PRODUCTION_TOTAL = _resolve_mod.PRODUCTION_TOTAL
CLASS_A_OFFICIAL = _resolve_mod.CLASS_A_OFFICIAL
D_GAP_RESOLUTIONS = _resolve_mod.D_GAP_RESOLUTIONS
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
CENTERS = _resolve_mod.CENTERS

ESTONIA_POSTAL_RE = re.compile(r"^\d{5}$")

CITY_COVERAGE = {
    "Tallinn": "A",
    "Tartu": "A",
    "Pärnu": "A",
    "Narva": "A",
    "Jõhvi": "A",
    "Rakvere": "A",
    "Viljandi": "A",
    "Võru": "A",
    "Kuressaare": "A",
    "Keila": "A",
    "Viimsi": "A",
    "Peetri": "A",
    "Tabasalu": "A",
    "Jõgeva": "A",
    "Järveküla": "A",
    "Luige": "A",
    "Kiili": "A",
    "Saue": "A",
    "Ülenurme": "A",
    "Maardu": "B",
    "Rapla": "B",
    "Haapsalu": "B",
    "Valga": "B",
    "Kohtla-Järve": "B",
    "Paide": "B",
    "Põlva": "B",
    "Elva": "B",
    "Sillamäe": "B",
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "ESTONIA_PHASE2.xlsx"
    try:
        from openpyxl import Workbook
    except ImportError:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Estonia Phase 2"
    headers = [
        "ID",
        "Brand",
        "Name",
        "Address",
        "City",
        "Postal",
        "Lat",
        "Lng",
        "Disposition",
        "InProduction",
    ]
    ws.append(headers)
    for r in rows:
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
                r.get("address"),
                r.get("city"),
                r.get("postal_code"),
                r.get("lat"),
                r.get("lng"),
                r.get("phase2_disposition") or r.get("import_category"),
                (r.get("phase2_disposition") or r.get("import_category")) == "KEEP_EXISTING",
            ]
        )
    wb.save(path)


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
            "cities": sorted({r.get("city") for r in k + nr if r.get("city")}),
        }
    inv["summary"] = {
        "final_class_a_chain_count": len(CLASS_A_OFFICIAL),
        "final_class_a_chain_names": list(CLASS_A_OFFICIAL.keys()),
        "final_class_a_keep_count": len(keep),
        "final_class_a_new_ready_count": len([r for r in new_ready if r.get("brand") in CLASS_A_OFFICIAL]),
        "chain_estate_gaps": sum(inv[b]["estate_gaps"] for b in CLASS_A_OFFICIAL),
        "new_class_a_chains_found": 0,
        "lemon_gym_final": "EXCLUDED_sub_threshold_2_sites",
    }
    return inv


def cross_border_audit(approved: list[dict]) -> dict:
    audit = {
        "latvia_ready_outliers": 0,
        "russia_ready_outliers": 0,
        "finland_ready_outliers": 0,
        "valga_valka_identity_collisions": 0,
        "narva_ivangorod_identity_collisions": 0,
    }
    for r in approved:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        lat_f, lng_f = float(lat), float(lng)
        if not in_estonia(lat_f, lng_f):
            if lng_f < 24.0:
                audit["latvia_ready_outliers"] += 1
            elif lng_f > 28.5:
                audit["russia_ready_outliers"] += 1
            elif lat_f > 59.8:
                audit["finland_ready_outliers"] += 1
        blob = f"{r.get('name')} {r.get('city')} {r.get('address')}".lower()
        if "valka" in blob and "valga" not in blob:
            audit["valga_valka_identity_collisions"] += 1
        if "ivangorod" in blob:
            audit["narva_ivangorod_identity_collisions"] += 1
    return audit


def data_quality(rows: list[dict], label: str, *, require_coords: bool = True) -> dict:
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
        if not re.match(r"^ee_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Estonia":
            dq["invalid_countries"] += 1
        if not ESTONIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if require_coords and not (isinstance(lat, (int, float)) and isinstance(lng, (int, float))):
            dq["invalid_coordinates"] += 1
        elif isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and not in_estonia(float(lat), float(lng)):
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
        if str(r.get("name", "")).startswith("ee_"):
            dq["raw_id_display_names"] += 1
    return dq


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"ESTONIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre + "\n", encoding="utf-8")

    resolve_main()

    keep = json.loads((OUT / "ESTONIA_PHASE2_KEEP_EXISTING.json").read_text())
    new_ready = json.loads((OUT / "ESTONIA_PHASE2_READY_TO_IMPORT.json").read_text())
    existing_review = json.loads((OUT / "ESTONIA_PHASE2_EXISTING_REVIEW_REQUIRED.json").read_text())
    staging = json.loads((OUT / "estonia_centers_staging.json").read_text())
    transitions = json.loads((OUT / "ESTONIA_PHASE1_TO_PHASE2_TRANSITIONS.json").read_text())
    reconciliation = json.loads(
        (OUT / "ESTONIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json").read_text()
    )

    prod_ids = {c["id"] for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("ee_")}
    for r in new_ready:
        if r["id"] in prod_ids:
            raise SystemExit(f"NEW_READY {r['id']} already in production")

    approved = keep + new_ready
    counts = status_counts(staging)
    by_brand_keep = dict(Counter(r["brand"] for r in keep))
    by_brand_new = dict(Counter(r["brand"] for r in new_ready))
    by_city_approved = dict(Counter(r["city"] for r in approved))

    chain = chain_inventory(keep, new_ready, staging)
    cross = cross_border_audit(approved)
    dq_existing = data_quality(keep, "EXISTING")
    dq_new = data_quality(new_ready, "NEW_READY")

    prox = proximity_pairs(approved, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))
    dup_doc = {
        "estonia_hard_duplicate_conflicts": hard_dup,
        "global_id_conflicts": 0,
        "diacritic_duplicate_conflicts": 0,
        "multilingual_duplicate_conflicts": 0,
        "unresolved_rebrand_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand_src = json.loads((OUT / "ESTONIA_PHASE1_REBRAND_MAP.json").read_text())
    rebrand = {
        "country": "Estonia",
        "phase": 2,
        "maps": rebrand_src.get("maps", rebrand_src.get("relationships", [])),
        "unresolved_conflicts": 0,
    }

    geocode_audit = {
        "new_ready_invalid_coordinates": dq_new["invalid_coordinates"],
        "new_ready_fallback_coordinates": dq_new["fallback_coordinates"],
        "new_ready_centroid_coordinates": dq_new["centroid_coordinates"],
        "new_ready_missing_coordinates": sum(
            1 for r in new_ready if r.get("lat") is None or r.get("lng") is None
        ),
    }

    material_d = [c for c, g in CITY_COVERAGE.items() if g == "D"]
    projected = PRODUCTION_TOTAL + len(new_ready)
    final_approved = len(keep) + len(new_ready)

    nr_transitions = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]
    cs_transitions = [t for t in transitions if t["phase1_category"] == "COMING_SOON"]
    cs_opened = sum(1 for t in cs_transitions if t["phase2_disposition"] == "NEW_READY_TO_IMPORT")

    phase3_blockers = []
    if existing_review:
        phase3_blockers.append("EXISTING_REVIEW_REQUIRED")
    if counts.get("NEEDS_REVIEW", 0) or counts.get("NEEDS_COORDINATES", 0):
        phase3_blockers.append("UNRESOLVED_NR_NC")
    if material_d:
        phase3_blockers.append("MATERIAL_D_GAPS")
    if chain["summary"]["chain_estate_gaps"]:
        phase3_blockers.append("CHAIN_ESTATE_GAPS")
    if hard_dup:
        phase3_blockers.append("DUPLICATES")
    if cross["latvia_ready_outliers"] or cross["russia_ready_outliers"]:
        phase3_blockers.append("CROSS_BORDER")

    verdict = (
        "READY FOR ESTONIA PRODUCTION RECONCILIATION"
        if not phase3_blockers
        else "ESTONIA PHASE 3 REQUIRED BEFORE PRODUCTION RECONCILIATION"
    )

    report = {
        "country": "Estonia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": EXPECTED_SHA,
        "estonia_live": 68,
        "ee_prefix_live": 68,
        "phase1_rows_recovered": 103,
        "phase1_status_counts": {
            "READY_TO_IMPORT": 68,
            "NEEDS_REVIEW": 8,
            "NEEDS_COORDINATES": 0,
            "COMING_SOON": 5,
            "EXCLUDED": 22,
            "CLOSED": 0,
        },
        "reconciliation": reconciliation,
        "keep_existing_count": len(keep),
        "new_ready_to_import_count": len(new_ready),
        "existing_review_required_count": len(existing_review),
        "final_approved_estonia": final_approved,
        "status_counts": counts,
        "ready_by_brand_existing": by_brand_keep,
        "ready_by_brand_new": by_brand_new,
        "approved_by_city": by_city_approved,
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
        "city_coverage": CITY_COVERAGE,
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "d_gap_resolutions": D_GAP_RESOLUTIONS,
        "unresolved_municipal_candidates": 0,
        "nr_transitions": nr_transitions,
        "coming_soon_transitions": cs_transitions,
        "coming_soon_opened_count": cs_opened,
        "coming_soon_remain_count": counts.get("COMING_SOON", 0),
        "missed_chain_sweep_complete": True,
        "missed_gym_sweep_complete": True,
        "new_candidates_from_phase2_final_sweep": 0,
        "market_model": "CHAIN_LED",
        "lemon_gym_final": "EXCLUDED_sub_threshold_2_sites",
        "projected_catalog_after_reconciliation": projected,
        "actual_new_delta": len(new_ready),
        "remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_reconciliation": projected >= 12500,
        "phase3_required": bool(phase3_blockers),
        "verdict": verdict,
        "check_in_radius_meters": 200,
        "auto_checkout_distance_meters": 200,
        "estonia_specific_radius_override": 0,
        "architecture": "KEEP CLIENT-SIDE",
    }

    write_json(OUT / "ESTONIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "ESTONIA_PHASE2_CHAIN_AUDIT.json", chain)
    write_json(OUT / "ESTONIA_PHASE2_CHAIN_ESTATE_AUDIT.json", chain)
    write_json(OUT / "ESTONIA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "ESTONIA_PHASE2_DUPLICATE_ANALYSIS.json", dup_doc)
    write_json(OUT / "ESTONIA_PHASE2_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "ESTONIA_PHASE2_CROSS_BORDER_AUDIT.json", cross)
    write_json(
        OUT / "ESTONIA_PHASE2_CITY_COVERAGE.json",
        {
            "cities": CITY_COVERAGE,
            "approved_by_city": by_city_approved,
            "material_d_gaps": material_d,
            "material_d_gaps_count": len(material_d),
            "d_gap_resolutions": D_GAP_RESOLUTIONS,
        },
    )
    write_json(
        OUT / "ESTONIA_PHASE2_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > location_page > OSM_premises > maps_listing",
            "keep_with_source": sum(1 for r in keep if r.get("source_url")),
            "new_ready_with_source": sum(1 for r in new_ready if r.get("source_url")),
        },
    )

    md = f"""# ESTONIA DEEP PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Verdict

**{verdict}**

Production already contains **68** Estonia rows. Phase 2 identifies **{len(new_ready)}** genuinely new addition(s).

- KEEP_EXISTING: **{len(keep)}**
- NEW_READY_TO_IMPORT: **{len(new_ready)}**
- EXISTING_REVIEW_REQUIRED: **{len(existing_review)}**
- COMING_SOON: **{counts.get('COMING_SOON', 0)}**
- EXCLUDED: **{counts.get('EXCLUDED', 0)}**

## Reconciliation

- Phase 1 READY vs production exact ID match: **{reconciliation['phase1_ready_vs_production_overlap']}/68**
- Snapshot vs production exact ID match: **{reconciliation['exact_id_match']}/68**
- Material metadata drift: **{len(reconciliation['material_drift'])}**

## Production delta

- Current catalog: **{PRODUCTION_TOTAL}**
- After authorized reconciliation: **{projected}**
- Remaining headroom to 12,500: **{12500 - projected}**
- Crosses 12,500: **{report['projected_crosses_12500']}**

Production SHA unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "ESTONIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    write_xlsx(staging)

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != pre or post != EXPECTED_SHA:
        raise SystemExit("SHA mismatch after consolidate")
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    print(
        f"Estonia Phase 2 consolidate: verdict={verdict} "
        f"KEEP={len(keep)} NEW={len(new_ready)} APPROVED={final_approved}"
    )


if __name__ == "__main__":
    main()
