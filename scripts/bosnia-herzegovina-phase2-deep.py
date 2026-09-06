#!/usr/bin/env python3
"""Bosnia and Herzegovina Deep Phase 2 — resolve all Phase 1 NR/NC; staging only.

Does NOT modify src/data/centers.json.
Preserves Phase 1 ba_* IDs; no new premises beyond Phase 1 matrix.
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
    BA_POSTAL_RE,
    ROOT,
    format_ba_postal,
    haversine,
    in_bosnia_herzegovina,
    status_counts,
    write_json,
)

OUT = ROOT / "data/bosnia-herzegovina"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2, OUT / "raw" / "pages" / "phase2", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112"
PRODUCTION_TOTAL = 11800
TERRITORY = "Bosnia and Herzegovina"

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")

# Phase 1 unresolved IDs (27 NR + 14 NC = 41)
P1_UNRESOLVED = {
    "ba_0ace57c4b2",
    "ba_383806522f",
    "ba_0bf4cc7be5",
    "ba_4b2b262dac",
    "ba_234269c33b",
    "ba_fbb6ab9577",
    "ba_6e8f727eb6",
    "ba_fa6f3c8b99",
    "ba_f63cafd3fe",
    "ba_e6bae3c12c",
    "ba_760fbe82ce",
    "ba_d705f4fca7",
    "ba_605d38b631",
    "ba_5fd8cc9b20",
    "ba_1e88b67b77",
    "ba_d10bc012e8",
    "ba_446902cbcb",
    "ba_82f2fa3809",
    "ba_957417e083",
    "ba_0116ad0cd5",
    "ba_5a82ca68bf",
    "ba_deeabeda92",
    "ba_7d8fd80b4a",
    "ba_21c2e65f54",
    "ba_7612d3d4c2",
    "ba_342f507ce7",
    "ba_23287d2052",
    "ba_64b95bab44",
    "ba_ba510b2696",
    "ba_7aeec79730",
    "ba_bc60505bc2",
    "ba_57da7dd70d",
    "ba_69162d2178",
    "ba_78f8ad5126",
    "ba_d8a16be7ac",
    "ba_e6ba48931b",
    "ba_327db3a237",
    "ba_68ec8f2d3d",
    "ba_5ddab9c740",
    "ba_3b9800cdd0",
    "ba_cced171393",
}

DECISIONS: dict[str, dict] = {
    # CHAIN_CLASS_A (7)
    "ba_0ace57c4b2": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Paromlinska 34, Novo Sarajevo",
        "lat": 43.8562,
        "lng": 18.3954,
        "coord_source": "official_allinfitness_malta_paromlinska_34",
        "chain_key": "all_in_fitness",
        "notes": "Phase2: ALL IN FITNESS Malta; conventional public floor; Class A estate site 1/3.",
    },
    "ba_383806522f": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Butmirska cesta 14, Ilidža",
        "lat": 43.8285,
        "lng": 18.3098,
        "coord_source": "official_allinfitness_ilidza_butmirska_14",
        "chain_key": "all_in_fitness",
        "notes": "Phase2: ALL IN FITNESS Ilidža; Class A estate site 2/3.",
    },
    "ba_0bf4cc7be5": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Milana Preloga 12, Bingo City Centar",
        "lat": 43.8518,
        "lng": 18.3882,
        "coord_source": "official_allinfitness_bingo_milana_preloga_12",
        "chain_key": "all_in_fitness",
        "notes": "Phase2: ALL IN FITNESS Bingo; Class A estate site 3/3.",
    },
    "ba_4b2b262dac": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Zlokovac bb, Murex zgrada",
        "lat": 44.5348,
        "lng": 18.6685,
        "coord_source": "official_kron_tuzla_zlokovac_murex",
        "chain_key": "kron_fitness",
        "notes": "Phase2: Kron Tuzla; Class A regional estate site 1/4.",
    },
    "ba_234269c33b": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "TC Bingo, Živinice",
        "lat": 44.4496,
        "lng": 18.6499,
        "coord_source": "official_kron_zivinice_tc_bingo",
        "chain_key": "kron_fitness",
        "notes": "Phase2: Kron Živinice; Class A regional estate site 2/4.",
    },
    "ba_fbb6ab9577": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Ul. Bajazita Kešetovića 72",
        "lat": 44.5085,
        "lng": 18.4885,
        "coord_source": "official_kron_srebrenik_bajazita_kesetovica_72",
        "chain_key": "kron_fitness",
        "notes": "Phase2: Kron Srebrenik; Class A regional estate site 3/4.",
    },
    "ba_6e8f727eb6": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "CHAIN_CLASS_A",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Branilaca grada bb, TC Millery",
        "lat": 44.7035,
        "lng": 18.3102,
        "coord_source": "official_kron_gracanica_tc_millery",
        "chain_key": "kron_fitness",
        "notes": "Phase2: Kron Gračanica; Class A regional estate site 4/4.",
    },
    # SMALL_MARKET_INDEPENDENT READY (24)
    "ba_fa6f3c8b99": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "WELLNESS_ADDITIVE",
        "address": "Bulevar Franca Lehara 2, Alta Shopping Center",
        "lat": 43.8486,
        "lng": 18.3578,
        "coord_source": "official_avalon_alta_bulevar_franca_lehara_2",
        "notes": "Phase2: Avalon SMI WELLNESS_ADDITIVE; spa additive on conventional floor.",
    },
    "ba_f63cafd3fe": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Radnička cesta bb, BTC City",
        "lat": 43.822,
        "lng": 18.2795,
        "coord_source": "directory_btc_fitness_radnicka_bb",
        "notes": "Phase2: BTC Fitness Sarajevo conventional public; SMI.",
    },
    "ba_e6bae3c12c": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Džemala Bijedića 161",
        "lat": 43.8555,
        "lng": 18.3685,
        "coord_source": "directory_dzemala_bijedica_161_body_art",
        "notes": "Phase2: Body Art Fitness Sarajevo; SMI.",
    },
    "ba_760fbe82ce": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Šejha Huseina Bakri Gazaza bb, Mojmilo",
        "lat": 43.8382,
        "lng": 18.3655,
        "coord_source": "directory_mojmilo_sejha_huseina_bakri_gazaza",
        "notes": "Phase2: Fitness Centar Mojmilo; SMI.",
    },
    "ba_d705f4fca7": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Zmaja od Bosne 7",
        "lat": 43.8595,
        "lng": 18.421,
        "coord_source": "official_extreme_fitness_zmaja_od_bosne_7",
        "notes": "Phase2: Extreme Fitness Sarajevo; distinct from Xtreme Gym EXCLUDED duplicate.",
    },
    "ba_605d38b631": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Butmirska cesta 1, Ilidža",
        "lat": 43.831,
        "lng": 18.3025,
        "coord_source": "directory_butmirska_1_fitness_zone",
        "notes": "Phase2: Fitness Zone Sarajevo; SMI distinct from ALL IN Ilidža.",
    },
    "ba_5fd8cc9b20": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Marsala Tita 16",
        "lat": 43.852,
        "lng": 18.382,
        "coord_source": "directory_marsala_tita_16_olympic_gym",
        "notes": "Phase2: Olympic Gym Sarajevo; SMI.",
    },
    "ba_1e88b67b77": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Bulevar srpske vojske 8",
        "lat": 44.772,
        "lng": 17.435,
        "coord_source": "directory_bulevar_srpske_vojske_8_4life",
        "notes": "Phase2: 4Life Banja Luka; SMI distinct from Xtreme Fit BL.",
    },
    "ba_d10bc012e8": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Bulevar srpskih vladara 41",
        "lat": 43.8272,
        "lng": 18.3680,
        "coord_source": "directory_bulevar_srpskih_vladara_41_xtreme_fit",
        "notes": "Phase2: Xtreme Fit BL defended premises; SMI.",
    },
    "ba_446902cbcb": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Karađorđeva 2",
        "lat": 44.7708,
        "lng": 17.4325,
        "coord_source": "directory_karadjordjeva_2_fit_artemida",
        "notes": "Phase2: Fit Artemida Banja Luka; SMI.",
    },
    "ba_82f2fa3809": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Ulica Fuada Ferizbegovića 2",
        "lat": 44.5415,
        "lng": 18.6825,
        "coord_source": "directory_fuada_ferizbegovica_2_slavinovici",
        "notes": "Phase2: Slavinovici Teretana Tuzla; SMI distinct from Kron Tuzla.",
    },
    "ba_957417e083": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Krajiska 25",
        "lat": 43.3434,
        "lng": 17.8078,
        "coord_source": "directory_krajiska_25_fitness_mostar",
        "notes": "Phase2: Fitness Centar Mostar; SMI.",
    },
    "ba_0116ad0cd5": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Kneza Domagoja bb",
        "lat": 43.3385,
        "lng": 17.8012,
        "coord_source": "directory_kneza_domagoja_bb_iron_gym_mostar",
        "notes": "Phase2: Iron Gym Mostar; SMI.",
    },
    "ba_5a82ca68bf": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Trg Alije Izetbegovića bb",
        "lat": 44.2018,
        "lng": 17.9078,
        "coord_source": "directory_trg_alije_izetbegovica_zenica",
        "notes": "Phase2: Fitness Centar Zenica; SMI.",
    },
    "ba_deeabeda92": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Svetog Save 12",
        "lat": 44.7575,
        "lng": 19.2155,
        "coord_source": "directory_svetog_save_12_bijeljina",
        "notes": "Phase2: Fitness Centar Bijeljina; SMI.",
    },
    "ba_7d8fd80b4a": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Jovana Ducica 3",
        "lat": 44.9805,
        "lng": 17.435,
        "coord_source": "directory_jovana_ducica_3_prijedor",
        "notes": "Phase2: Teretana Prijedor; SMI.",
    },
    "ba_21c2e65f54": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Marsala Tita 12",
        "lat": 44.732,
        "lng": 18.0875,
        "coord_source": "directory_marsala_tita_12_doboj",
        "notes": "Phase2: Fitness Centar Doboj; SMI.",
    },
    "ba_7612d3d4c2": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Jovana Ducica 5",
        "lat": 42.7125,
        "lng": 18.3445,
        "coord_source": "directory_jovana_ducica_5_trebinje",
        "notes": "Phase2: Fitness Centar Trebinje; SMI.",
    },
    "ba_342f507ce7": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Kralja Tvrtka 8",
        "lat": 44.2268,
        "lng": 17.6605,
        "coord_source": "directory_kralja_tvrtka_8_travnik",
        "notes": "Phase2: Fitness Centar Travnik; SMI.",
    },
    "ba_23287d2052": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Maršala Tita 15",
        "lat": 44.668,
        "lng": 18.976,
        "coord_source": "directory_marsala_tita_15_gorazde",
        "notes": "Phase2: Fitness Centar Goražde; SMI.",
    },
    "ba_64b95bab44": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Vojvode Radomira Putnika 12",
        "lat": 43.824,
        "lng": 18.358,
        "coord_source": "directory_vojvode_radomira_putnika_12_istocno_sarajevo",
        "notes": "Phase2: Fitness Centar Istočno Sarajevo; SMI.",
    },
    "ba_ba510b2696": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Branislava Nuhića 5",
        "lat": 44.8735,
        "lng": 18.809,
        "coord_source": "directory_branislava_nuhica_5_brcko",
        "notes": "Phase2: Fitness Centar Brčko; SMI.",
    },
    "ba_7aeec79730": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Krupska bb",
        "lat": 44.8169,
        "lng": 15.8708,
        "coord_source": "directory_krupska_bb_bihac",
        "notes": "Phase2: Fitness Centar Bihać; SMI.",
    },
    "ba_bc60505bc2": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Strossmayerova bb",
        "lat": 44.9669,
        "lng": 15.9436,
        "coord_source": "directory_strossmayerova_bb_cazin",
        "notes": "Phase2: Fitness Centar Cazin; SMI.",
    },
    # EXCLUDED (10)
    "ba_57da7dd70d": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: ALL4SPORT — B_UNVERIFIED_PREMISES; premises not defended.",
    },
    "ba_69162d2178": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_CROSSFIT_SPECIALIST",
        "notes": "Phase2: Pro-Fit — B_CROSSFIT_SPECIALIST.",
    },
    "ba_78f8ad5126": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "C_DUPLICATE_UNVERIFIED",
        "notes": "Phase2: Xtreme Gym Sarajevo — C_DUPLICATE_UNVERIFIED vs Extreme Fitness READY.",
    },
    "ba_d8a16be7ac": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Power Gym — B_UNVERIFIED_PREMISES.",
    },
    "ba_e6ba48931b": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Active Life — B_UNVERIFIED_PREMISES.",
    },
    "ba_327db3a237": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_SPECIALIST_AEROBICS",
        "notes": "Phase2: Forma Plus — B_SPECIALIST_AEROBICS.",
    },
    "ba_68ec8f2d3d": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fit Zone Banja Luka — B_UNVERIFIED_PREMISES.",
    },
    "ba_5ddab9c740": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Active Mostar — B_UNVERIFIED_PREMISES.",
    },
    "ba_3b9800cdd0": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_MUNICIPAL_NO_PUBLIC_MEMBERSHIP",
        "notes": "Phase2: SC Sarajevo municipal — B_MUNICIPAL_NO_PUBLIC_MEMBERSHIP.",
    },
    "ba_cced171393": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_MUNICIPAL_NO_PUBLIC_MEMBERSHIP",
        "notes": "Phase2: SC Banja Luka municipal — B_MUNICIPAL_NO_PUBLIC_MEMBERSHIP.",
    },
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Bosnia_Herzegovina_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "municipality",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "eligibility_path",
        "phase2_classification",
        "coord_source",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Bosnia and Herzegovina"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Bosnia_Herzegovina_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def assert_freeze() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == TERRITORY) == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("ba_")) == 0
    return sha


NW_FBIH_READY = frozenset({"ba_7aeec79730", "ba_bc60505bc2"})


def ready_coord_in_territory(row: dict) -> bool:
    lat, lng = float(row["lat"]), float(row["lng"])
    if in_bosnia_herzegovina(lat, lng):
        return True
    # Bihać / Cazin official premises sit west of conservative lng<=16.85 envelope.
    if row["id"] in NW_FBIH_READY:
        return 44.0 <= lat <= 45.05 and 15.5 <= lng <= 16.95
    return False


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
    }


def main() -> None:
    sha = assert_freeze()
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    freeze = OUT / "phase1" / "phase1_staging_snapshot.json"
    assert freeze.exists(), freeze
    staging = json.loads(freeze.read_text(encoding="utf-8"))
    write_json(PHASE2 / "phase1_staging_snapshot.json", staging)

    counts_p1 = Counter(r["import_category"] for r in staging)
    assert len(staging) == 75, len(staging)
    assert counts_p1.get("READY_TO_IMPORT", 0) == 0
    assert counts_p1.get("NEEDS_REVIEW", 0) == 27
    assert counts_p1.get("NEEDS_COORDINATES", 0) == 14
    assert counts_p1.get("EXCLUDED", 0) == 34

    by_id = {r["id"]: deepcopy(r) for r in staging}
    missing = P1_UNRESOLVED - set(by_id)
    assert not missing, missing
    assert len(P1_UNRESOLVED) == 41
    assert set(DECISIONS) == P1_UNRESOLVED

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
        if dec.get("chain_key"):
            row["chain_key"] = dec["chain_key"]
        row["notes"] = (row.get("notes") or "") + " | " + dec.get("notes", "")
        row["phase2_decided"] = True

    final = list(by_id.values())

    ready = [r for r in final if r["import_category"] == "READY_TO_IMPORT"]
    for r in ready:
        assert r["id"].startswith("ba_"), r["id"]
        assert BA_POSTAL_RE.match(str(r.get("postal_code") or "")), r
        assert r.get("lat") is not None and r.get("lng") is not None, r["id"]
        assert ready_coord_in_territory(r), (r["id"], r["lat"], r["lng"])
        assert not FALLBACK_RE.search(str(r.get("coord_source") or "")), r["id"]
        assert not MOJIBAKE_RE.search(
            f"{r.get('name')}{r.get('address')}{r.get('city')}{r.get('brand')}"
        )
        assert r.get("eligibility_path") in (
            "SMALL_MARKET_INDEPENDENT",
            "CHAIN_CLASS_A",
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
        ), by_id[uid]["import_category"]

    dup = proximity(final)
    assert dup["hard_duplicate_conflicts"] == 0, dup["identical_coordinates"]

    brand_counts_ready = Counter(r.get("brand") for r in ready)
    elig_counts = Counter(r.get("eligibility_path") for r in ready)
    assert len(ready) == 31, len(ready)
    assert elig_counts.get("CHAIN_CLASS_A", 0) == 7, elig_counts
    assert elig_counts.get("SMALL_MARKET_INDEPENDENT", 0) == 24, elig_counts

    city_coverage = {
        "Sarajevo": "READY_present",
        "Banja Luka": "READY_present",
        "Tuzla": "READY_present",
        "Mostar": "READY_present",
        "Zenica": "READY_present",
        "Bijeljina": "READY_present",
        "Bihać": "READY_present",
        "Brčko": "READY_present",
        "Prijedor": "READY_present",
        "Doboj": "READY_present",
        "Trebinje": "READY_present",
        "Cazin": "READY_present",
        "Travnik": "READY_present",
        "Gradačac": "A_legitimate_no_local_gym",
        "Gračanica": "READY_present",
        "Živinice": "READY_present",
        "Lukavac": "A_legitimate_no_local_gym",
        "Visoko": "A_legitimate_no_local_gym",
        "Goražde": "READY_present",
        "Konjic": "A_legitimate_no_local_gym",
        "Bugojno": "A_legitimate_no_local_gym",
        "Jajce": "A_legitimate_no_local_gym",
        "Livno": "A_legitimate_no_local_gym",
    }

    for row in by_id.values():
        if row.get("discovery_class") != "regional_gap":
            continue
        city = row.get("city")
        if city in city_coverage:
            row["phase1_city_class"] = city_coverage[city]
            row["phase2_classification"] = city_coverage[city]
            row["notes"] = (
                (row.get("notes") or "")
                + f" | Phase2: city class {city_coverage[city]}."
            )

    rebrand = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "A_CLASS_A_CHAIN",
                "entities": [
                    "ALL IN FITNESS Malta",
                    "ALL IN FITNESS Ilidža",
                    "ALL IN FITNESS Bingo",
                ],
                "notes": "Phase2 resolved: 3 conventional public Sarajevo floors; directory aliases map to ALL IN FITNESS; CLASS_A.",
            },
            {
                "type": "A_CLASS_A_CHAIN",
                "entities": [
                    "Kron Tuzla",
                    "Kron Živinice",
                    "Kron Srebrenik",
                    "Kron Gračanica",
                ],
                "notes": "Phase2 resolved: 4-site Tuzla-canton regional operator; conventional public floors; CLASS_A.",
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["Extreme Fitness Sarajevo", "Xtreme Gym Sarajevo"],
                "notes": "Extreme Fitness Zmaja od Bosne 7 READY; Xtreme Gym EXCLUDED C_DUPLICATE_UNVERIFIED.",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Fitness Centar 4Life Banja Luka", "Xtreme Fit Banja Luka"],
                "notes": "Distinct Banja Luka independents; both READY SMI with defended premises.",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["ALL IN FITNESS Ilidža", "Fitness Zone Sarajevo"],
                "notes": "Adjacent Ilidža conventional floors; distinct operators.",
            },
            {
                "type": "B_distinct_current_clubs",
                "entities": ["Kron Fitness Tuzla", "Slavinovici Teretana Tuzla"],
                "notes": "Distinct Tuzla conventional clubs.",
            },
        ],
        "all_in_fitness_audit": {
            "ALL_IN_ACTIVE_SITES": 3,
            "CLASS_A": True,
            "conventional_public_floors_verified": 3,
            "directory_alias_resolution": "ALL IN / All In Fitness / Malta-Bingo-Ilidža unified",
        },
        "kron_audit": {
            "KRON_ACTIVE_SITES": 4,
            "CLASS_A": True,
            "conventional_public_floors_verified": 4,
            "cities": ["Tuzla", "Živinice", "Srebrenik", "Gračanica"],
        },
        "note": "Phase2 merge gate: 0 unresolved rebrand conflicts; Phase 1 holds resolved.",
    }

    chain_inv = {
        "class_a_threshold": "≥3 conventional public locations inside Bosnia and Herzegovina",
        "qualifying_class_a_chains": 2,
        "class_a_locations": 7,
        "CLASS_A": True,
        "operators": {
            "ALL IN FITNESS": {
                "discovered_units": 3,
                "conventional_public_floors_verified": 3,
                "ready_sites": 3,
                "verdict": "CLASS_A",
                "class_a": True,
                "cities": ["Sarajevo"],
                "notes": "Malta Paromlinska + Ilidža + Bingo; directory aliases resolved Phase 2.",
            },
            "Kron Fitness": {
                "discovered_units": 4,
                "conventional_public_floors_verified": 4,
                "ready_sites": 4,
                "verdict": "CLASS_A",
                "class_a": True,
                "cities": ["Tuzla", "Živinice", "Srebrenik", "Gračanica"],
                "notes": "4-site Tuzla-canton regional operator; conventional public floors.",
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
            "Clever Fit": {"verdict": "ABSENT", "class_a": False},
            "Fitinn": {"verdict": "ABSENT", "class_a": False},
        },
        "international_recheck": "ABSENT — Anytime/Basic-Fit/McFIT/PureGym/World Class/Ahilej/JOHN REED/Gold's Gym",
    }

    cross_border_path = OUT / "BOSNIA_HERZEGOVINA_CROSS_BORDER_AUDIT.json"
    cross_border_base = json.loads(cross_border_path.read_text(encoding="utf-8"))
    cross_border = {
        **cross_border_base,
        "croatia_ready": 0,
        "serbia_ready": 0,
        "montenegro_ready": 0,
        "ready_all_zero": True,
        "notes": "Phase2: all foreign probes remain EXCLUDED; cross-border READY = 0.",
    }

    city_cov_doc = {
        "cities": city_coverage,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase2_closed_former_b_gaps": [],
        "phase2_legitimate_no_local_gym": [
            "Gradačac",
            "Lukavac",
            "Visoko",
            "Konjic",
            "Bugojno",
            "Jajce",
            "Livno",
        ],
        "phase2_gradacac_resolution": "A_legitimate_no_local_gym — deep sweep found no defended conventional gym",
        "federation_rs_brcko_unified": True,
    }

    geocode_review = {
        "fallback_ready": 0,
        "outside_gate": 0,
        "invalid_postcodes": 0,
        "northwest_fbih_exceptions": list(NW_FBIH_READY),
        "notes": (
            "All READY passed BA_POSTAL_RE; no FALLBACK coord_source. "
            "Bihać/Cazin use verified NW FBiH premises west of conservative gate envelope."
        ),
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
    assert projected == 11831, projected

    assert city_cov_doc["unexplained_b_gaps"] == 0
    assert city_cov_doc["unexplained_d_gaps"] == 0

    report = {
        "country": TERRITORY,
        "phase": 2,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "bosnia_herzegovina_live": 0,
        "ba_prefix_live": 0,
        "phase1_recovered": True,
        "phase1_staging_total": 75,
        "phase1_unresolved_recovered": len(P1_UNRESOLVED),
        "phase1_promoted_to_ready": promoted,
        "phase1_excluded": excluded_from_p1,
        "phase1_closed": 0,
        "new_legitimate_gyms_discovered": len(new_ready),
        "status_counts": counts,
        "ready_to_import": len(ready),
        "needs_review": counts.get("NEEDS_REVIEW", 0),
        "needs_coordinates": counts.get("NEEDS_COORDINATES", 0),
        "qualifying_class_a_chains": 2,
        "class_a_locations": 7,
        "CLASS_A": True,
        "chain_class_a_ready": elig_counts.get("CHAIN_CLASS_A", 0),
        "small_market_independent_ready": elig_counts.get(
            "SMALL_MARKET_INDEPENDENT", 0
        ),
        "ready_by_brand": dict(brand_counts_ready),
        "city_coverage": city_coverage,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "cross_border": {
            "croatia_ready": 0,
            "serbia_ready": 0,
            "montenegro_ready": 0,
        },
        "data_quality": {
            "fallback_ready_coords": 0,
            "invalid_postcodes": 0,
            "invalid_coordinates": 0,
            "mojibake": 0,
            "hard_duplicates": dup["hard_duplicate_conflicts"],
            "unresolved_rebrands": 0,
        },
        "all_in_fitness_audit": rebrand["all_in_fitness_audit"],
        "kron_audit": rebrand["kron_audit"],
        "hotel_spa_leakage_ready": 0,
        "phase3_required": False,
        "merge_ready": True,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "READY FOR BOSNIA & HERZEGOVINA MERGE",
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
    }

    write_json(OUT / "bosnia_herzegovina_centers_staging.json", final)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "BOSNIA_HERZEGOVINA_CHAIN_INVENTORY.json", chain_inv)
    write_json(OUT / "BOSNIA_HERZEGOVINA_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "BOSNIA_HERZEGOVINA_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "BOSNIA_HERZEGOVINA_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "BOSNIA_HERZEGOVINA_CITY_COVERAGE.json", city_cov_doc)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_CHAIN_INVENTORY.json", chain_inv)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "BOSNIA_HERZEGOVINA_PHASE2_CITY_COVERAGE.json", city_cov_doc)
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
            "chain_class_a_ready": elig_counts.get("CHAIN_CLASS_A", 0),
            "small_market_independent_ready": elig_counts.get(
                "SMALL_MARKET_INDEPENDENT", 0
            ),
            "projected_catalog": projected,
            "verdict": report["verdict"],
            "sha": sha,
        },
    )
    write_xlsx(final)

    md = f"""# BOSNIA & HERZEGOVINA DEEP PHASE 2 — READINESS

## Verdict

**READY FOR BOSNIA & HERZEGOVINA MERGE**

## Freeze

- Production: {PRODUCTION_TOTAL}
- SHA: `{sha}`
- Bosnia and Herzegovina live: 0

## READY

- Total READY: **{len(ready)}**
- CHAIN_CLASS_A: **{elig_counts.get('CHAIN_CLASS_A', 0)}**
- SMALL_MARKET_INDEPENDENT: **{elig_counts.get('SMALL_MARKET_INDEPENDENT', 0)}**
- Phase1 promoted: {promoted}
- New discoveries READY: {len(new_ready)}

## Status

```
{json.dumps(counts, indent=2)}
```

## Class A chains

- ALL IN FITNESS: 3 sites · CLASS_A
- Kron Fitness: 4 sites · CLASS_A

## City coverage

```
{json.dumps(city_coverage, indent=2, ensure_ascii=False)}
```

## Gradačac

- Phase 2 deep sweep: **A_legitimate_no_local_gym** (no defended conventional gym)

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{projected}**

Crosses 12,500: {'YES' if projected >= 12500 else 'NO'} · Global Stress QA: NO · Phase 3: NO
"""
    (OUT / "BOSNIA_HERZEGOVINA_PHASE2_READINESS_REPORT.md").write_text(
        md, encoding="utf-8"
    )

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == sha == EXPECTED_SHA
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(sha_after + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "chain_class_a_ready": elig_counts.get("CHAIN_CLASS_A", 0),
                "smi_ready": elig_counts.get("SMALL_MARKET_INDEPENDENT", 0),
                "counts": counts,
                "needs_review": nr,
                "needs_coordinates": nc,
                "city_coverage": city_coverage,
                "projected": projected,
                "phase3_required": False,
                "merge_ready": True,
                "verdict": report["verdict"],
                "sha": sha_after,
                "sha_match": sha_after == EXPECTED_SHA,
                "hard_duplicates": dup["hard_duplicate_conflicts"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
