# Netherlands Phase 1 Readiness Report

Generated: 2026-08-19 08:22 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market audit (Netherlands conventional chains)

Current consumer-facing brands staged in Phase 1:

- **Basic-Fit** — Largest budget chain in NL (~250 clubs). Official club-finder page. Multi-country (BE/FR/LU/ES/DE) — NL only staged.
- **SportCity** — ~121 clubs. **All former Fit For Free clubs fully rebranded to SportCity in October 2022.** No FFF duplicate rows.
- **TrainMore** — Premium Amsterdam-area chain (25+ locations) expanding to Rotterdam, Den Haag, Utrecht. Part of Urban Gym Group.
- **Anytime Fitness** — International 24/7 franchise, ~130-145 NL locations. NL-only filter applied.
- **David Lloyd** — 6 premium clubs in NL (Amsterdam, Utrecht, Eindhoven/Veldhoven, 2x Rotterdam, Capelle). UK David Lloyd clubs already in catalog with separate IDs.
- **Snap Fitness** — International 24/7 franchise, 6+ NL locations.
- **Clubsportive** — 1 premium club in Amsterdam Zuidas. Part of Urban Gym Group.
- **HealthCity** — ~20 premium clubs NL. Parent company Leisure Group Europe.
- **Optisport** — Municipal operator; only health club locations with genuine gym floors staged (not pool-only).

### Fit For Free / SportCity rebrand

Fit For Free was fully rebranded to SportCity in October 2022. The fitforfree.nl domain now redirects to sportcity.nl.
All NL clubs are staged under the consumer brand **SportCity**. No FFF rows exist.

## Overall

| Metric | Count |
|---|---:|
| Total NL locations discovered (after staging dedupe) | 431 |
| VERIFIED_CURRENT | 430 |
| READY_TO_IMPORT | 422 |
| NEEDS_COORDINATES | 5 |
| NEEDS_REVIEW | 3 |
| COMING_SOON | 1 |
| DUPLICATE (staging) | 0 |
| Staging same-id collapses | 1 |

## Chain coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Basic-Fit | ~250 NL clubs on basic-fit.com club-finder | 252 | 251 | 1 | 100% |
| SportCity | ~121 clubs; former Fit For Free fully rebranded Oct 2022 | 1 | 0 | 1 | 0% |
| TrainMore | 25+ Amsterdam clubs + expanding to other cities | 0 | 0 | 0 | — |
| Anytime Fitness | ~132-145 NL franchise locations | 135 | 132 | 3 | 98% |
| David Lloyd | 6 premium clubs NL | 6 | 6 | 0 | 100% |
| Snap Fitness | 6-8 NL clubs (some opening 2026) | 6 | 6 | 0 | 100% |
| Clubsportive | 1 premium club Amsterdam Zuidas | 1 | 1 | 0 | 100% |
| HealthCity | ~20 premium clubs NL | 21 | 19 | 2 | 90% |
| Optisport | ~9-23 health club locations with gym floors | 9 | 7 | 2 | 78% |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Amsterdam | 23 | 22 |
| Rotterdam | 23 | 23 |
| Den Haag | 11 | 11 |
| Utrecht | 8 | 8 |
| Eindhoven | 9 | 9 |
| Groningen | 7 | 7 |
| Tilburg | 6 | 6 |
| Almere | 8 | 8 |
| Breda | 6 | 6 |
| Nijmegen | 3 | 3 |
| Haarlem | 3 | 3 |
| Arnhem | 5 | 5 |
| Enschede | 6 | 6 |
| Maastricht | 6 | 6 |

## Data quality

- Missing addresses: 1
- Missing postal codes: 1
- Missing cities: 1
- Missing coordinates: 9
- READY with official coordinates: 235
- READY with Nominatim coordinates: 187
- Soft-postal matches flagged: 6
- Ambiguous geocode results: 2
- Dutch postal codes are stored as **strings** in JSON and as Excel TEXT (`@` number format).
- No Amsterdam / city / postal-code centroid fallbacks were used.
- Missing coordinates remain null and are **not check-in eligible**.

## Geography

- All READY coordinates sit inside the Netherlands bounding box (50.75–53.55 lat, 3.35–7.23 lng).
- Cross-border filtering: Basic-Fit BE/FR/DE/LU/ES excluded. Anytime Fitness global — NL only. David Lloyd UK already in catalog — new nl_* IDs for Dutch locations.

## Duplicate / rebrand analysis

- Staging same-id collapses: 1
- Duplicate IDs remaining: 0
- Same-brand physical address duplicates: 0
- Same-brand proximity ≤80 m: 2
- Legitimate different-brand co-locations ≤80 m: 14
- Existing Netherlands rows in live catalog: 0
- `nl_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0
- David Lloyd in live catalog: 112 (UK clubs — separate from NL nl_* IDs)
- Fit For Free → SportCity rebrand: complete Oct 2022; fitforfree.nl → sportcity.nl. Zero FFF rows in staging.

## Completeness

Netherlands Phase 1 covers the major chains that have parseable locators.

**Materially incomplete — JS-rendered locators (Phase 2 priority):**
- **SportCity** (~121 clubs): Locator is fully JS-rendered with no API/JSON-LD. Needs browser-based extraction. This is the second-largest NL chain.
- **TrainMore** (25+ clubs): Locator is JS-rendered. Official Amsterdam page lists addresses but content is loaded dynamically.

**Phase 2 chains to investigate:**
- Big Gym (Amsterdam)
- Squash City (Amsterdam)
- Trainingsclub / regional NL chains
- Independent conventional gyms in major cities

## Proposed SAFE merge

**422** READY_TO_IMPORT rows are recommended for a later Netherlands production merge.

Expected catalog after that merge: **4855 + 422 = 5277**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.

## Scaling

Current live catalog: 4,855.
5,277 remains **comfortably inside** the current client-side architecture.

## Files

Created or updated under `data/netherlands/` and `scripts/`:

- `scripts/netherlands-phase1-discover.py`
- `scripts/netherlands-phase1-consolidate.py`
- `data/netherlands/netherlands_centers_staging.json`
- `data/netherlands/netherlands_geocode_review.json`
- `data/netherlands/netherlands_geocode_review.csv`
- `data/netherlands/netherlands_duplicate_analysis.json`
- `data/netherlands/NETHERLANDS_PHASE1_READINESS_REPORT.md`
- `data/netherlands/Gymly_Netherlands_All_Discovered_Centers.xlsx`
- `data/netherlands/Gymly_Netherlands_All_Discovered_Centers.csv`
- `data/netherlands/netherlands_geocode_cache.json`
- `data/netherlands/netherlands_discovery_combined.json`
- `data/netherlands/raw/` official HTML/JSON captures
- `data/netherlands/scrapes/` per-chain discovery JSON

**STOP. Do not merge Netherlands. Do not run Netherlands QA. Do not start another country.**
