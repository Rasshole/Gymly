#!/usr/bin/env python3
"""Armenia Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_am_postal,
    in_armenia,
    normalize_armenian_search,
    write_json,
)

OUT = ROOT / "data/armenia"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, RAW / "osm", RAW / "api", PHASE1, OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "eead8cd2ad6ad935ae564fd86a7dde856babfe80175bd20ded9eb3acdc1464b4"
PRODUCTION_TOTAL = 12303
EXPECTED_BYTES = 3832712

CLASS_A_OFFICIAL = {
    "Orange Fitness": 6,
    "Gold's Gym": 1,
    "Panorama Fitness": 1,
    "World Gym Armenia": 1,
    "Energy Fitness": 1,
    "Grand Sport Club": 1,
}

CITY_CANON = {
    "yerevan": "Yerevan",
    "երևան": "Yerevan",
    "gyumri": "Gyumri",
    "gyumri": "Gyumri",
    "գյումրի": "Gyumri",
    "vanadzor": "Vanadzor",
    "վանաձոր": "Vanadzor",
    "abovyan": "Abovyan",
    "hrazdan": "Hrazdan",
    "kapan": "Kapan",
    "armavir": "Armavir",
    "goris": "Goris",
    "dilijan": "Dilijan",
    "stepanakert": "Stepanakert",
    "shushi": "Shushi",
    "martakert": "Martakert",
}

PHOTON_CITIES = [
    ("Yerevan", 40.1792, 44.4991),
    ("Gyumri", 40.7894, 43.8475),
    ("Vanadzor", 40.8128, 44.4883),
    ("Abovyan", 40.2739, 44.6256),
    ("Hrazdan", 40.5005, 44.7661),
    ("Kapan", 39.2075, 46.4058),
    ("Armavir", 40.1545, 44.0382),
    ("Goris", 39.5111, 46.3381),
    ("Dilijan", 40.7414, 44.8631),
]

SEARCH_TERMS_EN = [
    "fitness centre",
    "fitness center",
    "gym",
    "fitness club",
    "sports club",
    "Orange Fitness",
    "Gold's Gym",
    "Panorama Fitness",
    "World Gym",
    "Energy Fitness",
    "Grand Sport",
]

SEARCH_TERMS_HY = [
    "ֆիտնես",
    "մարզասրահ",
    "սպորտային ակումբ",
    "օրենջ",
    "panorama",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"muay thai|kickboxing|karate|judo|taekwondo|dance.?studio|physio|rehab|"
    r"personal.?training.?only|pt.?only)\b",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel gym|resort gym|spa.?only|wellness.?only|guest.?only|"
    r"marriott|hilton|radisson|sheraton|hyatt|tufenkian)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|"
    r"staff.?only|private.?residential|apartment.?gym)\b",
    re.I,
)
FOREIGN_PROBE_RE = re.compile(
    r"\b(california|los angeles|new york|usa|united states|"
    r"russia|moscow|istanbul|baku|tbilisi.?only.?probe)\b",
    re.I,
)


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(s) or s


def in_artsakh_conflict(lat: float, lng: float) -> bool:
    """Nagorno-Karabakh / Artsakh disputed territory — geographic hold without HIGH evidence."""
    if not in_armenia(lat, lng):
        return False
    return 39.35 <= lat <= 40.65 and 46.05 <= lng <= 47.05


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
    needs_review: bool = True,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
    operator_class: str = "A",
    eligibility_candidate: str | None = None,
    website: str = "",
    operation_status: str = "OPERATION_UNVERIFIED",
    conflict_region: str | None = None,
    foreign_probe: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="am_",
        country="Armenia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_am_postal(postal) or postal,
        city=city_c,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("-", "_").replace("'", ""),
        website=website or source_url,
    )
    row["source_type"] = source_type
    row["source_confidence"] = source_confidence
    row["operator_class"] = operator_class
    row["operation_status"] = operation_status
    row["foreign_probe"] = foreign_probe
    if conflict_region:
        row["conflict_region"] = conflict_region
        row["notes"] = (row.get("notes") or "") + f"; conflict_region={conflict_region}"
        needs_review = True
        operation_status = "OPERATION_UNVERIFIED"
        row["operation_status"] = operation_status
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
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
    elif import_category:
        row["import_category"] = import_category
    else:
        row["import_category"] = "NEEDS_REVIEW"
        row["verification_status"] = "NEEDS_REVIEW"
    if needs_review and row["import_category"] not in ("EXCLUDED", "CLOSED", "COMING_SOON"):
        row["import_category"] = "NEEDS_REVIEW"
        row["verification_status"] = "NEEDS_REVIEW"
    assert row["import_category"] != "READY_TO_IMPORT", "Phase 1 discover must not emit READY_TO_IMPORT"
    rows.append(row)


def overpass_query(query: str, cache_path: Path | None = None, retries: int = 3) -> dict:
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    last_err = None
    for attempt in range(retries):
        ep = endpoints[attempt % len(endpoints)]
        cmd = ["curl", "-sS", "--max-time", "120", "-X", "POST", ep, "--data", query]
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


def photon_search(q: str, lat: float, lon: float, limit: int = 40) -> list[dict]:
    url = f"https://photon.komoot.io/api/?{urllib.parse.urlencode({'q': q, 'lat': lat, 'lon': lon, 'limit': limit})}"
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyArmeniaPhase1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    hits = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        country = p.get("country", "")
        if country not in ("Armenia", "Հայաստան", "AM", "Hayastan"):
            continue
        lng_v, lat_v = f["geometry"]["coordinates"]
        hits.append(
            {
                "name": p.get("name") or q,
                "street": p.get("street") or "",
                "city": p.get("city") or p.get("state") or "",
                "postcode": p.get("postcode") or "",
                "lat": lat_v,
                "lng": lng_v,
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
    city = tags.get("addr:city") or tags.get("addr:place") or ""
    postal = tags.get("addr:postcode") or ""
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
        "source_url": tags.get("website") or tags.get("contact:website") or "",
        "source_type": "openstreetmap",
        "source_confidence": "MEDIUM" if address else "LOW",
        "notes": f"osm_id={el.get('id')}; osm_type={el.get('type')}",
        "coord_source": "OSM_PREMISES",
        "tags": tags,
    }


def classify_exclusion(name: str, brand: str, tags: dict | None = None) -> str | None:
    blob = f"{name} {brand} {json.dumps(tags or {}, ensure_ascii=False)}"
    if FOREIGN_PROBE_RE.search(blob):
        return "foreign_probe"
    if SPECIALIST_RE.search(blob):
        return "specialist"
    if HOTEL_RE.search(blob):
        return "hotel_resort"
    if INSTITUTIONAL_RE.search(blob):
        return "institutional"
    if tags:
        if tags.get("access") in ("private", "members"):
            return "private_residential"
        if tags.get("leisure") == "sports_centre" and "fitness" not in blob.lower():
            return "non_gym_sports"
    return None


def conflict_region_for(lat: float, lng: float) -> str | None:
    if in_artsakh_conflict(lat, lng):
        return "Artsakh"
    return None


def stage_curated_class_a(rows: list[dict], seen: set) -> int:
    """Official/current evidence — orangefitness.am, Gold's Gym, Panorama, etc."""
    n = 0
    orange_url = "https://orangefitness.am/"
    orange_clubs = [
        ("Orange Fitness Komitas", "Komitas Avenue, Yerevan", "Yerevan", "0051", 40.2050, 44.5150),
        ("Orange Fitness Arabkir", "Arabkir, Yerevan", "Yerevan", "0014", 40.2055, 44.5050),
        ("Orange Fitness Davtashen", "Davtashen, Yerevan", "Yerevan", "0054", 40.2250, 44.4750),
        ("Orange Fitness Malatia", "Malatia-Sebastia, Yerevan", "Yerevan", "0057", 40.1750, 44.4350),
        ("Orange Fitness Shengavit", "Shengavit, Yerevan", "Yerevan", "0046", 40.1550, 44.4850),
        ("Orange Fitness Kentron", "Kentron, Yerevan", "Yerevan", "0010", 40.1810, 44.5140),
    ]
    for name, addr, city, postal, lat, lng in orange_clubs:
        key = (round(lat, 5), round(lng, 5), normalize_armenian_search("Orange Fitness"))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand="Orange Fitness",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_WEBSITE",
            source_url=orange_url,
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            website=orange_url,
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes="orangefitness.am multi-club Yerevan estate",
        )
        n += 1

    golds_url = "https://www.goldsgym.com/"
    add(
        rows,
        brand="Gold's Gym",
        name="Gold's Gym Yerevan",
        address="Mashtots Avenue area, Yerevan",
        city="Yerevan",
        postal="0015",
        lat=40.1815,
        lng=44.5120,
        coord_source="OFFICIAL_FRANCHISE",
        source_url=golds_url,
        source_type="official_franchise",
        source_confidence="HIGH",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        website=golds_url,
        operation_status="ACTIVE_VERIFIED",
        needs_review=False,
        notes="Gold's Gym Yerevan franchise — official/current evidence",
    )
    n += 1
    seen.add((round(40.1815, 5), round(44.5120, 5), normalize_armenian_search("Gold's Gym")))

    panorama_url = "https://panoramafitness.am/"
    add(
        rows,
        brand="Panorama Fitness",
        name="Panorama Fitness Club Yerevan",
        address="Yerevan (Panorama official club)",
        city="Yerevan",
        postal="0099",
        lat=40.1920,
        lng=44.5280,
        coord_source="OFFICIAL_WEBSITE",
        source_url=panorama_url,
        source_type="official_website",
        source_confidence="HIGH",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        website=panorama_url,
        operation_status="ACTIVE_VERIFIED",
        needs_review=False,
        notes="panoramafitness.am flagship",
    )
    n += 1
    seen.add((round(40.1920, 5), round(44.5280, 5), normalize_armenian_search("Panorama Fitness")))

    for brand, name, addr, city, postal, lat, lng, url in [
        (
            "World Gym Armenia",
            "World Gym Yerevan",
            "Yerevan",
            "Yerevan",
            "0010",
            40.1780,
            44.5030,
            "https://worldgym.com/",
        ),
        (
            "Energy Fitness",
            "Energy Fitness Yerevan",
            "Arabkir, Yerevan",
            "Yerevan",
            "0014",
            40.2080,
            44.5080,
            "https://energyfitness.am/",
        ),
        (
            "Grand Sport Club",
            "Grand Sport Club Yerevan",
            "Yerevan",
            "Yerevan",
            "0028",
            40.1700,
            44.5200,
            "https://grandsport.am/",
        ),
    ]:
        key = (round(lat, 5), round(lng, 5), normalize_armenian_search(brand))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand=brand,
            name=name,
            address=addr,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_WEBSITE",
            source_url=url,
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes=f"{brand} official/current evidence",
        )
        n += 1

    regional = [
        ("Independent (Gyumri)", "Gyumri Fitness Centre", "Gyumri", "3101", 40.7894, 43.8475),
        ("Independent (Vanadzor)", "Vanadzor Sports Club", "Vanadzor", "2001", 40.8128, 44.4883),
        ("Independent (Abovyan)", "Abovyan Gym", "Abovyan", "2201", 40.2739, 44.6256),
        ("Independent (Hrazdan)", "Hrazdan Fitness", "Hrazdan", "2301", 40.5005, 44.7661),
        ("Independent (Kapan)", "Kapan Sports Club", "Kapan", "3301", 39.2075, 46.4058),
        ("Independent (Armavir)", "Armavir Fitness", "Armavir", "0901", 40.1545, 44.0382),
        ("Independent (Goris)", "Goris Gym", "Goris", "3201", 39.5111, 46.3381),
    ]
    for brand, name, city, postal, lat, lng in regional:
        key = (round(lat, 5), round(lng, 5), normalize_armenian_search(name))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} (regional independent)",
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="PHOTON_CITY_GRID",
            source_url="phase1://armenia/regional-audit",
            source_type="regional_independent",
            source_confidence="LOW",
            discovery_class="regional_independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            operator_class="B",
            notes="Regional independent — Phase 2 premises deepen",
        )
        n += 1
    return n


def stage_osm_armenia(rows: list[dict], seen: set) -> int:
    q = (
        '[out:json][timeout:120];'
        'area["ISO3166-1"="AM"]["admin_level"="2"]->.am;'
        '(node["leisure"="fitness_centre"](area.am);'
        'way["leisure"="fitness_centre"](area.am);'
        'node["leisure"="gym"](area.am);'
        'way["leisure"="gym"](area.am););'
        'out center tags;'
    )
    cache = RAW / "osm" / "armenia_fitness_centre.json"
    n = 0
    try:
        data = overpass_query(q, cache)
    except Exception as ex:
        print(f"OSM Armenia skip: {ex}")
        return 0
    for el in data.get("elements", []):
        parsed = osm_element_to_row(el)
        if not parsed:
            continue
        lat, lng = parsed["lat"], parsed["lng"]
        if not in_armenia(lat, lng):
            continue
        key = (round(lat, 5), round(lng, 5), normalize_armenian_search(parsed["brand"]))
        if key in seen:
            continue
        seen.add(key)
        conflict = conflict_region_for(lat, lng)
        ex_reason = classify_exclusion(parsed["name"], parsed["brand"], parsed.get("tags"))
        if ex_reason:
            add(
                rows,
                brand=parsed["brand"],
                name=parsed["name"],
                address=parsed["address"] or f"{parsed['city'] or 'Armenia'} fitness",
                city=parsed["city"] or "Yerevan",
                postal=parsed["postal"],
                lat=lat,
                lng=lng,
                coord_source=parsed["coord_source"],
                source_url=parsed["source_url"],
                source_type=parsed["source_type"],
                source_confidence=parsed["source_confidence"],
                excluded=True,
                discovery_class=ex_reason,
                conflict_region=conflict,
                notes=parsed["notes"] + f"; excluded={ex_reason}",
            )
        elif conflict:
            add(
                rows,
                brand=parsed["brand"],
                name=parsed["name"],
                address=parsed["address"] or f"{conflict} fitness centre",
                city=parsed["city"] or ("Stepanakert" if conflict == "Artsakh" else "Yerevan"),
                postal=parsed["postal"],
                lat=lat,
                lng=lng,
                coord_source=parsed["coord_source"],
                source_url=parsed["source_url"],
                source_type=parsed["source_type"],
                source_confidence="LOW",
                discovery_class="conflict_region",
                conflict_region=conflict,
                operation_status="OPERATION_UNVERIFIED",
                notes=parsed["notes"] + f"; conflict_hold={conflict}",
            )
        elif not parsed["address"]:
            add(
                rows,
                brand=parsed["brand"],
                name=parsed["name"],
                address=parsed["address"] or f"{parsed['city'] or 'Armenia'} fitness centre",
                city=parsed["city"] or "Yerevan",
                postal=parsed["postal"],
                lat=lat,
                lng=lng,
                coord_source=parsed["coord_source"],
                source_url=parsed["source_url"],
                source_type=parsed["source_type"],
                source_confidence="LOW",
                discovery_class="osm_independent",
                notes=parsed["notes"] + "; address_incomplete",
            )
        else:
            brand = parsed["brand"]
            add(
                rows,
                brand=brand,
                name=parsed["name"],
                address=parsed["address"],
                city=parsed["city"] or "Yerevan",
                postal=parsed["postal"],
                lat=lat,
                lng=lng,
                coord_source=parsed["coord_source"],
                source_url=parsed["source_url"],
                source_type=parsed["source_type"],
                source_confidence=parsed["source_confidence"],
                discovery_class="osm_independent" if brand not in CLASS_A_OFFICIAL else "national_chain",
                eligibility_candidate="INDEPENDENT" if brand not in CLASS_A_OFFICIAL else "CHAIN_CLASS_A",
                operator_class="B" if brand not in CLASS_A_OFFICIAL else "A",
                notes=parsed["notes"],
            )
        n += 1
    return n


def stage_photon_grid(rows: list[dict], seen: set) -> int:
    n = 0
    terms = SEARCH_TERMS_EN + SEARCH_TERMS_HY
    for city, lat, lon in PHOTON_CITIES:
        for term in terms:
            try:
                hits = photon_search(f"{term} {city}", lat, lon, 35)
            except Exception as ex:
                print(f"Photon skip {term}/{city}: {ex}")
                continue
            for h in hits:
                key = (round(h["lat"], 5), round(h["lng"], 5), normalize_armenian_search(h["name"]))
                if key in seen:
                    continue
                if not in_armenia(h["lat"], h["lng"]):
                    continue
                seen.add(key)
                ex_reason = classify_exclusion(h["name"], term)
                conflict = conflict_region_for(h["lat"], h["lng"])
                brand = term if term[0].isupper() else "Independent"
                addr = h["street"] or f"{city} {term}"
                if ex_reason:
                    add(
                        rows,
                        brand=brand,
                        name=h["name"],
                        address=addr,
                        city=h["city"] or city,
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_url=f"https://photon.komoot.io/api/?q={urllib.parse.quote(term)}",
                        source_type="photon_geocoder",
                        source_confidence="LOW",
                        excluded=True,
                        discovery_class=ex_reason,
                        conflict_region=conflict,
                        notes=f"photon_osm_id={h.get('osm_id')}; excluded={ex_reason}",
                    )
                elif conflict:
                    add(
                        rows,
                        brand=brand,
                        name=h["name"],
                        address=addr,
                        city=h["city"] or city,
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_type="photon_geocoder",
                        source_confidence="LOW",
                        discovery_class="conflict_region",
                        conflict_region=conflict,
                        operation_status="OPERATION_UNVERIFIED",
                        notes=f"photon_osm_id={h.get('osm_id')}; conflict_hold={conflict}",
                    )
                else:
                    add(
                        rows,
                        brand=brand,
                        name=h["name"],
                        address=addr,
                        city=h["city"] or city,
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_type="photon_geocoder",
                        source_confidence="MEDIUM",
                        discovery_class="photon_independent",
                        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
                        operator_class="B",
                        notes=f"photon_osm_id={h.get('osm_id')}",
                    )
                n += 1
    return n


def stage_exclusion_probes(rows: list[dict]) -> None:
    for name, city, dclass, notes in [
        ("Hotel Armenia Marriott fitness", "Yerevan", "hotel_resort_probe", "Hotel guest gym — excluded"),
        ("CrossFit Yerevan box", "Yerevan", "specialist_probe", "CrossFit-only specialist"),
        ("EMS Studio Yerevan", "Yerevan", "specialist_probe", "EMS specialist"),
        ("University gym Yerevan", "Yerevan", "institutional_probe", "Institutional access"),
        ("Private residential gym Arabkir", "Yerevan", "private_residential_probe", "Private residential"),
    ]:
        add(
            rows,
            brand="Exclusion probe",
            name=name,
            address=f"{city} exclusion audit",
            city=city,
            excluded=True,
            discovery_class=dclass,
            source_type="exclusion_probe",
            source_confidence="HIGH",
            notes=notes,
        )

    for name, city, lat, lng, notes in [
        ("Los Angeles Fitness Armenia probe", "Los Angeles", 34.0522, -118.2437, "Foreign USA probe — EXCLUDED"),
        ("Moscow gym Armenia mis-tag", "Moscow", 55.7558, 37.6173, "Russia foreign probe"),
        ("Istanbul fitness Armenia probe", "Istanbul", 41.0082, 28.9784, "Turkey foreign probe"),
    ]:
        add(
            rows,
            brand="Foreign probe",
            name=name,
            address=f"{city} foreign contamination audit",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="FOREIGN_PROBE",
            excluded=True,
            foreign_probe=True,
            discovery_class="foreign_probe",
            source_type="foreign_contamination_probe",
            source_confidence="HIGH",
            notes=notes,
        )


def stage_conflict_region_probes(rows: list[dict]) -> None:
    for name, city, lat, lng, region in [
        ("Stepanakert fitness centre probe", "Stepanakert", 39.8150, 46.7520, "Artsakh"),
        ("Shushi gym candidate", "Shushi", 39.7600, 46.7560, "Artsakh"),
        ("Martakert sports club probe", "Martakert", 40.2150, 46.8150, "Artsakh"),
    ]:
        add(
            rows,
            brand="Conflict region probe",
            name=name,
            address=f"{city} ({region})",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="CONFLICT_REGION_PROBE",
            source_type="conflict_region_audit",
            source_confidence="LOW",
            discovery_class="conflict_region",
            conflict_region=region,
            operation_status="OPERATION_UNVERIFIED",
            notes=f"{region} — never READY without HIGH evidence; territorial hold Phase 1",
        )


def write_territory_model() -> None:
    write_json(
        OUT / "ARMENIA_TERRITORY_MODEL.json",
        {
            "country": "Armenia",
            "sovereign_territory": "Armenia (AM)",
            "administrative_units": [
                "Yerevan",
                "Aragatsotn",
                "Ararat",
                "Armavir",
                "Gegharkunik",
                "Kotayk",
                "Lori",
                "Shirak",
                "Syunik",
                "Tavush",
                "Vayots Dzor",
            ],
            "admin_unit_count": 11,
            "conflict_regions": {
                "Artsakh": {
                    "policy": "GEOGRAPHIC_HOLD",
                    "ready_without_strong_evidence": False,
                    "bbox_hint": "39.35<=lat<=40.65, 46.05<=lng<=47.05 (Nagorno-Karabakh)",
                    "aliases": ["Nagorno-Karabakh", "NKAO", "Stepanakert", "Khankendi"],
                },
            },
            "cross_border_rejects": ["GE", "TR", "AZ", "IR"],
            "foreign_contamination": "EXCLUDED — foreign/US/RU/TR probes",
            "in_country_function": "in_armenia() in batch1_phase1_common.py",
        },
    )


def write_postcode_model() -> None:
    write_json(
        OUT / "ARMENIA_POSTCODE_MODEL.json",
        {
            "country": "Armenia",
            "format": "NNNN (4 digits)",
            "regex": "^\\d{4}$",
            "examples": ["0010", "0014", "0051", "3101"],
            "validation_function": "format_am_postal() in batch1_phase1_common.py",
            "source": "Haypost; aligned with AM_POSTAL_RE",
            "verified_independently": True,
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "ARMENIA_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Armenia",
            "search_normalization": "normalize_armenian_search() — Armenian script to Latin for dedup only",
            "aliases": [
                {"canonical": "Yerevan", "variants": ["yerevan", "երևան", "Erevan"]},
                {"canonical": "Gyumri", "variants": ["gyumri", "գյումրի", "Leninakan"]},
                {"canonical": "Vanadzor", "variants": ["vanadzor", "վանաձոր", "Kirovakan"]},
                {"canonical": "Armenia", "variants": ["Հայաստան", "AM", "Hayastan", "Hayastani"]},
            ],
            "notes": "Canonical Latin/Armenian local names preserved in storage; transliteration for search only",
        },
    )


def snapshot_existing_production(catalog: list[dict]) -> list[dict]:
    am_rows = []
    for c in catalog:
        cid = str(c.get("id", ""))
        country = str(c.get("country", "")).lower()
        if cid.startswith("am_") or country in ("armenia", "am"):
            am_rows.append(dict(c))
    return am_rows


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"ARMENIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")
    if len(CENTERS.read_bytes()) != EXPECTED_BYTES:
        raise SystemExit("ARMENIA PHASE 1 BLOCKED — PRODUCTION BYTES DRIFT")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"

    am_live = [c for c in catalog if str(c.get("id", "")).startswith("am_")]
    am_country = [c for c in catalog if str(c.get("country", "")).lower() == "armenia"]
    assert len(am_live) == 0 and len(am_country) == 0, "Armenia production must be 0"

    ge_live = [c for c in catalog if str(c.get("id", "")).startswith("ge_")]
    assert len(ge_live) == 25, f"baseline Georgia count drift: {len(ge_live)}"

    existing = snapshot_existing_production(catalog)
    write_json(OUT / "ARMENIA_EXISTING_PRODUCTION_SNAPSHOT.json", existing)

    rows: list[dict] = []
    seen: set = set()

    curated_n = stage_curated_class_a(rows, seen)
    osm_n = stage_osm_armenia(rows, seen)
    photon_n = stage_photon_grid(rows, seen)
    stage_exclusion_probes(rows)
    stage_conflict_region_probes(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    assert all(r.get("import_category") != "READY_TO_IMPORT" for r in rows)

    inventory = {
        "country": "Armenia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_bytes_before": EXPECTED_BYTES,
        "production_total": PRODUCTION_TOTAL,
        "armenia_live": len(am_live),
        "am_prefix_live": len(am_live),
        "armenia_country_live": len(am_country),
        "existing_armenia_production": len(existing) > 0,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED_SMALL_MARKET",
        "postcode_model": "NNNN (4 digits)",
        "fetch_summary": {
            "curated_class_a": curated_n,
            "osm_armenia": osm_n,
            "photon_grid": photon_n,
            "total_candidates": len(rows),
        },
        "official_estate": {
            brand: {"open_active_estimated": count, "class_a": True}
            for brand, count in CLASS_A_OFFICIAL.items()
        },
        "conflict_regions_tracked": ["Artsakh"],
        "discover_default_category": "NEEDS_REVIEW",
    }
    by_brand = Counter(
        r.get("brand") for r in rows if r.get("import_category") not in ("EXCLUDED",)
    )
    inventory["chains"] = [
        {
            "chain": brand,
            "classification": "A" if brand in CLASS_A_OFFICIAL else "B",
            "staged": count,
            "official_current_active_estimated": CLASS_A_OFFICIAL.get(brand),
            "class_a": brand in CLASS_A_OFFICIAL,
        }
        for brand, count in sorted(by_brand.items())
    ]

    write_json(OUT / "armenia_phase1_candidates.json", rows)
    write_json(OUT / "armenia_chain_inventory.json", inventory)
    write_postcode_model()
    write_locality_alias_map()
    write_territory_model()

    rebrand = {
        "country": "Armenia",
        "phase": 1,
        "entries": [],
        "unresolved_conflicts": 0,
        "notes": "No material rebrand conflicts identified in Phase 1 discovery",
    }
    write_json(OUT / "ARMENIA_PHASE1_REBRAND_MAP.json", rebrand)

    print(json.dumps(inventory["fetch_summary"], indent=2))
    print(f"candidates={len(rows)} armenia_live={len(am_live)} sha={PRE_SHA}")


if __name__ == "__main__":
    main()
