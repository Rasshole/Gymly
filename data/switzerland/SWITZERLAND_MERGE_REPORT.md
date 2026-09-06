# SWITZERLAND MERGE REPORT

**Generated:** 2026-08-22

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | 10,050 |
| Switzerland before | 0 |
| Approved candidates | 475 |

## Pre-merge validation

**Result:** PASS

All 475 canonical Phase 2 READY rows validated: ch_* IDs, 4-digit postcodes, Switzerland bounds, no Liechtenstein, no legacy brands, no fallback coordinates, no mojibake.

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | 475 |
| Centers after | 10,525 |
| Switzerland after | 475 |

## Brand breakdown (production)

| Brand | READY |
|-------|-------|
| ACTIV FITNESS | 130 |
| update Fitness | 88 |
| Let's Go Fitness | 66 |
| PureGym | 49 |
| NonStop Gym | 45 |
| well come FIT | 27 |
| clever fit | 23 |
| Kieser | 21 |
| Fitnesspark | 15 |
| Harmony | 11 |
| **Total** | **475** |

## Duplicates (post-merge)

| Check | Count |
|-------|-------|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 1 |
| Same-brand ≤50 m | 1 |
| Same-brand ≤100 m | 1 |
| Identical-coordinate clusters | 1 |
| Different-brand co-locations | 16 |

Retained same-brand proximity pair has different normalized addresses (legitimate close branches).

## Staging reconciliation

| Status | Count |
|--------|-------|
| MERGED_INTO_CATALOG | 475 |
| NEEDS_COORDINATES | 10 |
| NEEDS_REVIEW | 1 |
| COMING_SOON | 6 |

Production IDs == MERGED staging IDs. No metadata drift.

## Idempotency

Second run insertions: **0**. Final catalog: **10,525**.

## Country regression

All pre-existing country counts unchanged (DK 354, SE 639, NO 535, DE 1,424, UK 1,474, FI 429, NL 600, FR 1,712, ES 976, IT 588, BE 363, PL 621, AT 335).

## Performance (live 10,525)

| Metric | Value |
|--------|-------|
| JSON size | ~2.44 MB |
| Parse | ~15 ms |
| Cold index | ~1,319 ms |
| Typical search | ~911 ms |
| Worst search | ~223 ms |
| Nearest | ~35 ms |
| Map build | ~47 ms |

Within client-side comfort zone vs 10,050 Global QA baseline.

## Verdict

**SWITZERLAND MERGE COMPLETE — WAITING FOR QA**
