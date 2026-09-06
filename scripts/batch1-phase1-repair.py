#!/usr/bin/env python3
"""One-shot Phase 1 repair for Czechia FF closed flags + Greece geocodes."""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    GREECE_POSTAL_RE,
    format_gr_postal,
    in_greece,
    nominatim_geocode,
    write_json,
)

ROOT = Path(__file__).resolve().parents[1]


def repair_czechia() -> None:
    path = ROOT / "data/czechia/czechia_phase1_candidates.json"
    rows = __import__("json").loads(path.read_text())
    fixed = 0
    for r in rows:
        if r.get("brand") == "Form Factory" and r.get("is_closed"):
            r["is_closed"] = False
            r["is_active"] = True
            r["import_category"] = "NEEDS_REVIEW"
            fixed += 1
    write_json(path, rows)
    print(f"FF unclosed: {fixed}")


def repair_greece() -> None:
    path = ROOT / "data/greece/greece_phase1_candidates.json"
    rows = __import__("json").loads(path.read_text())
    cache: dict = {}
    geocoded = 0
    limit = 130

    for r in rows:
        if r.get("lat") is not None:
            continue
        addr = (r.get("address") or "").strip()
        city = (r.get("city") or "").strip()
        postal = (r.get("postal_code") or "").strip()
        addr_clean = re.sub(r"\s+\d{5}\s*$", "", addr)
        addr_clean = re.sub(r",\s*$", "", addr_clean)
        name = (r.get("name") or "").replace("Alterlife ", "").strip()
        queries = []
        if addr_clean and postal:
            queries.append(f"{addr_clean}, {postal}, Greece")
        if addr_clean and city:
            queries.append(f"{addr_clean}, {city}, Greece")
        if name and city:
            queries.append(f"Alterlife {name}, {city}, Greece")
        if name:
            queries.append(f"Alterlife {name}, Greece")

        for q in queries:
            if geocoded >= limit:
                break
            hit = nominatim_geocode(q, "gr", cache, sleep=1.05)
            geocoded += 1
            if not hit or hit.get("lat") is None:
                continue
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if not in_greece(lat, lng):
                continue
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = (
                "NAMED_GYM_POI" if q.startswith("Alterlife") and addr_clean not in q else "STRICT_ADDRESS_GEOCODE"
            )
            if not GREECE_POSTAL_RE.match(str(r.get("postal_code") or "")):
                npc = format_gr_postal(str(hit.get("postcode") or ""))
                if GREECE_POSTAL_RE.match(npc):
                    r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; geocode_ok"
            print("+", r["name"], lat, lng, r["coord_source"])
            break
        if geocoded >= limit:
            print("geocode limit reached")
            break

    for r in rows:
        if r.get("brand") != "Holmes Place":
            continue
        if GREECE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        q = f"{r['name']}, {r.get('city')}, Greece"
        hit = nominatim_geocode(q, "gr", cache, sleep=1.05)
        geocoded += 1
        if hit and hit.get("postcode"):
            npc = format_gr_postal(str(hit["postcode"]))
            if GREECE_POSTAL_RE.match(npc):
                r["postal_code"] = npc
                r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
                print("Holmes postal", r["name"], npc)

    write_json(path, rows)
    write_json(ROOT / "data/greece/greece_geocode_cache.json", cache)
    print(
        "Greece with coords",
        sum(1 for r in rows if r.get("lat") is not None),
        "of",
        len(rows),
        "calls",
        geocoded,
    )


if __name__ == "__main__":
    repair_czechia()
    repair_greece()
