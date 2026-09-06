#!/usr/bin/env python3
"""Monaco Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_mc_postal,
    write_json,
)

OUT = ROOT / "data/monaco"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f"
PRODUCTION_TOTAL = 11711

CITY_CANON = {
    "monaco": "Monaco",
    "monte-carlo": "Monte-Carlo",
    "monte carlo": "Monte-Carlo",
    "fontvieille": "Fontvieille",
    "la condamine": "La Condamine",
    "condamine": "La Condamine",
    "larvotto": "Larvotto",
    "monaco-ville": "Monaco-Ville",
    "le rocher": "Monaco-Ville",
    "moneghetti": "Moneghetti",
    "jardin exotique": "Jardin Exotique",
    "la rousse": "La Rousse",
    "saint roman": "La Rousse",
    "saint-roman": "La Rousse",
    "port hercule": "La Condamine",
    "beausoleil": "Beausoleil",
    "cap-d'ail": "Cap-d'Ail",
    "cap d'ail": "Cap-d'Ail",
    "roquebrune-cap-martin": "Roquebrune-Cap-Martin",
    "la turbie": "La Turbie",
    "menton": "Menton",
}

DISTRICT = {
    "Monte-Carlo": "Monte-Carlo",
    "La Condamine": "La Condamine",
    "Fontvieille": "Fontvieille",
    "Larvotto": "Larvotto",
    "Monaco-Ville": "Monaco-Ville",
    "Moneghetti": "Moneghetti",
    "Jardin Exotique": "Jardin Exotique",
    "La Rousse": "La Rousse",
    "Monaco": "Monaco",
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
    territory: str = "Monaco",
    district: str | None = None,
    eligibility_candidate: str | None = None,
    website: str | None = None,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="mc_",
        country="Monaco" if territory == "Monaco" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_mc_postal(postal) or postal,
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
    row["district"] = district or DISTRICT.get(city_c, city_c)
    row["parish"] = row["district"]  # alias for shared tooling
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
    assert sum(1 for c in centers if c.get("country") == "Monaco") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("mc_")) == 0

    rows: list[dict] = []

    # --- Municipal / public conventional candidates ---
    add(
        rows,
        brand="Hercule Fitness Club",
        name="Hercule Fitness Club Port Hercule",
        address="Quai Albert 1er (Stade Nautique Rainier III)",
        city="La Condamine",
        postal="98000",
        source_url="https://www.mairie.mc/hercule-fitness-club",
        website="https://www.mairie.mc/hercule-fitness-club",
        notes="Municipal gym under Mairie de Monaco; Life Fitness floor + spinning + classes; public membership with medical certificate | Phase 1 candidate",
        lat=43.7349,
        lng=7.4218,
        coord_source="OFFICIAL_MAP_PIN",
        discovery_class="municipal_sports_center",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
    )
    add(
        rows,
        brand="Stade Louis II",
        name="Salle de Musculation Stade Louis II",
        address="3 Avenue des Castelans",
        city="Fontvieille",
        postal="98000",
        source_url="https://www.stadelouis2.mc/informations-pratiques",
        website="https://www.stadelouis2.mc/",
        notes="Public weight room managed by Stade Louis II Direction; monthly/annual public abonnements; medical certificate required | Phase 1 municipal candidate",
        lat=43.7276,
        lng=7.4154,
        coord_source="OFFICIAL_MAP_PIN",
        discovery_class="municipal_sports_center",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
    )

    # --- Commercial independent conventional candidates ---
    add(
        rows,
        brand="Fit Factory",
        name="Fit Factory Larvotto",
        address="Promenade inférieure du Larvotto, Avenue Princesse Grace",
        city="Larvotto",
        postal="98000",
        source_url="https://fitfactory.mc/",
        website="https://fitfactory.mc/",
        notes="600 m² Technogym/Hammer Strength public gym + spinning; day/week/month passes; ordinary consumer membership | Phase 1 independent candidate",
        lat=43.7462,
        lng=7.4348,
        coord_source="OFFICIAL_MAP_PIN",
        discovery_class="independent_candidate",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
    )
    add(
        rows,
        brand="Eclub",
        name="Eclub Monte-Carlo Gym",
        address="Le Montaigne, 6 Boulevard des Moulins (2ème niveau)",
        city="Monte-Carlo",
        postal="98000",
        source_url="https://www.montecarlogym.com/",
        website="https://www.eclub.fit/salle-de-sport-a-monaco/",
        notes="Former Monte-Carlo GYM / E.Club; ~25 machines + cardio; public monthly/annual membership; connected EGYM floor | Phase 1 independent candidate",
        lat=43.7405,
        lng=7.4268,
        coord_source="BUSINESS_POI",
        discovery_class="independent_candidate",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        operator_class="E",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_review=True,
    )

    # --- Excluded: private / hotel / spa / specialist ---
    add(
        rows,
        brand="39 Monte-Carlo",
        name="39 Monte-Carlo",
        address="39 Avenue Princesse Grace",
        city="Larvotto",
        postal="98000",
        source_url="https://www.monaco-tribune.com/en/2024/01/all-you-need-to-know-about-monacos-gyms/",
        notes="Invitation-only private members sports club (~€5400/yr) | C_PRIVATE_MEMBERS_CLUB",
        lat=43.7455,
        lng=7.4335,
        coord_source="DIRECTORY",
        discovery_class="private_members_club",
        access_class="C_PRIVATE_MEMBERS_CLUB",
        operator_class="C",
        excluded=True,
    )
    add(
        rows,
        brand="Fairmont Fitness",
        name="Fairmont Fitness Monte-Carlo",
        address="12 Avenue des Spélugues (Fairmont Monte Carlo)",
        city="Monte-Carlo",
        postal="98000",
        source_url="https://www.monaco-tribune.com/en/2024/01/all-you-need-to-know-about-monacos-gyms/",
        notes="Hotel fitness/spa product; Gold/Platinum memberships tied to Fairmont amenity stack | C_PRIVATE_HOTEL / B_PUBLIC_BUT_AMENITY_LED",
        lat=43.7392,
        lng=7.4278,
        coord_source="DIRECTORY",
        discovery_class="hotel_spa",
        access_class="C_PRIVATE_HOTEL",
        operator_class="C",
        excluded=True,
    )
    add(
        rows,
        brand="Thermes Marins Monte-Carlo",
        name="Thermes Marins Monte-Carlo Fitness",
        address="2 Avenue de Monte-Carlo",
        city="Monte-Carlo",
        postal="98000",
        source_url="https://www.monaco-tribune.com/en/2024/01/all-you-need-to-know-about-monacos-gyms/",
        notes="Thermal spa primary; fitness incidental to spa membership | C_SPA_PRIMARY",
        lat=43.7388,
        lng=7.4272,
        coord_source="DIRECTORY",
        discovery_class="hotel_spa",
        access_class="C_SPA_PRIMARY",
        operator_class="C",
        excluded=True,
    )
    add(
        rows,
        brand="The Forge",
        name="The Forge Fontvieille",
        address="Le Méridien, 8 Avenue de Fontvieille",
        city="Fontvieille",
        postal="98000",
        source_url="https://www.theforge.mc/",
        website="https://www.theforge.mc/",
        notes="PT lab / boutique session studio (TACFIT, boxing, Gyrotonic); not ordinary self-directed public gym | C_SPECIALIST",
        lat=43.7288,
        lng=7.4172,
        coord_source="OFFICIAL_MAP_PIN",
        discovery_class="specialist_boutique",
        access_class="C_SPECIALIST",
        operator_class="C",
        excluded=True,
    )
    add(
        rows,
        brand="MonaMove",
        name="MonaMove Outdoor Stations",
        address="Port de Fontvieille / Port Hercule",
        city="Fontvieille",
        postal="98000",
        source_url="https://www.monaco-tribune.com/en/2024/01/all-you-need-to-know-about-monacos-gyms/",
        notes="Free outdoor calisthenics platforms — not conventional indoor gym catalog product",
        lat=43.7295,
        lng=7.4205,
        coord_source="DIRECTORY",
        discovery_class="outdoor_amenity",
        access_class="C_SPECIALIST",
        operator_class="C",
        excluded=True,
    )

    # --- Critical French border probe ---
    add(
        rows,
        brand="World Class",
        name="World Class Fitness Cap-d'Ail",
        address="6 Avenue Marquet",
        city="Cap-d'Ail",
        postal="06320",
        source_url="https://www.wclass.fr/fr/politique-de-confidentialit%C3%A9-51",
        website="https://www.wclass.fr/",
        notes="Marketed toward Monaco residents but physical premises in FRANCE (06320 Cap-d'Ail) | FOREIGN_NEAR_BORDER",
        lat=43.7208,
        lng=7.4052,
        coord_source="OFFICIAL_ADDRESS",
        discovery_class="foreign_border_probe",
        access_class="FOREIGN_NEAR_BORDER",
        operator_class="F",
        territory="France",
        district="Cap-d'Ail",
        excluded=True,
    )

    # Additional French border probes for QA
    for brand, name, address, city, postal, lat, lng in [
        (
            "Basic-Fit",
            "Basic-Fit Beausoleil probe",
            "Beausoleil centre (probe)",
            "Beausoleil",
            "06240",
            43.7512,
            7.4235,
        ),
        (
            "Fitness Park",
            "Fitness Park Menton probe",
            "Menton centre (probe)",
            "Menton",
            "06500",
            43.7745,
            7.5045,
        ),
        (
            "Keep Cool",
            "Keep Cool Roquebrune probe",
            "Roquebrune-Cap-Martin (probe)",
            "Roquebrune-Cap-Martin",
            "06190",
            43.762,
            7.457,
        ),
        (
            "L'Orange Bleue",
            "L'Orange Bleue Cap-d'Ail probe",
            "Cap-d'Ail (probe)",
            "Cap-d'Ail",
            "06320",
            43.718,
            7.401,
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url="https://www.google.com/maps",
            notes=f"French Alpes-Maritimes border probe — not Monaco premises | FOREIGN_NEAR_BORDER",
            lat=lat,
            lng=lng,
            coord_source="BORDER_PROBE",
            discovery_class="foreign_border_probe",
            access_class="FOREIGN_NEAR_BORDER",
            operator_class="F",
            territory="France",
            district=city,
            excluded=True,
        )

    # International chain ABSENT probes (documentation rows — EXCLUDED)
    absent_chains = [
        "Basic-Fit",
        "Fitness Park",
        "Keep Cool",
        "L'Orange Bleue",
        "On Air Fitness",
        "Neoness",
        "CMG Sports Club",
        "EPISOD",
        "Gigafit",
        "Magic Form",
        "Anytime Fitness",
        "Fitness First",
        "McFIT",
        "JOHN REED",
        "Gold's Gym",
        "clever fit",
        "FITINN",
        "JIMS",
        "PureGym",
        "VivaGym",
        "Synergym",
        "Altafit",
        "Curves",
        "ALTERLIFE",
        "Snap Fitness",
    ]
    for chain in absent_chains:
        add(
            rows,
            brand=chain,
            name=f"{chain} Monaco ABSENT probe",
            address="n/a",
            city="Monaco",
            postal="98000",
            source_url="https://www.google.com/search?q=" + chain.replace(" ", "+") + "+Monaco+gym",
            notes="No current conventional public location found inside Principality of Monaco | Class F ABSENT",
            discovery_class="international_chain_probe",
            access_class="F_ABSENT",
            operator_class="F",
            excluded=True,
            lat=None,
            lng=None,
            coord_source=None,
        )

    write_json(OUT / "monaco_phase1_candidates.json", rows)
    summary = {
        "country": "Monaco",
        "phase": 1,
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "candidates": len(rows),
        "by_discovery_class": {},
        "by_import_category": {},
    }
    from collections import Counter

    summary["by_discovery_class"] = dict(Counter(r["discovery_class"] for r in rows))
    summary["by_import_category"] = dict(Counter(r["import_category"] for r in rows))
    write_json(RAW / "discovery_summary.json", summary)
    (PAGES / "README.md").write_text(
        "# Monaco Phase 1 evidence notes\n\n"
        "Primary sources: mairie.mc (Hercule), stadelouis2.mc, fitfactory.mc, "
        "montecarlogym.com / eclub.fit, monaco-tribune, World Class Cap-d'Ail FR address.\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
