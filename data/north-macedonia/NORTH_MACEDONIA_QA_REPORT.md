# NORTH MACEDONIA QA REPORT

## Verdict

**NORTH MACEDONIA STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: 11,800
- North Macedonia: 25
- mk_*: 25
- SHA256: `6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112`
- Production modified during QA: NO
- QA_SHA_BEFORE == QA_SHA_AFTER: YES

## Gates

- Reconciliation: 25 == 25 == 25 == 25
- Eligibility: CHAIN_CLASS_A 0 / SMALL_MARKET_INDEPENDENT 25
- Metadata drift: NONE
- Excluded / hotel / specialist / institutional Fit One leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN (GR 0 / XK 0 / RS 0 / BG 0 / AL 0)
- Defended no-gym localities: Saraj, Šuto Orizari, Gjorče Petrov, Veles, Kavadarci, Kočani, Gevgelija, Debar, Radoviš (intentional 0)
- Check-in: 199 allow / 200 allow / 201 block · auto-checkout 200 m · no MK-specific override
- Architecture: KEEP CLIENT-SIDE
- Global Stress QA: NOT REQUIRED (11,800 < 12,500)

## Live inventory (25)

### Skopje (9)

1. Athletic Fitness Diamond Mall (`mk_1a50b8774e`)
2. Star Gym Butel (`mk_ed44181018`)
3. Synergy Fitness Spa Skopje (`mk_e287181ec4`) — WELLNESS_ADDITIVE
4. Fitness Club Fit Skopje (`mk_c4cd75b049`)
5. Terminator Gym Skopje (`mk_95994c6f81`)
6. Atleta Fitness Skopje (`mk_9898f0cbde`)
7. Mastersport Skopje (`mk_4ac68f805e`)
8. Fit One Centar — Dame Gruev 18 (`mk_16fac97a4c`)
9. Magnus Fitness Skopje (`mk_ab20d10d09`)

### Bitola (1)

10. Flex Gym Bitola (`mk_698c3510c0`)

### Ohrid (2)

11. IB Fitness Ohrid (`mk_41ca038c25`)
12. Fitness Factori Ohrid (`mk_86cad1be86`)

### Kumanovo (3)

13. Aldo Fitness Kumanovo (`mk_94300b469e`)
14. Fit Bodi Kumanovo (`mk_5d2680a3e0`)
15. Chili Fitness Kumanovo (`mk_89442ce19e`)

### Prilep (2)

16. Shampion Gym Prilep (`mk_8a5f5057f3`)
17. Fit Star Prilep (`mk_f0f98a4d56`)

### Tetovo (3)

18. Arena Fitness Tetovo (`mk_cdaccb1c5c`)
19. Starfit Tetovo (`mk_f52f8d30cf`)
20. Fajar Bodi Tetovo (`mk_1483e1adda`)

### Kičevo (1)

21. Fitness Club Flex Kičevo (`mk_398550063e`)

### Strumica (2)

22. Pulse Fitness Strumica (`mk_851c2b41eb`)
23. Arena Fitness Strumica (`mk_2693ebaed3`)

### Gostivar (1)

24. Urban Gym Gostivar (`mk_d18f5092ac`)

### Štip (1)

25. Fit Jim Kiko Štip (`mk_7c67638813`)

## Identity decisions preserved

- Fit One Centar (consumer gym) ≠ institutional school/OU Fit One sites (EXCLUDED)
- Synergy = single WELLNESS_ADDITIVE conventional floor; no spa duplicate row
- Slim Line Club / Top Forma / Foxy remain absent from production
- Ohrid IB Fitness ↔ Fitness Factori (~74 m) retained as distinct premises
- Tetovo Arena ↔ Starfit (~92 m) retained as distinct premises
- Albanian-language western market: Tetovo trio + Kičevo Flex + Gostivar Urban present

## Exclusions verified absent from production

- `mk_2ee674d62a`, `mk_c91ef102cb` — Fit One institutional
- `mk_060baa180f` — Foxy
- `mk_cce02e40e6` — Slim Line Club
- `mk_3c4aa8965e` — Top Forma
- Hotel amenity probes (Marriott, DoubleTree, Aleksandar, Ohrid lakeside)

## Performance

From `NORTH_MACEDONIA_QA_PERF.json` (Jest suite run; cold index is noisy under parallel load):

| Metric | Value |
|--|--|
| Catalog | 11,800 |
| JSON size | 3.498 MB (3,668,438 bytes) |
| Parse | ~143 ms (suite) / ~25 ms (isolated) |
| Cold search index | ~13.9 s (suite) / ~4 s (ME baseline) |
| Cached index | 0 ms |
| Typical MK search | 2 ms |
| Worst MK search | 11 ms |
| Nearest | 1 ms |
| Assessment | HEALTHY |
| vs Montenegro/Moldova | No material regression at 11,800 scale |

## Tests

- `northMacedoniaGymQa` — PASS (12 tests)
- Full regression bundle: 20 suites / 241 tests — PASS
- Prior countries unchanged: ME 26 · MD 28 · SM 6 · MC 4 · AD 12 · LI 7 · IS 27 · CY 17

## Bugs

- Found: NONE
- Fixed: NONE (QA infrastructure only; production untouched)

## Final verdict

**NORTH MACEDONIA STATUS: READY** — country expansion unlocked.
