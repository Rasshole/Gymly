# Spain Phase 3 Readiness Report

Generated: 2026-08-20 18:02 UTC

**Status: PHASE 3 DONE — PHASE 4 STILL NEEDED BEFORE MERGE.**

`src/data/centers.json` was not modified.

## Phase 2 baseline

- unique_staged: 1097
- READY_TO_IMPORT: 867
- NEEDS_COORDINATES: 227
- NEEDS_REVIEW: 3
- COMING_SOON: 0
- CLOSED: 0
- DUPLICATE: 20

## Phase 3 recovery

- enjoy_open_discovered: 18
- enjoy_ready: 18
- enjoy_coming_soon: 4
- synergym_ready_gain: 27
- fitness_park_ready_gain: 27
- dreamfit_ready: 20
- net_ready_gain_vs_phase2: 87
- duplicates_marked: 60
- preserved_phase2_ready_floor: 867

## McFIT Spain

McFIT Spain was sold to Basic-Fit in 2024. Phase 2/3 Magicline-style checks and mcfit_spain_p2.json are empty (0 studios). No McFIT rows invented; no German data reused. Coverage is COMPLETE via Basic-Fit.

## Overall

| Metric | Count |
|---|---:|
| unique_staged_excl_duplicates | 1080 |
| READY_TO_IMPORT | 954 |
| NEEDS_COORDINATES | 120 |
| NEEDS_REVIEW | 2 |
| COMING_SOON | 4 |
| CLOSED | 0 |
| DUPLICATE | 60 |

## READY by brand

| Brand | READY |
|---|---:|
| VivaGym | 246 |
| Basic-Fit | 238 |
| Synergym | 126 |
| Fitness Park | 107 |
| Anytime Fitness | 57 |
| Forus | 48 |
| BeOne | 25 |
| DIR | 22 |
| Holiday Gym | 22 |
| Dreamfit | 20 |
| Enjoy! | 18 |
| GO fit | 13 |
| Altafit | 5 |
| Eurofitness | 3 |
| Metropolitan | 3 |
| O2 Centro Wellness | 1 |

## Major chain completeness

| Chain | Estimate | Discovered | READY | Unresolved | Verdict |
|---|---|---:|---:|---:|---|
| Basic-Fit | ~246 (incl. former McFIT) | 239 | 238 | 1 | COMPLETE |
| VivaGym | ~250+ | 246 | 246 | 0 | COMPLETE |
| Altafit | ~5 remaining after VivaGym rebrand | 5 | 5 | 0 | COMPLETE |
| Synergym | ~180-240 (own brand under VivaGym group) | 197 | 126 | 71 | MATERIAL GAP |
| Dreamfit | ~22-25 | 22 | 20 | 2 | NEAR-COMPLETE |
| Metropolitan | ~10-20 premium Spain | 3 | 3 | 0 | MATERIAL GAP |
| DIR | ~20 Barcelona area | 22 | 22 | 0 | COMPLETE |
| Forus | ~15-50 | 49 | 48 | 1 | COMPLETE |
| GO fit | ~13-20 | 13 | 13 | 0 | NEAR-COMPLETE |
| Anytime Fitness | ~60+ | 57 | 57 | 0 | COMPLETE |
| Fitness Park | ~150-165 Spain | 150 | 107 | 43 | NEAR-COMPLETE |
| McFIT | N/A — sold to Basic-Fit 2024 | 0 | 0 | 0 | COMPLETE |
| Supera | ~5+ | 1 | 0 | 1 | MATERIAL GAP |
| Enjoy! | ~18 open + 4 coming soon | 22 | 18 | 0 | NEAR-COMPLETE |
| BeOne | ~20-25 gym floors | 26 | 25 | 1 | COMPLETE |
| Holiday Gym | ~22 | 22 | 22 | 0 | COMPLETE |
| O2 Centro Wellness | ~8-12 | 3 | 1 | 2 | MATERIAL GAP |
| Eurofitness | ~20 Catalonia | 3 | 3 | 0 | MATERIAL GAP |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Madrid | 134 | 132 |
| Barcelona | 95 | 91 |
| Valencia | 52 | 51 |
| Sevilla | 29 | 27 |
| Zaragoza | 35 | 32 |
| Málaga | 16 | 16 |
| Murcia | 17 | 13 |
| Palma | 24 | 23 |
| Las Palmas | 11 | 11 |
| Bilbao | 14 | 12 |
| Alicante | 15 | 13 |
| Córdoba | 8 | 7 |
| Valladolid | 9 | 5 |
| Vigo | 8 | 6 |
| Gijón | 12 | 12 |
| Granada | 11 | 9 |
| A Coruña | 11 | 10 |

## Islands

- Balearic Islands READY: 14
- Canary Islands READY: 23
- Ceuta READY: 0
- Melilla READY: 0

## Data quality

- Missing addresses: 6
- Missing postal codes: 121
- Missing cities: 1
- Missing coordinates: 126
- Spanish postcodes preserved as 5-digit strings (leading zeros intact).
- Spanish/Catalan/Basque/Galician text preserved.
- No city/postcode/country centroid fallbacks used.
- Enjoy! coords from official brand Google My Maps pins.

## Remaining gaps / Phase 4?

- Enjoy!: open READY 18, coming_soon 4, unresolved 0
- Synergym: READY 126 / discovered 197 (unresolved 71)
- Fitness Park: READY 107 / discovered 150 (unresolved 43)
- Gap audit: Enjoy! was the only Phase-2 completely absent conventional chain; now recovered. Eurofitness/Supera/O2/Metropolitan remain thin but were already partially staged. No new 10+ conventional chain found completely absent.
- Phase 4 worthwhile? **YES**
- Rationale: Synergym still has ~70 OPEN clubs with street addresses but no trusted coords (official site Incapsula-blocked). Fitness Park still has ~43 Spain clubs with address+postcode that Nominatim/Photon could not strictly resolve. These are material and realistically recoverable in Phase 4 via deeper official/API/OSM work — not a handful of low-confidence leftovers.

## Proposed SAFE merge

**954** READY_TO_IMPORT rows from Phase 3 staging.

Expected catalog after merge: **7167 + 954 = 8121**..

## 10K checkpoint: NO (headroom 1879)

## RECOMMENDATION: PHASE 4 REQUIRED BEFORE MERGE

## Files

- data/spain/spain_centers_staging.json
- data/spain/SPAIN_PHASE3_READINESS_REPORT.md
- data/spain/SPAIN_PHASE3_READINESS_REPORT.json
- data/spain/SPAIN_PHASE3_READY_TO_IMPORT.json
- data/spain/spain_geocode_review.json / .csv
- data/spain/spain_duplicate_analysis.json
- data/spain/spain_geocode_cache.json
- data/spain/Gymly_Spain_All_Discovered_Centers.xlsx
- data/spain/scrapes/enjoy_spain_p3.json
- scripts/spain-phase3-recovery.py
- scripts/spain-phase3-consolidate.py
- scripts/spain-phase3-followup.py
