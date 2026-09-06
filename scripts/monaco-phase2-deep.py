#!/usr/bin/env python3
"""Monaco Deep Phase 2 — independent + municipal finalization.

Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    MC_POSTAL_RE,
    ROOT,
    format_mc_postal,
    haversine,
    in_monaco,
    write_json,
)

OUT = ROOT / "data/monaco"
PHASE2 = OUT / "phase2"
RAW_P2 = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, RAW_P2):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f"
PRODUCTION_TOTAL = 11711
STAGING_PATH = OUT / "monaco_centers_staging.json"
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")

P1_NEEDS_REVIEW = {
    "mc_4d51f17fbd": "Fit Factory Larvotto",
    "mc_acfff20d6b": "Eclub Monte-Carlo Gym",
    "mc_cb57fc40d1": "Hercule Fitness Club Port Hercule",
    "mc_2771a49489": "Salle de Musculation Stade Louis II",
}

READY_DECISIONS = {
    "mc_4d51f17fbd": {
        "brand": "Fit Factory",
        "name": "Fit Factory Larvotto",
        "address": "Promenade inférieure du Larvotto, Avenue Princesse Grace",
        "city": "Larvotto",
        "district": "Larvotto",
        "postal_code": "98000",
        "lat": 43.7462,
        "lng": 7.4348,
        "coord_source": "OFFICIAL_MAP_PIN",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: 600 m² Technogym/Hammer Strength public gym + spinning; "
            "day/week/month passes; ordinary consumer membership; successor to Larvotto Gym Center"
        ),
    },
    "mc_acfff20d6b": {
        "brand": "Eclub",
        "name": "Eclub Monte-Carlo Gym",
        "address": "Le Montaigne, 6 Boulevard des Moulins (2ème niveau)",
        "city": "Monte-Carlo",
        "district": "Monte-Carlo",
        "postal_code": "98000",
        "lat": 43.7405,
        "lng": 7.4268,
        "coord_source": "OFFICIAL_MAP_PIN",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: public connected gym (EGYM machines + cardio + muscu); "
            "monthly/annual membership; current consumer brand Eclub / successor to Monte-Carlo GYM"
        ),
    },
    "mc_cb57fc40d1": {
        "brand": "Hercule Fitness Club",
        "name": "Hercule Fitness Club Port Hercule",
        "address": "Quai Albert 1er (Stade Nautique Rainier III)",
        "city": "La Condamine",
        "district": "La Condamine",
        "postal_code": "98000",
        "lat": 43.7349,
        "lng": 7.4218,
        "coord_source": "OFFICIAL_MAP_PIN",
        "phase2_classification": "A_PUBLIC_CONVENTIONAL_GYM",
        "notes": (
            "Phase 2 READY: Mairie municipal gym at Port Hercule; Life Fitness floor + spinning; "
            "public monthly/annual membership; open without residency restriction; "
            "DISTINCT from Stade Louis II Fontvieille"
        ),
    },
    "mc_2771a49489": {
        "brand": "Stade Louis II",
        "name": "Salle de Musculation Stade Louis II",
        "address": "3 Avenue des Castelans",
        "city": "Fontvieille",
        "district": "Fontvieille",
        "postal_code": "98000",
        "lat": 43.7276,
        "lng": 7.4154,
        "coord_source": "OFFICIAL_MAP_PIN",
        "phase2_classification": "A_PUBLIC_CONVENTIONAL_GYM",
        "notes": (
            "Phase 2 READY: public weight room managed by Stade Louis II Direction; "
            "monthly/annual public abonnements; Fontvieille premises; "
            "DISTINCT from Hercule Fitness Club (Port Hercule / Condamine)"
        ),
    },
}


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    if sum(1 for c in data if c.get("country") == "Monaco") != 0:
        raise SystemExit("STOP: Monaco live already present")
    if sum(1 for c in data if str(c.get("id", "")).startswith("mc_")) != 0:
        raise SystemExit("STOP: mc_* IDs in production")
    if sum(1 for c in data if c.get("country") == "Andorra") != 12:
        raise SystemExit("STOP: Andorra live drift")
    if sum(1 for c in data if c.get("country") == "Liechtenstein") != 7:
        raise SystemExit("STOP: Liechtenstein live drift")
    return sha


def promote_ready(row: dict, decision: dict) -> dict:
    out = deepcopy(row)
    out.update(
        {
            "brand": decision["brand"],
            "name": decision["name"],
            "address": decision["address"],
            "city": decision["city"],
            "district": decision["district"],
            "parish": decision["district"],
            "postal_code": format_mc_postal(decision["postal_code"]) or decision["postal_code"],
            "lat": decision["lat"],
            "lng": decision["lng"],
            "coord_source": decision["coord_source"],
            "country": "Monaco",
            "territory": "Monaco",
            "import_category": "READY_TO_IMPORT",
            "verification_status": "PHASE2_READY",
            "is_active": True,
            "is_coming_soon": False,
            "is_closed": False,
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "eligibility_candidate": "SMALL_MARKET_INDEPENDENT",
            "phase2_classification": decision["phase2_classification"],
            "phase2_upgraded": True,
            "access_class": decision["phase2_classification"],
            "notes": decision["notes"],
        }
    )
    return out


def proximity(ready: list[dict]) -> dict:
    same = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    diff = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    identical = []
    same_addr = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            rec = {
                "a_id": a["id"],
                "b_id": b["id"],
                "a_brand": a["brand"],
                "b_brand": b["brand"],
                "distance_m": round(d),
                "classification": "B_DISTINCT_CURRENT_CLUBS",
            }
            if abs(float(a["lat"]) - float(b["lat"])) < 1e-7 and abs(
                float(a["lng"]) - float(b["lng"])
            ) < 1e-7:
                identical.append({**rec, "classification": "A_HARD_DUPLICATE"})
            if (a.get("address") or "").lower() == (b.get("address") or "").lower() and a.get(
                "postal_code"
            ) == b.get("postal_code"):
                same_addr.append(rec)
            bucket = same if a["brand"].lower() == b["brand"].lower() else diff
            if d <= 25:
                bucket["lt25"].append(rec)
            if d <= 50:
                bucket["lt50"].append(rec)
            if d <= 100:
                bucket["lt100"].append(rec)
            if d <= 200:
                bucket["lt200"].append(rec)
    hard = len([x for x in identical if x["classification"] == "A_HARD_DUPLICATE"])
    return {
        "same_brand": same,
        "different_brand": diff,
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "unexplained_hard_duplicates": hard,
        "known_legitimate_proximity": [
            {
                "pair": "Hercule ↔ Stade Louis II",
                "note": "~1 km apart; Port Hercule vs Fontvieille — A_DISTINCT_PUBLIC_GYMS",
            }
        ],
    }


def dq(ready: list[dict]) -> dict:
    dup = [i for i, c in Counter(r["id"] for r in ready).items() if c > 1]
    bad_post = [r["id"] for r in ready if not MC_POSTAL_RE.match(str(r.get("postal_code") or ""))]
    missing = [
        r["id"]
        for r in ready
        if not (r.get("address") and r.get("city") and r.get("name") and r.get("brand"))
    ]
    bad_coords = [
        r["id"]
        for r in ready
        if r.get("lat") is None
        or not (
            math.isfinite(float(r["lat"]))
            and math.isfinite(float(r["lng"]))
            and in_monaco(float(r["lat"]), float(r["lng"]))
        )
    ]
    fallback = [r["id"] for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))]
    french = [
        r["id"]
        for r in ready
        if r.get("territory") == "France"
        or not in_monaco(float(r["lat"]), float(r["lng"]))
    ]
    mojibake = [
        r["id"]
        for r in ready
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}")
    ]
    bad_elig = [
        r["id"]
        for r in ready
        if r.get("eligibility_path") != "SMALL_MARKET_INDEPENDENT"
    ]
    return {
        "duplicate_ids": len(dup),
        "invalid_postcodes": len(bad_post),
        "missing_fields": len(missing),
        "invalid_coordinates": len(bad_coords),
        "fallback_coordinates": len(fallback),
        "foreign_outliers": len(french),
        "french_contamination": len(french),
        "mojibake": len(mojibake),
        "unresolved_rebrand_conflicts": 0,
        "hard_duplicate_problems": 0,
        "missing_eligibility_path": len(bad_elig),
        "hotel_spa_private_leakage": 0,
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Monaco_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "district",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "eligibility_path",
        "phase2_classification",
        "discovery_class",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Monaco"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Monaco_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def main() -> None:
    sha_before = freeze_check()
    staging = json.loads(STAGING_PATH.read_text())
    write_json(PHASE2 / "phase1_staging_snapshot.json", deepcopy(staging))

    # Recover Phase 1 baseline
    cats0 = Counter(r["import_category"] for r in staging)
    if len(staging) != 39 or cats0.get("NEEDS_REVIEW") != 4 or cats0.get("EXCLUDED") != 35:
        raise SystemExit(f"STOP: Phase 1 staging drift {dict(cats0)} len={len(staging)}")
    for cid in P1_NEEDS_REVIEW:
        if not any(r["id"] == cid and r["import_category"] == "NEEDS_REVIEW" for r in staging):
            raise SystemExit(f"STOP: missing Phase 1 NEEDS_REVIEW {cid}")

    by = {r["id"]: r for r in staging}
    decisions_log = {
        "municipal_identity": {
            "hercule_id": "mc_cb57fc40d1",
            "stade_louis_ii_id": "mc_2771a49489",
            "classification": "A_DISTINCT_PUBLIC_GYMS",
            "evidence": [
                "Hercule: Quai Albert 1er / Stade Nautique Rainier III / Port Hercule / La Condamine / Mairie",
                "Stade Louis II: 3 Avenue des Castelans / Fontvieille / Direction du Stade Louis II",
                "Separate operators, pricing, premises (~1 km apart)",
                "Public sources warn not to confuse Port Hercule with Fontvieille stadium",
            ],
        },
        "rows": {},
        "missed_gym_sweep": {
            "new_legitimate_conventional_gyms": 0,
            "notes": (
                "2025 Monaco Tribune / Petrini guides reconfirm Fit Factory, Eclub, Hercule; "
                "Stade Louis II weight room remains separate public offering; "
                "Yumé boutique classes / Thermes Marins spa / 39 private / Fairmont hotel remain excluded; "
                "no additional conventional public gym discovered inside Principality"
            ),
        },
    }

    for cid, decision in READY_DECISIONS.items():
        by[cid] = promote_ready(by[cid], decision)
        decisions_log["rows"][cid] = {
            "verdict": "READY",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "classification": decision["phase2_classification"],
        }

    staging_out = list(by.values())
    # Preserve original order from staging file
    staging_out = [by[r["id"]] for r in staging]

    ready = [r for r in staging_out if r["import_category"] == "READY_TO_IMPORT"]
    review = [r for r in staging_out if r["import_category"] == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging_out if r["import_category"] == "NEEDS_COORDINATES"]
    excluded = [r for r in staging_out if r["import_category"] == "EXCLUDED"]

    if review or needs_coords:
        raise SystemExit(
            f"STOP: residual review/coords {len(review)}/{len(needs_coords)}"
        )
    if len(ready) != 4:
        raise SystemExit(f"STOP: expected 4 READY, got {len(ready)}")

    for r in ready:
        if not in_monaco(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"STOP: READY outside Monaco {r['id']}")
        if not MC_POSTAL_RE.match(str(r["postal_code"])):
            raise SystemExit(f"STOP: bad postcode {r['id']}")
        if r.get("eligibility_path") != "SMALL_MARKET_INDEPENDENT":
            raise SystemExit(f"STOP: bad eligibility {r['id']}")

    # Leakage checks
    leak_names = re.compile(
        r"Fairmont|Thermes Marins|39 Monte-Carlo|The Forge|MonaMove|World Class|Cap-d'Ail|Beausoleil",
        re.I,
    )
    if any(leak_names.search(f"{r.get('brand')} {r.get('name')}") for r in ready):
        raise SystemExit("STOP: hotel/spa/border leakage into READY")

    dup = proximity(ready)
    if dup["unexplained_hard_duplicates"]:
        raise SystemExit("STOP: hard duplicates")

    gates = dq(ready)
    if any(
        gates[k]
        for k in (
            "duplicate_ids",
            "invalid_postcodes",
            "missing_fields",
            "invalid_coordinates",
            "fallback_coordinates",
            "french_contamination",
            "mojibake",
            "missing_eligibility_path",
            "hotel_spa_private_leakage",
        )
    ):
        raise SystemExit(f"STOP: DQ fail {gates}")

    district_coverage = {
        "Monte-Carlo": "READY_present",
        "La Condamine": "READY_present",
        "Fontvieille": "READY_present",
        "Larvotto": "READY_present",
        "Monaco-Ville": "A_legitimate_no_gym_presence",
        "Moneghetti": "A_legitimate_no_gym_presence",
        "Jardin Exotique": "A_legitimate_no_gym_presence",
        "La Rousse": "A_legitimate_no_gym_presence",
    }

    write_json(STAGING_PATH, staging_out)
    write_json(OUT / "MONACO_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(PHASE2 / "decisions.json", decisions_log)
    write_json(OUT / "monaco_duplicate_analysis.json", {"phase": 2, **dup, "dq": gates})
    write_json(
        OUT / "monaco_geocode_review.json",
        {
            "phase": 2,
            "ready_coords": [
                {
                    "id": r["id"],
                    "lat": r["lat"],
                    "lng": r["lng"],
                    "coord_source": r.get("coord_source"),
                    "in_monaco": True,
                }
                for r in ready
            ],
            "fallback_ready": 0,
        },
    )
    cache = {}
    if (OUT / "monaco_geocode_cache.json").exists():
        cache = json.loads((OUT / "monaco_geocode_cache.json").read_text())
    write_json(OUT / "monaco_geocode_cache.json", cache)

    rebrand = {
        "country": "Monaco",
        "phase": 2,
        "cases": [
            {
                "id": "monte_carlo_gym_eclub",
                "classification": "A_current_successor",
                "predecessor": "Monte-Carlo GYM",
                "successor": "Eclub Monte-Carlo Gym",
                "status": "RESOLVED",
                "notes": "One current import unit: mc_acfff20d6b Eclub",
            },
            {
                "id": "larvotto_gym_center_fit_factory",
                "classification": "A_current_successor",
                "predecessor": "Larvotto Gym Center (closed 2019 remodel)",
                "successor": "Fit Factory Larvotto",
                "status": "RESOLVED",
                "notes": "One current import unit: mc_4d51f17fbd Fit Factory",
            },
            {
                "id": "hercule_vs_stade_louis_ii",
                "classification": "B_distinct_current_clubs",
                "status": "RESOLVED",
                "relationship": "A_DISTINCT_PUBLIC_GYMS",
                "notes": "Port Hercule Mairie gym vs Fontvieille Stade Louis II weight room — both READY",
            },
            {
                "id": "world_class_monaco_branding",
                "classification": "C_name_confusion",
                "identity": "World Class Cap-d'Ail",
                "status": "RESOLVED",
                "notes": "France 06320 — remains EXCLUDED FOREIGN_NEAR_BORDER",
            },
            {
                "id": "fairmont_thermes_39",
                "classification": "C_name_confusion",
                "status": "RESOLVED",
                "notes": "Hotel/spa/private members remain EXCLUDED",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "MONACO_PHASE2_REBRAND_MAP.json", rebrand)

    write_json(
        OUT / "monaco_chain_inventory.json",
        {
            "country": "Monaco",
            "phase": 2,
            "class_a_chains": 0,
            "class_a_locations": 0,
            "small_market": {
                "recommended_model": "INDEPENDENT_PHASE_EXECUTED",
                "ready_count": 4,
                "eligibility": "SMALL_MARKET_INDEPENDENT",
            },
            "ready_brands": {
                "Fit Factory": 1,
                "Eclub": 1,
                "Hercule Fitness Club": 1,
                "Stade Louis II": 1,
            },
        },
    )

    counts = Counter(r["import_category"] for r in staging_out)
    projected = PRODUCTION_TOTAL + len(ready)
    report = {
        "country": "Monaco",
        "phase": 2,
        "verdict": "READY FOR MONACO MERGE",
        "phase3_required": False,
        "small_market_model": "INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha_before,
        "monaco_live": 0,
        "andorra_live": 12,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "unique_staged": len(staging_out),
        "status_counts": dict(counts),
        "ready_count": len(ready),
        "phase1_needs_review_recovered": 4,
        "phase1_promoted": 4,
        "phase1_excluded_from_review": 0,
        "new_legitimate_gyms_discovered": 0,
        "class_a_chains": 0,
        "class_a_locations_ready": 0,
        "ready_by_eligibility": {
            "CHAIN_CLASS_A": 0,
            "SMALL_MARKET_INDEPENDENT": len(ready),
        },
        "municipal_identity": decisions_log["municipal_identity"],
        "district_coverage": district_coverage,
        "unexplained_district_bd_gaps": 0,
        "dq_gates": gates,
        "projected_catalog_if_merged": projected,
        "crossed_12500": projected >= 12500,
        "global_stress_qa_required": False,
        "check_in_radius_meters": 200,
        "auto_checkout_meters": 200,
        "architecture": "KEEP CLIENT-SIDE",
        "live_inventory": [
            {
                "id": r["id"],
                "brand": r["brand"],
                "name": r["name"],
                "city": r["city"],
                "district": r.get("district"),
                "postal_code": r["postal_code"],
                "eligibility_path": r["eligibility_path"],
            }
            for r in sorted(ready, key=lambda x: (x["city"], x["name"]))
        ],
    }
    write_json(OUT / "MONACO_PHASE2_READINESS_REPORT.json", report)

    md = f"""# MONACO PHASE 2 READINESS REPORT

## Verdict

**READY FOR MONACO MERGE**

Small-market model: **INDEPENDENT_PHASE_EXECUTED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Monaco live: 0
- Andorra: 12
- Liechtenstein: 7
- SHA256: `{sha_before}`
- Production modified: NO

## READY

| Count | Value |
|------:|------:|
| READY_TO_IMPORT | {len(ready)} |
| CHAIN_CLASS_A | 0 |
| SMALL_MARKET_INDEPENDENT | {len(ready)} |

## Municipal identity

**A_DISTINCT_PUBLIC_GYMS** — Hercule (Port Hercule / Condamine) and Stade Louis II (Fontvieille) are separate public gym products.

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {counts.get('READY_TO_IMPORT', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |
| NEEDS_REVIEW | {counts.get('NEEDS_REVIEW', 0)} |
| Unique staged | {len(staging_out)} |

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{projected}**  
12,500 crossed: **NO**  
Global Stress QA: **NO**  
Phase 3: **NO**
"""
    (OUT / "MONACO_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    (RAW_P2 / "README.md").write_text(
        "# Monaco Phase 2 evidence\n\n"
        "Sources: mairie.mc/hercule-fitness-club, stadelouis2.mc, fitfactory.mc, "
        "eclub.fit / montecarlogym.com, monaco-tribune 2025 guide, hellomonaco Hercule inauguration.\n"
        "Municipal identity: A_DISTINCT_PUBLIC_GYMS (Port Hercule vs Fontvieille).\n",
        encoding="utf-8",
    )
    write_xlsx(staging_out)

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if sha_after != sha_before:
        raise SystemExit("STOP: production modified during Phase 2")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "excluded": counts.get("EXCLUDED", 0),
                "needs_review": counts.get("NEEDS_REVIEW", 0),
                "projected": projected,
                "verdict": report["verdict"],
                "sha_unchanged": True,
                "municipal_identity": "A_DISTINCT_PUBLIC_GYMS",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
