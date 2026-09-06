# Germany Phase 2 Readiness Report

**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256=df0ceb6b4ed23585…`).
Awaiting explicit merge approval.

Generated: 2026-08-16T21:43:04.210867+00:00

---

## Overall

| Metric | Count |
|--------|------:|
| Phase 1 discovered | **1159** |
| Phase 1 READY | 1097 |
| Phase 2 total unique Germany locations | **1287** |
| Net change vs Phase 1 | **+128** |
| Successfully geocoded / official coords | 1266 |
| READY_TO_IMPORT | **1245** |
| NEEDS_COORDINATES | 16 |
| NEEDS_REVIEW | 5 |
| COMING_SOON | 15 |
| CLOSED | 6 |

Live catalog untouched (DK/SE/NO). Existing Germany in live catalog: **0**.

---

## Chain coverage

| Chain | Official/current est. | Discovered | READY | Unresolved | Coverage % | Status |
|-------|---------------------:|-----------:|------:|-----------:|-----------:|--------|
| clever fit | 400 | 382 | 378 | 0 | 95.5 | COMPLETE_OR_NEAR |
| McFIT | 200 | 181 | 177 | 0 | 90.5 | COMPLETE_OR_NEAR |
| FitX | 112 | 112 | 112 | 0 | 100.0 | COMPLETE_OR_NEAR |
| EASYFITNESS | 205 | 201 | 188 | 13 | 98.0 | COMPLETE_OR_NEAR |
| Fitness First | 90 | 90 | 83 | 7 | 100.0 | COMPLETE_OR_NEAR |
| JOHN REED | 40 | 34 | 32 | 0 | 85.0 | DISCOVERY_INCOMPLETE |
| Gold's Gym | 5 | 5 | 5 | 0 | 100.0 | COMPLETE_OR_NEAR |
| all inclusive Fitness | 183 | 183 | 172 | 0 | 100.0 | COMPLETE_OR_NEAR |
| INJOY | 70 | 70 | 69 | 1 | 100.0 | COMPLETE_OR_NEAR |
| ELBGYM | 7 | 7 | 7 | 0 | 100.0 | COMPLETE_OR_NEAR |
| PRIME TIME fitness | 25 | 22 | 22 | 0 | 88.0 | DISCOVERY_INCOMPLETE |
| jumpers fitness | 0 | 0 | 0 | 0 | 0 | ABSORBED_INTO_ALL_INCLUSIVE |

### Brand counts: `{'McFIT': 181, 'JOHN REED': 34, 'all inclusive Fitness': 183, 'PRIME TIME fitness': 22, 'EASYFITNESS': 201, 'clever fit': 382, 'FitX': 112, 'INJOY': 70, "Gold's Gym": 5, 'Fitness First': 90, 'ELBGYM': 7}`

---

## Specific answers

1. **Final FitX count:** **112** discovered / **112** READY (official studios sitemap). Gap closed (was 43).
2. **Final INJOY count:** **70** discovered (sitemap `/studio/*`, teststudio excluded); majority geocoded READY.
3. **Final ELBGYM count:** **7** current clubs explicitly branded ELBGYM inside Fitness First / LifeFit (5 Hamburg + 2 München). `elbgym.de` redirects to Fitness First. Berlin Steglitz SSC (ELBGYM) URL returns **404** — not staged.
4. **Final Gold's Gym count:** **5** DE via RSG Magicline (Herne, Jena, Krefeld, München, Berlin). Prior ~8 included AT/IT — Germany is complete at 5.
5. **Fitness First 107 validity:** **No — 107 was not all physical DE gyms.** Official `/clubs` listing mixed ~29 city hub pages + foreign AT clubs + single clubs. Phase 2 rescan: **90** German Fitness First singles after removing hubs, Austria (Vösendorf + Wien*), and moving 7 ELBGYM-branded clubs out. Retain **90**, not 107.
6. **jumpers → all inclusive:** `jumpers-fitness.de` → `ai-fitness.de`. No jumpers fitness rows staged. `jumpers.de` is an unrelated youth/social NGO.
7. **Major conventional chains still missing (not staged):** Kieser Training, Pfitzenmeier, FitnessLOFT (SSL issues), ELEMENTS (probe inconclusive). **EMS-only (not catalog):** Bodystreet, Körperformen.

---

## Quality

| Issue | Count |
|-------|------:|
| Missing coordinates | 21 |
| Soft postal geocodes | 3 |
| Ambiguous geocodes | 12 |
| Same-address different-brand | 5 |
| ID collisions vs live | 0 |
| Border proximity ≤200 m vs non-DE live | 0 |

Removed in Phase 2 validation: city-aggregator FF pages, Fitness First Austria, EASYFITNESS Dubai.

---

## Proposed first production merge

**1245 READY_TO_IMPORT** rows with finite DE coordinates.

Expected catalog if approved: **1528 + 1245 = 2773**.

Do **not** merge in this phase.

---

## Scale

Current production: **1528**. After proposed Germany merge: **~2773**.
No architecture redesign in this phase.

---

## Files

- `data/germany/germany_centers_staging.json`
- `data/germany/GERMANY_PHASE2_READINESS_REPORT.md`
- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`
- `data/germany/phase2/` (audits, FF rescan, ELBGYM rebrand, additional chains)
- `scripts/germany-phase2-discover.py`
- `scripts/germany-phase2-consolidate.py`

**Not modified:** `src/data/centers.json`

---

## STOP

No production merge performed. Waiting for explicit approval.
