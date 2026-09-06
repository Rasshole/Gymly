# UK Phase 2 Readiness Report

Generated: 2026-08-17 21:13 UTC

**Status: PHASE 2 STAGING COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Overall

| Metric | Count |
|---|---:|
| Phase 1 unique UK staging total | 1607 |
| Additional Phase 2 discoveries (net after ingest/dedupe) | 110 |
| Final unique UK staging total | 1717 |
| READY_TO_IMPORT | 1373 |
| NEEDS_COORDINATES | 266 |
| NEEDS_REVIEW | 13 |
| COMING_SOON | 65 |
| CLOSED | 0 |
| Duplicates/rebrands removed this pass | 0 |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| PureGym | ~410 YE2024 / 494 listing URLs | 494 | 456 | 0 | 92.3% |
| The Gym Group | 264 open 30 Jun 2026 (company) | 271 | 252 | 11 | 93.0% |
| JD Gyms | 113 official gym URLs | 113 | 58 | 53 | 51.3% |
| David Lloyd | UK subset of ~149 UK+Europe listing | 113 | 109 | 4 | 96.5% |
| Nuffield Health | ~110–111 fitness & wellbeing gyms | 111 | 107 | 4 | 96.4% |
| Anytime Fitness | ~180–189 UK franchise clubs | 185 | 110 | 71 | 59.5% |
| énergie Fitness | UK subset; Ireland excluded | 48 | 29 | 18 | 60.4% |
| Bannatyne | ~68 health clubs | 63 | 42 | 21 | 66.7% |
| Fitness First | 24 mainland UK (Jersey excluded) | 23 | 23 | 0 | 100.0% |
| Snap Fitness | ~105 UK | 109 | 56 | 46 | 51.4% |
| Everlast Gyms | ~60 UK+IE; UK-only staged | 61 | 32 | 29 | 52.5% |
| Buzz Gym | 8 open + 3 coming soon | 11 | 6 | 2 | 54.5% |
| Village Gym | 33 gyms on official site | 34 | 34 | 0 | 100.0% |
| Total Fitness | 15 health clubs on official join directory | 15 | 8 | 7 | 53.3% |
| Gymbox | 10 London clubs (official homepage) | 10 | 8 | 2 | 80.0% |
| Third Space | 17 listed; 2 opening 2026 | 17 | 14 | 1 | 82.4% |
| Virgin Active | 31 UK clubs on official A–Z | 31 | 24 | 7 | 77.4% |
| EasyGym / Fitness4Less | easyGym 1 UK club; Fitness4Less 7 UK clubs (separate brands) | 8 | 5 | 3 | 62.5% |

Coverage % is READY / discovered in this staging file.

## Specific answers

1. **Anytime Fitness READY:** 110 of 185 discovered.
2. **Bannatyne READY:** 42 of 63 discovered.
3. **Fitness First READY:** 23 of 23 discovered.
4. **Everlast READY:** 32 of 61 discovered.
5. **JD Gyms READY:** 58 of 113 discovered.
6. **David Lloyd READY:** 109 of 113 discovered.
7. **Snap Fitness READY:** 56 of 109 discovered.
8. **Buzz Gym:** 6 open READY; 3 coming-soon staged inactive; total staged 11.
9. **The Gym Group page-gap:** 252 READY of 271 discovered (8 coming soon held out). All 20 East Anglia HTTP 500 club pages now have official addresses from indexed official/kiosk/origin snippets. 9 of those 20 also have trusted coordinates (READY); 11 remain NEEDS_COORDINATES because Nominatim could not confirm a building/street (no postcode-centroid fallback). Gyms listed in the official directory were not dropped solely because a club page returned 500.

## Geography (READY only)

- England: 1219
- Scotland: 98
- Wales: 41
- Northern Ireland: 15

Constituent country is derived from UK postcode outward code (staging-only).

## Quality

- Missing addresses: 14
- Missing postcodes: 16
- Missing cities: 0
- Missing coordinates: 297
- READY with official coordinates: 923
- READY with Nominatim coordinates: 450
- Soft-postcode matches flagged: 141
- Ambiguous geocodes: 34
- Nominatim lookups this finalize pass: 0
- No London / country / postcode / city-centroid fallbacks were used. Missing coordinate = not READY.
- Foreign excluded: Republic of Ireland, Channel Islands (JE/GY), Isle of Man (IM), US Anytime Fitness copy URL, David Lloyd non-GB, Fitness First Jersey.
- Coming-soon locations staged: 65

## Completeness

No targeted conventional chain from the Phase 2 list remains at zero READY, except where the estate itself is coming-soon-only.

Major conventional UK chains **not** bulk-staged (out of scope): council leisure (Better/GLL/Places Leisure), CrossFit boxes, boutique-only, class-only studios, martial arts, yoga/Pilates-only.
No additional national conventional gym chain of PureGym/The Gym Group scale was found completely missing from staging.

## Proposed production merge

**1373** READY_TO_IMPORT rows are recommended for the first UK production merge.

Expected live catalog: **2,952 + 1373 = 4325**.

Do not merge COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, or unresolved name-only rows.

## Scale

Current live catalog: 2,952. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.
4325 remains **comfortably inside** the current client-side architecture. No server directory migration is required for this UK merge.

## Duplicate / rebrand analysis

- Staging same-id / proximity collapses: 0
- Existing UK rows in live catalog: 0
- Live catalog total: 2952
- `gb_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0
- Same address, different brand vs live catalog: 0
- Everlast Gyms keep current brand `Everlast Gyms` with `legacy_brand = DW Sports Fitness`. No duplicate DW Sports rows.
- Fitness4Less and easyGym are separate operating brands; Women's Gym Total Fitness sites were not duplicated (same physical club).
- Gymbox Angel/Kensington alias pages were not staged separately from Old Street / Westfield London.

## Files

- `scripts/uk-phase2-enrich.py`
- `scripts/uk-phase2-finalize.py`
- `data/uk/uk_centers_staging.json`
- `data/uk/uk_geocode_review.json` / `.csv`
- `data/uk/uk_duplicate_analysis.json`
- `data/uk/UK_PHASE2_READINESS_REPORT.md`
- `data/uk/Gymly_UK_All_Discovered_Centers.xlsx` / `.csv`
- `data/uk/scrapes/*phase2*.json`

Not modified: `src/data/centers.json`, check-in radius, auto-checkout, workout logging, PR logic, feed, localization, global center architecture.

## Stop

UK Phase 2 stops here. Do not merge UK. Do not run UK QA. Do not start another country.
