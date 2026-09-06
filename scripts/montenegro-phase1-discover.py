#!/usr/bin/env python3
"""Montenegro Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_me_postal,
    write_json,
)

OUT = ROOT / "data/montenegro"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8"
PRODUCTION_TOTAL = 11749

CITY_CANON = {
    "podgorica": "Podgorica",
    "подгорица": "Podgorica",
    "nikšić": "Nikšić",
    "niksic": "Nikšić",
    "никшић": "Nikšić",
    "budva": "Budva",
    "будва": "Budva",
    "bečići": "Bečići",
    "becici": "Bečići",
    "petrovac": "Petrovac",
    "bar": "Bar",
    "herceg novi": "Herceg Novi",
    "igalo": "Igalo",
    "kotor": "Kotor",
    "tivat": "Tivat",
    "bijelo polje": "Bijelo Polje",
    "berane": "Berane",
    "ulcinj": "Ulcinj",
    "cetinje": "Cetinje",
    "pljevlja": "Pljevlja",
    "rožaje": "Rožaje",
    "rozaje": "Rožaje",
    "dubrovnik": "Dubrovnik",
    "trebinje": "Trebinje",
    "shkodër": "Shkodër",
    "shkoder": "Shkodër",
    "novi pazar": "Novi Pazar",
    "pejë": "Pejë",
    "peja": "Pejë",
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
    territory: str = "Montenegro",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="me_",
        country="Montenegro" if territory == "Montenegro" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_me_postal(postal) or postal,
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
    rows.append(row)


def assert_production_freeze() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    me = [c for c in centers if c.get("country") == "Montenegro"]
    me_pref = [c for c in centers if str(c.get("id", "")).startswith("me_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(me) == 0 and len(me_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} Montenegro=0 me_*=0 SHA={sha}")


def build_candidates() -> list[dict]:
    rows: list[dict] = []

    # ——— International / regional chain probes (ABSENT in ME) ———
    for brand, note in [
        ("Anytime Fitness", "No ME franchise evidence"),
        ("Basic-Fit", "No ME franchise evidence"),
        ("McFIT", "No ME franchise evidence"),
        ("JOHN REED", "No ME franchise evidence"),
        ("Fitness First", "No ME franchise evidence"),
        ("Gold's Gym", "No ME franchise evidence"),
        ("clever fit", "No ME franchise evidence"),
        ("FITINN", "No ME franchise evidence"),
        ("PureGym", "No ME franchise evidence"),
        ("Fitness Park", "No ME franchise evidence"),
        ("Keep Cool", "No ME franchise evidence"),
        ("Lemon Gym", "No ME franchise evidence"),
        ("World Class", "No ME franchise evidence"),
        ("Ahilej", "Serbia-only estate (33 RS sites); no ME locations on ahilej.com/lokacije"),
        ("XTZ", "No ME presence"),
        ("BIGSPORT", "No ME presence"),
        ("Energy Fitness", "No ME presence"),
        ("Fitness Time", "No ME operator evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — Montenegro probe ABSENT",
            address="n/a",
            city="Podgorica",
            postal="81000",
            source_url="https://www.portal-crnagora.com/sport-rekreacija-zabava/teretane-i-fitness-centri/",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— Podgorica conventional independents / multi-site below Class A ———
    add(
        rows,
        brand="The Capital Fitness Center",
        name="The Capital Fitness Center Podgorica",
        address="Šeika Zaida 19/3, The Capital Plaza, nivo -1",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://thecapitalfitnesscenter.me/kontakt/",
        website="https://thecapitalfitnesscenter.me/",
        notes="Large conventional TechnoGym floor; public membership; Capital Plaza premises.",
        needs_review=True,
        lat=42.44285,
        lng=19.26295,
        coord_source="official_address_capital_plaza_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Athletic's Gym",
        name="SRD Athletic Podgorica",
        address="Dr Vukašina Markovića 112",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://athleticgym.me/en/",
        website="https://athleticgym.me/",
        notes="Conventional gym floor + public packages; also offers boxing/taekwondo groups (additive).",
        needs_review=True,
        lat=42.4412,
        lng=19.2448,
        coord_source="official_website_address_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Benex Fitness",
        name="Benex Fitness Unique Capital Plaza",
        address="Šeika Zaida 19, Capital Plaza",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.planplus.rs/crna-gora/fitness-centar-benex-fitness-unique/82876",
        website="https://benexfitness.me/",
        notes="Multi-site local operator (2 PG sites) — below Class A threshold (≥3).",
        needs_review=True,
        lat=42.4429,
        lng=19.2631,
        coord_source="directory_capital_plaza_premises",
        discovery_class="multi_site_below_class_a",
        eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
        operator_class="B",
        chain_key="benex_fitness",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Benex Fitness",
        name="Benex Fitness Stari Aerodrom",
        address="Avda Međedovića bb, Stari Aerodrom",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.planplus.rs/crna-gora/fitness-centar-benex-fitness-unique/83274",
        website="https://benexfitness.me/",
        notes="Second Benex site; estate size 2 < Class A.",
        needs_review=True,
        lat=42.4175,
        lng=19.2598,
        coord_source="directory_stari_aerodrom_premises",
        discovery_class="multi_site_below_class_a",
        eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
        chain_key="benex_fitness",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Urban Gym",
        name="Urban Gym Podgorica",
        address="Bulevar Ivana Crnojevića bb (zgrada Zetagradnje)",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.portal-crnagora.com/sport-rekreacija-zabava/teretane-i-fitness-centri/",
        website="https://www.urbangym.me/",
        notes="Directory-listed conventional gym; confirm current open status in Phase 2.",
        needs_review=True,
        lat=42.4418,
        lng=19.2622,
        coord_source="directory_boulevard_premises_approx",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="GO GYM",
        name="GO GYM Podgorica",
        address="Trg Republike bb, TPC Ražnatović I sprat",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.portal-crnagora.com/sport-rekreacija-zabava/teretane-i-fitness-centri/",
        website="https://www.gogym.me/",
        notes="Directory candidate; may co-locate with Urban — rebrand map Phase 2.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="XL Sport Studio",
        name="XL Sport Studio Podgorica",
        address="Mitra Bakića bb (preko puta pošte 2, iza Jusovače)",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.portal-crnagora.com/sport-rekreacija-zabava/teretane-i-fitness-centri/",
        website="https://www.xlsportstudio.me/",
        notes="Conventional studio/gym candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Hulk Gym",
        name="Hulk 23 Podgorica",
        address="Đoka Miraševića bb (Blok 9)",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.yoys.me/phone,382-67302020,gym,Podgorica,ME3183.html",
        notes="Single-site conventional bodybuilding gym; not a multi-site Class A chain.",
        needs_review=True,
        lat=42.4375,
        lng=19.2485,
        coord_source="directory_blok9_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Soko Gym",
        name="Soko Gym Morača",
        address="Ivana Milutinovića bb, Sportski centar Morača",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://gymnavigator.com/gyms/88517/soko-gym-fitness-centar/",
        notes="Conventional fitness unit at SC Morača. Other Soko units are Lady aerobics / mall wellness — not Class A estate of 3 conventional floors.",
        needs_review=True,
        lat=42.4422,
        lng=19.2495,
        coord_source="sports_center_moraca_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        chain_key="soko_gym",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Soko Gym",
        name="Soko Gym City",
        address="Vojvode Maša Đurovića",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://gymnavigator.com/gyms/88853/soko-gym-city/",
        notes="Directory lists Soko Gym City; verify if distinct current conventional floor vs Morača/legacy.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        chain_key="soko_gym",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Gym Box",
        name="Gym Box Podgorica",
        address="Veljka Jankovića 9",
        city="Podgorica",
        postal="81000",
        municipality="Podgorica",
        source_url="https://www.companywall.me/firma/gym-box-doo/MM13bSQY",
        notes="Registered fitness club; confirm conventional open-floor membership Phase 2.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )

    # ——— Podgorica exclusions ———
    add(
        rows,
        brand="Smart Gym",
        name="Smart Gym Children's Fitness Capital Plaza",
        address="Šeika Zaida 19/11, Capital Plaza nivo -1",
        city="Podgorica",
        postal="81000",
        source_url="https://smartgym.me/",
        notes="Children's fitness only — specialist exclusion.",
        excluded=True,
        access_class="C_children_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        lat=42.4428,
        lng=19.2630,
        coord_source="official_capital_plaza",
    )
    add(
        rows,
        brand="TOTALFIT LIFE",
        name="TOTALFIT LIFE Gym Donja Gorica",
        address="Donja Gorica",
        city="Podgorica",
        postal="81000",
        source_url="https://totalfitlife.me/",
        notes="CrossFit / functional community — CrossFit-primary exclusion.",
        excluded=True,
        access_class="C_crossfit_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        needs_coords=True,
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Soko Gym",
        name="Soko Gym Lady Aerobik (gimnazija)",
        address="Gimnazija Slobodan Škerović",
        city="Podgorica",
        postal="81000",
        source_url="https://www.businessbook.eu.com/sport-i-rekreacija/item/133-soko-gym",
        notes="Aerobics / women-oriented unit — not conventional Class A floor.",
        excluded=True,
        access_class="C_aerobics_women",
        eligibility_candidate="EXCLUDED_SPECIALIST",
        chain_key="soko_gym",
    )
    add(
        rows,
        brand="Soko Gym",
        name="Soko Wellness Mall of Montenegro",
        address="Bratstva i Jedinstva 85, Mall of Montenegro",
        city="Podgorica",
        postal="81000",
        source_url="https://www.businessbook.eu.com/sport-i-rekreacija/item/133-soko-gym",
        notes="Wellness/spa unit — spa-primary exclusion pending Phase 2 if gym floor proven.",
        excluded=True,
        access_class="C_spa_primary",
        eligibility_candidate="EXCLUDED_SPA",
        hotel_spa_risk=True,
        chain_key="soko_gym",
    )

    # ——— Nikšić ———
    add(
        rows,
        brand="City Fitness",
        name="City Fitness Dom Revolucije Nikšić",
        address="Dom Revolucije, Skadarska / Radoja Dakića bb",
        city="Nikšić",
        postal="81400",
        municipality="Nikšić",
        source_url="https://www.cityfitness.me/o-nama",
        website="https://www.cityfitness.me/",
        notes="Major conventional public gym (~1500m²). Single-site after move from Pete proleterske (legacy).",
        needs_review=True,
        lat=42.7746,
        lng=18.9552,
        coord_source="dom_revolucije_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="City Fitness",
        name="City Fitness Pete proleterske (legacy)",
        address="Pete proleterske brigade",
        city="Nikšić",
        postal="81400",
        source_url="https://www.cityfitness.me/o-nama",
        notes="Predecessor location; relocated to Dom Revolucije 2019 — LEGACY.",
        closed=True,
        import_category="CLOSED",
        discovery_class="legacy",
        eligibility_candidate="LEGACY_CLOSED",
        chain_key="city_fitness",
    )
    add(
        rows,
        brand="Status Fitness",
        name="Status Fitness Studio Nikšić",
        address="Gavrila Principa / Njegoševa area",
        city="Nikšić",
        postal="81400",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Independent candidate; defend exact premises in Phase 2.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="MEGA GYM",
        name="MEGA GYM Nikšić",
        address="Zgrada 10-ka, Nikole Tesle",
        city="Nikšić",
        postal="81400",
        source_url="https://directmap.me/et/%D0%BD%D0%B8%D0%BA%D1%88%D0%B8%D1%9B/1765",
        notes="Independent candidate near City Fitness.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Bodyfit",
        name="Bodyfit Fitness Studio Nikšić",
        address="Nikšić",
        city="Nikšić",
        postal="81400",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Directory independent; verify conventional membership.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
    )

    # ——— Coastal ———
    add(
        rows,
        brand="Positive Fitness",
        name="Positive Fitness Budva",
        address="Žrtava fašizma bb",
        city="Budva",
        postal="85310",
        municipality="Budva",
        source_url="https://positivefitness.me/me/prostor-i-oprema",
        website="https://www.positivefitness.me/",
        notes="Large conventional gym (~700m²); public membership; not hotel amenity.",
        needs_review=True,
        lat=42.2869,
        lng=18.8385,
        coord_source="official_website_address",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Ethno Gym",
        name="EthnoGym Budva TQ Plaza",
        address="Mediteranska 53, TQ Plaza, 2nd floor",
        city="Budva",
        postal="85310",
        municipality="Budva",
        source_url="https://www.ethnogymbudva.me/me/kontakt",
        website="https://www.ethnogymbudva.me/",
        notes="Conventional public gym in mall; sauna additive.",
        needs_review=True,
        lat=42.2875,
        lng=18.8412,
        coord_source="official_tq_plaza_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Fitness Original",
        name="Fitness Original Budva",
        address="Blaža Jovanovića 17",
        city="Budva",
        postal="85310",
        source_url="https://www.companywall.me/firma/fitness-original/MMBjnkq",
        notes="Registered fitness club; confirm open conventional floor Phase 2.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
    )
    add(
        rows,
        brand="Big Body",
        name="Teretana Big Body Bar",
        address="Bulevar Revolucije Kula A, V/8",
        city="Bar",
        postal="85000",
        municipality="Bar",
        source_url="https://gymnavigator.com/gyms/531665110/teretana-big-body/",
        notes="Conventional public gym; day-entry evidence.",
        needs_review=True,
        lat=42.0945,
        lng=19.1008,
        coord_source="directory_kula_a_premises",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="R-Project",
        name="R-Project Fitness Bar",
        address="Jovana Tomaševića",
        city="Bar",
        postal="85000",
        municipality="Bar",
        source_url="https://www.moja-djelatnost.me/teretana-i-fitness-bar/r---project/MMowceG",
        notes="Conventional + group fitness; HQ claims Podgorica — verify Bar premises.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Extreme Gym",
        name="Extreme Gym Tivat",
        address="Župa",
        city="Tivat",
        postal="85320",
        municipality="Tivat",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Independent coastal candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Terzo",
        name="Terzo Teretana Herceg Novi",
        address="Nikole Ljubibratića bb",
        city="Herceg Novi",
        postal="85340",
        municipality="Herceg Novi",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Independent conventional candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )

    # ——— Hotel / spa / resort exclusions (coastal critical) ———
    add(
        rows,
        brand="Gym 2000",
        name="Gym 2000 Hotel Plaža",
        address="Save Kovačevića 58, Hotel Plaža",
        city="Herceg Novi",
        postal="85340",
        source_url="https://www.gym2000.me/",
        notes="Operates group trainings inside Hotel Plaža — hotel amenity / hotel-primary risk → EXCLUDED.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_hotel_amenity",
        eligibility_candidate="EXCLUDED_HOTEL",
    )
    add(
        rows,
        brand="Gym 2000",
        name="Gym 2000 Hotel Igalo",
        address="Sava Ilića 7, Hotel Igalo",
        city="Igalo",
        postal="85347",
        source_url="https://www.gym2000.me/",
        notes="Hotel Igalo group trainings — hotel amenity exclusion.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_hotel_amenity",
        eligibility_candidate="EXCLUDED_HOTEL",
    )
    add(
        rows,
        brand="Portonovi",
        name="Portonovi Training Studio",
        address="Portonovi Resort",
        city="Herceg Novi",
        postal="85340",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Luxury resort training studio — guest/resort amenity exclusion.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_resort_amenity",
        eligibility_candidate="EXCLUDED_HOTEL",
    )
    add(
        rows,
        brand="CrossFit Arena",
        name="CrossFit Arena Tivat",
        address="Tivat",
        city="Tivat",
        postal="85320",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="CrossFit-only — specialist exclusion.",
        excluded=True,
        access_class="C_crossfit_only",
        eligibility_candidate="EXCLUDED_SPECIALIST",
    )
    add(
        rows,
        brand="PMYC Sports Club",
        name="PMYC Sports Club Tivat",
        address="Trg Magnolije / Porto Montenegro area",
        city="Tivat",
        postal="85320",
        source_url="https://montenegro.worldplaces.me/directory/gym-physical-fitness-centers.html",
        notes="Yacht-club / marina sports amenity — not ordinary public gym.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_private_club",
        eligibility_candidate="EXCLUDED_PRIVATE",
    )

    # ——— North / inland ———
    add(
        rows,
        brand="Hulk Gym",
        name="Teretana Hulk Bijelo Polje",
        address="E763 corridor, Bijelo Polje",
        city="Bijelo Polje",
        postal="84000",
        municipality="Bijelo Polje",
        source_url="https://vymaps.com/ME/Teretana-Hulk-3116/",
        notes="Independent; older directory evidence — confirm open status Phase 2. Distinct from PG Hulk 23.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Sportski centar Berane",
        name="SC Berane Teretana",
        address="Sportski centar Berane",
        city="Berane",
        postal="84300",
        municipality="Berane",
        source_url="https://scberane.me/index.php/2023/09/23/teretana-2/",
        notes="Municipal sports-center weight room renovated 2023 — classify A_PUBLIC vs C_SPORTS_COMPLEX_AMENITY in Phase 2.",
        needs_review=True,
        discovery_class="municipal",
        eligibility_candidate="MUNICIPAL_CANDIDATE",
        access_class="B_public_but_program_led",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="municipal_present_candidate",
    )

    # ——— Regional gap placeholders (documented zeros) ———
    for city, postal, klass, note in [
        ("Kotor", "85330", "A_legitimate_no_local_gym", "No defended conventional public gym found; hotel gyms excluded."),
        ("Ulcinj", "85360", "B_discovery_gap", "Limited directory signal; Phase 2 deep pass required."),
        ("Cetinje", "81250", "B_discovery_gap", "No strong conventional public gym evidence in Phase 1."),
        ("Pljevlja", "84210", "B_discovery_gap", "No defended conventional public gym in Phase 1."),
        ("Rožaje", "84310", "B_discovery_gap", "No defended conventional public gym in Phase 1."),
        ("Bečići", "85310", "C_scope_exclusion", "Coastal resort zone — hotel amenity risk; no independent joinable gym confirmed."),
        ("Petrovac", "85300", "C_scope_exclusion", "Tourist resort — hotel gyms only observed."),
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
            phase1_city_class=klass,
        )

    # ——— Cross-border contamination probes (must NOT become READY me_*) ———
    for brand, name, address, city, postal, lat, lng, territory, url in [
        (
            "Foreign probe",
            "Dubrovnik border probe",
            "Dubrovnik old town",
            "Dubrovnik",
            "20000",
            42.6507,
            18.0944,
            "Croatia",
            "phase1://border-probe-hr",
        ),
        (
            "Foreign probe",
            "Trebinje border probe",
            "Trebinje center",
            "Trebinje",
            "89101",
            42.71197,
            18.34362,
            "Bosnia and Herzegovina",
            "phase1://border-probe-ba",
        ),
        (
            "Foreign probe",
            "Shkodër border probe",
            "Shkodër center",
            "Shkodër",
            "4001",
            42.0683,
            19.5126,
            "Albania",
            "phase1://border-probe-al",
        ),
        (
            "Foreign probe",
            "Novi Pazar corridor probe",
            "Novi Pazar",
            "Novi Pazar",
            "36300",
            43.1367,
            20.5122,
            "Serbia",
            "phase1://border-probe-rs",
        ),
        (
            "Foreign probe",
            "Pejë / western Kosovo probe",
            "Pejë center",
            "Pejë",
            "30000",
            42.6593,
            20.2887,
            "Kosovo",
            "phase1://border-probe-xk",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=url,
            notes=f"Contamination probe — {territory}. Must remain EXCLUDED; never READY me_*.",
            excluded=True,
            lat=lat,
            lng=lng,
            coord_source="border_probe_landmark",
            discovery_class="border_probe",
            territory=territory,
            foreign_probe=True,
            eligibility_candidate="FOREIGN_EXCLUDED",
            import_category="EXCLUDED",
            access_class="C_foreign",
        )

    return rows


def main() -> None:
    assert_production_freeze()
    rows = build_candidates()
    write_json(OUT / "montenegro_phase1_candidates.json", rows)
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "montenegro_live": 0,
                "me_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {len(rows)} candidates → data/montenegro/montenegro_phase1_candidates.json")


if __name__ == "__main__":
    main()
