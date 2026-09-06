#!/usr/bin/env python3
"""
Switzerland Phase 1 discovery — official sources into staging candidates.
Does NOT modify centers.json.
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
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/switzerland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlySwitzerlandResearch/1.0; catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-CH,de;q=0.9,fr;q=0.8,it;q=0.8,en;q=0.7",
    "Accept-Encoding": "identity",
}
TODAY = date.today().isoformat()

CH_BOUNDS = (45.82, 47.81, 5.96, 10.49)
CH_POSTAL_RE = re.compile(r"^\d{4}$")
LI_POSTAL_PREFIXES = ("948", "949")
LI_CITIES = {
    "vaduz",
    "schaan",
    "triesen",
    "balzers",
    "eschen",
    "mauren",
    "gamprin",
    "ruggell",
    "planken",
    "schellenberg",
}


def fetch(url: str, timeout: int = 45) -> tuple[str, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def fetch_json(url: str) -> tuple[dict | list, str]:
    text, final = fetch(url)
    return json.loads(text), final


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def ch_postal(s: str) -> str:
    m = re.search(r"\b(\d{4})\b", str(s or ""))
    return m.group(1) if m else ""


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
            "switzerland",
        ]
    )
    return "ch_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_switzerland(lat: float, lng: float) -> bool:
    return CH_BOUNDS[0] <= lat <= CH_BOUNDS[1] and CH_BOUNDS[2] <= lng <= CH_BOUNDS[3]


def is_liechtenstein(postal: str, city: str, address: str = "") -> bool:
    blob = f"{postal} {city} {address}".lower()
    if "liechtenstein" in blob:
        return True
    if postal.startswith(LI_POSTAL_PREFIXES):
        return True
    city_norm = clean_text(city).lower()
    for li_city in LI_CITIES:
        if re.search(rf"\b{re.escape(li_city)}\b", city_norm):
            return True
    return False


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
    source_type: str = "official_page",
    coord_source: str | None = None,
    legacy_brand: str = "",
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    official_location_id: str = "",
    discovery_class: str = "national_chain",
):
    address = clean_text(address)
    postal = ch_postal(postal)
    city = clean_text(city)
    center_name = clean_text(center_name)

    if is_liechtenstein(postal, city, address):
        notes = (notes + "; liechtenstein_excluded").strip("; ")

    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if lat_f == 0 and lng_f == 0:
                lat_f = lng_f = None
            elif not in_switzerland(lat_f, lng_f):
                notes = (notes + "; coord_outside_ch_bbox").strip("; ")
                lat_f = lng_f = None
        except (TypeError, ValueError):
            lat_f = lng_f = None

    name = center_name
    if brand and center_name and not center_name.lower().startswith(brand.lower()[:4]):
        name = f"{brand} {center_name}".strip()

    status = "CLOSED" if closed else ("COMING_SOON" if coming else "NEEDS_REVIEW")
    if "liechtenstein_excluded" in notes:
        status = "NEEDS_REVIEW"

    rid = make_id(brand, address, postal, city)
    return {
        "id": rid,
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": center_name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Switzerland",
        "lat": lat_f,
        "lng": lng_f,
        "website": website or None,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": status,
        "notes": notes,
        "is_active": not (closed or coming),
        "import_category": status if status in ("COMING_SOON", "CLOSED") else "NEEDS_REVIEW",
        "phase": "switzerland_phase1",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand or None,
        "official_location_id": official_location_id or None,
        "discovery_class": discovery_class,
        "discovered_on": TODAY,
    }


def parse_json_ld_blocks(html: str) -> list[dict]:
    blocks: list[dict] = []
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.I | re.S):
        try:
            payload = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            blocks.append(payload)
            graph = payload.get("@graph")
            if isinstance(graph, list):
                blocks.extend(x for x in graph if isinstance(x, dict))
        elif isinstance(payload, list):
            blocks.extend(x for x in payload if isinstance(x, dict))
    return blocks


def extract_google_maps_coords(html: str) -> tuple[float | None, float | None]:
    for pat in (
        r"google[^\"']+maps[^\"']+/@([0-9.+-]+),([0-9.+-]+)",
        r"!3d([0-9.+-]+)!4d([0-9.+-]+)",
    ):
        m = re.search(pat, html)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except ValueError:
                continue
    return None, None


def parse_maps_q_address(html: str) -> tuple[str, str, str]:
    m = re.search(r"maps\.google\.com/maps\?[^\"']*q=([^&\"']+)", html, re.I)
    if not m:
        return "", "", ""
    q = htmlmod.unescape(m.group(1)).replace("+", " ")
    parts = [p.strip() for p in urllib.parse.unquote(q).split(",") if p.strip()]
    if len(parts) >= 4 and re.fullmatch(r"\d{4}", parts[-2]):
        return parts[-3], parts[-2], parts[-1]
    if len(parts) >= 3 and re.fullmatch(r"\d{4}", parts[-2]):
        return parts[-3], parts[-2], parts[-1]
    if len(parts) >= 2 and re.fullmatch(r"\d{4}", parts[-2]):
        return parts[-3] if len(parts) >= 3 else "", parts[-2], parts[-1]
    return "", "", ""


def parse_location_const(html: str) -> dict | None:
    block = re.search(r"const\s+location\s*=\s*\{([\s\S]*?)\};", html)
    if not block:
        return None
    body = block.group(1)
    lat_m = re.search(r"lat:\s*([0-9.+-]+)", body)
    lng_m = re.search(r"lng:\s*([0-9.+-]+)", body)
    title_m = re.search(r"title:\s*'((?:\\'|[^'])*)'", body)
    addr_m = re.search(r"address:\s*'((?:\\'|[^'])*)'", body)
    if not (lat_m and lng_m and title_m and addr_m):
        return None
    title = title_m.group(1).replace("\\'", "'")
    address_line = addr_m.group(1).replace("\\'", "'")
    street = address_line
    postal = city = ""
    m_addr = re.match(r"^(.*?),\s*(\d{4})\s+(.+)$", address_line)
    if not m_addr:
        m_addr = re.search(r"^(.*?)\s+(\d{4})\s+(.+)$", address_line)
    if m_addr:
        street, postal, city = m_addr.group(1).strip(), m_addr.group(2), m_addr.group(3).strip()
    return {
        "center_name": title,
        "address": street,
        "postal_code": postal,
        "city": city,
        "lat": float(lat_m.group(1)),
        "lng": float(lng_m.group(1)),
        "coord_source": "OFFICIAL_MAP_PIN",
    }
    blocks: list[dict] = []
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.I | re.S):
        try:
            payload = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            blocks.append(payload)
            graph = payload.get("@graph")
            if isinstance(graph, list):
                blocks.extend(x for x in graph if isinstance(x, dict))
        elif isinstance(payload, list):
            blocks.extend(x for x in payload if isinstance(x, dict))
    return blocks


def parse_fitnesspark_page(html: str, url: str) -> dict | None:
    """Fitnesspark.ch pages (redirect target from activfitness sitemap)."""
    title_m = re.search(r'data-park-title="([^"]+)"', html)
    title = clean_text(title_m.group(1)) if title_m else ""
    if not title:
        og = re.search(r'<meta property="og:title" content="([^"]+)"', html, re.I)
        if og:
            title = clean_text(re.sub(r"\s*-\s*Fitness und Wellness.*$", "", og.group(1), flags=re.I))
    center_name = re.sub(r"^Fitnesspark\s*", "", title, flags=re.I).strip() or title

    m = re.search(
        r"Fitnesspark[^<]*<br[^>]*>\s*([^<]+)<br[^>]*>\s*(\d{4})\s+([^<\n]+)",
        html,
        re.I | re.S,
    )
    if not m:
        m = re.search(
            r"Fitnesspark[^<]*<br\s*/?>\s*([^<]+)<br\s*/?>\s*(\d{4})\s+([^<\n]+)",
            html,
            re.I | re.S,
        )
    street = postal = city = ""
    if m:
        street = clean_text(m.group(1))
        postal = m.group(2)
        city = clean_text(m.group(3))
    if not street:
        street, postal, city = parse_maps_q_address(html)

    lat = lng = None
    for block in parse_json_ld_blocks(html):
        geo = block.get("geo") or {}
        if isinstance(geo, dict) and geo.get("latitude") is not None:
            lat = float(geo["latitude"])
            lng = float(geo.get("longitude"))
            break

    coming = bool(
        re.search(
            r"coming soon|demnächst|bientôt|opening soon|öffnet schon bald|ouvre bientôt",
            html,
            re.I,
        )
    )
    if not street and not coming:
        return None
    return {
        "center_name": center_name or "Fitnesspark",
        "address": street,
        "postal_code": postal,
        "city": city,
        "lat": lat,
        "lng": lng,
        "coord_source": "OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
        "coming": coming and not street,
    }


def parse_activ_studio_page(html: str, url: str, brand: str) -> dict | None:
    if brand == "Fitnesspark" or "fitnesspark.ch" in html:
        fp = parse_fitnesspark_page(html, url)
        if fp:
            return fp

    parsed = parse_location_const(html)
    if parsed:
        center_name = re.sub(rf"^{re.escape(brand)}\s*", "", parsed["center_name"], flags=re.I).strip()
        center_name = re.sub(r"\s*-\s*ACTIV FITNESS\s*$", "", center_name, flags=re.I).strip()
        parsed["center_name"] = center_name or parsed["center_name"]
        return parsed

    m = re.search(
        r"const\s+location\s*=\s*\{[\s\S]*?lat:\s*([0-9.+-]+),\s*lng:\s*([0-9.+-]+),\s*title:\s*'([^']*)',\s*address:\s*'([^']*)'",
        html,
    )
    if not m:
        m2 = re.search(
            r'<address[^>]*>(.*?)</address>',
            html,
            re.I | re.S,
        )
        if not m2:
            coming = bool(
                re.search(
                    r"coming soon|demnächst|bientôt|opening soon|öffnet schon bald|COMING_SOON",
                    html,
                    re.I,
                )
            )
            if coming:
                title_m = re.search(r"<title>([^<|]+)", html, re.I)
                title = clean_text(title_m.group(1)) if title_m else brand
                center_name = re.sub(rf"^{re.escape(brand)}\s*", "", title, flags=re.I).strip(" -")
                return {
                    "center_name": center_name or title,
                    "address": "",
                    "postal_code": "",
                    "city": "",
                    "lat": None,
                    "lng": None,
                    "coord_source": None,
                    "coming": True,
                }
            return None
        addr_html = m2.group(1)
        addr_html = re.sub(r"<br\s*/?>", ", ", addr_html, flags=re.I)
        addr_line = clean_text(addr_html)
        parts = [p.strip() for p in addr_line.split(",") if p.strip()]
        street = parts[0] if parts else ""
        postal = city = ""
        if len(parts) > 1:
            m_pc = re.match(r"(\d{4})\s+(.+)", parts[-1])
            if m_pc:
                postal, city = m_pc.group(1), m_pc.group(2)
        title_m = re.search(r"<title>([^<|]+)", html, re.I)
        title = clean_text(title_m.group(1)) if title_m else brand
        center_name = re.sub(rf"^{re.escape(brand)}\s*", "", title, flags=re.I).strip(" -")
        center_name = re.sub(r"\s*-\s*ACTIV FITNESS\s*$", "", center_name, flags=re.I).strip()
        lat, lng = extract_google_maps_coords(html)
        return {
            "center_name": center_name or title,
            "address": street,
            "postal_code": postal,
            "city": city,
            "lat": lat,
            "lng": lng,
            "coord_source": "OFFICIAL_MAP_PIN" if lat is not None else None,
        }

    lat, lng, title, address_line = m.group(1), m.group(2), m.group(3), m.group(4)
    street = address_line
    postal = city = ""
    m_addr = re.match(r"^(.*?),\s*(\d{4})\s+(.+)$", address_line)
    if m_addr:
        street, postal, city = m_addr.group(1), m_addr.group(2), m_addr.group(3)
    center_name = re.sub(rf"^{re.escape(brand)}\s*", "", title, flags=re.I).strip()
    return {
        "center_name": center_name or title,
        "address": street,
        "postal_code": postal,
        "city": city,
        "lat": float(lat),
        "lng": float(lng),
        "coord_source": "OFFICIAL_MAP_PIN",
    }


def discover_movemi() -> list[dict]:
    print("=== ACTIV FITNESS / Fitnesspark (activfitness.ch studio sitemap) ===")
    xml, _ = fetch("https://www.activfitness.ch/studio-sitemap.xml")
    (RAW / "activfitness_studio_sitemap.xml").write_text(xml, encoding="utf-8")
    urls = []
    for m in re.finditer(r"<loc>(https://www.activfitness.ch/studios/[^<]+)</loc>", xml):
        u = m.group(1)
        if "/fr/" in u or "/it/" in u or "/en/" in u:
            continue
        urls.append(u)
    urls = sorted(set(urls))
    print(f"  studio URLs: {len(urls)}")

    out: list[dict] = []
    for i, url in enumerate(urls, 1):
        slug = url.rstrip("/").split("/")[-1]
        if slug.startswith("fitnesspark"):
            brand = "Fitnesspark"
        else:
            brand = "ACTIV FITNESS"
        try:
            html, _ = fetch(url)
        except Exception as exc:
            print(f"  WARN fetch {url}: {exc}")
            continue
        slug_safe = re.sub(r"[^a-z0-9_-]+", "_", slug)[:80]
        (PAGES / f"activ_{slug_safe}.html").write_text(html[:500000], encoding="utf-8")
        parsed = parse_activ_studio_page(html, url, brand)
        if not parsed:
            print(f"  WARN parse failed: {url}")
            continue
        out.append(
            row(
                brand,
                parsed["center_name"],
                parsed["address"],
                parsed["postal_code"],
                parsed["city"],
                url,
                lat=parsed.get("lat"),
                lng=parsed.get("lng"),
                coord_source=parsed.get("coord_source"),
                source_type="official_studio_page",
                official_location_id=slug,
                coming=bool(parsed.get("coming")),
            )
        )
        if i % 25 == 0:
            print(f"  fetched {i}/{len(urls)}")
            time.sleep(0.3)
        else:
            time.sleep(0.12)
    print(f"  discovered: {len(out)}")
    return out


def discover_puregym() -> list[dict]:
    print("=== PureGym Switzerland (puregym.swiss fitnessstudios) ===")
    index_html, _ = fetch("https://www.puregym.swiss/fitnessstudios/")
    (RAW / "puregym_fitnessstudios_index.html").write_text(index_html[:500000], encoding="utf-8")
    paths = sorted(set(re.findall(r'href="(/fitnessstudios/[a-z0-9\-]+/)"', index_html)))
    print(f"  gym paths: {len(paths)}")
    out: list[dict] = []
    for i, path in enumerate(paths, 1):
        url = f"https://www.puregym.swiss{path}"
        try:
            html, _ = fetch(url)
        except Exception as exc:
            print(f"  WARN {url}: {exc}")
            continue
        slug = path.strip("/").split("/")[-1]
        (PAGES / f"puregym_{slug}.html").write_text(html[:500000], encoding="utf-8")

        lat = lng = None
        gym_id = ""
        name = slug.replace("-", " ").title()
        address = postal = city = ""

        for block in parse_json_ld_blocks(html):
            if block.get("@type") not in ("HealthClub", "ExerciseGym", "SportsActivityLocation"):
                continue
            geo = block.get("geo") or {}
            if isinstance(geo, dict) and geo.get("latitude") is not None:
                lat = float(geo["latitude"])
                lng = float(geo.get("longitude"))
            loc = block.get("location") or {}
            addr = loc.get("address") if isinstance(loc, dict) else {}
            if not isinstance(addr, dict):
                addr = block.get("address") or {}
            if isinstance(addr, dict):
                address = address or clean_text(addr.get("streetAddress") or "")
                postal = postal or ch_postal(addr.get("postalCode") or "")
                city = city or clean_text(addr.get("addressLocality") or "")
            if block.get("name"):
                name = clean_text(block["name"])
            break

        if lat is None:
            m_lat = re.search(r'"latitude"\s*:\s*\[0,([0-9.+-]+)\]', html)
            m_lng = re.search(r'"longitude"\s*:\s*\[0,([0-9.+-]+)\]', html)
            if m_lat and m_lng:
                lat, lng = float(m_lat.group(1)), float(m_lng.group(1))
        if not address:
            m_addr = re.search(r'"streetAddress"\s*:\s*\[0,"([^"]+)"\]', html)
            m_pc = re.search(r'"postalCode"\s*:\s*\[0,"([^"]+)"\]', html)
            m_city = re.search(r'"addressLocality"\s*:\s*\[0,"([^"]+)"\]', html)
            if m_addr:
                address = m_addr.group(1)
            if m_pc:
                postal = m_pc.group(1)
            if m_city:
                city = m_city.group(1)
        m_id = re.search(r'"gymId"\s*:\s*\[0,"([^"]+)"\]', html)
        if m_id:
            gym_id = m_id.group(1)
        if not address:
            m_line = re.search(r"Starting at CHF[^<]{0,200}?([A-Za-zÀ-ÿ0-9 .,/\-]+,\s*\d{4})", html)
            if m_line:
                line = m_line.group(1)
                m2 = re.match(r"(.+?),\s*(\d{4})\s*(.*)", line)
                if m2:
                    address, postal, city = m2.group(1).strip(), m2.group(2), m2.group(3).strip()

        center_name = re.sub(r"\s+Gym\s*$", "", name, flags=re.I).strip() or slug.replace("-", " ").title()
        coming = bool(re.search(r"coming soon|demnächst|bientôt|opening soon", html, re.I))
        out.append(
            row(
                "PureGym",
                center_name,
                address,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_STRUCTURED_DATA" if lat is not None else None,
                source_type="official_gym_page",
                legacy_brand="basefit.ch" if "basefit" in html.lower() else "",
                coming=coming,
                official_location_id=gym_id or slug,
            )
        )
        time.sleep(0.15)
    print(f"  discovered: {len(out)}")
    return out


def discover_clever_fit() -> list[dict]:
    print("=== clever fit Switzerland (shop.clever-fit.ch embedded JSON) ===")
    html, _ = fetch("https://shop.clever-fit.ch/")
    (RAW / "clever_fit_shop.html").write_text(html, encoding="utf-8")
    m = re.search(r'(\[{"name":"clever fit[^]]+\])\);', html)
    if not m:
        m = re.search(r'(\[{"name":"clever fit.*?"secondaryUrl":"[^"]+"}\])', html)
    if not m:
        print("  ERROR: could not find clever fit JSON")
        return []
    data = json.loads(m.group(1))
    (SCRAPES / "clever_fit_studios.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    out: list[dict] = []
    for item in data:
        name = item.get("name") or "clever fit"
        addr = item.get("address") or ""
        street = postal = city = ""
        m_addr = re.match(r"^(.+?),\s*(\d{4})\s+([^,]+)", addr)
        if m_addr:
            street, postal, city = m_addr.group(1).strip(), m_addr.group(2), m_addr.group(3).strip()
        else:
            street = addr
            postal = item.get("plz") or ""
        center = re.sub(r"^clever fit\s*", "", name, flags=re.I).strip()
        out.append(
            row(
                "clever fit",
                center or name,
                street,
                postal or item.get("plz") or "",
                city,
                item.get("url") or "https://shop.clever-fit.ch/",
                lat=item.get("lat"),
                lng=item.get("lng"),
                coord_source="OFFICIAL_LOCATOR",
                source_type="official_locator_json",
                official_location_id=str(item.get("externalPropertyGroupId") or ""),
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def discover_lets_go_fitness() -> list[dict]:
    print("=== Let's Go Fitness (Gatsby page-data / Strapi) ===")
    data, url = fetch_json("https://www.letsgofitness.ch/page-data/de/clubs/page-data.json")
    (SCRAPES / "lets_go_clubs_page_data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    nodes = data["result"]["data"]["allStrapiClub"]["nodes"]
    de_nodes = [n for n in nodes if n.get("locale") == "de"]
    print(f"  de clubs: {len(de_nodes)}")
    out: list[dict] = []
    for n in de_nodes:
        addr = n.get("address") or {}
        street = clean_text(addr.get("addressLine1") or "")
        if addr.get("addressLine2"):
            street = f"{street}, {clean_text(addr.get('addressLine2'))}".strip(", ")
        postal = str(addr.get("postalCode") or "")
        city = clean_text(addr.get("city") or "")
        geo = n.get("geolocation") or {}
        pod = "(POD)" in (n.get("name") or "")
        notes = "lets_go_pod_format" if pod else ""
        out.append(
            row(
                "Let's Go Fitness",
                n.get("name") or "",
                street,
                postal,
                city,
                f"https://www.letsgofitness.ch/de/club/{n.get('deeplink', '').strip('/')}/",
                lat=geo.get("latitude"),
                lng=geo.get("longitude"),
                coord_source="OFFICIAL_API" if geo.get("latitude") else None,
                source_type="official_gatsby_strapi",
                notes=notes,
                official_location_id=n.get("deeplink") or "",
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def discover_kieser() -> list[dict]:
    print("=== Kieser Training Switzerland ===")
    try:
        html, _ = fetch("https://www.kieser.ch/de/standorte")
    except Exception:
        try:
            html, _ = fetch("https://www.kieser-training.ch/standorte/")
        except Exception as exc:
            print(f"  BLOCKED: {exc}")
            return []
    (RAW / "kieser_standorte.html").write_text(html[:500000], encoding="utf-8")
    links = sorted(set(re.findall(r'href="(https?://[^"]*kieser[^"]*/(?:standorte|filiale|studio)/[^"]+)"', html, re.I)))
    if not links:
        links = sorted(set(re.findall(r'href="(/de/standorte/[^"]+)"', html)))
        links = [f"https://www.kieser.ch{l}" for l in links]
    print(f"  location links: {len(links)}")
    out: list[dict] = []
    for url in links[:40]:
        try:
            page, _ = fetch(url)
        except Exception:
            continue
        parsed = parse_activ_studio_page(page, url, "Kieser")
        if not parsed:
            ld_m = re.search(r'"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,200}?"postalCode"\s*:\s*"(\d{4})"[\s\S]{0,200}?"addressLocality"\s*:\s*"([^"]+)"', page)
            if ld_m:
                parsed = {
                    "center_name": clean_text(re.search(r"<h1[^>]*>([^<]+)", page).group(1)) if re.search(r"<h1[^>]*>([^<]+)", page) else "Kieser",
                    "address": ld_m.group(1),
                    "postal_code": ld_m.group(2),
                    "city": ld_m.group(3),
                    "lat": None,
                    "lng": None,
                    "coord_source": None,
                }
        if not parsed:
            continue
        out.append(
            row(
                "Kieser",
                parsed["center_name"],
                parsed["address"],
                parsed["postal_code"],
                parsed["city"],
                url,
                lat=parsed.get("lat"),
                lng=parsed.get("lng"),
                coord_source=parsed.get("coord_source"),
                source_type="official_page",
                discovery_class="specialty_strength",
                notes="kieser_inclusion_strength_training_centers",
            )
        )
        time.sleep(0.2)
    print(f"  discovered: {len(out)}")
    return out


def main():
    all_rows: list[dict] = []
    chain_stats: dict[str, int] = {}

    sources = [
        ("ACTIV FITNESS / Fitnesspark", discover_movemi),
        ("PureGym", discover_puregym),
        ("clever fit", discover_clever_fit),
        ("Let's Go Fitness", discover_lets_go_fitness),
        ("Kieser", discover_kieser),
    ]

    blocked = [
        {
            "brand": "NonStop Gym",
            "status": "BLOCKED",
            "reason": "HTTP 403 on official our-clubs locator from research environment; Phase 2 priority (~40+ clubs)",
            "official_estimate": "40+",
        }
    ]

    for label, fn in sources:
        try:
            rows = fn()
        except Exception as exc:
            print(f"FAILED {label}: {exc}")
            rows = []
        all_rows.extend(rows)
        chain_stats[label] = len(rows)

    out_path = OUT / "switzerland_phase1_candidates.json"
    out_path.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    inventory = {
        "generated": TODAY,
        "chains": chain_stats,
        "total_candidates": len(all_rows),
        "blocked_chains": blocked,
    }
    (OUT / "switzerland_chain_inventory.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(inventory, indent=2))


if __name__ == "__main__":
    main()
