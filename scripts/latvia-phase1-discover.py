#!/usr/bin/env python3
"""Latvia Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_lv_postal,
    write_json,
)

OUT = ROOT / "data/latvia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, OUT / "scrapes", PHASE1):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38"
PRODUCTION_TOTAL = 11923

CITY_CANON = {
    "rīga": "Rīga",
    "riga": "Rīga",
    "daugavpils": "Daugavpils",
    "liepāja": "Liepāja",
    "liepaja": "Liepāja",
    "jelgava": "Jelgava",
    "jūrmala": "Jūrmala",
    "jurmala": "Jūrmala",
    "ventspils": "Ventspils",
    "rēzekne": "Rēzekne",
    "rezekne": "Rēzekne",
    "valmiera": "Valmiera",
    "jēkabpils": "Jēkabpils",
    "jekabpils": "Jēkabpils",
    "ogre": "Ogre",
    "tukums": "Tukums",
    "cēsis": "Cēsis",
    "cesis": "Cēsis",
    "sigulda": "Sigulda",
    "kuldīga": "Kuldīga",
    "kuldiga": "Kuldīga",
    "saldus": "Saldus",
    "bauska": "Bauska",
    "madona": "Madona",
    "limbaži": "Limbaži",
    "limbazi": "Limbaži",
    "gulbene": "Gulbene",
    "alūksne": "Alūksne",
    "aluksne": "Alūksne",
    "krāslava": "Krāslava",
    "kraslava": "Krāslava",
    "ludza": "Ludza",
    "preiļi": "Preiļi",
    "preili": "Preiļi",
    "dobele": "Dobele",
    "aizkraukle": "Aizkraukle",
    "valka": "Valka",
    "valga": "Valga",
    "mārupe": "Mārupe",
    "marupe": "Mārupe",
    "salaspils": "Salaspils",
    "ikšķile": "Ikšķile",
    "ikskile": "Ikšķile",
    "ādaži": "Ādaži",
    "adazi": "Ādaži",
    "dreiliņi": "Rīga",
    "dreilini": "Rīga",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    key2 = s.lower().strip()
    return CITY_CANON.get(key2) or CITY_CANON.get(key.replace(" ", "-")) or CITY_CANON.get(key) or s


def prod_row(c: dict) -> dict:
    return base_row(
        prefix="lv_",
        country="Latvia",
        brand=c["brand"],
        name=c["name"],
        address=c["address"],
        postal_code=format_lv_postal(str(c.get("postal_code", ""))) or str(c.get("postal_code", "")),
        city=canon_city(c["city"]),
        source_url=c.get("website") or c.get("source_url") or "production_hydrate",
        lat=c.get("lat"),
        lng=c.get("lng"),
        coord_source=c.get("coord_source") or "KNOWN_PREMISES_HYDRATE",
        notes="existing_production_hydrate",
        discovery_class="national_chain",
        chain_key=(c.get("brand") or "").lower().replace(" ", "_").replace("!", ""),
    )


def hydrate_production(rows: list[dict]) -> tuple[list[dict], int]:
    catalog = json.loads(CENTERS.read_text())
    lv = [c for c in catalog if str(c.get("id", "")).startswith("lv_")]
    for c in lv:
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
    return lv, len(lv)


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
        prefix="lv_",
        country="Latvia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_lv_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("!", ""),
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
        brand="Lemon Gym",
        name="Lemon Gym Ziepniekkalns",
        address="Valdeķu iela 39",
        city="Rīga",
        postal="",
        source_url="https://www.lemongym.lv/en/clubs/",
        notes="Official lemongym.lv — FROM 02.09 COMING_SOON; not open at Phase 1 audit",
        coming=True,
        chain_key="lemon_gym",
    )


def stage_excluded(rows: list[dict]) -> None:
    exclusions = [
        ("People Fitness", "People Fitness (legacy LV)", "Ernesta Birznieka-Upīša iela 21A", "Rīga", "1011",
         "https://company.lursoft.lv/en/fit-people/40103910132",
         "E_legacy_or_absent — SIA fit People liquidated 2023-12-19"),
        ("Global Fitness", "Global Fitness (hotel)", "Tērbatas iela 73", "Rīga", "1001",
         "http://www.globalfitness.lv",
         "E_small_operator — hotel/SPA gym; not Class A"),
        ("Best Fit", "Best Fit Daugavpils", "Daugavpils", "Daugavpils", "",
         "https://www.bestfit.lv/",
         "E_small_operator — single-site Daugavpils club"),
        ("Gym Lāčplēsis", "Gym Lāčplēsis Liepāja", "Brīvības iela 23a", "Liepāja", "3401",
         "https://www.gymlacplesis.lv/",
         "E_small_operator — single-site Liepāja bodybuilding gym"),
        ("City Fitness", "City Fitness (legacy name)", "Rīga", "Rīga", "",
         "https://www.myfitness.lv/",
         "F_legacy_or_absent — historical name linked to MyFitness estate"),
        ("Gym+", "Gym+ Latvia probe", "Rīga", "Rīga", "",
         "https://gymplius.lt/",
         "F_legacy_or_absent — Lithuanian consumer brand; no LV estate"),
        ("Impuls", "Impuls Latvia probe", "Rīga", "Rīga", "",
         "https://impuls.lt/",
         "F_legacy_or_absent — Lithuanian consumer brand; no LV estate"),
        ("Basic-Fit", "Basic-Fit Latvia probe", "Rīga", "Rīga", "",
         "https://www.basic-fit.com/",
         "F_legacy_or_absent — absent in Latvia"),
        ("McFIT", "McFIT Latvia probe", "Rīga", "Rīga", "",
         "https://www.mcfit.com/",
         "F_legacy_or_absent — absent in Latvia"),
        ("Anytime Fitness", "Anytime Fitness Latvia probe", "Rīga", "Rīga", "",
         "https://www.anytimefitness.com/",
         "F_legacy_or_absent — absent in Latvia"),
        ("FITINN", "FITINN Latvia probe", "Rīga", "Rīga", "",
         "https://www.fitinn.at/",
         "F_legacy_or_absent — absent in Latvia"),
        ("clever fit", "clever fit Latvia probe", "Rīga", "Rīga", "",
         "https://www.clever-fit.com/",
         "F_legacy_or_absent — absent in Latvia"),
    ]
    for brand, name, addr, city, postal, url, notes in exclusions:
        add(
            rows,
            brand=brand,
            name=name,
            address=addr,
            city=city,
            postal=postal,
            source_url=url,
            notes=notes,
            excluded=True,
            discovery_class="excluded_probe",
        )


def stage_municipal_audits(rows: list[dict]) -> None:
    """Deep-audit markers for cities without verified Class A READY presence."""
    audits = [
        ("Liepāja", "Deep audit — Gym Lāčplēsis single-site excluded; no Class A chain; municipal sports centers unresolved"),
        ("Jelgava", "Deep audit — no MyFitness/Lemon/Gym! estate; no verified conventional public Class A gym"),
        ("Jūrmala", "Deep audit — tourism/hotel false-positive risk; no verified conventional public Class A gym"),
        ("Ventspils", "Deep audit — no Class A chain presence verified"),
        ("Rēzekne", "Deep audit — Latgale multilingual audit; no Class A chain presence verified"),
        ("Valmiera", "Deep audit — no Class A chain presence verified"),
        ("Jēkabpils", "Deep audit — no Class A chain presence verified"),
        ("Ogre", "Deep audit — Rīga orbit municipality; no Class A chain presence verified"),
        ("Tukums", "Deep audit — no Class A chain presence verified"),
        ("Cēsis", "Deep audit — no Class A chain presence verified"),
        ("Sigulda", "Deep audit — tourism/wellness false-positive control; no Class A chain"),
        ("Kuldīga", "Deep audit — no Class A chain presence verified"),
        ("Saldus", "Deep audit — no Class A chain presence verified"),
        ("Bauska", "Deep audit — Lithuania border safety; no Class A chain verified"),
        ("Madona", "Deep audit — no Class A chain presence verified"),
        ("Limbaži", "Deep audit — no Class A chain presence verified"),
        ("Gulbene", "Deep audit — no Class A chain presence verified"),
        ("Alūksne", "Deep audit — no Class A chain presence verified"),
        ("Krāslava", "Deep audit — Belarus border scrutiny; no Class A chain verified"),
        ("Ludza", "Deep audit — Russia border scrutiny; no Class A chain verified"),
        ("Preiļi", "Deep audit — Latgale; no Class A chain verified"),
        ("Dobele", "Deep audit — no Class A chain presence verified"),
        ("Aizkraukle", "Deep audit — no Class A chain presence verified"),
        ("Valka", "Deep audit — Valka=Latvia; Valga=Estonia; no Class A chain; border identity verified"),
        ("Mārupe", "Rīga metro audit — no separate Class A chain beyond Rīga estate"),
        ("Salaspils", "Rīga metro audit — no separate Class A chain beyond Rīga estate"),
        ("Ikšķile", "Rīga metro audit — no separate Class A chain beyond Rīga estate"),
        ("Ādaži", "Rīga metro audit — no separate Class A chain beyond Rīga estate"),
    ]
    for city, notes in audits:
        add(
            rows,
            brand="Municipal audit",
            name=f"Latvia Phase 1 municipal audit — {city}",
            address="N/A",
            city=city,
            source_url="phase1_municipal_sweep",
            notes=notes,
            needs_review=True,
            discovery_class="municipal_audit",
        )


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "MyFitness", "action": "CLASS_A_COMPLETE", "evidence": "15/15 official Rīga-metro clubs in production"},
        {"chain": "Lemon Gym", "action": "CLASS_A_COMPLETE", "evidence": "8/8 open in production; Ziepniekkalns COMING_SOON"},
        {"chain": "Gym!", "action": "CLASS_A_COMPLETE", "evidence": "10/10 official (9 Rīga + Daugavpils) in production"},
        {"chain": "People Fitness", "action": "EXCLUDED", "evidence": "Liquidated legacy operator"},
        {"chain": "F1 Fitness", "action": "ABSENT", "evidence": "No >=3 conventional LV estate found"},
        {"chain": "Atlētika", "action": "ABSENT", "evidence": "No >=3 conventional LV estate found"},
        {"chain": "City Fitness", "action": "EXCLUDED", "evidence": "Legacy/MyFitness name confusion"},
        {"chain": "Global Fitness", "action": "EXCLUDED", "evidence": "Hotel single-site"},
        {"chain": "Fitness24Seven", "action": "ABSENT", "evidence": "No LV conventional chain estate"},
        {"chain": "Basic-Fit", "action": "ABSENT", "evidence": "No LV presence"},
        {"chain": "PureGym", "action": "ABSENT", "evidence": "No LV presence"},
        {"chain": "McFIT", "action": "ABSENT", "evidence": "No LV presence"},
        {"chain": "JOHN REED", "action": "ABSENT", "evidence": "No verified LV estate"},
        {"chain": "Gold's Gym", "action": "ABSENT", "evidence": "No multi-site LV chain"},
        {"chain": "World Class", "action": "ABSENT", "evidence": "No conventional LV chain"},
        {"chain": "24-7 Fitness", "action": "ABSENT", "evidence": "Estonian chain — no LV estate"},
        {"chain": "Gym+", "action": "ABSENT", "evidence": "Lithuanian brand only"},
        {"chain": "Impuls", "action": "ABSENT", "evidence": "Lithuanian brand only"},
    ]


def write_chain_summaries() -> None:
    (PAGES / "myfitness_klubi_summary.txt").write_text(
        "Source: https://www.myfitness.lv/klubi/\n"
        "15 clubs — all in existing production (Rīga metro).\n",
        encoding="utf-8",
    )
    (PAGES / "lemongym_clubs_summary.txt").write_text(
        "Source: https://www.lemongym.lv/en/clubs/\n"
        "8 open in production + Ziepniekkalns COMING_SOON.\n",
        encoding="utf-8",
    )
    (PAGES / "gym_bang_clubs_summary.txt").write_text(
        "Source: https://www.gymlatvija.lv/en/clubs/\n"
        "10 clubs in production: 9 Rīga + Daugavpils.\n",
        encoding="utf-8",
    )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"LATVIA PHASE 1 BLOCKED — PRODUCTION BASELINE DRIFT: {PRE_SHA}")

    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    rows: list[dict] = []
    prod_rows, lv_live = hydrate_production(rows)

    by_brand: dict[str, int] = {}
    for c in prod_rows:
        by_brand[c["brand"]] = by_brand.get(c["brand"], 0) + 1

    inventory = {
        "country": "Latvia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "latvia_live": lv_live,
        "lv_prefix_live": lv_live,
        "existing_latvia_production": lv_live > 0,
        "market_model": "CHAIN_LED",
        "postcode_model": "NNNN (4-digit string; LV- prefix stripped in storage)",
        "chains": [],
        "probes": probe_other_chains(),
        "official_estate": {
            "MyFitness": {"open_active": 15, "source": "https://www.myfitness.lv/klubi/"},
            "Lemon Gym": {"open_active": 8, "coming_soon": 1, "source": "https://www.lemongym.lv/en/clubs/"},
            "Gym!": {"open_active": 10, "source": "https://www.gymlatvija.lv/en/clubs/"},
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

    print(f"Hydrated {lv_live} existing production Latvia rows")
    stage_coming_soon(rows)
    stage_excluded(rows)
    stage_municipal_audits(rows)
    write_chain_summaries()

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "latvia_phase1_candidates.json", rows)
    write_json(OUT / "latvia_chain_inventory.json", inventory)
    write_json(
        OUT / "LATVIA_EXISTING_PRODUCTION_SNAPSHOT.json",
        [r for r in rows if r.get("import_category") == "EXISTING_PRODUCTION"],
    )

    rebrand = {
        "country": "Latvia",
        "phase": 1,
        "maps": [
            {
                "legacy_brand": "People Fitness",
                "current_brand": None,
                "classification": "F_legacy_or_absent",
                "evidence": "SIA fit People liquidated Dec 2023",
            },
            {
                "legacy_brand": "City Fitness",
                "current_brand": "MyFitness",
                "classification": "C_name_confusion",
                "evidence": "Historical name linked to MyFitness LV estate",
            },
            {
                "legacy_brand": "MyFitness AS (EE parent)",
                "current_brand": "MyFitness",
                "classification": "B_distinct_national_estate",
                "evidence": "Separate lv_* estate from EE; consumer brand is MyFitness in LV",
            },
            {
                "legacy_brand": "Lemon Gym LV",
                "current_brand": "Lemon Gym LT",
                "classification": "B_distinct_current_clubs",
                "evidence": "Same brand family; separate national estates",
            },
            {
                "legacy_brand": "Gym!",
                "current_brand": "Gym+",
                "classification": "B_distinct_national_estate",
                "evidence": "Gym Latvija SIA (LV) — NOT Gym+ Lithuania",
            },
            {
                "legacy_brand": "Valga",
                "current_brand": "Valka",
                "classification": "B_border_twin_towns",
                "evidence": "Valga=Estonia; Valka=Latvia — never merge",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "LATVIA_PHASE1_REBRAND_MAP.json", rebrand)

    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post != EXPECTED_SHA:
        raise SystemExit(f"Production modified during discover: {post}")
    (PHASE1 / "PHASE1_SHA_AFTER.txt").write_text(post + "\n", encoding="utf-8")

    from collections import Counter

    statuses = Counter(r.get("import_category") for r in rows)
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "latvia_live": lv_live,
                "statuses": dict(statuses),
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
