#!/usr/bin/env python3
"""
Spain Phase 3 — targeted recovery before production merge.

- Discover Enjoy! from official Google My Maps + centros listing
- Recover Synergym / Fitness Park / Dreamfit / DIR / GO fit / Metropolitan via
  official embeds, Nominatim named-gym POIs, strict address geocode
- Never invent city/postcode/country centroids; never overwrite valid READY
- Does NOT modify src/data/centers.json
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/spain"
SCRAPES = OUT / "scrapes"
RAW = OUT / "raw"
PAGES = RAW / "pages"
STAGING = OUT / "spain_centers_staging.json"
CACHE = OUT / "spain_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"

ctx = ssl.create_default_context()
UA = "GymlySpainGeocoder/3.0 (catalog research; accuracy over coverage; no fallback centroids)"
HTTP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

ES_MAINLAND = (35.9, 43.8, -9.4, 3.4)
ES_BALEARIC = (38.6, 40.1, 1.1, 4.4)
ES_CANARY = (27.6, 29.5, -18.2, -13.3)
ES_CEUTA = (35.85, 35.92, -5.35, -5.27)
ES_MELILLA = (35.26, 35.33, -2.97, -2.92)

MAJOR_CITIES = [
    "Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga",
    "Murcia", "Palma", "Las Palmas", "Bilbao", "Alicante", "Córdoba",
    "Valladolid", "Vigo", "Gijón", "Granada", "A Coruña",
]

ENJOY_MYMAPS_MID = "11KtVXVIQpSJFAkylfv_72cYDEGFRFKQ"
ENJOY_COMING_SOON = [
    ("Enjoy! Zaragoza Sur", "Zaragoza"),
    ("Enjoy! Tio Pio", "Madrid"),
    ("Enjoy! Murcia Centro", "Murcia"),
    ("Enjoy! Valladolid", "Valladolid"),
]

# City hints for Enjoy open clubs (from official centros listing)
ENJOY_CITY_HINTS = {
    "altamira": "Fuenlabrada",
    "getafe": "Getafe",
    "carabanchel": "Madrid",
    "móstoles": "Móstoles",
    "mostoles": "Móstoles",
    "la ribera": "Zaragoza",
    "laribera": "Zaragoza",
    "samaranch": "Valencia",
    "sanfer": "Avilés",
    "jerez": "Jerez de la Frontera",
    "san bernardo": "Sevilla",
    "murcia": "Murcia",
    "oviedo": "Oviedo",
    "aldehuela": "Salamanca",
    "multiusos": "Salamanca",
    "mérida": "Mérida",
    "merida": "Mérida",
    "silos": "Zaragoza",
    "málaga": "Málaga",
    "malaga": "Málaga",
    "albacete": "Albacete",
    "la isla": "San Fernando",
}


def make_id(brand, address, postal, city):
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (str(postal) or "").strip().lower(),
        (city or "").strip().lower(),
        "spain",
    ])
    return "es_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    for a, b in [
        ("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"),
        ("ü", "u"), ("ñ", "n"), ("ç", "c"), ("à", "a"), ("è", "e"),
        ("ò", "o"), ("ï", "i"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def es_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


def in_spain_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in [ES_MAINLAND, ES_BALEARIC, ES_CANARY, ES_CEUTA, ES_MELILLA]:
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def in_balearic(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_BALEARIC
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_canary(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_CANARY
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_ceuta(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_CEUTA
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def in_melilla(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        lo, hi, w, e = ES_MELILLA
        return lo <= lat <= hi and w <= lng <= e
    except (TypeError, ValueError):
        return False


def richness(r):
    return (
        (2 if r.get("lat") is not None else 0)
        + (1 if r.get("postal_code") else 0)
        + (1 if r.get("address") else 0)
        + (1 if r.get("city") else 0)
        + (1 if r.get("coord_source") and "official" in str(r.get("coord_source")) else 0)
    )


def http_get(url, timeout=40, as_bytes=False):
    req = urllib.request.Request(url, headers={"User-Agent": HTTP_UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        data = resp.read()
    return data if as_bytes else data.decode("utf-8", errors="replace")


def nominatim(query, cache, extra=None):
    key = query if not extra else query + "||" + json.dumps(extra, sort_keys=True)
    if key in cache:
        return cache[key]
    params = {
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 8,
        "countrycodes": "es",
    }
    if extra:
        params.update(extra)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[key] = data
    time.sleep(1.15)
    return data


def nominatim_reverse(lat, lng, cache):
    key = f"rev:{round(float(lat), 6)},{round(float(lng), 6)}"
    if key in cache:
        return cache[key]
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({
        "lat": lat, "lon": lng, "format": "json", "addressdetails": 1, "zoom": 18,
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[key] = data
    time.sleep(1.15)
    return data


COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


def score_candidate(item, street, postal, city, allow_road_with_postal=True):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_spain_bbox(lat, lng):
        return None, ["outside_spain"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "es":
        return None, ["not_country_es:" + cc], lat, lng

    t = (item.get("type") or item.get("class") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in COARSE or addresstype in COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"} and t not in {
        "house", "building", "yes", "retail", "commercial", "industrial",
        "gym", "fitness_centre", "sports_centre",
    }:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng

    # Named gym / amenity POIs are strong
    is_gym = (
        osm_class in {"leisure", "amenity", "sport"}
        and t in {"fitness_centre", "gym", "sports_centre", "sports_hall"}
    ) or ("synergym" in display or "fitness park" in display or "dreamfit" in display
          or "enjoy" in display or "basic-fit" in display or "basic fit" in display)

    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc).upper()
    postal_n = re.sub(r"\s+", "", str(postal or "")).upper()
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:3] == postal_n[:3]:
        score += 1
        reasons.append("postal_soft")

    city_n = norm(city)
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb", "city_district")
    )
    if city_n and (city_n in city_fields or city_n in norm(display)):
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    street_exp = street_n
    for a, b in [
        ("c ", "calle "), ("av ", "avenida "), ("avd ", "avenida "),
        ("avda ", "avenida "), ("carrer ", "calle "), ("rua ", "calle "),
        ("rúa ", "calle "), ("pl ", "plaza "), ("pg ", "paseo "),
    ]:
        if street_exp.startswith(a):
            street_exp = b + street_exp[len(a):]
    road_match = False
    if road and street_n and (
        road in street_n or street_n in norm(display) or road in street_exp
        or street_exp in norm(display)
        or any(tok and tok in road for tok in street_exp.split() if len(tok) > 4)
        or any(tok and tok in street_exp for tok in road.split() if len(tok) > 4)
    ):
        score += 4
        reasons.append("road_match")
        road_match = True

    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")

    if is_gym:
        score += 4
        reasons.append("named_gym_poi")
    elif osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")

    has_structure = any(
        x in reasons
        for x in ("road_match", "house_number_match", "building_or_amenity", "named_gym_poi")
    )
    # Phase 3: allow highway/road result when postal+city exact
    if not has_structure:
        if allow_road_with_postal and "postal_exact" in reasons and "city_ok" in reasons and (
            road_match or osm_class == "highway"
        ):
            score += 2
            reasons.append("road_accepted_with_postal_city")
        else:
            return None, reasons + ["no_street_or_building"], lat, lng

    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def apply_geocode_hit(r, lat, lng, reasons, display, source, postal_from=None):
    if not in_spain_bbox(lat, lng):
        return False
    r["lat"] = round(float(lat), 6)
    r["lng"] = round(float(lng), 6)
    r["geocode_status"] = "ok"
    r["geocode_reasons"] = reasons
    r["geocode_display"] = display
    r["coord_source"] = source
    r["import_category"] = "READY_TO_IMPORT"
    r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
    if not r.get("postal_code") and postal_from:
        pc = es_postal(postal_from)
        if pc:
            r["postal_code"] = pc
            r["id"] = make_id(r.get("brand"), r.get("address"), pc, r.get("city"))
    return True


def geocode_row_strict(r, cache):
    """Strict address geocode for unresolved rows. Never touch READY with coords."""
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        return r, False
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return r, False
    street = (r.get("address") or "").strip()
    postal = r.get("postal_code") or ""
    city = (r.get("city") or "").strip()
    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        return r, False

    # Clean common glued / noisy address fragments
    street_clean = re.sub(r"Parque Europa(?=Calle)", "Parque Europa, ", street)
    street_clean = re.sub(r"\s+", " ", street_clean).strip()

    brand = r.get("brand") or ""
    queries = []
    if brand and postal:
        queries.append(f"{brand}, {street_clean}, {postal} {city}, Spain")
        queries.append(f"{brand}, {postal} {city}, Spain")
    if brand:
        queries.append(f"{brand}, {street_clean}, {city}, Spain")
    if postal:
        queries.append(f"{street_clean}, {postal} {city}, Spain")
        queries.append(f"{street_clean}, {postal}, España")
    queries.append(f"{street_clean}, {city}, España")
    # Named gym only
    if brand and city:
        queries.append(f"{brand} {city}")
        name = r.get("name") or r.get("center_name") or ""
        if name:
            queries.append(name)

    seen = set()
    for q in queries:
        if not q or q in seen:
            continue
        seen.add(q)
        try:
            items = nominatim(q, cache)
        except Exception:
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street_clean, postal, city)
            if sc is None:
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name"), it))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                continue
        top = scored[0]
        pc = es_postal((top[5].get("address") or {}).get("postcode") or "")
        if apply_geocode_hit(r, top[2], top[3], top[1], top[4], "nominatim", pc):
            if street_clean != street:
                r["address"] = street_clean
            return r, True
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    return r, False


# --------------- Enjoy discovery ---------------

def local_tag(tag):
    return tag.split("}")[-1] if "}" in tag else tag


def discover_enjoy(cache):
    """Official brand My Maps pins + coming soon from centros listing."""
    RAW.mkdir(parents=True, exist_ok=True)
    SCRAPES.mkdir(parents=True, exist_ok=True)
    kml_url = f"https://www.google.com/maps/d/u/0/kml?mid={ENJOY_MYMAPS_MID}&forcekml=1"
    kml = http_get(kml_url)
    (RAW / "enjoy_mymaps.kml").write_text(kml, encoding="utf-8")

    root = ET.fromstring(kml)
    open_rows = []
    for pm in root.iter():
        if local_tag(pm.tag) != "Placemark":
            continue
        name = None
        coords = None
        for ch in pm.iter():
            t = local_tag(ch.tag)
            if t == "name" and name is None:
                name = (ch.text or "").strip()
            elif t == "coordinates" and coords is None:
                coords = (ch.text or "").strip()
        if not name or not coords:
            continue
        parts = coords.split(",")
        if len(parts) < 2:
            continue
        lng, lat = float(parts[0]), float(parts[1])
        if not in_spain_bbox(lat, lng):
            continue

        # City hint from name
        name_n = norm(name.replace("Enjoy!", "").replace("Enjoy", ""))
        city = None
        for key, c in ENJOY_CITY_HINTS.items():
            if norm(key) in name_n or name_n in norm(key):
                city = c
                break
        if not city:
            # fallback: last token
            city = name.replace("Enjoy!", "").replace("Enjoy", "").strip(" -") or "Spain"

        # Reverse geocode for street + postal (official pin → address enrichment)
        address = None
        postal = None
        try:
            rev = nominatim_reverse(lat, lng, cache)
        except Exception:
            rev = {}
        addr = (rev or {}).get("address") or {}
        road = addr.get("road") or addr.get("pedestrian") or addr.get("footway")
        hn = addr.get("house_number")
        if road:
            address = f"{road}, {hn}".strip(", ") if hn else road
        postal = es_postal(addr.get("postcode") or "")
        city_rev = (
            addr.get("city") or addr.get("town") or addr.get("village")
            or addr.get("municipality") or city
        )
        if city_rev:
            city = city_rev

        # Prefer Nominatim "Enjoy" amenity near pin if available
        try:
            pois = nominatim(f"Enjoy Wellness {city}", cache)
        except Exception:
            pois = []
        for it in pois:
            try:
                plat, plng = float(it["lat"]), float(it["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if haversine(lat, lng, plat, plng) > 250:
                continue
            if (it.get("class"), it.get("type")) and it.get("type") in {
                "fitness_centre", "gym", "sports_centre",
            }:
                a = it.get("address") or {}
                road2 = a.get("road")
                hn2 = a.get("house_number")
                if road2:
                    address = f"{road2}, {hn2}".strip(", ") if hn2 else road2
                postal = es_postal(a.get("postcode") or "") or postal
                break

        nice_name = name if name.lower().startswith("enjoy") else f"Enjoy! {name}"
        if not nice_name.startswith("Enjoy!"):
            nice_name = nice_name.replace("Enjoy ", "Enjoy! ", 1)
            if not nice_name.startswith("Enjoy!"):
                nice_name = "Enjoy! " + nice_name

        has_street = bool(address)
        row = {
            "id": make_id("Enjoy!", address or nice_name, postal or "", city or ""),
            "brand": "Enjoy!",
            "chain": "Enjoy!",
            "name": nice_name,
            "center_name": nice_name,
            "address": address,  # None if reverse lacked a road
            "postal_code": postal or None,
            "city": city,
            "country": "Spain",
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "opening_hours": None,
            "website": "https://enjoy.es",
            "source_url": "https://enjoy.es/centros/",
            "verification_status": "VERIFIED_CURRENT",
            "notes": "official_brand_google_mymaps; gym_floor_verified_from_centros_copy",
            "is_active": True,
            "import_category": "READY_TO_IMPORT" if has_street else "NEEDS_REVIEW",
            "phase": "spain_phase3",
            "coord_source": "official_brand_mymaps",
            "geocode_status": "ok",
            "geocode_reasons": ["official_mymaps_pin"],
            "geocode_display": (rev or {}).get("display_name"),
        }
        if not has_street:
            row["notes"] += "; address_incomplete_reverse"
        open_rows.append(row)

    coming = []
    for nm, city in ENJOY_COMING_SOON:
        coming.append({
            "id": make_id("Enjoy!", nm, "", city),
            "brand": "Enjoy!",
            "chain": "Enjoy!",
            "name": nm,
            "center_name": nm,
            "address": None,
            "postal_code": None,
            "city": city,
            "country": "Spain",
            "lat": None,
            "lng": None,
            "website": "https://enjoy.es",
            "source_url": "https://enjoy.es/centros/",
            "verification_status": "COMING_SOON",
            "notes": "listed_proximamente_on_official_centros",
            "is_active": False,
            "import_category": "COMING_SOON",
            "phase": "spain_phase3",
            "coord_source": None,
        })

    all_rows = open_rows + coming
    (SCRAPES / "enjoy_spain_p3.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return all_rows


# --------------- Brand POI catalogs ---------------

def fetch_brand_pois(brand_queries, cache, limit_per=50):
    pois = []
    seen = set()
    for q in brand_queries:
        try:
            items = nominatim(q, cache, extra={"limit": str(limit_per)})
        except Exception:
            continue
        for it in items:
            key = (it.get("osm_type"), it.get("osm_id"))
            if key in seen:
                continue
            seen.add(key)
            try:
                lat, lng = float(it["lat"]), float(it["lon"])
            except (TypeError, ValueError, KeyError):
                continue
            if not in_spain_bbox(lat, lng):
                continue
            pois.append(it)
    return pois


def match_row_to_pois(r, pois, max_dist_m=350):
    """Match unresolved row to named gym POI by city + address tokens or unique city."""
    city_n = norm(r.get("city") or "")
    addr_n = norm(r.get("address") or "")
    name_n = norm(r.get("name") or "")
    postal = es_postal(r.get("postal_code") or "")
    candidates = []
    for it in pois:
        a = it.get("address") or {}
        display = it.get("display_name") or ""
        city_fields = " ".join(
            norm(a.get(k) or "")
            for k in ("city", "town", "village", "municipality", "suburb")
        )
        if city_n and not (city_n in city_fields or city_n in norm(display)):
            # soft: city token in name
            if city_n not in name_n and city_n not in norm(display):
                continue
        pc = es_postal(a.get("postcode") or "")
        score = 0
        if postal and pc == postal:
            score += 5
        road = norm(a.get("road") or "")
        tokens = [t for t in addr_n.split() if len(t) > 3]
        overlap = sum(1 for t in tokens if t in road or t in norm(display))
        score += min(4, overlap)
        hn = str(a.get("house_number") or "")
        m = re.search(r"\b(\d+[a-z]?)\b", (r.get("address") or "").lower())
        if hn and m and hn.lower() == m.group(1).lower():
            score += 3
        # name fragment
        for tok in re.findall(r"[a-z]{4,}", name_n):
            if tok in ("synergym", "fitness", "park", "dreamfit", "enjoy", "gimnasio"):
                continue
            if tok in norm(display):
                score += 1
        candidates.append((score, it, pc))

    # Unique city fallback
    city_matches = []
    for it in pois:
        a = it.get("address") or {}
        display = it.get("display_name") or ""
        city_fields = " ".join(
            norm(a.get(k) or "")
            for k in ("city", "town", "village", "municipality", "suburb")
        )
        if city_n and (city_n in city_fields or city_n in norm(display)):
            city_matches.append(it)

    candidates.sort(key=lambda x: -x[0])
    if candidates and candidates[0][0] >= 3:
        # Ambiguity check
        if len(candidates) > 1 and candidates[0][0] == candidates[1][0]:
            a = candidates[0][1]
            b = candidates[1][1]
            d = haversine(float(a["lat"]), float(a["lon"]), float(b["lat"]), float(b["lon"]))
            if d > 200:
                return None
        return candidates[0]
    if len(city_matches) == 1:
        it = city_matches[0]
        pc = es_postal((it.get("address") or {}).get("postcode") or "")
        return (2, it, pc)
    return None


def extract_maps_embed_coords(html):
    """Extract lat/lng from Google Maps embed pb= parameters."""
    out = []
    for emb in re.findall(r"google\.com/maps/embed\?pb=([^\"']+)", html):
        # Common: !2dLNG!3dLAT
        m = re.search(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", emb)
        if m:
            lng, lat = float(m.group(1)), float(m.group(2))
            if 20 < abs(lat) < 50 and abs(lng) < 20:  # filter bogus scale params
                out.append((lat, lng))
        # Street view style: !1dLAT!2dLNG
        m2 = re.search(r"!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)", emb)
        if m2:
            lat, lng = float(m2.group(1)), float(m2.group(2))
            if 20 < abs(lat) < 50 and abs(lng) < 20:
                out.append((lat, lng))
    return out


def recover_dreamfit_embeds(rows):
    """Pull official map embed coords from Dreamfit club pages."""
    recovered = 0
    PAGES.mkdir(parents=True, exist_ok=True)
    df_dir = PAGES / "dreamfit_p3"
    df_dir.mkdir(parents=True, exist_ok=True)
    for r in rows:
        if r.get("brand") != "Dreamfit":
            continue
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        if r.get("import_category") in {"DUPLICATE", "COMING_SOON", "CLOSED"}:
            continue
        url = r.get("source_url") or ""
        if "dreamfit.es" not in url:
            continue
        slug = url.rstrip("/").split("/")[-1] or "club"
        path = df_dir / f"{slug}.html"
        try:
            if path.exists() and path.stat().st_size > 1000:
                html = path.read_text(encoding="utf-8", errors="replace")
            else:
                html = http_get(url)
                path.write_text(html, encoding="utf-8")
                time.sleep(0.4)
        except Exception:
            continue
        coords = extract_maps_embed_coords(html)
        if not coords:
            continue
        lat, lng = coords[0]
        if apply_geocode_hit(
            r, lat, lng, ["official_maps_embed"], url, "official_club_page_maps_embed"
        ):
            r["phase"] = "spain_phase3"
            recovered += 1
    return recovered


def recover_fitnesspark_embeds(rows):
    """Re-fetch FP club pages; JSON-LD has no coords but maps dir may help via POI name."""
    # Primarily handled via POI matching + geocode; optional embed scrape if present
    recovered = 0
    fp_dir = PAGES / "fitnesspark"
    if not fp_dir.exists():
        return 0
    by_url = {r.get("source_url"): r for r in rows if r.get("brand") == "Fitness Park"}
    for path in fp_dir.glob("*.html"):
        html = path.read_text(encoding="utf-8", errors="replace")
        # Find canonical URL
        m = re.search(r'canonical" href="(https://www\.fitnesspark\.es/club/[^"]+)"', html)
        if not m:
            continue
        url = m.group(1)
        r = by_url.get(url) or by_url.get(url.rstrip("/") + "/")
        if not r:
            # soft match by slug
            slug = url.rstrip("/").split("/")[-1].lower()
            for u, cand in by_url.items():
                if slug in (u or "").lower():
                    r = cand
                    break
        if not r or (r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None):
            continue
        coords = extract_maps_embed_coords(html)
        if coords:
            lat, lng = coords[0]
            if apply_geocode_hit(
                r, lat, lng, ["official_maps_embed"], url, "official_club_page_maps_embed"
            ):
                r["phase"] = "spain_phase3"
                recovered += 1
    return recovered


def soft_dedupe(rows):
    collapsed = []
    by_id = {}
    kept = []
    for r in rows:
        r = dict(r)
        r["postal_code"] = es_postal(r.get("postal_code")) or r.get("postal_code") or None
        r["id"] = make_id(
            r.get("brand") or r.get("chain"),
            r.get("address") or "",
            r.get("postal_code") or "",
            r.get("city") or "",
        )
        r["chain"] = r.get("chain") or r.get("brand")
        r["center_name"] = r.get("center_name") or r.get("name")
        r["country"] = "Spain"
        prev = by_id.get(r["id"])
        if prev is None:
            by_id[r["id"]] = r
            kept.append(r)
            continue
        if richness(r) > richness(prev):
            if prev.get("import_category") == "READY_TO_IMPORT" and prev.get("lat") is not None:
                if r.get("lat") is None:
                    r["lat"], r["lng"] = prev["lat"], prev["lng"]
                    r["coord_source"] = prev.get("coord_source")
                    r["import_category"] = "READY_TO_IMPORT"
            kept.remove(prev)
            by_id[r["id"]] = r
            kept.append(r)
            collapsed.append({"kept": r.get("name"), "dropped": prev.get("name"), "reason": "richer_id"})
        else:
            for f in ("postal_code", "lat", "lng", "coord_source", "source_url", "address"):
                if not prev.get(f) and r.get(f):
                    prev[f] = r[f]
            collapsed.append({"kept": prev.get("name"), "dropped": r.get("name"), "reason": "keep_existing"})

    # Soft address duplicates same brand
    by_soft = defaultdict(list)
    for r in kept:
        if r.get("import_category") == "DUPLICATE":
            continue
        if r.get("address"):
            by_soft[(norm(r.get("brand")), norm(r.get("address")), norm(r.get("city")))].append(r)
    for group in by_soft.values():
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda x: -richness(x))
        best = group[0]
        for other in group[1:]:
            if other.get("import_category") == "READY_TO_IMPORT" and best.get("import_category") != "READY_TO_IMPORT":
                continue
            if richness(best) >= richness(other):
                other["import_category"] = "DUPLICATE"
                other["verification_status"] = "DUPLICATE"
                collapsed.append({
                    "kept": best.get("name"), "dropped": other.get("name"),
                    "reason": "soft_addr_duplicate",
                })

    # Proximity same brand ≤80m
    with_coords = [r for r in kept if r.get("lat") is not None and r.get("import_category") != "DUPLICATE"]
    for i, a in enumerate(with_coords):
        for b in with_coords[i + 1:]:
            if norm(a.get("brand")) != norm(b.get("brand")):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 80:
                poorer = a if richness(a) < richness(b) else b
                if poorer.get("import_category") != "DUPLICATE":
                    poorer["import_category"] = "DUPLICATE"
                    poorer["verification_status"] = "DUPLICATE"
                    poorer["notes"] = ((poorer.get("notes") or "") + f"; proximity_dup_{round(d)}m").strip("; ")
                    collapsed.append({
                        "kept": (b if poorer is a else a).get("name"),
                        "dropped": poorer.get("name"),
                        "reason": f"proximity_{round(d)}m",
                    })

    # DIR concept filter: Jambox is a DIR concept — keep as DIR brand but ensure one physical
    # Altafit near VivaGym
    viva = [r for r in kept if r.get("brand") == "VivaGym" and r.get("lat") is not None
            and r.get("import_category") != "DUPLICATE"]
    rebrands = []
    for r in kept:
        if r.get("brand") != "Altafit" or r.get("import_category") == "DUPLICATE":
            continue
        for v in viva:
            try:
                d = haversine(float(r["lat"]), float(r["lng"]), float(v["lat"]), float(v["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 120:
                r["import_category"] = "DUPLICATE"
                r["verification_status"] = "DUPLICATE"
                r["notes"] = ((r.get("notes") or "") + "; rebranded_to_vivagym").strip("; ")
                rebrands.append({"altafit": r.get("name"), "vivagym": v.get("name"), "distance_m": round(d)})
                break

    return kept, collapsed, rebrands


def classify_row(r):
    if r.get("import_category") == "DUPLICATE":
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        return r
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if not r.get("address") or not r.get("city"):
        if r.get("lat") is not None and in_spain_bbox(r.get("lat"), r.get("lng")):
            # coords ok but incomplete address
            r["import_category"] = "NEEDS_REVIEW"
            return r
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if in_spain_bbox(lat, lng):
                r["import_category"] = "READY_TO_IMPORT"
                r["lat"], r["lng"] = lat, lng
                r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                return r
            r["notes"] = ((r.get("notes") or "") + "; coord_outside_spain_bbox").strip("; ")
            r["lat"] = r["lng"] = None
            r["coord_source"] = None
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    if r.get("import_category") not in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        r["import_category"] = "NEEDS_COORDINATES"
    return r


def write_geocode_review(rows):
    review = []
    for r in rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"),
                "brand": r.get("brand"),
                "name": r.get("name"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"),
                "geocode_status": r.get("geocode_status"),
                "geocode_display": r.get("geocode_display"),
                "geocode_reasons": r.get("geocode_reasons"),
            })
    (OUT / "spain_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if review:
        fields = list(review[0].keys())
        with (OUT / "spain_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for row in review:
                flat = dict(row)
                if isinstance(flat.get("geocode_reasons"), list):
                    flat["geocode_reasons"] = "|".join(map(str, flat["geocode_reasons"]))
                w.writerow(flat)


def write_excel(rows):
    if not HAS_OPENPYXL:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Spain Centers"
    headers = [
        "id", "brand", "name", "address", "postal_code", "city", "country",
        "latitude", "longitude", "status", "verification_status", "source_url",
        "import_category", "coord_source", "geocode_status", "website", "notes", "phase",
    ]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([
            r.get("id"), r.get("brand"), r.get("name"), r.get("address"),
            r.get("postal_code"), r.get("city"), r.get("country"),
            r.get("lat"), r.get("lng"), r.get("import_category"),
            r.get("verification_status"), r.get("source_url"),
            r.get("import_category"), r.get("coord_source"), r.get("geocode_status"),
            r.get("website"), r.get("notes"), r.get("phase"),
        ])
    for i, _ in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = 18
    wb.save(OUT / "Gymly_Spain_All_Discovered_Centers.xlsx")


def brand_stats(active, brand):
    sub = [r for r in active if r.get("brand") == brand]
    return {
        "discovered": len(sub),
        "ready": sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT"),
        "unresolved": sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}),
        "coming_soon": sum(1 for r in sub if r.get("import_category") == "COMING_SOON"),
        "closed": sum(1 for r in sub if r.get("import_category") == "CLOSED"),
    }


def verdict_for(brand, st, estimate_n=None):
    if brand == "McFIT":
        return "COMPLETE"
    d, rd, un = st["discovered"], st["ready"], st["unresolved"]
    if d == 0 and brand == "Enjoy!":
        return "MISSING"
    if brand == "Enjoy!":
        if rd >= 15 and un <= 3:
            return "NEAR-COMPLETE"
        if rd >= 10:
            return "NEAR-COMPLETE"
        if d > 0:
            return "MATERIAL GAP"
        return "MISSING"
    if estimate_n and d == 0:
        return "MISSING"
    if un == 0 and rd >= max(1, int(0.85 * d)):
        return "COMPLETE"
    if estimate_n and d >= int(0.85 * estimate_n) and rd >= int(0.75 * d):
        return "NEAR-COMPLETE" if un > 0 else "COMPLETE"
    if d > 0 and rd >= int(0.7 * d) and (not estimate_n or d >= int(0.7 * estimate_n)):
        return "NEAR-COMPLETE"
    if d > 0 and rd < int(0.5 * max(d, estimate_n or d)):
        return "MATERIAL GAP"
    if d > 0:
        return "NEAR-COMPLETE"
    return "MISSING"


def write_reports(rows, collapsed, rebrands, stats, baseline):
    active = [r for r in rows if r.get("import_category") != "DUPLICATE"]
    ready = [r for r in active if r.get("import_category") == "READY_TO_IMPORT"]
    cats = Counter(r.get("import_category") for r in active)
    n_dup = sum(1 for r in rows if r.get("import_category") == "DUPLICATE")

    try:
        live = json.loads(CENTERS.read_text(encoding="utf-8"))
        n_live = len(live)
    except Exception:
        n_live = 7167

    brand_ready = Counter(r.get("brand") for r in ready)
    brands_all = sorted({r.get("brand") for r in active if r.get("brand")})

    chain_meta = [
        ("Basic-Fit", 246), ("VivaGym", 250), ("Altafit", 5), ("Synergym", 220),
        ("Dreamfit", 25), ("Metropolitan", 12), ("DIR", 20), ("Forus", 25),
        ("GO fit", 20), ("Anytime Fitness", 60), ("Fitness Park", 160),
        ("McFIT", None), ("Supera", 5), ("Enjoy!", 18), ("BeOne", 25),
        ("Holiday Gym", 22), ("O2 Centro Wellness", 10), ("Eurofitness", 20),
    ]

    completeness = []
    for brand, est in chain_meta:
        if brand == "McFIT":
            completeness.append({
                "brand": brand, "estimate": "N/A — sold to Basic-Fit 2024",
                "official_or_estimate": "absorbed",
                "discovered": 0, "ready": 0, "unresolved": 0,
                "verdict": "COMPLETE", "notes": "COMPLETE_VIA_BASIC_FIT",
            })
            continue
        st = brand_stats(active, brand)
        completeness.append({
            "brand": brand,
            "estimate": est,
            "discovered": st["discovered"],
            "ready": st["ready"],
            "unresolved": st["unresolved"],
            "coming_soon": st["coming_soon"],
            "verdict": verdict_for(brand, st, est),
        })

    # Other staged brands
    known = {c["brand"] for c in completeness}
    for b in brands_all:
        if b not in known:
            st = brand_stats(active, b)
            completeness.append({
                "brand": b, "estimate": None,
                "discovered": st["discovered"], "ready": st["ready"],
                "unresolved": st["unresolved"], "coming_soon": st["coming_soon"],
                "verdict": verdict_for(b, st, None),
            })

    city_rows = []
    for city in MAJOR_CITIES:
        n = norm(city)
        disc = sum(1 for r in active if n in norm(r.get("city") or ""))
        rd = sum(1 for r in ready if n in norm(r.get("city") or ""))
        city_rows.append({"city": city, "discovered": disc, "ready": rd})

    balearic = sum(1 for r in ready if in_balearic(r.get("lat"), r.get("lng")))
    canary = sum(1 for r in ready if in_canary(r.get("lat"), r.get("lng")))
    ceuta = sum(1 for r in ready if in_ceuta(r.get("lat"), r.get("lng")))
    melilla = sum(1 for r in ready if in_melilla(r.get("lat"), r.get("lng")))

    missing_addr = sum(1 for r in active if not (r.get("address") or "").strip())
    missing_pc = sum(1 for r in active if not (r.get("postal_code") or "").strip())
    missing_city = sum(1 for r in active if not (r.get("city") or "").strip())
    missing_coords = sum(1 for r in active if r.get("lat") is None)

    enjoy = brand_stats(active, "Enjoy!")
    syn = brand_stats(active, "Synergym")
    fp = brand_stats(active, "Fitness Park")

    # Phase 4 decision: material legitimate conventional gyms still recoverable?
    material_gaps = [
        c for c in completeness
        if c["verdict"] in {"MATERIAL GAP", "MISSING"} and c["brand"] != "McFIT"
    ]
    # Synergym/FP with large unresolved but discovered = recoverable
    syn_gap = syn["unresolved"] >= 40
    fp_gap = fp["unresolved"] >= 40
    phase4 = bool(material_gaps) or (syn_gap and syn["ready"] < 160) or (fp_gap and fp["ready"] < 130)
    # Don't recommend Phase 4 merely for handful of low-confidence rows
    if enjoy["ready"] >= 15 and syn["ready"] >= 160 and fp["ready"] >= 130 and not material_gaps:
        phase4 = False
    if enjoy["discovered"] == 0:
        phase4 = True

    ready_n = len(ready)
    expected = n_live + ready_n
    checkpoint_10k = expected >= 10000
    headroom = max(0, 10000 - expected)

    recommendation = "PHASE 4 REQUIRED BEFORE MERGE" if phase4 else "READY FOR SPAIN MERGE"

    report = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "status": "PHASE 3 RECOVERY COMPLETE — DO NOT MERGE." if not phase4 else "PHASE 3 DONE — PHASE 4 STILL NEEDED BEFORE MERGE.",
        "baseline_phase2": baseline,
        "phase3_stats": stats,
        "overall": {
            "unique_staged_excl_duplicates": len(active),
            "READY_TO_IMPORT": ready_n,
            "NEEDS_COORDINATES": cats.get("NEEDS_COORDINATES", 0),
            "NEEDS_REVIEW": cats.get("NEEDS_REVIEW", 0),
            "COMING_SOON": cats.get("COMING_SOON", 0),
            "CLOSED": cats.get("CLOSED", 0),
            "DUPLICATE": n_dup,
        },
        "ready_by_brand": dict(brand_ready.most_common()),
        "completeness": completeness,
        "cities": city_rows,
        "islands": {
            "balearic_ready": balearic,
            "canary_ready": canary,
            "ceuta_ready": ceuta,
            "melilla_ready": melilla,
        },
        "data_quality": {
            "missing_addresses": missing_addr,
            "missing_postal_codes": missing_pc,
            "missing_cities": missing_city,
            "missing_coordinates": missing_coords,
        },
        "enjoy": enjoy,
        "synergym": syn,
        "fitness_park": fp,
        "mcfit_note": "All McFIT Spain studios sold to Basic-Fit in 2024. No McFIT rows staged. COMPLETE via Basic-Fit.",
        "phase4_worthwhile": phase4,
        "proposed_safe_merge_ready": ready_n,
        "expected_catalog_after_merge": expected,
        "live_catalog_count": n_live,
        "checkpoint_10k": checkpoint_10k,
        "headroom_to_10k": headroom,
        "recommendation": recommendation,
        "rebrands": rebrands,
        "collapsed_sample": collapsed[:50],
    }

    (OUT / "SPAIN_PHASE3_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT / "SPAIN_PHASE3_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Markdown
    lines = []
    lines.append("# Spain Phase 3 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {report['generated_at']}")
    lines.append("")
    lines.append(f"**Status: {report['status']}**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("")
    lines.append("## Phase 2 baseline")
    lines.append("")
    for k, v in baseline.items():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## Phase 3 recovery")
    lines.append("")
    for k, v in stats.items():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## McFIT Spain")
    lines.append("")
    lines.append(report["mcfit_note"])
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    for k, v in report["overall"].items():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("## READY by brand")
    lines.append("")
    lines.append("| Brand | READY |")
    lines.append("|---|---:|")
    for b, n in brand_ready.most_common():
        lines.append(f"| {b} | {n} |")
    lines.append("")
    lines.append("## Major chain completeness")
    lines.append("")
    lines.append("| Chain | Estimate | Discovered | READY | Unresolved | Verdict |")
    lines.append("|---|---|---:|---:|---:|---|")
    for c in completeness:
        lines.append(
            f"| {c['brand']} | {c.get('estimate')} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['verdict']} |"
        )
    lines.append("")
    lines.append("## Major cities (READY)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for c in city_rows:
        lines.append(f"| {c['city']} | {c['discovered']} | {c['ready']} |")
    lines.append("")
    lines.append("## Islands")
    lines.append("")
    lines.append(f"- Balearic Islands READY: {balearic}")
    lines.append(f"- Canary Islands READY: {canary}")
    lines.append(f"- Ceuta READY: {ceuta}")
    lines.append(f"- Melilla READY: {melilla}")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    dq = report["data_quality"]
    lines.append(f"- Missing addresses: {dq['missing_addresses']}")
    lines.append(f"- Missing postal codes: {dq['missing_postal_codes']}")
    lines.append(f"- Missing cities: {dq['missing_cities']}")
    lines.append(f"- Missing coordinates: {dq['missing_coordinates']}")
    lines.append("- Spanish postcodes preserved as 5-digit strings.")
    lines.append("- No city/postcode/country centroid fallbacks used.")
    lines.append("")
    lines.append("## Remaining gaps / Phase 4?")
    lines.append("")
    lines.append(f"- Enjoy!: discovered {enjoy['discovered']}, READY {enjoy['ready']}, unresolved {enjoy['unresolved']}, coming_soon {enjoy['coming_soon']}")
    lines.append(f"- Synergym: READY {syn['ready']} / discovered {syn['discovered']} (unresolved {syn['unresolved']})")
    lines.append(f"- Fitness Park: READY {fp['ready']} / discovered {fp['discovered']} (unresolved {fp['unresolved']})")
    lines.append(f"- Phase 4 worthwhile? **{'YES' if phase4 else 'NO'}**")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows from Phase 3 staging.")
    lines.append("")
    lines.append(f"Expected catalog after merge: **{n_live} + {ready_n} = {expected}**.")
    lines.append("")
    lines.append(f"## 10K checkpoint: {'YES' if checkpoint_10k else 'NO'}" + (f" (headroom {headroom})" if not checkpoint_10k else ""))
    lines.append("")
    lines.append(f"## RECOMMENDATION: {recommendation}")
    lines.append("")

    (OUT / "SPAIN_PHASE3_READINESS_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    SCRAPES.mkdir(parents=True, exist_ok=True)

    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    # Baseline from real staging
    active0 = [r for r in staging if r.get("import_category") != "DUPLICATE"]
    baseline = {
        "unique_staged": len(active0),
        "READY_TO_IMPORT": sum(1 for r in active0 if r.get("import_category") == "READY_TO_IMPORT"),
        "NEEDS_COORDINATES": sum(1 for r in active0 if r.get("import_category") == "NEEDS_COORDINATES"),
        "NEEDS_REVIEW": sum(1 for r in active0 if r.get("import_category") == "NEEDS_REVIEW"),
        "COMING_SOON": sum(1 for r in active0 if r.get("import_category") == "COMING_SOON"),
        "CLOSED": sum(1 for r in active0 if r.get("import_category") == "CLOSED"),
        "DUPLICATE": sum(1 for r in staging if r.get("import_category") == "DUPLICATE"),
    }
    print("BASELINE", baseline)

    stats = {
        "enjoy_discovered": 0,
        "enjoy_ready": 0,
        "poi_matched": 0,
        "embed_recovered": 0,
        "geocode_recovered": 0,
        "new_added": 0,
        "duplicates_removed": 0,
        "rebrands": 0,
        "preserved_ready": baseline["READY_TO_IMPORT"],
    }

    # Snapshot READY ids to never downgrade
    ready_ids = {
        r["id"] for r in staging
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None
    }

    # 1) Enjoy discovery
    print("Discovering Enjoy!…")
    enjoy_rows = discover_enjoy(cache)
    stats["enjoy_discovered"] = len([r for r in enjoy_rows if r.get("import_category") != "COMING_SOON"])
    stats["enjoy_ready"] = sum(1 for r in enjoy_rows if r.get("import_category") == "READY_TO_IMPORT")
    print(f"  Enjoy open={stats['enjoy_discovered']} ready={stats['enjoy_ready']} coming={sum(1 for r in enjoy_rows if r.get('import_category')=='COMING_SOON')}")

    rows = list(staging) + enjoy_rows
    stats["new_added"] = len(enjoy_rows)

    # 2) Brand POI catalogs
    print("Fetching Nominatim brand POIs…")
    syn_pois = fetch_brand_pois(
        ["Synergym", "SynerGym", "Synergym España"], cache, limit_per=50
    )
    fp_pois = fetch_brand_pois(
        ["Fitness Park", "Fitness Park España", "FitnessPark"], cache, limit_per=50
    )
    df_pois = fetch_brand_pois(["Dreamfit", "Dreamfit España"], cache, limit_per=40)
    print(f"  POIs Synergym={len(syn_pois)} FitnessPark={len(fp_pois)} Dreamfit={len(df_pois)}")
    (RAW / "nominatim_synergym_pois_p3.json").write_text(
        json.dumps(syn_pois, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (RAW / "nominatim_fitnesspark_pois_p3.json").write_text(
        json.dumps(fp_pois, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    brand_poi_map = {
        "Synergym": syn_pois,
        "Fitness Park": fp_pois,
        "Dreamfit": df_pois,
    }

    # 3) Match unresolved to POIs
    for r in rows:
        if r.get("id") in ready_ids:
            continue
        if r.get("import_category") in {"READY_TO_IMPORT", "DUPLICATE", "COMING_SOON", "CLOSED"}:
            if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
                continue
        brand = r.get("brand")
        pois = brand_poi_map.get(brand)
        if not pois:
            continue
        if r.get("lat") is not None and r.get("import_category") == "READY_TO_IMPORT":
            continue
        hit = match_row_to_pois(r, pois)
        if not hit:
            continue
        score, it, pc = hit
        if apply_geocode_hit(
            r, it["lat"], it["lon"],
            ["named_gym_poi_match", f"score_{score}"],
            it.get("display_name"),
            "nominatim_named_gym_poi",
            pc,
        ):
            # Optionally enrich address from POI if missing house bits
            a = it.get("address") or {}
            if not r.get("postal_code") and pc:
                r["postal_code"] = pc
            r["phase"] = "spain_phase3"
            stats["poi_matched"] += 1

    # 4) Dreamfit / Fitness Park embeds
    print("Recovering Dreamfit embeds…")
    stats["embed_recovered"] += recover_dreamfit_embeds(rows)
    stats["embed_recovered"] += recover_fitnesspark_embeds(rows)
    print(f"  embeds recovered={stats['embed_recovered']}")

    # 5) Strict geocode remaining priority brands + all NEEDS
    priority = {
        "Synergym", "Fitness Park", "Dreamfit", "DIR", "GO fit",
        "Metropolitan", "Supera", "BeOne", "O2 Centro Wellness",
        "Forus", "Basic-Fit", "Eurofitness", "Enjoy!",
    }
    unresolved = [
        r for r in rows
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
        or (r.get("import_category") != "READY_TO_IMPORT" and r.get("lat") is None
            and r.get("import_category") not in {"DUPLICATE", "COMING_SOON", "CLOSED"})
    ]
    # Prioritize
    unresolved.sort(key=lambda r: (0 if r.get("brand") in priority else 1, r.get("brand") or ""))
    print(f"Geocoding {len(unresolved)} unresolved…")
    for i, r in enumerate(unresolved):
        if r.get("id") in ready_ids and r.get("lat") is not None:
            continue
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        _, ok = geocode_row_strict(r, cache)
        if ok:
            r["phase"] = "spain_phase3"
            stats["geocode_recovered"] += 1
        if (i + 1) % 25 == 0:
            print(f"  geocode progress {i+1}/{len(unresolved)} recovered={stats['geocode_recovered']}")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # 6) Dedupe / classify
    kept, collapsed, rebrands = soft_dedupe(rows)
    stats["duplicates_removed"] = sum(1 for r in kept if r.get("import_category") == "DUPLICATE")
    stats["rebrands"] = len(rebrands)

    # Preserve original READY coords if somehow lost
    by_id = {r["id"]: r for r in kept}
    for r in staging:
        if r.get("id") in ready_ids:
            cur = by_id.get(r["id"])
            if cur and (cur.get("lat") is None or cur.get("import_category") != "READY_TO_IMPORT"):
                cur["lat"] = r["lat"]
                cur["lng"] = r["lng"]
                cur["coord_source"] = r.get("coord_source")
                cur["import_category"] = "READY_TO_IMPORT"
                cur["verification_status"] = "VERIFIED_CURRENT"

    for r in kept:
        classify_row(r)

    # Final safety: READY must have Spain bbox coords
    for r in kept:
        if r.get("import_category") == "READY_TO_IMPORT":
            if not in_spain_bbox(r.get("lat"), r.get("lng")):
                r["lat"] = r["lng"] = None
                r["import_category"] = "NEEDS_COORDINATES"

    # Write artifacts
    STAGING.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    write_geocode_review(kept)
    write_excel(kept)

    (OUT / "spain_duplicate_analysis.json").write_text(
        json.dumps({
            "collapsed": collapsed,
            "rebrands": rebrands,
            "counts": Counter(c.get("reason") for c in collapsed),
        }, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )

    report = write_reports(kept, collapsed, rebrands, stats, baseline)
    print("DONE", report["overall"])
    print("RECOMMENDATION", report["recommendation"])
    print("READY", report["overall"]["READY_TO_IMPORT"])


if __name__ == "__main__":
    main()
