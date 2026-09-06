#!/usr/bin/env python3
"""
Poland Phase 1 discovery — official chain locators / club pages only.

Does NOT merge into centers.json. Does NOT invent coordinates.
IDs: pl_ + md5(brand|normalized_address|postal|city|poland)[:10]
Polish postcodes: NN-NNN strings ^\\d{2}-\\d{3}$
Rejects foreign pins outside Poland bbox / neighbor states.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import math
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/poland"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PAGES = RAW / "pages"
CACHE = OUT / "poland_geocode_cache.json"
for p in (OUT, RAW, SCRAPES, PAGES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()

# Mainland Poland (+ coastal) — reject DE/CZ/SK/UA/BY/LT/Kaliningrad interiors
PL_BOUNDS = (49.0, 54.9, 14.07, 24.15)
PL_POSTAL_RE = re.compile(r"^\d{2}-\d{3}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")


def log(*a):
    with PRINT_LOCK:
        print(*a, flush=True)


def fetch(url: str, timeout: int = 45, headers: dict | None = None) -> tuple[int, str]:
    hdrs = dict(UA)
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
            enc = "utf-8"
            m = re.search(r"charset=([^\s;]+)", ctype, re.I)
            if m:
                enc = m.group(1).strip("\"'")
            return r.status, raw.decode(enc, errors="replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception as e:
        return 0, str(e)


def fetch_cached(url: str, dest: Path, timeout: int = 45, force: bool = False) -> str:
    if not force and dest.exists() and dest.stat().st_size > 400:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout)
    if code == 200 and text and len(text) > 200:
        dest.write_text(text, encoding="utf-8")
        return text
    if text:
        dest.write_text(text, encoding="utf-8")
    return text if code == 200 else ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def pl_postal(s) -> str:
    if s is None:
        return ""
    m = re.search(r"\b(\d{2})\s*[-–—]?\s*(\d{3})\b", str(s))
    if not m:
        return ""
    return f"{m.group(1)}-{m.group(2)}"


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            re.sub(r"[^a-z0-9]+", " ", (brand or "").lower()).strip(),
            re.sub(r"[^a-z0-9]+", " ", (address or "").lower()).strip(),
            (postal or "").strip(),
            re.sub(r"[^a-z0-9ąćęłńóśźż]+", " ", (city or "").lower()).strip(),
            "poland",
        ]
    )
    return "pl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_poland(lat: float, lng: float) -> bool:
    return PL_BOUNDS[0] <= lat <= PL_BOUNDS[1] and PL_BOUNDS[2] <= lng <= PL_BOUNDS[3]


def foreign_hint(lat: float, lng: float, city: str, address: str) -> str | None:
    blob = f"{city} {address}".lower()
    if re.search(r"\bgermany\b|\bdeutschland\b|\bniemcy\b", blob) and "ul." not in blob:
        return "DE_name"
    # Kaliningrad north of Warmia
    if lat > 54.35 and lng > 19.5 and lng < 22.5:
        return "RU_kaliningrad_geo"
    # Czech interior south of PL
    if lat < 49.05 and 14.5 < lng < 18.5:
        return "CZ_geo"
    # Slovakia south
    if lat < 49.1 and 18.5 < lng < 22.5:
        return "SK_geo"
    if not in_poland(lat, lng):
        return "OUT_OF_PL_BBOX"
    return None


def extract_json_ld(html: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except Exception:
            continue
        if isinstance(data, list):
            out.extend(x for x in data if isinstance(x, dict))
        elif isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                out.extend(x for x in data["@graph"] if isinstance(x, dict))
            else:
                out.append(data)
    return out


def extract_coords_from_html(html: str) -> tuple[float | None, float | None, str]:
    # Google maps embed / place
    m = re.search(
        r"maps\.google[^\"']+[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)",
        html,
        re.I,
    )
    if m:
        return float(m.group(1)), float(m.group(2)), "OFFICIAL_MAP_PIN"
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", html)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        if in_poland(lat, lng):
            return lat, lng, "OFFICIAL_MAP_PIN"
    m = re.search(
        r'["\'](?:lat|latitude)["\']\s*:\s*([-\d.]+)\s*,\s*["\'](?:lng|lon|longitude)["\']\s*:\s*([-\d.]+)',
        html,
        re.I,
    )
    if m:
        return float(m.group(1)), float(m.group(2)), "OFFICIAL_COORDINATE"
    m = re.search(
        r'position:\s*\{\s*lat:\s*(?:parseFloat\(["\']?)?([-\d.]+).*?lng:\s*(?:parseFloat\(["\']?)?([-\d.]+)',
        html,
        re.I | re.S,
    )
    if m:
        return float(m.group(1)), float(m.group(2)), "OFFICIAL_MAP_PIN"
    for block in extract_json_ld(html):
        geo = block.get("geo") or {}
        if isinstance(geo, dict) and geo.get("latitude") and geo.get("longitude"):
            return float(geo["latitude"]), float(geo["longitude"]), "OFFICIAL_COORDINATE"
        if block.get("latitude") and block.get("longitude"):
            return float(block["latitude"]), float(block["longitude"]), "OFFICIAL_COORDINATE"
    return None, None, ""


def extract_address_bits(html: str) -> dict:
    """Best-effort postal / city / street from JSON-LD or visible address patterns."""
    out = {"address": "", "postal_code": "", "city": "", "name": ""}
    for block in extract_json_ld(html):
        t = block.get("@type")
        types = t if isinstance(t, list) else [t]
        if not any(
            x and ("Place" in str(x) or "LocalBusiness" in str(x) or "SportsActivityLocation" in str(x) or "ExerciseGym" in str(x) or "Organization" in str(x))
            for x in types
        ) and "address" not in block:
            continue
        if block.get("name") and not out["name"]:
            out["name"] = unescape(str(block["name"]))
        addr = block.get("address")
        if isinstance(addr, dict):
            street = unescape(str(addr.get("streetAddress") or ""))
            city = unescape(str(addr.get("addressLocality") or ""))
            postal = pl_postal(addr.get("postalCode") or "")
            if street:
                out["address"] = street
            if city:
                out["city"] = city
            if postal:
                out["postal_code"] = postal
        elif isinstance(addr, str) and addr.strip():
            out["address"] = unescape(addr)
            pc = pl_postal(addr)
            if pc:
                out["postal_code"] = pc
    # Visible "NN-NNN City" patterns
    if not out["postal_code"]:
        m = re.search(r"\b(\d{2}-\d{3})\s+([A-ZĄĆĘŁŃÓŚŹŻ][^<\n,]{2,40})", html)
        if m:
            out["postal_code"] = m.group(1)
            if not out["city"]:
                out["city"] = unescape(m.group(2)).strip()
    if not out["address"]:
        m = re.search(
            r"(?:ul\.|al\.|Aleja|Pl\.|Plac|os\.|rondo)\s*[^<\n]{3,80}",
            html,
            re.I,
        )
        if m:
            out["address"] = unescape(re.sub(r"<[^>]+>", "", m.group(0)))
    return out


def base_row(**kwargs) -> dict:
    r = {
        "id": "",
        "brand": "",
        "chain": "",
        "name": "",
        "center_name": "",
        "address": "",
        "postal_code": "",
        "city": "",
        "country": "Poland",
        "voivodeship": None,
        "lat": None,
        "lng": None,
        "opening_hours": None,
        "website": None,
        "source_url": "",
        "source_type": "",
        "verification_status": "UNVERIFIED",
        "notes": "",
        "is_active": True,
        "import_category": "NEEDS_REVIEW",
        "phase": "poland_phase1",
        "coord_source": None,
        "legacy_brand": None,
        "official_location_id": None,
        "discovery_class": "national_chain",
    }
    r.update(kwargs)
    return r


def classify_row(r: dict) -> dict:
    reasons = []
    if not r.get("name"):
        reasons.append("missing_name")
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address"):
        reasons.append("missing_address")
    pc = r.get("postal_code") or ""
    if not PL_POSTAL_RE.match(str(pc)):
        reasons.append("bad_postal")
    if not r.get("city") or str(r.get("city")).isdigit():
        reasons.append("bad_city")
    if r.get("country") != "Poland":
        reasons.append("bad_country")
    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
        reasons.append("bad_coords")
    if lat_f is None or lng_f is None or not math.isfinite(lat_f) or not math.isfinite(lng_f):
        if "bad_coords" not in reasons:
            reasons.append("missing_coords")
    else:
        fh = foreign_hint(lat_f, lng_f, r.get("city") or "", r.get("address") or "")
        if fh:
            reasons.append(fh)
    blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
    if MOJIBAKE_RE.search(blob):
        reasons.append("mojibake")
    notes_l = (r.get("notes") or "").lower()
    name_l = (r.get("name") or "").lower()
    if any(x in notes_l or x in name_l for x in ("coming soon", "wkrótce", "wkrotce", "otwarcie", "opening soon")):
        r["import_category"] = "COMING_SOON"
        r["is_active"] = False
        r["verification_status"] = "COMING_SOON"
        return r
    if any(x in notes_l or x in name_l for x in ("closed", "zamknięt", "zamkniet", "nieczynny")):
        r["import_category"] = "CLOSED"
        r["is_active"] = False
        r["verification_status"] = "CLOSED"
        return r
    if "missing_coords" in reasons or "bad_coords" in reasons:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["notes"] = (r.get("notes") or "") + f"; classify={','.join(reasons)}"
        return r
    hard = [x for x in reasons if x not in ("missing_coords",)]
    if hard:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = (r.get("notes") or "") + f"; classify={','.join(reasons)}"
        return r
    r["import_category"] = "READY_TO_IMPORT"
    r["is_active"] = True
    r["verification_status"] = "VERIFIED_CURRENT"
    return r


# ─── CityFit ───────────────────────────────────────────────────────
def discover_cityfit() -> list[dict]:
    sm = fetch_cached("https://cityfit.pl/clubs-sitemap.xml", RAW / "cityfit/clubs-sitemap.xml")
    locs = re.findall(r"<loc>(.*?)</loc>", sm)
    preferred: dict[str, str] = {}
    for u in locs:
        m = re.search(r"/kluby/([^/]+)/?", u)
        if not m:
            continue
        slug = m.group(1)
        if "/ru/" in u or "/uk/" in u:
            preferred.setdefault(slug, u)
            continue
        preferred[slug] = u  # pl / en overwrite
    rows = []
    urls = list(preferred.items())
    log(f"CityFit: {len(urls)} unique club slugs")

    def one(slug_url):
        slug, url = slug_url
        # Prefer Polish path
        pl_url = f"https://cityfit.pl/kluby/{slug}/"
        dest = PAGES / "cityfit" / f"{slug}.html"
        html = fetch_cached(pl_url, dest)
        used = pl_url
        if not html or len(html) < 500:
            html = fetch_cached(url, dest, force=True)
            used = url
        if not html:
            return None
        bits = extract_address_bits(html)
        lat, lng, csrc = extract_coords_from_html(html)
        name = bits.get("name") or f"CityFit {slug.replace('-', ' ').title()}"
        # CityFit titles often "CityFit Warszawa ..."
        m = re.search(r"<title>([^<]+)</title>", html, re.I)
        if m:
            title = unescape(m.group(1).split("|")[0].split("–")[0].split("-")[0]).strip()
            if "cityfit" in title.lower():
                name = title
        city = bits.get("city") or ""
        if not city:
            # slug city token
            city = slug.split("-")[0].replace("lodz", "Łódź").title()
        row = base_row(
            brand="CityFit",
            chain="CityFit",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=city,
            lat=lat,
            lng=lng,
            source_url=used,
            source_type="cityfit_official_club_page",
            coord_source=csrc or None,
            website=used,
            official_location_id=slug,
            notes=f"cityfit_slug={slug}",
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        return classify_row(row)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(one, x) for x in urls]
        for fut in as_completed(futs):
            r = fut.result()
            if r:
                rows.append(r)
            time.sleep(0.05)
    return rows


# ─── Just GYM ─────────────────────────────────────────────────────
def discover_justgym() -> list[dict]:
    listing = fetch_cached("https://justgym.pl/silownie", RAW / "justgym/silownie.html")
    hrefs = re.findall(r'href=["\']([^"\']*silownie[^"\']*)["\']', listing, re.I)
    urls = []
    for h in hrefs:
        if h.startswith("/"):
            h = "https://justgym.pl" + h
        if not h.startswith("http"):
            continue
        h = h.split("#")[0].split("?")[0].rstrip("/")
        if h.count("/") < 4:  # skip /silownie root and city-only hubs optionally keep deep
            # keep city hubs too — they may be single clubs
            pass
        if re.search(r"/silownie/.+", h):
            urls.append(h)
    urls = sorted(set(urls))
    # Filter city index pages that only list children: keep pages with 3+ path parts after silownie OR known leaf
    leaf = []
    for u in urls:
        parts = u.split("/silownie/")[-1].split("/")
        if len(parts) >= 1 and parts[0]:
            leaf.append(u)
    log(f"Just GYM: {len(leaf)} club/city URLs")
    rows = []

    def one(url: str):
        slug = url.split("/silownie/")[-1].replace("/", "__")
        dest = PAGES / "justgym" / f"{slug}.html"
        html = fetch_cached(url, dest)
        if not html or len(html) < 800:
            return None
        # Skip pure city hubs that link to multiple clubs without own address
        bits = extract_address_bits(html)
        lat, lng, csrc = extract_coords_from_html(html)
        if not bits.get("address") and not bits.get("postal_code") and lat is None:
            # city hub
            child_links = re.findall(rf'href=["\']({re.escape(url)}/[^"\'#?]+)', html)
            if child_links:
                return None
        name = bits.get("name") or ""
        if not name:
            m = re.search(r"<title>([^<]+)</title>", html, re.I)
            if m:
                name = unescape(m.group(1).split("|")[0].split("–")[0]).strip()
        if not name:
            name = "Just GYM " + url.split("/silownie/")[-1].replace("/", " ").replace("-", " ").title()
        if "just gym" not in name.lower() and "justgym" not in name.lower():
            name = f"Just GYM {name}"
        city = bits.get("city") or url.split("/silownie/")[-1].split("/")[0].replace("-", " ").title()
        row = base_row(
            brand="Just GYM",
            chain="Just GYM",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=city,
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="justgym_official_club_page",
            coord_source=csrc or None,
            website=url,
            notes=f"justgym_path={url.split('/silownie/')[-1]}",
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        return classify_row(row)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(one, u) for u in leaf]
        for fut in as_completed(futs):
            r = fut.result()
            if r:
                rows.append(r)
            time.sleep(0.04)
    return rows


# ─── Calypso ───────────────────────────────────────────────────────
def discover_calypso() -> list[dict]:
    html = fetch_cached("https://www.calypso.com.pl/nasze-kluby/", RAW / "calypso/nasze-kluby.html")
    # club page links
    hrefs = re.findall(r'href=["\'](https://www\.calypso\.com\.pl/[^"\']+)["\']', html, re.I)
    club_urls = []
    for h in hrefs:
        h = h.split("#")[0].split("?")[0].rstrip("/")
        if any(x in h for x in ("/klub", "/fitness", "/nasze-kluby/")) and h.count("/") >= 4:
            if "nasze-kluby" == h.rstrip("/").split("/")[-1]:
                continue
            club_urls.append(h)
    # also relative
    for h in re.findall(r'href=["\'](/(?:klub|fitness)[^"\']+)["\']', html, re.I):
        club_urls.append("https://www.calypso.com.pl" + h.split("#")[0].split("?")[0].rstrip("/"))
    club_urls = sorted(set(club_urls))
    log(f"Calypso: {len(club_urls)} candidate URLs from listing")
    rows = []
    for url in club_urls:
        slug = re.sub(r"\W+", "_", url.split(".pl/")[-1])[:80]
        page = fetch_cached(url, PAGES / "calypso" / f"{slug}.html")
        if not page or len(page) < 800:
            continue
        bits = extract_address_bits(page)
        lat, lng, csrc = extract_coords_from_html(page)
        if not bits.get("address") and lat is None:
            continue
        name = bits.get("name") or f"Calypso Fitness {bits.get('city') or slug}"
        row = base_row(
            brand="Calypso Fitness",
            chain="Calypso Fitness",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=bits.get("city") or "",
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="calypso_official_page",
            coord_source=csrc or None,
            website=url,
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify_row(row))
        time.sleep(0.08)
    return rows


# ─── Fitness Platinium ─────────────────────────────────────────────
def discover_platinium() -> list[dict]:
    home = fetch_cached("https://fitnessplatinium.pl/", RAW / "platinium/home.html")
    # try sitemap
    sm = fetch_cached("https://fitnessplatinium.pl/sitemap.xml", RAW / "platinium/sitemap.xml")
    locs = re.findall(r"<loc>(.*?)</loc>", sm) if sm else []
    club_urls = [u for u in locs if re.search(r"klub|silown|lokaliz|fitness-platinium", u, re.I)]
    if not club_urls:
        club_urls = re.findall(r'href=["\'](https://fitnessplatinium\.pl/[^"\']+)["\']', home or "", re.I)
        club_urls = [u.split("#")[0].rstrip("/") for u in club_urls if "klub" in u.lower() or "silown" in u.lower()]
    club_urls = sorted(set(club_urls))
    log(f"Fitness Platinium: {len(club_urls)} URLs")
    rows = []
    for url in club_urls[:80]:
        slug = re.sub(r"\W+", "_", url.split(".pl/")[-1])[:80] or "home"
        page = fetch_cached(url, PAGES / "platinium" / f"{slug}.html")
        if not page:
            continue
        bits = extract_address_bits(page)
        lat, lng, csrc = extract_coords_from_html(page)
        if not bits.get("address") and not bits.get("postal_code"):
            continue
        name = bits.get("name") or f"Fitness Platinium {bits.get('city') or ''}".strip()
        row = base_row(
            brand="Fitness Platinium",
            chain="Fitness Platinium",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=bits.get("city") or "",
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="platinium_official_page",
            coord_source=csrc or None,
            website=url,
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify_row(row))
        time.sleep(0.08)
    return rows


# ─── Well Fitness ──────────────────────────────────────────────────
def discover_well() -> list[dict]:
    home = fetch_cached("https://wellfitness.pl/", RAW / "well/home.html")
    sm = fetch_cached("https://wellfitness.pl/sitemap_index.xml", RAW / "well/sitemap_index.xml")
    if not sm:
        sm = fetch_cached("https://wellfitness.pl/sitemap.xml", RAW / "well/sitemap.xml")
    locs = re.findall(r"<loc>(.*?)</loc>", sm or "")
    # follow nested sitemaps lightly
    nested = [u for u in locs if "sitemap" in u and u.endswith(".xml")]
    for nu in nested[:8]:
        body = fetch_cached(nu, RAW / "well" / (re.sub(r"\W+", "_", nu)[-60:] + ".xml"))
        locs.extend(re.findall(r"<loc>(.*?)</loc>", body or ""))
    club_urls = [
        u.rstrip("/")
        for u in locs
        if re.search(r"/klub|/silown|/lokaliz|/fitness-club|/nasze", u, re.I)
        and "sitemap" not in u
    ]
    if not club_urls and home:
        club_urls = [
            ("https://wellfitness.pl" + h if h.startswith("/") else h).split("#")[0].rstrip("/")
            for h in re.findall(r'href=["\']([^"\']+)["\']', home)
            if re.search(r"klub|silown|lokaliz", h, re.I)
        ]
        club_urls = [u for u in club_urls if u.startswith("http")]
    club_urls = sorted(set(club_urls))
    log(f"Well Fitness: {len(club_urls)} URLs")
    rows = []
    for url in club_urls[:150]:
        slug = re.sub(r"\W+", "_", url.split(".pl/")[-1])[:80] or "x"
        page = fetch_cached(url, PAGES / "well" / f"{slug}.html")
        if not page or len(page) < 600:
            continue
        bits = extract_address_bits(page)
        lat, lng, csrc = extract_coords_from_html(page)
        if not bits.get("address") and not bits.get("postal_code") and lat is None:
            continue
        name = bits.get("name") or f"Well Fitness {bits.get('city') or ''}".strip()
        row = base_row(
            brand="Well Fitness",
            chain="Well Fitness",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=bits.get("city") or "",
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="wellfitness_official_page",
            coord_source=csrc or None,
            website=url,
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify_row(row))
        time.sleep(0.06)
    return rows


# ─── Xtreme Fitness ────────────────────────────────────────────────
def discover_xtreme() -> list[dict]:
    home = fetch_cached("https://xtremefitness.pl/", RAW / "xtreme/home.html")
    sm = fetch_cached("https://xtremefitness.pl/sitemap.xml", RAW / "xtreme/sitemap.xml")
    locs = re.findall(r"<loc>(.*?)</loc>", sm or "")
    club_urls = [u.rstrip("/") for u in locs if re.search(r"klub|silown|lokal|gym", u, re.I)]
    if home:
        for h in re.findall(r'href=["\'](https://xtremefitness\.pl/[^"\']+)["\']', home):
            if re.search(r"klub|silown|lokal", h, re.I):
                club_urls.append(h.split("#")[0].rstrip("/"))
    club_urls = sorted(set(club_urls))
    log(f"Xtreme Fitness: {len(club_urls)} URLs")
    rows = []
    for url in club_urls[:200]:
        slug = re.sub(r"\W+", "_", url.split(".pl/")[-1])[:80] or "x"
        page = fetch_cached(url, PAGES / "xtreme" / f"{slug}.html")
        if not page:
            continue
        # franchise / coming soon signals
        low = page.lower()
        notes = ""
        if "franczyz" in low or "franchise" in low and "otwart" not in low:
            notes = "possible_franchise_marketing"
        bits = extract_address_bits(page)
        lat, lng, csrc = extract_coords_from_html(page)
        if not bits.get("address") and not bits.get("postal_code"):
            continue
        name = bits.get("name") or f"Xtreme Fitness {bits.get('city') or ''}".strip()
        row = base_row(
            brand="Xtreme Fitness Gyms",
            chain="Xtreme Fitness Gyms",
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=bits.get("city") or "",
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="xtreme_official_page",
            coord_source=csrc or None,
            website=url,
            notes=notes,
        )
        if "wkrótce" in low or "coming soon" in low or "otwarcie" in low and "godzin" not in low:
            row["notes"] = (row["notes"] or "") + "; coming_soon_signal"
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify_row(row))
        time.sleep(0.06)
    return rows


# ─── Fabryka Formy (Premium / Benefit) ─────────────────────────────
def discover_fabryka() -> list[dict]:
    html = fetch_cached("https://premium.pl/fabrykaformy.pl", RAW / "fabryka/premium_hub.html")
    # Also try kluby paths on premium
    urls = []
    for u in [
        "https://www.fabrykaformy.pl/",
        "https://premium.pl/fabrykaformy.pl",
        "https://www.zdrofit.pl/",
    ]:
        page = fetch_cached(u, RAW / "fabryka" / (re.sub(r"\W+", "_", u) + ".html"))
        if not page:
            continue
        for h in re.findall(r'href=["\']([^"\']+)["\']', page):
            if re.search(r"klub|silown|lokaliz|fabryka", h, re.I):
                if h.startswith("/"):
                    base = "https://premium.pl" if "premium.pl" in u else u.rstrip("/")
                    h = base + h
                if h.startswith("http"):
                    urls.append(h.split("#")[0].rstrip("/"))
    urls = sorted(set(urls))[:120]
    log(f"Fabryka Formy / related: {len(urls)} URLs (may include hubs)")
    rows = []
    for url in urls:
        slug = re.sub(r"\W+", "_", url)[-70:]
        page = fetch_cached(url, PAGES / "fabryka" / f"{slug}.html")
        if not page or len(page) < 800:
            continue
        bits = extract_address_bits(page)
        lat, lng, csrc = extract_coords_from_html(page)
        if not bits.get("address") and not bits.get("postal_code"):
            continue
        # Brand detection from page
        brand = "Fabryka Formy"
        if re.search(r"zdrofit", page, re.I):
            brand = "Zdrofit"
        name = bits.get("name") or f"{brand} {bits.get('city') or ''}".strip()
        row = base_row(
            brand=brand,
            chain=brand,
            name=name,
            center_name=name,
            address=bits.get("address") or "",
            postal_code=bits.get("postal_code") or "",
            city=bits.get("city") or "",
            lat=lat,
            lng=lng,
            source_url=url,
            source_type="fabryka_or_premium_page",
            coord_source=csrc or None,
            website=url,
            notes="benefit_systems_related_candidate",
        )
        row["id"] = make_id(row["brand"], row["address"], row["postal_code"], row["city"])
        rows.append(classify_row(row))
        time.sleep(0.08)
    return rows


def main():
    all_rows: list[dict] = []
    discoverers = [
        ("CityFit", discover_cityfit),
        ("JustGYM", discover_justgym),
        ("Calypso", discover_calypso),
        ("Platinium", discover_platinium),
        ("Well", discover_well),
        ("Xtreme", discover_xtreme),
        ("Fabryka", discover_fabryka),
    ]
    summary = {}
    for label, fn in discoverers:
        log(f"=== Discover {label} ===")
        try:
            rows = fn()
        except Exception as e:
            log(f"ERROR {label}: {e}")
            rows = []
        summary[label] = len(rows)
        all_rows.extend(rows)
        (SCRAPES / f"{label.lower()}_raw.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        log(f"{label}: {len(rows)} rows")

    (OUT / "poland_discovery_combined.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "poland_discovery_summary.json").write_text(
        json.dumps({"by_source": summary, "total": len(all_rows)}, indent=2) + "\n",
        encoding="utf-8",
    )
    log("DONE discovery", summary, "total", len(all_rows))


if __name__ == "__main__":
    main()
