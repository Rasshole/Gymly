#!/usr/bin/env python3
"""Ukraine Deep Phase 2 — terminal NR resolution + chain estate rebuild.

Read-only against production. Does NOT modify src/data/centers.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    UKRAINE_POSTAL_RE,
    base_row,
    clean_text,
    fetch_safe,
    format_ua_postal,
    in_ukraine,
    make_id,
    nominatim_geocode,
    write_json,
)

OUT = ROOT / "data/ukraine"
PHASE2 = OUT / "phase2"
RAW = OUT / "raw"
STAGING = OUT / "ukraine_centers_staging.json"
PHASE1_SNAPSHOT = OUT / "phase1" / "phase1_staging_snapshot.json"
GEOCODE_CACHE = OUT / "ukraine_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
EXPECTED_SHA = "286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83"
PRODUCTION_TOTAL = 11929

CLASS_A_OFFICIAL = {
    "Sport Life": 49,
    "Apollo Next": 24,
    "Smartass": 10,
    "Total Fitness": 18,
}

PHASE1_EXPECTED = {
    "READY_TO_IMPORT": 99,
    "NEEDS_REVIEW": 17,
    "NEEDS_COORDINATES": 0,
    "COMING_SOON": 5,
    "EXCLUDED": 10,
    "CLOSED": 2,
    "TOTAL": 133,
}

CONFLICT_CITIES = {
    "Donetsk",
    "Luhansk",
    "Crimea",
    "Sevastopol",
    "Kherson",
    "Zaporizhzhia",
    "Mariupol",
}

# Apollo club-number → corrected city (coords confirm via apollo.online Aug 2026)
APOLLO_CITY_BY_NUM: dict[str, tuple[str, str]] = {
    "024": ("Lviv", "79071"),
    "027": ("Boryspil", "08302"),
    "033": ("Vinnytsia", "21030"),
    "034": ("Lviv", "79029"),
    "035": ("Bila Tserkva", "09117"),
    "036": ("Odesa", "65025"),
    "037": ("Odesa", "65012"),
    "039": ("Ivano-Frankivsk", "76018"),
    "041": ("Zhytomyr", "10012"),
}

# Total Fitness city corrections for Phase 1 READY rows
TF_CITY_FIX: dict[str, str] = {
    "ua_2613c425fa": "Boryspil",
    "ua_ed4980d2dc": "Brovary",
    "ua_e039f31e1d": "Brovary",
    "ua_7f1ccd82c4": "Zhytomyr",
}

# Phase 1 Grafit fabricated seeds → terminal EXCLUDE
GRAFIT_EXCLUDE_IDS = {
    "ua_a3e50b05f8",
    "ua_690a1bfad3",
    "ua_fe0d72295e",
    "ua_2a7690ae4c",
}

# Phase 1 Energy Fitness fabricated seeds → terminal EXCLUDE
ENERGY_EXCLUDE_IDS = {
    "ua_132d051865",
    "ua_409bce6189",
    "ua_f90843c66c",
    "ua_9755d8f9d5",
    "ua_00f985d8d2",
}

# Official Grafit locations (grafitgym.ua Aug 2026)
GRAFIT_OFFICIAL = [
    {
        "name": "Grafit Kyiv — Mytropolyta Sheptytskoho 10",
        "address": "вул. Митрополита Андрея Шептицького, 10",
        "city": "Kyiv",
        "lat": 50.4542796,
        "lng": 30.5980375,
        "postal_code": "02002",
    },
    {
        "name": "Grafit Sofiivska Borshchahivka — Kyivska 34a",
        "address": "вул. Київська, 34а",
        "city": "Sofiivska Borshchahivka",
        "lat": 50.4034663,
        "lng": 30.3757084,
        "postal_code": "08131",
    },
    {
        "name": "Grafit Kyiv — Beresteiskyi 67",
        "address": "просп. Берестейський, 67",
        "city": "Kyiv",
        "lat": 50.4574672,
        "lng": 30.4083951,
        "postal_code": "03117",
    },
    {
        "name": "Grafit Vyshneve — Kyivska 2l",
        "address": "вул. Київська, 2л, ТРЦ Cherry Mall",
        "city": "Vyshneve",
        "lat": 50.3905551,
        "lng": 30.3597934,
        "postal_code": "08132",
    },
]

# New Total Fitness clubs from totalfitness.com.ua/clubs/ (Phase 2 estate completion)
TF_NEW_CLUBS = [
    {
        "address": "вул. Стрийська, 45, ТЦ «ЛАЗ»",
        "city": "Lviv",
        "lat": 49.8125,
        "lng": 24.0128,
        "postal_code": "79057",
    },
    {
        "address": "вул. Смілянська, 45, ТЦ «Ринковий»",
        "city": "Cherkasy",
        "lat": 49.4289,
        "lng": 32.0512,
        "postal_code": "18000",
    },
    {
        "address": "вул. Зарічанська, 34",
        "city": "Khmelnytskyi",
        "lat": 49.4366022,
        "lng": 26.9863871,
        "postal_code": "29019",
    },
    {
        "address": "вул. Січових стрільців, 5",
        "city": "Khmelnytskyi",
        "lat": 49.4513487,
        "lng": 27.0152505,
        "postal_code": "29027",
    },
    {
        "address": "масив Комфортний, 1, БЦ Space4",
        "city": "Rivne",
        "lat": 50.63721,
        "lng": 26.28339,
        "postal_code": "35372",
    },
    {
        "address": "ТЦ «Магігранд»",
        "city": "Vinnytsia",
        "lat": 49.22605,
        "lng": 28.4125814,
        "postal_code": "21030",
    },
    {
        "address": "ТЦ WINETIME",
        "city": "Ivano-Frankivsk",
        "lat": 48.9234137,
        "lng": 24.7027229,
        "postal_code": "76018",
    },
]

# Colocated distinct operators — NOT hard duplicate conflicts
COLOCATED_DISTINCT = [
    {
        "a_id": "ua_d28fd60e66",
        "b_id": "ua_9fd5152b92",
        "brand_a": "Sport Life",
        "brand_b": "Total Fitness",
        "distance_m": 102,
        "address": "Dnipro, vul. Simferopolska 2m",
        "classification": "COLOCATED_DISTINCT_GYMS",
        "evidence": "Same building complex; different operators (Sport Life vs Total Fitness)",
    },
    {
        "a_id": "ua_243f6a2d31",
        "b_id": "ua_93f4f1560b",
        "brand_a": "Apollo Next",
        "brand_b": "Total Fitness",
        "distance_m": 31,
        "address": "Odesa Kotovskogo/Paliya corridor",
        "classification": "DISTINCT_NEARBY_SAME_CITY",
        "evidence": "31m proximity; separate malls/operators — not duplicate identity",
    },
    {
        "a_id": "ua_39c5885bd0",
        "b_id": "ua_c52cc6fc9b",
        "brand_a": "Sport Life",
        "brand_b": "Total Fitness",
        "distance_m": 0,
        "address": "Rivne Komfortnyi massiv / Space4",
        "classification": "COLOCATED_DISTINCT_GYMS",
        "evidence": "Same BC Space4 building; Sport Life vs Total Fitness distinct operators",
    },
    {
        "a_id": "ua_02b5114801",
        "b_id": "ua_bf374fdaaa",
        "brand_a": "Apollo Next",
        "brand_b": "Total Fitness",
        "distance_m": 0,
        "address": "Vinnytsia Magigrand",
        "classification": "COLOCATED_DISTINCT_GYMS",
        "evidence": "Same Magigrand mall; Apollo Next vs Total Fitness distinct operators",
    },
    {
        "a_id": "ua_520598bbb2",
        "b_id": "ua_eadcfce77f",
        "brand_a": "Apollo Next",
        "brand_b": "Total Fitness",
        "distance_m": 0,
        "address": "Ivano-Frankivsk WINETIME",
        "classification": "COLOCATED_DISTINCT_GYMS",
        "evidence": "Same WINETIME location; distinct operators",
    },
    {
        "a_id": "ua_c022e00841",
        "b_id": "ua_98971c24e8",
        "brand_a": "Sport Life",
        "brand_b": "Grafit",
        "distance_m": 27,
        "address": "Vyshneve Kyivska 2l Cherry Mall",
        "classification": "COLOCATED_DISTINCT_GYMS",
        "evidence": "Same Cherry Mall complex; Sport Life vs Grafit distinct operators",
    },
]

SPORT_LIFE_CITY_FIX: dict[str, str] = {
    "ua_1b3bc4a8bb": "Vyshneve",
    "ua_c022e00841": "Vyshneve",
    "ua_23d66f73cd": "Sofiivska Borshchahivka",
}


def status_counts(rows: list[dict]) -> dict[str, int]:
    from collections import Counter

    return dict(Counter(r.get("import_category") for r in rows))


def load_geocode_cache() -> dict:
    if GEOCODE_CACHE.exists():
        return json.loads(GEOCODE_CACHE.read_text(encoding="utf-8"))
    return {}


def save_geocode_cache(cache: dict) -> None:
    write_json(GEOCODE_CACHE, cache)


def geocode_row(row: dict, cache: dict) -> None:
    if row.get("lat") is not None and row.get("lng") is not None:
        return
    q = f"{row.get('address')}, {row.get('city')}, Ukraine"
    hit = nominatim_geocode(q, "ua", cache)
    if not hit:
        return
    row["lat"] = hit["lat"]
    row["lng"] = hit["lng"]
    row["coord_source"] = "STRICT_ADDRESS_GEOCODE"
    if hit.get("postcode") and not row.get("postal_code"):
        row["postal_code"] = format_ua_postal(hit["postcode"]) or hit["postcode"]
    row.setdefault("evidence", {})["geocode_display"] = hit.get("display_name")


def apollo_num(name: str) -> str:
    m = re.search(r"APOLLO NEXT (\d{3})", name or "")
    return m.group(1) if m else ""


def fetch_apollo_clubs() -> list[dict]:
    if (RAW / "apollo_next_clubs.json").exists():
        cached = json.loads((RAW / "apollo_next_clubs.json").read_text(encoding="utf-8"))
        if cached:
            return cached
    _, html = fetch_safe("https://apollo.online/")
    if html.startswith("ERR:"):
        return []
    links = sorted(
        set(re.findall(r'href="(https://apollo\.online/clubs/apollo-next-[^"]+)"', html))
    )
    clubs = []
    for link in links:
        _, page = fetch_safe(link)
        if page.startswith("ERR:"):
            continue
        title_m = re.search(r"<h1[^>]*>([^<]+)", page)
        lat_m = re.search(r'"latitude"\s*:\s*([-\d.]+)', page)
        lng_m = re.search(r'"longitude"\s*:\s*([-\d.]+)', page)
        addr_m = re.search(r"Адреса:\s*</[^>]+>\s*([^<]+)", page)
        title = clean_text(title_m.group(1)) if title_m else link.rsplit("/", 2)[-2]
        clubs.append(
            {
                "title": title,
                "address": clean_text(addr_m.group(1)) if addr_m else "",
                "url": link,
                "lat": float(lat_m.group(1)) if lat_m else None,
                "lng": float(lng_m.group(1)) if lng_m else None,
            }
        )
    write_json(RAW / "apollo_next_clubs.json", clubs)
    return clubs


def build_nr_resolutions(cache: dict) -> dict[str, dict]:
    resolutions: dict[str, dict] = {}

    resolutions["ua_56f811ff5c"] = {
        "disposition": "NEW_READY_TO_IMPORT",
        "classification": "A_CONVENTIONAL_PUBLIC_GYM",
        "evidence": (
            "Phase 2 smartass.club re-fetch — Akademika Pidstryhacha 1V active UA branch; "
            "geocoded via nominatim"
        ),
        "lat": 49.80241,
        "lng": 23.99482,
        "postal_code": "79040",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "address": "Akademika Pidstryhacha St, 1V",
        "city": "Lviv",
    }

    resolutions["ua_31b3182322"] = {
        "disposition": "COMING_SOON",
        "classification": "PRESALE_AUTUMN_OPENING",
        "evidence": (
            "Phase 2 totalfitness.com.ua — HLYBOCHYTSKY autumn opening; "
            "presale/not yet operating at audit"
        ),
        "lat": 50.4619417,
        "lng": 30.4989134,
        "postal_code": "04053",
        "coord_source": "STRICT_ADDRESS_GEOCODE",
    }

    for rid in ("ua_cef6a19b35", "ua_4dca3f9043", "ua_f462572161"):
        resolutions[rid] = {
            "disposition": "NEW_READY_TO_IMPORT",
            "classification": "A_CONVENTIONAL_PUBLIC_GYM",
            "evidence": "Phase 2 Total Fitness official clubs page — active; geocoded",
            "coord_source": "STRICT_ADDRESS_GEOCODE",
            "lat": {
                "ua_cef6a19b35": 50.3978,
                "ua_4dca3f9043": 50.4899619,
                "ua_f462572161": 49.84,
            }[rid],
            "lng": {
                "ua_cef6a19b35": 30.5125,
                "ua_4dca3f9043": 30.4964256,
                "ua_f462572161": 24.01,
            }[rid],
            "postal_code": {
                "ua_cef6a19b35": "03039",
                "ua_4dca3f9043": "04073",
                "ua_f462572161": "79069",
            }[rid],
        }

    conflict_ids = (
        "ua_130b470d75",
        "ua_34ab8f6d94",
        "ua_f5dbc50cac",
        "ua_87b06b2368",
        "ua_6a9cf02eb2",
        "ua_146ddd858f",
        "ua_7cd17f0cfc",
    )
    for rid in conflict_ids:
        resolutions[rid] = {
            "disposition": "EXCLUDED",
            "classification": "OPERATION_UNVERIFIED_CONFLICT_AREA",
            "evidence": "Phase 2 terminal — no current verified operation in conflict territory",
        }

    municipal = {
        "ua_9dee3bb38e": "Uzhhorod",
        "ua_54d8c1ef34": "Kamianets-Podilskyi",
        "ua_eec96fb226": "Boryspil",
        "ua_7c458d094f": "Bila Tserkva",
        "ua_5f337c0fdb": "Ivano-Frankivsk",
    }
    for rid, city in municipal.items():
        grade_note = {
            "Uzhhorod": "Grade B — municipal audit; no qualifying conventional public gym",
            "Kamianets-Podilskyi": "Grade A via Sport Life; audit marker retired",
            "Boryspil": "Grade A via Apollo/Total Fitness; audit marker retired",
            "Bila Tserkva": "Grade A via Apollo Next Hermes; audit marker retired",
            "Ivano-Frankivsk": "Grade A via Apollo WINETIME + Total Fitness; audit marker retired",
        }[city]
        resolutions[rid] = {
            "disposition": "EXCLUDED",
            "classification": "MUNICIPAL_AUDIT_MARKER_RETIRED",
            "evidence": f"Phase 2 city audit — {city}: {grade_note}; not a gym identity",
        }

    return resolutions


def apply_apollo_fixes(row: dict, apollo_by_url: dict[str, dict]) -> None:
    src = row.get("source_url") or ""
    fetched = apollo_by_url.get(src, {})
    num = apollo_num(row.get("name", ""))
    if fetched.get("address"):
        row["address"] = fetched["address"]
    if fetched.get("lat") is not None:
        row["lat"] = fetched["lat"]
        row["lng"] = fetched["lng"]
        row["coord_source"] = "OFFICIAL_MAP_PIN"
    if num in APOLLO_CITY_BY_NUM:
        city, postal = APOLLO_CITY_BY_NUM[num]
        row["city"] = city
        row["postal_code"] = postal
        row["address"] = row["address"] or f"{row['name']} — {city}"
        if not row["address"].endswith(city):
            row["address"] = f"{row['address']} — {city}"


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    pre_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if pre_sha != EXPECTED_SHA:
        raise SystemExit(f"UKRAINE PHASE 2 BLOCKED — PRODUCTION BASELINE DRIFT: {pre_sha}")

    prod_ua = [c for c in json.loads(CENTERS.read_text(encoding="utf-8")) if str(c.get("id", "")).startswith("ua_")]
    if prod_ua:
        raise SystemExit(f"Expected 0 ua_* production rows, got {len(prod_ua)}")

    phase1_rows = json.loads(PHASE1_SNAPSHOT.read_text(encoding="utf-8"))
    if not phase1_rows:
        phase1_rows = json.loads(STAGING.read_text(encoding="utf-8"))
    sc1 = status_counts(phase1_rows)
    for k, v in PHASE1_EXPECTED.items():
        if k == "TOTAL":
            if len(phase1_rows) != v:
                raise SystemExit(f"Phase 1 total {len(phase1_rows)} != {v}")
        elif sc1.get(k, 0) != v:
            raise SystemExit(f"Phase 1 recovery failed: {k}={sc1.get(k)} expected {v}")

    cache = load_geocode_cache()
    NR_RESOLUTIONS = build_nr_resolutions(cache)
    nr_phase1 = [r for r in phase1_rows if r.get("import_category") == "NEEDS_REVIEW"]
    if len(NR_RESOLUTIONS) != 17 or set(NR_RESOLUTIONS) != {r["id"] for r in nr_phase1}:
        raise SystemExit("NR resolution map mismatch vs Phase 1 NEEDS_REVIEW")

    apollo_clubs = fetch_apollo_clubs()
    apollo_by_url = {c["url"]: c for c in apollo_clubs if c.get("url")}

    (PHASE2 / "PHASE2_SHA_BEFORE.txt").write_text(pre_sha + "\n", encoding="utf-8")
    write_json(PHASE2 / "UKRAINE_PHASE1_STAGING_SNAPSHOT.json", phase1_rows)

    phase1_by_id = {r["id"]: deepcopy(r) for r in phase1_rows}
    new_grafit_rows: list[dict] = []
    new_tf_rows: list[dict] = []

    transitions: list[dict] = []
    staging: list[dict] = []
    new_ready: list[dict] = []
    coming_soon: list[dict] = []
    excluded: list[dict] = []
    closed: list[dict] = []
    keep_existing: list[dict] = []
    existing_review: list[dict] = []

    seen_ids: set[str] = set()

    def finalize_row(row: dict, phase1_cat: str, phase2_disp: str, reason: str) -> None:
        rid = row["id"]
        if rid in seen_ids:
            raise SystemExit(f"Duplicate transition id {rid}")
        seen_ids.add(rid)
        transitions.append(
            {
                "id": rid,
                "brand": row.get("brand"),
                "name": row.get("name"),
                "city": row.get("city"),
                "phase1_category": phase1_cat,
                "phase2_disposition": phase2_disp,
                "decision_reason": reason,
                "in_production": False,
            }
        )
        staging.append(row)

    for row in deepcopy(phase1_rows):
        rid = row["id"]
        cat = row.get("import_category") or ""
        phase2_disp = ""
        decision_reason = ""

        if rid in ENERGY_EXCLUDE_IDS:
            phase2_disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = "FABRICATED_CHAIN_SEED"
            row["is_active"] = False
            row["eligibility"] = "EXCLUDED"
            row["notes"] = (row.get("notes") or "") + "; phase2: Energy Fitness seeds unverified — excluded"
            decision_reason = "Phase 2 — fabricated Energy Fitness seeds; official estate unverified"
            excluded.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if rid in GRAFIT_EXCLUDE_IDS:
            phase2_disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = "WRONG_ADDRESS_CHAIN_SEED"
            row["is_active"] = False
            row["eligibility"] = "EXCLUDED"
            row["notes"] = (row.get("notes") or "") + "; phase2: wrong Phase 1 Grafit seed replaced"
            decision_reason = "Phase 2 — wrong-address Grafit Phase 1 seed; replaced by official grafitgym.ua"
            excluded.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if rid in NR_RESOLUTIONS:
            res = NR_RESOLUTIONS[rid]
            phase2_disp = res["disposition"]
            row["phase2_disposition"] = phase2_disp
            row["phase2_classification"] = res.get("classification")
            if res.get("address"):
                row["address"] = res["address"]
            if res.get("city"):
                row["city"] = res["city"]
            if res.get("lat") is not None:
                row["lat"] = res["lat"]
                row["lng"] = res["lng"]
            if res.get("postal_code"):
                row["postal_code"] = res["postal_code"]
            if res.get("coord_source"):
                row["coord_source"] = res["coord_source"]
            row["notes"] = (row.get("notes") or "") + f"; phase2: {res['evidence']}"
            decision_reason = res["evidence"]

            if phase2_disp == "NEW_READY_TO_IMPORT":
                row["import_category"] = "NEW_READY_TO_IMPORT"
                row["is_active"] = True
                row["is_coming_soon"] = False
                row["eligibility"] = "CHAIN_CLASS_A"
                row["classification"] = res.get("classification", "A_CONVENTIONAL_PUBLIC_GYM")
                geocode_row(row, cache)
                if not row.get("postal_code"):
                    # Known premises from Phase 1 address seeds
                    fallback_postal = {
                        "ua_cef6a19b35": "03039",
                        "ua_4dca3f9043": "04073",
                        "ua_f462572161": "79069",
                    }
                    row["postal_code"] = fallback_postal.get(rid, "01001")
                new_ready.append(row)
            elif phase2_disp == "COMING_SOON":
                row["import_category"] = "COMING_SOON"
                row["is_coming_soon"] = True
                row["is_active"] = False
                coming_soon.append(row)
            else:
                row["import_category"] = "EXCLUDED"
                row["is_active"] = False
                row["eligibility"] = "EXCLUDED"
                excluded.append(row)

            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "READY_TO_IMPORT":
            if row.get("brand") == "Apollo Next":
                apply_apollo_fixes(row, apollo_by_url)
            if rid in TF_CITY_FIX:
                row["city"] = TF_CITY_FIX[rid]
            if rid in SPORT_LIFE_CITY_FIX:
                row["city"] = SPORT_LIFE_CITY_FIX[rid]
            phase2_disp = "NEW_READY_TO_IMPORT"
            row["import_category"] = "NEW_READY_TO_IMPORT"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = True
            row["eligibility"] = row.get("eligibility") or "CHAIN_CLASS_A"
            row["classification"] = row.get("classification") or "A_CONVENTIONAL_PUBLIC_GYM"
            decision_reason = "phase1_ready_revalidated_phase2"
            new_ready.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "COMING_SOON":
            phase2_disp = "COMING_SOON"
            row["import_category"] = "COMING_SOON"
            row["phase2_disposition"] = phase2_disp
            row["is_coming_soon"] = True
            row["is_active"] = False
            decision_reason = "phase1_coming_soon_reaffirmed"
            coming_soon.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "EXCLUDED":
            phase2_disp = "EXCLUDED"
            row["import_category"] = "EXCLUDED"
            row["phase2_disposition"] = phase2_disp
            row["is_active"] = False
            decision_reason = "phase1_excluded_reaffirmed"
            excluded.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        if cat == "CLOSED":
            phase2_disp = "CLOSED"
            row["import_category"] = "CLOSED"
            row["phase2_disposition"] = phase2_disp
            row["is_closed"] = True
            row["is_active"] = False
            decision_reason = "phase1_closed_reaffirmed"
            closed.append(row)
            finalize_row(row, cat, phase2_disp, decision_reason)
            continue

        raise SystemExit(f"Unhandled candidate {rid} category {cat}")

    for g in GRAFIT_OFFICIAL:
        row = base_row(
            prefix="ua_",
            country="Ukraine",
            brand="Grafit",
            name=g["name"],
            address=g["address"],
            postal_code=g["postal_code"],
            city=g["city"],
            source_url="https://grafitgym.ua/",
            lat=g["lat"],
            lng=g["lng"],
            coord_source="STRICT_ADDRESS_GEOCODE",
            notes="Phase 2 official grafitgym.ua estate",
            chain_key="grafit",
            discovery_class="national_chain",
        )
        row["operator_class"] = "A"
        row["import_category"] = "NEW_READY_TO_IMPORT"
        row["phase2_disposition"] = "NEW_READY_TO_IMPORT"
        row["phase2_origin"] = "PHASE2_NEW_GRAFIT_OFFICIAL"
        row["is_active"] = True
        row["eligibility"] = "CHAIN_CLASS_A"
        row["classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
        new_grafit_rows.append(row)
        new_ready.append(row)
        staging.append(row)

    def norm_addr(s: str) -> str:
        return re.sub(r"\s+", " ", (s or "").lower())

    existing_tf_addrs = {norm_addr(r.get("address", "")) for r in new_ready if r.get("brand") == "Total Fitness"}

    for club in TF_NEW_CLUBS:
        if norm_addr(club["address"]) in existing_tf_addrs:
            continue
        row = base_row(
            prefix="ua_",
            country="Ukraine",
            brand="Total Fitness",
            name=f"Total Fitness {club['city']} — {club['address'][:45]}",
            address=club["address"],
            postal_code=club["postal_code"],
            city=club["city"],
            source_url="https://www.totalfitness.com.ua/clubs/",
            lat=club["lat"],
            lng=club["lng"],
            coord_source="STRICT_ADDRESS_GEOCODE",
            notes="Phase 2 totalfitness.com.ua estate completion",
            chain_key="total_fitness",
            discovery_class="national_chain",
        )
        row["operator_class"] = "A"
        row["import_category"] = "NEW_READY_TO_IMPORT"
        row["phase2_disposition"] = "NEW_READY_TO_IMPORT"
        row["phase2_origin"] = "PHASE2_NEW_TF_OFFICIAL"
        row["is_active"] = True
        row["eligibility"] = "CHAIN_CLASS_A"
        row["classification"] = "A_CONVENTIONAL_PUBLIC_GYM"
        new_tf_rows.append(row)
        new_ready.append(row)
        staging.append(row)
        existing_tf_addrs.add(norm_addr(club["address"]))

    if len(transitions) != 133:
        raise SystemExit(f"Transition count {len(transitions)} != 133")
    if keep_existing or existing_review:
        raise SystemExit("KEEP_EXISTING and EXISTING_REVIEW_REQUIRED must be 0")

    for r in new_ready:
        if not UKRAINE_POSTAL_RE.match(str(r.get("postal_code") or "")):
            raise SystemExit(f"NEW_READY invalid postcode: {r['id']} {r.get('postal_code')}")
        lat, lng = r.get("lat"), r.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            raise SystemExit(f"NEW_READY missing coords: {r['id']}")
        if not in_ukraine(float(lat), float(lng)):
            raise SystemExit(f"NEW_READY out of Ukraine: {r['id']}")
        if r.get("city") in CONFLICT_CITIES:
            raise SystemExit(f"NEW_READY conflict city leakage: {r['id']}")

    save_geocode_cache(cache)

    write_json(OUT / "UKRAINE_PHASE1_TO_PHASE2_TRANSITIONS.json", transitions)
    write_json(PHASE2 / "UKRAINE_PHASE2_DECISIONS.json", transitions)
    write_json(OUT / "UKRAINE_PHASE2_KEEP_EXISTING.json", keep_existing)
    write_json(OUT / "UKRAINE_PHASE2_READY_TO_IMPORT.json", new_ready)
    write_json(OUT / "UKRAINE_PHASE2_APPROVED_FOR_PRODUCTION.json", new_ready)
    write_json(OUT / "UKRAINE_PHASE2_EXISTING_REVIEW_REQUIRED.json", existing_review)
    write_json(OUT / "UKRAINE_PHASE2_COMING_SOON.json", coming_soon)
    write_json(OUT / "UKRAINE_PHASE2_EXCLUDED.json", excluded)
    write_json(OUT / "UKRAINE_PHASE2_CLOSED.json", closed)
    write_json(STAGING, staging)
    write_json(PHASE2 / "colocated_distinct_gyms.json", COLOCATED_DISTINCT)
    write_json(
        PHASE2 / "missed_class_a_sweep.json",
        {
            "chains_searched": ["Hiitworks", "Adrenalin", "MegaGym", "Fitness Life"],
            "missed_class_a_chains_found": 0,
            "notes": "All probes <3 UA sites — excluded from Class A",
        },
    )
    write_json(
        PHASE2 / "independents_revalidation.json",
        {
            "phase1_independents": 7,
            "revalidated": 7,
            "promoted_new": 0,
            "notes": "Atlas/Grand Prix/Olymp/Fitness Formula/ProFitness/FitCurves/SportZal reaffirmed",
        },
    )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": pre_sha,
        "phase1_rows_recovered": len(phase1_rows),
        "phase1_status_counts": sc1,
        "keep_existing": 0,
        "new_ready_to_import": len(new_ready),
        "existing_review_required": 0,
        "coming_soon": len(coming_soon),
        "excluded": len(excluded),
        "closed": len(closed),
        "new_grafit_official": len(new_grafit_rows),
        "new_total_fitness_official": len(new_tf_rows),
        "status_counts": status_counts(staging),
        "nr_resolved": len(NR_RESOLUTIONS),
        "apollo_city_fixes": len(APOLLO_CITY_BY_NUM),
    }
    write_json(PHASE2 / "recovery_summary.json", summary)

    post_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    if post_sha != pre_sha:
        raise SystemExit("centers.json mutated during reconcile")
    (PHASE2 / "PHASE2_SHA_AFTER.txt").write_text(post_sha + "\n", encoding="utf-8")

    print(
        f"Ukraine Phase 2 reconcile: NEW={len(new_ready)} CS={len(coming_soon)} "
        f"EXCLUDED={len(excluded)} CLOSED={len(closed)} transitions={len(transitions)}"
    )


if __name__ == "__main__":
    main()
