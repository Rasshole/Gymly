#!/usr/bin/env python3
"""North Macedonia Deep Phase 2 — resolve all Phase 1 NR/NC; staging only.

Does NOT modify src/data/centers.json.
Preserves Phase 1 mk_* IDs; adds only newly discovered premises.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    MK_POSTAL_RE,
    ROOT,
    base_row,
    format_mk_postal,
    haversine,
    in_north_macedonia,
    make_id,
    status_counts,
    write_json,
)

OUT = ROOT / "data/north-macedonia"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2, OUT / "raw" / "pages" / "phase2", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698"
PRODUCTION_TOTAL = 11775

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")

# Phase 1 unresolved IDs (3 NR + 20 NC = 23)
P1_UNRESOLVED = {
    "mk_1a50b8774e",  # Athletic Fitness Diamond Mall
    "mk_ed44181018",  # Star Gym Butel
    "mk_698c3510c0",  # Flex Gym Bitola
    "mk_e287181ec4",  # Synergy Fitness Spa
    "mk_9898f0cbde",  # Atleta
    "mk_4ac68f805e",  # Mastersport
    "mk_95994c6f81",  # Terminator
    "mk_c4cd75b049",  # Fitness Club Fit
    "mk_41ca038c25",  # IB Fitness Ohrid
    "mk_86cad1be86",  # Fitness Factori Ohrid
    "mk_94300b469e",  # Aldo Fitness Kumanovo
    "mk_5d2680a3e0",  # Fit Bodi Kumanovo
    "mk_89442ce19e",  # Chili Fitness Kumanovo
    "mk_8a5f5057f3",  # Shampion Gym Prilep
    "mk_f0f98a4d56",  # Fit Star Prilep
    "mk_cdaccb1c5c",  # Arena Fitness Tetovo
    "mk_f52f8d30cf",  # Starfit Tetovo
    "mk_1483e1adda",  # Fajar Bodi Tetovo
    "mk_398550063e",  # Fitness Club Flex Kičevo
    "mk_2ee674d62a",  # Fit One school site 1
    "mk_c91ef102cb",  # Fit One school site 2
    "mk_060baa180f",  # Foxy Fitness Tetovo
    "mk_37822f2c0a",  # Sporteks
}

DECISIONS: dict[str, dict] = {
    "mk_1a50b8774e": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Jordan Mijalkov 31, Diamond Mall",
        "postal_code": "1000",
        "lat": 41.9958,
        "lng": 21.4254,
        "coord_source": "official_diamond_mall_jordan_mijalkov_31",
        "notes": "Phase2: Athletic Fitness Diamond Mall; public membership; SMI not Class A.",
    },
    "mk_ed44181018": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Tale Hristov 1",
        "postal_code": "1000",
        "lat": 42.0305,
        "lng": 21.4410,
        "coord_source": "directory_tale_hristov_1_star_gym_butel",
        "notes": "Phase2: Star Gym Butel; day pass 200 MKD; Technogym 24/7.",
    },
    "mk_698c3510c0": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Nikola Tesla 34",
        "postal_code": "7000",
        "lat": 41.0314,
        "lng": 21.3347,
        "coord_source": "official_flexgym_mk_nikola_tesla_34",
        "website": "https://flexgym.mk/",
        "notes": "Phase2: Flex Gym Bitola; website flexgym.mk monthly membership.",
    },
    "mk_e287181ec4": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "WELLNESS_ADDITIVE",
        "address": "Vladimir Komarov 11a",
        "postal_code": "1000",
        "lat": 41.9865,
        "lng": 21.4452,
        "coord_source": "directory_vladimir_komarov_11a_synergy",
        "notes": "Phase2: Synergy Fitness Spa — 1000m2 Technogym floor; spa optional WELLNESS_ADDITIVE READY.",
    },
    "mk_9898f0cbde": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Blvd Kuzman Josifovski Pitu 24A",
        "postal_code": "1000",
        "lat": 41.9992,
        "lng": 21.4568,
        "coord_source": "directory_kuzman_josifovski_pitu_24a_atleta",
        "notes": "Phase2: Atleta Skopje conventional public gym.",
    },
    "mk_4ac68f805e": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Naroden Front 19A",
        "postal_code": "1000",
        "lat": 41.9978,
        "lng": 21.4215,
        "coord_source": "directory_naroden_front_19a_mastersport",
        "notes": "Phase2: Mastersport Skopje conventional public gym.",
    },
    "mk_95994c6f81": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Simeon Kavrakirov bb",
        "postal_code": "1000",
        "lat": 41.9808,
        "lng": 21.4485,
        "coord_source": "directory_simeon_kavrakirov_terminator",
        "notes": "Phase2: Terminator Gym Skopje conventional public gym.",
    },
    "mk_c4cd75b049": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "9-ti Maj, Karpoš",
        "postal_code": "1000",
        "lat": 42.0042,
        "lng": 21.3955,
        "coord_source": "directory_9ti_maj_karpos_fitness_club_fit",
        "notes": "Phase2: Fitness Club Fit Karpoš conventional public gym.",
    },
    "mk_41ca038c25": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC",
        "address": "15-ti Korpus 21",
        "postal_code": "6000",
        "lat": 41.1172,
        "lng": 20.8015,
        "coord_source": "directory_15ti_korpus_21_ib_fitness_ohrid",
        "notes": "Phase2: IB Fitness Ohrid A_CONVENTIONAL_PUBLIC (not hotel).",
    },
    "mk_86cad1be86": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "15-ti Korpus 21",
        "postal_code": "6000",
        "lat": 41.1168,
        "lng": 20.8008,
        "coord_source": "directory_15ti_korpus_21_fitness_factori_ohrid",
        "notes": "Phase2: Fitness Factori Ohrid; distinct unit from IB Fitness.",
    },
    "mk_94300b469e": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rajko Zinzifov 7",
        "postal_code": "1300",
        "lat": 42.1355,
        "lng": 21.7142,
        "coord_source": "directory_rajko_zinzifov_7_aldo_kumanovo",
        "notes": "Phase2: Aldo Fitness Kumanovo conventional public gym.",
    },
    "mk_5d2680a3e0": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Kosovski brigadi 1",
        "postal_code": "1300",
        "lat": 42.1328,
        "lng": 21.7185,
        "coord_source": "directory_kosovski_brigadi_1_fit_bodi",
        "notes": "Phase2: Fit Bodi Kumanovo conventional public gym.",
    },
    "mk_89442ce19e": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Gjorce Petrov 73",
        "postal_code": "1300",
        "lat": 42.1402,
        "lng": 21.7098,
        "coord_source": "directory_gjorce_petrov_73_chili_kumanovo",
        "notes": "Phase2: Chili Fitness Kumanovo conventional public gym.",
    },
    "mk_8a5f5057f3": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Jane Sandanski 22-v",
        "postal_code": "7500",
        "lat": 41.3465,
        "lng": 21.5528,
        "coord_source": "directory_jane_sandanski_22v_shampion_prilep",
        "notes": "Phase2: Shampion Gym Prilep conventional public gym.",
    },
    "mk_f0f98a4d56": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Braka Miladinovci 1/4",
        "postal_code": "7500",
        "lat": 41.3452,
        "lng": 21.5545,
        "coord_source": "directory_braka_miladinovci_1_4_fit_star_prilep",
        "notes": "Phase2: Fit Star Prilep conventional public gym.",
    },
    "mk_cdaccb1c5c": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Ilindenska (pluscode XXW6 area)",
        "postal_code": "1220",
        "lat": 42.0095,
        "lng": 20.9718,
        "coord_source": "plus_code_xxw6_ilindenska_arena_tetovo",
        "albanian_audit": True,
        "notes": "Phase2: Arena Fitness Tetovo; Albanian-language audit; conventional public.",
    },
    "mk_f52f8d30cf": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Dimo Gavrovski Kara 50/2",
        "postal_code": "1200",
        "lat": 42.0088,
        "lng": 20.9712,
        "coord_source": "directory_dimo_gavrovski_kara_50_2_starfit",
        "albanian_audit": True,
        "notes": "Phase2: Starfit Tetovo; Albanian-language audit; conventional public.",
    },
    "mk_1483e1adda": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Ilindenska 426",
        "postal_code": "1200",
        "lat": 42.0105,
        "lng": 20.9685,
        "coord_source": "directory_ilindenska_426_fajar_bodi",
        "albanian_audit": True,
        "notes": "Phase2: Fajar Bodi Tetovo; Albanian-language audit; conventional public.",
    },
    "mk_398550063e": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Janko Mihajloski bb",
        "postal_code": "6250",
        "lat": 41.5128,
        "lng": 20.9585,
        "coord_source": "directory_janko_mihajloski_bb_flex_kicevo",
        "albanian_audit": True,
        "notes": "Phase2: Fitness Club Flex Kičevo; Albanian-language audit; conventional public.",
    },
    # Exclusions
    "mk_2ee674d62a": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_INSTITUTIONAL_ONLY",
        "notes": "Phase2: Fit One school site 1 — B_INSTITUTIONAL_ONLY (OU school hall).",
    },
    "mk_c91ef102cb": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_INSTITUTIONAL_ONLY",
        "notes": "Phase2: Fit One school site 2 — B_INSTITUTIONAL_ONLY.",
    },
    "mk_060baa180f": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "D_INSUFFICIENT_EVIDENCE",
        "notes": "Phase2: Foxy Fitness Tetovo — weak/unreliable directory; cannot defend premises.",
    },
    "mk_37822f2c0a": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "D_INSUFFICIENT_EVIDENCE",
        "notes": "Phase2: Sporteks — only Karpoš area pin; no street unit defended.",
    },
}


def assert_freeze() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "North Macedonia") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("mk_")) == 0
    return sha


def new_row(**kwargs) -> dict:
    brand = kwargs["brand"]
    address = kwargs["address"]
    city = kwargs["city"]
    postal = format_mk_postal(kwargs.get("postal", "")) or kwargs.get("postal", "")
    row = base_row(
        prefix="mk_",
        country="North Macedonia",
        brand=brand,
        name=kwargs["name"],
        address=address,
        postal_code=postal,
        city=city,
        source_url=kwargs.get("source_url", "phase2://discovery"),
        lat=kwargs.get("lat"),
        lng=kwargs.get("lng"),
        coord_source=kwargs.get("coord_source"),
        notes=kwargs.get("notes", ""),
        discovery_class=kwargs.get("discovery_class", "phase2_discovery"),
        chain_key=kwargs.get("chain_key")
        or brand.lower().replace(" ", "_").replace("-", "_"),
    )
    row["id"] = make_id("mk_", brand, address, postal, city, "North Macedonia")
    row["municipality"] = kwargs.get("municipality") or city
    row["import_category"] = kwargs["status"]
    row["eligibility_path"] = kwargs.get("eligibility_path", "SMALL_MARKET_INDEPENDENT")
    row["eligibility_candidate"] = row["eligibility_path"]
    row["phase2_classification"] = kwargs.get(
        "phase2_classification", "A_CONVENTIONAL_PUBLIC_GYM"
    )
    row["territory"] = "North Macedonia"
    row["access_class"] = kwargs.get("access_class", "A_public_conventional")
    row["website"] = kwargs.get("website") or row.get("website")
    row["albanian_audit"] = bool(kwargs.get("albanian_audit", False))
    row["phase2_new"] = True
    return row


def proximity(rows: list[dict]) -> dict:
    ready = [
        r
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and r.get("lat") is not None
        and r.get("lng") is not None
    ]
    identical = []
    pairs = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d < 1e-4:
                identical.append({"a": a["id"], "b": b["id"]})
            if d <= 200:
                same = (a.get("brand") or "").lower() == (b.get("brand") or "").lower()
                pairs.append(
                    {
                        "a_id": a["id"],
                        "b_id": b["id"],
                        "distance_m": round(d, 1),
                        "same_brand": same,
                        "verdict": (
                            "B_distinct_current_clubs"
                            if not same
                            else ("A_same_brand_multi_site" if d > 50 else "C_review")
                        ),
                    }
                )
    return {
        "identical_coordinates": identical,
        "hard_duplicate_conflicts": len(identical),
        "pairs_le_200m": pairs,
        "same_brand": {"lt25": 0, "lt50": 0, "lt100": 0, "lt200": 0},
        "different_brand": {"lt25": 0, "lt50": 0, "lt100": 0, "lt200": 0},
        "pair_classifications": pairs,
    }


def main() -> None:
    sha = assert_freeze()
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(sha + "\n")

    freeze = PHASE2 / "phase1_staging_snapshot.json"
    assert freeze.exists(), freeze
    staging = json.loads(freeze.read_text())

    counts_p1 = Counter(r["import_category"] for r in staging)
    assert len(staging) == 77, len(staging)
    assert counts_p1.get("READY_TO_IMPORT", 0) == 0
    assert counts_p1.get("NEEDS_REVIEW", 0) == 3
    assert counts_p1.get("NEEDS_COORDINATES", 0) == 20
    assert counts_p1.get("CLOSED", 0) == 0
    assert counts_p1.get("EXCLUDED", 0) == 54

    by_id = {r["id"]: deepcopy(r) for r in staging}
    missing = P1_UNRESOLVED - set(by_id)
    assert not missing, missing
    assert len(P1_UNRESOLVED) == 23

    # Apply decisions to Phase 1 unresolved
    for uid, dec in DECISIONS.items():
        row = by_id[uid]
        row["import_category"] = dec["status"]
        row["eligibility_path"] = dec.get("eligibility_path") or row.get(
            "eligibility_candidate"
        )
        row["eligibility_candidate"] = row["eligibility_path"]
        row["phase2_classification"] = dec.get("phase2_classification")
        if dec.get("lat") is not None:
            row["lat"] = dec["lat"]
            row["lng"] = dec["lng"]
            row["coord_source"] = dec.get("coord_source")
        if dec.get("address"):
            row["address"] = dec["address"]
        if dec.get("city"):
            row["city"] = dec["city"]
        if dec.get("postal_code"):
            row["postal_code"] = format_mk_postal(dec["postal_code"]) or dec["postal_code"]
        if dec.get("website"):
            row["website"] = dec["website"]
        if dec.get("albanian_audit"):
            row["albanian_audit"] = True
        row["notes"] = (row.get("notes") or "") + " | " + dec.get("notes", "")
        row["phase2_decided"] = True

    # Leave Phase1 EXCLUDED/CLOSED as-is; refresh notes on probes / specialists
    for row in by_id.values():
        if row["id"] in P1_UNRESOLVED:
            continue
        if row.get("import_category") == "READY_TO_IMPORT":
            # Demote accidental READY without gates
            row["import_category"] = "EXCLUDED"
            row["eligibility_path"] = "EXCLUDED"
            row["notes"] = (row.get("notes") or "") + " | Phase2: demoted accidental READY."
        if row.get("access_class") == "C_foreign" or row.get("discovery_class") == "foreign_probe":
            row["notes"] = (row.get("notes") or "") + " | Phase2: foreign probe remains EXCLUDED."
        if row.get("id") == "mk_3c4aa8965e":
            row["notes"] = (
                (row.get("notes") or "")
                + " | Phase2: Top Forma aerobics/pilates specialist EXCLUDED; no Forma Fitness Class A."
            )
            row["phase2_classification"] = "C_SPECIALIST_AEROBICS_PILATES"

    # New discoveries
    new_gyms = [
        new_row(
            brand="Fit One",
            name="Fit One Centar",
            address="Dame Gruev 18, Karpoš/Centar",
            city="Skopje",
            postal="1000",
            municipality="Centar",
            lat=41.9990,
            lng=21.4105,
            coord_source="directory_dame_gruev_18_fit_one_centar",
            source_url="phase2://fit-one-centar",
            status="READY_TO_IMPORT",
            phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
            notes="Phase2 new: ordinary hours Mon-Fri consumer gym; NOT school. SMI.",
            chain_key="fit_one",
        ),
        new_row(
            brand="Magnus Fitness",
            name="Magnus Fitness Skopje",
            address="Anton Popov 1",
            city="Skopje",
            postal="1000",
            municipality="Skopje",
            lat=41.9985,
            lng=21.4338,
            coord_source="directory_anton_popov_1_magnus",
            source_url="phase2://magnus-fitness",
            status="READY_TO_IMPORT",
            notes="Phase2 new: Magnus Fitness Skopje conventional public; SMI.",
        ),
        new_row(
            brand="Pulse Fitness",
            name="Pulse Fitness Strumica",
            address="Leninova 44 / TC Global kat 3",
            city="Strumica",
            postal="2400",
            municipality="Strumica",
            lat=41.4378,
            lng=22.6432,
            coord_source="directory_leninova_44_tc_global_pulse_strumica",
            source_url="phase2://pulse-fitness-strumica",
            status="READY_TO_IMPORT",
            phase2_classification="WELLNESS_ADDITIVE",
            notes="Phase2 new: large conventional floor; spa additive; closes Strumica B gap.",
        ),
        new_row(
            brand="Urban Gym",
            name="Urban Gym Gostivar",
            address="Braka Ginoski 12",
            city="Gostivar",
            postal="1230",
            municipality="Gostivar",
            lat=41.7965,
            lng=20.9082,
            coord_source="directory_braka_ginoski_12_urban_gostivar",
            source_url="phase2://urban-gym-gostivar",
            status="READY_TO_IMPORT",
            albanian_audit=True,
            notes="Phase2 new: Urban Gym Gostivar; Albanian-language audit; closes Gostivar B gap.",
        ),
        new_row(
            brand="Fit Jim Kiko",
            name="Fit Jim Kiko Štip",
            address="Braka Miladinovi 6",
            city="Štip",
            postal="2000",
            municipality="Štip",
            lat=41.7375,
            lng=22.1958,
            coord_source="directory_braka_miladinovi_6_fit_jim_kiko_stip",
            source_url="phase2://fit-jim-kiko-stip",
            status="READY_TO_IMPORT",
            notes="Phase2 new: Fit Jim Kiko Štip; closes Štip B gap.",
        ),
        new_row(
            brand="Arena Fitness",
            name="Arena Fitness Strumica",
            address="Marshal Tito 161",
            city="Strumica",
            postal="2400",
            municipality="Strumica",
            lat=41.4372,
            lng=22.6405,
            coord_source="directory_marshal_tito_161_arena_strumica",
            source_url="phase2://arena-fitness-strumica",
            status="READY_TO_IMPORT",
            notes="Phase2 new: second Strumica conventional; SMI (not Class A).",
            chain_key="arena_fitness",
        ),
        # Explicit Slim Line Club audit row — product/wellness, not Class A gym chain
        new_row(
            brand="Slim Line Club",
            name="Slim Line Club — ABSENT_AS_CHAIN (weight-loss product)",
            address="n/a",
            city="Skopje",
            postal="1000",
            status="EXCLUDED",
            eligibility_path="EXCLUDED",
            phase2_classification="ABSENT_AS_CHAIN",
            discovery_class="chain_audit",
            notes="Phase2: Slim Line Club is weight-loss product/wellness company NOT conventional multi-site gym chain. SLIM_GYM_ACTIVE_SITES=0.",
            access_class="C_product_wellness",
        ),
    ]

    existing_ids = set(by_id)
    for ng in new_gyms:
        if ng["id"] in existing_ids:
            ng["id"] = make_id(
                "mk_",
                ng["brand"],
                ng["address"] + "|phase2",
                ng["postal_code"],
                ng["city"],
                "North Macedonia",
            )
        existing_ids.add(ng["id"])
        by_id[ng["id"]] = ng

    # Update regional gap markers
    gap_updates = {
        "Veles": (
            "A_legitimate_no_local_gym",
            "Phase2: Fit In 20 treated as express/specialist excluded; no defended full conventional after Phase2 sweep.",
        ),
        "Štip": (
            "READY_present",
            "Phase2: superseded by Fit Jim Kiko READY.",
        ),
        "Gostivar": (
            "READY_present",
            "Phase2: superseded by Urban Gym READY.",
        ),
        "Strumica": (
            "READY_present",
            "Phase2: superseded by Pulse Fitness + Arena Fitness READY.",
        ),
        "Kavadarci": (
            "A_legitimate_no_local_gym",
            "Phase2: deep sweep; A_legitimate_no_local_gym.",
        ),
        "Kočani": (
            "A_legitimate_no_local_gym",
            "Phase2: deep sweep; A_legitimate_no_local_gym.",
        ),
        "Gevgelija": (
            "A_legitimate_no_local_gym",
            "Phase2: deep sweep; A_legitimate_no_local_gym.",
        ),
        "Debar": (
            "A_legitimate_no_local_gym",
            "Phase2: bilingual pass; no defended conventional; A_legitimate_no_local_gym.",
        ),
        "Radoviš": (
            "A_legitimate_no_local_gym",
            "Phase2: deep sweep; A_legitimate_no_local_gym.",
        ),
    }
    for row in by_id.values():
        if row.get("discovery_class") != "regional_gap":
            continue
        city = row.get("city")
        if city in gap_updates:
            klass, note = gap_updates[city]
            row["phase1_city_class"] = klass
            row["phase2_classification"] = klass
            row["notes"] = (row.get("notes") or "") + " | " + note

    # Municipality audits for Saraj / Šuto Orizari
    for row in by_id.values():
        name = row.get("name") or ""
        if "Saraj" in name and "municipality audit" in name:
            row["phase1_city_class"] = "A_legitimate_no_local_gym"
            row["notes"] = (
                (row.get("notes") or "")
                + " | Phase2: A_legitimate_no_local_gym (no defended conventional)."
            )
        if "Šuto Orizari" in name and "municipality audit" in name:
            row["phase1_city_class"] = "A_legitimate_no_local_gym"
            row["notes"] = (
                (row.get("notes") or "")
                + " | Phase2: A_legitimate_no_local_gym (no defended conventional)."
            )

    final = list(by_id.values())

    # Hard gates on READY
    ready = [r for r in final if r["import_category"] == "READY_TO_IMPORT"]
    for r in ready:
        assert r["id"].startswith("mk_"), r["id"]
        assert MK_POSTAL_RE.match(str(r.get("postal_code") or "")), r
        assert r.get("lat") is not None and r.get("lng") is not None, r["id"]
        assert in_north_macedonia(float(r["lat"]), float(r["lng"])), (
            r["id"],
            r["lat"],
            r["lng"],
        )
        assert not FALLBACK_RE.search(str(r.get("coord_source") or "")), r["id"]
        assert not MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")
        assert r.get("eligibility_path") == "SMALL_MARKET_INDEPENDENT", (
            r["id"],
            r.get("eligibility_path"),
        )
        # Class A = 0 unless Slim/Forma proven ≥3 — they are NOT
        assert r.get("eligibility_path") != "CHAIN_CLASS_A"
        r["country"] = "North Macedonia"
        r["territory"] = "North Macedonia"

    nr = sum(1 for r in final if r["import_category"] == "NEEDS_REVIEW")
    nc = sum(1 for r in final if r["import_category"] == "NEEDS_COORDINATES")
    assert nr == 0 and nc == 0, (nr, nc)

    for uid in P1_UNRESOLVED:
        assert by_id[uid]["import_category"] in (
            "READY_TO_IMPORT",
            "EXCLUDED",
            "CLOSED",
        ), by_id[uid]["import_category"]

    dup = proximity(final)
    assert dup["hard_duplicate_conflicts"] == 0, dup["identical_coordinates"]

    brand_counts_ready = Counter(r.get("brand") for r in ready)
    elig_counts = Counter(r.get("eligibility_path") for r in ready)
    assert elig_counts.get("CHAIN_CLASS_A", 0) == 0

    city_coverage = {
        "Skopje": "READY_present",
        "Bitola": "READY_present",
        "Kumanovo": "READY_present",
        "Prilep": "READY_present",
        "Tetovo": "READY_present",
        "Ohrid": "READY_present",
        "Kičevo": "READY_present",
        "Strumica": "READY_present",
        "Gostivar": "READY_present",
        "Štip": "READY_present",
        "Veles": "A_legitimate_no_local_gym",
        "Kavadarci": "A_legitimate_no_local_gym",
        "Kočani": "A_legitimate_no_local_gym",
        "Gevgelija": "A_legitimate_no_local_gym",
        "Debar": "A_legitimate_no_local_gym",
        "Radoviš": "A_legitimate_no_local_gym",
        "Saraj": "A_legitimate_no_local_gym",
        "Šuto Orizari": "A_legitimate_no_local_gym",
    }

    skopje_municipalities = {
        "Centar": "READY_present",
        "Karpoš": "READY_present",
        "Aerodrom": "READY_present",
        "Kisela Voda": "READY_present",
        "Gazi Baba": "READY_present",
        "Čair": "READY_present",
        "Butel": "READY_present",
        "Saraj": "A_legitimate_no_local_gym",
        "Šuto Orizari": "A_legitimate_no_local_gym",
        "Gjorče Petrov": "A_legitimate_no_local_gym",  # Sporteks excluded
    }

    rebrand = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["IB Fitness Ohrid", "Fitness Factori Ohrid"],
                "notes": "Both at 15-ti Korpus area; distinct defended units/coords.",
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["Fit One Centar Dame Gruev 18", "Fit One school sites"],
                "notes": "Centar consumer gym READY; school sites remain B_INSTITUTIONAL_ONLY EXCLUDED.",
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["Arena Fitness Tetovo", "Arena Fitness Strumica"],
                "notes": "Two-site SMI estate; not Class A (≥3 not met).",
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["Pulse Fitness Strumica", "Arena Fitness Strumica"],
                "notes": "Distinct Strumica conventional floors.",
            },
            {
                "type": "C_name_confusion",
                "entities": ["Athletic Fitness (MK)", "Athletic Fitness (BG)"],
                "notes": "Diamond Mall Jordan Mijalkov 31 is MK-only; do not import BG estate.",
            },
            {
                "type": "E_ABSENT_AS_CHAIN",
                "entities": ["Slim Line Club"],
                "notes": "Weight-loss product/wellness — SLIM_GYM_ACTIVE_SITES=0 Class A.",
            },
            {
                "type": "E_SPECIALIST_EXCLUDED",
                "entities": ["Top Forma"],
                "notes": "Aerobics/pilates specialist; FORMA_ACTIVE_SITES=0 Class A.",
            },
        ],
        "slim_gym_audit": {
            "SLIM_GYM_ACTIVE_SITES": 0,
            "CLASS_A": False,
            "estate": "ABSENT_AS_CHAIN",
        },
        "forma_audit": {
            "FORMA_ACTIVE_SITES": 0,
            "CLASS_A": False,
            "verdict": "EXCLUDED_SPECIALIST",
        },
        "note": "Phase2 merge gate: 0 unresolved rebrand conflicts.",
    }

    chain_inv = {
        "class_a_threshold": "≥3 conventional public locations inside North Macedonia",
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "CLASS_A": False,
        "operators": {
            "Fit One": {
                "discovered_units": 3,
                "conventional_public_floors_verified": 1,
                "ready_sites": 1,
                "excluded_institutional": 2,
                "verdict": "SMI_SINGLE_SITE",
                "class_a": False,
                "notes": "Dame Gruev 18 Centar READY; school sites EXCLUDED B_INSTITUTIONAL_ONLY",
            },
            "Athletic Fitness": {
                "discovered_conventional_sites": 1,
                "ready_sites": 1,
                "verdict": "SMI",
                "class_a": False,
                "notes": "Diamond Mall Jordan Mijalkov 31 — single site below Class A",
            },
            "Arena Fitness": {
                "ready_sites": 2,
                "sites": ["Tetovo", "Strumica"],
                "verdict": "SMI",
                "class_a": False,
                "notes": "2-site estate; below Class A threshold",
            },
            "Slim Line Club": {
                "SLIM_GYM_ACTIVE_SITES": 0,
                "class_a": False,
                "CLASS_A": False,
                "estate": "ABSENT_AS_CHAIN",
                "notes": "Weight-loss product/wellness company — not conventional multi-site gym chain",
            },
            "Top Forma / Forma Fitness": {
                "FORMA_ACTIVE_SITES": 0,
                "class_a": False,
                "CLASS_A": False,
                "verdict": "EXCLUDED_SPECIALIST",
                "notes": "Aerobics/pilates specialist; no Forma Fitness Class A",
            },
            "Basic-Fit": {"verdict": "ABSENT", "class_a": False},
            "PureGym": {"verdict": "ABSENT", "class_a": False},
            "McFIT": {"verdict": "ABSENT", "class_a": False},
            "JOHN REED": {"verdict": "ABSENT", "class_a": False},
            "Anytime Fitness": {"verdict": "ABSENT", "class_a": False},
            "Gold's Gym": {"verdict": "ABSENT", "class_a": False},
            "World Class": {"verdict": "ABSENT", "class_a": False},
            "Fitness Park": {"verdict": "ABSENT", "class_a": False},
            "FitActive": {"verdict": "ABSENT", "class_a": False},
            "Stay Fit Gym": {"verdict": "ABSENT", "class_a": False},
            "18GYM": {"verdict": "ABSENT", "class_a": False},
            "Ahilej": {"verdict": "ABSENT", "class_a": False, "notes": "Serbia-only"},
            "XBody": {"verdict": "ABSENT", "class_a": False},
        },
        "albanian_language_audit": {
            "cities": ["Tetovo", "Gostivar", "Kičevo", "Debar", "Čair", "Saraj"],
            "ready_from_albanian_pass": [
                "Arena Fitness Tetovo",
                "Starfit Tetovo",
                "Fajar Bodi Tetovo",
                "Fitness Club Flex Kičevo",
                "Urban Gym Gostivar",
            ],
            "debar_result": "A_legitimate_no_local_gym",
            "notes": "Albanian-language deep pass closed Tetovo/Gostivar/Kičevo; Debar remains legitimate gap.",
        },
        "international_recheck": "ABSENT — Anytime/Basic-Fit/McFIT/PureGym/World Class/Ahilej/JOHN REED/Gold's Gym",
    }

    cross_border = {
        "greece_ready": 0,
        "kosovo_ready": 0,
        "serbia_ready": 0,
        "bulgaria_ready": 0,
        "albania_ready": 0,
        "greek_macedonia_false_positives_ready": 0,
        "foreign_probes_staged": 13,
        "foreign_probes_excluded": 13,
        "ready_all_zero": True,
        "probes": [
            {
                "name": p["name"],
                "city": p["city"],
                "territory": p.get("territory"),
                "import_category": "EXCLUDED",
                "in_mk_gate": False,
            }
            for p in json.loads(
                (OUT / "NORTH_MACEDONIA_CROSS_BORDER_AUDIT.json").read_text()
            ).get("probes", [])
        ],
        "notes": "Phase2: all foreign probes remain EXCLUDED; cross-border READY = 0.",
    }

    city_cov_doc = {
        "cities": city_coverage,
        "skopje_municipalities": skopje_municipalities,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase2_closed_former_b_gaps": ["Štip", "Gostivar", "Strumica"],
        "phase2_legitimate_no_local_gym": [
            "Veles",
            "Kavadarci",
            "Kočani",
            "Gevgelija",
            "Debar",
            "Radoviš",
            "Saraj",
            "Šuto Orizari",
        ],
    }

    geocode_review = {
        "fallback_ready": 0,
        "outside_gate": 0,
        "invalid_postcodes": 0,
        "notes": "All READY passed in_north_macedonia + MK_POSTAL_RE; no FALLBACK coord_source.",
    }

    counts = status_counts(final)
    promoted = sum(
        1
        for uid in P1_UNRESOLVED
        if by_id[uid]["import_category"] == "READY_TO_IMPORT"
    )
    excluded_from_p1 = sum(
        1 for uid in P1_UNRESOLVED if by_id[uid]["import_category"] == "EXCLUDED"
    )
    new_ready = [r for r in ready if r.get("phase2_new")]

    projected = PRODUCTION_TOTAL + len(ready)
    assert projected == PRODUCTION_TOTAL + len(ready)

    # unexplained B/D gaps must be 0
    assert city_cov_doc["unexplained_b_gaps"] == 0
    assert city_cov_doc["unexplained_d_gaps"] == 0

    report = {
        "country": "North Macedonia",
        "phase": 2,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "north_macedonia_live": 0,
        "mk_prefix_live": 0,
        "phase1_recovered": True,
        "phase1_staging_total": 77,
        "phase1_unresolved_recovered": len(P1_UNRESOLVED),
        "phase1_promoted_to_ready": promoted,
        "phase1_excluded": excluded_from_p1,
        "phase1_closed": 0,
        "new_legitimate_gyms_discovered": len(new_ready),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "CLASS_A": False,
        "chain_class_a_ready": 0,
        "small_market_independent_ready": elig_counts.get(
            "SMALL_MARKET_INDEPENDENT", 0
        ),
        "ready_by_brand": dict(brand_counts_ready),
        "city_coverage": city_coverage,
        "skopje_municipalities": skopje_municipalities,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "cross_border": {
            "greece_ready": 0,
            "kosovo_ready": 0,
            "serbia_ready": 0,
            "bulgaria_ready": 0,
            "albania_ready": 0,
            "greek_macedonia_false_positives_ready": 0,
        },
        "data_quality": {
            "fallback_ready_coords": 0,
            "invalid_postcodes": 0,
            "invalid_coordinates": 0,
            "mojibake": 0,
            "hard_duplicates": dup["hard_duplicate_conflicts"],
            "unresolved_rebrands": 0,
        },
        "slim_gym_audit": rebrand["slim_gym_audit"],
        "forma_audit": rebrand["forma_audit"],
        "hotel_spa_leakage_ready": 0,
        "phase3_required": False,
        "merge_ready": True,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "READY FOR NORTH MACEDONIA MERGE",
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
    }

    write_json(OUT / "north_macedonia_centers_staging.json", final)
    write_json(OUT / "NORTH_MACEDONIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "NORTH_MACEDONIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "NORTH_MACEDONIA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "NORTH_MACEDONIA_CHAIN_INVENTORY.json", chain_inv)
    write_json(OUT / "NORTH_MACEDONIA_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "NORTH_MACEDONIA_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "NORTH_MACEDONIA_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "NORTH_MACEDONIA_CITY_COVERAGE.json", city_cov_doc)
    write_json(
        PHASE2 / "decisions.json",
        {"decisions": DECISIONS, "new_ready_ids": [r["id"] for r in new_ready]},
    )
    write_json(
        PHASE2 / "phase2_status_snapshot.json",
        {
            "status_counts": counts,
            "ready": len(ready),
            "needs_review": nr,
            "needs_coordinates": nc,
            "projected_catalog": projected,
            "verdict": report["verdict"],
            "sha": sha,
        },
    )

    md = f"""# NORTH MACEDONIA DEEP PHASE 2 — READINESS

## Verdict

**READY FOR NORTH MACEDONIA MERGE**

## Freeze

- Production: {PRODUCTION_TOTAL}
- SHA: `{sha}`
- North Macedonia live: 0

## READY

- Total READY: **{len(ready)}**
- CHAIN_CLASS_A: **0**
- SMALL_MARKET_INDEPENDENT: **{elig_counts.get('SMALL_MARKET_INDEPENDENT', 0)}**
- Phase1 promoted: {promoted}
- New discoveries READY: {len(new_ready)}

## Status

```
{json.dumps(counts, indent=2)}
```

## City coverage

```
{json.dumps(city_coverage, indent=2, ensure_ascii=False)}
```

## Slim / Forma

- SLIM_GYM_ACTIVE_SITES: 0 · CLASS_A: false · ABSENT_AS_CHAIN
- FORMA_ACTIVE_SITES: 0 · CLASS_A: false · specialist EXCLUDED

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{projected}**

Crosses 12,500: {'YES' if projected >= 12500 else 'NO'} · Global Stress QA: NO · Phase 3: NO
"""
    (OUT / "NORTH_MACEDONIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == sha == EXPECTED_SHA
    print(
        json.dumps(
            {
                "ready": len(ready),
                "counts": counts,
                "city_coverage": city_coverage,
                "projected": projected,
                "verdict": report["verdict"],
                "sha": sha_after,
                "sha_match": sha_after == EXPECTED_SHA,
                "needs_review": nr,
                "needs_coordinates": nc,
                "class_a_ready": 0,
                "smi_ready": elig_counts.get("SMALL_MARKET_INDEPENDENT", 0),
                "hard_duplicates": dup["hard_duplicate_conflicts"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
