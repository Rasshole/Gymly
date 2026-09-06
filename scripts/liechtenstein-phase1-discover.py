#!/usr/bin/env python3
"""Liechtenstein Phase 1 discovery — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    format_li_postal,
    write_json,
)

OUT = ROOT / "data/liechtenstein"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc"
PRODUCTION_TOTAL = 11692

CITY_CANON = {
    "vaduz": "Vaduz",
    "schaan": "Schaan",
    "triesen": "Triesen",
    "balzers": "Balzers",
    "eschen": "Eschen",
    "nendeln": "Nendeln",
    "mauren": "Mauren",
    "triesenberg": "Triesenberg",
    "ruggell": "Ruggell",
    "gamprin": "Gamprin",
    "gamprin-bendern": "Bendern",
    "bendern": "Bendern",
    "schellenberg": "Schellenberg",
    "planken": "Planken",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().strip()
    return CITY_CANON.get(key) or s


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    source_url: str,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    excluded: bool = False,
    needs_review: bool = False,
    needs_coords: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
    chain_key: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "A",
    territory: str = "Liechtenstein",
) -> None:
    row = base_row(
        prefix="li_",
        country="Liechtenstein",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_li_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
        chain_key=chain_key or brand.lower().replace(" ", "_").replace("-", "_"),
    )
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif closed or import_category == "CLOSED":
        row["import_category"] = "CLOSED"
        row["is_closed"] = True
        row["is_active"] = False
    elif needs_coords or import_category == "NEEDS_COORDINATES":
        row["import_category"] = "NEEDS_COORDINATES"
    elif needs_review or import_category == "NEEDS_REVIEW":
        row["import_category"] = "NEEDS_REVIEW"
    else:
        row["import_category"] = import_category or "READY_TO_IMPORT"
    rows.append(row)


def independent(
    rows: list[dict],
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
    operator_class: str = "E",
    access_class: str = "A_public_conventional",
) -> None:
    add(
        rows,
        brand=brand,
        name=name,
        address=address,
        city=city,
        postal=postal,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes + " | Phase 2 independent candidate",
        needs_review=True,
        operator_class=operator_class,
        discovery_class="independent_candidate",
        access_class="A_public_conventional",
    )


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Liechtenstein") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("li_")) == 0
    assert sum(1 for c in centers if c.get("country") == "Iceland") == 27

    rows: list[dict] = []

    # ── Confirmed conventional public gyms (independent Phase 2 candidates) ──
    independent(
        rows,
        brand="update Fitness",
        name="update Fitness Vaduz",
        address="Landstrasse 117",
        city="Vaduz",
        postal="9490",
        source_url="https://www.update-fitness.ch/vaduz/",
        lat=47.1546705,
        lng=9.5099197,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Single LI site of CH regional chain (70+ CH sites). Class E in LI; not ≥3 LI locations",
        operator_class="E",
    )
    independent(
        rows,
        brand="LieFit",
        name="LieFit Vaduz",
        address="Wuhrstrasse 7",
        city="Vaduz",
        postal="9490",
        source_url="https://liefit.li/",
        lat=47.1354865,
        lng=9.5141048,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="24/7 conventional public gym; 2-site LI operator with GEOWAY Eschen",
        operator_class="E",
    )
    independent(
        rows,
        brand="LieFit",
        name="GEOWAY by LieFit Eschen",
        address="Kohlplatz 9",
        city="Eschen",
        postal="9492",
        source_url="https://www.geoway.li/impressum",
        lat=47.2102133,
        lng=9.5277076,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Second LieFit-branded site (GEOWAY concept); 2-site operator under Class E threshold",
        operator_class="E",
    )
    independent(
        rows,
        brand="purfitness",
        name="purfitness Schaan",
        address="Im alten Riet 22",
        city="Schaan",
        postal="9494",
        source_url="https://www.purfitness.at/",
        lat=47.1747102,
        lng=9.5121756,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Current successor to fitnesshaus by blugym (March 2026 rebrand); 1 LI site of 8-club Vorarlberg network",
        operator_class="E",
    )
    independent(
        rows,
        brand="Lorez",
        name="Lorez Gesundheitscenter Schaan",
        address="Landstrasse 168",
        city="Schaan",
        postal="9494",
        source_url="https://www.lorez-gesundheitscenter.li/kontakt",
        lat=47.1565909,
        lng=9.5092446,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Current successor at Salutaris address; 2 distinct LI premises with Bendern Power Center",
        operator_class="E",
    )
    independent(
        rows,
        brand="Lorez",
        name="Lorez Power Center Bendern",
        address="Industriestrasse 16",
        city="Bendern",
        postal="9487",
        source_url="https://www.power-center.li/kontakt",
        lat=47.2056244,
        lng=9.5035504,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="24h public gym; co-located with Lorez Health Training same premises (3.OG); single import unit",
        operator_class="E",
    )
    independent(
        rows,
        brand="flexigym",
        name="flexigym Balzers",
        address="Landstrasse 25",
        city="Balzers",
        postal="9496",
        source_url="https://www.flexigym.li/impressum",
        lat=47.0767349,
        lng=9.5121186,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Single-site conventional public gym Balzers",
        operator_class="E",
    )
    independent(
        rows,
        brand="In Motion",
        name="In Motion Eschen",
        address="Wirtschaftspark 25",
        city="Eschen",
        postal="9492",
        source_url="https://inmotion.li/fitness/",
        lat=47.2077115,
        lng=9.5340621,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        notes="Physio+finess hybrid with public memberships; borderline Class C — Phase 2 eligibility review",
        operator_class="E",
        access_class="C_physio_fitness_hybrid",
    )

    # ── Legacy / rebrand predecessors ──
    add(
        rows,
        brand="Salutaris",
        name="Salutaris Training Schaan (legacy)",
        address="Landstrasse 168",
        city="Schaan",
        postal="9494",
        source_url="https://salutaris.li/",
        lat=47.1565909,
        lng=9.5092446,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        closed=True,
        operator_class="F",
        discovery_class="legacy_rebrand",
        notes="Predecessor identity at Landstrasse 168; successor Lorez Gesundheitscenter — E_legacy_closed",
    )
    add(
        rows,
        brand="fitnesshaus by blugym",
        name="fitnesshaus by blugym Schaan (legacy)",
        address="Im alten Riet 22",
        city="Schaan",
        postal="9494",
        source_url="https://www.vaterland.li/marktnews/marktkonsum/ein-jahr-fitnesshaus-by-blugym-schaan-art-502752",
        lat=47.1747102,
        lng=9.5121756,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        closed=True,
        operator_class="F",
        discovery_class="legacy_rebrand",
        notes="Rebranded purfitness Schaan March 2026 — A_current_successor",
    )
    add(
        rows,
        brand="Lorez",
        name="Lorez Health Training Bendern (co-located unit)",
        address="Industriestrasse 16",
        city="Bendern",
        postal="9487",
        source_url="https://www.health-training.li/kontakt",
        lat=47.2056244,
        lng=9.5035504,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        import_category="DUPLICATE",
        operator_class="E",
        discovery_class="co_located_unit",
        notes="Same-premises coached program; consumer 24h entry via Lorez Power Center — B_co_located_not_separate_club",
    )

    # ── Scope exclusions (Class C/E) ──
    add(
        rows,
        brand="Bro Performance",
        name="Bro Performance Schaan",
        address="Landstrasse 152",
        city="Schaan",
        postal="9494",
        source_url="https://broperformance.li/",
        lat=47.1578836,
        lng=9.5093602,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        excluded=True,
        operator_class="E",
        access_class="E_boutique_performance_limited",
        discovery_class="class_e_probe",
        notes="Semi-private performance studio (~120 member cap); not classic public gym",
    )
    add(
        rows,
        brand="WOMEN'S GYM",
        name="WOMEN'S GYM Eschen",
        address="Wirtschaftspark 2",
        city="Eschen",
        postal="9492",
        source_url="https://www.womens-gym.ch/",
        lat=47.2063569,
        lng=9.5334790,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        excluded=True,
        operator_class="C",
        access_class="C_women_only_micro_studio",
        discovery_class="class_c_probe",
        notes="Women-only micro-studio; 1 of 7-site CH/Rheintal network",
    )
    add(
        rows,
        brand="Sportcenter Lampert",
        name="Sportcenter Lampert Bendern",
        address="Eschner Strasse 53",
        city="Bendern",
        postal="9487",
        source_url="https://sportcenter-lampert.li/kontakt/",
        lat=47.2114404,
        lng=9.5089382,
        coord_source="OFFICIAL_PREMISES_NOMINATIM",
        excluded=True,
        operator_class="C",
        access_class="C_martial_arts_primary",
        discovery_class="class_c_probe",
        notes="Combat-sports-primary facility; badge self-training secondary",
    )
    add(
        rows,
        brand="Called 4 CrossFit",
        name="Called 4 CrossFit Balzers",
        address="Föhrenweg 5",
        city="Balzers",
        postal="9496",
        source_url="https://www.crossfitlist.com/",
        lat=47.0769093,
        lng=9.5095698,
        coord_source="NOMINATIM_PREMISES",
        excluded=True,
        operator_class="C",
        access_class="C_crossfit_box",
        discovery_class="class_c_probe",
        notes="Official CrossFit affiliate; out of conventional public gym scope",
    )
    add(
        rows,
        brand="Budokan",
        name="Budokan Fitness & Martial Arts Academy Schaan",
        address="Im alten Riet 153",
        city="Schaan",
        postal="9494",
        source_url="https://bewegt.li/verein/budokan-fitness-martial-arts-academy-liechtens.html",
        lat=47.1773541,
        lng=9.5151707,
        coord_source="NOMINATIM_PREMISES",
        excluded=True,
        operator_class="C",
        access_class="C_martial_arts_primary",
        discovery_class="class_c_probe",
        notes="Martial arts academy with fitness elements",
    )
    add(
        rows,
        brand="Fita",
        name="Fita Fitness und Tanz Nendeln",
        address="Keltenstrasse 15",
        city="Nendeln",
        postal="9485",
        source_url="https://www.eschen.li/leben-soziales/vereine/fita-fitness-und-tanz-liechtenstein/",
        lat=47.1942943,
        lng=9.5432218,
        coord_source="NOMINATIM_PREMISES",
        excluded=True,
        operator_class="E",
        access_class="E_dance_fitness_club",
        discovery_class="class_e_probe",
        notes="Dance/fitness Verein; not conventional public gym chain model",
    )

    # ── International / regional chain absence probes (Class F) ──
    absent = [
        ("clever fit", "https://www.clever-fit.com/", "No LI club; Feldkirch AT only"),
        ("ACTIV FITNESS", "https://activfitness.ch/", "No LI club; CH network only"),
        ("basefit.ch / PureGym Switzerland", "https://www.basefit.ch/", "No LI club"),
        ("NonStop Gym", "https://nonstopgym.com/", "No LI club"),
        ("Migros Fitness", "https://www.migros.ch/", "No LI club"),
        ("Let's Go Fitness", "https://letsgo-fitness.ch/", "No LI club"),
        ("Fitnesspark", "https://fitnesspark.ch/", "No LI club"),
        ("Mrs.Sporty", "https://www.mrssporty.com/", "No LI club"),
        ("fit+", "https://www.fitplus.ch/", "No LI club"),
        ("Anytime Fitness", "https://www.anytimefitness.com/", "No LI club"),
        ("Basic-Fit", "https://www.basic-fit.com/", "No LI club"),
        ("McFIT", "https://www.mcfit.com/", "No LI club"),
        ("JOHN REED", "https://johnreed.fitness/", "No LI club"),
        ("FITINN", "https://www.fitinn.at/", "No AT/LI club in territory"),
        ("Fitness First", "https://www.fitnessfirst.com/", "No LI club"),
        ("Gold's Gym", "https://www.goldsgym.com/", "No LI club"),
        ("World Class", "https://worldclass.is/", "No LI club"),
        ("JIMS", "https://www.jims.lu/", "No LI club"),
        ("Keep Cool", "https://keepcool.fr/", "No LI club"),
        ("Fitness Park", "https://www.fitnesspark.fr/", "No LI club"),
        ("L'Orange Bleue", "https://www.lorangebleue.fr/", "No LI club"),
        ("MyFitness", "https://myfitness.ee/", "No LI club"),
        ("Lemon Gym", "https://lemongym.lt/", "No LI club"),
        ("Gym!", "https://www.gym.fi/", "No LI club"),
        ("Gym+", "https://gymplus.fi/", "No LI club"),
        ("Impuls", "https://www.impuls-gym.de/", "No LI club"),
        ("24-7 Fitness", "https://247fitness.co/", "No LI club"),
        ("ALTERLIFE", "https://alterlife.gr/", "No LI club"),
    ]
    for brand, url, note in absent:
        add(
            rows,
            brand=brand,
            name=f"{brand} (Liechtenstein absent probe)",
            address="",
            city="",
            postal="",
            source_url=url,
            excluded=True,
            operator_class="F",
            discovery_class="international_absent",
            notes=note,
        )

    # ── Cross-border contamination probes (must never become READY) ──
    foreign = [
        ("update Fitness Buchs SG", "update Fitness", "Landstrasse, 9470 Buchs SG", "Buchs", "9470", "Switzerland", 47.167, 9.475),
        ("clever fit Feldkirch", "clever fit", "Leonhardsplatz 2, 6800 Feldkirch", "Feldkirch", "6800", "Austria", 47.2355213, 9.5977646),
        ("NonStop Gym Buchs", "NonStop Gym", "Bahnhofstrasse, 9470 Buchs SG", "Buchs", "9470", "Switzerland", 47.168, 9.478),
        ("ACTIV FITNESS St. Gallen", "ACTIV FITNESS", "St. Gallen", "St. Gallen", "9000", "Switzerland", 47.424, 9.376),
        ("purfitness Hohenems", "purfitness", "Diepoldsauerstraße 55, 6845 Hohenems", "Hohenems", "6845", "Austria", 47.36, 9.68),
    ]
    for label, brand, addr, city, postal, territory, lat, lng in foreign:
        add(
            rows,
            brand=brand,
            name=f"{label} (foreign border probe)",
            address=addr,
            city=city,
            postal=postal,
            source_url="https://www.openstreetmap.org/",
            lat=lat,
            lng=lng,
            coord_source="BORDER_PROBE",
            excluded=True,
            operator_class="F",
            territory=territory,
            discovery_class="foreign_border_probe",
            notes=f"Rhine Valley cross-border probe — physical premises outside LI ({territory})",
        )

    write_json(OUT / "liechtenstein_phase1_candidates.json", rows)
    write_json(
        OUT / "raw/discovery_summary.json",
        {
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": sha,
            "iceland_live": 27,
            "candidates": len(rows),
            "independent_candidates": sum(
                1 for r in rows if r.get("discovery_class") == "independent_candidate"
            ),
        },
    )
    print(f"Liechtenstein Phase 1 discover: {len(rows)} candidates staged")
    print(f"Production SHA verified: {sha[:16]}...")


if __name__ == "__main__":
    main()
