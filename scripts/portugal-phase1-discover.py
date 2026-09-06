#!/usr/bin/env python3
"""
Portugal Phase 1 discovery — official sources into staging candidates.
Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/portugal"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyPortugalResearch/1.0; catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.6",
    "Accept-Encoding": "identity",
}
TODAY = date.today().isoformat()
PT_POSTAL_RE = re.compile(r"\b(\d{4}-\d{3})\b")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")


def fetch(url: str, timeout: int = 60) -> tuple[str, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def fetch_curl(url: str, timeout: int = 60) -> tuple[str, str]:
    """Fallback for hosts with strict TLS (e.g. fitnessfactory.pt)."""
    cmd = [
        "curl",
        "-fsSL",
        "-A",
        UA["User-Agent"],
        "-L",
        "--max-time",
        str(timeout),
        url,
    ]
    p = subprocess.run(cmd, capture_output=True, check=False)
    if p.returncode != 0:
        raise urllib.error.URLError(p.stderr.decode("utf-8", "replace")[:200])
    return p.stdout.decode("utf-8", "replace"), url


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_html_to_text(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    return clean_text(html)


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


def pt_postal(s: str) -> str:
    m = PT_POSTAL_RE.search(str(s or ""))
    return m.group(1) if m else ""


def parse_json_ld_blocks(html: str) -> list:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        raw = m.group(1).strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            out.extend(data)
        elif isinstance(data, dict) and "@graph" in data:
            out.extend(data["@graph"] if isinstance(data["@graph"], list) else [data["@graph"]])
            out.append(data)
        else:
            out.append(data)
    return out


def extract_healthclub(blocks: list) -> dict | None:
    for b in blocks:
        if not isinstance(b, dict):
            continue
        t = b.get("@type")
        types = t if isinstance(t, list) else [t]
        types = [str(x).lower() for x in types if x]
        if any(x in ("healthclub", "gym", "sportsactivitylocation", "localbusiness", "place") for x in types):
            return b
        if "address" in b and ("geo" in b or "latitude" in b):
            return b
    return None


def geo_from_ld(obj: dict) -> tuple[float | None, float | None, str]:
    geo = obj.get("geo") or {}
    if isinstance(geo, dict):
        try:
            lat = float(geo.get("latitude"))
            lng = float(geo.get("longitude"))
            return lat, lng, "OFFICIAL_JSON_LD"
        except (TypeError, ValueError):
            pass
    try:
        if obj.get("latitude") is not None and obj.get("longitude") is not None:
            return float(obj["latitude"]), float(obj["longitude"]), "OFFICIAL_JSON_LD"
    except (TypeError, ValueError):
        pass
    return None, None, ""


def resolve_maps_shortlink(url: str, cache: dict) -> tuple[float | None, float | None, str]:
    if url in cache:
        hit = cache[url]
        if hit:
            return hit.get("lat"), hit.get("lng"), hit.get("source", "OFFICIAL_MAP_PIN")
        return None, None, ""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            final = r.geturl()
    except Exception:
        # curl -I -L for short links
        try:
            p = subprocess.run(
                ["curl", "-sI", "-L", "-A", UA["User-Agent"], "--max-time", "25", url],
                capture_output=True,
                check=False,
            )
            headers = p.stdout.decode("utf-8", "replace")
            finals = re.findall(r"(?i)^location:\s*(\S+)", headers, re.M)
            final = finals[-1].strip() if finals else ""
        except Exception:
            cache[url] = None
            return None, None, ""
    lat = lng = None
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", final or "")
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
    if lat is None:
        m = re.search(r"[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)", final or "")
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
    if lat is None:
        m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", final or "")
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
    if lat is None:
        m = re.search(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", final or "")
        if m:
            lng, lat = float(m.group(1)), float(m.group(2))
    if lat is not None and lng is not None:
        cache[url] = {"lat": lat, "lng": lng, "source": "OFFICIAL_MAP_PIN", "final": final}
        return lat, lng, "OFFICIAL_MAP_PIN"
    cache[url] = None
    return None, None, ""


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
    coord_source: str = "",
    notes: str = "",
    import_category: str = "",
    chain_key: str = "",
    evidence: dict | None = None,
) -> dict:
    postal = pt_postal(postal) or (postal if re.fullmatch(r"\d{4}-\d{3}", str(postal or "")) else "")
    name = clean_text(center_name) or f"{brand} {city}".strip()
    address = clean_text(address)
    city = clean_text(city)
    rid = make_id(brand, address, postal, city)
    out = {
        "id": rid,
        "name": name,
        "brand": brand,
        "chain_key": chain_key or brand.lower().replace(" ", "_"),
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Portugal",
        "lat": lat,
        "lng": lng,
        "website": website or source_url,
        "source_url": source_url,
        "coord_source": coord_source or "",
        "notes": notes,
        "import_category": import_category,
        "discovered_at": TODAY,
        "is_active": True,
    }
    if evidence:
        out["evidence"] = evidence
    return out


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# VivaGym Portugal (ex Fitness Hut)
# ---------------------------------------------------------------------------


def discover_vivagym() -> list[dict]:
    print("== VivaGym PT ==")
    index_url = "https://www.vivagym.com/pt-pt/ginasios/"
    html, _ = fetch(index_url)
    (RAW / "vivagym_ginasios.html").write_text(html, encoding="utf-8")
    links = sorted(
        set(
            re.findall(
                r'href=["\'](https://www\.vivagym\.com/pt-pt/ginasios/[^"\']+/clube-[^"\']+/?)["\']',
                html,
            )
        )
    )
    # also relative
    for rel in re.findall(r'href=["\'](/pt-pt/ginasios/[^"\']+/clube-[^"\']+/?)["\']', html):
        links.append("https://www.vivagym.com" + rel)
    links = sorted(set(u.rstrip("/") + "/" for u in links if "/pt-pt/" in u))
    print(f"  club urls: {len(links)}")
    rows = []
    for i, url in enumerate(links, 1):
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"vivagym_{slug}.html").write_text(page[:250000], encoding="utf-8")
        blocks = parse_json_ld_blocks(page)
        club = extract_healthclub(blocks)
        address = postal = city = ""
        lat = lng = None
        csrc = ""
        status = ""
        name = ""
        if club:
            name = clean_text(club.get("name") or "")
            addr = club.get("address") or {}
            if isinstance(addr, dict):
                address = clean_text(addr.get("streetAddress") or "")
                postal = pt_postal(addr.get("postalCode") or "")
                city = clean_text(addr.get("addressLocality") or "")
                country = clean_text(addr.get("addressCountry") or "")
                if country and country.upper() not in ("PT", "PORTUGAL"):
                    print(f"  skip foreign {url} country={country}")
                    continue
            lat, lng, csrc = geo_from_ld(club)
        # coming soon / closed heuristics
        blob = strip_html_to_text(page).lower()
        if any(x in blob for x in ("em breve", "coming soon", "brevemente", "próxima abertura", "proxima abertura")):
            # only if clearly club status
            if re.search(r"(em breve|brevemente|coming soon).{0,40}(abertura|abrir|open)", blob) or "em breve" in blob[:2000]:
                status = "COMING_SOON"
        if any(x in blob for x in ("encerrado", "fechado permanentemente", "closed permanently")):
            status = "CLOSED"

        if not address or not postal:
            # fallback parse near postcode
            text = strip_html_to_text(page)
            m = PT_POSTAL_RE.search(text)
            if m and not postal:
                postal = m.group(1)
            m2 = re.search(
                rf"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{{3,80}}),\s*{re.escape(postal)}\s+([A-Za-zÀ-ú \-']+)",
                text,
            )
            if m2:
                if not address:
                    address = clean_text(m2.group(1))
                if not city:
                    city = clean_text(m2.group(2).split("Portugal")[0])

        if not name:
            name = f"VivaGym {city or slug.replace('clube-', '').replace('-', ' ').title()}"

        r = row(
            "VivaGym",
            name if name.lower().startswith("vivagym") else f"VivaGym {name}",
            address,
            postal,
            city,
            final,
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes="ex_fitness_hut_rebrand; country_filter=pt-pt",
            import_category=status,
            chain_key="vivagym",
            evidence={"source": "vivagym_json_ld", "url": final},
        )
        rows.append(r)
        if i % 10 == 0:
            print(f"  … {i}/{len(links)}")
        time.sleep(0.25)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Solinca + Solinca Light
# ---------------------------------------------------------------------------


def discover_solinca(maps_cache: dict) -> list[dict]:
    print("== Solinca ==")
    sm_url = "https://www.solinca.pt/gym-sitemap.xml"
    sm, _ = fetch(sm_url)
    (RAW / "solinca_gym_sitemap.xml").write_text(sm, encoding="utf-8")
    locs = re.findall(r"<loc>([^<]+)</loc>", sm)
    locs = [u for u in locs if "/solinca-ginasios/" in u]
    print(f"  sitemap gyms: {len(locs)}")
    rows = []
    for i, url in enumerate(locs, 1):
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"solinca_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = strip_html_to_text(page)
        # Brand: Light vs Classic
        brand = "Solinca Light" if "light" in slug.lower() or "solinca light" in text.lower()[:500] else "Solinca"
        if re.search(r"solinca\s+light", text, re.I) and "light" in slug.lower():
            brand = "Solinca Light"
        elif "light" in slug.lower():
            brand = "Solinca Light"
        else:
            brand = "Solinca"

        # Address: "Morada … R. …, NNNN-NNN, City"
        address = postal = city = ""
        m = re.search(
            r"(?:Morada|Localização|Localizacao)\s+((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,90}),\s*(\d{4}-\d{3})\s*,\s*([A-Za-zÀ-ú \-']+)",
            text,
            re.I,
        )
        if not m:
            m = re.search(
                r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,90}),\s*(\d{4}-\d{3})\s*,\s*([A-Za-zÀ-ú \-']+)",
                text,
            )
        if m:
            address = clean_text(m.group(1))
            postal = m.group(2)
            city = clean_text(m.group(3).split("Ver")[0].split("Horário")[0])

        lat = lng = None
        csrc = ""
        map_m = re.search(r"(https://maps\.app\.goo\.gl/[A-Za-z0-9]+)", page)
        if map_m:
            lat, lng, csrc = resolve_maps_shortlink(map_m.group(1), maps_cache)
            time.sleep(0.35)

        status = ""
        low = text.lower()
        if "em breve" in low or "brevemente" in low or "coming soon" in low:
            if "ginasio" in low or "clube" in low:
                status = "COMING_SOON"
        if "encerrado" in low and "temporar" not in low:
            status = "CLOSED"

        club_label = slug.replace("-", " ").title()
        name = f"{brand} {club_label}"
        r = row(
            brand,
            name,
            address,
            postal,
            city,
            final,
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes="solinca_gym_sitemap",
            import_category=status,
            chain_key="solinca_light" if brand == "Solinca Light" else "solinca",
            evidence={"source": "solinca_club_page", "url": final, "maps": map_m.group(1) if map_m else None},
        )
        rows.append(r)
        if i % 10 == 0:
            print(f"  … {i}/{len(locs)}")
        time.sleep(0.2)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Fitness UP
# ---------------------------------------------------------------------------


def discover_fitness_up() -> list[dict]:
    print("== Fitness UP ==")
    html, _ = fetch("https://www.fitnessup.pt/")
    (RAW / "fitnessup_home.html").write_text(html[:500000], encoding="utf-8")
    links = sorted(
        set(
            re.findall(r'href=["\'](https://www\.fitnessup\.pt/ginasio/[^"\'?#]+)', html)
            + ["https://www.fitnessup.pt" + u for u in re.findall(r'href=["\'](/ginasio/[^"\'?#]+)', html)]
        )
    )
    links = sorted(set(u.rstrip("/") for u in links if "/ginasio/" in u))
    print(f"  club urls: {len(links)}")
    rows = []
    for i, url in enumerate(links, 1):
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"fitnessup_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = strip_html_to_text(page)
        # Prefer address containing club-local postcode (exclude HQ 4764-503 unless club is Famalicão)
        address = postal = city = ""
        candidates = re.findall(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^|]{5,100}?),\s*(\d{4}-\d{3})\s*[-–,]?\s*([A-Za-zÀ-ú \-']+)?",
            text,
        )
        hq = "4764-503"
        picked = None
        for cand in candidates:
            addr, pc, cit = cand[0], cand[1], (cand[2] or "").strip()
            if pc == hq and "famalic" not in slug and "famalic" not in (cit or "").lower():
                continue
            picked = (clean_text(addr), pc, clean_text(cit.split("Portugal")[0].split("CONTACTOS")[0]))
            break
        if not picked and candidates:
            addr, pc, cit = candidates[0]
            picked = (clean_text(addr), pc, clean_text((cit or "").split("Portugal")[0]))
        if picked:
            address, postal, city = picked

        status = ""
        low = text.lower()
        if "em breve" in low or "brevemente" in low:
            status = "COMING_SOON"
        if "encerrado" in low:
            status = "CLOSED"

        name = f"Fitness UP {slug.replace('-', ' ').title()}"
        r = row(
            "Fitness UP",
            name,
            address,
            postal,
            city,
            final,
            notes="fitnessup_ginasio_page",
            import_category=status,
            chain_key="fitness_up",
            evidence={"source": "fitnessup_club_page", "url": final},
        )
        rows.append(r)
        if i % 15 == 0:
            print(f"  … {i}/{len(links)}")
        time.sleep(0.2)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Element
# ---------------------------------------------------------------------------


def discover_element() -> list[dict]:
    print("== Element ==")
    sm, _ = fetch("https://elementgyms.pt/gym-sitemap.xml")
    (RAW / "element_gym_sitemap.xml").write_text(sm, encoding="utf-8")
    locs = re.findall(r"<loc>([^<]+)</loc>", sm)
    # Prefer Portuguese /gyms/ over /en/gyms/
    by_slug = {}
    for u in locs:
        if "/gyms/" not in u:
            continue
        slug = u.rstrip("/").split("/")[-1]
        if "/en/gyms/" in u:
            by_slug.setdefault(slug, u)
        else:
            by_slug[slug] = u
    urls = sorted(by_slug.values())
    print(f"  unique gyms: {len(urls)}")

    # Also harvest listing pages for addresses (pagination)
    listing_addrs: dict[str, tuple[str, str, str]] = {}
    for page in range(1, 8):
        list_url = "https://elementgyms.pt/ginasio/" if page == 1 else f"https://elementgyms.pt/ginasio/?sf_paged={page}"
        try:
            html, _ = fetch(list_url)
        except Exception:
            break
        (RAW / f"element_ginasio_p{page}.html").write_text(html[:400000], encoding="utf-8")
        text = strip_html_to_text(html)
        # Name | Street | postcode City
        for m in re.finditer(
            r"([A-Za-zÀ-ú0-9 .'\-]{2,40})\s+((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,80}),?\s*(\d{4}-\d{3})\s+([A-Za-zÀ-ú \-']{2,40})",
            text,
        ):
            name, street, postal, city = (
                clean_text(m.group(1)),
                clean_text(m.group(2)),
                m.group(3),
                clean_text(m.group(4).split("Saber")[0]),
            )
            key = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            listing_addrs[key] = (street, postal, city)
        time.sleep(0.2)
    print(f"  listing address hits: {len(listing_addrs)}")

    rows = []
    for i, url in enumerate(urls, 1):
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"element_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = strip_html_to_text(page)
        address = postal = city = ""
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,90})\s+(\d{4}-\d{3})\s+([A-Za-zÀ-ú \-']+)",
            text,
        )
        if m:
            address = clean_text(m.group(1))
            postal = m.group(2)
            city = clean_text(m.group(3).split("Horário")[0].split("Aderir")[0])
        if not address:
            hit = listing_addrs.get(slug) or listing_addrs.get(slug.replace("-", " "))
            if not hit:
                # fuzzy by slug tokens
                for k, v in listing_addrs.items():
                    if k.replace("-", "") == slug.replace("-", ""):
                        hit = v
                        break
            if hit:
                address, postal, city = hit

        status = ""
        low = text.lower()
        if "em breve" in low or "brevemente" in low or "coming soon" in low:
            status = "COMING_SOON"
        if "encerrado" in low:
            status = "CLOSED"

        name = f"Element {slug.replace('-', ' ').title()}"
        r = row(
            "Element",
            name,
            address,
            postal,
            city,
            final,
            notes="element_gym_sitemap",
            import_category=status,
            chain_key="element",
            evidence={"source": "element_gym_page", "url": final},
        )
        rows.append(r)
        if i % 10 == 0:
            print(f"  … {i}/{len(urls)}")
        time.sleep(0.2)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Fitness Factory (curl TLS)
# ---------------------------------------------------------------------------


def discover_fitness_factory() -> list[dict]:
    print("== Fitness Factory ==")
    html, _ = fetch_curl("https://www.fitnessfactory.pt/clubes")
    (RAW / "ff_clubes.html").write_text(html, encoding="utf-8")
    rels = sorted(set(re.findall(r'href=["\']/clubes/([a-z0-9\-]+)["\']', html, re.I)))
    print(f"  club slugs: {len(rels)}")
    rows = []
    for i, slug in enumerate(rels, 1):
        url = f"https://www.fitnessfactory.pt/clubes/{slug}"
        try:
            page, _ = fetch_curl(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        (PAGES / f"ff_{slug}.html").write_text(page[:150000], encoding="utf-8")
        text = strip_html_to_text(page)
        address = postal = city = ""
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Caminho|R\.)[^,]{3,90}),?\s*(?:n\.?\s*)?(\d+[A-Za-z/\-]*)?.*?(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-']+)?",
            text,
        )
        if m:
            street = clean_text(m.group(1))
            num = clean_text(m.group(2) or "")
            address = f"{street} {num}".strip() if num and num not in street else street
            postal = m.group(3)
            city = clean_text((m.group(4) or "").split("CONSULTA")[0].split("Tele")[0])
        if not address:
            # street only (common on FF pages) — city from slug
            m2 = re.search(
                r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Caminho|R\.)[^\d]{3,60}?\d+[A-Za-z/\-]*)",
                text,
            )
            if m2:
                address = clean_text(m2.group(1))
            city = city or slug.replace("-", " ").title()

        status = ""
        low = text.lower()
        if "em breve" in low or "brevemente" in low or "coming soon" in low:
            status = "COMING_SOON"
        if "encerrado" in low:
            status = "CLOSED"

        name = f"Fitness Factory {slug.replace('-', ' ').title()}"
        r = row(
            "Fitness Factory",
            name,
            address,
            postal,
            city,
            url,
            notes="fitnessfactory_club_page; tls_via_curl",
            import_category=status,
            chain_key="fitness_factory",
            evidence={"source": "fitnessfactory_club_page", "url": url},
        )
        rows.append(r)
        if i % 10 == 0:
            print(f"  … {i}/{len(rels)}")
        time.sleep(0.15)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Be-Fit
# ---------------------------------------------------------------------------


def discover_befit() -> list[dict]:
    print("== Be-Fit ==")
    html, _ = fetch("https://be-fit.pt/befit/clubes")
    (RAW / "befit_clubes.html").write_text(html, encoding="utf-8")
    # Club slugs that have /contactos
    slugs = sorted(
        set(
            re.findall(r'href=["\']([a-z0-9\-]+)/contactos["\']', html)
            + re.findall(r'href=["\'](?:https://(?:www\.)?be-fit\.pt)?/befit/([a-z0-9\-]+)/contactos', html)
        )
    )
    skip = {
        "clubes",
        "faqs",
        "images",
        "scripts",
        "quem-somos",
        "politica-de-privacidade",
        "ficha-tecnica",
        "personal-trainer",
        "quer-ser-nosso-pt",
        "be-fresh",
        "app-plano-de-treino",
    }
    slugs = [s for s in slugs if s not in skip]
    # Also discover from region pages / known contactos pattern on clubes page
    more = re.findall(r'href=["\']([a-z0-9\-]{3,40})["\']', html)
    for s in more:
        if s in skip or s in slugs:
            continue
        # heuristic: club-like
        if any(
            x in s
            for x in (
                "funchal",
                "aveiro",
                "porto",
                "lisboa",
                "braga",
                "maia",
                "setubal",
                "leiria",
                "evora",
                "montijo",
                "ovar",
                "grijo",
                "ermesinde",
                "famalicao",
                "felgueiras",
                "alverca",
                "barreiro",
                "marinha",
                "mem-martins",
                "plaza",
                "maritimo",
                "centromar",
                "portimao",
                "torres",
                "pvarzim",
            )
        ):
            slugs.append(s)
    slugs = sorted(set(slugs))
    print(f"  candidate slugs: {len(slugs)}")
    rows = []
    for i, slug in enumerate(slugs, 1):
        url = f"https://be-fit.pt/befit/{slug}/contactos"
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        if "404" in page[:500].lower() and "contactos" not in strip_html_to_text(page).lower()[:200]:
            continue
        (PAGES / f"befit_{slug}.html").write_text(page[:180000], encoding="utf-8")
        text = strip_html_to_text(page)
        address = postal = city = ""
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Rampa|R\.)[^,]{3,90}?)\s+(\d{4}-\d{3})\s+([A-Za-zÀ-ú \-']+)",
            text,
        )
        if m:
            address = clean_text(m.group(1))
            postal = m.group(2)
            city = clean_text(m.group(3).split("Telefones")[0].split("Telefone")[0])
        if not postal:
            continue  # not a real club contact page

        status = ""
        # Check club page for coming soon
        try:
            club_html, _ = fetch(f"https://be-fit.pt/befit/{slug}")
            club_text = strip_html_to_text(club_html).lower()
            if "brevemente" in club_text or "em breve" in club_text:
                status = "COMING_SOON"
        except Exception:
            pass

        name = f"Be-Fit {slug.replace('-', ' ').title()}"
        r = row(
            "Be-Fit",
            name,
            address,
            postal,
            city,
            final,
            notes="befit_contactos",
            import_category=status,
            chain_key="be_fit",
            evidence={"source": "befit_contactos", "url": final},
        )
        rows.append(r)
        if i % 8 == 0:
            print(f"  … {i}/{len(slugs)}")
        time.sleep(0.2)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Holmes Place Portugal
# ---------------------------------------------------------------------------


def discover_holmes_place() -> list[dict]:
    print("== Holmes Place PT ==")
    html, _ = fetch("https://www.holmesplace.com/pt/pt/clubes")
    (RAW / "holmes_clubes.html").write_text(html, encoding="utf-8")
    rels = sorted(set(re.findall(r'href=["\'](/pt/pt/clubes/[a-z0-9\-]+)["\']', html, re.I)))
    rels = [r for r in rels if r.rstrip("/") != "/pt/pt/clubes"]
    print(f"  club paths: {len(rels)}")
    rows = []
    for i, rel in enumerate(rels, 1):
        url = "https://www.holmesplace.com" + rel
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        slug = rel.rstrip("/").split("/")[-1]
        (PAGES / f"hp_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = strip_html_to_text(page).lower()
        status = ""
        if "encerrado" in text or "closed" in text:
            status = "CLOSED"
        if "em breve" in text or "coming soon" in text or "brevemente" in text:
            status = "COMING_SOON"

        blocks = parse_json_ld_blocks(page)
        club = extract_healthclub(blocks)
        address = postal = city = name = ""
        lat = lng = None
        csrc = ""
        if club:
            name = clean_text(club.get("name") or "")
            addr = club.get("address") or {}
            if isinstance(addr, dict):
                address = clean_text(addr.get("streetAddress") or "")
                postal = pt_postal(addr.get("postalCode") or "")
                city = clean_text(addr.get("addressLocality") or "")
                cc = clean_text(addr.get("addressCountry") or "")
                if cc and cc.upper() not in ("PT", "PORTUGAL"):
                    print(f"  skip foreign {url}")
                    continue
            lat, lng, csrc = geo_from_ld(club)
            # also raw lat/lng on page
            if lat is None:
                mlat = re.search(r'"latitude"\s*:\s*(-?\d+\.\d+)', page)
                mlng = re.search(r'"longitude"\s*:\s*(-?\d+\.\d+)', page)
                if mlat and mlng:
                    lat, lng = float(mlat.group(1)), float(mlng.group(1))
                    csrc = "OFFICIAL_EMBEDDED_DATA"

        if not name:
            name = f"Holmes Place {slug.replace('-', ' ').title()}"

        r = row(
            "Holmes Place",
            name,
            address,
            postal,
            city,
            final,
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes="holmesplace_pt_only; filter=/pt/pt/",
            import_category=status,
            chain_key="holmes_place",
            evidence={"source": "holmesplace_json_ld", "url": final},
        )
        rows.append(r)
        time.sleep(0.25)
    print(f"  staged: {len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# Supera (PT only — exclude centrosupera.com ES)
# ---------------------------------------------------------------------------


def discover_supera() -> list[dict]:
    print("== Supera ==")
    html, _ = fetch("https://centrosupera.pt/conheca-os-centros-da-supera/")
    (RAW / "supera_centros.html").write_text(html, encoding="utf-8")
    # PT center paths only on centrosupera.pt
    paths = sorted(
        set(
            re.findall(
                r'href=["\'](?:https://centrosupera\.pt)?/(areeiro|telheiras|setubal|barreiro|coimbra|seixal)/?["\']',
                html,
                re.I,
            )
        )
    )
    # Also absolute
    for m in re.findall(r'https://centrosupera\.pt/([a-z\-]+)/?', html, re.I):
        if m.lower() in ("areeiro", "telheiras", "setubal", "barreiro", "coimbra", "seixal", "lisboa"):
            paths.append(m.lower())
    paths = sorted(set(paths))
    # Lisboa may map to Areeiro
    print(f"  center paths: {paths}")
    rows = []
    for slug in paths:
        url = f"https://centrosupera.pt/{slug}/"
        try:
            page, final = fetch(url)
        except Exception as e:
            print(f"  FAIL {url}: {e}")
            continue
        (PAGES / f"supera_{slug}.html").write_text(page[:200000], encoding="utf-8")
        text = strip_html_to_text(page)
        address = postal = city = ""
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,90}),?\s*(\d{4}-\d{3})\s*([A-Za-zÀ-ú \-']+)?",
            text,
        )
        if m:
            address = clean_text(m.group(1))
            postal = m.group(2)
            city = clean_text((m.group(3) or "").split("Portugal")[0])
        lat = lng = None
        csrc = ""
        mlat = re.search(r'["\']?latitude["\']?\s*[:=]\s*["\']?(-?\d+\.\d+)', page, re.I)
        mlng = re.search(r'["\']?longitude["\']?\s*[:=]\s*["\']?(-?\d+\.\d+)', page, re.I)
        if mlat and mlng:
            lat, lng = float(mlat.group(1)), float(mlng.group(1))
            csrc = "OFFICIAL_EMBEDDED_DATA"
        map_m = re.search(r"(https://maps\.app\.goo\.gl/[A-Za-z0-9]+|https://www\.google\.[^\"']+maps[^\"']+)", page)
        name = f"Supera {slug.replace('-', ' ').title()}"
        r = row(
            "Supera",
            name,
            address,
            postal,
            city or slug.title(),
            final,
            lat=lat,
            lng=lng,
            coord_source=csrc,
            notes="supera_pt_fitness_complex; inclusion=consumer_fitness_center_in_municipal_sports_complex; exclude_es_centrosupera_com",
            chain_key="supera",
            evidence={"source": "supera_pt_page", "url": final, "maps": map_m.group(1) if map_m else None},
        )
        rows.append(r)
        time.sleep(0.25)
    print(f"  staged: {len(rows)}")
    return rows


def main():
    maps_cache_path = OUT / "portugal_maps_resolve_cache.json"
    maps_cache = json.loads(maps_cache_path.read_text(encoding="utf-8")) if maps_cache_path.exists() else {}

    all_rows: list[dict] = []
    all_rows.extend(discover_vivagym())
    all_rows.extend(discover_solinca(maps_cache))
    all_rows.extend(discover_fitness_up())
    all_rows.extend(discover_element())
    all_rows.extend(discover_fitness_factory())
    all_rows.extend(discover_befit())
    all_rows.extend(discover_holmes_place())
    all_rows.extend(discover_supera())

    save_json(maps_cache_path, maps_cache)
    save_json(OUT / "portugal_phase1_candidates.json", all_rows)
    save_json(SCRAPES / "phase1_candidates_meta.json", {"count": len(all_rows), "date": TODAY})

    by_brand = {}
    for r in all_rows:
        by_brand.setdefault(r["brand"], 0)
        by_brand[r["brand"]] += 1
    print("\n== SUMMARY ==")
    print("total", len(all_rows))
    for b, n in sorted(by_brand.items(), key=lambda x: -x[1]):
        print(f"  {b}: {n}")


if __name__ == "__main__":
    main()
