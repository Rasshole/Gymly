#!/usr/bin/env python3
"""Force-clean remaining junk addresses and geocode only those rows."""
from __future__ import annotations

import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
STAGING = OUT / "uk_centers_staging.json"
CACHE = OUT / "uk_geocode_cache.json"


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


en = load_mod("uk_phase2_enrich", ROOT / "scripts/uk-phase2-enrich.py")
fin = load_mod("uk_phase2_finalize", ROOT / "scripts/uk-phase2-finalize.py")
c1 = load_mod("uk_phase1_consolidate", ROOT / "scripts/uk-phase1-consolidate.py")


def log(*a):
    print(*a, flush=True)


def strip_pc(addr, pc):
    if not addr:
        return ""
    addr = re.sub(r"<[^>]+>", " ", addr)
    addr = re.sub(r"\s+", " ", addr).strip(" ,")
    if pc:
        addr = re.sub(re.escape(pc), "", addr, flags=re.I).strip(" ,")
    if len(addr) > 180 or '"@type"' in addr or "img:is" in addr or "Skip to content" in addr:
        return ""
    if addr.lower().startswith("health club and luxury gym"):
        return ""
    return addr


PATCHES = {
    ("Buzz Gym", "RG1 3BY"): ("100 Kings Road", "Reading"),
    ("Buzz Gym", "SL1 1PG"): ("Herschel Street", "Slough"),
    ("Buzz Gym", "SN1 1LF"): ("Brunel Plaza", "Swindon"),
    ("Buzz Gym", "OX1 1TR"): ("Westgate Shopping Centre", "Oxford"),
    ("Buzz Gym", "HA1 1AT"): ("St Anns Shopping Centre", "Harrow"),
    ("Buzz Gym", "EC4R 0AN"): ("Cannon Green, 1 Suffolk Lane", "London"),
    ("Buzz Gym", "HA9 0NR"): ("Olympic Way, Wembley Park", "Wembley"),
    ("Fitness First", "EC2M 7PY"): ("Platform 17-18, Liverpool Street Station", "London"),
    ("Gymbox", "SE1 6TJ"): ("Unit 7, 38 New Kent Road", "London"),
    ("Gymbox", "N4 3HN"): ("Unit 4, City North Place", "London"),
    ("Third Space", "SW11 8BH"): ("Ground Floor, Prospect Way, Battersea Power Station", "London"),
    ("Third Space", "E14 5ER"): ("16-19 Canada Square", "London"),
    ("Third Space", "SW3 6AP"): ("19 Mallord Street", "London"),
    ("Third Space", "EC3R 7AT"): ("40 Mark Lane", "London"),
    ("Third Space", "SW11 1LN"): ("Lavender Hill", "London"),
    ("Third Space", "N1 1UL"): ("15 Esther Anne Place", "London"),
    ("Third Space", "W1U 2HU"): ("Bulstrode Place", "London"),
    ("Third Space", "W1J 5FA"): ("22 Clarges Street", "London"),
    ("Third Space", "EC2M 2AQ"): ("16 South Place", "London"),
    ("Third Space", "TW9 1EU"): ("4 Golden Court", "Richmond"),
    ("Third Space", "SE1 2AP"): ("2b More London Riverside", "London"),
    ("Third Space", "SW19 8YE"): ("4 Queen's Road", "London"),
    ("Third Space", "E14 5GZ"): ("14 Charter Street", "London"),
    ("Third Space", "W1F 9US"): ("67 Brewer Street", "London"),
    ("Third Space", "W2 4YN"): ("The Whiteley, Queensway", "London"),
}


def main():
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    patched = []
    for r in rows:
        key = (r.get("brand"), r.get("postal_code"))
        if key in PATCHES:
            addr, city = PATCHES[key]
            r["address"] = addr
            r["city"] = city
            r["notes"] = ((r.get("notes") or "") + "; phase2_address_overwrite").strip("; ")
            if r.get("verification_status") not in {"COMING_SOON", "CLOSED"}:
                r["verification_status"] = "VERIFIED_CURRENT"
            patched.append(r)
        elif r.get("brand") == "The Gym Group" and r.get("import_category") == "NEEDS_COORDINATES" and r.get("postal_code"):
            cleaned = strip_pc(r.get("address") or "", r.get("postal_code"))
            if cleaned:
                r["address"] = cleaned
                patched.append(r)
        elif r.get("brand") == "Buzz Gym" and "Plymouth" in (r.get("name") or ""):
            r["verification_status"] = "COMING_SOON"
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["notes"] = ((r.get("notes") or "") + "; opening_winter_2026").strip("; ")
        elif r.get("brand") == "The Gym Group" and not (r.get("name") or "").replace("The Gym Group", "").strip() and not r.get("postal_code"):
            r["_drop"] = True

    rows = [r for r in rows if not r.get("_drop")]
    if not any(r.get("brand") == "Gymbox" and "Holborn" in (r.get("name") or "") for r in rows):
        hol = en.row(
            "Gymbox",
            "Gymbox Holborn",
            "100 High Holborn",
            "WC1V 6RD",
            "London",
            "https://gymbox.com/gyms/holborn/",
            notes="official_club_page; phase2",
        )
        rows.append(hol)
        patched.append(hol)

    rows = [en.classify(r) for r in rows]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = [
        r
        for r in patched
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
        and r.get("verification_status") != "COMING_SOON"
        and r.get("lat") is None
    ]
    # unique by id
    seen = set()
    uniq = []
    for r in todo:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        uniq.append(r)
    log("patch geocode todo", len(uniq))
    for i, r in enumerate(uniq):
        log(f"[{i+1}/{len(uniq)}] {r.get('name')}")
        en.geocode_row(r, cache)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    rows = [en.classify(r) for r in rows]
    rows, amb = fin.dedupe_staging(rows)
    rows = [en.classify(r) for r in rows]
    live_report, centers = c1.vs_live(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    c1.write_geocode_review(rows)
    c1.write_excel(rows)
    fin.write_report(rows, amb, live_report, centers, len(uniq))
    log("READY", sum(1 for r in rows if r.get("import_category") == "READY_TO_IMPORT"), "n", len(rows))
    for brand, n in Counter(r.get("brand") for r in rows).most_common():
        sub = [r for r in rows if r.get("brand") == brand]
        ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        log(f"  {brand:22} n={n:4} READY={ready:4}")


if __name__ == "__main__":
    main()
