# SLOVENIA PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**SLOVENIA STATUS: READY**

Country expansion: **UNLOCKED**  
Production modified: **NO**  
Global Stress QA required: **NO**  
Architecture: **KEEP CLIENT-SIDE**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,448 |
| Slovenia | 32 |
| si_* | 32 |
| Post-merge SHA256 | `a1e097699ab64dfbda37826dccbaa4ebe219c2f0dc47cfd2f96b4c38f47b5a37` |

## Brand breakdown

| Brand | Count |
|-------|------:|
| Shape House | 18 |
| BODIFIT | 8 |
| FITINN | 6 |
| **TOTAL** | **32** |

Unexpected Slovenia brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| Approved | 32 |
| Phase 2 READY | 32 |
| Staging MERGED_INTO_CATALOG | 32 |
| Production | 32 |

Missing IDs: 0  
Unexpected IDs: 0  
Metadata drift: **NONE**

## Catalog integrity

| Check | Result |
|-------|--------|
| Duplicate IDs | 0 |
| Invalid postcodes | 0 |
| Missing fields | 0 |
| Invalid coordinates | 0 |
| Fallback coordinates | 0 |
| Foreign outliers | 0 |
| Mojibake | 0 |

## Shape House / rebrand

| Check | Result |
|-------|--------|
| Shape House live | 18 |
| clever fit live (consumer brand) | 0 |
| Tiskarna (Dunajska cesta 123) | PASS |
| Loberia (Celovška cesta 522, not 520) | PASS |
| Koper pair (Istrska + Planet Tuš) | PASS — 2 distinct |
| Novo mesto pair (Belokranjska 5 + Ljubljanska 32) | PASS — 2 distinct |
| Jesenice (Fužinska cesta 8) | PASS |

## BODIFIT / FITINN

| Brand | Result |
|-------|--------|
| BODIFIT 8 | PASS |
| FITINN 6 | PASS |
| Maribox current FITINN identity | PASS |
| Kolosej legacy row | ABSENT |

## Exclusions (live SI = 0)

ŠUS Eurofitness, 4P Fitness, MultiSport, FitGang, GIB Gym, Fit13, Alfa Gym, Herkul Koroška, Millennium BTC, Konex, Cube Fitness, Mega Center, Sparta Gym, Anytime Fitness, McFIT, JOHN REED, Gold's Gym, World Class, Fitness First, clever fit consumer brand — **all absent from production**.

Staging EXCLUDED (3): ŠUS Eurofitness Ljubljana, 4P Fitness Ljubljana Stegne, 4P Fitness Novo mesto.

## Duplicate / proximity

| Metric | Count |
|--------|------:|
| Duplicate IDs | 0 |
| Same-brand ≤25 m | 0 |
| Same-brand ≤50 m | 0 |
| Same-brand ≤100 m | 0 |
| Same-brand ≤200 m | 0 |
| Identical coordinates | 0 |
| Different-brand ≤100 m | 0 |

## Border safety

| Neighbor | Contamination |
|----------|--------------:|
| Italy | 0 |
| Austria | 0 |
| Hungary | 0 |
| Croatia | 0 |

Koper / Maribor / Murska Sobota / Jesenice coords inside Slovenia helper: **PASS**

## Regional coverage

| City | Count |
|------|------:|
| Ljubljana | 10 |
| Maribor | 6 |
| Celje | 3 |
| Kranj | 2 |
| Koper | 2 |
| Novo mesto | 2 |
| Murska Sobota | 2 |
| Domžale | 1 |
| Kamnik | 1 |
| Jesenice | 1 |
| Grosuplje | 1 |
| Mengeš | 1 |

Zero-chain (A_legitimate_no_chain_presence): Velenje, Nova Gorica, Ptuj, Slovenj Gradec.

## Search / core flows

Brand, city, diacritic/ASCII, and NNNN postcode (SI-scoped) searches: **PASS**  
Onboarding, profile/favorites, nearest, map viewport, 200 m check-in, auto-checkout, core ID resolution, orphan `si_nonexistent_test`: **PASS**

## Country regression

All prior countries intact (DK…HR) + SI 32 = **11,448**.

## Performance

See `SLOVENIA_QA_PERF.json`.

| Metric | Value |
|--------|------:|
| Catalog | 11,448 |
| Active | 11,444 |
| JSON size | 3.39 MB |
| Parse | 24 ms |
| Cold index | 2136 ms |
| Cached index | 0 ms |
| Typical search | ~205 ms |
| Worst search | 18 ms |
| Nearest | 0 ms |
| Map build | 0 ms |
| Viewport filter | 0 ms |

Assessment: **healthy** (matches Slovenia merge 11,448 / 3.39 MB; no material regression vs Croatia QA 11,416 / 3.38 MB).

## Tests

| Suite | Result |
|-------|--------|
| sloveniaGymQa | PASS |
| sloveniaMergeSafety | PASS |
| sloveniaPhase2Staging | PASS |
| sloveniaPhase1Staging | PASS |
| croatiaGymQa | PASS |
| bulgariaGymQa | PASS |
| slovakiaGymQa | PASS |
| romaniaGymQa | PASS |

**202 passed / 0 failed**

## Bugs found

None.

## Bugs fixed

None.

## Remaining risks

- Shared FITINN brand: global top-N ranking may prefer foreign FITINN clubs; country-scoped SI search ranks correctly.
- Zero-chain cities may fuzzy-match distant SI clubs; no production rows invent those cities.
- Both are non-blocking and consistent with prior-country QA.

## Global scale

| Metric | Value |
|--------|------:|
| Catalog | 11,448 |
| 12,500 crossed | NO |
| Global Stress QA required | NO |
| New global-scale blocker | NO |
| Country expansion | UNLOCKED |
| Architecture | KEEP CLIENT-SIDE |
