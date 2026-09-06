# ALBANIA PRODUCTION QA REPORT

## Verdict

**ALBANIA STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: 11,840
- Albania: 9
- al_*: 9
- SHA256: `a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0`
- Production modified: NO
- QA_SHA_BEFORE == QA_SHA_AFTER: YES

## Gates

- Reconciliation: 9 == 9 == 9 == 9
- Eligibility: CHAIN_CLASS_A 0 / SMALL_MARKET_INDEPENDENT 9
- Classifications: WELLNESS_ADDITIVE 1 / A_CONVENTIONAL_PUBLIC_GYM 8
- Metadata drift: NONE
- Excluded / hotel / specialist / institutional leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN (ME 0 / XK 0 / MK 0 / GR 0)
- Defended no-gym cities: 24 inspected localities (intentional 0)
- Check-in: 199 allow / 200 allow / 201 block · auto-checkout 200 m
- Architecture: KEEP CLIENT-SIDE

## Live inventory (9)

### Tirana (5)

1. Repeat Wilson Tirana (`al_2002d5b349`) — WELLNESS_ADDITIVE
2. Repeat TEG Tirana (`al_4c11873a38`)
3. Flex Gym Tirana (`al_36c04c3f26`)
4. Fitness Zone Tirana (`al_9ccb45b0ac`)
5. Cheops Gym Tirana (`al_63db3f3a75`) — rebrand from Premium Gym

### Durrës (2)

6. Illyrian Fitness Durrës (`al_a153565f54`)
7. Nandos Gym Durrës (`al_9cf7944b63`)

### Vlorë (1)

8. Nirvana Fitness Club Vlorë (`al_33f34e6832`) — rebrand from generic placeholder

### Shkodër (1)

9. Fitness Center XXL Shkodër (`al_ee54d79fc0`) — rebrand from generic placeholder

## Identity decisions preserved

- Repeat Wilson + TEG = 2 conventional sites; Nobis EXCLUDED (spa-primary)
- Repeat estate NOT Class A (2 sites below threshold)
- Flex Gym Tirana only; Flex Classes / Green Coast EXCLUDED
- Planet Fitness Albania = 0 (local + Korçë platform both EXCLUDED)
- Sporti Pallati institutional EXCLUDED
- Repeat Wilson WELLNESS_ADDITIVE allowed (not spa-primary leakage)

## Staging

| Status | Count |
|--------|-------|
| MERGED_INTO_CATALOG | 9 |
| EXCLUDED | 81 |
| READY_TO_IMPORT | 0 |

## Performance

From `ALBANIA_QA_PERF.json`:

- JSON: 3.511 MB (3,681,576 bytes)
- Parse: ~17 ms
- Cold index: ~2,052 ms (noisy; suite run)
- Cached index: 0 ms
- Typical Albania search: ~0 ms
- Assessment: HEALTHY
- Below 12,500 threshold: YES

## Tests

- `albaniaGymQa`: 12/12 pass
- Full regression suite: 283/283 pass

## Bugs

- Found: NONE
- Fixed: NONE

## Files

- `__tests__/albaniaGymQa.test.ts`
- `data/albania/ALBANIA_QA_REPORT.md`
- `data/albania/ALBANIA_QA_SUMMARY.md`
- `data/albania/ALBANIA_QA_PERF.json`
- `data/albania/ALBANIA_QA_SHA_BEFORE.txt`
- `data/albania/ALBANIA_QA_SHA_AFTER.txt`

Production catalog (`src/data/centers.json`) was not modified during QA.
