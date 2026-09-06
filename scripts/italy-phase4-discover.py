#!/usr/bin/env python3
"""
Italy Phase 4 discovery — close known completeness gaps only.

Priorities: Fit Express estate, Icon Palestre identity/estate, Orange/GetFIT,
Phase 3 NEEDS_COORDINATES leftovers, high-value staging leftovers.

Does NOT modify src/data/centers.json.
Does NOT restart broad Italy discovery.
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
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/italy"
RAW = OUT / "raw" / "phase4"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "italy_centers_staging.json"
P3_CANDIDATES = OUT / "ITALY_PHASE3_NEW_CANDIDATES.json"
P3_READY = OUT / "ITALY_PHASE3_READY_TO_IMPORT.json"

for p in (OUT, RAW, PAGES, PAGES / "icon", PAGES / "fitexpress", PAGES / "fitinn", SCRAPES):
    p.mkdir(parents=True, exist_ok=True)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}

IT_MAINLAND = (36.6, 47.15, 6.6, 18.6)
IT_SICILY = (36.6, 38.35, 12.0, 15.7)
IT_SARDINIA = (38.8, 41.35, 8.1, 9.9)

STREET_TOKEN = (
    r"(?:Via|Viale|V\.le|Corso|C\.so|Piazza|P\.zza|Piazzale|P\.le|"
    r"Strada|Contrada|Località|Loc\.|Vicolo|Largo|Lungomare|Centro Commerciale)"
)

ICON_SKIP = {
    "promo-del-mese-icon-palestre-tiktok",
    "promo-del-mese-icon-palestre",
    "felicita-la-foresta-di-icon-palestre",
    "lavora-con-noi",
    "privacy-policy",
    "icon-nutrizione",
    "icon-academy",
    "apri-il-tuo-centro-icon-palestre",
    "abbonamento",
    "promo-del-mese-icon-palestre-mail",
    "cookie-policy",
    "contatti",
    "chi-siamo",
    "blog",
}

# City / address corrections from official club pages (Phase 4 audit)
FX_FIXES = {
    "Fit Express Catania Etnapolis": {
        "city": "Belpasso",
        "postal_code": "95032",
        "address": "Contrada Valcorrente, 23",
    },
    "Fit Express Acqui Terme": {
        "city": "Acqui Terme",
        "postal_code": "15011",
        "address": "Viale dei Maestri Vetrai, 10",
    },
    "Fit Express Aprilia": {"city": "Aprilia", "postal_code": "04011"},
    "Fit Express Acerra": {"city": "Acerra", "postal_code": "80011"},
    "Fit Express Milano Fiordaliso": {
        "city": "Rozzano",
        "postal_code": "20089",
        "address": "Via Eugenio Curiel, 25",
    },
    "Fit Express Rivoli": {"city": "Rivoli", "postal_code": "10098"},
    "Fit Express Pioltello": {
        "address": "Viale San Francesco, 33",
        "city": "Pioltello",
        "postal_code": "20096",
    },
    "Fit Express Lucca San Concordio": {
        "address": "Viale San Concordio, 996",
        "city": "Lucca",
        "postal_code": "55100",
    },
    "Fit Express Siena Toselli": {
        "address": "Strada di Busseto, 18",
        "city": "Siena",
        "postal_code": "53100",
    },
    "Fit Express Roma Boccea": {
        "address": "Via di Boccea, 280",
        "city": "Roma",
        "postal_code": "00167",
    },
    "Fit Express Latina": {
        "address": "Viale Le Corbusier",
        "city": "Latina",
        "postal_code": "04100",
    },
    "Fit Express Frosinone": {
        "address": "Via Giovanni Jacobucci",
        "city": "Frosinone",
        "postal_code": "03100",
    },
    "Fit Express Rimini Malatesta": {
        "address": "Via Emilia, 150",
        "city": "Rimini",
        "postal_code": "47921",
    },
    "Fit Express Lido di Camaiore": {
        "address": "Via del Secco",
        "city": "Camaiore",
        "postal_code": "55041",
    },
    "Fit Express Poggibonsi": {
        "city": "Colle di Val d'Elsa",
        "postal_code": "53034",
        "address": "Località Belvedere",
    },
}


def log(*a):
    print(*a, flush=True)


def unescape(s: str) -> str:
    return htmlmod.unescape(s or "")


def it_postal(s) -> str:
    m = re.search(r"\b(\d{5})\b", str(s or ""))
    return m.group(1) if m else ""


def valid_city(city: str) -> str:
    city = str(city or "").strip(" ,.")
    if not city or city.isdigit() or it_postal(city) == city:
        return ""
    if len(city) == 2 and city.isupper():
        return ""
    return re.sub(r"\s+[A-Z]{2}$", "", city).strip()


def in_italy_bbox(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (lat == lat and lng == lng) or (lat == 0 and lng == 0):
        return False
    for lo, hi, w, e in (IT_MAINLAND, IT_SICILY, IT_SARDINIA):
        if lo <= lat <= hi and w <= lng <= e:
            return True
    return False


def make_id(brand, address, postal, city) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (str(postal) or "").strip().lower(),
            (city or "").strip().lower(),
            "italy",
        ]
    )
    return "it_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def fetch(url: str, dest: Path | None = None, force: bool = False, timeout: int = 45) -> str:
    if dest and dest.exists() and dest.stat().st_size > 500 and not force:
        return dest.read_text(encoding="utf-8", errors="ignore")
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
    except Exception as e:
        log("  fetch fail", url, e)
        return ""
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(body, encoding="utf-8")
    time.sleep(0.25)
    return body


def extract_map_pin(html: str):
    """Official map pins — includes FITINN parseFloat pattern missed in Phase 3."""
    m = re.search(
        r'lat:\s*parseFloat\(["\']([0-9.\-]+)["\']\)\s*,\s*lng:\s*parseFloat\(["\']([0-9.\-]+)["\']\)',
        html,
        re.I,
    )
    if m:
        try:
            lat, lng = float(m.group(1)), float(m.group(2))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    # separate lat/lng parseFloat blocks
    la = re.search(r'lat:\s*parseFloat\(["\']([0-9.\-]+)["\']\)', html, re.I)
    lo = re.search(r'lng:\s*parseFloat\(["\']([0-9.\-]+)["\']\)', html, re.I)
    if la and lo:
        try:
            lat, lng = float(la.group(1)), float(lo.group(1))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    emb = re.search(
        r"google\.com/maps/embed\?[^\"']*!2d([0-9.\-]+)!3d([0-9.\-]+)", html
    )
    if emb:
        try:
            lng, lat = float(emb.group(1)), float(emb.group(2))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    dest = re.search(r"destination=([0-9.\-]+),([0-9.\-]+)", html)
    if dest:
        try:
            lat, lng = float(dest.group(1)), float(dest.group(2))
            if in_italy_bbox(lat, lng):
                return lat, lng, "OFFICIAL_MAP_PIN"
        except ValueError:
            pass
    return None, None, None


def parse_it_address_blob(blob: str):
    blob = unescape(blob)
    postal = it_postal(blob)
    m = re.search(
        r"\b(\d{5})\s*,?\s*([A-Za-zÀ-ú'’. -]+?)(?:\s*\(([A-Z]{2})\))?\s*$",
        blob,
    )
    if m:
        postal = postal or m.group(1)
        city = valid_city(m.group(2))
        street = blob[: m.start()].strip(" ,")
        return street, postal, city
    m2 = re.search(r",\s*([A-Za-zÀ-ú'’. -]+?)\s*\(([A-Z]{2})\)\s*$", blob)
    if m2:
        city = valid_city(m2.group(1))
        street = blob[: m2.start()].strip(" ,")
        return street, postal, city
    street = blob
    if postal:
        street = re.split(rf"\b{postal}\b", blob)[0].rstrip(" ,")
    return street.strip(" ,"), postal, ""


def clean_street(street: str) -> str:
    street = re.sub(r",?\s*\d{5}\b.*$", "", street or "").strip(" ,")
    street = re.sub(r",?\s*[A-Za-zÀ-ú'’. -]+\s*\([A-Z]{2}\)\s*$", "", street).strip(" ,")
    street = re.sub(r",?\s*\d+[°º]?\s*piano.*$", "", street, flags=re.I).strip(" ,")
    street = re.sub(r"\s*\(c/o[^)]*\)", "", street, flags=re.I).strip(" ,")
    street = re.sub(r"\s*\(accanto[^)]*\)", "", street, flags=re.I).strip(" ,")
    street = re.sub(r"^c/o\s+[^,]+,\s*", "", street, flags=re.I).strip(" ,")
    street = re.sub(r"\bV\.le\b", "Viale", street, flags=re.I)
    street = re.sub(r"\bP\.le\b", "Piazzale", street, flags=re.I)
    street = re.sub(r"\bC\.so\b", "Corso", street, flags=re.I)
    street = re.sub(r"\bP\.zza\b", "Piazza", street, flags=re.I)
    # Deduplicate accidental doubled street ("Via Ezio Via Ezio")
    toks = street.split()
    if len(toks) >= 4 and " ".join(toks[: len(toks) // 2]).lower() == " ".join(
        toks[len(toks) // 2 :]
    ).lower():
        street = " ".join(toks[: len(toks) // 2])
    return street


def norm_simple(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def row(
    brand,
    name,
    address,
    postal,
    city,
    source_url,
    lat=None,
    lng=None,
    notes="",
    coord_source=None,
    website=None,
    source_type=None,
    closed=False,
    coming=False,
):
    postal = it_postal(postal) or it_postal(address) or ""
    address = clean_street(unescape(address or ""))
    city = valid_city(city)
    if closed:
        status, cat = "CLOSED", "CLOSED"
    elif coming:
        status, cat = "COMING_SOON", "COMING_SOON"
    else:
        status, cat = "VERIFIED_CURRENT", None
    out = {
        "id": make_id(brand, address, postal, city),
        "brand": brand,
        "chain": brand,
        "name": name,
        "center_name": name,
        "address": address,
        "postal_code": postal or None,
        "city": city,
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
        "phase": "italy_phase4",
        "coord_source": coord_source,
        "legacy_brand": None,
        "region": None,
        "discovery_class": "GAP_RECOVERY",
    }
    if lat is not None and lng is not None and not in_italy_bbox(lat, lng):
        out["lat"] = out["lng"] = out["coord_source"] = None
        out["notes"] = (notes + "; rejected_non_italy_bbox").strip("; ")
    return out


def discover_fitexpress_estate(meta: dict) -> list[dict]:
    log("Fit Express — deep WP estate extract...")
    clubs = []
    page = 1
    while page <= 10:
        url = f"https://www.fitexpress.it/wp-json/wp/v2/club?per_page=100&page={page}"
        body = fetch(url, RAW / f"fitexpress_wp_p{page}.json", force=True)
        if not body or not body.lstrip().startswith("["):
            break
        batch = json.loads(body)
        if not batch:
            break
        clubs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    (RAW / "fitexpress_wp_clubs.json").write_text(
        json.dumps(clubs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta["fitexpress_official_wp_count"] = len(clubs)

    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    live_fx = [
        c
        for c in prod
        if c.get("brand") == "Fit Express" and (c.get("country") or "").lower() == "italy"
    ]
    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    staged_fx = [r for r in staging if r.get("brand") == "Fit Express"]
    unresolved = [
        r
        for r in staged_fx
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
    ]

    rows = []
    for r in unresolved:
        name = r.get("name") or ""
        fix = FX_FIXES.get(name, {})
        address = fix.get("address", r.get("address") or "")
        postal = fix.get("postal_code", r.get("postal_code") or "")
        city = fix.get("city", r.get("city") or "")
        if str(city).lower() == "rivoli":
            city = "Rivoli"
        website = r.get("website") or r.get("source_url") or ""
        # refresh pin from club page if present
        slug = website.rstrip("/").split("/")[-1] if website else ""
        html = ""
        if slug:
            html = fetch(website, PAGES / "fitexpress" / f"{slug}.html")
        lat, lng, cs = extract_map_pin(html) if html else (None, None, None)
        notes = (r.get("notes") or "") + "; phase4_gap_recovery"
        if fix:
            notes += "; city_address_fix_applied"
        out = row(
            "Fit Express",
            name,
            address,
            postal,
            city,
            website,
            lat=lat,
            lng=lng,
            notes=notes.strip("; "),
            coord_source=cs,
            website=website,
            source_type="fitexpress_official_club_page",
        )
        out["prior_id"] = r.get("id")
        out["prior_category"] = r.get("import_category")
        rows.append(out)

    meta["fitexpress"] = {
        "official_wp_count": len(clubs),
        "production_live": len(live_fx),
        "staging_total": len(staged_fx),
        "unresolved_input": len(unresolved),
        "coverage_vs_wp_pct": round(100.0 * len(live_fx) / max(len(clubs), 1), 1),
        "note": "WP estate is source of truth (~69). Marketing '70' not used as hard target.",
    }
    log(f"  FX WP={len(clubs)} live={len(live_fx)} unresolved_staged={len(unresolved)}")
    return rows


def _clean_icon_city(city: str) -> str:
    """Strip province codes and leaked email local-parts (romatalent, arezz, …)."""
    city = valid_city(city)
    if not city:
        return ""
    # Drop trailing lowercase email fragments / truncated local-parts
    city = re.sub(r"\s+[a-z][a-z0-9]{2,}$", "", city).strip()
    city = re.sub(r"\s+[A-Z]{2}\b.*$", "", city).strip()
    # Known municipality normalizations
    city = city.replace("S. Giuseppe Vesuviano", "San Giuseppe Vesuviano")
    return valid_city(city)


def _icon_addr_from_html(html: str, title_hint: str = "") -> tuple[str, str, str]:
    # Prefer address immediately before club email — stop before email local-part
    email_addr_re = (
        r"(" + STREET_TOKEN + r"[^@<>\n]{5,90}?\d{5}\s*[A-Za-zÀ-ú'’. -]{2,40}?)"
        r"(?:\s+[A-Z]{2})?\s*[a-z0-9._%+-]*@iconpalestre\.it"
    )
    for m in re.finditer(email_addr_re, html, re.I):
        cand = unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
        cand = re.sub(r"\s+", " ", cand).strip(" ,;")
        # Strip any leaked email fragment without @
        cand = re.sub(r"\s+[a-z]{3,}@?$", "", cand).strip()
        if "elementor" in cand.lower() or "via cosa" in cand.lower():
            continue
        st, po, ci = parse_it_address_blob(cand)
        ci = _clean_icon_city(ci)
        if st and po and ci:
            return clean_street(st), po, ci
        if st and po:
            # city from title (ICON Palestre Roma Talenti → Roma)
            hint = re.sub(r"^ICON\s+Palestre\s+", "", title_hint or "", flags=re.I)
            hint_city = _clean_icon_city(hint.split()[0] if hint else "")
            return clean_street(st), po, hint_city or ci
    # Plain-text patterns (Ferrara mall / Rimini without CAP on same line)
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    text = unescape(re.sub(r"<[^>]+>", "\n", text))
    for line in text.splitlines():
        l = line.strip()
        if not l or len(l) > 120:
            continue
        if "via cosa" in l.lower() or "ceccano" in l.lower():
            continue
        if re.search(STREET_TOKEN, l, re.I) and (
            it_postal(l) or re.search(r"centro commerciale|accanto", l, re.I)
        ):
            st, po, ci = parse_it_address_blob(l)
            ci = _clean_icon_city(ci)
            if st:
                if not ci and title_hint:
                    hint = re.sub(r"^ICON\s+Palestre\s+", "", title_hint, flags=re.I)
                    # Prefer last token for "Roma Portuense" → use full municipal hint
                    if "roma" in hint.lower():
                        ci = "Roma"
                    elif "rimini" in hint.lower():
                        ci = "Rimini"
                    elif "ferrara" in hint.lower():
                        ci = "Ferrara"
                    else:
                        ci = _clean_icon_city(hint.split()[0])
                return clean_street(st), po, ci
    return "", "", ""

def discover_icon_estate(meta: dict) -> list[dict]:
    log("Icon Palestre — correct brand identity + full estate...")
    sm = fetch(
        "https://www.iconpalestre.it/page-sitemap.xml",
        RAW / "icon_page_sitemap.xml",
        force=True,
    )
    locs = re.findall(r"<loc>(https://www\.iconpalestre\.it/[^<]+)</loc>", sm or "")
    club_urls = []
    for url in locs:
        slug = url.rstrip("/").split("/")[-1]
        if not slug or slug in ICON_SKIP or url.rstrip("/").endswith("iconpalestre.it"):
            continue
        club_urls.append(url)
    meta["icon_sitemap_clubish"] = len(club_urls)

    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    staged_icon = [r for r in staging if r.get("brand") == "Icon Palestre"]
    staged_slugs = {
        (r.get("website") or r.get("source_url") or "").rstrip("/").split("/")[-1]
        for r in staged_icon
    }
    unresolved = [
        r
        for r in staged_icon
        if r.get("import_category") in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
    ]

    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    live_icon = [
        c
        for c in prod
        if c.get("brand") == "Icon Palestre" and (c.get("country") or "").lower() == "italy"
    ]

    rows = []
    # Recover unresolved staged Icon clubs
    for r in unresolved:
        website = r.get("website") or r.get("source_url") or ""
        slug = website.rstrip("/").split("/")[-1]
        html = fetch(website, PAGES / "icon" / f"{slug}.html") if website else ""
        name = r.get("name") or ""
        if not name.lower().startswith("icon"):
            name = f"ICON Palestre {name}"
        name = name.replace("Icon Palestre", "ICON Palestre")
        st, po, ci = _icon_addr_from_html(html, name) if html else ("", "", "")
        address = clean_street(st or r.get("address") or "")
        # De-dupe accidental "Via Ezio Via Ezio"
        parts = [p.strip() for p in re.split(r"\s{2,}|,\s*", address) if p.strip()]
        if len(parts) >= 2 and norm_simple(parts[0]) == norm_simple(parts[1]):
            address = parts[0]
        postal = po or it_postal(r.get("postal_code") or "") or ""
        city = _clean_icon_city(ci or r.get("city") or "")
        # Staging leftovers sometimes appended email crumbs into city
        city = _clean_icon_city(city)
        if not city and "roma" in name.lower():
            city = "Roma"
        lat, lng, cs = extract_map_pin(html) if html else (None, None, None)
        out = row(
            "Icon Palestre",
            name if name.upper().startswith("ICON") else f"ICON Palestre {name}",
            address,
            postal,
            city,
            website,
            lat=lat,
            lng=lng,
            notes=((r.get("notes") or "") + "; phase4_icon_recovery").strip("; "),
            coord_source=cs,
            website=website,
            source_type="iconpalestre_official_club_page",
        )
        out["name"] = out["name"].replace("Icon Palestre", "ICON Palestre")
        out["prior_id"] = r.get("id")
        rows.append(out)

    # New sitemap URLs not previously staged
    new_slugs = []
    for url in club_urls:
        slug = url.rstrip("/").split("/")[-1]
        if slug in staged_slugs:
            continue
        # talenti-2 duplicates Roma Talenti
        if slug in {"talenti-2", "icon-palestre-rende"}:
            # rende already live; talenti-2 same as tiburtina-3
            new_slugs.append({"slug": slug, "url": url, "status": "ALREADY_COVERED"})
            continue
        html = fetch(url, PAGES / "icon" / f"{slug}.html", force=False)
        title_m = re.search(r"<title>([^<]+)", html or "")
        title = unescape(title_m.group(1)).split("-")[0].strip() if title_m else slug
        if not title.lower().startswith("icon"):
            title = f"ICON Palestre {title}"
        title = title.replace("Icon Palestre", "ICON Palestre")
        st, po, ci = _icon_addr_from_html(html, title)
        # Known Phase 4 page extractions
        if slug == "ferrara" and (not st or not ci):
            st, po, ci = "Centro Commerciale Nuova Darsena", "44100", "Ferrara"
        elif slug == "rimini" and (not st or not ci or not po):
            st = st or "Via Consolare Rimini - San Marino, 17"
            ci = ci or "Rimini"
            # CAP filled later via named-gym reverse if missing
        elif slug == "roma-eur-2" and (not st or not ci):
            st, po, ci = "Piazzale Luigi Sturzo, 15", "00144", "Roma"
        elif slug == "portuense" and (not st or not ci):
            st, po, ci = "Viale Isacco Newton, 51", "00151", "Roma"
        ci = _clean_icon_city(ci)
        st = clean_street(st)
        if not st or not ci:
            new_slugs.append({"slug": slug, "url": url, "status": "INCOMPLETE_PAGE"})
            continue
        lat, lng, cs = extract_map_pin(html)
        out = row(
            "Icon Palestre",
            title,
            st,
            po,
            ci,
            url,
            lat=lat,
            lng=lng,
            notes=f"phase4_new_icon_sitemap; slug={slug}",
            coord_source=cs,
            website=url,
            source_type="iconpalestre_official_club_page",
        )
        out["discovery_class"] = "NEW_ICON_SITEMAP"
        rows.append(out)
        new_slugs.append({"slug": slug, "url": url, "status": "STAGED", "name": title})

    meta["icon"] = {
        "sitemap_clubish": len(club_urls),
        "production_live": len(live_icon),
        "staging_total": len(staged_icon),
        "unresolved_input": len(unresolved),
        "new_sitemap_audit": new_slugs,
        "coverage_vs_sitemap_pct": round(100.0 * len(live_icon) / max(len(club_urls), 1), 1),
        "brand_identity": "Icon Palestre (iconpalestre.it) — never generic Icon",
    }
    log(
        f"  Icon sitemap={len(club_urls)} live={len(live_icon)} "
        f"unresolved={len(unresolved)} new_staged={sum(1 for x in new_slugs if x['status']=='STAGED')}"
    )
    return rows


def discover_orange_getfit(meta: dict) -> list[dict]:
    log("Orange / GetFIT — fitness brand + acquisition handling...")
    html = fetch(
        "https://www.orangepalestre.it/palestre/",
        RAW / "orange_palestre.html",
        force=True,
    )
    m = re.search(r"(\d+)\s*palestre", html or "", re.I)
    orange_site_count = int(m.group(1)) if m else None
    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    live_orange = [
        c
        for c in prod
        if c.get("brand") == "Orange" and (c.get("country") or "").lower() == "italy"
    ]
    p3 = json.loads(P3_CANDIDATES.read_text(encoding="utf-8"))
    getfit = [r for r in p3 if r.get("brand") == "GetFIT"]
    getfit_ready = [r for r in getfit if r.get("import_category") == "READY_TO_IMPORT"]
    getfit_acq = [
        r
        for r in getfit_ready
        if "acquired_by_orange" in (r.get("notes") or "")
    ]
    getfit_retained = [
        r
        for r in getfit_ready
        if "founder_retained" in (r.get("notes") or "")
    ]

    # Confirm GetFIT site still 403 — no new official list
    getfit_status = "unknown"
    try:
        req = urllib.request.Request("https://www.getfit.it/", headers=UA)
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            getfit_status = f"http_{r.status}"
    except urllib.error.HTTPError as e:
        getfit_status = f"http_{e.code}"
    except Exception as e:
        getfit_status = f"error:{e}"

    meta["orange"] = {
        "official_locator_count": orange_site_count,
        "production_live": len(live_orange),
        "getfit_site_status": getfit_status,
        "getfit_phase3_ready": len(getfit_ready),
        "getfit_acquired_not_on_orange_locator": len(getfit_acq),
        "getfit_founder_retained": len(getfit_retained),
        "combined_orange_plus_acquired_getfit": len(live_orange) + len(getfit_acq),
        "press_target_after_acquisition": 33,
        "note": (
            "Orange locator still lists 23 clubs. Jul 2026 GetFIT acquisition "
            "(6 Milano) not yet on Orange official locator — keep as GetFIT "
            "READY from Phase 3 until Orange republishes. Do not invent Orange IDs."
        ),
        "coverage_locator_pct": round(
            100.0 * len(live_orange) / max(orange_site_count or 23, 1), 1
        ),
    }
    log(
        f"  Orange locator={orange_site_count} live={len(live_orange)} "
        f"GetFIT ready={len(getfit_ready)} site={getfit_status}"
    )
    return []  # no new Orange rows; GetFIT already in Phase 3 READY


def discover_phase3_leftovers(meta: dict) -> list[dict]:
    log("Phase 3 leftovers — FITINN Monza pin + Fitness Park...")
    rows = []
    p3 = json.loads(P3_CANDIDATES.read_text(encoding="utf-8"))
    for r in p3:
        if r.get("import_category") not in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}:
            continue
        brand = r.get("brand")
        website = r.get("website") or r.get("source_url") or ""
        slug = website.rstrip("/").split("/")[-1] if website else brand.lower()
        dest_dir = PAGES / ("fitinn" if brand == "FITINN" else "other")
        dest_dir.mkdir(parents=True, exist_ok=True)
        html = fetch(website, dest_dir / f"{slug}.html") if website else ""
        lat, lng, cs = extract_map_pin(html) if html else (None, None, None)
        out = row(
            brand,
            r.get("name"),
            r.get("address") or "",
            r.get("postal_code") or "",
            r.get("city") or "",
            website,
            lat=lat if lat is not None else r.get("lat"),
            lng=lng if lng is not None else r.get("lng"),
            notes=((r.get("notes") or "") + "; phase4_leftover_recovery").strip("; "),
            coord_source=cs or r.get("coord_source"),
            website=website,
            source_type=r.get("source_type") or "official_club_page",
        )
        out["prior_id"] = r.get("id")
        out["discovery_class"] = "PHASE3_LEFTOVER"
        rows.append(out)
        log(f"  leftover {out['name']} pin={out.get('coord_source')} {out.get('lat')}")
    meta["phase3_leftovers"] = len(rows)
    return rows


def main():
    log("=== Italy Phase 4 discovery ===")
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rules": "gap closure only; centers.json not modified",
    }
    rows = []
    rows.extend(discover_fitexpress_estate(meta))
    rows.extend(discover_icon_estate(meta))
    rows.extend(discover_orange_getfit(meta))
    rows.extend(discover_phase3_leftovers(meta))

    # Dedup by id within discovery set (keep first)
    seen = set()
    uniq = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        uniq.append(r)

    out_path = SCRAPES / "phase4_discovery.json"
    out_path.write_text(json.dumps(uniq, ensure_ascii=False, indent=2), encoding="utf-8")
    meta_path = SCRAPES / "phase4_discovery_meta.json"
    meta["discovered_rows"] = len(uniq)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"Wrote {out_path} ({len(uniq)} rows)")
    log(f"Wrote {meta_path}")
    # Preserve Phase 3 READY count in meta
    p3_ready = json.loads(P3_READY.read_text(encoding="utf-8"))
    meta["phase3_ready_preserved_count"] = len(p3_ready)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
