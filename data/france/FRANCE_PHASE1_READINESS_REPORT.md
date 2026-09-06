# France Phase 1 Readiness Report

Generated: 2026-08-19 11:18 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market Audit

### Brand Relationships

- **Basic-Fit**: Dutch-owned, ~911 owned clubs in France (year-end 2025: 894). Budget/24-7. Multi-country — FR only staged.
- **Fitness Park**: ~350+ France clubs (400+ with international). Premium accessible. Franchise model. Present in DROM-COM.
- **L'Orange Bleue**: ~400 clubs France + Spain/Portugal. 2nd largest French fitness network. Licence de marque since 2006.
- **Keepcool**: ~270 clubs. Acquired Neoness in July 2022 (now ICM Wellness group). Neoness retained as separate brand (~30 clubs, mostly Paris/IDF).
- **Neoness**: ~30 clubs, mostly Paris/IDF. Owned by ICM Wellness (Keepcool group). First franchise opened April 2026 in Nîmes.
- **ON AIR Fitness**: ~110+ clubs. Premium (sport/music/design). Growing rapidly — reached 100 clubs Feb 2026.
- **L'Appart Fitness**: ~111 clubs. Founded Lyon 2007. Target 150 clubs by 2028.
- **Anytime Fitness France**: 3 open (Villeurbanne, Nice, Colombes) + 4 coming soon + acquired 10 Interval Sport clubs (Aug 2026).
- **Cercles de la Forme / Circle Club**: ~30 clubs Paris + Châtillon, Clamart, Montpellier. Paris-focused premium.
- **Elancia**: ~53 clubs. Sport Santé label. Premium coaching. First Paris club Jan 2026.
- **Gigafit**: ~40 clubs. Premium, mostly IDF. V4 concept rollout.
- **Magic Form**: ~60 clubs. Budget-mid range. Mostly IDF.
- **Vita Liberté**: ~50 clubs. Franchise. PACA/Corsica focus + Guyane.
- **Wefit.club**: ~55 clubs. Franchise. Mostly western France + expanding.
- **Liberty Gym**: ~70 clubs. Budget franchise. Grand Est strong. Expanding internationally.

## Overall

| Metric | Count |
|---|---:|
| Total France locations discovered (after staging dedupe) | 1587 |
| READY_TO_IMPORT | 1196 |
| NEEDS_COORDINATES | 338 |
| NEEDS_REVIEW | 49 |
| COMING_SOON | 4 |
| DUPLICATE (staging) | 0 |
| Staging same-id collapses | 9 |

## Chain Coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Basic-Fit | ~911 France clubs (2026) | 897 | 897 | 0 | 100% |
| Fitness Park | ~350+ France clubs | 350 | 187 | 163 | 53% |
| L'Orange Bleue | ~400 France clubs | 217 | 0 | 217 | 0% |
| Keepcool | ~270 clubs (incl. Neoness ~30, Metabolik) | 0 | 0 | 0 | — |
| Neoness | ~30 clubs (owned by ICM Wellness / Keepcool group) | 0 | 0 | 0 | — |
| ON AIR Fitness | ~110+ France clubs | 1 | 0 | 1 | 0% |
| L'Appart Fitness | ~111 France clubs | 110 | 110 | 0 | 100% |
| Anytime Fitness | 3 open + 4 coming soon + 10 Interval Sport | 7 | 2 | 5 | 29% |
| Cercles de la Forme | ~30 Paris clubs | 1 | 0 | 1 | 0% |
| Elancia | ~53 France clubs | 1 | 0 | 1 | 0% |
| Gigafit | ~40 France clubs | 1 | 0 | 1 | 0% |
| Magic Form | ~60 France clubs | 1 | 0 | 1 | 0% |
| Vita Liberté | ~50 France clubs | 1 | 0 | 1 | 0% |
| Wefit.club | ~55 France clubs | 0 | 0 | 0 | — |
| Liberty Gym | ~70 France clubs | 0 | 0 | 0 | — |

## Major City Coverage (READY)

| City | Discovered | READY |
|---|---:|---:|
| Paris | 48 | 45 |
| Marseille | 33 | 26 |
| Lyon | 16 | 14 |
| Toulouse | 18 | 18 |
| Nice | 22 | 18 |
| Nantes | 7 | 7 |
| Montpellier | 7 | 7 |
| Strasbourg | 6 | 6 |
| Bordeaux | 14 | 12 |
| Lille | 16 | 16 |
| Rennes | 17 | 8 |
| Reims | 7 | 7 |
| Le Havre | 3 | 3 |
| Saint-Étienne | 11 | 11 |
| Toulon | 2 | 2 |
| Grenoble | 2 | 2 |
| Dijon | 8 | 8 |
| Angers | 4 | 4 |
| Nîmes | 7 | 6 |
| Clermont-Ferrand | 4 | 3 |

## Data Quality

- Missing addresses: 6
- Missing postal codes: 6
- Missing cities: 6
- Missing coordinates: 391
- READY with official coordinates: 1007
- READY with Nominatim coordinates: 189
- French postal codes stored as **strings** (5-digit, leading zeros preserved).
- French characters (é, è, ê, ë, à, â, ç, î, ï, ô, ù, û, œ, æ) preserved in all fields.
- No Paris/city/postal-code/France centroid fallbacks used.

## Geography

- All READY coordinates sit inside the France bounding box.
- Metropolitan France bbox: lat 41.3–51.1, lng -5.2–9.6
- Corsica: lat 41.4–43.0, lng 8.5–9.6
- Overseas (Guadeloupe, Martinique, Guyane, Réunion): validated separately
- Cross-border filtering: Basic-Fit BE/NL/DE/LU/ES excluded. Strict FR/France country filter.

## Duplicate / Rebrand Analysis

- Staging same-id collapses: 9
- Duplicate IDs remaining: 0
- Same-brand physical address duplicates: 0
- Existing France rows in live catalog: 0
- `fr_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0

## Completeness

Phase 1 covers the major national chains:
- **Complete**: Basic-Fit (905/911), Fitness Park (351/350+), L'Appart Fitness (110/111), Anytime Fitness (7)
- **Partial**: L'Orange Bleue (217/400 — HTML parsing, needs club page fetch)
- **Phase 2 needed**: Keepcool (~270), ON AIR (~110), Cercles de la Forme (~30), Elancia (~53), Gigafit (~40), Magic Form (~60), Vita Liberté (~50), Wefit.club (~55), Liberty Gym (~70), Neoness (~30)

**Phase 2 priorities:**
- Keepcool/Neoness (Woosmap API, browser-based extraction)
- ON AIR Fitness (individual club page fetch)
- Remaining mid-size chains via sitemaps/club pages
- Independent gyms in major cities

## Proposed SAFE Merge

**1196** READY_TO_IMPORT rows are recommended for a later France production merge.

Expected catalog after merge: **5455 + 1196 = 6651**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, and DUPLICATE rows must stay out.

## Scaling

Current live catalog: 5,455.
6,651 remains **comfortably inside** the current client-side architecture.

## Files

Created or updated under `data/france/` and `scripts/`:

- `scripts/france-phase1-discover.py`
- `scripts/france-phase1-fetch-clubs.py`
- `scripts/france-phase1-consolidate.py`
- `data/france/france_centers_staging.json`
- `data/france/france_geocode_review.json`
- `data/france/france_duplicate_analysis.json`
- `data/france/FRANCE_PHASE1_READINESS_REPORT.md`
- `data/france/Gymly_France_All_Discovered_Centers.xlsx`
- `data/france/france_geocode_cache.json`
- `data/france/france_discovery_combined.json`
- `data/france/raw/` — official HTML/JSON captures
- `data/france/scrapes/` — per-chain discovery JSON

**STOP. Do not merge France. Do not run France QA. Do not start another country.**
