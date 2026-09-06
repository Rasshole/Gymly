#!/usr/bin/env python3
"""
Switzerland Phase 2 — NonStop recovery, secondary chains, merge with Phase 1 staging.
Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import math
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/switzerland"
PHASE1 = OUT / "switzerland_centers_staging.json"
PHASE1_READY = OUT / "SWITZERLAND_PHASE1_READY_TO_IMPORT.json"
PHASE1_BASELINE = OUT / "switzerland_phase1_staging_baseline.json"
CACHE = OUT / "switzerland_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PHASE2 = OUT / "phase2"

for d in (RAW, SCRAPES, PHASE2):
    d.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-CH,de;q=0.9,fr;q=0.8,it;q=0.8,en;q=0.7",
}
PRODUCTION_TOTAL = 10050
CH_BOUNDS = (45.82, 47.81, 5.96, 10.49)
CH_POSTAL_RE = re.compile(r"^\d{4}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€")
LI_POSTAL_PREFIXES = ("948", "949")
COMING_SOON_SLUGS = {
    "basel-brausebad",
    "basel-brausebad-2",
    "fribourg-ste-therese",
    "thalwil",
    "fuellinsdorf",
    "fullinsdorf",
}


def load_phase1_baseline() -> list[dict]:
    """Frozen Phase 1 staging (290 rows) — never merge from an already phase2-updated file."""
    if PHASE1_BASELINE.exists():
        baseline = json.loads(PHASE1_BASELINE.read_text(encoding="utf-8"))
        if len(baseline) == 290:
            return baseline

    ready_rows = json.loads(PHASE1_READY.read_text(encoding="utf-8"))
    ready_ids = {r["id"] for r in ready_rows}
    phase1_brands = {"ACTIV FITNESS", "Fitnesspark", "PureGym", "clever fit", "Let's Go Fitness"}

    staging = json.loads(PHASE1.read_text(encoding="utf-8")) if PHASE1.exists() else []
    non_ready: list[dict] = []
    for r in staging:
        if r["id"] in ready_ids or r.get("brand") not in phase1_brands:
            continue
        rr = dict(r)
        if "Serfontana" in (rr.get("center_name") or "") or "Uznach" in (rr.get("center_name") or ""):
            rr["lat"] = None
            rr["lng"] = None
            rr["coord_source"] = None
            rr["import_category"] = "NEEDS_COORDINATES"
            rr["verification_status"] = "NEEDS_COORDINATES"
            rr["notes"] = re.sub(r"; phase2_maps_recovery", "", rr.get("notes") or "")
        non_ready.append(rr)

    baseline = ready_rows + non_ready
    if len(baseline) != 290:
        print(f"  WARN: reconstructed Phase 1 baseline has {len(baseline)} rows (expected 290)")
    PHASE1_BASELINE.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return baseline


def swiss_language_region(postal: str, city: str) -> str:
    """Rough language-region bucket for READY coverage reporting."""
    pc = int(postal) if str(postal).isdigit() else 0
    city_l = (city or "").lower()
    if 6500 <= pc <= 6999 or any(
        x in city_l for x in ("lugano", "bellinzona", "locarno", "mendrisio", "chiasso", "bioggio", "biasca")
    ):
        return "italian"
    french_ranges = ((1000, 1299), (1300, 1599), (1600, 1799), (1800, 1999), (2000, 2999))
    if any(lo <= pc <= hi for lo, hi in french_ranges):
        return "french"
    if any(
        x in city_l
        for x in (
            "genève",
            "geneve",
            "geneva",
            "lausanne",
            "fribourg",
            "freiburg",
            "neuchâtel",
            "neuchatel",
            "sion",
            "martigny",
            "nyon",
            "montreux",
            "yverdon",
            "vevey",
            "morges",
            "aigle",
            "rolle",
            "meyrin",
            "vernier",
            "carouge",
            "petit-lancy",
            "conthey",
            "sierre",
        )
    ):
        return "french"
    return "german"


def regional_ready_counts(ready: list[dict]) -> dict:
    counts = Counter()
    for r in ready:
        counts[swiss_language_region(str(r.get("postal_code") or ""), r.get("city") or "")] += 1
    return dict(counts)


# Official NonStop club list recovered from https://www.nonstopgym.com/nostri-club/ (public club selector)
NONSTOP_CLUBS = [
    ("Servette", "Rue du Grand-Pré 58", "1201", "Genève"),
    ("Jonction", "Rue des Deux-Ponts 14", "1203", "Genève"),
    ("Lancy", "Route de Chancy 59", "1212", "Petit-Lancy"),
    ("Lausanne Gare", "Avenue d'Ouchy 3", "1006", "Lausanne"),
    ("Blandonnet", "Chemin des Papillons 4", "1216", "Cointrin"),
    ("Carouge", "Avenue Cardinal-Mermillod 36", "1227", "Carouge"),
    ("Oerlikon", "Elias-Canetti-Strasse 2", "8050", "Zürich"),
    ("Eaux-Vives", "Rue de Jargonnant 2", "1207", "Genève"),
    ("Fribourg", "Boulevard de Pérolles 7", "1700", "Fribourg"),
    ("Viadukt", "Viaduktstrasse 20", "8005", "Zürich"),
    ("Malley", "Avenue du Chablais 3B", "1007", "Lausanne"),
    ("Bienne", "Bahnhofplatz 2", "2502", "Biel/Bienne"),
    ("Champel", "Rue Le Corbusier 22", "1208", "Genève"),
    ("Nyon", "Allée de la Petite Prairie 10", "1260", "Nyon"),
    ("Stauffacher", "Kanzleistrasse 18", "8004", "Zürich"),
    ("Paquis", "Rue de Lausanne 80", "1202", "Genève"),
    ("Chêne-Bourg", "Chemin de la Gravière 3", "1225", "Chêne-Bourg"),
    ("Epalinges", "Chemin de la Croix Blanche", "1066", "Epalinges"),
    ("Cornavin", "Passage de Montbrillant", "1201", "Genève"),
    ("Tunnel", "Rue de la Borde 3b", "1018", "Lausanne"),
    ("Kesselhaus", "Zürcherstrasse 1", "8400", "Winterthur"),
    ("Ecublens", "Route du Bois", "1024", "Ecublens"),
    ("St. Gallen", "Kornhausstrasse 25", "9000", "St. Gallen"),
    ("Flon", "Rue de Genève 8", "1003", "Lausanne"),
    ("Westfeld", "Westfeld 2", "4055", "Basel"),
    ("Aigle", "Avenue des Ormonts 18", "1860", "Aigle"),
    ("Rolle", "Z. A. La Pièce 4b", "1180", "Rolle"),
    ("Bioggio", "Via della Posta 23", "6934", "Bioggio"),
    ("Mendrisio", "Via Penate 7", "6850", "Mendrisio"),
    ("Martigny", "Rte du Grand-Saint-Bernard 21", "1921", "Martigny-Combe"),
    ("Conthey", "Rte des Rottes 8", "1964", "Conthey"),
    ("Uvrier", "Rte d Italie 156", "1958", "Uvrier"),
    ("Bale Clara", "Clarastrasse 12", "4058", "Basel"),
    ("Bussigny", "Chemin de Mochettaz 2", "1030", "Bussigny"),
    ("Lugano", "Via Ferruccio Pelli 2", "6900", "Lugano"),
    ("Etang", "Avenue de L'étang 55", "1219", "Vernier"),
    ("Zug", "Bahnhofstrasse 21", "6300", "Zug"),
    ("Yverdon", "Chaussée de Treycovagnes 3c", "1400", "Yverdon-les-Bains"),
    ("Brig", "Bielstrasse 8", "3902", "Glis"),
    ("Grenchen", "Bettlachstrasse 20", "2540", "Grenchen"),
    ("Bellinzona", "Via S. Gottardo 112", "6500", "Bellinzona"),
    ("Versoix", "Rte des Fayards 280", "1290", "Versoix"),
    ("Sierre", "Av. de Rossfeld 9", "3960", "Sierre"),
    ("Horgen", "Dammstrasse 26", "8810", "Horgen"),
    ("Olten", "Riggenbachstrasse 6", "4600", "Olten"),
    ("Frauenfeld", "Zürcherstrasse 297", "8500", "Frauenfeld"),
    ("Amriswil", "Kirchstrasse 11", "8580", "Amriswil"),
    ("Blécherette", "Avenue Gratta Paille 1", "1018", "Lausanne"),
]

HARMONY_CLUBS = [
    ("Eaux-Vives", "Rue du Nant 10", "1207", "Genève"),
    ("La Praille", "Rte des Jeunes 10", "1212", "Grand-Lancy"),
    ("Veyrier", "Avenue du Grand-Salève 4", "1255", "Veyrier"),
    ("Blandonnet", "Rte de Pré-Bois 6", "1214", "Vernier"),
    ("Meyrin", "Rue de la Bergère 3A", "1217", "Meyrin"),
    ("Cointrin Les Ailes", "Chem. des Ailes 35", "1216", "Cointrin"),
    ("Pâquis MAA", "Rue Jean-Charles Amat 12", "1202", "Genève"),
    ("Pâquis Gym", "20 rue de Lausanne", "1202", "Genève"),
    ("Versoix", "Ch. de la Scie 2", "1290", "Versoix"),
    ("Denges", "La Crosette 4", "1026", "Denges"),
    ("Gland", "Route Suisse 35", "1196", "Gland"),
    ("Signy", "Rue des Fléchères 7A", "1274", "Signy"),
]

# Official well come FIT club addresses (wellcomefit.ch club selector / club pages)
WELLCOME_CLUBS = [
    ("Arbon", "Textilstrasse 5", "9320", "Arbon"),
    ("Basel", "Dornacherstrasse 210", "4053", "Basel"),
    ("Berg", "Ziegeleistrasse", "8572", "Berg"),
    ("Bülach", "Feldstrasse 72", "8180", "Bülach"),
    ("Dietlikon", "Riedwiesenstrasse 3", "8305", "Dietlikon"),
    ("Frauenfeld West", "Gewerbestrasse 1", "8500", "Frauenfeld"),
    ("Frauenfeld Zentral", "Walzmühlestrasse 50", "8500", "Frauenfeld"),
    ("Herisau", "Industriestrasse 28", "9100", "Herisau"),
    ("Kreuzlingen", "Romanshornerstrasse 1", "8280", "Kreuzlingen"),
    ("Muri", "Luzernerstrasse 93", "5630", "Muri"),
    ("Netstal", "CENTRO 6", "8754", "Netstal"),
    ("Niederurnen", "Fabrikstrasse 2", "8867", "Niederurnen"),
    ("Obfelden", "Ottenbacherstrasse 23", "8912", "Obfelden"),
    ("Oerlikon", "Thurgauerstrasse 40", "8050", "Zürich"),
    ("Pfungen", "Riedackerstrasse 5", "8422", "Pfungen"),
    ("Rikon", "Tösstalstrasse 102", "8486", "Rikon im Tösstal"),
    ("Schwanden", "Hauptstrasse 2", "8762", "Schwanden"),
    ("Sennwald", "Walchistrasse 3", "9466", "Sennwald"),
    ("Sirnach", "Wilerstrasse 96", "8370", "Sirnach"),
    ("St. Gallen Einstein", "Kapellenstrasse 1", "9000", "St. Gallen"),
    ("St. Gallen Ost", "Spinnereistrasse 8", "9008", "St. Gallen"),
    ("St. Gallen West", "Rittmeyerstrasse 15", "9014", "St. Gallen"),
    ("Steckborn", "im Feldbach 1c", "8266", "Steckborn"),
    ("Wallisellen", "Hammerweg 1", "8304", "Wallisellen"),
    ("Wetzikon Nord", "Breitistrasse 21", "8623", "Wetzikon"),
    ("Wetzikon Süd", "Hofstrasse 106", "8620", "Wetzikon"),
    ("Wil", "Ringstrasse Stelz 31", "9500", "Wil"),
    ("Winterthur", "Im Hölderli 10", "8405", "Winterthur"),
]

MAPS_RECOVERY = {
    "ch_735f8c01fe": "https://maps.app.goo.gl/V8tuwRioWFzf2g24A",  # Serfontana
    "ch_bfacae8293": "https://maps.app.goo.gl/MpRN1p7eELamZhsw7",  # Uznach
}


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ch_postal(s: str) -> str:
    m = re.search(r"\b(\d{4})\b", str(s or ""))
    return m.group(1) if m else ""


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
            "switzerland",
        ]
    )
    return "ch_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def in_switzerland(lat: float, lng: float) -> bool:
    return CH_BOUNDS[0] <= lat <= CH_BOUNDS[1] and CH_BOUNDS[2] <= lng <= CH_BOUNDS[3]


def is_liechtenstein(postal: str, city: str, address: str = "") -> bool:
    blob = f"{postal} {city} {address}".lower()
    if "liechtenstein" in blob:
        return True
    if postal.startswith(LI_POSTAL_PREFIXES):
        return True
    return False


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def norm_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9äöüéèàç]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def row(
    brand: str,
    center_name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    *,
    lat=None,
    lng=None,
    source_type: str = "official_page",
    coord_source: str | None = None,
    legacy_brand: str = "",
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    official_location_id: str = "",
    phase: str = "switzerland_phase2",
):
    address = clean_text(address)
    postal = ch_postal(postal)
    city = clean_text(city)
    center_name = clean_text(center_name)
    if is_liechtenstein(postal, city, address):
        notes = (notes + "; liechtenstein_excluded").strip("; ")

    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if not in_switzerland(lat_f, lng_f):
                notes = (notes + "; coord_outside_ch_bbox").strip("; ")
                lat_f = lng_f = None
        except (TypeError, ValueError):
            lat_f = lng_f = None

    name = center_name
    if brand and center_name and not center_name.lower().startswith(brand.lower()[:4]):
        name = f"{brand} {center_name}".strip()

    status = "CLOSED" if closed else ("COMING_SOON" if coming else "NEEDS_REVIEW")
    if "liechtenstein_excluded" in notes:
        status = "NEEDS_REVIEW"

    return {
        "id": make_id(brand, address, postal, city),
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": center_name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Switzerland",
        "lat": lat_f,
        "lng": lng_f,
        "website": None,
        "source_url": source_url,
        "source_type": source_type,
        "verification_status": status,
        "notes": notes,
        "is_active": not (closed or coming),
        "import_category": status if status in ("COMING_SOON", "CLOSED") else "NEEDS_REVIEW",
        "phase": phase,
        "coord_source": coord_source,
        "legacy_brand": legacy_brand or None,
        "official_location_id": official_location_id or None,
        "discovery_class": "national_chain",
    }


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Switzerland"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
        return None, None, ""

    params = urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1, "countrycodes": "ch", "addressdetails": 1}
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "GymlySwitzerlandPhase2/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[q] = None
        return None, None, ""
    time.sleep(1.05)
    if not data:
        cache[q] = None
        return None, None, ""
    hit = data[0]
    lat, lng = float(hit["lat"]), float(hit["lon"])
    addr = hit.get("address") or {}
    pc = str(addr.get("postcode") or "")
    if postal and pc and pc != postal:
        blob = json.dumps(addr, ensure_ascii=False).lower()
        if (city or "").lower()[:4] not in blob:
            cache[q] = None
            return None, None, ""
    if not in_switzerland(lat, lng):
        cache[q] = None
        return None, None, ""
    cache[q] = {"lat": lat, "lng": lng, "source": "STRICT_ADDRESS_GEOCODE", "display": hit.get("display_name")}
    return lat, lng, "STRICT_ADDRESS_GEOCODE"


def resolve_maps_short(url: str) -> tuple[float | None, float | None]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            final = r.geturl()
        m = re.search(r"@([0-9.+-]+),([0-9.+-]+)", final) or re.search(r"!3d([0-9.+-]+)!4d([0-9.+-]+)", final)
        if m:
            return float(m.group(1)), float(m.group(2))
    except Exception:
        pass
    return None, None


def discover_nonstop() -> list[dict]:
    print("=== NonStop Gym (official nostri-club selector evidence) ===")
    (SCRAPES / "nonstop_nostri_club_clubs.json").write_text(
        json.dumps(NONSTOP_CLUBS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    out = []
    for name, address, postal, city in NONSTOP_CLUBS:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        out.append(
            row(
                "NonStop Gym",
                name,
                address,
                postal,
                city,
                "https://www.nonstopgym.com/nostri-club/",
                source_type="official_club_selector",
                official_location_id=slug,
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def discover_kieser() -> list[dict]:
    print("=== Kieser Training Switzerland ===")
    html = fetch("https://www.kieser-training.ch/ch-de/studios/")
    (RAW / "kieser_studios_ch.html").write_text(html[:800000], encoding="utf-8")
    out = []
    for m in re.finditer(
        r"'id': '(\d+)',\s*'name': '([^']+)',\s*'lng': '([^']+)',\s*'lat': '([^']+)',\s*'city': '([^']+)',\s*'plz': '(\d{4})',\s*'street': '([^']*)',\s*'pid': '[^']*',\s*'country': '2',\s*'detail_url': '(/ch-de/studios/[^']+)'",
        html,
    ):
        _id, name, lng, lat, city, postal, street, path = m.groups()
        out.append(
            row(
                "Kieser",
                name,
                street,
                postal,
                city,
                f"https://www.kieser-training.ch{path}",
                lat=float(lat),
                lng=float(lng),
                coord_source="OFFICIAL_LOCATOR",
                source_type="official_embedded_json",
                official_location_id=_id,
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def discover_harmony() -> list[dict]:
    print("=== Harmony ===")
    out = []
    for name, address, postal, city in HARMONY_CLUBS:
        out.append(
            row(
                "Harmony",
                name,
                address,
                postal,
                city,
                "https://www.harmony.ch/",
                source_type="official_homepage_club_list",
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def discover_wellcome() -> list[dict]:
    print("=== well come FIT ===")
    (SCRAPES / "wellcome_clubs_official.json").write_text(
        json.dumps(WELLCOME_CLUBS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    out = []
    for name, address, postal, city in WELLCOME_CLUBS:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        out.append(
            row(
                "well come FIT",
                name,
                address,
        postal,
                city,
                f"https://wellcomefit.ch/clubs/{slug}",
                source_type="official_club_selector",
                official_location_id=slug,
            )
        )
    print(f"  discovered: {len(out)}")
    return out


def update_fitness_slugs() -> list[str]:
    xml = fetch("https://www.update-fitness.ch/locations-sitemap.xml")
    (RAW / "update_fitness_locations_sitemap.xml").write_text(xml, encoding="utf-8")
    slugs = set()
    for u in re.findall(r"<loc>(https://www\.update-fitness\.ch/[^<]+)</loc>", xml):
        if "/fr_ch/" in u or "/it/" in u:
            continue
        path = u.replace("https://www.update-fitness.ch/", "").strip("/")
        if not path or "/" in path:
            continue
        if path in ("standorte", "news", "24-7") or "rueckblick" in path:
            continue
        slugs.add(path)
    return sorted(slugs)


def parse_update_fitness_page(html: str, slug: str) -> dict | None:
    coming = bool(
        re.search(
            r"coming soon|demnächst|Machbarkeit in Abklärung|Neueröffnung im Herbst|Eröffnung voraussichtlich",
            html,
            re.I,
        )
    )
    street = postal = city = ""
    m = re.search(
        r'pdf-head-details">update Fitness[^<]*</p>\s*<p>([^<]+)</p>\s*<p>(\d{4})\s+([^<]+)</p>',
        html,
        re.I | re.S,
    )
    if m:
        street, postal, city = clean_text(m.group(1)), m.group(2), clean_text(m.group(3))
    if not street:
        m2 = re.search(
            r'pdf-head-details">update Fitness[^<]*?\s+([A-Za-zäöüÄÖÜ0-9 .\'\-/]+?)\s+(\d{4})\s+([^<]+?)\s+Center Management:',
            html,
            re.I,
        )
        if m2:
            street, postal, city = clean_text(m2.group(1)), m2.group(2), clean_text(m2.group(3).split("Telefon")[0])
    center = slug.replace("-", " ").title()
    title = re.search(r"<title>update Fitness ([^|<]+)", html, re.I)
    if title:
        center = clean_text(title.group(1).split("|")[0])
    if coming or slug in COMING_SOON_SLUGS:
        return {"coming": True, "center_name": center, "address": street, "postal_code": postal, "city": city}
    if not street or not postal or not city:
        return None
    return {"center_name": center, "address": street, "postal_code": postal, "city": city, "coming": False}


def discover_update_fitness() -> list[dict]:
    print("=== update Fitness ===")
    html = fetch("https://www.update-fitness.ch/standorte/")
    (RAW / "update_fitness_standorte.html").write_text(html[:800000], encoding="utf-8")
    html = html.replace("\\'", "'").replace('\\"', '"')
    seen: dict[str, tuple[str, str, str]] = {}
    for slug, street, postal, city in re.findall(
        r"update-fitness\.ch/([a-z0-9\-]+)/['\"][^>]*>[\s\S]{0,120}?<p>([^<]+)</p>\s*<p>(\d{4})\s+([^<]+)</p>",
        html,
        re.I,
    ):
        if slug in seen or slug in ("standorte", "news", "24-7") or "rueckblick" in slug:
            continue
        seen[slug] = (clean_text(street), postal, clean_text(city))

    # Verify coming-soon slugs against live location pages
    coming_slugs: set[str] = set(COMING_SOON_SLUGS)
    for slug in list(seen):
        if slug not in COMING_SOON_SLUGS:
            continue
        try:
            page = parse_update_fitness_page(fetch(f"https://www.update-fitness.ch/{slug}/"), slug)
            if page and page.get("coming"):
                coming_slugs.add(slug)
            elif page and page.get("address"):
                seen[slug] = (page["address"], page["postal_code"], page["city"])
                coming_slugs.discard(slug)
        except Exception:
            pass
        time.sleep(0.15)

    print(f"  standorte locations: {len(seen)}")
    out = []
    for slug in sorted(seen):
        street, postal, city = seen[slug]
        center = slug.replace("-", " ").title()
        coming = slug in coming_slugs
        out.append(
            row(
                "update Fitness",
                center,
                street,
                postal,
                city,
                f"https://www.update-fitness.ch/{slug}/",
                coming=coming,
                source_type="official_standorte_page",
                official_location_id=slug,
            )
        )
    print(f"  discovered: {len(out)} ({sum(1 for r in out if r.get('import_category')=='COMING_SOON')} coming soon)")
    return out


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
        return r
    if is_liechtenstein(str(r.get("postal_code") or ""), r.get("city") or "", r.get("address") or ""):
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["is_active"] = False
        return r
    reasons = []
    if not r.get("address") or len(r["address"]) < 3:
        reasons.append("missing_address")
    if not CH_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city"):
        reasons.append("missing_city")
    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None:
        reasons.append("missing_coords")
    elif not in_switzerland(lat_f, lng_f):
        reasons.append("foreign_coords")
    if "missing_coords" in reasons and len([x for x in reasons if x != "missing_coords"]) == 0:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["is_active"] = True
        return r
    hard = [x for x in reasons if x != "missing_coords"]
    if hard or "missing_coords" in reasons:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["is_active"] = True
        return r
    r["import_category"] = "READY_TO_IMPORT"
    r["verification_status"] = "VERIFIED_CURRENT"
    r["is_active"] = True
    r["country"] = "Switzerland"
    return r


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id: dict[str, dict] = {}
    by_addr: dict[str, dict] = {}
    dup: list[dict] = []

    def score(r: dict) -> tuple:
        pri = {
            "READY_TO_IMPORT": 5,
            "NEEDS_COORDINATES": 4,
            "NEEDS_REVIEW": 3,
            "COMING_SOON": 2,
            "CLOSED": 1,
            "DUPLICATE": 0,
            "LEGACY": 0,
        }.get(r.get("import_category") or "", 0)
        return (pri, 1 if r.get("lat") is not None else 0, 1 if r.get("phase") == "switzerland_phase1" else 0)

    for r in rows:
        rid = r["id"]
        addr_key = "|".join(
            [
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
                str(r.get("postal_code") or ""),
                norm_addr(r.get("city") or ""),
            ]
        )
        if rid in by_id:
            dup.append({"a": by_id[rid]["id"], "b": rid, "brand": r.get("brand"), "reason": "duplicate_id", "decision": "keep_higher_score"})
            if score(r) > score(by_id[rid]):
                by_id[rid] = r
            continue
        if addr_key in by_addr and addr_key.replace("|||", "").strip("|"):
            ex = by_addr[addr_key]
            if (ex.get("brand") or "").lower() == (r.get("brand") or "").lower():
                dup.append(
                    {
                        "a": ex["id"],
                        "b": rid,
                        "brand": r.get("brand"),
                        "address": r.get("address"),
                        "reason": "same_brand_same_address",
                        "decision": "keep_higher_score",
                    }
                )
                if score(r) > score(ex):
                    by_id[ex["id"]] = r
                    by_addr[addr_key] = r
                else:
                    r["import_category"] = "DUPLICATE"
                    r["verification_status"] = "DUPLICATE"
                    r["notes"] = (r.get("notes") or "") + f"; superseded_by={ex['id']}"
                    by_id[rid] = r
                continue
        by_id[rid] = r
        by_addr[addr_key] = r

    unique = [r for r in by_id.values() if r.get("import_category") != "DUPLICATE"]

    for i, a in enumerate(unique):
        if a.get("lat") is None:
            continue
        for b in unique[i + 1 :]:
            if b.get("lat") is None:
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            same_brand = (a.get("brand") or "").lower() == (b.get("brand") or "").lower()
            if same_brand and d <= 100:
                dup.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "brand": a.get("brand"),
                        "distance_m": round(d, 1),
                        "address_a": a.get("address"),
                        "address_b": b.get("address"),
                        "reason": "same_brand_proximity",
                        "decision": "flag_review" if d > 25 else "same_building_cluster",
                    }
                )
                if d < 25 and norm_addr(a.get("address") or "") == norm_addr(b.get("address") or ""):
                    if score(b) > score(a):
                        a["import_category"] = "DUPLICATE"
                        a["verification_status"] = "DUPLICATE"
                        a["notes"] = (a.get("notes") or "") + f"; superseded_by={b['id']}"
                    else:
                        b["import_category"] = "DUPLICATE"
                        b["verification_status"] = "DUPLICATE"
                        b["notes"] = (b.get("notes") or "") + f"; superseded_by={a['id']}"
    unique = [r for r in unique if r.get("import_category") != "DUPLICATE"]
    return unique, dup


def cross_brand_dedupe(rows: list[dict], dup: list[dict]) -> list[dict]:
    """Collapse only explicit legacy→successor rebrand pairs at the same address."""
    legacy_to_successor = {
        "one training center": "activ fitness",
        "silhouette wellness": "activ fitness",
        "only fitness": "activ fitness",
        "basefit": "puregym",
    }
    by_addr: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r.get("import_category") not in ("READY_TO_IMPORT", "NEEDS_COORDINATES", "NEEDS_REVIEW"):
            continue
        key = "|".join([norm_addr(r.get("address") or ""), str(r.get("postal_code") or ""), norm_addr(r.get("city") or "")])
        if key.strip("|"):
            by_addr[key].append(r)
    for group in by_addr.values():
        if len(group) < 2:
            continue
        for r in group:
            legacy = (r.get("legacy_brand") or r.get("brand") or "").lower()
            successor = legacy_to_successor.get(legacy)
            if not successor:
                continue
            matches = [g for g in group if (g.get("brand") or "").lower() == successor]
            if not matches:
                continue
            keeper = matches[0]
            if r["id"] == keeper["id"]:
                continue
            if r.get("import_category") == "READY_TO_IMPORT":
                dup.append(
                    {
                        "a": keeper["id"],
                        "b": r["id"],
                        "brand_a": keeper.get("brand"),
                        "brand_b": r.get("brand"),
                        "address": keeper.get("address"),
                        "reason": "cross_brand_rebrand_collision",
                        "decision": f"keep_{keeper.get('brand')}",
                    }
                )
                r["import_category"] = "DUPLICATE"
                r["verification_status"] = "DUPLICATE"
                r["legacy_brand"] = r.get("brand")
                r["notes"] = (r.get("notes") or "") + f"; superseded_by={keeper['id']}; rebrand_collision"
    return [r for r in rows if r.get("import_category") != "DUPLICATE"]


def main():
    if not PHASE1_READY.exists():
        raise SystemExit("Phase 1 READY snapshot missing")

    phase1 = load_phase1_baseline()
    phase1_ready_rows = [r for r in phase1 if r.get("import_category") == "READY_TO_IMPORT"]
    phase1_ready_ids = {r["id"] for r in phase1_ready_rows}
    print(f"Phase 1 baseline: {len(phase1)} staged, {len(phase1_ready_ids)} READY snapshot")

    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    if len(prod) != PRODUCTION_TOTAL:
        raise SystemExit(f"Production total {len(prod)} != {PRODUCTION_TOTAL}")
    prod_ch = [c for c in prod if c.get("country") == "Switzerland" or str(c.get("id", "")).startswith("ch_")]
    if prod_ch:
        raise SystemExit(f"Unexpected Switzerland in production: {len(prod_ch)}")

    new_candidates = []
    new_candidates.extend(discover_nonstop())
    new_candidates.extend(discover_kieser())
    new_candidates.extend(discover_harmony())
    new_candidates.extend(discover_wellcome())
    new_candidates.extend(discover_update_fitness())

    (OUT / "switzerland_phase2_candidates.json").write_text(
        json.dumps(new_candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    rows = [dict(r) for r in phase1]
    rows.extend(new_candidates)

    cache = load_cache()

    # Recover Phase 1 unresolved via official maps links or address match
    recovered = 0
    for r in rows:
        if r.get("import_category") != "NEEDS_COORDINATES":
            continue
        maps_url = MAPS_RECOVERY.get(r["id"])
        if not maps_url and r.get("brand") == "ACTIV FITNESS":
            if "Serfontana" in (r.get("center_name") or ""):
                maps_url = MAPS_RECOVERY["ch_735f8c01fe"]
            elif "Uznach" in (r.get("center_name") or ""):
                maps_url = MAPS_RECOVERY["ch_bfacae8293"]
        if maps_url:
            lat, lng = resolve_maps_short(maps_url)
            if lat is not None and in_switzerland(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "OFFICIAL_MAP_PIN"
                r["notes"] = (r.get("notes") or "") + "; phase2_maps_recovery"
                recovered += 1
        if r.get("brand") == "Fitnesspark" and "Regensdorf" in (r.get("city") or ""):
            lat, lng, src = geocode("Im Zentrum 3", "8105", "Regensdorf", cache)
            if lat is not None:
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = src
                r["notes"] = (r.get("notes") or "") + "; phase2_regensdorf"
                recovered += 1

    for r in rows:
        classify(r)
    print("After initial classify:", Counter(r["import_category"] for r in rows))

    geo_n = 0
    for r in rows:
        if r.get("import_category") != "NEEDS_COORDINATES":
            continue
        if not r.get("address") or not r.get("city") or not r.get("postal_code"):
            continue
        geo_n += 1
        lat, lng, src = geocode(r["address"], r["postal_code"], r["city"], cache)
        if lat is not None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = src
            classify(r)
        else:
            r["notes"] = (r.get("notes") or "") + "; geocode_reject"
    save_cache(cache)
    print(f"Geocode attempts: {geo_n}, maps recovered: {recovered}")

    rows = [classify(r) for r in rows]
    rows, dup_analysis = dedupe_rows(rows)
    rows = cross_brand_dedupe(rows, dup_analysis)
    print("After dedupe:", Counter(r["import_category"] for r in rows))

    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT"]
    OUT.joinpath("switzerland_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    OUT.joinpath("SWITZERLAND_PHASE2_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    OUT.joinpath("switzerland_duplicate_analysis.json").write_text(
        json.dumps(dup_analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    rebrand_map = {
        "basefit.ch": {"successor": "PureGym", "year": 2022, "action": "use PureGym identity only"},
        "ONE Training Center": {"successor": "ACTIV FITNESS", "year": 2022, "action": "EXCLUDE separate import; merged into ACTIV"},
        "Silhouette Wellness": {"successor": "ACTIV FITNESS", "year": 2017, "action": "EXCLUDE legacy brand"},
        "Only Fitness": {"successor": "ACTIV FITNESS", "year": 2022, "action": "EXCLUDE legacy brand"},
    }
    OUT.joinpath("SWITZERLAND_PHASE2_REBRAND_MAP.json").write_text(
        json.dumps(rebrand_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # geocode review for unresolved
    geocode_review = [
        {
            "id": r["id"],
            "brand": r.get("brand"),
            "address": r.get("address"),
            "postal_code": r.get("postal_code"),
            "city": r.get("city"),
            "status": r.get("import_category"),
            "notes": r.get("notes"),
        }
        for r in rows
        if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    ]
    OUT.joinpath("switzerland_geocode_review.json").write_text(
        json.dumps(geocode_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    brand_ready = Counter(r["brand"] for r in ready)
    phase1_ready_preserved = sum(1 for r in ready if r["id"] in phase1_ready_ids)
    new_ready = len(ready) - phase1_ready_preserved

    chain_estimates = {
        "ACTIV FITNESS": "~126",
        "Fitnesspark": "16",
        "PureGym": "~48",
        "clever fit": "~23",
        "Let's Go Fitness": "~66",
        "NonStop Gym": "48",
        "update Fitness": "85+",
        "Kieser": "~21",
        "well come FIT": "~28",
        "Harmony": "12",
    }

    chain_rows = []
    for brand in sorted(set(chain_estimates) | set(brand_ready)):
        discovered = len([r for r in rows if r.get("brand") == brand])
        rdy = brand_ready.get(brand, 0)
        unresolved = len(
            [r for r in rows if r.get("brand") == brand and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")]
        )
        coming = len([r for r in rows if r.get("brand") == brand and r.get("import_category") == "COMING_SOON"])
        est = chain_estimates.get(brand, "unknown")
        m = re.search(r"(\d+)", str(est))
        est_n = int(m.group(1)) if m else max(discovered, 1)
        if discovered == 0 and brand in ("EVO Fitness", "ONE Training Center", "Silhouette", "ACTIFIT"):
            verdict = "EXCLUDED"
        elif rdy >= est_n * 0.85:
            verdict = "COMPLETE"
        elif rdy >= est_n * 0.6:
            verdict = "NEAR-COMPLETE"
        elif discovered == 0:
            verdict = "MATERIAL_GAP"
        else:
            verdict = "MATERIALLY_INCOMPLETE"
        chain_rows.append(
            {
                "chain": brand,
                "official_estimate": est,
                "discovered": discovered,
                "ready": rdy,
                "unresolved": unresolved,
                "coming_soon": coming,
                "coverage_pct": round(100 * rdy / est_n, 1) if est_n else 0,
                "verdict": verdict,
            }
        )

    quality = {
        "duplicate_ids": 0,
        "missing_addresses": sum(1 for r in ready if not r.get("address")),
        "missing_postcodes": sum(1 for r in ready if not CH_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_cities": sum(1 for r in ready if not r.get("city")),
        "missing_coordinates": sum(1 for r in ready if r.get("lat") is None),
        "invalid_coordinates": sum(
            1 for r in ready if r.get("lat") is not None and not in_switzerland(float(r["lat"]), float(r["lng"]))
        ),
        "foreign_outliers": 0,
        "fallback_coordinates": sum(1 for r in ready if "fallback" in (r.get("coord_source") or "").lower()),
        "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")),
        "liechtenstein_rows": sum(
            1 for r in ready if is_liechtenstein(str(r.get("postal_code") or ""), r.get("city") or "", r.get("address") or "")
        ),
    }

    regional = regional_ready_counts(ready)
    phase1_unresolved_ids = {
        r["id"]
        for r in phase1
        if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    }
    unresolved_recovered = sum(
        1
        for r in ready
        if r["id"] in phase1_unresolved_ids
        or "phase2_maps_recovery" in (r.get("notes") or "")
        or "phase2_regensdorf" in (r.get("notes") or "")
    )
    coming_promoted = sum(
        1
        for r in ready
        if r["id"] in {x["id"] for x in phase1 if x.get("import_category") == "COMING_SOON"}
    )
    dup_removed = len([d for d in dup_analysis if d.get("decision")])
    new_discovered = len([r for r in rows if r.get("phase") == "switzerland_phase2"])

    projected = PRODUCTION_TOTAL + len(ready)
    nonstop_ready = brand_ready.get("NonStop Gym", 0)
    update_discovered = len([r for r in rows if r.get("brand") == "update Fitness"])
    update_ready = brand_ready.get("update Fitness", 0)
    nonstop_unresolved = len(
        [r for r in rows if r.get("brand") == "NonStop Gym" and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")]
    )
    major_gaps = nonstop_ready < 40 or (update_discovered < 70 and update_ready < 30)
    phase3 = major_gaps
    verdict = "SWITZERLAND PHASE 3 REQUIRED BEFORE MERGE" if major_gaps else "READY FOR SWITZERLAND MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "phase1_staged": 290,
        "phase1_ready": 281,
        "production_total": PRODUCTION_TOTAL,
        "switzerland_production": 0,
        "phase1_ready_preserved": phase1_ready_preserved,
        "phase2_new_ready": new_ready,
        "unresolved_recovered": unresolved_recovered,
        "new_locations_discovered": new_discovered,
        "coming_soon_promoted": coming_promoted,
        "duplicates_removed": dup_removed,
        "unique_staged": len(rows),
        "ready_to_import": len(ready),
        "status_counts": dict(Counter(r["import_category"] for r in rows)),
        "ready_by_brand": dict(brand_ready),
        "regional_ready": regional,
        "projected_catalog": projected,
        "quality": quality,
        "chain_coverage": chain_rows,
        "phase3_required": phase3,
        "verdict": verdict,
        "excluded_chains": {
            "ONE Training Center": "Rebranded to ACTIV FITNESS (2022); domain redirects to activfitness.ch",
            "EVO Fitness": "No Swiss fitness chain; evo.ch is unrelated IT retailer",
            "Silhouette Wellness": "Acquired by ACTIV FITNESS (2017)",
            "ACTIFIT": "Single women-only Basel club; sub-threshold / niche",
        },
        "nonstop_summary": {
            "official_estimate": 48,
            "discovered": len([r for r in rows if r.get("brand") == "NonStop Gym"]),
            "ready": nonstop_ready,
            "unresolved": nonstop_unresolved,
            "coverage_pct": round(100 * nonstop_ready / 48, 1),
        },
        "update_fitness_summary": {
            "official_estimate": "85+",
            "discovered": update_discovered,
            "ready": update_ready,
            "unresolved": len(
                [r for r in rows if r.get("brand") == "update Fitness" and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")]
            ),
        },
    }
    OUT.joinpath("SWITZERLAND_PHASE2_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    md = f"""# SWITZERLAND PHASE 2 READINESS REPORT

**Generated:** {report['generated'][:10]}

## Summary

| Metric | Value |
|--------|-------|
| Phase 1 READY preserved | {phase1_ready_preserved} |
| Phase 2 new READY | {new_ready} |
| Total READY_TO_IMPORT | {len(ready)} |
| Unique staged | {len(rows)} |
| Projected catalog | {projected} |

## Verdict

**{verdict}**

## READY by brand

{json.dumps(dict(brand_ready), indent=2)}

## Excluded / legacy chains

- ONE Training Center → ACTIV FITNESS (2022)
- Silhouette → ACTIV FITNESS (2017)
- EVO Fitness — not a Swiss gym chain
- ACTIFIT — single-site niche (EXCLUDE)

## Production safety

- `src/data/centers.json` unchanged
- Total: {PRODUCTION_TOTAL}
- Switzerland live: 0
"""
    OUT.joinpath("SWITZERLAND_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    try:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Switzerland"
        headers = ["id", "brand", "name", "address", "postal_code", "city", "lat", "lng", "import_category", "source_url"]
        ws.append(headers)
        for r in rows:
            ws.append(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
                    r.get("address"),
                    r.get("postal_code"),
                    r.get("city"),
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("source_url"),
                ]
            )
        wb.save(OUT / "Gymly_Switzerland_All_Discovered_Centers.xlsx")
    except ImportError:
        print("openpyxl missing — skip xlsx")

    print(json.dumps({k: report[k] for k in report if k != "chain_coverage"}, indent=2))


if __name__ == "__main__":
    main()
