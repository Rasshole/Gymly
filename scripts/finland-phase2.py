#!/usr/bin/env python3
"""
Finland Phase 2: coverage-gap audit + targeted recovery.

Uses the FINAL Phase 1 staging as source of truth.
Does NOT restart Phase 1, does NOT modify src/data/centers.json,
does NOT promote Fressi COMING_SOON without current official open evidence,
does NOT overwrite Phase 1 official-page repairs with earlier scrapes.
"""
from __future__ import annotations

import importlib.util
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/finland"
STAGING = OUT / "finland_centers_staging.json"
CACHE = OUT / "finland_geocode_cache.json"
PHASE2 = OUT / "phase2"
RAW = PHASE2 / "pages"
NOTES = PHASE2 / "discovery_notes.json"
CENTERS = ROOT / "src/data/centers.json"

for p in (PHASE2, RAW):
    p.mkdir(parents=True, exist_ok=True)

spec = importlib.util.spec_from_file_location("fi1", ROOT / "scripts/finland-phase1-consolidate.py")
fi1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fi1)

make_id = fi1.make_id
norm = fi1.norm
haversine = fi1.haversine
fi_postal = fi1.fi_postal
in_fi_bbox = fi1.in_fi_bbox
score_candidate = fi1.score_candidate
vs_live = fi1.vs_live
staging_dupes = fi1.staging_dupes
write_excel = fi1.write_excel
write_geocode_review = fi1.write_geocode_review
city_ready = fi1.city_ready
CACHE_UA = fi1.UA
ctx = ssl.create_default_context()
PAGE_UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyFinlandResearch/2.0; catalog research; accuracy over coverage)",
    "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
}

MAJOR_CITIES = [
    "Helsinki",
    "Espoo",
    "Vantaa",
    "Tampere",
    "Turku",
    "Oulu",
    "Jyväskylä",
    "Kuopio",
    "Lahti",
    "Pori",
    "Vaasa",
    "Joensuu",
]

OLEFIT2_URLS = [
    "https://www.ole.fit/kuntokeskukset2/hyvinkaa/hyvinkaa",
    "https://www.ole.fit/kuntokeskukset2/hyvinkaa/veturi",
    "https://www.ole.fit/kuntokeskukset2/kerava/kerava",
    "https://www.ole.fit/kuntokeskukset2/kerava/savio",
    "https://www.ole.fit/kuntokeskukset2/kokkola/kokkola",
    "https://www.ole.fit/kuntokeskukset2/kokkola/kokkola-mini",
    "https://www.ole.fit/kuntokeskukset2/turku/kupittaa",
    "https://www.ole.fit/kuntokeskukset2/turku/manhattan",
    "https://www.ole.fit/kuntokeskukset2/turku/saippua-center",
    "https://www.ole.fit/kuntokeskukset2/tuusula/hyryla",
    "https://www.ole.fit/kuntokeskukset2/tuusula/jokela",
    "https://www.ole.fit/kuntokeskukset2/tuusula/urkka",
    "https://www.ole.fit/kuntokeskukset2/vantaa/martinlaakso",
    "https://www.ole.fit/kuntokeskukset2/vantaa/porttipuisto",
]

FRESSI_CS_URLS = [
    "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/paloheina/",
    "https://www.fressi.fi/toimipisteet/fressi-kuntosali-elmo-vantaa/",
    "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/tuomarila/",
    "https://www.fressi.fi/toimipisteet/fressi-kuntosali-kokkola/",
    "https://www.fressi.fi/toimipisteet/fressi-kuntosali-martinlaakso-vantaa/",
    "https://www.fressi.fi/toimipisteet/fressi-kuntosali-hakametsa-tampere/",
    "https://www.fressi.fi/toimipisteet/jyvaskyla-keskusta/",
    "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/itakeskus/",
    "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/kontula/",
    "https://www.fressi.fi/toimipisteet/tammisto-tammiston-kauppatie-10/",
    "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/vartiokyla/",
    "https://www.fressi.fi/toimipisteet/fressi-kuntosali-makelininkatu-oulu/",
]


def fetch(url: str, dest: Path | None = None) -> str:
    if dest and dest.exists() and dest.stat().st_size > 400:
        return dest.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers=PAGE_UA)
    with urllib.request.urlopen(req, context=ctx, timeout=45) as r:
        raw = r.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
    time.sleep(0.35)
    return text


def slugify(url: str) -> str:
    path = urllib.parse.urlparse(url).path.strip("/").replace("/", "__")
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", path) or "index"


def extract_official_coords(html: str):
    """Building-level coords from official club HTML only. No query-string place-name embeds."""
    hits = []
    for lat, lng in re.findall(r"L\.marker\(\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]", html):
        hits.append((float(lat), float(lng), "official_leaflet"))
    for lng, lat in re.findall(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", html):
        hits.append((float(lat), float(lng), "official_google_embed"))
    for lat, lng in re.findall(r"!3d(-?\d+\.\d+)!2d(-?\d+\.\d+)", html):
        hits.append((float(lat), float(lng), "official_google_embed"))
    for lat, lng in re.findall(
        r'"latitude"\s*:\s*"?(-?\d+\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+\.\d+)"?',
        html,
        re.I,
    ):
        hits.append((float(lat), float(lng), "official_json_ld"))
    for m in re.finditer(r'data-coords="\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*"', html):
        hits.append((float(m.group(1)), float(m.group(2)), "official_locator"))
    out = []
    seen = set()
    for lat, lng, src in hits:
        if not in_fi_bbox(lat, lng):
            continue
        key = (round(lat, 6), round(lng, 6), src)
        if key in seen:
            continue
        seen.add(key)
        out.append((lat, lng, src))
    return out


def parse_olefit_details(html: str):
    html = unescape(html)
    m = re.search(r'class="business-details">(.*?)</div>', html, re.S)
    street = postal = city = ""
    if m:
        t = re.sub(r"<br\s*/?>", "\n", m.group(1), flags=re.I)
        t = re.sub(r"<[^>]+>", " ", t)
        lines = [re.sub(r"\s+", " ", x).strip() for x in t.split("\n")]
        lines = [x for x in lines if x and x.lower() not in {"ole.fit", "fit"}]
        for line in lines:
            pc = re.search(r"\b(\d{5})\b", line)
            if pc and not postal:
                postal = pc.group(1)
                city = re.sub(r".*\d{5}\s*", "", line).strip(" /")
                city = city.split("/")[0].strip()
                continue
            if re.search(r"\d", line) and not street and "palvelu" not in line.lower() and "@" not in line:
                street = re.sub(r"^Käyntiosoite:\s*", "", line, flags=re.I)
                street = street.split(",")[0].strip()
                street = re.sub(r"\s*\(.*$", "", street).strip()
                street = re.sub(r"^Vanha Kutomo,\s*", "", street)
    coming = bool(
        re.search(
            r"avataan|avajaiset|coming soon|aukeaa\s+\d",
            html,
            re.I,
        )
    ) and not re.search(r"nyt avoinna|avoinna 24", html, re.I)
    return street, postal, city, coming


def parse_olefit_homepage_cards(html: str):
    cards = []
    seen = set()
    for m in re.finditer(r'<span class="mapdata etaisyys"(.*?)</span>', html, re.S):
        block = m.group(1)

        def attr(k):
            mm = re.search(rf'data-{k}="([^"]*)"', block)
            return (mm.group(1).strip() if mm else "")

        name = attr("nimi")
        street = re.sub(r"\s+", " ", attr("katuosoite")).strip(" ,")
        street = re.sub(r",\s*3krs\.?", "", street, flags=re.I).strip()
        postal = fi_postal(attr("postinumero"))
        city = attr("paikkakunta")
        coords = attr("coords")
        key = (name, street, postal, city)
        if key in seen:
            continue
        seen.add(key)
        lat = lng = None
        if coords:
            parts = [p.strip() for p in coords.split(",")]
            if len(parts) == 2:
                try:
                    lat, lng = float(parts[0]), float(parts[1])
                except ValueError:
                    lat = lng = None
        cards.append(
            {
                "name": name,
                "address": street,
                "postal_code": postal,
                "city": city,
                "lat": lat,
                "lng": lng,
            }
        )
    return cards


def street_variants(street: str, city: str):
    s = (street or "").strip()
    out = [s]
    # apartment / unit suffixes
    out.append(re.sub(r"\s+[A-Za-z]$", "", s).strip())
    out.append(re.sub(r"\s+[A-Za-z]\b.*$", "", s).strip())
    m = re.match(r"^(.+?)\s+(\d+)([a-zA-Z])(\d+)\s*$", s)
    if m:
        out.append(f"{m.group(1)} {m.group(2)}{m.group(3)}")
        out.append(f"{m.group(1)} {m.group(2)}")
    m = re.match(r"^(.+?)\s+(\d+[a-zA-Z]?)\s*[A-Za-z]\s*$", s)
    if m:
        out.append(f"{m.group(1)} {m.group(2)}")
    # ranges
    m = re.match(r"^(.+?)\s+(\d+)\s*-\s*(\d+)$", s)
    if m:
        out.append(f"{m.group(1)} {m.group(2)}")
        out.append(f"{m.group(1)} {m.group(3)}")
    cities = [city]
    cl = (city or "").lower()
    if cl in {"mustasaari", "korsholm"}:
        cities.extend(["Mustasaari", "Korsholm", "Smedsby", "Sepänkylä"])
    if cl == "ylämylly":
        cities.extend(["Liperi", "Ylämylly"])
    if cl == "nummela":
        cities.extend(["Vihti", "Nummela"])
    if cl == "inkeroinen":
        cities.append("Kouvola")
    uniq = []
    for item in out:
        item = re.sub(r"\s+", " ", item).strip(" ,")
        if item and item not in uniq:
            uniq.append(item)
    city_uniq = []
    for c in cities:
        if c and c not in city_uniq:
            city_uniq.append(c)
    return uniq, city_uniq


def nominatim_get(url: str, cache: dict, key: str):
    if key in cache:
        return cache[key]
    req = urllib.request.Request(url, headers={"User-Agent": CACHE_UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[key] = data
    time.sleep(1.1)
    return data


def nominatim_structured(street: str, city: str, postal: str, cache: dict):
    key = f"struct|{street}|{city}|{postal}"
    params = {
        "street": street,
        "city": city,
        "postalcode": postal,
        "country": "Finland",
        "countrycodes": "fi",
        "format": "json",
        "addressdetails": "1",
        "limit": "5",
    }
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    return nominatim_get(url, cache, key)


def nominatim_reverse(lat: float, lng: float, cache: dict):
    key = f"rev|{round(lat,6)}|{round(lng,6)}"
    params = {
        "lat": f"{lat:.7f}",
        "lon": f"{lng:.7f}",
        "format": "json",
        "addressdetails": "1",
        "zoom": "18",
        "countrycodes": "fi",
    }
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(params)
    return nominatim_get(url, cache, key)


def reverse_consistent(lat, lng, street, postal, city, cache):
    try:
        data = nominatim_reverse(lat, lng, cache)
    except Exception as e:
        return False, f"reverse_error:{e}"
    if not isinstance(data, dict) or data.get("error"):
        return False, "reverse_empty"
    addr = data.get("address") or {}
    display = (data.get("display_name") or "").lower()
    if not in_fi_bbox(data.get("lat"), data.get("lon")):
        return False, "reverse_outside_fi"
    pc = fi_postal(addr.get("postcode"))
    postal_n = fi_postal(postal)
    city_n = norm(city)
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb", "city_district", "hamlet")
    )
    city_ok = bool(city_n and (city_n in city_fields or city_n in norm(display)))
    aliases = {
        "mustasaari": ["korsholm", "smedsby", "sepankyla"],
        "korsholm": ["mustasaari", "smedsby"],
        "ylamylly": ["liperi"],
        "nummela": ["vihti"],
        "kalasatama": ["helsinki"],
        "inkeroinen": ["kouvola"],
        "tervakoski": ["janakkala"],
        "turenki": ["janakkala"],
        "oitti": ["hausjarvi"],
        "noormarkku": ["pori"],
    }
    if not city_ok:
        for a in aliases.get(city_n, []):
            if a in city_fields or a in norm(display):
                city_ok = True
                break
    postal_ok = bool(postal_n and pc and (pc == postal_n or pc[:3] == postal_n[:3]))
    road = norm(addr.get("road") or "")
    street_n = norm(street)
    road_ok = bool(
        road
        and street_n
        and (
            road in street_n
            or any(tok and tok in road for tok in street_n.split() if len(tok) > 4)
        )
    )
    if postal_ok and (city_ok or road_ok):
        return True, "reverse_postal_city_or_road"
    if city_ok and road_ok:
        return True, "reverse_city_road"
    return False, f"reverse_mismatch:pc={pc}:city={city_fields[:80]}"


def accept_scored(scored, r):
    scored.sort(key=lambda x: -x[0])
    top = scored[0]
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
        d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
        if d > 150:
            r["import_category"] = "NEEDS_REVIEW"
            r["geocode_status"] = "ambiguous"
            r["geocode_reasons"] = [top[1], scored[1][1]]
            r["lat"] = r["lng"] = None
            return False
    soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
    if soft and "road_match" not in top[1]:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "soft_postal_rejected"
        r["lat"] = r["lng"] = None
        return False
    r["lat"] = round(top[2], 6)
    r["lng"] = round(top[3], 6)
    r["geocode_status"] = "suspicious" if soft else "ok"
    r["geocode_reasons"] = top[1]
    r["geocode_display"] = top[4]
    r["coord_source"] = "nominatim_structured"
    if r.get("import_category") not in {"COMING_SOON", "CLOSED"}:
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        r["is_active"] = True
    if soft:
        r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
    return True


def try_structured(r, cache):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    if not street or not postal:
        return False
    streets, cities = street_variants(street, city)
    all_scored = []
    for st in streets[:4]:
        for ci in cities[:3]:
            try:
                items = nominatim_structured(st, ci, postal, cache)
            except Exception:
                time.sleep(1.1)
                continue
            if not isinstance(items, list):
                continue
            for it in items:
                sc, reasons, lat, lng = score_candidate(it, st, postal, ci)
                if sc is None:
                    continue
                all_scored.append((sc, reasons, lat, lng, it.get("display_name")))
    if not all_scored:
        return False
    return accept_scored(all_scored, r)


def apply_official_coords(r, lat, lng, src, cache, coord_seen):
    if not in_fi_bbox(lat, lng):
        return False
    key = (round(lat, 5), round(lng, 5))
    owners = coord_seen.get(key) or []
    other = [n for n in owners if n != r.get("name")]
    # copied locator pin (Ole.Fit Oitti = Espoo) is not a real coordinate
    if other:
        r["notes"] = ((r.get("notes") or "") + "; rejected_shared_official_coord").strip("; ")
        return False
    ok, why = reverse_consistent(lat, lng, r.get("address"), r.get("postal_code"), r.get("city"), cache)
    if not ok:
        r["notes"] = ((r.get("notes") or "") + f"; official_coord_{why}").strip("; ")
        return False
    r["lat"] = round(lat, 6)
    r["lng"] = round(lng, 6)
    r["coord_source"] = src
    r["geocode_status"] = "ok"
    r["geocode_reasons"] = [why, "official_page_or_locator"]
    if r.get("import_category") not in {"COMING_SOON", "CLOSED"}:
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        r["is_active"] = True
    coord_seen.setdefault(key, []).append(r.get("name"))
    return True


def blank_row(brand, name, address, postal, city, source_url, website, notes="", status="VERIFIED_CURRENT", cat="NEEDS_COORDINATES"):
    postal = fi_postal(postal) or None
    r = {
        "id": make_id(brand, address or "", postal or "", city or "", source_url or ""),
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": (address or "").strip(" ,") or None,
        "postal_code": postal,
        "city": (city or "").strip() or None,
        "country": "Finland",
        "lat": None,
        "lng": None,
        "opening_hours": None,
        "website": website,
        "source_url": source_url,
        "verification_status": status,
        "legacy_brand": None,
        "notes": notes,
        "is_active": status != "CLOSED" and cat != "CLOSED",
        "import_category": cat,
        "phase": "finland_phase2",
        "coord_source": None,
        "format": None,
        "encoding_flag": False,
        "geocode_status": None,
        "geocode_rejected": [],
        "geocode_reasons": [],
    }
    if cat == "COMING_SOON":
        r["is_coming_soon"] = True
        r["is_active"] = False
    if cat == "CLOSED":
        r["is_active"] = False
    return r


def already_have(rows, brand, address, postal, city, url=""):
    b = norm(brand)
    a = norm(address)
    p = fi_postal(postal)
    c = norm(city)
    u = (url or "").rstrip("/").lower()
    for r in rows:
        ru = (r.get("source_url") or "").rstrip("/").lower()
        # Unique club page: same URL is the same gym. Shared yhteystiedot URLs are not.
        shared_contact = any(
            x in u
            for x in (
                "yhteystiedot",
                "/etusivu",
                "vocatum.fi/",
                "www.ole.fit/",
            )
        ) and "/kuntokeskukset" not in u and "/toimipisteet/" not in u and "/kuntosali/" not in u
        unique_page = bool(u) and not shared_contact and (
            "/kuntokeskukset" in u
            or "/toimipisteet/" in u
            or "/kuntosali/" in u
            or "/info/" not in u
        )
        if unique_page and ru == u:
            if a and norm(r.get("address")) and norm(r.get("address")) != a:
                continue
            return True
        if norm(r.get("brand")) == b and a and norm(r.get("address")) == a and fi_postal(r.get("postal_code")) == p:
            return True
        if norm(r.get("brand")) == b and a and norm(r.get("address")) == a and c and norm(r.get("city")) == c:
            return True
    return False


def coming_soon_language(html: str) -> bool:
    text = re.sub(r"<[^>]+>", " ", unescape(html))
    text = re.sub(r"\s+", " ", text)
    if re.search(r"suljettu toistaiseksi", text, re.I):
        return False
    return bool(
        re.search(
            r"avataan(?:\s+\w+){0,6}\s+20\d{2}|avajaiset\s+\w+\s+\d{1,2}\.\d|uusi upea .{0,80}avataan|avataan alkuvuodesta|avataan syksyllä|avataan\s+\d{1,2}\.\d",
            text,
            re.I,
        )
    )


def open_now_language(html: str) -> bool:
    text = re.sub(r"<[^>]+>", " ", unescape(html))
    if re.search(r"suljettu toistaiseksi", text, re.I):
        return False
    if coming_soon_language(html):
        return False
    return bool(re.search(r"avoinna 24|nyt avoinna|kuntosali avoinna", text, re.I))


def build_coord_seen(rows):
    seen = defaultdict(list)
    for r in rows:
        if r.get("lat") is None or r.get("lng") is None:
            continue
        try:
            key = (round(float(r["lat"]), 5), round(float(r["lng"]), 5))
        except (TypeError, ValueError):
            continue
        seen[key].append(r.get("name"))
    return seen


def recover_row(r, html, homepage_coords, cache, coord_seen):
    prev_cat = r.get("import_category")
    # Liikku Leppävaara: official page now clearly coming soon 2027
    if "espoo-leppavaara" in (r.get("source_url") or "") and html and coming_soon_language(html):
        r["import_category"] = "COMING_SOON"
        r["verification_status"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["is_active"] = False
        r["notes"] = ((r.get("notes") or "") + "; phase2_official_avataan_2027").strip("; ")
        coords = extract_official_coords(html)
        if coords:
            apply_official_coords(r, coords[0][0], coords[0][1], coords[0][2], cache, coord_seen)
            r["import_category"] = "COMING_SOON"
            r["verification_status"] = "COMING_SOON"
            r["is_active"] = False
        return "reclassified_coming_soon"

    if prev_cat not in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}:
        return "skip"

    if html:
        coords = extract_official_coords(html)
        for lat, lng, src in coords:
            if apply_official_coords(r, lat, lng, src, cache, coord_seen):
                r["notes"] = ((r.get("notes") or "") + "; phase2_official_map_recovery").strip("; ")
                return "recovered_official"

    # Ole.Fit homepage locator pin, only if unique and reverse-consistent
    if r.get("brand") == "Ole.Fit" and homepage_coords:
        key = (norm(r.get("address")), fi_postal(r.get("postal_code")))
        hit = homepage_coords.get(key)
        if hit and hit.get("lat") is not None:
            if apply_official_coords(r, hit["lat"], hit["lng"], "official_locator", cache, coord_seen):
                r["notes"] = ((r.get("notes") or "") + "; phase2_olefit_homepage_locator_verified").strip("; ")
                return "recovered_official_locator"

    if try_structured(r, cache):
        r["notes"] = ((r.get("notes") or "") + "; phase2_structured_nominatim").strip("; ")
        return "recovered_structured"

    if prev_cat == "NEEDS_REVIEW":
        r["import_category"] = "NEEDS_REVIEW"
    else:
        r["import_category"] = "NEEDS_COORDINATES"
    r["lat"] = r["lng"] = None
    return "unresolved"


def geocode_new(r, html, homepage_coords, cache, coord_seen):
    if r.get("import_category") == "CLOSED":
        return
    if html:
        coords = extract_official_coords(html)
        for lat, lng, src in coords:
            if apply_official_coords(r, lat, lng, src, cache, coord_seen):
                r["notes"] = ((r.get("notes") or "") + "; phase2_official_map").strip("; ")
                if r.get("import_category") == "COMING_SOON":
                    r["verification_status"] = "COMING_SOON"
                    r["is_active"] = False
                return
    if r.get("brand") == "Ole.Fit" and homepage_coords:
        key = (norm(r.get("address")), fi_postal(r.get("postal_code")))
        hit = homepage_coords.get(key)
        if hit and hit.get("lat") is not None:
            if apply_official_coords(r, hit["lat"], hit["lng"], "official_locator", cache, coord_seen):
                r["notes"] = ((r.get("notes") or "") + "; phase2_olefit_homepage_locator_verified").strip("; ")
                return
    if r.get("address") and r.get("postal_code") and r.get("city"):
        try_structured(r, cache)
        if r.get("import_category") == "COMING_SOON":
            r["verification_status"] = "COMING_SOON"
            r["is_active"] = False
            r["is_coming_soon"] = True


def suspicious_ready(rows):
    flags = []
    by_coord = defaultdict(list)
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
        except (TypeError, ValueError):
            flags.append({"name": r.get("name"), "reason": "non_finite_or_missing"})
            continue
        if not math.isfinite(lat) or not math.isfinite(lng):
            flags.append({"name": r.get("name"), "reason": "non_finite"})
            continue
        if lat == 0 and lng == 0:
            flags.append({"name": r.get("name"), "reason": "zero_zero"})
        if not in_fi_bbox(lat, lng):
            flags.append({"name": r.get("name"), "reason": "outside_fi_bbox", "lat": lat, "lng": lng})
        # Helsinki railway-square-ish centroid
        if haversine(lat, lng, 60.1699, 24.9384) < 30 and "helsinki" not in norm(r.get("city")):
            flags.append({"name": r.get("name"), "reason": "helsinki_centroid_wrong_city"})
        by_coord[(round(lat, 5), round(lng, 5))].append(r)
    clusters = []
    for k, g in by_coord.items():
        if len(g) < 2:
            continue
        cities = {norm(x.get("city")) for x in g}
        brands = {norm(x.get("brand")) for x in g}
        if len(cities) > 1 or (len(g) > 1 and len(brands) == 1 and len({norm(x.get("address")) for x in g}) > 1):
            clusters.append(
                {
                    "coord": k,
                    "names": [x.get("name") for x in g],
                    "cities": [x.get("city") for x in g],
                    "brands": [x.get("brand") for x in g],
                }
            )
    return flags, clusters


def postal_audit(rows):
    bad = []
    for r in rows:
        pc = r.get("postal_code")
        if pc is None or pc == "":
            continue
        if not isinstance(pc, str):
            bad.append({"name": r.get("name"), "postal_code": pc, "type": type(pc).__name__, "issue": "not_string"})
            continue
        if not re.fullmatch(r"\d{5}", pc):
            bad.append({"name": r.get("name"), "postal_code": pc, "issue": "not_five_digit_string"})
        elif pc != pc.zfill(5):
            bad.append({"name": r.get("name"), "postal_code": pc, "issue": "leading_zero"})
    return bad


def mojibake_audit(rows):
    bad = []
    for r in rows:
        blob = " ".join(str(r.get(k) or "") for k in ("name", "address", "city", "notes"))
        if re.search(r"Ã.|�|â€", blob):
            bad.append({"name": r.get("name"), "snippet": blob[:120]})
        if r.get("encoding_flag"):
            bad.append({"name": r.get("name"), "snippet": "encoding_flag"})
    return bad


def write_report(rows, phase1_n, new_n, recovered, live_report, staging_report, n_live, extra):
    cats = Counter(r.get("import_category") for r in rows)
    ready_n = cats.get("READY_TO_IMPORT", 0)
    by_brand = defaultdict(list)
    for r in rows:
        by_brand[r.get("brand")].append(r)
    estimates = extra.get("estimates") or {}
    lines = []
    lines.append("# Finland Phase 2 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: PHASE 2 STAGING COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified.")
    lines.append("Phase 1 was not restarted. Final Phase 1 staging was the source of truth.")
    lines.append("The aborted Fressi navigation-label job was ignored.")
    lines.append("EasyFit was not reverted to the intermediate 27/30 sanitizer.")
    lines.append("LadyLine / PTVGYM / Ole.Fit / GYM Anytime Phase 1 official-page repairs were preserved.")
    lines.append("")
    lines.append("## 1. Current staging audit (final Phase 1, before Phase 2 writes)")
    lines.append("")
    lines.append("| Chain | Discovered | READY | NEEDS_COORDINATES | NEEDS_REVIEW | COMING_SOON | CLOSED |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for brand, stats in extra.get("phase1_by_brand") or []:
        lines.append(
            f"| {brand} | {stats['n']} | {stats['READY_TO_IMPORT']} | {stats['NEEDS_COORDINATES']} | {stats['NEEDS_REVIEW']} | {stats['COMING_SOON']} | {stats['CLOSED']} |"
        )
    p1 = extra.get("phase1_totals") or {}
    lines.append(
        f"| **Total** | **{p1.get('n')}** | **{p1.get('READY_TO_IMPORT')}** | **{p1.get('NEEDS_COORDINATES')}** | **{p1.get('NEEDS_REVIEW')}** | **{p1.get('COMING_SOON')}** | **{p1.get('CLOSED')}** |"
    )
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Phase 1 unique staged | {phase1_n} |")
    lines.append(f"| New Phase 2 discoveries (net after ingest/dedupe) | {new_n} |")
    lines.append(f"| Final unique Finland staging | {len(rows)} |")
    lines.append(f"| READY_TO_IMPORT | {ready_n} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| Duplicate/legacy exclusions this pass | {extra.get('dup_exclusions', 0)} |")
    lines.append("")
    lines.append("## Chain coverage")
    lines.append("")
    lines.append("| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for brand in sorted(by_brand):
        g = by_brand[brand]
        disc = len(g)
        rd = sum(1 for x in g if x.get("import_category") == "READY_TO_IMPORT")
        un = sum(1 for x in g if x.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW", "COMING_SOON", "CLOSED"})
        pct = round(100 * rd / disc) if disc else 0
        lines.append(f"| {brand} | {estimates.get(brand, 'official pages / this pass')} | {disc} | {rd} | {un} | {pct}% |")
    lines.append("")
    lines.append("Coverage % is READY / discovered in this staging file.")
    lines.append("")
    lines.append("## Market coverage audit")
    lines.append("")
    for para in extra.get("market_md") or []:
        lines.append(para)
        lines.append("")
    lines.append("## Recovery")
    lines.append("")
    lines.append(f"- Recovered from NEEDS_COORDINATES: {recovered.get('NEEDS_COORDINATES', 0)}")
    lines.append(f"- Recovered from NEEDS_REVIEW: {recovered.get('NEEDS_REVIEW', 0)}")
    lines.append(f"- Reclassified to COMING_SOON (not READY): {recovered.get('reclassified_coming_soon', 0)}")
    lines.append(f"- New locations added from genuine coverage gaps: {new_n}")
    lines.append(f"- Fressi COMING_SOON still held out of READY: {extra.get('fressi_cs_held', 12)}")
    lines.append("")
    for item in extra.get("recovery_detail") or []:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Data quality")
    lines.append("")
    missing_addr = sum(1 for r in rows if not r.get("address"))
    missing_pc = sum(1 for r in rows if not r.get("postal_code"))
    missing_city = sum(1 for r in rows if not r.get("city"))
    missing_coord = sum(1 for r in rows if r.get("lat") is None)
    amb = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")
    flags, clusters = extra.get("coord_flags"), extra.get("coord_clusters")
    postal_bad = extra.get("postal_bad") or []
    moj = extra.get("mojibake") or []
    lines.append(f"- Missing addresses: {missing_addr}")
    lines.append(f"- Missing postcodes: {missing_pc}")
    lines.append(f"- Missing cities: {missing_city}")
    lines.append(f"- Missing coordinates: {missing_coord}")
    lines.append(f"- Ambiguous coordinates (still unresolved): {amb}")
    lines.append(f"- Suspicious READY coordinate flags: {len(flags or [])}")
    lines.append(f"- Suspicious READY coordinate clusters: {len(clusters or [])}")
    lines.append(f"- Leading-zero / non-five-digit postal issues: {len(postal_bad)}")
    lines.append(f"- Mojibake/encoding issues: {len(moj)}")
    lines.append("- Finnish postal codes remain five-character strings (example `00100`, never `100`). JSON strings + Excel TEXT `@`.")
    lines.append("- No Helsinki / city / postal / Finland centroid fallbacks. No neighbour-gym coordinates. No 0,0.")
    if flags:
        for f in flags[:15]:
            lines.append(f"  - FLAG {f}")
    if clusters:
        for c in clusters[:15]:
            lines.append(f"  - CLUSTER {c}")
    if postal_bad:
        for p in postal_bad:
            lines.append(f"  - POSTAL {p}")
    if moj:
        for m in moj[:10]:
            lines.append(f"  - ENCODING {m}")
    lines.append("")
    lines.append("## Completeness")
    lines.append("")
    for para in extra.get("completeness_md") or []:
        lines.append(para)
        lines.append("")
    lines.append("## Major city coverage (sanity check)")
    lines.append("")
    lines.append("| City | Discovered | READY |")
    lines.append("|---|---:|---:|")
    for city in MAJOR_CITIES:
        d, rd = city_ready(rows, city)
        lines.append(f"| {city} | {d} | {rd} |")
    lines.append("")
    lines.append("This is a sanity check, not a requirement to invent locations.")
    lines.append("")
    lines.append("## Duplicate / rebrand analysis")
    lines.append("")
    lines.append(f"- Duplicate IDs remaining: {len(staging_report.get('duplicate_ids') or [])}")
    lines.append(f"- Same-brand physical address duplicates: {len(staging_report.get('same_brand_address') or [])}")
    lines.append(f"- Same-brand proximity ≤80 m: {len(staging_report.get('proximity_same_brand_50m') or [])}")
    lines.append(f"- Legitimate different-brand co-locations ≤80 m: {len(staging_report.get('legitimate_different_brand_colocations') or [])}")
    lines.append(f"- Existing Finland rows in live catalog: {live_report.get('existing_finland_in_catalog')}")
    lines.append(f"- Live catalog total: {live_report.get('live_catalog_total')}")
    lines.append(f"- `fi_*` IDs already in live catalog: {len(live_report.get('fi_prefix_already_used') or [])}")
    lines.append(f"- ID collisions vs live catalog: {len(live_report.get('id_collisions') or [])}")
    lines.append(f"- Same brand+address matches vs live catalog: {len(live_report.get('same_brand_address_matches') or [])}")
    lines.append(f"- Same-brand proximity (≤50 m) vs live catalog: {len(live_report.get('proximity_same_brand') or [])}")
    lines.append(f"- Same address, different brand vs live catalog: {len(live_report.get('same_address_different_brand') or [])}")
    rel = staging_report.get("sats_elixia_relationships") or {}
    lines.append(f"- ELIXIA rows: {rel.get('elixia_rows')}. SATS-branded Finnish rows created: {rel.get('sats_brand_rows')}.")
    lines.append(f"- {rel.get('note')}")
    lines.append("- Fitness24Seven Helsinki Pitäjänmäki vs Pitäjänmäki Group remain separate (open vs coming Group, ~73 m).")
    lines.append("- Fressi Kirkkonummi generic URL remains collapsed into Munkinmäki (one physical gym).")
    lines.append("- GYM Anytime remains current until the announced early-2027 GOGO Express rebrand.")
    lines.append("")
    if staging_report.get("proximity_same_brand_50m"):
        lines.append("Same-brand proximity pairs:")
        for item in staging_report["proximity_same_brand_50m"][:20]:
            lines.append(f"- {item}")
        lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**{ready_n}** READY_TO_IMPORT rows are recommended for a later Finland production merge.")
    lines.append("")
    lines.append(f"Expected catalog after that merge: **{n_live} + {ready_n} = {n_live + ready_n}**.")
    lines.append("")
    lines.append("COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.")
    lines.append("Do not merge yet.")
    lines.append("")
    lines.append("## Scaling")
    lines.append("")
    lines.append(f"Current live catalog: {n_live}. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.")
    total = n_live + ready_n
    if total <= 10000:
        lines.append(f"{total} remains **comfortably inside** the current client-side architecture. No server directory migration is required for this Finland merge.")
    else:
        lines.append(f"{total} would exceed the current 8–10k comfort band.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    lines.append("- `data/finland/finland_centers_staging.json`")
    lines.append("- `data/finland/Gymly_Finland_All_Discovered_Centers.xlsx` (postal TEXT)")
    lines.append("- `data/finland/finland_geocode_review.json`")
    lines.append("- `data/finland/finland_duplicate_analysis.json`")
    lines.append("- `data/finland/phase2/`")
    lines.append("- `scripts/finland-phase2.py`")
    lines.append("")
    lines.append("## Stop")
    lines.append("")
    lines.append("Phase 2 stops here. No production merge. No Finland QA. No Netherlands / next country.")
    lines.append("")
    (OUT / "FINLAND_PHASE2_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    return ready_n


def brand_table(rows):
    by = defaultdict(list)
    for r in rows:
        by[r.get("brand")].append(r)
    out = []
    for brand in sorted(by):
        g = by[brand]
        stats = Counter(x.get("import_category") for x in g)
        out.append(
            (
                brand,
                {
                    "n": len(g),
                    "READY_TO_IMPORT": stats.get("READY_TO_IMPORT", 0),
                    "NEEDS_COORDINATES": stats.get("NEEDS_COORDINATES", 0),
                    "NEEDS_REVIEW": stats.get("NEEDS_REVIEW", 0),
                    "COMING_SOON": stats.get("COMING_SOON", 0),
                    "CLOSED": stats.get("CLOSED", 0),
                },
            )
        )
    return out


def main():
    assert CENTERS.exists()
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    phase1_n = len(rows)
    phase1_ids = {r["id"] for r in rows}
    phase1_by_brand = brand_table(rows)
    phase1_totals = {
        "n": phase1_n,
        **Counter(r.get("import_category") for r in rows),
    }
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    notes = {
        "fetched": [],
        "skipped_duplicates": [],
        "fressi_cs": [],
        "market": [],
    }

    # --- homepage Ole.Fit cards (addresses + locator pins) ---
    ole_home = fetch("https://www.ole.fit/", RAW / "olefit_etusivu.html")
    ole_cards = parse_olefit_homepage_cards(ole_home)
    homepage_coords = {}
    coord_owners = defaultdict(list)
    for c in ole_cards:
        if c.get("lat") is not None:
            key = (round(c["lat"], 5), round(c["lng"], 5))
            coord_owners[key].append(c["name"])
    shared_pins = {k for k, v in coord_owners.items() if len(v) > 1}
    for c in ole_cards:
        if c.get("lat") is None:
            continue
        keyc = (round(c["lat"], 5), round(c["lng"], 5))
        if keyc in shared_pins:
            continue  # Oitti copied Espoo pin
        homepage_coords[(norm(c.get("address")), c.get("postal_code"))] = c

    coord_seen = build_coord_seen(rows)
    for k in shared_pins:
        coord_seen[k].extend(coord_owners[k])

    # --- Fressi COMING_SOON: confirm still not open ---
    fressi_cs_held = 0
    for r in rows:
        if r.get("brand") != "Fressi" or r.get("import_category") != "COMING_SOON":
            continue
        url = r.get("source_url")
        html = ""
        try:
            html = fetch(url, RAW / f"fressi_cs_{slugify(url)}.html")
            notes["fetched"].append(url)
        except Exception as e:
            notes["fressi_cs"].append({"url": url, "error": str(e), "kept": "COMING_SOON"})
            fressi_cs_held += 1
            continue
        if coming_soon_language(html) or not open_now_language(html):
            r["import_category"] = "COMING_SOON"
            r["verification_status"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["is_active"] = False
            fressi_cs_held += 1
            notes["fressi_cs"].append({"name": r.get("name"), "status": "still_coming_soon"})
        else:
            # Extremely conservative: still do not promote from a grey page
            fressi_cs_held += 1
            notes["fressi_cs"].append({"name": r.get("name"), "status": "held_no_clear_open_proof"})

    # --- recover unresolved Phase 1 rows ---
    recovered = Counter()
    recovery_detail = []
    unresolved = [r for r in rows if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}]
    for r in unresolved:
        prev = r.get("import_category")
        html = ""
        url = r.get("source_url")
        if url:
            try:
                html = fetch(url, RAW / f"recover_{slugify(url)}.html")
            except Exception as e:
                recovery_detail.append(f"{r.get('name')}: fetch failed ({e}); left {prev}")
        result = recover_row(r, html, homepage_coords, cache, coord_seen)
        if result == "reclassified_coming_soon":
            recovered["reclassified_coming_soon"] += 1
            recovery_detail.append(f"{r.get('name')}: {prev} → COMING_SOON (official avataan 2027)")
        elif result.startswith("recovered"):
            recovered[prev] += 1
            recovery_detail.append(f"{r.get('name')}: {prev} → {r.get('import_category')} via {result} ({r.get('coord_source')})")
        else:
            recovery_detail.append(f"{r.get('name')}: still {r.get('import_category')} (uncertain; no fallback)")
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- new Ole.Fit /kuntokeskukset2/ ---
    new_rows = []
    staged_ole_urls = {(r.get("source_url") or "").rstrip("/").lower() for r in rows if r.get("brand") == "Ole.Fit"}
    for url in OLEFIT2_URLS:
        if url.rstrip("/").lower() in staged_ole_urls or "arravaara" in url:
            notes["skipped_duplicates"].append(url)
            continue
        try:
            html = fetch(url, RAW / f"olefit2_{slugify(url)}.html")
        except Exception as e:
            notes["fetched"].append({"url": url, "error": str(e)})
            continue
        street, postal, city, coming = parse_olefit_details(html)
        # homepage card fallback for address
        if not street:
            slug = url.rstrip("/").split("/")[-1]
            for c in ole_cards:
                if slug.replace("-", "") in norm(c.get("name")).replace(" ", ""):
                    street, postal, city = c.get("address"), c.get("postal_code"), c.get("city")
                    break
        if not street or not postal:
            # try homepage by URL city token
            token = url.rstrip("/").split("/")[-1]
            for c in ole_cards:
                if token.replace("-", " ") in norm(c.get("name")):
                    street = street or c.get("address")
                    postal = postal or c.get("postal_code")
                    city = city or c.get("city")
        name = f"Ole.Fit {city or ''} {url.rstrip('/').split('/')[-1].replace('-', ' ')}".strip()
        for c in ole_cards:
            if street and norm(c.get("address")) == norm(street) and fi_postal(c.get("postal_code")) == fi_postal(postal):
                name = "Ole.Fit " + re.sub(r"^.*Ole\.Fit\s*", "", c.get("name") or name).strip()
                city = city or c.get("city")
                break
        if already_have(rows + new_rows, "Ole.Fit", street, postal, city, url):
            notes["skipped_duplicates"].append(url)
            continue
        cat = "COMING_SOON" if coming else "NEEDS_COORDINATES"
        status = "COMING_SOON" if coming else "VERIFIED_CURRENT"
        r = blank_row(
            "Ole.Fit",
            name,
            street,
            postal,
            city,
            url,
            "https://www.ole.fit",
            notes="phase2_olefit_kuntokeskukset2; official club page + homepage locator",
            status=status,
            cat=cat,
        )
        geocode_new(r, html, homepage_coords, cache, coord_seen)
        new_rows.append(r)
        notes["fetched"].append(url)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # homepage Ole.Fit cards missing from staging (if club-page fetch missed a name match)
    for c in ole_cards:
        if not c.get("address") or not c.get("postal_code"):
            continue
        if already_have(rows + new_rows, "Ole.Fit", c["address"], c["postal_code"], c["city"]):
            continue
        name = "Ole.Fit " + re.sub(r"^.*Ole\.Fit\s*", "", c.get("name") or "").strip()
        r = blank_row(
            "Ole.Fit",
            name or c.get("name"),
            c["address"],
            c["postal_code"],
            c["city"],
            "https://www.ole.fit/",
            "https://www.ole.fit",
            notes="phase2_olefit_homepage_locator_gap; address from official homepage card",
        )
        geocode_new(r, "", homepage_coords, cache, coord_seen)
        new_rows.append(r)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- Energy ---
    energy = [
        ("Energy Karhunmäki", "Kartanotie 1", "80230", "Joensuu", "https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/"),
        ("Energy Kumpusaari", "Kumpusaarentie 60", "70620", "Kuopio", "https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/"),
        ("Energy Litmanen", "Punakukonkatu 1", "70820", "Kuopio", "https://kuntokeskusenergy.com/kuopio/litmanen/"),
        ("Energy Metropol", "Torikatu 31", "80100", "Joensuu", "https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/"),
        ("Energy Rantakylä", "Ranta-Mutalantie 100", "80160", "Joensuu", "https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/"),
        ("Energy Ylämylly", "Rännitie 3", "80400", "Ylämylly", "https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/"),
    ]
    try:
        fetch("https://kauppa.kuntokeskusenergy.com/info/yhteystiedot/", RAW / "energy_yhteystiedot.html")
    except Exception:
        pass
    for name, addr, postal, city, url in energy:
        if already_have(rows + new_rows, "Energy", addr, postal, city):
            continue
        r = blank_row("Energy", name, addr, postal, city, url, "https://kuntokeskusenergy.com", notes="phase2_energy_official_yhteystiedot; Litmanen now open")
        geocode_new(r, "", {}, cache, coord_seen)
        new_rows.append(r)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- Esport ---
    try:
        fetch("https://esport.fi/yhteystiedot/", RAW / "esport_yhteystiedot.html")
    except Exception:
        pass
    esport = [
        ("Esport Bristol", "Mikonkatu 8", "00100", "Helsinki", "CLOSED", "CLOSED", "https://esport.fi/yhteystiedot/"),
        ("Esport Center", "Koivu-Mankkaan tie 3", "02200", "Espoo", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://esport.fi/yhteystiedot/"),
        ("Esport Arena", "Koivu-Mankkaan tie 5", "02200", "Espoo", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://esport.fi/yhteystiedot/"),
        ("Esport Express Mankkaa", "Sinikalliontie 10", "02630", "Espoo", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://esport.fi/yhteystiedot/"),
        ("Esport Express Liila", "Martinsillantie 10", "02270", "Espoo", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://esport.fi/yhteystiedot/"),
    ]
    for name, addr, postal, city, status, cat, url in esport:
        if already_have(rows + new_rows, "Esport", addr, postal, city):
            continue
        r = blank_row(
            "Esport",
            name,
            addr,
            postal,
            city,
            url,
            "https://esport.fi",
            notes="phase2_esport_official_yhteystiedot; gym-floor sites only; Bristol suljettu toistaiseksi",
            status=status,
            cat=cat,
        )
        geocode_new(r, "", {}, cache, coord_seen)
        new_rows.append(r)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- Greenfit ---
    greenfit = [
        ("Greenfit Keilaniemi", "Keilaniementie 1D", "02150", "Espoo", "https://greenfitkuntosalit.com/toimipisteet/greenfitkeilaniemi/"),
        ("Greenfit Pasila", "Ilmalantori 4", "00240", "Helsinki", "https://greenfitkuntosalit.com/toimipisteet/greenfitpasila/"),
        ("Greenfit Ruoholahti", "Porkkalankatu 5", "00180", "Helsinki", "https://greenfitkuntosalit.com/toimipisteet/greenfitruoholahti/"),
        ("Greenfit Nummela", "Vihdintie 5", "03100", "Nummela", "https://greenfitkuntosalit.com/toimipisteet/greenfitnummela/"),
    ]
    for name, addr, postal, city, url in greenfit:
        html = ""
        try:
            html = fetch(url, RAW / f"greenfit_{slugify(url)}.html")
        except Exception:
            html = ""
        if already_have(rows + new_rows, "Greenfit", addr, postal, city):
            continue
        r = blank_row("Greenfit", name, addr, postal, city, url, "https://greenfitkuntosalit.com", notes="phase2_greenfit_official_toimipisteet")
        geocode_new(r, html, {}, cache, coord_seen)
        new_rows.append(r)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # --- Vocatum ---
    vocatum = [
        ("Vocatum Wellness Kempele", "Linnunrata 21", "90440", "Kempele", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://vocatum.fi/"),
        ("Vocatum Wellness Kynsilehto", "Lehtorouskuntie 10", "90650", "Oulu", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://vocatum.fi/"),
        ("Vocatum Wellness Pirkkala", "Saapastie 2", "33950", "Pirkkala", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://vocatum.fi/"),
        ("Vocatum Up&Go Tampella", "Tampellan Esplanadi 3", "33100", "Tampere", "VERIFIED_CURRENT", "NEEDS_COORDINATES", "https://vocatum.fi/"),
        ("Vocatum Pateniemi", "Pateniemenranta 1", "90800", "Oulu", "COMING_SOON", "COMING_SOON", "https://vocatum.fi/"),
        ("Vocatum Up&Go Lielahti", "Taninkatu 2", "33400", "Tampere", "COMING_SOON", "COMING_SOON", "https://vocatum.fi/kuntosali-tampere-lielahti/"),
    ]
    try:
        fetch("https://vocatum.fi/", RAW / "vocatum_home.html")
        fetch("https://vocatum.fi/kuntosali-tampere-lielahti/", RAW / "vocatum_lielahti.html")
    except Exception:
        pass
    for name, addr, postal, city, status, cat, url in vocatum:
        if already_have(rows + new_rows, "Vocatum", addr, postal, city):
            continue
        r = blank_row(
            "Vocatum",
            name,
            addr,
            postal,
            city,
            url,
            "https://vocatum.fi",
            notes="phase2_vocatum_official; Pateniemi avataan 1.9.2026; Lielahti avataan 15.9.2026",
            status=status,
            cat=cat,
        )
        geocode_new(r, "", {}, cache, coord_seen)
        new_rows.append(r)
        CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # postal strings
    for r in rows + new_rows:
        if r.get("postal_code"):
            r["postal_code"] = fi_postal(r.get("postal_code"))

    # collapse new vs existing
    dup_exclusions = 0
    kept_new = []
    for r in new_rows:
        if already_have(rows, r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url")):
            dup_exclusions += 1
            continue
        if r["id"] in phase1_ids or any(x["id"] == r["id"] for x in kept_new):
            # regenerate from source_url if collision on incomplete address
            r["id"] = make_id(r.get("brand"), r.get("address") or "", r.get("postal_code") or "", r.get("city") or "", r.get("source_url") or "")
        kept_new.append(r)

    rows.extend(kept_new)

    # READY must have finite FI coords
    for r in rows:
        if r.get("import_category") == "READY_TO_IMPORT":
            if not in_fi_bbox(r.get("lat"), r.get("lng")):
                r["import_category"] = "NEEDS_COORDINATES"
                r["lat"] = r["lng"] = None
                r["notes"] = ((r.get("notes") or "") + "; dropped_non_fi_coord").strip("; ")

    flags, clusters = suspicious_ready(rows)
    postal_bad = postal_audit(rows)
    moj = mojibake_audit(rows)

    live_report, centers = vs_live(rows)
    n_live = len(centers)
    staging_report = staging_dupes(rows)
    (OUT / "finland_duplicate_analysis.json").write_text(
        json.dumps({"live": live_report, "staging": staging_report, "phase2_new": [r.get("name") for r in kept_new]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_geocode_review(rows)
    write_excel(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    estimates = {
        "Fitness24Seven": "71 gymData market=fi (67 open + 4 coming soon)",
        "ELIXIA": "32 live elixia.fi embedded JSON",
        "Fressi": "91 claimed on fressi.fi (24h + Hyvinvointikeskus)",
        "Liikku": "76 WP gym CPT; yli 70; homepage lists 2026/2027 openings",
        "EasyFit": "~29–32 official location pages; 30 staged in Phase 1",
        "Forever": "19 gyms / 13 cities on foreverclub.fi",
        "Ole.Fit": "yli 60 claimed; 67 homepage locator cards + Kokkola MINI nav",
        "GOGO": "3 full-service Tampere clubs",
        "GOGO Express": "~25 official gx-cards",
        "GYM Anytime": "5 current clubs until ~early 2027 GOGO Express rebrand",
        "PTVGYM": "15 clubs on ptvgym.fi",
        "LadyLine": "14 official toimipiste clubs",
        "Energy": "6 official 24/7 clubs (Joensuu/Liperi/Kuopio)",
        "Esport": "4 current gym-floor sites + Bristol closed",
        "Greenfit": "4 official Uusimaa clubs",
        "Vocatum": "4 open + 2 coming soon (Pateniemi 1.9, Lielahti 15.9)",
    }
    market_md = [
        "Focus: conventional gyms suitable for Gymly. CrossFit boxes, municipal leisure centres, PT-only, EMS-only, yoga/Pilates-only, martial arts, and physiotherapy-only were not bulk-added.",
        "**INCLUDE (staged this pass):**",
        "- **Energy** — 6 current 24/7 clubs. Official yhteystiedot. Not previously staged. Qualifies. INCLUDE.",
        "- **Esport** — 5 listed sites. Center, Arena, Express Mankkaa, Express Liila have gym floors and are current. Bristol is “Suljettu toistaiseksi” → CLOSED, not READY. Qualifies. INCLUDE.",
        "- **Greenfit** — 4 conventional gyms (Keilaniemi, Pasila, Ruoholahti, Nummela). Under the informal 5+ guideline but Helsinki-metro relevant. INCLUDE.",
        "- **Vocatum** — 4 open conventional gyms + Pateniemi (1.9.2026) and Lielahti (15.9.2026) COMING_SOON. INCLUDE.",
        "- **Ole.Fit `/kuntokeskukset2/`** — genuine Phase 1 scrape gap (homepage yli 60 vs 54 `/kuntokeskukset/` URLs). INCLUDE missing physical clubs. Ärrävaara not duplicated.",
        "**LATER (not staged):** Buusti (~4 regional), Balanssi (~4, Veikkola moved), Fit24 (Klaukkala + maybe 1 more), Polte / Nautilus / Power Gym / Syke (~2–3), independent single-site gyms.",
        "**EXCLUDE:** Anytime Fitness (no FI estate). Puls & Träning (bankrupt 16.3.2026). TFW / CrossFit-style unless a conventional gym floor is the consumer product. Municipal halls. SATS consumer brand is not current in Finland (ELIXIA is).",
        "Fressi homepage still claims **91** centres. Staging remains the physical-club set after the Kirkkonummi collapse; 12 COMING_SOON are counted in the 91 marketing total and stay out of READY. No aborted-job promotions.",
    ]
    completeness_md = [
        "1. **Major chains that appear complete (or complete for the current official locator):** ELIXIA 32/32 live JSON. Fitness24Seven `market=fi` gymData (open + 4 Group coming soon). PTVGYM 15/15. GOGO 3/3. GYM Anytime 5/5 remaining current clubs. Energy 6/6. Greenfit 4/4. Esport current gym-floor set (Bristol closed). LadyLine 14/14 discovered (geocode may still hold some). Forever 19/19 discovered (Lappeenranta may remain unresolved). Liikku WP CPT set plus official coming-soon list; Espoo Leppävaara reclassified COMING_SOON (avataan 2027).",
        "2. **Major chains still materially incomplete:** **Fressi** — 91 claimed vs discovered physical pages; 12 coming soon held; some 24h pages may remain NEEDS_REVIEW if OSM is still ambiguous. **Ole.Fit** — homepage 67 cards vs “yli 60”; Phase 2 adds the `/kuntokeskukset2/` gap; Kokkola MINI may still be thin if the club page lacks a full address. **EasyFit** — Nokia / Mustasaari may remain unresolved if structured geocoding cannot lock a building. GOGO Express Roihupelto + Kajaani remain coming soon.",
        "3. **Meaningful conventional Finnish chains still completely missing:** None of national Fressi/Liikku/F24S scale. Remaining names are small regional (Buusti, Balanssi, Fit24) — LATER, not another full discovery phase.",
        "4. **Is another discovery phase worthwhile?** Not as a bulk Phase 1-style scrape. A later hygiene pass could pick up Fressi openings after they actually open, Ole.Fit MINI if the official footer appears, and any EasyFit/Forever building-level geocodes. Do not start Netherlands from this workstream.",
    ]

    write_report(
        rows,
        phase1_n,
        len(kept_new),
        recovered,
        live_report,
        staging_report,
        n_live,
        {
            "phase1_by_brand": phase1_by_brand,
            "phase1_totals": phase1_totals,
            "estimates": estimates,
            "market_md": market_md,
            "completeness_md": completeness_md,
            "recovery_detail": recovery_detail,
            "fressi_cs_held": fressi_cs_held,
            "dup_exclusions": dup_exclusions,
            "coord_flags": flags,
            "coord_clusters": clusters,
            "postal_bad": postal_bad,
            "mojibake": moj,
        },
    )
    notes["new_names"] = [r.get("name") for r in kept_new]
    notes["recovered"] = dict(recovered)
    notes["recovery_detail"] = recovery_detail
    NOTES.write_text(json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")
    cats = Counter(r.get("import_category") for r in rows)
    print("PHASE2 DONE")
    print("phase1", phase1_n, "new", len(kept_new), "final", len(rows))
    print(dict(cats))
    print("recovered", dict(recovered))
    print("READY", cats.get("READY_TO_IMPORT"), "proposed", n_live + cats.get("READY_TO_IMPORT", 0))


if __name__ == "__main__":
    main()
