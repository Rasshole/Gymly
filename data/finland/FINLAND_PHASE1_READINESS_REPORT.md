# Finland Phase 1 Readiness Report

Generated: 2026-08-18 19:28 UTC

**Status: DISCOVERY COMPLETE — DO NOT MERGE.**

`src/data/centers.json` was not modified.

## Market audit (Finland conventional chains)

Current consumer-facing brands staged in Phase 1:

- **Fitness24Seven** — official `gymData` locator, **`market=fi` only**. 67 open + 4 coming soon. Swedish Boden excluded.
- **ELIXIA** — current Finnish consumer brand. Operator SATS Finland Oy. 32 live clubs in official embedded JSON. **No SATS + ELIXIA duplicates.** `legacy_brand: SATS`. Wiklund/Turku Sep 2026 is not in the live 32.
- **Fressi** — ~90 claimed; 24h gyms and Hyvinvointikeskus both qualify as conventional gyms. Sitemap club pages staged.
- **Liikku** — 76 WP `gym` CPT rows. Coming soon held out of READY. Espoo Leppävaara held as NEEDS_REVIEW (homepage 2027 vs club-page hours).
- **EasyFit** — Finnish chain (not German EasyFitness). Official location pages only.
- **Forever** — 19 clubs on official toimipisteet-ja-hinnat (Premium + LITE where a real gym floor exists).
- **Ole.Fit** — 54 official `kuntokeskukset` URLs vs “yli 60” claim.
- **GOGO** — 3 full-service Tampere clubs (Park, City, Hervanta).
- **GOGO Express** — official gx-cards. Roihupelto and Kajaani are coming soon (Kajaani opens 2026–27).
- **GYM Anytime** — still the current consumer brand for Kurikka, Rauma, Tampere, Valkeakoski, Varkaus until the announced early-2027 GOGO Express rebrand.
- **PTVGYM** — 15 clubs; addresses from official yhteystiedot (Kouvola Tommolankatu 12; Jyväskylä Vasarakatu 25 — club tab Alasinkatu 3 treated as stale).
- **LadyLine** — 14 women’s clubs with conventional gym floors; included.

Investigated and **not** staged as current Finnish conventional estates:

- **Anytime Fitness** — no meaningful Finnish estate.
- **Puls & Träning / P&T** — PT Salit Finland Oy bankrupt 16.3.2026; closed. Some rooms now operate as Fressi.

Brand ≠ physical gym: one current operating brand per location. Parent/franchise/old names are not extra rows.

## Overall

| Metric | Count |
|---|---:|
| Total Finnish locations discovered (after staging dedupe) | 432 |
| VERIFIED_CURRENT | 408 |
| READY_TO_IMPORT | 392 |
| NEEDS_COORDINATES | 2 |
| NEEDS_REVIEW | 14 |
| COMING_SOON | 24 |
| CLOSED | 0 |
| DUPLICATE (staging) | 0 |
| LEGACY_DUPLICATE | 0 |
| Staging same-id collapses | 1 |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coverage % |
|---|---|---:|---:|---:|---:|
| Fitness24Seven | ~66 open claimed; 71 gymData market=fi (67 open + 4 coming soon) | 71 | 67 | 4 | 94% |
| ELIXIA | 32 live on elixia.fi; yli 30 | 32 | 32 | 0 | 100% |
| Fressi | ~90 centres claimed (24h + Hyvinvointikeskus) | 88 | 72 | 16 | 82% |
| Liikku | 76 WP gym CPT; yli 70 | 76 | 71 | 5 | 93% |
| EasyFit | ~29 official location pages | 30 | 28 | 2 | 93% |
| Forever | 19 gyms / 13 cities claimed | 19 | 18 | 1 | 95% |
| Ole.Fit | 54 official kuntokeskukset URLs; yli 60 claimed | 54 | 47 | 7 | 87% |
| GOGO | 3 full-service Tampere clubs — exact brand GOGO not Express | 3 | 3 | 0 | 100% |
| GOGO Express | ~25 official cards on gogoexpress.fi | 25 | 23 | 2 | 92% |
| GYM Anytime | 5 clubs still consumer-branded GYM Anytime | 5 | 5 | 0 | 100% |
| PTVGYM | 15 clubs on ptvgym.fi | 15 | 15 | 0 | 100% |
| LadyLine | 14 official toimipiste clubs | 14 | 11 | 3 | 79% |

Coverage % is READY / discovered in this staging file, not vs the official estate size.

## Major cities (READY)

| City | Discovered | READY |
|---|---:|---:|
| Helsinki | 97 | 87 |
| Espoo | 44 | 42 |
| Vantaa | 25 | 21 |
| Tampere | 32 | 30 |
| Turku | 19 | 19 |
| Oulu | 15 | 14 |
| Jyväskylä | 13 | 12 |
| Kuopio | 11 | 9 |
| Lahti | 16 | 16 |

City matching is substring on the official city field (Helsinki does not include Espoo/Vantaa).

## Data quality

- Missing addresses: 0
- Missing postal codes: 0
- Missing cities: 0
- Missing coordinates: 32
- READY with official locator coordinates: 98
- READY with official JSON-LD coordinates: 2
- READY with Nominatim coordinates: 221
- Soft-postal matches flagged: 15
- Ambiguous geocode results: 13
- Encoding / mojibake flags: 0
- Postal codes that start with 00 (leading-zero risk in Excel if stored as number): 97
- Finnish postal codes are stored as **strings** in JSON and as Excel TEXT (`@` number format).
- No Helsinki / city / postal-code / Finland centroid fallbacks were used.
- Missing coordinates remain null and are **not check-in eligible** (Norway/Germany/UK behaviour).

## Geography

- All READY coordinates sit inside the Finland bounding box (incl. Åland longitudes).
- Fitness24Seven was filtered with official `market=fi` (not a lat/lng bbox). Swedish Boden Centrum was excluded.

## Duplicate / rebrand analysis

- Staging same-id collapses: 1
- Duplicate IDs remaining: 0
- Same-brand physical address duplicates: 0
- Same-brand proximity ≤80 m: 1
- Legitimate different-brand co-locations ≤80 m: 8
- Existing Finland rows in live catalog: 0
- `fi_*` IDs already in live catalog: 0
- ID collisions vs live catalog: 0
- Same brand+address matches vs live catalog: 0
- Same-brand proximity (≤50 m) vs live catalog: 0
- ELIXIA rows: 32. SATS-branded Finnish rows created: 0.
- Current Finnish consumer brand is ELIXIA. Operator is SATS Finland Oy. No SATS-branded Finnish club rows were created. legacy_brand=SATS on ELIXIA rows.
- Puls & Träning / P&T: PT Salit Finland Oy bankruptcy 16.3.2026 — clubs permanently closed. Not staged as current. Some former P&T rooms are now Fressi (current brand Fressi).
- GYM Anytime remains the current consumer brand for its remaining clubs; GOGO Express rebrand is announced for early 2027 and is not applied yet.
- Anytime Fitness: no meaningful Finnish estate found.

## Completeness

Finland Phase 1 is **not complete** just because the discovered count looks large.

**Appear complete or near-complete from official locators:**
- ELIXIA (32/32 embedded clubs; Wiklund/Turku Sep 2026 is coming soon and not in the live 32).
- Fitness24Seven Finland (`market=fi` gymData; 67 open READY, 4 coming soon).
- PTVGYM (15/15 official yhteystiedot clubs, all READY).
- GOGO full-service Tampere (3/3 READY).
- GYM Anytime remaining current clubs (5/5 READY).
- Forever official 19-club list (18 READY; Lappeenranta Huhtari Pelitie 36 has no building-level geocode).
- Liikku WP gym CPT (coming-soon + Leppävaara review hold).

**Materially incomplete or still resolving:**
- Ole.Fit: 54 official club URLs vs “yli 60” claim; 5 ambiguous geocodes held as NEEDS_REVIEW.
- Fressi: ~90 claimed vs 88 discovered after collapsing duplicate Kirkkonummi pages; several 24h pages have ambiguous OSM matches; 12 coming soon.
- LadyLine: 14/14 discovered; 3 cities (Kajaani, Joensuu, Iisalmi) have ambiguous Nominatim pairs >150 m.
- EasyFit: Nokia ambiguous; Mustasaari/Korsholm Matildantie 2 not building-matched.
- GOGO Express: 23 READY; Roihupelto + Kajaani coming soon.

**Phase 2 conventional chains to investigate (not staged READY here unless already fetched):**
- Energy (~5) — regional conventional.
- Esport Fitness — sports centres with gym floors (qualify only if independent strength/cardio floor).
- Greenfit, Buusti, Balanssi — smaller regional (4).
- Vocatum (Tampere takeovers).
- Fit24 (Nurmijärvi Klaukkala and any additional sites).
- Remaining Ole.Fit clubs not on the homepage list.
- Independent conventional gyms in Oulu, Jyväskylä, Kuopio, Pori, Vaasa, Joensuu.

Do **not** Phase-2 dump: CrossFit-only boxes, yoga/Pilates-only, EMS-only, martial arts schools, physiotherapy-only, or municipal sports halls without a conventional gym floor.

## Proposed SAFE merge

**392** READY_TO_IMPORT rows are recommended for a later Finland production merge.

Expected catalog after that merge: **4426 + 392 = 4818**.

COMING_SOON, NEEDS_COORDINATES, NEEDS_REVIEW, CLOSED, and DUPLICATE rows must stay out.

## Scaling

Current live catalog: 4,426. UK QA benchmark approximately parse 6 ms, cold index 588 ms, cached index 0 ms, typical search 528 ms / 3 queries, nearest 29 ms, map build 21 ms.
The current architecture is considered practical around 8,000–10,000 centers.
4,818 remains **comfortably inside** the current client-side architecture. No architecture redesign in this phase.

Finland missing coordinates must remain null / not check-in eligible. No Helsinki fallback was introduced.

## Files

Created or updated under `data/finland/` and `scripts/`:

- `scripts/finland-phase1-discover.py`
- `scripts/finland-phase1-consolidate.py`
- `scripts/finland-phase1-repair.py`
- `data/finland/finland_centers_staging.json`
- `data/finland/finland_geocode_review.json`
- `data/finland/finland_geocode_review.csv`
- `data/finland/finland_duplicate_analysis.json`
- `data/finland/FINLAND_PHASE1_READINESS_REPORT.md`
- `data/finland/Gymly_Finland_All_Discovered_Centers.xlsx`
- `data/finland/Gymly_Finland_All_Discovered_Centers.csv`
- `data/finland/finland_geocode_cache.json`
- `data/finland/finland_centers_staging.pre_geocode.json`
- `data/finland/finland_discovery_combined.json`
- `data/finland/raw/` official HTML/JSON captures
- `data/finland/scrapes/` per-chain discovery JSON
- `data/finland/raw/pages/` cached official club pages

**STOP. Do not merge Finland. Do not run Finland QA. Do not start another country.**
