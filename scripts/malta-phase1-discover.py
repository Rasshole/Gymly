#!/usr/bin/env python3
"""Malta Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_mt_postal,
    write_json,
)

OUT = ROOT / "data/malta"
PHASE1 = OUT / "phase1"
for d in (OUT, OUT / "raw", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

CLASS_A_OFFICIAL = {
    "Best Gyms Malta": 10,
    "24/7 Fitness Club": 4,
    "Challenger Fitness": 4,
}

CITY_CANON = {
    "sliema": "Sliema",
    "tas-sliema": "Sliema",
    "st julian's": "St Julian's",
    "st julians": "St Julian's",
    "san ġiljan": "St Julian's",
    "san giljan": "St Julian's",
    "gżira": "Gżira",
    "gzira": "Gżira",
    "il-gżira": "Gżira",
    "msida": "Msida",
    "birkirkara": "Birkirkara",
    "mosta": "Mosta",
    "il-mosta": "Mosta",
    "qormi": "Qormi",
    "ħal qormi": "Qormi",
    "pembroke": "Pembroke",
    "mellieħa": "Mellieħa",
    "mellieha": "Mellieħa",
    "san ġwann": "San Ġwann",
    "san gwann": "San Ġwann",
    "st paul's bay": "St Paul's Bay",
    "san pawl il-baħar": "St Paul's Bay",
    "san pawl il-bahar": "St Paul's Bay",
    "buġibba": "St Paul's Bay",
    "bugibba": "St Paul's Bay",
    "qawra": "St Paul's Bay",
    "attard": "Attard",
    "ħ'attard": "Attard",
    "ta' qali": "Attard",
    "ta qali": "Attard",
    "żebbuġ": "Żebbuġ",
    "zebbug": "Żebbuġ",
    "ħaż-żebbuġ": "Żebbuġ",
    "kirkop": "Kirkop",
    "ħal kirkop": "Kirkop",
    "marsa": "Marsa",
    "il-marsa": "Marsa",
    "birżebbuġa": "Birżebbuġa",
    "birzebbuga": "Birżebbuġa",
    "birgu": "Birgu",
    "vittoriosa": "Birgu",
    "valletta": "Valletta",
    "il-belt valletta": "Valletta",
    "marsaskala": "Marsaskala",
    "marsascala": "Marsaskala",
    "wied il-għajn": "Marsaskala",
    "cospicua": "Bormla",
    "bormla": "Bormla",
    "cottonera": "Bormla",
    "mrieħel": "Mrieħel",
    "mriehel": "Mrieħel",
    "victoria": "Victoria",
    "rabat gozo": "Victoria",
    "ir-rabat gozo": "Victoria",
    "victoria gozo": "Victoria",
    "rabat": "Rabat",
    "ir-rabat": "Rabat",
    "xewkija": "Xewkija",
    "ix-xewkija": "Xewkija",
    "fgura": "Fgura",
    "santa venera": "Santa Venera",
    "swieqi": "Swieqi",
    "naxxar": "Naxxar",
    "żurrieq": "Żurrieq",
    "zurrieq": "Żurrieq",
    "floriana": "Floriana",
    "pietà": "Pietà",
    "pieta": "Pietà",
    "ta' xbiex": "Ta' Xbiex",
    "swatar": "Swatar",
    "iklin": "Iklin",
    "lija": "Lija",
    "balzan": "Balzan",
    "għargħur": "Għargħur",
    "gharghur": "Għargħur",
    "mdina": "Mdina",
    "ħamrun": "Ħamrun",
    "hamrun": "Ħamrun",
    "paola": "Paola",
    "tarxien": "Tarxien",
    "żabbar": "Żabbar",
    "zabbar": "Żabbar",
    "żejtun": "Żejtun",
    "zejtun": "Żejtun",
    "marsaxlokk": "Marsaxlokk",
    "senglea": "Senglea",
    "isla": "Senglea",
    "kalkara": "Kalkara",
    "luqa": "Luqa",
    "gudja": "Gudja",
    "safi": "Safi",
    "mqabba": "Mqabba",
    "siġġiewi": "Siġġiewi",
    "siggiewi": "Siġġiewi",
    "ghajnsielem": "Għajnsielem",
    "għajnsielem": "Għajnsielem",
    "nadur": "Nadur",
    "qala": "Qala",
    "marsalforn": "Marsalforn",
    "xagħra": "Xagħra",
    "xaghra": "Xagħra",
    "xlendi": "Xlendi",
    "sannat": "Sannat",
    "comino": "Comino",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or CITY_CANON.get(key.replace("'", "'")) or s


def prod_row(c: dict) -> dict:
    return base_row(
        prefix="mt_",
        country="Malta",
        brand=c["brand"],
        name=c["name"],
        address=c["address"],
        postal_code=format_mt_postal(str(c.get("postal_code", ""))) or str(c.get("postal_code", "")),
        city=canon_city(c["city"]),
        source_url=c.get("website") or c.get("source_url") or "production_hydrate",
        lat=c.get("lat"),
        lng=c.get("lng"),
        coord_source=c.get("coord_source") or "KNOWN_PREMISES_HYDRATE",
        notes="existing_production_hydrate",
        discovery_class="national_chain",
        chain_key=(c.get("brand") or "").lower().replace(" ", "_").replace("-", "_"),
    )


def hydrate_production(rows: list[dict]) -> tuple[list[dict], int]:
    catalog = json.loads(CENTERS.read_text())
    mt = [c for c in catalog if str(c.get("id", "")).startswith("mt_")]
    for c in mt:
        row = prod_row(c)
        row["id"] = c["id"]
        row["import_category"] = "EXISTING_PRODUCTION"
        row["phase1_disposition"] = "KEEP_EXISTING"
        row["verification_status"] = "VERIFIED_CURRENT"
        row["eligibility"] = "CHAIN_CLASS_A"
        row["classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
        row["operator_class"] = "A"
        row["island"] = "Gozo" if canon_city(c.get("city", "")) in ("Victoria", "Xewkija") else "Malta"
        row["production_snapshot"] = {
            k: c.get(k)
            for k in (
                "id",
                "name",
                "brand",
                "address",
                "postal_code",
                "city",
                "country",
                "lat",
                "lng",
                "is_active",
                "is_coming_soon",
            )
        }
        rows.append(row)
    return mt, len(mt)


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
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "A",
    island: str = "Malta",
) -> None:
    row = base_row(
        prefix="mt_",
        country="Malta",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_mt_postal(postal) or postal,
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
    row["island"] = island
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
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
        row["verification_status"] = "NEEDS_REVIEW"
    elif import_category:
        row["import_category"] = import_category
    rows.append(row)


def stage_coming_soon(rows: list[dict]) -> None:
    BGM = "https://bestgymsmalta.com"
    add(
        rows,
        brand="Best Gyms Malta",
        name="BGM Birgu Fitness Centre",
        address="Birgu / Vittoriosa (site under development)",
        city="Birgu",
        postal="BRG 1810",
        source_url=f"{BGM}/gyms/bgm-birgu-fitness-centre/",
        lat=35.885171,
        lng=14.521196,
        coord_source="OFFICIAL_MAP_PIN",
        notes="Official page: Coming Soon; not yet in production",
        coming=True,
        chain_key="best_gyms_malta",
        operator_class="A",
    )


def stage_closed(rows: list[dict]) -> None:
    CHAL = "http://challengermalta.com"
    F247 = "https://fitnessclub247.com"
    add(
        rows,
        brand="Challenger Fitness",
        name="Challenger Fitness Centre Paceville (legacy)",
        address="St George's Park, Paceville",
        city="St Julian's",
        source_url=f"{CHAL}/contact.php",
        notes="Present on older directories; absent from current official 4-location contact list",
        closed=True,
        discovery_class="legacy_probe",
        chain_key="challenger_fitness",
        operator_class="A",
        import_category="CLOSED",
    )
    for nm, city, note in [
        ("24/7 Fitness Club Santa Luċija (legacy listing)", "Santa Luċija", "Secondary blog listing; not on official 4-club locator"),
        ("24/7 Fitness Club St Paul's Bay (legacy listing)", "St Paul's Bay", "Secondary blog listing; not on official 4-club locator"),
    ]:
        add(
            rows,
            brand="24/7 Fitness Club",
            name=nm,
            address="Unresolved legacy listing",
            city=city,
            source_url=f"{F247}/",
            notes=note,
            closed=True,
            discovery_class="legacy_probe",
            chain_key="fitness_club_247",
            operator_class="A",
            import_category="CLOSED",
        )


def stage_excluded(rows: list[dict]) -> None:
    exclusions = [
        (
            "Fort Fitness",
            "Fort Fitness Sliema",
            "Fort Cambridge Level -2, Tigné Street",
            "Sliema",
            "SLM 3175",
            "https://fortfitness.com.mt/contact-us/",
            35.9065,
            14.5100,
            "PREMISES_PIN",
            "Class E (2 locations); below ≥3 Class A threshold — optional independent phase",
        ),
        (
            "Fort Fitness",
            "Fort Fitness Mrieħel",
            "The Quad Central, Mrieħel By-Pass",
            "Mrieħel",
            "BKR 3000",
            "https://fortfitness.live/",
            35.8905,
            14.4610,
            "PREMISES_PIN",
            "Class E second club; strong independent but below chain threshold",
        ),
        (
            "Kinetika Gozo",
            "Kinetika Victoria (K1)",
            "2nd Floor, The Tower, Triq Fortunato",
            "Victoria",
            "VCT 2571",
            "https://kinetikagozo.com/",
            36.0444,
            14.2410,
            "PREMISES_PIN",
            "Class E (2 Gozo clubs); below ≥3 threshold",
        ),
        (
            "Kinetika Gozo",
            "Kinetika Xewkija (K2)",
            "Triq Jean De La Valette",
            "Xewkija",
            "XWK 1028",
            "https://kinetikagozo.com/",
            36.0351249,
            14.2575693,
            "STRICT_ADDRESS_GEOCODE",
            "Class E second Gozo club",
        ),
        (
            "Cynergi",
            "Cynergi Health & Fitness Club",
            "St George's Bay",
            "St Julian's",
            "",
            "https://cynergi.com.mt/",
            35.9285,
            14.4890,
            "PREMISES_PIN",
            "Class E single large wellness/fitness club",
        ),
        (
            "ActiveZone",
            "ActiveZone Fitness Club",
            "59 Triq il-Parilja",
            "Santa Venera",
            "SVA 1930",
            "https://www.activezonefitnessclub.com/",
            35.8895,
            14.4785,
            "PREMISES_PIN",
            "Class E single location",
        ),
        (
            "Marion Mizzi Wellbeing",
            "Marion Mizzi Wellbeing Fgura",
            "Zabbar Road",
            "Fgura",
            "FGR 1012",
            "https://www.marionmizzi.com/locations",
            None,
            None,
            None,
            "Class C spa/wellness network; not conventional public gym",
        ),
        (
            "Marion Mizzi Wellbeing",
            "Marion Mizzi Wellbeing Sliema",
            "AX Palace Hotel, High Street",
            "Sliema",
            "SLM 1542",
            "https://www.marionmizzi.com/locations",
            None,
            None,
            None,
            "Hotel-sited wellness; restricted access model",
        ),
        (
            "Marion Mizzi Wellbeing",
            "Marion Mizzi Wellbeing Mellieħa",
            "Maritim Antonine Hotel & Spa, George Borg Olivier Street",
            "Mellieħa",
            "",
            "https://www.marionmizzi.com/locations",
            None,
            None,
            None,
            "Hotel-sited wellness; restricted access model",
        ),
        (
            "Warehouse Fitness",
            "Warehouse Fitness Studio Gżira",
            "Warehouse Basement / OG, Gżira",
            "Gżira",
            "",
            "https://app.punchpass.com/org/4760/classes",
            None,
            None,
            None,
            "Specialist functional/HYROX studio — not conventional gym",
        ),
        (
            "LivingWell",
            "LivingWell Malta probe",
            "n/a",
            "Sliema",
            "",
            "phase1_hotel_probe",
            None,
            None,
            None,
            "Hotel/resort gym probe — no independent public conventional gym evidence",
        ),
        (
            "Tal-Qroqq Fitness Centre",
            "Tal-Qroqq (independent era legacy)",
            "National Pool Complex",
            "Gżira",
            "",
            "https://bestgymsmalta.com/gyms/tal-qroqq-fitness-centre/",
            None,
            None,
            None,
            "Legacy independent identity — successor is BGM Tal-Qroqq in production",
        ),
        (
            "Elite Gym",
            "Elite Fitness Birżebbuġa (legacy)",
            "Triq il-Bajja s-Sabiħa",
            "Birżebbuġa",
            "",
            "https://bestgymsmalta.com/gyms/bgm-birzebbuga-fitness/",
            None,
            None,
            None,
            "Legacy predecessor — successor BGM Birżebbuġa in production",
        ),
        (
            "Build Gym",
            "Build Gym Sirens (legacy name)",
            "Sirens ASC, Triq San Ġeraldu",
            "St Paul's Bay",
            "",
            "https://bestgymsmalta.com/gyms/build-fitness-centre/",
            None,
            None,
            None,
            "Legacy Build Gym name — successor Build Fitness Centre (BGM) in production",
        ),
    ]
    for brand, name, addr, city, postal, url, lat, lng, cs, notes in exclusions:
        kwargs = dict(
            brand=brand,
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes=notes,
            excluded=True,
            discovery_class="class_e_probe" if "Class E" in notes else "legacy_excluded",
            operator_class="E" if "Class E" in notes else "F",
        )
        if lat is not None:
            kwargs["lat"] = lat
            kwargs["lng"] = lng
            kwargs["coord_source"] = cs
        add(rows, **kwargs)

    for brand, note in [
        ("Anytime Fitness", "No current Malta conventional club locator evidence"),
        ("Snap Fitness", "No Malta market presence verified"),
        ("Fitness24Seven", "No Malta presence"),
        ("Basic-Fit", "No Malta market presence in current Basic-Fit estate"),
        ("PureGym", "No Malta presence"),
        ("McFIT", "No Malta presence"),
        ("FITINN", "No Malta presence"),
        ("clever fit", "No Malta presence"),
        ("Gold's Gym", "No current Malta chain presence"),
        ("World Class", "No Malta presence"),
        ("Virgin Active", "No Malta presence"),
        ("JOHN REED", "No Malta presence"),
        ("Fitness First", "No current Malta conventional chain presence"),
        ("JIMS", "No Malta presence"),
        ("Keep Cool", "No Malta presence"),
        ("Fitness Park", "No Malta presence"),
        ("L'Orange Bleue", "No Malta presence"),
        ("MyFitness", "No Malta presence"),
        ("Lemon Gym", "No Malta presence"),
        ("Gym!", "No Malta presence"),
        ("Impuls", "No Malta presence"),
        ("Fitness Factory", "Company registry name only; no public multi-club chain evidence"),
        ("Street Elements", "No defensible conventional multi-location chain evidence"),
        ("The Gym", "Ambiguous local name; no ≥3 conventional chain confirmed"),
        ("Fitness Point", "No ≥3 location conventional chain evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} Malta (absent)",
            address="n/a",
            city="Malta",
            source_url="phase1_market_audit",
            notes=note,
            discovery_class="market_audit_exclusion",
            chain_key=brand.lower().replace(" ", "_").replace("!", "").replace("'", ""),
            operator_class="F",
            import_category="EXCLUDED",
            excluded=True,
            access_class="F_excluded",
        )


def stage_needs_review(rows: list[dict]) -> None:
    add(
        rows,
        brand="Best Gyms Malta",
        name="Fitness Café San Pawl (secondary listing)",
        address="Sirens / Buġibba cluster (unresolved)",
        city="St Paul's Bay",
        source_url="phase1_rebrand_probe",
        notes="Secondary blog name near Build Fitness Centre / Sirens ASC — Phase 2 name relationship clarification",
        needs_review=True,
        discovery_class="rebrand_probe",
        chain_key="best_gyms_malta",
        operator_class="A",
    )


def stage_municipal_audits(rows: list[dict]) -> None:
    audits = [
        ("Msida", "Central harbour audit — Tal-Qroqq BGM in adjacent Gżira; no separate Msida club"),
        ("Floriana", "Valletta harbour audit — Challenger Valletta serves area; no Floriana-specific club"),
        ("Pietà", "Central harbour audit — no qualifying conventional gym in Pietà proper"),
        ("Ta' Xbiex", "Harbour audit — no qualifying gym; Sliema/Gżira chains nearby"),
        ("Swatar", "Birkirkara orbit — Birkirkara BGM serves area; no Swatar-specific club"),
        ("Swieqi", "North harbour audit — Pembroke/Neptunes BGM nearby; no Swieqi-specific club"),
        ("Iklin", "Central Malta audit — no Class A chain presence verified"),
        ("Lija", "Central Malta audit — no Class A chain presence verified"),
        ("Balzan", "Central Malta audit — no Class A chain presence verified"),
        ("Naxxar", "North Malta audit — no Class A chain presence verified"),
        ("Għargħur", "North Malta audit — no Class A chain presence verified"),
        ("Mdina", "Rabat/Mdina audit — no qualifying gym in historic Mdina"),
        ("Rabat", "Malta island Rabat audit — distinct from Victoria/Rabat Gozo; no Class A club"),
        ("Ħamrun", "Central harbour audit — no Class A chain presence verified"),
        ("Paola", "South Malta audit — no Class A chain presence verified"),
        ("Tarxien", "South Malta audit — no Class A chain presence verified"),
        ("Fgura", "South Malta audit — Marion Mizzi wellness excluded; no conventional gym"),
        ("Żabbar", "South-east audit — no Class A chain presence verified"),
        ("Żejtun", "South-east audit — no Class A chain presence verified"),
        ("Marsaxlokk", "South-east audit — no Class A chain presence verified"),
        ("Senglea", "Three Cities audit — Cottonera Challenger serves area; no Isla-specific club"),
        ("Kalkara", "Three Cities audit — Cottonera Challenger nearby; no Kalkara-specific club"),
        ("Luqa", "South Malta audit — no Class A chain presence verified"),
        ("Gudja", "South Malta audit — no Class A chain presence verified"),
        ("Żurrieq", "South Malta audit — Kirkop BGM nearby; no Żurrieq-specific club"),
        ("Safi", "South Malta audit — no Class A chain presence verified"),
        ("Mqabba", "South Malta audit — no Class A chain presence verified"),
        ("Siġġiewi", "West Malta audit — no Class A chain presence verified"),
        ("Santa Venera", "Central audit — ActiveZone Class E excluded; no Class A club"),
        ("Victoria", "Gozo audit — Kinetika Class E (2) only; no Class A Gozo chain"),
        ("Xewkija", "Gozo audit — Kinetika Class E only; no Class A chain"),
        ("Għajnsielem", "Gozo audit — no qualifying conventional gym verified"),
        ("Nadur", "Gozo audit — no qualifying conventional gym verified"),
        ("Qala", "Gozo audit — no qualifying conventional gym verified"),
        ("Marsalforn", "Gozo audit — no qualifying conventional gym verified"),
        ("Xagħra", "Gozo audit — no qualifying conventional gym verified"),
        ("Xlendi", "Gozo audit — no qualifying conventional gym verified"),
        ("Sannat", "Gozo audit — no qualifying conventional gym verified"),
        ("Comino", "Comino audit — no qualifying public conventional gym exists"),
    ]
    for city, notes in audits:
        add(
            rows,
            brand="Municipal audit",
            name=f"Malta Phase 1 municipal audit — {city}",
            address="N/A",
            city=city,
            source_url="phase1_municipal_sweep",
            notes=notes,
            needs_review=True,
            discovery_class="municipal_audit",
            operator_class="M",
        )


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "Best Gyms Malta", "action": "CLASS_A_COMPLETE_OPEN", "evidence": "10/10 open in production; Birgu COMING_SOON"},
        {"chain": "24/7 Fitness Club", "action": "CLASS_A_COMPLETE", "evidence": "4/4 official clubs in production"},
        {"chain": "Challenger Fitness", "action": "CLASS_A_COMPLETE", "evidence": "4/4 official clubs in production; Paceville legacy CLOSED"},
        {"chain": "Fort Fitness", "action": "EXCLUDED_CLASS_E", "evidence": "2 sites — below ≥3 threshold"},
        {"chain": "Kinetika Gozo", "action": "EXCLUDED_CLASS_E", "evidence": "2 Gozo sites — below threshold"},
        {"chain": "Cynergi", "action": "EXCLUDED_CLASS_E", "evidence": "Single large club"},
        {"chain": "ActiveZone", "action": "EXCLUDED_CLASS_E", "evidence": "Single location"},
        {"chain": "Marion Mizzi Wellbeing", "action": "EXCLUDED_WELLNESS", "evidence": "Spa/hotel wellness network"},
        {"chain": "Anytime/Snap/Basic-Fit/PureGym/McFIT/FITINN/clever fit/Gold's/World Class/Virgin Active", "action": "ABSENT", "evidence": "No Malta presence"},
    ]


def write_postcode_model() -> None:
    write_json(
        OUT / "MALTA_POSTCODE_MODEL.json",
        {
            "country": "Malta",
            "canonical_format": "AAA NNNN",
            "storage_format": "3 uppercase locality letters, single space, 4 digits",
            "regex": "^[A-Z]{3} \\d{4}$",
            "whitespace_normalization": "single ASCII space between code and digits",
            "uppercase_rules": "locality code uppercase; digits as-is",
            "locality_code_in_postcode": True,
            "legitimate_variants": [
                "Some premises reverse-geocode to adjacent locality codes (e.g. SWQ for Pembroke, ZRQ near Kirkop border)"
            ],
            "examples": ["SLM 3175", "BKR 1610", "VCT 2571", "TPO 0001", "MLH 1107"],
            "source": "MaltaPost addressing; aligned with src/utils/gymCountry.ts MALTA_POSTAL_RE",
            "validation_function": "format_mt_postal() in batch1_phase1_common.py",
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "MALTA_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Malta",
            "aliases": [
                {"canonical": "St Julian's", "variants": ["San Ġiljan", "San Giljan", "St Julians", "Paceville"]},
                {"canonical": "St Paul's Bay", "variants": ["San Pawl il-Baħar", "San Pawl il-Bahar", "Buġibba", "Bugibba", "Qawra"]},
                {"canonical": "Victoria", "variants": ["Rabat (Gozo)", "Ir-Rabat Għawdex", "Victoria Gozo"]},
                {"canonical": "Birgu", "variants": ["Vittoriosa", "Città Vittoriosa"]},
                {"canonical": "Bormla", "variants": ["Cospicua", "Cottonera"]},
                {"canonical": "Senglea", "variants": ["Isla", "L-Isla"]},
                {"canonical": "Gżira", "variants": ["Gzira", "Il-Gżira"]},
                {"canonical": "Żebbuġ", "variants": ["Zebbug", "Ħaż-Żebbuġ"]},
                {"canonical": "Żabbar", "variants": ["Zabbar", "Ħaż-Żabbar"]},
                {"canonical": "Żejtun", "variants": ["Zejtun", "Iż-Żejtun"]},
                {"canonical": "Żurrieq", "variants": ["Zurrieq", "Ħaż-Żurrieq"]},
                {"canonical": "Siġġiewi", "variants": ["Siggiewi", "Is-Siġġiewi"]},
                {"canonical": "Għargħur", "variants": ["Gharghur", "Ħal Għargħur"]},
                {"canonical": "Għajnsielem", "variants": ["Ghajnsielem"]},
                {"canonical": "Xagħra", "variants": ["Xaghra", "Iż-Żaghra"]},
                {"canonical": "Mellieħa", "variants": ["Mellieha", "Il-Mellieħa"]},
                {"canonical": "Attard", "variants": ["Ħ'Attard", "Ta' Qali"]},
                {"canonical": "Marsaskala", "variants": ["Marsascala", "Wied il-Għajn"]},
            ],
            "notes": "Gozo is part of Malta country; Comino is part of Malta; do not treat as separate countries",
        },
    )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"MALTA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    rows: list[dict] = []
    prod_rows, mt_live = hydrate_production(rows)

    by_brand: dict[str, int] = {}
    for c in prod_rows:
        by_brand[c["brand"]] = by_brand.get(c["brand"], 0) + 1

    inventory = {
        "country": "Malta",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "malta_live": mt_live,
        "mt_prefix_live": mt_live,
        "existing_malta_production": mt_live > 0,
        "market_model": "CHAIN_LED",
        "postcode_model": "AAA NNNN (3-letter locality + 4 digits)",
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "Best Gyms Malta": {"open_active": 10, "coming_soon": 1, "source": "https://bestgymsmalta.com/our-gyms/"},
            "24/7 Fitness Club": {"open_active": 4, "source": "https://fitnessclub247.com/gyms-in-malta/"},
            "Challenger Fitness": {"open_active": 4, "source": "http://challengermalta.com/contact.php"},
        },
        "final_missed_chain_sweep": {
            "complete": True,
            "new_class_a_found": False,
            "notes": "No additional ≥3 conventional public gym operator beyond BGM / 24/7 / Challenger",
        },
        "final_missed_gym_sweep": {
            "complete": True,
            "new_candidates": 0,
            "notes": "Nationwide gym/fitness/ġinnasju sweep confirms Class A triad complete for open clubs",
        },
    }
    for brand, count in sorted(by_brand.items()):
        official = CLASS_A_OFFICIAL.get(brand, count)
        inventory["chains"].append(
            {
                "chain": brand,
                "classification": "A" if count >= 3 else "E",
                "open_active_production": count,
                "official_current_active": official,
                "class_a": count >= 3,
                "source": "production_hydrate + official estate audit",
                "verdict": "COMPLETE" if count >= official else "GAP",
            }
        )

    stage_coming_soon(rows)
    stage_closed(rows)
    stage_excluded(rows)
    stage_needs_review(rows)
    stage_municipal_audits(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "malta_phase1_candidates.json", rows)
    write_json(OUT / "malta_chain_inventory.json", inventory)
    write_json(
        OUT / "MALTA_EXISTING_PRODUCTION_SNAPSHOT.json",
        [r for r in rows if r.get("import_category") == "EXISTING_PRODUCTION"],
    )

    rebrand = {
        "country": "Malta",
        "phase": 1,
        "relationships": [
            {
                "from": "Elite Gym / Elite Fitness Birżebbuġa",
                "to": "BGM Birżebbuġa Fitness",
                "class": "A_current_successor",
                "evidence": "Official BGM directions still label Elite Gym",
                "action": "exclude_predecessor",
            },
            {
                "from": "Tal-Qroqq Fitness Centre (independent era)",
                "to": "Best Gyms Malta Tal-Qroqq",
                "class": "A_current_successor",
                "evidence": "Facility name retained under BGM all-access network",
                "action": "stage_current_bgm_only",
            },
            {
                "from": "Build Gym / Sirens ASC gym",
                "to": "Build Fitness Centre (Best Gyms Malta)",
                "class": "A_current_successor",
                "evidence": "Build branding retained as BGM club name",
                "action": "stage_current_bgm_only",
            },
            {
                "from": "Challenger Paceville / St George's Park",
                "to": None,
                "class": "E_legacy_closed",
                "evidence": "Absent from current official Challenger contact list",
                "action": "closed_legacy",
            },
            {
                "from": "Fitness Café San Pawl (secondary blog)",
                "to": "Build Fitness Centre",
                "class": "F_unresolved",
                "evidence": "May be same Sirens cluster or distinct — Phase 2 name clarification",
                "action": "phase2_review",
            },
            {
                "from": "24/7 Santa Luċija / St Paul's Bay blog listings",
                "to": None,
                "class": "E_legacy_closed",
                "evidence": "Not on official 4-club locator",
                "action": "closed_legacy",
            },
        ],
        "unresolved_conflicts": 1,
    }
    write_json(OUT / "MALTA_PHASE1_REBRAND_MAP.json", rebrand)
    write_postcode_model()
    write_locality_alias_map()

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != PRE_SHA:
        raise SystemExit(f"Production modified during discover: {post}")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    from collections import Counter

    statuses = Counter(r.get("import_category") for r in rows)
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "malta_live": mt_live,
                "existing_production": mt_live,
                "statuses": dict(statuses),
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
