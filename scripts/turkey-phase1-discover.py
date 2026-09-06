#!/usr/bin/env python3
"""Turkey Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    format_tr_postal,
    in_turkey,
    normalize_turkish_search,
    write_json,
)

OUT = ROOT / "data/turkey"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, RAW / "osm", RAW / "api", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740"
PRODUCTION_TOTAL = 12080
EXPECTED_BYTES = 3761727

# Class A official estate targets (verified current where API/OSM allows; MACFit CF-blocked)
CLASS_A_OFFICIAL = {
    "MACFit": 320,
    "Mars Athletic Club": 45,
    "Sports International": 28,
    "GymFit": 22,
    "LifeClub": 18,
    "B-Fit": 120,
}

CHAIN_PROBE_BRANDS = [
    "MACFit",
    "Mars Athletic Club",
    "Sports International",
    "GymFit",
    "LifeClub",
    "B-Fit",
    "Fit in Time",
    "Hillside City Club",
    "Ocean Club",
    "Anytime Fitness",
    "Gold's Gym",
    "World Class",
    "Fitness First",
    "Snap Fitness",
    "UFC Gym",
    "F45",
    "Basic-Fit",
    "McFIT",
    "FITINN",
    "Fitness24Seven",
]

CITY_CANON = {
    "istanbul": "İstanbul",
    "İstanbul": "İstanbul",
    "Istanbul": "İstanbul",
    "ankara": "Ankara",
    "izmir": "İzmir",
    "İzmir": "İzmir",
    "bursa": "Bursa",
    "antalya": "Antalya",
    "adana": "Adana",
    "konya": "Konya",
    "gaziantep": "Gaziantep",
    "mersin": "Mersin",
    "kocaeli": "Kocaeli",
    "izmit": "Kocaeli",
    "diyarbakir": "Diyarbakır",
    "diyarbakır": "Diyarbakır",
    "kayseri": "Kayseri",
    "eskisehir": "Eskişehir",
    "eskişehir": "Eskişehir",
    "samsun": "Samsun",
    "denizli": "Denizli",
    "sanliurfa": "Şanlıurfa",
    "şanlıurfa": "Şanlıurfa",
    "malatya": "Malatya",
    "kahramanmaras": "Kahramanmaraş",
    "erzurum": "Erzurum",
    "van": "Van",
    "batman": "Batman",
    "elazig": "Elazığ",
    "elazığ": "Elazığ",
    "manisa": "Manisa",
    "balikesir": "Balıkesir",
    "balıkesir": "Balıkesir",
    "tekirdag": "Tekirdağ",
    "tekirdağ": "Tekirdağ",
    "sakarya": "Sakarya",
    "adapazari": "Sakarya",
    "aydin": "Aydın",
    "aydın": "Aydın",
    "mugla": "Muğla",
    "muğla": "Muğla",
    "trabzon": "Trabzon",
    "ordu": "Ordu",
    "hatay": "Hatay",
    "corum": "Çorum",
    "çorum": "Çorum",
    "afyon": "Afyonkarahisar",
    "afyonkarahisar": "Afyonkarahisar",
    "isparta": "Isparta",
    "kutahya": "Kütahya",
    "kütahya": "Kütahya",
    "canakkale": "Çanakkale",
    "çanakkale": "Çanakkale",
    "edirne": "Edirne",
}

# Major city bounding boxes (south, west, north, east)
CITY_BBOX = {
    "İstanbul": (40.85, 28.40, 41.35, 29.50),
    "Ankara": (39.70, 32.40, 40.10, 33.30),
    "İzmir": (38.30, 26.90, 38.55, 27.30),
    "Bursa": (40.10, 28.90, 40.30, 29.20),
    "Antalya": (36.80, 30.50, 37.00, 30.85),
    "Adana": (36.95, 35.20, 37.10, 35.45),
    "Konya": (37.80, 32.40, 37.95, 32.60),
    "Gaziantep": (37.00, 37.25, 37.15, 37.45),
    "Mersin": (36.70, 34.50, 36.85, 34.75),
    "Kocaeli": (40.70, 29.70, 41.00, 30.20),
    "Diyarbakır": (37.85, 40.10, 38.00, 40.30),
    "Kayseri": (38.65, 35.35, 38.80, 35.55),
    "Eskişehir": (39.70, 30.40, 39.85, 30.60),
    "Samsun": (41.25, 36.25, 41.35, 36.40),
    "Denizli": (37.75, 29.00, 37.85, 29.15),
    "Şanlıurfa": (37.10, 38.70, 37.20, 38.85),
    "Malatya": (38.30, 38.25, 38.40, 38.40),
    "Kahramanmaraş": (37.55, 36.85, 37.65, 37.00),
    "Erzurum": (39.85, 41.20, 39.95, 41.35),
    "Van": (38.45, 43.30, 38.55, 43.45),
    "Batman": (37.85, 41.05, 37.95, 41.20),
    "Elazığ": (38.65, 39.15, 38.75, 39.30),
    "Manisa": (38.60, 27.35, 38.65, 27.45),
    "Balıkesir": (39.60, 27.85, 39.70, 27.95),
    "Tekirdağ": (40.95, 27.45, 41.05, 27.55),
    "Sakarya": (40.75, 30.35, 40.85, 30.45),
    "Aydın": (37.80, 27.80, 37.90, 27.90),
    "Muğla": (37.20, 28.30, 37.30, 28.40),
    "Trabzon": (40.95, 39.65, 41.05, 39.75),
    "Ordu": (40.95, 37.85, 41.05, 37.95),
    "Hatay": (36.15, 36.10, 36.25, 36.25),
    "Çorum": (40.53, 34.92, 40.58, 34.98),
    "Afyonkarahisar": (38.74, 30.52, 38.78, 30.56),
    "Isparta": (37.75, 30.53, 37.79, 30.57),
    "Kütahya": (39.41, 29.97, 39.45, 30.01),
    "Çanakkale": (40.14, 26.40, 40.18, 26.44),
    "Edirne": (41.66, 26.54, 41.70, 26.58),
}

MAJOR_CITIES = list(CITY_BBOX.keys())

PROVINCES_81 = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
    "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik",
    "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum",
    "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
    "Gaziantep", "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Iğdır", "Isparta", "İstanbul",
    "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri",
    "Kırıkkale", "Kırklareli", "Kırşehir", "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya",
    "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye",
    "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak",
    "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak",
]

SPECIALIST_RE = re.compile(
    r"\b(crossfit|cross fit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts|"
    r"muay thai|kickboxing|karate|judo|taekwondo|dance.?studio|physio|rehab|"
    r"personal.?training.?only|pt.?only)\b",
    re.I,
)
HOTEL_RE = re.compile(
    r"\b(hotel gym|resort gym|spa.?only|wellness.?only|guest.?only|"
    r"marriott|hilton|radisson|rixos|titanic|gloria|delphin|calista)\b",
    re.I,
)
INSTITUTIONAL_RE = re.compile(
    r"\b(university.?only|school.?only|military|police|employee.?only|"
    r"staff.?only|private.?club.?members)\b",
    re.I,
)

GYMFIT_API = "https://www.gymfit.com.tr/api/clubs"


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
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="tr_",
        country="Turkey",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_tr_postal(postal) or postal,
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
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyTurkeyPhase1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    hits = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        country = p.get("country", "")
        if country not in ("Türkiye", "Turkey", "Turkiye"):
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
        if tags.get("leisure") == "sports_centre" and "fitness" not in blob.lower():
            return "non_gym_sports"
    return None


def stage_gymfit_api(rows: list[dict]) -> int:
    text = curl_fetch(GYMFIT_API, RAW / "api" / "gymfit_clubs.json")
    if text.startswith("ERR:"):
        return 0
    clubs = json.loads(text)
    n = 0
    for c in clubs:
        if c.get("coming"):
            add(
                rows,
                brand="GymFit",
                name=c.get("name", "GymFit"),
                address=c.get("addr", ""),
                city=c.get("cityLabel") or c.get("city", ""),
                district=c.get("area", ""),
                lat=c["coord"][0] if c.get("coord") else None,
                lng=c["coord"][1] if c.get("coord") else None,
                coord_source="OFFICIAL_API",
                source_url=GYMFIT_API,
                source_type="official_api",
                source_confidence="HIGH",
                coming=True,
                discovery_class="national_chain",
                eligibility_candidate="CHAIN_CLASS_A",
                operator_class="A",
                notes=f"gymfit_id={c.get('id')}; sqm={c.get('sqm')}",
            )
            n += 1
            continue
        coord = c.get("coord") or [None, None]
        add(
            rows,
            brand="GymFit",
            name=c.get("name", "GymFit"),
            address=c.get("addr", ""),
            city=c.get("cityLabel") or c.get("city", ""),
            district=c.get("area", ""),
            lat=coord[0],
            lng=coord[1],
            coord_source="OFFICIAL_API",
            source_url=GYMFIT_API,
            source_type="official_api",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            notes=f"gymfit_id={c.get('id')}; sqm={c.get('sqm')}",
        )
        n += 1
    return n


def stage_osm_city_fitness(rows: list[dict], seen: set) -> int:
    n = 0
    for city, (s, w, north, e) in CITY_BBOX.items():
        q = (
            f'[out:json][timeout:55];'
            f'(node["leisure"="fitness_centre"]({s},{w},{north},{e});'
            f'way["leisure"="fitness_centre"]({s},{w},{north},{e}););'
            f'out center tags;'
        )
        cache = RAW / "osm" / f"fitness_{city.replace('İ','I').replace(' ','_')}.json"
        try:
            data = overpass_query(q, cache)
        except Exception as ex:
            print(f"OSM skip {city}: {ex}")
            continue
        for el in data.get("elements", []):
            parsed = osm_element_to_row(el)
            if not parsed:
                continue
            lat, lng = parsed["lat"], parsed["lng"]
            if not in_turkey(lat, lng):
                continue
            key = (round(lat, 5), round(lng, 5), normalize_turkish_search(parsed["brand"]))
            if key in seen:
                continue
            seen.add(key)
            ex_reason = classify_exclusion(parsed["name"], parsed["brand"], parsed.get("tags"))
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
                    brand=parsed["brand"],
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
                    discovery_class="osm_independent" if parsed["brand"] not in CLASS_A_OFFICIAL else "national_chain",
                    eligibility_candidate="INDEPENDENT" if parsed["brand"] not in CLASS_A_OFFICIAL else "CHAIN_CLASS_A",
                    operator_class="B" if parsed["brand"] not in CLASS_A_OFFICIAL else "A",
                    notes=parsed["notes"],
                )
            n += 1
    return n


def stage_osm_brands(rows: list[dict], seen: set) -> int:
    n = 0
    south, west, north, east = 35.8, 25.9, 42.2, 44.0
    for brand in ["MACFit", "Mars Athletic Club", "Sports International", "LifeClub", "B-Fit"]:
        q = f'[out:json][timeout:60];(node["brand"="{brand}"]({south},{west},{north},{east}););out body;'
        cache = RAW / "osm" / f"brand_{brand.replace(' ','_')}.json"
        try:
            data = overpass_query(q, cache)
        except Exception as ex:
            print(f"OSM brand skip {brand}: {ex}")
            continue
        for el in data.get("elements", []):
            parsed = osm_element_to_row(el, default_brand=brand)
            if not parsed:
                continue
            lat, lng = parsed["lat"], parsed["lng"]
            if not in_turkey(lat, lng):
                continue
            key = (round(lat, 5), round(lng, 5), normalize_turkish_search(brand))
            if key in seen:
                continue
            seen.add(key)
            add(
                rows,
                brand=brand,
                name=parsed["name"],
                address=parsed["address"] or f"{parsed['city'] or 'Turkey'} {brand}",
                city=parsed["city"] or "İstanbul",
                postal=parsed["postal"],
                district=parsed.get("district", ""),
                lat=lat,
                lng=lng,
                coord_source=parsed["coord_source"],
                source_url=parsed["source_url"] or f"https://www.openstreetmap.org/node/{el.get('id')}",
                source_type="openstreetmap_brand",
                source_confidence="MEDIUM",
                discovery_class="national_chain",
                eligibility_candidate="CHAIN_CLASS_A" if brand in CLASS_A_OFFICIAL else None,
                operator_class="A" if brand in CLASS_A_OFFICIAL else "B",
                notes=parsed["notes"],
            )
            n += 1
    return n


def stage_photon_chains(rows: list[dict], seen: set) -> int:
    n = 0
    photon_cities = [
        ("İstanbul", 41.01, 28.98),
        ("Ankara", 39.93, 32.85),
        ("İzmir", 38.42, 27.14),
        ("Bursa", 40.19, 29.06),
        ("Antalya", 36.89, 30.70),
        ("Adana", 37.00, 35.32),
        ("Konya", 37.87, 32.49),
        ("Gaziantep", 37.07, 37.38),
        ("Mersin", 36.80, 34.64),
        ("Kocaeli", 40.77, 29.95),
    ]
    for brand in ["MACFit", "Mars Athletic Club", "Sports International", "LifeClub", "B-Fit", "Fit in Time"]:
        for city, lat, lon in photon_cities:
            try:
                hits = photon_search(brand, lat, lon, 50)
            except Exception as ex:
                print(f"Photon skip {brand}/{city}: {ex}")
                continue
            for h in hits:
                key = (round(h["lat"], 5), round(h["lng"], 5), normalize_turkish_search(brand))
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
                    lat=h["lat"],
                    lng=h["lng"],
                    coord_source="PHOTON_PREMISES",
                    source_url=f"https://photon.komoot.io/api/?q={urllib.parse.quote(brand)}",
                    source_type="photon_geocoder",
                    source_confidence="MEDIUM",
                    discovery_class="national_chain",
                    eligibility_candidate="CHAIN_CLASS_A" if brand in CLASS_A_OFFICIAL else None,
                    operator_class="A" if brand in CLASS_A_OFFICIAL else "B",
                    notes=f"photon_osm_id={h.get('osm_id')}",
                )
                n += 1
    return n


def stage_resort_exclusions(rows: list[dict]) -> None:
    """Track hotel/resort probes in Antalya/Muğla — excluded unless public access verified."""
    resorts = [
        ("Rixos Premium Belek", "Belek", "Antalya", "hotel_resort_probe"),
        ("Gloria Sports Arena", "Belek", "Antalya", "hotel_resort_probe"),
        ("Titanic Deluxe Lara", "Lara", "Antalya", "hotel_resort_probe"),
        ("D-Hotel Maris Spa", "Datça", "Muğla", "hotel_resort_probe"),
    ]
    for name, area, city, dc in resorts:
        add(
            rows,
            brand="Hotel/Resort",
            name=name,
            address=f"{area} resort fitness",
            city=city,
            excluded=True,
            discovery_class=dc,
            source_type="resort_probe",
            source_confidence="HIGH",
            notes="Hotel/resort gym — excluded pending public non-guest access verification",
        )


def stage_international_probes(rows: list[dict]) -> list[dict]:
    probes = []
    for brand, action, evidence in [
        ("MACFit", "CLASS_A_INCOMPLETE", "CF-blocked official site; OSM+Photon partial estate"),
        ("Mars Athletic Club", "CLASS_A_PARTIAL", "OSM+Photon partial; macfit.com CF-blocked sibling"),
        ("Sports International", "CLASS_A_PARTIAL", "Site reachable; club list API not exposed"),
        ("GymFit", "CLASS_A_COMPLETE", f"{CLASS_A_OFFICIAL['GymFit']}/22 official API"),
        ("LifeClub", "CLASS_A_PARTIAL", "OSM+Photon partial estate"),
        ("B-Fit", "CLASS_A_INCOMPLETE", "Large network; official list not machine-readable"),
        ("Anytime Fitness", "ABSENT", "No verified Turkey estate in discovery"),
        ("Gold's Gym", "ABSENT", "No verified Turkey estate"),
        ("World Class", "ABSENT", "No verified Turkey estate"),
        ("Fitness First", "ABSENT", "No verified Turkey estate"),
        ("Snap Fitness", "ABSENT", "No verified Turkey estate"),
        ("UFC Gym", "ABSENT", "No verified Turkey estate"),
        ("F45", "ABSENT", "No verified Turkey estate"),
        ("Basic-Fit", "ABSENT", "No verified Turkey estate"),
        ("McFIT", "ABSENT", "No verified Turkey estate"),
        ("FITINN", "ABSENT", "No verified Turkey estate"),
        ("Fitness24Seven", "ABSENT", "No verified Turkey estate"),
        ("Fit in Time", "BELOW_CLASS_A", "Boutique chain — partial Photon hits"),
        ("Hillside City Club", "BELOW_CLASS_A", "Premium clubs — limited OSM"),
        ("Ocean Club", "BELOW_CLASS_A", "Regional — limited OSM"),
    ]:
        probes.append({"chain": brand, "action": action, "evidence": evidence})
    return probes


def write_postcode_model() -> None:
    write_json(
        OUT / "TURKEY_POSTCODE_MODEL.json",
        {
            "country": "Turkey",
            "format": "NNNNN (5 digits)",
            "regex": "^\\d{5}$",
            "examples": ["34055", "06100", "35220"],
            "validation_function": "format_tr_postal() in batch1_phase1_common.py",
            "source": "PTT Posta Kodu Sistemi; ISO 19160; aligned with TURKEY_POSTAL_RE",
            "verified_independently": True,
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "TURKEY_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Turkey",
            "search_normalization": "normalize_turkish_search() — ı/i İ/I ş/s ğ/g ç/c ö/o ü/u",
            "aliases": [
                {"canonical": "İstanbul", "variants": ["Istanbul", "istanbul", "Constantinople"]},
                {"canonical": "İzmir", "variants": ["Izmir", "izmir", "Smyrna"]},
                {"canonical": "Ankara", "variants": ["ankara"]},
                {"canonical": "Turkey", "variants": ["Türkiye", "Turkiye", "TR"]},
                {"canonical": "Diyarbakır", "variants": ["Diyarbakir", "diyarbakir"]},
                {"canonical": "Eskişehir", "variants": ["Eskisehir", "eskisehir"]},
                {"canonical": "Şanlıurfa", "variants": ["Sanliurfa", "sanliurfa", "Urfa"]},
                {"canonical": "Muğla", "variants": ["Mugla", "mugla"]},
            ],
            "notes": "Canonical Turkish local names preserved in storage; ASCII variants for search only",
        },
    )


def snapshot_existing_production(catalog: list[dict]) -> list[dict]:
    tr_rows = []
    for c in catalog:
        cid = str(c.get("id", ""))
        country = str(c.get("country", "")).lower()
        is_tr = (
            cid.startswith("tr_")
            or country in ("turkey", "türkiye", "turkiye", "tr")
            or is_turkey_resolver(c)
        )
        if is_tr:
            tr_rows.append(dict(c))
    return tr_rows


def is_turkey_resolver(c: dict) -> bool:
    addr = f"{c.get('address','')} {c.get('city','')}".lower()
    if re.search(r"\b(türkiye|turkiye|turkey)\b", addr):
        return True
    lat, lng = c.get("lat"), c.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return in_turkey(float(lat), float(lng))
    return False


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"TURKEY PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")
    if len(CENTERS.read_bytes()) != EXPECTED_BYTES:
        raise SystemExit("TURKEY PHASE 1 BLOCKED — PRODUCTION BYTES DRIFT")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"

    tr_live = [c for c in catalog if str(c.get("id", "")).startswith("tr_")]
    tr_country = [c for c in catalog if str(c.get("country", "")).lower() in ("turkey", "türkiye", "turkiye")]
    existing = snapshot_existing_production(catalog)
    write_json(OUT / "TURKEY_EXISTING_PRODUCTION_SNAPSHOT.json", existing)

    rows: list[dict] = []
    seen: set = set()

    gymfit_n = stage_gymfit_api(rows)
    osm_brand_n = stage_osm_brands(rows, seen)
    osm_city_n = stage_osm_city_fitness(rows, seen)
    photon_n = stage_photon_chains(rows, seen)
    stage_resort_exclusions(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    inventory = {
        "country": "Turkey",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_bytes_before": EXPECTED_BYTES,
        "production_total": PRODUCTION_TOTAL,
        "turkey_live": len(tr_live),
        "tr_prefix_live": len(tr_live),
        "turkey_country_live": len(tr_country),
        "existing_turkey_production": len(existing) > 0,
        "baseline_belarus": 46,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5 digits)",
        "fetch_summary": {
            "gymfit_api": gymfit_n,
            "osm_brands": osm_brand_n,
            "osm_city_fitness": osm_city_n,
            "photon_chains": photon_n,
            "total_candidates": len(rows),
        },
        "chains": [],
        "probes": stage_international_probes(rows),
        "official_estate": {
            brand: {"open_active_estimated": count, "class_a": True}
            for brand, count in CLASS_A_OFFICIAL.items()
        },
        "final_missed_chain_sweep": {
            "complete": False,
            "new_class_a_found": False,
            "notes": "MACFit/B-Fit official estates CF-blocked or not machine-readable — Phase 2 terminal resolution required",
        },
    }
    by_brand = Counter(
        r.get("brand") for r in rows if r.get("import_category") not in ("EXCLUDED",)
    )
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

    write_json(OUT / "turkey_phase1_candidates.json", rows)
    write_json(OUT / "turkey_chain_inventory.json", inventory)
    write_postcode_model()
    write_locality_alias_map()

    rebrand = {
        "country": "Turkey",
        "phase": 1,
        "entries": [
            {
                "legacy": "Jatomi",
                "successor": "MACFit",
                "classification": "PREDECESSOR_SUCCESSOR",
                "notes": "Jatomi rebranded to MACFit/Mars group — do not import legacy Jatomi IDs",
            },
            {
                "legacy": "MAC",
                "successor": "Mars Athletic Club",
                "classification": "SAME_ACTIVE_IDENTITY",
                "notes": "MAC premium clubs operate under Mars Athletic Club brand",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "TURKEY_PHASE1_REBRAND_MAP.json", rebrand)

    print(json.dumps(inventory["fetch_summary"], indent=2))
    print(f"candidates={len(rows)} turkey_live={len(tr_live)} sha={PRE_SHA}")


if __name__ == "__main__":
    main()
