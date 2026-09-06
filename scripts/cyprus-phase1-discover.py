#!/usr/bin/env python3
"""Cyprus Phase 1 discovery — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_cy_postal,
    write_json,
)

OUT = ROOT / "data/cyprus"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4"
PRODUCTION_TOTAL = 11648

CITY_CANON = {
    "nicosia": "Nicosia",
    "lefkosia": "Nicosia",
    "λευκωσία": "Nicosia",
    "strovolos": "Strovolos",
    "στρόβολος": "Strovolos",
    "engomi": "Engomi",
    "egkomi": "Engomi",
    "έγκωμη": "Engomi",
    "aglantzia": "Aglantzia",
    "αγλαντζιά": "Aglantzia",
    "lakatamia": "Lakatamia",
    "lakatameia": "Lakatamia",
    "limassol": "Limassol",
    "lemesos": "Limassol",
    "λεμεσός": "Limassol",
    "larnaca": "Larnaca",
    "larnaka": "Larnaca",
    "λάρνακα": "Larnaca",
    "aradippou": "Aradippou",
    "paphos": "Paphos",
    "pafos": "Paphos",
    "πάφος": "Paphos",
    "peyia": "Peyia",
    "pegeia": "Peyia",
    "paralimni": "Paralimni",
    "ayia napa": "Ayia Napa",
    "agia napa": "Ayia Napa",
    "protaras": "Protaras",
    "agios tychonas": "Agios Tychonas",
    "ayios tychonas": "Agios Tychonas",
    "germasogeia": "Germasogeia",
    "kyrenia": "Kyrenia",
    "girne": "Kyrenia",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or s


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
    needs_review: bool = False,
    needs_coords: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "A",
    territory: str = "Republic of Cyprus",
) -> None:
    row = base_row(
        prefix="cy_",
        country="Cyprus",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_cy_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("-", "_").replace("/", "_"),
    )
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif closed or import_category == "CLOSED":
        row["import_category"] = "CLOSED"
        row["is_closed"] = True
        row["is_active"] = False
    elif needs_coords or import_category == "NEEDS_COORDINATES":
        row["import_category"] = "NEEDS_COORDINATES"
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
    else:
        row["import_category"] = import_category or "READY_TO_IMPORT"
    rows.append(row)


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Cyprus") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("cy_")) == 0

    rows: list[dict] = []

    # ── Class A candidates / probes ─────────────────────────────────────
    # ALTERLIFE — official Cyprus estate = 1 (Nicosia franchise). Under ≥3.
    add(
        rows,
        brand="ALTERLIFE",
        name="ALTERLIFE Nicosia",
        address="Leoforos Strovolou 292",
        city="Strovolos",
        postal="2048",
        source_url="https://alterlife.gr/en/clubs/nicosia/",
        lat=35.1269456,
        lng=33.3235497,
        coord_source="NOMINATIM_ADDRESS",
        notes="Official alterlife.gr regional list: sole Cyprus franchise (ΛΕΥΚΩΣΙΑ ΚΥΠΡΟΣ). Under ≥3 Class A threshold.",
        excluded=True,
        operator_class="E",
        access_class="A_public_conventional",
        discovery_class="international_franchise_probe",
        chain_key="alterlife",
    )

    # Curves — official curves.gr Cyprus filter: Aglantzia + Larnaca only (2).
    add(
        rows,
        brand="Curves",
        name="Curves Aglantzia",
        address="Leoforos Larnakos 147B",
        city="Aglantzia",
        postal="2103",
        source_url="https://curves.gr/katastimata/aglantzia/",
        lat=35.1493373,
        lng=33.4105014,
        coord_source="NOMINATIM_ADDRESS",
        notes="Official curves.gr Cyprus estate club. Count=2 island-wide → under ≥3 Class A.",
        excluded=True,
        operator_class="E",
        discovery_class="women_circuit_franchise",
        chain_key="curves",
    )
    add(
        rows,
        brand="Curves",
        name="Curves Larnaca",
        address="Piliou Street 8, 3rd Floor",
        city="Larnaca",
        postal="6037",
        source_url="https://curves.gr/katastimata/larnaka/",
        lat=34.9156651,
        lng=33.6030268,
        coord_source="NOMINATIM_ADDRESS",
        notes="Official curves.gr Cyprus estate club.",
        excluded=True,
        operator_class="E",
        discovery_class="women_circuit_franchise",
        chain_key="curves",
    )
    # Historical Curves directory listings not on official sitemap → CLOSED/LEGACY probes
    for name, addr, city, postal, note in [
        (
            "Curves Paralimni (legacy directory)",
            "43 1st Apriliou Avenue",
            "Paralimni",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Limassol Mesa Geitonia (legacy directory)",
            "32 Grigori Afxentiou Street",
            "Limassol",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Limassol Araouzou (legacy directory)",
            "6 Andrea Araouzou Street",
            "Limassol",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Latsia (legacy directory)",
            "27 Ag. Georgiou Street",
            "Lakatamia",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Makedonitissa (legacy directory)",
            "87 Lykavitou Avenue",
            "Engomi",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Strovolos Ifigenias (legacy directory)",
            "23 Ifigenias Avenue, 2nd Floor",
            "Strovolos",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Paphos Vretakou (legacy directory)",
            "5 Nikiforou Vretakou",
            "Paphos",
            "8035",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
        (
            "Curves Chloraka (legacy directory)",
            "87 Eleftherias Avenue, 1st Floor",
            "Paphos",
            "",
            "cyprusbeauty.com directory only; absent from curves.gr sitemap 2026",
        ),
    ]:
        add(
            rows,
            brand="Curves",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url="https://www.cyprusbeauty.com/listings/name/curves",
            notes=note,
            closed=True,
            operator_class="E",
            discovery_class="legacy_directory",
            chain_key="curves",
        )

    # Sanctum Spa & Fitness — 3 Limassol sites; spa-first / amenity-adjacent.
    # Phase 2 must resolve whether conventional Class A gym chain or spa exclusion.
    add(
        rows,
        brand="Sanctum Spa & Fitness",
        name="Sanctum Limassol Marina",
        address="Limassol Marina",
        city="Limassol",
        postal="3014",
        source_url="https://sanctum.life/",
        lat=34.6696333,
        lng=33.0402159,
        coord_source="NOMINATIM_COMPLEX",
        notes="Public membership reported; spa+fitness brand. Policy: spas not Class A by default → NEEDS_REVIEW.",
        needs_review=True,
        operator_class="C",
        access_class="C_spa_amenity_borderline",
        discovery_class="spa_fitness_multi",
        chain_key="sanctum",
    )
    add(
        rows,
        brand="Sanctum Spa & Fitness",
        name="Sanctum at The Icon",
        address="The Icon residential tower",
        city="Limassol",
        postal="",
        source_url="https://sanctum.life/",
        lat=34.6969097,
        lng=33.0906193,
        coord_source="NOMINATIM_COMPLEX",
        notes="Residential-tower amenity fitness; public access unclear → NEEDS_REVIEW.",
        needs_review=True,
        operator_class="C",
        access_class="C_spa_amenity_borderline",
        discovery_class="spa_fitness_multi",
        chain_key="sanctum",
    )
    add(
        rows,
        brand="Sanctum Spa & Fitness",
        name="Sanctum at Sunset Gardens",
        address="Sunset Gardens (adj. City of Dreams)",
        city="Limassol",
        postal="",
        source_url="https://sanctum.life/",
        notes="Official site lists location; Nominatim pin unresolved → NEEDS_COORDINATES + review.",
        needs_review=True,
        needs_coords=True,
        operator_class="C",
        access_class="C_spa_amenity_borderline",
        discovery_class="spa_fitness_multi",
        chain_key="sanctum",
        import_category="NEEDS_REVIEW",
    )

    # Domestic singles / duals under threshold
    add(
        rows,
        brand="New Life Health Center",
        name="New Life Health Center Strovolos",
        address="Stadiou 47",
        city="Strovolos",
        postal="2058",
        source_url="https://newlife.com.cy/en/about-us/",
        lat=35.1520108,
        lng=33.3390933,
        coord_source="NOMINATIM_ADDRESS",
        notes="Single-site health centre / pool complex. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="independent_full_service",
    )
    add(
        rows,
        brand="Arise Active",
        name="Arise Active Aradippou",
        address="Acropoleos 23",
        city="Aradippou",
        postal="7101",
        source_url="https://www.ariseactive.eu/contact",
        notes="Official site single Larnaca-district club (ex DP Sports). Class E. Coords unresolved.",
        excluded=True,
        needs_coords=False,
        operator_class="E",
        discovery_class="independent_full_service",
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Athlesis",
        name="Athlesis Sporting Center Agios Tychonas",
        address="Georgiou Griva Digeni 20",
        city="Agios Tychonas",
        postal="4521",
        source_url="https://www.cyprusgym.com/athlesis-sporting-center",
        lat=34.7305506,
        lng=33.1460261,
        coord_source="NOMINATIM_ADDRESS",
        notes="Sporting centre; ~2 Athlesis-branded sites in Limassol. Under ≥3.",
        excluded=True,
        operator_class="E",
        discovery_class="sports_complex",
        access_class="E_sports_complex",
    )
    add(
        rows,
        brand="Athlesis",
        name="Arena Athlesis Limassol",
        address="Mesolongiou 23",
        city="Limassol",
        postal="3032",
        source_url="https://2gis.com.cy/cyprus/firm/13089115698282721",
        lat=34.6817298,
        lng=33.0470339,
        coord_source="NOMINATIM_ADDRESS",
        notes="Related Athlesis arena brand; still under ≥3 conventional gym chain bar.",
        excluded=True,
        operator_class="E",
        discovery_class="sports_complex",
        access_class="E_sports_complex",
    )
    add(
        rows,
        brand="Tower Fitness Center",
        name="Tower Fitness Center Peyia",
        address="Michalaki Kyprianou 82",
        city="Peyia",
        postal="8560",
        source_url="https://towerfitnesscenter.com/en/",
        lat=34.8709390,
        lng=32.3783221,
        coord_source="NOMINATIM_ADDRESS",
        notes="Single Paphos/Peyia club. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="independent_full_service",
    )
    add(
        rows,
        brand="Fitness Factory",
        name="Fitness Factory Nicosia Engomi",
        address="Pindou 4",
        city="Engomi",
        postal="2409",
        source_url="https://i-cyprus.com/company/528356",
        lat=35.1668109,
        lng=33.3280729,
        coord_source="NOMINATIM_ADDRESS",
        notes="Only confirmed Engomi site. GymNavigator multi-city claim unverified → B_discovery_gap Phase 2.",
        excluded=True,
        operator_class="E",
        discovery_class="domestic_probe",
    )
    add(
        rows,
        brand="Fitness One",
        name="Fitness One Lakatamia",
        address="Alkidamantos 5D",
        city="Lakatamia",
        postal="2325",
        source_url="https://i-cyprus.com/company/468810",
        lat=35.1116240,
        lng=33.3304482,
        coord_source="NOMINATIM_ADDRESS",
        notes="Company registry address only; multi-city claim unverified → B_discovery_gap Phase 2.",
        excluded=True,
        operator_class="E",
        discovery_class="domestic_probe",
    )
    add(
        rows,
        brand="Impulse Fitness",
        name="Impulse Fitness Strovolos",
        address="Zaimi 1",
        city="Strovolos",
        postal="2049",
        source_url="https://allaboutkids.com.cy/impulse-fintess/",
        notes="Single Nicosia club; martial-arts adjacent. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="independent_full_service",
    )
    add(
        rows,
        brand="UN1T",
        name="UN1T Limassol",
        address="45 Georgiou A Street, Germasogeia",
        city="Germasogeia",
        postal="4047",
        source_url="https://un1t.com/un1t-limassol/",
        notes="Global boutique S&C; single Cyprus studio. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="boutique_franchise_probe",
        access_class="E_boutique",
    )
    add(
        rows,
        brand="Machallekide Fitness",
        name="Machallekide Fitness and Dance",
        address="Agias Fylaxeos 316",
        city="Limassol",
        postal="3116",
        source_url="https://www.cyprusgyms.com/machallekide-fitness-and-dance",
        notes="Long-running independent Limassol club. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="independent_full_service",
    )
    add(
        rows,
        brand="Anaplasis Gym",
        name="Anaplasis Gym Limassol",
        address="Kanika Business Center, 28is Oktovriou 319A",
        city="Limassol",
        postal="3105",
        source_url="https://www.cyprusgyms.com/",
        notes="Independent Limassol club since 1993. Class E.",
        excluded=True,
        operator_class="E",
        discovery_class="independent_full_service",
    )

    # Hotel / Olympic Lagoon style — EXCLUDED
    add(
        rows,
        brand="Olympic Lagoon",
        name="Olympic Lagoon hotel gym (probe)",
        address="Olympic Lagoon resort",
        city="Ayia Napa",
        postal="",
        source_url="https://www.olympiclagoon.com/",
        notes="Hotel wellness — not conventional public chain. Class E.",
        excluded=True,
        operator_class="E",
        access_class="E_hotel_gym",
        discovery_class="hotel_probe",
    )

    # International chains — absent from RoC public estate
    for brand, note in [
        ("Anytime Fitness", "No verified RoC franchise clubs; unrelated CY company name exists."),
        ("Basic-Fit", "No Cyprus presence found."),
        ("McFIT", "No Cyprus presence found."),
        ("JOHN REED", "No Cyprus presence found."),
        ("Fitness First", "No Cyprus presence found."),
        ("Gold's Gym", "No Cyprus presence found."),
        ("World Class", "No Cyprus presence found."),
        ("clever fit", "No Cyprus presence found."),
        ("FITINN", "No Cyprus presence found."),
        ("JIMS", "No Cyprus presence found."),
        ("Keep Cool", "No Cyprus presence found."),
        ("Fitness Park", "No Cyprus presence found."),
        ("L'Orange Bleue", "No Cyprus presence found."),
        ("MyFitness", "No Cyprus presence found."),
        ("Lemon Gym", "No Cyprus presence found."),
        ("Gym!", "No Cyprus presence found."),
        ("Gym+", "No Cyprus presence found."),
        ("Impuls", "No Cyprus presence found (distinct from Impulse Fitness CY)."),
        ("24-7 Fitness", "No Cyprus presence found."),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} Cyprus (absent)",
            address="n/a",
            city="Nicosia",
            postal="",
            source_url="https://gymnavigator.com/gyms/cyprus/",
            notes=note,
            excluded=True,
            operator_class="E",
            discovery_class="international_absent",
        )

    # Northern Cyprus contamination probes (must never become READY)
    add(
        rows,
        brand="Lifezone Fitness",
        name="Lifezone Fitness Centre Karavas (Northern Cyprus)",
        address="Karavas",
        city="Kyrenia",
        postal="99350",
        source_url="https://gymnavigator.com/gyms/cyprus/",
        lat=35.34,
        lng=33.20,
        coord_source="DIRECTORY_ONLY",
        notes="TRNC / Northern Cyprus listing (Karavas 99350). HARD EXCLUDE.",
        excluded=True,
        operator_class="E",
        territory="Northern Cyprus / TRNC",
        access_class="E_territorial_exclusion",
        discovery_class="northern_cyprus_contamination",
    )
    add(
        rows,
        brand="Murat Gym",
        name="Murat Gym Girne (Northern Cyprus)",
        address="Uğur Mumcu Bulvarı",
        city="Kyrenia",
        postal="99320",
        source_url="https://gymnavigator.com/gyms/cyprus/",
        lat=35.341,
        lng=33.317,
        coord_source="DIRECTORY_ONLY",
        notes="Girne / Kyrenia TRNC listing. HARD EXCLUDE.",
        excluded=True,
        operator_class="E",
        territory="Northern Cyprus / TRNC",
        access_class="E_territorial_exclusion",
        discovery_class="northern_cyprus_contamination",
    )

    write_json(OUT / "cyprus_phase1_candidates.json", rows)
    write_json(
        OUT / "phase1" / "discovery_meta.json",
        {
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": sha,
            "cyprus_live": 0,
            "candidates": len(rows),
            "notes": "Phase 1 discovery only — no production merge.",
        },
    )
    print(f"Wrote {len(rows)} candidates; production SHA unchanged {sha}")


if __name__ == "__main__":
    main()
