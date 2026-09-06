#!/usr/bin/env python3
"""Luxembourg Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    format_lu_postal,
    in_luxembourg,
    proximity_pairs,
    run_phase1_consolidate,
    write_json,
)

LUXEMBOURG_POSTAL_RE = re.compile(r"^\d{4}$")

OUT = ROOT / "data/luxembourg"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb"
PRODUCTION_TOTAL = 11610

MAJOR_CITIES = [
    "Luxembourg",
    "Esch-sur-Alzette",
    "Differdange",
    "Dudelange",
    "Pétange",
    "Sanem",
    "Hesperange",
    "Bettembourg",
    "Strassen",
    "Bertrange",
    "Mamer",
    "Mersch",
    "Ettelbruck",
    "Diekirch",
    "Wiltz",
    "Grevenmacher",
    "Remich",
]


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
            "address": r.get("address"),
            "city": r.get("city"),
            "in_luxembourg": (
                in_luxembourg(float(r["lat"]), float(r["lng"]))
                if r.get("lat") is not None and r.get("lng") is not None
                else None
            ),
        }
        for r in rows
        if r.get("import_category") != "EXCLUDED"
    ]
    write_json(OUT / "luxembourg_geocode_review.json", review)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Luxembourg_All_Discovered_Centers.xlsx"
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
        "coord_source",
        "discovery_class",
        "source_url",
        "notes",
    ]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Luxembourg Discovered"
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
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Luxembourg_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in headers})


def write_rebrand_map() -> None:
    write_json(
        OUT / "LUXEMBOURG_PHASE1_REBRAND_MAP.json",
        {
            "country": "Luxembourg",
            "phase": 1,
            "relationships": [
                {
                    "from": "Painworld Gasperich",
                    "to": "JIMS Gasperich",
                    "class": "A_successor_same_premises",
                    "notes": "Import only JIMS Gasperich current consumer identity",
                    "action": "exclude_predecessor",
                },
                {
                    "from": "Basic-Fit Foetz Rue du Brill 11",
                    "to": "JIMS Foetz Rue du Brill 11",
                    "class": "C_proximity_same_street_investigate",
                    "notes": "Same street address number — dense Foetz retail; classify proximity, do not auto-delete",
                    "action": "retain_both_pending_proximity_review",
                },
                {
                    "from": "Basic-Fit Rue Joseph Junck 12",
                    "to": "JIMS Gare Rue Joseph Junck 11",
                    "class": "C_adjacent_different_premises",
                    "notes": "Adjacent street numbers near Gare — legitimate co-location",
                    "action": "retain_both",
                },
            ],
        },
    )


def write_chain_inventory(rows: list[dict], ready: list[dict]) -> None:
    def stats(brand: str) -> dict:
        brand_rows = [r for r in rows if r.get("brand") == brand]
        return {
            "discovered": len(brand_rows),
            "READY": sum(1 for r in brand_rows if r.get("import_category") == "READY_TO_IMPORT"),
            "NEEDS_COORDINATES": sum(
                1 for r in brand_rows if r.get("import_category") == "NEEDS_COORDINATES"
            ),
            "NEEDS_REVIEW": sum(
                1 for r in brand_rows if r.get("import_category") == "NEEDS_REVIEW"
            ),
            "COMING_SOON": sum(
                1 for r in brand_rows if r.get("import_category") == "COMING_SOON"
            ),
            "CLOSED": sum(1 for r in brand_rows if r.get("import_category") == "CLOSED"),
            "EXCLUDED": sum(1 for r in brand_rows if r.get("import_category") == "EXCLUDED"),
        }

    bf = stats("Basic-Fit")
    jims = stats("JIMS")
    ck = stats("CK Fitness")

    def verdict(official_open: int, ready_n: int, needs: int, coming: int) -> str:
        if needs > 0:
            return "PARTIAL"
        if ready_n >= official_open and coming == 0:
            return "COMPLETE"
        if ready_n + coming >= official_open and ready_n >= official_open - 1:
            return "NEAR_COMPLETE"
        if ready_n > 0:
            return "PARTIAL"
        return "BLOCKED"

    inv = {
        "country": "Luxembourg",
        "phase": 1,
        "chains": {
            "Basic-Fit": {
                **bf,
                "classification": "A",
                "official_current": 10,
                "official_open": 10,
                "coverage_pct": round(100 * bf["READY"] / 10, 1) if 10 else 0,
                "verdict": verdict(10, bf["READY"], bf["NEEDS_COORDINATES"] + bf["NEEDS_REVIEW"], 0),
                "sources": ["https://www.basic-fit.com/en-lu/club-finder"],
            },
            "JIMS": {
                **jims,
                "classification": "A",
                "official_current": 7,
                "official_open": 6,
                "coverage_pct": round(100 * jims["READY"] / 6, 1) if 6 else 0,
                "verdict": verdict(
                    6,
                    jims["READY"],
                    jims["NEEDS_COORDINATES"] + jims["NEEDS_REVIEW"],
                    jims["COMING_SOON"],
                ),
                "sources": ["https://www.jims.lu/en/clubs"],
                "notes": "Foetz renovating — COMING_SOON; Gasperich = ex-Painworld",
            },
            "CK Fitness": {
                **ck,
                "classification": "A",
                "official_current": 4,
                "official_open": 4,
                "coverage_pct": round(100 * ck["READY"] / 4, 1) if 4 else 0,
                "verdict": verdict(4, ck["READY"], ck["NEEDS_COORDINATES"] + ck["NEEDS_REVIEW"], 0),
                "sources": ["https://www.ck-fitness.lu/fr/nos-centres"],
            },
        },
        "ready_total": len(ready),
        "ready_by_brand": {
            b: sum(1 for r in ready if r.get("brand") == b)
            for b in sorted({r.get("brand") for r in ready})
        },
        "excluded_operators_summary": [
            "Factory 4 / Vitaly-Fit / Athletic Center / Fitness Zone — Class E",
            "Painworld — legacy → JIMS Gasperich",
            "CK Sportcenter Kockelscheuer / Coque — Class C complexes",
            "International probes absent: Fitness Park, Anytime, McFIT, JOHN REED, clever fit, FITINN, Gold's, Fitness First, World Class, L'Orange Bleue, Keep Cool",
        ],
    }
    write_json(OUT / "luxembourg_chain_inventory.json", inv)


def write_regional(ready: list[dict], rows: list[dict]) -> None:
    by_city: dict[str, int] = {}
    for r in ready:
        by_city[r["city"]] = by_city.get(r["city"], 0) + 1
    # Also count Foetz/Belvaux/Sandweiler etc present in staging ready
    staged_cities = {r.get("city") for r in rows if r.get("import_category") == "READY_TO_IMPORT"}
    zero_class = {}
    # Legitimate no Class A chain presence vs discovery gap
    a_legit = {
        "Differdange",
        "Dudelange",
        "Pétange",
        "Sanem",
        "Hesperange",
        "Mamer",
        "Diekirch",
        "Wiltz",
        "Grevenmacher",
        "Remich",
    }
    for city in MAJOR_CITIES:
        if by_city.get(city, 0) == 0 and city not in staged_cities:
            if city in a_legit:
                zero_class[city] = "A_legitimate_no_chain_presence"
            else:
                # Luxembourg City / Esch / Bettembourg / Strassen / Bertrange / Mersch / Ettelbruck
                # should have coverage from Class A — if zero, investigate
                zero_class[city] = "B_discovery_gap"
    write_json(
        OUT / "phase1" / "regional_coverage.json",
        {
            "ready_by_city": by_city,
            "zero_open_classifications": zero_class,
            "audited_cities": MAJOR_CITIES,
            "notes": [
                "Belvaux/Foetz/Sandweiler/Bereldange/Windhof/Junglinster covered as satellites of audited markets",
                "Border towns audited for BE/FR/DE contamination",
            ],
        },
    )


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: SHA {sha}")

    report = run_phase1_consolidate(
        country="Luxembourg",
        prefix="lu_",
        countrycodes="lu",
        out_dir=OUT,
        candidates_name="luxembourg_phase1_candidates.json",
        postal_re=LUXEMBOURG_POSTAL_RE,
        in_country=in_luxembourg,
        format_postal=format_lu_postal,
        major_cities=MAJOR_CITIES,
        geocode_limit=80,
    )

    rows = json.loads((OUT / "luxembourg_centers_staging.json").read_text())
    ready = json.loads((OUT / "LUXEMBOURG_PHASE1_READY_TO_IMPORT.json").read_text())

    write_geocode_review(rows)
    write_xlsx(rows)
    write_rebrand_map()
    write_chain_inventory(rows, ready)
    write_regional(ready, rows)

    same = proximity_pairs(ready, brand_only=True)
    all_prox = proximity_pairs(ready, brand_only=False)
    diff_brand = []
    for bucket in ("lt25", "lt50", "lt100"):
        for item in all_prox.get(bucket, []):
            a = next(r for r in ready if r["id"] == item["a_id"])
            b = next(r for r in ready if r["id"] == item["b_id"])
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            is_junck = "junck" in (a.get("address") or "").lower() or "junck" in (
                b.get("address") or ""
            ).lower()
            diff_brand.append(
                {
                    **item,
                    "a_brand": a.get("brand"),
                    "b_brand": b.get("brand"),
                    "a_name": a.get("name"),
                    "b_name": b.get("name"),
                    "classification": (
                        "A_legitimate_adjacent_premises" if is_junck else "B_investigate"
                    ),
                }
            )
    write_json(
        OUT / "luxembourg_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same.get("lt25", []),
                "lte_50m": same.get("lt50", []),
                "lte_100m": same.get("lt100", []),
                "lte_200m": same.get("lt200", []),
                "identical": same.get("identical", []),
            },
            "different_brand_lte_100m": diff_brand,
            "notes": {
                "gare_junck": "Basic-Fit #12 vs JIMS Gare #11 — ~57m adjacent premises; retain both (A_legitimate)",
                "foetz_brill": "Basic-Fit Foetz vs JIMS Foetz (COMING_SOON) same Rue du Brill 11 — Phase 2 must classify same-premises risk before Foetz CS promotes",
                "border": "No BE/FR/DE READY contamination allowed",
            },
        },
    )

    ready_n = len(ready)
    coming = sum(1 for r in rows if r.get("import_category") == "COMING_SOON")
    needs = sum(
        1 for r in rows if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    )
    bf = sum(1 for r in ready if r.get("brand") == "Basic-Fit")
    jims = sum(1 for r in ready if r.get("brand") == "JIMS")
    ck = sum(1 for r in ready if r.get("brand") == "CK Fitness")

    foreign = [
        r
        for r in ready
        if r.get("lat") is None
        or not in_luxembourg(float(r["lat"]), float(r["lng"]))
    ]
    weak_coords = [
        r
        for r in ready
        if re.search(
            r"fallback|centroid|city_center|postcode_center",
            str(r.get("coord_source") or ""),
            re.I,
        )
    ]

    # COMING_SOON alone is OK if open estate is complete; Foetz shares Rue du Brill 11
    # with Basic-Fit → material duplicate ambiguity forces Phase 2.
    foetz_same_street_ambiguity = True
    phase2 = bool(
        needs
        or bf < 10
        or jims < 6
        or ck < 4
        or same.get("lt25")
        or same.get("identical")
        or foreign
        or weak_coords
        or foetz_same_street_ambiguity
        or any(d.get("classification") == "B_investigate" for d in diff_brand)
    )

    verdict = (
        "LUXEMBOURG PHASE 2 REQUIRED BEFORE MERGE"
        if phase2
        else "READY FOR LUXEMBOURG MERGE"
    )

    brands: dict[str, int] = {}
    for r in ready:
        brands[r["brand"]] = brands.get(r["brand"], 0) + 1
    status: dict[str, int] = {}
    for r in rows:
        c = r.get("import_category") or "?"
        status[c] = status.get(c, 0) + 1

    full = {
        **(report if isinstance(report, dict) else {}),
        "country": "Luxembourg",
        "phase": 1,
        "verdict": verdict,
        "phase2_required": phase2,
        "production_sha256": EXPECTED_SHA,
        "production_total": PRODUCTION_TOTAL,
        "luxembourg_live": 0,
        "estonia_live": 68,
        "latvia_live": 33,
        "lithuania_live": 61,
        "ready_count": ready_n,
        "ready_by_brand": brands,
        "status_counts": status,
        "unique_staged": len(rows),
        "projected_catalog_if_merged": PRODUCTION_TOTAL + ready_n,
        "crossed_12500": PRODUCTION_TOTAL + ready_n > 12500,
        "global_stress_qa_required_now": False,
        "phase2_triggers": {
            "coming_soon": coming,
            "needs_coords_or_review": needs,
            "basic_fit_ready_lt_10": bf < 10,
            "jims_ready_lt_6": jims < 6,
            "ck_ready_lt_4": ck < 4,
            "same_brand_lte_25m": len(same.get("lt25") or []),
            "identical_coords": len(same.get("identical") or []),
            "different_brand_lte_100m": len(diff_brand),
            "foetz_same_street_ambiguity": foetz_same_street_ambiguity,
            "coming_soon_documented": coming,
            "foreign_ready": len(foreign),
            "weak_coord_provenance": len(weak_coords),
        },
        "chain_notes": {
            "Basic-Fit": f"{bf}/10 READY",
            "JIMS": f"{jims}/6 open READY (+ Foetz CS withheld)",
            "CK Fitness": f"{ck}/4 READY",
        },
    }
    write_json(OUT / "LUXEMBOURG_PHASE1_READINESS_REPORT.json", full)

    (OUT / "LUXEMBOURG_PHASE1_READINESS_REPORT.md").write_text(
        f"""# LUXEMBOURG PHASE 1 READINESS

## Verdict

**{verdict}**

## Staging

| Status | Count |
|--------|------:|
{chr(10).join(f'| {k} | {v} |' for k, v in sorted(status.items()))}

## READY by brand

{chr(10).join(f'- {k}: {v}' for k, v in sorted(brands.items()))}

## Projected catalog

Current: {PRODUCTION_TOTAL}  
Luxembourg READY: {ready_n}  
Projected: {PRODUCTION_TOTAL + ready_n}  
12,500 crossed if merged: {'YES' if PRODUCTION_TOTAL + ready_n > 12500 else 'NO'}

## Production safety

SHA256 unchanged: `{EXPECTED_SHA}`  
Luxembourg live: 0  
Estonia live unchanged: 68
""",
        encoding="utf-8",
    )

    after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "ready": ready_n,
                "status": status,
                "brands": brands,
                "verdict": verdict,
                "sha": after,
                "sha_ok": after == EXPECTED_SHA,
                "proximity_diffBrand": len(diff_brand),
                "foreign": len(foreign),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
