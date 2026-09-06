# Belgium Merge Report

Generated: 2026-08-21T13:03:41.782Z

## Status
**MERGED** — inserted 363.

Source of truth: staging `READY_TO_IMPORT` cross-checked vs `BELGIUM_PHASE1_READY_TO_IMPORT.json` (**363 READY**).

## Summary
- **Phase1 READY file count:** 363
- **Staging READY / MERGED cross-check:** ready=363 merged=0
- **Expected insert:** 363
- **Before:** 8693 centers (Belgium: 0)
- **Would insert / inserted:** 363
- **After (if written):** 9056 (Belgium: 363)
- **Pre-merge SHA256:** `7ee404944cbf0d06e1ec8737ae024ecb0f6b6b70940c75dc3639ffe07ff6b55a`
- **Dry run:** false
- **Idempotency check:** false

## Withheld / Rejected
- None

### Same-brand proximity <100m withheld
- None

### Ladies vs standard co-locations kept
- be_3c27f0601a ↔ be_606881804a (0m) | Basic-Fit Gym Basic-Fit Brussels Avenue Louise 24/7 / Basic-Fit Gym Basic-Fit Brussels Avenue Louise Ladies
- be_cea2f4b84e ↔ be_b8d06f31a8 (37m) | Basic-Fit Gym Basic-Fit Gent Ledeberg Hoveniersstraat 24/7 / Basic-Fit Gym Basic-Fit Ladies Gent Ledeberg

### Different-brand co-locations kept
- be_c63a9718b6 (Basic-Fit) ↔ be_ed44ed44bc (JIMS) 0m
- be_e42575b027 (Basic-Fit) ↔ be_ad10ad34fb (i-fitness) 48m
- be_2d449eb120 (Basic-Fit) ↔ be_5a69e6219e (JIMS) 0m
- be_e78b233afd (Basic-Fit) ↔ be_6c3737c9ba (JIMS) 12m

### BE Basic-Fit near foreign Basic-Fit (kept)
- None

## Brand Breakdown (Belgium live / would-include)
- Basic-Fit: 236
- JIMS: 84
- Sportoase: 11
- Anytime Fitness: 9
- i-fitness: 8
- LAGO Club: 8
- Aspria: 2
- David Lloyd: 2
- Fit-Out: 2
- Snap Fitness: 1
- **Total would-include:** 363

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m, same subtype) post-merge: 0
- Encoding issues (mojibake): 0
- Postal format OK (4-digit string): true
- Postal all typeof string: true

## Geography (would-include)
- Flanders: 224
- Wallonia: 82
- Brussels-Capital: 57
- unknown: 0
- outlier: 0
- Outliers: 0

## Belgian Encoding Preserved (would-include set)
- a_grave: 0
- a_acute: 0
- e_grave: 16
- e_acute: 40
- e_diaeresis: 2
- i_grave: 0
- i_diaeresis: 0
- o_grave: 0
- o_acute: 0
- u_grave: 0
- u_acute: 0
- c_cedilla: 0
- n_tilde: 0

## Country Integrity
| Country | Before | After (projected) | Intact |
|---------|--------|-------------------|--------|
| Denmark | 354 | 354 | ✓ |
| Sweden | 639 | 639 | ✓ |
| Norway | 535 | 535 | ✓ |
| Finland | 429 | 429 | ✓ |
| Germany | 1424 | 1424 | ✓ |
| United Kingdom | 1474 | 1474 | ✓ |
| Netherlands | 600 | 600 | ✓ |
| France | 1712 | 1712 | ✓ |
| Spain | 976 | 976 | ✓ |
| Italy | 550 | 550 | ✓ |
| Belgium | 0 | 363 | — |

## Staging Categories
- MERGED_INTO_CATALOG: 363
- NEEDS_REVIEW: 5
- NEEDS_COORDINATES: 3
- DUPLICATE: 1

## Staging Left Out (not merged)
- COMING_SOON: 0
- NEEDS_REVIEW: 5
- NEEDS_COORDINATES: 3
- CLOSED: 0
- DUPLICATE: 1

## 10K Checkpoint
- Live if merged: 9056
- Headroom to 10k: 944
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): 0
- Skipped (same addr+brand): 0
- Skipped (proximity <100m same subtype): 0
- Ladies/standard co-locations kept: 2
- Different-brand co-locations kept: 4
- Foreign Basic-Fit near BE kept: 0
