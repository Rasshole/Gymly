# Netherlands Phase 2 Readiness Report

Generated: 2026-08-19 09:35 UTC

**Status: PHASE 2 COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified. Current production: 4,855 gyms. Netherlands production: 0.

## Phase 2 additions

### SportCity (~121 clubs)

- Official/current estimate: 121 clubs (sportcity.nl)
- Discovered: 129 (from vacatures.sportcity.nl complete club directory)
- Addresses recovered: 129 (all from official vacatures listing)
- Coordinates recovered: 117 (Nominatim geocoded)
- READY_TO_IMPORT: 117
- Unresolved: 12 (geocode failures / ambiguous)
- Legacy brand: Fit For Free (fully rebranded to SportCity October 2022)
- Source: vacatures.sportcity.nl/o/clubmanager-rijswijk (complete location dropdown with addresses)

### TrainMore (~50 clubs)

- Official/current estimate: ~50 clubs (Urban Gym Group 50th milestone announcement)
- Discovered: 54
- Addresses recovered: 54 (from sitemap, trainmore.com city pages, gymsearch.nl)
- Coordinates recovered: 49 (Nominatim geocoded)
- READY_TO_IMPORT: 49
- COMING_SOON: 2 (Amsterdam Amstel, Rotterdam Rijnhaven)
- Unresolved: 3 (geocode failures: Koningin Wilhelminaplein, Westerpark, Eindhoven Strijp-S)
- Red/Black Label tiers: tracked as metadata, NOT separate physical locations
- Source: trainmore.nl/sitemap.xml, trainmore.com club pages, gymsearch.nl

### Existing Phase 1 recovery

- Starting unresolved: 8 (5 NEEDS_COORDINATES + 3 NEEDS_REVIEW)
- Recovered: 1 (SportCity placeholder removed, replaced with 129 individual entries)
- Remaining unresolved: 7 (3 Anytime Fitness, 2 HealthCity, 2 Optisport)

### New chains (market gap audit)

- Chains investigated: BigGym, 365Fit, Happy Bodies
- Added: BigGym (15 open locations — conventional cardio+strength gym chain)
- Exact READY added: 15

## Overall

| Metric | Count |
|---|---:|
| Total NL staging rows | 628 |
| READY_TO_IMPORT | 603 |
| NEEDS_COORDINATES | 12 |
| NEEDS_REVIEW | 10 |
| COMING_SOON | 3 |
| CLOSED | 0 |

## Final counts

- Phase 1 READY: 422
- Phase 2 NEW READY: 181
- FINAL READY_TO_IMPORT: 603
- Final Netherlands staging total: 628
- NEEDS_COORDINATES: 12
- NEEDS_REVIEW: 10
- COMING_SOON: 3
- CLOSED: 0
- Projected production: 4,855 + 603 = **5,458**

## Chain table

| Chain | Discovered | READY | Unresolved |
|---|---:|---:|---:|
| Anytime Fitness | 135 | 132 | 3 |
| Basic-Fit | 252 | 251 | 1 |
| BigGym | 15 | 15 | 0 |
| Clubsportive | 1 | 1 | 0 |
| David Lloyd | 6 | 6 | 0 |
| HealthCity | 21 | 19 | 2 |
| Optisport | 9 | 7 | 2 |
| Snap Fitness | 6 | 6 | 0 |
| **SportCity** | **129** | **117** | **12** |
| **TrainMore** | **54** | **49** | **5** |

## Fit For Free / SportCity rebrand

Fit For Free was fully rebranded to SportCity in October 2022. The fitforfree.nl domain redirects to sportcity.nl. All 129 NL clubs are staged under brand=`SportCity` with `legacy_brand`=`Fit For Free`. No separate Fit For Free entries exist.

## Production safety

- `src/data/centers.json` unchanged: 4,855 gyms
- Netherlands in production: 0
- ID collisions with live catalog: 0
- `nl_*` IDs already in live catalog: 0

## Files changed

- `data/netherlands/netherlands_centers_staging.json` (updated — merged with 197 new entries)
- `data/netherlands/netherlands_geocode_review.json` (updated)
- `data/netherlands/netherlands_duplicate_analysis.json` (updated)
- `data/netherlands/NETHERLANDS_PHASE2_READINESS_REPORT.md` (created)
- `scripts/netherlands-phase2-consolidate.py` (created)
- `data/netherlands/netherlands_geocode_cache.json` (updated)

**STOP. Do not merge. Do not modify centers.json. Do not start another country.**
