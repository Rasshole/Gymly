# Italy Phase 4 — Final Completeness Recovery

Generated: 2026-08-21T14:33:04.726827+00:00

**`src/data/centers.json` was NOT modified.** Production remains **9,056 / Italy 550**.

## Verdict

**READY FOR ITALY COMPLETENESS MERGE**

## Catalog math

- Production catalog: **9056**
- Production Italy: **550** (unchanged)
- Phase 3 READY retained: **22** (input 22; demotions 0)
- Phase 4 newly recovered READY: **16**
- FINAL_NEW_READY: **38**
- Projected catalog = 9056 + 38 = **9094**
- Headroom to 10k: **906** (exceeds at +945 FINAL_NEW_READY)

## Phase 3 READY retention

| Metric | Count |
|---|---:|
| Input READY | 22 |
| Retained | 22 |
| Demoted | 0 |

No demotions — all 22 Phase 3 READY rows retained.

## Critical priorities

### Fit Express
- Official WP estate: **69**
- Production live: **45**
- Phase 4 new in final set: **10**
- Coverage after Phase 4: **79.7%** of WP estate
- Note: WP estate is source of truth (~69). Marketing '70' not used as hard target.

### Icon Palestre
- Brand identity: **Icon Palestre** (`iconpalestre.it`) — no generic Icon pollution
- Audited estate estimate: **51** (sitemap clubish pages: 53)
- Production live: **31**
- Phase 4 new in final set: **5**
- Coverage after Phase 4 (audited): **70.6%**

### Orange / GetFIT
- Orange official locator: **23** (live production **23**)
- GetFIT site: **http_403**
- GetFIT Phase 3 READY acquired (not yet on Orange locator): **6**
- Founder-retained GetFIT: **2**
- Combined Orange live + acquired GetFIT READY: **29** (press target ~33)
- Handling: keep acquired clubs as **GetFIT** until Orange republishes; do not invent Orange rows

## FINAL READY by brand

| Brand | Count |
|---|---:|
| FITINN | 10 |
| Fit Express | 10 |
| GetFIT | 8 |
| Dabliu | 5 |
| Icon Palestre | 5 |
| **TOTAL** | **38** |

## Phase 4 NEW recovered by brand

| Brand | Count |
|---|---:|
| Fit Express | 10 |
| Icon Palestre | 5 |
| FITINN | 1 |
| **TOTAL** | **16** |

## Validation

- Dup IDs: **0**
- Already in production: **0**
- Gate failures: **0**
- CLOSED/COMING_SOON in READY: **0**
- Validation OK: **True**

## Stopping rule

- Credible conventional still recoverable (unresolved FX/Icon/FP/FITINN leftovers): **30**
- Major national chain materially absent (<50% coverage): **False**
- Technical blocker on clearly large official estate (≥20 missing & <75%): **False**
- Threshold for Phase 5: 100+ recoverable OR major chain absent OR large-estate technical blocker
- Phase 5 required: **False**

## Files

- `scripts/italy-phase4-discover.py`
- `scripts/italy-phase4-consolidate.py`
- `data/italy/ITALY_PHASE4_COMPLETENESS_RECOVERY_REPORT.md`
- `data/italy/ITALY_PHASE4_COMPLETENESS_RECOVERY_REPORT.json`
- `data/italy/ITALY_PHASE4_NEW_RECOVERED.json`
- `data/italy/ITALY_PHASE4_GEOCODE_REVIEW.json`
- `data/italy/ITALY_PHASE4_DUPLICATE_ANALYSIS.json`
- `data/italy/ITALY_COMPLETENESS_READY_TO_IMPORT.json`
- `data/italy/Gymly_Italy_Final_Completeness.xlsx`

## FINAL: READY FOR ITALY COMPLETENESS MERGE
