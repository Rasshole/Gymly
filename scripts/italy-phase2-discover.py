#!/usr/bin/env python3
"""
Italy Phase 2 discovery — recover Phase 1 gaps + Anytime Fitness + Orange +
regional Icon Palestre. Does NOT modify centers.json. No invented centroids.
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
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
RAW = OUT / "raw"
PHASE2 = RAW / "phase2"
PAGES = PHASE2 / "pages"
SCRAPES = OUT / "scrapes"
for p in (OUT, RAW, PHASE2, PAGES, SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}
TODAY = date.today()

IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)

STREET_TOKEN = (
    r"(?:Via|Viale|C\.?so|Corso|P\.?zza|Piazza|Piazzale|Largo|Vicolo|Vico|"
    r"Strada|Stradale|Contrada|Localit[aà]|Lungomare|Lungobisagno|"
    r"Circonvallazione|Traversa|Galleria|Rotonda|Salita|Discesa|"
    r"SS|S\.S\.|SP|S\.P\.|SR|S\.R\.|Via Privata)"
)


def log(*a):
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


def fetch_cached(url: str, dest: Path, timeout: int = 45, force: bool = False, headers: dict | None = None) -> str:
    if not force and dest.exists() and dest.stat().st_size > 300:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout, headers=headers)
    if code == 200 and text:
        dest.write_text(text, encoding="utf-8")
        return text
    return text if code == 200 else ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def it_postal(s) -> str:
    if s is None:
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


def in_italy_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in (IT_MAINLAND, IT_SICILY, IT_SARDINIA):
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "italy",
        ]
    )
    return "it_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def valid_city(city: str) -> str:
    city = unescape(city or "").strip(" ,.")
    if not city:
        return ""
    if city.isdigit() or it_postal(city) == city:
        return ""
    if len(city) == 2 and city.isupper():
        return ""
    if re.fullmatch(r"\d{5}", city):
        return ""
    # Strip trailing province code e.g. "Corciano PG"
    city = re.sub(r"\s+[A-Z]{2}$", "", city).strip()
    return city


def norm_street(s: str) -> str:
    s = unescape(s or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def parse_it_address_blob(blob: str) -> tuple[str, str, str]:
    blob = unescape(blob)
    postal = it_postal(blob)
    city = ""
    m_city_cap = re.search(
        r",?\s*([A-Za-zÀ-ú'’. -]+?)\s*\(([A-Z]{2})\)\s*-?\s*(\d{5})\s*$",
        blob,
    )
    if m_city_cap:
        city = m_city_cap.group(1).strip(" ,")
        postal = postal or m_city_cap.group(3)
        street = blob[: m_city_cap.start()].strip(" ,")
        return street, postal, valid_city(city)
    m = re.search(
        r"\b(\d{5})\s*,?\s*([A-Za-zÀ-ú'’. -]+?)(?:\s*\(([A-Z]{2})\))?(?:\s*[A-Z]{2})?\s*$",
        blob,
    )
    if m:
        postal = postal or m.group(1)
        city = m.group(2).strip(" ,")
        street = blob[: m.start()].strip(" ,")
        street = re.sub(r",\s*$", "", street)
        return street, postal, valid_city(city)
    m2 = re.search(
        r",\s*(\d{5})\s*,?\s*([A-Za-zÀ-ú'’. -]+?)(?:\s*\(([A-Z]{2})\))?\s*$",
        blob,
    )
    if m2:
        postal = postal or m2.group(1)
        city = m2.group(2).strip(" ,")
        street = blob[: m2.start()].strip(" ,")
        return street, postal, valid_city(city)
    m3 = re.search(r",\s*([A-Za-zÀ-ú'’. -]+?)\s*\(([A-Z]{2})\)\s*$", blob)
    if m3:
        city = m3.group(1).strip()
        street = blob[: m3.start()].strip(" ,")
        return street, postal, valid_city(city)
    m4 = re.search(rf"({STREET_TOKEN}[^,]{{3,80}}),\s*([A-Za-zÀ-ú'’. -]+)$", blob, re.I)
    if m4 and not it_postal(blob):
        return m4.group(1).strip(), postal, valid_city(m4.group(2))
    street = blob
    if postal:
        street = re.split(rf"\b{postal}\b", blob)[0].rstrip(" ,")
    street = re.sub(r",?\s*[A-Za-zÀ-ú'’. -]+\s*\([A-Z]{2}\)\s*-?\s*$", "", street).strip(" ,")
    return street.strip(" ,"), postal, valid_city(city)


def extract_map_pin(html: str) -> tuple[float | None, float | None, str | None]:
    emb = re.search(r"google\.com/maps/embed\?[^\"']*!2d([0-9.\-]+)!3d([0-9.\-]+)", html)
    if emb:
        try:
            lng, lat = float(emb.group(1)), float(emb.group(2))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    dest = re.search(r"destination=([0-9.\-]+),([0-9.\-]+)", html)
    if dest:
        try:
            lat, lng = float(dest.group(1)), float(dest.group(2))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    return None, None, None


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
    notes="",
    coming=False,
    website=None,
    coord_source=None,
    legacy_brand=None,
    closed=False,
    region=None,
    source_type=None,
) -> dict:
    postal = it_postal(postal) or it_postal(address) or ""
    city = valid_city(city)
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
        "city": city,
        "country": "Italy",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming and not closed,
        "import_category": "CLOSED" if closed else ("COMING_SOON" if coming else None),
        "phase": "italy_phase2",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
        "region": region,
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


def parse_json_ld_nodes(html: str) -> list[dict]:
    nodes = []
    for jm in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        try:
            data = json.loads(jm.group(1).strip())
        except Exception:
            continue
        chunk = data if isinstance(data, list) else [data]
        if isinstance(data, dict) and "@graph" in data:
            chunk = data["@graph"]
        for n in chunk:
            if isinstance(n, dict):
                nodes.append(n)
    return nodes


# ---------------------------------------------------------------------------
# FitUP — reparse Elementor club pages (broader street tokens + CAP)
# ---------------------------------------------------------------------------

def discover_fitup() -> list[dict]:
    log("  FitUP Phase 2 reparse...")
    clubs = []
    page = 1
    while page <= 20:
        url = f"https://fitup.it/wp-json/wp/v2/club?per_page=100&page={page}"
        code, body = fetch(url, headers={"Accept": "application/json"})
        if code != 200:
            break
        batch = json.loads(body)
        if not isinstance(batch, list) or not batch:
            break
        clubs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.2)
    (RAW / "fitup_wp_clubs.json").write_text(json.dumps(clubs, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = []
    for c in clubs:
        slug = c.get("slug") or ""
        link = c.get("link") or f"https://fitup.it/club/{slug}/"
        title = unescape((c.get("title") or {}).get("rendered") or slug)
        dest = RAW / "fitup_pages" / f"{slug}.html"
        html = fetch_cached(link, dest)
        time.sleep(0.05)
        street = postal = city = ""
        cleaned = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
        cleaned = re.sub(r"<style[\s\S]*?</style>", "", cleaned, flags=re.I)
        # Prefer Elementor widget containers with street-like text + CAP
        for m in re.finditer(
            r'elementor-widget-container[^>]*>\s*([^<]{8,140})\s*<',
            cleaned,
        ):
            cand = unescape(m.group(1))
            if not re.search(STREET_TOKEN, cand, re.I) and not it_postal(cand):
                continue
            if re.search(r"@|http|tel:|whatsapp|\+\d{5}", cand, re.I):
                continue
            if len(cand) > 120:
                continue
            st, po, ci = parse_it_address_blob(cand)
            if st and (po or ci):
                street, postal, city = st, po or postal, ci or city
                if postal and street:
                    break
        if not street:
            text = unescape(re.sub(r"<[^>]+>", "\n", cleaned))
            for line in text.splitlines():
                line = line.strip()
                if not line or len(line) > 140:
                    continue
                if not re.search(STREET_TOKEN, line, re.I):
                    continue
                st, po, ci = parse_it_address_blob(line)
                if st:
                    street, postal, city = st, po or postal, ci or city
                    if street and (postal or city):
                        break
        lat, lng, coord_source = extract_map_pin(html)
        if not city:
            city = valid_city(title)
        rows.append(
            row(
                "FitUP",
                f"FitUP {title}".strip(),
                street,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                notes=f"fitup_wp_id={c.get('id')}; phase2_reparse",
                website=link,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    dump("fitup_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Fit Express — reparse club-hero addresses
# ---------------------------------------------------------------------------

def discover_fitexpress() -> list[dict]:
    log("  Fit Express Phase 2 reparse...")
    clubs = []
    page = 1
    while page <= 10:
        url = f"https://www.fitexpress.it/wp-json/wp/v2/club?per_page=100&page={page}"
        code, body = fetch(url, headers={"Accept": "application/json"})
        if code != 200:
            break
        batch = json.loads(body)
        if not isinstance(batch, list) or not batch:
            break
        clubs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.2)
    rows = []
    for c in clubs:
        slug = c.get("slug") or ""
        link = c.get("link") or f"https://www.fitexpress.it/club/{slug}/"
        title = unescape((c.get("title") or {}).get("rendered") or slug)
        dest = RAW / "fitexpress_pages" / f"{slug}.html"
        html = fetch_cached(link, dest)
        time.sleep(0.05)
        street = postal = city = ""
        m = re.search(r'class="club-hero__addr"[^>]*>([\s\S]*?)</p>', html)
        if m:
            blob = unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
            street, postal, city = parse_it_address_blob(blob)
            if not city:
                mcity = re.search(r"\b\d{5}\s+([A-Za-zÀ-ú'’. -]+?)(?:\s*\([A-Z]{2}\))?\s*$", blob)
                if mcity:
                    city = valid_city(mcity.group(1))
        # Prefer municipality from CAP line over club nickname titles
        if city and title and city.lower() != title.lower():
            # e.g. title Milano Missaglia but city should be Milano
            if title.lower().startswith(city.lower()) or city.lower() in title.lower():
                pass
            elif re.search(r"milano|roma|torino|napoli|firenze|bologna", title, re.I):
                for tok in ("Milano", "Roma", "Torino", "Napoli", "Firenze", "Bologna"):
                    if tok.lower() in title.lower() and postal:
                        city = tok
                        break
        if not city:
            # strip nickname suffixes from title
            city = valid_city(re.sub(r"\s+(Missaglia|Toselli|Malatesta|Etnaopolis).*$", "", title, flags=re.I))
        lat, lng, coord_source = extract_map_pin(html)
        rows.append(
            row(
                "Fit Express",
                f"Fit Express {title}".strip(),
                street,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                notes=f"fitexpress_wp_id={c.get('id')}; phase2_reparse",
                website=link,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    dump("fitexpress_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# WebFit — map markers (CAP often missing → reverse in consolidate)
# ---------------------------------------------------------------------------

def discover_webfit() -> list[dict]:
    log("  WebFit Phase 2 markers...")
    html = fetch_cached("https://www.webfit.it/palestre/", RAW / "webfit_palestre.html", force=True)
    rows = []
    parts = re.split(r'<div class="marker\b', html)
    for part in parts[1:]:
        lat_m = re.search(r'data-lat="([^"]+)"', part)
        lng_m = re.search(r'data-lng="([^"]+)"', part)
        title_m = re.search(r"<h[1-6][^>]*>([^<]+)", part)
        addr_m = re.search(r"<p[^>]*>([^<]+)</p>", part)
        if not title_m:
            continue
        name = unescape(title_m.group(1))
        addr_blob = unescape(addr_m.group(1)) if addr_m else ""
        street, postal, city = parse_it_address_blob(addr_blob)
        if not city:
            m = re.search(r"-\s*([A-Za-zÀ-ú'’. -]+)\s*\(([A-Z]{2})\)", addr_blob)
            if m:
                city = valid_city(m.group(1))
            street = street or re.sub(r"\s*-\s*[A-Za-zÀ-ú'’. -]+\s*\([A-Z]{2}\)\s*$", "", addr_blob).strip()
            # "..., Genova GE" / "Curtatone"
            m2 = re.search(r"-\s*([A-Za-zÀ-ú'’. -]+)$", addr_blob)
            if not city and m2:
                city = valid_city(re.sub(r"\s+[A-Z]{2}$", "", m2.group(1)))
        try:
            lat = float(lat_m.group(1)) if lat_m else None
            lng = float(lng_m.group(1)) if lng_m else None
        except ValueError:
            lat = lng = None
        if lat is not None and not in_italy_bbox(lat, lng):
            lat = lng = None
        rows.append(
            row(
                "WebFit",
                name if name.lower().startswith("webfit") else f"WebFit {name}",
                street,
                postal,
                city,
                "https://www.webfit.it/palestre/",
                lat=lat,
                lng=lng,
                notes="webfit_map_marker; phase2",
                website="https://www.webfit.it/palestre/",
                coord_source="OFFICIAL_MAP_PIN" if lat is not None else None,
                source_type="official_map_markers",
            )
        )
    dump("webfit_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# 20Hours — OSM data-location + footer CAP
# ---------------------------------------------------------------------------

def discover_20hours() -> list[dict]:
    log("  20Hours Phase 2...")
    html = fetch_cached("https://www.20hours.it/palestre/", RAW / "20hours_palestre.html", force=True)
    hrefs = sorted(set(re.findall(r'href="(/palestre/club-[^"#]+)"', html)))
    rows = []
    for href in hrefs:
        url = "https://www.20hours.it" + href
        slug = href.rstrip("/").split("/")[-1]
        dest = RAW / "20hours_pages" / f"{slug}.html"
        page = fetch_cached(url, dest, force=True)
        time.sleep(0.15)
        name = f"20Hours {slug.replace('club-', '').replace('-', ' ').title()}"
        tm = re.search(r"<h1[^>]*>([^<]+)", page)
        if tm:
            name = unescape(tm.group(1))
            if not name.lower().startswith("20"):
                name = f"20Hours {name}"
        street = postal = city = ""
        lat = lng = None
        coord_source = None
        osm = re.search(r"data-location='(\[[\s\S]*?\])'", page)
        if osm:
            try:
                arr = json.loads(osm.group(1))
                if arr and isinstance(arr[0], dict):
                    blob = arr[0].get("address") or ""
                    lines = [unescape(x) for x in blob.split("\n") if x.strip()]
                    for line in lines:
                        if re.search(STREET_TOKEN, line, re.I):
                            street, postal, city = parse_it_address_blob(line)
                            if not city and "Milano" in line:
                                city = "Milano"
                    if not street and len(lines) >= 2:
                        street = lines[1]
                        city = "Milano" if "milano" in blob.lower() else city
                    try:
                        lat = float(str(arr[0].get("latitude")).strip())
                        lng = float(str(arr[0].get("longitude")).strip())
                        if in_italy_bbox(lat, lng):
                            coord_source = "OFFICIAL_MAP_PIN"
                        else:
                            lat = lng = None
                    except (TypeError, ValueError):
                        lat = lng = None
            except Exception:
                pass
        # Footer CAP only when street matches this club (site footer repeats Brioschi HQ)
        for foot in re.finditer(
            rf"({STREET_TOKEN}[^<\n]{{5,80}})\s*[-–]\s*(\d{{5}})\s*[-–]\s*([A-Za-zÀ-ú'’. -]+)\s*\(([A-Z]{{2}})\)",
            page,
            re.I,
        ):
            foot_street = unescape(foot.group(1)).replace(" n. ", ", ").strip()
            if street and (
                norm_street(street) in norm_street(foot_street)
                or norm_street(foot_street) in norm_street(street)
            ):
                postal = postal or foot.group(2)
                city = city or valid_city(foot.group(3))
                break
        if not city:
            city = "Milano"
        rows.append(
            row(
                "20Hours",
                name,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                notes="20hours_osm_footer; phase2",
                website=url,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    dump("20hours_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Fitness Park RomaEst
# ---------------------------------------------------------------------------

def discover_fitnesspark() -> list[dict]:
    log("  Fitness Park Phase 2...")
    url = "https://www.fitnesspark.it/club/romaest/"
    html = fetch_cached(url, RAW / "fitnesspark_romaest.html", force=True)
    street = "Centro commerciale RomaEst, Via Collatina"
    postal = "00132"
    city = "Roma"
    lat = lng = None
    coord_source = None
    for n in parse_json_ld_nodes(html):
        addr = n.get("address")
        if isinstance(addr, dict):
            street = addr.get("streetAddress") or street
            postal = it_postal(addr.get("postalCode") or "") or postal
            loc = addr.get("addressLocality") or city
            city = valid_city(re.sub(r"\s*RM\s*$", "", loc)) or city
        geo = n.get("geo")
        if isinstance(geo, dict):
            try:
                lat = float(geo.get("latitude"))
                lng = float(geo.get("longitude"))
                if in_italy_bbox(lat, lng):
                    coord_source = "OFFICIAL_COORDINATE"
                else:
                    lat = lng = None
            except (TypeError, ValueError):
                pass
    if lat is None:
        lat, lng, coord_source = extract_map_pin(html)
    rows = [
        row(
            "Fitness Park",
            "Fitness Park RomaEst",
            street,
            postal,
            city,
            url,
            lat=lat,
            lng=lng,
            notes="fitnesspark_italy_first_club; phase2",
            website=url,
            coord_source=coord_source,
            source_type="official_club_page",
        )
    ]
    dump("fitnesspark_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Orange Palestre — list cards already contain full addresses; club pages for pins
# ---------------------------------------------------------------------------

def discover_orange() -> list[dict]:
    log("  Orange Palestre Phase 2...")
    rows = []
    seen = set()
    # Refresh list pages
    for p in (1, 2, 3, 4):
        url = f"https://www.orangepalestreitaliane.it/palestre?p={p}"
        html = fetch_cached(url, PHASE2 / f"orange_palestre_p{p}.html", force=True)
        if not html or "club-card-title" not in html:
            if p > 3:
                break
            continue
        blocks = re.findall(
            r'href="(/palestre/[a-z0-9\-]+)"[\s\S]{0,2500}?club-card-title title-large">([^<]+)[\s\S]{0,1200}?'
            r'club-card-address title-small">[\s\S]{0,200}?<div class="mt-2">([^<]+)</div>',
            html,
        )
        for href, title, addr in blocks:
            slug = href.split("/")[-1]
            if slug in seen:
                continue
            seen.add(slug)
            title = unescape(title)
            street, postal, city = parse_it_address_blob(unescape(addr))
            # Orange format: Via X, N, CAP, City (PR)
            if not postal:
                postal = it_postal(addr)
            if not city:
                m = re.search(r",\s*(\d{5})\s*,\s*([A-Za-zÀ-ú'’. -]+)\s*\(([A-Z]{2})\)", unescape(addr))
                if m:
                    postal = postal or m.group(1)
                    city = valid_city(m.group(2))
                    street = unescape(addr)[: m.start()].strip(" ,")
            src = "https://www.orangepalestreitaliane.it" + href
            club_html = fetch_cached(src, PAGES / "orange" / f"{slug}.html")
            time.sleep(0.15)
            lat = lng = None
            coord_source = None
            if club_html:
                lat, lng, coord_source = extract_map_pin(club_html)
                for n in parse_json_ld_nodes(club_html):
                    geo = n.get("geo")
                    if isinstance(geo, dict):
                        try:
                            la, lo = float(geo.get("latitude")), float(geo.get("longitude"))
                            if in_italy_bbox(la, lo):
                                lat, lng, coord_source = la, lo, "OFFICIAL_COORDINATE"
                        except (TypeError, ValueError):
                            pass
                    addr_n = n.get("address")
                    if isinstance(addr_n, dict) and not street:
                        street = addr_n.get("streetAddress") or street
                        postal = it_postal(addr_n.get("postalCode") or "") or postal
                        city = valid_city(addr_n.get("addressLocality") or "") or city
            legacy = None
            notes = "orange_list_card; phase2"
            if re.search(r"palestre.?italiane|prime|egosistema|getfit", club_html or "", re.I):
                if re.search(r"getfit", club_html or "", re.I):
                    legacy = "GetFIT"
                elif re.search(r"prime", club_html or "", re.I):
                    legacy = "Prime"
                elif re.search(r"palestre.?italiane", club_html or "", re.I):
                    legacy = "Palestre Italiane"
            rows.append(
                row(
                    "Orange",
                    f"Orange {title}".strip(),
                    street,
                    postal,
                    city,
                    src,
                    lat=lat,
                    lng=lng,
                    notes=notes,
                    website=src,
                    coord_source=coord_source,
                    legacy_brand=legacy,
                    source_type="official_list_and_club_page",
                )
            )
        time.sleep(0.25)

    # Palermo landing (group expansion)
    palermo = fetch_cached(
        "https://www.orangepalestreitaliane.it/palermo",
        PHASE2 / "orange_palermo.html",
        force=True,
    )
    if palermo:
        for href, title in re.findall(
            r'href="(/palestre/[a-z0-9\-]+)"[^>]*>[\s\S]{0,400}?club-card-title[^>]*>([^<]+)',
            palermo,
        ):
            slug = href.split("/")[-1]
            if slug in seen:
                continue
            # only add if we can get address from club page
            src = "https://www.orangepalestreitaliane.it" + href
            club_html = fetch_cached(src, PAGES / "orange" / f"{slug}.html", force=True)
            time.sleep(0.15)
            street = postal = city = ""
            for n in parse_json_ld_nodes(club_html or ""):
                addr_n = n.get("address")
                if isinstance(addr_n, dict):
                    street = addr_n.get("streetAddress") or street
                    postal = it_postal(addr_n.get("postalCode") or "") or postal
                    city = valid_city(addr_n.get("addressLocality") or "") or city
            maddr = re.search(
                rf'({STREET_TOKEN}[^<\n]{{5,90}}\d{{5}}[^<\n]{{0,40}})',
                club_html or "",
                re.I,
            )
            if maddr and not street:
                street, postal, city = parse_it_address_blob(unescape(maddr.group(1)))
            lat, lng, coord_source = extract_map_pin(club_html or "")
            if street:
                seen.add(slug)
                rows.append(
                    row(
                        "Orange",
                        f"Orange {unescape(title)}".strip(),
                        street,
                        postal,
                        city or "Palermo",
                        src,
                        lat=lat,
                        lng=lng,
                        notes="orange_palermo_landing; phase2",
                        website=src,
                        coord_source=coord_source,
                        source_type="official_club_page",
                    )
                )

    dump("orange_p2", rows)
    notes = {
        "orange_list_clubs": len(rows),
        "getfit_official_site": "403_forbidden",
        "getfit_note": (
            "Jul 2026: 6 GetFIT Milano clubs acquired by Orange; 2 retained by founders "
            "(Via Piacenza, Via Pinerolo). GetFIT website returns 403 — not staged without "
            "official address pages."
        ),
    }
    (PHASE2 / "orange_discovery_notes.json").write_text(json.dumps(notes, indent=2), encoding="utf-8")
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness Italy — official WP map-locations API (Italy-only)
# ---------------------------------------------------------------------------

def discover_anytime() -> list[dict]:
    log("  Anytime Fitness Italy map-locations API...")
    # Prefer WPEngine host (CloudFront/Incapsula blocks www.anytimefitness.it redirects)
    api = "https://afitaly.wpenginepowered.com/wp-json/anytime/v1/map-locations"
    code, body = fetch(api, headers={"Accept": "application/json"})
    if code != 200:
        log(f"    API failed {code}")
        return []
    data = json.loads(body)
    (PHASE2 / "anytime_map_locations.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = []
    for item in data:
        content = item.get("content") or {}
        if (content.get("country") or "").upper() != "IT":
            continue
        number = (content.get("number") or "").upper()
        if not number.startswith("IT-"):
            continue
        # Reject Rome/Italy centroid bias if ever present as club coord
        try:
            lat = float(item.get("latitude"))
            lng = float(item.get("longitude"))
        except (TypeError, ValueError):
            lat = lng = None
        if lat is not None and not in_italy_bbox(lat, lng):
            lat = lng = None
        # Discard known site-level bias center (Rome centroid in mapGlobalOptions)
        if lat is not None and abs(lat - 41.8719) < 0.0002 and abs(lng - 12.5674) < 0.0002:
            lat = lng = None
        street = unescape(content.get("address") or "")
        if content.get("address2"):
            street = f"{street}, {unescape(content.get('address2'))}".strip(", ")
        postal = it_postal(content.get("zip") or "")
        city = valid_city(content.get("city") or "")
        title = unescape(content.get("title") or city or number)
        name = f"Anytime Fitness {title}".strip()
        status = content.get("status")
        coming = status in (1, 2, "1", "2")
        src = content.get("url") or f"https://www.anytimefitness.it/palestra/{number.lower()}/"
        # Normalize to WPEngine-stable public URL pattern when redirected
        if "anytimefitness.com" in src:
            src = f"https://www.anytimefitness.it/palestra/{number.lower()}/"
        rows.append(
            row(
                "Anytime Fitness",
                name,
                street,
                postal,
                city,
                src,
                lat=lat,
                lng=lng,
                opening_hours="24/7",
                notes=f"anytime_map_locations; number={number}; api_status={status}",
                coming=coming,
                website=src,
                coord_source="OFFICIAL_COORDINATE" if lat is not None else None,
                source_type="official_api",
            )
        )
    dump("anytime_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Icon Palestre — multi-region conventional chain (5+)
# ---------------------------------------------------------------------------

ICON_SKIP = {
    "",
    "promo-del-mese-icon-palestre-tiktok",
    "promo-del-mese-icon-palestre",
    "promo-del-mese-icon-palestre-mail",
    "felicita-la-foresta-di-icon-palestre",
    "lavora-con-noi",
    "privacy-policy",
    "icon-nutrizione",
    "icon-academy",
    "apri-il-tuo-centro-icon-palestre",
    "abbonamento",
}


def _icon_clean_addr_candidate(cand: str) -> str:
    cand = unescape(cand)
    cand = re.sub(r"<[^>]+>", " ", cand)
    cand = re.sub(r"\s+", " ", cand).strip()
    low = cand.lower()
    if any(
        bad in low
        for bad in (
            "elementor",
            "gradient",
            "menu-item",
            "background",
            "linear-gradient",
            "{",
            "}",
            "http",
            "wp-content",
        )
    ):
        return ""
    # Strip trailing email / phone / marketing
    cand = re.split(r"\s+[a-z0-9._%+-]+@iconpalestre\.it", cand, flags=re.I)[0]
    cand = re.split(r"\s+(?:Sala|Corsi|Tel|Phone|06|02)\b", cand, flags=re.I)[0]
    return cand.strip(" ,;")


def discover_icon() -> list[dict]:
    log("  Icon Palestre Phase 2...")
    sm = fetch_cached(
        "https://www.iconpalestre.it/page-sitemap.xml",
        PHASE2 / "icon_page_sitemap.xml",
        force=True,
    )
    locs = re.findall(r"<loc>(https://www\.iconpalestre\.it/[^<]+)</loc>", sm or "")
    rows = []
    for url in locs:
        slug = url.rstrip("/").split("/")[-1]
        if slug in ICON_SKIP or url.rstrip("/").endswith("iconpalestre.it"):
            continue
        dest = PAGES / "icon" / f"{slug}.html"
        html = fetch_cached(url, dest)
        time.sleep(0.05)
        if not html or len(html) < 1000:
            continue
        street = postal = city = ""
        candidates = []
        # Prefer address immediately before club email
        for m in re.finditer(
            rf"({STREET_TOKEN}[^@<>]{{5,90}}?\d{{5}}[^@<>]{{0,40}})\s*[a-z0-9._%+-]+@iconpalestre\.it",
            html,
            re.I,
        ):
            cand = _icon_clean_addr_candidate(m.group(1))
            if cand:
                candidates.append(cand)
        # Fallback: clean street+CAP lines in HTML text
        if not candidates:
            cleaned = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
            cleaned = re.sub(r"<style[\s\S]*?</style>", "", cleaned, flags=re.I)
            for m in re.finditer(
                rf"({STREET_TOKEN}[^<>]{{5,80}}?\d{{5}}\s+[A-Za-zÀ-ú'’. -]+(?:\s*\([A-Z]{{2}}\))?)",
                cleaned,
                re.I,
            ):
                cand = _icon_clean_addr_candidate(m.group(1))
                if cand and len(cand) < 100:
                    candidates.append(cand)
        for cand in candidates:
            st, po, ci = parse_it_address_blob(cand)
            if st and po and not re.search(r"elementor|gradient|menu-item", st, re.I):
                street, postal, city = st, po, ci
                break
        # Strip province codes / leaked email local-parts from city
        if city:
            city = re.sub(r"\s+[A-Z]{2}\b.*$", "", city).strip()
            city = re.sub(r"\s+[a-z0-9]{3,}$", "", city).strip()
            city = valid_city(city)
        title = ""
        tm = re.search(r"<title>([^<]+)", html)
        if tm:
            title = unescape(tm.group(1)).split(" - ")[0].strip()
        if not title:
            title = f"Icon Palestre {slug.replace('-', ' ').title()}"
        if not title.lower().startswith("icon"):
            title = f"Icon Palestre {title}"
        if not city:
            city = valid_city(re.sub(r"^ICON\s+Palestre\s+", "", title, flags=re.I).split(",")[0])
        city = valid_city(re.sub(r"\s+[A-Z]{2}$", "", city or ""))
        # Title city often cleaner than leaked parse (e.g. Roma Tiburtina page)
        title_city = valid_city(re.sub(r"^ICON\s+Palestre\s+", "", title, flags=re.I))
        if title_city and (not city or city.lower() in title_city.lower() or title_city.lower().startswith(city.lower())):
            # Prefer municipality token from CAP parse when title is multi-word neighborhood
            if city and len(city) >= 3:
                pass
            else:
                city = title_city.split()[0] if title_city else city
        lat, lng, coord_source = extract_map_pin(html)
        if not street or not postal:
            continue
        # Final city cleanup
        city = valid_city(re.sub(r"\s+\d+$", "", city or ""))
        if not city:
            continue
        rows.append(
            row(
                "Icon Palestre",
                title,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                notes="icon_club_page; phase2",
                website=url,
                coord_source=coord_source,
                source_type="official_club_page",
            )
        )
    dump("icon_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# FitActive CAP recovery for the 2 missing-CAP rows (official coords kept)
# ---------------------------------------------------------------------------

def discover_fitactive_cap_fix() -> list[dict]:
    log("  FitActive CAP patch candidates from staging...")
    staging = OUT / "italy_centers_staging.json"
    if not staging.exists():
        return []
    rows_in = json.loads(staging.read_text(encoding="utf-8"))
    out = []
    for r in rows_in:
        if r.get("brand") != "FitActive":
            continue
        if r.get("import_category") != "NEEDS_REVIEW":
            continue
        if it_postal(r.get("postal_code") or ""):
            continue
        # Keep official coords; CAP filled later via reverse or address parse
        addr = r.get("address") or ""
        postal = it_postal(addr)
        city = valid_city(r.get("city") or "")
        street = addr
        if postal:
            street = re.split(rf"\b{postal}\b", addr)[0].rstrip(" ,")
        # Strip trailing "City (PR)"
        street = re.sub(r",?\s*[A-Za-zÀ-ú'’. -]+\s*\(\s*[A-Z]{2}\s*\)\s*$", "", street).strip(" ,")
        out.append(
            row(
                "FitActive",
                r.get("name") or "FitActive",
                street,
                postal,
                city,
                r.get("source_url") or "https://fitactive.it/Club/Club",
                lat=r.get("lat"),
                lng=r.get("lng"),
                notes=((r.get("notes") or "") + "; phase2_cap_recovery").strip("; "),
                website=r.get("website"),
                coord_source=r.get("coord_source") or "OFFICIAL_COORDINATE",
                source_type="official_embedded_json",
            )
        )
    dump("fitactive_cap_p2", out)
    return out


# ---------------------------------------------------------------------------
# LATER brand audit notes (no invent)
# ---------------------------------------------------------------------------

def audit_later_brands() -> dict:
    log("  LATER brand audit...")
    notes = {}
    probes = {
        "GetFIT": "https://www.getfit.it/",
        "Tonic": "https://www.tonicfitness.it/",
        "Audace": "https://audacepalestre.it/",
        "Fit And Go": "https://www.fitandgo.it/",
        "Aspria": "https://www.aspria.com/it/",
        "Urban Fitness": "https://www.urbanfitness.it/",
        "Basic-Fit": "https://www.basic-fit.com/it-it/palestre",
    }
    for brand, url in probes.items():
        code, body = fetch(url, timeout=15)
        notes[brand] = {
            "url": url,
            "http": code,
            "bytes": len(body or ""),
            "decision": None,
        }
        time.sleep(0.2)
    notes["GetFIT"]["decision"] = (
        "PARTIAL — 6 clubs sold to Orange Jul 2026; official site 403; "
        "not staged without official address pages. 2 founder-retained clubs unknown."
    )
    notes["Tonic"]["decision"] = "EXCLUDE/NOT FOUND — DNS/site unavailable; no multi-location evidence."
    notes["Audace"]["decision"] = "EXCLUDE — blog/media site, not a conventional gym chain locator."
    notes["Fit And Go"]["decision"] = "EXCLUDE — EMS/Vacufit boutique."
    notes["Urban Fitness"]["decision"] = "EXCLUDE — EMS bio-electrical franchise."
    notes["Aspria"]["decision"] = "SKIP — premium clubs <5 Italy locations (Harbour Club etc.)."
    notes["Basic-Fit"]["decision"] = "EXCLUDE (IT) — no material Italy club list."
    (PHASE2 / "later_brand_audit.json").write_text(json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")
    return notes


def main():
    log("=== Italy Phase 2 discovery ===")
    all_rows: list[dict] = []
    chains = [
        ("fitup_p2", discover_fitup),
        ("fitexpress_p2", discover_fitexpress),
        ("webfit_p2", discover_webfit),
        ("20hours_p2", discover_20hours),
        ("fitnesspark_p2", discover_fitnesspark),
        ("orange_p2", discover_orange),
        ("anytime_p2", discover_anytime),
        ("icon_p2", discover_icon),
        ("fitactive_cap_p2", discover_fitactive_cap_fix),
    ]
    for name, fn in chains:
        log(f"\n[{name}]")
        try:
            rows = fn()
        except Exception as e:
            log(f"  ERROR {name}: {e}")
            rows = []
        all_rows.extend(rows)
    audit_later_brands()
    combined = OUT / "italy_phase2_discovery_combined.json"
    combined.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\nTOTAL Phase 2 discovered rows: {len(all_rows)}")
    log(f"Wrote {combined}")


if __name__ == "__main__":
    main()
