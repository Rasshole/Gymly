# Italy Phase 3 — Deep Market Completeness Audit

Generated: 2026-08-21T13:53:13.005542+00:00

**`src/data/centers.json` was NOT modified.** Production remains **9,056 / Italy 550**.

## Verdict

**ITALY PHASE 4 REQUIRED BEFORE COMPLETENESS MERGE**

Reasons:
- Orange/GetFIT material gap (23/33; acquisition not on official Orange locator)
- Fit Express and/or Icon still materially incomplete vs official estate

## Catalog math

- Production catalog: **9056**
- Production Italy: **550** (unchanged)
- NEW READY Phase 3: **22**
- Projected catalog = 9056 + 22 = **9078**
- Headroom to 10k: **922** (exceeds at +945 NEW READY)

## Existing live Italy brand audit

| Brand | Production | Official est. | Missing | Coverage % | Status |
|---|---:|---:|---:|---:|---|
| FitActive | 193 | 172 | 0 | 112.2 | COMPLETE |
| FitUP | 80 | 83 | 3 | 96.4 | COMPLETE |
| Anytime Fitness | 68 | 66 | 0 | 103.0 | COMPLETE |
| Fit Express | 45 | 70 | 25 | 64.3 | MATERIAL GAP |
| McFIT | 42 | 45 | 3 | 93.3 | NEAR-COMPLETE |
| Virgin Active | 42 | 42 | 0 | 100.0 | COMPLETE |
| Icon Palestre | 31 | 47 | 16 | 66.0 | MATERIAL GAP |
| Orange | 23 | 33 | 10 | 69.7 | MATERIAL GAP |
| WebFit | 16 | 16 | 0 | 100.0 | COMPLETE |
| 20Hours | 7 | 7 | 0 | 100.0 | COMPLETE |
| Gold's Gym | 2 | 2 | 0 | 100.0 | COMPLETE |
| JOHN REED | 1 | 2 | 1 | 50.0 | NEAR-COMPLETE |

## Missing / investigated chains

| Chain | Decision | Estate | Note |
|---|---|---:|---|
| FITINN | NEW_CHAIN | 10 | Austrian low-cost; ex-YouFit Milan + Prato/Bologna/Brescia; official locator |
| GetFIT | NEW_CHAIN_PARTIAL | 8 | 6→Orange Jul 2026 (not on Orange site yet); 2 founder-retained; site 403; Wayback pins |
| Dabliu | NEW_CHAIN | 5 | 5 Rome conventional fitness clubs with shared membership |
| Fitness Park | NEW_OR_RECOVER | 1 | RomaEst open; further IT expansion planned; was NEEDS_COORDINATES in staging |
| Palestre Italiane | ALREADY_LIVE_UNDER_ORANGE | 0 | Brand under Orange/Gym Nation; locator redirects to Orange 23 clubs |
| Prime Fitness | EXCLUDE_BELOW_THRESHOLD | 2 | 2 Bologna clubs only (<5) |
| Happy Fit | EXCLUDE_ABSORBED | 0 | 14 clubs → McFIT in 2014 |
| Zero10 | EXCLUDE_SINGLE | 1 | Single Padova SSD |
| Tonic | EXCLUDE_NOT_FOUND | 0 | No verifiable multi-site conventional estate |
| Fit And Go | EXCLUDE_EMS | 0 | EMS/Vacufit boutique |
| Heaven | EXCLUDE_NOT_FOUND | 0 | No independent 5+ conventional chain verified |
| Forum Sport Center | EXCLUDE_SINGLE_COMPLEX | 1 | Single Rome multi-sport complex (forumroma.it) |
| Basic-Fit | EXCLUDE_NO_ITALY | 0 | No Italy club list |
| WebFit | ALREADY_LIVE | 16 | Production complete |
| 20Hours | ALREADY_LIVE | 7 | Production complete |
| Fit Express | ALREADY_LIVE_NEAR_COMPLETE | 70 | 45 live; geocode leftovers |
| Icon Palestre | ALREADY_LIVE_NEAR_COMPLETE | 47 | 31 live; page leftovers |

## Phase 3 NEW candidates

- Total NEW staged: **25**
- READY_TO_IMPORT: **22**
- NEEDS_COORDINATES: **2**
- NEEDS_REVIEW: **0**
- CLOSED: **1**
- DUPLICATE: **0**

### READY by brand

| Brand | READY |
|---|---:|
| FITINN | 9 |
| GetFIT | 8 |
| Dabliu | 5 |
| **TOTAL** | **22** |

## Adequacy of 550

550 covers the previously staged national low-cost/premium set well (FitActive, FitUP, Anytime, McFIT, Virgin, WebFit, 20Hours), but is **not complete** for Italian commercial chain coverage: FITINN (10) was entirely missing, Dabliu (5) was missing, GetFIT/Orange integration (~10) is unresolved on the Orange locator, and Fit Express/Icon still have material geocode leftovers.

## Files

- `scripts/italy-phase3-discover.py`
- `scripts/italy-phase3-consolidate.py`
- `data/italy/ITALY_PHASE3_COMPLETENESS_REPORT.md`
- `data/italy/ITALY_PHASE3_COMPLETENESS_REPORT.json`
- `data/italy/ITALY_PHASE3_MARKET_AUDIT.json`
- `data/italy/ITALY_PHASE3_NEW_CANDIDATES.json`
- `data/italy/ITALY_PHASE3_READY_TO_IMPORT.json`
- `data/italy/ITALY_PHASE3_GEOCODE_REVIEW.json`
- `data/italy/ITALY_PHASE3_DUPLICATE_ANALYSIS.json`
- `data/italy/Gymly_Italy_Phase3_Completeness.xlsx`

## FINAL: ITALY PHASE 4 REQUIRED BEFORE COMPLETENESS MERGE

