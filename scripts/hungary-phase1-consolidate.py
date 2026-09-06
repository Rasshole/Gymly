#!/usr/bin/env python3
"""Hungary Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    HUNGARY_POSTAL_RE,
    ROOT,
    format_hu_postal,
    in_hungary,
    run_phase1_consolidate,
)


def main():
    run_phase1_consolidate(
        country="Hungary",
        prefix="hu_",
        countrycodes="hu",
        out_dir=ROOT / "data/hungary",
        candidates_name="hungary_phase1_candidates.json",
        postal_re=HUNGARY_POSTAL_RE,
        in_country=in_hungary,
        format_postal=format_hu_postal,
        major_cities=[
            "Budapest",
            "Debrecen",
            "Szeged",
            "Miskolc",
            "Pécs",
            "Győr",
            "Nyíregyháza",
            "Kecskemét",
            "Székesfehérvár",
            "Szombathely",
            "Érd",
            "Veszprém",
            "Zalaegerszeg",
        ],
        chain_coverage_notes={
            "Life1 Fitness": "Major Budapest network — official data-pos pins from life1.hu",
            "Cutler Gym": "Partial Phase 1 probe — Phase 2 for multi-site estate",
            "4% / Chili / regional": "Budapest-heavy — Phase 2 required for national coverage",
            "Secondary brands": "Scitec Gold / Gilda Max / Oxygen etc. deferred to Phase 2",
        },
        geocode_limit=40,
    )


if __name__ == "__main__":
    main()
