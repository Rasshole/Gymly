# SLOVAKIA PHASE 2 READINESS REPORT

Generated: 2026-08-24

## Verdict

**READY FOR SLOVAKIA MERGE**

Production SHA: `f31734acfd849b54f7cfeeb8d8f896980ed90fd975a87ae85f2aa1c6d1356854` (unchanged)  
Production modified: **NO**  
Phase 3 required: **NO**

## Recovery summary

| Metric | Value |
|--------|------:|
| Phase 1 READY | 32 |
| Phase 1 READY IDs preserved | 32 |
| Unresolved recovered | 5 |
| Final READY | **37** |
| Projected catalog | **11,254** |
| Crosses 12,500 | **NO** |

Recovered:
1. 365 Fit&Co Košice Hypertesco — Tesco Extra Trolejbusová geocode
2. 365 Fit&Co Košice ROCA — Južná trieda 117 geocode
3. 365 Fit&Co Spišská Nová Ves — Medza 15 geocode
4. 365 Fit&Co Trenčín Južanka — OZC Južanka geocode; PSČ corrected `826 06` → `911 08`
5. Form Factory Sky Park — Sky Park Offices Bottova geocode (open club)

## Chain completeness

| Chain | Official | Discovered | READY | Unresolved | Coming soon | Closed | Coverage | Verdict |
|-------|--------:|----------:|------:|-----------:|------------:|-------:|---------:|---------|
| Golem Club | 11 | 11 | 11 | 0 | 0 | 0 | 100% | COMPLETE |
| Form Factory | 18 | 18 | 15 | 0 | 3 | 0 | 100% open | COMPLETE |
| 365 Fit&Co | 8 | 9 | 8 | 0 | 0 | 1 | 100% | COMPLETE |
| FITINN | 3 | 3 | 3 | 0 | 0 | 0 | 100% | COMPLETE |

## Status counts

| Status | Count |
|--------|------:|
| READY_TO_IMPORT | 37 |
| COMING_SOON | 3 |
| CLOSED | 1 |
| NEEDS_COORDINATES | 0 |
| NEEDS_REVIEW | 0 |

## READY by brand

| Brand | READY |
|-------|------:|
| Form Factory | 15 |
| Golem Club | 11 |
| 365 Fit&Co | 8 |
| FITINN | 3 |
| **TOTAL** | **37** |

## Regional READY

Bratislava 21 · Košice 5 · Žilina 2 · Trenčín 2 · Prešov / Banská Bystrica / Nitra / Martin / Poprad / Spišská Nová Ves / Považská Bystrica 1 each · **Trnava 0**

Trnava gap: **A_legitimate_no_chain_presence** (no current Golem / Form Factory / FITINN / 365 club)

## FITINN estate

Official fitinn.sk SK pages: Prior, Nido, Nitra only (HTTP 200).  
Secondary VIVO/Petržalka listings: official pages **404** → excluded as stale.

## 365 Fit&Co estate

Official kontakt: **8** current branches.  
Digital Park: leftover nav only → **CLOSED** (not in kontakt branch headers).

## Form Factory coming soon (still excluded)

- Budatínska
- Europa BC
- Slnečnice

## Data quality (READY)

Duplicate IDs 0 · Invalid PSČ 0 · Missing fields 0 · Invalid coords 0 · Fallback 0 · Foreign outliers 0 · Mojibake 0  
Same-brand ≤200 m 0 · Identical coords 0 · Different-brand ≤100 m 0

## Rebrands / legacy

- FitCamp → Form Factory FitCamp (current FF club)
- Digital Park → CLOSED
- FITINN VIVO/Petržalka secondary → excluded
- EfectFit / MultiSport → excluded

## Remaining gaps

**Material:** none  

**Non-blocking:** 3 Form Factory coming-soon; Trnava no-chain presence; Digital Park closed

## Phase 3?

**NO** — all meaningful national chains COMPLETE; remaining items are coming-soon or legitimate gaps.

## Canonical merge source

`data/slovakia/SLOVAKIA_PHASE2_READY_TO_IMPORT.json` (37 rows)
