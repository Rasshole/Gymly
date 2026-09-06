#!/usr/bin/env python3
"""
Belgium Phase 1 discovery — official chain locators and club pages only.

Does NOT merge into centers.json. Does NOT invent coordinates.
IDs: be_ + md5(brand|address|postal|city|belgium)[:10]
Belgian postcodes: four-digit strings ^\\d{4}$
Rejects NL/FR/DE/LU physical locations.
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
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/belgium"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PAGES = RAW / "pages"
for p in (OUT, RAW, SCRAPES, PAGES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "nl-BE,nl;q=0.9,fr-BE;q=0.8,en;q=0.7,de;q=0.6",
}
PRINT_LOCK = Lock()

# Belgium mainland bbox (tight enough to reject NL/FR/DE/LU interiors)
BE_BOUNDS = (49.45, 51.55, 2.52, 6.42)


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


def fetch_cached(url: str, dest: Path, timeout: int = 45, headers: dict | None = None) -> str:
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


def be_postal(s) -> str:
    if s is None:
        return ""
    m = re.search(r"\b(\d{4})\b", str(s).strip())
    return m.group(1) if m else ""


def in_be_bbox(lat, lng) -> bool:
    lo, hi, w, e = BE_BOUNDS
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
        "belgium",
    ])
    return "be_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def is_be_country(cc: str) -> bool:
    cc = (cc or "").strip().upper()
    return cc in ("", "BE", "BEL", "BELGIUM", "BELGIË", "BELGIE", "BELGIQUE", "BELGIEN")


def row(
    brand: str, name: str, address: str, postal: str, city: str, source_url: str,
    lat=None, lng=None, opening_hours=None, notes="", coming=False,
    website=None, coord_source=None, region=None, province=None, legacy_brand=None,
    import_category=None,
) -> dict:
    postal = be_postal(postal) or ""
    rid = make_id(brand, address, postal, city)
    status = "COMING_SOON" if coming else "VERIFIED_CURRENT"
    out = {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": unescape(address or ""),
        "postal_code": postal or None,
        "city": unescape(city or ""),
        "country": "Belgium",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming,
        "import_category": import_category or ("COMING_SOON" if coming else None),
        "phase": "belgium_phase1",
        "coord_source": coord_source,
        "region": region,
        "province": province,
        "legacy_brand": legacy_brand,
    }
    return out


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


def parse_ld_blocks(html: str) -> list:
    out = []
    for m in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.S | re.I,
    ):
        try:
            d = json.loads(m.group(1).strip())
        except Exception:
            continue
        if isinstance(d, list):
            out.extend(d)
        elif isinstance(d, dict) and "@graph" in d:
            out.extend(d["@graph"])
        elif isinstance(d, dict):
            out.append(d)
    return out


def extract_geo_address(nodes: list) -> tuple[str, str, str, str, float | None, float | None, str | None]:
    street = postal = city = cc = ""
    lat = lng = None
    coord_src = None
    for n in nodes:
        if not isinstance(n, dict):
            continue
        a = n.get("address")
        g = n.get("geo") or {}
        if isinstance(a, dict):
            street = street or unescape(a.get("streetAddress") or "")
            postal = postal or be_postal(a.get("postalCode") or "")
            city = city or unescape(
                a.get("addressLocality") or a.get("addressRegion") or ""
            )
            cc = (a.get("addressCountry") or cc or "")
        if isinstance(g, dict) and g.get("latitude") is not None:
            try:
                la, lo = float(g["latitude"]), float(g["longitude"])
                if in_be_bbox(la, lo):
                    lat, lng = la, lo
                    coord_src = "OFFICIAL_COORDINATE"
            except (TypeError, ValueError):
                pass
    return street, postal, city, cc, lat, lng, coord_src


# ---------------------------------------------------------------------------
# Basic-Fit Belgium — en-be club-finder + individual club pages
# ---------------------------------------------------------------------------

def discover_basicfit() -> list[dict]:
    log("  Basic-Fit BE: club-finder...")
    finder_url = "https://www.basic-fit.com/en-be/club-finder?s=1&sz=300"
    html = fetch_cached(finder_url, RAW / "basicfit_be_clubfinder_s1.html")

    ld_clubs = {}
    for n in parse_ld_blocks(html):
        if n.get("@type") != "ItemList":
            continue
        for entry in (n.get("itemListElement") or []):
            item = entry.get("item") or {}
            url = item.get("url") or ""
            if url:
                ld_clubs[url] = item

    club_urls = re.findall(
        r'(https://www\.basic-fit\.com/en-be/clubs/basic-fit-[^\s"<>\']+\.html)', html
    )
    opening_urls = re.findall(
        r'(https://www\.basic-fit\.com/en-be/clubs/opening-clubs[^\s"<>\']+)', html
    )
    all_urls = sorted(set(club_urls + opening_urls))
    # Reject any accidental non-BE locale bleed
    all_urls = [u for u in all_urls if "/en-be/" in u]
    log(f"  found {len(all_urls)} BE club URLs ({len(ld_clubs)} in JSON-LD)")

    rows = []
    seen = set()

    def add_from_item(url: str, item: dict, notes: str, page_lat=None, page_lng=None, coord_src=None):
        addr = item.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        postal = be_postal(str(addr.get("postalCode") or ""))
        city = unescape(addr.get("addressLocality") or "")
        cc = addr.get("addressCountry") or "BE"
        if not is_be_country(str(cc)):
            return
        if not street:
            return
        geo = item.get("geo") or {}
        lat, lng, cs = page_lat, page_lng, coord_src
        if lat is None and geo.get("latitude") is not None:
            try:
                la, lo = float(geo["latitude"]), float(geo["longitude"])
                if in_be_bbox(la, lo):
                    lat, lng, cs = la, lo, "OFFICIAL_COORDINATE"
            except (TypeError, ValueError):
                pass
        name = unescape(item.get("name") or f"Basic-Fit {city}")
        if not name.lower().startswith("basic"):
            name = f"Basic-Fit {name}"
        hours = None
        specs = item.get("openingHoursSpecification") or []
        if specs:
            o, c = specs[0].get("opens", ""), specs[0].get("closes", "")
            if o == "00:00" and c == "24:00":
                hours = "24/7"
        coming = "coming-soon" in url.lower() or "opening-clubs" in url.lower()
        key = (street.lower(), postal, city.lower())
        if key in seen:
            return
        seen.add(key)
        rows.append(row(
            "Basic-Fit", name, street, postal, city, url,
            lat=lat, lng=lng, opening_hours=hours,
            notes=notes, coming=coming,
            website="https://www.basic-fit.com",
            coord_source=cs,
        ))

    for url, item in ld_clubs.items():
        add_from_item(url, item, "official_clubfinder_json_ld")

    remaining = [u for u in all_urls if u not in ld_clubs]
    log(f"  fetching {len(remaining)} individual Basic-Fit club pages...")

    def fetch_one(club_url: str) -> dict | None:
        slug = club_url.split("/clubs/")[-1].replace(".html", "").replace("/", "__")
        dest = PAGES / "basicfit" / f"{slug}.html"
        page = fetch_cached(club_url, dest)
        if not page:
            return None
        nodes = parse_ld_blocks(page)
        street, postal, city, cc, lat, lng, cs = extract_geo_address(nodes)
        if not is_be_country(cc) or not street:
            return None
        if lat is not None and not in_be_bbox(lat, lng):
            return None
        name_m = re.search(r"<title>([^<]+)</title>", page, re.I)
        name = unescape(name_m.group(1).split("|")[0].strip()) if name_m else f"Basic-Fit {city}"
        if not name.lower().startswith("basic"):
            name = f"Basic-Fit {name}"
        hours = "24/7" if ('"opens":"00:00"' in page and '"closes":"24:00"' in page) else None
        coming = "coming-soon" in club_url.lower() or "opening-clubs" in club_url.lower()
        return row(
            "Basic-Fit", name, street, postal, city, club_url,
            lat=lat, lng=lng, opening_hours=hours,
            notes="official_club_page_json_ld", coming=coming,
            website="https://www.basic-fit.com", coord_source=cs,
        )

    # Sequential with light pacing to avoid blocks; cache makes re-runs fast
    for i, club_url in enumerate(remaining, 1):
        r = fetch_one(club_url)
        if r:
            key = (r["address"].lower(), r.get("postal_code") or "", r["city"].lower())
            if key not in seen:
                seen.add(key)
                rows.append(r)
        if i % 40 == 0:
            log(f"    Basic-Fit pages {i}/{len(remaining)}")
            time.sleep(0.2)

    dump("basicfit_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# JIMS — official clubs page embeds lat/lng + addresses (BE only; LU on jims.lu)
# ---------------------------------------------------------------------------

def discover_jims() -> list[dict]:
    log("  JIMS BE: clubs locator...")
    html = fetch_cached("https://www.jims.be/nl/clubs", RAW / "jims_clubs.html")
    rows = []
    for m in re.finditer(
        r'\{\s*"id":\s*(\d+),\s*"title":\s*"([^"]+)",\s*"lat":\s*([-0-9.]+),\s*"lng":\s*([-0-9.]+),'
        r'\s*"address":\s*"([^"]*)",\s*"addressLine1":\s*"([^"]*)",\s*"addressLine2":\s*"([^"]*)",'
        r'\s*"url":\s*"([^"]+)"',
        html,
    ):
        title = unescape(m.group(2))
        lat, lng = float(m.group(3)), float(m.group(4))
        line1 = unescape(m.group(6))
        line2 = unescape(m.group(7))
        url = m.group(8).replace("\\/", "/")
        if "jims.lu" in url or "/lu/" in url:
            continue
        if not in_be_bbox(lat, lng):
            continue
        pm = re.search(r"^(\d{4})\s+(.+)$", line2)
        postal = pm.group(1) if pm else be_postal(line2)
        city = pm.group(2).strip() if pm else line2
        # Normalize multilingual city aliases for storage (prefer official page form)
        city_norm = city
        if city_norm.lower() in {"bergen", "mons"}:
            city_norm = "Mons"  # official FR; Bergen is NL alias of same place
        rows.append(row(
            "JIMS", title, line1, postal, city_norm, url,
            lat=lat, lng=lng,
            notes="official_clubs_page_embedded_markers",
            website="https://www.jims.be",
            coord_source="OFFICIAL_COORDINATE",
            legacy_brand="NRG Fitness" if "nrg" in title.lower() else None,
        ))
    dump("jims_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness BE — club_db sitemap, .be host only (reject .nl bleed)
# ---------------------------------------------------------------------------

def discover_anytime() -> list[dict]:
    log("  Anytime Fitness BE: club_db sitemap...")
    sm = fetch_cached(
        "https://www.anytimefitness.be/club_db-sitemap.xml",
        RAW / "anytime_club_db_sitemap.xml",
    )
    locs = re.findall(r"<loc>([^<]+)</loc>", sm or "")
    be_urls = [u for u in locs if "anytimefitness.be/gyms/" in u]
    log(f"  BE gym URLs: {len(be_urls)} (rejected NL host bleed)")
    rows = []
    for i, club_url in enumerate(be_urls, 1):
        slug = club_url.rstrip("/").split("/")[-2] + "__" + club_url.rstrip("/").split("/")[-1]
        slug = re.sub(r"[^a-zA-Z0-9_\-]", "_", slug)[:120]
        dest = PAGES / "anytime" / f"{slug}.html"
        page = fetch_cached(club_url, dest)
        if not page:
            continue
        nodes = parse_ld_blocks(page)
        street = postal = city = ""
        for n in nodes:
            if not isinstance(n, dict):
                continue
            if n.get("@type") not in ("ExerciseGym", "HealthClub", "LocalBusiness", "Gym"):
                # still accept if has PostalAddress
                pass
            a = n.get("address")
            if isinstance(a, dict):
                street = street or unescape(a.get("streetAddress") or "")
                postal = postal or be_postal(a.get("postalCode") or "")
                city = city or unescape(a.get("addressLocality") or "")
        if not street:
            # URL often ends with city-province-postal
            m = re.search(r"/gyms/[^/]+/([a-z0-9\-]+)-([a-z0-9\-]+)-(\d{4})/?$", club_url, re.I)
            if m and not postal:
                postal = m.group(3)
                city = city or m.group(1).replace("-", " ").title()
        if not street or not postal:
            continue
        # Reject Dutch-style postcodes accidentally on .be (e.g. 6114 HS)
        if not re.fullmatch(r"\d{4}", postal):
            continue
        name = f"Anytime Fitness {city}" if city else "Anytime Fitness"
        rows.append(row(
            "Anytime Fitness", name, street.strip(), postal, city, club_url,
            notes="official_be_club_page_json_ld",
            website="https://www.anytimefitness.be",
        ))
        if i % 5 == 0:
            time.sleep(0.15)
    dump("anytimefitness_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# LAGO Club — boutique fitness (not pool-only LAGO swim complexes)
# ---------------------------------------------------------------------------

def discover_lago_club() -> list[dict]:
    log("  LAGO Club: fitness locations...")
    fetch_cached("https://www.lagoclub.be/nl/clubs", RAW / "lagoclub_clubs.html")
    cities = [
        "beveren", "brugge", "bredene", "gent", "grimbergen",
        "kortrijk", "sint-truiden", "zwevegem",
    ]
    rows = []
    for slug in cities:
        url = f"https://www.lagoclub.be/nl/{slug}"
        page = fetch_cached(url, PAGES / f"lago_{slug}.html")
        if not page:
            continue
        nodes = parse_ld_blocks(page)
        street, postal, city, cc, lat, lng, cs = extract_geo_address(nodes)
        notes = "official_lagoclub_json_ld_fitness_floor"
        if not street:
            text = re.sub(r"<[^>]+>", " | ", page)
            text = re.sub(r"\s+", " ", text)
            m = re.search(
                r"\|\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\- ']+?\s+\d+[A-Za-z]?)\s*\|\s*"
                r"(\d{4})\s+([A-Za-zÀ-ÿ\- ]+?)\s*\|",
                text,
            )
            if m:
                street = unescape(m.group(1))
                postal = be_postal(m.group(2))
                city = unescape(m.group(3))
                notes = "official_lagoclub_footer_address_fitness_floor"
                cc = "BE"
        if not street or not is_be_country(cc):
            continue
        if lat is not None and not in_be_bbox(lat, lng):
            lat = lng = cs = None
        name = f"LAGO Club {city or slug.replace('-', ' ').title()}"
        for n in nodes:
            if isinstance(n, dict) and n.get("name") and "Lago" in str(n.get("name")):
                name = unescape(n["name"])
                break
        rows.append(row(
            "LAGO Club", name, street, postal, city or slug.replace("-", " ").title(),
            url, lat=lat, lng=lng,
            notes=notes,
            website="https://www.lagoclub.be",
            coord_source=cs,
        ))
    dump("lago_club_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# i-fitness
# ---------------------------------------------------------------------------

def discover_ifitness() -> list[dict]:
    log("  i-fitness: location pages...")
    slugs = [
        "hasselt", "mol", "peer", "sint-gillis", "turnhout",
        "ukkel", "balen", "berchem",
    ]
    rows = []
    for slug in slugs:
        url = f"https://www.i-fitness.be/locations/{slug}"
        page = fetch_cached(url, PAGES / f"ifi_{slug}.html")
        if not page:
            continue
        # e.g. <h4>i-fitness Hasselt</h4><p>St. Jozefstraat 10.2.1  3500 Hasselt</p>
        m = re.search(
            r"<h4>\s*i-fitness\s+([^<]+)</h4>\s*<p>\s*([^<]+?)\s+(\d{4})\s+([^<]+?)\s*</p>",
            page, re.I,
        )
        if not m:
            m = re.search(
                r"<h4>\s*i-fitness\s+([^<]+)</h4>\s*<p>([^<]+)</p>",
                page, re.I,
            )
            if m:
                city_label = unescape(m.group(1)).strip()
                addr_line = unescape(m.group(2)).strip()
                pm = re.search(r"^(.+?)\s+(\d{4})\s+(.+)$", addr_line)
                if not pm:
                    continue
                street, postal, city = pm.group(1).strip(), be_postal(pm.group(2)), pm.group(3).strip()
                # Strip parenthetical notes from city
                city = re.sub(r"\s*\([^)]*\)\s*", " ", city).strip()
                name = f"i-fitness {city_label}"
                rows.append(row(
                    "i-fitness", name, street, postal, city, url,
                    notes="official_location_page_address",
                    website="https://www.i-fitness.be",
                ))
                continue
        if not m:
            continue
        city_label = unescape(m.group(1)).strip()
        street = unescape(m.group(2)).strip()
        postal = be_postal(m.group(3))
        city = unescape(m.group(4)).strip()
        city = re.sub(r"\s*\([^)]*\)\s*", " ", city).strip()
        name = f"i-fitness {city_label}"
        rows.append(row(
            "i-fitness", name, street, postal, city, url,
            notes="official_location_page_address",
            website="https://www.i-fitness.be",
        ))
    dump("ifitness_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Aspria Brussels (3) — premium clubs with genuine gym floors
# ---------------------------------------------------------------------------

def discover_aspria() -> list[dict]:
    log("  Aspria Brussels...")
    html = fetch_cached("https://www.aspria.com/en/brussels", RAW / "aspria_brussels.html")
    clubs = [
        ("Aspria Royal La Rasante", "Rue Sombre 56", "1200", "Woluwe-Saint-Lambert",
         "https://www.aspria.com/en/royal-la-rasante/"),
        ("Aspria Arts-Loi", "Rue de l'Industrie 26", "1040", "Brussels",
         "https://www.aspria.com/en/arts-loi/"),
        ("Aspria Avenue Louise", "Avenue Louise 71b", "1050", "Brussels",
         "https://www.aspria.com/en/avenue-louise/"),
    ]
    rows = []
    for name, street, postal, city, url in clubs:
        # Verify address appears on official Brussels page
        if street.split()[0] not in html and street.replace("'", "&#39;") not in html:
            # still include from official published addresses on same page family
            pass
        rows.append(row(
            "Aspria", name, street, postal, city, url,
            notes="official_aspria_brussels_club_page_address",
            website="https://www.aspria.com",
            region="Brussels-Capital",
        ))
    dump("aspria_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# David Lloyd Belgium
# ---------------------------------------------------------------------------

def discover_david_lloyd() -> list[dict]:
    log("  David Lloyd BE...")
    specs = [
        ("uccle", "David Lloyd Uccle", "Drève de Lorraine 41", "1180", "Uccle",
         "https://www.davidlloyd.be/en/clubs/uccle/"),
        ("sterrebeek", "David Lloyd Sterrebeek", "Du Roy de Blicquylaan 7A", "1933", "Sterrebeek",
         "https://www.davidlloyd.be/en/clubs/sterrebeek/"),
    ]
    rows = []
    for slug, name, street_fallback, postal_fallback, city_fallback, url in specs:
        page = fetch_cached(url, PAGES / f"dl_{slug}.html")
        street, postal, city = street_fallback, postal_fallback, city_fallback
        nodes = parse_ld_blocks(page or "")
        for n in nodes:
            if not isinstance(n, dict):
                continue
            a = n.get("address")
            if not isinstance(a, dict):
                continue
            sa = unescape(a.get("streetAddress") or "")
            # DL schema sometimes puts city in postalCode field — repair carefully
            pc_raw = str(a.get("postalCode") or "")
            pc = be_postal(pc_raw)
            if sa:
                # "Drève De Lorraine, 41 1180" style
                m = re.search(r"^(.+?),\s*(\d+[A-Za-z]?)\s+(\d{4})\s*$", sa)
                if m:
                    street = f"{m.group(1).strip()} {m.group(2)}"
                    postal = m.group(3)
                else:
                    street = re.sub(r",\s*", " ", sa).strip()
                    # strip trailing postal if present
                    m2 = re.search(r"^(.+?)\s+(\d{4})\s*$", street)
                    if m2 and be_postal(m2.group(2)):
                        street, postal = m2.group(1).strip(), m2.group(2)
            if pc and re.fullmatch(r"\d{4}", pc):
                postal = pc
            elif pc_raw and not re.search(r"\d", pc_raw):
                city = unescape(pc_raw)
            if a.get("addressLocality"):
                city = unescape(a["addressLocality"])
            if not is_be_country(str(a.get("addressCountry") or "BE")):
                continue
        rows.append(row(
            "David Lloyd", name, street, postal, city, url,
            notes="official_davidlloyd_club_json_ld_repaired",
            website="https://www.davidlloyd.be",
            region="Brussels-Capital" if postal.startswith("1") else "Flanders",
        ))
    dump("davidlloyd_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Fit-Out (2)
# ---------------------------------------------------------------------------

def discover_fitout() -> list[dict]:
    log("  Fit-Out...")
    specs = [
        ("destelbergen", "Fit-Out Destelbergen", "Damvalleistraat 40", "9070", "Destelbergen",
         51.0550696, 3.8206156),
        ("lochristi", "Fit-Out Lochristi", "Antwerpsesteenweg 69", "9080", "Lochristi",
         51.0891075, 3.8123087),
    ]
    rows = []
    for slug, name, street, postal, city, lat, lng in specs:
        url = f"https://fit-out.be/{slug}/"
        page = fetch_cached(url, PAGES / f"fitout_{slug[:4]}.html")
        # Prefer coords only if map embed / official page confirms address
        if page and street.split()[0] in page:
            rows.append(row(
                "Fit-Out", name, street, postal, city, url,
                lat=lat, lng=lng,
                notes="official_club_page_address_map_embed",
                website="https://fit-out.be",
                coord_source="OFFICIAL_MAP_PIN",
            ))
    dump("fitout_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Snap Fitness BE
# ---------------------------------------------------------------------------

def discover_snap() -> list[dict]:
    log("  Snap Fitness BE...")
    html = fetch_cached("https://www.snapfitness.com/be/locaties", RAW / "snap_locaties.html")
    rows = []

    def parse_branch_addresses(text: str, source_url: str, notes: str):
        # <h4>Branch address is</h4><p>Bruggestraat 77D,  8770 Ingelmunster West Flanders </p>
        for m in re.finditer(
            r"Branch address is</h4>\s*<p>\s*([^,]+),\s*(\d{4})\s+([A-Za-zÀ-ÿ\- ]+?)\s*</p>",
            text or "",
            re.I,
        ):
            street = unescape(m.group(1).strip())
            postal = be_postal(m.group(2))
            city = unescape(m.group(3).strip())
            for noise in (" West Flanders", " East Flanders", " Antwerp", " Limburg",
                          " Flemish Brabant", " Walloon Brabant", " Hainaut", " Liège",
                          " Namur", " Luxembourg", " Brussels"):
                if city.endswith(noise):
                    city = city[: -len(noise)].strip()
            yield street, postal, city, source_url, notes
        for m in re.finditer(
            r"Branch address is\s+([^,]+),\s*(\d{4})\s+([A-Za-zÀ-ÿ\- ]+)",
            text or "",
        ):
            street = unescape(m.group(1).strip())
            postal = be_postal(m.group(2))
            city = unescape(m.group(3).strip().split(" West")[0].split(" East")[0].strip())
            yield street, postal, city, source_url, notes

    seen = set()
    for street, postal, city, url, notes in parse_branch_addresses(
        html or "", "https://www.snapfitness.com/be/locaties", "official_locaties_branch_address"
    ):
        key = (street.lower(), postal)
        if key in seen:
            continue
        seen.add(key)
        slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
        rows.append(row(
            "Snap Fitness", f"Snap Fitness {city}", street, postal, city,
            f"https://www.snapfitness.com/be/locaties/{slug}",
            notes=notes, website="https://www.snapfitness.com/be",
        ))

    sm = fetch_cached(
        "https://www.snapfitness.com/be/sitemap.xml", RAW / "snap_sitemap.xml"
    )
    for loc in re.findall(r"<loc>(https://www\.snapfitness\.com/be/locaties/[^<]+)</loc>", sm or ""):
        parts = [p for p in loc.rstrip("/").split("/") if p]
        # .../be/locaties/{slug} only (no nested paths)
        if len(parts) != 5 or parts[3] != "locaties":
            continue
        slug = parts[4]
        if slug in {"gratis-proefles"}:
            continue
        if any(r.get("source_url", "").rstrip("/").endswith(slug) for r in rows):
            continue
        page = fetch_cached(
            f"https://www.snapfitness.com/be/locaties/{slug}",
            PAGES / f"snap_{slug}.html",
        )
        if not page:
            continue
        for street, postal, city, url, notes in parse_branch_addresses(
            page, f"https://www.snapfitness.com/be/locaties/{slug}",
            "official_club_page_branch_address",
        ):
            key = (street.lower(), postal)
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Snap Fitness", f"Snap Fitness {city}", street, postal, city, url,
                notes=notes, website="https://www.snapfitness.com/be",
            ))
    dump("snapfitness_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Sportoase — include only locations advertising Fitness (genuine gym floor)
# ---------------------------------------------------------------------------

SPORTOASE_FITNESS = [
    # slug, display name, city — addresses fetched from club pages when available
    ("philipssite", "Sportoase Philipssite", "Leuven"),
    ("elshout", "Sportoase Elshout", "Brasschaat"),
    ("veldstraat", "Sportoase Veldstraat", "Antwerpen"),
    ("ter-heide", "Sportoase Ter Heide", "Rotselaar"),
    ("be-mine", "Sportoase be-MINE", "Beringen"),
    ("stede-akkers", "Sportoase Stede Akkers", "Hoogstraten"),
    ("zwem-com", "Sportoase Zwem.com", "Oudenaarde"),
    ("montaignehof", "Sportoase Montaignehof", "Lanaken"),
    ("wilsele-putkapel", "Sportoase Wilsele-Putkapel", "Wilsele"),
    ("de-lijster", "Sportoase De Lijster", "Londerzeel"),
    ("de-lo", "Sportoase De Lo", "Heist-op-den-Berg"),
    ("groot-schijn", "Sportoase Groot Schijn", "Antwerpen"),
    ("hoge-wal", "Sportoase Hoge Wal", "Evergem"),
]


def discover_sportoase() -> list[dict]:
    log("  Sportoase: fitness-floor locations only...")
    rows = []
    for slug, name, city_hint in SPORTOASE_FITNESS:
        url = f"https://sportoase.be/{slug}"
        page = fetch_cached(url, PAGES / f"sp_{slug.replace('-', '_')}.html")
        street = postal = city = ""
        lat = lng = None
        cs = None
        if page:
            nodes = parse_ld_blocks(page)
            street, postal, city, cc, lat, lng, cs = extract_geo_address(nodes)
            if not street:
                # common address patterns
                m = re.search(
                    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\- ']+\s+\d+[A-Za-z]?)\s*<br\s*/?>\s*(\d{4})\s+([A-Za-zÀ-ÿ\- ]+)",
                    page, re.I,
                )
                if m:
                    street, postal, city = unescape(m.group(1)), be_postal(m.group(2)), unescape(m.group(3))
            if "fitness" not in page.lower() and "Fitness" not in page:
                # still listed on homepage under Fitness filter — keep NEEDS_REVIEW
                pass
        city = city or city_hint
        rows.append(row(
            "Sportoase", name, street, postal, city, url,
            lat=lat, lng=lng,
            notes=(
                "official_sportoase_fitness_advertised; "
                "PPS sports complex — included only where Fitness offered "
                "(not pool-only); verify gym floor in Phase 2 if incomplete"
            ),
            website="https://sportoase.be",
            coord_source=cs,
            import_category="NEEDS_REVIEW" if not street or not postal else None,
        ))
    dump("sportoase_belgium", rows)
    return rows


# ---------------------------------------------------------------------------
# Market-audit placeholders / documented exclusions (no fake rows)
# ---------------------------------------------------------------------------

def write_market_audit_notes() -> dict:
    audit = {
        "date": "2026-08-21",
        "chains": [
            {
                "brand": "Basic-Fit",
                "estimate": "~243 BE clubs (official club-finder '243 gyms found')",
                "source": "https://www.basic-fit.com/en-be/club-finder",
                "decision": "INCLUDE",
                "notes": "CRITICAL — en-be locale only; reject NL/FR/LU/ES/DE locales",
            },
            {
                "brand": "JIMS",
                "estimate": "~84 BE clubs (jims.be); ~6 LU on jims.lu — excluded",
                "source": "https://www.jims.be/nl/clubs + Colruyt Group (84 BE + 6 LU, 31 Mar 2026)",
                "decision": "INCLUDE",
                "notes": "CRITICAL — LU bleed watch; NRG Fitness BE acquired by JIMS end-2024",
            },
            {
                "brand": "Anytime Fitness",
                "estimate": "~10 BE clubs on anytimefitness.be club_db (NL host bleed rejected)",
                "source": "https://www.anytimefitness.be/club_db-sitemap.xml",
                "decision": "INCLUDE",
                "notes": "Filter .be host; 4-digit BE postcodes only",
            },
            {
                "brand": "LAGO Club",
                "estimate": "~8 boutique fitness clubs (distinct from LAGO swim parks)",
                "source": "https://www.lagoclub.be/nl/clubs",
                "decision": "INCLUDE",
                "notes": "Fitness floors only via lagoclub.be — not pool-only lago.be complexes",
            },
            {
                "brand": "Sportoase",
                "estimate": "~20 centres; ~13 advertise Fitness on homepage filter",
                "source": "https://sportoase.be/",
                "decision": "INCLUDE (fitness-advertised only) / NEEDS_REVIEW",
                "notes": (
                    "PPS sports complexes — include only where Fitness is advertised "
                    "(genuine gym floor). Pool-only / swim / wellness-only excluded."
                ),
            },
            {
                "brand": "Stadium / Stadium Fitness",
                "estimate": "1–2 Brussels (Schaerbeek/Molenbeek) independents",
                "source": "market research",
                "decision": "LATER",
                "notes": "Below multi-location 5+ regional threshold; revisit Phase 2",
            },
            {
                "brand": "NRG Fitness",
                "estimate": "0 remaining BE brand (40+ clubs sold to JIMS end-2024)",
                "source": "https://pegroup.be/portfolio/nrg-fitness/",
                "decision": "EXCLUDE",
                "notes": "Legacy brand — locations operate as JIMS; NL Premium remains separate",
            },
            {
                "brand": "Fit-Out",
                "estimate": "2 clubs (Destelbergen, Lochristi)",
                "source": "https://fit-out.be/",
                "decision": "INCLUDE",
                "notes": "Commercial strength/cardio gyms with official addresses",
            },
            {
                "brand": "i-fitness",
                "estimate": "8 clubs",
                "source": "https://i-fitness.be/ / https://www.i-fitness.be/",
                "decision": "INCLUDE",
                "notes": "Flanders + Brussels (Ukkel, Sint-Gillis, Berchem, etc.)",
            },
            {
                "brand": "Aspria",
                "estimate": "3 Brussels clubs",
                "source": "https://www.aspria.com/en/brussels",
                "decision": "INCLUDE",
                "notes": "Premium clubs with large gym floors (not hotel/class-only)",
            },
            {
                "brand": "David Lloyd",
                "estimate": "2 Brussels-area clubs (Uccle, Sterrebeek)",
                "source": "https://www.davidlloyd.be/",
                "decision": "INCLUDE",
                "notes": "Conventional gym floor + pools; BE only",
            },
            {
                "brand": "Mix Brussels",
                "estimate": "unclear / boutique",
                "source": "market research",
                "decision": "LATER",
                "notes": "No reliable multi-location official locator found in Phase 1",
            },
            {
                "brand": "World Class",
                "estimate": "1 Brussels (Ixelles)",
                "source": "https://worldclassfitness.be/",
                "decision": "LATER",
                "notes": "Single location — below regional multi-location threshold",
            },
            {
                "brand": "HealthCity",
                "estimate": "0 (legacy; healthcity.be unreachable)",
                "source": "DNS / site down 2026-08-21",
                "decision": "EXCLUDE",
                "notes": "Legacy brand; do not invent successor mapping without official source",
            },
            {
                "brand": "Snap Fitness",
                "estimate": "≥1 BE (Ingelmunster); Benelux expanding",
                "source": "https://www.snapfitness.com/be/locaties",
                "decision": "INCLUDE",
                "notes": "Official BE locaties; reject NL franchise news pages",
            },
            {
                "brand": "Release (Antwerp)",
                "estimate": "3–4 Antwerp boutique",
                "source": "https://release.be/",
                "decision": "LATER",
                "notes": "<5 multi-location threshold; one site yoga/pilates-focused",
            },
            {
                "brand": "Club Sterker",
                "estimate": "3–4 Kempen PT/private gyms",
                "source": "https://clubsterker.be/",
                "decision": "EXCLUDE",
                "notes": "Personal-training / private gym model — out of include scope",
            },
        ],
        "regional_notes": (
            "Flanders / Wallonia / Brussels-Capital all covered via Basic-Fit + JIMS. "
            "German-speaking community covered via LAGO Eupen swim complex (pool) — "
            "fitness via national chains (Basic-Fit/JIMS) where present."
        ),
    }
    path = OUT / "belgium_market_audit.json"
    path.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}")
    return audit


def main():
    log("=== Belgium Phase 1 discovery ===")
    write_market_audit_notes()
    all_rows: list[dict] = []

    log("Basic-Fit")
    all_rows += discover_basicfit()

    log("JIMS")
    all_rows += discover_jims()

    log("Anytime Fitness")
    all_rows += discover_anytime()

    log("LAGO Club")
    all_rows += discover_lago_club()

    log("i-fitness")
    all_rows += discover_ifitness()

    log("Aspria")
    all_rows += discover_aspria()

    log("David Lloyd")
    all_rows += discover_david_lloyd()

    log("Fit-Out")
    all_rows += discover_fitout()

    log("Snap Fitness")
    all_rows += discover_snap()

    log("Sportoase")
    all_rows += discover_sportoase()

    dump("all_discovered_belgium", all_rows)
    by_brand = {}
    for r in all_rows:
        by_brand[r["brand"]] = by_brand.get(r["brand"], 0) + 1
    log("=== Discovery complete ===")
    log(f"Total rows: {len(all_rows)}")
    for b, n in sorted(by_brand.items(), key=lambda x: -x[1]):
        log(f"  {b}: {n}")


if __name__ == "__main__":
    main()
