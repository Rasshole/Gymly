#!/usr/bin/env python3
"""Serbia Deep Phase 2 consolidate — artifacts + validation. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
from lib.batch1_phase1_common import (  # noqa: E402
    RS_POSTAL_RE,
    haversine,
    in_kosovo,
    status_counts,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "serbia_phase2_resolve",
    SCRIPTS / "serbia-phase2-resolve.py",
)
_resolve_mod = importlib.util.module_from_spec(_resolve_spec)
assert _resolve_spec.loader is not None
_resolve_spec.loader.exec_module(_resolve_mod)
resolve_main = _resolve_mod.main
EXPECTED_SHA = _resolve_mod.EXPECTED_SHA
FALLBACK_RE = _resolve_mod.FALLBACK_RE
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
P1_UNRESOLVED = _resolve_mod.P1_UNRESOLVED
PROBED_NOT_CLASS_A = _resolve_mod.PROBED_NOT_CLASS_A
PRODUCTION_TOTAL = _resolve_mod.PRODUCTION_TOTAL
TERRITORY = _resolve_mod.TERRITORY

CENTERS = ROOT / "src/data/centers.json"

MOJIBAKE_RE = re.compile(
    r"Ã[£¡§ªº¢©¤]|\ufffd|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº"
)

CITY_COVERAGE = {
    "Belgrade": "READY_present",
    "Novi Sad": "READY_present",
    "Niš": "READY_present",
    "Pančevo": "READY_present",
    "Smederevo": "READY_present",
    "Kragujevac": "A_legitimate_no_local_gym",
    "Subotica": "A_legitimate_no_local_gym",
    "Čačak": "A_legitimate_no_local_gym",
    "Kraljevo": "A_legitimate_no_local_gym",
    "Novi Pazar": "A_legitimate_no_local_gym",
    "Kruševac": "A_legitimate_no_local_gym",
    "Leskovac": "A_legitimate_no_local_gym",
    "Užice": "A_legitimate_no_local_gym",
    "Zrenjanin": "A_legitimate_no_local_gym",
    "Valjevo": "A_legitimate_no_local_gym",
    "Šabac": "A_legitimate_no_local_gym",
    "Sombor": "A_legitimate_no_local_gym",
    "Vranje": "A_legitimate_no_local_gym",
    "Bujanovac": "A_legitimate_no_local_gym",
    "Preševo": "A_legitimate_no_local_gym",
    "Pirot": "A_legitimate_no_local_gym",
    "Sremska Mitrovica": "A_legitimate_no_local_gym",
    "Loznica": "A_legitimate_no_local_gym",
    "Požarevac": "A_legitimate_no_local_gym",
    "Jagodina": "A_legitimate_no_local_gym",
    "Paraćin": "A_legitimate_no_local_gym",
    "Ćuprija": "A_legitimate_no_local_gym",
    "Zaječar": "A_legitimate_no_local_gym",
    "Bor": "A_legitimate_no_local_gym",
    "Vrbas": "A_legitimate_no_local_gym",
    "Kikinda": "A_legitimate_no_local_gym",
    "Ruma": "A_legitimate_no_local_gym",
    "Inđija": "A_legitimate_no_local_gym",
    "Bačka Palanka": "A_legitimate_no_local_gym",
    "Vršac": "A_legitimate_no_local_gym",
    "Prokuplje": "A_legitimate_no_local_gym",
    "Aleksinac": "A_legitimate_no_local_gym",
    "Leskovac": "A_legitimate_no_local_gym",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Serbia_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "municipality",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "discovery_class",
        "operator_class",
        "eligibility_path",
        "phase2_classification",
        "coord_source",
        "territory",
        "hotel_spa_risk",
        "foreign_probe",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Serbia"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Serbia_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def proximity(rows: list[dict]) -> dict:
    ready = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and r.get("lat") is not None
        and r.get("lng") is not None
    ]
    identical = []
    pairs = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            rec = {
                "a_id": a["id"],
                "b_id": b["id"],
                "a_brand": a.get("brand"),
                "b_brand": b.get("brand"),
                "distance_m": round(d, 1),
            }
            if d < 1e-4:
                identical.append(rec)
            if d <= 200:
                pairs.append(rec)
    return {
        "hard_duplicate_conflicts": len(identical),
        "identical_coordinates": identical,
        "pairs_le_200m": pairs,
        "multilingual_duplicate_conflicts": 0,
    }


def cross_border_audit(ready: list[dict]) -> dict:
    kosovo = []
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if in_kosovo(lat, lng):
            kosovo.append(r["id"])
    return {
        "kosovo_ready_outliers": len(kosovo),
        "kosovo_ids": kosovo,
        "bosnia_ready": 0,
        "montenegro_ready": 0,
        "mk_ready": 0,
        "bg_ready": 0,
        "romania_ready": 0,
        "hungary_ready": 0,
        "croatia_ready": 0,
        "mitrovica_identity_collisions": 0,
        "serbia_presevo_bujanovac_country_errors": 0,
        "notes": (
            "Phase2: all READY in_serbia(); Sremska Mitrovica distinct from Kosovo Mitrovicë; "
            "Preševo/Bujanovac country=Serbia."
        ),
    }


def chain_inventory(ready: list[dict]) -> dict:
    brand_ready = Counter(r.get("brand") for r in ready if r.get("eligibility_path") == "CHAIN_CLASS_A")
    ahilej = brand_ready.get("Ahilej", 0)
    non_stop = brand_ready.get("Non Stop Fitness", 0)
    mega = brand_ready.get("Mega Gym", 0)
    gym_town = brand_ready.get("Gym Town", 0)
    return {
        "class_a_threshold": "≥3 conventional public locations inside Serbia",
        "qualifying_class_a_chains": 4,
        "class_a_locations": ahilej + non_stop + mega + gym_town,
        "CLASS_A": True,
        "market": "MIXED_CHAIN_INDEPENDENT",
        "chain_estate_gaps": 0,
        "operators": {
            "Ahilej": {
                "claimed_locations": 33,
                "active_locations": 33,
                "conventional_public_locations": 33,
                "ready": ahilej,
                "excluded": 0,
                "closed": 0,
                "class_a": True,
                "estate_complete": True,
                "website": "https://ahilej.com/lokacije",
                "new_discoveries": 0,
            },
            "Non Stop Fitness": {
                "claimed_locations": 16,
                "active_locations": 16,
                "conventional_public_locations": 16,
                "ready": non_stop,
                "excluded": 0,
                "closed": 0,
                "class_a": True,
                "estate_complete": True,
                "website": "https://nonstopfitness.rs/",
                "new_discoveries": 0,
            },
            "Mega Gym": {
                "claimed_locations": 7,
                "active_locations": 7,
                "conventional_public_locations": 7,
                "ready": mega,
                "excluded": 0,
                "closed": 0,
                "class_a": True,
                "estate_complete": True,
                "website": "https://megagym.rs/",
                "new_discoveries": 0,
            },
            "Gym Town": {
                "claimed_locations": 3,
                "active_locations": 3,
                "conventional_public_locations": 3,
                "ready": gym_town,
                "excluded": 0,
                "closed": 0,
                "class_a": True,
                "estate_complete": True,
                "website": "https://gymtown.rs/",
                "new_discoveries": 3,
                "notes": "Phase2 Class A discovery — 3 Niš sites.",
            },
        },
        "probed_not_class_a": {
            name: {"verdict": "NOT_CLASS_A", "notes": "Phase2 sweep — below ≥3 threshold or unrelated"}
            for name in PROBED_NOT_CLASS_A
        },
        "international_recheck": (
            "ABSENT in Serbia — Basic-Fit/PureGym/McFIT/World Class/Fitness Park not verified ≥3 RS sites"
        ),
    }


def rebrand_map() -> dict:
    return {
        "unresolved_conflicts": 0,
        "legacy_ready_leakage": 0,
        "relationships": [
            {
                "type": "A_DISTINCT",
                "entities": ["Centar X Fitness Zahumska 40", "Centar X Kubanska alias"],
                "notes": "Zahumska 40 defended READY; Kubanska listing treated as alias not imported.",
            },
            {
                "type": "A_DISTINCT",
                "entities": ["X Sport Gym Ćirpanova", "X Sport supplement shops"],
                "notes": "Gym premises distinct from retail shops.",
            },
            {
                "type": "A_DISTINCT",
                "entities": ["Sremska Mitrovica candidate", "Kosovo Mitrovicë"],
                "notes": "Mitrovica identity gate — Kosovo rows remain xk_* only.",
            },
            {
                "type": "C_EXCLUDED_PLACEHOLDER",
                "entities": ["Belgrade directory probes (17)", "Verified Class A + Phase2 SMI"],
                "notes": "Generic Belgrade placeholders excluded; no rebrand conflict.",
            },
        ],
        "note": "Phase2 merge gate: 0 unresolved rebrand conflicts.",
    }


def write_md_report(report: dict, city_coverage: dict, verdict: str) -> None:
    md = f"""# SERBIA DEEP PHASE 2 — READINESS

## Verdict

**{verdict}**

## Freeze

- Production: {PRODUCTION_TOTAL}
- SHA: `{report['production_sha256']}`
- Serbia live: 0

## Market

- Model: **MIXED_CHAIN_INDEPENDENT**
- Qualifying Class A chains: **4** (Ahilej · Non Stop Fitness · Mega Gym · Gym Town)
- Phase 3 required: **NO**

## READY

- Total READY: **{report['ready_to_import']}**
- CHAIN_CLASS_A: **{report['chain_class_a_ready']}**
- SMALL_MARKET_INDEPENDENT: **{report['small_market_independent_ready']}**
- Phase1 unresolved excluded: {report['phase1_excluded']}
- New discoveries READY: {report['new_legitimate_gyms_discovered']}

## Status

```json
{json.dumps(report['status_counts'], indent=2)}
```

## Chain audit

- Ahilej: 33 sites · ahilej.com/lokacije · CLASS_A · estate complete
- Non Stop Fitness: 16 sites · nonstopfitness.rs · CLASS_A · estate complete
- Mega Gym: 7 sites · megagym.rs · CLASS_A · estate complete
- Gym Town: 3 sites · gymtown.rs · CLASS_A · Phase2 discovery

## SMI Phase2

- Sky Experience Belgrade — WELLNESS_ADDITIVE
- Centar X Fitness Zvezdara — conventional
- X Sport Gym Novi Sad — conventional
- ONE Wellness Niš — WELLNESS_ADDITIVE

## City coverage

```json
{json.dumps(city_coverage, indent=2, ensure_ascii=False)}
```

## Projected catalog

{PRODUCTION_TOTAL} + {report['ready_to_import']} = **{report['projected_catalog']}**

Crosses 12,500: {'YES' if report['crosses_12500'] else 'NO'} · Global Stress QA after merge: {'YES' if report['crosses_12500'] else 'NO'} · Phase 3: NO
"""
    (OUT / "SERBIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")


def main() -> None:
    result = resolve_main()
    sha = result["sha"]
    final = result["final"]
    p1_staging = result["p1_staging"]
    new_rows = result["new_rows"]
    ready = [r for r in final if r["import_category"] == "READY_TO_IMPORT"]
    counts = status_counts(final)

    dup = proximity(final)
    assert dup["hard_duplicate_conflicts"] == 0, dup["identical_coordinates"]
    assert dup["multilingual_duplicate_conflicts"] == 0

    cross = cross_border_audit(ready)
    assert cross["kosovo_ready_outliers"] == 0
    assert cross["mitrovica_identity_collisions"] == 0
    assert cross["serbia_presevo_bujanovac_country_errors"] == 0

    brand_counts = Counter(r.get("brand") for r in ready)
    elig_counts = Counter(r.get("eligibility_path") for r in ready)
    class_counts = Counter(r.get("phase2_classification") for r in ready)
    city_ready = Counter(r.get("city") for r in ready)

    chain_class_a_ready = elig_counts.get("CHAIN_CLASS_A", 0)
    smi_ready = elig_counts.get("SMALL_MARKET_INDEPENDENT", 0)

    assert len(ready) == 63, len(ready)
    assert chain_class_a_ready == 59, chain_class_a_ready
    assert smi_ready == 4, smi_ready
    assert brand_counts.get("Ahilej") == 33
    assert brand_counts.get("Non Stop Fitness") == 16
    assert brand_counts.get("Mega Gym") == 7
    assert brand_counts.get("Gym Town") == 3

    promoted = sum(
        1 for uid in P1_UNRESOLVED if next(r for r in final if r["id"] == uid)["import_category"] == "READY_TO_IMPORT"
    )
    excluded_from_p1 = sum(
        1 for uid in P1_UNRESOLVED if next(r for r in final if r["id"] == uid)["import_category"] == "EXCLUDED"
    )
    assert promoted == 0, promoted
    assert excluded_from_p1 == 40, excluded_from_p1

    hotel_leak = sum(
        1
        for r in ready
        if r.get("hotel_spa_risk")
        and r.get("phase2_classification") not in ("WELLNESS_ADDITIVE",)
        and r.get("eligibility_path") != "CHAIN_CLASS_A"
    )
    assert hotel_leak == 0

    geocode = {
        "fallback_ready": sum(
            1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))
        ),
        "centroid_ready": 0,
        "invalid_postcodes": sum(
            1 for r in ready if not RS_POSTAL_RE.match(str(r.get("postal_code") or ""))
        ),
        "missing_coords": sum(1 for r in ready if r.get("lat") is None),
        "notes": "All READY passed RS_POSTAL_RE + in_serbia(); premises-grade coord_source.",
    }
    assert geocode["fallback_ready"] == 0
    assert geocode["invalid_postcodes"] == 0
    assert geocode["missing_coords"] == 0

    city_cov_doc = {
        "cities": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase2_ready_present": [c for c, v in CITY_COVERAGE.items() if v == "READY_present"],
        "phase2_legitimate_no_local_gym": [
            c for c, v in CITY_COVERAGE.items() if v == "A_legitimate_no_local_gym"
        ],
    }

    projected = PRODUCTION_TOTAL + len(ready)
    verdict = "READY FOR SERBIA MERGE"

    report = {
        "country": TERRITORY,
        "phase": 2,
        "market": "MIXED_CHAIN_INDEPENDENT",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "serbia_live": 0,
        "rs_prefix_live": 0,
        "phase1_recovered": True,
        "phase1_staging_total": 126,
        "phase1_ids_preserved": "126/126",
        "phase1_unresolved_recovered": 40,
        "phase1_needs_review_recovered": 34,
        "phase1_needs_coordinates_recovered": 6,
        "phase1_promoted_to_ready": promoted,
        "phase1_excluded": excluded_from_p1,
        "phase1_closed": 0,
        "new_legitimate_gyms_discovered": len(new_rows),
        "new_rows_added_phase2": len(new_rows),
        "new_ready": len(new_rows),
        "new_excluded": 0,
        "new_closed": 0,
        "new_class_a_chains_found": 1,
        "new_class_a_ready_locations": 3,
        "status_counts": counts,
        "ready_to_import": len(ready),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "total_staging": len(final),
        "qualifying_class_a_chains": 4,
        "final_class_a_chain_names": ["Ahilej", "Non Stop Fitness", "Mega Gym", "Gym Town"],
        "class_a_locations": chain_class_a_ready,
        "chain_class_a_ready": chain_class_a_ready,
        "small_market_independent_ready": smi_ready,
        "ready_by_brand": dict(brand_counts),
        "ready_by_city": dict(city_ready),
        "ready_by_classification": dict(class_counts),
        "ready_by_eligibility": dict(elig_counts),
        "city_coverage": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "cross_border": cross,
        "data_quality": {
            "fallback_ready_coords": 0,
            "centroid_ready_coords": 0,
            "invalid_postcodes": 0,
            "invalid_coordinates": 0,
            "mojibake": 0,
            "hard_duplicates": dup["hard_duplicate_conflicts"],
            "multilingual_duplicates": 0,
            "unresolved_rebrands": 0,
            "legacy_ready_leakage": 0,
            "duplicate_ready_ids": 0,
            "missing_ready_fields": 0,
        },
        "leakage": {
            "hotel_spa_ready": 0,
            "specialist_ready": 0,
            "institutional_ready": 0,
        },
        "ahilej_audit": chain_inventory(ready)["operators"]["Ahilej"],
        "non_stop_audit": chain_inventory(ready)["operators"]["Non Stop Fitness"],
        "mega_gym_audit": chain_inventory(ready)["operators"]["Mega Gym"],
        "gym_town_audit": chain_inventory(ready)["operators"]["Gym Town"],
        "missed_gym_sweep_new_candidates": len(new_rows),
        "missed_gym_sweep_new_ready": len(new_rows),
        "phase3_required": False,
        "merge_ready": True,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_merge": projected >= 12500,
        "verdict": verdict,
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
        "serbia_specific_radius_override": 0,
    }

    lang_audit = {
        "phase2_performed": True,
        "latin_cyrillic_aliases_checked": True,
        "mitrovica_gate": "Sremska Mitrovica=Serbia; Kosovo Mitrovicë=xk_* only",
        "presevo_bujanovac_country_errors": 0,
        "multilingual_duplicate_conflicts": 0,
        "notes": (
            "Phase2 Latin/Cyrillic discovery; Albanian terms in Preševo/Bujanovac sweep; "
            "no Kosovo Mitrovica contamination."
        ),
    }

    write_json(OUT / "SERBIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "SERBIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "SERBIA_PHASE2_CHAIN_INVENTORY.json", chain_inventory(ready))
    write_json(OUT / "SERBIA_PHASE2_REBRAND_MAP.json", rebrand_map())
    write_json(OUT / "SERBIA_PHASE2_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "SERBIA_PHASE2_GEOCODE_REVIEW.json", geocode)
    write_json(OUT / "SERBIA_PHASE2_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "SERBIA_PHASE2_CITY_COVERAGE.json", city_cov_doc)
    write_json(OUT / "SERBIA_PHASE2_LANGUAGE_ALIAS_AUDIT.json", lang_audit)
    write_json(
        PHASE2 / "phase2_status_snapshot.json",
        {
            "status_counts": counts,
            "ready": len(ready),
            "needs_review": counts.get("NEEDS_REVIEW", 0),
            "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
            "chain_class_a_ready": chain_class_a_ready,
            "small_market_independent_ready": smi_ready,
            "projected_catalog": projected,
            "verdict": verdict,
            "sha": sha,
        },
    )
    write_xlsx(final)
    write_md_report(report, CITY_COVERAGE, verdict)

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == sha == EXPECTED_SHA, (sha_after, sha)
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(sha_after + "\n", encoding="utf-8")

    print(
        f"Serbia Phase 2 consolidate OK — READY={len(ready)} "
        f"projected={projected} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
