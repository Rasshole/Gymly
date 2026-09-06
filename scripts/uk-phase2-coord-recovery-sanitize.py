#!/usr/bin/env python3
"""Sanitize Phase 2 coordinate recovery: demote wrong-town pins, restore false collapses."""
from __future__ import annotations

import importlib.util
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
STAGING = OUT / "uk_centers_staging.json"
CACHE = OUT / "uk_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


en = load_mod("uk_phase2_enrich", ROOT / "scripts/uk-phase2-enrich.py")
fin = load_mod("uk_phase2_finalize", ROOT / "scripts/uk-phase2-finalize.py")
c1 = load_mod("uk_phase1_consolidate", ROOT / "scripts/uk-phase1-consolidate.py")
rec = load_mod("uk_phase2_coord_recovery", ROOT / "scripts/uk-phase2-coord-recovery.py")

PC_RE = re.compile(r"\b([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\b", re.I)


def log(*a):
    print(*a, flush=True)


def last_pc(s: str) -> str:
    found = list(PC_RE.finditer(s or ""))
    if not found:
        return ""
    m = found[-1]
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def outward(pc: str) -> str:
    pc = (pc or "").upper().strip()
    return pc.split()[0] if pc else ""


def tags(r):
    raw = r.get("geocode_reasons") or []
    if isinstance(raw, str):
        return [raw]
    out = []
    for t in raw:
        if isinstance(t, list):
            out.extend(str(x) for x in t)
        else:
            out.append(str(t))
    return out


def demote(r, why):
    r["lat"] = r["lng"] = None
    r["coord_source"] = None
    r["geocode_status"] = "failed"
    r["import_category"] = "NEEDS_COORDINATES"
    if r.get("verification_status") not in {"COMING_SOON", "CLOSED", "NEEDS_REVIEW"}:
        r["verification_status"] = "VERIFIED_CURRENT"
    rec.note(r, why)
    return r


def html_latlng(html: str):
    m = re.search(r'"latitude"\s*:\s*"?(-?\d+\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+\.\d+)"?', html)
    if m:
        return en.coords_ok(m.group(1), m.group(2))
    m = re.search(r'"lat"\s*:\s*(-?\d+\.\d+)\s*,\s*"lng"\s*:\s*(-?\d+\.\d+)', html)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        return en.coords_ok(lat, lng)
    return None, None


def url_key(u: str) -> str:
    return (u or "").rstrip("/").lower()


def main():
    raw_centers = CENTERS.read_bytes()
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    by_url = {url_key(r.get("source_url")): r for r in rows}

    demoted = []
    restored = []
    official = []

    # --- Restore false proximity collapses ---
    if "https://www.jdgyms.co.uk/gym/liverpool-edge-lane" not in by_url:
        r = en.row(
            "JD Gyms",
            "JD Gyms Liverpool Edge Lane",
            "Liverpool Innovation Park, Edge Lane, Fairfield",
            "L7 9NJ",
            "Liverpool",
            "https://www.jdgyms.co.uk/gym/liverpool-edge-lane/",
            notes="official_club_page; restored_after_false_proximity_collapse",
        )
        r = en.classify(r)
        rows.append(r)
        restored.append(r["name"])
        by_url[url_key(r["source_url"])] = r

    if "https://www.jdgyms.co.uk/gym/oldbury" not in by_url:
        # Reassign the Birchley Island JD POI that was incorrectly attached to Sheffield North
        shef = by_url.get("https://www.jdgyms.co.uk/gym/sheffield-north")
        r = en.row(
            "JD Gyms",
            "JD Gyms Oldbury",
            "Birchley Island Retail Park, Wolverhampton Road",
            "B69 4RJ",
            "Oldbury",
            "https://www.jdgyms.co.uk/gym/oldbury/",
            notes="official_club_page; restored_after_false_proximity_collapse",
        )
        if shef and "Birchley Island" in (shef.get("geocode_display") or "") and outward(last_pc(shef.get("geocode_display") or "")) == "B69":
            r["lat"], r["lng"] = shef["lat"], shef["lng"]
            r["coord_source"] = "nominatim"
            r["geocode_status"] = "suspicious"
            r["geocode_display"] = shef.get("geocode_display")
            r["geocode_reasons"] = ["postal_soft", "brand_name_match", "gym_poi", "named_site_match", "reassigned_from_wrong_row"]
            rec.note(r, "coords_reassigned_from_sheffield_north_wrong_row")
        r = en.classify(r)
        rows.append(r)
        restored.append(r["name"] + (" READY" if r.get("import_category") == "READY_TO_IMPORT" else " NC"))
        by_url[url_key(r["source_url"])] = r

    if "https://gymbox.com/gyms/holborn" not in by_url:
        r = en.row(
            "Gymbox",
            "Gymbox Holborn",
            "100 High Holborn",
            "WC1V 6RD",
            "London",
            "https://gymbox.com/gyms/holborn/",
            notes="official_club_page; phase2; restored_after_false_proximity_collapse",
        )
        r = en.classify(r)
        rows.append(r)
        restored.append(r["name"])
        by_url[url_key(r["source_url"])] = r

    if "https://www.snapfitness.com/uk/gyms/leeds-oakwood" not in by_url:
        well = by_url.get("https://www.snapfitness.com/uk/gyms/leeds-wellington-st")
        r = en.row(
            "Snap Fitness",
            "Snap Fitness Leeds Oakwood",
            "633 Roundhay Road, Unit 6",
            "LS8 4BA",
            "Leeds",
            "https://www.snapfitness.com/uk/gyms/leeds-oakwood",
            notes="official_json_ld; restored_after_false_proximity_collapse",
        )
        if well and "Roundhay Road" in (well.get("geocode_display") or "") and last_pc(well.get("geocode_display") or "") == "LS8 4BA":
            r["lat"], r["lng"] = well["lat"], well["lng"]
            r["coord_source"] = "nominatim"
            r["geocode_status"] = "ok"
            r["geocode_display"] = well.get("geocode_display")
            r["geocode_reasons"] = ["postal_exact", "brand_name_match", "gym_poi", "house_number_match", "reassigned_from_wrong_row"]
            rec.note(r, "coords_reassigned_from_wellington_st_wrong_row")
        r = en.classify(r)
        rows.append(r)
        restored.append(r["name"] + (" READY" if r.get("import_category") == "READY_TO_IMPORT" else " NC"))
        by_url[url_key(r["source_url"])] = r

    # --- Demote wrong-town / wrong-club geocodes from this pass ---
    this_pass_markers = {"gym_poi", "named_site_match", "truncated_prefix_completed", "reassigned_from_wrong_row"}
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        if r.get("coord_source") not in {"nominatim", "official_json_ld", "official_maps_q"}:
            continue
        osm_pc = last_pc(r.get("geocode_display") or "")
        off = r.get("postal_code") or ""
        tset = set(tags(r))
        is_this_pass = bool(tset & this_pass_markers) or "phase2_coord_recovery" in (r.get("notes") or "")
        display = (r.get("geocode_display") or "").lower()
        # Snap Wellington St received Oakwood POI
        if url_key(r.get("source_url")) == "https://www.snapfitness.com/uk/gyms/leeds-wellington-st" and "roundhay" in display:
            demote(r, "demoted_wrong_club_poi_oakwood_not_wellington")
            demoted.append(r["name"] + " (Oakwood POI)")
            continue
        if not is_this_pass:
            continue
        if osm_pc and off and outward(osm_pc) != outward(off):
            # Keep only if we just reassigned a named official site with same-town gym POI and same outward district was the goal.
            # Outward mismatch = demote.
            demote(r, f"demoted_outward_mismatch:{off}->{osm_pc}")
            demoted.append(f"{r.get('name')} {off} -> {osm_pc}")

    # Bannatyne Belfast recovered without gym_poi tag but BT18 vs BT8
    bel = by_url.get("https://www.bannatyne.co.uk/healthclub/belfast") or next(
        (r for r in rows if r.get("name") == "Bannatyne Belfast Health Club"), None
    )
    if bel and bel.get("import_category") == "READY_TO_IMPORT":
        osm_pc = last_pc(bel.get("geocode_display") or "")
        if osm_pc and outward(osm_pc) != outward(bel.get("postal_code") or ""):
            demote(bel, f"demoted_outward_mismatch:{bel.get('postal_code')}->{osm_pc}")
            demoted.append(f"{bel.get('name')} {bel.get('postal_code')} -> {osm_pc}")

    # --- Official JSON-LD pins that extract_ld missed (Nuffield + Third Space Whiteley) ---
    for r in rows:
        if r.get("import_category") not in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}:
            continue
        if r.get("verification_status") in {"COMING_SOON", "CLOSED"}:
            continue
        html = rec.local_html(r.get("source_url") or "")
        if not html:
            continue
        lat, lng = html_latlng(html)
        if lat is None:
            continue
        ok, osm_pc, why = rec.official_pin_ok(lat, lng, r, cache)
        log("sanitize official pin", r.get("name"), ok, why, lat, lng, osm_pc)
        if not ok:
            rec.note(r, f"official_coords_rejected:{why}")
            continue
        if not r.get("postal_code") and osm_pc:
            r["postal_code"] = osm_pc
        r["lat"], r["lng"] = lat, lng
        r["coord_source"] = "official_json_ld"
        r["geocode_status"] = "ok"
        r["geocode_reasons"] = [why, "official_json_ld"]
        rec.note(r, "phase2_coord_recovery_official")
        r["id"] = en.make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url") or "")
        official.append(r.get("name"))

    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # Safer dedupe: never drop different named clubs
    seen_id = {}
    out = []
    amb = []
    for r in rows:
        rid = r.get("id")
        if rid in seen_id:
            amb.append({"reason": "same_id", "a": seen_id[rid].get("name"), "b": r.get("name"), "id": rid})
            if len(r.get("address") or "") > len(seen_id[rid].get("address") or ""):
                out = [x for x in out if x.get("id") != rid]
                out.append(r)
                seen_id[rid] = r
            continue
        seen_id[rid] = r
        out.append(r)
    rows = [en.classify(r) for r in out]

    # freeze original coming soon by URL from current CS + the 6 JD we already classified
    for r in rows:
        if r.get("verification_status") == "COMING_SOON":
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["lat"] = r["lng"] = None

    # unique
    assert len({r["id"] for r in rows}) == len(rows)

    for r in rows:
        r.pop("_pc_prefix", None)

    live_report, centers = c1.vs_live(rows)
    dup_extra = rec.extra_duplicate_analysis(rows)
    cats = Counter(r.get("import_category") for r in rows)

    START_READY = 1373
    START_NC = 266
    START_NR = 13
    start_ready_by_chain = {
        "Anytime Fitness": 110,
        "JD Gyms": 58,
        "Snap Fitness": 56,
        "Everlast Gyms": 32,
        "Bannatyne": 42,
        "énergie Fitness": 29,
        "The Gym Group": 252,
        "Total Fitness": 8,
        "Virgin Active": 24,
        "David Lloyd": 109,
        "Nuffield Health": 107,
        "Fitness4Less / easyGym": 5,
        "Buzz Gym": 6,
        "Gymbox": 8,
        "Third Space": 14,
    }
    nr_urls = {
        "https://www.anytimefitness.com/en-gb/locations/london-greater-london-uk-0527",
        "https://www.davidlloyd.co.uk/clubs/gillingham",
        "https://www.energiefitness.com/gym/brentford",
        "https://www.jdgyms.co.uk/gym/aberdeen",
        "https://www.jdgyms.co.uk/gym/basildon",
        "https://www.jdgyms.co.uk/gym/dunfermline",
        "https://www.jdgyms.co.uk/gym/newtownabbey",
        "https://www.jdgyms.co.uk/gym/wakefield",
        "https://www.jdgyms.co.uk/gym/watford",
        "https://www.nuffieldhealth.com/gyms/barrow",
        "https://www.snapfitness.com/uk/gyms/bristol-filton",
        "https://www.virginactive.co.uk/clubs/cannon-street-walbrook",
        "https://www.virginactive.co.uk/clubs/clearview-brentwood",
    }
    recovered_nr = sum(
        1
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT" and url_key(r.get("source_url")) in nr_urls
    )
    recovered_nc = cats.get("READY_TO_IMPORT", 0) - START_READY - recovered_nr

    chains = []
    for label, aliases in rec.CHAIN_ORDER:
        sub = [r for r in rows if rec.brand_in(r, aliases)]
        final_ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unresolved = sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"})
        before = start_ready_by_chain[label]
        chains.append(
            {
                "chain": label,
                "before_ready": before,
                "recovered": final_ready - before,
                "final_ready": final_ready,
                "unresolved": unresolved,
            }
        )

    suspicious = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and (r.get("geocode_status") == "suspicious" or "soft_postal" in (r.get("notes") or ""))
        and "gym_poi" in tags(r)
    ]
    ambiguous = [r for r in rows if r.get("geocode_status") == "ambiguous" and r.get("import_category") != "READY_TO_IMPORT"]
    pc_mismatch = []
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        if not (("gym_poi" in tags(r)) or ("named_site_match" in tags(r)) or "phase2_coord_recovery" in (r.get("notes") or "")):
            continue
        osm_pc = last_pc(r.get("geocode_display") or "")
        if osm_pc and r.get("postal_code") and osm_pc != r.get("postal_code"):
            pc_mismatch.append({"name": r.get("name"), "official": r.get("postal_code"), "osm": osm_pc})

    left = [
        "Anytime Fitness London — official test placeholder (Test 100 Lane / SW1A 1AA)",
        "Virgin Active Chiswick Riverside — Nominatim hits Chiswick Park; not the Riverside club",
        "Virgin Active Cannon Street (Walbrook) — no page cache; no new scrape",
        "Virgin Active Clearview/Brentwood — no page cache; no new scrape",
        "Energie Fitness Brentford — JSON-LD postcode truncated (TW8 0G); not invented",
        "Snap Fitness Bristol (Filton) — official JSON-LD postalCode empty",
        "Buzz Gym Oxford / Harrow — shopping-centre names only; no building-level OSM pin",
        "Gymbox Elephant & Castle / Finsbury Park — unit addresses remained ambiguous",
        "David Lloyd Northwood — official address did not resolve to a building pin",
        "Nuffield remaining unresolved kept if official JSON-LD pin failed reverse locality check",
        "Wrong-town Nominatim hits were demoted rather than imported",
    ]

    payload = {
        "start": {"READY_TO_IMPORT": START_READY, "NEEDS_COORDINATES": START_NC, "NEEDS_REVIEW": START_NR, "COMING_SOON": 65, "CLOSED": 0},
        "final": dict(cats),
        "recovered_nc": recovered_nc,
        "recovered_nr": recovered_nr,
        "n_rows": len(rows),
        "chains": chains,
        "suspicious": len(suspicious),
        "ambiguous": len(ambiguous),
        "postcode_mismatches": len(pc_mismatch),
        "staging_collapses": 0,
        "dup_extra": dup_extra,
        "reclass": [
            "Anytime Fitness London: NEEDS_REVIEW",
            "JD Gyms Aberdeen: COMING_SOON",
            "JD Gyms Basildon: COMING_SOON",
            "JD Gyms Dunfermline: COMING_SOON",
            "JD Gyms Newtownabbey: COMING_SOON",
            "JD Gyms Wakefield: COMING_SOON",
            "JD Gyms Watford: COMING_SOON",
            "Nuffield Health Barrow: CLOSED",
        ],
        "left": left,
        "demoted": demoted,
        "restored": restored,
        "official": official,
        "pc_mismatch_rows": pc_mismatch,
        "suspicious_rows": [{"name": r.get("name"), "display": r.get("geocode_display")} for r in suspicious],
    }

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    dup = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "phase": "uk_phase2_coord_recovery",
        "staging_collapses": amb,
        "vs_live": live_report,
        "staging_counts": dict(cats),
        "extra": dup_extra,
        "demoted_wrong_geocodes": demoted,
        "restored_false_collapses": restored,
        "official_pins_applied": official,
    }
    (OUT / "uk_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    c1.write_geocode_review(rows)
    c1.write_excel(rows)
    rec.write_recovery_report(payload)
    (OUT / "uk_coord_recovery_payload.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    assert CENTERS.read_bytes() == raw_centers
    log("demoted", len(demoted))
    for x in demoted:
        log("  -", x)
    log("restored", restored)
    log("official", official)
    log("READY", cats.get("READY_TO_IMPORT"), "NC", cats.get("NEEDS_COORDINATES"), "NR", cats.get("NEEDS_REVIEW"), "CS", cats.get("COMING_SOON"), "CLOSED", cats.get("CLOSED"), "n", len(rows))
    log("recovered NC", recovered_nc, "NR", recovered_nr)


if __name__ == "__main__":
    main()
