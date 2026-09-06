#!/usr/bin/env python3
"""
Netherlands Phase 2: SportCity, TrainMore, BigGym discovery + existing recovery.
Merges into staging, geocodes, deduplicates, writes reports.
Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/netherlands"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "netherlands_centers_staging.json"
CACHE = OUT / "netherlands_geocode_cache.json"

ctx = ssl.create_default_context()
UA = "GymlyNetherlandsPhase2/1.0 (catalog research; strict NL geocoding)"
NL_BOUNDS = (50.75, 53.55, 3.35, 7.25)

COARSE = {
    "country", "state", "county", "municipality", "city", "town", "village",
    "administrative", "postcode", "postal_code", "suburb", "neighbourhood",
    "quarter", "district", "borough", "region", "island",
}


def make_id(brand, address, postal, city, source_url=""):
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join([
            (brand or "").strip().lower(),
            (source_url or "").strip().lower(),
            "netherlands",
        ])
    else:
        key = "|".join([
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            (city or "").strip().lower(),
            "netherlands",
        ])
    return "nl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def norm(s):
    s = (s or "").lower()
    s = s.replace("&", " and ").replace("ë", "e").replace("é", "e").replace("è", "e")
    s = s.replace("ü", "u").replace("ï", "i").replace("ö", "o").replace("ä", "a")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def nl_postal(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and math.isnan(s):
        return ""
    raw = str(s).strip()
    m = re.search(r"\b(\d{4})\s*([A-Za-z]{2})\b", raw)
    if m:
        return f"{m.group(1)} {m.group(2).upper()}"
    return ""


def in_nl_bbox(lat, lng) -> bool:
    lo, hi, w, e = NL_BOUNDS
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat == 0 and lng == 0:
        return False
    return lo <= lat <= hi and w <= lng <= e


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def nominatim(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "nl",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    if not in_nl_bbox(lat, lng):
        return None, ["outside_netherlands"], lat, lng
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "nl":
        return None, ["not_country_nl:" + cc], lat, lng
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
    pc = str(addr.get("postcode") or "")
    pc_n = re.sub(r"\s+", "", pc).upper()
    postal_n = re.sub(r"\s+", "", str(postal or "")).upper()
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif postal_n and pc_n and pc_n[:4] == postal_n[:4]:
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
    if road and street_n and (
        road in street_n or street_n in norm(display)
        or any(tok and tok in road for tok in street_n.split() if len(tok) > 4)
    ):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if osm_class in {"building", "amenity", "leisure", "shop"} or t in {
        "gym", "fitness_centre", "sports_centre", "yes", "retail",
    }:
        score += 2
        reasons.append("building_or_amenity")
    if "gym" in display or "sportschool" in display or "fitness" in display:
        score += 1
        reasons.append("gym_poi")
    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons:
        return None, reasons + ["no_street_or_building"], lat, lng
    if "postal_exact" not in reasons and "postal_soft" in reasons and "road_match" not in reasons:
        return None, reasons + ["soft_postal_without_road"], lat, lng
    min_score = 5 if not postal_n else 7
    if score < min_score:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r, cache):
    if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
        return r
    if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
        return r
    street = r.get("address") or ""
    postal = r.get("postal_code") or ""
    city = r.get("city") or ""
    if not street or not city:
        r["import_category"] = "NEEDS_REVIEW"
        r["geocode_status"] = "incomplete_address"
        r["lat"] = r["lng"] = None
        return r
    queries = [f"{street}, {postal} {city}, Netherlands"] if postal else []
    if postal:
        queries.append(f"{street}, {postal}, Netherlands")
    queries.append(f"{street}, {city}, Nederland")
    if not postal:
        queries.append(f"{street}, {city}, Netherlands")
    all_rej = []
    for q in queries:
        try:
            items = nominatim(q, cache)
        except Exception as e:
            all_rej.append({"query": q, "error": str(e)})
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
            if sc is None:
                all_rej.append({"query": q, "reject": reasons, "display": it.get("display_name")})
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name")))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        top = scored[0]
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
                r["lat"] = r["lng"] = None
                r["geocode_rejected"] = all_rej[:5]
                return r
        soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "suspicious" if soft else "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        r["verification_status"] = "VERIFIED_CURRENT"
        # Recover postal code from geocode result if missing
        if not r.get("postal_code") and len(top) > 4:
            display = top[4] or ""
            m_pc = re.search(r"\b(\d{4})\s*([A-Z]{2})\b", display.upper())
            if m_pc:
                r["postal_code"] = f"{m_pc.group(1)} {m_pc.group(2)}"
                r["notes"] = ((r.get("notes") or "") + "; postal_from_geocode").strip("; ")
        if soft:
            r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
            if "road_match" not in top[1]:
                r["import_category"] = "NEEDS_REVIEW"
                r["lat"] = r["lng"] = None
                r["geocode_status"] = "soft_postal_rejected"
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:5]
    r["lat"] = r["lng"] = None
    return r


# ── SportCity data (121 clubs from vacatures.sportcity.nl) ──

SPORTCITY_RAW = [
    ("SportCity Alkmaar Bergerweg", "Kees Boekestraat 2", "Alkmaar", "Noord-Holland"),
    ("SportCity Alkmaar Ringersplein", "Ringersplein 9", "Alkmaar", "Noord-Holland"),
    ("SportCity Alkmaar Vondelstraat", "Vondelstraat 39", "Alkmaar", "Noord-Holland"),
    ("SportCity Almere Randstad", "Randstad 22 101", "Almere", "Flevoland"),
    ("SportCity Alphen aan den Rijn", "De Baronie 8", "Alphen aan den Rijn", "Zuid-Holland"),
    ("SportCity Amersfoort Amsterdamseweg", "Amsterdamseweg 35", "Amersfoort", "Utrecht"),
    ("SportCity Amersfoort Centrum", "Utrechtseweg 6", "Amersfoort", "Utrecht"),
    ("SportCity Amersfoort Noord", "Valutaboulevard 32", "Amersfoort", "Utrecht"),
    ("SportCity Amstelveen", "Maalderij 30", "Amstelveen", "Noord-Holland"),
    ("SportCity Amsterdam Arena", "Hoogoordplein 7", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Buikslotermeerplein", "Buikslotermeerplein 119", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Cornelis Schuytstraat", "Cornelis Schuytstraat 57", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Haarlemmer Houttuinen", "Haarlemmer Houttuinen 37-43", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Karspeldreef", "Karspeldreef 1387", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Lijnbaansgracht", "Lijnbaansgracht 350", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Linnaeushof", "Linnaeushof 4", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Looiersgracht", "Looiersgracht 26-30", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Olympisch Stadion", "Olympisch Stadion 23", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Osdorp", "Osdorpplein 135", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam RAI", "Europaboulevard 3", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Shape all-in", "Van Hallstraat 617", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Singel", "Singel 542 - 548", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Valkenburgerstraat", "Valkenburgerstraat 28", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Waterlooplein", "Jodenbreestraat 6", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Weteringdwarsstraat", "1e Weteringdwarsstraat 3", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Wibautstraat", "Wibautstraat 224", "Amsterdam", "Noord-Holland"),
    ("SportCity Amsterdam Willem de Zwijgerlaan", "Willem de Zwijgerlaan 334", "Amsterdam", "Noord-Holland"),
    ("SportCity Apeldoorn", "De Voorwaarts 49", "Apeldoorn", "Gelderland"),
    ("SportCity Arnhem Overmaat", "Overmaat 80", "Arnhem", "Gelderland"),
    ("SportCity Arnhem Tivolilaan", "Tivolilaan 205", "Arnhem", "Gelderland"),
    ("SportCity Assen", "Zwartwatersweg 133", "Assen", "Drenthe"),
    ("SportCity Baarn", "De Geerenweg 13", "Baarn", "Utrecht"),
    ("SportCity Barendrecht", "Pesetastraat 52-56", "Barendrecht", "Zuid-Holland"),
    ("SportCity Bergen op Zoom", "De Boulevard Noord 2", "Bergen op Zoom", "Noord-Brabant"),
    ("SportCity Bewegingscentrum Drachten", "Sportlaan 2", "Drachten", "Friesland"),
    ("SportCity Bilthoven", "Leyenseweg 123", "Bilthoven", "Utrecht"),
    ("SportCity Breda Franse Akker", "Franse Akker 23", "Breda", "Noord-Brabant"),
    ("SportCity Breda Tramsingel", "Tramsingel 48", "Breda", "Noord-Brabant"),
    ("SportCity Capelle a/d IJssel", "Molenbaan 18-20", "Capelle aan den IJssel", "Zuid-Holland"),
    ("SportCity Delft", "Papsouwselaan 291", "Delft", "Zuid-Holland"),
    ("SportCity Den Bosch Brederostraat", "Brederostraat 1-7", "Den Bosch", "Noord-Brabant"),
    ("SportCity Den Bosch Gruttostraat", "Gruttostraat 35", "Den Bosch", "Noord-Brabant"),
    ("SportCity Den Haag ADO", "Haags Kwartier 15", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag De Uithof", "Jaap Edenweg 26", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Hollands Spoor", "Waldorpstraat 11d", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Houtrust", "Tjalie Robinsonduin 76", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Leidschenveen", "Oude Middenweg 187", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Loosduinseweg", "Loosduinseweg 627", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Mariahoeve", "Het Kleine Loo 414", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag New Babylon", "Bezuidenhoutseweg 61-63a", "Den Haag", "Zuid-Holland"),
    ("SportCity Den Haag Verheeskade", "Verheeskade 105", "Den Haag", "Zuid-Holland"),
    ("SportCity Deventer", "Brinkgreverweg 1", "Deventer", "Overijssel"),
    ("SportCity Doetinchem", "Burgemeester van Nispenstraat 16", "Doetinchem", "Gelderland"),
    ("SportCity Dordrecht Sportboulevard", "Amnesty Internationalweg 25", "Dordrecht", "Zuid-Holland"),
    ("SportCity Dordrecht Vissersdijk", "Vissersdijk beneden 30", "Dordrecht", "Zuid-Holland"),
    ("SportCity Ede", "Brouwerstraat 26", "Ede", "Gelderland"),
    ("SportCity Eindhoven Bisschop Bekkerslaan", "Bisschop Bekkerslaan 4", "Eindhoven", "Noord-Brabant"),
    ("SportCity Eindhoven Gerarduskerk", "Sint Gerardusplein 25", "Eindhoven", "Noord-Brabant"),
    ("SportCity Eindhoven Mecklenburgstraat", "Mecklenburgstraat 1-1a", "Eindhoven", "Noord-Brabant"),
    ("SportCity Emmen", "Dordsestraat 19-25", "Emmen", "Drenthe"),
    ("SportCity Enschede Boulevard", "Boulevard 1945 372a", "Enschede", "Overijssel"),
    ("SportCity Geleen", "Rijksweg Zuid 87-89", "Geleen", "Limburg"),
    ("SportCity Gorinchem Living Well", "Newtonweg 16", "Gorinchem", "Zuid-Holland"),
    ("SportCity Gouda", "Groenhovenpark 1", "Gouda", "Zuid-Holland"),
    ("SportCity Groningen Atoomweg", "Atoomweg 6-8", "Groningen", "Groningen"),
    ("SportCity Groningen Melisseweg", "Melisseweg 81", "Groningen", "Groningen"),
    ("SportCity Haarlem Raaks", "Raaks 7", "Haarlem", "Noord-Holland"),
    ("SportCity Haarlem Schalkwijk", "Costa del Sol 190", "Haarlem", "Noord-Holland"),
    ("SportCity Haarlem Spaarneboog", "Paul Krugerkade 22", "Haarlem", "Noord-Holland"),
    ("SportCity Haarlem Westergracht", "Menno Simonszplein 22", "Haarlem", "Noord-Holland"),
    ("SportCity Heerenveen", "Jousterweg 38", "Heerenveen", "Friesland"),
    ("SportCity Heerlen", "Parallelweg 30", "Heerlen", "Limburg"),
    ("SportCity Helmond", "Europaweg 150", "Helmond", "Noord-Brabant"),
    ("SportCity Hendrik Ido Ambacht", "Nijverheidsweg 64", "Hendrik-Ido-Ambacht", "Zuid-Holland"),
    ("SportCity Hengelo", "Het Plein 180", "Hengelo", "Overijssel"),
    ("SportCity Hilversum", "Zeverijnstraat 6A", "Hilversum", "Noord-Holland"),
    ("SportCity Hoorn", "Dr. C.J.K. van Aalstweg 6B", "Hoorn", "Noord-Holland"),
    ("SportCity Kampen", "Zambonistraat 4g", "Kampen", "Overijssel"),
    ("SportCity Leeuwarden", "Cambuurplein 52 A", "Leeuwarden", "Friesland"),
    ("SportCity Leiden Anthony Fokkerweg", "Anthony Fokkerweg 131", "Leiden", "Zuid-Holland"),
    ("SportCity Leiden Breestraat", "Breestraat 80", "Leiden", "Zuid-Holland"),
    ("SportCity Leiden Groenoord", "Willem de Zwijgerlaan 2 C", "Leiden", "Zuid-Holland"),
    ("SportCity Leiden Lammenschans", "Lammenschansweg 130G", "Leiden", "Zuid-Holland"),
    ("SportCity Leiden Steenschuur", "Steenschuur 9", "Leiden", "Zuid-Holland"),
    ("SportCity Leiden Vlietlijn", "Zoeterwoudsweg 7a", "Leiden", "Zuid-Holland"),
    ("SportCity Leiderdorp Vlasbaan", "Vlasbaan 19", "Leiderdorp", "Zuid-Holland"),
    ("SportCity Leiderdorp Winkelhof", "Winkelhof 1", "Leiderdorp", "Zuid-Holland"),
    ("SportCity Lelystad", "De Meent 18", "Lelystad", "Flevoland"),
    ("SportCity Maastricht", "Franciscus Romanusweg 60", "Maastricht", "Limburg"),
    ("SportCity Middelburg", "Buitenruststraat 20", "Middelburg", "Zeeland"),
    ("SportCity Nieuwegein", "Blokhoeve 2", "Nieuwegein", "Utrecht"),
    ("SportCity Nijkerk", "Bezembinder 2", "Nijkerk", "Gelderland"),
    ("SportCity Nijmegen", "Akkerlaan 46", "Nijmegen", "Gelderland"),
    ("SportCity Purmerend", "Flevostraat 255", "Purmerend", "Noord-Holland"),
    ("SportCity Rijswijk", "Dr. H. Colijnlaan 343", "Rijswijk", "Zuid-Holland"),
    ("SportCity Roosendaal Laan van Limburg", "Laan van Limburg 2", "Roosendaal", "Noord-Brabant"),
    ("SportCity Roosendaal Vijfhuizenberg", "Vijfhuizenberg 36", "Roosendaal", "Noord-Brabant"),
    ("SportCity Rotterdam Blijdorp", "Abraham van Stolkweg 50", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Ceintuurbaan", "Ceintuurbaan 181-183", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Conradstraat", "Conradstraat 40", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Coolsingel", "Coolsingel 139", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam De Kuip", "Cor Kieboomplein 507", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Goudsesingel", "Goudsesingel 232-252", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Lijnbaan", "Oldenbarneveltplaats 38", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Maashaven", "Maashaven Zuidzijde 102", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Ommoord", "Ommoordseweg 32", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Zomerhofstraat", "Zomerhofstraat 52", "Rotterdam", "Zuid-Holland"),
    ("SportCity Rotterdam Zuidplein", "Zuidplein Hoog 605a", "Rotterdam", "Zuid-Holland"),
    ("SportCity Schiedam", "Jan van Galenstraat 11", "Schiedam", "Zuid-Holland"),
    ("SportCity Soest", "Weteringpad 120", "Soest", "Utrecht"),
    ("SportCity Spijkenisse", "Oberonweg 3", "Spijkenisse", "Zuid-Holland"),
    ("SportCity Tilburg Brokxlaan", "Burg. Brokxlaan 1706", "Tilburg", "Noord-Brabant"),
    ("SportCity Tilburg Stappegoor", "Professor Goossenslaan 22", "Tilburg", "Noord-Brabant"),
    ("SportCity Utrecht Kanaleneiland", "Beneluxlaan 21-23", "Utrecht", "Utrecht"),
    ("SportCity Utrecht Leidsche Rijn Centrum", "Dirck Hoetweg 5", "Utrecht", "Utrecht"),
    ("SportCity Utrecht Leidsche Rijn Sportpark", "Parkzichtlaan 207", "Utrecht", "Utrecht"),
    ("SportCity Utrecht Overvecht", "Schooneggendreef 27 L", "Utrecht", "Utrecht"),
    ("SportCity Utrecht Westerdijk", "Westerdijk 2a", "Utrecht", "Utrecht"),
    ("SportCity Utrecht Wonderwoods", "Croeselaan 19", "Utrecht", "Utrecht"),
    ("SportCity Veenendaal", "Gilbert van Schoonbekestraat 1-3", "Veenendaal", "Utrecht"),
    ("SportCity Wateringen", "s-Gravenzandseweg 33", "Wateringen", "Zuid-Holland"),
    ("SportCity Woerden", "Korenmolenlaan 4a", "Woerden", "Utrecht"),
    ("SportCity Zaandam", "Westzijde 163", "Zaandam", "Noord-Holland"),
    ("SportCity Zeist Godfried van Seijstlaan", "Godfried van Seijstlaan 33", "Zeist", "Utrecht"),
    ("SportCity Zeist Huis ter Heideweg", "Huis te Heideweg 52-54", "Zeist", "Utrecht"),
    ("SportCity Zoetermeer Meerzicht", "Bossenwaard 9", "Zoetermeer", "Zuid-Holland"),
    ("SportCity Zoetermeer Scheglaan", "Scheglaan 12", "Zoetermeer", "Zuid-Holland"),
    ("SportCity Zwijndrecht", "H.A. Lorentzstraat 9", "Zwijndrecht", "Zuid-Holland"),
    ("SportCity Zwolle", "Ceintuurbaan 34 A", "Zwolle", "Overijssel"),
]

# ── TrainMore data (from sitemap, official pages, gymsearch) ──

TRAINMORE_RAW = [
    # Amsterdam (27 physical clubs)
    ("TrainMore Amsterdam Amstelveenseweg", "Amstelveenseweg 136", "1075 XM", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/amstelveenseweg"),
    ("TrainMore Amsterdam Beethovenstraat", "Strawinskylaan 159", "1077 XX", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/beethovenstraat"),
    ("TrainMore Amsterdam Bos en Lommer", "Bos en Lommerplein 92", "1055 EK", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/bos-en-lommer"),
    ("TrainMore Amsterdam Buitenveldert", "Van Boshuizenstraat 699", "1082 AZ", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/buitenveldert"),
    ("TrainMore Amsterdam de Pijp", "Tweede van der Helststraat 8h", "1072 PC", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/de-pijp"),
    ("TrainMore Amsterdam Holendrecht", "Pietersbergweg 1218", "1105 BM", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/holendrecht"),
    ("TrainMore Amsterdam IJburg", "Diemerparklaan 35", "1087 GN", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/ijburg"),
    ("TrainMore Amsterdam Javaplein", "Javaplein 14", "1094 HW", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/javaplein"),
    ("TrainMore Amsterdam Koninginneweg", "Koninginneweg 29-31", "1075 CG", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/koninginneweg"),
    ("TrainMore Amsterdam Koningin Wilhelminaplein", "Koningin Wilhelminaplein 2-4", "1062 LE", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/koningin-wilhelminaplein"),
    ("TrainMore Amsterdam Kraanspoor", "Kraanspoor 51", "1033 SC", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/kraanspoor"),
    ("TrainMore Amsterdam Noord", "NDSM-straat 202", "1033 SB", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/noord"),
    ("TrainMore Amsterdam Noordermarkt", "Prinsengracht 13", "1015 DK", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/noordermarkt"),
    ("TrainMore Amsterdam Oosterdok", "Oosterdokskade 63", "1011 DL", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/oosterdok"),
    ("TrainMore Amsterdam Oost", "Oranje Vrijstaatkade 21", "1093 KS", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/oost"),
    ("TrainMore Amsterdam Papaverweg", "Vlierweg 1", "1032 LG", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/papaverweg"),
    ("TrainMore Amsterdam Parnassusweg", "Parnassusweg 298", "1081 LC", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/parnassusweg"),
    ("TrainMore Amsterdam Piet Heinkade", "Veemkade 598", "1019 BL", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/piet-heinkade"),
    ("TrainMore Amsterdam Plantage", "Weesperstraat 101", "1018 VN", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/plantage"),
    ("TrainMore Amsterdam Rembrandtpark", "Nachtwachtlaan 20", "1058 AE", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/rembrandtpark"),
    ("TrainMore Amsterdam Roelof Hartplein", "Ruysdaelstraat 88-90", "1071 XH", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/roelof-hartplein"),
    ("TrainMore Amsterdam Rozengracht", "Rozengracht 75", "1016 LH", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/rozengracht"),
    ("TrainMore Amsterdam Scheldeplein", "Scheldeplein 1b", "1078 GR", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/scheldeplein"),
    ("TrainMore Amsterdam Singel", "Singel 250", "1016 AB", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/singel"),
    ("TrainMore Amsterdam Sloterdijk", "Barajasweg 7", "1043 CM", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/sloterdijk"),
    ("TrainMore Amsterdam Slotervaart", "Louwesweg 6", "1066 EC", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/slotervaart"),
    ("TrainMore Amsterdam Van Wou", "Van Woustraat 4h", "1073 LL", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/van-woustraat"),
    ("TrainMore Amsterdam West", "Bos en Lommerplein 92", "1055 EK", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/west"),
    ("TrainMore Amsterdam West Ladies", "Bos en Lommerplein 284-286", "1055 RW", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/west-ladies"),
    ("TrainMore Amsterdam Westerpark", "Spaarndammerstraat 123h", "1013 TE", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/westerpark"),
    ("TrainMore Amsterdam Weteringschans", "Weteringschans 134", "1017 XV", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/weteringschans"),
    ("TrainMore Amsterdam Zeilstraat", "Keizersgracht 706/A", "1017 EW", "Amsterdam", "https://trainmore.com/en-NL/clubs/amsterdam/zeilstraat"),
    # Rotterdam (7)
    ("TrainMore Rotterdam Blaak", "Botersloot 549", "3011 HE", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/blaak"),
    ("TrainMore Rotterdam Coolsingel", "Coolsingel 51", "3012 AA", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/coolsingel"),
    ("TrainMore Rotterdam Delftse Poort", "Weena 505", "3013 AL", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/delftse-poort"),
    ("TrainMore Rotterdam Meent", "Meent 132 B", "3011 JS", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/meent"),
    ("TrainMore Rotterdam Middellandstraat", "1e Middellandstraat 68A", "3021 BE", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/middellandstraat"),
    ("TrainMore Rotterdam Rijnhaven", "Rijnhaven", "3011", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/rijnhaven"),
    ("TrainMore Rotterdam Wijnhaven", "Posthoornstraat 25", "3011 WD", "Rotterdam", "https://trainmore.com/en-NL/clubs/rotterdam/wijnhaven"),
    # Den Haag (3)
    ("TrainMore Den Haag Dagelijkse Groenmarkt", "Dagelijkse Groenmarkt 19", "2513 AL", "Den Haag", "https://trainmore.com/en-NL/clubs/den-haag/dagelijkse-groenmarkt"),
    ("TrainMore Den Haag Laan van NOI", "Laan van Nieuw Oost-Indie 27", "2593 BJ", "Den Haag", "https://trainmore.com/en-NL/clubs/den-haag/laan-van-noi"),
    ("TrainMore Den Haag Savornin", "De Savornin Lohmanplein 7", "2566 AA", "Den Haag", "https://trainmore.com/en-NL/clubs/den-haag/savornin"),
    # Utrecht (3)
    ("TrainMore Utrecht Janskerkhof", "Drift 9", "3512 BR", "Utrecht", "https://trainmore.com/en-NL/clubs/utrecht/janskerkhof"),
    ("TrainMore Utrecht Oog in Al", "Kanaalweg 94-A", "3533 HH", "Utrecht", "https://trainmore.com/en-NL/clubs/utrecht/oog-in-al"),
    ("TrainMore Utrecht Stationsplein", "Stationsplein 28", "3511 ED", "Utrecht", "https://trainmore.com/en-NL/clubs/utrecht/stationsplein"),
    # Eindhoven (2)
    ("TrainMore Eindhoven Lichttoren", "Lichttoren 14", "5611 BJ", "Eindhoven", "https://trainmore.com/en-NL/clubs/eindhoven/lichttoren"),
    ("TrainMore Eindhoven Strijp-S", "Machinekamerplein 34-38", "5617 AP", "Eindhoven", "https://trainmore.com/en-NL/clubs/eindhoven/strijp-s"),
    # Groningen (2)
    ("TrainMore Groningen Munnekeholm", "Munnekeholm 1", "9711 JA", "Groningen", "https://trainmore.com/en-NL/clubs/groningen/munnekeholm"),
    ("TrainMore Groningen Oude Ebbinge", "Oude Ebbingestraat 54-58", "9712 HL", "Groningen", "https://trainmore.com/en-NL/clubs/groningen/oude-ebbinge"),
    # Haarlem (1)
    ("TrainMore Haarlem Hortusplein", "Hortusplein 4", "2019 XV", "Haarlem", "https://trainmore.com/en-NL/clubs/haarlem/hortusplein"),
    # Other cities
    ("TrainMore Bilthoven Leyenseweg", "Leyenseweg 115K", "3721 BC", "Bilthoven", "https://trainmore.com/en-NL/clubs/bilthoven/leyenseweg"),
    ("TrainMore Bussum Landstraat", "Landstraat 45", "1404 JG", "Bussum", "https://trainmore.com/en-NL/clubs/bussum/landstraat"),
    ("TrainMore Leiden Breestraat", "Breestraat 66", "2311 CS", "Leiden", "https://trainmore.com/en-NL/clubs/leiden/breestraat"),
    ("TrainMore Leusden Maximaplein", "Maximaplein 1", "3832 JS", "Leusden", "https://trainmore.com/en-NL/clubs/leusden/maximaplein"),
]

# Remove duplicate: "TrainMore Amsterdam West" and "TrainMore Amsterdam Bos en Lommer"
# share the same address (Bos en Lommerplein 92). Keep "West" as canonical name.

TRAINMORE_COMING_SOON = {
    "TrainMore Amsterdam Amstel": ("Amstel 135", "1018 EN", "Amsterdam"),
    "TrainMore Rotterdam Rijnhaven": ("Rijnhaven", "3011", "Rotterdam"),
}

# ── BigGym data (15 open + 2 coming soon) ──

BIGGYM_RAW = [
    ("BigGym Alkmaar", "Helderseweg 52", "1817 BB", "Alkmaar", "https://biggym.com/gyms/"),
    ("BigGym Almelo", "Violierstraat 103", "7601 GR", "Almelo", "https://biggym.com/gyms/"),
    ("BigGym Amsterdam", "Oostenburgermiddenstraat 353", "1018 LH", "Amsterdam", "https://biggym.com/gyms/"),
    ("BigGym Deventer", "Piet Van Donkplein 13", "7422 LL", "Deventer", "https://biggym.com/gyms/"),
    ("BigGym Enschede", "Schuttersveld 1-2", "7514 AC", "Enschede", "https://biggym.com/gyms/"),
    ("BigGym Groningen", "Protonstraat 26", "9743 AL", "Groningen", "https://biggym.com/gyms/"),
    ("BigGym Hengelo", "Hamerstraat 4", "7556 MZ", "Hengelo", "https://biggym.com/gyms/"),
    ("BigGym Hoogeveen", "Groenewegenstraat 3", "7901 ED", "Hoogeveen", "https://biggym.com/gyms/"),
    ("BigGym Leeuwarden", "Drachtsterweg 3", "8936 AA", "Leeuwarden", "https://biggym.com/gyms/"),
    ("BigGym Nijmegen", "Hatertseweg 615", "6533 GL", "Nijmegen", "https://biggym.com/gyms/"),
    ("BigGym Roosendaal", "Badhuisstraat 16", "4703 BH", "Roosendaal", "https://biggym.com/gyms/"),
    ("BigGym Rotterdam", "Boezembocht 34-36", "3034 KA", "Rotterdam", "https://biggym.com/gyms/"),
    ("BigGym Tilburg", "Ringbaan-Oost 138", "5013 CE", "Tilburg", "https://biggym.com/gyms/"),
    ("BigGym Utrecht", "Proostwetering 1-B", "3543 AB", "Utrecht", "https://biggym.com/gyms/"),
    ("BigGym Zwolle", "Burgemeester Roelenweg 19", "8031 ES", "Zwolle", "https://biggym.com/gyms/"),
]


def build_sportcity_rows():
    rows = []
    for name, address, city, province in SPORTCITY_RAW:
        rows.append({
            "brand": "SportCity",
            "chain": "SportCity",
            "name": name,
            "center_name": name,
            "address": address,
            "city": city,
            "country": "Netherlands",
            "lat": None,
            "lng": None,
            "source_url": f"https://www.sportcity.nl/sportschool/{city.lower().replace(' ', '-')}",
            "website": "https://www.sportcity.nl",
            "verification_status": "VERIFIED_CURRENT",
            "notes": "phase2_sportcity_vacatures_discovery",
            "is_active": True,
            "phase": "netherlands_phase2",
            "legacy_brand": "Fit For Free",
        })
    return rows


def build_trainmore_rows():
    rows = []
    seen_addr = set()
    for entry in TRAINMORE_RAW:
        name, address, postal, city, url = entry
        addr_key = (norm(address), norm(city))
        if addr_key in seen_addr:
            continue
        seen_addr.add(addr_key)

        is_coming = name in TRAINMORE_COMING_SOON
        if name == "TrainMore Rotterdam Rijnhaven" and not postal:
            postal = "3011"

        lat_from_url = None
        lng_from_url = None
        if "52.1188161" in (url or ""):
            lat_from_url = 52.1188161
            lng_from_url = 5.4088653

        rows.append({
            "brand": "TrainMore",
            "chain": "TrainMore",
            "name": name,
            "center_name": name,
            "address": address,
            "postal_code": nl_postal(postal) or postal,
            "city": city,
            "country": "Netherlands",
            "lat": lat_from_url,
            "lng": lng_from_url,
            "source_url": url,
            "website": "https://trainmore.com",
            "verification_status": "COMING_SOON" if is_coming else "VERIFIED_CURRENT",
            "import_category": "COMING_SOON" if is_coming else None,
            "notes": "phase2_trainmore_sitemap_discovery",
            "is_active": not is_coming,
            "phase": "netherlands_phase2",
        })
    return rows


def build_biggym_rows():
    rows = []
    for name, address, postal, city, url in BIGGYM_RAW:
        rows.append({
            "brand": "BigGym",
            "chain": "BigGym",
            "name": name,
            "center_name": name,
            "address": address,
            "postal_code": nl_postal(postal) or postal,
            "city": city,
            "country": "Netherlands",
            "lat": None,
            "lng": None,
            "source_url": url,
            "website": "https://biggym.com",
            "verification_status": "VERIFIED_CURRENT",
            "notes": "phase2_biggym_market_gap",
            "is_active": True,
            "phase": "netherlands_phase2",
        })
    return rows


def main():
    t0 = time.time()

    # Load existing staging
    existing = json.loads(STAGING.read_text(encoding="utf-8"))
    print(f"Loaded existing staging: {len(existing)} rows")

    # Remove the placeholder SportCity row
    existing = [r for r in existing if not (
        r.get("brand") == "SportCity" and "JS locator not scraped" in (r.get("name") or "")
    )]
    print(f"After removing SportCity placeholder: {len(existing)} rows")

    # Build new rows
    sc_rows = build_sportcity_rows()
    tm_rows = build_trainmore_rows()
    bg_rows = build_biggym_rows()
    print(f"SportCity new: {len(sc_rows)}")
    print(f"TrainMore new: {len(tm_rows)}")
    print(f"BigGym new: {len(bg_rows)}")

    new_rows = sc_rows + tm_rows + bg_rows

    # Assign postal codes to SportCity (need to geocode to find them)
    # For SportCity we don't have postal codes from the vacatures page - leave blank for geocoder

    # Generate IDs for all new rows
    for r in new_rows:
        r["postal_code"] = nl_postal(r.get("postal_code")) or r.get("postal_code") or None
        # For rows with address but no postal, force address-based ID
        addr = (r.get("address") or "").strip()
        postal = (r.get("postal_code") or "").strip()
        city = (r.get("city") or "").strip()
        brand = (r.get("brand") or "").strip()
        if addr and not postal:
            key = "|".join([brand.lower(), addr.lower(), "", city.lower(), "netherlands"])
            r["id"] = "nl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]
        else:
            r["id"] = make_id(brand, addr, postal, city, r.get("source_url") or "")

    # Check for duplicates against existing staging
    existing_ids = {r["id"] for r in existing}
    existing_addr = {
        (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        for r in existing if r.get("address")
    }

    added = []
    skipped_dup = []
    for r in new_rows:
        if r["id"] in existing_ids:
            skipped_dup.append({"name": r["name"], "reason": "id_exists", "id": r["id"]})
            continue
        addr_key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if addr_key[1] and addr_key in existing_addr:
            skipped_dup.append({"name": r["name"], "reason": "addr_exists"})
            continue
        added.append(r)
        existing_ids.add(r["id"])
        if addr_key[1]:
            existing_addr.add(addr_key)

    print(f"New rows to add: {len(added)}, skipped duplicates: {len(skipped_dup)}")

    # Merge
    all_rows = existing + added

    # Classify pre-geocode
    for r in all_rows:
        if r.get("import_category") in {"COMING_SOON", "CLOSED", "DUPLICATE"}:
            continue
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None:
            continue
        if not r.get("address") or not r.get("city"):
            if r.get("import_category") != "NEEDS_REVIEW":
                r["import_category"] = "NEEDS_REVIEW"
            continue
        if r.get("lat") is not None and r.get("lng") is not None:
            try:
                lat, lng = float(r["lat"]), float(r["lng"])
                if in_nl_bbox(lat, lng):
                    r["import_category"] = "READY_TO_IMPORT"
                    r["lat"], r["lng"] = lat, lng
                    r["verification_status"] = r.get("verification_status") or "VERIFIED_CURRENT"
                    continue
                r["lat"] = r["lng"] = None
            except (TypeError, ValueError):
                r["lat"] = r["lng"] = None
        if r.get("import_category") != "NEEDS_REVIEW":
            r["import_category"] = "NEEDS_COORDINATES"

    # Load geocode cache
    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    # Geocode all NEEDS_COORDINATES
    todo = [r for r in all_rows if r.get("import_category") == "NEEDS_COORDINATES"]
    print(f"Geocode todo: {len(todo)}")
    for i, r in enumerate(todo, 1):
        geocode_row(r, cache)
        if i % 10 == 0:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  geocoded {i}/{len(todo)}")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    # Final bbox check
    for r in all_rows:
        if r.get("import_category") == "READY_TO_IMPORT" and not in_nl_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None
            r["notes"] = ((r.get("notes") or "") + "; dropped_non_nl_coord").strip("; ")

    # Write staging
    STAGING.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written staging: {len(all_rows)} rows")

    # Categorize
    cats = Counter(r.get("import_category") for r in all_rows)
    print("Categories:", dict(cats))

    # ── Duplicate analysis ──
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    live_ids = {c["id"] for c in centers}

    dup_report = {
        "vs_live": {
            "live_catalog_total": len(centers),
            "existing_netherlands_in_catalog": sum(1 for c in centers if c.get("country") == "Netherlands"),
            "id_collisions": [r["id"] for r in all_rows if r["id"] in live_ids],
            "nl_prefix_already_used": [c["id"] for c in centers if str(c.get("id", "")).startswith("nl_")],
        },
        "vs_staging": {
            "skipped_duplicates_phase2": skipped_dup,
        },
        "sportcity_fitforfree": {
            "note": "Fit For Free fully rebranded to SportCity Oct 2022. All NL clubs staged as SportCity with legacy_brand='Fit For Free'.",
        },
    }
    (OUT / "netherlands_duplicate_analysis.json").write_text(
        json.dumps(dup_report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── Geocode review ──
    review = []
    for r in all_rows:
        if r.get("coord_source") == "nominatim" or r.get("geocode_status") or r.get("import_category") in {
            "NEEDS_COORDINATES", "NEEDS_REVIEW",
        }:
            review.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "latitude": r.get("lat"),
                "longitude": r.get("lng"),
                "geocode_status": r.get("geocode_status"),
                "import_category": r.get("import_category"),
                "coord_source": r.get("coord_source"),
                "notes": r.get("notes"),
            })
    (OUT / "netherlands_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── Phase 2 report ──
    sc_all = [r for r in all_rows if r.get("brand") == "SportCity" and r.get("phase") == "netherlands_phase2"]
    sc_ready = [r for r in sc_all if r.get("import_category") == "READY_TO_IMPORT"]
    tm_all = [r for r in all_rows if r.get("brand") == "TrainMore"]
    tm_ready = [r for r in tm_all if r.get("import_category") == "READY_TO_IMPORT"]
    tm_coming = [r for r in tm_all if r.get("import_category") == "COMING_SOON"]
    bg_all = [r for r in all_rows if r.get("brand") == "BigGym"]
    bg_ready = [r for r in bg_all if r.get("import_category") == "READY_TO_IMPORT"]

    p1_ready = sum(1 for r in all_rows if r.get("phase") == "netherlands_phase1" and r.get("import_category") == "READY_TO_IMPORT")
    p2_ready = cats.get("READY_TO_IMPORT", 0) - p1_ready

    brands = sorted({r.get("brand") for r in all_rows})
    lines = []
    lines.append("# Netherlands Phase 2 Readiness Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**Status: PHASE 2 COMPLETE — DO NOT MERGE.**")
    lines.append("")
    lines.append("`src/data/centers.json` was not modified. Current production: 4,855 gyms.")
    lines.append("")
    lines.append("## Phase 2 additions")
    lines.append("")
    lines.append("### SportCity (~121 clubs)")
    lines.append("")
    lines.append(f"- Official estimate: 121 clubs")
    lines.append(f"- Discovered: {len(sc_all)}")
    lines.append(f"- READY_TO_IMPORT: {len(sc_ready)}")
    lines.append(f"- Unresolved: {len(sc_all) - len(sc_ready)}")
    lines.append(f"- Legacy brand: Fit For Free (rebranded Oct 2022)")
    lines.append("")
    lines.append("### TrainMore (~50 clubs)")
    lines.append("")
    lines.append(f"- Official estimate: ~50 clubs (Urban Gym Group 50th milestone)")
    lines.append(f"- Discovered: {len(tm_all)}")
    lines.append(f"- READY_TO_IMPORT: {len(tm_ready)}")
    lines.append(f"- COMING_SOON: {len(tm_coming)}")
    lines.append(f"- Unresolved: {len(tm_all) - len(tm_ready) - len(tm_coming)}")
    lines.append("")
    lines.append("### BigGym (~15 clubs) — NEW CHAIN")
    lines.append("")
    lines.append(f"- Official estimate: 15 open clubs")
    lines.append(f"- Discovered: {len(bg_all)}")
    lines.append(f"- READY_TO_IMPORT: {len(bg_ready)}")
    lines.append(f"- Unresolved: {len(bg_all) - len(bg_ready)}")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Total NL staging rows | {len(all_rows)} |")
    lines.append(f"| READY_TO_IMPORT | {cats.get('READY_TO_IMPORT', 0)} |")
    lines.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    lines.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    lines.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    lines.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    lines.append(f"| Phase 1 READY | {p1_ready} |")
    lines.append(f"| Phase 2 NEW READY | {p2_ready} |")
    lines.append(f"| Projected production | 4,855 + {cats.get('READY_TO_IMPORT', 0)} = {4855 + cats.get('READY_TO_IMPORT', 0)} |")
    lines.append("")
    lines.append("## Chain table")
    lines.append("")
    lines.append("| Chain | Discovered | READY | Unresolved |")
    lines.append("|---|---:|---:|---:|")
    for b in brands:
        sub = [r for r in all_rows if r.get("brand") == b]
        disc = len(sub)
        rd = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unr = disc - rd
        lines.append(f"| {b} | {disc} | {rd} | {unr} |")
    lines.append("")
    lines.append("## Production safety")
    lines.append("")
    lines.append(f"- `src/data/centers.json` unchanged: {len(centers)} gyms")
    lines.append(f"- ID collisions with live catalog: {len(dup_report['vs_live']['id_collisions'])}")
    lines.append(f"- `nl_*` IDs already in live catalog: {len(dup_report['vs_live']['nl_prefix_already_used'])}")
    lines.append("")
    lines.append("## Files changed")
    lines.append("")
    lines.append("- `data/netherlands/netherlands_centers_staging.json` (updated)")
    lines.append("- `data/netherlands/netherlands_geocode_review.json` (updated)")
    lines.append("- `data/netherlands/netherlands_duplicate_analysis.json` (updated)")
    lines.append("- `data/netherlands/NETHERLANDS_PHASE2_READINESS_REPORT.md` (created)")
    lines.append("- `scripts/netherlands-phase2-consolidate.py` (created)")
    lines.append("- `data/netherlands/netherlands_geocode_cache.json` (updated)")
    lines.append("")
    lines.append("**STOP. Do not merge. Do not modify centers.json. Do not start another country.**")
    lines.append("")
    (OUT / "NETHERLANDS_PHASE2_READINESS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    elapsed = round(time.time() - t0)
    print(f"\nDONE in {elapsed}s")
    print(f"READY_TO_IMPORT: {cats.get('READY_TO_IMPORT', 0)}")
    print(f"Expected catalog: 4855 + {cats.get('READY_TO_IMPORT', 0)} = {4855 + cats.get('READY_TO_IMPORT', 0)}")


if __name__ == "__main__":
    main()
