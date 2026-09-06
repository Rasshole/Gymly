# France Production QA Report

**Date:** 2026-08-19
**Catalog version:** 7,167 centers (8 countries)
**France centers:** 1,712
**Test suite:** `__tests__/franceGymQa.test.ts` — **146/146 PASS**

---

## 1. Catalog Integrity — ✅ PASS

| Country | Expected | Actual | Status |
|---------|----------|--------|--------|
| Denmark | 354 | 354 | ✅ |
| Sweden | 639 | 639 | ✅ |
| Norway | 535 | 535 | ✅ |
| Finland | 429 | 429 | ✅ |
| Germany | 1,424 | 1,424 | ✅ |
| United Kingdom | 1,474 | 1,474 | ✅ |
| Netherlands | 600 | 600 | ✅ |
| France | 1,712 | 1,712 | ✅ |
| **Total** | **7,167** | **7,167** | ✅ |

All FR rows: unique `fr_*` ID, `country="France"`, `is_active=true`, finite lat/lng (no null/NaN/0,0), address/postal/city present.

## 2. Merge Difference (1,902 → 1,712) — ✅ VERIFIED

| Reason | Count |
|--------|-------|
| Inactive (closed/coming soon) | 168 |
| Duplicate (same address+brand) | 15 |
| Duplicate (proximity <100m) | 6 |
| Missing address | 1 |
| **Total withheld** | **190** |

**1,902 candidates − 190 withheld = 1,712 inserted.** ✅

Staging breakdown: 1,712 MERGED_INTO_CATALOG, 9 COMING_SOON, 190 READY_TO_IMPORT, 63 NEEDS_REVIEW, 169 NEEDS_COORDINATES (total staging: 2,143). No legitimate active center was accidentally excluded. None entered production under another ID.

## 3. Brand Breakdown — ✅ PASS

| Brand | Count |
|-------|-------|
| Basic-Fit | 892 |
| Fitness Park | 266 |
| Keepcool | 197 |
| L'Orange Bleue | 169 |
| L'Appart Fitness | 109 |
| Elancia | 28 |
| Vita Liberté | 22 |
| ON AIR Fitness | 20 |
| Anytime Fitness | 3 |
| Gigafit | 3 |
| Magic Form | 2 |
| Neoness | 1 |
| **Total** | **1,712** |

Matches merge report exactly.

## 4. Encoding — ✅ PASS
- Zero mojibake (Ã, â€, etc.)
- 707+ entries contain French diacritics (é, è, ê, ë, à, â, î, ï, ô, ù, û, ü, ç, œ, æ)
- All preserved correctly

## 5. Postal Codes — ✅ PASS
- All 1,712 postcodes are 5-digit strings matching `/^\d{5}$/`
- 107 leading-zero postcodes preserved (e.g., 06000, 01000)
- No numeric conversion detected

## 6. Geography — ✅ PASS
- **Metropolitan France:** 1,705 (lat 41.3–51.1, lng −5.2–9.6)
- **Overseas (DOM-TOM):** 7
  - 1 Guadeloupe (97122)
  - 1 Martinique (97200)
  - 5 Réunion (97430, 97438, 97450, 97494 ×2)
- All overseas have 97xxx postcodes ✅
- No BE/LU/DE/CH/IT/ES/UK outliers
- France does not allow invented coordinates ✅

## 7. Brand Search — ✅ PASS
All 12 brands return `fr_*` results: Basic-Fit, Fitness Park, L'Orange Bleue, Keepcool, ON AIR Fitness, Neoness, L'Appart Fitness, Elancia, Gigafit, Magic Form, Vita Liberté, Anytime Fitness.

## 8. City Search — ✅ PASS
All 20 cities return `fr_*` results: Paris, Marseille, Lyon, Toulouse, Nice, Nantes, Montpellier, Strasbourg, Bordeaux, Lille, Rennes, Reims, Le Havre, Saint-Étienne, Toulon, Grenoble, Dijon, Angers, Nîmes, Clermont-Ferrand.

## 9. Diacritic/ASCII Search — ✅ PASS
- "Saint-Etienne" → finds Saint-Étienne gyms ✅
- "Nimes" → finds Nîmes gyms ✅
- "Orleans" → finds Orléans gyms ✅

Shared normalization strips accents for matching.

## 10. Postal Search — ✅ PASS
75001, 69001, 13001, 31000, 06000 all return `fr_*` results.

## 11. Country Labels — ✅ PASS
- `gymCountryTranslationKey('France')` → `'countries.france'`
- en: "France", da: "Frankrig", sv: "Frankrike", nb: "Frankrike"
- `gymPickerLocationLine` includes city + "France"

## 12. Onboarding — ✅ PASS
- FR centers in active gym list
- `fr_*` ID resolves correctly
- Brand/city/postal search works
- Mixed-country search returns multiple countries

## 13. Profile/Favorites — ✅ PASS
- `fr_*` lookup works, persists
- Display name shown (not raw ID, not "Ubekendt center")

## 14. Nearest Gym — ✅ PASS
Tested: Paris, Marseille, Lyon, Toulouse, Nice, Bordeaux, Lille, Strasbourg. All return local `fr_*`. Paris coords against full catalog returns `fr_*` (no DK/SE/etc fallback).

## 15. Dense/Nearby — ✅ PASS
- 6 pairs ≤50m, 21 pairs ≤100m, 51 pairs ≤200m
- Different brands coexist as separate entries
- Closest pair: 17m apart (fr_995ba139fb / fr_3b4d451685)

## 16. 200m Check-in — ✅ PASS
| Distance | Result |
|----------|--------|
| 500m | Blocked (set_away) |
| 250m | Blocked (set_away) |
| 201m | Blocked (set_away) |
| 200m | Allowed |
| 199m | Allowed |
| 100m | Allowed |
| 10m | Allowed |

CHECK_IN_RADIUS_METERS = 200, AUTO_CHECKOUT_DISTANCE_METERS = 200.

## 17. Auto-Checkout — ✅ PASS
200m = inside, 201m+ = checkout. Session gym ID only, no nearest switching.

## 18. Workout/PR — ✅ PASS
FR gym resolves. Country is irrelevant to exercise logging.

## 19. History — ✅ PASS
`fr_*` resolves to correct name. No raw ID displayed.

## 20. Feed/Share — ✅ PASS
FR sessions retain gym ID/name/city/country. No Danish fallback.

## 21. Notifications — ✅ PASS
`fr_*` gymId resolves. Visible name, no "Unknown gym", no catalog[0].

## 22. Planned Sessions — ✅ PASS
FR centers selectable and persist round-trip.

## 23. Map — ✅ PASS
Tested Paris, Marseille, Lyon, Toulouse, Nice, Bordeaux, Lille viewports. All show appropriate `fr_*` pins with viewport filtering.

## 24. Inactive/Withheld — ✅ PASS
168 inactive not in production. Not searchable. Not selectable.

## 25–31. Regressions — ✅ ALL PASS

| Country | Count | Search | Status |
|---------|-------|--------|--------|
| Denmark | 354 | PureGym ✅ | ✅ |
| Sweden | 639 | SATS Stockholm ✅ | ✅ |
| Norway | 535 | SATS Oslo ✅ | ✅ |
| Finland | 429 | Elixia Helsinki ✅ | ✅ |
| Germany | 1,424 | clever fit Berlin ✅ | ✅ |
| United Kingdom | 1,474 | PureGym London ✅ | ✅ |
| Netherlands | 600 | Basic-Fit Amsterdam ✅ | ✅ |

## 32. Performance — ✅ PASS
- Search index build: <3,000ms for 7,167 centers
- Search query: <500ms
- Nearest gym scan: <100ms

## 33. Test Results — ✅ ALL PASS
- `__tests__/franceGymQa.test.ts`: **146/146 pass**
- `__tests__/franceCatalogScalePrep.test.ts`: **15/15 pass**
- `__tests__/netherlandsGymQa.test.ts`: **115/115 pass**
- **Total: 276/276 pass**

## 34. Bugs Found & Fixed

### BUG-1: Missing French brand search aliases
**Severity:** Low
**Description:** No CHAIN_ALIASES for French brands (Fitness Park, L'Orange Bleue, Keepcool, ON AIR Fitness, Neoness, L'Appart Fitness, Elancia, Gigafit, Magic Form, Vita Liberté). Searching "lorange bleue" or "lappart fitness" would not match.
**Fix:** Added 11 French brand alias entries to `CHAIN_ALIASES` in `gymSearchIndex.ts`.

### BUG-2: Missing French city search aliases
**Severity:** Low
**Description:** No city aliases for French cities in `extractArea()`. Diacritic variants (Saint-Étienne↔Saint-Etienne, Nîmes↔Nimes, Orléans↔Orleans) and compound city names (Clermont-Ferrand, Aix-en-Provence) had no aliases.
**Fix:** Added `frenchCities` array with 29 French city alias entries to `extractArea()` in `gymSearchIndex.ts`.

### BUG-3: Stale catalog count in pre-existing tests
**Severity:** None (test maintenance)
**Description:** `franceCatalogScalePrep.test.ts` and `netherlandsGymQa.test.ts` still referenced 5,455 (pre-France catalog size).
**Fix:** Updated to 7,167. Updated NL performance test threshold.

## 35. Files Changed

| File | Change |
|------|--------|
| `src/services/gymSearch/gymSearchIndex.ts` | Added French brand aliases (11) and city aliases (29) |
| `__tests__/franceGymQa.test.ts` | **NEW** — 146 comprehensive QA tests |
| `__tests__/franceCatalogScalePrep.test.ts` | Updated catalog count 5455→7167 |
| `__tests__/netherlandsGymQa.test.ts` | Updated catalog count 5455→7167, perf threshold |
| `data/france/FRANCE_QA_REPORT.md` | **NEW** — this report |

## 36. Remaining Risks

1. **No `npm run bench:catalog` script found** — performance tested via Jest timing assertions instead. Consider adding a dedicated benchmark script.
2. **169 NEEDS_COORDINATES entries** in staging could be activated once geocoded.
3. **63 NEEDS_REVIEW entries** in staging require manual verification before import.
4. **DOM-TOM coverage limited** — only 7 overseas gyms (Guadeloupe, Martinique, Réunion). No coverage for Guyane, Mayotte, New Caledonia, Polynesia.

---

## FRANCE STATUS: READY
