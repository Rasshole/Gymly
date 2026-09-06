#!/usr/bin/env python3
"""
Germany Phase 2 discovery: close FitX / INJOY / ELBGYM / Gold's gaps,
audit Fitness First + jumpers, sanity-check other chains, note additional chains.

Does NOT modify src/data/centers.json.
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
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/germany"
RAW = OUT / "raw" / "phase2"
SCRAPES = OUT / "scrapes"
PHASE2 = OUT / "phase2"
NOTES = PHASE2 / "discovery_notes.json"

for p in (RAW, SCRAPES, PHASE2):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyGermanyResearch/2.0; +https://gymly.app)",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


def fetch(url: str, timeout: int = 45) -> tuple[str, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def fetch_bytes(url: str, timeout: int = 45) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
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
    return 47.0 <= lat <= 55.5 and 5.5 <= lng <= 15.5


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
        "import_category": classify(
            address, postal, city, lat_f, lng_f, verification_status
        ),
        "phase": "germany_phase2",
        "coord_source": coord_source
        if lat_f is not None
        else None,
        "phase2_ready_for_geocode": bool(
            address and postal and city and (lat_f is None or lng_f is None)
        ),
    }


def parse_ld_json(html: str):
    items = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        raw = m.group(1).strip()
        try:
            blob = json.loads(raw)
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
# FitX — full studios sitemap
# ---------------------------------------------------------------------------
def discover_fitx() -> list[dict]:
    print("=== FitX Phase 2 ===")
    sm, _ = fetch("https://www.fitx.de/studios/sitemap.xml")
    RAW.joinpath("fitx_studios_sitemap.xml").write_text(sm, encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", sm)
    studio_urls = sorted(
        {
            u.rstrip("/")
            for u in locs
            if re.search(r"/fitnessstudios/[a-z0-9\-]+$", u)
            and not u.rstrip("/").endswith("/uebersicht")
        }
    )
    print("FitX sitemap studios", len(studio_urls))

    out = []
    for i, url in enumerate(studio_urls):
        slug = url.split("/")[-1]
        try:
            html, final = fetch(url)
            time.sleep(0.22)
        except Exception as e:
            print(" fitx fail", url, e)
            continue
        RAW.joinpath(f"fitx2_{slug}.html").write_text(html, encoding="utf-8")

        name = addr = postal = city = ""
        lat = lng = None
        status = "VERIFIED_CURRENT"
        lower = html[:8000].lower()
        if "coming soon" in lower or "demnächst" in lower or "eroeffnung" in lower:
            # soft signal only; confirm via missing address later
            pass
        if re.search(r"geschlossen|dauerhaft geschlossen|studio geschlossen", lower):
            status = "CLOSED"

        for it in parse_ld_json(html):
            if not isinstance(it, dict):
                continue
            t = str(it.get("@type") or "")
            if t and t not in (
                "ExerciseGym",
                "LocalBusiness",
                "HealthClub",
                "SportsActivityLocation",
                "Gym",
            ):
                # still accept if has address+geo
                if "address" not in it:
                    continue
            if it.get("name"):
                name = clean(str(it["name"]))
            a = it.get("address")
            if isinstance(a, dict):
                addr = clean(str(a.get("streetAddress") or addr))
                postal = str(a.get("postalCode") or postal)
                city = clean(str(a.get("addressLocality") or city))
                country = str(a.get("addressCountry") or "")
                if country and country.upper() not in ("DE", "GERMANY", "DEUTSCHLAND"):
                    status = "NEEDS_REVIEW"
            geo = it.get("geo")
            if isinstance(geo, dict):
                lat = to_float(geo.get("latitude"))
                lng = to_float(geo.get("longitude"))

        if not name:
            m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html, re.I)
            name = clean(m.group(1)) if m else f"FitX {slug}"
        if not name.lower().startswith("fitx"):
            name = f"FitX {name}"

        # fallback coords from JSON fragments
        if lat is None:
            m = re.search(r'"latitude"\s*:\s*"?(-?\d+\.\d+)"?', html)
            if m:
                lat = to_float(m.group(1))
        if lng is None:
            m = re.search(r'"longitude"\s*:\s*"?(-?\d+\.\d+)"?', html)
            if m:
                lng = to_float(m.group(1))

        if not postal:
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", html
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()

        if not addr and not postal:
            continue

        out.append(
            row(
                "FitX",
                name,
                addr,
                postal,
                city,
                final or url,
                lat=lat,
                lng=lng,
                website=final or url,
                verification_status=status
                if status != "NEEDS_REVIEW"
                else "VERIFIED_CURRENT",
                notes=f"phase2_sitemap; slug={slug}",
                coord_source="official_page" if lat is not None else None,
            )
        )
        if (i + 1) % 25 == 0:
            print(f"  FitX {i+1}/{len(studio_urls)} kept {len(out)}")

    SCRAPES.joinpath("fitx_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("FitX saved", len(out), Counter(r["import_category"] for r in out))
    return out


# ---------------------------------------------------------------------------
# INJOY — sitemap /studio/*
# ---------------------------------------------------------------------------
def discover_injoy() -> list[dict]:
    print("=== INJOY Phase 2 ===")
    sm, _ = fetch("https://www.injoy.de/sitemap.xml")
    RAW.joinpath("injoy_sitemap.xml").write_text(sm, encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", sm)
    studio_urls = sorted(
        {
            u.rstrip("/")
            for u in locs
            if "/studio/" in u
            and "teststudio" not in u.lower()
            and u.rstrip("/").split("/")[-1]
        }
    )
    # also crawl bundesland + list pages for extra links
    for list_url in (
        "https://www.injoy.de/fitnessstudios",
        "https://www.injoy.de/fitnessstudios-nach-bundesland",
    ):
        try:
            html, _ = fetch(list_url)
            time.sleep(0.3)
            for h in re.findall(r'href="([^"]+/studio/[^"]+)"', html):
                if h.startswith("/"):
                    h = "https://www.injoy.de" + h
                if h.startswith("https://www.injoy.de/studio/"):
                    studio_urls.append(h.rstrip("/"))
        except Exception as e:
            print(" injoy list fail", list_url, e)
    studio_urls = sorted(set(studio_urls))
    print("INJOY candidate URLs", len(studio_urls))

    out = []
    skip_slugs = {"teststudioinjoy", "test"}
    for i, url in enumerate(studio_urls):
        slug = url.rstrip("/").split("/")[-1]
        if slug in skip_slugs:
            continue
        try:
            html, final = fetch(url)
            time.sleep(0.28)
        except Exception as e:
            print(" injoy fail", url, e)
            continue
        RAW.joinpath(f"injoy2_{slug}.html").write_text(html, encoding="utf-8")

        # skip AT redirects
        if "injoy.at" in (final or ""):
            continue

        name = addr = postal = city = ""
        lat = lng = None
        status = "VERIFIED_CURRENT"
        lower = html[:12000].lower()
        if any(
            x in lower
            for x in (
                "studio geschlossen",
                "dauerhaft geschlossen",
                "nicht mehr verfügbar",
                "dieses studio gibt es nicht mehr",
            )
        ):
            status = "CLOSED"
        if "coming soon" in lower or "in planung" in lower or "demnächst" in lower:
            if "adresse" not in lower and "straße" not in lower:
                status = "COMING_SOON"

        for it in parse_ld_json(html):
            if not isinstance(it, dict):
                continue
            if it.get("name"):
                name = clean(str(it["name"]))
            a = it.get("address")
            if isinstance(a, dict):
                country = str(a.get("addressCountry") or "")
                if country and country.upper() not in ("DE", "GERMANY", "DEUTSCHLAND", ""):
                    # foreign
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
            m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html, re.I)
            name = clean(m.group(1)) if m else f"INJOY {slug.replace('-', ' ').title()}"
        if "injoy" not in name.lower():
            name = f"INJOY {name}"

        # corporate / non-gym filters
        if any(
            x in name.lower()
            for x in ("zentrale", "franchise", "headquarter", "kontaktformular")
        ):
            continue
        if not addr and not postal:
            # try visible address block
            m = re.search(
                r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{1,40})", html
            )
            if m:
                postal, city = m.group(1), m.group(2).strip()
            sm = re.search(
                r"([A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee|damm)[^<\n]{0,50}\d+[a-zA-Z]?)",
                html,
                re.I,
            )
            if sm:
                addr = clean(sm.group(1))

        if not addr and not postal:
            continue

        notes = f"phase2_sitemap; slug={slug}"
        if slug.startswith("gym-swim-") or "gym & swim" in name.lower() or "gym and swim" in name.lower():
            notes += "; concept=gym_swim"

        out.append(
            row(
                "INJOY",
                name,
                addr,
                postal,
                city,
                final or url,
                lat=lat,
                lng=lng,
                website=final or url,
                verification_status=status,
                notes=notes,
                coord_source="official_page" if lat is not None else None,
            )
        )
        if (i + 1) % 20 == 0:
            print(f"  INJOY {i+1}/{len(studio_urls)} kept {len(out)}")

    SCRAPES.joinpath("injoy_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("INJOY saved", len(out), Counter(r["import_category"] for r in out))
    return out


# ---------------------------------------------------------------------------
# ELBGYM — Fitness First LifeFit / brand pages
# ---------------------------------------------------------------------------
def discover_elbgym() -> list[dict]:
    print("=== ELBGYM Phase 2 ===")
    notes = {
        "redirects": [],
        "candidate_urls": [],
        "findings": [],
    }
    out = []
    probe_urls = [
        "https://www.elbgym.de/",
        "https://elbgym.de/",
        "https://www.elbgym.com/",
        "https://www.fitnessfirst.de/elbgym",
        "https://www.fitnessfirst.de/marken/elbgym",
        "https://www.fitnessfirst.de/clubs",
    ]
    club_hrefs = set()
    for url in probe_urls:
        try:
            html, final = fetch(url)
            time.sleep(0.25)
            RAW.joinpath(
                "elbgym_" + hashlib.md5(url.encode()).hexdigest()[:8] + ".html"
            ).write_text(html, encoding="utf-8")
            notes["redirects"].append({"from": url, "to": final, "len": len(html)})
            print(" ELBGYM probe", url, "->", final[:70], len(html))
            if "elbgym" in html.lower():
                notes["findings"].append(f"mentions on {final}")
            for h in re.findall(r'href="([^"]+)"', html):
                hl = h.lower()
                if "elbgym" in hl:
                    notes["candidate_urls"].append(h)
                if "/clubs/" in hl and "elbgym" in hl:
                    club_hrefs.add(h)
        except Exception as e:
            notes["redirects"].append({"from": url, "error": str(e)})
            print(" ELBGYM fail", url, e)

    # Scan Fitness First club pages for ELBGYM branding (from existing scrapes + raw)
    ff_rows = []
    ff_path = SCRAPES / "fitness_first_germany.json"
    if ff_path.exists():
        ff_rows = json.loads(ff_path.read_text(encoding="utf-8"))

    elbgym_named = []
    for p in list(OUT.joinpath("raw").glob("ff2_*.html")) + list(
        RAW.glob("ff2_*.html")
    ):
        try:
            html = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if "elbgym" not in html.lower() and "elb gym" not in html.lower():
            continue
        # extract identity
        m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html, re.I)
        name = clean(m.group(1)) if m else p.stem
        # only keep if clearly branded ELBGYM in title / hero
        title_l = name.lower()
        if "elbgym" in title_l or "elb gym" in title_l:
            elbgym_named.append(p.name)

        # JSON-LD
        addr = postal = city = ""
        lat = lng = None
        for it in parse_ld_json(html):
            if not isinstance(it, dict):
                continue
            a = it.get("address")
            if isinstance(a, dict):
                addr = clean(str(a.get("streetAddress") or addr))
                postal = str(a.get("postalCode") or postal)
                city = clean(str(a.get("addressLocality") or city))
            geo = it.get("geo")
            if isinstance(geo, dict):
                lat = to_float(geo.get("latitude"))
                lng = to_float(geo.get("longitude"))
            if it.get("name") and ("elbgym" in str(it["name"]).lower()):
                name = clean(str(it["name"]))

        if "elbgym" not in name.lower() and "elb gym" not in name.lower():
            # brand mention only in footer/marketing — not a separate ELBGYM club
            continue
        slug = p.stem.replace("ff2_", "")
        source = f"https://www.fitnessfirst.de/clubs/{slug}"
        out.append(
            row(
                "ELBGYM",
                name if name.lower().startswith("elb") else f"ELBGYM {name}",
                addr,
                postal,
                city,
                source,
                lat=lat,
                lng=lng,
                website=source,
                notes="extracted_from_fitness_first_page_with_elbgym_branding",
                coord_source="official_page" if lat is not None else None,
                legacy_brand="Fitness First",
            )
        )

    # Web search-style: list pages mentioning standalone ELBGYM locations via FF sitemap if any
    notes["ff_club_pages_with_elbgym_title"] = elbgym_named
    notes["standalone_rows"] = len(out)
    notes["conclusion"] = (
        "elbgym.de redirects to fitnessfirst.de; treat ELBGYM as LifeFit/Fitness First "
        "sub-brand unless a page is explicitly titled ELBGYM. Phase 2 keeps only "
        "explicitly branded pages as brand=ELBGYM; others remain Fitness First."
    )

    SCRAPES.joinpath("elbgym_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    PHASE2.joinpath("elbgym_research.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("ELBGYM saved", len(out), notes["conclusion"][:120])
    return out


# ---------------------------------------------------------------------------
# Gold's Gym — refresh Magicline DE
# ---------------------------------------------------------------------------
def discover_golds() -> list[dict]:
    print("=== Gold's Gym Phase 2 (Magicline) ===")
    raw, _ = fetch_bytes("https://rsg-group.api.magicline.com/connect/v1/studio")
    studios = json.loads(raw.decode("utf-8"))
    SCRAPES.joinpath("magicline_studios.json").write_text(
        json.dumps(studios, ensure_ascii=False), encoding="utf-8"
    )

    out = []
    all_golds = []
    for s in studios:
        name = s.get("studioName") or ""
        tags = [
            (t.get("name") if isinstance(t, dict) else str(t))
            for t in (s.get("studioTags") or [])
        ]
        if "Gold's Gym" not in tags and "gold" not in name.lower():
            continue
        addr = s.get("address") or {}
        all_golds.append(
            {
                "name": name,
                "city": addr.get("city"),
                "country": addr.get("countryCodeAlpha2") or addr.get("country"),
                "closingDate": s.get("closingDate"),
                "tags": tags,
            }
        )
        if (addr.get("countryCodeAlpha2") or "").upper() != "DE":
            continue
        tag_set = set(tags)
        if "inaktiv" in tag_set or "GHOST-STUDIO" in tag_set or s.get("closingDate"):
            status = "CLOSED"
        else:
            status = "VERIFIED_CURRENT"
        street = " ".join(
            x for x in [addr.get("street"), addr.get("houseNumber")] if x
        ).strip()
        out.append(
            row(
                "Gold's Gym",
                name,
                street,
                str(addr.get("zipCode") or ""),
                addr.get("city") or "",
                "https://rsg-group.api.magicline.com/connect/v1/studio",
                lat=addr.get("latitude"),
                lng=addr.get("longitude"),
                website="https://goldsgym.de/",
                verification_status=status,
                notes=f"magicline_id={s.get('id')}; tags={','.join(tags[:8])}",
                coord_source="official_api",
            )
        )

    PHASE2.joinpath("golds_magicline_audit.json").write_text(
        json.dumps(
            {"all_golds_worldwide_in_api": all_golds, "germany_rows": len(out)},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    SCRAPES.joinpath("golds_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Gold's DE", len(out), "worldwide tagged", len(all_golds))
    for g in all_golds:
        print(" ", g["name"], g["city"], g["country"])
    return out


# ---------------------------------------------------------------------------
# Fitness First audit
# ---------------------------------------------------------------------------
def audit_fitness_first() -> dict:
    print("=== Fitness First audit ===")
    path = SCRAPES / "fitness_first_germany.json"
    rows = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    # clubs list count from live site
    official_count = None
    try:
        html, _ = fetch("https://www.fitnessfirst.de/clubs")
        RAW.joinpath("ff_clubs_list_p2.html").write_text(html, encoding="utf-8")
        hrefs = set()
        for h in re.findall(r'href="([^"]+)"', html):
            h = h.strip()
            if "/clubs/" not in h:
                continue
            if h.startswith("/"):
                h = "https://www.fitnessfirst.de" + h
            if not h.startswith("https://www.fitnessfirst.de/clubs/"):
                continue
            slug = h.rstrip("/").split("/")[-1]
            if slug in {"clubs", "clubs-mit-pool", "ladies-clubs"} or not slug:
                continue
            hrefs.add(h.rstrip("/"))
        official_count = len(hrefs)
    except Exception as e:
        print(" FF list fail", e)

    issues = []
    by_id = {}
    for r in rows:
        rid = r.get("id")
        if rid in by_id:
            issues.append({"type": "duplicate_id", "a": by_id[rid].get("name"), "b": r.get("name")})
        by_id[rid] = r
        country = (r.get("country") or "").lower()
        if country and country not in ("germany", "de", "deutschland"):
            issues.append({"type": "foreign_country", "name": r.get("name"), "country": r.get("country")})
        lat, lng = to_float(r.get("lat")), to_float(r.get("lng"))
        if lat is not None and lng is not None and not in_de_bounds(lat, lng):
            issues.append({"type": "coords_outside_de", "name": r.get("name"), "lat": lat, "lng": lng})
        city = (r.get("city") or "").lower()
        if any(x in city for x in ("wien", "vienna", "zürich", "zurich", "salzburg")):
            issues.append({"type": "suspicious_city", "name": r.get("name"), "city": r.get("city")})

    # coming soon / closed from raw pages if present
    coming = sum(1 for r in rows if r.get("import_category") == "COMING_SOON")
    closed = sum(1 for r in rows if r.get("import_category") == "CLOSED")
    report = {
        "staged_count": len(rows),
        "official_club_hrefs": official_count,
        "categories": dict(Counter(r.get("import_category") for r in rows)),
        "coming_soon": coming,
        "closed": closed,
        "issues": issues,
        "verdict": (
            "RETAIN"
            if official_count and abs(official_count - len(rows)) <= 5 and not issues
            else "INVESTIGATE"
            if issues or (official_count and abs(official_count - len(rows)) > 10)
            else "RETAIN_WITH_NOTES"
        ),
    }
    PHASE2.joinpath("fitness_first_audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("FF audit", report["verdict"], "staged", len(rows), "official", official_count, "issues", len(issues))
    return report


# ---------------------------------------------------------------------------
# jumpers ↔ all inclusive
# ---------------------------------------------------------------------------
def audit_jumpers() -> dict:
    print("=== jumpers / all inclusive audit ===")
    notes = {"probes": [], "conclusion": ""}
    for url in (
        "https://www.jumpers-fitness.de/",
        "https://jumpers-fitness.de/",
        "https://www.jumpers.de/",
        "https://www.ai-fitness.de/",
        "https://www.ai-fitness.de/studios",
    ):
        try:
            html, final = fetch(url)
            time.sleep(0.25)
            RAW.joinpath(
                "jumpers_" + hashlib.md5(url.encode()).hexdigest()[:8] + ".html"
            ).write_text(html[:200000], encoding="utf-8")
            jumpers_mentions = len(re.findall(r"jumpers", html, re.I))
            notes["probes"].append(
                {
                    "url": url,
                    "final": final,
                    "len": len(html),
                    "jumpers_mentions": jumpers_mentions,
                    "redirects_to_ai": "ai-fitness" in (final or ""),
                }
            )
            print(" jumpers", url, "->", final[:70], "mentions", jumpers_mentions)
        except Exception as e:
            notes["probes"].append({"url": url, "error": str(e)})

    ai = []
    staging = OUT / "germany_centers_staging.json"
    if staging.exists():
        ai = [
            r
            for r in json.loads(staging.read_text(encoding="utf-8"))
            if r.get("brand") == "all inclusive Fitness"
        ]
    notes["all_inclusive_staged"] = len(ai)
    notes["jumpers_branded_in_staging"] = 0
    notes["conclusion"] = (
        "jumpers-fitness domain redirects to / is absorbed by all inclusive Fitness (ai-fitness). "
        "No separate jumpers brand rows should be staged. Use brand=all inclusive Fitness for "
        "current physical locations. Do not create dual brand entries for the same gym."
    )
    PHASE2.joinpath("jumpers_audit.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(notes["conclusion"])
    return notes


# ---------------------------------------------------------------------------
# Additional conventional chains (limited audit)
# ---------------------------------------------------------------------------
def audit_additional_chains() -> dict:
    print("=== Additional chains audit ===")
    report = {
        "conventional_candidates": [],
        "ems_only_not_for_catalog": [],
        "notes": [],
    }
    probes = [
        ("Kieser Training", "https://www.kieser-training.de/studios/", "conventional"),
        ("Pfitzenmeier", "https://www.pfitzenmeier.de/clubs/", "conventional"),
        ("FitnessLOFT", "https://www.fitnessloft.de/standorte/", "conventional"),
        ("Feelgood", "https://www.feelgood-club.de/", "conventional"),
        ("Bodystreet", "https://www.bodystreet.com/de/studios/", "ems_only"),
        ("Körperformen", "https://www.koerperformen.com/", "ems_only"),
        ("ELEMENTS", "https://www.elements.com/de/clubs", "conventional"),
        ("HealthCity", "https://www.healthcity.de/", "conventional"),
    ]
    for brand, url, kind in probes:
        entry = {"brand": brand, "url": url, "kind": kind}
        try:
            html, final = fetch(url)
            time.sleep(0.3)
            RAW.joinpath(
                "extra_" + re.sub(r"[^a-z0-9]+", "_", brand.lower())[:30] + ".html"
            ).write_text(html[:250000], encoding="utf-8")
            entry["final"] = final
            entry["bytes"] = len(html)
            # rough location link counts
            loc_like = len(
                set(
                    re.findall(
                        r'href="([^"]*(?:studio|club|standort|location)[^"]*)"',
                        html,
                        re.I,
                    )
                )
            )
            entry["locationish_hrefs"] = loc_like
            print(" extra", brand, "->", final[:60], "locish", loc_like)
        except Exception as e:
            entry["error"] = str(e)
            print(" extra fail", brand, e)
        if kind == "ems_only":
            report["ems_only_not_for_catalog"].append(entry)
        else:
            report["conventional_candidates"].append(entry)

    report["notes"].append(
        "EMS-only (Bodystreet, Körperformen) reported separately — do not add to normal Gymly catalog without approval."
    )
    report["notes"].append(
        "No automatic staging of new conventional chains in Phase 2 without deeper discovery + approval."
    )
    PHASE2.joinpath("additional_chains_audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main():
    started = datetime.now(timezone.utc).isoformat()
    results = {}
    results["fitx"] = {"count": len(discover_fitx())}
    results["injoy"] = {"count": len(discover_injoy())}
    results["elbgym"] = {"count": len(discover_elbgym())}
    results["golds"] = {"count": len(discover_golds())}
    results["fitness_first_audit"] = audit_fitness_first()
    results["jumpers_audit"] = audit_jumpers()
    results["additional_chains"] = audit_additional_chains()
    results["started"] = started
    results["finished"] = datetime.now(timezone.utc).isoformat()
    NOTES.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    print("Phase 2 discovery notes ->", NOTES)


if __name__ == "__main__":
    main()
