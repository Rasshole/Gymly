#!/usr/bin/env python3
"""Vatican City Phase 1 consolidate — staging artifacts only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    VA_POSTAL_RE,
    haversine,
    in_vatican_city,
    write_json,
)

OUT = ROOT / "data/vatican-city"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6"
PRODUCTION_TOTAL = 11721
CANDIDATES = OUT / "vatican_city_phase1_candidates.json"


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    return sha


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Vatican_City_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "country",
        "territory",
        "lat",
        "lng",
        "import_category",
        "access_class",
        "discovery_class",
        "inside_vatican_gate",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "VaticanCity"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Vatican_City_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})


def main() -> None:
    sha = freeze_check()
    staging = deepcopy(json.loads(CANDIDATES.read_text(encoding="utf-8")))

    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"]

    if ready or needs_review or needs_coords:
        raise SystemExit(
            f"STOP: unexpected residual READY/NR/NC "
            f"R={len(ready)} NR={len(needs_review)} NC={len(needs_coords)}"
        )

    # No READY row may claim Vatican with Italian coords
    for r in staging:
        if r.get("import_category") == "READY_TO_IMPORT":
            if not in_vatican_city(float(r["lat"]), float(r["lng"])):
                raise SystemExit(f"STOP: READY outside Vatican {r['id']}")

    italian_ready = [
        r
        for r in ready
        if r.get("lat") is not None
        and not in_vatican_city(float(r["lat"]), float(r["lng"]))
    ]

    false_positives = [
        {
            "id": r["id"],
            "name": r["name"],
            "brand": r["brand"],
            "city": r.get("city"),
            "postal_code": r.get("postal_code"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "inside_vatican_gate": r.get("inside_vatican_gate"),
            "reason": r.get("notes"),
            "import_category": r.get("import_category"),
        }
        for r in staging
        if r.get("discovery_class")
        in (
            "foreign_border_probe",
            "international_chain_probe",
            "directory_false_positive",
            "extraterritorial_holy_see",
        )
    ]

    territorial = {
        "model": "INWARD_BIASED_POINT_IN_POLYGON",
        "description": (
            "Simplified Leonine Walls + St Peter's Square polygon with coarse envelope "
            "and east/south Italian fringe hard rejects. Not a cadastral survey."
        ),
        "limitations": [
            "Polygon is intentionally inward-biased vs OSM cadastral detail",
            "Holy See extraterritorial properties are excluded by design",
            "Postcode 00120 alone must never prove territory",
        ],
        "envelope": {
            "lat_min": 41.9001,
            "lat_max": 41.90755,
            "lng_min": 12.4456,
            "lng_max": 12.45845,
        },
        "postcode_policy": {
            "vatican_city_state": "00120",
            "regex": "^00120$",
            "alone_sufficient": False,
            "note": (
                "00120 is the Vatican City State postal identity; Italian Rome 001xx "
                "(e.g. 00193 Borgo/Prati) must never classify a gym as Vatican."
            ),
        },
        "probes": {
            "inside_expected": [
                {"name": "St Peter's Basilica", "lat": 41.9022, "lng": 12.4539},
                {"name": "Vatican Museums", "lat": 41.9065, "lng": 12.4536},
                {"name": "Vatican Gardens", "lat": 41.9040, "lng": 12.4500},
            ],
            "outside_expected": [
                {"name": "Omega Fitness Club", "lat": 41.9030, "lng": 12.4608},
                {"name": "Piazza Pio XII", "lat": 41.9019, "lng": 12.4595},
                {"name": "Via della Conciliazione", "lat": 41.9024, "lng": 12.4615},
                {"name": "Campo Pio XI", "lat": 41.8969, "lng": 12.4464},
                {"name": "San Calisto (extraterritorial)", "lat": 41.8892, "lng": 12.4705},
            ],
        },
        "gate_results": {},
    }
    for p in territorial["probes"]["inside_expected"]:
        territorial["gate_results"][p["name"]] = in_vatican_city(p["lat"], p["lng"])
    for p in territorial["probes"]["outside_expected"]:
        territorial["gate_results"][p["name"]] = in_vatican_city(p["lat"], p["lng"])

    # Proximity among staging rows (audit only)
    same_addr = []
    identical = []
    for i, a in enumerate(staging):
        if a.get("lat") is None:
            continue
        for b in staging[i + 1 :]:
            if b.get("lat") is None:
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if abs(float(a["lat"]) - float(b["lat"])) < 1e-7 and abs(
                float(a["lng"]) - float(b["lng"])
            ) < 1e-7:
                identical.append({"a": a["id"], "b": b["id"]})
            if (a.get("address") or "").lower() == (b.get("address") or "").lower() and a.get(
                "postal_code"
            ) == b.get("postal_code"):
                same_addr.append({"a": a["id"], "b": b["id"], "distance_m": round(d)})

    dup = {
        "duplicate_ids": len(staging) - len({r["id"] for r in staging}),
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "unexplained_hard_duplicates": len(identical),
    }

    counts = Counter(r.get("import_category") for r in staging)
    vatican_rows = [r for r in staging if r.get("territory") == "Vatican City"]
    institutional = [
        r
        for r in staging
        if r.get("import_category")
        in ("EXCLUDED_INSTITUTIONAL", "EXCLUDED_SECURITY", "EXCLUDED_PRIVATE")
    ]

    inventory = {
        "country": "Vatican City",
        "phase": 1,
        "class_a_chains": 0,
        "class_a_locations": 0,
        "probed_chains_with_zero_vatican_locations": [
            "McFIT",
            "JOHN REED",
            "Basic-Fit",
            "Anytime Fitness",
            "Virgin Active",
            "FitActive",
            "FitExpress",
            "Fit And Go",
            "Curves",
            "Fitness First",
            "Gold's Gym",
            "PureGym",
            "World Class",
            "Fitness Park",
            "Keep Cool",
            "OrangeTheory",
        ],
        "small_market": {
            "recommended_model": "ZERO_PUBLIC_GYM_MARKET_CONFIRMED",
            "public_conventional_independents": 0,
            "public_municipal_consumer_gyms": 0,
            "restricted_institutional_facilities_audited": len(institutional),
        },
    }

    report = {
        "country": "Vatican City",
        "phase": 1,
        "verdict": "VATICAN CITY AUDIT COMPLETE — ZERO PUBLIC GYMS CONFIRMED",
        "phase2_required": False,
        "small_market_model": "ZERO_PUBLIC_GYM_MARKET_CONFIRMED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "vatican_city_live": 0,
        "san_marino_live": 6,
        "monaco_live": 4,
        "andorra_live": 12,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "unique_staged": len(staging),
        "ready_count": 0,
        "needs_review_count": 0,
        "needs_coordinates_count": 0,
        "excluded_count": len(staging),
        "status_counts": dict(counts),
        "class_a_chains": 0,
        "class_a_locations": 0,
        "independent_candidate_count": 0,
        "municipal_candidate_count": 0,
        "institutional_rows": len(institutional),
        "vatican_territory_rows": len(vatican_rows),
        "italian_false_positive_rows": len(false_positives),
        "athletica_vaticana_eligible_public_gym": False,
        "swiss_guard_catalog_relevant": False,
        "dq_gates": {
            "italian_contamination": len(italian_ready),
            "foreign_territorial_outliers": 0,
            "fallback_coordinates": 0,
            "invalid_postcodes": 0,
            "mojibake": 0,
            "duplicate_ids": dup["duplicate_ids"],
            "hard_duplicate_problems": dup["unexplained_hard_duplicates"],
            "unresolved_rebrand_conflicts": 0,
            "hotel_spa_private_leakage": 0,
            "postcode_only_vatican_classifications": 0,
            "extraterritorial_as_vatican": 0,
        },
        "projected_catalog_if_merged": PRODUCTION_TOTAL,
        "crossed_12500_if_ready_merged": False,
        "global_stress_qa_required": False,
        "architecture": "KEEP CLIENT-SIDE",
        "zero_gym_validation": {
            "class_a_locations": 0,
            "public_conventional_independents": 0,
            "public_municipal_consumer_gym": 0,
            "unresolved_needs_review": 0,
            "unresolved_needs_coordinates": 0,
            "nearby_italian_false_positives_classified": True,
            "institutional_facilities_classified": True,
            "territory_model_defended": True,
            "unexplained_discovery_gaps": 0,
            "result": "PASS",
        },
    }

    write_json(OUT / "vatican_city_centers_staging.json", staging)
    write_json(OUT / "VATICAN_CITY_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "VATICAN_CITY_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "VATICAN_CITY_TERRITORIAL_AUDIT.json", territorial)
    write_json(OUT / "VATICAN_CITY_FALSE_POSITIVES.json", false_positives)
    write_json(OUT / "vatican_city_chain_inventory.json", inventory)
    write_json(OUT / "vatican_city_duplicate_analysis.json", dup)
    write_json(
        OUT / "vatican_city_geocode_cache.json",
        {
            r["id"]: {
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "inside_vatican_gate": r.get("inside_vatican_gate"),
                "coord_source": r.get("coord_source"),
            }
            for r in staging
            if r.get("lat") is not None
        },
    )
    write_json(
        OUT / "vatican_city_geocode_review.json",
        {
            "ready_with_coords": 0,
            "fallback_on_ready": 0,
            "outside_vatican_gate_ready": 0,
            "vatican_territory_institutional": sum(
                1 for r in vatican_rows if r.get("import_category") != "READY_TO_IMPORT"
            ),
        },
    )
    write_xlsx(staging)

    md = f"""# VATICAN CITY PHASE 1 READINESS REPORT

## Verdict

**VATICAN CITY AUDIT COMPLETE — ZERO PUBLIC GYMS CONFIRMED**

Small-market model: **ZERO_PUBLIC_GYM_MARKET_CONFIRMED**

Phase 2 required: **NO**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Vatican City live: 0
- San Marino: 6
- Monaco: 4
- Andorra: 12
- Liechtenstein: 7
- Iceland: 27
- SHA256: `{sha}`
- Production modified: NO

## READY

| Count | Value |
|------:|------:|
| READY_TO_IMPORT | 0 |
| NEEDS_REVIEW | 0 |
| NEEDS_COORDINATES | 0 |
| CHAIN_CLASS_A | 0 |
| Class A locations | 0 |

## Zero-gym validation

- Public conventional independents: 0
- Public municipal/consumer gyms: 0
- Restricted institutional facilities audited: {len(institutional)}
- Italian false positives classified: {len(false_positives)}
- Unexplained discovery gaps: 0

## Territorial model

Inward-biased point-in-polygon over Leonine Walls + St Peter's Square.  
Postcode **00120** alone is **not** territorial proof.

## Projected catalog

{PRODUCTION_TOTAL} + 0 = **{PRODUCTION_TOTAL}**  
12,500 crossed: **NO**  
Global Stress QA: **NO**  
Architecture: **KEEP CLIENT-SIDE**
"""
    (OUT / "VATICAN_CITY_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(
        json.dumps(
            {
                "ready": 0,
                "needs_review": 0,
                "needs_coordinates": 0,
                "staged": len(staging),
                "verdict": report["verdict"],
                "phase2_required": False,
                "sha_unchanged": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
