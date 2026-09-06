#!/usr/bin/env python3
"""Dedupe phase3 new against live+staging before geocode."""
import json
import re
from pathlib import Path

P3 = Path("data/norway/phase3/phase3_new_centers_staging.json")
ST = Path("data/norway/norway_centers_staging.json")
P2 = Path("data/norway/phase2_new_centers_staging.json")
CENTERS = Path("src/data/centers.json")


def norm(s):
    s = (s or "").lower().replace("æ", "ae").replace("ø", "o").replace("å", "a")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def key(r):
    return (norm(r.get("address")), str(r.get("postal_code") or ""), norm(r.get("brand")))


centers = json.loads(CENTERS.read_text())
live = [c for c in centers if c.get("country") == "Norway"]
st = json.loads(ST.read_text())
p2 = json.loads(P2.read_text())
existing = live + [r for r in st + p2 if r.get("import_category") != "MERGED_INTO_CATALOG"]
ex_ids = {r["id"] for r in existing}
ex_keys = {key(r): r for r in existing if key(r)[0]}

rows = json.loads(P3.read_text())
keep, amb = [], []
for r in rows:
    if r["id"] in ex_ids:
        amb.append({**r, "dup_reason": "same_id"})
        continue
    k = key(r)
    if k[0] and k in ex_keys:
        amb.append(
            {
                **r,
                "dup_reason": "same_address_brand",
                "matched": ex_keys[k].get("name"),
                "matched_id": ex_keys[k].get("id"),
            }
        )
        continue
    # city case normalize
    if r.get("city"):
        r["city"] = r["city"].title() if r["city"].isupper() else r["city"]
    keep.append(r)

P3.write_text(json.dumps(keep, ensure_ascii=False, indent=2) + "\n")
Path("data/norway/phase3/phase3_duplicate_analysis.json").write_text(
    json.dumps(amb, ensure_ascii=False, indent=2) + "\n"
)
print("kept", len(keep), "ambiguous", len(amb))
print("by brand kept", {b: sum(1 for r in keep if r["brand"] == b) for b in sorted({r["brand"] for r in keep})})
print(
    "ready/geocode",
    sum(1 for r in keep if r.get("import_category") == "READY_TO_IMPORT"),
    sum(1 for r in keep if r.get("phase3_ready_for_geocode")),
)
