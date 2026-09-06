# Norway gym import

## Status

| Phase | State |
|-------|--------|
| Phase 1 | **Merged** — 146 active Norway centers in `src/data/centers.json` |
| Phase 2 | **Ready for review — NOT merged** |

Catalog now: **1139** (DK 354 · SE 639 · NO 146).

## Phase 2 merge (high-confidence only)

Merged **221** READY centers (excluded **26** soft-postal).

Catalog: **1139 → 1360** (Norway **146 → 367**). Soft-postal rows remain staged as `SOFT_POSTAL_WITHHELD`.

```bash
node scripts/import-norway-centers-phase2-merge.mjs --dry-run
node scripts/import-norway-centers-phase2-merge.mjs
```

## Opening hours

Not imported into `gymHours.json` yet.
