#!/usr/bin/env python3
"""Slovakia Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    SLOVAKIA_POSTAL_RE,
    format_sk_postal,
    in_slovakia,
    run_phase1_consolidate,
    write_json,
)

OUT = ROOT / "data/slovakia"


def write_geocode_review(rows: list[dict]) -> None:
    review = []
    for r in rows:
        review.append(
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "coord_source": r.get("coord_source"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "category": r.get("import_category"),
            }
        )
    write_json(OUT / "slovakia_geocode_review.json", review)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Slovakia_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        csv_path = OUT / "Gymly_Slovakia_All_Discovered_Centers.csv"
        import csv

        cols = [
            "id",
            "brand",
            "name",
            "address",
            "postal_code",
            "city",
            "country",
            "lat",
            "lng",
            "import_category",
            "coord_source",
            "source_url",
        ]
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in cols})
        (OUT / "phase1" / "xlsx_fallback.txt").write_text(
            f"openpyxl unavailable — wrote {csv_path.name}\n"
        )
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Slovakia Discovered"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "postal_code",
        "city",
        "country",
        "lat",
        "lng",
        "import_category",
        "coord_source",
        "source_url",
        "notes",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in sorted(
        rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
    ):
        ws.append([r.get(h, "") for h in headers])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    wb.save(path)


def main() -> None:
    report = run_phase1_consolidate(
        country="Slovakia",
        prefix="sk_",
        countrycodes="sk",
        out_dir=OUT,
        candidates_name="slovakia_phase1_candidates.json",
        postal_re=SLOVAKIA_POSTAL_RE,
        in_country=in_slovakia,
        format_postal=format_sk_postal,
        major_cities=[
            "Bratislava",
            "Košice",
            "Prešov",
            "Žilina",
            "Banská Bystrica",
            "Nitra",
            "Trnava",
            "Trenčín",
            "Martin",
            "Poprad",
            "Považská Bystrica",
            "Spišská Nová Ves",
        ],
        chain_coverage_notes={
            "Golem Club": "Official VOP estate — 11 fitness clubs; physiotherapy excluded",
            "Form Factory": "WP club CPT (~18) — growing; coming-soon clubs staged separately",
            "FITINN": "fitinn.sk multi-country locator — SK filtered by PSČ 0/8/9",
            "365 Fit&Co": "Homepage lists ~8 cities — dedicated pages incomplete; Phase 2 likely",
            "EfectFit": "EXCLUDED — private personal-training specialty network",
            "FitCamp": "REBRAND — absorbed into Form Factory FitCamp club",
            "MultiSport": "EXCLUDED — pass aggregator",
        },
        geocode_limit=120,
    )
    staging_path = OUT / "slovakia_centers_staging.json"
    rows = json.loads(staging_path.read_text())
    write_geocode_review(rows)
    write_xlsx(rows)

    # Duplicate analysis artifact
    from lib.batch1_phase1_common import proximity_pairs

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    same_buckets = proximity_pairs(ready, brand_only=True)
    all_buckets = proximity_pairs(ready, brand_only=False)
    diff = [
        {**item, "classification": "A_legitimate_different_brand_colocation"}
        for bucket in ("lt25", "lt50", "lt100")
        for item in all_buckets.get(bucket, [])
        if item.get("brand")  # will filter below
    ]
    # Rebuild different-brand only
    diff_clean = []
    by_id = {r["id"]: r for r in ready}
    for bucket in ("lt25", "lt50", "lt100"):
        for item in all_buckets.get(bucket, []):
            a = by_id.get(item["a_id"])
            b = by_id.get(item["b_id"])
            if not a or not b:
                continue
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            diff_clean.append(
                {
                    **item,
                    "a_brand": a.get("brand"),
                    "b_brand": b.get("brand"),
                    "a_name": a.get("name"),
                    "b_name": b.get("name"),
                    "classification": "A_legitimate_different_brand_colocation",
                }
            )

    write_json(
        OUT / "slovakia_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "duplicate_ids": 0,
            "identical_coordinates": same_buckets.get("identical", []),
            "same_brand": {
                "le_25m": same_buckets.get("lt25", []),
                "le_50m": same_buckets.get("lt50", []),
                "le_100m": same_buckets.get("lt100", []),
                "le_200m": same_buckets.get("lt200", []),
            },
            "different_brand_le_100m": diff_clean,
        },
    )
    print(f"Wrote geocode review + xlsx + duplicates; verdict={report.get('verdict')}")


if __name__ == "__main__":
    main()
