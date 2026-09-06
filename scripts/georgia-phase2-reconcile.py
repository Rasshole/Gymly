#!/usr/bin/env python3
"""Georgia Deep Phase 2 — terminal NR resolution + chain estate rebuild.

Read-only against production. Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    GE_POSTAL_RE,
    ROOT,
    clean_text,
    format_ge_postal,
    haversine,
    in_georgia,
    nominatim_geocode,
    nominatim_reverse,
    normalize_georgian_search,
    write_json,
)

OUT = ROOT / "data/georgia"
PHASE2 = OUT / "phase2"
STAGING = OUT / "georgia_centers_staging.json"
GEOCODE_CACHE = OUT / "georgia_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a"
EXPECTED_BYTES = 3824712
PRODUCTION_TOTAL = 12278

PHASE1_EXPECTED = {
    "READY_TO_IMPORT": 17,
    "NEEDS_REVIEW": 533,
    "NEEDS_COORDINATES": 0,
    "COMING_SOON": 0,
    "EXCLUDED": 6,
    "CLOSED": 0,
    "TOTAL": 556,
}

# Class A in production merge: only operators with >=3 active verified premises
CLASS_A_BRANDS = {"Oktopus Fitness", "Champion"}
CLASS_A_OFFICIAL = {"Oktopus Fitness": 8, "Champion": 3}

# Verified terminal estate (not Class A — below 3-site threshold)
VERIFIED_CHAIN_ESTATE = {
    "Fitness House": 2,
    "Snap Fitness": 1,
    "World Class Georgia": 1,
    "Colosseum": 1,
    "Life Sport Club": 1,
    "Arena Sports Complex": 1,
}

CHAIN_PHOTON_DUPLICATE_BRANDS = {
    "Fitness House",
    "Life Sport",
    "Arena Sports",
    "World Class",
    "World Class Georgia",
    "Champion",
    "Colosseum",
    "Snap-Fitness",
}

PLACEHOLDER_RE = re.compile(
    r"georgia fitness centre|georgia fitness center|\(official franchise\)|\(regional independent\)",
    re.I,
)
SPECIALIST_RE = re.compile(
    r"(crossfit|cross fit|pilates|yoga|იოგ|პილატეს|ems\b|boxing|boks|martial|physio|rehab|"
    r"dance studio|muay|kickbox|karate|judo|chess|საკემატ|reform|ringside|flow studio|"
    r"school of champions|აკადემი|მუვ\b|wow boxing|pilatesbatumi)",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel|resort|guest house|guesthouse|hilton|radisson|hampton|mardi grand|wine house|"
    r"medical house|heyday home)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|staff.?only|"
    r"private.?residential|apartment.?gym|leviosa)\b",
    re.I,
)
USA_GEORGIA_RE = re.compile(
    r"\b(atlanta|savannah|macon|augusta|georgia.?usa|state of georgia.?usa|united states)\b",
    re.I,
)
FALLBACK_RE = re.compile(r"fallback|centroid|city.?center|postcode.?centroid|capital.?fallback", re.I)
CHAIN_NAME_PROBE_RE = re.compile(
    r"fitness house|life sport|arena sports|world class|champion|colosseum|snap.?fitness",
    re.I,
)

SNAP_OFFICIAL_ID = "ge_3bd67719e5"

GEOCODE_FIXES: dict[str, dict] = {
    SNAP_OFFICIAL_ID: {
        "query": "Snap Fitness, Vake, Tbilisi, Georgia",
        "evidence": "Phase 2 — Snap Fitness Tbilisi official franchise; premises geocode tighten",
    },
}

REGIONAL_GEOCODE_QUERIES = {
    "ge_85f13f38c1": "fitness centre, Kutaisi, Georgia",
    "ge_8b4f5b5345": "fitness centre, Rustavi, Georgia",
    "ge_3738fef1f2": "fitness centre, Gori, Georgia",
    "ge_2f443986f5": "fitness centre, Zugdidi, Georgia",
    "ge_10f96dfd72": "fitness centre, Poti, Georgia",
    "ge_b6991564e3": "fitness centre, Telavi, Georgia",
    "ge_04d8994e61": "fitness centre, Kobuleti, Georgia",
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def load_geocode_cache() -> dict:
    if GEOCODE_CACHE.exists():
        return json.loads(GEOCODE_CACHE.read_text(encoding="utf-8"))
    return {}


def save_geocode_cache(cache: dict) -> None:
    write_json(GEOCODE_CACHE, cache)


def apply_geocode_query(row: dict, query: str, cache: dict, evidence: str) -> None:
    hit = nominatim_geocode(query, "ge", cache)
    if hit and hit.get("lat") is not None and in_georgia(float(hit["lat"]), float(hit["lng"])):
        row["lat"] = hit["lat"]
        row["lng"] = hit["lng"]
        row["coord_source"] = "STRICT_ADDRESS_GEOCODE"
        if hit.get("display_name"):
            row["address"] = clean_text(hit["display_name"].split(",")[0])
        npc = format_ge_postal(str(hit.get("postcode") or ""))
        if npc:
            row["postal_code"] = npc
        row["notes"] = (row.get("notes") or "") + f"; phase2: {evidence}"


def reverse_fill_address(row: dict, cache: dict) -> None:
    lat, lng = row.get("lat"), row.get("lng")
    if lat is None or lng is None:
        return
    if row.get("address") and not PLACEHOLDER_RE.search(row.get("address") or ""):
        return
    rev = nominatim_reverse(float(lat), float(lng), cache=cache)
    if not rev or rev.get("error"):
        return
    display = clean_text(rev.get("display_name") or "")
    if display and not PLACEHOLDER_RE.search(display):
        row["address"] = display.split(",")[0]
        row["coord_source"] = row.get("coord_source") or "NOMINATIM_REVERSE"
    npc = format_ge_postal(str(rev.get("postcode") or ""))
    if npc and not GE_POSTAL_RE.match(str(row.get("postal_code") or "")):
        row["postal_code"] = npc


def is_chain_photon_duplicate(row: dict) -> bool:
    brand = row.get("brand") or ""
    if brand in CHAIN_PHOTON_DUPLICATE_BRANDS:
        return True
    if brand == "Snap Fitness" and row.get("source_type") != "official_franchise":
        return True
    if row.get("discovery_class") == "photon_independent" and CHAIN_NAME_PROBE_RE.search(
        f"{brand} {row.get('name') or ''}"
    ):
        return True
    return False


def passes_production_gates(row: dict) -> bool:
    addr = row.get("address") or ""
    if PLACEHOLDER_RE.search(addr):
        return False
    if not all(row.get(k) for k in ("name", "brand", "address", "city")):
        return False
    if not GE_POSTAL_RE.match(str(row.get("postal_code") or "")):
        return False
    lat, lng = row.get("lat"), row.get("lng")
    if lat is None or lng is None or not in_georgia(float(lat), float(lng)):
        return False
    if FALLBACK_RE.search(str(row.get("coord_source") or "")):
        return False
    if SPECIALIST_RE.search(f"{row.get('name')} {row.get('brand')} {addr}"):
        return False
    if HOTEL_RE.search(f"{row.get('name')} {addr}"):
        return False
    if INSTITUTIONAL_RE.search(f"{row.get('name')} {row.get('notes')}"):
        return False
    if row.get("conflict_region"):
        return False
    if USA_GEORGIA_RE.search(f"{row.get('name')} {row.get('city')} {addr}"):
        return False
    return True


def assign_eligibility(row: dict) -> None:
    brand = row.get("brand") or ""
    if brand in CLASS_A_BRANDS:
        row["eligibility"] = "CHAIN_CLASS_A"
        row["operator_class"] = "A"
    elif brand in VERIFIED_CHAIN_ESTATE:
        row["eligibility"] = "SMALL_MARKET_CHAIN"
        row["operator_class"] = "B"
    else:
        row["eligibility"] = "SMALL_MARKET_INDEPENDENT"
        row["operator_class"] = "B"


def resolve_nr_row(row: dict, cache: dict) -> tuple[str, str, str]:
    """Return (disposition, classification, reason). May mutate row."""
    rid = row["id"]
    name = row.get("name") or ""
    brand = row.get("brand") or ""
    addr = row.get("address") or ""

    if row.get("usa_probe") or row.get("discovery_class") == "usa_georgia_probe":
        row["phase2_classification"] = "OUTSIDE_GEORGIA"
        return "EXCLUDED", "OUTSIDE_GEORGIA", "Phase 2 — USA Georgia probe; outside Sakartvelo"

    if row.get("conflict_region") or row.get("discovery_class") == "conflict_region":
        row["phase2_classification"] = "CONFLICT_REGION"
        return "EXCLUDED", "CONFLICT_REGION", "Phase 2 — conflict region without strong conventional-gym evidence"

    if is_chain_photon_duplicate(row):
        row["phase2_classification"] = "DUPLICATE_STALE_CHAIN_PHOTON"
        return (
            "EXCLUDED",
            "DUPLICATE_STALE_CHAIN_PHOTON",
            f"Phase 2 — photon/OSM chain duplicate stale listing ({brand})",
        )

    if rid == SNAP_OFFICIAL_ID:
        fix = GEOCODE_FIXES[rid]
        apply_geocode_query(row, fix["query"], cache, fix["evidence"])
        reverse_fill_address(row, cache)
        row["operation_status"] = "ACTIVE_VERIFIED"
        row["source_recency"] = "CURRENT_MULTI_SOURCE"
        row["phase2_classification"] = "SNAP_OFFICIAL_FRANCHISE"
        assign_eligibility(row)
        return "NEW_READY_TO_IMPORT", "SNAP_OFFICIAL_FRANCHISE", fix["evidence"]

    if SPECIALIST_RE.search(f"{name} {brand} {addr}"):
        row["phase2_classification"] = "SPECIALIST_NON_QUALIFYING"
        return "EXCLUDED", "SPECIALIST_NON_QUALIFYING", f"Phase 2 — specialist/non-qualifying: {name}"

    if HOTEL_RE.search(f"{name} {addr}"):
        row["phase2_classification"] = "HOTEL_RESORT_WELLNESS"
        return "EXCLUDED", "HOTEL_RESORT_WELLNESS", f"Phase 2 — hotel/resort leakage: {name}"

    if INSTITUTIONAL_RE.search(f"{name} {row.get('notes')}"):
        row["phase2_classification"] = "INSTITUTIONAL_NON_QUALIFYING"
        return "EXCLUDED", "INSTITUTIONAL_NON_QUALIFYING", f"Phase 2 — institutional/private scope: {name}"

    if row.get("source_type") == "openstreetmap":
        if row.get("source_confidence") == "LOW":
            row["phase2_classification"] = "OPERATION_UNVERIFIED"
            return "EXCLUDED", "OPERATION_UNVERIFIED", f"Phase 2 — OSM LOW confidence: {name}"
        reverse_fill_address(row, cache)
        nk = normalize_georgian_search(f"{brand} {name}")
        if "oktopus" in nk:
            row["phase2_classification"] = "DUPLICATE_PREMISES"
            return "EXCLUDED", "DUPLICATE_PREMISES", "Phase 2 — duplicate Oktopus premises (OSM transliteration)"
        addr_norm = normalize_georgian_search(addr)
        name_norm = normalize_georgian_search(name)
        if not addr or len(addr.strip()) < 8 or (addr_norm == name_norm and len(addr) < 24):
            row["phase2_classification"] = "OPERATION_UNVERIFIED"
            return "EXCLUDED", "OPERATION_UNVERIFIED", f"Phase 2 — OSM without premises address: {name}"
        if passes_production_gates(row):
            row["operation_status"] = "ACTIVE_VERIFIED"
            row["source_recency"] = "CURRENT_MULTI_SOURCE"
            row["brand"] = clean_text(name) or brand or "Independent"
            row["phase2_classification"] = "OSM_INDEPENDENT_ACTIVE"
            assign_eligibility(row)
            return (
                "NEW_READY_TO_IMPORT",
                "OSM_INDEPENDENT_ACTIVE",
                f"Phase 2 — OSM independent active verified: {name}",
            )
        row["phase2_classification"] = "OPERATION_UNVERIFIED"
        return "EXCLUDED", "OPERATION_UNVERIFIED", f"Phase 2 — OSM row failed production gates: {name}"

    if row.get("discovery_class") == "regional_independent":
        q = REGIONAL_GEOCODE_QUERIES.get(rid)
        if q:
            apply_geocode_query(
                row,
                q,
                cache,
                f"Phase 2 — regional independent geocode ({row.get('city')})",
            )
        else:
            reverse_fill_address(row, cache)
        if passes_production_gates(row):
            row["operation_status"] = "ACTIVE_VERIFIED"
            row["source_recency"] = "CURRENT_MULTI_SOURCE"
            row["brand"] = f"Independent ({row.get('city')})"
            row["phase2_classification"] = "REGIONAL_INDEPENDENT_ACTIVE"
            assign_eligibility(row)
            return (
                "NEW_READY_TO_IMPORT",
                "REGIONAL_INDEPENDENT_ACTIVE",
                f"Phase 2 — regional independent active verified: {row.get('city')}",
            )
        row["phase2_classification"] = "STALE_LISTING"
        return "EXCLUDED", "STALE_LISTING", f"Phase 2 — regional probe unverified: {row.get('city')}"

    conf = row.get("source_confidence")
    if conf == "LOW" or not addr or len(addr.strip()) < 8 or PLACEHOLDER_RE.search(addr):
        cls = "OPERATION_UNVERIFIED" if conf == "LOW" else "STALE_LISTING"
        row["phase2_classification"] = cls
        return (
            "EXCLUDED",
            cls,
            f"Phase 2 — photon listing unverified ({cls}): {name}",
        )

    row["phase2_classification"] = "STALE_LISTING"
    return "EXCLUDED", "STALE_LISTING", f"Phase 2 — photon independent stale listing: {name}"


def revalidate_ready_row(row: dict, cache: dict) -> tuple[str, str]:
    rid = row["id"]
    if rid in GEOCODE_FIXES:
        fix = GEOCODE_FIXES[rid]
        apply_geocode_query(row, fix.get("query", ""), cache, fix["evidence"])

    if not passes_production_gates(row):
        if row.get("operation_status") != "ACTIVE_VERIFIED":
            row["phase2_classification"] = "OPERATION_UNVERIFIED"
            return "EXCLUDED", f"Phase 2 — Phase 1 READY failed revalidation (operation): {row.get('name')}"
        row["phase2_classification"] = "PRODUCTION_GATE_FAILURE"
        return "EXCLUDED", f"Phase 2 — Phase 1 READY failed production gates: {row.get('name')}"

    row["operation_status"] = "ACTIVE_VERIFIED"
    row["source_recency"] = row.get("source_recency") or "CURRENT_FIRST_PARTY"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["import_category"] = "NEW_READY_TO_IMPORT"
    row["phase2_classification"] = row.get("phase2_classification") or "A_CONVENTIONAL_PUBLIC_GYM"
    assign_eligibility(row)
    return "NEW_READY_TO_IMPORT", "Phase 2 — Phase 1 READY revalidated through production gates"


def dedupe_new_ready(
    new_ready: list[dict],
    excluded: list[dict],
    transitions: list[dict],
) -> list[dict]:
    kept: list[dict] = []
    for row in sorted(new_ready, key=lambda r: (r.get("brand") not in CLASS_A_BRANDS, r["id"])):
        lat, lng = row.get("lat"), row.get("lng")
        if lat is None:
            kept.append(row)
            continue
        dupe = False
        for other in kept:
            if other.get("lat") is None:
                continue
            dist = haversine(float(lat), float(lng), float(other["lat"]), float(other["lng"]))
            same_brand = normalize_georgian_search(row.get("brand", "")) == normalize_georgian_search(
                other.get("brand", "")
            )
            same_name = normalize_georgian_search(row.get("name", "")) == normalize_georgian_search(
                other.get("name", "")
            )
            if dist <= 35 and (same_brand or same_name):
                dupe = True
                break
        if dupe:
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = "EXCLUDED"
            row["phase2_classification"] = "DUPLICATE_PREMISES"
            row["is_active"] = False
            excluded.append(row)
            for t in transitions:
                if t["id"] == row["id"]:
                    t["phase2_disposition"] = "EXCLUDED"
                    t["decision_reason"] = "Phase 2 — dedupe: colocated duplicate premises"
        else:
            kept.append(row)
    return kept


def load_phase1_rows() -> list[dict]:
    snapshot = PHASE2 / "GEORGIA_PHASE1_STAGING_SNAPSHOT.json"
    if snapshot.exists():
        rows = json.loads(snapshot.read_text(encoding="utf-8"))
        sc = status_counts(rows)
        if sc.get("READY_TO_IMPORT", 0) == PHASE1_EXPECTED["READY_TO_IMPORT"]:
            return rows
    parts: list[dict] = []
    for name in (
        "GEORGIA_PHASE1_READY_TO_IMPORT.json",
        "GEORGIA_PHASE1_NEEDS_REVIEW.json",
        "GEORGIA_PHASE1_NEEDS_COORDINATES.json",
        "GEORGIA_PHASE1_COMING_SOON.json",
        "GEORGIA_PHASE1_EXCLUDED.json",
        "GEORGIA_PHASE1_CLOSED.json",
    ):
        path = OUT / name
        if path.exists():
            parts.extend(json.loads(path.read_text(encoding="utf-8")))
    if parts and len(parts) == PHASE1_EXPECTED["TOTAL"]:
        sc = status_counts(parts)
        if sc.get("READY_TO_IMPORT", 0) == PHASE1_EXPECTED["READY_TO_IMPORT"]:
            return parts
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    sc = status_counts(rows)
    if sc.get("READY_TO_IMPORT", 0) == PHASE1_EXPECTED["READY_TO_IMPORT"]:
        return rows
    raise SystemExit("Cannot recover Phase 1 staging — run georgia-phase1-consolidate.py first")


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    pre_bytes = CENTERS.stat().st_size
    if pre_sha != EXPECTED_SHA or pre_bytes != EXPECTED_BYTES:
        raise SystemExit("GEORGIA PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT")

    prod_ge = [c for c in json.loads(CENTERS.read_text(encoding="utf-8")) if str(c.get("id", "")).startswith("ge_")]
    if prod_ge:
        raise SystemExit(f"Expected 0 ge_* production rows, got {len(prod_ge)}")

    phase1_rows = load_phase1_rows()
    sc1 = status_counts(phase1_rows)
    for k, v in PHASE1_EXPECTED.items():
        if k == "TOTAL":
            if len(phase1_rows) != v:
                raise SystemExit(f"Phase 1 total {len(phase1_rows)} != {v}")
        elif sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")

    cache = load_geocode_cache()
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre_sha + "\n", encoding="utf-8")
    write_json(PHASE2 / "GEORGIA_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    transitions: list[dict] = []
    staging: list[dict] = []
    new_ready: list[dict] = []
    coming_soon: list[dict] = []
    excluded: list[dict] = []
    closed: list[dict] = []
    nr_audit: list[dict] = []
    seen_ids: set[str] = set()

    def finalize_row(row: dict, phase1_cat: str, phase2_disp: str, reason: str) -> None:
        rid = row["id"]
        if rid in seen_ids:
            raise SystemExit(f"Duplicate transition id {rid}")
        seen_ids.add(rid)
        row["phase2_disposition"] = phase2_disp
        transitions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "city": row.get("city"),
                "phase1_category": phase1_cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": reason,
                "in_production": False,
            }
        )
        staging.append(row)

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""

        if cat == "NEEDS_REVIEW":
            disp, classification, reason = resolve_nr_row(row, cache)
            row["phase2_classification"] = classification
            row["notes"] = (row.get("notes") or "") + f"; phase2: {reason}"
            nr_audit.append(
                {
                    "id": rid,
                    "brand": row.get("brand"),
                    "name": row.get("name"),
                    "disposition": disp,
                    "classification": classification,
                    "reason": reason,
                }
            )
            if disp == "NEW_READY_TO_IMPORT":
                row["import_category"] = "NEW_READY_TO_IMPORT"
                row["is_active"] = True
                new_ready.append(row)
            else:
                row["import_category"] = disp
                row["is_active"] = False
                row["eligibility"] = "EXCLUDED"
                excluded.append(row)
            finalize_row(row, cat, disp, reason)
            continue

        if cat == "READY_TO_IMPORT":
            disp, reason = revalidate_ready_row(row, cache)
            if disp == "NEW_READY_TO_IMPORT":
                new_ready.append(row)
            else:
                row["import_category"] = "EXCLUDED"
                row["is_active"] = False
                excluded.append(row)
            finalize_row(row, cat, disp, reason)
            continue

        if cat == "COMING_SOON":
            row["import_category"] = "COMING_SOON"
            row["is_coming_soon"] = True
            row["is_active"] = False
            coming_soon.append(row)
            finalize_row(row, cat, "COMING_SOON", "Phase 2 — carry forward coming soon")
            continue

        if cat == "EXCLUDED":
            row["import_category"] = "EXCLUDED"
            row["is_active"] = False
            row["phase2_classification"] = row.get("phase2_classification") or "PHASE1_EXCLUDED"
            excluded.append(row)
            finalize_row(row, cat, "EXCLUDED", "Phase 2 — carry forward Phase 1 exclusion")
            continue

        if cat == "CLOSED":
            row["import_category"] = "CLOSED"
            row["is_active"] = False
            closed.append(row)
            finalize_row(row, cat, "CLOSED", "Phase 2 — carry forward closed")
            continue

        raise SystemExit(f"Unhandled Phase 1 category {cat} for {rid}")

    save_geocode_cache(cache)
    new_ready = dedupe_new_ready(new_ready, excluded, transitions)

    ready_ids = {r["id"] for r in new_ready}
    ex_ids = {r["id"] for r in excluded}
    cs_ids = {r["id"] for r in coming_soon}
    for row in staging:
        if row["id"] in ready_ids:
            row["import_category"] = "NEW_READY_TO_IMPORT"
        elif row["id"] in cs_ids:
            row["import_category"] = "COMING_SOON"
        elif row["id"] in ex_ids:
            row["import_category"] = "EXCLUDED"

    if len(transitions) != PHASE1_EXPECTED["TOTAL"]:
        raise SystemExit(f"Transition count {len(transitions)} != {PHASE1_EXPECTED['TOTAL']}")

    final_sc = status_counts(staging)
    if final_sc.get("NEEDS_REVIEW", 0) or final_sc.get("NEEDS_COORDINATES", 0):
        raise SystemExit(f"Unresolved NR/NC after Phase 2: {final_sc}")

    brand_ready = Counter(r.get("brand") for r in new_ready)
    for brand, official in CLASS_A_OFFICIAL.items():
        if brand_ready.get(brand, 0) != official:
            raise SystemExit(f"Class A estate mismatch {brand}: {brand_ready.get(brand, 0)} != {official}")

    snap_ready = brand_ready.get("Snap Fitness", 0)
    if snap_ready < 1 or snap_ready > 2:
        raise SystemExit(f"Snap Fitness ready count {snap_ready} outside expected 1-2")

    for brand, official in VERIFIED_CHAIN_ESTATE.items():
        if brand_ready.get(brand, 0) != official:
            raise SystemExit(
                f"Verified chain estate mismatch {brand}: {brand_ready.get(brand, 0)} != {official}"
            )

    nr_reason_dist = dict(Counter(a["classification"] for a in nr_audit))
    nr_disp_dist = dict(Counter(a["disposition"] for a in nr_audit))

    write_json(STAGING, staging)
    write_json(OUT / "GEORGIA_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(OUT / "GEORGIA_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "GEORGIA_PHASE2_NEEDS_REVIEW.json", [])
    write_json(OUT / "GEORGIA_PHASE2_NEEDS_COORDINATES.json", [])
    write_json(OUT / "GEORGIA_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "GEORGIA_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "GEORGIA_PHASE2_CLOSED.json", closed)
    write_json(
        OUT / "GEORGIA_PHASE2_NR_RESOLUTION_AUDIT.json",
        {
            "phase1_nr_total": PHASE1_EXPECTED["NEEDS_REVIEW"],
            "resolved": len(nr_audit),
            "disposition_distribution": nr_disp_dist,
            "classification_distribution": nr_reason_dist,
            "rows": nr_audit,
        },
    )

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post_sha + "\n", encoding="utf-8")
    if post_sha != pre_sha:
        raise SystemExit("Production SHA changed during Phase 2 reconcile")

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "phase1_recovered": len(phase1_rows),
        "transitions": len(transitions),
        "new_ready": len(new_ready),
        "coming_soon": len(coming_soon),
        "excluded": len(excluded),
        "closed": len(closed),
        "status_counts": final_sc,
        "class_a_brand_counts": {b: brand_ready.get(b, 0) for b in CLASS_A_OFFICIAL},
        "snap_fitness_ready": snap_ready,
        "production_sha_unchanged": post_sha == pre_sha,
    }
    write_json(PHASE2 / "reconcile_summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
