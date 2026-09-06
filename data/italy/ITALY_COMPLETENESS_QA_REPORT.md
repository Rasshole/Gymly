# Italy Completeness Production QA Report

## Historical record — first QA attempt (STOPPED)

Generated: 2026-08-21

**STOPPED at step 1 (production baseline).** Full flow QA was not run.

### Overall (historical)

**NOT READY** — production baseline did not match the completeness-merge contract.

| Metric | Expected (QA brief) | Actual at STOP |
|--------|--------------------:|---------------:|
| Total | 9,094 | **9,092** |
| Italy | 588 | **586** |
| Completeness rows in production | 38 / 38 | **36 / 38** |

Other countries matched. Original Phase 2 Italy **550 / 550** IDs remained intact.

### Missing completeness IDs at STOP (2)

| ID | Name | Reason |
|----|------|--------|
| `it_ccb19385b7` | FITINN Milano Bicocca | neighbour-suburb geocode (Pessano/Rodano area) — withheld |
| `it_4ca03e5086` | FITINN Milano Viale Abruzzi | neighbour-suburb geocode (Peschiera Borromeo) — withheld |

READY file incorrectly marked all 38 as `MERGED_INTO_CATALOG` while only 36 existed on disk.

That gap was closed by **ITALY COMPLETENESS — 2-ROW FITINN REPAIR** (`ITALY_COMPLETENESS_FITINN_REPAIR_REPORT.md`): official FITINN map pins recovered and inserted → **9,094 / Italy 588 / 38/38**.

---

# FINAL QA RE-RUN AFTER FITINN REPAIR

Generated: 2026-08-22

**FULL QA COMPLETED.** Production verified directly from `src/data/centers.json`.

## Overall

**READY**

- Production modified during this QA: **No** (catalog data unchanged; tests/report/scale-prep baselines only)
- Full QA completed: **Yes**

## 1. Production baseline

| Country | Expected | Actual |
|---------|--------:|-------:|
| **Total** | 9,094 | **9,094** |
| Denmark | 354 | 354 |
| Sweden | 639 | 639 |
| Norway | 535 | 535 |
| Germany | 1,424 | 1,424 |
| United Kingdom | 1,474 | 1,474 |
| Finland | 429 | 429 |
| Netherlands | 600 | 600 |
| France | 1,712 | 1,712 |
| Spain | 976 | 976 |
| **Italy** | **588** | **588** |
| Belgium | 363 | 363 |

Original Italy (Phase 2): **550** intact. Completeness additions: **38**. 550 + 38 = **588**.

## 2. Completeness 38

- READY file rows: **38**
- Present in production: **38 / 38**
- Marked `MERGED_INTO_CATALOG`: **38** (matches disk — no metadata drift)
- Italy / active / name / brand / address / CAP / city / finite coords: **38 / 38**

## 3. FITINN repair validation

### Milano Bicocca (`it_ccb19385b7`)

| Field | Value |
|-------|--------|
| Address | Via Fulvio Testi 282 |
| CAP | 20162 |
| City | Milano |
| Coordinates | 45.5243, 9.21156 |
| Source | OFFICIAL_MAP_PIN |
| Lookup | PASS |
| Search (brand + CAP 20162) | PASS |
| Map viewport | PASS |
| Check-in coords | PASS |
| Old rejected (45.549983, 9.3750001) | **ABSENT** |

### Milano Viale Abruzzi (`it_4ca03e5086`)

| Field | Value |
|-------|--------|
| Address | Viale Abruzzi 38 |
| CAP | 20131 |
| City | Milano |
| Coordinates | 45.47906, 9.21737 |
| Source | OFFICIAL_MAP_PIN |
| Lookup | PASS |
| Search (brand + CAP 20131) | PASS |
| Map viewport | PASS |
| Check-in coords | PASS |
| Old rejected (45.4551727, 9.3164328) | **ABSENT** |

## 4. Catalog integrity (all 588)

| Check | Result |
|-------|--------|
| Unique IDs | PASS |
| `it_*` prefix | PASS |
| Required fields | PASS |
| CAP `^\d{5}$` string | PASS |
| Leading-zero CAP | **92** preserved |
| Invalid / 0,0 / NaN coords | **0** |
| Mojibake | **0** |
| BBox outliers | **0** |
| Foreign SM/VA micro-box | **0** |

## 5. Original 550 regression

| Check | Result |
|-------|--------|
| Phase 2 IDs retained | **550 / 550** |
| Removed | **0** |
| Changed IDs | **0** |
| Deactivated | **0** |
| Completeness IDs overlap Phase 2 | **0** (additive) |

## 6. Duplicate / proximity

| Check | Result |
|-------|--------|
| Duplicate IDs | **0** |
| Same-brand ≤50 m | **0** |
| Same-brand ≤100 m | **0** |
| Identical-coordinate clusters | **2** (different brands — legitimate) |

Legitimate dense co-locations (kept):

1. Fit Express + Icon Palestre @ Via Igea 15, Roma (`it_dd296aa3bd` / `it_1dbcbcdcc6`)
2. Fit Express + Icon Palestre @ Via del Mare, Pomezia (`it_638fe29826` / `it_c65268f0c1`)

## 7. Brand breakdown (production truth → 588)

| Brand | Count |
|-------|------:|
| FitActive | 193 |
| FitUP | 80 |
| Anytime Fitness | 68 |
| Fit Express | 55 |
| McFIT | 42 |
| Virgin Active | 42 |
| Icon Palestre | 36 |
| Orange | 23 |
| WebFit | 16 |
| FITINN | 10 |
| GetFIT | 8 |
| 20Hours | 7 |
| Dabliu | 5 |
| Gold's Gym | 2 |
| JOHN REED | 1 |
| **Total** | **588** |

## 8–12. Search QA

| Area | Result |
|------|--------|
| All 15 Italian brands | PASS (it_* hits) |
| Icon → Icon Palestre alias | PASS |
| Completeness 38 discoverable | **38 / 38** |
| Major cities (Milano…Bergamo where present) | PASS |
| CAP 20162 / 20131 + leading-zero CAP | PASS |
| Diacritic / ASCII (e.g. Forlì → Forli) | PASS; stored text unchanged |

## 13–24. Core flows

| Flow | Result |
|------|--------|
| Onboarding picker resolution | PASS |
| Profile / favorites / max-3 / mixed-country | PASS |
| Nearest (Milano/Roma/Torino/Napoli/Bologna + FITINN pins) | PASS |
| Dense / manual selection persistence | PASS |
| Map viewports (no full-catalog render) | PASS |
| 200 m check-in boundaries (incl. Bicocca) | PASS |
| Auto-checkout 200 / 201 (session gym ID) | PASS |
| Workout / PR / history / feed / notifications / planned | PASS (ID→name resolution) |
| Orphan `it_*` | PASS (stub; no DK / catalog[0]) |
| i18n Italy labels (en/da/sv/nb) | PASS |

`CHECK_IN_RADIUS_METERS` = **200**. `AUTO_CHECKOUT_DISTANCE_METERS` = **200**. Unchanged.

## 25–26. Geography

| Check | Result |
|-------|--------|
| BBox outliers | 0 |
| Foreign points | 0 |
| FITINN repair geography | Milano-local official pins; rejected suburbs absent |

## 27–30. Cross-country regressions

| Country | Count | Suite |
|---------|------:|-------|
| DK | 354 | covered via Italy/completeness + country suites |
| SE | 639 | covered |
| NO | 535 | covered |
| DE | 1,424 | `germanyGymQa` PASS |
| UK | 1,474 | `ukGymQa` PASS |
| FI | 429 | `finlandGymQa` PASS |
| NL | 600 | `netherlandsGymQa` PASS |
| FR | 1,712 | `franceGymQa` PASS |
| ES | 976 | `spainGymQa` PASS |
| BE | 363 | `belgiumGymQa` PASS |

## 31. Performance (`npm run bench:catalog`)

Live catalog size **9,094**:

| Metric | ms / value |
|--------|------------|
| JSON parse | 19 ms |
| Cold search index | 1,343 ms |
| Cached index | 0 ms |
| Typical search (3q) | 873 ms |
| Worst search (2q) | 228 ms |
| Nearest | 37 ms |
| Map build | 45 ms |
| Viewport filter | 3 ms |

Assessment: **acceptable** at 9,094. No architecture migration. Global 10K+ stress QA **not** required yet.

## 32. Tests

| Suite | Result |
|-------|--------|
| `__tests__/italyCompletenessQa.test.ts` | PASS |
| `__tests__/italyGymQa.test.ts` | PASS |
| `__tests__/belgiumGymQa.test.ts` | PASS |
| `__tests__/spainGymQa.test.ts` | PASS |
| `__tests__/franceGymQa.test.ts` | PASS |
| `__tests__/ukGymQa.test.ts` | PASS |
| `__tests__/finlandGymQa.test.ts` | PASS |
| `__tests__/netherlandsGymQa.test.ts` | PASS |
| `__tests__/germanyGymQa.test.ts` | PASS |
| `npm run bench:catalog` | PASS |

Italy suites: **271 passed / 0 failed** (2 suites).  
Country regression suites: **829 passed / 0 failed** (7 suites).  
Bench: **1 passed**.

## Bugs found

None material.

(Test harness issues only: nearest gym uses `latitude`/`longitude`; map filter needs mapped pin objects — fixed in QA tests, not production bugs.)

## Bugs fixed

None in production code.

## Remaining risks

No Italy-specific production blockers remain.

Noted non-blockers:

- Staging file `italy_centers_staging.json` MERGED count is **586** (2 repaired FITINN clubs were Phase 3 READY-only, never staged rows) — READY file is the completeness source of truth and is drift-free at **38**.
- SE/DK still allow invented coordinate fallbacks (pre-existing legacy; Italy does not).

## 10K checkpoint

| | |
|--|--:|
| Catalog | **9,094** |
| Headroom to exactly 10,000 | **906** |
| Centers to reach 10,000 | **906** |
| Centers to exceed 10,000 | **907** |
| Global 10K+ stress QA required now | **NO** |

## Files changed (this QA)

- `__tests__/italyCompletenessQa.test.ts` (new)
- `__tests__/italyGymQa.test.ts` (baseline/brand/geography/staging/10k updates)
- `__tests__/belgiumGymQa.test.ts`, `spainGymQa.test.ts`, `franceGymQa.test.ts`, `ukGymQa.test.ts`, `finlandGymQa.test.ts`, `netherlandsGymQa.test.ts`, `germanyGymQa.test.ts` (catalog total / Italy count / 10k headroom)
- `__tests__/italyCatalogScalePrep.test.ts`, `belgiumCatalogScalingPrep.test.ts`, `spainCatalogScalePrep.test.ts`, `franceCatalogScalePrep.test.ts`, `catalogScalePrep.test.ts` (totals)
- `data/italy/ITALY_COMPLETENESS_QA_REPORT.md` (this file — history preserved + final re-run)

Production `src/data/centers.json`: **not modified** in this QA.

## Final verdict

**ITALY COMPLETENESS STATUS: READY**

STOP. Do not start Poland. Do not run global 10K+ stress QA.
