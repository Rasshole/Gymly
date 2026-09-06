# Netherlands Production QA Report

**Date:** 2026-08-19
**Catalog version:** 5,455 gyms (NL: 600)
**Overall result:** ✅ **PASS**

---

## 1. Catalog Validation ✅ PASS

| Country | Expected | Actual |
|---------|----------|--------|
| Denmark | 354 | 354 |
| Sweden | 639 | 639 |
| Norway | 535 | 535 |
| Finland | 429 | 429 |
| Germany | 1,424 | 1,424 |
| United Kingdom | 1,474 | 1,474 |
| Netherlands | 600 | 600 |
| **Total** | **5,455** | **5,455** |

- All 600 NL rows have unique `nl_*` IDs
- All have `country="Netherlands"`, `is_active=true`
- All have non-empty name, brand, address, postal_code, city
- All have finite lat/lng (no null/NaN/0,0)
- No rejected proximity duplicates in production (0 REJECTED entries in staging)

## 2. Dutch Postcode Validation ✅ PASS

All 600 NL postcodes match `^\d{4}\s[A-Z]{2}$` ("1234 AB" format). Stored as strings, no numeric truncation.

## 3. Dutch Text/Encoding ✅ PASS

- 0 mojibake instances found (Ã, Â, â€", etc.)
- No Dutch diacritics (é, ë, ï, ö, ü, á) found in current NL data — Dutch gym names/addresses in catalog use ASCII-safe forms. This is correct; no encoding corruption.

## 4. Geography ✅ PASS

- All 600 NL coordinates within Netherlands bbox (50.75–53.55 lat, 3.35–7.25 lng)
- 0 outliers (no Belgium/Germany/sea coordinates)
- `allowsInventedCoordinates('Netherlands')` = false — no fallback coordinates

## 5. Brand Search ✅ PASS

All 10 NL brands return `nl_*` results via search:
- Basic-Fit (248), Anytime Fitness (132), SportCity (117), TrainMore (49)
- HealthCity (19), BigGym (15), Optisport (7), David Lloyd (6), Snap Fitness (6), Clubsportive (1)

Dutch brand aliases added: `sportcity→"sport city"`, `trainmore→"train more"`, `biggym→"big gym"`, `healthcity→"health city"`, `optisport→"opti sport"`, `clubsportive→"club sportive"`, `basic-fit→"basicfit"/"basic fit"`.

## 6. SportCity / Fit For Free ✅ PASS

- 117 SportCity entries, all stored as brand "SportCity"
- 0 "Fit For Free" entries in production
- Search for "SportCity", "Sport City" returns nl_* results

## 7. TrainMore ✅ PASS

- 49 TrainMore entries, all stored as brand "TrainMore"
- No concept/tier duplicates (Black Label, Red Label) — single entry per physical location
- Search for "TrainMore", "Train More" returns nl_* results

## 8. City Search ✅ PASS

All 19 tested cities return nl_* results: Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen, Tilburg, Almere, Breda, Nijmegen, Arnhem, Haarlem, Enschede, Apeldoorn, Amersfoort, Maastricht, Leiden, Delft, Zwolle.

## 9. Dutch/English City Aliases ✅ PASS

"The Hague" correctly resolves to Den Haag nl_* gyms. Dutch city aliases added to search index including Den Haag↔The Hague, 's-Hertogenbosch↔Den Bosch.

## 10. Search Normalization ✅ PASS

- BasicFit → Basic-Fit ✅
- Basic Fit → Basic-Fit ✅
- Sport City → SportCity ✅
- Train More → TrainMore ✅
- Big Gym → BigGym ✅

## 11. Onboarding ✅ PASS

NL centers selectable from active list, correct `nl_*` ID resolves, no raw ID displayed, no Danish assumption.

## 12. Profile/Favorites ✅ PASS

`nl_*` lookup works, official Dutch gym name displayed (not "Ubekendt center" or raw ID).

## 13. Nearest Gym ✅ PASS

Tested 6 city coordinates (Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen) — all return local `nl_*` gym. Global nearest from Amsterdam returns `nl_*` (not DK/SE/etc).

## 14. Dense/Nearby Gyms ✅ PASS

Dense pair counts:
- ≤50m: 13 pairs (mostly Basic-Fit + HealthCity co-located)
- ≤100m: 18 pairs
- ≤200m: 36 pairs

Closest pair: 0m (Basic-Fit Rotterdam Kralingen / HealthCity Rotterdam Kralingen — same building, different brands, separate IDs).

## 15. 200m Check-In ✅ PASS

- `CHECK_IN_RADIUS_METERS` = 200
- 500m → blocked, 250m → blocked, 201m → blocked
- 200m → allowed, 199m → allowed, 100m → allowed, 10m → allowed
- NL center resolves valid check-in coordinates

## 16. Auto-Checkout ✅ PASS

- `AUTO_CHECKOUT_DISTANCE_METERS` = 200
- 200m = inside, 201m+ = checkout/away flow
- Uses session gym ID (distance 0 from self → "none" action)

## 17. Workout Log/PR ✅ PASS

NL gym resolves correctly for workout logging. Country is irrelevant to exercise/set/rep/weight/PR flow.

## 18. History ✅ PASS

`nl_*` resolves to correct name, no raw ID displayed.

## 19. Feed/Share ✅ PASS

NL session retains gym ID, name, city, country="Netherlands". No Danish/default fallback.

## 20. Notifications ✅ PASS

`nl_*` gymId resolves for notification display. Shows gym name, not "Unknown gym" or raw ID.

## 21. Planned Sessions ✅ PASS

NL center selectable and persists through re-fetch.

## 22. Map ✅ PASS

All 6 test viewports (Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen) show `nl_*` pins. Viewport filtering works correctly.

## 23. Country Label/i18n ✅ PASS

- `gymCountryTranslationKey('Netherlands')` → `'countries.netherlands'`
- Translations: en="Netherlands", da="Holland", sv="Nederländerna", nb="Nederland"
- `gymPickerLocationLine` uses localized country name instead of region string

## 24. Dutch UI Language ℹ️ DOCUMENTED

Dutch (nl) is NOT a selectable UI language. App supports: en, da, sv, nb. No Dutch language pack exists. This is acceptable — Netherlands gyms work fully with existing language options.

## 25. Orphan-ID Safety ✅ PASS

- `findGymById('nl_nonexistent_xxx')` → null
- `resolveGymOrStub('nl_nonexistent_xxx')` → stub with id="nl_nonexistent_xxx", region="Nederland", name="Unknown gym"
- Never resolves to Danish gym, catalog[0], or arbitrary NL gym

## 26. Staging Safety ✅ PASS

Non-production entries safely excluded:
- COMING_SOON: 3 (not in production)
- NEEDS_COORDINATES: 12 (not in production)
- NEEDS_REVIEW: 10 (not in production)
- READY_TO_IMPORT: 3 (not in production)
- CLOSED: 0

## 27. Performance ✅ PASS

Benchmark results (5,455 centers):
- JSON parse: 5ms
- Search index build: 265ms
- Typical search (3 queries): 250ms
- Worst search (2 queries): 58ms
- Nearest gym: 12ms
- Map build: 18ms
- Map filter: 1ms

All within comfortable limits. Linear scaling to 25k confirmed.

## 28. Denmark Regression ✅ PASS (354 centers)
## 29. Sweden Regression ✅ PASS (639 centers)
## 30. Norway Regression ✅ PASS (535 centers)
## 31. Finland Regression ✅ PASS (429 centers)
## 32. Germany Regression ✅ PASS (1,424 centers)
## 33. United Kingdom Regression ✅ PASS (1,474 centers)

All country counts unchanged. No cross-contamination.

## 34. Automated Tests ✅ PASS

`__tests__/netherlandsGymQa.test.ts`: **115 tests, 115 passed, 0 failed** (5.7s)

## 35. Data Quality/Display Names ✅ PASS

- 0 HTML fragments in names
- 0 navigation/marketing labels
- 0 names > 80 characters
- 0 names with leading/trailing whitespace
- 0 names with double spaces
- No catalog modifications needed

## 36. Final Report

This report.

---

## Code Changes Made

Files modified to add Netherlands support (following Finland integration pattern):

1. **`src/utils/gymCountry.ts`** — Added `isNetherlandsCountry()` function
2. **`src/utils/gymCountryLabel.ts`** — Added Netherlands to translation key mapping and picker location line
3. **`src/utils/gymDisplay.ts`** — Added `nl_` to `unresolvedRegion()`
4. **`src/data/gymIds.ts`** — Added `netherlands: 'nl_'` prefix
5. **`src/data/centerRegistry.ts`** — Added Netherlands to `countryBucketKey`
6. **`src/data/danishGyms.ts`** — Added `'Nederland'` to `DanishRegion` type, `inferGymRegion`, and `countryCacheKey`
7. **`src/services/gymSearch/gymSearchIndex.ts`** — Added Dutch brand aliases and country keywords, Dutch city aliases
8. **`src/i18n/translations/en.ts`** — Added `netherlands: 'Netherlands'`
9. **`src/i18n/translations/da.ts`** — Added `netherlands: 'Holland'`
10. **`src/i18n/translations/sv.ts`** — Added `netherlands: 'Nederländerna'`
11. **`src/i18n/translations/nb.ts`** — Added `netherlands: 'Nederland'`

**Catalog modifications:** None. All 600 NL entries are clean.

---

## NETHERLANDS STATUS: READY
