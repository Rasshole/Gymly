# HUNGARY PHASE 2 READINESS REPORT

Generated: 2026-08-23T16:11:35.071900+00:00

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | 63 |
| READY_TO_IMPORT | 50 |
| NEEDS_COORDINATES | 1 |
| NEEDS_REVIEW | 8 |
| COMING_SOON | 3 |
| CLOSED/LEGACY | 1 |
| Projected catalog | 11063 |
| Crosses 12,500? | False |

## READY by brand

- Fitness5: 16
- 4% Fitness: 7
- Cutler Gym: 7
- Life1 Fitness: 6
- Chili Fitness: 5
- Thor Gym: 4
- Nr1 Fitness: 3
- Oxygen Wellness: 1
- Prestige Fitness: 1

## Phase 1 Life1 preservation

- Preserved IDs: 7 / 7
- Dropped IDs: none

## City coverage (READY)

- Budapest: yes
- Debrecen: yes
- Szeged: no
- Miskolc: no
- Pécs: yes
- Győr: yes
- Nyíregyháza: yes
- Kecskemét: yes
- Székesfehérvár: yes
- Szombathely: no
- Veszprém: no
- Zalaegerszeg: no
- Érd: no
- Tatabánya: no
- Sopron: yes
- Békéscsaba: no
- Eger: no
- Nagykanizsa: yes

## Chain completeness

- **Life1 Fitness**: READY 6 / est 6 — COMPLETE
- **Prestige Fitness**: READY 1 / est 1 — COMPLETE
- **Chili Fitness**: READY 5 / est 5 — COMPLETE
- **4% Fitness**: READY 7 / est 8 — NEAR-COMPLETE
- **Fitness5**: READY 16 / est 18 — NEAR-COMPLETE
- **Nr1 Fitness**: READY 3 / est 5 — PARTIAL
- **Cutler Gym**: READY 7 / est 8 — NEAR-COMPLETE
- **Thor Gym**: READY 4 / est 6 — NEAR-COMPLETE
- **Oxygen Wellness**: READY 1 / est 1 — COMPLETE
- **Gilda Max**: READY 0 / est 0 — EXCLUDED

## Data quality (READY)

- Duplicate IDs: 0
- Same-brand ≤25 m: 1 (4% GARDEN + ONLYGIRLS same building — A_legitimate)
- Same-brand ≤200 m: 4 (dense Budapest 4% pairs — A_legitimate)
- Invalid postcodes: 0
- Invalid coords: 0
- Fallback coords: 0
- Foreign outliers: 0
- Mojibake: 0

## Regional notes

- Budapest-heavy READY (36) plus regional Cutler/Fitness5/Chili Debrecen.
- Also READY: Dunakeszi, Dunaújváros, Gödöllő, Siófok.
- Szeged / Miskolc / Szombathely / Érd / Eger / Békéscsaba / Zalaegerszeg: no verified national-chain READY (source-estate / discovery gap — not invented).
- Veszprém / Fitness5 Sopron / Esztergom: COMING_SOON on official Fitness5 pages.

## Rebrands

- Gilda Max → Life1 (2017 acquisition) — LEGACY, not imported.
- Oxygen/Life1 Fáy → Prestige Fitness (`hu_cb9223a0d5` preserved).
- Pólus Fitness → Fitness5 Pólus Center.

## Remaining non-blocking gaps

- 4% CRUSH: address known, Nominatim homonym blocked → NEEDS_COORDINATES
- 4% LOTUS / Nr1 Rákóczi / Nr1 Vágóhíd / Thor Fehérvár+Kaposvár streets incomplete
- Cutler Miskolc site empty
- Fitness5 Szolnok/Tatabánya address debt

## Verdict

**READY FOR HUNGARY MERGE**

Production `centers.json` was not modified.

