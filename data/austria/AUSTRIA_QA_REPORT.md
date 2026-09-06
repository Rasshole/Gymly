# Austria Production QA Report

Generated: 2026-08-22

## Verdict

**AUSTRIA STATUS: READY — GLOBAL 10K+ STRESS QA REQUIRED NEXT**

Country expansion remains **PAUSED**. Next required task: **Global 10K+ Stress QA** (not run in this task).

---

## 1. Production baseline

| Metric | Expected | Actual |
|--------|----------|--------|
| Total catalog | 10,050 | **10,050** ✓ |
| Austria | 335 | **335** ✓ |
| Denmark | 354 | 354 ✓ |
| Sweden | 639 | 639 ✓ |
| Norway | 535 | 535 ✓ |
| Germany | 1,424 | 1,424 ✓ |
| United Kingdom | 1,474 | 1,474 ✓ |
| Finland | 429 | 429 ✓ |
| Netherlands | 600 | 600 ✓ |
| France | 1,712 | 1,712 ✓ |
| Spain | 976 | 976 ✓ |
| Italy | 588 | 588 ✓ |
| Belgium | 363 | 363 ✓ |
| Poland | 621 | 621 ✓ |

Source: `src/data/centers.json` (real production catalog).

---

## 2. Catalog integrity (335 Austria rows)

| Check | Result |
|-------|--------|
| Unique Austria IDs | 335 ✓ |
| All `at_*` prefix | 335 ✓ |
| `country = "Austria"` | 335 ✓ |
| `is_active = true` | 335 ✓ |
| Name / brand / address / city present | 0 missing ✓ |
| Postcode `^\d{4}$` string | 335 ✓ |
| Finite lat/lng, no NaN/Infinity/0,0 | 0 invalid ✓ |
| Duplicate IDs (global) | 0 ✓ |
| Mojibake / literal `\xNN` | 0 ✓ |
| Foreign outliers (Austria bbox) | 0 ✓ |
| Fallback coordinates | 0 ✓ |

---

## 3. Merge contract

| Item | Expected | Actual |
|------|----------|--------|
| `AUSTRIA_APPROVED_FOR_MERGE.json` | 335 | 335 ✓ |
| Production Austria IDs | match approved | ✓ |
| Staging `MERGED_INTO_CATALOG` | 335 | 335 ✓ |
| Metadata drift | 0 | 0 ✓ |

---

## 4. MYGYM duplicate repair

Phase 2 had **37** MYGYM READY candidates. Merge withheld **14** encoding/geocode duplicate twins.

| Check | Result |
|-------|--------|
| Canonical MYGYM live | **23** ✓ |
| Duplicate twins live | **0** ✓ |
| Superseded staging rows | **14** (`DUPLICATE`) ✓ |
| Each `superseded_by` → live canonical row | 14/14 ✓ |
| Same-brand same-address live duplicates | 0 ✓ |

Withheld IDs (not in production): `at_02365a369d`, `at_6aa9766fa2`, `at_d2e2ea65bb`, `at_deeee6654e`, `at_1c9ce361e6`, `at_206f4cc375`, `at_a481167d21`, `at_c9d918814a`, `at_7777e1a077`, `at_ad1845c8e3`, `at_9594d79342`, `at_c973bf7eb3`, `at_c77dc4aa25`, `at_eaab28be91`.

---

## 5. Encoding

- **17** MYGYM rows had literal `\xNN` escapes at merge time; repaired via `fixEscapedUtf8()` in production rows.
- Production audit: **0** mojibake, **0** literal escapes, **0** corruption.
- German/Austrian diacritics preserved in stored text (ä, ö, ü, ß).
- Search normalization folds umlauts/ß for ASCII queries only (e.g. `Kärntner` → `karntner`, `Straße` → `strasse`).

---

## 6. Brand breakdown (calculated from production)

| Brand | Count |
|-------|------:|
| FITINN | 51 |
| Mrs.Sporty | 50 |
| clever fit | 40 |
| INJOY | 35 |
| Speedfit | 31 |
| HappyFit | 29 |
| Anytime Fitness | 22 |
| MYGYM | 23 |
| McFIT | 15 |
| John Harris Fitness | 12 |
| Fit Fabrik | 12 |
| JOHN REED | 7 |
| Fitness First | 4 |
| Holmes Place | 3 |
| Gold's Gym | 1 |
| **Total** | **335** |

---

## 7. Geography

- All 335 coordinates inside Austria bbox (46.35–49.05°N, 9.45–17.20°E).
- Border cities verified: Innsbruck, Bregenz, Feldkirch, Klagenfurt, Eisenstadt — all inside bbox.
- No invented-coordinate fallback for Austria (`allowsInventedCoordinates('Austria')` = false).
- Missing coords → NaN (no Vienna centroid).

---

## 8. Search QA

### Brands (all 15)
Exact brand queries return `at_*` results with Vienna-biased user location. Cross-country brands (McFIT, clever fit, Anytime Fitness) rank Austrian `at_*` before German `de_*` near Vienna.

### Country
`Austria`, `Österreich`, `Osterreich` → `at_*` results ✓

### Cities (14 tested)
Wien, Graz, Linz, Salzburg, Innsbruck, Klagenfurt, Villach, Wels, St. Pölten, Dornbirn, Wiener Neustadt, Steyr, Feldkirch, Bregenz — all return `at_*` ✓

### Vienna alias
`Wien` and `Vienna` both return Wien-city gyms. Stored city remains `Wien` (no rewrite).

### Umlaut / ASCII
German fold map active; ASCII queries match diacritic stored text.

### Postcodes
Representative 4-digit codes (1010, 8020, 4020, 5020, 6020, 6900) return `at_*`. Vienna `1010` disambiguates from Belgian 4-digit via country/city context.

### Typing responsiveness (10k)
Progressive prefixes work: `wi→wie→wien`, `vie→vienna`, `fiti→fitinn`, `clev→clever`, `myg→mygym`. Shorter global prefixes (`fit`, `cle`, `my`, `w`, `v`) remain functional. **Note:** 2-char `vi` alone is globally ambiguous and may not surface `at_*` in top 30 (documented risk).

---

## 9. Priority brand QA

| Brand | Prod | QA |
|-------|-----:|-----|
| FITINN | 51 | Search, Vienna coverage, lookup, map ✓ |
| Mrs.Sporty | 50 | 50 clubs with physical addresses; official "Home - Club" naming per Phase 2 rule ✓ |
| clever fit | 40 | Search, AT IDs, DE separation near Vienna ✓ |
| MYGYM | 23 | 23 canonical, 0 twins, encoding repaired ✓ |
| INJOY | 35 | Search, lookup, map, nearest ✓ |
| Speedfit | 31 | Physical studios only in production ✓ |
| HappyFit | 29 | AT-only, search ✓ |
| Anytime Fitness | 22 | All `at_*`, cross-country distinct ✓ |
| McFIT | 15 | Ghost CLOSED row excluded; search ✓ |
| John Harris Fitness | 12 | Search, close pair validated ✓ |
| Fit Fabrik | 12 | Search, lookup ✓ |
| JOHN REED | 7 | RSG-derived, search ✓ |
| Fitness First | 4 | Search, lookup ✓ |
| Holmes Place | 3 | Strict geocode addresses plausible ✓ |
| Gold's Gym | 1 | Single AT row ✓ |

---

## 10. Known proximity / co-location cases

### John Harris pair (~60 m)
- `at_281d63e434` John Harris Schillerplatz — Nibelungengasse 5
- `at_37f49e7937` John Harris Medical Center — Getreidemarkt 8
- Different addresses, independent check-in pins, both retained ✓

### Salzburg identical-coordinate co-location
- `at_fad38fce91` MYGYM Salzburg ZIB
- `at_af355944dd` clever fit Salzburg PREMIUM
- Same building pin, different brands, both retained ✓

### Other different-brand co-locations (3 total)
1. MYGYM ZIB ↔ clever fit Salzburg PREMIUM (0 m)
2. Speedfit Klosterneuburg ↔ Mrs.Sporty Klosterneuburg (42 m)
3. INJOY Tulln ↔ Mrs.Sporty Tulln (47 m)

All remain separate IDs, separately selectable.

---

## 11. Core flows

| Flow | Result |
|------|--------|
| Onboarding / gym picker | AT selectable, display names (no raw IDs) ✓ |
| Profile / favorites | ID resolve, multi-country ✓ |
| Nearest gym (6 cities) | Plausible `at_*`, no DK/DE fallback ✓ |
| 200 m check-in | 200 allowed, 201+ blocked; radius unchanged ✓ |
| Auto-checkout | 200 m threshold unchanged ✓ |
| Workout / PR / history | Global paths, `at_*` resolves to name ✓ |
| Feed / share / notifications | Gym ID + display name resolve ✓ |
| Map viewports (6 cities) | Filtered `at_*` pins, not full 10,050 render ✓ |
| Orphan `at_nonexistent_test` | Stub only, no catalog[0]/nearest substitution ✓ |
| i18n country labels | EN/DK/SV/NB Austria labels ✓ |

---

## 12. Staging exclusions

| Category | Staged | In production |
|----------|-------:|---------------|
| NEEDS_COORDINATES | 9 | 0 ✓ |
| NEEDS_REVIEW | 8 | 0 ✓ |
| CLOSED | 1 | 0 ✓ |
| DUPLICATE/LEGACY | 14 | 0 ✓ |
| COMING_SOON | 0 | — |

McFIT ghost `at_a9cc56c1a9` (CLOSED) confirmed absent from production.

---

## 13. Cross-country regression

All 12 pre-Austria country counts unchanged. Poland merge safety + catalog scale prep updated and passing at 10,050 total.

---

## 14. Performance (real 10,050 catalog)

`npm run bench:catalog` on live catalog:

| Metric | 10,050 (post-Austria) | 9,715 (pre-Austria, merge bench) |
|--------|----------------------:|---------------------------------:|
| Catalog | 10,050 | 9,715 |
| Active | 10,046 | — |
| centers.json size | 3,093,472 bytes | ~2.97 MB |
| JSON parse | 11–17 ms | 11 ms |
| Cold search index | 880–1,051 ms | 880 ms |
| Cached index | 0 ms | 0 ms |
| Typical search (3q) | 612–642 ms | 642 ms |
| Worst search (2q) | 163 ms | 163 ms |
| Nearest gym | 24 ms | 24 ms |
| Map build | 33 ms | 33 ms |
| Viewport filter | 4 ms | 4 ms |

**Assessment:** Marginal increase from +335 centers. No architectural changes required. **Full Global 10K+ Stress QA still required** as separate task.

---

## 15. Tests

| Suite | Result |
|-------|--------|
| `austriaGymQa.test.ts` | **151 PASS** |
| `austriaMergeSafety.test.ts` | 12 PASS |
| `austriaCatalogScalingPrep.test.ts` | 14 PASS |
| `catalogScalePrep.test.ts` | 6 PASS |
| `polandMergeSafety.test.ts` | 10 PASS (counts updated) |
| `bench:catalog` | PASS |

**Total Austria QA run: 193 tests passed, 0 failed.**

---

## 16. Bugs found

None.

---

## 17. Bugs fixed

None (production code unchanged). Test maintenance only:
- Updated Poland regression tests for 10,050 post-Austria catalog total.

---

## 18. Remaining risks

1. **2-char `vi` search prefix** — globally ambiguous at 10k scale; `vie`/`vienna` work correctly.
2. **John Harris 60 m pair** — retained as legitimate separate facilities (different addresses).
3. **3 different-brand co-locations** — retained by design; manual selection required.
4. **Mrs.Sporty "Home" naming** — official franchise concept; all 50 rows have physical club addresses per Phase 2 inclusion rule.
5. **14 MYGYM duplicates withheld at merge** — canonical count 23 vs Phase 2 READY 37; not a production defect.

---

## 19. 10K status

| Metric | Value |
|--------|------:|
| Catalog | 10,050 |
| Threshold crossed | **YES** |
| Amount above 10,000 | **50** |

---

## 20. Required next steps

| Step | Status |
|------|--------|
| Austria Production QA | **COMPLETE — READY** |
| Global 10K+ Stress QA | **REQUIRED NEXT** |
| Country expansion | **NOT ALLOWED** until global QA passes |

---

## 21. Files changed (QA task)

- `__tests__/austriaGymQa.test.ts` — **new** comprehensive QA suite
- `__tests__/polandGymQa.test.ts` — catalog total 10,050
- `__tests__/polandMergeSafety.test.ts` — catalog total 10,050
- `__tests__/polandCatalogScalingPrep.test.ts` — catalog total 10,050
- `data/austria/AUSTRIA_QA_REPORT.md` — **this report**

Production catalog (`src/data/centers.json`) **not modified** during QA.
