# Spain Phase 2 Readiness Report

Generated: 2026-08-20 11:04 UTC

**Status: PHASE 2 DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Phase 1 baseline (preserved)

- staged: 489
- READY: 262
- NEEDS_COORDINATES: 219
- NEEDS_REVIEW: 8

## Phase 2 recovery

- phase1_in: 489
- phase2_in: 892
- enriched: 0
- new_added: 628
- altafit_dropped_as_vivagym_rebrand: 0
- preserved_phase1_ready: 262
- Final unique staged (excl. duplicates): 1097
- READY after Phase 2: 867 (Phase 1 had 262)
- Net READY gained: 605

## McFIT Spain

All McFIT Spain studios were sold to **Basic-Fit** in 2024. Phase 2 Magicline API check returned **0** McFIT ES studios. **COMPLETE via Basic-Fit** — not a coverage gap. No McFIT rows staged.

## Overall

| Metric | Count |
|---|---:|
| Unique staged (excl. duplicates) | 1097 |
| READY_TO_IMPORT | 867 |
| NEEDS_COORDINATES | 227 |
| NEEDS_REVIEW | 3 |
| COMING_SOON | 0 |
| CLOSED | 0 |
| DUPLICATE | 20 |

## READY by brand

| Brand | READY |
|---|---:|
| VivaGym | 246 |
| Basic-Fit | 236 |
| Synergym | 99 |
| Fitness Park | 80 |
| Anytime Fitness | 57 |
| Forus | 48 |
| BeOne | 25 |
| Holiday Gym | 22 |
| DIR | 19 |
| Dreamfit | 14 |
| GO fit | 12 |
| Altafit | 5 |
| Eurofitness | 3 |
| Metropolitan | 1 |

## Major chain completeness

| Chain | Estimate | Discovered | READY | Unresolved | Coverage % | Status |
|---|---|---:|---:|---:|---:|---|
| Basic-Fit | ~246 clubs (includes former McFIT 42 + Holmes Place 5) | 240 | 236 | 4 | 98% | COMPLETE |
| VivaGym | ~250+ clubs (includes former Altafit ~70) | 246 | 246 | 0 | 98% | COMPLETE |
| Synergym | ~180-240 clubs (acquired by VivaGym group, still own brand) | 221 | 99 | 122 | 123% | PARTIAL |
| Altafit | ~5 remaining (rest rebranded to VivaGym) | 5 | 5 | 0 | 100% | COMPLETE |
| DIR | ~20 clubs in Barcelona + Sant Cugat | 23 | 19 | 4 | 115% | COMPLETE |
| Anytime Fitness | ~60+ franchise clubs | 57 | 57 | 0 | 95% | COMPLETE |
| Dreamfit | ~25 clubs | 22 | 14 | 8 | 88% | COMPLETE |
| GO fit | ~20 clubs | 13 | 12 | 1 | 65% | PARTIAL |
| Metropolitan | ~10-20 premium clubs | 2 | 1 | 1 | 20% | PARTIAL |
| Forus | ~15-50 sports/fitness centers | 49 | 48 | 1 | 327% | COMPLETE |
| Fitness Park | ~150-165 clubs (Spain) | 163 | 80 | 83 | 109% | COMPLETE |
| Supera | ~5+ (partial) | 1 | 0 | 1 | 20% | PARTIAL |
| Enjoy! | unknown — site unreachable | 0 | 0 | 0 | — | MATERIAL GAP |
| BeOne | ~20-25 gym floors | 26 | 25 | 1 | 130% | COMPLETE |
| O2 Centro Wellness | ~8-12 clubs | 4 | 0 | 4 | 50% | PARTIAL |
| Eurofitness | ~20 clubs (Catalonia) | 3 | 3 | 0 | 15% | PARTIAL |
| Holiday Gym | ~22 clubs | 22 | 22 | 0 | 100% | COMPLETE |
| McFIT | N/A — sold to Basic-Fit 2024 | 0 | 0 | 0 | — | COMPLETE_VIA_BASIC_FIT |

## Completeness gates (A–H)

- **A VivaGym materially complete?** YES (246 discovered / 246 READY)
- **B Basic-Fit?** YES (240 / 236 READY)
- **C Altafit?** YES (5 remaining verified)
- **D Synergym?** PARTIAL (221 / 99 READY)
- **E McFIT Spain?** N/A — absorbed into Basic-Fit (COMPLETE)
- **F Anytime Fitness Spain?** YES (57 / 57 READY)
- **G Major conventional chains represented?** YES
- **H Still completely missing?** Enjoy!

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Madrid | 140 | 128 |
| Barcelona | 97 | 84 |
| Valencia | 51 | 44 |
| Sevilla | 29 | 25 |
| Zaragoza | 34 | 26 |
| Málaga | 15 | 15 |
| Murcia | 15 | 10 |
| Palma | 25 | 20 |
| Las Palmas | 12 | 9 |
| Bilbao | 14 | 10 |
| Alicante | 16 | 13 |
| Córdoba | 8 | 7 |
| Valladolid | 9 | 4 |
| Vigo | 8 | 5 |
| Gijón | 12 | 12 |
| Granada | 12 | 7 |
| A Coruña | 11 | 10 |

## Islands

- Balearic Islands READY: 13
- Canary Islands READY: 20
- Ceuta READY: 0
- Melilla READY: 0

## Data quality

- Missing addresses: 2
- Missing postal codes: 169
- Missing cities: 1
- Missing coordinates: 230
- Spanish postcodes preserved as 5-digit strings (leading zeros intact).
- Spanish/Catalan/Basque/Galician text preserved.
- No city/postcode/country centroid fallbacks used.

## Remaining gaps / Phase 3?

- Synergym: Incapsula blocks club pages; 99 READY via Nominatim but many still unresolved without official postcodes/coords.
- Enjoy!: official site unreachable — Phase 3 candidate.
- Metropolitan: only partial city-page extraction.
- O2: several club pages lacked clean JSON-LD; Madrid clubs recoverable, others need Phase 3.
- Eurofitness/Supera: partial (sister-brand pages).
- Fitness Park: large estate discovered; Nominatim converted many but not all.
- Phase 3 worthwhile for Synergym official postcodes, Enjoy!, Metropolitan, O2 polish.

## Proposed SAFE merge

**867** READY_TO_IMPORT rows from Phase 2 staging.

Expected catalog after merge: **7167 + 867 = 8034**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.

## 10K Checkpoint

No — projected total 8034 remains under 10,000.

## Files

- `scripts/spain-phase2-discover.py`
- `scripts/spain-phase2-consolidate.py`
- `data/spain/spain_centers_staging.json`
- `data/spain/spain_geocode_review.json`
- `data/spain/spain_geocode_review.csv`
- `data/spain/spain_duplicate_analysis.json`
- `data/spain/SPAIN_PHASE2_READINESS_REPORT.md`
- `data/spain/SPAIN_PHASE2_READINESS_REPORT.json`
- `data/spain/SPAIN_PHASE2_READY_TO_IMPORT.json`
- `data/spain/Gymly_Spain_All_Discovered_Centers.xlsx`
- `data/spain/spain_geocode_cache.json`

**STOP. Do not merge Spain. Do not run Spain QA. Do not start another country.**
