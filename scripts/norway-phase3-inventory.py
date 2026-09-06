#!/usr/bin/env python3
"""Dump Phase 3 unresolved inventory to JSON for processing."""
import json
from collections import Counter
from pathlib import Path

st = json.loads(Path("data/norway/norway_centers_staging.json").read_text())
p2 = json.loads(Path("data/norway/phase2_new_centers_staging.json").read_text())
soft = json.loads(Path("data/norway/phase2_SOFT_POSTAL_WITHHELD.json").read_text())
out = Path("data/norway/phase3")
out.mkdir(parents=True, exist_ok=True)

all_un = [r for r in st + p2 if r.get("import_category") != "MERGED_INTO_CATALOG"]
by_cat = {}
for r in all_un:
    by_cat.setdefault(r.get("import_category"), []).append(r)

for cat, rows in by_cat.items():
    Path(out / f"inventory_{cat}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    )

summary = {
    "total_unresolved": len(all_un),
    "by_category": {k: len(v) for k, v in by_cat.items()},
    "soft_file_count": len(soft),
    "soft_names": [r["name"] for r in soft],
}
Path(out / "inventory_summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(summary, indent=2))
for cat, rows in sorted(by_cat.items()):
    print(cat, len(rows), dict(Counter(r.get("brand") for r in rows)))
