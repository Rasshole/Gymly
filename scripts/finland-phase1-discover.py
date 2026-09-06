#!/usr/bin/env python3
"""
Finland Phase 1 discovery — official chain locators and club pages only.

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
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/finland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, PAGES, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
}
PRINT_LOCK = Lock()

FI_CITIES = {
    "helsinki", "espoo", "vantaa", "tampere", "turku", "oulu", "jyväskylä", "jyvaskyla",
    "kuopio", "lahti", "pori", "kouvola", "joensuu", "lappeenranta", "hämeenlinna",
    "hameenlinna", "vaasa", "rovaniemi", "seinäjoki", "seinajoki", "mikkeli", "kotka",
    "salo", "porvoo", "kokkola", "hyvinkää", "hyvinkaa", "lohja", "nurmijärvi", "nurmijarvi",
    "järvenpää", "jarvenpaa", "rauma", "kajaani", "tuusula", "kirkkonummi", "kerava",
    "nokia", "kaarina", "ylöjärvi", "ylojarvi", "kangasala", "riihimäki", "riihimaki",
    "imatra", "savonlinna", "vihti", "raahe", "raisio", "iisalmi", "tornio", "kemi",
    "hollola", "valkeakoski", "hamina", "pietarsaari", "jakobstad", "lieto", "naantali",
    "pirkkala", "siilinjärvi", "siilinjarvi", "mäntsälä", "mantsala", "forssa", "akaa",
    "sipoo", "sibbo", "kauniainen", "grankulla", "lempäälä", "lempaala", "heinola",
    "kuusamo", "kittilä", "kittila", "sastamala", "ulvila", "harjavalta", "kankaanpää",
    "hanko", "raasepori", "loviisa", "inkoo", "siuntio", "klaukkala", "nurmijärvi",
    "ylivieska", "kalajoki", "lapua", "ilmajoki", "kurikka", "alajärvi", "äänekoski",
    "aanekoski", "jämsä", "jamsa", "janakkala", "hausjärvi", "hausjarvi", "turenki",
    "noormarkku", "pihtipudas", "pornainen", "suolahti", "inkeroinen", "varkaus",
    "haukipudas", "leppävirta", "mariehamn", "maarianhamina", "parainen", "mustasaari",
    "korsholm", "smedsby", "sepänkylä", "orivesi", "parkano", "virrat", "juva",
    "miehikkälä", "kouvola", "iitti", "orimattila", "nastola", "asikkala", "hollola",
}

COMING_RE = re.compile(
    r"\b(avataan|tulossa|tuleva|coming\s*soon|aukeaa|avataan\s+|avajaiset\s+(ma|ti|ke|to|pe|la|su)|uudelleenavajaiset|avataan\s+loppuvuodesta|avataan\s+alkuvuodesta)\b",
    re.I,
)


def log(*a):
    with PRINT_LOCK:
        print(*a, flush=True)


def fetch(url: str, timeout: int = 40) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=UA)
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


def fetch_cached(url: str, dest: Path, timeout: int = 40) -> str:
    if dest.exists() and dest.stat().st_size > 400:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout)
    if code == 200 and text:
        dest.write_text(text, encoding="utf-8")
        return text
    return text if code == 200 else ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("&#xA;", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_tags(s: str) -> str:
    s = re.sub(r"(?i)<br\s*/?>", "\n", s or "")
    s = re.sub(r"(?i)</p>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return unescape(s)


def fi_postal(s: str) -> str:
    m = re.search(r"\b(\d{5})\b", s or "")
    return m.group(1) if m else ""


def looks_mojibake(s: str) -> bool:
    return bool(s and ("Ã" in s or "â€" in s or "ï¿½" in s))


def parse_fi_address_blob(text: str) -> tuple[str, str, str]:
    """Return (street, postal, city) from a Finnish address blob."""
    text = unescape(text)
    text = text.replace("\n", ", ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\bSuomi\b", "", text, flags=re.I)
    text = re.sub(r"\bFinland\b", "", text, flags=re.I)
    m = re.search(
        r"([A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö.\- ]{1,60}?\s+\d+[A-Za-z0-9/\- ]*)[,\s]+(\d{5})\s+([A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\- ]{1,40})",
        text,
    )
    if m:
        street = re.sub(r"\s+", " ", m.group(1)).strip(" ,")
        postal = m.group(2)
        city = m.group(3).strip(" ,")
        city = re.split(r"\s{2,}|,|/", city)[0].strip()
        return street, postal, city
    m2 = re.search(r"(\d{5})\s+([A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\- ]{1,40})", text)
    if m2:
        postal, city = m2.group(1), m2.group(2).strip(" ,")
        before = text[: m2.start()].rstrip(" ,")
        street = before.split(",")[-1].strip() if before else ""
        return street, postal, city
    return "", "", ""


def is_coming(text: str) -> bool:
    t = unescape(text or "")
    if COMING_RE.search(t):
        if re.search(r"\bon avattu\b|\bavattu!\b|\bavattu osoitteeseen\b", t, re.I):
            if not re.search(r"avataan|tulossa|uudelleenavajaiset", t, re.I):
                return False
        return True
    return False


def make_id(brand: str, address: str, postal: str, city: str, source_url: str = "") -> str:
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (source_url or "").strip().lower(),
                "finland",
            ]
        )
    else:
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (address or "").strip().lower(),
                (postal or "").strip().lower(),
                (city or "").strip().lower(),
                "finland",
            ]
        )
    return "fi_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def row(
    brand: str,
    name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    opening_hours=None,
    legacy_brand=None,
    notes="",
    coming=False,
    website=None,
    coord_source=None,
    format_note=None,
) -> dict:
    postal = fi_postal(postal) or (str(postal).zfill(5) if str(postal).isdigit() and len(str(postal)) <= 5 else (postal or ""))
    if postal and postal.isdigit() and len(postal) < 5:
        postal = postal.zfill(5)
    city = unescape(city)
    address = unescape(address)
    name = unescape(name)
    if city.lower().endswith(" info"):
        city = city[: -5].strip()
    rid = make_id(brand, address, postal, city, source_url)
    status = "COMING_SOON" if coming else "VERIFIED_CURRENT"
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": address,
        "postal_code": postal or None,
        "city": city,
        "country": "Finland",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "legacy_brand": legacy_brand,
        "notes": notes,
        "is_active": not coming,
        "import_category": "COMING_SOON" if coming else None,
        "phase": "finland_phase1",
        "coord_source": coord_source,
        "format": format_note,
        "encoding_flag": looks_mojibake(" ".join(filter(None, [name, address, city]))),
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


def parse_latlng(s: str):
    if not s:
        return None, None
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", s.strip())
    if not m:
        return None, None
    lat, lng = float(m.group(1)), float(m.group(2))
    if abs(lat) > 90 or abs(lng) > 180:
        return None, None
    return lat, lng


def extract_hours(text: str) -> str | None:
    t = unescape(text)
    m = re.search(r"(Avoinna[^\n.]{0,80}|aukioloajat[^\n.]{0,80}|24\s*/\s*7|klo\s*\d+[–\-]\d+)", t, re.I)
    if m:
        return m.group(1).strip()[:120]
    return None


def json_ld_addresses(html: str) -> list[dict]:
    out = []
    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
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
                out.append(
                    {
                        "street": addr.get("streetAddress") or "",
                        "postal": str(addr.get("postalCode") or ""),
                        "city": addr.get("addressLocality") or "",
                        "lat": geo.get("latitude") if isinstance(geo, dict) else None,
                        "lng": geo.get("longitude") if isinstance(geo, dict) else None,
                    }
                )
    return out


def parse_page_address(html: str) -> tuple[str, str, str, object, object]:
    for ld in json_ld_addresses(html):
        street, postal, city = ld["street"], fi_postal(str(ld["postal"])), ld["city"]
        if postal and (street or city):
            lat, lng = ld.get("lat"), ld.get("lng")
            try:
                lat = float(lat) if lat not in (None, "") else None
                lng = float(lng) if lng not in (None, "") else None
            except (TypeError, ValueError):
                lat = lng = None
            return unescape(street), postal, unescape(city), lat, lng
    text = strip_tags(html)
    street, postal, city = parse_fi_address_blob(text)
    return street, postal, city, None, None


# ---------------------------------------------------------------------------
# Chain parsers
# ---------------------------------------------------------------------------

def discover_elixia() -> list[dict]:
    data = json.loads((RAW / "elixia_embedded.json").read_text(encoding="utf-8"))
    clubs = data.get("clubs") or data if isinstance(data, dict) else data
    rows = []
    for c in clubs:
        addr = c.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        area = unescape(addr.get("area") or "")
        postal = fi_postal(area)
        city = area.replace(postal, "").strip(" ,") if postal else area
        loc = c.get("location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        href = (c.get("link") or {}).get("href") or ""
        url = urllib.parse.urljoin("https://www.elixia.fi", href)
        name = f"ELIXIA {unescape(c.get('name') or city)}"
        coming = is_coming(name + " " + json.dumps(c, ensure_ascii=False))
        rows.append(
            row(
                "ELIXIA",
                name,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                legacy_brand="SATS",
                notes="official_embedded_json; operator SATS Finland Oy; current consumer brand ELIXIA",
                coming=coming,
                website="https://www.elixia.fi",
                coord_source="official_locator" if lat is not None else None,
            )
        )
    dump("elixia_finland", rows)
    return rows


def discover_f24s() -> list[dict]:
    html = (RAW / "f24s_locator.html").read_text(encoding="utf-8")
    m = re.search(r"var gymData = (\[.*?\]);", html)
    if not m:
        raise SystemExit("F24S gymData JSON not found")
    data = json.loads(m.group(1))
    (RAW / "f24s_gymdata.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = []
    for g in data:
        if g.get("market") != "fi":
            continue
        name = unescape(g.get("name") or "")
        blob = unescape(g.get("address") or "")
        street, postal, city = parse_fi_address_blob(blob)
        if not city:
            city = name.split()[0] if name else ""
        lat, lng = parse_latlng(g.get("location") or "")
        coming = bool(g.get("status"))
        slug = (g.get("id") or name).lower()
        slug = re.sub(r"[^a-z0-9\-]+", "-", slug)
        url = f"https://fi.fitness24seven.com/fi/kuntokeskuksemme/etsi-salisi/{slug}/"
        rows.append(
            row(
                "Fitness24Seven",
                f"Fitness24Seven {name}",
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                opening_hours="24/7",
                notes="official_gymData_market=fi",
                coming=coming,
                website="https://fi.fitness24seven.com",
                coord_source="official_locator" if lat is not None else None,
            )
        )
    dump("fitness24seven_finland", rows)
    return rows


def sitemap_locs(path: Path) -> list[str]:
    xml = path.read_text(encoding="utf-8", errors="replace")
    return re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml)


def fetch_many(jobs: list[tuple[str, Path]], workers: int = 8) -> dict[str, str]:
    out = {}

    def one(url, dest):
        html = fetch_cached(url, dest)
        return url, html

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(one, u, d) for u, d in jobs]
        for i, fut in enumerate(as_completed(futs), 1):
            url, html = fut.result()
            out[url] = html
            if i % 20 == 0:
                log(f"    fetched {i}/{len(jobs)}")
    return out


def discover_liikku() -> list[dict]:
    gyms = json.loads((RAW / "liikku_gyms.json").read_text(encoding="utf-8"))
    jobs = []
    meta = []
    for g in gyms:
        title = unescape(g.get("title", {}).get("rendered") or "")
        link = g.get("link") or g.get("yoast_head_json", {}).get("canonical") or ""
        desc = (g.get("yoast_head_json") or {}).get("description") or ""
        slug = g.get("slug") or ""
        dest = PAGES / "liikku" / f"{slug or hashlib.md5(link.encode()).hexdigest()[:10]}.html"
        coming = is_coming(title + " " + desc)
        jobs.append((link, dest))
        meta.append((title, link, desc, coming, slug))
    pages = fetch_many(jobs)
    rows = []
    for title, link, desc, coming, slug in meta:
        html = pages.get(link) or ""
        street, postal, city, lat, lng = parse_page_address(html)
        if not street:
            m = re.search(r"osoitteeseen\s+([^!.]+)", desc, re.I)
            if m:
                street, postal2, city2 = parse_fi_address_blob(m.group(1) + " " + title)
                street = street or unescape(m.group(1)).strip()
                postal = postal or postal2
                city = city or city2
        if not city:
            # title: Liikku Helsinki Töölö
            bits = title.replace("Liikku ", "").split()
            if bits and bits[0].lower() in FI_CITIES:
                city = bits[0]
        hours = extract_hours(strip_tags(html))
        rows.append(
            row(
                "Liikku",
                title if title.startswith("Liikku") else f"Liikku {title}",
                street,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                opening_hours=hours,
                notes="official_wp_gym_cpt",
                coming=coming,
                website="https://www.liikku.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("liikku_finland", rows)
    return rows


def discover_fressi() -> list[dict]:
    locs = sitemap_locs(RAW / "fressi_page_sitemap.xml")
    skip = {
        "https://www.fressi.fi/toimipisteet/",
        "https://www.fressi.fi/toimipisteet/kuntosali-helsinki/",
        "https://www.fressi.fi/toimipisteet/kuntosali-espoo/",
        "https://www.fressi.fi/toimipisteet/kuntosali-oulu/",
        "https://www.fressi.fi/toimipisteet/kuntosali-kuopio/",
        "https://www.fressi.fi/toimipisteet/kuntosali-lahti/",
    }
    urls = []
    for u in locs:
        u = u.strip()
        if "/toimipisteet/" not in u:
            continue
        if u.rstrip("/") in {s.rstrip("/") for s in skip}:
            continue
        urls.append(u)
    jobs = []
    for u in urls:
        slug = u.replace("https://www.fressi.fi/toimipisteet/", "").strip("/").replace("/", "__")
        jobs.append((u, PAGES / "fressi" / f"{slug or 'index'}.html"))
    pages = fetch_many(jobs)
    rows = []
    for u, dest in jobs:
        html = pages.get(u) or ""
        if not html:
            continue
        title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
        title = unescape(title_m.group(1) if title_m else "")
        title = re.split(r"\s+[–\-]\s+", title)[0].strip()
        if re.search(r"kuntosalit\s+\w+ssa|kaikki toimipisteet", title, re.I):
            continue
        coming = is_coming(title + " " + strip_tags(html)[:1500])
        street, postal, city, lat, lng = parse_page_address(html)
        if not street or not postal:
            # Fressi often: Annankatu 33, 00100 Helsinki in an h4
            blob = strip_tags(html)
            street, postal, city = parse_fi_address_blob(blob)
        fmt = None
        low = (title + html[:2000]).lower()
        if "24 h" in low or "24h" in low:
            fmt = "Fressi 24h"
        elif "hyvinvointikeskus" in low:
            fmt = "Fressi Hyvinvointikeskus"
        hours = extract_hours(strip_tags(html)[:4000])
        name = title if title.lower().startswith("fressi") else f"Fressi {title}"
        if not postal and not street:
            continue
        rows.append(
            row(
                "Fressi",
                name,
                street,
                postal,
                city,
                u,
                lat=lat,
                lng=lng,
                opening_hours=hours,
                notes="official_club_page",
                coming=coming,
                website="https://www.fressi.fi",
                coord_source="official_json_ld" if lat is not None else None,
                format_note=fmt,
            )
        )
    dump("fressi_finland", rows)
    return rows


def discover_easyfit() -> list[dict]:
    loc_xml = (RAW / "easyfit_gym_location.xml").read_text(encoding="utf-8")
    slugs = re.findall(r"easyfit_gym_location=([a-z0-9\-]+)", loc_xml)
    pages_json = json.loads((RAW / "easyfit_pages.json").read_text(encoding="utf-8"))
    page_slugs = {
        p["slug"]: p
        for p in pages_json
        if p.get("slug")
        and re.search(
            r"helsinki-|espoo-|vantaa-|vaasa-|ideapark|smedsby|jarvenpaa|joensuu|kajaani|kemi|kerava|klaukkala|kotka|kouvola|nokia|porvoo|raisio|rovaniemi|savonlinna|seinajoki",
            p["slug"],
        )
    }
    urls = []
    for s in slugs:
        urls.append((s, f"https://www.easyfit.fi/{s}/"))
    for s, p in page_slugs.items():
        if s not in slugs:
            urls.append((s, p.get("link") or f"https://www.easyfit.fi/{s}/"))
    jobs = [(u, PAGES / "easyfit" / f"{slug}.html") for slug, u in urls]
    fetched = fetch_many(jobs)
    rows = []
    for slug, u in urls:
        html = fetched.get(u) or ""
        if not html:
            continue
        title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
        title = unescape(title_m.group(1) if title_m else slug)
        title = re.split(r"\s+[–\-]\s+EasyFit", title)[0].strip()
        street, postal, city, lat, lng = parse_page_address(html)
        if not postal:
            blob = strip_tags(html)
            m = re.search(r"Yhteystiedot(.{0,400})", blob, re.I | re.S)
            street, postal, city = parse_fi_address_blob(m.group(1) if m else blob)
        hours = extract_hours(strip_tags(html)[:3000])
        coming = is_coming(title + " " + strip_tags(html)[:1200])
        name = f"EasyFit {title}" if not title.lower().startswith("easyfit") else title
        rows.append(
            row(
                "EasyFit",
                name,
                street,
                postal,
                city,
                u,
                lat=lat,
                lng=lng,
                opening_hours=hours,
                notes="official_club_page; Finnish EasyFit not DE EasyFitness",
                coming=coming,
                website="https://www.easyfit.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("easyfit_finland", rows)
    return rows


def discover_forever() -> list[dict]:
    locs = sitemap_locs(RAW / "forever_toimipisteet_sm.xml")
    hubs = {"lite", "267033-2", "espoo", "vantaa", "helsinki", "vaasa"}
    urls = []
    for u in locs:
        tail = u.rstrip("/").split("/toimipisteet/")[-1]
        parts = [p for p in tail.split("/") if p]
        if not parts or parts[0] in hubs and len(parts) == 1:
            continue
        urls.append(u)
    jobs = []
    for u in urls:
        slug = u.rstrip("/").split("/toimipisteet/")[-1].replace("/", "__")
        jobs.append((u, PAGES / "forever" / f"{slug}.html"))
    pages = fetch_many(jobs)
    rows = []
    for u, dest in jobs:
        html = pages.get(u) or ""
        if not html:
            continue
        title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
        title = unescape(title_m.group(1) if title_m else "")
        title = re.split(r"\s+[–\-|]\s+", title)[0].strip()
        street, postal, city, lat, lng = parse_page_address(html)
        coming = is_coming(title + " " + strip_tags(html)[:1200])
        lite = "lite" in u.lower() or "lite" in title.lower()
        name = title if "forever" in title.lower() else f"Forever {title}"
        rows.append(
            row(
                "Forever",
                name,
                street,
                postal,
                city,
                u,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(html)[:2500]),
                notes="official_club_page; Forever LITE" if lite else "official_club_page",
                coming=coming,
                website="https://www.foreverclub.fi",
                coord_source="official_json_ld" if lat is not None else None,
                format_note="Forever LITE" if lite else "Forever Premium",
            )
        )
    dump("forever_finland", rows)
    return rows


def discover_olefit() -> list[dict]:
    html = (RAW / "olefit_etusivu.html").read_text(encoding="utf-8")
    urls = sorted(
        {
            u.rstrip("/")
            for u in re.findall(r"https://www\.ole\.fit/kuntokeskukset/[^\"\s>]+", html)
            if u.rstrip("/") != "https://www.ole.fit/kuntokeskukset"
        }
    )
    jobs = []
    for u in urls:
        slug = u.replace("https://www.ole.fit/kuntokeskukset/", "").replace("/", "__")
        jobs.append((u, PAGES / "olefit" / f"{slug}.html"))
    pages = fetch_many(jobs)
    rows = []
    for u, dest in jobs:
        page = pages.get(u) or ""
        if not page:
            continue
        title_m = re.search(r"<title>([^<]+)</title>", page, re.I)
        title = unescape(title_m.group(1) if title_m else "")
        title = re.split(r"\s+[|–\-]\s+", title)[0].strip()
        street, postal, city, lat, lng = parse_page_address(page)
        coming = is_coming(title + " " + strip_tags(page)[:1800])
        # Kalasatama fire delay
        if "kalasatama" in u and re.search(r"tulipalo|siirty", page, re.I):
            coming = True
        name = title if title.lower().startswith("ole") else f"Ole.Fit {title}"
        rows.append(
            row(
                "Ole.Fit",
                name,
                street,
                postal,
                city,
                u,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(page)[:2500]),
                notes="official_club_page",
                coming=coming,
                website="https://www.ole.fit",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("olefit_finland", rows)
    return rows


def discover_gogo_express() -> list[dict]:
    html = (RAW / "gogoexpress.html").read_text(encoding="utf-8")
    cards = re.findall(
        r'<a class="gx-card([^"]*)"\s+data-haku="([^"]*)"\s+href="([^"]+)">(.*?)</a>',
        html,
        re.S,
    )
    jobs = []
    meta = []
    for cls, haku, href, inner in cards:
        city = unescape((re.search(r'gx-city">([^<]+)', inner) or type("x", (), {"group": lambda *_: ""})()).group(1))
        locname = unescape((re.search(r'gx-name">([^<]+)', inner) or type("x", (), {"group": lambda *_: ""})()).group(1))
        anytime = "anytime" in cls.lower()
        coming = bool(re.search(r"tulossa|2027|2026", inner, re.I)) or "roihupelto" in href
        slug = urllib.parse.urlparse(href).path.strip("/").replace("/", "__") or "home"
        jobs.append((href, PAGES / "gogoexpress" / f"{slug}.html"))
        meta.append((href, city, locname, anytime, coming))
    pages = fetch_many(jobs)
    rows = []
    for href, city, locname, anytime, coming in meta:
        page = pages.get(href) or ""
        street, postal, city2, lat, lng = parse_page_address(page)
        city = city2 or city
        if anytime:
            brand = "GOGO Express"
            legacy = "GYM Anytime"
            name = f"GOGO Express {city} {locname}".strip()
            notes = "listed on gogoexpress.fi with Anytime card class; current consumer brand GOGO Express; legacy GYM Anytime"
        else:
            brand = "GOGO Express"
            legacy = None
            name = f"GOGO Express {city} {locname}".strip()
            notes = "official_gogoexpress_card"
        if re.search(r"tulossa|keväällä 2027|kevaalla 2027", strip_tags(page)[:1500], re.I):
            coming = True
        rows.append(
            row(
                brand,
                name,
                street,
                postal,
                city,
                href,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(page)[:2500]),
                legacy_brand=legacy,
                notes=notes,
                coming=coming,
                website="https://gogoexpress.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("gogo_express_finland", rows)
    return rows


def discover_gogo_full() -> list[dict]:
    url = "https://gogo.fi/kuntosali-tampere/"
    html = fetch_cached(url, PAGES / "gogo" / "kuntosali-tampere.html")
    # Known full-service clubs from official Tampere page
    blob = strip_tags(html)
    rows = []
    # Try structured blocks
    clubs = [
        ("GOGO Park", r"Park.{0,200}?(\d{5})"),
        ("GOGO City", r"City.{0,200}?(\d{5})"),
        ("GOGO Hervanta", r"Hervanta.{0,200}?(\d{5})"),
    ]
    found = parse_multiple_gogo(html)
    if found:
        for name, street, postal, city, hours in found:
            rows.append(
                row(
                    "GOGO",
                    name,
                    street,
                    postal,
                    city,
                    url,
                    opening_hours=hours,
                    notes="official_gogo_fi_full_service",
                    website="https://gogo.fi",
                )
            )
    dump("gogo_finland", rows)
    return rows


def parse_multiple_gogo(html: str) -> list[tuple]:
    text = strip_tags(html)
    out = []
    for name in ("GOGO Park", "GOGO Hervanta", "GOGO City"):
        idx = text.find(name)
        if idx < 0:
            # try without GOGO prefix
            idx = text.lower().find(name.split()[-1].lower())
        chunk = text[idx : idx + 400] if idx >= 0 else ""
        street, postal, city = parse_fi_address_blob(chunk)
        hours = extract_hours(chunk)
        if postal or street:
            out.append((name, street, postal, city or "Tampere", hours))
    return out


def discover_gym_anytime() -> list[dict]:
    home = (RAW / "gymanytime.html").read_text(encoding="utf-8")
    urls = sorted(set(re.findall(r"https://gymanytime\.fi/[^\"'#\s]+", home)))
    club_urls = [
        u
        for u in urls
        if re.search(r"kurikka|rauma|tampere|valkeakoski|varkaus", u, re.I)
        and not re.search(r"/wp-|/feed|uploads", u)
    ]
    # unique path roots
    cleaned = []
    seen = set()
    for u in club_urls:
        p = urllib.parse.urlparse(u)
        key = p.scheme + "://" + p.netloc + p.path.rstrip("/") + "/"
        if key not in seen and p.path not in ("", "/"):
            seen.add(key)
            cleaned.append(key)
    if not cleaned:
        cleaned = [
            "https://gymanytime.fi/kuntosali-kurikka/",
            "https://gymanytime.fi/kuntosali-rauma/",
            "https://gymanytime.fi/kuntosali-tampere/",
            "https://gymanytime.fi/kuntosali-valkeakoski/",
            "https://gymanytime.fi/kuntosali-varkaus/",
        ]
    jobs = []
    for u in cleaned:
        slug = urllib.parse.urlparse(u).path.strip("/").replace("/", "__") or "home"
        jobs.append((u, PAGES / "gymanytime" / f"{slug}.html"))
    pages = fetch_many(jobs)
    rows = []
    for u, dest in jobs:
        html = pages.get(u) or fetch_cached(u, dest)
        street, postal, city, lat, lng = parse_page_address(html)
        title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
        title = unescape(title_m.group(1) if title_m else "GYM Anytime")
        city = city or unescape(re.sub(r".*", "", title))
        name = f"GYM Anytime {city}".strip() if city else unescape(title.split("–")[0])
        rows.append(
            row(
                "GYM Anytime",
                name,
                street,
                postal,
                city,
                u,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(html)[:2000]) or "24/7",
                notes="current consumer brand GYM Anytime; GOGO Express rebrand planned early 2027 — not yet rebranded",
                website="https://gymanytime.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("gym_anytime_finland", rows)
    return rows


def discover_ladyline() -> list[dict]:
    clubs = json.loads((RAW / "ladyline_toimipiste.json").read_text(encoding="utf-8"))
    jobs = []
    meta = []
    for c in clubs:
        link = c.get("link")
        slug = c.get("slug") or ""
        title = unescape(c.get("title", {}).get("rendered") or slug)
        if not link:
            continue
        jobs.append((link, PAGES / "ladyline" / f"{slug}.html"))
        meta.append((link, title))
    pages = fetch_many(jobs)
    rows = []
    for link, title in meta:
        html = pages.get(link) or ""
        street, postal, city, lat, lng = parse_page_address(html)
        coming = is_coming(title + " " + strip_tags(html)[:1200])
        name = f"LadyLine {unescape(title)}"
        rows.append(
            row(
                "LadyLine",
                name,
                street,
                postal,
                city or unescape(title.split("–")[0]),
                link,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(html)[:2000]),
                notes="official_wp_toimipiste; women's club with conventional gym floor",
                coming=coming,
                website="https://ladyline.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("ladyline_finland", rows)
    return rows


def discover_ptvgym() -> list[dict]:
    urls = [
        "https://ptvgym.fi/kuntosalit/espoo",
        "https://ptvgym.fi/kuntosalit/helsinki-pitajanmaki",
        "https://ptvgym.fi/kuntosalit/helsinki-roihupelto",
        "https://ptvgym.fi/kuntosalit/joensuu",
        "https://ptvgym.fi/kuntosalit/jyvaskyla",
        "https://ptvgym.fi/kuntosalit/kouvola",
        "https://ptvgym.fi/kuntosalit/kuopio",
        "https://ptvgym.fi/kuntosalit/lahti",
        "https://ptvgym.fi/kuntosalit/lappeenranta",
        "https://ptvgym.fi/kuntosalit/oulu",
        "https://ptvgym.fi/kuntosalit/porvoo",
        "https://ptvgym.fi/kuntosalit/seinajoki",
        "https://ptvgym.fi/kuntosalit/tampere",
        "https://ptvgym.fi/kuntosalit/turku",
        "https://ptvgym.fi/kuntosalit/vantaa",
    ]
    jobs = [(u, PAGES / "ptvgym" / (u.rstrip("/").split("/")[-1] + ".html")) for u in urls]
    pages = fetch_many(jobs)
    rows = []
    for u, dest in jobs:
        html = pages.get(u) or ""
        street, postal, city, lat, lng = parse_page_address(html)
        title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
        title = unescape(title_m.group(1) if title_m else u)
        loc = u.rstrip("/").split("/")[-1].replace("-", " ").title()
        name = f"PTVGYM {city or loc}"
        rows.append(
            row(
                "PTVGYM",
                name,
                street,
                postal,
                city or loc,
                u,
                lat=lat,
                lng=lng,
                opening_hours=extract_hours(strip_tags(html)[:2000]) or "24/7",
                notes="official_club_page; 15 clubs listed on ptvgym.fi",
                website="https://ptvgym.fi",
                coord_source="official_json_ld" if lat is not None else None,
            )
        )
    dump("ptvgym_finland", rows)
    return rows


def main():
    t0 = time.time()
    all_rows = []
    log("ELIXIA")
    all_rows += discover_elixia()
    log("Fitness24Seven")
    all_rows += discover_f24s()
    log("Liikku")
    all_rows += discover_liikku()
    log("Fressi")
    all_rows += discover_fressi()
    log("EasyFit")
    all_rows += discover_easyfit()
    log("Forever")
    all_rows += discover_forever()
    log("Ole.Fit")
    all_rows += discover_olefit()
    log("GOGO Express")
    all_rows += discover_gogo_express()
    log("GOGO full-service")
    all_rows += discover_gogo_full()
    log("GYM Anytime")
    all_rows += discover_gym_anytime()
    log("LadyLine")
    all_rows += discover_ladyline()
    log("PTVGYM")
    all_rows += discover_ptvgym()

    combined = OUT / "finland_discovery_combined.json"
    combined.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    by_brand = {}
    for r in all_rows:
        by_brand[r["brand"]] = by_brand.get(r["brand"], 0) + 1
    log("DISCOVERY DONE", len(all_rows), "in", round(time.time() - t0), "s")
    for k, v in sorted(by_brand.items()):
        log(f"  {k}: {v}")


if __name__ == "__main__":
    main()
