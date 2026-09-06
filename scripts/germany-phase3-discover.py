#!/usr/bin/env python3
"""
Germany Phase 3 discovery: Kieser, Pfitzenmeier, ELEMENTS, Basic-Fit,
VeniceBeach; FitnessLOFT/wellyou research; targeted unresolved retries.

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/germany"
RAW = OUT / "raw" / "phase3"
SCRAPES = OUT / "scrapes"
PHASE3 = OUT / "phase3"
STAGING = OUT / "germany_centers_staging.json"

for p in (RAW, SCRAPES, PHASE3):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyGermanyResearch/3.0; +https://gymly.app)",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}
DE_BOUNDS = (47.0, 55.5, 5.5, 15.5)


def fetch(url: str, timeout: int = 45, insecure: bool = False) -> tuple[str, str]:
    c = ssl._create_unverified_context() if insecure else ctx
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=c, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def fetch_bytes(url: str, timeout: int = 45, insecure: bool = False) -> tuple[bytes, str]:
    c = ssl._create_unverified_context() if insecure else ctx
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=c, timeout=timeout) as r:
        return r.read(), r.geturl()


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def to_float(v):
    try:
        if v is None or v == "":
            return None
        f = float(v)
        return f if abs(f) > 0.01 else None
    except Exception:
        return None


def make_id(brand, address, postal, city):
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "germany",
        ]
    )
    return "de_" + hashlib.md5(key.encode()).hexdigest()[:10]


def in_de_bounds(lat, lng) -> bool:
    if lat is None or lng is None:
        return False
    lo, hi, w, e = DE_BOUNDS
    return lo <= lat <= hi and w <= lng <= e


def classify(addr, postal, city, lat, lng, status="VERIFIED_CURRENT"):
    if status == "CLOSED":
        return "CLOSED"
    if status == "COMING_SOON":
        return "COMING_SOON"
    has_addr = bool(addr and postal and city)
    has_coords = lat is not None and lng is not None and in_de_bounds(lat, lng)
    if has_addr and has_coords:
        return "READY_TO_IMPORT"
    if has_addr and not has_coords:
        return "NEEDS_COORDINATES"
    return "NEEDS_REVIEW"


def row(
    brand,
    name,
    address,
    postal,
    city,
    source_url,
    lat=None,
    lng=None,
    website=None,
    verification_status="VERIFIED_CURRENT",
    notes=None,
    coord_source=None,
    legacy_brand=None,
):
    lat_f, lng_f = to_float(lat), to_float(lng)
    return {
        "id": make_id(brand, address or "", postal or "", city or ""),
        "brand": brand,
        "name": name,
        "center_name": name,
        "address": address or "",
        "postal_code": str(postal or ""),
        "city": city or "",
        "country": "Germany",
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": None,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": verification_status,
        "legacy_brand": legacy_brand,
        "notes": notes,
        "is_active": False,
        "import_category": classify(address, postal, city, lat_f, lng_f, verification_status),
        "phase": "germany_phase3",
        "coord_source": coord_source if lat_f is not None else None,
        "phase3_ready_for_geocode": bool(address and postal and city and (lat_f is None or lng_f is None)),
    }


def parse_ld_json(html: str):
    items = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            blob = json.loads(m.group(1).strip())
        except Exception:
            continue
        if isinstance(blob, list):
            items.extend(blob)
        elif isinstance(blob, dict):
            if "@graph" in blob and isinstance(blob["@graph"], list):
                items.extend(blob["@graph"])
            else:
                items.append(blob)
    return items


# ---------------------------------------------------------------------------
# Kieser — official location_finder JSON on DE homepage
# ---------------------------------------------------------------------------
def discover_kieser() -> list[dict]:
    print("=== Kieser ===")
    # Qualification: machine-based strength training; members train independently
    # after intro. Physical check-in gym. INCLUDE.
    html, final = fetch("https://www.kieser.com/de-de/")
    RAW.joinpath("kieser_home.html").write_text(html, encoding="utf-8")
    m = re.search(
        r"window\.location_finder_studios = JSON\.stringify\((\{[\s\S]*?\})\);\s*</script>",
        html,
    )
    if not m:
        raise RuntimeError("Kieser location_finder JSON not found")
    studios = []
    for b in re.finditer(r"'(\d+)':\s*\{([^}]+)\}", m.group(1)):
        body = b.group(2)

        def g(k):
            mm = re.search(rf"'{k}':\s*'((?:\\'|[^'])*)'", body)
            return mm.group(1).replace("\\'", "'") if mm else ""

        studios.append(
            {
                "id": b.group(1),
                "name": g("name"),
                "lng": g("lng"),
                "lat": g("lat"),
                "city": g("city"),
                "plz": g("plz"),
                "street": g("street"),
                "country": g("country"),
                "detail_url": g("detail_url"),
            }
        )
    print("Kieser raw studios", len(studios), "country codes", set(s["country"] for s in studios))
    out = []
    for s in studios:
        # de-de finder is Germany-only (country code 1 on this locale)
        url = "https://www.kieser.com" + (s["detail_url"] or "/de-de/studios/")
        name = s["name"] or s["city"]
        if not name.lower().startswith("kieser"):
            name = f"Kieser {name}"
        out.append(
            row(
                "Kieser",
                name,
                s["street"],
                s["plz"],
                s["city"],
                url,
                lat=s["lat"],
                lng=s["lng"],
                website=url,
                notes=f"phase3_kieser_finder; kieser_id={s['id']}",
                coord_source="official_page",
            )
        )
    SCRAPES.joinpath("kieser_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    PHASE3.joinpath("kieser_qualification.json").write_text(
        json.dumps(
            {
                "include": True,
                "reason": (
                    "Kieser operates physical strength-training studios. Members perform "
                    "independent machine-based resistance training after an onboarding "
                    "session. Not EMS-only, not physiotherapy-only. Gymly-relevant."
                ),
                "official_de_count": len(out),
                "source": "https://www.kieser.com/de-de/ (location_finder_studios)",
            },
            indent=2,
        )
        + "\n"
    )
    print("Kieser saved", len(out), Counter(r["import_category"] for r in out))
    return out


# ---------------------------------------------------------------------------
# Pfitzenmeier — 8 owned Premium Resorts/Clubs (not partner VeniceBeach)
# ---------------------------------------------------------------------------
def discover_pfitzenmeier() -> list[dict]:
    print("=== Pfitzenmeier ===")
    html, _ = fetch("https://www.pfitzenmeier.de/kontakt/studios/")
    RAW.joinpath("pfitzen_kontakt.html").write_text(html, encoding="utf-8")
    out = []
    for m in re.finditer(
        r"<h5>\s*([^<]+?)\s*</h5>\s*<address>\s*<p>([\s\S]*?)</p>\s*</address>",
        html,
        re.I,
    ):
        title = clean(m.group(1))
        block = m.group(2)
        lines = [clean(x) for x in re.split(r"<br\s*/?>", block) if clean(re.sub(r"<[^>]+>", " ", x))]
        street = postal = city = ""
        lat = lng = None
        maps = re.search(r"/@(-?\d+\.\d+),(-?\d+\.\d+)", block)
        if maps:
            lat, lng = maps.group(1), maps.group(2)
        for line in lines:
            pm = re.match(r"(\d{5})\s+(.+)$", line)
            if pm:
                postal, city = pm.group(1), pm.group(2).strip()
            elif re.search(r"(straße|strasse|str\.|weg|platz|allee|allee)", line, re.I) or re.search(
                r"\d", line
            ):
                if not street and "google" not in line.lower() and "@" not in line and "tel:" not in line:
                    if not re.match(r"^\d[\d\s/]+$", line):  # skip phone
                        street = line
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        source = "https://www.pfitzenmeier.de/kontakt/studios/"
        concept = "Premium Resort" if "resort" in title.lower() else "Premium Club"
        name = title if title.lower().startswith("pfitzenmeier") else f"Pfitzenmeier {title}"
        out.append(
            row(
                "Pfitzenmeier",
                name,
                street,
                postal,
                city,
                source,
                lat=lat,
                lng=lng,
                website="https://www.pfitzenmeier.de/standorte/",
                notes=f"phase3_owned_club; concept={concept}; slug={slug}",
                coord_source="official_page" if lat else None,
            )
        )
    # fallback if regex missed
    if len(out) < 8:
        print(" Pfitzenmeier address-block count", len(out), "— scanning maps+postal")
    SCRAPES.joinpath("pfitzenmeier_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    PHASE3.joinpath("pfitzenmeier_concepts.json").write_text(
        json.dumps(
            {
                "owned_clubs": len(out),
                "concepts": ["Premium Resorts with AquaDome", "Premium Clubs (incl. MediFit)"],
                "partner_network_not_staged_as_pfitzenmeier": [
                    "VeniceBeach (separate brand — staged separately if discovered)",
                    "FitBase / FitCamp partner access mentioned on membership page",
                ],
                "note": (
                    "Official copy says 8 Pfitzenmeier studios. The '46 studios' claim is "
                    "membership network access, not 46 Pfitzenmeier-branded gyms."
                ),
            },
            indent=2,
        )
        + "\n"
    )
    print("Pfitzenmeier saved", len(out), Counter(r["import_category"] for r in out))
    for r in out:
        print(" ", r["name"], r["address"], r["postal_code"], r["city"])
    return out


# ---------------------------------------------------------------------------
# ELEMENTS Fitness & Wellness (Migros) — 7 official studios
# ---------------------------------------------------------------------------
def discover_elements() -> list[dict]:
    print("=== ELEMENTS ===")
    html, _ = fetch("https://www.elements.com/ueber-uns/")
    RAW.joinpath("el_ueber.html").write_text(html, encoding="utf-8")
    studios_html, _ = fetch("https://www.elements.com/studios/")
    RAW.joinpath("el_studios.html").write_text(studios_html, encoding="utf-8")
    url_by_key = {
        "balanstraße": "https://www.elements.com/balanstrasse/fitnessstudio-giesing/",
        "donnersbergerbrücke": "https://www.elements.com/donnersbergerbruecke/fitnessstudio-neuhausen/",
        "siemensallee": "https://www.elements.com/siemensallee/fitnessstudio-sendling/",
        "paulinenbrücke": "https://www.elements.com/paulinenbruecke/fitnessstudio-stuttgart/",
        "eschborn": "https://www.elements.com/fitnessstudio-eschborn/",
        "eschenheimer": "https://www.elements.com/eschenheimer-turm/fitnessstudio-frankfurt-innenstadt/",
        "henninger": "https://www.elements.com/henninger-turm/fitnessstudio-sachsenhausen/",
    }
    found = []
    for m in re.finditer(
        r'class="contact-form-address">([^<]+)<br\s*/?>\s*([^<]+)</p>',
        html,
        re.I,
    ):
        name = clean(m.group(1))
        addrline = clean(m.group(2))
        pm = re.match(r"(.+?),\s*(\d{5})\s+(.+)$", addrline)
        if not pm:
            continue
        street, postal, city = pm.group(1).strip(), pm.group(2), pm.group(3).strip()
        key = name.lower()
        url = "https://www.elements.com/studios/"
        for k, u in url_by_key.items():
            if k in key:
                url = u
                break
        found.append((name, street, postal, city, url))
    out = []
    for name, street, postal, city, url in found:
        lat = lng = None
        try:
            page, final = fetch(url)
            time.sleep(0.25)
            slug = url.rstrip("/").split("/")[-2] if url.count("/") > 4 else url.rstrip("/").split("/")[-1]
            RAW.joinpath(f"el_{slug[:40]}.html").write_text(page, encoding="utf-8")
            for it in parse_ld_json(page):
                if not isinstance(it, dict):
                    continue
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = to_float(geo.get("latitude")) or lat
                    lng = to_float(geo.get("longitude")) or lng
            if lat is None:
                mm = re.search(r'"latitude"\s*:\s*"?(-?\d+\.\d+)"?', page)
                if mm:
                    lat = to_float(mm.group(1))
            if lng is None:
                mm = re.search(r'"longitude"\s*:\s*"?(-?\d+\.\d+)"?', page)
                if mm:
                    lng = to_float(mm.group(1))
            url = final or url
        except Exception as e:
            print(" ELEMENTS page fail", url, e)
        display = name if name.upper().startswith("ELEMENTS") else f"ELEMENTS {name}"
        out.append(
            row(
                "ELEMENTS",
                display,
                street,
                postal,
                city,
                url,
                lat=lat,
                lng=lng,
                website=url,
                notes="phase3_elements_official; migros_freizeit_deutschland",
                coord_source="official_page" if lat else None,
            )
        )
    SCRAPES.joinpath("elements_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("ELEMENTS saved", len(out), Counter(r["import_category"] for r in out))
    return out


# ---------------------------------------------------------------------------
# Basic-Fit Germany (own brand, distinct from clever fit)
# ---------------------------------------------------------------------------
def discover_basic_fit() -> list[dict]:
    print("=== Basic-Fit ===")
    html, _ = fetch("https://www.basic-fit.com/de-de/club-finder?s=1&sz=200")
    RAW.joinpath("bf_finder200.html").write_text(html, encoding="utf-8")
    urls = sorted(
        {
            u.split("?")[0].rstrip("/")
            for u in re.findall(r"https://www\.basic-fit\.com/de-de/clubs/[^\"'\s]+", html)
            if u.endswith(".html") or "/clubs/" in u
        }
    )
    # also relative
    for h in re.findall(r'href="(/de-de/clubs/[^"]+\.html)"', html):
        urls.append("https://www.basic-fit.com" + h)
    urls = sorted(set(u.split("#")[0] for u in urls))
    print("Basic-Fit club URLs", len(urls))
    out = []
    for i, url in enumerate(urls):
        slug = url.rstrip("/").split("/")[-1].replace(".html", "")[:80]
        try:
            page, final = fetch(url)
            time.sleep(0.22)
        except Exception as e:
            print(" BF fail", url, e)
            continue
        RAW.joinpath(f"bf_{slug}.html").write_text(page, encoding="utf-8")
        name = addr = postal = city = ""
        lat = lng = None
        status = "VERIFIED_CURRENT"
        low = page[:12000].lower()
        if "zukünftiger club" in low or "coming soon" in low or "öffnet bald" in low or "opening soon" in low:
            status = "COMING_SOON"
        for it in parse_ld_json(page):
            if not isinstance(it, dict):
                continue
            if it.get("name"):
                name = clean(str(it["name"]))
            a = it.get("address")
            if isinstance(a, dict):
                country = str(a.get("addressCountry") or "")
                if country and country.upper() not in ("DE", "GERMANY", "DEUTSCHLAND", ""):
                    name = ""
                    break
                addr = clean(str(a.get("streetAddress") or addr))
                postal = str(a.get("postalCode") or postal)
                city = clean(str(a.get("addressLocality") or city))
            geo = it.get("geo")
            if isinstance(geo, dict):
                lat = to_float(geo.get("latitude"))
                lng = to_float(geo.get("longitude"))
        if not name:
            m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
            name = clean(m.group(1)) if m else f"Basic-Fit {slug}"
        if "basic-fit" not in name.lower() and "basic fit" not in name.lower():
            name = f"Basic-Fit {name}"
        if not postal:
            m = re.search(r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page)
            if m:
                postal, city = m.group(1), m.group(2).strip()
        if not addr and not postal:
            continue
        out.append(
            row(
                "Basic-Fit",
                name,
                addr,
                postal,
                city,
                final or url,
                lat=lat,
                lng=lng,
                website=final or url,
                verification_status=status,
                notes=f"phase3_basic_fit; slug={slug}",
                coord_source="official_page" if lat else None,
            )
        )
        if (i + 1) % 20 == 0:
            print(f"  Basic-Fit {i+1}/{len(urls)} kept {len(out)}")
    SCRAPES.joinpath("basic_fit_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Basic-Fit saved", len(out), Counter(r["import_category"] for r in out))
    return out


# ---------------------------------------------------------------------------
# VeniceBeach — regional conventional chain (Pfitzenmeier partner, own brand)
# ---------------------------------------------------------------------------
def discover_venicebeach() -> list[dict]:
    print("=== VeniceBeach ===")
    html, _ = fetch("https://www.venicebeach-fitness.de/clubs/")
    RAW.joinpath("vb_clubs.html").write_text(html, encoding="utf-8")
    hrefs = set()
    for h in re.findall(r'href="([^"]+)"', html):
        if "clubs/venicebeach" not in h:
            continue
        if h.startswith("/"):
            h = "https://www.venicebeach-fitness.de/" + h.lstrip("/")
        elif h.startswith("clubs/"):
            h = "https://www.venicebeach-fitness.de/" + h
        if any(x in h for x in ["/aktionen", "/team", "/kurse", "/galerie"]):
            continue
        hrefs.add(h.rstrip("/"))
    print("VeniceBeach club URLs", len(hrefs))
    out = []
    for i, url in enumerate(sorted(hrefs)):
        slug = url.rstrip("/").split("/")[-1].replace(".html", "")
        try:
            page, final = fetch(url)
            time.sleep(0.25)
        except Exception as e:
            print(" VB fail", url, e)
            continue
        RAW.joinpath(f"vb_{slug[:50]}.html").write_text(page, encoding="utf-8")
        name = addr = postal = city = ""
        lat = lng = None
        for it in parse_ld_json(page):
            if not isinstance(it, dict):
                continue
            if it.get("name"):
                name = clean(str(it["name"]))
            a = it.get("address")
            if isinstance(a, dict):
                addr = clean(str(a.get("streetAddress") or addr))
                postal = str(a.get("postalCode") or postal)
                city = clean(str(a.get("addressLocality") or city))
            geo = it.get("geo")
            if isinstance(geo, dict):
                lat = to_float(geo.get("latitude"))
                lng = to_float(geo.get("longitude"))
        if not name:
            m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
            name = clean(m.group(1)) if m else f"VeniceBeach {slug}"
        if "venice" not in name.lower():
            name = f"VeniceBeach {name}"
        maps = re.search(r"/@(-?\d+\.\d+),(-?\d+\.\d+)", page)
        if lat is None and maps:
            lat, lng = maps.group(1), maps.group(2)
        if not postal:
            m = re.search(r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", page)
            if m:
                postal, city = m.group(1), m.group(2).strip()
        if not addr:
            sm = re.search(
                r"([A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee)[^<\n]{0,40}\d+[a-zA-Z]?)",
                page,
                re.I,
            )
            if sm:
                addr = clean(sm.group(1))
        if not addr and not postal:
            continue
        concept = "VeniceBeach"
        if "lady" in url:
            concept = "VeniceBeach Lady"
        elif "plus" in url:
            concept = "VeniceBeach Plus"
        elif "supreme" in url:
            concept = "VeniceBeach Supreme"
        out.append(
            row(
                "VeniceBeach",
                name,
                addr,
                postal,
                city,
                final or url,
                lat=lat,
                lng=lng,
                website=final or url,
                notes=f"phase3_venicebeach; concept={concept}",
                coord_source="official_page" if lat else None,
            )
        )
        if (i + 1) % 10 == 0:
            print(f"  VeniceBeach {i+1}/{len(hrefs)} kept {len(out)}")
    SCRAPES.joinpath("venicebeach_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("VeniceBeach saved", len(out), Counter(r["import_category"] for r in out))
    return out


def research_fitnessloft_wellyou():
    notes = {
        "fitnessloft": {
            "current_brand": "Fitness First",
            "include_as_fitnessloft": False,
            "reason": (
                "fitnessloft.de redirects to fitnessfirst.de. LifeFit Group acquired "
                "FitnessLOFT (2023) and rebranded locations to Fitness First from 1 Oct 2023 "
                "(also smile X / In Shape). Stage under current brand Fitness First only."
            ),
        },
        "wellyou": {
            "include_attempted": True,
            "official_count_est": 41,
            "extraction": "INCOMPLETE",
            "reason": (
                "wellyou.de currently redirects to wellyou-shop.de (no studio directory). "
                "Basic-Fit completed acquisition of wellyou (41 clubs) on 2026-08-12 and "
                "intends to rebrand to Basic-Fit in coming months. Locations still operate "
                "as wellyou until rebrand; official locator was not extractable this pass."
            ),
        },
        "basic_fit_vs_clever_fit": (
            "Basic-Fit acquired clever fit (franchise) in Nov 2025 but clever fit remains "
            "the current operating brand at those locations. Own-brand Basic-Fit clubs are "
            "staged separately. Do not collapse the two brands."
        ),
        "elements_com_confusion": (
            "https://www.elements.com/de/ redirected to a detox microsite. Fitness brand "
            "is ELEMENTS Fitness & Wellness at https://www.elements.com/studios/ (7 clubs)."
        ),
    }
    PHASE3.joinpath("research_notes.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return notes


def main():
    started = datetime.now(timezone.utc).isoformat()
    results = {}
    results["kieser"] = {"count": len(discover_kieser())}
    results["pfitzenmeier"] = {"count": len(discover_pfitzenmeier())}
    results["elements"] = {"count": len(discover_elements())}
    results["basic_fit"] = {"count": len(discover_basic_fit())}
    results["venicebeach"] = {"count": len(discover_venicebeach())}
    results["research"] = research_fitnessloft_wellyou()
    results["started"] = started
    results["finished"] = datetime.now(timezone.utc).isoformat()
    PHASE3.joinpath("discovery_notes.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n"
    )
    print("Phase 3 discovery done")


if __name__ == "__main__":
    main()
