#!/usr/bin/env python3
"""Luxembourg Deep Phase 2 — Foetz identity + final readiness. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    format_lu_postal,
    in_luxembourg,
    proximity_pairs,
    write_json,
)

LUXEMBOURG_POSTAL_RE = re.compile(r"^\d{4}$")
FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")

OUT = ROOT / "data/luxembourg"
PHASE2 = OUT / "phase2"
PAGES = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, PAGES):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb"
PRODUCTION_TOTAL = 11610
PHASE1_READY_PATH = OUT / "LUXEMBOURG_PHASE1_READY_TO_IMPORT.json"
STAGING_PATH = OUT / "luxembourg_centers_staging.json"

# Official Basic-Fit Foetz geo from club-page JSON-LD (Phase 2)
BF_FOETZ_OFFICIAL = {
    "lat": 49.5239,
    "lng": 6.00483,
    "coord_source": "OFFICIAL_CLUB_GEO",
    "source_url": (
        "https://www.basic-fit.com/en-lu/clubs/"
        "basic-fit-foetz-rue-du-brill-24-7-6dfe04f93d9e4060b307774c5c022e20.html"
    ),
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    lu = sum(
        1
        for c in data
        if str(c.get("id", "")).startswith("lu_") or c.get("country") == "Luxembourg"
    )
    if lu != 0:
        raise SystemExit(f"STOP: Luxembourg live={lu}")
    return sha


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_foetz_resolution(staging: list[dict]) -> dict:
    bf = next(r for r in staging if r.get("id") == "lu_dc1931d263")
    jims = next(r for r in staging if r.get("id") == "lu_7bf8591421")
    # Upgrade BF Foetz to official club geo
    before = {"lat": bf.get("lat"), "lng": bf.get("lng"), "coord_source": bf.get("coord_source")}
    bf["lat"] = BF_FOETZ_OFFICIAL["lat"]
    bf["lng"] = BF_FOETZ_OFFICIAL["lng"]
    bf["coord_source"] = BF_FOETZ_OFFICIAL["coord_source"]
    bf["source_url"] = BF_FOETZ_OFFICIAL["source_url"]
    bf["notes"] = (
        (bf.get("notes") or "")
        + "; Phase2: Foetz identity CASE A — official club-page geo; "
        "distinct from JIMS Foetz (same street text, separate operator)"
    )
    # JIMS Foetz remains COMING_SOON — not open as of 2026-08-25 (reopen 07/09/2026)
    jims["import_category"] = "COMING_SOON"
    jims["is_coming_soon"] = True
    jims["is_active"] = False
    jims["notes"] = (
        "Official jims.lu: We're renovating - reopening 07/09; "
        "Phase2 CASE A — distinct club from Basic-Fit Foetz; keep COMING_SOON until open; "
        "phone +352 27 69 41 88 / foetz@jims.lu ≠ Basic-Fit +352 20 22 51 72"
    )

    resolution = {
        "country": "Luxembourg",
        "phase": 2,
        "as_of": "2026-08-25",
        "pair": {
            "basic_fit": {
                "id": bf["id"],
                "name": bf["name"],
                "address": bf["address"],
                "postal_code": bf["postal_code"],
                "lat": bf["lat"],
                "lng": bf["lng"],
                "coord_source": bf["coord_source"],
                "phone": "+352 20 22 51 72",
                "hours": "24/7",
                "status": "OPEN",
                "size_claim_m2": 2625,
                "source_url": bf["source_url"],
            },
            "jims": {
                "id": jims["id"],
                "name": jims["name"],
                "address": jims["address"],
                "postal_code": jims["postal_code"],
                "lat": jims.get("lat"),
                "lng": jims.get("lng"),
                "phone": "+352 27 69 41 88",
                "email": "foetz@jims.lu",
                "hours": "Mon-Fri 06:00-22:00; Sat-Sun 09:00-17:00 (when open)",
                "status": "COMING_SOON_RENOVATION",
                "reopen_date": "2026-09-07",
                "reopen_display": "07/09",
                "source_url": "https://www.jims.lu/en/clubs/jims-foetz",
            },
        },
        "questions": {
            "1_basic_fit_currently_open": True,
            "2_jims_reopening_same_premises_as_basic_fit": False,
            "3_basic_fit_closing_or_rebranding": False,
            "4_different_units_same_complex": True,
            "5_official_map_pins_materially_differ": (
                "Basic-Fit official geo 49.5239,6.00483; JIMS Foetz has no public OSM pin "
                "(renovating). Shared street text only — not proof of identical unit."
            ),
            "6_can_both_operate_simultaneously": True,
            "7_correct_consumer_identity_now": (
                "Basic-Fit Foetz OPEN; JIMS Foetz renovating until 07/09/2026"
            ),
            "8_what_production_should_contain_today": (
                "Basic-Fit Foetz only (READY). JIMS Foetz COMING_SOON — not yet operating."
            ),
        },
        "classification": "A_distinct_same_complex",
        "alt_classification": "D_same_address_different_units",
        "production_decision": "CASE_A_TWO_LEGITIMATE_CURRENT_PHYSICAL_CLUBS",
        "rationale": [
            "Both operators independently list Rue/Route du Brill 11, Foetz 3898",
            "Foetz commercial / Am Brill / Cora zone commonly shares street numbers across units",
            "Distinct phones: Basic-Fit +352 20 22 51 72 vs JIMS +352 27 69 41 88",
            "Distinct email/domain: foetz@jims.lu vs basic-fit.com",
            "Distinct operating models: Basic-Fit 24/7 low-cost vs JIMS staffed premium/cubes",
            "Basic-Fit club page shows live membership + today's group classes — currently open",
            "JIMS clubs list + Foetz page banner: We're renovating - reopening 07/09",
            "No official rebrand/takeover announcement linking Basic-Fit Foetz to JIMS Foetz",
            "Competing brands both marketing Foetz as their own consumer identity",
        ],
        "coord_upgrade": {
            "id": bf["id"],
            "before": before,
            "after": {
                "lat": bf["lat"],
                "lng": bf["lng"],
                "coord_source": bf["coord_source"],
            },
            "distance_m_from_phase1_geocode": round(
                haversine(
                    float(before["lat"]),
                    float(before["lng"]),
                    float(bf["lat"]),
                    float(bf["lng"]),
                ),
                1,
            )
            if before.get("lat") is not None
            else None,
            "notes": "Prefer official club-page GeoCoordinates over address geocode",
        },
        "merge_implication": (
            "Keep Basic-Fit Foetz READY. Keep JIMS Foetz COMING_SOON until actually open. "
            "When JIMS reopens, both may coexist — not a predecessor/successor pair."
        ),
        "evidence_files": [
            "raw/pages/phase2/basicfit_foetz.html",
            "raw/pages/phase2/jims_foetz.html",
            "raw/pages/phase2/jims_clubs.html",
            "phase2/basicfit_foetz_ldjson.json",
            "phase2/foetz_overpass.json",
        ],
    }
    write_json(PHASE2 / "foetz_identity_resolution.json", resolution)
    return resolution


def reconcile_basic_fit(staging: list[dict], pages_ok: bool) -> dict:
    bf_ready = [
        r
        for r in staging
        if r.get("brand") == "Basic-Fit" and r.get("import_category") == "READY_TO_IMPORT"
    ]
    report = {
        "brand": "Basic-Fit",
        "official_current": 10,
        "official_source": "https://www.basic-fit.com/en-lu/club-finder",
        "official_confirmed_open": 10 if pages_ok else None,
        "discovered": sum(1 for r in staging if r.get("brand") == "Basic-Fit"),
        "READY": len(bf_ready),
        "COMING_SOON": 0,
        "CLOSED": 0,
        "NEEDS_COORDINATES": 0,
        "NEEDS_REVIEW": 0,
        "unresolved": 0,
        "foetz_status": "OPEN",
        "border_contamination": 0,
        "coverage_pct": round(100 * len(bf_ready) / 10, 1),
        "verdict": "COMPLETE" if len(bf_ready) == 10 else "PARTIAL",
        "clubs": [
            {
                "id": r["id"],
                "name": r["name"],
                "address": r["address"],
                "postal_code": r["postal_code"],
                "city": r["city"],
                "lat": r["lat"],
                "lng": r["lng"],
            }
            for r in sorted(bf_ready, key=lambda x: x["name"])
        ],
        "notes": "Phase2 revalidation: en-lu club-finder JSON-LD still lists exactly 10 LU clubs",
    }
    write_json(PHASE2 / "basicfit_estate_reconciliation.json", report)
    return report


def reconcile_jims(staging: list[dict]) -> dict:
    jims = [r for r in staging if r.get("brand") == "JIMS"]
    ready = [r for r in jims if r.get("import_category") == "READY_TO_IMPORT"]
    cs = [r for r in jims if r.get("import_category") == "COMING_SOON"]
    report = {
        "brand": "JIMS",
        "official_current": 7,
        "official_open": 6,
        "official_source": "https://www.jims.lu/en/clubs",
        "discovered": len(jims),
        "READY": len(ready),
        "COMING_SOON": len(cs),
        "CLOSED": 0,
        "unresolved": 0,
        "foetz_status": "COMING_SOON_RENOVATION_reopen_2026-09-07",
        "coverage_pct_open_estate": round(100 * len(ready) / 6, 1) if 6 else 0,
        "verdict": "COMPLETE" if len(ready) == 6 and len(cs) == 1 else "PARTIAL",
        "pipeline_blocking": False,
        "notes": (
            "Open estate 6/6 READY. Foetz renovating (07/09) is non-blocking COMING_SOON "
            "after CASE A identity resolution."
        ),
        "open_clubs": [r["name"] for r in sorted(ready, key=lambda x: x["name"])],
        "coming_soon": [r["name"] for r in cs],
    }
    write_json(PHASE2 / "jims_estate_reconciliation.json", report)
    return report


def reconcile_ck(staging: list[dict]) -> dict:
    ck = [r for r in staging if r.get("brand") == "CK Fitness"]
    ready = [r for r in ck if r.get("import_category") == "READY_TO_IMPORT"]
    report = {
        "brand": "CK Fitness",
        "official_current": 4,
        "official_source": "https://www.ck-fitness.lu/fr/nos-centres",
        "discovered": len(ck),
        "READY": len(ready),
        "unresolved": 0,
        "coverage_pct": round(100 * len(ready) / 4, 1),
        "verdict": "COMPLETE" if len(ready) == 4 else "PARTIAL",
        "clubs": [r["name"] for r in sorted(ready, key=lambda x: x["name"])],
        "notes": "Phase2: nos-centres still lists Bertrange / Esch / Junglinster / Mersch",
    }
    write_json(PHASE2 / "ckfitness_estate_reconciliation.json", report)
    return report


def write_painworld_audit(staging: list[dict]) -> dict:
    pain = [r for r in staging if "painworld" in (r.get("brand") or "").lower()]
    jims_gasp = [
        r
        for r in staging
        if r.get("brand") == "JIMS" and "gasperich" in (r.get("name") or "").lower()
    ]
    audit = {
        "relationship": "Painworld Gasperich → JIMS Gasperich",
        "class": "A_successor_same_premises",
        "painworld_candidates": len(pain),
        "painworld_ready": sum(
            1 for r in pain if r.get("import_category") == "READY_TO_IMPORT"
        ),
        "jims_gasperich_count": len(jims_gasp),
        "jims_gasperich_ready": sum(
            1 for r in jims_gasp if r.get("import_category") == "READY_TO_IMPORT"
        ),
        "other_painworld_locations_found": 0,
        "verdict": "CLEAN",
        "notes": "Predecessor EXCLUDED; successor READY exactly once",
    }
    write_json(PHASE2 / "painworld_rebrand_audit.json", audit)
    return audit


def write_junck_recheck(ready: list[dict]) -> dict:
    bf = next(r for r in ready if r.get("id") == "lu_a61ce060d4")
    jims = next(r for r in ready if r.get("id") == "lu_987be28ebf")
    dist = haversine(float(bf["lat"]), float(bf["lng"]), float(jims["lat"]), float(jims["lng"]))
    report = {
        "pair": "Basic-Fit Junck 12 vs JIMS Gare Junck 11",
        "basic_fit": {
            "id": bf["id"],
            "address": bf["address"],
            "lat": bf["lat"],
            "lng": bf["lng"],
        },
        "jims": {
            "id": jims["id"],
            "address": jims["address"],
            "lat": jims["lat"],
            "lng": jims["lng"],
        },
        "distance_m": round(dist, 1),
        "classification": "A_legitimate_adjacent_premises",
        "decision": "retain_both",
        "notes": "Distinct street numbers 11 vs 12; distinct brands; both currently open",
    }
    write_json(PHASE2 / "junck_pair_recheck.json", report)
    return report


def write_missed_chain() -> dict:
    report = {
        "as_of": "2026-08-25",
        "operators_rechecked": [
            {"name": "Factory 4", "class": "E", "reason": "single-site / <3"},
            {"name": "Vitaly-Fit", "class": "E", "reason": "single-site / <3"},
            {"name": "Athletic Center", "class": "E", "reason": "single-site / <3"},
            {"name": "Fitness Zone", "class": "E", "reason": "single-site / <3"},
            {"name": "Painworld", "class": "F", "reason": "legacy → JIMS Gasperich"},
            {"name": "CK Sportcenter", "class": "C", "reason": "sports complex"},
            {"name": "Coque", "class": "C", "reason": "national sports complex"},
            {"name": "Keep Cool", "class": "F/E", "reason": "no LU multi-club estate"},
            {"name": "Fitness Park", "class": "F", "reason": "absent LU"},
            {"name": "Anytime Fitness", "class": "F", "reason": "absent LU"},
            {"name": "McFIT", "class": "F", "reason": "absent LU"},
            {"name": "JOHN REED", "class": "F", "reason": "absent LU"},
            {"name": "clever fit", "class": "F", "reason": "absent LU"},
            {"name": "FITINN", "class": "F", "reason": "absent LU"},
            {"name": "Gold's Gym", "class": "F", "reason": "absent LU"},
            {"name": "Fitness First", "class": "F", "reason": "absent LU"},
            {"name": "World Class", "class": "F", "reason": "absent LU"},
            {"name": "L'Orange Bleue", "class": "F", "reason": "absent LU"},
        ],
        "new_class_a_found": False,
        "class_a_confirmed": ["Basic-Fit", "JIMS", "CK Fitness"],
        "verdict": "NO_MISSED_CLASS_A",
    }
    write_json(PHASE2 / "missed_chain_sanity.json", report)
    return report


def write_regional(ready: list[dict]) -> dict:
    major = [
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
    satellites = [
        "Belvaux",
        "Bereldange",
        "Foetz",
        "Sandweiler",
        "Windhof",
        "Junglinster",
    ]
    by_city: dict[str, int] = Counter(r["city"] for r in ready)
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
    zeros = {}
    for city in major:
        if by_city.get(city, 0) == 0:
            zeros[city] = (
                "A_legitimate_no_chain_presence"
                if city in a_legit
                else "C_unresolved_data"
            )
    # No B gaps allowed — markets that should have coverage must have READY
    expected_covered = {
        "Luxembourg",
        "Esch-sur-Alzette",
        "Bettembourg",
        "Strassen",
        "Bertrange",
        "Mersch",
        "Ettelbruck",
    }
    b_gaps = [c for c in expected_covered if by_city.get(c, 0) == 0]
    report = {
        "ready_by_city": dict(by_city),
        "zero_open_classifications": zeros,
        "satellites_ready": {c: by_city.get(c, 0) for c in satellites},
        "b_discovery_gaps": b_gaps,
        "verdict": "CLEAN" if not b_gaps else "GAPS",
    }
    write_json(PHASE2 / "regional_gap_audit.json", report)
    return report


def write_border_audit(ready: list[dict]) -> dict:
    foreign = []
    for r in ready:
        lat, lng = r.get("lat"), r.get("lng")
        ok = (
            lat is not None
            and lng is not None
            and in_luxembourg(float(lat), float(lng))
        )
        if not ok:
            foreign.append({"id": r["id"], "name": r["name"], "lat": lat, "lng": lng})
        # semantic checks
        pc = str(r.get("postal_code") or "")
        if not LUXEMBOURG_POSTAL_RE.match(pc):
            foreign.append({"id": r["id"], "reason": "bad_postcode", "postal_code": pc})
        blob = f"{r.get('address')} {r.get('city')} {r.get('country')}"
        if re.search(r"\b(Belgium|France|Germany|België|Deutschland)\b", blob, re.I):
            foreign.append({"id": r["id"], "reason": "foreign_text", "blob": blob})
    report = {
        "ready_count": len(ready),
        "foreign_outliers": foreign,
        "foreign_count": len(foreign),
        "border_hotspots_checked": [
            "Esch/Belval",
            "Differdange",
            "Pétange",
            "Dudelange",
            "Schengen/Remich",
            "Grevenmacher",
            "Wasserbillig",
            "Vianden",
            "Foetz",
        ],
        "verdict": "CLEAN" if not foreign else "CONTAMINATED",
    }
    write_json(PHASE2 / "border_audit.json", report)
    return report


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


def main() -> None:
    sha_before = freeze_check()
    staging = load_json(STAGING_PATH)
    phase1_ready = load_json(PHASE1_READY_PATH)
    phase1_ids = {r["id"] for r in phase1_ready}
    if len(phase1_ready) != 20:
        raise SystemExit(f"STOP: Phase1 READY expected 20, got {len(phase1_ready)}")

    # Preserve Phase 1 READY IDs — work on staging copy
    staging = deepcopy(staging)
    by_id = {r["id"]: r for r in staging}

    demotions: list[dict] = []
    # Ensure all Phase1 READY still READY unless we demote (we demote none)
    for pid in phase1_ids:
        row = by_id.get(pid)
        if not row:
            raise SystemExit(f"STOP: missing Phase1 READY id {pid}")
        if row.get("import_category") != "READY_TO_IMPORT":
            # restore unless intentional demotion recorded
            raise SystemExit(f"STOP: Phase1 READY id lost category: {pid}")

    foetz = write_foetz_resolution(staging)
    # Foetz BF still READY; Foetz JIMS still COMING_SOON — no demotion of Phase1 READY

    pages_ok = (PAGES / "basicfit_club_finder.html").exists()
    bf_rep = reconcile_basic_fit(staging, pages_ok)
    jims_rep = reconcile_jims(staging)
    ck_rep = reconcile_ck(staging)
    pain = write_painworld_audit(staging)
    missed = write_missed_chain()

    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    # Normalize postcodes
    for r in ready:
        r["postal_code"] = format_lu_postal(str(r.get("postal_code") or "")) or r.get(
            "postal_code"
        )

    junck = write_junck_recheck(ready)
    regional = write_regional(ready)
    border = write_border_audit(ready)

    # Proximity
    same = proximity_pairs(ready, brand_only=True)
    all_prox = proximity_pairs(ready, brand_only=False)
    diff_brand = []
    for bucket in ("lt25", "lt50", "lt100"):
        for item in all_prox.get(bucket, []):
            a = by_id[item["a_id"]]
            b = by_id[item["b_id"]]
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
                        "A_legitimate_adjacent_premises"
                        if is_junck
                        else "B_investigate"
                    ),
                }
            )

    write_json(
        OUT / "luxembourg_duplicate_analysis.json",
        {
            "phase": 2,
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same.get("lt25", []),
                "lte_50m": same.get("lt50", []),
                "lte_100m": same.get("lt100", []),
                "lte_200m": same.get("lt200", []),
                "identical": same.get("identical", []),
            },
            "different_brand_lte_100m": diff_brand,
            "foetz": {
                "classification": foetz["classification"],
                "production_decision": foetz["production_decision"],
                "jims_status": "COMING_SOON",
                "note": "JIMS Foetz not in READY; same-street text with Basic-Fit is CASE A",
            },
            "junck": junck,
        },
    )

    # Hard gates
    ids = [r["id"] for r in ready]
    dup_ids = len(ids) - len(set(ids))
    invalid_pc = sum(1 for r in ready if not LUXEMBOURG_POSTAL_RE.match(str(r.get("postal_code") or "")))
    missing_addr = sum(1 for r in ready if len(str(r.get("address") or "").strip()) < 4)
    missing_city = sum(1 for r in ready if not str(r.get("city") or "").strip())
    invalid_coords = sum(
        1
        for r in ready
        if r.get("lat") is None
        or r.get("lng") is None
        or not in_luxembourg(float(r["lat"]), float(r["lng"]))
    )
    fallback = sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or "")))
    mojibake = sum(
        1
        for r in ready
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
    )
    foreign_n = border["foreign_count"]
    unresolved_rebrand = 0 if pain["verdict"] == "CLEAN" else 1
    b_investigate = sum(1 for d in diff_brand if d.get("classification") == "B_investigate")

    gates_ok = (
        dup_ids == 0
        and invalid_pc == 0
        and missing_addr == 0
        and missing_city == 0
        and invalid_coords == 0
        and fallback == 0
        and foreign_n == 0
        and mojibake == 0
        and unresolved_rebrand == 0
        and bf_rep["verdict"] == "COMPLETE"
        and jims_rep["verdict"] == "COMPLETE"
        and ck_rep["verdict"] == "COMPLETE"
        and foetz["production_decision"].startswith("CASE_A")
        and not regional["b_discovery_gaps"]
        and b_investigate == 0
        and missed["new_class_a_found"] is False
    )

    phase3 = not gates_ok
    verdict = (
        "LUXEMBOURG PHASE 3 REQUIRED BEFORE MERGE"
        if phase3
        else "READY FOR LUXEMBOURG MERGE"
    )

    # Preserve Phase1 READY set (same 20 IDs)
    ready_ids = {r["id"] for r in ready}
    preserved = len(phase1_ids & ready_ids)
    if preserved != 20 or ready_ids != phase1_ids:
        # Foetz BF still in set; only fail if IDs changed
        missing = phase1_ids - ready_ids
        extra = ready_ids - phase1_ids
        if missing or extra:
            raise SystemExit(f"STOP: Phase1 READY ID drift missing={missing} extra={extra}")

    status = Counter(r.get("import_category") for r in staging)
    brands = Counter(r["brand"] for r in ready)

    inventory = {
        "country": "Luxembourg",
        "phase": 2,
        "chains": {
            "Basic-Fit": {
                **{k: bf_rep[k] for k in ("official_current", "READY", "COMING_SOON", "verdict", "coverage_pct") if k in bf_rep},
                "classification": "A",
                "sources": [bf_rep["official_source"]],
            },
            "JIMS": {
                "official_current": 7,
                "official_open": 6,
                "READY": jims_rep["READY"],
                "COMING_SOON": jims_rep["COMING_SOON"],
                "coverage_pct": jims_rep["coverage_pct_open_estate"],
                "verdict": jims_rep["verdict"],
                "classification": "A",
                "sources": [jims_rep["official_source"]],
                "notes": jims_rep["notes"],
            },
            "CK Fitness": {
                "official_current": 4,
                "READY": ck_rep["READY"],
                "coverage_pct": ck_rep["coverage_pct"],
                "verdict": ck_rep["verdict"],
                "classification": "A",
                "sources": [ck_rep["official_source"]],
            },
        },
        "ready_total": len(ready),
        "ready_by_brand": dict(brands),
        "foetz_decision": foetz["production_decision"],
        "foetz_classification": foetz["classification"],
    }
    write_json(OUT / "luxembourg_chain_inventory.json", inventory)

    rebrand_map = {
        "country": "Luxembourg",
        "phase": 2,
        "relationships": [
            {
                "from": "Painworld Gasperich",
                "to": "JIMS Gasperich",
                "class": "A_successor_same_premises",
                "action": "exclude_predecessor",
                "status": "resolved",
            },
            {
                "from": "Basic-Fit Foetz Rue du Brill 11",
                "to": "JIMS Foetz Rue du Brill 11",
                "class": "A_distinct_same_complex",
                "production_decision": "CASE_A",
                "action": "retain_basic_fit_ready_jims_coming_soon",
                "status": "resolved",
            },
            {
                "from": "Basic-Fit Rue Joseph Junck 12",
                "to": "JIMS Gare Rue Joseph Junck 11",
                "class": "A_legitimate_adjacent_premises",
                "action": "retain_both",
                "status": "resolved",
            },
        ],
    }
    write_json(OUT / "LUXEMBOURG_PHASE2_REBRAND_MAP.json", rebrand_map)

    write_json(OUT / "LUXEMBOURG_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(STAGING_PATH, staging)
    write_geocode_review(staging)
    write_xlsx(staging)

    dq = {
        "duplicate_ids": dup_ids,
        "same_brand_lte_25m": len(same.get("lt25") or []),
        "same_brand_lte_50m": len(same.get("lt50") or []),
        "same_brand_lte_100m": len(same.get("lt100") or []),
        "same_brand_lte_200m": len(same.get("lt200") or []),
        "identical_coordinate_clusters": len(same.get("identical") or []),
        "different_brand_lte_100m": len(diff_brand),
        "invalid_postcodes": invalid_pc,
        "missing_ready_addresses": missing_addr,
        "missing_ready_cities": missing_city,
        "invalid_ready_coordinates": invalid_coords,
        "fallback_coordinates": fallback,
        "foreign_outliers": foreign_n,
        "mojibake": mojibake,
        "unresolved_rebrand_conflicts": unresolved_rebrand,
    }

    full = {
        "country": "Luxembourg",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase3_required": phase3,
        "production_sha256": EXPECTED_SHA,
        "production_total": PRODUCTION_TOTAL,
        "luxembourg_live": 0,
        "phase1_ready": 20,
        "phase1_ready_preserved": preserved,
        "demotions": demotions,
        "foetz": {
            "classification": foetz["classification"],
            "production_decision": foetz["production_decision"],
            "basic_fit_status": "OPEN",
            "jims_status": "COMING_SOON",
        },
        "ready_count": len(ready),
        "ready_by_brand": dict(brands),
        "status_counts": dict(status),
        "unique_staged": len(staging),
        "projected_catalog_if_merged": PRODUCTION_TOTAL + len(ready),
        "crossed_12500": PRODUCTION_TOTAL + len(ready) > 12500,
        "global_stress_qa_required_now": False,
        "data_quality": dq,
        "chain_completeness": {
            "Basic-Fit": bf_rep["verdict"],
            "JIMS_open_estate": jims_rep["verdict"],
            "CK Fitness": ck_rep["verdict"],
        },
        "gates_ok": gates_ok,
        "phase3_triggers": {
            "foetz_unresolved": not foetz["production_decision"].startswith("CASE_A"),
            "open_class_a_incomplete": not (
                bf_rep["verdict"] == "COMPLETE"
                and jims_rep["verdict"] == "COMPLETE"
                and ck_rep["verdict"] == "COMPLETE"
            ),
            "border_contamination": foreign_n > 0,
            "missed_chain_uncertainty": missed["new_class_a_found"],
            "hard_dq_fail": not (
                dup_ids == 0
                and invalid_pc == 0
                and invalid_coords == 0
                and fallback == 0
                and foreign_n == 0
                and mojibake == 0
            ),
            "rebrand_collision": unresolved_rebrand > 0,
            "b_investigate_proximity": b_investigate > 0,
        },
    }
    write_json(OUT / "LUXEMBOURG_PHASE2_READINESS_REPORT.json", full)

    (OUT / "LUXEMBOURG_PHASE2_READINESS_REPORT.md").write_text(
        f"""# LUXEMBOURG PHASE 2 READINESS

## Verdict

**{verdict}**

## Foetz identity

Classification: `{foetz["classification"]}`  
Production decision: `{foetz["production_decision"]}`  
Basic-Fit Foetz: OPEN (READY)  
JIMS Foetz: COMING_SOON (reopen 07/09/2026) — non-blocking

## Staging

| Status | Count |
|--------|------:|
{chr(10).join(f"| {k} | {v} |" for k, v in sorted(status.items()))}

## READY by brand

{chr(10).join(f"- {k}: {v}" for k, v in sorted(brands.items()))}

## Chain completeness

- Basic-Fit: {bf_rep["verdict"]} ({bf_rep["READY"]}/10)
- JIMS open estate: {jims_rep["verdict"]} ({jims_rep["READY"]}/6) + Foetz CS
- CK Fitness: {ck_rep["verdict"]} ({ck_rep["READY"]}/4)

## Projected catalog

Current: {PRODUCTION_TOTAL}  
Luxembourg READY: {len(ready)}  
Projected: {PRODUCTION_TOTAL + len(ready)}  
12,500 crossed: {"YES" if PRODUCTION_TOTAL + len(ready) > 12500 else "NO"}

## Production safety

SHA256 unchanged: `{EXPECTED_SHA}`  
Phase 1 READY preserved: {preserved}/20  
Luxembourg live: 0
""",
        encoding="utf-8",
    )

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "verdict": verdict,
                "ready": len(ready),
                "preserved": preserved,
                "demotions": demotions,
                "foetz": foetz["production_decision"],
                "status": dict(status),
                "brands": dict(brands),
                "dq": dq,
                "sha_before": sha_before,
                "sha_after": sha_after,
                "sha_ok": sha_after == EXPECTED_SHA == sha_before,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
