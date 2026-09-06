#!/usr/bin/env python3
"""
Italy Phase 3 discovery — deep market completeness audit + missing-chain recovery.

Does NOT modify src/data/centers.json.
Does NOT regenerate stable production it_* IDs.
Stages NEW high-confidence candidates only (vs live Italy 550).
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
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
RAW = OUT / "raw" / "phase3"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
for p in (OUT, RAW, PAGES, SCRAPES, PAGES / "fitinn", PAGES / "dabliu", PAGES / "getfit"):
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

# GetFIT: live site 403; addresses + map pins from official pages (Wayback Jan 2025 +
# search-indexed official club pages). 6 acquired by Orange Jul 2026; 2 founder-retained.
# Cagliero present on Wayback but absent from 8-club official list → CLOSED.
# postal left blank unless club-page confirmed; consolidate reverse-fills CAP from OFFICIAL_MAP_PIN.
GETFIT_CLUBS = [
    {
        "slug": "via-ravizza",
        "name": "GetFIT Milano Via Ravizza",
        "address": "Via Ravizza, 4",
        "postal": "20149",
        "city": "Milano",
        "lat": 45.4675813,
        "lng": 9.1526313,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/via-ravizza/",
    },
    {
        "slug": "via-meda",
        "name": "GetFIT Milano Via Meda",
        "address": "Via Giuseppe Meda, 52",
        "postal": "",
        "city": "Milano",
        "lat": 45.4386269,
        "lng": 9.1782916,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/via-meda/",
    },
    {
        "slug": "viale-stelvio",
        "name": "GetFIT Milano Viale Stelvio",
        "address": "Viale Stelvio, 65",
        "postal": "",
        "city": "Milano",
        "lat": 45.4953468,
        "lng": 9.1818396,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/viale-stelvio/",
    },
    {
        "slug": "via-cenisio",
        "name": "GetFIT Milano Via Cenisio",
        "address": "Via Cenisio, 10",
        "postal": "20154",
        "city": "Milano",
        "lat": 45.4877149,
        "lng": 9.1709189,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/via-cenisio/",
    },
    {
        "slug": "via-piranesi",
        "name": "GetFIT Milano Via Piranesi",
        "address": "Via Piranesi, 9",
        "postal": "",
        "city": "Milano",
        "lat": 45.4608187,
        "lng": 9.2256316,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/via-piranesi/",
    },
    {
        "slug": "via-vico",
        "name": "GetFIT Milano Via Vico",
        "address": "Via Vico, 38",
        "postal": "",
        "city": "Milano",
        "lat": None,
        "lng": None,
        "status": "acquired_by_orange",
        "source_url": "https://www.getfit.it/club/via-vico/",
    },
    {
        "slug": "via-piacenza",
        "name": "GetFIT Milano Via Piacenza",
        "address": "Via Piacenza, 4",
        "postal": "",
        "city": "Milano",
        "lat": 45.4485261,
        "lng": 9.203573,
        "status": "founder_retained",
        "source_url": "https://www.getfit.it/club/via-piacenza/",
    },
    {
        "slug": "via-pinerolo",
        "name": "GetFIT Milano Via Pinerolo",
        "address": "Via Pinerolo, 76",
        "postal": "",
        "city": "Milano",
        "lat": 45.4827008,
        "lng": 9.115067,
        "status": "founder_retained",
        "source_url": "https://www.getfit.it/club/via-pinerolo/",
    },
    {
        "slug": "via-cagliero",
        "name": "GetFIT Milano Via Cagliero",
        "address": "Via Cagliero, 14",
        "postal": "",
        "city": "Milano",
        "lat": 45.496,
        "lng": 9.2027125,
        "status": "closed",
        "source_url": "https://www.getfit.it/club/via-cagliero/",
    },
]

DABLIU_CLUBS = [
    {
        "slug": "roma-colli-oro",
        "name": "Dabliu Roma Colli d'Oro",
        "address": "Via Busto Arsizio, 31",
        "postal": "00188",
        "city": "Roma",
        "source_url": "https://www.dabliu.com/club/roma-colli-oro/",
    },
    {
        "slug": "roma-eur",
        "name": "Dabliu Roma Eur",
        "address": "Viale Egeo, 98",
        "postal": "00144",
        "city": "Roma",
        "source_url": "https://www.dabliu.com/club/roma-eur/",
    },
    {
        "slug": "roma-margherita",
        "name": "Dabliu Roma Margherita",
        "address": "Viale Regina Margherita, 210",
        "postal": "00198",
        "city": "Roma",
        "source_url": "https://www.dabliu.com/club/roma-margherita/",
    },
    {
        "slug": "roma-parioli",
        "name": "Dabliu Roma Parioli",
        "address": "Viale Romania, 22",
        "postal": "00197",
        "city": "Roma",
        "source_url": "https://www.dabliu.com/club/roma-parioli/",
    },
    {
        "slug": "roma-prati",
        "name": "Dabliu Roma Prati",
        "address": "Viale Giulio Cesare, 43",
        "postal": "00192",
        "city": "Roma",
        "source_url": "https://www.dabliu.com/club/roma-prati/",
    },
]

FITINN_IT_SLUGS = [
    "milano-corso_sempione",
    "milano-bicocca",
    "milano-via-airolo",
    "milano-via-bergamo",
    "milano-viale-abruzzi",
    "milano-viale-monza",
    "prato",
    "bologna-meraville",
    "centro-borgo",
    "brescia",
]

CHAIN_PROBES = [
    ("FITINN", "https://fitinn.it/palestre/", "NEW national low-cost (ex-YouFit)"),
    ("GetFIT", "https://www.getfit.it/", "403 homepage; 8 Milan clubs (6→Orange)"),
    ("Dabliu", "https://www.dabliu.com/", "5 Rome conventional/multi-sport clubs"),
    ("Palestre Italiane", "https://palestreitaliane.it/", "Orange network brand; locator=Orange"),
    ("Prime Fitness", "https://www.primefitness.it/palestre", "2 Bologna — below 5+ threshold"),
    ("Happy Fit", "https://www.happyfit.it/p/espansione", "Absorbed into McFIT 2014"),
    ("Zero10", "https://www.zero10.it/", "Single Padova independent"),
    ("Tonic", "https://www.tonicfitness.it/", "DNS unavailable"),
    ("Fit And Go", "https://www.fitandgo.it/", "EXCLUDE EMS"),
    ("Heaven", "https://www.heavenfitness.it/", "No independent multi-site estate found"),
    ("Forum Sport Center", "https://forumroma.it/", "Single Rome multi-sport complex"),
    ("Fitness Park", "https://www.fitnesspark.it/club/romaest/", "1 open Italy (RomaEst)"),
    ("Basic-Fit", "https://www.basic-fit.com/it-it/palestre", "No Italy clubs"),
    ("20Hours", "https://www.20hours.it/", "Already live"),
    ("WebFit", "https://www.webfit.it/", "Already live"),
    ("Fit Express", "https://www.fitexpress.it/", "Already live; unresolved leftovers"),
    ("Icon Palestre", "https://www.iconpalestre.it/", "Already live; unresolved leftovers"),
    ("Orange", "https://www.orangepalestre.it/palestre/", "23 on site; news ~33 w/ GetFIT"),
]


def log(*a):
    print(*a, flush=True)


def fetch(url: str, timeout: int = 40, headers: dict | None = None) -> tuple[int, str]:
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


def fetch_cached(url: str, dest: Path, timeout: int = 40, force: bool = False) -> str:
    if not force and dest.exists() and dest.stat().st_size > 300:
        return dest.read_text(encoding="utf-8", errors="replace")
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, text = fetch(url, timeout=timeout)
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


def row(
    brand: str,
    name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    notes="",
    coming=False,
    closed=False,
    coord_source=None,
    legacy_brand=None,
    website=None,
    source_type=None,
) -> dict:
    postal = it_postal(postal) or it_postal(address) or ""
    if closed:
        status = "CLOSED"
        cat = "CLOSED"
    elif coming:
        status = "COMING_SOON"
        cat = "COMING_SOON"
    else:
        status = "VERIFIED_CURRENT"
        cat = None
    out = {
        "id": make_id(brand, address, postal, city),
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": unescape(address or ""),
        "postal_code": postal or None,
        "city": unescape(city or ""),
        "country": "Italy",
        "lat": lat,
        "lng": lng,
        "opening_hours": None,
        "website": website or source_url,
        "source_url": source_url,
        "source_type": source_type or "official_club_page",
        "verification_status": status,
        "notes": notes,
        "is_active": not coming and not closed,
        "import_category": cat,
        "phase": "italy_phase3",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
        "region": None,
    }
    if lat is not None and lng is not None and not in_italy_bbox(lat, lng):
        out["lat"] = None
        out["lng"] = None
        out["coord_source"] = None
        out["notes"] = (notes + "; rejected_non_italy_bbox").strip("; ")
    return out


def parse_fitinn_page(slug: str, html: str, url: str) -> dict | None:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    plain = re.sub(r"<[^>]+>", "\n", text)
    plain = re.sub(r"[ \t]+", " ", plain)
    idx = plain.lower().find("indirizzo")
    snippet = plain[idx : idx + 250] if idx >= 0 else plain[:400]
    m = re.search(
        r"Indirizzo\s*\n\s*(.+?)\n\s*(\d{5})\s+([A-Za-zÀ-ú'’\-\s]+?)(?:\s*\([A-Z]{2}\))?\s*\n",
        plain,
        re.I,
    )
    address = postal = city = ""
    if m:
        address = unescape(m.group(1).strip(" ,"))
        postal = m.group(2)
        city = unescape(m.group(3).strip())
    else:
        m2 = re.search(
            r"((?:Via|Viale|Corso|Piazza|Parco|Via Privata)[^,\n]{3,80}),?\s*\n?\s*(\d{5})\s+([A-Za-zÀ-ú'’\-\s]+)",
            snippet,
            re.I,
        )
        if m2:
            address = unescape(m2.group(1).strip(" ,"))
            postal = m2.group(2)
            city = unescape(m2.group(3).strip().split("(")[0].strip())
    if not address or not city:
        return None
    # Prefer map pin from page
    coords = re.findall(
        r"(?:new google\.maps\.LatLng|latLng|setCenter|center:)\s*\(\s*([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)",
        html,
    )
    coords += re.findall(r'"lat"\s*:\s*([-+]?\d+\.\d+)\s*,\s*"lng"\s*:\s*([-+]?\d+\.\d+)', html)
    coords += re.findall(r"@([-+]?\d+\.\d+),([-+]?\d+\.\d+)", html)
    lat = lng = None
    coord_source = None
    for a, b in coords:
        try:
            la, lo = float(a), float(b)
        except ValueError:
            continue
        if in_italy_bbox(la, lo):
            lat, lng = la, lo
            coord_source = "OFFICIAL_MAP_PIN"
            break
    # Meraville street refinement from directories / known commercial park pin
    if "meraville" in slug and address.lower().startswith("parco"):
        address = "Viale Tito Carnacini, 13 (Parco Commerciale Meraville)"
    label = {
        "milano-corso_sempione": "Milano Corso Sempione",
        "milano-bicocca": "Milano Bicocca",
        "milano-via-airolo": "Milano Via Airolo",
        "milano-via-bergamo": "Milano Via Bergamo",
        "milano-viale-abruzzi": "Milano Viale Abruzzi",
        "milano-viale-monza": "Milano Viale Monza",
        "prato": "Prato",
        "bologna-meraville": "Bologna Meraville",
        "centro-borgo": "Bologna Centro Borgo",
        "brescia": "Brescia",
    }.get(slug, slug.replace("-", " ").title())
    return row(
        "FITINN",
        f"FITINN {label}",
        address,
        postal,
        city,
        url,
        lat=lat,
        lng=lng,
        notes=f"fitinn_slug={slug}; phase3",
        coord_source=coord_source,
        source_type="fitinn_official_club_page",
    )


def discover_fitinn() -> list[dict]:
    log("=== FITINN ===")
    listing = fetch_cached("https://fitinn.it/palestre/", RAW / "fitinn_palestre.html")
    (RAW / "fitinn_listing_meta.json").write_text(
        json.dumps({"bytes": len(listing), "fetched": datetime.now(timezone.utc).isoformat()}, indent=2),
        encoding="utf-8",
    )
    rows = []
    for slug in FITINN_IT_SLUGS:
        url = f"https://fitinn.it/palestre/{slug}/"
        dest = PAGES / "fitinn" / f"{slug}.html"
        html = fetch_cached(url, dest)
        if not html:
            log("  miss", slug)
            continue
        r = parse_fitinn_page(slug, html, url)
        if r:
            rows.append(r)
            log(f"  + {r['name']} | {r['address']} | {r['postal_code']} | {r.get('coord_source')}")
        else:
            log("  parse fail", slug)
        time.sleep(0.25)
    return rows


def discover_dabliu() -> list[dict]:
    log("=== Dabliu ===")
    rows = []
    for c in DABLIU_CLUBS:
        dest = PAGES / "dabliu" / f"{c['slug']}.html"
        html = fetch_cached(c["source_url"], dest)
        lat = lng = None
        coord_source = None
        if html:
            maps = re.findall(r"maps/place/(-?\d+\.\d+),(-?\d+\.\d+)", html)
            maps += re.findall(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", html)
            for a, b in maps:
                # embed !2d=lng !3d=lat
                try:
                    if float(a) > 30:  # lat first form
                        la, lo = float(a), float(b)
                    else:
                        lo, la = float(a), float(b)
                    if in_italy_bbox(la, lo):
                        lat, lng = la, lo
                        coord_source = "OFFICIAL_MAP_PIN"
                        break
                except ValueError:
                    continue
        r = row(
            "Dabliu",
            c["name"],
            c["address"],
            c["postal"],
            c["city"],
            c["source_url"],
            lat=lat,
            lng=lng,
            notes="phase3; rome_5_club_network",
            coord_source=coord_source,
            source_type="dabliu_official_club_page",
        )
        rows.append(r)
        log(f"  + {r['name']} | {r.get('coord_source')}")
        time.sleep(0.2)
    return rows


def discover_getfit() -> list[dict]:
    log("=== GetFIT ===")
    rows = []
    for c in GETFIT_CLUBS:
        # Prefer Wayback HTML map pin if present
        lat, lng = c.get("lat"), c.get("lng")
        coord_source = "OFFICIAL_MAP_PIN" if lat is not None and lng is not None else None
        wb = PAGES / "getfit" / f"{c['slug'].replace('viale-stelvio','via-stelvio')}.html"
        if not wb.exists():
            wb = PAGES / "getfit" / f"{c['slug']}.html"
        if wb.exists():
            html = wb.read_text(encoding="utf-8", errors="replace")
            maps = re.findall(r"maps/place/(-?\d+\.\d+),(-?\d+\.\d+)", html)
            if maps:
                try:
                    la, lo = float(maps[0][0]), float(maps[0][1])
                    if in_italy_bbox(la, lo):
                        lat, lng = la, lo
                        coord_source = "OFFICIAL_MAP_PIN"
                except ValueError:
                    pass
        notes = f"getfit_slug={c['slug']}; status={c['status']}; phase3; source=wayback_or_indexed_official"
        if c["status"] == "acquired_by_orange":
            notes += "; orange_acquisition_jul2026_not_yet_on_orange_locator"
        brand = "GetFIT"
        legacy = None
        closed = c["status"] == "closed"
        r = row(
            brand,
            c["name"],
            c["address"],
            c["postal"],
            c["city"],
            c["source_url"],
            lat=lat,
            lng=lng,
            notes=notes,
            closed=closed,
            coord_source=coord_source,
            legacy_brand=legacy,
            source_type="getfit_official_archived",
        )
        rows.append(r)
        log(f"  + {r['name']} | {c['status']} | {r.get('coord_source')}")
    return rows


def discover_fitness_park() -> list[dict]:
    log("=== Fitness Park ===")
    url = "https://www.fitnesspark.it/club/romaest/"
    html = fetch_cached(url, RAW / "fitnesspark_romaest.html")
    address = "Centro commerciale RomaEst, Via Collatina"
    postal = "00132"
    city = "Roma"
    lat = lng = None
    coord_source = None
    if html:
        m = re.search(r"(Centro commerciale RomaEst,\s*Via Collatina[^,<]*)", html, re.I)
        if m:
            address = unescape(m.group(1).split(",")[0] + ", Via Collatina")
        # refine street if fuller form present
        m2 = re.search(r"Via Collatina[^0-9]{0,20}(\d+)?[^,]{0,20},\s*00132", html)
        if m2:
            address = "Via Collatina (Centro commerciale RomaEst)"
            postal = "00132"
        maps = re.findall(r"maps/place/(-?\d+\.\d+),(-?\d+\.\d+)", html)
        maps += re.findall(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", html)
        for a, b in maps:
            try:
                if float(a) > 30:
                    la, lo = float(a), float(b)
                else:
                    lo, la = float(a), float(b)
                if in_italy_bbox(la, lo):
                    lat, lng = la, lo
                    coord_source = "OFFICIAL_MAP_PIN"
                    break
            except ValueError:
                continue
    r = row(
        "Fitness Park",
        "Fitness Park RomaEst",
        address,
        postal,
        city,
        url,
        lat=lat,
        lng=lng,
        notes="phase3; first_italy_club; CIWAS_debut_referenced",
        coord_source=coord_source,
        source_type="fitnesspark_official",
    )
    log(f"  + {r['name']} | {r.get('coord_source')}")
    return [r]


def probe_chains() -> dict:
    log("=== Chain probes ===")
    audit = {}
    for name, url, note in CHAIN_PROBES:
        code, body = fetch(url, timeout=25)
        audit[name] = {
            "url": url,
            "http": code,
            "bytes": len(body or ""),
            "note": note,
            "title": None,
        }
        m = re.search(r"<title[^>]*>([^<]+)", body or "", re.I)
        if m:
            audit[name]["title"] = unescape(m.group(1))[:120]
        log(f"  {name}: HTTP {code} ({audit[name]['bytes']} B)")
        time.sleep(0.3)
    (RAW / "chain_probe_audit.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    return audit


def load_production_italy() -> list[dict]:
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    return [c for c in centers if c.get("country") == "Italy" or str(c.get("id", "")).startswith("it_")]


def classify_vs_production(discovered: list[dict], production: list[dict]) -> list[dict]:
    prod_ids = {c["id"] for c in production}
    out = []
    for r in discovered:
        rr = dict(r)
        if rr["id"] in prod_ids:
            rr["discovery_class"] = "ALREADY_LIVE"
        else:
            rr["discovery_class"] = "NEW_CANDIDATE"
        out.append(rr)
    return out


def main():
    log("Italy Phase 3 discover —", TODAY.isoformat())
    production = load_production_italy()
    log(f"Production Italy: {len(production)}")

    probes = probe_chains()
    discovered: list[dict] = []
    discovered.extend(discover_fitinn())
    discovered.extend(discover_dabliu())
    discovered.extend(discover_getfit())
    discovered.extend(discover_fitness_park())

    discovered = classify_vs_production(discovered, production)

    # Dedupe by id within discovery
    by_id = {}
    for r in discovered:
        prev = by_id.get(r["id"])
        if prev is None or (r.get("lat") and not prev.get("lat")):
            by_id[r["id"]] = r
    discovered = list(by_id.values())

    out_path = SCRAPES / "phase3_discovery.json"
    out_path.write_text(json.dumps(discovered, indent=2, ensure_ascii=False), encoding="utf-8")
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_italy": len(production),
        "discovered": len(discovered),
        "by_brand": {},
        "by_class": {},
        "probes": {k: {"http": v["http"], "note": v["note"]} for k, v in probes.items()},
    }
    from collections import Counter

    meta["by_brand"] = dict(Counter(r["brand"] for r in discovered))
    meta["by_class"] = dict(Counter(r.get("discovery_class") for r in discovered))
    (SCRAPES / "phase3_discovery_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Wrote {out_path} ({len(discovered)} rows)")
    log(json.dumps(meta["by_brand"], indent=2))
    log("DONE discover")


if __name__ == "__main__":
    main()
