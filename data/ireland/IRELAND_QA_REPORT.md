# IRELAND PRODUCTION QA REPORT

Generated: 2026-08-23

## Overall

| Metric | Value |
|--------|-------|
| Status | **READY** |
| Production modified during QA | **No** |
| Full QA completed | **Yes** |

## Catalog

| Check | Result |
|-------|--------|
| Total centers | 10,943 |
| Ireland | 65 |
| ie_* prefix | 65/65 |
| Duplicate IDs | 0 |
| Invalid Eircodes | 0 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| NI contamination | 0 |
| Mojibake | 0 |

## Brand breakdown (production)

| Brand | Count |
|-------|------:|
| FLYEfit | 17 |
| Energie Fitness | 16 |
| Gym Plus | 7 |
| West Wood Club | 6 |
| Anytime Fitness | 5 |
| Aura Leisure | 4 |
| Ben Dunne Gyms | 4 |
| Iconic Health Clubs | 4 |
| Shoreline Leisure | 2 |
| **TOTAL** | **65** |

## Merge reconciliation

| Metric | Value |
|--------|-------|
| Approved | 65 |
| Production Ireland | 65 |
| Staging MERGED_INTO_CATALOG | 65 |
| Missing IDs | 0 |
| Unexpected IDs | 0 |
| Metadata drift | none |
| **Result** | **PASS** |

## Staging exclusions (not live)

| Status | Count |
|--------|------:|
| NEEDS_REVIEW | 13 |
| EXCLUDED | 4 |

Key withheld rows: FLYEfit ×5 Eircode debt, Aura ×6 Eircode debt, Ben Dunne Cherrywood, Anytime Kilnamanagh, De Paul pool-only, Perpetua/SportsCo/Swan specialty exclusions.

Overpass unresolved Eircode probe decision preserved — no guessed postcodes promoted.

## Priority brand QA

| Brand | Live | Result |
|-------|-----:|--------|
| FLYEfit | 17 | PASS — no FLYEHUB; Swords unresolved stays out |
| Energie Fitness | 16 | PASS — all ie_*; Tallaght/Citywest verified |
| Gym Plus | 7 | PASS |
| West Wood Club | 6 | PASS — complete estate |
| Anytime Fitness | 5 | PASS — ROI only; Kilnamanagh withheld |
| Ben Dunne Gyms | 4 | PASS — Cherrywood withheld |
| Iconic Health Clubs | 4 | PASS — Smithfield present; One Escape absent |
| Aura Leisure | 4 | PASS — gym-capable only; De Paul excluded |
| Shoreline Leisure | 2 | PASS — Bray + Greystones |

## Energie Tallaght / Citywest

| Field | Value |
|-------|-------|
| Classification | A_legitimate |
| Distance | ~3,643 m |
| Tallaght Eircode | D24 X2FC |
| Citywest Eircode | D24 TD81 |
| **Result** | **PASS** — separate clubs retained |

## Duplicate / proximity QA

| Check | Count |
|-------|------:|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 0 |
| Same-brand ≤50 m | 0 |
| Same-brand ≤100 m | 0 |
| Same-brand ≤200 m | 0 |
| Identical coords | 0 |
| Different-brand co-locations | 0 |
| **Result** | **PASS** |

## Rebrands / exclusions

| Item | Result |
|------|--------|
| One Escape → Iconic Smithfield | PASS — predecessor not live |
| FLYEHUB → FLYEfit Swords | PASS — neither legacy nor unresolved Swords in production |
| De Paul pool-only | PASS — EXCLUDED, not live |
| NEEDS_REVIEW (13) | PASS — none in production |
| NI | PASS — 0 contamination |

## Search / nearest / map / check-in

- Brand, city, Eircode (formatted + compact) search: **PASS**
- Cross-country Anytime: IE and UK results keep country identity when scoped
- Nearest at Dublin/Cork/Galway/Limerick/Drogheda/Dundalk/Bray/Tullamore: **ie_* plausible**
- Map viewport filtering: scoped to region, not full catalog
- 200 m check-in + auto-checkout: **unchanged at 200 m**
- Orphan `ie_nonexistent_test`: safe Ireland stub (not UK/DK/catalog[0])

## Country regression

All 16 pre-existing countries unchanged. Ireland = 65. Total = 10,943. **PASS**

## Performance (10,943 live catalog)

| Metric | Merge benchmark | QA sanity |
|--------|----------------:|----------:|
| catalog | 10,943 | 10,943 |
| active | 10,939 | — |
| JSON size | 2,541,229 B | — |
| parse | 8 ms | — |
| cold index | 973 ms | <5 s |
| cached index | 0 ms | — |
| typical search | 503 ms | <3 s |
| worst search | 120 ms | — |
| nearest | 19 ms | — |
| map build | 25 ms | — |
| viewport filter | 3 ms | — |

**Assessment:** Within normal variance; no material regression.

## Global scale

| Metric | Value |
|--------|-------|
| Catalog | 10,943 |
| 12,500 crossed | No |
| Global Stress QA required | No |
| Country expansion | **UNLOCKED** |

## Tests

| Suite | Result |
|-------|--------|
| irelandGymQa | 51/51 PASS |
| irelandMergeSafety | 10/10 PASS |
| irelandPhase4Staging | 12/12 PASS |
| irelandPhase3Staging | PASS |
| irelandPhase2Staging | PASS |
| irelandPhase1Staging | PASS |
| batch1CatalogScalingPrep | PASS |
| greeceMergeSafety | PASS |

## Bugs found

None.

## Bugs fixed

None (production unchanged during QA).

## Remaining risks (non-blocking)

- 13 NEEDS_REVIEW rows remain Eircode-blocked (Aura ×6, FLYEfit ×5, Cherrywood, Kilnamanagh) — intentional per Phase 4 gate
- FLYEfit Swords not live (unresolved Eircode) despite FLYEHUB→FLYEfit mapping documentation
- Aura gym-capable estate partially represented (4/10 live)

## Final verdict

**IRELAND STATUS: READY**

**Country expansion: UNLOCKED**
