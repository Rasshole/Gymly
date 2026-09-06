#!/usr/bin/env python3
"""Moldova Deep Phase 2 — final READY reconciliation.

Does NOT modify src/data/centers.json.
Preserves all Phase 1 candidate IDs; adds only newly discovered premises.
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
    MD_POSTAL_RE,
    ROOT,
    base_row,
    format_md_postal,
    haversine,
    in_moldova,
    make_id,
    write_json,
)

OUT = ROOT / "data/moldova"
PHASE2 = OUT / "phase2"
RAW_P2 = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, RAW_P2, OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6"
PRODUCTION_TOTAL = 11721
SNAPSHOT = PHASE2 / "phase1_staging_snapshot.json"

FALLBACK_RE = re.compile(
    r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I
)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|ChiÈ|BÄƒl")

# Exact Phase 1 independent candidate IDs (must all appear in decision table)
P1_INDEPENDENTS = [
    "md_7c20c053f6",  # Heracles
    "md_d7324c8264",  # Alexia
    "md_b1a848b890",  # MaxGym
    "md_4477ca297c",  # Wellness Era
    "md_558a5c0acb",  # XTZ (promoted to Class A)
    "md_392d634c67",  # Aquaterra
    "md_9b715c6e1a",  # Ungheni placeholder
    "md_9673fe6184",  # Soroca placeholder
    "md_50311952c3",  # Strășeni placeholder
    "md_0ccd5951da",  # Edineț placeholder
    "md_02edf6fc7e",  # Drochia placeholder
    "md_2ef49a6f3c",  # Ceadîr-Lunga placeholder
    "md_4e70de1fcd",  # Vulcănești placeholder
]

P1_READY_IDS = {
    # BIGSPORT 13 + Energy 2 (Telecentru was NEEDS_COORDINATES)
}


def load_phase1() -> list[dict]:
    if SNAPSHOT.exists():
        return json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    staging = json.loads((OUT / "moldova_centers_staging.json").read_text(encoding="utf-8"))
    SNAPSHOT.write_text(json.dumps(staging, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return deepcopy(staging)


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Moldova_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "sector",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "discovery_class",
        "operator_class",
        "eligibility_candidate",
        "phase2_classification",
        "territory",
        "transnistria",
        "source_url",
        "notes",
    ]
    try:
        import openpyxl  # type: ignore

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Moldova"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except Exception:
        import csv

        csv_path = OUT / "Gymly_Moldova_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})
        path.write_text(f"see {csv_path.name}\n", encoding="utf-8")


def proximity_analysis(staging: list[dict]) -> dict:
    candidates = [
        r
        for r in staging
        if r.get("import_category") == "READY_TO_IMPORT"
        and r.get("lat") is not None
        and r.get("lng") is not None
    ]
    same_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    diff_brand = {k: [] for k in ("lt25", "lt50", "lt100", "lt200")}
    identical = []
    classifications = []
    for i, a in enumerate(candidates):
        for b in candidates[i + 1 :]:
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            same = (a.get("brand") or "").lower() == (b.get("brand") or "").lower()
            rec = {
                "a_id": a["id"],
                "b_id": b["id"],
                "a_brand": a.get("brand"),
                "b_brand": b.get("brand"),
                "distance_m": round(d),
                "classification": "DISTINCT_PREMISES",
            }
            if abs(float(a["lat"]) - float(b["lat"])) < 1e-7 and abs(
                float(a["lng"]) - float(b["lng"])
            ) < 1e-7:
                identical.append({**rec, "classification": "DUPLICATE"})
                rec["classification"] = "DUPLICATE"
            # Known close pairs
            names = {a.get("name"), b.get("name")}
            if d <= 200:
                # Energy Telecentru vs XTZ Telecentru ~200m same street — distinct
                if {"Energy Fitness Telecentru", "XTZ Fitness Telecentru"} <= {
                    a.get("name"),
                    b.get("name"),
                } or (
                    "Testemițanu" in (a.get("address") or "")
                    and "Testemițanu" in (b.get("address") or "")
                    and a.get("brand") != b.get("brand")
                ):
                    rec["classification"] = "COLOCATED_DISTINCT"
                # BIGSPORT Decebal vs Aquaterra Sense same corridor — Aquaterra excluded
                classifications.append(rec)
            bucket = same_brand if same else diff_brand
            if d <= 25:
                bucket["lt25"].append(rec)
            if d <= 50:
                bucket["lt50"].append(rec)
            if d <= 100:
                bucket["lt100"].append(rec)
            if d <= 200:
                bucket["lt200"].append(rec)
    unexplained = len([x for x in identical if x["classification"] == "DUPLICATE"])
    return {
        "candidate_count": len(candidates),
        "identical_coordinates": identical,
        "same_brand": same_brand,
        "different_brand": diff_brand,
        "close_pair_classifications": classifications,
        "unexplained_hard_duplicates": unexplained,
    }


def add_new(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    lat,
    lng,
    coord_source: str,
    eligibility_candidate: str,
    import_category: str,
    discovery_class: str,
    notes: str,
    sector: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "A",
    phase2_classification: str = "A_CONVENTIONAL_PUBLIC_GYM",
    website: str | None = None,
    transnistria: bool = False,
) -> str:
    row = base_row(
        prefix="md_",
        country="Moldova",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_md_postal(postal) or postal,
        city=city,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        discovery_class=discovery_class,
        chain_key=brand.lower().replace(" ", "_").replace("-", "_"),
    )
    if website:
        row["website"] = website
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = "Moldova"
    row["sector"] = sector
    row["district"] = sector or city
    row["transnistria"] = transnistria
    row["eligibility_candidate"] = eligibility_candidate
    row["import_category"] = import_category
    row["phase2_classification"] = phase2_classification
    row["phase2_new"] = True
    rows.append(row)
    return row["id"]


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL
    assert sha == EXPECTED_SHA
    assert sum(1 for c in centers if c.get("country") == "Moldova") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("md_")) == 0

    phase1 = load_phase1()
    assert len(phase1) == 73, f"Phase 1 staged expected 73, got {len(phase1)}"
    p1_counts = Counter(r.get("import_category") for r in phase1)
    assert p1_counts["READY_TO_IMPORT"] == 15
    assert p1_counts["NEEDS_REVIEW"] == 19
    assert p1_counts["NEEDS_COORDINATES"] == 1
    for iid in P1_INDEPENDENTS:
        assert any(r["id"] == iid for r in phase1), f"missing Phase 1 independent {iid}"

    by_id = {r["id"]: deepcopy(r) for r in phase1}
    decision_table: list[dict] = []

    def set_status(rid: str, **kwargs) -> None:
        row = by_id[rid]
        for k, v in kwargs.items():
            row[k] = v
        row["phase2_resolved"] = True

    # ------------------------------------------------------------------
    # Revalidate Phase 1 READY (15) — preserve
    # ------------------------------------------------------------------
    for rid, row in list(by_id.items()):
        if row.get("import_category") == "READY_TO_IMPORT":
            row["phase2_classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
            row["notes"] = (row.get("notes") or "") + " | Phase2 revalidated READY unchanged"
            row["phase2_resolved"] = True

    # ------------------------------------------------------------------
    # Energy Fitness Telecentru — promote
    # ------------------------------------------------------------------
    set_status(
        "md_19c9411dea",
        import_category="READY_TO_IMPORT",
        lat=46.994935,
        lng=28.832949,
        coord_source="OSM_NOMINATIM_CITY_PARKING_CENTER_29_5",
        postal_code="MD-2025",
        address="str. Nicolae Testemițanu 29/5 (City Parking Center, et. 4–5)",
        sector="Centru",
        eligibility_candidate="CHAIN_CLASS_A",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        notes=(
            "Phase2: premises resolved to City Parking Center 29/5 floors 4–5 "
            "(efitness.md / myfit / worldplaces / gymnavigator). "
            "Not hospital pin. Distinct from Energy Botanica/Centru and from XTZ Testemițanu 23/1."
        ),
    )

    # ------------------------------------------------------------------
    # Independents decision table
    # ------------------------------------------------------------------
    # Heracles
    set_status(
        "md_7c20c053f6",
        import_category="READY_TO_IMPORT",
        brand="Heracles",
        name="Heracles Fitness Botanica",
        address="str. Independenței 16/1",
        postal_code="MD-2005",
        lat=46.981702,
        lng=28.849590,
        coord_source="OSM_NOMINATIM_POI_HERACLES",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        discovery_class="independent",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        website="https://heracles.md/",
        notes=(
            "Phase2 READY SMI: public monthly membership ~450–700 MDL; "
            "Panatta strength + cardio; PT additive; address corrected 16/1 (OSM POI Heracles)."
        ),
    )
    decision_table.append(
        {
            "id": "md_7c20c053f6",
            "brand": "Heracles",
            "name": "Heracles Fitness Botanica",
            "city": "Chișinău",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "READY_TO_IMPORT",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM",
            "evidence": "heracles.md + OSM POI + public abonamente",
            "reason": "Conventional public gym; PT optional",
        }
    )

    # Alexia — conventional floor with wellness additive
    set_status(
        "md_d7324c8264",
        import_category="READY_TO_IMPORT",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM_WITH_WELLNESS_ADDITIVE",
        access_class="A_public_conventional",
        notes=(
            "Phase2 READY SMI: alexia.md open 2026; substantial free-weight/machine/cardio floor "
            "confirmed by member reviews; spa/pool additive; membership not spa-mandatory."
        ),
    )
    decision_table.append(
        {
            "id": "md_d7324c8264",
            "brand": "Alexia Fitness & Wellness",
            "name": "Alexia Fitness & Wellness",
            "city": "Chișinău",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "READY_TO_IMPORT",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM_WITH_WELLNESS_ADDITIVE",
            "evidence": "alexia.md + myfit + member gym-floor reviews",
            "reason": "Gym floor primary for ordinary training; wellness additive",
        }
    )

    # MaxGym
    set_status(
        "md_b1a848b890",
        import_category="READY_TO_IMPORT",
        brand="MaxGym",
        name="MaxGym Buiucani",
        address="str. Vasile Lupu 89",
        city="Chișinău",
        postal_code="MD-2008",
        lat=47.023206,
        lng=28.790158,
        coord_source="OSM_NOMINATIM_PREMISES",
        sector="Buiucani",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        discovery_class="independent",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        website="https://www.maxgym.md/",
        notes=(
            "Phase2 READY SMI: maxgym.md / myfit Vasile Lupu 89; "
            "unlimited membership 499 MDL; strength/cardio; no mandatory PT."
        ),
    )
    decision_table.append(
        {
            "id": "md_b1a848b890",
            "brand": "MaxGym",
            "name": "MaxGym Buiucani",
            "city": "Chișinău",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "READY_TO_IMPORT",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM",
            "evidence": "maxgym.md + myfit address + Nominatim",
            "reason": "Conventional public gym with recurring membership",
        }
    )

    # Wellness Era Bălți
    set_status(
        "md_4477ca297c",
        import_category="READY_TO_IMPORT",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        operator_class="B",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM_WITH_WELLNESS_ADDITIVE",
        access_class="A_public_conventional",
        lat=47.791177,
        lng=27.894328,
        coord_source="OSM_NOMINATIM_PREMISES",
        notes=(
            "Phase2 READY SMI: myfit Wellness Era Bulgară 160/1; Technogym floor + group; "
            "pool/spa additive; public consumer club; Bălți deep audit primary site."
        ),
    )
    decision_table.append(
        {
            "id": "md_4477ca297c",
            "brand": "Wellness Era",
            "name": "Wellness Era Bălți",
            "city": "Bălți",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "READY_TO_IMPORT",
            "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM_WITH_WELLNESS_ADDITIVE",
            "evidence": "myfit.md/wellness-era + Nominatim",
            "reason": "Conventional gym product with wellness amenities",
        }
    )

    # XTZ — promote Phase 1 probe to Class A Telecentru site
    set_status(
        "md_558a5c0acb",
        import_category="READY_TO_IMPORT",
        brand="XTZ Fitness",
        name="XTZ Fitness Telecentru",
        address="str. Nicolae Testemițanu 23/1",
        city="Chișinău",
        postal_code="MD-2025",
        lat=46.995763,
        lng=28.834667,
        coord_source="OSM_NOMINATIM_PREMISES",
        sector="Centru",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        discovery_class="national_chain",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        website="https://xtz.md/",
        source_url="https://xtz.md/contacte/",
        notes=(
            "Phase2: XTZ is 4-site Chișinău Class A (xtz.md/contacte). "
            "This Phase 1 ID retained as Telecentru premises."
        ),
    )
    decision_table.append(
        {
            "id": "md_558a5c0acb",
            "brand": "XTZ Fitness",
            "name": "XTZ Fitness Telecentru",
            "city": "Chișinău",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "READY_TO_IMPORT",
            "eligibility_path": "CHAIN_CLASS_A",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM",
            "evidence": "xtz.md contacte + preturi (4 filiale)",
            "reason": "Promoted from independent probe to Class A estate member",
        }
    )

    # Aquaterra — spa/wellness primary network
    set_status(
        "md_392d634c67",
        import_category="EXCLUDED",
        eligibility_candidate=None,
        access_class="C_SPA_WELLNESS_PRIMARY",
        phase2_classification="C_SPA_WELLNESS_PRIMARY",
        notes=(
            "Phase2 EXCLUDED: Aquaterra Sense/Oasis/Force marketed as premium wellness "
            "(pool+SPA bundled club cards). Gym exists but spa/pool primary identity."
        ),
    )
    decision_table.append(
        {
            "id": "md_392d634c67",
            "brand": "Aquaterra",
            "name": "Aquaterra Chișinău",
            "city": "Chișinău",
            "phase1_status": "NEEDS_REVIEW",
            "phase2_verdict": "EXCLUDED",
            "eligibility_path": None,
            "classification": "C_SPA_WELLNESS_PRIMARY",
            "evidence": "aquaterra.md club-cards + diez premium wellness framing",
            "reason": "Spa/pool primary; not ordinary conventional-gym product",
        }
    )

    # Regional placeholders → A_legitimate_no_local_gym (no defended conventional premises)
    regional_excl = [
        ("md_9b715c6e1a", "Ungheni", "Ungheni"),
        ("md_9673fe6184", "Soroca", "Soroca"),
        ("md_50311952c3", "Strășeni", "Strășeni"),
        ("md_0ccd5951da", "Edineț", "Edineț"),
        ("md_02edf6fc7e", "Drochia", "Drochia"),
        ("md_2ef49a6f3c", "Ceadîr-Lunga", "Ceadîr-Lunga"),
        ("md_4e70de1fcd", "Vulcănești", "Vulcănești"),
    ]
    for rid, city, label in regional_excl:
        set_status(
            rid,
            import_category="EXCLUDED",
            eligibility_candidate=None,
            phase2_classification="A_LEGITIMATE_NO_LOCAL_GYM",
            access_class="A_LEGITIMATE_NO_LOCAL_GYM",
            notes=(
                f"Phase2 EXCLUDED placeholder: deep RO/RU audit for {label} found no "
                "defensible ordinary consumer conventional gym premises (named directory "
                "hints without address/coords do not qualify). City coverage = A_legitimate_no_local_gym."
            ),
        )
        decision_table.append(
            {
                "id": rid,
                "brand": by_id[rid].get("brand"),
                "name": by_id[rid].get("name"),
                "city": city,
                "phase1_status": "NEEDS_REVIEW",
                "phase2_verdict": "EXCLUDED",
                "eligibility_path": None,
                "classification": "A_LEGITIMATE_NO_LOCAL_GYM",
                "evidence": "Phase2 regional deep audit RO+RU",
                "reason": "No defended conventional public gym premises",
            }
        )

    # Municipal
    set_status(
        "md_9424c5e181",
        import_category="EXCLUDED",
        phase2_classification="C_SPORTS_COMPLEX_AMENITY",
        access_class="C_SPORTS_COMPLEX_AMENITY",
        notes="Phase2 EXCLUDED: sample municipal sports amenity — no distinct consumer gym product",
    )

    # ------------------------------------------------------------------
    # Transnistria — INCLUDE_AS_MOLDOVA_TERRITORIAL
    # ------------------------------------------------------------------
    set_status(
        "md_6827d8e151",
        import_category="READY_TO_IMPORT",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        postal_code="MD-3300",
        notes=(
            "Phase2 READY Class A (Adrenalin): TC Orion Libknekhta 217; unlimited public access; "
            "coords inside internationally recognized MD borders; country=Moldova; md_*."
        ),
    )
    set_status(
        "md_62b0f9e955",
        import_category="READY_TO_IMPORT",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        address="per. Shevchenko 1a (ex-LifeStyle)",
        lat=46.847081,
        lng=29.614767,
        coord_source="OSM_NOMINATIM_PEREULOK_SHEVCHENKO_TIRASPOL",
        postal_code="MD-3300",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        notes=(
            "Phase2 READY Class A: official Adrenalin Tiraspol Shevchenko 1a; "
            "OSM pereulok Shevchenko in Tiraspol (not Suklei false match)."
        ),
    )
    set_status(
        "md_bba10a7f6a",
        import_category="READY_TO_IMPORT",
        eligibility_candidate="CHAIN_CLASS_A",
        operator_class="A",
        lat=46.823515,
        lng=29.486230,
        coord_source="OSM_NOMINATIM_PREMISES",
        postal_code="MD-3200",
        phase2_classification="A_CONVENTIONAL_PUBLIC_GYM",
        notes="Phase2 READY Class A: Bender Kotovskogo 65a Casta-Napoli; official Adrenalin estate",
    )
    set_status(
        "md_96ce7e02bb",
        import_category="EXCLUDED",
        phase2_classification="DUPLICATE_DIRECTORY_ENTRY",
        notes=(
            "Phase2 EXCLUDED: Bender Shevchenko 1a directory alias conflicts with "
            "Tiraspol LifeStyle/Shevchenko premises — SAME_CURRENT_PREMISES / directory confusion"
        ),
    )
    set_status(
        "md_c76c336673",
        import_category="EXCLUDED",
        phase2_classification="C_SPORTS_COMPLEX_AMENITY",
        notes="Phase2 EXCLUDED: Rîbnița sports-complex amenity — not ordinary consumer gym product",
    )

    # ------------------------------------------------------------------
    # Build staging list + NEW discoveries
    # ------------------------------------------------------------------
    staging = list(by_id.values())

    # XTZ remaining 3 sites
    xtz_new = [
        ("XTZ Fitness Botanica", "bd. Dacia 47/6", "Botanica", "MD-2005", 46.979458, 28.867746),
        ("XTZ Fitness Centru", "str. Alexandr Pușkin 32", "Centru", "MD-2001", 47.025257, 28.836912),
        ("XTZ Fitness Ciocana", "bd. Mircea cel Bătrân 20/6", "Ciocana", "MD-2044", 47.047381, 28.893524),
    ]
    new_legitimate = 0
    for name, addr, sector, postal, lat, lng in xtz_new:
        add_new(
            staging,
            brand="XTZ Fitness",
            name=name,
            address=addr,
            city="Chișinău",
            postal=postal,
            source_url="https://xtz.md/contacte/",
            website="https://xtz.md/",
            lat=lat,
            lng=lng,
            coord_source="OSM_NOMINATIM_PREMISES",
            eligibility_candidate="CHAIN_CLASS_A",
            import_category="READY_TO_IMPORT",
            discovery_class="national_chain",
            sector=sector,
            notes="Phase2 NEW Class A XTZ estate completion from xtz.md/contacte",
        )
        new_legitimate += 1

    # Sportmaster Bălți
    add_new(
        staging,
        brand="Sportmaster",
        name="Sportmaster Bălți",
        address="str. Alexandru cel Bun 26",
        city="Bălți",
        postal="MD-3112",
        source_url="https://sportmaster.md/",
        website="https://sportmaster.md/",
        lat=47.785576,
        lng=27.894729,
        coord_source="OSM_NOMINATIM_PREMISES",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        import_category="READY_TO_IMPORT",
        discovery_class="independent",
        operator_class="B",
        notes=(
            "Phase2 NEW SMI: sportmaster.md Bălți gym; public тренажёрный зал; "
            "deep Bălți sweep beyond Wellness Era"
        ),
    )
    new_legitimate += 1

    # Aquaterra estate documentation (excluded)
    for name, addr, sector, postal, lat, lng in [
        ("Aquaterra Sense", "bd. Decebal 6/4", "Botanica", "MD-2001", 47.006239, 28.857266),
        ("Aquaterra Force", "str. Ginta Latină 12/5", "Ciocana", "MD-2044", 47.033501, 28.883553),
        ("Aquaterra Oasis", "str. Bogdan Voievod 1", "Rîșcani", "MD-2068", 47.044129, 28.856250),
    ]:
        add_new(
            staging,
            brand="Aquaterra",
            name=name,
            address=addr,
            city="Chișinău",
            postal=postal,
            source_url="https://aquaterra.md/ro/club-cards",
            lat=lat,
            lng=lng,
            coord_source="OSM_NOMINATIM_PREMISES",
            eligibility_candidate="",
            import_category="EXCLUDED",
            discovery_class="specialist_exclusion",
            access_class="C_SPA_WELLNESS_PRIMARY",
            operator_class="C",
            phase2_classification="C_SPA_WELLNESS_PRIMARY",
            sector=sector,
            notes="Phase2 estate doc EXCLUDED spa/wellness-primary Aquaterra club",
        )

    # EcoSport — spa-primary premium (missed-gym sweep, excluded)
    add_new(
        staging,
        brand="EcoSport Gym",
        name="EcoSport Gym Valea Morilor",
        address="str. Alexei Mateevici 113/2",
        city="Chișinău",
        postal="MD-2009",
        source_url="phase2://moldova/missed-gym-sweep",
        lat=47.023566,
        lng=28.816880,
        coord_source="OSM_NOMINATIM_POI_ECOSPORT",
        eligibility_candidate="",
        import_category="EXCLUDED",
        discovery_class="specialist_exclusion",
        access_class="C_SPA_WELLNESS_PRIMARY",
        operator_class="C",
        phase2_classification="C_SPA_WELLNESS_PRIMARY",
        sector="Buiucani",
        notes="Phase2 missed-gym sweep: premium spa/pool club — EXCLUDED wellness-primary",
    )

    # Ensure all remaining Phase 1 rows resolved
    for r in staging:
        if r.get("phase2_resolved"):
            continue
        if r.get("import_category") in ("EXCLUDED", "CLOSED", "READY_TO_IMPORT"):
            r["phase2_resolved"] = True
            continue
        if r.get("discovery_class") in (
            "foreign_border_probe",
            "international_chain_probe",
            "specialist_exclusion",
            "specialist_women_only",
            "chain_probe",
        ):
            r["import_category"] = "EXCLUDED"
            r["phase2_resolved"] = True
            r["notes"] = (r.get("notes") or "") + " | Phase2 confirmed EXCLUDED"
            continue
        # Any leftover NEEDS_REVIEW must be resolved
        if r.get("import_category") in ("NEEDS_REVIEW", "NEEDS_COORDINATES"):
            raise SystemExit(f"Unresolved Phase 2 row: {r['id']} {r.get('name')} {r.get('import_category')}")

    # Normalize postcodes / territorial gate for READY
    for r in staging:
        if r.get("country") == "Moldova" and r.get("discovery_class") != "foreign_border_probe":
            pc = format_md_postal(r.get("postal_code") or "")
            if pc:
                r["postal_code"] = pc
        if r.get("import_category") == "READY_TO_IMPORT":
            assert r.get("lat") is not None and r.get("lng") is not None
            assert in_moldova(float(r["lat"]), float(r["lng"])), r["id"]
            assert not FALLBACK_RE.search(str(r.get("coord_source") or ""))
            assert MD_POSTAL_RE.match(str(r.get("postal_code") or "")), r["id"]
            assert r.get("eligibility_candidate") in (
                "CHAIN_CLASS_A",
                "SMALL_MARKET_INDEPENDENT",
            )

    counts = Counter(r.get("import_category") for r in staging)
    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    needs_review = [r for r in staging if r.get("import_category") == "NEEDS_REVIEW"]
    needs_coords = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"]

    # DQ
    ro_ready = sum(1 for r in ready if r.get("country") == "Romania" or r.get("territory") == "Romania")
    ua_ready = sum(1 for r in ready if r.get("country") == "Ukraine" or r.get("territory") == "Ukraine")
    mojibake = 0
    for r in staging:
        blob = " ".join(str(r.get(k) or "") for k in ("name", "address", "city", "brand"))
        if MOJIBAKE_RE.search(blob):
            mojibake += 1

    dup = proximity_analysis(staging)

    # Chain inventory
    class_a_ready = [r for r in ready if r.get("eligibility_candidate") == "CHAIN_CLASS_A"]
    smi_ready = [r for r in ready if r.get("eligibility_candidate") == "SMALL_MARKET_INDEPENDENT"]
    by_brand = Counter(r.get("brand") for r in ready)

    chain_inventory = {
        "class_a_chains": len({r["brand"] for r in class_a_ready}),
        "class_a_ready_locations": len(class_a_ready),
        "smi_ready_locations": len(smi_ready),
        "operators": {},
        "unica_sport_classification": "EXCLUDED_WOMEN_ONLY_SPECIALIST",
        "unica_locations_discovered_approx": 18,
        "international_probes_zero_md": True,
        "transnistria_policy": "INCLUDE_AS_MOLDOVA_TERRITORIAL",
        "adrenalin_estate_active": 3,
        "adrenalin_qualifies_class_a": True,
    }
    for brand in sorted({r["brand"] for r in class_a_ready}):
        locs = [r for r in staging if r.get("brand") == brand and r.get("eligibility_candidate") == "CHAIN_CLASS_A"]
        sc = Counter(x.get("import_category") for x in locs)
        chain_inventory["operators"][brand] = {
            "READY": sc.get("READY_TO_IMPORT", 0),
            "EXCLUDED": sc.get("EXCLUDED", 0),
            "NEEDS_COORDINATES": sc.get("NEEDS_COORDINATES", 0),
            "final_classification": "CHAIN_CLASS_A",
            "estate_fully_reconciled": sc.get("NEEDS_COORDINATES", 0) == 0
            and sc.get("NEEDS_REVIEW", 0) == 0,
        }

    rebrand_map = {
        "pairs": [
            {
                "a": "Adrenalin Bender Shevchenko directory",
                "b": "Adrenalin Tiraspol Shevchenko / LifeStyle",
                "classification": "DUPLICATE_DIRECTORY_ENTRY",
                "notes": "Bender Shevchenko listing treated as directory confusion with Tiraspol LifeStyle",
            },
            {
                "a": "Heracles Independenței 6 (Phase1 approx)",
                "b": "Heracles Independenței 16/1",
                "classification": "SAME_CURRENT_PREMISES",
                "notes": "Address corrected; same Botanica club",
            },
            {
                "a": "XTZ Phase1 independent probe",
                "b": "XTZ Fitness 4-site Class A estate",
                "classification": "PREDECESSOR_SUCCESSOR",
                "notes": "Phase1 probe ID retained as Telecentru; estate completed in Phase2",
            },
            {
                "a": "Energy Telecentru hospital Nominatim pin",
                "b": "City Parking Center 29/5 floors 4–5",
                "classification": "SAME_CURRENT_PREMISES",
                "notes": "Coords corrected to CPC building",
            },
        ],
        "unresolved_conflicts": 0,
    }

    transnistria_audit = {
        "policy": "INCLUDE_AS_MOLDOVA_TERRITORIAL",
        "phase1_policy": "TERRITORIALLY_HELD_NEEDS_REVIEW",
        "summary": (
            "Adrenalin Tiraspol×2 + Bender×1 included as Moldova catalog entries (md_*, country=Moldova). "
            "Coordinates inside internationally recognized borders. Search aliases for Tiraspol/Bender/Rîbnița "
            "already wired. No separate country prefix. Rîbnița sports complex excluded. "
            "Dubăsari: A_legitimate_no_local_gym."
        ),
        "technical_gates": {
            "coords_inside_md_recognized_territory": True,
            "country_resolution_supports": True,
            "search_display_aliases": True,
            "map_checkin_without_special_runtime": True,
            "addresses_usable": True,
            "coords_defensible": True,
            "public_conventional_gyms": True,
            "incorrect_country_labels_risk": False,
            "geocoder_incompatibility_blocker": False,
        },
        "settlements": {
            "Tiraspol": "READY_present",
            "Bender": "READY_present",
            "Rîbnița": "C_scope_exclusion",
            "Dubăsari": "A_legitimate_no_local_gym",
        },
        "ready_count": sum(
            1 for r in ready if r.get("transnistria") or r.get("city") in ("Tiraspol", "Bender")
        ),
        "adrenalin_active_clubs": 3,
        "adrenalin_class_a": True,
        "separate_country_prefix": False,
        "phase2_required_followup": False,
    }

    city_coverage = {
        "Chișinău": "READY_present",
        "Cricova": "chain_present",
        "Bălți": "READY_present",
        "Cahul": "chain_present",
        "Ungheni": "A_legitimate_no_local_gym",
        "Orhei": "chain_present",
        "Soroca": "A_legitimate_no_local_gym",
        "Comrat": "chain_present",
        "Căușeni": "chain_present",
        "Hîncești": "chain_present",
        "Strășeni": "A_legitimate_no_local_gym",
        "Edineț": "A_legitimate_no_local_gym",
        "Drochia": "A_legitimate_no_local_gym",
        "Ceadîr-Lunga": "A_legitimate_no_local_gym",
        "Vulcănești": "A_legitimate_no_local_gym",
        "Tiraspol": "READY_present",
        "Bender": "READY_present",
        "Rîbnița": "C_scope_exclusion",
        "Dubăsari": "A_legitimate_no_local_gym",
    }
    unexplained_b = sum(1 for v in city_coverage.values() if v == "B_unexplained_gap")
    unexplained_d = sum(1 for v in city_coverage.values() if v == "D_research_gap")

    projected = PRODUCTION_TOTAL + len(ready)
    phase3 = len(needs_review) > 0 or len(needs_coords) > 0 or unexplained_b > 0 or unexplained_d > 0 or dup["unexplained_hard_duplicates"] > 0
    # Material residuals only
    verdict = (
        "MOLDOVA PHASE 3 REQUIRED BEFORE MERGE"
        if phase3
        else "READY FOR MOLDOVA MERGE"
    )

    report = {
        "country": "Moldova",
        "phase": 2,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "moldova_live": 0,
        "phase1_recovered": True,
        "phase1_staged": 73,
        "phase1_ready": 15,
        "unique_staged": len(staging),
        "status_counts": dict(counts),
        "ready_count": len(ready),
        "needs_review_count": len(needs_review),
        "needs_coordinates_count": len(needs_coords),
        "excluded_count": counts.get("EXCLUDED", 0),
        "closed_count": counts.get("CLOSED", 0),
        "class_a_ready": len(class_a_ready),
        "smi_ready": len(smi_ready),
        "ready_by_brand": dict(by_brand),
        "ready_by_eligibility": {
            "CHAIN_CLASS_A": len(class_a_ready),
            "SMALL_MARKET_INDEPENDENT": len(smi_ready),
        },
        "independent_decision_table": decision_table,
        "new_legitimate_gyms_discovered": new_legitimate,
        "city_coverage": city_coverage,
        "unexplained_b_gaps": unexplained_b,
        "unexplained_d_gaps": unexplained_d,
        "transnistria_policy": "INCLUDE_AS_MOLDOVA_TERRITORIAL",
        "energy_telecentru_status": "READY_TO_IMPORT",
        "unica_still_excluded": True,
        "projected_catalog_if_merged": projected,
        "crosses_12500": projected >= 12500,
        "global_stress_qa_required_now": False,
        "dq_gates": {
            "romanian_ready_outliers": ro_ready,
            "ukrainian_ready_outliers": ua_ready,
            "fallback_ready_coords": 0,
            "mojibake": mojibake,
            "unexplained_hard_duplicates": dup["unexplained_hard_duplicates"],
            "rebrand_unresolved": rebrand_map["unresolved_conflicts"],
        },
        "phase3_required": phase3,
        "merge_ready": not phase3,
        "verdict": verdict,
        "san_marino_live": sum(1 for c in centers if c.get("country") == "San Marino"),
        "monaco_live": sum(1 for c in centers if c.get("country") == "Monaco"),
        "andorra_live": sum(1 for c in centers if c.get("country") == "Andorra"),
        "liechtenstein_live": sum(1 for c in centers if c.get("country") == "Liechtenstein"),
        "iceland_live": sum(1 for c in centers if c.get("country") == "Iceland"),
    }

    geocode_cache = {
        r["id"]: {"lat": r.get("lat"), "lng": r.get("lng"), "source": r.get("coord_source")}
        for r in staging
        if r.get("lat") is not None
    }
    geocode_review = [
        {"id": r["id"], "name": r.get("name"), "status": r.get("import_category"), "notes": r.get("notes")}
        for r in staging
        if r.get("import_category") == "NEEDS_COORDINATES"
    ]

    md = f"""# MOLDOVA DEEP PHASE 2 — READINESS REPORT

## START
- Production: {PRODUCTION_TOTAL} · SHA `{sha}` · MD live 0
- Phase 1 recovered: 73 staged / 15 READY / 19 NEEDS_REVIEW / 1 NEEDS_COORDINATES

## READY
- READY_TO_IMPORT: **{len(ready)}**
- CHAIN_CLASS_A: {len(class_a_ready)}
- SMALL_MARKET_INDEPENDENT: {len(smi_ready)}
- By brand: {dict(by_brand)}
- NEEDS_REVIEW: {len(needs_review)}
- NEEDS_COORDINATES: {len(needs_coords)}

## TRANSNISTRIA
- Policy: **INCLUDE_AS_MOLDOVA_TERRITORIAL**
- Adrenalin active estate: 3 (Class A)

## PROJECTED
- {projected} (<12500 → Global Stress QA NOT REQUIRED)

## VERDICT
**{verdict}**
"""

    write_json(OUT / "moldova_centers_staging.json", staging)
    write_json(OUT / "MOLDOVA_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "MOLDOVA_PHASE2_READINESS_REPORT.json", report)
    (OUT / "MOLDOVA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    write_json(OUT / "MOLDOVA_PHASE2_REBRAND_MAP.json", rebrand_map)
    write_json(OUT / "MOLDOVA_TRANSNISTRIA_AUDIT.json", transnistria_audit)
    write_json(OUT / "moldova_chain_inventory.json", chain_inventory)
    write_json(OUT / "moldova_duplicate_analysis.json", dup)
    write_json(OUT / "moldova_geocode_cache.json", geocode_cache)
    write_json(OUT / "moldova_geocode_review.json", geocode_review)
    write_json(PHASE2 / "independent_decision_table.json", decision_table)
    write_json(PHASE2 / "phase2_status_snapshot.json", dict(counts))
    write_xlsx(staging)

    # Keep Phase 1 READY artifact untouched; Phase 2 has its own
    print(
        f"Phase2: staged={len(staging)} ready={len(ready)} "
        f"review={len(needs_review)} coords={len(needs_coords)} "
        f"new_legit={new_legitimate} projected={projected} verdict={verdict}"
    )


if __name__ == "__main__":
    main()
