#!/usr/bin/env python3
"""
UK Phase 2 FINAL targeted coordinate recovery.

Work only on existing NEEDS_COORDINATES / NEEDS_REVIEW rows.
Do not discover chains, add locations, scrape broadly, or modify centers.json.
Accuracy over coverage: never accept postcode/city/London/country centroids.
"""
from __future__ import annotations

import importlib.util
import json
import math
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
STAGING = OUT / "uk_centers_staging.json"
CACHE = OUT / "uk_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


en = load_mod("uk_phase2_enrich", ROOT / "scripts/uk-phase2-enrich.py")
fin = load_mod("uk_phase2_finalize", ROOT / "scripts/uk-phase2-finalize.py")
c1 = load_mod("uk_phase1_consolidate", ROOT / "scripts/uk-phase1-consolidate.py")

GYM_TYPES = {"gym", "fitness_centre", "sports_centre", "fitness_station", "sports_hall"}
HIGHWAY_CLASS = {"highway"}
COUNTY_CITIES = {
    "kent", "essex", "cheshire", "county durham", "buckinghamshire", "northamptonshire",
    "south wales", "nottinghamshire", "bedfordshire", "cambridgeshire", "greater london",
    "surrey", "hampshire", "berkshire", "hertfordshire", "lancashire", "yorkshire",
    "west midlands", "east sussex", "west sussex", "oxfordshire", "staffordshire",
}
GENERIC_CITY_TOKENS = {
    "london", "greater", "north", "south", "east", "west", "upon", "the", "and",
    "city", "centre", "center", "park", "new", "old", "st", "saint",
}
STOP_ADDR = {
    "unit", "units", "floor", "ground", "suite", "the", "and", "off", "junc", "junction",
    "retail", "park", "shopping", "centre", "center", "fitness", "health", "house",
    "street", "court", "lane", "road", "drive", "village", "office", "business",
    "industrial", "estate", "supermarket", "square", "place", "club", "gyms", "gym",
}


def log(*a):
    print(*a, flush=True)


def local_html(url: str) -> str:
    """Read cached club HTML only. Never fetch."""
    if not url:
        return ""
    for candidate in (url, url.rstrip("/"), url.rstrip("/") + "/"):
        p = en.page_cache_path(candidate)
        if p.exists() and p.stat().st_size > 400:
            return p.read_text(encoding="utf-8", errors="replace")
    return ""


def note(r, text):
    cur = r.get("notes") or ""
    if text not in cur:
        r["notes"] = (cur + "; " + text).strip("; ")


def city_tokens(city: str) -> set[str]:
    toks = [t for t in en.norm(city).split() if len(t) >= 4 and t not in GENERIC_CITY_TOKENS]
    return set(toks)


def city_ok(item, city: str, extra: str = "") -> bool:
    if not city and not extra:
        return False
    addr = item.get("address") or {}
    fields = " ".join(
        en.norm(addr.get(k) or "")
        for k in ("city", "town", "village", "suburb", "city_district", "hamlet", "county")
    )
    display = en.norm(item.get("display_name") or "")
    hay = fields + " " + display
    tokens = city_tokens(city) | city_tokens(extra)
    if not tokens:
        # short names like "Yate"
        raw = [t for t in en.norm(city).split() if len(t) >= 3 and t not in GENERIC_CITY_TOKENS]
        tokens = set(raw)
    return any(t in hay for t in tokens)


def expand_address(street: str) -> str:
    s = en.clean_text(street or "")
    s = s.replace("&", " and ")
    s = re.sub(r"(?i)\bUnit(?:s)?\s+(\d+)\s*(?:and|&)\s*(\d+)", r"Units \1-\2", s)
    s = re.sub(r"(?i)\b(\d+)\s*&\s*(\d+)\b", r"\1-\2", s)
    subs = [
        (r"(?i)\bRd\b", "Road"),
        (r"(?i)\bLn\b", "Lane"),
        (r"(?i)\bAve\b", "Avenue"),
        (r"(?i)\bDr\b", "Drive"),
        (r"(?i)\bCl\b", "Close"),
        (r"(?i)\bCt\b", "Court"),
        (r"(?i)\bPl\b", "Place"),
        (r"(?i)\bSq\b", "Square"),
        (r"(?i)\bCres\b", "Crescent"),
        (r"(?i)\bTer(?:r)?\b", "Terrace"),
        (r"(?i)\bGdns\b", "Gardens"),
        (r"(?i)\bPk\b", "Park"),
        (r"(?i)\bSt\b(?=\s*$|,)", "Street"),
    ]
    for pat, repl in subs:
        s = re.sub(pat, repl, s)
    s = re.sub(r"(?i)\bSt Anns\b", "St Ann's", s)
    s = re.sub(r"(?i)\bGreatwest\b", "Great West", s)
    s = re.sub(r"(?i)\bAlencon\b", "Alencon", s)
    s = re.sub(r"(?i)^\s*off\s+", "", s)
    s = re.sub(r"(?i)\b\d+\s+miles\s+away\b", " ", s)
    s = re.sub(r"(?i)\bjunc(?:tion)?\s+\d+\s+m\d+\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s


def strip_unit_prefix(street: str) -> str:
    s = street or ""
    s = re.sub(r"(?i)^(ground\s+floor|first\s+floor|second\s+floor|level\s+\d+)\s*,\s*", "", s)
    s = re.sub(r"(?i)^units?\s+[0-9a-z][0-9a-z\s\-&,/]*\s*,\s*", "", s)
    s = re.sub(r"(?i)^suites?\s+[0-9a-z\-\s]+\s*,\s*", "", s)
    return s.strip(" ,")


def named_complex(street: str) -> str:
    m = re.search(
        r"([^,]+(?:retail park|shopping centre|shopping center|leisure park|business park|"
        r"industrial estate|leisure centre|health club|sports ground|power station)[^,]*)",
        street or "",
        re.I,
    )
    return m.group(1).strip(" ,") if m else ""


def roadish_segment(street: str) -> str:
    parts = [p.strip() for p in (street or "").split(",") if p.strip()]
    road_re = re.compile(
        r"\b(road|street|lane|drive|way|avenue|close|court|link|hill|row|gate|parade|"
        r"walk|crescent|parkway|broadway|embankment|terrace|gardens|square|place|boulevard)\b",
        re.I,
    )
    for p in reversed(parts):
        if road_re.search(p) and en.norm(p) not in {"united kingdom", "england", "scotland", "wales"}:
            return p
    return parts[-1] if parts else (street or "")


def tidy_official_address(r: dict) -> None:
    """Safe cleanup of official address/city/postcode. Does not invent values."""
    addr = en.clean_text(r.get("address") or "")
    pc = en.normalize_postcode(r.get("postal_code") or "") or (r.get("postal_code") or "")
    city = (r.get("city") or "").strip()
    if pc:
        addr = re.sub(re.escape(pc), "", addr, flags=re.I)
        addr = re.sub(r"\s+", " ", addr).strip(" ,")
        r["postal_code"] = pc
    expanded = expand_address(addr)
    if expanded:
        addr = expanded
    # drop trailing county/city duplicates from official blob
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    drop = {en.norm(city), en.norm(pc), "united kingdom", "england", "scotland", "wales", "northern ireland"}
    while parts and (en.norm(parts[-1]) in drop or en.normalize_postcode(parts[-1])):
        parts.pop()
    if parts and en.norm(parts[-1]) in COUNTY_CITIES and len(parts) >= 2:
        # city field is a county; locality is in the official address
        locality = parts[-1]
        if en.norm(city) in COUNTY_CITIES or en.norm(city) == en.norm(locality):
            city = parts[-2] if en.norm(parts[-1]) in COUNTY_CITIES else parts[-1]
            if en.norm(parts[-1]) in COUNTY_CITIES:
                parts = parts[:-1]
                city = parts[-1]
        r["city"] = city
    addr = ", ".join(parts)
    # brand prefix is fine to keep for Bannatyne official strings
    if addr:
        r["address"] = addr
    if r.get("city") and en.norm(r["city"]) in COUNTY_CITIES:
        # pull town from remaining address if still a county
        parts = [p.strip() for p in (r.get("address") or "").split(",") if p.strip()]
        for p in reversed(parts):
            n = en.norm(p)
            if n not in COUNTY_CITIES and n not in drop and not en.normalize_postcode(p) and len(p) > 2:
                if not re.search(r"(?i)health club|bannatyne|unit \d", p):
                    r["city"] = p
                    break
    if r.get("postal_code"):
        r["constituent_country"] = en.constituent_country(r["postal_code"], r.get("city") or "")
    r["id"] = en.make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url") or "")


def recovery_score(item, street, postal, city, brand="", extra_city="", pc_prefix=""):
    """Stricter than production scorer: never accept road/postcode/city centroids."""
    addr = item.get("address") or {}
    try:
        lat, lng = float(item["lat"]), float(item["lon"])
    except (TypeError, ValueError, KeyError):
        return None, ["bad_coords"], None, None
    lo, hi, w, e = en.UK_BOUNDS
    if not (lo <= lat <= hi and w <= lng <= e):
        return None, ["outside_uk"], lat, lng
    t = (item.get("type") or "").lower()
    addresstype = (item.get("addresstype") or "").lower()
    osm_class = (item.get("class") or "").lower()
    if t in en.COARSE or addresstype in en.COARSE:
        return None, ["coarse_type:" + (addresstype or t)], lat, lng
    if osm_class in {"boundary", "place"}:
        return None, ["coarse_class:" + osm_class + ":" + t], lat, lng
    if osm_class in HIGHWAY_CLASS:
        return None, ["road_centroid:" + t], lat, lng
    reasons = []
    score = 0
    pc_n = re.sub(r"\s+", "", str(addr.get("postcode") or "").upper())
    postal_n = re.sub(r"\s+", "", (postal or "").upper())
    if postal_n and pc_n == postal_n:
        score += 5
        reasons.append("postal_exact")
    elif pc_prefix and pc_n and pc_n.startswith(pc_prefix) and 5 <= len(pc_n) <= 7:
        score += 5
        reasons.append("postal_exact")
        reasons.append("truncated_prefix_completed")
    elif postal_n and pc_n and (pc_n[:4] == postal_n[:4] or pc_n[:3] == postal_n[:3]):
        score += 1
        reasons.append("postal_soft")
    if city_ok(item, city, extra_city):
        score += 3
        reasons.append("city_ok")
    street_n = en.norm(street)
    road = en.norm(addr.get("road") or "")
    if road and street_n and (road in street_n or any(tok in road for tok in street_n.split() if len(tok) > 3)):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", (street or "").lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")
    if t in GYM_TYPES or osm_class in {"leisure"}:
        score += 4
        reasons.append("gym_poi")
    amenity = t in {"yes", "retail", "commercial", "industrial", "house", "apartments", "office"} or osm_class in {
        "building", "amenity", "leisure", "shop", "office",
    }
    if amenity:
        score += 2
        reasons.append("building_or_amenity")
    brand_n = en.norm(brand)
    brand_first = brand_n.split(" ")[0] if brand_n else ""
    name_n = en.norm(item.get("name") or (item.get("display_name") or "")[:80])
    if brand_first and len(brand_first) > 3 and brand_first in name_n:
        score += 4
        reasons.append("brand_name_match")
    # named building / park from official address
    for tok in re.split(r"[,\s]+", street or ""):
        nt = en.norm(tok)
        if len(nt) >= 6 and nt not in STOP_ADDR and nt in name_n:
            score += 2
            reasons.append("named_site_match")
            break
    if "road_match" not in reasons and "house_number_match" not in reasons and "building_or_amenity" not in reasons and "brand_name_match" not in reasons and "gym_poi" not in reasons:
        return None, reasons + ["no_street_building_or_named_poi"], lat, lng
    if "postal_exact" not in reasons and "postal_soft" in reasons and "road_match" not in reasons and "brand_name_match" not in reasons and "gym_poi" not in reasons:
        return None, reasons + ["soft_postal_without_road"], lat, lng
    # Soft postcode without house number or named gym is too coarse for a 200 m geofence
    if "postal_exact" not in reasons and "gym_poi" not in reasons and "brand_name_match" not in reasons and "house_number_match" not in reasons and "named_site_match" not in reasons:
        return None, reasons + ["soft_or_missing_postal_without_precise_anchor"], lat, lng
    if score < 7:
        return None, reasons + ["score_too_low"], lat, lng
    # Different club at same brand (Chiswick Park vs Riverside)
    if "brand_name_match" in reasons and postal_n and pc_n and pc_n != postal_n and "postal_soft" not in reasons:
        return None, reasons + ["brand_poi_wrong_postcode"], lat, lng
    return score, reasons, lat, lng


def nominatim_search(query, cache):
    if query in cache:
        return cache[query]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "gb",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": en.GEO_UA})
    with urllib.request.urlopen(req, context=en.ctx, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    cache[query] = data
    time.sleep(1.1)
    return data


def nominatim_structured(street, city, postal, cache):
    key = f"structured|{street}|{city}|{postal}"
    if key in cache:
        return cache[key]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "street": street,
            "city": city,
            "postalcode": postal,
            "country": "United Kingdom",
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "gb",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": en.GEO_UA})
    with urllib.request.urlopen(req, context=en.ctx, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    cache[key] = data
    time.sleep(1.1)
    return data


def nominatim_reverse(lat, lng, cache):
    key = f"reverse|{round(float(lat), 6)}|{round(float(lng), 6)}"
    if key in cache:
        return cache[key]
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
            "zoom": 18,
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": en.GEO_UA})
    with urllib.request.urlopen(req, context=en.ctx, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    cache[key] = data
    time.sleep(1.1)
    return data


def queries_for(r) -> list[str]:
    street = r.get("address") or ""
    postal = r.get("postal_code") or ""
    city = r.get("city") or ""
    brand = r.get("brand") or ""
    expanded = expand_address(street)
    stripped = strip_unit_prefix(expanded)
    road = roadish_segment(expanded)
    complex_name = named_complex(expanded)
    qs = []
    def add(q):
        q = re.sub(r"\s+", " ", q).strip(" ,")
        if q and q not in qs:
            qs.append(q)
    if expanded and postal and city:
        add(f"{expanded}, {city}, {postal}, United Kingdom")
    if stripped and stripped != expanded and postal:
        add(f"{stripped}, {city}, {postal}, United Kingdom")
    if road and postal:
        add(f"{road}, {city}, {postal}, United Kingdom")
    if complex_name and postal:
        add(f"{complex_name}, {postal}, United Kingdom")
        add(f"{brand}, {complex_name}, {postal}, United Kingdom")
    if expanded and postal:
        add(f"{brand} Gym, {expanded}, {postal}, United Kingdom")
    # named building first comma segment
    first = expanded.split(",")[0].strip() if expanded else ""
    if first and postal and first.lower() not in {en.norm(brand), "unit"}:
        add(f"{first}, {postal}, United Kingdom")
    if not postal and r.get("_pc_prefix") and expanded and city:
        add(f"{expanded}, {city}, United Kingdom")
        add(f"{brand}, {expanded}, {city}, United Kingdom")
        if stripped and stripped != expanded:
            add(f"{stripped}, {city}, United Kingdom")
    return qs


def pick_scored(scored):
    """Return (top, ambiguous_flag). Accept a cluster within 40 m."""
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return None, False
    top = scored[0]
    if len(scored) == 1:
        return top, False
    # prefer gym POI / brand match if present
    preferred = [s for s in scored if "gym_poi" in s[1] or "brand_name_match" in s[1]]
    if len(preferred) == 1:
        return preferred[0], False
    pool = preferred if preferred else scored
    far = []
    for s in pool[1:]:
        d = en.haversine(pool[0][2], pool[0][3], s[2], s[3])
        if d > 40:
            far.append((s, d))
    if not far:
        return pool[0], False
    # if the next-best is far and scores are close, ambiguous
    if abs(pool[0][0] - far[0][0][0]) < 0.5 and far[0][1] > 150:
        return None, True
    # if a clearly better unique gym/exact-postal exists, keep it
    if "postal_exact" in pool[0][1] and ("gym_poi" in pool[0][1] or "house_number_match" in pool[0][1] or "brand_name_match" in pool[0][1]):
        return pool[0], False
    if far[0][1] > 150 and abs(pool[0][0] - far[0][0][0]) < 1.5:
        return None, True
    return pool[0], False


def apply_geocode_hit(r, top, source="nominatim"):
    r["lat"] = round(top[2], 6)
    r["lng"] = round(top[3], 6)
    soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
    r["geocode_status"] = "suspicious" if soft else "ok"
    r["geocode_reasons"] = top[1]
    r["geocode_display"] = top[4]
    r["coord_source"] = source
    if not r.get("postal_code") and top[4]:
        m = en.UK_POSTCODE_RE.search(top[4])
        if m:
            osm_pc = f"{m.group(1).upper()} {m.group(2).upper()}"
            prefix = r.get("_pc_prefix") or ""
            compact = re.sub(r"\s+", "", osm_pc)
            if prefix and compact.startswith(prefix):
                r["postal_code"] = osm_pc
                note(r, "postcode_completed_from_osm_matching_truncated_official")
    if r.get("verification_status") not in {"COMING_SOON", "CLOSED"}:
        r["verification_status"] = "VERIFIED_CURRENT"
    if soft:
        note(r, "soft_postal")
    r["id"] = en.make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url") or "")
    return r


def geocode_unresolved(r, cache, stats):
    street = r.get("address") or ""
    postal = r.get("postal_code") or ""
    city = r.get("city") or ""
    brand = r.get("brand") or ""
    prefix = r.get("_pc_prefix") or ""
    if not street or not city:
        return r
    if not postal and not prefix:
        return r
    extra = (r.get("name") or "") + " " + (r.get("source_url") or "")
    all_items_scored = []
    all_rej = []

    def consider(items, q):
        stats["lookups_considered"] += 1
        local = []
        for it in items or []:
            sc, reasons, lat, lng = recovery_score(it, street, postal, city, brand, extra, prefix)
            if sc is None:
                all_rej.append({"query": q, "reject": reasons, "display": (it or {}).get("display_name")})
                continue
            local.append((sc, reasons, lat, lng, it.get("display_name")))
        all_items_scored.extend(local)
        return local

    # Re-score previous standard queries from cache (no network if cached)
    old_qs = [
        f"{brand}, {street}, {postal}, United Kingdom",
        f"{street}, {postal}, United Kingdom",
        f"{brand} {city}, {postal}, United Kingdom",
    ]
    for q in old_qs:
        try:
            items = nominatim_search(q, cache)
        except Exception as e:
            all_rej.append({"query": q, "error": str(e)})
            continue
        consider(items, q)

    top, amb = pick_scored(list(all_items_scored))
    if amb:
        r["geocode_status"] = "ambiguous"
        r["lat"] = r["lng"] = None
        r["import_category"] = "NEEDS_COORDINATES"
        r["geocode_rejected"] = all_rej[:6]
        stats["ambiguous"] += 1
        return r
    if top:
        stats["rescored_cache"] += 1
        return apply_geocode_hit(r, top)

    # New query forms
    for q in queries_for(r):
        if q in old_qs:
            continue
        stats["new_queries"] += 1
        try:
            items = nominatim_search(q, cache)
        except Exception as e:
            all_rej.append({"query": q, "error": str(e)})
            time.sleep(1.1)
            continue
        consider(items, q)
        top, amb = pick_scored(list(all_items_scored))
        if amb:
            r["geocode_status"] = "ambiguous"
            r["lat"] = r["lng"] = None
            r["geocode_rejected"] = all_rej[:6]
            stats["ambiguous"] += 1
            return r
        if top:
            stats["recovered_new_query"] += 1
            return apply_geocode_hit(r, top)

    # Structured search
    expanded = expand_address(street)
    stripped = strip_unit_prefix(expanded) or expanded
    if postal:
        stats["structured"] += 1
        try:
            items = nominatim_structured(stripped, city, postal, cache)
            consider(items, f"structured|{stripped}|{city}|{postal}")
        except Exception as e:
            all_rej.append({"query": "structured", "error": str(e)})
            time.sleep(1.1)

        top, amb = pick_scored(list(all_items_scored))
        if amb:
            r["geocode_status"] = "ambiguous"
            r["lat"] = r["lng"] = None
            r["geocode_rejected"] = all_rej[:6]
            stats["ambiguous"] += 1
            return r
        if top:
            stats["recovered_structured"] += 1
            return apply_geocode_hit(r, top)

        # Brand + postcode POI only (never a centroid)
        poi_q = f"{brand}, {postal}, United Kingdom"
        stats["poi_queries"] += 1
        try:
            items = nominatim_search(poi_q, cache)
        except Exception as e:
            all_rej.append({"query": poi_q, "error": str(e)})
            items = []
            time.sleep(1.1)
        poi_scored = []
        for it in items or []:
            sc, reasons, lat, lng = recovery_score(it, street, postal, city, brand, extra, prefix)
            if sc is None:
                continue
            if "brand_name_match" in reasons and "postal_exact" in reasons and ("gym_poi" in reasons or "building_or_amenity" in reasons):
                poi_scored.append((sc, reasons, lat, lng, it.get("display_name")))
        top, amb = pick_scored(poi_scored)
        if amb:
            r["geocode_status"] = "ambiguous"
            r["lat"] = r["lng"] = None
            stats["ambiguous"] += 1
            return r
        if top:
            stats["recovered_poi"] += 1
            return apply_geocode_hit(r, top)

    r["lat"] = r["lng"] = None
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:6]
    return r


def extract_official_coords(r):
    html = local_html(r.get("source_url") or "")
    if not html:
        return None, None, None
    ld = en.extract_ld(html)
    lat, lng = ld.get("lat"), ld.get("lng")
    src = "official_json_ld"
    if lat is None:
        lat, lng = en.maps_q_coords(html)
        src = "official_maps_q"
    lat, lng = en.coords_ok(lat, lng)
    if lat is None:
        return None, None, None
    return lat, lng, src


def official_pin_ok(lat, lng, r, cache):
    """Accept official page coordinates only if reverse geocode agrees with locality/postcode/road."""
    try:
        rev = nominatim_reverse(lat, lng, cache)
    except Exception:
        time.sleep(1.1)
        return False, None, "reverse_failed"
    if not isinstance(rev, dict) or rev.get("error"):
        return False, None, "reverse_error"
    addr = rev.get("address") or {}
    display = (rev.get("display_name") or "").lower()
    osm_pc = en.normalize_postcode(addr.get("postcode") or "")
    postal = en.normalize_postcode(r.get("postal_code") or "")
    city = r.get("city") or ""
    street = r.get("address") or ""
    fake = False
    # London/country centroid style
    if re.search(r"^united kingdom$|^england, united kingdom$|^london, united kingdom$", display.strip()):
        fake = True
    if fake:
        return False, osm_pc, "fallback_like_reverse"
    if postal and osm_pc == postal:
        return True, osm_pc, "reverse_postal_exact"
    if postal and osm_pc and osm_pc.split()[0] == postal.split()[0]:
        if city_ok({"address": addr, "display_name": display}, city, street):
            return True, osm_pc, "reverse_outward_and_city"
        road = en.norm(addr.get("road") or "")
        if road and road in en.norm(street):
            return True, osm_pc, "reverse_outward_and_road"
        return False, osm_pc, "reverse_outward_mismatch_locality"
    if not postal and osm_pc:
        road = en.norm(addr.get("road") or "")
        if city_ok({"address": addr, "display_name": display}, city, street) and (road and road in en.norm(street) or city_ok({"address": addr, "display_name": display}, city)):
            return True, osm_pc, "reverse_filled_postcode"
        return False, osm_pc, "reverse_no_official_postcode_unconfirmed"
    if city_ok({"address": addr, "display_name": display}, city, street):
        return True, osm_pc, "reverse_city_ok_no_osm_pc"
    return False, osm_pc, "reverse_locality_mismatch"


def reclassify_from_cache(r) -> str | None:
    """Return new verification_status or None. Uses existing cached HTML only."""
    url = r.get("source_url") or ""
    html = local_html(url)
    name = (r.get("name") or "").lower()
    notes = (r.get("notes") or "").lower()
    addr = (r.get("address") or "").lower()
    if "test 100 lane" in addr or "test_placeholder" in notes:
        r["verification_status"] = "NEEDS_REVIEW"
        r["import_category"] = "NEEDS_REVIEW"
        r["lat"] = r["lng"] = None
        note(r, "left_unresolved_test_placeholder")
        return "NEEDS_REVIEW"
    if not html:
        return None
    low = html.lower()
    title_m = re.search(r"<title>([^<]+)", html, re.I)
    title = (title_m.group(1) if title_m else "").lower()
    if r.get("brand") == "Nuffield Health" and ("gym closure" in title or "barrow gym closure" in title):
        r["verification_status"] = "CLOSED"
        r["import_category"] = "CLOSED"
        r["is_active"] = False
        r["lat"] = r["lng"] = None
        note(r, "official_page_title_closure")
        return "CLOSED"
    if r.get("brand") == "JD Gyms" and ("gym-location-coming-soon-page" in low or "coming soon" in title):
        # coming-soon page with no usable open-club address
        r["verification_status"] = "COMING_SOON"
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["lat"] = r["lng"] = None
        note(r, "official_coming_soon_page")
        return "COMING_SOON"
    return None


def fill_truncated_postcode_from_ld(r):
    html = local_html(r.get("source_url") or "")
    if not html:
        return
    ld = en.extract_ld(html)
    raw = ""
    place = en.first_gym_ld(en.ld_blocks(html)) or {}
    addr = place.get("address") or {}
    if isinstance(addr, dict):
        raw = str(addr.get("postalCode") or "")
    # Keep only if already a full valid UK postcode
    full = en.normalize_postcode(raw)
    if full and not r.get("postal_code"):
        r["postal_code"] = full
        note(r, "postcode_from_json_ld")
    elif raw and not full:
        compact = re.sub(r"\s+", "", raw.upper())
        m = re.match(r"^([A-Z]{1,2}[0-9][0-9A-Z]?)([0-9][A-Z]{0,2})$", compact)
        if m and len(m.group(2)) < 3:
            r["_pc_prefix"] = compact
            note(r, f"truncated_official_postcode:{raw}")
    if ld.get("address") and (not r.get("address") or len(r.get("address") or "") < 8):
        r["address"] = ld["address"]
    if ld.get("city") and not r.get("city"):
        r["city"] = ld["city"]


def extra_duplicate_analysis(rows):
    findings = {
        "same_id": [],
        "same_brand_address_postcode": [],
        "same_coords_same_brand": [],
        "same_address_different_brand": [],
        "legacy_rebrand_pairs": [],
    }
    by_id = defaultdict(list)
    by_bap = defaultdict(list)
    by_addr = defaultdict(list)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None]
    for r in rows:
        by_id[r.get("id")].append(r)
        key = (en.norm(r.get("brand")), en.norm(r.get("address")), en.normalize_postcode(r.get("postal_code") or ""))
        by_bap[key].append(r)
        if r.get("address") and r.get("postal_code"):
            by_addr[(en.norm(r.get("address")), en.normalize_postcode(r.get("postal_code") or ""))].append(r)
    for i, rs in by_id.items():
        if len(rs) > 1:
            findings["same_id"].append({"id": i, "names": [x.get("name") for x in rs]})
    for k, rs in by_bap.items():
        if k[1] and len(rs) > 1:
            findings["same_brand_address_postcode"].append({"key": k, "names": [x.get("name") for x in rs]})
    for k, rs in by_addr.items():
        brands = {x.get("brand") for x in rs}
        if len(brands) > 1:
            findings["same_address_different_brand"].append(
                {"address": k[0], "postal_code": k[1], "brands": sorted(brands), "names": [x.get("name") for x in rs]}
            )
            if {"Everlast Gyms", "DW Sports Fitness"} <= brands or any(x.get("legacy_brand") for x in rs):
                findings["legacy_rebrand_pairs"].append({"names": [x.get("name") for x in rs], "brands": sorted(brands)})
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if en.norm(a.get("brand")) != en.norm(b.get("brand")):
                continue
            d = en.haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d <= 40:
                findings["same_coords_same_brand"].append(
                    {"a": a.get("name"), "b": b.get("name"), "distance_m": round(d), "brand": a.get("brand")}
                )
    return findings


CHAIN_ORDER = [
    ("Anytime Fitness", ["Anytime Fitness"]),
    ("JD Gyms", ["JD Gyms"]),
    ("Snap Fitness", ["Snap Fitness"]),
    ("Everlast Gyms", ["Everlast Gyms"]),
    ("Bannatyne", ["Bannatyne"]),
    ("énergie Fitness", ["Energie Fitness", "énergie Fitness"]),
    ("The Gym Group", ["The Gym Group"]),
    ("Total Fitness", ["Total Fitness"]),
    ("Virgin Active", ["Virgin Active"]),
    ("David Lloyd", ["David Lloyd"]),
    ("Nuffield Health", ["Nuffield Health"]),
    ("Fitness4Less / easyGym", ["Fitness4Less", "easyGym", "EasyGym"]),
    ("Buzz Gym", ["Buzz Gym"]),
    ("Gymbox", ["Gymbox"]),
    ("Third Space", ["Third Space"]),
]


def brand_in(r, aliases):
    return r.get("brand") in aliases


def write_recovery_report(payload):
    lines = []
    lines.append("# UK Phase 2 — Final coordinate recovery")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("**DO NOT MERGE. `src/data/centers.json` was not modified.**")
    lines.append("")
    lines.append("No new chains, no new gym locations, no broad scrape.")
    lines.append("")
    s = payload["start"]
    f = payload["final"]
    lines.append("## Counts")
    lines.append("")
    lines.append("| Metric | Count |")
    lines.append("|---|---:|")
    lines.append(f"| Starting READY_TO_IMPORT | {s['READY_TO_IMPORT']} |")
    lines.append(f"| Starting NEEDS_COORDINATES | {s['NEEDS_COORDINATES']} |")
    lines.append(f"| Starting NEEDS_REVIEW | {s['NEEDS_REVIEW']} |")
    lines.append(f"| Recovered from NEEDS_COORDINATES | {payload['recovered_nc']} |")
    lines.append(f"| Recovered from NEEDS_REVIEW | {payload['recovered_nr']} |")
    lines.append(f"| Final READY_TO_IMPORT | {f['READY_TO_IMPORT']} |")
    lines.append(f"| Final NEEDS_COORDINATES | {f['NEEDS_COORDINATES']} |")
    lines.append(f"| Final NEEDS_REVIEW | {f['NEEDS_REVIEW']} |")
    lines.append(f"| COMING_SOON | {f['COMING_SOON']} |")
    lines.append(f"| CLOSED | {f['CLOSED']} |")
    lines.append(f"| Unique staged | {payload['n_rows']} |")
    lines.append("")
    lines.append("## Chain recovery")
    lines.append("")
    lines.append("| Chain | Before READY | Recovered | Final READY | Remaining unresolved |")
    lines.append("|---|---:|---:|---:|---:|")
    for row in payload["chains"]:
        lines.append(
            f"| {row['chain']} | {row['before_ready']} | {row['recovered']} | {row['final_ready']} | {row['unresolved']} |"
        )
    lines.append("")
    lines.append("## Quality flags")
    lines.append("")
    lines.append(f"- Suspicious coordinates (soft postcode): {payload['suspicious']}")
    lines.append(f"- Ambiguous geocodes remaining: {payload['ambiguous']}")
    lines.append(f"- Postcode mismatches flagged: {payload['postcode_mismatches']}")
    lines.append(f"- Staging duplicate collapses this pass: {payload['staging_collapses']}")
    lines.append(f"- Extra duplicate findings: {json.dumps({k: len(v) for k, v in payload['dup_extra'].items()})}")
    lines.append("")
    lines.append("## Reclassifications (existing source only)")
    lines.append("")
    for item in payload["reclass"]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Intentionally left unresolved")
    lines.append("")
    for item in payload["left"]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Proposed SAFE merge")
    lines.append("")
    lines.append(f"**Exact proposed SAFE merge count: {f['READY_TO_IMPORT']}**")
    lines.append("")
    lines.append(f"Expected final Gymly catalog size: 2,952 + {f['READY_TO_IMPORT']} = **{2952 + f['READY_TO_IMPORT']}**")
    lines.append("")
    lines.append("Do not merge COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, or CLOSED.")
    lines.append("")
    lines.append("## Stop")
    lines.append("")
    lines.append("Coordinate recovery stops here. Do not merge. Do not run UK QA. Do not start another country.")
    text = "\n".join(lines) + "\n"
    (OUT / "UK_PHASE2_COORD_RECOVERY_REPORT.md").write_text(text, encoding="utf-8")
    return text


def main():
    # Safety: never touch production
    raw_centers = CENTERS.read_bytes()
    centers_sha_prefix = __import__("hashlib").sha256(raw_centers).hexdigest()[:16]
    log("centers.json sha256 prefix", centers_sha_prefix, "n", len(json.loads(raw_centers)))

    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    start_ids = {r["id"] for r in rows}
    start_cat = Counter(r.get("import_category") for r in rows)
    log("loaded staging", len(rows), dict(start_cat))
    assert start_cat.get("READY_TO_IMPORT") == 1373
    assert start_cat.get("NEEDS_COORDINATES") == 266
    assert start_cat.get("NEEDS_REVIEW") == 13

    start_ready_ids = {r["id"] for r in rows if r.get("import_category") == "READY_TO_IMPORT"}
    start_nc_ids = {r["id"] for r in rows if r.get("import_category") == "NEEDS_COORDINATES"}
    start_nr_ids = {r["id"] for r in rows if r.get("import_category") == "NEEDS_REVIEW"}
    start_cs_ids = {r["id"] for r in rows if r.get("import_category") == "COMING_SOON"}
    start_nc_urls = {(r.get("source_url") or "").rstrip("/").lower() for r in rows if r.get("import_category") == "NEEDS_COORDINATES"}
    start_nr_urls = {(r.get("source_url") or "").rstrip("/").lower() for r in rows if r.get("import_category") == "NEEDS_REVIEW"}
    start_cs_urls = {(r.get("source_url") or "").rstrip("/").lower() for r in rows if r.get("import_category") == "COMING_SOON"}
    start_ready_by_chain = {}
    for label, aliases in CHAIN_ORDER:
        start_ready_by_chain[label] = sum(
            1 for r in rows if brand_in(r, aliases) and r.get("import_category") == "READY_TO_IMPORT"
        )

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    reclass = []
    left = []
    recovered_nc_ids = set()
    recovered_nr_ids = set()
    stats = defaultdict(int)

    # 1) Reclassify NR from existing official cache (no new fetches)
    for r in rows:
        if r.get("import_category") != "NEEDS_REVIEW":
            continue
        status = reclassify_from_cache(r)
        if status:
            reclass.append(f"{r.get('name')}: {status}")
            log("reclass", r.get("name"), status)

    # 2) Official coordinates already in cached HTML
    for r in rows:
        if r.get("import_category") not in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}:
            continue
        if r.get("verification_status") in {"COMING_SOON", "CLOSED"}:
            continue
        fill_truncated_postcode_from_ld(r)
        lat, lng, src = extract_official_coords(r)
        if lat is None:
            continue
        ok, osm_pc, why = official_pin_ok(lat, lng, r, cache)
        log("official pin", r.get("name"), ok, why, src, lat, lng, "osm_pc", osm_pc)
        if not ok:
            note(r, f"official_coords_rejected:{why}")
            continue
        if not r.get("postal_code") and osm_pc:
            r["postal_code"] = osm_pc
            note(r, "postcode_from_osm_at_official_coords")
        r["lat"], r["lng"] = lat, lng
        r["coord_source"] = src
        r["geocode_status"] = "ok"
        r["geocode_reasons"] = [why, src]
        if r.get("verification_status") not in {"COMING_SOON", "CLOSED"}:
            r["verification_status"] = "VERIFIED_CURRENT"
        note(r, "phase2_coord_recovery_official")
        r["id"] = en.make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url") or "")
        stats["official_pins"] += 1

    # 3) Safe address normalization + geocode remaining unresolved
    todo = []
    for r in rows:
        if r.get("import_category") not in {"NEEDS_COORDINATES", "NEEDS_REVIEW"} and r.get("verification_status") not in {"NEEDS_REVIEW"}:
            # after official pin, category may still be old until classify
            pass
        if r.get("verification_status") in {"COMING_SOON", "CLOSED"}:
            continue
        if r.get("id") in start_ready_ids:
            continue
        if r.get("lat") is not None and r.get("lng") is not None and r.get("postal_code") and r.get("address") and r.get("city"):
            continue
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"} or (
            r.get("id") in start_nc_ids | start_nr_ids and r.get("lat") is None
        ):
            if r.get("verification_status") == "NEEDS_REVIEW" and "test_placeholder" in (r.get("notes") or ""):
                left.append("Anytime Fitness London — official test placeholder (Test 100 Lane / SW1A 1AA)")
                continue
            tidy_official_address(r)
            todo.append(r)

    # unique todo by id
    seen = set()
    uniq = []
    for r in todo:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        uniq.append(r)
    log("geocode todo", len(uniq))

    for i, r in enumerate(uniq):
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if not r.get("address") or not r.get("city") or (not r.get("postal_code") and not r.get("_pc_prefix")):
            log(f"[{i+1}/{len(uniq)}] SKIP incomplete {r.get('name')} pc={r.get('postal_code')!r} addr={str(r.get('address') or '')[:40]!r}")
            continue
        log(f"[{i+1}/{len(uniq)}] {str(r.get('name') or '')[:70]}")
        geocode_unresolved(r, cache, stats)
        if i % 15 == 14:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    rows = [en.classify(r) for r in rows]
    # never upgrade original coming-soon
    for r in rows:
        if (r.get("source_url") or "").rstrip("/").lower() in start_cs_urls:
            r["verification_status"] = "COMING_SOON"
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["lat"] = r["lng"] = None

    rows, amb = fin.dedupe_staging(rows)
    rows = [en.classify(r) for r in rows]
    for r in rows:
        if (r.get("source_url") or "").rstrip("/").lower() in start_cs_urls:
            r["verification_status"] = "COMING_SOON"
            r["import_category"] = "COMING_SOON"
            r["is_coming_soon"] = True
            r["lat"] = r["lng"] = None

    # Do not add locations
    if len(rows) > 1717:
        log("WARNING row count grew", len(rows), "— not expected")
    # IDs may change from address tidy on unresolved rows; count unique
    assert len({r["id"] for r in rows}) == len(rows)

    final_cat = Counter(r.get("import_category") for r in rows)
    recovered_nc = 0
    recovered_nr = 0
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        url = (r.get("source_url") or "").rstrip("/").lower()
        if url in start_nc_urls:
            recovered_nc += 1
        elif url in start_nr_urls:
            recovered_nr += 1
    recovered_rows = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and (r.get("source_url") or "").rstrip("/").lower() in start_nc_urls | start_nr_urls
    ]
    live_report, centers = c1.vs_live(rows)
    dup_extra = extra_duplicate_analysis(rows)

    chains = []
    for label, aliases in CHAIN_ORDER:
        sub = [r for r in rows if brand_in(r, aliases)]
        final_ready = sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT")
        unresolved = sum(1 for r in sub if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"})
        before = start_ready_by_chain[label]
        chains.append(
            {
                "chain": label,
                "before_ready": before,
                "recovered": final_ready - before,
                "final_ready": final_ready,
                "unresolved": unresolved,
            }
        )

    suspicious = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and (r.get("geocode_status") == "suspicious" or "soft_postal" in (r.get("notes") or ""))
        and r["id"] not in start_ready_ids
    ]
    ambiguous = [r for r in rows if r.get("geocode_status") == "ambiguous" and r.get("import_category") != "READY_TO_IMPORT"]
    pc_mismatch = []
    for r in recovered_rows:
        disp = r.get("geocode_display") or ""
        m = en.UK_POSTCODE_RE.search(disp)
        if m and r.get("postal_code"):
            osm_pc = f"{m.group(1).upper()} {m.group(2).upper()}"
            if osm_pc != r.get("postal_code") and "postal_exact" not in (r.get("geocode_reasons") or []):
                pc_mismatch.append({"name": r.get("name"), "official": r.get("postal_code"), "osm": osm_pc})

    # Intentionally left unresolved highlights
    if any(r.get("name") == "Virgin Active Chiswick Riverside" and r.get("import_category") != "READY_TO_IMPORT" for r in rows):
        left.append("Virgin Active Chiswick Riverside — Nominatim hits Chiswick Park; not the Riverside club")
    if any(r.get("name") == "Virgin Active Cannon Street (Walbrook)" and r.get("import_category") == "NEEDS_REVIEW" for r in rows):
        left.append("Virgin Active Cannon Street (Walbrook) — no page cache; no new scrape")
    if any(r.get("name") == "Virgin Active Clearview/Brentwood" and r.get("import_category") == "NEEDS_REVIEW" for r in rows):
        left.append("Virgin Active Clearview/Brentwood — no page cache; no new scrape")
    if any(r.get("name") == "Energie Fitness Brentford" and r.get("import_category") != "READY_TO_IMPORT" for r in rows):
        left.append("Energie Fitness Brentford — JSON-LD postcode truncated (TW8 0G); not invented")
    if any("Snap Fitness Bristol" == r.get("name") and not r.get("postal_code") for r in rows):
        left.append("Snap Fitness Bristol (Filton) — official JSON-LD postalCode empty")

    payload = {
        "start": dict(start_cat),
        "final": dict(final_cat),
        "recovered_nc": recovered_nc,
        "recovered_nr": recovered_nr,
        "n_rows": len(rows),
        "chains": chains,
        "suspicious": len(suspicious),
        "ambiguous": len(ambiguous),
        "postcode_mismatches": len(pc_mismatch),
        "staging_collapses": len(amb),
        "dup_extra": dup_extra,
        "reclass": reclass,
        "left": left,
        "stats": dict(stats),
        "pc_mismatch_rows": pc_mismatch,
        "suspicious_rows": [{"name": r.get("name"), "display": r.get("geocode_display")} for r in suspicious],
    }

    for r in rows:
        r.pop("_pc_prefix", None)

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    dup = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "phase": "uk_phase2_coord_recovery",
        "staging_collapses": amb,
        "vs_live": live_report,
        "staging_counts": dict(final_cat),
        "extra": {k: v for k, v in dup_extra.items()},
        "recovery_stats": dict(stats),
    }
    (OUT / "uk_duplicate_analysis.json").write_text(json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8")
    c1.write_geocode_review(rows)
    c1.write_excel(rows)
    text = write_recovery_report(payload)
    (OUT / "uk_coord_recovery_payload.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    # confirm production untouched
    assert CENTERS.read_bytes() == raw_centers
    log("READY", final_cat.get("READY_TO_IMPORT"), "NC", final_cat.get("NEEDS_COORDINATES"), "NR", final_cat.get("NEEDS_REVIEW"), "CS", final_cat.get("COMING_SOON"), "CLOSED", final_cat.get("CLOSED"))
    log("recovered NC", recovered_nc, "NR", recovered_nr)
    log("stats", dict(stats))
    log("wrote recovery report")
    print(text)


if __name__ == "__main__":
    main()
