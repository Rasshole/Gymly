#!/usr/bin/env python3
"""
UK Phase 1 discovery — scrape official chain sources into staging candidates.

Does NOT merge into centers.json. Does NOT invent coordinates.
Official JSON-LD / locator payloads are preferred over Nominatim.
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
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(exist_ok=True)
PAGES.mkdir(exist_ok=True)
SCRAPES.mkdir(exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

UK_BOUNDS = (49.80, 60.90, -8.20, 1.80)
PRINT_LOCK = Lock()

ENERGIE_IRELAND_SLUGS = {
    "balbriggan",
    "ballincollig",
    "carlow",
    "citywest",
    "clarehall",
    "drogheda",
    "dublin-8",
    "dun-laoghaire",
    "dundalk",
    "galway",
    "limerick",
    "midleton",
    "mullingar",
    "salthill",
    "stepaside",
    "tallaght",
}
ENERGIE_BOUTIQUE_SLUGS = {
    "chester-broughton-reformer",
    "hampton-hill-reformer",
}
NUFFIELD_SKIP = {
    "247",
    "services",
    "membership",
    "gyms-in-london",
    "personal-training",
    "locations",
    "club-in-club-social",
    "club-in-club-sporty",
    "day-passes",
    "health-mot-online-booking-coming-soon",
    "nhanniversary",
    "virtual-club-tour",
}
BANNATYNE_SKIP = {
    "all-locations",
    "spa",
    "hotel",
    "arrange-a-visit",
    "add-ons",
    "bcoached",
    "becky-adlingtons-swimstars",
    "classes",
    "club-rules",
    "contact-us",
    "corporate-contact-us",
    "corporate",
    "cross-usage-policy",
    "fitbod",
    "healthhero",
    "keiser-bikes",
    "join-a-friend",
    "latest-equipment",
    "lesmillsplus",
    "membership",
    "myzone",
    "online-terms",
    "speedflex",
    "swim-now-lessons",
    "why-choose-bannatyne",
}
ANYTIME_REGION_TOKENS = (
    "greater-london",
    "yorkshire-and-the-humber",
    "east-of-england",
    "west-midlands",
    "east-midlands",
    "northern-ireland",
    "north-west",
    "north-east",
    "south-east",
    "south-west",
    "scotland",
    "wales",
    "channel-islands",
    "isle-of-man",
)

# Official Everlast membership selector names (site itself timed out during discovery).
EVERLAST_MEMBER_NAMES = [
    "Aintree",
    "Bangor NI",
    "Barnsley",
    "Barrow",
    "Birstall - Leeds",
    "Blackburn",
    "Bristol Filton",
    "Bristol Imperial",
    "Bromborough",
    "Burton Upon Trent",
    "Cambridge",
    "Canterbury",
    "Cardiff Leckwith",
    "Carlisle",
    "Cheltenham HC",
    "Chiswick",
    "Colchester",
    "Denton",
    "Derby",
    "Dunstable",
    "East Kilbride",
    "Ewell",
    "Gateshead",
    "Gillingham",
    "Glasgow Fort",
    "Gloucester",
    "Halifax",
    "Hull",
    "Keighley",
    "Kettering",
    "Kings Lynn",
    "Leicester",
    "Leigh",
    "Lincoln",
    "Liverpool Central",
    "Liverpool Rose Lane",
    "Llanelli",
    "Londonderry",
    "Macclesfield",
    "Manchester Trafford - Opening March",
    "Merthyr Tydfil",
    "Newport",
    "Nottingham",
    "Nottingham - West Bridgford",
    "Oldham",
    "Poole",
    "Preston",
    "Rotherham",
    "Rugby",
    "Sale - Greater Manchester",
    "Sheffield",
    "Shirebrook",
    "Southport Ocean Plaza",
    "Southport Tulketh Street",
    "St Helens",
    "St Helens Milverny",
    "Sunderland",
    "Swindon",
    "Thurrock",
    "Tunstall-Stoke",
    "York",
]


def log(*args):
    with PRINT_LOCK:
        print(*args, flush=True)


def page_cache_path(url: str) -> Path:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return PAGES / f"{h}.html"


class Follow308(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code in (301, 302, 303, 307, 308):
            return urllib.request.HTTPRedirectHandler.redirect_request(
                self, req, fp, 302 if code == 308 else code, msg, headers, newurl
            )
        return urllib.request.HTTPRedirectHandler.redirect_request(
            self, req, fp, code, msg, headers, newurl
        )


opener = urllib.request.build_opener(Follow308, urllib.request.HTTPSHandler(context=ctx))


def fetch(url: str, timeout: int = 25, use_cache: bool = True) -> str:
    cache = page_cache_path(url)
    if use_cache and cache.exists() and cache.stat().st_size > 400:
        return cache.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers=UA)
    with opener.open(req, timeout=timeout) as r:
        data = r.read().decode("utf-8", "replace")
    cache.write_text(data, encoding="utf-8")
    return data


def fetch_safe(url: str, timeout: int = 25) -> tuple[str, str | None]:
    try:
        return fetch(url, timeout=timeout), None
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


def make_id(brand: str, address: str, postal: str, city: str, source_url: str = "") -> str:
    if not ((address or "").strip() and (postal or "").strip()):
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (source_url or "").strip().lower(),
                "united kingdom",
            ]
        )
    else:
        key = "|".join(
            [
                (brand or "").strip().lower(),
                (address or "").strip().lower(),
                (postal or "").strip().lower(),
                (city or "").strip().lower(),
                "united kingdom",
            ]
        )
    return "gb_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", str(s))
    s = (
        s.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#8211;", "–")
        .replace("&nbsp;", " ")
        .replace("\xa0", " ")
    )
    s = re.sub(r"\s+", " ", s).strip(" ,")
    return s


UK_POSTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\b",
    re.I,
)


def normalize_postcode(s: str | None) -> str:
    if not s:
        return ""
    m = UK_POSTCODE_RE.search(str(s).upper())
    if not m:
        return ""
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def is_crown_dependency(postal: str) -> bool:
    out = (postal or "").upper().split(" ")[0]
    return out.startswith("GY") or out.startswith("JE") or out.startswith("IM")


def country_is_uk(value: str | None) -> bool | None:
    if not value:
        return None
    v = value.strip().upper()
    if v in {"GB", "GBR", "UK", "UNITED KINGDOM", "GREAT BRITAIN", "ENGLAND", "SCOTLAND", "WALES", "NORTHERN IRELAND"}:
        return True
    if v in {"IE", "IRL", "IRELAND", "REPUBLIC OF IRELAND", "ROI"}:
        return False
    if v in {"BE", "FR", "DE", "IT", "NL", "ES", "CH", "PT", "AT", "US", "CA", "AU", "NZ"}:
        return False
    return None


def coords_ok(lat, lng) -> tuple[float, float] | tuple[None, None]:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None, None
    if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
        return None, None
    if lat_f == 0 and lng_f == 0:
        return None, None
    lo, hi, w, e = UK_BOUNDS
    if not (lo <= lat_f <= hi and w <= lng_f <= e):
        return None, None
    return lat_f, lng_f


def parse_json_ld_blocks(html: str) -> list[dict]:
    out = []
    for raw in re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        text = raw.strip()
        if not text:
            continue
        try:
            data = json.loads(text, strict=False)
        except json.JSONDecodeError:
            text2 = re.sub(r"[\r\n\t]+", " ", text)
            try:
                data = json.loads(text2, strict=False)
            except json.JSONDecodeError:
                continue
        if isinstance(data, list):
            out.extend([x for x in data if isinstance(x, dict)])
        elif isinstance(data, dict):
            if isinstance(data.get("@graph"), list):
                out.extend([x for x in data["@graph"] if isinstance(x, dict)])
            else:
                out.append(data)
    return out


def first_place(blocks: list[dict]) -> dict | None:
    prefer = {"HealthClub", "ExerciseGym", "Gym", "SportsActivityLocation", "LocalBusiness", "Place"}
    for b in blocks:
        t = b.get("@type")
        types = {t} if isinstance(t, str) else set(t or [])
        if types & prefer:
            return b
    for b in blocks:
        if b.get("address") or b.get("geo") or b.get("location"):
            return b
    return None


def extract_address_parts(node: dict | None) -> dict:
    if not node:
        return {"address": "", "postal_code": "", "city": "", "country": "", "lat": None, "lng": None}
    addr = node.get("address")
    if isinstance(addr, list) and addr:
        addr = addr[0]
    if not isinstance(addr, dict):
        loc = node.get("location")
        if isinstance(loc, list) and loc:
            loc = loc[0]
        if isinstance(loc, dict) and isinstance(loc.get("address"), dict):
            addr = loc["address"]
        elif isinstance(loc, dict) and loc.get("@type") == "PostalAddress":
            addr = loc
        else:
            addr = {}
    street = clean_text(addr.get("streetAddress") or addr.get("street") or "")
    if not street:
        loc = node.get("location")
        if isinstance(loc, list) and loc:
            loc = loc[0]
        if isinstance(loc, dict):
            loc_addr = loc.get("address") if isinstance(loc.get("address"), dict) else loc
            if isinstance(loc_addr, dict):
                street = clean_text(loc_addr.get("streetAddress") or loc.get("name") or "")
                addr = {**loc_addr, **{k: v for k, v in addr.items() if v}}
    city = clean_text(
        addr.get("addressLocality")
        or addr.get("addressRegion")
        or node.get("addressLocality")
        or ""
    )
    postal = normalize_postcode(addr.get("postalCode") or "")
    country = clean_text(addr.get("addressCountry") or "")
    if isinstance(country, dict):
        country = clean_text(country.get("name") or country.get("@id") or "")
    geo = node.get("geo") or {}
    if isinstance(node.get("location"), dict) and not geo:
        geo = node["location"].get("geo") or {}
    lat, lng = None, None
    if isinstance(geo, dict):
        lat, lng = coords_ok(geo.get("latitude"), geo.get("longitude"))
    lat2, lng2 = coords_ok(node.get("latitude"), node.get("longitude"))
    if lat is None:
        lat, lng = lat2, lng2
    if not postal:
        postal = normalize_postcode(" ".join([street, city, clean_text(node.get("name"))]))
    if postal and not city:
        # try trailing locality before postcode in street
        m = re.search(r",\s*([^,]+),\s*" + re.escape(postal), street, re.I)
        if m:
            city = clean_text(m.group(1))
    return {
        "address": street,
        "postal_code": postal,
        "city": city,
        "country": country,
        "lat": lat,
        "lng": lng,
        "name": clean_text(node.get("name") or ""),
        "hours": node.get("openingHoursSpecification") or node.get("openingHours"),
    }


def parse_uk_address_blob(text: str) -> dict:
    text = clean_text(text)
    postal = normalize_postcode(text)
    city = ""
    address = text
    if postal:
        before = text[: text.upper().rfind(postal.split()[0])] if postal.split()[0] in text.upper() else text
        # split on commas
        parts = [p.strip() for p in re.split(r",", text) if p.strip()]
        if parts:
            # drop postcode-only last part
            if normalize_postcode(parts[-1]) == postal:
                parts = parts[:-1]
            if parts:
                city = parts[-1]
                # city may be "London" or "York"
                if re.fullmatch(r"[A-Za-z][A-Za-z' \-]+", city):
                    address = ", ".join(parts[:-1]) if len(parts) > 1 else parts[0]
                else:
                    city = ""
                    address = ", ".join(parts)
        address = clean_text(address.replace(postal, ""))
    return {"address": address, "postal_code": postal, "city": city}


def row(
    brand: str,
    center_name: str,
    address: str,
    postal: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    website: str = "",
    opening_hours=None,
    verification_status: str = "VERIFIED_CURRENT",
    legacy_brand: str = "",
    notes: str = "",
    constituent_country: str = "",
    region: str = "",
    coord_source: str | None = None,
) -> dict:
    address = clean_text(address)
    postal = normalize_postcode(postal) or clean_text(postal)
    city = clean_text(city)
    if city.isupper() and len(city) > 2:
        city = city.title()
    center_name = clean_text(center_name)
    lat_f, lng_f = coords_ok(lat, lng)
    extra_notes = notes
    if is_crown_dependency(postal):
        extra_notes = (extra_notes + "; crown_dependency_excluded").strip("; ")
        verification_status = "NEEDS_REVIEW"
        lat_f = lng_f = None
    rid = make_id(brand, address, postal, city, source_url)
    name = center_name
    if center_name and brand and not center_name.lower().startswith(brand.lower()[:4]):
        name = f"{brand} {center_name}".strip()
    elif not name:
        name = f"{brand} {city}".strip()
    return {
        "id": rid,
        "brand": brand,
        "name": name,
        "center_name": center_name or name,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "United Kingdom",
        "constituent_country": constituent_country or None,
        "region": region or None,
        "lat": lat_f,
        "lng": lng_f,
        "opening_hours": opening_hours,
        "website": website or source_url,
        "source_url": source_url,
        "verification_status": verification_status,
        "legacy_brand": legacy_brand or None,
        "notes": extra_notes or None,
        "is_active": False,
        "import_category": "PENDING_CLASSIFY",
        "phase": "uk_phase1",
        "coord_source": coord_source if lat_f is not None else None,
    }


def urls_from_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def map_fetch(urls: list[str], workers: int = 8) -> dict[str, tuple[str, str | None]]:
    out: dict[str, tuple[str, str | None]] = {}
    todo = []
    for u in urls:
        cache = page_cache_path(u)
        if cache.exists() and cache.stat().st_size > 400:
            out[u] = (cache.read_text(encoding="utf-8", errors="replace"), None)
        else:
            todo.append(u)
    log(f"  cached {len(out)} / fetch {len(todo)}")
    if not todo:
        return out
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fetch_safe, u): u for u in todo}
        done = 0
        for fut in as_completed(futs):
            u = futs[fut]
            html, err = fut.result()
            out[u] = (html, err)
            done += 1
            if done % 40 == 0:
                log(f"  fetched {done}/{len(todo)}")
            time.sleep(0.02)
    return out


def coming_soon_from_html(html: str) -> bool:
    low = html.lower()
    if re.search(r"\bopening soon\b|\bcoming soon\b|\bopening \d", low):
        # ignore "upgrades coming soon" for existing gyms
        if re.search(r"major upgrades coming soon|upgrades underway|upgrades now complete", low):
            if not re.search(r"\bopening \d|\bopening soon\b", low):
                return False
        return True
    return False


# ---------------------------------------------------------------------------
# Chains
# ---------------------------------------------------------------------------
def discover_puregym() -> list[dict]:
    log("=== PureGym ===")
    slugs = urls_from_file(RAW / "puregym_slugs.txt")
    urls = ["https://www.puregym.com" + s for s in slugs]
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        place = first_place(parse_json_ld_blocks(html))
        parts = extract_address_parts(place)
        status = "VERIFIED_CURRENT"
        notes = "official_json_ld"
        if coming_soon_from_html(html) or "coming soon" in (parts.get("name") or "").lower():
            status = "COMING_SOON"
            notes += "; coming_soon_copy"
        uk = country_is_uk(parts.get("country"))
        if uk is False:
            continue
        rows.append(
            row(
                "PureGym",
                parts.get("name") or url.rstrip("/").split("/")[-1].replace("-", " ").title(),
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city"),
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                verification_status=status,
                notes=notes,
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors)
    return rows


def discover_tgg() -> list[dict]:
    log("=== The Gym Group ===")
    urls = urls_from_file(RAW / "tgg_gym_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        props = {}
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        if m:
            try:
                props = json.loads(m.group(1)).get("props", {}).get("pageProps", {}) or {}
            except json.JSONDecodeError:
                props = {}
        addr = props.get("address") or {}
        street = clean_text(
            ", ".join(
                x
                for x in [addr.get("address1"), addr.get("address2"), addr.get("address3")]
                if x
            )
        )
        city = clean_text(addr.get("city") or "")
        postal = normalize_postcode(addr.get("postcode") or "")
        lat, lng = coords_ok(props.get("latitude"), props.get("longitude"))
        gym_name = clean_text(props.get("gymName") or "")
        status_raw = clean_text(props.get("branchStatus") or "")
        status = "VERIFIED_CURRENT"
        notes = "official_next_data"
        if status_raw.lower() in {"coming soon", "opening soon", "pre-open", "preopen"}:
            status = "COMING_SOON"
        elif coming_soon_from_html(html) and status_raw.lower() not in {"open", "opened"}:
            status = "COMING_SOON"
        if not street:
            place = first_place(parse_json_ld_blocks(html))
            parts = extract_address_parts(place)
            street, postal, city = parts["address"], parts["postal_code"] or postal, parts["city"] or city
            if lat is None:
                lat, lng = parts["lat"], parts["lng"]
            gym_name = gym_name or parts.get("name") or ""
            notes = "official_json_ld"
        center = f"The Gym Group {gym_name}".strip() if gym_name else "The Gym Group"
        rows.append(
            row(
                "The Gym Group",
                center,
                street,
                postal,
                city,
                url,
                lat,
                lng,
                website=url,
                opening_hours=props.get("openingHours"),
                verification_status=status,
                notes=notes + (f"; branchStatus={status_raw}" if status_raw else ""),
                coord_source="official_locator" if lat is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors)
    return rows


def discover_jd() -> list[dict]:
    log("=== JD Gyms ===")
    listing = RAW / "jd_listing.html"
    coming = set()
    if listing.exists():
        html = listing.read_text(encoding="utf-8", errors="replace")
        for label in re.findall(r'aria-label="View ([^"]+)"', html):
            if re.search(r"\bOpening\b", label, re.I):
                # View Telford - Opening 25th August
                slug = re.sub(r"\s*-\s*Opening.*", "", label, flags=re.I)
                coming.add(slug.strip().lower())
    urls = urls_from_file(RAW / "jd_gym_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        slug = url.rstrip("/").split("/")[-1].replace("-", " ")
        pill = re.search(
            r'data-test-id="gym-location-address-pill"[^>]*>([^<]+)<',
            html,
        )
        blob = clean_text(pill.group(1) if pill else "")
        parsed = parse_uk_address_blob(blob)
        status = "VERIFIED_CURRENT"
        notes = "official_club_page"
        title = clean_text(
            (re.search(r"<title>([^<]+)", html) or type("x", (), {"group": lambda *_: ""})()).group(1)
        )
        if slug.lower() in coming or any(c in slug.lower() for c in coming):
            status = "COMING_SOON"
            notes += "; listing_opening_soon"
        # Telford / Edinburgh Chesser from listing names
        for cname in coming:
            if cname.split(" - ")[0] in slug.lower() or slug.lower() in cname:
                status = "COMING_SOON"
        if "telford" in url and any("telford" in c for c in coming):
            status = "COMING_SOON"
        if "edinburgh-chesser" in url or "chesser" in url:
            status = "COMING_SOON"
        name = f"JD Gyms {slug.title()}"
        rows.append(
            row(
                "JD Gyms",
                name,
                parsed["address"],
                parsed["postal_code"],
                parsed["city"] or slug.title(),
                url,
                website=url,
                verification_status=status,
                notes=notes,
            )
        )
    log("  rows", len(rows), "errors", errors, "coming_soon_names", sorted(coming))
    return rows


def discover_david_lloyd() -> list[dict]:
    log("=== David Lloyd ===")
    urls = urls_from_file(RAW / "dl_club_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    excluded = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        place = first_place(parse_json_ld_blocks(html))
        parts = extract_address_parts(place)
        uk = country_is_uk(parts.get("country"))
        if uk is False:
            excluded += 1
            continue
        postal = parts.get("postal_code") or ""
        if is_crown_dependency(postal):
            excluded += 1
            continue
        if uk is None and not postal:
            # European clubs sometimes omit GB postcode
            excluded += 1
            continue
        slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
        rows.append(
            row(
                "David Lloyd",
                parts.get("name") or f"David Lloyd {slug}",
                parts.get("address"),
                postal,
                parts.get("city") or slug,
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                notes="official_json_ld",
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors, "excluded_non_uk", excluded)
    return rows


def discover_nuffield() -> list[dict]:
    log("=== Nuffield Health ===")
    urls = [
        u
        for u in urls_from_file(RAW / "nuffield_gym_urls.txt")
        if u.rstrip("/").split("/")[-1] not in NUFFIELD_SKIP
    ]
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        place = first_place(parse_json_ld_blocks(html))
        parts = extract_address_parts(place)
        if not parts.get("address"):
            m = re.search(
                r'itemname="streetAddress">([^<]+)</span>.*?'
                r'itemname="addressLocality">([^<]+)</span>.*?'
                r'itemname="postalCode">([^<]+)</span>',
                html,
                re.S,
            )
            if m:
                parts["address"] = clean_text(m.group(1))
                parts["city"] = clean_text(m.group(2))
                parts["postal_code"] = normalize_postcode(m.group(3))
        slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
        rows.append(
            row(
                "Nuffield Health",
                parts.get("name") or f"Nuffield Health {slug}",
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or slug,
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                notes="official_json_ld",
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors)
    return rows


def discover_bannatyne() -> list[dict]:
    log("=== Bannatyne ===")
    urls = urls_from_file(RAW / "bannatyne_club_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        slug = url.rstrip("/").split("/")[-1]
        if slug in BANNATYNE_SKIP:
            continue
        place = None
        for b in parse_json_ld_blocks(html):
            loc = b.get("location")
            if isinstance(loc, list) and loc and loc[0].get("streetAddress"):
                place = {"address": loc[0], "name": b.get("brand") or b.get("name")}
                break
        parts = extract_address_parts(place) if place else {"address": "", "postal_code": "", "city": "", "lat": None, "lng": None, "name": ""}
        if not parts.get("postal_code"):
            # og:description Address Laurel Drive, Aberdeen, AB22 8AQ
            m = re.search(r"Address\s*([^<]{10,120})", html, re.I)
            blob = clean_text(m.group(1) if m else "")
            parsed = parse_uk_address_blob(blob)
            parts["address"] = parts["address"] or parsed["address"]
            parts["postal_code"] = parsed["postal_code"]
            parts["city"] = parts.get("city") or parsed["city"]
        if not parts.get("postal_code"):
            # full streetAddress often contains postcode
            parsed = parse_uk_address_blob(parts.get("address") or "")
            parts["postal_code"] = parsed["postal_code"]
            if parsed["city"]:
                parts["city"] = parts.get("city") or parsed["city"]
            if parsed["address"]:
                parts["address"] = parsed["address"]
        name = parts.get("name") or f"Bannatyne {slug.replace('-', ' ').title()}"
        legacy = "Just Fitness" if "just-fitness" in slug or "Just Fitness" in name else ""
        rows.append(
            row(
                "Bannatyne",
                name,
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or slug.replace("-", " ").title(),
                url,
                website=url,
                notes="official_club_page",
                legacy_brand=legacy,
            )
        )
    log("  rows", len(rows), "errors", errors)
    return rows


def discover_fitness_first() -> list[dict]:
    log("=== Fitness First UK ===")
    urls = urls_from_file(RAW / "ff_gym_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        slug = url.rstrip("/").split("/")[-1]
        if slug == "jersey":
            # Channel Islands — not UK production
            continue
        m = re.search(r"Address</h\d>\s*<p>([^<]+)</p>", html, re.I) or re.search(
            r"Address\s*</[^>]+>\s*([A-Z0-9].{10,120}?)\s*<", html, re.I
        )
        blob = ""
        if m:
            blob = clean_text(m.group(1))
        if not normalize_postcode(blob):
            # Baker Street page: 55 Baker Street, Marylebone, London, W1U 8EW
            pcs = UK_POSTCODE_RE.findall(html)
            # pick first plausible near Address
            idx = html.lower().find("address")
            window = html[idx : idx + 800] if idx >= 0 else html
            parsed = parse_uk_address_blob(clean_text(re.sub(r"<[^>]+>", " ", window)[:400]))
        else:
            parsed = parse_uk_address_blob(blob)
        name = f"Fitness First {slug.replace('-', ' ').title()}"
        rows.append(
            row(
                "Fitness First",
                name,
                parsed["address"],
                parsed["postal_code"],
                parsed["city"] or slug.replace("-", " ").title(),
                url,
                website=url,
                notes="official_club_page",
                legacy_brand="DW Fitness First" if "dw" in html.lower() else "",
            )
        )
    log("  rows", len(rows), "errors", errors)
    return rows


def discover_snap() -> list[dict]:
    log("=== Snap Fitness ===")
    urls = urls_from_file(RAW / "snap_gym_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    excluded = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        place = first_place(parse_json_ld_blocks(html))
        parts = extract_address_parts(place)
        uk = country_is_uk(parts.get("country"))
        if uk is False:
            excluded += 1
            continue
        if is_crown_dependency(parts.get("postal_code") or ""):
            excluded += 1
            continue
        slug = url.rstrip("/").split("/")[-1].replace("-", " ").title()
        status = "COMING_SOON" if coming_soon_from_html(html) else "VERIFIED_CURRENT"
        rows.append(
            row(
                "Snap Fitness",
                parts.get("name") or f"Snap Fitness {slug}",
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or slug,
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                verification_status=status,
                notes="official_json_ld",
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors, "excluded", excluded)
    return rows


def discover_energie() -> list[dict]:
    log("=== Energie Fitness ===")
    urls = urls_from_file(RAW / "energie_gym_urls.txt")
    pages = map_fetch(urls)
    rows = []
    errors = 0
    excluded = 0
    for url, (html, err) in pages.items():
        if err or not html:
            errors += 1
            continue
        slug = url.rstrip("/").split("/")[-1]
        if slug in ENERGIE_IRELAND_SLUGS:
            excluded += 1
            continue
        if slug in ENERGIE_BOUTIQUE_SLUGS:
            excluded += 1
            continue
        place = first_place(parse_json_ld_blocks(html))
        parts = extract_address_parts(place)
        uk = country_is_uk(parts.get("country"))
        if uk is False:
            excluded += 1
            continue
        status = "COMING_SOON" if "coming soon" in html.lower() or slug.endswith("-coming-soon") else "VERIFIED_CURRENT"
        rows.append(
            row(
                "Energie Fitness",
                parts.get("name") or f"Energie Fitness {slug.replace('-', ' ').title()}",
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or slug.replace("-", " ").title(),
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                verification_status=status,
                notes="official_json_ld; ireland_and_reformer_filtered",
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "errors", errors, "excluded", excluded)
    return rows


def discover_anytime() -> list[dict]:
    log("=== Anytime Fitness UK ===")
    urls = urls_from_file(RAW / "anytime_location_urls.txt")
    rows = []
    blocked = 0
    pages = map_fetch(urls, workers=4)
    for url, (html, err) in pages.items():
        slug = url.rstrip("/").split("/")[-1]
        if "channel-islands" in slug or "isle-of-man" in slug or "-ie-" in slug:
            continue
        if "-uk-" not in slug and "united-kingdom" not in slug:
            # keep northern-ireland-uk already has -uk-
            if "northern-ireland" not in slug:
                continue
        city = slug
        region = ""
        for tok in ANYTIME_REGION_TOKENS:
            if f"-{tok}-" in slug:
                city = slug.split(f"-{tok}-")[0]
                region = tok.replace("-", " ").title()
                break
        city = city.replace("-", " ").title()
        place = first_place(parse_json_ld_blocks(html)) if html else None
        parts = extract_address_parts(place) if place else {}
        if err or not html or "incapsula" in (html or "").lower() or len(html or "") < 2000:
            blocked += 1
            rows.append(
                row(
                    "Anytime Fitness",
                    f"Anytime Fitness {city}",
                    parts.get("address") or "",
                    parts.get("postal_code") or "",
                    city,
                    url,
                    website=url,
                    verification_status="NEEDS_REVIEW",
                    notes="official_sitemap_url; club_page_blocked_or_thin",
                    region=region,
                )
            )
            continue
        uk = country_is_uk(parts.get("country"))
        if uk is False:
            continue
        rows.append(
            row(
                "Anytime Fitness",
                parts.get("name") or f"Anytime Fitness {city}",
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or city,
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                opening_hours=parts.get("hours"),
                notes="official_location_page",
                region=region,
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows), "blocked_or_thin", blocked)
    return rows


def discover_buzz() -> list[dict]:
    log("=== Buzz Gym (additional chain) ===")
    urls = [
        "https://www.buzzgym.co.uk/reading/",
        "https://www.buzzgym.co.uk/reading-east-winnersh/",
        "https://www.buzzgym.co.uk/slough/",
        "https://www.buzzgym.co.uk/swindon/",
        "https://www.buzzgym.co.uk/oxford/",
        "https://www.buzzgym.co.uk/london-harrow/",
        "https://www.buzzgym.co.uk/wycombe/",
        "https://www.buzzgym.co.uk/london-cannon-street/",
        "https://www.buzzgym.co.uk/london-wembley/",
        "https://www.buzzgym.co.uk/plymouth-city-centre/",
        "https://www.buzzgym.co.uk/brighton-city-centre/",
    ]
    pages = map_fetch(urls)
    rows = []
    for url, (html, err) in pages.items():
        if err or not html:
            continue
        slug = url.rstrip("/").split("/")[-1]
        status = "VERIFIED_CURRENT"
        if "wembley" in slug or "plymouth" in slug or "brighton" in slug:
            if coming_soon_from_html(html) or "opening soon" in html.lower() or "coming soon" in html.lower():
                status = "COMING_SOON"
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        parsed = parse_uk_address_blob(clean_text(text))
        parts = {
            "address": parsed.get("address") or "",
            "postal_code": parsed.get("postal_code") or "",
            "city": parsed.get("city") or "",
            "lat": None,
            "lng": None,
            "name": "",
        }
        place = first_place(parse_json_ld_blocks(html))
        from_ld = extract_address_parts(place)
        if from_ld.get("postal_code"):
            parts["address"] = from_ld.get("address") or parts["address"]
            parts["postal_code"] = from_ld["postal_code"]
            parts["city"] = from_ld.get("city") or parts["city"]
            parts["lat"], parts["lng"] = from_ld.get("lat"), from_ld.get("lng")
        rows.append(
            row(
                "Buzz Gym",
                f"Buzz Gym {slug.replace('-', ' ').title()}",
                parts.get("address"),
                parts.get("postal_code"),
                parts.get("city") or slug.replace("-", " ").title(),
                url,
                parts.get("lat"),
                parts.get("lng"),
                website=url,
                verification_status=status,
                notes="official_club_page; additional_chain_phase1",
                coord_source="official_json_ld" if parts.get("lat") is not None else None,
            )
        )
    log("  rows", len(rows))
    return rows


def discover_everlast() -> list[dict]:
    log("=== Everlast Gyms (official site unreachable) ===")
    rows = []
    for name in EVERLAST_MEMBER_NAMES:
        status = "NEEDS_REVIEW"
        notes = "official_member_selector_name_only; everlastgyms.com_timed_out"
        if "opening" in name.lower():
            status = "COMING_SOON"
            notes += "; labelled_opening"
        city = re.sub(r"\s*-\s*Opening.*", "", name, flags=re.I)
        slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
        url = f"https://everlastgyms.com/gyms/{slug}/"
        rows.append(
            row(
                "Everlast Gyms",
                f"Everlast Gyms {city}",
                "",
                "",
                city,
                url,
                website="https://everlastgyms.com/gyms/",
                verification_status=status,
                notes=notes,
                legacy_brand="DW Sports Fitness",
            )
        )
    log("  placeholder rows", len(rows))
    return rows


def main():
    all_rows: list[dict] = []
    by_chain = {}
    discoverers = [
        ("puregym", discover_puregym),
        ("the_gym_group", discover_tgg),
        ("jd_gyms", discover_jd),
        ("david_lloyd", discover_david_lloyd),
        ("nuffield", discover_nuffield),
        ("bannatyne", discover_bannatyne),
        ("fitness_first", discover_fitness_first),
        ("snap", discover_snap),
        ("energie", discover_energie),
        ("anytime", discover_anytime),
        ("buzz", discover_buzz),
        ("everlast", discover_everlast),
    ]
    notes = {"started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "chains": {}}
    for key, fn in discoverers:
        rows = fn()
        (SCRAPES / f"{key}_uk.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        by_chain[key] = len(rows)
        notes["chains"][key] = {"discovered": len(rows)}
        all_rows.extend(rows)
    staging_path = OUT / "uk_centers_staging.pre_geocode.json"
    staging_path.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    notes["total_pre_geocode"] = len(all_rows)
    notes["by_chain"] = by_chain
    notes["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (OUT / "uk_discovery_notes.json").write_text(json.dumps(notes, indent=2), encoding="utf-8")
    log("TOTAL pre-geocode", len(all_rows), by_chain)


if __name__ == "__main__":
    main()
