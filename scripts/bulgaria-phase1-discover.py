#!/usr/bin/env python3
"""Bulgaria Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
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
    format_bg_postal,
    write_json,
)

OUT = ROOT / "data/bulgaria"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840"

CITY_CANON = {
    "sofia": "Sofia",
    "софия": "Sofia",
    "plovdiv": "Plovdiv",
    "пловдив": "Plovdiv",
    "varna": "Varna",
    "варна": "Varna",
    "burgas": "Burgas",
    "бургас": "Burgas",
    "ruse": "Ruse",
    "русе": "Ruse",
    "stara zagora": "Stara Zagora",
    "стара загора": "Stara Zagora",
    "pleven": "Pleven",
    "плевен": "Pleven",
    "sliven": "Sliven",
    "сливен": "Sliven",
    "dobrich": "Dobrich",
    "добрич": "Dobrich",
    "shumen": "Shumen",
    "шумен": "Shumen",
    "pernik": "Pernik",
    "перник": "Pernik",
    "haskovo": "Haskovo",
    "хасково": "Haskovo",
    "yambol": "Yambol",
    "ямбол": "Yambol",
    "veliko tarnovo": "Veliko Tarnovo",
    "велико търново": "Veliko Tarnovo",
    "blagoevgrad": "Blagoevgrad",
    "благоевград": "Blagoevgrad",
    "kardzhali": "Kardzhali",
    "кърджали": "Kardzhali",
    "sveti vlas": "Sveti Vlas",
    "свети влас": "Sveti Vlas",
    "bansko": "Bansko",
    "банско": "Bansko",
    "velingrad": "Velingrad",
    "велинград": "Velingrad",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    return CITY_CANON.get(key, s)


def cached(url: str, name: str, timeout: int = 30) -> str:
    path = PAGES / name
    if path.exists() and path.stat().st_size > 500:
        return path.read_text(encoding="utf-8", errors="replace")
    time.sleep(0.4)
    return curl_fetch(url, path, timeout=timeout)


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    excluded: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
) -> None:
    row = base_row(
        prefix="bg_",
        country="Bulgaria",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_bg_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        chain_key=brand.lower().replace(" ", "_").replace("&", "and"),
        discovery_class=discovery_class,
    )
    if excluded:
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    rows.append(row)


# ---------------------------------------------------------------------------
# Official curated estates (from fetched official locator pages)
# ---------------------------------------------------------------------------

PULSE_ELIGIBLE = [
    # Sofia
    ("Pulse Bulgaria", "Manastirski Livadi district, 132 Bulgaria Blvd.", "Sofia", "1303", "https://pulsefit.bg/en/klubove/pulse-bulgaria-manastirski-livadi/"),
    ("Pulse Mladost", "Ring Road 251A", "Sofia", "1715", "https://pulsefit.bg/en/klubove/pulse-mladost/"),
    ("Pulse Platinum", "47 Rezbarska Street", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-platinum/"),
    ("Pulse West Park", "60 Petar Dertliev Blvd.", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-west-park/"),
    ("Pulse Arena", "Vinarovo Kolelo, 4th km", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-arena-4-km-czarigradsko-shose/"),
    ("Pulse Vitosha", "102 Simeonovsko Shose Boulevard", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-vitosha-studentski-grad/"),
    ("Pulse Serdika Center", "48 Sitnyakovo Blvd., 3rd floor", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-serdika-center/"),
    ("Pulse Energy", "214 Okolovrasten Pat Str.", "Sofia", "1434", "https://pulsefit.bg/en/klubove/pulse-energy-hyrox-training-club/"),
    ("Pulse Mall of Sofia", "101 A Alexander Stamboliyski Blvd.", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-mall-of-sofia/"),
    ("Pulse Downtown", "8 St. Sofia Str.", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-downtown/"),
    ("Pulse Ovcha Kupel", "Ovcha Kupel", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-ovcha-kupel/"),
    ("Pulse Lyulin", "Blvd. Tsaritsa Ioana, bl 276", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-lyulin/"),
    ("Pulse Drujba", "Drujba", "Sofia", "", "https://pulsefit.bg/en/klubove/pulse-drujba/"),
    # Plovdiv / Burgas / Stara Zagora / Sveti Vlas / Kardzhali
    ("Pulse Grand Plovdiv", "Academic Plovdiv Center, 4 Asenovgradsko Shose Blvd.", "Plovdiv", "4232", "https://pulsefit.bg/en/klubove/pulse-grand-plovdiv/"),
    ("Pulse Plovdiv", "63 Tsanko Dyustabanov Street", "Plovdiv", "4000", "https://pulsefit.bg/en/klubove/pulse-plovdiv/"),
    ("Pulse Galleria Burgas", "6 Yanko Komitov Blvd., Mall Galleria Burgas, level 2", "Burgas", "8001", "https://pulsefit.bg/en/klubove/pulse-galleria-burgas/"),
    ("Pulse Kim Center Burgas", "Baba Ganka Street", "Burgas", "8000", "https://pulsefit.bg/en/klubove/pulse-kim-centre-burgas/"),
    ("Pulse Vital Burgas", "Zornitsa complex 75, ground floor", "Burgas", "", "https://pulsefit.bg/en/klubove/pulse-vital-burgas/"),
    ("Pulse Stara Zagora", "28 Prince Alexander Battenberg Blvd.", "Stara Zagora", "6002", "https://pulsefit.bg/en/klubove/pulse-stara-zagora/"),
    ("Pulse Sveti Vlas", "4 Lyulin Street, Yurta", "Sveti Vlas", "8240", "https://pulsefit.bg/en/klubove/pulse-sveti-vlas/"),
    ("Pulse Kardzhali", "46 Republikanska Street", "Kardzhali", "", "https://pulsefit.bg/en/klubove/pulse-kardzhali/"),
]

PULSE_EXCLUDED = [
    ("Pulse Therme", "Grand Hotel Therme", "Bulgaria", "hotel-only gym", "https://pulsefit.bg/en/klubove/pulse-therme/"),
    ("Pulse Therme Bansko", "Grand Hotel Bansko, 5 Glazne St", "Bansko", "hotel-only gym", "https://pulsefit.bg/en/klubove/pulse-therme-bansko/"),
    ("Pulse Royal Hotel Plovdiv", 'ul. "Ivan Vazov" 55', "Plovdiv", "hotel-only gym", "https://pulsefit.bg/en/klubove/pulse-royal-hotel-plovdiv/"),
    ("Pulse Royal Hotel Velingrad", "3 Tsar Samuil Street, Ladzhene District", "Velingrad", "hotel-only gym", "https://pulsefit.bg/en/klubove/pulse-royal-hotel-velingrad/"),
    ("Pulse Atlantis", 'st. "Leninova" 44', "Strumica", "foreign — North Macedonia", "https://pulsefit.bg/en/klubove/pulse-atlantis/"),
]

NEXT_LEVEL = [
    ("Next Level Bulgaria Mall", "Bulgaria Mall, 69 Bulgaria Blvd", "Sofia", "1618", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Druzhba", "blvd. Professor Tzvetan Lazarov 113", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Fohar", 'ul. "Kumata" 77', "Sofia", "1616", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Galaxy", "18 Shipchenski prohod blvd.", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Grand Plaza Burgas", "31 Transportna Blvd", "Burgas", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Hadzhi Dimitar", "5 Rezbarska Street", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Iztok", "g.k. Iztok, 2 Nikolai Haytov St", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Knyazhevo", "bul. Tsar Boris III 272", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Krasna Polyana", "Dobrotich str., block 329A", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Lozenets", 'Lozenets district, 44 "Zlatovrah" str, block 66', "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Lyulin", "Lulin 10, 25 Petur Dertliev blvd. (Labirint Center)", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Lyulin 5", 'Lyulin 5, block 550 / bul. "Doctor Peter Dertliev" 103', "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Maxi", "Kv. Vitosha, Simeonovsko Shose 110", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Mladost", "Mladost 4, 5 Atanas Moskov str", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Mladost 1", "Mladost 1, Jerusalem Str. 1, 2nd floor", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Nadezhda", "97A Yordan Hadzhikonstantinov-Dzhinot St.", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level NDK", "1 Bulgaria Sq., National Palace of Culture", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level New Wave", "18 Hristo Botev Boulevard", "Varna", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Okolovrasten pat", "Kinotsentara III chast Vitosha, lane Okolovrasten pat", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Ovcha Kupel", "114 President Lincoln blvd.", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Park Center", "2 Arsenalski Blvd., Park Center", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Pernik", "Pernik", "Pernik", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Plovdiv Plaza", "3 Dr. Georgi Stranski Str", "Plovdiv", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Retail Park Varna", "Retail Park Varna", "Varna", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Ruski pametnik", '30-32 "General Eduard I. Totleben" Blvd.', "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Smirnenski", "158 Peshtersko Shose Blvd.", "Plovdiv", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Sport Box", "35 Simeonovsko shose blvd.", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level The Mall", "115 Tsarigradsko Shose Blvd., The Mall", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
    ("Next Level Zaimov", "Oborishte district, 2 Trakia St", "Sofia", "", "https://www.nextlevelclub.bg/en/clubs/"),
]

ATHLETIC = [
    ("Athletic Yanko Sakazov", "78 Yanko Sakazov Blvd.", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Nikolai Kopernik", "21 Nikolai Kopernik Str.", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Slivnitsa", "228 Slivnitsa Blvd.", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Sopharma Towers", "5 Lachezar Stanchev Str., Sopharma Business Towers, Tower A, fl. 2", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Cherni Vrah", "47 Cherni vrah Blvd.", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Mega Mall", "15 Tsaritsa Yoanna Blvd., Mega Mall, fl. 2", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Yordan Yosifov", "1 Yordan Yosifov Str.", "Sofia", "", "https://athletic.bg/athletic/"),
    ("Athletic Plovdiv Plaza", "3 Dr. Georgi Stranski Str., Mall Plovdiv Plaza, fl. 2", "Plovdiv", "", "https://athletic.bg/athletic/"),
    ("Athletic Markovo Tepe", "52-54 Ruski Blvd., Mall Markovo tepe, fl. 3", "Plovdiv", "", "https://athletic.bg/athletic/"),
    ("Athletic Galleria Stara Zagora", "30 Han Asparuh Str., Mall Galleria Stara Zagora, fl. 2", "Stara Zagora", "", "https://athletic.bg/athletic/"),
]

HAMMER = [
    ("Hammer Gym Platinum", "4 George Washington str.", "Sofia", "", "https://hammergym.eu/gyms/"),
    ("Hammer Gym Manastirski Livadi", "7 Mur str., Manastirski Livadi", "Sofia", "", "https://hammergym.eu/gyms/"),
    ("Hammer Gym Beli Brezi", "76 Nishava str. (corner with Solun str.)", "Sofia", "", "https://hammergym.eu/gyms/"),
    ("Hammer Gym Krasno Selo", "9 Tsaritsa Eleonora str.", "Sofia", "", "https://hammergym.eu/gyms/"),
    ("Hammer Gym Ovcha Kupel", "Ovcha Kupel", "Sofia", "", "https://hammergym.eu/gyms/hammer-gym-ovcha-kupel/" if False else "https://hammergym.eu/gyms/"),
]

FLAIS_PAGES = [
    ("Flais Hadzhi Dimitar", "https://www.flaisfitness.bg/en/premium-fitess-flais-hadji-dimitar/"),
    ("Flais Alera", "https://www.flaisfitness.bg/en/premium-fitness-alera/"),
    ("Flais Central Park", "https://www.flaisfitness.bg/en/premium-fitness-central-park/"),
    ("Flais Nadezhda", "https://www.flaisfitness.bg/en/premium-fitness-nadezhda/"),
    ("Flais Sky City", "https://www.flaisfitness.bg/en/premium-fitness-sky-city/"),
    ("Flais Mladost 1", "https://www.flaisfitness.bg/en/premium-fitness-mladost-1/"),
    ("Flais Amaya", "https://www.flaisfitness.bg/en/premium-fitness-amaia/"),
    ("Flais Millennium", "https://www.flaisfitness.bg/en/fitnes-milenium/"),
    ("Flais Krasna Polyana", "https://www.flaisfitness.bg/en/fitnes-krasna-polyana/"),
    ("Flais Veslec", "https://www.flaisfitness.bg/en/premium-fitnes-veslec/"),
    ("Flais Strelbishte", "https://www.flaisfitness.bg/en/fitnes-strelbishte/"),
    ("Flais Manastirski Livadi", "https://www.flaisfitness.bg/en/fitnes-manastirski-livadi/"),
    ("Flais Knyazhevo", "https://www.flaisfitness.bg/en/fitness-knyazhevo/"),
    ("Flais Mladost", "https://www.flaisfitness.bg/en/fitnes-mladost/"),
]

TITANIUM_PAGES = [
    ("Titanium Mladost 1", "https://fitnesstitanium.bg/klubove/titanium-fitness-младост-1/"),
    ("Titanium Studentski Grad", "https://fitnesstitanium.bg/klubove/titanium-fitness-студентски-град/"),
    ("Titanium Ivan Vazov", "https://fitnesstitanium.bg/klubove/titanium-fitness-иван-вазов/"),
    ("Titanium Slatina", "https://fitnesstitanium.bg/klubove/titanium-fitness-слатина/"),
    ("Titanium Lyulin", "https://fitnesstitanium.bg/klubove/titanium-fitness-люлин/"),
    ("Titanium Mladost 3", "https://fitnesstitanium.bg/klubove/titanium-fitness-младост/"),
]


def enrich_from_page(url: str, fname: str) -> tuple[str, str, str, float | None, float | None]:
    """Return address, postal, city, lat, lng best-effort from club page."""
    try:
        html = cached(url, fname)
    except Exception:
        return "", "", "", None, None
    geo = extract_geo_from_html(html)
    lat = lng = None
    if geo:
        try:
            lat, lng = float(geo[0]), float(geo[1])
        except (TypeError, ValueError, IndexError):
            lat = lng = None
    plain = re.sub(r"<[^>]+>", " ", html)
    plain = re.sub(r"\s+", " ", plain)
    postal = ""
    m = re.search(r"\b(\d{4})\b(?:\s*(?:Sofia|София|Plovdiv|Пловдив|Varna|Варна|Burgas|Бургас))?", plain)
    # Prefer 4-digit near Sofia/city
    for m2 in re.finditer(
        r"(?:Sofia|София|Plovdiv|Пловдив|Varna|Варна|Burgas|Бургас|Stara Zagora|Стара Загора)[^\d]{0,40}(\d{4})",
        plain,
        re.I,
    ):
        postal = m2.group(1)
        break
    if not postal and m:
        # avoid phone fragments — Bulgarian mobiles start 08/09
        cand = m.group(1)
        if not cand.startswith("08") and not cand.startswith("09"):
            postal = cand
    address = ""
    m_addr = re.search(
        r"(?:Address|Адрес|Located at|на адрес)[:\s]+([^.]{10,120})",
        plain,
        re.I,
    )
    if m_addr:
        address = clean_text(m_addr.group(1))
    city = ""
    for c in ("Sofia", "София", "Plovdiv", "Varna", "Burgas", "Pernik", "Stara Zagora"):
        if re.search(rf"\b{re.escape(c)}\b", plain, re.I):
            city = "Sofia" if c in ("Sofia", "София") else c
            break
    return address, postal, city, lat, lng


def discover_flais(rows: list[dict]) -> None:
    for name, url in FLAIS_PAGES:
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower())
        addr, postal, city, lat, lng = enrich_from_page(url, f"flais_{slug}.html")
        if not addr:
            # fallback: name-only stub needing review
            addr = name.replace("Flais ", "") + " club, Sofia"
            notes = "official_location_page; address incomplete — Phase 2"
        else:
            notes = "official_flais_location_page"
        add(
            rows,
            brand="Flais Fitness",
            name=name,
            address=addr or "Sofia",
            city=city or "Sofia",
            postal=postal,
            source_url=url,
            notes=notes,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_PAGE_EMBED" if lat is not None else None,
            discovery_class="national_chain",
        )


def discover_titanium(rows: list[dict]) -> None:
    # Curated addresses from contacts / known club pages when fetch fails
    curated = {
        "Titanium Mladost 1": ("Mladost 1, Sofia", "Sofia"),
        "Titanium Studentski Grad": ("Studentski Grad, Sofia", "Sofia"),
        "Titanium Ivan Vazov": ("Ivan Vazov district, Sofia", "Sofia"),
        "Titanium Slatina": ("Slatina, Sofia", "Sofia"),
        "Titanium Lyulin": ("Lyulin, Sofia", "Sofia"),
        "Titanium Mladost 3": ("Mladost 3, Sofia", "Sofia"),
    }
    for name, url in TITANIUM_PAGES:
        slug = hashlib.md5(url.encode()).hexdigest()[:10]
        addr, postal, city, lat, lng = enrich_from_page(url, f"titanium_{slug}.html")
        if not addr:
            addr, city = curated.get(name, (name, "Sofia"))
            notes = "official_club_nav; street address incomplete — Phase 2"
        else:
            notes = "official_titanium_club_page"
        add(
            rows,
            brand="Titanium Fitness",
            name=name,
            address=addr,
            city=city or "Sofia",
            postal=postal,
            source_url=url,
            notes=notes,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_PAGE_EMBED" if lat is not None else None,
        )


def enrich_pulse_pages(rows_pulse_meta: list[tuple]) -> None:
    """Fetch individual Pulse pages to recover missing postcodes/addresses."""
    pass  # meta already has strongest listing addresses


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"Production SHA drift: {PRE_SHA} != {EXPECTED_SHA}")

    rows: list[dict] = []

    for name, addr, city, postal, url in PULSE_ELIGIBLE:
        notes = "official_pulsefit_clubs_listing"
        if len(addr) < 12 or addr in ("Ovcha Kupel", "Drujba"):
            notes += "; thin_address_needs_page_enrichment"
        add(
            rows,
            brand="Pulse Fitness",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes=notes,
        )

    for name, addr, city, reason, url in PULSE_EXCLUDED:
        add(
            rows,
            brand="Pulse Fitness",
            name=name,
            address=addr,
            city=city if city != "Strumica" else "Strumica",
            postal="",
            source_url=url,
            notes=f"EXCLUDED: {reason}",
            excluded=True,
            discovery_class="excluded_hotel_or_foreign",
        )
        # Force country note for foreign
        if "Macedonia" in reason or city == "Strumica":
            rows[-1]["country"] = "North Macedonia"
            rows[-1]["notes"] += "; foreign_location"

    for name, addr, city, postal, url in NEXT_LEVEL:
        notes = "official_nextlevelclub_clubs_listing"
        if city in ("Pernik", "Varna") and ("Pernik" == addr or "Retail Park" in addr):
            notes += "; thin_address_needs_page_enrichment"
        add(
            rows,
            brand="Next Level Fitness",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes=notes,
        )

    for name, addr, city, postal, url in ATHLETIC:
        add(
            rows,
            brand="Athletic Fitness",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes="official_athletic_bg_listing",
        )

    for name, addr, city, postal, url in HAMMER:
        notes = "official_hammergym_eu_gyms"
        if addr == "Ovcha Kupel":
            notes += "; thin_address_needs_page_enrichment"
        add(
            rows,
            brand="Hammer Gym",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes=notes,
        )

    discover_flais(rows)
    discover_titanium(rows)

    # Seed brands investigated → EXCLUDED / no multi-site evidence
    inventory_exclusions = [
        ("West Gym", "Not confirmed as multi-location conventional chain with official locator", "https://www.google.com/search?q=West+Gym+Bulgaria+fitness"),
        ("Orange Fitness", "No verified multi-location official Bulgarian locator in Phase 1 scan", ""),
        ("Fit City", "Insufficient official multi-site evidence", ""),
        ("Max Fitness", "MaxFit Sports appears boutique/limited — not confirmed >=3 conventional sites", ""),
        ("Fitness 1", "No verified Bulgarian multi-location estate", ""),
        ("Energy Sport", "No verified national chain locator", ""),
        ("Platinum Health Club", "Likely Pulse Platinum brand confusion / not separate chain", ""),
        ("Fitness First", "No current Bulgaria conventional clubs found", ""),
        ("Anytime Fitness", "No current Bulgaria conventional clubs found", ""),
        ("clever fit", "No current Bulgaria conventional clubs found", ""),
        ("FITINN", "No current Bulgaria conventional clubs found", ""),
        ("McFIT", "No current Bulgaria conventional clubs found", ""),
        ("JOHN REED", "No current Bulgaria conventional clubs found", ""),
        ("Gold's Gym", "No current Bulgaria conventional clubs found", ""),
        ("World Class", "No current Bulgaria conventional clubs found", ""),
    ]
    for brand, reason, url in inventory_exclusions:
        add(
            rows,
            brand=brand,
            name=f"{brand} (market audit)",
            address="n/a",
            city="Sofia",
            postal="",
            source_url=url or "phase1_market_audit",
            notes=f"EXCLUDED_OPERATOR: {reason}",
            excluded=True,
            discovery_class="market_audit_exclusion",
        )

    # Deduplicate by id
    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    candidates = list(by_id.values())

    write_json(OUT / "bulgaria_phase1_candidates.json", candidates)
    write_json(
        PHASE1 / "discovery_meta.json",
        {
            "production_sha_before": PRE_SHA,
            "candidate_count": len(candidates),
            "brands": sorted({r["brand"] for r in candidates}),
        },
    )
    print(json.dumps({"candidates": len(candidates), "sha": PRE_SHA}, indent=2))


if __name__ == "__main__":
    main()
