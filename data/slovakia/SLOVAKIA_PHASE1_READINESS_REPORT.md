# SLOVAKIA PHASE 1 READINESS REPORT

Generated: 2026-08-23

## Verdict

**SLOVAKIA PHASE 2 REQUIRED BEFORE MERGE**

Production was **not** modified.

## Baseline

| Metric | Value |
|--------|------:|
| Production total | 11,217 |
| Slovakia live | 0 |
| Production SHA | `f31734acfd849b54f7cfeeb8d8f896980ed90fd975a87ae85f2aa1c6d1356854` |
| SHA unchanged | YES |

## Market audit (classification)

| Operator | Class | Evidence / action |
|----------|-------|-------------------|
| Golem Club | **A** | Largest conventional SK mall/fitness network; 11 clubs in official VOP |
| Form Factory | **A** | Fast-growing conventional chain; 18 WP club CPT rows |
| FITINN | **A** | Budget chain; SK subset of multi-country locator (Bratislava Prior/Nido, Nitra) |
| 365 Fit&Co | **A** | Multi-city conventional; ~8–9 named locations |
| EfectFit | **C** | Private PT / specialty network (SR+CZ) — excluded from READY |
| FitCamp | **F** | Absorbed as Form Factory FitCamp club |
| Mozolani Fitness | **E** | Below national inclusion threshold |
| Maximus Gym | **E** | No confirmed multi-location national estate |
| MultiSport / pass networks | **B** | Aggregator — excluded |

## Chain completeness

### Golem Club
- Official/current: **11** fitness clubs (VOP; physiotherapy excluded)
- Discovered: **11**
- READY: **11**
- Unresolved: **0**
- Coming soon: **0**
- Coverage: **~100%** of official fitness estate
- Verdict: **NEAR-COMPLETE**

### Form Factory
- Official/current: **~18** clubs (WP API)
- Discovered: **18**
- READY: **14**
- Coming soon: **3** (Budatínska, Europa BC, Slnečnice)
- NEEDS_COORDINATES: **1** (Sky Park — address+postcode OK, geocode failed gate)
- Coverage: **strong** for open estate; coming-soon correctly withheld
- Verdict: **NEAR-COMPLETE** (Phase 2: Sky Park coords)

### FITINN
- Official/current SK: **≥3** confirmed (Prior, Nido, Nitra); secondary sources mention additional BA studios
- Discovered READY: **3**
- Unresolved / unverified extra BA sites: possible (VIVO/Polus etc. not on fitinn.sk SK-filtered list)
- Coverage: **PARTIAL**
- Verdict: **PARTIAL — Phase 2 required**

### 365 Fit&Co
- Official/current: **~8–9** named cities/locations
- READY: **4**
- NEEDS_COORDINATES: **4** (Hypertesco, ROCA, Spišská Nová Ves, Trenčín Južanka)
- NEEDS_REVIEW: **1** (Digital Park — no street)
- Coverage: **PARTIAL**
- Verdict: **PARTIAL — Phase 2 required**

## Final Slovakia staging

| Status | Count |
|--------|------:|
| Unique staged | 41 |
| READY_TO_IMPORT | 32 |
| NEEDS_COORDINATES | 5 |
| NEEDS_REVIEW | 1 |
| COMING_SOON | 3 |
| CLOSED | 0 |
| DUPLICATE/LEGACY | 0 |
| EXCLUDED (inventory) | EfectFit, MultiSport, Mozolani, Maximus |

## READY by brand

| Brand | READY |
|-------|------:|
| Form Factory | 14 |
| Golem Club | 11 |
| 365 Fit&Co | 4 |
| FITINN | 3 |
| **TOTAL** | **32** |

## Regional READY coverage

| City | READY count |
|------|------------:|
| Bratislava | 20 |
| Košice | 3 |
| Žilina | 2 |
| Nitra | 1 |
| Prešov | 1 |
| Banská Bystrica | 1 |
| Trenčín | 1 |
| Martin | 1 |
| Poprad | 1 |
| Považská Bystrica | 1 |
| Trnava | **0** |
| Spišská Nová Ves | 0 READY (1 staged NEEDS_COORDINATES) |

## Data quality (READY)

| Gate | Result |
|------|--------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing addresses/cities | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers (CZ/AT/HU/PL/UA) | 0 |
| Mojibake | 0 |

Slovak PSČ stored as `NNN NN` with first digit **0/8/9** (disjoint from Czechia **1–7**).

## Rebrands / legacy

See `SLOVAKIA_PHASE1_REBRAND_MAP.json`:
- FitCamp → Form Factory FitCamp (do not double-import)
- EfectFit / MultiSport excluded
- Golem physiotherapy excluded as specialty

## Duplicates / proximity (READY)

| Check | Count |
|-------|------:|
| Same-brand ≤25/50/100/200 m | 0 |
| Identical coordinates | 0 |
| Different-brand ≤100 m | 0 |

## Remaining gaps

**Material (block merge):**
1. **365 Fit&Co** incomplete (coords/review gaps on half the estate)
2. **FITINN** SK estate may be under-counted vs secondary BA mentions
3. **Form Factory Sky Park** still NEEDS_COORDINATES
4. **Trnava** has no READY conventional chain row yet

**Non-blocking:**
- Form Factory coming-soon (Budatínska, Europa BC, Slnečnice) correctly withheld
- EfectFit specialty exclusion
- Oradea-style: absence of a chain in a city is OK when no authoritative current estate exists

## Projected catalog

| Item | Value |
|------|------:|
| Current production | 11,217 |
| Slovakia READY | 32 |
| Projected if merged alone | **11,249** |
| Crosses 12,500? | **NO** |
| Global Stress QA if merged | **NO** |
| Architecture | **KEEP CLIENT-SIDE** |

## App wiring (Phase 1)

Implemented without production rows:
- `sk_` prefix, `isSlovakiaCountry`, `isPlausibleSlovakiaCoordinate`, `SLOVAKIA_POSTAL_RE`
- i18n `countries.slovakia` (en/da/sv/nb)
- Search city aliases + Slovensko haystack
- Orphan `sk_*` → Slovakia stub
- Check-in / auto-checkout radii **unchanged at 200 m**

## Phase 2?

**YES** — meaningful national chains (365 Fit&Co, FITINN completeness, Sky Park coords, Trnava gap) remain materially incomplete for merge.

## Tests

`__tests__/slovakiaPhase1Staging.test.ts`

## Files

Created under `data/slovakia/` + `scripts/slovakia-phase1-*.py` + app wiring.  
**`src/data/centers.json` unchanged.**
