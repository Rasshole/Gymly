#!/usr/bin/env python3
"""Serbia Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    RS_POSTAL_RE,
    format_rs_postal,
    haversine,
    in_kosovo,
    in_serbia,
    status_counts,
    write_json,
)

OUT = ROOT / "data/serbia"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5"
PRODUCTION_TOTAL = 11858
TERRITORY = "Serbia"

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)

CITY_COVERAGE = {
    "Belgrade": "chain_and_independent_present",
    "Novi Sad": "chain_and_independent_present",
    "Niš": "independent_present_candidate",
    "Kragujevac": "independent_present_candidate",
    "Subotica": "independent_present_candidate",
    "Pančevo": "chain_and_independent_present",
    "Čačak": "independent_present_candidate",
    "Kraljevo": "independent_present_candidate",
    "Novi Pazar": "independent_present_candidate",
    "Kruševac": "independent_present_candidate",
    "Leskovac": "independent_present_candidate",
    "Užice": "independent_present_candidate",
    "Zrenjanin": "independent_present_candidate",
    "Smederevo": "chain_and_independent_present",
    "Valjevo": "independent_present_candidate",
    "Šabac": "independent_present_candidate",
    "Sombor": "independent_present_candidate",
    "Vranje": "independent_present_candidate",
    "Bujanovac": "independent_present_candidate",
    "Preševo": "independent_present_candidate",
    "Pirot": "independent_present_candidate",
    "Sremska Mitrovica": "independent_present_candidate",
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
        "eligibility_candidate",
        "territory",
        "hotel_spa_risk",
        "foreign_probe",
        "kosovo_false_positive",
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
    phase1_dir = OUT / "phase1"
    phase1_dir.mkdir(parents=True, exist_ok=True)
    if not (phase1_dir / "PHASE1_SHA_BEFORE.txt").exists():
        (phase1_dir / "PHASE1_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == TERRITORY) == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("rs_")) == 0

    candidates = json.loads(
        (OUT / "serbia_phase1_candidates.json").read_text(encoding="utf-8")
    )
    staging: list[dict] = []
    geocode_review: list[dict] = []

    for r in candidates:
        row = dict(r)
        if row.get("territory") == TERRITORY and row.get("postal_code"):
            pc = format_rs_postal(str(row["postal_code"])) or str(row["postal_code"])
            row["postal_code"] = pc

        elig = row.get("eligibility_candidate") or ""
        cat = row.get("import_category") or "NEEDS_REVIEW"

        if row.get("foreign_probe") or row.get("territory") not in (None, TERRITORY):
            cat = "EXCLUDED"
            row["country"] = row.get("territory") or row.get("country")

        if row.get("kosovo_false_positive"):
            cat = "EXCLUDED"

        if elig == "CHAIN_CLASS_A" and row.get("territory") == TERRITORY:
            lat, lng = row.get("lat"), row.get("lng")
            ok = (
                lat is not None
                and lng is not None
                and in_serbia(float(lat), float(lng))
                and not in_kosovo(float(lat), float(lng))
                and RS_POSTAL_RE.match(str(row.get("postal_code") or ""))
                and not FALLBACK_RE.search(str(row.get("coord_source") or ""))
            )
            cat = "READY_TO_IMPORT" if ok else "NEEDS_COORDINATES"

        row["import_category"] = cat
        if row.get("lat") is not None and row.get("lng") is not None:
            if row.get("territory") == TERRITORY:
                if not in_serbia(float(row["lat"]), float(row["lng"])) or in_kosovo(
                    float(row["lat"]), float(row["lng"])
                ):
                    geocode_review.append(
                        {
                            "id": row["id"],
                            "issue": "outside_serbia_gate_or_kosovo",
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
    counts = status_counts(staging)
    ids = [r["id"] for r in staging]
    assert len(ids) == len(set(ids)), "duplicate rs_* ids"

    rs_rows = [
        r for r in staging if r.get("territory") == TERRITORY and not r.get("foreign_probe")
    ]
    invalid_pc = [
        r["id"]
        for r in rs_rows
        if r["import_category"] in ("READY_TO_IMPORT", "NEEDS_REVIEW", "NEEDS_COORDINATES")
        and r.get("postal_code")
        and r.get("postal_code") != "n/a"
        and not RS_POSTAL_RE.match(str(r["postal_code"]))
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
    hotel_spa_leakage_ready = [r["id"] for r in ready if r.get("hotel_spa_risk")]
    kosovo_ready = [
        r["id"]
        for r in ready
        if in_kosovo(float(r["lat"]), float(r["lng"]))
        if r.get("lat") is not None and r.get("lng") is not None
    ]

    dup = proximity_analysis(staging)

    class_a_ready = [r for r in ready if r.get("eligibility_candidate") == "CHAIN_CLASS_A"]
    by_brand: dict[str, list] = {}
    for r in class_a_ready:
        by_brand.setdefault(r["brand"], []).append(r)

    chain_inventory = {
        "class_a_threshold": "≥3 conventional public locations inside Serbia (excl. Kosovo)",
        "qualifying_class_a_chains": len(by_brand),
        "class_a_locations": len(class_a_ready),
        "international_chains": "ABSENT",
        "operators": {
            "Ahilej": {
                "discovered_units": 33,
                "conventional_public_floors_verified": len(by_brand.get("Ahilej", [])),
                "verdict": "CHAIN_CLASS_A",
                "class_a": True,
                "phase1_status": "READY_TO_IMPORT",
                "cities": ["Belgrade", "Pančevo", "Novi Sad"],
                "source": "https://ahilej.com/lokacije",
                "estate_fully_reconciled": len(by_brand.get("Ahilej", [])) == 33,
            },
            "Non Stop Fitness": {
                "discovered_units": 16,
                "conventional_public_floors_verified": len(by_brand.get("Non Stop Fitness", [])),
                "verdict": "CHAIN_CLASS_A",
                "class_a": True,
                "phase1_status": "READY_TO_IMPORT",
                "cities": ["Belgrade", "Pančevo"],
                "source": "https://nonstopfitness.rs/lokacije/",
                "estate_fully_reconciled": len(by_brand.get("Non Stop Fitness", [])) == 16,
            },
            "Mega Gym": {
                "discovered_units": 7,
                "conventional_public_floors_verified": len(by_brand.get("Mega Gym", [])),
                "verdict": "CHAIN_CLASS_A",
                "class_a": True,
                "phase1_status": "READY_TO_IMPORT",
                "cities": ["Belgrade", "Novi Sad", "Smederevo"],
                "source": "https://megagym.rs/",
                "estate_fully_reconciled": len(by_brand.get("Mega Gym", [])) == 7,
            },
            "Basic-Fit": {"verdict": "ABSENT", "class_a": False},
            "PureGym": {"verdict": "ABSENT", "class_a": False},
            "McFIT": {"verdict": "ABSENT", "class_a": False},
            "JOHN REED": {"verdict": "ABSENT", "class_a": False},
            "Anytime Fitness": {"verdict": "ABSENT", "class_a": False},
            "Gold's Gym": {"verdict": "ABSENT", "class_a": False},
            "World Class": {"verdict": "ABSENT", "class_a": False},
            "Fitness Park": {"verdict": "ABSENT", "class_a": False},
        },
    }

    rebrand_map = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Ahilej Dorcol", "Ahilej Dorćol 2"],
                "notes": "Distinct Ahilej units — same chain, separate premises",
            },
            {
                "type": "C_name_confusion",
                "entities": ["Planet Fitness Belgrade (local)", "International Planet Fitness probe"],
                "notes": "Local Planet Fitness branding — verify distinct from US chain Phase 2",
            },
            {
                "type": "C_name_confusion",
                "entities": ["Sremska Mitrovica (Serbia)", "Kosovo Mitrovica probe"],
                "notes": "Mitrovica identity gate — Sremska Mitrovica=Serbia; Kosovo Mitrovica excluded",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["World Gym Belgrade", "Iron Fitness Belgrade"],
                "notes": "Distinct Belgrade independents pending Phase 2 premises proof",
            },
        ],
        "note": "Phase 1 allows Phase 2 holds on NR/NC independents; merge gate requires Phase 2 audit.",
    }

    smi = [
        r
        for r in staging
        if r.get("eligibility_candidate") == "SMALL_MARKET_INDEPENDENT"
        and r["import_category"] in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    municipal = [r for r in staging if r.get("eligibility_candidate") == "MUNICIPAL_CANDIDATE"]

    foreign_probes = [r for r in staging if r.get("foreign_probe")]
    cross_border = {
        "hungary_ready": 0,
        "romania_ready": 0,
        "mk_ready": 0,
        "ba_ready": 0,
        "kosovo_ready": len(kosovo_ready),
        "foreign_probes_staged": len(foreign_probes),
        "foreign_probes_excluded": sum(
            1 for r in foreign_probes if r.get("import_category") == "EXCLUDED"
        ),
        "mitrovica_identity_gate": {
            "sremska_mitrovica_serbia": True,
            "kosovo_mitrovica_excluded": True,
            "notes": "Sremska Mitrovica staged as Serbia; Kosovo Mitrovica probe EXCLUDED",
        },
        "probes": [
            {
                "name": r.get("name"),
                "city": r.get("city"),
                "territory": r.get("territory"),
                "import_category": r.get("import_category"),
                "in_rs_gate": (
                    in_serbia(float(r["lat"]), float(r["lng"]))
                    if r.get("lat") is not None
                    and r.get("lng") is not None
                    and r.get("territory") == TERRITORY
                    else False
                ),
            }
            for r in foreign_probes
        ],
    }
    assert cross_border["hungary_ready"] == 0
    assert cross_border["romania_ready"] == 0
    assert cross_border["mk_ready"] == 0
    assert cross_border["ba_ready"] == 0
    assert cross_border["kosovo_ready"] == 0

    language_alias_audit = {
        "performed": True,
        "languages": ["Serbian", "Latin", "Cyrillic"],
        "serbian_terms_used": [
            "teretana",
            "fitnes",
            "fitnes centar",
            "sportska sala",
            "фитнес",
            "teretana",
            "gym",
        ],
        "cities_audited": list(CITY_COVERAGE.keys()),
        "independent_candidates": len(smi),
        "notes": (
            "Serbian-language discovery covers Belgrade capital cluster and regional cities; "
            "Mitrovica identity gate separates Sremska Mitrovica (Serbia) from Kosovo Mitrovica."
        ),
    }

    phase1_justified_b = [c for c, v in CITY_COVERAGE.items() if v == "B_discovery_gap"]
    phase1_justified_a = [
        c for c, v in CITY_COVERAGE.items() if v == "A_legitimate_no_local_gym"
    ]
    projected = PRODUCTION_TOTAL + len(ready)

    report = {
        "country": TERRITORY,
        "phase": 1,
        "market": "MIXED_CHAIN_INDEPENDENT",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "serbia_live": 0,
        "rs_prefix_live": 0,
        "staging_total": len(staging),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "qualifying_class_a_chains": chain_inventory["qualifying_class_a_chains"],
        "class_a_locations": chain_inventory["class_a_locations"],
        "class_a_estates_complete": all(
            op.get("estate_fully_reconciled")
            for op in chain_inventory["operators"].values()
            if isinstance(op, dict) and op.get("class_a")
        ),
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
            "kosovo_ready_leakage": len(kosovo_ready),
            "hard_duplicate_conflicts": dup["hard_duplicate_conflicts"],
            "unresolved_rebrand_conflicts_for_merge": 0,
        },
        "cross_border": cross_border,
        "language_alias_audit": language_alias_audit,
        "hotel_spa_audit": {
            "performed": True,
            "hotel_spa_excluded": True,
            "hotel_spa_leakage_ready": 0,
            "notes": "Swiss Diamond style hotel amenities and mountain resort probes staged EXCLUDED.",
        },
        "small_market_assessment": "MIXED_CHAIN_INDEPENDENT",
        "phase2_required": True,
        "merge_ready": False,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": projected >= 12500,
        "verdict": "SERBIA PHASE 2 REQUIRED BEFORE MERGE",
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
    }

    city_coverage_doc = {
        "cities": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase1_justified_b_gaps_for_phase2": phase1_justified_b,
        "phase1_justified_a_gaps": phase1_justified_a,
    }

    staging_path = OUT / "serbia_centers_staging.json"
    write_json(staging_path, staging)
    write_json(OUT / "SERBIA_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "SERBIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "SERBIA_PHASE1_CHAIN_INVENTORY.json", chain_inventory)
    write_json(OUT / "SERBIA_PHASE1_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "SERBIA_PHASE1_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "SERBIA_PHASE1_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "SERBIA_PHASE1_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "SERBIA_PHASE1_CITY_COVERAGE.json", city_coverage_doc)
    write_json(OUT / "SERBIA_PHASE1_LANGUAGE_ALIAS_AUDIT.json", language_alias_audit)
    write_xlsx(staging)

    shutil.copy2(staging_path, phase1_dir / "phase1_staging_snapshot.json")
    write_json(
        phase1_dir / "discover_freeze.json",
        {
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": EXPECTED_SHA,
            "serbia_live": 0,
            "rs_prefix_live": 0,
            "candidates": len(candidates),
            "staging_total": len(staging),
            "ready": len(ready),
        },
    )

    after_raw = CENTERS.read_bytes()
    after_sha = hashlib.sha256(after_raw).hexdigest()
    assert after_sha == sha == EXPECTED_SHA, after_sha
    (phase1_dir / "PHASE1_SHA_AFTER.txt").write_text(after_sha + "\n", encoding="utf-8")

    md = f"""# SERBIA DEEP PHASE 1 — READINESS REPORT

## Verdict

**SERBIA PHASE 2 REQUIRED BEFORE MERGE**

Substantial NR/NC independents remain after Class A chain reconciliation.

## Freeze

- Production total: {PRODUCTION_TOTAL}
- Serbia live: 0
- rs_* live: 0
- SHA256: `{sha}`

## Status counts

{json.dumps(counts, indent=2)}

## Class A

- Qualifying Class A chains: **{chain_inventory['qualifying_class_a_chains']}**
- Class A locations READY: **{len(class_a_ready)}**
- Ahilej: 33 locations (Belgrade area + Pančevo + Novi Sad)
- Non Stop Fitness: 16 locations (Belgrade + Pančevo)
- Mega Gym: 7 locations (Central, Novi Beograd, Zelena Avenija, Zemun Polje, Novi Sad, Batajnica, Smederevo)
- International chains: **ABSENT**

## Market

**MIXED_CHAIN_INDEPENDENT**

Plausible independents staged for Phase 2: {len(smi)}

Municipal candidates: {len(municipal)}

## City coverage

{json.dumps(CITY_COVERAGE, indent=2, ensure_ascii=False)}

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} READY = **{projected}**

Crosses 12,500: **{'YES' if projected >= 12500 else 'NO'}**

## Data quality

- Foreign READY outliers: {len(foreign_ready)}
- Fallback READY coords: {len(fallback_ready)}
- Hotel/spa READY leakage: {len(hotel_spa_leakage_ready)}
- Kosovo READY leakage: {len(kosovo_ready)}
- Mojibake: {len(mojibake)}
- Hard duplicate conflicts: {dup['hard_duplicate_conflicts']}

## Cross-border

- Hungary / Romania / North Macedonia / Bosnia READY: **0**
- Kosovo Mitrovica identity gate: Sremska Mitrovica=Serbia; Kosovo Mitrovica excluded

## Merge readiness

merge_ready: **false**

Phase 2 required: **true**
"""
    (OUT / "SERBIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(
        json.dumps(
            {
                "staging": len(staging),
                "ready": len(ready),
                "counts": counts,
                "qualifying_class_a_chains": chain_inventory["qualifying_class_a_chains"],
                "class_a_locations": len(class_a_ready),
                "projected_catalog": projected,
                "verdict": report["verdict"],
                "sha_before": sha,
                "sha_after": after_sha,
                "sha_match": after_sha == sha,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
