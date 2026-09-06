# Austria Phase 1 Readiness Report

Generated: 2026-08-22T08:28:40.151646+00:00

## Production safety

- Live catalog: **9715** (unchanged)
- Austria live: **0**
- `centers.json` SHA256: `d86bf0118c27b72561e7aa62dd787bb907b184f3e40bc9d38ad67e036166c431`
- `centers.json` modified: **No**

## Overall

| Status | Count |
|--------|------:|
| Unique staged | 319 |
| READY_TO_IMPORT | 259 |
| NEEDS_COORDINATES | 55 |
| NEEDS_REVIEW | 4 |
| COMING_SOON | 0 |
| CLOSED | 1 |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coming soon | Closed | Coverage % |
|-------|--------------------------:|-----------:|------:|-----------:|------------:|-------:|-----------:|
| FITINN | ~55-57 | 44 | 41 | 3 | 0 | 0 | 74.5% |
| McFIT | 16 | 17 | 15 | 1 | 0 | 1 | 93.8% |
| clever fit | ~39-48 | 40 | 40 | 0 | 0 | 0 | 102.6% |
| HappyFit | 29 | 29 | 29 | 0 | 0 | 0 | 100.0% |
| MYGYM | ~19 | 39 | 17 | 22 | 0 | 0 | 89.5% |
| INJOY | ~35 | 35 | 33 | 2 | 0 | 0 | 94.3% |
| Mrs.Sporty | ~38-51 | 51 | 39 | 12 | 0 | 0 | 102.6% |
| Speedfit | ~19 | 32 | 18 | 14 | 0 | 0 | 94.7% |
| Fit Fabrik | ~14-17 | 12 | 7 | 5 | 0 | 0 | 50.0% |
| JOHN REED | 7 | 7 | 7 | 0 | 0 | 0 | 100.0% |
| John Harris Fitness | 12 | 12 | 12 | 0 | 0 | 0 | 100.0% |
| Anytime Fitness | ~19 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Holmes Place | 3 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Fitness First | 4 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Basic-Fit | 0 | 0 | 0 | 0 | 0 | 0 | 0% |
| Gold's Gym | ? | 1 | 1 | 0 | 0 | 0 | 0% |

## READY by brand

| Brand | READY |
|-------|------:|
| FITINN | 41 |
| clever fit | 40 |
| Mrs.Sporty | 39 |
| INJOY | 33 |
| HappyFit | 29 |
| Speedfit | 18 |
| MYGYM | 17 |
| McFIT | 15 |
| John Harris Fitness | 12 |
| JOHN REED | 7 |
| Fit Fabrik | 7 |
| Gold's Gym | 1 |
| **Total** | **259** |

## Data quality

| Check | Count |
|-------|------:|
| Missing addresses | 1 |
| Missing postcodes | 0 |
| Missing cities | 0 |
| Missing coordinates | 58 |
| Invalid postcodes | 0 |
| Invalid coordinates | 0 |
| Foreign outliers | 0 |
| Fallback coordinates | 0 |
| Mojibake | 0 |
| Same-brand proximity flags | 1 |

## Incomplete / blocked chains

- **Anytime Fitness** (~19 AT clubs) — standorte/locator blocked; PHASE2_REQUIRED
- **Holmes Place** (3 clubs) — 403 on official locator; PHASE2_REQUIRED
- **Fitness First Austria** (4 clubs) — cross-border `.de` locator; PHASE2_REQUIRED

## 10K checkpoint

- Current production: 9715
- Austria READY: 259
- Projected catalog: **9974**
- Above 10,000: **No** (0 over)
- Global 10K+ QA required now: **No** (only after Austria merge + Austria QA)

## Recommendation

**AUSTRIA PHASE 2 REQUIRED BEFORE MERGE**

Do not merge. Do not run Austria QA. Do not run global 10K stress QA.
