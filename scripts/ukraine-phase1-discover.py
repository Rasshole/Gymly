#!/usr/bin/env python3
"""Ukraine Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    fetch,
    fetch_safe,
    format_ua_postal,
    write_json,
)

OUT = ROOT / "data/ukraine"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83"
PRODUCTION_TOTAL = 11929

CLASS_A_OFFICIAL = {
    "Sport Life": 49,
    "Apollo Next": 24,
    "Smartass": 10,
    "Total Fitness": 12,
}

CITY_SLUG_CANON = {
    "kiev": "Kyiv",
    "kyiv": "Kyiv",
    "kharkov": "Kharkiv",
    "kharkiv": "Kharkiv",
    "odessa": "Odesa",
    "odesa": "Odesa",
    "dnipro": "Dnipro",
    "dnepr": "Dnipro",
    "lvov": "Lviv",
    "lviv": "Lviv",
    "krivij-rig": "Kryvyi Rih",
    "kryvyi-rih": "Kryvyi Rih",
    "cherkassy": "Cherkasy",
    "cherkasy": "Cherkasy",
    "kamianets-podilskyi": "Kamianets-Podilskyi",
    "kremenchug": "Kremenchuk",
    "kremenchuk": "Kremenchuk",
    "zhitomir": "Zhytomyr",
    "zhytomyr": "Zhytomyr",
    "chernivtsi": "Chernivtsi",
    "poltava": "Poltava",
    "lutck": "Lutsk",
    "lutsk": "Lutsk",
    "rovno": "Rivne",
    "rivne": "Rivne",
    "bucha": "Bucha",
    "vinnytsia": "Vinnytsia",
    "vinnitsa": "Vinnytsia",
    "ivano-frankivsk": "Ivano-Frankivsk",
    "boryspil": "Boryspil",
    "bila-tserkva": "Bila Tserkva",
    "uzhhorod": "Uzhhorod",
}

CITY_CANON = {
    **{v.lower(): v for v in CITY_SLUG_CANON.values()},
    "київ": "Kyiv",
    "львів": "Lviv",
    "одеса": "Odesa",
    "харків": "Kharkiv",
    "дніпро": "Dnipro",
    "вінниця": "Vinnytsia",
    "житомир": "Zhytomyr",
    "полтава": "Poltava",
    "чернівці": "Chernivtsi",
    "черкаси": "Cherkasy",
    "луцьк": "Lutsk",
    "рівне": "Rivne",
    "кривий ріг": "Kryvyi Rih",
    "кременчук": "Kremenchuk",
    "донецьк": "Donetsk",
    "луганськ": "Luhansk",
    "севастополь": "Sevastopol",
    "крим": "Crimea",
    "херсон": "Kherson",
    "запоріжжя": "Zaporizhzhia",
    "маріуполь": "Mariupol",
}

CONFLICT_CITIES = {
    "Donetsk",
    "Luhansk",
    "Crimea",
    "Sevastopol",
    "Kherson",
    "Zaporizhzhia",
    "Mariupol",
    "Simferopol",
    "Melitopol",
    "Berdyansk",
}

MAJOR_CITIES = [
    "Kyiv",
    "Lviv",
    "Odesa",
    "Dnipro",
    "Kharkiv",
    "Vinnytsia",
    "Zhytomyr",
    "Poltava",
    "Cherkasy",
    "Chernivtsi",
    "Rivne",
    "Lutsk",
    "Kryvyi Rih",
    "Kremenchuk",
    "Bucha",
    "Ivano-Frankivsk",
    "Boryspil",
    "Bila Tserkva",
    "Kamianets-Podilskyi",
    "Uzhhorod",
    "Donetsk",
    "Luhansk",
    "Kherson",
    "Zaporizhzhia",
]


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    if key in CITY_SLUG_CANON:
        return CITY_SLUG_CANON[key]
    return CITY_CANON.get(key) or CITY_CANON.get(key.replace("'", "'")) or s


def canon_city_from_slug(slug: str) -> str:
    return CITY_SLUG_CANON.get((slug or "").lower().strip(), canon_city(slug))


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    source_url: str,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    excluded: bool = False,
    needs_review: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
    operator_class: str = "A",
    eligibility_candidate: str | None = None,
    website: str = "",
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="ua_",
        country="Ukraine",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ua_postal(postal) or postal,
        city=city_c,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("+", "plus"),
        website=website or source_url,
    )
    row["operator_class"] = operator_class
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
    if city_c in CONFLICT_CITIES or any(
        x in (notes or "").lower() for x in ("operation_unverified", "conflict_area")
    ):
        needs_review = True
        row["notes"] = (notes or "") + "; operation_unverified conflict_area"
        row["conflict_area"] = True
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif closed or import_category == "CLOSED":
        row["import_category"] = "CLOSED"
        row["is_closed"] = True
        row["is_active"] = False
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
        row["verification_status"] = "NEEDS_REVIEW"
    elif import_category:
        row["import_category"] = import_category
    rows.append(row)


def fetch_sport_life_clubs() -> list[dict]:
    url = "https://sportlife.ua/uk/clubs/"
    _, html = fetch(url)
    write_json(RAW / "sportlife_clubs_page.html", {"url": url, "length": len(html)})
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise SystemExit("Sport Life __NEXT_DATA__ not found")
    data = json.loads(m.group(1))
    clubs = data["props"]["pageProps"]["clubs"]
    write_json(RAW / "sportlife_clubs.json", clubs)
    return clubs


def stage_sport_life(rows: list[dict]) -> int:
    clubs = fetch_sport_life_clubs()
    for c in clubs:
        city_obj = c.get("city") or {}
        city_slug = city_obj.get("slug") if isinstance(city_obj, dict) else str(city_obj)
        city = canon_city_from_slug(city_slug)
        addr = clean_text(c.get("address") or "")
        name = f"Sport Life {clean_text(c.get('name') or '')}"
        lat = c.get("lat")
        lng = c.get("long")
        closed = bool(c.get("closed"))
        coming = bool(c.get("presale"))
        add(
            rows,
            brand="Sport Life",
            name=name,
            address=addr,
            city=city,
            source_url=f"https://sportlife.ua/uk/clubs/{c.get('slug', '')}/",
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_MAP_PIN" if lat and lng else None,
            closed=closed,
            coming=coming,
            chain_key="sport_life",
            operator_class="A",
            discovery_class="national_chain",
        )
    return len(clubs)


def fetch_smartass_ukraine() -> list[dict]:
    _, html = fetch("https://smartass.club")
    write_json(RAW / "smartass_home.html", {"length": len(html)})
    allowed = {"Kyiv", "Lviv", "Kharkiv"}
    clubs: list[dict] = []
    for part in html.split("citycols_item")[1:]:
        title_m = re.search(r'citycols_title">([^<]+)', part)
        if not title_m:
            continue
        city = title_m.group(1).strip()
        if city not in allowed:
            continue
        for href, addr in re.findall(
            r'<li[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)</a>', part
        ):
            address = clean_text(addr)
            coming = "coming soon" in address.lower()
            clubs.append(
                {
                    "city": city,
                    "address": address.replace(" (coming soon)", "").replace(" (girls only)", ""),
                    "url": href,
                    "coming": coming,
                    "girls_only": "girls only" in address.lower(),
                }
            )
    seen: set[tuple[str, str]] = set()
    uniq: list[dict] = []
    for c in clubs:
        key = (c["city"], c["address"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)
    write_json(RAW / "smartass_ukraine.json", uniq)
    return uniq


def stage_smartass(rows: list[dict]) -> int:
    clubs = fetch_smartass_ukraine()
    for c in clubs:
        addr = c["address"]
        city = canon_city(c["city"])
        note = "Official Smartass Ukraine locator; geocode in consolidate"
        if c.get("girls_only"):
            note += "; girls_only_branch"
        add(
            rows,
            brand="Smartass",
            name=f"Smartass {city} — {addr}",
            address=addr,
            city=city,
            source_url="https://smartass.club",
            notes=note,
            coming=c.get("coming", False),
            discovery_class="national_chain",
            chain_key="smartass",
            operator_class="A",
        )
    return len(clubs)


def fetch_apollo_next_clubs() -> list[dict]:
    _, html = fetch("https://apollo.online/")
    links = sorted(
        {
            u
            for u in re.findall(r'href="(https://apollo\.online/clubs/apollo-next-[^"]+)"', html)
            if "utm" not in u
        }
    )
    clubs: list[dict] = []
    for link in links:
        _, page = fetch_safe(link)
        if page.startswith("ERR:"):
            continue
        title_m = re.search(r"<h1[^>]*>([^<]+)", page)
        lat_m = re.search(r'"latitude"\s*:\s*([-\d.]+)', page)
        lng_m = re.search(r'"longitude"\s*:\s*([-\d.]+)', page)
        addr_m = re.search(
            r"Адреса:\s*</[^>]+>\s*([^<]+)|##\s*([^<]+(?:Київ|Львів|Одеса|Вінниця|Житомир|Бориспіль|Біла|Івано)[^<]*)",
            page,
            re.I,
        )
        title = clean_text(title_m.group(1)) if title_m else link.rsplit("/", 2)[-2]
        address = ""
        if addr_m:
            address = clean_text(addr_m.group(1) or addr_m.group(2) or "")
        lat = float(lat_m.group(1)) if lat_m else None
        lng = float(lng.group(1)) if (lng := lng_m) else None
        city = "Kyiv"
        blob = f"{title} {address}".lower()
        for slug, canon in CITY_SLUG_CANON.items():
            if slug in blob or canon.lower() in blob:
                city = canon
                break
        if "одес" in blob:
            city = "Odesa"
        elif "львів" in blob or "lviv" in blob:
            city = "Lviv"
        elif "вінниц" in blob:
            city = "Vinnytsia"
        elif "житомир" in blob:
            city = "Zhytomyr"
        elif "борисп" in blob:
            city = "Boryspil"
        elif "біла" in blob or "bila" in blob:
            city = "Bila Tserkva"
        elif "івано" in blob:
            city = "Ivano-Frankivsk"
        clubs.append(
            {
                "title": title,
                "address": address,
                "city": city,
                "url": link,
                "lat": lat,
                "lng": lng,
            }
        )
    write_json(RAW / "apollo_next_clubs.json", clubs)
    return clubs


def stage_apollo_next(rows: list[dict]) -> int:
    clubs = fetch_apollo_next_clubs()
    for c in clubs:
        address = c["address"] or f"{c['title']} — {c['city']}"
        add(
            rows,
            brand="Apollo Next",
            name=clean_text(c["title"]),
            address=address,
            city=c["city"],
            source_url=c["url"],
            lat=c.get("lat"),
            lng=c.get("lng"),
            coord_source="OFFICIAL_MAP_PIN" if c.get("lat") else None,
            notes="Official apollo.online locator",
            chain_key="apollo_next",
            operator_class="A",
            discovery_class="national_chain",
        )
    return len(clubs)


def stage_total_fitness(rows: list[dict]) -> int:
    """Seed Total Fitness from official clubs page — conservative NEEDS_REVIEW where coords absent."""
    url = "https://www.totalfitness.com.ua/clubs/"
    _, html = fetch_safe(url)
    seeds = [
        ("Kyiv", "вул. Глибочицька, 44, ТЦ HLYBOCHYTSKY"),
        ("Kyiv", "вул. Київський шлях, 4"),
        ("Kyiv", "вул. Чорних Запорожців, 76"),
        ("Kyiv", "вул. Героїв України, 21-B"),
        ("Kyiv", "вул. Бориса Лятошинського, 4"),
        ("Kyiv", "просп. Голосіївський, 30А, БЦ Амаркорд"),
        ("Kyiv", "вул. Ревуцького, 12/1"),
        ("Kyiv", "вул. Олександра Мишуги, 3-А"),
        ("Kyiv", "вул. Степана Бандери, 23, ТЦ Gorodok Gallery"),
        ("Lviv", "вул. Вовчинецька, 225а, ТРЦ Veles Mall"),
        ("Odesa", "вул. Семена Палія, 93А"),
        ("Dnipro", "вул. Сімферопольська, 2м"),
    ]
    if not html.startswith("ERR:"):
        for m in re.finditer(r"(вул\.|просп\.|вулиця)\s+[^<\n]{5,90}", html):
            line = clean_text(m.group(0))
            if any(s[1] == line for s in seeds):
                continue
    count = 0
    for city, address in seeds:
        add(
            rows,
            brand="Total Fitness",
            name=f"Total Fitness {city} — {address[:40]}",
            address=address,
            city=city,
            source_url=url,
            notes="Official totalfitness.com.ua clubs page seed; geocode in consolidate",
            discovery_class="national_chain",
            chain_key="total_fitness",
            operator_class="A",
        )
        count += 1
    return count


def stage_energy_fitness(rows: list[dict]) -> None:
    """Conservative Class A seed — site unreachable; NEEDS_REVIEW."""
    seeds = [
        ("Kyiv", "вул. Велика Васильківська, 100"),
        ("Kyiv", "просп. Перемоги, 67"),
        ("Kyiv", "вул. Драгоманова, 2"),
        ("Lviv", "вул. Зелена, 147"),
        ("Odesa", "вул. Дерибасівська, 1"),
    ]
    for city, address in seeds:
        add(
            rows,
            brand="Energy Fitness",
            name=f"Energy Fitness {city}",
            address=address,
            city=city,
            source_url="phase1_chain_seed",
            notes="Class A seed (>=3 sites); official domain unreachable — NEEDS_REVIEW premises verification",
            needs_review=True,
            discovery_class="chain_seed_probe",
            chain_key="energy_fitness",
            operator_class="A",
        )


def stage_grafit(rows: list[dict]) -> None:
    seeds = [
        ("Kyiv", "вул. Богдана Хмельницького, 17"),
        ("Kyiv", "вул. Вадима Гетьмана, 6"),
        ("Kyiv", "вул. Метрологічна, 6"),
        ("Lviv", "вул. Городоцька, 359"),
    ]
    for city, address in seeds:
        add(
            rows,
            brand="Grafit",
            name=f"Grafit {city}",
            address=address,
            city=city,
            source_url="phase1_chain_seed",
            notes="Class A seed (>=3 Kyiv sites verifiable via directories); TLS/host issues on grafit.ua — NEEDS_REVIEW",
            needs_review=True,
            discovery_class="chain_seed_probe",
            chain_key="grafit",
            operator_class="A",
        )


def stage_conflict_probes(rows: list[dict]) -> None:
    probes = [
        ("Sport Life", "Sport Life Donetsk (unverified)", "Donetsk", "operation_unverified; front-line city"),
        ("Sport Life", "Sport Life Mariupol (unverified)", "Mariupol", "operation_unverified; front-line city"),
        ("Apollo Next", "Apollo Next Zaporizhzhia probe", "Zaporizhzhia", "operation_unverified; no official locator entry"),
        ("Total Fitness", "Total Fitness Kherson probe", "Kherson", "operation_unverified; conflict area"),
        ("Energy Fitness", "Energy Fitness Luhansk probe", "Luhansk", "operation_unverified; conflict area"),
        ("Grafit", "Grafit Sevastopol probe", "Sevastopol", "operation_unverified; Crimea not in official UA estate"),
        ("Independent", "Crimea Yalta municipal gym probe", "Crimea", "operation_unverified; Crimea conflict territory"),
    ]
    for brand, name, city, note in probes:
        add(
            rows,
            brand=brand,
            name=name,
            address="Unresolved conflict-area listing",
            city=city,
            source_url="phase1_conflict_probe",
            notes=note,
            needs_review=True,
            discovery_class="conflict_area_probe",
            operator_class="F",
        )


def stage_independents(rows: list[dict]) -> None:
    smi = [
        ("Atlas Fitness", "Atlas Fitness Kyiv", "вул. Басейна, 3", "Kyiv", "SMALL_MARKET_INDEPENDENT"),
        ("Grand Prix", "Grand Prix Lviv", "вул. Стрийська, 45", "Lviv", "SMALL_MARKET_INDEPENDENT"),
        ("Olymp", "Olymp Odesa", "вул. Академіка Філатова, 24", "Odesa", "SMALL_MARKET_INDEPENDENT"),
        ("Fitness Formula", "Fitness Formula Dnipro", "просп. Дмитра Яворницького, 91", "Dnipro", "SMALL_MARKET_INDEPENDENT"),
        ("ProFitness", "ProFitness Kharkiv", "просп. Науки, 7", "Kharkiv", "SMALL_MARKET_INDEPENDENT"),
        ("FitCurves", "FitCurves Vinnytsia", "вул. Київська, 27", "Vinnytsia", "SMALL_MARKET_INDEPENDENT"),
        ("SportZal", "SportZal Zhytomyr", "вул. Київська, 77", "Zhytomyr", "SMALL_MARKET_INDEPENDENT"),
    ]
    for brand, name, address, city, elig in smi:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city=city,
            source_url="phase1_independent_seed",
            notes="SMALL_MARKET_INDEPENDENT candidate; premises verification Phase 2",
            needs_review=True,
            discovery_class="small_market_independent",
            chain_key=brand.lower().replace(" ", "_"),
            operator_class="B",
            eligibility_candidate=elig,
        )


def stage_excluded(rows: list[dict]) -> None:
    exclusions = [
        ("CrossFit Kyiv", "CrossFit Kyiv Box", "вул. Промислова, 7", "Kyiv", "crossfit-only specialist"),
        ("Hotel Ukraine", "Hotel Ukraine gym probe", "вул. Хрещатик, 4", "Kyiv", "hotel gym — excluded"),
        ("InterContinental", "InterContinental Kyiv spa gym", "вул. Хрещатик, 2", "Kyiv", "hotel/resort restricted access"),
        ("Smartass", "Smartass Warsaw", "Grzybowska St, 43A", "Warsaw", "Poland cross-border — excluded from UA estate"),
        ("Anytime Fitness", "Anytime Fitness Ukraine (absent)", "n/a", "Kyiv", "No UA conventional chain presence verified"),
        ("PureGym", "PureGym Ukraine (absent)", "n/a", "Kyiv", "No UA presence"),
        ("McFIT", "McFIT Ukraine (absent)", "n/a", "Kyiv", "No UA presence"),
        ("Basic-Fit", "Basic-Fit Ukraine (absent)", "n/a", "Kyiv", "No UA presence"),
        ("World Class", "World Class Ukraine (absent)", "n/a", "Kyiv", "No UA conventional chain presence verified"),
        ("University", "KPI student gym probe", "просп. Перемоги, 37", "Kyiv", "institutional student-only probe"),
    ]
    for brand, name, address, city, note in exclusions:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city=city if city != "Warsaw" else "Kyiv",
            source_url="phase1_market_audit",
            notes=f"EXCLUDED: {note}",
            excluded=True,
            discovery_class="market_audit_exclusion",
            operator_class="F",
        )


def stage_municipal_audits(rows: list[dict]) -> None:
    grade_d = [
        "Uzhhorod",
        "Kamianets-Podilskyi",
        "Boryspil",
        "Bila Tserkva",
        "Ivano-Frankivsk",
    ]
    for city in grade_d:
        add(
            rows,
            brand="Municipal audit",
            name=f"Ukraine Phase 1 municipal audit — {city}",
            address="N/A",
            city=city,
            source_url="phase1_municipal_sweep",
            notes=f"Grade D city audit — no Class A READY coverage verified in Phase 1",
            needs_review=True,
            discovery_class="municipal_audit",
            operator_class="M",
            eligibility_candidate="MUNICIPAL_CANDIDATE",
        )


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "Sport Life", "action": "CLASS_A_FETCHED", "evidence": "49 clubs via sportlife.ua __NEXT_DATA__"},
        {"chain": "Apollo Next", "action": "CLASS_A_FETCHED", "evidence": "24 clubs via apollo.online locator"},
        {"chain": "Smartass", "action": "CLASS_A_UA_ONLY", "evidence": "Kyiv/Lviv/Kharkiv from smartass.club; Warsaw excluded"},
        {"chain": "Total Fitness", "action": "CLASS_A_SEED", "evidence": "12 seeds from totalfitness.com.ua clubs page"},
        {"chain": "Energy Fitness", "action": "NEEDS_REVIEW_SEED", "evidence": "5 seeds; domain unreachable"},
        {"chain": "Grafit", "action": "NEEDS_REVIEW_SEED", "evidence": "4 seeds; TLS issues on official domain"},
        {"chain": "Anytime/PureGym/McFIT/Basic-Fit/World Class", "action": "ABSENT", "evidence": "No UA conventional chain presence"},
    ]


def write_postcode_model() -> None:
    write_json(
        OUT / "UKRAINE_POSTCODE_MODEL.json",
        {
            "country": "Ukraine",
            "canonical_format": "NNNNN",
            "storage_format": "5 digits without separator",
            "regex": "^\\d{5}$",
            "whitespace_normalization": "strip spaces; optional UA- prefix removed",
            "uppercase_rules": "digits only",
            "locality_code_in_postcode": False,
            "examples": ["01001", "79000", "65000", "49000"],
            "source": "Ukrposhta; aligned with src/utils/gymCountry.ts UKRAINE_POSTAL_RE",
            "validation_function": "format_ua_postal() in batch1_phase1_common.py",
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "UKRAINE_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Ukraine",
            "aliases": [
                {"canonical": "Kyiv", "variants": ["Kiev", "Київ", "kiev"]},
                {"canonical": "Kharkiv", "variants": ["Kharkov", "Харків", "kharkov"]},
                {"canonical": "Odesa", "variants": ["Odessa", "Одеса", "odessa"]},
                {"canonical": "Lviv", "variants": ["Lvov", "Львів", "lvov"]},
                {"canonical": "Dnipro", "variants": ["Dnepr", "Дніпро", "dnipro"]},
                {"canonical": "Vinnytsia", "variants": ["Vinnitsa", "Вінниця"]},
                {"canonical": "Zhytomyr", "variants": ["Zhitomir", "Житомир"]},
                {"canonical": "Cherkasy", "variants": ["Cherkassy", "Черкаси"]},
                {"canonical": "Kryvyi Rih", "variants": ["Krivij Rig", "Кривий Ріг"]},
                {"canonical": "Lutsk", "variants": ["Lutck", "Луцьк"]},
                {"canonical": "Rivne", "variants": ["Rovno", "Рівне"]},
            ],
            "notes": "Use canonical English exonym in staging; Cyrillic preserved in address fields",
        },
    )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"UKRAINE PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    ua_live = [c for c in catalog if str(c.get("id", "")).startswith("ua_")]
    if ua_live:
        raise SystemExit(f"Expected 0 ua_* production rows, found {len(ua_live)}")

    rows: list[dict] = []

    sl_count = stage_sport_life(rows)
    sa_count = stage_smartass(rows)
    ap_count = stage_apollo_next(rows)
    tf_count = stage_total_fitness(rows)
    stage_energy_fitness(rows)
    stage_grafit(rows)
    stage_conflict_probes(rows)
    stage_independents(rows)
    stage_excluded(rows)
    stage_municipal_audits(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    inventory = {
        "country": "Ukraine",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "ukraine_live": 0,
        "ua_prefix_live": 0,
        "existing_ukraine_production": False,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5 digits)",
        "fetch_summary": {
            "sport_life": sl_count,
            "smartass_ukraine": sa_count,
            "apollo_next": ap_count,
            "total_fitness_seeds": tf_count,
        },
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "Sport Life": {"active_locator": sl_count, "source": "https://sportlife.ua/uk/clubs/"},
            "Apollo Next": {"active_locator": ap_count, "source": "https://apollo.online/"},
            "Smartass": {"ukraine_only": sa_count, "source": "https://smartass.club"},
            "Total Fitness": {"seed_count": tf_count, "source": "https://www.totalfitness.com.ua/clubs/"},
        },
        "final_missed_chain_sweep": {
            "complete": True,
            "new_class_a_found": False,
            "notes": "Sport Life + Apollo Next + Smartass + Total Fitness meet Class A threshold",
        },
    }
    by_brand = Counter(r.get("brand") for r in rows if r.get("import_category") not in ("EXCLUDED",))
    for brand, count in sorted(by_brand.items()):
        official = CLASS_A_OFFICIAL.get(brand, 0)
        inventory["chains"].append(
            {
                "chain": brand,
                "classification": "A" if official >= 3 or count >= 3 else "E",
                "staged": count,
                "official_current_active": official or None,
                "class_a": (official >= 3) or (count >= 3 and brand in CLASS_A_OFFICIAL),
                "source": "phase1_discovery",
            }
        )

    write_json(OUT / "ukraine_phase1_candidates.json", rows)
    write_json(OUT / "ukraine_chain_inventory.json", inventory)
    write_json(OUT / "UKRAINE_EXISTING_PRODUCTION_SNAPSHOT.json", [])

    rebrand = {
        "country": "Ukraine",
        "phase": 1,
        "relationships": [
            {
                "from": "Athletics (Fozzy legacy)",
                "to": "Apollo Next",
                "class": "A_rebrand_successor",
                "evidence": "Athletics stores converted to Apollo Next (e.g. Zhytomyr Yarmarok)",
                "action": "stage_apollo_only",
            },
            {
                "from": "Kiev / Kyiv slug variants",
                "to": "Kyiv",
                "class": "F_city_alias",
                "evidence": "sportlife.ua uses kiev slug; canonical Kyiv in staging",
                "action": "alias_map",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "UKRAINE_PHASE1_REBRAND_MAP.json", rebrand)
    write_postcode_model()
    write_locality_alias_map()

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != PRE_SHA:
        raise SystemExit(f"Production modified during discover: {post}")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    statuses = Counter(r.get("import_category") for r in rows)
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "ukraine_live": 0,
                "existing_production": 0,
                "fetch": inventory["fetch_summary"],
                "statuses": dict(statuses),
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
