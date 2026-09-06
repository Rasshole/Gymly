# GREECE MERGE REPORT

**Generated:** 2026-08-22

## Baseline

| Metric | Value |
|--------|-------|
| Centers before | 10772 |
| Greece before | 0 |
| Approved candidates | 106 |
| Pre-merge SHA256 | `5d3d11602d6b882599eb74933a2cfd248baefb816bfc8dfbacba8ee151d19703` |

## Pre-merge validation

**Result:** PASS_ALL

Withheld: 0

## Merge result

| Metric | Value |
|--------|-------|
| Inserted | 106 |
| Centers after | 10878 |
| Greece after | 106 |
| Post-merge SHA256 | `cda6b1040d4031953fa63c0bc868214fb502826277aa19e0a37e9009fef08220` |

## Brand breakdown (production)

- Alterlife: 72
- Yava: 22
- Planet Fitness Greece: 5
- Mega Gym: 4
- Holmes Place: 3

## YAVA

- Merged: 22
- Legacy `?gym=` rows merged: 0
- Result: PASS

## Alterlife dense pair (≤25 m)

- Classification: **A** (retain_both)
- gr_f92effe0b0 / gr_0fc7dfed4c @ 14 m
- Evidence: Separate Alterlife club pages (galatsi-veikou vs galatsi-galatsiou-ave); different street addresses and postcodes (111 46 vs 111 41)

## Check-in

- Radius: 200 m
- Auto-checkout: 200 m
- Changed: **no**

## Global scale

- Previous: 10772
- New: 10878
- 12,500 crossed: **no**
- Global Stress QA required now: **NO**

## Performance

| Metric | Value |
|--------|------:|
| Catalog | 10878 |
| Active | 10873 |
| JSON size | 3.21 MB |
| Parse | ~409.1 ms |
| Cold index | ~1077 ms |
| Cached | ~55.7 ms |
| Typical search | ~1.9 ms |
| Worst scan | ~2.2 ms |
| Nearest | ~4.2 ms |
| Map build | ~10.3 ms |
| Viewport filter | ~1.1 ms |
| Assessment | **REVIEW** |

No architecture change required.

## Verdict

**GREECE MERGE COMPLETE — WAITING FOR QA**
