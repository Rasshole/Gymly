# France Phase 2 Readiness Report

Generated: 2026-08-19 12:21 UTC

**Status: PHASE 2 COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Overall

| Metric | Count |
|---|---:|
| Phase 1 unique staged | 1,587 |
| Phase 1 READY_TO_IMPORT | 1,196 |
| New Phase 2 discoveries | 558 |
| Phase 1 recovered (geocoded) | 332 |
| Final unique France staging total | 2,145 |
| READY_TO_IMPORT | 1,528 |
| NEEDS_COORDINATES | 145 |
| NEEDS_REVIEW | 463 |
| COMING_SOON | 9 |
| CLOSED | 0 |
| DUPLICATE | 0 |

## Chain Coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Basic-Fit | ~911 | 897 | 897 | 0 | 100% |
| Fitness Park | ~350 | 350 | 211 | 139 | 60% |
| L'Orange Bleue | ~400 | 217 | 140 | 77 | 65% |
| Keepcool | ~270 | 239 | 0 | 239 | 0% |
| ON AIR Fitness | ~110 | 126 | 99 | 27 | 79% |
| L'Appart Fitness | ~111 | 110 | 110 | 0 | 100% |
| Neoness | ~30 | 29 | 17 | 12 | 59% |
| Elancia | ~53 | 48 | 0 | 48 | 0% |
| Gigafit | ~40 | 28 | 15 | 13 | 54% |
| Magic Form | ~60 | 37 | 33 | 4 | 89% |
| Vita Liberté | ~50 | 52 | 0 | 52 | 0% |
| Anytime Fitness | ~7 | 11 | 6 | 5 | 55% |
| Cercles de la Forme | ~30 | 1 | 0 | 1 | 0% |

## Proposed SAFE Merge

**1,528** READY_TO_IMPORT rows are recommended for a later France production merge.

Expected catalog after merge: **5,455 + 1,528 = 6,983**.

## Scaling

Current live catalog: 5,455.
6,983 remains **comfortably inside** the current client-side architecture.

## Files

Created or updated under `data/france/` and `scripts/`:

- `scripts/france-phase2-discover.py`
- `data/france/france_centers_staging.json`
- `data/france/france_geocode_cache.json`
- `data/france/france_duplicate_analysis.json`
- `data/france/FRANCE_PHASE2_READINESS_REPORT.md`

**STOP. Do not merge France. Do not run France QA. Do not start another country.**
