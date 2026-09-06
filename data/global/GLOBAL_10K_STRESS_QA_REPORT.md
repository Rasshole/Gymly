# GYMLY GLOBAL 10K+ STRESS QA REPORT

**Date:** 2026-08-22  
**Catalog source:** `src/data/centers.json` (read directly, not reports)  
**Verdict:** PASS — COUNTRY EXPANSION UNLOCKED

---

## Executive summary

Gymly's client-side gym catalog architecture remains **safe and usable at 10,050 production centers** across 13 countries. All automated integrity checks, country QA regressions, and global stress tests pass. No production catalog modifications were made during this QA. One test-infrastructure fix (AsyncStorage mock in `workoutLog.test.ts`) was applied to restore a pre-existing suite load failure unrelated to catalog behavior.

**Physical device validation:** FOLLOW-UP REQUIRED (no automated device harness in repo).

---

## 1. Production baseline (verified)

| Metric | Expected | Actual |
|--------|----------|--------|
| Total rows | 10,050 | **10,050** ✓ |
| Active rows | 10,046 | **10,046** ✓ |

### Country counts

| Country | Expected | Actual | Active |
|---------|----------|--------|--------|
| Denmark | 354 | 354 | 350 (4 intentional inactive) |
| Sweden | 639 | 639 | 639 |
| Norway | 535 | 535 | 535 |
| Germany | 1,424 | 1,424 | 1,424 |
| United Kingdom | 1,474 | 1,474 | 1,474 |
| Finland | 429 | 429 | 429 |
| Netherlands | 600 | 600 | 600 |
| France | 1,712 | 1,712 | 1,712 |
| Spain | 976 | 976 | 976 |
| Italy | 588 | 588 | 588 |
| Belgium | 363 | 363 | 363 |
| Poland | 621 | 621 | 621 |
| Austria | 335 | 335 | 335 |

**Production modified during QA:** No

---

## 2. Global catalog integrity

| Check | Result |
|-------|--------|
| Globally unique IDs | 0 duplicates |
| Supported country | All 13 present |
| Valid name/brand/city | 0 missing required fields |
| Active coordinate integrity | 0 NaN/Infinity/0,0 for stored coords |
| Null stored coords (active) | 1 — `se_7f7137b434` (Actic Göteborg Landvetter); legacy Sweden Stockholm fallback via `getEffectiveLatLng` |
| Mojibake (`Ã`, `�`, `â€`, etc.) | 0 |
| Literal `\xNN` escapes in display fields | 0 |
| `is_active` state | Valid; DK 4 intentional inactive |

---

## 3. Country prefix integrity

| Country | Prefix | Mismatches |
|---------|--------|------------|
| Denmark | established slug model | 0 |
| Sweden | `se_*` | 0 |
| Norway | `no_*` | 0 |
| Germany | `de_*` | 0 |
| United Kingdom | `gb_*` | 0 |
| Finland | `fi_*` | 0 |
| Netherlands | `nl_*` | 0 |
| France | `fr_*` | 0 |
| Spain | `es_*` | 0 |
| Italy | `it_*` | 0 |
| Belgium | `be_*` | 0 |
| Poland | `pl_*` | 0 |
| Austria | `at_*` | 0 |

---

## 4. Country partitioning

`getGymsByCountry`, `getActiveGymsByCountry`, `getCentersByCountry`, `getActiveCentersByCountry`, and country detection helpers partition all 13 countries correctly. No gym falls into wrong country, Denmark fallback, or unknown bucket unexpectedly.

---

## 5. ID lookup performance

| Path | Mechanism | Assessment |
|------|-----------|------------|
| `findCenterById` | `CENTER_BY_ID` Map | O(1) — GOOD |
| `findGymById` | `GYM_BY_ID` Map | O(1) — GOOD |
| 5000× lookup (first/mid/last/missing) | <200 ms each | GOOD |

No shared lookup path scans all 10,050 rows unnecessarily.

---

## 6. Active catalog cache

| Check | Result |
|-------|--------|
| `getActiveGyms()` stable reference | ✓ same object on repeat |
| `getActiveCenters()` stable reference | ✓ |
| 10,000× `getActiveGyms()` | <50 ms — GOOD |
| Rebuild on repeat call | No |

---

## 7. Cold app catalog load (Node/Jest proxy)

| Stage | Time | Assessment |
|-------|------|------------|
| JSON parse (imported module) | ~12 ms | GOOD |
| Registry construction | bundled at import | GOOD |
| Active list construction | cached at first access | GOOD |
| First search (includes cold index if not warmed) | see search section | ACCEPTABLE |

**Note:** Node/Jest benchmarks are not physical-device cold launch. See §45.

---

## 8–9. Search index

### Architecture verified

- Module-level `cachedIndex` in `gymSearchIndex.ts`
- Built once per stable gym source reference
- **Not** rebuilt per query, keystroke, screen render, or map pan

### Benchmark — live 10,050 (`npm run bench:catalog`)

Single representative run:

| Metric | ms |
|--------|-----|
| JSON bytes (bench harness) | 2,336,627 |
| Parse | 12 |
| Cold index | 942 |
| Cached index | 0 |
| Typical search (3 queries) | 664 |
| Worst search (2 queries) | 164 |
| Nearest (10,046 active) | 26 |
| Map build | 32 |
| Viewport filter | 4 |

### 3-run variance (warm Node, index + typical search + nearest)

| Run | Cold index | Typical search | Worst search | Nearest |
|-----|------------|----------------|--------------|---------|
| 1 (cold JVM) | 2,122 | 1,648 | 377 | 100 |
| 2 | 833 | 609 | 146 | 22 |
| 3 | 850 | 626 | 152 | 23 |

Run 1 reflects cold JIT; runs 2–3 are representative steady-state.

| Area | Classification |
|------|----------------|
| Cold index | ACCEPTABLE (~0.8–1.0 s warm; up to ~2.1 s cold JVM) |
| Cached index | GOOD (0 ms) |
| Typical search | ACCEPTABLE (~600–650 ms warm) |
| Worst-case search (`fit`, `gym`, short prefixes) | GOOD (~150–380 ms) |
| Typing stress (incremental) | ACCEPTABLE — index reused, stable results |

---

## 10–15. Search quality

### Brand search (13 countries)

Representative major brands return results in correct countries with sensible ranking. Exact brand matches score strongly. No catastrophic cross-country domination observed.

### City search

Representative capitals and second-tier cities (København, Stockholm, Oslo, Berlin, London, Helsinki, Amsterdam, Paris, Madrid, Milano, Bruxelles, Warszawa, Wien) return local results.

### Diacritics / ASCII normalization

Search-only normalization verified: Tromso→Tromsø, München, Köln, Düsseldorf, Straße, Forlì, Łódź, Wrocław, Poznań, Wien/Vienna, Belgian aliases. Stored display text unchanged.

### Postcodes (multi-country)

Belgium 1000, Austria 1010, Italy 20131, Finland 00100, Spain 28001, Poland 00-001, UK SW1, NL formats — country context disambiguates 4-digit collisions (e.g. 1000 BE vs 1010 AT).

### Worst-case queries

`fit`, `fitness`, `gym`, `city`, `club`, and short prefixes `a`, `s`, `f`, `m`, `vi` complete without timeout; no quality throttling that breaks UX.

---

## 16. Memory / index size

| Asset | Size |
|-------|------|
| `centers.json` on disk | 3,093,472 bytes (~3.0 MB) |
| Parsed catalog (Node) | ~same order as JSON |
| Search index | built once, cached; scales ~linearly with catalog |

### Forward scale (synthetic clone harness)

| Size | Cold index | Typical search | Nearest | Map filter |
|------|------------|------------------|---------|------------|
| 10,050 | 942 ms | 664 ms | 26 ms | 4 ms |
| 12,500 | 1,091 ms | 764 ms | 29 ms | 4 ms |
| 15,000 | 1,351 ms | 906 ms | 35 ms | 5 ms |
| 20,000 | 1,704 ms | 1,262 ms | 43 ms | 6 ms |
| 25,000 | 2,032 ms | 1,467 ms | 56 ms | 7 ms |
| 50,000 | 4,358 ms | 3,151 ms | 115 ms | 16 ms |

Trend: roughly linear. No cliff at 10k.

---

## 17–18. Onboarding

- Search by brand, city, postcode works globally
- Max 3 gyms, real IDs, no raw ID display
- Mixed-country selection (UK + PL + AT) persists correctly
- **Popular/default list:** Denmark-centric cosmetic default in `OnboardingGymPicker.tsx` — does **not** block foreign search, auto-select Danish gym, or cause functional misrouting. Documented UX follow-up only.

---

## 19. Profile / favorites

Mixed-country saved gym IDs resolve correctly. Max 3 enforced. No `catalog[0]` fallback.

---

## 20–21. Nearest gym

Linear scan over 10,046 active gyms from 13 capital coordinates: **26 ms** (bench), worst observed **100 ms** (cold run). Nearest results are locally plausible. No wrong-country fallback.

### Missing coord safety

- Denmark: postal approximation allowed (legacy)
- Sweden: Stockholm fallback for null coords (`se_7f7137b434` only active null-coord row)
- **Confirmed:** invented coords do **not** leak into NO, DE, UK, FI, NL, FR, ES, IT, BE, PL, AT

---

## 22–25. Map

| Check | Result |
|-------|--------|
| Viewport filter before render | ✓ `filterMapCentersInRegion` |
| All 10,050 markers rendered | No |
| Pan/zoom rebuilds global index | No |
| Dense metros (London, Paris, Berlin, etc.) | Filter ~4–7 ms; pins selectable |
| Cross-border viewport | Foreign gyms may appear if in viewport; ID/country/check-in remain correct |
| Manual selection vs GPS refresh | Selected gym persists until explicit reset |

---

## 26–28. Check-in & auto-checkout

| Constant | Value | Verified |
|----------|-------|----------|
| `CHECK_IN_RADIUS_METERS` | 200 | ✓ |
| `AUTO_CHECKOUT_DISTANCE_METERS` | 200 (= check-in) | ✓ |

Boundary: 201 m blocked, 200 m allowed, 199 m allowed. Selected gym coordinates are source of truth — no nearest substitution.

### Dense co-location cases (production)

- NO: SATS Triaden / MUDO — exact ID persists
- UK: close different-brand pairs — exact ID persists
- BE: dense Basic-Fit/JIMS — exact ID persists
- PL: Well Fitness / Zdrofit ~36 m — exact ID persists
- AT: MYGYM Salzburg ZIB / clever fit PREMIUM; John Harris ~60 m — exact ID persists

Auto-checkout uses **active session gym ID**, not nearest. Repeated location updates: no duplicate checkout or gym switching.

---

## 29–35. Core flows

| Flow | Catalog-size independent | Mixed-country safe |
|------|--------------------------|-------------------|
| Workout log | ✓ | ✓ |
| PR system | ✓ | ✓ |
| History ID resolution | ✓ (map lookup) | ✓ |
| Feed / share | ✓ | ✓ |
| Notifications centerId | ✓ | ✓ |
| Planned sessions picker | ✓ | ✓ |
| Chat / invites | ✓ — no `getActiveGyms()[0]` fallback | ✓ |

---

## 36. Orphan ID safety

Prefixes `gb_`, `de_`, `it_`, `pl_`, `at_` nonexistent IDs → safe stub via `resolveGymOrStub` / `unresolvedGymStub`. Never Danish gym, nearest gym, or `catalog[0]`.

---

## 37. Country labels

All 13 countries have translation keys in `en`, `da`, `sv`, `nb`. No missing keys for active locales.

---

## 38. Encoding / mojibake

Full 10,050 row scan: **0** mojibake hits. Legitimate Nordic, German, French, Spanish, Italian, Polish, Dutch/Flemish characters preserved.

---

## 39. Duplicate audit (suspicious clusters only)

| Type | Count | Notes |
|------|-------|-------|
| Duplicate IDs | 0 | — |
| Same-country same-brand exact address | 33 | Mostly legacy DK postal-approx clusters |
| Same-country same-brand identical coords | 20 | Largely DK 0 m postal clusters |
| Same-country same-brand ≤25 m | 22 | Mostly DK legacy; documented AT/PL proximity pairs retained intentionally |

Cross-brand co-locations and cross-border proximity not treated as duplicates.

---

## 40. Country count regression (re-verified)

All 13 counts match expected. Total 10,050, active 10,046.

---

## 41. Automated regression suite

```
npm test -- --testPathPattern='GymQa|MergeSafety|catalogScale|global10k|mapVisible|autoCheckout|workoutLog|gymSearch|italyCompleteness'
```

| Metric | Value |
|--------|-------|
| Suites | 23 |
| Tests passed | 1,649 |
| Tests failed | 0 |
| Runtime | ~67 s |

Includes all `*GymQa.test.ts`, merge safety, catalog scale prep, `global10kStressQa`, map, auto-checkout, workout log, gym search Sweden, italy completeness.

---

## 42. New global test suite

**File:** `__tests__/global10kStressQa.test.ts`  
**Tests:** 131 — all passed

Covers: baseline counts, integrity, prefixes, partitioning, O(1) lookup, active cache, search index caching, 13-country brand/city search, diacritics, postcodes, typing stress, worst-case, nearest, map viewport, 200 m check-in, co-locations, orphan IDs, country labels, bundle size, onboarding cosmetic check.

---

## 43–44. Performance threshold assessment

| Area | ms (10,050 warm) | Classification | Reasoning |
|------|------------------|----------------|-----------|
| Catalog parse | 12 | GOOD | Sub-20 ms |
| Cold search index | 850–1050 | ACCEPTABLE | One-time; cached thereafter |
| Cached search index | 0 | GOOD | Module cache |
| Typical search | 600–650 | ACCEPTABLE | Acceptable for picker UX; monitor at 20k+ |
| Worst search | 150–380 | GOOD | Short/wide queries faster than brand |
| Nearest (10k scan) | 22–100 | GOOD | Linear but fast at 10k |
| Map build | 32 | GOOD | One-time preprocessing |
| Viewport filter | 4 | GOOD | O(visible) not O(10k) |
| ID lookup | <200 ms / 5000× | GOOD | Map-based |

**No performance blocker** identified for 10,050 client-side catalog.

---

## 45. Physical device test plan

**Automated device tests in repo:** None

**Status:** PHYSICAL DEVICE FOLLOW-UP REQUIRED

### Manual checklist

#### A. Modern iPhone
- [ ] Cold launch (force quit → open)
- [ ] Home load
- [ ] Open check-in → first gym search
- [ ] Rapid typing in search (`ber`, `berlin`, `fitinn`)
- [ ] Open map → pan/zoom dense city (London/Paris)
- [ ] Select dense pin
- [ ] Nearest gym suggestion
- [ ] Start check-in at 200 m boundary
- [ ] Workout log during session
- [ ] Finish session → history displays correct gym name

#### B. Mid-range / slower phone
- [ ] Same checklist as A
- [ ] Note cold launch + first search latency

---

## 46. Cold-launch risk

| Risk | Assessment |
|------|------------|
| Bundle size (~3 MB JSON) | ACCEPTABLE — no startup blocker evidenced |
| Parse at import | ~12 ms Node; device TBD |
| Search index on first search | ~1 s one-time; acceptable if deferred to first picker open |
| Memory | Linear growth; monitor at 15–20k |

**No evidence requiring immediate server migration.**

---

## 47–48. Architecture decision

### Decision: **KEEP CLIENT-SIDE**

At 10,050 centers, search, map, nearest, memory, and bundle remain acceptable in automated benchmarks. No genuine blocker proven.

| Threshold | Guidance |
|-----------|----------|
| Safe now | ≤10,050 ✓ |
| Monitor | ~15,000 (cold index ~1.3 s, typical search ~900 ms synthetic) |
| Begin migration planning | ~20,000–25,000 (cold index ~1.7–2.0 s, typical search ~1.3–1.5 s) |
| Likely required migration | ~40,000–50,000+ (cold index ~4+ s, typical search ~3+ s synthetic) |

---

## 49. Bugs

### Found
- `workoutLog.test.ts` suite failed to load due to missing AsyncStorage Jest mock (pre-existing infrastructure gap, not catalog regression)

### Fixed
- Added AsyncStorage mock to `__tests__/workoutLog.test.ts` — suite now runs (88 tests pass)

### Production code bugs found
- **None**

---

## 50. Global ready gate

| Gate | Status |
|------|--------|
| Catalog integrity | PASS |
| Country counts | PASS |
| ID lookup | PASS |
| Global search | PASS |
| Nearest / map | PASS |
| 200 m check-in / auto-checkout | PASS |
| Core flows | PASS |
| Orphan IDs | PASS |
| Encoding | PASS |
| Automated tests | PASS (1,649/1,649) |
| Performance blocker | None |
| Physical device | FOLLOW-UP REQUIRED |

---

## 51. Expansion lock

**Country expansion:** UNLOCKED (pending physical device follow-up only)

Do not start another country in this task.

---

## Files changed (this QA task)

| File | Change |
|------|--------|
| `__tests__/global10kStressQa.test.ts` | **NEW** — 131 global stress tests |
| `__tests__/workoutLog.test.ts` | AsyncStorage Jest mock (suite load fix) |
| `__tests__/franceCatalogScalePrep.test.ts` | Baseline 10,050 |
| `__tests__/spainCatalogScalePrep.test.ts` | Baseline 10,050 |
| `__tests__/belgiumCatalogScalingPrep.test.ts` | Baseline 10,050 |
| `__tests__/italyCatalogScalePrep.test.ts` | Baseline 10,050 |
| `__tests__/germanyGymQa.test.ts` | Baseline 10,050 |
| `__tests__/netherlandsGymQa.test.ts` | Baseline 10,050 |
| `__tests__/finlandGymQa.test.ts` | Baseline 10,050 |
| `__tests__/ukGymQa.test.ts` | Baseline 10,050 |
| `__tests__/franceGymQa.test.ts` | Baseline 10,050 |
| `__tests__/spainGymQa.test.ts` | Baseline 10,050 |
| `__tests__/italyGymQa.test.ts` | Baseline 10,050 |
| `__tests__/belgiumGymQa.test.ts` | Baseline 10,050 |
| `__tests__/italyCompletenessQa.test.ts` | Baseline 10,050 |
| `data/global/GLOBAL_10K_STRESS_QA_REPORT.md` | **NEW** — this report |
| `data/global/GLOBAL_10K_STRESS_QA_REPORT.json` | **NEW** — structured summary |

**Production catalog (`src/data/centers.json`):** not modified during global QA.

---

## FINAL VERDICT

**GLOBAL 10K+ STATUS: PASS — COUNTRY EXPANSION UNLOCKED**
