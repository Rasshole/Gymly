#!/usr/bin/env python3
"""Liechtenstein Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    LI_POSTAL_RE,
    ROOT,
    classify_row,
    dedupe_by_id,
    format_li_postal,
    haversine,
    in_liechtenstein,
    make_id,
    norm_addr,
    nominatim_geocode,
    proximity_pairs,
    status_counts,
    write_json,
)

OUT = ROOT / "data/liechtenstein"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc"
PRODUCTION_TOTAL = 11692

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)

MAJOR_MUNICIPALITIES = [
    "Vaduz",
    "Schaan",
    "Triesen",
    "Balzers",
    "Eschen",
    "Mauren",
    "Triesenberg",
    "Ruggell",
    "Gamprin",
    "Schellenberg",
    "Planken",
    "Bendern",
    "Nendeln",
]

ZERO_CHAIN_CLASSIFICATION = {
    "Vaduz": "chain_present",
    "Schaan": "chain_present",
    "Eschen": "chain_present",
    "Balzers": "chain_present",
    "Bendern": "chain_present",
    "Nendeln": "independent_present_candidate",
    "Triesen": "A_legitimate_no_chain_presence",
    "Mauren": "A_legitimate_no_chain_presence",
    "Triesenberg": "A_legitimate_no_chain_presence",
    "Ruggell": "A_legitimate_no_chain_presence",
    "Gamprin": "chain_present",
    "Schellenberg": "A_legitimate_no_chain_presence",
    "Planken": "A_legitimate_no_chain_presence",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Liechtenstein_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "operator_class",
        "access_class",
        "coord_source",
        "territory",
        "discovery_class",
        "source_url",
        "notes",
    ]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Liechtenstein Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Liechtenstein_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)


def classify_proximity(prox: dict, ready: list[dict]) -> dict:
    by_id = {r["id"]: r for r in ready}

    def label(item: dict) -> str:
        a = by_id.get(item["a_id"], {})
        b = by_id.get(item["b_id"], {})
        if item.get("same_address"):
            return "B_co_located_not_separate_club"
        if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
            if item.get("distance_m", 999) <= 100:
                return "C_sports_complex_colocation"
            return "B_distinct_brands_nearby"
        return "C_review_not_duplicate"

    out = {}
    for bucket in ("identical", "lt25", "lt50", "lt100", "lt200"):
        out[bucket] = [{**it, "classification": label(it)} for it in prox.get(bucket, [])]
    return out


def proximity_diff_brand(rows: list[dict]) -> list[dict]:
    hits = []
    geo = [r for r in rows if r.get("lat") is not None]
    for i, a in enumerate(geo):
        for b in geo[i + 1 :]:
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            if d <= 100:
                hits.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "brand_a": a.get("brand"),
                        "brand_b": b.get("brand"),
                        "distance_m": round(d),
                        "classification": "C_sports_complex_colocation"
                        if d <= 100
                        else "B_distinct_brands_nearby",
                    }
                )
    return hits


def write_rebrand_map() -> None:
    write_json(
        OUT / "LIECHTENSTEIN_PHASE1_REBRAND_MAP.json",
        {
            "country": "Liechtenstein",
            "cases": [
                {
                    "id": "salutaris_lorez_schaan",
                    "classification": "A_current_successor",
                    "predecessor": "Salutaris Training Schaan",
                    "successor": "Lorez Gesundheitscenter Schaan",
                    "address": "Landstrasse 168, 9494 Schaan",
                    "status": "RESOLVED",
                    "notes": "Same premises; Salutaris CLOSED, Lorez current",
                },
                {
                    "id": "blugym_purfitness_schaan",
                    "classification": "A_current_successor",
                    "predecessor": "fitnesshaus by blugym Schaan",
                    "successor": "purfitness Schaan",
                    "address": "Im alten Riet 22, 9494 Schaan",
                    "status": "RESOLVED",
                    "notes": "March 2026 regional rebrand documented on purfitness.at",
                },
                {
                    "id": "lorez_bendern_colocation",
                    "classification": "B_co_located_not_separate_club",
                    "predecessor": "Lorez Health Training Bendern",
                    "successor": "Lorez Power Center Bendern",
                    "address": "Industriestrasse 16, 9487 Bendern",
                    "status": "RESOLVED",
                    "notes": "Same building; Power Center is 24h public import unit",
                },
            ],
            "unresolved_conflicts": 0,
        },
    )


def data_quality_report(ready: list[dict]) -> dict:
    dup_ids = [i for i, c in Counter(r["id"] for r in ready).items() if c > 1]
    invalid_post = [
        r["id"] for r in ready if not LI_POSTAL_RE.match(str(r.get("postal_code") or ""))
    ]
    missing = [
        r["id"]
        for r in ready
        if not (r.get("address") and r.get("city") and r.get("name") and r.get("brand"))
    ]
    invalid_coords = [
        r["id"]
        for r in ready
        if not (
            isinstance(r.get("lat"), (int, float))
            and isinstance(r.get("lng"), (int, float))
            and math.isfinite(r["lat"])
            and math.isfinite(r["lng"])
            and in_liechtenstein(float(r["lat"]), float(r["lng"]))
        )
    ]
    fallback = [r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))]
    foreign = [
        r["id"]
        for r in ready
        if r.get("lat") is not None and not in_liechtenstein(float(r["lat"]), float(r["lng"]))
    ]
    mojibake = [
        r["id"]
        for r in ready
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
    ]
    return {
        "duplicate_ids": dup_ids,
        "invalid_ready_postcodes": invalid_post,
        "missing_ready_fields": missing,
        "invalid_ready_coords": invalid_coords,
        "fallback_coords": fallback,
        "foreign_outliers": foreign,
        "mojibake": mojibake,
        "all_gates_pass": not any(
            [dup_ids, invalid_post, missing, invalid_coords, fallback, foreign, mojibake]
        ),
    }


def main() -> None:
    raw_bytes = CENTERS.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    centers = json.loads(raw_bytes)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "Liechtenstein") == 0
    assert sum(1 for c in centers if c.get("country") == "Iceland") == 27

    rows = json.loads((OUT / "liechtenstein_phase1_candidates.json").read_text())
    cache_path = OUT / "liechtenstein_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    for r in rows:
        pc = format_li_postal(r.get("postal_code") or "")
        if pc:
            r["postal_code"] = pc
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("import_category") in ("EXCLUDED", "DUPLICATE"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        q = ", ".join(
            x for x in [r["address"], r.get("postal_code"), r["city"], "Liechtenstein"] if x
        )
        hit = nominatim_geocode(q, "li", cache)
        if hit and hit.get("lat") is not None:
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_liechtenstein(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = r.get("coord_source") or "STRICT_ADDRESS_GEOCODE"

    write_json(cache_path, cache)

    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED", "CLOSED"):
            continue
        if r.get("import_category") == "NEEDS_REVIEW":
            continue
        cat = classify_row(
            r, postal_re=LI_POSTAL_RE, in_country=in_liechtenstein, format_postal=format_li_postal
        )
        r["import_category"] = cat

    # INDEPENDENT_PHASE_RECOMMENDED — no Class A ≥3 in LI; demote any READY
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT":
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + " | demoted: INDEPENDENT_PHASE_RECOMMENDED"

    rows = dedupe_by_id(rows)

    staging = rows
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]

    prox_ready = proximity_pairs(ready) if ready else {
        "identical": [],
        "lt25": [],
        "lt50": [],
        "lt100": [],
        "lt200": [],
    }
    prox_all = proximity_pairs(
        [r for r in staging if r.get("lat") is not None and r.get("import_category") not in ("EXCLUDED",)]
    )
    prox_classified = classify_proximity(prox_all, staging)
    diff_brand = proximity_diff_brand(staging)

    dq = data_quality_report(ready)
    statuses = status_counts(staging)

    write_json(OUT / "liechtenstein_centers_staging.json", staging)
    write_json(OUT / "LIECHTENSTEIN_PHASE1_READY_TO_IMPORT.json", ready)
    write_rebrand_map()

    inventory = {
        "country": "Liechtenstein",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "liechtenstein_live": 0,
        "class_a_chains": [],
        "class_a_open_estimate": 0,
        "subthreshold_operators": {
            "update Fitness": {"li_open": 1, "threshold": 3, "verdict": "UNDER_THRESHOLD_CLASS_E"},
            "LieFit": {"li_open": 2, "threshold": 3, "verdict": "UNDER_THRESHOLD_CLASS_E"},
            "Lorez": {
                "li_open": 2,
                "threshold": 3,
                "verdict": "UNDER_THRESHOLD_CLASS_E",
                "notes": "Health Training co-located with Power Center = 2 distinct premises",
            },
            "purfitness": {"li_open": 1, "threshold": 3, "verdict": "UNDER_THRESHOLD_CLASS_E"},
        },
        "independent_candidates": [
            {
                "id": r["id"],
                "brand": r["brand"],
                "name": r["name"],
                "city": r["city"],
            }
            for r in review
            if r.get("discovery_class") == "independent_candidate"
        ],
        "international_absent": [
            r["brand"] for r in staging if r.get("discovery_class") == "international_absent"
        ],
        "foreign_border_probes": [
            r["name"] for r in staging if r.get("discovery_class") == "foreign_border_probe"
        ],
        "small_market": {
            "qualifying_class_a_chains": 0,
            "approx_class_a_open_locations": 0,
            "independent_significance": "HIGH",
            "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
            "independent_candidate_count": len(
                [r for r in review if r.get("discovery_class") == "independent_candidate"]
            ),
            "reason": "No operator reaches ≥3 conventional public locations in Liechtenstein; ~8 independent sites required for meaningful national coverage",
        },
        "status_counts": statuses,
        "ready_total": len(ready),
    }
    write_json(OUT / "liechtenstein_chain_inventory.json", inventory)

    dup_out = {
        "proximity_ready": prox_classified,
        "proximity_all_brands": prox_all,
        "different_brand_lt100m": diff_brand,
        "dq": {k: len(v) if isinstance(v, list) else v for k, v in dq.items()},
        "dq_detail": dq,
    }
    write_json(OUT / "liechtenstein_duplicate_analysis.json", dup_out)
    write_json(OUT / "liechtenstein_geocode_review.json", {"geocoded_from_cache": len(cache)})

    projected = PRODUCTION_TOTAL + len(ready)
    phase2_reasons = [
        "Zero qualifying Class A chains with ≥3 conventional public locations in Liechtenstein",
        "update Fitness (1 LI site), LieFit (2), Lorez (2 premises), purfitness (1) all under Class A threshold in LI",
        "~8 conventional public independent candidates staged for Phase 2 eligibility review",
        "In Motion Eschen borderline physio+finess hybrid requires Phase 2 scope decision",
        "Small market (~40k pop) → INDEPENDENT_PHASE_RECOMMENDED",
    ]

    report = {
        "country": "Liechtenstein",
        "phase": 1,
        "verdict": "LIECHTENSTEIN PHASE 2 REQUIRED BEFORE MERGE",
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "liechtenstein_live": 0,
        "iceland_live": 27,
        "production_modified": False,
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": dict(Counter(r["brand"] for r in ready)),
        "independent_candidate_count": inventory["small_market"]["independent_candidate_count"],
        "class_a_chains": 0,
        "class_a_locations": 0,
        "phase2_required": True,
        "phase2_reasons": phase2_reasons,
        "dq_gates": {
            "duplicate_ids": len(dq["duplicate_ids"]),
            "invalid_postcodes": len(dq["invalid_ready_postcodes"]),
            "missing_addresses": len(dq["missing_ready_fields"]),
            "invalid_coordinates": len(dq["invalid_ready_coords"]),
            "fallback_coordinates": len(dq["fallback_coords"]),
            "foreign_territorial_outliers": len(dq["foreign_outliers"]),
            "mojibake": len(dq["mojibake"]),
            "unresolved_rebrand_conflicts": 0,
        },
        "territorial_safety": "CLEAN_FOR_READY",
        "ready_foreign_outliers": 0,
        "projected_catalog_if_merged": projected,
        "crossed_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_now": False,
        "architecture": "KEEP CLIENT-SIDE",
        "municipality_coverage": ZERO_CHAIN_CLASSIFICATION,
    }
    write_json(OUT / "LIECHTENSTEIN_PHASE1_READINESS_REPORT.json", report)

    md = f"""# LIECHTENSTEIN PHASE 1 READINESS REPORT

## Verdict

**LIECHTENSTEIN PHASE 2 REQUIRED BEFORE MERGE**

Small-market model: **INDEPENDENT_PHASE_RECOMMENDED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Iceland: 27 (unchanged)
- Liechtenstein live: 0
- SHA256: `{sha}`
- Production modified: NO

## Staging summary

| Status | Count |
|--------|------:|
| NEEDS_REVIEW (independent candidates) | {statuses.get('NEEDS_REVIEW', 0)} |
| EXCLUDED | {statuses.get('EXCLUDED', 0)} |
| CLOSED | {statuses.get('CLOSED', 0)} |
| DUPLICATE | {statuses.get('DUPLICATE', 0)} |
| READY_TO_IMPORT | {len(ready)} |

## Class A assessment

- Qualifying Class A chains (≥3 LI locations): **0**
- Class A open locations: **0**
- Independent candidates discovered: **{inventory['small_market']['independent_candidate_count']}**

## Phase 2 reasons

{chr(10).join('- ' + x for x in phase2_reasons)}

## Projected catalog

Current {PRODUCTION_TOTAL} + READY {len(ready)} = **{projected}**  
Crosses 12,500: **NO**

## Global scale

- Global Stress QA required: NO
- Architecture: KEEP CLIENT-SIDE
"""
    (OUT / "LIECHTENSTEIN_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    write_xlsx(staging)

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == EXPECTED_SHA, sha_after

    print("READY:", len(ready), "NEEDS_REVIEW:", statuses.get("NEEDS_REVIEW", 0))
    print("Staged:", len(staging), "Verdict:", report["verdict"])
    print("SHA unchanged:", sha_after[:16] + "...")


if __name__ == "__main__":
    main()
