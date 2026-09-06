# Italy Catalog Scaling Prep — Complete Report

**Date:** 2026-08-21  
**Status:** Architecture & scaling prep complete. No Italian gym data added.

---

## 1. Current Production State

| Country        | Count |
|---------------|-------|
| Denmark        | 354   |
| Sweden         | 639   |
| Norway         | 535   |
| Finland        | 429   |
| Germany        | 1,424 |
| United Kingdom | 1,474 |
| Netherlands    | 600   |
| France         | 1,712 |
| Spain          | 976   |
| **Total**      | **8,143** |

- **File size:** 2.36 MB (2,478,232 bytes)
- **Active centers:** 8,139
- **Missing coords:** 5
- **Duplicate IDs:** 0
- **Italy rows / `it_*` IDs:** 0
- **Headroom to 10,000:** 1,857

## 2. Architecture Audit

Italy can use the **same client-side architecture** as NO/DE/UK/FI/NL/FR/ES:

| Layer | Mechanism | Italy-ready? |
|-------|-----------|--------------|
| Catalog | `src/data/centers.json` → `centerRegistry` | Yes — append `country="Italy"`, IDs `it_*` |
| Active gyms | `getActiveGyms` (finite coords only) | Yes — missing coords excluded from map/check-in |
| ID lookup | `Map` O(1) via `CENTER_BY_ID` / `GYM_BY_ID` | Yes |
| Country filter | Cached `countryBucketKey` / `countryCacheKey` | Yes — `italy` bucket wired |
| Search | Cached `gymSearchIndex` + country keywords | Yes — Italy/Italia/Italien |
| Nearest | Linear scan; skips non-finite coords | Yes |
| Map | Viewport filter; skips non-finite coords | Yes at 8,143 |
| Pickers | `gymPickerLocationLine` + i18n country label | Yes — `countries.italy` |
| History / feed / notifications | Resolve via gym ID + display helpers | Yes — no country-specific fork |
| Invented coords | DK/SE only via `allowsInventedCoordinates` | Italy **excluded** |

**No server migration required for Italy Phase 1.**

## 3. Italy Country Support (Wired)

| File | Change |
|------|--------|
| `src/utils/gymCountry.ts` | `isItalyCountry()` — italy/it/italia/italien |
| `src/utils/gymCountry.ts` | `allowsInventedCoordinates` — Italy **not** included |
| `src/data/centerRegistry.ts` | `countryBucketKey` → `'italy'` |
| `src/data/danishGyms.ts` | DanishRegion `'Italia'`; `inferGymRegion`; `countryCacheKey` |
| `src/utils/gymDisplay.ts` | `unresolvedRegion` for `it_*` → `'Italia'` |
| `src/data/gymIds.ts` | `italy: 'it_'` (not `italy_` / `ita_`) |
| `src/utils/gymCountryLabel.ts` | `countries.italy` + picker location line |
| `src/services/gymSearch/gymSearchIndex.ts` | Keywords: Italy, Italia, Italien |
| `src/services/gymSearch/gymSearchNormalize.ts` | Apostrophe strip for search-only |
| `src/i18n/translations/en.ts` | `countries.italy: 'Italy'` |
| `src/i18n/translations/da.ts` | `countries.italy: 'Italien'` |
| `src/i18n/translations/sv.ts` | `countries.italy: 'Italien'` |
| `src/i18n/translations/nb.ts` | `countries.italy: 'Italia'` |

Stored country value for import: **`Italy`**. IDs: **`it_*`**.

## 4–5. Labels + Schema / Fallback Safety

- Missing coords → `{lat: NaN, lng: NaN}` via `getEffectiveLatLng` (not check-in eligible)
- No Rome / Milan / Italy centroid fallback
- `allowsInventedCoordinates('Italy'|'it'|'Italia')` → `false`
- Active/mappable lists require finite coords

## 6. Italian CAP (Postcodes)

- CAP are **5-digit strings** (e.g. `00118`, `20121`)
- Schema: `postal_code: string` in `center.types.ts`
- Leading zeros preserved when stored as strings (`00118` ≠ numeric `118`)
- `parseInt` on postal exists only in **Danish** region inference; Italy returns `'Italia'` before that path
- No CAP centroid lookup for Italy

## 7. Italian Characters (Search-Only)

NFD + apostrophe punctuation strip (stored names **unchanged**):

| Input | Normalized |
|-------|------------|
| Forlì | forli |
| Forli | forli |
| àèéìòù | aeeiou |
| Città | citta |
| Sant'Agata | sant agata |

## 8. Search Prep

- Country aliases only: **Italy / Italia / Italien**
- **No** fake Italian brand aliases added
- Cities work via normal name/city/address search once data exists
- No Italian `extractArea` city list yet (add with real import if needed)

## 9. Geography Rules (Import QA — Planning)

In-scope:

- Mainland Italy
- Sicily
- Sardinia

Out of scope / reject:

- **San Marino (SM)** — not Italy
- **Vatican City (VA)** — not Italy
- Accidental neighbors: **FR / CH / AT / SI / HR / MT**

Phase 1 discovery/import must flag cross-border coords and SM/VA rows.

## 10–11. Check-In + Auto-Checkout

- `CHECK_IN_RADIUS_METERS = 200` — unchanged
- `AUTO_CHECKOUT_DISTANCE_METERS = CHECK_IN_RADIUS_METERS` — unchanged
- No country-specific radius overrides

## 12–13. Nearest + Map

- Italy treated like NO/DE/UK/FI/NL/FR/ES for missing coords (skip / NaN)
- Viewport filtering remains O(n) and fine at 8,143 (~2 ms)

## 14. Live 8,143 Benchmark (`npm run bench:catalog`)

| Metric | Time |
|--------|------|
| JSON parse (imported) | 1 ms |
| JSON parse (stringify/reparse @ 8143) | 8 ms |
| Search index build (cold) | 541 ms |
| Index cached hit | 0 ms |
| Typical search (3 queries) | 494 ms |
| Worst-case search (2 queries) | 132 ms |
| Nearest gym | 19 ms |
| Map marker build | 27 ms |
| Map viewport filter | 2 ms |

## 15. Synthetic Scale Benchmark (9k–25k)

| Size  | JSON KB | Parse ms | Index ms | Search 3q ms | Worst 2q ms | Nearest ms | Map Build ms | Map Filter ms |
|-------|---------|----------|----------|-------------|------------|-----------|-------------|--------------|
| 5,000 | 1,140   | 5        | 1,675*   | 360         | 63         | 13        | 17          | 2            |
| 6,000 | 1,382   | 8        | 422      | 401         | 94         | 15        | 19          | 2            |
| 7,500 | 1,709   | 8        | 505      | 460         | 124        | 17        | 23          | 3            |
| 8,000 | 1,825   | 9        | 518      | 470         | 125        | 19        | 23          | 3            |
| 8,143 | 1,860   | 8        | 541      | 494         | 132        | 19        | 27          | 2            |
| 9,000 | 2,049   | 10       | 632      | 528         | 139        | 21        | 26          | 3            |
| 10,000| 2,269   | 10       | 629      | 561         | 159        | 23        | 29          | 3            |
| 12,000| 2,736   | 13       | 764      | 722         | 190        | 28        | 35          | 4            |
| 15,000| 3,451   | 20       | 973      | 934         | 248        | 35        | 39          | 5            |
| 25,000| 5,777   | 34       | 1,660    | 1,553       | 402        | 59        | 63          | 8            |

\*First cold size often includes one-time JIT/warmup; subsequent sizes are more representative.

*Note: Node/Jest timings. Mobile may be 2–3× slower on low-end devices. Index build is one-time and cached.*

## 16. Italy Scenarios (+500…+3000)

| Scenario | Total  | Est. index | Est. search 3q | Acceptable? | Notes |
|----------|--------|------------|----------------|-------------|-------|
| +500     | 8,643  | ~580 ms    | ~510 ms        | **Yes**     | Well under 10k |
| +1,000   | 9,143  | ~630 ms    | ~530 ms        | **Yes**     | Well under 10k |
| +1,500   | 9,643  | ~630 ms    | ~550 ms        | **Yes**     | Under 10k |
| +2,000   | 10,143 | ~640 ms    | ~570 ms        | **Yes***    | **>10k → checkpoint** |
| +3,000   | 11,143 | ~700 ms    | ~650 ms        | **Yes***    | **>10k → checkpoint** |

\*Performance still acceptable; process rule below applies.

Headroom to exactly 10,000 = **1,857**. Imports ≤1,857 stay ≤10k.

## 17. 10K Checkpoint Rule (Document — Do Not Run Now)

| After Italy merge | Action |
|-------------------|--------|
| **Total ≤ 10,000** | Run **Italy QA only**, then continue product work |
| **Total > 10,000** | Run **Italy QA**, then **STOP expansion** until **GLOBAL 10K+ STRESS QA** completes |

Do **not** run global 10K stress QA as part of this prep.

## 18. Documented 10K QA Coverage (Planning Only)

When triggered, global 10K+ stress QA should cover:

1. Catalog integrity — counts, duplicate IDs, country partitions, `it_*` prefix
2. Cold + cached search index build under device-class budgets
3. Typical + worst-case search latency
4. Nearest-gym scan with missing-coord skipping
5. Map marker build + viewport filter
6. Check-in eligibility (finite coords only) + 200 m geofence
7. Auto-checkout distance identity with check-in radius
8. Memory / bundle size of `centers.json`
9. Cross-country regression (DK/SE/NO/DE/GB/FI/NL/FR/ES + IT)
10. No invented coordinates for non-DK/SE countries

## 19. Server Migration Decision (From Real Benchmarks)

| Question | Answer |
|----------|--------|
| Keep Italy in `centers.json`? | **YES** — keep for all Italy scenarios through ~11k |
| Begin server planning? | **~15,000** total (index/search approach ~1s cold) |
| Server required? | **~25,000** (index ~1.7s, search 3q ~1.6s; JSON ~5.8 MB) |

**Verdict: KEEP client architecture.** No migration required before/during Italy Phase 1.

## 20. Bottlenecks Ranked

1. Search index cold build (~540 ms @ 8.1k) — cached after first use
2. Typical multi-query search (~500 ms @ 8.1k)
3. JSON bundle size (~2.4 MB) — monitor toward 15–20k
4. Nearest sort/scan (~19 ms) — fine
5. Map viewport filter (~2 ms) — fine
6. `extractArea` regex volume — optimize candidate at 25k+

## 21. Regression Results

| Suite | Result |
|-------|--------|
| `__tests__/italyCatalogScalePrep.test.ts` | PASS |
| `__tests__/spainCatalogScalePrep.test.ts` | PASS |
| `__tests__/franceCatalogScalePrep.test.ts` | PASS |
| `__tests__/catalogScalePrep.test.ts` | PASS |
| NL / FI / UK / DE / NO / SE related | PASS |
| France + Spain gym QA | PASS |
| Catalog total | **8,143 unchanged** |
| Italy entries in `centers.json` | **0** |

## 22. Remaining Risks

1. No Italian chain aliases yet — add with real brands at import time
2. No Italian city `extractArea` aliases yet — optional after Phase 1 data
3. Geography QA must reject SM/VA and neighbor-country leakage
4. If Italy import pushes total **>10k**, halt further country expansion until global 10K stress QA
5. Monitor cold index (~0.5–0.7s) on low-end Android after merge

## 23. Files Changed

| File | Change |
|------|--------|
| `src/utils/gymCountry.ts` | `isItalyCountry()` |
| `src/data/centerRegistry.ts` | Italy bucket |
| `src/data/danishGyms.ts` | Italia region + cache key |
| `src/utils/gymDisplay.ts` | `it_*` unresolved region |
| `src/data/gymIds.ts` | `italy: 'it_'` |
| `src/utils/gymCountryLabel.ts` | Italy label + picker |
| `src/services/gymSearch/gymSearchIndex.ts` | Italy country keywords |
| `src/services/gymSearch/gymSearchNormalize.ts` | Apostrophe search normalize |
| `src/i18n/translations/en.ts` | Italy |
| `src/i18n/translations/da.ts` | Italien |
| `src/i18n/translations/sv.ts` | Italien |
| `src/i18n/translations/nb.ts` | Italia |
| `scripts/benchmark-gym-catalog-scale.test.ts` | Include 9k / 12k sizes |
| `__tests__/italyCatalogScalePrep.test.ts` | **NEW** |
| `data/italy/ITALY_CATALOG_SCALING_PREP.md` | **NEW** (this report) |

---

## READY FOR ITALY PHASE 1
