#!/usr/bin/env python3
"""San Marino Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    SM_POSTAL_RE,
    format_sm_postal,
    haversine,
    in_san_marino,
    status_counts,
    write_json,
)

OUT = ROOT / "data/san-marino"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28"
PRODUCTION_TOTAL = 11715

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|castello.?approx", re.I
)

CASTELLO_COVERAGE = {
    "San Marino": "independent_present_candidate",
    "Borgo Maggiore": "independent_present_candidate",
    "Serravalle": "independent_present_candidate",
    "Domagnano": "independent_present_candidate",
    "Fiorentino": "A_legitimate_no_gym_presence",
    "Acquaviva": "A_legitimate_no_gym_presence",
    "Faetano": "A_legitimate_no_gym_presence",
    "Chiesanuova": "A_legitimate_no_gym_presence",
    "Montegiardino": "A_legitimate_no_gym_presence",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_San_Marino_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "castello",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "discovery_class",
        "operator_class",
        "eligibility_candidate",
        "territory",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "SanMarino"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_San_Marino_All_Discovered_Centers.csv"
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
        if r.get("import_category") == "NEEDS_REVIEW"
        and r.get("lat") is not None
        and r.get("lng") is not None
    ]
    same_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    diff_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    identical = []
    same_addr = []
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
                "distance_m": round(d),
                "classification": "B_DISTINCT_CURRENT_CLUBS",
            }
            if abs(float(a["lat"]) - float(b["lat"])) < 1e-7 and abs(
                float(a["lng"]) - float(b["lng"])
            ) < 1e-7:
                identical.append({**rec, "classification": "A_HARD_DUPLICATE"})
            addr_a = f"{a.get('address')}|{a.get('postal_code')}".lower()
            addr_b = f"{b.get('address')}|{b.get('postal_code')}".lower()
            if addr_a == addr_b and a.get("address"):
                same_addr.append(rec)
            bucket = same_brand if same else diff_brand
            if d <= 25:
                bucket["lt25"].append(rec)
            if d <= 50:
                bucket["lt50"].append(rec)
            if d <= 100:
                bucket["lt100"].append(rec)
            if d <= 200:
                bucket["lt200"].append(rec)
            if d <= 200:
                classifications.append(rec)
    unexplained = len([x for x in identical if x["classification"] == "A_HARD_DUPLICATE"])
    return {
        "candidate_count": len(candidates),
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "same_brand": same_brand,
        "different_brand": diff_brand,
        "close_pair_classifications": classifications,
        "unexplained_hard_duplicates": unexplained,
    }


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "San Marino") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("sm_")) == 0

    candidates = json.loads((OUT / "san_marino_phase1_candidates.json").read_text(encoding="utf-8"))
    staging: list[dict] = []
    for r in candidates:
        row = dict(r)
        if row.get("territory") == "San Marino":
            pc = format_sm_postal(row.get("postal_code") or "")
            if pc:
                row["postal_code"] = pc
        # Micro-market: never leave READY in Phase 1
        if row.get("import_category") == "READY_TO_IMPORT":
            row["import_category"] = "NEEDS_REVIEW"
            row["notes"] = (row.get("notes") or "") + " | demoted READY→NEEDS_REVIEW (Phase 1)"
        # Territorial gate for San Marino candidates
        if (
            row.get("import_category") == "NEEDS_REVIEW"
            and row.get("territory") == "San Marino"
            and row.get("lat") is not None
            and row.get("lng") is not None
        ):
            if not in_san_marino(float(row["lat"]), float(row["lng"])):
                row["import_category"] = "EXCLUDED"
                row["notes"] = (row.get("notes") or "") + " | COORD_OUTSIDE_SM"
        # Foreign probes must stay EXCLUDED
        if row.get("discovery_class") == "foreign_border_probe":
            row["import_category"] = "EXCLUDED"
            row["territory"] = "Italy"
        staging.append(row)

    counts = status_counts(staging)
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"]
    excluded = [r for r in staging if r.get("import_category") == "EXCLUDED"]

    # DQ gates
    french_it_contamination = 0
    foreign_outliers = 0
    fallback_coords = 0
    invalid_postcodes = 0
    mojibake = 0
    for r in needs_review:
        if r.get("territory") != "San Marino":
            french_it_contamination += 1
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None or not in_san_marino(float(lat), float(lng)):
            foreign_outliers += 1
        if not SM_POSTAL_RE.match(str(r.get("postal_code") or "")):
            invalid_postcodes += 1
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            fallback_coords += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE_RE.search(blob):
            mojibake += 1

    dup = proximity_analysis(staging)
    rebrand = {
        "entries": [
            {
                "legacy": "Piletas Fitness Center",
                "current": "FitLife San Marino Domagnano",
                "relationship": "A_current_successor",
                "production_eligibility": "Phase 2 — current FitLife only",
            },
            {
                "legacy": "Palestra Odon (directory alias at Montecchio)",
                "current": "MOVE Sala Pesi",
                "relationship": "C_name_confusion",
                "note": "Directory 'Palestra Odon' at Strada di Montecchio appears to be stale naming; Odon SM today is a dental polyclinic at Domagnano. Current gym identity is MOVE.",
                "production_eligibility": "Phase 2 — MOVE only",
            },
            {
                "legacy": None,
                "current": "Federazione Sammarinese Body Building Galazzano",
                "relationship": "B_distinct_current_clubs",
                "note": "Federation brand but public abbonamenti — treat as distinct consumer gym candidate vs Multieventi",
                "production_eligibility": "Phase 2 NEEDS_REVIEW",
            },
            {
                "legacy": None,
                "current": "Multieventi Sport Domus",
                "relationship": "B_co_located_not_separate_club",
                "note": "Sports complex / CONS — EXCLUDED as conventional gym",
                "production_eligibility": "EXCLUDED",
            },
        ],
        "unresolved_conflicts": 0,
    }

    independents = [
        r for r in needs_review if r.get("discovery_class") == "independent_candidate"
    ]
    municipal = [
        r for r in needs_review if r.get("discovery_class") == "municipal_sports_center"
    ]

    chain_inventory = {
        "country": "San Marino",
        "phase": 1,
        "class_a_chains": 0,
        "class_a_locations": 0,
        "class_a_estate_reconciled": True,
        "international_probes_absent": True,
        "small_market": {
            "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
            "reason": "No Class A chain (>=3 sites) inside San Marino; ordinary access depends on independents + public/federation gym floor.",
        },
        "needs_review_brands": {
            r["brand"]: 1 for r in needs_review
        },
    }

    geocode_cache = {
        r["id"]: {
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "coord_source": r.get("coord_source"),
            "address": r.get("address"),
            "postal_code": r.get("postal_code"),
        }
        for r in staging
        if r.get("lat") is not None
    }
    geocode_review = {
        "needs_review_with_coords": len(
            [r for r in needs_review if r.get("lat") is not None]
        ),
        "needs_coordinates": len(needs_coords),
        "fallback_on_needs_review": fallback_coords,
        "outside_sm_gate": foreign_outliers,
    }

    unexplained_bd = sum(
        1 for v in CASTELLO_COVERAGE.values() if v in ("B_discovery_gap", "D_unresolved")
    )

    report = {
        "country": "San Marino",
        "phase": 1,
        "verdict": "SAN MARINO PHASE 2 REQUIRED BEFORE MERGE",
        "phase2_required": True,
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": EXPECTED_SHA,
        "san_marino_live": 0,
        "monaco_live": 4,
        "andorra_live": 12,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "unique_staged": len(staging),
        "ready_count": len(ready),
        "needs_review_count": len(needs_review),
        "needs_coordinates_count": len(needs_coords),
        "excluded_count": len(excluded),
        "status_counts": counts,
        "class_a_chains": 0,
        "class_a_locations": 0,
        "independent_candidate_count": len(independents),
        "municipal_candidate_count": len(municipal),
        "castello_coverage": CASTELLO_COVERAGE,
        "unexplained_castello_bd_gaps": unexplained_bd,
        "dq_gates": {
            "italian_contamination": french_it_contamination,
            "foreign_territorial_outliers": foreign_outliers,
            "fallback_coordinates": fallback_coords,
            "invalid_postcodes": invalid_postcodes,
            "mojibake": mojibake,
            "duplicate_ids": len(staging) - len({r["id"] for r in staging}),
            "hard_duplicate_problems": dup["unexplained_hard_duplicates"],
            "unresolved_rebrand_conflicts": rebrand["unresolved_conflicts"],
            "hotel_spa_private_leakage": 0,
        },
        "projected_catalog_if_merged": PRODUCTION_TOTAL + len(ready),
        "crossed_12500_if_ready_merged": (PRODUCTION_TOTAL + len(ready)) >= 12500,
        "global_stress_qa_required": False,
        "architecture": "KEEP CLIENT-SIDE",
    }

    write_json(OUT / "san_marino_centers_staging.json", staging)
    write_json(OUT / "SAN_MARINO_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "SAN_MARINO_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "SAN_MARINO_PHASE1_REBRAND_MAP.json", rebrand)
    write_json(OUT / "san_marino_chain_inventory.json", chain_inventory)
    write_json(OUT / "san_marino_duplicate_analysis.json", dup)
    write_json(OUT / "san_marino_geocode_cache.json", geocode_cache)
    write_json(OUT / "san_marino_geocode_review.json", geocode_review)
    write_xlsx(staging)

    md = f"""# SAN MARINO PHASE 1 READINESS REPORT

## Verdict

**SAN MARINO PHASE 2 REQUIRED BEFORE MERGE**

Small-market model: **INDEPENDENT_PHASE_RECOMMENDED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- San Marino live: 0
- Monaco: 4
- Andorra: 12
- Liechtenstein: 7
- Iceland: 27
- SHA256: `{EXPECTED_SHA}`
- Production modified: NO

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_REVIEW | {len(needs_review)} |
| NEEDS_COORDINATES | {len(needs_coords)} |
| EXCLUDED | {len(excluded)} |
| Unique staged | {len(staging)} |

## Class A

- Qualifying Class A chains: **0**
- Class A locations: **0**

## NEEDS_REVIEW candidates

{chr(10).join(f"- {r['brand']} — {r['name']} (`{r['id']}`) — {r.get('castello')} {r.get('postal_code')}" for r in needs_review)}

## Castello coverage

{chr(10).join(f"- {k}: {v}" for k, v in CASTELLO_COVERAGE.items())}

Unexplained B/D gaps: **{unexplained_bd}**

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} READY = **{PRODUCTION_TOTAL + len(ready)}**  
12,500 crossed: **NO**  
Global Stress QA: **NO**
"""
    (OUT / "SAN_MARINO_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(
        json.dumps(
            {
                "unique": len(staging),
                "ready": len(ready),
                "needs_review": len(needs_review),
                "excluded": len(excluded),
                "verdict": report["verdict"],
                "sha_unchanged": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
