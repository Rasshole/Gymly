#!/usr/bin/env python3
"""
France Phase 1 — batch-fetch individual club pages for JSON-LD data.
Handles Basic-Fit (905 clubs) and L'Appart Fitness (116 clubs).
Uses concurrent requests with rate limiting.
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
OUT = ROOT / "data/france"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}
LOCK = Lock()
RATE_LOCK = Lock()
last_request_time = {"t": 0.0}


def log(*a):
    with LOCK:
        print(*a, flush=True)


def rate_limited_fetch(url: str, dest: Path, min_interval: float = 0.1) -> str:
    if dest.exists() and dest.stat().st_size > 200:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with RATE_LOCK:
        elapsed = time.time() - last_request_time["t"]
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        last_request_time["t"] = time.time()
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=40) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
            enc = "utf-8"
            m = re.search(r"charset=([^\s;]+)", ctype, re.I)
            if m:
                enc = m.group(1).strip("\"'")
            text = raw.decode(enc, errors="replace")
            if text:
                dest.write_text(text, encoding="utf-8")
            return text
    except Exception as e:
        return ""


def unescape(s: str) -> str:
    s = htmlmod.unescape(s or "")
    s = s.replace("\xa0", " ").replace("&#xA;", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fr_postal(s: str) -> str:
    if not s:
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


FR_METRO_BOUNDS = (41.3, 51.1, -5.2, 9.6)
FR_CORSICA = (41.4, 43.0, 8.5, 9.6)
FR_OVERSEAS = {
    "Guadeloupe": (15.8, 16.6, -62.0, -60.9),
    "Martinique": (14.3, 14.9, -61.3, -60.8),
    "Guyane": (2.1, 5.8, -54.6, -51.6),
    "Réunion": (-21.4, -20.8, 55.2, 55.9),
}


def in_france(lat, lng) -> bool:
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
    for bounds in FR_OVERSEAS.values():
        olo, ohi, ow, oe = bounds
        if olo <= lat <= ohi and ow <= lng <= oe:
            return True
    return False


def make_id(brand, address, postal, city):
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (postal or "").strip().lower(),
        (city or "").strip().lower(),
        "france",
    ])
    return "fr_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def extract_json_ld(html, country_filter=("FR", "FRANCE", "")):
    results = []
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
            a = n.get("address")
            if not isinstance(a, dict):
                continue
            cc = (a.get("addressCountry") or "").upper()
            if cc and cc not in country_filter:
                continue
            street = unescape(a.get("streetAddress") or "")
            postal = fr_postal(str(a.get("postalCode") or ""))
            city = unescape(a.get("addressLocality") or "")
            if not street and not city:
                continue
            geo = n.get("geo") or {}
            lat, lng = None, None
            if isinstance(geo, dict):
                try:
                    la = float(geo.get("latitude"))
                    lo = float(geo.get("longitude"))
                    if in_france(la, lo):
                        lat, lng = la, lo
                except (TypeError, ValueError):
                    pass
            nm = unescape(n.get("name") or "")
            url = n.get("url") or ""
            hours_raw = n.get("openingHoursSpecification") or []
            hours = None
            if hours_raw and isinstance(hours_raw, list):
                o, c = hours_raw[0].get("opens", ""), hours_raw[0].get("closes", "")
                if o == "00:00" and c == "24:00":
                    hours = "24/7"
            results.append({
                "name": nm, "street": street, "postal": postal, "city": city,
                "lat": lat, "lng": lng, "url": url, "hours": hours,
            })
    return results


def fetch_basicfit():
    """Fetch all Basic-Fit France club pages and extract JSON-LD."""
    urls_file = RAW / "basicfit_sitemap_urls.json"
    if not urls_file.exists():
        log("  ERROR: Run france-phase1-discover.py first to get sitemap URLs")
        return

    all_urls = json.loads(urls_file.read_text())
    club_urls = [u for u in all_urls if "/clubs/basic-fit-" in u]
    log(f"  Basic-Fit: {len(club_urls)} club URLs to process")

    rows = []
    processed = 0

    for club_url in club_urls:
        slug = club_url.split("/clubs/")[-1].replace(".html", "").replace("/", "__")
        dest = RAW / "pages" / "basicfit" / f"{slug}.html"
        html = rate_limited_fetch(club_url, dest, min_interval=0.08)
        processed += 1

        if not html:
            continue

        items = extract_json_ld(html)
        for item in items:
            if not item["street"]:
                continue
            nm = item["name"] or f"Basic-Fit {item['city']} {item['street']}"
            if not nm.lower().startswith("basic"):
                nm = f"Basic-Fit {nm}"
            coming = "coming-soon" in club_url.lower() or "opening" in club_url.lower()
            hours = item["hours"]
            if not hours and html and ("24/7" in html[:5000]):
                hours = "24/7"
            rid = make_id("Basic-Fit", item["street"], item["postal"], item["city"])
            rows.append({
                "id": rid, "brand": "Basic-Fit", "chain": "Basic-Fit",
                "name": nm, "center_name": nm,
                "address": item["street"], "postal_code": item["postal"] or None,
                "city": item["city"], "country": "France",
                "lat": item["lat"], "lng": item["lng"],
                "opening_hours": hours, "website": "https://www.basic-fit.com",
                "source_url": club_url, "verification_status": "COMING_SOON" if coming else "VERIFIED_CURRENT",
                "notes": "official_club_page_json_ld", "is_active": not coming,
                "import_category": "COMING_SOON" if coming else None,
                "phase": "france_phase1", "coord_source": "official_json_ld" if item["lat"] else None,
            })

        if processed % 100 == 0:
            log(f"    processed {processed}/{len(club_urls)}, extracted {len(rows)}")

    path = SCRAPES / "basicfit_france.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  Basic-Fit: wrote {len(rows)} clubs")
    return rows


def fetch_lappart():
    """Fetch L'Appart Fitness individual club pages."""
    index_html = (RAW / "lappart_clubs.html").read_text(encoding="utf-8", errors="replace") if (RAW / "lappart_clubs.html").exists() else ""
    club_urls = re.findall(r'(https://clubs\.lappartfitness\.com/\d+-[^\"<>\s#]+)', index_html)
    club_urls = sorted(set(u for u in club_urls if "#" not in u))
    log(f"  L'Appart Fitness: {len(club_urls)} club URLs")

    rows = []
    for i, club_url in enumerate(club_urls, 1):
        slug = club_url.split(".com/")[-1].replace("/", "_")
        dest = RAW / "pages" / "lappart" / f"{slug}.html"
        html = rate_limited_fetch(club_url, dest, min_interval=0.1)
        if not html:
            continue

        items = extract_json_ld(html)
        for item in items:
            if not item["street"]:
                continue
            nm = item["name"] or f"L'Appart Fitness {item['city']}"
            rid = make_id("L'Appart Fitness", item["street"], item["postal"], item["city"])
            rows.append({
                "id": rid, "brand": "L'Appart Fitness", "chain": "L'Appart Fitness",
                "name": nm, "center_name": nm,
                "address": item["street"], "postal_code": item["postal"] or None,
                "city": item["city"], "country": "France",
                "lat": item["lat"], "lng": item["lng"],
                "opening_hours": item["hours"], "website": "https://lappartfitness.com",
                "source_url": club_url, "verification_status": "VERIFIED_CURRENT",
                "notes": "official_club_page_json_ld", "is_active": True,
                "import_category": None, "phase": "france_phase1",
                "coord_source": "official_json_ld" if item["lat"] else None,
            })

        if i % 20 == 0:
            log(f"    processed {i}/{len(club_urls)}, extracted {len(rows)}")

    path = SCRAPES / "lappart_france.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  L'Appart Fitness: wrote {len(rows)} clubs")
    return rows


def main():
    t0 = time.time()
    log("=== FRANCE PHASE 1 — BATCH FETCH CLUB PAGES ===")
    log("")

    log("Basic-Fit")
    bf = fetch_basicfit()

    log("L'Appart Fitness")
    la = fetch_lappart()

    log("")
    log(f"DONE in {round(time.time() - t0)}s")
    if bf:
        log(f"  Basic-Fit: {len(bf)}")
    if la:
        log(f"  L'Appart Fitness: {len(la)}")


if __name__ == "__main__":
    main()
