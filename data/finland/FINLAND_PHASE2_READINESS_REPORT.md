# Finland Phase 2 Readiness Report

Generated: 2026-08-18 19:48 UTC

**Status: PHASE 2 STAGING COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.
Phase 1 was not restarted. Final Phase 1 staging was the source of truth.
The aborted Fressi navigation-label job was ignored.
EasyFit was not reverted to the intermediate 27/30 sanitizer.
LadyLine / PTVGYM / Ole.Fit / GYM Anytime Phase 1 official-page repairs were preserved.

## 1. Current staging audit (final Phase 1, before Phase 2 writes)

| Chain | Discovered | READY | NEEDS_COORDINATES | NEEDS_REVIEW | COMING_SOON | CLOSED |
|---|---:|---:|---:|---:|---:|---:|
| ELIXIA | 32 | 32 | 0 | 0 | 0 | 0 |
| EasyFit | 30 | 28 | 1 | 1 | 0 | 0 |
| Fitness24Seven | 71 | 67 | 0 | 0 | 4 | 0 |
| Forever | 19 | 18 | 1 | 0 | 0 | 0 |
| Fressi | 88 | 72 | 0 | 4 | 12 | 0 |
| GOGO | 3 | 3 | 0 | 0 | 0 | 0 |
| GOGO Express | 25 | 23 | 0 | 0 | 2 | 0 |
| GYM Anytime | 5 | 5 | 0 | 0 | 0 | 0 |
| LadyLine | 14 | 11 | 0 | 3 | 0 | 0 |
| Liikku | 76 | 71 | 0 | 1 | 4 | 0 |
| Ole.Fit | 54 | 47 | 0 | 5 | 2 | 0 |
| PTVGYM | 15 | 15 | 0 | 0 | 0 | 0 |
| **Total** | **432** | **392** | **2** | **14** | **24** | **0** |

## Overall

| Metric | Count |
|---|---:|
| Phase 1 unique staged | 432 |
| New Phase 2 discoveries (net after ingest/dedupe) | 34 |
| Final unique Finland staging | 466 |
| READY_TO_IMPORT | 429 |
| NEEDS_COORDINATES | 2 |
| NEEDS_REVIEW | 7 |
| COMING_SOON | 27 |
| CLOSED | 1 |
| Duplicate/legacy exclusions this pass | 6 |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| ELIXIA | 32 live elixia.fi embedded JSON | 32 | 32 | 0 | 100% |
| EasyFit | ~29–32 official location pages; 30 staged | 30 | 28 | 2 | 93% |
| Energy | 6 official 24/7 clubs (Joensuu/Liperi/Kuopio) | 6 | 6 | 0 | 100% |
| Esport | 4 current gym-floor sites + Bristol closed | 5 | 4 | 1 | 80% |
| Fitness24Seven | 71 gymData market=fi (67 open + 4 coming soon) | 71 | 67 | 4 | 94% |
| Forever | 19 gyms / 13 cities on foreverclub.fi | 19 | 18 | 1 | 95% |
| Fressi | 91 claimed on fressi.fi (24h + Hyvinvointikeskus) | 88 | 72 | 16 | 82% |
| GOGO | 3 full-service Tampere clubs | 3 | 3 | 0 | 100% |
| GOGO Express | ~25 official gx-cards | 25 | 23 | 2 | 92% |
| GYM Anytime | 5 current clubs until ~early 2027 GOGO Express rebrand | 5 | 5 | 0 | 100% |
| Greenfit | 4 official Uusimaa clubs | 4 | 4 | 0 | 100% |
| LadyLine | 14 official toimipiste clubs | 14 | 12 | 2 | 86% |
| Liikku | 76 WP gym CPT; yli 70; homepage lists 2026/2027 openings | 76 | 71 | 5 | 93% |
| Ole.Fit | yli 60 claimed; 67 homepage locator cards; Kokkola MINI nav is same club as Kokkola | 67 | 65 | 2 | 97% |
| PTVGYM | 15 clubs on ptvgym.fi | 15 | 15 | 0 | 100% |
| Vocatum | 4 open + 2 coming soon (Pateniemi 1.9, Lielahti 15.9) | 6 | 4 | 2 | 67% |

Coverage % is READY / discovered in this staging file.

## Market coverage audit

Focus: conventional gyms suitable for Gymly. CrossFit boxes, municipal leisure centres, PT-only, EMS-only, yoga/Pilates-only, martial arts, and physiotherapy-only were not bulk-added.

**INCLUDE (staged this pass):**

- **Energy** — 6 current 24/7 clubs. Official yhteystiedot. Litmanen is now open. INCLUDE.

- **Esport** — Center, Arena, Express Mankkaa, Express Liila have gym floors and are current. Bristol is “Suljettu toistaiseksi” → CLOSED, not READY. INCLUDE.

- **Greenfit** — 4 conventional gyms (Keilaniemi, Pasila, Ruoholahti, Nummela). Under the informal 5+ guideline but Helsinki-metro relevant. INCLUDE.

- **Vocatum** — 4 open + Pateniemi (1.9.2026) and Lielahti (15.9.2026) COMING_SOON. INCLUDE.

- **Ole.Fit `/kuntokeskukset2/`** — genuine Phase 1 scrape gap. 13 additional physical clubs staged from official club pages. Ärrävaara not duplicated. Kokkola MINI is the same club page as Kokkola. INCLUDE.

**LATER (not staged):** Buusti (~4 regional), Balanssi (~4), Fit24 (Klaukkala + maybe 1 more), Polte / Nautilus / Power Gym / Syke (~2–3), independent single-site gyms.

**EXCLUDE:** Anytime Fitness (no FI estate). Puls & Träning (bankrupt 16.3.2026). TFW / CrossFit-style unless a conventional gym floor is the consumer product. Municipal halls. SATS is not the current Finnish consumer brand (ELIXIA is).

Fressi homepage still claims **91** centres. All 12 Fressi COMING_SOON club pages still say they are opening later in 2026 (Vartiokylä 25.8.2026 is still future as of 18.8.2026). None were promoted. The aborted navigation-label job was ignored.

## Recovery

- Recovered from NEEDS_COORDINATES: 0
- Recovered from NEEDS_REVIEW: 6
- Reclassified to COMING_SOON (not READY): 1
- New locations added from genuine coverage gaps: 34
- Fressi COMING_SOON still held out of READY: 12

- EasyFit Nokia: still NEEDS_REVIEW (uncertain; no fallback)
- EasyFit Mustasaari – Sepänkylä: still NEEDS_COORDINATES (uncertain; no fallback)
- Forever Lappeenranta Huhtari: still NEEDS_COORDINATES (uncertain; no fallback)
- Fressi 24h Lentola: still NEEDS_REVIEW (uncertain; no fallback)
- Fressi 24h Arabia 135: still NEEDS_REVIEW (uncertain; no fallback)
- Fressi 24h Munkinmäki, Kirkkonummi: still NEEDS_REVIEW (uncertain; no fallback)
- Fressi 24h Linjuri: still NEEDS_REVIEW (uncertain; no fallback)
- LadyLine Kajaani: still NEEDS_REVIEW (uncertain; no fallback)
- LadyLine Joensuu: NEEDS_REVIEW → READY_TO_IMPORT via recovered_structured (nominatim_structured)
- LadyLine Iisalmi: still NEEDS_REVIEW (uncertain; no fallback)
- Liikku Espoo Leppävaara: NEEDS_REVIEW → COMING_SOON (official avataan 2027)
- Ole.Fit Ärrävaara (Koivuvaarankuja 2): NEEDS_REVIEW → READY_TO_IMPORT via official Google embed
- Ole.Fit Ilmajoki: NEEDS_REVIEW → READY_TO_IMPORT via official Google embed
- Ole.Fit Kurikka: NEEDS_REVIEW → READY_TO_IMPORT via structured Nominatim
- Ole.Fit Ulvila: NEEDS_REVIEW → READY_TO_IMPORT via official Google embed
- Ole.Fit Varkaus: NEEDS_REVIEW → READY_TO_IMPORT via official Google embed
- Dropped 6 homepage-card rows that duplicated Phase 1 official-page clubs (Forssa, Joensuu Jokikatu, Kokkola Isokatu stale, Karhula 2-4, Kurikka 9/63100, Saippua Artturinkatu).
- Ole.Fit Savio: stale “loppukeväällä 2025” copy; official homepage lists it as current in 2026 → READY.
- Ole.Fit Kokkola: kept official footer Yrittäjäntie 5-7, 67100; structured Nominatim (not the stale Isokatu embed). Kokkola MINI nav page is the same HTML as Kokkola — not a second gym.
- Vocatum Pateniemi restored to COMING_SOON (opens 1.9.2026); ambiguous geocode must not demote coming-soon.

## Data quality

- Missing addresses: 0
- Missing postcodes: 0
- Missing cities: 0
- Missing coordinates: 27
- Ambiguous coordinates (still unresolved): 7
- Suspicious READY coordinate flags: 0
- Suspicious READY coordinate clusters: 0
- Leading-zero / non-five-digit postal issues: 0
- Mojibake/encoding issues: 0
- Finnish postal codes remain five-character strings (example `00100`, never `100`). JSON strings + Excel TEXT `@`.
- No Helsinki / city / postal / Finland centroid fallbacks. No neighbour-gym coordinates. No 0,0.

## Completeness

1. **Major chains that appear complete (or complete for the current official locator):** ELIXIA 32/32 live JSON. Fitness24Seven `market=fi` gymData (67 open READY, 4 Group coming soon). PTVGYM 15/15. GOGO 3/3. GYM Anytime 5/5 remaining current clubs. Energy 6/6. Greenfit 4/4. Esport current gym-floor set (Bristol closed). LadyLine 14/14 discovered (Kajaani + Iisalmi still ambiguous geocode). Forever 19/19 discovered (Lappeenranta Huhtari still no building-level geocode). Liikku WP CPT set; Espoo Leppävaara reclassified COMING_SOON (official avataan alkuvuodesta 2027). Ole.Fit 67 after adding the `/kuntokeskukset2/` gap (homepage 67 cards; MINI is not a second site).

2. **Major chains still materially incomplete:** **Fressi** — 91 claimed vs 88 physical staged after the Kirkkonummi collapse; 12 coming soon held; 4 x 24h pages remain NEEDS_REVIEW because OSM still returns two building candidates >150 m (no fallback). **EasyFit** — Nokia still ambiguous; Mustasaari/Korsholm Matildantie 2 still no building-level hit. GOGO Express Roihupelto + Kajaani remain coming soon.

3. **Meaningful conventional Finnish chains still completely missing:** None of national Fressi/Liikku/F24S scale. Remaining names are small regional (Buusti, Balanssi, Fit24) — LATER, not another full discovery phase.

4. **Is another discovery phase worthwhile?** Not as a bulk Phase 1-style scrape. A later hygiene pass could promote Fressi/Vocatum/Liikku openings after they actually open, and retry EasyFit Nokia / Mustasaari / Forever Huhtari if official map embeds appear. Do not start Netherlands from this workstream.

## Major city coverage (sanity check)

| City | Discovered | READY |
|---|---:|---:|
| Helsinki | 100 | 89 |
| Espoo | 49 | 47 |
| Vantaa | 27 | 24 |
| Tampere | 34 | 31 |
| Turku | 22 | 22 |
| Oulu | 17 | 15 |
| Jyväskylä | 13 | 12 |
| Kuopio | 13 | 11 |
| Lahti | 16 | 16 |
| Pori | 5 | 5 |
| Vaasa | 7 | 7 |
| Joensuu | 11 | 10 |

This is a sanity check, not a requirement to invent locations.

## Duplicate / rebrand analysis

- Duplicate IDs remaining: 0
- Same-brand physical address duplicates: 0
- Same-brand proximity ≤80 m: 1
- Legitimate different-brand co-locations ≤80 m: 8
- Existing Finland rows in live catalog: 0
- Live catalog total: 4426
- `fi_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0
- Same address, different brand vs live catalog: 0
- ELIXIA rows: 32. SATS-branded Finnish rows created: 0.
- Current Finnish consumer brand is ELIXIA. Operator is SATS Finland Oy. No SATS-branded Finnish club rows were created. legacy_brand=SATS on ELIXIA rows.
- Fitness24Seven Helsinki Pitäjänmäki vs Pitäjänmäki Group remain separate (open vs coming Group, ~73 m).
- Fressi Kirkkonummi generic URL remains collapsed into Munkinmäki (one physical gym).
- GYM Anytime remains current until the announced early-2027 GOGO Express rebrand.

Same-brand proximity pairs:
- {'a': 'Fitness24Seven Helsinki Pitäjänmäki', 'b': 'Fitness24Seven Helsinki Pitäjänmäki Group', 'brand_a': 'Fitness24Seven', 'brand_b': 'Fitness24Seven', 'distance_m': 73, 'city': 'Helsinki'}

## Proposed SAFE merge

**429** READY_TO_IMPORT rows are recommended for a later Finland production merge.

Expected catalog after that merge: **4426 + 429 = 4855**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.
Do not merge yet.

## Scaling

Current live catalog: 4426. Client-side search/index benchmarks from scaling prep remained comfortable through ~8,000–10,000 centers.
4855 remains **comfortably inside** the current client-side architecture. No server directory migration is required for this Finland merge.

## Files

- `data/finland/finland_centers_staging.json`
- `data/finland/Gymly_Finland_All_Discovered_Centers.xlsx` (postal TEXT)
- `data/finland/finland_geocode_review.json`
- `data/finland/finland_duplicate_analysis.json`
- `data/finland/phase2/`
- `scripts/finland-phase2.py`

## Stop

Phase 2 stops here. No production merge. No Finland QA. No Netherlands / next country.
