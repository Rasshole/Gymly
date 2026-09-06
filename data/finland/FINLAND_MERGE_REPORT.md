# Finland first safe production merge

Generated: 2026-08-18

**Status: MERGED.** Only READY_TO_IMPORT rows were inserted into `src/data/centers.json`.

Unresolved, coming-soon, and closed rows remain in staging only.

`CHECK_IN_RADIUS_METERS` remains **200**. Auto-checkout was not modified. Sweden fallback behaviour was not changed.

## Counts

| Metric | Count |
|---|---:|
| Centers before | 4426 |
| Finland before | 0 |
| Exact inserted | **429** |
| Centers after | **4855** |
| Finland after | **429** |
| Denmark | 354 (unchanged) |
| Sweden | 639 (unchanged) |
| Norway | 535 (unchanged) |
| Germany | 1424 (unchanged) |
| United Kingdom | 1474 (unchanged) |
| Idempotency second-run insertions | **0** |

## Finland brand breakdown (production)

| Brand | Count |
|---|---:|
| Fressi | 72 |
| Liikku | 71 |
| Fitness24Seven | 67 |
| Ole.Fit | 65 |
| ELIXIA | 32 |
| EasyFit | 28 |
| GOGO Express | 23 |
| Forever | 18 |
| PTVGYM | 15 |
| LadyLine | 12 |
| Energy | 6 |
| GYM Anytime | 5 |
| Esport | 4 |
| Greenfit | 4 |
| Vocatum | 4 |
| GOGO | 3 |
| **Total** | **429** |

## Validation

- Duplicate IDs: **0**
- Duplicate Finland IDs: **0**
- Same-brand physical duplicates (≤50 m): **0**
- Missing address / postcode / city / coordinates: **0 / 0 / 0 / 0**
- Invalid coordinates (null, NaN, Inf, 0,0): **0**
- Finland bbox outliers: **0**
- Helsinki fallback hits (wrong city): **0**
- Finnish postal codes all five-character strings: **true**
- Production Finnish postals beginning with `0`: **193**
- Mojibake/encoding issues: **0**
- Nordic letters preserved (ä / ö / å counts): **321 / 54 / 0**
- All Finland production IDs are `fi_*`
- All Finland production `country` values are `"Finland"`
- All 429 Finland rows are `is_active: true`
- SATS-branded Finnish production rows: **0**
- COMING_SOON in production: **0**
- Esport Bristol in production: **false**
- Liikku Espoo Leppävaara in production: **false**

## Different-brand clusters (≤50 m, not collapsed)

These are reported only. Different current brands may share a site.

- EasyFit Kouvola (EasyFit) / LadyLine Kouvola (LadyLine) — 0 m
- ELIXIA Hertsi (ELIXIA) / Fitness24Seven Helsinki Hertsi (Fitness24Seven) — 40 m
- Forever Espoon Omena (Forever) / Liikku Espoo Iso Omena (Liikku) — 49 m
- LadyLine Oulu (LadyLine) / PTVGYM Oulu (PTVGYM) — 49 m

## Still staged (not production)

| Category | Count |
|---|---:|
| MERGED_INTO_CATALOG | 429 |
| NEEDS_COORDINATES | 2 |
| NEEDS_REVIEW | 7 |
| COMING_SOON | 27 |
| CLOSED | 1 |

## Files changed

- `src/data/centers.json` (append-only Finland rows; DK/SE/NO/DE/UK untouched)
- `data/finland/finland_centers_staging.json` (READY rows marked `MERGED_INTO_CATALOG`; research rows preserved)
- `data/finland/FINLAND_MERGE_REPORT.json`
- `data/finland/FINLAND_MERGE_REPORT.md`
- `data/finland/FINLAND_APPROVED_FOR_MERGE.json`
- `data/finland/FINLAND_MERGE_DUPLICATE_ANALYSIS.json`
- `scripts/import-finland-centers-phase2-merge.mjs`
- Finland country helpers (`src/utils/gymCountry.ts`, `src/data/gymIds.ts`, `src/data/danishGyms.ts`, `src/data/centerRegistry.ts`, `src/utils/gymCountryLabel.ts`, `src/utils/gymDisplay.ts`, `src/services/gymSearch/gymSearchIndex.ts`, i18n country labels)

Not modified: check-in radius, auto-checkout, workout logging, PR logic, feed, Sweden fallback behaviour.

## Performance

`npm run bench:catalog` after merge (real 4,855-center catalog):

| Size | Parse | Cold index | Cached index | Typical search (3q) | Nearest | Map build | Map filter |
|---|---:|---:|---:|---:|---:|---:|---:|
| **4,855 live** | 5 ms | 252 ms | 0 ms | 221 ms | 13 ms | 15 ms | 2 ms |
| 5,000 | 5 ms | 196 ms | 0 ms | 210 ms | 12 ms | 14 ms | 1 ms |
| 10,000 | 10 ms | 394 ms | 0 ms | 432 ms | 23 ms | 23 ms | 3 ms |
| 25,000 | 28 ms | 1,026 ms | 0 ms | 1,129 ms | 53 ms | 55 ms | 8 ms |

**4,855 remains comfortably inside** the current client-side architecture (comfort band ~8–10k). No catalog redesign in this merge.

## Remaining risks

- 2 NEEDS_COORDINATES and 7 NEEDS_REVIEW clubs are absent from check-in.
- 27 coming-soon clubs (including 12 Fressi and Liikku Espoo Leppävaara 2027) must be activated later from staging when official sources prove they are open.
- Esport Bristol remains CLOSED in staging.
