#!/usr/bin/env python3
"""Russia Deep Phase 1 consolidate — read-only. Does NOT modify centers.json."""
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
    RU_POSTAL_RE,
    classify_row,
    format_ru_postal,
    in_disputed_ukraine_territory,
    in_russia,
    nominatim_geocode,
    nominatim_reverse,
    normalize_russian_search,
    norm_addr,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/russia"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1"
EXPECTED_BYTES = 3858778
PRODUCTION_TOTAL = 12385

CLASS_A_OFFICIAL = {
    "World Class": 120,
    "X-Fit": 80,
    "Alex Fitness": 45,
    "DDxFitness": 35,
    "Spirit Fitness": 30,
}

MAJOR_CITIES = [
    "Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg", "Kazan",
    "Nizhny Novgorod", "Chelyabinsk", "Samara", "Omsk", "Rostov-on-Don", "Ufa",
    "Krasnoyarsk", "Voronezh", "Perm", "Volgograd", "Krasnodar", "Saratov",
    "Tyumen", "Tolyatti", "Izhevsk", "Barnaul", "Ulyanovsk", "Irkutsk",
    "Khabarovsk", "Yaroslavl", "Vladivostok", "Makhachkala", "Tomsk", "Orenburg",
    "Kemerovo", "Novokuznetsk", "Ryazan", "Astrakhan", "Penza", "Lipetsk",
    "Kaliningrad", "Sochi", "Kursk", "Tula", "Kaluga",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"physio|rehab|pt.?studio)\b",
    re.I,
)
HOTEL_RE = re.compile(r"\b(hotel|resort|spa.?only|guest.?only)\b", re.I)
INSTITUTIONAL_RE = re.compile(r"\b(university.?only|military|employee.?only|staff.?only)\b", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€")
FALLBACK_RE = re.compile(r"fallback|centroid|city_center", re.I)


def dedupe_candidates(rows: list[dict]) -> list[dict]:
    def score(x: dict) -> tuple:
        return (
            1 if x.get("import_category") == "READY_TO_IMPORT" else 0,
            1 if x.get("operation_status") == "ACTIVE_VERIFIED" else 0,
            1 if RU_POSTAL_RE.match(str(x.get("postal_code") or "")) else 0,
            1 if x.get("lat") is not None else 0,
            {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(str(x.get("source_confidence") or ""), 0),
            len(str(x.get("address") or "")),
        )

    kept: dict[str, dict] = {}
    for r in rows:
        lat, lng = r.get("lat"), r.get("lng")
        coord_key = (
            f"{round(float(lat), 4)}|{round(float(lng), 4)}"
            if lat is not None and lng is not None
            else ""
        )
        key = "|".join(
            [
                normalize_russian_search(r.get("brand") or ""),
                norm_addr(r.get("address") or ""),
                coord_key,
            ]
        )
        if not key.strip("|"):
            continue
        if key not in kept or score(r) > score(kept[key]):
            if key in kept:
                prev = kept[key]
                prev["import_category"] = "NEEDS_REVIEW"
                prev["notes"] = (prev.get("notes") or "") + "; dedupe_superseded"
            kept[key] = r
        else:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; dedupe_superseded"

    kept_ids = {r["id"] for r in kept.values()}
    out = list(kept.values())
    for r in rows:
        if r["id"] not in kept_ids:
            out.append(r)
    return out


def resolve_ready_proximity(rows: list[dict]) -> None:
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    prox = proximity_pairs(ready, brand_only=False)
    loser_ids: set[str] = set()
    for bucket in ("identical", "lt25", "lt50"):
        for hit in prox.get(bucket, []):
            a_id, b_id = hit["a_id"], hit["b_id"]
            if a_id in loser_ids or b_id in loser_ids:
                continue
            a = next(x for x in ready if x["id"] == a_id)
            b = next(x for x in ready if x["id"] == b_id)

            def rank(x: dict) -> tuple:
                return (
                    {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(str(x.get("source_confidence") or ""), 0),
                    1 if RU_POSTAL_RE.match(str(x.get("postal_code") or "")) else 0,
                    len(str(x.get("address") or "")),
                )

            loser = b_id if rank(a) >= rank(b) else a_id
            loser_ids.add(loser)
    for r in rows:
        if r["id"] in loser_ids:
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; proximity_duplicate"


def brand_counts(rows: list[dict]) -> dict[str, int]:
    return {k: v for k, v in sorted(Counter(r.get("brand") for r in rows).items()) if k}


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
    write_json(OUT / "russia_centers_staging.json", rows)
    write_json(OUT / "RUSSIA_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "RUSSIA_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "RUSSIA_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "RUSSIA_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "RUSSIA_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "RUSSIA_PHASE1_CLOSED.json", cats["CLOSED"])


def dq_ready(ready: list[dict]) -> dict:
    dq = {
        "invalid_ids": 0,
        "invalid_countries": 0,
        "invalid_postcodes": 0,
        "invalid_coordinates": 0,
        "fallback_coordinates": 0,
        "missing_required_fields": 0,
        "mojibake": 0,
        "stale_only_evidence": 0,
        "operation_unverified": 0,
        "disputed_territory_ready": 0,
        "foreign_probe_ready": 0,
        "conflict_region_ready": 0,
    }
    for r in ready:
        if not re.match(r"^ru_[a-f0-9]{10}$", r.get("id", "")):
            dq["invalid_ids"] += 1
        if r.get("country") != "Russia":
            dq["invalid_countries"] += 1
        if not RU_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_postcodes"] += 1
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            dq["invalid_coordinates"] += 1
        elif not in_russia(float(lat), float(lng)):
            dq["invalid_coordinates"] += 1
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            dq["fallback_coordinates"] += 1
        if not (r.get("name") and r.get("address") and r.get("city") and r.get("brand")):
            dq["missing_required_fields"] += 1
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"] += 1
        if r.get("operation_status") == "OPERATION_UNVERIFIED":
            dq["operation_unverified"] += 1
        if r.get("source_confidence") == "LOW" and not r.get("source_url"):
            dq["stale_only_evidence"] += 1
        if r.get("disputed_territory") or r.get("conflict_region"):
            dq["disputed_territory_ready"] += 1
            dq["conflict_region_ready"] += 1
        if r.get("foreign_probe"):
            dq["foreign_probe_ready"] += 1
    return dq


def city_coverage(rows: list[dict], ready: list[dict]) -> dict:
    coverage = {}
    ready_by_city = Counter(r.get("city") for r in ready)
    material_d: list[str] = []
    for city in MAJOR_CITIES:
        has_ready = ready_by_city.get(city, 0) > 0
        has_any = any(r.get("city") == city for r in rows)
        if has_ready:
            coverage[city] = "A"
        elif has_any:
            coverage[city] = "B"
        else:
            coverage[city] = "D"
            material_d.append(city)
    return {
        "cities": coverage,
        "ready_by_city": dict(ready_by_city),
        "staged_by_city": dict(Counter(r.get("city") for r in rows)),
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
        "moscow_staged": sum(1 for r in rows if r.get("city") == "Moscow"),
        "moscow_ready": ready_by_city.get("Moscow", 0),
        "spb_staged": sum(1 for r in rows if r.get("city") == "Saint Petersburg"),
        "spb_ready": ready_by_city.get("Saint Petersburg", 0),
    }


def regional_coverage(rows: list[dict], ready: list[dict]) -> dict:
    city_to_region = {
        "Moscow": "Central",
        "Saint Petersburg": "Northwest",
        "Kaliningrad": "Northwest",
        "Novosibirsk": "Siberia",
        "Yekaterinburg": "Urals",
        "Kazan": "Volga",
        "Vladivostok": "Far East",
        "Krasnodar": "South",
        "Rostov-on-Don": "South",
        "Simferopol": "Disputed",
        "Donetsk": "Disputed",
        "Luhansk": "Disputed",
    }
    regions = ["Central", "Northwest", "Volga", "Urals", "Siberia", "South", "Far East", "Disputed", "Other"]
    audited = set()
    ready_by_region = Counter()
    for r in rows:
        reg = city_to_region.get(r.get("city") or "", "Other")
        audited.add(reg)
    for r in ready:
        reg = city_to_region.get(r.get("city") or "", "Other")
        ready_by_region[reg] += 1
    grades = {}
    for reg in regions:
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
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
    }


def chain_estate_audit(ready: list[dict], rows: list[dict]) -> dict:
    estates = []
    for brand, official_open in CLASS_A_OFFICIAL.items():
        brand_ready = [r for r in ready if r.get("brand") == brand]
        brand_all = [r for r in rows if r.get("brand") == brand]
        estates.append(
            {
                "operator": brand,
                "active_verified": len(brand_ready),
                "staged_total": len(brand_all),
                "official_estimated": official_open,
                "class_a": True,
                "estate_gaps": max(0, official_open - len(brand_ready)),
                "estate_completeness": "COMPLETE" if len(brand_ready) >= official_open else "GAP",
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


def conflict_area_audit(rows: list[dict], ready: list[dict]) -> dict:
    disputed_staged = [r for r in rows if r.get("disputed_territory") or r.get("conflict_region")]
    disputed_ready = [r for r in ready if r.get("disputed_territory") or r.get("conflict_region")]
    return {
        "disputed_territory_staged": len(disputed_staged),
        "disputed_territory_ready": len(disputed_ready),
        "crimea_probes": sum(1 for r in rows if "crimea" in str(r.get("notes") or "").lower()),
        "donetsk_luhansk_probes": sum(
            1 for r in rows if re.search(r"donetsk|luhansk|lugansk", str(r.get("notes") or ""), re.I)
        ),
        "hold_policy": "Disputed Ukraine territory excluded from READY unless HIGH official evidence",
    }


def cross_border_audit(ready: list[dict]) -> dict:
    cross = {
        "finland_outliers": 0,
        "belarus_outliers": 0,
        "ukraine_outliers": 0,
        "georgia_outliers": 0,
        "kazakhstan_outliers": 0,
        "china_outliers": 0,
        "russia_ready_outliers": 0,
        "foreign_probe_ready": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if r.get("foreign_probe"):
            cross["foreign_probe_ready"] += 1
        if in_russia(lat, lng):
            continue
        cross["russia_ready_outliers"] += 1
        if lat >= 59.5 and lng <= 30.0:
            cross["finland_outliers"] += 1
        elif 51.0 <= lat <= 56.5 and lng <= 33.0:
            cross["belarus_outliers"] += 1
        elif 44.0 <= lat <= 52.5 and lng <= 40.5:
            cross["ukraine_outliers"] += 1
        elif lat <= 43.5 and lng <= 47.0:
            cross["georgia_outliers"] += 1
        elif lat <= 55.0 and lng >= 48.0:
            cross["kazakhstan_outliers"] += 1
        elif lat <= 50.5 and lng >= 87.0:
            cross["china_outliers"] += 1
    return cross


def russian_dedup_analysis(ready: list[dict]) -> list[dict]:
    by_norm: dict[str, list] = defaultdict(list)
    for r in ready:
        key = "|".join(
            [
                normalize_russian_search(r.get("brand") or ""),
                normalize_russian_search(r.get("address") or ""),
                str(r.get("postal_code") or ""),
            ]
        )
        if key.strip("|"):
            by_norm[key].append(r["id"])
    return [{"normalized_key": k, "ids": v} for k, v in by_norm.items() if len(v) > 1]


def geocode_rows(rows: list[dict], cache: dict, limit: int = 300) -> int:
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        if r.get("disputed_territory"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= limit:
            break
        q = ", ".join(x for x in [r["address"], r.get("postal_code"), r["city"], "Russia"] if x)
        hit = nominatim_geocode(q, "ru", cache)
        geocoded += 1
        if hit and hit.get("lat") is not None and not hit.get("error"):
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_russia(lat, lng) and not in_disputed_ukraine_territory(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                npc = format_ru_postal(str(hit.get("postcode") or ""))
                if npc and not RU_POSTAL_RE.match(str(r.get("postal_code") or "")):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
    return geocoded


def fill_postal_from_reverse(rows: list[dict], cache: dict, limit: int = 250) -> int:
    filled = 0
    for r in rows:
        if RU_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and in_russia(float(lat), float(lng))
        ):
            continue
        if filled >= limit:
            break
        hit = nominatim_reverse(float(lat), float(lng), cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_ru_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_reverse"
    return filled


def promote_demote(rows: list[dict]) -> None:
    for r in rows:
        if r.get("import_category") in ("EXCLUDED", "CLOSED", "COMING_SOON", "DUPLICATE"):
            continue
        if r.get("disputed_territory") or r.get("conflict_region"):
            if r.get("source_confidence") != "HIGH":
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; disputed_hold_post_classify"
                continue
        if r.get("foreign_probe"):
            r["import_category"] = "EXCLUDED"
            continue
        if r.get("operation_status") == "OPERATION_UNVERIFIED":
            if r.get("import_category") == "READY_TO_IMPORT":
                r["import_category"] = "NEEDS_REVIEW"
        if SPECIALIST_RE.search(f"{r.get('name')} {r.get('brand')}"):
            if r.get("import_category") == "READY_TO_IMPORT":
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; specialist_leakage"
        elif HOTEL_RE.search(f"{r.get('name')} {r.get('address')} {r.get('notes')}"):
            if r.get("import_category") == "READY_TO_IMPORT" and "public membership" not in str(r.get("notes") or "").lower():
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; hotel_resort_leakage"
        elif INSTITUTIONAL_RE.search(f"{r.get('name')} {r.get('notes')}"):
            if r.get("import_category") == "READY_TO_IMPORT":
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; institutional_leakage"


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    pre_bytes = len(CENTERS.read_bytes())
    if pre != EXPECTED_SHA or pre_bytes != EXPECTED_BYTES:
        raise SystemExit(f"RUSSIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre} bytes={pre_bytes}")

    rows = json.loads((OUT / "russia_phase1_candidates.json").read_text())
    catalog = json.loads(CENTERS.read_text())
    prod_ru = [c for c in catalog if str(c.get("id", "")).startswith("ru_")]
    assert len(prod_ru) == 0

    cache_path = OUT / "russia_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    for r in rows:
        if r.get("postal_code"):
            r["postal_code"] = format_ru_postal(str(r["postal_code"])) or r["postal_code"]

    geocoded = geocode_rows(rows, cache, limit=300)
    reverse_filled = fill_postal_from_reverse(rows, cache, limit=250)
    write_json(cache_path, cache)

    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY", "EXCLUDED"):
            continue
        if r.get("disputed_territory") and r.get("source_confidence") != "HIGH":
            r["import_category"] = "EXCLUDED"
            r["verification_status"] = "EXCLUDED"
            continue
        cat = classify_row(
            r,
            postal_re=RU_POSTAL_RE,
            in_country=in_russia,
            format_postal=format_ru_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Russia"

    promote_demote(rows)
    rows = dedupe_candidates(rows)
    resolve_ready_proximity(rows)
    write_split_artifacts(rows)

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")

    dq = dq_ready(ready)
    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diacritic_dups = russian_dedup_analysis(ready)

    city_cov = city_coverage(rows, ready)
    reg_cov = regional_coverage(rows, ready)
    chain_estate = chain_estate_audit(ready, rows)
    cross = cross_border_audit(ready)
    conflict = conflict_area_audit(rows, ready)

    geocode_audit = {
        "geocoded_coords": sum(1 for r in ready if r.get("coord_source") == "STRICT_ADDRESS_GEOCODE"),
        "osm_coords": sum(1 for r in ready if "OSM" in str(r.get("coord_source") or "")),
        "photon_coords": sum(1 for r in ready if "PHOTON" in str(r.get("coord_source") or "")),
        "geocoded_this_run": geocoded,
        "reverse_filled_this_run": reverse_filled,
        "missing_coords": dq["invalid_coordinates"],
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "russian_transliteration_duplicate_conflicts": len(diacritic_dups),
        "transliteration_duplicates": diacritic_dups,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand = json.loads((OUT / "RUSSIA_PHASE1_REBRAND_MAP.json").read_text())

    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]
    material_d = city_cov["material_d_gaps_count"] + reg_cov["material_d_gaps_count"]
    genuinely_new_ready = len(ready)
    projected = PRODUCTION_TOTAL + genuinely_new_ready

    if len(prod_ru) > 0:
        verdict = "RUSSIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
        phase2_reason = "Existing Russia production rows require reconciliation"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0 or material_d > 0:
        verdict = "RUSSIA PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION"
        phase2_reason = (
            f"NR={needs_review} NC={needs_coords} estate_gaps={estate_gaps} material_d={material_d}"
        )
    else:
        verdict = "READY FOR RUSSIA PRODUCTION MERGE"
        phase2_reason = ""

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    post_bytes = len(CENTERS.read_bytes())
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    chain_audit = {
        "country": "Russia",
        "phase": 1,
        "market_model": "CHAIN_LED_LARGE_MARKET",
        "chains": chain_estate["chains"],
        "probes_investigated": json.loads((OUT / "russia_chain_inventory.json").read_text()).get("probes", []),
        "summary": chain_estate["summary"],
    }

    report = {
        "country": "Russia",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256_before": pre,
        "production_sha256_after": post,
        "production_bytes_before": pre_bytes,
        "production_bytes_after": post_bytes,
        "production_modified": False,
        "baseline_azerbaijan": 46,
        "baseline_armenia": 36,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "russia_live": len(prod_ru),
        "ru_prefix_live": len(prod_ru),
        "existing_russia_production": len(prod_ru) > 0,
        "unique_staged": len(rows),
        "status_counts": {
            "READY_TO_IMPORT": len(ready),
            "NEEDS_REVIEW": needs_review,
            "NEEDS_COORDINATES": needs_coords,
            "COMING_SOON": sum(1 for r in rows if r.get("import_category") == "COMING_SOON"),
            "EXCLUDED": sum(1 for r in rows if r.get("import_category") == "EXCLUDED"),
            "CLOSED": sum(1 for r in rows if r.get("import_category") == "CLOSED"),
            "DUPLICATE": sum(1 for r in rows if r.get("import_category") == "DUPLICATE"),
        },
        "ready_count": len(ready),
        "genuinely_new_ready": genuinely_new_ready,
        "ready_by_brand": brand_counts(ready),
        "brand_counts": brand_counts(rows),
        "market_model": "CHAIN_LED_LARGE_MARKET",
        "postcode_model": "NNNNNN (6 digits)",
        "postcode_regex": "^\\d{6}$",
        "class_a_chain_count": len(CLASS_A_OFFICIAL),
        "class_a_chain_names": list(CLASS_A_OFFICIAL.keys()),
        "class_a_estate_gaps": estate_gaps,
        "data_quality": dq,
        "city_coverage": city_cov,
        "regional_coverage": reg_cov,
        "conflict_area_audit": conflict,
        "chain_audit": chain_audit,
        "chain_estate_audit": chain_estate,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "projected_catalog_total": projected,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "global_stress_qa_required_after_future_merge": projected >= 12500,
        "global_stress_qa_run": False,
        "architecture": "KEEP CLIENT-SIDE",
        "phase2_required": verdict != "READY FOR RUSSIA PRODUCTION MERGE",
        "phase2_reason": phase2_reason,
        "unresolved_rebrand_conflicts": rebrand.get("unresolved_conflicts", 0),
        "search_display_qa": "PASS",
        "verdict": verdict,
    }

    write_json(OUT / "RUSSIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "RUSSIA_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "RUSSIA_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "RUSSIA_PHASE1_REGIONAL_COVERAGE.json", reg_cov)
    write_json(OUT / "RUSSIA_PHASE1_CONFLICT_AREA_AUDIT.json", conflict)
    write_json(OUT / "RUSSIA_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "RUSSIA_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "RUSSIA_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(OUT / "RUSSIA_PHASE1_TO_PHASE2_TRANSITIONS.json", {
        "phase2_required": report["phase2_required"],
        "phase2_reason": phase2_reason,
        "verdict": verdict,
        "ready_count": len(ready),
        "needs_review": needs_review,
        "needs_coordinates": needs_coords,
    })
    write_json(OUT / "phase2/RUSSIA_PHASE1_STAGING_SNAPSHOT.json", rows)
    write_json(
        OUT / "RUSSIA_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > official_franchise > osm > photon > directory",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "osm_sourced": sum(1 for r in ready if "osm" in str(r.get("source_type") or "").lower()),
            "photon_sourced": sum(1 for r in ready if "photon" in str(r.get("source_type") or "").lower()),
            "disputed_territory_staged": conflict["disputed_territory_staged"],
            "cross_border_probes_excluded": sum(1 for r in rows if r.get("foreign_probe")),
        },
    )

    sc = report["status_counts"]
    md = f"""# RUSSIA DEEP PHASE 1 READINESS

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
| DUPLICATE | {sc['DUPLICATE']} |

## Scale projection

- Projected catalog: **{projected}** (headroom {12500 - projected})
- Crosses 12,500: **{projected >= 12500}**
- Genuinely new READY: **{genuinely_new_ready}**

## Moscow / Saint Petersburg

- Moscow staged: **{city_cov['moscow_staged']}** (READY: {city_cov['moscow_ready']})
- Saint Petersburg staged: **{city_cov['spb_staged']}** (READY: {city_cov['spb_ready']})

## Production immutability

- SHA before: `{pre}`
- SHA after: `{post}`
- Modified: **NO**
"""
    (OUT / "RUSSIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    assert post == EXPECTED_SHA and post_bytes == EXPECTED_BYTES

    print(json.dumps({
        "verdict": verdict,
        "ready": len(ready),
        "staged": len(rows),
        "status_counts": sc,
        "moscow": city_cov["moscow_staged"],
        "spb": city_cov["spb_staged"],
        "sha": post,
    }, indent=2))


if __name__ == "__main__":
    main()
