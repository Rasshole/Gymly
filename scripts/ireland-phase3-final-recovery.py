#!/usr/bin/env python3
"""
Ireland Phase 3 — final targeted recovery before merge decision.

Does NOT modify src/data/centers.json.
Preserves Phase 2 READY rows unless hard evidence proves a defect.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    EIRCODE_RE,
    FALLBACK_RE,
    MOJIBAKE_RE,
    ROOT,
    haversine,
    in_ireland,
    write_json,
)

try:
    from openpyxl import Workbook
except ImportError:  # pragma: no cover
    Workbook = None  # type: ignore

OUT = ROOT / "data/ireland"
PHASE3 = OUT / "phase3"
PHASE3.mkdir(parents=True, exist_ok=True)

PRE_SHA = "93283ab74cfb19bb197f6f09b7f833f3dfb56f1ff98a35c5aefa4c15ddb45b92"
PRODUCTION_TOTAL = 10878
PHASE2_READY_COUNT = 46

NI_MARKERS = re.compile(
    r"\b(belfast|derry|londonderry|newry|lisburn|bangor|omagh|enniskillen|armagh|"
    r"coleraine|ballymena|northern ireland|co\.?\s*antrim|co\.?\s*down|"
    r"co\.?\s*armagh|co\.?\s*tyrone|co\.?\s*fermanagh|\bBT\d{1,2})\b",
    re.I,
)

# Known bad Nominatim failure modes only (tight radii — do NOT use city-wide buffers)
REJECT_COORDS = [
    (53.3411249, -6.2545, 120),  # National Library of Ireland false eircode hit
]


def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def fmt_eircode(code: str) -> str:
    code = (code or "").strip().upper().replace(" ", "")
    if len(code) == 7:
        spaced = f"{code[:3]} {code[3:]}"
    else:
        spaced = (code or "").strip().upper()
        if " " not in spaced and len(spaced) == 7:
            spaced = f"{spaced[:3]} {spaced[3:]}"
    if not EIRCODE_RE.match(spaced):
        return ""
    return spaced


def is_ni(text: str) -> bool:
    return bool(NI_MARKERS.search(text or ""))


def is_rejected_coord(lat: float, lng: float) -> bool:
    for rlat, rlng, meters in REJECT_COORDS:
        if haversine(lat, lng, rlat, rlng) <= meters:
            return True
    return False


def classify(row: dict) -> str:
    if row.get("is_closed"):
        return "CLOSED"
    if row.get("is_coming_soon"):
        return "COMING_SOON"
    if row.get("import_category") in ("DUPLICATE", "LEGACY"):
        return row["import_category"]
    blob = f"{row.get('name')} {row.get('address')} {row.get('city')} {row.get('source_url')}"
    if is_ni(blob) or row.get("country") != "Ireland":
        return "NEEDS_REVIEW"
    if MOJIBAKE_RE.search(blob or ""):
        return "NEEDS_REVIEW"
    postal = fmt_eircode(str(row.get("postal_code") or ""))
    lat, lng = row.get("lat"), row.get("lng")
    addr = (row.get("address") or "").strip()
    city = (row.get("city") or "").strip()
    if not postal:
        if lat is not None and lng is not None:
            return "NEEDS_REVIEW"
        return "NEEDS_REVIEW"
    if lat is None or lng is None:
        return "NEEDS_COORDINATES"
    try:
        lat_f, lng_f = float(lat), float(lng)
    except (TypeError, ValueError):
        return "NEEDS_COORDINATES"
    if not math.isfinite(lat_f) or not math.isfinite(lng_f):
        return "NEEDS_COORDINATES"
    if is_rejected_coord(lat_f, lng_f) or not in_ireland(lat_f, lng_f):
        return "NEEDS_COORDINATES"
    if FALLBACK_RE.search(str(row.get("coord_source") or "")):
        return "NEEDS_COORDINATES"
    if len(addr) < 4 or not city:
        return "NEEDS_REVIEW"
    # Reject coarse placeholder addresses
    if addr.lower() in {"dublin city centre", "dublin", "ireland"}:
        return "NEEDS_REVIEW"
    return "READY_TO_IMPORT"


# ---------------------------------------------------------------------------
# Curated Phase 3 recoveries (official evidence preferred)
# ---------------------------------------------------------------------------
# Each patch: id -> fields to merge. Sources recorded in evidence/notes.

RECOVERIES: dict[str, dict] = {
    # --- West Wood (official contact page westwood.ie/contact/) ---
    "ie_f6926a1734": {  # Clontarf
        "address": "Clontarf Road, Dublin 3",
        "city": "Dublin",
        "postal_code": "D03 T6T3",
        "lat": 53.3631808,
        "lng": -6.2286911,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_westwood_contact_eircode; osm_west_wood_clontarf",
    },
    "ie_6719049de4": {  # Sandymount
        "address": "1a St Johns Road, Sandymount, Dublin 4",
        "city": "Dublin",
        "postal_code": "D04 H3K2",
        "lat": 53.325643,
        "lng": -6.2094269,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_westwood_contact_eircode; osm_west_wood_sandymount",
    },
    "ie_b9072fcf04": {  # Leopardstown
        "address": "Leopardstown Race Course, Foxrock, Dublin 18",
        "city": "Dublin",
        "postal_code": "D18 C9V6",
        "lat": 53.26386,
        "lng": -6.18904,
        "coord_source": "OFFICIAL_EIRCODE_GEOCODE",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_westwood_contact_eircode; nominatim_d18_c9v6",
    },
    "ie_3695d3f418": {  # Westmanstown
        "address": "Westmanstown, Clonsilla, Dublin 15",
        "city": "Dublin",
        "postal_code": "D15 T447",
        "lat": 53.37914,
        "lng": -6.44492,
        "coord_source": "OSM_NAMED_FACILITY_POI",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_westwood_contact_eircode; westmanstown_sports_centre_poi",
    },
    # Hard-defect repairs on existing READY West Wood eircodes (official contact)
    "ie_3225af54be": {  # Aston Quay
        "address": "Aston Quay, Dublin 2",
        "postal_code": "D02 K642",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_repair_eircode_from_official_contact",
    },
    "ie_fff8f6c2e7": {  # Dún Laoghaire
        "address": "The Pavilion, Marine Road, Dún Laoghaire",
        "city": "Dún Laoghaire",
        "postal_code": "A96 A443",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_repair_eircode_from_official_contact",
    },
    # --- Shoreline (official Bray / Greystones info pages) ---
    "ie_473cfd314f": {
        "address": "Southern Cross Road, Bray, Co. Wicklow",
        "city": "Bray",
        "postal_code": "A98 F585",
        "lat": 53.1832231,
        "lng": -6.1238784,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_LOCATION_PAGE",
        "address_source": "OFFICIAL_LOCATION_PAGE",
        "notes_append": "phase3_shoreline_bray_official_eircode",
    },
    "ie_e7ced5aa52": {
        "address": "69 Mill Road, Greystones, Co. Wicklow",
        "city": "Greystones",
        "postal_code": "A63 HD25",
        "lat": 53.1359307,
        "lng": -6.0650606,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_LOCATION_PAGE",
        "address_source": "OFFICIAL_LOCATION_PAGE",
        "notes_append": "phase3_shoreline_greystones_official_eircode",
    },
    # --- Iconic (official membership FAQ + IFSC.ie directory) ---
    "ie_241577f236": {  # Dartry
        "name": "Iconic Health Clubs Dartry",
        "address": "31 Palmerston Gardens, Dartry, Rathgar",
        "city": "Dublin",
        "postal_code": "D06 FX39",
        "lat": 53.31427,
        "lng": -6.26002,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "address_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "notes_append": "phase3_iconic_official_address_eircode",
    },
    "ie_e90de52191": {  # IFSC
        "name": "Iconic Health Clubs IFSC",
        "address": "48 Mayor Street Lower, IFSC",
        "city": "Dublin",
        "postal_code": "D01 R7W7",
        "lat": 53.34949,
        "lng": -6.24705,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "address_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "notes_append": "phase3_iconic_official_address_eircode; ifsc_ie_directory",
    },
    "ie_42999953b2": {  # Smithfield (One Escape rebrand target)
        "name": "Iconic Health Clubs Smithfield",
        "address": "Block G, Smithfield Market, Dublin 7",
        "city": "Dublin",
        "postal_code": "D07 VKP9",
        "lat": 53.3484314,
        "lng": -6.2782374,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "address_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "notes_append": "phase3_iconic_official_address_eircode; one_escape_rebrand_target",
    },
    "ie_7448978ec4": {  # Dublin City / Camden — hard defect repair
        "name": "Iconic Health Clubs Camden Street",
        "address": "1-4 Lower Camden Street, Dublin 2",
        "city": "Dublin",
        "postal_code": "D02 PX82",
        "lat": 53.33634,
        "lng": -6.26522,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "address_source": "OFFICIAL_MEMBERSHIP_PAGE",
        "notes_append": "phase3_repair_iconic_dublin_city_was_misgeocoded; canonical_camden",
    },
    # --- Ben Dunne ---
    "ie_f921b8f931": {  # Northwood
        "address": "Northwood Business Park, Northwood Road, Dublin 9",
        "city": "Dublin",
        "postal_code": "D09 PX36",
        "lat": 53.4013543,
        "lng": -6.2578333,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CLUB_PAGE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_bd_northwood_osm_poi",
    },
    "ie_bccb68d5cc": {  # Portlaoise
        "address": "Unit 11, Lisamard Business Park, Portlaoise",
        "city": "Portlaoise",
        "postal_code": "R32 PT9K",
        "lat": 53.0276314,
        "lng": -7.2863973,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CLUB_PAGE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_bd_portlaoise_osm_poi",
    },
    "ie_64481d16de": {  # Cherrywood — address improved; still missing eircode
        "address": "Cherrywood Business Park, Cherrywood Park, Dublin 18",
        "city": "Dublin",
        "postal_code": "",
        "lat": 53.24328,
        "lng": -6.14142,
        "coord_source": "BUSINESS_PARK_GEOCODE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_cherrywood_park_pin_only; eircode_still_missing",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_business_park_pin_not_building_exact",
    },
    # --- Anytime ---
    "ie_91052fda94": {  # Kilmainham
        "address": "Unit 9, Sancton Wood Building, Heuston South Quarter, St Johns Road West",
        "city": "Kilmainham",
        "postal_code": "D08 A9DT",
        "lat": 53.34365,
        "lng": -6.29702,
        "coord_source": "OFFICIAL_STRUCTURED_DATA",
        "eircode_source": "REVERSE_GEOCODE_OFFICIAL_PIN",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_anytime_kilmainham_eircode_from_official_pin_reverse",
    },
    "ie_09c791f803": {  # Kilnamanagh — still no trustworthy full eircode
        "address": "Kilnamanagh Shopping Centre, Treepark Road",
        "city": "Kilnamanagh",
        "notes_append": "phase3_kilnamanagh_eircode_still_missing_on_official_page",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_page_district_only",
    },
    # --- Energie residuals ---
    "ie_9083565cde": {  # Clarehall
        "address": "Unit 8, Clarehall Retail Park, 17 Malahide Road",
        "city": "Clarehall",
        "postal_code": "D17 X462",
        "lat": 53.4022343,
        "lng": -6.1784366,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CLUB_PAGE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_energie_clarehall_osm_energie_poi",
    },
    "ie_f79236bac2": {  # Limerick
        "address": "Unit 1, Abbey River Court, Island Road, St. Francis Abbey",
        "city": "Limerick",
        "postal_code": "V94 42V0",
        "lat": 52.66808,
        "lng": -8.62068,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "OFFICIAL_CLUB_PAGE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_energie_limerick_abbey_river_court",
    },
    "ie_6930f99872": {  # Tallaght — distinct from Citywest
        "address": "Plaza Hotel Complex, Belgard Road, Tallaght",
        "city": "Tallaght",
        "postal_code": "D24 X2FC",
        "lat": 53.28583,
        "lng": -6.36722,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CLUB_PAGE",
        "address_source": "OFFICIAL_CLUB_PAGE",
        "notes_append": "phase3_energie_tallaght_plaza_hotel_poi; distinct_from_citywest",
    },
    # --- Aura ---
    "ie_470c031a08": {  # Tullamore — official contact Eircode
        "address": "Hophill Road, Cloncollog, Tullamore, Co. Offaly",
        "city": "Tullamore",
        "postal_code": "R35 A594",
        "lat": 53.2691607,
        "lng": -7.4749553,
        "coord_source": "OSM_NAMED_POI",
        "eircode_source": "OFFICIAL_CONTACT_PAGE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_aura_tullamore_official_eircode",
    },
    "ie_aac6d0e126": {  # Dundalk — Age Friendly Ireland facility directory
        "address": "St. Alphonsus Road, Dundalk, Co. Louth",
        "city": "Dundalk",
        "postal_code": "A91 YW90",
        "lat": 54.00116,
        "lng": -6.38916,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "eircode_source": "AGE_FRIENDLY_IRELAND_DIRECTORY",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_aura_dundalk_eircode_age_friendly_directory",
        # Road-level pin with directory eircode — accept as READY if gate passes;
        # street geocode is on St Alphonsus Road (official street).
    },
    "ie_2f24ee9ee2": {  # Drogheda — address + OSM POI; eircode missing
        "address": "Marley's Lane, Drogheda, Co. Louth",
        "city": "Drogheda",
        "lat": 53.7129057,
        "lng": -6.3743417,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "notes_append": "phase3_aura_drogheda_address_poi; eircode_still_missing",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_after_official_address_recovery",
    },
    "ie_31276d22be": {  # De Paul / Navan Road — pool only
        "name": "Aura De Paul Swimming Pool (Navan Road)",
        "address": "St. Vincent's Centre, Navan Road, Dublin 7",
        "city": "Dublin",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "excluded_pool_only_no_conventional_public_gym",
        "notes_append": "phase3_aura_depaul_pool_only_exclude_from_ready",
        "is_active": False,
    },
    "ie_ee4229dbbd": {
        "address": "Corbally Road, Grove Island, Limerick",
        "city": "Limerick",
        "lat": 52.6688063,
        "lng": -8.6145755,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_after_official_address_recovery",
        "notes_append": "phase3_aura_grove_island_poi",
    },
    "ie_f8136e849c": {
        "address": "Attifinlay, Carrick-on-Shannon, Co. Leitrim",
        "city": "Carrick-on-Shannon",
        "lat": 53.9482946,
        "lng": -8.0809736,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_after_official_address_recovery",
        "notes_append": "phase3_aura_leitrim_address",
    },
    "ie_e29d0ea889": {
        "address": "Sallaghagrane, Letterkenny, Co. Donegal",
        "city": "Letterkenny",
        "lat": 54.9461515,
        "lng": -7.7503267,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_no_trustworthy_full_code",
        "notes_append": "phase3_aura_letterkenny_address",
    },
    "ie_36b8a305fe": {
        "address": "Griffeen Valley Park, Lucan, Co. Dublin",
        "city": "Lucan",
        "lat": 53.34450,
        "lng": -6.43871,
        "coord_source": "STRICT_ADDRESS_GEOCODE",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_park_campus_pin",
        "notes_append": "phase3_aura_lucan_address",
    },
    "ie_edd9fa4599": {
        "address": "Windtown Road, Navan, Co. Meath",
        "city": "Navan",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_and_exact_coords_missing",
        "notes_append": "phase3_aura_navan_address_only",
    },
    "ie_b49e3bc44e": {
        "address": "Newhaggard Road, Trim, Co. Meath",
        "city": "Trim",
        "lat": 53.55337,
        "lng": -6.80000,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_after_official_address_recovery",
        "notes_append": "phase3_aura_trim_poi",
    },
    "ie_375273e7dc": {
        "address": "Claycastle, Youghal, Co. Cork",
        "city": "Youghal",
        "lat": 51.9358346,
        "lng": -7.858808,
        "coord_source": "OSM_NAMED_POI",
        "address_source": "OFFICIAL_CONTACT_PAGE",
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_after_official_address_recovery",
        "notes_append": "phase3_aura_youghal_poi",
    },
    # --- FLYEfit residuals: concrete unresolved reasons ---
    "ie_4f70d12c26": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_jsonld_has_coords_only",
        "notes_append": "phase3_flyefit_eircode_debt",
    },
    "ie_014f49e560": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_jsonld_has_coords_only",
        "notes_append": "phase3_flyefit_eircode_debt",
    },
    "ie_45c6e8b8d4": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_jsonld_has_coords_only",
        "notes_append": "phase3_flyefit_eircode_debt",
    },
    "ie_db780fb567": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_jsonld_has_coords_only",
        "notes_append": "phase3_flyefit_eircode_debt",
    },
    "ie_f953bcc5cd": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "eircode_missing_official_jsonld_has_coords_only",
        "notes_append": "phase3_flyefit_eircode_debt",
    },
    # Sub-threshold singles — concrete reasons
    "ie_e2e2764bb9": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "specialty_single_site_below_chain_threshold",
        "notes_append": "phase3_perpetua_excluded_threshold",
    },
    "ie_5c62ec91f5": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "single_site_below_chain_threshold",
        "notes_append": "phase3_sportsco_excluded_threshold",
    },
    "ie_5a5bd0378b": {
        "force_category": "NEEDS_REVIEW",
        "unresolved_reason": "single_site_below_chain_threshold",
        "notes_append": "phase3_swan_excluded_threshold",
    },
}


def apply_recovery(row: dict, patch: dict) -> dict:
    out = dict(row)
    notes_append = patch.get("notes_append")
    force = patch.get("force_category")
    reason = patch.get("unresolved_reason")
    for k, v in patch.items():
        if k in ("notes_append", "force_category", "unresolved_reason"):
            continue
        out[k] = v
    if notes_append:
        prev = (out.get("notes") or "").strip()
        out["notes"] = f"{prev}; {notes_append}".strip("; ")
    evidence = dict(out.get("evidence") or {})
    for src_key in ("eircode_source", "address_source", "coord_source"):
        if out.get(src_key):
            evidence[src_key] = out[src_key]
    if reason:
        evidence["unresolved_reason"] = reason
        out["unresolved_reason"] = reason
    out["evidence"] = evidence
    out["postal_code"] = fmt_eircode(str(out.get("postal_code") or ""))
    if force:
        out["import_category"] = force
    else:
        out["import_category"] = classify(out)
    out["verification_status"] = (
        "VERIFIED_CURRENT" if out["import_category"] == "READY_TO_IMPORT" else "STAGED"
    )
    if out.get("is_active") is False and force == "NEEDS_REVIEW":
        out["is_active"] = False
    elif out["import_category"] == "READY_TO_IMPORT":
        out["is_active"] = True
    return out


def proximity_pairs(rows: list[dict], brand: str | None = None) -> dict:
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    if brand:
        ready = [r for r in ready if r.get("brand") == brand]
    buckets = {"<=25m": [], "<=50m": [], "<=100m": [], "<=200m": [], "identical": []}
    for i, a in enumerate(ready):
        for b in ready[i + 1 :]:
            if a.get("brand") != b.get("brand"):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError, KeyError):
                continue
            pair = {
                "a": a["id"],
                "b": b["id"],
                "brand": a["brand"],
                "names": [a["name"], b["name"]],
                "distance_m": round(d, 1),
                "classification": "A_legitimate" if d > 25 else "C_unresolved",
            }
            if d == 0:
                buckets["identical"].append(pair)
            if d <= 25:
                buckets["<=25m"].append(pair)
            if d <= 50:
                buckets["<=50m"].append(pair)
            if d <= 100:
                buckets["<=100m"].append(pair)
            if d <= 200:
                buckets["<=200m"].append(pair)
    # Explicit Tallaght/Citywest check
    by_id = {r["id"]: r for r in rows}
    tall = by_id.get("ie_6930f99872")
    city = by_id.get("ie_2574437176")
    if tall and city and tall.get("lat") is not None and city.get("lat") is not None:
        d = haversine(float(tall["lat"]), float(tall["lng"]), float(city["lat"]), float(city["lng"]))
        buckets["energie_tallaght_citywest"] = {
            "distance_m": round(d, 1),
            "classification": "A_legitimate" if d > 100 else "C_unresolved",
            "tallaght": tall["id"],
            "citywest": city["id"],
            "tallaght_category": tall.get("import_category"),
            "citywest_category": city.get("import_category"),
        }
    return buckets


def write_xlsx(rows: list[dict], path: Path) -> None:
    if Workbook is None:
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Ireland Centers"
    headers = [
        "id",
        "brand",
        "name",
        "address",
        "city",
        "postal_code",
        "lat",
        "lng",
        "country",
        "import_category",
        "coord_source",
        "eircode_source",
        "source_url",
        "notes",
        "unresolved_reason",
    ]
    ws.append(headers)
    for r in rows:
        ws.append([r.get(h) for h in headers])
    wb.save(path)


def chain_stats(rows: list[dict], brand: str, official: int | None = None) -> dict:
    subset = [r for r in rows if r.get("brand") == brand]
    ready = sum(1 for r in subset if r.get("import_category") == "READY_TO_IMPORT")
    unresolved = len(subset) - ready
    disc = len(subset)
    off = official if official is not None else disc
    cov = round(100.0 * ready / off, 1) if off else 0.0
    if ready == 0 and disc:
        verdict = "PARTIAL"
    elif unresolved == 0 and ready >= max(1, off - 1):
        verdict = "COMPLETE"
    elif ready / max(off, 1) >= 0.75:
        verdict = "NEAR-COMPLETE"
    elif brand in ("SportsCo", "Perpetua Fitness", "Swan Leisure"):
        verdict = "EXCLUDED"
    else:
        verdict = "PARTIAL"
    return {
        "official_current": off,
        "discovered": disc,
        "ready": ready,
        "unresolved": unresolved,
        "coverage_pct": cov,
        "verdict": verdict,
    }


def main() -> None:
    staging = load_json(OUT / "ireland_centers_staging.json", [])
    phase2_ready = load_json(OUT / "IRELAND_PHASE2_READY_TO_IMPORT.json", [])
    phase2_ids = {r["id"] for r in phase2_ready}

    recovered_ids = []
    repaired_ready_ids = []
    by_id = {r["id"]: dict(r) for r in staging}
    pre_cats = {r["id"]: r.get("import_category") for r in staging}

    for rid, patch in RECOVERIES.items():
        if rid not in by_id:
            continue
        before = by_id[rid].get("import_category")
        patch_copy = dict(patch)
        by_id[rid] = apply_recovery(by_id[rid], patch_copy)
        after = by_id[rid].get("import_category")
        if before != "READY_TO_IMPORT" and after == "READY_TO_IMPORT":
            recovered_ids.append(rid)
        if rid in phase2_ids and pre_cats.get(rid) == "READY_TO_IMPORT":
            repaired_ready_ids.append(rid)

    rows = list(by_id.values())
    # Reclassify anything not force-set
    for r in rows:
        if r.get("import_category") not in (
            "DUPLICATE",
            "LEGACY",
            "CLOSED",
            "COMING_SOON",
        ) and not (r.get("evidence") or {}).get("unresolved_reason") and r["id"] not in RECOVERIES:
            r["postal_code"] = fmt_eircode(str(r.get("postal_code") or ""))
            r["import_category"] = classify(r)
        elif r["id"] in RECOVERIES and not RECOVERIES[r["id"]].get("force_category"):
            r["postal_code"] = fmt_eircode(str(r.get("postal_code") or ""))
            if r.get("import_category") != RECOVERIES[r["id"]].get("force_category"):
                r["import_category"] = classify(r)

    # Ensure forced categories stick
    for rid, patch in RECOVERIES.items():
        if rid in by_id and patch.get("force_category"):
            by_id[rid]["import_category"] = patch["force_category"]
    rows = list(by_id.values())
    rows.sort(key=lambda r: (r.get("brand") or "", r.get("name") or "", r.get("id") or ""))

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    status = Counter(r.get("import_category") for r in rows)
    ready_by_brand = Counter(r.get("brand") for r in ready)

    # Phase 2 READY preservation (allow repaired fields; require ID still READY)
    preserved = sum(1 for i in phase2_ids if by_id.get(i, {}).get("import_category") == "READY_TO_IMPORT")
    # Iconic Camden repair keeps same ID ie_7448978ec4
    demoted = [i for i in phase2_ids if by_id.get(i, {}).get("import_category") != "READY_TO_IMPORT"]

    dups = proximity_pairs(rows)
    # If any same-brand <=25m both READY, demote lower-confidence
    for pair in dups.get("<=25m", []):
        a, b = by_id[pair["a"]], by_id[pair["b"]]
        # Prefer official structured / osm named over demotion of both
        pair["classification"] = "C_unresolved"
        # Demote the one without eircode_source official if needed
        for victim in (a, b):
            if "collision" in (victim.get("notes") or ""):
                victim["import_category"] = "NEEDS_COORDINATES"
                victim["unresolved_reason"] = "same_brand_le_25m_collision"
                pair["classification"] = "B_duplicate_demoted"

    rows = list(by_id.values())
    rows.sort(key=lambda r: (r.get("brand") or "", r.get("name") or "", r.get("id") or ""))
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    status = Counter(r.get("import_category") for r in rows)
    ready_by_brand = Counter(r.get("brand") for r in ready)
    dups = proximity_pairs(rows)

    # Data quality
    dq = {
        "duplicate_ids": len(ready) - len({r["id"] for r in ready}),
        "same_brand_le_25m": len(dups.get("<=25m", [])),
        "same_brand_le_50m": len(dups.get("<=50m", [])),
        "same_brand_le_100m": len(dups.get("<=100m", [])),
        "same_brand_le_200m": len(dups.get("<=200m", [])),
        "identical_coords": len(dups.get("identical", [])),
        "invalid_eircodes": sum(1 for r in ready if not EIRCODE_RE.match(str(r.get("postal_code") or ""))),
        "missing_ready_fields": sum(
            1
            for r in ready
            if not all(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
                    r.get("address"),
                    r.get("city"),
                    r.get("postal_code"),
                    r.get("lat") is not None,
                    r.get("lng") is not None,
                    r.get("country") == "Ireland",
                ]
            )
        ),
        "invalid_coords": sum(
            1
            for r in ready
            if r.get("lat") is None
            or r.get("lng") is None
            or not in_ireland(float(r["lat"]), float(r["lng"]))
            or is_rejected_coord(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coords": sum(1 for r in ready if FALLBACK_RE.search(str(r.get("coord_source") or ""))),
        "ni_contamination": sum(1 for r in ready if is_ni(f"{r.get('name')} {r.get('address')} {r.get('city')}")),
        "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')}")),
    }

    chains = {
        "FLYEfit": chain_stats(rows, "FLYEfit", 22),
        "Ben Dunne Gyms": chain_stats(rows, "Ben Dunne Gyms", 5),
        "Anytime Fitness": chain_stats(rows, "Anytime Fitness", 7),
        "Energie Fitness": chain_stats(rows, "Energie Fitness", 16),
        "West Wood Club": chain_stats(rows, "West Wood Club", 6),
        "Aura Leisure": chain_stats(rows, "Aura Leisure", 11),
        "Gym Plus": chain_stats(rows, "Gym Plus", 7),
        "Iconic Health Clubs": chain_stats(rows, "Iconic Health Clubs", 4),
        "Shoreline Leisure": chain_stats(rows, "Shoreline Leisure", 2),
    }

    material_gaps = []
    non_blocking = []
    aura = chains["Aura Leisure"]
    if aura["ready"] < 5:
        material_gaps.append(
            f"Aura Leisure only {aura['ready']}/{aura['discovered']} READY — official pages omit Eircodes for most centres"
        )
    if chains["FLYEfit"]["unresolved"] >= 4:
        non_blocking.append(
            f"FLYEfit residual Eircode debt ({chains['FLYEfit']['unresolved']} clubs) with official coords already present"
        )
    if chains["Ben Dunne Gyms"]["ready"] < 5:
        non_blocking.append("Ben Dunne Cherrywood still missing Eircode (business-park pin only)")
    if chains["Anytime Fitness"]["unresolved"]:
        non_blocking.append("Anytime Kilnamanagh Eircode still missing (district-only on official page)")
    if any(
        (r.get("unresolved_reason") or "") == "excluded_pool_only_no_conventional_public_gym" for r in rows
    ):
        non_blocking.append("Aura De Paul excluded (pool-only, no conventional gym)")

    commercial_ok = (
        chains["West Wood Club"]["ready"] >= 5
        and chains["Energie Fitness"]["ready"] >= 15
        and chains["Iconic Health Clubs"]["ready"] >= 4
        and chains["Ben Dunne Gyms"]["ready"] >= 4
        and chains["Shoreline Leisure"]["ready"] >= 2
        and chains["FLYEfit"]["ready"] >= 15
        and chains["Gym Plus"]["ready"] == 7
        and chains["Anytime Fitness"]["ready"] >= 5
        and dq["same_brand_le_25m"] == 0
        and dq["ni_contamination"] == 0
        and dq["invalid_eircodes"] == 0
    )
    # Aura remains a major national leisure-gym estate not materially READY.
    aura_materially_ok = aura["ready"] >= 6
    phase4 = (not commercial_ok) or (not aura_materially_ok)
    verdict = "IRELAND PHASE 4 REQUIRED BEFORE MERGE" if phase4 else "READY FOR IRELAND MERGE"

    projected = PRODUCTION_TOTAL + len(ready)
    now = datetime.now(timezone.utc).isoformat()

    report = {
        "generated_at": now,
        "production_total": PRODUCTION_TOTAL,
        "production_ireland": 0,
        "production_sha256_expected": PRE_SHA,
        "phase2_ready": PHASE2_READY_COUNT,
        "phase2_ready_preserved": preserved,
        "phase2_ready_demoted": demoted,
        "phase2_ready_repaired": repaired_ready_ids,
        "recovered_to_ready_ids": recovered_ids,
        "net_new_ready_vs_phase2": len(ready) - PHASE2_READY_COUNT,
        "unique_staged": len(rows),
        "ready_count": len(ready),
        "status_counts": dict(status),
        "ready_by_brand": dict(ready_by_brand),
        "chains": chains,
        "data_quality": dq,
        "duplicate_analysis_summary": {
            k: (len(v) if isinstance(v, list) else v) for k, v in dups.items()
        },
        "material_gaps": material_gaps,
        "non_blocking_gaps": non_blocking,
        "projected_catalog": projected,
        "crosses_12500": projected > 12500,
        "architecture": "KEEP CLIENT-SIDE",
        "verdict": verdict,
        "phase4_required": phase4,
    }

    rebrand = {
        "one_escape_to_iconic_smithfield": {
            "legacy": "One Escape Health Club",
            "current": "Iconic Health Clubs Smithfield",
            "id": "ie_42999953b2",
        },
        "flyehub_swords_to_flyefit_swords": {
            "legacy": "FLYEHUB Swords",
            "current": "FLYEfit Swords",
        },
        "iconic_dublin_city_canonical_camden": {
            "id": "ie_7448978ec4",
            "previous_name": "Iconic Health Clubs Dublin City",
            "current_name": "Iconic Health Clubs Camden Street",
            "reason": "phase2_misgeocode_repaired_to_official_camden_address",
        },
        "aura_depaul_excluded_pool_only": {
            "id": "ie_31276d22be",
            "reason": "no_conventional_public_gym",
        },
        "phase2_ready_preserved_count": preserved,
        "phase1_ready_preserved_count": 17,
    }

    geocode_review = {
        "generated_at": now,
        "recoveries_applied": len(RECOVERIES),
        "recovered_to_ready": recovered_ids,
        "energie_tallaght_citywest": dups.get("energie_tallaght_citywest"),
        "notes": [
            "Rejected Nominatim Dublin-centroid and National Library fallbacks",
            "West Wood Eircodes from official contact page",
            "Shoreline Eircodes from official Bray/Greystones location pages",
            "Iconic Eircodes from official membership FAQ (not discarded as footer)",
            "Aura Tullamore Eircode from official contact; Dundalk from Age Friendly directory",
        ],
    }

    write_json(OUT / "ireland_centers_staging.json", rows)
    write_json(OUT / "IRELAND_PHASE3_READY_TO_IMPORT.json", ready)
    write_json(OUT / "IRELAND_PHASE3_READINESS_REPORT.json", report)
    write_json(OUT / "IRELAND_PHASE3_REBRAND_MAP.json", rebrand)
    write_json(OUT / "ireland_duplicate_analysis.json", dups)
    write_json(OUT / "ireland_geocode_review.json", geocode_review)
    write_xlsx(rows, OUT / "Gymly_Ireland_All_Discovered_Centers.xlsx")

    # Also keep Phase 2 READY file untouched; Phase 3 is canonical for merge
    md = f"""# IRELAND PHASE 3 READINESS REPORT

Generated: {now}

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {status.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {status.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {status.get('COMING_SOON', 0)} |
| CLOSED | {status.get('CLOSED', 0)} |
| DUPLICATE/LEGACY | {status.get('DUPLICATE', 0) + status.get('LEGACY', 0)} |
| Phase 2 READY preserved | {preserved}/{PHASE2_READY_COUNT} |
| Newly recovered to READY | {len(recovered_ids)} |
| Projected catalog if merged alone | {projected} |

## READY by brand

{chr(10).join(f"- {b}: {n}" for b, n in sorted(ready_by_brand.items(), key=lambda x: -x[1]))}

## Chain completeness

| Brand | Official | Discovered | READY | Unresolved | Coverage | Verdict |
|-------|----------|------------|-------|------------|----------|---------|
{chr(10).join(
    f"| {b} | {s['official_current']} | {s['discovered']} | {s['ready']} | {s['unresolved']} | {s['coverage_pct']}% | {s['verdict']} |"
    for b, s in chains.items()
)}

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | {dq['duplicate_ids']} |
| Same-brand <=25 m | {dq['same_brand_le_25m']} |
| Same-brand <=50 m | {dq['same_brand_le_50m']} |
| Same-brand <=100 m | {dq['same_brand_le_100m']} |
| Same-brand <=200 m | {dq['same_brand_le_200m']} |
| Invalid Eircodes | {dq['invalid_eircodes']} |
| Missing READY fields | {dq['missing_ready_fields']} |
| Invalid coords | {dq['invalid_coords']} |
| Fallback coords | {dq['fallback_coords']} |
| NI contamination | {dq['ni_contamination']} |
| Mojibake | {dq['mojibake']} |

## Energie Tallaght / Citywest

{json.dumps(dups.get('energie_tallaght_citywest'), indent=2)}

## Material gaps

{chr(10).join(f"- {g}" for g in material_gaps) or "- None"}

## Non-blocking gaps

{chr(10).join(f"- {g}" for g in non_blocking) or "- None"}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    (OUT / "IRELAND_PHASE3_READINESS_REPORT.md").write_text(md, encoding="utf-8")

    print(json.dumps({
        "ready": len(ready),
        "staged": len(rows),
        "status": dict(status),
        "recovered": len(recovered_ids),
        "preserved_phase2": preserved,
        "verdict": verdict,
        "projected": projected,
        "ready_by_brand": dict(ready_by_brand),
        "energie_pair": dups.get("energie_tallaght_citywest"),
        "dq": dq,
    }, indent=2))


if __name__ == "__main__":
    main()
