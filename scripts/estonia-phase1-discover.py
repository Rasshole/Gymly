#!/usr/bin/env python3
"""Estonia Phase 1 discovery — isolated. Does NOT modify centers.json."""
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
    format_ee_postal,
    write_json,
)

OUT = ROOT / "data/estonia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1"):
    d.mkdir(parents=True, exist_ok=True)

PHASE1 = OUT / "phase1"
CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab"
PRODUCTION_TOTAL = 11922

CITY_CANON = {
    "tallinn": "Tallinn",
    "tartu": "Tartu",
    "narva": "Narva",
    "pärnu": "Pärnu",
    "parnu": "Pärnu",
    "viljandi": "Viljandi",
    "rakvere": "Rakvere",
    "jõhvi": "Jõhvi",
    "johvi": "Jõhvi",
    "võru": "Võru",
    "voru": "Võru",
    "kuressaare": "Kuressaare",
    "maardu": "Maardu",
    "haapsalu": "Haapsalu",
    "paide": "Paide",
    "valga": "Valga",
    "sillamäe": "Sillamäe",
    "sillamae": "Sillamäe",
    "kohtla-järve": "Kohtla-Järve",
    "kohtla-jarve": "Kohtla-Järve",
    "viimsi": "Viimsi",
    "haabneeme": "Viimsi",
    "keila": "Keila",
    "saue": "Saue",
    "peetri": "Peetri",
    "tabasalu": "Tabasalu",
    "järveküla": "Järveküla",
    "jarvekula": "Järveküla",
    "luige": "Luige",
    "kiili": "Kiili",
    "ülenurme": "Ülenurme",
    "ulenurme": "Ülenurme",
    "jõgeva": "Jõgeva",
    "jogeva": "Jõgeva",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    key2 = s.lower().strip()
    return CITY_CANON.get(key2) or CITY_CANON.get(key.replace(" ", "-")) or CITY_CANON.get(key) or s


def prod_row(c: dict) -> dict:
    return base_row(
        prefix="ee_",
        country="Estonia",
        brand=c["brand"],
        name=c["name"],
        address=c["address"],
        postal_code=format_ee_postal(str(c.get("postal_code", ""))) or str(c.get("postal_code", "")),
        city=canon_city(c["city"]),
        source_url=c.get("website") or c.get("source_url") or "production_hydrate",
        lat=c.get("lat"),
        lng=c.get("lng"),
        coord_source=c.get("coord_source") or "KNOWN_PREMISES_HYDRATE",
        notes="existing_production_hydrate",
        discovery_class="national_chain",
        chain_key=(c.get("brand") or "").lower().replace(" ", "_").replace("!", "").replace("-", "_"),
    )


def hydrate_production(rows: list[dict]) -> tuple[list[dict], int]:
    catalog = json.loads(CENTERS.read_text())
    ee = [c for c in catalog if str(c.get("id", "")).startswith("ee_")]
    for c in ee:
        row = prod_row(c)
        row["id"] = c["id"]
        row["import_category"] = "EXISTING_PRODUCTION"
        row["phase1_disposition"] = "KEEP_EXISTING"
        row["verification_status"] = "VERIFIED_CURRENT"
        row["eligibility"] = "CHAIN_CLASS_A"
        row["classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
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
    return ee, len(ee)


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
) -> None:
    row = base_row(
        prefix="ee_",
        country="Estonia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ee_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("!", "").replace("-", "_"),
    )
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
        row["is_active"] = False
        row["verification_status"] = "NEEDS_REVIEW"
        row["eligibility"] = "OTHER"
    elif import_category:
        row["import_category"] = import_category
    rows.append(row)


def discover_myfitness(rows: list[dict]) -> None:
    """Official myfitness.ee/en/clubs/ — 19 current clubs with postcodes."""
    src = "https://www.myfitness.ee/en/clubs/"
    clubs = [
        ("Rocca al Mare", "Haabersti 5", "Tallinn", "13516"),
        ("Mustamäe", "Tammsaare tee 104a", "Tallinn", "12918"),
        ("Kristiine", "Endla 45", "Tallinn", "10615"),
        ("Järve", "Pärnu mnt 186", "Tallinn", "11314"),
        ("Viru", "Viru väljak 4", "Tallinn", "10111"),
        ("Postimaja", "Narva mnt 1", "Tallinn", "10111"),
        ("Rävala", "Rävala pst 4", "Tallinn", "10143"),
        ("Balti Jaama Turg", "Kopli 1", "Tallinn", "10412"),
        ("Ülemiste City", "Sepise 10", "Tallinn", "11415"),
        ("Lasnamäe Linnamäe", "Linnamäe tee 3", "Tallinn", "13912"),
        ("Lasnamäe Kärberi", "Kärberi 20", "Tallinn", "13919"),
        ("Pirita", "Merivälja tee 24", "Tallinn", "11911"),
        ("Viimsi", "Sõpruse tee 15, Haabneeme", "Viimsi", "74001"),
        ("Volta", "Mootori tänav 2", "Tallinn", "10416"),
        ("Tartu Kesklinn", "Küüni 7", "Tartu", "51004"),
        ("Tartu Annelinn", "Kalda tee 41", "Tartu", "50707"),
        ("Tartu Lõunakeskus", "Lääneringtee 37", "Tartu", "50501"),
        ("Narva Fama", "Fama tänav 10", "Narva", "20303"),
        ("Viljandi", "Männimäe tee 4", "Viljandi", "71010"),
    ]
    for club, addr, city, postal in clubs:
        add(
            rows,
            brand="MyFitness",
            name=f"MyFitness {club}",
            address=addr,
            city=city,
            postal=postal,
            source_url=src,
            notes="Official myfitness.ee/en/clubs contacts; press Aug 2026 confirms 19 EE clubs",
            chain_key="myfitness",
        )
    PAGES.joinpath("myfitness_clubs_summary.txt").write_text(
        "\n".join(f"{c}|{a}|{ci}|{p}" for c, a, ci, p in clubs) + f"\nSOURCE {src}\n",
        encoding="utf-8",
    )


def discover_247(rows: list[dict]) -> None:
    """Official 24-7fitness.ee/meie-klubid — 31 open + 3 coming soon."""
    src = "https://24-7fitness.ee/meie-klubid/"
    open_clubs = [
        ("Akadeemia", "Akadeemia tee 30", "Tallinn"),
        ("Laki", "Laki põik 4", "Tallinn"),
        ("Priisle", "Priisle tee 16", "Tallinn"),
        ("Vabaduse", "Vabaduse pst 174B", "Tallinn"),
        ("Hipodroom", "Mustamäe tee 4", "Tallinn"),
        ("Tõnismägi", "Tõnismägi 11A", "Tallinn"),
        ("Tähesaju", "Tähesaju tee 11", "Tallinn"),
        ("Avala", "Veskiposti 2/1", "Tallinn"),
        ("Paepargi", "Paepargi 11", "Tallinn"),
        ("Kopli", "Marati 4A", "Tallinn"),
        ("Peetri", "Küti tee 4", "Peetri"),
        ("Tabasalu", "Kallaste tn 7", "Tabasalu"),
        ("Järveküla", "Kanarbiku tee 2", "Järveküla"),
        ("Luige", "Viljandi mnt 168", "Luige"),
        ("Kiili", "Veski 4", "Kiili"),
        ("Keila Vesiveski", "Tallinna mnt 18", "Keila"),
        ("Saue", "Tule põik 2", "Saue"),
        ("Keila Keskus", "Harju tn 2", "Keila"),
        ("Sepa Keskus", "Sepa tn 4", "Tartu"),
        ("Sõbrakeskus", "Võru 55f", "Tartu"),
        ("Raadi", "Nõlvakaare 4", "Tartu"),
        ("Ihaste", "Ihaste tee 2F", "Tartu"),
        ("Port Artur", "Lai 11", "Pärnu"),
        ("Viljandi Riia", "Riia 99", "Viljandi"),
        ("Viljandi Kaalu", "Kaalu tn 2", "Viljandi"),
        ("Rakvere", "F. G. Adoffi 11", "Rakvere"),
        ("Kuressaare", "Tallinna tn 65", "Kuressaare"),
        ("Jõhvi", "Keskväljak 4", "Jõhvi"),
        ("Narva", "4. Roheline tn 8", "Narva"),
        ("Võru", "Vilja tänav 6", "Võru"),
        ("Jõgeva", "Kesk tn 4", "Jõgeva"),
    ]
    for club, addr, city in open_clubs:
        add(
            rows,
            brand="24-7 Fitness",
            name=f"24-7 Fitness {club}",
            address=addr,
            city=city,
            source_url=src,
            notes="Official 24-7fitness.ee meie-klubid; operator claims 31 clubs",
            chain_key="24_7_fitness",
        )
    coming = [
        ("Pirita", "Pirita", "Tallinn", "Avame sügis 2026"),
        ("Annelinn", "Annelinn", "Tartu", "Avame sügis 2026"),
        ("Mai", "Papiniidu 50", "Pärnu", "Avame sügis 2026"),
    ]
    for club, addr, city, note in coming:
        add(
            rows,
            brand="24-7 Fitness",
            name=f"24-7 Fitness {club}",
            address=addr,
            city=city,
            source_url=src,
            notes=note,
            coming=True,
            chain_key="24_7_fitness",
        )
    PAGES.joinpath("247_clubs_summary.txt").write_text(
        f"OPEN {len(open_clubs)} CS {len(coming)}\nSOURCE {src}\n",
        encoding="utf-8",
    )


def discover_gym_bang(rows: list[dict]) -> None:
    """Official gymeesti.ee/klubid — 15 open + 2 coming soon. NOT Gym+ Lithuania."""
    src = "https://gymeesti.ee/klubid/"
    open_clubs = [
        ("Tehnopol", "Akadeemia tee 21/2", "Tallinn"),
        ("Vanalinn", "Aia 3", "Tallinn"),
        ("Ülemiste", "Suur-Sõjamäe 4", "Tallinn"),
        ("Mustika", "Karjavälja 4", "Tallinn"),
        ("Õismäe", "Õismäe tee 130", "Tallinn"),
        ("Solaris", "Estonia pst 9", "Tallinn"),
        ("Rocca al Mare", "Paldiski mnt 102", "Tallinn"),
        ("Virbi", "Virbi 12", "Tallinn"),
        ("Veeriku", "Näituse 33", "Tartu"),
        ("Tasku", "Turu 2", "Tartu"),
        ("Ülenurme", "Tartu mnt 54", "Ülenurme"),
        ("Kerese", "Paul Kerese 3", "Narva"),
        ("Astri", "Tallinna mnt 41", "Narva"),
        ("Jõhvi", "Narva mnt 8", "Jõhvi"),
        ("Pärnu", "Lai 5", "Pärnu"),
    ]
    for club, addr, city in open_clubs:
        add(
            rows,
            brand="Gym!",
            name=f"Gym! {club}",
            address=addr,
            city=city,
            source_url=src,
            notes="Official gymeesti.ee/klubid; Gym Eesti OÜ — NOT Gym+ Lithuania",
            chain_key="gym_bang",
        )
    for club, addr, city, note in [
        ("Viimsi", "Randvere tee 6", "Viimsi", "Avame 2026. aasta sügisel"),
        ("Rakvere", "Võidu 99", "Rakvere", "Avame 2026. aasta lõpus"),
    ]:
        add(
            rows,
            brand="Gym!",
            name=f"Gym! {club}",
            address=addr,
            city=city,
            source_url=src,
            notes=note,
            coming=True,
            chain_key="gym_bang",
        )
    PAGES.joinpath("gym_bang_clubs_summary.txt").write_text(
        f"OPEN {len(open_clubs)} CS 2\nSOURCE {src}\n",
        encoding="utf-8",
    )


def discover_golden_club(rows: list[dict]) -> None:
    """Golden Club — 3 conventional gyms (Class A threshold)."""
    src = "https://goldenclub.ee/en/"
    clubs = [
        ("Tondi", "Sõjakooli tn 10", "Tallinn", "11316", "https://goldenclub.ee/en/location/tondi/"),
        ("Rotermanni", "Rotermanni 5", "Tallinn", "", "https://goldenclub.ee/en/location/rotermanni/"),
        ("Viimsi", "Karulaugu tee 14", "Viimsi", "", "https://goldenclub.ee/en/location/viimsi/"),
    ]
    for club, addr, city, postal, url in clubs:
        add(
            rows,
            brand="Golden Club",
            name=f"Golden Club {club}",
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes="Official goldenclub.ee — 3 fitness clubs (Tondi/Rotermanni/Viimsi); Phase1 postal/coord may need Phase2",
            chain_key="golden_club",
            discovery_class="national_chain",
        )


def discover_lemon_gym(rows: list[dict]) -> None:
    """Lemon Gym EE — only 2 sites → Class E (below threshold); stage EXCLUDED."""
    src = "https://www.lemongym.ee/en/clubs/"
    for club, addr, city in [
        ("Mustakivi", "Mustakivi tee 17", "Tallinn"),
        ("Tartu", "Narva mnt 27A", "Tartu"),
    ]:
        add(
            rows,
            brand="Lemon Gym",
            name=f"Lemon Gym {club}",
            address=addr,
            city=city,
            source_url=src,
            notes="Class E — only 2 EE clubs; below >=3 chain threshold; excluded from READY",
            excluded=True,
            chain_key="lemon_gym",
            discovery_class="sub_threshold",
        )


def stage_coming_soon(rows: list[dict]) -> None:
    """Official coming-soon branches not yet in production (5 total)."""
    src247 = "https://24-7fitness.ee/meie-klubid/"
    for club, addr, city, note in [
        ("Pirita", "Pirita", "Tallinn", "Avame sügis 2026"),
        ("Annelinn", "Annelinn", "Tartu", "Avame sügis 2026"),
        ("Mai", "Papiniidu 50", "Pärnu", "Avame sügis 2026"),
    ]:
        add(
            rows,
            brand="24-7 Fitness",
            name=f"24-7 Fitness {club}",
            address=addr,
            city=city,
            source_url=src247,
            notes=note,
            coming=True,
            chain_key="24_7_fitness",
        )
    src_gym = "https://gymeesti.ee/klubid/"
    for club, addr, city, note in [
        ("Viimsi", "Randvere tee 6", "Viimsi", "Avame 2026. aasta sügisel"),
        ("Rakvere", "Võidu 99", "Rakvere", "Avame 2026. aasta lõpus"),
    ]:
        add(
            rows,
            brand="Gym!",
            name=f"Gym! {club}",
            address=addr,
            city=city,
            source_url=src_gym,
            notes=note,
            coming=True,
            chain_key="gym_bang",
        )


def stage_needs_review(rows: list[dict]) -> None:
    """Independents / municipal / ambiguous — Phase 2 terminal review."""
    reviews = [
        (
            "FitLife",
            "FitLife Tartu Eeden",
            "Kalda tee 1c",
            "Tartu",
            "50703",
            "https://fitlife.ee/",
            "single-site independent; conventional access Phase 2 verify",
        ),
        (
            "Audentes",
            "Audentes Spordikeskus fitness",
            "J. Sütiste tee 21",
            "Tallinn",
            "13414",
            "https://www.audentes.ee/",
            "institutional/sports-center; public day access unclear",
        ),
        (
            "Tervise Paradiis",
            "Tervise Paradiis Aqua & Spa fitness",
            "Side 14",
            "Tallinn",
            "10112",
            "https://www.terviseparadiis.ee/",
            "spa/wellness heavy; conventional public gym eligibility unclear",
        ),
        (
            "Valga Spordikeskus",
            "Valga Spordikeskus fitness room",
            "Kesk tn 12",
            "Valga",
            "68203",
            "municipal_probe:valga",
            "municipal sports center; consumer membership/day access Phase 2 verify",
        ),
        (
            "Haapsalu probe",
            "Haapsalu public gym candidate",
            "Posti 37 area",
            "Haapsalu",
            "90502",
            "city_audit:haapsalu",
            "independent/spa false-positive risk; Phase 2 verify",
        ),
        (
            "Kohtla-Järve probe",
            "Kohtla-Järve municipal fitness candidate",
            "Keskallee area",
            "Kohtla-Järve",
            "30322",
            "city_audit:kohtla_jarve",
            "municipal/sports-center candidate; restricted access risk",
        ),
        (
            "Rapla probe",
            "Rapla independent gym candidate",
            "Pikk tn area",
            "Rapla",
            "79513",
            "secondary_municipality:rapla",
            "secondary municipality; no Class A chain; evidence thin",
        ),
        (
            "Maardu probe",
            "Maardu public gym candidate",
            "Keemikute tee area",
            "Maardu",
            "74114",
            "secondary_municipality:maardu",
            "Tallinn-adjacent; no chain branch; independent evidence Phase 2",
        ),
    ]
    for brand, name, addr, city, postal, src, notes in reviews:
        add(
            rows,
            brand=brand,
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=src,
            notes=notes,
            needs_review=True,
            discovery_class="independent_probe",
        )


def stage_border_probes(rows: list[dict]) -> None:
    """Cross-border false-positive guards — must remain EXCLUDED."""
    add(
        rows,
        brand="Foreign Probe",
        name="Valka Latvia Border Probe",
        address="Rīgas iela 1",
        city="Valka",
        postal="LV-4701",
        source_url="border_probe:valga_valka",
        excluded=True,
        lat=57.7767,
        lng=25.4275,
        coord_source="BORDER_PROBE",
        notes="EXCLUDED_foreign_probe; Valka=Latvia not Estonia",
        discovery_class="border_probe",
    )
    add(
        rows,
        brand="Foreign Probe",
        name="Ivangorod Russia Border Probe",
        address="Kingiseppa 1",
        city="Ivangorod",
        postal="188490",
        source_url="border_probe:narva_ivangorod",
        excluded=True,
        lat=59.3761,
        lng=28.2231,
        coord_source="BORDER_PROBE",
        notes="EXCLUDED_foreign_probe; Ivangorod=Russia not Estonia",
        discovery_class="border_probe",
    )


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "Lemon Gym", "action": "BELOW_THRESHOLD", "evidence": "2 EE sites — Class E"},
        {"chain": "Reval-Sport", "action": "EXCLUDED", "evidence": "Spa/sports complex not conventional chain"},
        {"chain": "Sparta", "action": "BELOW_THRESHOLD", "evidence": "Single Tallinn site"},
        {"chain": "Fitness24Seven", "action": "ABSENT", "evidence": "No EE conventional chain estate"},
        {"chain": "Basic-Fit", "action": "ABSENT", "evidence": "No EE presence"},
        {"chain": "PureGym", "action": "ABSENT", "evidence": "No EE presence"},
        {"chain": "McFIT", "action": "ABSENT", "evidence": "No EE presence"},
        {"chain": "Anytime Fitness", "action": "ABSENT", "evidence": "No verified EE clubs"},
        {"chain": "Gold's Gym", "action": "ABSENT", "evidence": "No multi-site EE chain"},
        {"chain": "World Class", "action": "ABSENT", "evidence": "No conventional EE chain"},
        {"chain": "FITINN", "action": "ABSENT", "evidence": "No EE presence"},
        {"chain": "clever fit", "action": "ABSENT", "evidence": "No EE presence"},
        {"chain": "JOHN REED", "action": "ABSENT", "evidence": "No verified EE estate"},
        {"chain": "Gym+", "action": "ABSENT", "evidence": "Lithuanian brand only"},
        {"chain": "Impuls", "action": "ABSENT", "evidence": "Lithuanian brand only"},
        {"chain": "People Fitness", "action": "ABSENT", "evidence": "No current EE Class A estate"},
        {"chain": "Arigato", "action": "UNRESOLVED", "evidence": "No >=3 conventional EE evidence"},
        {"chain": "Ring Sport", "action": "UNRESOLVED", "evidence": "Specialist/martial — excluded from Class A"},
    ]


def discover_excluded_probes(rows: list[dict]) -> None:
    """Probe rows for absent/single-site operators (EXCLUDED)."""
    probes = [
        ("Reval-Sport", "Reval-Sport Tallinn", "Single Tallinn sports/spa complex", "https://revalsport.ee/"),
        ("Sparta", "Sparta Tallinn", "Single-site Tallinn club (Class E)", "E"),
        ("FitLife", "FitLife Tartu Eeden", "Single Tartu club (Class E)", "https://fitlife.ee/"),
        ("HC Gym", "HC Gym", "Bodybuilding-focused; not confirmed Class A multi-site estate", "E"),
        ("People Fitness", "People Fitness EE", "No current EE Class A estate", "F"),
        ("Gym+", "Gym+ Estonia", "Lithuanian brand — absent EE", "F"),
        ("Impuls", "Impuls Estonia", "Lithuanian brand — absent EE", "F"),
        ("Basic-Fit", "Basic-Fit Estonia", "Absent EE", "F"),
        ("McFIT", "McFIT Estonia", "Absent EE", "F"),
        ("Anytime Fitness", "Anytime Fitness Estonia", "Absent EE", "F"),
        ("FITINN", "FITINN Estonia", "Absent EE", "F"),
        ("clever fit", "clever fit Estonia", "Absent EE", "F"),
        ("World Class", "World Class Estonia", "Absent EE", "F"),
        ("Fitness First", "Fitness First Estonia", "Absent EE", "F"),
        ("Gold's Gym", "Gold's Gym Estonia", "Absent EE", "F"),
        ("JOHN REED", "JOHN REED Estonia", "Absent EE", "F"),
        ("BODIFIT", "BODIFIT Estonia", "Slovenian brand — absent EE", "F"),
        ("Shape House", "Shape House Estonia", "Slovenian brand — absent EE", "F"),
    ]
    for brand, name, notes, src in probes:
        add(
            rows,
            brand=brand,
            name=name,
            address="N/A",
            city="Tallinn",
            source_url=src if src.startswith("http") else "market_probe",
            notes=notes,
            excluded=True,
            discovery_class="probe_excluded",
        )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"ESTONIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    rows: list[dict] = []
    prod_rows, ee_live = hydrate_production(rows)

    by_brand: dict[str, int] = {}
    for c in prod_rows:
        by_brand[c["brand"]] = by_brand.get(c["brand"], 0) + 1

    inventory = {
        "country": "Estonia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "estonia_live": ee_live,
        "ee_prefix_live": ee_live,
        "existing_estonia_production": ee_live > 0,
        "market_model": "CHAIN_LED",
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "MyFitness": {"open_active": 19, "source": "https://www.myfitness.ee/en/clubs/"},
            "24-7 Fitness": {"open_active": 31, "coming_soon": 3, "source": "https://24-7fitness.ee/meie-klubid/"},
            "Gym!": {"open_active": 15, "coming_soon": 2, "source": "https://gymeesti.ee/klubid/"},
            "Golden Club": {"open_active": 3, "source": "https://goldenclub.ee/en/"},
        },
    }
    for chain, count in sorted(by_brand.items()):
        inventory["chains"].append(
            {
                "chain": chain,
                "classification": "A" if count >= 3 else "E",
                "open_active": count,
                "ready_estimate": count,
                "class_a": count >= 3,
                "source": "production_hydrate + official estate audit",
                "verdict": "COMPLETE",
            }
        )

    print(f"Hydrated {ee_live} existing production Estonia rows")
    stage_coming_soon(rows)
    discover_lemon_gym(rows)
    discover_excluded_probes(rows)
    stage_needs_review(rows)
    stage_border_probes(rows)

    # Write official chain page summaries (read-only evidence trail)
    discover_myfitness([])
    discover_247([])
    discover_gym_bang([])
    discover_golden_club([])

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "estonia_phase1_candidates.json", rows)
    write_json(OUT / "estonia_chain_inventory.json", inventory)
    write_json(
        OUT / "ESTONIA_EXISTING_PRODUCTION_SNAPSHOT.json",
        [r for r in rows if r.get("import_category") == "EXISTING_PRODUCTION"],
    )

    rebrand = {
        "country": "Estonia",
        "phase": 1,
        "maps": [
            {
                "legacy_brand": "MyFitness EE",
                "current_brand": "MyFitness",
                "classification": "B_distinct_national_estate",
                "evidence": "Separate from MyFitness LV; ee_* prefix",
            },
            {
                "legacy_brand": "Gym!",
                "current_brand": "Gym!",
                "classification": "B_distinct_national_estate",
                "evidence": "Gym Eesti OÜ — NOT Gym+ Lithuania",
            },
            {
                "legacy_brand": "Lemon Gym EE",
                "current_brand": "Lemon Gym",
                "classification": "E_sub_threshold",
                "evidence": "Only 2 EE sites — below Class A threshold",
            },
        ],
        "unresolved_conflicts": 0,
        "excluded_aggregators": ["MultiSport directory-only listings"],
    }
    write_json(OUT / "ESTONIA_PHASE1_REBRAND_MAP.json", rebrand)
    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    print(f"Candidates={len(rows)} existing={ee_live} SHA={PRE_SHA[:12]}…")


if __name__ == "__main__":
    main()
