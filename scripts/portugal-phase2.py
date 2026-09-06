#!/usr/bin/env python3
"""
Portugal Phase 2 — completeness + recovery.
Preserves Phase 1 READY baseline; recovers FF/FU/Element/Be-Fit; adds secondary chains.
Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import math
import re
import ssl
import subprocess
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/portugal"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
CENTERS = ROOT / "src/data/centers.json"
BASELINE = OUT / "portugal_phase1_staging_baseline.json"
P1_READY = OUT / "PORTUGAL_PHASE1_READY_TO_IMPORT.json"
CACHE = OUT / "portugal_geocode_cache.json"
GEO_REVIEW = OUT / "portugal_geocode_review.json"

for d in (OUT, RAW, PAGES, PHASE2):
    d.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "GymlyPortugalPhase2/1.0 (catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.6",
}
PRODUCTION_TOTAL = 10525
PT_POSTAL_RE = re.compile(r"^\d{4}-\d{3}$")
# True mojibake only (not Portuguese ÃO)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")

LISBON_METRO = {
    "lisboa", "amadora", "oeiras", "cascais", "sintra", "loures", "odivelas",
    "almada", "seixal", "alfragide", "miraflores", "carcavelos", "montijo",
    "barreiro", "corroios", "alcochete", "pontinha", "algés", "alges",
    "porto salvo", "queluz", "reboleira", "telheiras", "bobadela", "terceira",
    "barcarena", "algueirão", "mem martins", "mafra", "alverca",
}
PORTO_METRO = {
    "porto", "vila nova de gaia", "gaia", "matosinhos", "maia", "gondomar",
    "valongo", "rio tinto", "leça", "leca", "grijo", "grijó", "ermesinde",
    "canidelo", "águas santas", "aguas santas", "valbom",
}
MADEIRA = {"funchal", "caniço", "canico", "câmara de lobos", "camara de lobos", "santa catarina"}
AZORES = {"ponta delgada", "angra do heroísmo", "angra do heroismo", "arrifes"}


def fetch(url: str, timeout: int = 60) -> tuple[str, str]:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace"), r.geturl()
    except Exception:
        text = fetch_curl(url, timeout=timeout)
        if not text:
            raise
        return text, url


def fetch_curl(url: str, timeout: int = 45) -> str:
    p = subprocess.run(
        ["curl", "-fsSL", "-A", UA["User-Agent"], "--max-time", str(timeout), url],
        capture_output=True,
    )
    if p.returncode != 0:
        return ""
    return p.stdout.decode("utf-8", "replace")


def fetch_json(url: str):
    text, _ = fetch(url)
    return json.loads(text)


def clean(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
            "portugal",
        ]
    )
    return "pt_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_portugal(lat: float, lng: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if 36.9 <= lat <= 42.2 and -9.6 <= lng <= -6.15:
        return True
    if 32.35 <= lat <= 33.2 and -17.35 <= lng <= -16.2:
        return True
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


def normalize_pt_postal(pc: str) -> str:
    pc = (pc or "").strip().replace("–", "-").replace("—", "-")
    pc = re.sub(r"\s*-\s*", "-", pc)
    if re.fullmatch(r"\d{7}", pc):
        return f"{pc[:4]}-{pc[4:]}"
    if re.fullmatch(r"\d{4}-\d{3}", pc):
        return pc
    return ""


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def row(
    brand: str,
    name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    *,
    lat=None,
    lng=None,
    coord_source: str = "",
    notes: str = "",
    import_category: str = "",
    chain_key: str = "",
) -> dict:
    postal = normalize_pt_postal(postal) or (postal if PT_POSTAL_RE.match(str(postal or "")) else "")
    address = clean(address).rstrip(",")
    city = clean(city)
    name = clean(name)
    return {
        "id": make_id(brand, address, postal, city),
        "name": name,
        "brand": brand,
        "chain_key": chain_key or brand.lower().replace(" ", "_"),
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Portugal",
        "lat": lat,
        "lng": lng,
        "website": source_url,
        "source_url": source_url,
        "coord_source": coord_source or "",
        "notes": notes,
        "import_category": import_category,
        "is_active": True,
        "phase": "phase2",
    }


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Portugal"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
        return None, None, ""
    params = urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1, "countrycodes": "pt", "addressdetails": 1}
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
    cc = (addr.get("country_code") or "").lower()
    if cc and cc != "pt":
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
        "postal_code": normalize_pt_postal(str(addr.get("postcode") or "")),
    }
    return lat, lng, "STRICT_ADDRESS_GEOCODE"


def reverse_geocode(lat: float, lng: float, cache: dict) -> dict | None:
    key = f"rev:{lat:.6f},{lng:.6f}"
    if key in cache:
        return cache[key]
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
        return None
    time.sleep(1.05)
    addr = data.get("address") or {}
    if (addr.get("country_code") or "").lower() not in ("pt", ""):
        cache[key] = None
        return None
    if not in_portugal(lat, lng):
        cache[key] = None
        return None
    # Build street
    street = " ".join(
        x
        for x in [
            addr.get("road") or addr.get("pedestrian") or addr.get("footway") or "",
            addr.get("house_number") or "",
        ]
        if x
    ).strip()
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
        or ""
    )
    out = {
        "postal_code": normalize_pt_postal(str(addr.get("postcode") or "")),
        "address": street,
        "city": city,
        "display": data.get("display_name"),
        "source": "REVERSE_OF_OFFICIAL_COORDS",
    }
    cache[key] = out
    return out


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
        r["is_active"] = r.get("import_category") not in ("CLOSED", "DUPLICATE", "LEGACY", "COMING_SOON")
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
    try:
        lat_f = float(r["lat"]) if r.get("lat") is not None else None
        lng_f = float(r["lng"]) if r.get("lng") is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None or not (math.isfinite(lat_f) and math.isfinite(lng_f)):
        reasons.append("missing_coords")
    elif not in_portugal(lat_f, lng_f):
        reasons.append("foreign_coords")

    if "missing_coords" in reasons and not [x for x in reasons if x != "missing_coords"]:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["is_active"] = True
        r["country"] = "Portugal"
        return r
    hard = [x for x in reasons if x != "missing_coords"]
    if hard or "missing_coords" in reasons:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + f"; classify={','.join(reasons)}").strip("; ")
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


def region_of(r: dict) -> str:
    city = (r.get("city") or "").lower()
    lat, lng = r.get("lat"), r.get("lng")
    blob = f"{city} {r.get('address') or ''} {r.get('name') or ''}".lower()
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
        return "Algarve"
    return "Other/unknown"


# ---------------------------------------------------------------------------
# Element from WP API
# ---------------------------------------------------------------------------


def recover_element(cache: dict) -> list[dict]:
    print("== Element WP API ==")
    gyms = json.loads((RAW / "element_wp_gyms.json").read_text(encoding="utf-8"))
    # Detect duplicated default coords
    coord_counts: Counter = Counter()
    for g in gyms:
        c = (g.get("acf") or {}).get("coordenadas") or {}
        try:
            la, lo = float(c.get("latitude") or 0), float(c.get("longitude") or 0)
            if la and lo:
                coord_counts[(round(la, 5), round(lo, 5))] += 1
        except (TypeError, ValueError):
            pass
    bad_coords = {k for k, v in coord_counts.items() if v >= 3}
    print("  suspicious shared coords", bad_coords)

    rows = []
    for g in gyms:
        title = clean(g["title"]["rendered"])
        slug = g["slug"]
        link = g["link"]
        if "thank" in title.lower() or "thank" in slug:
            continue  # thank-you landing pages
        acf = g.get("acf") or {}
        if acf.get("pre-venda"):
            status = "COMING_SOON"
        else:
            status = ""
        morada = htmlmod.unescape(acf.get("morada") or "")
        morada = re.sub(r"<br\s*/?>", ", ", morada, flags=re.I)
        morada = clean(morada)
        address = postal = city = ""
        m = re.search(r"(.+?),\s*(\d{4}-\d{3})\s*(.*)$", morada) or re.search(
            r"(.+?)\s+(\d{4}-\d{3})\s*(.*)$", morada
        )
        if m:
            address = clean(m.group(1)).rstrip(",")
            postal = m.group(2)
            city = clean(m.group(3))
        if not address and morada:
            address = morada
        lat = lng = None
        csrc = ""
        coords = acf.get("coordenadas") or {}
        try:
            if coords.get("latitude") and coords.get("longitude"):
                la, lo = float(coords["latitude"]), float(coords["longitude"])
                if in_portugal(la, lo) and (round(la, 5), round(lo, 5)) not in bad_coords:
                    # Reject Porto clubs with Lisbon-area latitudes
                    if "porto" in city.lower() or "foz" in title.lower() or "ramalde" in title.lower():
                        if la < 40.5:
                            la = lo = None
                    if la is not None:
                        lat, lng, csrc = la, lo, "OFFICIAL_EMBEDDED_DATA"
        except (TypeError, ValueError):
            pass
        if (lat is None or lng is None) and address and postal:
            lat, lng, csrc = geocode(address, postal, city, cache)
        r = row(
            "Element",
            f"Element {title}",
            address,
            postal,
            city,
            link,
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes="element_wp_v2_gym_api; phase2",
            import_category=status,
            chain_key="element",
        )
        rows.append(r)
    print(f"  element rows {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Fitness Factory
# ---------------------------------------------------------------------------


def recover_fitness_factory(cache: dict, geo_review: list) -> list[dict]:
    print("== Fitness Factory ==")
    ff = json.loads((PHASE2 / "ff_official_coords.json").read_text(encoding="utf-8"))
    # Improve addresses from saved HTML
    rows = []
    for item in ff:
        slug = item["slug"]
        html = (PAGES / f"ff_{slug}.html").read_text(encoding="utf-8", errors="replace")
        text_lines = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text_lines = re.sub(r"<[^>]+>", "\n", text_lines)
        lines = [htmlmod.unescape(l).strip() for l in text_lines.splitlines() if htmlmod.unescape(l).strip()]
        address = item.get("address") or ""
        city = item.get("city") or ""
        postal = ""
        # Prefer line with street + optional postcode
        for i, l in enumerate(lines):
            m = re.search(r"(.+?),\s*(\d{4}-\d{3})\s*(.*)$", l)
            if m and re.search(r"Rua|Av\.|Avenida|Caminho|Estrada|Praça|Travessa|Casal|Zona", l, re.I):
                address = clean(m.group(1))
                postal = m.group(2)
                city = clean(m.group(3)) or city
                break
            if re.search(r"^(?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Caminho|Casal|Zona)\b", l, re.I):
                address = clean(l)
                if i and len(lines[i - 1]) < 45 and "CONSULTA" not in lines[i - 1]:
                    city = clean(lines[i - 1])
                break
        if not city:
            # title "X - FITNESS FACTORY"
            if lines:
                city = clean(re.sub(r"\s*-\s*FITNESS FACTORY.*$", "", lines[0], flags=re.I))
        lat, lng = item.get("lat"), item.get("lng")
        csrc = "OFFICIAL_EMBEDDED_DATA" if lat is not None else ""
        status = item.get("status") or ""
        # Reverse postal from official coords when missing
        notes_extra = ""
        if lat is not None and lng is not None and not postal:
            rev = reverse_geocode(float(lat), float(lng), cache)
            if rev and rev.get("postal_code"):
                postal = rev["postal_code"]
                if not address and rev.get("address"):
                    address = rev["address"]
                if (not city or city.lower() == slug.replace("-", " ")) and rev.get("city"):
                    city = rev["city"]
                notes_extra = "; postal_from_reverse_of_official_ff_coords"
                geo_review.append(
                    {
                        "brand": "Fitness Factory",
                        "slug": slug,
                        "lat": lat,
                        "lng": lng,
                        "postal_code": postal,
                        "address": address,
                        "city": city,
                        "display": rev.get("display"),
                        "method": "REVERSE_OF_OFFICIAL_COORDS",
                    }
                )
            else:
                notes_extra = "; reverse_postal_failed"

        # Forward geocode for postal when we have street but no postal yet
        if not postal and address and city:
            lat2, lng2, _src = geocode(address, "", city, cache)
            qkey = ", ".join(x for x in [address, "", city, "Portugal"] if x != "")
            hit = cache.get(qkey)
            if isinstance(hit, dict) and hit.get("postal_code"):
                # Accept only if geocode is near official pin (or no official)
                if lat is None or (
                    lat2 is not None and haversine(float(lat), float(lng), float(lat2), float(lng2)) <= 200
                ):
                    postal = hit["postal_code"]
                    notes_extra += "; postal_from_strict_address_geocode"
                    geo_review.append(
                        {
                            "brand": "Fitness Factory",
                            "slug": slug,
                            "method": "STRICT_ADDRESS_GEOCODE_POSTAL",
                            "postal_code": postal,
                            "address": address,
                            "city": city,
                        }
                    )

        r = row(
            "Fitness Factory",
            f"Fitness Factory {city or slug.replace('-', ' ').title()}",
            address,
            postal,
            city or slug.replace("-", " ").title(),
            item["url"],
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes=("fitnessfactory_embedded_latlng; phase2" + notes_extra).strip("; "),
            import_category=status,
            chain_key="fitness_factory",
        )
        rows.append(r)
    print(f"  FF rows {len(rows)} with postal {sum(1 for r in rows if r['postal_code'])}")
    return rows


# ---------------------------------------------------------------------------
# Fitness UP / Be-Fit recovery from Phase 1 non-READY
# ---------------------------------------------------------------------------


def recover_coords_for_brand(baseline: list[dict], brand: str, cache: dict) -> list[dict]:
    print(f"== Recover coords {brand} ==")
    out = []
    for r in baseline:
        if r.get("brand") != brand:
            continue
        rr = dict(r)
        if rr.get("import_category") == "READY_TO_IMPORT" and rr.get("lat") is not None:
            out.append(rr)
            continue
        if rr.get("import_category") in ("CLOSED", "DUPLICATE", "LEGACY", "COMING_SOON"):
            out.append(rr)
            continue
        # Try geocode
        if rr.get("address") and PT_POSTAL_RE.match(str(rr.get("postal_code") or "")):
            lat, lng, src = geocode(rr["address"], rr["postal_code"], rr.get("city") or "", cache)
            if lat is not None:
                rr["lat"] = lat
                rr["lng"] = lng
                rr["coord_source"] = src
                rr["notes"] = (rr.get("notes") or "") + "; phase2_geocode_recovery"
                rr["import_category"] = ""
        # Try map shortlinks on saved pages
        if rr.get("lat") is None:
            slug = (rr.get("source_url") or "").rstrip("/").split("/")[-1]
            # fitnessup / befit pages
            for prefix in ("fitnessup_", "befit_"):
                p = PAGES / f"{prefix}{slug}.html"
                if not p.exists() and brand == "Be-Fit":
                    # contactos slug
                    p = PAGES / f"befit_{slug}.html"
                if p.exists():
                    html = p.read_text(encoding="utf-8", errors="replace")
                    mlat = re.search(r'"latitude"\s*:\s*(-?\d+\.\d+)', html)
                    mlng = re.search(r'"longitude"\s*:\s*(-?\d+\.\d+)', html)
                    if mlat and mlng:
                        la, lo = float(mlat.group(1)), float(mlng.group(1))
                        if in_portugal(la, lo):
                            rr["lat"], rr["lng"] = la, lo
                            rr["coord_source"] = "OFFICIAL_EMBEDDED_DATA"
                            rr["notes"] = (rr.get("notes") or "") + "; phase2_embedded"
                            rr["import_category"] = ""
        out.append(rr)
    print(f"  {brand} rows {len(out)}")
    return out


# ---------------------------------------------------------------------------
# Secondary chains (lightweight official extracts)
# ---------------------------------------------------------------------------


def discover_lemonfit(cache: dict) -> list[dict]:
    print("== Lemonfit ==")
    html, _ = fetch("https://www.lemonfit.pt/")
    (RAW / "lemonfit_home_p2.html").write_text(html[:400000], encoding="utf-8")
    # Wix JSON-LD / addresses
    rows = []
    # Known official club set from site audit
    # Try to parse postal+street from page text
    text = clean(re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I))
    # Find HealthClub / LocalBusiness ld+json
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I
    ):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        blocks = data if isinstance(data, list) else [data]
        for b in blocks:
            if not isinstance(b, dict):
                continue
            t = str(b.get("@type") or "")
            if "LocalBusiness" in t or "HealthClub" in t or "SportsActivityLocation" in t:
                addr = b.get("address") or {}
                if isinstance(addr, dict):
                    postal = normalize_pt_postal(str(addr.get("postalCode") or ""))
                    city = clean(addr.get("addressLocality") or "")
                    street = clean(addr.get("streetAddress") or "")
                    name = clean(b.get("name") or f"Lemonfit {city}")
                    lat = lng = None
                    csrc = ""
                    geo = b.get("geo") or {}
                    try:
                        if geo.get("latitude"):
                            lat, lng = float(geo["latitude"]), float(geo["longitude"])
                            csrc = "OFFICIAL_JSON_LD"
                    except (TypeError, ValueError):
                        pass
                    if lat is None and street and postal:
                        lat, lng, csrc = geocode(street, postal, city, cache)
                    if street or postal:
                        rows.append(
                            row(
                                "Lemonfit",
                                name if "lemon" in name.lower() else f"Lemonfit {name}",
                                street,
                                postal,
                                city,
                                "https://www.lemonfit.pt/",
                                lat=lat,
                                lng=lng,
                                coord_source=csrc,
                                notes="lemonfit_json_ld_or_home; phase2",
                                chain_key="lemonfit",
                            )
                        )
    # Fallback: club pages from links
    links = sorted(
        set(
            re.findall(r'href=["\'](https://www\.lemonfit\.pt/[^"\']+)["\']', html)
            + ["https://www.lemonfit.pt" + u for u in re.findall(r'href=["\'](/[^"\']+)["\']', html)]
        )
    )
    club_links = [
        u
        for u in links
        if any(
            x in u.lower()
            for x in (
                "olaias",
                "estefania",
                "estefânia",
                "povoa",
                "póvoa",
                "nacoes",
                "nações",
                "maia",
                "oliveira",
                "ginasio",
                "clube",
            )
        )
        and "cdn" not in u
    ]
    print("  lemonfit ld rows", len(rows), "clubish links", len(club_links))
    if not rows:
        # Manual structured extract from known homepage copy if present
        for m in re.finditer(
            r"(Olaias|Estefânia|Estefania|Póvoa de Santa Iria|Povoa de Santa Iria|Parque das Nações|Parque das Nacoes|Maia|Oliveira de Azeméis|Oliveira de Azemeis)",
            text,
            re.I,
        ):
            name = m.group(1)
            # search nearby postcode
            window = text[max(0, m.start() - 50) : m.end() + 120]
            pm = re.search(r"(\d{4}-\d{3})", window)
            sm = re.search(
                r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa)[^,]{3,60})", window, re.I
            )
            postal = pm.group(1) if pm else ""
            street = clean(sm.group(1)) if sm else ""
            city = name
            lat = lng = None
            csrc = ""
            if street and postal:
                lat, lng, csrc = geocode(street, postal, city, cache)
            rows.append(
                row(
                    "Lemonfit",
                    f"Lemonfit {name}",
                    street,
                    postal,
                    city,
                    "https://www.lemonfit.pt/",
                    lat=lat,
                    lng=lng,
                    coord_source=csrc,
                    notes="lemonfit_home_text; phase2",
                    chain_key="lemonfit",
                )
            )
    # dedupe by postal
    by_pc = {}
    for r in rows:
        key = r.get("postal_code") or r.get("name")
        by_pc[key] = r
    rows = list(by_pc.values())
    print(f"  lemonfit unique {len(rows)}")
    return rows


def discover_phive(cache: dict) -> list[dict]:
    print("== Phive ==")
    html, _ = fetch("https://phive.pt/")
    (RAW / "phive_home.html").write_text(html[:300000], encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href=["\'](https://phive\.pt/clubes/[^"\']+)["\']', html)
            + ["https://phive.pt" + u for u in re.findall(r'href=["\'](/clubes/[^"\']+)["\']', html)]
        )
    )
    links = [u.rstrip("/") + "/" for u in links if u.rstrip("/").count("/") >= 3]
    print("  club links", links)
    rows = []
    for url in links:
        try:
            page, final = fetch(url)
        except Exception as e:
            print("  fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"phive_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = clean(re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I))
        # JSON-LD
        lat = lng = None
        csrc = ""
        address = postal = city = ""
        for m in re.finditer(
            r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I
        ):
            try:
                data = json.loads(m.group(1))
            except Exception:
                continue
            blocks = data if isinstance(data, list) else [data]
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                addr = b.get("address") or {}
                if isinstance(addr, dict) and addr.get("streetAddress"):
                    address = clean(addr.get("streetAddress") or "")
                    postal = normalize_pt_postal(str(addr.get("postalCode") or ""))
                    city = clean(addr.get("addressLocality") or "")
                geo = b.get("geo") or {}
                try:
                    if geo.get("latitude"):
                        lat, lng = float(geo["latitude"]), float(geo["longitude"])
                        csrc = "OFFICIAL_JSON_LD"
                except (TypeError, ValueError):
                    pass
        if not postal:
            m = re.search(
                r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa)[^,]{3,80}),?\s*(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-]*)",
                text,
            )
            if m:
                address, postal, city = clean(m.group(1)), m.group(2), clean(m.group(3))
        if lat is None and address and postal:
            lat, lng, csrc = geocode(address, postal, city, cache)
        rows.append(
            row(
                "Phive",
                f"Phive {slug.replace('-', ' ').title()}",
                address,
                postal,
                city,
                final,
                lat=lat,
                lng=lng,
                coord_source=csrc,
                notes="phive_club_page; phase2",
                chain_key="phive",
            )
        )
        time.sleep(0.2)
    print(f"  phive {len(rows)}")
    return rows


def discover_balance(cache: dict) -> list[dict]:
    print("== Balance ==")
    html, _ = fetch("https://balance.pt/")
    (RAW / "balance_home.html").write_text(html[:300000], encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href=["\'](https://balance\.pt/[^"\']+)["\']', html)
            + ["https://balance.pt" + u for u in re.findall(r'href=["\'](/[^"\']+)["\']', html)]
        )
    )
    club_links = [
        u
        for u in links
        if any(
            x in u.lower()
            for x in (
                "aveiro",
                "campo-pequeno",
                "caldas",
                "lumiar",
                "leca",
                "leça",
                "sao-felix",
                "são-félix",
                "clube",
            )
        )
        and "wp-content" not in u
        and "mailto" not in u
    ]
    print("  clubish", club_links[:20])
    rows = []
    # Also parse home for postcodes near club names
    text = clean(re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I))
    for url in club_links[:12]:
        try:
            page, final = fetch(url)
        except Exception:
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"balance_{slug}.html").write_text(page[:150000], encoding="utf-8")
        t = clean(re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I))
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa)[^,]{3,80}),?\s*(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-]*)",
            t,
        )
        if not m:
            continue
        address, postal, city = clean(m.group(1)), m.group(2), clean(m.group(3))
        lat, lng, csrc = geocode(address, postal, city, cache)
        rows.append(
            row(
                "Balance",
                f"Balance {slug.replace('-', ' ').title()}",
                address,
                postal,
                city,
                final,
                lat=lat,
                lng=lng,
                coord_source=csrc,
                notes="balance_pt_official; phase2; distinct_operator_balance.pt",
                chain_key="balance",
            )
        )
        time.sleep(0.25)
    print(f"  balance {len(rows)}")
    return rows


def discover_supera(cache: dict) -> list[dict]:
    print("== Supera ==")
    # Inclusion rule: municipal sports complexes with consumer fitness salas
    centers = [
        ("barreiro", "https://centrosupera.pt/barreiro/"),
        ("coimbra", "https://centrosupera.pt/coimbra/"),
        ("telheiras", "https://centrosupera.pt/telheiras/"),
        ("seixal", "https://centrosupera.pt/seixal/"),
        ("setubal", "https://centrosupera.pt/setubal/"),
        ("areeiro", "https://centrosupera.pt/lisboa/"),  # Areeiro / Lisboa CDM
    ]
    rows = []
    for slug, url in centers:
        try:
            page, final = fetch(url)
        except Exception as e:
            print("  fail", url, e)
            continue
        (PAGES / f"supera_{slug}_p2.html").write_text(page[:200000], encoding="utf-8")
        text = clean(re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I))
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.|Largo)[^,]{3,90}),?\s*(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-]*)",
            text,
        )
        address = postal = city = ""
        if m:
            address, postal, city = clean(m.group(1)), m.group(2), clean(m.group(3))
        lat = lng = None
        csrc = ""
        mlat = re.search(r'["\']?latitude["\']?\s*[:=]\s*["\']?(-?\d+\.\d+)', page, re.I)
        mlng = re.search(r'["\']?longitude["\']?\s*[:=]\s*["\']?(-?\d+\.\d+)', page, re.I)
        if mlat and mlng:
            la, lo = float(mlat.group(1)), float(mlng.group(1))
            if in_portugal(la, lo):
                lat, lng, csrc = la, lo, "OFFICIAL_EMBEDDED_DATA"
        if lat is None and address and postal:
            lat, lng, csrc = geocode(address, postal, city, cache)
        rows.append(
            row(
                "Supera",
                f"Supera {slug.replace('-', ' ').title()}",
                address,
                postal,
                city or slug.title(),
                final,
                lat=lat,
                lng=lng,
                coord_source=csrc,
                notes="supera_pt; inclusion=consumer_fitness_in_sports_complex; exclude_es; phase2",
                chain_key="supera",
            )
        )
        time.sleep(0.25)
    print(f"  supera {len(rows)}")
    return rows


def discover_gogym(cache: dict) -> list[dict]:
    print("== Go Gym ==")
    cities = ["porto", "maia", "valongo", "coimbra", "vila-real", "lamego", "chaves"]
    rows = []
    for slug in cities:
        url = f"https://gogym.pt/{slug}"
        page = fetch_curl(url)
        if not page or len(page) < 500:
            print("  miss", url)
            continue
        (PAGES / f"gogym_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = clean(re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I))
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa)[^,]{3,80}),?\s*(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-]*)",
            text,
        )
        if not m:
            print("  no addr", slug)
            continue
        address, postal, city = clean(m.group(1)), m.group(2), clean(m.group(3))
        lat, lng, csrc = geocode(address, postal, city, cache)
        rows.append(
            row(
                "Go Gym",
                f"Go Gym {slug.replace('-', ' ').title()}",
                address,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                coord_source=csrc,
                notes="gogym_city_page; phase2",
                chain_key="go_gym",
            )
        )
    print(f"  gogym {len(rows)}")
    return rows


def discover_vivafit(cache: dict) -> list[dict]:
    print("== Vivafit ==")
    # Studio list from contact/booking pages
    for url in ["https://vivafit.eu/bookpt/", "https://vivafit.eu/contacto/", "https://vivafit.eu/contact/"]:
        try:
            html, final = fetch(url)
            (RAW / "vivafit_book.html").write_text(html[:400000], encoding="utf-8")
            print("  fetched", final, len(html))
            break
        except Exception as e:
            print("  fail", url, e)
            html = ""
    if not html:
        return []
    # option labels
    opts = re.findall(r"<option[^>]*>([^<]+)</option>", html, re.I)
    studios = []
    for o in opts:
        o = clean(o)
        if not o or o.lower() in ("selecione", "select", "escolher", "studio", "clube"):
            continue
        if len(o) < 3:
            continue
        studios.append(o)
    studios = sorted(set(studios))
    print("  studio options", studios)
    rows = []
    for name in studios:
        # Only Portuguese-looking (exclude ES if mixed)
        if re.search(r"\b(Madrid|Barcelona|Valencia|Sevilla)\b", name, re.I):
            continue
        city = name
        rows.append(
            row(
                "Vivafit",
                f"Vivafit {name}",
                "",  # address unknown from dropdown alone
                "",
                city,
                "https://vivafit.eu/",
                notes="vivafit_booking_dropdown_name_only; phase2; needs_address",
                import_category="NEEDS_REVIEW",
                chain_key="vivafit",
            )
        )
    print(f"  vivafit name-only {len(rows)} (held in NEEDS_REVIEW until addresses)")
    return rows


# ---------------------------------------------------------------------------
# Merge / dedupe / report
# ---------------------------------------------------------------------------


def dedupe(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id: dict[str, dict] = {}
    by_addr: dict[str, dict] = {}
    analysis = []

    def score(r):
        pri = {
            "READY_TO_IMPORT": 5,
            "NEEDS_COORDINATES": 4,
            "NEEDS_REVIEW": 3,
            "COMING_SOON": 2,
            "CLOSED": 1,
            "DUPLICATE": 0,
            "LEGACY": 0,
        }.get(r.get("import_category") or "", 0)
        return (pri, 1 if r.get("lat") is not None else 0, 1 if "phase2" in (r.get("notes") or "") else 0)

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
            analysis.append({"a": by_id[rid]["id"], "b": rid, "reason": "duplicate_id", "brand": r.get("brand")})
            if score(r) > score(by_id[rid]):
                by_id[rid] = r
            continue
        if addr_key.strip("|") and addr_key in by_addr:
            ex = by_addr[addr_key]
            if (ex.get("brand") or "").lower() == (r.get("brand") or "").lower():
                analysis.append(
                    {
                        "a": ex["id"],
                        "b": rid,
                        "reason": "same_brand_normalized_address",
                        "brand": r.get("brand"),
                    }
                )
                if score(r) > score(ex):
                    ex["import_category"] = "DUPLICATE"
                    by_id.pop(ex["id"], None)
                    by_id[rid] = r
                    by_addr[addr_key] = r
                else:
                    r["import_category"] = "DUPLICATE"
                    by_id[rid] = r
                continue
        by_id[rid] = r
        if addr_key.strip("|"):
            by_addr[addr_key] = r

    coords = [r for r in by_id.values() if r.get("lat") is not None and r.get("import_category") not in ("DUPLICATE", "CLOSED", "LEGACY")]
    for i, a in enumerate(coords):
        for b in coords[i + 1 :]:
            if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d <= 25 and norm_addr(a.get("address") or "") == norm_addr(b.get("address") or ""):
                analysis.append({"a": a["id"], "b": b["id"], "reason": f"same_brand_within_{int(d)}m", "distance_m": round(d, 1)})
                weaker = a if score(a) < score(b) else b
                weaker["import_category"] = "DUPLICATE"
            elif d <= 100:
                analysis.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "reason": f"same_brand_within_{int(d)}m_ambiguous",
                        "distance_m": round(d, 1),
                        "decision": "keep_both",
                    }
                )
    return list(by_id.values()), analysis


def production_ok():
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    assert len(centers) == PRODUCTION_TOTAL
    pt = sum(1 for c in centers if str(c.get("country") or "").lower() in ("portugal", "pt"))
    assert pt == 0
    return {
        "total": len(centers),
        "portugal": 0,
        "pt_ids": sum(1 for c in centers if str(c.get("id") or "").startswith("pt_")),
        "sha256_16": hashlib.sha256(CENTERS.read_bytes()).hexdigest()[:16],
    }


def main():
    assert BASELINE.exists(), "Missing phase1 baseline"
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    p1_ready = json.loads(P1_READY.read_text(encoding="utf-8"))
    p1_ready_ids = {r["id"] for r in p1_ready}
    p1_ready_by_id = {r["id"]: r for r in p1_ready}

    cache = load_cache()
    geo_review: list = []

    # Start from Phase 1 READY preserved verbatim
    preserved = [dict(r) for r in p1_ready]
    preserved_ids = set(p1_ready_ids)

    # Brands fully rebuilt in Phase 2 (replace P1 rows of these brands)
    rebuilt_brands = {"Element", "Fitness Factory", "Supera"}

    kept = [r for r in preserved if r.get("brand") not in rebuilt_brands]
    removed_for_rebuild = [r for r in preserved if r.get("brand") in rebuilt_brands]

    # Keep non-READY baseline rows for brands we recover in place (FU, Be-Fit, etc.)
    other_baseline = [
        r
        for r in baseline
        if r["id"] not in p1_ready_ids
        and r.get("brand") not in rebuilt_brands
        and r.get("brand") not in ("Fitness UP", "Be-Fit")  # recovered separately
    ]

    element_rows = recover_element(cache)
    ff_rows = recover_fitness_factory(cache, geo_review)
    fu_rows = recover_coords_for_brand(baseline, "Fitness UP", cache)
    befit_rows = recover_coords_for_brand(baseline, "Be-Fit", cache)
    supera_rows = discover_supera(cache)
    lemon_rows = discover_lemonfit(cache)
    phive_rows = discover_phive(cache)
    try:
        balance_rows = discover_balance(cache)
    except Exception as e:
        print("Balance deferred:", e)
        balance_rows = []
    try:
        gogym_rows = discover_gogym(cache)
    except Exception as e:
        print("Go Gym deferred:", e)
        gogym_rows = []
    try:
        vivafit_rows = discover_vivafit(cache)
    except Exception as e:
        print("Vivafit deferred:", e)
        vivafit_rows = []

    # Preserve other P1 brands READY + non-ready (VivaGym, Solinca, Holmes, etc.)
    other_ready = kept
    other_nonready = [
        r
        for r in baseline
        if r["id"] not in p1_ready_ids
        and r.get("brand")
        not in rebuilt_brands.union({"Fitness UP", "Be-Fit", "Lemonfit", "Phive", "Balance", "Go Gym", "Vivafit", "Kalorias"})
    ]

    all_rows = (
        other_ready
        + other_nonready
        + element_rows
        + ff_rows
        + fu_rows
        + befit_rows
        + supera_rows
        + lemon_rows
        + phive_rows
        + balance_rows
        + gogym_rows
        + vivafit_rows
    )

    # Geocode any remaining with address+postal missing coords
    for i, r in enumerate(all_rows, 1):
        if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
            continue
        if r.get("lat") is not None:
            continue
        if r.get("address") and PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
            lat, lng, src = geocode(r["address"], r["postal_code"], r.get("city") or "", cache)
            if lat is not None:
                r["lat"] = lat
                r["lng"] = lng
                r["coord_source"] = src
                r["notes"] = (r.get("notes") or "") + "; phase2_final_geocode"
        if i % 40 == 0:
            save_cache(cache)
            print(f"  geocode {i}/{len(all_rows)}")
    save_cache(cache)

    all_rows = [classify(r) for r in all_rows]
    all_rows, dup_analysis = dedupe(all_rows)
    all_rows = [
        classify(r) if r.get("import_category") not in ("DUPLICATE", "LEGACY", "COMING_SOON", "CLOSED") else r
        for r in all_rows
    ]

    ready = [r for r in all_rows if r.get("import_category") == "READY_TO_IMPORT"]
    status_counts = Counter(r.get("import_category") or "UNKNOWN" for r in all_rows)
    brand_ready = Counter(r["brand"] for r in ready)
    brand_all = Counter(r["brand"] for r in all_rows)
    regional = Counter(region_of(r) for r in ready)

    # Phase 1 READY reconciliation
    final_by_id = {r["id"]: r for r in all_rows}
    preserved_verbatim = 0
    modified = 0
    removed = []
    for pid, pr in p1_ready_by_id.items():
        if pr.get("brand") in rebuilt_brands:
            # replaced by rebuild — check if physical club still present
            key = (pr.get("brand"), norm_addr(pr.get("address") or ""), pr.get("postal_code"))
            still = False
            for r in all_rows:
                if r.get("brand") == pr.get("brand") and r.get("postal_code") == pr.get("postal_code"):
                    if norm_addr(r.get("address") or "") == norm_addr(pr.get("address") or "") or r.get(
                        "postal_code"
                    ) == pr.get("postal_code"):
                        still = True
                        break
            removed.append(
                {
                    "id": pid,
                    "brand": pr.get("brand"),
                    "reason": "rebuilt_brand_estate_from_stronger_source",
                    "still_represented": still,
                }
            )
            continue
        fr = final_by_id.get(pid)
        if not fr:
            removed.append({"id": pid, "brand": pr.get("brand"), "reason": "missing_after_phase2"})
            continue
        # compare core fields
        same = (
            fr.get("address") == pr.get("address")
            and fr.get("postal_code") == pr.get("postal_code")
            and fr.get("lat") == pr.get("lat")
            and fr.get("lng") == pr.get("lng")
            and fr.get("import_category") == "READY_TO_IMPORT"
        )
        if same:
            preserved_verbatim += 1
        else:
            modified += 1

    prod = production_ok()

    # Coverage estimates
    estimates = {
        "VivaGym": 46,
        "Solinca": 19,
        "Solinca Light": 16,
        "Holmes Place": 12,
        "Fitness UP": 74,
        "Element": 53,
        "Fitness Factory": 49,
        "Be-Fit": 22,
        "Supera": 6,
        "Lemonfit": 6,
        "Phive": 5,
        "Balance": 6,
        "Go Gym": 6,
        "Vivafit": 12,
        "Kalorias": 0,
    }

    chain_table = []
    for brand, est in estimates.items():
        disc = brand_all.get(brand, 0)
        rd = brand_ready.get(brand, 0)
        unresolved = sum(
            1
            for r in all_rows
            if r.get("brand") == brand and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
        )
        cov = round(100 * rd / est, 1) if est else (100.0 if rd else 0.0)
        if brand == "Kalorias":
            verdict = "EXCLUDED_SITE_404"
        elif brand == "Vivafit" and rd == 0:
            verdict = "DEFERRED_NAME_ONLY"
        elif cov >= 85:
            verdict = "Complete"
        elif cov >= 70:
            verdict = "Near-complete"
        elif disc == 0:
            verdict = "Missing"
        else:
            verdict = "Partial"
        chain_table.append(
            {
                "brand": brand,
                "estimate": est,
                "discovered": disc,
                "ready": rd,
                "unresolved": unresolved,
                "coverage_pct": cov,
                "verdict": verdict,
            }
        )

    # Phase 3 decision
    blocking = []
    for c in chain_table:
        if c["brand"] in ("Fitness Factory", "Element", "Fitness UP", "Be-Fit") and c["coverage_pct"] < 70:
            blocking.append(f"{c['brand']} coverage {c['coverage_pct']}%")
        if c["brand"] in ("Fitness Factory", "Element") and c["ready"] < 0.7 * max(c["estimate"], 1):
            if f"{c['brand']} coverage {c['coverage_pct']}%" not in blocking:
                blocking.append(f"{c['brand']} below 70%")
    # If FF and Element are strong, don't require phase3 for Vivafit name-only / Kalorias 404
    ff = next(c for c in chain_table if c["brand"] == "Fitness Factory")
    el = next(c for c in chain_table if c["brand"] == "Element")
    fu = next(c for c in chain_table if c["brand"] == "Fitness UP")
    phase3 = False
    phase3_reasons = []
    if ff["coverage_pct"] < 70:
        phase3 = True
        phase3_reasons.append("Fitness Factory <70% READY")
    if el["coverage_pct"] < 70:
        phase3 = True
        phase3_reasons.append("Element <70% READY")
    if fu["coverage_pct"] < 55 and fu["unresolved"] > 25:
        phase3 = True
        phase3_reasons.append("Fitness UP large unresolved backlog")

    unresolved_total = status_counts.get("NEEDS_COORDINATES", 0) + status_counts.get("NEEDS_REVIEW", 0)
    if unresolved_total > 80 and (ff["coverage_pct"] < 80 or el["coverage_pct"] < 80):
        phase3 = True
        phase3_reasons.append(f"large unresolved backlog ({unresolved_total})")

    verdict = "PORTUGAL PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR PORTUGAL MERGE"

    qa = {
        "duplicate_ids": 0,
        "same_brand_physical_duplicates": len([d for d in dup_analysis if "within_" in d.get("reason", "") and "ambiguous" not in d.get("reason", "")]),
        "invalid_postcodes_ready": sum(1 for r in ready if not PT_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_addresses_ready": sum(1 for r in ready if len(str(r.get("address") or "")) < 4),
        "missing_cities_ready": sum(1 for r in ready if not r.get("city")),
        "invalid_coordinates_ready": sum(
            1 for r in ready if not in_portugal(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coordinates": sum(
            1 for r in ready if re.search(r"fallback|centroid|city_center", str(r.get("coord_source") or ""), re.I)
        ),
        "foreign_outliers": sum(
            1 for r in all_rows if r.get("lat") is not None and not in_portugal(float(r["lat"]), float(r["lng"]))
        ),
        "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")),
        "ambiguous_geocodes": len([d for d in dup_analysis if "ambiguous" in d.get("reason", "")]),
    }

    p1_status = Counter(r.get("import_category") for r in baseline)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase3_required": phase3,
        "phase3_reasons": phase3_reasons,
        "production": prod,
        "phase1": {
            "unique_staged": len(baseline),
            "READY_TO_IMPORT": p1_status.get("READY_TO_IMPORT", 0),
            "NEEDS_COORDINATES": p1_status.get("NEEDS_COORDINATES", 0),
            "NEEDS_REVIEW": p1_status.get("NEEDS_REVIEW", 0),
            "CLOSED": p1_status.get("CLOSED", 0),
            "DUPLICATE": p1_status.get("DUPLICATE", 0),
            "ready_preserved_verbatim": preserved_verbatim,
            "ready_modified": modified,
            "ready_removed_or_rebuilt": len(removed),
            "removal_details": removed[:50],
        },
        "phase2": {
            "unique_staged": len(all_rows),
            "status_counts": dict(status_counts),
            "ready_count": len(ready),
            "brand_ready": dict(brand_ready),
            "brand_all": dict(brand_all),
            "regional_ready": dict(regional),
        },
        "chain_table": chain_table,
        "qa": qa,
        "projected_catalog": prod["total"] + len(ready),
        "architecture": {
            "keep_client_side": True,
            "inside_comfort_zone": (prod["total"] + len(ready)) < 12000,
            "global_10k_qa_rerun_required_now": False,
        },
        "supera_inclusion_rule": "Include Portuguese Supera municipal/sports complexes that offer consumer-accessible fitness salas; exclude Spanish centrosupera.com locations and non-fitness-only facilities without gym access.",
        "kalorias": "Official kalorias.com returns 404 at Phase 2 audit — deferred/excluded until site recovers.",
        "vivafit": "Booking dropdown yields studio names only without addresses — staged NEEDS_REVIEW / not READY.",
    }

    rebrand_map = {
        "Fitness Hut": {"successor": "VivaGym", "action": "stage_as_vivagym_only", "status": "resolved"},
        "Pump Fitness Spirit": {"successor": "Solinca Light", "action": "stage_as_solinca_light_only", "status": "resolved"},
        "Virgin Active Portugal": {"successor": "Holmes Place", "action": "stage_as_holmes_place_only", "status": "resolved"},
        "Kalorias": {"successor": None, "action": "exclude_while_site_404", "status": "deferred"},
    }

    # Write artifacts
    (OUT / "portugal_centers_staging.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "PORTUGAL_PHASE2_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "portugal_duplicate_analysis.json").write_text(
        json.dumps(dup_analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    GEO_REVIEW.write_text(json.dumps(geo_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "PORTUGAL_PHASE2_REBRAND_MAP.json").write_text(
        json.dumps(rebrand_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "PORTUGAL_PHASE2_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    md = []
    md.append("# PORTUGAL PHASE 2 READINESS REPORT\n\n")
    md.append(f"Generated: {report['generated_at']}\n\n")
    md.append(f"**Verdict:** {verdict}\n\n")
    md.append("## Phase 1 reconciliation\n\n")
    md.append(f"- Phase 1 staged: {len(baseline)}\n")
    md.append(f"- Phase 1 READY: {len(p1_ready)}\n")
    md.append(f"- READY preserved verbatim: {preserved_verbatim}\n")
    md.append(f"- READY modified: {modified}\n")
    md.append(f"- READY removed/rebuilt: {len(removed)}\n")
    md.append("\n## Phase 2 overall\n\n")
    md.append(f"- Unique staged: {len(all_rows)}\n")
    for k in ("READY_TO_IMPORT", "NEEDS_COORDINATES", "NEEDS_REVIEW", "COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
        md.append(f"- {k}: {status_counts.get(k, 0)}\n")
    md.append(f"\n- Production: {prod['total']} (unchanged)\n- Portugal live: 0\n")
    md.append(f"- sha256_16: `{prod['sha256_16']}`\n")
    md.append("\n## READY by brand\n\n")
    for b, n in brand_ready.most_common():
        md.append(f"- {b}: {n}\n")
    md.append("\n## Chain completeness\n\n")
    for c in chain_table:
        md.append(
            f"- {c['brand']}: est {c['estimate']} / disc {c['discovered']} / READY {c['ready']} / unresolved {c['unresolved']} / {c['coverage_pct']}% / {c['verdict']}\n"
        )
    md.append("\n## Regional READY\n\n")
    for b, n in sorted(regional.items(), key=lambda x: -x[1]):
        md.append(f"- {b}: {n}\n")
    md.append(f"\n## Projected\n\n{prod['total']} + {len(ready)} = **{prod['total'] + len(ready)}**\n")
    md.append(f"\n## Phase 3\n\n{verdict}\n")
    if phase3_reasons:
        for r in phase3_reasons:
            md.append(f"- {r}\n")
    (OUT / "PORTUGAL_PHASE2_READINESS_REPORT.md").write_text("".join(md), encoding="utf-8")

    print("READY", len(ready), dict(brand_ready))
    print("status", dict(status_counts))
    print("verdict", verdict)
    print("prod", prod)
    print("p1 preserved", preserved_verbatim, "modified", modified, "removed", len(removed))


if __name__ == "__main__":
    main()
