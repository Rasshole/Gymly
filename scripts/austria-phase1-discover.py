#!/usr/bin/env python3
"""
Austria Phase 1 discovery — official sources into staging candidates.
Does NOT modify centers.json. Does NOT invent coordinates.
"""
from __future__ import annotations

import gzip
import hashlib
import html as htmlmod
import io
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/austria"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PAGES = RAW / "pages"
for d in (OUT, RAW, SCRAPES, PAGES):
    d.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyAustriaResearch/1.0; catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "identity",
}

AT_BOUNDS = (46.35, 49.05, 9.45, 17.20)
AT_POSTAL_RE = re.compile(r"^\d{4}$")
TODAY = date.today()

JH_NAMES = {
    ("Nibelungengasse 5", "1010", "Wien"): "Schillerplatz",
    ("Strobachgasse 7-9", "1050", "Wien"): "Margaretenplatz",
    ("Donau-City-Straße 7", "1220", "Wien"): "DC Tower",
    ("Wiedner Gürtel 9", "1100", "Wien"): "Hauptbahnhof",
    ("Marxergasse 17", "1030", "Wien"): "Sofiensäle",
    ("Untere Donaustraße 21", "1020", "Wien"): "UNIQA Tower",
    ("Opernring 13-15", "1010", "Wien"): "Executive Club",
    ("Getreidemarkt 8", "1010", "Wien"): "Medical Center",
    ("Untere Donaulände 21-25", "4020", "Linz"): "Donaupark",
    ("Mozartstraße 7-11", "4020", "Linz"): "Atrium",
    ("Girardigasse 1c", "8010", "Graz"): "Thalia",
    ("Innsbrucker Bundesstraße 35", "5020", "Salzburg"): "Salzburg Medicent",
}


def fetch(url: str, timeout: int = 45) -> tuple[str, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        raw = r.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", "replace"), r.geturl()


def fetch_json(url: str, extra_headers: dict | None = None) -> tuple[list | dict, str]:
    headers = {**UA, **(extra_headers or {})}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=45) as r:
        raw = r.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8", "replace")), r.geturl()


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def at_postal(s: str) -> str:
    m = re.search(r"\b(\d{4})\b", str(s or ""))
    return m.group(1) if m else ""


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
            "austria",
        ]
    )
    return "at_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_austria(lat: float, lng: float) -> bool:
    return AT_BOUNDS[0] <= lat <= AT_BOUNDS[1] and AT_BOUNDS[2] <= lng <= AT_BOUNDS[3]


def row(
    brand: str,
    center_name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    *,
    lat=None,
    lng=None,
    website: str = "",
    opening_hours=None,
    source_type: str = "official_page",
    coord_source: str | None = None,
    legacy_brand: str = "",
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    official_location_id: str = "",
):
    address = clean_text(address)
    postal = at_postal(postal)
    city = clean_text(city)
    center_name = clean_text(center_name)
    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if lat_f == 0 and lng_f == 0:
                lat_f = lng_f = None
            elif not in_austria(lat_f, lng_f):
                notes = (notes + "; coord_outside_at_bbox").strip("; ")
                lat_f = lng_f = None
        except (TypeError, ValueError):
            lat_f = lng_f = None

    name = center_name
    if brand and center_name and not center_name.lower().startswith(brand.lower()[:4]):
        name = f"{brand} {center_name}".strip()

    rid = make_id(brand, address, postal, city)
    status = "CLOSED" if closed else ("COMING_SOON" if coming else "NEEDS_REVIEW")
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": center_name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Austria",
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": opening_hours,
        "website": website or None,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": status,
        "notes": notes,
        "is_active": not (closed or coming),
        "import_category": status if status in ("COMING_SOON", "CLOSED") else "NEEDS_REVIEW",
        "phase": "austria_phase1",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand or None,
        "official_location_id": official_location_id or None,
        "discovery_class": "national_chain",
    }


def extract_json_ld(html: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(data, list):
            out.extend(x for x in data if isinstance(x, dict))
        elif isinstance(data, dict):
            graph = data.get("@graph")
            if isinstance(graph, list):
                out.extend(x for x in graph if isinstance(x, dict))
            else:
                out.append(data)
    return out


def parse_json_ld_gym(html: str, brand: str, source_url: str) -> dict | None:
    for block in extract_json_ld(html):
        t = block.get("@type")
        types = [str(x) for x in (t if isinstance(t, list) else [t]) if x]
        if not any(
            x in ("SportsActivityLocation", "ExerciseGym", "HealthClub", "LocalBusiness", "Place")
            for x in types
        ):
            continue
        addr = block.get("address") if isinstance(block.get("address"), dict) else {}
        geo = block.get("geo") if isinstance(block.get("geo"), dict) else {}
        street = clean_text(addr.get("streetAddress") or "")
        city = clean_text(addr.get("addressLocality") or "")
        postal = at_postal(addr.get("postalCode") or "")
        cc = (addr.get("addressCountry") or "").upper()
        if cc and cc not in ("AT", "AUT", "AUSTRIA", "ÖSTERREICH"):
            continue
        lat = lng = None
        cs = None
        if geo.get("latitude") is not None:
            try:
                lat = float(geo["latitude"])
                lng = float(geo["longitude"])
                if in_austria(lat, lng):
                    cs = "OFFICIAL_STRUCTURED_DATA"
                else:
                    lat = lng = None
            except (TypeError, ValueError):
                pass
        name = clean_text(block.get("name") or "")
        if street or postal:
            return {
                "name": name or brand,
                "address": street,
                "postal_code": postal,
                "city": city,
                "lat": lat,
                "lng": lng,
                "coord_source": cs,
            }
    return None


def discover_magicline() -> list[dict]:
    print("=== RSG MagicLine (McFIT / JOHN REED / Gold's Gym) ===")
    data, _ = fetch_json(
        "https://rsg-group.api.magicline.com/connect/v1/studio",
        {"Origin": "https://www.mcfit.com", "Accept": "application/json"},
    )
    SCRAPES.joinpath("magicline_studios.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    out = []
    for s in data:
        addr = s.get("address") or {}
        if (addr.get("countryCodeAlpha2") or "").upper() != "AT":
            continue
        tag_names = [(t.get("name") or "").strip() for t in (s.get("studioTags") or []) if isinstance(t, dict)]
        tag_set = set(tag_names)
        closed = "inaktiv" in tag_set or "GHOST-STUDIO" in tag_set or bool(s.get("closingDate"))
        coming = "VVK" in tag_set
        if "McFIT" in tag_set:
            brand = "McFIT"
        elif "JOHN REED" in tag_set:
            brand = "JOHN REED"
        elif "Gold's Gym" in tag_set:
            brand = "Gold's Gym"
        else:
            name_u = (s.get("studioName") or "").upper()
            if name_u.startswith("MCFIT"):
                brand = "McFIT"
            elif "JOHN REED" in name_u:
                brand = "JOHN REED"
            elif "GOLD" in name_u:
                brand = "Gold's Gym"
            else:
                continue

        street = " ".join(x for x in [addr.get("street"), addr.get("houseNumber")] if x).strip()
        if addr.get("streetAddition"):
            street = f"{street}, {addr['streetAddition']}".strip(", ")
        lat, lng = addr.get("latitude"), addr.get("longitude")
        cs = "OFFICIAL_API" if lat is not None else None
        out.append(
            row(
                brand,
                s.get("studioName") or brand,
                street,
                str(addr.get("zipCode") or ""),
                addr.get("city") or "",
                "https://rsg-group.api.magicline.com/connect/v1/studio",
                lat=lat,
                lng=lng,
                website="https://www.mcfit.com/studios",
                opening_hours=s.get("openingHours"),
                source_type="official_api",
                coord_source=cs,
                notes=f"magicline_id={s.get('id')}; tags={','.join(tag_names[:10])}",
                coming=coming and not closed,
                closed=closed,
                official_location_id=str(s.get("id") or ""),
            )
        )
    print("  rows", len(out), Counter(r["brand"] for r in out))
    return out


def discover_fitinn() -> list[dict]:
    print("=== FITINN ===")
    html, _ = fetch("https://fitinn.at/studios/")
    (PAGES / "fitinn_studios_index.html").write_text(html, encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href="(https://fitinn\.at/fitnessstudios/[^"/]+/?)"', html)
            + [f"https://fitinn.at{l}" for l in re.findall(r'href="(/fitnessstudios/[^"/]+/?)"', html)]
        )
    )
    # Stop before foreign country sections — AT slugs only on fitinn.at domain
    links = [u for u in links if "fitinn.at/fitnessstudios/" in u]
    print("  detail URLs", len(links))
    out = []
    for i, url in enumerate(links):
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, _ = fetch(url)
        except Exception as e:
            print("   skip", slug, e)
            continue
        safe = re.sub(r"[^a-z0-9_-]+", "_", slug)[:80]
        (PAGES / f"fitinn_{safe}.html").write_text(page, encoding="utf-8")
        street = city = postal = name = ""
        lat = lng = None
        cs = None
        m = re.search(r'property="og:title" content="([^"]+)"', page)
        if m:
            title = clean_text(m.group(1))
            # AT clubs: "Fitnessstudio 1010 Wien, Schwedenplatz | ..." or "Fitnessstudio 8020 Graz Bahnhof | ..."
            if not title.lower().startswith("fitnessstudio"):
                continue
            tm = re.search(
                r"Fitnessstudio\s+(\d{4})\s+([^,|]+),\s*([^|]+)",
                title,
                re.I,
            )
            if tm:
                postal, city, street = tm.group(1), tm.group(2).strip(), tm.group(3).strip()
            else:
                tm2 = re.search(r"Fitnessstudio\s+(\d{4})\s+([A-Za-zäöüÄÖÜß\- ]+?)\s+([^|,]+)", title, re.I)
                if tm2:
                    postal, city, street = tm2.group(1), tm2.group(2).strip(), tm2.group(3).strip()
            if postal and not (1000 <= int(postal) <= 9999):
                continue
            name = f"FITINN {city} {street}".strip() if city and street else title.split("|")[0].strip()
        if not postal or not city or not street:
            continue
        if not name:
            name = f"FITINN {slug.replace('-', ' ').title()}"
        out.append(
            row(
                "FITINN",
                name,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website="https://fitinn.at/studios/",
                source_type="official_club_page",
                coord_source=cs,
                notes=f"slug={slug}",
                official_location_id=slug,
            )
        )
        if (i + 1) % 10 == 0:
            time.sleep(0.3)
    print("  rows", len(out))
    return out


def discover_clever_fit() -> list[dict]:
    print("=== clever fit ===")
    xml, _ = fetch("https://www.clever-fit.com/studio-sitemap1.xml")
    SCRAPES.joinpath("clever_fit_sitemap.xml").write_text(xml, encoding="utf-8")
    urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if "/de-AT/fitnessstudio/" in u]
    print("  AT URLs", len(urls))
    out = []
    for i, url in enumerate(urls):
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, _ = fetch(url)
        except Exception as e:
            print("   skip", slug, e)
            continue
        (PAGES / f"clever_fit_{slug}.html").write_text(page, encoding="utf-8")
        parsed = parse_json_ld_gym(page, "clever fit", url)
        if not parsed:
            continue
        out.append(
            row(
                "clever fit",
                parsed["name"] or f"clever fit {slug}",
                parsed["address"],
                parsed["postal_code"],
                parsed["city"],
                url,
                lat=parsed["lat"],
                lng=parsed["lng"],
                website="https://www.clever-fit.com/de-AT/",
                source_type="official_structured_data",
                coord_source=parsed["coord_source"],
                official_location_id=slug,
            )
        )
        if (i + 1) % 8 == 0:
            time.sleep(0.25)
    print("  rows", len(out))
    return out


def discover_happyfit() -> list[dict]:
    print("=== HappyFit ===")
    html, _ = fetch("https://www.happyfit.eu/de/standorte")
    (PAGES / "happyfit_standorte.html").write_text(html, encoding="utf-8")
    m = re.search(r"const\s+studios\s*=\s*(\[.*?\]);", html, re.S)
    if not m:
        print("  no embedded studios JSON")
        return []
    studios = json.loads(m.group(1))
    SCRAPES.joinpath("happyfit_studios.json").write_text(
        json.dumps(studios, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    out = []
    for s in studios:
        lat, lng = s.get("lat"), s.get("lng")
        if lat is None or lng is None or not in_austria(float(lat), float(lng)):
            continue
        addr = clean_text(s.get("address") or "")
        street, postal, city = "", "", ""
        am = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", addr)
        if am:
            street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        else:
            tm = re.search(r"\b(\d{4})\b", addr)
            postal = tm.group(1) if tm else ""
            street = addr
        out.append(
            row(
                "HappyFit",
                s.get("name") or "HappyFit",
                street,
                postal,
                city,
                s.get("url") or "https://www.happyfit.eu/de/standorte",
                lat=lat,
                lng=lng,
                website="https://www.happyfit.eu/de/standorte",
                source_type="official_embedded_json",
                coord_source="OFFICIAL_API",
                official_location_id=(s.get("url") or "").rstrip("/").split("/")[-1],
            )
        )
    print("  rows", len(out))
    return out


def discover_injoy() -> list[dict]:
    print("=== INJOY ===")
    html, _ = fetch("https://www.injoy.at/liste-studios-nach-bundesland")
    (PAGES / "injoy_liste.html").write_text(html, encoding="utf-8")
    blocks = re.findall(r">([^<]{8,140}\d{4}[^<]{3,60})<", html)
    seen = set()
    out = []
    for b in blocks:
        t = clean_text(b)
        if not t.startswith("INJOY"):
            continue
        m = re.match(r"^INJOY\s+(.+?),\s*(.+?),\s*(\d{4}),\s*(.+)$", t)
        if not m:
            m = re.match(r"^INJOY\s+(.+?),\s*(.+?),\s*(\d{4})\s*,?\s*(.+)$", t)
        if not m:
            continue
        center, street, postal, city = m.group(1).strip(), m.group(2).strip(), m.group(3), m.group(4).strip()
        key = (street, postal, city)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            row(
                "INJOY",
                f"INJOY {center}",
                street,
                postal,
                city,
                "https://www.injoy.at/liste-studios-nach-bundesland",
                website="https://www.injoy.at/",
                source_type="official_address_listing",
                notes=f"center={center}",
            )
        )
    print("  rows", len(out))
    return out


def discover_mrssporty() -> list[dict]:
    print("=== Mrs.Sporty ===")
    html, _ = fetch("https://www.mrssporty.at/finde-deinen-club/")
    (PAGES / "mrssporty_index.html").write_text(html, encoding="utf-8")
    links = sorted(set(re.findall(r'href="(https://www\.mrssporty\.at/club/[^"/]+/)"', html)))
    print("  club URLs", len(links))
    out = []
    for i, url in enumerate(links):
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, _ = fetch(url)
        except Exception as e:
            print("   skip", slug, e)
            continue
        (PAGES / f"mrssporty_{slug}.html").write_text(page, encoding="utf-8")
        street = postal = city = ""
        m = re.search(
            r'<p[^>]*>([A-Za-zäöüÄÖÜß][^,<]{3,60},\s*\d{4}\s+[A-Za-zäöüÄÖÜß\-/ ]+)</p>',
            page,
        )
        if m:
            am = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", clean_text(m.group(1)))
            if am:
                street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        if not postal:
            mm = re.search(
                r'"Strasse"\s*:\s*"([^"]+)".*?"PLZ"\s*:\s*"(\d{4})".*?"Stadt"\s*:\s*"([^"]+)"',
                page,
                re.S,
            )
            if mm:
                street = htmlmod.unescape(mm.group(1))
                postal, city = mm.group(2), mm.group(3)
        name = f"Mrs.Sporty {slug.replace('-', ' ').title()}"
        tm = re.search(r"<title>([^<|]+)", page)
        if tm:
            name = clean_text(tm.group(1).split("|")[0])
        out.append(
            row(
                "Mrs.Sporty",
                name,
                street,
                postal,
                city,
                url,
                website="https://www.mrssporty.at/finde-deinen-club/",
                source_type="official_club_page",
                official_location_id=slug,
            )
        )
        if (i + 1) % 10 == 0:
            time.sleep(0.3)
    print("  rows", len(out))
    return out


def discover_mygym() -> list[dict]:
    print("=== MYGYM ===")
    html, _ = fetch("https://www.mygym.at/standorte")
    (PAGES / "mygym_standorte.html").write_text(html, encoding="utf-8")
    blocks = re.findall(r">([^<]{10,120}\d{4}[^<]{3,40})<", html)
    seen = set()
    out = []
    for b in blocks:
        t = clean_text(htmlmod.unescape(b))
        m = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", t)
        if not m:
            m = re.match(r"^(.+?\d+[a-z0-9\-/]*)\s+(\d{4})\s+(.+)$", t)
        if not m:
            continue
        street, postal, city = m.group(1).strip(), m.group(2), m.group(3).strip()
        if not re.search(r"\d", street):
            continue
        key = (street, postal, city)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            row(
                "MYGYM",
                f"MYGYM {city}",
                street,
                postal,
                city,
                "https://www.mygym.at/standorte",
                website="https://www.mygym.at/",
                source_type="official_address_listing",
            )
        )
    print("  rows", len(out))
    return out


def discover_speedfit() -> list[dict]:
    print("=== Speedfit ===")
    html, _ = fetch("https://speedfit.club/at")
    (PAGES / "speedfit_at_index.html").write_text(html, encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href="(https://speedfit\.club/at/fitnessstudio[s]?/[^"?#]+)"', html)
        )
    )
    print("  studio URLs", len(links))
    out = []
    for i, url in enumerate(links):
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, _ = fetch(url)
        except Exception as e:
            print("   skip", slug, e)
            continue
        (PAGES / f"speedfit_{slug}.html").write_text(page, encoding="utf-8")
        street = postal = city = name = ""
        lat = lng = None
        cs = None
        tm = re.search(r"\b(\d{4})\s+(Wien|Graz|Linz|Salzburg|Innsbruck|[A-Za-zäöüÄÖÜß\-/ ]{3,40})", page)
        if tm:
            postal, city = tm.group(1), tm.group(2).strip()
        for block in extract_json_ld(htmlmod.unescape(page)):
            if block.get("@type") == "FAQPage":
                continue
        parsed = parse_json_ld_gym(page, "Speedfit", url)
        # Speedfit pages often lack gym JSON-LD — parse address lines
        am = re.search(
            r'([A-Za-zäöüÄÖÜß][A-Za-zäöüÄÖÜß\-\. ]+\d+[a-z0-9\-/]*)\s*,?\s*(\d{4})\s+([A-Za-zäöüÄÖÜß\-/ ]+)',
            page,
        )
        if am:
            street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        name = f"Speedfit {slug.replace('-', ' ').title()}"
        tm2 = re.search(r"<title>([^<]+)</title>", page, re.I)
        if tm2:
            t = clean_text(tm2.group(1))
            if "Speedfit" in t:
                name = t.split("–")[0].strip()
        out.append(
            row(
                "Speedfit",
                name,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website="https://speedfit.club/at",
                source_type="official_club_page",
                coord_source=cs,
                official_location_id=slug,
            )
        )
        if (i + 1) % 8 == 0:
            time.sleep(0.25)
    print("  rows", len(out))
    return out


def discover_fitfabrik() -> list[dict]:
    print("=== Fit Fabrik ===")
    html, _ = fetch("https://fitfabrik.at/studios/")
    (PAGES / "fitfabrik_studios.html").write_text(html, encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href="(https://fitfabrik\.at/fit-fabrik[^"]+)"', html)
        )
    )
    print("  studio URLs", len(links))
    out = []
    for i, url in enumerate(links):
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, _ = fetch(url)
        except Exception as e:
            print("   skip", slug, e)
            continue
        (PAGES / f"fitfabrik_{slug}.html").write_text(page, encoding="utf-8")
        parsed = parse_json_ld_gym(page, "Fit Fabrik", url)
        street = postal = city = ""
        lat = lng = None
        cs = None
        if parsed:
            street, postal, city = parsed["address"], parsed["postal_code"], parsed["city"]
            lat, lng, cs = parsed["lat"], parsed["lng"], parsed["coord_source"]
        if not postal:
            for m in re.finditer(
                r'elementor-icon-list-text">([^<]+\d{4}\s+[A-Za-zäöüÄÖÜß\-/ ]+)',
                page,
            ):
                line = clean_text(m.group(1))
                am = re.match(r"^(.+?)\s+(\d{4})\s+(.+)$", line)
                if am:
                    street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
                    break
        if not postal:
            am = re.search(
                r'([A-Za-zäöüÄÖÜß][A-Za-zäöüÄÖÜß\-\. ]+\d+[a-z0-9\-/]*)\s*,?\s*(\d{4})\s+([A-Za-zäöüÄÖÜß\-/ ]+)',
                page,
            )
            if am:
                street, postal, city = am.group(1).strip(), am.group(2), am.group(3).strip()
        name = slug.replace("-", " ").title()
        if "plus" in slug.lower():
            brand = "Fit Fabrik"
            name = name.replace("Fit Fabrik Plus", "Fit Fabrik Plus").strip()
        else:
            brand = "Fit Fabrik"
        out.append(
            row(
                brand,
                name,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website="https://fitfabrik.at/studios/",
                source_type="official_club_page",
                coord_source=cs,
                official_location_id=slug,
            )
        )
        if (i + 1) % 6 == 0:
            time.sleep(0.25)
    print("  rows", len(out))
    return out


def discover_john_harris() -> list[dict]:
    print("=== John Harris Fitness ===")
    html, _ = fetch("https://www.johnharris.at/de/startseite.html")
    (PAGES / "johnharris_startseite.html").write_text(html, encoding="utf-8")
    pat = r"([A-Za-zäöüÄÖÜß][A-Za-zäöüÄÖÜß\-\. ]+\d+[a-z0-9\-/]*)\s*\|\s*(\d{4})\s+([A-Za-zäöüÄÖÜß\-/ ]+)"
    seen = set()
    out = []
    for m in re.finditer(pat, html):
        street, postal, city = m.group(1).strip(), m.group(2), m.group(3).strip()
        street = re.sub(r"\s+", " ", street)
        key = (street, postal, city)
        if key in seen:
            continue
        seen.add(key)
        center = JH_NAMES.get(key, street.split()[0])
        out.append(
            row(
                "John Harris Fitness",
                f"John Harris {center}",
                street,
                postal,
                city,
                "https://www.johnharris.at/de/startseite.html",
                website="https://www.johnharris.at/de/startseite.html",
                source_type="official_address_listing",
                notes=f"studio={center}",
            )
        )
    print("  rows", len(out))
    return out


CHAIN_INVENTORY = [
    {
        "brand": "FITINN",
        "official_website": "https://fitinn.at/studios/",
        "locator_url": "https://fitinn.at/studios/",
        "claimed_at_clubs": "~55-57",
        "source_type": "official_club_pages",
        "scrape_feasibility": "high",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "McFIT",
        "official_website": "https://www.mcfit.com/studios",
        "locator_url": "https://rsg-group.api.magicline.com/connect/v1/studio",
        "claimed_at_clubs": "16",
        "source_type": "official_api",
        "scrape_feasibility": "high",
        "coordinate_quality": "official_api",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "clever fit",
        "official_website": "https://www.clever-fit.com/de-AT/",
        "locator_url": "https://www.clever-fit.com/studio-sitemap1.xml",
        "claimed_at_clubs": "~39-48",
        "source_type": "official_sitemap+json-ld",
        "scrape_feasibility": "high",
        "coordinate_quality": "official_structured_data",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "HappyFit",
        "official_website": "https://www.happyfit.eu/de/standorte",
        "locator_url": "https://www.happyfit.eu/de/standorte",
        "claimed_at_clubs": "29",
        "source_type": "official_embedded_json",
        "scrape_feasibility": "high",
        "coordinate_quality": "official_api",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "MYGYM",
        "official_website": "https://www.mygym.at/standorte",
        "locator_url": "https://www.mygym.at/standorte",
        "claimed_at_clubs": "~19",
        "source_type": "official_address_listing",
        "scrape_feasibility": "high",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "INJOY",
        "official_website": "https://www.injoy.at/",
        "locator_url": "https://www.injoy.at/liste-studios-nach-bundesland",
        "claimed_at_clubs": "~35",
        "source_type": "official_address_listing",
        "scrape_feasibility": "high",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "Mrs.Sporty",
        "official_website": "https://www.mrssporty.at/finde-deinen-club/",
        "locator_url": "https://www.mrssporty.at/finde-deinen-club/",
        "claimed_at_clubs": "~38-51",
        "source_type": "official_club_pages",
        "scrape_feasibility": "medium",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "Speedfit",
        "official_website": "https://speedfit.club/at",
        "locator_url": "https://speedfit.club/at",
        "claimed_at_clubs": "~19",
        "source_type": "official_club_pages",
        "scrape_feasibility": "high",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "Fit Fabrik",
        "official_website": "https://fitfabrik.at/studios/",
        "locator_url": "https://fitfabrik.at/studios/",
        "claimed_at_clubs": "~14-17",
        "source_type": "official_club_pages",
        "scrape_feasibility": "high",
        "coordinate_quality": "mixed",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "JOHN REED",
        "official_website": "https://johnreed.fitness/",
        "locator_url": "https://rsg-group.api.magicline.com/connect/v1/studio",
        "claimed_at_clubs": "7",
        "source_type": "official_api",
        "scrape_feasibility": "high",
        "coordinate_quality": "official_api",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "John Harris Fitness",
        "official_website": "https://www.johnharris.at/",
        "locator_url": "https://www.johnharris.at/de/startseite.html",
        "claimed_at_clubs": "12",
        "source_type": "official_address_listing",
        "scrape_feasibility": "medium (gzip SPA shell)",
        "coordinate_quality": "geocode_required",
        "phase1_status": "PHASE1_EXTRACT",
    },
    {
        "brand": "Anytime Fitness",
        "official_website": "https://www.anytimefitness.at/",
        "locator_url": "https://www.anytimefitness.at/standorte",
        "claimed_at_clubs": "~19",
        "source_type": "js_locator",
        "scrape_feasibility": "blocked",
        "coordinate_quality": "unknown",
        "phase1_status": "PHASE2_REQUIRED",
    },
    {
        "brand": "Holmes Place",
        "official_website": "https://www.holmesplace.at/",
        "locator_url": "https://www.holmesplace.at/de/clubs",
        "claimed_at_clubs": "3",
        "source_type": "js_locator",
        "scrape_feasibility": "blocked (403)",
        "coordinate_quality": "unknown",
        "phase1_status": "PHASE2_REQUIRED",
    },
    {
        "brand": "Fitness First",
        "official_website": "https://www.fitnessfirst.de/",
        "locator_url": "https://www.fitnessfirst.de/clubs",
        "claimed_at_clubs": "4",
        "source_type": "cross_border_brand",
        "scrape_feasibility": "medium",
        "coordinate_quality": "mixed",
        "phase1_status": "PHASE2_REQUIRED",
    },
    {
        "brand": "Basic-Fit",
        "official_website": "https://www.basic-fit.com/",
        "locator_url": "n/a",
        "claimed_at_clubs": "0",
        "source_type": "n/a",
        "scrape_feasibility": "n/a",
        "coordinate_quality": "n/a",
        "phase1_status": "EXCLUDE",
    },
]


def main():
    all_rows: list[dict] = []
    extractors = [
        discover_magicline,
        discover_fitinn,
        discover_clever_fit,
        discover_happyfit,
        discover_injoy,
        discover_mrssporty,
        discover_mygym,
        discover_speedfit,
        discover_fitfabrik,
        discover_john_harris,
    ]
    by_chain: dict[str, list[dict]] = {}
    for fn in extractors:
        try:
            rows = fn()
        except Exception as e:
            print(f"FAILED {fn.__name__}: {e}")
            rows = []
        brand = rows[0]["brand"] if rows else fn.__name__.replace("discover_", "").replace("_", " ")
        by_chain[brand] = rows
        all_rows.extend(rows)

    # Update inventory discovered counts
    inventory = []
    for item in CHAIN_INVENTORY:
        brand = item["brand"]
        discovered = len(by_chain.get(brand, []))
        if brand == "McFIT":
            discovered = len([r for r in all_rows if r["brand"] == "McFIT"])
        elif brand == "JOHN REED":
            discovered = len([r for r in all_rows if r["brand"] == "JOHN REED"])
        elif brand == "Gold's Gym":
            discovered = len([r for r in all_rows if r["brand"] == "Gold's Gym"])
        else:
            discovered = len([r for r in all_rows if r["brand"] == brand])
        inventory.append({**item, "discovered": discovered})

    SCRAPES.joinpath("austria_chain_inventory.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    OUT.joinpath("austria_phase1_candidates.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\n=== DISCOVERY SUMMARY ===")
    print("Total candidates:", len(all_rows))
    print("By brand:", dict(Counter(r["brand"] for r in all_rows).most_common()))


if __name__ == "__main__":
    main()
