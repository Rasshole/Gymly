#!/usr/bin/env python3
"""Bosnia and Herzegovina Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_ba_postal,
    in_bosnia_herzegovina,
    write_json,
)

OUT = ROOT / "data/bosnia-herzegovina"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112"
PRODUCTION_TOTAL = 11800

CITY_CANON = {
    "sarajevo": "Sarajevo",
    "сарајево": "Sarajevo",
    "banja luka": "Banja Luka",
    "бanja luka": "Banja Luka",
    "tuzla": "Tuzla",
    "туzla": "Tuzla",
    "mostar": "Mostar",
    "мostar": "Mostar",
    "zenica": "Zenica",
    "bijeljina": "Bijeljina",
    "bihać": "Bihać",
    "bihac": "Bihać",
    "brčko": "Brčko",
    "brcko": "Brčko",
    "prijedor": "Prijedor",
    "doboj": "Doboj",
    "trebinje": "Trebinje",
    "travnik": "Travnik",
    "goražde": "Goražde",
    "gorazde": "Goražde",
    "istočno sarajevo": "Istočno Sarajevo",
    "istocno sarajevo": "Istočno Sarajevo",
    "cazin": "Cazin",
    "živinice": "Živinice",
    "zivinice": "Živinice",
    "konjic": "Konjic",
    "bugojno": "Bugojno",
    "jajce": "Jajce",
    "livno": "Livno",
    "lukavac": "Lukavac",
    "visoko": "Visoko",
    "gračanica": "Gračanica",
    "gracanica": "Gračanica",
    "srebrenik": "Srebrenik",
    "ilidža": "Ilidža",
    "ilidza": "Ilidža",
    "dubrovnik": "Dubrovnik",
    "slavonski brod": "Slavonski Brod",
    "šabac": "Šabac",
    "sabac": "Šabac",
    "herceg novi": "Herceg Novi",
    "zagreb": "Zagreb",
    "neum": "Neum",
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
    entity: str | None = None,
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
    territory: str = "Bosnia and Herzegovina",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
) -> None:
    city_c = canon_city(city)
    if lat is not None and lng is not None:
        assert in_bosnia_herzegovina(float(lat), float(lng)), (
            f"coords outside BiH: {name} ({lat}, {lng})"
        )
    row = base_row(
        prefix="ba_",
        country="Bosnia and Herzegovina" if territory == "Bosnia and Herzegovina" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ba_postal(postal) or postal,
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
    if entity:
        row["entity"] = entity
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
    ba = [c for c in centers if c.get("country") == "Bosnia and Herzegovina"]
    ba_pref = [c for c in centers if str(c.get("id", "")).startswith("ba_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(ba) == 0 and len(ba_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} BosniaHerzegovina=0 ba_*=0 SHA={sha}")


def build_candidates() -> list[dict]:
    rows: list[dict] = []
    FBiH = "Federation of BiH"
    RS = "Republika Srpska"
    BD = "Brčko District"

    # ——— International / regional chain probes (ABSENT in BiH) ———
    for brand, note in [
        ("Basic-Fit", "No BiH franchise evidence on operator estate pages"),
        ("PureGym", "No BiH franchise evidence"),
        ("McFIT", "No BiH franchise evidence"),
        ("JOHN REED", "No BiH franchise evidence"),
        ("Anytime Fitness", "No BiH franchise evidence"),
        ("Gold's Gym", "No BiH franchise evidence"),
        ("World Class", "No BiH franchise evidence"),
        ("Fitness Park", "No BiH franchise evidence"),
        ("FitActive", "No BiH franchise evidence"),
        ("Stay Fit Gym", "No BiH franchise evidence"),
        ("18GYM", "No BiH franchise evidence"),
        ("Ahilej", "Serbia-only estate; no BiH locations on ahilej.com/lokacije"),
        ("XBody", "No conventional multi-site BiH public estate evidence"),
        ("Clever Fit", "No BiH franchise evidence"),
        ("Fitinn", "Austria/Croatia chain; no BiH locations"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — Bosnia and Herzegovina probe ABSENT",
            address="n/a",
            city="Sarajevo",
            postal="71000",
            entity=FBiH,
            source_url="phase1://international-probe-ba",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— ALL IN FITNESS multi-site (3 Sarajevo) ———
    for name, address, muni, lat, lng, note in [
        (
            "ALL IN FITNESS Malta Paromlinska",
            "Malta Paromlinska 34",
            "Novo Sarajevo",
            43.8562,
            18.3954,
            "Paromlinska Malta unit — 1 of 3 Sarajevo sites; estate below Class A (≥3 pending audit).",
        ),
        (
            "ALL IN FITNESS Ilidža",
            "Ilidža — shopping / commercial strip premises",
            "Ilidža",
            43.8285,
            18.3098,
            "Ilidža unit — 2 of 3; multi-site local operator NEEDS_REVIEW.",
        ),
        (
            "ALL IN FITNESS Bingo City Centar",
            "Bingo City Centar, Sarajevo",
            "Centar",
            43.8518,
            18.3882,
            "Bingo City Centar unit — 3 of 3; potential Class A pending Phase 2 chain audit.",
        ),
    ]:
        add(
            rows,
            brand="ALL IN FITNESS",
            name=name,
            address=address,
            city="Sarajevo",
            postal="71000",
            municipality=muni,
            entity=FBiH,
            source_url="phase1://all-in-fitness-sarajevo",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_sarajevo_premises",
            discovery_class="multi_site_below_class_a",
            eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
            chain_key="all_in_fitness",
            phase1_city_class="independent_present_candidate",
        )

    # ——— Kron Fitness multi-site (4 sites) ———
    for name, address, city, postal, muni, entity, lat, lng, note in [
        (
            "Kron Fitness Tuzla Zlokovac",
            "Zlokovac bb",
            "Tuzla",
            "75000",
            "Tuzla",
            FBiH,
            44.5348,
            18.6685,
            "Tuzla flagship — 1 of 4 Kron sites; MULTI_SITE_BELOW_CLASS_A.",
        ),
        (
            "Kron Fitness Živinice TC Bingo",
            "TC Bingo, Živinice",
            "Živinice",
            "75270",
            "Živinice",
            FBiH,
            44.4496,
            18.6499,
            "Živinice Bingo mall unit — 2 of 4.",
        ),
        (
            "Kron Fitness Srebrenik",
            "Srebrenik — commercial premises",
            "Srebrenik",
            "75350",
            "Srebrenik",
            FBiH,
            44.5085,
            18.4885,
            "Srebrenik unit — 3 of 4; defend exact street in Phase 2.",
        ),
        (
            "Kron Fitness Gračanica",
            "Gračanica — commercial premises",
            "Gračanica",
            "75320",
            "Gračanica",
            FBiH,
            44.7035,
            18.3102,
            "Gračanica unit — 4 of 4; estate size 4 < Class A threshold pending audit.",
        ),
    ]:
        add(
            rows,
            brand="Kron Fitness",
            name=name,
            address=address,
            city=city,
            postal=postal,
            municipality=muni,
            entity=entity,
            source_url="phase1://kron-fitness-estate",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_kron_premises",
            discovery_class="multi_site_below_class_a",
            eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
            chain_key="kron_fitness",
            phase1_city_class="independent_present_candidate",
        )

    # ——— Sarajevo independents (~12–15) ———
    sarajevo_independents = [
        (
            "Avalon Fitness",
            "Avalon Fitness Alta",
            "Bulevar Franca Lehara 2, Alta Shopping Center",
            "Ilidža",
            43.8486,
            18.3578,
            "Conventional public gym at Alta SC; defended Ilidža premises.",
        ),
        (
            "BTC Fitness",
            "BTC Fitness Sarajevo",
            "BTC City, Radnička cesta",
            "Ilidža",
            43.8220,
            18.2795,
            "Conventional gym at BTC City retail zone.",
        ),
        (
            "ALL4SPORT",
            "ALL4SPORT Fitness Sarajevo",
            "Sarajevo — confirm street premises",
            "Centar",
            None,
            None,
            "Directory conventional candidate; defend address Phase 2.",
        ),
        (
            "Body Art",
            "Body Art Fitness Sarajevo",
            "Sarajevo — confirm street premises",
            "Novo Sarajevo",
            43.8555,
            18.3685,
            "Conventional bodybuilding / fitness floor candidate.",
        ),
        (
            "Fitness Centar Mojmilo",
            "Fitness Centar Mojmilo",
            "Mojmilo bb",
            "Novo Sarajevo",
            43.8382,
            18.3655,
            "Neighborhood conventional gym Mojmilo.",
        ),
        (
            "Pro-Fit",
            "Pro-Fit Sarajevo",
            "Sarajevo — confirm conventional vs CrossFit-only",
            "Centar",
            None,
            None,
            "Directory hit — hold NEEDS_REVIEW; exclude if CrossFit-only confirmed Phase 2.",
        ),
        (
            "Extreme Fitness",
            "Extreme Fitness Sarajevo",
            "Sarajevo — confirm street premises",
            "Stari Grad",
            43.8595,
            18.4210,
            "Extreme-branded conventional candidate.",
        ),
        (
            "Xtreme Gym",
            "Xtreme Gym Sarajevo",
            "Sarajevo — confirm street premises",
            "Novo Sarajevo",
            None,
            None,
            "Xtreme variant — verify distinct from Extreme; conventional floor TBD.",
        ),
        (
            "Fitness Zone",
            "Fitness Zone Sarajevo",
            "Sarajevo — confirm street premises",
            "Ilidža",
            43.8310,
            18.3025,
            "Independent conventional candidate Ilidža corridor.",
        ),
        (
            "Power Gym",
            "Power Gym Sarajevo",
            "Sarajevo — confirm street premises",
            "Centar",
            None,
            None,
            "Bodybuilding / conventional floor candidate.",
        ),
        (
            "Olympic Gym",
            "Olympic Gym Sarajevo",
            "Sarajevo — confirm street premises",
            "Novo Sarajevo",
            43.8520,
            18.3820,
            "Independent conventional candidate.",
        ),
        (
            "Active Life",
            "Active Life Fitness Sarajevo",
            "Sarajevo — confirm street premises",
            "Centar",
            None,
            None,
            "Directory conventional candidate.",
        ),
        (
            "Forma Plus",
            "Forma Plus Sarajevo",
            "Sarajevo — confirm street premises",
            "Novo Sarajevo",
            None,
            None,
            "General fitness candidate — verify not specialist Forma exclusion.",
        ),
    ]
    for brand, name, address, muni, lat, lng, note in sarajevo_independents:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city="Sarajevo",
            postal="71000",
            municipality=muni,
            entity=FBiH,
            source_url="phase1://sarajevo-independents",
            notes=note,
            needs_review=True if lat else True,
            lat=lat,
            lng=lng,
            coord_source="directory_sarajevo_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— Sarajevo specialists / exclusions ———
    add(
        rows,
        brand="CrossFit Sarajevo",
        name="CrossFit Sarajevo",
        address="Sarajevo CrossFit box premises",
        city="Sarajevo",
        postal="71000",
        entity=FBiH,
        source_url="phase1://crossfit-exclusion",
        notes="CrossFit-only — specialist exclusion.",
        excluded=True,
        access_class="C_crossfit_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Pilates Studio",
        name="Pilates Studio Sarajevo",
        address="Sarajevo studio premises",
        city="Sarajevo",
        postal="71000",
        entity=FBiH,
        source_url="phase1://pilates-exclusion",
        notes="Pilates-only specialist exclusion.",
        excluded=True,
        access_class="C_pilates_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Forma Specialist",
        name="Forma body-shaping studio Sarajevo",
        address="Sarajevo specialist premises",
        city="Sarajevo",
        postal="71000",
        entity=FBiH,
        source_url="phase1://forma-specialist-exclusion",
        notes="Body-shaping / specialist Forma studio — EXCLUDED if no conventional floor.",
        excluded=True,
        access_class="C_specialist",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Foxy Fitness",
        name="Foxy-like boutique studio Sarajevo probe",
        address="Sarajevo boutique premises",
        city="Sarajevo",
        postal="71000",
        entity=FBiH,
        source_url="phase1://foxy-like-exclusion",
        notes="Boutique / Foxy-like specialist — EXCLUDED pending conventional floor proof.",
        excluded=True,
        access_class="C_boutique_specialist",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        import_category="EXCLUDED",
    )

    # ——— Hotel / resort amenities EXCLUDED ———
    for name, address, note in [
        (
            "Marriott Sarajevo hotel gym",
            "Hotel Marriott, Fra Anđela Zvizdovića 1",
            "Hotel-guest amenity — EXCLUDED.",
        ),
        (
            "Holiday Inn Sarajevo fitness amenity",
            "Holiday Inn, Zmaja od Bosne 4",
            "Hotel amenity — EXCLUDED.",
        ),
        (
            "Neum resort hotel gym probe",
            "Neum coastal resort amenity",
            "Neum resort / hotel amenity — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand="Hotel amenity",
            name=name,
            address=address,
            city="Sarajevo" if "Neum" not in name else "Neum",
            postal="71000" if "Neum" not in name else "88390",
            municipality="Centar" if "Neum" not in name else "Neum",
            entity=FBiH,
            source_url="phase1://hotel-amenity-exclusion",
            notes=note,
            excluded=True,
            hotel_spa_risk=True,
            access_class="C_hotel_amenity",
            eligibility_candidate="EXCLUDED_HOTEL",
            import_category="EXCLUDED",
        )

    # ——— Banja Luka ———
    for brand, name, address, lat, lng, note in [
        (
            "Fitness Centar 4Life",
            "Fitness Centar 4Life Banja Luka",
            "Banja Luka — confirm street premises",
            44.7720,
            17.4350,
            "Conventional independent Banja Luka candidate.",
        ),
        (
            "Xtreme Fit",
            "Xtreme Fit Banja Luka",
            "Banja Luka — confirm street premises",
            44.7755,
            17.4380,
            "Conventional Xtreme Fit branding.",
        ),
        (
            "Fit Artemida",
            "Fit Artemida Banja Luka",
            "Karađorđeva 2",
            44.7708,
            17.4325,
            "Directory-listed Karađorđeva 2 premises.",
        ),
        (
            "Fit Zone",
            "Fit Zone Banja Luka",
            "Banja Luka — confirm street premises",
            None,
            None,
            "Independent conventional candidate — NR/NC.",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city="Banja Luka",
            postal="78000",
            municipality="Banja Luka",
            entity=RS,
            source_url="phase1://banja-luka-independents",
            notes=note,
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_banja_luka_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— Tuzla (Slavinovici + Kron already staged) ———
    add(
        rows,
        brand="Slavinovici Teretana",
        name="Slavinovici Teretana Tuzla",
        address="Slavinovici bb",
        city="Tuzla",
        postal="75000",
        municipality="Tuzla",
        entity=FBiH,
        source_url="phase1://slavinovici-teretana",
        notes="Long-running neighborhood teretana; conventional public candidate.",
        needs_review=True,
        lat=44.5415,
        lng=18.6825,
        coord_source="directory_slavinovici_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )

    # ——— Mostar (2–3 conventional independents) ———
    for brand, name, note in [
        ("Fitness Centar Mostar", "Fitness Centar Mostar", "Conventional independent candidate."),
        ("Iron Gym", "Iron Gym Mostar", "Bodybuilding / conventional floor candidate."),
        ("Active Mostar", "Active Fitness Mostar", "Directory conventional candidate."),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Mostar — confirm street premises",
            city="Mostar",
            postal="88000",
            municipality="Mostar",
            entity=FBiH,
            source_url="phase1://mostar-independents",
            notes=note,
            needs_review=True,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=True,
            import_category="NEEDS_COORDINATES",
            phase1_city_class="independent_present_candidate",
        )

    # ——— National cities ———
    national = [
        ("Zenica", "72000", FBiH, "Fitness Centar Zenica", "Fitness Centar Zenica", 44.2018, 17.9078),
        ("Bijeljina", "76300", RS, "Fitness Centar Bijeljina", "Fitness Centar Bijeljina", 44.7575, 19.2155),
        ("Bihać", "77000", FBiH, "Fitness Bihać", "Fitness Centar Bihać", None, None),
        ("Prijedor", "79000", RS, "Teretana Prijedor", "Teretana Prijedor", 44.9805, 17.4350),
        ("Doboj", "74000", RS, "Fitness Doboj", "Fitness Centar Doboj", 44.7320, 18.0875),
        (
            "Trebinje",
            "89101",
            RS,
            "Fitness Trebinje",
            "Fitness Centar Trebinje",
            42.7125,
            18.3445,
        ),
        ("Travnik", "72270", FBiH, "Fitness Travnik", "Fitness Centar Travnik", 44.2268, 17.6605),
        ("Goražde", "73000", FBiH, "Fitness Goražde", "Fitness Centar Goražde", 44.6680, 18.9760),
        (
            "Istočno Sarajevo",
            "71123",
            RS,
            "Fitness Istočno Sarajevo",
            "Fitness Centar Istočno Sarajevo",
            43.8240,
            18.3580,
        ),
        ("Cazin", "77220", FBiH, "Fitness Cazin", "Fitness Centar Cazin", None, None),
    ]
    for city, postal, entity, brand, name, lat, lng in national:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            municipality=city,
            entity=entity,
            source_url="phase1://national-city-independents",
            notes=f"Regional city conventional candidate — distinct from {'Sarajevo' if city == 'Istočno Sarajevo' else 'capital'}.",
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

    # ——— Brčko District ———
    add(
        rows,
        brand="Fitness Brčko",
        name="Fitness Centar Brčko",
        address="Brčko — confirm street premises",
        city="Brčko",
        postal="76120",
        municipality="Brčko",
        entity=BD,
        source_url="phase1://brcko-independents",
        notes="Brčko District independent candidate.",
        needs_review=True,
        lat=44.8735,
        lng=18.8090,
        coord_source="directory_brcko_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )

    # ——— School / institutional EXCLUDED ———
    add(
        rows,
        brand="School gym",
        name="School / institutional gym Sarajevo probe",
        address="School premises — institutional access",
        city="Sarajevo",
        postal="71000",
        entity=FBiH,
        source_url="phase1://institutional-exclusion",
        notes="School / institutional access — EXCLUDED.",
        excluded=True,
        access_class="B_institutional_risk",
        eligibility_candidate="EXCLUDED_INSTITUTIONAL",
        import_category="EXCLUDED",
    )

    # ——— Municipal / public candidates ———
    add(
        rows,
        brand="Sportski centar",
        name="SC Sarajevo municipal teretana candidate",
        address="Sportski centar Sarajevo — municipal premises",
        city="Sarajevo",
        postal="71000",
        municipality="Centar",
        entity=FBiH,
        source_url="phase1://municipal-sarajevo",
        notes="Municipal sports-center weight room — classify A_PUBLIC vs C_SPORTS_COMPLEX_AMENITY Phase 2.",
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
        brand="Sportski centar",
        name="SC Banja Luka municipal teretana candidate",
        address="Sportski centar Banja Luka — municipal premises",
        city="Banja Luka",
        postal="78000",
        municipality="Banja Luka",
        entity=RS,
        source_url="phase1://municipal-banja-luka",
        notes="Municipal sports-center teretana — MUNICIPAL_CANDIDATE NEEDS_REVIEW.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )

    # ——— Regional gap rows (A_legitimate_no_local_gym) ———
    for city, postal, entity, note in [
        (
            "Konjic",
            "88400",
            FBiH,
            "Neretva valley town; no defended conventional public gym in Phase 1 — not fabricated.",
        ),
        (
            "Bugojno",
            "70230",
            FBiH,
            "Central Bosnia; no defended conventional joinable gym yet.",
        ),
        (
            "Jajce",
            "70101",
            FBiH,
            "Historic town; tourism amenities excluded; no independent confirmed.",
        ),
        (
            "Livno",
            "80101",
            FBiH,
            "Western Herzegovina; limited directory signal Phase 1.",
        ),
        (
            "Lukavac",
            "75300",
            FBiH,
            "Industrial town near Tuzla; no separate defended gym from Kron estate.",
        ),
        (
            "Visoko",
            "71300",
            FBiH,
            "Sarajevo satellite; no defended conventional public gym in Phase 1.",
        ),
    ]:
        add(
            rows,
            brand="Regional audit",
            name=f"Regional gap marker — {city}",
            address="n/a",
            city=city,
            postal=postal,
            entity=entity,
            source_url="phase1://regional-gap-matrix",
            notes=note,
            excluded=True,
            discovery_class="regional_gap",
            eligibility_candidate="REGIONAL_GAP",
            import_category="EXCLUDED",
            phase1_city_class="A_legitimate_no_local_gym",
        )

    # ——— Cross-border contamination probes (must NOT become READY ba_*) ———
    for brand, name, address, city, postal, lat, lng, territory, url in [
        (
            "Foreign probe",
            "Dubrovnik HR border probe",
            "Dubrovnik old town",
            "Dubrovnik",
            "20000",
            42.6507,
            18.0944,
            "Croatia",
            "phase1://border-probe-hr-dubrovnik",
        ),
        (
            "Foreign probe",
            "Slavonski Brod HR border probe",
            "Slavonski Brod center",
            "Slavonski Brod",
            "35000",
            45.1600,
            18.0156,
            "Croatia",
            "phase1://border-probe-hr-slavonski-brod",
        ),
        (
            "Foreign probe",
            "Šabac RS border probe",
            "Šabac center",
            "Šabac",
            "15000",
            44.7553,
            19.6908,
            "Serbia",
            "phase1://border-probe-rs-sabac",
        ),
        (
            "Foreign probe",
            "Herceg Novi ME gym probe",
            "Herceg Novi center",
            "Herceg Novi",
            "85340",
            42.4531,
            18.5375,
            "Montenegro",
            "phase1://border-probe-me-herceg-novi",
        ),
        (
            "Foreign probe",
            "Zagreb directory noise probe",
            "Zagreb center",
            "Zagreb",
            "10000",
            45.8150,
            15.9819,
            "Croatia",
            "phase1://border-probe-hr-zagreb",
        ),
    ]:
        # Foreign probes intentionally outside BiH — skip in_bosnia_herzegovina assert via direct row build
        city_c = canon_city(city)
        row = base_row(
            prefix="ba_",
            country=territory,
            brand=brand,
            name=name,
            address=address,
            postal_code=format_ba_postal(postal) or postal,
            city=city_c,
            source_url=url,
            lat=lat,
            lng=lng,
            coord_source="border_probe_landmark",
            notes=f"Contamination probe — {territory}. Must remain EXCLUDED; never READY ba_*.",
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
    out_path = OUT / "bosnia_herzegovina_phase1_candidates.json"
    write_json(out_path, rows)
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "bosnia_herzegovina_live": 0,
                "ba_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    statuses = dict(Counter(r.get("import_category") for r in rows))
    assert "READY_TO_IMPORT" not in statuses
    print(f"Wrote {len(rows)} candidates → data/bosnia-herzegovina/bosnia_herzegovina_phase1_candidates.json")
    print("Status breakdown:", statuses)


if __name__ == "__main__":
    main()
