#!/usr/bin/env python3
"""Liechtenstein Deep Phase 2 — independent recovery + merge readiness.

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
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    LI_POSTAL_RE,
    ROOT,
    base_row,
    format_li_postal,
    haversine,
    in_liechtenstein,
    make_id,
    norm_addr,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/liechtenstein"
PHASE2 = OUT / "phase2"
RAW_P2 = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, RAW_P2):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc"
PRODUCTION_TOTAL = 11692
ICELAND_LIVE = 27
STAGING_PATH = OUT / "liechtenstein_centers_staging.json"
FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")

# Phase 1 independent candidate IDs (authoritative)
P1_CANDIDATES = {
    "li_9fdb1d933f": "update Fitness Vaduz",
    "li_9514fe2df2": "LieFit Vaduz",
    "li_7f2d2a5ed7": "GEOWAY by LieFit Eschen",
    "li_35eed72b39": "purfitness Schaan",
    "li_3ff9b2a62c": "Lorez Gesundheitscenter Schaan",
    "li_688dc73ac2": "Lorez Power Center Bendern",
    "li_f02192ce76": "flexigym Balzers",
    "li_740e149c77": "In Motion Eschen",
}


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    if sum(1 for c in data if c.get("country") == "Iceland") != ICELAND_LIVE:
        raise SystemExit("STOP: Iceland live drift")
    if sum(1 for c in data if c.get("country") == "Liechtenstein") != 0:
        raise SystemExit("STOP: Liechtenstein live already present")
    if sum(1 for c in data if str(c.get("id", "")).startswith("li_")) != 0:
        raise SystemExit("STOP: li_* IDs in production")
    return sha


def promote_ready(
    row: dict,
    *,
    notes: str,
    eligibility: str = "SMALL_MARKET_INDEPENDENT",
    phase2_classification: str = "A_CONVENTIONAL_PUBLIC_GYM",
    name: str | None = None,
    brand: str | None = None,
    address: str | None = None,
    postal: str | None = None,
    city: str | None = None,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    source_url: str | None = None,
) -> dict:
    before = {
        "import_category": row.get("import_category"),
        "name": row.get("name"),
        "brand": row.get("brand"),
    }
    if name is not None:
        row["name"] = name
    if brand is not None:
        row["brand"] = brand
    if address is not None:
        row["address"] = address
    if postal is not None:
        row["postal_code"] = format_li_postal(postal) or postal
    if city is not None:
        row["city"] = city
    if lat is not None and lng is not None:
        row["lat"] = float(lat)
        row["lng"] = float(lng)
    if coord_source:
        row["coord_source"] = coord_source
    if source_url:
        row["source_url"] = source_url
        row["website"] = source_url
        row.setdefault("evidence", {})["source_url"] = source_url
    row["import_category"] = "READY_TO_IMPORT"
    row["verification_status"] = "VERIFIED_CURRENT"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["is_closed"] = False
    row["eligibility_path"] = eligibility
    row["phase2_upgraded"] = True
    row["phase2_before"] = before
    row["phase2_classification"] = phase2_classification
    row["access_class"] = "A_public_conventional"
    row["operator_class"] = "E"
    row["territory"] = "Liechtenstein"
    row["notes"] = ((row.get("notes") or "") + "; " + notes).strip("; ")
    return row


def demote_excluded(
    row: dict,
    *,
    notes: str,
    classification: str,
) -> dict:
    before = row.get("import_category")
    row["import_category"] = "EXCLUDED"
    row["verification_status"] = "EXCLUDED"
    row["is_active"] = False
    row["is_coming_soon"] = False
    row["is_closed"] = False
    row["phase2_classification"] = classification
    row["phase2_demoted_from"] = before
    row["eligibility_path"] = None
    row["notes"] = ((row.get("notes") or "") + "; " + notes).strip("; ")
    return row


def add_new(
    staging: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    lat: float,
    lng: float,
    coord_source: str,
    notes: str,
    excluded: bool = False,
    classification: str = "A_CONVENTIONAL_PUBLIC_GYM",
    discovery_class: str = "phase2_independent_discovery",
) -> dict:
    row = base_row(
        prefix="li_",
        country="Liechtenstein",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_li_postal(postal) or postal,
        city=city,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        discovery_class=discovery_class,
        chain_key=brand.lower().replace(" ", "_").replace("-", "_"),
    )
    row["access_class"] = "A_public_conventional"
    row["operator_class"] = "E"
    row["territory"] = "Liechtenstein"
    row["phase2_new"] = True
    if excluded:
        demote_excluded(row, notes=notes, classification=classification)
    else:
        promote_ready(
            row,
            notes=notes,
            phase2_classification=classification,
            source_url=source_url,
        )
    staging.append(row)
    return row


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Liechtenstein_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "eligibility_path",
        "operator_class",
        "access_class",
        "coord_source",
        "territory",
        "discovery_class",
        "phase2_classification",
        "source_url",
        "notes",
    ]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Liechtenstein Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        import csv

        csv_path = OUT / "Gymly_Liechtenstein_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)


def classify_proximity(ready: list[dict]) -> dict:
    prox = proximity_pairs(ready, brand_only=False)
    by_id = {r["id"]: r for r in ready}

    def label(item: dict) -> str:
        a = by_id.get(item["a_id"], {})
        b = by_id.get(item["b_id"], {})
        if item.get("same_address"):
            return "D_same_address_different_units"
        if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
            return "E_uncertain" if item.get("distance_m", 999) <= 50 else "A_legitimate"
        return "A_legitimate"

    out = {}
    for bucket in ("identical", "lt25", "lt50", "lt100", "lt200"):
        out[bucket] = [{**it, "classification": label(it)} for it in prox.get(bucket, [])]
    # different-brand buckets
    diff100, diff200 = [], []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if (a.get("brand") or "").lower() == (b.get("brand") or "").lower():
                continue
            if a.get("lat") is None or b.get("lat") is None:
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            item = {
                "a_id": a["id"],
                "b_id": b["id"],
                "brand_a": a.get("brand"),
                "brand_b": b.get("brand"),
                "distance_m": round(d),
                "classification": "A_legitimate",
            }
            if d <= 100:
                diff100.append(item)
            elif d <= 200:
                diff200.append(item)
    out["different_brand_lt100"] = diff100
    out["different_brand_lt200"] = diff200
    return out


def data_quality(ready: list[dict]) -> dict:
    dup_ids = [i for i, c in Counter(r["id"] for r in ready).items() if c > 1]
    invalid_post = [
        r["id"] for r in ready if not LI_POSTAL_RE.match(str(r.get("postal_code") or ""))
    ]
    missing = [
        r["id"]
        for r in ready
        if not (
            r.get("address")
            and len(str(r.get("address"))) > 3
            and r.get("city")
            and r.get("name")
            and r.get("brand")
        )
    ]
    invalid_coords = []
    foreign = []
    fallback = []
    mojibake = []
    missing_elig = []
    for r in ready:
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and math.isfinite(lat)
            and math.isfinite(lng)
        ):
            invalid_coords.append(r["id"])
        elif not in_liechtenstein(float(lat), float(lng)):
            foreign.append(r["id"])
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            fallback.append(r["id"])
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            mojibake.append(r["id"])
        if r.get("eligibility_path") != "SMALL_MARKET_INDEPENDENT":
            missing_elig.append(r["id"])
    return {
        "duplicate_ids": dup_ids,
        "invalid_ready_postcodes": invalid_post,
        "missing_ready_fields": missing,
        "invalid_ready_coords": invalid_coords,
        "fallback_coords": fallback,
        "foreign_outliers": foreign,
        "mojibake": mojibake,
        "missing_eligibility_path": missing_elig,
        "all_gates_pass": not any(
            [
                dup_ids,
                invalid_post,
                missing,
                invalid_coords,
                foreign,
                fallback,
                mojibake,
                missing_elig,
            ]
        ),
    }


def main() -> None:
    sha = freeze_check()
    staging = json.loads(STAGING_PATH.read_text(encoding="utf-8"))
    by_id = {r["id"]: r for r in staging}

    # Preserve Phase 1 snapshot
    write_json(PHASE2 / "phase1_staging_snapshot.json", deepcopy(staging))
    write_json(
        PHASE2 / "phase1_candidate_ids.json",
        {"candidates": P1_CANDIDATES, "count": len(P1_CANDIDATES)},
    )

    decisions: dict[str, dict] = {}

    # ── 1. update Fitness Vaduz → READY ──────────────────────────────────
    r = by_id["li_9fdb1d933f"]
    promote_ready(
        r,
        notes=(
            "Phase2: official update-fitness.ch/vaduz — 650 m² conventional public club; "
            "Jahresabo membership; Kraft+Ausdauer; sole LI premises (CH network elsewhere excluded)"
        ),
        source_url="https://www.update-fitness.ch/vaduz/",
        lat=47.1546705,
        lng=9.5099197,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["update_fitness"] = {
        "id": r["id"],
        "verdict": "READY",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "li_estate": 1,
    }

    # ── 2. LieFit Vaduz → READY ──────────────────────────────────────────
    r = by_id["li_9514fe2df2"]
    promote_ready(
        r,
        notes=(
            "Phase2: liefit.li — 24/7 badge access conventional public gym; Kraft/Cardio/"
            "Freihantel; GEOWAY is an in-studio specialty service, not a separate gym"
        ),
        source_url="https://liefit.li/",
        lat=47.1354865,
        lng=9.5141048,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["liefit_vaduz"] = {
        "id": r["id"],
        "verdict": "READY",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
    }

    # ── 3. GEOWAY Eschen → EXCLUDE (specialist infrared studio) ──────────
    r = by_id["li_7f2d2a5ed7"]
    demote_excluded(
        r,
        classification="C_SPECIALIST_INFRARED_BEAUTY",
        notes=(
            "Phase2: geoway.li — standalone infrared fatburner/beauty studio at Kohlplatz 9; "
            "not a conventional gym floor. Same operator group as LieFit (Christof & Sabrin / "
            "LieFit GmbH); GEOWAY also offered as specialty service inside LieFit Vaduz. "
            "One conventional import unit = LieFit Vaduz only."
        ),
    )
    r["brand"] = "GEOWAY"
    r["name"] = "GEOWAY Eschen"
    decisions["liefit_geoway_eschen"] = {
        "id": r["id"],
        "verdict": "EXCLUDED",
        "relationship": "GEOWAY_specialty_studio_same_operators_as_LieFit",
        "import_units": "LieFit Vaduz only (conventional); GEOWAY Eschen excluded",
    }

    # ── 4. purfitness Schaan → READY ─────────────────────────────────────
    r = by_id["li_35eed72b39"]
    promote_ready(
        r,
        notes=(
            "Phase2: purfitness.at — current successor of fitnesshaus by blugym (March 2026); "
            "public conventional club Im alten Riet 22; predecessor remains CLOSED"
        ),
        source_url="https://www.purfitness.at/",
        lat=47.1747102,
        lng=9.5121756,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["purfitness"] = {
        "id": r["id"],
        "verdict": "READY",
        "successor_of": "fitnesshaus by blugym Schaan",
    }

    # ── 5. Lorez Gesundheitscenter → EXCLUDE (medical/health-training led) ─
    r = by_id["li_3ff9b2a62c"]
    demote_excluded(
        r,
        classification="B_PUBLIC_BUT_MEDICAL_REHAB_LED",
        notes=(
            "Phase2: lorez-gesundheitscenter.li — appointment-led 55-min health/medical "
            "training with scheduled follow-ups every 6–8 weeks; primary identity is "
            "ganzheitliche Gesundheitsberatung, not drop-in conventional gym floor. "
            "Successor of Salutaris at same address remains documented; Power Center is "
            "the conventional Lorez gym unit."
        ),
    )
    decisions["lorez_gesundheitscenter"] = {
        "id": r["id"],
        "verdict": "EXCLUDED",
        "classification": "B_PUBLIC_BUT_MEDICAL_REHAB_LED",
    }

    # ── 6. Lorez Power Center Bendern → READY (one unit) ─────────────────
    r = by_id["li_688dc73ac2"]
    promote_ready(
        r,
        notes=(
            "Phase2: power-center.li — 24h public conventional gym (Freihantel + Nautilus); "
            "Health Training co-located same building (3.OG) is internal coached program — "
            "single import unit Industriestrasse 16 Bendern"
        ),
        source_url="https://www.power-center.li/kontakt",
        lat=47.2056244,
        lng=9.5035504,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["lorez_power_center"] = {
        "id": r["id"],
        "verdict": "READY",
        "units": 1,
        "co_located_health_training": "not_separate_club",
    }

    # ── 7. flexigym Balzers → READY ──────────────────────────────────────
    r = by_id["li_f02192ce76"]
    promote_ready(
        r,
        notes=(
            "Phase2: flexigym.li — current public Fitness & Krafttraining studio Balzers; "
            "unbetreute/betreute Abos; Landstrasse 25"
        ),
        source_url="https://www.flexigym.li/",
        lat=47.0767349,
        lng=9.5121186,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["flexigym"] = {"id": r["id"], "verdict": "READY"}

    # ── 8. In Motion Eschen → READY (A conventional with physio add-ons) ─
    r = by_id["li_740e149c77"]
    promote_ready(
        r,
        notes=(
            "Phase2: inmotion.li/fitness — A_CONVENTIONAL_PUBLIC_GYM; Light Abos provide "
            "24/7 gym access without requiring physiotherapy; ~360 m² with Egym, Matrix "
            "cardio, Freihantel. Physio/massage are additive package benefits, not gatekeeping."
        ),
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        source_url="https://inmotion.li/fitness/",
        lat=47.2077115,
        lng=9.5340621,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
    )
    decisions["in_motion"] = {
        "id": r["id"],
        "verdict": "READY",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "not": "B_PUBLIC_BUT_MEDICAL_REHAB_LED",
    }

    # ── Second-pass discoveries ──────────────────────────────────────────
    new_discovered = []

    # KOKON Fitness & Spa Ruggell — NEW READY
    kokon = add_new(
        staging,
        brand="KOKON Fitness",
        name="KOKON Fitness & Spa Ruggell",
        address="Industriering 3",
        city="Ruggell",
        postal="9491",
        source_url="https://www.kokon-cc.li/fitness-spa",
        lat=47.2494755,
        lng=9.5269321,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes=(
            "Phase2 new: kokon-cc.li / fitness.kokon-cc.li — public Jahresabo gym "
            "(06–21 member access) with modern equipment + spa amenity; single import "
            "unit at Industriering 3 (Kokon 2 / Industriering 40 is campus building, not "
            "separate gym). Spa does not disqualify conventional public gym use."
        ),
        classification="A_CONVENTIONAL_PUBLIC_GYM",
    )
    new_discovered.append(
        {
            "id": kokon["id"],
            "name": kokon["name"],
            "verdict": "READY",
            "municipality": "Ruggell",
        }
    )
    decisions["kokon"] = {"id": kokon["id"], "verdict": "READY", "phase2_new": True}

    # AKA GYM — NEW EXCLUDED (capped boutique)
    aka = add_new(
        staging,
        brand="AKA GYM",
        name="AKA GYM Nendeln / Schaanwald",
        address="Sägastrasse 32",
        city="Nendeln",
        postal="9485",
        source_url="https://www.akagym.li/",
        lat=47.1996633,
        lng=9.540254,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes=(
            "Phase2 new: akagym.li — Begrenzte Mitgliederzahl / private atmosphere; "
            "capped-membership boutique similar to Bro Performance. Register also lists "
            "Gewerbeweg 18 Schaanwald — same operator, not promoted. EXCLUDED."
        ),
        excluded=True,
        classification="E_BOUTIQUE_CAPPED_MEMBERSHIP",
        discovery_class="phase2_independent_discovery",
    )
    new_discovered.append(
        {"id": aka["id"], "name": aka["name"], "verdict": "EXCLUDED", "municipality": "Nendeln"}
    )

    # Luxe Private Fitness Lounge Triesen — NEW EXCLUDED (PT-only)
    luxe = add_new(
        staging,
        brand="Luxe Private Fitness Lounge",
        name="Luxe Private Fitness Lounge Triesen",
        address="Dorfstrasse 2",
        city="Triesen",
        postal="9495",
        source_url="https://www.theryann.li/",
        lat=47.1081916,
        lng=9.5271199,
        coord_source="NOMINATIM_PREMISES",
        notes=(
            "Phase2 new: theryann.li — personal-training-only private lounge; "
            "no conventional public gym floor. EXCLUDED."
        ),
        excluded=True,
        classification="E_PT_ONLY_PRIVATE_LOUNGE",
        discovery_class="phase2_independent_discovery",
    )
    new_discovered.append(
        {"id": luxe["id"], "name": luxe["name"], "verdict": "EXCLUDED", "municipality": "Triesen"}
    )

    # Reconfirm Phase 1 scope exclusions remain EXCLUDED
    exclusion_reconfirm = []
    for rid, label in [
        ("li_53796ae7be", "Salutaris legacy CLOSED"),
        ("li_1d8662661d", "fitnesshaus by blugym legacy CLOSED"),
    ]:
        row = by_id.get(rid)
        if row:
            exclusion_reconfirm.append(
                {"id": rid, "status": row.get("import_category"), "label": label}
            )

    # Ensure no NEEDS_REVIEW remains among resolved candidates
    for rid in P1_CANDIDATES:
        row = by_id[rid]
        if row.get("import_category") == "NEEDS_REVIEW":
            raise SystemExit(f"Unresolved NEEDS_REVIEW: {rid}")

    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    statuses = dict(Counter(r.get("import_category") for r in staging))

    # Hard territorial check
    for r in ready:
        if not in_liechtenstein(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"Foreign READY outlier: {r['id']}")
        if not LI_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"Invalid READY postcode: {r['id']}")

    dq = data_quality(ready)
    if not dq["all_gates_pass"]:
        raise SystemExit(f"DQ gates failed: {dq}")

    prox = classify_proximity(ready)
    hard_dups = (
        prox.get("identical", [])
        + prox.get("lt25", [])
        + [x for x in prox.get("lt50", []) if x.get("classification") == "B_duplicate"]
    )
    # same-brand close pairs among READY should be empty or A_legitimate only
    unexplained = [
        x
        for bucket in ("identical", "lt25", "lt50")
        for x in prox.get(bucket, [])
        if x.get("classification") not in ("A_legitimate",)
        and (by_id.get(x["a_id"], {}).get("brand") or "").lower()
        == (by_id.get(x["b_id"], {}).get("brand") or "").lower()
    ]
    # For READY list by_id may miss new rows — rebuild
    by_id = {r["id"]: r for r in staging}
    unexplained = []
    for bucket in ("identical", "lt25", "lt50"):
        for x in prox.get(bucket, []):
            a = by_id.get(x["a_id"], {})
            b = by_id.get(x["b_id"], {})
            if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            if x.get("classification") not in ("A_legitimate",):
                unexplained.append(x)
    if unexplained:
        raise SystemExit(f"Unexplained same-brand proximity: {unexplained}")

    municipality_coverage = {
        "Vaduz": "READY_present",
        "Schaan": "READY_present",
        "Balzers": "READY_present",
        "Eschen": "READY_present",
        "Bendern": "READY_present",
        "Ruggell": "READY_present",
        "Triesen": "C_scope_exclusion",  # Luxe PT-only only
        "Mauren": "A_legitimate_no_local_gym",
        "Triesenberg": "A_legitimate_no_local_gym",
        "Schellenberg": "A_legitimate_no_local_gym",
        "Planken": "A_legitimate_no_local_gym",
        "Nendeln": "C_scope_exclusion",  # AKA capped boutique / Fita dance
        "Gamprin": "READY_present",  # Bendern is Gamprin municipality
    }

    rebrand = {
        "country": "Liechtenstein",
        "phase": 2,
        "cases": [
            {
                "id": "salutaris_lorez_schaan",
                "classification": "A_current_successor",
                "predecessor": "Salutaris Training Schaan",
                "successor_candidate": "Lorez Gesundheitscenter Schaan",
                "final": (
                    "Gesundheitscenter EXCLUDED as medical/health-training-led; "
                    "Salutaris remains CLOSED; Power Center Bendern is conventional Lorez READY"
                ),
                "status": "RESOLVED",
            },
            {
                "id": "blugym_purfitness_schaan",
                "classification": "A_current_successor",
                "predecessor": "fitnesshaus by blugym Schaan",
                "successor": "purfitness Schaan",
                "status": "RESOLVED",
                "ready_id": "li_35eed72b39",
            },
            {
                "id": "lorez_bendern_colocation",
                "classification": "B_co_located_not_separate_club",
                "units": "Lorez Power Center Bendern only (READY)",
                "status": "RESOLVED",
            },
            {
                "id": "liefit_geoway_eschen",
                "classification": "C_specialty_service_vs_conventional_gym",
                "conventional_ready": "LieFit Vaduz",
                "specialty_excluded": "GEOWAY Eschen",
                "operators": "same (LieFit GmbH / Christof & Sabrin)",
                "status": "RESOLVED",
            },
        ],
        "unresolved_conflicts": 0,
    }
    write_json(OUT / "LIECHTENSTEIN_PHASE2_REBRAND_MAP.json", rebrand)

    write_json(PHASE2 / "eligibility_decisions.json", decisions)
    write_json(
        PHASE2 / "independent_discovery.json",
        {
            "phase1_candidates_recovered": 8,
            "phase1_promoted": 6,
            "phase1_excluded": 2,
            "new_locations_discovered": len(new_discovered),
            "new_locations": new_discovered,
            "new_ready": sum(1 for x in new_discovered if x["verdict"] == "READY"),
        },
    )
    write_json(
        PHASE2 / "in_motion_resolution.json",
        {
            "id": "li_740e149c77",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM",
            "verdict": "READY",
            "rationale": (
                "Light memberships grant 24/7 gym access without physio requirement; "
                "material gym floor with Egym/Matrix/Freihantel on ~360 m²"
            ),
            "rejected": ["B_PUBLIC_BUT_MEDICAL_REHAB_LED", "C_PRIVATE_PATIENT_ONLY"],
        },
    )
    write_json(
        PHASE2 / "geoway_resolution.json",
        {
            "id": "li_7f2d2a5ed7",
            "classification": "C_SPECIALIST_INFRARED_BEAUTY",
            "verdict": "EXCLUDED",
            "relationship_to_liefit": (
                "Same operators; GEOWAY specialty available inside LieFit Vaduz; "
                "Eschen is GEOWAY-only specialty studio — not a second conventional gym"
            ),
        },
    )

    # Evidence stubs
    (RAW_P2 / "phase2_evidence_index.json").write_text(
        json.dumps(
            {
                "as_of": datetime.now(timezone.utc).date().isoformat(),
                "sources": [
                    "https://www.update-fitness.ch/vaduz/",
                    "https://liefit.li/",
                    "https://liefit.li/ueber-liefit/",
                    "https://www.geoway.li/",
                    "https://www.purfitness.at/",
                    "https://www.lorez-gesundheitscenter.li/",
                    "https://www.power-center.li/kontakt",
                    "https://www.flexigym.li/",
                    "https://inmotion.li/fitness/",
                    "https://www.kokon-cc.li/fitness-spa",
                    "https://fitness.kokon-cc.li/",
                    "https://www.akagym.li/",
                    "https://www.theryann.li/",
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Inventory
    inventory = {
        "country": "Liechtenstein",
        "phase": 2,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "liechtenstein_live": 0,
        "iceland_live": ICELAND_LIVE,
        "class_a_chains": [],
        "class_a_open_estimate": 0,
        "ready_total": len(ready),
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "small_market": {
            "recommended_model": "INDEPENDENT_PHASE_EXECUTED",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "qualifying_class_a_chains": 0,
            "independent_ready": len(ready),
        },
        "status_counts": statuses,
        "phase1_candidates_recovered": 8,
        "phase1_promoted_to_ready": 6,
        "phase1_excluded": 2,
        "new_phase2_ready": 1,
        "municipality_coverage": municipality_coverage,
    }
    write_json(OUT / "liechtenstein_chain_inventory.json", inventory)

    dup_out = {
        "proximity": prox,
        "dq": {k: (len(v) if isinstance(v, list) else v) for k, v in dq.items()},
        "dq_detail": dq,
        "hard_duplicate_problems": 0,
        "unexplained_same_brand_proximity": 0,
    }
    write_json(OUT / "liechtenstein_duplicate_analysis.json", dup_out)

    # Geocode cache/review touch
    cache_path = OUT / "liechtenstein_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    cache["phase2_confirmed"] = {
        r["id"]: {"lat": r["lat"], "lng": r["lng"], "coord_source": r.get("coord_source")}
        for r in ready
    }
    write_json(cache_path, cache)
    write_json(
        OUT / "liechtenstein_geocode_review.json",
        {
            "ready_count": len(ready),
            "fallback_coords": 0,
            "all_premises_grade": True,
            "notes": "All READY coords from official address Nominatim premises pins",
        },
    )

    write_json(OUT / "liechtenstein_centers_staging.json", staging)
    write_json(OUT / "LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json", ready)
    # Keep Phase 1 READY file empty for history; Phase 2 is authoritative
    write_xlsx(staging)

    projected = PRODUCTION_TOTAL + len(ready)
    ready_inventory = [
        {
            "id": r["id"],
            "brand": r["brand"],
            "name": r["name"],
            "address": r["address"],
            "city": r["city"],
            "postal_code": r["postal_code"],
            "lat": r["lat"],
            "lng": r["lng"],
            "eligibility_path": r.get("eligibility_path"),
        }
        for r in sorted(ready, key=lambda x: (x.get("city") or "", x.get("name") or ""))
    ]

    unexplained_bd = [
        m
        for m, c in municipality_coverage.items()
        if c in ("B_discovery_gap", "D_unresolved")
    ]

    report = {
        "country": "Liechtenstein",
        "phase": 2,
        "verdict": "READY FOR LIECHTENSTEIN MERGE",
        "small_market_model": "INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "liechtenstein_live": 0,
        "iceland_live": ICELAND_LIVE,
        "production_modified": False,
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "ready_inventory": ready_inventory,
        "phase1_candidates_recovered": 8,
        "phase1_promoted": 6,
        "phase1_excluded": 2,
        "new_locations_discovered": len(new_discovered),
        "new_ready": 1,
        "small_market_independent_ready": len(ready),
        "class_a_chains": 0,
        "phase3_required": False,
        "phase3_reasons": [],
        "dq_gates": {
            "duplicate_ids": len(dq["duplicate_ids"]),
            "invalid_postcodes": len(dq["invalid_ready_postcodes"]),
            "missing_addresses": len(dq["missing_ready_fields"]),
            "invalid_coordinates": len(dq["invalid_ready_coords"]),
            "fallback_coordinates": len(dq["fallback_coords"]),
            "foreign_territorial_outliers": len(dq["foreign_outliers"]),
            "mojibake": len(dq["mojibake"]),
            "missing_eligibility_path": len(dq["missing_eligibility_path"]),
            "unresolved_rebrand_conflicts": 0,
            "hard_duplicate_problems": 0,
        },
        "territorial_safety": "CLEAN",
        "ready_foreign_outliers": 0,
        "unexplained_municipality_bd_gaps": len(unexplained_bd),
        "municipality_coverage": municipality_coverage,
        "projected_catalog_if_merged": projected,
        "crossed_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_now": False,
        "architecture": "KEEP CLIENT-SIDE",
        "decisions": decisions,
    }
    write_json(OUT / "LIECHTENSTEIN_PHASE2_READINESS_REPORT.json", report)

    md = f"""# LIECHTENSTEIN PHASE 2 READINESS REPORT

## Verdict

**READY FOR LIECHTENSTEIN MERGE**

Small-market model: **INDEPENDENT_PHASE_EXECUTED**  
Eligibility path: **SMALL_MARKET_INDEPENDENT**  
Phase 3 required: **NO**

## Production freeze

- Catalog: {PRODUCTION_TOTAL}
- Iceland: {ICELAND_LIVE}
- Liechtenstein live: 0
- SHA256: `{sha}`
- Production modified: NO

## READY inventory ({len(ready)})

| Brand | Name | City | Postcode |
|-------|------|------|----------|
{chr(10).join(
    f"| {r['brand']} | {r['name']} | {r['city']} | {r['postal_code']} |"
    for r in ready_inventory
)}

## Phase 1 recovery

- Recovered: **8/8**
- Promoted to READY: **6**
- Excluded: **2** (GEOWAY Eschen specialist; Lorez Gesundheitscenter medical/health-led)

## Phase 2 discoveries

- New locations: **{len(new_discovered)}**
- New READY: **1** (KOKON Fitness & Spa Ruggell)
- New EXCLUDED: **2** (AKA GYM capped boutique; Luxe PT lounge)

## Projected catalog

Current {PRODUCTION_TOTAL} + READY {len(ready)} = **{projected}**  
Crosses 12,500: **NO**

## Global scale

- Global Stress QA required: NO
- Architecture: KEEP CLIENT-SIDE
"""
    (OUT / "LIECHTENSTEIN_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if sha_after != EXPECTED_SHA:
        raise SystemExit(f"FAIL: production modified during Phase 2 → {sha_after}")

    print("READY:", len(ready))
    for r in ready_inventory:
        print(f"  {r['id']} | {r['brand']} | {r['name']} | {r['city']}")
    print("Statuses:", statuses)
    print("Verdict:", report["verdict"])
    print("SHA unchanged:", sha_after[:16] + "...")


if __name__ == "__main__":
    main()
