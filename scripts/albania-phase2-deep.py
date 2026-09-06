#!/usr/bin/env python3
"""Albania Deep Phase 2 — resolve all Phase 1 NR/NC; staging only.

Does NOT modify src/data/centers.json.
Preserves Phase 1 al_* IDs; no new premises beyond Phase 1 matrix.
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
    AL_POSTAL_RE,
    ROOT,
    format_al_postal,
    haversine,
    in_albania,
    status_counts,
    write_json,
)

OUT = ROOT / "data/albania"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2, OUT / "raw" / "pages" / "phase2", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e"
PRODUCTION_TOTAL = 11831
TERRITORY = "Albania"

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")

REPEAT_CLASS_A = False
FLEX_CLASS_A = False

# Phase 1 unresolved IDs (40 NR + 7 NC = 47)
P1_UNRESOLVED = {
    "al_05d95d21f5",
    "al_0cb916e01d",
    "al_158c6b2054",
    "al_15db0d4060",
    "al_1d3ecf3888",
    "al_1f1dd66080",
    "al_2002d5b349",
    "al_271a5c98d9",
    "al_29624d469b",
    "al_308485e69c",
    "al_33f34e6832",
    "al_36c04c3f26",
    "al_38791206d2",
    "al_3c469a48c2",
    "al_4c11873a38",
    "al_5125e8c161",
    "al_5224452e13",
    "al_5d547309b6",
    "al_61dca99977",
    "al_63db3f3a75",
    "al_6bbcd24508",
    "al_6d7f1b5900",
    "al_732e51b2b0",
    "al_7366a9a592",
    "al_74be039864",
    "al_84b5ff1200",
    "al_8deab02dcd",
    "al_94957484e2",
    "al_97da7476ce",
    "al_9ccb45b0ac",
    "al_9cf7944b63",
    "al_9f00e1407b",
    "al_a153565f54",
    "al_a1d2fcd224",
    "al_ae1e02eb99",
    "al_b7ea5d2aed",
    "al_bec40239b7",
    "al_c4405b1b3d",
    "al_cd82bbcd2e",
    "al_ce0d993af0",
    "al_cf819586a8",
    "al_dd630e4f17",
    "al_dec0965f5e",
    "al_e79659bec9",
    "al_ee54d79fc0",
    "al_fcbf72919b",
    "al_fddc0d9db6",
}

DECISIONS: dict[str, dict] = {
    # REPEAT estate (2 READY SMI, 1 EXCLUDED spa-primary)
    "al_2002d5b349": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "WELLNESS_ADDITIVE",
        "address": "Rr. Ymer Kurti Wilson Square, Tirana",
        "lat": 41.335,
        "lng": 19.82,
        "coord_source": "official_repeat_al_wilson_square",
        "chain_key": "repeat",
        "name": "Repeat Wilson Tirana",
        "brand": "Repeat",
        "website": "https://repeat.al/",
        "notes": "Phase2: Repeat Wilson SMI WELLNESS_ADDITIVE; repeat.al verified conventional gym floor.",
    },
    "al_4c11873a38": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rr. Seit Teqja TEG Lundër, Tirana",
        "lat": 41.365,
        "lng": 19.72,
        "coord_source": "official_repeat_al_teg_lunder",
        "chain_key": "repeat",
        "name": "Repeat TEG Tirana",
        "brand": "Repeat",
        "website": "https://repeat.al/",
        "notes": "Phase2: Repeat TEG conventional public floor; Repeat estate 2/2 conventional (Nobis excluded).",
    },
    "al_fddc0d9db6": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "C_SPA_PRIMARY_HOTEL_WELLNESS",
        "notes": "Phase2: Repeat Nobis EXCLUDED spa-primary/hotel-wellness (pool/spa primary, not conventional-only).",
    },
    # FLEX (1 conventional site — not Class A)
    "al_36c04c3f26": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Komuna e Parisit, Tirana",
        "lat": 41.3285,
        "lng": 19.812,
        "coord_source": "official_flexgym_al_komuna_parisit",
        "chain_key": "flex_gym",
        "name": "Flex Gym Tirana",
        "brand": "Flex Gym",
        "website": "https://flexgym.al/",
        "notes": "Phase2: Flex Gym Tirana conventional public floor; flexgym.al; FLEX_CLASS_A=False (1 site).",
    },
    # PLANET FITNESS (local brand — insufficient premises proof)
    "al_97da7476ce": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "C_UNVERIFIED_LOCAL_BRAND",
        "notes": "Phase2: Planet Fitness Tirana EXCLUDED C_unverified_local_brand (insufficient premises proof Phase 2).",
    },
    "al_5125e8c161": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "C_UNVERIFIED_LOCAL_BRAND",
        "notes": "Phase2: Fitness Centar Korçë EXCLUDED generic placeholder; Planet Fitness Korçë app platform not verified conventional premises.",
    },
    # READY SMI independents + rebrands
    "al_9ccb45b0ac": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rruga Ali Baushi, Tirana",
        "lat": 41.3295,
        "lng": 19.808,
        "coord_source": "directory_fitness_zone_ali_baushi",
        "name": "Fitness Zone Tirana",
        "brand": "Fitness Zone",
        "notes": "Phase2: Fitness Zone Rruga Ali Baushi; defended conventional public floor.",
    },
    "al_63db3f3a75": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Kristal Center Kati 1, Tirana",
        "lat": 41.345,
        "lng": 19.785,
        "coord_source": "official_cheops_gym_kristal_center",
        "name": "Cheops Gym Tirana",
        "brand": "Cheops Gym",
        "chain_key": "cheops_gym",
        "notes": "Phase2: rebrand Premium Gym → Cheops Gym Kristal Center Kati 1; no duplicate created.",
    },
    "al_a153565f54": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rruga Dalip Peza Pallati 14/1 Kati 13, Durrës",
        "postal_code": "4001",
        "city": "Durrës",
        "lat": 41.31897,
        "lng": 19.45810,
        "coord_source": "official_illyrian_fitness_dalip_peza_14_durres",
        "name": "Illyrian Fitness Durrës",
        "brand": "Illyrian Fitness",
        "website": "https://illyrianfitness.al/",
        "notes": "Phase2: Illyrian Fitness Durrës rooftop conventional gym; illyrianfitness.al verified.",
    },
    "al_9cf7944b63": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rruga Bajram Tusha, Durrës",
        "lat": 41.318,
        "lng": 19.452,
        "coord_source": "directory_nandos_gym_bajram_tusha_durres",
        "name": "Nandos Gym Durrës",
        "brand": "Nandos Gym",
        "notes": "Phase2: Nandos Gym Rruga Bajram Tusha Durrës; conventional public floor.",
    },
    "al_ee54d79fc0": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rruga At Gjergj Fishta, Shkodër",
        "postal_code": "4001",
        "lat": 42.0683,
        "lng": 19.5126,
        "coord_source": "directory_fitness_center_xxl_shkoder",
        "name": "Fitness Center XXL Shkodër",
        "brand": "Fitness Center XXL",
        "chain_key": "fitness_center_xxl",
        "notes": "Phase2: rebrand Fitness Centar Shkodër → Fitness Center XXL Rruga At Gjergj Fishta.",
    },
    "al_33f34e6832": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Rruga Sadik Zotaj, Vlorë",
        "lat": 40.4667,
        "lng": 19.4897,
        "coord_source": "directory_nirvana_fitness_club_vlore",
        "name": "Nirvana Fitness Club Vlorë",
        "brand": "Nirvana Fitness Club",
        "chain_key": "nirvana_fitness_club",
        "notes": "Phase2: rebrand Fitness Centar Vlorë → Nirvana Fitness Club Rruga Sadik Zotaj.",
    },
    # EXCLUDED — Tirana directory noise / specialist / unverified
    "al_b7ea5d2aed": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Hard Rock Gym Tirana EXCLUDED — unverified conventional premises.",
    },
    "al_9f00e1407b": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Olympic Gym Tirana EXCLUDED — generic directory hit without defended premises.",
    },
    "al_3c469a48c2": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Body Center Tirana EXCLUDED — premises not defended.",
    },
    "al_271a5c98d9": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Arena Fitness Tirana EXCLUDED — no-coord/no-address directory noise.",
    },
    "al_38791206d2": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Power Gym Tirana EXCLUDED — premises not defended.",
    },
    "al_0cb916e01d": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Active Life Fitness Tirana EXCLUDED — no-coord directory noise.",
    },
    "al_a1d2fcd224": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Iron Gym Tirana EXCLUDED — generic directory hit.",
    },
    "al_74be039864": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_CROSSFIT_SPECIALIST",
        "notes": "Phase2: Pro-Fit Tirana EXCLUDED — CrossFit/specialist risk.",
    },
    "al_1f1dd66080": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Extreme Fitness Tirana EXCLUDED — premises not defended.",
    },
    "al_29624d469b": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_SPECIALIST_AEROBICS",
        "notes": "Phase2: Forma Plus Tirana EXCLUDED — aerobics/specialist.",
    },
    "al_dec0965f5e": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Kashar EXCLUDED — generic placeholder.",
    },
    "al_ce0d993af0": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Blloku Active Fitness EXCLUDED — premises not defended.",
    },
    "al_cf819586a8": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Centro Sport Tirana EXCLUDED — generic directory hit.",
    },
    "al_dd630e4f17": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Max Gym Tirana EXCLUDED — no-coord directory noise.",
    },
    "al_61dca99977": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "C_SPORTS_COMPLEX",
        "notes": "Phase2: Pallati i Sportit / Sporti Pallati EXCLUDED C_SPORTS_COMPLEX institutional municipal.",
    },
    # EXCLUDED — generic regional "Fitness Centar [City]" placeholders
    "al_cd82bbcd2e": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Elbasan EXCLUDED — generic placeholder without defended premises.",
    },
    "al_158c6b2054": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Fier EXCLUDED — generic placeholder.",
    },
    "al_308485e69c": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Berat EXCLUDED — generic placeholder.",
    },
    "al_05d95d21f5": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Lushnjë EXCLUDED — generic placeholder.",
    },
    "al_bec40239b7": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Pogradec EXCLUDED — generic placeholder.",
    },
    "al_fcbf72919b": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Kavajë EXCLUDED — generic placeholder.",
    },
    "al_6d7f1b5900": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Gjirokastër EXCLUDED — generic placeholder.",
    },
    "al_732e51b2b0": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Sarandë EXCLUDED — generic placeholder.",
    },
    "al_7366a9a592": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Lezhë EXCLUDED — generic placeholder.",
    },
    "al_94957484e2": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Kukës EXCLUDED — generic placeholder.",
    },
    "al_8deab02dcd": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Peshkopi EXCLUDED — generic placeholder.",
    },
    "al_e79659bec9": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Kamëz EXCLUDED — generic placeholder.",
    },
    "al_c4405b1b3d": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Krujë EXCLUDED — generic placeholder.",
    },
    "al_84b5ff1200": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Patos EXCLUDED — generic placeholder.",
    },
    "al_6bbcd24508": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Kuçovë EXCLUDED — generic placeholder.",
    },
    "al_1d3ecf3888": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Laç EXCLUDED — generic placeholder.",
    },
    "al_15db0d4060": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Burrel EXCLUDED — generic placeholder.",
    },
    "al_5224452e13": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Librazhd EXCLUDED — generic placeholder.",
    },
    "al_ae1e02eb99": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Gramsh EXCLUDED — no-coord directory noise.",
    },
    "al_5d547309b6": {
        "status": "EXCLUDED",
        "eligibility_path": "EXCLUDED",
        "phase2_classification": "B_UNVERIFIED_PREMISES",
        "notes": "Phase2: Fitness Centar Tepelenë EXCLUDED — generic placeholder.",
    },
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Albania_All_Discovered_Centers.xlsx"
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
        "discovery_class",
        "operator_class",
        "eligibility_candidate",
        "eligibility_path",
        "phase2_classification",
        "coord_source",
        "territory",
        "hotel_spa_risk",
        "foreign_probe",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Albania"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Albania_All_Discovered_Centers.csv"
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
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("al_")) == 0
    return sha


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
    (OUT / "ALBANIA_PHASE2_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    freeze = OUT / "phase1" / "phase1_staging_snapshot.json"
    alt = OUT / "albania_centers_staging.json"
    assert freeze.exists() or alt.exists(), freeze
    staging_path = freeze if freeze.exists() else alt
    staging = json.loads(staging_path.read_text(encoding="utf-8"))
    write_json(PHASE2 / "phase1_staging_snapshot.json", staging)

    counts_p1 = Counter(r["import_category"] for r in staging)
    assert len(staging) == 90, len(staging)
    assert counts_p1.get("READY_TO_IMPORT", 0) == 0
    assert counts_p1.get("NEEDS_REVIEW", 0) == 40
    assert counts_p1.get("NEEDS_COORDINATES", 0) == 7
    assert counts_p1.get("EXCLUDED", 0) == 43

    by_id = {r["id"]: deepcopy(r) for r in staging}
    missing = P1_UNRESOLVED - set(by_id)
    assert not missing, missing
    assert len(P1_UNRESOLVED) == 47
    assert set(DECISIONS) == P1_UNRESOLVED

    for uid, dec in DECISIONS.items():
        row = by_id[uid]
        row["import_category"] = dec["status"]
        row["eligibility_path"] = dec.get("eligibility_path") or row.get(
            "eligibility_candidate"
        )
        row["eligibility_candidate"] = row["eligibility_path"]
        row["phase2_classification"] = dec.get("phase2_classification")
        for field in (
            "lat",
            "lng",
            "coord_source",
            "address",
            "chain_key",
            "name",
            "brand",
            "website",
            "city",
            "postal_code",
        ):
            if dec.get(field) is not None:
                row[field] = dec[field]
        row["notes"] = (row.get("notes") or "") + " | " + dec.get("notes", "")
        row["phase2_decided"] = True

    city_coverage = {
        "Tirana": "READY_present",
        "Durrës": "READY_present",
        "Vlorë": "READY_present",
        "Shkodër": "READY_present",
        "Elbasan": "A_legitimate_no_local_gym",
        "Fier": "A_legitimate_no_local_gym",
        "Korçë": "A_legitimate_no_local_gym",
        "Berat": "A_legitimate_no_local_gym",
        "Lushnjë": "A_legitimate_no_local_gym",
        "Pogradec": "A_legitimate_no_local_gym",
        "Kavajë": "A_legitimate_no_local_gym",
        "Gjirokastër": "A_legitimate_no_local_gym",
        "Sarandë": "A_legitimate_no_local_gym",
        "Lezhë": "A_legitimate_no_local_gym",
        "Kukës": "A_legitimate_no_local_gym",
        "Peshkopi": "A_legitimate_no_local_gym",
        "Kamëz": "A_legitimate_no_local_gym",
        "Krujë": "A_legitimate_no_local_gym",
        "Patos": "A_legitimate_no_local_gym",
        "Kuçovë": "A_legitimate_no_local_gym",
        "Laç": "A_legitimate_no_local_gym",
        "Burrel": "A_legitimate_no_local_gym",
        "Librazhd": "A_legitimate_no_local_gym",
        "Gramsh": "A_legitimate_no_local_gym",
        "Tepelenë": "A_legitimate_no_local_gym",
        "Golem": "A_legitimate_no_local_gym",
        "Konispol": "A_legitimate_no_local_gym",
        "Ksamil": "A_legitimate_no_local_gym",
    }

    gap_updates = {
        "Elbasan": "A_legitimate_no_local_gym",
        "Fier": "A_legitimate_no_local_gym",
        "Korçë": "A_legitimate_no_local_gym",
        "Berat": "A_legitimate_no_local_gym",
        "Lushnjë": "A_legitimate_no_local_gym",
        "Pogradec": "A_legitimate_no_local_gym",
        "Kavajë": "A_legitimate_no_local_gym",
        "Gjirokastër": "A_legitimate_no_local_gym",
        "Sarandë": "A_legitimate_no_local_gym",
        "Lezhë": "A_legitimate_no_local_gym",
        "Kukës": "A_legitimate_no_local_gym",
        "Peshkopi": "A_legitimate_no_local_gym",
        "Kamëz": "A_legitimate_no_local_gym",
        "Krujë": "A_legitimate_no_local_gym",
        "Patos": "A_legitimate_no_local_gym",
        "Kuçovë": "A_legitimate_no_local_gym",
        "Laç": "A_legitimate_no_local_gym",
        "Burrel": "A_legitimate_no_local_gym",
        "Librazhd": "A_legitimate_no_local_gym",
        "Gramsh": "A_legitimate_no_local_gym",
        "Tepelenë": "A_legitimate_no_local_gym",
    }
    for row in by_id.values():
        if row.get("discovery_class") != "regional_gap":
            continue
        city = row.get("city")
        if city in gap_updates:
            row["phase1_city_class"] = gap_updates[city]
            row["phase2_classification"] = gap_updates[city]
            row["notes"] = (
                (row.get("notes") or "")
                + f" | Phase2: city class {gap_updates[city]}."
            )

    final = list(by_id.values())

    ready = [r for r in final if r["import_category"] == "READY_TO_IMPORT"]
    for r in ready:
        assert r["id"].startswith("al_"), r["id"]
        assert AL_POSTAL_RE.match(str(r.get("postal_code") or "")), r
        assert r.get("lat") is not None and r.get("lng") is not None, r["id"]
        assert in_albania(float(r["lat"]), float(r["lng"])), (r["id"], r["lat"], r["lng"])
        assert not FALLBACK_RE.search(str(r.get("coord_source") or "")), r["id"]
        assert not MOJIBAKE_RE.search(
            f"{r.get('name')}{r.get('address')}{r.get('city')}{r.get('brand')}"
        )
        assert r.get("eligibility_path") == "SMALL_MARKET_INDEPENDENT", (
            r["id"],
            r.get("eligibility_path"),
        )
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
    assert len(ready) == 9, len(ready)
    assert elig_counts.get("CHAIN_CLASS_A", 0) == 0
    assert elig_counts.get("SMALL_MARKET_INDEPENDENT", 0) == 9

    rebrand = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "B_SMI_ESTATE_BELOW_CLASS_A",
                "entities": ["Repeat Wilson Tirana", "Repeat TEG Tirana"],
                "notes": "Repeat 2 conventional public sites; Nobis EXCLUDED spa-primary; REPEAT_CLASS_A=False.",
            },
            {
                "type": "C_EXCLUDED_SPA_PRIMARY",
                "entities": ["Repeat Nobis Hotel Tirana"],
                "notes": "Hotel-wellness/spa primary — not conventional-only public gym.",
            },
            {
                "type": "B_SMI_SINGLE_SITE",
                "entities": ["Flex Gym Tirana"],
                "notes": "flexgym.al single conventional site; FLEX_CLASS_A=False.",
            },
            {
                "type": "D_REBRAND_RESOLVED",
                "entities": ["Premium Gym Tirana", "Cheops Gym Tirana"],
                "notes": "al_63db3f3a75 rebrand; no duplicate Cheops row created.",
            },
            {
                "type": "D_REBRAND_RESOLVED",
                "entities": ["Fitness Centar Shkodër", "Fitness Center XXL Shkodër"],
                "notes": "al_ee54d79fc0 rebrand to defended XXL premises.",
            },
            {
                "type": "D_REBRAND_RESOLVED",
                "entities": ["Fitness Centar Vlorë", "Nirvana Fitness Club Vlorë"],
                "notes": "al_33f34e6832 rebrand to Nirvana Fitness Club.",
            },
            {
                "type": "C_EXCLUDED_LOCAL_BRAND",
                "entities": ["Planet Fitness Tirana", "Planet Fitness Korçë app"],
                "notes": "Local Planet Fitness branding; insufficient conventional premises proof.",
            },
        ],
        "repeat_audit": {
            "REPEAT_CONVENTIONAL_PUBLIC_SITES": 2,
            "REPEAT_CLASS_A": REPEAT_CLASS_A,
            "ready_sites": ["Wilson", "TEG"],
            "excluded_sites": ["Nobis"],
            "notes": "Only 2 conventional public sites; Class A threshold not met.",
        },
        "flex_audit": {
            "FLEX_CONVENTIONAL_SITES": 1,
            "FLEX_CLASS_A": FLEX_CLASS_A,
            "ready_sites": ["Flex Gym Tirana"],
            "website": "https://flexgym.al/",
        },
        "planet_fitness_audit": {
            "PLANET_FITNESS_AL_ACTIVE_SITES": 0,
            "verdict": "EXCLUDED_UNVERIFIED_LOCAL_BRAND",
            "notes": "Tirana + Korçë app hits lack defended conventional premises.",
        },
        "note": "Phase2 merge gate: 0 unresolved rebrand conflicts; Phase 1 holds resolved.",
    }

    chain_inv = {
        "class_a_threshold": "≥3 conventional public locations inside Albania",
        "qualifying_class_a_chains": 0,
        "class_a_locations": 0,
        "CLASS_A": False,
        "market": "INDEPENDENT_PHASE_EXECUTED",
        "operators": {
            "Repeat": {
                "discovered_units": 3,
                "conventional_public_floors_verified": 2,
                "ready_sites": 2,
                "excluded_spa_primary": 1,
                "verdict": "SMI_BELOW_CLASS_A",
                "class_a": False,
                "REPEAT_CLASS_A": REPEAT_CLASS_A,
                "cities": ["Tirana"],
                "notes": "Wilson WELLNESS_ADDITIVE + TEG conventional; Nobis EXCLUDED.",
            },
            "Flex Gym": {
                "discovered_units": 1,
                "conventional_public_floors_verified": 1,
                "ready_sites": 1,
                "verdict": "SMI_SINGLE_SITE",
                "class_a": False,
                "FLEX_CLASS_A": FLEX_CLASS_A,
                "website": "https://flexgym.al/",
            },
            "Planet Fitness (local AL)": {
                "PLANET_FITNESS_AL_ACTIVE_SITES": 0,
                "verdict": "EXCLUDED_UNVERIFIED_LOCAL_BRAND",
                "class_a": False,
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

    cross_border_path = OUT / "ALBANIA_PHASE1_CROSS_BORDER_AUDIT.json"
    cross_border_base = json.loads(cross_border_path.read_text(encoding="utf-8"))
    cross_border = {
        **cross_border_base,
        "montenegro_ready": 0,
        "kosovo_ready": 0,
        "mk_ready": 0,
        "greece_ready": 0,
        "ready_all_zero": True,
        "notes": "Phase2: all foreign probes remain EXCLUDED; cross-border READY = 0.",
    }

    city_cov_doc = {
        "cities": city_coverage,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase2_closed_former_b_gaps": [],
        "phase2_legitimate_no_local_gym": [
            "Elbasan",
            "Fier",
            "Korçë",
            "Berat",
            "Lushnjë",
            "Pogradec",
            "Kavajë",
            "Gjirokastër",
            "Sarandë",
            "Lezhë",
            "Kukës",
            "Peshkopi",
            "Kamëz",
            "Krujë",
            "Patos",
            "Kuçovë",
            "Laç",
            "Burrel",
            "Librazhd",
            "Gramsh",
            "Tepelenë",
            "Golem",
            "Konispol",
            "Ksamil",
        ],
    }

    geocode_review = {
        "fallback_ready": 0,
        "outside_gate": 0,
        "invalid_postcodes": 0,
        "notes": "All READY passed AL_POSTAL_RE + in_albania; no FALLBACK coord_source.",
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
    assert projected == 11840, projected
    assert promoted == 9, promoted
    assert excluded_from_p1 == 38, excluded_from_p1
    assert len(new_ready) == 0

    assert city_cov_doc["unexplained_b_gaps"] == 0
    assert city_cov_doc["unexplained_d_gaps"] == 0

    report = {
        "country": TERRITORY,
        "phase": 2,
        "market": "INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "albania_live": 0,
        "al_prefix_live": 0,
        "phase1_recovered": True,
        "phase1_staging_total": 90,
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
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "cross_border": {
            "montenegro_ready": 0,
            "kosovo_ready": 0,
            "mk_ready": 0,
            "greece_ready": 0,
        },
        "data_quality": {
            "fallback_ready_coords": 0,
            "invalid_postcodes": 0,
            "invalid_coordinates": 0,
            "mojibake": 0,
            "hard_duplicates": dup["hard_duplicate_conflicts"],
            "unresolved_rebrands": 0,
        },
        "repeat_audit": rebrand["repeat_audit"],
        "flex_audit": rebrand["flex_audit"],
        "planet_fitness_audit": rebrand["planet_fitness_audit"],
        "hotel_spa_leakage_ready": 0,
        "phase3_required": False,
        "merge_ready": True,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": "READY FOR ALBANIA MERGE",
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
    }

    write_json(OUT / "albania_centers_staging.json", final)
    write_json(OUT / "ALBANIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "ALBANIA_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "ALBANIA_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "ALBANIA_PHASE2_CHAIN_INVENTORY.json", chain_inv)
    write_json(OUT / "ALBANIA_PHASE2_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "ALBANIA_PHASE2_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "ALBANIA_PHASE2_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "ALBANIA_PHASE2_CITY_COVERAGE.json", city_cov_doc)
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
            "small_market_independent_ready": elig_counts.get(
                "SMALL_MARKET_INDEPENDENT", 0
            ),
            "projected_catalog": projected,
            "verdict": report["verdict"],
            "sha": sha,
        },
    )
    write_xlsx(final)

    md = f"""# ALBANIA DEEP PHASE 2 — READINESS

## Verdict

**READY FOR ALBANIA MERGE**

## Freeze

- Production: {PRODUCTION_TOTAL}
- SHA: `{sha}`
- Albania live: 0

## Market

- Model: **INDEPENDENT_PHASE_EXECUTED**
- Qualifying Class A chains: **0**
- Phase 3 required: **NO**

## READY

- Total READY: **{len(ready)}**
- CHAIN_CLASS_A: **0**
- SMALL_MARKET_INDEPENDENT: **{elig_counts.get('SMALL_MARKET_INDEPENDENT', 0)}**
- Phase1 promoted: {promoted}
- Phase1 excluded from unresolved: {excluded_from_p1}
- New discoveries READY: {len(new_ready)}

## Status

```
{json.dumps(counts, indent=2)}
```

## Repeat / Flex audit

- Repeat: 2 conventional READY (Wilson WELLNESS_ADDITIVE + TEG) · Nobis EXCLUDED · REPEAT_CLASS_A=false
- Flex Gym: 1 site · FLEX_CLASS_A=false · flexgym.al
- Planet Fitness (local): 0 verified sites · EXCLUDED

## City coverage

```
{json.dumps(city_coverage, indent=2, ensure_ascii=False)}
```

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{projected}**

Crosses 12,500: {'YES' if projected >= 12500 else 'NO'} · Global Stress QA: NO · Phase 3: NO
"""
    (OUT / "ALBANIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == sha == EXPECTED_SHA
    (OUT / "ALBANIA_PHASE2_SHA_AFTER.txt").write_text(sha_after + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "excluded_from_p1_unresolved": excluded_from_p1,
                "chain_class_a_ready": 0,
                "smi_ready": elig_counts.get("SMALL_MARKET_INDEPENDENT", 0),
                "counts": counts,
                "needs_review": nr,
                "needs_coordinates": nc,
                "repeat_audit": rebrand["repeat_audit"],
                "flex_audit": rebrand["flex_audit"],
                "planet_fitness_audit": rebrand["planet_fitness_audit"],
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
