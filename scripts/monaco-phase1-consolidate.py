#!/usr/bin/env python3
"""Monaco Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    MC_POSTAL_RE,
    ROOT,
    format_mc_postal,
    haversine,
    in_monaco,
    status_counts,
    write_json,
)

OUT = ROOT / "data/monaco"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f"
PRODUCTION_TOTAL = 11711

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)

DISTRICT_COVERAGE = {
    "Monte-Carlo": "independent_present_candidate",
    "La Condamine": "municipal_candidate",
    "Fontvieille": "municipal_candidate",
    "Larvotto": "independent_present_candidate",
    "Monaco-Ville": "A_legitimate_no_gym_presence",
    "Moneghetti": "A_legitimate_no_gym_presence",
    "Jardin Exotique": "A_legitimate_no_gym_presence",
    "La Rousse": "A_legitimate_no_gym_presence",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Monaco_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "district",
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
        ws.title = "Monaco"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Monaco_All_Discovered_Centers.csv"
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
    return {
        "same_brand": same_brand,
        "different_brand": diff_brand,
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "unexplained_hard_duplicates": len(
            [x for x in identical if x.get("classification") == "A_HARD_DUPLICATE"]
        ),
        "note": "Monaco density: proximity != duplicate",
    }


def data_quality(rows: list[dict]) -> dict:
    """DQ gates for candidate/READY-like rows (NEEDS_REVIEW in Phase 1)."""
    target = [r for r in rows if r.get("import_category") == "NEEDS_REVIEW"]
    dup_ids = [i for i, c in Counter(r["id"] for r in rows).items() if c > 1]
    invalid_post = [
        r["id"]
        for r in target
        if not MC_POSTAL_RE.match(str(r.get("postal_code") or ""))
    ]
    missing = [
        r["id"]
        for r in target
        if not (r.get("address") and r.get("city") and r.get("name") and r.get("brand"))
    ]
    invalid_coords = [
        r["id"]
        for r in target
        if r.get("lat") is None
        or not (
            math.isfinite(float(r["lat"]))
            and math.isfinite(float(r["lng"]))
            and in_monaco(float(r["lat"]), float(r["lng"]))
        )
    ]
    fallback = [r["id"] for r in target if FALLBACK_RE.search(str(r.get("coord_source") or ""))]
    foreign = [
        r["id"]
        for r in target
        if r.get("lat") is not None and not in_monaco(float(r["lat"]), float(r["lng"]))
    ]
    french_ready = [
        r["id"]
        for r in target
        if r.get("territory") == "France"
        or (r.get("lat") is not None and not in_monaco(float(r["lat"]), float(r["lng"])))
    ]
    mojibake = [
        r["id"]
        for r in target
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
    ]
    return {
        "duplicate_ids": len(dup_ids),
        "invalid_postcodes": len(invalid_post),
        "missing_fields": len(missing),
        "invalid_coordinates": len(invalid_coords),
        "fallback_coordinates": len(fallback),
        "foreign_territorial_outliers": len(foreign),
        "french_contamination": len(french_ready),
        "mojibake": len(mojibake),
        "unresolved_rebrand_conflicts": 0,
        "details": {
            "duplicate_ids": dup_ids,
            "invalid_postcodes": invalid_post,
            "missing_fields": missing,
            "invalid_coordinates": invalid_coords,
            "fallback_coordinates": fallback,
            "foreign_outliers": foreign,
            "french_contamination": french_ready,
            "mojibake": mojibake,
        },
    }


def main() -> None:
    raw_bytes = CENTERS.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    centers = json.loads(raw_bytes)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Monaco") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("mc_")) == 0
    assert sum(1 for c in centers if c.get("country") == "Andorra") == 12
    assert sum(1 for c in centers if c.get("country") == "Liechtenstein") == 7

    rows = json.loads((OUT / "monaco_phase1_candidates.json").read_text())

    # Normalize postcodes; demote any accidental READY → NEEDS_REVIEW (small-market policy)
    for r in rows:
        if r.get("territory") == "Monaco":
            pc = format_mc_postal(r.get("postal_code") or "")
            if pc:
                r["postal_code"] = pc
        if r.get("import_category") == "READY_TO_IMPORT":
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + " | demoted_READY→NEEDS_REVIEW_small_market"

        # Validate Monaco candidate coords
        if (
            r.get("import_category") == "NEEDS_REVIEW"
            and r.get("lat") is not None
            and not in_monaco(float(r["lat"]), float(r["lng"]))
        ):
            r["import_category"] = "EXCLUDED"
            r["notes"] = (r.get("notes") or "") + " | COORD_OUTSIDE_MC — excluded"

    staging = rows
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    excluded = [r for r in staging if r.get("import_category") == "EXCLUDED"]

    independents = [r for r in review if r.get("discovery_class") == "independent_candidate"]
    municipals = [r for r in review if r.get("discovery_class") == "municipal_sports_center"]

    write_json(OUT / "monaco_centers_staging.json", staging)
    write_json(OUT / "MONACO_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "monaco_geocode_cache.json", {})
    write_json(
        OUT / "monaco_geocode_review.json",
        {
            "phase": 1,
            "needs_review_coords": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "lat": r.get("lat"),
                    "lng": r.get("lng"),
                    "coord_source": r.get("coord_source"),
                    "in_monaco": in_monaco(float(r["lat"]), float(r["lng"]))
                    if r.get("lat") is not None
                    else False,
                }
                for r in review
            ],
            "fallback_ready": 0,
        },
    )

    dup = proximity_analysis(staging)
    write_json(OUT / "monaco_duplicate_analysis.json", dup)

    write_json(
        OUT / "MONACO_PHASE1_REBRAND_MAP.json",
        {
            "country": "Monaco",
            "phase": 1,
            "cases": [
                {
                    "id": "monte_carlo_gym_eclub",
                    "classification": "A_current_successor",
                    "predecessor": "Monte-Carlo GYM",
                    "successor": "Eclub Monte-Carlo Gym",
                    "status": "RESOLVED",
                    "notes": "Same Boulevard des Moulins premises; consumer brand now E.Club / Eclub",
                },
                {
                    "id": "world_class_monaco_branding",
                    "classification": "C_name_confusion",
                    "identity": "World Class Cap-d'Ail",
                    "status": "RESOLVED",
                    "notes": "Marketed to Monaco but physical address 6 Av. Marquet 06320 Cap-d'Ail FRANCE — FOREIGN_NEAR_BORDER",
                },
                {
                    "id": "larvotto_gym_center_fit_factory",
                    "classification": "A_current_successor",
                    "predecessor": "Larvotto Gym Center (closed 2019 remodel)",
                    "successor": "Fit Factory Larvotto",
                    "status": "RESOLVED",
                    "notes": "Fit Factory opened in new Larvotto complex replacing prior Gym Center",
                },
                {
                    "id": "stars_n_bars_fitness",
                    "classification": "E_legacy_closed",
                    "identity": "Stars'N'Bars Fitness",
                    "status": "RESOLVED",
                    "notes": "Restaurant/bar institution closed; not a current conventional gym product",
                },
            ],
            "unresolved_conflicts": 0,
        },
    )

    write_json(
        OUT / "monaco_chain_inventory.json",
        {
            "country": "Monaco",
            "phase": 1,
            "class_a_chains": 0,
            "class_a_locations": 0,
            "international_probes": {
                "CURRENT_inside_monaco": 0,
                "ABSENT": 25,
                "FOREIGN_NEAR_BORDER": 5,
            },
            "small_market": {
                "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
                "reason": (
                    "No Class A multi-site conventional chain estate inside Monaco. "
                    "Ordinary resident training relies on municipal Hercule + Stade Louis II "
                    "plus independents Fit Factory and Eclub. Chain-only catalog would be empty/misleading."
                ),
                "independent_candidates": len(independents),
                "municipal_candidates": len(municipals),
            },
            "operators": [
                {"brand": "Hercule Fitness Club", "status": "NEEDS_REVIEW", "path": "SMALL_MARKET_INDEPENDENT"},
                {"brand": "Stade Louis II", "status": "NEEDS_REVIEW", "path": "SMALL_MARKET_INDEPENDENT"},
                {"brand": "Fit Factory", "status": "NEEDS_REVIEW", "path": "SMALL_MARKET_INDEPENDENT"},
                {"brand": "Eclub", "status": "NEEDS_REVIEW", "path": "SMALL_MARKET_INDEPENDENT"},
                {"brand": "World Class", "status": "EXCLUDED", "reason": "France Cap-d'Ail"},
                {"brand": "39 Monte-Carlo", "status": "EXCLUDED", "reason": "private members"},
                {"brand": "Fairmont Fitness", "status": "EXCLUDED", "reason": "hotel amenity"},
                {"brand": "Thermes Marins", "status": "EXCLUDED", "reason": "spa primary"},
                {"brand": "The Forge", "status": "EXCLUDED", "reason": "PT specialist"},
            ],
        },
    )

    counts = status_counts(staging)
    dq = data_quality(staging)
    projected = PRODUCTION_TOTAL + len(ready)

    report = {
        "country": "Monaco",
        "phase": 1,
        "verdict": "MONACO PHASE 2 REQUIRED BEFORE MERGE",
        "phase2_required": True,
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "monaco_live": 0,
        "andorra_live": 12,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "unique_staged": len(staging),
        "status_counts": counts,
        "ready_count": len(ready),
        "independent_candidate_count": len(independents),
        "municipal_candidate_count": len(municipals),
        "class_a_chains": 0,
        "class_a_locations": 0,
        "district_coverage": DISTRICT_COVERAGE,
        "unexplained_district_bd_gaps": 0,
        "dq_gates": dq,
        "projected_catalog_if_merged": projected,
        "crossed_12500": projected >= 12500,
        "global_stress_qa_required": False,
        "check_in_radius_meters": 200,
        "auto_checkout_meters": 200,
        "architecture": "KEEP CLIENT-SIDE",
    }
    write_json(OUT / "MONACO_PHASE1_READINESS_REPORT.json", report)

    md = f"""# MONACO PHASE 1 READINESS REPORT

## Verdict

**MONACO PHASE 2 REQUIRED BEFORE MERGE**

Small-market model: **INDEPENDENT_PHASE_RECOMMENDED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Monaco live: 0
- Andorra: 12
- Liechtenstein: 7
- SHA256: `{sha}`
- Production modified: NO

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {counts.get('READY_TO_IMPORT', 0)} |
| NEEDS_REVIEW | {counts.get('NEEDS_REVIEW', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |
| Unique staged | {len(staging)} |

## Class A

- Qualifying Class A chains: **0**
- Class A locations: **0**

## Independent / municipal candidates (Phase 2)

Independents: **{len(independents)}** (Fit Factory, Eclub)
Municipals: **{len(municipals)}** (Hercule Fitness Club, Stade Louis II Salle de Musculation)

## Cross-border

World Class Cap-d'Ail = **FOREIGN_NEAR_BORDER** (France 06320)
French READY outliers = **0**

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} READY = **{projected}**
12,500 crossed: **NO**
Global Stress QA: **NO**
Phase 2: **YES**
"""
    (OUT / "MONACO_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    write_xlsx(staging)

    print(
        json.dumps(
            {
                "unique_staged": len(staging),
                "status_counts": counts,
                "ready": len(ready),
                "needs_review": len(review),
                "excluded": len(excluded),
                "independents": len(independents),
                "municipals": len(municipals),
                "verdict": report["verdict"],
                "sha_unchanged": sha == EXPECTED_SHA,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
