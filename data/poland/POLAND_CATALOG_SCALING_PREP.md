# Poland Catalog Scaling Prep

Generated: 2026-08-22

**THIS IS PREP ONLY.** No Polish gyms discovered. `src/data/centers.json` unchanged.

---

## 1. Current production state

Verified from live `src/data/centers.json`:

| Country | Count |
|---------|------:|
| Denmark | 354 |
| Sweden | 639 |
| Norway | 535 |
| Germany | 1,424 |
| United Kingdom | 1,474 |
| Finland | 429 |
| Netherlands | 600 |
| France | 1,712 |
| Spain | 976 |
| Italy | 588 |
| Belgium | 363 |
| **Poland** | **0** |
| **TOTAL** | **9,094** |

Production modified by this task: **No**.

---

## 2. Architecture audit

Shared client-side catalog (`centers.json`) + search index + viewport-filtered map remains the production architecture for all 11 live countries. Poland wires into the same helpers — no Poland-only engine.

---

## 3. Poland country support wired

| Concern | Implementation |
|---------|----------------|
| Stored country | `"Poland"` |
| ID prefix | `pl_` (`GYM_ID_PREFIX.poland`) — not `pol_` / `po_` |
| Detector | `isPolandCountry` — Poland / pl / Polska / Polen |
| Invented coords | **Forbidden** (`allowsInventedCoordinates` stays DK/SE only) |
| Region bucket | `Polska` |
| Orphan stub | `pl_*` → region `Polska`, name `Unknown gym` |
| Search keywords | Poland / Polska / Polen |
| City aliases | Warsaw↔Warszawa, Cracow/Krakow↔Kraków, Lodz↔Łódź, etc. |
| Character fold | `ł`/`Ł` → `l` (NFD does not fold ł); other Polish diacritics via NFD |
| Postcode | `NN-NNN` string (e.g. `00-001`); hyphen searchable via compact `00001` |

---

## 4. Country labels (i18n)

| Locale | Label |
|--------|--------|
| en | Poland |
| da | Polen |
| sv | Polen |
| nb | Polen |

No Polish UI language pack created.

---

## 5. Missing-coordinate safety

Poland follows BE/IT/FR/ES/… modern path:

- missing lat/lng → `NaN` / not check-in eligible
- **No** Warsaw, Kraków, Poland centroid, city/postcode centroid, DK/SE fallbacks

---

## 6. Polish postcodes

Format: `^\d{2}-\d{3}$` stored as **STRING**.

Search: hyphen → space in normalizer → compact match (`00-001` ↔ `00001`). Does not collide with BE 4-digit or IT/FR/ES 5-digit formats at the validation layer; ranking remains country/city biased as today.

No postcode→coordinate fallback.

---

## 7. Geography (Phase 1 guidance)

Future Polish rows must resolve inside Poland. Border care with DE / CZ / SK / UA / BY / LT / Kaliningrad (RU). Reject neighbour-suburb geocodes (same accuracy rule as Italy FITINN repair).

---

## 8–9. Check-in / auto-checkout

| Constant | Value |
|----------|------:|
| `CHECK_IN_RADIUS_METERS` | **200** |
| `AUTO_CHECKOUT_DISTANCE_METERS` | **200** |

Unchanged. Distance vs **selected / session gym ID**, not nearest.

---

## 10. Nearest / map

Nearest remains linear haversine over active gyms — acceptable through projected Poland sizes (see benchmarks). Map remains viewport-filtered; no full-catalog render. Dense metros (Warsaw, Kraków, Wrocław, Tricity, Upper Silesia) reuse existing pin jitter / manual selection.

---

## 11. Live 9,094 benchmark (`npm run bench:catalog`)

| Metric | Value |
|--------|------:|
| Catalog size | 9,094 |
| JSON bytes (serialized sample) | ~2.12 MB |
| Parse | 12 ms |
| Cold search index | 815 ms |
| Cached index | 0 ms |
| Typical search (3q) | 609 ms |
| Worst search (2q) | 156 ms |
| Nearest | 23 ms |
| Map build | 32 ms |
| Viewport filter | 3 ms |

Assessment: **healthy** at current production scale.

---

## 12. Synthetic scale benchmarks

| Size | Parse | Cold index | Typical search | Worst | Nearest | Map build | Filter | JSON ~ |
|-----:|------:|-----------:|---------------:|------:|--------:|----------:|-------:|-------:|
| 10,000 | 12 | 878 | 646 | 156 | 27 | 31 | 4 | 2.3 MB |
| 11,000 | 13 | 962 | 729 | 210 | 29 | 34 | 4 | 2.6 MB |
| 12,000 | 15 | 1,072 | 866 | 194 | 37 | 37 | 4 | 2.8 MB |
| 12,500 | 17 | 1,100 | 759 | 186 | 29 | 38 | 4 | 2.9 MB |
| 15,000 | 18 | 1,299 | 960 | 245 | 36 | 42 | 5 | 3.5 MB |
| 20,000 | 44 | 1,737 | 1,660 | 342 | 52 | 61 | 7 | 4.7 MB |
| 25,000 | 40 | 4,650 | 2,713 | 422 | 64 | 63 | 8 | 5.9 MB |
| 50,000 | 96 | 4,590 | 3,255 | 808 | 121 | 122 | 16 | 11.8 MB |

Times in ms. Synthetic only — not written to production.

---

## 13. Poland import scenarios (from 9,094)

| Addition | Result total | Architecture | 10k rule |
|----------|-------------:|--------------|----------|
| +500 | 9,594 | Acceptable | Below 10k |
| +750 | 9,844 | Acceptable | Below 10k |
| +906 | 10,000 | Acceptable | At 10k — Poland QA only; **no** global stress yet |
| +907 | 10,001 | Acceptable | **Exceeds 10k** → Poland QA → **GLOBAL 10K+ STRESS QA** → then continue |
| +1,000 | 10,094 | Acceptable | Exceeds → global stress required |
| +1,500 | 10,594 | Acceptable | Exceeds → global stress required |
| +2,000 | 11,094 | Acceptable | Exceeds → global stress required |
| +3,000 | 12,094 | Acceptable | Exceeds → global stress required |

---

## 14. 10K trigger (critical product rule)

| | |
|--|--:|
| Current | 9,094 |
| Headroom to exactly 10,000 | **906** |
| Centers to reach 10,000 | **906** |
| Centers to exceed 10,000 | **907** |

**If Poland merge inserts ≤906:**  
Poland merge → Poland QA → continue (no global stress yet).

**If Poland merge inserts ≥907:**  
Poland merge → Poland QA → **STOP country expansion** → **GLOBAL 10K+ STRESS QA** → continue only if that passes.

Global 10K+ stress QA was **not** run in this prep task.

---

## 15. Global 10K+ stress QA (planning only)

Later checklist when triggered:

- cold startup, catalog parse, search-index creation  
- typing responsiveness; brand/city/country/postcode search  
- map pan/zoom, dense markers, nearest, manual selection  
- onboarding, profile/favorites, planned sessions, chat/invites  
- 200 m check-in + auto-checkout (session gym ID)  
- workout/PR, history, feed/share, notifications  
- orphan IDs, all-country isolation  
- bundle/memory, physical-device performance  

---

## 16. Server directory decision

| Threshold | Decision |
|-----------|----------|
| Safe for Poland Phase 1 | **Yes** |
| Safe around 10k | **Yes** (product QA checkpoint, not auto-migration) |
| Safe around 12k | **Yes** for core ops (index ~1.1s cold; search still usable) |
| Safe around 15k | **Yes**, watch typing latency |
| Planning threshold | ~**20–25k** (cold index and typical search degrade materially) |
| Required migration threshold | ~**25–50k** or when device UX fails global stress QA |

Do **not** migrate merely for crossing 10,000.

---

## 17. Search index audit (9,094)

- Index caches on stable gym-array reference — cached rebuild **0 ms** in bench  
- Per-keystroke work uses shared engine; no Poland fork  
- Polish `ł` folding + city aliases added without weakening relevance  
- No clear regression requiring optimization beyond this prep  

---

## 18. Tests

| Suite | Result |
|-------|--------|
| `__tests__/polandCatalogScalingPrep.test.ts` | **15 passed** |
| `__tests__/belgiumCatalogScalingPrep.test.ts` | PASS |
| `__tests__/italyCatalogScalePrep.test.ts` | PASS |
| `__tests__/italyCompletenessQa.test.ts` | PASS |
| `npm run bench:catalog` | PASS |

Failed: **0**

---

## 19. Bugs found / fixed

Found: None material.  
Fixed: None required (prep wiring only).

Note: Unicode NFD alone does not fold Polish `ł` — explicit search-only map added (expected).

---

## 20. Files changed

- `src/data/gymIds.ts`
- `src/utils/gymCountry.ts`
- `src/utils/gymCountryLabel.ts`
- `src/utils/gymDisplay.ts`
- `src/data/centerRegistry.ts`
- `src/data/danishGyms.ts`
- `src/services/gymSearch/gymSearchNormalize.ts`
- `src/services/gymSearch/gymSearchIndex.ts`
- `src/i18n/translations/en.ts`
- `src/i18n/translations/da.ts`
- `src/i18n/translations/sv.ts`
- `src/i18n/translations/nb.ts`
- `scripts/benchmark-gym-catalog-scale.test.ts` (added 11k / 12.5k / 20k / 50k sizes)
- `__tests__/polandCatalogScalingPrep.test.ts` (new)
- `data/poland/POLAND_CATALOG_SCALING_PREP.md` (this file)

**Not modified:** `src/data/centers.json`

---

## 21. Final verdict

**READY FOR POLAND PHASE 1**

STOP. Do not discover Polish gyms. Do not modify centers.json. Do not run global 10K+ stress QA. Do not start another country.
