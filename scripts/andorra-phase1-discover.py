#!/usr/bin/env python3
"""Andorra Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_ad_postal,
    write_json,
)

OUT = ROOT / "data/andorra"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc"
PRODUCTION_TOTAL = 11699

CITY_CANON = {
    "andorra la vella": "Andorra la Vella",
    "escaldes-engordany": "Escaldes-Engordany",
    "escaldes": "Escaldes-Engordany",
    "engordany": "Escaldes-Engordany",
    "sant julià de lòria": "Sant Julià de Lòria",
    "sant julia de loria": "Sant Julià de Lòria",
    "la massana": "La Massana",
    "encamp": "Encamp",
    "canillo": "Canillo",
    "ordino": "Ordino",
    "santa coloma": "Santa Coloma",
    "pas de la casa": "Pas de la Casa",
    "arinsal": "Arinsal",
    "anyós": "Anyós",
    "anyos": "Anyós",
}

PARISH = {
    "Andorra la Vella": "Andorra la Vella",
    "Santa Coloma": "Andorra la Vella",
    "Escaldes-Engordany": "Escaldes-Engordany",
    "Sant Julià de Lòria": "Sant Julià de Lòria",
    "La Massana": "La Massana",
    "Arinsal": "La Massana",
    "Anyós": "La Massana",
    "Encamp": "Encamp",
    "Pas de la Casa": "Encamp",
    "Canillo": "Canillo",
    "Ordino": "Ordino",
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
    territory: str = "Andorra",
    parish: str | None = None,
    eligibility_candidate: str | None = None,
    website: str | None = None,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="ad_",
        country="Andorra",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_ad_postal(postal) or postal,
        city=city_c,
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
    if website:
        row["website"] = website
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    row["parish"] = parish or PARISH.get(city_c, city_c)
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
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
        row["verification_status"] = "PHASE1_CANDIDATE"
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
    lat: float | None,
    lng: float | None,
    coord_source: str,
    notes: str,
    operator_class: str = "E",
    access_class: str = "A_public_conventional",
    chain_key: str | None = None,
    website: str | None = None,
) -> None:
    add(
        rows,
        brand=brand,
        name=name,
        address=address,
        city=city,
        postal=postal,
        source_url=source_url,
        website=website or source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes + " | Phase 2 independent candidate",
        needs_review=True,
        operator_class=operator_class,
        discovery_class="independent_candidate",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        access_class=access_class,
        chain_key=chain_key,
    )


def municipal(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    lat: float | None,
    lng: float | None,
    notes: str,
) -> None:
    add(
        rows,
        brand=brand,
        name=name,
        address=address,
        city=city,
        postal=postal,
        source_url=source_url,
        website=source_url,
        lat=lat,
        lng=lng,
        coord_source="OFFICIAL_OR_DIRECTORY" if lat else None,
        notes=notes + " | municipal/comú — Phase 2 must confirm conventional gym equivalence",
        needs_review=True,
        operator_class="C",
        discovery_class="municipal_sports_center",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        access_class="B_sports_complex_possible_gym",
        chain_key="municipal_" + brand.lower().replace(" ", "_"),
    )


def main() -> None:
    raw_bytes = CENTERS.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    centers = json.loads(raw_bytes)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Liechtenstein") == 7
    assert sum(1 for c in centers if c.get("country") == "Andorra") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("ad_")) == 0

    rows: list[dict] = []

    # ------------------------------------------------------------------
    # Urban Gym / AnyósPark group — potential Class A (≥3 year-round)
    # Staged as NEEDS_REVIEW under INDEPENDENT_PHASE_RECOMMENDED
    # ------------------------------------------------------------------
    independent(
        rows,
        brand="AnyósPark",
        name="AnyósPark Club La Massana",
        address="Carrer Anyós Park s/n, Anyós",
        city="La Massana",
        postal="AD400",
        source_url="https://anyosparkclub.com/",
        website="https://anyosparkclub.com/",
        lat=42.53193,
        lng=1.52410,
        coord_source="OFFICIAL_MAP_PIN",
        notes="Flagship of Urban Gym/AnyósPark group; Technogym floor + activities; public club membership; multi-sport amenities coexist",
        chain_key="urban_anyospark",
        operator_class="E",
    )
    independent(
        rows,
        brand="Urban Gym",
        name="Urban Gym Andorra la Vella",
        address="Avinguda Prat de la Creu 16",
        city="Andorra la Vella",
        postal="AD500",
        source_url="https://urban.ad/contacte/",
        website="https://urban.ad/",
        lat=42.50685,
        lng=1.52135,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes="Year-round Urban Gym; group estate with AnyósPark/Canillo/Arinsal",
        chain_key="urban_anyospark",
        operator_class="E",
    )
    independent(
        rows,
        brand="Urban Gym",
        name="Urban Gym Canillo",
        address="Palau de Gel d'Andorra, 2a planta",
        city="Canillo",
        postal="AD100",
        source_url="https://urban.ad/canillo",
        website="https://urban.ad/canillo",
        lat=42.5665,
        lng=1.5975,
        coord_source="HIGH_CONFIDENCE_PREMISES_GEOCODE",
        notes="Urban Gym inside Palau de Gel; year-round fitness + directed activities",
        chain_key="urban_anyospark",
        operator_class="E",
    )
    independent(
        rows,
        brand="Urban Gym",
        name="Urban Gym Arinsal",
        address="Carretera de Comallempla, Arinsal",
        city="Arinsal",
        postal="AD400",
        source_url="https://urban.ad/app-info-centre-urban-gym-arinsal/",
        website="https://urban.ad/app-info-centre-urban-gym-arinsal/",
        lat=42.5722,
        lng=1.4840,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes="SEASONAL Dec–Apr/May only per official Urban Gym page; not year-round Class A unit",
        chain_key="urban_anyospark",
        operator_class="E",
    )

    # ------------------------------------------------------------------
    # Independent commercial conventional candidates
    # ------------------------------------------------------------------
    independent(
        rows,
        brand="Duplex Sport Club",
        name="Duplex Sport Club Andorra la Vella",
        address="Carrer Pau Casals 4",
        city="Andorra la Vella",
        postal="AD500",
        source_url="https://www.duplexandorra.com/",
        website="https://www.duplexandorra.com/",
        lat=42.5074,
        lng=1.5219,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes="Conventional urban gym; cardio/weights + directed classes; long-running ALV premises",
    )
    independent(
        rows,
        brand="NEXT Sports Club",
        name="NEXT Sports Club Illa Carlemany",
        address="Avinguda Carlemany 68/70, Planta 2",
        city="Escaldes-Engordany",
        postal="AD700",
        source_url="https://nextandorra.com/contacte/",
        website="https://nextandorra.com/",
        lat=42.5088,
        lng=1.5345,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes=">1000 m² urban gym in Illa Carlemany; public membership; conventional floor",
    )
    independent(
        rows,
        brand="Princiesport",
        name="Princiesport Santa Coloma",
        address="Avinguda Enclar 105",
        city="Santa Coloma",
        postal="AD500",
        source_url="https://www.princiesport.net/gimnas",
        website="https://www.princiesport.net/",
        lat=42.4945,
        lng=1.4980,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes="Racket club with claimed 500 m² gym; Phase 2 must decide if conventional gym or Class C racket-primary",
        access_class="B_sports_complex_possible_gym",
        operator_class="E",
    )

    # ------------------------------------------------------------------
    # Municipal / comú sports centres — Phase 2 scope gate
    # ------------------------------------------------------------------
    municipal(
        rows,
        brand="Serradells",
        name="Centre Esportiu dels Serradells",
        address="Carrer dels Serradells",
        city="Andorra la Vella",
        postal="AD500",
        source_url="https://www.andorralavella.ad/",
        lat=42.5015,
        lng=1.5180,
        notes="Main ALV communal sports centre; pools + fitness area; public municipal membership model",
    )
    municipal(
        rows,
        brand="Centre Esportiu Escaldes-Engordany",
        name="Centre Esportiu Comunal Escaldes-Engordany",
        address="Escaldes-Engordany",
        city="Escaldes-Engordany",
        postal="AD700",
        source_url="https://e-e.ad/",
        lat=42.5095,
        lng=1.5360,
        notes="Communal pools/gym/cycle; widely used by residents; confirm conventional gym vs amenity",
    )
    municipal(
        rows,
        brand="CEO Ordino",
        name="Centre Esportiu d'Ordino",
        address="Travessia d'Ordino 1",
        city="Ordino",
        postal="AD300",
        source_url="https://ceo.ad/ca/",
        lat=42.5558,
        lng=1.5332,
        notes="375 m² Technogym gym + pool/spa; strong municipal conventional-gym candidate",
    )
    municipal(
        rows,
        brand="Complex Esportiu Encamp",
        name="Complex Esportiu i Sociocultural d'Encamp",
        address="Encamp",
        city="Encamp",
        postal="AD200",
        source_url="https://www.encamp.ad/",
        lat=42.5360,
        lng=1.5828,
        notes="Communal pool + weight room; parish primary gym access",
    )
    municipal(
        rows,
        brand="Centre Esportiu Pas de la Casa",
        name="Centre Esportiu del Pas de la Casa",
        address="Pas de la Casa",
        city="Pas de la Casa",
        postal="AD200",
        source_url="https://www.encamp.ad/",
        lat=42.5425,
        lng=1.7335,
        notes="Communal gym/pools serving Pas residents and seasonal workers; inside Andorra east",
    )
    municipal(
        rows,
        brand="LAUesport",
        name="LAUesport Sant Julià de Lòria",
        address="Sant Julià de Lòria",
        city="Sant Julià de Lòria",
        postal="AD600",
        source_url="https://www.santjulia.ad/",
        lat=42.4638,
        lng=1.4915,
        notes="Reference communal sports centre; pools + gym + group activities",
    )

    # ------------------------------------------------------------------
    # Hotel / spa / premium thermal — EXCLUDED Class C
    # ------------------------------------------------------------------
    add(
        rows,
        brand="Club Caldea",
        name="Club Caldea Escaldes",
        address="Parc de la Mola 10",
        city="Escaldes-Engordany",
        postal="AD700",
        source_url="https://www.caldea.com/ca/club",
        website="https://www.caldea.com/ca/club",
        lat=42.5112,
        lng=1.5390,
        coord_source="OFFICIAL_ADDRESS_GEO",
        notes="Premium thermal spa club; gym bundled with spa/pool/padel membership — not ordinary conventional gym",
        excluded=True,
        discovery_class="hotel_spa_amenity",
        operator_class="C",
        access_class="C_spa_primary_club",
    )

    # ------------------------------------------------------------------
    # CrossFit / boutique / specialist — EXCLUDED
    # ------------------------------------------------------------------
    add(
        rows,
        brand="CrossFit Les Valls",
        name="CrossFit Les Valls",
        address="Andorra la Vella",
        city="Andorra la Vella",
        postal="AD500",
        source_url="https://www.crossfitlesvalls.com/",
        excluded=True,
        discovery_class="specialist_studio",
        operator_class="C",
        access_class="C_crossfit_box",
        notes="CrossFit box — Class C specialist exclusion",
        lat=42.5070,
        lng=1.5220,
        coord_source="DIRECTORY",
    )
    add(
        rows,
        brand="La Borda CrossFit",
        name="La Borda CrossFit Santa Coloma",
        address="Avinguda Santa Coloma 136",
        city="Santa Coloma",
        postal="AD500",
        source_url="https://www.labordacrossfit.com/",
        excluded=True,
        discovery_class="specialist_studio",
        operator_class="C",
        access_class="C_crossfit_box",
        notes="CrossFit box — Class C specialist exclusion",
        lat=42.4955,
        lng=1.4995,
        coord_source="OFFICIAL_ADDRESS_GEO",
    )
    add(
        rows,
        brand="Primatesag",
        name="Primatesag Andorra",
        address="Andorra la Vella",
        city="Andorra la Vella",
        postal="AD500",
        source_url="https://elysiumconsultingfirm.com/en/publications/gyms-in-andorra-by-parish-where-to-train-in-each-area-of-the-country",
        excluded=True,
        discovery_class="specialist_studio",
        operator_class="C",
        access_class="C_strength_specialist",
        notes="Strength/calisthenics/powerlifting specialist — Class C",
        lat=42.5060,
        lng=1.5210,
        coord_source="DIRECTORY",
    )

    # ------------------------------------------------------------------
    # International chain Class F absences
    # ------------------------------------------------------------------
    absent = [
        "Basic-Fit",
        "Anytime Fitness",
        "McFIT",
        "JOHN REED",
        "Fitness First",
        "Gold's Gym",
        "World Class",
        "clever fit",
        "FITINN",
        "JIMS",
        "Keep Cool",
        "Fitness Park",
        "L'Orange Bleue",
        "MyFitness",
        "Lemon Gym",
        "Gym!",
        "Gym+",
        "Impuls",
        "24/7 Fitness",
        "ALTERLIFE",
        "update Fitness",
        "ACTIV FITNESS",
        "PureGym",
        "NonStop Gym",
        "VivaGym",
        "Synergym",
        "Altafit",
        "Metropolitan",
        "DIR",
        "Snap Fitness",
        "Curves",
        "Body Factory",
    ]
    for brand in absent:
        add(
            rows,
            brand=brand,
            name=f"{brand} Andorra (absent probe)",
            address="",
            city="Andorra la Vella",
            postal="",
            source_url="phase1_international_probe",
            notes="No verified current Andorra conventional locations — Class F absence",
            excluded=True,
            discovery_class="international_absent",
            operator_class="F",
            access_class="F_absent",
            chain_key=brand.lower().replace(" ", "_").replace("'", "").replace("!", "").replace("+", "plus"),
        )

    # ------------------------------------------------------------------
    # Foreign border probes — EXCLUDED
    # ------------------------------------------------------------------
    for name, city, country, lat, lng, notes in [
        (
            "Gym probe La Seu d'Urgell (Spain)",
            "La Seu d'Urgell",
            "Spain",
            42.3580,
            1.4560,
            "Spanish border city south of Andorra — foreign probe",
        ),
        (
            "Gym probe Puigcerdà (Spain)",
            "Puigcerdà",
            "Spain",
            42.4310,
            1.9280,
            "Spanish Cerdanya — foreign probe",
        ),
        (
            "Gym probe L'Hospitalet-près-l'Andorre (France)",
            "L'Hospitalet-près-l'Andorre",
            "France",
            42.5900,
            1.8010,
            "French Ariège border — foreign probe",
        ),
        (
            "Gym probe Ax-les-Thermes (France)",
            "Ax-les-Thermes",
            "France",
            42.7200,
            1.8390,
            "French spa town north of Andorra — foreign probe",
        ),
    ]:
        add(
            rows,
            brand="FOREIGN_BORDER_PROBE",
            name=name,
            address=city,
            city=city,
            postal="",
            source_url="phase1_border_probe",
            notes=notes,
            excluded=True,
            discovery_class="foreign_border_probe",
            operator_class="F",
            territory=country,
            lat=lat,
            lng=lng,
            coord_source="BORDER_PROBE",
            access_class="F_foreign",
        )

    write_json(OUT / "andorra_phase1_candidates.json", rows)
    write_json(
        RAW / "discovery_summary.json",
        {
            "country": "Andorra",
            "phase": 1,
            "production_sha256": sha,
            "production_total": PRODUCTION_TOTAL,
            "andorra_live": 0,
            "liechtenstein_live": 7,
            "candidate_rows": len(rows),
            "independent_candidates": sum(
                1 for r in rows if r.get("discovery_class") == "independent_candidate"
            ),
            "municipal_candidates": sum(
                1 for r in rows if r.get("discovery_class") == "municipal_sports_center"
            ),
            "urban_anyospark_year_round": 3,
            "urban_anyospark_seasonal": 1,
            "class_a_assessment": {
                "operator": "Urban Gym / AnyósPark",
                "year_round_locations": 3,
                "seasonal_locations": 1,
                "meets_ge3_threshold": True,
                "phase1_ready_promoted": False,
                "reason": "INDEPENDENT_PHASE_RECOMMENDED — independents + municipal essential for coverage",
            },
        },
    )
    print(
        json.dumps(
            {
                "candidates": len(rows),
                "sha": sha,
                "andorra_live": 0,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
