# Germany Phase 1 Readiness Report

**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256=df0ceb6b4ed23585…`).  
Awaiting explicit merge approval.

Generated: 2026-08-16T21:13:32.241353+00:00

---

## Overall

| Metric | Count |
|--------|------:|
| Total German locations discovered | **1159** |
| Verified current (status) | 1138 |
| Successfully geocoded / official coords | 1118 |
| READY_TO_IMPORT | **1097** |
| NEEDS_COORDINATES | 37 |
| NEEDS_REVIEW | 4 |
| COMING_SOON | 15 |
| CLOSED | 6 |
| Internal duplicate collapses | 1 |

Live catalog untouched: DK/SE/NO unchanged. Existing Germany in live catalog: **0**.

---

## By chain

| Chain | Official/est. | Discovered | Verified | Geocoded | READY | Unresolved | Status |
|-------|-------------:|-----------:|---------:|---------:|------:|-----------:|--------|
| clever fit | 400 | 382 | 378 | 382 | 378 | 0 | COMPLETE_OR_NEAR |
| McFIT | 200 | 181 | 177 | 181 | 177 | 0 | COMPLETE_OR_NEAR |
| FitX | 105 | 43 | 43 | 43 | 43 | 0 | DISCOVERY_INCOMPLETE |
| EASYFITNESS | 205 | 202 | 202 | 188 | 188 | 14 | COMPLETE_OR_NEAR |
| Fitness First | 100 | 107 | 107 | 80 | 80 | 27 | COMPLETE_OR_NEAR |
| JOHN REED | 40 | 34 | 32 | 34 | 32 | 0 | COMPLETE_OR_NEAR |
| Gold's Gym | 8 | 5 | 5 | 5 | 5 | 0 | DISCOVERY_INCOMPLETE |
| all inclusive Fitness | 170 | 183 | 172 | 183 | 172 | 0 | COMPLETE_OR_NEAR |
| jumpers fitness | 0 | 0 | 0 | 0 | 0 | 0 | ABSORBED_OR_UNAVAILABLE |
| INJOY | 100 | 0 | 0 | 0 | 0 | 0 | DISCOVERY_INCOMPLETE |
| ELBGYM | 10 | 0 | 0 | 0 | 0 | 0 | DISCOVERY_INCOMPLETE |
| PRIME TIME fitness | 25 | 22 | 22 | 22 | 22 | 0 | COMPLETE_OR_NEAR |


### Brand counts in staging
{'McFIT': 181, 'JOHN REED': 34, "Gold's Gym": 5, 'FitX': 43, 'all inclusive Fitness': 183, 'PRIME TIME fitness': 22, 'EASYFITNESS': 202, 'clever fit': 382, 'Fitness First': 107}

---

## Data quality

| Issue | Count |
|-------|------:|
| Missing address | 4 |
| Missing postal | 0 |
| Missing city | 0 |
| Missing coordinates | 41 |
| Soft-postal geocodes | 2 |
| Ambiguous geocode | 16 |

---

## Duplicate analysis

- ID collisions vs live catalog: **0**
- Same brand+address vs live: **0**
- Same-brand proximity ≤50 m vs live: **0**
- Internal staging dedupe events: 1

McFIT / JOHN REED / Gold's Gym kept as **separate brands** (RSG group).

jumpers fitness: official domain redirects to **all inclusive Fitness** — not separately staged.

---

## Coverage notes

- **clever fit**: major franchise (~400 DE). Sitemap-based discovery used when scrape completed.
- **McFIT / JOHN REED / Gold's Gym**: RSG Magicline official API (DE-filtered).
- **FitX**: partial (HTML/sitemap); official ~105 → treat as DISCOVERY_INCOMPLETE if below ~90.
- **EASYFITNESS**: embedded studio directory (~203) + Nominatim geocode.
- **Fitness First**: club pages; may be incomplete vs full LifeFit portfolio.
- **INJOY / ELBGYM**: limited/no reliable extract this phase → DISCOVERY_INCOMPLETE.
- **PRIME TIME**: DE site only (CH excluded).

Do **not** call Germany complete.

---

## Proposed first safe merge

Recommend merging only:

**1097 READY_TO_IMPORT** rows with finite DE coordinates.

Expected catalog if approved: **1528 + 1097 ≈ 2625** centers.

Scale check: client-side `centers.json` at ~2625 rows remains technically workable but is getting heavy; monitor search/map performance after merge. No server migration in this phase.

---

## Files

- `data/germany/germany_centers_staging.json`
- `data/germany/germany_geocode_review.json`
- `data/germany/germany_geocode_review.csv`
- `data/germany/germany_duplicate_analysis.json`
- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`
- `data/germany/Gymly_Germany_All_Discovered_Centers.csv`
- `data/germany/GERMANY_PHASE1_READINESS_REPORT.md`
- `data/germany/raw/` (HTML/API captures)
- `data/germany/scrapes/` (per-chain JSON)
- `scripts/germany-phase1-discover.py`
- `scripts/germany-discover-clever-fit.py`
- `scripts/germany-phase1-consolidate.py`

**Not modified:** `src/data/centers.json`

---

## STOP

No production merge performed. Waiting for explicit approval.
