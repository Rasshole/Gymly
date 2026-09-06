# BOSNIA & HERZEGOVINA QA REPORT

## Verdict

**BOSNIA & HERZEGOVINA STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: 11,831
- Bosnia & Herzegovina: 31
- ba_*: 31
- SHA256: `5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e`
- Production modified during QA: NO
- QA_SHA_BEFORE == QA_SHA_AFTER: YES

## Gates

- Reconciliation: 31 == 31 == 31 == 31
- Eligibility: CHAIN_CLASS_A 7 / SMALL_MARKET_INDEPENDENT 24
- Metadata drift: NONE
- ALL IN FITNESS: 3/3 · Kron Fitness: 4/4
- Excluded / municipal / hotel / specialist / institutional leakage: 0
- Hard duplicates: 0 · Rebrand conflicts: 0
- Cross-border: CLEAN (HR 0 / RS 0 / ME 0)
- NW FBiH gate: Bihać + Cazin pass territorial validation
- Defended no-gym localities: Gradačac, Lukavac, Visoko, Konjic, Bugojno, Jajce, Livno (intentional 0)
- Check-in: 199 allow / 200 allow / 201 block · auto-checkout 200 m · no BA-specific override
- Architecture: KEEP CLIENT-SIDE
- Global Stress QA: NOT REQUIRED (11,831 < 12,500)

## Live inventory (31)

### Sarajevo (10)

1. ALL IN FITNESS Malta Paromlinska (`ba_0ace57c4b2`) — CHAIN_CLASS_A
2. ALL IN FITNESS Ilidža (`ba_383806522f`) — CHAIN_CLASS_A
3. ALL IN FITNESS Bingo City Centar (`ba_0bf4cc7be5`) — CHAIN_CLASS_A
4. Avalon Fitness (`ba_fa6f3c8b99`) — SMI · WELLNESS_ADDITIVE
5. BTC Fitness (`ba_f63cafd3fe`) — SMI
6. Body Art (`ba_e6bae3c12c`) — SMI
7. Fitness Centar Mojmilo (`ba_760fbe82ce`) — SMI
8. Extreme Fitness (`ba_d705f4fca7`) — SMI
9. Fitness Zone (`ba_605d38b631`) — SMI
10. Olympic Gym (`ba_5fd8cc9b20`) — SMI

### Banja Luka (3)

11. Fitness Centar 4Life (`ba_1e88b67b77`)
12. Xtreme Fit (`ba_d10bc012e8`)
13. Fit Artemida (`ba_446902cbcb`)

### Tuzla (2)

14. Kron Fitness Tuzla Zlokovac (`ba_4b2b262dac`) — CHAIN_CLASS_A
15. Slavinovici Teretana (`ba_82f2fa3809`)

### Kron regional (3)

16. Kron Fitness Živinice (`ba_234269c33b`) — CHAIN_CLASS_A
17. Kron Fitness Srebrenik (`ba_fbb6ab9577`) — CHAIN_CLASS_A
18. Kron Fitness Gračanica (`ba_6e8f727eb6`) — CHAIN_CLASS_A

### Mostar (2)

19. Fitness Centar Mostar (`ba_957417e083`)
20. Iron Gym (`ba_0116ad0cd5`)

### Single-site markets (11)

21. Fitness Centar Zenica (`ba_5a82ca68bf`)
22. Fitness Centar Bijeljina (`ba_deeabeda92`)
23. Fitness Bihać (`ba_7aeec79730`)
24. Teretana Prijedor (`ba_7d8fd80b4a`)
25. Fitness Doboj (`ba_21c2e65f54`)
26. Fitness Trebinje (`ba_7612d3d4c2`)
27. Fitness Travnik (`ba_342f507ce7`)
28. Fitness Goražde (`ba_23287d2052`)
29. Fitness Istočno Sarajevo (`ba_64b95bab44`)
30. Fitness Cazin (`ba_bc60505bc2`)
31. Fitness Brčko (`ba_ba510b2696`)

## Prior countries (unchanged)

MK 25 · ME 26 · MD 28 · SM 6 · MC 4 · AD 12 · LI 7 · IS 27

## Performance

- JSON: 3.508 MB · parse ~32 ms
- Assessment: HEALTHY
- See `BOSNIA_HERZEGOVINA_QA_PERF.json`

## Tests

- `bosniaHerzegovinaGymQa.test.ts`: 14/14 PASS
- Full regression suite: 263/263 PASS

## Bugs

NONE
