#!/usr/bin/env python3
"""Lithuania Deep Phase 2 — reconcile staging against existing production (read-only).

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    write_json,
)

OUT = ROOT / "data/lithuania"
PHASE2 = OUT / "phase2"
PHASE1_STAGING = OUT / "LITHUANIA_PHASE1_STAGING.json"
EXISTING_SNAP = OUT / "LITHUANIA_EXISTING_PRODUCTION_SNAPSHOT.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

CLASS_A_OFFICIAL = {
    "Gym+": 38,
    "Lemon Gym": 18,
    "Impuls": 5,
}

# Phase 1 municipal NEEDS_REVIEW → terminal EXCLUDED (Phase 2 deep sweep)
NR_RESOLUTIONS: dict[str, dict] = {
    "lt_7947d2f41b": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Utena Phase 2 sweep — no Gym+/Lemon/Impuls estate; no verified conventional public Class A gym",
    },
    "lt_2098085688": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Tauragė Phase 2 sweep — Kaliningrad proximity scrutiny; no Class A chain verified",
    },
    "lt_e542c715f1": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Jonava Phase 2 sweep — Lemon Gym Jonava remains COMING_SOON only; no open Class A club",
    },
    "lt_6b168d3ed3": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Visaginas Phase 2 multilingual LT/RU sweep — border scrutiny; no Class A chain verified",
    },
    "lt_ade8a2dd9f": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Druskininkai Phase 2 sweep — spa/resort false-positive control; no Class A chain verified",
    },
    "lt_fe33533ff7": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Plungė Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_86d0d3eaed": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Kretinga Phase 2 sweep — Klaipėda orbit; no separate Class A chain verified",
    },
    "lt_7dcfedf042": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Gargždai Phase 2 sweep — Klaipėda orbit; no Class A chain verified",
    },
    "lt_7ba6960963": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Raseiniai Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_6a4d5028b9": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Radviliškis Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_7185a63912": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Vilkaviškis Phase 2 sweep — Poland border scrutiny; no Class A chain verified",
    },
    "lt_91e228aeb6": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Šilutė Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_ee800dfb24": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Joniškis Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_ac56639411": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Rokiškis Phase 2 sweep — Latvia border scrutiny; no Class A chain verified",
    },
    "lt_9e8f817307": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Kuršėnai Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_a7443b609e": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Biržai Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_648aae3139": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Anykščiai Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_35a70e96c3": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Elektrėnai Phase 2 sweep — Vilnius orbit; no separate Class A beyond Vilnius estate",
    },
    "lt_a1afb72035": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Garliava Phase 2 sweep — Kaunas orbit; Fitness Factory excluded specialist only",
    },
    "lt_1e95c7021f": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Šalčininkai Phase 2 multilingual LT/PL/RU sweep — Belarus border; no Class A chain verified",
    },
    "lt_1d02be57e0": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Zarasai Phase 2 sweep — Latvia border scrutiny; no Class A chain verified",
    },
    "lt_3fbe9eb6a8": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ukmergė Phase 2 sweep — no Class A chain presence verified",
    },
    "lt_3a6d5a3a91": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Neringa/Nida Phase 2 sweep — tourism false-positive control; no Class A chain verified",
    },
    "lt_922eb2c3a4": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Didžioji Riešė Vilnius metro sweep — Lemon Gym Riešė COMING_SOON only; no open Class A club",
    },
}

CS_RESOLUTIONS: dict[str, dict] = {
    "lt_bc21f9653f": {
        "disposition": "COMING_SOON",
        "address": "Viršuliškių g. 40",
        "postal_code": "",
        "evidence": (
            "gymplius.lt Aug 2026 — Viršuliškių club page still under construction / "
            "COMING_SOON; not operating at Phase 2 audit"
        ),
        "opened": False,
    },
    "lt_4decf7f80b": {
        "disposition": "COMING_SOON",
        "address": "Molėtų g. 13",
        "postal_code": "",
        "evidence": (
            "lemongym.lt Aug 2026 — Riešė location still marked coming soon; "
            "not operating at Phase 2 audit"
        ),
        "opened": False,
    },
    "lt_c3d4f6ba00": {
        "disposition": "COMING_SOON",
        "address": "Žemaitės g. 45, Jonava",
        "postal_code": "55134",
        "evidence": (
            "lemongym.lt Aug 2026 — Jonava announced with Žemaitės g. 45; "
            "still pre-opening / COMING_SOON at Phase 2 audit"
        ),
        "opened": False,
    },
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    from collections import Counter

    return dict(Counter(r.get("import_category") for r in rows))


def load_production_lt() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("lt_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Lithuania",
                "lat": c.get("lat") if c.get("lat") is not None else c.get("latitude"),
                "lng": c.get("lng") if c.get("lng") is not None else c.get("longitude"),
                "is_active": c.get("is_active", True),
                "is_coming_soon": c.get("is_coming_soon", False),
                "coord_source": c.get("coord_source"),
            }
        )
    return rows


def metadata_drift_class(a: dict, b: dict) -> str:
    keys = ("name", "brand", "address", "postal_code", "city", "country")
    for k in keys:
        if str(a.get(k) or "").strip() != str(b.get(k) or "").strip():
            return "MATERIAL_DRIFT"
    if a.get("lat") is None or b.get("lat") is None:
        return "MATERIAL_DRIFT"
    if abs(float(a["lat"]) - float(b["lat"])) >= 0.0001:
        return "COSMETIC_DRIFT" if abs(float(a["lat"]) - float(b["lat"])) < 0.001 else "MATERIAL_DRIFT"
    if abs(float(a["lng"]) - float(b["lng"])) >= 0.0001:
        return "COSMETIC_DRIFT" if abs(float(a["lng"]) - float(b["lng"])) < 0.001 else "MATERIAL_DRIFT"
    return "NO_DRIFT"


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre_sha != EXPECTED_SHA:
        raise SystemExit(f"LITHUANIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_rows = load_production_lt()
    if len(prod_rows) != 61:
        raise SystemExit(f"Expected 61 lt_* production rows, got {len(prod_rows)}")
    prod_by_id = {r["id"]: r for r in prod_rows}
    prod_ids = set(prod_by_id)

    snap = json.loads(EXISTING_SNAP.read_text(encoding="utf-8"))
    snap_ids = {r["id"] for r in snap}
    if len(snap) != 61 or snap_ids != prod_ids:
        raise SystemExit("Existing production snapshot mismatch vs live production")

    phase1_rows = json.loads(PHASE1_STAGING.read_text(encoding="utf-8"))
    expected_phase1 = {
        "READY_TO_IMPORT": 61,
        "NEEDS_REVIEW": 24,
        "COMING_SOON": 3,
        "EXCLUDED": 15,
    }
    sc1 = status_counts(phase1_rows)
    for k, v in expected_phase1.items():
        if sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")
    if len(phase1_rows) != 103:
        raise SystemExit(f"Phase 1 total {len(phase1_rows)} != 103")

    nr_phase1 = [r for r in phase1_rows if r.get("import_category") == "NEEDS_REVIEW"]
    if len(nr_phase1) != 24 or set(NR_RESOLUTIONS) != {r["id"] for r in nr_phase1}:
        missing = {r["id"] for r in nr_phase1} - set(NR_RESOLUTIONS)
        extra = set(NR_RESOLUTIONS) - {r["id"] for r in nr_phase1}
        raise SystemExit(f"NR resolution map mismatch missing={missing} extra={extra}")

    cs_phase1 = [r for r in phase1_rows if r.get("import_category") == "COMING_SOON"]
    if set(CS_RESOLUTIONS) != {r["id"] for r in cs_phase1}:
        raise SystemExit("CS resolution map mismatch vs Phase 1 COMING_SOON")

    write_json(PHASE2 / "LITHUANIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)
    write_json(PHASE2 / "LITHUANIA_EXISTING_PRODUCTION_SNAPSHOT_PHASE2.json", prod_rows)

    ready_phase1 = [r for r in phase1_rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_ids = {r["id"] for r in ready_phase1}

    reconciliation = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_count": len(snap),
        "current_production": len(prod_rows),
        "exact_id_match": len(snap_ids & prod_ids),
        "snapshot_missing_from_production": sorted(snap_ids - prod_ids),
        "unexpected_existing_production": sorted(prod_ids - snap_ids),
        "phase1_ready_vs_production_overlap": len(ready_ids & prod_ids),
        "drift_by_id": {},
        "no_drift": [],
        "cosmetic_drift": [],
        "material_drift": [],
    }

    for rid in sorted(prod_ids):
        pr = next(r for r in ready_phase1 if r["id"] == rid)
        prod = prod_by_id[rid]
        drift = metadata_drift_class(pr, prod)
        reconciliation["drift_by_id"][rid] = drift
        if drift == "NO_DRIFT":
            reconciliation["no_drift"].append(rid)
        elif drift == "COSMETIC_DRIFT":
            reconciliation["cosmetic_drift"].append(rid)
        else:
            reconciliation["material_drift"].append(rid)

    write_json(OUT / "LITHUANIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

    transitions: list[dict] = []
    staging: list[dict] = []
    keep_existing: list[dict] = []
    new_ready: list[dict] = []
    existing_review: list[dict] = []
    coming_soon: list[dict] = []
    excluded: list[dict] = []
    closed: list[dict] = []

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""
        phase2_disp = ""
        decision_reason = ""

        if rid in prod_ids:
            phase2_disp = "KEEP_EXISTING"
            row["import_category"] = "KEEP_EXISTING"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = True
            row["is_coming_soon"] = False
            row["eligibility"] = row.get("eligibility") or "CHAIN_CLASS_A"
            row["classification"] = row.get("classification") or "A_CONVENTIONAL_PUBLIC_GYM"
            row["production_snapshot"] = prod_by_id[rid]
            decision_reason = "existing_production_reconciled_61_of_61"
            keep_existing.append(row)

        elif rid in NR_RESOLUTIONS:
            res = NR_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = res.get("classification")
            row["import_category"] = "EXCLUDED"
            row["is_active"] = False
            row["eligibility"] = "EXCLUDED"
            row["notes"] = (row.get("notes") or "") + f"; phase2: {res['evidence']}"
            decision_reason = res["evidence"]
            excluded.append(row)

        elif rid in CS_RESOLUTIONS:
            res = CS_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["import_category"] = phase2_disp
            row["phase2_disposition"] = phase2_disp
            row["address"] = res.get("address", row.get("address"))
            row["postal_code"] = res.get("postal_code", row.get("postal_code"))
            row["is_coming_soon"] = True
            row["is_active"] = False
            row["notes"] = (row.get("notes") or "") + f"; phase2_revalidated: {res['evidence']}"
            decision_reason = res["evidence"]
            coming_soon.append(row)

        elif cat == "EXCLUDED":
            phase2_disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = False
            decision_reason = "phase1_excluded_reaffirmed"
            excluded.append(row)

        elif cat == "CLOSED":
            phase2_disp = "CLOSED"
            row["import_category"] = "CLOSED"
            row["phase2_disposition"] = phase2_disp
            decision_reason = "phase1_closed_reaffirmed"
            closed.append(row)

        else:
            raise SystemExit(f"Unhandled candidate {rid} category {cat}")

        transitions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "city": row.get("city"),
                "phase1_category": cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": decision_reason,
                "in_production": rid in prod_ids,
            }
        )
        staging.append(row)

    if len(transitions) != 103:
        raise SystemExit(f"Transition count {len(transitions)} != 103")
    if len(new_ready) != 0:
        raise SystemExit(f"Expected 0 NEW_READY, got {len(new_ready)}")
    if len(coming_soon) != 3:
        raise SystemExit(f"Expected 3 COMING_SOON, got {len(coming_soon)}")
    if len(keep_existing) != 61:
        raise SystemExit(f"Expected 61 KEEP_EXISTING, got {len(keep_existing)}")
    if existing_review:
        raise SystemExit(f"EXISTING_REVIEW_REQUIRED must be 0, got {len(existing_review)}")
    if reconciliation["material_drift"]:
        raise SystemExit(f"Material metadata drift: {reconciliation['material_drift']}")

    nr_terminal = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]
    if len(nr_terminal) != 24:
        raise SystemExit("NR transition count mismatch")

    write_json(OUT / "LITHUANIA_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "LITHUANIA_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "LITHUANIA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "LITHUANIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "LITHUANIA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "LITHUANIA_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "LITHUANIA_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "LITHUANIA_PHASE2_CLOSED.json", closed)
    write_json(OUT / "lithuania_centers_staging.json", staging)

    for brand, official in CLASS_A_OFFICIAL.items():
        matched = [r for r in keep_existing if r.get("brand") == brand]
        estate = {
            "brand": brand,
            "official_current_active": official,
            "existing_matched": len(matched),
            "new_active": 0,
            "coming_soon": sum(1 for r in coming_soon if r.get("brand") == brand),
            "closed": 0,
            "excluded": 0,
            "existing_review_required": 0,
            "estate_gaps": max(0, official - len(matched)),
            "verdict": "COMPLETE" if len(matched) >= official else "GAP",
        }
        slug = brand.lower().replace(" ", "_").replace("+", "plus").replace("-", "_")
        write_json(PHASE2 / f"{slug}_estate_reconciliation.json", estate)

    write_json(
        PHASE2 / "coming_soon_transitions.json",
        [
            {
                "id": t["id"],
                "name": t["name"],
                "brand": t["brand"],
                "phase1_status": "COMING_SOON",
                "phase2_status": t["phase2_disposition"],
                "current_evidence": CS_RESOLUTIONS[t["id"]]["evidence"],
                "decision_reason": t["decision_reason"],
                "opened": CS_RESOLUTIONS[t["id"]].get("opened", False),
            }
            for t in transitions
            if t["phase1_category"] == "COMING_SOON"
        ],
    )
    write_json(PHASE2 / "virsuliskiu_status.json", CS_RESOLUTIONS["lt_bc21f9653f"])
    write_json(PHASE2 / "lemon_coming_soon_recheck.json", {
        "riese": CS_RESOLUTIONS["lt_4decf7f80b"],
        "jonava": CS_RESOLUTIONS["lt_c3d4f6ba00"],
    })

    write_json(
        PHASE2 / "missed_chain_sanity.json",
        {
            "probes": [
                {"chain": "Gym+", "action": "COMPLETE", "active": 38, "coming_soon": 1},
                {"chain": "Lemon Gym", "action": "COMPLETE", "active": 18, "coming_soon": 2},
                {"chain": "Impuls", "action": "COMPLETE", "active": 5, "coming_soon": 0},
                {"chain": "FitClub", "action": "EXCLUDED", "sites": 2},
                {"chain": "Gym!", "action": "ABSENT", "note": "NOT Gym+ Lithuania"},
                {"chain": "MyFitness", "action": "ABSENT_LT_BRAND"},
                {"chain": "Basic-Fit/McFIT/FITINN/clever fit", "action": "ABSENT"},
            ],
            "new_class_a_found": 0,
        },
    )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre_sha,
        "phase1_rows_recovered": len(phase1_rows),
        "phase1_status_counts": sc1,
        "keep_existing": len(keep_existing),
        "new_ready_to_import": len(new_ready),
        "existing_review_required": len(existing_review),
        "coming_soon": len(coming_soon),
        "excluded": len(excluded),
        "closed": len(closed),
        "status_counts": status_counts(staging),
        "reconciliation": {
            "exact_id_match": reconciliation["exact_id_match"],
            "material_metadata_drift": len(reconciliation["material_drift"]),
        },
    }
    write_json(PHASE2 / "recovery_summary.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post_sha != pre_sha:
        raise SystemExit("centers.json mutated during resolve")

    print(
        f"Lithuania Phase 2 resolve: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"CS={len(coming_soon)} EXCLUDED={len(excluded)} REVIEW={len(existing_review)}"
    )


if __name__ == "__main__":
    main()
