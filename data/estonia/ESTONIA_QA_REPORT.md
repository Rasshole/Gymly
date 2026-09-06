# ESTONIA PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**ESTONIA STATUS: READY**

Country expansion: **UNLOCKED**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,610 |
| Estonia | 68 |
| ee_* | 68 |
| SHA256 | `54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb` |
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
| MyFitness | 19 |
| 24-7 Fitness | 31 |
| Gym! | 15 |
| Golden Club | 3 |
| **TOTAL** | **68** |

Unexpected brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| ESTONIA_APPROVED_FOR_MERGE.json | 68 |
| ESTONIA_PHASE2_READY_TO_IMPORT.json | 68 |
| Staging MERGED_INTO_CATALOG | 68 |
| Production Estonia | 68 |

Missing IDs: 0 · Unexpected IDs: 0 · Metadata drift: **NONE**

## Priority brand QA

| Brand | Result |
|-------|--------|
| MyFitness 19 | PASS — Volta + Narva Fama live; LV MyFitness remains 15; no `lv_*` reuse |
| 24-7 Fitness 31 | PASS — Tabasalu, Keila Keskus, Sepa, Viljandi Kaalu, Rakvere, Narva, Võru, Jõgeva present once |
| Gym! 15 | PASS — Gym+ contamination 0; no `lt_*` reuse |
| Golden Club 3 | PASS — Tondi (Sõjakooli 10) present |

## Coming-soon / exclusions

COMING_SOON staging **11** / production **0**  
EXCLUDED staging **20** / production **0**  
Lemon Gym / People Fitness / Gym+ / Impuls production = **0**

## Duplicate / proximity

Hard flags ≤25/50/100 m = **0** · identical = **0** · same-address = **0** · different-brand ≤100 m = **0**  
Same-brand ≤200 m = **1** — MyFitness Viru ↔ Postimaja ~144 m — **A_legitimate**

## Border safety

Foreign contamination = **0** (Latvia / Lithuania / Finland / Russia).  
`lv_*` = 33 · `lt_*` = 61 unchanged.

## Search / flows

Brands, cities (incl. ASCII fold Pärnu/Jõhvi/Võru), postcodes, onboarding, profile/favorites, nearest, map, 200 m check-in, auto-checkout, workout/history/feed ID resolution, orphan `ee_nonexistent_test` → Estonia stub: **PASS**  
Gym! scoped results never Gym+.

## Country regression

DK 354 · SE 639 · NO 535 · DE 1424 · UK 1474 · FI 429 · NL 600 · FR 1712 · ES 976 · IT 588 · BE 363 · PL 621 · AT 335 · CH 475 · PT 247 · GR 106 · IE 65 · CZ 70 · HU 50 · RO 154 · SK 37 · BG 82 · HR 80 · SI 32 · LT 61 · LV 33 · **EE 68** · **TOTAL 11,610**

## Performance

See `ESTONIA_QA_PERF.json`. Architecture: **KEEP CLIENT-SIDE**. Under 12,500 — Global Stress QA **not** required.

## Bugs

Found: **None**  
Fixed: **None**

## Final SHA

`54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb` — unchanged.
