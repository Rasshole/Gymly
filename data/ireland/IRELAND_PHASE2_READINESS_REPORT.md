# IRELAND PHASE 2 READINESS REPORT

Generated: 2026-08-23T07:20:06.569581+00:00

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | 82 |
| READY_TO_IMPORT | 46 |
| NEEDS_COORDINATES | 5 |
| NEEDS_REVIEW | 31 |
| COMING_SOON | 0 |
| CLOSED | 0 |
| DUPLICATE/LEGACY | 0 |
| Phase 1 READY preserved | 17/17 |
| Projected catalog if merged alone | 10924 |

## READY by brand

- FLYEfit: 17
- Energie Fitness: 13
- Gym Plus: 7
- Anytime Fitness: 4
- Ben Dunne Gyms: 2
- West Wood Club: 2
- Iconic Health Clubs: 1

## Chain completeness

| Brand | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
| FLYEfit | 22 | 22 | 17 | 5 | 77.3% | NEAR-COMPLETE |
| Ben Dunne Gyms | 5 | 5 | 2 | 3 | 40.0% | PARTIAL |
| Anytime Fitness | 7 | 6 | 4 | 2 | 57.1% | PARTIAL |
| Energie Fitness | 16 | 16 | 14 | 2 | 87.5% | NEAR-COMPLETE |
| West Wood Club | 6 | 6 | 2 | 4 | 33.3% | PARTIAL |
| Aura Leisure | 11 | 11 | 0 | 11 | 0.0% | PARTIAL |
| Gym Plus | 7 | 7 | 7 | 0 | 100.0% | COMPLETE |
| Iconic Health Clubs | 4 | 4 | 1 | 3 | 25.0% | PARTIAL |
| Shoreline Leisure | 2 | 2 | 0 | 2 | 0.0% | PARTIAL |
| Swan Leisure | 1 | 1 | 0 | 1 | 0.0% | EXCLUDED |
| SportsCo | 1 | 1 | 0 | 1 | 0.0% | EXCLUDED |
| Perpetua Fitness | 1 | 1 | 0 | 1 | 0.0% | EXCLUDED |

## Regional coverage (READY keyword)

- Dublin: yes
- Cork: yes
- Galway: yes
- Limerick: no
- Waterford: no
- Kilkenny: no
- Drogheda: yes
- Dundalk: yes
- Sligo: no
- Athlone: no
- Wexford: no
- Letterkenny: no
- Tralee: no
- Killarney: no
- Ennis: no
- Navan: no
- Naas: yes
- Bray: no
- Carlow: yes
- Tullamore: no
- Swords: yes
- Maynooth: yes
- Mullingar: yes
- Midleton: yes
- Balbriggan: yes
- Ashbourne: yes

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coords | 0 |
| Fallback coords | 0 |
| NI contamination | 0 |
| Mojibake | 0 |

## Material gaps

- Aura Leisure: 11 centres discovered with public gyms but Eircode recovery blocked READY promotion
- Ben Dunne Gyms: only 2/5 READY (Northwood/Portlaoise/Cherrywood unresolved)
- West Wood Club: 6 clubs discovered; most lack trustworthy Eircodes
- Anytime Fitness: 4/7 READY (Dublin district postcodes incomplete on several pages)
- Iconic Health Clubs: addresses too coarse for READY on most clubs

## Non-blocking gaps

- Shoreline Leisure Bray/Greystones staged but Eircode-incomplete
- SportsCo / Perpetua specialty or single-site below chain threshold
- Kingfisher / Raw Gyms official sites unreachable
- One Escape → Iconic Smithfield rebrand documented
- FLYEfit ~5 clubs still missing Eircode despite coords

## Verdict

**IRELAND PHASE 3 REQUIRED BEFORE MERGE**

Production `centers.json` was not modified.
