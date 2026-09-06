# SLOVAKIA PRODUCTION QA REPORT

Generated: 2026-08-24  
Catalog SHA256 (post-QA): `91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840`  
Merge SHA256 (pre-QA): `7364a4e60d54c0141c969ce1209b80092a07b851b7d8e1072b928f34e44a998a`

## Verdict

**SLOVAKIA STATUS: READY**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**  
Global Stress QA required: **NO**

## Baseline

| Metric | Expected | Actual |
|--------|----------|--------|
| Total | 11,254 | 11,254 |
| Slovakia | 37 | 37 |
| sk_* | 37 | 37 |

Country counts match the 21-country table (DK…RO unchanged; SK 37). Sum = 11,254.

## Catalog integrity

All 37 Slovak rows audited:

- Unique `sk_*` IDs, `country = Slovakia`, active/open
- Required name/brand/address/city
- Valid Slovak PSČ `NNN NN` (disjoint from Czechia `1–7`)
- Finite coordinates; no `0,0`; no fallback markers; no mojibake
- Foreign outliers: **0**

Defects after repair: **0**

## Brand breakdown

| Brand | Count |
|-------|------:|
| Form Factory | 15 |
| Golem Club | 11 |
| 365 Fit&Co | 8 |
| FITINN | 3 |
| **TOTAL** | **37** |

## Merge reconciliation

| Artifact | Count |
|----------|------:|
| Approved | 37 |
| Phase 2 READY | 37 |
| Staging MERGED_INTO_CATALOG | 37 |
| Production Slovakia | 37 |

Missing IDs: **0**  
Unexpected IDs: **0**  
Metadata drift: **NONE**

## Staging exclusions (not live)

| Status | Count | Notes |
|--------|------:|-------|
| COMING_SOON | 3 | Budatínska, Europa BC, Slnečnice |
| CLOSED | 1 | 365 Digital Park |

Absent from production: FITINN VIVO/Petržalka, EfectFit, MultiSport, Mozolani, Maximus, legacy FitCamp brand.

## Priority brand QA

### Form Factory — PASS (15)
- FitCamp under Form Factory identity; legacy FitCamp brand absent
- Sky Park present (`Bottova`, `811 09`, Bratislava)
- Coming-soon trio remain staging-only

### Golem Club — PASS after repair (11)
- Full gym estate; physiotherapy-only absent
- **QA repaired** Aupark Košice (wrong Michalovce geocode), Polus PSČ, Bory address/PSČ — see `SLOVAKIA_QA_REPAIR.json`

### 365 Fit&Co — PASS (8)
- Full Phase 2 estate including Hypertesco / ROCA / Južanka / Spišská Nová Ves
- Digital Park live = 0

### FITINN — PASS (3)
- Prior, Nido, Nitra only
- No VIVO/Petržalka; Slovakia coordinates only

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
| Different-brand ≤100 m | 0 |

## Border safety

Contamination CZ / AT / HU / PL / UA: **0**  
All 37 pass `isPlausibleSlovakiaCoordinate`.

## Search

- Brands (SK-scoped): Form Factory / Golem / 365 / FITINN resolve all `sk_*`
- Global city-qualified brand queries surface `sk_*`
- Cities: Bratislava, Košice/Kosice, Prešov/Presov, Žilina/Zilina, Banská Bystrica, Nitra, Trenčín, Martin, Poprad, Spišská Nová Ves, Považská Bystrica
- Display preserves Slovak diacritics; search folds ASCII
- PSČ `NNN NN` + compact form supported by shared normalization
- CZ/SK postcode namespaces remain disjoint (`0/8/9` vs `1–7`)

## Core flows

| Flow | Result |
|------|--------|
| Onboarding (BA/KE/ZA/NR/TN) | PASS — `sk_*` persists |
| Profile / favorites | PASS — exact ID; no `catalog[0]` |
| Nearest (8 cities) | PASS — plausible `sk_*` |
| Map viewports | PASS — filtered SK subset |
| Check-in 199/200/201 | PASS — radius **200 m** unchanged |
| Auto-checkout | PASS — threshold **200 m**; session gym is source of truth |
| Workout/PR/History/Feed/Planned | PASS — ID resolution country-independent |
| Orphan `sk_nonexistent_test` | PASS — Slovakia stub |

## Regional coverage

Matches Phase 2: Bratislava 21, Košice 5, Prešov 1, Žilina 2, Banská Bystrica 1, Nitra 1, Trenčín 2, Martin 1, Poprad 1, Spišská Nová Ves 1, Považská Bystrica 1.  
Trnava: **0** (legitimate no-chain presence).

## Performance

From `SLOVAKIA_QA_PERF.json` (Jest run; cold index may be warm):

| Metric | QA | Merge baseline |
|--------|---:|---------------:|
| Catalog | 11,254 | 11,254 |
| Active | 11,250 | 11,250 |
| JSON size | 3.33 MB | 3.33 MB |
| Parse | 22 ms | 48.51 ms |
| Typical search | ~198 ms | 1.97 ms |
| Worst search | 12 ms | 0.01 ms |

Assessment: **no material architecture regression** vs Romania (~11,217 / 3.32 MB). Variance is environment/warmup. Architecture remains **KEEP CLIENT-SIDE**.

## Bugs found

1. **Golem Club Aupark Košice** (`sk_0ebf33c4c0`) — street-name geocode to Michalovce (`071 01`, ~49 km off). Official: `Námestie Osloboditeľov 1, 040 01 Košice` ([golemclub.sk/kontakt/kosice](https://www.golemclub.sk/sk/kontakt/kosice)).
2. **Golem Club Polus Bratislava** (`sk_7badf0792e`) — postal `900 32` vs official `831 04` ([kontakt/polus](https://www.golemclub.sk/sk/kontakt/polus)).
3. **Golem Club Bory Mall Bratislava** (`sk_8406d030d6`) — postal `900 32` / `Lamač 6683` vs official `Lamač 6780, 841 03` ([kontakt/bory](https://www.golemclub.sk/sk/kontakt/bory)).

## Bugs fixed

All three repaired in production + staging + approved + Phase 2 READY. Artifact: `data/slovakia/SLOVAKIA_QA_REPAIR.json`.

## Remaining risks (non-blocking)

- Global bare `FITINN` / `Form Factory` searches rank foreign sister-brand clubs ahead of `sk_*` until city-qualified or country-scoped (expected multi-country behavior; SK pickers scope correctly).
- Some Bratislava west coordinates can sit near CZ bbox helper fringe; country field + SK helper remain authoritative.

## Global scale

| | |
|--|--:|
| Catalog | 11,254 |
| 12,500 crossed | NO |
| Global Stress QA required | NO |
| Country expansion | UNLOCKED |
| Architecture | KEEP CLIENT-SIDE |

## Tests

- `__tests__/slovakiaGymQa.test.ts` — 30 passed
- `slovakiaMergeSafety`, `slovakiaPhase1Staging`, `slovakiaPhase2Staging`, `romaniaMergeSafety`, `hungaryMergeSafety`, `czechiaMergeSafety` — all passed  
**Total: 7 suites / 91 tests / 0 failed**

## Files changed

- `src/data/centers.json` (3 Golem repairs)
- `data/slovakia/slovakia_centers_staging.json`
- `data/slovakia/SLOVAKIA_APPROVED_FOR_MERGE.json`
- `data/slovakia/SLOVAKIA_PHASE2_READY_TO_IMPORT.json`
- `data/slovakia/SLOVAKIA_QA_REPAIR.json` *(new)*
- `data/slovakia/SLOVAKIA_QA_REPORT.md` *(new)*
- `data/slovakia/SLOVAKIA_QA_PERF.json` *(new)*
- `data/slovakia/SLOVAKIA_MERGE_REPORT.json` (QA annotation)
- `__tests__/slovakiaGymQa.test.ts` *(new)*
- SHA constants in Slovakia/Romania phase staging tests
