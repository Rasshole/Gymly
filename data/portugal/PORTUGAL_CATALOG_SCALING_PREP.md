# PORTUGAL CATALOG SCALING PREP

**Generated:** 2026-08-22  
**Verdict:** READY FOR PORTUGAL PHASE 1  
**Production modified by this task:** No (`src/data/centers.json` untouched)

---

## Current production baseline

| Country | Count |
|---------|-------|
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
| Switzerland | 475 |
| **Portugal** | **0** |
| **TOTAL** | **10,525** |

- `pt_*` production IDs: **0**

---

## Portugal support added

| Item | Value |
|------|-------|
| Canonical country | `"Portugal"` |
| ID prefix | `pt_` (not `po_` / `por_` / `prt_`) |
| Country labels | EN/DA/SV/NB: **Portugal** |
| Character normalization | Existing NFD + combining-mark strip (covers áàâãéêíóôõúç) — **search-only** |
| City aliases | Lisboa↔Lisbon, Porto↔Oporto, Vila Nova de Gaia↔Gaia (+ major city tokens) |
| Postcode format | `NNNN-NNN` (`PORTUGAL_POSTAL_RE`), string; compact search `1000001` ↔ `1000-001` |
| Madeira / Azores | Included in `isPlausiblePortugalCoordinate` |
| Missing coordinates | NaN / unavailable; no Lisbon/Madrid/centroid invent |
| Orphan `pt_*` | Safe stub, region `Portugal`; never DK/ES/catalog[0] |
| Check-in / auto-checkout | Unchanged at **200 m** |

---

## Live 10,525 benchmark

| Metric | Value |
|--------|-------|
| Catalog | 10,525 |
| Active | 10,525 |
| JSON size | ~2.44 MB |
| Parse | ~11 ms |
| Cold index | ~935 ms |
| Cached index | ~0 ms |
| Typical search | ~611 ms |
| Worst search | ~148 ms |
| Nearest | ~23 ms |
| Map build | ~28 ms |
| Viewport filter | ~3 ms |

Comparable to Switzerland QA baseline (within normal runtime variance; slightly faster in this run).

---

## Scale benchmark (synthetic growth from live catalog)

| Size | Δ from 10,525 | Parse | Cold index | Typical | Worst | Nearest | Map build | Viewport |
|------|---------------|-------|------------|---------|-------|---------|-----------|----------|
| 10,525 | 0 | 11 | 935 | 611 | 148 | 23 | 28 | 3 |
| 10,775 | +250 | 11 | 945 | 606 | 147 | 25 | 28 | 3 |
| 11,025 | +500 | 14 | 993 | 612 | 149 | 24 | 30 | 3 |
| 11,275 | +750 | 12 | 954 | 586 | 145 | 24 | 30 | 3 |
| 11,525 | +1,000 | 12 | 957 | 612 | 150 | 24 | 30 | 3 |
| 12,025 | +1,500 | 12 | 1,026 | 643 | 174 | 27 | 34 | 4 |
| 12,525 | +2,000 | 11 | 1,023 | 640 | 157 | 25 | 31 | 4 |
| 15,000 | — | 16 | 1,252 | 763 | 184 | 31 | 36 | 5 |
| 20,000 | — | 22 | 1,729 | 1,108 | 258 | 40 | 48 | 5 |
| 25,000 | — | 29 | 2,213 | 1,335 | 317 | 53 | 55 | 8 |

Times in ms. No material regression vs live 10,525 through +2k Portugal-scale growth.

---

## Geographic safety

| Scope | Status |
|-------|--------|
| Mainland | Plausible bbox supported |
| Madeira (Funchal) | Supported |
| Azores (Ponta Delgada) | Supported |
| Spain border | `Portugal` ≠ `Spain`; `pt_*` ≠ `es_*` |
| Foreign contamination | Madrid / Seville / Casablanca / Cape Verde rejected by geo helper |

---

## Multilingual / search

| Check | Result |
|-------|--------|
| Portuguese diacritics | PASS (NFD fold) |
| Lisboa / Lisbon | PASS (search aliases) |
| Porto / Oporto | PASS |
| Postcodes NNNN-NNN + compact | PASS |
| Portugal vs Poland (`NNNN-NNN` vs `NN-NNN`) | PASS (distinct compact lengths) |

---

## Portugal Phase 1 discovery plan (research only — no scrape)

### Likely chains / operators to INVESTIGATE (not verified counts)

Fitness Hut, Solinca / Solinca Light, Fitness UP, Element, Be-Fit, Pump Fitness Spirit, Holmes Place Portugal, Fitness Factory, Kalorias, Supera, Go Gym, VivaGym, Anytime Fitness, plus regional multi-location operators.

### Official source opportunities

- Chain studio locators / sitemap.xml / studio-sitemap
- Public JSON embeds / JSON-LD HealthClub
- Official Google Maps / Studiokarte pins
- Madeira & Azores pages (do not mainland-only reject)

### Potential blocked / JS locators

- SPA club selectors (Next/Nuxt) that return empty via curl
- WAF 403 on some marketing domains (use public club lists / sitemaps only — no bypass)

### Rebrand / legacy risks

Portugal has consolidation history. Phase 1 must detect acquired/renamed brands and keep **current consumer-facing identity only** (same policy as basefit→PureGym / ONE→ACTIV).

---

## Architecture decision

| Question | Answer |
|----------|--------|
| Safe for Portugal Phase 1? | **Yes** |
| Safe around 11k? | **Yes** |
| Safe around 12.5k? | **Yes** |
| Safe around 15k? | **Yes** (comfort zone; monitor) |
| Planning threshold | Still **~20k–25k** |
| Migration threshold | Still **~40k–50k+** (or earlier if real-device proves problematic) |
| Global stress rerun required now? | **No** |

Architecture remains **KEEP CLIENT-SIDE**.

---

## Tests

| Suite | Passed | Failed |
|-------|--------|--------|
| `portugalCatalogScalingPrep` | 18 | 0 |

---

## Bugs found / fixed

None.

---

## Files changed

**Created:**
- `__tests__/portugalCatalogScalingPrep.test.ts`
- `data/portugal/PORTUGAL_CATALOG_SCALING_PREP.md`

**Modified:**
- `src/utils/gymCountry.ts` — `isPortugalCountry`, `isPlausiblePortugalCoordinate`, `PORTUGAL_POSTAL_RE`
- `src/data/gymIds.ts` — `portugal: 'pt_'`
- `src/utils/gymCountryLabel.ts` — Portugal labels / picker
- `src/data/danishGyms.ts` — region + country bucket
- `src/data/centerRegistry.ts` — country bucket
- `src/utils/gymDisplay.ts` — orphan `pt_*` → Portugal region
- `src/i18n/translations/{en,da,sv,nb}.ts` — `countries.portugal`
- `src/services/gymSearch/gymSearchIndex.ts` — PT city aliases + country keywords
- `scripts/benchmark-gym-catalog-scale.test.ts` — Portugal growth size checkpoints

**Explicitly unchanged by this task:**
- `src/data/centers.json` (still 10,525; Portugal 0)

---

## Final verdict

**READY FOR PORTUGAL PHASE 1**
