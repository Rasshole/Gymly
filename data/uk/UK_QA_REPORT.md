# UK production QA report

Generated: 2026-08-18

This is a comprehensive production QA of the live `src/data/centers.json` catalog after the UK merge. No new gyms were discovered. No unresolved / coming-soon / closed rows were merged. No other country was started.

`CHECK_IN_RADIUS_METERS` remains **200**. Auto-checkout remains **200 m**.

---

## 1. Overall

**PASS**

UK gyms resolve, search, geofence, and display through the same shared catalog, search index, check-in, map, history, feed, and planned-session paths as DK / SE / NO / DE.

UK STATUS: READY

---

## 2. Catalog validation

| Country | Expected | Live |
|---|---:|---:|
| Denmark | 354 | 354 |
| Sweden | 639 | 639 |
| Norway | 535 | 535 |
| Germany | 1,424 | 1,424 |
| United Kingdom | 1,474 | 1,474 |
| **Total** | **4,426** | **4,426** |

UK production:

- All 1,474 IDs start with `gb_*`
- Zero `uk_*`
- Unique IDs
- `country = "United Kingdom"`
- `is_active = true`
- Finite lat/lng, no `0,0`, no null/NaN/Infinity
- Address, postcode, and city present on every row

Text: legitimate punctuation is intact (`Bishop's Stortford`, `Coldham’s Lane`, hyphens in `Clacton-on-Sea`). Two The Gym Group addresses had UTF-8 en-dash mojibake (`â€“`); those two production strings were corrected (see §29). No other `Ã` / `�` / `â€` catalog noise.

Official names were not rewritten. Stored Energie brand is ASCII `Energie Fitness` (not `énergie`); that is the imported official-locator form, not page-title scrape noise.

---

## 3. Geography

All 1,474 UK pins sit inside the UK bounding box.

| Nation (postcode / city estimate) | Count |
|---|---:|
| England | 1,310 |
| Scotland | 102 |
| Wales | 47 |
| Northern Ireland | 15 |

Zero production centers resolve to:

- Republic of Ireland
- Jersey
- Guernsey
- Isle of Man
- London centroid `51.5074, -0.1278`
- identical shared coordinates (no postcode/city-centroid collapse)

No geographic outliers. Shared exact coordinates: **0**.

---

## 4. Brand search

Every live UK brand returns UK `gb_*` hits on the shared index:

PureGym, The Gym Group, Anytime Fitness, David Lloyd, Nuffield Health, JD Gyms, Snap Fitness, Bannatyne, Everlast Gyms, Energie Fitness, Village Gym, Virgin Active, Fitness First, Third Space, Total Fitness, Gymbox, Buzz Gym, Fitness4Less, easyGym.

Useful aliases were added to the **global** chain alias table only (`the gym`, `jd`, `anytime`, `nuffield`, `virgin`, `everlast`, …). Stored official names were not changed.

---

## 5. City search

Local gyms are returned for:

London, Manchester, Birmingham, Liverpool, Leeds, Glasgow, Edinburgh, Cardiff, Belfast, Bristol, Sheffield, Newcastle, Nottingham, Leicester, Southampton, Brighton, Oxford, Cambridge.

`PureGym London` on the full catalog returns only `gb_*` rows. `Manchester` does not rank a Danish gym first.

---

## 6. Postcode search

Postcode is already in the shared haystack. QA added compact/prefix scoring on `postalNorm` (global, not UK-only).

Verified prefixes: `SW1`, `M1`, `B1`, `G1`, `EH1`, `CF10`, `BT1`.

Verified complete production postcodes: `M1 3BN`, `SN3 3SQ`, `YO30 4TU`, `CF10 1LA`, `BT2 8GD`.

`SW1A` is accepted (no crash). No live gym currently uses an `SW1A*` postcode, so that query is empty/prefix-only.

---

## 7. Onboarding

`OnboardingGymPicker` uses `searchGyms` on the full catalog, max **3** centers, `formatGymDisplayName`, and `gymPickerLocationLine` (localized United Kingdom). Selected IDs are real `gb_*` values. Raw IDs are not shown.

Empty-state “Popular gyms” is still a fixed Danish ID list. That is existing onboarding chrome, not a UK search ranking bug. Searching a UK city or brand does not dump Danish gyms into the results.

Mixed-country selections remain allowed (max 3 unchanged).

---

## 8. Profile / favorites

Profile / edit-centers / favorite picker resolve `gb_*` via `findGymById` / `findGymByIdRelaxed` and display `formatGymDisplayName`. Max 3 is unchanged. Mixed-country favorites work. Missing IDs in `resolveHomeGymCenterRows` keep the stored ID with a placeholder name instead of substituting another gym.

---

## 9. Nearest gym

Representative coordinates → local `gb_*` gym (linear nearest scan, finite coords only):

| Origin | Nearest | Distance |
|---|---|---:|
| London 51.5074, -0.1278 | PureGym London Piccadilly (`gb_382397961e`) | 393 m |
| Manchester | PureGym Manchester Market Street (`gb_81be20c3a1`) | 206 m |
| Birmingham | PureGym Birmingham Snow Hill Plaza (`gb_13db375391`) | 486 m |
| Glasgow | PureGym Glasgow Bath Street (`gb_bf183b819a`) | 525 m |
| Cardiff | JD Gyms Cardiff (`gb_4115f9205b`) | 401 m |
| Belfast | PureGym Belfast Adelaide Street (`gb_d01ec5cf43`) | 372 m |

UK never inherits Danish postal approximation, Stockholm `59.33, 18.07`, or a London fallback. Missing UK coordinates stay NaN / not check-in eligible.

---

## 10. Dense / nearby gyms

UK has many close gyms. Different-brand pairs under 50 m remain separate IDs. Map jitter keeps co-located pins independently selectable. Manual gym selection sets `isManualGymSelection`; GPS refresh does **not** overwrite that choice until Lokalitet reset. Check-in / history / feed use `gym.id` of the selected center.

Do not collapse nearby gyms.

---

## 11. Six known close clusters

All six merge-era different-brand ≤50 m clusters are still separate current gyms:

| Pair | IDs | Distance |
|---|---|---:|
| Energie Fitness Erith / PureGym Erith | `gb_59728c6752` / `gb_7e6359f61b` | 12 m |
| Nuffield Health Swindon / The Gym Group Swindon | `gb_a49489a5a5` / `gb_6e01651f16` | 13 m |
| Anytime Fitness London / Snap Fitness Raynes Park | `gb_ba90d2237e` / `gb_d75a662a41` | 24 m |
| PureGym London Kingston / The Gym Group London Kingston | `gb_08ae43a9ef` / `gb_3515988c73` | 33 m |
| PureGym London Wood Green / The Gym Group London Wood Green The Mall | `gb_fff73c7cab` / `gb_03ee1ff844` | 42 m |
| Anytime Fitness London / Energie Fitness Kilburn | `gb_f240a78429` / `gb_cc5aa6f225` | 45 m |

Also kept: Everlast Gyms York (`gb_11bf1f7e0c`) vs PureGym York (`gb_8770dbb0c6`), same `YO30 4TU` / Stirling Road, ~74 m. Legitimate separate brands; not catalog errors.

---

## 12. 200 m check-in

Threshold **unchanged** at 200 m. Inclusive `<= 200` allowed, `> 200` blocked.

| Offset | Allowed |
|---|---|
| 500 m | no |
| 250 m | no |
| 201 m | no |
| 200 m | yes |
| 199 m | yes |
| 100 m | yes |
| 10 m | yes |

Source of truth is the **selected** UK gym coordinates via `getGymLatLngForCheckIn(selectedId)`.

---

## 13. Auto-checkout

`decideGeofenceAutoCheckout`: 200 m = still inside (`none`); 201+ m = `set_away` then existing grace / checkout flow.

`runAutoCheckoutEvaluation` measures distance with `getGymLatLngForCheckIn(row.gym_id)` — the **active session gym ID**, not nearest / first catalog / country fallback. Dense-city neighbours cannot switch the session center.

---

## 14. Workout log / PR

Check-in persists `gym_id` + `gym_name` from the selected gym. Workout log / PR / media paths do not branch on country. A UK session uses the same log, set, rep, weight, and PR engines as DK/SE/NO/DE.

---

## 15. History

History rows show stored `gym_name` (formatted with brand). `gb_*` lookup is used where a live gym is needed. Raw IDs are not rendered when the gym resolves. Relaxed lookup is case/trim tolerant.

---

## 16. Feed / share

Feed/share content uses stored `center_name` / `gym_name` plus `findGymById` when present. A missing UK ID does not fall back to a Danish gym. `activeCentersService` already prefers the stored row name over inventing another center.

---

## 17. Notifications

Planned-invite UI uses stored `center_name` / `gymName` for the visible line. Address is resolved from `findGymById` when available, otherwise omitted (not replaced with another gym). Notification copy was not changed.

---

## 18. Planned sessions

`PlanSessionCenterPickerSheet` uses the shared `searchGyms` index (city, brand, and now postcode). Persistence writes the selected `gb_*` and display name. Mapping an orphan `center_id` now uses `resolveGymOrStub` (stored name) instead of `getActiveGyms()[0]`.

---

## 19. Map

`MapScreen` builds markers then **filters to the current viewport** (`filterMapCentersInRegion`). It does not render all 4,426 pins at once.

London / Manchester / Birmingham / Glasgow / Cardiff / Belfast viewports (`Δ 0.35`) show `gb_*` pins and no DE/NO/SE pins. Nearby jittered pins remain independently selectable.

One **Swedish** active row (`se_7f7137b434` Actic Göteborg Landvetter) has null raw coordinates and is omitted from raw-coordinate map lists; the DanishGym model still applies the legacy Stockholm fallback. UK is not on that path.

---

## 20. Country / i18n

Existing keys only. No hardcoded United Kingdom strings where localization exists.

| Language | Label |
|---|---|
| English | United Kingdom |
| Danish | Storbritannien |
| Swedish | Storbritannien |
| Norwegian Bokmål | Storbritannia |

Supported UI languages remain `da | en | sv | nb`. No `en-GB` pack.

Optional spelling only (not required): colour/centre vs color/center in English UI copy. Existing English pack is used for UK users.

---

## 21. Orphan-ID safety

Dangerous `getActiveGyms()[0]` fallbacks that resolved a **stored** center ID were fixed:

- Chat planned-session mapper
- Planned-workout service mapper

Missing `gb_*` now yields an unresolved stub (stored name if available, NaN coords, not a live Danish gym). Hashed `gb_/de_/no_/se_` IDs in `humanizeCenterId` render as `Unknown gym` instead of a mangled slug.

New-plan pickers no longer pre-select catalog `[0]` (a Danish gym) when the user has no favorite; the user must pick a center.

`getDanishGymDemoFallback()` still uses the first active gym for **demo** mode only.

---

## 22. Performance

`npm run bench:catalog` on the real 4,426 catalog:

| Metric | Merge approx | This QA live |
|---|---:|---:|
| parse | 5 ms | 6 ms |
| index (cold) | 297 ms | 588 ms |
| cached index | 0 ms | 0 ms |
| typical search (3q) | 220 ms | 528 ms (first live pass) |
| nearest | 14 ms | 29 ms |
| map build | 15 ms | 21 ms |

Synthetic 5k after cache is index 263 ms / typical search 241 ms. UX remains comfortable. Catalog architecture was not redesigned. No brittle micro-timing assertions were added.

---

## 23. Denmark regression

Denmark = **354** (350 active; 4 Fitness X coming-soon still excluded). SATS København search, lookup, map, and 200 m inclusive threshold still work.

---

## 24. Sweden regression

Sweden = **639**. Nordic Wellness Stockholm search, lookup, and map still work.

**Remaining Sweden risk (not in scope):** `getEffectiveLatLng` still maps ungeocoded Swedish rows to Stockholm `59.33, 18.07`. Live example: Actic Göteborg Landvetter (`se_7f7137b434`) has null coords. UK cannot enter this branch (`allowsInventedCoordinates('United Kingdom') === false`).

---

## 25. Norway regression

Norway = **535**. SATS Oslo, ASCII `Tromso`, lookup, map, and 200 m still work.

---

## 26. Germany regression

Germany = **1,424**. McFIT / München / `ß→ss` (`Greifswalder Strasse`), lookup, map, and 200 m still work. Germany QA catalog assertion updated from 2,952 → 4,426.

---

## 27. Tests added / run

Added: `__tests__/ukGymQa.test.ts` (53 tests).

Updated: `__tests__/germanyGymQa.test.ts`, `__tests__/catalogScalePrep.test.ts`.

Run (pass):

- `ukGymQa`
- `germanyGymQa`
- `norwayGymQa`
- `catalogScalePrep`
- `gymSearchSweden`
- `mapVisibleCenters`
- `evaluateAutoCheckout`
- `feedPostComposition`
- `npm run bench:catalog`

`workoutLog` / `personalRecordEngine` / `shareWorkout` fail to *load* in this Jest config (`AsyncStorage is null`). Pre-existing harness issue, not a UK catalog regression.

---

## 28. Bugs found

1. Planned-session / chat ID resolution fell back to `getActiveGyms()[0]` (a Danish gym) when `gb_*` was missing.
2. New chat/invite plans pre-selected that same first Danish gym when the user had no favorite.
3. `humanizeCenterId` would title-case an unresolved hashed `gb_*` id.
4. Two The Gym Group addresses contained `â€“` mojibake.
5. Germany / scale-prep tests still expected catalog size 2,952 / UK = 0 (stale after merge).
6. Brand aliases and postcode prefix scoring were thinner than needed for `the gym` / `jd` / `SW1` style queries (search still matched many cases via haystack; aliases/scoring made behaviour robust).

---

## 29. Bugs fixed

1. `resolveGymOrStub` / `unresolvedGymStub` — never substitute another physical gym.
2. Chat + planned-workout mappers use that helper; invite/chat pickers start empty unless a profile gym exists.
3. `humanizeCenterId` returns `Unknown gym` for unresolved hashed country IDs.
4. Production addresses:
   - The Gym Group London Fulham: `254 – 258 North End Road`
   - The Gym Group London Sutton: `Unit B3 – B5 291-297 High Street`
5. Shared search: UK chain aliases, `Storbritannia` haystack, postal prefix/compact scoring.
6. Stale catalog-count assertions updated to 4,426 / UK 1,474.

---

## 30. Files changed (this QA)

- `src/data/centers.json` — two mojibake address fixes only
- `src/utils/gymDisplay.ts`
- `src/services/gymSearch/gymSearchIndex.ts`
- `src/services/gymSearch/gymSearchEngine.ts`
- `src/screens/main/ChatScreen.tsx`
- `src/screens/main/InviteToWorkoutScreen.tsx`
- `src/services/supabase/plannedWorkoutService.ts`
- `src/services/supabase/homeGymsService.ts`
- `__tests__/ukGymQa.test.ts`
- `__tests__/germanyGymQa.test.ts`
- `__tests__/catalogScalePrep.test.ts`
- `data/uk/UK_QA_REPORT.md`

No unresolved staging rows were merged. Check-in radius was not changed.

---

## 31. Remaining risks

- Sweden Stockholm fallback remains for ungeocoded SE rows (see §24). Do not treat as a UK blocker.
- Onboarding empty “Popular gyms” list is still Danish IDs by design.
- Generic names such as `Anytime Fitness London` / `Snap Fitness London` appear more than once for distinct sites. Not scrape titles; not mass-cleaned.
- 166 `NEEDS_COORDINATES`, 5 `NEEDS_REVIEW`, 71 `COMING_SOON`, 1 `CLOSED` stay in staging. Nuffield Health Barrow is **not** live.
- Demo fallback `getDanishGymDemoFallback()` still uses the first active gym.
- Unused `findGymByName` in `workoutPlanStore` still has a `[0]` fallback if revived.
- Cold search-index build is slower with 4,426 rows + aliases (~0.6 s); cached index is 0 ms.

---

UK STATUS: READY
