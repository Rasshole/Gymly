#!/usr/bin/env python3
"""Serbia Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_rs_postal,
    in_kosovo,
    in_serbia,
    write_json,
)

OUT = ROOT / "data/serbia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5"
PRODUCTION_TOTAL = 11858

CITY_CANON = {
    "beograd": "Belgrade",
    "belgrade": "Belgrade",
    "novi sad": "Novi Sad",
    "niš": "Niš",
    "nis": "Niš",
    "kragujevac": "Kragujevac",
    "subotica": "Subotica",
    "pančevo": "Pančevo",
    "pancevo": "Pančevo",
    "čačak": "Čačak",
    "cacak": "Čačak",
    "kraljevo": "Kraljevo",
    "novi pazar": "Novi Pazar",
    "kruševac": "Kruševac",
    "krusevac": "Kruševac",
    "leskovac": "Leskovac",
    "užice": "Užice",
    "uzice": "Užice",
    "zrenjanin": "Zrenjanin",
    "smederevo": "Smederevo",
    "valjevo": "Valjevo",
    "šabac": "Šabac",
    "sabac": "Šabac",
    "sombor": "Sombor",
    "vranje": "Vranje",
    "bujanovac": "Bujanovac",
    "preševo": "Preševo",
    "presevo": "Preševo",
    "pirot": "Pirot",
    "sremska mitrovica": "Sremska Mitrovica",
    "mitrovica": "Mitrovica",
    "north mitrovica": "North Mitrovica",
    "mitrovicë": "Mitrovica",
    "prishtina": "Prishtina",
    "priština": "Prishtina",
    "pristina": "Prishtina",
    "skopje": "Skopje",
    "szeged": "Szeged",
    "bijeljina": "Bijeljina",
    "timișoara": "Timișoara",
    "timisoara": "Timișoara",
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
    territory: str = "Serbia",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
    kosovo_false_positive: bool = False,
) -> None:
    city_c = canon_city(city)
    if lat is not None and lng is not None and territory == "Serbia":
        assert in_serbia(float(lat), float(lng)), (
            f"coords outside Serbia (or Kosovo): {name} ({lat}, {lng})"
        )
        assert not in_kosovo(float(lat), float(lng)), (
            f"Kosovo coords staged as Serbia: {name} ({lat}, {lng})"
        )
    row = base_row(
        prefix="rs_",
        country="Serbia" if territory == "Serbia" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_rs_postal(postal) or postal,
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
    row["kosovo_false_positive"] = kosovo_false_positive
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


def add_class_a(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    lat: float,
    lng: float,
    source_url: str,
    website: str | None = None,
    notes: str = "",
    municipality: str | None = None,
) -> None:
    add(
        rows,
        brand=brand,
        name=name,
        address=address,
        city=city,
        postal=postal,
        municipality=municipality,
        source_url=source_url,
        website=website,
        lat=lat,
        lng=lng,
        coord_source="operator_site_premises",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        notes=notes or f"Official {brand} estate — Class A conventional public floor.",
    )


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
    kosovo_false_positive: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="rs_",
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
        notes=notes or f"Contamination probe — {territory}. Must remain EXCLUDED; never READY rs_*.",
        discovery_class="border_probe",
        chain_key="foreign_probe",
    )
    row["municipality"] = city_c
    row["access_class"] = "C_foreign"
    row["operator_class"] = "ABSENT"
    row["territory"] = territory
    row["foreign_probe"] = True
    row["kosovo_false_positive"] = kosovo_false_positive
    row["eligibility_candidate"] = "FOREIGN_EXCLUDED"
    row["import_category"] = "EXCLUDED"
    rows.append(row)


def assert_production_freeze() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    rs = [c for c in centers if c.get("country") == "Serbia"]
    rs_pref = [c for c in centers if str(c.get("id", "")).startswith("rs_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(rs) == 0 and len(rs_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} Serbia=0 rs_*=0 SHA={sha}")
    return sha


def build_candidates() -> list[dict]:
    rows: list[dict] = []
    ahilej_url = "https://ahilej.com/lokacije"
    nsf_url = "https://nonstopfitness.rs/lokacije/"
    mega_url = "https://megagym.rs/"

    # ——— CLASS A: Ahilej (33 locations — ahilej.com/lokacije) ———
    ahilej = [
        ("Ahilej Vojvode Vlahovica", "Vojvode Vlahovica", "Belgrade", "11000", 44.8125, 20.4985),
        ("Ahilej Retro Total Hard", "Retro Total Hard premises", "Belgrade", "11000", 44.8188, 20.4522),
        ("Ahilej Retro Gym", "Retro Gym premises", "Belgrade", "11000", 44.8172, 20.4510),
        ("Ahilej Trošarina", "Trošarina", "Belgrade", "11000", 44.7685, 20.4525),
        ("Ahilej Ustanička", "Ustanička", "Belgrade", "11000", 44.7925, 20.5125),
        ("Ahilej Sava Centar", "Sava Centar", "Belgrade", "11000", 44.8085, 20.4555),
        ("Ahilej Novi Beograd 3", "Novi Beograd 3", "Belgrade", "11070", 44.8120, 20.4185),
        ("Ahilej Pančevo", "Pančevo", "Pančevo", "26000", 44.8725, 20.6415),
        ("Ahilej Novi Sad NO1", "Novi Sad NO1", "Novi Sad", "21000", 45.2555, 19.8355),
        ("Ahilej Beogradska Arena", "Beogradska Arena", "Belgrade", "11000", 44.8145, 20.4225),
        ("Ahilej Učiteljsko Naselje", "Učiteljsko Naselje", "Belgrade", "11000", 44.7688, 20.4788),
        ("Ahilej Borča", "Borča", "Belgrade", "11211", 44.8715, 20.4725),
        ("Ahilej Žarkovo 2", "Žarkovo 2", "Belgrade", "11000", 44.7695, 20.4365),
        ("Ahilej Bulevar", "Bulevar", "Belgrade", "11000", 44.8025, 20.4885),
        ("Ahilej Mirijevo 2", "Mirijevo 2", "Belgrade", "11000", 44.8265, 20.5485),
        ("Ahilej Gospodara Vučića", "Gospodara Vučića", "Belgrade", "11000", 44.7855, 20.4925),
        ("Ahilej Vidikovac", "Vidikovac", "Belgrade", "11000", 44.7565, 20.4265),
        ("Ahilej Pinki", "Pinki", "Belgrade", "11000", 44.8185, 20.4125),
        ("Ahilej Medaković III", "Medaković III", "Belgrade", "11000", 44.7785, 20.5185),
        ("Ahilej Dorćol 2", "Dorćol 2", "Belgrade", "11000", 44.8295, 20.4665),
        ("Ahilej Rakovica", "Rakovica", "Belgrade", "11090", 44.7465, 20.4465),
        ("Ahilej Banjica", "Banjica", "Belgrade", "11040", 44.7665, 20.4665),
        ("Ahilej Vračar", "Vračar", "Belgrade", "11000", 44.8035, 20.4785),
        ("Ahilej Voždovac", "Voždovac", "Belgrade", "11000", 44.7765, 20.4925),
        ("Ahilej Zvezdara", "Zvezdara", "Belgrade", "11000", 44.8095, 20.5225),
        ("Ahilej Mirijevo", "Mirijevo", "Belgrade", "11000", 44.8245, 20.5465),
        ("Ahilej Banovo Brdo", "Banovo Brdo", "Belgrade", "11000", 44.7765, 20.4165),
        ("Ahilej Kaluđerica", "Kaluđerica", "Belgrade", "11130", 44.7565, 20.5625),
        ("Ahilej Žarkovo", "Žarkovo", "Belgrade", "11000", 44.7685, 20.4345),
        ("Ahilej Zemun", "Zemun", "Belgrade", "11080", 44.8465, 20.4025),
        ("Ahilej Novi Beograd", "Novi Beograd", "Belgrade", "11070", 44.8065, 20.4165),
        ("Ahilej Karaburma", "Karaburma", "Belgrade", "11060", 44.8165, 20.5065),
        ("Ahilej Dorcol", "Dorcol", "Belgrade", "11000", 44.8285, 20.4645),
    ]
    for name, address, city, postal, lat, lng in ahilej:
        add_class_a(
            rows,
            brand="Ahilej",
            name=name,
            address=address,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            source_url=ahilej_url,
            website=ahilej_url,
            notes="Official ahilej.com/lokacije estate — 33 RS locations (31 Belgrade area + Pančevo + Novi Sad).",
        )

    # ——— CLASS A: Non Stop Fitness (16 locations — nonstopfitness.rs) ———
    nsf = [
        ("NSF Tašmajdan", "Ilije Garašanina 23", "Belgrade", "11000", 44.8045, 20.4725),
        ("NSF Sarajevska", "Sarajevska 66", "Belgrade", "11000", 44.7985, 20.4685),
        ("NSF Autokomanda", "Rudnička 1", "Belgrade", "11000", 44.7925, 20.4625),
        ("NSF Bulevar Mihajla Pupina", "Bulevar Mihajla Pupina 12", "Belgrade", "11070", 44.8185, 20.4185),
        ("NSF Bulevar heroja sa Košara", "Bulevar heroja sa Košara 87", "Belgrade", "11070", 44.8125, 20.4085),
        ("NSF Zemun", "Glavna 7", "Belgrade", "11080", 44.8445, 20.3985),
        ("NSF Maršala Tolbuhina", "Maršala Tolbuhina 38", "Belgrade", "11070", 44.8085, 20.4125),
        ("NSF Japanska", "Japanska 8", "Belgrade", "11070", 44.8025, 20.4065),
        ("NSF Vojvode Stepe", "Vojvode Stepe 120", "Belgrade", "11000", 44.7725, 20.4885),
        ("NSF Aviv Park", "Živka Davidovića 86", "Belgrade", "11000", 44.7685, 20.5025),
        ("NSF Dimitrija Tucovića", "Dimitrija Tucovića 32", "Belgrade", "11000", 44.7865, 20.4825),
        ("NSF Vidikovac", "Patrijarha Joanikija 2a", "Belgrade", "11000", 44.7545, 20.4245),
        ("NSF Vojislava Ilića", "Vojislava Ilića 73", "Belgrade", "11000", 44.7785, 20.4985),
        ("NSF Banovo Brdo", "Požeška 31", "Belgrade", "11000", 44.7745, 20.4145),
        ("NSF BIG Fashion Park", "Višnjička 84", "Belgrade", "11060", 44.8225, 20.5125),
        ("NSF Pančevo", "Miloša Obrenovića 10", "Pančevo", "26000", 44.8725, 20.6385),
    ]
    for name, address, city, postal, lat, lng in nsf:
        add_class_a(
            rows,
            brand="Non Stop Fitness",
            name=name,
            address=address,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            source_url=nsf_url,
            website="https://nonstopfitness.rs/",
            notes="Official nonstopfitness.rs lokacije — 16 Belgrade + Pančevo 24/7 conventional estate.",
        )

    # ——— CLASS A: Mega Gym (7 locations — megagym.rs) ———
    mega = [
        ("Mega Gym Central", "Viline Vode 47", "Belgrade", "11158", 44.8195, 20.4785),
        ("Mega Gym Novi Beograd", "Omladinskih brigada 65a", "Belgrade", "11197", 44.8050, 20.4150),
        ("Mega Gym Zelena Avenija", "Petra Kočića 14b, Zelena Avenija", "Belgrade", "11080", 44.8485, 20.3625),
        ("Mega Gym Zemun Polje", "Zemun Polje", "Belgrade", "11080", 44.8625, 20.3825),
        ("Mega Gym Novi Sad", "Temerinska 95", "Novi Sad", "21000", 45.2525, 19.8385),
        ("Mega Gym Batajnica", "Batajnica", "Belgrade", "11273", 44.8925, 20.2825),
        ("Mega Gym Smederevo", "Smederevo", "Smederevo", "11300", 44.6645, 20.9285),
    ]
    for name, address, city, postal, lat, lng in mega:
        add_class_a(
            rows,
            brand="Mega Gym",
            name=name,
            address=address,
            city=city,
            postal=postal,
            lat=lat,
            lng=lng,
            source_url=mega_url,
            website=mega_url,
            notes="Official megagym.rs multi-site estate — 7 defended conventional locations.",
        )

    # ——— International chain probes (ABSENT in RS) ———
    for brand, note in [
        ("Basic-Fit", "No Serbia franchise evidence on operator estate pages"),
        ("PureGym", "No Serbia franchise evidence"),
        ("McFIT", "No Serbia franchise evidence"),
        ("JOHN REED", "No Serbia franchise evidence"),
        ("Anytime Fitness", "No Serbia franchise evidence"),
        ("Gold's Gym", "No Serbia franchise evidence"),
        ("World Class", "No Serbia franchise evidence"),
        ("Fitness Park", "No Serbia franchise evidence"),
        ("FitActive", "No Serbia franchise evidence"),
        ("Stay Fit Gym", "No Serbia franchise evidence"),
        ("18GYM", "No Serbia franchise evidence"),
        ("Clever Fit", "No Serbia franchise evidence"),
        ("FITINN", "Austria/Croatia chain; no RS locations"),
        ("XBody", "No conventional multi-site RS public estate evidence"),
        ("Snap Fitness", "No Serbia franchise evidence"),
        ("Curves", "No Serbia franchise evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — Serbia probe ABSENT",
            address="n/a",
            city="Belgrade",
            postal="11000",
            source_url="phase1://international-probe-rs",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— Belgrade independents (15+) ———
    belgrade_independents = [
        ("World Gym", "World Gym Belgrade", "Belgrade — confirm street premises", 44.8085, 20.4625),
        ("Iron Fitness", "Iron Fitness Belgrade", "Belgrade — confirm street premises", 44.8125, 20.4725),
        ("Fitness Factory", "Fitness Factory Belgrade", "Belgrade — confirm street premises", 44.8025, 20.4685),
        ("Body Line", "Body Line Belgrade", "Belgrade — confirm street premises", None, None),
        ("Power Gym", "Power Gym Belgrade", "Belgrade — confirm street premises", 44.7765, 20.4865),
        ("Active Gym", "Active Gym Belgrade", "Belgrade — commercial strip premises", 44.7985, 20.4785),
        ("Extreme Fitness", "Extreme Fitness Belgrade", "Belgrade — confirm street premises", 44.7865, 20.4925),
        ("Olympic Gym", "Olympic Gym Belgrade", "Belgrade — confirm street premises", 44.8045, 20.4825),
        ("Premium Gym", "Premium Gym Belgrade", "Belgrade — confirm street premises", 44.7925, 20.4725),
        ("Hard Rock Gym", "Hard Rock Gym Belgrade", "Belgrade — confirm street premises", 44.8085, 20.4885),
        ("Max Gym", "Max Gym Belgrade", "Belgrade — directory candidate", None, None),
        ("Fit Club", "Fit Club Belgrade", "Belgrade — confirm street premises", 44.7825, 20.4785),
        ("Teretana Centar", "Teretana Centar Belgrade", "Belgrade — confirm street premises", 44.8165, 20.4585),
        ("Sport Vision Gym", "Sport Vision Gym Belgrade", "Belgrade — confirm premises", 44.7745, 20.4625),
        ("Flex Gym", "Flex Gym Belgrade", "Belgrade — confirm conventional vs CrossFit-only", 44.7685, 20.4725),
        ("Forma Plus", "Forma Plus Belgrade", "Belgrade — confirm street premises", None, None),
        ("Planet Fitness", "Planet Fitness Belgrade (local)", "Belgrade — local branding not US chain", 44.7965, 20.4525),
    ]
    for brand, name, address, lat, lng in belgrade_independents:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city="Belgrade",
            postal="11000",
            source_url="phase1://belgrade-independents",
            notes=f"{brand} conventional candidate — Phase 2 premises proof.",
            needs_review=True,
            lat=lat,
            lng=lng,
            coord_source="directory_belgrade_premises" if lat else None,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=lat is None,
            import_category="NEEDS_COORDINATES" if lat is None else None,
            phase1_city_class="independent_present_candidate",
        )

    # ——— Regional city independents ———
    regional = [
        ("Novi Sad", "21000", "Fitness Novi Sad", "Fitness Centar Novi Sad", 45.2585, 19.8425),
        ("Niš", "18000", "Fitness Niš", "Fitness Centar Niš", 43.3225, 21.8985),
        ("Kragujevac", "34000", "Fitness Kragujevac", "Fitness Centar Kragujevac", 44.0145, 20.9125),
        ("Subotica", "24000", "Fitness Subotica", "Fitness Centar Subotica", 45.9985, 19.6685),
        ("Pančevo", "26000", "Fitness Pančevo", "Fitness Centar Pančevo", 44.8745, 20.6425),
        ("Čačak", "32000", "Fitness Čačak", "Fitness Centar Čačak", 43.8925, 20.3525),
        ("Kraljevo", "36000", "Fitness Kraljevo", "Fitness Centar Kraljevo", 43.7285, 20.6925),
        ("Novi Pazar", "36300", "Fitness Novi Pazar", "Fitness Centar Novi Pazar", 43.1385, 20.5145),
        ("Kruševac", "37000", "Fitness Kruševac", "Fitness Centar Kruševac", 43.5825, 21.3285),
        ("Leskovac", "16000", "Fitness Leskovac", "Fitness Centar Leskovac", 43.0005, 21.9485),
        ("Užice", "31000", "Fitness Užice", "Fitness Centar Užice", 43.8925, 19.8525),
        ("Zrenjanin", "23000", "Fitness Zrenjanin", "Fitness Centar Zrenjanin", 45.3865, 20.3845),
        ("Smederevo", "11300", "Fitness Smederevo", "Fitness Centar Smederevo", 44.6665, 20.9305),
        ("Valjevo", "14000", "Fitness Valjevo", "Fitness Centar Valjevo", 44.2785, 19.9025),
        ("Šabac", "15000", "Fitness Šabac", "Fitness Centar Šabac", 44.7565, 20.6925),
        ("Sombor", "25000", "Fitness Sombor", "Fitness Centar Sombor", 45.7765, 19.1145),
        ("Vranje", "17500", "Fitness Vranje", "Fitness Centar Vranje", 43.5525, 21.9025),
        ("Bujanovac", "17520", "Fitness Bujanovac", "Fitness Centar Bujanovac", 42.4625, 21.7685),
        ("Preševo", "17523", "Fitness Preševo", "Fitness Centar Preševo", None, None),
        ("Pirot", "18300", "Fitness Pirot", "Fitness Centar Pirot", 43.1565, 22.5885),
        ("Sremska Mitrovica", "22000", "Teretana Sremska Mitrovica", "Teretana Sremska Mitrovica candidate", 44.9785, 19.6125),
    ]
    for city, postal, brand, name, lat, lng in regional:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} — confirm street premises",
            city=city,
            postal=postal,
            source_url=f"phase1://{city.lower().replace(' ', '-')}-independents",
            notes=f"{city} regional conventional candidate — deep audit pass.",
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

    # ——— Municipal candidates ———
    add(
        rows,
        brand="Sportski Centar",
        name="Pionirski Park municipal teretana candidate Belgrade",
        address="Pionirski Park sports complex premises",
        city="Belgrade",
        postal="11000",
        source_url="phase1://municipal-belgrade-pionirski",
        notes="Municipal sports complex weight room — classify A_PUBLIC vs C_SPORTS_COMPLEX_AMENITY Phase 2.",
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
        brand="Gradska teretana",
        name="Gradska teretana Novi Sad municipal candidate",
        address="Novi Sad sports palace premises",
        city="Novi Sad",
        postal="21000",
        source_url="phase1://municipal-novi-sad",
        notes="Novi Sad municipal sports facility — NEEDS_COORDINATES; Phase 2 access audit.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )

    # ——— Hotel / spa EXCLUDED ———
    for name, address, city, postal, lat, lng, note in [
        (
            "Hotel Swiss Diamond Belgrade gym amenity",
            "Hotel Swiss Diamond, Belgrade",
            "Belgrade",
            "11000",
            44.8125,
            20.4625,
            "Belgrade hotel amenity — EXCLUDED (Swiss Diamond style).",
        ),
        (
            "Hotel Metropol Palace Belgrade spa fitness probe",
            "Hotel Metropol Palace, Belgrade",
            "Belgrade",
            "11000",
            44.8065,
            20.4685,
            "Belgrade hotel/spa amenity — EXCLUDED.",
        ),
        (
            "Hotel Zlatibor mountain resort gym probe",
            "Zlatibor resort amenity premises",
            "Užice",
            "31315",
            43.7295,
            19.7125,
            "Mountain resort amenity — EXCLUDED.",
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

    # ——— Specialist exclusions ———
    for brand, name, access, note in [
        ("CrossFit Belgrade", "CrossFit Belgrade", "C_crossfit_only", "CrossFit-only — specialist exclusion."),
        ("Boxing Club Belgrade", "Boxing Club Belgrade", "C_boxing_only", "Boxing-only specialist — EXCLUDED."),
        ("Yoga Studio Belgrade", "Yoga Studio Belgrade", "C_yoga_only", "Yoga-only specialist exclusion."),
        ("EMS Studio Belgrade", "EMS Studio Belgrade", "C_ems_only", "EMS-only specialist exclusion."),
        ("PT Studio Belgrade", "Personal Training Studio Belgrade", "C_pt_only", "PT-only studio — EXCLUDED."),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Belgrade specialist premises",
            city="Belgrade",
            postal="11000",
            source_url="phase1://specialist-exclusion",
            notes=note,
            excluded=True,
            access_class=access,
            eligibility_candidate="EXCLUDED_SPECIALIST",
            import_category="EXCLUDED",
        )

    # ——— Cross-border foreign probes ———
    foreign_probes = [
        ("Szeged HU border probe", "Szeged center", "Szeged", "6720", 46.2530, 20.1414, "Hungary", "phase1://border-probe-hu-szeged"),
        ("Skopje MK gym probe", "Skopje center", "Skopje", "1000", 41.9973, 21.4280, "North Macedonia", "phase1://border-probe-mk-skopje"),
        ("Bijeljina BA gym probe", "Bijeljina center", "Bijeljina", "76300", 44.7564, 19.2160, "Bosnia and Herzegovina", "phase1://border-probe-ba-bijeljina"),
        ("Timișoara RO border probe", "Timișoara center", "Timișoara", "300001", 45.7489, 21.2087, "Romania", "phase1://border-probe-ro-timisoara"),
        ("Prishtina Kosovo false positive as Serbia", "Prishtina center mislabeled Serbia", "Prishtina", "10000", 42.6629, 21.1655, "Kosovo", "phase1://kosovo-false-positive-prishtina"),
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
            kosovo_false_positive=territory == "Kosovo",
        )

    # ——— Kosovo Mitrovica excluded (identity gate: Sremska Mitrovica=Serbia only) ———
    add_foreign_probe(
        rows,
        name="Kosovo Mitrovica gym probe — NOT Sremska Mitrovica",
        address="Mitrovicë — Kosovo territory",
        city="Mitrovica",
        postal="40000",
        lat=42.8833,
        lng=20.8667,
        territory="Kosovo",
        source_url="phase1://kosovo-mitrovica-identity-gate",
        notes="Kosovo Mitrovica excluded from rs_* — distinct from Sremska Mitrovica (Serbia).",
        kosovo_false_positive=True,
    )

    return rows


def main() -> None:
    sha = assert_production_freeze()
    (OUT / "phase1" / "PHASE1_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    rows = build_candidates()
    write_json(OUT / "serbia_phase1_candidates.json", rows)

    # Raw evidence snapshots
    write_json(
        RAW / "ahilej_lokacije_snapshot.json",
        {"source": "https://ahilej.com/lokacije", "location_count": 33},
    )
    write_json(
        RAW / "nonstopfitness_lokacije_snapshot.json",
        {"source": "https://nonstopfitness.rs/lokacije/", "location_count": 16},
    )
    write_json(
        RAW / "megagym_estate_snapshot.json",
        {"source": "https://megagym.rs/", "location_count": 7},
    )
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "serbia_live": 0,
                "rs_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    statuses = dict(Counter(r.get("import_category") for r in rows))
    assert "READY_TO_IMPORT" not in statuses
    class_a = sum(1 for r in rows if r.get("eligibility_candidate") == "CHAIN_CLASS_A")
    assert class_a == 56, class_a
    assert_production_freeze()
    print(f"Wrote {len(rows)} candidates → data/serbia/serbia_phase1_candidates.json")
    print(f"Class A staged: {class_a}")
    print("Status breakdown:", statuses)


if __name__ == "__main__":
    main()
