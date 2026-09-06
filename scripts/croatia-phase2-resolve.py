#!/usr/bin/env python3
"""Croatia Deep Phase 2 — resolve staging against existing production (read-only).

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    CROATIA_POSTAL_RE,
    ROOT,
    in_croatia,
    status_counts,
    write_json,
)

OUT = ROOT / "data/croatia"
PHASE2 = OUT / "phase2"
PHASE1_SNAP = OUT / "phase1/phase1_staging_snapshot.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

# Phase 1 NEEDS_REVIEW → terminal COMING_SOON (official Gyms4you coming-soon pages)
NR_TO_COMING_SOON = {
    "hr_d7d57e7e6b": "Gyms4you Spinut — official coming-soon early 2027",
    "hr_ce961ae600": "Gyms4you Heinzelova x Vukovarska — official uskoro otvoreno",
}

COMING_SOON_EVIDENCE = {
    "hr_f3f2371e7f": "official_page_otvorenje_proljece_2026",
    "hr_ee18805422": "official_page_uskoro_otvoreno",
    "hr_096e0c854b": "official_locator_OPENING_SOON",
    "hr_eff3e7d13c": "official_page_uskoro_otvoreno_2026",
    "hr_3c82eb55d7": "official_data_keys_coming_soon",
    "hr_6c2849e74b": "official_data_keys_coming_soon",
    "hr_d7d57e7e6b": "official_spinut_early_2027",
    "hr_ce961ae600": "official_heinzelova_x_vukovarska_uskoro",
}

HOTEL_WELLNESS = {
    "hr_e99d3d2a6c": {
        "name": "THE Fitness Hotel Novi Zagreb",
        "classification": "WELLNESS_ADDITIVE",
        "evidence": "Public Multiclub membership; substantial gym floor; hotel-sited but ordinary member access",
    },
    "hr_a0ec1a2c32": {
        "name": "THE Fitness Zonar",
        "classification": "WELLNESS_ADDITIVE",
        "evidence": "Public membership at zonar.thefitness.hr; conventional gym + additive wellness",
    },
}

PIN_UPGRADES_PATH = PHASE2 / "g4y_pin_upgrades.json"


def load_production_hr() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("hr_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Croatia",
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
    # Address/postcode may differ cosmetically after merge geocode refinement
    return True


def apply_pin_upgrades(row: dict, upgrades: dict[str, dict]) -> None:
    up = upgrades.get(row["id"])
    if not up:
        return
    row["lat"], row["lng"] = up["new"][0], up["new"][1]
    row["coord_source"] = "GOOGLE_PLACE_PIN"
    row["notes"] = (row.get("notes") or "") + "; phase2_pin_upgrade"


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert pre_sha == EXPECTED_SHA, f"Unexpected SHA {pre_sha}"

    production = load_production_hr()
    assert len(production) == 80

    write_json(PHASE2 / "CROATIA_EXISTING_PRODUCTION_SNAPSHOT.json", production)

    phase1_rows = json.loads(PHASE1_SNAP.read_text(encoding="utf-8"))
    write_json(PHASE2 / "CROATIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    p1_ready = [r for r in phase1_rows if r.get("import_category") == "READY_TO_IMPORT"]
    prod_by_id = {r["id"]: r for r in production}
    p1_ready_ids = {r["id"] for r in p1_ready}
    prod_ids = set(prod_by_id)

    reconciliation = {
        "phase1_ready": len(p1_ready),
        "existing_production": len(production),
        "ready_already_in_production": sorted(p1_ready_ids & prod_ids),
        "ready_missing_from_production": sorted(p1_ready_ids - prod_ids),
        "production_not_in_phase1_ready": sorted(prod_ids - p1_ready_ids),
        "exact_id_match_count": len(p1_ready_ids & prod_ids),
        "metadata_matches": [],
        "metadata_drift": [],
    }
    for rid in sorted(p1_ready_ids & prod_ids):
        pr = next(r for r in p1_ready if r["id"] == rid)
        prod = prod_by_id[rid]
        entry = {"id": rid, "match": metadata_match(pr, prod)}
        if entry["match"]:
            reconciliation["metadata_matches"].append(rid)
        else:
            drift_entry = {
                "id": rid,
                "phase1": {k: pr.get(k) for k in ("name", "brand", "address", "postal_code", "city", "lat", "lng")},
                "production": {k: prod.get(k) for k in ("name", "brand", "address", "postal_code", "city", "lat", "lng")},
            }
            reconciliation["metadata_drift"].append(drift_entry)
            # Cosmetic-only: same identity + coords, address/postcode refined in production
            if (
                pr.get("name") == prod.get("name")
                and pr.get("brand") == prod.get("brand")
                and pr.get("city") == prod.get("city")
                and pr.get("lat") is not None
                and abs(float(pr["lat"]) - float(prod["lat"])) < 0.0001
            ):
                reconciliation.setdefault("cosmetic_metadata_drift", []).append(drift_entry)
    reconciliation["metadata_match_count"] = len(reconciliation["metadata_matches"])
    reconciliation["metadata_drift_count"] = len(reconciliation["metadata_drift"])
    write_json(OUT / "CROATIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

    pin_upgrades = {}
    if PIN_UPGRADES_PATH.exists():
        for u in json.loads(PIN_UPGRADES_PATH.read_text(encoding="utf-8")):
            pin_upgrades[u["id"]] = u

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
            row["eligibility_candidate"] = "CHAIN_CLASS_A"
            row["phase2_classification"] = row.get("phase2_classification") or "A_CONVENTIONAL_PUBLIC_GYM"
            if rid in HOTEL_WELLNESS:
                row["phase2_classification"] = HOTEL_WELLNESS[rid]["classification"]
            apply_pin_upgrades(row, pin_upgrades)
            keep_existing.append({**row, "production_snapshot": prod_by_id[rid]})
        elif rid in NR_TO_COMING_SOON:
            disp = "COMING_SOON"
            row["import_category"] = "COMING_SOON"
            row["phase2_disposition"] = disp
            row["is_coming_soon"] = True
            row["is_active"] = False
            row["notes"] = (row.get("notes") or "") + f"; phase2_resolved_nr: {NR_TO_COMING_SOON[rid]}"
        elif cat == "COMING_SOON":
            disp = "COMING_SOON"
            row["import_category"] = "COMING_SOON"
            row["phase2_disposition"] = disp
            row["is_coming_soon"] = True
            row["is_active"] = False
        elif cat == "EXCLUDED":
            disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = disp
            row["is_active"] = False
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

    write_json(PHASE2 / "CROATIA_PHASE2_DECISIONS.json", decisions)
    write_json(OUT / "CROATIA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "CROATIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "CROATIA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "croatia_centers_staging.json", staging)

    coming_soon_resolved = [
        {
            "id": rid,
            "name": next(r["name"] for r in staging if r["id"] == rid),
            "phase1_status": "NEEDS_REVIEW" if rid in NR_TO_COMING_SOON else "COMING_SOON",
            "final_disposition": "COMING_SOON",
            "evidence": COMING_SOON_EVIDENCE.get(rid, ""),
        }
        for rid in sorted(set(COMING_SOON_EVIDENCE) | set(NR_TO_COMING_SOON))
    ]
    write_json(PHASE2 / "coming_soon_recheck.json", coming_soon_resolved)

    tf_audit = [
        {
            **v,
            "id": k,
            "disposition": "KEEP_EXISTING",
            "remain_ready": True,
        }
        for k, v in HOTEL_WELLNESS.items()
    ]
    write_json(PHASE2 / "the_fitness_access_audit.json", tf_audit)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre_sha,
        "phase1_rows_recovered": len(phase1_rows),
        "keep_existing": len(keep_existing),
        "new_ready_to_import": len(new_ready),
        "existing_review_required": len(existing_review),
        "status_counts": status_counts(staging),
        "reconciliation": {
            "exact_id_match": reconciliation["exact_id_match_count"],
            "metadata_drift": reconciliation["metadata_drift_count"],
        },
    }
    write_json(PHASE2 / "recovery_log.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert post_sha == pre_sha
    print(
        f"Croatia Phase 2 resolve: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"COMING_SOON={summary['status_counts'].get('COMING_SOON', 0)} "
        f"EXCLUDED={summary['status_counts'].get('EXCLUDED', 0)}"
    )


if __name__ == "__main__":
    main()
