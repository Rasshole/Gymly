#!/usr/bin/env python3
"""Greece Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import json
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
    format_gr_postal,
    write_json,
)

OUT = ROOT / "data/greece"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)


def parse_alterlife_page(url: str, html: str, title: str) -> dict | None:
    # Reject Cyprus / foreign clubs on Alterlife network
    blob = f"{title} {url} {html[:4000]}"
    if re.search(r"ΚΥΠΡΟΣ|Cyprus|Lefkosia|Nicosia|Λευκωσία", blob, re.I):
        return None
    # Address wrapper: Δ: street number, locality postcode
    address = city = postal = ""
    m = re.search(
        r'address-outer-wrapper.*?Δ:\s*</span>\s*<a[^>]*>\s*(.*?)</a>',
        html,
        re.S | re.I,
    )
    if m:
        bits = [clean_text(x) for x in re.findall(r">([^<>]+)<", "<x>" + m.group(1) + "</x>")]
        bits = [b for b in bits if b and b not in {"Δ:", "Δ"}]
        # Reconstruct from raw stripped text
        raw = clean_text(re.sub(r"<[^>]+>", " ", m.group(1)))
        address = raw
        # postal 5 digits compact or spaced
        pm = re.search(r"(\d{3})\s*(\d{2})", raw)
        if pm:
            postal = f"{pm.group(1)} {pm.group(2)}"
        # city/locality often middle token
        parts = [p.strip(" ,") for p in raw.replace(",", " ").split() if p.strip(" ,")]
        # Heuristic: last token before postal is locality; city often Athens metro
        city = title
    if not postal:
        pm = re.search(r"(\d{5})\b", html)
        if pm:
            compact = pm.group(1)
            postal = f"{compact[:3]} {compact[3:]}"
    if not address:
        # Fallback from title only — mark for review via empty-ish address handling
        address = clean_text(title)
    lat, lng = extract_geo_from_html(html)
    # City from title / known islands / cities
    city_guess = clean_text(title)
    for c in [
        "Θεσσαλονίκη",
        "Αθήνα",
        "Πάτρα",
        "Ηράκλειο",
        "Λάρισα",
        "Βόλος",
        "Ιωάννινα",
        "Χανιά",
        "Ρόδος",
        "Καλαμάτα",
        "Κέρκυρα",
        "Κως",
        "Μυτιλήνη",
        "Athens",
        "Thessaloniki",
        "Patras",
        "Heraklion",
    ]:
        if c.lower() in html.lower() or c in title:
            city_guess = c
            break
    # Prefer Greek locality from address string
    if address and postal:
        before = address
        before = re.sub(postal.replace(" ", r"\s*"), "", before)
        before = re.sub(r"\d{5}", "", before)
        city_guess = clean_text(before.split(",")[-1]) or city_guess

    coming = bool(re.search(r"coming soon|σύντομα|προσεχώς", html, re.I))
    closed = bool(re.search(r"closed|έκλεισε|δεν λειτουργεί", html, re.I))
    return base_row(
        prefix="gr_",
        country="Greece",
        brand="Alterlife",
        name=f"Alterlife {clean_text(title)}",
        address=address,
        postal_code=postal or format_gr_postal(html),
        city=city_guess or clean_text(title),
        source_url=url,
        lat=lat,
        lng=lng,
        coord_source="OFFICIAL_STRUCTURED_DATA" if lat else None,
        notes="alterlife_club_page",
        coming=coming,
        closed=closed,
        chain_key="alterlife",
    )


def discover_alterlife(rows: list) -> None:
    api = curl_fetch(
        "https://alterlife.gr/wp-json/wp/v2/clubs?per_page=100",
        RAW / "alterlife_wp_clubs.json",
    )
    clubs = []
    try:
        clubs = json.loads(api)
    except json.JSONDecodeError:
        print("Alterlife WP API parse fail")
        return
    print(f"Alterlife clubs API: {len(clubs)}")
    for club in clubs:
        link = club.get("link") or ""
        slug = club.get("slug") or link.rstrip("/").split("/")[-1]
        title = (club.get("title") or {}).get("rendered") or slug
        path = PAGES / f"alter_{slug}.html"
        html = path.read_text() if path.exists() else curl_fetch(link, path)
        if html.startswith("ERR"):
            print("  fail", link)
            continue
        row = parse_alterlife_page(link, html, title)
        if row:
            rows.append(row)
            print("  +", row["name"], row["postal_code"])
        time.sleep(0.2)


def discover_holmes(rows: list) -> None:
    html = curl_fetch("https://www.holmesplace.gr/en/clubs/", RAW / "holmes_clubs.html")
    if html.startswith("ERR"):
        html = curl_fetch("https://www.holmesplace.gr/clubs/", RAW / "holmes_clubs.html")
    # Cards with data-lat/lng
    for m in re.finditer(
        r'data-lat=["\']([-\d.]+)["\'][^>]*data-lng=["\']([-\d.]+)["\']', html
    ):
        lat, lng = float(m.group(1)), float(m.group(2))
        ctx = html[max(0, m.start() - 500) : m.start() + 500]
        name_m = re.search(r"(Holmes Place[^<]{0,40}|Athens|Maroussi|Glyfada|Θεσσαλονίκη)", ctx, re.I)
        name = clean_text(name_m.group(0)) if name_m else "Holmes Place"
        postal = format_gr_postal(ctx)
        city = "Athens"
        if re.search(r"maroussi|μαρούσι", ctx, re.I):
            city = "Maroussi"
            name = "Holmes Place Maroussi"
        elif re.search(r"glyfada|γλυφάδα", ctx, re.I):
            city = "Glyfada"
            name = "Holmes Place Glyfada"
        elif re.search(r"athens|αθήνα", ctx, re.I):
            city = "Athens"
            name = "Holmes Place Athens"
        address = clean_text(name)
        am = re.search(r"(\d{1,4}[^<\n,]{5,60}\d{3}\s*\d{2})", ctx)
        if am:
            address = clean_text(am.group(1))
            postal = postal or format_gr_postal(address)
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Holmes Place",
                name=name,
                address=address,
                postal_code=postal,
                city=city,
                source_url="https://www.holmesplace.gr/en/clubs/",
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_MAP_PIN",
                notes="holmes_place_gr_locator",
                chain_key="holmes_place",
            )
        )
        print("  + Holmes", name, lat, lng)

    # Also try dedicated club pages if named
    for slug, label, city in [
        ("athens", "Holmes Place Athens", "Athens"),
        ("maroussi", "Holmes Place Maroussi", "Maroussi"),
        ("glyfada", "Holmes Place Glyfada", "Glyfada"),
    ]:
        if any(r["name"] == label for r in rows):
            continue
        url = f"https://www.holmesplace.gr/en/clubs/{slug}/"
        page = curl_fetch(url, PAGES / f"holmes_{slug}.html")
        if page.startswith("ERR"):
            continue
        lat, lng = extract_geo_from_html(page)
        postal = format_gr_postal(page)
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Holmes Place",
                name=label,
                address=label,
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat else None,
                notes="holmes_club_page",
                chain_key="holmes_place",
            )
        )


def discover_yava(rows: list) -> None:
    html = curl_fetch("https://yava.gr/gymnastiria/", RAW / "yava_gyms.html")
    write_json(
        SCRAPES / "yava_note.json",
        {
            "status": "js_rendered_locator",
            "len": len(html),
            "note": "Yava listing appears JS-rendered; Phase 2 required for near-complete estate",
        },
    )
    # Attempt any static links
    links = sorted(set(re.findall(r"https://yava\.gr/[^\"']+", html)))
    club_links = [u for u in links if "gym" in u.lower() or "club" in u.lower()]
    print(f"Yava static club links: {len(club_links)}")
    for url in club_links[:30]:
        slug = url.rstrip("/").split("/")[-1]
        page = curl_fetch(url, PAGES / f"yava_{slug}.html")
        if page.startswith("ERR") or len(page) < 500:
            continue
        postal = format_gr_postal(page)
        lat, lng = extract_geo_from_html(page)
        if not postal and not lat:
            continue
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Yava",
                name=f"Yava {slug}",
                address=clean_text(slug.replace("-", " ")),
                postal_code=postal,
                city="",
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat else None,
                notes="yava_partial",
                chain_key="yava",
            )
        )
        time.sleep(0.25)


def main():
    rows: list = []
    inventory = {
        "country": "Greece",
        "prefix": "gr_",
        "chains_attempted": [],
        "notes": {
            "Yava": "Official locator JS-rendered — PHASE 2 REQUIRED for near-complete extraction",
            "Mega Gym / Planet Fitness Greece / Curves / Gym Tonic / Golden Clubs / Bodyfit": "Confirm local identity before scrape; Phase 2",
            "Islands": "Include chain sites on Crete/Rhodes/Corfu/Kos/Lesbos when found via Alterlife/Yava; no independent island crawl",
            "Script": "Preserve Greek official text; Latin only when source canonical",
        },
    }
    print("Alterlife…")
    discover_alterlife(rows)
    inventory["chains_attempted"].append(
        {"brand": "Alterlife", "count": sum(1 for r in rows if r["brand"] == "Alterlife")}
    )
    print("Holmes Place…")
    before = len(rows)
    discover_holmes(rows)
    inventory["chains_attempted"].append(
        {"brand": "Holmes Place", "count": len(rows) - before}
    )
    print("Yava…")
    before = len(rows)
    discover_yava(rows)
    inventory["chains_attempted"].append(
        {"brand": "Yava", "count": len(rows) - before}
    )
    write_json(OUT / "greece_phase1_candidates.json", rows)
    write_json(OUT / "greece_chain_inventory.json", inventory)
    print(f"Greece candidates: {len(rows)}")


if __name__ == "__main__":
    main()
