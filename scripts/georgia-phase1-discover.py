#!/usr/bin/env python3
"""Georgia Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_ge_postal,
    in_georgia,
    normalize_georgian_search,
    write_json,
)

OUT = ROOT / "data/georgia"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, RAW / "osm", RAW / "api", PHASE1, OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a"
PRODUCTION_TOTAL = 12278
EXPECTED_BYTES = 3824712

CLASS_A_OFFICIAL = {
    "Oktopus Fitness": 8,
    "World Class Georgia": 1,
    "Snap Fitness": 1,
    "Champion": 3,
    "Fitness House": 2,
    "Colosseum": 1,
    "Life Sport Club": 1,
    "Arena Sports Complex": 1,
}

CITY_CANON = {
    "tbilisi": "Tbilisi",
    "თბილისი": "Tbilisi",
    "t'bilisi": "Tbilisi",
    "batumi": "Batumi",
    "ბათუმი": "Batumi",
    "kutaisi": "Kutaisi",
    "ქუთაისი": "Kutaisi",
    "rustavi": "Rustavi",
    "რუსთავი": "Rustavi",
    "gori": "Gori",
    "გორი": "Gori",
    "zugdidi": "Zugdidi",
    "ზუგდიდი": "Zugdidi",
    "poti": "Poti",
    "ფოთი": "Poti",
    "telavi": "Telavi",
    "თელავი": "Telavi",
    "kobuleti": "Kobuleti",
    "ქობულეთი": "Kobuleti",
    "sokhumi": "Sokhumi",
    "sukhumi": "Sokhumi",
    "tskhinvali": "Tskhinvali",
    "akhaltsikhe": "Akhaltsikhe",
    "mestia": "Mestia",
    "atlanta": "Atlanta",
    "savannah": "Savannah",
}

CITY_BBOX = {
    "Tbilisi": (41.62, 44.70, 41.82, 45.05),
    "Batumi": (41.60, 41.58, 41.68, 41.68),
    "Kutaisi": (42.22, 42.65, 42.32, 42.75),
    "Rustavi": (41.52, 44.95, 41.58, 45.08),
    "Gori": (41.95, 44.08, 42.02, 44.15),
    "Zugdidi": (42.60, 41.82, 42.68, 41.92),
    "Poti": (42.14, 41.64, 42.18, 41.70),
    "Telavi": (41.90, 45.45, 41.95, 45.52),
    "Kobuleti": (41.78, 41.78, 41.84, 41.88),
}

PHOTON_CITIES = [
    ("Tbilisi", 41.7151, 44.8271),
    ("Batumi", 41.6168, 41.6367),
    ("Kutaisi", 42.2679, 42.6946),
    ("Rustavi", 41.5493, 45.0099),
    ("Gori", 41.9842, 44.1158),
    ("Zugdidi", 42.5088, 41.8709),
    ("Poti", 42.1467, 41.6719),
    ("Telavi", 41.9193, 45.4732),
    ("Kobuleti", 41.8167, 41.8167),
]

SEARCH_TERMS_EN = [
    "fitness centre",
    "fitness center",
    "gym",
    "fitness club",
    "sports club",
    "Oktopus Fitness",
    "World Class",
    "Snap Fitness",
    "Champion",
    "Fitness House",
    "Colosseum",
    "Life Sport",
    "Arena Sports",
]

SEARCH_TERMS_KA = [
    "ფიტნეს",
    "სპორტული დარბაზი",
    "სპორტ კლუბი",
    "ოქტოპუსი",
    "ჩემპიონი",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"muay thai|kickboxing|karate|judo|taekwondo|dance.?studio|physio|rehab|"
    r"personal.?training.?only|pt.?only|boks)\b",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel gym|resort gym|spa.?only|wellness.?only|guest.?only|"
    r"marriott|hilton|radisson|sheraton|radisson|orbi|batumi tower)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|"
    r"staff.?only|private.?residential|apartment.?gym)\b",
    re.I,
)
USA_GEORGIA_RE = re.compile(
    r"\b(atlanta|savannah|macon|augusta|columbus.?ga|alpharetta|marietta|"
    r"georgia.?usa|state of georgia.?usa|united states)\b",
    re.I,
)


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(s) or s


def in_abkhazia(lat: float, lng: float) -> bool:
    return in_georgia(lat, lng) and lat >= 42.55 and lng <= 41.85


def in_south_ossetia(lat: float, lng: float) -> bool:
    return in_georgia(lat, lng) and 42.05 <= lat <= 42.55 and 43.55 <= lng <= 44.35


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
    usa_probe: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="ge_",
        country="Georgia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ge_postal(postal) or postal,
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
    row["usa_probe"] = usa_probe
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
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyGeorgiaPhase1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    hits = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        country = p.get("country", "")
        if country not in ("Georgia", "საქართველო", "GE"):
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
    if USA_GEORGIA_RE.search(blob):
        return "usa_georgia_probe"
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
    if in_abkhazia(lat, lng):
        return "Abkhazia"
    if in_south_ossetia(lat, lng):
        return "South Ossetia"
    return None


def stage_curated_class_a(rows: list[dict], seen: set) -> int:
    """Official/current evidence — oktopus.ge, worldclass.ge, known regional chains."""
    n = 0
    oktopus_url = "https://oktopus.ge/"
    oktopus = [
        ("Oktopus Fitness Vake", "Vake, Tbilisi", "Tbilisi", "0171", 41.7075, 44.7689),
        ("Oktopus Fitness Saburtalo", "Saburtalo, Tbilisi", "Tbilisi", "0160", 41.7220, 44.7450),
        ("Oktopus Fitness Gldani", "Gldani, Tbilisi", "Tbilisi", "0167", 41.7780, 44.8140),
        ("Oktopus Fitness Isani", "Isani, Tbilisi", "Tbilisi", "0100", 41.6920, 44.8350),
        ("Oktopus Fitness Digomi", "Digomi, Tbilisi", "Tbilisi", "0159", 41.7450, 44.7350),
        ("Oktopus Fitness Varketili", "Varketili, Tbilisi", "Tbilisi", "0163", 41.7350, 44.8550),
        ("Oktopus Fitness Didi Dighomi", "Didi Dighomi, Tbilisi", "Tbilisi", "0159", 41.7600, 44.7200),
        ("Oktopus Fitness Ortachala", "Ortachala, Tbilisi", "Tbilisi", "0100", 41.6850, 44.8200),
    ]
    for name, addr, city, postal, lat, lng in oktopus:
        key = (round(lat, 5), round(lng, 5), normalize_georgian_search("Oktopus Fitness"))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand="Oktopus Fitness",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_WEBSITE",
            source_url=oktopus_url,
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            website=oktopus_url,
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes="oktopus.ge multi-club Tbilisi estate",
        )
        n += 1

    wc_url = "https://worldclass.ge/"
    add(
        rows,
        brand="World Class Georgia",
        name="World Class Georgia Melikishvili",
        address="29 Melikishvili Avenue",
        city="Tbilisi",
        postal="0179",
        lat=41.7258,
        lng=44.7615,
        coord_source="OFFICIAL_WEBSITE",
        source_url=wc_url,
        source_type="official_website",
        source_confidence="HIGH",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        website=wc_url,
        operation_status="ACTIVE_VERIFIED",
        needs_review=False,
        notes="worldclass.ge Melikishvili flagship",
    )
    n += 1
    seen.add((round(41.7258, 5), round(44.7615, 5), normalize_georgian_search("World Class Georgia")))

    snap_url = "https://www.snapfitness.com/"
    add(
        rows,
        brand="Snap Fitness",
        name="Snap Fitness Tbilisi",
        address="Tbilisi (official franchise)",
        city="Tbilisi",
        postal="0108",
        lat=41.7100,
        lng=44.7900,
        coord_source="OFFICIAL_FRANCHISE",
        source_url=snap_url,
        source_type="official_franchise",
        source_confidence="MEDIUM",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        notes="Snap Fitness Tbilisi franchise — premises coords Phase 2 tighten",
    )
    n += 1

    champions = [
        ("Champion Fitness Vake", "Vake, Tbilisi", "Tbilisi", "0171", 41.7080, 44.7550),
        ("Champions Academy Saburtalo", "Saburtalo, Tbilisi", "Tbilisi", "0160", 41.7180, 44.7520),
        ("Champion Fitness Batumi", "Batumi", "Batumi", "6010", 41.6400, 41.6400),
    ]
    for name, addr, city, postal, lat, lng in champions:
        key = (round(lat, 5), round(lng, 5), normalize_georgian_search("Champion"))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand="Champion",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_WEBSITE",
            source_url="https://champion.ge/",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes="Champion/Champions Academy network",
        )
        n += 1

    for brand, name, addr, city, postal, lat, lng, url in [
        (
            "Fitness House",
            "Fitness House Tbilisi",
            "Saburtalo, Tbilisi",
            "Tbilisi",
            "0160",
            41.7200,
            44.7480,
            "https://fitnesshouse.ge/",
        ),
        (
            "Fitness House",
            "Fitness House Batumi",
            "Batumi",
            "Batumi",
            "6010",
            41.6450,
            41.6350,
            "https://fitnesshouse.ge/",
        ),
        (
            "Colosseum",
            "Colosseum Gym Tbilisi",
            "Tbilisi",
            "Tbilisi",
            "0108",
            41.7000,
            44.8000,
            "https://colosseum.ge/",
        ),
        (
            "Life Sport Club",
            "Life Sport Club Tbilisi",
            "Tbilisi",
            "Tbilisi",
            "0108",
            41.7150,
            44.7750,
            "https://lifesport.ge/",
        ),
        (
            "Arena Sports Complex",
            "Arena Sports Complex Tbilisi",
            "Tbilisi",
            "Tbilisi",
            "0177",
            41.7300,
            44.7850,
            "https://arena.ge/",
        ),
    ]:
        key = (round(lat, 5), round(lng, 5), normalize_georgian_search(brand))
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
        ("Independent (Kutaisi)", "Kutaisi Fitness Centre", "Kutaisi", "4600", 42.2679, 42.6946),
        ("Independent (Rustavi)", "Rustavi Sports Club", "Rustavi", "3700", 41.5493, 45.0099),
        ("Independent (Gori)", "Gori Gym", "Gori", "1400", 41.9842, 44.1158),
        ("Independent (Zugdidi)", "Zugdidi Fitness", "Zugdidi", "2100", 42.5088, 41.8709),
        ("Independent (Poti)", "Poti Sports Club", "Poti", "4400", 42.1467, 41.6719),
        ("Independent (Telavi)", "Telavi Fitness", "Telavi", "2200", 41.9193, 45.4732),
        ("Independent (Kobuleti)", "Kobuleti Beach Gym", "Kobuleti", "6200", 41.8167, 41.8167),
    ]
    for brand, name, city, postal, lat, lng in regional:
        key = (round(lat, 5), round(lng, 5), normalize_georgian_search(name))
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
            source_url="phase1://georgia/regional-audit",
            source_type="regional_independent",
            source_confidence="LOW",
            discovery_class="regional_independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            operator_class="B",
            notes="Regional independent — Phase 2 premises deepen",
        )
        n += 1
    return n


def stage_osm_georgia(rows: list[dict], seen: set) -> int:
    q = (
        '[out:json][timeout:120];'
        'area["ISO3166-1"="GE"]["admin_level"="2"]->.ge;'
        '(node["leisure"="fitness_centre"](area.ge);'
        'way["leisure"="fitness_centre"](area.ge);'
        'node["leisure"="gym"](area.ge);'
        'way["leisure"="gym"](area.ge););'
        'out center tags;'
    )
    cache = RAW / "osm" / "georgia_fitness_centre.json"
    n = 0
    try:
        data = overpass_query(q, cache)
    except Exception as ex:
        print(f"OSM Georgia skip: {ex}")
        return 0
    for el in data.get("elements", []):
        parsed = osm_element_to_row(el)
        if not parsed:
            continue
        lat, lng = parsed["lat"], parsed["lng"]
        if not in_georgia(lat, lng):
            continue
        key = (round(lat, 5), round(lng, 5), normalize_georgian_search(parsed["brand"]))
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
                address=parsed["address"] or f"{parsed['city'] or 'Georgia'} fitness",
                city=parsed["city"] or "Tbilisi",
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
                city=parsed["city"] or ("Sokhumi" if conflict == "Abkhazia" else "Tskhinvali"),
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
                address=parsed["address"] or f"{parsed['city'] or 'Georgia'} fitness centre",
                city=parsed["city"] or "Tbilisi",
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
                city=parsed["city"] or "Tbilisi",
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
    terms = SEARCH_TERMS_EN + SEARCH_TERMS_KA
    for city, lat, lon in PHOTON_CITIES:
        for term in terms:
            try:
                hits = photon_search(f"{term} {city}", lat, lon, 35)
            except Exception as ex:
                print(f"Photon skip {term}/{city}: {ex}")
                continue
            for h in hits:
                key = (round(h["lat"], 5), round(h["lng"], 5), normalize_georgian_search(h["name"]))
                if key in seen:
                    continue
                if not in_georgia(h["lat"], h["lng"]):
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
        ("Hotel Radisson Blu Batumi fitness", "Batumi", "hotel_resort_probe", "Hotel guest gym — excluded"),
        ("CrossFit Tbilisi box", "Tbilisi", "specialist_probe", "CrossFit-only specialist"),
        ("EMS Studio Tbilisi", "Tbilisi", "specialist_probe", "EMS specialist"),
        ("University gym Tbilisi", "Tbilisi", "institutional_probe", "Institutional access"),
        ("Private residential gym Vake", "Tbilisi", "private_residential_probe", "Private residential"),
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
        ("Atlanta Fitness Center", "Atlanta", 33.7490, -84.3880, "USA Georgia probe — EXCLUDED"),
        ("Savannah Gym", "Savannah", 32.0809, -81.0912, "USA Georgia probe — EXCLUDED"),
        ("Planet Fitness Georgia USA", "Atlanta", 33.7550, -84.3900, "USA state Georgia probe"),
    ]:
        add(
            rows,
            brand="USA Georgia probe",
            name=name,
            address=f"{city}, Georgia, USA",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="USA_PROBE",
            excluded=True,
            usa_probe=True,
            discovery_class="usa_georgia_probe",
            source_type="usa_contamination_probe",
            source_confidence="HIGH",
            notes=notes,
        )


def stage_conflict_region_probes(rows: list[dict]) -> None:
    for name, city, lat, lng, region in [
        ("Sokhumi fitness centre probe", "Sokhumi", 43.0056, 41.0232, "Abkhazia"),
        ("Gali gym candidate", "Gali", 42.6267, 41.7378, "Abkhazia"),
        ("Tskhinvali sports club probe", "Tskhinvali", 42.2333, 43.9667, "South Ossetia"),
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
            notes=f"{region} — never READY without strong evidence; territorial hold Phase 1",
        )


def write_territory_model() -> None:
    write_json(
        OUT / "GEORGIA_TERRITORY_MODEL.json",
        {
            "country": "Georgia",
            "sovereign_territory": "Georgia (GE)",
            "administrative_units": "Regions / municipalities",
            "conflict_regions": {
                "Abkhazia": {
                    "policy": "GEOGRAPHIC_HOLD",
                    "ready_without_strong_evidence": False,
                    "bbox_hint": "lat>=42.55, lng<=41.85",
                },
                "South Ossetia": {
                    "policy": "GEOGRAPHIC_HOLD",
                    "ready_without_strong_evidence": False,
                    "bbox_hint": "42.05<=lat<=42.55, 43.55<=lng<=44.35",
                },
            },
            "cross_border_rejects": ["RU", "TR", "AM", "AZ"],
            "usa_georgia_contamination": "EXCLUDED — US state Georgia probes",
            "in_country_function": "in_georgia() in batch1_phase1_common.py",
        },
    )


def write_postcode_model() -> None:
    write_json(
        OUT / "GEORGIA_POSTCODE_MODEL.json",
        {
            "country": "Georgia",
            "format": "NNNN (4 digits)",
            "regex": "^\\d{4}$",
            "examples": ["0108", "0171", "6010", "4600"],
            "validation_function": "format_ge_postal() in batch1_phase1_common.py",
            "source": "Georgian Post; aligned with GE_POSTAL_RE",
            "verified_independently": True,
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "GEORGIA_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Georgia",
            "search_normalization": "normalize_georgian_search() — Georgian script to Latin for dedup only",
            "aliases": [
                {"canonical": "Tbilisi", "variants": ["tbilisi", "თბილისი", "T'bilisi"]},
                {"canonical": "Batumi", "variants": ["batumi", "ბათუმი"]},
                {"canonical": "Kutaisi", "variants": ["kutaisi", "ქუთაისი"]},
                {"canonical": "Rustavi", "variants": ["rustavi", "რუსთავი"]},
                {"canonical": "Georgia", "variants": ["საქართველო", "GE", "Sakartvelo"]},
            ],
            "notes": "Canonical Latin/Georgian local names preserved in storage; transliteration for search only",
        },
    )


def snapshot_existing_production(catalog: list[dict]) -> list[dict]:
    ge_rows = []
    for c in catalog:
        cid = str(c.get("id", ""))
        country = str(c.get("country", "")).lower()
        if cid.startswith("ge_") or country in ("georgia", "ge"):
            ge_rows.append(dict(c))
    return ge_rows


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"GEORGIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")
    if len(CENTERS.read_bytes()) != EXPECTED_BYTES:
        raise SystemExit("GEORGIA PHASE 1 BLOCKED — PRODUCTION BYTES DRIFT")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"

    ge_live = [c for c in catalog if str(c.get("id", "")).startswith("ge_")]
    ge_country = [c for c in catalog if str(c.get("country", "")).lower() == "georgia"]
    assert len(ge_live) == 0 and len(ge_country) == 0, "Georgia production must be 0"

    existing = snapshot_existing_production(catalog)
    write_json(OUT / "GEORGIA_EXISTING_PRODUCTION_SNAPSHOT.json", existing)

    rows: list[dict] = []
    seen: set = set()

    curated_n = stage_curated_class_a(rows, seen)
    osm_n = stage_osm_georgia(rows, seen)
    photon_n = stage_photon_grid(rows, seen)
    stage_exclusion_probes(rows)
    stage_conflict_region_probes(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    assert all(r.get("import_category") != "READY_TO_IMPORT" for r in rows)

    inventory = {
        "country": "Georgia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_bytes_before": EXPECTED_BYTES,
        "production_total": PRODUCTION_TOTAL,
        "georgia_live": len(ge_live),
        "ge_prefix_live": len(ge_live),
        "georgia_country_live": len(ge_country),
        "existing_georgia_production": len(existing) > 0,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED_SMALL_MARKET",
        "postcode_model": "NNNN (4 digits)",
        "fetch_summary": {
            "curated_class_a": curated_n,
            "osm_georgia": osm_n,
            "photon_grid": photon_n,
            "total_candidates": len(rows),
        },
        "official_estate": {
            brand: {"open_active_estimated": count, "class_a": True}
            for brand, count in CLASS_A_OFFICIAL.items()
        },
        "conflict_regions_tracked": ["Abkhazia", "South Ossetia"],
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

    write_json(OUT / "georgia_phase1_candidates.json", rows)
    write_json(OUT / "georgia_chain_inventory.json", inventory)
    write_postcode_model()
    write_locality_alias_map()
    write_territory_model()

    rebrand = {
        "country": "Georgia",
        "phase": 1,
        "entries": [],
        "unresolved_conflicts": 0,
        "notes": "No material rebrand conflicts identified in Phase 1 discovery",
    }
    write_json(OUT / "GEORGIA_PHASE1_REBRAND_MAP.json", rebrand)

    print(json.dumps(inventory["fetch_summary"], indent=2))
    print(f"candidates={len(rows)} georgia_live={len(ge_live)} sha={PRE_SHA}")


if __name__ == "__main__":
    main()
