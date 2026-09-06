# LATVIA PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**LATVIA STATUS: READY**

Country expansion: **UNLOCKED**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,542 |
| Latvia | 33 |
| lv_* | 33 |
| SHA256 | `287c1c54ef1023fee08d23c9a65063ffc238edbd35c59b22cea09c146833d8ea` |
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
| MyFitness | 15 |
| Lemon Gym | 8 |
| Gym! | 10 |
| **TOTAL** | **33** |

Unexpected brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| LATVIA_APPROVED_FOR_MERGE.json | 33 |
| LATVIA_PHASE2_READY_TO_IMPORT.json | 33 |
| Staging MERGED_INTO_CATALOG | 33 |
| Production Latvia | 33 |

Missing IDs: 0 · Unexpected IDs: 0 · Metadata drift: **NONE**

## Priority brand QA

| Brand | Result |
|-------|--------|
| MyFitness 15 | PASS — City Fitness 0 / People Fitness 0 |
| Lemon Gym 8 open | PASS — Ziepniekkalns `lv_eb2ad44f7d` COMING_SOON live = 0 |
| Gym! 10 (Rīga 9 + Daugavpils 1) | PASS — Gym+ contamination 0 |

## Coming-soon / exclusions

COMING_SOON staging **1** / production **0**  
EXCLUDED staging **12** / production **0**  
Ziepniekkalns absent from production, nearest, onboarding, map live set.

## Duplicate / proximity

All hard flags = **0** (≤25/50/100/200 m same-brand, identical coords, same-address, different-brand ≤100 m).

## Border safety

Foreign contamination = **0** (Lithuania / Estonia / Russia / Belarus).  
`lt_*` unchanged (61). No Gym+/Impuls Latvia import.

## Search / flows

Brands, cities (incl. ASCII fold), postcodes, onboarding, profile, nearest, map, 200 m check-in, auto-checkout, core ID resolution, orphan `lv_nonexistent_test` → Latvia stub: **PASS**

Note: query `Gym!` may also surface Lemon Gym via shared “gym” token; Gym+ never appears in Latvia-scoped results.

## Regional coverage

Rīga **32** · Daugavpils **1**  
Zero Class A: Liepāja, Jelgava, Jūrmala, Ventspils, Rēzekne, Valmiera, Jēkabpils, Ogre → `A_legitimate_no_chain_presence`

## Country regression

26 countries intact; LT 61 unchanged; LV 33; total **11,542**.

## Performance

See `LATVIA_QA_PERF.json` — catalog 11,542 / ~3.42 MB / assessment **healthy** / architecture **KEEP CLIENT-SIDE**.

## Global scale

Catalog **11,542** · 12,500 crossed **NO** · Global Stress QA required **NO** · Country expansion **UNLOCKED**

## Bugs found / fixed

None.
