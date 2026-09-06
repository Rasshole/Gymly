#!/usr/bin/env python3
"""Vatican City Phase 1 discovery — staging only. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    format_va_postal,
    in_vatican_city,
    write_json,
)

OUT = ROOT / "data/vatican-city"
RAW = OUT / "raw"
for d in (OUT, RAW, OUT / "phase1", OUT / "evidence"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "86c6c63b17b1bcce9cd69071f2ff7dc7cc97e7440c921b9001bc88a5a07adcd6"
PRODUCTION_TOTAL = 11721


def freeze_check() -> str:
    raw = CENTERS.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA:
        raise SystemExit(f"STOP: production SHA drift {sha}")
    data = json.loads(raw)
    if len(data) != PRODUCTION_TOTAL:
        raise SystemExit(f"STOP: production count {len(data)}")
    if sum(1 for c in data if c.get("country") in ("Vatican City", "Vatican", "Holy See")) != 0:
        raise SystemExit("STOP: Vatican City already live")
    if sum(1 for c in data if str(c.get("id", "")).startswith("va_")) != 0:
        raise SystemExit("STOP: va_* already in production")
    return sha


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    notes: str,
    discovery_class: str,
    import_category: str,
    access_class: str,
    lat: float | None = None,
    lng: float | None = None,
    territory: str = "Italy",
    country: str = "Italy",
) -> None:
    row = base_row(
        prefix="va_",
        country=country,
        brand=brand,
        name=name,
        address=address,
        postal_code=format_va_postal(postal) or postal,
        city=city,
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source="DIRECTORY" if lat is not None else None,
        notes=notes,
        discovery_class=discovery_class,
        chain_key=brand.lower().replace(" ", "_"),
    )
    row["import_category"] = import_category
    row["access_class"] = access_class
    row["territory"] = territory
    row["district"] = city
    if lat is not None and lng is not None:
        row["inside_vatican_gate"] = in_vatican_city(float(lat), float(lng))
    else:
        row["inside_vatican_gate"] = False
    rows.append(row)


def main() -> None:
    sha = freeze_check()
    rows: list[dict] = []

    # --- Institutional / security (inside or associated with Vatican) ---
    add(
        rows,
        brand="Pontifical Swiss Guard",
        name="Swiss Guard private gym (Leonine Walls)",
        address="Caserma Guardia Svizzera Pontificia",
        city="Città del Vaticano",
        postal="00120",
        source_url="https://aleteia.org/2025/06/10/does-our-sporty-pope-have-a-place-in-the-vatican-to-work-out/",
        notes=(
            "Public reporting: Swiss Guards maintain a small gym for private/personnel use "
            "inside the Leonine Walls. Not ordinary consumer membership. "
            "High-level classification only — no operational security details."
        ),
        discovery_class="security_personnel_facility",
        import_category="EXCLUDED_SECURITY",
        access_class="B_SECURITY_PERSONNEL_ONLY",
        lat=41.9038,
        lng=12.4515,
        territory="Vatican City",
        country="Vatican City",
    )
    add(
        rows,
        brand="St. Joseph Sports Center",
        name="St. Joseph / Estate ragazzi summer camp facilities",
        address="Vatican Gardens sports area (institutional)",
        city="Città del Vaticano",
        postal="00120",
        source_url="https://aleteia.org/2025/06/10/does-our-sporty-pope-have-a-place-in-the-vatican-to-work-out/",
        notes=(
            "Former JPII-era sports complex now mainly employee children's summer camp "
            "(Estate ragazzi) with pool/play — not a public conventional gym membership unit."
        ),
        discovery_class="institutional_recreation",
        import_category="EXCLUDED_INSTITUTIONAL",
        access_class="B_INSTITUTIONAL_ONLY",
        lat=41.9042,
        lng=12.4495,
        territory="Vatican City",
        country="Vatican City",
    )
    add(
        rows,
        brand="Athletica Vaticana",
        name="Athletica Vaticana (registered seat Via del Pellegrino)",
        address="Via del Pellegrino",
        city="Città del Vaticano",
        postal="00120",
        source_url="https://www.dce.va/it/cultura/sport/ath-vat.html",
        notes=(
            "Official Holy See multi-sports association for residents/employees and families. "
            "Registered seat inside Vatican; does NOT operate a public consumer gym floor. "
            "Operational HQ is Casa Vaticana dello Sport (extraterritorial Trastevere)."
        ),
        discovery_class="sports_association_no_gym",
        import_category="EXCLUDED_INSTITUTIONAL",
        access_class="F_NOT_A_GYM",
        lat=41.9028,
        lng=12.4565,
        territory="Vatican City",
        country="Vatican City",
    )
    add(
        rows,
        brand="Athletica Vaticana",
        name="Casa Vaticana dello Sport (Palazzo San Calisto)",
        address="Piazza San Calisto, 16",
        city="Rome",
        postal="00153",
        source_url="https://press.vatican.va/content/salastampa/en/info/2023/09/11/230911a.html",
        notes=(
            "Operational headquarters of Athletica Vaticana in Holy See extraterritorial "
            "property at Trastevere. Physical sovereign territory for Gymly = Italy. "
            "Not a consumer gym; not Vatican City State territory."
        ),
        discovery_class="extraterritorial_holy_see",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="F_NOT_A_GYM",
        lat=41.8892,
        lng=12.4705,
        territory="Italy",
        country="Italy",
    )

    # --- Rome border false positives (Italy) ---
    add(
        rows,
        brand="Omega Fitness Club",
        name="Omega Fitness Club San Pietro",
        address="Via delle Grazie, 6",
        city="Rome",
        postal="00193",
        source_url="https://omegafitnessclub.it/contatti-2/",
        notes=(
            "Commercial gym in Borgo/San Pietro Rome (00193). Frequently marketed near Vatican; "
            "Pope Leo XIV trained here as cardinal. Coordinates outside Vatican gate."
        ),
        discovery_class="foreign_border_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.9030,
        lng=12.4608,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="Campo Pio XI",
        name="Campo Pio XI / Petriana sports complex",
        address="Via Santa Maria Mediatrice, 22",
        city="Rome",
        postal="00165",
        source_url="https://en.wikipedia.org/wiki/Stadio_Petriana",
        notes=(
            "Knights of Columbus sports complex ~400 m from Vatican walls used for Vatican "
            "football activities — physically in Italy, not a consumer gym membership unit."
        ),
        discovery_class="foreign_border_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="C_SPORT_TEAM_ONLY",
        lat=41.8969,
        lng=12.4464,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="Virgin Active",
        name="Virgin Active Roma Prati (border probe)",
        address="Via Germanico / Prati area",
        city="Rome",
        postal="00192",
        source_url="phase1_chain_border_probe",
        notes="Prati Rome commercial operator probe — Italy, not Vatican City.",
        discovery_class="international_chain_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.9105,
        lng=12.4620,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="Anytime Fitness",
        name="Anytime Fitness Rome Prati/Borgo probe",
        address="Prati / Borgo Rome",
        city="Rome",
        postal="00193",
        source_url="phase1_chain_border_probe",
        notes="No Vatican City location found; nearest Prati/Borgo listings are Italy.",
        discovery_class="international_chain_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.9088,
        lng=12.4655,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="FitActive",
        name="FitActive Rome Vaticano-area probe",
        address="Rome Aurelio / Trionfale fringe",
        city="Rome",
        postal="00165",
        source_url="phase1_chain_border_probe",
        notes="Italian FitActive estate — zero locations inside Vatican City State.",
        discovery_class="international_chain_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.8985,
        lng=12.4405,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="Basic-Fit",
        name="Basic-Fit Rome border probe",
        city="Rome",
        address="Rome metropolitan",
        postal="00100",
        source_url="phase1_chain_border_probe",
        notes="No Basic-Fit inside Vatican City; Italian network only.",
        discovery_class="international_chain_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.9100,
        lng=12.4800,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="McFIT",
        name="McFIT Rome border probe",
        city="Rome",
        address="Rome metropolitan",
        postal="00100",
        source_url="phase1_chain_border_probe",
        notes="No McFIT / JOHN REED location inside Vatican City.",
        discovery_class="international_chain_probe",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="A_PUBLIC_CONVENTIONAL_GYM",
        lat=41.9120,
        lng=12.4900,
        territory="Italy",
        country="Italy",
    )
    add(
        rows,
        brand="Directory false positive",
        name="Generic 'Palestra Vaticano' SEO / map neighborhood label",
        address="Near San Pietro / Musei Vaticani (Italy)",
        city="Rome",
        postal="00193",
        source_url="phase1_directory_false_positive",
        notes=(
            "Composite audit of Google/Maps/travel-site results labeling Rome gyms as "
            "'Vatican City' based on neighborhood snippets — not sovereign territory."
        ),
        discovery_class="directory_false_positive",
        import_category="EXCLUDED_FOREIGN_ITALY",
        access_class="D_UNVERIFIED",
        lat=41.9025,
        lng=12.4610,
        territory="Italy",
        country="Italy",
    )

    write_json(OUT / "vatican_city_phase1_candidates.json", rows)
    write_json(
        OUT / "phase1" / "discovery_summary.json",
        {
            "production_sha256": sha,
            "candidates": len(rows),
            "vatican_territory_rows": sum(1 for r in rows if r.get("territory") == "Vatican City"),
            "italy_rows": sum(1 for r in rows if r.get("territory") == "Italy"),
            "ready": 0,
        },
    )
    print(json.dumps({"sha": sha, "candidates": len(rows)}, indent=2))


if __name__ == "__main__":
    main()
