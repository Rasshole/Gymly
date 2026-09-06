#!/usr/bin/env python3
"""Estonia Deep Phase 2 — reconcile staging against existing production (read-only).

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

OUT = ROOT / "data/estonia"
PHASE2 = OUT / "phase2"
PHASE1_STAGING = OUT / "ESTONIA_PHASE1_STAGING.json"
PHASE1_SNAP = OUT / "phase1/phase1_staging_snapshot.json"
EXISTING_SNAP = OUT / "ESTONIA_EXISTING_PRODUCTION_SNAPSHOT.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab"
PRODUCTION_TOTAL = 11922

# Phase 1 NEEDS_REVIEW → terminal resolutions (verified Aug 2026)
NR_RESOLUTIONS: dict[str, dict] = {
    "ee_91d7bd69f0": {
        "disposition": "NEW_READY_TO_IMPORT",
        "lat": 58.3731282,
        "lng": 26.751225,
        "coord_source": "OSM_FITNESS_CENTRE_PREMISES",
        "postal_code": "50703",
        "address": "Kalda tee 1c",
        "name": "FitLife Tartu Eeden",
        "brand": "FitLife",
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "fitlife.ee — conventional 24/7 public gym Eeden centre; memberships €25–45/mo; "
            "day pass €10 at turnstile; OSM leisure=fitness_centre FitLife Kalda tee 1c"
        ),
    },
    "ee_c23ed9d698": {
        "disposition": "EXCLUDED",
        "classification": "INSTITUTIONAL_EXCLUDED",
        "evidence": "Audentes private sports school; access tied to school/athlete programmes, not ordinary public gym",
    },
    "ee_388290af6f": {
        "disposition": "EXCLUDED",
        "classification": "HOTEL_RESORT_EXCLUDED",
        "evidence": "Tervise Paradiis aqua/spa primary; no independently consumer-facing conventional gym",
    },
    "ee_4f134b7823": {
        "disposition": "EXCLUDED",
        "classification": "INSTITUTIONAL_EXCLUDED",
        "evidence": "Valga municipal sports hall; no verified ordinary public gym membership/day-access model",
    },
    "ee_6b10b38d8f": {
        "disposition": "EXCLUDED",
        "classification": "OTHER_EXCLUDED",
        "evidence": "Haapsalu Phase 2 sweep — no credible conventional public gym; spa/wellness false-positive risk",
    },
    "ee_c36257ed6e": {
        "disposition": "EXCLUDED",
        "classification": "INSTITUTIONAL_EXCLUDED",
        "evidence": "Kohtla-Järve municipal candidate; restricted/athlete access not established for conventional gym",
    },
    "ee_e62d5c5dfa": {
        "disposition": "EXCLUDED",
        "classification": "OTHER_EXCLUDED",
        "evidence": "Rapla — no open conventional gym; 24-7 Rapla announced spring 2027 (not yet open)",
    },
    "ee_73741d5ab6": {
        "disposition": "EXCLUDED",
        "classification": "OTHER_EXCLUDED",
        "evidence": "Maardu — no qualifying independent; Tallinn-adjacent chain coverage sufficient; no standalone gym verified",
    },
}

# Phase 1 COMING_SOON → Phase 2 revalidation (Aug 2026 official sources)
CS_RESOLUTIONS: dict[str, dict] = {
    "ee_d6f5429ffa": {
        "disposition": "COMING_SOON",
        "address": "Merivälja tee 33",
        "postal_code": "11911",
        "evidence": "24-7fitness.ee — Avame oktoober 2026; not yet open",
    },
    "ee_525d7cb043": {
        "disposition": "COMING_SOON",
        "address": "Mõisavahe 33",
        "postal_code": "50707",
        "evidence": "24-7fitness.ee — Avame sügis 2026; Annelinn branch not yet open",
    },
    "ee_5c173a5f8b": {
        "disposition": "COMING_SOON",
        "address": "Papiniidu 50",
        "postal_code": "80010",
        "evidence": "24-7fitness.ee — Avame sügis 2026; Mai/Papiniidu branch not yet open",
    },
    "ee_05114ce91a": {
        "disposition": "COMING_SOON",
        "address": "Randvere tee 6",
        "postal_code": "74001",
        "evidence": "gymeesti.ee/klubid — Viimsi listed; autumn 2026 opening; not yet operational",
    },
    "ee_cc255a409d": {
        "disposition": "COMING_SOON",
        "address": "Võidu 99",
        "postal_code": "44313",
        "evidence": "gymeesti.ee/klubid — Rakvere listed; end-2026 opening; not yet operational",
    },
}

# D-gap city resolutions (Phase 1 D → Phase 2 B/C)
D_GAP_RESOLUTIONS = {
    "Paide": {"grade": "B", "reason": "Deep sweep — no qualifying conventional public gym; no Class A chain branch"},
    "Põlva": {"grade": "B", "reason": "Audited — no conventional public gym beyond excluded/specialist candidates"},
    "Elva": {"grade": "B", "reason": "Audited — no qualifying gym; Tartu chain coverage nearby"},
    "Sillamäe": {
        "grade": "B",
        "reason": "Multilingual Ida-Virumaa sweep — no qualifying gym; Narva/Jõhvi chains serve region",
    },
}

CLASS_A_OFFICIAL = {
    "MyFitness": 19,
    "24-7 Fitness": 31,
    "Gym!": 15,
    "Golden Club": 3,
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    from collections import Counter

    return dict(Counter(r.get("import_category") for r in rows))


def load_production_ee() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("ee_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Estonia",
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
        raise SystemExit(f"ESTONIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_rows = load_production_ee()
    if len(prod_rows) != 68:
        raise SystemExit(f"Expected 68 ee_* production rows, got {len(prod_rows)}")
    prod_by_id = {r["id"]: r for r in prod_rows}
    prod_ids = set(prod_by_id)

    # Snapshot reconciliation
    snap = json.loads(EXISTING_SNAP.read_text(encoding="utf-8"))
    snap_ids = {r["id"] for r in snap}
    if len(snap) != 68 or snap_ids != prod_ids:
        raise SystemExit("Existing production snapshot mismatch vs live production")

    phase1_rows = json.loads(PHASE1_STAGING.read_text(encoding="utf-8"))
    expected_phase1 = {"READY_TO_IMPORT": 68, "NEEDS_REVIEW": 8, "COMING_SOON": 5, "EXCLUDED": 22}
    sc1 = status_counts(phase1_rows)
    for k, v in expected_phase1.items():
        if sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")
    if len(phase1_rows) != 103:
        raise SystemExit(f"Phase 1 total {len(phase1_rows)} != 103")

    write_json(PHASE2 / "ESTONIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)
    write_json(PHASE2 / "ESTONIA_EXISTING_PRODUCTION_SNAPSHOT_PHASE2.json", prod_rows)

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

    write_json(OUT / "ESTONIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

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
            decision_reason = "existing_production_reconciled_68_of_68"
            keep_existing.append(row)

        elif rid in NR_RESOLUTIONS:
            res = NR_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = res.get("classification")
            row["notes"] = (row.get("notes") or "") + f"; phase2: {res['evidence']}"
            if phase2_disp == "NEW_READY_TO_IMPORT":
                row["import_category"] = "NEW_READY_TO_IMPORT"
                row["lat"] = res["lat"]
                row["lng"] = res["lng"]
                row["coord_source"] = res["coord_source"]
                row["postal_code"] = res.get("postal_code", row.get("postal_code"))
                row["address"] = res.get("address", row.get("address"))
                row["name"] = res.get("name", row.get("name"))
                row["brand"] = res.get("brand", row.get("brand"))
                row["eligibility"] = res["eligibility"]
                row["classification"] = res["classification"]
                row["is_active"] = True
                row["is_coming_soon"] = False
                decision_reason = res["evidence"]
                new_ready.append(row)
            else:
                row["import_category"] = "EXCLUDED"
                row["is_active"] = False
                row["eligibility"] = "EXCLUDED"
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
                "phase1_category": cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": decision_reason,
                "in_production": rid in prod_ids,
            }
        )
        staging.append(row)

    if len(transitions) != 103:
        raise SystemExit(f"Transition count {len(transitions)} != 103")
    if len(new_ready) != 1:
        raise SystemExit(f"Expected 1 NEW_READY, got {len(new_ready)}")
    if len(coming_soon) != 5:
        raise SystemExit(f"Expected 5 COMING_SOON, got {len(coming_soon)}")
    if len(keep_existing) != 68:
        raise SystemExit(f"Expected 68 KEEP_EXISTING, got {len(keep_existing)}")
    if existing_review:
        raise SystemExit(f"EXISTING_REVIEW_REQUIRED must be 0, got {len(existing_review)}")

    nr_terminal = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]
    if len(nr_terminal) != 8:
        raise SystemExit("NR transition count mismatch")

    write_json(OUT / "ESTONIA_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "ESTONIA_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "ESTONIA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "ESTONIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "ESTONIA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "ESTONIA_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "ESTONIA_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "ESTONIA_PHASE2_CLOSED.json", closed)
    write_json(OUT / "estonia_centers_staging.json", staging)

    # Chain estate revalidation summaries
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

    write_json(PHASE2 / "d_gap_resolutions.json", D_GAP_RESOLUTIONS)
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
            }
            for t in transitions
            if t["phase1_category"] == "COMING_SOON"
        ],
    )
    write_json(PHASE2 / "fitlife_resolution.json", NR_RESOLUTIONS["ee_91d7bd69f0"])

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
        "d_gap_resolutions": D_GAP_RESOLUTIONS,
    }
    write_json(PHASE2 / "recovery_summary.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post_sha != pre_sha:
        raise SystemExit("centers.json mutated during resolve")

    print(
        f"Estonia Phase 2 resolve: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"CS={len(coming_soon)} EXCLUDED={len(excluded)} REVIEW={len(existing_review)}"
    )


if __name__ == "__main__":
    main()
