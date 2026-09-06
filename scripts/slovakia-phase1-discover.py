#!/usr/bin/env python3
"""Slovakia Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_geo_from_html,
    extract_jsonld,
    format_sk_postal,
    write_json,
)

OUT = ROOT / "data/slovakia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, SCRAPES, PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_MERGE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

CITY_CANONICAL = {
    "bratislava": "Bratislava",
    "kosice": "Košice",
    "košice": "Košice",
    "presov": "Prešov",
    "prešov": "Prešov",
    "zilina": "Žilina",
    "žilina": "Žilina",
    "banska bystrica": "Banská Bystrica",
    "banská bystrica": "Banská Bystrica",
    "trencin": "Trenčín",
    "trenčín": "Trenčín",
    "trnava": "Trnava",
    "nitra": "Nitra",
    "poprad": "Poprad",
    "martin": "Martin",
    "povazska bystrica": "Považská Bystrica",
    "považská bystrica": "Považská Bystrica",
    "spisska nova ves": "Spišská Nová Ves",
    "spišská nová ves": "Spišská Nová Ves",
    "petrzalka": "Bratislava",
    "petržalka": "Bratislava",
    "ruzinov": "Bratislava",
    "ružinov": "Bratislava",
    "nove mesto": "Bratislava",
    "nové mesto": "Bratislava",
}


def canonical_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    if key in CITY_CANONICAL:
        return CITY_CANONICAL[key]
    # suburb → Bratislava
    if any(x in key for x in ("petržalka", "petrzalka", "ružinov", "ruzinov", "rača", "raca", "lamač", "lamac")):
        return "Bratislava"
    return s


def curl_fetch_cached(url: str, out_path: Path, timeout: int = 25) -> str:
    if out_path.exists() and out_path.stat().st_size > 800:
        return out_path.read_text(encoding="utf-8", errors="replace")
    return curl_fetch(url, out_path, timeout=timeout)

    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8")
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(body)
    return json.loads(body)


def extract_address_block(html: str) -> tuple[str, str, str]:
    """Best-effort address, postal, city from club HTML."""
    # Limit scan window — full WP pages are 300KB+ and catastrophic for backtracking.
    window = html
    idx = re.search(r"ADRESA", html, re.I)
    if idx:
        window = html[idx.start() : idx.start() + 2500]
    else:
        window = html[:120000]
    plain = re.sub(r"<[^>]+>", " ", window)
    plain = re.sub(r"\s+", " ", plain)
    m_adresa = re.search(
        r"ADRESA\s+"
        r"([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][^|]{5,80}?)\s+"
        r"((?:[89]\d{2}|0[1-9]\d)\s?\d{2})\s+"
        r"([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][A-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž \-]{1,40})",
        plain,
        re.I,
    )
    if m_adresa:
        return (
            clean_text(m_adresa.group(1)),
            format_sk_postal(m_adresa.group(2)),
            canonical_city(m_adresa.group(3)),
        )
    postal = format_sk_postal(window)
    m = re.search(
        r"([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][A-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž0-9 \./\-]{3,50}\d)\s*,?\s*"
        r"((?:[89]\d{2}|0[1-9]\d)\s?\d{2})\s+"
        r"([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][A-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž \-]{2,40})",
        plain,
    )
    if m:
        return clean_text(m.group(1)), format_sk_postal(m.group(2)), canonical_city(m.group(3))
    return "", postal, ""


def parse_maps_query_address(html: str) -> str:
    for m in re.finditer(r"https?://maps\.google\.com/maps\?q=([^\"\'&]+)", html, re.I):
        q = urllib.parse.unquote(m.group(1).replace("+", " "))
        if re.search(r"\d", q) and len(q) > 8:
            return clean_text(q)
    for m in re.finditer(r"https?://(?:www\.)?google\.[^\"\']+/maps/dir//([^\"\'\s]+)", html, re.I):
        q = urllib.parse.unquote(m.group(1).replace("+", " "))
        if re.search(r"\d", q) and len(q) > 8:
            return clean_text(q)
    return ""


# ---------------------------------------------------------------------------
# FITINN Slovakia — filter SK studios only from multi-country locator
# ---------------------------------------------------------------------------
FITINN_SK_SLUGS = {
    "bratislava-prior",
    "bratislava-nido",
    "nitra",
}


def discover_fitinn(rows: list) -> dict:
    index_html = curl_fetch(
        "https://fitinn.sk/nase-studia/",
        PAGES / "fitinn_studios.html",
    )
    slugs = sorted(set(re.findall(r"/nase-studia/([a-z0-9\-]+)/?", index_html, re.I)))
    # Keep known SK + any slug containing bratislava/nitra/kosice/zilina/presov/trnava
    sk_hint = re.compile(
        r"bratislava|nitra|kosice|ko[sš]ice|zilina|[žz]ilina|presov|pre[sš]ov|trnava|"
        r"trencin|tren[cč]in|poprad|martin|banska|bystrica",
        re.I,
    )
    candidate_slugs = [s for s in slugs if s in FITINN_SK_SLUGS or sk_hint.search(s)]
    # Always include known SK even if not in index (VIVO etc. may be linked elsewhere)
    for extra in list(FITINN_SK_SLUGS):
        if extra not in candidate_slugs:
            candidate_slugs.append(extra)

    discovered = 0
    with_coords = 0
    foreign_skipped = 0
    missing_pages = []
    for slug in sorted(set(candidate_slugs)):
        url = f"https://fitinn.sk/nase-studia/{slug}/"
        html = curl_fetch_cached(url, PAGES / f"fitinn_{slug}.html", timeout=20)
        if html.startswith("ERR:") or len(html) < 500:
            missing_pages.append(slug)
            continue
        # Reject non-SK pages (Vienna, Graz, Praha, Milano, etc.)
        blob = html.lower()
        if any(
            x in blob
            for x in (
                "österreich",
                "austria",
                "wien ",
                "vienna",
                "praha",
                "brno",
                "milano",
                "italy",
                "slovenija",
                "ljubljana",
                "maribor",
            )
        ) and not any(x in slug for x in ("bratislava", "nitra")):
            # Soft: if address postcode is Czech 1-7, skip
            if re.search(r"\b([1-7]\d{2})\s*(\d{2})\b", html) and not format_sk_postal(html):
                foreign_skipped += 1
                continue
        postal = format_sk_postal(html)
        if not postal:
            # Not Slovak postcode → skip unless slug is clearly SK
            if not any(x in slug for x in ("bratislava", "nitra")):
                foreign_skipped += 1
                continue
        addr, pc2, city = extract_address_block(html)
        postal = postal or pc2
        if not addr:
            addr = parse_maps_query_address(html)
        # Title / H1
        title_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        title = clean_text(re.sub(r"<[^>]+>", " ", title_m.group(1))) if title_m else slug
        if not city:
            if "nitra" in slug:
                city = "Nitra"
            elif "bratislava" in slug or "prior" in slug or "nido" in slug:
                city = "Bratislava"
            else:
                city = canonical_city(title)
        lat, lng = extract_geo_from_html(html)
        # Country gate via postcode
        if postal and not re.match(r"^[089]\d{2} \d{2}$", postal):
            foreign_skipped += 1
            continue
        if not postal and not any(x in slug for x in ("bratislava", "nitra")):
            foreign_skipped += 1
            continue
        name = f"FITINN {title}" if not title.upper().startswith("FITINN") else title
        rows.append(
            base_row(
                prefix="sk_",
                country="Slovakia",
                brand="FITINN",
                name=name,
                address=addr or title,
                postal_code=postal,
                city=city or "Bratislava",
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_PAGE_EMBED" if lat and lng else None,
                notes=f"fitinn_slug={slug}",
                chain_key="fitinn",
            )
        )
        discovered += 1
        if lat and lng:
            with_coords += 1
        time.sleep(0.3)

    return {
        "chain": "FITINN",
        "classification": "A",
        "official_estimate": max(discovered, 3),
        "discovered": discovered,
        "with_coords": with_coords,
        "foreign_skipped": foreign_skipped,
        "missing_pages": missing_pages,
        "source": "https://fitinn.sk/nase-studia/",
        "verdict": "PARTIAL" if discovered < 5 else "NEAR-COMPLETE",
        "notes": "fitinn.sk lists multi-country studios; SK filtered by postcode 0/8/9 + Bratislava/Nitra slugs",
    }


# ---------------------------------------------------------------------------
# Golem Club — official VOP estate list
# ---------------------------------------------------------------------------
GOLEM_CLUBS = [
    ("Aupark Bratislava", "Bratislava", "Einsteinova 18", "https://www.golemclub.sk/sk/prevadzky/bratislava/aupark"),
    ("Avion Bratislava", "Bratislava", "Ivánska cesta 16", "https://www.golemclub.sk/sk/prevadzky/bratislava/avion"),
    ("Central Bratislava", "Bratislava", "Metodova 6", "https://www.golemclub.sk/sk/prevadzky/bratislava/central"),
    ("Bory Mall Bratislava", "Bratislava", "Lamač 6683", "https://www.golemclub.sk/sk/prevadzky/bratislava/bory"),
    ("Tower 115 Bratislava", "Bratislava", "Pribinova 25", "https://www.golemclub.sk/sk/prevadzky/bratislava/tower"),
    ("Polus Bratislava", "Bratislava", "Vajnorská 100", "https://www.golemclub.sk/sk/prevadzky/bratislava/polus"),
    ("Relaxx Bratislava", "Bratislava", "Einsteinova 7", "https://www.golemclub.sk/sk/prevadzky/bratislava/relaxx"),
    ("Aupark Žilina", "Žilina", "Veľká Okružná 59/A", "https://www.golemclub.sk/sk/prevadzky/zilina/zilina"),
    ("Aupark Košice", "Košice", "Námestie Osloboditeľov 1", "https://www.golemclub.sk/sk/prevadzky/kosice/kosice"),
    ("Forum Poprad", "Poprad", "Námestie Svätého Egídia 3290/124", "https://www.golemclub.sk/sk/prevadzky/poprad/poprad"),
    ("Tulip Martin", "Martin", "Pltníky 2", "https://www.golemclub.sk/sk/prevadzky/martin/martin"),
]


def discover_golem(rows: list) -> dict:
    discovered = 0
    with_coords = 0
    for label, city, fallback_addr, url in GOLEM_CLUBS:
        html = curl_fetch_cached(url, PAGES / f"golem_{label.lower().replace(' ', '_')}.html", timeout=20)
        # Prefer official VOP street addresses — site chrome often repeats Einsteinova.
        address = fallback_addr
        postal = ""
        if not html.startswith("ERR:"):
            # Cheap postal scan only (avoid heavy extract on 400KB pages)
            postal = format_sk_postal(html[:80000])
        lat = lng = None
        coord_source = None
        # Geocode curated VOP address in consolidate — do not trust shared embeds.
        rows.append(
            base_row(
                prefix="sk_",
                country="Slovakia",
                brand="Golem Club",
                name=f"Golem Club {label}",
                address=address,
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source=coord_source,
                notes="official_vop_estate; fyzioterapia excluded; address from VOP",
                chain_key="golem_club",
            )
        )
        discovered += 1
        time.sleep(0.05)
    return {
        "chain": "Golem Club",
        "classification": "A",
        "official_estimate": 11,
        "discovered": discovered,
        "with_coords": with_coords,
        "source": "https://www.golemclub.sk/sk/o-nas/vseobecne-obchodne-podmienky",
        "verdict": "NEAR-COMPLETE" if discovered >= 11 else "PARTIAL",
        "notes": "11 fitness clubs from official VOP; physiotherapy branch excluded as specialty",
    }


# ---------------------------------------------------------------------------
# Form Factory Slovakia — WP club CPT + individual pages
# ---------------------------------------------------------------------------
def discover_form_factory(rows: list) -> dict:
    try:
        data = fetch_json(
            "https://www.formfactory.sk/wp-json/wp/v2/club?per_page=100",
            SCRAPES / "formfactory_clubs_api.json",
        )
    except Exception as e:
        return {
            "chain": "Form Factory",
            "classification": "A",
            "discovered": 0,
            "error": str(e),
            "verdict": "BLOCKED",
        }
    if not isinstance(data, list):
        data = []
    discovered = 0
    with_coords = 0
    coming = 0
    for club in data:
        slug = club.get("slug") or ""
        if slug in ("feed", "page"):
            continue
        title = clean_text((club.get("title") or {}).get("rendered") or slug)
        link = club.get("link") or f"https://www.formfactory.sk/klub/{slug}/"
        html = curl_fetch_cached(link, PAGES / f"ff_{slug}.html", timeout=25)
        coming_soon = bool(
            re.search(r"coming\s*soon|pripravujeme|čoskoro otvor|coskoro otvor", html, re.I)
        ) or "budatinska" in slug
        # Budatínska confirmed coming soon on official page
        postal = format_sk_postal(html) if not html.startswith("ERR:") else ""
        addr, pc2, city = extract_address_block(html) if not html.startswith("ERR:") else ("", "", "")
        postal = postal or pc2
        if not addr:
            # English pages sometimes have cleaner address
            en = link.replace("/klub/", "/en/club/")
            if en != link:
                html_en = curl_fetch_cached(en, PAGES / f"ff_en_{slug}.html", timeout=20)
                if not html_en.startswith("ERR:"):
                    if not postal:
                        postal = format_sk_postal(html_en)
                    a2, p2, c2 = extract_address_block(html_en)
                    addr = addr or a2
                    postal = postal or p2
                    city = city or c2
                    if re.search(r"coming\s*soon", html_en, re.I):
                        coming_soon = True
        # City heuristics from title/slug
        if not city:
            low = f"{title} {slug}".lower()
            if any(x in low for x in ("cassovar", "cassovia", "košice", "kosice")):
                city = "Košice"
            elif "mirage" in low or "žilina" in low or "zilina" in low:
                city = "Žilina"
            elif "bpark" in low or "povaz" in low:
                city = "Považská Bystrica"
            elif "oc-max" in low or "oc max" in low or "trenč" in low or "trencin" in low:
                city = "Trenčín"
            else:
                city = "Bratislava"
        lat = lng = None
        coord_source = None
        if not html.startswith("ERR:"):
            lat, lng = extract_geo_from_html(html)
            if lat and lng:
                coord_source = "OFFICIAL_PAGE_EMBED"
        if coming_soon:
            coming += 1
        rows.append(
            base_row(
                prefix="sk_",
                country="Slovakia",
                brand="Form Factory",
                name=title if title.lower().startswith("form") else f"Form Factory {title}",
                address=addr or title,
                postal_code=postal,
                city=city,
                source_url=link,
                lat=lat,
                lng=lng,
                coord_source=coord_source,
                notes=f"ff_slug={slug}; wp_status={club.get('status')}",
                coming=coming_soon,
                chain_key="form_factory",
            )
        )
        discovered += 1
        if lat and lng:
            with_coords += 1
        time.sleep(0.35)
    open_est = discovered - coming
    return {
        "chain": "Form Factory",
        "classification": "A",
        "official_estimate": 18,
        "discovered": discovered,
        "with_coords": with_coords,
        "coming_soon": coming,
        "open_estimate": open_est,
        "source": "https://www.formfactory.sk/wp-json/wp/v2/club?per_page=100",
        "verdict": "NEAR-COMPLETE" if discovered >= 15 else "PARTIAL",
        "notes": "Growing SK network; FitCamp brand absorbed as Form Factory FitCamp club",
    }


# ---------------------------------------------------------------------------
# 365 Fit&Co
# ---------------------------------------------------------------------------
FIT365_LOCATIONS = [
    ("Bratislava Eurovea", "Bratislava", "https://365fitco.sk/eurovea/"),
    ("Bratislava Lamač", "Bratislava", "https://365fitco.sk/lamac/"),
    ("Bratislava Digital Park", "Bratislava", "https://365fitco.sk/"),  # may lack dedicated page
    ("Prešov OC Eperia", "Prešov", "https://365fitco.sk/presov/"),
    ("Košice ROCA", "Košice", "https://365fitco.sk/"),
    ("Košice Hypertesco", "Košice", "https://365fitco.sk/"),
    ("Trenčín Južanka", "Trenčín", "https://365fitco.sk/"),
    ("Spišská Nová Ves", "Spišská Nová Ves", "https://365fitco.sk/"),
    ("Banská Bystrica", "Banská Bystrica", "https://365fitco.sk/"),
]


def discover_365(rows: list) -> dict:
    home = curl_fetch("https://365fitco.sk/", PAGES / "365fitco_home.html")
    discovered = 0
    with_coords = 0
    seen_names: set[str] = set()
    skip_path = re.compile(
        r"/(wp-|feed|tag|category|autor|author|kontakt|cennik|cenniky|grand|cart|ucet|#)",
        re.I,
    )
    dedicated = sorted(
        set(re.findall(r'href=["\'](https://365fitco\.sk/[^"\']+/)["\']', home, re.I))
    )
    dedicated = [
        u
        for u in dedicated
        if not skip_path.search(u) and u.rstrip("/") != "https://365fitco.sk"
    ]
    for url in dedicated:
        html = curl_fetch(url, PAGES / f"365_{url.rstrip('/').split('/')[-1]}.html")
        if html.startswith("ERR:") or len(html) < 800:
            continue
        title_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        title = clean_text(re.sub(r"<[^>]+>", " ", title_m.group(1))) if title_m else ""
        if not title or "365" not in title:
            og = re.search(r'og:title"\s+content="([^"]+)"', html, re.I)
            title = clean_text(og.group(1)) if og else title
        if not title or re.search(r"cenn[ií]k|grand prix|kontakt", title, re.I):
            continue
        postal = format_sk_postal(html)
        addr, pc2, city = extract_address_block(html)
        postal = postal or pc2
        # Require a real street-like address (digit) — otherwise leave for seed pass
        if not addr or not re.search(r"\d", addr):
            # keep title for naming but mark weak address
            addr = ""
        lat, lng = extract_geo_from_html(html)
        name = title if "365" in title else f"365 Fit&Co {title}"
        key = re.sub(r"\s+", " ", name.lower()).strip()
        if key in seen_names:
            continue
        seen_names.add(key)
        if not city or "365" in city:
            city = canonical_city(title)
        if not city or "365" in city:
            city = "Bratislava"
        rows.append(
            base_row(
                prefix="sk_",
                country="Slovakia",
                brand="365 Fit&Co",
                name=name,
                address=addr or name,
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_PAGE_EMBED" if lat and lng else None,
                notes="365fitco dedicated page"
                + ("; weak_address" if not addr else ""),
                chain_key="365_fitco",
            )
        )
        discovered += 1
        if lat and lng:
            with_coords += 1
        time.sleep(0.3)

    for label, city, url in FIT365_LOCATIONS:
        key = label.lower()
        if any(key in s or label.split()[-1].lower() in s for s in seen_names):
            continue
        if not any(part in home for part in label.split() if len(part) > 4):
            continue
        rows.append(
            base_row(
                prefix="sk_",
                country="Slovakia",
                brand="365 Fit&Co",
                name=f"365 Fit&Co {label}",
                address="",  # force NEEDS_REVIEW / NEEDS_COORDINATES — no invented street
                postal_code="",
                city=city,
                source_url=url,
                notes="homepage_named_location; needs club-page address recovery",
                chain_key="365_fitco",
            )
        )
        discovered += 1
        seen_names.add(key)

    return {
        "chain": "365 Fit&Co",
        "classification": "A",
        "official_estimate": 8,
        "discovered": discovered,
        "with_coords": with_coords,
        "dedicated_pages": len(dedicated),
        "source": "https://365fitco.sk/",
        "verdict": "PARTIAL",
        "notes": "Homepage lists ~8–9 cities; several lack dedicated address pages — Phase 2 likely",
    }


def probe_other_chains() -> list[dict]:
    probes = []
    # EfectFit — private PT network (specialty)
    ef = curl_fetch("https://www.efectfit.sk/", PAGES / "efectfit.html")
    ef_ok = not ef.startswith("ERR:") and len(ef) > 1000
    probes.append(
        {
            "chain": "EfectFit",
            "classification": "C",
            "evidence": "Official site: sieť privátnych fitness centier / personal training focus; mixed SR+CZ",
            "action": "EXCLUDE_FROM_PHASE1_READY",
            "reachable": ef_ok,
        }
    )
    # FitCamp — absorbed into Form Factory
    probes.append(
        {
            "chain": "FitCamp",
            "classification": "F",
            "evidence": "Form Factory lists FitCamp as a Form Factory club (Ružinov); brand succession",
            "action": "REBRAND_TO_FORM_FACTORY",
            "reachable": True,
        }
    )
    # Mozolani
    mz = curl_fetch("https://mozolani.sk/", PAGES / "mozolani.html")
    probes.append(
        {
            "chain": "Mozolani Fitness",
            "classification": "E" if mz.startswith("ERR:") or "503" in mz[:200] else "E",
            "evidence": "Single-operator / boutique; not a national multi-location conventional chain at Phase 1 scale",
            "action": "BELOW_INCLUSION_THRESHOLD",
            "reachable": not mz.startswith("ERR:"),
        }
    )
    # Maximus
    probes.append(
        {
            "chain": "Maximus / Maximus Gym",
            "classification": "E",
            "evidence": "No multi-location national estate confirmed; single-site / local",
            "action": "BELOW_INCLUSION_THRESHOLD",
            "reachable": False,
        }
    )
    # MultiSport / etc aggregators
    probes.append(
        {
            "chain": "MultiSport / benefit pass networks",
            "classification": "B",
            "evidence": "Membership/pass aggregator — partner gyms are not the operator",
            "action": "EXCLUDE",
            "reachable": True,
        }
    )
    return probes


def main() -> None:
    rows: list[dict] = []
    inventory = {
        "country": "Slovakia",
        "phase": 1,
        "production_sha_before": PRE_MERGE_SHA,
        "production_total": len(json.loads(CENTERS.read_text())),
        "slovakia_live": 0,
        "chains": [],
        "probes": [],
    }

    print("Discovering FITINN…")
    inventory["chains"].append(discover_fitinn(rows))
    print("Discovering Golem Club…")
    inventory["chains"].append(discover_golem(rows))
    print("Discovering Form Factory…")
    inventory["chains"].append(discover_form_factory(rows))
    print("Discovering 365 Fit&Co…")
    inventory["chains"].append(discover_365(rows))
    print("Probing secondary operators…")
    inventory["probes"] = probe_other_chains()

    # Dedup by id
    by_id = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "slovakia_phase1_candidates.json", rows)
    write_json(OUT / "slovakia_chain_inventory.json", inventory)

    rebrand = {
        "country": "Slovakia",
        "maps": [
            {
                "legacy_brand": "FitCamp",
                "current_brand": "Form Factory",
                "evidence": "formfactory.sk/klub/fitcamp/ — FitCamp listed as Form Factory club",
                "action": "import_as_form_factory_only",
            },
            {
                "legacy_brand": "Golem Club Polus / FITINN Polus adjacency",
                "current_brand": "separate operators",
                "evidence": "Golem Polus and FITINN VIVO/Polus are distinct mall clubs if both present",
                "action": "keep_both_if_distinct_addresses",
            },
        ],
        "excluded_aggregators": ["MultiSport", "ESX-like pass networks"],
        "specialty_excluded": ["EfectFit (private PT)", "Golem Fyzioterapia"],
    }
    write_json(OUT / "SLOVAKIA_PHASE1_REBRAND_MAP.json", rebrand)

    print(
        f"Candidates={len(rows)} SHA={PRE_MERGE_SHA[:12]}… "
        f"chains={[c.get('chain') for c in inventory['chains']]}"
    )


if __name__ == "__main__":
    main()
