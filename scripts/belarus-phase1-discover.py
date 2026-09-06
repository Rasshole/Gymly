#!/usr/bin/env python3
"""Belarus Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_by_postal,
    write_json,
)

OUT = ROOT / "data/belarus"
PHASE1 = OUT / "phase1"
RAW = OUT / "raw"
for d in (OUT, RAW, PAGES := RAW / "pages", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05"
PRODUCTION_TOTAL = 12034

CLASS_A_OFFICIAL = {
    "Adrenalin": 29,
    "Lifestyle": 3,
    "Fox Club": 5,
    "Olympic": 4,
}

CITY_CANON = {
    "minsk": "Minsk",
    "минск": "Minsk",
    "gomel": "Gomel",
    "гомель": "Gomel",
    "pinsk": "Pinsk",
    "пинск": "Pinsk",
    "luninets": "Luninets",
    "лунинец": "Luninets",
    "orsha": "Orsha",
    "орша": "Orsha",
    "pruzhany": "Pruzhany",
    "пружаны": "Pruzhany",
    "mogilev": "Mogilev",
    "mogilev'": "Mogilev",
    "могилёв": "Mogilev",
    "могилев": "Mogilev",
    "grodno": "Grodno",
    "гродно": "Grodno",
    "brest": "Brest",
    "брест": "Brest",
    "vitebsk": "Vitebsk",
    "витебск": "Vitebsk",
    "borovlyany": "Borovlyany",
    "боровляны": "Borovlyany",
    "białystok": "Białystok",
    "bialystok": "Białystok",
    "terespol": "Terespol",
}

MAJOR_CITIES = [
    "Minsk",
    "Brest",
    "Grodno",
    "Gomel",
    "Mogilev",
    "Vitebsk",
    "Pinsk",
    "Orsha",
    "Luninets",
    "Pruzhany",
    "Borovlyany",
]

ADRENALIN_URL = "https://adrenalin.by/clubs/"
LIFESTYLE_URL = "https://fitness-club.by/"
FOX_URL = "https://fox-club.by/"
OLYMPIC_MINSK_URL = "https://olympic-minsk.by/"
OLYMPIC_GRODNO_URL = "https://olympic-grodno.by/"
OLYMPIC_LOSHITSA_URL = "https://olympic-minsk.by/loshitsa/"
WORLDCLASS_URL = "https://worldclass.by/"


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
    source_type: str = "official_club_list",
    source_confidence: str = "HIGH",
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
    operator_class: str = "A",
    eligibility_candidate: str | None = None,
    website: str = "",
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="by_",
        country="Belarus",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_by_postal(postal) or postal,
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
        website=website or source_url,
    )
    row["source_type"] = source_type
    row["source_confidence"] = source_confidence
    row["operator_class"] = operator_class
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
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


def stage_adrenalin(rows: list[dict]) -> int:
    clubs = [
        # Minsk (22)
        ("Adrenalin Minsk Petra Mstislavtsa", "ул. Петра Мстиславца 9", "Minsk"),
        ("Adrenalin Minsk Bogdanovicha", "ул. Богдановича 66", "Minsk"),
        ("Adrenalin Minsk Tolbukhina", "ул. Толбухина 4", "Minsk"),
        ("Adrenalin Minsk Zheleznodorozhnaya", "ул. Железнодорожная 138", "Minsk"),
        ("Adrenalin Minsk Kuprevicha", "ул. Купревича 18", "Minsk"),
        ("Adrenalin Minsk Kalvariyskaya", "ул. Кальварийская 33", "Minsk"),
        ("Adrenalin Minsk Kabushkina", "ул. Кабушкина 86а", "Minsk"),
        ("Adrenalin Minsk Mayakovskogo", "ул. Маяковского 115", "Minsk"),
        ("Adrenalin Minsk Olesheva", "ул. Олешева 1", "Minsk"),
        ("Adrenalin Minsk Nemanskaya", "ул. Неманская 67", "Minsk"),
        ("Adrenalin Borovlyany Beryozovaya Roscha", "ул. Березовая роща 108", "Borovlyany"),
        ("Adrenalin Minsk Bobruyskaya", "ул. Бобруйская 6", "Minsk"),
        ("Adrenalin Minsk Pobediteley", "пр-т Победителей 129", "Minsk"),
        ("Adrenalin Minsk Nezavisimosti", "пр-т Независимости 3-2", "Minsk"),
        ("Adrenalin Minsk Lopatina", "ул. Лопатина 7а", "Minsk"),
        ("Adrenalin Minsk Surganova", "ул. Сурганова 57б", "Minsk"),
        ("Adrenalin Minsk Goshkevicha", "ул. Гошкевича 3", "Minsk"),
        ("Adrenalin Minsk Belinskogo", "ул. Белинского 23", "Minsk"),
        ("Adrenalin Minsk Bratskaya", "ул. Братская 14", "Minsk"),
        ("Adrenalin Minsk Very Khoruzhey", "ул. Веры Хоружей 25", "Minsk"),
        ("Adrenalin Minsk Dzerzhinskogo", "ул. Дзержинского 30", "Minsk"),
        ("Adrenalin Minsk Nalibokskaya", "ул. Налибокская 2", "Minsk"),
        # Gomel (2)
        ("Adrenalin Gomel Gagarina", "ул. Гагарина 65", "Gomel"),
        ("Adrenalin Gomel Rechitsky", "ул. Речицкий 80", "Gomel"),
        # Pinsk (2)
        ("Adrenalin Pinsk Brestskaya", "ул. Брестская 72В", "Pinsk"),
        ("Adrenalin Pinsk Gaydaenko", "ул. Гайдаенко 7-2", "Pinsk"),
        # Luninets (1)
        ("Adrenalin Luninets Zapadnaya", "ул. Западная 9", "Luninets"),
        # Orsha (1)
        ("Adrenalin Orsha Flerova", "ул. Флерова 11а", "Orsha"),
        # Pruzhany (1)
        ("Adrenalin Pruzhany Oktyabrskaya", "ул. Октябрьская 104", "Pruzhany"),
    ]
    for name, addr, city in clubs:
        add(
            rows,
            brand="Adrenalin",
            name=name,
            address=addr,
            city=city,
            source_url=ADRENALIN_URL,
            source_type="official_club_list",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            notes="Official adrenalin.by/clubs/ estate; Class A conventional public network",
        )
    return len(clubs)


def stage_lifestyle(rows: list[dict]) -> int:
    clubs = [
        ("Lifestyle Minsk Masherova", "ул. Машерова 76А", "Minsk"),
        ("Lifestyle Minsk Logoysky Trakt", "Логойский тракт 37", "Minsk"),
        ("Lifestyle Minsk Partizansky", "ул. Партизанский 79", "Minsk"),
    ]
    for name, addr, city in clubs:
        add(
            rows,
            brand="Lifestyle",
            name=name,
            address=addr,
            city=city,
            source_url=LIFESTYLE_URL,
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            notes="Official fitness-club.by network; 3 Minsk clubs",
        )
    return len(clubs)


def stage_fox_club(rows: list[dict]) -> int:
    clubs = [
        ("Fox Club Minsk Grushevskaya", "ул. Грушевская 83", "Minsk"),
        ("Fox Club Minsk Dolgobrodskaya", "ул. Долгобродская 43", "Minsk"),
        ("Fox Club Minsk Kazintsa", "ул. Казинца 11а", "Minsk"),
        ("Fox Club Mogilev Shmidta", "ул. Шмидта 46", "Mogilev"),
        ("Fox Club Grodno Kupaly", "ул. Я. Купалы 22", "Grodno"),
    ]
    for name, addr, city in clubs:
        add(
            rows,
            brand="Fox Club",
            name=name,
            address=addr,
            city=city,
            source_url=FOX_URL,
            source_type="official_club_list",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            notes="Official fox-club.by estate",
        )
    return len(clubs)


def stage_olympic(rows: list[dict]) -> int:
    active = [
        ("Olympic Minsk Nemanskaya", "ул. Неманская 22", "Minsk", OLYMPIC_MINSK_URL),
        ("Olympic Minsk Petra Glebki", "ул. Петра Глебки 2", "Minsk", OLYMPIC_MINSK_URL),
        ("Olympic Minsk Pobediteley", "пр-т Победителей 11", "Minsk", OLYMPIC_MINSK_URL),
        ("Olympic Grodno Sovetskaya", "ул. Советская 18 (ТЦ CUM)", "Grodno", OLYMPIC_GRODNO_URL),
    ]
    for name, addr, city, url in active:
        add(
            rows,
            brand="Olympic",
            name=name,
            address=addr,
            city=city,
            source_url=url,
            source_type="official_website",
            source_confidence="HIGH",
            discovery_class="national_chain",
            eligibility_candidate="CHAIN_CLASS_A",
            operator_class="A",
            notes="Official Olympic Fitness active club",
        )
    add(
        rows,
        brand="Olympic",
        name="Olympic Loshitsa (coming soon)",
        address="микрорайон Лошица (opening soon)",
        city="Minsk",
        source_url=OLYMPIC_LOSHITSA_URL,
        source_type="official_website",
        source_confidence="HIGH",
        coming=True,
        discovery_class="national_chain",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        notes="Official olympic-minsk.by Loshitsa coming-soon page",
    )
    return len(active)


def stage_world_class(rows: list[dict]) -> None:
    add(
        rows,
        brand="World Class",
        name="World Class Minsk Dzerzhinskogo",
        address="пр-т Дзержинского 16",
        city="Minsk",
        source_url=WORLDCLASS_URL,
        source_type="official_website",
        source_confidence="HIGH",
        needs_review=True,
        discovery_class="small_market_chain",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        notes="Single Belarus site on worldclass.by — below Class A ≥3 threshold alone; Phase 2 eligibility",
    )


def stage_regional_independents(rows: list[dict]) -> None:
    brest = [
        ("Gym Express 24h", "Gym Express 24h Brest", "ул. Варшавское шоссе 43", "https://gymexpress.by/"),
        ("Grafit", "Grafit Brest", "ул. Орловская 10", "https://grafit-club.by/"),
        ("Delta", "Delta Brest", "ул. Гоголя 65", "phase1://belarus/brest-independents"),
    ]
    for brand, name, addr, url in brest:
        add(
            rows,
            brand=brand,
            name=name,
            address=addr,
            city="Brest",
            source_url=url,
            source_type="official_website" if url.startswith("http") else "market_audit",
            source_confidence="MEDIUM" if url.startswith("http") else "LOW",
            needs_review=True,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            operator_class="B",
            notes="Brest regional independent — conventional gym with street address; Phase 2 deepen",
        )
    add(
        rows,
        brand="FitWorld",
        name="FitWorld Grodno Pushkina",
        address="ул. Пушкина 31а",
        city="Grodno",
        source_url="phase1://belarus/grodno-independents",
        source_type="market_audit",
        source_confidence="MEDIUM",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        notes="Grodno independent; Olympic Grodno counted under Olympic brand",
    )


def stage_city_audits(rows: list[dict]) -> None:
    add(
        rows,
        brand="Independent (Vitebsk)",
        name="Vitebsk conventional gym audit",
        address="Vitebsk (regional audit — no Class A chain presence)",
        city="Vitebsk",
        source_url="phase1://belarus/city-audit",
        source_type="market_audit",
        source_confidence="LOW",
        needs_review=True,
        discovery_class="regional_gap_candidate",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        notes="Vitebsk coverage grade B — no verified Class A chain; Phase 2 independent sweep",
    )


def stage_excluded(rows: list[dict]) -> None:
    for brand in [
        "Gold's Gym",
        "Anytime Fitness",
        "McFIT",
        "Basic-Fit",
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} Belarus probe",
            address="No verified Belarus location",
            city="Minsk",
            source_url="phase1://belarus/international-probe",
            source_type="international_probe",
            source_confidence="HIGH",
            excluded=True,
            discovery_class="international_chain_probe",
            operator_class="C",
            notes=f"International absent in Belarus — chain audit ABSENT not staged",
        )
    for brand, name, notes in [
        ("Hotel gym", "Hotel guest fitness Minsk probe", "Guest-only hotel fitness — EXCLUDED"),
        ("Resort spa", "Resort spa fitness amenity probe", "Hotel/resort incidental gym — EXCLUDED"),
        ("CrossFit box", "CrossFit-only Minsk sample", "CrossFit-only specialist — EXCLUDED"),
        ("Boxing club", "Boxing-only Minsk sample", "Boxing-only specialist — EXCLUDED"),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=f"{name} (exclusion probe)",
            city="Minsk",
            source_url="phase1://belarus/specialist-audit",
            source_type="specialist_exclusion",
            source_confidence="HIGH",
            excluded=True,
            discovery_class="specialist_exclusion",
            operator_class="C",
            notes=notes,
        )
    # Poland-border false positive probes for Brest
    border = [
        ("Białystok", "Poland", "15-001", 53.1325, 23.1688, "Poland Białystok border false positive"),
        ("Terespol", "Poland", "21-550", 52.0755, 23.6162, "Poland Terespol border false positive"),
    ]
    for city, country, postal, lat, lng, notes in border:
        add(
            rows,
            brand="Border probe",
            name=f"Border probe {city}",
            address=f"{city} center (Poland-border contamination test)",
            city=city,
            postal=postal,
            source_url="phase1://belarus/border-probe",
            source_type="border_probe",
            source_confidence="HIGH",
            lat=lat,
            lng=lng,
            coord_source="CITY_CENTER_PROBE",
            excluded=True,
            discovery_class="foreign_border_probe",
            operator_class="C",
            notes=notes,
        )
    for r in rows:
        if r.get("discovery_class") == "foreign_border_probe":
            r["country"] = "Poland"
            r["import_category"] = "EXCLUDED"


def probe_other_chains() -> list[dict]:
    probes = []
    for brand, action, evidence in [
        ("Adrenalin", "CLASS_A_COMPLETE", "29/29 official clubs on adrenalin.by/clubs/"),
        ("Lifestyle", "CLASS_A_COMPLETE", "3/3 Minsk clubs on fitness-club.by"),
        ("Fox Club", "CLASS_A_COMPLETE", "5/5 on fox-club.by"),
        ("Olympic", "CLASS_A_GAP_COMING_SOON", "4 active + Loshitsa COMING_SOON"),
        ("World Class", "BELOW_CLASS_A_THRESHOLD", "1 BY site — small market review"),
        ("Gold's Gym", "ABSENT", "No verified Belarus estate"),
        ("Anytime Fitness", "ABSENT", "No verified Belarus estate"),
        ("McFIT", "ABSENT", "No verified Belarus estate"),
        ("Basic-Fit", "ABSENT", "No verified Belarus estate"),
    ]:
        probes.append({"chain": brand, "action": action, "evidence": evidence})
    return probes


def write_postcode_model() -> None:
    write_json(
        OUT / "BELARUS_POSTCODE_MODEL.json",
        {
            "country": "Belarus",
            "format": "NNNNNN (6 digits)",
            "regex": "^\\d{6}$",
            "examples": ["220030", "246000", "224000"],
            "validation_function": "format_by_postal() in batch1_phase1_common.py",
            "source": "Belposhta addressing; aligned with BELARUS_POSTAL_RE",
        },
    )


def write_locality_alias_map() -> None:
    write_json(
        OUT / "BELARUS_LOCALITY_ALIAS_MAP.json",
        {
            "country": "Belarus",
            "aliases": [
                {"canonical": "Minsk", "variants": ["Минск", "minsk"]},
                {"canonical": "Brest", "variants": ["Брест", "brest"]},
                {"canonical": "Grodno", "variants": ["Гродно", "grodno"]},
                {"canonical": "Gomel", "variants": ["Гомель", "gomel"]},
                {"canonical": "Mogilev", "variants": ["Могилёв", "Могилев", "mogilev"]},
                {"canonical": "Vitebsk", "variants": ["Витебск", "vitebsk"]},
                {"canonical": "Borovlyany", "variants": ["Боровляны", "borovlyany"]},
            ],
            "notes": "Canonical English exonym in staging; Cyrillic preserved in address fields",
        },
    )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"BELARUS PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    catalog = json.loads(CENTERS.read_text())
    assert len(catalog) == PRODUCTION_TOTAL, f"production total drift: {len(catalog)}"
    by_live = [c for c in catalog if str(c.get("id", "")).startswith("by_")]
    if by_live:
        raise SystemExit(f"Expected 0 by_* production rows, found {len(by_live)}")
    assert sum(1 for c in catalog if c.get("country") == "Belarus") == 0

    rows: list[dict] = []
    ad_count = stage_adrenalin(rows)
    ls_count = stage_lifestyle(rows)
    fx_count = stage_fox_club(rows)
    ol_count = stage_olympic(rows)
    stage_world_class(rows)
    stage_regional_independents(rows)
    stage_city_audits(rows)
    stage_excluded(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    inventory = {
        "country": "Belarus",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "belarus_live": 0,
        "by_prefix_live": 0,
        "existing_belarus_production": False,
        "baseline_ukraine": 105,
        "baseline_malta": 24,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNNN (6 digits)",
        "fetch_summary": {
            "adrenalin": ad_count,
            "lifestyle": ls_count,
            "fox_club": fx_count,
            "olympic_active": ol_count,
        },
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "Adrenalin": {"open_active": 29, "source": ADRENALIN_URL},
            "Lifestyle": {"open_active": 3, "source": LIFESTYLE_URL},
            "Fox Club": {"open_active": 5, "source": FOX_URL},
            "Olympic": {
                "open_active": 4,
                "coming_soon": 1,
                "source_minsk": OLYMPIC_MINSK_URL,
                "source_grodno": OLYMPIC_GRODNO_URL,
            },
            "World Class": {"open_active": 1, "source": WORLDCLASS_URL, "class_a": False},
        },
        "final_missed_chain_sweep": {
            "complete": True,
            "new_class_a_found": False,
            "notes": "Adrenalin + Lifestyle + Fox Club + Olympic meet Class A threshold",
        },
    }
    by_brand = Counter(
        r.get("brand") for r in rows if r.get("import_category") not in ("EXCLUDED",)
    )
    for brand, count in sorted(by_brand.items()):
        official = CLASS_A_OFFICIAL.get(brand, 0)
        inventory["chains"].append(
            {
                "chain": brand,
                "classification": "A" if official >= 3 or count >= 3 else "E",
                "staged": count,
                "official_current_active": official or None,
                "class_a": brand in CLASS_A_OFFICIAL,
                "source": "phase1_discovery",
            }
        )

    write_json(OUT / "belarus_phase1_candidates.json", rows)
    write_json(OUT / "belarus_chain_inventory.json", inventory)
    write_json(OUT / "BELARUS_EXISTING_PRODUCTION_SNAPSHOT.json", [])

    rebrand = {
        "country": "Belarus",
        "phase": 1,
        "relationships": [],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "BELARUS_PHASE1_REBRAND_MAP.json", rebrand)
    write_postcode_model()
    write_locality_alias_map()

    (PAGES / "adrenalin_clubs.txt").write_text(
        "\n".join(f"{n}|{a}|{c}" for n, a, c in [
            (r["name"], r["address"], r["city"])
            for r in rows
            if r.get("brand") == "Adrenalin" and r.get("import_category") != "EXCLUDED"
        ])
        + "\n",
        encoding="utf-8",
    )

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != PRE_SHA:
        raise SystemExit(f"Production modified during discover: {post}")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    statuses = Counter(r.get("import_category") for r in rows)
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "belarus_live": 0,
                "existing_production": 0,
                "fetch": inventory["fetch_summary"],
                "statuses": dict(statuses),
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
