# PORTUGAL PRODUCTION QA REPORT

**Generated:** 2026-08-22  
**Catalog:** 10,772 centers · Portugal 247 (`pt_*`)  
**Verdict:** PORTUGAL STATUS: READY  
**Country expansion:** UNLOCKED

---

## Overall

| Item | Result |
|------|--------|
| Full QA completed | YES |
| Production modified | YES (1 coordinate repair) |
| Status | READY |

---

## Catalog integrity

| Check | Count |
|-------|------:|
| Total | 10772 |
| Portugal | 247 |
| pt_* | 247 |
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |
| Active (catalog) | 10768 |
| Inactive | 4 |

---

## Brand breakdown (production)

| Brand | Count |
|-------|------:|
| Fitness UP | 51 |
| VivaGym | 46 |
| Element | 46 |
| Fitness Factory | 44 |
| Solinca | 19 |
| Solinca Light | 16 |
| Holmes Place | 12 |
| Be-Fit | 10 |
| Balance | 2 |
| Lemonfit | 1 |
| **TOTAL** | **247** |

---

## Merge reconciliation

| Source | Count |
|--------|------:|
| PORTUGAL_APPROVED_FOR_MERGE | 247 |
| Production Portugal | 247 |
| Staging MERGED_INTO_CATALOG | 247 |
| Missing IDs | 0 |
| Unexpected IDs | 0 |
| Metadata drift | NONE |

---

## Staging exclusions (not in production)

| Category | Staging | In production |
|----------|--------:|--------------:|
| NEEDS_COORDINATES | 36 | 0 |
| NEEDS_REVIEW | 26 | 0 |
| COMING_SOON | 0 | 0 |
| CLOSED | 2 | 0 |
| DUPLICATE | 5 | 0 |

Withheld Fitness Factory problem rows still absent:

- Alenquer (`pt_36956a7053`) — NEEDS_REVIEW
- Palmela (`pt_573fbbba9e`) — NEEDS_REVIEW, flipped `+lng`
- São João da Madeira (`pt_41e469ddda`) — NEEDS_REVIEW, flipped `+lng`

---

## Rebrands / exclusions

| Legacy identity | Production status |
|-----------------|-------------------|
| Fitness Hut | Absent (live as VivaGym) |
| Pump Fitness Spirit | Absent (live as Solinca Light) |
| Virgin Active Portugal | Absent (live as Holmes Place) |
| Kalorias | Absent |

No predecessor/successor duplicate clubs found at the same physical location.

---

## Duplicate / proximity QA

| Metric | Count | Classification |
|--------|------:|----------------|
| Duplicate IDs | 0 | — |
| Same-brand ≤25 m | 0 | — |
| Same-brand ≤50 m | 0 | — |
| Same-brand ≤100 m | 0 | — |
| Same-brand ≤200 m | 1 | **A — legitimate** |
| Identical-coordinate clusters | 0 | — |
| Different-brand ≤100 m | 1 | **A — legitimate** |

### Known Carcavelos / Parede (~103 m)

- `pt_c7293231c5` Fitness UP Carcavelos — Estr. Alagoa 96B · 2775-717  
- `pt_33927a6b65` Fitness UP Parede — Rua Vasco da Gama 60 · 2775-232  
- Official separate club pages on fitnessup.pt  
- **Classification: A (legitimate separate clubs)**

### Picoas different-brand (~76 m)

- VivaGym Picoas (`pt_88f14f9770`) vs Fitness UP Lx Picoas (`pt_c81da3a8bf`)  
- Distinct brands, streets numbers (Tomás Ribeiro 65 vs 34)  
- **Classification: A**

### Solinca Colombo ↔ Fitness UP Portela Loures (was ~46 m)

- **Bug found:** Portela Loures geocode had been misplaced at Colombo  
- **Repaired** (see Bugs Fixed)  
- Post-repair distance ≈ **7.5 km** — no longer a proximity pair

---

## Island QA — Madeira (5)

| ID | Brand | Locality | Postcode | Result |
|----|-------|----------|----------|--------|
| pt_d1573ba977 | Be-Fit CentroMar | Funchal | 9000-103 | PASS |
| pt_532415ebbc | Be-Fit Plaza Madeira | Funchal | 9000-039 | PASS |
| pt_8e9361add0 | Fitness Factory Funchal | Funchal | 9000-246 | PASS |
| pt_0ed3aa6000 | Fitness Factory Caniço | Caniço | 9125-141 | PASS |
| pt_2c594cd30b | Fitness Factory Santo António | Santo António | 9020-269 | PASS |

Search / map / nearest / check-in: **PASS** (no mainland fallback)

---

## Island QA — Azores (2)

| ID | Brand | Locality | Postcode | Result |
|----|-------|----------|----------|--------|
| pt_34bec26868 | Element Angra do Heroísmo | Angra do Heroísmo | 9700-017 | PASS |
| pt_7d40ef811b | Fitness Factory Arrifes | Arrifes | 9500-362 | PASS |

Search / map / nearest / check-in: **PASS**

---

## Search QA

| Area | Result |
|------|--------|
| Brands (full + partial) | PASS |
| Cities (Lisboa/Lisbon, Porto, Gaia, Braga, Coimbra, Aveiro, Faro, Setúbal, Funchal, Angra, Ponta Delgada) | PASS |
| ASCII/diacritics (João/São/Évora/Santarém) | PASS (display text unchanged) |
| Postcode NNNN-NNN + compact | PASS |
| Cross-country AT/BE/CH collision safety | PASS |
| Incremental typing | PASS / ACCEPTABLE |

---

## Core flows

| Flow | Result |
|------|--------|
| Onboarding select pt_* | PASS |
| Profile / favorites resolve | PASS |
| Nearest | PASS |
| Dense Lisbon/Porto pins | PASS |
| Map viewport scoped | PASS |
| 200 m check-in (199/200/201) | PASS |
| Auto-checkout radius 200 | PASS |
| Session gym ID stable vs nearby | PASS |
| Workout / PR unaffected (shared paths) | PASS |
| History / feed / notifications / planned (ID resolve) | PASS |
| Orphan `pt_nonexistent_test` → Portugal stub | PASS |

---

## Country regression

| Country | Count |
|---------|------:|
| DK | 354 |
| SE | 639 |
| NO | 535 |
| DE | 1424 |
| UK | 1474 |
| FI | 429 |
| NL | 600 |
| FR | 1712 |
| ES | 976 |
| IT | 588 |
| BE | 363 |
| PL | 621 |
| AT | 335 |
| CH | 475 |
| PT | 247 |
| **SUM** | **10772** |

---

## Performance (actual 10,772 catalog)

| Metric | Value |
|--------|------:|
| Catalog | 10772 |
| Active (finite coords) | 10767 |
| JSON size | 3.17 MB |
| Parse | ~21 ms |
| Cold index | ~31 ms |
| Cached | &lt;0.1 ms |
| Typical search | ~4 ms |
| Worst scan | ~5 ms |
| Nearest | ~14 ms |
| Map build | ~8 ms |
| Viewport filter | ~4 ms |
| **Assessment** | **GOOD** |

No architecture change required.

---

## Global scale

| Item | Value |
|------|-------|
| Previous QA baseline | 10525 (Switzerland) |
| New catalog | 10772 |
| New global-scale blocker | NO |
| Global stress rerun required | **NO** |
| Country expansion | **UNLOCKED** |
| Architecture | KEEP CLIENT-SIDE |

---

## Bugs found

1. **Fitness UP Portela Loures (`pt_030a7b76ff`) wrong coordinates**  
   - Before: `38.7549116, -9.1890105` (near Solinca Colombo, ~46 m)  
   - Cause: `STRICT_ADDRESS_GEOCODE` on incomplete “Avenida da República Comp. Pisc” without Portela context  
   - Evidence: official club page + OSM `Complexo de Piscinas da Portela` (Avenida da República, Moscavide e Portela, Loures)

## Bugs fixed

1. **Portela Loures coordinate repair**  
   - After: `38.7834895, -9.110755`  
   - `coord_source`: `QA_REPAIR_OSM_COMPLEXO_PISCINAS_PORTELA`  
   - Updated: `centers.json`, staging, APPROVED, PHASE2 READY  
   - Artifact: `data/portugal/PORTUGAL_QA_PORTELA_LOURES_REPAIR.json`  
   - Regression covered in `__tests__/portugalGymQa.test.ts`

---

## Remaining risks

- 36 NEEDS_COORDINATES + 26 NEEDS_REVIEW staging rows remain out of production (including FF Alenquer / Palmela / SJM with flipped longitude) — intentional, not live.
- Dense Cascais/Lisbon clubs can sit &lt;200 m apart; check-in correctly uses **selected** gym ID (verified), but users must select the intended club.

---

## Tests

| Suite | Result |
|-------|--------|
| portugalGymQa | PASS |
| portugalMergeSafety | PASS |
| portugalCatalogScalingPrep | PASS |
| portugalPhase1Staging | PASS |
| portugalPhase2Staging | PASS |
| switzerlandGymQa | PASS |
| switzerlandMergeSafety | PASS |

**7 suites · 190 tests · 0 failed**

---

## Files changed

- `src/data/centers.json` (Portela Loures lat/lng repair)
- `data/portugal/portugal_centers_staging.json`
- `data/portugal/PORTUGAL_APPROVED_FOR_MERGE.json`
- `data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json`
- `data/portugal/PORTUGAL_QA_PORTELA_LOURES_REPAIR.json`
- `data/portugal/PORTUGAL_QA_REPORT.md`
- `__tests__/portugalGymQa.test.ts`
- `__tests__/portugalCatalogScalingPrep.test.ts`
- `__tests__/portugalPhase1Staging.test.ts`
- `__tests__/portugalPhase2Staging.test.ts`
- `__tests__/switzerlandGymQa.test.ts`
- `__tests__/switzerlandMergeSafety.test.ts`
- `__tests__/switzerlandCatalogScalingPrep.test.ts`
- `__tests__/switzerlandPhase2Staging.test.ts`

---

## Final verdict

**PORTUGAL STATUS: READY**  
**Country expansion: UNLOCKED**
