#!/usr/bin/env python3
"""UK Phase 2 finalize: ingest remaining official scrapes, geocode, report. No production merge."""
from __future__ import annotations

import csv
import importlib.util
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
SCRAPES = OUT / "scrapes"
STAGING = OUT / "uk_centers_staging.json"
CACHE = OUT / "uk_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
RAW = OUT / "raw"


def load_mod(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


en = load_mod("uk_phase2_enrich", ROOT / "scripts/uk-phase2-enrich.py")
c1 = load_mod("uk_phase1_consolidate", ROOT / "scripts/uk-phase1-consolidate.py")


def log(*a):
    print(*a, flush=True)


def url_key(u: str) -> str:
    return (u or "").rstrip("/").lower()


def ingest_scrape(rows: list[dict], path: Path, brand: str | None = None, extra_fields: dict | None = None) -> int:
    if not path.exists():
        log("missing scrape", path.name)
        return 0
    extra = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(extra, dict):
        extra = extra.get("rows") or extra.get("centers") or []
    by_url = {}
    by_name = {}
    for r in rows:
        if brand and r.get("brand") != brand:
            continue
        by_url[url_key(r.get("source_url") or "")] = r
        by_name[(r.get("brand"), (r.get("name") or r.get("center_name") or "").strip().lower())] = r
    n = 0
    for a in extra:
        b = a.get("brand") or brand
        if brand and b != brand:
            continue
        if a.get("country") and "ireland" in str(a["country"]).lower() and "northern" not in str(a["country"]).lower():
            continue
        if en.is_crown(a.get("postal_code") or ""):
            continue
        blob = " ".join(str(a.get(k) or "") for k in ("source_url", "center_name", "city", "country"))
        if re.search(r"minnesota|united states|/ie/|-ie-|jersey|st-helier|st-sampson|guernsey", blob, re.I):
            continue
        url = a.get("source_url") or ""
        name = (a.get("center_name") or a.get("name") or "").strip()
        target = by_url.get(url_key(url)) or by_name.get((b, name.lower()))
        status = a.get("verification_status") or "VERIFIED_CURRENT"
        if target:
            en.apply_fields(
                target,
                address=a.get("address"),
                postal_code=a.get("postal_code"),
                city=a.get("city"),
                lat=a.get("lat"),
                lng=a.get("lng"),
            )
            if extra_fields:
                for k, v in extra_fields.items():
                    if not target.get(k):
                        target[k] = v
            if a.get("legacy_brand") and not target.get("legacy_brand"):
                target["legacy_brand"] = a["legacy_brand"]
            if a.get("lat") is not None:
                target["coord_source"] = a.get("coord_source") or "official_page"
            if a.get("address") and a.get("postal_code") and status != "COMING_SOON":
                target["verification_status"] = status
            elif status in {"COMING_SOON", "CLOSED"}:
                target["verification_status"] = status
            if a.get("notes"):
                target["notes"] = ((target.get("notes") or "") + "; " + a["notes"]).strip("; ")
            n += 1
        else:
            rows.append(
                en.row(
                    b,
                    name or b,
                    a.get("address") or "",
                    a.get("postal_code") or "",
                    a.get("city") or "",
                    url,
                    a.get("lat"),
                    a.get("lng"),
                    notes=a.get("notes") or "phase2_scrape",
                    verification_status=status,
                    legacy_brand=a.get("legacy_brand") or (extra_fields or {}).get("legacy_brand") or "",
                    coord_source=a.get("coord_source") if a.get("lat") is not None else None,
                )
            )
            n += 1
    log("ingested", path.name, n)
    return n


def rematch_tgg_map(rows: list[dict]) -> int:
    raw = json.loads((RAW / "tgg_finder_next.json").read_text(encoding="utf-8"))
    mapped = raw.get("gymMapData") or []
    by_slug = {}
    by_name = {}
    for item in mapped:
        gym = item.get("gym") or {}
        path = (gym.get("gymPageURL") or "").rstrip("/")
        slug = path.split("/")[-1]
        if not slug or slug in {"find-a-gym", "gyms"}:
            continue
        pos = item.get("position") or {}
        parsed = en.parse_uk_blob(gym.get("gymAddress") or "")
        info = {
            "name": gym.get("gymName"),
            "address": parsed["address"] or gym.get("gymAddress"),
            "postal_code": parsed["postal_code"],
            "city": parsed["city"] or gym.get("gymName"),
            "lat": pos.get("lat"),
            "lng": pos.get("lng"),
            "page": "https://www.thegymgroup.com" + path,
        }
        by_slug[slug] = info
        by_name[(gym.get("gymName") or "").strip().lower()] = info
    filled = 0
    for r in rows:
        if r.get("brand") != "The Gym Group":
            continue
        slug = url_key(r.get("source_url") or "").split("/")[-1]
        name = (r.get("name") or "").replace("the gym group", "").strip().lower()
        info = by_slug.get(slug) or by_name.get(name)
        if not info:
            continue
        en.apply_fields(
            r,
            address=info["address"],
            postal_code=info["postal_code"],
            city=info["city"],
        )
        lat, lng = en.coords_ok(info["lat"], info["lng"])
        if lat is not None and r.get("lat") is None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = "official_locator"
            r["notes"] = ((r.get("notes") or "") + "; phase2_gymMapData_slug").strip("; ")
            if r.get("address") and r.get("postal_code"):
                r["verification_status"] = "VERIFIED_CURRENT"
            filled += 1
    # drop bogus finder homepage row
    before = len(rows)
    rows[:] = [
        r
        for r in rows
        if not (
            r.get("brand") == "The Gym Group"
            and url_key(r.get("source_url") or "") in {
                "https://www.thegymgroup.com/find-a-gym",
                "https://www.thegymgroup.com",
            }
        )
    ]
    log("TGG slug rematch filled", filled, "dropped homepage", before - len(rows))
    return filled


def drop_junk(rows: list[dict]) -> None:
    def keep(r):
        brand = r.get("brand")
        url = url_key(r.get("source_url") or "")
        name = (r.get("name") or "").lower()
        if brand == "easyGym" and "gym-rules" in url:
            return False
        if brand == "Total Fitness" and "women" in name:
            return False  # same physical club as Wilmslow/Whitefield
        if "reformer" in name and brand == "Energie Fitness":
            return False
        blob = " ".join(str(r.get(k) or "") for k in ("source_url", "name", "city", "country"))
        if re.search(r"minnesota|united states|/ie/|-ie-|st-helier|st-sampson", blob, re.I):
            return False
        if en.is_crown(r.get("postal_code") or ""):
            return False
        return True

    before = len(rows)
    rows[:] = [r for r in rows if keep(r)]
    log("dropped junk", before - len(rows))


def dedupe_staging(rows: list[dict]) -> list[dict]:
    seen_id = {}
    out = []
    amb = []
    for r in rows:
        rid = r.get("id")
        if rid in seen_id:
            amb.append({"reason": "same_id", "a": seen_id[rid].get("name"), "b": r.get("name"), "id": rid})
            # keep fuller address
            if len(r.get("address") or "") > len(seen_id[rid].get("address") or ""):
                out = [x for x in out if x.get("id") != rid]
                out.append(r)
                seen_id[rid] = r
            continue
        seen_id[rid] = r
        out.append(r)
    with_coords = [r for r in out if r.get("lat") is not None and r.get("lng") is not None]
    drop = set()
    for i, a in enumerate(with_coords):
        if a["id"] in drop:
            continue
        for b in with_coords[i + 1 :]:
            if b["id"] in drop:
                continue
            if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            d = en.haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d <= 40:
                amb.append({"reason": "proximity_same_brand", "a": a.get("name"), "b": b.get("name"), "distance_m": round(d)})
                loser = a if len(a.get("address") or "") < len(b.get("address") or "") else b
                drop.add(loser["id"])
    out = [r for r in out if r["id"] not in drop]
    return out, amb


def write_report(rows, amb, live_report, centers, geocode_n, phase1_total=1607):
    cats = Counter(r.get("import_category") for r in rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    geo_cc = Counter((r.get("constituent_country") or "Unknown") for r in ready)
    missing_addr = sum(1 for r in rows if not (r.get("address") or "").strip())
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    official_coords = sum(1 for r in ready if str(r.get("coord_source") or "").startswith("official"))
    nominatim_coords = sum(1 for r in ready if r.get("coord_source") == "nominatim")
    soft = sum(1 for r in rows if r.get("geocode_status") == "suspicious" or "soft_postal" in (r.get("notes") or ""))
    amb_geo = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")
    coming = [r for r in rows if r.get("import_category") == "COMING_SOON"]
    live_total = 2952
    proposed = cats.get("READY_TO_IMPORT", 0)
    expected = live_total + proposed

    estimates = {
        "PureGym": ("~410 YE2024 / 494 listing URLs", None),
        "The Gym Group": ("264 open 30 Jun 2026 (company)", None),
        "JD Gyms": ("113 official gym URLs", None),
        "David Lloyd": ("UK subset of ~149 UK+Europe listing", None),
        "Nuffield Health": ("~110–111 fitness & wellbeing gyms", None),
        "Anytime Fitness": ("~180–189 UK franchise clubs", None),
        "Energie Fitness": ("UK subset; Ireland excluded", None),
        "Bannatyne": ("~68 health clubs", None),
        "Fitness First": ("24 mainland UK (Jersey excluded)", None),
        "Snap Fitness": ("~105 UK", None),
        "Everlast Gyms": ("~60 UK+IE; UK-only staged", None),
        "Buzz Gym": ("8 open + 3 coming soon", None),
        "Village Gym": ("33 gyms on official site", None),
        "Total Fitness": ("15 health clubs on official join directory", None),
        "Gymbox": ("10 London clubs (official homepage)", None),
        "Third Space": ("17 listed; 2 opening 2026", None),
        "Virgin Active": ("31 UK clubs on official A–Z", None),
        "Fitness4Less": ("7 UK clubs on official locations/contact", None),
        "easyGym": ("1 UK club on official locations page", None),
    }

    def brand_stats(label, aliases):
        sub = [r for r in rows if r.get("brand") in aliases]
        rdy = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unresolved = sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"})
        cov = round(100 * rdy / len(sub), 1) if sub else 0
        return len(sub), rdy, unresolved, cov

    lines = []
    lines.append("# UK Phase 2 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: PHASE 2 STAGING COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Phase 1 unique UK staging total | {phase1_total} |")
    addl = len(rows) - phase1_total
    lines.append(f"| Additional Phase 2 discoveries (net after ingest/dedupe) | {addl} |")
    lines.append(f"| Final unique UK staging total | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT | {cats.get('READY_TO_IMPORT', 0)} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| Duplicates/rebrands removed this pass | {len(amb)} |")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    chain_aliases = [
        ("PureGym", ["PureGym"]),
        ("The Gym Group", ["The Gym Group"]),
        ("JD Gyms", ["JD Gyms"]),
        ("David Lloyd", ["David Lloyd"]),
        ("Nuffield Health", ["Nuffield Health"]),
        ("Anytime Fitness", ["Anytime Fitness"]),
        ("énergie Fitness", ["Energie Fitness", "énergie Fitness"]),
        ("Bannatyne", ["Bannatyne"]),
        ("Fitness First", ["Fitness First"]),
        ("Snap Fitness", ["Snap Fitness"]),
        ("Everlast Gyms", ["Everlast Gyms"]),
        ("Buzz Gym", ["Buzz Gym"]),
        ("Village Gym", ["Village Gym"]),
        ("Total Fitness", ["Total Fitness"]),
        ("Gymbox", ["Gymbox"]),
        ("Third Space", ["Third Space"]),
        ("Virgin Active", ["Virgin Active"]),
        ("EasyGym / Fitness4Less", ["easyGym", "Fitness4Less", "EasyGym"]),
    ]
    for label, aliases in chain_aliases:
        n, rdy, unresolved, cov = brand_stats(label, aliases)
        est = estimates.get(label, estimates.get(aliases[0], ("", None)))[0] if label in estimates or aliases[0] in estimates else ""
        if not est:
            est = estimates.get(aliases[0], ("see notes", None))[0]
        lines.append(f"| {label} | {est} | {n} | {rdy} | {unresolved} | {cov}% |")
    extra_brands = sorted(
        {r.get("brand") for r in rows}
        - {a for _, als in chain_aliases for a in als}
        - {None}
    )
    for b in extra_brands:
        n, rdy, unresolved, cov = brand_stats(b, [b])
        lines.append(f"| {b} | additional conventional if staged | {n} | {rdy} | {unresolved} | {cov}% |")
    lines.append("")
    lines.append("Coverage % is READY / discovered in this staging file.")
    lines.append("")
    lines.append("## Specific answers")
    lines.append("")

    def ready_n(aliases):
        return sum(1 for r in rows if r.get("brand") in aliases and r.get("import_category") == "READY_TO_IMPORT")

    def disc_n(aliases):
        return sum(1 for r in rows if r.get("brand") in aliases)

    buzz = [r for r in rows if r.get("brand") == "Buzz Gym"]
    buzz_open = [r for r in buzz if r.get("import_category") == "READY_TO_IMPORT"]
    buzz_soon = [r for r in buzz if r.get("import_category") == "COMING_SOON"]
    tgg = [r for r in rows if r.get("brand") == "The Gym Group"]
    tgg_500 = [r for r in tgg if "http_500" in (r.get("notes") or "") or "east_anglia" in (r.get("notes") or "")]
    tgg_ready = ready_n(["The Gym Group"])
    lines.append(f"1. **Anytime Fitness READY:** {ready_n(['Anytime Fitness'])} of {disc_n(['Anytime Fitness'])} discovered.")
    lines.append(f"2. **Bannatyne READY:** {ready_n(['Bannatyne'])} of {disc_n(['Bannatyne'])} discovered.")
    lines.append(f"3. **Fitness First READY:** {ready_n(['Fitness First'])} of {disc_n(['Fitness First'])} discovered.")
    lines.append(f"4. **Everlast READY:** {ready_n(['Everlast Gyms'])} of {disc_n(['Everlast Gyms'])} discovered.")
    lines.append(f"5. **JD Gyms READY:** {ready_n(['JD Gyms'])} of {disc_n(['JD Gyms'])} discovered.")
    lines.append(f"6. **David Lloyd READY:** {ready_n(['David Lloyd'])} of {disc_n(['David Lloyd'])} discovered.")
    lines.append(f"7. **Snap Fitness READY:** {ready_n(['Snap Fitness'])} of {disc_n(['Snap Fitness'])} discovered.")
    lines.append(
        f"8. **Buzz Gym:** {len(buzz_open)} open READY; {len(buzz_soon)} coming-soon staged inactive; total staged {len(buzz)}."
    )
    lines.append(
        f"9. **The Gym Group page-gap:** {tgg_ready} READY of {len(tgg)} discovered. "
        f"East Anglia HTTP 500 set was {len(tgg_500)} rows; addresses/coords filled from official finder gymMapData, kiosk/origin mirrors, and/or official URL search snippets where the live HTML still 500s. "
        f"Gyms listed in the official directory were not dropped solely because a club page returned 500."
    )
    lines.append("")
    lines.append("## Geography (READY only)")
    lines.append("")
    for k in ("England", "Scotland", "Wales", "Northern Ireland", "Unknown"):
        if geo_cc.get(k):
            lines.append(f"- {k}: {geo_cc[k]}")
    lines.append("")
    lines.append("Constituent country is derived from UK postcode outward code (staging-only).")
    lines.append("")
    lines.append("## Quality")
    lines.append("")
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postcodes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- READY with official coordinates: {official_coords}")
    lines.append(f"- READY with Nominatim coordinates: {nominatim_coords}")
    lines.append(f"- Soft-postcode matches flagged: {soft}")
    lines.append(f"- Ambiguous geocodes: {amb_geo}")
    lines.append(f"- Nominatim lookups this finalize pass: {geocode_n}")
    lines.append("- No London / country / postcode / city-centroid fallbacks were used. Missing coordinate = not READY.")
    lines.append("- Foreign excluded: Republic of Ireland, Channel Islands (JE/GY), Isle of Man (IM), US Anytime Fitness copy URL, David Lloyd non-GB, Fitness First Jersey.")
    lines.append(f"- Coming-soon locations staged: {len(coming)}")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    zero_ready_major = []
    for label, aliases in chain_aliases:
        if disc_n(aliases) and ready_n(aliases) == 0:
            zero_ready_major.append(label)
    if zero_ready_major:
        lines.append("These targeted conventional chains still have **zero READY** rows: " + ", ".join(zero_ready_major) + ".")
    else:
        lines.append("No targeted conventional chain from the Phase 2 list remains at zero READY, except where the estate itself is coming-soon-only.")
    lines.append("")
    lines.append("Major conventional UK chains **not** bulk-staged (out of scope): council leisure (Better/GLL/Places Leisure), CrossFit boxes, boutique-only, class-only studios, martial arts, yoga/Pilates-only.")
    lines.append("No additional national conventional gym chain of PureGym/The Gym Group scale was found completely missing from staging.")
    lines.append("")
    lines.append("## Proposed production merge")
    lines.append("")
    lines.append(f"**{proposed}** READY_TO_IMPORT rows are recommended for the first UK production merge.")
    lines.append("")
    lines.append(f"Expected live catalog: **2,952 + {proposed} = {expected}**.")
    lines.append("")
    lines.append("Do not merge COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, or unresolved name-only rows.")
    lines.append("")
    lines.append("## Scale")
    lines.append("")
    lines.append("Current live catalog: 2,952. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.")
    if expected <= 8000:
        lines.append(f"{expected} remains **comfortably inside** the current client-side architecture. No server directory migration is required for this UK merge.")
    elif expected <= 10000:
        lines.append(f"{expected} is still inside the 8–10k comfort band, but closer to the planning threshold. Do not migrate in this task.")
    else:
        lines.append(f"{expected} approaches or exceeds the 10k planning threshold. Still do not migrate in this task; reassess before merge.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Staging same-id / proximity collapses: {len(amb)}")
    if isinstance(live_report, dict):
        lines.append(f"- Existing UK rows in live catalog: {live_report.get('existing_uk_in_catalog', 0)}")
        lines.append(f"- Live catalog total: {live_report.get('live_catalog_total', 0)}")
        lines.append(f"- `gb_*` IDs already in live catalog: {len(live_report.get('gb_prefix_already_used') or [])}")
        lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
        lines.append(f"- Same brand+address matches vs live catalog: {len(live_report.get('same_brand_address_matches') or [])}")
        lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report.get('proximity_same_brand') or [])}")
        lines.append(f"- Same address, different brand vs live catalog: {len(live_report.get('same_address_different_brand') or [])}")
    lines.append("- Everlast Gyms keep current brand `Everlast Gyms` with `legacy_brand = DW Sports Fitness`. No duplicate DW Sports rows.")
    lines.append("- Fitness4Less and easyGym are separate operating brands; Women's Gym Total Fitness sites were not duplicated (same physical club).")
    lines.append("- Gymbox Angel/Kensington alias pages were not staged separately from Old Street / Westfield London.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    lines.append("- `scripts/uk-phase2-enrich.py`")
    lines.append("- `scripts/uk-phase2-finalize.py`")
    lines.append("- `data/uk/uk_centers_staging.json`")
    lines.append("- `data/uk/uk_geocode_review.json` / `.csv`")
    lines.append("- `data/uk/uk_duplicate_analysis.json`")
    lines.append("- `data/uk/UK_PHASE2_READINESS_REPORT.md`")
    lines.append("- `data/uk/Gymly_UK_All_Discovered_Centers.xlsx` / `.csv`")
    lines.append("- `data/uk/scrapes/*phase2*.json`")
    lines.append("")
    lines.append("Not modified: `src/data/centers.json`, check-in radius, auto-checkout, workout logging, PR logic, feed, localization, global center architecture.")
    lines.append("")
    lines.append("## Stop")
    lines.append("")
    lines.append("UK Phase 2 stops here. Do not merge UK. Do not run UK QA. Do not start another country.")
    text = "\n".join(lines) + "\n"
    (OUT / "UK_PHASE2_READINESS_REPORT.md").write_text(text, encoding="utf-8")
    return text, proposed, expected


def main():
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    log("loaded staging", len(rows), Counter(r.get("import_category") for r in rows))

    ingest_scrape(rows, SCRAPES / "anytime_uk_phase2.json", "Anytime Fitness")
    ingest_scrape(rows, SCRAPES / "tgg_east_anglia.json", "The Gym Group")
    # prefer webfetch everlast if present
    if (SCRAPES / "everlast_uk_phase2_webfetch.json").exists():
        ingest_scrape(rows, SCRAPES / "everlast_uk_phase2_webfetch.json", "Everlast Gyms", {"legacy_brand": "DW Sports Fitness"})
    elif (SCRAPES / "everlast_uk_phase2.json").exists():
        ingest_scrape(rows, SCRAPES / "everlast_uk_phase2.json", "Everlast Gyms", {"legacy_brand": "DW Sports Fitness"})
    ingest_scrape(rows, SCRAPES / "gymbox_uk_phase2.json", "Gymbox")
    ingest_scrape(rows, SCRAPES / "total_fitness_uk_phase2.json", "Total Fitness")
    ingest_scrape(rows, SCRAPES / "easygym_uk_phase2.json", "easyGym")

    rematch_tgg_map(rows)
    drop_junk(rows)

    rows = [en.classify(r) for r in rows]
    rows, amb = dedupe_staging(rows)
    rows = [en.classify(r) for r in rows]
    log("after ingest", len(rows), Counter(r.get("import_category") for r in rows))

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
        and r.get("verification_status") != "COMING_SOON"
    ]
    log("geocode todo", len(todo))
    for i, r in enumerate(todo):
        log(f"[{i+1}/{len(todo)}] {str(r.get('name') or '')[:70]}")
        en.geocode_row(r, cache)
        if i % 20 == 19:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    rows = [en.classify(r) for r in rows]
    rows, amb2 = dedupe_staging(rows)
    amb.extend(amb2)
    rows = [en.classify(r) for r in rows]

    live_report, centers = c1.vs_live(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    dup = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "phase": "uk_phase2",
        "staging_collapses": amb,
        "vs_live": live_report,
        "staging_counts": dict(Counter(r.get("import_category") for r in rows)),
        "brand_counts": dict(Counter(r.get("brand") for r in rows)),
    }
    (OUT / "uk_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    c1.write_geocode_review(rows)
    c1.write_excel(rows)
    text, proposed, expected = write_report(rows, amb, live_report, centers, len(todo))
    log("READY", proposed, "expected catalog", expected)
    log("wrote", STAGING)
    for brand, n in Counter(r.get("brand") for r in rows).most_common():
        sub = [r for r in rows if r.get("brand") == brand]
        ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        log(f"  {brand:22} n={n:4} READY={ready:4}")


if __name__ == "__main__":
    main()
