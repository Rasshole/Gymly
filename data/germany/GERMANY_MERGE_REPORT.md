# Germany production merge report

**Status: MERGED** — first and final safe Germany production merge complete.  
Full Germany QA is **not** run in this task.

Generated from live `src/data/centers.json` after merge + idempotency check.

---

## 1–5. Catalog counts

| Metric | Count |
|--------|------:|
| Centers before | **1,528** |
| Centers after | **2,952** |
| Germany before | **0** |
| Germany after | **1,424** |
| Exact inserted | **1,424** |

Expected `1,528 + 1,424 = 2,952` matched.

---

## 6. Exact brand breakdown (live Germany)

| Brand | Count |
|-------|------:|
| clever fit | 378 |
| McFIT | 177 |
| all inclusive Fitness | 172 |
| EASYFITNESS | 169 |
| Kieser | 113 |
| FitX | 112 |
| Fitness First | 82 |
| INJOY | 69 |
| Basic-Fit | 56 |
| JOHN REED | 32 |
| PRIME TIME fitness | 22 |
| VeniceBeach | 15 |
| Pfitzenmeier | 8 |
| ELBGYM | 7 |
| ELEMENTS | 7 |
| Gold's Gym | 5 |
| **Total** | **1,424** |

Matches the approved READY dataset. No manufactured counts.

---

## 7–12. Quality

| Check | Result |
|-------|--------|
| Duplicate IDs | **0** |
| Duplicate same-brand physical locations (≤50 m) | **0** |
| Missing address / postal / city | **0 / 0 / 0** |
| Missing coordinates | **0** |
| Invalid coordinates (null, NaN, Inf, 0,0) | **0** |
| Coordinate outliers outside Germany bbox | **0** (none excluded; none in catalog) |
| German-character validation | **0** mojibake/replacement-char failures; **965** rows contain ä/ö/ü/ß |
| All Germany IDs `de_*` | **1,424 / 1,424** |
| All Germany `is_active` | **true** |
| EMS in production | **0** |
| FitnessLOFT in production | **0** |
| wellyou in production | **0** |
| COMING_SOON in production | **0** |

---

## 13–15. Country regression

| Country | Before | After | Intact |
|---------|-------:|------:|--------|
| Denmark | 354 | **354** | yes |
| Sweden | 639 | **639** | yes |
| Norway | 535 | **535** | yes |

Existing IDs, names, addresses, brands and coordinates were not rewritten.

---

## 16. Idempotency second run

**Inserted: 0**

Second run collected no READY candidates (merged rows marked `MERGED_INTO_CATALOG` in staging) and would not create duplicates.

---

## 17. Still staged (not production)

| Category | Count |
|----------|------:|
| MERGED_INTO_CATALOG | 1,424 |
| NEEDS_REVIEW | 38 (includes 24 EASYFITNESS EMS) |
| COMING_SOON | 15 |
| NEEDS_COORDINATES | 12 |
| CLOSED | 6 |
| EMS-only (still excluded) | 24 |
| wellyou | not staged (research preserved) |

Phase 1–3 research files were not deleted.

---

## 18. Files changed

- `src/data/centers.json` (Germany append)
- `data/germany/germany_centers_staging.json` (READY marked merged)
- `scripts/import-germany-centers-phase3-merge.mjs`
- `src/utils/gymCountry.ts` (`isGermanyCountry`)
- `src/data/centerRegistry.ts` (no invented Germany coordinates)
- `src/data/danishGyms.ts` (region `Tyskland`)
- `data/germany/GERMANY_MERGE_REPORT.md`
- `data/germany/phase3/GERMANY_MERGE_REPORT.json`
- `data/germany/phase3/GERMANY_APPROVED_FOR_MERGE.json`
- `data/germany/phase3/GERMANY_MERGE_DUPLICATE_ANALYSIS.json`

---

## 19. Performance / architecture

Client-side `centers.json` is now **2,952** rows. No migration off `centers.json`. No search/map redesign.

At this size the file is heavier: watch cold start, map clustering, and gym search latency during Germany QA. Architecture scaling is a separate task.

---

## STOP

No Germany QA in this task. No further discovery. No next country.
