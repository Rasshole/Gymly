#!/usr/bin/env python3
"""Moldova Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_md_postal,
    write_json,
)

OUT = ROOT / "data/moldova"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6"
PRODUCTION_TOTAL = 11721

CITY_CANON = {
    "chișinău": "Chișinău",
    "chisinau": "Chișinău",
    "кишинёв": "Chișinău",
    "кишинев": "Chișinău",
    "bălți": "Bălți",
    "balti": "Bălți",
    "бельцы": "Bălți",
    "cahul": "Cahul",
    "ungheni": "Ungheni",
    "orhei": "Orhei",
    "soroca": "Soroca",
    "comrat": "Comrat",
    "комрат": "Comrat",
    "căușeni": "Căușeni",
    "causeni": "Căușeni",
    "hîncești": "Hîncești",
    "hincesti": "Hîncești",
    "strășeni": "Strășeni",
    "straseni": "Strășeni",
    "edineț": "Edineț",
    "edinet": "Edineț",
    "drochia": "Drochia",
    "cricova": "Cricova",
    "ceadîr-lunga": "Ceadîr-Lunga",
    "ceadir-lunga": "Ceadîr-Lunga",
    "vulcănești": "Vulcănești",
    "vulcanesti": "Vulcănești",
    "tiraspol": "Tiraspol",
    "тирасполь": "Tiraspol",
    "bender": "Bender",
    "tighina": "Bender",
    "бендеры": "Bender",
    "rîbnița": "Rîbnița",
    "ribnita": "Rîbnița",
    "рыбница": "Rîbnița",
    "dubăsari": "Dubăsari",
    "dubasari": "Dubăsari",
    "iași": "Iași",
    "iasi": "Iași",
    "galați": "Galați",
    "galati": "Galați",
    "huși": "Huși",
    "husi": "Huși",
    "chernivtsi": "Chernivtsi",
    "odesa": "Odesa",
    "mohyliv-podilskyi": "Mohyliv-Podilskyi",
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
    territory: str = "Moldova",
    sector: str | None = None,
    eligibility_candidate: str | None = None,
    website: str | None = None,
    transnistria: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="md_",
        country="Moldova" if territory == "Moldova" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_md_postal(postal) or postal,
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
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    row["sector"] = sector
    row["district"] = sector or city_c
    row["transnistria"] = transnistria
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
        row["import_category"] = "READY_TO_IMPORT"
    rows.append(row)


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, f"production total drift: {len(centers)}"
    assert sha == EXPECTED_SHA, f"SHA drift: {sha}"
    assert sum(1 for c in centers if c.get("country") == "Moldova") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("md_")) == 0

    rows: list[dict] = []

    # ------------------------------------------------------------------
    # CLASS A — BIGSPORT GYM (13 official clubs on gym.bigsport.md)
    # ------------------------------------------------------------------
    bs = "https://gym.bigsport.md/"
    bigsport = [
        ("BIGSPORT GYM Buiucani", "str. Alba Iulia 168", "Chișinău", "MD-2071", "Buiucani", 47.0343, 28.7790),
        ("BIGSPORT GYM Ciocana", "str. Profesor Ion Dumeniuc 12", "Chișinău", "MD-2044", "Ciocana", 47.056086, 28.892098),
        ("BIGSPORT GYM Poșta Veche", "str. Socoleni 7", "Chișinău", "MD-2023", "Rîșcani", 47.061306, 28.846713),
        ("BIGSPORT GYM Botanica Brâncuși", "str. Constantin Brâncuși 3", "Chișinău", "MD-2005", "Botanica", 46.989611, 28.859404),
        ("BIGSPORT GYM Sculeni", "str. Calea Ieșilor 10", "Chișinău", "MD-2069", "Buiucani", 47.041477, 28.803777),
        ("BIGSPORT GYM Alfa Shopping Mall", "str. Alba Iulia 75", "Chișinău", "MD-2071", "Buiucani", 47.035919, 28.771214),
        ("BIGSPORT GYM Botanica Decebal", "str. Decebal 6", "Chișinău", "MD-2001", "Botanica", 47.006267, 28.859007),
        ("BIGSPORT GYM Cricova", "str. Chișinăului 80", "Cricova", "MD-2084", None, 47.120866, 28.866818),
        ("BIGSPORT GYM Căușeni", "str. Ștefan cel Mare 8", "Căușeni", "MD-4301", None, 46.649060, 29.432809),
        ("BIGSPORT GYM Orhei", "str. Vasile Lupu 36/1", "Orhei", "MD-3501", None, 47.3768, 28.8241),
        ("BIGSPORT GYM Cahul", "str. Ștefan cel Mare 111-B", "Cahul", "MD-3901", None, 45.9162, 28.2140),
        ("BIGSPORT GYM Comrat", "str. Lenin 146 A", "Comrat", "MD-3800", None, 46.3075, 28.6571),
        ("BIGSPORT GYM Hîncești", "str. Chișinăului 3", "Hîncești", "MD-3401", None, 46.965183, 28.373885),
    ]
    for name, addr, city, postal, sector, lat, lng in bigsport:
        add(
            rows,
            brand="BIGSPORT GYM",
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=bs,
            website=bs,
            lat=lat,
            lng=lng,
            coord_source="OSM_NOMINATIM_PREMISES",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            sector=sector,
            notes="Official BIGSPORT club list gym.bigsport.md; public abonamente; conventional floor",
        )

    # ------------------------------------------------------------------
    # CLASS A — Energy Fitness (3 Chișinău clubs — efitness.md/contacte)
    # ------------------------------------------------------------------
    ef = "https://www.efitness.md/ro/contacte/"
    add(
        rows,
        brand="Energy Fitness",
        name="Energy Fitness Botanica",
        address="bd. Dacia 31/1",
        city="Chișinău",
        postal="MD-2005",
        source_url=ef,
        website="https://efitness.md/",
        lat=46.985605,
        lng=28.860512,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        sector="Botanica",
        notes="Official contacte: bd. Dacia 31/1; conventional public network ≥3 MD sites",
    )
    add(
        rows,
        brand="Energy Fitness",
        name="Energy Fitness Centru",
        address="bd. Dimitrie Cantemir 6",
        city="Chișinău",
        postal="MD-2001",
        source_url=ef,
        website="https://efitness.md/",
        lat=47.015431,
        lng=28.855528,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        sector="Centru",
        notes="Official contacte: bd. Dm. Cantemir 6",
    )
    add(
        rows,
        brand="Energy Fitness",
        name="Energy Fitness Telecentru",
        address="str. Nicolae Testemițanu 29/5",
        city="Chișinău",
        postal="MD-2025",
        source_url=ef,
        website="https://efitness.md/",
        needs_coords=True,
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        sector="Centru",
        notes="Official address confirmed; Nominatim resolves to hospital pin — premises coords deferred",
    )

    # ------------------------------------------------------------------
    # EXCLUDED — Unica Sport (women-only / shaping specialist network)
    # ------------------------------------------------------------------
    unica_sites = [
        ("Unica Sport Ștefan cel Mare", "bd. Ștefan cel Mare 182", "Centru"),
        ("Unica Sport Botanica sample", "Botanica sector club", "Botanica"),
        ("Unica Sport Buiucani Silueta+", "Buiucani sector club", "Buiucani"),
        ("Unica Sport Rîșcani Sport Line", "Rîșcani sector club", "Rîșcani"),
        ("Unica Sport Ciocana Bios Star", "Ciocana sector club", "Ciocana"),
    ]
    for name, addr, sector in unica_sites:
        add(
            rows,
            brand="Unica Sport",
            name=name,
            address=addr,
            city="Chișinău",
            postal="MD-2001",
            source_url="http://www.unicasport.md/",
            excluded=True,
            discovery_class="specialist_women_only",
            access_class="C_SPECIALIST_WOMEN_ONLY",
            operator_class="C",
            sector=sector,
            notes="Women-focused shaping/sport network — EXCLUDED under specialist policy; not Class A conventional",
        )

    # ------------------------------------------------------------------
    # INDEPENDENTS — NEEDS_REVIEW (Phase 2)
    # ------------------------------------------------------------------
    add(
        rows,
        brand="Heracles",
        name="Heracles Fitness Botanica",
        address="str. Independenței 6",
        city="Chișinău",
        postal="MD-2005",
        source_url="https://heracles.md/",
        website="https://heracles.md/",
        lat=46.983476,
        lng=28.844161,
        coord_source="OSM_NOMINATIM_PREMISES",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        sector="Botanica",
        notes="Long-running conventional independent; pool/sauna additive; Phase 2 evidence deepen",
    )
    add(
        rows,
        brand="Alexia Fitness & Wellness",
        name="Alexia Fitness & Wellness",
        address="bd. Iuri Gagarin 14",
        city="Chișinău",
        postal="MD-2001",
        source_url="https://myfit.md/gyms/alexia-fitness-wellness/",
        lat=47.009656,
        lng=28.857875,
        coord_source="OSM_NOMINATIM_PREMISES",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        access_class="B_WELLNESS_PRIMARY_REVIEW",
        operator_class="B",
        sector="Centru",
        notes="Conventional floor present but spa/wellness-heavy — Phase 2 hotel/spa gate",
    )
    add(
        rows,
        brand="MaxGym",
        name="MaxGym Chișinău",
        address="Chișinău (directory listing)",
        city="Chișinău",
        postal="MD-2001",
        source_url="https://myfit.md/",
        needs_review=True,
        needs_coords=False,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        import_category="NEEDS_REVIEW",
        notes="Directory-surfaced independent; address/coords incomplete — Phase 2",
    )
    # Force MaxGym to NEEDS_REVIEW without coords
    rows[-1]["lat"] = None
    rows[-1]["lng"] = None
    rows[-1]["import_category"] = "NEEDS_REVIEW"

    add(
        rows,
        brand="Wellness Era",
        name="Wellness Era Bălți",
        address="str. Bulgară 160/1",
        city="Bălți",
        postal="MD-3100",
        source_url="https://myfit.md/gyms/wellness-era/",
        lat=47.790859,
        lng=27.896497,
        coord_source="OSM_NOMINATIM_PREMISES",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        access_class="B_WELLNESS_PRIMARY_REVIEW",
        operator_class="B",
        notes="Primary Bălți conventional candidate; spa/pool present — Phase 2 eligibility",
    )

    # Additional Chișinău independents / specialists staged for review or exclusion
    chisinau_extra = [
        ("XTZ Fitness", "XTZ Fitness Chișinău", "Chișinău", "MD-2001", "independent", "NEEDS_REVIEW", "Probe — verify multi-site vs single; conventional floor", "SMALL_MARKET_INDEPENDENT"),
        ("Stay Fit", "Stay Fit Chișinău probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD multi-site Class A estate", None),
        ("Smart Fitness", "Smart Fitness MD probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD Class A estate", None),
        ("Premium Fitness", "Premium Fitness MD probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD Class A estate", None),
        ("Aquaterra", "Aquaterra Chișinău", "Chișinău", "MD-2001", "independent", "NEEDS_REVIEW", "Pool/wellness complex — Phase 2 conventional-floor gate", "SMALL_MARKET_INDEPENDENT"),
        ("Niagara Fitness", "Niagara Fitness MD probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD Class A estate", None),
        ("Fitness Family", "Fitness Family MD probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD Class A estate", None),
        ("Kangoo Club", "Kangoo Club MD probe", "Chișinău", "MD-2001", "specialist", "EXCLUDED", "Specialist format — not conventional Class A", None),
        ("Sporter", "Sporter MD probe", "Chișinău", "MD-2001", "chain_probe", "EXCLUDED", "No verified MD Class A estate", None),
    ]
    for brand, name, city, postal, dclass, status, notes, elig in chisinau_extra:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{name} (audit probe)",
            city=city,
            postal=postal,
            source_url="https://myfit.md/",
            excluded=(status == "EXCLUDED"),
            needs_review=(status == "NEEDS_REVIEW"),
            discovery_class=dclass,
            eligibility_candidate=elig,
            operator_class="B" if status == "NEEDS_REVIEW" else "C",
            access_class="C_SPECIALIST" if "Specialist" in notes or dclass == "specialist" else "A_public_conventional",
            notes=notes,
        )

    # Regional independents / coverage candidates
    regional = [
        ("Independent (Ungheni)", "Ungheni gym candidate", "Ungheni", "MD-3601", "Local conventional gym presence unverified depth — Phase 2"),
        ("Independent (Soroca)", "Soroca gym candidate", "Soroca", "MD-3001", "Local conventional gym presence unverified depth — Phase 2"),
        ("Independent (Strășeni)", "Strășeni gym candidate", "Strășeni", "MD-3701", "Local conventional gym presence unverified depth — Phase 2"),
        ("Independent (Edineț)", "Edineț gym candidate", "Edineț", "MD-4601", "Local conventional gym presence unverified depth — Phase 2"),
        ("Independent (Drochia)", "Drochia gym candidate", "Drochia", "MD-5201", "Local conventional gym presence unverified depth — Phase 2"),
        ("Independent (Ceadîr-Lunga)", "Ceadîr-Lunga gym candidate", "Ceadîr-Lunga", "MD-6101", "Gagauzia — Phase 2 deepen; do not invent coverage"),
        ("Independent (Vulcănești)", "Vulcănești gym candidate", "Vulcănești", "MD-5301", "Gagauzia — Phase 2 deepen; do not invent coverage"),
    ]
    for brand, name, city, postal, notes in regional:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{city} (regional audit placeholder)",
            city=city,
            postal=postal,
            source_url="phase1://moldova/regional-audit",
            needs_review=True,
            discovery_class="regional_gap_candidate",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            operator_class="B",
            notes=notes,
        )

    # Municipal / public
    add(
        rows,
        brand="Municipal sports complex",
        name="Chișinău municipal sports amenity (sample)",
        address="Complex sportiv municipal (audit)",
        city="Chișinău",
        postal="MD-2001",
        source_url="phase1://moldova/municipal-audit",
        needs_review=True,
        discovery_class="municipal_public",
        access_class="C_SPORTS_COMPLEX_AMENITY",
        operator_class="B",
        eligibility_candidate="MUNICIPAL_REVIEW",
        notes="Sports-complex weight room alone ≠ consumer gym — Phase 2 Andorra/Monaco gate",
    )

    # Hotel / spa / specialist exclusions
    for brand, name, notes in [
        ("Hotel gym", "Hotel guest fitness Chișinău", "Guest-only hotel fitness — EXCLUDED"),
        ("Spa wellness", "Spa-primary fitness amenity", "Spa-primary incidental gym — EXCLUDED"),
        ("CrossFit box", "CrossFit-only Chișinău sample", "CrossFit-only specialist — EXCLUDED"),
        ("EMS studio", "EMS studio Chișinău sample", "EMS specialist — EXCLUDED"),
        ("PT studio", "PT-only studio Chișinău sample", "PT-only — EXCLUDED"),
        ("Yoga studio", "Yoga-only Chișinău sample", "Yoga specialist — EXCLUDED"),
        ("Martial arts", "Martial arts dojo Chișinău sample", "Martial arts specialist — EXCLUDED"),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{name} (exclusion probe)",
            city="Chișinău",
            postal="MD-2001",
            source_url="phase1://moldova/specialist-audit",
            excluded=True,
            discovery_class="specialist_exclusion",
            access_class="C_SPECIALIST",
            operator_class="C",
            notes=notes,
        )

    # ------------------------------------------------------------------
    # TRANSNISTRIA — explicit territorial workstream (not READY in Phase 1)
    # ------------------------------------------------------------------
    add(
        rows,
        brand="Adrenalin",
        name="Adrenalin Orion Tiraspol",
        address="ul. Karla Libknekhta 217, TC Orion",
        city="Tiraspol",
        postal="MD-3300",
        source_url="https://adrenalin-fitness.ru/",
        lat=46.839533,
        lng=29.601533,
        coord_source="OSM_NOMINATIM_PREMISES",
        needs_review=True,
        discovery_class="transnistria",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        transnistria=True,
        notes="Transnistria — conventional gym; geo inside internationally recognized MD borders; catalog policy HOLD_PHASE1",
    )
    add(
        rows,
        brand="Adrenalin",
        name="Adrenalin Shevchenko Tiraspol",
        address="per. Shevchenko 1a",
        city="Tiraspol",
        postal="MD-3300",
        source_url="https://myfit.md/gyms/adrenalin-orion/",
        needs_review=True,
        discovery_class="transnistria",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        transnistria=True,
        notes="Transnistria second Tiraspol site — Phase 1 territorial hold; coords incomplete",
    )
    add(
        rows,
        brand="Adrenalin",
        name="Adrenalin Bender Kotovskogo",
        address="ul. Kotovskogo 65a",
        city="Bender",
        postal="MD-3200",
        source_url="https://adrenalin-fitness.ru/",
        needs_review=True,
        discovery_class="transnistria",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        transnistria=True,
        notes="Bender/Tighina — Transnistria hold; conventional public gym evidence",
    )
    add(
        rows,
        brand="Adrenalin",
        name="Adrenalin Bender Shevchenko",
        address="str. Shevchenko 1a",
        city="Bender",
        postal="MD-3200",
        source_url="https://myfit.md/",
        needs_review=True,
        discovery_class="transnistria",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        transnistria=True,
        notes="Bender second site — verify distinct premises vs directory alias",
    )
    add(
        rows,
        brand="Independent (Rîbnița)",
        name="Rîbnița sports complex gym candidate",
        address="Yubileynaya / sports complex (audit)",
        city="Rîbnița",
        postal="MD-5500",
        source_url="phase1://moldova/transnistria-audit",
        needs_review=True,
        discovery_class="transnistria",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        access_class="C_SPORTS_COMPLEX_AMENITY",
        transnistria=True,
        notes="Rîbnița — sports complex amenity vs consumer gym unresolved",
    )

    # ------------------------------------------------------------------
    # INTERNATIONAL chain probes (0 MD)
    # ------------------------------------------------------------------
    for brand in [
        "Basic-Fit",
        "Anytime Fitness",
        "Fitness Park",
        "PureGym",
        "McFIT",
        "JOHN REED",
        "Gold's Gym",
        "World Class",
        "SmartFit",
        "18GYM",
        "FitActive",
        "Stay Fit Gym",
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} Moldova probe",
            address="No verified Moldova location",
            city="Chișinău",
            postal="MD-2001",
            source_url="phase1://moldova/international-probe",
            excluded=True,
            discovery_class="international_chain_probe",
            operator_class="C",
            notes="International/regional probe — no verified current Moldova estate",
        )

    # ------------------------------------------------------------------
    # CROSS-BORDER contamination probes (must stay EXCLUDED)
    # ------------------------------------------------------------------
    border = [
        ("Romania", "Iași", "RO-700001", 47.1585, 27.6014, "Romania Iași border probe"),
        ("Romania", "Huși", "RO-735100", 46.6736, 28.0597, "Romania Huși border probe"),
        ("Romania", "Galați", "RO-800001", 45.4353, 28.0080, "Romania Galați border probe"),
        ("Romania", "Botoșani", "RO-710001", 47.7467, 26.6667, "Romania Botoșani border probe"),
        ("Ukraine", "Chernivtsi", "58000", 48.2917, 25.9352, "Ukraine Chernivtsi border probe"),
        ("Ukraine", "Mohyliv-Podilskyi", "24000", 48.4450, 27.7980, "Ukraine Mohyliv-Podilskyi border probe"),
        ("Ukraine", "Odesa", "65000", 46.4825, 30.7233, "Ukraine Odesa region border probe"),
    ]
    for territory, city, postal, lat, lng, notes in border:
        add(
            rows,
            brand="Border probe",
            name=f"Border probe {city}",
            address=f"{city} center (contamination test)",
            city=city,
            postal=postal,
            source_url="phase1://moldova/border-probe",
            lat=lat,
            lng=lng,
            coord_source="CITY_CENTER_PROBE",
            excluded=True,
            discovery_class="foreign_border_probe",
            territory=territory,
            notes=notes,
        )

    # Fix territory/country on border probes (base_row used Moldova)
    for r in rows:
        if r.get("discovery_class") == "foreign_border_probe":
            # re-set from notes
            if "Romania" in (r.get("notes") or ""):
                r["country"] = "Romania"
                r["territory"] = "Romania"
            elif "Ukraine" in (r.get("notes") or ""):
                r["country"] = "Ukraine"
                r["territory"] = "Ukraine"
            r["import_category"] = "EXCLUDED"

    # Persist evidence snapshot
    (PAGES / "bigsport_official_clubs.txt").write_text(
        "\n".join(n for n, *_ in bigsport) + "\n", encoding="utf-8"
    )
    (PAGES / "energy_fitness_contacte.txt").write_text(
        "bd. Dacia 31/1; bd. Dm. Cantemir 6; str. N. Testemițanu 29/5\n",
        encoding="utf-8",
    )

    write_json(OUT / "moldova_phase1_candidates.json", rows)
    print(f"Moldova Phase 1 discover: {len(rows)} candidates written")
    print(f"production_sha256={sha} total={len(centers)} md_prod=0")


if __name__ == "__main__":
    main()
