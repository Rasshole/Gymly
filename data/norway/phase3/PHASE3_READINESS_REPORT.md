# Norway Phase 3 Readiness Report

**Status: NOT MERGED** — `src/data/centers.json` unchanged. Awaiting explicit merge approval.  
**Do not run final app QA yet.**

Generated: 2026-08-16T18:30:21.640134+00:00

---

## A. Existing 135 unresolved

| Metric | Count |
|--------|------:|
| Starting unresolved | 135 |
| Upgraded to READY_TO_IMPORT | **50** |
| Still unresolved | **84** |
| Closed | 0 |
| Duplicates/legacy removed | **1** (Feel24 Feelgood Harstad) |

Starting breakdown: NEEDS_COORDINATES 63 · NEEDS_REVIEW 33 · SOFT_POSTAL_WITHHELD 26 · SKIP_INCOMPLETE 13.

---

## B. Soft postal

| Metric | Count |
|--------|------:|
| Reviewed | 26 |
| Approved → READY | **26** |
| Rejected/held | **0** |

All 26 kept existing coordinates. Postal mismatches treated as OSM/boundary/shopping-center formatting — street + house number matched.

---

## C. Missing chains

| Chain | Discovered | Verified addr | Geocoded | READY | Unresolved |
|-------|----------:|--------------:|---------:|------:|-----------:|
| Sporty | 86 | 86 | 73 | **73** | 13 |
| Fitness24Seven | 9 | 9 | 9 | **9** | 0 |
| Impulse | 13 | 13 | 11 | **11** | 2 |

Notes:
- Sporty official ~103; we have 86 staged / 73 READY — coverage gap remains; accuracy over fill.
- Impulse sitemap = 13 current centers; Hommelvik + Melhus left unresolved (geocode road-name mismatch).
- F24 Norway ≈ 9; all 9 READY (mostly official Maps coords).

---

## D. Existing-chain gaps

| Chain | Additional locations found? |
|-------|----------------------------|
| SATS | No net new beyond soft-postal / unresolved recovery |
| EVO | No |
| Fresh Fitness | No |
| Feel24 | No (1 duplicate collapsed) |
| MUDO | No |
| 3T | No material gap beyond ≤1 count variance vs official 18 |
| MOVA | No |
| SKY | No (coming-soon Moss/Ski noted, not imported) |
| Spenst | No (Fredrikstad 2027 noted, not imported) |

---

## E. Additional relevant chains

| Chain | Approx | Include now? | Staged READY |
|-------|-------:|--------------|-------------:|
| **Fitnesspoint** | ~40 | **Yes** | **25** (15 unresolved) |
| Feelgood | ~78 | Later (different product concept) | 0 |
| NEXT | ~22 | No (Sporty Group acquisition — avoid double-count) | 0 |
| Puls / Sparta / TrenHer / etc. | 4–7 each | Optional later | 0 |

---

## F. Overall Norway status

| Metric | Count |
|--------|------:|
| Current live Norway | **367** |
| New READY_TO_IMPORT | **168** |
| Unresolved remaining | **114** |
| Closed/duplicate removed | **1** |
| **Expected Norway after Phase 3 merge** | **535** |

READY brand mix: {'SATS': 15, 'Fresh Fitness': 4, 'EVO Fitness': 16, 'MUDO Gym': 2, 'Feel24': 6, '3T-Treningssenter': 1, 'MOVA': 3, 'SKY Fitness': 3, 'Fitness24Seven': 9, 'Impulse Treningssenter': 11, 'Sporty': 73, 'Fitnesspoint': 25}

---

## G. Quality flags

1. **Soft-postal READY (26)** — `geocode_status=suspicious` due to postal mismatch; street/house/coords accepted.
2. **Fitness24Seven Haugenstua** — official address `Garver Ytteborgs vei 98` + official Maps pin; unusual house number but source-consistent.
3. **SATS Triaden + MUDO Lørenskog** — same address/coords; co-located brands kept separately.
4. **Ambiguous Nominatim candidates** — left as NEEDS_REVIEW / NEEDS_COORDINATES (no forced pin).
5. **Incomplete Feel24 rows** (Fløylia, Stormyra Panorama) — missing address; still NEEDS_REVIEW.
6. **Sporty coverage gap** — ~103 claimed vs 73 READY; do not invent remaining.
7. **Coming soon** — Spenst Fredrikstad 2027; SKY Moss/Ski autumn 2026 — documented, not check-in eligible.

---

## H. Files

**Updated staging:** `norway_centers_staging.json`, `phase2_new_centers_staging.json`, `phase3/phase3_new_centers_staging.json`

**Phase 3 artifacts:** see `data/norway/phase3/` (readiness report, soft decisions, Sporty/F24/Impulse/Fitnesspoint JSON, geocode logs, coming_soon notes)

**Untouched:** `src/data/centers.json`

---

## Next step

Await explicit approval to merge the **168** READY rows into `centers.json`. Remaining **114** stay out until higher-confidence addresses/coords exist.
