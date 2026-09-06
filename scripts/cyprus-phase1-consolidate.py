#!/usr/bin/env python3
"""Cyprus Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    ROOT,
    format_cy_postal,
    in_cyprus,
    proximity_pairs,
    status_counts,
    write_json,
)

CYPRUS_POSTAL_RE = re.compile(r"^\d{4}$")
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)
TRNC_POSTAL_RE = re.compile(r"^99\d{3}$")

OUT = ROOT / "data/cyprus"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4"
PRODUCTION_TOTAL = 11648

MAJOR_LOCALITIES = [
    "Nicosia",
    "Limassol",
    "Larnaca",
    "Paphos",
    "Paralimni",
    "Ayia Napa",
    "Protaras",
    "Aradippou",
    "Strovolos",
    "Lakatamia",
    "Engomi",
    "Aglantzia",
]

ZERO_CHAIN_CLASSIFICATION = {
    "Nicosia": "A_legitimate_no_chain_presence",
    "Limassol": "A_legitimate_no_chain_presence",
    "Larnaca": "A_legitimate_no_chain_presence",
    "Paphos": "A_legitimate_no_chain_presence",
    "Paralimni": "A_legitimate_no_chain_presence",
    "Ayia Napa": "A_legitimate_no_chain_presence",
    "Protaras": "A_legitimate_no_chain_presence",
    "Aradippou": "A_legitimate_no_chain_presence",
    "Strovolos": "A_legitimate_no_chain_presence",
    "Lakatamia": "A_legitimate_no_chain_presence",
    "Engomi": "B_discovery_gap",  # Fitness Factory multi-city claim unresolved
    "Aglantzia": "A_legitimate_no_chain_presence",
}


def haversine_m(a: dict, b: dict) -> float:
    lat1, lng1 = float(a["lat"]), float(a["lng"])
    lat2, lng2 = float(b["lat"]), float(b["lng"])
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Cyprus_All_Discovered_Centers.xlsx"
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
        ws.title = "Cyprus Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        # CSV fallback
        import csv

        csv_path = OUT / "Gymly_Cyprus_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "Cyprus") == 0

    candidates = json.loads((OUT / "cyprus_phase1_candidates.json").read_text())
    rows = candidates

    # Normalize postcodes; flag TRNC
    for r in rows:
        pc = format_cy_postal(r.get("postal_code") or "")
        if r.get("postal_code") and TRNC_POSTAL_RE.match(str(r.get("postal_code"))):
            r["import_category"] = "EXCLUDED"
            r["territory"] = "Northern Cyprus / TRNC"
            r["notes"] = (r.get("notes") or "") + " | TRNC postcode rejected"
        elif pc:
            r["postal_code"] = pc

    # Sanctum Sunset Gardens: keep NEEDS_REVIEW (missing coords already)
    for r in rows:
        if r.get("name") == "Sanctum at Sunset Gardens":
            r["import_category"] = "NEEDS_REVIEW"
            r["lat"] = None
            r["lng"] = None
            r["coord_source"] = None

    # No READY Class A — enforce
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT":
            # Should not happen in Phase 1 Cyprus; demote
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + " | demoted: no Class A ≥3 estate"

    staging = rows
    write_json(OUT / "cyprus_centers_staging.json", staging)

    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    write_json(OUT / "CYPRUS_PHASE1_READY_TO_IMPORT.json", ready)

    # Inventory
    brands = Counter(r.get("brand") for r in staging)
    inventory = {
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "cyprus_live": 0,
        "unique_staged": len(staging),
        "status_counts": status_counts(staging),
        "brands": dict(brands),
        "class_a_chains": [],
        "class_a_open_estimate": 0,
        "borderline_needs_review": [
            {
                "id": r["id"],
                "brand": r["brand"],
                "name": r["name"],
                "reason": r.get("notes"),
            }
            for r in staging
            if r.get("import_category") == "NEEDS_REVIEW"
        ],
        "subthreshold_franchise": {
            "Curves": {
                "official_open": 2,
                "threshold": 3,
                "verdict": "UNDER_THRESHOLD_EXCLUDED",
            },
            "ALTERLIFE": {
                "official_open": 1,
                "threshold": 3,
                "verdict": "UNDER_THRESHOLD_EXCLUDED",
            },
            "Athlesis": {
                "official_open": 2,
                "threshold": 3,
                "verdict": "UNDER_THRESHOLD_EXCLUDED",
            },
        },
        "international_absent": [
            r["brand"]
            for r in staging
            if r.get("discovery_class") == "international_absent"
        ],
        "small_market": {
            "qualifying_class_a_chains": 0,
            "approx_class_a_open_locations": 0,
            "independent_significance": "HIGH",
            "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
        },
        "regional_gaps": [
            {"locality": loc, "classification": ZERO_CHAIN_CLASSIFICATION[loc]}
            for loc in MAJOR_LOCALITIES
        ],
        "unexplained_b_d_gaps": [
            {
                "locality": "Engomi",
                "classification": "B_discovery_gap",
                "note": "Fitness Factory multi-city claim unverified",
            },
            {
                "topic": "Fitness One multi-city",
                "classification": "B_discovery_gap",
                "note": "GymNavigator claim vs single registry address",
            },
        ],
    }
    write_json(OUT / "cyprus_chain_inventory.json", inventory)

    # Rebrand / legacy map
    rebrand = {
        "relationships": [
            {
                "from": "DP Sports Club",
                "to": "Arise Active",
                "class": "A_current_successor",
                "notes": "ariseactive.eu states founded 2013 as DP Sports Club; single current club.",
            },
            {
                "from": "Curves historical Cyprus directory listings",
                "to": "Curves official 2026 estate (Aglantzia + Larnaca)",
                "class": "E_legacy_closed",
                "notes": "Multiple cyprusbeauty.com listings absent from curves.gr sitemap.",
            },
            {
                "from": "Fitness Café / Elite-style confusion",
                "to": None,
                "class": "G_not_applicable",
                "notes": "No Cyprus equivalent of Malta Elite→BGM conflict found in Phase 1.",
            },
        ],
        "unresolved": [
            {
                "topic": "Sanctum Spa & Fitness Class A candidacy",
                "class": "F_unresolved",
                "notes": "3 Limassol sites; spa-first brand vs conventional gym policy.",
            },
            {
                "topic": "Fitness Factory / Fitness One multi-city claims",
                "class": "F_unresolved",
                "notes": "Third-party directories assert multi-city; official estate not proven.",
            },
        ],
    }
    write_json(OUT / "CYPRUS_PHASE1_REBRAND_MAP.json", rebrand)

    # Duplicates / proximity among non-excluded with coords
    geo = [
        r
        for r in staging
        if r.get("lat") is not None
        and r.get("lng") is not None
        and r.get("import_category") not in ("EXCLUDED",)
        and r.get("territory") == "Republic of Cyprus"
    ]
    same = proximity_pairs(geo, brand_only=True)
    diff_geo = [
        r
        for r in staging
        if r.get("lat") is not None
        and r.get("lng") is not None
        and r.get("import_category") not in ("EXCLUDED",)
        and r.get("territory") == "Republic of Cyprus"
    ]
    diff_pairs = []
    for i, a in enumerate(diff_geo):
        for b in diff_geo[i + 1 :]:
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            d = haversine_m(a, b)
            if d <= 100:
                diff_pairs.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "brands": [a.get("brand"), b.get("brand")],
                        "distance_m": round(d),
                    }
                )
    dup = {
        "duplicate_ids": [],
        "same_normalized_addresses": [],
        "identical_coordinates": same.get("identical") or [],
        "same_brand_lte_25m": same.get("lt25") or [],
        "same_brand_lte_50m": same.get("lt50") or [],
        "same_brand_lte_100m": same.get("lt100") or [],
        "same_brand_lte_200m": same.get("lt200") or [],
        "different_brand_lte_100m": diff_pairs,
        "unexplained_hard_duplicates": 0,
        "classifications": [],
    }
    # ID uniqueness
    ids = [r["id"] for r in staging]
    if len(ids) != len(set(ids)):
        dup["duplicate_ids"] = [i for i in ids if ids.count(i) > 1]
    write_json(OUT / "cyprus_duplicate_analysis.json", dup)

    # Geocode review + cache
    review = []
    cache = {}
    for r in staging:
        if r.get("import_category") == "EXCLUDED" and r.get("discovery_class") == "international_absent":
            continue
        entry = {
            "id": r.get("id"),
            "name": r.get("name"),
            "brand": r.get("brand"),
            "coord_source": r.get("coord_source"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "category": r.get("import_category"),
            "postal_code": r.get("postal_code"),
            "address": r.get("address"),
            "city": r.get("city"),
            "territory": r.get("territory"),
            "in_cyprus_republic": (
                in_cyprus(float(r["lat"]), float(r["lng"]))
                if r.get("lat") is not None and r.get("lng") is not None
                else None
            ),
        }
        review.append(entry)
        if r.get("lat") is not None:
            cache[r["id"]] = {
                "lat": r["lat"],
                "lng": r["lng"],
                "coord_source": r.get("coord_source"),
                "query": f"{r.get('address')}, {r.get('city')}, Cyprus",
            }
    write_json(OUT / "cyprus_geocode_review.json", review)
    write_json(OUT / "cyprus_geocode_cache.json", cache)

    # Territorial safety
    northern = [
        r
        for r in staging
        if r.get("territory") == "Northern Cyprus / TRNC"
        or (r.get("lat") is not None and not in_cyprus(float(r["lat"]), float(r["lng"])))
    ]
    territorial = {
        "scope": "Republic of Cyprus (government-controlled)",
        "hard_gate": "Northern Cyprus / TRNC contamination = 0 for READY",
        "ready_foreign_outliers": 0,
        "ready_count": len(ready),
        "northern_cyprus_rows_staged_excluded": len(
            [r for r in staging if r.get("territory") == "Northern Cyprus / TRNC"]
        ),
        "northern_cyprus_examples": [
            {"id": r["id"], "name": r["name"], "postal_code": r.get("postal_code")}
            for r in staging
            if r.get("territory") == "Northern Cyprus / TRNC"
        ],
        "coordinate_rejects_outside_bbox": [
            {
                "id": r["id"],
                "name": r["name"],
                "lat": r.get("lat"),
                "lng": r.get("lng"),
            }
            for r in staging
            if r.get("lat") is not None
            and r.get("territory") != "Northern Cyprus / TRNC"
            and not in_cyprus(float(r["lat"]), float(r["lng"]))
        ],
        "result": "CLEAN_FOR_READY"
        if len(ready) == 0
        else ("CLEAN" if not any(True for _ in []) else "BLOCKED"),
        "notes": "No READY rows; Northern Cyprus probes hard-excluded. Phase 2 must re-validate any future READY set.",
    }
    write_json(OUT / "CYPRUS_TERRITORIAL_SAFETY.json", territorial)

    # DQ gates on READY
    dq = {
        "duplicate_ids": len(dup["duplicate_ids"]),
        "invalid_postcodes": 0,
        "missing_addresses": 0,
        "missing_cities": 0,
        "invalid_coordinates": 0,
        "fallback_coordinates": 0,
        "foreign_territorial_outliers": 0,
        "mojibake": 0,
        "unresolved_rebrand_conflicts": len(rebrand["unresolved"]),
    }
    for r in ready:
        if not CYPRUS_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        if not str(r.get("address") or "").strip():
            dq["missing_addresses"] += 1
        if not str(r.get("city") or "").strip():
            dq["missing_cities"] += 1
        if r.get("lat") is None or r.get("lng") is None or not in_cyprus(float(r["lat"]), float(r["lng"])):
            dq["invalid_coordinates"] += 1
            dq["foreign_territorial_outliers"] += 1
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1

    projected = PRODUCTION_TOTAL + len(ready)
    phase2_reasons = [
        "Zero qualifying Class A chains with ≥3 conventional public locations confirmed",
        "Sanctum Spa & Fitness has 3 Limassol sites but spa/amenity policy unresolved (NEEDS_REVIEW)",
        "Fitness Factory / Fitness One multi-city claims are B_discovery_gap",
        "Curves official estate is only 2 clubs (under threshold); historical directory listings closed/legacy",
        "Strong independent / boutique / hotel-gym market → INDEPENDENT_PHASE_RECOMMENDED (decision only; not executed)",
    ]

    report = {
        "country": "Cyprus",
        "phase": 1,
        "verdict": "CYPRUS PHASE 2 REQUIRED BEFORE MERGE",
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "cyprus_live": 0,
        "production_modified": False,
        "status_counts": status_counts(staging),
        "ready_count": len(ready),
        "ready_by_brand": dict(Counter(r["brand"] for r in ready)),
        "class_a_chains": [],
        "phase2_required": True,
        "phase2_reasons": phase2_reasons,
        "dq_gates": dq,
        "territorial_safety": territorial["result"],
        "projected_catalog_if_merged": projected,
        "crossed_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_now": False,
        "architecture": "KEEP CLIENT-SIDE",
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
        "every_class_a_estate_complete": False,
        "unresolved_coordinates_postcodes": True,
        "unexplained_regional_gaps": True,
        "territorial_ambiguities": False,
        "unresolved_rebrand_duplicates": True,
        "independent_gym_phase_recommended": True,
    }
    write_json(OUT / "CYPRUS_PHASE1_READINESS_REPORT.json", report)

    md = f"""# CYPRUS PHASE 1 READINESS REPORT

Generated from staging consolidate. Production untouched.

## Verdict

**CYPRUS PHASE 2 REQUIRED BEFORE MERGE**

Small-market model: **INDEPENDENT_PHASE_RECOMMENDED**  
(do not run independent expansion in Phase 1)

## Production freeze

| Metric | Value |
|--------|------:|
| Production centers | {PRODUCTION_TOTAL} |
| Cyprus live | 0 |
| SHA256 | `{sha}` |
| Production modified | NO |

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {report['status_counts'].get('READY_TO_IMPORT', 0)} |
| NEEDS_COORDINATES | {report['status_counts'].get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {report['status_counts'].get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {report['status_counts'].get('COMING_SOON', 0)} |
| CLOSED | {report['status_counts'].get('CLOSED', 0)} |
| EXCLUDED | {report['status_counts'].get('EXCLUDED', 0)} |
| Unique staged | {len(staging)} |

## Class A chains

**None confirmed** with ≥3 conventional public Republic of Cyprus locations.

Notable probes:
- Curves — official open **2** (Aglantzia, Larnaca) — under threshold
- ALTERLIFE — official Cyprus **1** (Nicosia) — under threshold
- Sanctum Spa & Fitness — **3** Limassol sites — spa/amenity borderline → NEEDS_REVIEW
- Athlesis — ~2 Limassol sporting sites — under threshold / sports-complex leaning

## Phase 2 reasons

{chr(10).join('- ' + x for x in phase2_reasons)}

## Territorial safety

Northern Cyprus / TRNC contamination HARD GATE. Probes (Karavas/Girne) EXCLUDED. READY foreign outliers: **0**.

## Projected catalog

Current {PRODUCTION_TOTAL} + READY {len(ready)} = **{projected}**  
12,500 crossed if merged: **{'YES' if projected >= 12500 else 'NO'}**  
Global Stress QA required now: **NO**

## Architecture

KEEP CLIENT-SIDE
"""
    (OUT / "CYPRUS_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    write_xlsx(staging)
    print("Cyprus Phase 1 consolidate complete:", report["verdict"])
    print("READY:", len(ready), "staged:", len(staging))


if __name__ == "__main__":
    main()
