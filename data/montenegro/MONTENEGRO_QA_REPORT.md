# MONTENEGRO QA REPORT

## Verdict

**MONTENEGRO STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: 11775
- Montenegro: 26
- me_*: 26
- SHA256: `2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698`
- Production modified: NO
- QA_SHA_BEFORE == QA_SHA_AFTER: YES

## Gates

- Reconciliation: 26 == 26 == 26 == 26
- Eligibility: CHAIN_CLASS_A 0 / SMALL_MARKET_INDEPENDENT 26
- Metadata drift: NONE
- Excluded / hotel / specialist leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN (HR 0 / BA 0 / RS 0 / AL 0 / XK 0)
- Defended no-gym: Tivat / Bijelo Polje / Rožaje (intentional 0)
- Check-in: 199 allow / 200 allow / 201 block · auto-checkout 200 m
- Architecture: KEEP CLIENT-SIDE

## Live inventory (26)

### Podgorica (11)

1. The Capital Fitness Center Podgorica (`me_54169ac803`)
2. SRD Athletic Podgorica (`me_aebbd15856`)
3. Benex Fitness Unique Capital Plaza (`me_c220315889`)
4. Benex Fitness Stari Aerodrom (`me_27a3463ee9`)
5. Urban Gym Podgorica (`me_9eeaa4aa02`)
6. GO GYM Podgorica (`me_4b2e8c0669`)
7. XL Sport Studio Podgorica (`me_5b75a6d116`)
8. Hulk 23 Podgorica (`me_eaf8aa192f`)
9. Soko Gym Morača (`me_9c7043893c`)
10. Soko Gym City (`me_6ac0b00f40`)
11. Gym Box Podgorica (`me_c7dbad6462`)

### Other cities (15)

12. City Fitness Dom Revolucije Nikšić (`me_c945ad2b04`)
13. Status Fitness Studio Nikšić (`me_894d0a07f8`)
14. Positive Fitness Budva (`me_84ef15d2b4`)
15. EthnoGym Budva TQ Plaza (`me_0ca0ffcb7a`)
16. Fitness Original Budva (`me_1064e5ae96`)
17. Teretana Big Body Bar (`me_fe03c93cd3`)
18. Maximus Gym & Fitness Bar (`me_fe06373212`)
19. Terzo Teretana Herceg Novi (`me_1567286ea5`)
20. Terzo Premium Igalo (`me_65ecc20366`)
21. Čeličana Igalo (`me_a36e3e5b34`)
22. SC Berane Teretana (`me_f984998247`) — A_PUBLIC_CONVENTIONAL_GYM
23. Teretana Numero 77 Dobrota (`me_36bf06afd9`)
24. Matrix Gym Nox Ulcinj (`me_9c83615ab5`)
25. Herkul Gym Cetinje (`me_dc68a23f3b`)
26. Strong Gym Pljevlja (`me_3aa6c0aa5d`)

## Identity decisions preserved

- Urban ≠ GO GYM (~95 m apart; distinct IDs/premises)
- Soko Morača ≠ Soko City
- Capital Fitness ↔ Benex Capital Plaza dense pair (~14 m) retained as distinct
- City Fitness Dom Revolucije current; Pete proleterske absent
- Benex / Soko / Terzo remain SMALL_MARKET_INDEPENDENT (not Class A)

## Performance

From `MONTENEGRO_QA_PERF.json` (suite run; cold index is noisy):

- JSON: 3.491 MB (3660637 bytes)
- Parse: ~15 ms
- Cold index: ~1992 ms
- Cached index: 0 ms
- Typical ME search: ~1 ms
- Worst ME search: ~5 ms
- Nearest: ~0 ms
- Map viewport: ~0 ms
- Assessment: **HEALTHY**
- Architecture: KEEP CLIENT-SIDE

Comparable to Moldova QA baseline (same catalog size / JSON bytes; no material regression).

## Global scale

- Catalog: 11775
- Crossed 12,500: NO
- Global Stress QA required: NO
- Country expansion: UNLOCKED

## Bugs

- BUGS FOUND: NONE
- BUGS FIXED: NONE

## Tests

- `__tests__/montenegroGymQa.test.ts` — PASS
- Montenegro merge / Phase1 / Phase2 — PASS
- Moldova / San Marino / Monaco / Andorra / Liechtenstein / Iceland / Cyprus merge + GymQa — PASS (18 suites / 226 tests)
