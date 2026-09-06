#!/usr/bin/env python3
"""Romania Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    extract_jsonld,
    format_ro_postal,
    write_json,
)

OUT = ROOT / "data/romania"
RAW = OUT / "raw"
PAGES = RAW / "pages"
SCRAPES = OUT / "scrapes"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, SCRAPES, PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_MERGE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

CITY_CANONICAL = {
    "bucuresti": "București",
    "cluj": "Cluj-Napoca",
    "cluj-napoca": "Cluj-Napoca",
    "timisoara": "Timișoara",
    "iasi": "Iași",
    "brasov": "Brașov",
    "constanta": "Constanța",
    "craiova": "Craiova",
    "galati": "Galați",
    "pitesti": "Pitești",
    "ploiesti": "Ploiești",
    "sibiu": "Sibiu",
    "oradea": "Oradea",
    "arad": "Arad",
    "bacau": "Bacău",
    "baia mare": "Baia Mare",
    "buzau": "Buzău",
    "targu mures": "Târgu Mureș",
    "targu-mures": "Târgu Mureș",
    "targoviste": "Târgoviște",
    "targu-jiu": "Târgu Jiu",
    "valcea": "Râmnicu Vâlcea",
    "ramnicu valcea": "Râmnicu Vâlcea",
    "vaslui": "Vaslui",
    "braila": "Brăila",
    "alba iulia": "Alba Iulia",
    "alba-iulia": "Alba Iulia",
    "piatra neamt": "Piatra Neamț",
    "piatra-neamt": "Piatra Neamț",
    "cluj napoca": "Cluj-Napoca",
    "bucurești": "București",
    "timișoara": "Timișoara",
    "constanța": "Constanța",
    "ștefăneștii de jos": "Ștefăneștii de Jos",
    "stefanestii de jos": "Ștefăneștii de Jos",
    "otopeni": "Otopeni",
    "voluntari": "Voluntari",
    "chiajna": "Chiajna",
    "popești-leordeni": "Popești-Leordeni",
    "popesti leordeni": "Popești-Leordeni",
    "florești": "Florești",
    "floresti": "Florești",
    "turda": "Turda",
    "campia turzii": "Câmpia Turzii",
    "câmpia turzii": "Câmpia Turzii",
    "medias": "Mediaș",
    "mediaș": "Mediaș",
    "iernut": "Iernut",
    "ludus": "Ludus",
    "luduș": "Luduș",
    "bistrita": "Bistrița",
    "bacau": "Bacău",
    "bacău": "Bacău",
}


def canonical_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    if key in CITY_CANONICAL:
        return CITY_CANONICAL[key]
    key2 = key.replace(" ", "-")
    if key2 in CITY_CANONICAL:
        return CITY_CANONICAL[key2]
    return s


def normalize_wc_city(oras: str, loc_city: str) -> str:
    raw = oras or loc_city or ""
    mapping = {
        "Bucuresti": "București",
        "Bucharest": "București",
        "Timisoara": "Timișoara",
        "Iasi": "Iași",
        "Brasov": "Brașov",
        "Constanta": "Constanța",
        "Ploiesti": "Ploiești",
        "Cluj-Napoca": "Cluj-Napoca",
        "Cluj Napoca": "Cluj-Napoca",
    }
    return mapping.get(raw, raw) or canonical_city(raw)


def fetch_json(url: str, out_path: Path | None = None) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8")
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(body)
    return json.loads(body)


def discover_world_class(rows: list) -> dict:
    data = fetch_json(
        "https://www.worldclass.ro/wp-json/clubs/v1/club",
        SCRAPES / "worldclass_clubs_api.json",
    )
    clubs = data.get("clubs") or []
    stats = {"discovered": 0, "with_coords": 0}
    for club in clubs:
        if club.get("post_status") != "publish":
            continue
        acf = club.get("acf") or {}
        loc = acf.get("locatie") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        postal = format_ro_postal(loc.get("post_code") or acf.get("adresa") or "")
        address = clean_text(acf.get("adresa") or loc.get("address") or "")
        city = normalize_wc_city(acf.get("oras") or "", loc.get("city") or "")
        if loc.get("city") and city in ("București", "Bucuresti") and "Ilfov" in str(loc.get("state", "")):
            city = canonical_city(loc.get("city") or city)
        name = clean_text(club.get("post_title") or "World Class")
        rows.append(
            base_row(
                prefix="ro_",
                country="Romania",
                brand="World Class",
                name=name,
                address=address,
                postal_code=postal,
                city=city,
                source_url=club.get("link") or "https://www.worldclass.ro/harta-cluburi/",
                lat=lat,
                lng=lng,
                coord_source="OFFICIAL_API" if lat and lng else None,
                notes=f"tip_club={acf.get('tip_club')}; wc_api",
                chain_key="world_class",
            )
        )
        stats["discovered"] += 1
        if lat and lng:
            stats["with_coords"] += 1
    return {
        "chain": "World Class",
        "official_estimate": 45,
        "discovered": stats["discovered"],
        "with_coords": stats["with_coords"],
        "source": "https://www.worldclass.ro/wp-json/clubs/v1/club",
        "verdict": "NEAR-COMPLETE" if stats["discovered"] >= 43 else "PARTIAL",
    }


def discover_18gym(rows: list) -> dict:
    url = "https://18gym.ro/wp-admin/admin-ajax.php?action=asl_load_stores&nonce=0"
    stores = fetch_json(url, SCRAPES / "18gym_stores.json")
    if not isinstance(stores, list):
        stores = []
    stats = {"discovered": 0, "coming_soon": 0}
    for s in stores:
        title = clean_text(s.get("title") or "18GYM")
        street = clean_text(s.get("street") or "")
        city = canonical_city(s.get("city") or "")
        lat = s.get("lat")
        lng = s.get("lng")
        postal = format_ro_postal(s.get("postal_code") or "")
        desc = s.get("description") or ""
        coming = bool(re.search(r"L-V:\s*-|program:\s*-|În curând|in curand", desc, re.I))
        website = s.get("website") or "https://18gym.ro/locatii/"
        rows.append(
            base_row(
                prefix="ro_",
                country="Romania",
                brand="18GYM",
                name=title,
                address=street,
                postal_code=postal,
                city=city,
                source_url=website,
                lat=float(lat) if lat else None,
                lng=float(lng) if lng else None,
                coord_source="OFFICIAL_MAP_PIN" if lat and lng else None,
                coming=coming,
                notes="18gym_asl_store_locator",
                chain_key="18gym",
            )
        )
        stats["discovered"] += 1
        if coming:
            stats["coming_soon"] += 1
    return {
        "chain": "18GYM",
        "official_estimate": 47,
        "discovered": stats["discovered"],
        "coming_soon": stats["coming_soon"],
        "source": url,
        "verdict": "NEAR-COMPLETE" if stats["discovered"] >= 40 else "PARTIAL",
    }


def parse_stayfit_city(html: str, city_label: str, source_url: str) -> list[dict]:
    out = []
    # h2 club name blocks with following address paragraph
    parts = re.split(
        r'<h2[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([^<]+)</h2>',
        html,
        flags=re.I,
    )
    skip_titles = {
        "centre bucurești",
        "centre bucuresti",
        "follow",
        "descarcă aplicația",
        "descarca aplicatia",
        "informații despre abonament cu discount progresiv",
    }
    for i in range(1, len(parts), 2):
        name = clean_text(parts[i])
        if not name or len(name) < 2 or len(name) > 60:
            continue
        if name.lower() in skip_titles:
            continue
        if "FITNESS I AEROBIC" in name.upper():
            continue
        chunk = parts[i + 1] if i + 1 < len(parts) else ""
        addr_m = re.search(
            r"<p[^>]*>\s*((?:Str(?:ada|\.|eet)?|Bd\.?|Bulevard|Sos(?:eaua)?|Calea|Șoseaua)[^<]{8,180})\s*</p>",
            chunk,
            re.I,
        )
        if not addr_m:
            continue
        address = clean_text(re.sub(r"<[^>]+>", "", addr_m.group(1)))
        if len(address) < 8:
            continue
        coming = bool(re.search(r"presale|în curând|in curand|coming soon", chunk, re.I))
        # infer locality from address
        city = city_label
        for pat in [
            r"Sector\s+\d+,\s*(București|Bucuresti)",
            r",\s*(Otopeni|Voluntari|Chiajna|Popești-Leordeni|Popesti-Leordeni|Florești|Floresti|Ilfov)",
            r",\s*(București|Bucuresti)\s*$",
        ]:
            m = re.search(pat, address, re.I)
            if m:
                city = canonical_city(m.group(1))
                break
        out.append(
            {
                "name": f"Stay Fit Gym {name}" if not name.lower().startswith("stay fit") else name,
                "address": address,
                "city": city,
                "source_url": source_url,
                "coming": coming,
            }
        )
    return out


def stayfit_city_slugs(html: str) -> list[tuple[str, str]]:
    slugs = []
    for m in re.finditer(r'href="https://stayfit\.ro/([a-z0-9-]+)/"', html, re.I):
        slug = m.group(1).lower()
        if slug in {
            "cluburi",
            "contact",
            "blog",
            "cariere",
            "black",
            "cardio",
            "clase-de-grup",
            "alege-abonament",
            "feed",
            "wp-content",
        }:
            continue
        label = slug.replace("-", " ").title()
        if slug == "bucuresti":
            label = "București"
        elif slug == "cluj":
            label = "Cluj-Napoca"
        elif slug == "timisoara":
            label = "Timișoara"
        elif slug == "iasi":
            label = "Iași"
        elif slug == "brasov":
            label = "Brașov"
        elif slug == "constanta":
            label = "Constanța"
        elif slug == "valcea":
            label = "Râmnicu Vâlcea"
        elif slug == "piatra-neamt":
            label = "Piatra Neamț"
        elif slug == "targu-jiu":
            label = "Târgu Jiu"
        elif slug == "targoviste":
            label = "Târgoviște"
        elif slug == "alba-iulia":
            label = "Alba Iulia"
        slugs.append((slug, label))
    # dedupe preserve order
    seen = set()
    uniq = []
    for s, l in slugs:
        if s in seen:
            continue
        seen.add(s)
        uniq.append((s, l))
    return uniq


def discover_stay_fit(rows: list) -> dict:
    cluburi = curl_fetch("https://stayfit.ro/cluburi/", PAGES / "stayfit_cluburi.html")
    cities = stayfit_city_slugs(cluburi) if not cluburi.startswith("ERR") else []
    if not cities:
        cities = [
            ("bucuresti", "București"),
            ("cluj", "Cluj-Napoca"),
            ("timisoara", "Timișoara"),
            ("iasi", "Iași"),
            ("brasov", "Brașov"),
            ("constanta", "Constanța"),
            ("craiova", "Craiova"),
            ("galati", "Galați"),
            ("pitesti", "Pitești"),
            ("ploiesti", "Ploiești"),
            ("sibiu", "Sibiu"),
            ("arad", "Arad"),
            ("bacau", "Bacău"),
            ("braila", "Brăila"),
            ("buzau", "Buzău"),
            ("alba-iulia", "Alba Iulia"),
            ("piatra-neamt", "Piatra Neamț"),
            ("targoviste", "Târgoviște"),
            ("targu-jiu", "Târgu Jiu"),
            ("valcea", "Râmnicu Vâlcea"),
            ("vaslui", "Vaslui"),
        ]
    discovered = 0
    coming = 0
    for slug, label in cities:
        url = f"https://stayfit.ro/{slug}/"
        html = curl_fetch(url, PAGES / f"stayfit_{slug}.html")
        if html.startswith("ERR"):
            continue
        time.sleep(0.4)
        clubs = parse_stayfit_city(html, label, url)
        for c in clubs:
            rows.append(
                base_row(
                    prefix="ro_",
                    country="Romania",
                    brand="Stay Fit Gym",
                    name=c["name"],
                    address=c["address"],
                    postal_code="",
                    city=c["city"],
                    source_url=c["source_url"],
                    coming=c.get("coming", False),
                    notes="stayfit_city_page",
                    chain_key="stay_fit",
                )
            )
            discovered += 1
            if c.get("coming"):
                coming += 1
    return {
        "chain": "Stay Fit Gym",
        "official_estimate": 72,
        "discovered": discovered,
        "coming_soon": coming,
        "cities_scraped": len(cities),
        "source": "https://stayfit.ro/cluburi/",
        "verdict": "PARTIAL" if discovered < 60 else "NEAR-COMPLETE",
    }


def probe_other_chains() -> list[dict]:
    """Market audit inventory — no import unless verified operator."""
    probes = [
        {
            "chain": "ESX",
            "url": "https://esx.ro/",
            "classification": "membership_aggregator",
            "physical_clubs": 0,
            "verdict": "EXCLUDED",
            "notes": "700+ partner gyms — not ESX-branded operator; do not import partner network",
        },
        {
            "chain": "Smartfit Romania",
            "url": "https://www.smartfit.com.br/",
            "classification": "not_in_romania",
            "physical_clubs": 0,
            "verdict": "EXCLUDED",
            "notes": "Smartfit brand is Brazil/LATAM — no verified RO chain at smartfit.com.br",
        },
        {
            "chain": "Anytime Fitness Romania",
            "url": "https://www.anytimefitness.com/",
            "classification": "franchise_sparse",
            "physical_clubs": 0,
            "verdict": "NEEDS_REVIEW",
            "notes": "Sparse franchise presence — Phase 2 if multi-site verified",
        },
        {
            "chain": "One Fitness",
            "url": "https://onefitness.ro/",
            "classification": "regional",
            "physical_clubs": 0,
            "verdict": "NEEDS_REVIEW",
            "notes": "Phase 2 — verify current multi-site estate",
        },
        {
            "chain": "SAS Gym",
            "url": "https://sasgym.ro/",
            "classification": "regional",
            "physical_clubs": 0,
            "verdict": "NEEDS_REVIEW",
            "notes": "Phase 2 probe",
        },
        {
            "chain": "Downtown Fitness",
            "url": "https://downtownfitness.ro/",
            "classification": "regional",
            "physical_clubs": 0,
            "verdict": "NEEDS_REVIEW",
            "notes": "Phase 2 — Bucharest/regional",
        },
        {
            "chain": "Gold's Gym Romania",
            "url": "https://www.goldsgym.com/",
            "classification": "franchise_sparse",
            "physical_clubs": 0,
            "verdict": "EXCLUDED",
            "notes": "No verified current national RO estate",
        },
        {
            "chain": "LadyFIT",
            "url": "",
            "classification": "unknown",
            "physical_clubs": 0,
            "verdict": "NEEDS_REVIEW",
            "notes": "Women-focused — verify conventional gym model",
        },
    ]
    return probes


def main() -> None:
    rows: list[dict] = []
    inventory = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "production_total": 11063,
        "pre_merge_sha256": PRE_MERGE_SHA,
        "chains": {},
        "other_chains": probe_other_chains(),
        "esx": {
            "classification": "B_membership_platform",
            "physical_esx_clubs": 0,
            "partner_network_excluded": True,
            "verdict": "EXCLUDED — import operator clubs only, not ESX partner pass network",
        },
        "rebrand_notes": [
            {
                "legacy": "World Class acquired clubs",
                "successor": "World Class",
                "action": "current consumer identity wins — no duplicate legacy+successor",
            },
        ],
    }

    wc = discover_world_class(rows)
    g18 = discover_18gym(rows)
    sf = discover_stay_fit(rows)
    inventory["chains"]["world_class"] = wc
    inventory["chains"]["18gym"] = g18
    inventory["chains"]["stay_fit"] = sf

    write_json(OUT / "romania_chain_inventory.json", inventory)
    write_json(OUT / "romania_phase1_candidates.json", rows)
    write_json(PHASE1 / "discovery_summary.json", {
        "world_class": wc,
        "18gym": g18,
        "stay_fit": sf,
        "total_candidates": len(rows),
        "pre_merge_sha256": PRE_MERGE_SHA,
    })

    rebrand = {
        "generated_at": inventory["generated_at"],
        "mappings": [
            {
                "from": "World Class legacy club brands",
                "to": "World Class",
                "status": "acquired_integrated",
                "action": "import_current_wc_identity_only",
            },
            {
                "from": "ESX partner gyms",
                "to": "N/A",
                "status": "aggregator",
                "action": "exclude_entire_esx_network",
            },
        ],
    }
    write_json(OUT / "ROMANIA_PHASE1_REBRAND_MAP.json", rebrand)

    print(f"Romania Phase 1 discovery: {len(rows)} candidates")
    print(f"  World Class: {wc['discovered']}")
    print(f"  18GYM: {g18['discovered']}")
    print(f"  Stay Fit: {sf['discovered']}")
    print(f"Pre-merge SHA256: {PRE_MERGE_SHA}")


if __name__ == "__main__":
    main()
