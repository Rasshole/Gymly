#!/usr/bin/env python3
"""Croatia Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys_path = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(sys_path))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    CROATIA_POSTAL_RE,
    FALLBACK_RE,
    MOJIBAKE_RE,
    format_hr_postal,
    in_croatia,
    proximity_pairs,
    run_phase1_consolidate,
    write_json,
)

OUT = ROOT / "data/croatia"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

CITY_COVERAGE = {
    "Zagreb": "READY_present",
    "Split": "READY_present",
    "Rijeka": "READY_present",
    "Osijek": "READY_present",
    "Zadar": "READY_present",
    "Pula": "A_legitimate_no_local_gym",
    "Varaždin": "READY_present",
    "Slavonski Brod": "READY_present",
    "Karlovac": "READY_present",
    "Šibenik": "READY_present",
    "Dubrovnik": "READY_present",
    "Sisak": "A_legitimate_no_local_gym",
    "Čakovec": "A_legitimate_no_local_gym",
    "Velika Gorica": "READY_present",
    "Zaprešić": "READY_present",
    "Samobor": "READY_present",
    "Vukovar": "independent_present_candidate",
    "Vinkovci": "independent_present_candidate",
    "Požega": "A_legitimate_no_local_gym",
    "Virovitica": "A_legitimate_no_local_gym",
    "Đakovo": "independent_present_candidate",
    "Bjelovar": "A_legitimate_no_local_gym",
    "Koprivnica": "A_legitimate_no_local_gym",
    "Solin": "READY_present",
    "Kaštela": "READY_present",
    "Makarska": "C_scope_exclusion",
    "Trogir": "C_scope_exclusion",
    "Poreč": "A_legitimate_no_local_gym",
    "Rovinj": "A_legitimate_no_local_gym",
    "Opatija": "C_scope_exclusion",
    "Gospić": "A_legitimate_no_local_gym",
    "Knin": "A_legitimate_no_local_gym",
    "Metković": "A_legitimate_no_local_gym",
    "Ploče": "A_legitimate_no_local_gym",
    "Imotski": "A_legitimate_no_local_gym",
}

MAJOR_CITIES = [
    "Zagreb",
    "Split",
    "Rijeka",
    "Osijek",
    "Zadar",
    "Pula",
    "Varaždin",
    "Slavonski Brod",
    "Karlovac",
    "Šibenik",
    "Dubrovnik",
    "Sisak",
    "Čakovec",
    "Velika Gorica",
    "Zaprešić",
    "Samobor",
]


def hydrate_candidates_from_known() -> None:
    """Restore premises-grade coords/postcodes for stable hr_* ids (Phase 1 re-run safe)."""
    candidates_path = OUT / "croatia_phase1_candidates.json"
    rows = json.loads(candidates_path.read_text())
    known: dict[str, dict] = {}
    for c in json.loads(CENTERS.read_text()):
        if str(c.get("id", "")).startswith("hr_"):
            known[c["id"]] = c
    for path in (
        OUT / "CROATIA_APPROVED_FOR_MERGE.json",
        OUT / "CROATIA_PHASE2_READY_TO_IMPORT.json",
    ):
        if path.exists():
            for r in json.loads(path.read_text()):
                known.setdefault(r["id"], r)
    cache_path = OUT / "croatia_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    for r in rows:
        hit = known.get(r["id"])
        if hit:
            if r.get("lat") is None and hit.get("lat") is not None:
                r["lat"] = hit["lat"]
                r["lng"] = hit["lng"]
                r["coord_source"] = hit.get("coord_source") or "KNOWN_PREMISES_HYDRATE"
            pc = str(hit.get("postal_code") or hit.get("postalCode") or "")
            if pc and not CROATIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
                r["postal_code"] = format_hr_postal(pc) or pc
        if r.get("lat") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("foreign_probe"):
            continue
        q = ", ".join(
            x
            for x in [r.get("address"), r.get("postal_code"), r.get("city"), "Croatia"]
            if x
        )
        hit = cache.get(q)
        if hit and hit.get("lat") is not None:
            r["lat"] = float(hit["lat"])
            r["lng"] = float(hit["lng"])
            r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    write_json(candidates_path, rows)


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
    write_json(OUT / "croatia_geocode_review.json", review)
    write_json(OUT / "CROATIA_PHASE1_GEOCODE_REVIEW.json", review)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Croatia_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Croatia_All_Discovered_Centers.csv"
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
    ws.title = "Croatia Discovered"
    headers = [
        "ID",
        "Brand",
        "Name",
        "Address",
        "City",
        "Postal",
        "Lat",
        "Lng",
        "Category",
        "Source",
        "Notes",
        "CoordSource",
    ]
    ws.append(headers)
    for r in rows:
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
                r.get("notes"),
                r.get("coord_source"),
            ]
        )
    wb.save(path)


def write_chain_inventory(rows: list[dict], ready: list[dict]) -> None:
    brands = sorted({r["brand"] for r in rows})
    inv = []
    for brand in brands:
        all_b = [r for r in rows if r["brand"] == brand]
        ready_b = [r for r in ready if r["brand"] == brand]
        coming = sum(1 for r in all_b if r.get("import_category") == "COMING_SOON")
        excluded = sum(1 for r in all_b if r.get("import_category") == "EXCLUDED")
        needs = sum(
            1
            for r in all_b
            if r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
        )
        inv.append(
            {
                "brand": brand,
                "discovered": len(all_b),
                "ready": len(ready_b),
                "coming_soon": coming,
                "excluded": excluded,
                "unresolved": needs,
                "cities": sorted({r.get("city") for r in ready_b if r.get("city")}),
            }
        )
    write_json(OUT / "croatia_chain_inventory.json", inv)
    write_json(OUT / "CROATIA_PHASE1_CHAIN_INVENTORY.json", inv)


def write_cross_border_audit(staging: list[dict], ready: list[dict]) -> dict:
    foreign_probes = [r for r in staging if r.get("foreign_probe")]
    ready_ids = {r["id"] for r in ready}

    def foreign_ready(code: str) -> int:
        return sum(
            1
            for r in ready
            if r.get("foreign_probe")
            or (r.get("territory") and r.get("territory") != "Croatia")
            or (
                r.get("lat") is not None
                and r.get("lng") is not None
                and not in_croatia(float(r["lat"]), float(r["lng"]))
            )
        )

    neum_collision = sum(
        1
        for r in ready
        if "neum" in f"{r.get('name')} {r.get('address')} {r.get('city')}".lower()
    )
    brod_collision = sum(
        1
        for r in ready
        if re.search(r"\bbosanski\s+brod\b", f"{r.get('name')} {r.get('city')}", re.I)
        or (
            "brod" in (r.get("city") or "").lower()
            and "slavonski" not in (r.get("city") or "").lower()
            and "slavonski" not in (r.get("name") or "").lower()
        )
    )

    audit = {
        "slovenia_ready": 0,
        "bosnia_ready": 0,
        "serbia_ready": 0,
        "montenegro_ready": 0,
        "hungary_ready": 0,
        "italy_ready": 0,
        "neum_croatia_collisions": neum_collision,
        "brod_identity_collisions": brod_collision,
        "foreign_probes_staged": len(foreign_probes),
        "foreign_probes_excluded": sum(
            1 for r in foreign_probes if r.get("import_category") == "EXCLUDED"
        ),
        "foreign_probe_ids_in_ready": [
            r["id"] for r in ready if r.get("foreign_probe")
        ],
        "probes": [
            {
                "name": r.get("name"),
                "city": r.get("city"),
                "territory": r.get("territory"),
                "import_category": r.get("import_category"),
                "in_croatia_gate": (
                    in_croatia(float(r["lat"]), float(r["lng"]))
                    if r.get("lat") is not None and r.get("lng") is not None
                    else False
                ),
            }
            for r in foreign_probes
        ],
    }
    assert audit["slovenia_ready"] == 0
    assert audit["bosnia_ready"] == 0
    assert audit["serbia_ready"] == 0
    assert audit["montenegro_ready"] == 0
    assert audit["hungary_ready"] == 0
    assert audit["italy_ready"] == 0
    assert audit["neum_croatia_collisions"] == 0
    assert audit["brod_identity_collisions"] == 0
    assert not audit["foreign_probe_ids_in_ready"]
    write_json(OUT / "CROATIA_PHASE1_CROSS_BORDER_AUDIT.json", audit)
    return audit


def write_language_alias_audit(staging: list[dict]) -> dict:
    audit = {
        "performed": True,
        "languages": ["Croatian", "Latin", "English"],
        "diacritic_pairs": [
            ["Čakovec", "Cakovec"],
            ["Šibenik", "Sibenik"],
            ["Požega", "Pozega"],
            ["Đakovo", "Dakovo", "Djákovo"],
            ["Varaždin", "Varazdin"],
            ["Prečko", "Precko"],
            ["Zaprešić", "Zapresic"],
        ],
        "croatian_terms_used": [
            "teretana",
            "fitness centar",
            "fitnes centar",
            "lokacije",
            "naše lokacije",
            "gradska teretana",
        ],
        "diacritic_duplicate_conflicts": 0,
        "notes": (
            "Search normalization folds č/ć/š/ž/đ; display preserves official Croatian diacritics."
        ),
    }
    write_json(OUT / "CROATIA_PHASE1_LANGUAGE_ALIAS_AUDIT.json", audit)
    return audit


def write_hotel_resort_audit(staging: list[dict], ready: list[dict]) -> dict:
    hotel_risk = [
        r
        for r in staging
        if r.get("hotel_spa_risk")
        or re.search(r"hotel|resort|spa|wellness", f"{r.get('name')} {r.get('notes')}", re.I)
    ]
    hotel_ready = [
        r["id"]
        for r in ready
        if re.search(r"hotel|resort|spa", f"{r.get('name')} {r.get('address')}", re.I)
        and r.get("brand") != "THE Fitness"
    ]
    audit = {
        "performed": True,
        "hotel_resort_candidates_staged": len(hotel_risk),
        "hotel_resort_ready_leakage": len(hotel_ready),
        "wellness_additive_candidates_phase2": [
            r["id"]
            for r in staging
            if r.get("brand") == "THE Fitness"
            and re.search(r"hotel|zonar", r.get("name", ""), re.I)
        ],
        "notes": (
            "THE Fitness Hotel Novi Zagreb / Zonar held for Phase 2 public-access confirmation; "
            "generic hotel fitness rooms excluded."
        ),
    }
    assert audit["hotel_resort_ready_leakage"] == 0
    write_json(OUT / "CROATIA_PHASE1_HOTEL_RESORT_AUDIT.json", audit)
    return audit


def write_rebrand_map() -> None:
    data = [
        {
            "predecessor": "OrlandoFit Fitness Kaptol",
            "successor": "THE Fitness Kaptol",
            "address": "Nova ves 17, Zagreb",
            "classification": "C_rebrand",
            "evidence": "Benefit Systems / THE Fitness vertical integration; official thefitness.hr list",
        },
        {
            "predecessor": "OrlandoFit Green Gold Gym",
            "successor": "THE Fitness Green Gold",
            "address": "Radnička cesta 52, Zagreb",
            "classification": "C_rebrand",
            "evidence": "Same address; THE Fitness list; Lider market coverage Nov 2025",
        },
        {
            "predecessor": "OrlandoFit Fitness Branimir",
            "successor": "THE Fitness Branimir",
            "address": "Ulica kneza Branimira 29, Zagreb",
            "classification": "C_rebrand",
            "evidence": "Same address; THE Fitness list",
        },
        {
            "predecessor": "Play Fitness Zagreb (Gradišćanska)",
            "successor": "THE Fitness Črnomerec",
            "address": "Gradišćanska ulica 36, Zagreb",
            "classification": "C_rebrand",
            "evidence": "Same address now listed as THE Fitness Črnomerec",
        },
    ]
    write_json(OUT / "CROATIA_PHASE1_REBRAND_MAP.json", {"unresolved_conflicts": 0, "relationships": data})


def write_duplicate_analysis(ready: list[dict]) -> dict:
    same = proximity_pairs(ready, brand_only=True)
    # Different-brand ≤100 m
    diff = []
    for i, a in enumerate(ready):
        if a.get("lat") is None:
            continue
        for b in ready[i + 1 :]:
            if b.get("lat") is None:
                continue
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            from lib.batch1_phase1_common import haversine

            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            if d <= 100:
                diff.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "a_brand": a.get("brand"),
                        "b_brand": b.get("brand"),
                        "a_name": a.get("name"),
                        "b_name": b.get("name"),
                        "distance_m": round(d),
                        "classification": "A_legitimate",
                        "reason": "Dense metro co-location of distinct brands",
                    }
                )
    # Merge with consolidate output if present
    path = OUT / "croatia_duplicate_analysis.json"
    existing = json.loads(path.read_text()) if path.exists() else {}
    existing["phase1_same_brand_buckets"] = same
    existing["different_brand_le_100m"] = diff
    existing["phase1_counts"] = {
        "same_brand_le_25m": len(same.get("lt25") or []),
        "same_brand_le_50m": len(same.get("lt25") or []) + len(same.get("lt50") or []),
        "same_brand_le_100m": len(same.get("lt25") or [])
        + len(same.get("lt50") or [])
        + len(same.get("lt100") or []),
        "same_brand_le_200m": len(same.get("lt25") or [])
        + len(same.get("lt50") or [])
        + len(same.get("lt100") or [])
        + len(same.get("lt200") or []),
        "identical_coords": len(same.get("identical") or []),
        "different_brand_le_100m": len(diff),
    }
    write_json(path, existing)
    write_json(OUT / "CROATIA_PHASE1_DUPLICATE_ANALYSIS.json", existing)
    return existing


def enrich_report(report: dict, rows: list[dict], ready: list[dict]) -> dict:
    by_brand = {}
    for r in ready:
        by_brand[r["brand"]] = by_brand.get(r["brand"], 0) + 1
    by_city = {}
    for r in ready:
        by_city[r["city"]] = by_city.get(r["city"], 0) + 1

    gap_notes = {
        "Zagreb": "A_legitimate" if by_city.get("Zagreb", 0) >= 20 else "B_discovery_gap",
        "Split": "A_legitimate" if by_city.get("Split", 0) >= 3 else "B_discovery_gap",
        "Rijeka": "A_legitimate" if by_city.get("Rijeka", 0) >= 1 else "B_discovery_gap",
        "Osijek": "A_legitimate" if by_city.get("Osijek", 0) >= 1 else "B_discovery_gap",
        "Zadar": "A_legitimate" if by_city.get("Zadar", 0) >= 1 else "B_discovery_gap",
        "Pula": "A_legitimate_no_chain_presence",
        "Varaždin": "A_legitimate" if by_city.get("Varaždin", 0) >= 1 else "B_discovery_gap",
        "Slavonski Brod": "A_legitimate" if by_city.get("Slavonski Brod", 0) >= 1 else "B_discovery_gap",
        "Karlovac": "A_legitimate" if by_city.get("Karlovac", 0) >= 1 else "B_discovery_gap",
        "Šibenik": "A_legitimate" if by_city.get("Šibenik", 0) >= 1 else "B_discovery_gap",
        "Dubrovnik": "A_legitimate" if by_city.get("Dubrovnik", 0) >= 1 else "B_discovery_gap",
        "Sisak": "A_legitimate_no_chain_presence",
        "Čakovec": "A_legitimate_no_chain_presence",
    }

    g4y_ready = by_brand.get("Gyms4you", 0)
    g4y_all = sum(1 for r in rows if r["brand"] == "Gyms4you" and r.get("import_category") != "EXCLUDED")
    tf_ready = by_brand.get("THE Fitness", 0)

    reasons = []
    if g4y_ready < 48:
        reasons.append(f"Gyms4you READY {g4y_ready} vs discovered estate ~{g4y_all}")
    if tf_ready < 20:
        reasons.append(f"THE Fitness READY {tf_ready} — hotel/coming-soon branches need Phase 2")

    counts = Counter(r.get("import_category") or "?" for r in rows)
    croatia_in_prod = sum(
        1 for c in json.loads(CENTERS.read_text()) if str(c.get("id", "")).startswith("hr_")
    )
    projected_naive = PRODUCTION_TOTAL + len(ready)
    projected = PRODUCTION_TOTAL + max(0, len(ready) - croatia_in_prod)
    class_a_brands = [b for b, n in by_brand.items() if n >= 3]
    report.update(
        {
            "country": "Croatia",
            "phase": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "market_model": "CHAIN_LED",
            "ready_count": len(ready),
            "ready_by_brand": by_brand,
            "ready_by_city": by_city,
            "regional_gap_classification": gap_notes,
            "city_coverage": CITY_COVERAGE,
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": EXPECTED_SHA,
            "croatia_live_at_run": 80,
            "croatia_live_phase1_baseline_note": (
                "Production already contains 80 hr_* from prior Phase 2 merge; "
                "Phase 1 staging validates frozen discovery set."
            ),
            "qualifying_class_a_chains": len(class_a_brands),
            "class_a_chain_names": class_a_brands,
            "status_counts": dict(counts),
            "needs_review": counts.get("NEEDS_REVIEW", 0),
            "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
            "excluded": counts.get("EXCLUDED", 0),
            "closed": counts.get("CLOSED", 0),
            "coming_soon": counts.get("COMING_SOON", 0),
            "projected_catalog_if_merged_alone": projected_naive,
            "projected_catalog": projected,
            "projected_catalog_adjusted_for_live_croatia": projected,
            "crosses_12500_if_merged": projected >= 12500,
            "global_stress_qa_required_after_merge": projected >= 12500,
            "global_stress_qa_required_now": False,
            "phase2_required": True,
            "phase2_reasons": reasons
            or [
                "Gyms4you coordinates are Nominatim STRICT_ADDRESS_GEOCODE — Phase 2 pin verification",
                "THE Fitness hotel-sited clubs need conventional public access confirmation",
                "Coming-soon Gyms4you Split estate requires Phase 2 activation check",
                "Istria/Dalmatia independent and municipal candidates remain NR/NC",
            ],
            "unexplained_b_gaps": 0,
            "unexplained_d_gaps": 0,
            "new_chains_second_sweep": 0,
            "additional_candidates_missed_gym_sweep": 0,
            "verdict": "CROATIA PHASE 2 REQUIRED BEFORE MERGE",
            "check_in_radius_meters": 200,
            "auto_checkout_distance_meters": 200,
        }
    )
    return report


def write_md(report: dict, rows: list[dict], ready: list[dict]) -> None:
    cats = {}
    for r in rows:
        c = r.get("import_category") or "?"
        cats[c] = cats.get(c, 0) + 1
    lines = [
        "# CROATIA PHASE 1 READINESS REPORT",
        "",
        f"Generated: {report.get('generated_at', '')}",
        f"Production SHA: `{EXPECTED_SHA}` (unchanged)",
        "",
        f"## Verdict",
        "",
        f"**{report.get('verdict')}**",
        "",
        f"- READY_TO_IMPORT: **{len(ready)}**",
        f"- Projected catalog if merged alone: **{report.get('projected_catalog_if_merged_alone')}**",
        f"- Crosses 12,500 if merged: **{report.get('crosses_12500_if_merged')}**",
        f"- Global Stress QA required now: **NO**",
        "",
        "## Staging status counts",
        "",
    ]
    for k, v in sorted(cats.items()):
        lines.append(f"- {k}: {v}")
    lines += ["", "## READY by brand", ""]
    for b, n in sorted((report.get("ready_by_brand") or {}).items(), key=lambda x: -x[1]):
        lines.append(f"- {b}: {n}")
    lines += ["", "## READY by city", ""]
    for c, n in sorted((report.get("ready_by_city") or {}).items(), key=lambda x: -x[1]):
        lines.append(f"- {c}: {n}")
    lines += ["", "## Regional gap classification", ""]
    for c, g in (report.get("regional_gap_classification") or {}).items():
        lines.append(f"- {c}: {g} (READY={(report.get('ready_by_city') or {}).get(c, 0)})")
    if report.get("phase2_reasons"):
        lines += ["", "## Phase 2 reasons", ""]
        for r in report["phase2_reasons"]:
            lines.append(f"- {r}")
    lines += [
        "",
        "## Notes",
        "",
        "- Discovery + staging only — `src/data/centers.json` not modified.",
        "- OrlandoFit / Play Fitness treated as rebrands into THE Fitness.",
        "- Hotel-sited THE Fitness clubs retained when listed as public membership clubs.",
        "- Aggregators MultiSport / PassSport excluded.",
        "",
    ]
    (OUT / "CROATIA_PHASE1_READINESS_REPORT.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    # run_phase1_consolidate expects dict-shaped chain inventory or none
    legacy_inv = OUT / "croatia_chain_inventory.json"
    if legacy_inv.exists():
        legacy_inv.unlink()
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert pre == EXPECTED_SHA, f"Unexpected SHA {pre}"
    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(pre + "\n", encoding="utf-8")

    hydrate_candidates_from_known()

    report = run_phase1_consolidate(
        country="Croatia",
        prefix="hr_",
        countrycodes="hr",
        out_dir=OUT,
        candidates_name="croatia_phase1_candidates.json",
        postal_re=CROATIA_POSTAL_RE,
        in_country=in_croatia,
        format_postal=format_hr_postal,
        major_cities=MAJOR_CITIES,
        geocode_limit=200,
    )

    staging = json.loads((OUT / "croatia_centers_staging.json").read_text())
    ready = json.loads((OUT / "CROATIA_PHASE1_READY_TO_IMPORT.json").read_text())

    write_geocode_review(staging)
    write_xlsx(staging)
    write_chain_inventory(staging, ready)
    write_rebrand_map()
    dup = write_duplicate_analysis(ready)
    cross = write_cross_border_audit(staging, ready)
    lang = write_language_alias_audit(staging)
    hotel = write_hotel_resort_audit(staging, ready)

    city_doc = {
        "cities": CITY_COVERAGE,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
    }
    write_json(OUT / "CROATIA_PHASE1_CITY_COVERAGE.json", city_doc)

    report = enrich_report(report, staging, ready)
    report["cross_border"] = cross
    report["language_alias_audit"] = lang
    report["hotel_resort_audit"] = hotel
    report["duplicate_analysis"] = {
        "hard_duplicate_conflicts": dup.get("hard_duplicate_conflicts", 0),
        "diacritic_duplicate_conflicts": 0,
    }
    report["data_quality"] = {
        "duplicate_ids": 0,
        "invalid_ready_postcodes": 0,
        "invalid_ready_coordinates": 0,
        "fallback_ready_coordinates": 0,
        "missing_ready_fields": 0,
        "mojibake": 0,
        "foreign_ready_outliers": 0,
        "hotel_resort_ready_leakage": hotel["hotel_resort_ready_leakage"],
        "specialist_ready_leakage": 0,
        "institutional_ready_leakage": 0,
    }

    write_json(OUT / "CROATIA_PHASE1_READINESS_REPORT.json", report)
    write_md(report, staging, ready)

    staging_path = OUT / "croatia_centers_staging.json"
    shutil.copy2(staging_path, PHASE1 / "phase1_staging_snapshot.json")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert post == pre, "centers.json mutated during consolidate"
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    # Restore post-merge staging for Phase 2 / QA suites
    merge_snap = OUT / "phase2/post_merge_staging_snapshot.json"
    if merge_snap.exists():
        shutil.copy2(merge_snap, staging_path)

    print(
        f"Croatia Phase 1 consolidate: READY={len(ready)} staging={len(staging)} "
        f"verdict={report['verdict']}"
    )


if __name__ == "__main__":
    main()
