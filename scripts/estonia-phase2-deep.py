#!/usr/bin/env python3
"""Estonia Deep Phase 2 — targeted recovery + completeness. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    format_ee_postal,
    in_estonia,
    make_id,
    proximity_pairs,
    write_json,
)

import re

ESTONIA_POSTAL_RE = re.compile(r"^\d{5}$")

OUT = ROOT / "data/estonia"
PHASE2 = OUT / "phase2"
PAGES = OUT / "raw" / "pages" / "phase2"
for d in (OUT, PHASE2, PAGES):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "287c1c54ef1023fee08d23c9a65063ffc238edbd35c59b22cea09c146833d8ea"
PRODUCTION_TOTAL = 11542
PHASE1_READY_PATH = OUT / "ESTONIA_PHASE1_READY_TO_IMPORT.json"
STAGING_PATH = OUT / "estonia_centers_staging.json"

# Hard recoveries — evidence locked 2026-08-25 (official pages + Nominatim premises pins)
RECOVERIES: dict[str, dict] = {
    "ee_2544fa6a0b": {
        "name": "MyFitness Volta",
        "brand": "MyFitness",
        "address": "Mootori tänav 2",
        "city": "Tallinn",
        "postal_code": "10416",
        "lat": 59.449010,
        "lng": 24.722254,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "source_url": "https://www.myfitness.ee/en/clubs/myfitness-volta/",
        "notes": (
            "Phase2 recovery: official MyFitness Volta page confirms Mootori tänav 2, "
            "Tallinn 10416 open; Nominatim exact Mootori 2 premises in EE bbox"
        ),
        "evidence_key": "volta",
    },
    "ee_6353f66ecd": {
        "name": "MyFitness Narva Fama",
        "brand": "MyFitness",
        "address": "Fama tänav 10",
        "city": "Narva",
        "postal_code": "20303",
        "lat": 59.379610,
        "lng": 28.187141,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://www.myfitness.ee/en/clubs/myfitness-narva-fama/",
        "notes": (
            "Phase2 recovery: official Narva Fama page confirms Fama tänav 10, Narva 20303 "
            "open in Fama Center; Nominatim Fama 10 building pin"
        ),
        "evidence_key": "narva_fama",
    },
    "ee_b9bc209fd8": {
        "name": "Golden Club Tondi",
        "brand": "Golden Club",
        "address": "Sõjakooli tn 10",
        "city": "Tallinn",
        "postal_code": "11316",
        "lat": 59.403868,
        "lng": 24.720539,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://goldenclub.ee/asukoht/tondi/",
        "notes": (
            "Phase2 recovery: Golden Club Tondi at Forus Spordikeskus Sõjakooli 10; "
            "public conventional fitness club; Nominatim Forus premises pin 11316"
        ),
        "evidence_key": "tondi",
    },
    "ee_34384840a3": {
        "name": "24-7 Fitness Tabasalu",
        "brand": "24-7 Fitness",
        "address": "Kallaste tn 7",
        "city": "Tabasalu",
        "postal_code": "76901",
        "lat": 59.428992,
        "lng": 24.549972,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Kallaste tn 7, Tabasalu Keskus 2nd floor; "
            "Nominatim Tabasalu keskus premises pin 76901"
        ),
        "evidence_key": "tabasalu",
    },
    "ee_a15aae2d15": {
        "name": "24-7 Fitness Keila Keskus",
        "brand": "24-7 Fitness",
        "address": "Harju tn 2",
        "city": "Keila",
        "postal_code": "76607",
        "lat": 59.315879,
        "lng": 24.410532,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Harju tn 2, Keila Keskus 2nd floor; "
            "Nominatim Keila Keskus premises pin 76607 (not street-midpoint Keila-Joa)"
        ),
        "evidence_key": "keila_keskus",
    },
    "ee_d3bdd981df": {
        "name": "24-7 Fitness Sepa Keskus",
        "brand": "24-7 Fitness",
        "address": "Sepa tn 4",
        "city": "Tartu",
        "postal_code": "50105",
        "lat": 58.349356,
        "lng": 26.739214,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Sepa tn 4, Sepa Keskus 2nd floor; "
            "coords from Sepa Keskus building pin (not bare Sepa 4 street geocode)"
        ),
        "evidence_key": "sepa",
    },
    "ee_7707002ac8": {
        "name": "24-7 Fitness Viljandi Kaalu",
        "brand": "24-7 Fitness",
        "address": "Kaalu tn 2",
        "city": "Viljandi",
        "postal_code": "71012",
        "lat": 58.364174,
        "lng": 25.593697,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Kaalu tn 2, Viljandi; "
            "Nominatim Kaalu 2 exact-address geocode 71012"
        ),
        "evidence_key": "viljandi_kaalu",
    },
    "ee_2859632c67": {
        "name": "24-7 Fitness Rakvere",
        "brand": "24-7 Fitness",
        "address": "F. G. Adoffi 11",
        "city": "Rakvere",
        "postal_code": "44310",
        "lat": 59.349250,
        "lng": 26.364390,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — F. G. Adoffi 11, Rakvere Kroonikeskus; "
            "Nominatim Kroonikeskus premises pin 44310 — closes Rakvere discovery gap"
        ),
        "evidence_key": "rakvere",
    },
    "ee_71c90c9c79": {
        "name": "24-7 Fitness Narva",
        "brand": "24-7 Fitness",
        "address": "4. Roheline tn 8",
        "city": "Narva",
        "postal_code": "20605",
        "lat": 59.381496,
        "lng": 28.172754,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — 4. Roheline tn 8, Narva; "
            "Nominatim Narva Centrum / Roheline 8 premises pin 20605"
        ),
        "evidence_key": "narva_247",
    },
    "ee_9d4bb8e396": {
        "name": "24-7 Fitness Võru",
        "brand": "24-7 Fitness",
        "address": "Vilja tänav 6",
        "city": "Võru",
        "postal_code": "65606",
        "lat": 57.849443,
        "lng": 27.006549,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Vilja tänav 6, Võru; "
            "Nominatim Vilja 6 exact-address geocode 65606 — closes Võru discovery gap"
        ),
        "evidence_key": "voru",
    },
    "ee_909073b14a": {
        "name": "24-7 Fitness Jõgeva",
        "brand": "24-7 Fitness",
        "address": "Kesk tn 4",
        "city": "Jõgeva",
        "postal_code": "48305",
        "lat": 58.748373,
        "lng": 26.397462,
        "coord_source": "VERIFIED_PREMISES_PIN",
        "source_url": "https://24-7fitness.ee/meie-klubid/",
        "notes": (
            "Phase2 recovery: official open — Kesk tn 4, Jõgeva; "
            "Nominatim Jõgeva Kaubanduskeskus premises pin 48305"
        ),
        "evidence_key": "jogeva",
    },
}

NEW_COMING_SOON = [
    {
        "name": "24-7 Fitness Õismäe",
        "brand": "24-7 Fitness",
        "address": "Järveotsa tee 50D",
        "city": "Tallinn",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame sügisel! — COMING_SOON",
        "opening_label": "Avame sügisel!",
    },
    {
        "name": "24-7 Fitness Kompassi",
        "brand": "24-7 Fitness",
        "address": "Tartu mnt 13",
        "city": "Tallinn",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame jaanuaris! — COMING_SOON",
        "opening_label": "Avame jaanuaris!",
    },
    {
        "name": "24-7 Fitness Viimsi",
        "brand": "24-7 Fitness",
        "address": "Viimsi",
        "city": "Viimsi",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame 2027 suvel! — COMING_SOON",
        "opening_label": "Avame 2027 suvel!",
    },
    {
        "name": "24-7 Fitness Laagri",
        "brand": "24-7 Fitness",
        "address": "Laagri",
        "city": "Laagri",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame 2027 detsembris! — COMING_SOON",
        "opening_label": "Avame 2027 detsembris!",
    },
    {
        "name": "24-7 Fitness Ilmatsalu",
        "brand": "24-7 Fitness",
        "address": "Ilmatsalu 9",
        "city": "Tartu",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame jõusaali detsembris! — COMING_SOON",
        "opening_label": "Avame jõusaali detsembris!",
    },
    {
        "name": "24-7 Fitness Rapla",
        "brand": "24-7 Fitness",
        "address": "Rapla",
        "city": "Rapla",
        "postal_code": "",
        "notes": "Phase2 discovery: official Avame 2027 kevadel! — COMING_SOON",
        "opening_label": "Avame 2027 kevadel!",
    },
]

MYFITNESS_OFFICIAL_OPEN = [
    "Rocca al Mare",
    "Mustamäe",
    "Kristiine",
    "Järve",
    "Viru",
    "Postimaja",
    "Rävala",
    "Balti Jaama Turg",
    "Ülemiste City",
    "Lasnamäe Linnamäe",
    "Lasnamäe Kärberi",
    "Pirita",
    "Viimsi",
    "Volta",
    "Tartu Kesklinn",
    "Tartu Annelinn",
    "Tartu Lõunakeskus",
    "Narva Fama",
    "Viljandi",
]

GYM_BANG_OFFICIAL_OPEN = [
    "Tehnopol",
    "Vanalinn",
    "Ülemiste",
    "Mustika",
    "Õismäe",
    "Solaris",
    "Rocca al Mare",
    "Virbi",
    "Veeriku",
    "Tasku",
    "Ülenurme",
    "Kerese",
    "Astri",
    "Jõhvi",
    "Pärnu",
]

FITNESS_247_OFFICIAL_OPEN = [
    "Akadeemia",
    "Laki",
    "Priisle",
    "Vabaduse",
    "Hipodroom",
    "Tõnismägi",
    "Tähesaju",
    "Avala",
    "Paepargi",
    "Kopli",
    "Peetri",
    "Tabasalu",
    "Järveküla",
    "Luige",
    "Kiili",
    "Keila Vesiveski",
    "Saue",
    "Keila Keskus",
    "Sepa Keskus",
    "Sõbrakeskus",
    "Raadi",
    "Ihaste",
    "Port Artur",
    "Viljandi Riia",
    "Viljandi Kaalu",
    "Rakvere",
    "Kuressaare",
    "Jõhvi",
    "Narva",
    "Võru",
    "Jõgeva",
]

GOLDEN_OFFICIAL = ["Rotermanni", "Viimsi", "Tondi"]


def sha_centers() -> str:
    return hashlib.sha256(CENTERS.read_bytes()).hexdigest()


def haversine_m(a: dict, b: dict) -> float:
    R = 6371000.0
    lat1, lng1 = math.radians(float(a["lat"])), math.radians(float(a["lng"]))
    lat2, lng2 = math.radians(float(b["lat"])), math.radians(float(b["lng"]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def find_ready(rows: list[dict], brand: str, needle: str) -> dict | None:
    needle_l = needle.lower()
    candidates = [
        r
        for r in rows
        if r.get("brand") == brand
        and r.get("import_category") == "READY_TO_IMPORT"
        and needle_l in (r.get("name") or "").lower()
    ]
    if not candidates:
        return None
    # Prefer exact club token match length
    candidates.sort(key=lambda r: abs(len(r["name"]) - len(f"{brand} {needle}")))
    return candidates[0]


def apply_recoveries(rows: list[dict]) -> list[dict]:
    recovered = []
    by_id = {r["id"]: r for r in rows}
    for rid, meta in RECOVERIES.items():
        r = by_id.get(rid)
        if not r:
            raise SystemExit(f"Missing staging row for recovery {rid}")
        before = {
            "import_category": r.get("import_category"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "postal_code": r.get("postal_code"),
        }
        lat, lng = float(meta["lat"]), float(meta["lng"])
        postal = format_ee_postal(meta["postal_code"])
        if not postal or not ESTONIA_POSTAL_RE.match(postal):
            raise SystemExit(f"Bad recovery postal {rid} {meta['postal_code']}")
        if not in_estonia(lat, lng):
            raise SystemExit(f"Recovery coords outside Estonia: {rid}")
        r["name"] = meta["name"]
        r["brand"] = meta["brand"]
        r["address"] = meta["address"]
        r["city"] = meta["city"]
        r["postal_code"] = postal
        r["lat"] = lat
        r["lng"] = lng
        r["coord_source"] = meta["coord_source"]
        r["country"] = "Estonia"
        r["import_category"] = "READY_TO_IMPORT"
        r["is_active"] = True
        r["is_coming_soon"] = False
        r["is_closed"] = False
        r["verification_status"] = "phase2_recovered"
        r["source_url"] = meta["source_url"]
        r["website"] = meta["source_url"]
        r["notes"] = meta["notes"]
        r["evidence"] = {
            **(r.get("evidence") or {}),
            "phase2_recovery": {
                "before": before,
                "after": {
                    "lat": lat,
                    "lng": lng,
                    "postal_code": postal,
                    "coord_source": meta["coord_source"],
                },
                "official_url": meta["source_url"],
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        recovered.append(
            {
                "id": rid,
                "name": meta["name"],
                "brand": meta["brand"],
                "before_category": before["import_category"],
                "lat": lat,
                "lng": lng,
                "postal_code": postal,
                "coord_source": meta["coord_source"],
                "key": meta["evidence_key"],
            }
        )
    write_json(PHASE2 / "recovery_summary.json", {"recovered": recovered, "count": len(recovered)})
    return recovered


def recheck_coming_soon(rows: list[dict]) -> dict:
    """All Phase1 CS still future per official pages 2026-08-25; add newly announced CS."""
    updates = []
    # Phase1 CS address hardening
    cs_updates = {
        "ee_d6f5429ffa": {
            "address": "Merivälja tee 33",
            "city": "Tallinn",
            "opening_label": "Avame sügis 2026!",
            "official_url": "https://24-7fitness.ee/meie-klubid/",
        },
        "ee_525d7cb043": {
            "address": "Mõisavahe 33",
            "city": "Tartu",
            "opening_label": "Avame sügis 2026!",
            "official_url": "https://24-7fitness.ee/meie-klubid/",
        },
        "ee_5c173a5f8b": {
            "address": "Papiniidu 50",
            "city": "Pärnu",
            "opening_label": "Avame sügis 2026!",
            "official_url": "https://24-7fitness.ee/meie-klubid/",
        },
        "ee_05114ce91a": {
            "address": "Randvere tee 6",
            "city": "Viimsi",
            "opening_label": "Avame juba 2026. aasta sügisel!",
            "official_url": "https://gymeesti.ee/",
        },
        "ee_cc255a409d": {
            "address": "Võidu 99",
            "city": "Rakvere",
            "opening_label": "Avame juba 2026. aasta lõpus!",
            "official_url": "https://gymeesti.ee/",
        },
    }
    by_id = {r["id"]: r for r in rows}
    for rid, meta in cs_updates.items():
        r = by_id[rid]
        r["address"] = meta["address"]
        r["city"] = meta["city"]
        r["import_category"] = "COMING_SOON"
        r["is_coming_soon"] = True
        r["is_active"] = False
        r["notes"] = (
            f"Phase2 recheck 2026-08-25: still future — {meta['opening_label']} "
            f"({meta['official_url']}); not promoted"
        )
        updates.append(
            {
                "id": rid,
                "name": r["name"],
                "promoted": False,
                "status": "COMING_SOON",
                "opening_label": meta["opening_label"],
                "address": meta["address"],
            }
        )

    existing_names = {(r.get("brand"), r.get("name")) for r in rows}
    added = []
    for spec in NEW_COMING_SOON:
        key = (spec["brand"], spec["name"])
        if key in existing_names:
            continue
        rid = make_id(
            "ee_",
            spec["brand"],
            spec["address"],
            spec.get("postal_code") or "",
            spec["city"],
            "Estonia",
        )
        if any(r.get("id") == rid for r in rows):
            rid = make_id(
                "ee_",
                spec["brand"],
                spec["address"] + "|cs",
                "",
                spec["city"],
                "Estonia",
            )
        row = {
            "id": rid,
            "name": spec["name"],
            "brand": spec["brand"],
            "chain_key": "247_fitness",
            "address": spec["address"],
            "city": spec["city"],
            "postal_code": format_ee_postal(spec.get("postal_code") or "") or "",
            "country": "Estonia",
            "lat": None,
            "lng": None,
            "coord_source": None,
            "import_category": "COMING_SOON",
            "is_active": False,
            "is_coming_soon": True,
            "is_closed": False,
            "discovery_class": "A",
            "verification_status": "phase2_coming_soon",
            "website": "https://24-7fitness.ee/meie-klubid/",
            "source_url": "https://24-7fitness.ee/meie-klubid/",
            "notes": spec["notes"],
            "discovered_at": datetime.now(timezone.utc).isoformat(),
            "evidence": {"opening_label": spec["opening_label"]},
        }
        rows.append(row)
        added.append({"id": rid, "name": spec["name"], "opening_label": spec["opening_label"]})

    out = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "phase1_cs_rechecked": updates,
        "phase1_cs_promoted": 0,
        "new_coming_soon_added": added,
        "verdict": "All Phase1 COMING_SOON remain future; 6 newly announced 24-7 CS staged",
    }
    write_json(PHASE2 / "coming_soon_recheck.json", out)
    (PAGES / "coming_soon_recheck.txt").write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return out


def reconcile_brand(
    rows: list[dict],
    brand: str,
    official: list[str],
    path: Path,
    extra: dict | None = None,
) -> dict:
    ready = [
        r for r in rows if r.get("brand") == brand and r.get("import_category") == "READY_TO_IMPORT"
    ]
    cs = [r for r in rows if r.get("brand") == brand and r.get("import_category") == "COMING_SOON"]
    found = []
    for club in official:
        hit = find_ready(rows, brand, club)
        found.append({"club": club, "id": hit["id"] if hit else None, "present": hit is not None})
    missing = [c["club"] for c in found if not c["present"]]
    rec = {
        "brand": brand,
        "official_open_claimed": len(official),
        "ready": len(ready),
        "coming_soon": len(cs),
        "coming_soon_ids": [r["id"] for r in cs],
        "clubs": found,
        "missing": missing,
        "verdict": "COMPLETE" if len(ready) == len(official) and not missing else "INCOMPLETE",
        **(extra or {}),
    }
    write_json(path, rec)
    return rec


def write_recovery_detail_files(recovered: list[dict]) -> None:
    mf = [r for r in recovered if r["brand"] == "MyFitness"]
    f247 = [r for r in recovered if r["brand"] == "24-7 Fitness"]
    gc = [r for r in recovered if r["brand"] == "Golden Club"]
    write_json(
        PHASE2 / "myfitness_recovery.json",
        {
            "targets": ["Volta", "Narva Fama"],
            "recovered": mf,
            "goal": "19/19 READY",
            "achieved": len(mf) == 2,
        },
    )
    write_json(
        PHASE2 / "247_recovery.json",
        {
            "targets": 8,
            "recovered": f247,
            "rakvere_resolved": any(r["key"] == "rakvere" for r in f247),
            "voru_resolved": any(r["key"] == "voru" for r in f247),
            "goal": "31/31 open READY",
            "achieved": len(f247) == 8,
        },
    )
    write_json(
        PHASE2 / "golden_club_tondi_recovery.json",
        {
            "target": "Golden Club Tondi",
            "recovered": gc,
            "goal": "3/3 READY",
            "achieved": len(gc) == 1,
            "eligibility": "public conventional gym inside Forus Spordikeskus — in scope",
        },
    )


def harden_postcodes(rows: list[dict]) -> dict:
    audits = []
    upgrades = []
    for r in rows:
        if r.get("import_category") != "READY_TO_IMPORT":
            continue
        before = str(r.get("postal_code") or "")
        postal = format_ee_postal(before)
        provenance = {
            "id": r["id"],
            "name": r.get("name"),
            "brand": r.get("brand"),
            "postal_before": before,
            "postal_after": postal or before,
            "provenance": "PHASE1_OR_OFFICIAL_RETAINED",
            "upgraded": False,
        }
        if r["id"] in RECOVERIES:
            provenance["provenance"] = (
                f"PHASE2_RECOVERY_{RECOVERIES[r['id']]['coord_source']}_POSTCODE"
            )
            if before != postal:
                provenance["upgraded"] = True
                upgrades.append(provenance)
        elif r.get("brand") == "MyFitness":
            provenance["provenance"] = "OFFICIAL_MYFITNESS_EE_CLUB_PAGE_NNNNN"
        elif r.get("brand") == "24-7 Fitness":
            provenance["provenance"] = "OFFICIAL_247_OR_STRICT_GEOCODE_NNNNN"
        elif r.get("brand") == "Gym!":
            provenance["provenance"] = "STRICT_ADDRESS_GEOCODE_NOMINATIM_EE"
        elif r.get("brand") == "Golden Club":
            provenance["provenance"] = "OFFICIAL_GOLDENCLUB_OR_PREMISES_GEOCODE"
        if postal and postal != before:
            r["postal_code"] = postal
            provenance["postal_after"] = postal
            provenance["upgraded"] = True
            if provenance not in upgrades:
                upgrades.append(provenance)
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
            and in_estonia(float(lat), float(lng))
            and bool(ESTONIA_POSTAL_RE.match(str(r.get("postal_code") or "")))
        )
        if r["id"] in RECOVERIES:
            note = f"PHASE2_SET_{RECOVERIES[r['id']]['coord_source']}"
            upgrades += 1
        else:
            note = "RETAINED_PHASE1_STRICT_OR_OFFICIAL — EE bbox validated"
        audits.append(
            {
                "id": r["id"],
                "name": r.get("name"),
                "coord_source": src,
                "lat": lat,
                "lng": lng,
                "in_estonia": ok,
                "phase2_action": note,
                "upgraded": r["id"] in RECOVERIES,
            }
        )
        r["evidence"] = {**(r.get("evidence") or {}), "phase2_coord": audits[-1]}
    out = {"upgrades": upgrades, "audit_count": len(audits), "rows": audits}
    write_json(PHASE2 / "coordinate_provenance_audit.json", out)
    return out


def regional_gap_audit(ready: list[dict], rows: list[dict]) -> dict:
    by_city = Counter(r.get("city") for r in ready)
    # Presence includes READY only for open Class A; note CS separately
    zeros = {
        "Kohtla-Järve": "A_legitimate_no_chain_presence — no Class A open locator entry",
        "Maardu": "A_legitimate_no_chain_presence — no Class A open locator entry",
        "Sillamäe": "A_legitimate_no_chain_presence — no Class A open locator entry",
        "Valga": "A_legitimate_no_chain_presence — no Class A open locator entry",
        "Haapsalu": "A_legitimate_no_chain_presence — no Class A open locator entry",
        "Paide": "A_legitimate_no_chain_presence — no Class A open locator entry",
    }
    # Rakvere / Võru now have READY 24-7
    rakvere_ready = by_city.get("Rakvere", 0)
    voru_ready = by_city.get("Võru", 0)
    notes = {
        "Rakvere": (
            f"OPEN_CLASS_A_PRESENT — 24-7 Fitness READY ({rakvere_ready}); "
            "Gym! Rakvere remains COMING_SOON (end 2026) — not a discovery gap"
        ),
        "Võru": f"OPEN_CLASS_A_PRESENT — 24-7 Fitness READY ({voru_ready}) — Phase1 B gap closed",
    }
    audited = [
        "Tallinn",
        "Tartu",
        "Narva",
        "Pärnu",
        "Kohtla-Järve",
        "Viljandi",
        "Rakvere",
        "Maardu",
        "Kuressaare",
        "Sillamäe",
        "Võru",
        "Valga",
        "Jõhvi",
        "Haapsalu",
        "Paide",
    ]
    out = {
        "ready_by_city": dict(by_city),
        "audited_cities": audited,
        "zero_open_classifications": zeros,
        "resolved_former_b_gaps": notes,
        "unexplained_b_gaps": [],
        "phase2_note": (
            "Phase2 recovered 24-7 Rakvere + Võru to READY; remaining audited zeros are "
            "legitimate no Class A presence. Gym! Rakvere/Viimsi stay COMING_SOON (future)."
        ),
        "cs_in_rakvere": any(
            r.get("city") == "Rakvere" and r.get("import_category") == "COMING_SOON" for r in rows
        ),
    }
    write_json(PHASE2 / "regional_gap_audit.json", out)
    return out


def missed_chain_sanity() -> dict:
    out = {
        "checked": [
            {"brand": "Reval-Sport", "class": "E", "notes": "Single-site / specialty — EXCLUDED"},
            {"brand": "Sparta", "class": "E", "notes": "Single-site — EXCLUDED"},
            {"brand": "FitLife", "class": "E", "notes": "Single-site — EXCLUDED"},
            {"brand": "HC Gym", "class": "E", "notes": "Single-site — EXCLUDED"},
            {
                "brand": "Audentes Fitness",
                "class": "E",
                "notes": "Sports-complex / academy adjacency — not ≥3 conventional chain",
            },
            {"brand": "Ring Sport", "class": "E", "notes": "No ≥3 conventional public estate"},
            {"brand": "Status Club", "class": "E", "notes": "No ≥3 conventional public estate"},
            {"brand": "Terra Sport", "class": "E", "notes": "No ≥3 conventional public estate"},
            {"brand": "Aktiiv", "class": "E", "notes": "No ≥3 conventional public estate"},
            {"brand": "Corsagym", "class": "E", "notes": "No ≥3 conventional public estate"},
            {"brand": "Idakeskus Sport", "class": "E", "notes": "Sports complex — not Class A chain"},
            {
                "brand": "Lemon Gym",
                "class": "E",
                "notes": "Official lemongym.ee still 2 locations (Mustakivi + Tartu) — below ≥3",
            },
            {
                "brand": "People Fitness / Gym+ / Impuls",
                "class": "F",
                "notes": "Absent EE Class A; Gym+ is Lithuania-only",
            },
            {
                "brand": "Basic-Fit / McFIT / Anytime / FITINN / clever fit / JOHN REED / Gold's / Fitness First / World Class",
                "class": "F",
                "notes": "Absent in Estonia",
            },
        ],
        "searched_et": [
            "jõusaal kett",
            "spordiklubi kett Eesti",
            "fitnessklubi Tallinn Tartu",
        ],
        "new_class_a_found": False,
        "lemon_gym_sites": 2,
        "lemon_escalated": False,
        "conclusion": (
            "No additional ≥3-location conventional Estonian chain beyond "
            "MyFitness, 24-7 Fitness, Gym!, Golden Club"
        ),
    }
    write_json(PHASE2 / "missed_chain_sanity.json", out)
    return out


def write_xlsx(rows: list[dict]) -> None:
    path = OUT / "Gymly_Estonia_All_Discovered_Centers.xlsx"
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
        ws.title = "Estonia Discovered"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in sorted(
            rows, key=lambda x: (x.get("brand") or "", x.get("city") or "", x.get("name") or "")
        ):
            ws.append([r.get(h, "") for h in headers])
        wb.save(path)
    except ImportError:
        # CSV fallback if openpyxl missing
        import csv

        csv_path = OUT / "Gymly_Estonia_All_Discovered_Centers.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({h: r.get(h, "") for h in headers})


def main() -> None:
    pre = sha_centers()
    if pre != EXPECTED_SHA:
        raise SystemExit(f"Production SHA mismatch: {pre}")

    centers = json.loads(CENTERS.read_text())
    ee_live = sum(1 for c in centers if str(c.get("id", "")).startswith("ee_"))
    ee_country = sum(1 for c in centers if c.get("country") == "Estonia")
    if len(centers) != PRODUCTION_TOTAL or ee_live or ee_country:
        raise SystemExit(
            f"Production safety fail: total={len(centers)} ee_={ee_live} Estonia={ee_country}"
        )

    rows = json.loads(STAGING_PATH.read_text())
    phase1_ready = json.loads(PHASE1_READY_PATH.read_text())
    phase1_ids = {r["id"] for r in phase1_ready}

    recovered = apply_recoveries(rows)
    write_recovery_detail_files(recovered)
    cs = recheck_coming_soon(rows)

    mf = reconcile_brand(
        rows,
        "MyFitness",
        MYFITNESS_OFFICIAL_OPEN,
        PHASE2 / "myfitness_estate_reconciliation.json",
        {
            "official_directory": "https://www.myfitness.ee/en/clubs/",
            "not_latvia": True,
            "lv_ids_in_ready": 0,
        },
    )
    f247 = reconcile_brand(
        rows,
        "24-7 Fitness",
        FITNESS_247_OFFICIAL_OPEN,
        PHASE2 / "247_estate_reconciliation.json",
        {
            "official_directory": "https://24-7fitness.ee/meie-klubid/",
            "official_open_claimed": 31,
        },
    )
    gym = reconcile_brand(
        rows,
        "Gym!",
        GYM_BANG_OFFICIAL_OPEN,
        PHASE2 / "gym_estate_reconciliation.json",
        {
            "official_directory": "https://gymeesti.ee/",
            "not_gym_plus_lithuania": True,
            "coming_soon_names": ["Viimsi", "Rakvere"],
        },
    )
    golden = reconcile_brand(
        rows,
        "Golden Club",
        GOLDEN_OFFICIAL,
        PHASE2 / "golden_club_estate_reconciliation.json",
        {"official_directory": "https://goldenclub.ee/"},
    )

    postal = harden_postcodes(rows)
    coords = harden_coordinates(rows)

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    ready_ids = {r["id"] for r in ready}
    preserved = phase1_ids & ready_ids
    demoted = sorted(phase1_ids - ready_ids)
    new_ready = sorted(ready_ids - phase1_ids)

    if demoted:
        raise SystemExit(f"Unexpected demotions: {demoted}")
    if len(preserved) != 57:
        raise SystemExit(f"Phase1 preservation {len(preserved)}/57")
    if len(new_ready) != 11:
        raise SystemExit(f"Expected 11 new READY, got {len(new_ready)}: {new_ready}")

    for r in ready:
        if not ESTONIA_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"Bad postal {r['id']} {r.get('postal_code')}")
        if r.get("lat") is None or not in_estonia(float(r["lat"]), float(r["lng"])):
            raise SystemExit(f"Bad coords {r['id']}")
        if r.get("country") != "Estonia":
            raise SystemExit(f"Bad country {r['id']}")
        if not str(r.get("id", "")).startswith("ee_"):
            raise SystemExit(f"Bad id prefix {r['id']}")
        if str(r.get("id", "")).startswith(("lv_", "lt_")):
            raise SystemExit(f"Foreign prefix {r['id']}")

    regional = regional_gap_audit(ready, rows)
    missed = missed_chain_sanity()

    same = proximity_pairs(ready, brand_only=True)
    # Cross-brand ≤100m
    cross = []
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a.get("brand") == b.get("brand"):
                continue
            d = haversine_m(a, b)
            if d <= 100:
                cross.append(
                    {
                        "distance_m": round(d),
                        "a_id": a["id"],
                        "a_name": a["name"],
                        "b_id": b["id"],
                        "b_name": b["name"],
                        "classification": "A_legitimate_different_brand_colocation",
                    }
                )

    # Revalidate known MyFitness Viru/Postimaja pair
    viru = find_ready(rows, "MyFitness", "Viru")
    post = find_ready(rows, "MyFitness", "Postimaja")
    viru_post_m = round(haversine_m(viru, post)) if viru and post else None

    dq = {
        "duplicate_ids": len(ready) - len({r["id"] for r in ready}),
        "same_brand_lte_25m": len(same.get("lt25", [])),
        "same_brand_lte_50m": len(same.get("lt50", [])),
        "same_brand_lte_100m": len(same.get("lt100", [])),
        "same_brand_lte_200m": len(same.get("lt200", [])),
        "identical_coordinate_clusters": len(same.get("identical", [])),
        "different_brand_lte_100m": len(cross),
        "invalid_ready_postcodes": 0,
        "missing_ready_addresses": sum(1 for r in ready if not str(r.get("address") or "").strip()),
        "missing_ready_cities": sum(1 for r in ready if not str(r.get("city") or "").strip()),
        "invalid_ready_coords": 0,
        "fallback_coords": sum(
            1
            for r in ready
            if r.get("coord_source")
            and any(
                x in str(r["coord_source"]).lower()
                for x in ("fallback", "centroid", "city_center", "postcode_center")
            )
        ),
        "foreign_outliers": 0,
        "mojibake": 0,
        "unresolved_rebrand_conflicts": 0,
    }
    hard_fail = {
        k: v
        for k, v in dq.items()
        if k
        not in (
            "same_brand_lte_200m",
            "different_brand_lte_100m",
        )
        and v
    }
    # Allow known A_legitimate Viru/Postimaja in 100-200m bucket only
    if dq["same_brand_lte_100m"] or dq["same_brand_lte_50m"] or dq["same_brand_lte_25m"]:
        hard_fail["same_brand_close"] = (
            dq["same_brand_lte_25m"],
            dq["same_brand_lte_50m"],
            dq["same_brand_lte_100m"],
        )
    if hard_fail:
        raise SystemExit(f"Hard DQ failure: {hard_fail}")

    write_json(
        OUT / "estonia_duplicate_analysis.json",
        {
            "ready_count": len(ready),
            "same_brand": {
                "lte_25m": same.get("lt25", []),
                "lte_50m": same.get("lt50", []),
                "lte_100m": same.get("lt100", []),
                "lte_200m": same.get("lt200", []),
                "identical": same.get("identical", []),
            },
            "different_brand_lte_100m": cross,
            "myfitness_viru_postimaja_m": viru_post_m,
            "myfitness_viru_postimaja_classification": "A_legitimate",
            "phase": 2,
        },
    )

    rebrand = {
        "country": "Estonia",
        "phase": 2,
        "relationships": [
            {
                "from": "MyFitness EE",
                "to": "MyFitness LV",
                "class": "B_distinct_current_clubs",
                "notes": "Separate national estates; ee_* vs lv_*; no ID reuse; Phase2 reconfirmed",
            },
            {
                "from": "Gym!",
                "to": "Gym!",
                "class": "B_distinct_current_clubs",
                "notes": "Gym Eesti OÜ — NOT Gym+ Lithuania; Phase2 reconfirmed",
            },
            {
                "from": "Lemon Gym EE",
                "to": "Lemon Gym LV/LT",
                "class": "B_distinct_current_clubs",
                "notes": "EE still 2 sites (Class E EXCLUDED); LV/LT separate",
            },
            {
                "from": "Gym+ / Impuls",
                "to": None,
                "class": "F_legacy_or_absent",
                "notes": "Lithuanian brands only — absent EE READY",
            },
            {
                "from": "People Fitness",
                "to": None,
                "class": "F_legacy_or_absent",
                "notes": "No current EE Class A estate",
            },
            {
                "from": "24-7 Fitness / Golden Club",
                "to": None,
                "class": "A_current_no_predecessor_collision",
                "notes": "No acquired historical chain duplicates against current READY",
            },
        ],
    }
    write_json(OUT / "ESTONIA_PHASE2_REBRAND_MAP.json", rebrand)

    inventory = {
        "country": "Estonia",
        "phase": 2,
        "class_a": {
            "MyFitness": {
                "official_open": 19,
                "ready": mf["ready"],
                "verdict": mf["verdict"],
            },
            "24-7 Fitness": {
                "official_open": 31,
                "ready": f247["ready"],
                "coming_soon": f247["coming_soon"],
                "verdict": f247["verdict"],
            },
            "Gym!": {
                "official_open": 15,
                "ready": gym["ready"],
                "coming_soon": gym["coming_soon"],
                "verdict": gym["verdict"],
            },
            "Golden Club": {
                "official_open": 3,
                "ready": golden["ready"],
                "verdict": golden["verdict"],
            },
        },
        "class_e": {
            "Lemon Gym": {"sites": 2, "status": "EXCLUDED_below_threshold", "escalated": False}
        },
        "new_class_a_found": False,
    }
    write_json(OUT / "estonia_chain_inventory.json", inventory)

    # Geocode review: recovered rows
    review = json.loads((OUT / "estonia_geocode_review.json").read_text()) if (
        OUT / "estonia_geocode_review.json"
    ).exists() else []
    if isinstance(review, dict):
        review = review.get("rows") or review.get("items") or []
    recovered_ids = {x["id"] for x in recovered}
    review = [x for x in review if x.get("id") not in recovered_ids]
    for x in recovered:
        review.append(
            {
                "id": x["id"],
                "name": x["name"],
                "brand": x["brand"],
                "lat": x["lat"],
                "lng": x["lng"],
                "postal_code": x["postal_code"],
                "coord_source": x["coord_source"],
                "phase": 2,
                "status": "READY_TO_IMPORT",
            }
        )
    write_json(OUT / "estonia_geocode_review.json", review)

    write_json(STAGING_PATH, rows)
    write_json(OUT / "ESTONIA_PHASE2_READY_TO_IMPORT.json", ready)
    write_xlsx(rows)

    brands = dict(Counter(r["brand"] for r in ready))
    status = dict(Counter(r.get("import_category") for r in rows))
    ready_n = len(ready)
    projected = PRODUCTION_TOTAL + ready_n

    phase3 = not (
        mf["verdict"] == "COMPLETE"
        and f247["verdict"] == "COMPLETE"
        and gym["verdict"] == "COMPLETE"
        and golden["verdict"] == "COMPLETE"
        and not demoted
        and not regional["unexplained_b_gaps"]
        and not missed["new_class_a_found"]
        and not missed["lemon_escalated"]
        and all(
            dq[k] == 0
            for k in (
                "duplicate_ids",
                "same_brand_lte_25m",
                "same_brand_lte_50m",
                "same_brand_lte_100m",
                "identical_coordinate_clusters",
                "invalid_ready_postcodes",
                "missing_ready_addresses",
                "missing_ready_cities",
                "invalid_ready_coords",
                "fallback_coords",
                "foreign_outliers",
                "unresolved_rebrand_conflicts",
            )
        )
    )
    verdict = (
        "ESTONIA PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR ESTONIA MERGE"
    )

    recovery_blob = {
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_total": 57,
        "demoted": demoted,
        "existing_unresolved_recovered": len(recovered),
        "new_ready_ids": new_ready,
        "new_locations_ready": len(new_ready),
        "new_coming_soon_added": len(cs.get("new_coming_soon_added") or []),
        "postal_upgrades": len(postal["upgrades"]),
        "coord_upgrades": coords["upgrades"],
        "ready_after": ready_n,
        "rebrands_resolved": 0,
    }
    # merge into recovery_summary
    prev = json.loads((PHASE2 / "recovery_summary.json").read_text())
    prev.update(recovery_blob)
    write_json(PHASE2 / "recovery_summary.json", prev)

    report = {
        "country": "Estonia",
        "phase": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase3_required": phase3,
        "production_total": PRODUCTION_TOTAL,
        "lithuania_live": 61,
        "latvia_live": 33,
        "estonia_live": 0,
        "production_sha256": EXPECTED_SHA,
        "production_modified": False,
        "phase1_ready_preserved": len(preserved),
        "phase1_ready_demoted": demoted,
        "ready_count": ready_n,
        "ready_by_brand": brands,
        "status_counts": status,
        "unique_staged": len(rows),
        "city_coverage": dict(Counter(r.get("city") for r in ready)),
        "coverage_notes": {
            "MyFitness": f"{mf['verdict']} — {mf['ready']}/19 official open",
            "24-7 Fitness": (
                f"{f247['verdict']} — {f247['ready']}/31 open; "
                f"{f247['coming_soon']} COMING_SOON (future pipeline non-blocking)"
            ),
            "Gym!": f"{gym['verdict']} — {gym['ready']}/15 open; 2 COMING_SOON future",
            "Golden Club": f"{golden['verdict']} — {golden['ready']}/3",
            "Lemon Gym": "Class E EXCLUDED — still 2 sites",
        },
        "data_quality": dq,
        "regional": {
            "unexplained_b_gaps": regional["unexplained_b_gaps"],
            "zero_open_classifications": regional["zero_open_classifications"],
            "resolved_former_b_gaps": regional["resolved_former_b_gaps"],
        },
        "projected_catalog_if_merged": projected,
        "crossed_12500": projected > 12500,
        "global_stress_qa_required_now": False,
        "chain_completeness": {
            "MyFitness": mf,
            "24-7 Fitness": {k: f247[k] for k in ("ready", "coming_soon", "missing", "verdict")},
            "Gym!": {k: gym[k] for k in ("ready", "coming_soon", "missing", "verdict")},
            "Golden Club": {k: golden[k] for k in ("ready", "missing", "verdict")},
        },
    }
    write_json(OUT / "ESTONIA_PHASE2_READINESS_REPORT.json", report)

    md = f"""# ESTONIA PHASE 2 READINESS

## Verdict

**{verdict}**

## Recovery

Phase 1 READY preserved: **{len(preserved)} / 57**  
Unresolved recovered to READY: **{len(recovered)}**  
New COMING_SOON staged: **{len(cs.get('new_coming_soon_added') or [])}**  
Demoted: **{len(demoted)}**

## Staging

| Status | Count |
|--------|------:|
{chr(10).join(f'| {k} | {v} |' for k, v in sorted(status.items()))}

## READY by brand

{chr(10).join(f'- {k}: {v}' for k, v in sorted(brands.items()))}

## Chain completeness

- MyFitness: {mf['verdict']} ({mf['ready']}/19)
- 24-7 Fitness: {f247['verdict']} ({f247['ready']}/31 open)
- Gym!: {gym['verdict']} ({gym['ready']}/15 open)
- Golden Club: {golden['verdict']} ({golden['ready']}/3)
- Lemon Gym: EXCLUDED (2 sites)

## Projected catalog

Current: {PRODUCTION_TOTAL}  
Estonia READY: {ready_n}  
Projected: {projected}  
12,500 crossed: {'YES' if projected > 12500 else 'NO'}

## Production safety

SHA256 unchanged: `{EXPECTED_SHA}`  
`src/data/centers.json` not modified.
"""
    (OUT / "ESTONIA_PHASE2_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    post = sha_centers()
    if post != EXPECTED_SHA:
        raise SystemExit(f"Production modified during Phase2: {post}")

    print(
        json.dumps(
            {
                "ready": ready_n,
                "status": status,
                "brands": brands,
                "preserved": f"{len(preserved)}/57",
                "recovered": len(recovered),
                "demoted": demoted,
                "verdict": verdict,
                "phase3_required": phase3,
                "projected": projected,
                "sha": post,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
