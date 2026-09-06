# ROMANIA PHASE 1 READINESS REPORT

Generated: 2026-08-23T17:11:15.294228+00:00

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | 182 |
| READY_TO_IMPORT | 63 |
| NEEDS_COORDINATES | 0 |
| NEEDS_REVIEW | 95 |
| COMING_SOON | 5 |
| CLOSED | 0 |
| DUPLICATE/LEGACY | 19 |
| Projected catalog if merged alone | 11126 |

## READY by brand

- World Class: 32
- Stay Fit Gym: 17
- 18GYM: 14

## City coverage (keyword)

- București: yes
- Cluj-Napoca: yes
- Timișoara: yes
- Iași: yes
- Constanța: yes
- Brașov: yes
- Craiova: no
- Galați: yes
- Ploiești: yes
- Oradea: no
- Sibiu: yes
- Arad: yes
- Târgu Mureș: yes
- Baia Mare: yes
- Bacău: yes
- Buzău: no
- Satu Mare: yes
- Suceava: no
- Pitești: no
- Râmnicu Vâlcea: no

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coords | 0 |
| Fallback coords | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |

## Production collisions (<=50m)

0

## Coverage notes

- **World Class**: Official REST API — target NEAR-COMPLETE (~45 clubs)
- **Stay Fit Gym**: City page scrape — ~72 claimed; Phase 2 if material gaps remain
- **18GYM**: ASL store locator — postcodes often missing; geocoded in consolidate
- **ESX**: EXCLUDED — membership aggregator, not gym operator
- **Other national chains**: One Fitness, SAS Gym, Downtown etc. — Phase 2 probe required

## Verdict

**ROMANIA PHASE 2 REQUIRED BEFORE MERGE**

Production `centers.json` was not modified.
