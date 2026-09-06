# France Merge Report

## Summary
- **Before:** 7167 centers (France: 1712)
- **After:** 7167 centers (France: 1712)
- **Inserted:** 0
- **Dry run:** false
- **Idempotency check:** true

## Brand Breakdown
- Basic-Fit: 892
- Fitness Park: 266
- Keepcool: 197
- L'Orange Bleue: 169
- L'Appart Fitness: 109
- Elancia: 28
- Vita Liberté: 22
- ON AIR Fitness: 20
- Anytime Fitness: 3
- Gigafit: 3
- Magic Form: 2
- Neoness: 1
- **Total:** 1712

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m): 0
- Close clusters (100-200m): 0
- Encoding issues (mojibake): 0
- Metropolitan outliers: 0
- Overseas entries: 7 (Guadeloupe, Martinique, Réunion)

## French Encoding Preserved
- e_acute: 818
- e_grave: 285
- e_circ: 23
- e_diaeresis: 11
- a_grave: 4
- a_circ: 66
- c_cedilla: 50
- i_circ: 13
- i_diaeresis: 1
- o_circ: 40
- u_grave: 0
- u_circ: 7
- oe: 5
- ae: 0

## Country Integrity
| Country | Before | After | Intact |
|---------|--------|-------|--------|
| Denmark | 354 | 354 | ✓ |
| Sweden | 639 | 639 | ✓ |
| Norway | 535 | 535 | ✓ |
| Finland | 429 | 429 | ✓ |
| Germany | 1424 | 1424 | ✓ |
| United Kingdom | 1474 | 1474 | ✓ |
| Netherlands | 600 | 600 | ✓ |

## Rejected
- not_ready: 1953
- missing_address: 1
- not_active: 168

## Staging Categories After Merge
- MERGED_INTO_CATALOG: 1712
- COMING_SOON: 9
- READY_TO_IMPORT: 190
- NEEDS_REVIEW: 63
- NEEDS_COORDINATES: 169

## Duplicate Analysis
- Skipped (existing ID): 0
- Skipped (same addr+brand): 15
- Skipped (proximity <100m): 6
