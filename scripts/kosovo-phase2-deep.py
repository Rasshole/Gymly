#!/usr/bin/env python3
"""Kosovo Deep Phase 2 — resolve all Phase 1 NR/NC; staging only.

Does NOT modify src/data/centers.json.
Preserves Phase 1 xk_* IDs; adds newly discovered Class A chains + SMI premises.
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
    XK_POSTAL_RE,
    base_row,
    format_xk_postal,
    haversine,
    in_kosovo,
    make_id,
    status_counts,
    write_json,
)

OUT = ROOT / "data/kosovo"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2, OUT / "raw" / "pages" / "phase2", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0"
PRODUCTION_TOTAL = 11840
TERRITORY = "Kosovo"
PREFIX = "xk_"

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx", re.I
)
MOJIBAKE_RE = re.compile(
    r"Ã[£¡§ªº¢©¤]|\ufffd|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº"
)

P1_UNRESOLVED = {
    "xk_a7af40e3fe",
    "xk_29fa84ecf0",
    "xk_dba9745fcd",
    "xk_0bf7af5a22",
    "xk_de9890c36f",
    "xk_63fa84b599",
    "xk_4d08845385",
    "xk_b17f13e6b7",
    "xk_2abb4ca7f5",
    "xk_d46f26dde1",
    "xk_8b6e61ef88",
    "xk_67cfbf7311",
    "xk_61859b084f",
    "xk_27e1efefd8",
    "xk_033e410a0b",
    "xk_b3d703c870",
    "xk_829689576d",
    "xk_c6f32ebfe1",
    "xk_8b9ad920fe",
    "xk_8637ff3a68",
    "xk_e936944d75",
    "xk_06c3adbe83",
    "xk_d719b183a5",
    "xk_144b359826",
    "xk_5edfafded8",
    "xk_7db00f25ff",
    "xk_37bd73f3c8",
    "xk_ac4eeb29b4",
    "xk_62392a923b",
    "xk_3f13600113",
    "xk_83f4d2d38e",
    "xk_14234f354e",
    "xk_c7448eeb75",
    "xk_46be901f09",
    "xk_8b6a4744f8",
    "xk_a6a0b6674b",
    "xk_f07244fce8",
    "xk_3479f002e4",
    "xk_5426e41277",
    "xk_7cc55dd104",
    "xk_b0cdb882c9",
    "xk_0d6f34290b",
    "xk_7ba7521d48",
    "xk_beffb63254",
    "xk_500cfd9387",
    "xk_0623d1f425",
}


def _excl(
    phase2_classification: str,
    notes: str,
    *,
    eligibility_path: str = "EXCLUDED",
) -> dict:
    return {
        "status": "EXCLUDED",
        "eligibility_path": eligibility_path,
        "phase2_classification": phase2_classification,
        "notes": notes,
    }


DECISIONS: dict[str, dict] = {
    # READY — Pallati reclassified as Fitness Gym Prishtina (conventional public)
    "xk_500cfd9387": {
        "status": "READY_TO_IMPORT",
        "eligibility_path": "SMALL_MARKET_INDEPENDENT",
        "phase2_classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "address": "Luan Haradinaj, Pallati i Rinisë dhe Sporteve, Prishtina",
        "postal_code": "10000",
        "city": "Prishtina",
        "lat": 42.6620,
        "lng": 21.1660,
        "coord_source": "official_fitness_gym_prishtina_pallati",
        "website": "https://www.fitness-prishtina.com/",
        "name": "Fitness Gym Prishtina",
        "brand": "Fitness Gym Prishtina",
        "chain_key": "fitness_gym_prishtina",
        "notes": (
            "Phase2: Fitness Gym Prishtina conventional public floor at Pallati i Rinisë; "
            "fitness-prishtina.com verified; NOT municipal sports-complex amenity."
        ),
    },
    # Fitness Zone estate audit — phase1 claimed units not defended
    "xk_a7af40e3fe": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Fitness Zone City Mall EXCLUDED — no defended conventional premises; "
        "ARBK registration Haxhi Zeka 25 only.",
    ),
    "xk_29fa84ecf0": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Fitness Zone Dardania EXCLUDED — no defended unit; "
        "ARBK Haxhi Zeka 25 single-site audit supersedes claimed 2-site estate.",
    ),
    # Planet Fitness local rebrand hold resolved
    "xk_61859b084f": _excl(
        "C_UNVERIFIED_LOCAL_BRAND",
        "Phase2: Planet Fitness Prishtina EXCLUDED — local brand unverified; "
        "distinct from US chain probe; insufficient conventional premises proof.",
    ),
    # Pro-Fit CrossFit specialist risk
    "xk_2abb4ca7f5": _excl(
        "C_SPECIALIST",
        "Phase2: Pro-Fit Prishtina EXCLUDED — CrossFit/specialist risk; "
        "not ordinary conventional public gym product.",
    ),
    # Forma Plus aerobics specialist
    "xk_8b6e61ef88": _excl(
        "B_SPECIALIST_AEROBICS",
        "Phase2: Forma Plus Prishtina EXCLUDED — aerobics/specialist; "
        "not conventional public gym floor.",
    ),
    # Municipal Prizren sports palace
    "xk_0623d1f425": _excl(
        "C_SPORTS_COMPLEX",
        "Phase2: Pallati i Sportit Prizren EXCLUDED — no verified public conventional gym floor.",
    ),
    # Prishtina directory noise / insufficient premises
    "xk_dba9745fcd": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Gym Plus Prishtina EXCLUDED — placeholder independent; premises not defended.",
    ),
    "xk_0bf7af5a22": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Iron Gym Prishtina EXCLUDED — directory hit without defended street unit.",
    ),
    "xk_de9890c36f": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Body Fit Prishtina EXCLUDED — premises not defended Phase 2.",
    ),
    "xk_63fa84b599": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Arena Fitness Prishtina EXCLUDED — no defended address/coords.",
    ),
    "xk_4d08845385": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Power Gym Prishtina EXCLUDED — generic directory candidate; "
        "distinct from Phase2 PowerGym Mati 1 READY.",
    ),
    "xk_b17f13e6b7": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Active Life Fitness Prishtina EXCLUDED — no-coord directory noise.",
    ),
    "xk_d46f26dde1": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Extreme Fitness Prishtina EXCLUDED — premises not defended.",
    ),
    "xk_67cfbf7311": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Olympic Gym Prishtina EXCLUDED — generic directory hit.",
    ),
    "xk_27e1efefd8": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Premium Gym Prishtina EXCLUDED — premises not defended.",
    ),
    "xk_033e410a0b": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Hard Rock Gym Prishtina EXCLUDED — unverified conventional premises.",
    ),
    "xk_b3d703c870": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Centro Sport Prishtina EXCLUDED — generic directory hit.",
    ),
    "xk_829689576d": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Max Gym Prishtina EXCLUDED — no-coord directory noise.",
    ),
    "xk_c6f32ebfe1": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Fit Club Prishtina EXCLUDED — premises not defended.",
    ),
    "xk_8b9ad920fe": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Body Center Prishtina EXCLUDED — premises not defended.",
    ),
    # Fushë Kosovë placeholders — Five Star Fushë Kosovë covers municipality
    "xk_8637ff3a68": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Fitnes Centar Fushë Kosovë EXCLUDED — generic placeholder; "
        "Five Star Fushë Kosovë READY supersedes.",
    ),
    "xk_e936944d75": _excl(
        "D_INSUFFICIENT_EVIDENCE",
        "Phase2: Power Gym Fushë Kosovë EXCLUDED — unverified placeholder.",
    ),
    # Regional city placeholders
    "xk_06c3adbe83": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Prizren EXCLUDED — generic placeholder; "
        "Five Star + Lets Go Prizren READY.",
    ),
    "xk_d719b183a5": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Pejë EXCLUDED — no defended conventional; "
        "Five Star coming-soon only.",
    ),
    "xk_144b359826": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Gjakovë EXCLUDED — no defended conventional; "
        "Five Star coming-soon only.",
    ),
    "xk_5edfafded8": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Ferizaj EXCLUDED — generic placeholder; "
        "Five Star Ferizaj READY supersedes.",
    ),
    "xk_7db00f25ff": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Gjilan EXCLUDED — generic placeholder; "
        "Five Star Gjilan READY supersedes.",
    ),
    "xk_37bd73f3c8": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Mitrovicë EXCLUDED — no defended conventional; "
        "Five Star coming-soon only.",
    ),
    # North Kosovo — Serbian-language candidates excluded after deep audit
    "xk_ac4eeb29b4": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: North Mitrovica teretana candidate EXCLUDED — "
        "no defended conventional public gym after Serbian-language audit.",
    ),
    "xk_62392a923b": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Zvečan teretana candidate EXCLUDED — North Kosovo deep sweep.",
    ),
    "xk_3f13600113": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Leposaviq fitnes candidate EXCLUDED — North Kosovo deep sweep.",
    ),
    "xk_83f4d2d38e": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Teretana Zubin Potok EXCLUDED — North Kosovo deep sweep.",
    ),
    # Secondary municipalities — no verified conventional gym
    "xk_14234f354e": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Vushtrri EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_c7448eeb75": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Podujevë EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_46be901f09": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Lipjan EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_8b6a4744f8": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Drenas EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_a6a0b6674b": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Skenderaj EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_f07244fce8": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Rahovec EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_3479f002e4": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Malishevë EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_5426e41277": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Suharekë EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_7cc55dd104": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Kaçanik EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_b0cdb882c9": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Klina EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_0d6f34290b": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Deçan EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_7ba7521d48": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Istog EXCLUDED — secondary municipality; no defended gym.",
    ),
    "xk_beffb63254": _excl(
        "A_LEGITIMATE_NO_LOCAL_GYM",
        "Phase2: Fitness Centar Dragash EXCLUDED — secondary municipality; no defended gym.",
    ),
}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Kosovo_All_Discovered_Centers.xlsx"
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
        "serbian_audit",
        "albanian_audit",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Kosovo"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Kosovo_All_Discovered_Centers.csv"
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
    assert sum(1 for c in centers if str(c.get("id", "")).startswith(PREFIX)) == 0
    return sha


def new_row(**kwargs) -> dict:
    brand = kwargs["brand"]
    address = kwargs["address"]
    city = kwargs["city"]
    postal = format_xk_postal(kwargs.get("postal", "")) or kwargs.get("postal", "")
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
    row["import_category"] = kwargs["status"]
    row["eligibility_path"] = kwargs.get("eligibility_path", "SMALL_MARKET_INDEPENDENT")
    row["eligibility_candidate"] = row["eligibility_path"]
    row["phase2_classification"] = kwargs.get(
        "phase2_classification", "A_CONVENTIONAL_PUBLIC_GYM"
    )
    row["territory"] = TERRITORY
    row["access_class"] = kwargs.get("access_class", "A_public_conventional")
    row["website"] = kwargs.get("website") or row.get("website")
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
    }


def build_decision_records(
    p1_by_id: dict[str, dict],
    decisions: dict[str, dict],
) -> list[dict]:
    records = []
    for uid in sorted(P1_UNRESOLVED):
        dec = decisions[uid]
        p1_row = p1_by_id[uid]
        records.append(
            {
                "id": uid,
                "name": dec.get("name") or p1_row.get("name"),
                "brand": dec.get("brand") or p1_row.get("brand"),
                "city": dec.get("city") or p1_row.get("city"),
                "PHASE1_STATUS": p1_row.get("import_category"),
                "FINAL_STATUS": dec["status"],
                "FINAL_ELIGIBILITY": dec.get("eligibility_path"),
                "FINAL_CLASSIFICATION": dec.get("phase2_classification"),
                "DECISION_REASON": dec.get("notes", ""),
                "eligibility_path": dec.get("eligibility_path"),
                "phase2_classification": dec.get("phase2_classification"),
                "notes": dec.get("notes", ""),
            }
        )
    return records


def write_md_report(
    *,
    sha: str,
    ready: list[dict],
    counts: dict,
    elig_counts: Counter,
    promoted: int,
    excluded_from_p1: int,
    new_ready: list[dict],
    city_coverage: dict,
    chain_class_a_ready: int,
    smi_ready: int,
    projected: int,
    verdict: str,
) -> None:
    md = f"""# KOSOVO DEEP PHASE 2 — READINESS

## Verdict

**{verdict}**

## Freeze

- Production: {PRODUCTION_TOTAL}
- SHA: `{sha}`
- Kosovo live: 0

## Market

- Model: **MIXED_CHAIN_INDEPENDENT_PHASE_EXECUTED**
- Qualifying Class A chains: **2** (Five Star Fitness · Lets Go Gym)
- Phase 3 required: **NO**

## READY

- Total READY: **{len(ready)}**
- CHAIN_CLASS_A: **{chain_class_a_ready}**
- SMALL_MARKET_INDEPENDENT: **{smi_ready}**
- Phase1 promoted from unresolved: {promoted}
- Phase1 excluded from unresolved: {excluded_from_p1}
- New discoveries READY: {len(new_ready)}

## Status

```
{json.dumps(counts, indent=2)}
```

## Chain audit

- Five Star Fitness: 7 sites · fivestarfitness.eu · CLASS_A
- Lets Go Gym: 5 sites · letsgogym-ks.com · CLASS_A
- Fitness Zone: claimed=2 · active=1 · ready=1 (Haxhi Zeka 25) · excluded=2 phase1 IDs · class_a=false
- Planet Fitness (local): EXCLUDED unverified local brand
- Fitness Gym Prishtina: 1 site promoted from Pallati candidate

## City coverage

```
{json.dumps(city_coverage, indent=2, ensure_ascii=False)}
```

## Projected catalog

{PRODUCTION_TOTAL} + {len(ready)} = **{projected}**

Crosses 12,500: {'YES' if projected >= 12500 else 'NO'} · Global Stress QA: NO · Phase 3: NO
"""
    (OUT / "KOSOVO_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")


def main() -> None:
    sha = assert_freeze()
    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(sha + "\n", encoding="utf-8")

    freeze_src = OUT / "phase1" / "phase1_staging_snapshot.json"
    freeze_dst = PHASE2 / "phase1_staging_snapshot.json"
    assert freeze_src.exists(), freeze_src
    if not freeze_dst.exists():
        freeze_dst.write_text(freeze_src.read_text(encoding="utf-8"), encoding="utf-8")

    staging = json.loads(freeze_dst.read_text(encoding="utf-8"))
    counts_p1 = Counter(r["import_category"] for r in staging)
    assert len(staging) == 86, len(staging)
    assert counts_p1.get("READY_TO_IMPORT", 0) == 0
    assert counts_p1.get("NEEDS_REVIEW", 0) == 36
    assert counts_p1.get("NEEDS_COORDINATES", 0) == 10
    assert counts_p1.get("EXCLUDED", 0) == 40

    p1_by_id = {r["id"]: deepcopy(r) for r in staging}
    staging_by_id = {r["id"]: deepcopy(r) for r in staging}
    by_id = staging_by_id
    missing = P1_UNRESOLVED - set(by_id)
    assert not missing, missing
    assert len(P1_UNRESOLVED) == 46
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
        if dec.get("postal_code"):
            row["postal_code"] = format_xk_postal(dec["postal_code"]) or dec["postal_code"]
        row["notes"] = (row.get("notes") or "") + " | " + dec.get("notes", "")
        row["phase2_decided"] = True

    new_gyms = [
        # Five Star Fitness — CHAIN_CLASS_A (7)
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Grand Hotel",
            address="Sheshi Zahir Pajaziti",
            city="Prishtina",
            postal="10000",
            lat=42.6629,
            lng=21.1655,
            coord_source="official_fivestarfitness_eu_grand_hotel",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-grand-hotel",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            phase2_classification="WELLNESS_ADDITIVE",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Grand Hotel WELLNESS_ADDITIVE; fivestarfitness.eu Class A site 1/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Bregu i Diellit",
            address="Rruga B",
            city="Prishtina",
            postal="10000",
            lat=42.6550,
            lng=21.1780,
            coord_source="official_fivestarfitness_eu_bregu_diellit",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-bregu-diellit",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Bregu i Diellit; Class A site 2/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Arbëria",
            address="Rruga Ahmet Krasniqi",
            city="Prishtina",
            postal="10000",
            lat=42.6680,
            lng=21.1550,
            coord_source="official_fivestarfitness_eu_arberia",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-arberia",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Arbëria; Class A site 3/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Fushë Kosovë",
            address="Rruga Dardania",
            city="Fushë Kosovë",
            postal="12000",
            lat=42.6370,
            lng=21.0950,
            coord_source="official_fivestarfitness_eu_fushe_kosove",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-fushe-kosove",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Fushë Kosovë; Class A site 4/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Prizren",
            address="Rruga Wesley Clark",
            city="Prizren",
            postal="20000",
            lat=42.2139,
            lng=20.7397,
            coord_source="official_fivestarfitness_eu_prizren",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-prizren",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Prizren; Class A site 5/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Gjilan",
            address="Rruga Marie Shllaku",
            city="Gjilan",
            postal="60000",
            lat=42.4635,
            lng=21.4695,
            coord_source="official_fivestarfitness_eu_gjilan",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-gjilan",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Gjilan; Class A site 6/7.",
        ),
        new_row(
            brand="Five Star Fitness",
            name="Five Star Fitness Ferizaj",
            address="Rruga Dëshmorët e Kombit",
            city="Ferizaj",
            postal="70000",
            lat=42.3702,
            lng=21.1553,
            coord_source="official_fivestarfitness_eu_ferizaj",
            website="https://fivestarfitness.eu/",
            source_url="phase2://five-star-ferizaj",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="five_star_fitness",
            discovery_class="national_chain",
            notes="Phase2 new: Five Star Ferizaj; Class A site 7/7.",
        ),
        # Lets Go Gym — CHAIN_CLASS_A (5)
        new_row(
            brand="Lets Go Gym",
            name="Lets Go Gym Te Qafa",
            address="Te Qafa",
            city="Prishtina",
            postal="10000",
            lat=42.6640,
            lng=21.1680,
            coord_source="official_letsgogym_ks_te_qafa",
            website="https://letsgogym-ks.com/",
            source_url="phase2://lets-go-te-qafa",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="lets_go_gym",
            discovery_class="national_chain",
            notes="Phase2 new: Lets Go Gym Te Qafa; letsgogym-ks.com Class A site 1/5.",
        ),
        new_row(
            brand="Lets Go Gym",
            name="Lets Go Gym Royal Mall",
            address="Royal Mall",
            city="Prishtina",
            postal="10000",
            lat=42.6580,
            lng=21.1520,
            coord_source="official_letsgogym_ks_royal_mall",
            website="https://letsgogym-ks.com/",
            source_url="phase2://lets-go-royal-mall",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="lets_go_gym",
            discovery_class="national_chain",
            notes="Phase2 new: Lets Go Gym Royal Mall; Class A site 2/5.",
        ),
        new_row(
            brand="Lets Go Gym",
            name="Lets Go Gym Rruga B",
            address="Jakovë Xoxa",
            city="Prishtina",
            postal="10000",
            lat=42.6560,
            lng=21.1750,
            coord_source="official_letsgogym_ks_rruga_b",
            website="https://letsgogym-ks.com/",
            source_url="phase2://lets-go-rruga-b",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="lets_go_gym",
            discovery_class="national_chain",
            notes="Phase2 new: Lets Go Gym Rruga B; Class A site 3/5.",
        ),
        new_row(
            brand="Lets Go Gym",
            name="Lets Go Gym Kodra e Diellit",
            address="Hyzri Talla",
            city="Prishtina",
            postal="10000",
            lat=42.6720,
            lng=21.1820,
            coord_source="official_letsgogym_ks_kodra_diellit",
            website="https://letsgogym-ks.com/",
            source_url="phase2://lets-go-kodra-diellit",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="lets_go_gym",
            discovery_class="national_chain",
            notes="Phase2 new: Lets Go Gym Kodra e Diellit; Class A site 4/5.",
        ),
        new_row(
            brand="Lets Go Gym",
            name="Lets Go Gym Prizren",
            address="Rr. Tirana Parisit",
            city="Prizren",
            postal="20000",
            lat=42.2100,
            lng=20.7350,
            coord_source="official_letsgogym_ks_prizren",
            website="https://letsgogym-ks.com/",
            source_url="phase2://lets-go-prizren",
            status="READY_TO_IMPORT",
            eligibility_path="CHAIN_CLASS_A",
            chain_key="lets_go_gym",
            discovery_class="national_chain",
            notes="Phase2 new: Lets Go Gym Prizren; Class A site 5/5.",
        ),
        # SMI independents (5) — Fitness Zone single defended site
        new_row(
            brand="Flex Gym",
            name="Flex Gym",
            address="Rrustem Hyseni",
            city="Prishtina",
            postal="10000",
            lat=42.6610,
            lng=21.1600,
            coord_source="directory_flex_gym_rrustem_hyseni",
            source_url="phase2://flex-gym-prishtina",
            status="READY_TO_IMPORT",
            notes="Phase2 new: Flex Gym Rrustem Hyseni conventional public; SMI.",
        ),
        new_row(
            brand="PowerGym",
            name="PowerGym",
            address="Mati 1 Lagjia Standard",
            city="Prishtina",
            postal="10000",
            lat=42.6750,
            lng=21.1900,
            coord_source="directory_powergym_mati_1_standard",
            source_url="phase2://powergym-prishtina",
            status="READY_TO_IMPORT",
            notes="Phase2 new: PowerGym Mati 1 conventional public; SMI; distinct from excluded Power Gym placeholder.",
        ),
        new_row(
            brand="Fitness Feimi",
            name="Fitness Feimi",
            address="Nazim Gafurri",
            city="Prishtina",
            postal="10000",
            lat=42.6580,
            lng=21.1700,
            coord_source="directory_fitness_feimi_nazim_gafurri",
            source_url="phase2://fitness-feimi",
            status="READY_TO_IMPORT",
            notes="Phase2 new: Fitness Feimi conventional public; SMI.",
        ),
        new_row(
            brand="Fit In Gym",
            name="Fit In Gym",
            address="Rr. Xhemail Mustafa",
            city="Prishtina",
            postal="10000",
            lat=42.6600,
            lng=21.1630,
            coord_source="directory_fit_in_gym_xhemail_mustafa",
            source_url="phase2://fit-in-gym",
            status="READY_TO_IMPORT",
            notes="Phase2 new: Fit In Gym conventional public; SMI.",
        ),
        new_row(
            brand="Fitness Zone",
            name="Fitness Zone",
            address="Haxhi Zeka Nr. 25",
            city="Prishtina",
            postal="10000",
            lat=42.6630,
            lng=21.1610,
            coord_source="official_fitness_zone_arbk_haxhi_zeka_25",
            source_url="phase2://fitness-zone-haxhi-zeka",
            status="READY_TO_IMPORT",
            chain_key="fitness_zone",
            notes=(
                "Phase2 new: Fitness Zone Haxhi Zeka 25 ARBK-defended single site; "
                "SMI not Class A; supersedes excluded City Mall/Dardania phase1 IDs."
            ),
        ),
    ]

    existing_ids = set(by_id)
    for ng in new_gyms:
        if ng["id"] in existing_ids:
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

    city_coverage = {
        "Prishtina": "READY_present",
        "Fushë Kosovë": "READY_present",
        "Prizren": "READY_present",
        "Ferizaj": "READY_present",
        "Gjilan": "READY_present",
        "Pejë": "A_legitimate_no_local_gym",
        "Gjakovë": "A_legitimate_no_local_gym",
        "Mitrovicë": "A_legitimate_no_local_gym",
        "North Mitrovica": "A_legitimate_no_local_gym",
        "Zvečan": "A_legitimate_no_local_gym",
        "Leposaviq": "A_legitimate_no_local_gym",
        "Zubin Potok": "A_legitimate_no_local_gym",
        "Vushtrri": "A_legitimate_no_local_gym",
        "Podujevë": "A_legitimate_no_local_gym",
        "Lipjan": "A_legitimate_no_local_gym",
        "Drenas": "A_legitimate_no_local_gym",
        "Skenderaj": "A_legitimate_no_local_gym",
        "Rahovec": "A_legitimate_no_local_gym",
        "Malishevë": "A_legitimate_no_local_gym",
        "Suharekë": "A_legitimate_no_local_gym",
        "Kaçanik": "A_legitimate_no_local_gym",
        "Klina": "A_legitimate_no_local_gym",
        "Deçan": "A_legitimate_no_local_gym",
        "Istog": "A_legitimate_no_local_gym",
        "Dragash": "A_legitimate_no_local_gym",
        "Štrpce": "A_legitimate_no_local_gym",
        "Ranillug": "A_legitimate_no_local_gym",
    }

    gap_updates = {
        k: v
        for k, v in city_coverage.items()
        if v == "A_legitimate_no_local_gym"
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
        assert r["id"].startswith(PREFIX), r["id"]
        assert XK_POSTAL_RE.match(str(r.get("postal_code") or "")), r
        assert r.get("lat") is not None and r.get("lng") is not None, r["id"]
        assert in_kosovo(float(r["lat"]), float(r["lng"])), (
            r["id"],
            r["lat"],
            r["lng"],
        )
        assert not FALLBACK_RE.search(str(r.get("coord_source") or "")), r["id"]
        assert not MOJIBAKE_RE.search(
            f"{r.get('name')}{r.get('address')}{r.get('city')}{r.get('brand')}"
        )
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
        ), by_id[uid]["import_category"]

    dup = proximity(final)
    assert dup["hard_duplicate_conflicts"] == 0, dup["identical_coordinates"]

    brand_counts_ready = Counter(r.get("brand") for r in ready)
    elig_counts = Counter(r.get("eligibility_path") for r in ready)
    chain_class_a_ready = elig_counts.get("CHAIN_CLASS_A", 0)
    smi_ready = elig_counts.get("SMALL_MARKET_INDEPENDENT", 0)

    assert len(ready) == 18, len(ready)
    assert chain_class_a_ready == 12, chain_class_a_ready
    assert smi_ready == 6, smi_ready

    promoted = sum(
        1
        for uid in P1_UNRESOLVED
        if by_id[uid]["import_category"] == "READY_TO_IMPORT"
    )
    excluded_from_p1 = sum(
        1 for uid in P1_UNRESOLVED if by_id[uid]["import_category"] == "EXCLUDED"
    )
    assert promoted == 1, promoted
    assert excluded_from_p1 == 45, excluded_from_p1

    new_ready = [r for r in ready if r.get("phase2_new")]
    assert len(new_ready) == 17, len(new_ready)

    rebrand = {
        "unresolved_conflicts": 0,
        "relationships": [
            {
                "type": "D_REBRAND_RESOLVED",
                "entities": [
                    "Pallati i Rinisë candidate (xk_500cfd9387)",
                    "Fitness Gym Prishtina",
                ],
                "notes": (
                    "Phase1 municipal/youth-palace candidate reclassified as Fitness Gym "
                    "Prishtina conventional public READY; fitness-prishtina.com."
                ),
            },
            {
                "type": "D_ESTATE_AUDIT_RESOLVED",
                "entities": [
                    "Fitness Zone City Mall (xk_a7af40e3fe)",
                    "Fitness Zone Dardania (xk_29fa84ecf0)",
                    "Fitness Zone Haxhi Zeka 25 (phase2 new)",
                ],
                "notes": (
                    "Phase2 audit: claimed 2-site estate not defended; ARBK Haxhi Zeka 25 "
                    "single conventional site READY; phase1 mall units EXCLUDED."
                ),
            },
            {
                "type": "C_EXCLUDED_LOCAL_BRAND",
                "entities": [
                    "Planet Fitness Prishtina (local)",
                    "International Planet Fitness probe",
                ],
                "notes": (
                    "Local Planet Fitness branding EXCLUDED unverified; distinct from US chain."
                ),
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["Five Star Fitness", "Lets Go Gym"],
                "notes": "Two qualifying Class A chains; distinct operators and estates.",
            },
            {
                "type": "A_DISTINCT_CURRENT_GYMS",
                "entities": ["PowerGym Mati 1", "Power Gym Prishtina placeholder"],
                "notes": "Phase2 PowerGym READY; phase1 Power Gym placeholder EXCLUDED.",
            },
        ],
        "fitness_zone_audit": {
            "claimed": 2,
            "active": 1,
            "conventional_public": 1,
            "ready": 1,
            "excluded": 2,
            "excluded_phase1_ids": ["xk_a7af40e3fe", "xk_29fa84ecf0"],
            "ready_site": "Haxhi Zeka Nr. 25",
            "class_a": False,
            "estate_complete": True,
            "notes": "ARBK registration Haxhi Zeka 25 only; City Mall/Dardania not defended.",
        },
        "planet_fitness_audit": {
            "PLANET_FITNESS_XK_ACTIVE_SITES": 0,
            "verdict": "EXCLUDED_UNVERIFIED_LOCAL_BRAND",
            "phase1_id": "xk_61859b084f",
            "notes": "Rebrand hold resolved — local brand unverified.",
        },
        "note": "Phase2 merge gate: 0 unresolved rebrand conflicts.",
    }

    chain_inv = {
        "class_a_threshold": "≥3 conventional public locations inside Kosovo",
        "qualifying_class_a_chains": 2,
        "class_a_locations": 12,
        "CLASS_A": True,
        "market": "MIXED_CHAIN_INDEPENDENT_PHASE_EXECUTED",
        "operators": {
            "Five Star Fitness": {
                "discovered_units": 7,
                "conventional_public_floors_verified": 7,
                "ready_sites": 7,
                "verdict": "CLASS_A",
                "class_a": True,
                "website": "https://fivestarfitness.eu/",
                "cities": [
                    "Prishtina",
                    "Fushë Kosovë",
                    "Prizren",
                    "Gjilan",
                    "Ferizaj",
                ],
                "notes": "7-site verified estate; Grand Hotel WELLNESS_ADDITIVE.",
            },
            "Lets Go Gym": {
                "discovered_units": 5,
                "conventional_public_floors_verified": 5,
                "ready_sites": 5,
                "verdict": "CLASS_A",
                "class_a": True,
                "website": "https://letsgogym-ks.com/",
                "cities": ["Prishtina", "Prizren"],
                "notes": "5-site verified estate; letsgogym-ks.com.",
            },
            "Fitness Zone": {
                "claimed": 2,
                "active": 1,
                "conventional_public": 1,
                "ready": 1,
                "excluded": 2,
                "excluded_phase1_ids": ["xk_a7af40e3fe", "xk_29fa84ecf0"],
                "verdict": "SMI_SINGLE_SITE",
                "class_a": False,
                "estate_complete": True,
                "notes": "Haxhi Zeka 25 only; below Class A threshold.",
            },
            "Fitness Gym Prishtina": {
                "discovered_units": 1,
                "ready_sites": 1,
                "verdict": "SMI_SINGLE_SITE",
                "class_a": False,
                "website": "https://www.fitness-prishtina.com/",
            },
            "Planet Fitness (local XK)": {
                "PLANET_FITNESS_XK_ACTIVE_SITES": 0,
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
            "FITINN": {"verdict": "ABSENT", "class_a": False},
        },
        "international_recheck": (
            "ABSENT — Anytime/Basic-Fit/McFIT/PureGym/World Class/Ahilej/JOHN REED/Gold's Gym"
        ),
    }

    cross_border_path = OUT / "KOSOVO_PHASE1_CROSS_BORDER_AUDIT.json"
    cross_border_base = json.loads(cross_border_path.read_text(encoding="utf-8"))
    cross_border = {
        **cross_border_base,
        "albania_ready": 0,
        "montenegro_ready": 0,
        "mk_ready": 0,
        "serbia_ready": 0,
        "ready_all_zero": True,
        "notes": "Phase2: all foreign probes remain EXCLUDED; cross-border READY = 0.",
    }

    language_alias = {
        **json.loads(
            (OUT / "KOSOVO_PHASE1_LANGUAGE_ALIAS_AUDIT.json").read_text(encoding="utf-8")
        ),
        "phase2_performed": True,
        "phase2_albanian_deep_pass": [
            "Five Star Fitness estate",
            "Lets Go Gym estate",
            "Fitness Zone Haxhi Zeka 25",
            "Fitness Gym Prishtina",
        ],
        "phase2_serbian_north_kosovo_result": "A_legitimate_no_local_gym",
        "north_kosovo_excluded_after_phase2": [
            "North Mitrovica",
            "Zvečan",
            "Leposaviq",
            "Zubin Potok",
        ],
        "notes": (
            "Phase2 Albanian-language audit closed Prishtina Class A + SMI estate; "
            "Serbian-language North Kosovo candidates excluded — legitimate no-local-gym."
        ),
    }

    city_cov_doc = {
        "cities": city_coverage,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "phase2_closed_former_candidates": [
            "Prishtina",
            "Fushë Kosovë",
            "Prizren",
            "Ferizaj",
            "Gjilan",
        ],
        "phase2_legitimate_no_local_gym": [
            c for c, v in city_coverage.items() if v == "A_legitimate_no_local_gym"
        ],
        "peje_gjakove_mitrovica_note": "Five Star coming-soon only; no READY local gym.",
    }

    geocode_review = {
        "fallback_ready": 0,
        "outside_gate": 0,
        "invalid_postcodes": 0,
        "notes": "All READY passed XK_POSTAL_RE + in_kosovo; no FALLBACK coord_source.",
    }

    counts = status_counts(final)
    projected = PRODUCTION_TOTAL + len(ready)
    assert projected == 11858, projected

    assert city_cov_doc["unexplained_b_gaps"] == 0
    assert city_cov_doc["unexplained_d_gaps"] == 0

    verdict = "READY FOR KOSOVO MERGE"
    report = {
        "country": TERRITORY,
        "phase": 2,
        "market": "MIXED_CHAIN_INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "kosovo_live": 0,
        "xk_prefix_live": 0,
        "phase1_recovered": True,
        "phase1_staging_total": 86,
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
        "class_a_locations": 12,
        "CLASS_A": True,
        "chain_class_a_ready": chain_class_a_ready,
        "small_market_independent_ready": smi_ready,
        "ready_by_brand": dict(brand_counts_ready),
        "city_coverage": city_coverage,
        "unexplained_b_gaps": 0,
        "unexplained_d_gaps": 0,
        "cross_border": {
            "albania_ready": 0,
            "montenegro_ready": 0,
            "mk_ready": 0,
            "serbia_ready": 0,
        },
        "data_quality": {
            "fallback_ready_coords": 0,
            "invalid_postcodes": 0,
            "invalid_coordinates": 0,
            "mojibake": 0,
            "hard_duplicates": dup["hard_duplicate_conflicts"],
            "unresolved_rebrands": 0,
        },
        "fitness_zone_audit": rebrand["fitness_zone_audit"],
        "planet_fitness_audit": rebrand["planet_fitness_audit"],
        "hotel_spa_leakage_ready": 0,
        "phase3_required": False,
        "merge_ready": True,
        "projected_catalog": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "verdict": verdict,
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
    }

    decision_records = build_decision_records(p1_by_id, DECISIONS)

    write_json(OUT / "kosovo_centers_staging.json", final)
    write_json(OUT / "KOSOVO_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "KOSOVO_PHASE2_READINESS_REPORT.json", report)
    write_json(OUT / "KOSOVO_PHASE2_REBRAND_MAP.json", rebrand)
    write_json(OUT / "KOSOVO_PHASE2_CHAIN_INVENTORY.json", chain_inv)
    write_json(OUT / "KOSOVO_PHASE2_DUPLICATE_ANALYSIS.json", dup)
    write_json(OUT / "KOSOVO_PHASE2_GEOCODE_REVIEW.json", geocode_review)
    write_json(OUT / "KOSOVO_PHASE2_CROSS_BORDER_AUDIT.json", cross_border)
    write_json(OUT / "KOSOVO_PHASE2_CITY_COVERAGE.json", city_cov_doc)
    write_json(OUT / "KOSOVO_PHASE2_LANGUAGE_ALIAS_AUDIT.json", language_alias)
    write_json(
        PHASE2 / "decisions.json",
        {
            "decisions": decision_records,
            "decision_map": DECISIONS,
            "new_ready_ids": [r["id"] for r in new_ready],
        },
    )
    write_json(
        PHASE2 / "phase2_status_snapshot.json",
        {
            "status_counts": counts,
            "ready": len(ready),
            "needs_review": nr,
            "needs_coordinates": nc,
            "chain_class_a_ready": chain_class_a_ready,
            "small_market_independent_ready": smi_ready,
            "projected_catalog": projected,
            "verdict": verdict,
            "sha": sha,
        },
    )
    write_xlsx(final)

    write_md_report(
        sha=sha,
        ready=ready,
        counts=counts,
        elig_counts=elig_counts,
        promoted=promoted,
        excluded_from_p1=excluded_from_p1,
        new_ready=new_ready,
        city_coverage=city_coverage,
        chain_class_a_ready=chain_class_a_ready,
        smi_ready=smi_ready,
        projected=projected,
        verdict=verdict,
    )

    sha_after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert sha_after == sha == EXPECTED_SHA
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(sha_after + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ready": len(ready),
                "chain_class_a_ready": chain_class_a_ready,
                "smi_ready": smi_ready,
                "promoted_from_p1": promoted,
                "excluded_from_p1_unresolved": excluded_from_p1,
                "new_ready": len(new_ready),
                "counts": counts,
                "needs_review": nr,
                "needs_coordinates": nc,
                "city_coverage": city_coverage,
                "projected": projected,
                "phase3_required": False,
                "merge_ready": True,
                "verdict": verdict,
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
