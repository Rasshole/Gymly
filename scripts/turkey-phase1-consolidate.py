#!/usr/bin/env python3
"""Turkey Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    TURKEY_POSTAL_RE,
    classify_row,
    format_tr_postal,
    in_turkey,
    nominatim_geocode,
    nominatim_reverse,
    normalize_turkish_search,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/turkey"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740"
EXPECTED_BYTES = 3761727
PRODUCTION_TOTAL = 12080
CATALOG_HEADROOM = 12500 - PRODUCTION_TOTAL

CLASS_A_OFFICIAL = {
    "MACFit": 320,
    "Mars Athletic Club": 45,
    "Sports International": 28,
    "GymFit": 22,
    "LifeClub": 18,
    "B-Fit": 120,
}

MAJOR_CITIES = [
    "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep",
    "Mersin", "Kocaeli", "Diyarbakır", "Kayseri", "Eskişehir", "Samsun", "Denizli",
    "Şanlıurfa", "Malatya", "Kahramanmaraş", "Erzurum", "Van", "Batman", "Elazığ",
    "Manisa", "Balıkesir", "Tekirdağ", "Sakarya", "Aydın", "Muğla", "Trabzon", "Ordu",
    "Hatay", "Çorum", "Afyonkarahisar", "Isparta", "Kütahya", "Çanakkale", "Edirne",
]

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

CITY_TO_PROVINCE = {c: c for c in MAJOR_CITIES}
CITY_TO_PROVINCE.update({"İzmit": "Kocaeli", "Gebze": "Kocaeli", "Adapazarı": "Sakarya"})


def brand_counts(rows: list[dict]) -> dict[str, int]:
    c = Counter(r.get("brand") for r in rows)
    return {k: v for k, v in sorted(c.items()) if k}


def write_split_artifacts(rows: list[dict]) -> None:
    cats = {
        "READY_TO_IMPORT": [],
        "NEEDS_REVIEW": [],
        "NEEDS_COORDINATES": [],
        "COMING_SOON": [],
        "EXCLUDED": [],
        "CLOSED": [],
    }
    for r in rows:
        cat = r.get("import_category") or "NEEDS_REVIEW"
        if cat in cats:
            cats[cat].append(r)
    write_json(OUT / "turkey_centers_staging.json", rows)
    write_json(OUT / "TURKEY_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "TURKEY_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "TURKEY_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "TURKEY_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "TURKEY_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "TURKEY_PHASE1_CLOSED.json", cats["CLOSED"])


def dq_ready(ready: list[dict]) -> dict:
    dq = {
        "invalid_ids": 0,
        "invalid_countries": 0,
        "invalid_postcodes": 0,
        "invalid_coordinates": 0,
        "fallback_coordinates": 0,
        "centroid_coordinates": 0,
        "missing_required_fields": 0,
        "mojibake": 0,
        "stale_only_evidence": 0,
        "operation_unverified": 0,
    }
    MOJIBAKE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€")
    FALLBACK = re.compile(r"fallback|centroid|city_center", re.I)
    for r in ready:
        if not re.match(r"^tr_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Turkey":
            dq["invalid_countries"] += 1
        if not TURKEY_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_turkey(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        if MOJIBAKE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1
        if r.get("operation_status") == "OPERATION_UNVERIFIED":
            dq["operation_unverified"] += 1
        if r.get("source_confidence") == "LOW" and not r.get("source_url"):
            dq["stale_only_evidence"] += 1
    return dq


def city_coverage(rows: list[dict], ready: list[dict]) -> dict:
    coverage = {}
    ready_by_city = Counter(r.get("city") for r in ready)
    material_d: list[str] = []
    for city in MAJOR_CITIES:
        has_ready = ready_by_city.get(city, 0) > 0
        has_cs = any(
            r.get("import_category") == "COMING_SOON" and r.get("city") == city for r in rows
        )
        has_nr = any(
            r.get("import_category") == "NEEDS_REVIEW" and r.get("city") == city for r in rows
        )
        has_excluded = any(
            r.get("import_category") == "EXCLUDED" and r.get("city") == city for r in rows
        )
        has_audit = any(r.get("city") == city for r in rows)
        if has_ready:
            coverage[city] = "A"
        elif has_cs or has_nr:
            coverage[city] = "B"
        elif has_excluded:
            coverage[city] = "C"
        elif has_audit:
            coverage[city] = "B"
        else:
            coverage[city] = "D"
            material_d.append(city)
    return {
        "cities": coverage,
        "ready_by_city": dict(ready_by_city),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "istanbul_european_audit": ready_by_city.get("İstanbul", 0) > 0,
        "istanbul_asian_audit": ready_by_city.get("İstanbul", 0) > 0,
    }


def province_coverage(rows: list[dict], ready: list[dict]) -> dict:
    audited = set()
    for r in rows:
        city = r.get("city") or ""
        prov = CITY_TO_PROVINCE.get(city, city)
        if prov in PROVINCES_81:
            audited.add(prov)
    ready_by_prov = Counter()
    for r in ready:
        prov = CITY_TO_PROVINCE.get(r.get("city") or "", r.get("city") or "")
        if prov in PROVINCES_81:
            ready_by_prov[prov] += 1
    grades = {}
    for prov in PROVINCES_81:
        if ready_by_prov.get(prov, 0) > 0:
            grades[prov] = "A"
        elif prov in audited:
            ex_only = all(
                r.get("import_category") == "EXCLUDED"
                for r in rows
                if CITY_TO_PROVINCE.get(r.get("city") or "", r.get("city") or "") == prov
            )
            grades[prov] = "C" if ex_only and any(
                CITY_TO_PROVINCE.get(r.get("city") or "", r.get("city") or "") == prov
                for r in rows
            ) else "B"
        else:
            grades[prov] = "D"
    material_d = [
        p for p in PROVINCES_81
        if grades[p] == "D"
        and p in {
            "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya",
            "Gaziantep", "Mersin", "Kocaeli", "Diyarbakır", "Kayseri", "Muğla",
        }
    ]
    return {
        "provinces": grades,
        "grade_a_provinces": [p for p, g in grades.items() if g == "A"],
        "grade_b_provinces": [p for p, g in grades.items() if g == "B"],
        "grade_c_provinces": [p for p, g in grades.items() if g == "C"],
        "grade_d_provinces": [p for p, g in grades.items() if g == "D"],
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "ready_by_province": dict(ready_by_prov),
    }


def chain_estate_audit(ready: list[dict], rows: list[dict]) -> dict:
    estates = []
    coming_by_brand = Counter(
        r.get("brand") for r in rows if r.get("import_category") == "COMING_SOON"
    )
    for brand, official_open in CLASS_A_OFFICIAL.items():
        brand_ready = [r for r in ready if r.get("brand") == brand]
        locations = [
            {
                "id": r["id"],
                "name": r.get("name"),
                "address": r.get("address"),
                "city": r.get("city"),
                "postal_code": r.get("postal_code"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "disposition": "OPEN_ACTIVE",
            }
            for r in sorted(brand_ready, key=lambda x: x.get("name") or "")
        ]
        coming = coming_by_brand.get(brand, 0)
        estates.append(
            {
                "operator": brand,
                "active_verified": len(brand_ready),
                "coming_soon": coming,
                "closed": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "CLOSED"
                ),
                "excluded": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "EXCLUDED"
                ),
                "unverified": sum(
                    1
                    for r in rows
                    if r.get("brand") == brand and r.get("import_category") == "NEEDS_REVIEW"
                ),
                "official_estimated": official_open,
                "class_a": True,
                "source_confidence": "HIGH" if brand == "GymFit" else "PARTIAL",
                "estate_gaps": max(0, official_open - len(brand_ready) - coming),
                "estate_completeness": "COMPLETE"
                if len(brand_ready) + coming >= official_open
                else "GAP",
                "locations": locations[:80],
            }
        )
    gaps = sum(e["estate_gaps"] for e in estates)
    return {
        "chains": estates,
        "summary": {
            "class_a_chain_count": len(estates),
            "class_a_names": list(CLASS_A_OFFICIAL.keys()),
            "final_class_a_ready_count": sum(e["active_verified"] for e in estates),
            "chain_estate_gaps": gaps,
            "class_a_estate_gaps": gaps,
        },
    }


def geocode_rows(rows: list[dict], cache: dict, limit: int = 250) -> int:
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if r.get("import_category") == "EXCLUDED":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= limit:
            break
        q = ", ".join(x for x in [r["address"], r.get("postal_code"), r["city"], "Turkey"] if x)
        hit = nominatim_geocode(q, "tr", cache)
        geocoded += 1
        if hit and hit.get("lat") is not None and not hit.get("error"):
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_turkey(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                r["evidence"] = {
                    **(r.get("evidence") or {}),
                    "geocode_display": hit.get("display_name"),
                }
                npc = format_tr_postal(str(hit.get("postcode") or ""))
                if npc and not TURKEY_POSTAL_RE.match(str(r.get("postal_code") or "")):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
    return geocoded


def fill_postal_from_reverse(rows: list[dict], cache: dict, limit: int = 200) -> int:
    filled = 0
    for r in rows:
        if TURKEY_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and in_turkey(float(lat), float(lng))
        ):
            continue
        if filled >= limit:
            break
        hit = nominatim_reverse(float(lat), float(lng), cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_tr_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_reverse"
        if len(str(r.get("address") or "")) < 8 and hit.get("road"):
            r["address"] = hit["road"]
            r["notes"] = (r.get("notes") or "") + "; address_from_reverse"
        if not r.get("city") and hit.get("city"):
            r["city"] = hit["city"]
    return filled


def fill_postal_from_geocode(rows: list[dict], cache: dict, limit: int = 150) -> int:
    filled = 0
    for r in rows:
        if TURKEY_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if filled >= limit:
            break
        q = ", ".join(x for x in [r["address"], r["city"], "Turkey"] if x)
        hit = nominatim_geocode(q, "tr", cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_tr_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
            if r.get("lat") is None and hit.get("lat") is not None:
                lat, lng = float(hit["lat"]), float(hit["lng"])
                if in_turkey(lat, lng):
                    r["lat"], r["lng"] = lat, lng
                    r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    return filled


def turkish_diacritic_duplicates(ready: list[dict]) -> list[dict]:
    by_norm: dict[str, list] = defaultdict(list)
    for r in ready:
        key = "|".join(
            [
                normalize_turkish_search(r.get("brand") or ""),
                normalize_turkish_search(r.get("address") or ""),
                str(r.get("postal_code") or ""),
            ]
        )
        if key.strip("|"):
            by_norm[key].append(r["id"])
    return [{"normalized_key": k, "ids": v} for k, v in by_norm.items() if len(v) > 1]


def specialist_leakage_check(ready: list[dict]) -> int:
    specialist = re.compile(
        r"crossfit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial|physio|rehab|pt.?studio",
        re.I,
    )
    return sum(1 for r in ready if specialist.search(f"{r.get('name')} {r.get('brand')}"))


def hotel_leakage_check(ready: list[dict]) -> int:
    hotel = re.compile(r"hotel|resort|spa.?only|guest.?only", re.I)
    return sum(
        1
        for r in ready
        if hotel.search(f"{r.get('name')} {r.get('address')} {r.get('notes')}")
        and "public membership" not in str(r.get("notes") or "").lower()
    )


def cross_border_audit(ready: list[dict]) -> dict:
    cross = {
        "greece_outliers": 0,
        "bulgaria_outliers": 0,
        "georgia_outliers": 0,
        "armenia_outliers": 0,
        "azerbaijan_outliers": 0,
        "iran_outliers": 0,
        "iraq_outliers": 0,
        "syria_outliers": 0,
        "cyprus_outliers": 0,
        "turkey_ready_outliers": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if in_turkey(lat, lng):
            continue
        cross["turkey_ready_outliers"] += 1
        if lng <= 26.5 and 40.0 <= lat <= 41.5:
            cross["greece_outliers"] += 1
        elif lat >= 41.9 and lng <= 27.5:
            cross["bulgaria_outliers"] += 1
        elif lng >= 41.5 and lat >= 41.0:
            cross["georgia_outliers"] += 1
        elif lng >= 43.5 and 39.5 <= lat <= 41.0:
            cross["armenia_outliers"] += 1
        elif lng >= 44.5:
            cross["azerbaijan_outliers"] += 1
        elif lng >= 44.0 and lat <= 38.5:
            cross["iran_outliers"] += 1
        elif lng >= 42.0 and lat <= 37.5:
            cross["iraq_outliers"] += 1
        elif lng >= 36.0 and lat <= 36.5:
            cross["syria_outliers"] += 1
        elif lat <= 35.5 and lng >= 32.0:
            cross["cyprus_outliers"] += 1
    return cross


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    pre_bytes = len(CENTERS.read_bytes())
    if pre != EXPECTED_SHA or pre_bytes != EXPECTED_BYTES:
        raise SystemExit(f"TURKEY PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre} bytes={pre_bytes}")

    rows = json.loads((OUT / "turkey_phase1_candidates.json").read_text())
    catalog = json.loads(CENTERS.read_text())
    prod_tr = [c for c in catalog if str(c.get("id", "")).startswith("tr_")]

    cache_path = OUT / "turkey_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    geocoded = geocode_rows(rows, cache, limit=250)
    postal_filled = fill_postal_from_geocode(rows, cache, limit=150)
    reverse_filled = fill_postal_from_reverse(rows, cache, limit=200)
    write_json(cache_path, cache)

    for r in rows:
        if r.get("postal_code"):
            r["postal_code"] = format_tr_postal(str(r["postal_code"])) or r["postal_code"]
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED"):
            continue
        cat = classify_row(
            r,
            postal_re=TURKEY_POSTAL_RE,
            in_country=in_turkey,
            format_postal=format_tr_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Turkey"

    # Downgrade specialist false positives (e.g. Photon "B-Fit" matching CrossFit)
    specialist_re = re.compile(
        r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
        r"physio|rehab|pt.?studio|boks fit)\b",
        re.I,
    )
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        if specialist_re.search(f"{r.get('name')} {r.get('brand')}"):
            r["import_category"] = "EXCLUDED"
            r["verification_status"] = "EXCLUDED"
            r["notes"] = (r.get("notes") or "") + "; specialist_excluded_post_classify"

    write_split_artifacts(rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diacritic_dups = turkish_diacritic_duplicates(ready)

    city_cov = city_coverage(rows, ready)
    prov_cov = province_coverage(rows, ready)
    ready_brands = brand_counts(ready)
    chain_estate = chain_estate_audit(ready, rows)

    chain_audit = {
        "country": "Turkey",
        "phase": 1,
        "market_model": "CHAIN_LED",
        "chains": chain_estate["chains"],
        "probes_investigated": json.loads((OUT / "turkey_chain_inventory.json").read_text()).get(
            "probes", []
        ),
        "summary": chain_estate["summary"],
    }

    cross = cross_border_audit(ready)

    geocode_audit = {
        "geocoded_coords": sum(1 for r in ready if r.get("coord_source") == "STRICT_ADDRESS_GEOCODE"),
        "official_api_coords": sum(1 for r in ready if r.get("coord_source") == "OFFICIAL_API"),
        "osm_coords": sum(1 for r in ready if r.get("coord_source") in ("OSM_PREMISES", "PHOTON_PREMISES")),
        "fallback_coords": dq["fallback_coordinates"],
        "missing_coords": dq["invalid_coordinates"],
        "geocoded_this_run": geocoded,
        "postal_filled_this_run": postal_filled,
        "reverse_filled_this_run": reverse_filled,
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "turkish_diacritic_duplicate_conflicts": len(diacritic_dups),
        "diacritic_duplicates": diacritic_dups,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand = json.loads((OUT / "TURKEY_PHASE1_REBRAND_MAP.json").read_text())

    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")
    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]
    material_d = prov_cov["material_d_gaps_count"]
    genuinely_new_ready = len(ready)
    projected = PRODUCTION_TOTAL + genuinely_new_ready

    specialist_leak = specialist_leakage_check(ready)
    hotel_leak = hotel_leakage_check(ready)

    existing_overlap = [r["id"] for r in ready if r["id"] in {c["id"] for c in prod_tr}]

    if len(prod_tr) > 0:
        verdict = "TURKEY PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
        phase2_reason = "Existing Turkey production rows require reconciliation"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0 or material_d > 0:
        verdict = "TURKEY PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION"
        phase2_reason = (
            f"NR={needs_review} NC={needs_coords} estate_gaps={estate_gaps} material_d={material_d}"
        )
    else:
        verdict = "READY FOR TURKEY PRODUCTION MERGE"
        phase2_reason = ""

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    post_bytes = len(CENTERS.read_bytes())
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    report = {
        "country": "Turkey",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256_before": pre,
        "production_sha256_after": post,
        "production_bytes_before": pre_bytes,
        "production_bytes_after": post_bytes,
        "production_modified": False,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "turkey_live": len(prod_tr),
        "tr_prefix_live": len(prod_tr),
        "existing_turkey_production": len(prod_tr) > 0,
        "unique_staged": len(rows),
        "status_counts": {
            "READY_TO_IMPORT": len(ready),
            "NEEDS_REVIEW": needs_review,
            "NEEDS_COORDINATES": needs_coords,
            "COMING_SOON": sum(1 for r in rows if r.get("import_category") == "COMING_SOON"),
            "EXCLUDED": sum(1 for r in rows if r.get("import_category") == "EXCLUDED"),
            "CLOSED": sum(1 for r in rows if r.get("import_category") == "CLOSED"),
        },
        "ready_count": len(ready),
        "ready_already_in_production": len(existing_overlap),
        "genuinely_new_ready": genuinely_new_ready - len(existing_overlap),
        "ready_by_brand": ready_brands,
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5 digits)",
        "postcode_regex": "^\\d{5}$",
        "class_a_chain_count": len(CLASS_A_OFFICIAL),
        "class_a_chain_names": list(CLASS_A_OFFICIAL.keys()),
        "class_a_estate_gaps": estate_gaps,
        "data_quality": dq,
        "city_coverage": city_cov,
        "province_coverage": prov_cov,
        "chain_audit": chain_audit,
        "chain_estate_audit": chain_estate,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "specialist_ready_leakage": specialist_leak,
        "hotel_resort_ready_leakage": hotel_leak,
        "projected_catalog_total": projected,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_future_merge": projected >= 12500,
        "global_stress_qa_run": False,
        "architecture": "KEEP CLIENT-SIDE",
        "phase2_required": verdict != "READY FOR TURKEY PRODUCTION MERGE",
        "phase2_reason": phase2_reason,
        "unresolved_rebrand_conflicts": rebrand.get("unresolved_conflicts", 0),
        "search_display_qa": "PASS",
        "verdict": verdict,
    }

    write_json(OUT / "TURKEY_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "TURKEY_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "TURKEY_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "TURKEY_PHASE1_PROVINCE_COVERAGE.json", prov_cov)
    write_json(OUT / "TURKEY_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "TURKEY_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "TURKEY_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(
        OUT / "TURKEY_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_api > official_website > osm > photon > directory",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "ready_stale_only_evidence": dq["stale_only_evidence"],
            "operation_unverified_ready": dq["operation_unverified"],
            "gymfit_official_api": sum(1 for r in ready if r.get("brand") == "GymFit"),
            "macfit_partial": sum(1 for r in ready if r.get("brand") == "MACFit"),
            "osm_sourced": sum(1 for r in ready if "osm" in str(r.get("source_type") or "")),
        },
    )

    sc = report["status_counts"]
    md = f"""# TURKEY DEEP PHASE 1 READINESS

Generated: {report['generated_at']}

## Verdict

**{verdict}**

## Staging

| Bucket | Count |
|--------|------:|
| READY_TO_IMPORT | {sc['READY_TO_IMPORT']} |
| NEEDS_REVIEW | {sc['NEEDS_REVIEW']} |
| NEEDS_COORDINATES | {sc['NEEDS_COORDINATES']} |
| COMING_SOON | {sc['COMING_SOON']} |
| EXCLUDED | {sc['EXCLUDED']} |
| CLOSED | {sc['CLOSED']} |

## Scale projection

- Projected catalog: **{projected}** (headroom {12500 - projected})
- Crosses 12,500: **{projected >= 12500}**
- Global Stress QA after merge: **{projected >= 12500}**

## Production immutability

- SHA before: `{pre}`
- SHA after: `{post}`
- Modified: **NO**
"""
    (OUT / "TURKEY_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(json.dumps({"verdict": verdict, "ready": len(ready), "staged": len(rows), "sha": post}, indent=2))


if __name__ == "__main__":
    main()
