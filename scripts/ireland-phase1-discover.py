#!/usr/bin/env python3
"""Ireland Phase 1 discovery — official sources only. Does NOT modify centers.json."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    EIRCODE_RE,
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_eircode,
    extract_jsonld,
    write_json,
)

OUT = ROOT / "data/ireland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

NI_MARKERS = re.compile(
    r"\b(belfast|derry|londonderry|newry|lisburn|bangor|omagh|enniskillen|"
    r"northern ireland|co\.?\s*antrim|co\.?\s*down|co\.?\s*armagh|co\.?\s*tyrone|co\.?\s*fermanagh)\b",
    re.I,
)
FOOTER_EIRCODES = {"D08 K188"}  # site-wide contaminant observed in FLYEfit HTML


def is_ni(text: str) -> bool:
    return bool(NI_MARKERS.search(text or ""))


def valid_eircode(code: str) -> str:
    code = extract_eircode(code or "")
    if not code or code in FOOTER_EIRCODES:
        return ""
    if not EIRCODE_RE.match(code):
        return ""
    # Reject clearly invalid Dublin routing keys (D01–D24 + D6W only)
    rk = code.split()[0].upper()
    if rk.startswith("D") and rk != "D6W":
        try:
            n = int(rk[1:])
            if n < 1 or n > 24:
                return ""
        except ValueError:
            return ""
    return code


def parse_flyefit_page(url: str, html: str) -> dict | None:
    slug = url.rstrip("/").split("/")[-1]
    if slug in {"feed", "page"}:
        return None
    name = address = city = eircode = ""
    lat = lng = None
    for block in extract_jsonld(html):
        if block.get("@type") != "HealthClub":
            continue
        name = clean_text(block.get("name")) or name
        addr = block.get("address") if isinstance(block.get("address"), dict) else {}
        address = clean_text(addr.get("streetAddress")) or address
        city = clean_text(addr.get("addressLocality")) or city
        pc = clean_text(addr.get("postalCode"))
        if pc and not pc.lower().startswith("dublin"):
            eircode = valid_eircode(pc) or eircode
        geo = block.get("geo") if isinstance(block.get("geo"), dict) else {}
        try:
            if geo.get("latitude") is not None:
                lat, lng = float(geo["latitude"]), float(geo["longitude"])
        except (TypeError, ValueError):
            pass
    if not name:
        name = f"FLYEfit {slug.replace('-', ' ').title()}"
    if not address:
        address = name
    if not city:
        city = "Cork" if "cork" in slug else "Galway" if "galway" in slug else "Dublin"
    blob = f"{address} {city} {html[:3000]}"
    if is_ni(blob):
        return None
    # Prefer spaced eircode from page body excluding footer contaminant
    if not eircode:
        for m in re.finditer(
            r"\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s[0-9AC-FHKNPRTV-Y]{4})\b", html, re.I
        ):
            c = valid_eircode(m.group(1))
            if c:
                eircode = c
                break
    coming = bool(re.search(r"coming soon|opening soon", html, re.I))
    # Avoid matching customer-review text ("permanently closed") on club pages
    closed = bool(
        re.search(
            r"(this gym has (permanently )?closed|club (has been )?permanently closed|"
            r"we('ve| have) closed this (gym|club))",
            html,
            re.I,
        )
    )
    # FLYEHUB Swords is same site as FLYEfit Swords — keep both candidates; consolidate marks dup
    return base_row(
        prefix="ie_",
        country="Ireland",
        brand="FLYEfit",
        name=name,
        address=address,
        postal_code=eircode,
        city=city,
        source_url=url,
        lat=lat,
        lng=lng,
        website=url,
        coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
        notes="flyefit_healthclub_jsonld",
        coming=coming,
        closed=closed,
        chain_key="flyefit",
    )


def discover_flyefit(rows: list) -> None:
    listing = curl_fetch("https://www.flyefit.ie/gyms/", RAW / "flyefit_gyms.html")
    urls = sorted(set(re.findall(r"https://www\.flyefit\.ie/gyms/[a-z0-9\-]+/?", listing)))
    urls = [u for u in urls if not u.rstrip("/").endswith(("/feed", "/page"))]
    print(f"FLYEfit listing URLs: {len(urls)}")
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        path = PAGES / f"flyefit_{slug}.html"
        html = path.read_text() if path.exists() else curl_fetch(url, path)
        if html.startswith("ERR"):
            print("  fail", url)
            continue
        row = parse_flyefit_page(url, html)
        if row:
            rows.append(row)
            print("  +", row["name"], row["postal_code"] or "(no eircode)", row["lat"])
        time.sleep(0.2)


def discover_bdgyms(rows: list) -> None:
    home = curl_fetch("https://bdgyms.com/", RAW / "bdgyms_home.html")
    clubs = sorted(
        set(
            re.findall(
                r"https://bdgyms\.com/(blanchardstown|carlisle|cherrywood|northwood|portlaoise)/?",
                home,
            )
        )
    )
    print(f"BD Gyms clubs: {clubs}")
    city_map = {
        "blanchardstown": "Dublin",
        "carlisle": "Dublin",
        "cherrywood": "Dublin",
        "northwood": "Dublin",
        "portlaoise": "Portlaoise",
    }
    for slug in clubs:
        url = f"https://bdgyms.com/{slug}/"
        path = PAGES / f"bd_{slug}.html"
        html = path.read_text() if path.exists() else curl_fetch(url, path)
        if html.startswith("ERR"):
            continue
        address = ""
        for m in re.finditer(r"google\.com/maps\?q=([^\"'&]+)", html):
            q = urllib.parse.unquote(m.group(1).replace("&#038;", "&"))
            if "ben dunne" in q.lower() and "portlaoise" in q.lower():
                address = "Ben Dunne Gyms Portlaoise"
            else:
                address = clean_text(q.replace("%20", " "))
            if address:
                break
        eircode = ""
        # Only accept spaced eircodes (avoid CSS hash false positives)
        for m in re.finditer(
            r"\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s[0-9AC-FHKNPRTV-Y]{4})\b", html, re.I
        ):
            c = valid_eircode(m.group(1))
            if c:
                eircode = c
                break
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Ben Dunne Gyms",
                name=f"Ben Dunne Gyms {slug.title()}",
                address=address or f"Ben Dunne Gyms {slug.title()}",
                postal_code=eircode,
                city=city_map.get(slug, "Dublin"),
                source_url=url,
                notes="bdgyms_maps_query",
                chain_key="ben_dunne_gyms",
            )
        )
        print("  + BD", slug, address, eircode or "(no eircode)")
        time.sleep(0.2)


def discover_westwood(rows: list) -> None:
    html = curl_fetch("https://westwood.ie/health-clubs", RAW / "westwood_clubs.html")
    clubs = [n for n in ["Clontarf", "Leopardstown", "Ballsbridge", "Wilton"] if re.search(rf"\b{n}\b", html, re.I)]
    print("West Wood mentioned:", clubs)
    for name in clubs:
        slug = name.lower()
        for url in [
            f"https://westwood.ie/{slug}",
            f"https://westwood.ie/health-clubs/{slug}",
            f"https://westwood.ie/clubs/{slug}",
        ]:
            path = PAGES / f"westwood_{slug}.html"
            page = path.read_text() if path.exists() else curl_fetch(url, path)
            if page.startswith("ERR") or len(page) < 500:
                continue
            eircode = ""
            for m in re.finditer(
                r"\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s[0-9AC-FHKNPRTV-Y]{4})\b", page, re.I
            ):
                c = valid_eircode(m.group(1))
                if c:
                    eircode = c
                    break
            address = ""
            m = re.search(r"(?:Address|Find us)[:\s]*([^<\n]{8,120})", page, re.I)
            if m:
                address = clean_text(m.group(1))
            rows.append(
                base_row(
                    prefix="ie_",
                    country="Ireland",
                    brand="West Wood Club",
                    name=f"West Wood Club {name}",
                    address=address or f"West Wood Club {name}",
                    postal_code=eircode,
                    city="Cork" if name == "Wilton" else "Dublin",
                    source_url=url,
                    notes="westwood_page",
                    chain_key="west_wood",
                )
            )
            print("  + Westwood", name, eircode or "(no eircode)")
            break
        time.sleep(0.2)


def discover_anytime_ie(rows: list) -> None:
    html = curl_fetch("https://www.anytimefitness.ie/find-gym/", RAW / "anytime_find.html")
    for m in re.finditer(
        r'\{\s*"title"\s*:\s*"([^"]+)"[^}]{0,400}?"latitude"\s*:\s*([-\d.]+)[^}]{0,200}?"longitude"\s*:\s*([-\d.]+)',
        html,
        re.I,
    ):
        title, lat, lng = m.group(1), float(m.group(2)), float(m.group(3))
        blob = m.group(0)
        if is_ni(blob + title):
            continue
        rows.append(
            base_row(
                prefix="ie_",
                country="Ireland",
                brand="Anytime Fitness",
                name=clean_text(title),
                address=clean_text(title),
                postal_code=valid_eircode(blob),
                city="",
                source_url="https://www.anytimefitness.ie/find-gym/",
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_MAP_PIN",
                notes="anytime_embedded_marker",
                chain_key="anytime_fitness",
            )
        )
    if not any(r["brand"] == "Anytime Fitness" for r in rows):
        write_json(
            SCRAPES / "anytime_ie_note.json",
            {"status": "locator_partial", "note": "markers not embedded; Phase 2"},
        )


def main():
    rows: list = []
    inventory = {
        "country": "Ireland",
        "prefix": "ie_",
        "chains_attempted": [],
        "notes": {
            "Energie Fitness Ireland": "UK Energie is gb_*; IE estate needs Phase 2 ROI confirmation",
            "Aura Leisure": "Include only conventional gym product sites — Phase 2 policy",
            "Gym Plus / NRG / Iconic / SportsCo / Swan / LeisurePoint": "Secondary audit deferred to Phase 2",
            "Northern Ireland": "Excluded — remains United Kingdom",
            "Eircode": "READY requires valid Eircode string; Dublin N district labels are not Eircodes",
        },
    }
    discover_flyefit(rows)
    inventory["chains_attempted"].append(
        {"brand": "FLYEfit", "count": sum(1 for r in rows if r["brand"] == "FLYEfit")}
    )
    discover_bdgyms(rows)
    inventory["chains_attempted"].append(
        {"brand": "Ben Dunne Gyms", "count": sum(1 for r in rows if r["brand"] == "Ben Dunne Gyms")}
    )
    discover_westwood(rows)
    inventory["chains_attempted"].append(
        {"brand": "West Wood Club", "count": sum(1 for r in rows if r["brand"] == "West Wood Club")}
    )
    before = len(rows)
    discover_anytime_ie(rows)
    inventory["chains_attempted"].append({"brand": "Anytime Fitness", "count": len(rows) - before})
    write_json(OUT / "ireland_phase1_candidates.json", rows)
    write_json(OUT / "ireland_chain_inventory.json", inventory)
    print(f"Ireland candidates: {len(rows)}")


if __name__ == "__main__":
    main()
