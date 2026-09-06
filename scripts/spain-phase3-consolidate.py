#!/usr/bin/env python3
"""
Spain Phase 3 consolidate — fast path.

Uses enjoy_spain_p3.json + Nominatim POI dumps + geocode cache.
Minimizes live Nominatim: cache-first, then at most 2 queries per unresolved row.
Does NOT modify centers.json. Does not overwrite valid READY coords.
"""
from __future__ import annotations

import csv
import importlib.util
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/spain"
SCRAPES = OUT / "scrapes"
RAW = OUT / "raw"
PAGES = RAW / "pages"
STAGING = OUT / "spain_centers_staging.json"
CACHE = OUT / "spain_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"

# Load helpers from recovery module
spec = importlib.util.spec_from_file_location(
    "p3", ROOT / "scripts/spain-phase3-recovery.py"
)
p3 = importlib.util.module_from_spec(spec)
sys.modules["p3"] = p3
spec.loader.exec_module(p3)


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def cache_get(cache, query, extra=None):
    key = query if not extra else query + "||" + json.dumps(extra, sort_keys=True)
    return cache.get(key)


def geocode_cache_first(r, cache, live_budget):
    """Try cache only first; spend live_budget for new Nominatim calls."""
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        return False, live_budget
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return False, live_budget

    street = (r.get("address") or "").strip()
    postal = r.get("postal_code") or ""
    city = (r.get("city") or "").strip()
    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        return False, live_budget

    street_clean = re.sub(r"Parque Europa(?=Calle)", "Parque Europa, ", street)
    street_clean = re.sub(r"\s+", " ", street_clean).strip()
    brand = r.get("brand") or ""
    name = r.get("name") or r.get("center_name") or ""

    queries = []
    if brand and postal:
        queries += [
            f"{brand}, {street_clean}, {postal} {city}, Spain",
            f"{brand}, {postal} {city}, Spain",
        ]
    if brand:
        queries.append(f"{brand}, {street_clean}, {city}, Spain")
    if postal:
        queries += [
            f"{street_clean}, {postal} {city}, Spain",
            f"{street_clean}, {postal}, España",
        ]
    queries += [
        f"{street_clean}, {city}, España",
        f"{street_clean}, {city}, Spain",
    ]
    if brand and city:
        queries.append(f"{brand} {city}")
    if name:
        queries.append(name)
    # Synergym-specific short name queries
    if brand == "Synergym":
        short = re.sub(r"^synergym\s+", "", name, flags=re.I).strip()
        if short:
            queries.append(f"Synergym {short}")
            queries.append(f"Synergym, {city}")

    def try_items(items):
        scored = []
        for it in items or []:
            sc, reasons, lat, lng = p3.score_candidate(it, street_clean, postal, city)
            if sc is None:
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name"), it))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            return False
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = p3.haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                return False
        top = scored[0]
        pc = p3.es_postal((top[5].get("address") or {}).get("postcode") or "")
        ok = p3.apply_geocode_hit(r, top[2], top[3], top[1], top[4], "nominatim", pc)
        if ok and street_clean != street:
            r["address"] = street_clean
        return ok

    # Pass 1: cache only
    for q in queries:
        items = cache_get(cache, q)
        if items and try_items(items):
            r["phase"] = "spain_phase3"
            return True, live_budget

    # Pass 2: limited live (prefer brand+city / name / street+postal)
    live_qs = []
    if brand and city:
        live_qs.append(f"{brand} {city}")
    if name and brand:
        live_qs.append(name)
    if postal:
        live_qs.append(f"{street_clean}, {postal} {city}, Spain")
    else:
        live_qs.append(f"{street_clean}, {city}, Spain")

    for q in live_qs:
        if live_budget <= 0:
            break
        if cache_get(cache, q) is not None:
            continue
        try:
            items = p3.nominatim(q, cache)
            live_budget -= 1
        except Exception:
            live_budget -= 1
            time.sleep(0.5)
            continue
        if try_items(items):
            r["phase"] = "spain_phase3"
            return True, live_budget

    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    return False, live_budget


def match_pois(rows, pois, brand):
    n = 0
    for r in rows:
        if r.get("brand") != brand:
            continue
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        if r.get("import_category") in {"DUPLICATE", "COMING_SOON", "CLOSED"}:
            continue
        hit = p3.match_row_to_pois(r, pois)
        if not hit:
            continue
        score, it, pc = hit
        if p3.apply_geocode_hit(
            r, it["lat"], it["lon"],
            ["named_gym_poi_match", f"score_{score}"],
            it.get("display_name"),
            "nominatim_named_gym_poi",
            pc,
        ):
            r["phase"] = "spain_phase3"
            n += 1
    return n


def recover_dreamfit(rows):
    return p3.recover_dreamfit_embeds(rows)


def recover_dir_gofit_metropolitan(rows, cache, live_budget):
    """Targeted recovery for small remaining sets."""
    recovered = 0
    targets = [
        r for r in rows
        if r.get("brand") in {"DIR", "GO fit", "Metropolitan", "Supera", "BeOne", "O2 Centro Wellness", "Forus", "Basic-Fit"}
        and r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
    ]
    for r in targets:
        ok, live_budget = geocode_cache_first(r, cache, live_budget)
        if ok:
            recovered += 1
    return recovered, live_budget


def audit_metropolitan(rows, cache, live_budget):
    """Expand Metropolitan Spain from known city pages if still thin."""
    existing = [r for r in rows if r.get("brand") == "Metropolitan" and r.get("import_category") != "DUPLICATE"]
    # Try Nominatim for Metropolitan Spain clubs
    queries = [
        "Metropolitan Club Barcelona",
        "Metropolitan Club Madrid",
        "Metropolitan Club Bilbao",
        "Metropolitan Club Zaragoza",
        "Club Metropolitan Spain",
        "Metropolitan Sant Just",
    ]
    added = []
    for q in queries:
        if live_budget <= 0:
            break
        try:
            items = p3.nominatim(q, cache)
            live_budget -= 1
        except Exception:
            live_budget -= 1
            continue
        for it in items:
            try:
                lat, lng = float(it["lat"]), float(it["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if not p3.in_spain_bbox(lat, lng):
                continue
            t = (it.get("type") or "").lower()
            if t not in {"fitness_centre", "gym", "sports_centre", "yes"} and it.get("class") not in {"leisure", "amenity"}:
                # still allow if name contains metropolitan
                if "metropolitan" not in (it.get("display_name") or "").lower():
                    continue
            a = it.get("address") or {}
            road = a.get("road") or ""
            hn = a.get("house_number") or ""
            address = f"{road}, {hn}".strip(", ") if road else None
            city = a.get("city") or a.get("town") or a.get("village") or a.get("municipality")
            postal = p3.es_postal(a.get("postcode") or "")
            if not address or not city:
                continue
            # skip if near existing
            dup = False
            for e in existing + added:
                if e.get("lat") is None:
                    continue
                if p3.haversine(lat, lng, float(e["lat"]), float(e["lng"])) < 120:
                    dup = True
                    break
            if dup:
                continue
            name = "Metropolitan " + (city or "")
            row = {
                "id": p3.make_id("Metropolitan", address, postal, city),
                "brand": "Metropolitan",
                "chain": "Metropolitan",
                "name": name,
                "center_name": name,
                "address": address,
                "postal_code": postal or None,
                "city": city,
                "country": "Spain",
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "website": "https://clubmetropolitan.com",
                "source_url": "https://clubmetropolitan.com/",
                "verification_status": "VERIFIED_CURRENT",
                "notes": "nominatim_named_gym_poi; spain_only",
                "is_active": True,
                "import_category": "READY_TO_IMPORT",
                "phase": "spain_phase3",
                "coord_source": "nominatim_named_gym_poi",
                "geocode_status": "ok",
                "geocode_display": it.get("display_name"),
            }
            added.append(row)
    return added, live_budget


def main():
    print("Loading…", flush=True)
    staging = load_json(STAGING)
    cache = load_json(CACHE) if CACHE.exists() else {}

    active0 = [r for r in staging if r.get("import_category") != "DUPLICATE"]
    baseline = {
        "unique_staged": len(active0),
        "READY_TO_IMPORT": sum(1 for r in active0 if r.get("import_category") == "READY_TO_IMPORT"),
        "NEEDS_COORDINATES": sum(1 for r in active0 if r.get("import_category") == "NEEDS_COORDINATES"),
        "NEEDS_REVIEW": sum(1 for r in active0 if r.get("import_category") == "NEEDS_REVIEW"),
        "COMING_SOON": sum(1 for r in active0 if r.get("import_category") == "COMING_SOON"),
        "CLOSED": sum(1 for r in active0 if r.get("import_category") == "CLOSED"),
        "DUPLICATE": sum(1 for r in staging if r.get("import_category") == "DUPLICATE"),
    }
    print("BASELINE", baseline, flush=True)

    ready_snapshot = {
        (r.get("id"), r.get("lat"), r.get("lng"))
        for r in staging
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None
    }
    ready_ids = {r["id"] for r in staging if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None}

    stats = {
        "enjoy_added": 0,
        "poi_matched": 0,
        "embed_recovered": 0,
        "geocode_recovered": 0,
        "metropolitan_added": 0,
        "preserved_ready": baseline["READY_TO_IMPORT"],
        "live_nominatim_used": 0,
    }

    rows = [dict(r) for r in staging]

    # Enjoy
    enjoy_path = SCRAPES / "enjoy_spain_p3.json"
    if enjoy_path.exists():
        enjoy = load_json(enjoy_path)
        rows.extend(enjoy)
        stats["enjoy_added"] = len(enjoy)
        print(f"Enjoy added {len(enjoy)}", flush=True)
    else:
        print("Discovering Enjoy…", flush=True)
        enjoy = p3.discover_enjoy(cache)
        rows.extend(enjoy)
        stats["enjoy_added"] = len(enjoy)

    # POIs
    syn_pois = load_json(RAW / "nominatim_synergym_pois_p3.json") if (RAW / "nominatim_synergym_pois_p3.json").exists() else []
    fp_pois = load_json(RAW / "nominatim_fitnesspark_pois_p3.json") if (RAW / "nominatim_fitnesspark_pois_p3.json").exists() else []
    if not syn_pois:
        syn_pois = p3.fetch_brand_pois(["Synergym"], cache)
        save_json(RAW / "nominatim_synergym_pois_p3.json", syn_pois)
    if not fp_pois:
        fp_pois = p3.fetch_brand_pois(["Fitness Park"], cache)
        save_json(RAW / "nominatim_fitnesspark_pois_p3.json", fp_pois)

    print(f"POIs syn={len(syn_pois)} fp={len(fp_pois)}", flush=True)
    stats["poi_matched"] += match_pois(rows, syn_pois, "Synergym")
    stats["poi_matched"] += match_pois(rows, fp_pois, "Fitness Park")
    df_pois = []
    try:
        df_pois = p3.fetch_brand_pois(["Dreamfit"], cache)
    except Exception:
        df_pois = []
    stats["poi_matched"] += match_pois(rows, df_pois, "Dreamfit")
    print(f"POI matched={stats['poi_matched']}", flush=True)

    # Expand Synergym coverage: one Nominatim query per unresolved city
    syn_cities = sorted({
        (r.get("city") or "").strip()
        for r in rows
        if r.get("brand") == "Synergym"
        and r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        and r.get("city")
    })
    expand_budget = 90
    print(f"Expanding Synergym POIs for {len(syn_cities)} cities (budget {expand_budget})…", flush=True)
    extra_syn = list(syn_pois)
    for city in syn_cities:
        q = f"Synergym, {city}"
        items = cache_get(cache, q)
        if items is None:
            if expand_budget <= 0:
                break
            try:
                items = p3.nominatim(q, cache)
            except Exception:
                items = []
            expand_budget -= 1
        for it in items or []:
            try:
                lat, lng = float(it["lat"]), float(it["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if not p3.in_spain_bbox(lat, lng):
                continue
            extra_syn.append(it)
    seen = set()
    syn_pois2 = []
    for it in extra_syn:
        key = (it.get("osm_type"), it.get("osm_id"), it.get("lat"), it.get("lon"))
        if key in seen:
            continue
        seen.add(key)
        syn_pois2.append(it)
    print(f"Synergym POIs expanded {len(syn_pois)} -> {len(syn_pois2)}", flush=True)
    save_json(RAW / "nominatim_synergym_pois_p3_expanded.json", syn_pois2)
    stats["poi_matched"] += match_pois(rows, syn_pois2, "Synergym")
    print(f"POI matched after expand={stats['poi_matched']}", flush=True)
    stats["syn_expand_queries"] = 90 - expand_budget

    # Embeds
    print("Dreamfit embeds…", flush=True)
    stats["embed_recovered"] += recover_dreamfit(rows)
    stats["embed_recovered"] += p3.recover_fitnesspark_embeds(rows)
    print(f"embeds={stats['embed_recovered']}", flush=True)

    live_budget = 180  # hard cap on new Nominatim calls this run
    start_budget = live_budget

    # Metropolitan expansion (small)
    print("Metropolitan audit…", flush=True)
    met_added, live_budget = audit_metropolitan(rows, cache, live_budget)
    rows.extend(met_added)
    stats["metropolitan_added"] = len(met_added)

    # Small brands first
    n, live_budget = recover_dir_gofit_metropolitan(rows, cache, live_budget)
    stats["geocode_recovered"] += n

    # Priority unresolved geocode
    priority_order = [
        "Synergym", "Fitness Park", "Dreamfit", "DIR", "GO fit",
        "Metropolitan", "Enjoy!", "Basic-Fit", "Forus", "BeOne",
        "O2 Centro Wellness", "Supera", "Eurofitness",
    ]
    unresolved = [
        r for r in rows
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        and r.get("id") not in ready_ids
    ]
    unresolved.sort(key=lambda r: (
        priority_order.index(r.get("brand")) if r.get("brand") in priority_order else 99,
        r.get("brand") or "",
    ))
    print(f"Geocoding {len(unresolved)} unresolved (live_budget={live_budget})…", flush=True)

    for i, r in enumerate(unresolved):
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        ok, live_budget = geocode_cache_first(r, cache, live_budget)
        if ok:
            stats["geocode_recovered"] += 1
        if (i + 1) % 20 == 0:
            print(
                f"  {i+1}/{len(unresolved)} recovered={stats['geocode_recovered']} budget_left={live_budget}",
                flush=True,
            )
            save_json(CACHE, cache)

    stats["live_nominatim_used"] = start_budget - live_budget

    # Dedupe / classify
    kept, collapsed, rebrands = p3.soft_dedupe(rows)

    # Restore any overwritten READY
    by_id = {r["id"]: r for r in kept}
    for r in staging:
        if r.get("id") in ready_ids:
            cur = by_id.get(r["id"])
            if cur is None:
                kept.append(dict(r))
                by_id[r["id"]] = kept[-1]
                cur = kept[-1]
            if cur.get("lat") is None or cur.get("import_category") != "READY_TO_IMPORT":
                cur["lat"] = r["lat"]
                cur["lng"] = r["lng"]
                cur["coord_source"] = r.get("coord_source")
                cur["import_category"] = "READY_TO_IMPORT"
                cur["verification_status"] = "VERIFIED_CURRENT"

    for r in kept:
        p3.classify_row(r)
        # Enjoy with official coords + street stay READY
        if r.get("brand") == "Enjoy!" and r.get("coord_source") == "official_brand_mymaps":
            if r.get("lat") is not None and r.get("address") and r.get("city"):
                if p3.in_spain_bbox(r["lat"], r["lng"]):
                    r["import_category"] = "READY_TO_IMPORT"

    for r in kept:
        if r.get("import_category") == "READY_TO_IMPORT" and not p3.in_spain_bbox(r.get("lat"), r.get("lng")):
            r["lat"] = r["lng"] = None
            r["import_category"] = "NEEDS_COORDINATES"

    # Persist
    save_json(STAGING, kept)
    save_json(CACHE, cache)
    p3.write_geocode_review(kept)
    p3.write_excel(kept)
    save_json(OUT / "spain_duplicate_analysis.json", {
        "collapsed": collapsed[:200],
        "rebrands": rebrands,
        "counts": dict(Counter(c.get("reason") for c in collapsed)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })

    report = p3.write_reports(kept, collapsed, rebrands, stats, baseline)
    print("DONE", report["overall"], flush=True)
    print("RECOMMENDATION", report["recommendation"], flush=True)
    print("READY", report["overall"]["READY_TO_IMPORT"], flush=True)


if __name__ == "__main__":
    main()
