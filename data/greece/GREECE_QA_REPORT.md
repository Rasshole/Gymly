# GREECE PRODUCTION QA REPORT

**Generated:** 2026-08-23  
**Catalog:** 10,878  
**Greece:** 106 (`gr_*`)  
**Pre-QA SHA256:** `cda6b1040d4031953fa63c0bc868214fb502826277aa19e0a37e9009fef08220`  
**Post-QA SHA256:** `93283ab74cfb19bb197f6f09b7f833f3dfb56f1ff98a35c5aefa4c15ddb45b92`  
**Verdict:** GREECE STATUS: READY  
**Country expansion:** UNLOCKED

---

## Overall

| Item | Result |
|------|--------|
| Status | **READY** |
| Production modified? | **Yes** — 3 Planet Fitness Greece address/postcode repairs |
| Full QA completed? | **Yes** |

---

## Catalog

| Metric | Value |
|--------|------:|
| Total | 10878 |
| Greece | 106 |
| gr_* | 106 |
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Cyprus contamination | 0 |
| Mojibake | 0 |

---

## Brand breakdown

| Brand | Count |
|-------|------:|
| Alterlife | 72 |
| Yava | 22 |
| Planet Fitness Greece | 5 |
| Mega Gym | 4 |
| Holmes Place | 3 |
| **Total** | **106** |

---

## Merge reconciliation

| Check | Result |
|-------|--------|
| Approved IDs == production | PASS |
| Staging MERGED_INTO_CATALOG == production | PASS |
| Unexpected Greece IDs | 0 |
| Missing approved IDs | 0 |
| Metadata drift | NONE (address repairs sync’d to staging/approved/Phase2 READY) |
| Prior country counts | unchanged |

---

## Critical Alterlife pair

| Field | Value |
|-------|-------|
| IDs | `gr_f92effe0b0` (Βεΐκου) / `gr_0fc7dfed4c` (Λ. Γαλατσίου) |
| Distance | ~14 m |
| Classification | **A** — legitimate separate clubs |
| Evidence | Live Alterlife pages `galatsi-veikou` vs `galatsi-galatsiou-ave`; distinct streets; postcodes **111 46** vs **111 41** |
| Action | Retain both |
| Result | PASS + regression coverage in `greeceGymQa` |

---

## YAVA QA

| Check | Result |
|-------|--------|
| Estate | 22 / 22 |
| `/content/*` sources | PASS |
| Legacy `?gym=` rows in production | 0 |
| Cyprus/foreign | 0 |
| Search (yava / partial / Greek+Latin cities) | PASS |

---

## Duplicate / proximity QA

| Bucket | Count |
|--------|------:|
| Same-brand ≤25 m | 1 (Galatsi A) |
| Same-brand ≤50 m | 1 |
| Same-brand ≤100 m | 1 |
| Same-brand ≤200 m | 1 |
| Identical coordinates | 0 |
| Different-brand co-locations (≤100 m) | 0 |

---

## Rebrands / legacy / exclusions

| Staging category | Count | In production |
|------------------|------:|:-------------:|
| NEEDS_COORDINATES | 15 | no |
| NEEDS_REVIEW | 3 | no |
| DUPLICATE/LEGACY | 1 | no |
| COMING_SOON | 0 | — |
| CLOSED | 0 | — |
| Unresolved Mega Gym | 3 | no |
| Cyprus Alterlife | 0 | — |
| YAVA legacy 404 | 0 | — |

---

## Island QA

| Location | Presence | Check-in / geo |
|----------|:--------:|:--------------:|
| Crete (Heraklion + Chania YAVA) | yes | PASS |
| Rhodes (YAVA) | yes | PASS |
| Syros (Alterlife) | yes | PASS |
| Salamina (Planet Fitness) | yes | PASS |

Mainland-only rejection: **not observed**.

---

## Search

Brands, partial typing, Greek/Latin city aliases (Αθήνα/Athens, Θεσσαλονίκη/Thessaloniki, Ηράκλειο/Heraklion, Χανιά/Chania, Ρόδος/Rhodes, Πάτρα/Patra), postcodes, and short prefixes: **PASS**.

Stored Greek display text remains intact; normalization is search-only.

---

## Core flows

Onboarding/profile/favorites resolution, nearest, map viewport, check-in (199/200/201), auto-checkout (200 m), orphan `gr_nonexistent_test` → Greece stub: **PASS**.

Radii unchanged: check-in **200 m**, auto-checkout **200 m**.

---

## Regressions

| Country | Count | Status |
|---------|------:|--------|
| DK | 354 | OK |
| SE | 639 | OK |
| NO | 535 | OK |
| DE | 1424 | OK |
| UK | 1474 | OK |
| FI | 429 | OK |
| NL | 600 | OK |
| FR | 1712 | OK |
| ES | 976 | OK |
| IT | 588 | OK |
| BE | 363 | OK |
| PL | 621 | OK |
| AT | 335 | OK |
| CH | 475 | OK |
| PT | 247 | OK |
| GR | 106 | OK |
| **TOTAL** | **10878** | OK |

---

## Performance (10,878 catalog)

| Metric | Value |
|--------|------:|
| JSON size | 3.21 MB |
| Parse | ~17 ms |
| Cold index | ~2.8 ms |
| Cached | ~0 ms |
| Typical search | ~3 ms |
| Worst scan | ~0 ms |
| Nearest | ~14 ms |
| Map build | ~6.5 ms |
| Viewport filter | ~1.5 ms |
| Assessment | **GOOD** |

Architecture: **KEEP CLIENT-SIDE** (no migration).

Compare: prior Portugal QA at 10,772 was same order of magnitude; Greece +106 is not a scale regression.

---

## Tests

| Suite | Result |
|-------|--------|
| greeceGymQa | PASS (44) |
| greeceMergeSafety | PASS |
| greecePhase2Staging | PASS |
| greecePhase1Staging | PASS |
| batch1CatalogScalingPrep | PASS |
| portugalMergeSafety | PASS |
| switzerlandMergeSafety | PASS |

**7 suites · 104 tests · 0 failed**

---

## Bugs found

1. **Planet Fitness Χαλκίδα (`gr_aa357c70a8`)** — address was phone `22210 77 658`; postcode wrongly `222 10`.  
2. **Planet Fitness Πειραιάς (`gr_e53450042b`)** — incomplete community label vs official `Θηβών 41`; postcode `185 42` → `185 43`.  
3. **Planet Fitness Σαλαμίνα (`gr_df2945b81f`)** — missing street number; postcode/city cleaned to official `Εθνάρχου Μακαρίου 23` / `189 00` / `Σαλαμίνα`.

---

## Bugs fixed

All three Planet Fitness address repairs applied with official club-page evidence (`Διεύθυνση` + map embed). Coordinates unchanged (already matched official map pins).

Artifacts updated:

- `src/data/centers.json`
- `data/greece/greece_centers_staging.json`
- `data/greece/GREECE_APPROVED_FOR_MERGE.json`
- `data/greece/GREECE_PHASE2_READY_TO_IMPORT.json`
- `data/greece/GREECE_QA_PLANET_ADDRESS_REPAIRS.json`

Regression coverage in `__tests__/greeceGymQa.test.ts`.

---

## Remaining risks

- 15 Alterlife NEEDS_COORDINATES + 3 Mega Gym NEEDS_REVIEW remain **out of production** (intentional).
- Dense Galatsi Alterlife pair (~14 m) requires correct selected-gym check-in (verified; no silent switch).
- Mega Gym residual 3 Attica locations still unresolved for a future polish pass (not blocking).

---

## Global scale status

| Item | Value |
|------|-------|
| Catalog total | **10,878** |
| New scale blocker | **NO** |
| Global Stress QA required | **NO** (>12,500 not crossed; no material global regression) |
| Country expansion | **UNLOCKED** |
| Architecture | **KEEP CLIENT-SIDE** |

---

## Files changed

- `src/data/centers.json` (3 Planet address repairs)
- `__tests__/greeceGymQa.test.ts` (new)
- `data/greece/GREECE_QA_REPORT.md` (this file)
- `data/greece/GREECE_QA_PLANET_ADDRESS_REPAIRS.json`
- `data/greece/GREECE_QA_PERFORMANCE.json`
- synced: staging / APPROVED / PHASE2 READY for the 3 repaired IDs

---

## Final verdict

**GREECE STATUS: READY**

**Country expansion: UNLOCKED**

STOP — do not start Ireland / Czechia / Hungary / another country.
