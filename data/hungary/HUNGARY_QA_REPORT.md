# HUNGARY PRODUCTION QA REPORT

Generated: 2026-08-23

## Verdict

**HUNGARY STATUS: READY**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**  
Production modified: **NO**  
Global Stress QA required: **NO**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,063 |
| Hungary | 50 |
| hu_* | 50 |
| Sum of country counts | 11,063 |

Country counts intact: DK 354 · SE 639 · NO 535 · DE 1424 · UK 1474 · FI 429 · NL 600 · FR 1712 · ES 976 · IT 588 · BE 363 · PL 621 · AT 335 · CH 475 · PT 247 · GR 106 · IE 65 · CZ 70 · **HU 50**

## Catalog integrity

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |
| Defects | **0** |

## Brand breakdown (live)

| Brand | Count |
|-------|------:|
| Fitness5 | 16 |
| 4% Fitness | 7 |
| Cutler Gym | 7 |
| Life1 Fitness | 6 |
| Chili Fitness | 5 |
| Thor Gym | 4 |
| Nr1 Fitness | 3 |
| Oxygen Wellness | 1 |
| Prestige Fitness | 1 |
| Gilda Max | 0 |
| **TOTAL** | **50** |

## Merge reconciliation

| Set | Count |
|-----|------:|
| Approved | 50 |
| Production Hungary | 50 |
| Staging MERGED_INTO_CATALOG | 50 |
| Phase2 READY | 50 |

Missing IDs: **0**  
Unexpected IDs: **0**  
Metadata drift: **NONE**  
Result: **PASS**

## Staging exclusions (still out of production)

| Status | Count |
|--------|------:|
| NEEDS_COORDINATES | 1 |
| NEEDS_REVIEW | 8 |
| COMING_SOON | 3 |
| LEGACY | 1 |

Verified absent: 4% Crush, 4% Lotus, Nr1 Rákóczi, Nr1 Vágóhíd, Thor Fehérvár, Thor Kaposvár, Cutler Miskolc, Fitness5 Szolnok, Fitness5 Tatabánya, 3 Fitness5 COMING_SOON, Gilda Max legacy.

## Priority brand QA

| Brand | Result |
|-------|--------|
| Fitness5 | PASS — 16 live; Pólus = Fitness5 Pólus Center; unresolved withheld |
| 4% Fitness | PASS — 7 live; Garden/OnlyGirls A_legitimate; Gym/Candy pairs A |
| Cutler Gym | PASS — 7 network clubs; Miskolc withheld |
| Life1 | PASS — 6 live |
| Prestige | PASS — Fáy `hu_cb9223a0d5` Prestige Fitness |
| Chili | PASS — 4 Budapest + Debrecen |
| Thor | PASS — 4 live; Fehérvár/Kaposvár withheld |
| Nr1 | PASS — Oktogon / Kálvin / Óbuda |
| Oxygen | PASS — Naphegy only; no Fáy duplicate |

## Rebrands / legacy

| Item | Result |
|------|--------|
| Gilda Max | 0 live (LEGACY staging) |
| Fáy | Prestige Fitness `hu_cb9223a0d5` — no Life1/Oxygen duplicate |
| Pólus | Fitness5 Pólus Center — no legacy Pólus Fitness duplicate |
| Result | **PASS** |

## Duplicate / proximity QA

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 1 (Garden/OnlyGirls only) |
| Same-brand ≤50 m | 1 |
| Same-brand ≤100 m | 4 |
| Same-brand ≤200 m | 4 |
| Identical-coordinate clusters | 2 (Garden/OnlyGirls; Fitness5/Thor Savoya) |
| Different-brand co-locations | 1 (Savoya) |
| Garden/OnlyGirls | **A_legitimate** — same building, distinct product labels |
| Gym ↔ Garden/OnlyGirls | **A** — ~58 m, different street address |
| Candy ↔ Candyland | **A** — ~93 m, different address/postcode |
| Savoya | **A_legitimate_different_brand_colocation** |
| Result | **PASS** (no production repairs) |

## Border safety

Austria / Slovakia / Ukraine / Romania / Serbia / Croatia / Slovenia: **no contamination**  
All 50 `hu_*` coords pass `isPlausibleHungaryCoordinate` (incl. Győr / Sopron / Nyíregyháza).  
Result: **PASS**

## Hungarian text

Diacritics preserved in catalog: Győr, Pécs, Nyíregyháza, Székesfehérvár, Fáy, Óbuda, Kálvin, Pólus.  
Mojibake: **none**. Search may fold to ASCII; stored display remains Hungarian.

## Search / postcode

Brands: full + partial OK  
Cities: diacritic + ASCII OK  
Postcodes NNNN: exact HU postcodes resolve in Hungary-scoped search  
Cross-country 4-digit safety: country-scoped searches for overlapping `9400` stay in-country (HU / AT / BE)  
Typing responsiveness: OK (<3s short prefixes)

## Core flows

| Flow | Result |
|------|--------|
| Onboarding / profile / favorites | PASS — exact `hu_*` persist |
| Nearest | PASS — hu_* in all tested cities |
| Map viewport | PASS — scoped; dense Budapest individually selectable |
| 200 m check-in | PASS — 199/200 allow, 201 away |
| Auto-checkout | PASS — session gym ID source of truth; no radius change |
| Workout / PR / History / Feed / Notifications / Planned | PASS via shared ID resolution (no HU special-case) |
| Orphan `hu_nonexistent_test` | PASS — Hungary stub; not AT/SK/DK/catalog[0] |

Check-in radius: **200 m** (unchanged)  
Auto-checkout threshold: **200 m** (unchanged)

## Performance

| Metric | QA | Merge baseline |
|--------|---:|---------------:|
| Catalog | 11,063 | 11,063 |
| Active | 11,059 | 11,059 |
| JSON size | 3.27 MB | 3.27 MB |
| Parse | 14 ms | 16 ms |
| Cold index | 1,208 ms | 1,429 ms |
| Cached | 0 ms | 0 ms |
| Typical search | 757 ms | 1,143 ms |
| Worst search | 73 ms | 248 ms |
| Nearest | 0 ms | 1 ms |
| Map build | 0 ms | 0 ms |
| Viewport filter | 0 ms | 0 ms |

Assessment: **Within normal variance of merge baseline. No material regression.**

## Global scale

| Item | Value |
|------|------:|
| Catalog | 11,063 |
| 12,500 crossed | NO |
| New global-scale blocker | NO |
| Global Stress QA required | **NO** |
| Country expansion | **UNLOCKED** |
| Architecture | **KEEP CLIENT-SIDE** |

## Tests

| Suite | Result |
|-------|--------|
| hungaryGymQa | PASS |
| hungaryMergeSafety | PASS |
| hungaryPhase2Staging | PASS |
| hungaryPhase1Staging | PASS |
| czechiaMergeSafety | PASS |
| irelandMergeSafety | PASS |
| batch1CatalogScalingPrep | PASS |

Passed: **117** · Failed: **0**

## Bugs found

**None**

## Bugs fixed

**None** (production not modified)

## Remaining risks (non-blocking)

- Unresolved staging (13 rows) may be recoverable later with stronger evidence; correctly withheld for now.
- Shared 4-digit postcodes with AT/BE/CH/DK require country-scoped or ranked search context on global queries (existing multi-country pattern; not Hungary-specific defect).
- Dense Budapest 4% / Savoya co-locations require users to select the correct product/brand; check-in uses selected gym ID (validated).

## Files

- `__tests__/hungaryGymQa.test.ts` (created)
- `data/hungary/HUNGARY_QA_REPORT.md` (this file)
- `data/hungary/HUNGARY_QA_PERF.json` (created by QA suite)

## Final status

**HUNGARY STATUS: READY**  
**Country expansion: UNLOCKED**
