# UK Phase 2 — Final coordinate recovery

Generated: 2026-08-17 22:15 UTC

**DO NOT MERGE. `src/data/centers.json` was not modified.**

No new chains, no new gym locations, no broad scrape.

## Counts

| Metric | Count |
|---|---:|
| Starting READY_TO_IMPORT | 1373 |
| Starting NEEDS_COORDINATES | 266 |
| Starting NEEDS_REVIEW | 13 |
| Recovered from NEEDS_COORDINATES | 100 |
| Recovered from NEEDS_REVIEW | 1 |
| Final READY_TO_IMPORT | 1474 |
| Final NEEDS_COORDINATES | 166 |
| Final NEEDS_REVIEW | 5 |
| COMING_SOON | 71 |
| CLOSED | 1 |
| Unique staged | 1717 |

## Chain recovery

| Chain | Before READY | Recovered | Final READY | Remaining unresolved |
|---|---:|---:|---:|---:|
| Anytime Fitness | 110 | 27 | 137 | 44 |
| JD Gyms | 58 | 20 | 78 | 27 |
| Snap Fitness | 56 | 15 | 71 | 31 |
| Everlast Gyms | 32 | 12 | 44 | 17 |
| Bannatyne | 42 | 6 | 48 | 15 |
| énergie Fitness | 29 | 5 | 34 | 13 |
| The Gym Group | 252 | 4 | 256 | 7 |
| Total Fitness | 8 | 3 | 11 | 4 |
| Virgin Active | 24 | 2 | 26 | 5 |
| David Lloyd | 109 | 3 | 112 | 1 |
| Nuffield Health | 107 | 3 | 110 | 0 |
| Fitness4Less / easyGym | 5 | 1 | 6 | 2 |
| Buzz Gym | 6 | 0 | 6 | 2 |
| Gymbox | 8 | -1 | 7 | 3 |
| Third Space | 14 | 1 | 15 | 0 |

## Quality flags

- Suspicious coordinates (soft postcode, this-pass gym POIs): 14
- Ambiguous geocodes remaining: 10
- Postcode mismatches remaining: 24 (same outward code, different inward; wrong-town hits were demoted)
- Staging duplicate collapses kept: 0 (false 40 m collapses were restored)
- Same address, different current brand (not collapsed): Everlast York vs PureGym York; Nuffield Swindon vs The Gym Group Swindon
- Legacy rebrand: Everlast remains `Everlast Gyms` with `legacy_brand = DW Sports Fitness`; no DW Sports rows

Wrong-town Nominatim hits demoted: Anytime Basingstoke/Hagley Road/Hemel/EC4; Bannatyne Ashford/Belfast; JD Aintree/Halifax/Charlton/Sheffield North; Snap Blackwood/Retford/Wellington St Oakwood POI; TGG Norwich Sweet Briar; Fitness4Less New Malden; Third Space Hampshire Whiteley (replaced with official Queensway JSON-LD).

False proximity collapses restored: JD Liverpool Edge Lane, JD Oldbury, Gymbox Holborn, Snap Leeds Oakwood.

## Reclassifications (existing source only)

- Anytime Fitness London: NEEDS_REVIEW
- JD Gyms Aberdeen: COMING_SOON
- JD Gyms Basildon: COMING_SOON
- JD Gyms Dunfermline: COMING_SOON
- JD Gyms Newtownabbey: COMING_SOON
- JD Gyms Wakefield: COMING_SOON
- JD Gyms Watford: COMING_SOON
- Nuffield Health Barrow: CLOSED

## Intentionally left unresolved

- Anytime Fitness London — official test placeholder (Test 100 Lane / SW1A 1AA)
- Virgin Active Chiswick Riverside — Nominatim hits Chiswick Park; not the Riverside club
- Virgin Active Cannon Street (Walbrook) — no page cache; no new scrape
- Virgin Active Clearview/Brentwood — no page cache; no new scrape
- Energie Fitness Brentford — JSON-LD postcode truncated (TW8 0G); not invented
- Snap Fitness Bristol (Filton) — official JSON-LD postalCode empty
- Buzz Gym Oxford / Harrow — shopping-centre names only; no building-level OSM pin
- Gymbox Elephant & Castle / Finsbury Park — unit addresses remained ambiguous
- David Lloyd Northwood — official address did not resolve to a building pin
- Gymbox Holborn — restored after a false 30 m collapse with Victoria; no independent building pin kept
- Wrong-town Nominatim hits were demoted rather than imported

## Proposed SAFE merge

**Exact proposed SAFE merge count: 1474**

Expected final Gymly catalog size: 2,952 + 1474 = **4426**

Do not merge COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, or CLOSED.

## Stop

Coordinate recovery stops here. Do not merge. Do not run UK QA. Do not start another country.
