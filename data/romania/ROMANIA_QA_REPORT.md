# ROMANIA PRODUCTION QA REPORT

Generated: 2026-08-23

## Verdict

**ROMANIA STATUS: READY**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**  
Production modified: **NO**  
Global Stress QA required: **NO**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,217 |
| Romania | 154 |
| ro_* | 154 |
| Sum of country counts | 11,217 |

Country counts intact: DK 354 · SE 639 · NO 535 · DE 1424 · UK 1474 · FI 429 · NL 600 · FR 1712 · ES 976 · IT 588 · BE 363 · PL 621 · AT 335 · CH 475 · PT 247 · GR 106 · IE 65 · CZ 70 · HU 50 · **RO 154**

## Catalog integrity

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Leading-zero postcodes (string) | 62 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Moldova contamination | 0 |
| Mojibake | 0 |
| Defects | **0** |

Note: `Bulevardul Chișinău` / `Bulevardul Chisinau` on Pantelimon clubs is a Bucharest street name, not Moldova contamination.

## Brand breakdown (live)

| Brand | Count |
|-------|------:|
| Stay Fit Gym | 67 |
| World Class | 45 |
| 18GYM | 42 |
| ESX | 0 |
| **TOTAL** | **154** |

## Merge reconciliation

| Set | Count |
|-----|------:|
| Approved | 154 |
| Production Romania | 154 |
| Staging MERGED_INTO_CATALOG | 154 |
| Phase2 READY | 154 |

Missing IDs: **0**  
Unexpected IDs: **0**  
Metadata drift: **NONE**  
Result: **PASS**

## Staging exclusions (still out of production)

| Status | Count |
|--------|------:|
| NEEDS_REVIEW | 4 |
| COMING_SOON | 5 |

Verified absent from production:

- Stay Fit Gym romana / nord timisoara / aurora / visan (NEEDS_REVIEW)
- 18GYM Lujerului / Otopeni / Cluj Edgar Quinet / Cluj Era / Cluj Via (COMING_SOON)

## Priority brand QA

| Brand | Result |
|-------|--------|
| World Class | PASS — 45/45 live; 13 recovered-postcode clubs keep `OFFICIAL_API` coords + reverse-geocode postcodes |
| Stay Fit Gym | PASS — 67 live; no hub/legal/marketing rows; 4 unresolved withheld |
| 18GYM | PASS — 42 open live; 5 coming-soon excluded |
| ESX | PASS — 0 live; aggregator excluded |

## Stay Fit parser-noise QA

| Check | Result |
|-------|--------|
| Real clubs live | 67 |
| Hub/marketing/legal rows live | 0 |
| Unresolved rows live | 0 |
| Result | **PASS** |

## 18GYM coming-soon QA

| Check | Result |
|-------|--------|
| Coming-soon staging | 5 |
| Coming-soon live | 0 |
| Result | **PASS** |

## Duplicate / proximity QA

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 0 |
| Same-brand ≤50 m | 0 |
| Same-brand ≤100 m | 0 |
| Same-brand ≤200 m | 1 |
| Identical-coordinate clusters | 0 |
| Different-brand ≤100 m co-locations | 1 (18GYM Pantelimon ↔ Stay Fit Pantelimon ~12 m — A_legitimate) |
| Grand Arena / Metalurgiei | **A_legitimate** — ~137 m; different addresses; both retained |
| Result | **PASS** (no production repairs) |

## Border safety

Hungary / Serbia / Bulgaria / Ukraine / Moldova: **no contamination**  
All 154 `ro_*` coords pass `isPlausibleRomaniaCoordinate`.  
Result: **PASS**

## Romanian text

Diacritics preserved in catalog: București, Timișoara, Iași, Brașov, Constanța, Târgu Mureș, ș/ț and legacy ş/ţ handled in search fold.  
Mojibake: **none**. Search may fold to ASCII; stored display remains Romanian.

## Search / postcode

Brands: World Class / Stay Fit / 18GYM OK; no ESX physical club rows  
Cities: București/Bucuresti/Bucharest, Cluj, Timișoara/Timisoara, Iași/Iasi, etc. OK  
Postcodes: exact 6-digit string search OK; leading zeros preserved (e.g. `077041` not `77041`)  
Typing responsiveness: OK (suite gates; no material regression)

## Regional presence (approx)

Bucharest 54 · Cluj 20 · Iași 10 · Timișoara 7 · Brașov 6 · Constanța 4 · Ploiești 4 · Sibiu 4 · Arad 3 · Pitești 3 · Galați 2 · Craiova 2  
Oradea / Suceava: 0 current chain rows (expected / non-blocking)

## Core flows

| Flow | Result |
|------|--------|
| Onboarding / profile / favorites | PASS — exact `ro_*` persist |
| Nearest | PASS — ro_* near Bucharest, Cluj, Timișoara, Iași, Constanța, Brașov, Craiova, Sibiu |
| Map viewport | PASS — Bucharest scoped; dense branches individually selectable |
| 200 m check-in | PASS — 199/200 allow, 201 away |
| Auto-checkout | PASS — session gym ID source of truth; no radius change |
| Workout / PR / History / Feed / Notifications / Planned | PASS via shared ID resolution (no RO special-case) |
| Orphan `ro_nonexistent_test` | PASS — Romania stub; not HU/MD/DK/catalog[0] |

Check-in radius: **200 m** (unchanged)  
Auto-checkout threshold: **200 m** (unchanged)

## Performance

| Metric | QA (suite) | Merge baseline |
|--------|----------:|---------------:|
| Catalog | 11,217 | 11,217 |
| Active | 11,213 | — |
| JSON size | 3.32 MB | 3.32 MB |
| Parse | 15 ms | 25.6 ms |
| Cold index | 0 ms* | 57.2 ms |
| Cached | 0 ms | — |
| Typical search | 123 ms | 1.75 ms |
| Worst search | 9 ms | 1.96 ms |
| Nearest | 0 ms | 0.21 ms |
| Viewport filter | 0 ms | — |

\*Cold index measured after earlier suite search warm-up in the same Jest process.

Assessment: **Within normal environment variance of merge baseline. No material scale/architecture regression.**

Artifact: `data/romania/ROMANIA_QA_PERF.json`

## Global scale

| Item | Value |
|------|------:|
| Catalog | 11,217 |
| 12,500 crossed | NO |
| New global-scale blocker | NO |
| Global Stress QA required | **NO** |
| Country expansion | **UNLOCKED** |
| Architecture | **KEEP CLIENT-SIDE** |

## Tests

| Suite | Result |
|-------|--------|
| romaniaGymQa | PASS (27) |
| romaniaMergeSafety | PASS |
| romaniaPhase2Staging | PASS |
| romaniaPhase1Staging | PASS |
| hungaryGymQa | PASS |
| hungaryMergeSafety | PASS |
| czechiaMergeSafety | PASS |
| irelandMergeSafety | PASS |

Romania-focused suites: **56 passed / 0 failed** (romaniaGymQa + merge + phase1/2 staging).  
Additional regressions above: all PASS.

## Bugs found

**None** (no production-blocking defects with strong official evidence)

## Bugs fixed

**None** (production not modified)

## Remaining risks (non-blocking)

1. **Stay Fit Metalurgiei** (`ro_4c5fd28082`) and **Bartolomeu** address fields are POI-name strings from official maps embeds (no street line published on club pages). Coords + 6-digit postcodes are valid; do not invent street addresses.
2. Minor address trailing `/` after embedded postcodes on a few Stay Fit rows (cosmetic).
3. Dense Pantelimon co-location (18GYM ↔ Stay Fit ~12 m) is expected multi-brand mall/complex adjacency.

## Files changed (this QA)

- `__tests__/romaniaGymQa.test.ts` (new)
- `data/romania/ROMANIA_QA_REPORT.md` (new)
- `data/romania/ROMANIA_QA_PERF.json` (new)

Production catalog / staging / approved merge files: **unchanged**
