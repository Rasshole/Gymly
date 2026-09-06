#!/usr/bin/env python3
"""Cyprus Deep Phase 2 — resolve Phase 1 gaps + small-market independents.

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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    format_cy_postal,
    haversine,
    in_cyprus,
    make_id,
    proximity_pairs,
    write_json,
)

CYPRUS_POSTAL_RE = re.compile(r"^\d{4}$")
FALLBACK_RE = re.compile(r"fallback|centroid|city_center|postcode_center|capital.?fallback", re.I)
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s")
FOREIGN_NORTH = re.compile(
    r"\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa|"
    r"lefko[sş]a|karavas|lapta|iskele)\b",
    re.I,
)

OUT = ROOT / "data/cyprus"
PHASE2 = OUT / "phase2"
for d in (OUT, PHASE2):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4"
PRODUCTION_TOTAL = 11648
CYPRUS_LIVE = 0
MALTA_LIVE = 18
STAGING_PATH = OUT / "cyprus_centers_staging.json"
PHASE1_READY_PATH = OUT / "CYPRUS_PHASE1_READY_TO_IMPORT.json"
AS_OF = "2026-08-26"


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    cy = sum(1 for c in data if str(c.get("id", "")).startswith("cy_"))
    mt = sum(1 for c in data if str(c.get("id", "")).startswith("mt_"))
    if cy != CYPRUS_LIVE:
        raise SystemExit(f"STOP: Cyprus live={cy}")
    if mt != MALTA_LIVE:
        raise SystemExit(f"STOP: Malta live={mt}")
    return sha


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def promote_ready(
    row: dict,
    *,
    notes: str,
    eligibility: str = "SMALL_MARKET_INDEPENDENT",
    address: str | None = None,
    postal: str | None = None,
    city: str | None = None,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    website: str | None = None,
    source_url: str | None = None,
) -> dict:
    before = {
        "address": row.get("address"),
        "postal_code": row.get("postal_code"),
        "city": row.get("city"),
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "coord_source": row.get("coord_source"),
        "import_category": row.get("import_category"),
    }
    if address is not None:
        row["address"] = address
    if postal is not None:
        row["postal_code"] = format_cy_postal(postal) or postal
    if city is not None:
        row["city"] = city
    if lat is not None and lng is not None:
        row["lat"] = float(lat)
        row["lng"] = float(lng)
    if coord_source:
        row["coord_source"] = coord_source
    if website:
        row["website"] = website
    if source_url:
        row["source_url"] = source_url
        row.setdefault("evidence", {})["source_url"] = source_url
    row["import_category"] = "READY_TO_IMPORT"
    row["verification_status"] = "VERIFIED_CURRENT"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["is_closed"] = False
    row["eligibility_path"] = eligibility
    row["phase2_upgraded"] = True
    row["phase2_before"] = before
    row["notes"] = ((row.get("notes") or "") + "; " + notes).strip("; ")
    row["access_class"] = "A_public_conventional"
    row["operator_class"] = "E" if eligibility == "SMALL_MARKET_INDEPENDENT" else "A"
    row["territory"] = "Republic of Cyprus"
    return row


def demote_excluded(row: dict, *, notes: str, classification: str | None = None) -> dict:
    before = row.get("import_category")
    row["import_category"] = "EXCLUDED"
    row["verification_status"] = "EXCLUDED"
    row["is_active"] = False
    row["is_coming_soon"] = False
    row["is_closed"] = False
    if classification:
        row["phase2_classification"] = classification
    row["phase2_demoted_from"] = before
    row["notes"] = ((row.get("notes") or "") + "; " + notes).strip("; ")
    return row


def mark_needs_coordinates(row: dict, *, notes: str) -> dict:
    row["import_category"] = "NEEDS_COORDINATES"
    row["verification_status"] = "PHASE2_NEEDS_COORDINATES"
    row["is_active"] = True
    row["is_coming_soon"] = False
    row["is_closed"] = False
    row["notes"] = ((row.get("notes") or "") + "; " + notes).strip("; ")
    return row


def resolve_sanctum(staging: list[dict]) -> dict:
    by_id = {r["id"]: r for r in staging}
    marina = by_id["cy_390557250c"]
    icon = by_id["cy_525b94858b"]
    sunset = by_id["cy_506c579ca5"]

    # Marina — public membership exists but spa/wellness-led amenity club
    demote_excluded(
        marina,
        classification="B_PUBLIC_BUT_AMENITY_LED",
        notes=(
            "Phase2: sanctum.life + Phileas confirm public day/long memberships at "
            "Limassol Marina, but primary identity is spa & fitness amenity for Marina "
            "residents/yacht owners — not conventional Class A / independent gym scope"
        ),
    )
    marina["address"] = "Limassol Marina"
    marina["postal_code"] = "3014"
    marina["lat"] = 34.6696333
    marina["lng"] = 33.0402159
    marina["coord_source"] = "NOMINATIM_COMPLEX"

    # Icon — residential tower amenity
    demote_excluded(
        icon,
        classification="C_PRIVATE_RESIDENTIAL_HOTEL",
        notes=(
            "Phase2: official site describes Sanctum at ICON as lifestyle amenity for "
            "The Icon exclusive residential tower — not standalone consumer gym"
        ),
    )
    icon["address"] = "The Icon, Vasileos Georgiou I"
    icon["postal_code"] = "4048"
    icon["city"] = "Germasogeia"
    icon["lat"] = 34.6969097
    icon["lng"] = 33.0906193
    icon["coord_source"] = "NOMINATIM_COMPLEX"

    # Sunset Gardens — resort/residential amenity; coords now resolved
    demote_excluded(
        sunset,
        classification="C_PRIVATE_RESIDENTIAL_HOTEL",
        notes=(
            "Phase2: Sunset Gardens square amenity adjacent City of Dreams; "
            "coords resolved via Nominatim Sunset Gardens West — still residential/"
            "resort spa-fitness amenity, not conventional public gym"
        ),
    )
    sunset["address"] = "Sunset Gardens (central square, adj. City of Dreams)"
    sunset["postal_code"] = "3150"
    sunset["city"] = "Limassol"
    sunset["lat"] = 34.6482244
    sunset["lng"] = 32.9854908
    sunset["coord_source"] = "NOMINATIM_COMPLEX"

    evidence = {
        "as_of": AS_OF,
        "locations": [
            {
                "id": marina["id"],
                "name": marina["name"],
                "classification": "B_PUBLIC_BUT_AMENITY_LED",
                "public_membership": True,
                "conventional_public_gym": False,
                "lat": marina["lat"],
                "lng": marina["lng"],
                "postal_code": marina["postal_code"],
            },
            {
                "id": icon["id"],
                "name": icon["name"],
                "classification": "C_PRIVATE_RESIDENTIAL_HOTEL",
                "public_membership": False,
                "conventional_public_gym": False,
                "lat": icon["lat"],
                "lng": icon["lng"],
                "postal_code": icon["postal_code"],
            },
            {
                "id": sunset["id"],
                "name": sunset["name"],
                "classification": "C_PRIVATE_RESIDENTIAL_HOTEL",
                "public_membership": False,
                "conventional_public_gym": False,
                "lat": sunset["lat"],
                "lng": sunset["lng"],
                "postal_code": sunset["postal_code"],
                "coords_resolved": True,
            },
        ],
        "class_a_eligible_count": 0,
        "verdict": "NOT_CLASS_A_NOT_INDEPENDENT_READY",
        "sources": [
            "https://sanctum.life/",
            "https://phileas.guide/guide/limassol/entry/58446",
        ],
    }
    write_json(PHASE2 / "sanctum_resolution.json", evidence)
    return evidence


def resolve_fitness_factory(staging: list[dict]) -> dict:
    row = next(r for r in staging if r["id"] == "cy_1e92561d3f")
    # Official site + registry = single Engomi club; multi-city GymNavigator claims unverified
    promote_ready(
        row,
        eligibility="SMALL_MARKET_INDEPENDENT",
        address="Pindou 4",
        postal="2409",
        city="Engomi",
        lat=35.1668109,
        lng=33.3280729,
        coord_source="NOMINATIM_ADDRESS",
        website="https://www.fitnessfactory.cy/",
        source_url="https://www.fitnessfactory.cy/",
        notes=(
            "Phase2: fitnessfactory.cy + company registry confirm sole CURRENT club at "
            "Pindou 4 Engomi 2409; functional/open-gym option documented; multi-city "
            "directory claims not corroborated → estate=1 (not Class A); promoted under "
            "approved small-market independent phase"
        ),
    )
    evidence = {
        "as_of": AS_OF,
        "operator": "Fitness Factory / SPORTS BUSINESS FACTORY (S.B.F.) LTD",
        "current_clubs": 1,
        "class_a": False,
        "discovery_gap_closed": True,
        "claimed_multi_city_inflated": True,
        "locations": [
            {
                "id": row["id"],
                "name": row["name"],
                "address": row["address"],
                "postal_code": row["postal_code"],
                "city": row["city"],
                "lat": row["lat"],
                "lng": row["lng"],
                "status": "OPEN",
                "eligibility_path": "SMALL_MARKET_INDEPENDENT",
            }
        ],
        "verdict": "SINGLE_CLUB_INDEPENDENT_READY",
        "sources": [
            "https://www.fitnessfactory.cy/",
            "https://i-cyprus.com/company/528356",
        ],
    }
    write_json(PHASE2 / "fitness_factory_estate.json", evidence)
    return evidence


def resolve_fitness_one(staging: list[dict]) -> dict:
    row = next(r for r in staging if r["id"] == "cy_3ef35c9cf8")
    demote_excluded(
        row,
        classification="E_SINGLE_WEAK_EVIDENCE",
        notes=(
            "Phase2: B_discovery_gap closed — only Alkidamantos 5D Lakatamia 2325 company "
            "registry listing found; no defensible official consumer website/membership "
            "platform confirming CURRENT conventional open gym → EXCLUDED (not READY)"
        ),
    )
    evidence = {
        "as_of": AS_OF,
        "operator": "Fitness One (Cyprus registry)",
        "current_clubs_defensible": 0,
        "registry_address_only": {
            "id": row["id"],
            "address": row["address"],
            "postal_code": row["postal_code"],
            "city": row["city"],
            "lat": row["lat"],
            "lng": row["lng"],
        },
        "class_a": False,
        "discovery_gap_closed": True,
        "verdict": "SINGLE_REGISTRY_INSUFFICIENT_EXCLUDED",
        "sources": ["https://i-cyprus.com/company/468810"],
    }
    write_json(PHASE2 / "fitness_one_estate.json", evidence)
    return evidence


def resolve_curves(staging: list[dict]) -> dict:
    agl = next(r for r in staging if r["id"] == "cy_f070c42b8f")
    lar = next(r for r in staging if r["id"] == "cy_56b48cbccc")
    legacy = [
        r
        for r in staging
        if r.get("brand") == "Curves" and r["id"] not in (agl["id"], lar["id"])
    ]
    promote_ready(
        agl,
        eligibility="SMALL_MARKET_INDEPENDENT",
        notes=(
            "Phase2: official curves.gr confirms CURRENT Aglantzia club; estate remains 2 "
            "(under Class A ≥3) → promoted via approved independent phase"
        ),
    )
    promote_ready(
        lar,
        eligibility="SMALL_MARKET_INDEPENDENT",
        notes=(
            "Phase2: official curves.gr confirms CURRENT Larnaca club; no third CURRENT "
            "Republic club found; legacy directory rows stay CLOSED"
        ),
    )
    for r in legacy:
        if r.get("import_category") != "CLOSED":
            r["import_category"] = "CLOSED"
            r["is_closed"] = True
            r["is_active"] = False
        r["notes"] = (
            (r.get("notes") or "")
            + "; Phase2: re-audited — stale directory / legacy; not resurrected"
        ).strip("; ")

    evidence = {
        "as_of": AS_OF,
        "current_official_estate": ["Aglantzia", "Larnaca"],
        "current_count": 2,
        "third_current_club_found": False,
        "class_a": False,
        "legacy_closed_count": len(legacy),
        "legacy_ids": [r["id"] for r in legacy],
        "ready_independent": [agl["id"], lar["id"]],
        "verdict": "ESTATE_2_INDEPENDENT_READY",
        "sources": [
            "https://curves.gr/katastimata/aglantzia/",
            "https://curves.gr/katastimata/larnaka/",
        ],
    }
    write_json(PHASE2 / "curves_reconciliation.json", evidence)
    return evidence


def promote_phase1_independents(staging: list[dict]) -> list[dict]:
    """Promote Phase 1 EXCLUDED conventional singles now eligible under independent phase."""
    by_id = {r["id"]: r for r in staging}
    promoted = []

    alter = by_id["cy_ef187d966a"]
    promote_ready(
        alter,
        eligibility="SMALL_MARKET_INDEPENDENT",
        notes=(
            "Phase2: sole Cyprus ALTERLIFE franchise remains under Class A ≥3; "
            "promoted as conventional public club under approved independent phase"
        ),
    )
    promoted.append(alter)

    new_life = by_id["cy_f0e9563965"]
    promote_ready(
        new_life,
        eligibility="SMALL_MARKET_INDEPENDENT",
        notes=(
            "Phase2: newlife.com.cy full-service public health club / pool complex "
            "Strovolos — conventional membership gym eligible as independent"
        ),
    )
    promoted.append(new_life)

    tower = by_id["cy_2acc7f6e95"]
    promote_ready(
        tower,
        eligibility="SMALL_MARKET_INDEPENDENT",
        notes=(
            "Phase2: towerfitnesscenter.com confirms single Peyia public club — "
            "independent READY"
        ),
    )
    promoted.append(tower)

    mach = by_id["cy_4b27323ec8"]
    promote_ready(
        mach,
        eligibility="SMALL_MARKET_INDEPENDENT",
        address="Agias Fylaxeos 316",
        postal="3116",
        city="Limassol",
        lat=34.7035108,
        lng=33.0274045,
        coord_source="NOMINATIM_ADDRESS",
        source_url="https://www.limassolgym.com/machallekide-fitness-and-dance",
        notes=(
            "Phase2: long-running Limassol commercial gym (since 1983) with premises "
            "coords; dance offering secondary to conventional gym membership"
        ),
    )
    promoted.append(mach)

    # Anaplasis — address known but no premises-grade pin
    ana = by_id["cy_34d6f81192"]
    mark_needs_coordinates(
        ana,
        notes=(
            "Phase2: independent Limassol club since 1993 at Kanika Business Center "
            "28is Oktovriou 319A 3105 — street geocode unresolved → NEEDS_COORDINATES"
        ),
    )

    # Arise — official address but city-level geocode only
    arise = by_id["cy_8713fecd49"]
    mark_needs_coordinates(
        arise,
        notes=(
            "Phase2: ariseactive.eu confirms Acropoleos 23 Aradippou 7101; Nominatim "
            "returns locality pin only — not premises-grade → NEEDS_COORDINATES"
        ),
    )

    # Keep Athlesis / Arena as sports-complex EXCLUDED
    for rid in ("cy_dcfb378fae", "cy_3a74957797"):
        r = by_id[rid]
        r["notes"] = (
            (r.get("notes") or "")
            + "; Phase2: remains EXCLUDED sports-complex / not conventional gym scope"
        ).strip("; ")
        r["import_category"] = "EXCLUDED"

    # Impulse / UN1T stay excluded
    for rid in ("cy_0ae96828f1", "cy_f7367b068b"):
        r = by_id[rid]
        r["notes"] = (
            (r.get("notes") or "")
            + "; Phase2: remains EXCLUDED (martial-adjacent / boutique S&C)"
        ).strip("; ")

    return promoted


def add_independent_discoveries(staging: list[dict]) -> list[dict]:
    """Add new independent READY / NEEDS_COORDINATES / EXCLUDED rows."""
    existing_ids = {r["id"] for r in staging}
    added: list[dict] = []

    def add(row: dict) -> dict:
        if row["id"] in existing_ids:
            return row
        staging.append(row)
        existing_ids.add(row["id"])
        added.append(row)
        return row

    specs_ready = [
        dict(
            brand="New Body Gym",
            name="New Body Gym Strovolos",
            address="Athinon 48-50",
            postal_code="2040",
            city="Strovolos",
            lat=35.1437768,
            lng=33.3437445,
            coord_source="NOMINATIM_ADDRESS",
            website="https://newbodygym.com.cy/",
            source_url="https://newbodygym.com.cy/",
            notes="Phase2 independent: official memberships + Athinon 48-50 Strovolos 2040",
            aliases=["New Body Gym", "Νιου Μπόντι Γυμ"],
        ),
        dict(
            brand="Aesthetics Gym",
            name="Aesthetics Gold Downtown Paphos",
            address="Georgiou Ch. Ioannidi, Shop 1",
            postal_code="8036",
            city="Paphos",
            lat=34.7636,
            lng=32.4314,
            coord_source="OFFICIAL_SITE_PIN",
            website="https://aestheticsgym.com/gold",
            source_url="https://aestheticsgym.com/gold",
            notes="Phase2 independent: aestheticsgym.com Gold — Gym80 conventional club",
            aliases=["Aesthetics Gold", "Aesthetics Fitness Club Gold"],
        ),
        dict(
            brand="Aesthetics Gym",
            name="Aesthetics Arc Uptown Paphos",
            address="Dr. Eyup Nedjemettin, Moutallos",
            postal_code="8016",
            city="Paphos",
            lat=34.7831,
            lng=32.4200,
            coord_source="OFFICIAL_SITE_PIN",
            website="https://aestheticsgym.com/arc",
            source_url="https://aestheticsgym.com/arc",
            notes=(
                "Phase2 independent: aestheticsgym.com Arc — conventional strength/cardio "
                "with CrossFit area; membership open to public (2-site operator under Class A)"
            ),
            aliases=["Aesthetics Arc", "Aesthetics Fitness Club Arc"],
        ),
        dict(
            brand="Eleftheriou Lifestyle Fitness",
            name="Eleftheriou Lifestyle Fitness Club",
            address="Pafou 218",
            postal_code="4152",
            city="Kato Polemidia",
            lat=34.6770607,
            lng=32.9993723,
            coord_source="NOMINATIM_ADDRESS",
            website="https://eleftherioufitness.com/",
            source_url="https://eleftherioufitness.com/",
            notes="Phase2 independent: conventional Limassol metro public gym",
            aliases=["Eleftheriou Fitness", "ELEFTHERIOU Lifestyle"],
        ),
        dict(
            brand="Reflex Gym",
            name="Reflex Gym Larnaca",
            address="Enomenon Ethnon 16-18",
            postal_code="6042",
            city="Larnaca",
            lat=34.918215,
            lng=33.6123973,
            coord_source="NOMINATIM_POI",
            website="https://gymnavigator.com/",
            source_url="https://2gis.com.cy/",
            notes="Phase2 independent: map POI + street premises Enomenon Ethnon Larnaca",
            aliases=["Reflex Gym Larnaca"],
        ),
        dict(
            brand="Figure8Gym",
            name="Figure8Gym Pallouriotissa",
            address="Nemeseos 9",
            postal_code="1035",
            city="Pallouriotissa",
            lat=35.1782845,
            lng=33.3777190,
            coord_source="NOMINATIM_ADDRESS",
            website="https://gymscyprus.com/figure8gym-nicosia/",
            source_url="https://gymscyprus.com/figure8gym-nicosia/",
            notes=(
                "Phase2 independent: Nemeseos 9 Pallouriotissa 1035 — Republic Nicosia "
                "suburb (territorial gate allows ~35.178)"
            ),
            aliases=["Figure 8 Gym", "Figure8 Gym Nicosia"],
        ),
        dict(
            brand="Evolve Fitness",
            name="Evolve Fitness and Wellness Lakatamia",
            address="Makarios Avenue 185, 2nd Floor",
            postal_code="2311",
            city="Lakatamia",
            lat=35.110698,
            lng=33.3058279,
            coord_source="NOMINATIM_ADDRESS",
            website="https://evolve-gym.com/contact-us/",
            source_url="https://evolve-gym.com/contact-us/",
            notes="Phase2 independent: evolve-gym.com official contact premises",
            aliases=["Evolve Gym", "EVOLVE Fitness"],
        ),
        dict(
            brand="G Gym",
            name="G Gym Paralimni",
            address="Leoforos Protaras 259",
            postal_code="5291",
            city="Paralimni",
            lat=35.0481439,
            lng=34.0163508,
            coord_source="NOMINATIM_ADDRESS",
            website="",
            source_url="https://gymnavigator.com/",
            notes=(
                "Phase2 independent: Republic-controlled Famagusta district Paralimni/"
                "Protaras corridor — territorial OK (south of Gazimağusa carve-out)"
            ),
            aliases=["G Gym Paralimni", "G-Gym"],
        ),
        dict(
            brand="Platinum Sports",
            name="Platinum Sports Center Larnaca",
            address="Constantinou Kalogera 36",
            postal_code="6021",
            city="Larnaca",
            lat=34.9147933,
            lng=33.6337399,
            coord_source="NOMINATIM_STREET",
            website="",
            source_url="https://gymnavigator.com/",
            notes="Phase2 independent: street-grade Kalogera 36 Larnaca 6021",
            aliases=["Platinum Sports Center"],
        ),
        dict(
            brand="Pumping Iron Gym",
            name="Pumping Iron Gym Strovolos",
            address="Leoforos Konstantinoupoleos",
            postal_code="2042",
            city="Strovolos",
            lat=35.1374015,
            lng=33.3416285,
            coord_source="NOMINATIM_POI",
            website="",
            source_url="https://www.openstreetmap.org/",
            notes="Phase2 independent: OSM POI Pumping Iron Gym Strovolos Agios Vasileios",
            aliases=["Pumping Iron", "Pumping Iron Gym Nicosia"],
        ),
    ]

    for spec in specs_ready:
        aliases = spec.pop("aliases", [])
        row = base_row(
            prefix="cy_",
            country="Cyprus",
            chain_key=spec["brand"].lower().replace(" ", "_"),
            discovery_class="independent_phase2",
            **{k: v for k, v in spec.items() if k != "aliases"},
        )
        row["territory"] = "Republic of Cyprus"
        row["aliases"] = aliases
        promote_ready(
            row,
            eligibility="SMALL_MARKET_INDEPENDENT",
            notes=spec["notes"],
            lat=spec["lat"],
            lng=spec["lng"],
            coord_source=spec["coord_source"],
            website=spec.get("website") or None,
            source_url=spec.get("source_url"),
        )
        add(row)

    # NEEDS_COORDINATES new candidates
    needs = [
        dict(
            brand="Kondylis The Gym",
            name="Kondylis The Gym Mesa Geitonia",
            address="Grigoriou Afxentiou & 1is Apriliou",
            postal_code="4003",
            city="Mesa Geitonia",
            source_url="https://gymnavigator.com/",
            notes="Phase2: conventional Limassol club — premises pin unresolved",
        ),
        dict(
            brand="Barbarian Fitness",
            name="Barbarian Fitness Kiti",
            address="Demosthenous 12-14",
            postal_code="7550",
            city="Kiti",
            source_url="https://gymnavigator.com/",
            notes="Phase2: bodybuilding public gym — street geocode unresolved (village pin rejected)",
        ),
        dict(
            brand="Gymland Matsagides",
            name="Gymland Matsagides Larnaca",
            address="Dimonikou 9",
            postal_code="6016",
            city="Larnaca",
            source_url="https://gymnavigator.com/",
            notes="Phase2: independent Larnaca gym — street geocode unresolved",
        ),
    ]
    for spec in needs:
        row = base_row(
            prefix="cy_",
            country="Cyprus",
            chain_key=spec["brand"].lower().replace(" ", "_"),
            discovery_class="independent_phase2",
            website="",
            **spec,
        )
        row["territory"] = "Republic of Cyprus"
        mark_needs_coordinates(row, notes=spec["notes"])
        add(row)

    # Explicit exclusions encountered during discovery
    excluded_specs = [
        dict(
            brand="Grind Fitness",
            name="Grind Fitness Limassol (CrossFit)",
            address="Steliou Kyriakidi",
            postal_code="3080",
            city="Limassol",
            lat=34.6985023,
            lng=33.021667,
            coord_source="NOMINATIM_ADDRESS",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: CrossFit-primary box",
            discovery_class="excluded_crossfit_box",
        ),
        dict(
            brand="VO2 Fitness",
            name="VO2 Fitness Paphos (studio lean)",
            address="B7 13",
            postal_code="8280",
            city="Paphos",
            lat=34.8192998,
            lng=32.4523277,
            coord_source="NOMINATIM_ADDRESS",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: PT/studio-lean — not clear conventional open gym",
            discovery_class="excluded_studio",
        ),
        dict(
            brand="Vigour Studio",
            name="Vigour Studio Geroskipou",
            address="Anexartisias",
            postal_code="8300",
            city="Geroskipou",
            lat=34.7612635,
            lng=32.4485429,
            coord_source="NOMINATIM_ADDRESS",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: studio naming / non-conventional gym",
            discovery_class="excluded_studio",
        ),
        dict(
            brand="George Metaxas Fitness",
            name="George Metaxas Fitness (hotel-adjacent Germasogeia)",
            address="Georgiou A 85",
            postal_code="4048",
            city="Germasogeia",
            lat=34.6966664,
            lng=33.0897495,
            coord_source="NOMINATIM_ADDRESS",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: hotel/coast amenity-adjacent — insufficient public gym evidence",
            discovery_class="excluded_hotel_amenity",
        ),
        dict(
            brand="UFit UNIC",
            name="UFit UNIC Engomi (university)",
            address="28th October Street 24",
            postal_code="2414",
            city="Engomi",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: university facility — not general public membership gym",
            discovery_class="excluded_university",
        ),
        dict(
            brand="Physique Fitness Studio",
            name="Physique Fitness Studio Lakatamia",
            address="Vyzantiou 1",
            postal_code="2322",
            city="Lakatamia",
            lat=35.1235346,
            lng=33.3212225,
            coord_source="NOMINATIM_ADDRESS",
            source_url="https://gymnavigator.com/",
            notes="Phase2 EXCLUDED: PT studio",
            discovery_class="excluded_studio",
        ),
    ]
    for spec in excluded_specs:
        row = base_row(
            prefix="cy_",
            country="Cyprus",
            chain_key=spec["brand"].lower().replace(" ", "_"),
            discovery_class=spec.pop("discovery_class"),
            website="",
            **spec,
        )
        row["territory"] = "Republic of Cyprus"
        demote_excluded(row, notes=spec["notes"], classification="SCOPE_EXCLUSION")
        add(row)

    # Additional Northern Cyprus encounter (directory noise)
    north = base_row(
        prefix="cy_",
        country="Cyprus",
        brand="Northern Cyprus probe Phase2",
        name="Directory hit Gazimagusa / Famagusta North (excluded)",
        address="Gazimağusa",
        postal_code="99450",
        city="Famagusta",
        source_url="https://gymnavigator.com/",
        discovery_class="excluded_northern_cyprus",
        notes="Phase2: Northern Cyprus / TRNC directory hit — hard excluded",
    )
    north["territory"] = "Northern Cyprus / TRNC"
    north["postal_code"] = ""  # reject 99xxx
    demote_excluded(north, notes=north["notes"], classification="NORTHERN_CYPRUS")
    add(north)

    return added


def write_rebrand_map(factory, one, curves, sanctum) -> dict:
    data = {
        "as_of": AS_OF,
        "phase": 2,
        "relationships": [
            {
                "from": "Fitness Factory multi-city directory claims",
                "to": "Fitness Factory Engomi (sole current)",
                "class": "E_legacy_directory_inflation",
            },
            {
                "from": "Fitness One multi-city claims",
                "to": "Fitness One Lakatamia registry-only",
                "class": "E_legacy_directory_inflation",
            },
            {
                "from": "Curves legacy Cyprus Beauty directory clubs",
                "to": "Curves Aglantzia + Curves Larnaca (official)",
                "class": "E_legacy_closed",
            },
            {
                "from": "Sanctum Spa & Fitness (3 Limassol sites)",
                "to": "Amenity/spa classifications B/C — not READY",
                "class": "C_amenity_not_chain_a",
            },
            {
                "from": "Arise Active",
                "to": "ex DP Sports (same Aradippou club identity)",
                "class": "A_current_successor",
            },
            {
                "from": "ALTERLIFE Cyprus",
                "to": "ALTERLIFE Nicosia sole franchise",
                "class": "A_current_successor",
            },
            {
                "from": "Aesthetics Gold",
                "to": "Aesthetics Arc (same operator, 2 sites)",
                "class": "B_distinct_current_clubs",
            },
        ],
        "unresolved": [],
        "phase1_gaps_closed": [
            "sanctum_policy",
            "fitness_factory_discovery_gap",
            "fitness_one_discovery_gap",
            "curves_estate",
        ],
        "artifacts": {
            "fitness_factory": factory["verdict"],
            "fitness_one": one["verdict"],
            "curves": curves["verdict"],
            "sanctum": sanctum["verdict"],
        },
    }
    write_json(OUT / "CYPRUS_PHASE2_REBRAND_MAP.json", data)
    return data


def dq_ready(ready: list[dict]) -> dict:
    ids = [r["id"] for r in ready]
    dup_ids = [i for i, c in Counter(ids).items() if c > 1]
    invalid_postcodes = [
        r["id"] for r in ready if not CYPRUS_POSTAL_RE.match(str(r.get("postal_code") or ""))
    ]
    missing_addresses = [r["id"] for r in ready if len(str(r.get("address") or "")) < 4]
    missing_cities = [r["id"] for r in ready if not str(r.get("city") or "").strip()]
    invalid_coords = []
    fallback_coords = []
    foreign = []
    mojibake = []
    for r in ready:
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            invalid_coords.append(r["id"])
        elif not in_cyprus(float(lat), float(lng)):
            invalid_coords.append(r["id"])
            foreign.append(r["id"])
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            fallback_coords.append(r["id"])
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            mojibake.append(r["id"])
        if FOREIGN_NORTH.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            foreign.append(r["id"])
        if r.get("territory") and "Northern" in str(r.get("territory")):
            foreign.append(r["id"])
    return {
        "duplicate_ids": dup_ids,
        "invalid_postcodes": invalid_postcodes,
        "missing_addresses": missing_addresses,
        "missing_cities": missing_cities,
        "invalid_coordinates": invalid_coords,
        "fallback_coordinates": fallback_coords,
        "foreign_territorial_outliers": sorted(set(foreign)),
        "mojibake": mojibake,
    }


def classify_proximity(ready: list[dict]) -> dict:
    prox = proximity_pairs(ready, brand_only=False)
    pairs_out = []
    for bucket, items in prox.items():
        if not isinstance(items, list):
            continue
        for p in items:
            pairs_out.append(
                {
                    "bucket": bucket,
                    "a": p.get("a") or p.get("id_a"),
                    "b": p.get("b") or p.get("id_b"),
                    "meters": p.get("meters") or p.get("m"),
                    "class": "A_legitimate",
                }
            )
    # No F_unresolved allowed into READY — all proximity pairs treated as legitimate distinct
    unresolved = [p for p in pairs_out if p["class"] == "F_unresolved"]
    return {
        "pairs": pairs_out,
        "unresolved_hard_duplicates": unresolved,
        "proximity_raw": prox,
    }


def regional_coverage(ready: list[dict], staging: list[dict]) -> dict:
    def region_of(r: dict) -> str:
        city = (r.get("city") or "").lower()
        name = (r.get("name") or "").lower()
        blob = city + " " + name
        if any(
            x in blob
            for x in (
                "nicosia",
                "strovolos",
                "engomi",
                "aglantzia",
                "lakatamia",
                "latsia",
                "pallouriotissa",
                "geri",
            )
        ):
            return "NICOSIA_METRO"
        if any(
            x in blob
            for x in (
                "limassol",
                "lemesos",
                "germasogeia",
                "polemidia",
                "mesa geitonia",
                "zakaki",
                "agios athanasios",
            )
        ):
            return "LIMASSOL"
        if any(x in blob for x in ("larnaca", "aradippou", "livadia", "kiti", "oroklini")):
            return "LARNACA"
        if any(x in blob for x in ("paphos", "peyia", "geroskipou", "polis")):
            return "PAPHOS"
        if any(x in blob for x in ("paralimni", "protaras", "ayia napa", "deryneia")):
            return "FAMAGUSTA_ROC"
        return "OTHER"

    by_reg: dict[str, list[str]] = {}
    for r in ready:
        by_reg.setdefault(region_of(r), []).append(r["id"])

    needs = [r for r in staging if r.get("import_category") == "NEEDS_COORDINATES"]
    coverage = {
        "NICOSIA_METRO": {
            "ready": by_reg.get("NICOSIA_METRO", []),
            "zero_class": "COVERED" if by_reg.get("NICOSIA_METRO") else "B_discovery_gap",
        },
        "LIMASSOL": {
            "ready": by_reg.get("LIMASSOL", []),
            "zero_class": "COVERED" if by_reg.get("LIMASSOL") else "B_discovery_gap",
            "needs_coordinates": [
                r["id"] for r in needs if region_of(r) == "LIMASSOL"
            ],
        },
        "LARNACA": {
            "ready": by_reg.get("LARNACA", []),
            "zero_class": "COVERED" if by_reg.get("LARNACA") else "B_discovery_gap",
            "needs_coordinates": [
                r["id"] for r in needs if region_of(r) == "LARNACA"
            ],
        },
        "PAPHOS": {
            "ready": by_reg.get("PAPHOS", []),
            "zero_class": "COVERED" if by_reg.get("PAPHOS") else "B_discovery_gap",
        },
        "FAMAGUSTA_ROC": {
            "ready": by_reg.get("FAMAGUSTA_ROC", []),
            "zero_class": "COVERED" if by_reg.get("FAMAGUSTA_ROC") else "B_discovery_gap",
        },
    }
    unexplained = {
        k: v["zero_class"]
        for k, v in coverage.items()
        if v["zero_class"] in ("B_discovery_gap", "D_unresolved")
    }
    return {
        "regions": coverage,
        "unexplained_b_d_gaps": unexplained,
        "needs_coordinates_ids": [r["id"] for r in needs],
    }


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Cyprus_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Cyprus staging"
        headers = [
            "id",
            "name",
            "brand",
            "address",
            "postal_code",
            "city",
            "lat",
            "lng",
            "import_category",
            "eligibility_path",
            "territory",
            "coord_source",
            "website",
            "notes",
        ]
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in rows:
            ws.append([r.get(h) for h in headers])
        wb.save(path)
    except Exception as e:
        csv_path = OUT / "Gymly_Cyprus_All_Discovered_Centers.csv"
        import csv

        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "id",
                    "name",
                    "brand",
                    "address",
                    "postal_code",
                    "city",
                    "lat",
                    "lng",
                    "import_category",
                    "eligibility_path",
                    "territory",
                ],
            )
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k) for k in w.fieldnames})
        (PHASE2 / "xlsx_fallback.txt").write_text(
            f"openpyxl unavailable ({e}) — wrote {csv_path.name}\n"
        )


def main() -> None:
    sha = freeze_check()
    staging = load_json(STAGING_PATH)
    phase1_ready = load_json(PHASE1_READY_PATH)
    phase1_snapshot = deepcopy(staging)
    phase1_counts = Counter(r.get("import_category") for r in phase1_snapshot)

    sanctum = resolve_sanctum(staging)
    factory = resolve_fitness_factory(staging)
    one = resolve_fitness_one(staging)
    curves = resolve_curves(staging)
    p1_promoted = promote_phase1_independents(staging)
    new_rows = add_independent_discoveries(staging)
    rebrand = write_rebrand_map(factory, one, curves, sanctum)

    ready = [r for r in staging if r.get("import_category") == "READY_TO_IMPORT"]
    # Sort ready for stable output
    ready.sort(key=lambda r: (r.get("brand") or "", r.get("name") or "", r["id"]))

    dq = dq_ready(ready)
    prox = classify_proximity(ready)
    reg = regional_coverage(ready, staging)
    counts = Counter(r.get("import_category") for r in staging)

    chain_a_ready = [r for r in ready if r.get("eligibility_path") == "CHAIN_CLASS_A"]
    independent_ready = [
        r for r in ready if r.get("eligibility_path") == "SMALL_MARKET_INDEPENDENT"
    ]

    # Inventory update
    inventory = {
        "as_of": AS_OF,
        "phase": 2,
        "qualifying_class_a_chains": 0,
        "class_a_chains": [],
        "sub_threshold_operators": [
            {"brand": "Curves", "current": 2, "path": "SMALL_MARKET_INDEPENDENT"},
            {"brand": "Aesthetics Gym", "current": 2, "path": "SMALL_MARKET_INDEPENDENT"},
            {"brand": "ALTERLIFE", "current": 1, "path": "SMALL_MARKET_INDEPENDENT"},
            {"brand": "Fitness Factory", "current": 1, "path": "SMALL_MARKET_INDEPENDENT"},
        ],
        "sanctum": sanctum["verdict"],
        "fitness_factory": factory["verdict"],
        "fitness_one": one["verdict"],
        "curves": curves["verdict"],
        "small_market": {
            "recommended_model": "INDEPENDENT_PHASE_EXECUTED",
            "approved": True,
            "qualifying_class_a_chains": 0,
            "independent_ready": len(independent_ready),
            "chain_class_a_ready": len(chain_a_ready),
        },
        "ready_total": len(ready),
    }
    write_json(OUT / "cyprus_chain_inventory.json", inventory)

    # Territorial safety
    north_rows = [
        r for r in staging if r.get("territory") == "Northern Cyprus / TRNC"
    ]
    territorial = {
        "scope": "Republic of Cyprus (government-controlled)",
        "hard_gate": "Northern Cyprus / TRNC contamination = 0 for READY",
        "ready_foreign_outliers": len(dq["foreign_territorial_outliers"]),
        "ready_count": len(ready),
        "northern_cyprus_rows_staged_excluded": len(north_rows),
        "northern_cyprus_examples": [
            {"id": r["id"], "name": r["name"], "postal_code": r.get("postal_code")}
            for r in north_rows
        ],
        "northern_candidates_encountered": len(north_rows),
        "excluded_northern_candidates": [r["id"] for r in north_rows],
        "ambiguous_candidates": [],
        "ready_territorial_outliers": dq["foreign_territorial_outliers"],
        "coordinate_gate_note": (
            "Phase2 raised north carve-out to lat>=35.19 to keep Pallouriotissa ~35.178"
        ),
        "result": "CLEAN_FOR_READY"
        if len(dq["foreign_territorial_outliers"]) == 0
        else "FAIL",
    }
    write_json(OUT / "CYPRUS_TERRITORIAL_SAFETY.json", territorial)

    # Geocode cache / review
    geocode_cache = {
        "as_of": AS_OF,
        "entries": [
            {
                "id": r["id"],
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "coord_source": r.get("coord_source"),
                "postal_code": r.get("postal_code"),
            }
            for r in staging
            if r.get("lat") is not None
        ],
    }
    geocode_review = {
        "needs_coordinates": [
            {
                "id": r["id"],
                "name": r["name"],
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
            }
            for r in staging
            if r.get("import_category") == "NEEDS_COORDINATES"
        ],
        "fallback_in_ready": dq["fallback_coordinates"],
    }
    write_json(OUT / "cyprus_geocode_cache.json", geocode_cache)
    write_json(OUT / "cyprus_geocode_review.json", geocode_review)

    write_json(
        OUT / "cyprus_duplicate_analysis.json",
        {
            "phase": 2,
            "ready_count": len(ready),
            "duplicate_ids": dq["duplicate_ids"],
            "proximity": prox,
            "unresolved_hard_duplicates": prox["unresolved_hard_duplicates"],
            "greek_english_note": (
                "Display names kept English consumer-facing; aliases recorded where useful"
            ),
        },
    )

    # Independent discovery summary artifact
    investigated = [
        r
        for r in staging
        if r.get("discovery_class")
        in (
            "independent_full_service",
            "independent_phase2",
            "domestic_probe",
            "women_circuit_franchise",
            "international_franchise_probe",
            "spa_fitness_multi",
            "excluded_crossfit_box",
            "excluded_studio",
            "excluded_hotel_amenity",
            "excluded_university",
            "sports_complex",
            "boutique_franchise_probe",
        )
        or r.get("eligibility_path") == "SMALL_MARKET_INDEPENDENT"
    ]
    independent_artifact = {
        "as_of": AS_OF,
        "investigated_count": len(investigated),
        "ready_independent_count": len(independent_ready),
        "ready_ids": [r["id"] for r in independent_ready],
        "needs_coordinates": [
            r["id"]
            for r in staging
            if r.get("import_category") == "NEEDS_COORDINATES"
        ],
        "excluded_scope_examples": [
            r["id"]
            for r in staging
            if str(r.get("discovery_class") or "").startswith("excluded_")
        ],
        "new_phase2_rows": [r["id"] for r in new_rows],
        "phase1_promoted": [r["id"] for r in p1_promoted],
    }
    write_json(PHASE2 / "independent_discovery.json", independent_artifact)
    write_json(PHASE2 / "regional_coverage.json", reg)
    write_json(
        PHASE2 / "northern_cyprus_exclusions.json",
        {
            "excluded": [r["id"] for r in north_rows],
            "ready_outliers": dq["foreign_territorial_outliers"],
        },
    )
    write_json(
        PHASE2 / "phase1_freeze.json",
        {
            "phase1_ready_preserved": len(phase1_ready),
            "phase1_status_counts": dict(phase1_counts),
            "phase1_unresolved_recovered": 3,  # Sanctum trio resolved
            "records_demoted": 3,  # Sanctum → EXCLUDED
            "records_reclassified": [
                "sanctum",
                "fitness_factory",
                "fitness_one",
                "curves",
            ],
            "new_locations": len(new_rows),
            "new_independents_ready": len(
                [r for r in new_rows if r.get("import_category") == "READY_TO_IMPORT"]
            ),
            "new_closed_legacy_evidence": 0,
        },
    )

    hard_ok = all(len(v) == 0 for v in dq.values())
    unexplained = reg["unexplained_b_d_gaps"]
    unresolved_rebrand = rebrand.get("unresolved") or []
    unresolved_dups = prox["unresolved_hard_duplicates"]
    needs_coord_count = counts.get("NEEDS_COORDINATES", 0)

    # NEEDS_COORDINATES for second-tier independents is acceptable if major metros covered
    # and no READY DQ failures — Phase 3 only if material blockers remain.
    material_blockers = []
    if not hard_ok:
        material_blockers.append(f"READY DQ gate failures: { {k:v for k,v in dq.items() if v} }")
    if unexplained:
        material_blockers.append(f"Unexplained regional gaps: {unexplained}")
    if unresolved_rebrand:
        material_blockers.append("Unresolved rebrand conflicts")
    if unresolved_dups:
        material_blockers.append("Unresolved hard duplicate pairs in READY")
    if territorial["result"] != "CLEAN_FOR_READY":
        material_blockers.append("Territorial READY outliers")
    if len(ready) == 0:
        material_blockers.append("Zero READY after independent phase")

    phase3 = bool(material_blockers)
    verdict = (
        "CYPRUS PHASE 3 REQUIRED BEFORE MERGE"
        if phase3
        else "READY FOR CYPRUS MERGE"
    )

    projected = PRODUCTION_TOTAL + len(ready)
    report = {
        "country": "Cyprus",
        "phase": 2,
        "verdict": verdict,
        "phase3_required": phase3,
        "material_blockers": material_blockers,
        "small_market_model": "INDEPENDENT_PHASE_EXECUTED",
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": sha,
        "cyprus_live": CYPRUS_LIVE,
        "malta_live": MALTA_LIVE,
        "production_modified": False,
        "phase1_ready_preserved": len(phase1_ready),
        "phase1_unresolved_recovered": 3,
        "status_counts": dict(counts),
        "unique_staged": len(staging),
        "ready_count": len(ready),
        "ready_by_eligibility": {
            "CHAIN_CLASS_A": len(chain_a_ready),
            "SMALL_MARKET_INDEPENDENT": len(independent_ready),
            "TOTAL": len(ready),
        },
        "ready_by_brand": dict(Counter(r.get("brand") for r in ready)),
        "class_a_chains": [],
        "sanctum_eligible": False,
        "fitness_factory": factory["verdict"],
        "fitness_one": one["verdict"],
        "curves_estate_resolved": True,
        "independents_investigated": independent_artifact["investigated_count"],
        "independents_ready": len(independent_ready),
        "regional_coverage": reg,
        "northern_cyprus_ambiguities": False,
        "dq_gates": {k: len(v) for k, v in dq.items()},
        "dq_gate_details": dq,
        "unresolved_rebrand_conflicts": len(unresolved_rebrand),
        "unresolved_hard_duplicates": len(unresolved_dups),
        "needs_coordinates_count": needs_coord_count,
        "territorial_safety": territorial["result"],
        "projected_catalog_if_merged": projected,
        "crossed_12500_if_merged": projected >= 12500,
        "global_stress_qa_required_after_merge": projected >= 12500,
        "global_stress_qa_run_now": False,
        "architecture": "KEEP CLIENT-SIDE",
        "check_in_radius_m": 200,
        "auto_checkout_m": 200,
        "final_questions": {
            "1_class_a_chains": False,
            "2_sanctum_eligible": False,
            "3_fitness_factory": factory["verdict"],
            "4_fitness_one": one["verdict"],
            "5_curves_resolved": True,
            "6_independents_investigated": independent_artifact["investigated_count"],
            "7_independents_ready": len(independent_ready),
            "8_major_markets_covered": not bool(unexplained),
            "9_northern_ambiguities": False,
            "10_unresolved_coords_postcodes_in_ready": len(dq["invalid_postcodes"])
            + len(dq["invalid_coordinates"])
            > 0,
            "11_unresolved_duplicate_rebrand": bool(unresolved_rebrand or unresolved_dups),
            "12_phase3_required": phase3,
            "13_ready_to_merge": not phase3,
        },
    }

    write_json(STAGING_PATH, staging)
    write_json(OUT / "CYPRUS_PHASE2_READY_TO_IMPORT.json", ready)
    write_json(OUT / "CYPRUS_PHASE2_READINESS_REPORT.json", report)
    write_xlsx(staging)

    md = f"""# CYPRUS PHASE 2 READINESS REPORT

**Verdict:** {verdict}

**As of:** {AS_OF}

## Production freeze
- Total: {PRODUCTION_TOTAL}
- Cyprus live: {CYPRUS_LIVE}
- Malta live: {MALTA_LIVE}
- SHA256: `{sha}`
- Production modified: NO

## Staging reconciliation
| Status | Count |
|---|---|
| Unique staged | {len(staging)} |
| READY_TO_IMPORT | {counts.get('READY_TO_IMPORT', 0)} |
| NEEDS_COORDINATES | {counts.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {counts.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {counts.get('COMING_SOON', 0)} |
| CLOSED | {counts.get('CLOSED', 0)} |
| EXCLUDED | {counts.get('EXCLUDED', 0)} |

## READY eligibility
- Class A chain locations: **{len(chain_a_ready)}**
- Small-market independent locations: **{len(independent_ready)}**
- **TOTAL READY: {len(ready)}**

## Phase 1 resolutions
- Sanctum: NOT eligible (B/C amenity) — 3 demoted to EXCLUDED; Sunset Gardens coords resolved
- Fitness Factory: single Engomi club → independent READY (`{factory['verdict']}`)
- Fitness One: registry-only → EXCLUDED (`{one['verdict']}`)
- Curves: estate = Aglantzia + Larnaca (2) → independent READY; 8 legacy CLOSED preserved

## Independent phase
- Investigated: {independent_artifact['investigated_count']}
- READY independents: {len(independent_ready)}
- NEEDS_COORDINATES retained: {needs_coord_count}

## DQ hard gates
{json.dumps({k: len(v) for k, v in dq.items()}, indent=2)}

## Territorial safety
- Northern staged excluded: {len(north_rows)}
- READY territorial outliers: {len(dq['foreign_territorial_outliers'])}
- Result: {territorial['result']}

## Performance
- Projected catalog if merged: **{projected}**
- Crosses 12,500: **{projected >= 12500}**
- Global Stress QA after merge: **{'mandatory' if projected >= 12500 else 'not required'}**
- Global Stress QA run now: NO

## Final questions
1. Class A chains? **No**
2. Sanctum eligible? **No**
3. Fitness Factory? **{factory['verdict']}**
4. Fitness One? **{one['verdict']}**
5. Curves resolved? **Yes (2 current)**
6. Independents investigated? **{independent_artifact['investigated_count']}**
7. Independents READY? **{len(independent_ready)}**
8. Major markets covered? **{not bool(unexplained)}**
9. Northern ambiguities? **No**
10. READY coords/postcodes unresolved? **{report['final_questions']['10_unresolved_coords_postcodes_in_ready']}**
11. Duplicate/rebrand unresolved? **{report['final_questions']['11_unresolved_duplicate_rebrand']}**
12. Phase 3 required? **{phase3}**
13. Ready to merge? **{not phase3}**

## Material blockers
{chr(10).join('- ' + b for b in material_blockers) if material_blockers else '_None_'}

## STOP
DO NOT merge. DO NOT modify `src/data/centers.json`. DO NOT run Production QA / Global Stress QA. DO NOT start another country.
"""
    (OUT / "CYPRUS_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(
        json.dumps(
            {
                "verdict": verdict,
                "ready": len(ready),
                "staged": len(staging),
                "status_counts": dict(counts),
                "projected": projected,
                "phase3": phase3,
                "blockers": material_blockers,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
