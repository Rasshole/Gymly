#!/usr/bin/env python3
"""Ireland Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    EIRCODE_RE,
    ROOT,
    extract_eircode,
    in_ireland,
    run_phase1_consolidate,
)


def format_eircode(s: str) -> str:
    return extract_eircode(s) or s


def main():
    run_phase1_consolidate(
        country="Ireland",
        prefix="ie_",
        countrycodes="ie",
        out_dir=ROOT / "data/ireland",
        candidates_name="ireland_phase1_candidates.json",
        postal_re=EIRCODE_RE,
        in_country=in_ireland,
        format_postal=format_eircode,
        major_cities=[
            "Dublin",
            "Cork",
            "Limerick",
            "Galway",
            "Waterford",
            "Drogheda",
            "Dundalk",
            "Kilkenny",
            "Sligo",
            "Athlone",
            "Letterkenny",
            "Wexford",
            "Tralee",
            "Killarney",
        ],
        chain_coverage_notes={
            "FLYEfit": "Primary national operator — Phase 1 near-complete from flyefit.ie/gyms",
            "Ben Dunne Gyms": "Official estate extracted from bdgyms.com",
            "West Wood Club": "Partial from westwood.ie",
            "Anytime Fitness Ireland": "Locator partial/JS — Phase 2 if estate incomplete",
            "Energie Fitness Ireland": "Must not reuse gb_* — Phase 2 ROI confirmation",
            "Aura / leisure operators": "Inclusion only for conventional gym product — Phase 2 policy application",
            "Northern Ireland": "Explicitly excluded (remains United Kingdom / gb_*)",
        },
        geocode_limit=60,
    )


if __name__ == "__main__":
    main()
