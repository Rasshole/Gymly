# UK Phase 1 Readiness Report

Generated: 2026-08-17 17:41 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Overall

| Metric | Count |
|---|---:|
| Total UK locations discovered (after staging dedupe) | 1607 |
| VERIFIED_CURRENT | 1281 |
| Successfully geocoded / official coords present | 974 |
| READY_TO_IMPORT | 928 |
| NEEDS_COORDINATES | 341 |
| NEEDS_REVIEW | 279 |
| COMING_SOON | 59 |
| CLOSED | 0 |
| Staging duplicates / same-id collapses | 7 |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| PureGym | ~410 YE2024 corporate; listing had 494 gym URLs | 494 | 456 | 38 | 92% |
| The Gym Group | 264 open as of 30 Jun 2026 (company) | 272 | 243 | 29 | 89% |
| JD Gyms | 113 gym URLs on official sitemap / 'over 100' | 113 | 36 | 77 | 32% |
| David Lloyd | 149 UK+Europe on site; UK-only subset | 113 | 36 | 77 | 32% |
| Nuffield Health | ~110–111 fitness & wellbeing gyms | 111 | 98 | 13 | 88% |
| Anytime Fitness | ~180–189 UK clubs (franchise); Ireland excluded | 187 | 0 | 187 | 0% |
| Energie Fitness | ~60 UK+IE combined; UK-only subset | 48 | 26 | 22 | 54% |
| Bannatyne | ~68 health clubs | 64 | 0 | 64 | 0% |
| Fitness First | 24 UK clubs on official finder (Jersey excluded) | 24 | 0 | 24 | 0% |
| Snap Fitness | ~105 UK (100th club Aug 2025; Ireland mixed in some counts) | 109 | 33 | 76 | 30% |
| Everlast Gyms | ~60 UK+IE; official website timed out | 61 | 0 | 61 | 0% |
| Buzz Gym | 8 open + 3 coming soon on official site | 11 | 0 | 11 | 0% |

Coverage % is READY / discovered in this staging file, not vs the official estate size.

## Data quality

- Missing addresses: 277
- Missing postcodes: 283
- Missing cities: 2
- Missing coordinates: 633
- READY with official coordinates: 780
- READY with Nominatim coordinates: 148
- Soft-postcode matches flagged: 37
- Ambiguous geocode results: 31
- Nominatim lookups attempted this run: 489
- Foreign / non-UK exclusions: Republic of Ireland (Energie + Anytime slug filter), David Lloyd non-GB clubs, Fitness First Jersey, crown-dependency postcodes (GY/JE/IM).
- No London / country / postcode / city-centroid fallbacks were used.
- Some PureGym JSON-LD records omit `streetAddress` and only have a place/locality string; those still have official coordinates and were allowed READY.

## Geography (READY only)

- England: 816
- Scotland: 72
- Wales: 27
- Northern Ireland: 13

Constituent country is derived from UK postcode outward code (SY treated as England unless the city is a known Welsh SY town). This is staging-only and was not added to the production schema.

## Duplicate / rebrand analysis

- Staging same-id / same-brand-address / proximity collapses: 7
- Existing UK rows in live catalog: 0
- `gb_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0
- Same address, different brand vs live catalog: 0
- Everlast Gyms rows use legacy_brand `DW Sports Fitness` where applicable; current brand is Everlast Gyms.
- Fitness First Jersey was discovered on the official UK finder and excluded as a Channel Island location.

## Completeness

UK Phase 1 is **not complete** just because the discovered count is large.

- **Mostly READY from official pages + coordinates:** PureGym (JSON-LD geo; 38 coming-soon held out). The Gym Group (253 club pages parsed vs 264 company open; 20 East-Anglia sitemap URLs currently HTTP 500). Nuffield Health (gym sitemap after dropping marketing URLs).
- **Official lists are in hand, but mostly not READY:** Nominatim could not confirm a building/street, and postcode centroids were rejected. JD Gyms, David Lloyd (UK-filtered), Bannatyne, Fitness First UK, Snap Fitness, Buzz Gym, Energie UK. Most of these already have addresses; they need a later coordinate pass, not a re-scrape.
- **Materially incomplete:** Anytime Fitness (official en-gb sitemap URLs; Incapsula blocked club pages). Everlast Gyms (everlastgyms.com timed out; names only from the official membership selector). The Gym Group HTTP 500 club pages.

## Additional chains (Phase 2)

Meaningful conventional chains to consider next, not staged as READY here unless already fetched:

- **Everlast Gyms** — retry when the official site responds; ~60 UK+IE, filter Ireland.
- **Anytime Fitness** — retry club pages or an official unblocked locator payload; ~180 UK.
- **Village Gym / Village Hotels** — hotel-attached gyms with conventional floors.
- **Total Fitness** — regional multi-site operator.
- **Gymbox** — London conventional/hybrid clubs (~10).
- **Third Space** — premium clubs with full gym floors (small set).
- **EasyGym / Fitness4Less** — budget conventional if still operating at 5+ sites.
- **Virgin Active UK** — historically large; confirm current operating estate before scraping.

Do **not** Phase-2 dump: CrossFit boxes, boutique cycling, yoga studios, martial arts schools, or council leisure (Better / GLL / Places Leisure / Serco) without a separate product decision.

## Proposed first merge

**928** READY_TO_IMPORT rows are recommended for a later UK production merge.

Expected catalog after that merge: **2952 + 928 = 3880**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and name-only Everlast/Anytime rows must stay out.

## Scaling

Current live catalog: 2,952. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.
3880 remains **comfortably inside** the current client-side architecture. No server directory migration is required for this UK merge.

UK missing coordinates must remain NaN / not check-in eligible. No London fallback was introduced.

## Files

Created or updated under `data/uk/` and `scripts/`:

- `scripts/uk-phase1-discover.py`
- `scripts/uk-phase1-consolidate.py`
- `data/uk/uk_centers_staging.json`
- `data/uk/uk_centers_staging.pre_geocode.json`
- `data/uk/uk_geocode_review.json`
- `data/uk/uk_geocode_review.csv`
- `data/uk/uk_duplicate_analysis.json`
- `data/uk/uk_discovery_notes.json`
- `data/uk/UK_PHASE1_READINESS_REPORT.md`
- `data/uk/Gymly_UK_All_Discovered_Centers.xlsx`
- `data/uk/Gymly_UK_All_Discovered_Centers.csv`
- `data/uk/uk_geocode_cache.json`
- `data/uk/scrapes/*_uk.json`
- `data/uk/raw/` official HTML/sitemaps and cached club pages

Not modified: `src/data/centers.json`, check-in radius, auto-checkout, workout logging, PR logic, feed, localization, global center architecture.

## Stop

UK Phase 1 stops here. Do not merge UK. Do not run UK QA. Do not start another country.
