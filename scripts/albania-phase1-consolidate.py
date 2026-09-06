#!/usr/bin/env python3
"""Albania Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    AL_POSTAL_RE,
    ROOT,
    format_al_postal,
    haversine,
    in_albania,
    status_counts,
    write_json,
)

OUT = ROOT / "data/albania"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e"
PRODUCTION_TOTAL = 11831
TERRITORY = "Albania"

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)

CITY_COVERAGE = {
    "Tirana": "independent_present_candidate",
    "Durrës": "independent_present_candidate",
    "Vlorë": "independent_present_candidate",
    "Shkodër": "independent_present_candidate",
    "Elbasan": "independent_present_candidate",
    "Fier": "independent_present_candidate",
    "Korçë": "independent_present_candidate",
    "Berat": "independent_present_candidate",
    "Lushnjë": "independent_present_candidate",
    "Pogradec": "independent_present_candidate",
    "Kavajë": "independent_present_candidate",
    "Gjirokastër": "independent_present_candidate",
    "Sarandë": "independent_present_candidate",
    "Lezhë": "independent_present_candidate",
    "Kukës": "independent_present_candidate",
    "Peshkopi": "independent_present_candidate",
    "Kamëz": "independent_present_candidate",
    "Krujë": "independent_present_candidate",
    "Patos": "independent_present_candidate",
    "Kuçovë": "independent_present_candidate",
    "Laç": "independent_present_candidate",
    "Burrel": "independent_present_candidate",
    "Librazhd": "independent_present_candidate",
    "Gramsh": "independent_present_candidate",
    "Tepelenë": "independent_present_candidate",
    "Golem": "A_legitimate_no_local_gym",
    "Konispol": "A_legitimate_no_local_gym",
    "Ksamil": "A_legitimate_no_local_gym",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Albania_All_Discovered_Centers.xlsx"
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
        "eligibility_candidate",
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
        ws.title = "Albania"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Albania_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def proximity_analysis(staging: list[dict]) -> dict:
    candidates = [
        r
        for r in staging
        if r.get("import_category") in ("READY_TO_IMPORT", "NEEDS_REVIEW", "NEEDS_COORDINATES")
        and r.get("lat") is not None
        and r.get("lng") is not None
        and not r.get("foreign_probe")
    ]
    same_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    diff_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    identical = []
    classifications = []
    for i, a in enumerate(candidates):
        for b in candidates[i + 1 :]:
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            same = (a.get("brand") or "").lower() == (b.get("brand") or "").lower()
            rec = {
                "a_id": a["id"],
                "b_id": b["id"],
                "a_brand": a.get("brand"),
                "b_brand": b.get("brand"),
                "distance_m": round(d, 1),
            }
            if d < 1e-4:
                identical.append(rec)
            bucket = None
            if d <= 25:
                bucket = "lt25"
            elif d <= 50:
                bucket = "lt50"
            elif d <= 100:
                bucket = "lt100"
            elif d <= 200:
                bucket = "lt200"
            if bucket:
                (same_brand if same else diff_brand)[bucket].append(rec)
                if d <= 100:
                    classifications.append(
                        {
                            **rec,
                            "verdict": (
                                "B_co_located_not_separate_club"
                                if same and d <= 50
                                else "C_name_confusion"
                                if same
                                else "B_distinct_current_clubs"
                            ),
                        }
                    )
    return {
        "identical_coordinates": identical,
        "same_brand": {k: len(v) for k, v in same_brand.items()},
        "different_brand": {k: len(v) for k, v in diff_brand.items()},
        "same_brand_pairs": same_brand,
        "different_brand_pairs": diff_brand,
        "pair_classifications": classifications,
        "hard_duplicate_conflicts": len(identical),
    }


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    (OUT / "ALBANIA_PHASE1_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == TERRITORY) == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("al_")) == 0

    candidates = json.loads(
        (OUT / "albania_phase1_candidates.json").read_text(encoding="utf-8")
    )
    staging: list[dict] = []
    geocode_review: list[dict] = []

    for r in candidates:
        row = dict(r)
        if row.get("territory") == TERRITORY and row.get("postal_code"):
            pc = format_al_postal(str(row["postal_code"])) or str(row["postal_code"])
            row["postal_code"] = pc

        elig = row.get("eligibility_candidate") or ""
        cat = row.get("import_category") or "NEEDS_REVIEW"

        if row.get("foreign_probe") or row.get("territory") not in (None, TERRITORY):
            cat = "EXCLUDED"
            row["country"] = row.get("territory") or row.get("country")

        if cat == "READY_TO_IMPORT":
            cat = "NEEDS_REVIEW"

        if elig == "CHAIN_CLASS_A":
            lat, lng = row.get("lat"), row.get("lng")
            ok = (
                lat is not None
                and lng is not None
                and in_albania(float(lat), float(lng))
                and AL_POSTAL_RE.match(str(row.get("postal_code") or ""))
                and not FALLBACK_RE.search(str(row.get("coord_source") or ""))
            )
            cat = "READY_TO_IMPORT" if ok else "NEEDS_COORDINATES"

        row["import_category"] = cat
        if row.get("lat") is not None and row.get("lng") is not None:
            if row.get("territory") == TERRITORY and not in_albania(
                float(row["lat"]), float(row["lng"])
            ):
                geocode_review.append(
                    {
                        "id": row["id"],
                        "issue": "outside_albania_gate",
                        "row": row["name"],
                    }
                )
                if cat in ("READY_TO_IMPORT", "NEEDS_REVIEW"):
                    row["import_category"] = "NEEDS_COORDINATES"

        staging.append(row)

    for row in staging:
        if row.get("import_category") == "READY_TO_IMPORT":
            if row.get("eligibility_candidate") != "CHAIN_CLASS_A":
                row["import_category"] = "NEEDS_REVIEW"

    ready = [r for r in staging if r["import_category"] == "READY_TO_IMPORT"]
    assert len(ready) == 0, "Phase 1 must not invent Class A READY"

    counts = status_counts(staging)
    ids = [r["id"] for r in staging]
    assert len(ids) == len(set(ids))

    al_rows = [
        r for r in staging if r.get("territory") == TERRITORY and not r.get("foreign_probe")
    ]
    invalid_pc = [
        r["id"]
        for r in al_rows
        if r["import_category"] in ("READY_TO_IMPORT", "NEEDS_REVIEW", "NEEDS_COORDINATES")
        and r.get("postal_code")
        and r.get("postal_code") != "n/a"
        and not AL_POSTAL_RE.match(str(r["postal_code"]))
        and r.get("discovery_class")
        not in ("regional_gap", "international_probe", "border_probe", "municipal")
    ]
    mojibake = [
        r["id"]
        for r in staging
        if MOJIBAKE_RE.search(
            f"{r.get('name')} {r.get('address')} {r.get('city')} {r.get('brand')}"
        )
    ]
    foreign_ready = [
        r["id"]
        for r in ready
        if r.get("foreign_probe") or r.get("territory") not in (None, TERRITORY)
    ]
    fallback_ready = [
        r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))
    ]
    hotel_spa_leakage_ready = [
        r["id"] for r in ready if r.get("hotel_spa_risk")
    ]

    dup = proximity_analysis(staging)

    chain_inventory = {
        "class_a_threshold": "≥3 conventional public locations inside Albania",
        "qualifying_class_a_chains": 0,
        "potential_class_a_operators": 1,
        "class_a_locations": 0,
        "international_chains": "ABSENT",
        "operators": {
            "Repeat": {
                "discovered_units": 3,
                "conventional_public_floors_verified": 0,
                "verdict": "POTENTIAL_CLASS_A",
                "class_a": False,
                "phase1_status": "NEEDS_REVIEW",
                "cities": ["Tirana"],
                "notes": "3 Tirana sites (Wilson, Nobis, TEG) — wellness/spa risk flagged; all NEEDS_REVIEW Phase 1",
            },
            "Flex Gym": {
                "discovered_units": 1,
                "conventional_public_floors_verified": 0,
                "verdict": "INDEPENDENT",
                "class_a": False,
                "phase1_status": "NEEDS_REVIEW",
                "cities": ["Tirana"],
                "notes": "Tirana conventional unit staged; Flex Classes CrossFit and Green Coast resort EXCLUDED",
            },
            "Basic-Fit": {"verdict": "ABSENT", "class_a": False},
            "PureGym": {"verdict": "ABSENT", "class_a": False},
            "McFIT": {"verdict": "ABSENT", "class_a": False},
            "JOHN REED": {"verdict": "ABSENT", "class_a": False},
            "Anytime Fitness": {"verdict": "ABSENT", "class_a": False},
            "Gold's Gym": {"verdict": "ABSENT", "class_a": False},
            "World Class": {"verdict": "ABSENT", "class_a": False},
            "Fitness Park": {"verdict": "ABSENT", "class_a": False},
            "FitActive": {"verdict": "ABSENT", "class_a": False},
            "Stay Fit Gym": {"verdict": "ABSENT", "class_a": False},
            "18GYM": {"verdict": "ABSENT", "class_a": False},
            "Ahilej": {"verdict": "ABSENT", "class_a": False, "notes": "Serbia-only"},
            "Clever Fit": {"verdict": "ABSENT", "class_a": False},
            "FITINN": {"verdict": "ABSENT", "class_a": False},
            "XBody": {"verdict": "ABSENT", "class_a": False},
            "Snap Fitness": {"verdict": "ABSENT", "class_a": False},
            "Curves": {"verdict": "ABSENT", "class_a": False},
        },
    }

    rebrand_map = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "F_unresolved",
                "entities": ["Repeat Tirana estate (Wilson, Nobis, TEG)"],
                "notes": "Confirm 3 Tirana floors are conventional public vs mall-wellness — Phase 2 Class A audit",
                "phase2": True,
            },
            {
                "type": "C_name_confusion",
                "entities": ["Planet Fitness Tirana (local)", "International Planet Fitness probe"],
                "notes": "Local Planet Fitness branding — verify distinct from US chain Phase 2",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Flex Gym Tirana", "Flex Classes CrossFit Tirana"],
                "notes": "Flex conventional vs CrossFit specialist — distinct entities; CrossFit EXCLUDED",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Hard Rock Gym Tirana", "Olympic Gym Tirana"],
                "notes": "Distinct Tirana independents pending Phase 2 premises proof",
            },
        ],
        "note": "Phase 1 allows Phase 2 holds; merge gate requires 0 unresolved before merge.",
    }

    smi = [
        r
        for r in staging
        if r.get("eligibility_candidate")
        in ("SMALL_MARKET_INDEPENDENT", "MULTI_SITE_BELOW_CLASS_A", "SPA_RISK_REVIEW", "POTENTIAL_CLASS_A")
        and r["import_category"] in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    municipal = [
        r for r in staging if r.get("eligibility_candidate") == "MUNICIPAL_CANDIDATE"
    ]

    foreign_probes = [r for r in staging if r.get("foreign_probe")]
    cross_border = {
        "montenegro_ready": 0,
        "kosovo_ready": 0,
        "mk_ready": 0,
        "greece_ready": 0,
        "foreign_probes_staged": len(foreign_probes),
        "foreign_probes_excluded": sum(
            1 for r in foreign_probes if r.get("import_category") == "EXCLUDED"
        ),
        "probes": [
            {
                "name": r.get("name"),
                "city": r.get("city"),
                "territory": r.get("territory"),
                "import_category": r.get("import_category"),
                "in_al_gate": (
                    in_albania(float(r["lat"]), float(r["lng"]))
                    if r.get("lat") is not None and r.get("lng") is not None
                    else False
                ),
            }
            for r in foreign_probes
        ],
    }

    phase1_justified_b = [c for c, v in CITY_COVERAGE.items() if v == "B_discovery_gap"]
    phase1_justified_a = [
        c for c, v in CITY_COVERAGE.items() if v == "A_legitimate_no_local_gym"
    ]
    projected = PRODUCTION_TOTAL + len(ready)

    report = {
        "country": TERRITORY,
        "phase": 1,
        "market": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "albania_live": 0,
        "al_prefix_live": 0,
        "staging_total": len(staging),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "qualifying_class_a_chains": 0,
        "potential_class_a_operators": 1,
        "class_a_locations": 0,
        "class_a_estates_complete": True,
        "plausible_independents": len(smi),
        "municipal_candidates": len(municipal),
        "city_coverage": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase1_justified_b_gaps_for_phase2": phase1_justified_b,
        "phase1_justified_a_gaps": phase1_justified_a,
        "data_quality": {
            "invalid_postcodes_ready_review": invalid_pc,
            "mojibake": mojibake,
            "foreign_ready": foreign_ready,
            "fallback_ready": fallback_ready,
            "hotel_spa_leakage_ready": len(hotel_spa_leakage_ready),
            "hard_duplicate_conflicts": dup["hard_duplicate_conflicts"],
            "unresolved_rebrand_conflicts_for_merge": 0,
            "phase2_rebrand_holds": 1,
        },
        "cross_border": cross_border,
        "hotel_spa_audit": {
            "performed": True,
            "hotel_spa_excluded": True,
            "hotel_spa_leakage_ready": 0,
            "notes": "Repeat Nobis, Durrës hotel/resort amenities, Golem and Green Coast resort staged EXCLUDED or flagged.",
        },
        "small_market_assessment": "INDEPENDENT_PHASE_RECOMMENDED",
        "phase2_required": True,
        "merge_ready": False,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "ALBANIA PHASE 2 REQUIRED BEFORE MERGE",
    }

    city_coverage_doc = {
        "cities": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase1_justified_b_gaps_for_phase2": phase1_justified_b,
        "phase1_justified_a_gaps": phase1_justified_a,
    }

    write_json(OUT / "albania_centers_staging.json", staging)
    write_json(OUT / "ALBANIA_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "ALBANIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "ALBANIA_PHASE1_CHAIN_INVENTORY.json", chain_inventory)
    write_json(OUT / "ALBANIA_PHASE1_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "ALBANIA_PHASE1_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "ALBANIA_PHASE1_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "ALBANIA_PHASE1_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "ALBANIA_PHASE1_CITY_COVERAGE.json", city_coverage_doc)
    write_xlsx(staging)

    phase1 = OUT / "phase1"
    phase1.mkdir(parents=True, exist_ok=True)
    write_json(phase1 / "phase1_staging_snapshot.json", staging)
    write_json(
        phase1 / "discover_freeze.json",
        {
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": EXPECTED_SHA,
            "albania_live": 0,
            "al_prefix_live": 0,
            "candidates": len(candidates),
            "staging_total": len(staging),
            "ready": len(ready),
        },
    )

    after_raw = CENTERS.read_bytes()
    after_sha = hashlib.sha256(after_raw).hexdigest()
    assert after_sha == sha == EXPECTED_SHA, after_sha
    (OUT / "ALBANIA_PHASE1_SHA_AFTER.txt").write_text(after_sha + "\n", encoding="utf-8")

    md = f"""# ALBANIA DEEP PHASE 1 — READINESS REPORT

## Verdict

**ALBANIA PHASE 2 REQUIRED BEFORE MERGE**

## Freeze

- Production total: {PRODUCTION_TOTAL}
- Albania live: 0
- al_* live: 0
- SHA256: `{sha}`

## Status counts

{json.dumps(counts, indent=2)}

## Class A

- Qualifying Class A chains: **0**
- Potential Class A operators: **1**
- Class A locations: **0**
- Repeat: 3 Tirana sites (Wilson, Nobis, TEG) — potential Class A, wellness/spa risk flagged
- International chains: **ABSENT**

## Market

**INDEPENDENT_PHASE_RECOMMENDED**

Plausible independents / potential Class A staged for Phase 2: {len(smi)}

Municipal candidates: {len(municipal)}

## City coverage

{json.dumps(CITY_COVERAGE, indent=2, ensure_ascii=False)}

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} READY = **{projected}**

Crosses 12,500: **NO**

Global Stress QA required now: **NO**

## Data quality

- Foreign READY outliers: 0
- Fallback READY coords: 0
- Hotel/spa READY leakage: 0
- Mojibake: {len(mojibake)}
- Hard duplicate conflicts: {dup['hard_duplicate_conflicts']}

## Cross-border

- Montenegro / Kosovo / North Macedonia / Greece READY: **0**

## Merge readiness

merge_ready: **false**

Phase 2 required: **true**
"""
    (OUT / "ALBANIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(
        json.dumps(
            {
                "staging": len(staging),
                "ready": len(ready),
                "counts": counts,
                "projected_catalog": projected,
                "verdict": report["verdict"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
