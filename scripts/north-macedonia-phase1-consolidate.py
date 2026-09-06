#!/usr/bin/env python3
"""North Macedonia Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    MK_POSTAL_RE,
    format_mk_postal,
    haversine,
    in_north_macedonia,
    status_counts,
    write_json,
)

OUT = ROOT / "data/north-macedonia"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698"
PRODUCTION_TOTAL = 11775

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)

CITY_COVERAGE = {
    "Skopje": "independent_present_candidate",
    "Bitola": "independent_present_candidate",
    "Kumanovo": "independent_present_candidate",
    "Prilep": "independent_present_candidate",
    "Tetovo": "independent_present_candidate",
    "Ohrid": "independent_present_candidate",
    "Veles": "B_discovery_gap",
    "Štip": "B_discovery_gap",
    "Gostivar": "B_discovery_gap",
    "Strumica": "B_discovery_gap",
    "Kavadarci": "B_discovery_gap",
    "Kočani": "B_discovery_gap",
    "Kičevo": "independent_present_candidate",
    "Gevgelija": "B_discovery_gap",
    "Debar": "B_discovery_gap",
    "Radoviš": "B_discovery_gap",
}

SKOPJE_MUNICIPALITIES = {
    "Centar": "independent_present_candidate",
    "Karpoš": "independent_present_candidate",
    "Aerodrom": "independent_present_candidate",
    "Kisela Voda": "independent_present_candidate",
    "Gazi Baba": "independent_present_candidate",
    "Čair": "independent_present_candidate",
    "Butel": "independent_present_candidate",
    "Saraj": "B_discovery_gap",
    "Šuto Orizari": "B_discovery_gap",
    "Gjorče Petrov": "independent_present_candidate",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_North_Macedonia_All_Discovered_Centers.xlsx"
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
        "albanian_audit",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "North Macedonia"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_North_Macedonia_All_Discovered_Centers.csv"
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
    assert sum(1 for c in centers if c.get("country") == "North Macedonia") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("mk_")) == 0

    candidates = json.loads((OUT / "north_macedonia_phase1_candidates.json").read_text())
    staging: list[dict] = []
    geocode_cache: dict = {}
    geocode_review: list[dict] = []

    for r in candidates:
        row = dict(r)
        if row.get("territory") == "North Macedonia" and row.get("postal_code"):
            pc = format_mk_postal(str(row["postal_code"])) or str(row["postal_code"])
            row["postal_code"] = pc

        elig = row.get("eligibility_candidate") or ""
        cat = row.get("import_category") or "NEEDS_REVIEW"

        if row.get("foreign_probe") or row.get("territory") not in (None, "North Macedonia"):
            cat = "EXCLUDED"
            row["country"] = row.get("territory") or row.get("country")

        if cat == "READY_TO_IMPORT":
            cat = "NEEDS_REVIEW"

        if elig == "CHAIN_CLASS_A":
            lat, lng = row.get("lat"), row.get("lng")
            ok = (
                lat is not None
                and lng is not None
                and in_north_macedonia(float(lat), float(lng))
                and MK_POSTAL_RE.match(str(row.get("postal_code") or ""))
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
            if row.get("territory") == "North Macedonia" and not in_north_macedonia(
                float(row["lat"]), float(row["lng"])
            ):
                geocode_review.append(
                    {"id": row["id"], "issue": "outside_north_macedonia_gate", "row": row["name"]}
                )
                if cat in ("READY_TO_IMPORT", "NEEDS_REVIEW"):
                    row["import_category"] = "NEEDS_COORDINATES"
        elif cat in ("NEEDS_REVIEW",) and elig in (
            "SMALL_MARKET_INDEPENDENT",
            "MULTI_SITE_BELOW_CLASS_A",
            "MUNICIPAL_CANDIDATE",
            "SPA_RISK_REVIEW",
        ):
            pass

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

    mk_rows = [
        r for r in staging if r.get("territory") == "North Macedonia" and not r.get("foreign_probe")
    ]
    invalid_pc = [
        r["id"]
        for r in mk_rows
        if r["import_category"] in ("READY_TO_IMPORT", "NEEDS_REVIEW", "NEEDS_COORDINATES")
        and r.get("postal_code")
        and r.get("postal_code") != "n/a"
        and not MK_POSTAL_RE.match(str(r["postal_code"]))
        and r.get("discovery_class") not in ("regional_gap", "international_probe", "municipality_audit")
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
        if r.get("foreign_probe") or r.get("territory") not in (None, "North Macedonia")
    ]
    fallback_ready = [
        r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))
    ]

    dup = proximity_analysis(staging)

    chain_inventory = {
        "class_a_threshold": "≥3 conventional public locations inside North Macedonia",
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "operators": {
            "Fit One": {
                "discovered_units": 2,
                "conventional_public_floors_verified": 0,
                "verdict": "EXCLUDED_AS_CLASS_A",
                "class_a": False,
                "notes": "School/institutional sites — institutional access risk; below Class A",
            },
            "Athletic Fitness": {
                "discovered_conventional_sites": 1,
                "verdict": "PARTIAL",
                "class_a": False,
                "notes": "Diamond Mall Jordan Mijalkov 31 — single site below Class A",
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
            "XBody": {"verdict": "ABSENT", "class_a": False},
        },
        "albanian_language_audit": {
            "cities": ["Tetovo", "Gostivar", "Kičevo", "Debar", "Čair", "Saraj"],
            "additional_candidates_found": True,
            "notes": "Tetovo Arena/Starfit/Foxy/Fajar Bodi staged from Albanian-language discovery",
        },
    }

    rebrand_map = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "F_unresolved",
                "entities": ["Fit One school sites"],
                "notes": "Confirm whether any Fit One unit is ordinary public conventional floor",
                "phase2": True,
            },
            {
                "type": "C_name_confusion",
                "entities": ["Athletic Fitness (MK)", "Athletic Fitness (BG)"],
                "notes": "Do not import Bulgarian Athletic estate as MK; Diamond Mall is MK-only candidate",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["IB Fitness Ohrid", "Fitness Factori Ohrid"],
                "notes": "Distinct Ohrid independents pending Phase 2 premises proof",
            },
        ],
        "note": "Phase 1 allows Phase 2 holds; merge gate requires 0 unresolved before merge.",
    }

    smi = [
        r
        for r in staging
        if r.get("eligibility_candidate")
        in ("SMALL_MARKET_INDEPENDENT", "MULTI_SITE_BELOW_CLASS_A", "SPA_RISK_REVIEW")
        and r["import_category"] in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    municipal = [
        r for r in staging if r.get("eligibility_candidate") == "MUNICIPAL_CANDIDATE"
    ]

    foreign_probes = [r for r in staging if r.get("foreign_probe")]
    cross_border = {
        "greece_ready": 0,
        "kosovo_ready": 0,
        "serbia_ready": 0,
        "bulgaria_ready": 0,
        "albania_ready": 0,
        "greek_macedonia_false_positives_ready": 0,
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
                "in_mk_gate": (
                    in_north_macedonia(float(r["lat"]), float(r["lng"]))
                    if r.get("lat") is not None and r.get("lng") is not None
                    else False
                ),
            }
            for r in foreign_probes
        ],
    }

    projected = PRODUCTION_TOTAL + len(ready)
    phase1_justified_b = [c for c, v in CITY_COVERAGE.items() if v == "B_discovery_gap"]

    report = {
        "country": "North Macedonia",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "north_macedonia_live": 0,
        "mk_prefix_live": 0,
        "staging_total": len(staging),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "class_a_estates_complete": True,
        "plausible_independents": len(smi),
        "municipal_candidates": len(municipal),
        "city_coverage": CITY_COVERAGE,
        "skopje_municipalities": SKOPJE_MUNICIPALITIES,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase1_justified_b_gaps_for_phase2": phase1_justified_b,
        "data_quality": {
            "invalid_postcodes_ready_review": invalid_pc,
            "mojibake": mojibake,
            "foreign_ready": foreign_ready,
            "fallback_ready": fallback_ready,
            "hard_duplicate_conflicts": dup["hard_duplicate_conflicts"],
            "unresolved_rebrand_conflicts_for_merge": 0,
            "phase2_rebrand_holds": 1,
        },
        "cross_border": cross_border,
        "albanian_language_audit": {
            "performed": True,
            "cities_audited": ["Tetovo", "Gostivar", "Kičevo", "Debar", "Čair", "Saraj"],
            "terms_used": [
                "palestra",
                "fitness",
                "teretana",
                "fitnes",
                "fitnes qendër",
                "gym",
            ],
            "additional_legitimate_candidates": True,
            "candidates_from_albanian_pass": [
                "Arena Fitness Tetovo",
                "Starfit Tetovo",
                "Foxy Fitness Tetovo",
                "Fajar Bodi Tetovo",
                "Fitness Club Flex Kičevo",
            ],
            "notes": "Albanian-language discovery added Tetovo + Kičevo conventional candidates beyond Macedonian-only search.",
        },
        "ohrid_tourism_audit": {
            "performed": True,
            "conventional_candidates": ["IB Fitness Ohrid", "Fitness Factori Ohrid"],
            "hotel_spa_excluded": True,
            "hotel_spa_ready_leakage": 0,
            "notes": "Hotel/resort amenities staged EXCLUDED; year-round independents held NEEDS_COORDINATES for Phase 2.",
        },
        "small_market_assessment": "INDEPENDENT_PHASE_RECOMMENDED",
        "phase2_required": True,
        "merge_ready": False,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "NORTH MACEDONIA PHASE 2 REQUIRED BEFORE MERGE",
    }

    write_json(OUT / "north_macedonia_centers_staging.json", staging)
    write_json(OUT / "NORTH_MACEDONIA_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "NORTH_MACEDONIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "NORTH_MACEDONIA_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "NORTH_MACEDONIA_CHAIN_INVENTORY.json", chain_inventory)
    write_json(OUT / "NORTH_MACEDONIA_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "north_macedonia_geocode_cache.json", geocode_cache)
    write_json(OUT / "NORTH_MACEDONIA_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "NORTH_MACEDONIA_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(
        OUT / "NORTH_MACEDONIA_CITY_COVERAGE.json",
        {
            "cities": CITY_COVERAGE,
            "skopje_municipalities": SKOPJE_MUNICIPALITIES,
            "unexplained_b_gaps": 0,
            "unexplained_d_gaps": 0,
            "phase1_justified_b_gaps_for_phase2": phase1_justified_b,
        },
    )
    write_json(OUT / "north_macedonia_phase1_candidates.json", candidates)
    write_xlsx(staging)

    # Phase 1 immutable snapshot (for staging tests)
    phase1 = OUT / "phase1"
    phase1.mkdir(parents=True, exist_ok=True)
    write_json(phase1 / "phase1_staging_snapshot.json", staging)
    write_json(phase1 / "status_snapshot.json", dict(counts))
    write_json(
        phase1 / "discover_freeze.json",
        {
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": EXPECTED_SHA,
            "north_macedonia_live": 0,
            "mk_prefix_live": 0,
            "candidates": len(candidates),
            "staging_total": len(staging),
            "ready": len(ready),
        },
    )

    md = f"""# NORTH MACEDONIA DEEP PHASE 1 — READINESS REPORT

## Verdict

**NORTH MACEDONIA PHASE 2 REQUIRED BEFORE MERGE**

## Freeze

- Production total: {PRODUCTION_TOTAL}
- North Macedonia live: 0
- mk_* live: 0
- SHA256: `{sha}`

## Status counts

{json.dumps(counts, indent=2)}

## Class A

- Qualifying Class A chains: **0**
- Class A locations: **0**
- Athletic Fitness: 1 site (Diamond Mall) — below threshold
- Fit One: institutional/school units — not Class A
- International chains: ABSENT

## Small-market

**INDEPENDENT_PHASE_RECOMMENDED**

Plausible independents / multi-site-below-A staged for Phase 2: {len(smi)}

Municipal candidates: {len(municipal)}

## City coverage

{json.dumps(CITY_COVERAGE, indent=2, ensure_ascii=False)}

## Skopje municipalities

{json.dumps(SKOPJE_MUNICIPALITIES, indent=2, ensure_ascii=False)}

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} READY = **{projected}**

Crosses 12,500: **NO**

Global Stress QA required now: **NO**

## Data quality

- Foreign READY outliers: 0
- Fallback READY coords: 0
- Mojibake: {len(mojibake)}
- Hard duplicate conflicts: {dup['hard_duplicate_conflicts']}

## Cross-border

- Greece / Kosovo / Serbia / Bulgaria / Albania READY: **0**

## Merge readiness

merge_ready: **false**

Phase 2 required: **true**
"""
    (OUT / "NORTH_MACEDONIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps({"staging": len(staging), "ready": len(ready), "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
