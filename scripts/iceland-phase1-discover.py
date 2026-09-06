#!/usr/bin/env python3
"""Iceland Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_is_postal,
    write_json,
)

OUT = ROOT / "data/iceland"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944"
PRODUCTION_TOTAL = 11665

WC = "https://worldclass.is/stodvar-og-sundlaugar"
KATLA = "https://katlafitness.is/stodvarnar"

CITY_CANON = {
    "reykjavik": "Reykjavík",
    "reykjavík": "Reykjavík",
    "kopavogur": "Kópavogur",
    "kópavogur": "Kópavogur",
    "kópavogi": "Kópavogur",
    "hafnarfjordur": "Hafnarfjörður",
    "hafnarfirði": "Hafnarfjörður",
    "hafnarfjörður": "Hafnarfjörður",
    "seltjarnarnes": "Seltjarnarnes",
    "seltjarnarnesi": "Seltjarnarnes",
    "mosfellsbaer": "Mosfellsbær",
    "mosfellsbær": "Mosfellsbær",
    "akureyri": "Akureyri",
    "selfoss": "Selfoss",
    "selfossi": "Selfoss",
    "hella": "Hella",
    "vestmannaeyjar": "Vestmannaeyjar",
    "vestmannaeyjabær": "Vestmannaeyjar",
    "vestmannaeyjum": "Vestmannaeyjar",
    "akranes": "Akranes",
    "gardabaer": "Garðabær",
    "garðabær": "Garðabær",
    "reykjanesbaer": "Reykjanesbær",
    "reykjanesbær": "Reykjanesbær",
    "keflavik": "Reykjanesbær",
    "keflavík": "Reykjanesbær",
    "borgarnes": "Borgarnes",
    "isafjordur": "Ísafjörður",
    "ísafjörður": "Ísafjörður",
    "egilsstadir": "Egilsstaðir",
    "egilsstaðir": "Egilsstaðir",
    "hveragerdi": "Hveragerði",
    "hveragerði": "Hveragerði",
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
    territory: str = "Iceland",
) -> None:
    row = base_row(
        prefix="is_",
        country="Iceland",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_is_postal(postal) or postal,
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


def wc(
    rows: list[dict],
    slug: str,
    display: str,
    address: str,
    city: str,
    postal: str,
    lat: float,
    lng: float,
    notes: str = "",
) -> None:
    add(
        rows,
        brand="World Class",
        name=f"World Class {display}",
        address=address,
        city=city,
        postal=postal,
        source_url=f"{WC}/{slug}",
        lat=lat,
        lng=lng,
        coord_source="OFFICIAL_MAP_PIN",
        chain_key="world_class",
        notes=notes,
    )


def katla(
    rows: list[dict],
    slug: str,
    display: str,
    address: str,
    city: str,
    postal: str,
    lat: float,
    lng: float,
    notes: str = "",
    access_class: str = "A_public_conventional",
) -> None:
    add(
        rows,
        brand="Katla Fitness",
        name=f"Katla Fitness {display}",
        address=address,
        city=city,
        postal=postal,
        source_url=f"{KATLA}",
        lat=lat,
        lng=lng,
        coord_source="OFFICIAL_MAP_PIN",
        chain_key="katla_fitness",
        notes=notes,
        access_class=access_class,
    )


def main() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert sha == EXPECTED_SHA, sha
    assert sum(1 for c in centers if c.get("country") == "Iceland") == 0
    assert sum(1 for c in centers if str(c.get("id", "")).startswith("is_")) == 0

    rows: list[dict] = []

    # ── World Class (Class A) — 20 open stöðvar per worldclass.is (Aug 2026) ──
    wc(rows, "laugar", "Laugar", "Sundlaugavegur 30a", "Reykjavík", "105", 64.145153, -21.8793827)
    wc(
        rows,
        "vatnsmyri",
        "Vatnsmýri",
        "Bjargargata 1",
        "Reykjavík",
        "102",
        64.1366281,
        -21.9462955,
        notes="Successor to legacy World Class Bjarg at same address",
    )
    wc(rows, "hr", "HR", "Menntavegur 1", "Reykjavík", "102", 64.1236899, -21.9264807)
    wc(rows, "kringlan", "Kringlan", "Kringlan 4-7", "Reykjavík", "103", 64.1286431, -21.8941488)
    wc(
        rows,
        "gamla-kringlan",
        "Gamla Kringlan",
        "Kringlan 1",
        "Reykjavík",
        "103",
        64.1298971,
        -21.8985591,
        notes="WorldFit unit; distinct club name from Kringlan 4-7",
    )
    wc(rows, "arbaer", "Árbær", "Fylkisvegur 6", "Reykjavík", "110", 64.1127999, -21.7940481)
    wc(rows, "breidholt", "Breiðholt", "Austurberg 3", "Reykjavík", "111", 64.1045094, -21.8180259)
    wc(rows, "egilsholl", "Egilshöll", "Fossaleynir 1", "Reykjavík", "112", 64.1469024, -21.7700273)
    wc(rows, "seltjarnarnes", "Seltjarnarnes", "Suðurströnd 8", "Seltjarnarnes", "170", 64.1502718, -21.9928248)
    wc(rows, "smaralind", "Smáralind", "Hagasmári 1", "Kópavogur", "201", 64.1009883, -21.8835964)
    wc(rows, "ogurhvarf", "Ögurhvarf", "Ögurhvarfi 1", "Kópavogur", "203", 64.0964497, -21.8045084)
    wc(rows, "dalshraun", "Dalshraun", "Dalshrauni 1", "Hafnarfjörður", "220", 64.0829252, -21.9454576)
    wc(
        rows,
        "tjarnarvellir",
        "Tjarnarvellir",
        "Tjarnarvellir 7",
        "Hafnarfjörður",
        "221",
        64.0533531,
        -21.973803,
        notes="Co-located sports complex with Katla Fitness Tjarnarvellir",
    )
    wc(rows, "mosfellsbaer", "Mosfellsbær", "Lækjarhlíð 1a", "Mosfellsbær", "270", 64.1651281, -21.7253403)
    wc(rows, "skolastigur", "Skólastígur", "Skólastígur 4", "Akureyri", "600", 65.6785985, -18.095569)
    wc(rows, "strandgata", "Strandgata", "Strandgata 14", "Akureyri", "600", 65.6839125, -18.0853784)
    wc(rows, "selfoss", "Selfoss", "Tryggvagata 15", "Selfoss", "800", 63.9356003, -20.9981679)
    wc(rows, "hella", "Hella", "Útskálar 4", "Hella", "850", 63.8364562, -20.4001411)
    wc(
        rows,
        "vestmannaeyjar",
        "Vestmannaeyjar",
        "Brimhólalaut",
        "Vestmannaeyjar",
        "900",
        63.4381312,
        -20.2801687,
        notes="Official CMS address Brimhólalaut; geocode via Brimhólabraut OSM alignment",
    )
    wc(rows, "akranes", "Akranes", "Jaðarsbakkar 1", "Akranes", "300", 64.3174853, -22.0569841)

    # Legacy closed — prevent re-import
    add(
        rows,
        brand="World Class",
        name="World Class Bjarg (legacy)",
        address="Bjargargata 1 (legacy Bjarg)",
        city="Reykjavík",
        postal="102",
        source_url=f"{WC}/vatnsmyri",
        closed=True,
        chain_key="world_class",
        notes="Legacy club name; same premises now Vatnsmýri — E_legacy_closed",
        discovery_class="legacy_rebrand",
    )

    # ── Katla Fitness (Class A) — 7 stöðvar per katlafitness.is/stodvarnar ──
    katla(rows, "holtagardar", "Holtagarðar", "Holtagarðar 2", "Reykjavík", "104", 64.1418819, -21.8469081,
          notes="Official address Holtagarðar 2, 2.h.; OSM leisure pin at Holtavegur 10 same complex")
    katla(rows, "lambhagi", "Lambhagi", "Lambhagavegur 15", "Reykjavík", "113", 64.1369405, -21.7579375,
          notes="Former Reebok Fitness identity per 1819.is")
    katla(rows, "faxafen", "Faxafen", "Faxafen 14", "Reykjavík", "108", 64.1286484, -21.8646469)
    katla(rows, "urdarhvarf", "Urðarhvarf", "Urðarhvarf 2", "Kópavogur", "203", 64.0955051, -21.8066817)
    katla(
        rows,
        "tjarnarvellir",
        "Tjarnarvellir",
        "Tjarnarvellir 3",
        "Hafnarfjörður",
        "221",
        64.0538405,
        -21.9709438,
        notes="Same sports complex as World Class Tjarnarvellir 7",
    )
    katla(
        rows,
        "salalaug",
        "Salalaug",
        "Versalir 3",
        "Kópavogur",
        "201",
        64.0921791,
        -21.8554921,
        access_class="A_public_conventional_pool_complex",
        notes="Municipal Salalaug with branded Katla gym station; public Katla membership",
    )
    katla(
        rows,
        "kopavogslaug",
        "Kópavogslaug",
        "Borgarholtsbraut 17",
        "Kópavogur",
        "200",
        64.1105933,
        -21.9163449,
        access_class="A_public_conventional_pool_complex",
        notes="Municipal Kópavogslaug with branded Katla gym station",
    )

    # Katla Studio — separate boutique membership (Class E)
    add(
        rows,
        brand="Katla Fitness",
        name="Katla Studio Höfðatorg",
        address="Katrínartún 4",
        city="Reykjavík",
        postal="104",
        source_url=KATLA,
        lat=64.1424521,
        lng=-21.9032637,
        coord_source="OFFICIAL_MAP_PIN",
        excluded=True,
        chain_key="katla_fitness",
        operator_class="E",
        access_class="E_boutique_studio",
        discovery_class="class_e_probe",
        notes="Separate studio membership; not conventional all-access Katla Fitness club",
    )

    # Legacy Reebok Lambhagi
    add(
        rows,
        brand="Reebok Fitness",
        name="Reebok Fitness Lambhagi (legacy)",
        address="Lambhagavegur 15 (legacy Reebok)",
        city="Reykjavík",
        postal="113",
        source_url="https://1819.is/info/293047/",
        closed=True,
        discovery_class="legacy_rebrand",
        operator_class="F",
        notes="Predecessor branding; successor Katla Fitness Lambhagi — E_legacy_closed",
    )

    # ── Class E / C probes ──
    add(
        rows,
        brand="Hreyfing",
        name="Hreyfing",
        address="Álfheimar 74",
        city="Reykjavík",
        postal="104",
        source_url="https://www.hreyfing.is/",
        lat=64.1337847,
        lng=-21.8685808,
        coord_source="OFFICIAL_MAP_PIN",
        excluded=True,
        operator_class="C",
        access_class="C_spa_wellness_primary",
        discovery_class="class_c_probe",
        notes="Spa/wellness-primary facility; not conventional public gym chain identity",
    )
    add(
        rows,
        brand="Sporthúsið",
        name="Sporthúsið Kópavogur",
        address="Dalsmári 9-11",
        city="Kópavogur",
        postal="201",
        source_url="https://www.sporthusid.is/",
        lat=64.1047052,
        lng=-21.8935253,
        coord_source="OFFICIAL_MAP_PIN",
        excluded=True,
        operator_class="E",
        access_class="E_boutique_crossfit_hybrid",
        discovery_class="class_e_probe",
        notes="2-site operator (Kópavogur + Reykjanesbær); CrossFit/bootcamp/padel heavy",
    )
    add(
        rows,
        brand="Sporthúsið",
        name="Sporthúsið Reykjanesbær",
        address="Ásbrú",
        city="Reykjanesbær",
        postal="262",
        source_url="https://www.sporthusid.is/um-sporthusid",
        excluded=True,
        operator_class="E",
        access_class="E_boutique_crossfit_hybrid",
        discovery_class="class_e_probe",
        notes="Former US base facility; 2-site Sporthúsið under Class E threshold",
    )
    add(
        rows,
        brand="Bjarg",
        name="Bjarg líkamsrækt",
        address="Bugðusíða 1",
        city="Akureyri",
        postal="603",
        source_url="https://www.bjarg.is/is/um-bjarg/bjarg-likamsraekt",
        excluded=True,
        operator_class="E",
        discovery_class="class_e_probe",
        notes="Single-site Akureyri municipal-adjacent fitness centre",
    )

    crossfit_ops = [
        ("CrossFit Reykjavík", "https://crossfitreykjavik.com/", "Reykjavík"),
        ("CrossFit XY", "https://crossfitxy.is/", "Reykjavík"),
        ("CrossFit Akureyri", "https://crossfitakureyri.is/", "Akureyri"),
        ("CrossFit Katla", KATLA, "Reykjavík"),
    ]
    for brand, url, city in crossfit_ops:
        add(
            rows,
            brand=brand,
            name=f"{brand} (scope exclusion)",
            address="",
            city=city,
            postal="",
            source_url=url,
            excluded=True,
            operator_class="C",
            access_class="C_crossfit_box",
            discovery_class="class_c_probe",
            notes="CrossFit/boutique box — out of conventional public gym catalog scope",
        )

    # ── International chain absence probes (Class F) ──
    intl_absent = [
        "Basic-Fit",
        "McFIT",
        "JOHN REED",
        "Anytime Fitness",
        "Fitness First",
        "Gold's Gym",
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
        "24-7 Fitness",
        "ALTERLIFE",
        "Fitness Sport",
    ]
    for brand in intl_absent:
        add(
            rows,
            brand=brand,
            name=f"{brand} Iceland (absent)",
            address="",
            city="Reykjavík",
            postal="101",
            source_url="https://worldclass.is/",
            excluded=True,
            operator_class="F",
            discovery_class="market_audit_exclusion",
            notes="No current Iceland conventional chain estate verified Aug 2026",
        )

    write_json(OUT / "iceland_phase1_candidates.json", rows)
    write_json(
        OUT / "phase1" / "discovery_summary.json",
        {
            "country": "Iceland",
            "production_total": PRODUCTION_TOTAL,
            "production_sha256": sha,
            "iceland_live": 0,
            "candidate_count": len(rows),
            "world_class_official_open": 20,
            "katla_fitness_official_open": 7,
            "class_a_chains": ["World Class", "Katla Fitness"],
        },
    )
    print(f"Iceland Phase 1 discovery: {len(rows)} candidates (SHA ok, Iceland live 0)")


if __name__ == "__main__":
    main()
