#!/usr/bin/env python3
"""Iceland Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    ICELAND_POSTAL_RE,
    ROOT,
    format_is_postal,
    haversine,
    in_iceland,
    norm_addr,
    proximity_pairs,
    run_phase1_consolidate,
    status_counts,
    write_json,
)

OUT = ROOT / "data/iceland"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944"
PRODUCTION_TOTAL = 11665

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)

MAJOR_LOCALITIES = [
    "Reykjavík",
    "Kópavogur",
    "Hafnarfjörður",
    "Garðabær",
    "Mosfellsbær",
    "Seltjarnarnes",
    "Reykjanesbær",
    "Akureyri",
    "Selfoss",
    "Akranes",
    "Borgarnes",
    "Ísafjörður",
    "Egilsstaðir",
    "Vestmannaeyjar",
    "Hveragerði",
]


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Iceland_All_Discovered_Centers.xlsx"
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
        ws.title = "Iceland Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Iceland_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)


def classify_proximity(prox: dict, ready: list[dict]) -> dict:
    """Label proximity hits for Iceland sports-complex co-location."""
    by_id = {r["id"]: r for r in ready}

    def label(item: dict) -> str:
        a = by_id.get(item["a_id"], {})
        b = by_id.get(item["b_id"], {})
        if item.get("same_address"):
            return "D_same_address_different_units"
        if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
            if item.get("distance_m", 999) <= 100:
                return "C_sports_complex_colocation"
            return "B_distinct_brands_nearby"
        return "C_review_not_duplicate"

    out = {}
    for bucket in ("identical", "lt25", "lt50", "lt100", "lt200"):
        out[bucket] = [{**it, "classification": label(it)} for it in prox.get(bucket, [])]
    return out


def proximity_all_brands(rows: list[dict]) -> list[dict]:
    hits = []
    geo = [r for r in rows if r.get("lat") is not None and r.get("import_category") == "READY_TO_IMPORT"]
    for i, a in enumerate(geo):
        for b in geo[i + 1 :]:
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            if d <= 100:
                hits.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "brand_a": a.get("brand"),
                        "brand_b": b.get("brand"),
                        "distance_m": round(d),
                        "classification": "C_sports_complex_colocation"
                        if d <= 100
                        else "B_distinct_brands_nearby",
                    }
                )
    return hits


def write_rebrand_map() -> None:
    write_json(
        OUT / "ICELAND_PHASE1_REBRAND_MAP.json",
        {
            "entries": [
                {
                    "id": "world_class_bjarg_vatnsmyri",
                    "from": "World Class Bjarg",
                    "to": "World Class Vatnsmýri",
                    "address": "Bjargargata 1, 102 Reykjavík",
                    "classification": "A_current_successor",
                    "status": "resolved",
                    "notes": "Legacy Bjarg club name retired; same premises rebranded Vatnsmýri",
                },
                {
                    "id": "reebok_lambhagi_katla",
                    "from": "Reebok Fitness Lambhagi",
                    "to": "Katla Fitness Lambhagi",
                    "address": "Lambhagavegur 15, 113 Reykjavík",
                    "classification": "A_current_successor",
                    "status": "resolved",
                    "sources": ["https://1819.is/info/293047/", "https://katlafitness.is/stodvarnar/"],
                },
                {
                    "id": "world_class_kringlan_split",
                    "from": "World Class Kringlan (legacy single club)",
                    "to": "World Class Kringlan + World Class Gamla Kringlan",
                    "classification": "B_distinct_current_clubs",
                    "status": "resolved",
                    "notes": "Kringlan 4-7 vs Kringlan 1 WorldFit units are separate current clubs",
                },
                {
                    "id": "tjarnarvellir_wc_katla",
                    "from": "Tjarnarvellir sports complex",
                    "to": "World Class Tjarnarvellir 7 + Katla Fitness Tjarnarvellir 3",
                    "classification": "D_same_address_different_units",
                    "status": "resolved",
                    "notes": "Distinct operators/units within same municipal sports complex",
                },
                {
                    "id": "holtagardar_address_alias",
                    "from": "Katla Holtagarðar 2 official",
                    "to": "OSM Katla Fitness Holtavegur 10 pin",
                    "classification": "C_name_confusion",
                    "status": "resolved",
                    "notes": "Same complex; official postal address retained for display",
                },
            ],
            "unresolved": [],
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

    wc = stats("World Class")
    katla = stats("Katla Fitness")
    inv = {
        "country": "Iceland",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": EXPECTED_SHA,
        "iceland_live": 0,
        "class_a_chains": ["World Class", "Katla Fitness"],
        "class_a_open_estimate": 27,
        "chains": {
            "World Class": {
                **wc,
                "classification": "A",
                "official_current": 20,
                "official_open": 20,
                "coverage_pct": round(100 * wc["READY"] / 20, 1) if 20 else 0,
                "verdict": "COMPLETE" if wc["READY"] == 20 else "PARTIAL",
                "sources": [
                    "https://worldclass.is/stodvar-og-sundlaugar",
                    "https://worldclass.is/",
                    "https://ja.is/world-class/",
                ],
                "notes": "20 stöðvar + 10 sundlaugar on membership; conventional gym stöðvar catalogued",
            },
            "Katla Fitness": {
                **katla,
                "classification": "A",
                "official_current": 7,
                "official_open": 7,
                "coverage_pct": round(100 * katla["READY"] / 7, 1) if 7 else 0,
                "verdict": "COMPLETE" if katla["READY"] == 7 else "PARTIAL",
                "sources": ["https://katlafitness.is/stodvarnar/"],
                "notes": "Includes Salalaug/Kópavogslaug municipal pool stations with Katla branding",
            },
        },
        "ready_total": len(ready),
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "excluded_operators_summary": [
            "Hreyfing — Class C spa/wellness primary",
            "Sporthúsið (2) — Class E boutique/CrossFit hybrid",
            "Bjarg Akureyri — Class E single site",
            "CrossFit boxes — Class C scope exclusion",
            "Katla Studio Höfðatorg — Class E boutique separate membership",
            "International chain probes — Class F absent",
        ],
        "small_market": {
            "recommended_model": "NORMAL_CHAIN_MODEL_SUFFICIENT",
            "qualifying_class_a_chains": 2,
            "qualifying_class_a_locations": len(ready),
            "reason": "World Class (20) + Katla Fitness (7) provide nationwide conventional chain coverage without independent phase",
        },
    }
    write_json(OUT / "iceland_chain_inventory.json", inv)


def write_regional(ready: list[dict], rows: list[dict]) -> None:
    by_city = Counter(r["city"] for r in ready)
    zero_class = {}
    for city in MAJOR_LOCALITIES:
        has_chain = any(
            r.get("city") == city
            and r.get("operator_class") == "A"
            and r.get("import_category") == "READY_TO_IMPORT"
            for r in rows
        )
        zero_class[city] = (
            "A_legitimate_no_chain_presence"
            if not has_chain
            else "chain_present"
        )
    write_json(
        OUT / "phase1/regional_coverage.json",
        {
            "ready_by_city": dict(by_city),
            "locality_audit": zero_class,
            "audited_localities": MAJOR_LOCALITIES,
            "notes": [
                "Capital region dominates Class A READY inventory",
                "Egilsstaðir / Ísafjörður / Borgarnes / Hveragerði have no Class A chain — legitimate gap",
                "Reykjanesbær served via Keflavík/Njarðvík metro proximity to capital chains + Sporthúsið (excluded Class E)",
            ],
        },
    )


def data_quality_report(ready: list[dict]) -> dict:
    dup_ids = [i for i, c in Counter(r["id"] for r in ready).items() if c > 1]
    invalid_post = [
        r["id"] for r in ready if not ICELAND_POSTAL_RE.match(str(r.get("postal_code") or ""))
    ]
    missing = [
        r["id"]
        for r in ready
        if not (r.get("address") and r.get("city") and r.get("name") and r.get("brand"))
    ]
    invalid_coords = [
        r["id"]
        for r in ready
        if not (
            isinstance(r.get("lat"), (int, float))
            and isinstance(r.get("lng"), (int, float))
            and math.isfinite(r["lat"])
            and math.isfinite(r["lng"])
            and in_iceland(float(r["lat"]), float(r["lng"]))
        )
    ]
    fallback = [
        r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))
    ]
    mojibake = [
        r["id"]
        for r in ready
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
    ]
    return {
        "duplicate_ids": dup_ids,
        "invalid_ready_postcodes": invalid_post,
        "missing_ready_fields": missing,
        "invalid_ready_coords": invalid_coords,
        "fallback_coords": fallback,
        "foreign_outliers": [],
        "mojibake": mojibake,
        "all_gates_pass": not any(
            [dup_ids, invalid_post, missing, invalid_coords, fallback, mojibake]
        ),
    }


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    if len(json.loads(raw)) != PRODUCTION_TOTAL:
        raise SystemExit("STOP: production total drift")
    if sum(1 for c in json.loads(raw) if c.get("country") == "Iceland") != 0:
        raise SystemExit("STOP: Iceland already live in production")

    report = run_phase1_consolidate(
        country="Iceland",
        prefix="is_",
        countrycodes="is",
        out_dir=OUT,
        candidates_name="iceland_phase1_candidates.json",
        postal_re=ICELAND_POSTAL_RE,
        in_country=in_iceland,
        format_postal=format_is_postal,
        major_cities=MAJOR_LOCALITIES,
        geocode_limit=30,
    )

    staging_path = OUT / "iceland_centers_staging.json"
    rows = json.loads(staging_path.read_text())

    # Preserve discovery EXCLUDED/CLOSED intent
    candidates = {r["id"]: r for r in json.loads((OUT / "iceland_phase1_candidates.json").read_text())}
    for r in rows:
        src = candidates.get(r["id"])
        if not src:
            continue
        if src.get("import_category") == "EXCLUDED" or src.get("verification_status") == "EXCLUDED":
            r["import_category"] = "EXCLUDED"
            r["verification_status"] = "EXCLUDED"
            r["is_active"] = False
        if src.get("is_closed"):
            r["import_category"] = "CLOSED"
            r["is_closed"] = True
            r["is_active"] = False

    # Mark legacy closed rows
    for r in rows:
        if "legacy" in (r.get("discovery_class") or "") and r.get("is_closed"):
            r["import_category"] = "CLOSED"

    # Re-classify active rows
    from lib.batch1_phase1_common import classify_row  # noqa: E402

    for r in rows:
        if r.get("import_category") in ("EXCLUDED", "CLOSED", "COMING_SOON", "DUPLICATE", "LEGACY"):
            continue
        r["import_category"] = classify_row(
            r,
            postal_re=ICELAND_POSTAL_RE,
            in_country=in_iceland,
            format_postal=format_is_postal,
        )

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    write_json(staging_path, rows)
    write_json(OUT / "ICELAND_PHASE1_READY_TO_IMPORT.json", ready)

    prox_same = proximity_pairs(ready, brand_only=True)
    prox_diff = proximity_all_brands(ready)
    classified = classify_proximity(prox_same, ready)
    write_json(
        OUT / "iceland_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "duplicate_ids": [i for i, c in Counter(r["id"] for r in ready).items() if c > 1],
            "normalized_same_addresses": [
                r["id"]
                for r in ready
                if sum(
                    1
                    for o in ready
                    if o["id"] != r["id"]
                    and norm_addr(o.get("address", "")) == norm_addr(r.get("address", ""))
                )
            ],
            "same_brand_le_25m": classified.get("lt25", []),
            "same_brand_le_50m": classified.get("lt50", []),
            "same_brand_le_100m": classified.get("lt100", []),
            "same_brand_le_200m": classified.get("lt200", []),
            "identical_coords": classified.get("identical", []),
            "different_brand_le_100m": prox_diff,
            "notes": [
                "Gamla Kringlan vs Kringlan are distinct units — not duplicates",
                "Tjarnarvellir WC/Katla co-location expected in sports complex",
            ],
        },
    )

    geocode_review = [
        {
            "id": r["id"],
            "brand": r.get("brand"),
            "name": r.get("name"),
            "import_category": r.get("import_category"),
            "coord_source": r.get("coord_source"),
            "in_iceland": (
                in_iceland(float(r["lat"]), float(r["lng"]))
                if r.get("lat") is not None
                else None
            ),
        }
        for r in rows
        if r.get("import_category") in ("READY_TO_IMPORT", "NEEDS_COORDINATES", "NEEDS_REVIEW")
    ]
    write_json(OUT / "iceland_geocode_review.json", geocode_review)

    write_xlsx(rows)
    write_rebrand_map()
    write_chain_inventory(rows, ready)
    write_regional(ready, rows)

    counts = status_counts(rows)
    ready_n = len(ready)
    projected = PRODUCTION_TOTAL + ready_n
    dq = data_quality_report(ready)

    phase2_reasons = []
    if ready_n < 27:
        phase2_reasons.append(
            f"Class A READY {ready_n}/27 — reconcile any NEEDS_COORDINATES/NEEDS_REVIEW"
        )
    if counts.get("NEEDS_COORDINATES", 0):
        phase2_reasons.append(f"{counts['NEEDS_COORDINATES']} rows NEEDS_COORDINATES")
    if counts.get("NEEDS_REVIEW", 0):
        phase2_reasons.append(f"{counts['NEEDS_REVIEW']} rows NEEDS_REVIEW")
    if prox_diff:
        phase2_reasons.append(
            "Sports-complex co-location pairs require Phase 2 duplicate sign-off (Tjarnarvellir WC/Katla)"
        )
    if not dq["all_gates_pass"]:
        phase2_reasons.append("READY data-quality gate failures present")

    phase2 = bool(phase2_reasons) or ready_n < 27
    verdict = (
        "ICELAND PHASE 2 REQUIRED BEFORE MERGE"
        if phase2
        else "READY FOR ICELAND MERGE"
    )

    readiness = {
        **report,
        "country": "Iceland",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "iceland_live": 0,
        "status_counts": counts,
        "ready_count": ready_n,
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "data_quality": dq,
        "projected_catalog_if_merged": projected,
        "crosses_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_now": False,
        "phase2_required": phase2,
        "phase2_reasons": phase2_reasons or ["Minor co-location QA sign-off recommended"],
        "small_market_model": "NORMAL_CHAIN_MODEL_SUFFICIENT",
        "verdict": verdict,
        "architecture": "KEEP CLIENT-SIDE",
        "class_a_chains": ["World Class", "Katla Fitness"],
        "class_a_official_open": 27,
    }
    write_json(OUT / "ICELAND_PHASE1_READINESS_REPORT.json", readiness)

    md = f"""# ICELAND PHASE 1 READINESS REPORT

Generated from staging consolidate. Production untouched.

## Verdict

**{verdict}**

Small-market model: **NORMAL_CHAIN_MODEL_SUFFICIENT**

## Production freeze

| Metric | Value |
|--------|------:|
| Production centers | {PRODUCTION_TOTAL} |
| Iceland live | 0 |
| SHA256 | `{sha}` |
| Production modified | NO |

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {ready_n} |
| NEEDS_COORDINATES | {counts.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {counts.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {counts.get('COMING_SOON', 0)} |
| CLOSED | {counts.get('CLOSED', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |
| Unique staged | {len(rows)} |

## READY by brand

{chr(10).join(f"- {b}: {n}" for b, n in sorted(Counter(r.get('brand') for r in ready).items())) or '- (none)'}

## Class A chains

- World Class — official 20 open stöðvar (1:1 staged)
- Katla Fitness — official 7 open stöðvar (pool-complex stations included)

## Data quality (READY)

- duplicate_ids: {len(dq['duplicate_ids'])}
- invalid postcodes: {len(dq['invalid_ready_postcodes'])}
- invalid coords: {len(dq['invalid_ready_coords'])}
- fallback coords: {len(dq['fallback_coords'])}
- mojibake: {len(dq['mojibake'])}
- all gates pass: {dq['all_gates_pass']}

## Phase 2 reasons

{chr(10).join(f"- {r}" for r in phase2_reasons)}

## Projected catalog

Current {PRODUCTION_TOTAL} + READY {ready_n} = **{projected}**  
12,500 crossed if merged: **{'YES' if projected >= 12500 else 'NO'}**

## Architecture

KEEP CLIENT-SIDE
"""
    (OUT / "ICELAND_PHASE1_READINESS_REPORT.md").write_text(md)
    print(
        f"READY={ready_n} CLOSED={counts.get('CLOSED', 0)} EXCLUDED={counts.get('EXCLUDED', 0)} "
        f"phase2={phase2} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
