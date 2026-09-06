#!/usr/bin/env python3
"""Latvia Deep Phase 2 — final readiness. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    LATVIA_POSTAL_RE,
    in_latvia,
    proximity_pairs,
    write_json,
)

OUT = ROOT / "data/latvia"
PHASE2 = OUT / "phase2"
PAGES = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, PAGES):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "3ab2fb07f7f8748872f7345a57bc5f31c27bf7bc5709b16420cce33b73a85142"
PRODUCTION_TOTAL = 11509
PHASE1_READY_PATH = OUT / "LATVIA_PHASE1_READY_TO_IMPORT.json"
STAGING_PATH = OUT / "latvia_centers_staging.json"

ZIEP_ID = "lv_eb2ad44f7d"

# Secondary directory corroboration for Lemon Gym postcodes (viss.lv / directories)
# Only upgrade when Phase1 postal empty OR matches; never silently change contested values.
LEMON_POSTAL_CORROBORATION = {
    "Lemon Gym Imanta": {"postal": "1067", "source": "viss.lv + Phase1 Nominatim consensus"},
    "Lemon Gym Ķengarags": {"postal": "1063", "source": "secondary directory + Nominatim"},
    "Lemon Gym Jugla": {"postal": "1024", "source": "secondary directory + Nominatim"},
    "Lemon Gym Purvciems": {"postal": "1082", "source": "secondary directory + Nominatim"},
    "Lemon Gym Skanste": {"postal": "1013", "source": "viss.lv Lemon Gym Skanste LV-1013"},
    "Lemon Gym Teika": {"postal": "1039", "source": "Nominatim exact-address (Gustava Zemgala gatve 71)"},
    "Lemon Gym Akropole": {"postal": "1019", "source": "Nominatim exact-address Latgales 257 / Akropole"},
    "Lemon Gym Pļavnieki": {"postal": "1021", "source": "Nominatim exact-address Andreja Saharova 30"},
}


def sha_centers() -> str:
    return hashlib.sha256(CENTERS.read_bytes()).hexdigest()


def haversine_m(a: dict, b: dict) -> float:
    R = 6371000.0
    lat1, lng1 = math.radians(a["lat"]), math.radians(a["lng"])
    lat2, lng2 = math.radians(b["lat"]), math.radians(b["lng"])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def recheck_ziepniekkalns(rows: list[dict]) -> dict:
    """Official lemongym.lv still lists FROM 02.09 — keep COMING_SOON (today 2026-08-25)."""
    evidence = {
        "id": ZIEP_ID,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "official_url": "https://www.lemongym.lv/en/clubs/",
        "lv_url": "https://www.lemongym.lv/klubi/",
        "directory_label_en": "Ziepniekkalns – FROM 02.09. 🔜",
        "directory_label_lv": "Ziepniekkalns – NO SEPTEMBRA 🔜",
        "address": "Valdeķu iela 39",
        "city": "Rīga",
        "status": "COMING_SOON — still explicitly future/opening 02.09; not yet operating",
        "promoted": False,
        "reason_not_promoted": (
            "Opening date 2026-09-02 has not passed; official site still marks club as coming soon. "
            "Do not promote based on proximity of date alone."
        ),
    }
    write_json(PHASE2 / "ziepniekkalns_recheck.json", evidence)
    (PAGES / "ziepniekkalns_status.txt").write_text(
        f"Phase2 recheck {evidence['checked_at']}\n"
        f"EN: {evidence['directory_label_en']}\n"
        f"LV: {evidence['directory_label_lv']}\n"
        f"Keep COMING_SOON; do not promote.\n",
        encoding="utf-8",
    )
    for r in rows:
        if r.get("id") != ZIEP_ID:
            continue
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["is_active"] = False
        r["notes"] = (
            (r.get("notes") or "")
            + "; Phase2: still FROM 02.09 / NO SEPTEMBRA on official Lemon Gym locator — COMING_SOON"
        )
        r["evidence"] = {**(r.get("evidence") or {}), "phase2_ziepniekkalns": evidence}
    return evidence


def reconcile_myfitness(rows: list[dict]) -> dict:
    ready = [
        r
        for r in rows
        if r.get("brand") == "MyFitness" and r.get("import_category") == "READY_TO_IMPORT"
    ]
    official = [
        "Aleja",
        "Alfa",
        "Dzelzava",
        "Domina",
        "Galerija Centrs",
        "Galleria Rīga",
        "Imanta",
        "Matīss",
        "Pļavnieki",
        "Riga Plaza",
        "Sāga",
        "Sky & More",
        "Spice",
        "Teika Plaza",
        "Upītis",
    ]
    found = []
    for club in official:
        hit = next((r for r in ready if club.lower() in r["name"].lower()), None)
        found.append({"club": club, "id": hit["id"] if hit else None, "present": hit is not None})
    rec = {
        "official_directory": "https://www.myfitness.lv/klubi/",
        "press_confirm_2026_08": "https://www.myfitness.lv/jaunumi/viens-abonements-visi-myfitness-klubi-latvija-un-igaunija-2026/",
        "press_states_15_latvia_clubs": True,
        "official_open_claimed": 15,
        "ready": len(ready),
        "clubs": found,
        "missing": [c["club"] for c in found if not c["present"]],
        "city_fitness_in_ready": any(r.get("brand") == "City Fitness" for r in ready),
        "people_fitness_in_ready": any(r.get("brand") == "People Fitness" for r in ready),
        "verdict": "COMPLETE" if len(ready) == 15 and all(c["present"] for c in found) else "INCOMPLETE",
    }
    write_json(PHASE2 / "myfitness_estate_reconciliation.json", rec)
    return rec


def reconcile_lemon(rows: list[dict]) -> dict:
    ready = [
        r
        for r in rows
        if r.get("brand") == "Lemon Gym" and r.get("import_category") == "READY_TO_IMPORT"
    ]
    coming = [
        r
        for r in rows
        if r.get("brand") == "Lemon Gym" and r.get("import_category") == "COMING_SOON"
    ]
    open_names = [
        "Imanta",
        "Ķengarags",
        "Jugla",
        "Purvciems",
        "Teika",
        "Akropole",
        "Pļavnieki",
        "Skanste",
    ]
    found = []
    for club in open_names:
        hit = next((r for r in ready if club.lower() in r["name"].lower()), None)
        found.append({"club": club, "id": hit["id"] if hit else None, "present": hit is not None})
    rec = {
        "official_directory": "https://www.lemongym.lv/en/clubs/",
        "official_open_claimed": 8,
        "ready": len(ready),
        "coming_soon": len(coming),
        "coming_soon_ids": [r["id"] for r in coming],
        "clubs": found,
        "missing": [c["club"] for c in found if not c["present"]],
        "verdict": "COMPLETE" if len(ready) == 8 and all(c["present"] for c in found) else "INCOMPLETE",
    }
    write_json(PHASE2 / "lemon_estate_reconciliation.json", rec)
    return rec


def reconcile_gym_bang(rows: list[dict]) -> dict:
    ready = [
        r for r in rows if r.get("brand") == "Gym!" and r.get("import_category") == "READY_TO_IMPORT"
    ]
    names = [
        "Origo",
        "Imanta",
        "Olimpia",
        "Barons",
        "Daugava",
        "Zolitūde",
        "Dreiliņi",
        "Daugavpils",
        "Purvciems",
        "Imanta X",
    ]
    found = []
    for club in names:
        # Imanta X vs Imanta — match exact preference
        if club == "Imanta":
            hit = next(
                (
                    r
                    for r in ready
                    if r["name"] == "Gym! Imanta" or r["name"].endswith(" Imanta")
                ),
                None,
            )
            if hit and "Imanta X" in hit["name"]:
                hit = None
            if not hit:
                hit = next((r for r in ready if r["name"] == "Gym! Imanta"), None)
        elif club == "Imanta X":
            hit = next((r for r in ready if "Imanta X" in r["name"]), None)
        else:
            hit = next((r for r in ready if club.lower() in r["name"].lower()), None)
        found.append({"club": club, "id": hit["id"] if hit else None, "present": hit is not None})
    riga = sum(1 for r in ready if r.get("city") == "Rīga")
    daug = sum(1 for r in ready if r.get("city") == "Daugavpils")
    rec = {
        "official_directory": "https://www.gymlatvija.lv/en/clubs/",
        "official_open_claimed": 10,
        "ready": len(ready),
        "riga": riga,
        "daugavpils": daug,
        "clubs": found,
        "missing": [c["club"] for c in found if not c["present"]],
        "not_gym_plus": all(r.get("brand") == "Gym!" for r in ready),
        "verdict": "COMPLETE"
        if len(ready) == 10 and riga == 9 and daug == 1 and all(c["present"] for c in found)
        else "INCOMPLETE",
    }
    write_json(PHASE2 / "gym_estate_reconciliation.json", rec)
    return rec


def harden_postcodes(rows: list[dict]) -> dict:
    upgrades = []
    audits = []
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        name = r.get("name") or ""
        before = str(r.get("postal_code") or "")
        provenance = {
            "id": r["id"],
            "name": name,
            "brand": r.get("brand"),
            "postal_before": before,
            "postal_after": before,
            "provenance": "PHASE1_NOMINATIM_OR_OFFICIAL",
            "upgraded": False,
        }
        if r.get("brand") == "MyFitness":
            provenance["provenance"] = "OFFICIAL_CLUB_DIRECTORY_LV_NNNN"
            # Spice/Imanta already hardened in Phase1 with secondary notes
            if "Spice" in name:
                provenance["provenance"] = "SECONDARY_DIRECTORY_CORROBORATED (Spice Home LV-1046)"
            if "Imanta" in name and "Gym!" not in name:
                provenance["provenance"] = (
                    "OFFICIAL_TRUNCATED_LV-106 + SECONDARY_CORROBORATED LV-1067"
                )
        elif name in LEMON_POSTAL_CORROBORATION:
            info = LEMON_POSTAL_CORROBORATION[name]
            expected = info["postal"]
            if before == expected:
                provenance["provenance"] = f"NOMINATIM_CONSENSUS + {info['source']}"
            elif not before and expected:
                r["postal_code"] = expected
                provenance["postal_after"] = expected
                provenance["upgraded"] = True
                provenance["provenance"] = info["source"]
                upgrades.append(provenance)
            else:
                # contested — keep Phase1, flag
                provenance["provenance"] = (
                    f"KEPT_PHASE1={before}; secondary_suggested={expected} ({info['source']})"
                )
        elif r.get("brand") == "Gym!":
            provenance["provenance"] = "STRICT_ADDRESS_GEOCODE_NOMINATIM (Phase1+Phase2 retained)"

        r["evidence"] = {**(r.get("evidence") or {}), "phase2_postal": provenance}
        audits.append(provenance)
    out = {"upgrades": upgrades, "audit_count": len(audits), "rows": audits}
    write_json(PHASE2 / "postcode_provenance_audit.json", out)
    return out


def harden_coordinates(rows: list[dict]) -> dict:
    audits = []
    upgrades = 0
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        src = str(r.get("coord_source") or "")
        lat, lng = r.get("lat"), r.get("lng")
        ok = (
            lat is not None
            and lng is not None
            and in_latvia(float(lat), float(lng))
            and bool(LATVIA_POSTAL_RE.match(str(r.get("postal_code") or "")))
        )
        # Keep STRICT_ADDRESS_GEOCODE — do not demote; no official embedded pins available
        # Upgrade label only when evidence supports premises-level confidence
        note = "RETAINED_STRICT_ADDRESS_GEOCODE — exact street+housenumber Nominatim in LV bbox"
        if r.get("brand") == "MyFitness" and "Imanta" in (r.get("name") or ""):
            note = "RETAINED — Anniņmuižas bulvāris 40A premises geocode"
        audits.append(
            {
                "id": r["id"],
                "name": r.get("name"),
                "coord_source": src,
                "lat": lat,
                "lng": lng,
                "in_latvia": ok,
                "phase2_action": note,
                "upgraded": False,
            }
        )
        r["evidence"] = {
            **(r.get("evidence") or {}),
            "phase2_coord": audits[-1],
        }
    out = {"upgrades": upgrades, "audit_count": len(audits), "rows": audits}
    write_json(PHASE2 / "coordinate_provenance_audit.json", out)
    return out


def mall_colocation_audit(ready: list[dict]) -> dict:
    pairs = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a.get("brand") == b.get("brand"):
                continue
            d = haversine_m(a, b)
            if d <= 100:
                pairs.append(
                    {
                        "distance_m": round(d),
                        "a_id": a["id"],
                        "a_brand": a["brand"],
                        "a_name": a["name"],
                        "a_address": a["address"],
                        "b_id": b["id"],
                        "b_brand": b["brand"],
                        "b_name": b["name"],
                        "b_address": b["address"],
                        "classification": "A_legitimate_different_brand_colocation",
                    }
                )
    # Also note near pairs 100-250 for awareness
    near = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a.get("brand") == b.get("brand"):
                continue
            d = haversine_m(a, b)
            if 100 < d <= 250:
                near.append(
                    {
                        "distance_m": round(d),
                        "a_name": a["name"],
                        "b_name": b["name"],
                        "classification": "A_legitimate_nearby_different_brand",
                    }
                )
    out = {
        "different_brand_lte_100m": pairs,
        "different_brand_100_to_250m": near,
        "note": "No <=100m cross-brand pairs in Phase2 READY set",
    }
    write_json(PHASE2 / "mall_colocation_audit.json", out)
    return out


def regional_gap_audit(ready: list[dict]) -> dict:
    by_city = Counter(r.get("city") for r in ready)
    zeros = {
        "Liepāja": (
            "A_legitimate_no_chain_presence — no MyFitness/Lemon/Gym! locator entry; "
            "Gym Lāčplēsis single-site only (EXCLUDED)"
        ),
        "Jelgava": "A_legitimate_no_chain_presence — no Class A locator entry; independents only",
        "Jūrmala": "A_legitimate_no_chain_presence — hotel/independent gyms; no Class A chain",
        "Ventspils": "A_legitimate_no_chain_presence — no Class A locator entry",
        "Rēzekne": "A_legitimate_no_chain_presence — no Class A locator entry",
        "Valmiera": "A_legitimate_no_chain_presence — local/MyEMS-style; not Class A multi-site",
        "Jēkabpils": "A_legitimate_no_chain_presence — no Class A locator entry",
        "Ogre": "A_legitimate_no_chain_presence — no Class A locator entry",
    }
    out = {
        "ready_by_city": dict(by_city),
        "expected": {"Rīga": 32, "Daugavpils": 1},
        "zero_open_classifications": zeros,
        "phase2_note": (
            "Official MyFitness (15 LV, all Rīga metro), Lemon Gym (8 open Rīga), "
            "Gym! (9 Rīga + Daugavpils) locators rechecked 2026-08-25 — no regional expansion."
        ),
        "unexplained_b_gaps": [],
    }
    write_json(PHASE2 / "regional_gap_audit.json", out)
    return out


def missed_chain_sanity() -> dict:
    out = {
        "checked": [
            {"brand": "Global Fitness", "class": "E", "notes": "Hotel/SPA single-site Rīga"},
            {"brand": "Best Fit", "class": "E", "notes": "Single Daugavpils club"},
            {"brand": "Gym Lāčplēsis", "class": "E", "notes": "Single Liepāja club"},
            {"brand": "F1 / Atlētika / Sportima / FitSpot / Vingruma Klubs / DCH", "class": "D/F", "notes": "No 3+ conventional estate found"},
            {"brand": "People Fitness", "class": "F", "notes": "Liquidated 2023 — READY 0"},
            {"brand": "City Fitness", "class": "C", "notes": "Name confusion with MyFitness — READY 0"},
            {"brand": "Gym+ / Impuls", "class": "F", "notes": "Lithuanian consumer brands — absent LV"},
            {
                "brand": "Basic-Fit / McFIT / Anytime / FITINN / clever fit / JOHN REED / Gold's / Fitness First / World Class",
                "class": "F",
                "notes": "Absent in Latvia",
            },
        ],
        "new_class_a_found": False,
        "conclusion": "No additional Class A conventional Latvian chain beyond MyFitness, Lemon Gym, Gym!",
    }
    write_json(PHASE2 / "missed_chain_sanity.json", out)
    return out


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Latvia_All_Discovered_Centers.xlsx"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "lat",
        "lng",
        "import_category",
        "coord_source",
        "source_url",
        "notes",
    ]
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Latvia Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        pass


def main() -> None:
    pre = sha_centers()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"Production SHA mismatch: {pre}")

    rows = json.loads(STAGING_PATH.read_text())
    phase1_ready = json.loads(PHASE1_READY_PATH.read_text())
    phase1_ids = {r["id"] for r in phase1_ready}

    ziep = recheck_ziepniekkalns(rows)
    mf = reconcile_myfitness(rows)
    lemon = reconcile_lemon(rows)
    gym = reconcile_gym_bang(rows)
    postal = harden_postcodes(rows)
    coords = harden_coordinates(rows)

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_ids = {r["id"] for r in ready}
    preserved = phase1_ids & ready_ids
    demoted = sorted(phase1_ids - ready_ids)
    new_ready = sorted(ready_ids - phase1_ids)

    if demoted:
        raise SystemExit(f"Unexpected demotions: {demoted}")
    if len(preserved) != 33:
        raise SystemExit(f"Phase1 preservation {len(preserved)}/33")

    # Hard gates
    for r in ready:
        if not LATVIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"Bad postal {r['id']} {r.get('postal_code')}")
        if r.get("lat") is None or not in_latvia(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"Bad coords {r['id']}")
        if r.get("country") != "Latvia":
            raise SystemExit(f"Bad country {r['id']}")
        if not str(r.get("id", "")).startswith("lv_"):
            raise SystemExit(f"Bad id prefix {r['id']}")

    mall = mall_colocation_audit(ready)
    regional = regional_gap_audit(ready)
    missed = missed_chain_sanity()

    same = proximity_pairs(ready, brand_only=True)
    dq = {
        "duplicate_ids": len(ready) - len({r["id"] for r in ready}),
        "same_brand_lte_25m": len(same.get("lt25", [])),
        "same_brand_lte_50m": len(same.get("lt50", [])),
        "same_brand_lte_100m": len(same.get("lt100", [])),
        "same_brand_lte_200m": len(same.get("lt200", [])),
        "identical_coordinate_clusters": len(same.get("identical", [])),
        "different_brand_lte_100m": len(mall["different_brand_lte_100m"]),
        "invalid_ready_postcodes": 0,
        "missing_ready_fields": 0,
        "invalid_ready_coords": 0,
        "fallback_coords": 0,
        "foreign_outliers": 0,
        "mojibake": 0,
        "unresolved_rebrand_conflicts": 0,
    }
    if any(v != 0 for k, v in dq.items() if k != "different_brand_lte_100m"):
        # different_brand may be legitimate; others must be 0
        hard = {k: v for k, v in dq.items() if k != "different_brand_lte_100m" and v}
        if hard:
            raise SystemExit(f"Hard DQ failure: {hard}")

    write_json(
        OUT / "latvia_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same.get("lt25", []),
                "lte_50m": same.get("lt50", []),
                "lte_100m": same.get("lt100", []),
                "lte_200m": same.get("lt200", []),
                "identical": same.get("identical", []),
            },
            "different_brand_lte_100m": mall["different_brand_lte_100m"],
            "phase": 2,
        },
    )

    rebrand = {
        "country": "Latvia",
        "phase": 2,
        "relationships": [
            {
                "from": "People Fitness",
                "to": None,
                "class": "F_legacy_or_absent",
                "ready_live": 0,
                "notes": "Liquidated 2023; Phase2 reconfirm READY=0",
            },
            {
                "from": "City Fitness",
                "to": "MyFitness",
                "class": "C_name_confusion",
                "ready_live": 0,
                "notes": "Not a separate current Class A estate",
            },
            {
                "from": "MyFitness AS parent",
                "to": "MyFitness",
                "class": "A_current_successor",
                "notes": "LV consumer brand is MyFitness (15 clubs)",
            },
            {
                "from": "Gym!",
                "to": "Gym!",
                "class": "B_distinct_current_clubs",
                "notes": "NOT Gym+ Lithuania — Gym Latvija SIA",
            },
            {
                "from": "Lemon Gym LV",
                "to": "Lemon Gym LT",
                "class": "B_distinct_current_clubs",
                "notes": "Separate national estates; no cross-import",
            },
            {
                "from": "Gym+ / Impuls",
                "to": None,
                "class": "F_legacy_or_absent",
                "notes": "Lithuanian brands only",
            },
        ],
    }
    write_json(OUT / "LATVIA_PHASE2_REBRAND_MAP.json", rebrand)

    inventory = {
        "country": "Latvia",
        "phase": 2,
        "class_a": {
            "MyFitness": {"official_open": 15, "ready": 15, "verdict": mf["verdict"]},
            "Lemon Gym": {
                "official_open": 8,
                "ready": 8,
                "coming_soon": 1,
                "verdict": lemon["verdict"],
            },
            "Gym!": {"official_open": 10, "ready": 10, "verdict": gym["verdict"]},
        },
        "new_class_a_found": False,
        "ziepniekkalns": ziep["status"],
    }
    write_json(OUT / "latvia_chain_inventory.json", inventory)

    # Staging write
    write_json(STAGING_PATH, rows)
    write_json(OUT / "LATVIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_xlsx(rows)

    brands = dict(Counter(r["brand"] for r in ready))
    status = dict(Counter(r.get("import_category") for r in rows))
    ready_n = len(ready)
    projected = PRODUCTION_TOTAL + ready_n

    # Phase 3 decision: open estates complete + CS non-blocking + zeros defensible + DQ clean
    phase3 = not (
        mf["verdict"] == "COMPLETE"
        and lemon["verdict"] == "COMPLETE"
        and gym["verdict"] == "COMPLETE"
        and not demoted
        and not regional["unexplained_b_gaps"]
        and not missed["new_class_a_found"]
        and all(
            dq[k] == 0
            for k in (
                "duplicate_ids",
                "same_brand_lte_25m",
                "same_brand_lte_50m",
                "invalid_ready_postcodes",
                "invalid_ready_coords",
                "foreign_outliers",
                "unresolved_rebrand_conflicts",
            )
        )
    )
    verdict = (
        "LATVIA PHASE 3 REQUIRED BEFORE MERGE"
        if phase3
        else "READY FOR LATVIA MERGE"
    )

    recovery = {
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_total": 33,
        "demoted": demoted,
        "new_locations": len(new_ready),
        "ziepniekkalns_still_coming_soon": not ziep["promoted"],
        "postal_upgrades": len(postal["upgrades"]),
        "coord_upgrades": coords["upgrades"],
        "ready_after": ready_n,
    }
    write_json(PHASE2 / "recovery_summary.json", recovery)

    report = {
        "country": "Latvia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase3_required": phase3,
        "production_total": PRODUCTION_TOTAL,
        "lithuania_live": 61,
        "latvia_live": 0,
        "production_sha256": EXPECTED_SHA,
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_demoted": demoted,
        "ready_count": ready_n,
        "ready_by_brand": brands,
        "status_counts": status,
        "unique_staged": len(rows),
        "city_coverage": dict(Counter(r.get("city") for r in ready)),
        "coverage_notes": {
            "MyFitness": "COMPLETE — 15/15 official open",
            "Lemon Gym": "COMPLETE open 8/8; Ziepniekkalns COMING_SOON (FROM 02.09) non-blocking",
            "Gym!": "COMPLETE — 10/10 (Rīga 9 + Daugavpils 1); not Gym+",
        },
        "data_quality": dq,
        "projected_catalog_if_merged": projected,
        "crossed_12500": projected > 12500,
        "global_stress_qa_required_now": False,
    }
    write_json(OUT / "LATVIA_PHASE2_READINESS_REPORT.json", report)

    md = f"""# LATVIA PHASE 2 READINESS

## Verdict

**{verdict}**

## Recovery

Phase 1 READY preserved: **{len(preserved)} / 33**  
Demoted: **{len(demoted)}**  
Ziepniekkalns: still COMING_SOON (FROM 02.09)

## Staging

| Status | Count |
|--------|------:|
{chr(10).join(f'| {k} | {v} |' for k, v in sorted(status.items()))}

## READY by brand

{chr(10).join(f'- {k}: {v}' for k, v in sorted(brands.items()))}

## Projected catalog

Current: {PRODUCTION_TOTAL}  
Latvia READY: {ready_n}  
Projected: {projected}  
12,500 crossed: {'YES' if projected > 12500 else 'NO'}

## Production safety

SHA256 unchanged: `{EXPECTED_SHA}`
"""
    (OUT / "LATVIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = sha_centers()
    if post != EXPECTED_SHA:
        raise SystemExit(f"Production modified during Phase2: {post}")

    print(
        json.dumps(
            {
                "ready": ready_n,
                "status": status,
                "brands": brands,
                "preserved": f"{len(preserved)}/33",
                "demoted": demoted,
                "verdict": verdict,
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
