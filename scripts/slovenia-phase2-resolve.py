#!/usr/bin/env python3
"""Slovenia Deep Phase 2 — reconcile staging against existing production (read-only).

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    in_slovenia,
    status_counts,
    write_json,
)

OUT = ROOT / "data/slovenia"
PHASE2 = OUT / "phase2"
PHASE1_SNAP = OUT / "phase1/phase1_staging_snapshot.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

# Phase 1 NEEDS_REVIEW → terminal NEW_READY (verified conventional independent)
ALFA_GYM_RESOLUTION = {
    "id": "si_c516823c91",
    "disposition": "NEW_READY_TO_IMPORT",
    "lat": 46.0644996,
    "lng": 14.5084024,
    "coord_source": "OSM_BUILDING_PREMISES",
    "evidence": (
        "alfagym.si / alfa-gym.si Dunajska 49; 1490m2 conventional public gym; "
        "day passes + memberships; OSM building geocode"
    ),
    "phase2_classification": "SMALL_MARKET_INDEPENDENT",
    "eligibility": "CONVENTIONAL_PUBLIC_GYM",
}

# Phase 1 exclusions — terminally reaffirmed
PHASE1_EXCLUSIONS = {
    "si_17d20208a0": "EXCLUDED_mixed_spa_pool; single-site pool/spa heavy",
    "si_5a769d4c7c": "4P Fitness — 2 locations total; sub Class A threshold",
    "si_9b758920d5": "4P Fitness — 2 locations total; sub Class A threshold",
    "si_6fc5e9a842": "Fit13 — 2-site boutique; below Class A threshold",
    "si_2c004d273b": "Gorizia=Italy border probe; never Slovenia production",
}


def load_production_si() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("si_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Slovenia",
                "lat": c.get("lat") if c.get("lat") is not None else c.get("latitude"),
                "lng": c.get("lng") if c.get("lng") is not None else c.get("longitude"),
                "is_active": c.get("is_active", True),
                "is_coming_soon": c.get("is_coming_soon", False),
                "is_closed": c.get("is_closed", False),
                "coord_source": c.get("coord_source"),
                "eligibility": c.get("eligibility"),
                "classification": c.get("classification"),
            }
        )
    return rows


def metadata_match(a: dict, b: dict) -> bool:
    keys = ("name", "brand", "city", "country")
    for k in keys:
        if str(a.get(k) or "").strip() != str(b.get(k) or "").strip():
            return False
    if a.get("lat") is None or b.get("lat") is None:
        return False
    if abs(float(a["lat"]) - float(b["lat"])) >= 0.0001:
        return False
    if abs(float(a["lng"]) - float(b["lng"])) >= 0.0001:
        return False
    return True


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert pre_sha == EXPECTED_SHA, f"Unexpected SHA {pre_sha}"

    prod_rows = load_production_si()
    assert len(prod_rows) == 32, f"Expected 32 si_* production rows, got {len(prod_rows)}"
    prod_by_id = {r["id"]: r for r in prod_rows}
    prod_ids = set(prod_by_id)

    write_json(PHASE2 / "SLOVENIA_EXISTING_PRODUCTION_SNAPSHOT.json", prod_rows)

    phase1_rows = json.loads(PHASE1_SNAP.read_text(encoding="utf-8"))
    assert len(phase1_rows) == 38
    write_json(PHASE2 / "SLOVENIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    phase1_ids = {r["id"] for r in phase1_rows}
    snap_ids = {r["id"] for r in json.loads(PHASE1_SNAP.read_text(encoding="utf-8"))}
    missing_ids = sorted(snap_ids - phase1_ids)

    ready_rows = [r for r in phase1_rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_ids = {r["id"] for r in ready_rows}

    reconciliation = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "phase1_ready": len(ready_rows),
        "existing_production": len(prod_rows),
        "exact_id_match_count": len(ready_ids & prod_ids),
        "ready_already_in_production": sorted(ready_ids & prod_ids),
        "ready_missing_from_production": sorted(ready_ids - prod_ids),
        "production_not_in_phase1_ready": sorted(prod_ids - ready_ids),
        "metadata_matches": [],
        "metadata_drift": [],
        "cosmetic_metadata_drift": [],
        "material_metadata_drift": [],
    }

    for rid in sorted(ready_ids & prod_ids):
        pr = next(r for r in ready_rows if r["id"] == rid)
        prod = prod_by_id[rid]
        if metadata_match(pr, prod):
            reconciliation["metadata_matches"].append(rid)
        else:
            drift_entry = {
                "id": rid,
                "phase1": {k: pr.get(k) for k in ("name", "brand", "address", "postal_code", "city", "lat", "lng")},
                "production": {
                    k: prod.get(k)
                    for k in ("name", "brand", "address", "postal_code", "city", "lat", "lng")
                },
            }
            reconciliation["metadata_drift"].append(drift_entry)
            if (
                pr.get("name") == prod.get("name")
                and pr.get("brand") == prod.get("brand")
                and pr.get("city") == prod.get("city")
                and pr.get("lat") is not None
                and abs(float(pr["lat"]) - float(prod["lat"])) < 0.0001
            ):
                reconciliation["cosmetic_metadata_drift"].append(drift_entry)
            else:
                reconciliation["material_metadata_drift"].append(drift_entry)

    reconciliation["metadata_match_count"] = len(reconciliation["metadata_matches"])
    reconciliation["metadata_drift_count"] = len(reconciliation["metadata_drift"])
    reconciliation["material_metadata_drift_count"] = len(reconciliation["material_metadata_drift"])
    write_json(OUT / "SLOVENIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

    decisions: list[dict] = []
    staging: list[dict] = []
    keep_existing: list[dict] = []
    new_ready: list[dict] = []
    existing_review: list[dict] = []

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""

        if rid in prod_ids:
            disp = "KEEP_EXISTING"
            row["import_category"] = "KEEP_EXISTING"
            row["phase2_disposition"] = disp
            row["is_active"] = True
            row["is_coming_soon"] = False
            row["eligibility"] = row.get("eligibility") or "CHAIN_CLASS_A"
            row["phase2_classification"] = row.get("phase2_classification") or "A_CONVENTIONAL_PUBLIC_GYM"
            keep_existing.append({**row, "production_snapshot": prod_by_id[rid]})
        elif rid == ALFA_GYM_RESOLUTION["id"]:
            disp = ALFA_GYM_RESOLUTION["disposition"]
            row["import_category"] = "NEW_READY_TO_IMPORT"
            row["phase2_disposition"] = disp
            row["lat"] = ALFA_GYM_RESOLUTION["lat"]
            row["lng"] = ALFA_GYM_RESOLUTION["lng"]
            row["coord_source"] = ALFA_GYM_RESOLUTION["coord_source"]
            row["is_active"] = True
            row["is_coming_soon"] = False
            row["phase2_classification"] = ALFA_GYM_RESOLUTION["phase2_classification"]
            row["eligibility"] = ALFA_GYM_RESOLUTION["eligibility"]
            row["notes"] = (row.get("notes") or "") + f"; phase2_resolved: {ALFA_GYM_RESOLUTION['evidence']}"
            new_ready.append(row)
        elif rid in PHASE1_EXCLUSIONS or cat == "EXCLUDED":
            disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = disp
            row["is_active"] = False
            row["notes"] = (row.get("notes") or "") + f"; phase2_reaffirmed: {PHASE1_EXCLUSIONS.get(rid, 'excluded')}"
        elif cat in ("NEEDS_REVIEW", "NEEDS_COORDINATES"):
            disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = disp
            row["notes"] = (row.get("notes") or "") + "; phase2_unresolved_excluded"
        else:
            disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = disp

        decisions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "phase1_category": cat,
                "phase2_disposition": row.get("phase2_disposition", disp),
                "in_production": rid in prod_ids,
            }
        )
        staging.append(row)

    write_json(PHASE2 / "SLOVENIA_PHASE2_DECISIONS.json", decisions)
    write_json(OUT / "SLOVENIA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "SLOVENIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "SLOVENIA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "slovenia_centers_staging.json", staging)

    write_json(
        OUT / "SLOVENIA_PHASE2_COMING_SOON.json",
        [r for r in staging if r.get("import_category") == "COMING_SOON"],
    )
    write_json(
        OUT / "SLOVENIA_PHASE2_EXCLUDED.json",
        [r for r in staging if r.get("import_category") == "EXCLUDED"],
    )
    write_json(
        OUT / "SLOVENIA_PHASE2_CLOSED.json",
        [r for r in staging if r.get("import_category") == "CLOSED"],
    )

    alfa_audit = {
        "id": ALFA_GYM_RESOLUTION["id"],
        "phase1_status": "NEEDS_REVIEW",
        "final_disposition": ALFA_GYM_RESOLUTION["disposition"],
        "evidence": ALFA_GYM_RESOLUTION["evidence"],
        "locations_in_slovenia": 1,
        "class_a_eligible": False,
        "small_market_independent": True,
    }
    write_json(PHASE2 / "alfa_gym_resolution.json", alfa_audit)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre_sha,
        "phase1_rows_recovered": len(phase1_rows),
        "phase1_ids_preserved": len(phase1_ids),
        "phase1_ids_missing": len(missing_ids),
        "keep_existing": len(keep_existing),
        "new_ready_to_import": len(new_ready),
        "existing_review_required": len(existing_review),
        "status_counts": status_counts(staging),
        "reconciliation": {
            "exact_id_match": reconciliation["exact_id_match_count"],
            "metadata_drift": reconciliation["metadata_drift_count"],
            "material_metadata_drift": reconciliation["material_metadata_drift_count"],
        },
        "alfa_gym": alfa_audit,
    }
    write_json(PHASE2 / "recovery_log.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert post_sha == pre_sha
    print(
        f"Slovenia Phase 2 resolve: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"EXCLUDED={summary['status_counts'].get('EXCLUDED', 0)} "
        f"REVIEW={len(existing_review)}"
    )


if __name__ == "__main__":
    main()
