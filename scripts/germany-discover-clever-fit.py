#!/usr/bin/env python3
"""Discover clever fit DE studios from official studio-sitemap + studio pages."""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.request
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
    "User-Agent": "Mozilla/5.0 (compatible; GymlyGermanyResearch/1.0)",
    "Accept": "text/html,application/xml",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def make_id(brand, address, postal, city):
    key = "|".join(
        [
            brand.strip().lower(),
            address.strip().lower(),
            postal.strip().lower(),
            city.strip().lower(),
            "germany",
        ]
    )
    return "de_" + hashlib.md5(key.encode()).hexdigest()[:10]


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def main():
    xml = fetch("https://www.clever-fit.com/studio-sitemap.xml")
    RAW.joinpath("clever_studio_sitemap.xml").write_text(xml, encoding="utf-8")
    locs = [
        u
        for u in re.findall(r"<loc>([^<]+)</loc>", xml)
        if "/de/fitnessstudio/" in u and u.rstrip("/").count("/") >= 5
    ]
    # exclude the hub page itself
    locs = [u for u in locs if not u.rstrip("/").endswith("/fitnessstudio")]
    print("clever studio URLs", len(locs))

    # Country filter: exclude known non-DE path prefixes if any
    # clever-fit.com/de/ is Germany site; AT/CH may be other domains
    rows = []
    for i, url in enumerate(locs):
        try:
            html = fetch(url)
            time.sleep(0.25)
        except Exception as e:
            print("fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"clever_{slug[:70]}.html").write_text(html, encoding="utf-8")

        name = ""
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html, re.I)
        if m:
            name = clean(m.group(1))
        if not name:
            name = f"clever fit {slug.replace('-', ' ').title()}"

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
                    cc = str(a.get("addressCountry") or "").upper()
                    if cc and cc not in {"DE", "DEU", "GERMANY", "DEUTSCHLAND", ""}:
                        continue
                    addr = a.get("streetAddress") or addr
                    postal = str(a.get("postalCode") or postal)
                    city = a.get("addressLocality") or city
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = geo.get("latitude", lat)
                    lng = geo.get("longitude", lng)

        if not postal:
            # "Chiemgaustraße 148 81549 München"
            m = re.search(
                r"([A-Za-zÄÖÜäöüß0-9 .,\-]{5,80}?)\s+(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})",
                clean(html),
            )
            # Prefer near "Studio Adresse" / Öffnungszeiten block
            block = ""
            for label in ["Studio Adresse", "Adresse", "Öffnungszeiten"]:
                idx = html.find(label)
                if idx >= 0:
                    block = clean(html[idx : idx + 500])
                    break
            m2 = re.search(
                r"([A-Za-zÄÖÜäöüß0-9 .,\-]{5,80}?)\s+(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})",
                block,
            )
            if m2:
                addr, postal, city = m2.group(1).strip(), m2.group(2), m2.group(3).strip()
            elif m:
                addr, postal, city = m.group(1).strip(), m.group(2), m.group(3).strip()

        # Filter non-German postals / cities if country markers present
        if re.search(r"Österreich|Switzerland|Schweiz|Austria|\.at\b|\.ch\b", html[:3000], re.I):
            # still might be DE studio page mentioning neighbors — only skip if postal looks AT (4 digit) 
            pass
        if postal and not re.fullmatch(r"\d{5}", postal):
            continue
        if not addr and not postal:
            continue

        # coords from maps query
        mq = re.search(r"maps\.google[^\"']*[?&]q=([-+0-9.]+),([-+0-9.]+)", html)
        if mq and lat is None:
            lat, lng = float(mq.group(1)), float(mq.group(2))
        mq = re.search(r"@([-+0-9.]+),([-+0-9.]+)", html)
        if mq and lat is None:
            lat, lng = float(mq.group(1)), float(mq.group(2))

        status = "VERIFIED_CURRENT"
        if re.search(r"coming soon|demnä\w+st|bald eröff|eröffnung", html, re.I):
            status = "COMING_SOON"

        has_coords = lat is not None and lng is not None
        # DE bbox sanity
        if has_coords and not (47.0 <= float(lat) <= 55.5 and 5.5 <= float(lng) <= 15.5):
            lat = lng = None
            has_coords = False

        row = {
            "id": make_id("clever fit", addr, postal, city),
            "brand": "clever fit",
            "name": name if name.lower().startswith("clever") else f"clever fit {name}",
            "center_name": name,
            "address": addr,
            "postal_code": postal,
            "city": city,
            "country": "Germany",
            "lat": float(lat) if has_coords else None,
            "lng": float(lng) if has_coords else None,
            "opening_hours": None,
            "website": url,
            "source_url": url,
            "verification_status": status,
            "legacy_brand": None,
            "notes": None,
            "is_active": False,
            "import_category": (
                "COMING_SOON"
                if status == "COMING_SOON"
                else (
                    "READY_TO_IMPORT"
                    if has_coords and addr and postal and city
                    else ("NEEDS_COORDINATES" if addr and postal and city else "NEEDS_REVIEW")
                )
            ),
            "phase": "germany_phase1",
            "coord_source": "official_page" if has_coords else None,
            "phase1_ready_for_geocode": bool(addr and postal and city and not has_coords),
        }
        rows.append(row)
        if (i + 1) % 50 == 0:
            print(f"  scraped {i+1}/{len(locs)} kept={len(rows)}")

    SCRAPES.joinpath("clever_fit_germany.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("clever fit DE rows", len(rows))
    print(
        "with coords",
        sum(1 for r in rows if r["lat"] is not None),
        "ready",
        sum(1 for r in rows if r["import_category"] == "READY_TO_IMPORT"),
    )


if __name__ == "__main__":
    main()
