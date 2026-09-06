#!/usr/bin/env python3
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

c = json.loads(Path("src/data/centers.json").read_text())
st = json.loads(Path("data/norway/norway_centers_staging.json").read_text())
p2 = json.loads(Path("data/norway/phase2_new_centers_staging.json").read_text())
merged = [r for r in st + p2 if r.get("phase2_merge") == "approved_high_confidence"]
soft = [
    r
    for r in st + p2
    if r.get("import_category") == "SOFT_POSTAL_WITHHELD"
    or r.get("phase2_merge") == "withheld_soft_postal"
]


def catalog(r):
    return {
        "id": r["id"],
        "name": r["name"],
        "brand": r["brand"],
        "address": r.get("address"),
        "postal_code": r.get("postal_code"),
        "city": r.get("city"),
        "lat": r.get("lat"),
        "lng": r.get("lng"),
        "country": "Norway",
        "is_active": True,
    }


Path("data/norway/phase2_APPROVED_FOR_MERGE.json").write_text(
    json.dumps([catalog(r) for r in merged], ensure_ascii=False, indent=2) + "\n"
)
Path("data/norway/phase2_SOFT_POSTAL_WITHHELD.json").write_text(
    json.dumps(
        [
            {
                "id": r["id"],
                "name": r["name"],
                "brand": r["brand"],
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "geocode_reasons": r.get("geocode_reasons"),
                "geocode_display": r.get("geocode_display"),
            }
            for r in soft
        ],
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)

no = [x for x in c if x["country"] == "Norway"]
merged_ids = {r["id"] for r in merged}
added = [x for x in no if x["id"] in merged_ids]


def norm(s):
    s = (s or "").lower().replace("æ", "ae").replace("ø", "o").replace("å", "a")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


buckets = defaultdict(list)
for x in no:
    buckets[(norm(x.get("address")), str(x.get("postal_code")), norm(x.get("brand")))].append(x)
dups = {k: v for k, v in buckets.items() if k[0] and len(v) > 1}

colo = defaultdict(list)
for x in no:
    colo[(norm(x.get("address")), str(x.get("postal_code")))].append(x)
colocated = []
for k, v in colo.items():
    brands = {x["brand"] for x in v}
    if k[0] and len(brands) > 1:
        colocated.append([f'{x["brand"]}:{x["name"]}' for x in v])

unresolved = [r for r in st if r.get("import_category") != "MERGED_INTO_CATALOG"] + [
    r for r in p2 if r.get("import_category") != "MERGED_INTO_CATALOG"
]
report = {
    "1_centers_before": 1139,
    "2_centers_after": len(c),
    "3_norway_before": 146,
    "4_norway_after": len(no),
    "5_exact_number_added": len(added),
    "6_breakdown_by_chain": dict(Counter(x["brand"] for x in added)),
    "7_soft_postal_intentionally_withheld": len(soft),
    "8_unresolved_rows_still_staged": len(unresolved),
    "8b_unresolved_by_category": dict(Counter(r.get("import_category") for r in unresolved)),
    "9_duplicate_ids_found": len([i for i, n in Counter(x["id"] for x in c).items() if n > 1]),
    "10_duplicate_physical_same_brand_address": len(dups),
    "10b_colocated_different_brands": colocated,
    "11_dk_unchanged": sum(1 for x in c if x["country"] == "Denmark") == 354,
    "12_se_unchanged": sum(1 for x in c if x["country"] == "Sweden") == 639,
    "13_every_new_has_valid_coords": all(
        isinstance(x.get("lat"), (int, float))
        and isinstance(x.get("lng"), (int, float))
        and not (x["lat"] == 0 and x["lng"] == 0)
        and x.get("is_active")
        and x.get("country") == "Norway"
        for x in added
    ),
    "14_files_changed": [
        "src/data/centers.json",
        "data/norway/norway_centers_staging.json",
        "data/norway/phase2_new_centers_staging.json",
        "data/norway/phase2_APPROVED_FOR_MERGE.json",
        "data/norway/phase2_SOFT_POSTAL_WITHHELD.json",
        "data/norway/phase2_merge_report.json",
        "data/norway/README.md",
        "scripts/import-norway-centers-phase2-merge.mjs",
    ],
}
Path("data/norway/phase2_merge_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(report, indent=2, ensure_ascii=False))
