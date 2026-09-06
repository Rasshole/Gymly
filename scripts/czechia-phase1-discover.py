#!/usr/bin/env python3
"""Czechia Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import json
import re
import sys
import time
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_geo_from_html,
    format_cz_postal,
    write_json,
)

OUT = ROOT / "data/czechia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

FOREIGN = re.compile(
    r"\b(deutschland|germany|österreich|austria|slovensko|slovakia|poland|polsko)\b",
    re.I,
)
CITY_RE = re.compile(
    r"\b(Praha|Brno|Ostrava|Plzeň|Plzen|Liberec|Olomouc|Pardubice|"
    r"Hradec Králové|České Budějovice|Ceske Budejovice|Zlín|Zlin|"
    r"Ústí nad Labem|Usti nad Labem|Jihlava|Karlovy Vary|Kladno)\b"
)


def strip_noise(html: str) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.S | re.I)
    return html


def extract_cz_address_block(html: str) -> tuple[str, str, str]:
    """Return (address, postal, city) from cleaned HTML."""
    text = strip_noise(html)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = unescape(text)
    lines = [clean_text(x) for x in text.split("\n") if clean_text(x)]
    for i, line in enumerate(lines):
        # Require real space between PSC parts AND a city token nearby
        m = re.search(
            r"\b([1-7]\d{2})\s+(\d{2})\b.*?\b("
            r"Praha|Brno|Ostrava|Plzeň|Plzen|Liberec|Olomouc|Pardubice|"
            r"Hradec|České|Ceske|Zlín|Zlin|Ústí|Usti|Jihlava|Karlovy|Kladno"
            r")\b",
            line,
        )
        if not m:
            continue
        postal = f"{m.group(1)} {m.group(2)}"
        city_m = CITY_RE.search(line)
        city = city_m.group(1) if city_m else m.group(3)
        if city in {"Hradec", "České", "Ceske", "Ústí", "Usti", "Karlovy"}:
            # expand if full name on line
            if "Hradec Králové" in line:
                city = "Hradec Králové"
            elif "České Budějovice" in line or "Ceske Budejovice" in line:
                city = "České Budějovice"
            elif "Ústí nad Labem" in line or "Usti nad Labem" in line:
                city = "Ústí nad Labem"
            elif "Karlovy Vary" in line:
                city = "Karlovy Vary"
        if city == "Plzen":
            city = "Plzeň"
        if city == "Zlin":
            city = "Zlín"
        prev = [lines[j] for j in range(max(0, i - 3), i) if lines[j] and len(lines[j]) < 120]
        address = ", ".join(prev[-2:]) if prev else line
        # Prefer street-like previous line over CSS leftovers
        address = clean_text(address)
        if len(address) > 160 or "{" in address or "wp-block" in address:
            address = line
        return address, postal, city
    return "", "", ""


def parse_ff_page(url: str, html: str) -> dict | None:
    slug = url.rstrip("/").split("/")[-1].replace("fitness-", "")
    name = f"Form Factory {slug.replace('-', ' ').title()}"
    address, postal, city = extract_cz_address_block(html)
    if FOREIGN.search(f"{address} {city}"):
        return None
    lat, lng = extract_geo_from_html(strip_noise(html))
    coming = bool(
        re.search(
            r"(brzy otevřeme|coming soon|připravujeme otevření|otevíráme brzy)",
            html,
            re.I,
        )
    )
    # Avoid matching i18n keys like closed: 'Zavřeno' in scripts
    closed = bool(
        re.search(
            r"(permanently closed|this (club|gym) (is |has )?closed|klub (je )?zavřen|definitivně uzavřen)",
            strip_noise(html),
            re.I,
        )
    )
    if not city:
        city = "Praha"
    if not address:
        address = name
    return base_row(
        prefix="cz_",
        country="Czechia",
        brand="Form Factory",
        name=name,
        address=address,
        postal_code=postal,
        city=city,
        source_url=url,
        lat=lat,
        lng=lng,
        coord_source="OFFICIAL_STRUCTURED_DATA" if lat else None,
        notes="form_factory_club_page",
        coming=coming,
        closed=closed,
        chain_key="form_factory",
    )


def discover_form_factory(rows: list) -> None:
    listing = curl_fetch("https://www.formfactory.cz/kluby/", RAW / "ff_klub.html")
    if listing.startswith("ERR"):
        listing = Path(RAW / "ff_klub.html").read_text() if (RAW / "ff_klub.html").exists() else ""
    paths = sorted(set(re.findall(r"/klub/fitness-[a-z0-9\-]+/?", listing)))
    print(f"Form Factory clubs: {len(paths)}")
    for path in paths:
        url = "https://www.formfactory.cz" + path.rstrip("/") + "/"
        slug = path.rstrip("/").split("/")[-1]
        page_path = PAGES / f"ff_{slug}.html"
        html = page_path.read_text() if page_path.exists() else curl_fetch(url, page_path)
        if html.startswith("ERR"):
            print("  fail", url)
            continue
        row = parse_ff_page(url, html)
        if row:
            rows.append(row)
            print("  +", row["name"], row["postal_code"], row["city"], (row["address"] or "")[:50])
        time.sleep(0.15)


def discover_max_fitness(rows: list) -> None:
    api = curl_fetch(
        "https://www.maxfitness.cz/api/branches?limit=100",
        RAW / "max_branches_api.json",
    )
    try:
        data = json.loads(api)
        docs = data.get("docs") or []
    except json.JSONDecodeError:
        print("Max Fitness API parse fail")
        return
    print(f"Max Fitness API docs: {len(docs)}")
    for doc in docs:
        coords = doc.get("coordinates") or {}
        address = clean_text(coords.get("address"))
        postal = format_cz_postal(address)
        # Prefer spaced PSC from address
        m = re.search(r"\b([1-7]\d{2})\s+(\d{2})\b", address)
        if m:
            postal = f"{m.group(1)} {m.group(2)}"
        city_obj = doc.get("city") or {}
        city = clean_text(city_obj.get("title") if isinstance(city_obj, dict) else city_obj) or "Praha"
        lat = coords.get("lat")
        lng = coords.get("lon") or coords.get("lng")
        title = clean_text(doc.get("title") or doc.get("cardTitle"))
        slug = doc.get("slug") or ""
        brand = "Oktagon Gym" if "oktagon" in (slug + title).lower() else "Max Fitness"
        name = title if title.lower().startswith(brand.lower()) else f"{brand} {title}"
        url = f"https://www.maxfitness.cz/en/branches/detail/{slug}" if slug else "https://www.maxfitness.cz/en/branches"
        rows.append(
            base_row(
                prefix="cz_",
                country="Czechia",
                brand=brand,
                name=name,
                address=address or name,
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_COORDINATE" if lat is not None else None,
                notes="maxfitness_api_branches",
                chain_key="max_fitness" if brand == "Max Fitness" else "oktagon_gym",
            )
        )
        print("  +", brand, name, postal, city)


def discover_fitinn_cz(rows: list) -> None:
    html = curl_fetch("https://fitinn.at/studios/", RAW / "fitinn_studios.html")
    urls = sorted(
        set(
            re.findall(
                r"https://fitinn\.at/fitnessstudios/(?:brno|praha|ostrava|plzen)[^\"']*",
                html,
                re.I,
            )
        )
    )
    if not urls and "Brno" in html:
        urls = ["https://fitinn.at/fitnessstudios/brno-oc-letmo/"]
    print(f"FITINN CZ: {urls}")
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        page_path = PAGES / f"fitinn_{slug}.html"
        page = page_path.read_text() if page_path.exists() else curl_fetch(url, page_path)
        if page.startswith("ERR"):
            continue
        address, postal, city = extract_cz_address_block(page)
        if not postal:
            # Austrian site may use different layout — try spaced PSC near Brno
            m = re.search(r"\b([1-7]\d{2})\s+(\d{2})\b[^.]{0,40}Brno", strip_noise(page))
            if m:
                postal = f"{m.group(1)} {m.group(2)}"
                city = "Brno"
        lat, lng = extract_geo_from_html(strip_noise(page))
        rows.append(
            base_row(
                prefix="cz_",
                country="Czechia",
                brand="FITINN",
                name=f"FITINN {slug.replace('-', ' ').title()}",
                address=address or f"FITINN {slug}",
                postal_code=postal,
                city=city or "Brno",
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat else None,
                notes="fitinn_cz_studio",
                chain_key="fitinn",
            )
        )
        print("  + FITINN", slug, postal)
        time.sleep(0.2)


def main():
    rows: list = []
    inventory = {
        "country": "Czechia",
        "prefix": "cz_",
        "chains_attempted": [],
        "notes": {
            "McFIT / John Reed": "No current Czech consumer locator confirmed in Phase 1",
            "clever fit": "CZ listing empty/thin in Phase 1 — Phase 2 if needed",
            "BBC Fitness / Factory Pro / Zone4You / Element / Next.Move": "Secondary — Phase 2 if coverage gaps remain",
        },
    }
    discover_form_factory(rows)
    inventory["chains_attempted"].append(
        {"brand": "Form Factory", "count": sum(1 for r in rows if r["brand"] == "Form Factory")}
    )
    discover_max_fitness(rows)
    inventory["chains_attempted"].append(
        {
            "brand": "Max Fitness",
            "count": sum(1 for r in rows if r["brand"] in ("Max Fitness", "Oktagon Gym")),
        }
    )
    discover_fitinn_cz(rows)
    inventory["chains_attempted"].append(
        {"brand": "FITINN", "count": sum(1 for r in rows if r["brand"] == "FITINN")}
    )
    write_json(OUT / "czechia_phase1_candidates.json", rows)
    write_json(OUT / "czechia_chain_inventory.json", inventory)
    print(f"Czechia candidates: {len(rows)}")


if __name__ == "__main__":
    main()
