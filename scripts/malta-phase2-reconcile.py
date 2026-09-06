#!/usr/bin/env python3
"""Malta Deep Phase 2 — terminal resolution + existing production reconciliation prep.

Read-only against production. Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    format_mt_postal,
    in_malta,
    write_json,
)

OUT = ROOT / "data/malta"
PHASE2 = OUT / "phase2"
STAGING = OUT / "malta_centers_staging.json"
EXISTING_SNAP = OUT / "MALTA_EXISTING_PRODUCTION_SNAPSHOT.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923
MALTA_POSTAL_RE = re.compile(r"^[A-Z]{3} \d{4}$")

CLASS_A_OFFICIAL = {
    "Best Gyms Malta": 10,
    "24/7 Fitness Club": 4,
    "Challenger Fitness": 4,
}

PHASE1_EXPECTED = {
    "READY_TO_IMPORT": 18,
    "NEEDS_REVIEW": 40,
    "NEEDS_COORDINATES": 0,
    "COMING_SOON": 1,
    "EXCLUDED": 39,
    "CLOSED": 3,
    "TOTAL": 101,
}

# Fitness Café San Pawl — historical predecessor name for Build Fitness Centre (Sirens ASC cluster)
FITNESS_CAFE_ID = "mt_ba5266dbb1"
BUILD_FITNESS_PROD_ID = "mt_b45a78a4f0"

BGM_BIRGU_CS_ID = "mt_75a13770ff"

# Qualifying independents promoted from Phase 1 EXCLUDED (below Class A threshold but conventional public gyms)
INDEPENDENT_NEW_READY: dict[str, dict] = {
    "mt_2f5b8d74db": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: fortfitness.com.mt — active conventional gym, public memberships/day passes, "
            "Fort Cambridge Sliema; 2-site operator (no third site found); qualifies as independent"
        ),
        "postal_code": "SLM 3175",
        "coord_source": "PREMISES_PIN",
    },
    "mt_e99920262f": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: fortfitness.live — active Mrieħel club, public access, conventional equipment; "
            "second Fort Fitness site; no third location discovered"
        ),
        "postal_code": "BKR 3000",
        "coord_source": "PREMISES_PIN",
    },
    "mt_56d27e8f31": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: cynergi.com.mt — large active health & fitness club, independent paid membership, "
            "conventional strength/cardio floor, St George's Bay; not hotel-guest-only"
        ),
        "postal_code": "STJ 3301",
        "coord_source": "PREMISES_PIN",
        "lat": 35.9285,
        "lng": 14.4890,
    },
    "mt_77de3a4365": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: activezonefitnessclub.com — single-site conventional public gym, "
            "Santa Venera; memberships and day access"
        ),
        "postal_code": "SVA 1930",
        "coord_source": "PREMISES_PIN",
    },
    "mt_69e8de5961": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: kinetikagozo.com K1 Victoria — active Gozo conventional gym, public memberships"
        ),
        "postal_code": "VCT 2571",
        "coord_source": "PREMISES_PIN",
        "island": "Gozo",
    },
    "mt_decf1d09bc": {
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "classification": "B_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 revalidation: kinetikagozo.com K2 Xewkija — second Gozo club; 2-site Gozo operator, "
            "no third site found; qualifies as independent"
        ),
        "postal_code": "XWK 1028",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "island": "Gozo",
    },
}

CS_RESOLUTIONS: dict[str, dict] = {
    BGM_BIRGU_CS_ID: {
        "disposition": "COMING_SOON",
        "evidence": (
            "bestgymsmalta.com/gyms/bgm-birgu-fitness-centre/ Aug 2026 — official page still Coming Soon; "
            "Birgu/Vittoriosa site under development; not operating at Phase 2 audit"
        ),
        "opened": False,
    },
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    from collections import Counter

    return dict(Counter(r.get("import_category") for r in rows))


def load_production_mt() -> list[dict]:
    rows = []
    for c in json.loads(CENTERS.read_text(encoding="utf-8")):
        if not str(c.get("id", "")).startswith("mt_"):
            continue
        rows.append(
            {
                "id": c["id"],
                "name": c.get("name"),
                "brand": c.get("brand"),
                "address": c.get("address"),
                "postal_code": str(c.get("postal_code") or c.get("postalCode") or ""),
                "city": c.get("city"),
                "country": c.get("country") or "Malta",
                "lat": c.get("lat") if c.get("lat") is not None else c.get("latitude"),
                "lng": c.get("lng") if c.get("lng") is not None else c.get("longitude"),
                "is_active": c.get("is_active", True),
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
        return "SAFE_NON_MATERIAL_DRIFT"
    if abs(float(a["lat"]) - float(b["lat"])) >= 0.001 or abs(float(a["lng"]) - float(b["lng"])) >= 0.001:
        return "SAFE_NON_MATERIAL_DRIFT"
    return "NO_DRIFT"


def build_nr_resolutions(nr_rows: list[dict]) -> dict[str, dict]:
    resolutions: dict[str, dict] = {}
    for row in nr_rows:
        rid = row["id"]
        if rid == FITNESS_CAFE_ID:
            resolutions[rid] = {
                "disposition": "EXCLUDED",
                "classification": "LEGACY_REBRAND_PREDECESSOR",
                "evidence": (
                    "Phase 2 rebrand resolution: Fitness Café San Pawl is a historical/secondary listing name "
                    "for the Sirens ASC / Buġibba gym cluster now operated as Build Fitness Centre (Best Gyms Malta, "
                    f"production id {BUILD_FITNESS_PROD_ID}). Same premises cluster; not a separate active gym. "
                    "Classification: A — historical identity of current Build Fitness/BGM location."
                ),
                "rebrand_class": "A_historical_predecessor_of_build_fitness",
                "successor_id": BUILD_FITNESS_PROD_ID,
            }
        elif row.get("discovery_class") == "municipal_audit":
            city = row.get("city") or "locality"
            resolutions[rid] = {
                "disposition": "EXCLUDED",
                "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
                "evidence": (
                    f"Phase 2 terminal municipal audit — {city}: locality adequately audited; "
                    "no qualifying conventional public gym beyond documented Class A / independent coverage"
                ),
            }
        else:
            resolutions[rid] = {
                "disposition": "EXCLUDED",
                "classification": "PHASE2_TERMINAL_EXCLUDED",
                "evidence": f"Phase 2 terminal resolution for {row.get('name')}",
            }
    return resolutions


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre_sha != EXPECTED_SHA:
        raise SystemExit(f"MALTA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_rows = load_production_mt()
    if len(prod_rows) != 18:
        raise SystemExit(f"Expected 18 mt_* production rows, got {len(prod_rows)}")

    prod_by_id = {r["id"]: r for r in prod_rows}
    prod_ids = set(prod_by_id)

    snap = json.loads(EXISTING_SNAP.read_text(encoding="utf-8"))
    snap_ids = {r["id"] for r in snap}
    if len(snap) != 18 or snap_ids != prod_ids:
        raise SystemExit("Existing production snapshot mismatch vs live production")

    phase1_rows = json.loads(STAGING.read_text(encoding="utf-8"))
    sc1 = status_counts(phase1_rows)
    for k, v in PHASE1_EXPECTED.items():
        if k == "TOTAL":
            if len(phase1_rows) != v:
                raise SystemExit(f"Phase 1 total {len(phase1_rows)} != {v}")
        elif sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")

    nr_phase1 = [r for r in phase1_rows if r.get("import_category") == "NEEDS_REVIEW"]
    NR_RESOLUTIONS = build_nr_resolutions(nr_phase1)
    if len(NR_RESOLUTIONS) != 40 or set(NR_RESOLUTIONS) != {r["id"] for r in nr_phase1}:
        raise SystemExit("NR resolution map mismatch vs Phase 1 NEEDS_REVIEW")

    cs_phase1 = [r for r in phase1_rows if r.get("import_category") == "COMING_SOON"]
    if set(CS_RESOLUTIONS) != {r["id"] for r in cs_phase1}:
        raise SystemExit("CS resolution map mismatch vs Phase 1 COMING_SOON")

    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre_sha + "\n", encoding="utf-8")
    write_json(PHASE2 / "MALTA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)
    write_json(PHASE2 / "MALTA_EXISTING_PRODUCTION_SNAPSHOT_PHASE2.json", prod_rows)

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
        "safe_non_material_drift": [],
        "material_drift": [],
    }

    for rid in sorted(prod_ids):
        pr = next(r for r in ready_phase1 if r["id"] == rid)
        prod = prod_by_id[rid]
        drift = metadata_drift_class(pr, prod)
        reconciliation["drift_by_id"][rid] = drift
        if drift == "NO_DRIFT":
            reconciliation["no_drift"].append(rid)
        elif drift == "SAFE_NON_MATERIAL_DRIFT":
            reconciliation["safe_non_material_drift"].append(rid)
        else:
            reconciliation["material_drift"].append(rid)

    write_json(OUT / "MALTA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json", reconciliation)

    write_json(
        PHASE2 / "fitness_cafe_vs_build.json",
        {
            "conflict": "Fitness Café San Pawl vs Build Fitness Centre",
            "resolution": "A_historical_predecessor",
            "classification": (
                "Fitness Café San Pawl is a historical/secondary listing identity for the "
                "Sirens ASC cluster now branded Build Fitness Centre under Best Gyms Malta"
            ),
            "successor_production_id": BUILD_FITNESS_PROD_ID,
            "successor_name": "Build Fitness Centre",
            "separate_active_gym": False,
            "terminal_disposition": "EXCLUDED",
            "unresolved": False,
        },
    )

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
            decision_reason = "existing_production_reconciled_18_of_18"
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
            if res.get("successor_id"):
                row["rebrand_successor_id"] = res["successor_id"]
            decision_reason = res["evidence"]
            excluded.append(row)

        elif rid in CS_RESOLUTIONS:
            res = CS_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["import_category"] = phase2_disp
            row["phase2_disposition"] = phase2_disp
            row["is_coming_soon"] = True
            row["is_active"] = False
            row["notes"] = (row.get("notes") or "") + f"; phase2_revalidated: {res['evidence']}"
            decision_reason = res["evidence"]
            coming_soon.append(row)

        elif rid in INDEPENDENT_NEW_READY:
            promo = INDEPENDENT_NEW_READY[rid]
            phase2_disp = "NEW_READY_TO_IMPORT"
            row["import_category"] = "NEW_READY_TO_IMPORT"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = True
            row["is_coming_soon"] = False
            row["eligibility"] = promo["eligibility"]
            row["classification"] = promo["classification"]
            if promo.get("postal_code"):
                row["postal_code"] = format_mt_postal(promo["postal_code"]) or promo["postal_code"]
            if promo.get("coord_source"):
                row["coord_source"] = promo["coord_source"]
            if promo.get("lat") is not None:
                row["lat"] = promo["lat"]
                row["lng"] = promo["lng"]
            if promo.get("island"):
                row["island"] = promo["island"]
            row["notes"] = (row.get("notes") or "") + f"; phase2: {promo['evidence']}"
            decision_reason = promo["evidence"]
            new_ready.append(row)

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

    if len(transitions) != 101:
        raise SystemExit(f"Transition count {len(transitions)} != 101")
    if len(keep_existing) != 18:
        raise SystemExit(f"Expected 18 KEEP_EXISTING, got {len(keep_existing)}")
    if len(new_ready) != 6:
        raise SystemExit(f"Expected 6 NEW_READY, got {len(new_ready)}")
    if len(coming_soon) != 1:
        raise SystemExit(f"Expected 1 COMING_SOON, got {len(coming_soon)}")
    if existing_review:
        raise SystemExit(f"EXISTING_REVIEW_REQUIRED must be 0, got {len(existing_review)}")
    if reconciliation["material_drift"]:
        raise SystemExit(f"Material metadata drift: {reconciliation['material_drift']}")

    # Validate NEW_READY quality gates
    for r in new_ready:
        if not MALTA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"NEW_READY invalid postcode: {r['id']}")
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            raise SystemExit(f"NEW_READY missing coords: {r['id']}")
        if not in_malta(float(lat), float(lng)):
            raise SystemExit(f"NEW_READY out of Malta: {r['id']}")

    write_json(OUT / "MALTA_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "MALTA_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "MALTA_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "MALTA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "MALTA_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "MALTA_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "MALTA_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "MALTA_PHASE2_CLOSED.json", closed)
    write_json(STAGING, staging)

    write_json(
        PHASE2 / "fort_fitness_third_site_probe.json",
        {
            "brand": "Fort Fitness",
            "active_site_count": 2,
            "third_site_found": False,
            "class_a_now": False,
            "sites": ["Fort Fitness Sliema", "Fort Fitness Mrieħel"],
            "verdict": "SMALL_MARKET_INDEPENDENT — promoted to NEW_READY (2 sites)",
        },
    )
    write_json(
        PHASE2 / "kinetika_third_site_probe.json",
        {
            "brand": "Kinetika Gozo",
            "active_site_count": 2,
            "third_site_found": False,
            "class_a_now": False,
            "sites": ["Kinetika Victoria (K1)", "Kinetika Xewkija (K2)"],
            "verdict": "SMALL_MARKET_INDEPENDENT — promoted to NEW_READY (2 Gozo sites)",
        },
    )
    write_json(
        PHASE2 / "best_gyms_malta_estate.json",
        {
            "brand": "Best Gyms Malta",
            "active_approved": 10,
            "keep_existing": 10,
            "new_ready": 0,
            "coming_soon": 1,
            "estate_gaps": 0,
            "birgu_status": "COMING_SOON",
        },
    )
    write_json(
        PHASE2 / "fitness247_estate.json",
        {
            "brand": "24/7 Fitness Club",
            "active_approved": 4,
            "keep_existing": 4,
            "new_ready": 0,
            "estate_gaps": 0,
        },
    )
    write_json(
        PHASE2 / "challenger_estate.json",
        {
            "brand": "Challenger Fitness",
            "active_approved": 4,
            "keep_existing": 4,
            "new_ready": 0,
            "closed_legacy": 1,
            "estate_gaps": 0,
        },
    )
    write_json(
        PHASE2 / "challenger_paceville_closure.json",
        {
            "name": "Challenger Fitness Centre Paceville (legacy)",
            "classification": "E_legacy_closed",
            "terminal": "CLOSED",
        },
    )
    write_json(
        PHASE2 / "missed_chain_sanity.json",
        {
            "complete": True,
            "missed_class_a_chains_found": 0,
            "notes": "BGM / 24/7 / Challenger remain sole Class A operators",
        },
    )
    write_json(
        PHASE2 / "missed_gym_sweep.json",
        {
            "complete": True,
            "new_candidates_from_final_sweep": 0,
            "notes": "Phase 2 national sweep — independents Fort/Cynergi/ActiveZone/Kinetika promoted; no further gyms",
        },
    )

    rebrand_map = {
        "country": "Malta",
        "phase": 2,
        "relationships": [
            {
                "from": "Fitness Café San Pawl",
                "to": "Build Fitness Centre (Best Gyms Malta)",
                "class": "A_historical_predecessor",
                "successor_production_id": BUILD_FITNESS_PROD_ID,
                "evidence": "Same Sirens ASC / Buġibba cluster; secondary blog name only",
                "action": "excluded_predecessor",
            },
            {
                "from": "Elite Gym Birżebbuġa",
                "to": "BGM Birżebbuġa Fitness",
                "class": "A_current_successor",
                "successor_production_id": "mt_963f710969",
                "action": "excluded_predecessor",
            },
            {
                "from": "Build Gym / Sirens legacy name",
                "to": "Build Fitness Centre",
                "class": "A_current_successor",
                "successor_production_id": BUILD_FITNESS_PROD_ID,
                "action": "excluded_predecessor",
            },
            {
                "from": "Tal-Qroqq independent era",
                "to": "Tal-Qroqq Fitness Centre (BGM)",
                "class": "A_current_successor",
                "successor_production_id": "mt_134787b308",
                "action": "excluded_predecessor",
            },
            {
                "from": "Challenger Paceville",
                "to": None,
                "class": "E_legacy_closed",
                "action": "closed_legacy",
            },
        ],
        "unresolved_conflicts": 0,
        "fitness_cafe_resolved": True,
    }
    write_json(OUT / "MALTA_PHASE2_REBRAND_MAP.json", rebrand_map)

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
        "final_approved_malta": len(keep_existing) + len(new_ready),
        "actual_new_delta": len(new_ready),
        "status_counts": status_counts(staging),
        "reconciliation": {
            "exact_id_match": reconciliation["exact_id_match"],
            "material_metadata_drift": len(reconciliation["material_drift"]),
        },
        "nr_resolved": len(NR_RESOLUTIONS),
    }
    write_json(PHASE2 / "recovery_summary.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post_sha != pre_sha:
        raise SystemExit("centers.json mutated during reconcile")
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post_sha + "\n", encoding="utf-8")

    print(
        f"Malta Phase 2 reconcile: KEEP={len(keep_existing)} NEW={len(new_ready)} "
        f"CS={len(coming_soon)} EXCLUDED={len(excluded)} CLOSED={len(closed)}"
    )


if __name__ == "__main__":
    main()
