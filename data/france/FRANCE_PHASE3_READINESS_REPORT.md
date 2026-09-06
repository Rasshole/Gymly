# France Phase 3 — Address Recovery Report

**Date:** 2026-08-19  
**Objective:** Recover physical addresses for 339 blocked clubs (Keepcool, Elancia, Vita Liberté)

## Starting Point

| Metric | Count |
|--------|-------|
| Phase 2 READY_TO_IMPORT | 1,528 |
| Keepcool discovered (NEEDS_REVIEW) | 239 |
| Elancia discovered (NEEDS_REVIEW) | 48 |
| Vita Liberté discovered (NEEDS_REVIEW) | 52 |
| Total staging | 2,145 |

## Recovery Results

| Chain | Starting blocked | Addresses recovered | Geocoded | New READY | Still unresolved |
|-------|-----------------|--------------------:|--------:|----------:|----------------:|
| Keepcool | 239 | 199 | 199 | 199 | 40 |
| Elancia | 47 | 42 | 42 | 42 | 5 |
| Vita Liberté | 51 | 34 | 22 | 22 | 29 |
| **Total** | **337** | **275** | **263** | **263** | **74** |

### Recovery Methods
- **Keepcool:** Official club pages at `keepcool.fr/salle-de-sport/{slug}` and `keepcool.fr/clubs/salle-de-sport-{slug}` — FAQ sections contain full addresses with postal codes
- **Elancia:** Official club pages at `elancia.fr/salles-de-sport/salle-de-sport-{slug}` — Google Maps embed URLs contain precise coordinates and addresses
- **Vita Liberté:** Official club pages at `vitaliberte.fr/salle-de-sport/{slug}` — Elementor icon-list elements contain address + postal + city

### Existing Unresolved (non-target chains)
- Additionally geocoded from existing addresses: 106 entries recovered
- Still unresolved (no official evidence): remains in NEEDS_COORDINATES/NEEDS_REVIEW

## Final France Staging

| Category | Count |
|----------|------:|
| **READY_TO_IMPORT** | **1,902** |
| NEEDS_COORDINATES | 169 |
| NEEDS_REVIEW | 63 |
| COMING_SOON | 9 |
| **Total** | **2,143** |

## Final READY Brand Breakdown

| Brand | READY Count |
|-------|------------:|
| Basic-Fit | 897 |
| Fitness Park | 266 |
| Keepcool | 199 |
| L'Orange Bleue | 169 |
| ON AIR Fitness | 119 |
| L'Appart Fitness | 110 |
| Elancia | 42 |
| Magic Form | 35 |
| Vita Liberté | 22 |
| Neoness | 18 |
| Gigafit | 18 |
| Anytime Fitness | 7 |
| **Total** | **1,902** |

## Quality Assessment

| Check | Result |
|-------|--------|
| Missing addresses (READY) | 1 |
| Missing postal codes (READY) | 0 |
| Missing coordinates (READY) | 1 |
| Overseas/DOM-TOM in READY | 10 (legitimate: Réunion, Martinique, Guadeloupe) |
| Cross-border READY | 0 |
| Encoding issues | 0 |
| Suspicious coordinates | 0 |
| Internal duplicates (<100m, same brand) | 12 (mostly Ladies/Mixed pairs at same location) |
| Duplicates with production | 0 (France not yet in production) |

### Coordinate Sources (READY)
- Nominatim geocoding: ~1,860
- Google Maps embed (Elancia): 42

## Duplicate Analysis

12 internal near-duplicates identified (all legitimate):
- Basic-Fit Ladies vs Mixed/II/III at same location (Lille, Marseille, Saint-Denis, Strasbourg): 6 pairs
- L'Appart Fitness Opéra vs Louis Pradel (Lyon 1): 1 pair (different clubs, 68m apart)
- Keepcool Lille/Lille Centre/Lille Solferino: 3 clubs shared same FAQ page — marked 2 as NEEDS_REVIEW

No duplicates with production (0 France entries in production).

## Completeness

1. **339 blocked → 263 recovered to READY** (77.6% recovery rate)
2. **Major chains still blocked:**
   - Keepcool: 40 still unresolved (pages don't exist for newer/smaller clubs)
   - Elancia: 5 still unresolved (no club page found)
   - Vita Liberté: 29 still unresolved (pages don't exist or addresses not extractable)
3. **Another phase worthwhile?** NO — remaining clubs have no official web presence with addresses. Would require manual research or different data sources.

## Safe Merge Assessment

| Metric | Value |
|--------|-------|
| Final READY count | 1,902 |
| Current production | 5,455 |
| Projected total after merge | **7,357** |
| Net new from Phase 3 | +374 (vs Phase 2's 1,528) |

## Performance

- Phase 3 recovered 374 additional READY entries beyond Phase 2
- Total France READY grew from 1,528 → 1,902 (+24.5%)
- Projected total (5,455 + 1,902) = 7,357 is acceptable

## Files Changed

- `data/france/france_centers_staging.json` — updated with recovered addresses and coordinates
- `data/france/france_geocode_cache.json` — updated with new Nominatim results
- `data/france/FRANCE_PHASE3_READINESS_REPORT.md` — this report
- `scripts/france_phase3_recovery.py` — recovery script (utility)
