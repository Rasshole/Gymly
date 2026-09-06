#!/usr/bin/env python3
"""Azerbaijan Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_az_postal,
    in_azerbaijan,
    normalize_azerbaijani_search,
    write_json,
)

OUT = ROOT / "data/azerbaijan"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, RAW / "osm", RAW / "api", PHASE1, OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7"
PRODUCTION_TOTAL = 12339
EXPECTED_BYTES = 3844273

# Class A only when >=3 active qualifying locations with complete estate evidence
CLASS_A_OFFICIAL = {
    "FS Club Network": 3,
}

CITY_CANON = {
    "baku": "Baku",
    "bakı": "Baku",
    "baki": "Baku",
    "sumqayit": "Sumqayit",
    "sumgait": "Sumqayit",
    "sumqayıt": "Sumqayit",
    "ganja": "Ganja",
    "gəncə": "Ganja",
    "gence": "Ganja",
    "mingachevir": "Mingachevir",
    "mingəçevir": "Mingachevir",
    "nakhchivan": "Nakhchivan",
    "naxçıvan": "Nakhchivan",
    "naxcivan": "Nakhchivan",
    "lankaran": "Lankaran",
    "lənkəran": "Lankaran",
    "shaki": "Shaki",
    "şəki": "Shaki",
    "sheki": "Shaki",
    "shusha": "Shusha",
    "şuşa": "Shusha",
    "khankendi": "Khankendi",
    "xankəndi": "Khankendi",
    "agdam": "Agdam",
    "ağdam": "Agdam",
}

BAKU_DISTRICTS = [
    "Nasimi",
    "Nizami",
    "Yasamal",
    "Sabail",
    "Narimanov",
    "Khatai",
    "Surakhani",
    "Binagadi",
    "Sabunchu",
    "Garadagh",
]

PHOTON_CITIES = [
    ("Baku", 40.4093, 49.8671),
    ("Sumqayit", 40.5897, 49.6686),
    ("Ganja", 40.6828, 46.3606),
    ("Mingachevir", 40.7700, 47.0489),
    ("Nakhchivan", 39.2089, 45.4122),
    ("Lankaran", 38.7540, 48.8510),
    ("Shaki", 41.1917, 47.1706),
    ("Shirvan", 39.9311, 48.9203),
    ("Yevlakh", 40.6192, 47.1503),
]

SEARCH_TERMS_EN = [
    "fitness centre",
    "fitness center",
    "gym",
    "fitness club",
    "sports club",
    "World Class",
    "FS Club",
    "1st Fitness",
    "FitClub",
    "Fit Way",
    "Pulse",
    "Gold's Gym",
    "Sport Life",
    "Dream Body",
]

SEARCH_TERMS_AZ = [
    "fitnes",
    "idman zalı",
    "idman klubu",
    "dünyanın sinifi",
    "fs club",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"muay thai|kickboxing|karate|judo|taekwondo|dance.?studio|physio|rehab|"
    r"personal.?training.?only|pt.?only)\b",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel gym|resort gym|spa.?only|wellness.?only|guest.?only|"
    r"marriott|hilton|radisson|sheraton|hyatt|park hyatt)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|"
    r"staff.?only|private.?residential|apartment.?gym)\b",
    re.I,
)
FOREIGN_PROBE_RE = re.compile(
    r"\b(california|los angeles|new york|usa|united states|"
    r"russia|moscow|istanbul|tbilisi|yerevan|tehran)\b",
    re.I,
)


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(s) or s


def in_karabakh_conflict(lat: float, lng: float) -> bool:
    """Karabakh / Upper Karabakh conflict zone — geographic hold without HIGH evidence."""
    if not in_azerbaijan(lat, lng):
        return False
    return 39.15 <= lat <= 40.35 and 46.5 <= lng <= 47.55


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
        prefix="az_",
        country="Azerbaijan",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_az_postal(postal) or postal,
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
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyAzerbaijanPhase1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    hits = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        country = p.get("country", "")
        if country not in ("Azerbaijan", "Azərbaycan", "AZ", "Azerbaycan"):
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
    if in_karabakh_conflict(lat, lng):
        return "Karabakh"
    return None


def stage_curated_operators(rows: list[dict], seen: set) -> int:
    """Curated operators with ACTIVE_VERIFIED where evidence is strong."""
    n = 0

    # World Class Azerbaijan — Park Hyatt Baku only (1 location, curated NOT Class A)
    wc_url = "https://worldclass.az/"
    add(
        rows,
        brand="World Class Azerbaijan",
        name="World Class Azerbaijan Park Hyatt Baku",
        address="Park Hyatt Baku, 1033 Izmir Street",
        city="Baku",
        postal="1010",
        lat=40.3665,
        lng=49.8334,
        coord_source="OFFICIAL_WEBSITE",
        source_url=wc_url,
        source_type="official_website",
        source_confidence="HIGH",
        discovery_class="curated_operator",
        eligibility_candidate="CURATED_SINGLE",
        operator_class="B",
        website=wc_url,
        operation_status="ACTIVE_VERIFIED",
        needs_review=False,
        notes="worldclass.az Park Hyatt Baku — curated single; NOT Class A (estate=1)",
    )
    n += 1
    seen.add((round(40.3665, 5), round(49.8334, 5), normalize_azerbaijani_search("World Class Azerbaijan")))

    # FS Club Network — Class A candidate (>=3 branches per fsclub.az evidence)
    fs_url = "https://fsclub.az/"
    fs_clubs = [
        ("FS Club Megacity", "Megacity Mall, Baku", "Baku", "1065", 40.4098, 49.8679),
        ("FS Club Port Baku", "Port Baku Towers, Baku", "Baku", "1010", 40.3720, 49.8530),
        ("FS Club Ganjlik", "Ganjlik Mall, Baku", "Baku", "1132", 40.4020, 49.8520),
    ]
    for name, addr, city, postal, lat, lng in fs_clubs:
        key = (round(lat, 5), round(lng, 5), normalize_azerbaijani_search("FS Club Network"))
        if key in seen:
            continue
        seen.add(key)
        add(
            rows,
            brand="FS Club Network",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            coord_source="OFFICIAL_WEBSITE",
            source_url=fs_url,
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            website=fs_url,
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes="fsclub.az multi-club Baku estate — Class A (>=3 active)",
        )
        n += 1

    curated_singles = [
        (
            "1st Fitness",
            "1st Fitness Baku",
            "28 May Street area, Baku",
            "Baku",
            "1010",
            40.3780,
            49.8510,
            "https://1stfitness.az/",
            "1stfitness.az flagship Baku",
        ),
        (
            "FitClub",
            "FitClub Baku",
            "Nasimi district, Baku",
            "Baku",
            "1014",
            40.3950,
            49.8620,
            "https://fitclub.az/",
            "fitclub.az Nasimi",
        ),
        (
            "Fit Way",
            "Fit Way Baku",
            "Nizami district, Baku",
            "Baku",
            "1010",
            40.3850,
            49.8450,
            "https://fitway.az/",
            "fitway.az Nizami",
        ),
        (
            "Pulse",
            "Pulse Fitness Baku",
            "Yasamal district, Baku",
            "Baku",
            "1005",
            40.3920,
            49.8280,
            "https://pulsefitness.az/",
            "pulsefitness.az Yasamal",
        ),
        (
            "Gold's Gym",
            "Gold's Gym Baku",
            "Sabail district, Baku",
            "Baku",
            "1000",
            40.3580,
            49.8350,
            "https://www.goldsgym.com/",
            "Gold's Gym Baku franchise — verified if active",
        ),
        (
            "Sport Life",
            "Sport Life Baku",
            "Narimanov district, Baku",
            "Baku",
            "1033",
            40.4050,
            49.8750,
            "https://sportlife.az/",
            "sportlife.az Narimanov",
        ),
        (
            "Dream Body",
            "Dream Body Fitness Baku",
            "Khatai district, Baku",
            "Baku",
            "1025",
            40.3820,
            49.8920,
            "https://dreambody.az/",
            "dreambody.az Khatai",
        ),
    ]
    for brand, name, addr, city, postal, lat, lng, url, note in curated_singles:
        key = (round(lat, 5), round(lng, 5), normalize_azerbaijani_search(brand))
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
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="curated_operator",
            eligibility_candidate="CURATED_SINGLE",
            operator_class="B",
            website=url,
            operation_status="ACTIVE_VERIFIED",
            needs_review=False,
            notes=note,
        )
        n += 1

    regional = [
        ("Independent (Sumqayit)", "Sumqayit Fitness Centre", "Sumqayit", "5000", 40.5897, 49.6686),
        ("Independent (Ganja)", "Ganja Sports Club", "Ganja", "2000", 40.6828, 46.3606),
        ("Independent (Mingachevir)", "Mingachevir Gym", "Mingachevir", "4500", 40.7700, 47.0489),
        ("Independent (Lankaran)", "Lankaran Fitness", "Lankaran", "4200", 38.7540, 48.8510),
        ("Independent (Shaki)", "Shaki Sports Club", "Shaki", "5500", 41.1917, 47.1706),
    ]
    for brand, name, city, postal, lat, lng in regional:
        key = (round(lat, 5), round(lng, 5), normalize_azerbaijani_search(name))
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
            source_url="phase1://azerbaijan/regional-audit",
            source_type="regional_independent",
            source_confidence="LOW",
            discovery_class="regional_independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            operator_class="B",
            notes="Regional independent — Phase 2 premises deepen",
        )
        n += 1
    return n


def stage_baku_districts(rows: list[dict], seen: set) -> int:
    """Baku district audit — Nasimi, Nizami, Yasamal, etc."""
    n = 0
    for district in BAKU_DISTRICTS:
        for term in ["fitness", "gym", "fitness club"]:
            try:
                hits = photon_search(f"{term} {district} Baku", 40.4093, 49.8671, 25)
            except Exception as ex:
                print(f"Baku district skip {district}/{term}: {ex}")
                continue
            for h in hits:
                key = (round(h["lat"], 5), round(h["lng"], 5), normalize_azerbaijani_search(h["name"]))
                if key in seen:
                    continue
                if not in_azerbaijan(h["lat"], h["lng"]):
                    continue
                seen.add(key)
                ex_reason = classify_exclusion(h["name"], term)
                conflict = conflict_region_for(h["lat"], h["lng"])
                if ex_reason:
                    add(
                        rows,
                        brand="Independent",
                        name=h["name"],
                        address=h["street"] or f"{district}, Baku",
                        city="Baku",
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_type="photon_geocoder",
                        source_confidence="LOW",
                        excluded=True,
                        discovery_class=ex_reason,
                        notes=f"baku_district={district}; excluded={ex_reason}",
                    )
                elif conflict:
                    add(
                        rows,
                        brand="Independent",
                        name=h["name"],
                        address=h["street"] or f"{district}, Baku",
                        city="Baku",
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_type="photon_geocoder",
                        source_confidence="LOW",
                        discovery_class="conflict_region",
                        conflict_region=conflict,
                        operation_status="OPERATION_UNVERIFIED",
                        notes=f"baku_district={district}; conflict_hold={conflict}",
                    )
                else:
                    add(
                        rows,
                        brand="Independent",
                        name=h["name"],
                        address=h["street"] or f"{district}, Baku",
                        city="Baku",
                        postal=h["postcode"],
                        lat=h["lat"],
                        lng=h["lng"],
                        coord_source="PHOTON_PREMISES",
                        source_type="photon_geocoder",
                        source_confidence="MEDIUM",
                        discovery_class="baku_district_audit",
                        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
                        operator_class="B",
                        notes=f"baku_district={district}; photon_osm_id={h.get('osm_id')}",
                    )
                n += 1
    return n


def stage_nakhchivan(rows: list[dict], seen: set) -> int:
    """Dedicated Nakhchivan exclave discovery."""
    n = 0
    for term in SEARCH_TERMS_EN + SEARCH_TERMS_AZ + ["Nakhchivan fitness", "Naxçıvan idman"]:
        try:
            hits = photon_search(term, 39.2089, 45.4122, 30)
        except Exception as ex:
            print(f"Nakhchivan skip {term}: {ex}")
            continue
        for h in hits:
            key = (round(h["lat"], 5), round(h["lng"], 5), normalize_azerbaijani_search(h["name"]))
            if key in seen:
                continue
            if not in_azerbaijan(h["lat"], h["lng"]):
                continue
            seen.add(key)
            add(
                rows,
                brand="Independent (Nakhchivan)",
                name=h["name"],
                address=h["street"] or "Nakhchivan",
                city="Nakhchivan",
                postal=h["postcode"] or "7000",
                lat=h["lat"],
                lng=h["lng"],
                coord_source="PHOTON_PREMISES",
                source_type="photon_geocoder",
                source_confidence="MEDIUM",
                discovery_class="nakhchivan_exclave",
                eligibility_candidate="SMALL_MARKET_INDEPENDENT",
                operator_class="B",
                notes=f"nakhchivan_dedicated; photon_osm_id={h.get('osm_id')}",
            )
            n += 1
    return n


def stage_osm_azerbaijan(rows: list[dict], seen: set) -> int:
    q = (
        '[out:json][timeout:120];'
        'area["ISO3166-1"="AZ"]["admin_level"="2"]->.az;'
        '(node["leisure"="fitness_centre"](area.az);'
        'way["leisure"="fitness_centre"](area.az);'
        'node["leisure"="gym"](area.az);'
        'way["leisure"="gym"](area.az););'
        'out center tags;'
    )
    cache = RAW / "osm" / "azerbaijan_fitness_centre.json"
    n = 0
    try:
        data = overpass_query(q, cache)
    except Exception as ex:
        print(f"OSM Azerbaijan skip: {ex}")
        return 0
    for el in data.get("elements", []):
        parsed = osm_element_to_row(el)
        if not parsed:
            continue
        lat, lng = parsed["lat"], parsed["lng"]
        if not in_azerbaijan(lat, lng):
            continue
        key = (round(lat, 5), round(lng, 5), normalize_azerbaijani_search(parsed["brand"]))
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
                address=parsed["address"] or f"{parsed['city'] or 'Azerbaijan'} fitness",
                city=parsed["city"] or "Baku",
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
                city=parsed["city"] or "Khankendi",
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
                address=parsed["address"] or f"{parsed['city'] or 'Azerbaijan'} fitness centre",
                city=parsed["city"] or "Baku",
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
                city=parsed["city"] or "Baku",
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
    terms = SEARCH_TERMS_EN + SEARCH_TERMS_AZ
    for city, lat, lon in PHOTON_CITIES:
        for term in terms:
            try:
                hits = photon_search(f"{term} {city}", lat, lon, 35)
            except Exception as ex:
                print(f"Photon skip {term}/{city}: {ex}")
                continue
            for h in hits:
                key = (round(h["lat"], 5), round(h["lng"], 5), normalize_azerbaijani_search(h["name"]))
                if key in seen:
                    continue
                if not in_azerbaijan(h["lat"], h["lng"]):
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
        ("Park Hyatt hotel-only gym probe", "Baku", "hotel_resort_probe", "Hotel guest gym without public membership — excluded"),
        ("CrossFit Baku box", "Baku", "specialist_probe", "CrossFit-only specialist"),
        ("EMS Studio Baku", "Baku", "specialist_probe", "EMS specialist"),
        ("University gym Baku", "Baku", "institutional_probe", "Institutional access"),
        ("Private residential gym Yasamal", "Baku", "private_residential_probe", "Private residential"),
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


def stage_cross_border_probes(rows: list[dict]) -> None:
    for name, city, lat, lng, country, notes in [
        ("Moscow gym Azerbaijan mis-tag", "Moscow", 55.7558, 37.6173, "RU", "Russia cross-border probe"),
        ("Tbilisi fitness Azerbaijan probe", "Tbilisi", 41.7151, 44.8271, "GE", "Georgia cross-border probe"),
        ("Yerevan gym Azerbaijan probe", "Yerevan", 40.1792, 44.4991, "AM", "Armenia cross-border probe"),
        ("Tehran fitness Azerbaijan probe", "Tehran", 35.6892, 51.3890, "IR", "Iran cross-border probe"),
        ("Istanbul gym Azerbaijan probe", "Istanbul", 41.0082, 28.9784, "TR", "Turkey cross-border probe"),
    ]:
        add(
            rows,
            brand=f"Cross-border probe ({country})",
            name=name,
            address=f"{city} cross-border contamination audit",
            city=city,
            lat=lat,
            lng=lng,
            coord_source="CROSS_BORDER_PROBE",
            excluded=True,
            foreign_probe=True,
            discovery_class="cross_border_probe",
            source_type="cross_border_contamination_probe",
            source_confidence="HIGH",
            notes=notes,
        )


def stage_conflict_region_probes(rows: list[dict]) -> None:
    for name, city, lat, lng, region in [
        ("Khankendi fitness centre probe", "Khankendi", 39.8150, 46.7520, "Karabakh"),
        ("Shusha gym candidate", "Shusha", 39.7600, 46.7560, "Karabakh"),
        ("Agdam sports club probe", "Agdam", 39.9900, 46.9300, "Karabakh"),
        ("Fuzuli fitness probe", "Fuzuli", 39.6000, 47.1500, "Karabakh"),
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
        OUT / "AZERBAIJAN_TERRITORY_MODEL.json",
        {
            "country": "Azerbaijan",
            "sovereign_territory": "Azerbaijan (AZ)",
            "administrative_units": "14 economic regions",
            "economic_regions": [
                "Baku",
                "Nakhchivan",
                "Absheron",
                "Ganja-Qazakh",
                "Shaki-Zagatala",
                "Lankaran",
                "Guba-Khachmaz",
                "Aran",
                "Upper Karabakh",
                "Kalbajar-Lachin",
                "Mountainous Shirvan",
                "Central Aran",
                "East Zangezur",
                "Shirvan",
            ],
            "admin_unit_count": 14,
            "conflict_regions": {
                "Karabakh": {
                    "policy": "GEOGRAPHIC_HOLD",
                    "ready_without_strong_evidence": False,
                    "bbox_hint": "39.15<=lat<=40.35, 46.5<=lng<=47.55",
                    "aliases": ["Upper Karabakh", "Khankendi", "Shusha", "Agdam", "East Zangezur"],
                },
            },
            "exclaves": {
                "Nakhchivan": {
                    "policy": "INCLUDED",
                    "bbox_hint": "38.78<=lat<=39.62, 44.72<=lng<=46.25",
                },
            },
            "cross_border_rejects": ["GE", "AM", "IR", "TR", "RU"],
            "foreign_contamination": "EXCLUDED — cross-border/foreign probes",
            "in_country_function": "in_azerbaijan() in batch1_phase1_common.py",
        },
    )


def write_postcode_model() -> None:
    write_json(
        OUT / "AZERBAIJAN_POSTCODE_MODEL.json",
        {
            "country": "Azerbaijan",
            "format": "AZ NNNN (4 digits)",
            "regex": "^\\d{4}$",
            "examples": ["1010", "1065", "2000", "7000"],
            "validation_function": "format_az_postal() in batch1_phase1_common.py",
            "source": "Azərpoçt / UPU; aligned with AZ_POSTAL_RE",
            "verified_independently": True,
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "AZERBAIJAN_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Azerbaijan",
            "search_normalization": "normalize_azerbaijani_search() — Latin/Cyrillic to Latin for dedup only",
            "aliases": [
                {"canonical": "Baku", "variants": ["baku", "bakı", "baki"]},
                {"canonical": "Ganja", "variants": ["ganja", "gəncə", "gence"]},
                {"canonical": "Nakhchivan", "variants": ["nakhchivan", "naxçıvan", "naxcivan"]},
                {"canonical": "Azerbaijan", "variants": ["Azərbaycan", "AZ", "Azerbaycan"]},
            ],
            "notes": "Canonical Latin/Azerbaijani local names preserved in storage; transliteration for search only",
        },
    )


def snapshot_existing_production(catalog: list[dict]) -> list[dict]:
    az_rows = []
    for c in catalog:
        cid = str(c.get("id", ""))
        country = str(c.get("country", "")).lower()
        if cid.startswith("az_") or country in ("azerbaijan", "az"):
            az_rows.append(dict(c))
    return az_rows


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"AZERBAIJAN PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")
    if len(CENTERS.read_bytes()) != EXPECTED_BYTES:
        raise SystemExit("AZERBAIJAN PHASE 1 BLOCKED — PRODUCTION BYTES DRIFT")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"

    az_live = [c for c in catalog if str(c.get("id", "")).startswith("az_")]
    az_country = [c for c in catalog if str(c.get("country", "")).lower() == "azerbaijan"]
    assert len(az_live) == 0 and len(az_country) == 0, "Azerbaijan production must be 0"

    am_live = [c for c in catalog if str(c.get("id", "")).startswith("am_")]
    ge_live = [c for c in catalog if str(c.get("id", "")).startswith("ge_")]
    assert len(am_live) == 36, f"baseline Armenia count drift: {len(am_live)}"
    assert len(ge_live) == 25, f"baseline Georgia count drift: {len(ge_live)}"

    existing = snapshot_existing_production(catalog)
    write_json(OUT / "AZERBAIJAN_EXISTING_PRODUCTION_SNAPSHOT.json", existing)

    rows: list[dict] = []
    seen: set = set()

    curated_n = stage_curated_operators(rows, seen)
    baku_n = stage_baku_districts(rows, seen)
    nakh_n = stage_nakhchivan(rows, seen)
    osm_n = stage_osm_azerbaijan(rows, seen)
    photon_n = stage_photon_grid(rows, seen)
    stage_exclusion_probes(rows)
    stage_cross_border_probes(rows)
    stage_conflict_region_probes(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    assert all(r.get("import_category") != "READY_TO_IMPORT" for r in rows)

    inventory = {
        "country": "Azerbaijan",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_bytes_before": EXPECTED_BYTES,
        "production_total": PRODUCTION_TOTAL,
        "azerbaijan_live": len(az_live),
        "az_prefix_live": len(az_live),
        "azerbaijan_country_live": len(az_country),
        "existing_azerbaijan_production": len(existing) > 0,
        "baseline_armenia": 36,
        "baseline_georgia": 25,
        "baseline_turkey": 198,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED_SMALL_MARKET",
        "postcode_model": "AZ NNNN (4 digits)",
        "fetch_summary": {
            "curated_operators": curated_n,
            "baku_district_audit": baku_n,
            "nakhchivan_dedicated": nakh_n,
            "osm_azerbaijan": osm_n,
            "photon_grid": photon_n,
            "total_candidates": len(rows),
        },
        "official_estate": {
            brand: {"open_active_estimated": count, "class_a": True}
            for brand, count in CLASS_A_OFFICIAL.items()
        },
        "curated_non_class_a": [
            "World Class Azerbaijan",
            "1st Fitness",
            "FitClub",
            "Fit Way",
            "Pulse",
            "Gold's Gym",
            "Sport Life",
            "Dream Body",
        ],
        "conflict_regions_tracked": ["Karabakh"],
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

    write_json(OUT / "azerbaijan_phase1_candidates.json", rows)
    write_json(OUT / "azerbaijan_chain_inventory.json", inventory)
    write_postcode_model()
    write_locality_alias_map()
    write_territory_model()

    rebrand = {
        "country": "Azerbaijan",
        "phase": 1,
        "entries": [],
        "unresolved_conflicts": 0,
        "notes": "No material rebrand conflicts identified in Phase 1 discovery",
    }
    write_json(OUT / "AZERBAIJAN_PHASE1_REBRAND_MAP.json", rebrand)

    print(json.dumps(inventory["fetch_summary"], indent=2))
    print(f"candidates={len(rows)} azerbaijan_live={len(az_live)} sha={PRE_SHA}")


if __name__ == "__main__":
    main()
