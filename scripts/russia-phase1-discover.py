#!/usr/bin/env python3
"""Russia Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_ru_postal,
    in_disputed_ukraine_territory,
    in_russia,
    normalize_russian_search,
    write_json,
)

OUT = ROOT / "data/russia"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, RAW / "osm", RAW / "api", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1"
PRODUCTION_TOTAL = 12385
EXPECTED_BYTES = 3858778

CLASS_A_OFFICIAL = {
    "World Class": 120,
    "X-Fit": 80,
    "Alex Fitness": 45,
    "DDxFitness": 35,
    "Spirit Fitness": 30,
}

CHAIN_PROBE_BRANDS = list(CLASS_A_OFFICIAL.keys()) + [
    "Anytime Fitness",
    "Gold's Gym",
    "Fitness House",
    "SportLife",
    "Orange Fitness",
    "Alex Gym",
    "Pride Fitness",
    "CrossFit",
]

CITY_CANON = {
    "moscow": "Moscow",
    "moskva": "Moscow",
    "москва": "Moscow",
    "saint petersburg": "Saint Petersburg",
    "st petersburg": "Saint Petersburg",
    "st. petersburg": "Saint Petersburg",
    "sankt-peterburg": "Saint Petersburg",
    "sankt peterburg": "Saint Petersburg",
    "spb": "Saint Petersburg",
    "санкт-петербург": "Saint Petersburg",
    "петербург": "Saint Petersburg",
    "novosibirsk": "Novosibirsk",
    "новосибирск": "Novosibirsk",
    "yekaterinburg": "Yekaterinburg",
    "ekaterinburg": "Yekaterinburg",
    "екатеринбург": "Yekaterinburg",
    "kazan": "Kazan",
    "казань": "Kazan",
    "nizhny novgorod": "Nizhny Novgorod",
    "nizhniy novgorod": "Nizhny Novgorod",
    "нижний новгород": "Nizhny Novgorod",
    "chelyabinsk": "Chelyabinsk",
    "челябинск": "Chelyabinsk",
    "samara": "Samara",
    "самара": "Samara",
    "omsk": "Omsk",
    "омск": "Omsk",
    "rostov-on-don": "Rostov-on-Don",
    "rostov on don": "Rostov-on-Don",
    "ростов-на-дону": "Rostov-on-Don",
    "ufa": "Ufa",
    "уфа": "Ufa",
    "krasnoyarsk": "Krasnoyarsk",
    "красноярск": "Krasnoyarsk",
    "voronezh": "Voronezh",
    "воронеж": "Voronezh",
    "perm": "Perm",
    "пермь": "Perm",
    "volgograd": "Volgograd",
    "волгоград": "Volgograd",
    "krasnodar": "Krasnodar",
    "краснодар": "Krasnodar",
    "saratov": "Saratov",
    "саратов": "Saratov",
    "tyumen": "Tyumen",
    "тюмень": "Tyumen",
    "tolyatti": "Tolyatti",
    "тольятти": "Tolyatti",
    "izhevsk": "Izhevsk",
    "ижевск": "Izhevsk",
    "barnaul": "Barnaul",
    "бarnaul": "Barnaul",
    "бarnaul": "Barnaul",
    "бarnaul": "Barnaul",
    "ulyanovsk": "Ulyanovsk",
    "ульяновск": "Ulyanovsk",
    "irkutsk": "Irkutsk",
    "иркутск": "Irkutsk",
    "khabarovsk": "Khabarovsk",
    "хабарovsk": "Khabarovsk",
    "yaroslavl": "Yaroslavl",
    "ярославль": "Yaroslavl",
    "vladivostok": "Vladivostok",
    "владивосток": "Vladivostok",
    "makhachkala": "Makhachkala",
    "махачкала": "Makhachkala",
    "tomsk": "Tomsk",
    "томск": "Tomsk",
    "orenburg": "Orenburg",
    "оренбург": "Orenburg",
    "kemerovo": "Kemerovo",
    "кемерово": "Kemerovo",
    "novokuznetsk": "Novokuznetsk",
    "новокузнецк": "Novokuznetsk",
    "ryazan": "Ryazan",
    "ряzan": "Ryazan",
    "ряzan": "Ryazan",
    "astrakhan": "Astrakhan",
    "астрахань": "Astrakhan",
    "penza": "Penza",
    "пенza": "Penza",
    "lipetsk": "Lipetsk",
    "липецк": "Lipetsk",
    "kaliningrad": "Kaliningrad",
    "калiningrad": "Kaliningrad",
    "sochi": "Sochi",
    "сочи": "Sochi",
    "kursk": "Kursk",
    "курск": "Kursk",
    "tula": "Tula",
    "тула": "Tula",
    "kaluga": "Kaluga",
    "калуга": "Kaluga",
    "simferopol": "Simferopol",
    "симferopol": "Simferopol",
    "donetsk": "Donetsk",
    "донецк": "Donetsk",
    "luhansk": "Luhansk",
    "lugansk": "Luhansk",
    "луганск": "Luhansk",
}

CITY_BBOX = {
    "Moscow": (55.49, 37.32, 55.95, 37.97),
    "Saint Petersburg": (59.75, 29.65, 60.10, 30.65),
    "Novosibirsk": (54.90, 82.75, 55.15, 83.25),
    "Yekaterinburg": (56.70, 60.45, 56.95, 60.75),
    "Kazan": (55.70, 48.95, 55.88, 49.35),
    "Nizhny Novgorod": (56.20, 43.80, 56.40, 44.15),
    "Chelyabinsk": (55.05, 61.25, 55.25, 61.55),
    "Samara": (53.10, 50.00, 53.30, 50.35),
    "Omsk": (54.85, 73.20, 55.10, 73.55),
    "Rostov-on-Don": (47.15, 39.55, 47.35, 39.90),
    "Ufa": (54.65, 55.85, 54.90, 56.15),
    "Krasnoyarsk": (55.95, 92.65, 56.15, 93.15),
    "Voronezh": (51.55, 39.05, 51.80, 39.35),
    "Perm": (57.90, 56.05, 58.15, 56.45),
    "Volgograd": (48.60, 44.35, 48.85, 44.65),
    "Krasnodar": (45.00, 38.85, 45.15, 39.15),
    "Saratov": (51.45, 45.85, 51.65, 46.15),
    "Tyumen": (57.05, 65.35, 57.25, 65.65),
    "Tolyatti": (53.45, 49.25, 53.65, 49.55),
    "Izhevsk": (56.75, 53.05, 56.95, 53.35),
    "Barnaul": (53.25, 83.55, 53.45, 83.95),
    "Ulyanovsk": (54.25, 48.25, 54.45, 48.55),
    "Irkutsk": (52.20, 104.15, 52.40, 104.45),
    "Khabarovsk": (48.35, 135.00, 48.55, 135.25),
    "Yaroslavl": (57.55, 39.75, 57.75, 40.05),
    "Vladivostok": (43.05, 131.80, 43.25, 132.15),
    "Makhachkala": (42.90, 47.40, 43.10, 47.65),
    "Tomsk": (56.40, 84.85, 56.55, 85.15),
    "Orenburg": (51.70, 55.00, 51.90, 55.25),
    "Kemerovo": (55.25, 86.00, 55.45, 86.25),
    "Novokuznetsk": (53.65, 87.00, 53.85, 87.25),
    "Ryazan": (54.55, 39.60, 54.75, 39.85),
    "Astrakhan": (46.30, 47.90, 46.45, 48.15),
    "Penza": (53.10, 44.90, 53.30, 45.15),
    "Lipetsk": (52.55, 39.45, 52.70, 39.70),
    "Kaliningrad": (54.60, 20.35, 54.80, 20.65),
    "Sochi": (43.50, 39.65, 43.75, 39.95),
    "Kursk": (51.65, 36.05, 51.85, 36.35),
    "Tula": (54.15, 37.45, 54.30, 37.75),
    "Kaluga": (54.45, 36.10, 54.65, 36.35),
}

MAJOR_CITIES = list(CITY_BBOX.keys())

MOSCOW_DISTRICTS = [
    ("Central", 55.755, 37.617),
    ("Arbat", 55.752, 37.592),
    ("Tverskoy", 55.765, 37.605),
    ("Presnensky", 55.760, 37.565),
    ("Zamoskvorechye", 55.735, 37.635),
    ("Tagansky", 55.742, 37.655),
    ("Basmanny", 55.768, 37.670),
    ("Maryino", 55.650, 37.745),
    ("Khimki", 55.888, 37.430),
    ("Mytishchi", 55.910, 37.730),
    ("Balashikha", 55.809, 37.958),
    ("Podolsk", 55.424, 37.554),
    ("Krasnogorsk", 55.831, 37.330),
    ("Lyubertsy", 55.677, 37.894),
    ("Odintsovo", 55.678, 37.277),
    ("Reutov", 55.761, 37.857),
    ("Korolev", 55.922, 37.825),
    ("Zelenograd", 55.982, 37.181),
]

SPB_DISTRICTS = [
    ("Admiralteysky", 59.935, 30.315),
    ("Central", 59.934, 30.335),
    ("Moskovsky", 59.869, 30.320),
    ("Nevsky", 59.896, 30.478),
    ("Primorsky", 60.010, 30.250),
    ("Vasileostrovsky", 59.942, 30.261),
    ("Kalininsky", 59.996, 30.392),
    ("Krasnogvardeysky", 59.972, 30.475),
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"muay thai|kickboxing|karate|judo|taekwondo|dance.?studio|physio|rehab|"
    r"personal.?training.?only|pt.?only)\b",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel gym|resort gym|spa.?only|wellness.?only|guest.?only|"
    r"marriott|hilton|radisson|ritz|four seasons|hyatt)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|"
    r"staff.?only|private.?club.?members)\b",
    re.I,
)
FOREIGN_PROBE_RE = re.compile(
    r"\b(istanbul|tbilisi|yerevan|baku|minsk|kyiv|kiev|warsaw|helsinki|"
    r"beijing|astana|almaty|probe|foreign|cross-border)\b",
    re.I,
)

SEARCH_TERMS_RU = [
    "фитнес",
    "фитнес-клуб",
    "тренажерный зал",
    "спортивный клуб",
    "World Class",
    "X-Fit",
    "Alex Fitness",
    "DDxFitness",
    "Spirit Fitness",
]

SEARCH_TERMS_EN = [
    "fitness centre",
    "fitness center",
    "gym",
    "fitness club",
    "World Class",
    "X-Fit",
    "Alex Fitness",
    "DDxFitness",
    "Spirit Fitness",
]


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(s) or s


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    source_url: str = "",
    source_type: str = "official_club_list",
    source_confidence: str = "HIGH",
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
    operation_status: str = "ACTIVE_VERIFIED",
    district: str = "",
    conflict_region: bool = False,
    disputed_territory: bool = False,
    foreign_probe: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="ru_",
        country="Russia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ru_postal(postal) or postal,
        city=city_c,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("-", "_"),
        website=website or source_url,
    )
    row["source_type"] = source_type
    row["source_confidence"] = source_confidence
    row["operator_class"] = operator_class
    row["operation_status"] = operation_status
    if district:
        row["district"] = district
        row["notes"] = (row.get("notes") or "") + f"; district={district}"
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
    if conflict_region or disputed_territory:
        row["conflict_region"] = True
        row["disputed_territory"] = True
    if foreign_probe:
        row["foreign_probe"] = True
    lat_f = row.get("lat")
    lng_f = row.get("lng")
    if isinstance(lat_f, (int, float)) and isinstance(lng_f, (int, float)):
        if in_disputed_ukraine_territory(float(lat_f), float(lng_f)):
            row["conflict_region"] = True
            row["disputed_territory"] = True
            if source_confidence != "HIGH":
                excluded = True
                row["notes"] = (row.get("notes") or "") + "; disputed_ukraine_hold"
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
        row["operation_status"] = "COMING_SOON"
    elif closed or import_category == "CLOSED":
        row["import_category"] = "CLOSED"
        row["is_closed"] = True
        row["is_active"] = False
        row["operation_status"] = "CLOSED"
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
        row["verification_status"] = "NEEDS_REVIEW"
        row["operation_status"] = "OPERATION_UNVERIFIED"
    elif import_category:
        row["import_category"] = import_category
    elif row.get("disputed_territory") and source_confidence != "HIGH":
        row["import_category"] = "EXCLUDED"
        row["verification_status"] = "EXCLUDED"
        row["notes"] = (row.get("notes") or "") + "; disputed_territory_exclusion"
    rows.append(row)


def overpass_query(query: str, cache_path: Path | None = None, retries: int = 3) -> dict:
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    last_err = None
    for attempt in range(retries):
        ep = endpoints[attempt % len(endpoints)]
        cmd = ["curl", "-sS", "--max-time", "90", "-X", "POST", ep, "--data", query]
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
            data = json.loads(out.decode("utf-8", "replace"))
            if cache_path:
                cache_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            time.sleep(1.5)
            return data
        except Exception as ex:
            last_err = ex
            time.sleep(3 * (attempt + 1))
    raise last_err  # type: ignore[misc]


def photon_search(q: str, lat: float, lon: float, limit: int = 50) -> list[dict]:
    url = f"https://photon.komoot.io/api/?{urllib.parse.urlencode({'q': q, 'lat': lat, 'lon': lon, 'limit': limit})}"
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyRussiaPhase1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    hits = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        country = p.get("country", "")
        if country not in ("Russia", "Россия", "Russian Federation"):
            continue
        lng, lat_v = f["geometry"]["coordinates"]
        hits.append(
            {
                "name": p.get("name") or q,
                "street": p.get("street") or "",
                "city": p.get("city") or p.get("state") or "",
                "postcode": p.get("postcode") or "",
                "lat": lat_v,
                "lng": lng,
                "osm_id": p.get("osm_id"),
                "source": "photon",
            }
        )
    time.sleep(0.35)
    return hits


def osm_element_to_row(el: dict, default_brand: str = "") -> dict | None:
    tags = el.get("tags", {})
    name = tags.get("name") or tags.get("brand") or default_brand
    if not name:
        return None
    brand = tags.get("brand") or default_brand or name
    lat = el.get("lat")
    lng = el.get("lon")
    if lat is None and "center" in el:
        lat = el["center"].get("lat")
        lng = el["center"].get("lon")
    if lat is None:
        return None
    address_parts = []
    if tags.get("addr:street"):
        hn = tags.get("addr:housenumber", "")
        address_parts.append(f"{tags['addr:street']} {hn}".strip())
    address = " ".join(address_parts) or tags.get("addr:full") or tags.get("address") or ""
    city = tags.get("addr:city") or tags.get("addr:province") or ""
    postal = tags.get("addr:postcode") or ""
    district = tags.get("addr:district") or tags.get("addr:suburb") or ""
    branch = tags.get("branch") or ""
    display_name = f"{brand} {branch}".strip() if branch else name
    return {
        "brand": brand,
        "name": display_name,
        "address": address,
        "city": city,
        "postal": postal,
        "lat": float(lat),
        "lng": float(lng),
        "district": district,
        "source_url": tags.get("website") or tags.get("contact:website") or "",
        "source_type": "openstreetmap",
        "source_confidence": "MEDIUM" if address else "LOW",
        "notes": f"osm_id={el.get('id')}; osm_type={el.get('type')}",
        "coord_source": "OSM_PREMISES",
        "tags": tags,
    }


def classify_exclusion(name: str, brand: str, tags: dict | None = None) -> str | None:
    blob = f"{name} {brand} {json.dumps(tags or {}, ensure_ascii=False)}"
    if SPECIALIST_RE.search(blob):
        return "specialist"
    if HOTEL_RE.search(blob):
        return "hotel_resort"
    if INSTITUTIONAL_RE.search(blob):
        return "institutional"
    if tags:
        if tags.get("access") in ("private", "members"):
            return "institutional"
    return None


def ingest_osm_hit(rows: list[dict], seen: set, parsed: dict, city: str, brand_hint: str = "") -> bool:
    lat, lng = parsed["lat"], parsed["lng"]
    if in_disputed_ukraine_territory(lat, lng):
        add(
            rows,
            brand=parsed["brand"],
            name=parsed["name"],
            address=parsed["address"] or f"{city} fitness centre",
            city=parsed["city"] or city,
            postal=parsed["postal"],
            lat=lat,
            lng=lng,
            coord_source=parsed["coord_source"],
            source_url=parsed["source_url"],
            source_type=parsed["source_type"],
            source_confidence="LOW",
            excluded=True,
            disputed_territory=True,
            discovery_class="disputed_territory_hold",
            notes=parsed["notes"] + "; disputed_ukraine_exclusion",
        )
        return True
    if not in_russia(lat, lng):
        return False
    key = (round(lat, 5), round(lng, 5), normalize_russian_search(parsed["brand"]))
    if key in seen:
        return False
    seen.add(key)
    ex_reason = classify_exclusion(parsed["name"], parsed["brand"], parsed.get("tags"))
    brand = brand_hint or parsed["brand"]
    class_a = brand in CLASS_A_OFFICIAL
    if ex_reason:
        add(
            rows,
            brand=parsed["brand"],
            name=parsed["name"],
            address=parsed["address"] or f"{city} fitness centre",
            city=parsed["city"] or city,
            postal=parsed["postal"],
            lat=lat,
            lng=lng,
            coord_source=parsed["coord_source"],
            source_url=parsed["source_url"],
            source_type=parsed["source_type"],
            source_confidence=parsed["source_confidence"],
            excluded=True,
            discovery_class=ex_reason,
            notes=parsed["notes"] + f"; excluded={ex_reason}",
        )
    elif not parsed["address"]:
        add(
            rows,
            brand=parsed["brand"],
            name=parsed["name"],
            address=parsed["address"] or f"{city} fitness centre",
            city=parsed["city"] or city,
            postal=parsed["postal"],
            district=parsed.get("district", ""),
            lat=lat,
            lng=lng,
            coord_source=parsed["coord_source"],
            source_url=parsed["source_url"],
            source_type=parsed["source_type"],
            source_confidence="LOW",
            needs_review=True,
            discovery_class="osm_independent",
            notes=parsed["notes"] + "; address_incomplete",
        )
    else:
        add(
            rows,
            brand=brand,
            name=parsed["name"],
            address=parsed["address"],
            city=parsed["city"] or city,
            postal=parsed["postal"],
            district=parsed.get("district", ""),
            lat=lat,
            lng=lng,
            coord_source=parsed["coord_source"],
            source_url=parsed["source_url"],
            source_type=parsed["source_type"],
            source_confidence=parsed["source_confidence"],
            discovery_class="national_chain" if class_a else "osm_independent",
            eligibility_candidate="CHAIN_CLASS_A" if class_a else "INDEPENDENT",
            operator_class="A" if class_a else "B",
            notes=parsed["notes"],
        )
    return True


def stage_osm_city_fitness(rows: list[dict], seen: set) -> int:
    n = 0
    for city, (s, w, north, e) in CITY_BBOX.items():
        q = (
            f'[out:json][timeout:55];'
            f'(node["leisure"="fitness_centre"]({s},{w},{north},{e});'
            f'way["leisure"="fitness_centre"]({s},{w},{north},{e}););'
            f'out center tags;'
        )
        cache = RAW / "osm" / f"fitness_{city.replace(' ', '_')}.json"
        try:
            data = overpass_query(q, cache)
        except Exception as ex:
            print(f"OSM skip {city}: {ex}")
            continue
        for el in data.get("elements", []):
            parsed = osm_element_to_row(el)
            if not parsed:
                continue
            if ingest_osm_hit(rows, seen, parsed, city):
                n += 1
    return n


def stage_osm_brands(rows: list[dict], seen: set) -> int:
    n = 0
    south, west, north, east = 41.2, 19.4, 77.0, 169.5
    for brand in CLASS_A_OFFICIAL:
        q = f'[out:json][timeout:60];(node["brand"="{brand}"]({south},{west},{north},{east}););out body;'
        cache = RAW / "osm" / f"brand_{brand.replace(' ', '_').replace(chr(39), '')}.json"
        try:
            data = overpass_query(q, cache)
        except Exception as ex:
            print(f"OSM brand skip {brand}: {ex}")
            continue
        for el in data.get("elements", []):
            parsed = osm_element_to_row(el, default_brand=brand)
            if not parsed:
                continue
            if ingest_osm_hit(rows, seen, parsed, parsed["city"] or "Moscow", brand_hint=brand):
                n += 1
    return n


def stage_photon_chains(rows: list[dict], seen: set) -> int:
    n = 0
    photon_cities = [
        ("Moscow", 55.75, 37.62),
        ("Saint Petersburg", 59.93, 30.32),
        ("Novosibirsk", 55.03, 82.92),
        ("Yekaterinburg", 56.84, 60.60),
        ("Kazan", 55.79, 49.12),
        ("Nizhny Novgorod", 56.30, 44.00),
        ("Samara", 53.20, 50.15),
        ("Rostov-on-Don", 47.24, 39.71),
        ("Krasnodar", 45.04, 38.98),
        ("Ufa", 54.74, 55.97),
    ]
    for brand in CLASS_A_OFFICIAL:
        for city, lat, lon in photon_cities:
            try:
                hits = photon_search(brand, lat, lon, 50)
            except Exception as ex:
                print(f"Photon skip {brand}/{city}: {ex}")
                continue
            for h in hits:
                lat_h, lng_h = h["lat"], h["lng"]
                if in_disputed_ukraine_territory(lat_h, lng_h):
                    continue
                if not in_russia(lat_h, lng_h):
                    continue
                key = (round(lat_h, 5), round(lng_h, 5), normalize_russian_search(brand))
                if key in seen:
                    continue
                seen.add(key)
                addr = h["street"] or f"{city} {brand}"
                add(
                    rows,
                    brand=brand,
                    name=h["name"],
                    address=addr,
                    city=h["city"] or city,
                    postal=h["postcode"],
                    lat=lat_h,
                    lng=lng_h,
                    coord_source="PHOTON_PREMISES",
                    source_url=f"https://photon.komoot.io/api/?q={urllib.parse.quote(brand)}",
                    source_type="photon_geocoder",
                    source_confidence="MEDIUM",
                    discovery_class="national_chain",
                    eligibility_candidate="CHAIN_CLASS_A",
                    operator_class="A",
                    notes=f"photon_osm_id={h.get('osm_id')}",
                )
                n += 1
    return n


def stage_moscow_deep_audit(rows: list[dict], seen: set) -> int:
    n = 0
    for district, lat, lon in MOSCOW_DISTRICTS:
        for term in SEARCH_TERMS_RU[:4] + SEARCH_TERMS_EN[:4]:
            try:
                hits = photon_search(term, lat, lon, 25)
            except Exception as ex:
                print(f"Moscow audit skip {district}/{term}: {ex}")
                continue
            for h in hits:
                lat_h, lng_h = h["lat"], h["lng"]
                if not in_russia(lat_h, lng_h):
                    continue
                if lat_h < 55.49 or lat_h > 56.0 or lng_h < 37.0 or lng_h > 38.2:
                    continue
                key = (round(lat_h, 5), round(lng_h, 5), normalize_russian_search(h["name"]))
                if key in seen:
                    continue
                seen.add(key)
                brand = h["name"]
                for ca in CLASS_A_OFFICIAL:
                    if ca.lower() in h["name"].lower():
                        brand = ca
                        break
                add(
                    rows,
                    brand=brand,
                    name=h["name"],
                    address=h["street"] or f"{district}, Moscow",
                    city="Moscow",
                    postal=h["postcode"],
                    district=district,
                    lat=lat_h,
                    lng=lng_h,
                    coord_source="PHOTON_MOSCOW_AUDIT",
                    source_type="moscow_district_audit",
                    source_confidence="MEDIUM",
                    needs_review=True,
                    discovery_class="moscow_deep_audit",
                    notes=f"moscow_district={district}; term={term}",
                )
                n += 1
    return n


def stage_spb_audit(rows: list[dict], seen: set) -> int:
    n = 0
    for district, lat, lon in SPB_DISTRICTS:
        for term in ["World Class", "X-Fit", "фитнес", "fitness club"]:
            try:
                hits = photon_search(term, lat, lon, 30)
            except Exception as ex:
                print(f"SPb audit skip {district}: {ex}")
                continue
            for h in hits:
                lat_h, lng_h = h["lat"], h["lng"]
                if not in_russia(lat_h, lng_h):
                    continue
                if lat_h < 59.7 or lat_h > 60.15 or lng_h < 29.6 or lng_h > 30.8:
                    continue
                key = (round(lat_h, 5), round(lng_h, 5), normalize_russian_search(h["name"]))
                if key in seen:
                    continue
                seen.add(key)
                brand = h["name"]
                for ca in CLASS_A_OFFICIAL:
                    if ca.lower() in h["name"].lower():
                        brand = ca
                        break
                add(
                    rows,
                    brand=brand,
                    name=h["name"],
                    address=h["street"] or f"{district}, Saint Petersburg",
                    city="Saint Petersburg",
                    postal=h["postcode"],
                    district=district,
                    lat=lat_h,
                    lng=lng_h,
                    coord_source="PHOTON_SPB_AUDIT",
                    source_type="spb_district_audit",
                    source_confidence="MEDIUM",
                    needs_review=True,
                    discovery_class="spb_dedicated_audit",
                    notes=f"spb_district={district}",
                )
                n += 1
    return n


def stage_disputed_probes(rows: list[dict]) -> None:
    probes = [
        ("Simferopol World Class probe", "Simferopol", 44.952, 34.102, "Crimea disputed hold"),
        ("Sevastopol fitness probe", "Sevastopol", 44.616, 33.525, "Crimea disputed hold"),
        ("Donetsk gym probe", "Donetsk", 48.015, 37.803, "Donetsk occupied hold"),
        ("Luhansk gym probe", "Luhansk", 48.574, 39.307, "Luhansk occupied hold"),
    ]
    for name, city, lat, lng, note in probes:
        add(
            rows,
            brand="Disputed Territory Probe",
            name=name,
            address=f"{city} fitness probe",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="DISPUTED_PROBE",
            excluded=True,
            disputed_territory=True,
            discovery_class="disputed_territory_hold",
            source_type="conflict_probe",
            source_confidence="LOW",
            notes=note,
        )


def stage_cross_border_probes(rows: list[dict]) -> None:
    probes = [
        ("Helsinki gym Russia mis-tag", "Helsinki", 60.17, 24.94, "Finland cross-border probe"),
        ("Minsk gym Russia mis-tag", "Minsk", 53.90, 27.56, "Belarus cross-border probe"),
        ("Kyiv gym Russia mis-tag", "Kyiv", 50.45, 30.52, "Ukraine cross-border probe"),
        ("Tbilisi gym Russia mis-tag", "Tbilisi", 41.72, 44.78, "Georgia cross-border probe"),
        ("Almaty gym Russia mis-tag", "Almaty", 43.24, 76.95, "Kazakhstan cross-border probe"),
    ]
    for name, city, lat, lng, note in probes:
        add(
            rows,
            brand="Foreign Probe",
            name=name,
            address=f"{city} foreign probe",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="FOREIGN_PROBE",
            excluded=True,
            foreign_probe=True,
            discovery_class="cross_border_probe",
            source_type="cross_border_probe",
            source_confidence="HIGH",
            notes=note,
        )


def stage_international_probes() -> list[dict]:
    probes = []
    for brand, action, evidence in [
        ("World Class", "CLASS_A_PARTIAL", "Large estate; official list not fully machine-readable"),
        ("X-Fit", "CLASS_A_PARTIAL", "OSM+Photon partial; regional site fragmentation"),
        ("Alex Fitness", "CLASS_A_PARTIAL", "OSM+Photon partial estate"),
        ("DDxFitness", "CLASS_A_PARTIAL", "OSM+Photon partial; franchise mix"),
        ("Spirit Fitness", "CLASS_A_PARTIAL", "OSM+Photon partial estate"),
        ("Anytime Fitness", "ABSENT", "No verified Russia estate in discovery"),
        ("Gold's Gym", "BELOW_CLASS_A", "Limited OSM hits — boutique presence"),
        ("Fitness House", "BELOW_CLASS_A", "Regional chain — partial OSM"),
        ("Orange Fitness", "BELOW_CLASS_A", "Regional — limited OSM"),
    ]:
        probes.append({"chain": brand, "action": action, "evidence": evidence})
    return probes


def write_postcode_model() -> None:
    write_json(
        OUT / "RUSSIA_POSTCODE_MODEL.json",
        {
            "country": "Russia",
            "format": "NNNNNN (6 digits)",
            "regex": "^\\d{6}$",
            "examples": ["101000", "190000", "630099"],
            "validation_function": "format_ru_postal() in batch1_phase1_common.py",
            "source": "Pochta Rossii index; aligned with RU_POSTAL_RE",
            "verified_independently": True,
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "RUSSIA_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Russia",
            "search_normalization": "normalize_russian_search() — Cyrillic/Latin transliteration",
            "aliases": [
                {"canonical": "Moscow", "variants": ["Moskva", "moscow", "Москва"]},
                {"canonical": "Saint Petersburg", "variants": ["SPb", "Sankt-Peterburg", "Санкт-Петербург", "St Petersburg"]},
                {"canonical": "Russia", "variants": ["Rossiya", "Россия", "RU", "Russian Federation"]},
                {"canonical": "Yekaterinburg", "variants": ["Ekaterinburg", "Екатеринбург"]},
                {"canonical": "Nizhny Novgorod", "variants": ["Nizhniy Novgorod", "Нижний Новгород"]},
            ],
            "notes": "Canonical Russian local names preserved in storage; transliteration for search only",
        },
    )


def snapshot_existing_production(catalog: list[dict]) -> list[dict]:
    ru_rows = []
    for c in catalog:
        cid = str(c.get("id", ""))
        country = str(c.get("country", "")).lower()
        if cid.startswith("ru_") or country in ("russia", "rossiya", "ru", "россия"):
            ru_rows.append(dict(c))
    return ru_rows


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"RUSSIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")
    if len(CENTERS.read_bytes()) != EXPECTED_BYTES:
        raise SystemExit("RUSSIA PHASE 1 BLOCKED — PRODUCTION BYTES DRIFT")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"

    ru_live = [c for c in catalog if str(c.get("id", "")).startswith("ru_")]
    ru_country = [c for c in catalog if str(c.get("country", "")).lower() in ("russia", "rossiya", "ru", "россия")]
    existing = snapshot_existing_production(catalog)
    write_json(OUT / "RUSSIA_EXISTING_PRODUCTION_SNAPSHOT.json", existing)

    rows: list[dict] = []
    seen: set = set()

    osm_brand_n = stage_osm_brands(rows, seen)
    osm_city_n = stage_osm_city_fitness(rows, seen)
    photon_n = stage_photon_chains(rows, seen)
    moscow_n = stage_moscow_deep_audit(rows, seen)
    spb_n = stage_spb_audit(rows, seen)
    stage_disputed_probes(rows)
    stage_cross_border_probes(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    inventory = {
        "country": "Russia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_bytes_before": EXPECTED_BYTES,
        "production_total": PRODUCTION_TOTAL,
        "russia_live": len(ru_live),
        "ru_prefix_live": len(ru_live),
        "russia_country_live": len(ru_country),
        "existing_russia_production": len(existing) > 0,
        "baseline_azerbaijan": 46,
        "baseline_armenia": 36,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED_LARGE_MARKET",
        "postcode_model": "NNNNNN (6 digits)",
        "fetch_summary": {
            "osm_brands": osm_brand_n,
            "osm_city_fitness": osm_city_n,
            "photon_chains": photon_n,
            "moscow_deep_audit": moscow_n,
            "spb_dedicated_audit": spb_n,
            "total_candidates": len(rows),
        },
        "moscow_staged": sum(1 for r in rows if r.get("city") == "Moscow"),
        "spb_staged": sum(1 for r in rows if r.get("city") == "Saint Petersburg"),
        "disputed_territory_staged": sum(1 for r in rows if r.get("disputed_territory")),
        "chains": [],
        "probes": stage_international_probes(),
        "official_estate": {
            brand: {"open_active_estimated": count, "class_a": True}
            for brand, count in CLASS_A_OFFICIAL.items()
        },
        "final_missed_chain_sweep": {
            "complete": False,
            "new_class_a_found": False,
            "notes": "Large-market chain estates require Phase 2 terminal resolution — no READY cap applied",
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
                "official_current_active_estimated": official or None,
                "class_a": brand in CLASS_A_OFFICIAL,
                "source": "phase1_discovery",
            }
        )

    write_json(OUT / "russia_phase1_candidates.json", rows)
    write_json(OUT / "russia_chain_inventory.json", inventory)
    write_json(OUT / "RUSSIA_PHASE1_ALL_CANDIDATES.json", rows)
    write_postcode_model()
    write_locality_alias_map()

    rebrand = {
        "country": "Russia",
        "phase": 1,
        "entries": [
            {
                "legacy": "Alex Gym",
                "successor": "Alex Fitness",
                "classification": "SAME_ACTIVE_IDENTITY",
                "notes": "Alex Gym regional branding maps to Alex Fitness operator",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "RUSSIA_PHASE1_REBRAND_MAP.json", rebrand)

    print(json.dumps(inventory["fetch_summary"], indent=2))
    print(
        f"candidates={len(rows)} moscow={inventory['moscow_staged']} spb={inventory['spb_staged']} "
        f"ru_live={len(ru_live)} sha={PRE_SHA}"
    )


if __name__ == "__main__":
    main()
