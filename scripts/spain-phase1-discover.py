#!/usr/bin/env python3
"""
Spain Phase 1 discovery — official chain locators and club pages only.

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
OUT = ROOT / "data/spain"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()

ES_MAINLAND = (35.9, 43.8, -9.4, 3.4)
ES_BALEARIC = (38.6, 40.1, 1.1, 4.4)
ES_CANARY = (27.6, 29.5, -18.2, -13.3)
ES_CEUTA = (35.85, 35.92, -5.35, -5.27)
ES_MELILLA = (35.26, 35.33, -2.97, -2.92)


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


def es_postal(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    m = re.search(r"\b(\d{5})\b", s)
    if m:
        return m.group(1)
    return ""


def in_spain_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in [ES_MAINLAND, ES_BALEARIC, ES_CANARY, ES_CEUTA, ES_MELILLA]:
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (postal or "").strip().lower(),
        (city or "").strip().lower(),
        "spain",
    ])
    return "es_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def row(
    brand: str, name: str, address: str, postal: str, city: str, source_url: str,
    lat=None, lng=None, opening_hours=None, notes="", coming=False,
    website=None, coord_source=None, legacy_brand=None, closed=False,
) -> dict:
    postal = es_postal(postal) or postal or ""
    rid = make_id(brand, address, postal, city)
    if closed:
        status = "CLOSED"
    elif coming:
        status = "COMING_SOON"
    else:
        status = "VERIFIED_CURRENT"
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": unescape(address or ""),
        "postal_code": postal or None,
        "city": unescape(city or ""),
        "country": "Spain",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming and not closed,
        "import_category": "CLOSED" if closed else ("COMING_SOON" if coming else None),
        "phase": "spain_phase1",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


# ---------------------------------------------------------------------------
# Basic-Fit Spain
# ---------------------------------------------------------------------------

def discover_basicfit() -> list[dict]:
    """Basic-Fit Spain from club-finder HTML with JSON-LD."""
    log("  Basic-Fit Spain: fetching club-finder...")
    rows = []
    seen_urls = set()

    for page_start in range(1, 2000, 128):
        finder_url = f"https://www.basic-fit.com/en-es/club-finder?s={page_start}&sz=128"
        dest = RAW / f"basicfit_es_clubfinder_s{page_start}.html"
        html = fetch_cached(finder_url, dest)
        if not html:
            break

        club_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-es/clubs/basic-fit-[^\s"<>\']+\.html)',
            html,
        )
        opening_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-es/clubs/opening-clubs[^\s"<>\']+)',
            html,
        )
        new_urls = [u for u in sorted(set(club_urls + opening_urls)) if u not in seen_urls]
        seen_urls.update(new_urls)
        log(f"    page s={page_start}: {len(new_urls)} new URLs (total {len(seen_urls)})")
        if not new_urls:
            break
        time.sleep(0.3)

    log(f"  total unique club URLs: {len(seen_urls)}")

    # Parse JSON-LD from club-finder pages
    ld_items = {}
    for dest_file in sorted(RAW.glob("basicfit_es_clubfinder_s*.html")):
        html = dest_file.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
            try:
                data = json.loads(m.group(1).strip())
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            if data.get("@type") == "ItemList":
                for entry in (data.get("itemListElement") or []):
                    item = entry.get("item") or {}
                    url = item.get("url") or ""
                    if url and "/en-es/" in url:
                        ld_items[url] = item

    for url, item in ld_items.items():
        addr = item.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        postal = es_postal(str(addr.get("postalCode") or ""))
        city = unescape(addr.get("addressLocality") or "")
        cc = (addr.get("addressCountry") or "").upper()
        if cc and cc not in ("ES", "SPAIN", "ESPAÑA", ""):
            continue
        if not street:
            continue

        name = unescape(item.get("name") or f"Basic-Fit {city} {street}")
        if not name.lower().startswith("basic"):
            name = f"Basic-Fit {name}"

        lat, lng, coord_src = None, None, None
        geo = item.get("geo") or {}
        if isinstance(geo, dict):
            try:
                la, lo = float(geo.get("latitude")), float(geo.get("longitude"))
                if in_spain_bbox(la, lo):
                    lat, lng = la, lo
                    coord_src = "official_json_ld"
            except (TypeError, ValueError):
                pass

        hours = None
        specs = item.get("openingHoursSpecification") or []
        if specs:
            o, c = specs[0].get("opens", ""), specs[0].get("closes", "")
            if o == "00:00" and c == "24:00":
                hours = "24/7"

        coming = "coming-soon" in url.lower() or "opening-clubs" in url.lower()
        rows.append(row(
            "Basic-Fit", name, street, postal, city, url,
            lat=lat, lng=lng, opening_hours=hours,
            notes="official_clubfinder_json_ld",
            coming=coming, website="https://www.basic-fit.com",
            coord_source=coord_src,
        ))
        seen_urls.discard(url)

    # Fetch remaining individual club pages
    remaining = sorted(seen_urls - {u for r in rows for u in [r.get("source_url")]})
    log(f"  fetching {len(remaining)} individual club pages...")

    for i, club_url in enumerate(remaining, 1):
        slug = club_url.split("/clubs/")[-1].replace(".html", "").replace("/", "__")
        dest = RAW / "pages" / "basicfit" / f"{slug}.html"
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
                    postal = postal or es_postal(str(a.get("postalCode") or ""))
                    city = city or (a.get("addressLocality") or "")
                    cc = (a.get("addressCountry") or "").upper()
                    if cc and cc not in ("ES", "SPAIN", "ESPAÑA", ""):
                        street = ""
                        break
                if isinstance(g, dict):
                    try:
                        la, lo = float(g.get("latitude")), float(g.get("longitude"))
                        if in_spain_bbox(la, lo):
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
            coming=coming, website="https://www.basic-fit.com",
            coord_source=coord_src,
        ))

        if i % 50 == 0:
            log(f"    fetched {i}/{len(remaining)}")
        time.sleep(0.15)

    dump("basicfit_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# McFIT / RSG Group Spain (John Reed, Gold's Gym)
# ---------------------------------------------------------------------------

def discover_mcfit() -> list[dict]:
    """McFIT Spain from official locator API."""
    log("  McFIT Spain: fetching studios...")
    rows = []

    api_url = "https://rsg-group.api.magicline.com/connect/v1/studio?studioTags=MCFIT&country=ES"
    dest = RAW / "mcfit_es_api.json"
    text = fetch_cached(api_url, dest, headers={
        "Accept": "application/json",
        "x-tenant": "rsg",
    })
    if text:
        try:
            studios = json.loads(text)
        except Exception:
            studios = []
        if isinstance(studios, dict):
            studios = studios.get("studios") or studios.get("data") or []
        for s in studios:
            if not isinstance(s, dict):
                continue
            addr_obj = s.get("address") or s.get("studioAddress") or {}
            street = unescape(addr_obj.get("street") or addr_obj.get("streetAddress") or "")
            postal = es_postal(str(addr_obj.get("zipCode") or addr_obj.get("postalCode") or ""))
            city = unescape(addr_obj.get("city") or addr_obj.get("addressLocality") or "")
            cc = (addr_obj.get("country") or addr_obj.get("countryCode") or "").upper()
            if cc and cc not in ("ES", "SPAIN", "ESPAÑA", ""):
                continue
            name = unescape(s.get("studioName") or s.get("name") or f"McFIT {city}")
            lat, lng, coord_src = None, None, None
            geo = s.get("geolocation") or s.get("geo") or addr_obj
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude") or geo.get("lat"))
                    lo = float(geo.get("longitude") or geo.get("lng") or geo.get("lon"))
                    if in_spain_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_api"
                except (TypeError, ValueError):
                    pass
            web = s.get("websiteUrl") or s.get("url") or "https://www.mcfit.com/es/"
            rows.append(row(
                "McFIT", name, street, postal, city, web,
                lat=lat, lng=lng, notes="official_api_rsg",
                website="https://www.mcfit.com/es/",
                coord_source=coord_src,
            ))

    # Fallback: try the website locator page
    if len(rows) < 5:
        log("  McFIT: API yield low, trying website...")
        url = "https://www.mcfit.com/es/gimnasios/"
        html = fetch_cached(url, RAW / "mcfit_es_locator.html")
        if html:
            for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                    a = n.get("address") or {}
                    if not isinstance(a, dict):
                        continue
                    street = unescape(a.get("streetAddress") or "")
                    postal = es_postal(str(a.get("postalCode") or ""))
                    city = unescape(a.get("addressLocality") or "")
                    if not street:
                        continue
                    nm = unescape(n.get("name") or f"McFIT {city}")
                    geo = n.get("geo") or {}
                    lat, lng, coord_src = None, None, None
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass
                    rows.append(row(
                        "McFIT", nm, street, postal, city, url,
                        lat=lat, lng=lng, notes="official_locator_json_ld",
                        website="https://www.mcfit.com/es/",
                        coord_source=coord_src,
                    ))

    dump("mcfit_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness Spain
# ---------------------------------------------------------------------------

def discover_anytime() -> list[dict]:
    """Anytime Fitness Spain from official locator."""
    log("  Anytime Fitness Spain: fetching locator...")
    rows = []

    # Try API endpoint
    api_url = "https://www.anytimefitness.es/wp-json/wp/v2/gym?per_page=100&page=1"
    dest = RAW / "anytime_es_api_p1.json"
    text = fetch_cached(api_url, dest)

    if text and text.strip().startswith("["):
        page_num = 1
        while True:
            try:
                gyms = json.loads(text)
            except Exception:
                break
            if not gyms:
                break
            for g in gyms:
                if not isinstance(g, dict):
                    continue
                acf = g.get("acf") or g.get("meta") or {}
                title = unescape(g.get("title", {}).get("rendered", "") if isinstance(g.get("title"), dict) else str(g.get("title", "")))
                street = unescape(acf.get("address") or acf.get("direccion") or "")
                postal = es_postal(str(acf.get("zip_code") or acf.get("codigo_postal") or ""))
                city = unescape(acf.get("city") or acf.get("ciudad") or "")
                lat, lng, coord_src = None, None, None
                try:
                    la = float(acf.get("latitude") or acf.get("lat") or 0)
                    lo = float(acf.get("longitude") or acf.get("lng") or acf.get("lon") or 0)
                    if in_spain_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_api"
                except (TypeError, ValueError):
                    pass
                link = g.get("link") or g.get("url") or ""
                name = title or f"Anytime Fitness {city}"
                if not name.lower().startswith("anytime"):
                    name = f"Anytime Fitness {name}"
                rows.append(row(
                    "Anytime Fitness", name, street, postal, city, link,
                    lat=lat, lng=lng, opening_hours="24/7",
                    notes="official_wp_api",
                    website="https://www.anytimefitness.es",
                    coord_source=coord_src,
                ))
            if len(gyms) < 100:
                break
            page_num += 1
            api_url2 = f"https://www.anytimefitness.es/wp-json/wp/v2/gym?per_page=100&page={page_num}"
            dest2 = RAW / f"anytime_es_api_p{page_num}.json"
            text = fetch_cached(api_url2, dest2)
            time.sleep(0.3)

    # Fallback: scrape locator page
    if len(rows) < 10:
        log("  Anytime: API yield low, trying locator page...")
        url = "https://www.anytimefitness.es/gimnasios/"
        html = fetch_cached(url, RAW / "anytime_es_locator.html")
        if html:
            # Look for embedded JSON data
            for pat in [
                r'var\s+gyms\s*=\s*(\[.*?\]);',
                r'var\s+locations\s*=\s*(\[.*?\]);',
                r'"gyms"\s*:\s*(\[.*?\])',
            ]:
                m = re.search(pat, html, re.S)
                if m:
                    try:
                        gyms = json.loads(m.group(1))
                        for g in gyms:
                            if not isinstance(g, dict):
                                continue
                            street = unescape(g.get("address") or g.get("direccion") or "")
                            postal = es_postal(str(g.get("zip") or g.get("postal_code") or g.get("cp") or ""))
                            city = unescape(g.get("city") or g.get("ciudad") or "")
                            name = unescape(g.get("name") or g.get("title") or f"Anytime Fitness {city}")
                            lat, lng, coord_src = None, None, None
                            try:
                                la = float(g.get("lat") or g.get("latitude") or 0)
                                lo = float(g.get("lng") or g.get("lon") or g.get("longitude") or 0)
                                if in_spain_bbox(la, lo):
                                    lat, lng = la, lo
                                    coord_src = "official_locator_js"
                            except (TypeError, ValueError):
                                pass
                            rows.append(row(
                                "Anytime Fitness", name, street, postal, city,
                                g.get("url") or url,
                                lat=lat, lng=lng, opening_hours="24/7",
                                notes="official_locator_embedded_json",
                                website="https://www.anytimefitness.es",
                                coord_source=coord_src,
                            ))
                    except Exception:
                        pass
                    break

    dump("anytime_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# VivaGym Spain
# ---------------------------------------------------------------------------

def discover_vivagym() -> list[dict]:
    """VivaGym Spain from official website."""
    log("  VivaGym Spain: fetching clubs...")
    rows = []

    url = "https://www.vivagym.es/gimnasios"
    html = fetch_cached(url, RAW / "vivagym_es_clubs.html")
    if not html:
        url = "https://www.vivagym.es/clubes"
        html = fetch_cached(url, RAW / "vivagym_es_clubes.html")

    if html:
        # JSON-LD
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"VivaGym {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                web = n.get("url") or url
                rows.append(row(
                    "VivaGym", nm, street, postal, city, web,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.vivagym.es",
                    coord_source=coord_src,
                ))

        # Embedded JS data
        for pat in [r'var\s+clubs\s*=\s*(\[.*?\]);', r'"clubs"\s*:\s*(\[.*?\])', r'data-clubs=["\'](\[.*?\])["\']']:
            m = re.search(pat, html, re.S)
            if m:
                try:
                    clubs = json.loads(m.group(1))
                    for c in clubs:
                        if not isinstance(c, dict):
                            continue
                        street = unescape(c.get("address") or c.get("direccion") or "")
                        postal = es_postal(str(c.get("postal_code") or c.get("cp") or c.get("zip") or ""))
                        city = unescape(c.get("city") or c.get("ciudad") or "")
                        nm = unescape(c.get("name") or c.get("title") or f"VivaGym {city}")
                        lat, lng, coord_src = None, None, None
                        try:
                            la = float(c.get("lat") or c.get("latitude") or 0)
                            lo = float(c.get("lng") or c.get("lon") or c.get("longitude") or 0)
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_locator_js"
                        except (TypeError, ValueError):
                            pass
                        rows.append(row(
                            "VivaGym", nm, street, postal, city,
                            c.get("url") or url,
                            lat=lat, lng=lng, notes="official_embedded_json",
                            website="https://www.vivagym.es",
                            coord_source=coord_src,
                        ))
                except Exception:
                    pass
                break

        # Club page links
        club_links = re.findall(r'href="(https?://www\.vivagym\.es/gimnasio[s]?/[^"]+)"', html)
        if not club_links:
            club_links = re.findall(r'href="(/gimnasio[s]?/[^"]+)"', html)
            club_links = [f"https://www.vivagym.es{l}" for l in club_links]
        seen_cities = {r.get("city", "").lower() for r in rows}
        for link in sorted(set(club_links)):
            slug = link.rstrip("/").split("/")[-1]
            if slug in seen_cities:
                continue
            dest = RAW / "pages" / "vivagym" / f"{slug}.html"
            page = fetch_cached(link, dest)
            if not page:
                continue
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
                    a = n.get("address") or {}
                    if not isinstance(a, dict):
                        continue
                    street = unescape(a.get("streetAddress") or "")
                    postal = es_postal(str(a.get("postalCode") or ""))
                    city = unescape(a.get("addressLocality") or "")
                    if not street:
                        continue
                    nm = unescape(n.get("name") or f"VivaGym {city}")
                    geo = n.get("geo") or {}
                    lat, lng, coord_src = None, None, None
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass
                    rows.append(row(
                        "VivaGym", nm, street, postal, city, link,
                        lat=lat, lng=lng, notes="official_club_page_json_ld",
                        website="https://www.vivagym.es",
                        coord_source=coord_src,
                    ))
            time.sleep(0.2)

    dump("vivagym_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Altafit Spain
# ---------------------------------------------------------------------------

def discover_altafit() -> list[dict]:
    """Altafit Spain from official website."""
    log("  Altafit Spain: fetching clubs...")
    rows = []

    url = "https://altafitgymclub.com/gimnasios/"
    html = fetch_cached(url, RAW / "altafit_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Altafit {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Altafit", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://altafitgymclub.com",
                    coord_source=coord_src,
                ))

        # Parse club links
        club_links = re.findall(r'href="(https?://altafitgymclub\.com/gimnasio[s]?/[^"]+)"', html)
        if not club_links:
            club_links = re.findall(r'href="(/gimnasio[s]?/[^"]+)"', html)
            club_links = [f"https://altafitgymclub.com{l}" for l in club_links]

        seen_addrs = {(r.get("address", "").lower(), r.get("postal_code", "")) for r in rows}
        for link in sorted(set(club_links))[:120]:
            slug = link.rstrip("/").split("/")[-1]
            dest = RAW / "pages" / "altafit" / f"{slug}.html"
            page = fetch_cached(link, dest)
            if not page:
                continue
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
                    a = n.get("address") or {}
                    if not isinstance(a, dict):
                        continue
                    street = unescape(a.get("streetAddress") or "")
                    postal = es_postal(str(a.get("postalCode") or ""))
                    city = unescape(a.get("addressLocality") or "")
                    if not street:
                        continue
                    key = (street.lower(), postal)
                    if key in seen_addrs:
                        continue
                    seen_addrs.add(key)
                    nm = unescape(n.get("name") or f"Altafit {city}")
                    geo = n.get("geo") or {}
                    lat, lng, coord_src = None, None, None
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass
                    rows.append(row(
                        "Altafit", nm, street, postal, city, link,
                        lat=lat, lng=lng, notes="official_club_page_json_ld",
                        website="https://altafitgymclub.com",
                        coord_source=coord_src,
                    ))
            time.sleep(0.2)

    dump("altafit_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Synergym Spain
# ---------------------------------------------------------------------------

def discover_synergym() -> list[dict]:
    """Synergym Spain from official website."""
    log("  Synergym Spain: fetching clubs...")
    rows = []

    url = "https://www.synergym.es/gimnasios"
    html = fetch_cached(url, RAW / "synergym_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Synergym {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Synergym", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.synergym.es",
                    coord_source=coord_src,
                ))

        # Embedded data
        for pat in [r'var\s+(?:clubs|gyms|centros)\s*=\s*(\[.*?\]);', r'"centros"\s*:\s*(\[.*?\])']:
            m = re.search(pat, html, re.S)
            if m:
                try:
                    clubs = json.loads(m.group(1))
                    for c in clubs:
                        if not isinstance(c, dict):
                            continue
                        street = unescape(c.get("address") or c.get("direccion") or "")
                        postal = es_postal(str(c.get("postal_code") or c.get("cp") or ""))
                        city = unescape(c.get("city") or c.get("ciudad") or c.get("localidad") or "")
                        nm = unescape(c.get("name") or c.get("title") or c.get("nombre") or f"Synergym {city}")
                        lat, lng, coord_src = None, None, None
                        try:
                            la = float(c.get("lat") or c.get("latitude") or 0)
                            lo = float(c.get("lng") or c.get("lon") or c.get("longitude") or 0)
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_locator_js"
                        except (TypeError, ValueError):
                            pass
                        coming = c.get("status") in ("coming_soon", "proximamente")
                        rows.append(row(
                            "Synergym", nm, street, postal, city,
                            c.get("url") or url,
                            lat=lat, lng=lng, notes="official_embedded_json",
                            coming=coming,
                            website="https://www.synergym.es",
                            coord_source=coord_src,
                        ))
                except Exception:
                    pass
                break

        # Club links
        club_links = re.findall(r'href="(https?://www\.synergym\.es/gimnasio[s]?/[^"]+)"', html)
        if not club_links:
            club_links = re.findall(r'href="(/gimnasio[s]?/[^"]+)"', html)
            club_links = [f"https://www.synergym.es{l}" for l in club_links]

        seen = {(r.get("address", "").lower(), r.get("postal_code", "")) for r in rows}
        for link in sorted(set(club_links))[:80]:
            slug = link.rstrip("/").split("/")[-1]
            dest = RAW / "pages" / "synergym" / f"{slug}.html"
            page = fetch_cached(link, dest)
            if not page:
                continue
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
                    a = n.get("address") or {}
                    if not isinstance(a, dict):
                        continue
                    street = unescape(a.get("streetAddress") or "")
                    postal = es_postal(str(a.get("postalCode") or ""))
                    city = unescape(a.get("addressLocality") or "")
                    if not street:
                        continue
                    key = (street.lower(), postal)
                    if key in seen:
                        continue
                    seen.add(key)
                    nm = unescape(n.get("name") or f"Synergym {city}")
                    geo = n.get("geo") or {}
                    lat, lng, coord_src = None, None, None
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass
                    coming = "próximamente" in page[:3000].lower() or "coming soon" in page[:3000].lower()
                    rows.append(row(
                        "Synergym", nm, street, postal, city, link,
                        lat=lat, lng=lng, notes="official_club_page_json_ld",
                        coming=coming,
                        website="https://www.synergym.es",
                        coord_source=coord_src,
                    ))
            time.sleep(0.2)

    dump("synergym_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# DIR (Catalonia)
# ---------------------------------------------------------------------------

def discover_dir() -> list[dict]:
    """DIR clubs from official website."""
    log("  DIR Catalonia: fetching clubs...")
    rows = []

    url = "https://www.dir.cat/es/clubes"
    html = fetch_cached(url, RAW / "dir_es_clubs.html")
    if not html:
        url = "https://www.dir.cat/clubes"
        html = fetch_cached(url, RAW / "dir_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"DIR {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "DIR", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.dir.cat",
                    coord_source=coord_src,
                ))

        # Club page links
        club_links = re.findall(r'href="(https?://www\.dir\.cat/(?:es/)?club[es]*/[^"]+)"', html)
        if not club_links:
            club_links = re.findall(r'href="(/(?:es/)?club[es]*/[^"]+)"', html)
            club_links = [f"https://www.dir.cat{l}" for l in club_links]

        seen = {(r.get("address", "").lower(), r.get("postal_code", "")) for r in rows}
        for link in sorted(set(club_links))[:40]:
            slug = link.rstrip("/").split("/")[-1]
            dest = RAW / "pages" / "dir" / f"{slug}.html"
            page = fetch_cached(link, dest)
            if not page:
                continue
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
                    a = n.get("address") or {}
                    if not isinstance(a, dict):
                        continue
                    street = unescape(a.get("streetAddress") or "")
                    postal = es_postal(str(a.get("postalCode") or ""))
                    city = unescape(a.get("addressLocality") or "")
                    if not street:
                        continue
                    key = (street.lower(), postal)
                    if key in seen:
                        continue
                    seen.add(key)
                    nm = unescape(n.get("name") or f"DIR {city}")
                    geo = n.get("geo") or {}
                    lat, lng, coord_src = None, None, None
                    if isinstance(geo, dict):
                        try:
                            la = float(geo.get("latitude"))
                            lo = float(geo.get("longitude"))
                            if in_spain_bbox(la, lo):
                                lat, lng = la, lo
                                coord_src = "official_json_ld"
                        except (TypeError, ValueError):
                            pass
                    rows.append(row(
                        "DIR", nm, street, postal, city, link,
                        lat=lat, lng=lng, notes="official_club_page_json_ld",
                        website="https://www.dir.cat",
                        coord_source=coord_src,
                    ))
            time.sleep(0.2)

    dump("dir_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Dreamfit Spain
# ---------------------------------------------------------------------------

def discover_dreamfit() -> list[dict]:
    """Dreamfit from official website."""
    log("  Dreamfit Spain: fetching clubs...")
    rows = []

    url = "https://www.dreamfit.es/gimnasios"
    html = fetch_cached(url, RAW / "dreamfit_es_clubs.html")
    if not html:
        url = "https://www.dreamfit.es/centros"
        html = fetch_cached(url, RAW / "dreamfit_es_centros.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Dreamfit {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Dreamfit", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.dreamfit.es",
                    coord_source=coord_src,
                ))

    dump("dreamfit_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# GO fit Spain
# ---------------------------------------------------------------------------

def discover_gofit() -> list[dict]:
    """GO fit from official website."""
    log("  GO fit Spain: fetching clubs...")
    rows = []

    url = "https://gofit.es/centros/"
    html = fetch_cached(url, RAW / "gofit_es_clubs.html")
    if not html:
        url = "https://www.gofit.es/centros"
        html = fetch_cached(url, RAW / "gofit_es_clubs2.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"GO fit {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "GO fit", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://gofit.es",
                    coord_source=coord_src,
                ))

    dump("gofit_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Metropolitan Spain
# ---------------------------------------------------------------------------

def discover_metropolitan() -> list[dict]:
    """Metropolitan from official website."""
    log("  Metropolitan Spain: fetching clubs...")
    rows = []

    url = "https://clubmetropolitan.com/centros"
    html = fetch_cached(url, RAW / "metropolitan_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Metropolitan {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Metropolitan", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://clubmetropolitan.com",
                    coord_source=coord_src,
                ))

    dump("metropolitan_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Forus Spain
# ---------------------------------------------------------------------------

def discover_forus() -> list[dict]:
    """Forus from official website."""
    log("  Forus Spain: fetching clubs...")
    rows = []

    url = "https://www.forus.es/centros"
    html = fetch_cached(url, RAW / "forus_es_clubs.html")
    if not html:
        url = "https://forus.es/centros"
        html = fetch_cached(url, RAW / "forus_es_clubs2.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Forus {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Forus", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://forus.es",
                    coord_source=coord_src,
                ))

    dump("forus_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Fitness Park Spain
# ---------------------------------------------------------------------------

def discover_fitnesspark() -> list[dict]:
    """Fitness Park Spain from official website."""
    log("  Fitness Park Spain: fetching clubs...")
    rows = []

    url = "https://www.fitnesspark.es/clubes/"
    html = fetch_cached(url, RAW / "fitnesspark_es_clubs.html")
    if not html:
        url = "https://www.fitnesspark.es/club/"
        html = fetch_cached(url, RAW / "fitnesspark_es_club.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Fitness Park {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Fitness Park", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.fitnesspark.es",
                    coord_source=coord_src,
                ))

    dump("fitnesspark_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Supera Spain
# ---------------------------------------------------------------------------

def discover_supera() -> list[dict]:
    """Supera from official website."""
    log("  Supera Spain: fetching clubs...")
    rows = []

    url = "https://superagimnasios.com/gimnasios/"
    html = fetch_cached(url, RAW / "supera_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Supera {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Supera", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://superagimnasios.com",
                    coord_source=coord_src,
                ))

    dump("supera_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Enjoy! Wellness Spain
# ---------------------------------------------------------------------------

def discover_enjoy() -> list[dict]:
    """Enjoy! Wellness from official website."""
    log("  Enjoy! Spain: fetching clubs...")
    rows = []

    url = "https://www.enjoywellness.es/centros"
    html = fetch_cached(url, RAW / "enjoy_es_clubs.html")
    if not html:
        url = "https://www.enjoywellness.es/gimnasios"
        html = fetch_cached(url, RAW / "enjoy_es_gimnasios.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Enjoy! {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Enjoy!", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.enjoywellness.es",
                    coord_source=coord_src,
                ))

    dump("enjoy_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# BeOne Spain
# ---------------------------------------------------------------------------

def discover_beone() -> list[dict]:
    """BeOne from official website."""
    log("  BeOne Spain: fetching clubs...")
    rows = []

    url = "https://www.beonesport.com/centros"
    html = fetch_cached(url, RAW / "beone_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"BeOne {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "BeOne", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.beonesport.com",
                    coord_source=coord_src,
                ))

    dump("beone_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# O2 Centro Wellness
# ---------------------------------------------------------------------------

def discover_o2() -> list[dict]:
    """O2 Centro Wellness from official website."""
    log("  O2 Centro Wellness: fetching clubs...")
    rows = []

    url = "https://o2centrowellness.com/centros/"
    html = fetch_cached(url, RAW / "o2_es_clubs.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"O2 Centro Wellness {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "O2 Centro Wellness", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://o2centrowellness.com",
                    coord_source=coord_src,
                ))

    dump("o2_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Eurofitness (Catalonia)
# ---------------------------------------------------------------------------

def discover_eurofitness() -> list[dict]:
    """Eurofitness from official website."""
    log("  Eurofitness: fetching clubs...")
    rows = []

    url = "https://eurofitness.com/centros/"
    html = fetch_cached(url, RAW / "eurofitness_es_clubs.html")
    if not html:
        url = "https://www.eurofitness.com/clubes"
        html = fetch_cached(url, RAW / "eurofitness_es_clubes.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Eurofitness {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Eurofitness", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://eurofitness.com",
                    coord_source=coord_src,
                ))

    dump("eurofitness_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Holiday Gym
# ---------------------------------------------------------------------------

def discover_holidaygym() -> list[dict]:
    """Holiday Gym from official website."""
    log("  Holiday Gym: fetching clubs...")
    rows = []

    url = "https://www.holidaygym.es/gimnasios/"
    html = fetch_cached(url, RAW / "holidaygym_es_clubs.html")
    if not html:
        url = "https://www.holidaygym.es/centros"
        html = fetch_cached(url, RAW / "holidaygym_es_centros.html")

    if html:
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
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
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street and not city:
                    continue
                nm = unescape(n.get("name") or f"Holiday Gym {city}")
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_spain_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                rows.append(row(
                    "Holiday Gym", nm, street, postal, city,
                    n.get("url") or url,
                    lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                    website="https://www.holidaygym.es",
                    coord_source=coord_src,
                ))

    dump("holidaygym_spain", rows)
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()
    all_rows = []

    log("=== SPAIN PHASE 1 DISCOVERY ===")
    log("")

    log("Basic-Fit")
    all_rows += discover_basicfit()

    log("McFIT")
    all_rows += discover_mcfit()

    log("Anytime Fitness")
    all_rows += discover_anytime()

    log("VivaGym")
    all_rows += discover_vivagym()

    log("Altafit")
    all_rows += discover_altafit()

    log("Synergym")
    all_rows += discover_synergym()

    log("DIR")
    all_rows += discover_dir()

    log("Dreamfit")
    all_rows += discover_dreamfit()

    log("GO fit")
    all_rows += discover_gofit()

    log("Metropolitan")
    all_rows += discover_metropolitan()

    log("Forus")
    all_rows += discover_forus()

    log("Fitness Park")
    all_rows += discover_fitnesspark()

    log("Supera")
    all_rows += discover_supera()

    log("Enjoy!")
    all_rows += discover_enjoy()

    log("BeOne")
    all_rows += discover_beone()

    log("O2 Centro Wellness")
    all_rows += discover_o2()

    log("Eurofitness")
    all_rows += discover_eurofitness()

    log("Holiday Gym")
    all_rows += discover_holidaygym()

    combined = OUT / "spain_discovery_combined.json"
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
