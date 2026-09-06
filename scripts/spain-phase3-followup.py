#!/usr/bin/env python3
"""
Spain Phase 3 follow-up — push Synergym + Fitness Park unresolved further.
Cache-first, then limited live Nominatim. Updates staging + reports.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/spain"
RAW = OUT / "raw"
STAGING = OUT / "spain_centers_staging.json"
CACHE = OUT / "spain_geocode_cache.json"

spec = importlib.util.spec_from_file_location("p3", ROOT / "scripts/spain-phase3-recovery.py")
p3 = importlib.util.module_from_spec(spec)
sys.modules["p3"] = p3
spec.loader.exec_module(p3)

spec2 = importlib.util.spec_from_file_location("p3c", ROOT / "scripts/spain-phase3-consolidate.py")
p3c = importlib.util.module_from_spec(spec2)
sys.modules["p3c"] = p3c
spec2.loader.exec_module(p3c)


def main():
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    active0 = [r for r in rows if r.get("import_category") != "DUPLICATE"]
    baseline = {
        "unique_staged": len(active0),
        "READY_TO_IMPORT": sum(1 for r in active0 if r.get("import_category") == "READY_TO_IMPORT"),
        "NEEDS_COORDINATES": sum(1 for r in active0 if r.get("import_category") == "NEEDS_COORDINATES"),
        "NEEDS_REVIEW": sum(1 for r in active0 if r.get("import_category") == "NEEDS_REVIEW"),
        "COMING_SOON": sum(1 for r in active0 if r.get("import_category") == "COMING_SOON"),
        "CLOSED": sum(1 for r in active0 if r.get("import_category") == "CLOSED"),
        "DUPLICATE": sum(1 for r in rows if r.get("import_category") == "DUPLICATE"),
    }
    print("START", baseline, flush=True)
    ready_ids = {
        r["id"] for r in rows
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None
    }

    stats = {
        "followup_poi": 0,
        "followup_geocode": 0,
        "preserved_ready": baseline["READY_TO_IMPORT"],
    }

    # Expand Fitness Park POIs by city / club name fragment
    fp_un = [
        r for r in rows
        if r.get("brand") == "Fitness Park"
        and r.get("import_category") == "NEEDS_COORDINATES"
    ]
    print(f"FP unresolved {len(fp_un)} — expanding POIs…", flush=True)
    fp_pois = []
    if (RAW / "nominatim_fitnesspark_pois_p3.json").exists():
        fp_pois = json.loads((RAW / "nominatim_fitnesspark_pois_p3.json").read_text())
    budget = 100
    queries = set()
    for r in fp_un:
        city = (r.get("city") or "").strip()
        if city:
            queries.add(f"Fitness Park, {city}")
            queries.add(f"Fitness Park {city}")
        # club slug from URL
        url = r.get("source_url") or ""
        m = re.search(r"/club/([^/]+)/?", url)
        if m:
            slug = m.group(1).replace("-", " ")
            queries.add(f"Fitness Park {slug}")
    for q in sorted(queries):
        items = p3c.cache_get(cache, q)
        if items is None:
            if budget <= 0:
                break
            try:
                items = p3.nominatim(q, cache)
            except Exception:
                items = []
            budget -= 1
        for it in items or []:
            try:
                lat, lng = float(it["lat"]), float(it["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if p3.in_spain_bbox(lat, lng):
                fp_pois.append(it)
    # dedupe
    seen = set()
    fp2 = []
    for it in fp_pois:
        key = (it.get("osm_type"), it.get("osm_id"), it.get("lat"), it.get("lon"))
        if key in seen:
            continue
        seen.add(key)
        fp2.append(it)
    print(f"FP POIs {len(fp2)} (budget left {budget})", flush=True)
    stats["followup_poi"] += p3c.match_pois(rows, fp2, "Fitness Park")

    # Synergym: query by full club name for remaining
    syn_un = [
        r for r in rows
        if r.get("brand") == "Synergym"
        and r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
    ]
    print(f"Synergym unresolved {len(syn_un)} — name queries…", flush=True)
    syn_pois = []
    syn_path = RAW / "nominatim_synergym_pois_p3_expanded.json"
    if syn_path.exists():
        syn_pois = json.loads(syn_path.read_text())
    elif (RAW / "nominatim_synergym_pois_p3.json").exists():
        syn_pois = json.loads((RAW / "nominatim_synergym_pois_p3.json").read_text())
    budget = 120
    for r in syn_un:
        name = (r.get("name") or "").strip()
        city = (r.get("city") or "").strip()
        qs = []
        if name:
            qs.append(name)
        if city:
            qs.append(f"Synergym {city}")
        # street + city as amenity search
        addr = (r.get("address") or "").strip()
        if addr and city:
            qs.append(f"Synergym, {addr}, {city}")
        for q in qs:
            items = p3c.cache_get(cache, q)
            if items is None:
                if budget <= 0:
                    break
                try:
                    items = p3.nominatim(q, cache)
                except Exception:
                    items = []
                budget -= 1
            for it in items or []:
                try:
                    lat, lng = float(it["lat"]), float(it["lon"])
                except (TypeError, ValueError, KeyError):
                    continue
                if p3.in_spain_bbox(lat, lng):
                    syn_pois.append(it)
        if budget <= 0:
            break
    seen = set()
    syn2 = []
    for it in syn_pois:
        key = (it.get("osm_type"), it.get("osm_id"), it.get("lat"), it.get("lon"))
        if key in seen:
            continue
        seen.add(key)
        syn2.append(it)
    print(f"Syn POIs {len(syn2)} (budget left {budget})", flush=True)
    stats["followup_poi"] += p3c.match_pois(rows, syn2, "Synergym")
    print(f"POI matched this followup={stats['followup_poi']}", flush=True)

    # Geocode remaining with cache-first + small live
    live = 150
    unresolved = [
        r for r in rows
        if r.get("brand") in {"Synergym", "Fitness Park", "Dreamfit", "O2 Centro Wellness", "Supera"}
        and r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        and r.get("id") not in ready_ids
    ]
    print(f"Geocoding {len(unresolved)}…", flush=True)
    for i, r in enumerate(unresolved):
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        ok, live = p3c.geocode_cache_first(r, cache, live)
        if ok:
            stats["followup_geocode"] += 1
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(unresolved)} geo={stats['followup_geocode']} live={live}", flush=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    kept, collapsed, rebrands = p3.soft_dedupe(rows)
    by_id = {r["id"]: r for r in kept}
    # restore READY
    orig = json.loads(STAGING.read_text(encoding="utf-8"))
    # Use pre-followup ready from ready_ids snapshot of current file before mutations —
    # restore from ready_ids coords stored at start via original staging load
    # (rows was mutated in place from same objects as kept after soft_dedupe)
    for r in orig:
        if r.get("id") in ready_ids and r.get("lat") is not None:
            cur = by_id.get(r["id"])
            if cur and (cur.get("lat") is None or cur.get("import_category") != "READY_TO_IMPORT"):
                cur["lat"] = r["lat"]
                cur["lng"] = r["lng"]
                cur["coord_source"] = r.get("coord_source")
                cur["import_category"] = "READY_TO_IMPORT"

    for r in kept:
        p3.classify_row(r)
        if r.get("brand") == "Enjoy!" and r.get("coord_source") == "official_brand_mymaps":
            if r.get("lat") is not None and r.get("address") and r.get("city"):
                if p3.in_spain_bbox(r["lat"], r["lng"]):
                    r["import_category"] = "READY_TO_IMPORT"
        if r.get("import_category") == "READY_TO_IMPORT" and not p3.in_spain_bbox(r.get("lat"), r.get("lng")):
            r["lat"] = r["lng"] = None
            r["import_category"] = "NEEDS_COORDINATES"

    STAGING.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    p3.write_geocode_review(kept)
    p3.write_excel(kept)

    # Adjust phase4 heuristic: only if material gaps remain that are realistically recoverable
    # Update write_reports via call then patch recommendation
    report = p3.write_reports(kept, collapsed, rebrands, stats, baseline)

    # Recompute sensible Phase 4 decision
    active = [r for r in kept if r.get("import_category") != "DUPLICATE"]
    syn = p3.brand_stats(active, "Synergym")
    fp = p3.brand_stats(active, "Fitness Park")
    enjoy = p3.brand_stats(active, "Enjoy!")
    # Material if large OPEN estate still missing coords AND recoverable via official pages
    material = (
        (syn["unresolved"] >= 50 and syn["ready"] < 0.75 * syn["discovered"])
        or (fp["unresolved"] >= 40 and fp["ready"] < 0.75 * fp["discovered"])
        or enjoy["discovered"] == 0
    )
    # If Enjoy done and Syn/FP are NEAR-COMPLETE (>=70% ready of discovered), no Phase 4
    if enjoy["ready"] >= 15 and syn["ready"] >= 0.7 * max(syn["discovered"], 1) and fp["ready"] >= 0.7 * max(fp["discovered"], 1):
        material = False
    # Remaining low-confidence rows alone don't justify Phase 4
    if syn["unresolved"] + fp["unresolved"] <= 30:
        material = False

    report["phase4_worthwhile"] = material
    report["recommendation"] = (
        "PHASE 4 REQUIRED BEFORE MERGE" if material else "READY FOR SPAIN MERGE"
    )
    report["status"] = (
        "PHASE 3 DONE — PHASE 4 STILL NEEDED BEFORE MERGE."
        if material else "PHASE 3 RECOVERY COMPLETE — DO NOT MERGE."
    )
    report["phase3_stats"] = {**report.get("phase3_stats", {}), **stats}
    # rewrite json + md footer
    (OUT / "SPAIN_PHASE3_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    md = (OUT / "SPAIN_PHASE3_READINESS_REPORT.md").read_text(encoding="utf-8")
    md = re.sub(
        r"Phase 4 worthwhile\? \*\*(YES|NO)\*\*",
        f"Phase 4 worthwhile? **{'YES' if material else 'NO'}**",
        md,
    )
    md = re.sub(
        r"## RECOMMENDATION: .+",
        f"## RECOMMENDATION: {report['recommendation']}",
        md,
    )
    (OUT / "SPAIN_PHASE3_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print("DONE", report["overall"], flush=True)
    print("Syn", syn, "FP", fp, "Enjoy", enjoy, flush=True)
    print("RECOMMENDATION", report["recommendation"], flush=True)


if __name__ == "__main__":
    main()
