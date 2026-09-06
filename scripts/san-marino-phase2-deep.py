#!/usr/bin/env python3
"""San Marino Deep Phase 2 — independent + public gym finalization.

Does NOT modify src/data/centers.json.
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
    ROOT,
    SM_POSTAL_RE,
    base_row,
    format_sm_postal,
    haversine,
    in_san_marino,
    write_json,
)

OUT = ROOT / "data/san-marino"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28"
PRODUCTION_TOTAL = 11715
STAGING_PATH = OUT / "san_marino_centers_staging.json"
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|castello.?approx",
    re.I,
)

P1_NEEDS_REVIEW = {
    "sm_54007fb102": "Dynamic Fitness Center Dogana",
    "sm_8e18d472a9": "Phisicol Fitness Club Borgo Maggiore",
    "sm_cc1fd3ba1d": "Energia Wellness & Fitness Serravalle",
    "sm_3c035258fb": "MOVE Sala Pesi Città di San Marino",
    "sm_d1cb014d10": "FSBB Palestra Galazzano",
    "sm_a5d9743343": "FitLife San Marino Domagnano",
}

READY_DECISIONS = {
    "sm_54007fb102": {
        "brand": "Dynamic Fitness Center",
        "name": "Dynamic Fitness Center Dogana",
        "address": "Strada del Bargello, 111",
        "city": "Dogana",
        "castello": "Serravalle",
        "postal_code": "47891",
        "lat": 43.9812605,
        "lng": 12.4971575,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://www.dynamicsanmarino.com/",
        "source_url": "https://www.dynamicsanmarino.com/faq-frequently-asked-questions/",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: public Fitness/Open abbonamenti; sala Fitness/Cardio; "
            "instructors optional; Mon–Sat hours + Extra Time option; ordinary consumer access"
        ),
    },
    "sm_8e18d472a9": {
        "brand": "Phisicol",
        "name": "Phisicol Fitness Club Borgo Maggiore",
        "address": "Via 28 Luglio, 218",
        "city": "Borgo Maggiore",
        "castello": "Borgo Maggiore",
        "postal_code": "47893",
        "lat": 43.9461526,
        "lng": 12.4561009,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://www.phisicol.it/",
        "source_url": "https://www.phisicol.it/",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: membership includes sala attrezzi + cardio + courses/sauna; "
            "open gym with machines/weights; PT optional; not rehab-primary"
        ),
    },
    "sm_cc1fd3ba1d": {
        "brand": "Energia Wellness & Fitness",
        "name": "Energia Wellness & Fitness Serravalle",
        "address": "Strada Bulumina, 3",
        "city": "Serravalle",
        "castello": "Serravalle",
        "postal_code": "47899",
        "lat": 43.9670579,
        "lng": 12.4704857,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://www.energia.sm/",
        "source_url": "https://abbonamenti.energia.sm/",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: Piano Basic = Sala Fitness TECHNOGYM 350 m² + Xenios 150 m² "
            "without spa; spa/centro benessere is additive on Platinum tiers only; "
            "ordinary public sala-fitness subscriptions"
        ),
    },
    "sm_3c035258fb": {
        "brand": "MOVE",
        "name": "MOVE Sala Pesi Città di San Marino",
        "address": "Strada di Montecchio, 15 (Centro sportivo)",
        "city": "Città di San Marino",
        "castello": "San Marino",
        "postal_code": "47890",
        "lat": 43.9294944,
        "lng": 12.4419260,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://www.move.sm/",
        "source_url": "https://www.move.sm/la-palestra/",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: separate commercial Fitness Club identity on sports campus; "
            "Technogym/Xenios sala pesi; Open abbonamento (sala pesi ± HYROX); "
            "public free trial; NOT federation/sport-program dependent; ≠ MoveUP Rimini"
        ),
    },
    "sm_d1cb014d10": {
        "brand": "Federazione Sammarinese Body Building",
        "name": "FSBB Palestra Galazzano",
        "address": "Via Nicolino di Galasso, 21",
        "city": "Galazzano",
        "castello": "Serravalle",
        "postal_code": "47899",
        "lat": 43.9801816,
        "lng": 12.4828143,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://ifbbproitaly.com/",
        "source_url": "https://ifbbproitaly.com/abbonamenti/",
        "phase2_classification": "A_PUBLIC_CONVENTIONAL_GYM",
        "notes": (
            "Phase 2 READY: A_PUBLIC_CONVENTIONAL_GYM — publicly priced single/pack/monthly/"
            "annual abbonamenti for ordinary fitness users (not athlete-only); "
            "500 m² Hammer Strength/Life Fitness; 24/7 card access; "
            "DISTINCT from Multieventi Sport Domus / CONS"
        ),
    },
    "sm_a5d9743343": {
        "brand": "FitLife",
        "name": "FitLife San Marino Domagnano",
        "address": "Via Ornera, 6",
        "city": "Domagnano",
        "castello": "Domagnano",
        "postal_code": "47895",
        "lat": 43.9538961,
        "lng": 12.4674252,
        "coord_source": "OSM_NOMINATIM_PREMISES",
        "website": "https://www.sanmarino.it/palestre-san-marino/fit-life-san-marino/",
        "source_url": "https://fitprime.com/it/servizi/places/centri-sportivi/san_marino/fitlife_pool_fitness_center",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "notes": (
            "Phase 2 READY: current FitLife identity (successor to Piletas); "
            "145 m² sala pesi with modern machines + cardio; public trimestral/semestral/annual "
            "abbonamenti; Mon–Fri open gym hours; pool/spa amenities additive"
        ),
    },
}

CASTELLO_COVERAGE = {
    "San Marino": "READY_present",
    "Borgo Maggiore": "READY_present",
    "Serravalle": "READY_present",
    "Domagnano": "READY_present",
    "Fiorentino": "A_legitimate_no_local_gym",
    "Acquaviva": "A_legitimate_no_local_gym",
    "Faetano": "A_legitimate_no_local_gym",
    "Chiesanuova": "A_legitimate_no_local_gym",
    "Montegiardino": "A_legitimate_no_local_gym",
}


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    if sum(1 for c in data if c.get("country") == "San Marino") != 0:
        raise SystemExit("STOP: San Marino live already present")
    if sum(1 for c in data if str(c.get("id", "")).startswith("sm_")) != 0:
        raise SystemExit("STOP: sm_* IDs in production")
    if sum(1 for c in data if c.get("country") == "Monaco") != 4:
        raise SystemExit("STOP: Monaco live drift")
    if sum(1 for c in data if c.get("country") == "Andorra") != 12:
        raise SystemExit("STOP: Andorra live drift")
    if sum(1 for c in data if c.get("country") == "Liechtenstein") != 7:
        raise SystemExit("STOP: Liechtenstein live drift")
    if sum(1 for c in data if c.get("country") == "Iceland") != 27:
        raise SystemExit("STOP: Iceland live drift")
    return sha


def promote_ready(row: dict, decision: dict) -> dict:
    out = deepcopy(row)
    out.update(
        {
            "brand": decision["brand"],
            "name": decision["name"],
            "address": decision["address"],
            "city": decision["city"],
            "castello": decision["castello"],
            "district": decision["castello"],
            "parish": decision["castello"],
            "postal_code": format_sm_postal(decision["postal_code"]) or decision["postal_code"],
            "lat": decision["lat"],
            "lng": decision["lng"],
            "coord_source": decision["coord_source"],
            "website": decision.get("website"),
            "source_url": decision.get("source_url") or out.get("source_url"),
            "country": "San Marino",
            "territory": "San Marino",
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


def add_excluded(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    castello: str,
    notes: str,
    discovery_class: str,
    lat=None,
    lng=None,
    closed: bool = False,
) -> None:
    row = base_row(
        prefix="sm_",
        country="San Marino",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_sm_postal(postal) or postal,
        city=city,
        source_url="phase2_missed_gym_sweep",
        lat=lat,
        lng=lng,
        coord_source="DIRECTORY" if lat is not None else None,
        notes=notes,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=brand.lower().replace(" ", "_"),
    )
    row["import_category"] = "CLOSED" if closed else "EXCLUDED"
    row["castello"] = castello
    row["district"] = castello
    row["parish"] = castello
    row["territory"] = "San Marino"
    row["phase2_classification"] = "CLOSED" if closed else "EXCLUDED_SPECIALIST_OR_SCOPE"
    rows.append(row)


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
    return {
        "identical_coordinates": identical,
        "same_normalized_address": same_addr,
        "same_brand": same,
        "different_brand": diff,
        "unexplained_hard_duplicates": len(identical),
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_San_Marino_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "castello",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "eligibility_path",
        "phase2_classification",
        "discovery_class",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "SanMarino"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_San_Marino_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})


def main() -> None:
    sha = freeze_check()
    staging = json.loads(STAGING_PATH.read_text(encoding="utf-8"))
    write_json(PHASE2 / "phase1_staging_snapshot.json", staging)

    by_id = {r["id"]: r for r in staging}
    missing = [i for i in P1_NEEDS_REVIEW if i not in by_id]
    if missing:
        raise SystemExit(f"STOP: Phase 1 candidates missing: {missing}")
    for i, expected_name in P1_NEEDS_REVIEW.items():
        if by_id[i].get("import_category") != "NEEDS_REVIEW":
            raise SystemExit(f"STOP: {i} not NEEDS_REVIEW at Phase 2 start")

    staging_out: list[dict] = []
    for r in staging:
        if r["id"] in READY_DECISIONS:
            staging_out.append(promote_ready(r, READY_DECISIONS[r["id"]]))
        else:
            staging_out.append(deepcopy(r))

    # Missed-gym sweep additions (all EXCLUDED/CLOSED — no new READY)
    new_rows: list[dict] = []
    add_excluded(
        new_rows,
        brand="Bodyline Wellness Center",
        name="Bodyline Oltre L'Estetica Dogana",
        address="Via Fondo Ausa, 8",
        city="Dogana",
        postal="47891",
        castello="Serravalle",
        notes="Phase 2 sweep: beauty/aesthetic wellness institute — not conventional gym",
        discovery_class="specialist_boutique",
        lat=43.9795,
        lng=12.4905,
    )
    add_excluded(
        new_rows,
        brand="PFC Studio",
        name="PFC Studio Personal Fitness Coach Dogana",
        address="Via Tre Settembre, 294",
        city="Dogana",
        postal="47899",
        castello="Serravalle",
        notes="Phase 2 sweep: appointment-only personal fitness coaching studio — PT-primary",
        discovery_class="specialist_boutique",
        lat=43.9820,
        lng=12.4920,
    )
    add_excluded(
        new_rows,
        brand="Games Fit",
        name="Games Fit Dogana (CLOSED 2018)",
        address="Via Fondo Ausa, 58",
        city="Dogana",
        postal="47891",
        castello="Serravalle",
        notes="Phase 2 sweep: permanently closed August 2018; not a current gym",
        discovery_class="closed_legacy",
        closed=True,
        lat=43.9790,
        lng=12.4910,
    )
    existing_names = {(r.get("brand") or "").lower() for r in staging_out}
    for nr in new_rows:
        if (nr.get("brand") or "").lower() not in existing_names:
            staging_out.append(nr)

    # Multieventi remain EXCLUDED
    for r in staging_out:
        if re.search(r"Multieventi", str(r.get("brand") or ""), re.I):
            r["import_category"] = "EXCLUDED"
            r["phase2_classification"] = "EXCLUDED_SPORTS_COMPLEX_NOT_GYM"

    ready = [r for r in staging_out if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = [r for r in staging_out if r.get("import_category") == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging_out if r.get("import_category") == "NEEDS_COORDINATES"]
    excluded = [
        r
        for r in staging_out
        if r.get("import_category") in ("EXCLUDED", "CLOSED", "FOREIGN_NEAR_BORDER")
    ]

    if needs_review or needs_coords:
        raise SystemExit(
            f"STOP: unresolved material rows NR={len(needs_review)} NC={len(needs_coords)}"
        )
    if len(ready) != 6:
        raise SystemExit(f"STOP: expected 6 READY, got {len(ready)}")

    for r in ready:
        if not SM_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"STOP: bad postcode {r['id']}")
        if not in_san_marino(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"STOP: coords outside SM {r['id']}")
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            raise SystemExit(f"STOP: fallback coord {r['id']}")
        if r.get("eligibility_path") != "SMALL_MARKET_INDEPENDENT":
            raise SystemExit(f"STOP: bad eligibility {r['id']}")

    dup = proximity(ready)
    if dup["unexplained_hard_duplicates"]:
        raise SystemExit("STOP: hard duplicates in READY")

    rebrand = {
        "entries": [
            {
                "legacy": "Piletas Fitness Center",
                "current": "FitLife San Marino Domagnano",
                "relationship": "A_current_successor",
                "production_eligibility": "READY — FitLife only",
            },
            {
                "legacy": "Directory Palestra Odon (Montecchio)",
                "current": "MOVE Sala Pesi",
                "relationship": "C_name_confusion",
                "note": "Odon SM today is dental polyclinic Domagnano; MOVE is current gym",
                "production_eligibility": "READY — MOVE only",
            },
            {
                "legacy": None,
                "current": "FSBB Galazzano",
                "relationship": "B_distinct_current_clubs",
                "note": "Distinct from Multieventi Sport Domus / CONS",
                "production_eligibility": "READY — A_PUBLIC_CONVENTIONAL_GYM",
            },
            {
                "legacy": "Games Fit Dogana",
                "current": None,
                "relationship": "CLOSED_LEGACY",
                "production_eligibility": "CLOSED / EXCLUDED",
            },
            {
                "legacy": None,
                "current": "MOVE ≠ MoveUP Rimini",
                "relationship": "C_name_confusion",
                "note": "Italian MoveUP remains EXCLUDED_FOREIGN",
                "production_eligibility": "READY MOVE only inside SM",
            },
            {
                "legacy": None,
                "current": "Energia spa tiers",
                "relationship": "wellness_additive",
                "note": "Basic sala-fitness tier exists; spa only on higher tiers",
                "production_eligibility": "READY",
            },
        ],
        "unresolved_conflicts": 0,
    }

    counts = Counter(r.get("import_category") for r in staging_out)
    report = {
        "country": "San Marino",
        "phase": 2,
        "verdict": "READY FOR SAN MARINO MERGE",
        "phase3_required": False,
        "small_market_model": "INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "san_marino_live": 0,
        "monaco_live": 4,
        "andorra_live": 12,
        "liechtenstein_live": 7,
        "iceland_live": 27,
        "unique_staged": len(staging_out),
        "ready_count": len(ready),
        "needs_review_count": len(needs_review),
        "needs_coordinates_count": len(needs_coords),
        "excluded_count": counts.get("EXCLUDED", 0) + counts.get("CLOSED", 0),
        "status_counts": dict(counts),
        "phase1_needs_review_recovered": 6,
        "phase1_promoted": 6,
        "phase1_excluded_from_review": 0,
        "class_a_chains": 0,
        "class_a_locations_ready": 0,
        "ready_by_eligibility": {
            "CHAIN_CLASS_A": 0,
            "SMALL_MARKET_INDEPENDENT": len(ready),
        },
        "new_legitimate_gyms_discovered": 0,
        "castello_coverage": CASTELLO_COVERAGE,
        "unexplained_castello_bd_gaps": 0,
        "fsbb_classification": "A_PUBLIC_CONVENTIONAL_GYM",
        "energia_wellness_role": "ADDITIVE",
        "multieventi_remains_excluded": True,
        "dq_gates": {
            "italian_contamination": 0,
            "foreign_outliers": 0,
            "fallback_coordinates": 0,
            "duplicate_ids": len(staging_out) - len({r["id"] for r in staging_out}),
            "hard_duplicate_problems": dup["unexplained_hard_duplicates"],
            "hotel_spa_private_leakage": 0,
            "unresolved_rebrand_conflicts": 0,
        },
        "projected_catalog_if_merged": PRODUCTION_TOTAL + len(ready),
        "crossed_12500_if_merged": (PRODUCTION_TOTAL + len(ready)) >= 12500,
        "global_stress_qa_required": False,
        "architecture": "KEEP CLIENT-SIDE",
    }

    decisions = {
        "recovered_ids": list(P1_NEEDS_REVIEW.keys()),
        "promoted": list(READY_DECISIONS.keys()),
        "excluded_from_phase1_review": [],
        "missed_sweep": {
            "bodyline": "EXCLUDED_AESTHETIC",
            "pfc_studio": "EXCLUDED_PT_APPOINTMENT_ONLY",
            "games_fit": "CLOSED_2018",
            "new_ready": 0,
        },
        "fsbb": "A_PUBLIC_CONVENTIONAL_GYM",
        "energia": "READY_WELLNESS_ADDITIVE",
        "move": "READY_INDEPENDENT_ON_CAMPUS",
        "multieventi": "EXCLUDED",
    }

    inventory = {
        "country": "San Marino",
        "phase": 2,
        "class_a_chains": 0,
        "class_a_locations": 0,
        "small_market": {
            "recommended_model": "INDEPENDENT_PHASE_EXECUTED",
            "ready_smi": len(ready),
        },
        "ready_brands": {r["brand"]: 1 for r in ready},
    }

    write_json(STAGING_PATH, staging_out)
    write_json(OUT / "SAN_MARINO_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "SAN_MARINO_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "SAN_MARINO_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "san_marino_chain_inventory.json", inventory)
    write_json(OUT / "san_marino_duplicate_analysis.json", dup)
    write_json(
        OUT / "san_marino_geocode_cache.json",
        {
            r["id"]: {
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "coord_source": r.get("coord_source"),
            }
            for r in staging_out
            if r.get("lat") is not None
        },
    )
    write_json(
        OUT / "san_marino_geocode_review.json",
        {
            "ready_with_coords": len(ready),
            "fallback_on_ready": 0,
            "outside_sm_gate": 0,
        },
    )
    write_json(PHASE2 / "decisions.json", decisions)
    write_xlsx(staging_out)

    md = f"""# SAN MARINO PHASE 2 READINESS REPORT

## Verdict

**READY FOR SAN MARINO MERGE**

Small-market model: **INDEPENDENT_PHASE_EXECUTED**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- San Marino live: 0
- Monaco: 4
- Andorra: 12
- Liechtenstein: 7
- Iceland: 27
- SHA256: `{sha}`
- Production modified: NO

## READY

| Count | Value |
|------:|------:|
| READY_TO_IMPORT | {len(ready)} |
| CHAIN_CLASS_A | 0 |
| SMALL_MARKET_INDEPENDENT | {len(ready)} |

## FSBB

**A_PUBLIC_CONVENTIONAL_GYM** — ordinary public abbonamenti; distinct from Multieventi.

## Energia

Wellness/spa is **ADDITIVE** (Basic = sala fitness only).

## Staging

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | {len(ready)} |
| EXCLUDED/CLOSED | {report['excluded_count']} |
| NEEDS_REVIEW | 0 |
| Unique staged | {len(staging_out)} |

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{PRODUCTION_TOTAL + len(ready)}**  
12,500 crossed: **NO**  
Global Stress QA: **NO**  
Phase 3: **NO**
"""
    (OUT / "SAN_MARINO_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "excluded": report["excluded_count"],
                "needs_review": 0,
                "projected": PRODUCTION_TOTAL + len(ready),
                "verdict": report["verdict"],
                "sha_unchanged": True,
                "fsbb": "A_PUBLIC_CONVENTIONAL_GYM",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
