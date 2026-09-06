#!/usr/bin/env python3
"""
Slovenia Deep Phase 2 — clever fit / Shape House estate recovery.

Does NOT modify src/data/centers.json.
Preserves Phase 1 si_* IDs for unchanged physical clubs.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROOT,
    SLOVENIA_POSTAL_RE,
    base_row,
    classify_row,
    dedupe_by_id,
    format_si_postal,
    in_slovenia,
    make_id,
    nominatim_geocode,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/slovenia"
PHASE2 = OUT / "phase2"
RAW = PHASE2 / "raw"
for d in (PHASE2, RAW, RAW / "pages"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PROD_SHA = "19f288efaebbcb3e133ecfbc5ec52e1b36925d750649dd7f922f3c6f47b864c9"
PRODUCTION_TOTAL = 11416
PHASE1_READY = 21

# Phase 2 evidence: shape-house.com/kontakt/ (Feb 2026 rebrand from clever fit)
SHAPE_HOUSE_KONTAKT = "https://shape-house.com/kontakt/"

# Recover 9 Phase-1 COMING_SOON rows (PE-only → confirmed open on Shape House kontakt)
RECOVERIES_BY_ID: dict[str, dict] = {
    "si_021f737987": {
        "name": "Shape House Kranj",
        "brand": "Shape House",
        "address": "Cesta Jaka Platiše 18",
        "postal_code": "4000",
        "city": "Kranj",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/kranj/privacy/",
        "notes": "phase2_recovered; shape-house kontakt + clever-fit privacy hours 06-24; opened",
    },
    "si_c55bd4763c": {
        "name": "Shape House Ljubljana Loberia",
        "brand": "Shape House",
        "address": "Celovška cesta 522",
        "postal_code": "1000",
        "city": "Ljubljana",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/ljubljana-loberia/privacy/",
        "notes": "phase2_recovered; Loberia II retail complex (not typo); opened Oct 2025; PE had 520",
    },
    "si_98079e395a": {
        "name": "Shape House Murska Sobota",
        "brand": "Shape House",
        "address": "Lendavska ulica 29D",
        "postal_code": "9000",
        "city": "Murska Sobota",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/murska-sobota/privacy/",
        "notes": "phase2_recovered; shape-house kontakt; border-safe SI address",
    },
    "si_4191b87a6e": {
        "name": "Shape House Domžale",
        "brand": "Shape House",
        "address": "Breznikova ulica 17",
        "postal_code": "1230",
        "city": "Domžale",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/domzale/privacy/",
        "notes": "phase2_recovered; Domžale gap resolved; clever-fit privacy + shape-house kontakt",
    },
    "si_2f5157cb18": {
        "name": "Shape House Grosuplje",
        "brand": "Shape House",
        "address": "Industrijska cesta 1G",
        "postal_code": "1290",
        "city": "Grosuplje",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/grosuplje/privacy/",
        "notes": "phase2_recovered; shape-house kontakt + privacy page",
    },
    "si_95f6c33ba2": {
        "name": "Shape House Ljubljana Tiskarna",
        "brand": "Shape House",
        "address": "Dunajska cesta 123",
        "postal_code": "1000",
        "city": "Ljubljana",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/tiskarna-bezigrad/privacy/",
        "notes": "phase2_recovered; PE Tiskarna Bežigrad = consumer Tiskarna studio; not duplicate of Situla",
    },
    "si_5dfb02ad9d": {
        "name": "Shape House Koper Istrska",
        "brand": "Shape House",
        "address": "Istrska cesta 67",
        "postal_code": "6000",
        "city": "Koper",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/koper-istrska/privacy/",
        "notes": "phase2_recovered; Koper 1 (Istrska) distinct from Koper 2 Planet Tuš Ankaranska 2",
    },
    "si_8cdc4b9b69": {
        "name": "Shape House Celje",
        "brand": "Shape House",
        "address": "Mariborska cesta 128",
        "postal_code": "3000",
        "city": "Celje",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/celje/privacy/",
        "notes": "phase2_recovered; distinct from BODIFIT Celje Mariborska 119",
    },
    "si_760f077cf3": {
        "name": "Shape House Novo mesto 2",
        "brand": "Shape House",
        "address": "Belokranjska cesta 5",
        "postal_code": "8000",
        "city": "Novo mesto",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.clever-fit.com/sl/studios/novo-mesto-2/privacy/",
        "notes": "phase2_recovered; distinct from Shape House Novo mesto Ljubljanska 32",
    },
}

# Rebrand Phase-1 READY clever fit → Shape House (current consumer identity Feb 2026)
REBRAND_READY: dict[str, dict] = {
    "si_673eba29e0": {
        "name": "Shape House Ljubljana Situla",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House; same physical club",
    },
    "si_87aeb083b4": {
        "name": "Shape House Ljubljana Šiška",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House",
    },
    "si_ae7796d56f": {
        "name": "Shape House Ljubljana Rudnik",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House",
    },
    "si_cf31bee5f4": {
        "name": "Shape House Ljubljana Letališka",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House",
    },
    "si_1e461b2ce1": {
        "name": "Shape House Maribor",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House",
    },
    "si_c0ab7d90a3": {
        "name": "Shape House Novo mesto",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House",
    },
    "si_812bd7056e": {
        "name": "Shape House Koper Planet Tuš",
        "brand": "Shape House",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "notes_append": "phase2_rebrand clever fit → Shape House; Koper 2 on kontakt",
    },
}

NEW_SHAPE_HOUSE = [
    {
        "name": "Shape House Ljubljana Metalka",
        "address": "Dalmatinova ulica 2a",
        "postal_code": "1000",
        "city": "Ljubljana",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://advancedu.co/si/blog/shape-house-ljubljana-metalka-odpira-vrata-nova-lokacija",
        "notes": "phase2_new; opened 2026-06-18; not in Phase 1 staging",
    },
    {
        "name": "Shape House Jesenice",
        "address": "Fužinska cesta 8",
        "postal_code": "4270",
        "city": "Jesenice",
        "source_url": SHAPE_HOUSE_KONTAKT,
        "website": "https://www.bizi.si/CF-FITNESS-D-O-O/poslovne-enote/",
        "notes": "phase2_new; shape-house kontakt; CF FITNESS PE Jesenice on Bizi",
    },
]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_patch(row: dict, patch: dict) -> dict:
    r = deepcopy(row)
    notes_append = patch.pop("notes_append", None)
    for k, v in patch.items():
        if k == "notes":
            r["notes"] = (r.get("notes") or "") + "; " + v
        else:
            r[k] = v
    if notes_append:
        r["notes"] = (r.get("notes") or "") + "; " + notes_append
    r["chain_key"] = "shape_house"
    r["is_coming_soon"] = False
    r["is_closed"] = False
    r["is_active"] = True
    return r


def geocode_row(r: dict, cache: dict) -> None:
    if r.get("lat") is not None and r.get("lng") is not None:
        return
    if not r.get("address") or not r.get("city"):
        return
    q = ", ".join(
        x for x in [r["address"], r.get("postal_code"), r["city"], "Slovenia"] if x
    )
    hit = nominatim_geocode(q, "si", cache)
    if hit and hit.get("lat") is not None:
        lat, lng = float(hit["lat"]), float(hit["lng"])
        if in_slovenia(lat, lng):
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
            r["evidence"] = {
                **(r.get("evidence") or {}),
                "geocode_display": hit.get("display_name"),
            }
            npc = format_si_postal(str(hit.get("postcode") or ""))
            if npc and SLOVENIA_POSTAL_RE.match(npc):
                r["postal_code"] = npc


def classify_all(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        r = deepcopy(r)
        cat = classify_row(
            r,
            postal_re=SLOVENIA_POSTAL_RE,
            in_country=in_slovenia,
            format_postal=format_si_postal,
        )
        r["import_category"] = cat
        r["verification_status"] = "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        r["country"] = "Slovenia"
        out.append(r)
    return dedupe_by_id(out)


def ready_quality(ready: list[dict]) -> dict:
    details: dict[str, list] = {k: [] for k in [
        "duplicate_ids", "invalid_ready_postcodes", "missing_ready_fields",
        "invalid_ready_coords", "fallback_coords", "foreign_outliers", "mojibake",
    ]}
    ids = [r["id"] for r in ready]
    if len(ids) != len(set(ids)):
        details["duplicate_ids"] = [x for x in ids if ids.count(x) > 1]
    for r in ready:
        if not SLOVENIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            details["invalid_ready_postcodes"].append(r["id"])
        if not (r.get("name") and r.get("brand") and r.get("address") and r.get("city")):
            details["missing_ready_fields"].append(r["id"])
        lat, lng = r.get("lat"), r.get("lng")
        if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and in_slovenia(lat, lng)):
            details["invalid_ready_coords"].append(r["id"])
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            details["fallback_coords"].append(r["id"])
        blob = f"{r.get('name')} {r.get('address')} {r.get('city')}"
        if MOJIBAKE_RE.search(blob):
            details["mojibake"].append(r["id"])
    return {k: len(v) if isinstance(v, list) else v for k, v in {
        kk: (len(vv) if isinstance(vv, list) else vv) for kk, vv in details.items()
    }.items()} | {"detail": details}


def regional_table(ready: list[dict]) -> dict:
    majors = [
        "Ljubljana", "Maribor", "Celje", "Kranj", "Koper", "Novo mesto",
        "Velenje", "Nova Gorica", "Ptuj", "Murska Sobota", "Slovenj Gradec",
        "Domžale", "Kamnik", "Jesenice",
    ]
    counts = {}
    for c in majors:
        counts[c] = sum(
            1 for r in ready
            if r.get("city") == c or (c == "Ljubljana" and r.get("city") == "Ljubljana")
        )
    gaps = {
        "Velenje": "A_legitimate_no_chain_presence",
        "Nova Gorica": "A_legitimate_no_chain_presence",
        "Ptuj": "A_legitimate_no_chain_presence",
        "Slovenj Gradec": "A_legitimate_no_chain_presence",
    }
    if counts.get("Domžale", 0) == 0:
        gaps["Domžale"] = "C_unresolved_data"
    elif counts.get("Domžale", 0) > 0:
        gaps["Domžale"] = None
    if counts.get("Jesenice", 0) == 0:
        gaps["Jesenice"] = "C_unresolved_data"
    return {"counts": counts, "gap_classifications": {k: v for k, v in gaps.items() if v}}


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Slovenia_All_Discovered_Centers.xlsx"
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return
    headers = [
        "id", "brand", "name", "address", "city", "postal_code", "lat", "lng",
        "import_category", "coord_source", "discovery_class", "source_url", "notes",
    ]
    wb = Workbook()
    ws = wb.active
    ws.title = "Slovenia Discovered"
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in sorted(rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")):
        ws.append([r.get(h, "") for h in headers])
    wb.save(path)


def clever_fit_audit(rows: list[dict]) -> dict:
    sh = [r for r in rows if r.get("brand") == "Shape House" or r.get("chain_key") == "shape_house"]
    records = []
    for r in sh:
        records.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "address": r.get("address"),
            "city": r.get("city"),
            "postal_code": r.get("postal_code"),
            "phase2_status": r.get("import_category"),
            "coord_source": r.get("coord_source"),
        })
    ready = sum(1 for r in sh if r.get("import_category") == "READY_TO_IMPORT")
    coming = sum(1 for r in sh if r.get("import_category") == "COMING_SOON")
    return {
        "official_current": 18,
        "discovered": len(sh),
        "ready": ready,
        "coming_soon": coming,
        "records": records,
        "rebrand_note": "clever fit → Shape House (Basic-Fit acquisition, Feb 2026)",
        "verdict": "COMPLETE" if ready >= 18 and coming == 0 else "PARTIAL",
    }


def main() -> None:
    pre_sha = sha256_file(CENTERS)
    if pre_sha != PROD_SHA:
        raise SystemExit(f"Production SHA mismatch before Phase 2: {pre_sha}")

    staging_path = OUT / "slovenia_centers_staging.json"
    phase1_ready_path = OUT / "SLOVENIA_PHASE1_READY_TO_IMPORT.json"
    phase1_ids = {r["id"] for r in json.loads(phase1_ready_path.read_text())}

    rows = json.loads(staging_path.read_text())
    recovery_log: list[dict] = []
    by_id = {r["id"]: r for r in rows}

    # Apply recoveries
    for rid, patch in RECOVERIES_BY_ID.items():
        if rid not in by_id:
            continue
        prev = by_id[rid]["import_category"]
        by_id[rid] = apply_patch(by_id[rid], patch)
        recovery_log.append({
            "id": rid,
            "name": by_id[rid]["name"],
            "phase1_status": prev,
            "phase2_status": "pending_classify",
            "reason": "shape-house.com kontakt confirms open consumer studio",
            "evidence": patch.get("source_url"),
        })

    # Rebrand existing READY clever fit
    for rid, patch in REBRAND_READY.items():
        if rid not in by_id:
            continue
        prev_brand = by_id[rid].get("brand")
        by_id[rid] = apply_patch(by_id[rid], patch)
        recovery_log.append({
            "id": rid,
            "name": by_id[rid]["name"],
            "phase1_status": "READY_TO_IMPORT",
            "phase2_status": "READY_TO_IMPORT (rebrand)",
            "reason": f"consumer rebrand {prev_brand} → Shape House",
            "evidence": SHAPE_HOUSE_KONTAKT,
        })

    # Add new Shape House locations
    for loc in NEW_SHAPE_HOUSE:
        row = base_row(
            prefix="si_",
            country="Slovenia",
            brand="Shape House",
            name=loc["name"],
            address=loc["address"],
            postal_code=loc["postal_code"],
            city=loc["city"],
            source_url=loc["source_url"],
            notes=loc["notes"],
            chain_key="shape_house",
        )
        row["website"] = loc.get("website")
        by_id[row["id"]] = row
        recovery_log.append({
            "id": row["id"],
            "name": row["name"],
            "phase1_status": "not_staged",
            "phase2_status": "pending_classify",
            "reason": "new discovery on shape-house kontakt",
            "evidence": loc["source_url"],
        })

    rows = list(by_id.values())

    # Geocode Shape House rows missing coords
    cache_path = OUT / "slovenia_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    for r in rows:
        if r.get("brand") == "Shape House" or r.get("chain_key") == "shape_house":
            geocode_row(r, cache)
    write_json(cache_path, cache)

    rows = classify_all(rows)

    # Update recovery log with final statuses
    final_by_id = {r["id"]: r for r in rows}
    for entry in recovery_log:
        rid = entry["id"]
        if rid in final_by_id:
            entry["phase2_status"] = final_by_id[rid].get("import_category")

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    preserved = sum(1 for r in ready if r["id"] in phase1_ids)

    # Duplicate analysis
    same = proximity_pairs(ready, brand_only=True)
    all_p = proximity_pairs(ready, brand_only=False)
    dup_analysis = {
        "ready_count": len(ready),
        "same_brand": {k: same.get(k, []) for k in ("lt25", "lt50", "lt100", "lt200", "identical")},
        "different_brand_le_100m": all_p.get("lt100", []),
    }
    write_json(OUT / "slovenia_duplicate_analysis.json", dup_analysis)

    write_json(OUT / "slovenia_centers_staging.json", rows)
    write_json(OUT / "SLOVENIA_PHASE2_READY_TO_IMPORT.json", ready)

    geocode_review = [
        {
            "id": r.get("id"), "name": r.get("name"), "brand": r.get("brand"),
            "coord_source": r.get("coord_source"), "lat": r.get("lat"), "lng": r.get("lng"),
            "category": r.get("import_category"), "postal_code": r.get("postal_code"),
        }
        for r in rows
    ]
    write_json(OUT / "slovenia_geocode_review.json", geocode_review)

    cf_audit = clever_fit_audit(rows)
    write_json(PHASE2 / "clever_fit_estate_audit.json", cf_audit)
    write_json(PHASE2 / "recovery_summary.json", {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "phase1_ready_count": PHASE1_READY,
        "phase1_ready_preserved_in_final_ready": preserved,
        "recoveries": recovery_log,
    })

    rebrand_map = {
        "country": "Slovenia",
        "phase": 2,
        "maps": [
            {
                "predecessor": "clever fit",
                "successor": "Shape House",
                "evidence": "Basic-Fit acquisition; shape-house.com kontakt lists 18 SI studios Feb 2026",
                "production_decision": "import_as_shape_house",
            },
            {
                "predecessor": "FITINN Maribor Maribox (prej Kolosej)",
                "successor": "FITINN",
                "production_decision": "unchanged_from_phase1",
            },
            {
                "predecessor": "clever fit Ljubljana Bežigrad (PE label)",
                "successor": "Shape House Ljubljana Tiskarna",
                "evidence": "Consumer name Tiskarna Bežigrad on clever-fit privacy",
                "production_decision": "import_as_tiskarna",
            },
            {
                "predecessor": "clever fit Ljubljana Loberia (PE Celovška 520)",
                "successor": "Shape House Ljubljana Loberia (Celovška 522)",
                "evidence": "Loberia II retail complex; shape-house kontakt",
                "production_decision": "address_corrected_to_522",
            },
        ],
    }
    write_json(OUT / "SLOVENIA_PHASE2_REBRAND_MAP.json", rebrand_map)

    dq = ready_quality(ready)
    regional = regional_table(ready)
    statuses = dict(Counter(r.get("import_category") for r in rows))
    ready_brands = dict(Counter(r.get("brand") for r in ready))

    # Chain inventory update
    inv_path = OUT / "slovenia_chain_inventory.json"
    inventory = json.loads(inv_path.read_text()) if inv_path.exists() else {}
    inventory["phase"] = 2
    inventory["status_counts"] = statuses
    inventory["ready_by_brand"] = ready_brands
    inventory["shape_house"] = {
        "official_current": 18,
        "discovered": cf_audit["discovered"],
        "ready": cf_audit["ready"],
        "verdict": cf_audit["verdict"],
        "rebrand": "clever fit → Shape House",
    }
    inventory["fitinn_revalidation"] = {
        "official_current": 6, "ready": 6, "verdict": "COMPLETE",
        "notes": "fitinn.si SI section unchanged; no foreign contamination",
    }
    inventory["bodifit_revalidation"] = {
        "official_current": 8, "ready": 8, "verdict": "COMPLETE",
        "notes": "8 consumer centers unchanged",
    }
    inventory["sanity_pass"] = {
        "Millennium BTC": {"classification": "E", "note": "single sports complex Ljubljana"},
        "Konex": {"classification": "E", "note": "single sports center Ljubljana"},
        "Mega Center": {"classification": "D", "note": "mall operator not gym chain"},
        "Cube Fitness": {"classification": "E", "note": "single site Stegne 11"},
        "4P Fitness": {"classification": "E", "note": "still 2 sites"},
        "Fit13": {"classification": "E", "note": "still 2 sites"},
        "Alfa Gym": {"classification": "E", "note": "single site"},
        "Herkul Koroška": {"classification": "E", "note": "still 2 sites"},
    }
    write_json(inv_path, inventory)

    clean_dq = all(dq.get(k, 0) == 0 for k in [
        "duplicate_ids", "invalid_ready_postcodes", "missing_ready_fields",
        "invalid_ready_coords", "fallback_coords", "foreign_outliers", "mojibake",
    ])
    shape_complete = cf_audit["verdict"] == "COMPLETE"
    verdict = (
        "READY FOR SLOVENIA MERGE"
        if clean_dq and shape_complete and preserved == PHASE1_READY
        else "SLOVENIA PHASE 3 REQUIRED BEFORE MERGE"
    )

    report = {
        "country": "Slovenia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha": pre_sha,
        "phase1_ready": PHASE1_READY,
        "phase1_ready_preserved": preserved,
        "unique_staged": len(rows),
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": ready_brands,
        "data_quality": dq,
        "regional": regional,
        "projected_catalog_if_merged": PRODUCTION_TOTAL + len(ready),
        "clever_fit_audit": cf_audit,
        "verdict": verdict,
    }
    write_json(OUT / "SLOVENIA_PHASE2_READINESS_REPORT.json", report)

    md = f"""# SLOVENIA PHASE 2 READINESS REPORT

Generated: {report['generated_at']}

## Summary

| Metric | Value |
|--------|-------|
| Phase 1 READY preserved | {preserved}/{PHASE1_READY} |
| Unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| COMING_SOON | {statuses.get('COMING_SOON', 0)} |
| Projected catalog | {PRODUCTION_TOTAL + len(ready)} |

## READY by brand

{chr(10).join(f'- {b}: {c}' for b, c in sorted(ready_brands.items(), key=lambda x: -x[1]))}

## Shape House recovery

- Official current: 18
- READY: {cf_audit['ready']}
- Verdict: {cf_audit['verdict']}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    (OUT / "SLOVENIA_PHASE2_READINESS_REPORT.md").write_text(md)
    write_xlsx(rows)

    post_sha = sha256_file(CENTERS)
    if post_sha != PROD_SHA:
        raise SystemExit(f"Production modified during Phase 2: {post_sha}")

    print(f"Phase 2 complete: ready={len(ready)} preserved={preserved}/{PHASE1_READY} verdict={verdict}")


if __name__ == "__main__":
    main()
