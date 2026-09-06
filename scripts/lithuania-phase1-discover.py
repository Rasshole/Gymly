#!/usr/bin/env python3
"""Lithuania Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_lt_postal,
    write_json,
)

OUT = ROOT / "data/lithuania"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, OUT / "scrapes", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

CLASS_A_OFFICIAL = {
    "Gym+": 38,
    "Lemon Gym": 18,
    "Impuls": 5,
}

CITY_CANON = {
    "vilnius": "Vilnius",
    "kaunas": "Kaunas",
    "klaipėda": "Klaipėda",
    "klaipeda": "Klaipėda",
    "šiauliai": "Šiauliai",
    "siauliai": "Šiauliai",
    "panevėžys": "Panevėžys",
    "panevezys": "Panevėžys",
    "alytus": "Alytus",
    "marijampolė": "Marijampolė",
    "marijampole": "Marijampolė",
    "mažeikiai": "Mažeikiai",
    "mazeikiai": "Mažeikiai",
    "jonava": "Jonava",
    "utena": "Utena",
    "kėdainiai": "Kėdainiai",
    "kedainiai": "Kėdainiai",
    "tauragė": "Tauragė",
    "taurage": "Tauragė",
    "telšiai": "Telšiai",
    "telsiai": "Telšiai",
    "palanga": "Palanga",
    "didžioji riešė": "Didžioji Riešė",
    "didzioji riese": "Didžioji Riešė",
    "riešė": "Didžioji Riešė",
    "riese": "Didžioji Riešė",
    "visaginas": "Visaginas",
    "druskininkai": "Druskininkai",
    "plungė": "Plungė",
    "plunge": "Plungė",
    "kretinga": "Kretinga",
    "gargždai": "Gargždai",
    "gargzdai": "Gargždai",
    "raseiniai": "Raseiniai",
    "radviliškis": "Radviliškis",
    "radviliskis": "Radviliškis",
    "vilkaviškis": "Vilkaviškis",
    "vilkaviskis": "Vilkaviškis",
    "šilutė": "Šilutė",
    "silute": "Šilutė",
    "joniškis": "Joniškis",
    "joniskis": "Joniškis",
    "rokiškis": "Rokiškis",
    "rokiskis": "Rokiškis",
    "kuršėnai": "Kuršėnai",
    "kursenai": "Kuršėnai",
    "biržai": "Biržai",
    "birzai": "Biržai",
    "anykščiai": "Anykščiai",
    "anyksciai": "Anykščiai",
    "elektrėnai": "Elektrėnai",
    "elektrenai": "Elektrėnai",
    "garliava": "Garliava",
    "šalčininkai": "Šalčininkai",
    "salcininkai": "Šalčininkai",
    "zarasai": "Zarasai",
    "ukmergė": "Ukmergė",
    "ukmerge": "Ukmergė",
    "neringa": "Neringa",
    "nida": "Neringa",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    return CITY_CANON.get(key, s)


def prod_row(c: dict) -> dict:
    return base_row(
        prefix="lt_",
        country="Lithuania",
        brand=c["brand"],
        name=c["name"],
        address=c["address"],
        postal_code=format_lt_postal(str(c.get("postal_code", ""))) or str(c.get("postal_code", "")),
        city=canon_city(c["city"]),
        source_url=c.get("website") or c.get("source_url") or "production_hydrate",
        lat=c.get("lat"),
        lng=c.get("lng"),
        coord_source=c.get("coord_source") or "KNOWN_PREMISES_HYDRATE",
        notes="existing_production_hydrate",
        discovery_class="national_chain",
        chain_key=(c.get("brand") or "").lower().replace(" ", "_").replace("+", "plus"),
    )


def hydrate_production(rows: list[dict]) -> tuple[list[dict], int]:
    catalog = json.loads(CENTERS.read_text())
    lt = [c for c in catalog if str(c.get("id", "")).startswith("lt_")]
    for c in lt:
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
    return lt, len(lt)


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
        prefix="lt_",
        country="Lithuania",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_lt_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("+", "plus"),
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


def stage_coming_soon(rows: list[dict]) -> None:
    add(
        rows,
        brand="Gym+",
        name="Gym+ Vilnius Viršuliškių",
        address="Viršuliškių g. 40",
        city="Vilnius",
        source_url="https://gymplius.lt/en/clubs/virsuliskiu-g-40-2/",
        notes="gymplius.lt official — under construction / COMING_SOON at Phase 1 audit",
        coming=True,
        chain_key="gymplus",
    )
    add(
        rows,
        brand="Lemon Gym",
        name="Lemon Gym Riešė",
        address="Molėtų g. 13",
        city="Didžioji Riešė",
        source_url="https://www.lemongym.lt/en/",
        notes="lemongym.lt official — coming soon at Phase 1 audit",
        coming=True,
        chain_key="lemon_gym",
    )
    add(
        rows,
        brand="Lemon Gym",
        name="Lemon Gym Jonava (announced)",
        address="Jonava (street TBD)",
        city="Jonava",
        source_url="https://www.lemongym.lt/en/",
        notes="lemongym.lt homepage announces Jonava — no street address yet; COMING_SOON",
        coming=True,
        chain_key="lemon_gym",
    )


def stage_excluded(rows: list[dict]) -> None:
    exclusions = [
        ("FitClub", "FitClub Kaunas Šiaurės", "Šiaurės pr. 8D", "Kaunas", "https://fitclub.lt/",
         "E — 2-site operator below Class A threshold"),
        ("FitClub", "FitClub Kaunas V. Krėvės", "V. Krėvės pr. 57", "Kaunas", "https://fitclub.lt/",
         "E — 2-site operator below Class A threshold"),
        ("Fitus", "Fitus Vilnius Ukmergės", "Ukmergės g. 308", "Vilnius", "https://www.fitus.lt/kontaktai/",
         "E — single-site spa/pool club below threshold"),
        ("People Fitness", "People Fitness Vilnius (legacy)", "Saltoniškių g. 9", "Vilnius",
         "https://peoplefitness.eu/vilnius/en/",
         "F — legacy; physical site now Gym+ Saltoniškių estate"),
        ("VS Fitness", "VS Fitness (legacy brand)", "VS Fitness legacy (acquired)", "Vilnius",
         "https://ellex.legal/project/my-fitness-acquisition-of-vs-fitness/",
         "F — acquired by Gym+ / My Fitness AS 2024; no live VS Fitness consumer brand"),
        ("Fitness Factory Gym", "Fitness Factory Gym Garliava", "Garliava (specialty club)", "Garliava",
         "https://www.factory-gym.lt/",
         "C/E — bodybuilding specialty single market; not Class A chain"),
        ("Gym!", "Gym! Lithuania probe", "Vilnius", "Vilnius", "https://www.gymlatvija.lv/",
         "F — Latvian/Estonian consumer brand Gym! — NOT Gym+ Lithuania"),
        ("MyFitness", "MyFitness Lithuania probe", "Vilnius", "Vilnius", "https://www.myfitness.ee/",
         "F — Estonian parent of Gym+; LT consumer brand is Gym+ not MyFitness"),
        ("Basic-Fit", "Basic-Fit Lithuania probe", "Vilnius", "Vilnius", "https://www.basic-fit.com/",
         "F — absent in Lithuania"),
        ("McFIT", "McFIT Lithuania probe", "Vilnius", "Vilnius", "https://www.mcfit.com/",
         "F — absent in Lithuania"),
        ("Anytime Fitness", "Anytime Fitness Lithuania probe", "Vilnius", "Vilnius",
         "https://www.anytimefitness.com/", "F — no live LT clubs"),
        ("FITINN", "FITINN Lithuania probe", "Vilnius", "Vilnius", "https://www.fitinn.at/",
         "F — absent in Lithuania"),
        ("clever fit", "clever fit Lithuania probe", "Vilnius", "Vilnius", "https://www.clever-fit.com/",
         "F — absent in Lithuania"),
        ("Gold's Gym", "Gold's Gym Lithuania probe", "Vilnius", "Vilnius", "https://www.goldsgym.com/",
         "F — absent in Lithuania"),
        ("World Class", "World Class Lithuania probe", "Vilnius", "Vilnius", "https://worldclass.fi/",
         "F — absent in Lithuania"),
    ]
    for brand, name, addr, city, url, notes in exclusions:
        add(
            rows,
            brand=brand,
            name=name,
            address=addr,
            city=city,
            source_url=url,
            notes=notes,
            excluded=True,
            discovery_class="excluded_probe" if "probe" in notes.lower() else "regional_small",
        )


def stage_municipal_audits(rows: list[dict]) -> None:
    audits = [
        ("Utena", "Deep audit — no Class A chain presence verified"),
        ("Tauragė", "Deep audit — Kaliningrad proximity scrutiny; no Class A chain verified"),
        ("Jonava", "Deep audit — Lemon Gym Jonava COMING_SOON only; no open Class A club yet"),
        ("Visaginas", "Deep audit — multilingual LT/RU; border scrutiny; no Class A chain"),
        ("Druskininkai", "Deep audit — spa/resort false-positive control; no Class A chain"),
        ("Plungė", "Deep audit — no Class A chain presence verified"),
        ("Kretinga", "Deep audit — Klaipėda orbit; no separate Class A chain verified"),
        ("Gargždai", "Deep audit — Klaipėda orbit; no Class A chain verified"),
        ("Raseiniai", "Deep audit — no Class A chain presence verified"),
        ("Radviliškis", "Deep audit — no Class A chain presence verified"),
        ("Vilkaviškis", "Deep audit — Poland border scrutiny; no Class A chain verified"),
        ("Šilutė", "Deep audit — no Class A chain presence verified"),
        ("Joniškis", "Deep audit — no Class A chain presence verified"),
        ("Rokiškis", "Deep audit — Latvia border scrutiny; no Class A chain verified"),
        ("Kuršėnai", "Deep audit — no Class A chain presence verified"),
        ("Biržai", "Deep audit — no Class A chain presence verified"),
        ("Anykščiai", "Deep audit — no Class A chain presence verified"),
        ("Elektrėnai", "Deep audit — Vilnius orbit; no separate Class A chain verified"),
        ("Garliava", "Deep audit — Kaunas orbit; specialty excluded only"),
        ("Šalčininkai", "Deep audit — Polish border multilingual; no Class A chain verified"),
        ("Zarasai", "Deep audit — Latvia border scrutiny; no Class A chain verified"),
        ("Ukmergė", "Deep audit — no Class A chain presence verified"),
        ("Neringa", "Deep audit — tourism/Nida false-positive control; no Class A chain"),
        ("Didžioji Riešė", "Vilnius metro audit — Lemon Gym Riešė COMING_SOON only"),
    ]
    for city, notes in audits:
        add(
            rows,
            brand="Municipal audit",
            name=f"Lithuania Phase 1 municipal audit — {city}",
            address="N/A",
            city=city,
            source_url="phase1_municipal_sweep",
            notes=notes,
            needs_review=True,
            discovery_class="municipal_audit",
        )


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "Gym+", "action": "CLASS_A_COMPLETE", "evidence": "38/38 open in production; Viršuliškių COMING_SOON"},
        {"chain": "Lemon Gym", "action": "CLASS_A_COMPLETE", "evidence": "18/18 open in production; Riešė + Jonava COMING_SOON"},
        {"chain": "Impuls", "action": "CLASS_A_COMPLETE", "evidence": "5/5 official impuls.lt clubs in production"},
        {"chain": "VS Fitness", "action": "EXCLUDED", "evidence": "Acquired by Gym+ 2024"},
        {"chain": "People Fitness", "action": "EXCLUDED", "evidence": "Legacy; site now Gym+"},
        {"chain": "FitClub", "action": "EXCLUDED", "evidence": "2 Kaunas sites — below threshold"},
        {"chain": "Fitus", "action": "EXCLUDED", "evidence": "Single-site spa/gym"},
        {"chain": "Gym!", "action": "ABSENT", "evidence": "Latvian/Estonian brand — NOT Gym+ Lithuania"},
        {"chain": "MyFitness", "action": "ABSENT_LT_BRAND", "evidence": "EE parent; LT consumer brand is Gym+"},
        {"chain": "Basic-Fit/McFIT/FITINN/clever fit/Gold's/World Class", "action": "ABSENT", "evidence": "No LT presence"},
        {"chain": "SportGates/SkyGym/Active Gym/City Gym", "action": "ABSENT", "evidence": "No >=3 site Class A evidence"},
    ]


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"LITHUANIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    rows: list[dict] = []
    prod_rows, lt_live = hydrate_production(rows)

    by_brand: dict[str, int] = {}
    for c in prod_rows:
        by_brand[c["brand"]] = by_brand.get(c["brand"], 0) + 1

    inventory = {
        "country": "Lithuania",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "lithuania_live": lt_live,
        "lt_prefix_live": lt_live,
        "existing_lithuania_production": lt_live > 0,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNNN (5-digit string; LT- prefix stripped in storage)",
        "gym_plus_gym_exclamation_identity_collisions": 0,
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "Gym+": {"open_active": 38, "coming_soon": 1, "source": "https://gymplius.lt/en/about-us/gyms/"},
            "Lemon Gym": {"open_active": 18, "coming_soon": 2, "source": "https://www.lemongym.lt/en/"},
            "Impuls": {"open_active": 5, "source": "https://www.impuls.lt/"},
        },
        "sources": [
            "https://gymplius.lt/en/about-us/gyms/",
            "https://www.lemongym.lt/en/",
            "https://www.impuls.lt/",
            "https://ellex.legal/project/my-fitness-acquisition-of-vs-fitness/",
        ],
    }
    for brand, count in sorted(by_brand.items()):
        official = CLASS_A_OFFICIAL.get(brand, count)
        inventory["chains"].append(
            {
                "chain": brand,
                "classification": "A" if count >= 3 else "E",
                "open_active": count,
                "official_current_active": official,
                "ready_estimate": count,
                "class_a": count >= 3,
                "source": "production_hydrate + official estate audit",
                "verdict": "COMPLETE" if count >= official else "GAP",
            }
        )

    print(f"Hydrated {lt_live} existing production Lithuania rows")
    stage_coming_soon(rows)
    stage_excluded(rows)
    stage_municipal_audits(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "lithuania_phase1_candidates.json", rows)
    write_json(OUT / "lithuania_chain_inventory.json", inventory)
    write_json(
        OUT / "LITHUANIA_EXISTING_PRODUCTION_SNAPSHOT.json",
        [r for r in rows if r.get("import_category") == "EXISTING_PRODUCTION"],
    )

    rebrand = {
        "country": "Lithuania",
        "phase": 1,
        "maps": [
            {
                "legacy_brand": "VS Fitness",
                "current_brand": "Gym+",
                "classification": "A_current_successor",
                "evidence": "My Fitness AS / Gym+ acquired VS Fitness Apr 2024",
            },
            {
                "legacy_brand": "People Fitness",
                "current_brand": "Gym+",
                "classification": "A_current_successor",
                "evidence": "Saltoniškių g. 9 on Gym+ directory",
            },
            {
                "legacy_brand": "Gym+",
                "current_brand": "Gym!",
                "classification": "B_distinct_national_estate",
                "evidence": "Gym+ Lithuania ≠ Gym! Latvia/Estonia — punctuation/materially different brand",
            },
            {
                "legacy_brand": "Lemon Gym",
                "current_brand": "Impuls",
                "classification": "B_distinct_current_clubs",
                "evidence": "Same ownership group; distinct consumer brands and estates",
            },
            {
                "legacy_brand": "MyFitness AS",
                "current_brand": "Gym+",
                "classification": "C_name_confusion",
                "evidence": "Parent company; LT consumer brand is Gym+",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "LITHUANIA_PHASE1_REBRAND_MAP.json", rebrand)

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
                "lithuania_live": lt_live,
                "statuses": dict(statuses),
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
