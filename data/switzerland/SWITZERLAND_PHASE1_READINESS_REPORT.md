# SWITZERLAND PHASE 1 READINESS REPORT

**Generated:** 2026-08-22

## Summary

| Metric | Value |
|--------|-------|
| Unique locations staged | 290 |
| READY_TO_IMPORT | 281 |
| NEEDS_COORDINATES | 3 |
| COMING_SOON | 6 |
| NEEDS_REVIEW | 0 |
| Projected catalog | 10,331 |
| Production baseline | 10,050 (unchanged by Phase 1 scripts) |
| Switzerland live | 0 |

## Verdict

**SWITZERLAND PHASE 2 REQUIRED BEFORE MERGE**

NonStop Gym (~40+ clubs) remains blocked (HTTP 403). Several meaningful chains (update Fitness, EVO, Kieser, well come FIT, ONE Training Center) were not extracted in Phase 1.

## Status counts

```json
{
  "READY_TO_IMPORT": 281,
  "COMING_SOON": 6,
  "NEEDS_COORDINATES": 3
}
```

## Chain coverage

| Chain | Estimate | Discovered | READY | Unresolved | Coming soon | Closed | Coverage % | Verdict |
|-------|----------|------------|-------|------------|-------------|--------|------------|---------|
| ACTIV FITNESS | ~126 | 131 | 128 | 2 | 1 | 0 | 101.6% | COMPLETE |
| Fitnesspark | 16 | 16 | 15 | 1 | 0 | 0 | 93.8% | COMPLETE |
| PureGym | ~48 | 54 | 49 | 0 | 5 | 0 | 102.1% | COMPLETE |
| clever fit | ~23 | 23 | 23 | 0 | 0 | 0 | 100.0% | COMPLETE |
| Let's Go Fitness | ~66 | 66 | 66 | 0 | 0 | 0 | 100.0% | COMPLETE |
| NonStop Gym | 40+ | 0 | 0 | 0 | 0 | 0 | 0% | BLOCKED |
| Kieser | unknown | 0 | 0 | 0 | 0 | 0 | — | NOT_EXTRACTED |

## READY brand breakdown

| Brand | READY |
|-------|-------|
| ACTIV FITNESS | 128 |
| Let's Go Fitness | 66 |
| PureGym | 49 |
| clever fit | 23 |
| Fitnesspark | 15 |
| **Total** | **281** |

## Major source discoveries

| Chain | Source | Method |
|-------|--------|--------|
| ACTIV FITNESS | `activfitness.ch/studio-sitemap.xml` | Per-studio page: `const location = { lat, lng, title, address }` + Google Maps fallback |
| Fitnesspark | Same movemi sitemap (fitnesspark-* slugs → fitnesspark.ch) | Address from `<br>` blocks + maps `q=` parameter |
| PureGym | `puregym.swiss/fitnessstudios/` | Astro pages: schema.org `HealthClub` JSON-LD with geo + postal address (basefit.ch fully rebranded) |
| clever fit | `shop.clever-fit.ch/` | Embedded locator JSON array (lat/lng/address) |
| Let's Go Fitness | `letsgofitness.ch/page-data/de/clubs/page-data.json` | Gatsby/Strapi club nodes with geolocation |
| NonStop Gym | `nonstopgym.com/our-clubs/` | **BLOCKED** — HTTP 403 from research environment |

## Regional coverage (audit)

| Region | READY sample hits |
|--------|-------------------|
| German-speaking Switzerland | 56 named anchor cities + 188 other municipalities |
| French-speaking Switzerland | 36 named anchor cities |
| Italian-speaking Switzerland | 4 (Lugano area, Ticino ACTIV/PureGym/LGF) |

Coverage spans Zürich, Bern, Basel, Luzern, Aargau, St. Gallen, Thurgau, Solothurn, Graubünden, Schaffhausen, Zug, Schwyz, Genève, Vaud, Fribourg, Neuchâtel, Valais, and Ticino via chain locators — not limited to Zürich/Bern/Basel.

## Data quality

```json
{
  "duplicate_ids": 0,
  "same_brand_physical_duplicates": 0,
  "invalid_postcodes": 0,
  "missing_addresses": 1,
  "missing_cities": 1,
  "missing_coordinates": 4,
  "invalid_coordinates": 0,
  "fallback_coordinates": 0,
  "foreign_outliers": 0,
  "mojibake": 0,
  "ambiguous_geocodes": 3
}
```

## Rebrands / legacy

- **basefit.ch → PureGym Switzerland:** Official PureGym index lists all current Swiss clubs; legacy basefit branding noted in metadata only. No double-import of historical basefit rows.
- **ACTIV FITNESS + Fitnesspark:** Same parent (movemi) but distinct brands; kept separate unless same physical address (none merged in Phase 1).
- **ACTIV FITNESS Basel Aeschenplatz:** Marked COMING_SOON (no address published yet).

## Border safety

| Border | Audit |
|--------|-------|
| Germany | READY coords validated in CH bounds; no ≤50 m foreign production collision |
| Austria | Same |
| France | Same; Geneva/Vaud clubs use official PureGym/ACTIV/LGF addresses |
| Italy | Same; Ticino clubs geocoded in CH |
| Liechtenstein | Excluded (948/949 postcodes + LI city names filtered) |

Foreign locator rows from cross-border chains were not imported.

## Incomplete / blocked chains

| Chain | Status | Reason |
|-------|--------|--------|
| NonStop Gym | BLOCKED | HTTP 403 on official locator |
| Kieser | NOT_EXTRACTED | No public standorte links discovered on kieser.ch crawl |
| update Fitness | NOT_EXTRACTED | Phase 2 market audit |
| EVO Fitness | NOT_EXTRACTED | Phase 2 market audit |
| well come FIT | NOT_EXTRACTED | Phase 2 market audit |
| ONE Training Center | NOT_EXTRACTED | Phase 2 market audit |
| Harmony / Silhouette / ACTIFIT | NOT_EXTRACTED | Phase 2 if scale confirmed |

## NEEDS_COORDINATES (3)

- ACTIV FITNESS Serfontana (6834 Morbio Inferiore) — geocode ambiguous
- ACTIV FITNESS Uznach (8730 Uznach) — geocode ambiguous
- Fitnesspark Regensdorf (8105 Regensdorf) — geocode ambiguous

## COMING_SOON (6)

- ACTIV FITNESS Basel Aeschenplatz
- PureGym Genf Cornavin, Genf Nations, Kreuzlingen, Lausanne Grancy, Pratteln

## Completeness classification

**A. Complete / essentially complete:** ACTIV FITNESS, Fitnesspark, PureGym, clever fit, Let's Go Fitness

**B. Near-complete:** —

**C. Materially incomplete:** —

**D. Blocked:** NonStop Gym

**E. Discovered but not extracted:** Kieser, update Fitness, EVO, well come FIT, ONE Training Center, Harmony, Silhouette, ACTIFIT

## Projected catalog

| | Count |
|---|------|
| Current production | 10,050 |
| READY_TO_IMPORT | 281 |
| **Projected** | **10,331** |

## Architecture

- Projected 10,331 remains inside current client-side comfort zone (KEEP CLIENT-SIDE)
- Global 10K QA rerun required now: **No**

## Production safety

- Phase 1 scripts did **not** write to `src/data/centers.json`
- Verified at run time: total = 10,050, Switzerland = 0, sha256 = `109ffde46db3a12a917122ee2e3d8e109e46216cfbd289895539c11e06e825b6`

## Phase 2 priorities

1. NonStop Gym — alternate access to official club list/API
2. Kieser Switzerland standorte extraction + inclusion review
3. Secondary chains: update Fitness, EVO, well come FIT, ONE Training Center
4. Resolve 3 NEEDS_COORDINATES rows via official map pins or manual geocode review
5. French/Italian Switzerland depth check after NonStop recovery
