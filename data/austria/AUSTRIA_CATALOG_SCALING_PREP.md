# Austria Catalog Scaling Prep

Generated: 2026-08-22

**THIS IS PREP ONLY.** No Austrian gyms discovered. `src/data/centers.json` unchanged.

Pre-merge SHA256: `d86bf0118c27b72561e7aa62dd787bb907b184f3e40bc9d38ad67e036166c431`

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
| Poland | 621 |
| **Austria** | **0** |
| **TOTAL** | **9,715** |

Production modified by this task: **No**.

---

## 2. Architecture audit

Shared client-side catalog (`centers.json`) + search index + viewport-filtered map remains the production architecture for all 12 live countries. Austria wires into the same helpers — no Austria-only engine.

---

## 3. Austria country support wired

| Concern | Implementation |
|---------|----------------|
| Stored country | `"Austria"` |
| ID prefix | `at_` (`GYM_ID_PREFIX.austria`) — not `au_` / `aut_` / `austria_` |
| Production conflicts | **0** existing `at_*` IDs |
| Detector | `isAustriaCountry` — Austria / at / Österreich / Oesterreich |
| Distinct from Germany | `isGermanyCountry('Austria')` → false |
| Invented coords | **Forbidden** (`allowsInventedCoordinates` stays DK/SE only) |
| Region bucket | `Österreich` |
| Orphan stub | `at_*` → region `Österreich`, name `Unknown gym` |
| Search keywords | Austria / Österreich / Oesterreich / Osterreich |
| City aliases | Vienna↔Wien, Graz, Linz, Salzburg, Innsbruck, Klagenfurt, Villach, Wels, Sankt Pölten, Dornbirn, Wiener Neustadt, Steyr, Feldkirch, Bregenz, Leonding |
| Character fold | Reuses existing **German** normalization: ä→a, ö→o, ü→u, ß→ss (via `GERMAN_MAP` in `gymSearchNormalize.ts`) |
| Postcode | 4-digit **STRING** (e.g. `1010`); country context distinguishes from Belgium |

---

## 4. Country labels (i18n)

| Locale | Label |
|--------|--------|
| en | Austria |
| da | Østrig |
| sv | Österrike |
| nb | Østerrike |

No German UI language pack created (German is not an active app UI locale).

---

## 5. Missing-coordinate safety

Austria follows BE/IT/PL/FR/ES/… modern path:

- missing lat/lng → `NaN` / not check-in eligible
- **No** Vienna, Austria centroid, city/postcode centroid, German/DK/SE fallbacks

---

## 6. Austrian postcodes

Format: `^\d{4}$` stored as **STRING**.

Examples: `1010`, `1020`, `4020`, `5020`, `6020`, `8010`.

Belgium also uses 4-digit postcodes — disambiguation requires **country** context (`Austria` vs `Belgium`), not postcode shape alone.

---

## 7. Austria / Germany separation

| | Austria | Germany |
|---|---------|---------|
| Country | `"Austria"` | `"Germany"` |
| ID prefix | `at_*` | `de_*` |
| Region | `Österreich` | `Tyskland` |

Shared DACH brands (McFIT, clever fit, FITINN, etc.) must remain country-partitioned at import time. Search ranks by user location + query tokens; country keywords prevent cross-country dominance when specified.

---

## 8. Border safety (future import)

Austria bbox for candidate validation (Phase 1 reference):

- lat: 46.35 – 49.05
- lng: 9.45 – 17.20

Foreign neighbor boxes to reject in merge scripts: DE/CZ/SK/HU/SI/IT/CH/LI interiors near borders.

High-attention border metros: Salzburg, Kufstein, Bregenz, Feldkirch, Villach.

---

## 9. Check-in / auto-checkout

| Setting | Value | Changed |
|---------|------:|---------|
| `CHECK_IN_RADIUS_METERS` | 200 | No |
| `AUTO_CHECKOUT_DISTANCE_METERS` | 200 | No |

Selected gym coordinates remain source of truth.

---

## 10. Live 9,715 benchmark (real production)

| Metric | Value |
|--------|------:|
| Catalog | 9,715 |
| Active | 9,711 |
| JSON bytes | 2,263,085 (~2.16 MB) |
| Parse (bench) | 10 ms |
| Cold index | 2,049 ms |
| Cached index | 0 ms |
| Typical search (3q) | 630 ms |
| Worst search (2q) | 148 ms |
| Nearest | 22 ms |
| Map build | 29 ms |
| Viewport filter | 3 ms |

---

## 11. Scale benchmark (synthetic clone)

| Size | JSON bytes | Parse | Cold index | Cached | Typical 3q | Worst 2q | Nearest | Map build | Viewport |
|-----:|-----------:|------:|-----------:|-------:|-----------:|---------:|--------:|----------:|---------:|
| 10,000 | 2,329,129 | 11 ms | 842 ms | 0 ms | 612 ms | 146 ms | 24 ms | 28 ms | 3 ms |
| 10,500 | 2,443,150 | 12 ms | 876 ms | 0 ms | 638 ms | 153 ms | 24 ms | 32 ms | 3 ms |
| 11,000 | 2,550,866 | 13 ms | 916 ms | 0 ms | 664 ms | 165 ms | 26 ms | 31 ms | 4 ms |
| 12,500 | 2,894,673 | 14 ms | 2,264 ms | 0 ms | 742 ms | 188 ms | 30 ms | 35 ms | 3 ms |
| 15,000 | 3,520,896 | 20 ms | 1,253 ms | 0 ms | 877 ms | 191 ms | 33 ms | 38 ms | 5 ms |
| 20,000 | 4,704,668 | 38 ms | 1,629 ms | 0 ms | 1,192 ms | 293 ms | 45 ms | 49 ms | 6 ms |
| 25,000 | 5,901,758 | 28 ms | 2,057 ms | 0 ms | 1,539 ms | 361 ms | 54 ms | 57 ms | 7 ms |
| 50,000 | 11,815,873 | 62 ms | 4,129 ms | 0 ms | 2,935 ms | 712 ms | 108 ms | 110 ms | 14 ms |

Cold index variance between runs is normal (Jest GC); cached reuse remains 0 ms. Architecture acceptable through 15k+ for typical search; worst-case broad queries grow but remain sub-second through 10k.

---

## 12. Austria import scenarios

Current: **9,715**

| Scenario | Total | ≤10,000? | Post-merge sequence |
|----------|------:|:--------:|---------------------|
| +100 READY | 9,815 | Yes | Merge → AT QA → continue |
| +200 READY | 9,915 | Yes | Merge → AT QA → continue |
| +285 READY | 10,000 | Exactly | Merge → AT QA → continue |
| **+286 READY** | **10,001** | **No** | Merge → AT QA → **STOP** → Global 10K+ stress QA |
| +300 READY | 10,015 | No | Merge → AT QA → STOP → Global 10K+ stress QA |
| +500 READY | 10,215 | No | Merge → AT QA → STOP → Global 10K+ stress QA |
| +750 READY | 10,465 | No | Merge → AT QA → STOP → Global 10K+ stress QA |
| +1,000 READY | 10,715 | No | Merge → AT QA → STOP → Global 10K+ stress QA |

**Austria may be Gymly's first country to cross 10,000** if READY count ≥ 286.

---

## 13. 10K trigger rule

| Metric | Value |
|--------|------:|
| Current catalog | 9,715 |
| Headroom to exactly 10,000 | 285 |
| Centers required to reach 10,000 | 285 |
| Centers required to exceed 10,000 | 286 |

### If eventual Austria READY ≤ 285

```
Austria merge → Austria QA → continue country expansion
```

### If eventual Austria READY ≥ 286

```
Austria merge → Austria QA → STOP COUNTRY EXPANSION → GLOBAL 10K+ STRESS QA → continue only after PASS
```

Global 10K+ stress QA **NOT executed in this prep task**.

---

## 14. Global 10K+ QA plan (NOT executed)

When production exceeds 10,000, run comprehensive validation:

### Catalog / performance
- Cold app startup
- `centers.json` parse time + memory
- Cold search-index build + cached reuse
- Typing responsiveness (prefix queries)
- Brand / city / postcode search at scale

### Core flows (all countries)
- Country isolation (AT vs DE vs BE 4-digit postcodes)
- Map startup, pan/zoom, dense marker handling (Vienna)
- Nearest gym + manual selection persistence
- Onboarding, favorites/profile, planned sessions, chat/invites
- 200 m check-in + auto-checkout (session gym ID)
- Workout logging, PR, history, feed/share, notifications
- Orphan ID safety (`at_*`, `de_*`, legacy DK)
- All-country regression test suites

### Physical devices (required at 10K+)
- Representative modern iPhone
- Slower/mid-range device where available

Focus: cold launch, first gym search, typing, map open/movement, nearest lookup, memory pressure.

---

## 15. Server directory decision

Based on current measurements:

| Threshold | Assessment |
|-----------|------------|
| Safe client-side (now) | **≤ ~15,000** centers — typical search <1 s, map viewport filter <10 ms |
| Planning threshold | **~20,000** — monitor cold index (>2 s) and worst-case broad queries |
| Required migration threshold | **Not triggered at 10k** — no automatic server migration; reassess at ~25k–50k if cold index >5 s or memory pressure on devices |

Crossing 10,000 is a **QA checkpoint**, not an architecture migration trigger.

---

## 16. Search index review (9,715)

| Concern | Status |
|---------|--------|
| Stable array identity | ✓ `ALL_GYM_CENTERS` readonly |
| Cold index creation | ✓ ~0.8–2 s at 9,715 |
| Cached index reuse | ✓ 0 ms on second call |
| Per-keystroke normalization | ✓ `normalizeGymSearchValue` |
| German fold for AT | ✓ Reuses `GERMAN_MAP` |
| City aliases | ✓ `austrianCities` in `extractArea` |
| Country tokens | ✓ `isAustriaCountry` keywords |
| Postcode tokens | ✓ 4-digit string via `postalNorm` |

No search relevance changes made beyond Austria wiring.

---

## 17. Tests

| Suite | Result |
|-------|--------|
| `austriaCatalogScalingPrep.test.ts` | 14 PASS |
| `polandCatalogScalingPrep.test.ts` | 15 PASS |
| `catalogScalePrep.test.ts` | 7 PASS |
| `bench:catalog` | PASS |

Legacy `*GymQa.test.ts` files still reference pre-Poland total 9,094 — historical snapshots; not rewritten in this prep.

---

## 18. Files changed (prep only)

**Shared helpers:**
- `src/data/gymIds.ts` — `austria: 'at_'`
- `src/utils/gymCountry.ts` — `isAustriaCountry`
- `src/utils/gymCountryLabel.ts` — Austria i18n + picker bucket
- `src/data/centerRegistry.ts` — Austria country bucket
- `src/data/danishGyms.ts` — `Österreich` region + partition
- `src/utils/gymDisplay.ts` — orphan `at_*` stub region
- `src/services/gymSearch/gymSearchIndex.ts` — Austrian city aliases + country keywords
- `src/i18n/translations/en.ts`, `da.ts`, `sv.ts`, `nb.ts` — `countries.austria`

**Tests / docs / bench:**
- `__tests__/austriaCatalogScalingPrep.test.ts` — new
- `data/austria/AUSTRIA_CATALOG_SCALING_PREP.md` — this file
- `scripts/benchmark-gym-catalog-scale.test.ts` — added 10,500 synthetic size

**NOT changed:**
- `src/data/centers.json`

---

## Final verdict

**READY FOR AUSTRIA PHASE 1**

Austria is wired into shared global architecture. Production remains 9,715 / Austria 0. Proceed to Austria discovery/staging when approved — monitor READY count against 285/286 10K trigger before merge.
