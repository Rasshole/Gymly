# LITHUANIA PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**LITHUANIA STATUS: READY**

Country expansion: **UNLOCKED**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,509 |
| Lithuania | 61 |
| lt_* | 61 |
| SHA256 | `3ab2fb07f7f8748872f7345a57bc5f31c27bf7bc5709b16420cce33b73a85142` |

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
| Gym+ | 38 |
| Lemon Gym | 18 |
| Impuls | 5 |
| **TOTAL** | **61** |

Unexpected brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| LITHUANIA_APPROVED_FOR_MERGE.json | 61 |
| LITHUANIA_PHASE2_READY_TO_IMPORT.json | 61 |
| Staging MERGED_INTO_CATALOG | 61 |
| Production Lithuania | 61 |

Missing IDs: 0 · Unexpected IDs: 0 · Metadata drift: **NONE**

## Gym+ special QA

| Case | Result |
|------|--------|
| Vytauto Pociūno `lt_6ddca417a2` / 06264 | PASS |
| Gardino singleton `lt_5b1f24ce40` | PASS (exactly 1) |
| Viršuliškių live | 0 (COMING_SOON) |
| VS Fitness / People Fitness / MyFitness | 0 live |

## Lemon Gym / Impuls

- Lemon Gym open: 18 · Riešė/Jonava live: 0
- Impuls: 5 · brands remain distinct

## Coming-soon / exclusions

COMING_SOON staging (3) and EXCLUDED (6) all absent from production.

## Duplicate / proximity

All hard flags = **0** (≤25/50/100/200 m same-brand, identical coords, same-address, different-brand ≤100 m).

## Border safety

Foreign contamination = **0** (Latvia / Poland / Belarus / Kaliningrad / Estonia).

## Search / flows

Brand, city (native + ASCII), postcode, onboarding, favorites, nearest, map viewport, check-in 200 m, auto-checkout 200 m, core ID resolution, orphan `lt_nonexistent_test` → Lithuania stub: **PASS**

## Regional coverage

Matches Phase 2 footprint. Jonava / Utena / Tauragė = `A_legitimate_no_chain_presence`.

## Performance

See `LITHUANIA_QA_PERF.json`. Catalog 11,509 / ~3.41 MB. Architecture: **KEEP CLIENT-SIDE**. No material regression vs Slovenia QA (11,448 / ~3.39 MB).

## Global scale

| | |
|--|--|
| Catalog | 11,509 |
| >12,500 crossed | NO |
| Global Stress QA required | NO |
| New global-scale blocker | NO |
| Country expansion | UNLOCKED |

## Production modified

**NO** — QA found no production defects requiring repair.

## Bugs found

None.

## Remaining risks

Non-blocking coming-soon pipeline only (Viršuliškių Gym+, Lemon Riešė, Lemon Jonava).
