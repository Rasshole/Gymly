# MOLDOVA PRODUCTION QA

## OVERALL

**MOLDOVA STATUS: READY**

Country expansion: **UNLOCKED**

Production QA completed read-only against live catalog after Moldova merge. All blocking gates passed. No production modifications. Global Stress QA not required (11,749 < 12,500).

## CATALOG

| Metric | Expected | Actual |
|--|--|--|
| Total centers | 11,749 | 11,749 |
| Moldova | 28 | 28 |
| md_* IDs | 28 | 28 |
| Global duplicate IDs | 0 | 0 |
| Moldova duplicate IDs | 0 | 0 |
| Unexpected md_* / misclassified | 0 | 0 |
| SHA256 | `753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8` | MATCH |

Prior-country hard gates intact: SM 6 · MC 4 · AD 12 · LI 7 · IS 27.

## LIVE INVENTORY / BRAND BREAKDOWN

| Brand | Count | Path |
|--|--|--|
| BIGSPORT GYM | 13 | CHAIN_CLASS_A |
| Energy Fitness | 3 | CHAIN_CLASS_A |
| XTZ Fitness | 4 | CHAIN_CLASS_A |
| Adrenalin | 3 | CHAIN_CLASS_A |
| Heracles | 1 | SMALL_MARKET_INDEPENDENT |
| Alexia Fitness & Wellness | 1 | SMALL_MARKET_INDEPENDENT |
| MaxGym | 1 | SMALL_MARKET_INDEPENDENT |
| Wellness Era | 1 | SMALL_MARKET_INDEPENDENT |
| Sportmaster | 1 | SMALL_MARKET_INDEPENDENT |
| **TOTAL** | **28** | |

Exact production ID set == `MOLDOVA_APPROVED_FOR_MERGE.json` == Phase 2 READY.

- missing approved IDs = 0
- unexpected production IDs = 0

## MERGE RECONCILIATION

Phase 2 READY / Approved / Production / MERGED_INTO_CATALOG:

**28 == 28 == 28 == 28**

Exact ID sets equal. Metadata drift: **NONE** (id, name, brand, address, city, postcode, lat, lng reconciled).

## ELIGIBILITY QA

| Path | Expected | Actual |
|--|--|--|
| CHAIN_CLASS_A | 23 | 23 |
| SMALL_MARKET_INDEPENDENT | 5 | 5 |

Class A estate: BIGSPORT 13 + Energy 3 + XTZ 4 + Adrenalin 3 = 23.

SMI: Heracles, Alexia, MaxGym, Wellness Era, Sportmaster = 5.

No unknown eligibility paths.

## BIGSPORT QA

**13/13 PASS** — exact approved IDs; Moldovan premises; valid postcodes; normal display/search.

## ENERGY FITNESS QA

**3/3 PASS**

Telecentru (`md_19c9411dea`):

- Premises: City Parking Center, str. Nicolae Testemițanu 29/5, floors 4–5
- Coordinates: **46.994935, 28.832949** (Phase 2 corrected)
- Exactly once; hospital pin absent; no duplicate legacy Telecentru row

## XTZ QA

**4/4 PASS** — Phase 2 estate; all CHAIN_CLASS_A; no legacy aliases as extra physical centers.

## ADRENALIN / TRANSNISTRIA QA

Policy: **INCLUDE_AS_MOLDOVA_TERRITORIAL** — preserved.

| Unit | Present |
|--|--|
| Tiraspol Orion | YES |
| Tiraspol Shevchenko | YES |
| Bender Kotovskogo | YES |

- Adrenalin = 3; all `md_*`; country = Moldova
- Separate Transnistria country/prefix = ABSENT
- No Russia/Ukraine classification
- All CHAIN_CLASS_A
- Bender Shevchenko directory duplicate = ABSENT

## INDEPENDENT QA

| Brand | Count | Notes |
|--|--|--|
| Heracles | 1 | Independenței 16/1; SMI |
| Alexia | 1 | SMI; spa/pool additive; no separate spa row |
| MaxGym | 1 | Vasile Lupu 89; SMI; conventional public |
| Wellness Era | 1 | Bălți; SMI |
| Sportmaster | 1 | Bălți; SMI; Phase 2 discovery identity |

All resolve normally for registry / search / nearest / map / check-in.

## CLOSED / EXCLUSION QA

Excluded leakage = **0**

| Identity | Production |
|--|--|
| Aquaterra | 0 |
| Unica Sport | 0 |
| EcoSport | 0 |
| Municipal sports-complex amenity | 0 |
| Regional placeholders / hotel / spa-primary / CrossFit-only / EMS / PT-only / yoga-only / martial-arts-only | 0 |

## REGIONAL / GAGAUZIA QA

A_legitimate_no_local_gym cities with **0** fabricated production rows:

Ungheni · Soroca · Strășeni · Edineț · Drochia · Ceadîr-Lunga · Vulcănești

Comrat covered by approved BIGSPORT. Unexplained Gagauzia gaps = **0**.

Transnistria regional: Tiraspol + Bender via Adrenalin; no invented rows for Rîbnița / Dubăsari.

## REBRANDS / LEGACY QA

Unresolved rebrand conflicts = **0**

Energy Telecentru identity resolved; XTZ estate intact; Adrenalin duplicates handled; regional placeholders non-live; accidental legacy production rows = **0**.

## DATA QUALITY

| Check | Result |
|--|--|
| Invalid Moldova postcodes | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Missing addresses / localities | 0 |
| Mojibake | 0 |

## DUPLICATE / PROXIMITY QA

Hard duplicate problems = **0** (no identical coords; no unexplained identity conflicts). Proximity-only Chișinău density is not treated as duplicate.

## CROSS-BORDER SAFETY

Moldova premises = **28/28**

Romanian contamination = **0** · Ukrainian contamination = **0** · other foreign = **0**

Border probes (Iași, Huși, Galați, Botoșani, Chernivtsi, Mohyliv-Podilskyi, Odesa) do not appear as Moldova production centers. Territorial gates hold; postcode alone does not override.

## SEARCH

Representative queries (Moldova, Chișinău/Chisinau, Bălți/Balti, Cahul, Orhei, Comrat, Tiraspol, Bender/Tighina, brand names) surface intended centers with human-readable display names (no raw `md_*`). Excluded / foreign RO-UA identities not surfaced as live md_* rows.

## COUNTRY / ID RESOLUTION

`md_*` → Moldova for BIGSPORT, Energy, XTZ, Adrenalin, SMI representatives.

Orphan `md_nonexistent_test` → graceful Moldova-safe stub.

No prefix/country collision with RO / UA / MC / SM / AD / LI / IS.

## CORE FLOWS

Representatives (BIGSPORT, Energy Telecentru, XTZ, Adrenalin Tiraspol/Bender, Heracles, Wellness Era):

registry · display · search · nearest · map · check-in coordinates — **PASS**

No Moldova-specific runtime override required.

## MAP

Moldova markers = **28**. Telecentru uses corrected CPC coordinates. Transnistria md_* markers behave as Moldova. Excluded / RO / UA masquerades absent.

## NEAREST

Probes Chișinău · Bălți · Comrat · Tiraspol · Bender · Cahul return geographically sane Moldova centers. Transnistria territorial inclusion does not break nearest behavior.

## CHECK-IN

Global radius unchanged:

| Distance | Result |
|--|--|
| 199 m | allow |
| 200 m | allow |
| 201 m | block |

Auto-checkout = **200 m**. No Moldova-specific radius override. Verified on Telecentru, BIGSPORT, Adrenalin, Heracles/Wellness Era coords.

## COUNTRY REGRESSIONS

| Country | Count |
|--|--|
| Moldova | 28 |
| San Marino | 6 |
| Monaco | 4 |
| Andorra | 12 |
| Liechtenstein | 7 |
| Iceland | 27 |
| **Total catalog** | **11,749** |

Global duplicate IDs = 0. Prior-country counts intact.

## PERFORMANCE

From `MOLDOVA_QA_PERF.json` (latest suite run; cold index is noisy):

| Metric | Value |
|--|--|
| Catalog / active | 11,749 / 11,745 |
| JSON size | 3.483 MB (3,652,116 bytes) |
| Parse | ~25–79 ms |
| Cold search index | ~4.6–14.8 s (noisy; not Moldova-specific) |
| Cached index | ~0 ms |
| Typical / worst MD search | ~2 / ~7–8 ms |
| Nearest / map | ~0 ms |
| Architecture | **KEEP CLIENT-SIDE** |
| Assessment | healthy |

No material client-side regression vs recent small-country QA baselines.

## TESTS

| Suite | Result |
|--|--|
| `__tests__/moldovaGymQa.test.ts` | PASS |
| `moldovaMergeSafety` | PASS |
| `moldovaPhase1Staging` | PASS |
| `moldovaPhase2Staging` | PASS |
| San Marino / Monaco / Andorra / Liechtenstein / Iceland / Cyprus GymQa (post-MD totals) | PASS (10/10 suites, 149 tests) |

## BUGS FOUND

**NONE**

## BUGS FIXED

**NONE** (QA/test artifacts only; production untouched)

## REMAINING RISKS

- Cold search-index timing is noisy on large catalogs; monitor at next merge but not a Moldova-specific defect.
- Transnistria territorial inclusion is policy-correct; future political/geo labeling changes would need an explicit product decision (out of scope).
- Regional A_legitimate_no_local_gym cities remain uncovered by design — not a production bug.

## GLOBAL SCALE STATUS

| Gate | Value |
|--|--|
| Catalog | 11,749 |
| 12,500 crossed | **NO** |
| Global Stress QA required | **NO** |

## FILES CHANGED

QA / test-only (production `centers.json` unchanged):

- `__tests__/moldovaGymQa.test.ts` (new)
- `data/moldova/MOLDOVA_QA_REPORT.md`
- `data/moldova/MOLDOVA_QA_PERF.json`
- `data/moldova/MOLDOVA_QA_SHA_BEFORE.txt`
- `data/moldova/MOLDOVA_QA_SUMMARY.md` (suite companion)
- Prior-country GymQa live totals / 36-country regression bumps (SM, MC, AD, LI, IS, CY) to 11,749 + Moldova 28

## SHA CONFIRMATION

| When | SHA256 |
|--|--|
| Before QA | `753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8` |
| After QA | `753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8` |
| Match | **YES** |

## HARD-GATE ANSWERS

1. Production modified during QA? **NO**
2. Total exactly 11,749? **YES**
3. Moldova exactly 28? **YES**
4. All 28 Moldova IDs md_*? **YES**
5. Global duplicate IDs = 0? **YES**
6. Phase2 READY / Approved / Production / MERGED = 28/28/28/28? **YES**
7. Metadata drift = NONE? **YES**
8. CHAIN_CLASS_A exactly 23? **YES**
9. SMALL_MARKET_INDEPENDENT exactly 5? **YES**
10. BIGSPORT exactly 13? **YES**
11. Energy Fitness exactly 3? **YES**
12. Telecentru exactly once? **YES**
13. Telecentru coordinates exactly 46.994935, 28.832949? **YES**
14. Hospital pin absent? **YES**
15. XTZ exactly 4? **YES**
16. Adrenalin exactly 3? **YES**
17. Transnistria policy preserved? **YES**
18. All Transnistria live IDs md_*? **YES**
19. Separate Transnistria country/prefix absent? **YES**
20. Bender Shevchenko duplicate absent? **YES**
21. Heracles exactly 1? **YES**
22. Alexia exactly 1? **YES**
23. MaxGym exactly 1? **YES**
24. Wellness Era exactly 1? **YES**
25. Sportmaster exactly 1? **YES**
26. Aquaterra exactly 0? **YES**
27. Unica Sport exactly 0? **YES**
28. Municipal excluded candidate exactly 0? **YES**
29. Excluded leakage = 0? **YES**
30. Romanian contamination = 0? **YES**
31. Ukrainian contamination = 0? **YES**
32. Invalid Moldova postcodes = 0? **YES**
33. Invalid coordinates = 0? **YES**
34. Fallback coordinates = 0? **YES**
35. Mojibake = 0? **YES**
36. Hard duplicate problems = 0? **YES**
37. Rebrand/legacy conflicts = 0? **YES**
38. Fabricated regional coverage rows = 0? **YES**
39. Gagauzia reconciled? **YES**
40. Search/display passes? **YES**
41. Orphan md_* resolution passes? **YES**
42. Core flows pass? **YES**
43. Map contains intended 28 Moldova centers? **YES**
44. Nearest behavior sane? **YES**
45. 199 m allow? **YES**
46. 200 m allow? **YES**
47. 201 m block? **YES**
48. Auto-checkout remains 200 m? **YES**
49. Previous country counts intact? **YES**
50. SHA before QA == SHA after QA? **YES**
51. 12,500 crossed? **NO**
52. Global Stress QA required? **NO**
53. Architecture decision? **KEEP CLIENT-SIDE**

## FINAL VERDICT

**MOLDOVA STATUS: READY**

Country expansion: **UNLOCKED**

Hard stop: no next country started; Global Stress QA not run; `centers.json` unmodified. Waiting for explicit approval before further country expansion.
