#!/usr/bin/env python3
"""Luxembourg Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_lu_postal,
    write_json,
)

OUT = ROOT / "data/luxembourg"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb"
PRODUCTION_TOTAL = 11610

CITY_CANON = {
    "luxembourg": "Luxembourg",
    "luxembourg-city": "Luxembourg",
    "luxemburg": "Luxembourg",
    "esch-sur-alzette": "Esch-sur-Alzette",
    "esch": "Esch-sur-Alzette",
    "differdange": "Differdange",
    "dudelange": "Dudelange",
    "pétange": "Pétange",
    "petange": "Pétange",
    "sanem": "Sanem",
    "hesperange": "Hesperange",
    "bettembourg": "Bettembourg",
    "strassen": "Strassen",
    "bertrange": "Bertrange",
    "mamer": "Mamer",
    "mersch": "Mersch",
    "ettelbruck": "Ettelbruck",
    "ettelbrück": "Ettelbruck",
    "diekirch": "Diekirch",
    "wiltz": "Wiltz",
    "grevenmacher": "Grevenmacher",
    "remich": "Remich",
    "belvaux": "Belvaux",
    "belval": "Belvaux",
    "foetz": "Foetz",
    "gasperich": "Luxembourg",
    "kirchberg": "Luxembourg",
    "beggen": "Luxembourg",
    "junglinster": "Junglinster",
    "sandweiler": "Sandweiler",
    "bereldange": "Bereldange",
    "windhof": "Windhof",
    "howald": "Howald",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(key.replace(" ", "-")) or s


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    source_url: str,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    excluded: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
) -> None:
    row = base_row(
        prefix="lu_",
        country="Luxembourg",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_lu_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("-", "_"),
    )
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif import_category:
        row["import_category"] = import_category
    rows.append(row)


def discover_basic_fit(rows: list[dict]) -> None:
    """Official Basic-Fit en-lu club-finder JSON-LD — 10 current clubs."""
    src = "https://www.basic-fit.com/en-lu/club-finder"
    ld_path = PAGES / "basicfit_ldjson.json"
    clubs = json.loads(ld_path.read_text(encoding="utf-8"))["itemListElement"]
    for item in clubs:
        g = item["item"]
        addr = g["address"]
        street = clean_text(addr.get("streetAddress") or "")
        # Prefer consumer Rue du Brill for Foetz (club-finder card); LD says Route de Brill
        if "brill" in street.lower() and "foetz" in (addr.get("addressLocality") or "").lower():
            street = "Rue du Brill 11"
        locality = addr.get("addressLocality") or ""
        # Gasperich is a Luxembourg City quarter — store as Luxembourg for city field
        city = "Luxembourg" if locality.lower() in ("gasperich",) else locality
        club_url = g.get("url") or src
        short = locality or street
        notes = "Official Basic-Fit en-lu club-finder JSON-LD; open estate Aug 2026"
        lat = lng = None
        coord_source = None
        # Windhof: address geocode misses; business pin is merge-grade (#4)
        if "windhof" in (locality or "").lower():
            lat, lng = 49.6469913, 5.9601903
            coord_source = "NOMINATIM_BUSINESS_PIN"
            notes += "; Nominatim Basic-Fit Windhof / Rue d'Arlon business pin"
        add(
            rows,
            brand="Basic-Fit",
            name=f"Basic-Fit {short}",
            address=street,
            city=city,
            postal=addr.get("postalCode") or "",
            source_url=club_url,
            notes=notes,
            lat=lat,
            lng=lng,
            coord_source=coord_source,
            chain_key="basic_fit",
        )
    PAGES.joinpath("basicfit_clubs_summary.txt").write_text(
        "\n".join(
            f"{c['item']['name']}|{c['item']['address'].get('streetAddress')}|"
            f"{c['item']['address'].get('postalCode')}|{c['item']['address'].get('addressLocality')}"
            for c in clubs
        )
        + f"\nSOURCE {src}\nCOUNT {len(clubs)}\n",
        encoding="utf-8",
    )


def discover_jims(rows: list[dict]) -> None:
    """Official jims.lu/en/clubs — 7 clubs; Foetz renovating (COMING_SOON)."""
    src = "https://www.jims.lu/en/clubs"
    clubs = [
        ("Beggen", "Rue de Beggen 233", "Luxembourg", "1221", False),
        ("Foetz", "Rue du Brill 11", "Foetz", "3898", True),  # renovating reopen 07/09
        ("Gare", "Rue Joseph Junck 11", "Luxembourg", "1839", False),
        ("Gasperich", "Rue Christophe Plantin 18", "Luxembourg", "2339", False),
        ("Kirchberg Ellipse", "Avenue John F. Kennedy 33", "Luxembourg", "1855", False),
        ("Kirchberg Infinity", "Avenue John F. Kennedy 7", "Luxembourg", "1855", False),
        ("Mersch", "2 Allée John W. Leonard, Centre Commercial LISTO", "Mersch", "7526", False),
    ]
    coords = {
        "Mersch": (49.758697, 6.0971937, "NOMINATIM_PREMISES_PIN", "; Listo Shopping Center premises pin"),
    }
    for club, addr, city, postal, coming in clubs:
        notes = "Official jims.lu/en/clubs"
        if coming:
            notes += "; Foetz renovating — reopening 07/09 (treat as COMING_SOON)"
        if club == "Gasperich":
            notes += "; former Painworld Gasperich (rebrand/successor)"
        lat = lng = None
        coord_source = None
        if club in coords:
            lat, lng, coord_source, extra = coords[club]
            notes += extra
        add(
            rows,
            brand="JIMS",
            name=f"JIMS {club}",
            address=addr,
            city=city,
            postal=postal,
            source_url=src,
            notes=notes,
            coming=coming,
            lat=lat,
            lng=lng,
            coord_source=coord_source,
            chain_key="jims",
        )
    PAGES.joinpath("jims_clubs_summary.txt").write_text(
        "\n".join(f"{c}|{a}|{ci}|{p}|coming={cs}" for c, a, ci, p, cs in clubs)
        + f"\nSOURCE {src}\n",
        encoding="utf-8",
    )


def discover_ck_fitness(rows: list[dict]) -> None:
    """Official ck-fitness.lu nos-centres — 4 conventional fitness centres."""
    src = "https://www.ck-fitness.lu/fr/nos-centres"
    clubs = [
        ("Bertrange", "City Concorde, 80 Route de Longwy", "Bertrange", "8060", None),
        ("Esch-sur-Alzette", "2 Rue de Mondercange", "Esch-sur-Alzette", "4247", None),
        (
            "Junglinster",
            "Laangwiss II, Rue Nicolas Glesener",
            "Junglinster",
            "6131",
            (49.7057648, 6.2512708, "NOMINATIM_BUSINESS_PIN", "; CK Fitness Jonglënster business pin"),
        ),
        ("Mersch", "Topaze, Rue Colmar-Berg", "Mersch", "7525", None),
    ]
    for club, addr, city, postal, geo in clubs:
        notes = "Official ck-fitness.lu/fr/nos-centres; conventional public gyms only"
        lat = lng = None
        coord_source = None
        if geo:
            lat, lng, coord_source, extra = geo
            notes += extra
        add(
            rows,
            brand="CK Fitness",
            name=f"CK Fitness {club}",
            address=addr,
            city=city,
            postal=postal,
            source_url=src,
            notes=notes,
            lat=lat,
            lng=lng,
            coord_source=coord_source,
            chain_key="ck_fitness",
        )
    PAGES.joinpath("ck_fitness_summary.txt").write_text(
        "\n".join(f"{c}|{a}|{ci}|{p}" for c, a, ci, p, _geo in clubs) + f"\nSOURCE {src}\n",
        encoding="utf-8",
    )


def discover_exclusions(rows: list[dict]) -> None:
    """Document Class E/F/C exclusions for audit trail (not importable)."""
    exclusions = [
        (
            "Factory 4",
            "Factory 4 Belvaux",
            "Belvaux",
            "Single-site / Class E — below >=3 chain threshold",
            "https://www.factory4.lu/",
        ),
        (
            "Vitaly-Fit",
            "Vitaly-Fit",
            "Luxembourg",
            "Single-site / Class E — below chain threshold",
            "https://vitaly-fit.lu/",
        ),
        (
            "Athletic Center",
            "Athletic Center",
            "Luxembourg",
            "Single-site / Class E — below chain threshold",
            "https://www.athleticcenter.lu/",
        ),
        (
            "Fitness Zone",
            "Fitness Zone",
            "Luxembourg",
            "Single-site / Class E — below chain threshold",
            "https://fitnesszone.lu/",
        ),
        (
            "Keep Cool",
            "Keep Cool Luxembourg probe",
            "Luxembourg",
            "Class F/E — no meaningful multi-club LU conventional estate confirmed",
            "https://www.keepcool.fr/",
        ),
        (
            "Painworld",
            "Painworld Gasperich (legacy)",
            "Luxembourg",
            "Class F rebrand — succeeded by JIMS Gasperich; do not import predecessor",
            "https://www.jims.lu/en/clubs",
        ),
        (
            "CK Sportcenter",
            "CK Sportcenter Kockelscheuer",
            "Luxembourg",
            "Class C — sports-complex / non-standard; not conventional public gym chain import",
            "https://www.ck-fitness.lu/",
        ),
        (
            "Fitness Park",
            "Fitness Park LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg (international probe)",
            "https://www.fitnesspark.fr/",
        ),
        (
            "Anytime Fitness",
            "Anytime Fitness LU probe",
            "Luxembourg",
            "Class F — no confirmed LU multi-club estate",
            "https://www.anytimefitness.com/",
        ),
        (
            "McFIT",
            "McFIT LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.mcfit.com/",
        ),
        (
            "JOHN REED",
            "JOHN REED LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://johnreed.fitness/",
        ),
        (
            "clever fit",
            "clever fit LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.clever-fit.com/",
        ),
        (
            "FITINN",
            "FITINN LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.fitinn.at/",
        ),
        (
            "Gold's Gym",
            "Gold's Gym LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.goldsgym.com/",
        ),
        (
            "Fitness First",
            "Fitness First LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.fitnessfirst.com/",
        ),
        (
            "World Class",
            "World Class LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.worldclass.se/",
        ),
        (
            "L'Orange Bleue",
            "L'Orange Bleue LU probe",
            "Luxembourg",
            "Class F — absent in Luxembourg",
            "https://www.lorangebleue.fr/",
        ),
        (
            "Coque",
            "Coque fitness facilities",
            "Luxembourg",
            "Class C — national sports complex facilities, not conventional public gym chain",
            "https://www.coque.lu/",
        ),
    ]
    for brand, name, city, notes, url in exclusions:
        add(
            rows,
            brand=brand,
            name=name,
            address="EXCLUDED — not a merge candidate",
            city=city,
            postal="",
            source_url=url,
            notes=notes,
            excluded=True,
            discovery_class="exclusion_audit",
            chain_key=brand.lower().replace(" ", "_").replace("'", "").replace("-", "_"),
        )


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA mismatch {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    lu = sum(
        1
        for c in data
        if str(c.get("id", "")).startswith("lu_") or c.get("country") == "Luxembourg"
    )
    if lu != 0:
        raise SystemExit(f"STOP: Luxembourg live={lu}")

    rows: list[dict] = []
    discover_basic_fit(rows)
    discover_jims(rows)
    discover_ck_fitness(rows)
    discover_exclusions(rows)

    write_json(OUT / "luxembourg_phase1_candidates.json", rows)
    write_json(
        OUT / "phase1" / "discovery_summary.json",
        {
            "country": "Luxembourg",
            "phase": 1,
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": EXPECTED_SHA,
            "luxembourg_live": 0,
            "candidate_count": len(rows),
            "by_brand": {
                b: sum(1 for r in rows if r.get("brand") == b)
                for b in sorted({r.get("brand") for r in rows})
            },
            "class_a": {
                "Basic-Fit": 10,
                "JIMS": 7,
                "CK Fitness": 4,
            },
            "notes": [
                "Basic-Fit primary evidence: club-finder JSON-LD (10)",
                "JIMS Foetz renovating — COMING_SOON",
                "Painworld → JIMS Gasperich rebrand",
                "Border contamination risk HIGH (BE/FR/DE)",
            ],
        },
    )
    after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "sha_ok": after == EXPECTED_SHA,
                "class_a_openish": {
                    "Basic-Fit": 10,
                    "JIMS": 7,
                    "CK Fitness": 4,
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
