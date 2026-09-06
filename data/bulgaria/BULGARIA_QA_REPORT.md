# BULGARIA PRODUCTION QA REPORT

Generated: 2026-08-24  
Catalog SHA256 (unchanged through QA): `644fb590b8327a773d1a0bc60fbebfe7558d5b112ad3aa838bd291849523d4ec`  
Merge SHA256 (post-merge): `644fb590b8327a773d1a0bc60fbebfe7558d5b112ad3aa838bd291849523d4ec`

## Verdict

**BULGARIA STATUS: READY**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**  
Global Stress QA required: **NO**

## Baseline

| Metric | Expected | Actual |
|--------|----------|--------|
| Total | 11,336 | 11,336 |
| Bulgaria | 82 | 82 |
| bg_* | 82 | 82 |

Country counts (DK…SK unchanged; BG 82). Sum = 11,336.

## Catalog integrity

All 82 Bulgarian rows audited:

- Unique `bg_*` IDs, `country = Bulgaria`, active/open
- Required name/brand/address/city
- Valid Bulgarian postcode `NNNN` (string)
- Finite coordinates; no `0,0`; no fallback markers; no mojibake
- Foreign outliers: **0**

Catalog defects: **0**  
Production `centers.json` modified: **NO**

## Brand breakdown

| Brand | Count |
|-------|------:|
| Next Level Fitness | 29 |
| Pulse Fitness | 19 |
| Flais Fitness | 14 |
| Athletic Fitness | 9 |
| Titanium Fitness | 6 |
| Hammer Gym | 5 |
| **TOTAL** | **82** |

Unexpected brands: **0**

## Merge reconciliation

| Artifact | Count |
|----------|------:|
| Approved | 82 |
| Phase 3 READY | 82 |
| Staging MERGED_INTO_CATALOG | 82 |
| Production Bulgaria | 82 |

Missing IDs: **0**  
Unexpected IDs: **0**  
Metadata drift: **NONE**

## Staging exclusions (not live)

| Status | Count | Notes |
|--------|------:|-------|
| NEEDS_REVIEW | 1 | Athletic Nikolai Kopernik |
| COMING_SOON | 2 | Pulse Ovcha Kupel, Pulse Drujba |
| EXCLUDED | 20 | Hotel/foreign Pulse + market-audit operators |

Absent from production: Atlantis Strumica, Therme, Royal Hotel, Platinum Health Club, Athletic Nikolai Kopernik, Pulse Ovcha Kupel, Pulse Drujba.

## Priority brand QA

### Next Level Fitness — PASS (29)
- Sofia 23 + Varna/Plovdiv/Burgas/Pernik regional coverage
- Current/open; valid postcodes and coordinates

### Pulse Fitness — PASS (19)
- Pulse Platinum = Pulse Fitness / Rezbarska 47 / 1517 (not Platinum Health Club)
- West Park ↔ Lyulin ≈ 1.08 km (separate current clubs)
- Hotel / Atlantis / coming-soon absent

### Flais Fitness — PASS (14)
- Alera / Central Park / Veslec / Mladost Business Park recoveries verified

### Athletic Fitness — PASS (9)
- Sofia 6 / Plovdiv 2 / Stara Zagora 1
- Nikolai Kopernik remains staging-only

### Titanium Fitness — PASS (6)
- Studentski Grad = Simeonovsko 77 / 1734
- Mladost 3 = Blok 386 / 1712
- Locations not swapped (~4.1 km apart)

### Hammer Gym — PASS (5)
- Hammer Gym Platinum distinct from Pulse Platinum (~3.8 km; different brand/address)

## Duplicate / proximity

| Check | Count |
|-------|------:|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 0 |
| Same-brand ≤50 m | 0 |
| Same-brand ≤100 m | 0 |
| Same-brand ≤200 m | 0 |
| Identical coordinates | 0 |
| Same normalized address | 0 |
| Different-brand ≤100 m | 3 (A_legitimate) |

### Different-brand co-locations retained

| Pair | Distance | Reason |
|------|--------:|--------|
| Athletic Plovdiv Plaza (`bg_32094057e9`) ↔ Next Level Plovdiv Plaza (`bg_14fc047239`) | ~79 m | Same mall; distinct operators |
| Flais Manastirski Livadi (`bg_b6ab1909ed`) ↔ Next Level Bulgaria Mall (`bg_3b2837619b`) | ~74 m | Adjacent Sofia retail; distinct brands |
| Pulse Vitosha (`bg_126696d4df`) ↔ Titanium Studentski Grad (`bg_900362e749`) | ~58 m | Nearby Sofia clubs; distinct brands |

## Border safety

Contamination RO / RS / MK / GR / TR: **0**  
All 82 pass `isPlausibleBulgariaCoordinate`.  
Black Sea coastal (Varna / Burgas / Sveti Vlas): **7** — all in-country.

## Search

- Brands (BG-scoped): Next Level / Pulse / Flais / Athletic / Titanium / Hammer resolve expected `bg_*` counts
- Cities Latin: Sofia, Plovdiv, Varna, Burgas, Stara Zagora, Pernik, Sveti Vlas, Kardzhali
- Cities Cyrillic: София, Пловдив, Варна, Бургас, Стара Загора, Перник, Свети Влас, Кърджали
- Display cities remain Latin official; Cyrillic addresses (Titanium etc.) remain UTF-8
- Postcode `NNNN` string; country-qualified queries avoid AT/BE/CH/HU collisions

**QA repair (search-only):** added Cyrillic aliases for Pernik / Sveti Vlas / Kardzhali — see `BULGARIA_QA_REPAIR.json`.

## Core flows

| Flow | Result |
|------|--------|
| Onboarding (Sofia/Plovdiv/Varna/Burgas) | PASS — `bg_*` persists |
| Profile / favorites | PASS — exact ID; no `catalog[0]` |
| Nearest (5 cities) | PASS — plausible `bg_*` |
| Map viewports | PASS — dense Sofia + regional |
| Check-in 199/200/201 | PASS — radius 200 m unchanged |
| Auto-checkout | PASS — session gym ID; no double-checkout |
| Workout/PR/History/Feed/Notifications/Planned | PASS — ID resolution |
| Orphan `bg_nonexistent_test` | PASS — Bulgaria stub (not RO/GR/DK) |

## Country regression

| Country | Count |
|---------|------:|
| Denmark | 354 |
| Sweden | 639 |
| Norway | 535 |
| Germany | 1424 |
| United Kingdom | 1474 |
| Finland | 429 |
| Netherlands | 600 |
| France | 1712 |
| Spain | 976 |
| Italy | 588 |
| Belgium | 363 |
| Poland | 621 |
| Austria | 335 |
| Switzerland | 475 |
| Portugal | 247 |
| Greece | 106 |
| Ireland | 65 |
| Czechia | 70 |
| Hungary | 50 |
| Romania | 154 |
| Slovakia | 37 |
| Bulgaria | 82 |
| **TOTAL** | **11,336** |

## Performance

From `BULGARIA_QA_PERF.json` (environment/JIT variance expected):

| Metric | Value |
|--------|------:|
| Catalog | 11,336 |
| Active | 11,332 |
| JSON size | 3.36 MB |
| Parse | ~20 ms |
| Cold index | ~1211 ms |
| Cached index | ~0 ms |
| Typical search | ~180 ms |
| Worst search | ~9 ms |
| Nearest | ~0 ms |
| Map build | ~0 ms |
| Viewport filter | ~0 ms |

Assessment vs merge 11,336 / ~3.36 MB, Slovakia QA 11,254, Romania QA 11,217: **no material scale regression**.  
Global Stress QA trigger (>12,500 or architecture regression): **NO**.

## Tests

| Suite | Result |
|-------|--------|
| bulgariaGymQa | PASS |
| bulgariaMergeSafety | PASS |
| bulgariaPhase3Staging | PASS |
| bulgariaPhase2Staging | PASS |
| bulgariaPhase1Staging | PASS |
| slovakiaGymQa (totals → 11336) | PASS |
| romaniaGymQa (totals → 11336) | PASS |

**138 passed / 0 failed**

## Bugs found

1. Search-only: Cyrillic Перник / Свети Влас / Кърджали did not resolve `bg_*` (incomplete city alias coverage).

## Bugs fixed

1. Added search-only Bulgarian city aliases for Pernik / Sveti Vlas / Kardzhali in `gymSearchIndex.ts` (stored catalog unchanged).

## Remaining risks (non-blocking)

- Athletic Nikolai Kopernik remains `NEEDS_REVIEW` (not live)
- Pulse Ovcha Kupel / Pulse Drujba remain `COMING_SOON` (not live)
- Future chain expansion into Ruse / Pleven / etc. is out of scope (A_legitimate_no_chain_presence)

## Global scale status

| Item | Value |
|------|-------|
| Catalog | 11,336 |
| New global-scale blocker | None |
| Global Stress QA required | **NO** |
| Country expansion | **UNLOCKED** |
| Architecture | **KEEP CLIENT-SIDE** |

## Files changed

- `__tests__/bulgariaGymQa.test.ts` (new)
- `data/bulgaria/BULGARIA_QA_REPORT.md` (new)
- `data/bulgaria/BULGARIA_QA_PERF.json` (new)
- `data/bulgaria/BULGARIA_QA_REPAIR.json` (new)
- `src/services/gymSearch/gymSearchIndex.ts` (Cyrillic city aliases)
- `__tests__/slovakiaGymQa.test.ts` (catalog total → 11336 + BG)
- `__tests__/romaniaGymQa.test.ts` (catalog total → 11336 + BG)

## Final verdict

**BULGARIA STATUS: READY**  
Country expansion: **UNLOCKED**
