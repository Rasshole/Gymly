#!/usr/bin/env python3
"""
Germany Phase 1 discovery — scrape official sources into staging candidates.
Does NOT merge into centers.json. Does NOT invent coordinates.
"""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/germany"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(exist_ok=True)
SCRAPES.mkdir(exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyGermanyResearch/1.0; catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


def fetch(url: str, timeout: int = 45, as_bytes: bool = False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        data = r.read()
        final = r.geturl()
        headers = dict(r.headers)
        if as_bytes:
            return data, final, headers
        return data.decode("utf-8", "replace"), final, headers


def fetch_json(url: str):
    html, final, headers = fetch(url)
    return json.loads(html), final, headers


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "germany",
        ]
    )
    return "de_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", str(s))
    s = re.sub(r"\s+", " ", s).strip()
    s = (
        s.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#8211;", "–")
        .replace("&nbsp;", " ")
    )
    return s


def parse_de_address_blob(text: str) -> dict:
    """Extract street, postal, city from German address-ish text."""
    text = clean_text(text)
    m = re.search(
        r"(.+?)\s*,?\s*(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,60})",
        text,
    )
    if m:
        return {
            "address": m.group(1).strip(" ,"),
            "postal_code": m.group(2),
            "city": m.group(3).strip(),
        }
    m2 = re.search(r"\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,60})", text)
    if m2:
        before = text[: m2.start()].strip(" ,")
        return {
            "address": before,
            "postal_code": m2.group(1),
            "city": m2.group(2).strip(),
        }
    return {"address": text, "postal_code": "", "city": ""}


def row(
    brand: str,
    center_name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    website: str = "",
    opening_hours=None,
    verification_status: str = "VERIFIED_CURRENT",
    legacy_brand: str = "",
    notes: str = "",
):
    address = clean_text(address)
    postal = clean_text(postal)
    city = clean_text(city)
    center_name = clean_text(center_name)
    # Germany postal is 5 digits
    if postal and not re.fullmatch(r"\d{5}", postal):
        # try extract
        m = re.search(r"\b(\d{5})\b", postal)
        postal = m.group(1) if m else ""

    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
                lat_f = lng_f = None
            if lat_f == 0 and lng_f == 0:
                lat_f = lng_f = None
            # rough DE bounds
            if lat_f is not None and not (47.0 <= lat_f <= 55.5 and 5.5 <= lng_f <= 15.5):
                # keep but flag
                notes = (notes + "; coord_outside_de_bbox").strip("; ")
        except (TypeError, ValueError):
            lat_f = lng_f = None

    rid = make_id(brand, address, postal, city)
    return {
        "id": rid,
        "brand": brand,
        "name": center_name if center_name.lower().startswith(brand.lower()[:4]) else f"{brand} {center_name}".strip(),
        "center_name": center_name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Germany",
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": verification_status,
        "legacy_brand": legacy_brand or None,
        "notes": notes or None,
        "is_active": False,
        "import_category": "PENDING_CLASSIFY",
        "phase": "germany_phase1",
        "coord_source": "official_api" if lat_f is not None else None,
    }


# ---------------------------------------------------------------------------
# RSG Magicline: McFIT / JOHN REED / Gold's Gym
# ---------------------------------------------------------------------------
def discover_rsg_magicline() -> list[dict]:
    print("=== RSG Magicline ===")
    data, _, _ = fetch_json("https://rsg-group.api.magicline.com/connect/v1/studio")
    SCRAPES.joinpath("magicline_studios.json").write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )
    out = []
    for s in data:
        addr = s.get("address") or {}
        if (addr.get("countryCodeAlpha2") or "").upper() != "DE":
            continue
        tag_names = []
        for t in s.get("studioTags") or []:
            if isinstance(t, dict):
                tag_names.append((t.get("name") or "").strip())
        tag_set = set(tag_names)
        if "inaktiv" in tag_set or "GHOST-STUDIO" in tag_set:
            status = "CLOSED"
        elif s.get("closingDate"):
            status = "CLOSED"
        elif s.get("openingDate"):
            # future opening?
            status = "VERIFIED_CURRENT"
        else:
            status = "VERIFIED_CURRENT"

        if "McFIT" in tag_set:
            brand = "McFIT"
        elif "JOHN REED" in tag_set:
            brand = "JOHN REED"
        elif "Gold's Gym" in tag_set:
            brand = "Gold's Gym"
        else:
            # skip other RSG concepts (High5, ALDI SPORT?, etc.) unless named
            name_u = (s.get("studioName") or "").upper()
            if name_u.startswith("MCFIT"):
                brand = "McFIT"
            elif "JOHN REED" in name_u:
                brand = "JOHN REED"
            elif "GOLD" in name_u:
                brand = "Gold's Gym"
            else:
                continue

        street = " ".join(
            x for x in [addr.get("street"), addr.get("houseNumber")] if x
        ).strip()
        if addr.get("streetAddition"):
            street = f"{street}, {addr['streetAddition']}".strip(", ")
        hours = s.get("openingHours")
        out.append(
            row(
                brand=brand,
                center_name=s.get("studioName") or brand,
                address=street,
                postal=str(addr.get("zipCode") or ""),
                city=addr.get("city") or "",
                source_url="https://rsg-group.api.magicline.com/connect/v1/studio",
                lat=addr.get("latitude"),
                lng=addr.get("longitude"),
                website={
                    "McFIT": "https://www.mcfit.com/studios",
                    "JOHN REED": "https://johnreed.fitness/en-de/clubs",
                    "Gold's Gym": "https://goldsgym.de/",
                }.get(brand, ""),
                opening_hours=hours,
                verification_status=status,
                notes=f"magicline_id={s.get('id')}; tags={','.join(tag_names[:8])}",
            )
        )
    print("RSG DE rows", len(out), Counter(r["brand"] for r in out))
    return out


# ---------------------------------------------------------------------------
# EASYFITNESS WordPress
# ---------------------------------------------------------------------------
def discover_easyfitness() -> list[dict]:
    print("=== EASYFITNESS ===")
    all_posts = []
    page = 1
    while page <= 10:
        url = f"https://easyfitness.club/wp-json/wp/v2/studio?per_page=100&page={page}"
        try:
            req = urllib.request.Request(url, headers={**UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, context=ctx, timeout=45) as r:
                batch = json.loads(r.read().decode())
                total = r.headers.get("X-WP-Total")
                print(f" page {page} got {len(batch)} total={total}")
        except Exception as e:
            print(" page fail", page, e)
            break
        if not batch:
            break
        all_posts.extend(batch)
        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.4)

    SCRAPES.joinpath("easyfitness_wp_studios.json").write_text(
        json.dumps(all_posts, ensure_ascii=False), encoding="utf-8"
    )

    # taxonomy for EMS?
    try:
        feats, _, _ = fetch_json(
            "https://easyfitness.club/wp-json/wp/v2/studiofeature?per_page=100"
        )
        SCRAPES.joinpath("easyfitness_features.json").write_text(
            json.dumps(feats, ensure_ascii=False), encoding="utf-8"
        )
        feat_map = {f["id"]: f.get("name") or f.get("slug") for f in feats}
    except Exception:
        feat_map = {}

    out = []
    for p in all_posts:
        title = clean_text((p.get("title") or {}).get("rendered") or "")
        link = p.get("link") or ""
        slug = p.get("slug") or ""
        if slug in {"musterstadt"} or "muster" in title.lower():
            continue
        # fetch page for address
        try:
            html, _, _ = fetch(link)
            time.sleep(0.35)
        except Exception as e:
            print(" studio page fail", link, e)
            out.append(
                row(
                    "EASYFITNESS",
                    title,
                    "",
                    "",
                    "",
                    link,
                    verification_status="NEEDS_REVIEW",
                    notes=f"page_fetch_fail:{e}",
                )
            )
            continue

        RAW.joinpath(f"easy_{slug[:60]}.html").write_text(html, encoding="utf-8")
        # JSON-LD PostalAddress
        addr = postal = city = ""
        lat = lng = None
        for m in re.finditer(
            r'<script type="application/ld\+json">([\s\S]*?)</script>', html, re.I
        ):
            try:
                blob = json.loads(m.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = a.get("streetAddress") or addr
                    postal = a.get("postalCode") or postal
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)
        if not addr:
            # fallback patterns
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", html
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()
                # look for street near postal
                window = html[max(0, m.start() - 200) : m.start()]
                sm = re.search(
                    r">([A-Za-zÄÖÜäöüß0-9 .,\-]{5,80}\d[A-Za-z0-9/\-]*)\s*<",
                    window,
                )
                if sm:
                    addr = clean_text(sm.group(1))

        features = [feat_map.get(i, str(i)) for i in (p.get("studiofeature") or [])]
        is_ems_only = any(
            re.search(r"\bems\b", str(f), re.I) for f in features
        ) and not any(
            re.search(r"fitness|kraft|cardio|geraete|geräte", str(f), re.I)
            for f in features
        )
        status = "NEEDS_REVIEW" if is_ems_only else "VERIFIED_CURRENT"
        notes = f"features={','.join(str(f) for f in features[:12])}"
        if is_ems_only:
            notes += "; possible_ems_only"

        out.append(
            row(
                "EASYFITNESS",
                title,
                addr,
                postal,
                city,
                link,
                lat=lat,
                lng=lng,
                website=link,
                verification_status=status,
                notes=notes,
            )
        )
        if len(out) % 25 == 0:
            print("  scraped", len(out))
    print("EASYFITNESS rows", len(out))
    return out


# ---------------------------------------------------------------------------
# FitX — city pages + overview
# ---------------------------------------------------------------------------
def discover_fitx() -> list[dict]:
    print("=== FitX ===")
    overview, _, _ = fetch("https://www.fitx.de/fitnessstudios/uebersicht")
    RAW.joinpath("fitx_uebersicht.html").write_text(overview, encoding="utf-8")
    city_paths = sorted(
        set(
            re.findall(
                r'href="(/(?:fitnessstudios-[a-z0-9\-]+|fitnessstudios/[a-z0-9\-]+))"',
                overview,
                re.I,
            )
        )
    )
    # also absolute
    city_paths += sorted(
        set(
            re.findall(
                r'href="(https://www\.fitx\.de/fitnessstudios[^"#]+)"', overview, re.I
            )
        )
    )
    # normalize
    urls = []
    for p in city_paths:
        if p.startswith("http"):
            urls.append(p)
        else:
            urls.append("https://www.fitx.de" + p)
    urls = sorted(set(urls))
    print("FitX city/list URLs", len(urls))

    studio_urls = set()
    for url in urls:
        try:
            html, _, _ = fetch(url)
            time.sleep(0.4)
        except Exception as e:
            print(" fitx page fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1][:80]
        RAW.joinpath(f"fitx_{slug}.html").write_text(html, encoding="utf-8")
        for href in re.findall(r'href="([^"]+)"', html):
            if re.search(r"fitnessstudio", href, re.I) and "uebersicht" not in href:
                if href.startswith("/"):
                    href = "https://www.fitx.de" + href
                if href.startswith("https://www.fitx.de/"):
                    studio_urls.add(href.split("?")[0].rstrip("/"))
        # embedded JSON with addresses
        for m in re.finditer(r'"street"\s*:\s*"([^"]+)"', html):
            pass

    # Also try sitemap
    try:
        sm, _, _ = fetch("https://www.fitx.de/sitemap.xml")
        RAW.joinpath("fitx_sitemap.xml").write_text(sm, encoding="utf-8")
        locs = re.findall(r"<loc>([^<]+)</loc>", sm)
        for loc in locs:
            if "fitnessstudio" in loc.lower() and "uebersicht" not in loc.lower():
                studio_urls.add(loc.rstrip("/"))
        print("FitX sitemap locs added, studio_urls now", len(studio_urls))
    except Exception as e:
        print("FitX sitemap fail", e)

    # Filter to likely studio detail pages (not city hubs only)
    detail = [
        u
        for u in studio_urls
        if re.search(r"fitx\.de/.+", u)
        and not u.endswith("/fitnessstudios")
        and "uebersicht" not in u
    ]
    print("FitX candidate URLs", len(detail))

    out = []
    for i, url in enumerate(sorted(detail)):
        try:
            html, _, _ = fetch(url)
            time.sleep(0.35)
        except Exception as e:
            print(" detail fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1][:80]
        RAW.joinpath(f"fitx_studio_{slug}.html").write_text(html, encoding="utf-8")

        name = ""
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html, re.I)
        if m:
            name = clean_text(m.group(1))
        if not name:
            name = slug.replace("-", " ").title()

        addr = postal = city = ""
        lat = lng = None
        for jm in re.finditer(
            r'<script type="application/ld\+json">([\s\S]*?)</script>', html, re.I
        ):
            try:
                blob = json.loads(jm.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = a.get("streetAddress") or addr
                    postal = str(a.get("postalCode") or postal)
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)
                if it.get("name") and not name.startswith("FitX"):
                    name = clean_text(it.get("name"))

        if not postal:
            parsed = parse_de_address_blob(
                re.sub(r"<[^>]+>", " ", html[html.find("Adresse") : html.find("Adresse") + 400])
                if "Adresse" in html
                else ""
            )
            addr = addr or parsed["address"]
            postal = postal or parsed["postal_code"]
            city = city or parsed["city"]

        # skip pure city landing pages without address
        if not addr and not postal:
            continue

        out.append(
            row(
                "FitX",
                name if name else f"FitX {slug}",
                addr,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website=url,
            )
        )
        if (i + 1) % 20 == 0:
            print("  FitX scraped", len(out), "/", i + 1)
    print("FitX rows", len(out))
    return out


# ---------------------------------------------------------------------------
# Fitness First
# ---------------------------------------------------------------------------
def discover_fitness_first() -> list[dict]:
    print("=== Fitness First ===")
    html, _, _ = fetch("https://www.fitnessfirst.de/clubs")
    RAW.joinpath("fitnessfirst_clubs.html").write_text(html, encoding="utf-8")
    hrefs = set(re.findall(r'href="(/clubs/[a-z0-9\-]+/?)"', html, re.I))
    hrefs |= set(
        re.findall(r'href="(https://www\.fitnessfirst\.de/clubs/[a-z0-9\-]+/?)"', html, re.I)
    )
    skip = {"clubs-mit-pool", "ladies-clubs"}
    urls = []
    for h in hrefs:
        slug = h.rstrip("/").split("/")[-1]
        if slug in skip or not slug:
            continue
        urls.append(h if h.startswith("http") else "https://www.fitnessfirst.de" + h)
    urls = sorted(set(u.rstrip("/") for u in urls))
    print("FF club URLs", len(urls))

    out = []
    for url in urls:
        try:
            page, _, _ = fetch(url)
            time.sleep(0.35)
        except Exception as e:
            print(" FF fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"ff_{slug}.html").write_text(page, encoding="utf-8")
        name = ""
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
        if m:
            name = clean_text(m.group(1))
        if not name:
            name = f"Fitness First {slug.replace('-', ' ').title()}"

        addr = postal = city = ""
        lat = lng = None
        for jm in re.finditer(
            r'<script type="application/ld\+json">([\s\S]*?)</script>', page, re.I
        ):
            try:
                blob = json.loads(jm.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = a.get("streetAddress") or addr
                    postal = str(a.get("postalCode") or postal)
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)

        if not postal:
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()
                # street: look for common patterns near address block
                sm = re.search(
                    r"((?:[A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee|ring|gasse)[^<\n]{0,40}\d+[a-zA-Z]?))",
                    page,
                    re.I,
                )
                if sm:
                    addr = clean_text(sm.group(1))

        if not addr and not postal:
            continue

        out.append(
            row(
                "Fitness First",
                name,
                addr,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website=url,
            )
        )
    print("Fitness First rows", len(out))
    return out


# ---------------------------------------------------------------------------
# all inclusive Fitness (AI)
# ---------------------------------------------------------------------------
def discover_ai_fitness() -> list[dict]:
    print("=== all inclusive Fitness ===")
    html, _, _ = fetch("https://www.ai-fitness.de/studios")
    RAW.joinpath("ai_studios_list.html").write_text(html, encoding="utf-8")
    paths = sorted(
        set(re.findall(r'href="(/studios/[a-z0-9\-]+)"', html, re.I))
    )
    print("AI studio paths", len(paths))
    out = []
    for path in paths:
        url = "https://www.ai-fitness.de" + path
        slug = path.rstrip("/").split("/")[-1]
        try:
            page, _, _ = fetch(url)
            time.sleep(0.3)
        except Exception as e:
            print(" AI fail", url, e)
            continue
        RAW.joinpath(f"ai_{slug}.html").write_text(page, encoding="utf-8")
        name = ""
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
        if m:
            name = clean_text(m.group(1))
        if not name:
            name = f"all inclusive Fitness {slug.replace('-', ' ').title()}"

        addr = postal = city = ""
        lat = lng = None
        for jm in re.finditer(
            r'<script type="application/ld\+json">([\s\S]*?)</script>', page, re.I
        ):
            try:
                blob = json.loads(jm.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = a.get("streetAddress") or addr
                    postal = str(a.get("postalCode") or postal)
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)

        if not postal:
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()
            sm = re.search(
                r"((?:[A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee)[^<\n]{0,40}\d+[a-zA-Z]?))",
                page,
                re.I,
            )
            if sm:
                addr = clean_text(sm.group(1))

        # detect coming soon
        status = "VERIFIED_CURRENT"
        if re.search(r"coming\s*soon|demnä\w+st|öffnung|eroffnung|eröffnung", page, re.I):
            if re.search(r"bald|coming soon|demnä\w+st", page, re.I):
                status = "COMING_SOON"

        if not addr and not postal:
            continue

        out.append(
            row(
                "all inclusive Fitness",
                name,
                addr,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website=url,
                verification_status=status,
            )
        )
        if len(out) % 30 == 0:
            print("  AI scraped", len(out))
    print("AI rows", len(out))
    return out


# ---------------------------------------------------------------------------
# INJOY
# ---------------------------------------------------------------------------
def discover_injoy() -> list[dict]:
    print("=== INJOY ===")
    html, _, _ = fetch("https://www.injoy.de/fitnessstudios")
    RAW.joinpath("injoy_list.html").write_text(html, encoding="utf-8")
    # Contentful / embedded
    paths = sorted(
        set(
            re.findall(
                r'href="((?:https://www\.injoy\.de)?/fitnessstudios/[a-z0-9\-]+/?)"',
                html,
                re.I,
            )
        )
    )
    urls = []
    for p in paths:
        if p.rstrip("/").endswith("fitnessstudios"):
            continue
        urls.append(p if p.startswith("http") else "https://www.injoy.de" + p)
    urls = sorted(set(u.rstrip("/") for u in urls))
    print("INJOY URLs", len(urls))

    # Try contentful API if space id known from page
    space = re.search(r"images\.ctfassets\.net/([a-z0-9]+)/", html)
    # also look for JSON blobs
    out = []
    for url in urls:
        try:
            page, _, _ = fetch(url)
            time.sleep(0.35)
        except Exception as e:
            print(" injoy fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"injoy_{slug}.html").write_text(page, encoding="utf-8")
        name = ""
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
        if m:
            name = clean_text(m.group(1))
        if not name:
            name = f"INJOY {slug.replace('-', ' ').title()}"

        addr = postal = city = ""
        lat = lng = None
        for jm in re.finditer(
            r'<script type="application/ld\+json">([\s\S]*?)</script>', page, re.I
        ):
            try:
                blob = json.loads(jm.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = a.get("streetAddress") or addr
                    postal = str(a.get("postalCode") or postal)
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)

        if not postal:
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()
            sm = re.search(
                r"((?:[A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee)[^<\n]{0,40}\d+[a-zA-Z]?))",
                page,
                re.I,
            )
            if sm:
                addr = clean_text(sm.group(1))

        if not addr and not postal:
            continue
        out.append(
            row("INJOY", name, addr, postal, city, url, lat=lat, lng=lng, website=url)
        )
    print("INJOY rows", len(out))
    return out


# ---------------------------------------------------------------------------
# clever fit — store locator endpoints
# ---------------------------------------------------------------------------
def discover_clever_fit() -> list[dict]:
    print("=== clever fit ===")
    out = []
    # Try known storelocator patterns
    endpoints = [
        "https://www.clever-fit.com/de/wp-json/wp/v2/studio?per_page=100",
        "https://www.clever-fit.com/wp-json/wp/v2/studio?per_page=100",
        "https://www.clever-fit.com/de/wp-admin/admin-ajax.php?action=store_search&lat=51.1&lng=10.4&max_results=500&search_radius=2000&autoload=1",
        "https://www.clever-fit.com/wp-admin/admin-ajax.php?action=asl_load_stores",
        "https://www.clever-fit.com/de/?rest_route=/wp/v2/studio",
    ]
    for url in endpoints:
        try:
            body, final, headers = fetch(url)
            print(" clever endpoint", final[:100], "len", len(body), headers.get("Content-Type"))
            RAW.joinpath(
                "clever_ep_" + hashlib.md5(url.encode()).hexdigest()[:8] + ".txt"
            ).write_text(body[:200000], encoding="utf-8")
            if body.strip().startswith("[") or body.strip().startswith("{"):
                data = json.loads(body)
                SCRAPES.joinpath("clever_endpoint.json").write_text(
                    json.dumps(data, ensure_ascii=False)[:500000], encoding="utf-8"
                )
                items = data if isinstance(data, list) else data.get("stores") or data.get("data") or []
                print("  items", len(items) if hasattr(items, "__len__") else type(items))
        except Exception as e:
            print(" clever ep fail", url[:80], e)

    # Parse fitnessstudio page for iframe/API
    html, _, _ = fetch("https://www.clever-fit.com/de/fitnessstudio/")
    RAW.joinpath("clever_fitnessstudio.html").write_text(html, encoding="utf-8")
    for m in re.findall(r'https?://[^"\']+(?:store|studio|location|map)[^"\']*', html, re.I):
        if "google" in m or "facebook" in m:
            continue
        print(" clever link", m[:160])

    # Try storelocatorplus / wpsl AJAX common on DE franchise sites
    ajax_urls = [
        "https://www.clever-fit.com/de/wp-admin/admin-ajax.php?action=store_search&lat=52.52&lng=13.405&max_results=100&search_radius=500",
        "https://www.clever-fit.com/de/wp-admin/admin-ajax.php?action=get_stores",
    ]
    for url in ajax_urls:
        try:
            body, _, headers = fetch(url)
            print(" ajax", url[-40:], len(body), body[:80].replace("\n", " "))
            if body.strip().startswith("["):
                data = json.loads(body)
                print("  got list", len(data))
                if data:
                    SCRAPES.joinpath("clever_stores.json").write_text(
                        json.dumps(data, ensure_ascii=False), encoding="utf-8"
                    )
                    for s in data:
                        # WP Store Locator format
                        name = s.get("store") or s.get("name") or ""
                        address = s.get("address") or s.get("address2") or ""
                        if s.get("address2") and s.get("address"):
                            address = s.get("address")
                        postal = s.get("zip") or s.get("postal") or ""
                        city = s.get("city") or ""
                        lat = s.get("lat") or s.get("latitude")
                        lng = s.get("lng") or s.get("longitude")
                        # country filter
                        country = (s.get("country") or "").lower()
                        if country and country not in {"de", "deutschland", "germany", ""}:
                            continue
                        out.append(
                            row(
                                "clever fit",
                                name,
                                address,
                                str(postal),
                                city,
                                "https://www.clever-fit.com/de/fitnessstudio/",
                                lat=lat,
                                lng=lng,
                                website=s.get("url") or s.get("permalink") or "",
                            )
                        )
        except Exception as e:
            print(" ajax fail", e)

    print("clever fit rows so far", len(out))
    return out


# ---------------------------------------------------------------------------
# PRIME TIME / ELBGYM / jumpers
# ---------------------------------------------------------------------------
def discover_primetime() -> list[dict]:
    print("=== PRIME TIME ===")
    out = []
    for url in [
        "https://www.primetime-fitness.de/de/fitnessstudios",
        "https://www.primetime-fitness.de/de",
    ]:
        try:
            html, final, _ = fetch(url)
            RAW.joinpath("primetime_" + final.rstrip("/").split("/")[-1] + ".html").write_text(
                html, encoding="utf-8"
            )
            print(" PT page", final, len(html))
            # Only DE paths — exclude .ch
            links = set(
                re.findall(
                    r'href="(https://www\.primetime-fitness\.de/de/fitnessstudios/[^"#]+)"',
                    html,
                )
            )
            links |= {
                "https://www.primetime-fitness.de" + p
                for p in re.findall(
                    r'href="(/de/fitnessstudios/[a-z0-9\-/]+)"', html, re.I
                )
            }
            # filter switzerland
            links = {u for u in links if ".ch/" not in u and "/schweiz" not in u.lower()}
            print("  links", len(links))
            for u in sorted(links):
                if u.rstrip("/").endswith("fitnessstudios"):
                    continue
                try:
                    page, _, _ = fetch(u)
                    time.sleep(0.35)
                except Exception as e:
                    print("  fail", u, e)
                    continue
                slug = u.rstrip("/").split("/")[-1]
                RAW.joinpath(f"pt_{slug}.html").write_text(page, encoding="utf-8")
                name = ""
                m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
                if m:
                    name = clean_text(m.group(1))
                addr = postal = city = ""
                lat = lng = None
                for jm in re.finditer(
                    r'<script type="application/ld\+json">([\s\S]*?)</script>', page, re.I
                ):
                    try:
                        blob = json.loads(jm.group(1))
                    except Exception:
                        continue
                    items = blob if isinstance(blob, list) else [blob]
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        a = it.get("address")
                        if isinstance(a, dict):
                            # skip non-DE
                            cc = (a.get("addressCountry") or "").upper()
                            if cc and cc not in {"DE", "DEU", "GERMANY", "DEUTSCHLAND"}:
                                continue
                            addr = a.get("streetAddress") or addr
                            postal = str(a.get("postalCode") or postal)
                            city = a.get("addressLocality") or city
                        geo = it.get("geo")
                        if isinstance(geo, dict):
                            lat = geo.get("latitude", lat)
                            lng = geo.get("longitude", lng)
                if not postal:
                    m = re.search(
                        r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page
                    )
                    if m:
                        postal, city = m.group(1), m.group(2).strip()
                if not addr and not postal:
                    continue
                # Swiss postal also 4 digits — DE is 5; already filtered
                out.append(
                    row(
                        "PRIME TIME fitness",
                        name or f"PRIME TIME {slug}",
                        addr,
                        postal,
                        city,
                        u,
                        lat=lat,
                        lng=lng,
                        website=u,
                    )
                )
        except Exception as e:
            print("PT fail", url, e)
    print("PRIME TIME rows", len(out))
    return out


def discover_elbgym() -> list[dict]:
    print("=== ELBGYM ===")
    out = []
    for url in [
        "https://www.elbgym.de/",
        "https://elbgym.de/",
        "https://www.elbgym.de/studios",
        "https://www.elbgym.de/standorte",
        "https://www.fitnessfirst.de/elbgym",
    ]:
        try:
            # SSL issues — try unverified as last resort only for fetch of official site
            html, final, _ = fetch(url)
            print(" ELBGYM", final, len(html))
            RAW.joinpath("elbgym_" + hashlib.md5(url.encode()).hexdigest()[:6] + ".html").write_text(
                html, encoding="utf-8"
            )
            links = set(
                re.findall(r'href="([^"]*(?:studio|standort|club)[^"]*)"', html, re.I)
            )
            print("  links", list(links)[:20])
        except Exception as e:
            print(" ELBGYM fail", url, e)
    return out


def discover_jumpers() -> list[dict]:
    print("=== jumpers ===")
    out = []
    # May redirect to AI Fitness — document that
    for url in [
        "https://www.jumpers-fitness.com/",
        "https://www.jumpers-fitness.com/studios",
        "https://www.jumpers-fitness.de/",
        "https://jumpers-fitness.com/standorte",
    ]:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    **UA,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            with urllib.request.urlopen(req, context=ctx, timeout=40) as r:
                html = r.read().decode("utf-8", "replace")
                final = r.geturl()
            print(" jumpers", final, len(html))
            RAW.joinpath(
                "jumpers_" + hashlib.md5(url.encode()).hexdigest()[:6] + ".html"
            ).write_text(html, encoding="utf-8")
            if "ai-fitness" in final:
                print("  NOTE: jumpers redirects to all inclusive Fitness")
        except Exception as e:
            print(" jumpers fail", url, e)
    return out


def classify_row(r: dict) -> dict:
    """Assign import_category from verification + address completeness + coords."""
    if r.get("verification_status") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        return r
    if "possible_ems_only" in (r.get("notes") or ""):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW" if not r.get("address") else "NEEDS_COORDINATES"
        if not r.get("address") or not r.get("city"):
            r["import_category"] = "NEEDS_REVIEW"
        elif not r.get("postal_code"):
            r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        # official coords present — mark soft ready pending duplicate check
        r["import_category"] = "READY_TO_IMPORT"
        r["geocode_status"] = "ok_official"
    else:
        r["import_category"] = "NEEDS_COORDINATES"
        r["phase1_ready_for_geocode"] = True
    return r


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id = {}
    amb = []
    for r in rows:
        rid = r["id"]
        if rid in by_id:
            amb.append({"reason": "same_id", "a": by_id[rid]["name"], "b": r["name"], "id": rid})
            continue
        by_id[rid] = r
    # also brand+address key
    by_key = {}
    keep = []
    for r in by_id.values():
        key = (
            (r.get("brand") or "").lower(),
            re.sub(r"[^a-z0-9]+", "", (r.get("address") or "").lower()),
            r.get("postal_code") or "",
        )
        if key[1] and key in by_key:
            amb.append(
                {
                    "reason": "same_brand_address",
                    "a": by_key[key]["name"],
                    "b": r["name"],
                    "key": key,
                }
            )
            continue
        if key[1]:
            by_key[key] = r
        keep.append(r)
    return keep, amb


def main():
    all_rows: list[dict] = []
    discovery_notes = {}

    for fn, label in [
        (discover_rsg_magicline, "rsg"),
        (discover_easyfitness, "easyfitness"),
        (discover_fitx, "fitx"),
        (discover_fitness_first, "fitness_first"),
        (discover_ai_fitness, "ai_fitness"),
        (discover_injoy, "injoy"),
        (discover_clever_fit, "clever_fit"),
        (discover_primetime, "primetime"),
        (discover_elbgym, "elbgym"),
        (discover_jumpers, "jumpers"),
    ]:
        try:
            rows = fn()
            discovery_notes[label] = {"discovered": len(rows)}
            all_rows.extend(rows)
        except Exception as e:
            discovery_notes[label] = {"error": str(e)}
            print("FATAL chain", label, e)

    all_rows = [classify_row(r) for r in all_rows]
    keep, amb = dedupe_rows(all_rows)

    OUT.joinpath("germany_centers_staging.json").write_text(
        json.dumps(keep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    OUT.joinpath("germany_discovery_notes.json").write_text(
        json.dumps(
            {
                "notes": discovery_notes,
                "total_raw": len(all_rows),
                "total_deduped": len(keep),
                "by_brand": dict(Counter(r["brand"] for r in keep)),
                "by_category": dict(Counter(r["import_category"] for r in keep)),
                "internal_dupes": amb[:100],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("\nDONE staging", len(keep))
    print(Counter(r["brand"] for r in keep))
    print(Counter(r["import_category"] for r in keep))


if __name__ == "__main__":
    main()
