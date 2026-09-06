# IRELAND PHASE 3 READINESS REPORT

Generated: 2026-08-23T07:56:42.768850+00:00

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | 82 |
| READY_TO_IMPORT | 63 |
| NEEDS_COORDINATES | 0 |
| NEEDS_REVIEW | 19 |
| COMING_SOON | 0 |
| CLOSED | 0 |
| DUPLICATE/LEGACY | 0 |
| Phase 2 READY preserved | 46/46 |
| Newly recovered to READY | 17 |
| Projected catalog if merged alone | 10941 |

## READY by brand

- FLYEfit: 17
- Energie Fitness: 16
- Gym Plus: 7
- West Wood Club: 6
- Anytime Fitness: 5
- Ben Dunne Gyms: 4
- Iconic Health Clubs: 4
- Aura Leisure: 2
- Shoreline Leisure: 2

## Chain completeness

| Brand | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
| FLYEfit | 22 | 22 | 17 | 5 | 77.3% | NEAR-COMPLETE |
| Ben Dunne Gyms | 5 | 5 | 4 | 1 | 80.0% | NEAR-COMPLETE |
| Anytime Fitness | 7 | 6 | 5 | 1 | 71.4% | PARTIAL |
| Energie Fitness | 16 | 16 | 16 | 0 | 100.0% | COMPLETE |
| West Wood Club | 6 | 6 | 6 | 0 | 100.0% | COMPLETE |
| Aura Leisure | 11 | 11 | 2 | 9 | 18.2% | PARTIAL |
| Gym Plus | 7 | 7 | 7 | 0 | 100.0% | COMPLETE |
| Iconic Health Clubs | 4 | 4 | 4 | 0 | 100.0% | COMPLETE |
| Shoreline Leisure | 2 | 2 | 2 | 0 | 100.0% | COMPLETE |

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | 0 |
| Same-brand <=25 m | 0 |
| Same-brand <=50 m | 0 |
| Same-brand <=100 m | 0 |
| Same-brand <=200 m | 0 |
| Invalid Eircodes | 0 |
| Missing READY fields | 0 |
| Invalid coords | 0 |
| Fallback coords | 0 |
| NI contamination | 0 |
| Mojibake | 0 |

## Energie Tallaght / Citywest

{
  "distance_m": 3643.3,
  "classification": "A_legitimate",
  "tallaght": "ie_6930f99872",
  "citywest": "ie_2574437176",
  "tallaght_category": "READY_TO_IMPORT",
  "citywest_category": "READY_TO_IMPORT"
}

## Material gaps

- Aura Leisure only 2/11 READY — official pages omit Eircodes for most centres

## Non-blocking gaps

- FLYEfit residual Eircode debt (5 clubs) with official coords already present
- Ben Dunne Cherrywood still missing Eircode (business-park pin only)
- Anytime Kilnamanagh Eircode still missing (district-only on official page)
- Aura De Paul excluded (pool-only, no conventional gym)

## Verdict

**IRELAND PHASE 4 REQUIRED BEFORE MERGE**

Production `centers.json` was not modified.
