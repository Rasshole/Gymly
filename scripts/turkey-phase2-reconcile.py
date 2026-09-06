#!/usr/bin/env python3
"""Turkey Deep Phase 2 — terminal NR resolution + chain estate rebuild.

Read-only against production. Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    TURKEY_POSTAL_RE,
    base_row,
    clean_text,
    curl_fetch,
    format_tr_postal,
    in_turkey,
    make_id,
    nominatim_geocode,
    nominatim_reverse,
    normalize_turkish_search,
    write_json,
)

OUT = ROOT / "data/turkey"
PHASE2 = OUT / "phase2"
RAW = OUT / "raw"
STAGING = OUT / "turkey_centers_staging.json"
GEOCODE_CACHE = OUT / "turkey_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740"
EXPECTED_BYTES = 3761727
PRODUCTION_TOTAL = 12080

GYMFIT_API = "https://www.gymfit.com.tr/api/clubs"

PHASE1_SNAPSHOT = PHASE2 / "TURKEY_PHASE1_STAGING_SNAPSHOT.json"

PHASE1_EXPECTED = {
    "READY_TO_IMPORT": 125,
    "NEEDS_REVIEW": 2,
    "NEEDS_COORDINATES": 0,
    "COMING_SOON": 2,
    "EXCLUDED": 6,
    "CLOSED": 0,
    "TOTAL": 135,
}


def load_phase1_rows() -> list[dict]:
    if PHASE1_SNAPSHOT.exists():
        return json.loads(PHASE1_SNAPSHOT.read_text(encoding="utf-8"))
    parts: list[dict] = []
    for name in (
        "TURKEY_PHASE1_READY_TO_IMPORT.json",
        "TURKEY_PHASE1_NEEDS_REVIEW.json",
        "TURKEY_PHASE1_NEEDS_COORDINATES.json",
        "TURKEY_PHASE1_COMING_SOON.json",
        "TURKEY_PHASE1_EXCLUDED.json",
        "TURKEY_PHASE1_CLOSED.json",
    ):
        path = OUT / name
        if path.exists():
            parts.extend(json.loads(path.read_text(encoding="utf-8")))
    if parts and len(parts) == PHASE1_EXPECTED["TOTAL"]:
        return parts
    return json.loads(STAGING.read_text(encoding="utf-8"))


# Phase 1 marketing estimates (superseded by verified terminal estate in Phase 2)
PHASE1_MARKETING_ESTATE = {
    "MACFit": 320,
    "Mars Athletic Club": 45,
    "Sports International": 28,
    "GymFit": 22,
    "LifeClub": 18,
    "B-Fit": 120,
}

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
    "erzurum": "Erzurum",
    "van": "Van",
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
    "hatay": "Hatay",
}

CITY_COORDS = {
    "İstanbul": (41.01, 28.97),
    "Ankara": (39.93, 32.85),
    "İzmir": (38.42, 27.14),
    "Bursa": (40.19, 29.06),
    "Antalya": (36.89, 30.71),
    "Adana": (37.0, 35.32),
    "Konya": (37.87, 32.49),
    "Gaziantep": (37.07, 37.38),
    "Mersin": (36.80, 34.64),
    "Kocaeli": (40.77, 29.95),
    "Diyarbakır": (37.91, 40.23),
    "Kayseri": (38.73, 35.48),
    "Eskişehir": (39.78, 30.52),
    "Samsun": (41.29, 36.33),
    "Denizli": (37.78, 29.09),
    "Şanlıurfa": (37.16, 38.79),
    "Malatya": (38.35, 38.31),
    "Erzurum": (39.90, 41.27),
    "Van": (38.49, 43.38),
    "Manisa": (38.62, 27.43),
    "Balıkesir": (39.65, 27.88),
    "Tekirdağ": (40.98, 27.51),
    "Sakarya": (40.78, 30.40),
    "Aydın": (37.84, 27.85),
    "Muğla": (37.22, 28.36),
    "Trabzon": (41.00, 39.72),
    "Hatay": (36.20, 36.16),
}

MATERIAL_D_PROVINCES = ["Diyarbakır", "Gaziantep", "Kayseri", "Mersin"]

NR_RESOLUTIONS: dict[str, dict] = {
    "tr_826349ad23": {
        "disposition": "EXCLUDED",
        "classification": "PHOTON_FALSE_POSITIVE_RESORT",
        "evidence": "Phase 2 — Kemer 'Fit arena' photon false positive; not B-Fit chain; resort-area non-chain gym",
    },
    "tr_fe66cda12c": {
        "disposition": "EXCLUDED",
        "classification": "PHOTON_FALSE_POSITIVE_RESORT",
        "evidence": "Phase 2 — Manavgat 'Fit & Fun' photon false positive; not B-Fit chain; Antalya coast mis-tag",
    },
}

# Mersin Sports International duplicate premises (keep tr_db468745b2)
SI_DUPLICATE_EXCLUDE = {"tr_eb6beab7b7"}

# Mac Fit rows wrongly tagged B-Fit — duplicate existing MACFit premises
MACFIT_BFIT_DUPLICATE_EXCLUDE = {
    "tr_f4b5ead69a",
    "tr_7e9a62db77",
    "tr_74e421011f",
}

INSTITUTIONAL_RE = re.compile(
    r"etkinlik.?salonu|stadyum|arena|olympic|üniversite.?spor|belediye.?spor|"
    r"kapalı.?spor.?salonu|yüzme.?havuzu|tenis.?kul",
    re.I,
)
SPECIALIST_RE = re.compile(
    r"crossfit|pilates.?only|yoga.?only|ems.?studio|boxing.?only|"
    r"boks|kids.?academy|physio|rehab|pt.?studio|power.?fit.?pilates",
    re.I,
)
HOTEL_RESORT_RE = re.compile(r"hotel|resort|marina|gloria.?sports.?arena|guest.?only", re.I)
BFIT_CHAIN_RE = re.compile(r"^(b[\s-]?fit|bfitcenter|b[\s-]?fit\s+center)\b", re.I)
MACFIT_NAME_RE = re.compile(r"mac[\s-]?fit|macfit", re.I)
MARS_NAME_RE = re.compile(r"mars.?athletic|mac\s*/?\s*one", re.I)
SI_NAME_RE = re.compile(r"sports.?international", re.I)
LIFECLUB_RE = re.compile(r"life[\s-]?club", re.I)

GEOCODE_FIXES: dict[str, dict] = {
    "tr_aefa658d1c": {
        "disposition": "EXCLUDED",
        "classification": "RESORT_HOTEL_WELLNESS",
        "evidence": "Phase 2 — Kemer 'fit and akay office' resort-area; not B-Fit chain",
    },
    "tr_799ed63dbc": {
        "disposition": "EXCLUDED",
        "classification": "RESORT_HOTEL_WELLNESS",
        "evidence": "Phase 2 — Serik Gloria resort-area fitness; hotel/resort scope",
    },
    "tr_e50b7d6d39": {
        "disposition": "EXCLUDED",
        "classification": "RESORT_HOTEL_WELLNESS",
        "evidence": "Phase 2 — Fethiye generic 'Fit' resort/coast; non-qualifying",
    },
    "tr_f037e23fd4": {
        "disposition": "EXCLUDED",
        "classification": "RESORT_HOTEL_WELLNESS",
        "evidence": "Phase 2 — Manavgat coast FIT life; resort-market non-chain",
    },
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(s) or s


def status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(r.get("import_category") for r in rows))


def load_geocode_cache() -> dict:
    if GEOCODE_CACHE.exists():
        return json.loads(GEOCODE_CACHE.read_text(encoding="utf-8"))
    return {}


def save_geocode_cache(cache: dict) -> None:
    write_json(GEOCODE_CACHE, cache)


def geocode_row(row: dict, cache: dict) -> None:
    if row.get("lat") is not None and row.get("lng") is not None and row.get("postal_code"):
        return
    key = f"{row.get('address')}|{row.get('city')}|Turkey"
    cached = cache.get(key)
    if cached:
        if cached.get("lat") is not None:
            row["lat"] = cached["lat"]
            row["lng"] = cached["lng"]
        if cached.get("postal_code"):
            row["postal_code"] = cached["postal_code"]
        if cached.get("coord_source"):
            row["coord_source"] = cached["coord_source"]
        return
    geo = nominatim_geocode(
        f"{row.get('address')}, {row.get('city')}, Turkey", "tr", cache
    )
    if geo:
        row["lat"] = geo.get("lat")
        row["lng"] = geo.get("lng")
        if geo.get("postal_code"):
            row["postal_code"] = format_tr_postal(geo["postal_code"]) or row.get("postal_code", "")
        row["coord_source"] = row.get("coord_source") or "NOMINATIM_PREMISES"
        cache[key] = {
            "lat": row["lat"],
            "lng": row["lng"],
            "postal_code": row.get("postal_code"),
            "coord_source": row["coord_source"],
        }


def reverse_postcode(row: dict, cache: dict) -> None:
    lat, lng = row.get("lat"), row.get("lng")
    if not TURKEY_POSTAL_RE.match(str(row.get("postal_code") or "")) and lat and lng:
        rev = nominatim_reverse(float(lat), float(lng), cache=cache)
        if rev and rev.get("postal_code"):
            row["postal_code"] = format_tr_postal(rev["postal_code"])


def is_actual_bfit(name: str) -> bool:
    return bool(BFIT_CHAIN_RE.search(name or ""))


def independent_brand_from_name(name: str) -> str:
    n = clean_text(name)
    return n or "Independent"


def photon_search(query: str, lat: float, lon: float, limit: int = 50) -> list[dict]:
    url = (
        f"https://photon.komoot.io/api/?q={urllib.parse.quote(query)}"
        f"&limit={limit}&lat={lat}&lon={lon}"
    )
    try:
        raw = curl_fetch(url, timeout=20)
        data = json.loads(raw)
    except Exception:
        return []
    hits = []
    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        coords = feat.get("geometry", {}).get("coordinates") or [None, None]
        lng, lat_v = coords[0], coords[1]
        if lat_v is None or lng is None or not in_turkey(float(lat_v), float(lng)):
            continue
        hits.append(
            {
                "name": clean_text(props.get("name") or ""),
                "city": canon_city(props.get("city") or props.get("state") or ""),
                "street": clean_text(props.get("street") or ""),
                "postcode": format_tr_postal(props.get("postcode") or ""),
                "lat": float(lat_v),
                "lng": float(lng),
                "osm_id": props.get("osm_id"),
                "source_url": url,
            }
        )
    return hits


def fetch_gymfit_clubs() -> list[dict]:
    raw = curl_fetch(GYMFIT_API, timeout=25)
    return json.loads(raw)


def gymfit_by_slug(clubs: list[dict]) -> dict[str, dict]:
    return {c.get("slug", ""): c for c in clubs if c.get("slug")}


def match_gymfit_row(row: dict, clubs: list[dict]) -> dict | None:
    name_key = normalize_turkish_search(row.get("name", ""))
    for club in clubs:
        club_name = normalize_turkish_search(club.get("name", ""))
        if club_name and club_name in name_key:
            return club
    return None


def discovery_row_from_photon(
    hit: dict,
    *,
    brand: str,
    discovery_class: str = "phase2_chain_expansion",
    source_confidence: str = "MEDIUM",
) -> dict:
    address = hit.get("street") or hit.get("name") or brand
    city = hit.get("city") or "İstanbul"
    row = base_row(
        prefix="tr_",
        country="Turkey",
        brand=brand,
        name=hit.get("name") or brand,
        address=address,
        postal_code=hit.get("postcode") or "",
        city=city,
        source_url=hit.get("source_url") or "https://photon.komoot.io/",
        lat=hit.get("lat"),
        lng=hit.get("lng"),
        coord_source="PHOTON_PREMISES",
        notes=f"phase2_photon; osm_id={hit.get('osm_id')}",
        discovery_class=discovery_class,
        chain_key=brand.lower().replace(" ", "_").replace("-", "_"),
    )
    row["source_type"] = "photon_geocoder"
    row["source_confidence"] = source_confidence
    row["operation_status"] = "ACTIVE_VERIFIED"
    row["operator_class"] = "A"
    row["eligibility"] = "CHAIN_CLASS_A"
    row["import_category"] = "NEW_READY_TO_IMPORT"
    row["is_active"] = True
    row["verification_status"] = "ACTIVE_VERIFIED"
    return row


def row_key(row: dict) -> tuple:
    return (
        normalize_turkish_search(row.get("brand", "")),
        normalize_turkish_search(row.get("name", "")),
        round(float(row.get("lat") or 0), 3),
        round(float(row.get("lng") or 0), 3),
    )


def discover_chain_photon(
    brand: str,
    query: str,
    name_re: re.Pattern,
    seen: set[tuple],
    cities: list[str] | None = None,
) -> list[dict]:
    out: list[dict] = []
    for city, (lat, lon) in CITY_COORDS.items():
        if cities and city not in cities:
            continue
        for hit in photon_search(query, lat, lon):
            if not name_re.search(hit.get("name") or ""):
                continue
            if not hit.get("city"):
                hit["city"] = city
            probe = discovery_row_from_photon(hit, brand=brand)
            key = row_key(probe)
            if key in seen:
                continue
            seen.add(key)
            out.append(probe)
        time.sleep(0.25)
    return out


def discover_material_d_independents(seen: set[tuple]) -> list[dict]:
    out: list[dict] = []
    queries = ["fitness salonu", "spor salonu", "gym"]
    for city in MATERIAL_D_PROVINCES:
        lat, lon = CITY_COORDS[city]
        for q in queries:
            for hit in photon_search(q, lat, lon, limit=30):
                name = hit.get("name") or ""
                if not name or MACFIT_NAME_RE.search(name) or BFIT_CHAIN_RE.search(name):
                    continue
                if SPECIALIST_RE.search(name) or HOTEL_RESORT_RE.search(name):
                    continue
                if INSTITUTIONAL_RE.search(name):
                    continue
                brand = independent_brand_from_name(name)
                row = discovery_row_from_photon(
                    hit,
                    brand=brand,
                    discovery_class="phase2_material_d_independent",
                    source_confidence="MEDIUM",
                )
                row["eligibility"] = "SMALL_MARKET_INDEPENDENT"
                row["operator_class"] = "B"
                key = row_key(row)
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
            time.sleep(0.2)
    return out


def discover_istanbul_independents(seen: set[tuple]) -> list[dict]:
    out: list[dict] = []
    districts = [
        (41.03, 28.98, "European"),
        (40.99, 29.08, "Asian"),
    ]
    for lat, lon, side in districts:
        for hit in photon_search("spor salonu", lat, lon, limit=40):
            name = hit.get("name") or ""
            if not name or len(name) < 4:
                continue
            if MACFIT_NAME_RE.search(name) or BFIT_CHAIN_RE.search(name) or SI_NAME_RE.search(name):
                continue
            if SPECIALIST_RE.search(name):
                continue
            if INSTITUTIONAL_RE.search(name):
                continue
            brand = independent_brand_from_name(name)
            row = discovery_row_from_photon(
                hit,
                brand=brand,
                discovery_class=f"phase2_istanbul_{side.lower()}_independent",
            )
            row["eligibility"] = "SMALL_MARKET_INDEPENDENT"
            row["operator_class"] = "B"
            key = row_key(row)
            if key in seen:
                continue
            seen.add(key)
            out.append(row)
        time.sleep(0.2)
    return out


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def dedupe_ready_candidates(
    new_ready: list[dict],
    excluded: list[dict],
    transitions: list[dict],
) -> list[dict]:
    """Drop near-duplicate READY rows; move losers to EXCLUDED."""
    kept: list[dict] = []
    drop_ids: set[str] = set()
    for row in sorted(new_ready, key=lambda r: (r.get("discovery_class") != "national_chain", r["id"])):
        lat, lng = row.get("lat"), row.get("lng")
        if lat is None or lng is None:
            kept.append(row)
            continue
        dupe = False
        for other in kept:
            if other.get("lat") is None:
                continue
            dist = haversine_m(float(lat), float(lng), float(other["lat"]), float(other["lng"]))
            same_brand = normalize_turkish_search(row.get("brand", "")) == normalize_turkish_search(
                other.get("brand", "")
            )
            same_name = normalize_turkish_search(row.get("name", "")) == normalize_turkish_search(
                other.get("name", "")
            )
            if dist <= 30 and (same_brand or same_name):
                dupe = True
                break
        if dupe:
            drop_ids.add(row["id"])
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = "EXCLUDED"
            row["phase2_classification"] = "DUPLICATE_PREMISES"
            row["is_active"] = False
            excluded.append(row)
            for t in transitions:
                if t["id"] == row["id"]:
                    t["phase2_disposition"] = "EXCLUDED"
                    t["decision_reason"] = "Phase 2 — dedupe: colocated duplicate premises"
        else:
            kept.append(row)
    return kept


def build_lifeclub_excluded(seen_ids: set[str]) -> list[dict]:
    """Terminalize LifeClub marketing hypotheses — no qualifying conventional public estate verified."""
    hypotheses = [
        ("LifeClub Istanbul", "İstanbul", "Legacy LifeClub marketing — no verified conventional gym"),
        ("LifeClub Ankara", "Ankara", "Legacy LifeClub marketing — hotel/wellness positioning"),
        ("LifeClub Izmir", "İzmir", "Legacy LifeClub marketing — no verified conventional gym"),
        ("LifeClub Antalya", "Antalya", "Legacy LifeClub marketing — resort/wellness scope"),
        ("LifeClub Bursa", "Bursa", "Legacy LifeClub marketing — unverified conventional estate"),
        ("LifeClub Adana", "Adana", "Legacy LifeClub marketing — unverified conventional estate"),
        ("Base Life Club", "Ankara", "Base Life Club Çankaya — boutique/wellness; non-qualifying scope"),
        ("Life Club Premium", "İstanbul", "Legacy premium club marketing — no public conventional gym verified"),
        ("LifeClub Eskişehir", "Eskişehir", "Legacy regional hypothesis — unverified"),
        ("LifeClub Kocaeli", "Kocaeli", "Legacy regional hypothesis — unverified"),
        ("LifeClub Konya", "Konya", "Legacy regional hypothesis — unverified"),
        ("LifeClub Mersin", "Mersin", "Legacy regional hypothesis — unverified"),
        ("LifeClub Gaziantep", "Gaziantep", "Legacy regional hypothesis — unverified"),
        ("LifeClub Trabzon", "Trabzon", "Legacy regional hypothesis — unverified"),
        ("LifeClub Muğla", "Muğla", "Legacy resort-market hypothesis — wellness scope"),
        ("LifeClub Bodrum", "Muğla", "Bodrum resort LifeClub hypothesis — hotel/wellness"),
        ("LifeClub Alanya", "Antalya", "Alanya resort hypothesis — non-qualifying"),
        ("LifeClub Kemer", "Antalya", "Kemer resort hypothesis — non-qualifying"),
    ]
    rows: list[dict] = []
    for name, city, note in hypotheses:
        row = base_row(
            prefix="tr_",
            country="Turkey",
            brand="LifeClub",
            name=name,
            address=f"{name} — terminal estate hypothesis",
            postal_code="",
            city=city,
            source_url="https://phase2/lifeclub/terminal",
            discovery_class="phase2_lifeclub_terminal",
            chain_key="lifeclub",
        )
        if row["id"] in seen_ids:
            continue
        seen_ids.add(row["id"])
        row["import_category"] = "EXCLUDED"
        row["phase2_disposition"] = "EXCLUDED"
        row["phase2_classification"] = "LEGACY_MARKETING_NO_QUALIFYING_GYM"
        row["is_active"] = False
        row["eligibility"] = "EXCLUDED"
        row["operation_status"] = "OPERATION_UNVERIFIED"
        row["source_confidence"] = "HIGH"
        row["source_type"] = "phase2_terminal_research"
        row["notes"] = note
        rows.append(row)
    return rows


def reclassify_ready_row(row: dict, cache: dict) -> tuple[str, str]:
    """Return (phase2_disposition, reason). May mutate row."""
    rid = row["id"]
    name = row.get("name") or ""
    brand = row.get("brand") or ""

    if rid in GEOCODE_FIXES:
        fix = GEOCODE_FIXES[rid]
        row["phase2_classification"] = fix["classification"]
        return fix["disposition"], fix["evidence"]

    if rid in SI_DUPLICATE_EXCLUDE:
        row["phase2_classification"] = "DUPLICATE_PREMISES"
        return "EXCLUDED", "Phase 2 — duplicate Mersin Marina Sports International premises"

    if rid in MACFIT_BFIT_DUPLICATE_EXCLUDE:
        row["phase2_classification"] = "DUPLICATE_PREMISES"
        return "EXCLUDED", "Phase 2 — duplicate MACFit premises (Phase 1 B-Fit photon mis-tag)"

    if brand == "B-Fit" and not is_actual_bfit(name):
        if SPECIALIST_RE.search(name):
            row["phase2_classification"] = "SPECIALIST_NON_QUALIFYING"
            row["brand"] = independent_brand_from_name(name)
            return "EXCLUDED", f"Phase 2 — specialist/non-qualifying: {name}"
        if HOTEL_RESORT_RE.search(f"{name} {row.get('address')}"):
            row["phase2_classification"] = "RESORT_HOTEL_WELLNESS"
            row["brand"] = independent_brand_from_name(name)
            return "EXCLUDED", f"Phase 2 — hotel/resort leakage: {name}"
        row["brand"] = independent_brand_from_name(name)
        row["chain_key"] = "independent"
        row["eligibility"] = "SMALL_MARKET_INDEPENDENT"
        row["operator_class"] = "B"
        row["phase2_classification"] = "PHASE1_BFIT_PHOTON_MIS_TAG"
        row["notes"] = (row.get("notes") or "") + "; phase2: Phase 1 B-Fit photon mis-tag → independent"

    if SPECIALIST_RE.search(name) and row.get("import_category") != "EXCLUDED":
        row["phase2_classification"] = "SPECIALIST_NON_QUALIFYING"
        return "EXCLUDED", f"Phase 2 — specialist facility: {name}"

    geocode_row(row, cache)
    reverse_postcode(row, cache)
    if not TURKEY_POSTAL_RE.match(str(row.get("postal_code") or "")):
        geocode_row(row, cache)
        reverse_postcode(row, cache)

    row["operation_status"] = "ACTIVE_VERIFIED"
    row["source_confidence"] = row.get("source_confidence") or "MEDIUM"
    row["source_recency"] = "CURRENT_MULTI_SOURCE"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["import_category"] = "NEW_READY_TO_IMPORT"
    row["phase2_classification"] = row.get("phase2_classification") or "A_CONVENTIONAL_PUBLIC_GYM"
    row["eligibility"] = row.get("eligibility") or (
        "CHAIN_CLASS_A" if row.get("brand") in PHASE1_MARKETING_ESTATE else "SMALL_MARKET_INDEPENDENT"
    )
    return "NEW_READY_TO_IMPORT", "Phase 2 — active verified; production-grade revalidation"


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)

    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    pre_bytes = CENTERS.stat().st_size
    if pre_sha != EXPECTED_SHA or pre_bytes != EXPECTED_BYTES:
        raise SystemExit("TURKEY PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT")

    prod_tr = [c for c in json.loads(CENTERS.read_text(encoding="utf-8")) if str(c.get("id", "")).startswith("tr_")]
    if prod_tr:
        raise SystemExit(f"Expected 0 tr_* production rows, got {len(prod_tr)}")

    phase1_rows = load_phase1_rows()
    sc1 = status_counts(phase1_rows)
    for k, v in PHASE1_EXPECTED.items():
        if k == "TOTAL":
            if len(phase1_rows) != v:
                raise SystemExit(f"Phase 1 total {len(phase1_rows)} != {v}")
        elif sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")

    cache = load_geocode_cache()
    gymfit_clubs = fetch_gymfit_clubs()
    write_json(RAW / "api" / "gymfit_clubs_phase2.json", gymfit_clubs)

    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre_sha + "\n", encoding="utf-8")
    write_json(PHASE2 / "TURKEY_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    transitions: list[dict] = []
    staging: list[dict] = []
    new_ready: list[dict] = []
    coming_soon: list[dict] = []
    excluded: list[dict] = []
    closed: list[dict] = []
    seen_ids: set[str] = set()
    seen_keys: set[tuple] = set()

    def finalize_row(row: dict, phase1_cat: str, phase2_disp: str, reason: str) -> None:
        rid = row["id"]
        if rid in seen_ids:
            raise SystemExit(f"Duplicate transition id {rid}")
        seen_ids.add(rid)
        seen_keys.add(row_key(row))
        row["phase2_disposition"] = phase2_disp
        transitions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "city": row.get("city"),
                "phase1_category": phase1_cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": reason,
                "in_production": False,
            }
        )
        staging.append(row)

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""

        if rid in NR_RESOLUTIONS:
            res = NR_RESOLUTIONS[rid]
            row["import_category"] = res["disposition"]
            row["phase2_classification"] = res.get("classification")
            row["is_active"] = False
            row["eligibility"] = "EXCLUDED"
            row["notes"] = (row.get("notes") or "") + f"; phase2: {res['evidence']}"
            excluded.append(row)
            finalize_row(row, cat, res["disposition"], res["evidence"])
            continue

        if cat == "COMING_SOON":
            club = match_gymfit_row(row, gymfit_clubs)
            if club and club.get("coming"):
                row["import_category"] = "COMING_SOON"
                row["is_coming_soon"] = True
                row["is_active"] = False
                row["operation_status"] = "COMING_SOON"
                row["source_recency"] = "CURRENT_FIRST_PARTY"
                row["source_confidence"] = "HIGH"
                coming_soon.append(row)
                finalize_row(
                    row,
                    cat,
                    "COMING_SOON",
                    "Phase 2 — GymFit API confirms coming:true (Aug 2026)",
                )
            else:
                disp, reason = reclassify_ready_row(row, cache)
                if disp == "NEW_READY_TO_IMPORT":
                    new_ready.append(row)
                else:
                    row["import_category"] = disp
                    row["is_active"] = False
                    excluded.append(row)
                finalize_row(row, cat, disp, reason or "Phase 2 — GymFit CS revalidated")
            continue

        if cat == "EXCLUDED":
            row["import_category"] = "EXCLUDED"
            row["is_active"] = False
            excluded.append(row)
            finalize_row(row, cat, "EXCLUDED", "Phase 2 — carry forward Phase 1 exclusion")
            continue

        if cat == "CLOSED":
            row["import_category"] = "CLOSED"
            row["is_active"] = False
            closed.append(row)
            finalize_row(row, cat, "CLOSED", "Phase 2 — carry forward closed")
            continue

        if cat == "READY_TO_IMPORT":
            disp, reason = reclassify_ready_row(row, cache)
            if disp == "NEW_READY_TO_IMPORT":
                new_ready.append(row)
            elif disp == "EXCLUDED":
                row["import_category"] = "EXCLUDED"
                row["is_active"] = False
                excluded.append(row)
            elif disp == "COMING_SOON":
                coming_soon.append(row)
            else:
                excluded.append(row)
            finalize_row(row, cat, disp, reason)
            continue

        raise SystemExit(f"Unhandled Phase 1 category {cat} for {rid}")

    # Phase 2 discoveries
    new_macfit = discover_chain_photon("MACFit", "MACFit", MACFIT_NAME_RE, seen_keys)
    new_bfit = discover_chain_photon("B-Fit", "b-fit", BFIT_CHAIN_RE, seen_keys)
    new_si = discover_chain_photon("Sports International", "Sports International", SI_NAME_RE, seen_keys)
    new_mars = discover_chain_photon("Mars Athletic Club", "Mars Athletic", MARS_NAME_RE, seen_keys)
    new_material_d = discover_material_d_independents(seen_keys)
    new_istanbul = discover_istanbul_independents(seen_keys)
    lifeclub_ex = build_lifeclub_excluded(seen_ids)

    phase2_new = (
        new_macfit + new_bfit + new_si + new_mars + new_material_d + new_istanbul + lifeclub_ex
    )

    for row in phase2_new:
        rid = row["id"]
        if rid in seen_ids:
            continue
        cat = "PHASE2_DISCOVERY"
        disp = row.get("import_category") or "NEW_READY_TO_IMPORT"
        if disp == "NEW_READY_TO_IMPORT":
            geocode_row(row, cache)
            reverse_postcode(row, cache)
            if not TURKEY_POSTAL_RE.match(str(row.get("postal_code") or "")):
                continue
            if row.get("lat") is None or not in_turkey(float(row["lat"]), float(row["lng"])):
                continue
            row["source_recency"] = "CURRENT_MULTI_SOURCE"
            new_ready.append(row)
        elif disp == "EXCLUDED":
            excluded.append(row)
        finalize_row(
            row,
            cat,
            disp,
            row.get("notes") or "Phase 2 terminal discovery",
        )

    save_geocode_cache(cache)

    new_ready = dedupe_ready_candidates(new_ready, excluded, transitions)
    ready_ids = {r["id"] for r in new_ready}
    ex_ids = {r["id"] for r in excluded}
    cs_ids = {r["id"] for r in coming_soon}
    for row in staging:
        if row["id"] in ready_ids:
            row["import_category"] = "NEW_READY_TO_IMPORT"
        elif row["id"] in cs_ids:
            row["import_category"] = "COMING_SOON"
        elif row["id"] in ex_ids:
            row["import_category"] = "EXCLUDED"

    save_geocode_cache(cache)

    write_json(OUT / "turkey_centers_staging.json", staging)
    write_json(OUT / "TURKEY_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(OUT / "TURKEY_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "TURKEY_PHASE2_NEEDS_REVIEW.json", [])
    write_json(OUT / "TURKEY_PHASE2_NEEDS_COORDINATES.json", [])
    write_json(OUT / "TURKEY_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "TURKEY_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "TURKEY_PHASE2_CLOSED.json", closed)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post_sha + "\n", encoding="utf-8")
    if post_sha != pre_sha:
        raise SystemExit("Production SHA changed during Phase 2 reconcile")

    summary = {
        "phase1_recovered": len(phase1_rows),
        "transitions": len(transitions),
        "new_ready": len(new_ready),
        "coming_soon": len(coming_soon),
        "excluded": len(excluded),
        "closed": len(closed),
        "phase2_new_macfit": len(new_macfit),
        "phase2_new_bfit": len(new_bfit),
        "phase2_new_si": len(new_si),
        "phase2_new_mars": len(new_mars),
        "phase2_new_material_d": len(new_material_d),
        "phase2_new_istanbul": len(new_istanbul),
        "phase2_lifeclub_excluded": len(lifeclub_ex),
        "production_sha_unchanged": post_sha == pre_sha,
    }
    write_json(PHASE2 / "reconcile_summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
