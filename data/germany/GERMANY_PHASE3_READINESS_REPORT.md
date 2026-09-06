# Germany Phase 3 Readiness Report

**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256=df0ceb6b4ed23585…`).
Awaiting explicit merge approval.

Generated: 2026-08-17T16:05:48.551232+00:00

---

## Overall

| Metric | Count |
|--------|------:|
| Germany Phase 2 total | **1287** |
| New Phase 3 locations discovered (net unique added) | **208** |
| Final unique Germany staging count | **1495** |
| READY_TO_IMPORT | **1424** |
| NEEDS_COORDINATES | 12 |
| NEEDS_REVIEW | 38 |
| COMING_SOON | 15 |
| CLOSED | 6 |
| Internal dedupe events | 4 |

Live catalog: DK/SE/NO unchanged. Germany live: **0**.

---

## New chains

| Chain | Official/current | Discovered | READY | Unresolved | Include recommendation |
|-------|----------------:|-----------:|------:|-----------:|------------------------|
| Kieser | 113 | 113 | 113 | 0 | INCLUDE — physical strength studios, independent member workouts |
| Pfitzenmeier | 8 | 8 | 8 | 0 | INCLUDE — 8 owned Premium Resorts/Clubs with normal gym floors |
| FitnessLOFT | 0 | 0 | 0 | 0 | DO NOT INCLUDE as own brand — rebranded to Fitness First (2023) |
| ELEMENTS | 7 | 7 | 7 | 0 | INCLUDE — 7 premium fitness+wellness clubs (Migros) |
| Basic-Fit | 56 | 56 | 56 | 0 | INCLUDE — own-brand DE clubs; keep distinct from clever fit |
| VeniceBeach | 28 | 26 | 15 | 11 | INCLUDE — regional conventional chain (Pfitzenmeier partner network) |
| wellyou | 41 | 0 | 0 | 0 | DO NOT STAGE this pass — locator unavailable; pending Basic-Fit rebrand |

### Kieser qualification
Kieser is specialized machine-based strength training, not a typical McFIT-style big-box gym. Members still perform independent resistance training in a physical studio and can meaningfully check in. **Included.**

### FitnessLOFT
`fitnessloft.de` redirects to Fitness First. LifeFit rebranded FitnessLOFT (and smile X / In Shape) to Fitness First from 1 Oct 2023. No FitnessLOFT brand rows staged.

### Pfitzenmeier concepts
Owned network = 8 locations (Premium Resorts with AquaDome + Premium Clubs including MediFit). The marketing claim of 46+ studios is partner-network access (VeniceBeach / FitBase / FitCamp), not 46 Pfitzenmeier-branded gyms.

---

## Existing unresolved

Starting Phase 2 leftover: **21** (16 NEEDS_COORDINATES + 5 NEEDS_REVIEW).

| Outcome | Count | Names / notes |
|---------|------:|---------------|
| Upgraded to READY | **5** | EASYFITNESS Cottbus, Hamburg-Rahlstedt, Hannover-Lahe, Rinteln; Fitness First Mönchengladbach Rheydt |
| Kept EMS-only out of READY | **1** | EASYFITNESS EMS Braunschweig |
| Listing hub (not a club) | **1** | Fitness First `{{ queryHeadline }}` (`/clubs` index) |
| Still NEEDS_COORDINATES | **10** | 8 EASYFITNESS + INJOY Schwandorf + Fitness First Paderborn Kernstadt |
| Still NEEDS_REVIEW (no reliable address on official page) | **4** | FF Berlin Hellersdorf, Lichterfelde, Prager Platz, München Moosach |

Did **not** force remaining rows into READY.

Additional quality correction (not part of the original 21): **24 EASYFITNESS EMS studios** are now NEEDS_REVIEW so they cannot enter the normal gym merge. Phase 2 had some of these as READY; Phase 3 treats EMS-only Easyfitness locations as out of scope.

Current staging leftover (includes new VeniceBeach gaps): 12 NEEDS_COORDINATES + 38 NEEDS_REVIEW. Details: `data/germany/phase3/unresolved_retry.json`.

---

## Final Germany brand breakdown (READY_TO_IMPORT)

| Brand | READY |
|-------|------:|
| Basic-Fit | 56 |
| EASYFITNESS | 169 |
| ELBGYM | 7 |
| ELEMENTS | 7 |
| FitX | 112 |
| Fitness First | 82 |
| Gold's Gym | 5 |
| INJOY | 69 |
| JOHN REED | 32 |
| Kieser | 113 |
| McFIT | 177 |
| PRIME TIME fitness | 22 |
| Pfitzenmeier | 8 |
| VeniceBeach | 15 |
| all inclusive Fitness | 172 |
| clever fit | 378 |
| **Total READY** | **1424** |

---

## Quality

| Issue | Count |
|-------|------:|
| Missing coordinates | 27 |
| Successfully geocoded / official coords | 1468 |
| Soft postal geocodes | 3 |
| Ambiguous geocodes | 10 |
| Same-address different-brand | 6 |
| ID collisions vs live | 0 |
| Border proximity ≤200 m vs non-DE live | 0 |
| CLOSED leaking into READY | 0 |

Foreign excluded earlier (Phase 2): Fitness First Austria, EASYFITNESS Dubai.
Rebrands: FitnessLOFT/smile X/In Shape → Fitness First; jumpers → all inclusive; ELBGYM kept as current brand where titled ELBGYM.

---

## Coverage assessment

Major conventional German gym groups now represented: RSG (McFIT/JOHN REED/Gold's), FitX, clever fit, all inclusive Fitness, LifeFit/Fitness First (+ ELBGYM), EASYFITNESS, INJOY, PRIME TIME, Kieser, Pfitzenmeier, ELEMENTS, Basic-Fit, VeniceBeach.

**Still completely missing as a staged brand:** **wellyou** (~41 Norddeutschland clubs; Basic-Fit acquisition closed 12 Aug 2026, rebrand pending).
**Basic-Fit own-brand** is now staged; clever fit remains a separate current operating brand.
EMS-only (Bodystreet, Körperformen) remain out of the normal catalog. EASYFITNESS EMS sub-studios are staged as NEEDS_REVIEW, not READY.

---

## Proposed production merge

**1424 READY_TO_IMPORT** centers recommended for Germany's first safe production merge.

Expected catalog: **1528 + 1424 = 2952**.

Do **not** merge in this phase.

---

## SCALE WARNING

Current production is 1528 centers in client-side `centers.json`. After the proposed Germany merge the file would hold **~2952** rows. That remains technically workable for search/map, but it is getting heavy. Monitor cold-start, map clustering, and search latency after merge. **Do not redesign the global center architecture in this phase.**

---

## FILES

- `scripts/germany-phase3-discover.py`
- `scripts/germany-phase3-consolidate.py`
- `data/germany/germany_centers_staging.json`
- `data/germany/GERMANY_PHASE3_READINESS_REPORT.md`
- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`
- `data/germany/Gymly_Germany_All_Discovered_Centers.csv`
- `data/germany/scrapes/kieser_germany.json`
- `data/germany/scrapes/pfitzenmeier_germany.json`
- `data/germany/scrapes/elements_germany.json`
- `data/germany/scrapes/basic_fit_germany.json`
- `data/germany/scrapes/venicebeach_germany.json`
- `data/germany/phase3/` (notes, retries, coming-soon review)

**Not modified:** `src/data/centers.json`

---

## STOP

No production merge. No Germany QA. No next country.
