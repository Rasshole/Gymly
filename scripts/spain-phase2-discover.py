#!/usr/bin/env python3
"""
Spain Phase 2 discovery — recover missing chains + enrich unresolved Phase 1 rows.

Does NOT merge into centers.json. Does NOT invent coordinates.
Writes to data/spain/scrapes/*_spain_p2.json and raw captures.
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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/spain"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PAGES = RAW / "pages"
for p in (OUT, RAW, SCRAPES, PAGES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}

ES_MAINLAND = (35.9, 43.8, -9.4, 3.4)
ES_BALEARIC = (38.6, 40.1, 1.1, 4.4)
ES_CANARY = (27.6, 29.5, -18.2, -13.3)
ES_CEUTA = (35.85, 35.92, -5.35, -5.27)
ES_MELILLA = (35.26, 35.33, -2.97, -2.92)


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


def fetch_cached(url: str, dest: Path, timeout: int = 45, headers: dict | None = None, force: bool = False) -> str:
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


def es_postal(s) -> str:
    if s is None:
        return ""
    m = re.search(r"\b(\d{5})\b", str(s).strip())
    return m.group(1) if m else ""


def in_spain_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    for bounds in [ES_MAINLAND, ES_BALEARIC, ES_CANARY, ES_CEUTA, ES_MELILLA]:
        lo, hi, w, e = bounds
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join([
        (brand or "").strip().lower(),
        (address or "").strip().lower(),
        (postal or "").strip().lower(),
        (city or "").strip().lower(),
        "spain",
    ])
    return "es_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def parse_geo(obj) -> tuple[float | None, float | None, str | None]:
    if not isinstance(obj, dict):
        return None, None, None
    try:
        la = float(obj.get("latitude") if obj.get("latitude") is not None else obj.get("lat"))
        lo = float(
            obj.get("longitude")
            if obj.get("longitude") is not None
            else (obj.get("lng") if obj.get("lng") is not None else obj.get("lon"))
        )
        if in_spain_bbox(la, lo):
            return la, lo, "official"
    except (TypeError, ValueError):
        pass
    return None, None, None


def parse_json_ld_nodes(html: str) -> list[dict]:
    nodes = []
    for jm in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.S | re.I,
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


def row(
    brand: str, name: str, address: str, postal: str, city: str, source_url: str,
    lat=None, lng=None, opening_hours=None, notes="", coming=False,
    website=None, coord_source=None, legacy_brand=None, closed=False,
) -> dict:
    postal = es_postal(postal) or (postal or "")
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
        "city": unescape(city or ""),
        "country": "Spain",
        "lat": lat,
        "lng": lng,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": status,
        "notes": notes,
        "is_active": not coming and not closed,
        "import_category": "CLOSED" if closed else ("COMING_SOON" if coming else None),
        "phase": "spain_phase2",
        "coord_source": coord_source,
        "legacy_brand": legacy_brand,
    }


def dump(name: str, rows: list) -> None:
    path = SCRAPES / f"{name}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  wrote {path.name}: {len(rows)}")


def from_healthclub_node(n: dict, brand: str, source_url: str, notes: str, website: str) -> dict | None:
    a = n.get("address")
    if not isinstance(a, dict):
        return None
    street = unescape(a.get("streetAddress") or "")
    postal = es_postal(str(a.get("postalCode") or ""))
    city = unescape(a.get("addressLocality") or "")
    cc = (a.get("addressCountry") or "").upper()
    if cc and cc not in ("ES", "SPAIN", "ESPAÑA", "ESPANA", ""):
        return None
    if not street and not city:
        return None
    nm = unescape(n.get("name") or f"{brand} {city}")
    lat, lng, src = parse_geo(n.get("geo") or {})
    coming = bool(re.search(r"pr[oó]xima apertura|coming soon|próxima apertura", nm, re.I))
    if "próxima apertura" in nm.lower() or "proxima apertura" in nm.lower():
        coming = True
        nm = re.sub(r"[¡!]?\s*pr[oó]xima apertura[!]?\s*", "", nm, flags=re.I).strip(" -–|")
    return row(
        brand, nm, street, postal, city, n.get("url") or source_url,
        lat=lat, lng=lng, notes=notes, coming=coming, website=website,
        coord_source=("official_json_ld" if src else None),
    )


# ---------------------------------------------------------------------------
# VivaGym — sitemap + per-club JSON-LD
# ---------------------------------------------------------------------------

def discover_vivagym() -> list[dict]:
    log("  VivaGym: sitemap + club pages...")
    locs = []
    for suffix in ["", "-2", "-3", "-4", "-5", "-6"]:
        url = f"https://www.vivagym.com/es-es/sitemap-vg_gym{suffix}.xml"
        text = fetch_cached(url, RAW / f"vivagym_sitemap_vg_gym{suffix}.xml", force=True)
        locs.extend(re.findall(r"<loc>([^<]+)</loc>", text or ""))
    locs = sorted(set(locs))
    log(f"    gym URLs: {len(locs)}")

    rows = []
    seen = set()
    for i, url in enumerate(locs, 1):
        slug = url.rstrip("/").split("/")[-1] or f"gym_{i}"
        dest = PAGES / "vivagym" / f"{slug}.html"
        html = fetch_cached(url, dest)
        if not html:
            time.sleep(0.15)
            continue
        for n in parse_json_ld_nodes(html):
            t = (n.get("@type") or "")
            if isinstance(t, list):
                t = " ".join(t)
            if "HealthClub" not in t and "ExerciseGym" not in t and "LocalBusiness" not in t:
                # still try if address present
                if not isinstance(n.get("address"), dict):
                    continue
            r = from_healthclub_node(
                n, "VivaGym", url, "official_club_page_json_ld", "https://www.vivagym.com/es-es/",
            )
            if not r or not r["address"]:
                continue
            # Prefer VivaGym brand name
            if not r["name"].lower().startswith("vivagym"):
                r["name"] = f"VivaGym {r['name']}"
                r["center_name"] = r["name"]
            # Detect coming soon from breadcrumb/title
            if re.search(r"pr[oó]xima apertura", html[:8000], re.I):
                r["verification_status"] = "COMING_SOON"
                r["import_category"] = "COMING_SOON"
                r["is_active"] = False
            key = (r["address"].lower(), r.get("postal_code") or "", (r.get("city") or "").lower())
            if key in seen:
                continue
            seen.add(key)
            # Altafit rebrand note when URL/path suggests former Altafit or notes in page
            if re.search(r"altafit", html[:15000], re.I):
                r["legacy_brand"] = "Altafit"
                r["notes"] = (r["notes"] + "; ex_altafit_page_signal").strip("; ")
            rows.append(r)
        if i % 25 == 0:
            log(f"    fetched {i}/{len(locs)} → {len(rows)} clubs")
        time.sleep(0.12)

    dump("vivagym_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Anytime Fitness Spain
# ---------------------------------------------------------------------------

def discover_anytime() -> list[dict]:
    log("  Anytime Fitness: club_db sitemap...")
    sm = fetch_cached(
        "https://www.anytimefitness.es/club_db-sitemap.xml",
        RAW / "anytime_club_db_sitemap.xml",
        force=True,
    )
    locs = re.findall(r"<loc>([^<]+)</loc>", sm or "")
    # Spain only — URLs contain /gimnasio/sp-
    locs = [u for u in locs if "/gimnasio/sp-" in u.lower() or "/gimnasio/SP-" in u]
    log(f"    club URLs: {len(locs)}")
    rows = []
    seen = set()
    for i, url in enumerate(locs, 1):
        slug = urllib.parse.unquote(url.rstrip("/").split("/")[-1])[:80]
        html = fetch_cached(url, PAGES / "anytime" / f"{i:03d}_{slug}.html")
        if not html:
            continue
        street = postal = city = ""
        lat = lng = None
        coord_src = None
        name = ""
        for n in parse_json_ld_nodes(html):
            a = n.get("address")
            if isinstance(a, dict):
                street = street or unescape(a.get("streetAddress") or "")
                postal = postal or es_postal(str(a.get("postalCode") or ""))
                city = city or unescape(a.get("addressLocality") or "")
                name = name or unescape(n.get("name") or "")
            g = n.get("geo") or {}
            la, lo, src = parse_geo(g)
            if la is not None:
                lat, lng, coord_src = la, lo, "official_json_ld"
        # data-lat fallback
        if lat is None:
            mlat = re.search(r'data-lat=["\']([^"\']+)["\']', html)
            mlng = re.search(r'data-lng=["\']([^"\']+)["\']', html) or re.search(
                r'data-lon=["\']([^"\']+)["\']', html
            )
            if mlat and mlng:
                try:
                    la, lo = float(mlat.group(1)), float(mlng.group(1))
                    if in_spain_bbox(la, lo):
                        lat, lng, coord_src = la, lo, "official_data_attr"
                except ValueError:
                    pass
        if not street:
            continue
        # City cleanup: "Sant Cugat Barcelona" → keep as-is or simplify
        city = city or ""
        nm = name or f"Anytime Fitness {city}"
        if not nm.lower().startswith("anytime"):
            nm = f"Anytime Fitness {nm}"
        key = (street.lower(), postal, city.lower())
        if key in seen:
            continue
        seen.add(key)
        rows.append(row(
            "Anytime Fitness", nm, street, postal, city, url,
            lat=lat, lng=lng, opening_hours="24/7",
            notes="official_club_page_json_ld",
            website="https://www.anytimefitness.es",
            coord_source=coord_src,
        ))
        if i % 20 == 0:
            log(f"    fetched {i}/{len(locs)} → {len(rows)}")
        time.sleep(0.12)
    dump("anytime_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Fitness Park Spain
# ---------------------------------------------------------------------------

def discover_fitnesspark() -> list[dict]:
    log("  Fitness Park: sitemap clubs...")
    sm = fetch_cached(
        "https://www.fitnesspark.es/sitemap.xml",
        RAW / "fitnesspark_sitemap.xml",
        force=True,
    )
    locs = re.findall(r"<loc>(https://www\.fitnesspark\.es/club/[^<]+)</loc>", sm or "")
    # Drop region hubs / empty / trailing region-only
    cleaned = []
    for u in locs:
        path = urllib.parse.urlparse(u).path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) < 2:
            continue
        slug = parts[-1]
        # skip bare region pages with no hyphenated club slug heuristics when too short
        if slug in {"madrid", "murcia", "granada", "cantabria", "club"}:
            continue
        cleaned.append(u)
    locs = sorted(set(cleaned))
    log(f"    club URLs: {len(locs)}")
    rows = []
    seen = set()
    for i, url in enumerate(locs, 1):
        slug = url.rstrip("/").split("/")[-1]
        html = fetch_cached(url, PAGES / "fitnesspark" / f"{slug}.html")
        if not html:
            continue
        for n in parse_json_ld_nodes(html):
            r = from_healthclub_node(
                n, "Fitness Park", url, "official_club_page_json_ld", "https://www.fitnesspark.es",
            )
            if not r or not r["address"]:
                continue
            if not r["name"].lower().startswith("fitness"):
                r["name"] = f"Fitness Park {r['name']}"
                r["center_name"] = r["name"]
            # Coming soon markers
            if re.search(r"pr[oó]ximamente|coming soon|ouverture prochaine", html[:12000], re.I):
                r["verification_status"] = "COMING_SOON"
                r["import_category"] = "COMING_SOON"
                r["is_active"] = False
            key = (r["address"].lower(), r.get("postal_code") or "", (r.get("city") or "").lower())
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        if i % 30 == 0:
            log(f"    fetched {i}/{len(locs)} → {len(rows)}")
        time.sleep(0.1)
    dump("fitnesspark_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Dreamfit
# ---------------------------------------------------------------------------

def discover_dreamfit() -> list[dict]:
    log("  Dreamfit: centros listing...")
    html = fetch_cached(
        "https://www.dreamfit.es/centros/",
        RAW / "dreamfit_es_centros_p2.html",
        force=True,
    )
    links = sorted(set(re.findall(
        r'href=["\']((?:https://www\.dreamfit\.es)?/centros/[a-z0-9\-]+)["\']',
        html or "", re.I,
    )))
    urls = []
    for l in links:
        if l.rstrip("/") in {"/centros", "https://www.dreamfit.es/centros"}:
            continue
        if not l.startswith("http"):
            l = "https://www.dreamfit.es" + l
        urls.append(l.rstrip("/"))
    urls = sorted(set(urls))
    log(f"    center URLs: {len(urls)}")
    rows = []
    seen = set()
    for i, url in enumerate(urls, 1):
        slug = url.split("/")[-1]
        page = fetch_cached(url, PAGES / "dreamfit" / f"{slug}.html")
        if not page:
            continue
        for n in parse_json_ld_nodes(page):
            r = from_healthclub_node(
                n, "Dreamfit", url, "official_center_page_json_ld", "https://www.dreamfit.es",
            )
            if not r or not r["address"]:
                continue
            if not r["name"].lower().startswith("dream"):
                r["name"] = f"Dreamfit {r['name']}"
                r["center_name"] = r["name"]
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        time.sleep(0.12)
    dump("dreamfit_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# GO fit
# ---------------------------------------------------------------------------

def discover_gofit() -> list[dict]:
    log("  GO fit: center sitemap...")
    sm = fetch_cached(
        "https://go-fit.es/center-sitemap.xml",
        RAW / "gofit_center_sitemap.xml",
        force=True,
    )
    locs = [
        u for u in re.findall(r"<loc>([^<]+)</loc>", sm or "")
        if "/centros/" in u and u.rstrip("/") != "https://go-fit.es/centros"
    ]
    log(f"    centers: {len(locs)}")
    rows = []
    seen = set()
    for url in locs:
        slug = url.rstrip("/").split("/")[-1]
        html = fetch_cached(url, PAGES / "gofit" / f"{slug}.html")
        if not html:
            continue
        for n in parse_json_ld_nodes(html):
            r = from_healthclub_node(
                n, "GO fit", url, "official_center_page_json_ld", "https://go-fit.es",
            )
            if not r or not r["address"]:
                # try generic LocalBusiness
                a = n.get("address")
                if not isinstance(a, dict):
                    continue
                street = unescape(a.get("streetAddress") or "")
                postal = es_postal(str(a.get("postalCode") or ""))
                city = unescape(a.get("addressLocality") or "")
                if not street:
                    continue
                nm = unescape(n.get("name") or f"GO fit {city}")
                lat, lng, src = parse_geo(n.get("geo") or {})
                r = row(
                    "GO fit", nm, street, postal, city, url,
                    lat=lat, lng=lng, notes="official_center_page_json_ld",
                    website="https://go-fit.es",
                    coord_source=("official_json_ld" if src else None),
                )
            if not r["name"].lower().startswith("go"):
                r["name"] = f"GO fit {r['name']}"
                r["center_name"] = r["name"]
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        # fallback: extract address from page text patterns
        if not any(r["source_url"] == url for r in rows):
            m = re.search(
                r'(Calle|C/|Avda\.?|Avenida|Plaza|Paseo)[^<\n]{5,90}',
                html or "", re.I,
            )
            pc = es_postal(html or "")
            # data-lat
            mlat = re.search(r'"latitude"\s*:\s*"?(-?\d+\.?\d*)"?', html or "")
            mlng = re.search(r'"longitude"\s*:\s*"?(-?\d+\.?\d*)"?', html or "")
            if m:
                street = unescape(m.group(0)).strip(" ,.")
                city_m = re.search(r'addressLocality["\']?\s*:\s*["\']([^"\']+)', html or "")
                city = unescape(city_m.group(1)) if city_m else slug.replace("go-fit-", "").replace("-", " ").title()
                lat = lng = None
                src = None
                if mlat and mlng:
                    try:
                        la, lo = float(mlat.group(1)), float(mlng.group(1))
                        if in_spain_bbox(la, lo):
                            lat, lng, src = la, lo, "official_embedded"
                    except ValueError:
                        pass
                rows.append(row(
                    "GO fit", f"GO fit {city}", street, pc, city, url,
                    lat=lat, lng=lng, notes="official_center_page_fallback",
                    website="https://go-fit.es", coord_source=src,
                ))
        time.sleep(0.12)
    dump("gofit_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Forus — maplist data attributes
# ---------------------------------------------------------------------------

def discover_forus() -> list[dict]:
    log("  Forus: centros-deportivos maplist...")
    html = fetch_cached(
        "https://forus.es/centros-deportivos",
        RAW / "forus_centros_p2.html",
        force=True,
    )
    rows = []
    seen = set()
    for m in re.finditer(
        r'<div[^>]+class="[^"]*maplist__item[^"]*"[^>]*>',
        html or "", re.I,
    ):
        tag = m.group(0)
        # expand to include nearby title
        start = m.start()
        chunk = html[start:start + 1200]
        lat_m = re.search(r'data-lat=["\']([^"\']+)["\']', tag)
        lng_m = re.search(r'data-long=["\']([^"\']+)["\']', tag) or re.search(
            r'data-lng=["\']([^"\']+)["\']', tag
        )
        addr_m = re.search(r'data-address=["\']([^"\']+)["\']', tag)
        name_m = re.search(r'<h3[^>]*>(.*?)</h3>', chunk, re.S | re.I)
        prov_m = re.search(r'class="provincia"[^>]*>(.*?)</p>', chunk, re.S | re.I)
        if not addr_m:
            continue
        full_addr = unescape(addr_m.group(1))
        postal = es_postal(full_addr)
        # "Calle X 15010 - A Coruña" or "Calle X, 15010 A Coruña"
        city = ""
        if " - " in full_addr:
            city = full_addr.split(" - ")[-1].strip()
            street = full_addr.rsplit(" - ", 1)[0]
            street = re.sub(r"\s+\d{5}\s*$", "", street).strip(" ,")
        else:
            street = re.sub(r",?\s*\d{5}.*$", "", full_addr).strip(" ,")
            city_m2 = re.search(r"\d{5}\s+(.+)$", full_addr)
            city = city_m2.group(1).strip() if city_m2 else (unescape(prov_m.group(1)) if prov_m else "")
        name = unescape(re.sub(r"<[^>]+>", "", name_m.group(1))) if name_m else city
        nm = f"Forus {name}" if name and not name.lower().startswith("forus") else (name or f"Forus {city}")
        lat = lng = None
        src = None
        if lat_m and lng_m:
            try:
                la, lo = float(lat_m.group(1)), float(lng_m.group(1))
                if in_spain_bbox(la, lo):
                    lat, lng, src = la, lo, "official_maplist"
            except ValueError:
                pass
        key = (street.lower(), postal, city.lower())
        if not street or key in seen:
            continue
        seen.add(key)
        rows.append(row(
            "Forus", nm, street, postal, city, "https://forus.es/centros-deportivos",
            lat=lat, lng=lng, notes="official_maplist_data_attrs",
            website="https://forus.es", coord_source=src,
        ))
    dump("forus_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Altafit remaining (verify only)
# ---------------------------------------------------------------------------

def discover_altafit() -> list[dict]:
    log("  Altafit: remaining clubs...")
    html = fetch_cached(
        "https://altafitgymclub.com/gimnasios/",
        RAW / "altafit_es_clubs_p2.html",
        force=True,
    )
    links = sorted(set(re.findall(
        r'href=["\'](https://altafitgymclub\.com/gimnasios/[a-z0-9\-]+/?)["\']',
        html or "", re.I,
    )))
    links = [u for u in links if u.rstrip("/") != "https://altafitgymclub.com/gimnasios"]
    rows = []
    seen = set()
    for url in links:
        slug = url.rstrip("/").split("/")[-1]
        page = fetch_cached(url, PAGES / "altafit" / f"{slug}.html", force=True)
        if not page:
            continue
        for n in parse_json_ld_nodes(page):
            r = from_healthclub_node(
                n, "Altafit", url, "official_club_page_json_ld_p2", "https://altafitgymclub.com",
            )
            if not r or not r["address"]:
                continue
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        time.sleep(0.15)
    dump("altafit_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Holiday Gym — Storepoint API
# ---------------------------------------------------------------------------

def discover_holidaygym() -> list[dict]:
    log("  Holiday Gym: Storepoint API...")
    code, text = fetch("https://api.storepoint.co/v1/16a4d00a8c02bb/locations")
    rows = []
    if code != 200:
        log(f"    storepoint failed: {code}")
        dump("holidaygym_spain_p2", rows)
        return rows
    (RAW / "holidaygym_storepoint.json").write_text(text, encoding="utf-8")
    data = json.loads(text)
    locs = (data.get("results") or {}).get("locations") or []
    for loc in locs:
        name = unescape(loc.get("name") or "")
        full = unescape(loc.get("streetaddress") or "")
        postal = es_postal(full)
        # Parse city from trailing ", 28038 Madrid" or "28038 Madrid"
        city = ""
        street = full
        m = re.search(r",?\s*\d{5}\s+([^,]+?)(?:,\s*(?:Madrid|Spain|España|Alicante|.*))?$", full)
        if m:
            city = m.group(1).strip()
            # remove trailing region words from city if duplicated
        # Better: split on postal
        if postal and postal in full:
            before, after = full.split(postal, 1)
            street = before.strip(" ,")
            after = after.strip(" ,")
            # after may be "Madrid" or "Alacant, Alicante"
            city = after.split(",")[0].strip() if after else city
        # Cleanup known city aliases
        city_map = {
            "Alacant": "Alicante",
            "Elx": "Elche",
            "Eivissa": "Ibiza",
        }
        city = city_map.get(city, city)
        lat = lng = None
        src = None
        try:
            la = float(loc.get("loc_lat"))
            lo = float(loc.get("loc_long"))
            if in_spain_bbox(la, lo):
                lat, lng, src = la, lo, "official_storepoint"
        except (TypeError, ValueError):
            pass
        if not street:
            continue
        nm = name if name.lower().startswith("holiday") else f"Holiday Gym {name}"
        rows.append(row(
            "Holiday Gym", nm, street, postal, city,
            loc.get("website") or "https://holidaygym.es/nuestros-centros/",
            lat=lat, lng=lng, notes="official_storepoint_api",
            website="https://holidaygym.es", coord_source=src,
        ))
    dump("holidaygym_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Eurofitness — centre pages (exclude quotes/horaris subpages)
# ---------------------------------------------------------------------------

def discover_eurofitness() -> list[dict]:
    log("  Eurofitness: centres sitemap...")
    sm = fetch_cached(
        "https://eurofitness.com/wp-sitemap-posts-centres-1.xml",
        RAW / "eurofitness_centres_sitemap.xml",
        force=True,
    )
    locs = []
    for u in re.findall(r"<loc>([^<]+)</loc>", sm or ""):
        path = urllib.parse.urlparse(u).path.rstrip("/")
        parts = path.split("/")
        # /centres/{slug} only — no /quotes /horaris etc.
        if len(parts) == 3 and parts[1] == "centres":
            slug = parts[2]
            if slug.startswith("eurofitness") or slug in {
                "olimfit", "uesport", "aiguajoc-centre-de-fitness", "sus-eurofitness",
                "supera-cpm-sant-diego",
            }:
                # Include Eurofitness-branded + known sister brands under Eurofitness group
                # Supera CPM Sant Diego listed on Eurofitness — brand as Supera if supera-
                locs.append(u)
    locs = sorted(set(locs))
    log(f"    centre URLs: {len(locs)}")
    rows = []
    seen = set()
    for url in locs:
        slug = url.rstrip("/").split("/")[-1]
        brand = "Eurofitness"
        if slug.startswith("supera"):
            brand = "Supera"
        html = fetch_cached(url, PAGES / "eurofitness" / f"{slug}.html")
        if not html:
            continue
        got = False
        for n in parse_json_ld_nodes(html):
            r = from_healthclub_node(
                n, brand, url, "official_centre_page_json_ld", "https://eurofitness.com",
            )
            if not r or not r["address"]:
                continue
            key = (brand, r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
            got = True
        if not got:
            # fallback address extraction
            m = re.search(
                r'(Carrer|Calle|Avinguda|Av\.|Plaça|Plaza)[^<\n]{5,100}',
                html or "", re.I,
            )
            pc = es_postal(html[:20000] if html else "")
            if m:
                street = unescape(m.group(0)).strip(" ,.")
                city = "Barcelona"
                rows.append(row(
                    brand, f"{brand} {slug.replace('-', ' ').title()}",
                    street, pc, city, url,
                    notes="official_centre_page_fallback",
                    website="https://eurofitness.com",
                ))
        time.sleep(0.12)
    dump("eurofitness_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# BeOne — real gym floors only (province/city pages, not activity SEO pages)
# ---------------------------------------------------------------------------

def discover_beone() -> list[dict]:
    log("  BeOne: centros-deportivos (gym floors only)...")
    html = fetch_cached(
        "https://beone.es/centros-deportivos",
        RAW / "beone_centros_p2.html",
        force=True,
    )
    # Prefer links that are exactly /centros-deportivos/{provincia}/{slug} (2 levels)
    links = sorted(set(re.findall(
        r'href=["\'](https://beone\.es/centros-deportivos/[a-z0-9\-]+/[a-z0-9\-]+)/?["\']',
        html or "", re.I,
    )))
    # Filter out activity pages (3+ path segments already excluded). Also drop /en/ /eu/
    links = [u for u in links if "/en/" not in u and "/eu/" not in u]
    # Exclude known activity-only slug fragments when they appear as center? Keep all 2-level.
    log(f"    center URLs: {len(links)}")
    rows = []
    seen = set()
    exclusions = []
    for url in links:
        slug = url.rstrip("/").split("/")[-1]
        # Skip if slug looks like activity landing when scraped page says yoga-only? We'll check JSON-LD.
        page = fetch_cached(url, PAGES / "beone" / f"{slug}.html")
        if not page:
            continue
        # Exclude pure boutique activity pages if title is only yoga/pilates without gym floor signals
        title_m = re.search(r"<title>([^<]+)</title>", page, re.I)
        title = unescape(title_m.group(1)) if title_m else ""
        gym_signals = re.search(
            r"gimnasio|sala de musculaci[oó]n|fitness|pesas|cardio|musculaci",
            page[:25000], re.I,
        )
        activity_only = re.search(
            r"\b(yoga|pilates|zumba|spinning)\b", title, re.I,
        ) and not gym_signals
        if activity_only:
            exclusions.append({"url": url, "reason": "activity_seo_page"})
            continue
        got = False
        for n in parse_json_ld_nodes(page):
            r = from_healthclub_node(
                n, "BeOne", url, "official_center_page_json_ld", "https://beone.es",
            )
            if not r or not r["address"]:
                continue
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            if not r["name"].lower().startswith("beone"):
                r["name"] = f"BeOne {r['name']}"
                r["center_name"] = r["name"]
            rows.append(r)
            got = True
        if not got:
            # data attributes / address blocks
            m = re.search(
                r'(Calle|C/|Avda\.?|Avenida|Rúa|Rua|Plaza)[^<\n]{5,90}',
                page or "", re.I,
            )
            pc = es_postal(page[:30000] if page else "")
            mlat = re.search(r'data-lat=["\']([^"\']+)["\']', page or "")
            mlng = re.search(r'data-lng=["\']([^"\']+)["\']', page or "")
            if m:
                street = unescape(m.group(0)).strip(" ,.")
                city = slug.replace("-", " ").title()
                lat = lng = None
                src = None
                if mlat and mlng:
                    try:
                        la, lo = float(mlat.group(1)), float(mlng.group(1))
                        if in_spain_bbox(la, lo):
                            lat, lng, src = la, lo, "official_data_attr"
                    except ValueError:
                        pass
                rows.append(row(
                    "BeOne", f"BeOne {city}", street, pc, city, url,
                    lat=lat, lng=lng, notes="official_center_page_fallback",
                    website="https://beone.es", coord_source=src,
                ))
        time.sleep(0.12)
    (RAW / "beone_exclusions_p2.json").write_text(
        json.dumps(exclusions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    dump("beone_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# O2 Centro Wellness
# ---------------------------------------------------------------------------

def discover_o2() -> list[dict]:
    log("  O2 Centro Wellness...")
    city_pages = [
        "https://o2cw.es/gimnasios/barcelona/",
        "https://o2cw.es/gimnasios/girona/",
        "https://o2cw.es/gimnasios/granada/",
        "https://o2cw.es/gimnasios/huelva/",
        "https://o2cw.es/gimnasios/madrid/",
        "https://o2cw.es/gimnasios/malaga/",
    ]
    club_urls = set()
    for cu in city_pages:
        html = fetch_cached(cu, RAW / f"o2_{cu.rstrip('/').split('/')[-1]}.html", force=True)
        for u in re.findall(r'href=["\'](https://o2cw\.es/gimnasios/[^"\']+)["\']', html or ""):
            path = urllib.parse.urlparse(u).path.rstrip("/")
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 3:  # gimnasios/city/club
                club_urls.add(u.split("?")[0].rstrip("/") + "/")
        time.sleep(0.1)
    # Also from homepage listing
    home = fetch_cached("https://o2cw.es/gimnasios/", RAW / "o2_gimnasios.html", force=True)
    for u in re.findall(r'href=["\'](https://o2cw\.es/gimnasios/[^"\']+)["\']', home or ""):
        path = urllib.parse.urlparse(u).path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) >= 3:
            club_urls.add(u.split("?")[0].rstrip("/") + "/")
    log(f"    club URLs: {len(club_urls)}")
    rows = []
    seen = set()
    for url in sorted(club_urls):
        slug = url.rstrip("/").split("/")[-1]
        page = fetch_cached(url, PAGES / "o2" / f"{slug}.html")
        if not page:
            continue
        for n in parse_json_ld_nodes(page):
            r = from_healthclub_node(
                n, "O2 Centro Wellness", url, "official_gym_page_json_ld", "https://o2cw.es",
            )
            if not r or not r["address"]:
                continue
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        if not any(r["source_url"].rstrip("/") == url.rstrip("/") for r in rows):
            m = re.search(
                r'(Calle|C/|Avda\.?|Avenida|Plaza|Paseo)[^<\n]{5,90}',
                page or "", re.I,
            )
            pc = es_postal(page[:25000] if page else "")
            if m:
                street = unescape(m.group(0)).strip(" ,.")
                city = url.rstrip("/").split("/")[-2].replace("-", " ").title()
                rows.append(row(
                    "O2 Centro Wellness", f"O2 {slug.replace('-', ' ').title()}",
                    street, pc, city, url,
                    notes="official_gym_page_fallback", website="https://o2cw.es",
                ))
        time.sleep(0.12)
    dump("o2_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Metropolitan
# ---------------------------------------------------------------------------

def discover_metropolitan() -> list[dict]:
    log("  Metropolitan: city club pages...")
    city_urls = [
        "https://clubmetropolitan.com/clubs/barcelona/",
        "https://clubmetropolitan.com/clubs/madrid/",
        "https://clubmetropolitan.com/clubs/bilbao/",
        "https://clubmetropolitan.com/clubs/zaragoza/",
    ]
    rows = []
    seen = set()
    for url in city_urls:
        html = fetch_cached(url, RAW / f"metro_{url.rstrip('/').split('/')[-1]}.html", force=True)
        if not html:
            continue
        # Find blocks with addresses
        for m in re.finditer(
            r'(Carrer|Calle|Avenida|Av\.|Plaza|Paseo|Passeig)[^<\n]{5,120}',
            html, re.I,
        ):
            street_full = unescape(m.group(0)).strip(" ,.")
            postal = es_postal(street_full)
            # Look backward for club name
            start = max(0, m.start() - 400)
            window = html[start:m.start()]
            name_m = re.findall(
                r'(Metropolitan[^<]{0,60}|MET\s+[A-ZÁÉÍÓÚÑ][^<]{0,40})',
                window, re.I,
            )
            name = unescape(re.sub(r"<[^>]+>", "", name_m[-1])).strip() if name_m else ""
            city = url.rstrip("/").split("/")[-1].replace("-", " ").title()
            street = re.sub(r",?\s*\d{5}.*$", "", street_full).strip(" ,")
            if postal and postal in street_full:
                after = street_full.split(postal, 1)[-1].strip(" ,")
                if after:
                    city = after.split(",")[0].strip() or city
            if len(street) < 5:
                continue
            key = (street.lower(), postal)
            if key in seen:
                continue
            seen.add(key)
            nm = name if name.lower().startswith("metropolitan") else (
                f"Metropolitan {name}" if name else f"Metropolitan {city} {street[:30]}"
            )
            rows.append(row(
                "Metropolitan", nm, street, postal, city, url,
                notes="official_city_page_address",
                website="https://clubmetropolitan.com",
            ))
        time.sleep(0.15)
    dump("metropolitan_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# DIR enrichment — club pages from dir.cat
# ---------------------------------------------------------------------------

def discover_dir() -> list[dict]:
    log("  DIR: enrich from dir.cat...")
    # Keep Phase 1 rows; try to get better coords from center pages
    listing = fetch_cached(
        "https://www.dir.cat/es/centers",
        RAW / "dir_centers_p2.html",
        force=True,
    )
    if not listing:
        listing = fetch_cached(
            "https://www.dir.cat/es/centers/barcelona",
            RAW / "dir_barcelona_p2.html",
            force=True,
        )
    links = sorted(set(re.findall(
        r'href=["\']((?:https://www\.dir\.cat)?/es/centers/[^"\']+)["\']',
        listing or "", re.I,
    )))
    urls = []
    for l in links:
        if "yogaone" in l.lower() or "yoga-one" in l.lower():
            continue
        if not l.startswith("http"):
            l = "https://www.dir.cat" + l
        # skip pure listing hubs
        path = urllib.parse.urlparse(l).path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) >= 4:  # es/centers/city/club
            urls.append(l.split("?")[0])
    urls = sorted(set(urls))
    log(f"    center URLs: {len(urls)}")
    rows = []
    seen = set()
    for url in urls:
        if "yogaone" in url.lower():
            continue
        slug = url.rstrip("/").split("/")[-1]
        page = fetch_cached(url, PAGES / "dir" / f"{slug}.html")
        if not page:
            continue
        for n in parse_json_ld_nodes(page):
            r = from_healthclub_node(
                n, "DIR", url, "official_center_page_json_ld_p2", "https://www.dir.cat",
            )
            if not r or not r["address"]:
                continue
            # Normalize brand variants DiR / BDiR stay under DIR chain
            nm = r["name"]
            if re.search(r"yoga\s*one|yogaone", nm, re.I):
                continue
            key = (r["address"].lower(), r.get("postal_code") or "")
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
        time.sleep(0.12)
    dump("dir_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Basic-Fit sanity refresh (Spain only)
# ---------------------------------------------------------------------------

def discover_basicfit_refresh() -> list[dict]:
    log("  Basic-Fit: sanity refresh club-finder page 1...")
    # Reuse Phase 1 approach lightly — fetch first pages to catch new openings
    rows = []
    seen_urls = set()
    for page_start in [1, 129, 257]:
        finder_url = f"https://www.basic-fit.com/en-es/club-finder?s={page_start}&sz=128"
        html = fetch_cached(
            finder_url, RAW / f"basicfit_es_clubfinder_p2_s{page_start}.html", force=True,
        )
        if not html:
            break
        club_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-es/clubs/basic-fit-[^\s"<>\']+\.html)',
            html,
        )
        opening_urls = re.findall(
            r'(https://www\.basic-fit\.com/en-es/clubs/opening-clubs[^\s"<>\']+)',
            html,
        )
        for u in club_urls + opening_urls:
            seen_urls.add(u)
        time.sleep(0.2)

    ld_items = {}
    for dest_file in sorted(RAW.glob("basicfit_es_clubfinder*.html")):
        html = dest_file.read_text(encoding="utf-8", errors="replace")
        for n in parse_json_ld_nodes(html):
            if n.get("@type") == "ItemList":
                for entry in (n.get("itemListElement") or []):
                    item = entry.get("item") or {}
                    url = item.get("url") or ""
                    if url and "/en-es/" in url:
                        ld_items[url] = item

    for url, item in ld_items.items():
        addr = item.get("address") or {}
        street = unescape(addr.get("streetAddress") or "")
        postal = es_postal(str(addr.get("postalCode") or ""))
        city = unescape(addr.get("addressLocality") or "")
        cc = (addr.get("addressCountry") or "").upper()
        if cc and cc not in ("ES", "SPAIN", "ESPAÑA", ""):
            continue
        if not street:
            continue
        name = unescape(item.get("name") or f"Basic-Fit {city}")
        if not name.lower().startswith("basic"):
            name = f"Basic-Fit {name}"
        lat, lng, src = parse_geo(item.get("geo") or {})
        coming = "opening-clubs" in url.lower() or "coming-soon" in url.lower()
        rows.append(row(
            "Basic-Fit", name, street, postal, city, url,
            lat=lat, lng=lng, notes="official_clubfinder_json_ld_p2",
            coming=coming, website="https://www.basic-fit.com",
            coord_source=("official_json_ld" if src else None),
        ))
    dump("basicfit_spain_p2", rows)
    log(f"    basicfit refresh rows: {len(rows)} (urls seen {len(seen_urls)})")
    return rows


# ---------------------------------------------------------------------------
# McFIT confirmation
# ---------------------------------------------------------------------------

def discover_mcfit_confirm() -> list[dict]:
    log("  McFIT Spain: confirm acquisition (expect empty)...")
    code, text = fetch(
        "https://rsg-group.api.magicline.com/connect/v1/studio?studioTags=MCFIT&country=ES",
        headers={"Accept": "application/json", "x-tenant": "rsg"},
    )
    (RAW / "mcfit_es_api_p2.json").write_text(text or "[]", encoding="utf-8")
    rows = []
    try:
        data = json.loads(text) if text else []
    except Exception:
        data = []
    if isinstance(data, list) and data:
        log(f"    WARNING: McFIT API returned {len(data)} studios — unexpected")
    else:
        log("    McFIT ES API empty — estate absorbed into Basic-Fit (2024)")
    note = {
        "status": "COMPLETE_VIA_BASIC_FIT",
        "api_count": len(data) if isinstance(data, list) else 0,
        "note": "All McFIT Spain studios sold to Basic-Fit in 2024; no separate McFIT estate.",
    }
    (RAW / "mcfit_spain_phase2_note.json").write_text(
        json.dumps(note, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    dump("mcfit_spain_p2", rows)
    return rows


# ---------------------------------------------------------------------------
# Synergym — preserve Phase 1 parsed list; try to enrich from any reachable pages
# ---------------------------------------------------------------------------

def discover_synergym_enrich() -> list[dict]:
    log("  Synergym: reload parsed Phase 1 list for Phase 2 geocode enrichment...")
    path = SCRAPES / "synergym_parsed.json"
    rows = []
    if not path.exists():
        dump("synergym_spain_p2", rows)
        return rows
    data = json.loads(path.read_text(encoding="utf-8"))
    for c in data:
        rows.append(row(
            "Synergym",
            c.get("name") or "",
            c.get("address") or "",
            "",  # still missing — geocode may recover
            c.get("city") or "",
            "https://synergym.es/",
            notes="phase1_homepage_parsed_carried_to_phase2",
            coming=bool(c.get("coming_soon")),
            website="https://synergym.es",
        ))
    # Site is Incapsula-protected; document
    (RAW / "synergym_phase2_note.json").write_text(
        json.dumps({
            "note": "synergym.es blocked by Incapsula for deep club pages; "
                    "Phase 2 carries Phase 1 address+city list for Nominatim enrichment.",
            "count": len(rows),
        }, indent=2),
        encoding="utf-8",
    )
    dump("synergym_spain_p2", rows)
    return rows


def main():
    t0 = time.time()
    all_rows = []
    for fn in [
        discover_mcfit_confirm,
        discover_vivagym,
        discover_anytime,
        discover_fitnesspark,
        discover_dreamfit,
        discover_gofit,
        discover_forus,
        discover_altafit,
        discover_holidaygym,
        discover_eurofitness,
        discover_beone,
        discover_o2,
        discover_metropolitan,
        discover_dir,
        discover_basicfit_refresh,
        discover_synergym_enrich,
    ]:
        try:
            rows = fn()
            all_rows.extend(rows)
            log(f"== {fn.__name__}: {len(rows)} ==")
        except Exception as e:
            log(f"ERROR {fn.__name__}: {e}")
    combined = OUT / "spain_discovery_phase2.json"
    combined.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"TOTAL Phase 2 discoveries: {len(all_rows)} in {round(time.time()-t0)}s")
    log(f"wrote {combined}")


if __name__ == "__main__":
    main()
