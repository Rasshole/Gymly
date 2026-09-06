# Italy Completeness Merge Report

Generated: 2026-08-21T14:59:11.239Z

## Status
**MERGED** — completeness in catalog 36 of 38 (withheld 2 neighbour geocodes; +0 new this run; repair-removed 2).

Source of truth: `ITALY_COMPLETENESS_READY_TO_IMPORT.json` (**38 READY**). Phase 3/4 lists not merged separately.

## Summary
- **Ready file count:** 38
- **Expected if all pass:** 38 → catalog 9094 / Italy 588
- **Actual safe count:** 36 → catalog 9092 / Italy 586
- **Neighbour withheld:** 2
- **Repair removed from prior force-merge:** 2
- **New inserts this run:** 0
- **Disk before repair:** 9094 (Italy: 588)
- **After (if written):** 9092 (Italy: 586)
- **Pre-merge SHA256:** `e5eedb4d28e098e24d26049d1bfdcf0dd2df08f25cdc17490eea5360cba0359f`
- **Prior Italy rows intact this run:** YES
- **Genuine partial OK:** true
- **Dry run:** false
- **Idempotency check:** false

## Withheld / Rejected
- neighbour_geocode: 2

### Details
- it_ccb19385b7 | FITINN Milano Bicocca | neighbour_suburb_geocode | Via Fulvio Testi, Cascina Pariana, Pessano con Bornago, Rodano, Milano, Lombardia, 20042, Italia
- it_4ca03e5086 | FITINN Milano Viale Abruzzi | neighbour_suburb_geocode | 38, Viale Abruzzi, San Felicino, San Bovio, Peschiera Borromeo, Rodano, Milano, Lombardia, 20068, Italia

### Same-brand proximity <100m withheld
- None

### Inspected same-brand <50m
- None

### Different-brand co-locations kept
- None

## Brand Breakdown (approved / in catalog)
- Fit Express: 10
- FITINN: 8
- GetFIT: 8
- Dabliu: 5
- Icon Palestre: 5
- **Total approved:** 36

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m) post-merge IT: 0
- Encoding issues (mojibake): 0
- CAP format OK (5-char string): true
- CAP all typeof string: true
- Leading-zero CAP count (inserted): 7

## Geography (inserted)
- north: 25
- central: 10
- south: 0
- sicily: 1
- sardinia: 0
- outlier: 0
- Outliers: 0

## Italian Encoding Preserved (inserted)
- a_grave: 0
- e_grave: 0
- e_acute: 0
- i_grave: 0
- o_grave: 0
- u_grave: 0

## Country Integrity
| Country | Before | After | Intact |
|---------|--------|-------|--------|
| Denmark | 354 | 354 | ✓ |
| Sweden | 639 | 639 | ✓ |
| Norway | 535 | 535 | ✓ |
| Finland | 429 | 429 | ✓ |
| Germany | 1424 | 1424 | ✓ |
| United Kingdom | 1474 | 1474 | ✓ |
| Netherlands | 600 | 600 | ✓ |
| France | 1712 | 1712 | ✓ |
| Spain | 976 | 976 | ✓ |
| Belgium | 363 | 363 | ✓ |
| Italy | 586 | 586 | prior 550 ✓ |

## Staging Categories
- MERGED_INTO_CATALOG: 586
- COMING_SOON: 15
- NEEDS_REVIEW: 24
- NEEDS_COORDINATES: 18

## Staging Left Out (research preserved)
- COMING_SOON: 15
- NEEDS_REVIEW: 24
- NEEDS_COORDINATES: 18
- CLOSED: 0
- DUPLICATE: 0

## 10K Checkpoint
- Live if merged: 9092
- Headroom to 10k: 908
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): 36
- Skipped (same addr+brand): 0
- Skipped (proximity <100m): 0
- Neighbour geocode withheld: 2
- Different-brand co-locations kept: 0


---

## FITINN repair follow-up (2026-08-21)

See `ITALY_COMPLETENESS_FITINN_REPAIR_REPORT.md`.

- After neighbour-suburb removal, production was 9,092 / Italy 586 (36/38).
- Official FITINN map pins recovered for both withheld clubs.
- Inserted 2 → final **9,094 / Italy 588** (38/38 completeness).
- Canonical READY metadata reconciled: 38 × MERGED_INTO_CATALOG.
