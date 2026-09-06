# Belgium Phase 1 Readiness Report

Generated: 2026-08-21 12:45 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market audit

| Chain | Estimate | Decision | Source / notes |
|---|---|---|---|
| Basic-Fit | ~243 BE clubs (official club-finder '243 gyms found') | **INCLUDE** | https://www.basic-fit.com/en-be/club-finder — CRITICAL — en-be locale only; reject NL/FR/LU/ES/DE locales |
| JIMS | ~84 BE clubs (jims.be); ~6 LU on jims.lu — excluded | **INCLUDE** | https://www.jims.be/nl/clubs + Colruyt Group (84 BE + 6 LU, 31 Mar 2026) — CRITICAL — LU bleed watch; NRG Fitness BE acquired by JIMS end-2024 |
| Anytime Fitness | ~10 BE clubs on anytimefitness.be club_db (NL host bleed rejected) | **INCLUDE** | https://www.anytimefitness.be/club_db-sitemap.xml — Filter .be host; 4-digit BE postcodes only |
| LAGO Club | ~8 boutique fitness clubs (distinct from LAGO swim parks) | **INCLUDE** | https://www.lagoclub.be/nl/clubs — Fitness floors only via lagoclub.be — not pool-only lago.be complexes |
| Sportoase | ~20 centres; ~13 advertise Fitness on homepage filter | **INCLUDE (fitness-advertised only) / NEEDS_REVIEW** | https://sportoase.be/ — PPS sports complexes — include only where Fitness is advertised (genuine gym floor). Pool-only / swim / wellness-only excluded. |
| Stadium / Stadium Fitness | 1–2 Brussels (Schaerbeek/Molenbeek) independents | **LATER** | market research — Below multi-location 5+ regional threshold; revisit Phase 2 |
| NRG Fitness | 0 remaining BE brand (40+ clubs sold to JIMS end-2024) | **EXCLUDE** | https://pegroup.be/portfolio/nrg-fitness/ — Legacy brand — locations operate as JIMS; NL Premium remains separate |
| Fit-Out | 2 clubs (Destelbergen, Lochristi) | **INCLUDE** | https://fit-out.be/ — Commercial strength/cardio gyms with official addresses |
| i-fitness | 8 clubs | **INCLUDE** | https://i-fitness.be/ / https://www.i-fitness.be/ — Flanders + Brussels (Ukkel, Sint-Gillis, Berchem, etc.) |
| Aspria | 3 Brussels clubs | **INCLUDE** | https://www.aspria.com/en/brussels — Premium clubs with large gym floors (not hotel/class-only) |
| David Lloyd | 2 Brussels-area clubs (Uccle, Sterrebeek) | **INCLUDE** | https://www.davidlloyd.be/ — Conventional gym floor + pools; BE only |
| Mix Brussels | unclear / boutique | **LATER** | market research — No reliable multi-location official locator found in Phase 1 |
| World Class | 1 Brussels (Ixelles) | **LATER** | https://worldclassfitness.be/ — Single location — below regional multi-location threshold |
| HealthCity | 0 (legacy; healthcity.be unreachable) | **EXCLUDE** | DNS / site down 2026-08-21 — Legacy brand; do not invent successor mapping without official source |
| Snap Fitness | ≥1 BE (Ingelmunster); Benelux expanding | **INCLUDE** | https://www.snapfitness.com/be/locaties — Official BE locaties; reject NL franchise news pages |
| Release (Antwerp) | 3–4 Antwerp boutique | **LATER** | https://release.be/ — <5 multi-location threshold; one site yoga/pilates-focused |
| Club Sterker | 3–4 Kempen PT/private gyms | **EXCLUDE** | https://clubsterker.be/ — Personal-training / private gym model — out of include scope |

Regional coverage note: Flanders / Wallonia / Brussels-Capital all covered via Basic-Fit + JIMS. German-speaking community covered via LAGO Eupen swim complex (pool) — fitness via national chains (Basic-Fit/JIMS) where present.

## Overall

| Metric | Count |
|---|---:|
| Total Belgium locations discovered (after staging dedupe) | 372 |
| READY_TO_IMPORT (ready gate) | 363 |
| NEEDS_COORDINATES | 3 |
| NEEDS_REVIEW | 5 |
| COMING_SOON | 0 |
| CLOSED | 0 |
| DUPLICATE (staging) | 1 |
| Staging same-id collapses | 2 |
| Live catalog total | 8693 |
| Existing Belgium in live catalog | 0 |
| Headroom to 10k | 1307 |

## Region mix (non-duplicate)

- Brussels-Capital: 58
- Flanders: 227
- Wallonia: 85
- unknown: 1

## Chain coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Basic-Fit | ~243 BE clubs (official club-finder) | 241 | 236 | 5 | 98% |
| JIMS | ~84 BE clubs (jims.be; LU excluded) | 84 | 84 | 0 | 100% |
| Anytime Fitness | ~10 BE clubs (.be host) | 10 | 9 | 1 | 90% |
| LAGO Club | ~8 boutique fitness clubs | 8 | 8 | 0 | 100% |
| Sportoase | ~13 fitness-advertised (of ~20 centres) | 13 | 11 | 2 | 85% |
| i-fitness | ~8 clubs | 8 | 8 | 0 | 100% |
| Aspria | 3 Brussels premium clubs | 3 | 2 | 1 | 67% |
| David Lloyd | 2 Brussels-area clubs | 2 | 2 | 0 | 100% |
| Fit-Out | 2 clubs (Destelbergen, Lochristi) | 2 | 2 | 0 | 100% |
| Snap Fitness | ≥1 BE (Ingelmunster) | 1 | 1 | 0 | 100% |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Brussels | 13 | 11 |
| Antwerpen | 11 | 10 |
| Gent | 13 | 13 |
| Liège | 6 | 6 |
| Brugge | 5 | 5 |
| Namur | 3 | 3 |
| Leuven | 5 | 5 |
| Charleroi | 2 | 2 |
| Mons | 5 | 5 |
| Hasselt | 4 | 4 |
| Mechelen | 4 | 4 |
| Kortrijk | 4 | 4 |
| Oostende | 3 | 3 |
| Genk | 4 | 4 |
| Aalst | 2 | 2 |
| Sint-Niklaas | 3 | 3 |
| Tournai | 1 | 1 |
| Wavre | 1 | 1 |

## Data quality

- Missing addresses: 1
- Missing/invalid 4-digit postal codes: 1
- Non-4-digit postal values: 0
- Missing cities: 0
- Missing coordinates: 8
- Belgian postcodes stored as **4-digit strings** (`^\d{4}$`).
- Dutch/French/German city names preserved; Brussel/Bruxelles/Brussels deduped as one physical gym.
- No Brussels / Belgium / postal / city centroid fallbacks used.
- Cross-border: NL/FR/DE/LU rejected via countrycodes=be + bbox + country_code checks.

## Duplicate / rebrand analysis

- Staging same-id collapses: 2
- Duplicate IDs remaining: 0
- Same-brand address duplicates: 0
- Same-brand proximity ≤80 m: 3
- Multilingual city pairs: 0
- Existing Belgium in live catalog: 0
- `be_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Basic-Fit ≤200 m vs live foreign Basic-Fit: 0
- NRG Fitness BE → JIMS (legacy): brand EXCLUDE; clubs captured under JIMS where listed.

## Completeness

**Strong Phase 1 coverage:** Basic-Fit (official en-be locator + club pages), JIMS (embedded markers).

**Partial / Phase 2 follow-ups:**
- Sportoase: confirm gym-floor vs pool-adjacent per centre; fill missing addresses
- Anytime Fitness: expand if more BE franchises open; keep rejecting NL host bleed
- Snap Fitness: only Ingelmunster confirmed; watch new BE openings
- Regional independents (Release, Stadium, World Class): LATER
- LAGO swim parks (non-Club): EXCLUDE pool-only

## Proposed SAFE merge

**363** READY_TO_IMPORT rows passing ready gate.

Expected catalog after merge: **8,693 + 363 = 9,056**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.

## 10K Checkpoint

No — projected total 9,056 remains ≤ 10,000 (headroom used: 363 of 1307).

## Files

- `scripts/belgium-phase1-discover.py`
- `scripts/belgium-phase1-consolidate.py`
- `data/belgium/belgium_centers_staging.json`
- `data/belgium/belgium_geocode_review.json`
- `data/belgium/belgium_duplicate_analysis.json`
- `data/belgium/BELGIUM_PHASE1_READINESS_REPORT.md`
- `data/belgium/BELGIUM_PHASE1_READINESS_REPORT.json`
- `data/belgium/BELGIUM_PHASE1_READY_TO_IMPORT.json`
- `data/belgium/Gymly_Belgium_All_Discovered_Centers.xlsx`
- `data/belgium/belgium_geocode_cache.json`
- `data/belgium/belgium_market_audit.json`
- `data/belgium/raw/` official HTML/JSON captures
- `data/belgium/scrapes/` per-chain discovery JSON

## Verdict

Phase 1 staging is merge-ready for READY_TO_IMPORT rows only.
Still recommended: spot-check Sportoase + border Basic-Fit before merge.

**STOP. Do not merge Belgium. Do not run Belgium QA. Do not start Poland.**
