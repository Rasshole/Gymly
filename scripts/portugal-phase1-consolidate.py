#!/usr/bin/env python3
"""
Portugal Phase 1 consolidate — validate, geocode, dedupe, export staging + reports.
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
OUT = ROOT / "data/portugal"
CENTERS = ROOT / "src/data/centers.json"
CANDIDATES = OUT / "portugal_phase1_candidates.json"
CACHE_PATH = OUT / "portugal_geocode_cache.json"
INVENTORY = OUT / "portugal_chain_inventory.json"

PT_POSTAL_RE = re.compile(r"^\d{4}-\d{3}$")
# True mojibake sequences (do NOT flag Portuguese ÃO in ÃO/ÃO as mojibake)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
PRODUCTION_TOTAL = 10525

ctx = ssl.create_default_context()
UA = {"User-Agent": "GymlyPortugalPhase1/1.0 (catalog research)"}

# Approximate regional buckets for coverage report
LISBON_METRO = {
    "lisboa",
    "lisbon",
    "amadora",
    "oeiras",
    "cascais",
    "sintra",
    "loures",
    "odivelas",
    "almada",
    "seixal",
    "alfragide",
    "miraflores",
    "carcavelos",
    "montijo",
    "barreira",
    "barreiro",
    "moita",
    "corroios",
    "alcochete",
    "pontinha",
    "mem martins",
    "mem-martins",
    "tapada das mercês",
    "tapada das merces",
    "beloura",
    "quinta da beloura",
    "alverca",
    "vila franca",
}
PORTO_METRO = {
    "porto",
    "vila nova de gaia",
    "gaia",
    "matosinhos",
    "maia",
    "gondomar",
    "valongo",
    "rio tinto",
    "leça",
    "leca",
    "grijo",
    "grijó",
    "ermesinde",
    "são mamede",
    "sao mamede",
    "s mamede",
}
MADEIRA = {"funchal", "caniço", "canico", "santa catarina", "câmara de lobos", "camara de lobos"}
AZORES = {"ponta delgada", "angra do heroísmo", "angra do heroismo", "angra", "horta", "açores", "acores", "azores"}


def in_portugal(lat: float, lng: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    # Mainland
    if 36.9 <= lat <= 42.2 and -9.6 <= lng <= -6.15:
        return True
    # Madeira
    if 32.35 <= lat <= 33.2 and -17.35 <= lng <= -16.2:
        return True
    # Azores
    if 36.85 <= lat <= 39.8 and -31.35 <= lng <= -24.9:
        return True
    return False


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def norm_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def region_of(r: dict) -> str:
    city = (r.get("city") or "").lower()
    lat = r.get("lat")
    lng = r.get("lng")
    blob = f"{city} {r.get('address') or ''} {r.get('name') or ''}".lower()
    # São João da Madeira is mainland (Aveiro district), not Madeira island
    if "são joão da madeira" in blob or "sao joao da madeira" in blob:
        return "North"
    if any(x in blob for x in MADEIRA) or (isinstance(lat, float) and 32.35 <= lat <= 33.2):
        return "Madeira"
    if any(x in blob for x in AZORES) or (isinstance(lat, float) and isinstance(lng, float) and lng < -24):
        return "Azores"
    if any(x in city for x in LISBON_METRO) or any(x in blob for x in ("lisboa", "oeiras", "cascais", "almada")):
        return "Lisbon metro"
    if any(x in city for x in PORTO_METRO) or any(x in blob for x in ("porto", "gaia", "matosinhos", "maia")):
        return "Porto metro"
    if isinstance(lat, float):
        if lat >= 40.5:
            return "North"
        if lat >= 39.0:
            return "Central"
        if lat >= 37.5:
            return "Alentejo"
        if lat < 37.5:
            return "Algarve"
    # city heuristics
    if any(x in blob for x in ("faro", "portimão", "portimao", "olhão", "olhao", "algarve", "lagos")):
        return "Algarve"
    if any(x in blob for x in ("évora", "evora", "beja", "portalegre", "sines")):
        return "Alentejo"
    if any(x in blob for x in ("coimbra", "leiria", "aveiro", "viseu", "guarda", "castelo branco")):
        return "Central"
    if any(x in blob for x in ("braga", "guimarães", "guimaraes", "viana", "vila real", "chaves", "bragança")):
        return "North"
    return "Other/unknown"


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
        r["is_active"] = r.get("import_category") not in ("CLOSED", "DUPLICATE", "LEGACY")
        if r["import_category"] == "COMING_SOON":
            r["is_active"] = False
        return r

    reasons = []
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address") or len(str(r["address"])) < 4:
        reasons.append("missing_address")
    if not PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city"):
        reasons.append("missing_city")
    if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}"):
        reasons.append("mojibake")

    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None

    if lat_f is None or lng_f is None or not (math.isfinite(lat_f) and math.isfinite(lng_f)):
        reasons.append("missing_coords")
    elif not in_portugal(lat_f, lng_f):
        reasons.append("foreign_coords")

    notes = r.get("notes") or ""
    if "missing_coords" in reasons and len([x for x in reasons if x != "missing_coords"]) == 0:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["is_active"] = True
        r["country"] = "Portugal"
        return r

    hard = [x for x in reasons if x != "missing_coords"]
    if hard or "missing_coords" in reasons:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = (notes + f"; classify={','.join(reasons)}").strip("; ")
        r["is_active"] = True
        r["country"] = "Portugal"
        return r

    r["import_category"] = "READY_TO_IMPORT"
    r["verification_status"] = "VERIFIED_CURRENT"
    r["is_active"] = True
    r["country"] = "Portugal"
    r["lat"] = lat_f
    r["lng"] = lng_f
    return r


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_pt_postal(pc: str) -> str:
    pc = (pc or "").strip().replace("–", "-").replace("—", "-")
    pc = re.sub(r"\s*-\s*", "-", pc)
    if re.fullmatch(r"\d{7}", pc):
        return f"{pc[:4]}-{pc[4:]}"
    if re.fullmatch(r"\d{4}-\d{3}", pc):
        return pc
    return ""


def reverse_postal(lat: float, lng: float, cache: dict) -> str:
    key = f"rev:{lat:.6f},{lng:.6f}"
    if key in cache:
        hit = cache[key]
        return (hit or {}).get("postal_code") or ""
    params = urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "json", "addressdetails": 1, "zoom": 18}
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[key] = None
        return ""
    time.sleep(1.05)
    addr = data.get("address") or {}
    pc = normalize_pt_postal(str(addr.get("postcode") or ""))
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "pt":
        cache[key] = None
        return ""
    cache[key] = {"postal_code": pc, "display": data.get("display_name")}
    return pc


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Portugal"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
        return None, None, ""

    params = urllib.parse.urlencode(
        {
            "q": q,
            "format": "json",
            "limit": 1,
            "countrycodes": "pt",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[q] = None
        return None, None, ""
    time.sleep(1.05)

    if not data:
        cache[q] = None
        return None, None, ""

    hit = data[0]
    lat, lng = float(hit["lat"]), float(hit["lon"])
    addr = hit.get("address") or {}
    pc = normalize_pt_postal(str(addr.get("postcode") or ""))
    if postal and pc and pc != postal:
        # allow if city token matches
        blob = json.dumps(addr, ensure_ascii=False).lower()
        city_ok = bool(city) and (city.lower()[:4] in blob or any(t in blob for t in city.lower().split() if len(t) > 3))
        if not city_ok:
            cache[q] = None
            return None, None, ""

    cc = (addr.get("country_code") or "").lower()
    if cc and cc not in ("pt",):
        cache[q] = None
        return None, None, ""

    if not in_portugal(lat, lng):
        cache[q] = None
        return None, None, ""

    cache[q] = {
        "lat": lat,
        "lng": lng,
        "source": "STRICT_ADDRESS_GEOCODE",
        "display": hit.get("display_name"),
        "postal_code": pc,
    }
    return lat, lng, "STRICT_ADDRESS_GEOCODE"


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id: dict[str, dict] = {}
    by_addr: dict[str, dict] = {}
    duplicate_analysis: list[dict] = []

    def score(r: dict) -> tuple:
        cat = r.get("import_category") or ""
        pri = {
            "READY_TO_IMPORT": 5,
            "NEEDS_COORDINATES": 4,
            "NEEDS_REVIEW": 3,
            "COMING_SOON": 2,
            "CLOSED": 1,
            "DUPLICATE": 0,
            "LEGACY": 0,
        }.get(cat, 0)
        has_coords = 1 if r.get("lat") is not None else 0
        return (pri, has_coords)

    for r in rows:
        rid = r["id"]
        addr_key = "|".join(
            [
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
                str(r.get("postal_code") or ""),
                norm_addr(r.get("city") or ""),
            ]
        )
        if rid in by_id:
            duplicate_analysis.append(
                {
                    "a": by_id[rid]["id"],
                    "b": rid,
                    "brand": r.get("brand"),
                    "reason": "duplicate_id",
                    "decision": "keep_higher_score",
                }
            )
            if score(r) > score(by_id[rid]):
                by_id[rid] = r
            continue
        if addr_key in by_addr and addr_key.replace("|||", "").strip("|"):
            existing = by_addr[addr_key]
            if (existing.get("brand") or "").lower() == (r.get("brand") or "").lower():
                duplicate_analysis.append(
                    {
                        "a": existing["id"],
                        "b": rid,
                        "brand": r.get("brand"),
                        "reason": "same_brand_normalized_address",
                        "decision": "mark_duplicate_keep_better",
                    }
                )
                if score(r) > score(existing):
                    existing["import_category"] = "DUPLICATE"
                    existing["notes"] = (existing.get("notes") or "") + "; superseded_by_better_row"
                    by_id.pop(existing["id"], None)
                    by_id[rid] = r
                    by_addr[addr_key] = r
                else:
                    r["import_category"] = "DUPLICATE"
                    r["notes"] = (r.get("notes") or "") + "; duplicate_of=" + existing["id"]
                    by_id[rid] = r
                continue
        by_id[rid] = r
        if addr_key.strip("|"):
            by_addr[addr_key] = r

    # proximity duplicates same brand
    with_coords = [r for r in by_id.values() if r.get("lat") is not None and r.get("lng") is not None]
    for i, a in enumerate(with_coords):
        if a.get("import_category") in ("DUPLICATE", "CLOSED", "LEGACY"):
            continue
        for b in with_coords[i + 1 :]:
            if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            if b.get("import_category") in ("DUPLICATE", "CLOSED", "LEGACY"):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 25:
                duplicate_analysis.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "brand": a.get("brand"),
                        "reason": f"same_brand_within_{int(d)}m",
                        "decision": "flag_review_or_duplicate",
                        "distance_m": round(d, 1),
                    }
                )
                # Prefer READY with better address; mark weaker as DUPLICATE only if addresses nearly identical
                if norm_addr(a.get("address") or "") == norm_addr(b.get("address") or ""):
                    weaker = a if score(a) < score(b) else b
                    weaker["import_category"] = "DUPLICATE"
                    weaker["notes"] = (weaker.get("notes") or "") + f"; proximity_dup_{int(d)}m"
            elif d <= 100:
                duplicate_analysis.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "brand": a.get("brand"),
                        "reason": f"same_brand_within_{int(d)}m_ambiguous",
                        "decision": "keep_both_flag",
                        "distance_m": round(d, 1),
                    }
                )

    return list(by_id.values()), duplicate_analysis


def production_stats() -> dict:
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    total = len(centers)
    pt = sum(1 for c in centers if str(c.get("country") or "").lower() in ("portugal", "pt"))
    pt_ids = sum(1 for c in centers if str(c.get("id") or "").startswith("pt_"))
    h = hashlib.sha256(CENTERS.read_bytes()).hexdigest()[:16]
    return {"total": total, "portugal": pt, "pt_ids": pt_ids, "sha256_16": h}


def main():
    if not CANDIDATES.exists():
        raise SystemExit(f"Missing candidates: {CANDIDATES}")

    rows = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    cache = load_cache()
    print(f"candidates: {len(rows)}")

    # Geocode missing coords when address+postal present; reverse-fill postal from official coords
    for i, r in enumerate(rows, 1):
        if r.get("import_category") in ("COMING_SOON", "CLOSED"):
            continue

        # Official coords but missing postal → reverse geocode (postal only; keep official lat/lng)
        if (
            not PT_POSTAL_RE.match(str(r.get("postal_code") or ""))
            and r.get("lat") is not None
            and r.get("lng") is not None
            and r.get("coord_source", "").startswith("OFFICIAL")
        ):
            try:
                pc = reverse_postal(float(r["lat"]), float(r["lng"]), cache)
            except (TypeError, ValueError):
                pc = ""
            if pc:
                r["postal_code"] = pc
                r["notes"] = (r.get("notes") or "") + "; postal_from_reverse_of_official_coords"
                # stable id depends on postal — recompute
                key = "|".join(
                    [
                        (r.get("brand") or "").strip().lower(),
                        (r.get("address") or "").strip().lower(),
                        (r.get("postal_code") or "").strip(),
                        (r.get("city") or "").strip().lower(),
                        "portugal",
                    ]
                )
                r["id"] = "pt_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]

        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if not r.get("address") or not PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
            continue
        lat, lng, src = geocode(r["address"], r["postal_code"], r.get("city") or "", cache)
        if lat is not None:
            r["lat"] = lat
            r["lng"] = lng
            r["coord_source"] = src
        if i % 25 == 0:
            save_cache(cache)
            print(f"  geocode progress {i}/{len(rows)}")
    save_cache(cache)

    # Classify
    rows = [classify(r) for r in rows]
    rows, dup_analysis = dedupe_rows(rows)
    # Re-classify after dup marks
    rows = [classify(r) if r.get("import_category") not in ("DUPLICATE", "LEGACY", "COMING_SOON", "CLOSED") else r for r in rows]

    status_counts = Counter(r.get("import_category") or "UNKNOWN" for r in rows)
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    # Brand breakdown
    brand_ready = Counter(r["brand"] for r in ready)
    brand_all = Counter(r["brand"] for r in rows)

    prod = production_stats()
    assert prod["total"] == PRODUCTION_TOTAL, f"Production total changed: {prod}"
    assert prod["portugal"] == 0 and prod["pt_ids"] == 0

    # Regional coverage (READY)
    regional = Counter(region_of(r) for r in ready)

    # Chain inventory (static + discovery)
    inventory = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production": prod,
        "rebrands": {
            "Fitness Hut": {
                "status": "rebranded",
                "successor": "VivaGym",
                "notes": "Fitness Hut Portugal unified under VivaGym (from late 2024). Stage as VivaGym only. Official: vivagym.com/pt-pt/",
            },
            "Pump Fitness Spirit": {
                "status": "rebranded",
                "successor": "Solinca Light",
                "notes": "Pump clubs rebranded to Solinca Light (~2020). Stage as Solinca Light only.",
            },
            "Virgin Active Portugal": {
                "status": "rebranded",
                "successor": "Holmes Place",
                "notes": "Virgin Active Iberia acquired by Holmes Place (2019).",
            },
        },
        "chains": [
            {
                "brand": "VivaGym",
                "status": "active",
                "official_estimate": "40+",
                "discovered": brand_all.get("VivaGym", 0),
                "ready": brand_ready.get("VivaGym", 0),
                "source": "https://www.vivagym.com/pt-pt/ginasios/",
                "notes": "ex Fitness Hut; PT locale only",
            },
            {
                "brand": "Solinca",
                "status": "active",
                "official_estimate": "~35 sitemap",
                "discovered": brand_all.get("Solinca", 0) + brand_all.get("Solinca Light", 0),
                "ready": brand_ready.get("Solinca", 0) + brand_ready.get("Solinca Light", 0),
                "source": "https://www.solinca.pt/gym-sitemap.xml",
                "notes": "Classic + Light preserved as separate brands",
            },
            {
                "brand": "Fitness UP",
                "status": "active",
                "official_estimate": "70+",
                "discovered": brand_all.get("Fitness UP", 0),
                "ready": brand_ready.get("Fitness UP", 0),
                "source": "https://www.fitnessup.pt/ginasio/*",
            },
            {
                "brand": "Element",
                "status": "active",
                "official_estimate": "~50+",
                "discovered": brand_all.get("Element", 0),
                "ready": brand_ready.get("Element", 0),
                "source": "https://elementgyms.pt/gym-sitemap.xml",
                "notes": "Azores: Angra do Heroísmo",
            },
            {
                "brand": "Fitness Factory",
                "status": "active",
                "official_estimate": "~49",
                "discovered": brand_all.get("Fitness Factory", 0),
                "ready": brand_ready.get("Fitness Factory", 0),
                "source": "https://www.fitnessfactory.pt/clubes",
                "notes": "Madeira + Azores present on locator",
            },
            {
                "brand": "Be-Fit",
                "status": "active",
                "official_estimate": "18-21",
                "discovered": brand_all.get("Be-Fit", 0),
                "ready": brand_ready.get("Be-Fit", 0),
                "source": "https://be-fit.pt/befit/clubes",
                "notes": "Madeira presence",
            },
            {
                "brand": "Holmes Place",
                "status": "active",
                "official_estimate": "~12",
                "discovered": brand_all.get("Holmes Place", 0),
                "ready": brand_ready.get("Holmes Place", 0),
                "source": "https://www.holmesplace.com/pt/pt/clubes",
            },
            {
                "brand": "Supera",
                "status": "active",
                "official_estimate": 6,
                "discovered": brand_all.get("Supera", 0),
                "ready": brand_ready.get("Supera", 0),
                "source": "https://centrosupera.pt/",
                "notes": "Include consumer fitness complexes; exclude ES centrosupera.com",
            },
            {
                "brand": "Anytime Fitness",
                "status": "absent",
                "official_estimate": 0,
                "discovered": 0,
                "ready": 0,
                "notes": "No Portugal in global locator",
            },
            {
                "brand": "Kalorias",
                "status": "active_incomplete",
                "official_estimate": "~7",
                "discovered": 0,
                "ready": 0,
                "notes": "Phase 2 — Wix/JS-heavy locator",
            },
            {
                "brand": "Go Gym",
                "status": "active_incomplete",
                "official_estimate": "~7",
                "discovered": 0,
                "ready": 0,
                "notes": "Phase 2 — gated site",
            },
            {
                "brand": "Pump Fitness Spirit",
                "status": "legacy",
                "official_estimate": 0,
                "discovered": 0,
                "ready": 0,
                "notes": "Rebranded to Solinca Light",
            },
            {
                "brand": "Fitness Hut",
                "status": "legacy",
                "official_estimate": 0,
                "discovered": 0,
                "ready": 0,
                "notes": "Rebranded to VivaGym",
            },
        ],
        "status_counts": dict(status_counts),
        "ready_count": len(ready),
        "regional_ready": dict(regional),
    }

    # QA flags
    qa = {
        "duplicate_ids": 0,
        "same_brand_physical_duplicates": len([d for d in dup_analysis if "within_" in d.get("reason", "")]),
        "invalid_postcodes_ready": sum(1 for r in ready if not PT_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_addresses_ready": sum(1 for r in ready if len(str(r.get("address") or "")) < 4),
        "missing_cities_ready": sum(1 for r in ready if not r.get("city")),
        "missing_coordinates_ready": sum(1 for r in ready if r.get("lat") is None),
        "invalid_coordinates_ready": sum(
            1 for r in ready if r.get("lat") is not None and not in_portugal(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coordinates": sum(
            1 for r in ready if re.search(r"fallback|centroid|city_center|postcode_center", str(r.get("coord_source") or ""), re.I)
        ),
        "foreign_outliers": sum(
            1 for r in rows if r.get("lat") is not None and not in_portugal(float(r["lat"]), float(r["lng"]))
        ),
        "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")),
        "ambiguous_geocodes": len([d for d in dup_analysis if "ambiguous" in d.get("reason", "")]),
    }

    # Phase 2 decision
    incomplete = [
        c
        for c in inventory["chains"]
        if c["status"] == "active_incomplete"
        or (
            c["status"] == "active"
            and c.get("official_estimate")
            and isinstance(c["official_estimate"], (int, float))
            and c["ready"] < 0.5 * float(c["official_estimate"])
            and float(c["official_estimate"]) >= 10
        )
    ]
    # Heuristic: Fitness UP / Element / FF material gaps
    material_gaps = []
    for c in inventory["chains"]:
        if c["brand"] in ("Fitness UP", "Element", "Fitness Factory", "Be-Fit", "VivaGym", "Solinca"):
            est = c.get("official_estimate")
            try:
                if isinstance(est, str):
                    est_n = float(re.sub(r"[^0-9.]", "", est.split("-")[0]) or "0")
                else:
                    est_n = float(est or 0)
            except ValueError:
                est_n = 0
            if est_n >= 15 and c["ready"] < 0.55 * est_n:
                material_gaps.append(c["brand"])

    phase2_required = bool(material_gaps) or any(
        c["brand"] in ("Kalorias", "Go Gym") and c["status"] == "active_incomplete" for c in inventory["chains"]
    )
    # Also require Phase 2 if major chains discovered but READY ratio low overall
    if len(ready) < 120 and brand_all.get("Fitness UP", 0) + brand_all.get("Element", 0) > 80:
        phase2_required = True
        material_gaps.append("coordinate_completion")

    verdict = "PORTUGAL PHASE 2 REQUIRED BEFORE MERGE" if phase2_required else "READY FOR PORTUGAL MERGE"

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase2_required": phase2_required,
        "phase2_reasons": material_gaps
        + (["kalorias_go_gym_incomplete"] if any(c["brand"] in ("Kalorias", "Go Gym") for c in incomplete) else []),
        "production": prod,
        "status_counts": dict(status_counts),
        "ready_count": len(ready),
        "unique_staged": len(rows),
        "brand_ready": dict(brand_ready),
        "brand_all": dict(brand_all),
        "regional_ready": dict(regional),
        "qa": qa,
        "projected_catalog": prod["total"] + len(ready),
        "architecture": {
            "keep_client_side": True,
            "inside_comfort_zone": (prod["total"] + len(ready)) < 12000,
            "global_10k_qa_rerun_required_now": False,
        },
        "madeira_azores": {
            "madeira_ready": regional.get("Madeira", 0),
            "azores_ready": regional.get("Azores", 0),
        },
    }

    # Write artifacts
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "portugal_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "PORTUGAL_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "portugal_duplicate_analysis.json").write_text(
        json.dumps(dup_analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    INVENTORY.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "PORTUGAL_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Markdown report
    md = []
    md.append("# PORTUGAL PHASE 1 READINESS REPORT\n")
    md.append(f"Generated: {report['generated_at']}\n")
    md.append(f"**Verdict:** {verdict}\n")
    md.append("\n## Overall\n")
    md.append(f"- Unique staged: {len(rows)}\n")
    for k in (
        "READY_TO_IMPORT",
        "NEEDS_COORDINATES",
        "NEEDS_REVIEW",
        "COMING_SOON",
        "CLOSED",
        "DUPLICATE",
        "LEGACY",
    ):
        md.append(f"- {k}: {status_counts.get(k, 0)}\n")
    md.append(f"\n- Production total: {prod['total']} (unchanged)\n")
    md.append(f"- Portugal live: {prod['portugal']}\n")
    md.append(f"- Production sha256_16: {prod['sha256_16']}\n")
    md.append("\n## READY brand breakdown\n")
    for b, n in sorted(brand_ready.items(), key=lambda x: -x[1]):
        md.append(f"- {b}: {n}\n")
    md.append("\n## Regional READY coverage\n")
    for b, n in sorted(regional.items(), key=lambda x: -x[1]):
        md.append(f"- {b}: {n}\n")
    md.append("\n## Rebrands\n")
    for legacy, info in inventory["rebrands"].items():
        md.append(f"- **{legacy}** → {info['successor']}: {info['notes']}\n")
    md.append("\n## QA\n")
    for k, v in qa.items():
        md.append(f"- {k}: {v}\n")
    md.append(f"\n## Projected catalog\n\n{prod['total']} + {len(ready)} = **{prod['total'] + len(ready)}**\n")
    md.append(f"\n## Phase 2\n\n{verdict}\n")
    if report["phase2_reasons"]:
        md.append("\nReasons:\n")
        for r in report["phase2_reasons"]:
            md.append(f"- {r}\n")
    (OUT / "PORTUGAL_PHASE1_READINESS_REPORT.md").write_text("".join(md), encoding="utf-8")

    print("status_counts", dict(status_counts))
    print("ready", len(ready))
    print("verdict", verdict)
    print("production", prod)


if __name__ == "__main__":
    main()
