# Italy Phase 1 Readiness Report

Generated: 2026-08-21 08:39 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market Audit

### Brand relationships

- **FitActive**: Largest Italian-owned group (~172–188 IT). 24/7 budget franchise. Official Club/Club JSON includes lat/lng + CAP.
- **McFIT / JOHN REED / Gold's Gym**: RSG Group. Magicline API lists ~48 IT studios (mostly McFIT). Expansion toward ~100 claimed.
- **Virgin Active**: Premium leader (~42 IT). Official club finder exposes address + CAP + coords.
- **FitUP**: Fast-growing 24/7 chain (~80+ on site; target 150 YE2026). WordPress club CPT; addresses on Elementor pages.
- **Fit Express**: ~70 24/7 clubs. WP club CPT; addresses on club-hero.
- **Anytime Fitness**: ~60–66 IT; target 100 by 2027. Webflow JS locator → Phase 2.
- **Orange / Gym Nation (Vam)**: ~23–33 clubs after GetFIT acquisition (Jul 2026). Livewire locator hostile → Phase 2.
- **GetFIT**: 6/8 clubs sold to Orange; 2 retained by founders. Treat as Orange rebrand / legacy.
- **WebFit**: Regional innovative clubs; official map markers with coords (CAP often missing).
- **20Hours**: Small Milan-area chain (~7).
- **Fitness Park**: First Italy club RomaEst opened Jul 2026.
- **Basic-Fit**: No material Italy club list on it-it club-finder (empty / wrong-locale bleed).
- **Fit And Go**: EMS/Vacufit — **EXCLUDE**.
- **Brooklyn Fitboxing / Orangetheory**: Boutique class formats — **EXCLUDE**.

### Qualification decisions

| Chain | Decision | Reason | Source accessibility |
|---|---|---|---|
| FitActive | INCLUDE | Conventional 24/7 strength/cardio | Easy — embedded JSON |
| McFIT | INCLUDE | Budget conventional | Easy — Magicline API |
| JOHN REED | INCLUDE | Conventional (RSG) | Easy — Magicline |
| Gold's Gym | INCLUDE | Conventional (RSG IT) | Easy — Magicline |
| Virgin Active | INCLUDE | Premium conventional | Easy — HTML data attrs |
| FitUP | INCLUDE | 24/7 conventional | Medium — WP + page scrape |
| Fit Express | INCLUDE | 24/7 conventional | Medium — WP + page scrape |
| WebFit | INCLUDE | Conventional multi-location | Easy — map markers |
| 20Hours | INCLUDE | Conventional | Medium — club pages |
| Fitness Park | INCLUDE | Premium-accessible | Easy — club page |
| Orange | INCLUDE | Conventional; incomplete Phase 1 | Hostile — Livewire |
| Anytime Fitness | LATER | Conventional; JS locator | Hostile — Phase 2 |
| GetFIT | LATER | Acquired/rebranding to Orange | Partial |
| Basic-Fit | EXCLUDE (IT) | No Italy clubs found | N/A |
| Fit And Go | EXCLUDE | EMS boutique | N/A |
| Tonic / Audace / Hard Candy | LATER/NEEDS_REVIEW | Presence/format unclear | Weak websites |

## Overall

| Metric | Count |
|---|---:|
| Total Italy locations discovered (after staging dedupe) | 465 |
| READY_TO_IMPORT | 338 |
| NEEDS_COORDINATES | 11 |
| NEEDS_REVIEW | 114 |
| COMING_SOON | 2 |
| CLOSED | 0 |
| DUPLICATE (staging) | 0 |
| Staging same-id collapses | 16 |

## READY by brand

| Brand | READY |
|---|---:|
| FitActive | 191 |
| Fit Express | 45 |
| McFIT | 42 |
| Virgin Active | 42 |
| FitUP | 12 |
| WebFit | 3 |
| Gold's Gym | 2 |
| JOHN REED | 1 |

## Chain Coverage

| Chain | Official estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| FitActive | ~172–188 clubs Italy (largest Italian group; FR/ES/BR excluded) | 193 | 191 | 2 | 99% |
| McFIT | ~42–46 clubs (RSG Group; Magicline) | 43 | 42 | 1 | 98% |
| JOHN REED | ~0–2 Italy (RSG) | 2 | 1 | 1 | 50% |
| Gold's Gym | ~2 Italy (RSG) | 2 | 2 | 0 | 100% |
| Virgin Active | ~42 premium clubs | 42 | 42 | 0 | 100% |
| FitUP | ~120–150 target YE2026; ~80+ listed on site | 83 | 12 | 71 | 14% |
| Fit Express | ~70 clubs (24/7 franchise) | 69 | 45 | 24 | 65% |
| Anytime Fitness | ~60–66 clubs (JS locator — Phase 2) | 0 | 0 | 0 | — |
| Orange | ~23–33 clubs (incl. GetFIT acquisition; Livewire hostile — Phase 2) | 7 | 0 | 7 | 0% |
| WebFit | ~16 clubs (official map) | 16 | 3 | 13 | 19% |
| 20Hours | ~7 Milan-area clubs | 7 | 0 | 7 | 0% |
| Fitness Park | 1 open (RomaEst, Jul 2026) | 1 | 0 | 1 | 0% |
| Basic-Fit | 0 Italy clubs (locale club-finder empty / NL bleed) | 0 | 0 | 0 | — |
| GetFIT | 6 of 8 acquired by Orange Jul 2026 — brand retiring | 0 | 0 | 0 | — |
| Fit And Go | EXCLUDE — EMS / Vacufit boutique | 0 | 0 | 0 | — |

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Roma | 29 | 26 |
| Milano | 25 | 20 |
| Torino | 15 | 13 |
| Napoli | 7 | 7 |
| Palermo | 3 | 2 |
| Genova | 5 | 5 |
| Bologna | 4 | 3 |
| Firenze | 7 | 7 |
| Bari | 3 | 3 |
| Catania | 4 | 4 |
| Venezia | 3 | 3 |
| Verona | 4 | 4 |
| Padova | 6 | 4 |
| Trieste | 5 | 2 |
| Brescia | 6 | 5 |
| Parma | 4 | 3 |
| Modena | 2 | 2 |
| Cagliari | 4 | 2 |
| Messina | 1 | 1 |
| Reggio Emilia | 4 | 4 |

## Geography (READY)

| Band | READY |
|---|---:|
| North | 232 |
| Central | 69 |
| South | 19 |
| Sicily | 14 |
| Sardinia | 4 |
| Unknown | 0 |

## Data quality

- Missing addresses: 15
- Missing postal codes (CAP): 100
- Missing cities: 10
- Missing coordinates: 39
- Italian CAP preserved as 5-digit strings (leading zeros intact).
- Italian text preserved (à, è, é, ì, ò, ù, apostrophes).
- No city/CAP/country centroid fallbacks used.
- San Marino / Vatican / FR / CH / AT / SI / HR / MT geocodes rejected.

## Duplicate / rebrand analysis

- Staging same-id collapses: 16
- Duplicate IDs remaining: 0
- Same-brand address duplicates: 0
- Same-brand proximity ≤80 m: 0
- Existing Italy in live catalog: 0
- `it_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live: 0

## Completeness

**Strong Phase 1 coverage:** FitActive (official JSON), McFIT/RSG (Magicline), Virgin Active (locator attrs).

**Partial:** FitUP, Fit Express, WebFit, 20Hours, Fitness Park.

**Phase 2 priorities:**
- Anytime Fitness Italy (~60–66) — Webflow/JS locator
- Orange / Gym Nation / GetFIT rebrands (~23–33) — Livewire CSRF-protected club data
- FitUP remaining address/coord gaps + growth toward 150
- Fit Express CAP/address cleanup + geocode
- WebFit missing CAP enrichment
- Regional independents (Lombardia, Lazio, Piemonte, Veneto, Emilia-Romagna, Toscana, Campania, Sicilia, Puglia, Liguria, Sardegna)
- Tonic, Audace, Hard Candy Fitness verification (presence unclear / boutique risk)

## Proposed SAFE merge

**338** READY_TO_IMPORT rows from Phase 1.

Expected catalog after merge: **8,143 + 338 = 8,481**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.

## 10K Checkpoint

No — projected total 8,481 remains under 10,000 (headroom 1,519).

## Files

- `scripts/italy-phase1-discover.py`
- `scripts/italy-phase1-consolidate.py`
- `data/italy/italy_centers_staging.json`
- `data/italy/italy_geocode_review.json`
- `data/italy/italy_duplicate_analysis.json`
- `data/italy/ITALY_PHASE1_READINESS_REPORT.md`
- `data/italy/ITALY_PHASE1_READINESS_REPORT.json`
- `data/italy/ITALY_PHASE1_READY_TO_IMPORT.json`
- `data/italy/Gymly_Italy_All_Discovered_Centers.xlsx`
- `data/italy/italy_geocode_cache.json`
- `data/italy/italy_discovery_combined.json`
- `data/italy/raw/` official HTML/JSON captures
- `data/italy/scrapes/` per-chain discovery JSON

**STOP. Do not merge Italy. Do not run Italy QA. Do not start another country.**
