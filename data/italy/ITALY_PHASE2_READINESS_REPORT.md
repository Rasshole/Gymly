# Italy Phase 2 Readiness Report

Generated: 2026-08-21 09:35 UTC

**Status: PHASE 2 DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Phase 1 baseline (preserved)

- staged: 465
- READY: 338
- NEEDS_COORDINATES: 11
- NEEDS_REVIEW: 114
- COMING_SOON: 2

## Phase 2 recovery

- phase1_in: 465
- phase2_in: 329
- enriched: 0
- new_added: 254
- replaced_unresolved: 109
- preserved_phase1_ready: 338
- Final staged: 610
- READY after Phase 2: 550 (Phase 1 had 338)
- Net READY gained: 212

## Overall

| Metric | Count |
|---|---:|
| Total Italy locations discovered (after staging dedupe) | 610 |
| READY_TO_IMPORT | 550 |
| NEEDS_COORDINATES | 18 |
| NEEDS_REVIEW | 27 |
| COMING_SOON | 15 |
| CLOSED | 0 |
| DUPLICATE (staging) | 0 |
| Staging collapses / soft merges | 0 |

## READY by brand

| Brand | READY |
|---|---:|
| FitActive | 193 |
| FitUP | 80 |
| Anytime Fitness | 68 |
| Fit Express | 45 |
| McFIT | 42 |
| Virgin Active | 42 |
| Icon Palestre | 31 |
| Orange | 23 |
| WebFit | 16 |
| 20Hours | 7 |
| Gold's Gym | 2 |
| JOHN REED | 1 |
| **TOTAL** | **550** |

## Chain Coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % | Status |
|---|---|---:|---:|---:|---:|---|
| FitActive | ~172–188 clubs Italy | 193 | 193 | 0 | 100% | COMPLETE |
| McFIT | ~42–46 clubs (RSG Magicline) | 43 | 42 | 0 | 98% | COMPLETE |
| JOHN REED | ~1–2 Italy (RSG) | 2 | 1 | 0 | 50% | NEAR-COMPLETE |
| Gold's Gym | ~2 Italy (RSG) | 2 | 2 | 0 | 100% | COMPLETE |
| Virgin Active | ~42 premium clubs | 42 | 42 | 0 | 100% | COMPLETE |
| FitUP | ~80–150 (site listed ~83) | 84 | 80 | 4 | 95% | COMPLETE |
| Fit Express | ~70 clubs | 69 | 45 | 24 | 65% | NEAR-COMPLETE |
| Anytime Fitness | ~60–66 open (API ~68 status=3) | 81 | 68 | 0 | 84% | COMPLETE |
| Orange | ~23–33 (incl. GetFIT acquisition) | 23 | 23 | 0 | 100% | COMPLETE |
| WebFit | ~16 clubs | 16 | 16 | 0 | 100% | COMPLETE |
| 20Hours | ~7 Milan-area | 7 | 7 | 0 | 100% | COMPLETE |
| Fitness Park | 1 open (RomaEst) | 1 | 0 | 1 | 0% | MATERIAL GAP |
| Icon Palestre | ~40–55 multi-region conventional | 47 | 31 | 16 | 66% | NEAR-COMPLETE |
| GetFIT | 6 acquired by Orange; 2 founder-retained — site 403 | 0 | 0 | 0 | — | MATERIAL GAP |
| Basic-Fit | 0 Italy clubs | 0 | 0 | 0 | — | EXCLUDED |
| Fit And Go | EXCLUDE — EMS | 0 | 0 | 0 | — | EXCLUDED |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Roma | 60 | 53 |
| Milano | 43 | 40 |
| Torino | 28 | 27 |
| Napoli | 8 | 7 |
| Palermo | 5 | 4 |
| Genova | 8 | 7 |
| Bologna | 8 | 7 |
| Firenze | 8 | 8 |
| Bari | 4 | 4 |
| Catania | 6 | 5 |
| Venezia | 3 | 3 |
| Verona | 6 | 6 |
| Padova | 7 | 7 |
| Trieste | 5 | 4 |
| Brescia | 7 | 6 |
| Parma | 5 | 5 |
| Modena | 3 | 2 |
| Cagliari | 5 | 5 |
| Messina | 2 | 1 |
| Reggio Emilia | 5 | 5 |

## Geography (READY)

| Band | READY |
|---|---:|
| North | 369 |
| Central | 127 |
| South | 23 |
| Sicily | 21 |
| Sardinia | 10 |
| Unknown | 0 |

## Data quality

- Missing addresses: 3
- Missing postal codes (CAP): 1
- Missing cities: 0
- Missing coordinates: 41
- READY coord sources: {'OFFICIAL_COORDINATE': 371, 'STRICT_ADDRESS_GEOCODE': 64, 'NAMED_GYM_POI': 12, 'OFFICIAL_MAP_PIN': 103}
- Italian CAP preserved as 5-digit strings (leading zeros intact).
- Italian text preserved (à, è, é, ì, ò, ù, apostrophes).
- No city/CAP/country centroid fallbacks used.
- San Marino / Vatican / FR / CH / AT / SI / HR / MT geocodes rejected.
- CAP filled from Nominatim reverse only on OFFICIAL_COORDINATE / OFFICIAL_MAP_PIN pins.

## Duplicate / rebrand analysis

- Staging collapses: 0
- Duplicate IDs remaining: 0
- Same-brand address duplicates: 0
- Same-brand proximity ≤80 m: 1
- Existing Italy in live catalog: 0
- `it_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0

## Completeness

- **FitActive**: COMPLETE
- **McFIT**: COMPLETE
- **Virgin Active**: COMPLETE
- **FitUP**: COMPLETE
- **Anytime Fitness**: COMPLETE
- **Orange**: COMPLETE
- **Fit Express**: NEAR-COMPLETE
- **WebFit**: COMPLETE
- **20Hours**: COMPLETE
- **Fitness Park**: MATERIAL GAP
- **Icon Palestre**: NEAR-COMPLETE
- **JOHN REED**: NEAR-COMPLETE
- **Gold's Gym**: COMPLETE
- **GetFIT**: MATERIAL GAP
- **Fit And Go**: EXCLUDED

## Remaining gaps

- GetFIT: 6 acquired clubs not on Orange sitemap yet; getfit.it returns 403.
- Orange estate may still expand toward ~33 (Palermo / GetFIT integration incomplete on site).
- FitUP target 150 YE2026 — current site estate staged; growth continuum.
- Icon Palestre: some club pages lack structured CAP/coords → geocode leftovers.
- Tonic / Audace: no verifiable multi-location conventional gym estate.

## Phase 3?

**NO**

Major recoverable chains closed enough; leftovers (GetFIT 403, handful of geocode fails) do not justify another full phase.

## Proposed SAFE merge

**550** READY_TO_IMPORT rows from Phase 2.

Expected catalog after merge: **8,143 + 550 = 8,693**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.

## 10K Checkpoint

No — projected total 8,693 remains under 10,000 (headroom 1,307).

## Files

- `scripts/italy-phase2-discover.py`
- `scripts/italy-phase2-consolidate.py`
- `data/italy/italy_centers_staging.json`
- `data/italy/italy_centers_staging_phase1_backup.json`
- `data/italy/italy_geocode_review.json`
- `data/italy/italy_duplicate_analysis.json`
- `data/italy/ITALY_PHASE2_READINESS_REPORT.md`
- `data/italy/ITALY_PHASE2_READINESS_REPORT.json`
- `data/italy/ITALY_PHASE2_READY_TO_IMPORT.json`
- `data/italy/Gymly_Italy_All_Discovered_Centers.xlsx`
- `data/italy/italy_geocode_cache.json`

## FINAL RECOMMENDATION: READY FOR ITALY MERGE

**STOP. Do not merge Italy. Do not run Italy QA. Do not start another country.**
