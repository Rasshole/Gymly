# KOSOVO PRODUCTION QA REPORT

## Verdict

**KOSOVO STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: 11,858
- Kosovo: 18
- xk_*: 18
- SHA256: `f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5`
- Production modified during QA: **NO**
- KOSOVO_QA_SHA_BEFORE == KOSOVO_QA_SHA_AFTER: **YES**

## Gates

- Reconciliation: 18 == 18 == 18 == 18
- Eligibility: CHAIN_CLASS_A 12 / SMALL_MARKET_INDEPENDENT 6
- Classifications: WELLNESS_ADDITIVE 1 / A_CONVENTIONAL_PUBLIC_GYM 17
- Metadata drift: NONE
- Excluded / hotel / specialist / institutional leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN (AL 0 / ME 0 / MK 0 / RS 0)
- Defended no-gym cities: 22 inspected localities (intentional 0)
- Check-in: 199 allow / 200 allow / 201 block · auto-checkout 200 m
- Architecture: KEEP CLIENT-SIDE
- Global Stress QA: NOT REQUIRED / NOT RUN

## Live inventory (18)

### Prishtina (13)

1. Fitness Gym Prishtina (`xk_500cfd9387`) — SMI
2. Five Star Fitness Grand Hotel (`xk_4d98941de0`) — Class A, WELLNESS_ADDITIVE
3. Five Star Fitness Bregu i Diellit (`xk_97a7085d4d`) — Class A
4. Five Star Fitness Arbëria (`xk_c701eda0ff`) — Class A
5. Lets Go Gym Te Qafa (`xk_fc7b6a8c67`) — Class A
6. Lets Go Gym Royal Mall (`xk_da9309622a`) — Class A
7. Lets Go Gym Rruga B (`xk_e06cd03b2e`) — Class A
8. Lets Go Gym Kodra e Diellit (`xk_4ac1e78ed4`) — Class A
9. Flex Gym (`xk_ae58d8d928`) — SMI
10. PowerGym (`xk_bda33fc345`) — SMI
11. Fitness Feimi (`xk_b434775de1`) — SMI
12. Fit In Gym (`xk_b3ba8d5cb9`) — SMI
13. Fitness Zone (`xk_d2868682b1`) — SMI, Haxhi Zeka Nr. 25

### Fushë Kosovë (1)

14. Five Star Fitness Fushë Kosovë (`xk_1d7af5ff10`) — Class A

### Prizren (2)

15. Five Star Fitness Prizren (`xk_d722f14213`) — Class A
16. Lets Go Gym Prizren (`xk_9374a45e65`) — Class A

### Gjilan (1)

17. Five Star Fitness Gjilan (`xk_db35d316aa`) — Class A

### Ferizaj (1)

18. Five Star Fitness Ferizaj (`xk_87bda6987b`) — Class A

## Identity decisions preserved

- Five Star Fitness = 7 branches (Grand Hotel WELLNESS_ADDITIVE allowed)
- Lets Go Gym = 5 branches
- Fitness Zone = 1 (Haxhi Zeka only); City Mall + Dardania EXCLUDED
- Fitness Gym Prishtina = commercial SMI (not municipal)
- Pallati Prizren EXCLUDED (municipal)
- Swiss Diamond / Theranda / Brekovac EXCLUDED (hotel/spa-primary)
- No separate North Kosovo prefix model
- No fabricated rows in defended A-gap localities

## Staging

| Status | Count |
|--------|-------|
| MERGED_INTO_CATALOG | 18 |
| EXCLUDED | 85 |
| READY_TO_IMPORT | 0 |
| NEEDS_REVIEW | 0 |
| NEEDS_COORDINATES | 0 |
| CLOSED | 0 |
| **Total** | **103** |

## Prior-country regression

| Country | Count |
|---------|------:|
| Albania | 9 |
| Bosnia and Herzegovina | 31 |
| North Macedonia | 25 |
| Montenegro | 26 |
| Moldova | 28 |
| San Marino | 6 |
| Monaco | 4 |
| Andorra | 12 |
| Liechtenstein | 7 |
| Iceland | 27 |

Only Kosovo changed from merge (0 → 18). All prior counts unchanged.

## Performance

From `KOSOVO_QA_PERF.json`:

- JSON: 3.516 MB (3,687,108 bytes)
- Parse: ~14 ms
- Cold index: ~2,140 ms (suite run; machine variance expected)
- Cached index: 0 ms
- Typical Kosovo search: ~1 ms
- Assessment: **HEALTHY**

## Tests

321/321 passed across Kosovo QA + merge safety + phase staging + all prior-country suites.

## Bugs

- Found: NONE
- Fixed: NONE

## SHA

| | SHA256 |
|---|--------|
| QA before | `f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5` |
| QA after | `f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5` |

Production byte-for-byte unchanged throughout QA.
