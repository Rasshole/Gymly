# UK first safe production merge

Generated: 2026-08-18

**Status: MERGED.** Only READY_TO_IMPORT rows were inserted into `src/data/centers.json`.

Unresolved, coming-soon, closed, test, and legacy DW Sports rows remain in staging only.

`CHECK_IN_RADIUS_METERS` remains **200**. Auto-checkout was not modified.

## Counts

| Metric | Count |
|---|---:|
| Centers before | 2,952 |
| UK before | 0 |
| Exact inserted | **1,474** |
| Centers after | **4,426** |
| UK after | **1,474** |
| Denmark | 354 (unchanged) |
| Sweden | 639 (unchanged) |
| Norway | 535 (unchanged) |
| Germany | 1,424 (unchanged) |
| Idempotency second-run insertions | **0** |

## UK brand breakdown (production)

| Brand | Count |
|---|---:|
| PureGym | 456 |
| The Gym Group | 256 |
| Anytime Fitness | 137 |
| David Lloyd | 112 |
| Nuffield Health | 110 |
| JD Gyms | 78 |
| Snap Fitness | 71 |
| Bannatyne | 48 |
| Everlast Gyms | 44 |
| énergie Fitness | 34 |
| Village Gym | 34 |
| Virgin Active | 26 |
| Fitness First | 23 |
| Third Space | 15 |
| Total Fitness | 11 |
| Gymbox | 7 |
| Buzz Gym | 6 |
| Fitness4Less | 5 |
| easyGym | 1 |
| **Total** | **1,474** |

## Validation

- Duplicate IDs: **0**
- Same-brand physical duplicates (≤50 m): **0**
- Missing address / postcode / city / coordinates: **0 / 0 / 0 / 0**
- Invalid coordinates (null, NaN, Inf, 0,0): **0**
- UK bbox outliers: **0**
- London fallback hits: **0**
- All UK production IDs are `gb_*` (no `uk_*`)
- All UK production `country` values are `"United Kingdom"`
- All 1,474 UK rows are `is_active: true`
- No DW Sports Fitness production rows
- No COMING_SOON or CLOSED rows in production

## Different-brand clusters (≤50 m, not collapsed)

These are reported only. Different current brands may share a site.

- Anytime Fitness London / Snap Fitness Raynes Park (24 m)
- Anytime Fitness London / Energie Fitness Kilburn (45 m)
- Energie Fitness Erith / PureGym Erith (12 m)
- Nuffield Health Swindon / The Gym Group Swindon (13 m)
- PureGym London Kingston / The Gym Group London Kingston (33 m)
- PureGym London Wood Green / The Gym Group London Wood Green The Mall (42 m)

Also kept (same address, different brand): Everlast Gyms York vs PureGym York.

## Still staged (not production)

| Category | Count |
|---|---:|
| MERGED_INTO_CATALOG (pointer in staging) | 1,474 |
| NEEDS_COORDINATES | 166 |
| NEEDS_REVIEW | 5 |
| COMING_SOON | 71 |
| CLOSED | 1 |
| Unique staged total | 1,717 |

Held out of production (examples): Anytime London test placeholder; Energie Brentford; Snap Bristol Filton; Virgin Cannon Street / Clearview / Chiswick Riverside; Buzz Oxford / Harrow; David Lloyd Northwood; Gymbox Holborn / Elephant & Castle / Finsbury Park; Nuffield Health Barrow (CLOSED); all 71 coming-soon clubs including 6 JD pages.

## Files changed

- `src/data/centers.json` (append-only UK rows; DK/SE/NO/DE untouched)
- `data/uk/uk_centers_staging.json` (READY rows marked `MERGED_INTO_CATALOG`; research rows preserved)
- `data/uk/UK_MERGE_REPORT.json`
- `data/uk/UK_MERGE_REPORT.md`
- `data/uk/UK_APPROVED_FOR_MERGE.json`
- `data/uk/UK_MERGE_DUPLICATE_ANALYSIS.json`
- `scripts/import-uk-centers-phase2-merge.mjs`
- `scripts/benchmark-gym-catalog-scale.test.ts` (live catalog size instead of hardcoded 2,952)

Not modified: check-in radius, auto-checkout, workout logging, PR logic, feed, localization, center architecture, DK/SE/NO/DE rows.

## Performance

`npm run bench:catalog` after merge:

| Size | Parse | Index | Typical search (3q) | Nearest | Map build |
|---|---:|---:|---:|---:|---:|
| **4,426 live** | 5 ms | 297 ms (0 cached) | 220 ms | 14 ms | 15 ms |
| 5,000 | 5 ms | 224 ms | 220 ms | 13 ms | 16 ms |
| 10,000 | 13 ms | 405 ms | 458 ms | 24 ms | 27 ms |
| 25,000 | 31 ms | 1,105 ms | 1,149 ms | 59 ms | 60 ms |

**4,426 remains comfortably inside** the current client-side architecture (comfort band ~8–10k). No catalog redesign or optimization in this merge.

## Remaining risks

- 166 NEEDS_COORDINATES and 5 NEEDS_REVIEW clubs are absent from check-in.
- 71 coming-soon clubs must be activated later from staging when official sources prove they are open.
- Six different-brand ≤50 m clusters should be spot-checked in UK QA (not deleted here).
- Gymbox Holborn is live in the real world but not in production (no independent verified pin after the Victoria proximity restore).

## Stop

UK production merge stops here. Do not run full UK QA, discovery, or another country in this task.
