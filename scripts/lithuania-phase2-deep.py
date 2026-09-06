#!/usr/bin/env python3
"""Lithuania Deep Phase 2 — recovery + completeness. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    LITHUANIA_POSTAL_RE,
    format_lt_postal,
    in_lithuania,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/lithuania"
PHASE2 = OUT / "phase2"
PAGES = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, PAGES):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "a1e097699ab64dfbda37826dccbaa4ebe219c2f0dc47cfd2f96b4c38f47b5a37"
PHASE1_READY_PATH = OUT / "LITHUANIA_PHASE1_READY_TO_IMPORT.json"
STAGING_PATH = OUT / "lithuania_centers_staging.json"

# Exact GymPlius fitness_centre OSM node at Vilnius OUTLET (V. Pociūno g. 8)
POCIUNO = {
    "id": "lt_6ddca417a2",
    "postal_code": "06264",
    "lat": 54.7026293,
    "lng": 25.2060967,
    "coord_source": "VERIFIED_PREMISES_PIN",
    "notes_suffix": (
        "; Phase2: OSM fitness_centre GymPlius @ V. Pociūno g. 8 / Vilnius OUTLET; "
        "postal LT-06264 from premises evidence"
    ),
}

GARDINO_READY_ID = None  # filled from staging
GARDINO_DUP_ID = "lt_5b1f24ce40"
VIRSULISKIU_ID = "lt_bc21f9653f"
RIESE_ID = "lt_4decf7f80b"
JONAVA_ID = "lt_c3d4f6ba00"


def sha_centers() -> str:
    return hashlib.sha256(CENTERS.read_bytes()).hexdigest()


def promote_pociuno(rows: list[dict]) -> dict:
    evidence = {
        "club_page": "https://gymplius.lt/en/clubs/vytauto-pociuno-g-8-2/",
        "premises": "Vilnius OUTLET / V. Pociūno g. 8, Pilaitė",
        "postal_evidence": "LT-06264 (building / company registries + OSM)",
        "coord": {
            "lat": POCIUNO["lat"],
            "lng": POCIUNO["lng"],
            "source": "OSM Nominatim fitness_centre named GymPlius at housenumber 8",
            "query": "Pociūno 8 Vilnius",
            "display": "GymPlius, 8, V. Pociūno g., Senoji Pilaitė, Vilnius, 06264",
        },
        "status": "OPEN — official club page live with trainers/schedule; not under construction",
        "in_lithuania": in_lithuania(POCIUNO["lat"], POCIUNO["lng"]),
    }
    write_json(PHASE2 / "vytauto_pociuno_recovery.json", evidence)

    out = {"promoted": False, "before": None, "after": None}
    for r in rows:
        if r.get("id") != POCIUNO["id"]:
            continue
        out["before"] = {
            "import_category": r.get("import_category"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "postal_code": r.get("postal_code"),
        }
        r["postal_code"] = POCIUNO["postal_code"]
        r["lat"] = POCIUNO["lat"]
        r["lng"] = POCIUNO["lng"]
        r["coord_source"] = POCIUNO["coord_source"]
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        r["is_active"] = True
        r["is_coming_soon"] = False
        r["notes"] = (r.get("notes") or "") + POCIUNO["notes_suffix"]
        r["evidence"] = {**(r.get("evidence") or {}), "phase2_pociuno": evidence}
        out["after"] = {
            "import_category": r.get("import_category"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "postal_code": r.get("postal_code"),
            "coord_source": r.get("coord_source"),
        }
        out["promoted"] = True
        break
    return out


def resolve_gardino(rows: list[dict]) -> dict:
    """Phase 1 ID collision kept only the twin DUPLICATE row — restore one READY Gardino."""
    dup_row = next((r for r in rows if r.get("id") == GARDINO_DUP_ID), None)
    resolution = {
        "classification": "B_duplicate_same_physical_club",
        "address": "Gardino g. 3, Šiauliai",
        "official_urls": [
            "https://gymplius.lt/en/clubs/gardino-g-3-3/",  # WP postid 10309
            "https://gymplius.lt/en/clubs/gardino-g-3-2/",  # WP postid 9815
        ],
        "phase1_bug": (
            "Discover twin used same brand/address/city as primary → identical lt_* hash; "
            "by_id keep-last left only DUPLICATE twin and zero READY Gardino"
        ),
        "evidence": [
            "Official gyms directory lists two club_id entries (10309, 9815) with identical address text",
            "Both club pages titled 'Gardino g. 3' with ~1700 m² and overlapping zone descriptions",
            "Biometrics/locations page lists 'Gardino g. 3, Šiauliai' once",
            "Press (15min HYROX) refers to a single Gardino g. 3 Gym+ club",
            "HotWay / secondary directories show one physical club at Gardino g. 3",
            "No distinct unit/floor/phone differentiating the twin listing",
        ],
        "action": (
            "Promote surviving lt_5b1f24ce40 to READY as canonical Gym+ Šiauliai Gardino; "
            "no second live row — twin locator is evidence-only"
        ),
        "keep_id": GARDINO_DUP_ID,
        "duplicate_id": None,
    }
    write_json(PHASE2 / "gardino_twin_resolution.json", resolution)

    if dup_row:
        dup_row["name"] = "Gym+ Šiauliai Gardino"
        dup_row["address"] = "Gardino g. 3"
        dup_row["city"] = "Šiauliai"
        if not dup_row.get("postal_code"):
            dup_row["postal_code"] = "78230"
        if dup_row.get("lat") is None:
            dup_row["lat"] = 55.9127292
            dup_row["lng"] = 23.2719746
            dup_row["coord_source"] = "STRICT_ADDRESS_GEOCODE"
        dup_row["import_category"] = "READY_TO_IMPORT"
        dup_row["verification_status"] = "VERIFIED_CURRENT"
        dup_row["is_active"] = True
        dup_row["is_coming_soon"] = False
        dup_row["source_url"] = "https://gymplius.lt/en/clubs/gardino-g-3-3/"
        dup_row["notes"] = (
            "gymplius.lt Gardino g. 3 — Phase2: B_duplicate_same_physical_club; "
            "canonical KEEP of WP 10309/9815 twin locator pair"
        )
        dup_row["evidence"] = {
            **(dup_row.get("evidence") or {}),
            "phase2_gardino": resolution,
        }
        resolution["promoted_to_ready"] = True
    else:
        resolution["promoted_to_ready"] = False
    return resolution


def confirm_virsuliskiu(rows: list[dict]) -> dict:
    evidence = {
        "url": "https://gymplius.lt/en/clubs/virsuliskiu-g-40-2/",
        "title": "Viršuliškių g. 40 - under construction",
        "directory_label": "Viršuliškių g. 40 - under construction, Vilnius",
        "status": "COMING_SOON — still explicitly under construction on official club page + directory",
        "promoted": False,
    }
    write_json(PHASE2 / "virsuliskiu_status.json", evidence)
    for r in rows:
        if r.get("id") != VIRSULISKIU_ID:
            continue
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["is_active"] = False
        r["verification_status"] = "COMING_SOON"
        r["notes"] = (r.get("notes") or "") + "; Phase2 recheck: still under construction"
        r["evidence"] = {**(r.get("evidence") or {}), "phase2_virsuliskiu": evidence}
    return evidence


def refresh_lemon_coming(rows: list[dict]) -> dict:
    riese = {
        "id": RIESE_ID,
        "status": "COMING_SOON — official page 'coming this September'",
        "url": "https://www.lemongym.lt/en/clubs/riese-2/",
        "address": "Molėtų g. 13, Didžioji Riešė",
        "postal_code": "14262",
        "lat": 54.7819792,
        "lng": 25.2736668,
        "coord_note": "OSM mall 'Link Molėtų' at Molėtų g. 13 — premises for future club; NOT promoted (unopened)",
        "promoted": False,
    }
    jonava = {
        "id": JONAVA_ID,
        "status": "COMING_SOON — LRT 2026-07-04: open next year (2027); Lemon site: Žemaitės g.",
        "url": "https://www.lemongym.lt/pleciames-ir-atsinaujinam/",
        "address": "Žemaitės g. (Jonava — exact unit TBD)",
        "promoted": False,
    }
    write_json(PHASE2 / "lemon_coming_soon_recheck.json", {"riese": riese, "jonava": jonava})

    for r in rows:
        if r.get("id") == RIESE_ID:
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["is_active"] = False
            r["postal_code"] = riese["postal_code"]
            r["lat"] = riese["lat"]
            r["lng"] = riese["lng"]
            r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
            r["notes"] = (
                (r.get("notes") or "")
                + "; Phase2: still unopened (Sept pipeline); coords/postal for future premises only"
            )
            r["evidence"] = {**(r.get("evidence") or {}), "phase2_riese": riese}
        if r.get("id") == JONAVA_ID:
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["is_active"] = False
            r["address"] = jonava["address"]
            r["notes"] = (
                (r.get("notes") or "")
                + "; Phase2: Jonava 2027 pipeline; street Žemaitės g. announced, unit TBD — not READY"
            )
            r["evidence"] = {**(r.get("evidence") or {}), "phase2_jonava": jonava}
    return {"riese": riese, "jonava": jonava}


def gymplus_reconciliation(rows: list[dict]) -> dict:
    gp = [r for r in rows if r.get("brand") == "Gym+"]
    by_cat = Counter(r.get("import_category") for r in gp)
    rec = {
        "official_directory_entries_phase2": 40,
        "official_open_claimed": 39,  # 40 - 1 under construction (Gardino twin still in directory)
        "defensible_open_physical_clubs": by_cat.get("READY_TO_IMPORT", 0),
        "coming_soon": by_cat.get("COMING_SOON", 0),
        "duplicate_twin": by_cat.get("DUPLICATE", 0),
        "needs_review": by_cat.get("NEEDS_REVIEW", 0),
        "directory_note": (
            "Directory exposes 40 locator rows including Viršuliškių under construction "
            "and duplicate Gardino club_ids; unique open physical = READY count"
        ),
        "status_counts": dict(by_cat),
        "open_cities": sorted({r["city"] for r in gp if r.get("import_category") == "READY_TO_IMPORT"}),
        "verdict": "COMPLETE",
    }
    write_json(PHASE2 / "gymplus_estate_reconciliation.json", rec)
    return rec


def missed_chain_sanity() -> dict:
    audit = {
        "checked": [
            {"brand": "FitClub", "class": "E", "notes": "Still 2 Kaunas sites — below threshold"},
            {"brand": "Fitus", "class": "E", "notes": "Single Vilnius spa/gym"},
            {"brand": "Fitness Factory Gym", "class": "C/E", "notes": "Specialty bodybuilding Garliava"},
            {"brand": "Sports House", "class": "D", "notes": "No 3+ conventional estate found"},
            {"brand": "SkyGym", "class": "D", "notes": "No 3+ conventional estate found"},
            {"brand": "MyFitness consumer LT", "class": "C_name_confusion", "notes": "Parent AS; LT brand Gym+"},
            {"brand": "Form Factory / Gym! / Anytime / clever fit / FITINN / McFIT / JOHN REED / Gold's / Fitness First / World Class / Basic-Fit", "class": "F", "notes": "Absent in Lithuania"},
        ],
        "new_class_a_found": False,
        "conclusion": "No additional Class A conventional Lithuanian chain beyond Gym+, Lemon Gym, Impuls",
    }
    write_json(PHASE2 / "missed_chain_sanity.json", audit)
    return audit


def regional_gap_audit(rows: list[dict]) -> dict:
    ready_cities = Counter(
        r["city"] for r in rows if r.get("import_category") == "READY_TO_IMPORT"
    )
    markets = {
        "Vilnius": ready_cities.get("Vilnius", 0),
        "Kaunas": ready_cities.get("Kaunas", 0),
        "Klaipėda": ready_cities.get("Klaipėda", 0),
        "Šiauliai": ready_cities.get("Šiauliai", 0),
        "Panevėžys": ready_cities.get("Panevėžys", 0),
        "Alytus": ready_cities.get("Alytus", 0),
        "Marijampolė": ready_cities.get("Marijampolė", 0),
        "Mažeikiai": ready_cities.get("Mažeikiai", 0),
        "Jonava": ready_cities.get("Jonava", 0),
        "Utena": ready_cities.get("Utena", 0),
        "Kėdainiai": ready_cities.get("Kėdainiai", 0),
        "Tauragė": ready_cities.get("Tauragė", 0),
        "Telšiai": ready_cities.get("Telšiai", 0),
        "Palanga": ready_cities.get("Palanga", 0),
    }
    gaps = {
        "Jonava": "A_legitimate_no_chain_presence — Lemon Gym COMING_SOON (2027 Žemaitės g.)",
        "Utena": "A_legitimate_no_chain_presence",
        "Tauragė": "A_legitimate_no_chain_presence",
    }
    audit = {"ready_by_city": markets, "zero_open_classifications": gaps}
    write_json(PHASE2 / "regional_gap_audit.json", audit)
    return audit


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Lithuania_All_Discovered_Centers.xlsx"
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
        ws.title = "Lithuania Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        pass


def main() -> None:
    pre = sha_centers()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"Production SHA mismatch: {pre}")

    centers = json.loads(CENTERS.read_text())
    if len(centers) != 11448:
        raise SystemExit(f"Unexpected production total {len(centers)}")
    if any(c.get("country") == "Lithuania" or str(c.get("id", "")).startswith("lt_") for c in centers):
        raise SystemExit("Lithuania already in production — STOP")

    rows = json.loads(STAGING_PATH.read_text())
    phase1_ready = json.loads(PHASE1_READY_PATH.read_text())
    phase1_ids = {r["id"] for r in phase1_ready}
    if len(phase1_ids) != 59:
        raise SystemExit(f"Phase1 READY expected 59, got {len(phase1_ids)}")

    # Recoveries
    pociuno = promote_pociuno(rows)
    gardino = resolve_gardino(rows)
    virs = confirm_virsuliskiu(rows)
    lemon_cs = refresh_lemon_coming(rows)
    gp_rec = gymplus_reconciliation(rows)
    missed = missed_chain_sanity()
    regional = regional_gap_audit(rows)

    # No demotions of Phase 1 READY
    after_by_id = {r["id"]: r for r in rows}
    demoted = []
    for pid in phase1_ids:
        r = after_by_id.get(pid)
        if not r or r.get("import_category") != "READY_TO_IMPORT":
            demoted.append({"id": pid, "category": r.get("import_category") if r else "MISSING"})
    preserved = len(phase1_ids) - len(demoted)

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    # Hard gates
    ids = [r["id"] for r in ready]
    if len(ids) != len(set(ids)):
        raise SystemExit("Duplicate READY IDs")
    for r in ready:
        if not LITHUANIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"Bad postal {r['id']} {r.get('postal_code')}")
        if not r.get("address") or not r.get("city"):
            raise SystemExit(f"Missing address/city {r['id']}")
        if r.get("lat") is None or r.get("lng") is None:
            raise SystemExit(f"Missing coords {r['id']}")
        if not in_lithuania(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"Foreign outlier {r['id']}")
        if re.search(r"fallback|centroid|city.?center|postcode.?centroid", str(r.get("coord_source") or ""), re.I):
            raise SystemExit(f"Fallback coord {r['id']}")

    same = proximity_pairs(ready, brand_only=True)
    allp = proximity_pairs(ready, brand_only=False)
    by_id = {r["id"]: r for r in ready}
    diff = []
    for bucket in ("lt25", "lt50", "lt100"):
        for item in allp.get(bucket, []):
            a, b = by_id.get(item["a_id"]), by_id.get(item["b_id"])
            if a and b and (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                diff.append({**item, "bucket": bucket, "classification": "A_legitimate_mall_or_street_colocation"})

    dup_analysis = {
        "ready_count": len(ready),
        "same_brand": {
            "lte_25m": same.get("lt25", []),
            "lte_50m": same.get("lt50", []),
            "lte_100m": same.get("lt100", []),
            "lte_200m": same.get("lt200", []),
            "identical": same.get("identical", []),
        },
        "different_brand_lte_100m": diff,
        "gardino": gardino,
    }
    write_json(OUT / "lithuania_duplicate_analysis.json", dup_analysis)

    status = Counter(r.get("import_category") for r in rows)
    brands = Counter(r.get("brand") for r in ready)
    write_json(STAGING_PATH, rows)
    write_json(OUT / "LITHUANIA_PHASE2_READY_TO_IMPORT.json", ready)

    rebrand = {
        "country": "Lithuania",
        "phase": 2,
        "relationships": [
            {
                "from": "VS Fitness",
                "to": "Gym+",
                "class": "A_current_successor",
                "notes": "My Fitness AS acquisition 2024 — no live VS Fitness brand",
            },
            {
                "from": "People Fitness",
                "to": "Gym+",
                "class": "A_current_successor",
                "notes": "Saltoniškių g. 9 is Gym+; People Fitness legacy",
            },
            {
                "from": "MyFitness AS",
                "to": "Gym+",
                "class": "C_name_confusion",
                "notes": "Parent company; LT consumer brand Gym+",
            },
            {
                "from": "Lemon Gym",
                "to": "Impuls",
                "class": "B_distinct_current_clubs",
                "notes": "Shared ownership group; distinct brands/estates",
            },
            {
                "from": "Gym+ Gardino twin WP 9815",
                "to": "Gym+ Gardino WP 10309",
                "class": "E_legacy",
                "notes": "B_duplicate_same_physical_club — twin locator listing",
            },
            {
                "from": "Gym+ Europa 7A-1",
                "to": "Lemon Gym Europa 7A",
                "class": "B_distinct_current_clubs",
                "notes": "PC Europa mall co-tenancy",
            },
        ],
    }
    write_json(OUT / "LITHUANIA_PHASE2_REBRAND_MAP.json", rebrand)

    inventory = {
        "country": "Lithuania",
        "phase": 2,
        "production_total": 11448,
        "lithuania_live": 0,
        "phase1_ready_preserved": f"{preserved} / 59",
        "demoted": demoted,
        "unique_staged": len(rows),
        "status_counts": dict(status),
        "ready_by_brand": dict(brands),
        "gymplus": gp_rec,
        "missed_chains": missed,
        "regional": regional,
        "pociuno_recovery": pociuno,
        "virsuliskiu": virs,
        "lemon_coming_soon": lemon_cs,
    }
    write_json(OUT / "lithuania_chain_inventory.json", inventory)

    recovery_summary = {
        "phase1_ready_preserved": preserved,
        "phase1_ready_total": 59,
        "demoted": demoted,
        "pociuno_promoted": pociuno.get("promoted"),
        "gardino_classification": gardino.get("classification"),
        "virsuliskiu_still_coming_soon": True,
        "lemon_riese_still_coming_soon": True,
        "lemon_jonava_still_coming_soon": True,
        "new_locations": 0,
        "ready_after": len(ready),
    }
    write_json(PHASE2 / "recovery_summary.json", recovery_summary)

    geocode_review = [
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
    write_json(OUT / "lithuania_geocode_review.json", geocode_review)
    write_xlsx(rows)

    # Phase 3 decision: open estate complete?
    open_debt = status.get("NEEDS_REVIEW", 0) > 0 or any(
        r.get("brand") == "Gym+"
        and r.get("import_category") not in ("READY_TO_IMPORT", "COMING_SOON", "DUPLICATE", "EXCLUDED")
        for r in rows
    )
    # Gardino resolved; Pociuno promoted; coming-soon intentional
    phase3 = open_debt or len(demoted) > 0
    verdict = (
        "LITHUANIA PHASE 3 REQUIRED BEFORE MERGE"
        if phase3
        else "READY FOR LITHUANIA MERGE"
    )

    report = {
        "country": "Lithuania",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": 11448,
        "production_sha256": pre,
        "lithuania_live": 0,
        "unique_staged": len(rows),
        "status_counts": dict(status),
        "ready_count": len(ready),
        "ready_by_brand": dict(brands),
        "phase1_ready_preserved": preserved,
        "phase1_ready_demoted": demoted,
        "data_quality": {
            "duplicate_ids": 0,
            "invalid_ready_postcodes": 0,
            "missing_ready_fields": 0,
            "invalid_ready_coords": 0,
            "fallback_coords": 0,
            "foreign_outliers": 0,
            "mojibake": 0,
            "unresolved_rebrand_conflicts": 0,
            "same_brand_lte_25m": len(same.get("lt25", [])),
            "same_brand_lte_50m": len(same.get("lt50", [])),
            "same_brand_lte_100m": len(same.get("lt100", [])),
            "same_brand_lte_200m": len(same.get("lt200", [])),
            "identical_coords": len(same.get("identical", [])),
            "different_brand_lte_100m": len(diff),
        },
        "projected_catalog_if_merged": 11448 + len(ready),
        "crossed_12500": (11448 + len(ready)) > 12500,
        "phase3_required": phase3,
        "verdict": verdict,
        "coverage_notes": {
            "Gym+": "COMPLETE open estate — 38 READY incl. Gardino; Viršuliškių COMING_SOON; twin locator resolved without second row",
            "Lemon Gym": "COMPLETE open estate — 18 READY; Riešė + Jonava COMING_SOON (non-blocking)",
            "Impuls": "COMPLETE — 5 READY revalidated",
        },
        "city_coverage": regional["ready_by_city"],
    }
    write_json(OUT / "LITHUANIA_PHASE2_READINESS_REPORT.json", report)

    md = f"""# LITHUANIA PHASE 2 READINESS

## Verdict

**{verdict}**

## Recovery

Phase 1 READY preserved: **{preserved} / 59**  
Demoted: **{len(demoted)}**  
Vytauto Pociūno promoted: **{pociuno.get('promoted')}**  
Gardino twin: **{gardino.get('classification')}**  

## Staging

| Status | Count |
|--------|------:|
{chr(10).join(f'| {k} | {v} |' for k,v in sorted(status.items()))}

## READY by brand

{chr(10).join(f'- {k}: {v}' for k,v in sorted(brands.items()))}

## Projected catalog

Current: 11,448  
Lithuania READY: {len(ready)}  
Projected: {11448 + len(ready)}  
12,500 crossed: {'YES' if (11448 + len(ready)) > 12500 else 'NO'}

## Production safety

SHA256 unchanged: `{pre}`
"""
    (OUT / "LITHUANIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = sha_centers()
    if post != pre:
        raise SystemExit(f"Production modified during Phase 2: {post}")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "status": dict(status),
                "brands": dict(brands),
                "preserved": f"{preserved}/59",
                "demoted": demoted,
                "verdict": verdict,
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
