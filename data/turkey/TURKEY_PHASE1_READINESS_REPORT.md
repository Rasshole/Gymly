# TURKEY DEEP PHASE 1

Generated: 2026-08-29T17:36:29Z

## START

Turkey Deep Phase 1 — national discovery + existing production audit. Production read-only throughout. HARD STOP after Phase 1.

## PRODUCTION BASELINE

| Metric | Value |
|--------|------:|
| CATALOG_TOTAL | 12,080 |
| BELARUS_LIVE | 46 |
| UKRAINE_LIVE | 105 |
| MALTA_LIVE | 24 |
| SHA256 | `601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740` |
| Bytes | 3,761,727 |
| Headroom to 12,500 | 420 |

## EXISTING TURKEY PRODUCTION

- TURKEY_LIVE = 0
- TR_PREFIX_LIVE = 0
- TURKEY_PRODUCTION_PRESENT = NO
- Snapshot: `TURKEY_EXISTING_PRODUCTION_SNAPSHOT.json` (empty array)

## COUNTRY / PREFIX / POSTCODE

- Canonical country: **Turkey** (stored); search aliases Türkiye / Turkiye
- Canonical prefix: **`tr_*`**
- Postcode model: **NNNNN (5 digits)** — regex `^\d{5}$`
- Verified: `TURKEY_POSTCODE_MODEL.json`

## TURKISH NORMALIZATION

- `normalize_turkish_search()` — ı/i, İ/I, ş/s, ğ/g, ç/c, ö/o, ü/u
- Canonical local names preserved in storage
- Alias map: `TURKEY_LOCALITY_ALIAS_MAP.json`

## MARKET MODEL

**CHAIN_LED** — MACFit, B-Fit (women's chain), GymFit, Sports International, Mars Athletic Club dominate; independents present via OSM/Photon sweep.

## CLASS A

| Operator | READY | Official Est. | Gap |
|----------|------:|--------------:|----:|
| MACFit | 34 | 320 | 286 |
| B-Fit | 62 | 120 | 55 |
| GymFit | 20 | 22 | 0 (+2 CS) |
| Sports International | 6 | 28 | 22 |
| Mars Athletic Club | 2 | 45 | 43 |
| LifeClub | 0 | 18 | 18 |

- CLASS_A_CHAIN_COUNT = 6
- CLASS_A_ESTATE_GAPS = 427

## MAJOR CHAINS

- **GymFit**: 22/22 from official API (`gymfit.com.tr/api/clubs`) — COMPLETE
- **MACFit**: 34 from OSM + Photon — official site CF-blocked; estate incomplete
- **B-Fit**: 62 READY from Photon (broad "fit" matches; 3 CrossFit excluded post-classify)
- **Sports International**: 6 partial; site reachable, no machine-readable club list
- **Mars Athletic Club**: 2 partial; macfit.com CF-blocked sibling

## INTERNATIONAL CHAINS

All probed absent in Turkey: Anytime Fitness, Gold's Gym, World Class, Fitness First, Snap Fitness, UFC Gym, F45, Basic-Fit, McFIT, FITINN, Fitness24Seven.

## ISTANBUL — EUROPE / ASIA

- European districts: Bağcılar, Bakırköy, Beşiktaş, Eyüpsultan, Fatih, Küçükçekmece, Sarıyer, Zeytinburnu — READY coverage
- Asian districts: Ataşehir, Kadıköy, Kartal, Maltepe, Pendik, Sancaktepe, Ümraniye — READY coverage
- Istanbul READY total: 19+ (district-level entries)

## ANKARA / IZMIR / BURSA / ANTALYA / ADANA / KONYA / GAZIANTEP / MERSIN / KOCAELI

| City | Audit Grade | READY |
|------|-------------|------:|
| Ankara | A | 11+ |
| İzmir | A | 3+ |
| Bursa | A | 3 |
| Antalya | A | 2 |
| Adana | A | 1 |
| Konya | A | 1 |
| Gaziantep | D (material) | 1 (district) |
| Mersin | D (material) | 2 (Yenişehir) |
| Kocaeli | A | 4 |

## 81-PROVINCE COVERAGE

- Grade A: 11 provinces
- Grade B: 0
- Grade C: 1 (Muğla — resort probes excluded)
- Grade D: 69
- Material D gaps: Diyarbakır, Gaziantep, Kayseri, Mersin

## STAGING INVENTORY

| Bucket | Count |
|--------|------:|
| READY_TO_IMPORT | 125 |
| NEEDS_REVIEW | 2 |
| NEEDS_COORDINATES | 0 |
| COMING_SOON | 2 |
| EXCLUDED | 6 |
| CLOSED | 0 |
| **TOTAL_STAGED** | **135** |

## SCALE PROJECTION

- EXISTING_TURKEY_PRODUCTION = 0
- GENUINELY_NEW_READY = 125
- PROJECTED_CATALOG_TOTAL = 12,205
- PROJECTED_REMAINING_HEADROOM = 295
- PROJECTED_CROSSES_12500 = NO
- GLOBAL_STRESS_QA_REQUIRED_AFTER_FUTURE_MERGE = NO

## TESTS

- `__tests__/turkeyPhase1Staging.test.ts` — **11/11 PASS**

## PRODUCTION IMMUTABILITY

- INSERTIONS = 0, UPDATES = 0, REMOVALS = 0
- PHASE1_SHA_BEFORE == PHASE1_SHA_AFTER == frozen baseline

## PHASE 1 VERDICT

**TURKEY PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION**

Phase 2 reason: NR=2, estate_gaps=427, material_d=4 (Diyarbakır, Gaziantep, Kayseri, Mersin). MACFit/B-Fit/LifeClub official estates CF-blocked or not machine-readable. Terminal national resolution + Class A estate completion required before merge-ready.
