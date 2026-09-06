# Spain Production QA Report

**Date:** 2026-08-21
**Catalog version:** 8,143 centers (9 countries)
**Spain centers:** 976
**Test suite:** `__tests__/spainGymQa.test.ts` — **176/176 PASS**

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
| Spain | 976 | 976 | ✅ |
| **Total** | **8,143** | **8,143** | ✅ |

All ES rows: unique `es_*` ID, `country="Spain"`, `is_active=true`, finite lat/lng (no null/NaN/0,0), address/postal/city/brand/name present.

## 2. Brand Breakdown — ✅ PASS

| Brand | Count |
|-------|-------|
| VivaGym | 246 |
| Basic-Fit | 238 |
| Synergym | 142 |
| Fitness Park | 114 |
| Anytime Fitness | 57 |
| Forus | 47 |
| BeOne | 25 |
| DIR | 22 |
| Holiday Gym | 22 |
| Dreamfit | 20 |
| Enjoy! | 18 |
| GO fit | 13 |
| Altafit | 5 |
| Eurofitness | 3 |
| Metropolitan | 3 |
| O2 Centro Wellness | 1 |
| **Total** | **976** |

Matches merge report exactly.

## 3. Geography — ✅ PASS

| Region | Count |
|--------|-------|
| Mainland | 940 |
| Balearic | 14 |
| Canary | 22 |
| Ceuta | 0 |
| Melilla | 0 |
| Outlier | 0 |

- No Portugal / France / Andorra / Gibraltar / Morocco coordinate outliers
- Forus Porto absent from production
- Spain does not allow invented coordinates (missing coords → NaN, no Madrid fallback)

## 4. Postal Codes — ✅ PASS
- All 976 postcodes are 5-digit strings matching `/^\d{5}$/`
- 252 leading-zero postcodes preserved (e.g. Barcelona `08xxx`, Balearic `07xxx`)
- No numeric conversion detected

## 5. Encoding — ✅ PASS
- Zero mojibake in Spain catalog (`Ã`, `â€`, etc.)
- 453+ entries contain Spanish/Catalan/Basque/Galician diacritics (á, é, í, ó, ú, ü, ñ, ç)
- All preserved correctly

## 6. Brand Search — ✅ PASS
All 16 live Spain brands return `es_*` results (Madrid-biased location): VivaGym, Basic-Fit, Synergym, Fitness Park, Anytime Fitness, Forus, BeOne, DIR, Holiday Gym, Dreamfit, Enjoy!, GO fit, Altafit, Eurofitness, Metropolitan, O2 Centro Wellness.

## 7. City Search — ✅ PASS
All 17 cities return `es_*` results: Madrid, Barcelona, Valencia, Sevilla, Zaragoza, Málaga, Murcia, Palma, Bilbao, Alicante, Córdoba, Valladolid, Vigo, A Coruña, Granada, Las Palmas, Santa Cruz de Tenerife.

## 8. Regional/Accent Search — ✅ PASS
- "Coruna" → A Coruña gyms ✅
- "Malaga" → Málaga gyms ✅
- "Cordoba" → Córdoba gyms ✅

Shared normalization + Spanish city aliases in `extractArea()`.

## 9. Postal Search — ✅ PASS
28019, 08029, 29007, 48004, 07012, 35018, 15006 all return `es_*` results.

## 10. Onboarding — ✅ PASS
- 976 ES centers in active gym list
- `es_*` ID resolves correctly
- Brand/city/postal search works
- Mixed-country search (Basic-Fit) returns multiple countries

## 11. Profile/Favorites — ✅ PASS
- `es_*` lookup works
- Display name shown (not raw ID, not "Ubekendt center")

## 12. Nearest Gym — ✅ PASS
Tested: Madrid, Barcelona, Valencia, Sevilla, Málaga, Bilbao, Palma, Las Palmas, Santa Cruz de Tenerife. All return local `es_*`. Madrid coords against full catalog returns `es_*` (no DK/SE fallback).

## 13. Dense/Nearby — ✅ PASS
- ≤50m: 1 pair; ≤100m: 13; ≤200m: 48
- Closest: ~41m (Basic-Fit + VivaGym, Oviedo)
- Different brands coexist as separate `es_*` entries

## 14. 200m Check-in — ✅ PASS

| Distance | Result |
|----------|--------|
| 500m | Blocked (set_away) |
| 250m | Blocked (set_away) |
| 201m | Blocked (set_away) |
| 200m | Allowed |
| 199m | Allowed |
| 100m | Allowed |
| 10m | Allowed |

CHECK_IN_RADIUS_METERS = 200, AUTO_CHECKOUT_DISTANCE_METERS = 200 (unchanged).

## 15. Auto-Checkout — ✅ PASS
200m = inside, 201m+ = checkout. Session gym ID only, no nearest switching.

## 16. Workout/PR — ✅ PASS
ES gym resolves. Country is irrelevant to exercise logging.

## 17. History — ✅ PASS
`es_*` resolves to correct name. No raw ID displayed.

## 18. Feed/Share — ✅ PASS
ES sessions retain gym ID/name/city/country. No Danish fallback.

## 19. Notifications — ✅ PASS
`es_*` gymId resolves. Visible name, no "Unknown gym", no catalog[0].

## 20. Planned Sessions — ✅ PASS
ES centers selectable and persist round-trip.

## 21. Map — ✅ PASS
Tested Madrid, Barcelona, Valencia, Sevilla, Málaga, Bilbao, Palma, Las Palmas viewports. All show appropriate `es_*` pins.

## 22. Mesa y López Exclusion — ✅ PASS
- `es_e13a21a4c1` (Synergym Las Palmas Mesa y López) = COMING_SOON in staging
- Not in production catalog
- Not searchable

## 23. Forus Porto Exclusion — ✅ PASS
- `es_42caeb0614` (Forus Porto) = NEEDS_REVIEW, country=Portugal in staging
- Not in Spain production
- Zero Portugal rows in live catalog

## 24. Country Labels i18n — ✅ PASS
- `gymCountryTranslationKey('Spain')` → `'countries.spain'`
- en: "Spain", da: "Spanien", sv: "Spanien", nb: "Spania"
- `gymPickerLocationLine` includes city + "Spain"
- Orphan `es_*` stub region = `España`

## 25. Search Stress Typing — ✅ PASS
Prefix paths: m→madrid, b→barcelona, basic, synergym, fitness park all return results; longer queries include `es_*`.

## 26–28. Regressions — ✅ ALL PASS

| Country | Count | Search | Status |
|---------|-------|--------|--------|
| Denmark | 354 | PureGym ✅ | ✅ |
| Sweden | 639 | SATS Stockholm ✅ | ✅ |
| Norway | 535 | SATS Oslo ✅ | ✅ |
| Finland | 429 | Elixia Helsinki ✅ | ✅ |
| Germany | 1,424 | clever fit Berlin ✅ | ✅ |
| United Kingdom | 1,474 | PureGym London ✅ | ✅ |
| Netherlands | 600 | Basic-Fit Amsterdam ✅ | ✅ |
| France | 1,712 | Basic-Fit Paris ✅ | ✅ |

## 29. Performance — ✅ PASS
- Search index build: <3,000ms for 8,143 centers (bench live indexMs ≈ 1,013ms)
- Search query: <500ms
- Nearest gym scan: <100ms
- `npm run bench:catalog` on real 8143: PASS

### bench:catalog (live 8143 excerpt)
| Metric | ms |
|--------|-----|
| indexMs | 1013 |
| typicalSearch3qMs | 822 |
| nearestMs | 32 |
| mapFilterMs | 6 |

## 30. Test Results — ✅ ALL PASS

| Suite | Result |
|-------|--------|
| `__tests__/spainGymQa.test.ts` | **176/176** |
| `__tests__/spainCatalogScalePrep.test.ts` | **15/15** |
| `__tests__/franceGymQa.test.ts` | **146/146** |
| `__tests__/franceCatalogScalePrep.test.ts` | **15/15** |
| `__tests__/netherlandsGymQa.test.ts` | **115/115** |
| `__tests__/finlandGymQa.test.ts` | **104/104** |
| `__tests__/ukGymQa.test.ts` | **53/53** |
| `__tests__/germanyGymQa.test.ts` | **42/42** |
| `__tests__/norwayGymQa.test.ts` | **30/30** |
| `__tests__/catalogScalePrep.test.ts` | **6/6** |
| **Total** | **702/702** |

## 31. Bugs Found & Fixed

### BUG-1: Missing Spanish brand search aliases
**Severity:** Low
**Description:** No CHAIN_ALIASES for Spain-only brands (VivaGym, Synergym, BeOne, Holiday Gym, Dreamfit, Enjoy!, GO fit, Altafit, Eurofitness, Metropolitan, O2 Centro Wellness, Forus, DIR). ASCII/spaced variants would miss matches.
**Fix:** Added Spanish brand alias entries to `CHAIN_ALIASES` in `gymSearchIndex.ts`.

### BUG-2: Missing Spanish city search aliases
**Severity:** Low
**Description:** No city aliases for Spanish cities in `extractArea()`. Accent/ASCII variants (Coruña/Coruna, Málaga/Malaga, Córdoba/Cordoba) and compound names (Palma de Mallorca, Las Palmas, Santa Cruz de Tenerife) had no aliases.
**Fix:** Added `spanishCities` array (17 city alias groups) to `extractArea()` in `gymSearchIndex.ts`.

### BUG-3: UK address mojibake (regression surface)
**Severity:** Low (UK data integrity; surfaced by UK QA after catalog growth)
**Description:** Two GB addresses contained mojibake en-dashes (`â€“`) instead of Unicode en-dash.
**Fix:** Corrected addresses for `gb_9f461d6872` and `gb_8bd17ae45d` in `centers.json`.

### BUG-4: Stale catalog totals in pre-Spain suites
**Severity:** None (test maintenance)
**Description:** Related QA/prep suites still asserted 7167 or 5455.
**Fix:** Updated to 8143 (+ Spain where applicable).

## 32. Files Changed

| File | Change |
|------|--------|
| `src/services/gymSearch/gymSearchIndex.ts` | Spanish brand + city search aliases |
| `src/data/centers.json` | Fixed 2 UK mojibake addresses |
| `__tests__/spainGymQa.test.ts` | **NEW** — 176 comprehensive QA tests |
| `__tests__/spainCatalogScalePrep.test.ts` | Updated to 8143 + Spain 976 |
| `__tests__/franceGymQa.test.ts` | Catalog total 8143 |
| `__tests__/franceCatalogScalePrep.test.ts` | Catalog total 8143 + Spain |
| `__tests__/netherlandsGymQa.test.ts` | Catalog total 8143 |
| `__tests__/finlandGymQa.test.ts` | Catalog total 8143 |
| `__tests__/ukGymQa.test.ts` | Catalog total 8143 |
| `__tests__/germanyGymQa.test.ts` | Catalog total 8143 |
| `__tests__/catalogScalePrep.test.ts` | Catalog total 8143 |
| `data/spain/SPAIN_QA_REPORT.md` | **NEW** — this report |

## 33. Remaining Risks / Known Legacy

1. **SE Stockholm fallback** — `allowsInventedCoordinates('Sweden')` still true (legacy).
2. **DK postal approx coords** — `allowsInventedCoordinates('Denmark')` still true (legacy).
3. **DK onboarding popular list** — `POPULAR_ONBOARDING_GYM_IDS` remains Denmark-only; Spain users rely on search (documented; not changed in this QA).
4. **Staging backlog** — 92 NEEDS_COORDINATES, 64 DUPLICATE, 3 NEEDS_REVIEW, 5 COMING_SOON remain out of production by design.
5. **Ceuta/Melilla** — 0 live gyms; Canaries covered (22).

## 34. 10K Checkpoint

| Metric | Value |
|--------|-------|
| Live catalog | 8,143 |
| Headroom to 10k | 1,857 |
| Stress QA required | **NO** |

---

## SPAIN STATUS: READY
