# SWITZERLAND CATALOG SCALING PREP

**Date:** 2026-08-22  
**Status:** READY FOR SWITZERLAND PHASE 1  
**Production catalog modified:** No

---

## Current production baseline (verified)

| Country | Rows |
|---------|------|
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
| Poland | 621 |
| Austria | 335 |
| **TOTAL** | **10,050** |
| **ACTIVE** | **10,046** |
| **Switzerland** | **0** |

No pre-existing `ch_*` IDs in `src/data/centers.json`.

---

## Switzerland country support added

| Item | Value |
|------|-------|
| Canonical country | `"Switzerland"` |
| ID prefix | `ch_*` (not `sw_*`, `swi_*`, `che_*`) |
| Region bucket | `Schweiz` |
| Invented coordinates | **No** (modern rule) |

### Country labels (all active locales)

| Locale | Label |
|--------|-------|
| EN | Switzerland |
| DA | Schweiz |
| SV | Schweiz |
| NB | Sveits |

### Country detection aliases

`switzerland`, `ch`, `schweiz`, `suisse`, `svizzera`, `die schweiz`, `la suisse`

**Liechtenstein:** separate (`isLiechtensteinCountry`) — never classified as Switzerland.

---

## Multilingual handling

Stored official text (names, addresses, cities, brands) remains unchanged.

Search supports German, French, and Italian locality text via:

- Existing `GERMAN_MAP` + NFD diacritic folding (German/French/Italian accents)
- Apostrophe/hyphen stripping in `normalizeGymSearchValue` (search-only)
- Swiss city alias table in `gymSearchIndex.ts` (`extractArea`)

### City aliases (search-only)

| Official / stored | Search aliases |
|-------------------|----------------|
| Zürich | Zurich |
| Genève | Geneva, Genf, Geneve |
| Basel | Bâle, Basilea |
| Bern | Berne, Berna |
| Luzern | Lucerne |
| St. Gallen | Saint-Gall, Sankt Gallen |
| Biel/Bienne | Biel, Bienne |
| Fribourg | Freiburg |
| Neuchâtel | Neuenburg, Neuchatel |

Also: Lausanne, Lugano, Winterthur.

---

## Postcode behavior

- Format: 4 digits, stored as **string** (`^\d{4}$`)
- Examples: `8001`, `1201`, `3001`, `4001`
- **Collision note:** Austria (`1010`) and Belgium (`1000`) also use 4-digit codes
- Search disambiguation: country + city context on center row, not postcode alone

---

## Coordinate policy

Switzerland follows the modern Gymly rule:

- **Never** invent coordinates (no Zurich/Bern centroid, no postcode approximation)
- Missing coords → `NaN` via `getEffectiveLatLng` → not check-in eligible
- `allowsInventedCoordinates('Switzerland') === false`

Future Phase 1 merge must require trustworthy coordinates before `READY_TO_IMPORT`.

---

## Orphan ID behavior

`ch_nonexistent_test` → safe stub:

- `region`: `Schweiz`
- `name`: `Unknown gym`
- Never resolves to Danish/German/Austrian gym, nearest gym, or `catalog[0]`

---

## Border / Liechtenstein safety

- Liechtenstein is **not** Switzerland (`isLiechtensteinCountry` separate)
- Neighbor countries (FR, DE, AT, IT) remain distinct via `isSwitzerlandCountry` / center `country` field
- Future Phase 1: geographic validation must not reject valid border Swiss gyms; must not accept foreign coords as Swiss
- Liechtenstein gyms must use separate country assignment when added later

---

## Check-in / auto-checkout

Unchanged global constants:

- `CHECK_IN_RADIUS_METERS = 200`
- `AUTO_CHECKOUT_DISTANCE_METERS = 200`
- Session gym ID is source of truth (no Swiss-specific logic)

---

## Live 10,050 benchmark (`npm run bench:catalog`)

Compared to Global 10K report — consistent, no regression:

| Metric | Global 10K QA | This run |
|--------|---------------|----------|
| Catalog | 10,050 | 10,050 |
| Active | 10,046 | 10,046 |
| JSON bytes | 2,336,627 | 2,336,627 |
| Parse | 12 ms | 12 ms |
| Cold index | 942 ms | 1,136 ms |
| Cached index | 0 ms | 0 ms |
| Typical search | 664 ms | 695 ms |
| Worst search | 164 ms | 162 ms |
| Nearest | 26 ms | 24 ms |
| Map build | 32 ms | 33 ms |
| Viewport filter | 4 ms | 3 ms |

Variance within normal Node/JIT range. No architecture migration needed.

---

## Switzerland scale scenarios (synthetic, from 10,050 baseline)

| Target | Cold index | Typical search | Worst search | Nearest | Map filter |
|--------|------------|------------------|--------------|---------|------------|
| 10,050 (live) | 1,136 ms | 695 ms | 162 ms | 24 ms | 3 ms |
| +250 → 10,300 | 984 ms | 683 ms | 161 ms | 26 ms | 3 ms |
| +500 → 10,550 | 1,020 ms | 668 ms | 163 ms | 24 ms | 4 ms |
| +750 → 10,800 | 1,013 ms | 700 ms | 162 ms | 27 ms | 3 ms |
| +1,000 → 11,050 | 1,086 ms | 890 ms | 220 ms | 31 ms | 4 ms |
| +1,500 → 11,550 | 1,128 ms | 731 ms | 196 ms | 32 ms | 4 ms |
| +2,000 → 12,050 | 1,173 ms | 741 ms | 181 ms | 28 ms | 4 ms |
| 12,500 | 1,202 ms | 781 ms | 194 ms | 30 ms | 4 ms |
| 15,000 | 1,417 ms | 921 ms | 216 ms | 36 ms | 5 ms |
| 20,000 | 3,859 ms | 1,813 ms | 321 ms | 50 ms | 7 ms |
| 25,000 | 2,458 ms | 1,637 ms | 377 ms | 60 ms | 8 ms |

Adding ~250–2,000 Swiss gyms stays well within acceptable client-side range.

---

## Architecture decision

| Question | Answer |
|----------|--------|
| Safe for Switzerland Phase 1? | **Yes** |
| Safe around 12.5k? | **Yes** |
| Safe around 15k? | **Yes** |
| Planning threshold | ~20,000–25,000 |
| Required migration threshold | ~40,000–50,000+ |
| Decision | **KEEP CLIENT-SIDE** |

Switzerland prep does not change the Global 10K architecture decision.

---

## Global 10K follow-up

| Item | Status |
|------|--------|
| Global automated QA | PASS (2026-08-22) |
| Physical-device follow-up | **Required** (existing global item) |
| Blocks Switzerland Phase 1? | **No** |

---

## Rough market scale (planning only — no discovery)

Switzerland conventional gym market is estimated in the low hundreds to ~800+ locations across national chains, regional operators, 24/7 gyms, and cross-border European brands. Phase 1 will perform the real audit from official sources.

---

## Future Phase 1 target categories (not hardcoded)

- Large national chains
- Regional multi-site chains
- 24/7 gyms
- Premium / budget chains
- Cross-border European brands (FITINN, clever fit, Basic-Fit, etc.)

---

## Tests

| Suite | Result |
|-------|--------|
| `switzerlandCatalogScalingPrep.test.ts` | 18 passed |
| `catalogScalePrep.test.ts` | 6 passed |
| `global10kStressQa.test.ts` | 131 passed |
| `austriaGymQa.test.ts` | 151 passed |
| `polandGymQa.test.ts` | passed |
| Other catalog scale prep | passed |
| **Total (regression run)** | **497 passed, 0 failed** |

---

## Bugs found

None (production/catalog).

---

## Bugs fixed

None.

---

## Files changed

| File | Change |
|------|--------|
| `src/data/gymIds.ts` | `switzerland: 'ch_'` |
| `src/utils/gymCountry.ts` | `isSwitzerlandCountry`, `isLiechtensteinCountry` |
| `src/utils/gymCountryLabel.ts` | Switzerland labels + picker line |
| `src/utils/gymDisplay.ts` | `ch_*` orphan → `Schweiz` |
| `src/data/centerRegistry.ts` | `countryBucketKey` for Switzerland |
| `src/data/danishGyms.ts` | `Schweiz` region, partition cache |
| `src/services/gymSearch/gymSearchIndex.ts` | Swiss city aliases + country keywords |
| `src/i18n/translations/en.ts` | `countries.switzerland` |
| `src/i18n/translations/da.ts` | `countries.switzerland` |
| `src/i18n/translations/sv.ts` | `countries.switzerland` |
| `src/i18n/translations/nb.ts` | `countries.switzerland` |
| `scripts/benchmark-gym-catalog-scale.test.ts` | +10300, +10550, +10800, +11050, +11550, +12050 sizes |
| `__tests__/switzerlandCatalogScalingPrep.test.ts` | **NEW** — 18 tests |
| `__tests__/catalogScalePrep.test.ts` | Switzerland = 0 assertions |
| `data/switzerland/SWITZERLAND_CATALOG_SCALING_PREP.md` | **NEW** — this report |

**Confirmed unchanged:** `src/data/centers.json`

---

## FINAL VERDICT

**READY FOR SWITZERLAND PHASE 1**
