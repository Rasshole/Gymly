#!/usr/bin/env python3
"""Hungary Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_geo_from_html,
    format_hu_postal,
    write_json,
)

OUT = ROOT / "data/hungary"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

CLUB_NAME_HINTS = {
    "1117": "Life1 Allee",
    "1082": "Life1 Corvin",
    "1115": "Life1 Etele",
    "1066": "Life1 Nyugati",
    "1134": "Life1 Váci",
    "1139": "Life1 Fáy / Springday",
}


def discover_life1(rows: list) -> None:
    home = curl_fetch("https://life1.hu/", RAW / "life1_home.html")
    # Official markers: address + data-pos="lng,lat"
    pattern = re.compile(
        r'(\d{4})\s+Budapest,\s*([^"<]{5,90}?)"\s*data-pos="([0-9.]+),([0-9.]+)"',
        re.I,
    )
    seen = set()
    for m in pattern.finditer(home):
        postal, street, lng, lat = m.group(1), clean_text(m.group(2)), float(m.group(3)), float(m.group(4))
        # data-pos is lng,lat
        key = (postal, street.lower())
        if key in seen:
            continue
        seen.add(key)
        name = CLUB_NAME_HINTS.get(postal, f"Life1 Budapest {postal}")
        if "Futó" in street or "Futo" in street:
            name = "Life1 Corvin"
        elif "Etele" in street:
            name = "Life1 Etele"
        elif "Október" in street or "Oktober" in street:
            name = "Life1 Allee"
        elif "Nyugati" in street:
            name = "Life1 Nyugati"
        elif "Váci" in street or "Vaci" in street:
            name = "Life1 Váci"
        elif "Fáy" in street or "Fay" in street:
            name = "Life1 Fáy"
        rows.append(
            base_row(
                prefix="hu_",
                country="Hungary",
                brand="Life1 Fitness",
                name=name,
                address=f"{street}, {postal} Budapest",
                postal_code=postal,
                city="Budapest",
                source_url="https://life1.hu/",
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_MAP_PIN",
                notes="life1_home_data_pos",
                chain_key="life1",
            )
        )
        print("  +", name, postal, lat, lng)

    # Mammut and any dedicated club pages
    for slug, label in [("mammut", "Life1 Mammut")]:
        url = f"https://life1.hu/{slug}/"
        html = curl_fetch(url, PAGES / f"life1_{slug}.html")
        if html.startswith("ERR"):
            continue
        addrs = re.findall(r"(\d{4})\s+Budapest,\s*([^<\n\"]{5,90})", html)
        lat, lng = extract_geo_from_html(html)
        for postal, street in addrs:
            street = clean_text(street)
            if "Mammut" not in street and slug == "mammut" and "Mammut" not in html[:2000]:
                # still use first mammut-related
                pass
            key = (postal, street.lower())
            if key in seen:
                continue
            # Prefer addresses mentioning Mammut / Lövőház etc.
            if slug == "mammut" and "Mammut" not in street and "Lövőház" not in street and "Lovohaz" not in street:
                # check page title context — still accept unique 1024-ish postal near Mammut
                if not postal.startswith("10"):
                    continue
            seen.add(key)
            pos = re.search(
                rf'{re.escape(postal)}\s+Budapest,\s*{re.escape(street[:20])}[^"]*"\s*data-pos="([0-9.]+),([0-9.]+)"',
                html,
            )
            if pos:
                lng, lat = float(pos.group(1)), float(pos.group(2))
            rows.append(
                base_row(
                    prefix="hu_",
                    country="Hungary",
                    brand="Life1 Fitness",
                    name=label,
                    address=f"{street}, {postal} Budapest",
                    postal_code=postal,
                    city="Budapest",
                    source_url=url,
                    lat=lat,
                    lng=lng,
                    coord_source="OFFICIAL_MAP_PIN" if lat else None,
                    notes=f"life1_{slug}_page",
                    chain_key="life1",
                )
            )
            print("  +", label, postal)
            break
        time.sleep(0.3)


def discover_cutler(rows: list) -> None:
    html = curl_fetch("https://cutler.hu/", RAW / "cutler_home.html")
    if html.startswith("ERR"):
        write_json(SCRAPES / "cutler_note.json", {"status": "fetch_failed"})
        return
    # Club / location links
    links = sorted(
        set(
            re.findall(r"https://cutler\.hu/[a-z0-9\-/%]+", html)
            + ["https://cutler.hu" + p for p in re.findall(r'href="(/[a-z0-9\-]+/?)"', html)]
        )
    )
    links = [
        u
        for u in links
        if any(
            k in u.lower()
            for k in ("terem", "club", "gym", "fitness", "budapest", "debrecen", "szeged", "gyor", "pecs")
        )
        or u.rstrip("/").count("/") <= 3
    ]
    # Also extract embedded addresses on home
    for m in re.finditer(r"(\d{4})\s+([A-ZÁÉÍÓÖŐÚÜŰ][^,\n<]{2,40}),\s*([^<\n]{5,80})", html):
        postal, city, street = m.group(1), clean_text(m.group(2)), clean_text(m.group(3))
        if city.lower() in ("budapest",) or re.match(r"^[A-ZÁÉÍÓÖŐÚÜŰ]", city):
            rows.append(
                base_row(
                    prefix="hu_",
                    country="Hungary",
                    brand="Cutler Gym",
                    name=f"Cutler Gym {city}",
                    address=f"{street}, {postal} {city}",
                    postal_code=postal,
                    city=city,
                    source_url="https://cutler.hu/",
                    notes="cutler_home_address",
                    chain_key="cutler",
                )
            )
    write_json(SCRAPES / "cutler_links.json", {"links": links[:50]})
    print(f"Cutler address hits on home: {sum(1 for r in rows if r['brand']=='Cutler Gym')}")


def discover_secondary_notes() -> dict:
    notes = {
        "4% Fitness / Chili / Thor / Nr1 / Fitness5": "Budapest-heavy networks — Phase 2 deep scrape if national coverage incomplete",
        "Scitec Gold / Gilda Max / Oxygen / Millennium / Global Fitness / Go Active": "Verify current consumer brands vs legacy; Phase 2",
        "Anytime Fitness / clever fit Hungary": "Confirm presence before extraction — not assumed",
        "Budapest density": "Preserve district/locality; do not collapse nearby clubs",
    }
    # Quick presence probes
    for label, url in [
        ("chili", "https://chilifitness.hu/"),
        ("4percent", "https://4percent.hu/"),
        ("anytime_hu", "https://www.anytimefitness.hu/"),
    ]:
        body = curl_fetch(url, RAW / f"{label}.html")
        write_json(
            SCRAPES / f"{label}_probe.json",
            {"url": url, "ok": not body.startswith("ERR"), "len": len(body)},
        )
        time.sleep(0.2)
    return notes


def main():
    rows: list = []
    inventory = {
        "country": "Hungary",
        "prefix": "hu_",
        "chains_attempted": [],
        "notes": discover_secondary_notes(),
    }
    print("Life1…")
    discover_life1(rows)
    inventory["chains_attempted"].append(
        {"brand": "Life1 Fitness", "count": sum(1 for r in rows if r["brand"] == "Life1 Fitness")}
    )
    print("Cutler…")
    before = len(rows)
    discover_cutler(rows)
    inventory["chains_attempted"].append(
        {"brand": "Cutler Gym", "count": len(rows) - before}
    )
    write_json(OUT / "hungary_phase1_candidates.json", rows)
    write_json(OUT / "hungary_chain_inventory.json", inventory)
    print(f"Hungary candidates: {len(rows)}")


if __name__ == "__main__":
    main()
