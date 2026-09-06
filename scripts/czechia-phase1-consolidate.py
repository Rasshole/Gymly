#!/usr/bin/env python3
"""Czechia Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    CZECHIA_POSTAL_RE,
    ROOT,
    format_cz_postal,
    in_czechia,
    run_phase1_consolidate,
)


def main():
    run_phase1_consolidate(
        country="Czechia",
        prefix="cz_",
        countrycodes="cz",
        out_dir=ROOT / "data/czechia",
        candidates_name="czechia_phase1_candidates.json",
        postal_re=CZECHIA_POSTAL_RE,
        in_country=in_czechia,
        format_postal=format_cz_postal,
        major_cities=[
            "Praha",
            "Brno",
            "Ostrava",
            "Plzeň",
            "Liberec",
            "Olomouc",
            "České Budějovice",
            "Hradec Králové",
            "Pardubice",
            "Zlín",
            "Ústí nad Labem",
            "Jihlava",
            "Karlovy Vary",
        ],
        chain_coverage_notes={
            "Form Factory": "Highest priority — club pages via formfactory.cz/klub",
            "Max Fitness": "Official branches from maxfitness.cz",
            "FITINN": "Czech studios via fitinn.at (CZ-only filter)",
            "clever fit": "CZ listing thin — Phase 2 if materially incomplete",
            "McFIT / John Reed": "Not confirmed present in Phase 1",
        },
        geocode_limit=90,
    )


if __name__ == "__main__":
    main()
