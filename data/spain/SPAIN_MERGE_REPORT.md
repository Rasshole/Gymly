# Spain Merge Report

Generated: 2026-08-21T07:28:12.023Z

## Status
**MERGED** — inserted 976.

Source of truth: `SPAIN_FINAL_SAFE_TO_MERGE.json` (**FINAL 976**, not the superseded 978 candidate set).

## Summary
- **Final safe file count:** 976
- **Phase4 READY cross-check:** 976
- **Expected insert:** 976
- **Before:** 7167 centers (Spain: 0)
- **Inserted:** 976
- **After:** 8143 (Spain: 976)
- **Pre-merge SHA256:** `9495c7a83a395d34d5cff5d7476b16fcdb2541124edf751e0f5f936500b0afc1`
- **Idempotency second run:** 0 inserted

## Exclusions (must NOT be in Spain production)
- **Mesa y López** (`es_e13a21a4c1`): staging=COMING_SOON; in_catalog=false; in_final_safe=false
- **Forus Porto** (`es_42caeb0614`): staging=NEEDS_REVIEW country=Portugal; in_spain_catalog=false; in_final_safe=false

## Withheld / Rejected
- None (all FINAL 976 validated and inserted)

## Brand Breakdown (Spain live)
- VivaGym: 246
- Basic-Fit: 238
- Synergym: 142
- Fitness Park: 114
- Anytime Fitness: 57
- Forus: 47
- BeOne: 25
- DIR: 22
- Holiday Gym: 22
- Dreamfit: 20
- Enjoy!: 18
- GO fit: 13
- Altafit: 5
- Eurofitness: 3
- Metropolitan: 3
- O2 Centro Wellness: 1
- **Total:** 976

## Validation
- Duplicate IDs in catalog: 0
- Same-brand physical duplicates (<100m) post-merge: 0
- Encoding issues (mojibake): 0
- Postal format OK: true
- Leading-zero postcodes: 252

## Geography
- mainland: 940
- balearic: 14
- canary: 22
- ceuta: 0
- melilla: 0
- outlier: 0
- Outliers: 0

## Spanish Encoding Preserved
- a_acute: 183
- e_acute: 97
- i_acute: 176
- o_acute: 230
- u_acute: 36
- u_diaeresis: 6
- n_tilde: 82
- c_cedilla: 12

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
| France | 1712 | 1712 | ✓ |
| Spain | 0 | 976 | — |

## Staging Categories
- MERGED_INTO_CATALOG: 976
- NEEDS_COORDINATES: 92
- DUPLICATE: 64
- NEEDS_REVIEW: 3
- COMING_SOON: 5

## 10K Checkpoint
- Live: 8143
- Headroom to 10k: 1857
- Stress QA: NO

## Check-in / Auto-checkout
- CHECK_IN_RADIUS_METERS: 200 (unchanged)
- AUTO_CHECKOUT: unchanged

## Duplicate Analysis
- Skipped (existing ID): 0
- Skipped (same addr+brand): 0
- Skipped (proximity <100m): 0
