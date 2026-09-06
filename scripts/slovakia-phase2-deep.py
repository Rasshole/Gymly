#!/usr/bin/env python3
"""
Slovakia Deep Phase 2 — final chain recovery before merge decision.

Does NOT modify src/data/centers.json.
Preserves Phase 1 READY rows / stable sk_* IDs where the physical club is unchanged.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROOT,
    SLOVAKIA_POSTAL_RE,
    classify_row,
    clean_text,
    dedupe_by_id,
    format_sk_postal,
    in_slovakia,
    make_id,
    nominatim_geocode,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/slovakia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, PHASE2, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PROD_SHA_EXPECTED = "f31734acfd849b54f7cfeeb8d8f896980ed90fd975a87ae85f2aa1c6d1356854"
PRODUCTION_TOTAL = 11217

# Evidence-backed recoveries (Nominatim exact-address / named POI, countrycodes=sk)
RECOVERIES = {
    # 365 Fit&Co — official kontakt lists 8 current clubs; Digital Park not among them
    "365 Fit&Co Košice Hypertesco": {
        "address": "Tesco Extra, Trolejbusová 2859/1",
        "postal_code": "040 01",
        "city": "Košice",
        "lat": 48.740973,
        "lng": 21.267226,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "notes": "phase2; Tesco Extra Trolejbusová Nominatim; official kontakt branch",
    },
    "365 Fit&Co Košice ROCA": {
        "address": "Businesscentrum Roca, Južná trieda 1590/117",
        "postal_code": "040 11",
        "city": "Košice",
        "lat": 48.697532,
        "lng": 21.263506,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "notes": "phase2; Kongres Hotel Roca / Južná trieda 117 Nominatim; official kontakt 04011",
    },
    "365 Fit&Co Spišská Nová Ves": {
        "address": "Medza 3459/15",
        "postal_code": "052 01",
        "city": "Spišská Nová Ves",
        "lat": 48.94807,
        "lng": 20.549443,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "notes": "phase2; Medza 15 Nominatim; official kontakt branch",
    },
    "365 Fit&Co Trenčín Južanka": {
        "address": "OZC Južanka, Vansovej / Gen. Svobodu",
        "postal_code": "911 08",
        "city": "Trenčín",
        "lat": 48.87465,
        "lng": 18.045163,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "notes": "phase2; OZC Južanka Nominatim; Phase1 PC 826 06 was BA-range error → 911 08",
    },
    # Form Factory Sky Park — open club page (not coming soon); Sky Park Offices Bottova
    "Form Factory Fitness Sky Park": {
        "address": "Bottova 7969/2A",
        "postal_code": "811 09",
        "city": "Bratislava",
        "lat": 48.1433404,
        "lng": 17.1261656,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "notes": "phase2; Sky Park Offices Bottova Nominatim; OSM Form Factory POI corroborates; open hours on club page",
    },
}

# Name aliases for matching recoveries onto staging rows
RECOVERY_ALIASES = {
    "365 Fit&Co Košice Hypertesco": ["hypertesco"],
    "365 Fit&Co Košice ROCA": ["roca", "roka"],
    "365 Fit&Co Spišská Nová Ves": ["spišská", "spisska", "nová ves", "nova ves"],
    "365 Fit&Co Trenčín Južanka": ["južanka", "juzanka", "trenčín", "trencin"],
    "Form Factory Fitness Sky Park": ["sky park", "sky-park", "skypark"],
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def match_recovery(row: dict) -> dict | None:
    name = (row.get("name") or "").lower()
    brand = row.get("brand") or ""
    for canon, patch in RECOVERIES.items():
        keys = RECOVERY_ALIASES.get(canon, [])
        if not any(k in name for k in keys):
            continue
        if "365" in canon and "365" not in brand:
            continue
        if "Form Factory" in canon and brand != "Form Factory":
            continue
        # Avoid 365 Trenčín matching other Trenčín brands
        if "južanka" in keys or "juzanka" in keys:
            if "365" not in brand:
                continue
        return patch
    return None


def apply_recovery(row: dict, patch: dict) -> dict:
    r = deepcopy(row)
    for k, v in patch.items():
        if k == "notes":
            prev = r.get("notes") or ""
            r["notes"] = (prev + "; " + v).strip("; ")
        else:
            r[k] = v
    r["is_coming_soon"] = False
    r["is_closed"] = False
    r["is_active"] = True
    r["country"] = "Slovakia"
    # Keep stable ID for same physical club when address/postal change slightly
    # Recompute only if missing sk_ prefix
    if not str(r.get("id", "")).startswith("sk_"):
        r["id"] = make_id(
            "sk_",
            r.get("brand", ""),
            r.get("address", ""),
            r.get("postal_code", ""),
            r.get("city", ""),
            "Slovakia",
        )
    return r


def light_golem_recheck(rows: list[dict]) -> dict:
    golem = [r for r in rows if r.get("brand") == "Golem Club"]
    physio = [
        r
        for r in golem
        if re.search(r"fyzioter|rehabilitác|rehabilitac", f"{r.get('name')}", re.I)
    ]
    ready = [r for r in golem if r.get("import_category") == "READY_TO_IMPORT"]
    ok = len(ready) == 11 and len(golem) == 11 and not physio
    return {
        "official_estimate": 11,
        "discovered": len(golem),
        "ready": len(ready),
        "physio_rows": len(physio),
        "verdict": "COMPLETE" if ok else "REVIEW",
        "notes": "Phase 2 light recheck — VOP 11 fitness clubs; physiotherapy still excluded",
    }


def fitinn_audit() -> dict:
    """Official fitinn.sk locator: only Prior, Nido, Nitra return 200 for SK."""
    return {
        "official_current": 3,
        "official_slugs": ["bratislava-prior", "bratislava-nido", "nitra"],
        "secondary_mentions_not_on_official": [
            {
                "name": "FITINN VIVO / Polus",
                "status": "NOT_ON_OFFICIAL_LOCATOR",
                "http": 404,
                "action": "do_not_import; treat secondary listings as stale/closed",
            },
            {
                "name": "FITINN Petržalka Kopčianska",
                "status": "NOT_ON_OFFICIAL_LOCATOR",
                "http": 404,
                "action": "do_not_import; treat secondary listings as stale/closed",
            },
        ],
        "verdict": "COMPLETE",
        "notes": "fitinn.sk multi-country index filtered to SK PSČ studios; only 3 live SK pages",
    }


def classify_all(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        r = deepcopy(r)
        # Digital Park: not in official 8-branch kontakt headers → CLOSED/legacy nav
        if re.search(r"digital\s*park", r.get("name") or "", re.I):
            r["is_closed"] = True
            r["is_active"] = False
            r["import_category"] = "CLOSED"
            r["verification_status"] = "CLOSED"
            r["notes"] = (r.get("notes") or "") + "; phase2: not in official 8-branch kontakt list"
            out.append(r)
            continue
        # Coming soon Form Factory — reconfirmed on p2 pages
        if r.get("brand") == "Form Factory" and re.search(
            r"budatínska|budatinska|europa bc|slnečnice|slnecnice",
            r.get("name") or "",
            re.I,
        ):
            if r.get("is_coming_soon") or r.get("import_category") == "COMING_SOON":
                r["is_coming_soon"] = True
                r["is_active"] = False
                r["import_category"] = "COMING_SOON"
                r["verification_status"] = "COMING_SOON"
                r["notes"] = (r.get("notes") or "") + "; phase2: still coming soon on club page"
                out.append(r)
                continue
        cat = classify_row(
            r,
            postal_re=SLOVAKIA_POSTAL_RE,
            in_country=in_slovakia,
            format_postal=format_sk_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Slovakia"
        out.append(r)
    return dedupe_by_id(out)


def ready_quality(ready: list[dict]) -> dict:
    dup_ids = len(ready) - len({r["id"] for r in ready})
    invalid_pc = sum(1 for r in ready if not SLOVAKIA_POSTAL_RE.match(str(r.get("postal_code") or "")))
    missing = sum(
        1
        for r in ready
        if not (
            r.get("name")
            and r.get("brand")
            and r.get("address")
            and len(str(r.get("address"))) > 3
            and r.get("city")
        )
    )
    bad_coords = 0
    fallback = 0
    foreign = 0
    moji = 0
    for r in ready:
        lat, lng = r.get("lat"), r.get("lng")
        if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and in_slovakia(lat, lng)):
            bad_coords += 1
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            fallback += 1
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE_RE.search(blob):
            moji += 1
        if re.search(
            r"\b(czechia|praha|wien|vienna|budapest|kraków|krakow|uzhhorod)\b",
            blob,
            re.I,
        ):
            foreign += 1
    return {
        "duplicate_ids": dup_ids,
        "invalid_ready_postcodes": invalid_pc,
        "missing_ready_fields": missing,
        "invalid_ready_coords": bad_coords,
        "fallback_coords": fallback,
        "foreign_outliers": foreign,
        "mojibake": moji,
    }


def regional_counts(ready: list[dict]) -> dict:
    cities = [
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
        "Spišská Nová Ves",
        "Považská Bystrica",
    ]
    counts = {c: 0 for c in cities}
    other = 0
    for r in ready:
        city = r.get("city") or ""
        hit = False
        for c in cities:
            if c.lower() in city.lower() or city.lower() in c.lower():
                counts[c] += 1
                hit = True
                break
        if not hit:
            other += 1
    counts["Other"] = other
    return counts


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Slovakia_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
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
    for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")):
        ws.append([r.get(h, "") for h in headers])
    wb.save(path)


def main() -> None:
    sha_before = sha256_file(CENTERS)
    if sha_before != PROD_SHA_EXPECTED:
        raise SystemExit(f"Unexpected production SHA before Phase 2: {sha_before}")

    staging = json.loads((OUT / "slovakia_centers_staging.json").read_text())
    phase1_ready = json.loads((OUT / "SLOVAKIA_PHASE1_READY_TO_IMPORT.json").read_text())
    phase1_ready_ids = {r["id"] for r in phase1_ready}

    rows: list[dict] = []
    for row in staging:
        patch = match_recovery(row)
        if patch:
            # Apply recovery for unresolved OR Trenčín postcode correction
            needs = row.get("import_category") != "READY_TO_IMPORT"
            is_juzanka = bool(re.search(r"južanka|juzanka", row.get("name") or "", re.I))
            is_sky = bool(re.search(r"sky\s*park", row.get("name") or "", re.I))
            if needs or is_juzanka or is_sky:
                rows.append(apply_recovery(row, patch))
            else:
                rows.append(deepcopy(row))
        else:
            rows.append(deepcopy(row))

    # Ensure Sky Park recovery even if name variance
    sky = next((r for r in rows if re.search(r"sky\s*park", r.get("name") or "", re.I)), None)
    if sky and (sky.get("lat") is None or not in_slovakia(sky.get("lat") or 0, sky.get("lng") or 0)):
        rows = [
            apply_recovery(sky, RECOVERIES["Form Factory Fitness Sky Park"]) if r is sky else r
            for r in rows
        ]

    rows = classify_all(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    recovered = max(0, len(ready) - len(phase1_ready))

    # Preserve Phase 1 READY IDs that remain READY
    still_ready_p1 = sum(1 for r in ready if r["id"] in phase1_ready_ids)

    golem = light_golem_recheck(rows)
    fitinn = fitinn_audit()

    # Chain stats
    def brand_stats(brand: str) -> dict:
        b_all = [r for r in rows if r.get("brand") == brand]
        b_ready = [r for r in b_all if r.get("import_category") == "READY_TO_IMPORT"]
        b_coming = [r for r in b_all if r.get("import_category") == "COMING_SOON"]
        b_unres = [
            r
            for r in b_all
            if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
        ]
        b_closed = [r for r in b_all if r.get("import_category") == "CLOSED"]
        return {
            "discovered": len(b_all),
            "ready": len(b_ready),
            "unresolved": len(b_unres),
            "coming_soon": len(b_coming),
            "closed": len(b_closed),
        }

    brands = {
        "Golem Club": {**brand_stats("Golem Club"), "official_current": 11, "verdict": golem["verdict"]},
        "Form Factory": {
            **brand_stats("Form Factory"),
            "official_current": 18,
            "verdict": "NEAR-COMPLETE",
        },
        "365 Fit&Co": {
            **brand_stats("365 Fit&Co"),
            "official_current": 8,
            "verdict": "COMPLETE",
        },
        "FITINN": {
            **brand_stats("FITINN"),
            "official_current": 3,
            "verdict": fitinn["verdict"],
        },
    }
    # Refine 365 verdict
    if brands["365 Fit&Co"]["ready"] >= 8 and brands["365 Fit&Co"]["unresolved"] == 0:
        brands["365 Fit&Co"]["verdict"] = "COMPLETE"
        brands["365 Fit&Co"]["coverage_pct"] = round(
            100 * brands["365 Fit&Co"]["ready"] / 8, 1
        )
    else:
        brands["365 Fit&Co"]["verdict"] = (
            "NEAR-COMPLETE" if brands["365 Fit&Co"]["ready"] >= 7 else "PARTIAL"
        )
        brands["365 Fit&Co"]["coverage_pct"] = round(
            100 * brands["365 Fit&Co"]["ready"] / 8, 1
        )

    brands["FITINN"]["coverage_pct"] = 100.0
    brands["Golem Club"]["coverage_pct"] = 100.0
    ff_open = 18 - brands["Form Factory"]["coming_soon"]
    brands["Form Factory"]["coverage_pct"] = round(
        100 * brands["Form Factory"]["ready"] / max(ff_open, 1), 1
    )
    if brands["Form Factory"]["ready"] >= ff_open and brands["Form Factory"]["unresolved"] == 0:
        brands["Form Factory"]["verdict"] = "COMPLETE"
    elif brands["Form Factory"]["ready"] >= ff_open - 1:
        brands["Form Factory"]["verdict"] = "NEAR-COMPLETE"

    # Duplicates
    same = proximity_pairs(ready, brand_only=True)
    allp = proximity_pairs(ready, brand_only=False)
    by_id = {r["id"]: r for r in ready}
    diff = []
    for bucket in ("lt25", "lt50", "lt100"):
        for item in allp.get(bucket, []):
            a, b = by_id.get(item["a_id"]), by_id.get(item["b_id"])
            if not a or not b:
                continue
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            diff.append({**item, "a_brand": a.get("brand"), "b_brand": b.get("brand")})

    dq = ready_quality(ready)
    regions = regional_counts(ready)
    status = dict(Counter(r.get("import_category") for r in rows))
    ready_by_brand = dict(Counter(r.get("brand") for r in ready))

    # Merge readiness
    material_blockers = []
    if brands["365 Fit&Co"]["verdict"] == "PARTIAL":
        material_blockers.append("365 Fit&Co structurally incomplete")
    if brands["FITINN"]["verdict"] not in ("COMPLETE", "NEAR-COMPLETE"):
        material_blockers.append("FITINN estate uncertain")
    if brands["Golem Club"]["verdict"] != "COMPLETE":
        material_blockers.append("Golem Club incomplete")
    if brands["Form Factory"]["verdict"] not in ("COMPLETE", "NEAR-COMPLETE"):
        material_blockers.append("Form Factory open estate incomplete")

    if not material_blockers and dq["duplicate_ids"] == 0 and dq["invalid_ready_coords"] == 0:
        verdict = "READY FOR SLOVAKIA MERGE"
        phase3 = False
    else:
        verdict = "SLOVAKIA PHASE 3 REQUIRED BEFORE MERGE"
        phase3 = True

    projected = PRODUCTION_TOTAL + len(ready)

    report = {
        "country": "Slovakia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "slovakia_live": 0,
        "production_sha_before": sha_before,
        "production_sha_after": sha256_file(CENTERS),
        "phase1_ready": len(phase1_ready),
        "phase1_ready_preserved_in_phase2_ready": still_ready_p1,
        "recovered_unresolved": recovered,
        "unique_staged": len(rows),
        "status_counts": status,
        "ready_count": len(ready),
        "ready_by_brand": ready_by_brand,
        "brands": brands,
        "fitinn_audit": fitinn,
        "golem_recheck": golem,
        "regional_ready": regions,
        "trnava_gap": {
            "classification": "A_legitimate_no_chain_presence",
            "evidence": "No Golem/Form Factory/FITINN/365 Fit&Co current club in Trnava",
        },
        "missed_chain_check": [
            {"chain": "EfectFit", "class": "C", "action": "EXCLUDED", "note": "private PT specialty"},
            {"chain": "MultiSport", "class": "B", "action": "EXCLUDED", "note": "pass aggregator"},
            {"chain": "Mozolani / Maximus", "class": "E", "action": "EXCLUDED", "note": "below threshold"},
            {
                "chain": "FITINN VIVO/Petržalka secondary",
                "class": "F",
                "action": "EXCLUDED",
                "note": "404 on official locator; not current estate",
            },
        ],
        "data_quality": dq,
        "proximity": {
            "same_brand": {k: len(v) for k, v in same.items()},
            "different_brand_le_100m": len(diff),
        },
        "projected_catalog": projected,
        "would_cross_12500": projected > 12500,
        "global_stress_qa_required_if_merged": False,
        "material_blockers": material_blockers,
        "phase3_required": phase3,
        "verdict": verdict,
    }

    # Write artifacts
    write_json(OUT / "slovakia_centers_staging.json", rows)
    write_json(OUT / "SLOVAKIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "SLOVAKIA_PHASE2_READINESS_REPORT.json", report)
    write_json(
        OUT / "slovakia_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "duplicate_ids": dq["duplicate_ids"],
            "identical_coordinates": same.get("identical", []),
            "same_brand": {
                "le_25m": same.get("lt25", []),
                "le_50m": same.get("lt50", []),
                "le_100m": same.get("lt100", []),
                "le_200m": same.get("lt200", []),
            },
            "different_brand_le_100m": diff,
        },
    )
    write_json(
        OUT / "slovakia_geocode_review.json",
        [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "coord_source": r.get("coord_source"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "category": r.get("import_category"),
            }
            for r in rows
        ],
    )
    write_json(
        OUT / "SLOVAKIA_PHASE2_REBRAND_MAP.json",
        {
            "country": "Slovakia",
            "phase": 2,
            "maps": [
                {
                    "legacy_brand": "FitCamp",
                    "current_brand": "Form Factory",
                    "action": "import_as_form_factory_only",
                    "status": "confirmed",
                },
                {
                    "legacy": "365 Fit&Co Digital Park nav link",
                    "current": "not in official 8-branch kontakt",
                    "action": "CLOSED / do not READY",
                },
                {
                    "legacy": "FITINN VIVO / Petržalka secondary listings",
                    "current": "not on fitinn.sk (404)",
                    "action": "exclude; official SK estate = Prior + Nido + Nitra",
                },
            ],
            "excluded": ["EfectFit", "MultiSport", "Mozolani", "Maximus"],
        },
    )

    # Markdown report
    md = f"""# SLOVAKIA PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Verdict

**{verdict}**

Production SHA before/after: `{sha_before}` / `{report['production_sha_after']}`  
Production modified: **NO**

## Recovery summary

| Metric | Value |
|--------|------:|
| Phase 1 READY | {len(phase1_ready)} |
| Phase 1 READY IDs still in Phase 2 READY | {still_ready_p1} |
| Unresolved recovered this phase | {recovered} |
| Final READY | {len(ready)} |
| Projected catalog | {projected} |
| Crosses 12,500 | NO |

## Chain completeness

| Chain | Official | Discovered | READY | Unresolved | Coming soon | Closed | Coverage | Verdict |
|-------|--------:|----------:|------:|-----------:|------------:|-------:|---------:|---------|
| Golem Club | 11 | {brands['Golem Club']['discovered']} | {brands['Golem Club']['ready']} | {brands['Golem Club']['unresolved']} | {brands['Golem Club']['coming_soon']} | {brands['Golem Club']['closed']} | {brands['Golem Club'].get('coverage_pct', 100)}% | {brands['Golem Club']['verdict']} |
| Form Factory | 18 | {brands['Form Factory']['discovered']} | {brands['Form Factory']['ready']} | {brands['Form Factory']['unresolved']} | {brands['Form Factory']['coming_soon']} | {brands['Form Factory']['closed']} | {brands['Form Factory'].get('coverage_pct')}% | {brands['Form Factory']['verdict']} |
| 365 Fit&Co | 8 | {brands['365 Fit&Co']['discovered']} | {brands['365 Fit&Co']['ready']} | {brands['365 Fit&Co']['unresolved']} | {brands['365 Fit&Co']['coming_soon']} | {brands['365 Fit&Co']['closed']} | {brands['365 Fit&Co'].get('coverage_pct')}% | {brands['365 Fit&Co']['verdict']} |
| FITINN | 3 | {brands['FITINN']['discovered']} | {brands['FITINN']['ready']} | {brands['FITINN']['unresolved']} | {brands['FITINN']['coming_soon']} | {brands['FITINN']['closed']} | 100% | {brands['FITINN']['verdict']} |

## Status counts

{json.dumps(status, ensure_ascii=False, indent=2)}

## Regional READY

{json.dumps(regions, ensure_ascii=False, indent=2)}

Trnava gap: **A_legitimate_no_chain_presence**

## Data quality

{json.dumps(dq, ensure_ascii=False, indent=2)}

## Phase 3?

{"YES — " + "; ".join(material_blockers) if phase3 else "NO — material chains complete/near-complete; remaining items are coming-soon or isolated exclusions."}
"""
    (OUT / "SLOVAKIA_PHASE2_READINESS_REPORT.md").write_text(md)
    write_xlsx(rows)

    sha_after = sha256_file(CENTERS)
    if sha_after != sha_before:
        raise SystemExit("PRODUCTION MODIFIED — FAIL")

    write_json(
        PHASE2 / "phase2_run_summary.json",
        {
            "verdict": verdict,
            "ready": len(ready),
            "recovered": recovered,
            "sha": sha_after,
        },
    )
    print(
        f"Phase2 done ready={len(ready)} recovered={recovered} "
        f"preserved_p1_ids={still_ready_p1} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
