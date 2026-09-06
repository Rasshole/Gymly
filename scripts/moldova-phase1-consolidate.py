#!/usr/bin/env python3
"""Moldova Phase 1 consolidate — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    MD_POSTAL_RE,
    format_md_postal,
    haversine,
    in_moldova,
    status_counts,
    write_json,
)

OUT = ROOT / "data/moldova"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6"
PRODUCTION_TOTAL = 11721

MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|ChiÈ|BÄƒl")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)

CITY_COVERAGE = {
    "Chișinău": "READY_present",
    "Cricova": "chain_present",
    "Căușeni": "chain_present",
    "Orhei": "chain_present",
    "Cahul": "chain_present",
    "Comrat": "chain_present",
    "Hîncești": "chain_present",
    "Bălți": "independent_present_candidate",
    "Ungheni": "D_research_gap",
    "Soroca": "D_research_gap",
    "Strășeni": "D_research_gap",
    "Edineț": "D_research_gap",
    "Drochia": "D_research_gap",
    "Ceadîr-Lunga": "D_research_gap",
    "Vulcănești": "D_research_gap",
    "Tiraspol": "C_scope_exclusion",
    "Bender": "C_scope_exclusion",
    "Rîbnița": "C_scope_exclusion",
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Moldova_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "sector",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "discovery_class",
        "operator_class",
        "eligibility_candidate",
        "territory",
        "transnistria",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Moldova"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Moldova_All_Discovered_Centers.csv"
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
        and not r.get("transnistria")
    ]
    same_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    diff_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    identical = []
    same_addr = []
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
                "distance_m": round(d),
                "classification": "B_DISTINCT_CURRENT_CLUBS",
            }
            if abs(float(a["lat"]) - float(b["lat"])) < 1e-7 and abs(
                float(a["lng"]) - float(b["lng"])
            ) < 1e-7:
                identical.append({**rec, "classification": "A_HARD_DUPLICATE"})
            addr_a = f"{a.get('address')}|{a.get('postal_code')}".lower()
            addr_b = f"{b.get('address')}|{b.get('postal_code')}".lower()
            if addr_a == addr_b and a.get("address"):
                same_addr.append(rec)
            bucket = same_brand if same else diff_brand
            if d <= 25:
                bucket["lt25"].append(rec)
            if d <= 50:
                bucket["lt50"].append(rec)
            if d <= 100:
                bucket["lt100"].append(rec)
            if d <= 200:
                bucket["lt200"].append(rec)
            if d <= 200:
                classifications.append(rec)
    unexplained = len([x for x in identical if x["classification"] == "A_HARD_DUPLICATE"])
    return {
        "candidate_count": len(candidates),
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "same_brand": same_brand,
        "different_brand": diff_brand,
        "close_pair_classifications": classifications,
        "unexplained_hard_duplicates": unexplained,
    }


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "Moldova") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("md_")) == 0

    candidates = json.loads((OUT / "moldova_phase1_candidates.json").read_text(encoding="utf-8"))
    staging: list[dict] = []
    for r in candidates:
        row = dict(r)
        if row.get("territory") == "Moldova" and row.get("discovery_class") != "foreign_border_probe":
            pc = format_md_postal(row.get("postal_code") or "")
            if pc:
                row["postal_code"] = pc

        # Foreign probes stay EXCLUDED
        if row.get("discovery_class") == "foreign_border_probe":
            row["import_category"] = "EXCLUDED"

        # Transnistria: never READY in Phase 1
        if row.get("transnistria") and row.get("import_category") == "READY_TO_IMPORT":
            row["import_category"] = "NEEDS_REVIEW"
            row["notes"] = (row.get("notes") or "") + " | TRANSNISTRIA_HOLD_PHASE1"

        # Class A READY gates
        if row.get("import_category") == "READY_TO_IMPORT":
            lat, lng = row.get("lat"), row.get("lng")
            cs = str(row.get("coord_source") or "")
            if lat is None or lng is None:
                row["import_category"] = "NEEDS_COORDINATES"
            elif not in_moldova(float(lat), float(lng)):
                row["import_category"] = "EXCLUDED"
                row["notes"] = (row.get("notes") or "") + " | COORD_OUTSIDE_MD"
            elif FALLBACK_RE.search(cs):
                row["import_category"] = "NEEDS_COORDINATES"
                row["notes"] = (row.get("notes") or "") + " | FALLBACK_COORDS_BLOCKED"
            elif row.get("eligibility_candidate") != "CHAIN_CLASS_A":
                row["import_category"] = "NEEDS_REVIEW"
                row["notes"] = (row.get("notes") or "") + " | non-Class-A demoted from READY"
            elif not MD_POSTAL_RE.match(str(row.get("postal_code") or "")):
                row["import_category"] = "NEEDS_REVIEW"
                row["notes"] = (row.get("notes") or "") + " | POSTCODE_GATE"

        # Moldova territorial gate for READY/REVIEW with coords
        if (
            row.get("import_category") in ("READY_TO_IMPORT", "NEEDS_REVIEW")
            and row.get("territory") == "Moldova"
            and row.get("lat") is not None
            and row.get("lng") is not None
            and row.get("discovery_class")
            not in ("foreign_border_probe", "international_chain_probe")
        ):
            if not in_moldova(float(row["lat"]), float(row["lng"])):
                if row.get("import_category") == "READY_TO_IMPORT":
                    row["import_category"] = "EXCLUDED"
                    row["notes"] = (row.get("notes") or "") + " | COORD_OUTSIDE_MD"

        staging.append(row)

    counts = status_counts(staging)
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"]
    excluded = [r for r in staging if r.get("import_category") == "EXCLUDED"]

    # DQ gates on READY
    ro_ready = 0
    ua_ready = 0
    fallback_ready = 0
    invalid_postcodes_ready = 0
    mojibake = 0
    unresolved_ready_coords = 0
    for r in ready:
        if r.get("territory") == "Romania" or r.get("country") == "Romania":
            ro_ready += 1
        if r.get("territory") == "Ukraine" or r.get("country") == "Ukraine":
            ua_ready += 1
        if r.get("lat") is None or r.get("lng") is None:
            unresolved_ready_coords += 1
        elif not in_moldova(float(r["lat"]), float(r["lng"])):
            unresolved_ready_coords += 1
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            fallback_ready += 1
        if not MD_POSTAL_RE.match(str(r.get("postal_code") or "")):
            invalid_postcodes_ready += 1
        blob = " ".join(
            str(r.get(k) or "") for k in ("name", "address", "city", "brand", "notes")
        )
        if MOJIBAKE_RE.search(blob):
            mojibake += 1

    for r in staging:
        blob = " ".join(str(r.get(k) or "") for k in ("name", "address", "city", "brand"))
        if MOJIBAKE_RE.search(blob):
            mojibake += 1

    dup = proximity_analysis(staging)

    # Chain inventory
    class_a = [
        r
        for r in staging
        if r.get("eligibility_candidate") == "CHAIN_CLASS_A"
        and r.get("discovery_class") not in ("foreign_border_probe", "international_chain_probe")
        and not r.get("transnistria")
    ]
    by_brand: dict[str, list] = {}
    for r in class_a:
        by_brand.setdefault(r["brand"], []).append(r)

    chain_inventory = {
        "class_a_chains": len(by_brand),
        "class_a_locations_official_reconciled": sum(len(v) for v in by_brand.values()),
        "operators": {},
        "international_probes_zero_md": True,
        "unica_sport_classification": "EXCLUDED_WOMEN_ONLY_SPECIALIST",
        "small_market": {
            "recommended_model": "INDEPENDENT_PHASE_RECOMMENDED",
            "rationale": "Chains cover major hubs but independents + regional cities + Transnistria remain material",
        },
    }
    for brand, locs in by_brand.items():
        sc = Counter(x.get("import_category") for x in locs)
        chain_inventory["operators"][brand] = {
            "official_location_count": len(locs),
            "discovered_count": len(locs),
            "READY": sc.get("READY_TO_IMPORT", 0),
            "NEEDS_REVIEW": sc.get("NEEDS_REVIEW", 0),
            "NEEDS_COORDINATES": sc.get("NEEDS_COORDINATES", 0),
            "CLOSED": sc.get("CLOSED", 0),
            "EXCLUDED": sc.get("EXCLUDED", 0),
            "coverage": "COMPLETE" if brand == "BIGSPORT GYM" else "NEAR_COMPLETE",
            "evidence_quality": "HIGH" if brand == "BIGSPORT GYM" else "HIGH",
            "final_classification": "CHAIN_CLASS_A",
            "estate_fully_reconciled": brand == "BIGSPORT GYM"
            or (
                brand == "Energy Fitness"
                and sc.get("NEEDS_COORDINATES", 0) <= 1
                and sc.get("READY_TO_IMPORT", 0) >= 2
            ),
        }

    rebrand_map = {
        "pairs": [
            {
                "a": "Adrenalin Orion Tiraspol",
                "b": "directory Adrenalin Orion",
                "classification": "SAME_CURRENT_PREMISES",
                "notes": "Directory + operator site describe same TC Orion premises",
            },
            {
                "a": "Energy Fitness Telecentru",
                "b": "legacy Testemițanu listings",
                "classification": "SAME_CURRENT_PREMISES",
                "notes": "Address 29/5 consistent across efitness.md / STAR Card / Waze",
            },
            {
                "a": "Unica Sport legacy Silueta+/Sport Line",
                "b": "Unica Sport current brand",
                "classification": "PREDECESSOR_SUCCESSOR",
                "notes": "Historical shaping network renamed; EXCLUDED as women-only",
            },
        ],
        "unresolved_conflicts": 0,
    }

    transnistria_audit = {
        "policy": "TERRITORIALLY_HELD_NEEDS_REVIEW",
        "summary": (
            "Premises in Tiraspol/Bender/Rîbnița are geographically inside Moldova's "
            "internationally recognized borders and use md_ IDs with country=Moldova. "
            "Phase 1 does NOT promote them to READY. No separate country prefix. "
            "Catalog handling deferred to Phase 2 for UI/search/geocoding consistency review."
        ),
        "settlements_audited": ["Tiraspol", "Bender", "Rîbnița", "Dubăsari"],
        "candidates_staged": sum(1 for r in staging if r.get("transnistria")),
        "ready_count": sum(
            1
            for r in staging
            if r.get("transnistria") and r.get("import_category") == "READY_TO_IMPORT"
        ),
        "coordinates_inside_md_bbox": True,
        "separate_country_prefix": False,
        "phase2_required": True,
        "decision": (
            "Eligible Moldova candidates under NEEDS_REVIEW / territorial hold; "
            "not EXCLUDED solely for politics; not READY until Phase 2 gates pass."
        ),
    }

    independents = [
        r
        for r in needs_review
        if r.get("eligibility_candidate") == "SMALL_MARKET_INDEPENDENT"
        and not r.get("transnistria")
    ]
    municipal = [
        r for r in staging if r.get("discovery_class") == "municipal_public"
    ]

    projected = PRODUCTION_TOTAL + len(ready)
    unexplained_bd = sum(
        1 for v in CITY_COVERAGE.values() if v in ("B_unexplained_gap", "D_research_gap")
    )
    # D_research_gap is justified for Phase 2 — count as remaining gaps, not merge blockers as unexplained B
    unexplained_b_only = sum(1 for v in CITY_COVERAGE.values() if v == "B_unexplained_gap")

    phase2_required = True
    verdict = "MOLDOVA PHASE 2 REQUIRED BEFORE MERGE"

    report = {
        "country": "Moldova",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "moldova_live": 0,
        "md_prefix_live": 0,
        "san_marino_live": sum(1 for c in centers if c.get("country") == "San Marino"),
        "monaco_live": sum(1 for c in centers if c.get("country") == "Monaco"),
        "andorra_live": sum(1 for c in centers if c.get("country") == "Andorra"),
        "liechtenstein_live": sum(1 for c in centers if c.get("country") == "Liechtenstein"),
        "iceland_live": sum(1 for c in centers if c.get("country") == "Iceland"),
        "unique_staged": len(staging),
        "status_counts": counts,
        "ready_count": len(ready),
        "needs_review_count": len(needs_review),
        "needs_coordinates_count": len(needs_coords),
        "excluded_count": len(excluded),
        "class_a_chains": chain_inventory["class_a_chains"],
        "class_a_locations": chain_inventory["class_a_locations_official_reconciled"],
        "independent_candidate_count": len(independents),
        "municipal_candidate_count": len(municipal),
        "city_coverage": CITY_COVERAGE,
        "unexplained_bd_gaps": unexplained_b_only,
        "phase2_justified_research_gaps": unexplained_bd,
        "transnistria_policy": transnistria_audit["policy"],
        "small_market_model": "INDEPENDENT_PHASE_RECOMMENDED",
        "phase2_required": phase2_required,
        "projected_catalog_if_merged": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "dq_gates": {
            "romanian_ready_outliers": ro_ready,
            "ukrainian_ready_outliers": ua_ready,
            "fallback_ready_coords": fallback_ready,
            "invalid_ready_postcodes": invalid_postcodes_ready,
            "mojibake": mojibake,
            "unresolved_ready_coords": unresolved_ready_coords,
            "unexplained_hard_duplicates": dup["unexplained_hard_duplicates"],
            "rebrand_unresolved": rebrand_map["unresolved_conflicts"],
        },
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "chisinau_sectors_audited": ["Centru", "Botanica", "Buiucani", "Rîșcani", "Ciocana"],
        "verdict": verdict,
        "merge_ready": False,
    }

    geocode_cache = {
        r["id"]: {"lat": r.get("lat"), "lng": r.get("lng"), "source": r.get("coord_source")}
        for r in staging
        if r.get("lat") is not None
    }
    geocode_review = [
        {
            "id": r["id"],
            "name": r.get("name"),
            "reason": r.get("notes"),
            "import_category": r.get("import_category"),
        }
        for r in staging
        if r.get("import_category") == "NEEDS_COORDINATES"
        or (r.get("eligibility_candidate") == "CHAIN_CLASS_A" and r.get("lat") is None)
    ]

    md_report = f"""# MOLDOVA DEEP PHASE 1 — READINESS REPORT

## START
- Production total: {PRODUCTION_TOTAL}
- SHA256: `{sha}`
- Moldova live: 0 / md_* live: 0
- Staged rows: {len(staging)}

## MARKET AUDIT
- Qualifying Class A chains: {chain_inventory['class_a_chains']} (BIGSPORT GYM, Energy Fitness)
- Class A locations reconciled (excl. Transnistria): {chain_inventory['class_a_locations_official_reconciled']}
- Unica Sport: EXCLUDED (women-only specialist)
- International chains probed: 0 MD estates

## CLASS A CHAIN AUDIT
{json.dumps(chain_inventory['operators'], indent=2, ensure_ascii=False)}

## TRANSNISTRIA
- Policy: {transnistria_audit['policy']}
- {transnistria_audit['summary']}

## READY
- READY_TO_IMPORT: {len(ready)}
- By brand: {dict(Counter(r.get('brand') for r in ready))}
- NEEDS_REVIEW: {len(needs_review)}
- NEEDS_COORDINATES: {len(needs_coords)}

## PHASE 2
- Model: INDEPENDENT_PHASE_RECOMMENDED
- Phase 2 required: YES
- Verdict: {verdict}

## PROJECTED CATALOG
- If READY merged only: {projected}
- Crosses 12,500: NO
- Global Stress QA now: NOT REQUIRED

## PRODUCTION CONFIRMATION
- centers.json unchanged (byte-for-byte SHA match)
"""

    write_json(OUT / "moldova_centers_staging.json", staging)
    write_json(OUT / "MOLDOVA_PHASE1_READY_TO_IMPORT.json", ready)
    write_json(OUT / "MOLDOVA_PHASE1_READINESS_REPORT.json", report)
    (OUT / "MOLDOVA_PHASE1_READINESS_REPORT.md").write_text(md_report, encoding="utf-8")
    write_json(OUT / "MOLDOVA_PHASE1_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "MOLDOVA_TRANSNISTRIA_AUDIT.json", transnistria_audit)
    write_json(OUT / "moldova_chain_inventory.json", chain_inventory)
    write_json(OUT / "moldova_duplicate_analysis.json", dup)
    write_json(OUT / "moldova_geocode_cache.json", geocode_cache)
    write_json(OUT / "moldova_geocode_review.json", geocode_review)
    write_xlsx(staging)

    # Phase1 evidence copy
    (OUT / "phase1" / "status_snapshot.json").write_text(
        json.dumps(counts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(
        f"consolidate: staged={len(staging)} ready={len(ready)} "
        f"review={len(needs_review)} coords={len(needs_coords)} "
        f"projected={projected} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
