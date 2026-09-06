#!/usr/bin/env python3
"""North Macedonia Phase 1 discovery — staging only. Does NOT modify centers.json."""
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
    format_mk_postal,
    write_json,
)

OUT = ROOT / "data/north-macedonia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
for d in (OUT, RAW, PAGES, OUT / "scrapes", OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698"
PRODUCTION_TOTAL = 11775

CITY_CANON = {
    "skopje": "Skopje",
    "скопје": "Skopje",
    "bitola": "Bitola",
    "битола": "Bitola",
    "kumanovo": "Kumanovo",
    "куманово": "Kumanovo",
    "prilep": "Prilep",
    "прилеп": "Prilep",
    "tetovo": "Tetovo",
    "тетово": "Tetovo",
    "ohrid": "Ohrid",
    "охрид": "Ohrid",
    "veles": "Veles",
    "велес": "Veles",
    "štip": "Štip",
    "stip": "Štip",
    "штип": "Štip",
    "gostivar": "Gostivar",
    "гостивар": "Gostivar",
    "strumica": "Strumica",
    "струмица": "Strumica",
    "kavadarci": "Kavadarci",
    "кавадарци": "Kavadarci",
    "kočani": "Kočani",
    "kocani": "Kočani",
    "кочани": "Kočani",
    "kičevo": "Kičevo",
    "kicevo": "Kičevo",
    "кичево": "Kičevo",
    "gevgelija": "Gevgelija",
    "гевгелија": "Gevgelija",
    "debar": "Debar",
    "дебар": "Debar",
    "radoviš": "Radoviš",
    "radovis": "Radoviš",
    "радовиш": "Radoviš",
    "butel": "Butel",
    "бутел": "Butel",
    "thessaloniki": "Thessaloniki",
    "florina": "Florina",
    "edessa": "Edessa",
    "kilkis": "Kilkis",
    "pristina": "Pristina",
    "priština": "Pristina",
    "ferizaj": "Ferizaj",
    "gjilan": "Gjilan",
    "vranje": "Vranje",
    "preševo": "Preševo",
    "presevo": "Preševo",
    "kyustendil": "Kyustendil",
    "blagoevgrad": "Blagoevgrad",
    "korçë": "Korçë",
    "korce": "Korçë",
    "pogradec": "Pogradec",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    return CITY_CANON.get(s.lower().strip()) or s


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str = "",
    municipality: str | None = None,
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
    discovery_class: str = "independent",
    import_category: str | None = None,
    chain_key: str | None = None,
    access_class: str = "A_public_conventional",
    operator_class: str = "B",
    territory: str = "North Macedonia",
    eligibility_candidate: str | None = None,
    website: str | None = None,
    foreign_probe: bool = False,
    hotel_spa_risk: bool = False,
    phase1_city_class: str | None = None,
    albanian_audit: bool = False,
) -> None:
    city_c = canon_city(city)
    row = base_row(
        prefix="mk_",
        country="North Macedonia" if territory == "North Macedonia" else territory,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_mk_postal(postal) or postal,
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
    row["municipality"] = municipality or city_c
    row["access_class"] = access_class
    row["operator_class"] = operator_class
    row["territory"] = territory
    row["foreign_probe"] = foreign_probe
    row["hotel_spa_risk"] = hotel_spa_risk
    row["albanian_audit"] = albanian_audit
    if phase1_city_class:
        row["phase1_city_class"] = phase1_city_class
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
        row["import_category"] = "NEEDS_REVIEW"
    rows.append(row)


def assert_production_freeze() -> None:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    centers = json.loads(raw)
    mk = [c for c in centers if c.get("country") == "North Macedonia"]
    mk_pref = [c for c in centers if str(c.get("id", "")).startswith("mk_")]
    assert len(centers) == PRODUCTION_TOTAL, len(centers)
    assert len(mk) == 0 and len(mk_pref) == 0
    assert sha == EXPECTED_SHA, sha
    print(f"FREEZE OK total={len(centers)} NorthMacedonia=0 mk_*=0 SHA={sha}")


def build_candidates() -> list[dict]:
    rows: list[dict] = []

    # ——— International / regional chain probes (ABSENT in MK) ———
    for brand, note in [
        ("Basic-Fit", "No MK franchise evidence"),
        ("PureGym", "No MK franchise evidence"),
        ("McFIT", "No MK franchise evidence"),
        ("JOHN REED", "No MK franchise evidence"),
        ("Anytime Fitness", "No MK franchise evidence"),
        ("Gold's Gym", "No MK franchise evidence"),
        ("World Class", "No MK franchise evidence"),
        ("Fitness Park", "No MK franchise evidence"),
        ("FitActive", "No MK franchise evidence"),
        ("Stay Fit Gym", "No MK franchise evidence"),
        ("18GYM", "No MK franchise evidence"),
        ("Ahilej", "Serbia-only estate; no MK locations on ahilej.com/lokacije"),
        ("XBody", "No conventional multi-site MK public estate evidence"),
    ]:
        add(
            rows,
            brand=brand,
            name=f"{brand} — North Macedonia probe ABSENT",
            address="n/a",
            city="Skopje",
            postal="1000",
            source_url="phase1://international-probe-mk",
            notes=note,
            excluded=True,
            discovery_class="international_probe",
            access_class="C_absent",
            operator_class="ABSENT",
            eligibility_candidate="ABSENT",
            import_category="EXCLUDED",
        )

    # ——— Skopje multi-site / independents (below Class A ≥3) ———
    add(
        rows,
        brand="Fit One",
        name="Fit One school / institutional site (Skopje)",
        address="School / institutional premises — confirm exact unit",
        city="Skopje",
        postal="1000",
        municipality="Centar",
        source_url="phase1://fit-one-institutional",
        notes="Multi-site Fit One branding observed at school/institutional sites — institutional access risk; hold NEEDS_REVIEW.",
        needs_review=True,
        discovery_class="multi_site_below_class_a",
        eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
        operator_class="B",
        chain_key="fit_one",
        access_class="B_institutional_risk",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Fit One",
        name="Fit One second school site (Skopje)",
        address="Second school / institutional premises",
        city="Skopje",
        postal="1000",
        municipality="Karpoš",
        source_url="phase1://fit-one-institutional",
        notes="Second Fit One institutional unit — estate size unclear; institutional risk NR/NC.",
        needs_review=True,
        discovery_class="multi_site_below_class_a",
        eligibility_candidate="MULTI_SITE_BELOW_CLASS_A",
        chain_key="fit_one",
        access_class="B_institutional_risk",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Athletic Fitness",
        name="Athletic Fitness Diamond Mall",
        address="Jordan Mijalkov 31, Diamond Mall",
        city="Skopje",
        postal="1000",
        municipality="Centar",
        source_url="phase1://athletic-fitness-diamond-mall",
        website="https://athletic.mk/",
        notes="Conventional public gym at Diamond Mall; single defended Skopje site in Phase 1 — below Class A.",
        needs_review=True,
        lat=41.9958,
        lng=21.4285,
        coord_source="directory_diamond_mall_jordan_mijalkov_31",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        chain_key="athletic_fitness",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Star Gym",
        name="Star Gym Butel",
        address="Tale Hristov 1",
        city="Skopje",
        postal="1000",
        municipality="Butel",
        source_url="phase1://star-gym-butel",
        notes="Conventional independent at Tale Hristov 1, Butel.",
        needs_review=True,
        lat=42.0305,
        lng=21.4422,
        coord_source="directory_tale_hristov_1_butel",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Synergy Fitness Spa",
        name="Synergy Fitness Spa Skopje",
        address="Skopje — spa/fitness co-branded premises",
        city="Skopje",
        postal="1000",
        municipality="Centar",
        source_url="phase1://synergy-fitness-spa",
        notes="Spa-primary risk — hold NEEDS_REVIEW; do not promote to READY without conventional floor proof.",
        needs_review=True,
        hotel_spa_risk=True,
        access_class="B_spa_risk",
        eligibility_candidate="SPA_RISK_REVIEW",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Sky Wellness",
        name="Sky Wellness Skopje",
        address="Skopje wellness / spa complex",
        city="Skopje",
        postal="1000",
        municipality="Karpoš",
        source_url="phase1://sky-wellness",
        notes="Spa/wellness-primary — EXCLUDED pending Phase 2 if conventional gym floor proven.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_spa_primary",
        eligibility_candidate="EXCLUDED_SPA",
        import_category="EXCLUDED",
    )
    add(
        rows,
        brand="Fitness Club Fit",
        name="Fitness Club Fit Skopje",
        address="Skopje — confirm street premises",
        city="Skopje",
        postal="1000",
        municipality="Aerodrom",
        source_url="phase1://fitness-club-fit",
        notes="Directory conventional candidate; defend address/coords in Phase 2.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Terminator",
        name="Terminator Gym Skopje",
        address="Skopje — confirm street premises",
        city="Skopje",
        postal="1000",
        municipality="Kisela Voda",
        source_url="phase1://terminator-gym",
        notes="Bodybuilding / conventional floor candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Atleta",
        name="Atleta Fitness Skopje",
        address="Skopje — confirm street premises",
        city="Skopje",
        postal="1000",
        municipality="Gazi Baba",
        source_url="phase1://atleta",
        notes="Independent conventional candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Mastersport",
        name="Mastersport Skopje",
        address="Skopje — confirm street premises",
        city="Skopje",
        postal="1000",
        municipality="Čair",
        source_url="phase1://mastersport",
        notes="Sports retail / gym candidate — verify conventional public membership vs shop floor.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        albanian_audit=True,
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Sporteks",
        name="Sporteks Fitness Skopje",
        address="Skopje — confirm street premises",
        city="Skopje",
        postal="1000",
        municipality="Gjorče Petrov",
        source_url="phase1://sporteks",
        notes="Independent conventional candidate.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )

    # ——— Skopje specialists EXCLUDED ———
    for brand, name, note, access in [
        (
            "PowerHouse Pilates",
            "PowerHouse Pilates Skopje",
            "Pilates-only specialist exclusion.",
            "C_pilates_only",
        ),
        (
            "Fitlife",
            "Fitlife studio Skopje",
            "PT / boutique studio specialist exclusion.",
            "C_pt_studio",
        ),
        (
            "Top Forma",
            "Top Forma Skopje",
            "Body-shaping / specialist exclusion.",
            "C_specialist",
        ),
        (
            "Pole People",
            "Pole People Skopje",
            "Pole dance specialist exclusion.",
            "C_dance_specialist",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Skopje specialist premises",
            city="Skopje",
            postal="1000",
            source_url="phase1://specialist-exclusion",
            notes=note,
            excluded=True,
            access_class=access,
            eligibility_candidate="EXCLUDED_SPECIALIST",
            import_category="EXCLUDED",
        )

    # ——— Hotel amenities EXCLUDED ———
    for name, address, muni, note in [
        (
            "Hotel Aleksandar hotel gym",
            "Hotel Aleksandar, Skopje",
            "Centar",
            "Hotel-guest amenity — EXCLUDED.",
        ),
        (
            "Marriott Skopje fitness amenity",
            "Marriott Hotel Skopje",
            "Centar",
            "Hotel amenity — EXCLUDED.",
        ),
        (
            "DoubleTree Skopje fitness amenity",
            "DoubleTree by Hilton Skopje",
            "Centar",
            "Hotel amenity — EXCLUDED.",
        ),
    ]:
        add(
            rows,
            brand="Hotel amenity",
            name=name,
            address=address,
            city="Skopje",
            postal="1000",
            municipality=muni,
            source_url="phase1://hotel-amenity-exclusion",
            notes=note,
            excluded=True,
            hotel_spa_risk=True,
            access_class="C_hotel_amenity",
            eligibility_candidate="EXCLUDED_HOTEL",
            import_category="EXCLUDED",
        )

    # ——— Bitola ———
    add(
        rows,
        brand="Flex Gym",
        name="Flex Gym Bitola",
        address="Nikola Tesla 34",
        city="Bitola",
        postal="7000",
        municipality="Bitola",
        source_url="phase1://flex-gym-bitola",
        notes="Conventional independent; Nikola Tesla 34.",
        needs_review=True,
        lat=41.0314,
        lng=21.3347,
        coord_source="directory_nikola_tesla_34_bitola",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
    )

    # ——— Ohrid (tourism false-positive sensitive) ———
    add(
        rows,
        brand="IB Fitness",
        name="IB Fitness Ohrid",
        address="Ohrid — confirm street premises",
        city="Ohrid",
        postal="6000",
        municipality="Ohrid",
        source_url="phase1://ib-fitness-ohrid",
        notes="Conventional public candidate; distinguish from hotel/spa amenities.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Fitness Factori",
        name="Fitness Factori Ohrid",
        address="Ohrid — confirm street premises",
        city="Ohrid",
        postal="6000",
        municipality="Ohrid",
        source_url="phase1://fitness-factori-ohrid",
        notes="Conventional public candidate near tourist zone — verify non-hotel membership.",
        needs_review=True,
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        phase1_city_class="independent_present_candidate",
    )
    add(
        rows,
        brand="Hotel amenity",
        name="Ohrid lakeside hotel gym probe",
        address="Lakeside hotel, Ohrid",
        city="Ohrid",
        postal="6000",
        source_url="phase1://ohrid-hotel-probe",
        notes="Tourism hotel amenity probe — EXCLUDED.",
        excluded=True,
        hotel_spa_risk=True,
        access_class="C_hotel_amenity",
        eligibility_candidate="EXCLUDED_HOTEL",
        import_category="EXCLUDED",
    )

    # ——— Kumanovo ———
    for brand, name, note in [
        ("Aldo", "Aldo Fitness Kumanovo", "Independent conventional candidate."),
        ("Fit Bodi", "Fit Bodi Kumanovo", "Independent conventional candidate."),
        ("Chili", "Chili Fitness Kumanovo", "Independent conventional candidate."),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Kumanovo — confirm street premises",
            city="Kumanovo",
            postal="1300",
            municipality="Kumanovo",
            source_url="phase1://kumanovo-independents",
            notes=note,
            needs_review=True,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=True,
            import_category="NEEDS_COORDINATES",
            phase1_city_class="independent_present_candidate",
        )

    # ——— Prilep ———
    for brand, name in [
        ("Shampion", "Shampion Gym Prilep"),
        ("Fit Star", "Fit Star Prilep"),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Prilep — confirm street premises",
            city="Prilep",
            postal="7500",
            municipality="Prilep",
            source_url="phase1://prilep-independents",
            notes="Independent conventional candidate.",
            needs_review=True,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=True,
            import_category="NEEDS_COORDINATES",
            phase1_city_class="independent_present_candidate",
        )

    # ——— Tetovo (Albanian-language audit) ———
    for brand, name, note in [
        ("Arena", "Arena Fitness Tetovo", "Albanian-language audit hit — conventional candidate."),
        ("Starfit", "Starfit Tetovo", "Albanian-language audit hit — conventional candidate."),
        ("Foxy", "Foxy Fitness Tetovo", "Albanian-language audit hit — conventional candidate."),
        (
            "Fajar Bodi",
            "Fajar Bodi Tetovo",
            "Albanian-language audit hit (palestra/fitness) — conventional candidate.",
        ),
    ]:
        add(
            rows,
            brand=brand,
            name=name,
            address="Tetovo — confirm street premises",
            city="Tetovo",
            postal="1200",
            municipality="Tetovo",
            source_url="phase1://tetovo-albanian-audit",
            notes=note,
            needs_review=True,
            discovery_class="independent",
            eligibility_candidate="SMALL_MARKET_INDEPENDENT",
            needs_coords=True,
            import_category="NEEDS_COORDINATES",
            albanian_audit=True,
            phase1_city_class="independent_present_candidate",
        )

    # ——— Other required cities: candidates or B_discovery_gap markers ———
    for city, postal, brand, name, klass, note in [
        (
            "Veles",
            "1400",
            "Regional audit",
            "Regional gap marker — Veles",
            "B_discovery_gap",
            "No defended conventional public gym in Phase 1; Phase 2 deep pass.",
        ),
        (
            "Štip",
            "2000",
            "Regional audit",
            "Regional gap marker — Štip",
            "B_discovery_gap",
            "No defended conventional public gym in Phase 1; Phase 2 deep pass.",
        ),
        (
            "Gostivar",
            "1230",
            "Regional audit",
            "Regional gap marker — Gostivar",
            "B_discovery_gap",
            "Albanian-language pass noted; no defended conventional joinable gym yet.",
        ),
        (
            "Strumica",
            "2400",
            "Regional audit",
            "Regional gap marker — Strumica",
            "B_discovery_gap",
            "Pulse Atlantis (BG locator foreign) is not an MK import; local independent TBD Phase 2.",
        ),
        (
            "Kavadarci",
            "1430",
            "Regional audit",
            "Regional gap marker — Kavadarci",
            "B_discovery_gap",
            "No defended conventional public gym in Phase 1.",
        ),
        (
            "Kočani",
            "2300",
            "Regional audit",
            "Regional gap marker — Kočani",
            "B_discovery_gap",
            "No defended conventional public gym in Phase 1.",
        ),
        (
            "Kičevo",
            "6250",
            "Regional audit",
            "Regional gap marker — Kičevo SUPERSEDED",
            "independent_present_candidate",
            "Superseded by Fitness Club Flex Kičevo candidate row.",
        ),
        (
            "Gevgelija",
            "1480",
            "Regional audit",
            "Regional gap marker — Gevgelija",
            "B_discovery_gap",
            "Border-town; hotel amenities excluded; no independent confirmed.",
        ),
        (
            "Debar",
            "1250",
            "Regional audit",
            "Regional gap marker — Debar",
            "B_discovery_gap",
            "Albanian-language pass; no defended conventional gym yet.",
        ),
        (
            "Radoviš",
            "2420",
            "Regional audit",
            "Regional gap marker — Radoviš",
            "B_discovery_gap",
            "No defended conventional public gym in Phase 1.",
        ),
    ]:
        if name == "Regional gap marker — Kičevo SUPERSEDED":
            continue
        add(
            rows,
            brand=brand,
            name=name,
            address="n/a",
            city=city,
            postal=postal,
            source_url="phase1://regional-gap-matrix",
            notes=note,
            excluded=True,
            discovery_class="regional_gap",
            eligibility_candidate="REGIONAL_GAP",
            import_category="EXCLUDED",
            phase1_city_class=klass,
            albanian_audit=city in ("Gostivar", "Debar"),
        )

    # Kičevo conventional candidate (Albanian-speaking market + Macedonian directory)
    add(
        rows,
        brand="Fitness Club Flex",
        name="Fitness Club Flex Kičevo",
        address="Janko Mihajloski bb",
        city="Kičevo",
        postal="6250",
        municipality="Kičevo",
        source_url="phase1://kicevo-flex-directory",
        notes="Directory-listed conventional gym; Albanian-language market city; Phase 2 confirm open status.",
        needs_coords=True,
        import_category="NEEDS_COORDINATES",
        discovery_class="independent",
        eligibility_candidate="SMALL_MARKET_INDEPENDENT",
        phase1_city_class="independent_present_candidate",
        albanian_audit=True,
    )

    # Skopje municipality audit markers (coverage evidence, not gyms)
    for muni, note in [
        ("Centar", "Deep-audited; Athletic Fitness Diamond Mall staged."),
        ("Karpoš", "Deep-audited; Fit One institutional + Sky Wellness exclusion."),
        ("Aerodrom", "Deep-audited; Fitness Club Fit candidate."),
        ("Kisela Voda", "Deep-audited; Terminator candidate."),
        ("Gazi Baba", "Deep-audited; Atleta candidate."),
        ("Čair", "Deep-audited + Albanian terms; Mastersport candidate."),
        ("Butel", "Deep-audited; Star Gym Tale Hristov 1 staged."),
        ("Saraj", "Deep-audited; no defended conventional public gym in Phase 1."),
        ("Šuto Orizari", "Deep-audited; no defended conventional public gym in Phase 1."),
        ("Gjorče Petrov", "Deep-audited; Sporteks candidate."),
    ]:
        add(
            rows,
            brand="Municipality audit",
            name=f"Skopje municipality audit — {muni}",
            address=f"Skopje municipality audit marker — {muni}",
            city="Skopje",
            postal="1000",
            municipality=muni,
            source_url="phase1://skopje-municipality-audit",
            notes=note,
            excluded=True,
            discovery_class="municipality_audit",
            eligibility_candidate="AUDIT_MARKER",
            import_category="EXCLUDED",
            albanian_audit=muni in ("Čair", "Saraj"),
            phase1_city_class=(
                "independent_present_candidate"
                if muni
                in (
                    "Centar",
                    "Karpoš",
                    "Aerodrom",
                    "Kisela Voda",
                    "Gazi Baba",
                    "Čair",
                    "Butel",
                    "Gjorče Petrov",
                )
                else "B_discovery_gap"
            ),
        )

    # ——— Cross-border contamination probes (must NOT become READY mk_*) ———
    for brand, name, address, city, postal, lat, lng, territory, url in [
        (
            "Foreign probe",
            "Thessaloniki border probe",
            "Thessaloniki center",
            "Thessaloniki",
            "54621",
            40.6401,
            22.9444,
            "Greece",
            "phase1://border-probe-gr-thessaloniki",
        ),
        (
            "Foreign probe",
            "Florina border probe",
            "Florina center",
            "Florina",
            "53100",
            40.7823,
            21.4098,
            "Greece",
            "phase1://border-probe-gr-florina",
        ),
        (
            "Foreign probe",
            "Edessa border probe",
            "Edessa center",
            "Edessa",
            "58200",
            40.8026,
            22.0473,
            "Greece",
            "phase1://border-probe-gr-edessa",
        ),
        (
            "Foreign probe",
            "Kilkis border probe",
            "Kilkis center",
            "Kilkis",
            "61100",
            40.9930,
            22.8743,
            "Greece",
            "phase1://border-probe-gr-kilkis",
        ),
        (
            "Foreign probe",
            "Pristina border probe",
            "Pristina center",
            "Pristina",
            "10000",
            42.6629,
            21.1655,
            "Kosovo",
            "phase1://border-probe-xk-pristina",
        ),
        (
            "Foreign probe",
            "Ferizaj border probe",
            "Ferizaj center",
            "Ferizaj",
            "70000",
            42.3700,
            21.1550,
            "Kosovo",
            "phase1://border-probe-xk-ferizaj",
        ),
        (
            "Foreign probe",
            "Gjilan border probe",
            "Gjilan center",
            "Gjilan",
            "60000",
            42.4635,
            21.4694,
            "Kosovo",
            "phase1://border-probe-xk-gjilan",
        ),
        (
            "Foreign probe",
            "Vranje border probe",
            "Vranje center",
            "Vranje",
            "17500",
            42.5514,
            21.9003,
            "Serbia",
            "phase1://border-probe-rs-vranje",
        ),
        (
            "Foreign probe",
            "Preševo border probe",
            "Preševo center",
            "Preševo",
            "17523",
            42.3067,
            21.6500,
            "Serbia",
            "phase1://border-probe-rs-presevo",
        ),
        (
            "Foreign probe",
            "Kyustendil border probe",
            "Kyustendil center",
            "Kyustendil",
            "2500",
            42.2833,
            22.6911,
            "Bulgaria",
            "phase1://border-probe-bg-kyustendil",
        ),
        (
            "Foreign probe",
            "Blagoevgrad border probe",
            "Blagoevgrad center",
            "Blagoevgrad",
            "2700",
            42.0110,
            23.0900,
            "Bulgaria",
            "phase1://border-probe-bg-blagoevgrad",
        ),
        (
            "Foreign probe",
            "Korçë border probe",
            "Korçë center",
            "Korçë",
            "7001",
            40.6186,
            20.7808,
            "Albania",
            "phase1://border-probe-al-korce",
        ),
        (
            "Foreign probe",
            "Pogradec border probe",
            "Pogradec center",
            "Pogradec",
            "7301",
            40.9025,
            20.6525,
            "Albania",
            "phase1://border-probe-al-pogradec",
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
            notes=f"Contamination probe — {territory}. Must remain EXCLUDED; never READY mk_*.",
            excluded=True,
            lat=lat,
            lng=lng,
            coord_source="border_probe_landmark",
            discovery_class="border_probe",
            territory=territory,
            foreign_probe=True,
            eligibility_candidate="FOREIGN_EXCLUDED",
            import_category="EXCLUDED",
            access_class="C_foreign",
        )

    return rows


def main() -> None:
    assert_production_freeze()
    rows = build_candidates()
    write_json(OUT / "north_macedonia_phase1_candidates.json", rows)
    (OUT / "phase1" / "discover_freeze.json").write_text(
        json.dumps(
            {
                "production_total": PRODUCTION_TOTAL,
                "production_sha256": EXPECTED_SHA,
                "north_macedonia_live": 0,
                "mk_prefix_live": 0,
                "candidates": len(rows),
            },
            indent=2,
        )
        + "\n"
    )
    print(
        f"Wrote {len(rows)} candidates → data/north-macedonia/north_macedonia_phase1_candidates.json"
    )


if __name__ == "__main__":
    main()
