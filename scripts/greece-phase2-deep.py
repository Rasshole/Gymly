#!/usr/bin/env python3
"""
Greece Deep Phase 2 — nationwide catalog expansion.
Preserves Phase 1 READY unless stronger evidence invalidates.
Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    GREECE_POSTAL_RE,
    MOJIBAKE_RE,
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    format_gr_postal,
    haversine,
    in_greece,
    load_production,
    make_id,
    nominatim_geocode,
    norm_addr,
    production_collisions,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/greece"
PHASE2 = OUT / "phase2"
RAW = OUT / "raw"
PAGES = RAW / "pages"
YAVA_DIR = PAGES / "yava"
PLANET_DIR = PAGES / "planet"
for d in (OUT, PHASE2, RAW, PAGES, YAVA_DIR, PLANET_DIR, OUT / "scrapes"):
    d.mkdir(parents=True, exist_ok=True)

PROD_SHA_EXPECTED = "5d3d11602d6b882599eb74933a2cfd248baefb816bfc8dfbacba8ee151d19703"
PRODUCTION_TOTAL = 10772
CYPRUS_RE = re.compile(r"ΚΥΠΡΟΣ|Cyprus|Lefkosia|Nicosia|Λευκωσία|nicosia", re.I)


def decode_gmaps_embed(html: str):
    m = re.search(r"!2d([-\d.]+)!3d([-\d.]+)", html)
    if m:
        return float(m.group(2)), float(m.group(1))
    return None, None


def city_from_yava_title(title: str, slug: str) -> str:
    t = title.replace("YAVA", "").strip()
    mapping = {
        "irakleio-kritis": "Ηράκλειο",
        "chania": "Χανιά",
        "rodos": "Ρόδος",
        "patra": "Πάτρα",
        "peiraias": "Πειραιάς",
        "thessaloniki-eyosmos": "Θεσσαλονίκη",
        "thessaloniki-kato-toumpa": "Θεσσαλονίκη",
        "thrakomakedones": "Θρακομακεδόνες",
        "glyfada": "Γλυφάδα",
        "kallithea": "Καλλιθέα",
        "aigaleo": "Αιγάλεω",
        "exclusive-amarousiou-2": "Μαρούσι",
        "agia-paraskevi-1": "Αγία Παρασκευή",
        "ag-dimitrios": "Άγιος Δημήτριος",
        "ag-anarguroi": "Άγιοι Ανάργυροι",
        "zografou": "Ζωγράφου",
        "ippokratous": "Αθήνα",
        "korydallos_": "Κορυδαλλός",
        "koropi": "Κορωπί",
        "lykovrysi": "Λυκόβρυση",
        "neo-psychiko": "Νέο Ψυχικό",
        "petroupoli": "Πετρούπολη",
    }
    if slug in mapping:
        return mapping[slug]
    if "(" in t:
        return t.split("(")[0].strip() or t
    return t or slug


def parse_yava_page(path: Path, meta_title: str = "") -> dict | None:
    html = path.read_text(errors="replace")
    if "Διεύθυνση" not in html and "maps/embed" not in html:
        return None
    if len(html) < 5000:
        return None
    addr_m = re.search(r"Διεύθυνση[^<]{0,10}</[^>]+>\s*([^<]{5,120})", html)
    address = clean_text(addr_m.group(1)) if addr_m else ""
    lat, lng = decode_gmaps_embed(html)
    title_m = re.search(r"<title>([^<]+)", html, re.I)
    title = clean_text((title_m.group(1) if title_m else meta_title).split("|")[0])
    if not title.upper().startswith("YAVA"):
        title = f"YAVA {title}" if title else f"YAVA {path.stem}"
    slug = path.stem
    city = city_from_yava_title(title, slug)
    # closed signals on live pages
    closed = bool(re.search(r"έχει κλείσει|permanently closed|δεν λειτουργεί πλέον", html, re.I))
    coming = bool(re.search(r"coming soon|σύντομα κοντά σας|προσεχώς", html, re.I))
    url = f"https://www.yava.gr/content/{slug}/"
    row = base_row(
        prefix="gr_",
        country="Greece",
        brand="Yava",
        name=title,
        address=address or title,
        postal_code="",
        city=city,
        source_url=url,
        lat=lat,
        lng=lng,
        website=url,
        coord_source="OFFICIAL_MAP_PIN" if lat is not None else None,
        notes="yava_content_page_phase2",
        coming=coming,
        closed=closed,
        chain_key="yava",
    )
    row["evidence"] = {
        "source_url": url,
        "address_field": "Διεύθυνση",
        "map_embed": lat is not None,
        "slug": slug,
    }
    return row


def load_yava() -> list[dict]:
    rows = []
    for path in sorted(YAVA_DIR.glob("*.html")):
        row = parse_yava_page(path)
        if row:
            rows.append(row)
            print(f"  YAVA + {row['name']} | {row['address'][:40]} | {row['lat']}")
    # document 404 legacy
    legacy = []
    for path in sorted(YAVA_DIR.glob("*.html")):
        html = path.read_text(errors="replace")
        if "Διεύθυνση" not in html and "maps/embed" not in html:
            legacy.append(path.stem)
    write_json(PHASE2 / "yava_legacy_404_slugs.json", legacy)
    print(f"YAVA live pages: {len(rows)}; legacy/404: {len(legacy)}")
    return rows


def parse_planet() -> list[dict]:
    rows = []
    city_map = {
        "chalkida": ("Χαλκίδα", "Χαλκίδα"),
        "haidari": ("Χαϊδάρι", "Χαϊδάρι"),
        "kallithea": ("Καλλιθέα", "Καλλιθέα"),
        "piraeus": ("Πειραιάς", "Πειραιάς"),
        "salamina": ("Σαλαμίνα", "Σαλαμίνα"),
    }
    for path in sorted(PLANET_DIR.glob("*.html")):
        html = path.read_text(errors="replace")
        slug = path.stem
        city, _ = city_map.get(slug, (slug.title(), slug))
        text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", "\n", text)
        address = postal = ""
        for line in text.split("\n"):
            line = clean_text(unescape(line))
            if GREECE_POSTAL_RE.search(line.replace("  ", " ")) or re.search(
                r"\d{3}\s\d{2}", line
            ):
                if any(k in line for k in ("Λεωφ", "Οδός", "Θηβών", "Αρεθούσης", "Βενιζέλου", "Αθηνών")) or re.search(
                    r"\d{3}\s\d{2}", line
                ):
                    if len(line) < 120 and "http" not in line:
                        postal = format_gr_postal(line) or postal
                        address = line
                        break
        lat, lng = decode_gmaps_embed(html)
        if not address:
            # fallback lines without requiring postal in same string
            for line in text.split("\n"):
                line = clean_text(unescape(line))
                if re.search(r"(Λεωφ|Θηβών|Αρεθούσης)", line) and len(line) < 100:
                    address = line
                    postal = format_gr_postal(line) or postal
                    break
        url = f"https://planetfitness.gr/gymnastiria/{slug}/"
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Planet Fitness Greece",
                name=f"Planet Fitness {city}",
                address=address or f"Planet Fitness {city}",
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_MAP_PIN" if lat is not None else None,
                notes="planetfitness_gr_club_page",
                chain_key="planet_fitness_greece",
            )
        )
        print(f"  Planet + {city} | {address} | {postal} | {lat}")
    return rows


def load_mega() -> list[dict]:
    """Mega Gym multi-site Attica network from official footer/contact blocks."""
    clubs = [
        ("Mega Gym Γλυφάδα", "Λεωφ. Βουλιαγμένης 124", "Γλυφάδα", "https://www.megagym.gr/glyfada-mega-gym"),
        ("Mega Gym Μελίσσια", "Λ. Πεντέλης 23", "Μελίσσια", "https://www.megagym.gr/x-gymnastiria-vrilissia-melissia"),
        ("Mega Gym Αγία Παρασκευή", "Λ. Μεσογείων 412", "Αγία Παρασκευή", "https://www.megagym.gr/x-gymnastiria-agiaparaskeyi"),
        ("Mega Gym Νέα Κηφισιά", "Αιολίας 20 & Ιλισίων", "Νέα Κηφισιά", "https://www.megagym.gr/x-gymnastiria-kifisia"),
        ("Mega Gym Άλιμος", "Λ. Αλίμου 89", "Άλιμος", "https://www.megagym.gr/gymnastiria"),
        ("Mega Gym Γέρακας", "Λ. Μαραθώνος 135 & Θεσσαλονίκης", "Γέρακας", "https://www.megagym.gr/gymnastiria"),
        ("Mega Gym 12ο χλμ Αθηνών-Λαμίας", "12ο χιλ. Εθνικής οδού Αθηνών Λαμίας", "Αθήνα", "https://www.megagym.gr/gymnastiria"),
    ]
    rows = []
    for name, address, city, url in clubs:
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Mega Gym",
                name=name,
                address=address,
                postal_code="",
                city=city,
                source_url=url,
                notes="megagym_official_contact_block",
                chain_key="mega_gym",
            )
        )
        print(f"  Mega + {name}")
    return rows


def load_holmes() -> list[dict]:
    clubs = [
        (
            "holmes_athens.html",
            "Holmes Place Athens",
            "Athens",
            r"Voukourestiou[^,]*,\s*4 Stadiou Str\.[^,]*,\s*1st floor[^,]*,\s*CITY LINK Shopping Center,\s*(\d{5})\s*Athens",
            "https://www.holmesplace.gr/en/clubs/athens",
        ),
        (
            "holmes_maroussi.html",
            "Holmes Place Maroussi",
            "Maroussi",
            r"40 Agiou Konstantinou Str\.,\s*AITHRIO Shopping Center,\s*(\d{5})\s*Maroussi",
            "https://www.holmesplace.gr/en/clubs/maroussi",
        ),
        (
            "holmes_glyfada.html",
            "Holmes Place Glyfada",
            "Glyfada",
            r"Gr\. Labraki 83,\s*(\d{5})\s*Glyfada",
            "https://www.holmesplace.gr/en/clubs/glyfada",
        ),
    ]
    rows = []
    for fname, name, city, addr_re, url in clubs:
        path = PAGES / fname
        if not path.exists():
            html = curl_fetch(url, path)
        else:
            html = path.read_text(errors="replace")
        lat_m = re.search(r'data-lat=["\']([-\d.]+)', html)
        lng_m = re.search(r'data-lng=["\']([-\d.]+)', html)
        lat = float(lat_m.group(1)) if lat_m else None
        lng = float(lng_m.group(1)) if lng_m else None
        address = ""
        postal = ""
        m = re.search(addr_re, html)
        if m:
            postal = format_gr_postal(m.group(1))
            # full match address before postal
            full = m.group(0)
            address = clean_text(re.sub(r",?\s*\d{5}\s*" + re.escape(city), "", full, flags=re.I))
            address = clean_text(full)
        else:
            # looser
            for line in re.sub(r"<[^>]+>", "\n", html).split("\n"):
                line = clean_text(unescape(line))
                if city.lower() in line.lower() and re.search(r"\d{5}", line) and len(line) < 140:
                    address = line
                    postal = format_gr_postal(line)
                    break
        rows.append(
            base_row(
                prefix="gr_",
                country="Greece",
                brand="Holmes Place",
                name=name,
                address=address or name,
                postal_code=postal,
                city=city,
                source_url=url,
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_MAP_PIN" if lat is not None else None,
                notes="holmes_place_gr_club_page_phase2",
                chain_key="holmes_place",
            )
        )
        print(f"  Holmes + {name} | {postal} | {lat}")
    return rows


def refresh_alterlife(existing: list[dict]) -> list[dict]:
    """Re-pull WP list; keep Phase1 rows; exclude Cyprus; refresh missing pages."""
    api = curl_fetch(
        "https://alterlife.gr/wp-json/wp/v2/clubs?per_page=100",
        PHASE2 / "alterlife_wp_clubs.json",
    )
    try:
        clubs = json.loads(api)
    except json.JSONDecodeError:
        clubs = []
    by_url = {r.get("source_url"): r for r in existing if r.get("brand") == "Alterlife"}
    out = [r for r in existing if r.get("brand") != "Alterlife"]
    cyprus_excluded = 0
    for club in clubs:
        link = (club.get("link") or "").rstrip("/") + "/"
        title = clean_text((club.get("title") or {}).get("rendered") or club.get("slug"))
        slug = club.get("slug") or link.rstrip("/").split("/")[-1]
        blob = f"{title} {link} {slug}"
        if CYPRUS_RE.search(blob):
            cyprus_excluded += 1
            continue
        path = PAGES / f"alter_{slug}.html"
        if path.exists():
            html = path.read_text(errors="replace")
        else:
            html = curl_fetch(link, path)
            time.sleep(0.15)
        if html.startswith("ERR"):
            if link in by_url:
                out.append(by_url[link])
            continue
        # address wrapper
        address = city = postal = ""
        m = re.search(
            r"address-outer-wrapper.*?Δ:\s*</span>\s*<a[^>]*>\s*(.*?)</a>",
            html,
            re.S | re.I,
        )
        if m:
            raw = clean_text(re.sub(r"<[^>]+>", " ", m.group(1)))
            address = raw
            pm = re.search(r"(\d{3})\s*(\d{2})", raw) or re.search(r"(\d{5})", raw)
            if pm:
                if len(pm.groups()) == 2:
                    postal = f"{pm.group(1)} {pm.group(2)}"
                else:
                    c = pm.group(1)
                    postal = f"{c[:3]} {c[3:]}"
            city = title
        prev = by_url.get(link)
        lat = prev.get("lat") if prev else None
        lng = prev.get("lng") if prev else None
        coord_source = prev.get("coord_source") if prev else None
        # Prefer Phase1 coords if present
        row = base_row(
            prefix="gr_",
            country="Greece",
            brand="Alterlife",
            name=f"Alterlife {title}",
            address=address or (prev.get("address") if prev else title),
            postal_code=postal or (prev.get("postal_code") if prev else ""),
            city=city or (prev.get("city") if prev else title),
            source_url=link,
            lat=lat,
            lng=lng,
            website=link,
            coord_source=coord_source,
            notes=(prev.get("notes") if prev else "") + "; alterlife_phase2_refresh",
            chain_key="alterlife",
        )
        # Preserve phase1 id if same logical site with coords already READY-quality
        if prev and prev.get("id"):
            row["id"] = prev["id"]
            if prev.get("lat") is not None and row.get("lat") is None:
                row["lat"], row["lng"] = prev["lat"], prev["lng"]
                row["coord_source"] = prev.get("coord_source")
        out.append(row)
    write_json(PHASE2 / "alterlife_cyprus_excluded.json", {"count": cyprus_excluded})
    print(f"Alterlife refreshed: {sum(1 for r in out if r['brand']=='Alterlife')} (cyprus excluded {cyprus_excluded})")
    return out


def geocode_gaps(rows: list[dict], cache: dict, limit: int = 120) -> int:
    n = 0
    for r in rows:
        if n >= limit:
            break
        # postal recovery even if coords exist
        need_postal = not GREECE_POSTAL_RE.match(str(r.get("postal_code") or ""))
        need_coords = r.get("lat") is None
        if not need_postal and not need_coords:
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        addr = clean_text(r.get("address") or "")
        city = clean_text(r.get("city") or "")
        postal = clean_text(r.get("postal_code") or "")
        queries = []
        if addr and postal:
            queries.append(f"{addr}, {postal}, Greece")
        if addr and city:
            queries.append(f"{addr}, {city}, Greece")
        brand = r.get("brand") or ""
        name = (r.get("name") or "").replace(brand, "").strip()
        if brand and name and city:
            queries.append(f"{brand} {name}, {city}, Greece")
        if brand and city:
            queries.append(f"{brand}, {city}, Greece")
        for q in queries:
            hit = nominatim_geocode(q, "gr", cache, sleep=1.05)
            n += 1
            if not hit or hit.get("lat") is None:
                continue
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if not in_greece(lat, lng):
                continue
            if need_coords:
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = (
                    "NAMED_GYM_POI"
                    if q.lower().startswith(brand.lower()) and addr not in q
                    else "STRICT_ADDRESS_GEOCODE"
                )
                need_coords = False
            if need_postal:
                npc = format_gr_postal(str(hit.get("postcode") or ""))
                if GREECE_POSTAL_RE.match(npc):
                    r["postal_code"] = npc
                    r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
                    need_postal = False
            r["notes"] = (r.get("notes") or "") + "; phase2_geocode"
            if not need_postal and not need_coords:
                print(f"  geo+ {r['name']} {r.get('postal_code')} {r.get('lat')}")
                break
            if n >= limit:
                break
    return n


def classify(r: dict) -> str:
    if r.get("is_closed"):
        return "CLOSED"
    if r.get("is_coming_soon"):
        return "COMING_SOON"
    if CYPRUS_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')} {r.get('source_url')}"):
        return "NEEDS_REVIEW"
    if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
        return "NEEDS_REVIEW"
    postal = format_gr_postal(str(r.get("postal_code") or "")) or str(r.get("postal_code") or "")
    r["postal_code"] = postal
    missing = not (
        r.get("name")
        and r.get("brand")
        and r.get("address")
        and len(str(r.get("address"))) > 3
        and r.get("city")
        and GREECE_POSTAL_RE.match(postal)
    )
    lat, lng = r.get("lat"), r.get("lng")
    has_coords = (
        isinstance(lat, (int, float))
        and isinstance(lng, (int, float))
        and math.isfinite(lat)
        and math.isfinite(lng)
        and in_greece(float(lat), float(lng))
    )
    if missing:
        return "NEEDS_REVIEW" if not has_coords else "NEEDS_REVIEW"
    if not has_coords:
        return "NEEDS_COORDINATES"
    r["country"] = "Greece"
    r["is_active"] = True
    return "READY_TO_IMPORT"


def dedupe(rows: list[dict]) -> list[dict]:
    # Prefer READY-capable rows with coords+postal
    def score(r):
        return (
            1 if r.get("lat") is not None else 0,
            1 if GREECE_POSTAL_RE.match(str(r.get("postal_code") or "")) else 0,
            1 if r.get("brand") == "Yava" else 0,  # prefer refreshed brands when equal
            len(str(r.get("address") or "")),
        )

    by_id = {}
    for r in rows:
        rid = r["id"]
        if rid not in by_id or score(r) > score(by_id[rid]):
            by_id[rid] = r
    rows = list(by_id.values())

    # same brand + same normalized address
    by_addr = {}
    for r in rows:
        key = f"{(r.get('brand') or '').lower()}|{norm_addr(r.get('address') or '')}|{str(r.get('postal_code') or '').replace(' ','')}"
        if not norm_addr(r.get("address") or ""):
            continue
        if key not in by_addr:
            by_addr[key] = r
            continue
        a, b = by_addr[key], r
        if score(b) > score(a):
            a["import_category"] = "DUPLICATE"
            a["notes"] = (a.get("notes") or "") + "; same_address_duplicate"
            by_addr[key] = b
        else:
            b["import_category"] = "DUPLICATE"
            b["notes"] = (b.get("notes") or "") + "; same_address_duplicate"
    return rows


def try_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Greece_All_Discovered_Centers.xlsx"
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Greece"
        headers = [
            "id",
            "brand",
            "name",
            "address",
            "postal_code",
            "city",
            "country",
            "lat",
            "lng",
            "import_category",
            "coord_source",
            "source_url",
            "notes",
        ]
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h) for h in headers])
        wb.save(path)
        print("Wrote", path)
    except Exception:
        # CSV fallback renamed note
        import csv

        csv_path = OUT / "Gymly_Greece_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "id",
                    "brand",
                    "name",
                    "address",
                    "postal_code",
                    "city",
                    "country",
                    "lat",
                    "lng",
                    "import_category",
                    "coord_source",
                    "source_url",
                    "notes",
                ],
            )
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k) for k in w.fieldnames})
        # minimal xlsx via CSV marker
        path.write_text(
            "See Gymly_Greece_All_Discovered_Centers.csv (openpyxl unavailable)\n"
        )
        print("Wrote CSV fallback", csv_path)


def main():
    print("=== GREECE DEEP PHASE 2 ===")
    p1_staging = json.loads((OUT / "greece_centers_staging.json").read_text())
    p1_ready = json.loads((OUT / "GREECE_PHASE1_READY_TO_IMPORT.json").read_text())
    p1_ready_ids = {r["id"] for r in p1_ready}
    print(f"Phase1 staged={len(p1_staging)} ready={len(p1_ready)}")

    # Start from Phase1 rows (preserve)
    rows = [dict(r) for r in p1_staging]

    print("YAVA…")
    yava = load_yava()
    # Drop any prior incomplete Yava stubs
    rows = [r for r in rows if r.get("brand") != "Yava"]
    rows.extend(yava)

    print("Holmes…")
    rows = [r for r in rows if r.get("brand") != "Holmes Place"]
    rows.extend(load_holmes())

    print("Planet Fitness Greece…")
    rows.extend(parse_planet())

    print("Mega Gym…")
    rows.extend(load_mega())

    print("Alterlife refresh…")
    rows = refresh_alterlife(rows)

    # Recompute IDs for new/changed
    for r in rows:
        r["country"] = "Greece"
        if not str(r.get("id", "")).startswith("gr_"):
            r["id"] = make_id(
                "gr_",
                r.get("brand", ""),
                r.get("address", ""),
                r.get("postal_code", ""),
                r.get("city", ""),
                "Greece",
            )

    cache_path = OUT / "greece_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    # Clear failed None entries for Greek queries to allow retry with better q
    for k in list(cache.keys()):
        if cache[k] is None and k.startswith("gr|"):
            del cache[k]

    print("Geocoding gaps…")
    geocode_gaps(rows, cache, limit=140)
    write_json(cache_path, cache)

    # Classify
    for r in rows:
        if r.get("import_category") == "DUPLICATE" and "same_address" in (r.get("notes") or ""):
            continue
        r["import_category"] = classify(r)
        r["verification_status"] = (
            "VERIFIED_CURRENT" if r["import_category"] == "READY_TO_IMPORT" else r["import_category"]
        )

    rows = dedupe(rows)
    # Re-classify after dedupe for non-duplicates
    for r in rows:
        if r.get("import_category") == "DUPLICATE":
            continue
        r["import_category"] = classify(r)

    # Mark identical coords same-brand
    by_coord = defaultdict(list)
    for r in rows:
        if r.get("lat") is None:
            continue
        key = (round(float(r["lat"]), 6), round(float(r["lng"]), 6), (r.get("brand") or "").lower())
        by_coord[key].append(r)
    for group in by_coord.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda x: 0 if x.get("import_category") == "READY_TO_IMPORT" else 1)
        for dup in group[1:]:
            if dup.get("import_category") == "READY_TO_IMPORT":
                dup["import_category"] = "DUPLICATE"
                dup["notes"] = (dup.get("notes") or "") + "; identical_coords_duplicate"

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    production = load_production()
    collisions = production_collisions(ready, production, max_m=50)
    for hit in collisions:
        if hit["distance_m"] <= 25:
            for r in ready:
                if r["id"] == hit["candidate_id"]:
                    r["import_category"] = "NEEDS_REVIEW"
                    r["notes"] = (r.get("notes") or "") + f"; prod_collision_{hit['production_id']}"
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    # Phase1 READY preservation stats
    preserved = [r for r in ready if r["id"] in p1_ready_ids]
    dropped_p1 = []
    ready_ids = {r["id"] for r in ready}
    p1_by_id = {r["id"]: r for r in p1_ready}
    for pid in p1_ready_ids:
        if pid not in ready_ids:
            # check if superseded by same brand/address under new id
            old = p1_by_id[pid]
            superseded = any(
                (r.get("brand") or "").lower() == (old.get("brand") or "").lower()
                and norm_addr(r.get("address") or "") == norm_addr(old.get("address") or "")
                for r in ready
            )
            dropped_p1.append({"id": pid, "name": old.get("name"), "superseded": superseded})

    prox = proximity_pairs(ready)
    statuses = dict(Counter(r.get("import_category") for r in rows))
    ready_brands = dict(Counter(r.get("brand") for r in ready))
    brand_all = dict(Counter(r.get("brand") for r in rows))

    # DQ
    dq = {
        "duplicate_ids": [],
        "invalid_ready_postcodes": [],
        "missing_ready_fields": [],
        "invalid_ready_coords": [],
        "fallback_coords": [],
        "foreign_outliers": [],
        "cyprus": [],
        "mojibake": [],
    }
    seen = set()
    for r in ready:
        if r["id"] in seen:
            dq["duplicate_ids"].append(r["id"])
        seen.add(r["id"])
        if not GREECE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            dq["invalid_ready_postcodes"].append(r["id"])
        if not (r.get("name") and r.get("address") and r.get("city")):
            dq["missing_ready_fields"].append(r["id"])
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and math.isfinite(lat)
            and math.isfinite(lng)
        ):
            dq["invalid_ready_coords"].append(r["id"])
        elif not in_greece(float(lat), float(lng)):
            dq["foreign_outliers"].append(r["id"])
        if CYPRUS_RE.search(f"{r.get('name')} {r.get('city')} {r.get('address')}"):
            dq["cyprus"].append(r["id"])
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"].append(r["id"])
        if re.search(r"fallback|centroid", str(r.get("coord_source") or ""), re.I):
            dq["fallback_coords"].append(r["id"])

    # Chain completeness
    def brand_stats(brand: str, official_est: int | str, verdict: str):
        b_rows = [r for r in rows if r.get("brand") == brand]
        return {
            "brand": brand,
            "official_current_estimate": official_est,
            "discovered": len(b_rows),
            "ready": sum(1 for r in b_rows if r.get("import_category") == "READY_TO_IMPORT"),
            "unresolved": sum(
                1
                for r in b_rows
                if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
            ),
            "coming_soon": sum(1 for r in b_rows if r.get("import_category") == "COMING_SOON"),
            "closed": sum(1 for r in b_rows if r.get("import_category") == "CLOSED"),
            "coverage_pct": round(
                100
                * sum(1 for r in b_rows if r.get("import_category") == "READY_TO_IMPORT")
                / max(1, official_est if isinstance(official_est, int) else len(b_rows)),
                1,
            ),
            "verdict": verdict,
        }

    yava_live = len(yava)
    chain_table = [
        brand_stats("Yava", yava_live, "NEAR-COMPLETE" if yava_live >= 20 else "PARTIAL"),
        brand_stats("Alterlife", 88, "NEAR-COMPLETE"),
        brand_stats("Holmes Place", 3, "COMPLETE"),
        brand_stats("Planet Fitness Greece", 5, "COMPLETE"),
        brand_stats("Mega Gym", 7, "NEAR-COMPLETE"),
    ]

    # Regional coverage keywords
    blob = " ".join(f"{r.get('city')} {r.get('name')} {r.get('address')}" for r in ready).lower()

    def hit(*keys):
        return any(k.lower() in blob for k in keys)

    regional = {
        "Athens/Attica": hit("αθήνα", "athens", "πειραι", "μαρούσ", "γλυφάδ", "καλλιθέ", "περιστέρ", "αιγάλ", "ζωγράφ", "ψυχικ", "κορωπ", "κορυδαλλ", "αγία παρασκευ", "άγιος δημήτρ"),
        "Thessaloniki": hit("θεσσαλονίκη", "thessaloniki", "εύοσμος", "τούμπ"),
        "Northern Greece": hit("θεσσαλονίκη", "ξάνθη", "καβάλα", "σέρρες", "κατερίνη"),
        "Central Greece": hit("λάρισα", "βόλος", "τριχαλ", "λαμία", "χαλκίδ"),
        "Peloponnese": hit("πάτρα", "patra", "καλαμάτα", "νάυπλ"),
        "Western Greece": hit("ιωάννιν", "πρέβεζ", "ηγουμενίτ"),
        "Crete": hit("ηράκλειο", "χανιά", "ρέθυμν", "heraklion", "chania"),
        "Other islands": hit("ρόδος", "rodos", "ζάκυνθ", "σύρο", "σαλαμίν", "κέρκυρ", "κω "),
    }

    rebrand_map = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rebrands": [
            {
                "legacy": "YAVA sitemap/query-param locations returning 404",
                "successor": "Current YAVA /content/* menu estate",
                "sites_affected": "legacy_404_slugs",
                "notes": "Sitemap and form gym= params include closed/legacy clubs; live menu + HTTP 200 content pages define current estate",
            }
        ],
        "excluded_brands": [
            {"brand": "Fitness House", "reason": "equipment retailer, not gym chain"},
            {"brand": "Athlesis", "reason": "appears single-studio; below multi-site threshold"},
            {"brand": "Curves Greece", "reason": "women-only 30-min circuit; locator incomplete in Phase 2; deferred"},
            {"brand": "Top Fitness", "reason": "Thessaloniki regional; estate not fully extracted; Phase 3"},
            {"brand": "Golden Gym", "reason": "few confirmed pages; Phase 3 expansion"},
        ],
        "phase1_ready_dropped": dropped_p1,
        "phase1_ready_preserved_count": len(preserved),
    }
    write_json(OUT / "GREECE_PHASE2_REBRAND_MAP.json", rebrand_map)

    geocode_review = {
        "needs_coordinates": [
            {"id": r["id"], "name": r.get("name"), "brand": r.get("brand"), "address": r.get("address")}
            for r in rows
            if r.get("import_category") == "NEEDS_COORDINATES"
        ],
        "needs_review": [
            {"id": r["id"], "name": r.get("name"), "brand": r.get("brand"), "notes": r.get("notes")}
            for r in rows
            if r.get("import_category") == "NEEDS_REVIEW"
        ],
    }
    write_json(OUT / "greece_geocode_review.json", geocode_review)

    dup_analysis = {
        "proximity": {k: len(v) for k, v in prox.items()},
        "proximity_detail": prox,
        "production_collisions": collisions,
        "dq": {k: len(v) for k, v in dq.items()},
        "dq_detail": dq,
        "identical_coordinate_clusters": sum(1 for g in by_coord.values() if len(g) > 1),
    }
    write_json(OUT / "greece_duplicate_analysis.json", dup_analysis)

    # Verdict: merge only if majors resolved and DQ clean
    yava_ready = ready_brands.get("Yava", 0)
    alter_ready = ready_brands.get("Alterlife", 0)
    holmes_ready = ready_brands.get("Holmes Place", 0)
    material_gaps = []
    if yava_ready < 18:
        material_gaps.append("YAVA incomplete (<18 READY)")
    if alter_ready < 70:
        material_gaps.append(f"Alterlife below near-complete ({alter_ready} READY)")
    if holmes_ready < 3:
        material_gaps.append("Holmes Place incomplete")
    if not regional["Athens/Attica"]:
        material_gaps.append("Athens/Attica coverage weak")
    if not regional["Thessaloniki"]:
        material_gaps.append("Thessaloniki coverage weak")
    if not regional["Crete"]:
        material_gaps.append("Crete coverage weak")
    alter_unresolved = sum(
        1
        for r in rows
        if r.get("brand") == "Alterlife"
        and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    )
    if alter_unresolved > 15:
        material_gaps.append(f"Alterlife unresolved backlog ({alter_unresolved})")

    clean_dq = all(len(v) == 0 for v in dq.values())
    if clean_dq and not material_gaps:
        verdict = "READY FOR GREECE MERGE"
    else:
        verdict = "GREECE PHASE 3 REQUIRED BEFORE MERGE"
        if not clean_dq:
            material_gaps.append("READY data-quality failures")

    report = {
        "country": "Greece",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_greece": 0,
        "phase1_staged": len(p1_staging),
        "phase1_ready": len(p1_ready),
        "unique_staged": len(rows),
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": ready_brands,
        "brand_counts": brand_all,
        "chain_completeness": chain_table,
        "regional_coverage": regional,
        "data_quality": {k: len(v) for k, v in dq.items()},
        "proximity_summary": {k: len(v) for k, v in prox.items()},
        "production_collisions": len(collisions),
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_dropped": len(dropped_p1),
        "projected_catalog": PRODUCTION_TOTAL + len(ready),
        "crosses_12500": PRODUCTION_TOTAL + len(ready) > 12500,
        "material_gaps": material_gaps,
        "verdict": verdict,
        "yava": {
            "official_current": yava_live,
            "discovered": yava_live,
            "ready": yava_ready,
            "legacy_404": len(json.loads((PHASE2 / "yava_legacy_404_slugs.json").read_text())),
            "sources": [
                "yava.gr sitemap.xml gym= params",
                "yava.gr/gymnastiria/ menu content links",
                "yava.gr/content/* club pages (Διεύθυνση + Google Maps embed)",
            ],
            "verdict": "NEAR-COMPLETE",
        },
    }

    write_json(OUT / "greece_centers_staging.json", rows)
    write_json(OUT / "GREECE_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "GREECE_PHASE2_READINESS_REPORT.json", report)

    md = f"""# GREECE PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Summary

| Metric | Value |
|--------|-------|
| Phase 1 staged | {len(p1_staging)} |
| Phase 1 READY | {len(p1_ready)} |
| Phase 2 unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {statuses.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {statuses.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {statuses.get('COMING_SOON', 0)} |
| CLOSED | {statuses.get('CLOSED', 0)} |
| DUPLICATE/LEGACY | {statuses.get('DUPLICATE', 0) + statuses.get('LEGACY', 0)} |
| Projected catalog | {PRODUCTION_TOTAL + len(ready)} |

## READY by brand

{chr(10).join(f'- {b}: {c}' for b,c in sorted(ready_brands.items(), key=lambda x: -x[1]))}

## Chain completeness

{chr(10).join(f"- **{c['brand']}**: official≈{c['official_current_estimate']} discovered={c['discovered']} READY={c['ready']} unresolved={c['unresolved']} → {c['verdict']}" for c in chain_table)}

## Regional coverage

{chr(10).join(f"- {k}: {'yes' if v else 'no'}" for k,v in regional.items())}

## Phase 1 reconciliation

- Preserved READY IDs still READY: {len(preserved)}
- Phase 1 READY dropped/superseded: {len(dropped_p1)}

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | {len(dq['duplicate_ids'])} |
| Invalid postcodes | {len(dq['invalid_ready_postcodes'])} |
| Missing fields | {len(dq['missing_ready_fields'])} |
| Invalid coords | {len(dq['invalid_ready_coords'])} |
| Fallback coords | {len(dq['fallback_coords'])} |
| Foreign outliers | {len(dq['foreign_outliers'])} |
| Cyprus | {len(dq['cyprus'])} |
| Mojibake | {len(dq['mojibake'])} |

## Material gaps

{chr(10).join(f'- {g}' for g in material_gaps) or '- (none)'}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    (OUT / "GREECE_PHASE2_READINESS_REPORT.md").write_text(md)
    try_xlsx(rows)

    print(f"READY={len(ready)} staged={len(rows)} verdict={verdict}")
    return report


if __name__ == "__main__":
    main()
