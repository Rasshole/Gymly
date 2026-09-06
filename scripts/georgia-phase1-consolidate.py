#!/usr/bin/env python3
"""Georgia Deep Phase 1 consolidate — staging only. Does NOT modify centers.json."""
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
    GE_POSTAL_RE,
    ROOT,
    classify_row,
    format_ge_postal,
    haversine,
    in_georgia,
    nominatim_geocode,
    nominatim_reverse,
    normalize_georgian_search,
    norm_addr,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/georgia"
PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a"
EXPECTED_BYTES = 3824712
PRODUCTION_TOTAL = 12278
CATALOG_HEADROOM = 12500 - PRODUCTION_TOTAL

CLASS_A_OFFICIAL = {
    "Oktopus Fitness": 8,
    "World Class Georgia": 1,
    "Snap Fitness": 1,
    "Champion": 3,
    "Fitness House": 2,
    "Colosseum": 1,
    "Life Sport Club": 1,
    "Arena Sports Complex": 1,
}

MAJOR_CITIES = [
    "Tbilisi", "Batumi", "Kutaisi", "Rustavi", "Gori", "Zugdidi", "Poti", "Telavi", "Kobuleti",
]

REGIONS = [
    "Tbilisi", "Adjara", "Imereti", "Kvemo Kartli", "Shida Kartli", "Samegrelo-Zemo Svaneti",
    "Kakheti", "Abkhazia", "South Ossetia",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"physio|rehab|pt.?studio|boks)\b",
    re.I,
)
HOTEL_RE = re.compile(r"\b(hotel|resort|guest.?only|spa.?only)\b", re.I)
INSTITUTIONAL_RE = re.compile(r"\b(university.?only|military|police|employee.?only|staff.?only)\b", re.I)
FALLBACK_RE = re.compile(r"fallback|centroid|city.?center|usa_probe|conflict_region_probe", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€")


def brand_counts(rows: list[dict]) -> dict[str, int]:
    return {k: v for k, v in sorted(Counter(r.get("brand") for r in rows).items()) if k}


def dedupe_candidates(rows: list[dict]) -> list[dict]:
    """Dedupe by normalized brand/address/coords — keep richest row."""

    def score(x: dict) -> tuple:
        return (
            1 if x.get("import_category") not in ("EXCLUDED", "DUPLICATE") else 0,
            1 if x.get("operation_status") == "ACTIVE_VERIFIED" else 0,
            1 if GE_POSTAL_RE.match(str(x.get("postal_code") or "")) else 0,
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
                normalize_georgian_search(r.get("brand") or ""),
                norm_addr(r.get("address") or ""),
                coord_key,
            ]
        )
        if not key.strip("|"):
            continue
        if key not in kept or score(r) > score(kept[key]):
            if key in kept:
                prev = kept[key]
                prev["import_category"] = "DUPLICATE"
                prev["notes"] = (prev.get("notes") or "") + "; dedupe_superseded"
            kept[key] = r
        else:
            r["import_category"] = "DUPLICATE"
            r["notes"] = (r.get("notes") or "") + "; dedupe_superseded"

    kept_ids = {r["id"] for r in kept.values()}
    out = list(kept.values())
    for r in rows:
        if r["id"] not in kept_ids:
            out.append(r)
    return out


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
        elif cat == "DUPLICATE":
            continue
    write_json(OUT / "georgia_centers_staging.json", rows)
    write_json(OUT / "GEORGIA_PHASE1_READY_TO_IMPORT.json", cats["READY_TO_IMPORT"])
    write_json(OUT / "GEORGIA_PHASE1_NEEDS_REVIEW.json", cats["NEEDS_REVIEW"])
    write_json(OUT / "GEORGIA_PHASE1_NEEDS_COORDINATES.json", cats["NEEDS_COORDINATES"])
    write_json(OUT / "GEORGIA_PHASE1_COMING_SOON.json", cats["COMING_SOON"])
    write_json(OUT / "GEORGIA_PHASE1_EXCLUDED.json", cats["EXCLUDED"])
    write_json(OUT / "GEORGIA_PHASE1_CLOSED.json", cats["CLOSED"])


def geocode_rows(rows: list[dict], cache: dict, limit: int = 120) -> int:
    geocoded = 0
    for r in rows:
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon") or r.get("import_category") == "EXCLUDED":
            continue
        if r.get("usa_probe") or r.get("discovery_class") == "usa_georgia_probe":
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= limit:
            break
        q = ", ".join(x for x in [r["address"], r.get("postal_code"), r["city"], "Georgia"] if x)
        hit = nominatim_geocode(q, "ge", cache)
        geocoded += 1
        if hit and hit.get("lat") is not None and not hit.get("error"):
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_georgia(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                r["evidence"] = {**(r.get("evidence") or {}), "geocode_display": hit.get("display_name")}
                npc = format_ge_postal(str(hit.get("postcode") or ""))
                if npc and not GE_POSTAL_RE.match(str(r.get("postal_code") or "")):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
    return geocoded


def fill_postal_from_reverse(rows: list[dict], cache: dict, limit: int = 80) -> int:
    filled = 0
    for r in rows:
        if GE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        if r.get("import_category") == "EXCLUDED" or r.get("usa_probe"):
            continue
        lat, lng = r.get("lat"), r.get("lng")
        if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and in_georgia(float(lat), float(lng))):
            continue
        if filled >= limit:
            break
        hit = nominatim_reverse(float(lat), float(lng), cache)
        filled += 1
        if not hit or hit.get("error"):
            continue
        npc = format_ge_postal(str(hit.get("postcode") or ""))
        if npc:
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_reverse"
    return filled


def promote_demote(rows: list[dict]) -> None:
    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY"):
            continue
        if r.get("usa_probe") or r.get("discovery_class") == "usa_georgia_probe":
            r["import_category"] = "EXCLUDED"
            continue
        if r.get("conflict_region") and r.get("source_confidence") != "HIGH":
            if r.get("import_category") == "READY_TO_IMPORT":
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = (r.get("notes") or "") + "; conflict_region_hold"
            continue

        cat = classify_row(
            r,
            postal_re=GE_POSTAL_RE,
            in_country=in_georgia,
            format_postal=format_ge_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Georgia"

        if cat == "READY_TO_IMPORT":
            if r.get("operation_status") != "ACTIVE_VERIFIED":
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = (r.get("notes") or "") + "; operation_unverified"
            elif r.get("source_type") == "photon_geocoder" and r.get("eligibility_candidate") != "CHAIN_CLASS_A":
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = (r.get("notes") or "") + "; photon_independent_hold"
            elif r.get("discovery_class") in ("photon_independent", "osm_independent", "regional_independent"):
                if r.get("source_confidence") != "HIGH" or r.get("eligibility_candidate") != "CHAIN_CLASS_A":
                    r["import_category"] = "NEEDS_REVIEW"
                    r["notes"] = (r.get("notes") or "") + "; independent_phase2_hold"
            elif r.get("conflict_region"):
                r["import_category"] = "NEEDS_REVIEW"
                r["notes"] = (r.get("notes") or "") + "; conflict_region_no_ready"
            elif FALLBACK_RE.search(str(r.get("coord_source") or "")):
                r["import_category"] = "NEEDS_COORDINATES"
            elif SPECIALIST_RE.search(f"{r.get('name')} {r.get('brand')}"):
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; specialist_leakage"
            elif HOTEL_RE.search(f"{r.get('name')} {r.get('address')} {r.get('notes')}"):
                if "public membership" not in str(r.get("notes") or "").lower():
                    r["import_category"] = "EXCLUDED"
                    r["notes"] = (r.get("notes") or "") + "; hotel_resort_leakage"
            elif INSTITUTIONAL_RE.search(f"{r.get('name')} {r.get('notes')}"):
                r["import_category"] = "EXCLUDED"
                r["notes"] = (r.get("notes") or "") + "; institutional_leakage"


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
        "material_d_gaps": material_d,
        "material_d_gaps_count": len(material_d),
    }


def regional_coverage(rows: list[dict], ready: list[dict]) -> dict:
    city_to_region = {
        "Tbilisi": "Tbilisi",
        "Batumi": "Adjara",
        "Kobuleti": "Adjara",
        "Kutaisi": "Imereti",
        "Rustavi": "Kvemo Kartli",
        "Gori": "Shida Kartli",
        "Zugdidi": "Samegrelo-Zemo Svaneti",
        "Poti": "Samegrelo-Zemo Svaneti",
        "Telavi": "Kakheti",
        "Sokhumi": "Abkhazia",
        "Tskhinvali": "South Ossetia",
    }
    audited = set()
    ready_by_region = Counter()
    for r in rows:
        reg = city_to_region.get(r.get("city") or "", "Other")
        audited.add(reg)
    for r in ready:
        reg = city_to_region.get(r.get("city") or "", "Other")
        ready_by_region[reg] += 1
    grades = {}
    for reg in REGIONS + ["Other"]:
        if ready_by_region.get(reg, 0) > 0:
            grades[reg] = "A"
        elif reg in audited:
            grades[reg] = "B"
        else:
            grades[reg] = "D"
    material_d = [r for r, g in grades.items() if g == "D" and r in ("Tbilisi", "Adjara", "Imereti")]
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
            "final_class_a_ready_count": sum(e["active_verified"] for e in estates),
            "chain_estate_gaps": gaps,
        },
    }


def cross_border_audit(ready: list[dict]) -> dict:
    cross = {
        "russia_outliers": 0,
        "turkey_outliers": 0,
        "armenia_outliers": 0,
        "azerbaijan_outliers": 0,
        "usa_georgia_outliers": 0,
        "georgia_ready_outliers": 0,
    }
    for r in ready:
        lat, lng = float(r["lat"]), float(r["lng"])
        if in_georgia(lat, lng):
            continue
        cross["georgia_ready_outliers"] += 1
        if lat >= 43.3 and lng <= 40.5:
            cross["russia_outliers"] += 1
        elif lat <= 41.2 and lng <= 42.8:
            cross["turkey_outliers"] += 1
        elif lat <= 41.2 and lng >= 43.8:
            cross["armenia_outliers"] += 1
        elif lng >= 46.2:
            cross["azerbaijan_outliers"] += 1
        elif lng < 0:
            cross["usa_georgia_outliers"] += 1
    return cross


def georgian_dedup_analysis(ready: list[dict]) -> list[dict]:
    by_norm: dict[str, list] = defaultdict(list)
    for r in ready:
        key = "|".join(
            [
                normalize_georgian_search(r.get("brand") or ""),
                normalize_georgian_search(r.get("address") or ""),
                str(r.get("postal_code") or ""),
            ]
        )
        if key.strip("|"):
            by_norm[key].append(r["id"])
    return [{"normalized_key": k, "ids": v} for k, v in by_norm.items() if len(v) > 1]


def main() -> None:
    PHASE1.mkdir(parents=True, exist_ok=True)
    pre = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    pre_bytes = len(CENTERS.read_bytes())
    if pre != EXPECTED_SHA or pre_bytes != EXPECTED_BYTES:
        raise SystemExit(f"GEORGIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {pre} bytes={pre_bytes}")

    rows = json.loads((OUT / "georgia_phase1_candidates.json").read_text())
    catalog = json.loads(CENTERS.read_text())
    prod_ge = [c for c in catalog if str(c.get("id", "")).startswith("ge_")]
    assert len(prod_ge) == 0

    cache_path = OUT / "georgia_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    for r in rows:
        if r.get("postal_code"):
            r["postal_code"] = format_ge_postal(str(r["postal_code"])) or r["postal_code"]

    geocoded = geocode_rows(rows, cache, limit=120)
    reverse_filled = fill_postal_from_reverse(rows, cache, limit=80)
    write_json(cache_path, cache)

    rows = dedupe_candidates(rows)
    promote_demote(rows)
    write_split_artifacts(rows)

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = sum(1 for r in rows if r.get("import_category") == "NEEDS_REVIEW")
    needs_coords = sum(1 for r in rows if r.get("import_category") == "NEEDS_COORDINATES")

    prox = proximity_pairs(ready, brand_only=False)
    hard_dup = sum(len(prox.get(k, [])) for k in ("lt25", "lt50", "identical"))
    diacritic_dups = georgian_dedup_analysis(ready)

    city_cov = city_coverage(rows, ready)
    reg_cov = regional_coverage(rows, ready)
    chain_estate = chain_estate_audit(ready, rows)
    cross = cross_border_audit(ready)

    dq = {
        "invalid_ids": sum(1 for r in ready if not re.match(r"^ge_[a-f0-9]{10}$", r.get("id", ""))),
        "invalid_postcodes": sum(1 for r in ready if not GE_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "invalid_coordinates": sum(
            1
            for r in ready
            if r.get("lat") is None
            or r.get("lng") is None
            or not in_georgia(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coordinates": sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))),
        "mojibake": sum(
            1
            for r in ready
            if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
        ),
        "conflict_region_ready": sum(1 for r in ready if r.get("conflict_region")),
        "usa_probe_ready": sum(1 for r in ready if r.get("usa_probe")),
    }

    geocode_audit = {
        "geocoded_coords": sum(1 for r in ready if r.get("coord_source") == "STRICT_ADDRESS_GEOCODE"),
        "official_website_coords": sum(1 for r in ready if r.get("coord_source") == "OFFICIAL_WEBSITE"),
        "osm_coords": sum(1 for r in ready if "OSM" in str(r.get("coord_source") or "")),
        "photon_coords": sum(1 for r in ready if "PHOTON" in str(r.get("coord_source") or "")),
        "geocoded_this_run": geocoded,
        "reverse_filled_this_run": reverse_filled,
        "missing_coords": dq["invalid_coordinates"],
    }

    dup_analysis = {
        "hard_duplicate_conflicts": hard_dup,
        "georgian_transliteration_duplicate_conflicts": len(diacritic_dups),
        "transliteration_duplicates": diacritic_dups,
        "proximity": {k: len(v) for k, v in prox.items()},
    }

    rebrand = json.loads((OUT / "GEORGIA_PHASE1_REBRAND_MAP.json").read_text())

    estate_gaps = chain_estate["summary"]["chain_estate_gaps"]
    material_d = city_cov["material_d_gaps_count"] + reg_cov["material_d_gaps_count"]
    existing_overlap = [r["id"] for r in ready if r["id"] in {c["id"] for c in prod_ge}]
    genuinely_new_ready = len(ready) - len(existing_overlap)
    projected = PRODUCTION_TOTAL + genuinely_new_ready

    if len(prod_ge) > 0:
        verdict = "GEORGIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION"
        phase2_reason = "Existing Georgia production rows require reconciliation"
    elif needs_review > 0 or needs_coords > 0 or estate_gaps > 0 or material_d > 0:
        verdict = "GEORGIA PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION"
        phase2_reason = (
            f"NR={needs_review} NC={needs_coords} estate_gaps={estate_gaps} material_d={material_d}"
        )
    else:
        verdict = "READY FOR GEORGIA PRODUCTION MERGE"
        phase2_reason = ""

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    post_bytes = len(CENTERS.read_bytes())
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    chain_audit = {
        "country": "Georgia",
        "phase": 1,
        "market_model": "CHAIN_LED_SMALL_MARKET",
        "chains": chain_estate["chains"],
        "summary": chain_estate["summary"],
    }

    report = {
        "country": "Georgia",
        "phase": 1,
        "deep_phase": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256_before": pre,
        "production_sha256_after": post,
        "production_bytes_before": pre_bytes,
        "production_bytes_after": post_bytes,
        "production_modified": False,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "georgia_live": len(prod_ge),
        "ge_prefix_live": len(prod_ge),
        "existing_georgia_production": len(prod_ge) > 0,
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
        "class_a_estate_gaps": estate_gaps,
        "data_quality": dq,
        "city_coverage": city_cov,
        "regional_coverage": reg_cov,
        "chain_audit": chain_audit,
        "cross_border": cross,
        "geocode_audit": geocode_audit,
        "duplicate_analysis": dup_analysis,
        "projected_catalog_total": projected,
        "projected_remaining_headroom": 12500 - projected,
        "projected_crosses_12500": projected >= 12500,
        "phase2_required": verdict != "READY FOR GEORGIA PRODUCTION MERGE",
        "phase2_reason": phase2_reason,
        "verdict": verdict,
    }

    write_json(OUT / "GEORGIA_PHASE1_READINESS_REPORT.json", report)
    write_json(OUT / "GEORGIA_PHASE1_CHAIN_AUDIT.json", chain_audit)
    write_json(OUT / "GEORGIA_PHASE1_CITY_COVERAGE.json", city_cov)
    write_json(OUT / "GEORGIA_PHASE1_REGIONAL_COVERAGE.json", reg_cov)
    write_json(OUT / "GEORGIA_PHASE1_DUPLICATE_ANALYSIS.json", dup_analysis)
    write_json(OUT / "GEORGIA_PHASE1_CROSS_BORDER_AUDIT.json", cross)
    write_json(OUT / "GEORGIA_PHASE1_GEOCODE_AUDIT.json", geocode_audit)
    write_json(
        OUT / "GEORGIA_PHASE1_SOURCE_AUDIT.json",
        {
            "hierarchy": "official_website > official_franchise > osm > photon > directory",
            "ready_with_source_url": sum(1 for r in ready if r.get("source_url")),
            "oktopus_official": sum(1 for r in ready if r.get("brand") == "Oktopus Fitness"),
            "worldclass_official": sum(1 for r in ready if r.get("brand") == "World Class Georgia"),
            "osm_sourced": sum(1 for r in ready if "osm" in str(r.get("source_type") or "").lower()),
            "photon_sourced": sum(1 for r in ready if "photon" in str(r.get("source_type") or "").lower()),
            "conflict_region_staged": sum(1 for r in rows if r.get("conflict_region")),
            "usa_probes_excluded": sum(1 for r in rows if r.get("usa_probe")),
        },
    )

    sc = report["status_counts"]
    md = f"""# GEORGIA DEEP PHASE 1 READINESS

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

## Production immutability

- SHA before: `{pre}`
- SHA after: `{post}`
- Modified: **NO**
"""
    (OUT / "GEORGIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    assert post == EXPECTED_SHA and post_bytes == EXPECTED_BYTES

    print(json.dumps({"verdict": verdict, "ready": len(ready), "staged": len(rows), "sha": post}, indent=2))


if __name__ == "__main__":
    main()
