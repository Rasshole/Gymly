#!/usr/bin/env python3
"""Bulgaria Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    BULGARIA_POSTAL_RE,
    format_bg_postal,
    in_bulgaria,
    proximity_pairs,
    run_phase1_consolidate,
    write_json,
)

OUT = ROOT / "data/bulgaria"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840"


def write_geocode_review(rows: list[dict]) -> None:
    review = [
        {
            "id": r.get("id"),
            "name": r.get("name"),
            "brand": r.get("brand"),
            "coord_source": r.get("coord_source"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "category": r.get("import_category"),
            "postal_code": r.get("postal_code"),
        }
        for r in rows
    ]
    write_json(OUT / "bulgaria_geocode_review.json", review)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Bulgaria_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Bulgaria_All_Discovered_Centers.csv"
        cols = [
            "id",
            "brand",
            "name",
            "address",
            "city",
            "postal_code",
            "lat",
            "lng",
            "import_category",
            "source_url",
            "notes",
            "coord_source",
        ]
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in cols})
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Bulgaria Discovered"
    headers = [
        "ID",
        "Brand",
        "Name",
        "Address",
        "City",
        "Postcode",
        "Latitude",
        "Longitude",
        "Status",
        "Source",
        "Evidence",
        "Notes",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in sorted(
        rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
    ):
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
                r.get("address"),
                r.get("city"),
                r.get("postal_code"),
                r.get("lat"),
                r.get("lng"),
                r.get("import_category"),
                r.get("source_url"),
                r.get("coord_source"),
                r.get("notes"),
            ]
        )
    wb.save(path)


def write_rebrand_map() -> None:
    data = {
        "generated": "Bulgaria Phase 1",
        "cases": [
            {
                "from": "Platinum Health Club (seed name)",
                "to": "Pulse Platinum (Pulse Fitness)",
                "classification": "C_rebrand_or_name_confusion",
                "notes": "Seed list Platinum Health Club maps to Pulse Platinum club, not a separate chain",
            },
            {
                "from": "Pulse Atlantis Strumica",
                "to": None,
                "classification": "EXCLUDED_foreign",
                "notes": "Official Pulse locator lists Strumica (North Macedonia) — not Bulgaria",
            },
            {
                "from": "Pulse Therme / Royal Hotel locations",
                "to": None,
                "classification": "EXCLUDED_hotel_gym",
                "notes": "Hotel-embedded Pulse facilities excluded from conventional gym estate",
            },
        ],
    }
    write_json(OUT / "BULGARIA_PHASE1_REBRAND_MAP.json", data)


def main() -> None:
    sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: centers.json SHA changed {sha}")

    report = run_phase1_consolidate(
        country="Bulgaria",
        prefix="bg_",
        countrycodes="bg",
        out_dir=OUT,
        candidates_name="bulgaria_phase1_candidates.json",
        postal_re=BULGARIA_POSTAL_RE,
        in_country=in_bulgaria,
        format_postal=format_bg_postal,
        major_cities=[
            "Sofia",
            "Plovdiv",
            "Varna",
            "Burgas",
            "Ruse",
            "Stara Zagora",
            "Pleven",
            "Sliven",
            "Dobrich",
            "Shumen",
            "Pernik",
            "Haskovo",
            "Yambol",
            "Veliko Tarnovo",
            "Blagoevgrad",
            "Kardzhali",
            "Sveti Vlas",
        ],
        chain_coverage_notes={
            "Pulse Fitness": "Official pulsefit.bg clubs listing — hotel + Strumica excluded; ~21 conventional BG targets",
            "Next Level Fitness": "Official nextlevelclub.bg clubs — large Sofia estate + Burgas/Varna/Plovdiv/Pernik",
            "Athletic Fitness": "Official athletic.bg — Sofia/Plovdiv/Stara Zagora (10)",
            "Flais Fitness": "Official flaisfitness.bg — 14 Sofia clubs; many thin addresses → Phase 2",
            "Titanium Fitness": "Official fitnesstitanium.bg — 6 Sofia clubs; street addresses thin → Phase 2",
            "Hammer Gym": "Official hammergym.eu — 5 Sofia clubs",
            "International seeds": "Fitness First / Anytime / clever fit / FITINN / McFIT / JOHN REED / Gold's / World Class — no BG conventional estate found",
        },
        geocode_limit=200,
    )

    staging_path = OUT / "bulgaria_centers_staging.json"
    rows = json.loads(staging_path.read_text())

    # Demote thin-address READY rows (city/district-only geocodes are not gym-level)
    THIN_ADDR = {
        "drujba",
        "pernik",
        "ovcha kupel",
        "retail park varna",
        "mladost 1, sofia",
        "mladost 3, sofia",
        "ivan vazov district, sofia",
        "slatina, sofia",
        "lyulin, sofia",
        "studentski grad, sofia",
    }
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        addr = str(r.get("address") or "").strip().lower()
        city = str(r.get("city") or "").strip().lower()
        thin = (
            len(addr) < 12
            or addr == city
            or addr in THIN_ADDR
            or addr.endswith(" club, sofia")
            or "district, sofia" in addr
            or ("," in addr and addr.split(",")[0].strip() in THIN_ADDR)
        )
        if thin:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; demoted_thin_address_not_gym_level"
            r["verification_status"] = "NEEDS_REVIEW"

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    write_json(staging_path, rows)
    write_json(OUT / "BULGARIA_PHASE1_READY_TO_IMPORT.json", ready)

    write_geocode_review(rows)
    write_xlsx(rows)
    write_rebrand_map()

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    same_buckets = proximity_pairs(ready, brand_only=True)
    all_buckets = proximity_pairs(ready, brand_only=False)
    diff = [
        {**item, "classification": "A_legitimate_different_brand_colocation"}
        for bucket in ("lt25", "lt50", "lt100")
        for item in all_buckets.get(bucket, [])
        if (item.get("a_brand") or "") != (item.get("b_brand") or "")
    ]
    write_json(
        OUT / "bulgaria_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same_buckets.get("lt25", []),
                "lte_50m": same_buckets.get("lt50", []),
                "lte_100m": same_buckets.get("lt100", []),
                "lte_200m": same_buckets.get("lt200", []),
                "identical": same_buckets.get("identical", []),
            },
            "different_brand_lte_100m": diff,
        },
    )

    # Inventory summary
    from collections import Counter

    brands = Counter(r.get("brand") for r in rows if r.get("import_category") != "EXCLUDED")
    status = Counter(r.get("import_category") for r in rows)
    inv = {
        "production_sha": sha,
        "production_total": 11254,
        "bulgaria_live": 0,
        "staged_unique": len(rows),
        "status_counts": dict(status),
        "ready_by_brand": dict(
            Counter(r["brand"] for r in ready)
        ),
        "brand_totals_non_excluded": dict(brands),
        "projected_catalog_if_merged_alone": 11254 + len(ready),
        "verdict": "PHASE 2 REQUIRED"
        if len(ready) < 40
        or status.get("NEEDS_COORDINATES", 0) + status.get("NEEDS_REVIEW", 0) > 15
        else "REVIEW",
    }
    write_json(OUT / "bulgaria_chain_inventory.json", inv)

    # Readiness report
    md = [
        "# BULGARIA PHASE 1 READINESS REPORT",
        "",
        f"Production SHA: `{sha}`",
        f"Production total: 11254 (unchanged)",
        f"Staged: {len(rows)}",
        f"READY: {len(ready)}",
        f"Projected if merged alone: {11254 + len(ready)}",
        "",
        "## Status counts",
        "",
        *[f"- {k}: {v}" for k, v in sorted(status.items())],
        "",
        "## READY by brand",
        "",
        *[f"- {k}: {v}" for k, v in sorted(inv['ready_by_brand'].items())],
        "",
        "## Verdict",
        "",
        "**BULGARIA PHASE 2 REQUIRED BEFORE MERGE**",
        "",
        "Evidence: large national estates (Pulse, Next Level, Flais, Titanium) still have thin addresses / missing PSČ / geocode backlog; major cities (Ruse, Pleven, Veliko Tarnovo, …) unexplained zero coverage pending missed-chain deepening.",
        "",
    ]
    (OUT / "BULGARIA_PHASE1_READINESS_REPORT.md").write_text("\n".join(md))
    write_json(
        OUT / "BULGARIA_PHASE1_READINESS_REPORT.json",
        {
            **inv,
            "ready_count": len(ready),
            "status_counts": dict(status),
            "verdict": "BULGARIA PHASE 2 REQUIRED BEFORE MERGE",
            "production_total": 11254,
            "projected_catalog_if_merged_alone": 11254 + len(ready),
        },
    )

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert post_sha == EXPECTED_SHA, "centers.json mutated during consolidate"
    print(json.dumps({"ready": len(ready), "staged": len(rows), "sha_ok": True}, indent=2))


if __name__ == "__main__":
    main()
