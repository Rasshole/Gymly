# Spain Phase 1 Readiness Report

Generated: 2026-08-19 15:12 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market audit (Spain conventional chains)

### Brand relationships

- **McFIT** → All 42 studios + 5 Holmes Place sold to **Basic-Fit** in 2024. No McFIT exists in Spain. Basic-Fit total ~246.
- **Altafit** → Acquired by **VivaGym** end of 2024. 70 clubs migrated to VivaGym brand (19 Madrid Apr 2025, 24 others Apr 2025). Only ~5 Altafit remain.
- **Synergym** → Acquired by **VivaGym** (Providence Equity Partners). Still operates as own brand with 180+ clubs.
- **VivaGym** → Parent: Providence Equity Partners. Owns VivaGym + Synergym + ex-Altafit. Total footprint 450+ Iberia.
- **DIR** → Independent Catalonia-only chain. 20 clubs in Barcelona + Sant Cugat. Includes DiR, BDiR (proximity), YogaOne (yoga-only — EXCLUDED), Jambox.
- **Basic-Fit** → NL-headquartered. Spain is their biggest growth market. 246 clubs including all former McFIT/Holmes Place.

### Qualification decisions

| Chain | Decision | Reason |
|---|---|---|
| Basic-Fit | INCLUDE | Budget fitness chain with cardio/strength |
| VivaGym | INCLUDE | Full-service fitness chain |
| Synergym | INCLUDE | Budget fitness chain with cardio/strength |
| Altafit | INCLUDE | Full-service gym (5 remaining) |
| DIR (DiR, BDiR, Diagonal DiR) | INCLUDE | Premium full-service gyms |
| DIR (YogaOne) | EXCLUDE | Yoga-only studio |
| DIR (Jambox) | INCLUDE | High-intensity fitness |
| Anytime Fitness | INCLUDE | 24/7 franchise gyms |
| Dreamfit | INCLUDE | Full-service fitness |
| GO fit | INCLUDE | Premium fitness chain |
| Metropolitan | INCLUDE | Premium fitness/wellness |
| Forus | INCLUDE | Sports/fitness centers |
| Fitness Park | INCLUDE | Budget fitness |
| Supera | INCLUDE | Fitness chain |
| Enjoy! | INCLUDE | Fitness chain |
| BeOne | INCLUDE | Fitness chain |
| O2 Centro Wellness | INCLUDE | Fitness/wellness |
| Eurofitness | INCLUDE | Budget fitness (Catalonia) |
| Holiday Gym | INCLUDE | Budget fitness |
| Brooklyn Fitboxing | EXCLUDE | Boxing-only boutique |

## Overall

| Metric | Count |
|---|---:|
| Total Spain locations discovered (after staging dedupe) | 489 |
| READY_TO_IMPORT | 262 |
| NEEDS_COORDINATES | 219 |
| NEEDS_REVIEW | 8 |
| COMING_SOON | 0 |
| CLOSED | 0 |
| DUPLICATE (staging) | 0 |
| Staging same-id collapses | 19 |

## Chain coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Basic-Fit | ~246 clubs (includes former McFIT 42 + Holmes Place 5) | 240 | 236 | 4 | 98% |
| VivaGym | ~250+ clubs (includes former Altafit ~70) | 0 | 0 | 0 | — |
| Synergym | ~180-240 clubs (acquired by VivaGym group, still own brand) | 221 | 13 | 208 | 6% |
| Altafit | ~5 remaining (rest rebranded to VivaGym) | 5 | 5 | 0 | 100% |
| DIR | ~20 clubs in Barcelona + Sant Cugat | 23 | 8 | 15 | 35% |
| Anytime Fitness | ~30+ franchise clubs | 0 | 0 | 0 | — |
| Dreamfit | ~10 clubs | 0 | 0 | 0 | — |
| GO fit | ~15 clubs | 0 | 0 | 0 | — |
| Metropolitan | ~10 premium clubs | 0 | 0 | 0 | — |
| Forus | ~15 clubs | 0 | 0 | 0 | — |
| Fitness Park | ~5 clubs | 0 | 0 | 0 | — |
| Supera | ~20 clubs | 0 | 0 | 0 | — |
| Enjoy! | ~15 clubs | 0 | 0 | 0 | — |
| BeOne | ~10 clubs | 0 | 0 | 0 | — |
| O2 Centro Wellness | ~10 clubs | 0 | 0 | 0 | — |
| Eurofitness | ~10 clubs (Catalonia) | 0 | 0 | 0 | — |
| Holiday Gym | ~10 clubs | 0 | 0 | 0 | — |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Madrid | 42 | 39 |
| Barcelona | 33 | 15 |
| Valencia | 20 | 15 |
| Sevilla | 16 | 11 |
| Zaragoza | 14 | 9 |
| Málaga | 7 | 7 |
| Murcia | 7 | 4 |
| Palma | 7 | 1 |
| Las Palmas | 3 | 0 |
| Bilbao | 6 | 3 |
| Alicante | 5 | 3 |
| Córdoba | 3 | 3 |
| Valladolid | 6 | 3 |
| Vigo | 4 | 1 |
| Gijón | 7 | 4 |
| Granada | 7 | 3 |
| A Coruña | 4 | 2 |

## Islands

- Balearic Islands READY: 1
- Canary Islands READY: 0
- Ceuta: 0 (no chain presence discovered)
- Melilla: 0 (no chain presence discovered)

## Data quality

- Missing addresses: 1
- Missing postal codes: 221
- Missing cities: 1
- Missing coordinates: 227
- Spanish postcodes preserved as 5-digit strings (leading zeros intact).
- Spanish/Catalan/Basque/Galician text preserved (á, é, í, ó, ú, ñ, ç, ü, à, è, etc.).
- No city/postcode/country centroid fallbacks used.

## Duplicate / rebrand analysis

- Staging same-id collapses: 19
- Duplicate IDs remaining: 0
- Same-brand address duplicates: 0
- Same-brand proximity ≤80 m: 0
- Existing Spain in live catalog: 0
- `es_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live: 0

## Completeness

**Complete chains (>80% coverage):** Basic-Fit (scraped from official locator)

**Partial chains (scraped but incomplete):** Synergym (parsed from homepage), Altafit

**Chains needing Phase 2 JS-rendered scraping:**
- VivaGym (~250+ clubs, vivagym.com JS-heavy)
- Anytime Fitness Spain (~30+)
- Dreamfit (~10)
- GO fit (~15)
- Metropolitan (~10)
- Forus (~15)
- Fitness Park Spain (~5)
- Supera (~20)
- Enjoy! (~15)
- BeOne (~10)
- O2 Centro Wellness (~10)
- Eurofitness (~10)
- Holiday Gym (~10)
- DIR (~20, partially scraped)

**Phase 2 is STRONGLY RECOMMENDED** to complete VivaGym and remaining chains.

## Proposed SAFE merge

**262** READY_TO_IMPORT rows from Phase 1.

Expected catalog after merge: **7,167 + 262 = 7,429**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.

## 10K Checkpoint

No — projected total 7,429 remains under 10,000.

## Scaling

Current live catalog: 7,167.
Projected after Phase 1 merge: 7,429.
Comfortably inside current client-side architecture.

## Files

- `scripts/spain-phase1-discover.py`
- `scripts/spain-phase1-consolidate.py`
- `data/spain/spain_centers_staging.json`
- `data/spain/spain_geocode_review.json`
- `data/spain/spain_duplicate_analysis.json`
- `data/spain/SPAIN_PHASE1_READINESS_REPORT.md`
- `data/spain/Gymly_Spain_All_Discovered_Centers.xlsx`
- `data/spain/spain_geocode_cache.json`
- `data/spain/spain_discovery_combined.json`
- `data/spain/raw/` official HTML/JSON captures
- `data/spain/scrapes/` per-chain discovery JSON

**STOP. Do not merge Spain. Do not run Spain QA. Do not start another country.**
