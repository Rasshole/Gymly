# PORTUGAL PHASE 1 READINESS REPORT

Generated: 2026-08-22T19:20:05.949124+00:00

**Verdict:** PORTUGAL PHASE 2 REQUIRED BEFORE MERGE

## Overall

- Unique staged: 271
- READY_TO_IMPORT: 164
- NEEDS_COORDINATES: 42
- NEEDS_REVIEW: 58
- COMING_SOON: 0
- CLOSED: 2
- DUPLICATE: 5
- LEGACY: 0

- Production modified: **NO**
- Current production: **10,525**
- Portugal live: **0**
- Production sha256_16: `e7e3848d4ac3efd1`

## READY brand breakdown

- VivaGym: 46
- Fitness UP: 39
- Element: 23
- Solinca: 19
- Solinca Light: 16
- Holmes Place: 12
- Be-Fit: 8
- Fitness Factory: 1

## Regional READY coverage

- Lisbon metro: 62
- Porto metro: 42
- North: 24
- Alentejo: 16
- Central: 10
- Algarve: 8
- Madeira: 1
- Azores: 1

## Major extraction sources

- VivaGym PT: `vivagym.com/pt-pt/ginasios/` HealthClub JSON-LD (ex Fitness Hut)
- Solinca / Solinca Light: `solinca.pt/gym-sitemap.xml` + club Morada + maps.app.goo.gl
- Fitness UP: `fitnessup.pt/ginasio/*` MORADA blocks
- Element: `elementgyms.pt/ginasio/` listing pages (+ Angra Azores)
- Holmes Place: `holmesplace.com/pt/pt/clubes` JSON-LD + reverse postal from official coords
- Be-Fit: sitemap `/contactos` morada blocks (Madeira present)
- Fitness Factory: club pages via curl (addresses mostly without official postcodes → Phase 2)
- Supera: PT site only (addresses incomplete → Phase 2)

## Rebrands

- **Fitness Hut** → VivaGym: Fitness Hut Portugal unified under VivaGym (from late 2024). Stage as VivaGym only. Official: vivagym.com/pt-pt/
- **Pump Fitness Spirit** → Solinca Light: Pump clubs rebranded to Solinca Light (~2020). Stage as Solinca Light only.
- **Virgin Active Portugal** → Holmes Place: Virgin Active Iberia acquired by Holmes Place (2019).

## Incomplete / blocked

- Fitness Factory: ~49 listed; almost no official postcodes on pages
- Element: listing ~28 vs SC Fitness claim ~50+
- Be-Fit: 22 discovered; many NEEDS_COORDINATES
- Supera: 5–6 PT complexes; address extraction incomplete
- Kalorias / Go Gym / Vivafit / Lemonfit / Phive / Balance: not extracted in Phase 1
- Anytime Fitness: absent in Portugal

## QA

- duplicate_ids: 0
- same_brand_physical_duplicates: 0
- invalid_postcodes_ready: 0
- missing_addresses_ready: 0
- missing_cities_ready: 0
- missing_coordinates_ready: 0
- invalid_coordinates_ready: 0
- fallback_coordinates: 0
- foreign_outliers: 0
- mojibake: 0
- ambiguous_geocodes: 0

## Projected catalog

10,525 + 164 = **10689**

## Architecture

- Keep client-side: YES
- Inside comfort zone: YES (10689 < 12,000)
- Global 10K QA rerun required now: NO

## Phase 2

PORTUGAL PHASE 2 REQUIRED BEFORE MERGE

Material gaps: Fitness Factory estate, Element completeness, Be-Fit coordinates, Supera addresses, Kalorias/Go Gym/other ≥5 chains, Azores/Madeira chain coverage beyond Be-Fit/Element Angra.
