# CROATIA PRODUCTION QA REPORT

Generated: 2026-08-25

## Verdict

**CROATIA STATUS: READY**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**  
Production modified during QA: **NO**

## Baseline

| Metric | Value |
|--------|------:|
| Total centers | 11,416 |
| Croatia | 80 |
| hr_* | 80 |
| Post-merge SHA256 | `19f288efaebbcb3e133ecfbc5ec52e1b36925d750649dd7f922f3c6f47b864c9` |

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

## Brand breakdown

| Brand | Count |
|-------|------:|
| Gyms4you | 48 |
| THE Fitness | 21 |
| Gibi Gib | 4 |
| Fitness Centar Joker | 4 |
| Multihealth | 3 |
| **Total** | **80** |

Unexpected Croatia brands: **0**

## Merge reconciliation

| Source | Count |
|--------|------:|
| Approved | 80 |
| Phase 2 READY | 80 |
| Production | 80 |
| Staging MERGED | 80 |

Missing IDs: **0**  
Unexpected IDs: **0**  
Metadata drift: **NONE**

## Staging exclusions

| Category | Count | Live |
|----------|------:|------|
| COMING_SOON | 8 | 0 |
| EXCLUDED | 23 | 0 |

Gyms4you coming-soon withheld: Split Visoka, Trstenik, Split 3, Jurišićeva, Spinut, Heinzelova x Vukovarska  
THE Fitness coming-soon withheld: Samobor STOP SHOP, Donje Svetice  

Note: live **Gyms4you Heinzelova** (`Heinzelova ulica 33`) is the open club and is distinct from coming-soon **Heinzelova x Vukovarska**.

OrlandoFit live: **0**  
Play Fitness live: **0**  
Hotel-only World Class live: **0**

## Priority brand QA

| Brand | Result |
|-------|--------|
| Gyms4you (48) | PASS — open estate; 8 OFFICIAL_MAP_PIN + 40 STRICT_ADDRESS_GEOCODE |
| THE Fitness (21) | PASS — Jelkovec verified; hotel clubs C_mixed_but_public |
| Gibi Gib (4) | PASS |
| Fitness Centar Joker (4) | PASS — Split / Mejaši / Omiš / Solin |
| Multihealth (3) | PASS — Samobor / Karlovac / Zagreb Rudeš |

## Rebrands / access

| Item | Result |
|------|--------|
| OrlandoFit → THE Fitness | PASS — successors only |
| Play Fitness → THE Fitness Črnomerec | PASS |
| Hotel Novi Zagreb | PASS — remains live (public/member) |
| Zonar | PASS — remains live (public/member) |

## Duplicate / proximity

| Metric | Count | Notes |
|--------|------:|-------|
| Duplicate IDs | 0 | |
| Same-brand ≤25 m | 0 | |
| Same-brand ≤50 m | 0 | |
| Same-brand ≤100 m | 0 | |
| Same-brand ≤200 m | 1 | Zavrtnica ↔ Branimir ~122 m — A_legitimate |
| Identical coordinates | 0 | |
| Different-brand ≤100 m | 1 | Dubec ↔ Dubrava ~49 m — A_legitimate |

## Border safety

Slovenia / Hungary / Serbia / Bosnia and Herzegovina / Montenegro contamination: **0**

## Search / flows

Brands, cities (incl. ASCII folding), postcodes, onboarding, profile, nearest, map viewport, 200 m check-in, auto-checkout, core ID resolution, orphan `hr_nonexistent_test`: **PASS**

Zero-chain cities Pula / Sisak / Čakovec remain empty — **A_legitimate_no_chain_presence**

## Country regression

DK 354 · SE 639 · NO 535 · DE 1424 · UK 1474 · FI 429 · NL 600 · FR 1712 · ES 976 · IT 588 · BE 363 · PL 621 · AT 335 · CH 475 · PT 247 · GR 106 · IE 65 · CZ 70 · HU 50 · RO 154 · SK 37 · BG 82 · **HR 80** · **Total 11,416**

## Performance

See `data/croatia/CROATIA_QA_PERF.json`.

Scale 11,416 / ~3.38 MB vs Bulgaria QA 11,336 / ~3.36 MB — healthy; no material regression.  
Global Stress QA required: **NO**  
Country expansion: **UNLOCKED**  
Architecture: **KEEP CLIENT-SIDE**

## Tests

Suites: `croatiaGymQa`, `croatiaMergeSafety`, `croatiaPhase2Staging`, `croatiaPhase1Staging`, `bulgariaGymQa`, `slovakiaGymQa`, `romaniaGymQa`, merge-safety companions  

Passed: **196**  
Failed: **0**

## Bugs found

None.

## Bugs fixed

None.

## Remaining risks (non-blocking)

- Many Gyms4you coordinates remain STRICT_ADDRESS_GEOCODE where official map pins are not exposed.
- Eight coming-soon clubs withheld by design until official open evidence appears.
- Pula / Sisak / Čakovec have no multi-location chain presence in the approved estate.
