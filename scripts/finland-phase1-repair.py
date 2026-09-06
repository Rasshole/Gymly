#!/usr/bin/env python3
"""
Repair Finland Phase 1 staging from official club/contact pages.

Does NOT modify src/data/centers.json.
Re-geocodes only rows whose address changed or that still lack coordinates.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import time
from collections import Counter
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location(
    "fi_con", ROOT / "scripts/finland-phase1-consolidate.py"
)
fi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fi)

OUT = fi.OUT
STAGING = fi.STAGING
CACHE = fi.CACHE
PAGES = OUT / "raw" / "pages"

LADYLINE_OFFICIAL = {
    "kuopio": ("Leväsentie 2 B", "70700", "Kuopio"),
    "vaasa-ritz": ("Kirkkopuistikko 22", "65100", "Vaasa"),
    "kouvola": ("Kauppamiehenkatu 4", "45100", "Kouvola"),
    "rovaniemi": ("Vapaudentie 2-4", "96100", "Rovaniemi"),
    "porvoo": ("Rauhankatu 33", "06100", "Porvoo"),
    "mikkeli": ("Ratamonkatu 5", "50100", "Mikkeli"),
    "loimaa": ("Hossinkatu 1-3", "32200", "Loimaa"),
    "kotka": ("Ruotsinsalmenkatu 24", "48100", "Kotka"),
    "kajaani": ("Lönnrotinkatu 18", "87100", "Kajaani"),
    "joensuu": ("Torikatu 21 C", "80100", "Joensuu"),
    "iisalmi": ("Kilpivirrantie 7", "74120", "Iisalmi"),
    "oulu": ("Poratie 5 E", "90140", "Oulu"),
    "espoo-lippulaiva": ("Espoonlahdenkatu 8", "02320", "Espoo"),
    "lahti": ("Kauppakatu 17", "15140", "Lahti"),
}

# Official PTVGYM contacts page (current consumer-facing list).
PTVGYM_OFFICIAL = {
    "espoo": ("Päivänkakkarantie 8", "02270", "Espoo", "PTVGYM Espoo"),
    "pitajanmaki": ("Höyläämötie 14", "00380", "Helsinki", "PTVGYM Helsinki Pitäjänmäki"),
    "roihupelto": ("Laippatie 4", "00880", "Helsinki", "PTVGYM Helsinki Roihupelto"),
    "joensuu": ("Teollisuuskatu 5-7", "80100", "Joensuu", "PTVGYM Joensuu"),
    "jyvaskyla": ("Vasarakatu 25", "40320", "Jyväskylä", "PTVGYM Jyväskylä"),
    "kouvola": ("Tommolankatu 12", "45130", "Kouvola", "PTVGYM Kouvola"),
    "kuopio": ("Kartanonkatu 4A", "70700", "Kuopio", "PTVGYM Kuopio"),
    "lahti": ("Keijutie 31", "15700", "Lahti", "PTVGYM Lahti"),
    "lappeenranta": ("Kauppiaankatu 2", "53550", "Lappeenranta", "PTVGYM Lappeenranta"),
    "oulu": ("Poratie 5", "90150", "Oulu", "PTVGYM Oulu"),
    "porvoo": ("Puusepänkaarre 7", "06150", "Porvoo", "PTVGYM Porvoo"),
    "seinajoki": ("Kauppaneliö 10", "60210", "Seinäjoki", "PTVGYM Seinäjoki"),
    "tampere": ("Kuokkamaantie 8", "33800", "Tampere", "PTVGYM Tampere"),
    "turku": ("Postikatu 3", "20250", "Turku", "PTVGYM Turku"),
    "vantaa": ("Tikkurilantie 10", "01370", "Vantaa", "PTVGYM Vantaa"),
}

FOREVER_OFFICIAL = {
    "herttoniemi": ("Hitsaajankatu 10", "00810", "Helsinki", "Forever Herttoniemi"),
    "toolo": ("Mannerheimintie 50", "00260", "Helsinki", "Forever Töölö"),
    "matinkyla": ("Matinkartanontie 1", "02230", "Espoo", "Forever Matinkylä"),
    "leppavaara": ("Konstaapelinkatu 4", "02650", "Espoo", "Forever Leppävaara"),
    "espoon-keskus": ("Kaivomestarinniitty 2", "02770", "Espoo", "Forever Espoon keskus"),
    "omena": ("Puolikkotie 8", "02230", "Espoo", "Forever Espoon Omena"),
    "varisto": ("Martinkyläntie 39 B", "01720", "Vantaa", "Forever Varisto"),
    "hiekkaharju": ("Tennistie 3", "01370", "Vantaa", "Forever Hiekkaharju"),
    "kerava": ("Kultasepänkatu 5", "04250", "Kerava", "Forever Kerava"),
    "jarvenpaa": ("Wärtsilänkatu 8B", "04410", "Järvenpää", "Forever Järvenpää"),
    "sveitsi": ("Härkävehmaankatu 4", "05900", "Hyvinkää", "Forever Hyvinkää Sveitsi"),
    "lahti": ("Svinhufvudinkatu 23", "15110", "Lahti", "Forever Lahti"),
    "hameenlinna": ("Vanajantie 10B", "13110", "Hämeenlinna", "Forever Hämeenlinna"),
    "tampere": ("Kihlmaninraitti 1", "33100", "Tampere", "Forever Tampere Tampella"),
    "leaf": ("Kärsämäentie 35", "20360", "Turku", "Forever Turku Leaf Areena"),
    "kuopio": ("Kolmisopentie 3", "70780", "Kuopio", "Forever Kuopio"),
    "lappeenranta": ("Pelite 36", "53810", "Lappeenranta", "Forever Lappeenranta Huhtari"),
    "fit1-vaasa-xxl": ("Sepänkyläntie 4", "65100", "Vaasa", "Forever Vaasa Sepänkyläntie"),
    "sepankyla": ("Sepänkyläntie 4", "65100", "Vaasa", "Forever Vaasa Sepänkyläntie"),
    "fit1-vaasa": ("Klemetinkatu 17", "65100", "Vaasa", "Forever Vaasa Klemetinkatu"),
}

GA_OFFICIAL = {
    "kurikka": ("Niittypolku 1", "61300", "Kurikka", "https://gymanytime.fi/kurikka/"),
    "rauma": ("Valtakatu 13", "26100", "Rauma", "https://gymanytime.fi/rauma/"),
    "tampere": ("Vaajakatu 11", "33720", "Tampere", "https://gymanytime.fi/tampere/"),
    "valkeakoski": ("Valtakatu 9-11", "37600", "Valkeakoski", "https://gymanytime.fi/valkeakoski/"),
    "varkaus": ("Pirnankatu 4", "78200", "Varkaus", "https://gymanytime.fi/varkaus/"),
}

CITY_JUNK = re.compile(
    r"\s+(Asiakaspalvelu|Sijaintimme|pysäköint|Mannerheimintie|Puh|Vastaanoton|Aika).*$",
    re.I,
)


def slug_from_url(url: str) -> str:
    path = (url or "").rstrip("/").split("?")[0]
    return path.split("/")[-1].lower()


def apply_addr(r, street, postal, city, note=None, name=None):
    old = (r.get("address"), str(r.get("postal_code") or ""), r.get("city"))
    new = (street, postal, city)
    r["address"] = street
    r["postal_code"] = postal
    r["city"] = city
    r["country"] = "Finland"
    if name:
        r["name"] = name
        r["center_name"] = name
    if note:
        r["notes"] = ((r.get("notes") or "") + "; " + note).strip("; ")
    if old != new:
        if r.get("import_category") not in {"COMING_SOON", "CLOSED"}:
            r["lat"] = r["lng"] = None
            r["coord_source"] = None
            r["geocode_status"] = None
            r["import_category"] = "NEEDS_COORDINATES"
        r["_addr_changed"] = True
    r["id"] = fi.make_id(r.get("brand"), street, postal, city, r.get("source_url"))
    return r


def parse_olefit_details(html: str):
    html = unescape(html)
    m = re.search(r'class="business-details">(.*?)</div>', html, re.S)
    street = postal = city = ""
    if m:
        t = re.sub(r"<br\s*/?>", "\n", m.group(1), flags=re.I)
        t = re.sub(r"<[^>]+>", " ", t)
        lines = [re.sub(r"\s+", " ", x).strip() for x in t.split("\n")]
        lines = [x for x in lines if x and x.lower() not in {"ole.fit", "fit"}]
        for line in lines:
            pc = re.search(r"\b(\d{5})\b", line)
            if pc and not postal:
                postal = pc.group(1)
                city = re.sub(r".*\d{5}\s*", "", line).strip(" /")
                city = city.split("/")[0].strip()
                continue
            if re.search(r"\d", line) and not street and "palvelu" not in line.lower() and "@" not in line:
                street = re.sub(r"^Käyntiosoite:\s*", "", line, flags=re.I)
                street = street.split(",")[0].strip()
                street = re.sub(r"\s*\(.*$", "", street).strip()
                street = re.sub(r"^Vanha Kutomo,\s*", "", street)
    if not street:
        hits = re.findall(
            r"([A-ZÅÄÖ][A-Za-zÅÄÖåäö\- ]+\d+[A-Za-z0-9/\-]*)[,\s]+(\d{5})\s+([A-ZÅÄÖa-zåäö\-]+)",
            re.sub(r"<[^>]+>", " ", html),
        )
        hits = [h for h in hits if "Mannerheim" not in h[0]]
        if hits:
            street, postal, city = hits[0]
    street = re.sub(r"\s+", " ", street or "").strip(" ,")
    city = CITY_JUNK.sub("", city or "").strip()
    city = re.sub(r"\s+", " ", city).title() if city.isupper() else city
    return street, postal, city


def olefit_slug(url: str) -> str:
    path = (url or "").rstrip("/").split("kuntokeskukset/")[-1]
    return path.replace("/", "__").replace("-", "_") if False else path.replace("/", "__")


def match_forever(url: str):
    u = (url or "").lower()
    for key, val in FOREVER_OFFICIAL.items():
        if key in u:
            return val
    return None


def match_ptv(url: str):
    u = (url or "").lower()
    # longest key first so pitajanmaki / roihupelto beat generic helsinki
    for key in sorted(PTVGYM_OFFICIAL, key=len, reverse=True):
        if key in u:
            return PTVGYM_OFFICIAL[key]
    return None


def clean_city(city: str) -> str:
    city = re.sub(r"\s+", " ", city or "").strip(" ,")
    city = CITY_JUNK.sub("", city)
    parts = city.split()
    if len(parts) >= 2 and parts[0][0].isupper() and parts[-1].islower() and len(parts[-1]) > 3:
        city = parts[0]
    if city.endswith(" p"):
        city = city[:-2].strip()
    return city.strip(" ,")


def main():
    rows = json.loads(STAGING.read_text(encoding="utf-8"))
    print("loaded staging", len(rows), flush=True)

    # --- LadyLine ---
    for r in rows:
        if r.get("brand") != "LadyLine":
            continue
        slug = slug_from_url(r.get("source_url"))
        if slug in LADYLINE_OFFICIAL:
            street, postal, city = LADYLINE_OFFICIAL[slug]
            apply_addr(
                r,
                street,
                postal,
                city,
                note="official_ladyline_yhteystiedot",
                name=r.get("name"),
            )

    # --- PTVGYM ---
    for r in rows:
        if r.get("brand") != "PTVGYM":
            continue
        hit = match_ptv(r.get("source_url") or "")
        if hit:
            street, postal, city, name = hit
            apply_addr(r, street, postal, city, note="official_ptvgym_yhteystiedot", name=name)
            if "jyvaskyla" in (r.get("source_url") or "") and street.startswith("Vasara"):
                r["notes"] = (
                    (r.get("notes") or "")
                    + "; club tab still showed Alasinkatu 3 — used current yhteystiedot Vasarakatu 25"
                ).strip("; ")

    # --- Forever overlay + restore Leppävaara ---
    forever_urls = {r.get("source_url") for r in rows if r.get("brand") == "Forever"}
    for r in rows:
        if r.get("brand") != "Forever":
            continue
        hit = match_forever(r.get("source_url") or "")
        if hit:
            street, postal, city, name = hit
            apply_addr(r, street, postal, city, note="official_forever_toimipisteet_ja_hinnat", name=name)
            r["city"] = city
    if not any("leppavaara" in (u or "") for u in forever_urls):
        street, postal, city, name = FOREVER_OFFICIAL["leppavaara"]
        rec = {
            "brand": "Forever",
            "chain": "Forever",
            "name": name,
            "center_name": name,
            "address": street,
            "postal_code": postal,
            "city": city,
            "country": "Finland",
            "lat": None,
            "lng": None,
            "opening_hours": None,
            "website": "https://www.foreverclub.fi",
            "source_url": "https://www.foreverclub.fi/toimipisteet/espoo/leppavaara/",
            "verification_status": "VERIFIED_CURRENT",
            "legacy_brand": None,
            "notes": "official_forever_toimipisteet_ja_hinnat; restored after HQ-address collapse",
            "is_active": True,
            "import_category": "NEEDS_COORDINATES",
            "phase": "finland_phase1",
            "coord_source": None,
            "format": "Forever Premium",
            "encoding_flag": False,
            "_addr_changed": True,
        }
        rec["id"] = fi.make_id("Forever", street, postal, city, rec["source_url"])
        rows.append(rec)
        print("restored Forever Leppävaara", flush=True)

    # --- GYM Anytime ---
    rows = [r for r in rows if r.get("brand") != "GYM Anytime"]
    for city_key, (street, postal, city, url) in GA_OFFICIAL.items():
        rec = {
            "brand": "GYM Anytime",
            "chain": "GYM Anytime",
            "name": f"GYM Anytime {city}",
            "center_name": f"GYM Anytime {city}",
            "address": street,
            "postal_code": postal,
            "city": city,
            "country": "Finland",
            "lat": None,
            "lng": None,
            "opening_hours": "24/7",
            "website": "https://gymanytime.fi",
            "source_url": url,
            "verification_status": "VERIFIED_CURRENT",
            "legacy_brand": None,
            "notes": "current consumer brand GYM Anytime; GOGO Express rebrand planned early 2027 — not yet rebranded; address from official city page (not Valkeakoski JSON-LD)",
            "is_active": True,
            "import_category": "NEEDS_COORDINATES",
            "phase": "finland_phase1",
            "coord_source": None,
            "format": None,
            "encoding_flag": False,
            "_addr_changed": True,
        }
        rec["id"] = fi.make_id("GYM Anytime", street, postal, city, url)
        rows.append(rec)

    # --- EasyFit Pasila + city cleanup ---
    for r in rows:
        if r.get("brand") != "EasyFit":
            continue
        if "pasila" in (r.get("source_url") or "").lower() or "Pasila" in (r.get("name") or ""):
            apply_addr(
                r,
                "Maistraatinportti 3",
                "00240",
                "Helsinki",
                note="official_club_yhteystiedot Scandic Pasila",
                name="EasyFit Helsinki – Pasila",
            )
        r["city"] = clean_city(r.get("city") or "")
        if r.get("city") in {"img", "Raisio Puh"}:
            if "pasila" in (r.get("name") or "").lower():
                r["city"] = "Helsinki"
            elif "raisio" in (r.get("name") or "").lower():
                r["city"] = "Raisio"

    # --- Ole.Fit from official club footers ---
    ole_pages = {p.stem: p for p in (PAGES / "olefit").glob("*.html")}
    for r in rows:
        if r.get("brand") != "Ole.Fit":
            continue
        url = r.get("source_url") or ""
        slug = url.rstrip("/").split("kuntokeskukset/")[-1].replace("/", "__")
        page = ole_pages.get(slug)
        if not page:
            # try filename variants
            for stem, p in ole_pages.items():
                if stem.replace("__", "/") in url or stem.split("__")[-1] in url:
                    page = p
                    break
        if page:
            street, postal, city = parse_olefit_details(page.read_text(encoding="utf-8", errors="replace"))
            if street and postal and city:
                coming = r.get("import_category") == "COMING_SOON"
                apply_addr(r, street, postal, city, note="official_olefit_business_details")
                if coming:
                    r["import_category"] = "COMING_SOON"
                    r["lat"] = r["lng"] = None
        r["city"] = clean_city(r.get("city") or "")

    # generic city cleanup
    for r in rows:
        r["city"] = clean_city(r.get("city") or "")
        r["postal_code"] = fi.fi_postal(r.get("postal_code")) or r.get("postal_code")
        r["country"] = "Finland"
        if r.get("import_category") not in {"COMING_SOON", "CLOSED", "DUPLICATE", "NEEDS_REVIEW"}:
            r["id"] = fi.make_id(
                r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"), r.get("source_url")
            )

    # collapse same ids
    kept, seen = [], {}
    collapsed = []
    for r in rows:
        i = r["id"]
        if i in seen:
            collapsed.append({"id": i, "kept": seen[i].get("name"), "dropped": r.get("name")})
            continue
        seen[i] = r
        kept.append(r)
    rows = kept
    print("after collapse", len(rows), "collapsed", len(collapsed), flush=True)

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = []
    for r in rows:
        if r.get("import_category") in {"COMING_SOON", "CLOSED"}:
            continue
        if r.get("_addr_changed") or r.get("import_category") in {None, "NEEDS_COORDINATES"}:
            todo.append(r)
        elif r.get("import_category") == "NEEDS_REVIEW" and r.get("address") and r.get("postal_code") and r.get("city"):
            r["import_category"] = "NEEDS_COORDINATES"
            todo.append(r)
    print("geocode todo", len(todo), flush=True)
    for i, r in enumerate(todo, 1):
        if r.get("import_category") == "NEEDS_REVIEW" and not r.get("_addr_changed"):
            continue
        if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None and not r.get("_addr_changed"):
            continue
        fi.geocode_row(r, cache)
        if i % 15 == 0:
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
            ready = sum(1 for x in rows if x.get("import_category") == "READY_TO_IMPORT")
            print(f"  geocoded {i}/{len(todo)} READY={ready}", flush=True)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")

    for r in rows:
        r.pop("_addr_changed", None)
        if r.get("import_category") == "READY_TO_IMPORT" and not fi.in_fi_bbox(r.get("lat"), r.get("lng")):
            r["import_category"] = "NEEDS_COORDINATES"
            r["lat"] = r["lng"] = None

    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    live_report, centers = fi.vs_live(rows)
    staging_report = fi.staging_dupes(rows)
    dup = {
        "vs_live": live_report,
        "vs_staging": staging_report,
        "collapsed": collapsed[:50],
        "collapsed_count": len(collapsed),
        "repair": {
            "ladyline": "official ladyline.fi/yhteystiedot",
            "ptvgym": "official ptvgym.fi yhteystiedot; Kouvola Tommolankatu 12; Jyväskylä Vasarakatu 25",
            "forever": "official foreverclub.fi/toimipisteet-ja-hinnat; Leppävaara restored",
            "olefit": "official club business-details footers",
            "gym_anytime": "official city pages, not shared Valkeakoski JSON-LD",
        },
    }
    (OUT / "finland_duplicate_analysis.json").write_text(
        json.dumps(dup, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    fi.write_geocode_review(rows)
    fi.write_excel(rows)
    n_live = len(centers)
    fi.write_report(rows, live_report, staging_report, collapsed, n_live)

    cats = Counter(r.get("import_category") for r in rows)
    print("DONE", dict(cats), "n", len(rows), flush=True)
    from collections import defaultdict

    b = defaultdict(list)
    for r in rows:
        b[r.get("brand")].append(r)
    for brand, rs in sorted(b.items()):
        c = Counter(x.get("import_category") for x in rs)
        print(
            f"{brand:20} {len(rs):3} READY={c.get('READY_TO_IMPORT',0):3} "
            f"NC={c.get('NEEDS_COORDINATES',0):3} NR={c.get('NEEDS_REVIEW',0):3} CS={c.get('COMING_SOON',0):3}",
            flush=True,
        )
    print("READY", cats.get("READY_TO_IMPORT", 0), "expected", n_live + cats.get("READY_TO_IMPORT", 0), flush=True)


if __name__ == "__main__":
    main()
