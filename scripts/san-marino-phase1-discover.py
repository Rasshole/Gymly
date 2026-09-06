#!/usr/bin/env python3
"""San Marino Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_sm_postal,
    write_json,
)

OUT = ROOT / "data/san-marino"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28"
PRODUCTION_TOTAL = 11715

CITY_CANON = {
    "san marino": "Città di San Marino",
    "città di san marino": "Città di San Marino",
    "citta di san marino": "Città di San Marino",
    "borgo maggiore": "Borgo Maggiore",
    "serravalle": "Serravalle",
    "dogana": "Dogana",
    "domagnano": "Domagnano",
    "fiorentino": "Fiorentino",
    "acquaviva": "Acquaviva",
    "faetano": "Faetano",
    "chiesanuova": "Chiesanuova",
    "montegiardino": "Montegiardino",
    "galazzano": "Galazzano",
    "rimini": "Rimini",
    "verucchio": "Verucchio",
    "coriano": "Coriano",
    "san leo": "San Leo",
    "sassofeltrio": "Sassofeltrio",
}

CASTELLO = {
    "Città di San Marino": "San Marino",
    "Borgo Maggiore": "Borgo Maggiore",
    "Serravalle": "Serravalle",
    "Dogana": "Serravalle",
    "Galazzano": "Serravalle",
    "Domagnano": "Domagnano",
    "Fiorentino": "Fiorentino",
    "Acquaviva": "Acquaviva",
    "Faetano": "Faetano",
    "Chiesanuova": "Chiesanuova",
    "Montegiardino": "Montegiardino",
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
    territory: str = "San Marino",
    castello: str | None = None,
    eligibility_candidate: str | None = None,
    website: str | None = None,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="sm_",
        country="San Marino" if territory == "San Marino" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_sm_postal(postal) or postal,
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
    row["castello"] = castello or CASTELLO.get(city_c, city_c)
    row["district"] = row["castello"]
    row["parish"] = row["castello"]
    if eligibility_candidate:
        row["eligibility_candidate"] = eligibility_candidate
    if import_category:
        row["import_category"] = import_category
    elif excluded:
        row["import_category"] = "EXCLUDED"
    elif closed:
        row["import_category"] = "CLOSED"
    elif coming:
        row["import_category"] = "COMING_SOON"
    elif needs_coords:
        row["import_category"] = "NEEDS_COORDINATES"
    elif needs_review:
        row["import_category"] = "NEEDS_REVIEW"
    else:
        row["import_category"] = "READY_TO_IMPORT"
    rows.append(row)


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, f"production total drift: {len(centers)}"
    assert sha == EXPECTED_SHA, f"SHA drift: {sha}"
    assert sum(1 for c in centers if c.get("country") == "San Marino") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("sm_")) == 0

    rows: list[dict] = []

    # --- Independent conventional public gym candidates (NEEDS_REVIEW) ---
    add(
        rows,
        brand="Dynamic Fitness Center",
        name="Dynamic Fitness Center Dogana",
        address="Strada del Bargello, 111",
        city="Dogana",
        postal="47891",
        source_url="https://www.dynamicsanmarino.com/",
        website="https://www.dynamicsanmarino.com/",
        notes="Independent commercial gym; public monthly/annual Fitness abbonamenti; Dogana/Serravalle | Phase 1 NEEDS_REVIEW",
        lat=43.9812605,
        lng=12.4971575,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="independent_candidate",
        access_class="A_CONVENTIONAL_PUBLIC_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="Serravalle",
    )
    add(
        rows,
        brand="Phisicol",
        name="Phisicol Fitness Club Borgo Maggiore",
        address="Via 28 Luglio, 218",
        city="Borgo Maggiore",
        postal="47893",
        source_url="https://www.phisicol.it/",
        website="https://www.phisicol.it/",
        notes="Independent fitness club; sala attrezzi + cardio + courses; public membership | Phase 1 NEEDS_REVIEW",
        lat=43.9461526,
        lng=12.4561009,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="independent_candidate",
        access_class="A_CONVENTIONAL_PUBLIC_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="Borgo Maggiore",
    )
    add(
        rows,
        brand="Energia Wellness & Fitness",
        name="Energia Wellness & Fitness Serravalle",
        address="Strada Bulumina, 3",
        city="Serravalle",
        postal="47899",
        source_url="https://www.energia.sm/info",
        website="https://www.energia.sm/",
        notes="Commercial club with public abbonamenti; wellness/medical campus co-located — Phase 2 must confirm gym-floor vs spa-primary | Phase 1 NEEDS_REVIEW",
        lat=43.9670579,
        lng=12.4704857,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="independent_candidate",
        access_class="A_CONVENTIONAL_PUBLIC_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="Serravalle",
    )
    add(
        rows,
        brand="MOVE",
        name="MOVE Sala Pesi Città di San Marino",
        address="Strada di Montecchio, 15 (Centro sportivo)",
        city="Città di San Marino",
        postal="47890",
        source_url="https://www.move.sm/contatti/",
        website="https://www.move.sm/",
        notes="Independent Technogym/Xenios sala pesi inside municipal sports center campus; public membership | Phase 1 NEEDS_REVIEW",
        lat=43.9294944,
        lng=12.4419260,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="independent_candidate",
        access_class="A_CONVENTIONAL_PUBLIC_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="San Marino",
    )
    add(
        rows,
        brand="Federazione Sammarinese Body Building",
        name="FSBB Palestra Galazzano",
        address="Via Nicolino di Galasso, 21",
        city="Galazzano",
        postal="47899",
        source_url="https://ifbbproitaly.com/abbonamenti/",
        website="https://ifbbproitaly.com/",
        notes="Federation-operated 500 m² Hammer Strength / Life Fitness floor; public monthly–annual abbonamenti (incl. day packs); not athlete-only | Phase 1 NEEDS_REVIEW municipal/federation path",
        lat=43.9801816,
        lng=12.4828143,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="municipal_sports_center",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="Serravalle",
    )
    add(
        rows,
        brand="FitLife",
        name="FitLife San Marino Domagnano",
        address="Via Ornera, 6",
        city="Domagnano",
        postal="47895",
        source_url="https://www.sportclubby.com/it/san-marino/fitlife-san-marino",
        website="https://www.sanmarino.it/palestre-san-marino/fit-life-san-marino/",
        notes="Current FitLife identity at former Piletas Fitness Center premises; conventional gym equipment + classes | Phase 1 NEEDS_REVIEW; rebrand Piletas→FitLife",
        lat=43.9538961,
        lng=12.4674252,
        coord_source="OSM_NOMINATIM_PREMISES",
        discovery_class="independent_candidate",
        access_class="A_CONVENTIONAL_PUBLIC_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
        castello="Domagnano",
    )

    # --- Multieventi / CONS complex (exclude as consumer gym) ---
    add(
        rows,
        brand="Multieventi Sport Domus",
        name="Multieventi Sport Domus Serravalle",
        address="Via Rancaglia, 30",
        city="Serravalle",
        postal="47899",
        source_url="https://www.cons.sm/impianti/multieventi/",
        notes="CONS multi-sport arena (basket/volley/swim/events); not a conventional public membership gym floor",
        lat=43.9685,
        lng=12.4815,
        coord_source="OFFICIAL_MAP_PIN",
        discovery_class="municipal_sports_center",
        access_class="EXCLUDED_SPORTS_COMPLEX_NOT_GYM",
        operator_class="E",
        excluded=True,
        castello="Serravalle",
        import_category="EXCLUDED",
    )

    # --- Specialist / boutique exclusions ---
    add(
        rows,
        brand="Re-Vita 360",
        name="Re-Vita 360 Boutique",
        address="San Marino (boutique studio)",
        city="Serravalle",
        postal="47891",
        source_url="https://www.sanmarino.it/",
        notes="Boutique / personalized paths — not conventional open gym floor",
        discovery_class="specialist_boutique",
        access_class="EXCLUDED_BOUTIQUE",
        excluded=True,
        needs_coords=False,
        lat=43.97,
        lng=12.48,
        coord_source="CASTELLO_APPROX_EXCLUDED_ONLY",
        castello="Serravalle",
    )
    add(
        rows,
        brand="Satyananda Ashram",
        name="Scuola di Yoga Satyananda Ashram",
        address="Città di San Marino",
        city="Città di San Marino",
        postal="47890",
        source_url="https://www.tuttocitta.it/palestre/citta-di-san-marino",
        notes="Yoga school — specialist exclusion",
        discovery_class="specialist_boutique",
        access_class="EXCLUDED_YOGA",
        excluded=True,
        lat=43.936,
        lng=12.446,
        coord_source="DIRECTORY_APPROX_EXCLUDED_ONLY",
        castello="San Marino",
    )

    # --- Italian border probes (EXCLUDED_FOREIGN) ---
    for brand, name, address, city, postal, lat, lng, url in [
        (
            "ICON Palestre",
            "ICON Palestre Rimini",
            "Via Consolare Rimini-San Marino, 17",
            "Rimini",
            "47923",
            44.0395150,
            12.5666000,
            "https://www.tuttocitta.it/palestre/citta-di-san-marino",
        ),
        (
            "Body Star",
            "Body Star Verucchio",
            "Via Cupa, 11",
            "Verucchio",
            "47826",
            44.0090513,
            12.4448198,
            "https://www.tuttocitta.it/palestre/citta-di-san-marino",
        ),
        (
            "La Fraternita",
            "La Fraternita Coriano",
            "Via Ausa, 186/B",
            "Coriano",
            "47853",
            43.9901369,
            12.5171741,
            "https://www.tuttocitta.it/palestre/citta-di-san-marino",
        ),
        (
            "La Fraternita",
            "La Fraternita San Leo",
            "Strada 258, 11",
            "San Leo",
            "47865",
            43.8965,
            12.3440,
            "https://www.tuttocitta.it/palestre/citta-di-san-marino",
        ),
        (
            "MoveUP Sport Academy",
            "MoveUP Sport Academy Rimini",
            "Via Emilia Mariani, 8",
            "Rimini",
            "47900",
            44.055,
            12.565,
            "https://www.tuttocitta.it/palestre/citta-di-san-marino",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=url,
            notes="Italian premises near San Marino border — EXCLUDED_FOREIGN",
            lat=lat,
            lng=lng,
            coord_source="OSM_NOMINATIM_OR_DIRECTORY",
            discovery_class="foreign_border_probe",
            access_class="EXCLUDED_FOREIGN",
            operator_class="Z",
            territory="Italy",
            excluded=True,
            import_category="EXCLUDED",
            castello="FOREIGN_ITALY",
        )

    # --- International / Italian chain absence probes ---
    CHAIN_PROBES = [
        "McFIT",
        "JOHN REED",
        "FitActive",
        "Virgin Active",
        "Anytime Fitness",
        "FitUP",
        "WebFit",
        "20Hours",
        "OrangeTheory",
        "Palestre Italiane",
        "GetFIT",
        "Curves",
        "Basic-Fit",
        "Fitness Park",
        "Keep Cool",
        "clever fit",
        "FITINN",
        "Fitness First",
        "Gold's Gym",
        "PureGym",
        "World Class",
        "JIMS",
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
        "NonStop Gym",
    ]
    for brand in CHAIN_PROBES:
        add(
            rows,
            brand=brand,
            name=f"{brand} San Marino probe",
            address="No San Marino premises found",
            city="Serravalle",
            postal="",
            source_url="https://www.google.com/search?q=" + brand.replace(" ", "+") + "+San+Marino+palestra",
            notes="Chain presence probe: no current conventional public gym location inside San Marino",
            discovery_class="international_chain_probe",
            access_class="ABSENT",
            operator_class="Z",
            excluded=True,
            import_category="EXCLUDED",
            castello="N/A",
        )

    write_json(OUT / "san_marino_phase1_candidates.json", rows)
    print(f"candidates: {len(rows)}")
    print(f"needs_review: {sum(1 for r in rows if r['import_category']=='NEEDS_REVIEW')}")
    print(f"excluded: {sum(1 for r in rows if r['import_category']=='EXCLUDED')}")


if __name__ == "__main__":
    main()
