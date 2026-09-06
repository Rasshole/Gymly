# Netherlands Production Safe Merge

Generated: 2026-08-19

**Status: MERGED.** 600 READY_TO_IMPORT rows inserted into `src/data/centers.json`.

## Counts

| Metric | Count |
|---|---:|
| Centers before | 4,855 |
| Netherlands before | 0 |
| Exact inserted | **600** |
| Centers after | **5,455** |
| Netherlands after | **600** |
| Denmark | 354 (unchanged) |
| Sweden | 639 (unchanged) |
| Norway | 535 (unchanged) |
| Finland | 429 (unchanged) |
| Germany | 1,424 (unchanged) |
| United Kingdom | 1,474 (unchanged) |

## Netherlands Brand Breakdown

| Brand | Count |
|---|---:|
| Basic-Fit | 248 |
| Anytime Fitness | 132 |
| SportCity | 117 |
| TrainMore | 49 |
| HealthCity | 19 |
| BigGym | 15 |
| Optisport | 7 |
| David Lloyd | 6 |
| Snap Fitness | 6 |
| Clubsportive | 1 |
| **Total** | **600** |

## Validation

- Duplicate IDs found: **0**
- Same-brand physical duplicates found: **0**
- Legacy/rebrand duplicates found (SportCity/Fit For Free): **0**
- TrainMore tier duplicates: **0**
- Missing address/postcode/city: **0 / 0 / 0**
- Postcode validation (Dutch format `1234 AB`): **all pass**
- Coordinate validation (finite, not 0,0): **all pass**
- Cross-border outliers (outside NL bbox): **0**
- Encoding issues (mojibake): **0**
- Dutch diacritics preserved (é/ë/ï/ö/ü/á): verified

## Duplicate Detection

- Skipped (existing ID collision): 0
- Skipped (same brand + same address): 0
- Skipped (same-brand proximity <100 m): 3
  - `nl_1c58b5c1a2` Gym Donjon 24/7 Almere (82 m from nl_f9e03f6964)
  - `nl_53052a5148` Basic-Fit Eindhoven Vijfkamplaan (57 m from nl_b4f9eaf309)
  - `nl_1ea8b30e5e` Basic-Fit Rotterdam Metaalhof Ladies (74 m from nl_2096092791)

## Idempotency

Second run result: **0 new insertions** ✓

## Still Staged (not in production)

| Category | Count |
|---|---:|
| MERGED_INTO_CATALOG | 600 |
| NEEDS_COORDINATES | 12 |
| NEEDS_REVIEW | 10 |
| COMING_SOON | 3 |
| CLOSED | 0 |
| READY_TO_IMPORT (proximity-rejected) | 3 |

## Benchmark Results

| Metric (5,455 centers) | Value |
|---|---:|
| JSON parse | 5 ms |
| Index build | 218 ms |
| Typical search (3 queries) | 242 ms |
| Worst search (2 queries) | 55 ms |
| Nearest | 13 ms |
| Map build | 16 ms |
| Map filter | 2 ms |

All benchmarks pass. No performance regression.

## Files Changed

- `src/data/centers.json` (append-only NL rows; DK/SE/NO/FI/DE/UK untouched)
- `data/netherlands/netherlands_centers_staging.json` (600 rows marked MERGED_INTO_CATALOG)
- `data/netherlands/NETHERLANDS_MERGE_REPORT.json`
- `data/netherlands/NETHERLANDS_MERGE_REPORT.md`
- `data/netherlands/NETHERLANDS_MERGE_DUPLICATE_ANALYSIS.json`
- `scripts/import-netherlands-merge.mjs`

## Remaining Risks

- 12 NEEDS_COORDINATES centers are absent from check-in until geocoded
- 10 NEEDS_REVIEW centers require manual verification before import
- 3 COMING_SOON centers must be activated later when confirmed open
- 3 proximity-rejected rows remain as READY_TO_IMPORT in staging — may need manual review to confirm they are true duplicates
