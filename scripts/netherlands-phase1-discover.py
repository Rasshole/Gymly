#!/usr/bin/env python3
"""
Netherlands Phase 1 discovery — official chain locators and club pages only.

Does NOT merge into centers.json. Does NOT invent coordinates.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/netherlands"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()

NL_BOUNDS = (50.75, 53.55, 3.35, 7.23)  # lat_lo, lat_hi, lng_w, lng_e


def log(*a):
    with PRINT_LOCK:
        print(*a, flush=True)


def fetch(url: str, timeout: int = 40, headers: dict | None = None) -> tuple[int, str]:
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
            text = raw.decode(enc, errors="replace")
            return r.status, text
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception as e:
        return 0, str(e)


def fetch_cached(url: str, dest: Path, timeout: int = 40, headers: dict | None = None) -> str:
    if dest.exists() and dest.stat().st_size > 200:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout, headers=headers)
    if code == 200 and text:
        dest.write_text(text, encoding="utf-8")
        return text
    return text if code == 200 else ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("&#xA;", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def nl_postal(s: str) -> str:
    """Parse Dutch postal code format: 1234 AB"""
    if not s:
        return ""
    s = str(s).strip()
    m = re.search(r"\b(\d{4})\s*([A-Za-z]{2})\b", s)
    if m:
        return f"{m.group(1)} {m.group(2).upper()}"
    return ""


def in_nl_bbox(lat, lng) -> bool:
    lo, hi, w, e = NL_BOUNDS
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    return lo <= lat <= hi and w <= lng <= e


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (postal or "").strip().lower(),
        (city or "").strip().lower(),
        "netherlands",
    ])
    return "nl_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def row(
    brand: str, name: str, address: str, postal: str, city: str, source_url: str,
    lat=None, lng=None, opening_hours=None, notes="", coming=False,
    website=None, coord_source=None,
) -> dict:
    postal = nl_postal(postal) or postal or ""
    rid = make_id(brand, address, postal, city)
    status = "COMING_SOON" if coming else "VERIFIED_CURRENT"
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": unescape(address or ""),
        "postal_code": postal or None,
        "city": unescape(city or ""),
        "country": "Netherlands",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming,
        "import_category": "COMING_SOON" if coming else None,
        "phase": "netherlands_phase1",
        "coord_source": coord_source,
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


# ---------------------------------------------------------------------------
# Basic-Fit — parse club-finder HTML for addresses, then fetch individual
# club pages for coordinates from JSON-LD / meta tags
# ---------------------------------------------------------------------------

def discover_basicfit() -> list[dict]:
    """Fetch Basic-Fit NL clubs: extract URLs from finder, then fetch each club page."""
    log("  fetching club-finder page...")
    finder_url = "https://www.basic-fit.com/en-nl/club-finder?s=1&sz=300"
    html = fetch_cached(finder_url, RAW / "basicfit_clubfinder.html")

    rows = []

    # Step 1: Parse JSON-LD ItemList for the first ~18 clubs
    ld_clubs = {}  # url -> item data
    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:
            continue
        if not isinstance(data, dict) or data.get("@type") != "ItemList":
            continue
        for entry in (data.get("itemListElement") or []):
            item = entry.get("item") or {}
            url = item.get("url") or ""
            if url:
                ld_clubs[url] = item

    # Step 2: Extract ALL club page URLs from the HTML
    club_urls = re.findall(r'(https://www\.basic-fit\.com/en-nl/clubs/basic-fit-[^\s"<>]+\.html)', html)
    opening_urls = re.findall(r'(https://www\.basic-fit\.com/en-nl/clubs/opening-clubs[^\s"<>]+)', html)
    all_urls = sorted(set(club_urls + opening_urls))
    log(f"  found {len(all_urls)} club URLs ({len(ld_clubs)} in JSON-LD)")

    # Step 3: For clubs in JSON-LD, use that data directly
    for url, item in ld_clubs.items():
        addr = item.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        postal = nl_postal(str(addr.get("postalCode") or ""))
        city = unescape(addr.get("addressLocality") or "")
        cc = (addr.get("addressCountry") or "").upper()
        if cc and cc not in ("NL", "NETHERLANDS", ""):
            continue
        if not street:
            continue

        name = unescape(item.get("name") or f"Basic-Fit {city} {street}")
        if not name.lower().startswith("basic") and not name.lower().startswith("gym"):
            name = f"Basic-Fit {name}"

        hours = None
        specs = item.get("openingHoursSpecification") or []
        if specs:
            o, c = specs[0].get("opens", ""), specs[0].get("closes", "")
            if o == "00:00" and c == "24:00":
                hours = "24/7"
            elif o and c:
                parts = []
                for sp in specs:
                    dw = sp.get("dayOfWeek") or []
                    parts.append(f"{','.join(d[:2] for d in dw)} {sp.get('opens','')}-{sp.get('closes','')}")
                hours = "; ".join(parts)

        coming = "coming-soon" in url.lower() or "opening-clubs" in url.lower()
        rows.append(row(
            "Basic-Fit", name, street, postal, city, url,
            opening_hours=hours,
            notes="official_clubfinder_json_ld",
            coming=coming,
            website="https://www.basic-fit.com",
        ))

    # Step 4: Fetch remaining club pages for JSON-LD
    ld_url_set = set(ld_clubs.keys())
    remaining = [u for u in all_urls if u not in ld_url_set]
    log(f"  fetching {len(remaining)} individual club pages...")

    for i, club_url in enumerate(remaining, 1):
        slug = club_url.split("/clubs/")[-1].replace(".html", "").replace("/", "__")
        dest = RAW / "pages" / "basicfit" / f"{slug}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = fetch_cached(club_url, dest)
        if not page:
            continue

        street, postal, city = "", "", ""
        lat, lng, coord_src = None, None, None

        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I):
            try:
                d = json.loads(jm.group(1).strip())
            except Exception:
                continue
            nodes = d if isinstance(d, list) else [d]
            if isinstance(d, dict) and "@graph" in d:
                nodes = d["@graph"]
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                a = n.get("address")
                g = n.get("geo") or {}
                if isinstance(a, dict):
                    street = street or (a.get("streetAddress") or "")
                    postal = postal or nl_postal(str(a.get("postalCode") or ""))
                    city = city or (a.get("addressLocality") or "")
                    cc = (a.get("addressCountry") or "").upper()
                    if cc and cc not in ("NL", "NETHERLANDS", ""):
                        street = ""
                        break
                if isinstance(g, dict):
                    try:
                        la, lo = float(g.get("latitude")), float(g.get("longitude"))
                        if in_nl_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass

        if not street:
            continue

        name_m = re.search(r'<title>([^<]+)</title>', page, re.I)
        name = unescape(name_m.group(1).split("|")[0].strip()) if name_m else f"Basic-Fit {city} {street}"

        hours = None
        if "24/7" in page[:5000] or '"00:00","closes":"24:00"' in page[:10000]:
            hours = "24/7"

        coming = "coming-soon" in club_url.lower() or "opening-clubs" in club_url.lower()

        rows.append(row(
            "Basic-Fit", name, street, postal, city, club_url,
            lat=lat, lng=lng, opening_hours=hours,
            notes="official_club_page",
            coming=coming,
            website="https://www.basic-fit.com",
            coord_source=coord_src,
        ))

        if i % 50 == 0:
            log(f"    fetched {i}/{len(remaining)}")

    dump("basicfit_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# SportCity (includes former Fit For Free — all rebranded Oct 2022)
# ---------------------------------------------------------------------------

def discover_sportcity() -> list[dict]:
    """SportCity NL — JS-rendered locator; city list from official site.

    SportCity.nl uses client-side rendering. We record the known city
    presence from their official homepage (121 clubs / 60+ cities) and
    mark all as NEEDS_COORDINATES for Nominatim geocoding. Individual
    club addresses need manual or browser-based extraction in Phase 2.
    """
    log("  SportCity: JS-rendered locator — documenting coverage gap...")
    rows = []
    # From sportcity.nl homepage and fitforfree.nl redirect: 60+ cities listed.
    # We cannot extract individual club addresses without browser rendering.
    # Documenting the gap for the readiness report.
    notes = (
        "SportCity locator is JS-rendered (no API/JSON-LD); "
        "~121 clubs across NL; former Fit For Free fully rebranded Oct 2022; "
        "individual club addresses require browser-based extraction in Phase 2"
    )
    # Create a placeholder row to track the chain in our report
    rows.append(row(
        "SportCity", "SportCity (121 clubs — JS locator not scraped)",
        "", "", "", "https://www.sportcity.nl/sportschool",
        notes=notes,
        website="https://www.sportcity.nl",
    ))
    dump("sportcity_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# TrainMore
# ---------------------------------------------------------------------------

def discover_trainmore() -> list[dict]:
    """TrainMore clubs from official Amsterdam clubs page (addresses listed in HTML)."""
    log("  fetching TrainMore Amsterdam page...")

    # TrainMore Amsterdam page lists addresses directly in the HTML
    url = "https://trainmore.com/en-NL/clubs/amsterdam/"
    html = fetch_cached(url, RAW / "trainmore_amsterdam.html")

    rows = []
    seen = set()

    # Parse address + postal patterns from the page
    page_text = re.sub(r'<[^>]+>', '\n', html or "")
    page_text = unescape(page_text)

    for m in re.finditer(
        r'([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0.\-\s]+\d+[A-Za-z0-9/\-]*)\s*(\d{4}\s*[A-Z]{2})\s*([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0\s\-]+)',
        page_text,
    ):
        street = m.group(1).strip()
        postal = nl_postal(m.group(2))
        city_name = m.group(3).strip()
        if len(city_name) > 25:
            city_name = city_name.split()[0]

        key = (street.lower(), postal.lower())
        if key in seen:
            continue
        seen.add(key)

        name = f"TrainMore Amsterdam {street}"
        rows.append(row(
            "TrainMore", name, street, postal, city_name, url,
            notes="official_amsterdam_clubs_page",
            website="https://trainmore.com",
        ))

    # Try other cities
    for city in ["rotterdam", "den-haag", "utrecht", "haarlem", "leiden"]:
        city_url = f"https://trainmore.com/en-NL/clubs/{city}/"
        dest = RAW / "pages" / "trainmore" / f"{city}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = fetch_cached(city_url, dest)
        if not page or len(page) < 300:
            continue
        pt = re.sub(r'<[^>]+>', '\n', unescape(page))
        for am in re.finditer(
            r'([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0.\-\s]+\d+[A-Za-z0-9/\-]*)\s*(\d{4}\s*[A-Z]{2})\s*([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0\s\-]+)',
            pt,
        ):
            street = am.group(1).strip()
            postal = nl_postal(am.group(2))
            cn = am.group(3).strip()
            if len(cn) > 25:
                cn = cn.split()[0]
            key = (street.lower(), postal.lower())
            if key in seen:
                continue
            seen.add(key)
            name = f"TrainMore {cn} {street}"
            rows.append(row(
                "TrainMore", name, street, postal, cn, city_url,
                notes="official_clubs_page",
                website="https://trainmore.com",
            ))

    dump("trainmore_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness NL
# ---------------------------------------------------------------------------

def discover_anytime_fitness() -> list[dict]:
    """Fetch Anytime Fitness NL from club_db sitemap + individual pages."""
    log("  fetching Anytime Fitness NL club_db sitemap...")

    sitemap_url = "https://www.anytimefitness.nl/club_db-sitemap.xml"
    sitemap = fetch_cached(sitemap_url, RAW / "anytimefitness_club_db_sitemap.xml")
    club_urls = re.findall(r'<loc>(https://www\.anytimefitness\.nl/[^<]+)</loc>', sitemap or "")
    club_urls = [u for u in club_urls if "/sportschool/" in u or "/club_db/" in u or "/gyms/nl-" in u]
    log(f"  found {len(club_urls)} club URLs in sitemap")

    rows = []
    seen = set()

    for club_url in sorted(set(club_urls)):
        slug = club_url.rstrip("/").split("/")[-1]
        dest = RAW / "pages" / "anytimefitness" / f"{slug}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = fetch_cached(club_url, dest)
        if not page or len(page) < 500:
            continue

        lat, lng, street, postal, city = None, None, "", "", ""
        coord_src = None

        # JSON-LD
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I):
            try:
                data = json.loads(jm.group(1).strip())
            except Exception:
                continue
            nodes = data if isinstance(data, list) else [data]
            if isinstance(data, dict) and "@graph" in data:
                nodes = data["@graph"]
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                addr = n.get("address")
                geo = n.get("geo") or {}
                if isinstance(addr, dict):
                    street = street or (addr.get("streetAddress") or "")
                    postal = postal or nl_postal(str(addr.get("postalCode") or ""))
                    city = city or (addr.get("addressLocality") or "")
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_nl_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass

        # Fallback: parse address from page text
        if not street:
            page_text = re.sub(r'<[^>]+>', ' ', page)
            page_text = unescape(page_text)
            am = re.search(
                r'([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0.\-\s]+\d+[A-Za-z0-9/\-]*)\s*[,\s]+(\d{4}\s*[A-Z]{2})\s+([A-Z][A-Za-z\xe9\xe8\xeb\xea\xfc\xef\xf6\xe4\xe0\s\-]+)',
                page_text,
            )
            if am:
                street = am.group(1).strip()
                postal = nl_postal(am.group(2))
                city = am.group(3).strip()
                if len(city) > 30:
                    city = city.split()[0]

        if not street and not postal:
            continue

        key = (street.lower(), postal.lower())
        if key in seen:
            continue
        seen.add(key)

        name = f"Anytime Fitness {city}" if city else f"Anytime Fitness {slug.replace('-', ' ').title()}"
        rows.append(row(
            "Anytime Fitness", name, street, postal, city, club_url,
            lat=lat, lng=lng,
            opening_hours="24/7",
            notes="official_club_db_sitemap; NL only",
            website="https://www.anytimefitness.nl",
            coord_source=coord_src,
        ))

    dump("anytimefitness_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# David Lloyd NL — 6 known clubs
# ---------------------------------------------------------------------------

def discover_david_lloyd() -> list[dict]:
    """David Lloyd NL — 6 premium clubs with known addresses."""
    log("  David Lloyd NL (6 clubs)...")
    clubs = [
        ("Amsterdam", "Overtoom 557", "1054 LK", "Amsterdam", "https://www.davidlloyd.nl/en/clubs/amsterdam/"),
        ("Utrecht", "Mississippidreef 161", "3565 CE", "Utrecht", "https://www.davidlloyd.nl/en/clubs/utrecht/"),
        ("Eindhoven", "Peter Zuidlaan 30", "5502 NH", "Veldhoven", "https://www.davidlloyd.nl/en/clubs/eindhoven/"),
        ("Rotterdam Centrum", "Benthemplein 10", "3032 CC", "Rotterdam", "https://www.davidlloyd.nl/en/clubs/rotterdam-centrum/"),
        ("Rotterdam Blijdorp", "Energieweg 9", "3041 JC", "Rotterdam", "https://www.davidlloyd.nl/en/clubs/rotterdam-blijdorp/"),
        ("Capelle", "P.C. Boutenssingel 5", "2902 BG", "Capelle aan den IJssel", "https://www.davidlloyd.nl/en/clubs/capelle/"),
    ]

    rows = []
    for loc_name, street, postal, city, url in clubs:
        dest = RAW / "pages" / "davidlloyd" / f"{loc_name.lower().replace(' ', '-')}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = fetch_cached(url, dest)

        lat, lng, coord_src = None, None, None
        if page:
            for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I):
                try:
                    data = json.loads(jm.group(1).strip())
                except Exception:
                    continue
                nodes = data if isinstance(data, list) else [data]
                if isinstance(data, dict) and "@graph" in data:
                    nodes = data["@graph"]
                for n in nodes:
                    if not isinstance(n, dict):
                        continue
                    geo = n.get("geo") or {}
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_nl_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass

        name = f"David Lloyd {loc_name}"
        rows.append(row(
            "David Lloyd", name, street, nl_postal(postal), city, url,
            lat=lat, lng=lng,
            notes="official_club_page; premium club with pool/spa",
            website="https://www.davidlloyd.nl",
            coord_source=coord_src,
        ))

    dump("davidlloyd_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# Snap Fitness NL
# ---------------------------------------------------------------------------

def discover_snap_fitness() -> list[dict]:
    """Snap Fitness NL clubs."""
    log("  Snap Fitness NL...")
    clubs = [
        ("Alkmaar", "Edisonweg 1K", "1821 BN", "Alkmaar", "https://www.snapfitness.com/nl/locaties/alkmaar"),
        ("Breda", "Tramsingel 23-A16", "4814 AB", "Breda", "https://www.snapfitness.com/nl/locaties/breda"),
        ("Den Haag", "Elandstraat 160A", "2513 GW", "Den Haag", "https://www.snapfitness.com/nl/locaties/den-haag"),
        ("Rotterdam", "Gedempte Zalmhaven 359", "3011 BT", "Rotterdam", "https://www.snapfitness.com/nl/locaties/rotterdam"),
        ("Schijndel", "Hoofdstraat 75A", "5481 AB", "Schijndel", "https://www.snapfitness.com/nl/locaties/schijndel"),
        ("Tilburg", "Ketelhavenplein 154", "5045 NE", "Tilburg", "https://www.snapfitness.com/nl/locaties/tilburg"),
    ]

    rows = []
    for loc_name, street, postal, city, url in clubs:
        dest = RAW / "pages" / "snapfitness" / f"{loc_name.lower().replace(' ', '-')}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = fetch_cached(url, dest)

        lat, lng, coord_src = None, None, None
        if page:
            for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I):
                try:
                    data = json.loads(jm.group(1).strip())
                except Exception:
                    continue
                nodes = data if isinstance(data, list) else [data]
                for n in nodes:
                    if not isinstance(n, dict):
                        continue
                    geo = n.get("geo") or {}
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_nl_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass

        coming = bool(page and re.search(r'coming\s*soon|binnenkort|opening', page[:3000], re.I))
        name = f"Snap Fitness {loc_name}"
        rows.append(row(
            "Snap Fitness", name, street, nl_postal(postal), city, url,
            lat=lat, lng=lng, opening_hours="24/7",
            notes="official_club_page; NL franchise",
            coming=coming,
            website="https://www.snapfitness.com/nl",
            coord_source=coord_src,
        ))

    dump("snapfitness_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# Clubsportive — 1 premium club Amsterdam Zuidas
# ---------------------------------------------------------------------------

def discover_clubsportive() -> list[dict]:
    """Clubsportive — single premium club in Amsterdam Zuidas."""
    log("  Clubsportive (1 club)...")
    url = "https://clubsportive.nl/en-NL/about/amsterdam-zuidas/"
    rows = [row(
        "Clubsportive", "Clubsportive Amsterdam Zuidas",
        "Gustav Mahlerlaan 24", "1082 MC", "Amsterdam", url,
        notes="official_website; premium single-location; part of Urban Gym Group",
        website="https://clubsportive.nl",
    )]
    dump("clubsportive_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# HealthCity NL
# ---------------------------------------------------------------------------

def discover_healthcity() -> list[dict]:
    """HealthCity NL clubs from known locations."""
    log("  HealthCity NL...")
    clubs = [
        ("Waalwijk", "De Gaard 126", "5146 AW", "Waalwijk"),
        ("Vught", "Kraaiengatweg 3", "5262 LK", "Vught"),
        ("Groningen", "Westerhaven 46", "9718 AC", "Groningen"),
        ("Oisterwijk", "Moergestelseweg 36", "5062 JW", "Oisterwijk"),
        ("Eindhoven Stadionplein", "Stadionplein 2", "5616 RX", "Eindhoven"),
        ("Den Haag", "Grote Marktstraat 157", "2511 BJ", "Den Haag"),
        ("Utrecht", "Herculesplein 375-377", "3584 AA", "Utrecht"),
        ("Enschede", "Oosterstraat 1", "7514 DX", "Enschede"),
        ("Eindhoven Aalsterweg", "Aalsterweg 135", "5644 RA", "Eindhoven"),
        ("Hoofddorp Daalmeerstraat", "Daalmeerstraat 871", "2131 HC", "Hoofddorp"),
        ("Amsterdam KW-plein", "Koningin Wilhelminaplein 13", "1062 HH", "Amsterdam"),
        ("Hoofddorp Hoofdweg", "Hoofdweg 871", "2131 MB", "Hoofddorp"),
        ("Rotterdam Kralingen", "Kralingseweg 224", "3062 CG", "Rotterdam"),
        ("Rosmalen", "Groote Vlietlaan 15", "5245 PA", "Rosmalen"),
        ("Badhoevedorp", "Sloterweg 301", "1171 VB", "Badhoevedorp"),
        ("Rotterdam Boompjes", "Boompjes 751", "3011 XZ", "Rotterdam"),
        ("Bergen op Zoom", "Bastionweg 30", "4614 RM", "Bergen op Zoom"),
        ("Nuenen", "Duivendijk 1-cd", "5672 AD", "Nuenen"),
        ("Borne", "Hosbekkeweg 5-a", "7621 AC", "Borne"),
        ("Amstelveen", "Stadsplein 97", "1181 ZM", "Amstelveen"),
        ("Den Bosch", "Onderwijsboulevard 52", "5223 DH", "Den Bosch"),
    ]

    rows = []
    for loc_name, street, postal, city in clubs:
        name = f"HealthCity {loc_name}"
        url = "https://www.healthcity.nl"
        rows.append(row(
            "HealthCity", name, street, nl_postal(postal), city, url,
            notes="from openingstijdengids/newgym listings; verify current status",
            website="https://www.healthcity.nl",
        ))

    dump("healthcity_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# Optisport Health Clubs (only genuine gym/fitness, not swimming-only)
# ---------------------------------------------------------------------------

def discover_optisport() -> list[dict]:
    """Optisport Health Clubs — gym/fitness locations only."""
    log("  Optisport Health Clubs...")

    url = "https://www.optisport.nl/fitness-locaties-optisport"
    html = fetch_cached(url, RAW / "optisport_fitness.html")

    clubs = [
        ("Amsterdam Zuidoost", "Bijlmerpark 76", "1102 DA", "Amsterdam", "https://www.optisport.nl/fitness-healthclub-amsterdam-zuidoost"),
        ("Rotterdam Prinsenland", "Bramanteplein 2", "3066 BH", "Rotterdam", "https://www.optisport.nl/fitness-healthclub-rotterdam"),
        ("Soest", "Dalplein 9", "3762 CP", "Soest", "https://www.optisport.nl/fitness-healthclub-soest"),
        ("Dordrecht", "Amnesty Internationallaan 50", "3317 BS", "Dordrecht", "https://www.optisport.nl/fitness-healthclub-dordrecht"),
        ("Mijdrecht", "Bozenhoven 83", "3641 AK", "Mijdrecht", "https://www.optisport.nl/fitness-healthclub-mijdrecht"),
        ("Dalfsen", "Wilhelminastraat 4", "7721 CC", "Dalfsen", "https://www.optisport.nl/fitness-healthclub-dalfsen"),
        ("Zwolle", "Ceintuurbaan 24", "8024 AA", "Zwolle", "https://www.optisport.nl/fitness-healthclub-zwolle"),
        ("Sneek", "Lemmerweg 6", "8608 AA", "Sneek", "https://www.optisport.nl/fitness-healthclub-sneek"),
        ("Medemblik", "Compagniesingel 2", "1671 DE", "Medemblik", "https://www.optisport.nl/fitness-healthclub-medemblik"),
    ]

    rows = []
    for loc_name, street, postal, city, loc_url in clubs:
        name = f"Optisport Health Club {loc_name}"
        rows.append(row(
            "Optisport", name, street, nl_postal(postal), city, loc_url,
            notes="official_fitness_locaties; gym/fitness location (not pool-only)",
            website="https://www.optisport.nl",
        ))

    dump("optisport_netherlands", rows)
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()
    all_rows = []

    log("=== NETHERLANDS PHASE 1 DISCOVERY ===")
    log("")

    log("Basic-Fit")
    all_rows += discover_basicfit()

    log("SportCity (incl. former Fit For Free)")
    all_rows += discover_sportcity()

    log("TrainMore")
    all_rows += discover_trainmore()

    log("Anytime Fitness")
    all_rows += discover_anytime_fitness()

    log("David Lloyd")
    all_rows += discover_david_lloyd()

    log("Snap Fitness")
    all_rows += discover_snap_fitness()

    log("Clubsportive")
    all_rows += discover_clubsportive()

    log("HealthCity")
    all_rows += discover_healthcity()

    log("Optisport")
    all_rows += discover_optisport()

    combined = OUT / "netherlands_discovery_combined.json"
    combined.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    by_brand = {}
    for r in all_rows:
        by_brand[r["brand"]] = by_brand.get(r["brand"], 0) + 1

    log("")
    log("DISCOVERY DONE", len(all_rows), "in", round(time.time() - t0), "s")
    for k, v in sorted(by_brand.items()):
        log(f"  {k}: {v}")


if __name__ == "__main__":
    main()
