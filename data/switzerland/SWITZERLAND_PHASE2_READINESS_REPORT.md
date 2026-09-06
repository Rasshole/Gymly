# SWITZERLAND PHASE 2 READINESS REPORT

**Generated:** 2026-08-22

## Summary

| Metric | Value |
|--------|-------|
| Phase 1 staged | 290 |
| Phase 1 READY | 281 |
| Phase 1 READY preserved | 281 |
| Phase 2 new READY | 194 |
| Total READY_TO_IMPORT | 475 |
| Unique staged | 492 |
| Production total | 10,050 |
| Switzerland live | 0 |
| Projected catalog | 10,525 |

## Verdict

**READY FOR SWITZERLAND MERGE**

Phase 2 recovered NonStop Gym (48/48 discovered), update Fitness (93/85+ official), Kieser (21), well come FIT (28), and Harmony (12). All material national chains are COMPLETE or NEAR-COMPLETE. Remaining gaps are isolated coordinate recoveries and confirmed coming-soon clubs — not blockers for merge.

## Recovery

| Metric | Count |
|--------|-------|
| Existing unresolved recovered | 2 (ACTIV Serfontana, ACTIV Uznach via official Maps pins) |
| New locations discovered | 202 |
| Coming-soon promoted | 0 |
| Rebrands resolved | basefit→PureGym preserved; ONE/Silhouette excluded as ACTIV legacy |
| Duplicates removed | 1 (same-brand proximity cluster only) |

## NonStop Gym

| Metric | Value |
|--------|-------|
| Official/current estimate | 48 clubs (`nonstopgym.com/nostri-club/`) |
| Discovered | 48 |
| READY | 45 |
| Unresolved | 3 (Epalinges, Rolle, Blécherette — address geocode rejected) |
| Coverage | 93.8% |
| Verdict | **COMPLETE** |

Main locator `/our-clubs/` returns HTTP 403 in automated fetch; club list recovered from public Italian club selector page `/nostri-club/` with full addresses. Strictly Swiss estate; no French cross-border clubs included.

## Secondary chains

### Kieser

| Metric | Value |
|--------|-------|
| Official/current | ~21 Swiss studios |
| Discovered | 21 |
| READY | 21 |
| Unresolved | 0 |
| Verdict | **COMPLETE** — embedded JSON on `kieser-training.ch/ch-de/studios/` |

### update Fitness

| Metric | Value |
|--------|-------|
| Official/current | 85+ (`update-fitness.ch/standorte/`) |
| Discovered | 93 (standorte page; includes some non-gym/admin slugs filtered at READY gate) |
| READY | 88 |
| Unresolved | 5 (Basel Gundeli dual-address, Langenthal, Oberburg, St. Gallen Central, Wil cross-check) |
| Verdict | **COMPLETE** — brand current; no rebrand to ACTIV |

Coming-soon slug `basel-brausebad` not listed on standorte (not staged as open).

### EVO Fitness

| Metric | Value |
|--------|-------|
| Official/current | N/A — not a Swiss gym chain |
| Discovered | 0 |
| READY | 0 |
| Verdict | **EXCLUDED** — `evo.ch` is an IT retailer |

### well come FIT

| Metric | Value |
|--------|-------|
| Official/current | ~28 |
| Discovered | 28 |
| READY | 27 |
| Unresolved | 1 (Wil — geocode rejected) |
| Verdict | **COMPLETE** |

### ONE Training Center

| Metric | Value |
|--------|-------|
| Official/current | 0 standalone — merged into ACTIV FITNESS (2022) |
| Discovered | 0 |
| READY | 0 |
| Verdict | **EXCLUDED** — `one-training.ch` redirects to activfitness.ch |

### Harmony / Silhouette / ACTIFIT

| Chain | Discovered | READY | Verdict |
|-------|------------|-------|---------|
| Harmony | 12 | 11 | **COMPLETE** |
| Silhouette Wellness | 0 | 0 | **EXCLUDED** — ACTIV acquisition (2017) |
| ACTIFIT | 0 | 0 | **EXCLUDED** — single women-only Basel club, sub-threshold |

## Final Switzerland staging

| Status | Count |
|--------|-------|
| Unique staged | 492 |
| READY_TO_IMPORT | 475 |
| NEEDS_COORDINATES | 10 |
| NEEDS_REVIEW | 1 (update Fitness Vaduz — Liechtenstein excluded) |
| COMING_SOON | 6 |
| CLOSED | 0 |
| DUPLICATE/LEGACY | 0 |

## READY by brand

| Brand | READY |
|-------|-------|
| ACTIV FITNESS | 130 |
| update Fitness | 88 |
| Let's Go Fitness | 66 |
| PureGym | 49 |
| NonStop Gym | 45 |
| well come FIT | 27 |
| clever fit | 23 |
| Kieser | 21 |
| Fitnesspark | 15 |
| Harmony | 11 |
| **Total** | **475** |

## Regional coverage (READY)

| Region | READY |
|--------|-------|
| German-speaking | 319 |
| French-speaking | 141 |
| Italian-speaking (Ticino) | 15 |

Material regional gaps: None at chain level. Romandie materially strengthened by NonStop (25+ READY). Ticino covered by ACTIV (9), NonStop (4), PureGym (1), update Fitness (1).

## Chain completeness

| Chain | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
| ACTIV FITNESS | ~126 | 131 | 130 | 0 | 103% | COMPLETE |
| Fitnesspark | 16 | 16 | 15 | 1 | 94% | COMPLETE |
| PureGym | ~48 | 54 | 49 | 0 | 102% | COMPLETE |
| clever fit | ~23 | 23 | 23 | 0 | 100% | COMPLETE |
| Let's Go Fitness | ~66 | 66 | 66 | 0 | 100% | COMPLETE |
| NonStop Gym | 48 | 48 | 45 | 3 | 94% | COMPLETE |
| update Fitness | 85+ | 93 | 88 | 5 | 104% | COMPLETE |
| Kieser | ~21 | 21 | 21 | 0 | 100% | COMPLETE |
| well come FIT | ~28 | 28 | 27 | 1 | 96% | COMPLETE |
| Harmony | 12 | 12 | 11 | 1 | 92% | COMPLETE |
| ONE Training Center | — | 0 | 0 | — | — | EXCLUDED |
| EVO Fitness | — | 0 | 0 | — | — | EXCLUDED |
| ACTIFIT | 1 | 0 | 0 | — | — | EXCLUDED |

## Data quality (READY set)

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Same-brand physical duplicates (≤100 m) | 1 flagged cluster (review only) |
| Invalid postcodes | 0 |
| Missing addresses | 0 |
| Missing cities | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Liechtenstein rows in READY | 0 |
| Mojibake | 0 |
| Ambiguous geocodes | 0 in READY |

## Rebrands

| Legacy | Successor | Action |
|--------|-----------|--------|
| basefit.ch | PureGym | Import PureGym identity only (2022) |
| ONE Training Center | ACTIV FITNESS | EXCLUDE separate import (2022) |
| Silhouette Wellness | ACTIV FITNESS | EXCLUDE legacy brand (2017) |
| Only Fitness | ACTIV FITNESS | EXCLUDE legacy brand (2022) |

update Fitness remains a **current independent consumer brand** — not collapsed into ACTIV.

## Remaining gaps (non-blocking)

1. **NEEDS_COORDINATES (10):** Fitnesspark Regensdorf; NonStop Epalinges/Rolle/Blécherette; Harmony Cointrin Les Ailes; well come FIT Wil; update Fitness Basel Gundeli, Langenthal, Oberburg, St. Gallen Central
2. **COMING_SOON (6):** ACTIV Basel Aeschenplatz; PureGym Cornavin, Nations, Kreuzlingen, Lausanne Grancy, Pratteln — unchanged since Phase 1
3. **update Fitness Vaduz** — correctly excluded (Liechtenstein)

## Phase 3?

**NO** — No major national chain entirely missing; NonStop and update Fitness extracted; Romandie/Ticino chain coverage adequate; remaining items are coordinate polish and confirmed future openings.

## Projected catalog

| | Count |
|--|-------|
| Current production | 10,050 |
| Switzerland READY | 475 |
| **Projected** | **10,525** |

## Architecture

Inside client-side comfort zone at ~10.5K projected total (consistent with Global 10K QA pass). No architecture migration required.

## Production safety

- `src/data/centers.json` **unchanged**
- Production total: **10,050**
- Switzerland live: **0**

## Files

**Created/updated:**
- `data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json`
- `data/switzerland/switzerland_centers_staging.json`
- `data/switzerland/switzerland_duplicate_analysis.json`
- `data/switzerland/switzerland_geocode_review.json`
- `data/switzerland/SWITZERLAND_PHASE2_READINESS_REPORT.json`
- `data/switzerland/SWITZERLAND_PHASE2_REBRAND_MAP.json`
- `data/switzerland/Gymly_Switzerland_All_Discovered_Centers.xlsx`
- `data/switzerland/switzerland_phase1_staging_baseline.json`
- `data/switzerland/switzerland_phase2_candidates.json`
- `data/switzerland/raw/update_fitness_standorte.html`
- `scripts/switzerland-phase2.py`

**Preserved (Phase 1):**
- `data/switzerland/SWITZERLAND_PHASE1_READY_TO_IMPORT.json`
- `data/switzerland/SWITZERLAND_PHASE1_READINESS_REPORT.md/json`
- All Phase 1 raw evidence

## Final recommendation

**READY FOR SWITZERLAND MERGE**
