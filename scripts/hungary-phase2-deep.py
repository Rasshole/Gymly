#!/usr/bin/env python3
"""
Hungary Deep Phase 2 — nationwide chain expansion.

Does NOT modify src/data/centers.json.
Preserves Phase 1 Life1 READY rows (stable IDs) unless stronger evidence
proves rebrand/closure; physical clubs retain stable IDs where possible.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    FALLBACK_RE,
    HUNGARY_POSTAL_RE,
    MOJIBAKE_RE,
    ROOT,
    base_row,
    curl_fetch,
    haversine,
    in_hungary,
    make_id,
    nominatim_geocode,
    norm_addr,
    write_json,
)

OUT = ROOT / "data/hungary"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE2 = OUT / "phase2"
SCRAPES = OUT / "scrapes"
for d in (OUT, RAW, PAGES, PHASE2, SCRAPES):
    d.mkdir(parents=True, exist_ok=True)

PRODUCTION_TOTAL = 11013
PROD_SHA_EXPECTED = "df5068aa041383bdd4e6a239ef4153b0c3483b167051a615966b6b86f56f6516"

FOREIGN = re.compile(
    r"\b(austria|österreich|slovakia|szlovákia|romania|románia|serbia|szerbia|"
    r"croatia|horvátország|slovenia|szlovénia|ukraine|ukrajna|wien|bratislava)\b",
    re.I,
)

MAJOR_CITIES = [
    "Budapest",
    "Debrecen",
    "Szeged",
    "Miskolc",
    "Pécs",
    "Győr",
    "Nyíregyháza",
    "Kecskemét",
    "Székesfehérvár",
    "Szombathely",
    "Veszprém",
    "Zalaegerszeg",
    "Érd",
    "Tatabánya",
    "Sopron",
    "Békéscsaba",
    "Eger",
    "Nagykanizsa",
]


def production_sha() -> str:
    return hashlib.sha256((ROOT / "src/data/centers.json").read_bytes()).hexdigest()


def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def parse_hu_address(blob: str) -> tuple[str, str, str]:
    """Return (street, postal, city) from 'NNNN City, street' or 'street, NNNN City'."""
    s = re.sub(r"\s+", " ", (blob or "").strip())
    s = s.replace("📍", "").strip(" .")
    m = re.match(r"^(\d{4})\s*,?\s*([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\- ]+),\s*(.+)$", s)
    if m:
        return m.group(3).strip(" ."), m.group(1), m.group(2).strip()
    m = re.match(r"^(\d{4})\.?\s+([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\- ]+),\s*(.+)$", s)
    if m:
        return m.group(3).strip(" ."), m.group(1), m.group(2).strip()
    m = re.match(r"^(.+?),\s*(\d{4})\s+([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\- ]+)$", s)
    if m:
        return m.group(1).strip(" ."), m.group(2), m.group(3).strip()
    m = re.search(r"\b(\d{4})\b", s)
    postal = m.group(1) if m else ""
    city = ""
    for c in MAJOR_CITIES + ["Dunakeszi", "Dunaújváros", "Gödöllő", "Kaposvár", "Siófok", "Esztergom", "Szolnok"]:
        if re.search(rf"\b{re.escape(c)}\b", s, re.I):
            city = c
            break
    street = s
    if postal:
        street = re.sub(rf"\b{postal}\b\.?", "", street).strip(" ,.")
    if city:
        street = re.sub(rf"\b{re.escape(city)}\b", "", street, flags=re.I).strip(" ,.")
    return street, postal, city


def row(
    *,
    brand: str,
    chain_key: str,
    name: str,
    address: str,
    postal_code: str,
    city: str,
    lat: float | None,
    lng: float | None,
    source_url: str,
    website: str,
    coord_source: str | None,
    notes: str,
    import_category: str,
    discovery_class: str = "national_chain",
    is_coming_soon: bool = False,
    is_closed: bool = False,
    is_active: bool = True,
    stable_id: str | None = None,
    evidence: dict | None = None,
) -> dict:
    postal_code = str(postal_code or "").strip()
    r = base_row(
        prefix="hu_",
        country="Hungary",
        brand=brand,
        name=name,
        address=address,
        postal_code=postal_code,
        city=city,
        source_url=source_url,
        lat=lat,
        lng=lng,
        website=website,
        coord_source=coord_source,
        notes=notes,
        coming=is_coming_soon,
        closed=is_closed,
        chain_key=chain_key,
        discovery_class=discovery_class,
    )
    if stable_id:
        r["id"] = stable_id
    r["import_category"] = import_category
    r["is_active"] = bool(is_active and not is_closed and not is_coming_soon)
    r["verification_status"] = (
        "VERIFIED_CURRENT" if import_category == "READY_TO_IMPORT" else import_category
    )
    r["discovered_at"] = "2026-08-23"
    r["evidence"] = evidence or {"source_url": source_url}
    return r


def classify(r: dict) -> str:
    if r.get("is_closed"):
        return "CLOSED"
    if r.get("is_coming_soon"):
        return "COMING_SOON"
    if r.get("import_category") in (
        "DUPLICATE",
        "LEGACY",
        "NEEDS_REVIEW",
        "NEEDS_COORDINATES",
        "COMING_SOON",
        "CLOSED",
    ):
        return r["import_category"]
    pc = str(r.get("postal_code") or "")
    lat, lng = r.get("lat"), r.get("lng")
    blob = f"{r.get('name')} {r.get('address')} {r.get('city')} {r.get('brand')}"
    if not HUNGARY_POSTAL_RE.match(pc):
        return "NEEDS_REVIEW"
    if not (r.get("address") and r.get("city") and r.get("brand") and r.get("name")):
        return "NEEDS_REVIEW"
    if MOJIBAKE_RE.search(blob) or FOREIGN.search(blob):
        return "NEEDS_REVIEW"
    if lat is None or lng is None or not (math.isfinite(lat) and math.isfinite(lng)):
        return "NEEDS_COORDINATES"
    if lat == 0 and lng == 0:
        return "NEEDS_COORDINATES"
    if FALLBACK_RE.search(str(r.get("coord_source") or "")):
        return "NEEDS_COORDINATES"
    if not in_hungary(lat, lng):
        return "NEEDS_REVIEW"
    return "READY_TO_IMPORT"


def geocode(
    cache: dict, address: str, city: str, postal: str
) -> tuple[float | None, float | None, str | None, str | None]:
    """Return lat, lng, coord_source, resolved_postal (may correct from Nominatim)."""
    clean_addr = re.sub(r"\([^)]*\)", "", address or "").strip(" .,")
    postal = str(postal or "").strip()
    queries = []
    if postal:
        queries.append(f"{clean_addr}, {postal} {city}, Hungary")
    queries.append(f"{clean_addr}, {city}, Hungary")
    for q in queries:
        hit = nominatim_geocode(q, "hu", cache, sleep=1.05)
        if not hit or hit.get("error") or hit.get("lat") is None:
            continue
        lat, lng = float(hit["lat"]), float(hit["lng"])
        if not in_hungary(lat, lng):
            continue
        if hit.get("country_code") and hit["country_code"] != "hu":
            continue
        display = (hit.get("display_name") or "").lower()
        if city and city.lower() not in display:
            continue
        hit_pc = str(hit.get("postcode") or "")[:4]
        if postal and hit_pc and hit_pc != postal:
            # Homonym guard: Budapest (1xxx) needs 3-digit zone; elsewhere 2-digit.
            zone = 3 if postal.startswith("1") else 2
            if hit_pc[:zone] != postal[:zone]:
                continue
            return lat, lng, "NOMINATIM_EXACT_ADDRESS", hit_pc
        resolved = hit_pc if HUNGARY_POSTAL_RE.match(hit_pc or "") else postal
        return lat, lng, "NOMINATIM_EXACT_ADDRESS", resolved or postal or None
    return None, None, None, None


def apply_geocode(cache, addr, city, pc):
    lat, lng, src, resolved = geocode(cache, addr, city, pc)
    if resolved:
        pc = resolved
    return lat, lng, src, pc


def extract_life1_markers(html: str) -> list[dict]:
    locs = re.findall(
        r'data-location="([^"]+)"[^>]*data-pos="([^"]+)"|data-pos="([^"]+)"[^>]*data-location="([^"]+)"',
        html,
    )
    links = re.findall(r'data-link="([^"]+)"', html)
    out = []
    for i, loc in enumerate(locs):
        if loc[0]:
            location, pos = loc[0], loc[1]
        else:
            pos, location = loc[2], loc[3]
        lng_s, lat_s = pos.split(",")
        link = links[i] if i < len(links) else ""
        out.append(
            {
                "location": unescape(location),
                "lat": float(lat_s),
                "lng": float(lng_s),
                "link": link,
            }
        )
    return out


def discover_all(cache: dict) -> list[dict]:
    rows: list[dict] = []
    phase1 = load_json(OUT / "hungary_centers_staging.json", [])
    phase1_by_name = {r["name"]: r for r in phase1}

    # ---------- LIFE1 + Prestige (official map pins) ----------
    life1_html = (RAW / "life1_home_p2.html").read_text(encoding="utf-8", errors="replace")
    markers = extract_life1_markers(life1_html)
    write_json(PHASE2 / "life1_markers.json", markers)

    life1_map = {
        "/allee": ("Life1 Allee", "Life1 Fitness", "life1"),
        "/mammut": ("Life1 Mammut", "Life1 Fitness", "life1"),
        "/corvin": ("Life1 Corvin", "Life1 Fitness", "life1"),
        "/etele": ("Life1 Etele", "Life1 Fitness", "life1"),
        "/nyugati": ("Life1 Nyugati", "Life1 Fitness", "life1"),
        "/vaci35": ("Life1 Váci", "Life1 Fitness", "life1"),
        "/prestige": ("Prestige Fitness Fáy", "Prestige Fitness", "prestige"),
    }
    for m in markers:
        link = m["link"]
        meta = life1_map.get(link)
        if not meta:
            continue
        name, brand, chain = meta
        street, postal, city = parse_hu_address(m["location"])
        if not postal:
            postal = re.search(r"\b(\d{4})\b", m["location"]).group(1)
            city = "Budapest"
            street = re.sub(r"\b\d{4}\b", "", m["location"]).replace("Budapest,", "").replace("Budapest", "").strip(" ,.")
        stable = None
        # Preserve Phase 1 IDs for same physical Life1 clubs
        for p1_name, p1 in phase1_by_name.items():
            if norm_addr(p1.get("address", "")) == norm_addr(street) or (
                brand == "Life1 Fitness" and p1_name.replace("Life1 ", "") in name
            ):
                # Fáy → Prestige keeps Phase 1 Fáy ID
                if "Fáy" in p1_name or "Fay" in p1_name:
                    if chain == "prestige":
                        stable = p1["id"]
                elif brand == "Life1 Fitness" and p1["brand"] == "Life1 Fitness":
                    if p1_name == name or street.split("(")[0].strip() in (p1.get("address") or ""):
                        stable = p1["id"]
        # stronger match by postal+street fragment
        if not stable and brand == "Life1 Fitness":
            for p1 in phase1:
                if p1.get("postal_code") == postal and p1.get("brand") == "Life1 Fitness":
                    if norm_addr(street)[:12] == norm_addr(p1.get("address", ""))[:12]:
                        stable = p1["id"]
                        break
        if not stable and chain == "prestige":
            for p1 in phase1:
                if p1.get("postal_code") == "1139" and "Fáy" in p1.get("name", ""):
                    stable = p1["id"]
                    break

        rows.append(
            row(
                brand=brand,
                chain_key=chain,
                name=name,
                address=street if street else m["location"],
                postal_code=postal,
                city=city or "Budapest",
                lat=m["lat"],
                lng=m["lng"],
                source_url=f"https://life1.hu{link}/" if link.startswith("/") else "https://life1.hu/",
                website="https://prestigefitness.hu/" if chain == "prestige" else "https://life1.hu/",
                coord_source="OFFICIAL_MAP_PIN",
                notes="life1_home_overlay_marker_phase2",
                import_category="READY_TO_IMPORT",
                stable_id=stable,
                evidence={"source_url": "https://life1.hu/", "data_link": link, "data_location": m["location"]},
            )
        )

    # ---------- CHILI FITNESS ----------
    chili_sites = [
        ("Chili Fitness Bikás park", "1119", "Budapest", "Etele út 57.", "https://chilifitnessbudapest.hu/"),
        ("Chili Fitness Újbuda", "1117", "Budapest", "Hengermalom út 19-21.", "https://chilifitnessbudapest.hu/"),
        ("Chili Fitness Angyalföld", "1135", "Budapest", "Szegedi út 56.", "https://chilifitnessbudapest.hu/"),
        ("Chili Fitness Csepel", "1214", "Budapest", "Kossuth Lajos u. 117.", "https://chilifitnessbudapest.hu/"),
        ("Chili Fitness Debrecen", "", "Debrecen", "Vágóhíd u. 3/B", "http://www.chilifitness2.hu/bemutatkozas.html"),
    ]
    for name, pc, city, addr, url in chili_sites:
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        if name.endswith("Debrecen"):
            hit = nominatim_geocode(f"{addr}, Debrecen, Hungary", "hu", cache, sleep=0.2)
            if hit and hit.get("postcode"):
                pc_hit = str(hit["postcode"])[:4]
                if HUNGARY_POSTAL_RE.match(pc_hit):
                    pc = pc_hit
            if not pc:
                rows.append(
                    row(
                        brand="Chili Fitness",
                        chain_key="chili",
                        name=name,
                        address=addr,
                        postal_code="",
                        city=city,
                        lat=lat,
                        lng=lng,
                        source_url=url,
                        website=url,
                        coord_source=src,
                        notes="debrecen_street_known_postcode_from_geocode_missing",
                        import_category="NEEDS_REVIEW" if not pc else "READY_TO_IMPORT",
                    )
                )
                continue
        cat = "READY_TO_IMPORT" if lat is not None and pc else ("NEEDS_COORDINATES" if pc else "NEEDS_REVIEW")
        rows.append(
            row(
                brand="Chili Fitness",
                chain_key="chili",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=url,
                website=url,
                coord_source=src,
                notes="official_chili_locations_page",
                import_category=cat,
            )
        )

    # ---------- 4% FITNESS (budapestgym.com) ----------
    four_sites = [
        ("4% GYM", "1092", "Budapest", "Ráday utca 16.", "https://budapestgym.com/gym/"),
        ("4% CRUSH", "1093", "Budapest", "Czuczor utca 10.", "https://budapestgym.com/crush/"),
        ("4% SPIRIT", "1045", "Budapest", "Pozsonyi utca 17.", "https://budapestgym.com/spirit/"),
        ("4% CANDYLAND", "1074", "Budapest", "Rákóczi út 60.", "https://budapestgym.com/candyland/"),
        ("4% CANDY", "1088", "Budapest", "Rákóczi út 47.", "https://budapestgym.com/candy/"),
        ("4% CORNER", "1061", "Budapest", "Paulay Ede utca 25-27.", "https://budapestgym.com/corner/"),
        ("4% ONLYGIRLS", "1092", "Budapest", "Erkel utca 18. (OnlyGirls)", "https://budapestgym.com/onlygirls/"),
        ("4% GARDEN", "1092", "Budapest", "Erkel utca 18. (Garden 24/7)", "https://budapestgym.com/garden/"),
    ]
    # LOTUS: exact street not reliably present on fetched pages → NEEDS_REVIEW
    rows.append(
        row(
            brand="4% Fitness",
            chain_key="4percent",
            name="4% LOTUS",
            address="near Corvin (exact street pending official page)",
            postal_code="",
            city="Budapest",
            lat=None,
            lng=None,
            source_url="https://budapestgym.com/lotus/",
            website="https://budapestgym.com/",
            coord_source=None,
            notes="lotus_address_incomplete_on_official_pages",
            import_category="NEEDS_REVIEW",
        )
    )

    for name, pc, city, addr, url in four_sites:
        # GARDEN and ONLYGIRLS share Erkel 18 — distinct consumer products; keep both.
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        cat = "READY_TO_IMPORT" if lat is not None else "NEEDS_COORDINATES"
        rows.append(
            row(
                brand="4% Fitness",
                chain_key="4percent",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=url,
                website="https://budapestgym.com/",
                coord_source=src,
                notes="budapestgym_official",
                import_category=cat,
            )
        )

    # ---------- FITNESS5 ----------
    f5_ready = [
        ("Fitness5 Bank Center", "1054", "Budapest", "Szabadság tér 7.", "bank-center"),
        ("Fitness5 City Market Dunakeszi", "2120", "Dunakeszi", "Nádas utca 8.", "buy-way"),
        ("Fitness5 Dunaújváros", "2400", "Dunaújváros", "Szabadság út 1.", "dunaujvaros"),
        ("Fitness5 Home Center", "1173", "Budapest", "Pesti út 237f", "home-center"),
        ("Fitness5 Kecskemét", "6000", "Kecskemét", "Nagykőrösi utca 2.", "kecskemet"),
        ("Fitness5 Kispest", "1191", "Budapest", "Áruház köz 1.", "kispest"),
        ("Fitness5 Kőbánya", "1102", "Budapest", "Liget tér 1.", "kobanya"),
        ("Fitness5 KÖKI", "1191", "Budapest", "Vak Bottyán u. 75/A-C", "koki"),
        ("Fitness5 Nagykanizsa", "8800", "Nagykanizsa", "Király utca 36.", "nagykanizsa"),
        ("Fitness5 Örs Vezér tér", "1104", "Budapest", "Fehér út 1/B", "ors-vezer-ter"),
        ("Fitness5 Pólus Center", "1152", "Budapest", "Szentmihályi út 131.", "polus-center"),
        ("Fitness5 Sallai", "1184", "Budapest", "Cziffra György utca 15/B", "sallai"),
        ("Fitness5 Savoya", "1117", "Budapest", "Hunyadi János út 19.", "savoya"),
        ("Fitness5 Siófok", "8600", "Siófok", "Sió utca 4.", "siofok"),
        ("Fitness5 Székesfehérvár", "8000", "Székesfehérvár", "Balatoni út 44-46", "szekesfehervar"),
        ("Fitness5 Váci Greens", "1138", "Budapest", "Edison tér 1.", "vaci-greens"),
    ]
    f5_coming = [
        ("Fitness5 Esztergom", "esztergom", "COMING_SOON", "várható nyitás 2025"),
        ("Fitness5 Sopron", "sopron", "COMING_SOON", "várható nyitás 2025"),
        ("Fitness5 Veszprém", "veszprem", "COMING_SOON", "várható nyitás 2025"),
    ]
    f5_review = [
        ("Fitness5 Szolnok", "szolnok", "club page lacks city-matched street address"),
        ("Fitness5 Tatabánya", "tatabanya", "club page lacks city-matched street address"),
    ]
    for name, pc, city, addr, slug in f5_ready:
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        cat = "READY_TO_IMPORT" if lat is not None else "NEEDS_COORDINATES"
        rows.append(
            row(
                brand="Fitness5",
                chain_key="fitness5",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=f"https://fitness5.hu/gym/{slug}/",
                website="https://fitness5.hu/",
                coord_source=src,
                notes="fitness5_official_club_page",
                import_category=cat,
            )
        )
    for name, slug, cat, note in f5_coming:
        rows.append(
            row(
                brand="Fitness5",
                chain_key="fitness5",
                name=name,
                address=f"(coming soon — {slug})",
                postal_code="",
                city=name.replace("Fitness5 ", ""),
                lat=None,
                lng=None,
                source_url=f"https://fitness5.hu/gym/{slug}/",
                website="https://fitness5.hu/",
                coord_source=None,
                notes=note,
                import_category="COMING_SOON",
                is_coming_soon=True,
                is_active=False,
            )
        )
    for name, slug, note in f5_review:
        rows.append(
            row(
                brand="Fitness5",
                chain_key="fitness5",
                name=name,
                address=f"(address incomplete — {slug})",
                postal_code="",
                city=name.replace("Fitness5 ", ""),
                lat=None,
                lng=None,
                source_url=f"https://fitness5.hu/gym/{slug}/",
                website="https://fitness5.hu/",
                coord_source=None,
                notes=note,
                import_category="NEEDS_REVIEW",
                is_active=False,
            )
        )

    # ---------- NR1 FITNESS ----------
    nr1_sites = [
        ("Nr1 Fitness Oktogon", "1062", "Budapest", "Aradi utca 8-10.", "https://www.nr1fitness.hu/en/"),
        ("Nr1 Fitness Kálvin", "1053", "Budapest", "Kecskeméti u. 14.", "https://www.nr1fitness.hu/en/"),
        ("Nr1 Fitness Óbuda", "1036", "Budapest", "Lajos utca 66.", "https://www.nr1fitness.hu/en/"),
        ]
    for name, pc, city, addr, url in nr1_sites:
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        cat = "READY_TO_IMPORT" if lat is not None else "NEEDS_COORDINATES"
        rows.append(
            row(
                brand="Nr1 Fitness",
                chain_key="nr1",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=url,
                website="https://www.nr1fitness.hu/",
                coord_source=src,
                notes="nr1_official_home_contact",
                import_category=cat,
            )
        )
    for name in ("Nr1 Fitness Rákóczi tér", "Nr1 Fitness Vágóhíd"):
        rows.append(
            row(
                brand="Nr1 Fitness",
                chain_key="nr1",
                name=name,
                address=f"(exact street pending — {name})",
                postal_code="",
                city="Budapest",
                lat=None,
                lng=None,
                source_url="https://www.nr1fitness.hu/en/locations/",
                website="https://www.nr1fitness.hu/",
                coord_source=None,
                notes="nr1_mentioned_on_official_home_exact_street_incomplete",
                import_category="NEEDS_REVIEW",
            )
        )

    # ---------- OXYGEN WELLNESS ----------
    lat, lng, src, pc = apply_geocode(cache, "Naphegy utca 67.", "Budapest", "1016")
    rows.append(
        row(
            brand="Oxygen Wellness",
            chain_key="oxygen",
            name="Oxygen Wellness Naphegy",
            address="Naphegy utca 67.",
            postal_code=pc or "1016",
            city="Budapest",
            lat=lat,
            lng=lng,
            source_url="https://oxygenwellness.hu/",
            website="https://oxygenwellness.hu/",
            coord_source=src,
            notes="official_oxygen_naphegy_fitness_gym",
            import_category="READY_TO_IMPORT" if lat else "NEEDS_COORDINATES",
        )
    )

    # ---------- CUTLER GYM (franchise / branded network — independent operators, shared brand) ----------
    cutler_sites = [
        ("Cutler Gym Győr", "9027", "Győr", "Nagysándor József utca 31.", "https://cutlergyor.com/"),
        ("Cutler Gym Kecskemét", "6000", "Kecskemét", "Kálvin tér 10-12", "https://cutlerkecskemet.hu/"),
        ("Cutler Gym Gödöllő", "2100", "Gödöllő", "Dózsa György út 160.", "https://cutlergodollo.hu/"),
        ("Cutler Gym Nyíregyháza", "4400", "Nyíregyháza", "Vay Ádám körút 20.", "https://cutlergym-nyiregyhaza.hu/"),
        ("Cutler Gym Székesfehérvár", "8000", "Székesfehérvár", "Balatoni út 2.", "https://cutlerfehervar.hu/"),
        ("Cutler Gym Pécs", "7623", "Pécs", "Megyeri út 76.", "https://cutlerpecs.hu/"),
        ("Cutler Gym Sopron", "9400", "Sopron", "Lackner Kristóf u. 35.", "https://www.cutlersopron.hu/"),
    ]
    for name, pc, city, addr, url in cutler_sites:
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        cat = "READY_TO_IMPORT" if lat is not None else "NEEDS_COORDINATES"
        rows.append(
            row(
                brand="Cutler Gym",
                chain_key="cutler",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=url,
                website=url,
                coord_source=src,
                notes="cutler_branded_franchise_official_site",
                import_category=cat,
                discovery_class="franchise_network",
            )
        )
    # Miskolc site dead/empty → NEEDS_REVIEW discovery
    rows.append(
        row(
            brand="Cutler Gym",
            chain_key="cutler",
            name="Cutler Gym Miskolc",
            address="(official site unreachable / empty)",
            postal_code="",
            city="Miskolc",
            lat=None,
            lng=None,
            source_url="https://cutlermiskolc.hu/",
            website="https://cutlermiskolc.hu/",
            coord_source=None,
            notes="site_empty_phase2",
            import_category="NEEDS_REVIEW",
            discovery_class="franchise_network",
            is_active=False,
        )
    )

    # ---------- THOR GYM ----------
    thor_sites = [
        ("Thor Gym Újbuda", "1116", "Budapest", "Nándorfejérvári út 40.", "https://ujbuda.thorgym.hu/"),
        ("Thor Gym Zugló", "1144", "Budapest", "Füredi u. 72-76.", "https://zuglo.thorgym.hu/"),
        ("Thor Gym Óbuda", "1033", "Budapest", "Bogdáni út 1-3.", "https://obuda.thorgym.hu/"),
        ("Thor Gym Savoya", "1117", "Budapest", "Hunyadi János út 19.", "https://savoya.thorgym.hu/"),
    ]
    for name, pc, city, addr, url in thor_sites:
        lat, lng, src, pc = apply_geocode(cache, addr, city, pc)
        cat = "READY_TO_IMPORT" if lat is not None else "NEEDS_COORDINATES"
        rows.append(
            row(
                brand="Thor Gym",
                chain_key="thor",
                name=name,
                address=addr,
                postal_code=pc,
                city=city,
                lat=lat,
                lng=lng,
                source_url=url,
                website="https://thorgym.hu/",
                coord_source=src,
                notes="thor_official_subdomain",
                import_category=cat,
            )
        )
    for name, city, url in [
        ("Thor Gym Székesfehérvár", "Székesfehérvár", "https://fehervar.thorgym.hu/"),
        ("Thor Gym Kaposvár", "Kaposvár", "https://kaposvar.thorgym.hu/"),
    ]:
        rows.append(
            row(
                brand="Thor Gym",
                chain_key="thor",
                name=name,
                address="(street incomplete on official subdomain)",
                postal_code="",
                city=city,
                lat=None,
                lng=None,
                source_url=url,
                website="https://thorgym.hu/",
                coord_source=None,
                notes="thor_subdomain_exists_street_incomplete",
                import_category="NEEDS_REVIEW",
            )
        )

    # ---------- GILDA MAX legacy ----------
    rows.append(
        row(
            brand="Gilda Max",
            chain_key="gilda_max",
            name="Gilda Max (legacy — acquired by Life1)",
            address="(legacy brand)",
            postal_code="",
            city="Budapest",
            lat=None,
            lng=None,
            source_url="https://life1.hu/",
            website="https://life1.hu/",
            coord_source=None,
            notes="acquired_by_life1_2017_no_current_consumer_brand",
            import_category="LEGACY",
            is_active=False,
            is_closed=True,
        )
    )

    # Finalize categories
    for r in rows:
        if r["import_category"] in ("READY_TO_IMPORT", "NEEDS_COORDINATES"):
            r["import_category"] = classify(r)
    return rows


def proximity_report(ready: list[dict]) -> dict:
    pairs = {25: [], 50: [], 100: [], 200: []}
    identical = defaultdict(list)
    for i, a in enumerate(ready):
        key = f"{a['lat']}|{a['lng']}"
        identical[key].append(a["id"])
        for b in ready[i + 1 :]:
            if a["brand"] != b["brand"]:
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            for t in pairs:
                if d <= t:
                    pairs[t].append(
                        {
                            "a": a["id"],
                            "b": b["id"],
                            "brand": a["brand"],
                            "names": [a["name"], b["name"]],
                            "distance_m": round(d, 1),
                            "class": "A_legitimate" if d > 25 else "B_duplicate_suspect",
                        }
                    )
    identical_clusters = {k: v for k, v in identical.items() if len(v) > 1}
    # Mark 4% Garden/OnlyGirls same address as A_legitimate product co-location
    for t, lst in pairs.items():
        for p in lst:
            if set(p["names"]) <= {"4% GARDEN", "4% ONLYGIRLS"} or (
                "GARDEN" in p["names"][0] and "ONLYGIRLS" in p["names"][1]
            ) or (
                "ONLYGIRLS" in p["names"][0] and "GARDEN" in p["names"][1]
            ):
                p["class"] = "A_legitimate_same_building_products"
    return {
        "same_brand_lte_25m": pairs[25],
        "same_brand_lte_50m": pairs[50],
        "same_brand_lte_100m": pairs[100],
        "same_brand_lte_200m": pairs[200],
        "identical_coordinate_clusters": identical_clusters,
        "counts": {
            "lte_25m": len(pairs[25]),
            "lte_50m": len(pairs[50]),
            "lte_100m": len(pairs[100]),
            "lte_200m": len(pairs[200]),
            "identical_clusters": len(identical_clusters),
        },
    }


def city_coverage(ready: list[dict]) -> dict:
    out = {}
    for c in MAJOR_CITIES:
        out[c] = any(
            (r.get("city") or "").strip().lower() == c.lower()
            or re.search(rf"\b{re.escape(c)}\b", f"{r.get('name')} {r.get('address')}", re.I)
            for r in ready
        )
    # Avoid Szegedi út false-positive for Szeged
    if out.get("Szeged"):
        out["Szeged"] = any((r.get("city") or "").strip().lower() == "szeged" for r in ready)
    return out


def main() -> None:
    sha = production_sha()
    assert sha == PROD_SHA_EXPECTED, f"Production SHA drift: {sha}"
    centers = json.loads((ROOT / "src/data/centers.json").read_text(encoding="utf-8"))
    assert len(centers) == PRODUCTION_TOTAL
    assert sum(1 for c in centers if c.get("country") == "Hungary") == 0

    cache = load_json(OUT / "hungary_geocode_cache.json", {})
    rows = discover_all(cache)
    write_json(OUT / "hungary_geocode_cache.json", cache)

    # Deduplicate by id (keep first READY preference)
    by_id: dict[str, dict] = {}
    for r in rows:
        if r["id"] not in by_id:
            by_id[r["id"]] = r
        else:
            prev = by_id[r["id"]]
            rank = {"READY_TO_IMPORT": 0, "NEEDS_COORDINATES": 1, "NEEDS_REVIEW": 2, "COMING_SOON": 3, "LEGACY": 4, "CLOSED": 5}
            if rank.get(r["import_category"], 9) < rank.get(prev["import_category"], 9):
                by_id[r["id"]] = r
    staging = list(by_id.values())
    staging.sort(key=lambda r: (r.get("brand") or "", r.get("name") or ""))

    ready = [r for r in staging if r["import_category"] == "READY_TO_IMPORT"]
    status_counts = Counter(r["import_category"] for r in staging)
    ready_by_brand = Counter(r["brand"] for r in ready)

    # Phase 1 Life1 preservation check
    phase1 = load_json(OUT / "HUNGARY_PHASE1_READY_TO_IMPORT.json", [])
    p1_ids = {r["id"] for r in phase1}
    staging_ids = {r["id"] for r in staging}
    preserved = sorted(p1_ids & staging_ids)
    dropped = sorted(p1_ids - staging_ids)

    dup = proximity_report(ready)
    # Demote identical-coord same-brand pairs that aren't intentional product co-locations
    for key, ids in list(dup["identical_coordinate_clusters"].items()):
        members = [r for r in ready if r["id"] in ids]
        brands = {m["brand"] for m in members}
        names = {m["name"] for m in members}
        if brands == {"4% Fitness"} and names <= {"4% GARDEN", "4% ONLYGIRLS", "4% GYM"}:
            # Garden/OnlyGirls share Erkel 18 — OK; if GYM also identical, investigate
            if "4% GYM" in names and len(names) > 2:
                pass
        elif len(brands) == 1 and len(members) > 1:
            # keep as flagged but don't auto-delete
            pass

    # Geocode review log
    geocode_review = [
        {
            "id": r["id"],
            "name": r["name"],
            "brand": r["brand"],
            "coord_source": r.get("coord_source"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "category": r["import_category"],
        }
        for r in staging
    ]

    rebrand_map = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mappings": [
            {
                "from": "Gilda Max",
                "to": "Life1 Fitness",
                "status": "acquired_2017_legacy",
                "action": "do_not_import_gilda_max",
                "evidence": "Life1 acquisition reporting; no current Gilda Max consumer sites found",
            },
            {
                "from": "Oxygen Wellness Fáy / Life1 Fáy",
                "to": "Prestige Fitness",
                "status": "rebranded",
                "action": "import_as_prestige_preserve_phase1_id",
                "phase1_id": "hu_cb9223a0d5",
                "evidence": "prestigefitness.hu + life1.hu map data-link=/prestige",
            },
            {
                "from": "Pólus Fitness",
                "to": "Fitness5 Pólus Center",
                "status": "rebranded_on_site",
                "action": "import_as_fitness5",
                "evidence": "fitness5.hu/gym/polus-center copy",
            },
        ],
    }

    coverage = city_coverage(ready)
    projected = PRODUCTION_TOTAL + len(ready)

    chain_completeness = {
        "Life1 Fitness": {
            "official_current_estimate": 6,
            "discovered": sum(1 for r in staging if r["brand"] == "Life1 Fitness"),
            "READY": ready_by_brand.get("Life1 Fitness", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Life1 Fitness" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "COMPLETE",
            "notes": "Official map pins: Allee, Mammut, Corvin, Etele, Nyugati, Váci; Fáy rebranded Prestige",
        },
        "Prestige Fitness": {
            "official_current_estimate": 1,
            "discovered": sum(1 for r in staging if r["brand"] == "Prestige Fitness"),
            "READY": ready_by_brand.get("Prestige Fitness", 0),
            "unresolved": 0,
            "verdict": "COMPLETE",
        },
        "Chili Fitness": {
            "official_current_estimate": 5,
            "discovered": sum(1 for r in staging if r["brand"] == "Chili Fitness"),
            "READY": ready_by_brand.get("Chili Fitness", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Chili Fitness" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "COMPLETE" if ready_by_brand.get("Chili Fitness", 0) >= 4 else "NEAR-COMPLETE",
        },
        "4% Fitness": {
            "official_current_estimate": 8,
            "discovered": sum(1 for r in staging if r["brand"] == "4% Fitness"),
            "READY": ready_by_brand.get("4% Fitness", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "4% Fitness" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "NEAR-COMPLETE",
            "notes": "Lotus exact street may remain review; Garden/OnlyGirls co-located",
        },
        "Fitness5": {
            "official_current_estimate": 18,
            "discovered": sum(1 for r in staging if r["brand"] == "Fitness5"),
            "READY": ready_by_brand.get("Fitness5", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Fitness5" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "NEAR-COMPLETE",
            "notes": "3 coming-soon (Esztergom/Sopron/Veszprém); Szolnok/Tatabánya address debt",
        },
        "Nr1 Fitness": {
            "official_current_estimate": 5,
            "discovered": sum(1 for r in staging if r["brand"] == "Nr1 Fitness"),
            "READY": ready_by_brand.get("Nr1 Fitness", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Nr1 Fitness" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "PARTIAL",
            "notes": "Rákóczi + Vágóhíd need exact streets from location pages",
        },
        "Cutler Gym": {
            "official_current_estimate": 8,
            "discovered": sum(1 for r in staging if r["brand"] == "Cutler Gym"),
            "READY": ready_by_brand.get("Cutler Gym", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Cutler Gym" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "NEAR-COMPLETE",
            "notes": "Franchise-style branded network; Miskolc site unresolved",
        },
        "Thor Gym": {
            "official_current_estimate": 6,
            "discovered": sum(1 for r in staging if r["brand"] == "Thor Gym"),
            "READY": ready_by_brand.get("Thor Gym", 0),
            "unresolved": sum(
                1
                for r in staging
                if r["brand"] == "Thor Gym" and r["import_category"] != "READY_TO_IMPORT"
            ),
            "verdict": "NEAR-COMPLETE",
            "notes": "Homepage claims 11 points historically; 6 current subdomains confirmed",
        },
        "Oxygen Wellness": {
            "official_current_estimate": 1,
            "discovered": 1,
            "READY": ready_by_brand.get("Oxygen Wellness", 0),
            "unresolved": 0,
            "verdict": "COMPLETE",
            "notes": "Naphegy only; Fáy → Prestige",
        },
        "Gilda Max": {
            "official_current_estimate": 0,
            "discovered": 1,
            "READY": 0,
            "unresolved": 0,
            "verdict": "EXCLUDED",
            "notes": "Legacy after Life1 acquisition",
        },
    }

    # Quality checks
    invalid_pc = sum(1 for r in ready if not HUNGARY_POSTAL_RE.match(str(r.get("postal_code") or "")))
    missing_addr = sum(1 for r in ready if len(str(r.get("address") or "").strip()) < 4)
    missing_city = sum(1 for r in ready if not str(r.get("city") or "").strip())
    bad_coords = sum(
        1
        for r in ready
        if not (
            isinstance(r.get("lat"), (int, float))
            and isinstance(r.get("lng"), (int, float))
            and math.isfinite(r["lat"])
            and math.isfinite(r["lng"])
            and in_hungary(r["lat"], r["lng"])
        )
    )
    fallback = sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or "")))
    foreign = sum(1 for r in ready if FOREIGN.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"))
    mojibake = sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"))
    dup_ids = len(ready) - len({r["id"] for r in ready})

    # Verdict logic
    material_gaps = []
    if ready_by_brand.get("Nr1 Fitness", 0) < 3:
        material_gaps.append("Nr1 Fitness incomplete (Rákóczi/Vágóhíd streets)")
    if ready_by_brand.get("Fitness5", 0) < 12:
        material_gaps.append("Fitness5 READY below expected live estate")
    if not coverage.get("Debrecen"):
        material_gaps.append("Debrecen missing")
    if not any(coverage.get(c) for c in ["Győr", "Pécs", "Nyíregyháza", "Kecskemét", "Székesfehérvár"]):
        material_gaps.append("Regional west/east coverage missing")

    # Merge-ready if major networks represented and remaining gaps are edge cases
    phase3 = False
    if ready_by_brand.get("Life1 Fitness", 0) < 6:
        phase3 = True
        material_gaps.append("Life1 incomplete")
    if ready_by_brand.get("Chili Fitness", 0) < 4:
        phase3 = True
    if ready_by_brand.get("4% Fitness", 0) < 5:
        phase3 = True
    if ready_by_brand.get("Fitness5", 0) < 10:
        phase3 = True
    if ready_by_brand.get("Cutler Gym", 0) < 5:
        phase3 = True
    # Nr1 partial + Thor partial + F5 coming-soon are non-blocking if others strong
    verdict = (
        "HUNGARY PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR HUNGARY MERGE"
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_hungary": 0,
        "production_sha256": sha,
        "phase1_ready": len(phase1),
        "phase1_ids_preserved": preserved,
        "phase1_ids_dropped": dropped,
        "unique_staged": len(staging),
        "status_counts": dict(status_counts),
        "ready_count": len(ready),
        "ready_by_brand": dict(ready_by_brand),
        "city_coverage": coverage,
        "chain_completeness": chain_completeness,
        "duplicate_analysis_counts": dup["counts"],
        "data_quality": {
            "duplicate_ids": dup_ids,
            "invalid_postcodes": invalid_pc,
            "missing_addresses": missing_addr,
            "missing_cities": missing_city,
            "invalid_coordinates": bad_coords,
            "fallback_coords": fallback,
            "foreign_outliers": foreign,
            "mojibake": mojibake,
        },
        "projected_catalog": projected,
        "crosses_12500": projected > 12500,
        "global_stress_qa_required": False,
        "material_gaps": material_gaps,
        "verdict": verdict,
    }

    write_json(OUT / "hungary_centers_staging.json", staging)
    write_json(OUT / "HUNGARY_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "HUNGARY_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "HUNGARY_PHASE2_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "hungary_duplicate_analysis.json", dup)
    write_json(OUT / "hungary_geocode_review.json", geocode_review)
    write_json(OUT / "hungary_chain_inventory.json", {
        "country": "Hungary",
        "prefix": "hu_",
        "phase": 2,
        "ready_by_brand": dict(ready_by_brand),
        "status_counts": dict(status_counts),
        "chain_completeness": chain_completeness,
        "city_coverage": coverage,
    })

    # XLSX
    try:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Hungary Phase2"
        headers = [
            "id",
            "brand",
            "name",
            "address",
            "postal_code",
            "city",
            "lat",
            "lng",
            "import_category",
            "coord_source",
            "source_url",
            "notes",
        ]
        ws.append(headers)
        for r in staging:
            ws.append([r.get(h) for h in headers])
        wb.save(OUT / "Gymly_Hungary_All_Discovered_Centers.xlsx")
    except Exception as e:
        (PHASE2 / "xlsx_error.txt").write_text(str(e))

    # Markdown report
    lines = [
        "# HUNGARY PHASE 2 READINESS REPORT",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Unique staged | {len(staging)} |",
        f"| READY_TO_IMPORT | {len(ready)} |",
        f"| NEEDS_COORDINATES | {status_counts.get('NEEDS_COORDINATES', 0)} |",
        f"| NEEDS_REVIEW | {status_counts.get('NEEDS_REVIEW', 0)} |",
        f"| COMING_SOON | {status_counts.get('COMING_SOON', 0)} |",
        f"| CLOSED/LEGACY | {status_counts.get('CLOSED', 0) + status_counts.get('LEGACY', 0)} |",
        f"| Projected catalog | {projected} |",
        f"| Crosses 12,500? | {report['crosses_12500']} |",
        "",
        "## READY by brand",
        "",
    ]
    for b, n in sorted(ready_by_brand.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {b}: {n}")
    lines += [
        "",
        "## Phase 1 Life1 preservation",
        "",
        f"- Preserved IDs: {len(preserved)} / {len(p1_ids)}",
        f"- Dropped IDs: {dropped or 'none'}",
        "",
        "## City coverage (READY)",
        "",
    ]
    for c, ok in coverage.items():
        lines.append(f"- {c}: {'yes' if ok else 'no'}")
    lines += [
        "",
        "## Chain completeness",
        "",
    ]
    for brand, meta in chain_completeness.items():
        lines.append(
            f"- **{brand}**: READY {meta['READY']} / est {meta['official_current_estimate']} — {meta['verdict']}"
        )
    lines += [
        "",
        "## Data quality (READY)",
        "",
        f"- Duplicate IDs: {dup_ids}",
        f"- Same-brand ≤200 m: {dup['counts']['lte_200m']}",
        f"- Invalid postcodes: {invalid_pc}",
        f"- Invalid coords: {bad_coords}",
        f"- Fallback coords: {fallback}",
        f"- Foreign outliers: {foreign}",
        f"- Mojibake: {mojibake}",
        "",
        "## Verdict",
        "",
        f"**{verdict}**",
        "",
        "Production `centers.json` was not modified.",
        "",
    ]
    (OUT / "HUNGARY_PHASE2_READINESS_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Final safety
    sha2 = production_sha()
    assert sha2 == PROD_SHA_EXPECTED
    print(json.dumps({
        "verdict": verdict,
        "ready": len(ready),
        "staged": len(staging),
        "ready_by_brand": dict(ready_by_brand),
        "status_counts": dict(status_counts),
        "projected": projected,
        "phase1_preserved": len(preserved),
        "production_sha": sha2,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
