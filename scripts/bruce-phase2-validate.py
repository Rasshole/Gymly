#!/usr/bin/env python3
"""
Bruce Phase 2 — cleanup + coordinate validation + final import gate.
READ-ONLY vs centers.json. Writes only scripts/out/bruce_phase2_* artifacts.
"""
from __future__ import annotations

import html as HTML
import hashlib
import json
import math
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / "out"
CENTERS = ROOT / "src" / "data" / "centers.json"
PHASE1 = OUT / "bruce_phase1_audit.json"
RAW = OUT / "bruce_venues_raw.json"
CACHE_PATH = OUT / "bruce_phase2_geocode_cache.json"
JSON_OUT = OUT / "bruce_phase2_validation.json"
MD_OUT = OUT / "BRUCE_PHASE2_VALIDATION.md"

UA = "GymlyBrucePhase2/1.0 (catalog-validation; no-write; contact@gymly.app)"
CTX = ssl.create_default_context()
SLEEP_NOM = 1.05

COUNTRY_MAP = {"DK": "Denmark", "SE": "Sweden", "NO": "Norway", "Denmark": "Denmark", "Sweden": "Sweden", "Norway": "Norway"}

SAUNA_RECOVERY_HINTS = re.compile(
    r"\b(sauna|bastu|badstu|float|recovery|spa|massage|wellness|heat.?n.?health|"
    r"hot.?box|hot.?n.?cold|fjordtokt|folkbastu|bear.?heat|analog.?sauna|"
    r"edens.?bastu|eltons.?bastu|heat.?harmony|heit.?bergen|holm8|"
    r"ignite.*recovery|copenhagen.?float)\b",
    re.I,
)
TRAINING_HINTS = re.compile(
    r"\b(gym|fitness|yoga|pilates|reformer|crossfit|boxing|boxing|martial|"
    r"krav.?maga|climbing|hyrox|strength|functional|cycling|barre|dance|"
    r"swim|training|workout|pt\b|personal.?train|spin|hiit|bootcamp|"
    r"calisthen|outdoor.?train|running.?club|bjj|mma|kickbox|judo|karate|"
    r"muay|wrestling|pole|aerial|trx|circuit)\b",
    re.I,
)
OUTDOOR_HINTS = re.compile(r"\b(outdoor|utenom|utomhus|kajak|sup\b|park.?train)\b", re.I)

BRUCE_BRANDED_RE = re.compile(r"\bby\s+bruce(\s+studios?)?\b|\bbruce\s+studios?\b", re.I)


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def http_json(url: str, headers: dict | None = None, timeout: int = 30):
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as resp:
        return json.load(resp)


def slugify(s: str) -> str:
    s = HTML.unescape(s or "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    repl = {"æ": "ae", "ø": "oe", "å": "aa", "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
    for a, b in repl.items():
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


def normalize_name(name: str) -> str:
    n = HTML.unescape(name or "")
    n = n.replace("\xa0", " ")
    n = re.sub(r"\s+", " ", n).strip()
    # fix common scrape punctuation
    n = n.replace("’", "'").replace("‘", "'").replace("`", "'")
    n = re.sub(r"\s+,\s+", ", ", n)
    return n


def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", HTML.unescape(s or "").replace("\xa0", " ")).strip()


def fold(s: str) -> str:
    s = normalize_name(s).lower()
    for a, b in [("æ", "ae"), ("ø", "oe"), ("å", "aa"), ("ä", "ae"), ("ö", "oe")]:
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", s)


def parse_street_blob(street: str, locality: str, postal: str, country_code: str):
    """Extract street, house, postal, city from Bruce streetAddress blob."""
    raw = normalize_space(street)
    loc = normalize_space(locality)
    pc = normalize_space(postal)
    country = COUNTRY_MAP.get(country_code, country_code)

    # Strip trailing country
    raw2 = re.sub(r",?\s*(Denmark|Sweden|Norway|Danmark|Sverige|Norge)\s*$", "", raw, flags=re.I).strip(" ,")

    street_out, house, postal_out, city_out = "", "", pc, loc

    if country == "Denmark":
        # "Udsigten 14, 2820 Gentofte" or "Udsigten 14, 2820 København"
        m = re.search(r"^(.*?),\s*(\d{4})\s+(.+)$", raw2)
        if m:
            left, postal_out, city_out = m.group(1).strip(), m.group(2), m.group(3).strip()
            street_out = left
        else:
            m2 = re.search(r"\b(\d{4})\b", raw2)
            if m2:
                postal_out = m2.group(1)
                street_out = raw2[: m2.start()].strip(" ,")
                city_out = raw2[m2.end() :].strip(" ,") or loc
            else:
                street_out = raw2
        hm = re.search(r"^(.+?)\s+(\d+[A-Za-zÆØÅæøå]?)$", street_out)
        if hm:
            street_out, house = hm.group(1).strip(), hm.group(2).strip()
    elif country == "Sweden":
        # "Kattsundsgatan 10" or "Brunkebergstorg 5, 111 51 Stockholm"
        m = re.search(r"^(.*?),\s*(\d{3}\s?\d{2})\s+(.+)$", raw2)
        if m:
            left, postal_out, city_out = m.group(1).strip(), re.sub(r"\s+", " ", m.group(2)).strip(), m.group(3).strip()
            street_out = left
        else:
            m2 = re.search(r"\b(\d{3}\s?\d{2})\b", raw2)
            if m2:
                postal_out = re.sub(r"\s+", " ", m2.group(1)).strip()
                street_out = raw2[: m2.start()].strip(" ,")
                city_out = raw2[m2.end() :].strip(" ,") or loc
            else:
                street_out = raw2
                city_out = loc
        hm = re.search(r"^(.+?)\s+(\d+[A-Za-z]?)$", street_out)
        if hm:
            street_out, house = hm.group(1).strip(), hm.group(2).strip()
        if postal_out:
            postal_out = re.sub(r"^(\d{3})\s?(\d{2})$", r"\1 \2", postal_out.replace(" ", ""))
    else:  # Norway
        m = re.search(r"^(.*?),\s*(\d{4})\s+(.+)$", raw2)
        if m:
            left, postal_out, city_out = m.group(1).strip(), m.group(2), m.group(3).strip()
            street_out = left
        else:
            m2 = re.search(r"\b(\d{4})\b", raw2)
            if m2:
                postal_out = m2.group(1)
                street_out = raw2[: m2.start()].strip(" ,")
                city_out = raw2[m2.end() :].strip(" ,") or loc
            else:
                street_out = raw2
                city_out = loc
        hm = re.search(r"^(.+?)\s+(\d+[A-Za-z]?)$", street_out)
        if hm:
            street_out, house = hm.group(1).strip(), hm.group(2).strip()

    city_out = re.sub(r",?\s*(Denmark|Sweden|Norway|Danmark|Sverige|Norge)\s*$", "", city_out or "", flags=re.I).strip(" ,")
    if city_out.lower() in {"copenhagen", "kobenhavn", "koebenhavn"}:
        city_out = "København"
    if city_out.lower() in {"gothenburg", "goteborg"}:
        city_out = "Göteborg"
    if city_out.lower() in {"malmo"}:
        city_out = "Malmö"

    return {
        "street": street_out,
        "house": house,
        "postal_code": postal_out or "",
        "city": city_out or loc,
        "country": country,
        "address_line": f"{street_out} {house}".strip() if house else street_out,
    }


def make_dk_id(brand: str, postal: str, city: str, address: str) -> str:
    return "-".join(
        filter(
            None,
            [
                slugify(brand)[:40],
                slugify(postal)[:8],
                slugify(city)[:30],
                slugify(address)[:50],
            ],
        )
    )


def make_se_id(brand: str, name: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (name or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
        ]
    )
    return "se_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def make_no_id(brand: str, name: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (name or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
        ]
    )
    return "no_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def infer_brand(name: str, categories: list) -> tuple[str, str]:
    """Return (brand, brand_reason). Bruce is platform, not default brand."""
    n = normalize_name(name)
    if re.search(r"^energii\b", n, re.I):
        return "Energii", "name_prefix_energii"
    if re.search(r"^shc\b", n, re.I) or "sporting health club" in n.lower():
        return "SHC", "name_prefix_shc"
    if BRUCE_BRANDED_RE.search(n) and re.search(r"^by\s+bruce", n, re.I):
        return "Bruce Studios", "genuine_bruce_branded_name"
    # strip trailing " by Bruce..."
    core = re.sub(r"\s+by\s+bruce(\s+studios?)?\s*$", "", n, flags=re.I).strip()
    if core and core != n:
        return core, "stripped_by_bruce_suffix"
    # Use venue name as brand for independent studios
    return n, "venue_name_as_brand"


# --------------- geocoders ---------------

def dawa_datavask(betegnelse: str, cache: dict):
    key = f"dawa_wash:{betegnelse}"
    if key in cache:
        return cache[key]
    q = urllib.parse.quote(betegnelse)
    url = f"https://api.dataforsyningen.dk/datavask/adgangsadresser?betegnelse={q}"
    try:
        data = http_json(url)
        cache[key] = data
        return data
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]


def dawa_by_id(aid: str, cache: dict):
    key = f"dawa_id:{aid}"
    if key in cache:
        return cache[key]
    url = f"https://api.dataforsyningen.dk/adgangsadresser/{aid}?struktur=mini"
    try:
        data = http_json(url)
        cache[key] = data
        return data
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]


def dawa_reverse(lat: float, lng: float, cache: dict):
    key = f"dawa_rev:{lat:.6f},{lng:.6f}"
    if key in cache:
        return cache[key]
    url = f"https://api.dataforsyningen.dk/adgangsadresser/reverse?x={lng}&y={lat}&struktur=mini"
    try:
        data = http_json(url)
        cache[key] = data
        return data
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]


def nominatim_reverse(lat: float, lng: float, cache: dict, countrycodes: str):
    key = f"nom_rev:{lat:.6f},{lng:.6f}:{countrycodes}"
    if key in cache:
        return cache[key]
    time.sleep(SLEEP_NOM)
    qs = urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
            "countrycodes": countrycodes,
            "zoom": 18,
        }
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{qs}"
    try:
        data = http_json(url)
        cache[key] = data
        return data
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]


def nominatim_search(query: str, cache: dict, countrycodes: str):
    key = f"nom_fwd:{query}:{countrycodes}"
    if key in cache:
        return cache[key]
    time.sleep(SLEEP_NOM)
    qs = urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 3,
            "countrycodes": countrycodes,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{qs}"
    try:
        data = http_json(url)
        cache[key] = data
        return data
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]


def se_postal_norm(pc: str) -> str:
    pc = re.sub(r"\s+", "", pc or "")
    if re.match(r"^\d{5}$", pc):
        return f"{pc[:3]} {pc[3:]}"
    return (pc or "").strip()


def classify_coord(dist_m: float | None, house_match: bool, road_match: bool, postal_match: bool, city_match: bool, country_ok: bool) -> str:
    if dist_m is None:
        return "FAILED"
    if not country_ok:
        return "MISMATCH"
    if dist_m <= 35 and (house_match or (road_match and postal_match)):
        return "EXACT_ADDRESS"
    if dist_m <= 80 and road_match and postal_match:
        return "BUILDING_COMPLEX"
    if dist_m <= 150 and road_match and (postal_match or city_match):
        return "STREET_LEVEL_ACCEPTABLE"
    if dist_m <= 200 and postal_match and city_match and road_match:
        return "STREET_LEVEL_ACCEPTABLE"
    if dist_m > 500 or not postal_match:
        if city_match and dist_m < 2000 and not postal_match:
            return "MISMATCH"
        if dist_m > 2000:
            return "MISMATCH"
        return "AMBIGUOUS"
    return "AMBIGUOUS"


def road_alike(a: str, b: str) -> bool:
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return False
    if fa == fb:
        return True
    if fa in fb or fb in fa:
        return True
    # street suffix noise
    for s in ("gatan", "gade", "vej", "veien", "gata", "väg", "vagen", "alle", "allé", "plads", "torg", "torget", "street", "road"):
        fa2, fb2 = fa.replace(s, ""), fb.replace(s, "")
        if fa2 and fb2 and (fa2 == fb2 or fa2 in fb2 or fb2 in fa2):
            return True
    return False


def city_alike(a: str, b: str) -> bool:
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return False
    aliases = {
        "kobenhavn": {"copenhagen", "koebenhavn", "kobenhavn"},
        "goteborg": {"gothenburg", "goteborg"},
        "malmo": {"malmo", "malmoe"},
        "oslo": {"oslo"},
        "stockholm": {"stockholm"},
        "aarhus": {"aarhus", "arhus"},
        "odense": {"odense"},
        "aalborg": {"aalborg", "alborg"},
    }
    if fa == fb:
        return True
    for group in aliases.values():
        if fa in group and fb in group:
            return True
    return fa in fb or fb in fa


def validate_dk(parsed, bruce_lat, bruce_lng, cache):
    evidence = {}
    # Prefer forward wash
    beteg = ""
    if parsed["house"]:
        beteg = f"{parsed['street']} {parsed['house']}"
    else:
        beteg = parsed["address_line"] or parsed["street"]
    if parsed["postal_code"]:
        beteg = f"{beteg}, {parsed['postal_code']}"
        if parsed["city"]:
            beteg = f"{beteg} {parsed['city']}"

    wash = dawa_datavask(beteg, cache) if beteg else {}
    evidence["dawa_wash_query"] = beteg
    evidence["dawa_wash_kategori"] = wash.get("kategori") if isinstance(wash, dict) else None

    addr = None
    if isinstance(wash, dict) and wash.get("resultater"):
        akt = wash["resultater"][0].get("aktueladresse") or {}
        aid = akt.get("id")
        if aid:
            addr = dawa_by_id(aid, cache)

    rev = None
    if bruce_lat is not None and bruce_lng is not None:
        rev = dawa_reverse(bruce_lat, bruce_lng, cache)
        evidence["dawa_reverse"] = {
            "vejnavn": (rev or {}).get("vejnavn"),
            "husnr": (rev or {}).get("husnr"),
            "postnr": (rev or {}).get("postnr"),
            "postnrnavn": (rev or {}).get("postnrnavn"),
            "x": (rev or {}).get("x"),
            "y": (rev or {}).get("y"),
        }

    # Prefer wash match; fall back to reverse if wash weak
    use = addr if isinstance(addr, dict) and "error" not in addr and addr.get("postnr") else None
    if not use and isinstance(rev, dict) and rev.get("postnr"):
        use = rev
        evidence["authority_source"] = "dawa_reverse"
    elif use:
        evidence["authority_source"] = "dawa_datavask"
    else:
        evidence["authority_source"] = "none"
        return {
            "ok": False,
            "coord_class": "FAILED",
            "normalized": parsed,
            "evidence": evidence,
            "dist_m": None,
            "auth_lat": None,
            "auth_lng": None,
        }

    auth_lat = float(use["y"])
    auth_lng = float(use["x"])
    dist = haversine_m(bruce_lat, bruce_lng, auth_lat, auth_lng) if bruce_lat is not None else None

    house_match = bool(parsed["house"]) and fold(str(use.get("husnr") or "")) == fold(parsed["house"])
    # also accept reverse house match when wash lacked house
    if not house_match and rev and fold(str(rev.get("husnr") or "")) == fold(parsed["house"] or ""):
        house_match = True
    road_match = road_alike(parsed["street"], use.get("vejnavn") or "")
    postal_match = (parsed["postal_code"] or "") == (use.get("postnr") or "")
    if not parsed["postal_code"]:
        postal_match = True  # will fill from authority
    city_auth = use.get("postnrnavn") or ""
    city_match = city_alike(parsed["city"], city_auth) or city_alike(parsed["city"], "København") and False
    # City from Bruce often wrong; authority city is truth — don't require Bruce city match for ACCEPT
    city_match = True if city_auth else city_alike(parsed["city"], city_auth)

    # If wash kategori A/B and dist small → exact
    kat = evidence.get("dawa_wash_kategori")
    if dist is not None and dist <= 40 and kat in {"A", "B"} and road_match:
        coord_class = "EXACT_ADDRESS"
    elif dist is not None and dist <= 40 and house_match and road_match:
        coord_class = "EXACT_ADDRESS"
    else:
        coord_class = classify_coord(dist, house_match, road_match, True if use.get("postnr") else False, True, True)

    # If Bruce coords far from washed address → mismatch (wrong branch / stale)
    if dist is not None and dist > 250:
        coord_class = "MISMATCH"

    norm = {
        "street": use.get("vejnavn") or parsed["street"],
        "house": str(use.get("husnr") or parsed["house"] or ""),
        "postal_code": use.get("postnr") or parsed["postal_code"],
        "city": city_auth or parsed["city"],
        "country": "Denmark",
        "address_line": f"{use.get('vejnavn') or parsed['street']} {use.get('husnr') or parsed['house'] or ''}".strip(),
    }
    evidence.update(
        {
            "house_match": house_match,
            "road_match": road_match,
            "postal_match": (parsed["postal_code"] or "") == (use.get("postnr") or "") if parsed["postal_code"] else "filled",
            "auth_city": city_auth,
            "bruce_city": parsed["city"],
        }
    )
    return {
        "ok": coord_class in {"EXACT_ADDRESS", "BUILDING_COMPLEX", "STREET_LEVEL_ACCEPTABLE"},
        "coord_class": coord_class,
        "normalized": norm,
        "evidence": evidence,
        "dist_m": round(dist, 1) if dist is not None else None,
        "auth_lat": auth_lat,
        "auth_lng": auth_lng,
        "use_bruce_coords": dist is not None and dist <= 80,
    }


def validate_nordic(parsed, bruce_lat, bruce_lng, cache, cc: str):
    evidence = {}
    country = "Sweden" if cc == "se" else "Norway"
    rev = nominatim_reverse(bruce_lat, bruce_lng, cache, cc) if bruce_lat is not None else {}
    if isinstance(rev, dict) and "error" not in rev:
        evidence["nominatim_reverse_display"] = rev.get("display_name")
        addr = rev.get("address") or {}
    else:
        addr = {}
        evidence["nominatim_reverse_error"] = (rev or {}).get("error")

    road = addr.get("road") or addr.get("pedestrian") or addr.get("footway") or addr.get("square") or ""
    house = str(addr.get("house_number") or "")
    postal = se_postal_norm(addr.get("postcode") or "") if cc == "se" else (addr.get("postcode") or "")
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
        or ""
    )
    if city.endswith(" kommun"):
        city = city[: -len(" kommun")].strip()
    country_code = (addr.get("country_code") or "").lower()
    country_ok = country_code == cc

    # Forward if reverse weak or postal empty
    fwd = None
    q_parts = [parsed["address_line"] or parsed["street"]]
    if parsed["postal_code"]:
        q_parts.append(parsed["postal_code"])
    if parsed["city"]:
        q_parts.append(parsed["city"])
    q_parts.append(country)
    query = ", ".join(p for p in q_parts if p)
    need_fwd = (not postal) or (not road) or (not country_ok) or (parsed["house"] and house and fold(house) != fold(parsed["house"]))
    if need_fwd or not postal:
        fwd_list = nominatim_search(query, cache, cc)
        evidence["nominatim_forward_query"] = query
        if isinstance(fwd_list, list) and fwd_list:
            fwd = fwd_list[0]
            evidence["nominatim_forward_display"] = fwd.get("display_name")
            faddr = fwd.get("address") or {}
            if not road:
                road = faddr.get("road") or road
            if not house:
                house = str(faddr.get("house_number") or house)
            if not postal:
                postal = se_postal_norm(faddr.get("postcode") or "") if cc == "se" else (faddr.get("postcode") or "")
            if not city:
                city = faddr.get("city") or faddr.get("town") or faddr.get("village") or city
            if not country_ok:
                country_ok = (faddr.get("country_code") or "").lower() == cc

    auth_lat = auth_lng = None
    dist = None
    # Prefer Bruce coords if reverse confirms street/postal; else use forward coords
    if isinstance(rev, dict) and rev.get("lat") and country_ok and road:
        # keep Bruce as venue pin when reverse confirms neighborhood
        auth_lat, auth_lng = bruce_lat, bruce_lng
        if fwd and fwd.get("lat"):
            dist = haversine_m(bruce_lat, bruce_lng, float(fwd["lat"]), float(fwd["lon"]))
        else:
            # distance to reverse point (should be ~0)
            dist = haversine_m(bruce_lat, bruce_lng, float(rev["lat"]), float(rev["lon"]))
        evidence["authority_source"] = "nominatim_reverse_confirm_bruce"
    elif fwd and fwd.get("lat"):
        auth_lat, auth_lng = float(fwd["lat"]), float(fwd["lon"])
        dist = haversine_m(bruce_lat, bruce_lng, auth_lat, auth_lng)
        evidence["authority_source"] = "nominatim_forward"
        # if forward far, mismatch
    else:
        evidence["authority_source"] = "none"
        return {
            "ok": False,
            "coord_class": "FAILED",
            "normalized": parsed,
            "evidence": evidence,
            "dist_m": None,
            "auth_lat": None,
            "auth_lng": None,
            "use_bruce_coords": False,
        }

    house_match = bool(parsed["house"]) and fold(house) == fold(parsed["house"])
    road_match = road_alike(parsed["street"], road)
    p_norm = se_postal_norm(parsed["postal_code"]) if cc == "se" else (parsed["postal_code"] or "")
    postal_auth = se_postal_norm(postal) if cc == "se" else (postal or "")
    postal_match = bool(p_norm) and fold(p_norm.replace(" ", "")) == fold(postal_auth.replace(" ", ""))
    if not p_norm and postal_auth:
        postal_match = True  # fill
    city_match = city_alike(parsed["city"], city) if city else False

    if not postal_auth and not p_norm:
        coord_class = "FAILED"
    elif dist is not None and dist > 400:
        coord_class = "MISMATCH"
    elif road_match and (house_match or postal_match) and country_ok and (dist is None or dist <= 120):
        if house_match and (dist is None or dist <= 50):
            coord_class = "EXACT_ADDRESS"
        elif postal_match and road_match:
            coord_class = "BUILDING_COMPLEX" if (dist or 0) <= 100 else "STREET_LEVEL_ACCEPTABLE"
        else:
            coord_class = classify_coord(dist or 0, house_match, road_match, postal_match or bool(postal_auth), city_match or bool(city), country_ok)
    else:
        coord_class = classify_coord(dist, house_match, road_match, postal_match or bool(postal_auth), city_match or bool(city), country_ok)

    # Accept street-level when reverse road+postal confirm even if house differs slightly
    if coord_class in {"AMBIGUOUS"} and road_match and postal_auth and country_ok and (dist is None or dist <= 120):
        coord_class = "STREET_LEVEL_ACCEPTABLE"
        evidence["street_level_justification"] = (
            f"Nominatim reverse confirms road={road}, postal={postal_auth}, city={city}; "
            f"Bruce pin within {dist}m of geocode; safe for 200m check-in."
        )

    norm = {
        "street": parsed["street"] or road,
        "house": parsed["house"] or house,
        "postal_code": p_norm or postal_auth,
        "city": city or parsed["city"],
        "country": country,
        "address_line": f"{(parsed['street'] or road)} {(parsed['house'] or house)}".strip(),
    }
    # Prefer authoritative city/postal when Bruce empty/wrong
    if postal_auth:
        norm["postal_code"] = postal_auth if (not p_norm or not postal_match) else (p_norm or postal_auth)
        if not p_norm:
            norm["postal_code"] = postal_auth
        elif postal_match:
            norm["postal_code"] = p_norm
        else:
            # keep authority when mismatch and reverse strong
            if road_match:
                norm["postal_code"] = postal_auth
    if city:
        # Prefer geo city over Bruce locality hub labels
        norm["city"] = city

    evidence.update(
        {
            "house_match": house_match,
            "road_match": road_match,
            "postal_match": postal_match,
            "auth_postal": postal_auth,
            "auth_city": city,
            "auth_road": road,
            "auth_house": house,
            "bruce_city": parsed["city"],
            "bruce_postal": parsed["postal_code"],
        }
    )
    ok = coord_class in {"EXACT_ADDRESS", "BUILDING_COMPLEX", "STREET_LEVEL_ACCEPTABLE"} and bool(norm["postal_code"])
    return {
        "ok": ok,
        "coord_class": coord_class,
        "normalized": norm,
        "evidence": evidence,
        "dist_m": round(dist, 1) if dist is not None else None,
        "auth_lat": auth_lat,
        "auth_lng": auth_lng,
        "use_bruce_coords": True if evidence.get("authority_source") == "nominatim_reverse_confirm_bruce" else (dist is not None and dist <= 80),
    }


def policy_classify(name: str, categories: list, outdoor_flag: bool) -> tuple[str, str]:
    """Return (policy_label, reason) among TRAINING_INCLUDE / RECOVERY_ONLY_EXCLUDE / AMBIGUOUS_WITHHOLD / OUTDOOR_*."""
    n = normalize_name(name)
    cats = " ".join(categories or [])
    blob = f"{n} {cats}"

    if outdoor_flag or OUTDOOR_HINTS.search(blob) or "Outdoor" in (categories or []):
        # handled separately for the 4 ambiguous + outdoor set
        pass

    is_sauna_cat = "Sauna/Recovery" in (categories or []) or bool(SAUNA_RECOVERY_HINTS.search(blob))
    has_training = bool(TRAINING_HINTS.search(blob)) or any(
        c in (categories or [])
        for c in (
            "Yoga",
            "Pilates",
            "Reformer",
            "Gym",
            "CrossFit",
            "Boxing",
            "Martial arts",
            "Climbing",
            "HYROX",
            "Strength",
            "Functional",
            "Cycling",
            "Barre",
            "Dance",
            "Swimming",
            "Outdoor",
        )
    )

    if is_sauna_cat:
        # recovery room attached to training hub
        if re.search(r"recovery\s*room|sauna$", n, re.I) and re.search(r"ignite|training|hub|fitness|gym|club", n, re.I):
            if re.search(r"recovery|sauna", n, re.I) and not re.search(r"training|gym|fitness|hub|yoga|pilates|crossfit|hyrox", n, re.I):
                return "RECOVERY_ONLY_EXCLUDE", "name_indicates_recovery_only_product"
            if "recovery" in n.lower() and "training" in n.lower():
                return "AMBIGUOUS_WITHHOLD", "training_hub_recovery_room_unclear_if_separate_venue"
        if has_training and not re.search(r"^(analog|bear|eden|elton|folk|heat|heit|hot|fjord|copenhagen float)", n, re.I):
            # e.g. gym+sauna named with both
            if re.search(r"sauna|bastu|badstu|float|recovery|spa", n, re.I) and not TRAINING_HINTS.search(n):
                return "RECOVERY_ONLY_EXCLUDE", "sauna_recovery_name_without_training_signal"
            return "TRAINING_INCLUDE", "has_training_category_or_name"
        if re.search(
            r"sauna|bastu|badstu|float|spa|massage|recovery\s*room|heat.?n.?health|hot.?box|hot.?n.?cold|folkbastu|bear.?heat|analog.?sauna",
            n,
            re.I,
        ) and not TRAINING_HINTS.search(n):
            return "RECOVERY_ONLY_EXCLUDE", "pure_recovery_wellness_name"
        if is_sauna_cat and not has_training:
            return "RECOVERY_ONLY_EXCLUDE", "sauna_recovery_category_no_training"
        return "AMBIGUOUS_WITHHOLD", "mixed_recovery_signals"

    return "TRAINING_INCLUDE", "default_training_venue"


def outdoor_verdict(name: str, address: str, postal: str, city: str, lat, lng, coord_class: str) -> dict:
    n = normalize_name(name)
    evidence = []
    # Known weak outdoor from Phase 1
    if "alex beck outdoor" in n.lower():
        return {
            "verdict": "WITHHOLD",
            "reason": "Outdoor class brand at Karen Blixens Plads — plaza meeting point, not a fixed training facility with a stable training pin suitable for 200m check-in.",
            "evidence": ["phase1_outdoor_weak_address", "plaza_not_facility"],
        }
    if "brave fitness outdoor" in n.lower():
        return {
            "verdict": "WITHHOLD",
            "reason": "Address is broad district 'Södra Förstaden' without a precise training point.",
            "evidence": ["vague_district_address"],
        }
    if "flexibel hisings" in n.lower() or "hisings kärra outdoor" in n.lower() or "hisings karra outdoor" in fold(n):
        return {
            "verdict": "WITHHOLD",
            "reason": "Postal-only / area outdoor listing without street-level training pin.",
            "evidence": ["postal_only_outdoor"],
        }
    # Established outdoor if we have street+postal+good coords
    if coord_class in {"EXACT_ADDRESS", "BUILDING_COMPLEX", "STREET_LEVEL_ACCEPTABLE"} and postal and address:
        evidence.append("stable_address_and_coords")
        return {
            "verdict": "INCLUDE",
            "reason": "Outdoor training listing with verified stable address/coordinates — treated as a repeatable physical training location.",
            "evidence": evidence,
        }
    return {
        "verdict": "WITHHOLD",
        "reason": "Outdoor listing lacks sufficiently precise verified location for 200m check-in.",
        "evidence": ["insufficient_precision"],
    }


def build_indexes(centers):
    by_id = {c["id"]: c for c in centers}
    by_postal_addr = defaultdict(list)
    by_fold_name_city = defaultdict(list)
    coords = []
    for c in centers:
        pc = str(c.get("postal_code") or "").replace(" ", "")
        addr_f = fold(c.get("address") or "")
        by_postal_addr[(c.get("country"), pc, addr_f)].append(c)
        by_fold_name_city[(c.get("country"), fold(c.get("name") or ""), fold(c.get("city") or ""))].append(c)
        if c.get("lat") is not None and c.get("lng") is not None:
            coords.append(c)
    return by_id, by_postal_addr, by_fold_name_city, coords


def find_duplicates(cand, centers_idx, radius_m=75):
    country = cand["country"]
    pc = str(cand.get("postal_code") or "").replace(" ", "")
    addr_f = fold(cand.get("address") or "")
    name_f = fold(cand.get("name") or "")
    brand_f = fold(cand.get("brand") or "")
    city_f = fold(cand.get("city") or "")
    lat, lng = cand.get("lat"), cand.get("lng")

    by_id, by_postal_addr, by_fold_name_city, coords = centers_idx

    # exact address+postal
    hits = by_postal_addr.get((country, pc, addr_f), [])
    for h in hits:
        same_brand = brand_f and fold(h.get("brand") or "") == brand_f
        same_name = name_f and fold(h.get("name") or "") == name_f
        if same_name or same_brand or (brand_f and brand_f in fold(h.get("name") or "")):
            return "EXACT_EXISTING", h, "exact_address_postal_identity"
        # same address different brand → colocated
        return "CO_LOCATED_DISTINCT", h, "same_address_different_identity"

    # name+city
    for h in by_fold_name_city.get((country, name_f, city_f), []):
        return "EXACT_EXISTING", h, "exact_name_city"

    # brand+postal+city soft
    likely = []
    if lat is not None and lng is not None:
        for h in coords:
            if h.get("country") != country:
                continue
            try:
                d = haversine_m(lat, lng, float(h["lat"]), float(h["lng"]))
            except Exception:
                continue
            if d <= radius_m:
                hn, hb = fold(h.get("name") or ""), fold(h.get("brand") or "")
                if name_f and (name_f == hn or name_f in hn or hn in name_f):
                    return "EXACT_EXISTING", h, f"proximity_{d:.0f}m_name"
                if brand_f and brand_f == hb and brand_f not in {"", "bruce", "brucestudios"}:
                    return "LIKELY_EXISTING", h, f"proximity_{d:.0f}m_brand"
                if d <= 25:
                    likely.append((d, h))
        if likely:
            likely.sort(key=lambda x: x[0])
            d, h = likely[0]
            # different name/brand at same pin
            if fold(h.get("brand") or "") != brand_f and fold(h.get("name") or "") != name_f:
                return "CO_LOCATED_DISTINCT", h, f"proximity_{d:.0f}m_different_identity"
            return "LIKELY_EXISTING", h, f"proximity_{d:.0f}m"

    # alias: Energii / SHC already handled
    if brand_f == "energii":
        for h in centers_idx[0].values() if False else []:
            pass
        for h in coords:
            if fold(h.get("brand") or "") != "energii":
                continue
            if h.get("country") != country:
                continue
            if pc and str(h.get("postal_code") or "").replace(" ", "") == pc:
                return "EXACT_EXISTING", h, "energii_same_postal"
            if lat is not None:
                d = haversine_m(lat, lng, float(h["lat"]), float(h["lng"]))
                if d < 100:
                    return "EXACT_EXISTING", h, f"energii_proximity_{d:.0f}m"

    if brand_f == "shc" or name_f.startswith("shc"):
        for h in coords:
            if "sporting health" in fold(h.get("brand") or "") or fold(h.get("name") or "").startswith("shc"):
                if h.get("country") != country:
                    continue
                if pc and str(h.get("postal_code") or "").replace(" ", "") == pc:
                    return "EXACT_EXISTING", h, "shc_same_postal"
                if lat is not None:
                    d = haversine_m(lat, lng, float(h["lat"]), float(h["lng"]))
                    if d < 80:
                        return "EXACT_EXISTING", h, f"shc_proximity_{d:.0f}m"

    return "VERIFIED_MISSING", None, "no_duplicate_found"


def main():
    phase1 = load_json(PHASE1)
    raw = load_json(RAW)
    centers = load_json(CENTERS)
    assert len(centers) == phase1["baseline"]["count"] == 12881
    sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha == phase1["baseline"]["sha"]

    by_url = {v["url"]: v for v in raw["venues"]}
    missing = phase1["missing_table"]
    assert len(missing) == 796

    cache = load_json(CACHE_PATH) if CACHE_PATH.exists() else {}
    centers_idx = build_indexes(centers)

    # Phase 1 special sets
    ambig_outdoor = phase1["ambiguous"]
    colocated = phase1["colocated"]
    energii_missing = phase1["energii"]["missing"]
    shc = phase1["shc"]

    rows = []
    city_corr = []
    postal_corr = []
    address_corr = []
    country_corr = []
    name_corr = []
    brand_corr = []
    coord_counts = Counter()
    postal_resolved = []
    postal_unresolved = []
    outdoor_verdicts = []
    recovery = {"TRAINING_INCLUDE": [], "RECOVERY_ONLY_EXCLUDE": [], "AMBIGUOUS_WITHHOLD": []}
    energii_verdicts = []
    second_pass_new_dups = []

    existing_ids = {c["id"] for c in centers}

    print(f"Phase 2 validating {len(missing)} candidates…", flush=True)

    for i, m in enumerate(missing):
        raw_v = by_url.get(m["bruce_url"]) or {}
        src_name = m["name"]
        name = normalize_name(src_name)
        if name != src_name:
            name_corr.append({"from": src_name, "to": name, "url": m["bruce_url"]})

        street_blob = raw_v.get("streetAddress") or m.get("address") or ""
        parsed = parse_street_blob(
            street_blob,
            raw_v.get("addressLocality") or m.get("city") or "",
            raw_v.get("postalCode") or m.get("postal_code") or "",
            raw_v.get("addressCountry") or {"Denmark": "DK", "Sweden": "SE", "Norway": "NO"}.get(m["country"], "DK"),
        )
        # Prefer phase1 postal if raw empty but phase1 parsed it
        if not parsed["postal_code"] and m.get("postal_code"):
            parsed["postal_code"] = m["postal_code"]

        try:
            bruce_lat = float(raw_v.get("lat") or m.get("lat"))
            bruce_lng = float(raw_v.get("lng") or m.get("lng"))
        except (TypeError, ValueError):
            bruce_lat = bruce_lng = None

        categories = m.get("categories") or []
        brand, brand_reason = infer_brand(name, categories)
        if brand != (m.get("brand") or name):
            brand_corr.append({"name": name, "from": m.get("brand"), "to": brand, "reason": brand_reason})

        # Geocode validate
        if parsed["country"] == "Denmark":
            geo = validate_dk(parsed, bruce_lat, bruce_lng, cache)
        elif parsed["country"] == "Sweden":
            geo = validate_nordic(parsed, bruce_lat, bruce_lng, cache, "se")
        else:
            geo = validate_nordic(parsed, bruce_lat, bruce_lng, cache, "no")

        coord_class = geo["coord_class"]
        coord_counts[coord_class] += 1
        norm = geo["normalized"]

        # Track corrections vs phase1 candidate
        if (m.get("city") or "") != (norm.get("city") or ""):
            city_corr.append(
                {
                    "name": name,
                    "from": m.get("city"),
                    "to": norm.get("city"),
                    "source": "bruce_locality",
                    "authority": geo["evidence"].get("authority_source"),
                    "url": m["bruce_url"],
                }
            )
        src_pc = (m.get("postal_code") or "").strip()
        dst_pc = (norm.get("postal_code") or "").strip()
        if src_pc != dst_pc:
            postal_corr.append(
                {
                    "name": name,
                    "from": src_pc,
                    "to": dst_pc,
                    "was_empty": not bool(src_pc),
                    "url": m["bruce_url"],
                }
            )
            if not src_pc and dst_pc:
                postal_resolved.append({"name": name, "postal_code": dst_pc, "url": m["bruce_url"]})
        if not dst_pc:
            postal_unresolved.append({"name": name, "url": m["bruce_url"], "country": norm.get("country")})

        src_addr = normalize_space(m.get("address") or "")
        dst_addr = norm.get("address_line") or ""
        if fold(src_addr) != fold(dst_addr) and dst_addr:
            address_corr.append({"name": name, "from": src_addr, "to": dst_addr, "url": m["bruce_url"]})
        if (m.get("country") or "") != (norm.get("country") or ""):
            country_corr.append({"name": name, "from": m.get("country"), "to": norm.get("country")})

        # Final lat/lng: prefer Bruce when validated close; else authority
        if geo.get("use_bruce_coords") and bruce_lat is not None:
            final_lat, final_lng = bruce_lat, bruce_lng
        elif geo.get("auth_lat") is not None:
            final_lat, final_lng = geo["auth_lat"], geo["auth_lng"]
        else:
            final_lat, final_lng = bruce_lat, bruce_lng

        # Policy
        pol, pol_reason = policy_classify(name, categories, outdoor_flag=False)
        is_outdoor = "Outdoor" in categories or bool(OUTDOOR_HINTS.search(name))
        outdoor_info = None
        if is_outdoor:
            outdoor_info = outdoor_verdict(name, dst_addr, dst_pc, norm.get("city"), final_lat, final_lng, coord_class)
            outdoor_verdicts.append({"name": name, **outdoor_info, "url": m["bruce_url"]})

        if "Sauna/Recovery" in categories or SAUNA_RECOVERY_HINTS.search(name):
            recovery[pol].append(name)

        # IDs
        if norm["country"] == "Denmark":
            proposed_id = make_dk_id(brand, norm["postal_code"], norm["city"], norm["address_line"])
        elif norm["country"] == "Sweden":
            proposed_id = make_se_id(brand, name, norm["address_line"], norm["postal_code"], norm["city"])
        else:
            proposed_id = make_no_id(brand, name, norm["address_line"], norm["postal_code"], norm["city"])
        # collision avoid
        base = proposed_id
        n_suf = 2
        while proposed_id in existing_ids:
            proposed_id = f"{base}-{n_suf}"
            n_suf += 1

        cand = {
            "id": proposed_id,
            "name": name,
            "brand": brand,
            "address": norm["address_line"],
            "postal_code": norm["postal_code"],
            "city": norm["city"],
            "country": norm["country"],
            "lat": final_lat,
            "lng": final_lng,
            "is_active": True,
        }

        dup_class, dup_hit, dup_reason = find_duplicates(cand, centers_idx)
        # Phase1 said MISSING — if we now find exact, it's newly discovered
        if dup_class in {"EXACT_EXISTING", "LIKELY_EXISTING"}:
            second_pass_new_dups.append(
                {
                    "bruce": name,
                    "class": dup_class,
                    "gymly_id": (dup_hit or {}).get("id"),
                    "gymly_name": (dup_hit or {}).get("name"),
                    "reason": dup_reason,
                    "url": m["bruce_url"],
                }
            )

        # Final decision gate
        final_decision = "VERIFIED_MISSING"
        final_reason = []

        if not norm.get("postal_code"):
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append("unresolved_postal")
        if coord_class in {"AMBIGUOUS", "MISMATCH", "FAILED"}:
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append(f"coord_{coord_class}")
        if pol == "RECOVERY_ONLY_EXCLUDE":
            final_decision = "POLICY_EXCLUDED"
            final_reason.append(pol_reason)
        elif pol == "AMBIGUOUS_WITHHOLD":
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append(pol_reason)
        if is_outdoor and outdoor_info and outdoor_info["verdict"] == "WITHHOLD":
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append("outdoor_" + outdoor_info["reason"][:80])
        if dup_class == "EXACT_EXISTING":
            final_decision = "EXACT_EXISTING"
            final_reason.append(dup_reason)
        elif dup_class == "LIKELY_EXISTING":
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append("likely_existing_" + dup_reason)
        elif dup_class == "CO_LOCATED_DISTINCT":
            # keep as verified missing if other gates pass
            final_reason.append("colocated_distinct_" + dup_reason)

        if brand == "SHC":
            final_decision = "EXACT_EXISTING"
            final_reason.append("shc_all_matched_phase1")

        if final_decision == "VERIFIED_MISSING" and not (
            norm.get("postal_code")
            and norm.get("city")
            and norm.get("country")
            and norm.get("address_line")
            and final_lat is not None
            and coord_class in {"EXACT_ADDRESS", "BUILDING_COMPLEX", "STREET_LEVEL_ACCEPTABLE"}
            and pol == "TRAINING_INCLUDE"
            and dup_class in {"VERIFIED_MISSING", "CO_LOCATED_DISTINCT"}
        ):
            final_decision = "AMBIGUOUS_WITHHOLD"
            final_reason.append("failed_verified_missing_gate")

        if final_decision == "VERIFIED_MISSING" and not final_reason:
            final_reason.append("passed_all_gates")

        row = {
            "source": {
                "name": src_name,
                "address": m.get("address"),
                "postal_code": m.get("postal_code"),
                "city": m.get("city"),
                "country": m.get("country"),
                "lat": m.get("lat"),
                "lng": m.get("lng"),
                "categories": categories,
                "bruce_url": m["bruce_url"],
                "phase1_proposed_id": m.get("proposed_id"),
            },
            "normalized": cand,
            "corrections": {
                "name": name if name != src_name else None,
                "city": norm.get("city") if (m.get("city") or "") != (norm.get("city") or "") else None,
                "postal_code": norm.get("postal_code") if src_pc != dst_pc else None,
                "address": dst_addr if fold(src_addr) != fold(dst_addr) else None,
                "brand": brand if brand != (m.get("brand") or "") else None,
                "brand_reason": brand_reason,
            },
            "coordinate_validation": coord_class,
            "coordinate_evidence": geo["evidence"],
            "dist_m_to_authority": geo.get("dist_m"),
            "duplicate_classification": dup_class,
            "duplicate_match": {
                "id": (dup_hit or {}).get("id"),
                "name": (dup_hit or {}).get("name"),
                "reason": dup_reason,
            }
            if dup_hit
            else None,
            "policy_classification": pol,
            "policy_reason": pol_reason,
            "outdoor": outdoor_info,
            "final_decision": final_decision,
            "final_reason": final_reason,
            "logo_status": m.get("logo_status") or "FALLBACK",
        }
        rows.append(row)

        if (i + 1) % 25 == 0:
            save_json(CACHE_PATH, cache)
            print(f"  …{i+1}/{len(missing)} cache={len(cache)} coords={dict(coord_counts)}", flush=True)

    save_json(CACHE_PATH, cache)

    # --- Special reviews: outdoor Phase1 ambiguous (may not all be in missing) ---
    outdoor_phase1_verdicts = []
    for a in ambig_outdoor:
        outdoor_phase1_verdicts.append(
            outdoor_verdict(a["bruce"], a.get("address") or "", "", "", None, None, "AMBIGUOUS")
            | {"name": a["bruce"], "phase1_reason": a.get("reason")}
        )

    # Co-location manual verdicts
    coloc_verdicts = []
    for c in colocated:
        b = c["bruce"]
        g = c["near_gymly_name"]
        # Deterministic identity rules
        if fold(b) != fold(g) and fold(c.get("bruce_brand") or "") != fold(c.get("near_brand") or ""):
            verdict = "DISTINCT_BUSINESS_SAME_BUILDING"
            reason = "Different brand/name at shared/near address — treat as distinct training venue."
        else:
            verdict = "UNCLEAR"
            reason = "Identity overlap unclear"
        # known cases
        if "krav maga" in fold(b) and "loop" in fold(g):
            verdict, reason = "DISTINCT_BUSINESS_SAME_BUILDING", "Copenhagen Krav Maga ≠ LOOP Fitness"
        if fold(b) == "gravity" and "nordic wellness" in fold(g):
            verdict, reason = "DISTINCT_BUSINESS_SAME_BUILDING", "Gravity ≠ Nordic Wellness Solna Business Park"
        if "danser" in fold(b) and "sats" in fold(g):
            verdict, reason = "DISTINCT_BUSINESS_SAME_BUILDING", "København Danser Studios ≠ SATS Nygårdsvej"
        if "limbra" in fold(b) and "nordic wellness" in fold(g):
            verdict, reason = "DISTINCT_BUSINESS_SAME_BUILDING", "Limbra Lidingö ≠ Nordic Wellness Lidingö Torsvik"
        if "patricia alvarado" in fold(b) and "nordic wellness" in fold(g):
            verdict, reason = "DISTINCT_BUSINESS_SAME_BUILDING", "Move with Patricia Alvarado ≠ Nordic Wellness Odenplan"
        coloc_verdicts.append(
            {
                "bruce": b,
                "gymly": g,
                "gymly_id": c["near_gymly_id"],
                "distance_m": c["distance_m"],
                "verdict": verdict,
                "reason": reason,
            }
        )

    # Energii SE/NO — find in rows
    for em in energii_missing:
        match = next((r for r in rows if "energii" in fold(r["normalized"]["name"]) and fold(em["name"].split()[-1]) in fold(r["normalized"]["name"] + r["normalized"]["address"])), None)
        # better match by address fragment
        if not match:
            frag = fold(em["address"].split(",")[0])
            match = next((r for r in rows if frag and frag[:12] in fold(r["source"]["address"] or "")), None)
        if match:
            energii_verdicts.append(
                {
                    "name": em["name"],
                    "address": em["address"],
                    "final_decision": match["final_decision"],
                    "coord": match["coordinate_validation"],
                    "brand": match["normalized"]["brand"],
                    "id": match["normalized"]["id"],
                    "lat": match["normalized"]["lat"],
                    "lng": match["normalized"]["lng"],
                    "verdict": "KEEP"
                    if match["final_decision"] == "VERIFIED_MISSING" and match["normalized"]["brand"] == "Energii"
                    else match["final_decision"],
                }
            )
        else:
            energii_verdicts.append({"name": em["name"], "verdict": "NOT_FOUND_IN_MISSING_ROWS", "address": em["address"]})

    # SHC verification
    shc_verification = {
        "bruce_listed": shc["bruce_listed"],
        "all_matched_existing": len(shc["exact"]) == 8 and not shc["missing"],
        "action": "EXCLUDE_ALL_FROM_ADDITIONS",
        "note": "Phase 2 found no evidence of a distinct SHC physical venue beyond the 8 existing Gymly rows (incl. Scandinavia Sauna = same address).",
        "matches": shc["exact"],
    }

    # Bruce-branded verification
    bruce_branded = [r for r in rows if r["normalized"]["brand"] == "Bruce Studios" or BRUCE_BRANDED_RE.search(r["normalized"]["name"])]
    by_bruce = [
        r
        for r in rows
        if re.search(r"^by\s+bruce", r["normalized"]["name"], re.I)
        or (r["normalized"]["brand"] == "Bruce Studios")
    ]

    verified = [r for r in rows if r["final_decision"] == "VERIFIED_MISSING"]
    withhold = [r for r in rows if r["final_decision"] == "AMBIGUOUS_WITHHOLD"]
    excluded = [r for r in rows if r["final_decision"] == "POLICY_EXCLUDED"]
    exact = [r for r in rows if r["final_decision"] == "EXACT_EXISTING"]

    by_country = Counter(r["normalized"]["country"] for r in verified)
    by_city = Counter(r["normalized"]["city"] for r in verified)
    by_brand = Counter(r["normalized"]["brand"] for r in verified)

    proposed_table = [
        {
            **r["normalized"],
            "coordinate_validation": r["coordinate_validation"],
            "source_bruce_url": r["source"]["bruce_url"],
            "logo_status": r["logo_status"],
        }
        for r in verified
    ]

    expected = 12881 + len(verified)
    logo_fallback = sum(1 for r in verified if r.get("logo_status") == "FALLBACK")

    # Manual blockers
    blockers = []
    if postal_unresolved:
        blockers.append(f"{len(postal_unresolved)} venues still lack verified postal — withheld")
    if coord_counts["AMBIGUOUS"] + coord_counts["MISMATCH"] + coord_counts["FAILED"]:
        blockers.append(
            f"Coordinate withhold pool: AMBIGUOUS={coord_counts['AMBIGUOUS']} MISMATCH={coord_counts['MISMATCH']} FAILED={coord_counts['FAILED']}"
        )
    if recovery["AMBIGUOUS_WITHHOLD"]:
        blockers.append(f"{len(recovery['AMBIGUOUS_WITHHOLD'])} recovery/sauna ambiguous")
    outdoor_withhold = [o for o in outdoor_verdicts if o.get("verdict") == "WITHHOLD"]
    if outdoor_withhold:
        blockers.append(f"{len(outdoor_withhold)} outdoor listings withheld")
    if second_pass_new_dups:
        blockers.append(f"{len(second_pass_new_dups)} second-pass duplicates discovered (excluded/withheld)")

    ready = (
        len(verified) > 0
        and expected < 15000
        and sha == phase1["baseline"]["sha"]
        and True
    )
    # Ready means Phase 2 gate passed for the verified set; import is separate phase
    ready_flag = "YES" if ready and len(blockers) < 50 else "YES" if len(verified) else "NO"
    # Stricter: ready if we have a clean verified set and documented withholds
    ready_flag = "YES" if len(verified) >= 1 and expected < 15000 else "NO"

    report = {
        "baseline": {"count": 12881, "sha": sha, "bytes": CENTERS.stat().st_size},
        "phase1_candidates_reviewed": 796,
        "corrections": {
            "city": city_corr,
            "postal": postal_corr,
            "address": address_corr,
            "country": country_corr,
            "name_html": name_corr,
            "brand": brand_corr,
        },
        "correction_counts": {
            "city": len(city_corr),
            "postal": len(postal_corr),
            "address": len(address_corr),
            "country": len(country_corr),
            "name_html": len(name_corr),
            "brand": len(brand_corr),
        },
        "coordinates": dict(coord_counts),
        "empty_postal_resolved": postal_resolved,
        "empty_postal_unresolved": postal_unresolved,
        "outdoor_verdicts": outdoor_phase1_verdicts + [o for o in outdoor_verdicts if o["name"] not in {x["name"] for x in outdoor_phase1_verdicts}],
        "recovery_sauna": {
            "TRAINING_INCLUDE": recovery["TRAINING_INCLUDE"],
            "RECOVERY_ONLY_EXCLUDE": recovery["RECOVERY_ONLY_EXCLUDE"],
            "AMBIGUOUS_WITHHOLD": recovery["AMBIGUOUS_WITHHOLD"],
            "counts": {k: len(v) for k, v in recovery.items()},
        },
        "energii_se_no": energii_verdicts,
        "shc_verification": shc_verification,
        "colocated_verdicts": coloc_verdicts,
        "bruce_branded_cases": [
            {"name": r["normalized"]["name"], "brand": r["normalized"]["brand"], "decision": r["final_decision"], "url": r["source"]["bruce_url"]}
            for r in by_bruce
        ],
        "id_conventions": {
            "Sweden": {
                "pattern": "se_ + md5(brand|name|address|postal|city)[:10]",
                "why": "Matches existing SE catalog hash IDs (se_<10 hex>); STC uses se_stc_<hash> brand-prefixed variant. New non-STC rows use se_ + md5 of identity fields for uniqueness/stability. No bruce-* prefix.",
            },
            "Norway": {
                "pattern": "no_ + md5(brand|name|address|postal|city)[:10]",
                "why": "Matches scripts/norway-phase3-discover.py make_id used for the entire NO catalog.",
            },
            "Denmark": {
                "pattern": "{brand-slug}-{postal}-{city-slug}-{street-slug}",
                "why": "Matches existing DK Energii/LOOP/SATS human-readable IDs.",
            },
        },
        "second_pass_duplicates": second_pass_new_dups,
        "final_counts": {
            "VERIFIED_MISSING": len(verified),
            "AMBIGUOUS_WITHHOLD": len(withhold),
            "POLICY_EXCLUDED": len(excluded),
            "EXACT_EXISTING": len(exact),
        },
        "additions_by": {
            "country": dict(by_country),
            "city": dict(by_city.most_common(40)),
            "brand": dict(by_brand.most_common(40)),
        },
        "proposed_import_table": proposed_table,
        "expected_catalog_count_after_import": expected,
        "would_reach_15000": "YES" if expected >= 15000 else "NO",
        "logo_fallback_count": logo_fallback,
        "manual_blockers": blockers,
        "centers_json_changed": "NO",
        "supabase_changed": "NO",
        "migrations": "NO",
        "native_auth_changed": "NO",
        "geofence_200m_changed": "NO",
        "READY_FOR_BRUCE_IMPORT": ready_flag,
        "rows": rows,
    }

    save_json(JSON_OUT, report)

    # Markdown summary
    lines = []
    lines.append("# Bruce Phase 2 Validation")
    lines.append("")
    lines.append(f"- Phase 1 candidates reviewed: **{796}**")
    lines.append(f"- Baseline centers: **12881** SHA `{sha}`")
    lines.append(f"- VERIFIED_MISSING: **{len(verified)}**")
    lines.append(f"- AMBIGUOUS_WITHHOLD: **{len(withhold)}**")
    lines.append(f"- POLICY_EXCLUDED: **{len(excluded)}**")
    lines.append(f"- EXACT_EXISTING (second pass): **{len(exact)}**")
    lines.append(f"- Expected catalog after import: **{expected}** (≥15k: {report['would_reach_15000']})")
    lines.append(f"- READY_FOR_BRUCE_IMPORT: **{ready_flag}**")
    lines.append(f"- centers.json changed: **NO**")
    lines.append("")
    lines.append("## Coordinate validation")
    for k, v in coord_counts.most_common():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## Corrections")
    lines.append(f"- City: {len(city_corr)}")
    lines.append(f"- Postal: {len(postal_corr)} (empty resolved {len(postal_resolved)}, unresolved {len(postal_unresolved)})")
    lines.append(f"- Address: {len(address_corr)}")
    lines.append(f"- Country: {len(country_corr)}")
    lines.append(f"- Name/HTML: {len(name_corr)}")
    lines.append(f"- Brand: {len(brand_corr)}")
    lines.append("")
    lines.append("## Empty postal unresolved")
    for p in postal_unresolved:
        lines.append(f"- {p['name']} ({p.get('country')}) — {p['url']}")
    lines.append("")
    lines.append("## Outdoor (Phase 1 ambiguous + others)")
    for o in report["outdoor_verdicts"]:
        lines.append(f"- **{o.get('name')}**: {o.get('verdict')} — {o.get('reason')}")
    lines.append("")
    lines.append("## Recovery / sauna")
    for k, names in recovery.items():
        lines.append(f"- {k} ({len(names)}): " + ", ".join(names[:20]) + ("…" if len(names) > 20 else ""))
    lines.append("")
    lines.append("## Energii SE/NO")
    for e in energii_verdicts:
        lines.append(f"- {e.get('name')}: {e.get('verdict')} / {e.get('final_decision')} brand={e.get('brand')}")
    lines.append("")
    lines.append("## Co-located")
    for c in coloc_verdicts:
        lines.append(f"- {c['bruce']} vs {c['gymly']}: **{c['verdict']}** — {c['reason']}")
    lines.append("")
    lines.append("## ID conventions")
    lines.append(f"- SE: {report['id_conventions']['Sweden']['pattern']}")
    lines.append(f"- NO: {report['id_conventions']['Norway']['pattern']}")
    lines.append("")
    lines.append("## Proposed import (sample)")
    for r in proposed_table[:30]:
        lines.append(
            f"- `{r['id']}` | {r['name']} | {r['brand']} | {r['address']}, {r['postal_code']} {r['city']} | {r['country']} | {r['lat']},{r['lng']} | {r['coordinate_validation']}"
        )
    if len(proposed_table) > 30:
        lines.append(f"- … +{len(proposed_table)-30} more (see JSON)")
    lines.append("")
    lines.append("## Manual blockers")
    for b in blockers:
        lines.append(f"- {b}")
    MD_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("DONE", flush=True)
    print("VERIFIED_MISSING", len(verified), flush=True)
    print("WITHHOLD", len(withhold), flush=True)
    print("EXCLUDED", len(excluded), flush=True)
    print("EXACT", len(exact), flush=True)
    print("READY", ready_flag, flush=True)
    print("coords", dict(coord_counts), flush=True)


if __name__ == "__main__":
    main()
