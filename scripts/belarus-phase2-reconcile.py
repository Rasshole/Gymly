#!/usr/bin/env python3
"""Belarus Deep Phase 2 — terminal NR resolution + chain revalidation.

Read-only against production. Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    BELARUS_POSTAL_RE,
    ROOT,
    in_belarus,
    write_json,
)

OUT = ROOT / "data/belarus"
PHASE2 = OUT / "phase2"
STAGING = OUT / "belarus_centers_staging.json"
PHASE1_SNAPSHOT = OUT / "phase1" / "phase1_staging_snapshot.json"
GEOCODE_CACHE = OUT / "belarus_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05"
PRODUCTION_TOTAL = 12034

CLASS_A_OFFICIAL = {
    "Adrenalin": 29,
    "Lifestyle": 3,
    "Fox Club": 5,
    "Olympic": 4,
}

PHASE1_EXPECTED = {
    "READY_TO_IMPORT": 38,
    "NEEDS_REVIEW": 9,
    "NEEDS_COORDINATES": 0,
    "COMING_SOON": 1,
    "EXCLUDED": 10,
    "CLOSED": 0,
    "TOTAL": 58,
}

GEOCODE_FIXES: dict[str, dict] = {
    "by_79989cf6f9": {
        "lat": 53.9227104,
        "lng": 27.5694994,
        "postal_code": "220040",
        "evidence": "Phase 2 geocode fix — Bogdanovicha 66 Minsk (was Krupski rayon outlier)",
    },
    "by_de5fae95bf": {
        "lat": 53.8866151,
        "lng": 27.5127529,
        "postal_code": "220036",
        "evidence": "Phase 2 geocode fix — Dzerzhinskogo Minsk",
    },
    "by_0abd3f74c4": {
        "lat": 52.4052360,
        "lng": 30.9209654,
        "postal_code": "247000",
        "address": "пр-т Речицкий 80",
        "evidence": "Phase 2 geocode fix — Gomel Rechitsky 80",
    },
    "by_bc96694c1b": {
        "lat": 53.9129296,
        "lng": 27.5334082,
        "postal_code": "220029",
        "evidence": "Phase 2 geocode fix — Lifestyle Masherova Minsk",
    },
    "by_ad1e7bbaed": {
        "lat": 53.8769726,
        "lng": 27.6255810,
        "postal_code": "220037",
        "evidence": "Phase 2 geocode fix — Lifestyle Partizansky Minsk",
    },
    "by_e374a381ab": {
        "lat": 53.8702302,
        "lng": 30.3257198,
        "postal_code": "212030",
        "evidence": "Phase 2 geocode fix — Fox Club Mogilev",
    },
}

NR_RESOLUTIONS: dict[str, dict] = {
    "by_3633cd3ae9": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 adrenalin.by — Borovlyany Beryozovaya Roscha active branch",
        "lat": 53.9995113,
        "lng": 27.6761356,
        "postal_code": "223053",
        "city": "Borovlyany",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_40c8cf404e": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 adrenalin.by — Pobediteley 129 Minsk active branch",
        "lat": 53.9409482,
        "lng": 27.4664365,
        "postal_code": "220035",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_391eb2e674": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 adrenalin.by — Nezavisimosti Minsk active branch",
        "lat": 53.8954174,
        "lng": 27.5470864,
        "postal_code": "220030",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_badef82a8a": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 foxclub.by — Grodno Kupaly 22 active branch",
        "address": "пр-т Я. Купалы 22",
        "lat": 53.6590157,
        "lng": 23.8381231,
        "postal_code": "230023",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_f8a48b1e14": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 olympic.by — Pobediteley 11 Minsk active branch",
        "lat": 53.9092020,
        "lng": 27.5482510,
        "postal_code": "220020",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_35c11d2126": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": "Phase 2 olympic.by — Grodno Sovetskaya active branch",
        "lat": 53.6822659,
        "lng": 23.8316487,
        "postal_code": "230023",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_cc9170f013": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "evidence": "Phase 2 World Class Dzerzhinskogo — independent conventional public gym",
        "lat": 53.8908819,
        "lng": 27.5230383,
        "postal_code": "220036",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_9f1ed8d6b8": {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "eligibility": "SMALL_MARKET_INDEPENDENT",
        "evidence": "Phase 2 Gym Express 24h Brest — independent conventional public gym",
        "lat": 52.0744090,
        "lng": 23.7059525,
        "postal_code": "224017",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    },
    "by_de53fc35f8": {
        "disposition": "EXCLUDED",
        "classification": "MUNICIPAL_AUDIT_NO_QUALIFYING_GYM",
        "evidence": "Phase 2 Vitebsk municipal audit — no qualifying conventional public gym",
    },
}

COLOCATED_DISTINCT: list[dict] = []


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def load_geocode_cache() -> dict:
    if GEOCODE_CACHE.exists():
        return json.loads(GEOCODE_CACHE.read_text(encoding="utf-8"))
    return {}


def save_geocode_cache(cache: dict) -> None:
    write_json(GEOCODE_CACHE, cache)


def apply_geocode_fix(row: dict, fix: dict) -> None:
    if fix.get("lat") is not None:
        row["lat"] = fix["lat"]
        row["lng"] = fix["lng"]
    if fix.get("postal_code"):
        row["postal_code"] = fix["postal_code"]
    if fix.get("address"):
        row["address"] = fix["address"]
    row["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    row["notes"] = (row.get("notes") or "") + f"; phase2: {fix['evidence']}"


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre_sha != EXPECTED_SHA:
        raise SystemExit(f"BELARUS PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_by = [c for c in json.loads(CENTERS.read_text(encoding="utf-8")) if str(c.get("id", "")).startswith("by_")]
    if prod_by:
        raise SystemExit(f"Expected 0 by_* production rows, got {len(prod_by)}")

    phase1_rows = json.loads(PHASE1_SNAPSHOT.read_text(encoding="utf-8"))
    if not phase1_rows:
        phase1_rows = json.loads(STAGING.read_text(encoding="utf-8"))
    sc1 = status_counts(phase1_rows)
    for k, v in PHASE1_EXPECTED.items():
        if k == "TOTAL":
            if len(phase1_rows) != v:
                raise SystemExit(f"Phase 1 total {len(phase1_rows)} != {v}")
        elif sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")

    cache = load_geocode_cache()
    nr_phase1 = [r for r in phase1_rows if r.get("import_category") == "NEEDS_REVIEW"]
    if len(NR_RESOLUTIONS) != 9 or set(NR_RESOLUTIONS) != {r["id"] for r in nr_phase1}:
        raise SystemExit("NR resolution map mismatch vs Phase 1 NEEDS_REVIEW")

    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre_sha + "\n", encoding="utf-8")
    write_json(PHASE2 / "BELARUS_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    transitions: list[dict] = []
    staging: list[dict] = []
    new_ready: list[dict] = []
    coming_soon: list[dict] = []
    excluded: list[dict] = []
    closed: list[dict] = []
    keep_existing: list[dict] = []
    existing_review: list[dict] = []

    seen_ids: set[str] = set()

    def finalize_row(row: dict, phase1_cat: str, phase2_disp: str, reason: str) -> None:
        rid = row["id"]
        if rid in seen_ids:
            raise SystemExit(f"Duplicate transition id {rid}")
        seen_ids.add(rid)
        transitions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "city": row.get("city"),
                "phase1_category": phase1_cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": reason,
                "in_production": False,
            }
        )
        staging.append(row)

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""
        phase2_disp = ""
        decision_reason = ""

        if rid in NR_RESOLUTIONS:
            res = NR_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = res.get("classification")
            if res.get("address"):
                row["address"] = res["address"]
            if res.get("city"):
                row["city"] = res["city"]
            if res.get("lat") is not None:
                row["lat"] = res["lat"]
                row["lng"] = res["lng"]
            if res.get("postal_code"):
                row["postal_code"] = res["postal_code"]
            if res.get("coord_source"):
                row["coord_source"] = res["coord_source"]
            row["notes"] = (row.get("notes") or "") + f"; phase2: {res['evidence']}"
            decision_reason = res["evidence"]

            if phase2_disp == "NEW_READY_TO_IMPORT":
                row["import_category"] = "NEW_READY_TO_IMPORT"
                row["is_active"] = True
                row["is_coming_soon"] = False
                row["eligibility"] = res.get("eligibility") or "CHAIN_CLASS_A"
                row["classification"] = res.get("classification", "A_CONVENTIONAL_PUBLIC_GYM")
                new_ready.append(row)
            else:
                row["import_category"] = "EXCLUDED"
                row["is_active"] = False
                row["eligibility"] = "EXCLUDED"
                excluded.append(row)

            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "READY_TO_IMPORT":
            if rid in GEOCODE_FIXES:
                apply_geocode_fix(row, GEOCODE_FIXES[rid])
            phase2_disp = "NEW_READY_TO_IMPORT"
            row["import_category"] = "NEW_READY_TO_IMPORT"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = True
            row["eligibility"] = row.get("eligibility_candidate") or row.get("eligibility") or "CHAIN_CLASS_A"
            row["classification"] = row.get("classification") or "A_CONVENTIONAL_PUBLIC_GYM"
            decision_reason = "phase1_ready_revalidated_phase2"
            new_ready.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "COMING_SOON":
            phase2_disp = "COMING_SOON"
            row["import_category"] = "COMING_SOON"
            row["phase2_disposition"] = phase2_disp
            row["is_coming_soon"] = True
            row["is_active"] = False
            decision_reason = "phase1_coming_soon_reaffirmed"
            coming_soon.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "EXCLUDED":
            phase2_disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = False
            decision_reason = "phase1_excluded_reaffirmed"
            excluded.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "CLOSED":
            phase2_disp = "CLOSED"
            row["import_category"] = "CLOSED"
            row["phase2_disposition"] = phase2_disp
            row["is_closed"] = True
            row["is_active"] = False
            decision_reason = "phase1_closed_reaffirmed"
            closed.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        raise SystemExit(f"Unhandled candidate {rid} category {cat}")

    if len(transitions) != 58:
        raise SystemExit(f"Transition count {len(transitions)} != 58")
    if keep_existing or existing_review:
        raise SystemExit("KEEP_EXISTING and EXISTING_REVIEW_REQUIRED must be 0")

    expected_new = 46
    if len(new_ready) != expected_new:
        raise SystemExit(f"NEW_READY count {len(new_ready)} != {expected_new}")
    if len(coming_soon) != 1:
        raise SystemExit(f"COMING_SOON count {len(coming_soon)} != 1")
    if len(excluded) != 11:
        raise SystemExit(f"EXCLUDED count {len(excluded)} != 11")

    for r in new_ready:
        if not BELARUS_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"NEW_READY invalid postcode: {r['id']} {r.get('postal_code')}")
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            raise SystemExit(f"NEW_READY missing coords: {r['id']}")
        if not in_belarus(float(lat), float(lng)):
            raise SystemExit(f"NEW_READY out of Belarus: {r['id']}")

    brand_ready = Counter(r.get("brand") for r in new_ready)
    for brand, official in CLASS_A_OFFICIAL.items():
        if brand_ready.get(brand, 0) != official:
            raise SystemExit(
                f"Class A estate mismatch {brand}: {brand_ready.get(brand, 0)} != {official}"
            )

    save_geocode_cache(cache)

    write_json(OUT / "BELARUS_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "BELARUS_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "BELARUS_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "BELARUS_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "BELARUS_PHASE2_APPROVED_FOR_PRODUCTION.json", new_ready)
    write_json(OUT / "BELARUS_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "BELARUS_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "BELARUS_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "BELARUS_PHASE2_CLOSED.json", closed)
    write_json(STAGING, staging)
    write_json(PHASE2 / "colocated_distinct_gyms.json", COLOCATED_DISTINCT)
    write_json(
        PHASE2 / "missed_class_a_sweep.json",
        {
            "chains_searched": ["TopGym", "Fitness House", "Maximus", "Impulse"],
            "missed_class_a_chains_found": 0,
            "notes": "All probes <3 BY sites — excluded from Class A",
        },
    )
    write_json(
        PHASE2 / "independents_revalidation.json",
        {
            "phase1_independents": 5,
            "revalidated": 5,
            "promoted_new": 2,
            "notes": "Grafit/Delta/FitWorld reaffirmed; World Class + Gym Express promoted from NR",
        },
    )
    write_json(
        PHASE2 / "geocode_fixes_applied.json",
        {"fixes": list(GEOCODE_FIXES.keys()), "count": len(GEOCODE_FIXES)},
    )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre_sha,
        "phase1_rows_recovered": len(phase1_rows),
        "phase1_status_counts": sc1,
        "keep_existing": 0,
        "new_ready_to_import": len(new_ready),
        "existing_review_required": 0,
        "coming_soon": len(coming_soon),
        "excluded": len(excluded),
        "closed": len(closed),
        "status_counts": status_counts(staging),
        "nr_resolved": len(NR_RESOLUTIONS),
        "geocode_fixes": len(GEOCODE_FIXES),
        "class_a_brand_counts": dict(brand_ready),
    }
    write_json(PHASE2 / "recovery_summary.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post_sha != pre_sha:
        raise SystemExit("centers.json mutated during reconcile")
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post_sha + "\n", encoding="utf-8")

    print(
        f"Belarus Phase 2 reconcile: NEW={len(new_ready)} CS={len(coming_soon)} "
        f"EXCLUDED={len(excluded)} CLOSED={len(closed)} transitions={len(transitions)}"
    )


if __name__ == "__main__":
    main()
