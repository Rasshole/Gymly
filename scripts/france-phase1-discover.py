#!/usr/bin/env python3
"""
France Phase 1 discovery — official chain locators and club pages only.

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
OUT = ROOT / "data/france"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()

FR_METRO_BOUNDS = (41.3, 51.1, -5.2, 9.6)  # lat_lo, lat_hi, lng_w, lng_e
FR_CORSICA = (41.4, 43.0, 8.5, 9.6)
FR_OVERSEAS_BOUNDS = {
    "Guadeloupe": (15.8, 16.6, -62.0, -60.9),
    "Martinique": (14.3, 14.9, -61.3, -60.8),
    "Guyane": (2.1, 5.8, -54.6, -51.6),
    "Réunion": (-21.4, -20.8, 55.2, 55.9),
    "Mayotte": (-13.1, -12.6, 44.9, 45.4),
}


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


def fr_postal(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    m = re.search(r"\b(\d{5})\b", s)
    if m:
        return m.group(1)
    return ""


def in_france_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    lo, hi, w, e = FR_METRO_BOUNDS
    if lo <= lat <= hi and w <= lng <= e:
        return True
    clo, chi, cw, ce = FR_CORSICA
    if clo <= lat <= chi and cw <= lng <= ce:
        return True
    for bounds in FR_OVERSEAS_BOUNDS.values():
        olo, ohi, ow, oe = bounds
        if olo <= lat <= ohi and ow <= lng <= oe:
            return True
    return False


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (postal or "").strip().lower(),
        (city or "").strip().lower(),
        "france",
    ])
    return "fr_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def row(
    brand: str, name: str, address: str, postal: str, city: str, source_url: str,
    lat=None, lng=None, opening_hours=None, notes="", coming=False,
    website=None, coord_source=None, legacy_brand=None,
) -> dict:
    postal = fr_postal(postal) or postal or ""
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
        "country": "France",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming,
        "import_category": "COMING_SOON" if coming else None,
        "phase": "france_phase1",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


# ---------------------------------------------------------------------------
# Basic-Fit France — HTML club-finder + individual club pages for JSON-LD
# ---------------------------------------------------------------------------

def discover_basicfit() -> list[dict]:
    """Basic-Fit France from club-finder HTML, then individual club pages."""
    log("  fetching club-finder pages...")
    rows = []
    seen_urls = set()

    for page_start in range(1, 1000, 128):
        finder_url = f"https://www.basic-fit.com/en-fr/club-finder?s={page_start}&sz=128"
        dest = RAW / f"basicfit_clubfinder_s{page_start}.html"
        html = fetch_cached(finder_url, dest)
        if not html or "gyms found" not in html[:2000]:
            break

        club_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-fr/clubs/basic-fit-[^\s"<>\']+\.html)',
            html,
        )
        opening_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-fr/clubs/opening-clubs[^\s"<>\']+)',
            html,
        )
        new_urls = [u for u in sorted(set(club_urls + opening_urls)) if u not in seen_urls]
        seen_urls.update(new_urls)
        log(f"    page s={page_start}: {len(new_urls)} new URLs (total {len(seen_urls)})")
        if not new_urls:
            break
        time.sleep(0.3)

    log(f"  total unique club URLs: {len(seen_urls)}")

    ld_items = {}
    for dest_file in RAW.glob("basicfit_clubfinder_s*.html"):
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
                    if url and "/en-fr/" in url:
                        ld_items[url] = item

    for url, item in ld_items.items():
        addr = item.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        postal = fr_postal(str(addr.get("postalCode") or ""))
        city = unescape(addr.get("addressLocality") or "")
        cc = (addr.get("addressCountry") or "").upper()
        if cc and cc not in ("FR", "FRANCE", ""):
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
                if in_france_bbox(la, lo):
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
            elif o and c:
                parts = []
                for sp in specs:
                    dw = sp.get("dayOfWeek") or []
                    parts.append(f"{','.join(d[:2] for d in dw)} {sp.get('opens','')}-{sp.get('closes','')}")
                hours = "; ".join(parts)

        coming = "coming-soon" in url.lower() or "opening-clubs" in url.lower()
        rows.append(row(
            "Basic-Fit", name, street, postal, city, url,
            lat=lat, lng=lng, opening_hours=hours,
            notes="official_clubfinder_json_ld",
            coming=coming, website="https://www.basic-fit.com",
            coord_source=coord_src,
        ))
        seen_urls.discard(url)

    remaining = sorted(seen_urls)
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
                    postal = postal or fr_postal(str(a.get("postalCode") or ""))
                    city = city or (a.get("addressLocality") or "")
                    cc = (a.get("addressCountry") or "").upper()
                    if cc and cc not in ("FR", "FRANCE", ""):
                        street = ""
                        break
                if isinstance(g, dict):
                    try:
                        la, lo = float(g.get("latitude")), float(g.get("longitude"))
                        if in_france_bbox(la, lo):
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

        if i % 100 == 0:
            log(f"    fetched {i}/{len(remaining)}")
        time.sleep(0.15)

    dump("basicfit_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Fitness Park — department pages
# ---------------------------------------------------------------------------

def discover_fitnesspark() -> list[dict]:
    """Fitness Park from department listing pages."""
    log("  Fitness Park: fetching department index...")
    index_url = "https://www.fitnesspark.fr/club/"
    html = fetch_cached(index_url, RAW / "fitnesspark_index.html")
    rows = []
    seen = set()

    dept_urls = re.findall(r'href="(/club/[^"]+/)"', html or "")
    dept_urls = sorted(set(dept_urls))
    log(f"  found {len(dept_urls)} department/city pages")

    for dept_path in dept_urls:
        dept_url = f"https://www.fitnesspark.fr{dept_path}"
        slug = dept_path.strip("/").replace("/", "_")
        dest = RAW / "pages" / "fitnesspark" / f"{slug}.html"
        page = fetch_cached(dept_url, dest)
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
                if n.get("@type") not in ("LocalBusiness", "SportsActivityLocation", "ExerciseGym", "HealthClub", "GymOrExerciseGym"):
                    continue
                a = n.get("address") or {}
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = fr_postal(str(a.get("postalCode") or ""))
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
                        if in_france_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                key = (street.lower(), postal, city.lower())
                if key in seen:
                    continue
                seen.add(key)
                web = n.get("url") or dept_url
                rows.append(row(
                    "Fitness Park", nm, street, postal, city, web,
                    lat=lat, lng=lng, notes="official_dept_page_json_ld",
                    website="https://www.fitnesspark.fr",
                    coord_source=coord_src,
                ))
        time.sleep(0.2)

    # Fallback: parse addresses from club page text
    if len(rows) < 50:
        log("  Fitness Park: JSON-LD yield low, parsing HTML addresses...")
        for dept_path in dept_urls:
            slug = dept_path.strip("/").replace("/", "_")
            dest = RAW / "pages" / "fitnesspark" / f"{slug}.html"
            if not dest.exists():
                continue
            page = dest.read_text(encoding="utf-8", errors="replace")
            text = re.sub(r'<[^>]+>', '\n', page)
            text = unescape(text)
            for m in re.finditer(
                r'(?:Fitness\s*[Pp]ark\s+)([^\n]{3,60})\n.*?'
                r'(?:itinéraire\s+vers\s+|Adresse\s*:\s*|vers\s+)'
                r'([^\n]{5,80}?)\s*,?\s*(\d{5})\s+([^\n]{2,40})',
                text, re.S,
            ):
                club_name = m.group(1).strip()
                street = m.group(2).strip().rstrip(",")
                postal = m.group(3)
                city = m.group(4).strip()
                nm = f"Fitness Park {club_name}"
                key = (street.lower(), postal, city.lower())
                if key in seen:
                    continue
                seen.add(key)
                rows.append(row(
                    "Fitness Park", nm, street, postal, city,
                    f"https://www.fitnesspark.fr{dept_path}",
                    notes="official_dept_page_html",
                    website="https://www.fitnesspark.fr",
                ))

    dump("fitnesspark_france", rows)
    return rows


# ---------------------------------------------------------------------------
# L'Orange Bleue
# ---------------------------------------------------------------------------

def discover_orangebleue() -> list[dict]:
    """L'Orange Bleue from official locator."""
    log("  L'Orange Bleue: fetching locator...")
    url = "https://www.lorangebleue.fr/nos-salles/"
    html = fetch_cached(url, RAW / "orangebleue_salles.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            cc = (a.get("addressCountry") or "").upper()
            if cc and cc not in ("FR", "FRANCE", ""):
                continue
            street = unescape(a.get("streetAddress") or "")
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            if not street and not city:
                continue
            nm = unescape(n.get("name") or f"L'Orange Bleue {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            web = n.get("url") or url
            rows.append(row(
                "L'Orange Bleue", nm, street, postal, city, web,
                lat=lat, lng=lng, notes="official_locator_json_ld",
                website="https://www.lorangebleue.fr",
                coord_source=coord_src,
            ))

    # Fallback: parse from page text
    if len(rows) < 50:
        log("  L'Orange Bleue: JSON-LD yield low, parsing HTML text...")
        text = re.sub(r'<[^>]+>', '\n', html or "")
        text = unescape(text)
        for m in re.finditer(
            r'([^\n]{3,60}?)\s+(\d+[^\n]{3,60}?)\s*[-–]\s*(\d{5})\s+([^\n]{2,40})',
            text,
        ):
            club_name = m.group(1).strip()
            street = m.group(2).strip().rstrip(",- ")
            postal = m.group(3)
            city = m.group(4).strip()
            if len(city) > 35:
                city = city.split()[0]
            nm = f"L'Orange Bleue {club_name}" if "orange" not in club_name.lower() else club_name
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "L'Orange Bleue", nm, street, postal, city, url,
                notes="official_locator_html",
                website="https://www.lorangebleue.fr",
            ))

    dump("orangebleue_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Keepcool (incl. Neoness, Metabolik)
# ---------------------------------------------------------------------------

def discover_keepcool() -> list[dict]:
    """Keepcool/Neoness/Metabolik from official club list page."""
    log("  Keepcool: fetching club list...")
    url = "https://www.keepcool.fr/liste-clubs-keepcool"
    html = fetch_cached(url, RAW / "keepcool_liste.html")

    url2 = "https://www.keepcool.fr/nos-salles-de-sport"
    html2 = fetch_cached(url2, RAW / "keepcool_nos_salles.html")

    rows = []
    seen = set()

    for src_html, src_url in [(html, url), (html2, url2)]:
        if not src_html:
            continue
        for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', src_html, re.S | re.I):
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
                cc = (a.get("addressCountry") or "").upper()
                if cc and cc not in ("FR", "FRANCE", ""):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = fr_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                nm = unescape(n.get("name") or "")
                brand = "Keepcool"
                if "neoness" in nm.lower():
                    brand = "Neoness"
                elif "metabolik" in nm.lower():
                    brand = "Metabolik"
                if not street and not city:
                    continue
                geo = n.get("geo") or {}
                lat, lng, coord_src = None, None, None
                if isinstance(geo, dict):
                    try:
                        la = float(geo.get("latitude"))
                        lo = float(geo.get("longitude"))
                        if in_france_bbox(la, lo):
                            lat, lng = la, lo
                            coord_src = "official_json_ld"
                    except (TypeError, ValueError):
                        pass
                key = (brand.lower(), street.lower(), postal, city.lower())
                if key in seen:
                    continue
                seen.add(key)
                web = n.get("url") or src_url
                rows.append(row(
                    brand, nm or f"{brand} {city}", street, postal, city, web,
                    lat=lat, lng=lng, notes="official_club_list_json_ld",
                    website="https://www.keepcool.fr",
                    coord_source=coord_src,
                ))

    # Parse club names from the list page as fallback
    if len(rows) < 50 and html:
        log("  Keepcool: parsing club names from list page...")
        text = re.sub(r'<[^>]+>', '\n', html)
        text = unescape(text)
        current_dept = ""
        for line in text.split("\n"):
            line = line.strip()
            dept_m = re.match(r'^(\d{2,3})\s*[-–]\s*(.+)', line)
            if dept_m:
                current_dept = dept_m.group(2).strip()
                continue
            if line.startswith("KEEPCOOL") or line.startswith("NEONESS") or line.startswith("METABOLIK"):
                brand = "Keepcool"
                if line.startswith("NEONESS"):
                    brand = "Neoness"
                elif line.startswith("METABOLIK"):
                    brand = "Metabolik"
                club_name = line.strip()
                key = (brand.lower(), "", "", club_name.lower())
                if key in seen:
                    continue
                seen.add(key)
                rows.append(row(
                    brand, club_name, "", "", "", url,
                    notes=f"official_club_list_text; dept={current_dept}",
                    website="https://www.keepcool.fr",
                ))

    dump("keepcool_france", rows)
    return rows


# ---------------------------------------------------------------------------
# ON AIR Fitness
# ---------------------------------------------------------------------------

def discover_onair() -> list[dict]:
    """ON AIR Fitness from official website."""
    log("  ON AIR Fitness: fetching homepage...")
    url = "https://onair-fitness.fr/"
    html = fetch_cached(url, RAW / "onair_homepage.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"ON AIR {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "ON AIR Fitness", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_homepage_json_ld",
                website="https://onair-fitness.fr",
                coord_source=coord_src,
            ))

    dump("onair_france", rows)
    return rows


# ---------------------------------------------------------------------------
# L'Appart Fitness
# ---------------------------------------------------------------------------

def discover_lappart() -> list[dict]:
    """L'Appart Fitness from official club locator."""
    log("  L'Appart Fitness: fetching club locator...")
    url = "https://clubs.lappartfitness.com/fr"
    html = fetch_cached(url, RAW / "lappart_clubs.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
        try:
            data = json.loads(jm.group(1).strip())
        except Exception:
            continue
        nodes = data if isinstance(data, list) else [data]
        if isinstance(data, dict) and "@graph" in data:
            nodes = data["@graph"]
        if isinstance(data, dict) and data.get("@type") == "ItemList":
            for entry in (data.get("itemListElement") or []):
                item = entry.get("item") or {}
                if isinstance(item, dict) and item.get("@type") == "LocalBusiness":
                    nodes.append(item)
        for n in nodes:
            if not isinstance(n, dict):
                continue
            a = n.get("address") or {}
            if not isinstance(a, dict):
                continue
            street = unescape(a.get("streetAddress") or "")
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"L'Appart Fitness {city}")
            if not street and not city:
                continue
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            web = n.get("url") or url
            rows.append(row(
                "L'Appart Fitness", nm, street, postal, city, web,
                lat=lat, lng=lng, notes="official_locator_json_ld",
                website="https://lappartfitness.com",
                coord_source=coord_src,
            ))

    dump("lappart_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness France
# ---------------------------------------------------------------------------

def discover_anytime() -> list[dict]:
    """Anytime Fitness France from official locator."""
    log("  Anytime Fitness France...")
    clubs = [
        ("Villeurbanne", "77-79 Boulevard de la Bataille de Stalingrad", "69100", "Villeurbanne", "https://www.anytimefitness.fr/gyms/fr-1005/villeurbanne-auvergne-rhône-alpes-69100/"),
        ("Nice", "38 Rue Beaumont", "06300", "Nice", "https://www.anytimefitness.fr/gyms/fr-1006/nice-provence-alpes-côte-d'azur-06300/"),
        ("Colombes", "85 Rue Gabriel Péri", "92700", "Colombes", "https://www.anytimefitness.fr/gyms/fr-1007/colombes-paris-region-92700/"),
    ]
    coming = [
        ("Suresnes", "3-7 rue Baudin", "92150", "Suresnes", "https://www.anytimefitness.fr/gyms/fr-1009/suresnes-paris-region-92150/"),
        ("Thionville", "Centre Commercial La Cour des Capucins 13 Rue du Cygne", "57100", "Thionville", "https://www.anytimefitness.fr/gyms/fr-1008/thionville-grand-est-57100/"),
        ("Nîmes", "21 rue de la République", "30000", "Nîmes", "https://www.anytimefitness.fr/gyms/fr-1011/nîmes-occitanie-30000/"),
        ("Nice 2", "5bis rue Oscar II", "06000", "Nice", "https://www.anytimefitness.fr/gyms/fr-1010/nice-provence-alpes-côte-d'azur-06000/"),
    ]

    rows = []
    for loc_name, street, postal, city, url in clubs:
        rows.append(row(
            "Anytime Fitness", f"Anytime Fitness {loc_name}", street, postal, city, url,
            opening_hours="24/7", notes="official_locator; open",
            website="https://www.anytimefitness.fr",
        ))
    for loc_name, street, postal, city, url in coming:
        rows.append(row(
            "Anytime Fitness", f"Anytime Fitness {loc_name}", street, postal, city, url,
            opening_hours="24/7", notes="official_locator; coming_soon",
            coming=True,
            website="https://www.anytimefitness.fr",
        ))

    dump("anytime_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Cercles de la Forme (Paris network)
# ---------------------------------------------------------------------------

def discover_cercles() -> list[dict]:
    """Cercles de la Forme from club listing page."""
    log("  Cercles de la Forme: fetching clubs page...")
    url = "https://www.cerclesdelaforme.com/clubs-de-sport-fitness/"
    html = fetch_cached(url, RAW / "cercles_clubs.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"Cercles de la Forme {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Cercles de la Forme", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                website="https://www.cerclesdelaforme.com",
                coord_source=coord_src,
            ))

    dump("cercles_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Vita Liberté
# ---------------------------------------------------------------------------

def discover_vitaliberte() -> list[dict]:
    """Vita Liberté from official club list."""
    log("  Vita Liberté: fetching clubs page...")
    url = "https://www.vitaliberte.fr/nos-clubs/"
    html = fetch_cached(url, RAW / "vitaliberte_clubs.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"Vita Liberté {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Vita Liberté", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                website="https://www.vitaliberte.fr",
                coord_source=coord_src,
            ))

    dump("vitaliberte_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Elancia
# ---------------------------------------------------------------------------

def discover_elancia() -> list[dict]:
    """Elancia from official website."""
    log("  Elancia: fetching club pages...")
    url = "https://www.elancia.fr/"
    html = fetch_cached(url, RAW / "elancia_homepage.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"Elancia {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Elancia", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_homepage_json_ld",
                website="https://www.elancia.fr",
                coord_source=coord_src,
            ))

    dump("elancia_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Gigafit
# ---------------------------------------------------------------------------

def discover_gigafit() -> list[dict]:
    """Gigafit from official website."""
    log("  Gigafit: fetching club pages...")
    url = "https://www.gigafit.fr/"
    html = fetch_cached(url, RAW / "gigafit_homepage.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"Gigafit {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Gigafit", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_homepage_json_ld",
                website="https://www.gigafit.fr",
                coord_source=coord_src,
            ))

    dump("gigafit_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Magic Form
# ---------------------------------------------------------------------------

def discover_magicform() -> list[dict]:
    """Magic Form from official club listing."""
    log("  Magic Form: fetching club pages...")
    url = "https://magic-form.fr/clubs/"
    html = fetch_cached(url, RAW / "magicform_clubs.html")
    rows = []
    seen = set()

    for jm in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", re.S | re.I):
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
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            nm = unescape(n.get("name") or f"Magic Form {city}")
            geo = n.get("geo") or {}
            lat, lng, coord_src = None, None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france_bbox(la, lo):
                        lat, lng = la, lo
                        coord_src = "official_json_ld"
                except (TypeError, ValueError):
                    pass
            key = (street.lower(), postal, city.lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row(
                "Magic Form", nm, street, postal, city, url,
                lat=lat, lng=lng, notes="official_clubs_page_json_ld",
                website="https://magic-form.fr",
                coord_source=coord_src,
            ))

    dump("magicform_france", rows)
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()
    all_rows = []

    log("=== FRANCE PHASE 1 DISCOVERY ===")
    log("")

    log("Basic-Fit")
    all_rows += discover_basicfit()

    log("Fitness Park")
    all_rows += discover_fitnesspark()

    log("L'Orange Bleue")
    all_rows += discover_orangebleue()

    log("Keepcool / Neoness / Metabolik")
    all_rows += discover_keepcool()

    log("ON AIR Fitness")
    all_rows += discover_onair()

    log("L'Appart Fitness")
    all_rows += discover_lappart()

    log("Anytime Fitness")
    all_rows += discover_anytime()

    log("Cercles de la Forme")
    all_rows += discover_cercles()

    log("Vita Liberté")
    all_rows += discover_vitaliberte()

    log("Elancia")
    all_rows += discover_elancia()

    log("Gigafit")
    all_rows += discover_gigafit()

    log("Magic Form")
    all_rows += discover_magicform()

    combined = OUT / "france_discovery_combined.json"
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
