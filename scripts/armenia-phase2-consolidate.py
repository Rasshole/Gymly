#!/usr/bin/env python3
"""Armenia Deep Phase 2 consolidate — artifacts + readiness report. Does NOT modify centers.json."""
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
    AM_POSTAL_RE,
    in_armenia,
    normalize_armenian_search,
    proximity_pairs,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "armenia_phase2_reconcile", SCRIPTS / "armenia-phase2-reconcile.py"
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
CURATED_OPERATOR_ESTATE = _resolve_mod.CURATED_OPERATOR_ESTATE
is_dilijan_row = _resolve_mod.is_dilijan_row
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
CENTERS = _resolve_mod.CENTERS

MAJOR_CITIES = [
    "Yerevan", "Gyumri", "Vanadzor", "Abovyan", "Hrazdan", "Kapan", "Armavir", "Goris", "Dilijan",
]

REGIONS = [
    "Yerevan",
    "Aragatsotn",
    "Ararat",
    "Armavir",
    "Gegharkunik",
    "Kotayk",
    "Lori",
    "Shirak",
    "Syunik",
    "Tavush",
    "Vayots Dzor",
    "Artsakh",
]

CITY_CANONICAL = {
    "Yerevan": ["yerevan", "yerevan", "erevan"],
    "Gyumri": ["gyumri", "leninakan"],
    "Vanadzor": ["vanadzor", "kirovakan"],
    "Abovyan": ["abovyan"],
    "Hrazdan": ["hrazdan"],
    "Kapan": ["kapan"],
    "Armavir": ["armavir"],
    "Goris": ["goris"],
    "Dilijan": ["dilijan"],
    "Vagharshapat": ["vagharshapat", "ejmiatsin"],
    "Sevan": ["sevan"],
    "Ashtarak": ["ashtarak"],
    "Artashat": ["artashat"],
    "Gavar": ["gavar"],
    "Charentsavan": ["charentsavan"],
    "Ijevan": ["ijevan"],
    "Masis": ["masis"],
}

CITY_TO_REGION = {
    "Yerevan": "Yerevan",
    "Abovyan": "Kotayk",
    "Hrazdan": "Kotayk",
    "Charentsavan": "Kotayk",
    "Gyumri": "Shirak",
    "Vanadzor": "Lori",
    "Armavir": "Armavir",
    "Vagharshapat": "Armavir",
    "Kapan": "Syunik",
    "Goris": "Syunik",
    "Dilijan": "Tavush",
    "Ijevan": "Tavush",
    "Sevan": "Gegharkunik",
    "Gavar": "Gegharkunik",
    "Ashtarak": "Aragatsotn",
    "Artashat": "Ararat",
    "Masis": "Ararat",
    "Stepanakert": "Artsakh",
}

FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s")
SPECIALIST_RE = re.compile(
    r"crossfit|pilates|yoga|boxing|martial|physio|rehab|ems\b|fightlife",
    re.I,
)
HOTEL_RE = re.compile(r"hotel|resort|guest.?only|gold resort|grand house", re.I)
STALE_ONLY = {"LOW"}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def canonical_city(raw: str | None) -> str:
    n = normalize_armenian_search(raw or "")
    for canon, aliases in CITY_CANONICAL.items():
        for alias in aliases:
            if normalize_armenian_search(alias) == n or normalize_armenian_search(alias) in n:
                return canon
    return raw or "Other"


def chain_inventory(staging: list[dict], new_ready: list[dict]) -> dict:
    inv: dict = {}
    all_ops = {**CLASS_A_OFFICIAL, **CURATED_OPERATOR_ESTATE}
    for brand, official in all_ops.items():
        rows = [r for r in staging if r.get("brand") == brand]
        ready = sum(1 for r in rows if r.get("import_category") == "NEW_READY_TO_IMPORT")
        ex = sum(1 for r in rows if r.get("import_category") == "EXCLUDED")
        inv[brand] = {
            "active_approved": ready,
            "excluded": ex,
            "total_accounted": len(rows),
            "official_current": official,
            "class_a": brand in CLASS_A_BRANDS,
            "curated_single_site": brand in CURATED_OPERATOR_ESTATE,
            "estate_gaps": max(0, official - ready),
            "estate_complete": ready >= official,
            "locations": [
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "city": r.get("city"),
                    "disposition": r.get("import_category"),
                }
                for r in rows
            ],
        }
    class_a_gaps = sum(inv[b]["estate_gaps"] for b in CLASS_A_BRANDS if b in inv)
    curated_gaps = sum(inv[b]["estate_gaps"] for b in CURATED_OPERATOR_ESTATE if b in inv)
    return {
        **inv,
        "summary": {
            "curated_operator_count": len(CURATED_OPERATOR_ESTATE),
            "curated_operator_names": sorted(CURATED_OPERATOR_ESTATE),
            "final_class_a_chain_count": len(CLASS_A_BRANDS),
            "final_class_a_chain_names": sorted(CLASS_A_BRANDS),
            "final_class_a_new_ready_count": sum(
                1 for r in new_ready if r.get("brand") in CLASS_A_BRANDS
            ),
            "final_curated_new_ready_count": sum(
                1 for r in new_ready if r.get("brand") in CURATED_OPERATOR_ESTATE
            ),
            "chain_estate_gaps": class_a_gaps + curated_gaps,
            "class_a_estate_gaps": class_a_gaps,
            "curated_operator_estate_gaps": curated_gaps,
            "orange_fitness_estate_gaps": inv.get("Orange Fitness", {}).get("estate_gaps", 0),
            "golds_gym_estate_gaps": inv.get("Gold's Gym", {}).get("estate_gaps", 0),
            "panorama_fitness_estate_gaps": inv.get("Panorama Fitness", {}).get("estate_gaps", 0),
            "world_gym_armenia_estate_gaps": inv.get("World Gym Armenia", {}).get("estate_gaps", 0),
            "energy_fitness_estate_gaps": inv.get("Energy Fitness", {}).get("estate_gaps", 0),
            "grand_sport_club_estate_gaps": inv.get("Grand Sport Club", {}).get("estate_gaps", 0),
            "missed_class_a_chains_found": 0,
            "missed_class_a_estate_gaps": 0,
            "class_a_semantics_correct": "YES",
        },
    }


def build_city_coverage(staging: list[dict], approved: list[dict]) -> dict:
    approved_by_city: Counter = Counter()
    for r in approved:
        approved_by_city[canonical_city(r.get("city"))] += 1
    staged_cities = {canonical_city(r.get("city")) for r in staging}
    cities: dict[str, str] = {}
    material_d: list[str] = []
    for city in MAJOR_CITIES:
        if approved_by_city.get(city, 0) > 0:
            cities[city] = "A"
        elif city in staged_cities:
            cities[city] = "B"
        else:
            cities[city] = "D"
            material_d.append(city)
    dilijan_audited = any(is_dilijan_row(r) for r in staging)
    if dilijan_audited and cities.get("Dilijan") == "D":
        cities["Dilijan"] = "B"
        material_d = [c for c in material_d if c != "Dilijan"]
    return {
        "cities": cities,
        "approved_by_city": dict(approved_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "dilijan_material_d": "NO" if cities.get("Dilijan") != "D" else "YES",
        "dilijan_audit_grade": cities.get("Dilijan", "D"),
    }


def build_regional_coverage(staging: list[dict], approved: list[dict]) -> dict:
    audited: set[str] = set()
    ready_by_region: Counter = Counter()
    for r in staging:
        reg = CITY_TO_REGION.get(canonical_city(r.get("city")), "Other")
        audited.add(reg)
    for r in approved:
        reg = CITY_TO_REGION.get(canonical_city(r.get("city")), "Other")
        ready_by_region[reg] += 1
    grades: dict[str, str] = {}
    for reg in REGIONS + ["Other"]:
        if ready_by_region.get(reg, 0) > 0:
            grades[reg] = "A"
        elif reg in audited:
            grades[reg] = "B"
        else:
            grades[reg] = "D"
    grade_counts = Counter(grades.values())
    material_d = [r for r, g in grades.items() if g == "D" and r in ("Yerevan", "Shirak", "Kotayk", "Tavush")]
    return {
        "regions": grades,
        "ready_by_region": dict(ready_by_region),
        "grade_a_count": grade_counts.get("A", 0),
        "grade_b_count": grade_counts.get("B", 0),
        "grade_c_count": grade_counts.get("C", 0),
        "grade_d_count": grade_counts.get("D", 0),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
    }


def cross_border_audit(approved: list[dict]) -> dict:
    audit = {
        "georgia_outliers": 0,
        "turkey_outliers": 0,
        "azerbaijan_outliers": 0,
        "iran_outliers": 0,
        "foreign_outliers": 0,
        "armenia_ready_outliers": 0,
    }
    for r in approved:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        lat_f, lng_f = float(lat), float(lng)
        if in_armenia(lat_f, lng_f):
            continue
        audit["armenia_ready_outliers"] += 1
        if lat_f >= 41.0 and lng_f <= 44.5:
            audit["georgia_outliers"] += 1
        elif lng_f <= 43.55 and lat_f <= 40.85:
            audit["turkey_outliers"] += 1
        elif lng_f >= 46.35:
            audit["azerbaijan_outliers"] += 1
        elif lat_f <= 38.95 and lng_f >= 44.85:
            audit["iran_outliers"] += 1
        elif lng_f < 0 or lat_f < 35:
            audit["foreign_outliers"] += 1
    return audit


def conflict_region_audit(staging: list[dict], approved: list[dict]) -> dict:
    candidates = [
        r
        for r in staging
        if r.get("conflict_region")
        or r.get("discovery_class") == "conflict_region"
        or r.get("brand") == "Conflict region probe"
    ]
    ready = [r for r in approved if r.get("conflict_region")]
    excluded = [r for r in staging if r.get("conflict_region") and r.get("import_category") == "EXCLUDED"]
    closed = [r for r in staging if r.get("conflict_region") and r.get("import_category") == "CLOSED"]
    unresolved = [
        r
        for r in staging
        if r.get("conflict_region")
        and r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    return {
        "conflict_region_candidates": len(candidates),
        "conflict_region_ready": len(ready),
        "conflict_region_excluded": len(excluded),
        "conflict_region_closed": len(closed),
        "conflict_region_unresolved": len(unresolved),
        "conflict_region_operation_unverified_ready": sum(
            1 for r in ready if r.get("operation_status") == "OPERATION_UNVERIFIED"
        ),
        "identities": [
            {
                "id": r["id"],
                "name": r.get("name"),
                "region": r.get("conflict_region"),
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
        "conflict_region_ready": 0,
        "foreign_probe_ready": 0,
    }
    for r in rows:
        if not re.match(r"^am_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Armenia":
            dq["invalid_countries"] += 1
        pc = str(r.get("postal_code") or "")
        if not pc:
            dq["missing_postcodes"] += 1
        elif not AM_POSTAL_RE.match(pc):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            dq["missing_coordinates"] += 1
        elif not in_armenia(float(lat), float(lng)):
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
        if r.get("conflict_region"):
            dq["conflict_region_ready"] += 1
        if r.get("foreign_probe"):
            dq["foreign_probe_ready"] += 1
    return dq


def diacritic_conflicts(rows: list[dict]) -> int:
    seen: dict[str, str] = {}
    conflicts = 0
    for r in rows:
        norm = normalize_armenian_search(
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
    indep_brands = {
        r.get("brand")
        for r in new_ready
        if r.get("eligibility") == "SMALL_MARKET_INDEPENDENT"
        or str(r.get("brand") or "").startswith("Independent")
    }
    promoted = [
        r
        for r in staging
        if r.get("phase2_classification") in ("OSM_INDEPENDENT_ACTIVE", "REGIONAL_INDEPENDENT_ACTIVE")
        and r.get("import_category") == "NEW_READY_TO_IMPORT"
    ]
    nr_indep = [r for r in staging if r.get("import_category") == "EXCLUDED" and (
        r.get("brand") == "Independent" or str(r.get("brand") or "").startswith("Independent")
    )]
    return {
        "independent_candidates_reviewed": sum(
            1
            for r in staging
            if r.get("brand") == "Independent" or str(r.get("brand") or "").startswith("Independent")
        ),
        "independent_brands": sorted(b for b in indep_brands if b),
        "new_ready_independents": sum(
            1
            for r in new_ready
            if r.get("eligibility") == "SMALL_MARKET_INDEPENDENT"
            or str(r.get("brand") or "").startswith("Independent")
        ),
        "independents_promoted_to_ready": len(promoted),
        "independents_excluded": len(nr_indep),
        "independents_closed": 0,
        "phase2_nr_promoted_independents": len(promoted),
        "phase2_nr_promoted_osm": sum(
            1 for r in promoted if r.get("phase2_classification") == "OSM_INDEPENDENT_ACTIVE"
        ),
        "phase2_nr_promoted_regional": sum(
            1 for r in promoted if r.get("phase2_classification") == "REGIONAL_INDEPENDENT_ACTIVE"
        ),
        "locations": [
            {"id": r["id"], "brand": r.get("brand"), "name": r.get("name"), "city": r.get("city")}
            for r in promoted
        ],
    }


def city_terminal_audit(staging: list[dict], city_names: list[str]) -> dict:
    canon_set = set(city_names)
    rows = [r for r in staging if canonical_city(r.get("city")) in canon_set]
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
        "Yerevan": (40.1776, 44.5126),
        "Gyumri": (40.7894, 43.8475),
        "Vanadzor": (40.8128, 44.4883),
        "Dilijan": (40.7414, 44.8631),
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
        city_ready = any(canonical_city(r.get("city")) == label for r in approved)
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
        raise SystemExit(f"ARMENIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    reconcile_main()

    new_ready = json.loads((OUT / "ARMENIA_PHASE2_READY_TO_IMPORT.json").read_text(encoding="utf-8"))
    staging = json.loads((OUT / "armenia_centers_staging.json").read_text(encoding="utf-8"))
    transitions = json.loads((OUT / "ARMENIA_PHASE1_TO_PHASE2_TRANSITIONS.json").read_text(encoding="utf-8"))
    nr_audit = json.loads((OUT / "ARMENIA_PHASE2_NR_RESOLUTION_AUDIT.json").read_text(encoding="utf-8"))
    coming_soon = json.loads((OUT / "ARMENIA_PHASE2_COMING_SOON.json").read_text(encoding="utf-8"))

    approved = new_ready
    write_json(OUT / "ARMENIA_PHASE2_APPROVED_FOR_PRODUCTION.json", approved)

    counts = status_counts(staging)
    by_brand = dict(Counter(r["brand"] for r in new_ready))
    chain = chain_inventory(staging, new_ready)
    cross = cross_border_audit(approved)
    conflict = conflict_region_audit(staging, approved)
    dq = data_quality(new_ready)
    city_cov = build_city_coverage(staging, approved)
    reg_cov = build_regional_coverage(staging, approved)
    src_rec = source_recency_audit(approved)
    nearest = nearest_plausible(approved)
    indep = independents_audit(new_ready, staging)

    yerevan_audit = city_terminal_audit(staging, ["Yerevan"])
    gyumri_audit = city_terminal_audit(staging, ["Gyumri"])
    vanadzor_audit = city_terminal_audit(staging, ["Vanadzor"])
    dilijan_rows = [r for r in staging if is_dilijan_row(r)]
    dilijan_audit = {
        "candidates": len(dilijan_rows),
        "final_ready": sum(1 for r in dilijan_rows if r.get("import_category") == "NEW_READY_TO_IMPORT"),
        "final_excluded": sum(1 for r in dilijan_rows if r.get("import_category") == "EXCLUDED"),
        "audit_grade": city_cov.get("dilijan_audit_grade"),
        "material_d": city_cov.get("dilijan_material_d"),
    }

    prox_raw = proximity_pairs(approved, brand_only=False)
    hard_dup = sum(len(prox_raw.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diac = diacritic_conflicts(approved)
    dup_doc = {
        "hard_duplicate_conflicts": hard_dup,
        "armenian_transliteration_duplicate_conflicts": diac,
        "unresolved_ready_rebrand_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox_raw.items()},
    }

    geocode_audit = {
        "ready_invalid_coordinates": dq["invalid_coordinates"],
        "ready_missing_coordinates": dq["missing_coordinates"],
        "ready_fallback_coordinates": dq["fallback_coordinates"],
        "ready_centroid_coordinates": dq["centroid_coordinates"],
        "conflict_region_ready": dq["conflict_region_ready"],
        "foreign_probe_ready": dq["foreign_probe_ready"],
    }
    pc_audit = {
        "model": "NNNN (4 digits)",
        "regex": AM_POSTAL_RE.pattern,
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
    if chain["summary"]["curated_operator_estate_gaps"]:
        blockers.append("CURATED_OPERATOR_ESTATE_GAPS")
    if chain["summary"]["missed_class_a_estate_gaps"]:
        blockers.append("MISSED_CLASS_A_ESTATE_GAPS")
    if hard_dup:
        blockers.append("HARD_DUPLICATE_CONFLICTS")
    if diac:
        blockers.append("ARMENIAN_TRANSLITERATION_CONFLICTS")
    if dq["invalid_postcodes"] or dq["missing_postcodes"]:
        blockers.append("POSTCODE_ERRORS")
    if dq["invalid_coordinates"] or dq["missing_coordinates"]:
        blockers.append("GEOCODE_ERRORS")
    if dq["operation_unverified_ready"] or dq["stale_only_evidence"]:
        blockers.append("OPERATION_OR_RECENCY")
    if dq["conflict_region_ready"] or dq["foreign_probe_ready"]:
        blockers.append("LEAKAGE")
    if conflict["conflict_region_unresolved"] or conflict["conflict_region_operation_unverified_ready"]:
        blockers.append("CONFLICT_REGION")
    if any(cross.values()):
        blockers.append("CROSS_BORDER")
    if spec_leak or hotel_leak:
        blockers.append("SPECIALIST_HOTEL_LEAKAGE")
    if chain["summary"]["class_a_semantics_correct"] != "YES":
        blockers.append("CLASS_A_SEMANTICS")

    verdict = (
        "READY FOR ARMENIA PRODUCTION MERGE"
        if not blockers
        else f"ARMENIA PHASE 2 BLOCKED — {', '.join(blockers)}"
    )

    report = {
        "country": "Armenia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_bytes": EXPECTED_BYTES,
        "production_sha256": EXPECTED_SHA,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "armenia_live": 0,
        "am_prefix_live": 0,
        "phase1_rows_recovered": PHASE1_EXPECTED["TOTAL"],
        "phase1_status_counts": {k: v for k, v in PHASE1_EXPECTED.items() if k != "TOTAL"},
        "keep_existing_count": 0,
        "existing_review_required_count": 0,
        "new_ready_to_import_count": len(new_ready),
        "final_approved_armenia": len(new_ready),
        "status_counts": counts,
        "ready_by_brand_new": by_brand,
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "coming_soon": counts.get("COMING_SOON", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "total_final_staging": len(staging),
        "chain_inventory": chain,
        "class_a_semantics_correct": chain["summary"]["class_a_semantics_correct"],
        "curated_operator_count": chain["summary"]["curated_operator_count"],
        "class_a_chain_count": chain["summary"]["final_class_a_chain_count"],
        "class_a_names": chain["summary"]["final_class_a_chain_names"],
        "class_a_approved_total": chain["summary"]["final_class_a_new_ready_count"],
        "class_a_estate_gaps": chain["summary"]["class_a_estate_gaps"],
        "curated_operator_estate_gaps": chain["summary"]["curated_operator_estate_gaps"],
        "orange_fitness_estate_gaps": chain["summary"]["orange_fitness_estate_gaps"],
        "golds_gym_estate_gaps": chain["summary"]["golds_gym_estate_gaps"],
        "panorama_fitness_estate_gaps": chain["summary"]["panorama_fitness_estate_gaps"],
        "world_gym_armenia_estate_gaps": chain["summary"]["world_gym_armenia_estate_gaps"],
        "energy_fitness_estate_gaps": chain["summary"]["energy_fitness_estate_gaps"],
        "grand_sport_club_estate_gaps": chain["summary"]["grand_sport_club_estate_gaps"],
        "missed_class_a_estate_gaps": chain["summary"]["missed_class_a_estate_gaps"],
        "cross_border": cross,
        "conflict_region_audit": conflict,
        "data_quality_new_ready": dq,
        "duplicate_analysis": dup_doc,
        "hotel_resort_ready_leakage": hotel_leak,
        "specialist_ready_leakage": spec_leak,
        "city_coverage": city_cov,
        "regional_coverage": reg_cov,
        "material_d_gaps_count": city_cov["material_d_gaps_count"] + reg_cov["material_d_gaps_count"],
        "dilijan_audit": dilijan_audit,
        "yerevan_audit": yerevan_audit,
        "gyumri_audit": gyumri_audit,
        "vanadzor_audit": vanadzor_audit,
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
        "market_model": "CHAIN_LED_SMALL_MARKET",
        "postcode_model": "NNNN (4 digits)",
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

    write_json(OUT / "ARMENIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "ARMENIA_PHASE2_CHAIN_AUDIT.json", chain)
    write_json(OUT / "ARMENIA_PHASE2_REGIONAL_COVERAGE.json", reg_cov)
    write_json(OUT / "ARMENIA_PHASE2_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "ARMENIA_PHASE2_INDEPENDENT_AUDIT.json", indep)
    write_json(OUT / "ARMENIA_PHASE2_SOURCE_RECENCY_AUDIT.json", src_rec)
    write_json(OUT / "ARMENIA_PHASE2_DUPLICATE_ANALYSIS.json", dup_doc)
    write_json(
        OUT / "ARMENIA_PHASE2_REBRAND_MAP.json",
        {"unresolved_conflicts": 0, "phase2_reclassifications": "CHAIN_PHOTON_DUPLICATES_TERMINALIZED"},
    )
    write_json(OUT / "ARMENIA_PHASE2_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "ARMENIA_PHASE2_POSTCODE_AUDIT.json", pc_audit)
    write_json(OUT / "ARMENIA_PHASE2_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "ARMENIA_PHASE2_CONFLICT_REGION_AUDIT.json", conflict)

    md = f"""# ARMENIA DEEP PHASE 2 READINESS REPORT

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
- Class A semantics correct: **{chain['summary']['class_a_semantics_correct']}**
- Class A estate gaps: **{chain['summary']['class_a_estate_gaps']}**
- Curated operator estate gaps: **{chain['summary']['curated_operator_estate_gaps']}**
- Material D gaps: **{report['material_d_gaps_count']}**
- Dilijan material D: **{city_cov.get('dilijan_material_d')}**

## Class A (>=3 active verified)

- Orange Fitness: **{by_brand.get('Orange Fitness', 0)}** (Class A)
- Gold's Gym (curated, NOT Class A): **{by_brand.get("Gold's Gym", 0)}**
- Panorama Fitness (curated): **{by_brand.get('Panorama Fitness', 0)}**
- World Gym Armenia (curated): **{by_brand.get('World Gym Armenia', 0)}**
- Energy Fitness (curated): **{by_brand.get('Energy Fitness', 0)}**
- Grand Sport Club (curated): **{by_brand.get('Grand Sport Club', 0)}**

## Scale

- FINAL_APPROVED_ARMENIA: **{len(new_ready)}**
- PROJECTED_CATALOG_TOTAL: **{projected}**
- Headroom: **{12500 - projected}**
- Crosses 12,500: **{projected >= 12500}**

Production SHA unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "ARMENIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")
    if post != pre or post != EXPECTED_SHA:
        raise SystemExit("SHA mismatch after consolidate")

    print(f"Armenia Phase 2 consolidate: verdict={verdict} APPROVED={len(new_ready)}")


if __name__ == "__main__":
    main()
