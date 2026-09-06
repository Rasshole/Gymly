#!/usr/bin/env python3
"""Serbia Deep Phase 2 — resolve all Phase 1 NR/NC rows; staging only.

Does NOT modify src/data/centers.json.
Preserves Phase 1 rs_* IDs; adds newly discovered Class A + SMI premises.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    RS_POSTAL_RE,
    base_row,
    format_rs_postal,
    in_serbia,
    make_id,
    status_counts,
    write_json,
)

OUT = ROOT / "data/serbia"
PHASE2 = OUT / "phase2"
PHASE2.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5"
PRODUCTION_TOTAL = 11858
TERRITORY = "Serbia"
PREFIX = "rs_"

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx|directory_.*_premises",
    re.I,
)

P1_UNRESOLVED = {
    "rs_f8562f5e78",
    "rs_93ddb58ab3",
    "rs_5c79da95f6",
    "rs_825b0335b1",
    "rs_a47abd9ea2",
    "rs_9596b790d8",
    "rs_efbb875eff",
    "rs_f955330fd9",
    "rs_064e4634c1",
    "rs_8b20b0ed95",
    "rs_037d24163a",
    "rs_763ca61d6d",
    "rs_a3cad43398",
    "rs_d0fec55354",
    "rs_f335c0079e",
    "rs_a62cccd3b8",
    "rs_094f59b42e",
    "rs_94a4d4c0b0",
    "rs_51ba98e5d2",
    "rs_4d85bf1ecc",
    "rs_74d93260bd",
    "rs_afae4b6c7d",
    "rs_a367065cde",
    "rs_b1e6db43f7",
    "rs_a4fee2be29",
    "rs_e8816f6865",
    "rs_c9b36210af",
    "rs_eb6b483124",
    "rs_6811175dcc",
    "rs_7bef7e159b",
    "rs_12604c3213",
    "rs_5351db6c9a",
    "rs_5394153402",
    "rs_ac2408e2eb",
    "rs_ae567c47e8",
    "rs_f0538b1a73",
    "rs_ab6da833fd",
    "rs_ce93e07316",
    "rs_46c05a109d",
    "rs_45e1837d4e",
}


def _excl(phase2_classification: str, notes: str) -> dict:
    return {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": phase2_classification,
        "notes": notes,
    }


def _belgrade_noise(name: str) -> dict:
    return _excl(
        "D_INSUFFICIENT_EVIDENCE",
        f"Phase2: {name} EXCLUDED — Belgrade directory probe without defended street "
        "premises; generic placeholder not verifiable as conventional public gym.",
    )


DECISIONS: dict[str, dict] = {
    "rs_f8562f5e78": _belgrade_noise("World Gym Belgrade"),
    "rs_93ddb58ab3": _belgrade_noise("Iron Fitness Belgrade"),
    "rs_5c79da95f6": _belgrade_noise("Fitness Factory Belgrade"),
    "rs_825b0335b1": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Body Line Belgrade EXCLUDED — no premises-grade coordinates; "
        "street unit not defended.",
    ),
    "rs_a47abd9ea2": _belgrade_noise("Power Gym Belgrade"),
    "rs_9596b790d8": _belgrade_noise("Active Gym Belgrade"),
    "rs_efbb875eff": _belgrade_noise("Extreme Fitness Belgrade"),
    "rs_f955330fd9": _belgrade_noise("Olympic Gym Belgrade"),
    "rs_064e4634c1": _belgrade_noise("Premium Gym Belgrade"),
    "rs_8b20b0ed95": _belgrade_noise("Hard Rock Gym Belgrade"),
    "rs_037d24163a": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Max Gym Belgrade EXCLUDED — no premises-grade coordinates; "
        "directory noise without defended unit.",
    ),
    "rs_763ca61d6d": _belgrade_noise("Fit Club Belgrade"),
    "rs_a3cad43398": _belgrade_noise("Teretana Centar Belgrade"),
    "rs_d0fec55354": _belgrade_noise("Sport Vision Gym Belgrade"),
    "rs_f335c0079e": _excl(
        "C_SPECIALIST",
        "Phase2: Flex Gym Belgrade EXCLUDED — functional/CrossFit-style specialist "
        "risk; not ordinary conventional public gym floor.",
    ),
    "rs_a62cccd3b8": _excl(
        "B_SPECIALIST_AEROBICS",
        "Phase2: Forma Plus Belgrade EXCLUDED — aerobics/specialist; "
        "no premises-grade coordinates.",
    ),
    "rs_094f59b42e": _excl(
        "C_UNVERIFIED_LOCAL_BRAND",
        "Phase2: Planet Fitness Belgrade (local) EXCLUDED — local brand unverified; "
        "distinct from US chain; insufficient conventional premises proof.",
    ),
    "rs_94a4d4c0b0": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Novi Sad placeholder EXCLUDED — generic city probe; "
        "Ahilej + Mega Gym + X Sport Gym Phase2 READY cover Novi Sad.",
    ),
    "rs_51ba98e5d2": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Niš placeholder EXCLUDED — generic city probe; "
        "Gym Town Class A (3 sites) + ONE Wellness Phase2 READY cover Niš.",
    ),
    "rs_4d85bf1ecc": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Kragujevac EXCLUDED — no defended conventional "
        "public gym after independent sweep.",
    ),
    "rs_74d93260bd": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Subotica EXCLUDED — generic placeholder; "
        "no verified conventional public gym.",
    ),
    "rs_afae4b6c7d": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Pančevo EXCLUDED — Ahilej + Non Stop Pančevo "
        "READY supersedes generic placeholder.",
    ),
    "rs_a367065cde": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Čačak EXCLUDED — no defended conventional gym.",
    ),
    "rs_b1e6db43f7": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Kraljevo EXCLUDED — no defended conventional gym.",
    ),
    "rs_a4fee2be29": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Novi Pazar EXCLUDED — no defended conventional gym "
        "after Sandžak deep sweep.",
    ),
    "rs_e8816f6865": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Kruševac EXCLUDED — no defended conventional gym.",
    ),
    "rs_c9b36210af": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Leskovac EXCLUDED — no defended conventional gym.",
    ),
    "rs_eb6b483124": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Užice EXCLUDED — no defended conventional gym.",
    ),
    "rs_6811175dcc": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Zrenjanin EXCLUDED — no defended conventional gym.",
    ),
    "rs_7bef7e159b": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Smederevo EXCLUDED — Mega Gym Smederevo READY "
        "supersedes generic placeholder.",
    ),
    "rs_12604c3213": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Valjevo EXCLUDED — no defended conventional gym.",
    ),
    "rs_5351db6c9a": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Šabac EXCLUDED — no defended conventional gym.",
    ),
    "rs_5394153402": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Sombor EXCLUDED — no defended conventional gym.",
    ),
    "rs_ac2408e2eb": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Vranje EXCLUDED — no defended conventional gym.",
    ),
    "rs_ae567c47e8": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Bujanovac EXCLUDED — no defended conventional gym; "
        "country=Serbia confirmed for any future premises.",
    ),
    "rs_f0538b1a73": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Fitness Centar Preševo EXCLUDED — no premises-grade coordinates; "
        "generic placeholder; country=Serbia for any future premises.",
    ),
    "rs_ab6da833fd": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Fitness Centar Pirot EXCLUDED — no defended conventional gym.",
    ),
    "rs_ce93e07316": _excl(
        "A_LEGITIMATE_NO_VERIFIED_PREMISES",
        "Phase2: Teretana Sremska Mitrovica candidate EXCLUDED — no defended "
        "conventional public gym; distinct from Kosovo Mitrovicë.",
    ),
    "rs_46c05a109d": _excl(
        "C_MUNICIPAL",
        "Phase2: Pionirski Park municipal teretana candidate EXCLUDED — municipal "
        "outdoor/sports amenity; no ordinary public membership gym floor defended.",
    ),
    "rs_45e1837d4e": _excl(
        "C_MUNICIPAL",
        "Phase2: Gradska teretana Novi Sad municipal candidate EXCLUDED — municipal "
        "facility; no defended ordinary public conventional gym product.",
    ),
}

NEW_GYMS: list[dict] = [
    {
        "brand": "Sky Experience",
        "name": "Sky Experience Belgrade",
        "address": "Tadeuša Košćuška 63",
        "postal_code": "11000",
        "city": "Belgrade",
        "municipality": "Stari Grad",
        "lat": 44.81892,
        "lng": 20.45628,
        "coord_source": "official_skyexperience_rs_premises",
        "website": "https://www.skyexperience.rs/",
        "source_url": "https://www.skyexperience.rs/contact-us",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "WELLNESS_ADDITIVE",
        "chain_key": "sky_experience",
        "discovery_class": "phase2_belgrade_sweep",
        "notes": (
            "Phase2: Premium conventional public gym + sauna; skyexperience.rs verified; "
            "ordinary membership/day pass; WELLNESS_ADDITIVE not spa-primary."
        ),
    },
    {
        "brand": "Centar X Fitness",
        "name": "Centar X Fitness Zvezdara",
        "address": "Zahumska 40",
        "postal_code": "11120",
        "city": "Belgrade",
        "municipality": "Zvezdara",
        "lat": 44.80276,
        "lng": 20.48865,
        "coord_source": "planplus_zahumska_40_premises",
        "website": "https://www.navidiku.rs/firme/fitnes-klubovi-beograd/centar-x-fitness",
        "source_url": "https://www.planplus.rs/en/centar-x-fitness-center/106833",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "chain_key": "centar_x_fitness",
        "discovery_class": "phase2_belgrade_sweep",
        "notes": (
            "Phase2: Conventional public gym Zvezdara; Zahumska 40 defended; "
            "distinct from Kubanska alias and Fitness Klub Centar Stari Grad."
        ),
    },
    {
        "brand": "X Sport Gym",
        "name": "X Sport Gym Novi Sad",
        "address": "Ćirpanova 8",
        "postal_code": "21101",
        "city": "Novi Sad",
        "municipality": "Novi Sad",
        "lat": 45.25172,
        "lng": 19.83912,
        "coord_source": "official_xsport_gym_premises",
        "website": "https://gym.xsport.rs/",
        "source_url": "https://gym.xsport.rs/",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "chain_key": "x_sport_gym",
        "discovery_class": "phase2_novi_sad_sweep",
        "notes": (
            "Phase2: Conventional public bodybuilding/fitness floor; gym.xsport.rs; "
            "distinct from X Sport supplement shops."
        ),
    },
    {
        "brand": "ONE Wellness",
        "name": "ONE Wellness Niš",
        "address": "Ulica 21. maj 1",
        "postal_code": "18000",
        "city": "Niš",
        "municipality": "Niš",
        "lat": 43.32082,
        "lng": 21.89558,
        "coord_source": "official_onewellnessnis_rs_premises",
        "website": "http://onewellnessnis.rs/",
        "source_url": "http://onewellnessnis.rs/teretana/",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "WELLNESS_ADDITIVE",
        "chain_key": "one_wellness",
        "discovery_class": "phase2_nis_sweep",
        "notes": (
            "Phase2: 1000m² Technogym conventional floor + spa additive; "
            "ordinary public membership; not hotel/resort amenity."
        ),
    },
    {
        "brand": "Gym Town",
        "name": "Gym Town Kraljevića Marka",
        "address": "Kraljevića Marka 23",
        "postal_code": "18000",
        "city": "Niš",
        "municipality": "Medijana",
        "lat": 43.313665,
        "lng": 21.88798,
        "coord_source": "official_gymtown_rs_maps_premises",
        "website": "https://gymtown.rs/",
        "source_url": "https://gymtown.rs/o-nama/",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "chain_key": "gym_town",
        "discovery_class": "phase2_nis_class_a",
        "notes": "Phase2 Class A: Gym Town estate site 1/3; gymtown.rs lokacije.",
    },
    {
        "brand": "Gym Town",
        "name": "Gym Town Different Concept",
        "address": "Todora Milovanovića 14",
        "postal_code": "18000",
        "city": "Niš",
        "municipality": "Niš",
        "lat": 43.31842,
        "lng": 21.89486,
        "coord_source": "official_gymtown_rs_maps_premises",
        "website": "https://gymtown.rs/",
        "source_url": "https://gymtown.rs/o-nama/",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "chain_key": "gym_town",
        "discovery_class": "phase2_nis_class_a",
        "notes": "Phase2 Class A: Gym Town estate site 2/3.",
    },
    {
        "brand": "Gym Town",
        "name": "Gym Town The Trojka",
        "address": "Zetska 36b",
        "postal_code": "18000",
        "city": "Niš",
        "municipality": "Palilula",
        "lat": 43.32548,
        "lng": 21.90342,
        "coord_source": "official_gymtown_rs_maps_premises",
        "website": "https://gymtown.rs/",
        "source_url": "https://gymtown.rs/o-nama/",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "chain_key": "gym_town",
        "discovery_class": "phase2_nis_class_a",
        "notes": "Phase2 Class A: Gym Town estate site 3/3 — The Trojka, Zetska 36b.",
    },
]

CLASS_A_CHAINS = {
    "Ahilej": {"claimed": 33, "website": "https://ahilej.com/lokacije"},
    "Non Stop Fitness": {"claimed": 16, "website": "https://nonstopfitness.rs/"},
    "Mega Gym": {"claimed": 7, "website": "https://megagym.rs/"},
    "Gym Town": {"claimed": 3, "website": "https://gymtown.rs/"},
}

PROBED_NOT_CLASS_A = [
    "Sky Experience",
    "Athletic's Gym",
    "Iron Republic",
    "X-Fit",
    "Fit Complete",
    "Kočović",
    "Star Fitness",
    "City Fitness",
    "Olympic Gym",
]


def assert_freeze() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == TERRITORY) == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith(PREFIX)) == 0
    return sha


def new_row(**kwargs) -> dict:
    brand = kwargs["brand"]
    address = kwargs["address"]
    city = kwargs["city"]
    postal = format_rs_postal(kwargs.get("postal_code", "")) or kwargs["postal_code"]
    row = base_row(
        prefix=PREFIX,
        country=TERRITORY,
        brand=brand,
        name=kwargs["name"],
        address=address,
        postal_code=postal,
        city=city,
        source_url=kwargs.get("source_url", "phase2://discovery"),
        lat=kwargs.get("lat"),
        lng=kwargs.get("lng"),
        coord_source=kwargs.get("coord_source"),
        website=kwargs.get("website", ""),
        notes=kwargs.get("notes", ""),
        discovery_class=kwargs.get("discovery_class", "phase2_discovery"),
        chain_key=kwargs.get("chain_key")
        or brand.lower().replace(" ", "_").replace("-", "_"),
    )
    row["id"] = make_id(PREFIX, brand, address, postal, city, TERRITORY)
    row["municipality"] = kwargs.get("municipality") or city
    row["import_category"] = "READY_TO_IMPORT"
    row["eligibility_path"] = kwargs.get("eligibility_path", "SMALL_MARKET_INDEPENDENT")
    row["eligibility_candidate"] = row["eligibility_path"]
    row["phase2_classification"] = kwargs.get(
        "phase2_classification", "A_CONVENTIONAL_PUBLIC_GYM"
    )
    row["territory"] = TERRITORY
    row["access_class"] = "A_public_conventional"
    row["operator_class"] = "A" if row["eligibility_path"] == "CHAIN_CLASS_A" else "independent"
    row["phase2_new"] = True
    row["verification_status"] = "PHASE2_VERIFIED"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["is_closed"] = False
    row["hotel_spa_risk"] = kwargs.get("phase2_classification") == "WELLNESS_ADDITIVE"
    row["foreign_probe"] = False
    row["kosovo_false_positive"] = False
    return row


def build_decision_records(p1_by_id: dict[str, dict]) -> list[dict]:
    records = []
    for uid in sorted(P1_UNRESOLVED):
        dec = DECISIONS[uid]
        p1 = p1_by_id[uid]
        records.append(
            {
                "id": uid,
                "stable_id": uid,
                "phase1_status": p1.get("import_category"),
                "final_status": dec["status"],
                "reason": dec.get("notes", ""),
                "evidence": p1.get("evidence") or {"source_url": p1.get("source_url")},
                "current_identity": dec.get("name") or p1.get("name"),
                "public_access_evidence": "none_defended" if dec["status"] == "EXCLUDED" else "verified",
                "conventional_gym_evidence": "none" if dec["status"] == "EXCLUDED" else "verified",
                "address_evidence": p1.get("address"),
                "postcode_evidence": p1.get("postal_code"),
                "coordinate_evidence": (
                    f"{p1.get('lat')},{p1.get('lng')}" if p1.get("lat") else "missing"
                ),
                "specialist_assessment": dec.get("phase2_classification", ""),
                "hotel_spa_assessment": "n/a",
                "institutional_assessment": (
                    "municipal_excluded"
                    if dec.get("phase2_classification") == "C_MUNICIPAL"
                    else "n/a"
                ),
                "duplicate_rebrand_assessment": "distinct_or_placeholder",
                "border_assessment": "serbia_mainland",
                "eligibility_path": dec.get("eligibility_path"),
                "phase2_classification": dec.get("phase2_classification"),
                "name": dec.get("name") or p1.get("name"),
                "brand": dec.get("brand") or p1.get("brand"),
                "city": dec.get("city") or p1.get("city"),
            }
        )
    return records


def apply_decision(row: dict, dec: dict) -> None:
    row["import_category"] = dec["status"]
    row["eligibility_path"] = dec.get("eligibility_path", "EXCLUDED")
    row["eligibility_candidate"] = row["eligibility_path"]
    row["phase2_classification"] = dec.get("phase2_classification")
    row["verification_status"] = "PHASE2_TERMINAL"
    if dec.get("notes"):
        row["notes"] = ((row.get("notes") or "") + " | " + dec["notes"]).strip(" |")
    for field in (
        "name",
        "brand",
        "address",
        "postal_code",
        "city",
        "lat",
        "lng",
        "coord_source",
        "website",
    ):
        if dec.get(field) is not None:
            row[field] = dec[field]


def revalidate_class_a_ready(row: dict) -> None:
    """Revalidate Phase 1 Class A READY rows — downgrade only on hard failure."""
    brand = row.get("brand") or ""
    if brand not in CLASS_A_CHAINS:
        return
    lat, lng = row.get("lat"), row.get("lng")
    if lat is None or lng is None:
        raise AssertionError(f"Class A READY missing coords: {row['id']}")
    if not in_serbia(float(lat), float(lng)):
        raise AssertionError(f"Class A READY outside Serbia: {row['id']}")
    if FALLBACK_RE.search(str(row.get("coord_source") or "")):
        raise AssertionError(f"Class A READY fallback coords: {row['id']}")
    pc = str(row.get("postal_code") or "")
    if not RS_POSTAL_RE.match(pc):
        raise AssertionError(f"Class A READY invalid postcode: {row['id']} {pc}")
    row["eligibility_path"] = "CHAIN_CLASS_A"
    row["eligibility_candidate"] = "CHAIN_CLASS_A"
    row["phase2_classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
    row["verification_status"] = "PHASE2_REVALIDATED"
    row["country"] = TERRITORY
    row["territory"] = TERRITORY


def resolve_staging(staging: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id = {r["id"]: deepcopy(r) for r in staging}
    assert len(by_id) == 126, len(by_id)
    assert P1_UNRESOLVED <= set(by_id), P1_UNRESOLVED - set(by_id)

    for uid in P1_UNRESOLVED:
        apply_decision(by_id[uid], DECISIONS[uid])

    for row in by_id.values():
        if row.get("import_category") == "READY_TO_IMPORT":
            revalidate_class_a_ready(row)

    existing_ids = set(by_id)
    new_rows: list[dict] = []
    for spec in NEW_GYMS:
        ng = new_row(**spec)
        while ng["id"] in existing_ids:
            ng["id"] = make_id(
                PREFIX,
                ng["brand"],
                ng["address"] + "|phase2",
                ng["postal_code"],
                ng["city"],
                TERRITORY,
            )
        existing_ids.add(ng["id"])
        by_id[ng["id"]] = ng
        new_rows.append(ng)

    final = list(by_id.values())
    ready = [r for r in final if r["import_category"] == "READY_TO_IMPORT"]
    for r in ready:
        assert r["id"].startswith(PREFIX), r["id"]
        assert RS_POSTAL_RE.match(str(r.get("postal_code") or "")), r["id"]
        assert r.get("lat") is not None and r.get("lng") is not None, r["id"]
        assert in_serbia(float(r["lat"]), float(r["lng"])), (r["id"], r["lat"], r["lng"])
        assert not FALLBACK_RE.search(str(r.get("coord_source") or "")), r["id"]
        assert r.get("eligibility_path") in (
            "CHAIN_CLASS_A",
            "SMALL_MARKET_INDEPENDENT",
        ), (r["id"], r.get("eligibility_path"))
        r["country"] = TERRITORY
        r["territory"] = TERRITORY

    nr = sum(1 for r in final if r["import_category"] == "NEEDS_REVIEW")
    nc = sum(1 for r in final if r["import_category"] == "NEEDS_COORDINATES")
    assert nr == 0 and nc == 0, (nr, nc)

    for uid in P1_UNRESOLVED:
        assert by_id[uid]["import_category"] in (
            "READY_TO_IMPORT",
            "EXCLUDED",
            "CLOSED",
        ), (uid, by_id[uid]["import_category"])

    return final, new_rows


def recover_phase1_snapshot() -> list[dict]:
    src = OUT / "serbia_centers_staging.json"
    p1_src = OUT / "phase1" / "phase1_staging_snapshot.json"
    staging = json.loads(src.read_text(encoding="utf-8"))
    assert len(staging) == 126, len(staging)
    counts = status_counts(staging)
    assert counts.get("READY_TO_IMPORT") == 56, counts
    assert counts.get("NEEDS_REVIEW") == 34, counts
    assert counts.get("NEEDS_COORDINATES") == 6, counts
    assert counts.get("EXCLUDED") == 30, counts
    unresolved = [
        r for r in staging if r["import_category"] in ("NEEDS_REVIEW", "NEEDS_COORDINATES")
    ]
    assert len(unresolved) == 40, len(unresolved)
    assert P1_UNRESOLVED == {r["id"] for r in unresolved}, "P1 unresolved ID mismatch"

    dst = PHASE2 / "phase1_staging_snapshot.json"
    dst.write_text(json.dumps(staging, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if p1_src.exists() and not (OUT / "phase1" / "phase1_staging_snapshot.json").stat().st_size:
        pass
    return staging


def main() -> dict:
    sha = assert_freeze()
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    p1_staging = recover_phase1_snapshot()
    p1_by_id = {r["id"]: r for r in p1_staging}
    assert len(p1_by_id) == 126, len(p1_by_id)
    assert set(p1_by_id) == {r["id"] for r in p1_staging}, "Phase1 ID preservation failed"

    final, new_rows = resolve_staging(p1_staging)
    decisions = build_decision_records(p1_by_id)

    write_json(
        PHASE2 / "decisions.json",
        {
            "decisions": decisions,
            "decision_map": DECISIONS,
            "new_ready_ids": [r["id"] for r in new_rows],
            "original_unresolved": len(P1_UNRESOLVED),
        },
    )
    write_json(OUT / "serbia_centers_staging.json", final)

    return {
        "sha": sha,
        "p1_staging": p1_staging,
        "p1_by_id": p1_by_id,
        "final": final,
        "new_rows": new_rows,
        "decisions": decisions,
    }


if __name__ == "__main__":
    result = main()
    ready = [r for r in result["final"] if r["import_category"] == "READY_TO_IMPORT"]
    print(
        f"Serbia Phase 2 resolve OK — READY={len(ready)} "
        f"TOTAL={len(result['final'])} NEW={len(result['new_rows'])}"
    )
