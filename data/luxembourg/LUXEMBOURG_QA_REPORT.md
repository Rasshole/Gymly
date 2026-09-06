# LUXEMBOURG PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**LUXEMBOURG STATUS: READY**

Country expansion: **UNLOCKED**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11630 |
| Luxembourg | 20 |
| lu_* | 20 |
| SHA256 | `45999725147f8ab12d85eccf19b8d755709d4c3234456665c2ab7eec0c133e78` |
| Production modified | NO |

## Catalog integrity

Hard defects: **0**

- Duplicate IDs: 0
- Invalid postcodes: 0
- Missing fields: 0
- Invalid coordinates: 0
- Fallback coordinates: 0
- Foreign outliers: 0
- Mojibake: 0

## Brand breakdown

| Brand | Count |
|-------|------:|
| Basic-Fit | 10 |
| JIMS | 6 |
| CK Fitness | 4 |
| **TOTAL** | **20** |

Unexpected brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| LUXEMBOURG_APPROVED_FOR_MERGE.json | 20 |
| LUXEMBOURG_PHASE2_READY_TO_IMPORT.json | 20 |
| Staging MERGED_INTO_CATALOG | 20 |
| Production Luxembourg | 20 |

Missing IDs: 0 · Unexpected IDs: 0 · Metadata drift: **NONE**

## Priority brand QA

| Brand | Result |
|-------|--------|
| Basic-Fit 10 | PASS — Foetz `lu_dc1931d263` live once |
| JIMS 6 | PASS — Foetz `lu_7bf8591421` COMING_SOON withheld |
| CK Fitness 4 | PASS — Bertrange / Esch / Junglinster / Mersch |

## Foetz QA

Basic-Fit Foetz LIVE = yes · JIMS Foetz LIVE = no · CASE A retained · **PASS**

## Painworld / rebrand

Painworld live = 0 · JIMS Gasperich = 1 · **PASS**

## Junck QA

Basic-Fit Junck 12 ↔ JIMS Gare Junck 11 ~57 m · A_legitimate_adjacent · both live · **PASS**

## Coming-soon / exclusions

COMING_SOON staging **1** / production **0**  
EXCLUDED staging **18** / production **0**

## Duplicate / proximity

Hard same-brand ≤25/50/100 m = **0** · identical = **0**  
Different-brand ≤100 m = **1** (Junck) · **A_legitimate**

## Border safety

Belgium / France / Germany contamination = **0**

## Performance

Catalog: 11630 · JSON: 3.45 MB · parse: 35 ms · cold index: 4525 ms · typical search: 163.67 ms · assessment: **healthy**  
Architecture: **KEEP CLIENT-SIDE** · Global Stress QA: **NO** · Expansion: **UNLOCKED**

## Production freeze

SHA before == SHA after: `45999725147f8ab12d85eccf19b8d755709d4c3234456665c2ab7eec0c133e78`
