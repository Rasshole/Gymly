#!/usr/bin/env python3
"""Slovenia Deep Phase 1 discovery — read-only. Does NOT modify centers.json."""
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
    format_si_postal,
    make_id,
    write_json,
)

OUT = ROOT / "data/slovenia"
PHASE1 = OUT / "phase1"
for d in (OUT, OUT / "raw", OUT / "raw/pages", PHASE1, OUT / "scrapes"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

CITY_CANON = {
    "ljubljana": "Ljubljana",
    "maribor": "Maribor",
    "celje": "Celje",
    "kranj": "Kranj",
    "koper": "Koper",
    "capodistria": "Koper",
    "novo mesto": "Novo mesto",
    "murska sobota": "Murska Sobota",
    "kamnik": "Kamnik",
    "mengeš": "Mengeš",
    "menges": "Mengeš",
    "domžale": "Domžale",
    "domzale": "Domžale",
    "grosuplje": "Grosuplje",
    "jesenice": "Jesenice",
    "velenje": "Velenje",
    "nova gorica": "Nova Gorica",
    "ptuj": "Ptuj",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    return CITY_CANON.get(s.lower().replace("-", " ").strip(), s)


def prod_row(c: dict) -> dict:
    return base_row(
        prefix="si_",
        country="Slovenia",
        brand=c["brand"],
        name=c["name"],
        address=c["address"],
        postal_code=format_si_postal(str(c.get("postal_code", ""))) or str(c.get("postal_code", "")),
        city=canon_city(c["city"]),
        source_url=c.get("website") or c.get("source_url") or "production_hydrate",
        lat=c.get("lat"),
        lng=c.get("lng"),
        coord_source=c.get("coord_source") or "KNOWN_PREMISES_HYDRATE",
        notes="existing_production_hydrate",
        discovery_class="national_chain",
        chain_key=(c.get("brand") or "").lower().replace(" ", "_"),
    )


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
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
    chain_key: str | None = None,
    stable_id: str | None = None,
) -> None:
    row = base_row(
        prefix="si_",
        country="Slovenia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_si_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_"),
    )
    if stable_id:
        row["id"] = stable_id
    if excluded:
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
        row["eligibility"] = "EXCLUDED"
        row["classification"] = "SPECIALIST_EXCLUDED"
    elif coming:
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif needs_review:
        row["import_category"] = "NEEDS_REVIEW"
        row["is_active"] = False
        row["verification_status"] = "NEEDS_REVIEW"
    rows.append(row)


def hydrate_production(rows: list[dict]) -> tuple[list[dict], int]:
    catalog = json.loads(CENTERS.read_text())
    si = [c for c in catalog if str(c.get("id", "")).startswith("si_")]
    for c in si:
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
    return si, len(si)


def probe_other_chains() -> list[dict]:
    return [
        {"chain": "McFIT", "action": "ABSENT", "evidence": "No SI clubs on McFIT locator"},
        {"chain": "JOHN REED", "action": "ABSENT", "evidence": "No verified SI estate"},
        {"chain": "Basic-Fit", "action": "ABSENT", "evidence": "No verified SI conventional chain"},
        {"chain": "PureGym", "action": "ABSENT", "evidence": "No SI presence"},
        {"chain": "Fitness24Seven", "action": "ABSENT", "evidence": "No SI presence"},
        {"chain": "Anytime Fitness", "action": "ABSENT", "evidence": "No verified SI clubs"},
        {"chain": "Gold's Gym", "action": "ABSENT", "evidence": "No multi-site SI chain"},
        {"chain": "World Class", "action": "ABSENT", "evidence": "No conventional SI chain"},
        {"chain": "Clever Fit (legacy brand)", "action": "REBRANDED", "evidence": "CF FITNESS d.o.o. operates as Shape House in production"},
        {"chain": "4P Fitness", "action": "BELOW_THRESHOLD", "evidence": "2 sites — sub Class A threshold"},
        {"chain": "Fit13", "action": "BELOW_THRESHOLD", "evidence": "2 Ljubljana sites — sub threshold"},
        {"chain": "Alfa Gym", "action": "SINGLE_SITE", "evidence": "Single Ljubljana Dunajska 49"},
        {"chain": "Millennium / Konex", "action": "UNRESOLVED", "evidence": "Insufficient >=3 conventional SI evidence"},
    ]


def stage_excluded_and_review(rows: list[dict]) -> None:
    add(
        rows,
        brand="ŠUS Eurofitness",
        name="ŠUS Eurofitness Ljubljana",
        address="Vodnikova cesta 155",
        city="Ljubljana",
        postal="1000",
        source_url="https://sus-eurofitness.si/kontakt/",
        excluded=True,
        notes="EXCLUDED_mixed_spa_pool; single-site pool/spa heavy",
        discovery_class="excluded_probe",
    )
    add(
        rows,
        brand="4P Fitness",
        name="4P Fitness Ljubljana Stegne",
        address="Stegne 11",
        city="Ljubljana",
        postal="1000",
        source_url="https://4pfitness.si/",
        excluded=True,
        notes="E chain — 2 locations total; sub-threshold",
    )
    add(
        rows,
        brand="4P Fitness",
        name="4P Fitness Novo mesto",
        address="Foersterjeva ulica 10",
        city="Novo mesto",
        postal="8000",
        source_url="https://4pfitness.si/",
        excluded=True,
    )
    add(
        rows,
        brand="Alfa Gym",
        name="Alfa Gym Ljubljana",
        address="Dunajska cesta 49",
        city="Ljubljana",
        postal="1000",
        source_url="https://alfagym.si/",
        needs_review=True,
        notes="single-site independent; Phase 2 review for conventional public access",
        discovery_class="independent_probe",
    )
    add(
        rows,
        brand="Fit13",
        name="Fit13 Ljubljana Brnčičeva",
        address="Brnčičeva ulica 45",
        city="Ljubljana",
        postal="1000",
        source_url="https://fit13.si/",
        excluded=True,
        notes="2-site boutique chain — below Class A threshold",
    )
    # Border false-positive probe — Gorizia Italy must not import
    add(
        rows,
        brand="Foreign Probe",
        name="Gorizia Italy Border Probe",
        address="Via XX Settembre 1",
        city="Gorizia",
        postal="34170",
        source_url="border_probe:nova_gorica_gorizia",
        excluded=True,
        lat=45.9411,
        lng=13.6219,
        coord_source="BORDER_PROBE",
        notes="EXCLUDED_foreign_probe; Gorizia=Italy not Slovenia",
        discovery_class="border_probe",
    )


def main() -> None:
    if PRE_SHA != EXPECTED_SHA:
        raise SystemExit(f"Production SHA mismatch: {PRE_SHA} != {EXPECTED_SHA}")

    rows: list[dict] = []
    prod_rows, si_live = hydrate_production(rows)

    inventory = {
        "country": "Slovenia",
        "phase": 1,
        "deep_phase": True,
        "production_sha_before": PRE_SHA,
        "production_total": PRODUCTION_TOTAL,
        "slovenia_live": si_live,
        "existing_slovenia_production": si_live > 0,
        "chains": [],
        "probes": probe_other_chains(),
        "market_model": "CHAIN_LED",
    }

    by_brand: dict[str, int] = {}
    for c in prod_rows:
        by_brand[c["brand"]] = by_brand.get(c["brand"], 0) + 1

    for chain, count in sorted(by_brand.items()):
        inventory["chains"].append(
            {
                "chain": chain,
                "classification": "A" if count >= 3 else "E",
                "open_active": count,
                "ready_estimate": count,
                "class_a": count >= 3,
                "source": "production_hydrate + prior official estate audit",
                "verdict": "COMPLETE",
            }
        )

    print(f"Hydrated {si_live} existing production Slovenia rows")
    stage_excluded_and_review(rows)

    by_id: dict[str, dict] = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "slovenia_phase1_candidates.json", rows)
    write_json(OUT / "slovenia_chain_inventory.json", inventory)
    write_json(
        OUT / "SLOVENIA_EXISTING_PRODUCTION_SNAPSHOT.json",
        [r for r in rows if r.get("import_category") == "EXISTING_PRODUCTION"],
    )

    rebrand = {
        "country": "Slovenia",
        "maps": [
            {
                "legacy_brand": "clever fit",
                "current_brand": "Shape House",
                "operator": "CF FITNESS d.o.o.",
                "classification": "A_legitimate_rebrand",
                "evidence": "Production uses Shape House branding; clever fit franchise predecessor",
                "production_decision": "reconcile_as_shape_house",
            },
            {
                "legacy_brand": "FITINN Maribor Maribox (prej Kolosej)",
                "current_brand": "FITINN",
                "classification": "A_legitimate_rebrand",
                "evidence": "fitinn.si studio title retains Kolosej predecessor label",
            },
        ],
        "unresolved_conflicts": 0,
        "excluded_aggregators": ["MultiSport", "FitGang", "Sported directory"],
    }
    write_json(OUT / "SLOVENIA_PHASE1_REBRAND_MAP.json", rebrand)
    (PHASE1 / "PHASE1_SHA_BEFORE.txt").write_text(PRE_SHA + "\n", encoding="utf-8")

    print(f"Candidates={len(rows)} existing={si_live} SHA={PRE_SHA[:12]}…")


if __name__ == "__main__":
    main()
