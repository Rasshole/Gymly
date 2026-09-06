#!/usr/bin/env python3
"""Romania Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    ROMANIA_POSTAL_RE,
    format_ro_postal,
    in_romania,
    run_phase1_consolidate,
    write_json,
)

OUT = ROOT / "data/romania"


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
    write_json(OUT / "romania_geocode_review.json", review)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Romania_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        csv_path = OUT / "Gymly_Romania_All_Discovered_Centers.csv"
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
    ws.title = "Romania Discovered"
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
    for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")):
        ws.append([r.get(h, "") for h in headers])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18
    wb.save(path)


def main() -> None:
    report = run_phase1_consolidate(
        country="Romania",
        prefix="ro_",
        countrycodes="ro",
        out_dir=OUT,
        candidates_name="romania_phase1_candidates.json",
        postal_re=ROMANIA_POSTAL_RE,
        in_country=in_romania,
        format_postal=format_ro_postal,
        major_cities=[
            "București",
            "Cluj-Napoca",
            "Timișoara",
            "Iași",
            "Constanța",
            "Brașov",
            "Craiova",
            "Galați",
            "Ploiești",
            "Oradea",
            "Sibiu",
            "Arad",
            "Târgu Mureș",
            "Baia Mare",
            "Bacău",
            "Buzău",
            "Satu Mare",
            "Suceava",
            "Pitești",
            "Râmnicu Vâlcea",
        ],
        chain_coverage_notes={
            "World Class": "Official REST API — target NEAR-COMPLETE (~45 clubs)",
            "Stay Fit Gym": "City page scrape — ~72 claimed; Phase 2 if material gaps remain",
            "18GYM": "ASL store locator — postcodes often missing; geocoded in consolidate",
            "ESX": "EXCLUDED — membership aggregator, not gym operator",
            "Other national chains": "One Fitness, SAS Gym, Downtown etc. — Phase 2 probe required",
        },
        geocode_limit=150,
    )
    staging_path = OUT / "romania_centers_staging.json"
    rows = json.loads(staging_path.read_text())
    write_geocode_review(rows)
    write_xlsx(rows)
    print(f"Wrote geocode review + xlsx; verdict={report.get('verdict')}")


if __name__ == "__main__":
    main()
