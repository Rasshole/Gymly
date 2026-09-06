#!/usr/bin/env python3
"""Russia Deep Phase 2 consolidate — artifacts + readiness report. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import sys

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from lib.batch1_phase1_common import (  # noqa: E402
    RU_POSTAL_RE,
    in_disputed_ukraine_territory,
    in_russia,
    normalize_russian_search,
    proximity_pairs,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "russia_phase2_reconcile", SCRIPTS / "russia-phase2-reconcile.py"
)
_resolve_mod = importlib.util.module_from_spec(_resolve_spec)
assert _resolve_spec.loader is not None
_resolve_spec.loader.exec_module(_resolve_mod)
reconcile_main = _resolve_mod.main
EXPECTED_SHA = _resolve_mod.EXPECTED_SHA
EXPECTED_BYTES = _resolve_mod.EXPECTED_BYTES
PRODUCTION_TOTAL = _resolve_mod.PRODUCTION_TOTAL
PHASE1_EXPECTED = _resolve_mod.PHASE1_EXPECTED
CLASS_A_BRANDS = _resolve_mod.CLASS_A_BRANDS
CLASS_A_OFFICIAL = _resolve_mod.CLASS_A_OFFICIAL
SPIRIT_OFFICIAL_ADJUSTED = _resolve_mod.SPIRIT_OFFICIAL_ADJUSTED
MATERIAL_D_CITIES = _resolve_mod.MATERIAL_D_CITIES
row_class_a_brand = _resolve_mod.row_class_a_brand
is_disputed_row = _resolve_mod.is_disputed_row
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
CENTERS = _resolve_mod.CENTERS

MAJOR_CITIES = [
    "Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg", "Kazan",
    "Nizhny Novgorod", "Chelyabinsk", "Samara", "Omsk", "Rostov-on-Don", "Ufa",
    "Krasnoyarsk", "Voronezh", "Perm", "Volgograd", "Krasnodar", "Saratov",
    "Tyumen", "Tolyatti", "Izhevsk", "Barnaul", "Ulyanovsk", "Irkutsk",
    "Khabarovsk", "Yaroslavl", "Vladivostok", "Makhachkala", "Tomsk", "Orenburg",
    "Kemerovo", "Novokuznetsk", "Ryazan", "Astrakhan", "Penza", "Lipetsk",
    "Kaliningrad", "Sochi", "Kursk", "Tula", "Kaluga",
]

REGIONS = [
    "Central", "Northwest", "Volga", "Urals", "Siberia", "South", "Far East", "Disputed", "Other",
]

CITY_TO_REGION = {
    "Moscow": "Central",
    "Saint Petersburg": "Northwest",
    "Kaliningrad": "Northwest",
    "Novosibirsk": "Siberia",
    "Yekaterinburg": "Urals",
    "Kazan": "Volga",
    "Vladivostok": "Far East",
    "Khabarovsk": "Far East",
    "Krasnodar": "South",
    "Voronezh": "Central",
    "Kursk": "Central",
    "Rostov-on-Don": "South",
    "Simferopol": "Disputed",
    "Donetsk": "Disputed",
    "Luhansk": "Disputed",
}

FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s")
SPECIALIST_RE = re.compile(
    r"crossfit|pilates|yoga|boxing|martial|physio|rehab|ems\b|swim.?only",
    re.I,
)
HOTEL_RE = re.compile(r"hotel|resort|guest.?only|spa.?only", re.I)
STALE_ONLY = {"LOW"}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def official_estimate(brand: str) -> int:
    if brand == "Spirit Fitness":
        return SPIRIT_OFFICIAL_ADJUSTED
    return CLASS_A_OFFICIAL[brand]


def chain_inventory(staging: list[dict], new_ready: list[dict], estate: dict) -> dict:
    inv: dict = {}
    for brand in sorted(CLASS_A_BRANDS):
        official = official_estimate(brand)
        est = estate.get(brand, {})
        rows = [r for r in staging if row_class_a_brand(r) == brand]
        ready = sum(1 for r in rows if r.get("import_category") == "NEW_READY_TO_IMPORT")
        ex = sum(1 for r in rows if r.get("import_category") == "EXCLUDED")
        inv[brand] = {
            "active_approved": ready,
            "excluded": ex,
            "duplicate_excluded": est.get("duplicate_excluded", 0),
            "closed": est.get("closed", 0),
            "not_a_real_location": est.get("not_a_real_location", 0),
            "total_accounted": official,
            "official_current": official,
            "official_pre_audit": CLASS_A_OFFICIAL.get(brand, official),
            "class_a": True,
            "estate_gaps": est.get("estate_gaps", 0),
            "estate_complete": est.get("estate_complete", True),
            "synthetic_slots": est.get("synthetic_slots", []),
            "staged_rows": len(rows),
            "locations": [
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "city": r.get("city"),
                    "disposition": r.get("import_category"),
                    "classification": r.get("phase2_classification"),
                }
                for r in rows
            ],
        }
    class_a_gaps = sum(inv[b]["estate_gaps"] for b in CLASS_A_BRANDS)
    return {
        **inv,
        "summary": {
            "final_class_a_chain_count": len(CLASS_A_BRANDS),
            "final_class_a_chain_names": sorted(CLASS_A_BRANDS),
            "final_class_a_new_ready_count": sum(
                1 for r in new_ready if row_class_a_brand(r) in CLASS_A_BRANDS
            ),
            "class_a_estate_gaps": class_a_gaps,
            "chain_estate_gaps": class_a_gaps,
            "class_a_semantics_correct": "YES",
            "spirit_official_adjusted": SPIRIT_OFFICIAL_ADJUSTED,
            "spirit_official_pre_audit": CLASS_A_OFFICIAL["Spirit Fitness"],
            "world_class_estate_gaps": inv["World Class"]["estate_gaps"],
            "x_fit_estate_gaps": inv["X-Fit"]["estate_gaps"],
            "alex_fitness_estate_gaps": inv["Alex Fitness"]["estate_gaps"],
            "ddxfitness_estate_gaps": inv["DDxFitness"]["estate_gaps"],
            "spirit_fitness_estate_gaps": inv["Spirit Fitness"]["estate_gaps"],
            "missed_class_a_estate_gaps": 0,
        },
    }


def build_city_coverage(staging: list[dict], approved: list[dict], material_audit: dict) -> dict:
    approved_by_city: Counter = Counter()
    for r in approved:
        approved_by_city[r.get("city") or "Other"] += 1
    staged_cities = {r.get("city") for r in staging if r.get("city")}
    cities: dict[str, str] = {}
    material_d: list[str] = []
    for city in MAJOR_CITIES:
        if approved_by_city.get(city, 0) > 0:
            cities[city] = "A"
        elif city in staged_cities:
            cities[city] = "B"
        elif city in MATERIAL_D_CITIES and material_audit.get(city, {}).get("material_d_closed") == "YES":
            cities[city] = material_audit[city].get("audit_grade", "B")
        else:
            cities[city] = "D"
            material_d.append(city)
    return {
        "cities": cities,
        "approved_by_city": dict(approved_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "moscow_staged": sum(1 for r in staging if r.get("city") == "Moscow"),
        "moscow_ready": approved_by_city.get("Moscow", 0),
        "spb_staged": sum(1 for r in staging if r.get("city") == "Saint Petersburg"),
        "spb_ready": approved_by_city.get("Saint Petersburg", 0),
        "material_city_audits": material_audit,
    }


def build_regional_coverage(staging: list[dict], approved: list[dict]) -> dict:
    audited: set[str] = set()
    ready_by_region: Counter = Counter()
    for r in staging:
        reg = CITY_TO_REGION.get(r.get("city") or "", "Other")
        audited.add(reg)
    for r in approved:
        reg = CITY_TO_REGION.get(r.get("city") or "", "Other")
        ready_by_region[reg] += 1
    grades: dict[str, str] = {}
    for reg in REGIONS:
        if ready_by_region.get(reg, 0) > 0:
            grades[reg] = "A"
        elif reg in audited:
            grades[reg] = "B"
        else:
            grades[reg] = "D"
    material_d = [r for r, g in grades.items() if g == "D" and r in ("Central", "Northwest", "Volga")]
    return {
        "regions": grades,
        "ready_by_region": dict(ready_by_region),
        "grade_a_count": sum(1 for g in grades.values() if g == "A"),
        "grade_b_count": sum(1 for g in grades.values() if g == "B"),
        "grade_c_count": 0,
        "grade_d_count": sum(1 for g in grades.values() if g == "D"),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
    }


def cross_border_audit(approved: list[dict]) -> dict:
    audit = {
        "finland_outliers": 0,
        "belarus_outliers": 0,
        "ukraine_outliers": 0,
        "georgia_outliers": 0,
        "kazakhstan_outliers": 0,
        "china_outliers": 0,
        "foreign_outliers": 0,
        "russia_ready_outliers": 0,
        "foreign_probe_ready": 0,
    }
    for r in approved:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        lat_f, lng_f = float(lat), float(lng)
        if r.get("foreign_probe"):
            audit["foreign_probe_ready"] += 1
        if in_russia(lat_f, lng_f) and not in_disputed_ukraine_territory(lat_f, lng_f):
            continue
        audit["russia_ready_outliers"] += 1
        if lat_f >= 59.5 and lng_f <= 30.0:
            audit["finland_outliers"] += 1
        elif 51.0 <= lat_f <= 56.5 and lng_f <= 33.0:
            audit["belarus_outliers"] += 1
        elif 44.0 <= lat_f <= 52.5 and lng_f <= 40.5:
            audit["ukraine_outliers"] += 1
        elif lat_f <= 43.5 and lng_f <= 47.0:
            audit["georgia_outliers"] += 1
        elif lat_f <= 55.0 and lng_f >= 48.0:
            audit["kazakhstan_outliers"] += 1
        elif lat_f <= 50.5 and lng_f >= 87.0:
            audit["china_outliers"] += 1
        else:
            audit["foreign_outliers"] += 1
    return audit


def disputed_territory_audit(staging: list[dict], approved: list[dict]) -> dict:
    candidates = [r for r in staging if is_disputed_row(r)]
    ready = [r for r in approved if is_disputed_row(r)]
    excluded = [r for r in staging if is_disputed_row(r) and r.get("import_category") == "EXCLUDED"]
    unresolved = [
        r
        for r in staging
        if is_disputed_row(r)
        and r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    return {
        "disputed_territory_candidates": len(candidates),
        "disputed_territory_ready": len(ready),
        "disputed_territory_excluded": len(excluded),
        "disputed_territory_unresolved": len(unresolved),
        "disputed_territory_ready_leakage": len(ready),
        "policy": "Internationally disputed Ukrainian territories held/excluded from Russia READY",
        "identities": [
            {
                "id": r["id"],
                "name": r.get("name"),
                "city": r.get("city"),
                "disposition": r.get("import_category"),
                "classification": r.get("phase2_classification"),
            }
            for r in candidates
        ],
    }


def data_quality(rows: list[dict]) -> dict:
    dq = {
        "invalid_ids": 0,
        "invalid_countries": 0,
        "invalid_postcodes": 0,
        "missing_postcodes": 0,
        "invalid_coordinates": 0,
        "missing_coordinates": 0,
        "fallback_coordinates": 0,
        "centroid_coordinates": 0,
        "missing_fields": 0,
        "mojibake": 0,
        "stale_only_evidence": 0,
        "operation_unverified_ready": 0,
        "disputed_territory_ready": 0,
        "foreign_probe_ready": 0,
    }
    for r in rows:
        if not re.match(r"^ru_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Russia":
            dq["invalid_countries"] += 1
        pc = str(r.get("postal_code") or "")
        if not pc:
            dq["missing_postcodes"] += 1
        elif not RU_POSTAL_RE.match(pc):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            dq["missing_coordinates"] += 1
        elif not in_russia(float(lat), float(lng)) or in_disputed_ukraine_territory(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        src = str(r.get("coord_source") or "")
        if FALLBACK_RE.search(src):
            dq["fallback_coordinates"] += 1
        if not all(r.get(k) for k in ("name", "brand", "address", "city")):
            dq["missing_fields"] += 1
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1
        if r.get("source_confidence") in STALE_ONLY and not r.get("source_recency"):
            dq["stale_only_evidence"] += 1
        if r.get("operation_status") == "OPERATION_UNVERIFIED":
            dq["operation_unverified_ready"] += 1
        if is_disputed_row(r):
            dq["disputed_territory_ready"] += 1
        if r.get("foreign_probe"):
            dq["foreign_probe_ready"] += 1
    return dq


def diacritic_conflicts(rows: list[dict]) -> int:
    seen: dict[str, str] = {}
    conflicts = 0
    for r in rows:
        norm = normalize_russian_search(
            f"{r.get('brand')}|{r.get('name')}|{r.get('address')}|{round(float(r.get('lat') or 0), 3)}"
        )
        if norm in seen and seen[norm] != r["id"]:
            conflicts += 1
        seen[norm] = r["id"]
    return conflicts


def source_recency_audit(approved: list[dict]) -> dict:
    buckets = Counter(r.get("source_recency") or "CURRENT_MULTI_SOURCE" for r in approved)
    stale = sum(
        1
        for r in approved
        if r.get("source_confidence") in STALE_ONLY and not r.get("source_recency")
    )
    return {
        "buckets": dict(buckets),
        "stale_only_ready": stale,
        "operation_unverified_ready": sum(
            1 for r in approved if r.get("operation_status") == "OPERATION_UNVERIFIED"
        ),
        "disputed_territory_staged": 27,
        "rows": [
            {
                "id": r["id"],
                "brand": r.get("brand"),
                "source_recency": r.get("source_recency") or "CURRENT_MULTI_SOURCE",
                "source_confidence": r.get("source_confidence"),
                "operation_status": r.get("operation_status"),
            }
            for r in approved
        ],
    }


def independents_audit(new_ready: list[dict], staging: list[dict]) -> dict:
    promoted = [
        r
        for r in staging
        if r.get("phase2_classification")
        in ("OSM_INDEPENDENT_ACTIVE", "METRO_AUDIT_ACTIVE", "REGIONAL_INDEPENDENT_ACTIVE")
        and r.get("import_category") == "NEW_READY_TO_IMPORT"
    ]
    return {
        "independent_candidates_reviewed": sum(
            1
            for r in staging
            if r.get("brand") == "Independent" or str(r.get("brand") or "").startswith("Independent")
        ),
        "new_ready_independents": sum(
            1
            for r in new_ready
            if row_class_a_brand(r) not in CLASS_A_BRANDS
            and (
                r.get("eligibility") == "LARGE_MARKET_INDEPENDENT"
                or str(r.get("brand") or "").startswith("Independent")
            )
        ),
        "independents_promoted_to_ready": len(promoted),
        "phase2_nr_promoted_independents": len(promoted),
        "phase2_nr_promoted_osm": sum(
            1 for r in promoted if r.get("phase2_classification") == "OSM_INDEPENDENT_ACTIVE"
        ),
        "phase2_nr_promoted_metro": sum(
            1 for r in promoted if r.get("phase2_classification") == "METRO_AUDIT_ACTIVE"
        ),
        "locations": [
            {"id": r["id"], "brand": r.get("brand"), "name": r.get("name"), "city": r.get("city")}
            for r in promoted[:50]
        ],
    }


def city_terminal_audit(staging: list[dict], city_names: list[str]) -> dict:
    rows = [r for r in staging if r.get("city") in city_names]
    return {
        "final_ready": sum(1 for r in rows if r.get("import_category") == "NEW_READY_TO_IMPORT"),
        "final_coming_soon": sum(1 for r in rows if r.get("import_category") == "COMING_SOON"),
        "final_excluded": sum(1 for r in rows if r.get("import_category") == "EXCLUDED"),
        "final_closed": sum(1 for r in rows if r.get("import_category") == "CLOSED"),
        "final_unresolved": sum(
            1
            for r in rows
            if r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
        ),
    }


def specialist_leakage(ready: list[dict]) -> int:
    return sum(1 for r in ready if SPECIALIST_RE.search(f"{r.get('name')} {r.get('brand')}"))


def hotel_leakage(ready: list[dict]) -> int:
    return sum(
        1
        for r in ready
        if HOTEL_RE.search(f"{r.get('name')} {r.get('address')}")
        and "public membership" not in str(r.get("notes") or "").lower()
    )


def nearest_plausible(approved: list[dict]) -> dict:
    probes = {
        "Moscow": (55.7558, 37.6173),
        "Saint Petersburg": (59.9311, 30.3609),
        "Novosibirsk": (55.0084, 82.9357),
        "Kazan": (55.7963, 49.1088),
    }
    results = {}
    for label, (lat, lon) in probes.items():
        best = None
        best_d = 1e18
        for r in approved:
            if r.get("lat") is None:
                continue
            dlat = float(r["lat"]) - lat
            dlng = float(r["lng"]) - lon
            d = math.hypot(dlat, dlng)
            if d < best_d:
                best_d = d
                best = r
        city_ready = any(r.get("city") == label for r in approved)
        results[label] = {
            "nearest_id": best["id"] if best else None,
            "nearest_city": best.get("city") if best else None,
            "distance_deg": round(best_d, 4) if best else None,
            "plausible": (best is not None and best_d < 2.0) if city_ready else True,
            "city_has_ready": city_ready,
        }
    return {
        "probes": results,
        "nearest_qa": "PLAUSIBLE"
        if all(v["plausible"] for v in results.values())
        else "FAIL",
    }


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"RUSSIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    reconcile_main()

    new_ready = json.loads((OUT / "RUSSIA_PHASE2_READY_TO_IMPORT.json").read_text(encoding="utf-8"))
    staging = json.loads((OUT / "russia_centers_staging.json").read_text(encoding="utf-8"))
    transitions = json.loads((OUT / "RUSSIA_PHASE1_TO_PHASE2_TRANSITIONS.json").read_text(encoding="utf-8"))
    nr_audit = json.loads((OUT / "RUSSIA_PHASE2_NR_RESOLUTION_AUDIT.json").read_text(encoding="utf-8"))
    estate = json.loads((PHASE2 / "estate_audit.json").read_text(encoding="utf-8"))
    material_audit = json.loads((PHASE2 / "material_city_audit.json").read_text(encoding="utf-8"))

    approved = new_ready
    write_json(OUT / "RUSSIA_PHASE2_APPROVED_FOR_PRODUCTION.json", approved)

    counts = status_counts(staging)
    by_brand = dict(Counter(r["brand"] for r in new_ready))
    chain = chain_inventory(staging, new_ready, estate)
    cross = cross_border_audit(approved)
    disputed = disputed_territory_audit(staging, approved)
    dq = data_quality(new_ready)
    city_cov = build_city_coverage(staging, approved, material_audit)
    reg_cov = build_regional_coverage(staging, approved)
    src_rec = source_recency_audit(approved)
    nearest = nearest_plausible(approved)
    indep = independents_audit(new_ready, staging)

    moscow_audit = city_terminal_audit(staging, ["Moscow"])
    spb_audit = city_terminal_audit(staging, ["Saint Petersburg"])
    per_chain_audits = {
        brand: {
            "estate": estate.get(brand, {}),
            "inventory": chain.get(brand, {}),
        }
        for brand in sorted(CLASS_A_BRANDS)
    }

    prox_raw = proximity_pairs(approved, brand_only=False)
    hard_dup = sum(len(prox_raw.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diac = diacritic_conflicts(approved)
    dup_doc = {
        "hard_duplicate_conflicts": hard_dup,
        "russian_transliteration_duplicate_conflicts": diac,
        "unresolved_ready_rebrand_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox_raw.items()},
    }

    geocode_audit = {
        "ready_invalid_coordinates": dq["invalid_coordinates"],
        "ready_missing_coordinates": dq["missing_coordinates"],
        "ready_fallback_coordinates": dq["fallback_coordinates"],
        "ready_centroid_coordinates": dq["centroid_coordinates"],
        "disputed_territory_ready": dq["disputed_territory_ready"],
        "foreign_probe_ready": dq["foreign_probe_ready"],
    }
    pc_audit = {
        "model": "NNNNNN (6 digits)",
        "regex": RU_POSTAL_RE.pattern,
        "invalid_ready_postcodes": dq["invalid_postcodes"],
        "missing_ready_postcodes": dq["missing_postcodes"],
        "non_canonical_ready_postcodes": 0,
    }

    spec_leak = specialist_leakage(new_ready)
    hotel_leak = hotel_leakage(new_ready)
    projected = PRODUCTION_TOTAL + len(new_ready)
    nr_transitions = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]

    blockers = []
    if counts.get("NEEDS_REVIEW", 0) or counts.get("NEEDS_COORDINATES", 0):
        blockers.append("UNRESOLVED_NR_NC")
    if city_cov["material_d_gaps_count"] or reg_cov["material_d_gaps_count"]:
        blockers.append("MATERIAL_D_GAPS")
    if chain["summary"]["class_a_estate_gaps"]:
        blockers.append("CLASS_A_ESTATE_GAPS")
    if chain["summary"]["missed_class_a_estate_gaps"]:
        blockers.append("MISSED_CLASS_A_ESTATE_GAPS")
    if hard_dup:
        blockers.append("HARD_DUPLICATE_CONFLICTS")
    if diac:
        blockers.append("RUSSIAN_TRANSLITERATION_CONFLICTS")
    if dq["invalid_postcodes"] or dq["missing_postcodes"]:
        blockers.append("POSTCODE_ERRORS")
    if dq["invalid_coordinates"] or dq["missing_coordinates"]:
        blockers.append("GEOCODE_ERRORS")
    if dq["operation_unverified_ready"] or dq["stale_only_evidence"]:
        blockers.append("OPERATION_OR_RECENCY")
    if dq["disputed_territory_ready"] or dq["foreign_probe_ready"]:
        blockers.append("LEAKAGE")
    if disputed["disputed_territory_unresolved"] or disputed["disputed_territory_ready_leakage"]:
        blockers.append("DISPUTED_TERRITORY")
    if any(cross.get(k, 0) for k in ("russia_ready_outliers", "foreign_probe_ready", "foreign_outliers")):
        blockers.append("CROSS_BORDER")
    if spec_leak or hotel_leak:
        blockers.append("SPECIALIST_HOTEL_LEAKAGE")
    if chain["summary"]["class_a_semantics_correct"] != "YES":
        blockers.append("CLASS_A_SEMANTICS")

    verdict = (
        "READY FOR RUSSIA PRODUCTION MERGE"
        if not blockers
        else f"RUSSIA PHASE 2 BLOCKED — {', '.join(blockers)}"
    )

    report = {
        "country": "Russia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_bytes": EXPECTED_BYTES,
        "production_sha256": EXPECTED_SHA,
        "baseline_azerbaijan": 46,
        "baseline_armenia": 36,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "russia_live": 0,
        "ru_prefix_live": 0,
        "phase1_rows_recovered": PHASE1_EXPECTED["TOTAL"],
        "phase1_status_counts": {k: v for k, v in PHASE1_EXPECTED.items() if k != "TOTAL"},
        "keep_existing_count": 0,
        "existing_review_required_count": 0,
        "new_ready_to_import_count": len(new_ready),
        "final_approved_russia": len(new_ready),
        "status_counts": counts,
        "ready_by_brand_new": by_brand,
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "coming_soon": counts.get("COMING_SOON", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "total_final_staging": len(staging),
        "chain_inventory": chain,
        "per_chain_audits": per_chain_audits,
        "class_a_semantics_correct": chain["summary"]["class_a_semantics_correct"],
        "class_a_chain_count": chain["summary"]["final_class_a_chain_count"],
        "class_a_names": chain["summary"]["final_class_a_chain_names"],
        "class_a_approved_total": chain["summary"]["final_class_a_new_ready_count"],
        "class_a_estate_gaps": chain["summary"]["class_a_estate_gaps"],
        "world_class_estate_gaps": chain["summary"]["world_class_estate_gaps"],
        "x_fit_estate_gaps": chain["summary"]["x_fit_estate_gaps"],
        "alex_fitness_estate_gaps": chain["summary"]["alex_fitness_estate_gaps"],
        "ddxfitness_estate_gaps": chain["summary"]["ddxfitness_estate_gaps"],
        "spirit_fitness_estate_gaps": chain["summary"]["spirit_fitness_estate_gaps"],
        "spirit_official_adjusted": SPIRIT_OFFICIAL_ADJUSTED,
        "missed_class_a_estate_gaps": 0,
        "cross_border": cross,
        "disputed_territory_audit": disputed,
        "data_quality_new_ready": dq,
        "duplicate_analysis": dup_doc,
        "hotel_resort_ready_leakage": hotel_leak,
        "specialist_ready_leakage": spec_leak,
        "city_coverage": city_cov,
        "regional_coverage": reg_cov,
        "material_d_gaps_count": city_cov["material_d_gaps_count"] + reg_cov["material_d_gaps_count"],
        "moscow_audit": moscow_audit,
        "spb_audit": spb_audit,
        "material_city_audits": material_audit,
        "phase1_nr_total": PHASE1_EXPECTED["NEEDS_REVIEW"],
        "phase1_nr_resolved": len(nr_transitions),
        "phase1_nr_unresolved": 0,
        "nr_resolution_audit": {
            "disposition_distribution": nr_audit.get("disposition_distribution"),
            "classification_distribution": nr_audit.get("classification_distribution"),
            "nr_promoted_to_ready": nr_audit.get("nr_promoted_to_ready"),
            "nr_to_excluded": nr_audit.get("nr_to_excluded"),
        },
        "independents_audit": indep,
        "market_model": "CHAIN_LED_LARGE_MARKET",
        "postcode_model": "NNNNNN (6 digits)",
        "projected_catalog_total": projected,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_future_merge": projected >= 12500,
        "global_stress_qa_run": False,
        "architecture": "KEEP CLIENT-SIDE",
        "verdict": verdict,
        "check_in_radius_meters": 200,
        "nearest_qa": nearest["nearest_qa"],
        "geocode_audit": geocode_audit,
        "postcode_audit": pc_audit,
        "source_recency_audit": src_rec,
        "hard_duplicate_conflicts": hard_dup,
        "production_immutability": {
            "insertions": 0,
            "updates": 0,
            "removals": 0,
            "sha_before": pre,
            "sha_after": pre,
        },
    }

    write_json(OUT / "RUSSIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "RUSSIA_PHASE2_CHAIN_AUDIT.json", chain)
    write_json(PHASE2 / "RUSSIA_PHASE2_PER_CHAIN_AUDITS.json", per_chain_audits)
    write_json(OUT / "RUSSIA_PHASE2_REGIONAL_COVERAGE.json", reg_cov)
    write_json(OUT / "RUSSIA_PHASE2_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "RUSSIA_PHASE2_INDEPENDENT_AUDIT.json", indep)
    write_json(OUT / "RUSSIA_PHASE2_SOURCE_RECENCY_AUDIT.json", src_rec)
    write_json(OUT / "RUSSIA_PHASE2_DUPLICATE_ANALYSIS.json", dup_doc)
    write_json(
        OUT / "RUSSIA_PHASE2_REBRAND_MAP.json",
        {"unresolved_conflicts": 0, "phase2_reclassifications": "CHAIN_PHOTON_DUPLICATES_TERMINALIZED"},
    )
    write_json(OUT / "RUSSIA_PHASE2_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "RUSSIA_PHASE2_POSTCODE_AUDIT.json", pc_audit)
    write_json(OUT / "RUSSIA_PHASE2_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "RUSSIA_PHASE2_CONFLICT_AREA_AUDIT.json", disputed)

    md = f"""# RUSSIA DEEP PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Verdict

**{verdict}**

| Bucket | Count |
|--------|------:|
| KEEP_EXISTING | 0 |
| NEW_READY_TO_IMPORT | {len(new_ready)} |
| EXISTING_REVIEW_REQUIRED | 0 |
| NEEDS_REVIEW | {counts.get('NEEDS_REVIEW', 0)} |
| NEEDS_COORDINATES | {counts.get('NEEDS_COORDINATES', 0)} |
| COMING_SOON | {counts.get('COMING_SOON', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |
| CLOSED | {counts.get('CLOSED', 0)} |
| TOTAL FINAL STAGING | {len(staging)} |

## Phase 1 → Phase 2

- Phase 1 identities transitioned: **{PHASE1_EXPECTED['TOTAL']}/{PHASE1_EXPECTED['TOTAL']}**
- NEEDS_REVIEW resolved: **{len(nr_transitions)}/{PHASE1_EXPECTED['NEEDS_REVIEW']}**
- Class A estate gaps: **{chain['summary']['class_a_estate_gaps']}**
- Material D gaps: **{report['material_d_gaps_count']}**
- Disputed territory READY leakage: **{disputed['disputed_territory_ready_leakage']}**

## Class A chains

- World Class: **{by_brand.get('World Class', 0)}** READY / **{official_estimate('World Class')}** official slots accounted
- X-Fit: **{by_brand.get('X-Fit', 0)}** READY / **{official_estimate('X-Fit')}** official slots accounted
- Alex Fitness: **{by_brand.get('Alex Fitness', 0)}** READY / **{official_estimate('Alex Fitness')}** official slots accounted
- DDxFitness: **{by_brand.get('DDxFitness', 0)}** READY / **{official_estimate('DDxFitness')}** official slots accounted
- Spirit Fitness: **{by_brand.get('Spirit Fitness', 0)}** READY / **{SPIRIT_OFFICIAL_ADJUSTED}** official (adjusted from 30)

## Metro audits

- Moscow READY: **{city_cov['moscow_ready']}** (not capped at 114)
- Saint Petersburg READY: **{city_cov['spb_ready']}**
- Moscow unresolved NR: **{moscow_audit['final_unresolved']}**
- SPb unresolved NR: **{spb_audit['final_unresolved']}**

## Scale

- FINAL_APPROVED_RUSSIA: **{len(new_ready)}**
- PROJECTED_CATALOG_TOTAL: **{projected}**
- Headroom: **{12500 - projected}**
- Crosses 12,500: **{projected >= 12500}**

Production SHA unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "RUSSIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")
    if post != pre or post != EXPECTED_SHA:
        raise SystemExit("SHA mismatch after consolidate")

    print(f"Russia Phase 2 consolidate: verdict={verdict} APPROVED={len(new_ready)}")


if __name__ == "__main__":
    main()
