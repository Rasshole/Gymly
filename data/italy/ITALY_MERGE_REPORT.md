# Italy Merge Report

Generated: 2026-08-21T09:50:46.579Z

## Status
**MERGED** — inserted 550.

Source of truth: `ITALY_PHASE2_READY_TO_IMPORT.json` (**550 READY**).

## Summary
- **Phase2 READY file count:** 550
- **Staging READY cross-check:** 550
- **Expected insert:** 550
- **Before:** 8143 centers (Italy: 0)
- **Would insert / inserted:** 550
- **After (if written):** 8693 (Italy: 550)
- **Pre-merge SHA256:** `cf74223bd8c30ea87358f9439815055c87b304dbb2992f1d224f14ae1f170a3d`
- **Dry run:** false
- **Idempotency check:** false

## Withheld / Rejected
- None

### Same-brand proximity <100m withheld
- None

### Different-brand co-locations kept
- it_dd296aa3bd (Fit Express) ↔ it_1dbcbcdcc6 (Icon Palestre) 0m
- it_638fe29826 (Fit Express) ↔ it_c65268f0c1 (Icon Palestre) 0m

## Brand Breakdown (Italy live / would-include)
- FitActive: 193
- FitUP: 80
- Anytime Fitness: 68
- Fit Express: 45
- McFIT: 42
- Virgin Active: 42
- Icon Palestre: 31
- Orange: 23
- WebFit: 16
- 20Hours: 7
- Gold's Gym: 2
- JOHN REED: 1
- **Total would-include:** 550

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m) post-merge: 0
- Encoding issues (mojibake): 0
- CAP format OK (5-char string): true
- CAP all typeof string: true
- Leading-zero CAP count: 85

## Geography (would-include)
- north: 369
- central: 127
- south: 23
- sicily: 21
- sardinia: 10
- outlier: 0
- Outliers: 0

## Italian Encoding Preserved (would-include set)
- a_grave: 10
- e_grave: 1
- e_acute: 0
- i_grave: 4
- o_grave: 2
- u_grave: 2

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
| Italy | 0 | 550 | — |

## Staging Categories
- MERGED_INTO_CATALOG: 550
- COMING_SOON: 15
- NEEDS_REVIEW: 27
- NEEDS_COORDINATES: 18

## Staging Left Out (not merged)
- COMING_SOON: 15
- NEEDS_REVIEW: 27
- NEEDS_COORDINATES: 18
- CLOSED: 0
- DUPLICATE: 0

## 10K Checkpoint
- Live if merged: 8693
- Headroom to 10k: 1307
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT_DISTANCE_METERS: 200 (unchanged)

## Duplicate Analysis
- Skipped (existing ID): 0
- Skipped (same addr+brand): 0
- Skipped (proximity <100m): 0
- Different-brand co-locations kept: 2

## Post-merge smoke
- `findGymById(it_*)`: OK (sample it_37abf722f2, it_fddb7f5b8d, it_0288e25699)
- `getActiveGymsByCountry('Italy')`: 550
- CAP typeof string + 5-char: OK (85 leading-zero)
- No invented coords (`allowsInventedCoordinates` excludes Italy): OK
- Accent normalize (Forlì→forli) while stored accents preserved: OK

## Idempotency
- Second run `--idempotency-check`: would insert **0**

## Benchmark (`npm run bench:catalog`)
- liveCatalog: **8693**
- liveActive: 8689
- At size 8693: parseMs 9, indexMs 509, typicalSearch3qMs 476, nearestMs 20, mapBuildMs 25
