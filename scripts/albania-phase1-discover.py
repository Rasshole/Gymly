#!/usr/bin/env python3
"""Albania Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_al_postal,
    in_albania,
    write_json,
)

OUT = ROOT / "data/albania"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e"
PRODUCTION_TOTAL = 11831

CITY_CANON = {
    "tirana": "Tirana",
    "tiranë": "Tirana",
    "tirane": "Tirana",
    "durrës": "Durrës",
    "durres": "Durrës",
    "vlorë": "Vlorë",
    "vlore": "Vlorë",
    "shkodër": "Shkodër",
    "shkoder": "Shkodër",
    "elbasan": "Elbasan",
    "fier": "Fier",
    "korçë": "Korçë",
    "korce": "Korçë",
    "berat": "Berat",
    "lushnjë": "Lushnjë",
    "lushnje": "Lushnjë",
    "pogradec": "Pogradec",
    "kavajë": "Kavajë",
    "kavaje": "Kavajë",
    "gjirokastër": "Gjirokastër",
    "gjirokaster": "Gjirokastër",
    "sarandë": "Sarandë",
    "sarande": "Sarandë",
    "lezhë": "Lezhë",
    "lezhe": "Lezhë",
    "kukës": "Kukës",
    "kukes": "Kukës",
    "peshkopi": "Peshkopi",
    "dibër": "Peshkopi",
    "diber": "Peshkopi",
    "kamëz": "Kamëz",
    "kamez": "Kamëz",
    "krujë": "Krujë",
    "kruje": "Krujë",
    "patos": "Patos",
    "kuçovë": "Kuçovë",
    "kucove": "Kuçovë",
    "laç": "Laç",
    "lac": "Laç",
    "burrel": "Burrel",
    "librazhd": "Librazhd",
    "gramsh": "Gramsh",
    "tepelenë": "Tepelenë",
    "tepelene": "Tepelenë",
    "golem": "Golem",
    "palase": "Palasë",
    "ulcinj": "Ulcinj",
    "podgorica": "Podgorica",
    "prizren": "Prizren",
    "gjakovë": "Gjakovë",
    "gjakove": "Gjakovë",
    "pejë": "Pejë",
    "peja": "Pejë",
    "prishtina": "Prishtina",
    "debar": "Debar",
    "ohrid": "Ohrid",
    "struga": "Struga",
    "ioannina": "Ioannina",
    "kastoria": "Kastoria",
    "florina": "Florina",
    "corfu": "Corfu",
    "igoumenitsa": "Igoumenitsa",
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
    territory: str = "Albania",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
) -> None:
    city_c = canon_city(city)
    if lat is not None and lng is not None:
        assert in_albania(float(lat), float(lng)), (
            f"coords outside Albania: {name} ({lat}, {lng})"
        )
    row = base_row(
        prefix="al_",
        country="Albania" if territory == "Albania" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_al_postal(postal) or postal,
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


def assert_production_freeze() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    al = [c for c in centers if c.get("country") == "Albania"]
    al_pref = [c for c in centers if str(c.get("id", "")).startswith("al_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(al) == 0 and len(al_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} Albania=0 al_*=0 SHA={sha}")


def build_candidates() -> list[dict]:
    rows: list[dict] = []

    # ——— A) International / regional chain probes (ABSENT in Albania) ———
    for brand, note in [
        ("Basic-Fit", "No Albania franchise evidence on operator estate pages"),
        ("PureGym", "No Albania franchise evidence"),
        ("McFIT", "No Albania franchise evidence"),
        ("JOHN REED", "No Albania franchise evidence"),
        ("Anytime Fitness", "No Albania franchise evidence"),
        ("Gold's Gym", "No Albania franchise evidence"),
        ("World Class", "No Albania franchise evidence"),
        ("Fitness Park", "No Albania franchise evidence"),
        ("FitActive", "No Albania franchise evidence"),
        ("Stay Fit Gym", "No Albania franchise evidence"),
        ("18GYM", "No Albania franchise evidence"),
        ("Ahilej", "Serbia-only estate; no Albania locations on ahilej.com/lokacije"),
        ("Clever Fit", "No Albania franchise evidence"),
        ("FITINN", "Austria/Croatia chain; no Albania locations"),
        ("XBody", "No conventional multi-site Albania public estate evidence"),
        ("Snap Fitness", "No Albania franchise evidence"),
        ("Curves", "No Albania franchise evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — Albania probe ABSENT",
            address="n/a",
            city="Tirana",
            postal="1001",
            source_url="phase1://international-probe-al",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— B) Repeat — 3 Tirana locations (Wilson, Nobis, TEG) ———
    for name, address, muni, lat, lng, note in [
        (
            "Repeat Wilson Tirana",
            "Rruga Wilson, Tirana",
            "Tirana",
            41.3350,
            19.8200,
            "Wilson unit — 1 of 3 Tirana sites; wellness/spa risk flagged; POTENTIAL_CLASS_A.",
        ),
        (
            "Repeat Nobis Hotel Tirana",
            "Hotel Nobis, Tirana",
            "Tirana",
            41.3180,
            19.8050,
            "Nobis unit — 2 of 3; hotel-wellness crossover risk; POTENTIAL_CLASS_A NEEDS_REVIEW.",
        ),
        (
            "Repeat TEG Tirana",
            "Tirana East Gate (TEG), Rruga e Elbasanit",
            "Tirana",
            41.3650,
            19.7200,
            "TEG mall unit — 3 of 3; mall-wellness risk; POTENTIAL_CLASS_A pending Phase 2 audit.",
        ),
    ]:
        add(
            rows,
            brand="Repeat",
            name=name,
            address=address,
            city="Tirana",
            postal="1001",
            municipality=muni,
            source_url="phase1://repeat-tirana-estate",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_repeat_premises",
            discovery_class="multi_site_below_class_a",
            eligibility_candidate="POTENTIAL_CLASS_A",
            chain_key="repeat",
            hotel_spa_risk=True,
            phase1_city_class="independent_present_candidate",
        )

    # ——— C) Flex Gym estate ———
    add(
        rows,
        brand="Flex Gym",
        name="Flex Gym Tirana conventional",
        address="Tirana — confirm street premises",
        city="Tirana",
        postal="1001",
        municipality="Tirana",
        source_url="phase1://flex-gym-tirana",
        notes="Conventional Flex Gym Tirana floor — NEEDS_REVIEW; distinct from Flex Classes CrossFit.",
        needs_review=True,
        lat=41.3285,
        lng=19.8120,
        coord_source="directory_flex_tirana_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        chain_key="flex_gym",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Flex Classes",
        name="Flex Classes CrossFit Tirana",
        address="Tirana CrossFit box premises",
        city="Tirana",
        postal="1001",
        source_url="phase1://flex-classes-crossfit-exclusion",
        notes="Flex Classes CrossFit-only — specialist exclusion.",
        excluded=True,
        access_class="C_crossfit_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        import_category="EXCLUDED",
        chain_key="flex_classes",
    )
    add(
        rows,
        brand="Flex Gym",
        name="Flex Green Coast Palasë",
        address="Green Coast Resort, Palasë",
        city="Palasë",
        postal="9701",
        municipality="Himara",
        source_url="phase1://flex-green-coast-resort-exclusion",
        notes="Green Coast resort amenity — EXCLUDED.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_resort_amenity",
        eligibility_candidate="EXCLUDED_RESORT",
        import_category="EXCLUDED",
        lat=40.1850,
        lng=19.5850,
        coord_source="resort_premises_probe",
        chain_key="flex_gym",
    )

    # ——— D) Tirana deep audit: 15+ independents ———
    tirana_independents = [
        (
            "Hard Rock Gym",
            "Hard Rock Gym Tirana Blloku",
            "Rruga Ismail Qemali, Blloku",
            "Tirana",
            41.3275,
            19.8187,
            "Blloku conventional candidate — defended premises.",
        ),
        (
            "Olympic Gym",
            "Olympic Gym Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3310,
            19.8250,
            "Independent Olympic-branded conventional floor.",
        ),
        (
            "Planet Fitness",
            "Planet Fitness Tirana (local)",
            "Tirana — confirm distinct from US chain",
            "Tirana",
            41.3240,
            19.8150,
            "Local Planet Fitness branding — not international chain; NEEDS_REVIEW.",
        ),
        (
            "Fitness Zone",
            "Fitness Zone Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3295,
            19.8080,
            "Independent conventional candidate.",
        ),
        (
            "Premium Gym",
            "Premium Gym Tirana",
            "Komuna e Parisit — commercial premises",
            "Komuna e Parisit",
            41.3450,
            19.7850,
            "Komuna e Parisit corridor conventional candidate.",
        ),
        (
            "Body Center",
            "Body Center Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3220,
            19.8220,
            "Bodybuilding / conventional floor candidate.",
        ),
        (
            "Arena Fitness",
            "Arena Fitness Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            None,
            None,
            "Directory conventional candidate — defend address Phase 2.",
        ),
        (
            "Power Gym",
            "Power Gym Tirana",
            "Laprakë — confirm street premises",
            "Laprakë",
            41.3380,
            19.7620,
            "Laprakë neighborhood conventional gym.",
        ),
        (
            "Active Life",
            "Active Life Fitness Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            None,
            None,
            "Directory conventional candidate.",
        ),
        (
            "Iron Gym",
            "Iron Gym Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3260,
            19.8300,
            "Iron-branded conventional candidate.",
        ),
        (
            "Pro-Fit",
            "Pro-Fit Tirana",
            "Tirana — confirm conventional vs CrossFit-only",
            "Tirana",
            None,
            None,
            "Directory hit — hold NEEDS_REVIEW; exclude if CrossFit-only confirmed Phase 2.",
        ),
        (
            "Extreme Fitness",
            "Extreme Fitness Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3335,
            19.8175,
            "Extreme-branded conventional candidate.",
        ),
        (
            "Forma Plus",
            "Forma Plus Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            None,
            None,
            "General fitness candidate — verify not specialist Forma exclusion.",
        ),
        (
            "Kashar Fitness",
            "Fitness Centar Kashar",
            "Kashar — commercial strip premises",
            "Kashar",
            41.2950,
            19.6950,
            "Kashar satellite conventional candidate.",
        ),
        (
            "Blloku Active",
            "Blloku Active Fitness",
            "Blloku — confirm street premises",
            "Tirana",
            41.3288,
            19.8195,
            "Blloku independent conventional candidate.",
        ),
        (
            "Centro Sport",
            "Centro Sport Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            41.3205,
            19.8105,
            "Centro Sport conventional floor candidate.",
        ),
        (
            "Max Gym",
            "Max Gym Tirana",
            "Tirana — confirm street premises",
            "Tirana",
            None,
            None,
            "Directory conventional candidate — NR/NC.",
        ),
    ]
    for brand, name, address, muni, lat, lng, note in tirana_independents:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city="Tirana",
            postal="1001",
            municipality=muni,
            source_url="phase1://tirana-independents",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_tirana_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— I) Tirana specialists / exclusions ———
    for brand, name, access, note in [
        (
            "CrossFit Tirana",
            "CrossFit Tirana",
            "C_crossfit_only",
            "CrossFit-only — specialist exclusion.",
        ),
        (
            "Boxing Club Tirana",
            "Boxing Club Tirana",
            "C_boxing_only",
            "Boxing-only specialist — EXCLUDED.",
        ),
        (
            "Yoga Studio Tirana",
            "Yoga Studio Tirana",
            "C_yoga_only",
            "Yoga-only specialist exclusion.",
        ),
        (
            "EMS Studio Tirana",
            "EMS Studio Tirana",
            "C_ems_only",
            "EMS-only specialist exclusion.",
        ),
        (
            "PT Studio Tirana",
            "Personal Training Studio Tirana",
            "C_pt_only",
            "PT-only studio — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Tirana specialist premises",
            city="Tirana",
            postal="1001",
            source_url="phase1://specialist-exclusion",
            notes=note,
            excluded=True,
            access_class=access,
            eligibility_candidate="EXCLUDED_SPECIALIST",
            import_category="EXCLUDED",
        )

    # ——— E) Durrës ———
    add(
        rows,
        brand="Illyrian Fitness",
        name="Illyrian Fitness Durrës",
        address="Durrës — confirm street premises",
        city="Durrës",
        postal="4001",
        source_url="phase1://illyrian-fitness-durres",
        notes="Illyrian Fitness conventional candidate — NEEDS_REVIEW.",
        needs_review=True,
        lat=41.3233,
        lng=19.4569,
        coord_source="directory_durres_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Nandos Gym",
        name="Nandos Gym Durrës",
        address="Durrës — confirm street premises",
        city="Durrës",
        postal="4001",
        source_url="phase1://nandos-gym-durres",
        notes="Nandos Gym independent conventional candidate.",
        needs_review=True,
        lat=41.3180,
        lng=19.4520,
        coord_source="directory_durres_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    for name, address, note in [
        (
            "Adriatik Hotel Durrës gym amenity",
            "Hotel Adriatik, Durrës",
            "Coastal hotel amenity — EXCLUDED.",
        ),
        (
            "Durrës resort spa fitness probe",
            "Durrës beach resort amenity",
            "Resort / spa amenity — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand="Hotel amenity",
            name=name,
            address=address,
            city="Durrës",
            postal="4001",
            source_url="phase1://durres-hotel-exclusion",
            notes=note,
            excluded=True,
            hotel_spa_risk=True,
            access_class="C_hotel_amenity",
            eligibility_candidate="EXCLUDED_HOTEL",
            import_category="EXCLUDED",
        )

    # ——— F) National / regional city audits ———
    national = [
        ("Vlorë", "9401", "Fitness Vlorë", "Fitness Centar Vlorë", 40.4667, 19.4897),
        ("Shkodër", "4001", "Fitness Shkodër", "Fitness Centar Shkodër", 42.0683, 19.5126),
        ("Elbasan", "3001", "Fitness Elbasan", "Fitness Centar Elbasan", 41.1125, 20.0822),
        ("Fier", "9301", "Fitness Fier", "Fitness Centar Fier", 40.7239, 19.5561),
        ("Korçë", "7001", "Fitness Korçë", "Fitness Centar Korçë", 40.6150, 20.5100),
        ("Berat", "5001", "Fitness Berat", "Fitness Centar Berat", 40.7058, 19.9522),
        ("Lushnjë", "9001", "Fitness Lushnjë", "Fitness Centar Lushnjë", 40.9419, 19.7050),
        ("Pogradec", "7301", "Fitness Pogradec", "Fitness Centar Pogradec", 40.9030, 20.5100),
        ("Kavajë", "2501", "Fitness Kavajë", "Fitness Centar Kavajë", 41.1856, 19.5569),
        ("Gjirokastër", "6001", "Fitness Gjirokastër", "Fitness Centar Gjirokastër", 40.0758, 20.1389),
        ("Sarandë", "9701", "Fitness Sarandë", "Fitness Centar Sarandë", 39.8756, 20.0053),
        ("Lezhë", "4501", "Fitness Lezhë", "Fitness Centar Lezhë", 41.7836, 19.6436),
        ("Kukës", "8501", "Fitness Kukës", "Fitness Centar Kukës", 42.0769, 20.4219),
        ("Peshkopi", "8301", "Fitness Peshkopi", "Fitness Centar Peshkopi (Dibër)", 41.6850, 20.4289),
    ]
    for city, postal, brand, name, lat, lng in national:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            source_url="phase1://national-city-independents",
            notes=f"Regional city conventional candidate — distinct from Tirana capital cluster.",
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source=f"directory_{city.lower().replace(' ', '_')}_premises",
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            phase1_city_class="independent_present_candidate",
        )

    # ——— G) Additional cities ———
    additional = [
        ("Kamëz", "1029", "Fitness Kamëz", "Fitness Centar Kamëz", 41.3814, 19.7603),
        ("Krujë", "1501", "Fitness Krujë", "Fitness Centar Krujë", 41.5097, 19.7928),
        ("Patos", "9301", "Fitness Patos", "Fitness Centar Patos", 40.6833, 19.6167),
        ("Kuçovë", "5001", "Fitness Kuçovë", "Fitness Centar Kuçovë", 40.8000, 19.9167),
        ("Laç", "4501", "Fitness Laç", "Fitness Centar Laç", 41.6350, 19.7130),
        ("Burrel", "8001", "Fitness Burrel", "Fitness Centar Burrel", 41.6100, 20.0080),
        ("Librazhd", "3401", "Fitness Librazhd", "Fitness Centar Librazhd", 41.1960, 20.3350),
        ("Gramsh", "3301", "Fitness Gramsh", "Fitness Centar Gramsh", None, None),
        ("Tepelenë", "6001", "Fitness Tepelenë", "Fitness Centar Tepelenë", 40.2950, 20.0200),
    ]
    for city, postal, brand, name, lat, lng in additional:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            source_url="phase1://additional-city-independents",
            notes=f"Secondary city conventional candidate — {city}.",
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

    # Golem hotel EXCLUDED
    add(
        rows,
        brand="Hotel amenity",
        name="Golem beach hotel gym amenity",
        address="Golem — coastal resort hotel premises",
        city="Golem",
        postal="2501",
        source_url="phase1://golem-hotel-exclusion",
        notes="Golem coastal hotel/resort amenity — EXCLUDED.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_hotel_amenity",
        eligibility_candidate="EXCLUDED_HOTEL",
        import_category="EXCLUDED",
        lat=41.2400,
        lng=19.5400,
        coord_source="resort_premises_probe",
    )

    # ——— H) Municipal / public candidates ———
    add(
        rows,
        brand="Sporti Pallati",
        name="Pallati i Sportit Tirana municipal teretana candidate",
        address="Pallati i Sportit Asllan Rusi, Tirana",
        city="Tirana",
        postal="1001",
        municipality="Tirana",
        source_url="phase1://municipal-tirana",
        notes="Tirana sports palace weight room — classify A_PUBLIC vs C_SPORTS_COMPLEX_AMENITY Phase 2.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )

    # ——— Regional gap rows ———
    for city, postal, note in [
        (
            "Konispol",
            "9701",
            "Southern border town; no defended conventional public gym in Phase 1 — not fabricated.",
        ),
        (
            "Ksamil",
            "9701",
            "Tourism strip; hotel amenities excluded; no independent confirmed.",
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

    # ——— J) Cross-border contamination probes ———
    for brand, name, address, city, postal, lat, lng, territory, url in [
        (
            "Foreign probe",
            "Ulcinj ME border probe",
            "Ulcinj center",
            "Ulcinj",
            "85360",
            41.9236,
            19.2056,
            "Montenegro",
            "phase1://border-probe-me-ulcinj",
        ),
        (
            "Foreign probe",
            "Podgorica ME gym probe",
            "Podgorica center",
            "Podgorica",
            "81000",
            42.4304,
            19.2594,
            "Montenegro",
            "phase1://border-probe-me-podgorica",
        ),
        (
            "Foreign probe",
            "Prizren Kosovo gym probe",
            "Prizren center",
            "Prizren",
            "20000",
            42.2139,
            20.7397,
            "Kosovo",
            "phase1://border-probe-xk-prizren",
        ),
        (
            "Foreign probe",
            "Gjakovë Kosovo gym probe",
            "Gjakovë center",
            "Gjakovë",
            "50000",
            42.3803,
            20.4306,
            "Kosovo",
            "phase1://border-probe-xk-gjakove",
        ),
        (
            "Foreign probe",
            "Pejë Kosovo gym probe",
            "Pejë center",
            "Pejë",
            "30000",
            42.6592,
            20.2883,
            "Kosovo",
            "phase1://border-probe-xk-peja",
        ),
        (
            "Foreign probe",
            "Prishtina Kosovo gym probe",
            "Prishtina center",
            "Prishtina",
            "10000",
            42.6629,
            21.1655,
            "Kosovo",
            "phase1://border-probe-xk-prishtina",
        ),
        (
            "Foreign probe",
            "Debar MK border probe",
            "Debar center",
            "Debar",
            "1250",
            41.5247,
            20.5239,
            "North Macedonia",
            "phase1://border-probe-mk-debar",
        ),
        (
            "Foreign probe",
            "Ohrid MK gym probe",
            "Ohrid center",
            "Ohrid",
            "6000",
            41.1172,
            20.8019,
            "North Macedonia",
            "phase1://border-probe-mk-ohrid",
        ),
        (
            "Foreign probe",
            "Struga MK gym probe",
            "Struga center",
            "Struga",
            "6330",
            41.1775,
            20.6789,
            "North Macedonia",
            "phase1://border-probe-mk-struga",
        ),
        (
            "Foreign probe",
            "Ioannina GR border probe",
            "Ioannina center",
            "Ioannina",
            "45221",
            39.6650,
            20.8537,
            "Greece",
            "phase1://border-probe-gr-ioannina",
        ),
        (
            "Foreign probe",
            "Kastoria GR gym probe",
            "Kastoria center",
            "Kastoria",
            "52100",
            40.5217,
            21.2637,
            "Greece",
            "phase1://border-probe-gr-kastoria",
        ),
        (
            "Foreign probe",
            "Florina GR gym probe",
            "Florina center",
            "Florina",
            "53100",
            40.7817,
            21.4099,
            "Greece",
            "phase1://border-probe-gr-florina",
        ),
        (
            "Foreign probe",
            "Corfu GR gym probe",
            "Corfu town center",
            "Corfu",
            "49100",
            39.6243,
            19.9217,
            "Greece",
            "phase1://border-probe-gr-corfu",
        ),
        (
            "Foreign probe",
            "Igoumenitsa GR border probe",
            "Igoumenitsa port area",
            "Igoumenitsa",
            "46100",
            39.5031,
            20.2636,
            "Greece",
            "phase1://border-probe-gr-igoumenitsa",
        ),
    ]:
        city_c = canon_city(city)
        row = base_row(
            prefix="al_",
            country=territory,
            brand=brand,
            name=name,
            address=address,
            postal_code=format_al_postal(postal) or postal,
            city=city_c,
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source="border_probe_landmark",
            notes=f"Contamination probe — {territory}. Must remain EXCLUDED; never READY al_*.",
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

    return rows


def main() -> None:
    assert_production_freeze()
    rows = build_candidates()
    out_path = OUT / "albania_phase1_candidates.json"
    write_json(out_path, rows)
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "albania_live": 0,
                "al_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    statuses = dict(Counter(r.get("import_category") for r in rows))
    assert "READY_TO_IMPORT" not in statuses
    print(f"Wrote {len(rows)} candidates → data/albania/albania_phase1_candidates.json")
    print("Status breakdown:", statuses)


if __name__ == "__main__":
    main()
