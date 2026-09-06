# Poland Merge Report

Generated: 2026-08-22T07:42:45.850Z

## Status
**MERGED** — inserted 621.

Source of truth: staging `READY_TO_IMPORT` cross-checked vs `POLAND_PHASE2_READY_TO_IMPORT.json` (**621 READY**).

## Summary
- **Phase2 READY file count:** 621
- **Staging READY / MERGED cross-check:** ready=621 merged=0
- **Expected insert:** 621
- **Before:** 9094 centers (Poland: 0)
- **Would insert / inserted:** 621
- **After (if written):** 9715 (Poland: 621)
- **Pre-merge SHA256:** `6b2b87ffce4d0ee2d7d1d4e6bc21b573579c6c4b28a31a39a0b2ed613e989b7f`
- **Dry run:** false
- **Idempotency check:** false

## Withheld / Rejected
- None

### Same-brand proximity pre-merge (<100m) — STOP gate
- None

### Different-brand co-locations retained (≤50m)
- pl_3b16c7db04 (Well Fitness) ↔ pl_a8b07a3cbe (Zdrofit) 36m — Legitimate different-brand co-location (shopping center / building)

## Brand Breakdown (Poland live / would-include)
- Zdrofit: 212
- Xtreme Fitness Gyms: 185
- Well Fitness: 97
- Just GYM: 55
- CityFit: 24
- Fit Fabric: 21
- Fabryka Formy: 18
- Calypso Fitness: 9
- **Total would-include:** 621

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m) post-merge: 0
- Encoding issues (mojibake): 0
- Postal format OK (NN-NNN string): true
- Postal all typeof string: true

## Polish Encoding Preserved
- a_ogonek: 67
- c_acute: 3
- e_ogonek: 69
- l_stroke: 531
- n_acute: 208
- o_acute: 373
- s_acute: 99
- z_acute: 55
- z_dot: 41

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
| Italy | 588 | 588 | ✓ |
| Belgium | 363 | 363 | ✓ |
| Poland | 0 | 621 | — |

## Staging Reconciliation
- READY before: 621
- Marked MERGED: 621
- MERGED after: 621
- READY after: 0

## Staging Left Out (not merged)
- COMING_SOON: 15
- NEEDS_REVIEW: 23
- NEEDS_COORDINATES: 0
- CLOSED: 0
- DUPLICATE: 0

## 10K Checkpoint
- Live if merged: 9715
- Headroom to exactly 10,000: 285
- Centers required to reach 10,000: 285
- Centers required to exceed 10,000: 286
- Global 10K+ stress QA required now: **NO**

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): 0
- Skipped (same addr+brand): 0
- Different-brand co-locations kept: 1
- Same-brand ≤50m post-merge: 0
- Same-brand ≤100m post-merge: 0
