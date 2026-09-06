#!/usr/bin/env python3
"""Montenegro Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    ME_POSTAL_RE,
    format_me_postal,
    haversine,
    in_montenegro,
    status_counts,
    write_json,
)

OUT = ROOT / "data/montenegro"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8"
PRODUCTION_TOTAL = 11749

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)

CITY_COVERAGE = {
    "Podgorica": "independent_present_candidate",
    "Nikšić": "independent_present_candidate",
    "Budva": "independent_present_candidate",
    "Bar": "independent_present_candidate",
    "Herceg Novi": "independent_present_candidate",
    "Kotor": "A_legitimate_no_local_gym",
    "Tivat": "independent_present_candidate",
    "Bijelo Polje": "independent_present_candidate",
    "Berane": "municipal_present_candidate",
    "Ulcinj": "B_discovery_gap",
    "Cetinje": "B_discovery_gap",
    "Pljevlja": "B_discovery_gap",
    "Rožaje": "B_discovery_gap",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Montenegro_All_Discovered_Centers.xlsx"
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
        ws.title = "Montenegro"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Montenegro_All_Discovered_Centers.csv"
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
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Montenegro") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("me_")) == 0

    candidates = json.loads((OUT / "montenegro_phase1_candidates.json").read_text())
    staging: list[dict] = []
    geocode_cache: dict = {}
    geocode_review: list[dict] = []

    for r in candidates:
        row = dict(r)
        if row.get("territory") == "Montenegro" and row.get("postal_code"):
            pc = format_me_postal(str(row["postal_code"])) or str(row["postal_code"])
            row["postal_code"] = pc

        # Never promote Class A READY — no qualifying ≥3 conventional ME estate
        elig = row.get("eligibility_candidate") or ""
        cat = row.get("import_category") or "NEEDS_REVIEW"

        if row.get("foreign_probe") or row.get("territory") not in (None, "Montenegro"):
            cat = "EXCLUDED"
            row["country"] = row.get("territory") or row.get("country")

        if cat == "READY_TO_IMPORT":
            # Safety: Phase 1 has zero Class A — demote any accidental READY
            cat = "NEEDS_REVIEW"

        if elig == "CHAIN_CLASS_A":
            # None expected; if present require full READY gates
            lat, lng = row.get("lat"), row.get("lng")
            ok = (
                lat is not None
                and lng is not None
                and in_montenegro(float(lat), float(lng))
                and ME_POSTAL_RE.match(str(row.get("postal_code") or ""))
                and not FALLBACK_RE.search(str(row.get("coord_source") or ""))
            )
            cat = "READY_TO_IMPORT" if ok else "NEEDS_COORDINATES"

        row["import_category"] = cat
        if row.get("lat") is not None and row.get("lng") is not None:
            geocode_cache[row["id"]] = {
                "lat": row["lat"],
                "lng": row["lng"],
                "coord_source": row.get("coord_source"),
            }
            if row.get("territory") == "Montenegro" and not in_montenegro(
                float(row["lat"]), float(row["lng"])
            ):
                geocode_review.append(
                    {"id": row["id"], "issue": "outside_montenegro_gate", "row": row["name"]}
                )
                if cat in ("READY_TO_IMPORT", "NEEDS_REVIEW"):
                    row["import_category"] = "NEEDS_COORDINATES"
        elif cat in ("NEEDS_REVIEW",) and elig in (
            "SMALL_MARKET_INDEPENDENT",
            "MULTI_SITE_BELOW_CLASS_A",
            "MUNICIPAL_CANDIDATE",
        ):
            # keep as NEEDS_COORDINATES if already set; else leave NEEDS_REVIEW without coords
            pass

        staging.append(row)

    # Force: no READY Class A in Phase 1
    for row in staging:
        if row.get("import_category") == "READY_TO_IMPORT":
            if row.get("eligibility_candidate") != "CHAIN_CLASS_A":
                row["import_category"] = "NEEDS_REVIEW"

    ready = [r for r in staging if r["import_category"] == "READY_TO_IMPORT"]
    assert len(ready) == 0, "Phase 1 must not invent Class A READY"

    counts = status_counts(staging)
    ids = [r["id"] for r in staging]
    assert len(ids) == len(set(ids))

    # DQ
    me_rows = [r for r in staging if r.get("territory") == "Montenegro" and not r.get("foreign_probe")]
    invalid_pc = [
        r["id"]
        for r in me_rows
        if r["import_category"] in ("READY_TO_IMPORT", "NEEDS_REVIEW", "NEEDS_COORDINATES")
        and r.get("postal_code")
        and r.get("postal_code") != "n/a"
        and not ME_POSTAL_RE.match(str(r["postal_code"]))
        and r.get("discovery_class") not in ("regional_gap", "international_probe")
    ]
    # Allow n/a postal only on excluded probes
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
        if r.get("foreign_probe") or r.get("territory") not in (None, "Montenegro")
    ]
    fallback_ready = [
        r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))
    ]

    dup = proximity_analysis(staging)

    # Chain inventory
    chain_inventory = {
        "class_a_threshold": "≥3 conventional public locations inside Montenegro",
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "operators": {
            "Benex Fitness": {
                "discovered_conventional_sites": 2,
                "verdict": "PARTIAL",
                "class_a": False,
                "notes": "2 Podgorica sites — below Class A threshold",
            },
            "Soko Gym": {
                "discovered_units": 3,
                "conventional_candidate_floors": 1,
                "verdict": "EXCLUDED_AS_CLASS_A",
                "class_a": False,
                "notes": "Morača conventional + Lady aerobics + mall wellness — not 3 conventional floors",
            },
            "City Fitness": {
                "discovered_conventional_sites": 1,
                "verdict": "PARTIAL",
                "class_a": False,
                "notes": "Single Dom Revolucije site; Pete proleterske legacy closed",
            },
            "Ahilej": {"verdict": "ABSENT", "class_a": False, "notes": "Serbia-only"},
            "Anytime Fitness": {"verdict": "ABSENT", "class_a": False},
            "Basic-Fit": {"verdict": "ABSENT", "class_a": False},
            "McFIT": {"verdict": "ABSENT", "class_a": False},
            "World Class": {"verdict": "ABSENT", "class_a": False},
            "PureGym": {"verdict": "ABSENT", "class_a": False},
        },
    }

    rebrand_map = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "A_current_successor",
                "from": "City Fitness Pete proleterske",
                "to": "City Fitness Dom Revolucije Nikšić",
                "notes": "Moved 2019 into Dom Revolucije",
            },
            {
                "type": "C_name_confusion",
                "entities": ["Urban Gym", "GO GYM"],
                "notes": "Possible co-location / shared marketing — Phase 2 confirm",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Hulk 23 Podgorica", "Teretana Hulk Bijelo Polje"],
                "notes": "Same brand name, different cities — not a Class A estate",
            },
            {
                "type": "F_unresolved",
                "entities": ["Soko Gym City", "Soko Gym Morača"],
                "notes": "Confirm whether City is distinct live floor",
                "phase2": True,
            },
        ],
        "note": "F_unresolved Soko City is held for Phase 2; merge gate requires 0 unresolved before merge — Phase 1 allows Phase 2 hold.",
    }

    smi = [
        r
        for r in staging
        if r.get("eligibility_candidate")
        in ("SMALL_MARKET_INDEPENDENT", "MULTI_SITE_BELOW_CLASS_A")
        and r["import_category"] in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    municipal = [
        r for r in staging if r.get("eligibility_candidate") == "MUNICIPAL_CANDIDATE"
    ]

    projected = PRODUCTION_TOTAL + len(ready)
    report = {
        "country": "Montenegro",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "montenegro_live": 0,
        "me_prefix_live": 0,
        "staging_total": len(staging),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "class_a_estates_complete": True,  # vacuously — none exist
        "plausible_independents": len(smi),
        "municipal_candidates": len(municipal),
        "city_coverage": CITY_COVERAGE,
        "unexplained_b_gaps": 0,  # Ulcinj/Cetinje/Pljevlja/Rožaje marked B for Phase 2
        "unexplained_d_gaps": 0,
        "phase1_justified_b_gaps_for_phase2": ["Ulcinj", "Cetinje", "Pljevlja", "Rožaje"],
        "data_quality": {
            "invalid_postcodes_ready_review": invalid_pc,
            "mojibake": mojibake,
            "foreign_ready": foreign_ready,
            "fallback_ready": fallback_ready,
            "hard_duplicate_conflicts": dup["hard_duplicate_conflicts"],
            "unresolved_rebrand_conflicts_for_merge": 0,
            "phase2_rebrand_holds": 1,
        },
        "cross_border": {
            "serbia_ready": 0,
            "bosnia_ready": 0,
            "croatia_ready": 0,
            "albania_ready": 0,
            "kosovo_ready": 0,
        },
        "small_market_assessment": "INDEPENDENT_PHASE_RECOMMENDED",
        "phase2_required": True,
        "merge_ready": False,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "MONTENEGRO PHASE 2 REQUIRED BEFORE MERGE",
    }

    write_json(OUT / "montenegro_centers_staging.json", staging)
    write_json(OUT / "MONTENEGRO_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "MONTENEGRO_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "MONTENEGRO_PHASE1_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "montenegro_chain_inventory.json", chain_inventory)
    write_json(OUT / "montenegro_duplicate_analysis.json", dup)
    write_json(OUT / "montenegro_geocode_cache.json", geocode_cache)
    write_json(OUT / "montenegro_geocode_review.json", geocode_review)
    write_json(OUT / "montenegro_phase1_candidates.json", candidates)
    write_xlsx(staging)

    md = f"""# MONTENEGRO DEEP PHASE 1 — READINESS REPORT

## Verdict

**MONTENEGRO PHASE 2 REQUIRED BEFORE MERGE**

## Freeze

- Production total: {PRODUCTION_TOTAL}
- Montenegro live: 0
- me_* live: 0
- SHA256: `{sha}`

## Status counts

{json.dumps(counts, indent=2)}

## Class A

- Qualifying Class A chains: **0**
- Class A locations: **0**
- Benex Fitness: 2 sites (below threshold)
- Soko Gym: not 3 conventional floors
- City Fitness: 1 site
- International chains: ABSENT

## Small-market

**INDEPENDENT_PHASE_RECOMMENDED**

Plausible independents / multi-site-below-A staged for Phase 2: {len(smi)}

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
- Mojibake: {len(mojibake)}
- Hard duplicate conflicts: {dup['hard_duplicate_conflicts']}

## Merge readiness

merge_ready: **false**

Phase 2 required: **true**
"""
    (OUT / "MONTENEGRO_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps({"staging": len(staging), "ready": len(ready), "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
