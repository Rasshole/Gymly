# PORTUGAL MERGE REPORT

**Generated:** 2026-08-22
**Verdict:** PORTUGAL MERGE COMPLETE — WAITING FOR QA

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | 10525 |
| Portugal before | 0 |
| Approved candidates | 247 |
| Pre-merge SHA256 | `e7e3848d4ac3efd10f2482bcb7b50363cd82d4e0d0b32506ccd12878717c10c0` |
| Post-merge SHA256 | `96b4a15090dfa314c74f0224bd056be9525a1836d352eefa7f83f47953143973` |

## Pre-merge validation

| Check | Value |
|-------|-------|
| Candidate count | 247 |
| pt_* | True |
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing addresses | 0 |
| Missing cities | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |
| Rebrand conflicts | 0 |
| Staging exclusions | 0 |
| **Result** | **PASS_ALL** |

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | 247 |
| Withheld | 0 |
| Centers after | 10772 |
| Portugal after | 247 |

## Brand breakdown (production)

- Fitness UP: 51
- VivaGym: 46
- Element: 46
- Fitness Factory: 44
- Solinca: 19
- Solinca Light: 16
- Holmes Place: 12
- Be-Fit: 10
- Balance: 2
- Lemonfit: 1

## Islands

- Madeira: 5 — pt_d1573ba977, pt_0ed3aa6000, pt_8e9361add0, pt_2c594cd30b, pt_532415ebbc
- Azores: 2 — pt_34bec26868, pt_7d40ef811b
- Invalid island rows: 0

## Duplicates (post-merge)

- Same-brand ≤25 m: 0
- Same-brand ≤50 m: 0
- Same-brand ≤100 m: 0
- Same-brand ≤200 m: 1
- Identical-coordinate clusters: 0
- Different-brand co-locations: 2

Pre-merge proximity retained (not withheld): lt200=1, diffBrand=2

## Staging

| Status | Count |
|--------|-------|
| MERGED_INTO_CATALOG | 247 |
| NEEDS_COORDINATES | 36 |
| NEEDS_REVIEW | 26 |
| COMING_SOON | 0 |
| CLOSED | 2 |
| DUPLICATE | 5 |

Metadata drift: **NONE**

## Check-in

- Radius: 200
- Auto-checkout: 200
- Changed: False

## Performance

| Metric | Value |
|--------|-------|
| Catalog | 10772 |
| Active | 10767 |
| JSON size | 3.17 MB |
| Parse | 44.61 ms |
| Cold index | 46.14 ms |
| Cached | 0.0768 ms |
| Typical search | 5.72 ms |
| Worst search | 6.54 ms |
| Nearest | 16.29 ms |
| Map build | 4.56 ms |
| Viewport filter | 4.02 ms |

## Global scale

- Previous QA baseline: 10525
- New catalog: 10772
- New scale regression: False
- Global stress rerun required now: False

## Verdict

**PORTUGAL MERGE COMPLETE — WAITING FOR QA**
