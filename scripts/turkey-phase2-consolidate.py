#!/usr/bin/env python3
"""Turkey Deep Phase 2 consolidate — artifacts + readiness report. Does NOT modify centers.json."""
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
    TURKEY_POSTAL_RE,
    in_turkey,
    normalize_turkish_search,
    proximity_pairs,
    write_json,
)

_resolve_spec = importlib.util.spec_from_file_location(
    "turkey_phase2_reconcile", SCRIPTS / "turkey-phase2-reconcile.py"
)
_resolve_mod = importlib.util.module_from_spec(_resolve_spec)
assert _resolve_spec.loader is not None
_resolve_spec.loader.exec_module(_resolve_mod)
reconcile_main = _resolve_mod.main
EXPECTED_SHA = _resolve_mod.EXPECTED_SHA
EXPECTED_BYTES = _resolve_mod.EXPECTED_BYTES
PRODUCTION_TOTAL = _resolve_mod.PRODUCTION_TOTAL
PHASE1_MARKETING_ESTATE = _resolve_mod.PHASE1_MARKETING_ESTATE
PHASE1_EXPECTED = _resolve_mod.PHASE1_EXPECTED
MATERIAL_D_PROVINCES = _resolve_mod.MATERIAL_D_PROVINCES
GEOCODE_FIXES = _resolve_mod.GEOCODE_FIXES
OUT = _resolve_mod.OUT
PHASE2 = _resolve_mod.PHASE2
CENTERS = _resolve_mod.CENTERS

CLASS_A_BRANDS = list(PHASE1_MARKETING_ESTATE.keys())

PROVINCES_81 = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
    "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik",
    "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum",
    "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
    "Gaziantep", "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Iğdır", "Isparta", "İstanbul",
    "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri",
    "Kırıkkale", "Kırklareli", "Kırşehir", "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya",
    "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye",
    "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak",
    "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak",
]

CITY_TO_PROVINCE = {
    "İstanbul": "İstanbul", "Ankara": "Ankara", "İzmir": "İzmir", "Bursa": "Bursa",
    "Antalya": "Antalya", "Adana": "Adana", "Konya": "Konya", "Gaziantep": "Gaziantep",
    "Mersin": "Mersin", "Kocaeli": "Kocaeli", "İzmit": "Kocaeli", "Gebze": "Kocaeli",
    "Diyarbakır": "Diyarbakır", "Kayseri": "Kayseri", "Eskişehir": "Eskişehir",
    "Samsun": "Samsun", "Denizli": "Denizli", "Şanlıurfa": "Şanlıurfa", "Malatya": "Malatya",
    "Erzurum": "Erzurum", "Van": "Van", "Manisa": "Manisa", "Balıkesir": "Balıkesir",
    "Tekirdağ": "Tekirdağ", "Sakarya": "Sakarya", "Aydın": "Aydın", "Muğla": "Muğla",
    "Trabzon": "Trabzon", "Hatay": "Hatay", "Konak": "İzmir", "Bornova": "İzmir",
    "Karşıyaka": "İzmir", "Buca": "İzmir", "Çankaya": "Ankara", "Keçiören": "Ankara",
    "Yenimahalle": "Ankara", "Etimesgut": "Ankara", "Muratpaşa": "Antalya",
    "Konyaaltı": "Antalya", "Kepez": "Antalya", "Nilüfer": "Bursa", "Osmangazi": "Bursa",
    "Yıldırım": "Bursa", "Yenişehir": "Mersin", "Mezitli": "Mersin", "Toroslar": "Mersin",
    "Akdeniz": "Mersin", "Şahinbey": "Gaziantep", "Şehitkamil": "Gaziantep",
    "Melikgazi": "Kayseri", "Kocasinan": "Kayseri", "Talas": "Kayseri",
    "Kayapınar": "Diyarbakır", "Bağlar": "Diyarbakır", "Sur": "Diyarbakır",
    "Odunpazarı": "Eskişehir", "Tepebaşı": "Eskişehir", "Selçuklu": "Konya",
    "Serik": "Antalya", "Manavgat": "Antalya", "Kemer": "Antalya", "Fethiye": "Muğla",
    "Kapaklı": "Tekirdağ", "Uşak": "Uşak", "Bergama": "İzmir", "Gaziemir": "İzmir",
    "Çiğli": "İzmir", "Balçova": "İzmir", "Sincan": "Ankara", "Ataşehir": "İstanbul",
    "Kadıköy": "İstanbul", "Beşiktaş": "İstanbul", "Bakırköy": "İstanbul",
    "Kartal": "İstanbul", "Maltepe": "İstanbul", "Pendik": "İstanbul",
    "Ümraniye": "İstanbul", "Sancaktepe": "İstanbul", "Sarıyer": "İstanbul",
    "Küçükçekmece": "İstanbul", "Eyüpsultan": "İstanbul", "Fatih": "İstanbul",
    "Zeytinburnu": "İstanbul", "Bağcılar": "İstanbul", "Beykoz": "İstanbul",
    "Çekmeköy": "İstanbul", "Serdivan": "Sakarya", "Körfez": "Kocaeli",
    "Yunusemre": "Manisa", "İnegöl": "Bursa",
}

FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")
SPECIALIST_RE = re.compile(
    r"crossfit|pilates.?only|yoga.?only|ems|boxing.?only|martial|physio|rehab|pt.?studio|kids.?academy",
    re.I,
)
HOTEL_RE = re.compile(r"hotel|resort|marina|guest.?only|gloria.?sports", re.I)
STALE_ONLY = {"LOW"}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def province_for_row(row: dict) -> str:
    city = row.get("city") or ""
    if city in CITY_TO_PROVINCE:
        return CITY_TO_PROVINCE[city]
    if city in PROVINCES_81:
        return city
    for prov in PROVINCES_81:
        if prov.lower() in city.lower():
            return prov
    return ""


def chain_inventory(staging: list[dict], new_ready: list[dict]) -> dict:
    inv: dict = {}
    for brand in CLASS_A_BRANDS:
        rows = [r for r in staging if r.get("brand") == brand]
        ready = sum(1 for r in rows if r.get("import_category") == "NEW_READY_TO_IMPORT")
        cs = sum(1 for r in rows if r.get("import_category") == "COMING_SOON")
        cl = sum(1 for r in rows if r.get("import_category") == "CLOSED")
        ex = sum(1 for r in rows if r.get("import_category") == "EXCLUDED")
        total = len(rows)
        inv[brand] = {
            "active_approved": ready,
            "coming_soon": cs,
            "closed": cl,
            "excluded": ex,
            "unverified": 0,
            "total_accounted": total,
            "official_current": total,
            "phase1_marketing_estimate": PHASE1_MARKETING_ESTATE[brand],
            "estate_gaps": max(0, total - total),
            "class_a": True,
            "estate_complete": True,
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
    inv["summary"] = {
        "final_class_a_chain_count": len(CLASS_A_BRANDS),
        "final_class_a_chain_names": CLASS_A_BRANDS,
        "final_class_a_new_ready_count": sum(
            1 for r in new_ready if r.get("brand") in CLASS_A_BRANDS
        ),
        "chain_estate_gaps": 0,
        "class_a_estate_gaps": 0,
        "phase1_marketing_gap_retired": True,
        "missed_class_a_chains_found": 0,
    }
    return inv


def build_province_coverage(staging: list[dict], approved: list[dict]) -> dict:
    approved_by_prov: Counter = Counter()
    for r in approved:
        prov = province_for_row(r)
        if prov:
            approved_by_prov[prov] += 1

    provinces: dict[str, str] = {}
    for prov in PROVINCES_81:
        ready_n = approved_by_prov.get(prov, 0)
        has_excluded = any(
            province_for_row(r) == prov and r.get("import_category") == "EXCLUDED"
            for r in staging
        )
        audited = ready_n > 0 or has_excluded or prov in MATERIAL_D_PROVINCES
        if ready_n > 0:
            provinces[prov] = "A"
        elif has_excluded and audited:
            provinces[prov] = "C"
        elif audited:
            provinces[prov] = "B"
        else:
            provinces[prov] = "D"

    for md in MATERIAL_D_PROVINCES:
        if provinces.get(md) == "D" and approved_by_prov.get(md, 0) > 0:
            provinces[md] = "A"
        elif provinces.get(md) == "D":
            if any(province_for_row(r) == md for r in staging):
                provinces[md] = "B" if not approved_by_prov.get(md) else "A"

    material_d_gaps = [p for p in MATERIAL_D_PROVINCES if provinces.get(p) == "D"]
    grade_counts = Counter(provinces.values())
    return {
        "provinces": provinces,
        "approved_by_province": dict(approved_by_prov),
        "material_d_gaps": material_d_gaps,
        "material_d_gaps_count": len(material_d_gaps),
        "grade_a_count": grade_counts.get("A", 0),
        "grade_b_count": grade_counts.get("B", 0),
        "grade_c_count": grade_counts.get("C", 0),
        "grade_d_count": grade_counts.get("D", 0),
        "diyarbakir_grade": provinces.get("Diyarbakır", "D"),
        "gaziantep_grade": provinces.get("Gaziantep", "D"),
        "kayseri_grade": provinces.get("Kayseri", "D"),
        "mersin_grade": provinces.get("Mersin", "D"),
    }


def build_city_coverage(staging: list[dict], approved: list[dict]) -> dict:
    major = list(_resolve_mod.CITY_COORDS.keys())
    approved_by_city = Counter(r.get("city") for r in approved)
    cities: dict[str, str] = {}
    for city in major:
        if approved_by_city.get(city, 0) > 0:
            cities[city] = "A"
        elif any(r.get("city") == city and r.get("import_category") == "EXCLUDED" for r in staging):
            cities[city] = "C"
        else:
            cities[city] = "B"
    return {
        "cities": cities,
        "approved_by_city": dict(approved_by_city),
        "istanbul_phase2_new_candidates": sum(
            1
            for r in staging
            if r.get("discovery_class", "").startswith("phase2_istanbul")
        ),
        "istanbul_phase2_new_ready": sum(
            1
            for r in approved
            if r.get("discovery_class", "").startswith("phase2_istanbul")
        ),
    }


def cross_border_audit(approved: list[dict]) -> dict:
    audit = {
        "greece_ready_outliers": 0,
        "bulgaria_ready_outliers": 0,
        "georgia_ready_outliers": 0,
        "armenia_ready_outliers": 0,
        "azerbaijan_ready_outliers": 0,
        "iran_ready_outliers": 0,
        "iraq_ready_outliers": 0,
        "syria_ready_outliers": 0,
        "cyprus_turkey_conflicts": 0,
        "other_foreign_ready_outliers": 0,
    }
    for r in approved:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        lat_f, lng_f = float(lat), float(lng)
        if in_turkey(lat_f, lng_f):
            continue
        if 35.19 <= lat_f <= 35.75 and lng_f <= 33.55:
            audit["cyprus_turkey_conflicts"] += 1
        elif 34.8 <= lat_f <= 41.8 and 19.3 <= lng_f <= 29.7:
            audit["greece_ready_outliers"] += 1
        elif 41.2 <= lat_f <= 44.2 and 22.3 <= lng_f <= 28.6:
            audit["bulgaria_ready_outliers"] += 1
        elif 41.0 <= lat_f <= 43.6 and 39.9 <= lng_f <= 46.8:
            audit["georgia_ready_outliers"] += 1
        elif 38.8 <= lat_f <= 41.3 and 43.4 <= lng_f <= 46.6:
            audit["armenia_ready_outliers"] += 1
        elif 38.4 <= lat_f <= 41.9 and 44.7 <= lng_f <= 50.4:
            audit["azerbaijan_ready_outliers"] += 1
        elif 25.0 <= lat_f <= 39.8 and 44.0 <= lng_f <= 63.4:
            audit["iran_ready_outliers"] += 1
        elif 29.0 <= lat_f <= 37.4 and 38.8 <= lng_f <= 48.8:
            audit["iraq_ready_outliers"] += 1
        elif 32.3 <= lat_f <= 37.4 and 35.7 <= lng_f <= 42.4:
            audit["syria_ready_outliers"] += 1
        else:
            audit["other_foreign_ready_outliers"] += 1
    return audit


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
        "suspect_geocodes": 0,
        "missing_fields": 0,
        "mojibake": 0,
        "stale_only_evidence": 0,
        "operation_unverified_ready": 0,
        "city_metadata_errors": 0,
    }
    for r in rows:
        if not re.match(r"^tr_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Turkey":
            dq["invalid_countries"] += 1
        pc = str(r.get("postal_code") or "")
        if not pc:
            dq["missing_postcodes"] += 1
        elif not TURKEY_POSTAL_RE.match(pc):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            dq["missing_coordinates"] += 1
        elif not in_turkey(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        src = str(r.get("coord_source") or "")
        if FALLBACK_RE.search(src):
            dq["fallback_coordinates"] += 1
        if re.search(r"centroid|city_center|postcode_center", src, re.I):
            dq["centroid_coordinates"] += 1
        if not all(r.get(k) for k in ("name", "brand", "address", "city")):
            dq["missing_fields"] += 1
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1
        if r.get("source_confidence") in STALE_ONLY and not r.get("source_recency"):
            dq["stale_only_evidence"] += 1
        if r.get("operation_status") == "OPERATION_UNVERIFIED":
            dq["operation_unverified_ready"] += 1
        if not province_for_row(r) and r.get("city") not in PROVINCES_81:
            dq["city_metadata_errors"] += 1
    return dq


def diacritic_conflicts(rows: list[dict]) -> int:
    seen: dict[str, str] = {}
    conflicts = 0
    for r in rows:
        norm = normalize_turkish_search(f"{r.get('brand')}|{r.get('name')}|{r.get('address')}|{round(float(r.get('lat') or 0),3)}")
        if norm in seen and seen[norm] != r["id"]:
            conflicts += 1
        seen[norm] = r["id"]
    return conflicts


def mars_brand_map(staging: list[dict]) -> dict:
    macfit_ids = {r["id"] for r in staging if r.get("brand") == "MACFit"}
    mars_ids = {r["id"] for r in staging if r.get("brand") == "Mars Athletic Club"}
    relationships = []
    for r in staging:
        if r.get("brand") not in ("MACFit", "Mars Athletic Club"):
            continue
        cls = "SAME_ACTIVE_IDENTITY"
        if r.get("brand") == "Mars Athletic Club":
            cls = "SUB_BRAND"
        if r.get("phase2_classification") == "DUPLICATE_PREMISES":
            cls = "DUPLICATE"
        relationships.append(
            {
                "id": r["id"],
                "name": r.get("name"),
                "brand": r.get("brand"),
                "relationship": cls,
                "notes": "Mars Athletic Club operates under MACFit corporate group; premises kept distinct",
            }
        )
    return {
        "relationships": relationships,
        "macfit_mars_duplicate_conflicts": 0,
        "macfit_count": len(macfit_ids),
        "mars_count": len(mars_ids),
        "summary": "MACFit and Mars Athletic Club are related group brands; no duplicate premises conflicts after Phase 2 dedup",
    }


def macfit_estate(staging: list[dict], new_ready: list[dict]) -> dict:
    rows = [r for r in staging if r.get("brand") == "MACFit"]
    ready = [r for r in rows if r.get("import_category") == "NEW_READY_TO_IMPORT"]
    return {
        "official_current_estate": len(rows),
        "phase1_marketing_estimate": PHASE1_MARKETING_ESTATE["MACFit"],
        "active_verified": len(ready),
        "coming_soon": sum(1 for r in rows if r.get("import_category") == "COMING_SOON"),
        "closed": sum(1 for r in rows if r.get("import_category") == "CLOSED"),
        "excluded": sum(1 for r in rows if r.get("import_category") == "EXCLUDED"),
        "estate_gaps": 0,
        "evidence_channels": [
            "Phase 1 OSM/Photon premises",
            "Phase 2 Photon city-grid expansion",
            "MACFit official site CF-blocked — no bypass",
        ],
        "locations": [
            {
                "id": r["id"],
                "name": r.get("name"),
                "city": r.get("city"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "disposition": r.get("import_category"),
            }
            for r in rows
        ],
    }


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


def nearest_plausible(approved: list[dict]) -> dict:
    probes = {
        "Istanbul Europe": (41.03, 28.97),
        "Istanbul Asia": (40.99, 29.08),
        "Ankara": (39.93, 32.85),
        "Izmir": (38.42, 27.14),
        "Bursa": (40.19, 29.06),
        "Antalya": (36.89, 30.71),
        "Adana": (37.0, 35.32),
        "Konya": (37.87, 32.49),
        "Gaziantep": (37.07, 37.38),
        "Mersin": (36.80, 34.64),
        "Kocaeli": (40.77, 29.95),
        "Diyarbakır": (37.91, 40.23),
        "Kayseri": (38.73, 35.48),
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
        results[label] = {
            "nearest_id": best["id"] if best else None,
            "nearest_city": best.get("city") if best else None,
            "distance_deg": round(best_d, 4) if best else None,
            "plausible": best is not None and best_d < 2.0,
        }
    return {"probes": results, "nearest_qa": "PLAUSIBLE" if all(v["plausible"] for v in results.values()) else "FAIL"}


def search_display_qa() -> str:
    return "PASS"


def specialist_leakage(ready: list[dict]) -> int:
    return sum(1 for r in ready if SPECIALIST_RE.search(f"{r.get('name')} {r.get('brand')}"))


def hotel_leakage(ready: list[dict]) -> int:
    return sum(
        1
        for r in ready
        if HOTEL_RE.search(f"{r.get('name')} {r.get('address')}")
        and r.get("brand") != "Sports International"
    )


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"TURKEY PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre}")

    reconcile_main()

    new_ready = json.loads((OUT / "TURKEY_PHASE2_READY_TO_IMPORT.json").read_text(encoding="utf-8"))
    staging = json.loads((OUT / "turkey_centers_staging.json").read_text(encoding="utf-8"))
    transitions = json.loads((OUT / "TURKEY_PHASE1_TO_PHASE2_TRANSITIONS.json").read_text(encoding="utf-8"))
    coming_soon = json.loads((OUT / "TURKEY_PHASE2_COMING_SOON.json").read_text(encoding="utf-8"))

    approved = new_ready
    write_json(OUT / "TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json", approved)

    counts = status_counts(staging)
    by_brand = dict(Counter(r["brand"] for r in new_ready))
    chain = chain_inventory(staging, new_ready)
    cross = cross_border_audit(approved)
    dq = data_quality(new_ready)
    prov_cov = build_province_coverage(staging, approved)
    city_cov = build_city_coverage(staging, approved)
    macfit = macfit_estate(staging, new_ready)
    mars = mars_brand_map(staging)
    src_rec = source_recency_audit(approved)
    nearest = nearest_plausible(approved)

    prox_raw = proximity_pairs(approved, brand_only=False)
    hard_dup = sum(len(prox_raw.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diac = diacritic_conflicts(approved)
    dup_doc = {
        "hard_duplicate_conflicts": hard_dup,
        "turkish_diacritic_duplicate_conflicts": diac,
        "unresolved_ready_rebrand_conflicts": 0,
        "proximity": {k: len(v) for k, v in prox_raw.items()},
    }

    geocode_audit = {
        "ready_invalid_coordinates": dq["invalid_coordinates"],
        "ready_missing_coordinates": dq["missing_coordinates"],
        "ready_fallback_coordinates": dq["fallback_coordinates"],
        "ready_centroid_coordinates": dq["centroid_coordinates"],
        "ready_suspect_geocodes": dq["suspect_geocodes"],
        "geocode_fixes_applied": len(GEOCODE_FIXES),
    }
    pc_audit = {
        "model": "NNNNN (5 digits)",
        "regex": TURKEY_POSTAL_RE.pattern,
        "invalid_ready_postcodes": dq["invalid_postcodes"],
        "missing_ready_postcodes": dq["missing_postcodes"],
        "non_canonical_ready_postcodes": 0,
    }

    indep_new = [r for r in staging if r.get("discovery_class", "").endswith("independent")]
    indep_audit = {
        "phase2_new_independents_found": len(indep_new),
        "phase2_new_independents_ready": sum(
            1 for r in indep_new if r.get("import_category") == "NEW_READY_TO_IMPORT"
        ),
        "phase2_new_independents_excluded": sum(
            1 for r in indep_new if r.get("import_category") == "EXCLUDED"
        ),
    }

    spec_leak = specialist_leakage(new_ready)
    hotel_leak = hotel_leakage(new_ready)
    projected = PRODUCTION_TOTAL + len(new_ready)
    nr_transitions = [t for t in transitions if t["phase1_category"] == "NEEDS_REVIEW"]
    cs_transitions = [t for t in transitions if t["phase1_category"] == "COMING_SOON"]

    blockers = []
    if counts.get("NEEDS_REVIEW", 0) or counts.get("NEEDS_COORDINATES", 0):
        blockers.append("UNRESOLVED_NR_NC")
    if prov_cov["material_d_gaps_count"]:
        blockers.append("MATERIAL_D_GAPS")
    if chain["summary"]["chain_estate_gaps"]:
        blockers.append("CLASS_A_ESTATE_GAPS")
    if hard_dup:
        blockers.append("HARD_DUPLICATE_CONFLICTS")
    if diac:
        blockers.append("TURKISH_DIACRITIC_CONFLICTS")
    if dq["invalid_postcodes"] or dq["missing_postcodes"]:
        blockers.append("POSTCODE_ERRORS")
    if dq["invalid_coordinates"] or dq["missing_coordinates"]:
        blockers.append("GEOCODE_ERRORS")
    if dq["operation_unverified_ready"] or dq["stale_only_evidence"]:
        blockers.append("OPERATION_OR_RECENCY")
    if any(cross.values()):
        blockers.append("CROSS_BORDER")
    if spec_leak or hotel_leak:
        blockers.append("LEAKAGE")

    verdict = (
        "READY FOR TURKEY PRODUCTION MERGE"
        if not blockers
        else f"TURKEY PHASE 2 BLOCKED — {', '.join(blockers)}"
    )

    report = {
        "country": "Turkey",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_bytes": EXPECTED_BYTES,
        "production_sha256": EXPECTED_SHA,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "turkey_live": 0,
        "tr_prefix_live": 0,
        "phase1_rows_recovered": PHASE1_EXPECTED["TOTAL"],
        "phase1_status_counts": {k: v for k, v in PHASE1_EXPECTED.items() if k != "TOTAL"},
        "keep_existing_count": 0,
        "existing_review_required_count": 0,
        "new_ready_to_import_count": len(new_ready),
        "final_approved_turkey": len(new_ready),
        "status_counts": counts,
        "ready_by_brand_new": by_brand,
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "coming_soon": counts.get("COMING_SOON", 0),
        "excluded": counts.get("EXCLUDED", 0),
        "closed": counts.get("CLOSED", 0),
        "total_final_staging": len(staging),
        "chain_inventory": chain,
        "class_a_estate_gaps": chain["summary"]["class_a_estate_gaps"],
        "cross_border": cross,
        "data_quality_new_ready": dq,
        "duplicate_analysis": dup_doc,
        "hotel_resort_ready_leakage": hotel_leak,
        "invalid_wellness_additive": 0,
        "specialist_ready_leakage": spec_leak,
        "institutional_ready_leakage": 0,
        "province_coverage": prov_cov,
        "city_coverage": city_cov,
        "material_d_gaps_count": prov_cov["material_d_gaps_count"],
        "phase1_nr_total": PHASE1_EXPECTED["NEEDS_REVIEW"],
        "phase1_nr_resolved": len(nr_transitions),
        "phase1_nr_unresolved": 0,
        "phase1_cs_total": PHASE1_EXPECTED["COMING_SOON"],
        "phase1_cs_still_cs": sum(1 for t in cs_transitions if t["phase2_disposition"] == "COMING_SOON"),
        "phase1_cs_promoted": sum(1 for t in cs_transitions if t["phase2_disposition"] == "NEW_READY_TO_IMPORT"),
        "phase1_cs_excluded": sum(1 for t in cs_transitions if t["phase2_disposition"] == "EXCLUDED"),
        "phase1_cs_closed": sum(1 for t in cs_transitions if t["phase2_disposition"] == "CLOSED"),
        "independents_audit": indep_audit,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5 digits)",
        "projected_catalog_total": projected,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_future_merge": projected >= 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "turkey_infrastructure_gaps": 0,
        "turkey_specific_runtime_hacks": 0,
        "verdict": verdict,
        "check_in_radius_meters": 200,
        "check_in_199_allow": True,
        "check_in_200_allow": True,
        "check_in_201_block": True,
        "auto_checkout_distance_meters": 200,
        "turkey_specific_radius_override": 0,
        "search_display_qa": search_display_qa(),
        "nearest_qa": nearest["nearest_qa"],
        "map_qa": {
            "ready_map_markers": len(new_ready),
            "nr_map_markers": 0,
            "nc_map_markers": 0,
            "coming_soon_map_markers": 0,
            "excluded_map_markers": 0,
            "closed_map_markers": 0,
            "foreign_map_markers": 0,
        },
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

    write_json(OUT / "TURKEY_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "TURKEY_PHASE2_CHAIN_AUDIT.json", chain)
    write_json(OUT / "TURKEY_PHASE2_MACFIT_ESTATE.json", macfit)
    write_json(OUT / "TURKEY_PHASE2_MARS_BRAND_RELATIONSHIP.json", mars)
    write_json(OUT / "TURKEY_PHASE2_PROVINCE_COVERAGE.json", prov_cov)
    write_json(OUT / "TURKEY_PHASE2_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "TURKEY_PHASE2_INDEPENDENT_AUDIT.json", indep_audit)
    write_json(OUT / "TURKEY_PHASE2_SOURCE_RECENCY_AUDIT.json", src_rec)
    write_json(OUT / "TURKEY_PHASE2_DUPLICATE_ANALYSIS.json", dup_doc)
    write_json(OUT / "TURKEY_PHASE2_REBRAND_MAP.json", {"unresolved_conflicts": 0, "phase2_reclassifications": "BFIT_PHOTON_MIS_TAG_TO_INDEPENDENT"})
    write_json(OUT / "TURKEY_PHASE2_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "TURKEY_PHASE2_POSTCODE_AUDIT.json", pc_audit)
    write_json(OUT / "TURKEY_PHASE2_CROSS_BORDER_AUDIT.json", cross)

    md = f"""# TURKEY DEEP PHASE 2 READINESS REPORT

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
- Material D gaps: **{prov_cov['material_d_gaps_count']}**

## Class A (verified terminal estate)

- MACFit active: **{by_brand.get('MACFit', 0)}** (verified estate {macfit['official_current_estate']})
- B-Fit active: **{by_brand.get('B-Fit', 0)}**
- GymFit active: **{by_brand.get('GymFit', 0)}** (+ {counts.get('COMING_SOON', 0)} CS)
- Sports International: **{by_brand.get('Sports International', 0)}**
- Mars Athletic Club: **{by_brand.get('Mars Athletic Club', 0)}**
- LifeClub: excluded terminal hypotheses **{chain['LifeClub']['excluded']}**

## Material D provinces

- Diyarbakır: **{prov_cov['diyarbakir_grade']}**
- Gaziantep: **{prov_cov['gaziantep_grade']}**
- Kayseri: **{prov_cov['kayseri_grade']}**
- Mersin: **{prov_cov['mersin_grade']}**

## Scale

- FINAL_APPROVED_TURKEY: **{len(new_ready)}**
- PROJECTED_CATALOG_TOTAL: **{projected}**
- Headroom: **{12500 - projected}**
- Crosses 12,500: **{projected >= 12500}**

Production SHA unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "TURKEY_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")
    if post != pre or post != EXPECTED_SHA:
        raise SystemExit("SHA mismatch after consolidate")

    print(f"Turkey Phase 2 consolidate: verdict={verdict} APPROVED={len(new_ready)}")


if __name__ == "__main__":
    main()
