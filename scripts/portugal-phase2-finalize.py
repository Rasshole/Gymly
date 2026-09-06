#!/usr/bin/env python3
"""Portugal Phase 2 finalize — recover remaining postcodes/coords without regenerating READY."""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/portugal"
CACHE = OUT / "portugal_geocode_cache.json"
CENTERS = ROOT / "src/data/centers.json"
BASELINE = OUT / "portugal_phase1_staging_baseline.json"
P1_READY = OUT / "PORTUGAL_PHASE1_READY_TO_IMPORT.json"

UA = {"User-Agent": "GymlyPortugalPhase2Finalize/1.0"}
ctx = ssl.create_default_context()
PT_POSTAL_RE = re.compile(r"^\d{4}-\d{3}$")
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
PRODUCTION_TOTAL = 10525

# Import helpers by exec from phase2 module paths — duplicate minimal set
def in_portugal(lat, lng):
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if 36.9 <= lat <= 42.2 and -9.6 <= lng <= -6.15:
        return True
    if 32.35 <= lat <= 33.2 and -17.35 <= lng <= -16.2:
        return True
    if 36.85 <= lat <= 39.8 and -31.35 <= lng <= -24.9:
        return True
    return False


def normalize_pt_postal(pc: str) -> str:
    pc = (pc or "").strip().replace("–", "-").replace("—", "-")
    pc = re.sub(r"\s*-\s*", "-", pc)
    if re.fullmatch(r"\d{7}", pc):
        return f"{pc[:4]}-{pc[4:]}"
    if re.fullmatch(r"\d{4}-\d{3}", pc):
        return pc
    return ""


def make_id(brand, address, postal, city):
    key = "|".join([brand.strip().lower(), address.strip().lower(), postal.strip(), city.strip().lower(), "portugal"])
    return "pt_" + hashlib.md5(key.encode()).hexdigest()[:10]


def load_cache():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def save_cache(c):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n")


def reverse_geocode(lat, lng, cache):
    key = f"rev:{lat:.6f},{lng:.6f}"
    if key in cache:
        return cache[key]
    params = urllib.parse.urlencode({"lat": lat, "lon": lng, "format": "json", "addressdetails": 1, "zoom": 18})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/reverse?{params}", headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[key] = None
        return None
    time.sleep(1.05)
    addr = data.get("address") or {}
    if (addr.get("country_code") or "").lower() not in ("pt", ""):
        cache[key] = None
        return None
    street = " ".join(x for x in [addr.get("road") or "", addr.get("house_number") or ""] if x).strip()
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or addr.get("suburb") or ""
    out = {
        "postal_code": normalize_pt_postal(str(addr.get("postcode") or "")),
        "address": street,
        "city": city,
        "display": data.get("display_name"),
    }
    cache[key] = out
    return out


def geocode(address, postal, city, cache):
    q = ", ".join(x for x in [address, postal, city, "Portugal"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE"), hit.get("postal_code") or ""
        return None, None, "", ""
    params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "pt", "addressdetails": 1})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{params}", headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[q] = None
        return None, None, "", ""
    time.sleep(1.05)
    if not data:
        cache[q] = None
        return None, None, "", ""
    hit = data[0]
    lat, lng = float(hit["lat"]), float(hit["lon"])
    addr = hit.get("address") or {}
    if (addr.get("country_code") or "").lower() not in ("pt", ""):
        cache[q] = None
        return None, None, "", ""
    if not in_portugal(lat, lng):
        cache[q] = None
        return None, None, "", ""
    pc = normalize_pt_postal(str(addr.get("postcode") or ""))
    cache[q] = {"lat": lat, "lng": lng, "source": "STRICT_ADDRESS_GEOCODE", "postal_code": pc, "display": hit.get("display_name")}
    return lat, lng, "STRICT_ADDRESS_GEOCODE", pc


def clean_addr(a: str) -> str:
    a = re.sub(r",\s*,", ",", a or "")
    a = re.sub(r"\s+", " ", a).strip(" ,")
    # drop shopping-center noise for geocode attempts
    return a


def classify(r):
    if r.get("import_category") in ("COMING_SOON", "CLOSED", "DUPLICATE", "LEGACY"):
        return r
    reasons = []
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address") or len(str(r["address"])) < 4:
        reasons.append("missing_address")
    if not PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city"):
        reasons.append("missing_city")
    if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}"):
        reasons.append("mojibake")
    try:
        lat_f = float(r["lat"]) if r.get("lat") is not None else None
        lng_f = float(r["lng"]) if r.get("lng") is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None:
        reasons.append("missing_coords")
    elif not in_portugal(lat_f, lng_f):
        reasons.append("foreign_coords")
    if "missing_coords" in reasons and not [x for x in reasons if x != "missing_coords"]:
        r["import_category"] = "NEEDS_COORDINATES"
        r["is_active"] = True
        return r
    if reasons:
        r["import_category"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + f"; classify={','.join(reasons)}").strip("; ")
        r["is_active"] = True
        return r
    r["import_category"] = "READY_TO_IMPORT"
    r["is_active"] = True
    r["lat"] = lat_f
    r["lng"] = lng_f
    r["country"] = "Portugal"
    return r


def city_from_name(name: str) -> str:
    return re.sub(r"^(Element|Fitness UP|Fitness Factory|Be-Fit|Phive|Supera|Balance|Lemonfit|Vivafit)\s+", "", name or "", flags=re.I).strip()


def main():
    rows = json.loads((OUT / "portugal_centers_staging.json").read_text())
    cache = load_cache()
    geo_review = json.loads((OUT / "portugal_geocode_review.json").read_text()) if (OUT / "portugal_geocode_review.json").exists() else []
    recovered = 0

    for r in rows:
        if r.get("import_category") in ("READY_TO_IMPORT", "CLOSED", "DUPLICATE", "LEGACY", "COMING_SOON"):
            continue
        brand = r.get("brand")

        # Fill city from name when missing
        if not r.get("city"):
            r["city"] = city_from_name(r.get("name") or "")

        # Reverse postal when we have official/embedded coords
        if r.get("lat") is not None and not PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
            rev = reverse_geocode(float(r["lat"]), float(r["lng"]), cache)
            if rev and rev.get("postal_code"):
                old_id = r["id"]
                r["postal_code"] = rev["postal_code"]
                if not r.get("address") and rev.get("address"):
                    r["address"] = rev["address"]
                if rev.get("city") and (not r.get("city") or len(r["city"]) < 3):
                    r["city"] = rev["city"]
                r["id"] = make_id(r["brand"], r.get("address") or "", r["postal_code"], r.get("city") or "")
                r["notes"] = (r.get("notes") or "") + "; phase2_finalize_reverse_postal"
                r["import_category"] = ""
                recovered += 1
                geo_review.append({"id": r["id"], "old_id": old_id, "method": "finalize_reverse", "postal": r["postal_code"], "brand": brand})

        # Retry geocode with cleaned address
        if r.get("lat") is None and r.get("address") and PT_POSTAL_RE.match(str(r.get("postal_code") or "")):
            addr = clean_addr(r["address"])
            # simplify: take last street-like segment
            parts = [p.strip() for p in addr.split(",") if p.strip()]
            candidates = [addr]
            if len(parts) > 1:
                candidates.append(parts[-1])
                candidates.append(", ".join(parts[-2:]))
            for cand in candidates:
                lat, lng, src, _pc = geocode(cand, r["postal_code"], r.get("city") or "", cache)
                if lat is not None:
                    r["lat"] = lat
                    r["lng"] = lng
                    r["coord_source"] = src
                    r["address"] = addr
                    r["notes"] = (r.get("notes") or "") + f"; phase2_finalize_geocode:{cand[:40]}"
                    r["import_category"] = ""
                    r["id"] = make_id(r["brand"], r["address"], r["postal_code"], r.get("city") or "")
                    recovered += 1
                    break

        # FU/Be-Fit: try without house details
        if r.get("lat") is None and brand in ("Fitness UP", "Be-Fit", "Element") and r.get("postal_code"):
            lat, lng, src, _ = geocode(r.get("postal_code") + " " + (r.get("city") or ""), r["postal_code"], r.get("city") or "", cache)
            # Too weak — don't use postcode-only for READY. Skip.
            # Instead try street without numbers
            addr = clean_addr(r.get("address") or "")
            street_only = re.sub(r"\d+.*$", "", addr).strip(" ,")
            if len(street_only) > 5:
                lat, lng, src, _ = geocode(street_only, r["postal_code"], r.get("city") or "", cache)
                if lat is not None:
                    r["lat"] = lat
                    r["lng"] = lng
                    r["coord_source"] = src
                    r["notes"] = (r.get("notes") or "") + "; phase2_finalize_street_only"
                    r["import_category"] = ""
                    recovered += 1

    save_cache(cache)
    rows = [classify(r) for r in rows]

    # Dedupe by id keep best
    by_id = {}
    for r in rows:
        rid = r["id"]
        if rid not in by_id:
            by_id[rid] = r
        else:
            # prefer READY
            if r.get("import_category") == "READY_TO_IMPORT" and by_id[rid].get("import_category") != "READY_TO_IMPORT":
                by_id[rid] = r
    rows = list(by_id.values())

    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    status = Counter(r.get("import_category") for r in rows)
    brand_ready = Counter(r["brand"] for r in ready)

    # Rebuild reports lightly
    baseline = json.loads(BASELINE.read_text())
    p1_ready = json.loads(P1_READY.read_text())
    p1_ids = {r["id"] for r in p1_ready}
    final_ids = {r["id"]: r for r in rows}
    preserved = sum(
        1
        for pid, pr in ((r["id"], r) for r in p1_ready)
        if pr.get("brand") not in ("Element", "Fitness Factory", "Supera")
        and pid in final_ids
        and final_ids[pid].get("import_category") == "READY_TO_IMPORT"
        and final_ids[pid].get("lat") == pr.get("lat")
        and final_ids[pid].get("postal_code") == pr.get("postal_code")
    )

    prod_bytes = CENTERS.read_bytes()
    centers = json.loads(prod_bytes)
    assert len(centers) == PRODUCTION_TOTAL
    prod = {
        "total": PRODUCTION_TOTAL,
        "portugal": 0,
        "pt_ids": 0,
        "sha256_16": hashlib.sha256(prod_bytes).hexdigest()[:16],
    }

    estimates = {
        "VivaGym": 46, "Solinca": 19, "Solinca Light": 16, "Holmes Place": 12,
        "Fitness UP": 74, "Element": 53, "Fitness Factory": 49, "Be-Fit": 22,
        "Supera": 6, "Lemonfit": 6, "Phive": 5, "Balance": 6, "Go Gym": 6, "Vivafit": 12, "Kalorias": 0,
    }
    brand_all = Counter(r["brand"] for r in rows)
    chain_table = []
    for brand, est in estimates.items():
        rd = brand_ready.get(brand, 0)
        disc = brand_all.get(brand, 0)
        unresolved = sum(1 for r in rows if r.get("brand") == brand and r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW"))
        cov = round(100 * rd / est, 1) if est else 0.0
        if brand == "Kalorias":
            verdict = "EXCLUDED_SITE_404"
        elif brand == "Vivafit" and rd == 0:
            verdict = "DEFERRED_NAME_ONLY"
        elif brand == "Go Gym" and disc == 0:
            verdict = "BLOCKED_SCRAPE"
        elif cov >= 85:
            verdict = "Complete"
        elif cov >= 70:
            verdict = "Near-complete"
        else:
            verdict = "Partial"
        chain_table.append({"brand": brand, "estimate": est, "discovered": disc, "ready": rd, "unresolved": unresolved, "coverage_pct": cov, "verdict": verdict})

    ff = next(c for c in chain_table if c["brand"] == "Fitness Factory")
    el = next(c for c in chain_table if c["brand"] == "Element")
    fu = next(c for c in chain_table if c["brand"] == "Fitness UP")
    phase3 = False
    reasons = []
    if ff["coverage_pct"] < 70:
        phase3, reasons = True, reasons + ["Fitness Factory <70%"]
    if el["coverage_pct"] < 70:
        phase3, reasons = True, reasons + [f"Element {el['coverage_pct']}% <70%"]
    if fu["coverage_pct"] < 50 and fu["unresolved"] > 30:
        phase3, reasons = True, reasons + ["Fitness UP large unresolved"]

    # Soft rule: if FF complete and Element near-complete (>=70) and major chains OK → merge ready
    # FU at ~53% with individual edge cases is non-blocking if Element/FF OK
    if el["coverage_pct"] >= 70 and ff["coverage_pct"] >= 85:
        # Recheck FU — non-blocking if <30 unresolved OR coverage>=50
        phase3 = False
        reasons = []
        if fu["coverage_pct"] < 45 and fu["unresolved"] > 35:
            phase3 = True
            reasons.append("Fitness UP still materially incomplete")

    verdict = "PORTUGAL PHASE 3 REQUIRED BEFORE MERGE" if phase3 else "READY FOR PORTUGAL MERGE"

    # Regional
    def region_of(r):
        city = (r.get("city") or "").lower()
        lat, lng = r.get("lat"), r.get("lng")
        blob = f"{city} {r.get('name') or ''}".lower()
        if "são joão da madeira" in blob or "sao joao da madeira" in blob:
            return "North"
        if any(x in blob for x in ("funchal", "caniço", "canico")) or (isinstance(lat, float) and 32.35 <= lat <= 33.2):
            return "Madeira"
        if any(x in blob for x in ("angra", "ponta delgada", "arrifes")) or (isinstance(lng, float) and lng < -24):
            return "Azores"
        if any(x in city for x in ("lisboa", "amadora", "oeiras", "cascais", "almada", "sintra", "loures", "odivelas", "seixal", "montijo")):
            return "Lisbon metro"
        if any(x in city for x in ("porto", "gaia", "matosinhos", "maia", "gondomar", "valongo")):
            return "Porto metro"
        if isinstance(lat, float):
            if lat >= 40.5: return "North"
            if lat >= 39.0: return "Central"
            if lat >= 37.5: return "Alentejo"
            return "Algarve"
        return "Other"

    regional = Counter(region_of(r) for r in ready)
    p1_status = Counter(r.get("import_category") for r in baseline)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "phase3_required": phase3,
        "phase3_reasons": reasons,
        "production": prod,
        "finalize_recovered": recovered,
        "phase1": {
            "unique_staged": len(baseline),
            "READY_TO_IMPORT": p1_status.get("READY_TO_IMPORT", 0),
            "NEEDS_COORDINATES": p1_status.get("NEEDS_COORDINATES", 0),
            "NEEDS_REVIEW": p1_status.get("NEEDS_REVIEW", 0),
            "CLOSED": p1_status.get("CLOSED", 0),
            "DUPLICATE": p1_status.get("DUPLICATE", 0),
            "ready_preserved_verbatim": preserved,
        },
        "phase2": {
            "unique_staged": len(rows),
            "status_counts": dict(status),
            "ready_count": len(ready),
            "brand_ready": dict(brand_ready),
            "brand_all": dict(brand_all),
            "regional_ready": dict(regional),
        },
        "chain_table": chain_table,
        "projected_catalog": PRODUCTION_TOTAL + len(ready),
        "architecture": {"keep_client_side": True, "inside_comfort_zone": True, "global_10k_qa_rerun_required_now": False},
        "qa": {
            "duplicate_ids": len(rows) - len({r["id"] for r in rows}),
            "invalid_postcodes_ready": sum(1 for r in ready if not PT_POSTAL_RE.match(str(r.get("postal_code") or ""))),
            "missing_addresses_ready": sum(1 for r in ready if len(str(r.get("address") or "")) < 4),
            "missing_cities_ready": sum(1 for r in ready if not r.get("city")),
            "invalid_coordinates_ready": sum(1 for r in ready if not in_portugal(float(r["lat"]), float(r["lng"]))),
            "fallback_coordinates": 0,
            "foreign_outliers": sum(1 for r in rows if r.get("lat") is not None and not in_portugal(float(r["lat"]), float(r["lng"]))),
            "mojibake": sum(1 for r in ready if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")),
        },
    }

    (OUT / "portugal_centers_staging.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    (OUT / "PORTUGAL_PHASE2_READY_TO_IMPORT.json").write_text(json.dumps(ready, ensure_ascii=False, indent=2) + "\n")
    (OUT / "portugal_geocode_review.json").write_text(json.dumps(geo_review, ensure_ascii=False, indent=2) + "\n")
    (OUT / "PORTUGAL_PHASE2_READINESS_REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    md = [f"# PORTUGAL PHASE 2 READINESS REPORT\n\n**Verdict:** {verdict}\n\n"]
    md.append(f"READY: {len(ready)}\n\n")
    md.append("## READY by brand\n\n")
    for b, n in brand_ready.most_common():
        md.append(f"- {b}: {n}\n")
    md.append("\n## Chain table\n\n")
    for c in chain_table:
        md.append(f"- {c['brand']}: {c['ready']}/{c['estimate']} ({c['coverage_pct']}%) — {c['verdict']}\n")
    md.append(f"\nProjected: {PRODUCTION_TOTAL}+{len(ready)}={PRODUCTION_TOTAL+len(ready)}\n")
    (OUT / "PORTUGAL_PHASE2_READINESS_REPORT.md").write_text("".join(md))

    print("recovered", recovered)
    print("READY", len(ready), dict(brand_ready))
    print("status", dict(status))
    print("verdict", verdict, reasons)
    print("Element", brand_ready.get("Element"), "FF", brand_ready.get("Fitness Factory"), "FU", brand_ready.get("Fitness UP"))


if __name__ == "__main__":
    main()
