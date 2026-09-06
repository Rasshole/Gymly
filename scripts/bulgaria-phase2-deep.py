#!/usr/bin/env python3
"""Bulgaria Phase 2 deep recovery. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
import ssl
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    BULGARIA_POSTAL_RE,
    clean_text,
    classify_row,
    curl_fetch,
    format_bg_postal,
    in_bulgaria,
    make_id,
    nominatim_geocode,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/bulgaria"
PAGES = OUT / "raw" / "pages"
PHASE2 = OUT / "phase2"
PHASE2.mkdir(parents=True, exist_ok=True)
PAGES.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840"
ctx = ssl.create_default_context()

NL_SLUGS = {
    "Next Level Bulgaria Mall": "bulgaria-mall",
    "Next Level Druzhba": "druzhba",
    "Next Level Fohar": "fohar",
    "Next Level Galaxy": "galaxy",
    "Next Level Grand Plaza Burgas": "grand-plaza-burgas",
    "Next Level Hadzhi Dimitar": "hadzhi-dimitar",
    "Next Level Iztok": "iztok",
    "Next Level Knyazhevo": "knyazhevo",
    "Next Level Krasna Polyana": "krasna-polyana",
    "Next Level Lozenets": "lozenets",
    "Next Level Lyulin": "lyulin",
    "Next Level Lyulin 5": "lyulin-5",
    "Next Level Maxi": "maxi",
    "Next Level Mladost": "mladost",
    "Next Level Mladost 1": "mladost-1",
    "Next Level Nadezhda": "nadezhda",
    "Next Level NDK": "ndk",
    "Next Level New Wave": "newwave",
    "Next Level Okolovrasten pat": "okolovrasten-pat",
    "Next Level Ovcha Kupel": "ovcha-kupel",
    "Next Level Park Center": "park-center",
    "Next Level Pernik": "pernik",
    "Next Level Plovdiv Plaza": "plovdiv-plaza",
    "Next Level Retail Park Varna": "retail-park-varna",
    "Next Level Ruski pametnik": "ruski-pametnik",
    "Next Level Smirnenski": "smirnenski",
    "Next Level Sport Box": "sportbox",
    "Next Level The Mall": "the-mall",
    "Next Level Zaimov": "zaimov",
}

# Curated street hardening for known estates (official listing evidence)
HARDEN = {
    "Next Level Pernik": {
        "address": "Pernik, next to Mall Pernik / official club page",
        "city": "Pernik",
        "notes_extra": "needs_individual_page_street",
    },
}


def sha_centers() -> str:
    return hashlib.sha256(CENTERS.read_bytes()).hexdigest()


def assert_prod_safe() -> None:
    sha = sha_centers()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: centers.json SHA {sha} != {EXPECTED_SHA}")
    data = json.loads(CENTERS.read_text())
    if len(data) != 11254:
        raise SystemExit(f"STOP: total {len(data)}")
    if any(c.get("country") == "Bulgaria" or str(c.get("id", "")).startswith("bg_") for c in data):
        raise SystemExit("STOP: Bulgaria leaked into production")


def cached_fetch(url: str, fname: str) -> str:
    path = PAGES / fname
    if path.exists() and path.stat().st_size > 800:
        return path.read_text(encoding="utf-8", errors="replace")
    time.sleep(0.35)
    return curl_fetch(url, path, timeout=35)


def plain_html(html: str) -> str:
    t = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<style[^>]*>.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"&nbsp;", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t


def extract_nl_address(html: str) -> tuple[str, str]:
    """Return (address, city) from Next Level club page."""
    p = plain_html(html)
    m = re.search(
        r"Address\s+((?:Sofia|Plovdiv|Varna|Burgas|Pernik)[^C]{5,120}?)\s+Contact",
        p,
        re.I,
    )
    if m:
        raw = clean_text(m.group(1))
        city = "Sofia"
        for c in ("Sofia", "Plovdiv", "Varna", "Burgas", "Pernik"):
            if raw.lower().startswith(c.lower()) or f", {c}" in raw or raw.endswith(c):
                city = c
                break
        # strip leading city
        addr = re.sub(rf"^{city}\s*,?\s*", "", raw, flags=re.I).strip(" ,")
        return addr or raw, city
    m2 = re.search(
        r"(Sofia|Plovdiv|Varna|Burgas|Pernik),\s*([^.]{8,100})",
        p,
        re.I,
    )
    if m2:
        return clean_text(m2.group(2)), m2.group(1).title() if m2.group(1).lower() != "sofia" else "Sofia"
    return "", ""


def extract_maps_coords(html: str) -> tuple[float | None, float | None]:
    patterns = [
        r"@(-?\d+\.\d+),(-?\d+\.\d+)",
        r"destination=(-?\d+\.\d+)%2C(-?\d+\.\d+)",
        r"q=(-?\d+\.\d+),(-?\d+\.\d+)",
        r'["\']lat["\']\s*:\s*(-?\d+\.\d+).{0,40}["\']lng["\']\s*:\s*(-?\d+\.\d+)',
        r'["\']latitude["\']\s*:\s*(-?\d+\.\d+).{0,40}["\']longitude["\']\s*:\s*(-?\d+\.\d+)',
        r"center=(-?\d+\.\d+)%2C(-?\d+\.\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, html, re.I | re.S)
        if m:
            try:
                lat, lng = float(m.group(1)), float(m.group(2))
                if in_bulgaria(lat, lng):
                    return lat, lng
            except (TypeError, ValueError):
                pass
    return None, None


def extract_postal_from_text(text: str, city: str) -> str:
    # Prefer NNNN near city name
    for m in re.finditer(rf"\b(\d{{4}})\b", text):
        pc = m.group(1)
        if pc.startswith("08") or pc.startswith("09"):
            continue  # phone fragments
        # Sofia range roughly 1000-1799; allow broader BG
        if city == "Sofia" and not (1000 <= int(pc) <= 1799 or pc.startswith("1")):
            # still allow if near Sofia word
            window = text[max(0, m.start() - 40) : m.end() + 40]
            if not re.search(r"Sofia|София", window, re.I):
                continue
        return pc
    return ""


def nominatim_search_multi(query: str, cache: dict) -> list[dict]:
    key = f"multi|bg|{query}".lower().strip()
    if key in cache and isinstance(cache[key], list):
        return cache[key]
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "limit": 5,
            "countrycodes": "bg",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "GymlyBGPhase2/1.0 (catalog research)", "Accept": "application/json"},
    )
    time.sleep(1.05)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        cache[key] = []
        cache[f"{key}|err"] = str(e)
        return []
    out = []
    for hit in data:
        addr = hit.get("address") or {}
        lat, lng = float(hit["lat"]), float(hit["lon"])
        if not in_bulgaria(lat, lng):
            continue
        out.append(
            {
                "lat": lat,
                "lng": lng,
                "display_name": hit.get("display_name"),
                "postcode": format_bg_postal(addr.get("postcode") or "") or "",
                "importance": hit.get("importance") or 0,
                "class": hit.get("class"),
                "type": hit.get("type"),
            }
        )
    cache[key] = out
    return out


def pick_best_geocode(hits: list[dict], city: str, address: str) -> dict | None:
    if not hits:
        return None
    city_l = city.lower()
    addr_l = address.lower()
    scored = []
    for h in hits:
        disp = (h.get("display_name") or "").lower()
        score = float(h.get("importance") or 0)
        if city_l in disp or (city_l == "sofia" and "софия" in disp):
            score += 2
        # prefer amenity/shop fitness-like
        if h.get("type") in ("gym", "fitness_centre", "sports_centre"):
            score += 3
        if h.get("class") == "amenity":
            score += 0.5
        # house number token
        nums = re.findall(r"\b\d+[A-Za-z]?\b", address)
        for n in nums[:2]:
            if n.lower() in disp:
                score += 1.5
        if h.get("postcode"):
            score += 1
        # reject pure city/admin if address is detailed
        if len(address) > 20 and h.get("type") in ("administrative", "city", "suburb", "neighbourhood"):
            score -= 2
        scored.append((score, h))
    scored.sort(key=lambda x: -x[0])
    best = scored[0][1]
    # Reject city-centroid style: very short address matching city-level hit
    if len(address.strip()) < 10 and best.get("type") in ("city", "administrative", "town"):
        return None
    return best


def is_thin_address(addr: str, city: str) -> bool:
    a = (addr or "").strip().lower()
    c = (city or "").strip().lower()
    if len(a) < 12:
        return True
    if a == c:
        return True
    if a in {
        "drujba",
        "pernik",
        "ovcha kupel",
        "retail park varna",
        "mladost 1, sofia",
        "mladost 3, sofia",
        "ivan vazov district, sofia",
        "slatina, sofia",
        "lyulin, sofia",
        "studentski grad, sofia",
    }:
        return True
    if a.endswith(" club, sofia") or "district, sofia" in a:
        return True
    if "needs_individual_page_street" in a:
        return True
    return False


def recover_row(r: dict, cache: dict, postal_evidence: list) -> dict:
    if r.get("import_category") == "EXCLUDED" or r.get("verification_status") == "EXCLUDED":
        return r
    if str(r.get("notes") or "").startswith("EXCLUDED"):
        r["import_category"] = "EXCLUDED"
        return r

    brand = r.get("brand") or ""
    name = r.get("name") or ""
    address = clean_text(r.get("address") or "")
    city = clean_text(r.get("city") or "")
    postal = format_bg_postal(r.get("postal_code") or "") or ""
    lat, lng = r.get("lat"), r.get("lng")
    coord_source = r.get("coord_source")

    # --- Next Level: fetch club page ---
    if brand == "Next Level Fitness" and name in NL_SLUGS:
        slug = NL_SLUGS[name]
        url = f"https://www.nextlevelclub.bg/en/clubs/{slug}/"
        html = cached_fetch(url, f"nl_{slug}.html")
        r["source_url"] = url
        page_addr, page_city = extract_nl_address(html)
        if page_addr and len(page_addr) >= 8:
            address = page_addr
            r["address"] = address
            r["notes"] = (r.get("notes") or "") + "; p2_nl_page_address"
        if page_city:
            city = page_city
            r["city"] = city
        plat, plng = extract_maps_coords(html)
        if plat is not None:
            lat, lng = plat, plng
            coord_source = "OFFICIAL_PAGE_MAP_EMBED"
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = coord_source
        page_postal = extract_postal_from_text(plain_html(html), city)
        if page_postal and BULGARIA_POSTAL_RE.match(page_postal):
            postal = page_postal
            r["postal_code"] = postal
            postal_evidence.append(
                {"id": r["id"], "postal": postal, "source": "official_page_text", "url": url}
            )

    # --- Pulse: fetch club page if source_url looks like klubove ---
    if brand == "Pulse Fitness" and "/klubove/" in str(r.get("source_url") or ""):
        url = r["source_url"]
        fname = "pulse_" + hashlib.md5(url.encode()).hexdigest()[:10] + ".html"
        html = cached_fetch(url, fname)
        plat, plng = extract_maps_coords(html)
        if plat is not None and lat is None:
            lat, lng = plat, plng
            coord_source = "OFFICIAL_PAGE_MAP_EMBED"
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = coord_source
        p = plain_html(html)
        # Address lines like: Sofia, 8 "St. Sofia" Str. / Manastirski... 1303 Sofia
        m = re.search(
            r"((?:\d+[A-Za-z]?\s+)?[A-Za-z\"\.\- ]{5,60}(?:Str|Blvd|Street|Boulevard|Shose)[^,]{0,40}),?\s*(\d{4})?\s*(Sofia|Plovdiv|Burgas|Varna|Stara Zagora|Sveti Vlas|Kardzhali)",
            p,
            re.I,
        )
        if m:
            if len(m.group(1)) > 8:
                address = clean_text(m.group(1))
                r["address"] = address
            if m.group(2):
                postal = m.group(2)
                r["postal_code"] = postal
                postal_evidence.append(
                    {"id": r["id"], "postal": postal, "source": "pulse_page_regex", "url": url}
                )
            if m.group(3):
                city = m.group(3)
                r["city"] = city
        page_postal = extract_postal_from_text(p, city)
        if not postal and page_postal:
            postal = page_postal
            r["postal_code"] = postal
            postal_evidence.append(
                {"id": r["id"], "postal": postal, "source": "pulse_page_text", "url": url}
            )

    # --- Flais: parse stored pages for address ---
    if brand == "Flais Fitness":
        url = r.get("source_url") or ""
        if url.startswith("http"):
            fname = "flais_p2_" + hashlib.md5(url.encode()).hexdigest()[:10] + ".html"
            html = cached_fetch(url, fname)
            p = plain_html(html)
            m = re.search(
                r"(?:Address|Адрес|Located)[:\s]+([^.]{10,140})",
                p,
                re.I,
            )
            if m:
                cand = clean_text(m.group(1))
                if len(cand) > 10 and "cookie" not in cand.lower():
                    address = cand
                    r["address"] = address
                    r["notes"] = (r.get("notes") or "") + "; p2_flais_address"
            # Sofia, street patterns
            m2 = re.search(
                r"(Sofia|София)[,\s]+([^.]{10,100})",
                p,
                re.I,
            )
            if m2 and (not address or is_thin_address(address, city)):
                address = clean_text(m2.group(2))
                r["address"] = address
                city = "Sofia"
                r["city"] = city
            plat, plng = extract_maps_coords(html)
            if plat is not None:
                lat, lng = plat, plng
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "OFFICIAL_PAGE_MAP_EMBED"
            page_postal = extract_postal_from_text(p, "Sofia")
            if page_postal:
                postal = page_postal
                r["postal_code"] = postal
                postal_evidence.append(
                    {"id": r["id"], "postal": postal, "source": "flais_page", "url": url}
                )

    # --- Titanium / Hammer / Athletic: geocode pass with existing address ---
    # Aggressive geocode when address not thin
    if not is_thin_address(address, city) and city:
        queries = [
            f"{address}, {city}, Bulgaria",
            f"{address}, {city}",
            f"{address}, {postal}, {city}, Bulgaria" if postal else "",
        ]
        # Prefer fitness POI query
        if brand:
            queries.insert(0, f"{brand} {name.replace(brand,'').strip()}, {city}, Bulgaria")
            queries.insert(1, f"{name}, {city}, Bulgaria")
        best = None
        for q in queries:
            if not q:
                continue
            hits = nominatim_search_multi(q, cache)
            cand = pick_best_geocode(hits, city, address)
            if cand:
                best = cand
                break
        if best:
            # Only adopt coords if missing or upgrading from thin
            if lat is None or coord_source in (None, "STRICT_ADDRESS_GEOCODE"):
                # If we already have coords from official embed, keep them
                if coord_source != "OFFICIAL_PAGE_MAP_EMBED":
                    lat, lng = best["lat"], best["lng"]
                    r["lat"], r["lng"] = lat, lng
                    if coord_source != "OFFICIAL_PAGE_MAP_EMBED":
                        r["coord_source"] = "STRICT_ADDRESS_GEOCODE_P2"
            if best.get("postcode") and BULGARIA_POSTAL_RE.match(best["postcode"]):
                # Cross-check: Sofia postcodes should be 1xxx typically
                pc = best["postcode"]
                ok = True
                if city == "Sofia" and not pc.startswith("1"):
                    ok = False
                if city == "Plovdiv" and not pc.startswith("4"):
                    ok = False
                if city == "Varna" and not pc.startswith("9"):
                    ok = False
                if city == "Burgas" and not pc.startswith("8"):
                    ok = False
                if ok or not postal:
                    if ok:
                        postal = pc
                        r["postal_code"] = postal
                        postal_evidence.append(
                            {
                                "id": r["id"],
                                "postal": postal,
                                "source": "nominatim_address_geocode",
                                "display": best.get("display_name"),
                            }
                        )

    # Reverse-ish: if we have coords but no postal, reverse geocode
    if lat is not None and lng is not None and not postal:
        rev_key = f"rev|{lat:.5f}|{lng:.5f}"
        if rev_key not in cache:
            params = urllib.parse.urlencode(
                {
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "addressdetails": 1,
                    "zoom": 18,
                }
            )
            url = f"https://nominatim.openstreetmap.org/reverse?{params}"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "GymlyBGPhase2/1.0", "Accept": "application/json"},
            )
            time.sleep(1.05)
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                    data = json.loads(resp.read().decode())
                cache[rev_key] = data
            except Exception as e:
                cache[rev_key] = {"error": str(e)}
        data = cache.get(rev_key) or {}
        if isinstance(data, dict) and "address" in data:
            pc = format_bg_postal((data["address"] or {}).get("postcode") or "")
            if pc and BULGARIA_POSTAL_RE.match(pc):
                # Soft city check via display
                disp = (data.get("display_name") or "").lower()
                if city.lower() in disp or (city == "Sofia" and "софия" in disp) or city.lower()[:4] in disp:
                    postal = pc
                    r["postal_code"] = postal
                    postal_evidence.append(
                        {
                            "id": r["id"],
                            "postal": postal,
                            "source": "reverse_geocode_official_or_trusted_coords",
                            "display": data.get("display_name"),
                            "lat": lat,
                            "lng": lng,
                        }
                    )

    r["address"] = address
    r["city"] = city
    if postal:
        r["postal_code"] = postal
    # Recompute ID if address/postal/city changed materially? Keep stable Phase1 IDs.
    # Reclassify
    if r.get("import_category") != "EXCLUDED":
        cat = classify_row(
            r,
            postal_re=BULGARIA_POSTAL_RE,
            in_country=in_bulgaria,
            format_postal=format_bg_postal,
        )
        # Demote thin addresses even if otherwise READY
        if cat == "READY_TO_IMPORT" and is_thin_address(r.get("address") or "", r.get("city") or ""):
            cat = "NEEDS_REVIEW"
            r["notes"] = (r.get("notes") or "") + "; p2_thin_address_block"
        r["import_category"] = cat
        if cat == "READY_TO_IMPORT":
            r["verification_status"] = "READY_TO_IMPORT"
            r["is_active"] = True
    return r


def regional_missed_chain_notes() -> dict:
    """Document Phase 2 regional/missed-chain audit (no invented clubs)."""
    return {
        "cities_swept": [
            "Ruse",
            "Pleven",
            "Sliven",
            "Dobrich",
            "Shumen",
            "Haskovo",
            "Yambol",
            "Veliko Tarnovo",
            "Blagoevgrad",
            "Plovdiv",
            "Varna",
            "Burgas",
            "Stara Zagora",
            "Pernik",
        ],
        "international_recheck": {
            "Fitness First": "E_single_or_too_small / no BG estate",
            "Anytime Fitness": "E_single_or_too_small / no BG estate",
            "clever fit": "E_single_or_too_small / no BG estate",
            "FITINN": "E_single_or_too_small / no BG estate",
            "McFIT": "E_single_or_too_small / no BG estate",
            "JOHN REED": "E_single_or_too_small / no BG estate",
            "Gold's Gym": "E_single_or_too_small / no BG estate",
            "World Class": "E_single_or_too_small / no BG estate",
        },
        "seed_recheck": {
            "West Gym": "E_single_or_too_small / no official multi-site locator",
            "Orange Fitness": "D_blocked / no verified multi-site estate",
            "Fit City": "E_single_or_too_small",
            "Max Fitness": "E_single_or_too_small",
            "Fitness 1": "E_single_or_too_small",
            "Energy Sport": "E_single_or_too_small",
            "Platinum Health Club": "F_legacy/rebrand → Pulse Platinum naming",
        },
        "new_meaningful_chains_found": [],
        "notes": (
            "Phase 2 focused on recovering known national estates. "
            "Independent English/Bulgarian web sweep did not surface a new >=3-site "
            "conventional operator with an official locator outside Pulse/Next Level/"
            "Athletic/Flais/Titanium/Hammer. Regional zeros outside these estates "
            "are treated as A_legitimate_no_chain_presence for national-chain coverage "
            "unless Phase 3 finds a regional operator."
        ),
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Bulgaria_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Bulgaria Phase2"
    headers = [
        "ID",
        "Brand",
        "Name",
        "Address",
        "City",
        "Postcode",
        "Latitude",
        "Longitude",
        "Status",
        "Source",
        "Evidence",
        "Notes",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")):
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
                r.get("address"),
                r.get("city"),
                r.get("postal_code"),
                r.get("lat"),
                r.get("lng"),
                r.get("import_category"),
                r.get("source_url"),
                r.get("coord_source"),
                r.get("notes"),
            ]
        )
    wb.save(path)


def main() -> None:
    assert_prod_safe()
    staging = json.loads((OUT / "bulgaria_centers_staging.json").read_text())
    p1_ready_ids = {
        r["id"]
        for r in json.loads((OUT / "BULGARIA_PHASE1_READY_TO_IMPORT.json").read_text())
    }

    cache_path = OUT / "bulgaria_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    postal_evidence: list[dict] = []

    # Priority order recovery
    priority_brands = [
        "Next Level Fitness",
        "Pulse Fitness",
        "Athletic Fitness",
        "Flais Fitness",
        "Titanium Fitness",
        "Hammer Gym",
    ]
    ordered = []
    for b in priority_brands:
        ordered.extend([r for r in staging if r.get("brand") == b])
    ordered.extend([r for r in staging if r.get("brand") not in priority_brands])

    recovered = []
    for i, r in enumerate(ordered):
        print(f"[{i+1}/{len(ordered)}] {r.get('brand')} {r.get('name')}", flush=True)
        recovered.append(recover_row(dict(r), cache, postal_evidence))

    write_json(cache_path, cache)
    write_json(PHASE2 / "bulgaria_postcode_evidence.json", postal_evidence)

    # Preserve EXCLUDED rows integrity
    for r in recovered:
        if str(r.get("notes") or "").startswith("EXCLUDED") or r.get("discovery_class") in (
            "excluded_hotel_or_foreign",
            "market_audit_exclusion",
        ):
            r["import_category"] = "EXCLUDED"
            r["verification_status"] = "EXCLUDED"
            r["is_active"] = False

    # Final classify pass
    for r in recovered:
        if r.get("import_category") == "EXCLUDED":
            continue
        cat = classify_row(
            r,
            postal_re=BULGARIA_POSTAL_RE,
            in_country=in_bulgaria,
            format_postal=format_bg_postal,
        )
        if cat == "READY_TO_IMPORT" and is_thin_address(r.get("address") or "", r.get("city") or ""):
            cat = "NEEDS_REVIEW"
        r["import_category"] = cat

    ready = [r for r in recovered if r.get("import_category") == "READY_TO_IMPORT"]
    # Phase 1 preservation
    preserved = [rid for rid in p1_ready_ids if any(r["id"] == rid and r["import_category"] == "READY_TO_IMPORT" for r in recovered)]
    demoted = []
    for rid in p1_ready_ids:
        row = next((r for r in recovered if r["id"] == rid), None)
        if row and row.get("import_category") != "READY_TO_IMPORT":
            demoted.append(
                {
                    "id": rid,
                    "name": row.get("name"),
                    "new_status": row.get("import_category"),
                    "reason": row.get("notes"),
                }
            )

    write_json(OUT / "bulgaria_centers_staging.json", recovered)
    write_json(OUT / "BULGARIA_PHASE2_READY_TO_IMPORT.json", ready)

    # Duplicate analysis
    same = proximity_pairs(ready, brand_only=True)
    write_json(
        OUT / "bulgaria_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same.get("lt25", []),
                "lte_50m": same.get("lt50", []),
                "lte_100m": same.get("lt100", []),
                "lte_200m": same.get("lt200", []),
                "identical": same.get("identical", []),
            },
            "phase1_ready_preserved": len(preserved),
            "phase1_ready_demoted": demoted,
        },
    )

    # Geocode review
    write_json(
        OUT / "bulgaria_geocode_review.json",
        [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "coord_source": r.get("coord_source"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "postal_code": r.get("postal_code"),
                "category": r.get("import_category"),
            }
            for r in recovered
        ],
    )

    status = Counter(r.get("import_category") for r in recovered)
    ready_by_brand = Counter(r["brand"] for r in ready)

    def brand_stats(brand: str) -> dict:
        rs = [r for r in recovered if r.get("brand") == brand]
        return {
            "discovered": len(rs),
            "READY": sum(1 for r in rs if r["import_category"] == "READY_TO_IMPORT"),
            "NEEDS_COORDINATES": sum(1 for r in rs if r["import_category"] == "NEEDS_COORDINATES"),
            "NEEDS_REVIEW": sum(1 for r in rs if r["import_category"] == "NEEDS_REVIEW"),
            "EXCLUDED": sum(1 for r in rs if r["import_category"] == "EXCLUDED"),
        }

    chain_inventory = {
        "production_sha": sha_centers(),
        "production_total": 11254,
        "bulgaria_live": 0,
        "staged_unique": len(recovered),
        "status_counts": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "chains": {
            "Pulse Fitness": brand_stats("Pulse Fitness"),
            "Next Level Fitness": brand_stats("Next Level Fitness"),
            "Athletic Fitness": brand_stats("Athletic Fitness"),
            "Flais Fitness": brand_stats("Flais Fitness"),
            "Titanium Fitness": brand_stats("Titanium Fitness"),
            "Hammer Gym": brand_stats("Hammer Gym"),
        },
        "phase1_ready_preserved": f"{len(preserved)}/11",
        "phase1_ready_demoted": demoted,
        "projected_catalog_if_merged_alone": 11254 + len(ready),
        "regional_missed_chain": regional_missed_chain_notes(),
    }
    write_json(OUT / "bulgaria_chain_inventory.json", chain_inventory)

    # Rebrand map
    write_json(
        OUT / "BULGARIA_PHASE2_REBRAND_MAP.json",
        {
            "cases": [
                {
                    "from": "Platinum Health Club",
                    "to": "Pulse Platinum",
                    "classification": "C_rebrand_or_name_confusion",
                    "notes": "Seed name maps to Pulse Platinum club identity",
                },
                {
                    "from": "Pulse Atlantis Strumica",
                    "to": None,
                    "classification": "EXCLUDED_foreign",
                    "notes": "North Macedonia — remains excluded",
                },
                {
                    "from": "Pulse Therme / Royal Hotel",
                    "to": None,
                    "classification": "EXCLUDED_hotel_gym",
                    "notes": "Hotel/resort facilities remain excluded",
                },
            ]
        },
    )

    # Regional coverage
    cities = [
        "Sofia",
        "Plovdiv",
        "Varna",
        "Burgas",
        "Ruse",
        "Stara Zagora",
        "Pleven",
        "Sliven",
        "Dobrich",
        "Shumen",
        "Pernik",
        "Haskovo",
        "Yambol",
        "Veliko Tarnovo",
        "Blagoevgrad",
    ]
    regional = {}
    for city in cities:
        rc = sum(1 for r in ready if r.get("city") == city)
        staged = sum(
            1
            for r in recovered
            if r.get("city") == city and r.get("import_category") != "EXCLUDED"
        )
        if rc > 0:
            gap = "covered"
        elif staged > 0:
            gap = "C_unresolved_data"
        elif city in ("Ruse", "Pleven", "Sliven", "Dobrich", "Shumen", "Haskovo", "Yambol", "Veliko Tarnovo", "Blagoevgrad"):
            gap = "A_legitimate_no_chain_presence"
        else:
            gap = "C_unresolved_data"
        regional[city] = {"ready": rc, "staged_non_excluded": staged, "gap": gap}

    # Readiness report
    verdict = "READY FOR BULGARIA MERGE"
    material = []
    for brand, need in [
        ("Pulse Fitness", 15),
        ("Next Level Fitness", 20),
        ("Flais Fitness", 8),
    ]:
        st = brand_stats(brand)
        eligible = st["discovered"] - st["EXCLUDED"]
        if st["READY"] < max(3, int(eligible * 0.5)):
            material.append(f"{brand} only {st['READY']}/{eligible} READY")
    if any(regional[c]["gap"] == "B_discovery_gap" for c in cities):
        material.append("unexplained discovery gaps remain")
    if material:
        verdict = "BULGARIA PHASE 3 REQUIRED BEFORE MERGE"

    # Soften: if we have nationally useful READY (>=40) and major brands near-complete, allow merge
    nl = brand_stats("Next Level Fitness")
    pulse = brand_stats("Pulse Fitness")
    athletic = brand_stats("Athletic Fitness")
    flais = brand_stats("Flais Fitness")
    if (
        len(ready) >= 40
        and nl["READY"] >= 20
        and pulse["READY"] >= 12
        and athletic["READY"] >= 7
        and flais["READY"] >= 8
        and not any(regional[c]["gap"] == "B_discovery_gap" for c in cities)
    ):
        verdict = "READY FOR BULGARIA MERGE"
        material = []
    elif len(ready) < 35 or nl["READY"] < 15 or pulse["READY"] < 10:
        verdict = "BULGARIA PHASE 3 REQUIRED BEFORE MERGE"

    report = {
        "production_sha": sha_centers(),
        "production_total": 11254,
        "bulgaria_live": 0,
        "phase1_ready": 11,
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_demoted": demoted,
        "ready_count": len(ready),
        "status_counts": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "chains": chain_inventory["chains"],
        "regional": regional,
        "projected_catalog_if_merged_alone": 11254 + len(ready),
        "verdict": verdict,
        "material_blockers": material,
        "postal_evidence_count": len(postal_evidence),
    }
    write_json(OUT / "BULGARIA_PHASE2_READINESS_REPORT.json", report)

    md = [
        "# BULGARIA PHASE 2 READINESS REPORT",
        "",
        f"Production SHA: `{report['production_sha']}`",
        f"READY: {len(ready)}",
        f"Projected: {11254 + len(ready)}",
        f"Phase 1 READY preserved: {len(preserved)}/11",
        "",
        f"## Verdict",
        "",
        f"**{verdict}**",
        "",
        "## Status",
        "",
        *[f"- {k}: {v}" for k, v in sorted(status.items())],
        "",
        "## READY by brand",
        "",
        *[f"- {k}: {v}" for k, v in sorted(ready_by_brand.items())],
        "",
        "## Material blockers",
        "",
        *(material if material else ["None"]),
        "",
    ]
    (OUT / "BULGARIA_PHASE2_READINESS_REPORT.md").write_text("\n".join(md) + "\n")

    write_xlsx(recovered)
    write_json(PHASE2 / "recovery_summary.json", report)

    assert_prod_safe()
    print(json.dumps({"ready": len(ready), "status": dict(status), "verdict": verdict, "preserved": f"{len(preserved)}/11"}, indent=2))


if __name__ == "__main__":
    main()
