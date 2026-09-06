# CZECHIA PRODUCTION QA REPORT

Generated: 2026-08-23

## Overall

| Metric | Value |
|--------|-------|
| Status | **READY** |
| Production modified during QA | **Yes** — 19 Form Factory PSČ repairs (house-number contamination) |
| Full QA completed | **Yes** |

## Catalog

| Check | Result |
|-------|--------|
| Total centers | 11,013 |
| Czechia | 70 |
| cz_* prefix | 70/70 |
| Duplicate IDs | 0 |
| Invalid PSČ | 0 (after repair) |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |

## Brand breakdown (production)

| Brand | Count |
|------:|------:|
| Form Factory | 43 |
| Max Fitness | 23 |
| Oktagon Gym | 1 |
| FITINN | 1 |
| clever fit | 1 |
| JOHN REED | 1 |
| McFIT (Czechia) | 0 |
| **TOTAL** | **70** |

## Merge reconciliation

| Metric | Value |
|--------|-------|
| Approved | 70 |
| Production Czechia | 70 |
| Staging MERGED_INTO_CATALOG | 70 |
| Missing IDs | 0 |
| Unexpected IDs | 0 |
| Metadata drift | none (post-repair sync) |
| **Result** | **PASS** |

## Staging exclusions (not live)

| Status | Count |
|--------|------:|
| NEEDS_COORDINATES | 7 |
| NEEDS_REVIEW | 8 |
| EXCLUDED | 0 |

Key withheld rows remain absent from production: Form Factory Pankrác (`cz_a1980e7db2`), Max Fitness Dejvice (`cz_58e478183d`), Cubex, Hradčanská, Pragovka, and other unresolved Form Factory clubs.

## Priority brand QA

| Brand | Live | Result |
|-------|-----:|--------|
| Form Factory | 43 | PASS — after 19 PSČ repairs; no page-path twins; Cubex/Hradčanská/Pragovka unresolved stay out |
| Max Fitness | 23 | PASS — Dejvice unresolved absent; Max Pankrác live |
| Oktagon Gym | 1 | PASS — retained as separate consumer brand (Smíchov) |
| FITINN | 1 | PASS — Brno OC Letmo; cz_*; no AT/SK ID reuse |
| clever fit | 1 | PASS — Kladno; cz_*; not DE/AT/CH identity |
| JOHN REED | 1 | PASS — Praha, Karlovo náměstí 2097/10, 120 00; no McFIT twin |
| McFIT exclusion | 0 | PASS — no Czech live McFIT |

### Form Factory PSČ defect (fixed)

**Root cause:** Phase 2 `postal_from_keys()` accepted 5-digit tokens from listing `data-keys` that were house numbers (e.g. `Pražská 255/41` → `255 41`).

**Evidence:** Official club-page Google Maps address blocks.

**Repair:** 19 live Form Factory rows updated to authoritative PSČ; staging + approved + Phase 2 READY synced. Backup: `data/czechia/backups/centers.json.pre_czechia_psc_qa_*`. Detail: `data/czechia/CZECHIA_QA_PSC_REPAIR.json`.

Examples:

| Club | Before | After |
|------|--------|-------|
| Argentinská | 161 04 | 170 00 |
| Olomouc City | 255 41 | 779 00 |
| Porubská | 707 72 | 708 00 |
| Náměstí Republiky | 334 69 | 702 00 |
| Veveří | 258 11 | 625 00 |
| Kasárny | 134 91 | 301 00 |
| … | … | (19 total) |

## Duplicate / proximity QA

| Check | Count |
|------:|------:|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 0 |
| Same-brand ≤50 m | 0 |
| Same-brand ≤100 m | 0 |
| Same-brand ≤200 m | 0 |
| Identical coords | 0 |
| Normalized-address duplicates | 0 |
| Different-brand co-locations ≤200 m | 0 |
| **Result** | **PASS** |

## Border safety

| Neighbor | Result |
|----------|--------|
| Germany | PASS — no DE core / de_* Czech rows |
| Poland | PASS |
| Austria | PASS |
| Slovakia | PASS — no SK contamination |
| **Result** | **PASS** — all coords inside Czechia bbox; all IDs `cz_*` |

## Search / nearest / map / check-in

- Brand search (Form Factory / Max / Oktagon / FITINN / clever / JOHN REED): **PASS**
- Cities + diacritic/ASCII (Praha/Prague, Plzeň/Plzen, České Budějovice/Ceske Budejovice, etc.): **PASS**
- PSČ spaced (`110 00`) + compact (`11000`): **PASS**
- Cross-country FITINN / clever fit: scoped searches preserve foreign IDs
- Nearest Praha/Brno/Ostrava/Plzeň/Olomouc/Zlín/Ústí/Kladno: **cz_* plausible**
- Map viewport filtering: scoped, not full 11,013 catalog
- Dense Prague pins remain distinct
- 200 m check-in + auto-checkout: **unchanged at 200 m** (199/200 allow, 201 away)
- Orphan `cz_nonexistent_test`: safe Czechia stub (not DE/AT/PL/DK/catalog[0])

## Regional coverage

Meaningful chain presence in Praha, Brno, Ostrava, Plzeň, Liberec, Olomouc, České Budějovice, Pardubice, Zlín, Ústí nad Labem, Opava/Havířov, Kladno.

No rows invented for Hradec Králové, Jihlava, or Karlovy Vary (genuine source-estate absence).

## Country regressions

| Country | Count |
|---------|------:|
| Denmark | 354 |
| Sweden | 639 |
| Norway | 535 |
| Germany | 1424 |
| United Kingdom | 1474 |
| Finland | 429 |
| Netherlands | 600 |
| France | 1712 |
| Spain | 976 |
| Italy | 588 |
| Belgium | 363 |
| Poland | 621 |
| Austria | 335 |
| Switzerland | 475 |
| Portugal | 247 |
| Greece | 106 |
| Ireland | 65 |
| Czechia | 70 |
| **TOTAL** | **11,013** |

## Performance

| Metric | QA run | Merge baseline |
|--------|-------:|---------------:|
| Catalog | 11,013 | 11,013 |
| Active | 11,009 | 11,009 |
| JSON size | ~3.26 MB | ~2.54 MB |
| Parse | ~16 ms | ~8 ms |
| Cold index | ~1,430 ms | ~1,339 ms |
| Cached | ~0 ms | ~0 ms |
| Typical search | ~146 ms/query | ~145 ms |
| Worst | ~246 ms | ~22 ms |
| Nearest | ~2 ms | ~3 ms |
| Map build | ~0 ms | ~4 ms |
| Viewport filter | ~0 ms | ~2 ms |

**Assessment:** Within normal run-to-run variance for cold index / typical search. JSON grew slightly from repair notes. No material architecture/performance regression. Global Stress QA **not** required (catalog 11,013 < 12,500).

## Tests

| Suite | Result |
|-------|--------|
| `czechiaGymQa` | PASS |
| `czechiaQaPerf` | PASS |
| `czechiaMergeSafety` | PASS |
| `czechiaPhase2Staging` | PASS |
| `czechiaPhase1Staging` | PASS |
| `irelandGymQa` | PASS |
| `batch1CatalogScalingPrep` | PASS |

## Bugs found

1. **Form Factory PSČ house-number contamination** (19 live clubs) — production defect with club-page evidence.

## Bugs fixed

1. Repaired 19 Form Factory `postal_code` values from official maps addresses; synced production / staging / approved / READY; regression coverage in `czechiaGymQa` (`looksLikeHouseNumberPostal` + repair assertions).

## Remaining risks (non-blocking)

- 15 unresolved staging rows still withheld (coord/review debt); do not promote without independent evidence.
- FITINN Brno address string retains a leading `"Adresse,"` artifact from source scrape — identity/coords/PSČ correct.
- Oktagon Gym remains a separate brand by design (consumer-facing); Max Fitness estate otherwise distinct.

## Global scale status

| Item | Value |
|------|-------|
| Catalog | 11,013 |
| New global-scale blocker | **No** |
| Global Stress QA required | **NO** |
| Country expansion | **UNLOCKED** |
| Architecture | Unchanged — client catalog remains workable |

## Files changed

- `src/data/centers.json` (19 Form Factory PSČ + notes)
- `data/czechia/czechia_centers_staging.json`
- `data/czechia/CZECHIA_APPROVED_FOR_MERGE.json`
- `data/czechia/CZECHIA_PHASE2_READY_TO_IMPORT.json`
- `data/czechia/CZECHIA_QA_PSC_REPAIR.json`
- `data/czechia/phase2/ff_psc_qa_audit.json`
- `data/czechia/backups/centers.json.pre_czechia_psc_qa_*`
- `data/czechia/CZECHIA_QA_PERF.json`
- `data/czechia/CZECHIA_QA_REPORT.md`
- `__tests__/czechiaGymQa.test.ts`
- `__tests__/czechiaQaPerf.test.ts`

## Final verdict

**CZECHIA STATUS: READY**

**Country expansion: UNLOCKED**
