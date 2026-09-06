#!/usr/bin/env python3
"""Greece Phase 1 consolidate. Does NOT modify centers.json."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    GREECE_POSTAL_RE,
    ROOT,
    format_gr_postal,
    in_greece,
    run_phase1_consolidate,
)


def main():
    run_phase1_consolidate(
        country="Greece",
        prefix="gr_",
        countrycodes="gr",
        out_dir=ROOT / "data/greece",
        candidates_name="greece_phase1_candidates.json",
        postal_re=GREECE_POSTAL_RE,
        in_country=in_greece,
        format_postal=format_gr_postal,
        major_cities=[
            "Athens",
            "Αθήνα",
            "Thessaloniki",
            "Θεσσαλονίκη",
            "Patras",
            "Πάτρα",
            "Heraklion",
            "Ηράκλειο",
            "Larissa",
            "Volos",
            "Ioannina",
            "Chania",
            "Rhodes",
            "Kalamata",
        ],
        chain_coverage_notes={
            "Alterlife": "WP API club list + per-club HTML address recovery",
            "Yava": "JS-rendered locator — PHASE 2 REQUIRED for near-complete estate",
            "Holmes Place Greece": "Official locator pins (GR-only)",
            "Islands": "Chain presence captured when present in Alterlife/Yava; no indie crawl",
        },
        geocode_limit=100,
    )


if __name__ == "__main__":
    main()
