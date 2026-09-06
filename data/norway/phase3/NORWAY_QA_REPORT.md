# Gymly Norway QA Report

**Date:** 2026-08-16  
**Catalog:** 1,528 total · DK 354 · SE 639 · NO 535  
**Overall status:** **READY**

No additional centers were added during QA. No final interactive device QA was run in this pass; validation is code-path + automated tests + catalog audit.

---

## 1. PASS/FAIL summary

| Area | Result |
|------|--------|
| Catalog integrity | **PASS** |
| Search | **PASS** (aliases improved) |
| Onboarding / saved centers | **PASS** (code-path) |
| Nearest gym | **PASS** |
| Co-located Triaden/MUDO | **PASS** |
| 200 m check-in | **PASS** (inclusive `<= 200`) |
| Auto-checkout | **PASS** (same 200 m rule) |
| Workout / history / feed | **PASS** (code-path; stores `gym_id` + `gym_name`) |
| Map | **PASS** |
| Coordinate outliers | **PASS** (0 out-of-bounds) |
| Denmark regression | **PASS** |
| Sweden regression | **PASS** (pre-existing Stockholm fallback noted) |
| Automated tests | **PASS** (30 new Norway tests) |

---

## 2. Catalog validation

| Check | Result |
|-------|--------|
| Total | 1,528 |
| Denmark | 354 (350 active + 4 coming-soon) |
| Sweden | 639 (1 null lat/lng: Actic Göteborg Landvetter — pre-existing) |
| Norway | 535 all active, all finite coords |
| Duplicate IDs | 0 |
| Active with null/NaN/0,0 | Norway 0; SE 1 null (fallback to Stockholm in app) |
| Invalid countries | 0 |
| Norway ID convention `no_[a-f0-9]{10}` | 535/535 |
| Norwegian characters æ/ø/å/Ø/Å | Present in names/addresses; 0 mojibake |
| Malformed empty name/brand/address/city | 0 |

---

## 3. Search results

Tested via `searchGyms` for brands: SATS, EVO, Fresh, MOVA, Feel24, Sporty, Fitness24Seven, Fitnesspoint, SKY, Spenst, MUDO, 3T, Impulse — all return Norway hits.

Cities: Oslo, Bergen, Trondheim, Drammen, Kristiansand, Tromsø/`Tromso`, Lørenskog/`Lorenskog` — PASS.

**Fix applied:** Norwegian city aliases (ASCII forms) + missing chain aliases (Fitnesspoint, Impulse, SKY, Spenst, expanded Sporty/3T).

---

## 4. Onboarding validation

Code-path: `OnboardingGymPicker` uses `allGyms` from `getActiveDanishGyms()` (includes Norway), `MAX_GYMS = 3`, search tokens, display via `formatGymDisplayName`. Persistence via `favoriteGyms` string IDs → `user_centers` / `profiles.favorite_gym_ids`. `no_*` IDs are plain strings — no schema type restriction found.

Popular-onboarding defaults remain Danish-only (UX default, not a Norway blocker).

---

## 5. Profile / saved-center validation

`EditProfileCentersSheet` / `homeGymsService` / `findGymByIdRelaxed` resolve Norway IDs. Reopen persistence uses same ID list. Country switch is selecting different center IDs — no country lock.

---

## 6. Nearest-center validation

`findNearestGymFromCoords` uses Haversine on active gym lat/lng. Norway uses real coords; `getEffectiveLatLng` returns NaN (never Stockholm/DK fallback) if Norway coords missing. All 535 NO have real coords today.

---

## 7. Close / co-located gym validation

**SATS Triaden** + **MUDO Gym Lørenskog**: same address/coords, distinct IDs/brands.  
Manual selection sets `isManualGymSelection=true` before `setSelectedGym` — GPS nearest must not overwrite. Map jitter separates pins. Check-in/session store selected `gym_id`.

Second legitimate co-location: EVO Tromsø sentrum + Feel24 Tromsø Skippergata (different brands).

---

## 8. 200 m check-in validation

`CHECK_IN_RADIUS_METERS = 200`  
Eligibility: `distance <= 200` (inclusive).  
Reject: `metersAway > 200`.  

| Distance | Expected | Result |
|---------:|----------|--------|
| 500 / 250 / 201 | disabled | PASS |
| 200 | allowed | PASS |
| 199 / 100 / 10 | enabled | PASS |

Threshold unchanged.

---

## 9. Auto-checkout validation

`AUTO_CHECKOUT_DISTANCE_METERS = 200`  
`decideGeofenceAutoCheckout`: `<= 200` inside; `> 200` starts away → grace → checkout.  
Evaluation uses `getGymLatLngForCheckIn(session.gym_id)` — selected session gym, not nearest.

**Fix:** `getGymLatLngForCheckIn` now returns `null` instead of NaN coords (prevents silent geofence no-op for hypothetical ungeocoded Norway).

---

## 10. Workout / history validation

Check-in writes `gym_id` + `gym_name`. History/feed primarily display stored `gym_name` (not raw ID). Presence/local activity prefer `findGymById` → `formatGymDisplayName` when ID resolves. `no_*` resolves via `findGymById`.

---

## 11. Feed / social validation

Activity feed uses stored gym name. Registry lookup works for Norway IDs. No DK/SE fallback in feed composition for resolved IDs.

**Residual risk:** `ChatScreen` / `plannedWorkoutService` fall back to `getActiveDanishGyms()[0]` if ID missing — could show a non-Norway gym for orphan IDs (pre-existing pattern, not Norway-specific).

---

## 12. Map validation

Oslo viewport filter shows only `no_*` pins (automated). Co-located markers jittered. No Norway pins with DK/SE coords (0 outliers).

---

## 13. Coordinate outliers

- Outside Norway bbox (57.5–72.0N, 4.0–32.0E): **0**
- Identical-coord clusters: **2** (Triaden/MUDO; EVO+Feel24 Tromsø) — both multi-brand legitimate

---

## 14. Denmark regression

Catalog 354 unchanged. Active searchable 350. Search smoke `SATS København` PASS. Sweden suite still PASS.

---

## 15. Sweden regression

Catalog 639 unchanged. Search smoke Nordic Wellness Stockholm PASS. Pre-existing: missing SE coords → Stockholm `59.33, 18.07` fallback (Actic Landvetter).

---

## 16. Performance

`centers.json` parse ~5 ms. Client-side catalog 1,528 centers — same architecture as before (was 1,360). Search/map should remain acceptable. No server-backed migration recommended in this task. Monitor low-end devices if search lag appears.

---

## 17. Bugs found

1. Norwegian city ASCII search weak vs Sweden (e.g. `Tromso` vs `Tromsø` → `tromsoe`) — **fixed** with city aliases.  
2. Missing chain aliases for Fitnesspoint / Impulse / SKY / Spenst — **fixed**.  
3. `getGymLatLngForCheckIn` could return NaN for ungeocoded Norway — **fixed**.  
4. Pre-existing SE null coords + Stockholm fallback — **reported, not changed**.  
5. Pre-existing Chat/planned gym `[0]` fallback — **reported, not changed**.  
6. Country label: data uses English `"Norway"`; app region uses `"Norge"` — no dedicated i18n country-name keys (consistent with existing country field pattern).

---

## 18. Bugs fixed

- `src/services/gymSearch/gymSearchIndex.ts` — NO city + chain aliases  
- `src/utils/gymCoordinatesForCheckIn.ts` — reject non-finite coords  

---

## 19. Files changed

- `src/services/gymSearch/gymSearchIndex.ts`
- `src/utils/gymCoordinatesForCheckIn.ts`
- `__tests__/norwayGymQa.test.ts` (new)
- `data/norway/phase3/NORWAY_QA_REPORT.md` (this file)

---

## 20. Remaining risks

1. Device/manual QA still recommended for GPS check-in, auto-checkout grace, and feed notifications on a physical phone.  
2. Sweden Stockholm fallback for ungeocoded centers (pre-existing).  
3. Orphan gym-id fallback to first active gym in Chat/planned flows.  
4. Onboarding “popular” list is Denmark-centric (cosmetic).  
5. Client-side 1,528-center search on very low-end devices (monitor only).

---

## Overall: **READY**

Norway is production-ready in Gymly for catalog, search, selection, nearest/check-in math, co-located centers, and DK/SE non-regression at the code/test level. Proceed with optional manual device QA when desired; do not start another country automatically.
