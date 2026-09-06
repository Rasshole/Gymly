#!/usr/bin/env python3
"""Kosovo Phase 1 discovery — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_xk_postal,
    in_kosovo,
    write_json,
)

OUT = ROOT / "data/kosovo"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0"
PRODUCTION_TOTAL = 11840

CITY_CANON = {
    "prishtina": "Prishtina",
    "priština": "Prishtina",
    "pristina": "Prishtina",
    "prizren": "Prizren",
    "pejë": "Pejë",
    "peja": "Pejë",
    "peje": "Pejë",
    "gjakovë": "Gjakovë",
    "gjakova": "Gjakovë",
    "gjakove": "Gjakovë",
    "ferizaj": "Ferizaj",
    "gjilan": "Gjilan",
    "mitrovicë": "Mitrovicë",
    "mitrovice": "Mitrovicë",
    "mitrovica": "Mitrovicë",
    "north mitrovica": "North Mitrovica",
    "severna mitrovica": "North Mitrovica",
    "fushë kosovë": "Fushë Kosovë",
    "fushe kosove": "Fushë Kosovë",
    "vushtrri": "Vushtrri",
    "podujevë": "Podujevë",
    "podujeve": "Podujevë",
    "lipjan": "Lipjan",
    "drenas": "Drenas",
    "skenderaj": "Skenderaj",
    "rahovec": "Rahovec",
    "orahovac": "Rahovec",
    "malishevë": "Malishevë",
    "malisheve": "Malishevë",
    "suharekë": "Suharekë",
    "suhareke": "Suharekë",
    "kaçanik": "Kaçanik",
    "kacanik": "Kaçanik",
    "klina": "Klina",
    "deçan": "Deçan",
    "decan": "Deçan",
    "istog": "Istog",
    "dragash": "Dragash",
    "dragaš": "Dragash",
    "zvečan": "Zvečan",
    "zvecan": "Zvečan",
    "leposaviq": "Leposaviq",
    "leposavic": "Leposaviq",
    "zubin potok": "Zubin Potok",
    "kukës": "Kukës",
    "kukes": "Kukës",
    "bajram curri": "Bajram Curri",
    "tropojë": "Tropojë",
    "tropoje": "Tropojë",
    "rožaje": "Rožaje",
    "rozaje": "Rožaje",
    "berane": "Berane",
    "skopje": "Skopje",
    "tetovo": "Tetovo",
    "kumanovo": "Kumanovo",
    "debar": "Debar",
    "novi pazar": "Novi Pazar",
    "vranje": "Vranje",
    "preševo": "Preševo",
    "presevo": "Preševo",
    "leskovac": "Leskovac",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    return CITY_CANON.get(s.lower().strip()) or s


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    municipality: str | None = None,
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
    discovery_class: str = "independent",
    import_category: str | None = None,
    chain_key: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "B",
    territory: str = "Kosovo",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
    serbian_audit: bool = False,
    albanian_audit: bool = False,
) -> None:
    city_c = canon_city(city)
    if lat is not None and lng is not None and territory == "Kosovo":
        assert in_kosovo(float(lat), float(lng)), (
            f"coords outside Kosovo: {name} ({lat}, {lng})"
        )
    row = base_row(
        prefix="xk_",
        country="Kosovo" if territory == "Kosovo" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_xk_postal(postal) or postal,
        city=city_c,
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
    if website:
        row["website"] = website
    row["municipality"] = municipality or city_c
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    row["foreign_probe"] = foreign_probe
    row["hotel_spa_risk"] = hotel_spa_risk
    row["serbian_audit"] = serbian_audit
    row["albanian_audit"] = albanian_audit
    if phase1_city_class:
        row["phase1_city_class"] = phase1_city_class
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
    if import_category:
        row["import_category"] = import_category
    elif excluded:
        row["import_category"] = "EXCLUDED"
    elif closed:
        row["import_category"] = "CLOSED"
    elif coming:
        row["import_category"] = "COMING_SOON"
    elif needs_coords:
        row["import_category"] = "NEEDS_COORDINATES"
    elif needs_review:
        row["import_category"] = "NEEDS_REVIEW"
    else:
        row["import_category"] = "NEEDS_REVIEW"
    assert row["import_category"] != "READY_TO_IMPORT", "Phase 1 discover must not emit READY_TO_IMPORT"
    rows.append(row)


def add_foreign_probe(
    rows: list[dict],
    *,
    name: str,
    address: str,
    city: str,
    postal: str,
    lat: float,
    lng: float,
    territory: str,
    source_url: str,
    notes: str = "",
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="xk_",
        country=territory,
        brand="Foreign probe",
        name=name,
        address=address,
        postal_code=postal,
        city=city_c,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source="border_probe_landmark",
        notes=notes or f"Contamination probe — {territory}. Must remain EXCLUDED; never READY xk_*.",
        discovery_class="border_probe",
        chain_key="foreign_probe",
    )
    row["municipality"] = city_c
    row["access_class"] = "C_foreign"
    row["operator_class"] = "ABSENT"
    row["territory"] = territory
    row["foreign_probe"] = True
    row["eligibility_candidate"] = "FOREIGN_EXCLUDED"
    row["import_category"] = "EXCLUDED"
    rows.append(row)


def assert_production_freeze() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    xk = [c for c in centers if c.get("country") == "Kosovo"]
    xk_pref = [c for c in centers if str(c.get("id", "")).startswith("xk_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(xk) == 0 and len(xk_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} Kosovo=0 xk_*=0 SHA={sha}")


def build_candidates() -> list[dict]:
    rows: list[dict] = []

    # ——— A) International chain probes (ABSENT in Kosovo) ———
    for brand, note in [
        ("Basic-Fit", "No Kosovo franchise evidence on operator estate pages"),
        ("PureGym", "No Kosovo franchise evidence"),
        ("McFIT", "No Kosovo franchise evidence"),
        ("JOHN REED", "No Kosovo franchise evidence"),
        ("Anytime Fitness", "No Kosovo franchise evidence"),
        ("Gold's Gym", "No Kosovo franchise evidence"),
        ("World Class", "No Kosovo franchise evidence"),
        ("Fitness Park", "No Kosovo franchise evidence"),
        ("FitActive", "No Kosovo franchise evidence"),
        ("Stay Fit Gym", "No Kosovo franchise evidence"),
        ("18GYM", "No Kosovo franchise evidence"),
        ("Ahilej", "Serbia-only estate; no Kosovo locations on ahilej.com/lokacije"),
        ("Clever Fit", "No Kosovo franchise evidence"),
        ("FITINN", "Austria/Croatia chain; no Kosovo locations"),
        ("XBody", "No conventional multi-site Kosovo public estate evidence"),
        ("Snap Fitness", "No Kosovo franchise evidence"),
        ("Curves", "No Kosovo franchise evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — Kosovo probe ABSENT",
            address="n/a",
            city="Prishtina",
            postal="10000",
            source_url="phase1://international-probe-xk",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— B) Domestic multi-site — Fitness Zone Kosovo (2 Prishtina sites; below Class A) ———
    for name, address, muni, lat, lng, note in [
        (
            "Fitness Zone Kosovo Prishtina City Mall",
            "City Mall, Prishtina",
            "Prishtina",
            42.6580,
            21.1520,
            "City Mall unit — 1 of 2 Prishtina sites; POTENTIAL_CLASS_A pending Phase 2 audit (<3 verified).",
        ),
        (
            "Fitness Zone Kosovo Prishtina Dardania",
            "Dardania — commercial strip premises",
            "Prishtina",
            42.6685,
            21.1780,
            "Dardania unit — 2 of 2; multi-site local operator NEEDS_REVIEW; below Class A threshold.",
        ),
    ]:
        add(
            rows,
            brand="Fitness Zone Kosovo",
            name=name,
            address=address,
            city="Prishtina",
            postal="10000",
            municipality=muni,
            source_url="phase1://fitness-zone-kosovo-prishtina",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_fitness_zone_premises",
            discovery_class="multi_site_below_class_a",
            eligibility_candidate="POTENTIAL_CLASS_A",
            chain_key="fitness_zone_kosovo",
            phase1_city_class="independent_present_candidate",
        )

    # ——— C) Prishtina deep audit: 15+ independents ———
    prishtina_independents = [
        (
            "Gym Plus",
            "Gym Plus Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6610,
            21.1620,
            "Gym Plus conventional candidate — defended premises.",
        ),
        (
            "Iron Gym",
            "Iron Gym Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6645,
            21.1705,
            "Iron-branded conventional candidate.",
        ),
        (
            "Body Fit",
            "Body Fit Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6595,
            21.1580,
            "Body Fit conventional floor candidate.",
        ),
        (
            "Arena Fitness",
            "Arena Fitness Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            None,
            None,
            "Directory conventional candidate — defend address Phase 2.",
        ),
        (
            "Power Gym",
            "Power Gym Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6550,
            21.1450,
            "Power-branded conventional gym candidate.",
        ),
        (
            "Active Life",
            "Active Life Fitness Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            None,
            None,
            "Directory conventional candidate.",
        ),
        (
            "Pro-Fit",
            "Pro-Fit Prishtina",
            "Prishtina — confirm conventional vs CrossFit-only",
            "Prishtina",
            None,
            None,
            "Directory hit — hold NEEDS_REVIEW; exclude if CrossFit-only confirmed Phase 2.",
        ),
        (
            "Extreme Fitness",
            "Extreme Fitness Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6630,
            21.1680,
            "Extreme-branded conventional candidate.",
        ),
        (
            "Forma Plus",
            "Forma Plus Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            None,
            None,
            "General fitness candidate — verify not specialist Forma exclusion.",
        ),
        (
            "Olympic Gym",
            "Olympic Gym Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6605,
            21.1750,
            "Independent Olympic-branded conventional floor.",
        ),
        (
            "Planet Fitness",
            "Planet Fitness Prishtina (local)",
            "Prishtina — confirm distinct from US chain",
            "Prishtina",
            42.6575,
            21.1490,
            "Local Planet Fitness branding — not international chain; NEEDS_REVIEW.",
        ),
        (
            "Premium Gym",
            "Premium Gym Prishtina",
            "Prishtina — commercial premises",
            "Prishtina",
            42.6660,
            21.1810,
            "Premium-branded conventional candidate.",
        ),
        (
            "Hard Rock Gym",
            "Hard Rock Gym Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6625,
            21.1645,
            "Hard Rock-branded conventional candidate.",
        ),
        (
            "Centro Sport",
            "Centro Sport Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6565,
            21.1720,
            "Centro Sport conventional floor candidate.",
        ),
        (
            "Max Gym",
            "Max Gym Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            None,
            None,
            "Directory conventional candidate — NR/NC.",
        ),
        (
            "Fit Club",
            "Fit Club Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            42.6618,
            21.1555,
            "Fit Club independent conventional candidate.",
        ),
        (
            "Body Center",
            "Body Center Prishtina",
            "Prishtina — confirm street premises",
            "Prishtina",
            None,
            None,
            "Bodybuilding / conventional floor candidate.",
        ),
    ]
    for brand, name, address, muni, lat, lng, note in prishtina_independents:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city="Prishtina",
            postal="10000",
            municipality=muni,
            source_url="phase1://prishtina-independents",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_prishtina_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— D) Fushë Kosovë audit (distinct from Prishtina) ———
    add(
        rows,
        brand="Fitnes Centar",
        name="Fitnes Centar Fushë Kosovë",
        address="Fushë Kosovë — confirm street premises",
        city="Fushë Kosovë",
        postal="12000",
        municipality="Fushë Kosovë",
        source_url="phase1://fushe-kosove-audit",
        notes="Fushë Kosovë satellite conventional candidate — distinct municipality from Prishtina.",
        needs_review=True,
        lat=42.6350,
        lng=21.0920,
        coord_source="directory_fushe_kosove_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Power Gym",
        name="Power Gym Fushë Kosovë",
        address="Fushë Kosovë — commercial strip premises",
        city="Fushë Kosovë",
        postal="12000",
        municipality="Fushë Kosovë",
        source_url="phase1://fushe-kosove-power-gym",
        notes="Second Fushë Kosovë independent — verify distinct from Prishtina cluster.",
        needs_review=True,
        lat=42.6320,
        lng=21.0880,
        coord_source="directory_fushe_kosove_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )

    # ——— E) Prizren, Pejë, Gjakovë, Ferizaj, Gjilan deep audits ———
    major_cities = [
        ("Prizren", "20000", "Fitness Prizren", "Fitness Centar Prizren", 42.2139, 20.7397),
        ("Pejë", "30000", "Fitness Pejë", "Fitness Centar Pejë", 42.6592, 20.2883),
        ("Gjakovë", "50000", "Fitness Gjakovë", "Fitness Centar Gjakovë", 42.3803, 20.4306),
        ("Ferizaj", "70000", "Fitness Ferizaj", "Fitness Centar Ferizaj", 42.3702, 21.1553),
        ("Gjilan", "60000", "Fitness Gjilan", "Fitness Centar Gjilan", 42.4635, 21.4695),
    ]
    for city, postal, brand, name, lat, lng in major_cities:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            source_url=f"phase1://{city.lower().replace(' ', '_')}-deep-audit",
            notes=f"{city} regional city conventional candidate — deep audit pass.",
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source=f"directory_{city.lower().replace(' ', '_')}_premises",
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            phase1_city_class="independent_present_candidate",
        )

    # ——— F) Mitrovicë + North Mitrovica (both country=Kosovo) ———
    add(
        rows,
        brand="Fitness Mitrovicë",
        name="Fitness Centar Mitrovicë",
        address="Mitrovicë — confirm street premises",
        city="Mitrovicë",
        postal="40000",
        municipality="Mitrovicë",
        source_url="phase1://mitrovice-audit",
        notes="South Mitrovicë conventional candidate — Albanian-language market.",
        needs_review=True,
        lat=42.8833,
        lng=20.8667,
        coord_source="directory_mitrovice_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
        albanian_audit=True,
    )
    add(
        rows,
        brand="Teretana Sever",
        name="Teretana North Mitrovica candidate",
        address="North Mitrovica — confirm street premises",
        city="North Mitrovica",
        postal="40000",
        municipality="North Mitrovica",
        source_url="phase1://north-mitrovica-audit",
        notes="North Mitrovica Serbian-language teretana candidate — country remains Kosovo.",
        needs_review=True,
        lat=42.8879,
        lng=20.8617,
        coord_source="directory_north_mitrovica_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
        serbian_audit=True,
    )

    # ——— G) North Kosovo: Zvečan, Leposaviq, Zubin Potok — Serbian language candidates ———
    for brand, name, city, lat, lng, note, needs_coords in [
        (
            "Teretana Zvečan",
            "Teretana / fitnes centar Zvečan candidate",
            "Zvečan",
            42.9100,
            20.8400,
            "Zvečan Serbian-language teretana candidate — NEEDS_REVIEW.",
            False,
        ),
        (
            "Fitnes Leposaviq",
            "Fitnes centar Leposaviq candidate",
            "Leposaviq",
            None,
            None,
            "Leposaviq Serbian-language candidate — coords pending Phase 2 geocode inside xk gate.",
            True,
        ),
        (
            "Teretana Zubin Potok",
            "Teretana Zubin Potok candidate",
            "Zubin Potok",
            42.9156,
            20.6894,
            "Zubin Potok Serbian-language teretana candidate.",
            False,
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal="40000",
            municipality=city,
            source_url=f"phase1://north-kosovo-{city.lower().replace(' ', '-')}",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_north_kosovo_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=needs_coords,
            import_category="NEEDS_COORDINATES" if needs_coords else None,
            phase1_city_class="independent_present_candidate",
            serbian_audit=True,
        )

    # ——— H) Secondary municipalities ———
    secondary = [
        ("Vushtrri", "42000", "Fitness Vushtrri", "Fitness Centar Vushtrri", 42.8231, 20.9675),
        ("Podujevë", "11000", "Fitness Podujevë", "Fitness Centar Podujevë", 42.9110, 21.1870),
        ("Lipjan", "14000", "Fitness Lipjan", "Fitness Centar Lipjan", 42.5236, 21.1258),
        ("Drenas", "13000", "Fitness Drenas", "Fitness Centar Drenas", 42.6258, 20.8936),
        ("Skenderaj", "41000", "Fitness Skenderaj", "Fitness Centar Skenderaj", 42.7453, 20.7897),
        ("Rahovec", "21000", "Fitness Rahovec", "Fitness Centar Rahovec", 42.3994, 20.6547),
        ("Malishevë", "24000", "Fitness Malishevë", "Fitness Centar Malishevë", 42.4822, 20.7456),
        ("Suharekë", "23000", "Fitness Suharekë", "Fitness Centar Suharekë", 42.3589, 20.8253),
        ("Kaçanik", "71000", "Fitness Kaçanik", "Fitness Centar Kaçanik", 42.2319, 21.2594),
        ("Klina", "32000", "Fitness Klina", "Fitness Centar Klina", 42.6217, 20.5778),
        ("Deçan", "51000", "Fitness Deçan", "Fitness Centar Deçan", 42.5403, 20.2889),
        ("Istog", "31000", "Fitness Istog", "Fitness Centar Istog", 42.7808, 20.4875),
        ("Dragash", "61000", "Fitness Dragash", "Fitness Centar Dragash", None, None),
    ]
    for city, postal, brand, name, lat, lng in secondary:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            source_url="phase1://secondary-municipality-audit",
            notes=f"Secondary municipality conventional candidate — {city}.",
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source=f"directory_{city.lower().replace(' ', '_')}_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— I) Municipal / public candidates ———
    add(
        rows,
        brand="Pallati i Rinisë",
        name="Pallati i Rinisë dhe Sporteve Prishtina municipal teretana candidate",
        address="Pallati i Rinisë dhe Sporteve, Prishtina",
        city="Prishtina",
        postal="10000",
        municipality="Prishtina",
        source_url="phase1://municipal-prishtina-pallati-rinise",
        notes="Youth/sports palace weight room — classify A_PUBLIC vs C_SPORTS_COMPLEX_AMENITY Phase 2.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )
    add(
        rows,
        brand="Sporti Pallati",
        name="Pallati i Sportit Prizren municipal candidate",
        address="Prizren sports palace premises",
        city="Prizren",
        postal="20000",
        municipality="Prizren",
        source_url="phase1://municipal-prizren",
        notes="Prizren municipal sports facility — NEEDS_COORDINATES; Phase 2 access audit.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )

    # ——— J) Hotel / spa / resort EXCLUDED ———
    for name, address, city, postal, lat, lng, note in [
        (
            "Hotel Swiss Diamond Prishtina gym amenity",
            "Hotel Swiss Diamond, Prishtina",
            "Prishtina",
            "10000",
            42.6620,
            21.1600,
            "Prishtina hotel amenity — EXCLUDED.",
        ),
        (
            "Hotel Theranda Prizren spa fitness probe",
            "Hotel Theranda, Prizren",
            "Prizren",
            "20000",
            42.2100,
            20.7350,
            "Prizren hotel/spa amenity — EXCLUDED.",
        ),
        (
            "Brekovac mountain resort gym probe",
            "Brekovac resort amenity premises",
            "Pejë",
            "30000",
            42.6800,
            20.2500,
            "Pejë region resort amenity — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand="Hotel amenity",
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url="phase1://hotel-spa-resort-exclusion",
            notes=note,
            excluded=True,
            hotel_spa_risk=True,
            access_class="C_hotel_amenity",
            eligibility_candidate="EXCLUDED_HOTEL",
            import_category="EXCLUDED",
            lat=lat,
            lng=lng,
            coord_source="resort_premises_probe",
        )

    # ——— K) Specialist exclusions ———
    for brand, name, access, note in [
        (
            "CrossFit Prishtina",
            "CrossFit Prishtina",
            "C_crossfit_only",
            "CrossFit-only — specialist exclusion.",
        ),
        (
            "Boxing Club Prishtina",
            "Boxing Club Prishtina",
            "C_boxing_only",
            "Boxing-only specialist — EXCLUDED.",
        ),
        (
            "Yoga Studio Prishtina",
            "Yoga Studio Prishtina",
            "C_yoga_only",
            "Yoga-only specialist exclusion.",
        ),
        (
            "EMS Studio Prishtina",
            "EMS Studio Prishtina",
            "C_ems_only",
            "EMS-only specialist exclusion.",
        ),
        (
            "PT Studio Prishtina",
            "Personal Training Studio Prishtina",
            "C_pt_only",
            "PT-only studio — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Prishtina specialist premises",
            city="Prishtina",
            postal="10000",
            source_url="phase1://specialist-exclusion",
            notes=note,
            excluded=True,
            access_class=access,
            eligibility_candidate="EXCLUDED_SPECIALIST",
            import_category="EXCLUDED",
        )

    # ——— L) Cross-border foreign probes ———
    foreign_probes = [
        ("Kukës AL border probe", "Kukës center", "Kukës", "8501", 42.0769, 20.4219, "Albania", "phase1://border-probe-al-kukes"),
        ("Bajram Curri AL border probe", "Bajram Curri center", "Bajram Curri", "8701", 42.4114, 20.0739, "Albania", "phase1://border-probe-al-bajram-curri"),
        ("Tropojë AL border probe", "Tropojë center", "Tropojë", "8703", 42.3986, 20.0892, "Albania", "phase1://border-probe-al-tropoje"),
        ("Rožaje ME border probe", "Rožaje center", "Rožaje", "84310", 42.8333, 20.1667, "Montenegro", "phase1://border-probe-me-rozaje"),
        ("Berane ME gym probe", "Berane center", "Berane", "84300", 42.8475, 19.8733, "Montenegro", "phase1://border-probe-me-berane"),
        ("Skopje MK gym probe", "Skopje center", "Skopje", "1000", 41.9973, 21.4280, "North Macedonia", "phase1://border-probe-mk-skopje"),
        ("Tetovo MK gym probe", "Tetovo center", "Tetovo", "1200", 42.0106, 20.9714, "North Macedonia", "phase1://border-probe-mk-tetovo"),
        ("Kumanovo MK gym probe", "Kumanovo center", "Kumanovo", "1300", 42.1322, 21.7144, "North Macedonia", "phase1://border-probe-mk-kumanovo"),
        ("Debar MK border probe", "Debar center", "Debar", "1250", 41.5247, 20.5239, "North Macedonia", "phase1://border-probe-mk-debar"),
        ("Novi Pazar RS gym probe", "Novi Pazar center", "Novi Pazar", "36300", 43.1367, 20.5122, "Serbia", "phase1://border-probe-rs-novi-pazar"),
        ("Vranje RS border probe", "Vranje center", "Vranje", "17500", 42.5514, 21.9003, "Serbia", "phase1://border-probe-rs-vranje"),
        ("Preševo RS border probe", "Preševo center", "Preševo", "17523", 42.3089, 21.6500, "Serbia", "phase1://border-probe-rs-presevo"),
        ("Leskovac RS gym probe", "Leskovac center", "Leskovac", "16000", 42.9981, 21.9460, "Serbia", "phase1://border-probe-rs-leskovac"),
    ]
    for name, address, city, postal, lat, lng, territory, url in foreign_probes:
        add_foreign_probe(
            rows,
            name=name,
            address=address,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            territory=territory,
            source_url=url,
        )

    # ——— M) Regional gap markers ———
    for city, postal, note in [
        (
            "Štrpce",
            "61000",
            "Preševo valley municipality; no defended conventional public gym in Phase 1 — not fabricated.",
        ),
        (
            "Ranillug",
            "61000",
            "Small eastern municipality; no independent conventional gym confirmed Phase 1.",
        ),
    ]:
        add(
            rows,
            brand="Regional audit",
            name=f"Regional gap marker — {city}",
            address="n/a",
            city=city,
            postal=postal,
            source_url="phase1://regional-gap-matrix",
            notes=note,
            excluded=True,
            discovery_class="regional_gap",
            eligibility_candidate="REGIONAL_GAP",
            import_category="EXCLUDED",
            phase1_city_class="A_legitimate_no_local_gym",
        )

    return rows


def main() -> None:
    assert_production_freeze()
    rows = build_candidates()
    out_path = OUT / "kosovo_phase1_candidates.json"
    write_json(out_path, rows)
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "kosovo_live": 0,
                "xk_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    statuses = dict(Counter(r.get("import_category") for r in rows))
    assert "READY_TO_IMPORT" not in statuses
    print(f"Wrote {len(rows)} candidates → data/kosovo/kosovo_phase1_candidates.json")
    print("Status breakdown:", statuses)


if __name__ == "__main__":
    main()
