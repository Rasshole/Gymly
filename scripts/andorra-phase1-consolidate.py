#!/usr/bin/env python3
"""Andorra Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    AD_POSTAL_RE,
    ROOT,
    classify_row,
    dedupe_by_id,
    format_ad_postal,
    haversine,
    in_andorra,
    nominatim_geocode,
    proximity_pairs,
    status_counts,
    write_json,
)

OUT = ROOT / "data/andorra"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc"
PRODUCTION_TOTAL = 11699

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)

PARISH_COVERAGE = {
    "Andorra la Vella": "independent_present_candidate",
    "Escaldes-Engordany": "independent_present_candidate",
    "La Massana": "chain_present",
    "Canillo": "chain_present",
    "Ordino": "independent_present_candidate",
    "Encamp": "independent_present_candidate",
    "Sant Julià de Lòria": "independent_present_candidate",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Andorra_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "parish",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "discovery_class",
        "operator_class",
        "eligibility_candidate",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Andorra"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        # CSV fallback
        import csv

        csv_path = OUT / "Gymly_Andorra_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def classify_proximity(prox: dict, staging: list[dict]) -> dict:
    by_id = {r["id"]: r for r in staging}
    out = {k: [] for k in prox}
    for bucket, pairs in prox.items():
        for p in pairs:
            a, b = by_id.get(p["a"]), by_id.get(p["b"])
            if not a or not b:
                continue
            classification = "B_distinct_current_clubs"
            if a.get("brand") == b.get("brand"):
                classification = "investigate_same_brand_proximity"
            out[bucket].append({**p, "classification": classification})
    return out


def proximity_diff_brand(staging: list[dict]) -> list[dict]:
    live = [
        r
        for r in staging
        if r.get("lat") is not None
        and r.get("import_category") not in ("EXCLUDED", "CLOSED", "DUPLICATE")
    ]
    hits = []
    for i, a in enumerate(live):
        for b in live[i + 1 :]:
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d <= 200:
                hits.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "brand_a": a.get("brand"),
                        "brand_b": b.get("brand"),
                        "distance_m": round(d),
                        "classification": "B_distinct_brands_nearby_dense_valley",
                    }
                )
    return hits


def write_rebrand_map() -> None:
    write_json(
        OUT / "ANDORRA_PHASE1_REBRAND_MAP.json",
        {
            "country": "Andorra",
            "cases": [
                {
                    "id": "urban_anyospark_group",
                    "classification": "B_distinct_current_clubs",
                    "operator": "Urban Gym / AnyósPark",
                    "locations": [
                        "AnyósPark Club La Massana",
                        "Urban Gym Andorra la Vella",
                        "Urban Gym Canillo",
                        "Urban Gym Arinsal (seasonal)",
                    ],
                    "status": "RESOLVED",
                    "notes": "Same operator group; distinct physical centres; Arinsal seasonal Dec–Apr",
                },
                {
                    "id": "caldea_club_vs_thermal",
                    "classification": "C_name_confusion",
                    "identity": "Club Caldea",
                    "status": "RESOLVED",
                    "notes": "Thermal spa club with gym amenity — EXCLUDED Class C; not a conventional Gymly import unit",
                },
            ],
            "unresolved_conflicts": 0,
        },
    )


def data_quality_report(ready: list[dict], review: list[dict] | None = None) -> dict:
    target = ready if ready else (review or [])

    def scan(rows: list[dict]) -> dict:
        dup_ids = [i for i, c in Counter(r["id"] for r in rows).items() if c > 1]
        invalid_post = [
            r["id"]
            for r in rows
            if r.get("postal_code") and not AD_POSTAL_RE.match(str(r.get("postal_code") or ""))
        ]
        missing = [
            r["id"]
            for r in rows
            if not (r.get("address") and r.get("city") and r.get("name") and r.get("brand"))
        ]
        invalid_coords = [
            r["id"]
            for r in rows
            if r.get("lat") is not None
            and not (
                isinstance(r.get("lat"), (int, float))
                and isinstance(r.get("lng"), (int, float))
                and math.isfinite(r["lat"])
                and math.isfinite(r["lng"])
                and in_andorra(float(r["lat"]), float(r["lng"]))
            )
        ]
        fallback = [
            r["id"] for r in rows if FALLBACK_RE.search(str(r.get("coord_source") or ""))
        ]
        foreign = [
            r["id"]
            for r in rows
            if r.get("lat") is not None and not in_andorra(float(r["lat"]), float(r["lng"]))
        ]
        spanish = [
            r["id"]
            for r in rows
            if r.get("territory") == "Spain"
            or (
                r.get("lat") is not None
                and float(r["lat"]) < 42.43
                and r.get("import_category") != "EXCLUDED"
            )
        ]
        french = [
            r["id"]
            for r in rows
            if r.get("territory") == "France"
            or (
                r.get("lat") is not None
                and float(r["lng"]) >= 1.76
                and float(r["lat"]) >= 42.55
                and r.get("import_category") != "EXCLUDED"
            )
        ]
        mojibake = [
            r["id"]
            for r in rows
            if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
        ]
        return {
            "duplicate_ids": dup_ids,
            "invalid_ready_postcodes": invalid_post,
            "missing_ready_fields": missing,
            "invalid_ready_coords": invalid_coords,
            "fallback_coords": fallback,
            "foreign_outliers": foreign,
            "spanish_contamination": spanish,
            "french_contamination": french,
            "mojibake": mojibake,
            "all_gates_pass": not any(
                [
                    dup_ids,
                    invalid_post,
                    missing,
                    invalid_coords,
                    fallback,
                    foreign,
                    spanish,
                    french,
                    mojibake,
                ]
            ),
        }

    return scan(target)


def main() -> None:
    raw_bytes = CENTERS.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    centers = json.loads(raw_bytes)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "Andorra") == 0
    assert sum(1 for c in centers if c.get("country") == "Liechtenstein") == 7
    assert sum(1 for c in centers if c.get("country") == "Iceland") == 27

    rows = json.loads((OUT / "andorra_phase1_candidates.json").read_text())
    cache_path = OUT / "andorra_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    for r in rows:
        pc = format_ad_postal(r.get("postal_code") or "")
        if pc:
            r["postal_code"] = pc
        if r.get("lat") is not None and r.get("lng") is not None:
            # validate existing coords
            if not in_andorra(float(r["lat"]), float(r["lng"])) and r.get(
                "discovery_class"
            ) not in ("foreign_border_probe", "international_absent"):
                r["notes"] = (r.get("notes") or "") + " | COORD_OUTSIDE_AD_BOX"
            continue
        if r.get("is_closed") or r.get("import_category") in ("EXCLUDED", "DUPLICATE"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        q = ", ".join(
            x for x in [r["address"], r.get("postal_code"), r["city"], "Andorra"] if x
        )
        hit = nominatim_geocode(q, "ad", cache)
        if hit and hit.get("lat") is not None:
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_andorra(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = r.get("coord_source") or "STRICT_ADDRESS_GEOCODE"

    write_json(cache_path, cache)

    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED", "CLOSED", "COMING_SOON"):
            continue
        if r.get("import_category") == "NEEDS_REVIEW":
            continue
        cat = classify_row(
            r, postal_re=AD_POSTAL_RE, in_country=in_andorra, format_postal=format_ad_postal
        )
        r["import_category"] = cat

    # INDEPENDENT_PHASE_RECOMMENDED — demote any READY
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT":
            r["import_category"] = "NEEDS_REVIEW"
            r["eligibility_candidate"] = r.get("eligibility_candidate") or "SMALL_MARKET_INDEPENDENT"
            r["notes"] = (r.get("notes") or "") + " | demoted: INDEPENDENT_PHASE_RECOMMENDED"

    rows = dedupe_by_id(rows)

    staging = rows
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    independents = [r for r in review if r.get("discovery_class") == "independent_candidate"]
    municipal = [r for r in review if r.get("discovery_class") == "municipal_sports_center"]

    prox_ready = (
        proximity_pairs(ready)
        if ready
        else {"identical": [], "lt25": [], "lt50": [], "lt100": [], "lt200": []}
    )
    prox_all = proximity_pairs(
        [
            r
            for r in staging
            if r.get("lat") is not None and r.get("import_category") not in ("EXCLUDED",)
        ]
    )
    prox_classified = classify_proximity(prox_all, staging)
    diff_brand = proximity_diff_brand(staging)

    dq = data_quality_report(ready, review)
    statuses = status_counts(staging)

    write_json(OUT / "andorra_centers_staging.json", staging)
    write_json(OUT / "ANDORRA_PHASE1_READY_TO_IMPORT.json", ready)
    write_rebrand_map()

    inventory = {
        "country": "Andorra",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "andorra_live": 0,
        "liechtenstein_live": 7,
        "class_a_chains": [
            {
                "operator": "Urban Gym / AnyósPark",
                "year_round_open": 3,
                "seasonal": 1,
                "threshold": 3,
                "meets_threshold": True,
                "phase1_ready": 0,
                "verdict": "POTENTIAL_CLASS_A_BUT_HELD_FOR_INDEPENDENT_PHASE",
                "notes": "AnyósPark + UrbanGym ALV + Urban Gym Canillo year-round; Arinsal seasonal",
            }
        ],
        "class_a_open_estimate": 3,
        "subthreshold_operators": {
            "Duplex Sport Club": {"ad_open": 1, "threshold": 3, "verdict": "UNDER_THRESHOLD_CLASS_E"},
            "NEXT Sports Club": {"ad_open": 1, "threshold": 3, "verdict": "UNDER_THRESHOLD_CLASS_E"},
            "Princiesport": {
                "ad_open": 1,
                "threshold": 3,
                "verdict": "UNDER_THRESHOLD_CLASS_E_OR_C",
                "notes": "Racket club with gym floor — Phase 2 scope",
            },
        },
        "independent_candidates": [
            {
                "id": r["id"],
                "brand": r["brand"],
                "name": r["name"],
                "city": r["city"],
                "parish": r.get("parish"),
                "postal_code": r.get("postal_code"),
                "status": r.get("import_category"),
                "eligibility_candidate": r.get("eligibility_candidate"),
            }
            for r in independents
        ],
        "municipal_candidates": [
            {
                "id": r["id"],
                "brand": r["brand"],
                "name": r["name"],
                "city": r["city"],
                "parish": r.get("parish"),
            }
            for r in municipal
        ],
        "international_absent": [
            r["brand"] for r in staging if r.get("discovery_class") == "international_absent"
        ],
        "foreign_border_probes": [
            r["name"] for r in staging if r.get("discovery_class") == "foreign_border_probe"
        ],
        "small_market": {
            "qualifying_class_a_chains": 1,
            "approx_class_a_open_locations": 3,
            "independent_significance": "HIGH",
            "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
            "independent_candidate_count": len(independents),
            "municipal_candidate_count": len(municipal),
            "reason": (
                "Urban/AnyósPark reaches ≥3 year-round sites but independents (Duplex, NEXT) "
                "and municipal centres are essential for meaningful national coverage in this micro-state"
            ),
        },
        "status_counts": statuses,
        "ready_total": len(ready),
        "parish_coverage": PARISH_COVERAGE,
    }
    write_json(OUT / "andorra_chain_inventory.json", inventory)

    dup_out = {
        "proximity_ready": prox_classified,
        "proximity_all_brands": prox_all,
        "different_brand_lte_200m": diff_brand,
        "dq": {k: len(v) if isinstance(v, list) else v for k, v in dq.items()},
        "dq_detail": dq,
        "note": "Andorra valleys are dense — proximity alone is not duplication",
    }
    write_json(OUT / "andorra_duplicate_analysis.json", dup_out)
    write_json(
        OUT / "andorra_geocode_review.json",
        {
            "geocoded_from_cache": len(cache),
            "rows_with_coords": sum(1 for r in staging if r.get("lat") is not None),
            "needs_review_missing_coords": [
                r["id"]
                for r in review
                if r.get("lat") is None
            ],
        },
    )

    projected = PRODUCTION_TOTAL + len(ready)
    phase2_reasons = [
        "Urban Gym / AnyósPark reaches ≥3 year-round conventional sites but alone does not represent how Andorrans access gyms nationwide",
        "Duplex Sport Club and NEXT Sports Club are essential central commercial independents",
        "Municipal/comú sports centres dominate Ordino, Encamp, Pas de la Casa, Sant Julià and part of ALV/Escaldes — Phase 2 scope gate required",
        "Princiesport racket club with substantial gym floor needs Phase 2 Class C vs conventional decision",
        "Urban Gym Arinsal is seasonal (Dec–Apr) — not a year-round Class A unit",
        "Micro-state geography + border ES/FR contamination risk → INDEPENDENT_PHASE_RECOMMENDED",
    ]

    report = {
        "country": "Andorra",
        "phase": 1,
        "verdict": "ANDORRA PHASE 2 REQUIRED BEFORE MERGE",
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "andorra_live": 0,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "cyprus_live": 17,
        "production_modified": False,
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": dict(Counter(r["brand"] for r in ready)),
        "independent_candidate_count": len(independents),
        "municipal_candidate_count": len(municipal),
        "class_a_chains": 1,
        "class_a_locations": 3,
        "class_a_seasonal_extra": 1,
        "phase2_required": True,
        "phase2_reasons": phase2_reasons,
        "dq_gates": {
            "duplicate_ids": len(dq["duplicate_ids"]),
            "invalid_postcodes": len(dq["invalid_ready_postcodes"]),
            "missing_addresses": len(dq["missing_ready_fields"]),
            "invalid_coordinates": len(dq["invalid_ready_coords"]),
            "fallback_coordinates": len(dq["fallback_coords"]),
            "foreign_territorial_outliers": len(dq["foreign_outliers"]),
            "spanish_contamination": len(dq["spanish_contamination"]),
            "french_contamination": len(dq["french_contamination"]),
            "mojibake": len(dq["mojibake"]),
            "unresolved_rebrand_conflicts": 0,
        },
        "territorial_safety": "CLEAN_FOR_READY",
        "ready_foreign_outliers": 0,
        "ready_spanish_outliers": 0,
        "ready_french_outliers": 0,
        "projected_catalog_if_merged": projected,
        "crossed_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_now": False,
        "architecture": "KEEP CLIENT-SIDE",
        "parish_coverage": PARISH_COVERAGE,
        "unique_staged": len(staging),
    }
    write_json(OUT / "ANDORRA_PHASE1_READINESS_REPORT.json", report)

    md = f"""# ANDORRA PHASE 1 READINESS REPORT

## Verdict

**ANDORRA PHASE 2 REQUIRED BEFORE MERGE**

Small-market model: **INDEPENDENT_PHASE_RECOMMENDED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Liechtenstein: 7 (unchanged)
- Iceland: 27 (unchanged)
- Andorra live: 0
- SHA256: `{sha}`
- Production modified: NO

## Staging summary

| Status | Count |
|--------|------:|
| NEEDS_REVIEW | {statuses.get('NEEDS_REVIEW', 0)} |
| EXCLUDED | {statuses.get('EXCLUDED', 0)} |
| CLOSED | {statuses.get('CLOSED', 0)} |
| COMING_SOON | {statuses.get('COMING_SOON', 0)} |
| READY_TO_IMPORT | {len(ready)} |
| Unique staged | {len(staging)} |

Independent commercial candidates: **{len(independents)}**  
Municipal/comú candidates: **{len(municipal)}**

## Class A assessment

- Qualifying Class A chains (≥3 AD year-round locations): **1** (Urban Gym / AnyósPark)
- Class A year-round locations: **3** (+1 seasonal Arinsal)
- Phase 1 READY Class A locations: **0** (held for independent-phase model)
- Independent significance: **HIGH**

## Phase 2 reasons

{chr(10).join('- ' + x for x in phase2_reasons)}

## Projected catalog

Current {PRODUCTION_TOTAL} + READY {len(ready)} = **{projected}**  
Crosses 12,500: **NO**

## Global scale

- Global Stress QA required: NO
- Architecture: KEEP CLIENT-SIDE
"""
    (OUT / "ANDORRA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    write_xlsx(staging)

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == EXPECTED_SHA, sha_after

    print("READY:", len(ready), "NEEDS_REVIEW:", statuses.get("NEEDS_REVIEW", 0))
    print("Staged:", len(staging), "Verdict:", report["verdict"])
    print("SHA unchanged:", sha_after[:16] + "...")


if __name__ == "__main__":
    main()
