# Italy Completeness — FITINN 2-row Repair Report

Generated: 2026-08-21T15:03:34.944580+00:00

## Audit trail

| Step | Count / fact |
|------|--------------|
| Original intended completeness merge | **38** |
| Initially written to production | **38** (briefly at 9,094 / Italy 588) |
| Post-merge safety repair removed | **2** |
| Removal reason | Invalid neighbour-suburb geocodes (Pessano/Rodano / Peschiera Borromeo) — not Milano site pins |
| Production before this repair | **9,092 / Italy 586** (36/38 completeness) |
| Recovered now | **2** |
| Inserted now | **2** |
| Still unresolved | **0** |
| Final completeness additions in production | **38** |
| Final Italy | **588** |
| Final global | **9,094** |

## FITINN Milano Bicocca (`it_ccb19385b7`)

- **Official address:** Via Fulvio Testi 282, 20162 Milano
- **Coordinate source:** OFFICIAL_MAP_PIN (`fitinn.it` club page + `/palestre/` locator `studios.push` position)
- **Coordinates:** 45.52430, 9.21156
- **Status:** MERGED_INTO_CATALOG
- **Rejected prior:** 45.549983, 9.3750001 (neighbour suburb)
- **Reverse check:** Viale Fulvio Testi / Bicocca / Milano (not Pessano)

## FITINN Milano Viale Abruzzi (`it_4ca03e5086`)

- **Official address:** Viale Abruzzi 38, 20131 Milano
- **Coordinate source:** OFFICIAL_MAP_PIN (`fitinn.it` club page + locator)
- **Coordinates:** 45.47906, 9.21737
- **Status:** MERGED_INTO_CATALOG
- **Rejected prior:** 45.4551727, 9.3164328 (Peschiera Borromeo area)
- **Reverse check:** Named OSM POI **FITINN**, Milano CAP 20131

## Canonical reconciliation

- Completeness candidates originally: **38**
- Actually merged before repair: **36**
- Recovered now: **2**
- Final completeness rows in production: **38**
- Rows marked `MERGED_INTO_CATALOG` in READY file: **38**
- Metadata drift: **none** (MERGED count == IDs present in `centers.json`)

## Validation

- Duplicate IDs: **0**
- Same-brand FITINN &lt;100 m pairs: **none**
- Invalid CAP: **0**
- Invalid / fallback / foreign coords: **0**
- Distance between recovered clubs: **5051 m**
- Original Italy 550: **intact**
- Other countries: **unchanged**

## Idempotency

Second-run insertions: **0** (both IDs already in catalog)

## 10K checkpoint

- Catalog: **9,094**
- Headroom to 10,000: **906**
- Centers to exceed 10,000: **907**
- Global 10K+ stress QA: **NO**

## Next

ITALY FITINN REPAIR COMPLETE — READY TO RE-RUN COMPLETENESS QA

Do not start Poland. Do not run stress QA in this task.
