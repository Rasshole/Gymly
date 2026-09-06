#!/usr/bin/env python3
"""Latvia Deep Phase 2 — reconcile staging against existing production (read-only).

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

OUT = ROOT / "data/latvia"
PHASE2 = OUT / "phase2"
PHASE1_STAGING = OUT / "LATVIA_PHASE1_STAGING.json"
EXISTING_SNAP = OUT / "LATVIA_EXISTING_PRODUCTION_SNAPSHOT.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

ZIEPNIEKKALNS_ID = "lv_eb2ad44f7d"

CLASS_A_OFFICIAL = {
    "MyFitness": 15,
    "Lemon Gym": 8,
    "Gym!": 10,
}

# Phase 1 municipal NEEDS_REVIEW → terminal EXCLUDED (Phase 2 deep sweep)
NR_RESOLUTIONS: dict[str, dict] = {
    "lv_f4c8338a32": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Liepāja Phase 2 sweep — Gym Lāčplēsis single-site excluded; no Class A chain; no verified conventional public gym for READY",
    },
    "lv_4e7ddb4bf9": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Jelgava Phase 2 sweep — no MyFitness/Lemon/Gym! estate; no verified conventional public Class A gym",
    },
    "lv_1973760fd7": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Jūrmala Phase 2 sweep — tourism/hotel false-positive control; no verified conventional public Class A gym",
    },
    "lv_e6060c1dfb": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ventspils Phase 2 sweep — no Class A chain; municipal sports centers not qualifying",
    },
    "lv_b12f63c3f8": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Rēzekne Phase 2 multilingual sweep — no Class A chain; no verified conventional public gym",
    },
    "lv_468a5ec140": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Valmiera Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_347c19b564": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Jēkabpils Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_de9bd2e3f3": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ogre Phase 2 sweep — Rīga orbit; no separate Class A chain beyond Rīga estate",
    },
    "lv_24c61613da": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Tukums Phase 2 sweep — no qualifying conventional public gym",
    },
    "lv_940a23952b": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Cēsis Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_80bc24ef76": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Sigulda Phase 2 sweep — tourism/wellness false-positive control; no Class A chain",
    },
    "lv_af0b6d18bd": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Kuldīga Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_7b3265b74c": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Saldus Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_306ad52953": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Bauska Phase 2 sweep — Lithuania border safety; no Class A chain verified",
    },
    "lv_ecc44aa569": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Madona Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_2f4ac6c967": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Limbaži Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_6dfc01721b": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Gulbene Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_2a2157603e": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Alūksne Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_9ca3c7f5af": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Krāslava Phase 2 sweep — Belarus border scrutiny; no Class A chain verified",
    },
    "lv_8178ee662c": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ludza Phase 2 sweep — Russia border scrutiny; no Class A chain verified",
    },
    "lv_df9ccb0947": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Preiļi Phase 2 sweep — Latgale; no Class A chain verified",
    },
    "lv_2a031689ee": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Dobele Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_364428f807": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Aizkraukle Phase 2 sweep — no Class A chain presence verified",
    },
    "lv_24355d4a82": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Valka Phase 2 sweep — Valka=Latvia; Valga=Estonia; no Class A chain; border identity verified; no Valga collision",
    },
    "lv_06431ab3f7": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Mārupe Rīga metro sweep — no separate Class A beyond Rīga estate",
    },
    "lv_e1ef254fe5": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Salaspils Rīga metro sweep — no separate Class A beyond Rīga estate",
    },
    "lv_50cfd373af": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ikšķile Rīga metro sweep — no separate Class A beyond Rīga estate",
    },
    "lv_9cd8c2415f": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Ādaži Rīga metro sweep — no separate Class A beyond Rīga estate",
    },
}

CS_RESOLUTIONS: dict[str, dict] = {
    ZIEPNIEKKALNS_ID: {
        "disposition": "COMING_SOON",
        "address": "Valdeķu iela 39",
        "postal_code": "",
        "evidence": (
            "lemongym.lv Aug 2026 — Ziepniekkalns still marked FROM 02.09 / NO SEPTEMBRA; "
            "opening 2026-09-02 not yet reached at Phase 2 audit; not operating"
        ),
    },
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    from collections import Counter

    return dict(Counter(r.get("import_category") for r in rows))


def load_production_lv() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("lv_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Latvia",
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
        raise SystemExit(f"LATVIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_rows = load_production_lv()
    if len(prod_rows) != 33:
        raise SystemExit(f"Expected 33 lv_* production rows, got {len(prod_rows)}")
    prod_by_id = {r["id"]: r for r in prod_rows}
    prod_ids = set(prod_by_id)

    snap = json.loads(EXISTING_SNAP.read_text(encoding="utf-8"))
    snap_ids = {r["id"] for r in snap}
    if len(snap) != 33 or snap_ids != prod_ids:
        raise SystemExit("Existing production snapshot mismatch vs live production")

    phase1_rows = json.loads(PHASE1_STAGING.read_text(encoding="utf-8"))
    expected_phase1 = {
        "READY_TO_IMPORT": 33,
        "NEEDS_REVIEW": 28,
        "COMING_SOON": 1,
        "EXCLUDED": 12,
    }
    sc1 = status_counts(phase1_rows)
    for k, v in expected_phase1.items():
        if sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")
    if len(phase1_rows) != 74:
        raise SystemExit(f"Phase 1 total {len(phase1_rows)} != 74")

    nr_phase1 = [r for r in phase1_rows if r.get("import_category") == "NEEDS_REVIEW"]
    if len(nr_phase1) != 28 or set(NR_RESOLUTIONS) != {r["id"] for r in nr_phase1}:
        missing = {r["id"] for r in nr_phase1} - set(NR_RESOLUTIONS)
        extra = set(NR_RESOLUTIONS) - {r["id"] for r in nr_phase1}
        raise SystemExit(f"NR resolution map mismatch missing={missing} extra={extra}")

    write_json(PHASE2 / "LATVIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)
    write_json(PHASE2 / "LATVIA_EXISTING_PRODUCTION_SNAPSHOT_PHASE2.json", prod_rows)

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

    write_json(OUT / "LATVIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

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
            decision_reason = "existing_production_reconciled_33_of_33"
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

    if len(transitions) != 74:
        raise SystemExit(f"Transition count {len(transitions)} != 74")
    if len(new_ready) != 0:
        raise SystemExit(f"Expected 0 NEW_READY, got {len(new_ready)}")
    if len(coming_soon) != 1:
        raise SystemExit(f"Expected 1 COMING_SOON, got {len(coming_soon)}")
    if len(keep_existing) != 33:
        raise SystemExit(f"Expected 33 KEEP_EXISTING, got {len(keep_existing)}")
    if existing_review:
        raise SystemExit(f"EXISTING_REVIEW_REQUIRED must be 0, got {len(existing_review)}")
    if reconciliation["material_drift"]:
        raise SystemExit(f"Material metadata drift: {reconciliation['material_drift']}")

    nr_terminal = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]
    if len(nr_terminal) != 28:
        raise SystemExit("NR transition count mismatch")

    write_json(OUT / "LATVIA_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "LATVIA_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "LATVIA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "LATVIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "LATVIA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "LATVIA_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "LATVIA_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "LATVIA_PHASE2_CLOSED.json", closed)
    write_json(OUT / "latvia_centers_staging.json", staging)

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
        slug = brand.lower().replace(" ", "_").replace("!", "").replace("-", "_")
        write_json(PHASE2 / f"{slug}_estate_reconciliation.json", estate)

    write_json(
        PHASE2 / "coming_soon_transitions.json",
        [
            {
                "id": t["id"],
                "name": t["name"],
                "phase1_status": "COMING_SOON",
                "phase2_status": t["phase2_disposition"],
                "current_evidence": t["decision_reason"],
                "decision_reason": t["decision_reason"],
                "ziepniekkalns_opened": False,
            }
            for t in transitions
            if t["phase1_category"] == "COMING_SOON"
        ],
    )
    write_json(PHASE2 / "ziepniekkalns_recheck.json", CS_RESOLUTIONS[ZIEPNIEKKALNS_ID])

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
        f"Latvia Phase 2 resolve: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"CS={len(coming_soon)} EXCLUDED={len(excluded)} REVIEW={len(existing_review)}"
    )


if __name__ == "__main__":
    main()
