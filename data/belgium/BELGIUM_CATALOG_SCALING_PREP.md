# Belgium Catalog Scaling Prep — Complete Report

**Date:** 2026-08-21  
**Status:** Architecture & scaling prep complete. No Belgian gym data added. No discovery/scrape.

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
| Italy          | 550   |
| Belgium        | **0** |
| **Total**      | **8,693** |

- **File size:** 2.53 MB (2,652,919 bytes on disk; ~2.03 MB synthetic JSON payload in bench)
- **Active centers:** 8,689
- **Missing coords:** 5
- **Duplicate IDs:** 0
- **Belgium rows / `be_*` IDs:** 0 (also 0 `bel_*` / `bg_*`)
- **Headroom to 10,000:** **1,307**
- Imports of **1,308+** Belgian centers would push total **above 10,000**

---

## 2. Architecture Audit

Belgium can use the **same client-side architecture** as NO/DE/UK/FI/NL/FR/ES/IT:

| Layer | Mechanism | Belgium-ready? |
|-------|-----------|----------------|
| Catalog | `src/data/centers.json` → `centerRegistry` | Yes — append `country="Belgium"`, IDs `be_*` |
| Active gyms | `getActiveGyms` (finite coords only) | Yes — missing coords excluded from map/check-in |
| ID lookup | `Map` O(1) via `CENTER_BY_ID` / `GYM_BY_ID` | Yes |
| Country filter | Cached `countryBucketKey` / `countryCacheKey` | Yes — `belgium` bucket wired |
| Search | Cached `gymSearchIndex` + country keywords + city aliases | Yes |
| Nearest | Linear scan; skips non-finite coords | Yes |
| Map | Viewport filter; dense-city marker jitter OK | Yes at 8,693 |
| Pickers | `gymPickerLocationLine` + i18n country label | Yes — `countries.belgium` |
| Invented coords | DK/SE only via `allowsInventedCoordinates` | Belgium **excluded** |

**No server migration required for Belgium Phase 1.**  
**Do not modify `centers.json` in this prep. Do not merge. Do not start Poland. Do not change 200 m.**

---

## 3. Belgium Country Support (Wired)

| File | Change |
|------|--------|
| `src/utils/gymCountry.ts` | `isBelgiumCountry()` — belgium/be/belgie/belgië/belgique/belgien/belgia |
| `src/utils/gymCountry.ts` | `allowsInventedCoordinates` — Belgium **not** included |
| `src/data/centerRegistry.ts` | `countryBucketKey` → `'belgium'` |
| `src/data/danishGyms.ts` | DanishRegion `'België'`; `inferGymRegion`; `countryCacheKey` |
| `src/utils/gymDisplay.ts` | `unresolvedRegion` for `be_*` → `'België'` |
| `src/data/gymIds.ts` | `belgium: 'be_'` (**not** `bel_` / `bg_`) |
| `src/utils/gymCountryLabel.ts` | `countries.belgium` + picker location line |
| `src/services/gymSearch/gymSearchIndex.ts` | Country keywords + Belgian city aliases |
| `src/i18n/translations/en.ts` | `countries.belgium: 'Belgium'` |
| `src/i18n/translations/da.ts` | `countries.belgium: 'Belgien'` |
| `src/i18n/translations/sv.ts` | `countries.belgium: 'Belgien'` |
| `src/i18n/translations/nb.ts` | `countries.belgium: 'Belgia'` |

Stored country value for import: **`Belgium`**. IDs: **`be_*`**.

---

## 4–5. Labels + Schema / Fallback Safety

- Missing coords → `{lat: NaN, lng: NaN}` via `getEffectiveLatLng` (not check-in eligible)
- **No** Brussels / Belgium centroid / postal / DK / Stockholm fallback
- `allowsInventedCoordinates('Belgium'|'be'|'België'|'Belgique')` → `false`
- Active/mappable lists require finite coords
- Dense-city map jitter (`getMarkerMapCoordinate`) remains display-only; true lat/lng unchanged

---

## 6. Belgian Postcodes

- Postcodes are **4-digit strings** (e.g. `1000`, `2000`, `9000`)
- Schema: `postal_code: string` in `center.types.ts`
- Leading zeros preserved when stored as strings (`0500` ≠ numeric `500`)
- `parseInt` on postal exists only in **Danish** region inference; Belgium returns `'België'` before that path
- No Belgian postcode centroid lookup

---

## 7. Belgian Characters (Search-Only)

NFD + existing maps (stored names **unchanged**):

| Input | Normalized |
|-------|------------|
| Liège | liege |
| Liege | liege |
| België | belgie |
| Bruxelles | bruxelles |
| àéèêëïôùü | aeeeeiouu |

---

## 8. Search Prep — Country + City Aliases

**Country keywords:** Belgium, Belgique, België, Belgie, Belgien, Belgia

**Multilingual city aliases (SEARCH ONLY via `extractArea`):**

| Family | Aliases |
|--------|---------|
| Brussels | Brussels / Bruxelles / Brussel |
| Antwerp | Antwerp / Antwerpen / Anvers |
| Ghent | Ghent / Gent / Gand |
| Liège | Liège / Liege / Luik |
| Bruges | Bruges / Brugge |
| Namur | Namur / Namen |
| Leuven | Leuven / Louvain |
| Mechelen | Mechelen / Malines |
| Mons | Mons (+ Bergen alias when city is Mons) |
| Ostend | Oostende / Ostend / Ostende |
| Kortrijk | Kortrijk / Courtrai |
| + | Charleroi, Hasselt, Genk, Aalst/Alost, Sint-Niklaas, Tournai/Doornik, Wavre |

- **No** fake Belgian brand/chain aliases added yet (add with real import brands)
- Accent characters preserved in stored city/name fields

---

## 9. Geography Rules (Import QA — Planning)

In-scope:

- Flanders
- Wallonia
- Brussels-Capital Region

Out of scope / reject:

- Accidental neighbors: **NL / FR / DE / LU**
- Cross-border coords outside Belgium

Phase 1 discovery/import must flag neighbor-country leakage.

---

## 10–11. Check-In + Auto-Checkout

- `CHECK_IN_RADIUS_METERS = 200` — **unchanged**
- `AUTO_CHECKOUT_DISTANCE_METERS = CHECK_IN_RADIUS_METERS` — **unchanged**
- No country-specific radius overrides

---

## 12–13. Nearest + Map

- Belgium treated like NO/DE/UK/FI/NL/FR/ES/IT for missing coords (skip / NaN)
- Viewport filtering remains O(n) and fine at 8,693 (~3 ms)
- Dense-city marker jitter OK for stacked map pins

---

## 14. Live 8,693 Benchmark (`npm run bench:catalog`)

| Metric | Time |
|--------|------|
| JSON parse (imported) | 1 ms |
| JSON parse (stringify/reparse @ 8693) | 8 ms |
| Search index build (cold) | 586 ms |
| Index cached hit | 0 ms |
| Typical search (3 queries) | 474 ms |
| Worst-case search (2 queries) | 131 ms |
| Nearest gym | 19 ms |
| Map marker build | 27 ms |
| Map viewport filter | 3 ms |

---

## 15. Synthetic Scale Benchmark (9k–25k)

| Size  | JSON KB | Parse ms | Index ms | Search 3q ms | Worst 2q ms | Nearest ms | Map Build ms | Map Filter ms |
|-------|---------|----------|----------|-------------|------------|-----------|-------------|--------------|
| 5,000 | 1,140   | 4        | 464      | 241         | 46         | 12        | 16          | 2            |
| 6,000 | 1,382   | 6        | 417      | 309         | 88         | 13        | 18          | 2            |
| 7,500 | 1,709   | 8        | 553      | 394         | 105        | 15        | 21          | 2            |
| 8,000 | 1,825   | 9        | 555      | 435         | 118        | 18        | 22          | 3            |
| 8,693 | 1,979   | 8        | 586      | 474         | 131        | 19        | 27          | 3            |
| 9,000 | 2,048   | 8        | 643      | 480         | 129        | 21        | 25          | 3            |
| 10,000| 2,262   | 10       | 670      | 506         | 143        | 22        | 27          | 3            |
| 12,000| 2,722   | 11       | 836      | 591         | 158        | 24        | 29          | 4            |
| 15,000| 3,453   | 16       | 1,114    | 849         | 237        | 33        | 91          | 5            |
| 25,000| 5,762   | 25       | 1,839    | 1,422       | 382        | 57        | 58          | 8            |

*Note: Node/Jest timings. Mobile may be 2–3× slower on low-end devices. Index build is one-time and cached.*

---

## 16. Belgium Scenarios (+300…+1500)

| Scenario | Total  | Est. index | Est. search 3q | Acceptable? | Notes |
|----------|--------|------------|----------------|-------------|-------|
| +300     | 8,993  | ~640 ms    | ~480 ms        | **Yes**     | Under 10k |
| +500     | 9,193  | ~650 ms    | ~490 ms        | **Yes**     | Under 10k |
| +750     | 9,443  | ~660 ms    | ~500 ms        | **Yes**     | Under 10k |
| +1,000   | 9,693  | ~665 ms    | ~505 ms        | **Yes**     | Under 10k |
| +1,307   | 10,000 | ~670 ms    | ~506 ms        | **Yes**     | Exact 10k ceiling |
| +1,308+  | >10,000| ~670+ ms   | ~510+ ms       | **Yes***    | **>10k → checkpoint** |
| +1,500   | 10,193 | ~680 ms    | ~520 ms        | **Yes***    | **>10k → checkpoint** |

\*Performance still acceptable; process rule below applies.

Headroom to exactly 10,000 = **1,307**. Imports ≤1,307 stay ≤10k. **1,308+ pushes above 10k.**

---

## 17. 10K Checkpoint Rule (Document — Do Not Run Now)

| After Belgium merge | Action |
|---------------------|--------|
| **Total ≤ 10,000** | Run **Belgium QA only**, then **Poland next**. Run global 10K+ stress QA when the **first** country push exceeds 10k. |
| **Total > 10,000** | Run **Belgium QA**, then **GLOBAL 10K+ STRESS QA** before Poland |

Do **not** run global 10K stress QA as part of this prep.  
Do **not** start Poland in this prep.

---

## 18. Documented 10K QA Coverage (Planning Only)

When triggered, global 10K+ stress QA should cover:

1. Catalog integrity — counts, duplicate IDs, country partitions, `be_*` prefix
2. Cold + cached search index build under device-class budgets
3. Typical + worst-case search latency
4. Nearest-gym scan with missing-coord skipping
5. Map marker build + viewport filter (+ jitter display-only)
6. Check-in eligibility (finite coords only) + 200 m geofence
7. Auto-checkout distance identity with check-in radius
8. Memory / bundle size of `centers.json`
9. Cross-country regression (DK/SE/NO/DE/GB/FI/NL/FR/ES/IT + BE)
10. No invented coordinates for non-DK/SE countries

---

## 19. Server Migration Decision (From Real Benchmarks)

| Question | Answer |
|----------|--------|
| Keep Belgium in `centers.json`? | **YES** — keep for all Belgium scenarios through ~10–11k |
| Begin server planning? | **~15,000** total (index/search approach ~1s cold) |
| Server required? | **~25,000** (index ~1.8s, search 3q ~1.4s; JSON ~5.8 MB) |

**Verdict: KEEP client architecture.** No migration required before/during Belgium Phase 1.

---

## 20. Memory / Bundle Estimates

| Total | Est. on-disk `centers.json` | Notes |
|-------|----------------------------|-------|
| 8,693 (live) | **2.53 MB** | Current production |
| +300 → 8,993 | ~2.62 MB | Fine |
| +500 → 9,193 | ~2.68 MB | Fine |
| +1,000 → 9,693 | ~2.82 MB | Fine |
| 10,000 | ~2.91 MB | Fine |
| +1,500 → 10,193 | ~2.97 MB | Fine; triggers 10k process rule |
| 15,000 | ~4.4 MB | Plan server search |
| 25,000 | ~7.3 MB | Client-only not viable on low-end |

Runtime memory ≈ JSON parse + search index (~linear with N). Cold index ~0.6–0.7 s near 10k is acceptable because cached.

---

## 21. Search Index Audit

| Item | Status |
|------|--------|
| Country bucket `belgium` | Wired |
| Country keywords (6 language forms) | Wired |
| City multilingual aliases | Wired (EN/NL/FR families) |
| Diacritic normalize (Liège→liege, België→belgie) | Wired (NFD) |
| Brand/chain aliases | **Not yet** — add at import |
| Orphan `be_*` in production | **0** |
| Wrong prefixes `bel_` / `bg_` | Not registered; production has 0 |

---

## 22. Orphan `be_*` Safety

- Production has **0** `be_*` rows
- `findGymById('be_…')` → `null` for unknown IDs
- `unresolvedGymStub('be_…')` → region `'België'`, lat/lng **NaN** (never substitutes another live gym)
- Future import must use `be_*` only

---

## 23. Bottlenecks Ranked

1. Search index cold build (~586 ms @ 8.7k) — cached after first use
2. Typical multi-query search (~474 ms @ 8.7k)
3. JSON bundle size (~2.5 MB) — monitor toward 15–20k
4. Nearest sort/scan (~19 ms) — fine
5. Map viewport filter (~3 ms) — fine
6. `extractArea` regex volume — optimize candidate at 25k+

---

## 24. Regression Results

| Suite | Result |
|-------|--------|
| `__tests__/belgiumCatalogScalingPrep.test.ts` | PASS |
| `__tests__/italyCatalogScalePrep.test.ts` | PASS |
| `__tests__/spainCatalogScalePrep.test.ts` | PASS |
| `__tests__/franceCatalogScalePrep.test.ts` | PASS |
| `__tests__/catalogScalePrep.test.ts` | PASS |
| NL / FI / UK / DE / NO / FR / ES / IT gym QA | PASS |
| Catalog total | **8,693 unchanged** |
| Belgium entries in `centers.json` | **0** |

---

## 25. Remaining Risks

1. No Belgian chain aliases yet — add with real brands at import time
2. Geography QA must reject NL/FR/DE/LU neighbor leakage
3. If Belgium import pushes total **>10k**, halt Poland until global 10K stress QA
4. Monitor cold index (~0.6–0.7s) on low-end Android after merge
5. Mons→Bergen search alias is Mons-triggered only (avoids polluting Norwegian Bergen)

---

## 26. Files Changed

| File | Change |
|------|--------|
| `src/utils/gymCountry.ts` | `isBelgiumCountry()` |
| `src/data/centerRegistry.ts` | Belgium bucket |
| `src/data/danishGyms.ts` | België region + cache key |
| `src/utils/gymDisplay.ts` | `be_*` unresolved region |
| `src/data/gymIds.ts` | `belgium: 'be_'` |
| `src/utils/gymCountryLabel.ts` | Belgium label + picker |
| `src/services/gymSearch/gymSearchIndex.ts` | Country keywords + city aliases |
| `src/i18n/translations/en.ts` | Belgium |
| `src/i18n/translations/da.ts` | Belgien |
| `src/i18n/translations/sv.ts` | Belgien |
| `src/i18n/translations/nb.ts` | Belgia |
| `__tests__/belgiumCatalogScalingPrep.test.ts` | **NEW** |
| `data/belgium/BELGIUM_CATALOG_SCALING_PREP.md` | **NEW** (this report) |

**Not changed:** `src/data/centers.json`, 200 m radii, Poland, any Belgian staging rows.

---

## READY FOR BELGIUM PHASE 1
