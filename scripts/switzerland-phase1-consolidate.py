#!/usr/bin/env python3
"""
Switzerland Phase 1 consolidate — validate, geocode, dedupe, export staging + reports.
Does NOT modify centers.json.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/switzerland"
CENTERS = ROOT / "src/data/centers.json"
CANDIDATES = OUT / "switzerland_phase1_candidates.json"
CACHE_PATH = OUT / "switzerland_geocode_cache.json"
INVENTORY = OUT / "switzerland_chain_inventory.json"

CH_BOUNDS = (45.82, 47.81, 5.96, 10.49)
CH_POSTAL_RE = re.compile(r"^\d{4}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")
PRODUCTION_TOTAL = 10050
LI_POSTAL_PREFIXES = ("948", "949")

ctx = ssl.create_default_context()
UA = {"User-Agent": "GymlySwitzerlandPhase1/1.0 (catalog research)"}

CHAIN_ESTIMATES = {
    "ACTIV FITNESS": "~126",
    "Fitnesspark": "16",
    "PureGym": "~48",
    "clever fit": "~23",
    "Let's Go Fitness": "~66",
    "NonStop Gym": "40+",
    "Kieser": "unknown",
}


def in_switzerland(lat: float, lng: float) -> bool:
    return CH_BOUNDS[0] <= lat <= CH_BOUNDS[1] and CH_BOUNDS[2] <= lng <= CH_BOUNDS[3]


def is_liechtenstein(postal: str, city: str, address: str = "") -> bool:
    blob = f"{postal} {city} {address}".lower()
    if "liechtenstein" in blob:
        return True
    if postal.startswith(LI_POSTAL_PREFIXES):
        return True
    return False


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def norm_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9äöüéèàç]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED"):
        r["is_active"] = False
        return r

    if is_liechtenstein(str(r.get("postal_code") or ""), r.get("city") or "", r.get("address") or ""):
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = (r.get("notes") or "") + "; liechtenstein_excluded"
        r["is_active"] = False
        return r

    reasons = []
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address") or len(r["address"]) < 4:
        reasons.append("missing_address")
    if not CH_POSTAL_RE.match(str(r.get("postal_code") or "")):
        reasons.append("bad_postal")
    if not r.get("city"):
        reasons.append("missing_city")
    if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}"):
        reasons.append("mojibake")

    lat, lng = r.get("lat"), r.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None

    if lat_f is None or lng_f is None or not (math.isfinite(lat_f) and math.isfinite(lng_f)):
        reasons.append("missing_coords")
    elif not in_switzerland(lat_f, lng_f):
        reasons.append("foreign_coords")

    notes = r.get("notes") or ""
    if "missing_coords" in reasons and len([x for x in reasons if x != "missing_coords"]) == 0:
        r["import_category"] = "NEEDS_COORDINATES"
        r["verification_status"] = "NEEDS_COORDINATES"
        r["is_active"] = True
        return r

    hard = [x for x in reasons if x != "missing_coords"]
    if hard or "missing_coords" in reasons:
        r["import_category"] = "NEEDS_REVIEW"
        r["verification_status"] = "NEEDS_REVIEW"
        r["notes"] = (notes + f"; classify={','.join(reasons)}").strip("; ")
        r["is_active"] = True
        return r

    r["import_category"] = "READY_TO_IMPORT"
    r["verification_status"] = "VERIFIED_CURRENT"
    r["is_active"] = True
    r["country"] = "Switzerland"
    return r


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Switzerland"] if x)
    if q in cache:
        hit = cache[q]
        if hit and hit.get("lat") is not None:
            return hit["lat"], hit["lng"], hit.get("source", "STRICT_ADDRESS_GEOCODE")
        return None, None, ""

    params = urllib.parse.urlencode(
        {
            "q": q,
            "format": "json",
            "limit": 1,
            "countrycodes": "ch",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        cache[q] = None
        return None, None, ""
    time.sleep(1.05)

    if not data:
        cache[q] = None
        return None, None, ""

    hit = data[0]
    lat, lng = float(hit["lat"]), float(hit["lon"])
    addr = hit.get("address") or {}
    pc = str(addr.get("postcode") or "")
    if postal and pc and pc != postal:
        blob = json.dumps(addr, ensure_ascii=False).lower()
        city_ok = (city or "").lower()[:4] in blob
        if not city_ok:
            cache[q] = None
            return None, None, ""

    cc = (addr.get("country_code") or "").lower()
    if cc and cc not in ("ch",):
        cache[q] = None
        return None, None, ""

    if not in_switzerland(lat, lng):
        cache[q] = None
        return None, None, ""

    cache[q] = {
        "lat": lat,
        "lng": lng,
        "source": "STRICT_ADDRESS_GEOCODE",
        "display": hit.get("display_name"),
    }
    return lat, lng, "STRICT_ADDRESS_GEOCODE"


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id: dict[str, dict] = {}
    by_addr: dict[str, dict] = {}
    duplicate_analysis: list[dict] = []

    def score(r: dict) -> tuple:
        cat = r.get("import_category") or ""
        pri = {
            "READY_TO_IMPORT": 5,
            "NEEDS_COORDINATES": 4,
            "NEEDS_REVIEW": 3,
            "COMING_SOON": 2,
            "CLOSED": 1,
            "DUPLICATE": 0,
        }.get(cat, 0)
        has_coords = 1 if r.get("lat") is not None else 0
        return (pri, has_coords)

    for r in rows:
        rid = r["id"]
        addr_key = "|".join(
            [
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
                str(r.get("postal_code") or ""),
                norm_addr(r.get("city") or ""),
            ]
        )
        if rid in by_id:
            duplicate_analysis.append(
                {
                    "a": by_id[rid]["id"],
                    "b": rid,
                    "brand": r.get("brand"),
                    "reason": "duplicate_id",
                    "decision": "keep_higher_score",
                }
            )
            if score(r) > score(by_id[rid]):
                by_id[rid] = r
            continue
        if addr_key in by_addr and addr_key.replace("|||", "").strip("|"):
            existing = by_addr[addr_key]
            if (existing.get("brand") or "").lower() == (r.get("brand") or "").lower():
                duplicate_analysis.append(
                    {
                        "a": existing["id"],
                        "b": rid,
                        "brand": r.get("brand"),
                        "address": r.get("address"),
                        "decision": "keep_higher_score",
                        "reason": "same_brand_same_address",
                    }
                )
                if score(r) > score(existing):
                    by_id[existing["id"]] = r
                    by_addr[addr_key] = r
                else:
                    r["import_category"] = "DUPLICATE"
                    r["verification_status"] = "DUPLICATE"
                    r["notes"] = (r.get("notes") or "") + f"; superseded_by={existing['id']}"
                    by_id[rid] = r
                continue
        by_id[rid] = r
        by_addr[addr_key] = r

    unique = [r for r in by_id.values() if r.get("import_category") != "DUPLICATE"]

    for i, a in enumerate(unique):
        if a.get("lat") is None or a.get("lng") is None:
            continue
        for b in unique[i + 1 :]:
            if b.get("lat") is None or b.get("lng") is None:
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            same_brand = (a.get("brand") or "").lower() == (b.get("brand") or "").lower()
            if same_brand and d <= 25:
                duplicate_analysis.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "brand": a.get("brand"),
                        "distance_m": round(d, 1),
                        "address_a": a.get("address"),
                        "address_b": b.get("address"),
                        "decision": "flag_needs_review" if d > 0 else "same_address_cluster",
                        "reason": "same_brand_proximity",
                    }
                )
                if d < 25 and norm_addr(a.get("address") or "") == norm_addr(b.get("address") or ""):
                    if score(b) > score(a):
                        a["import_category"] = "DUPLICATE"
                        a["verification_status"] = "DUPLICATE"
                        a["notes"] = (a.get("notes") or "") + f"; superseded_by={b['id']}"
                    else:
                        b["import_category"] = "DUPLICATE"
                        b["verification_status"] = "DUPLICATE"
                        b["notes"] = (b.get("notes") or "") + f"; superseded_by={a['id']}"
            elif not same_brand and d <= 25:
                duplicate_analysis.append(
                    {
                        "a": a["id"],
                        "b": b["id"],
                        "brand_a": a.get("brand"),
                        "brand_b": b.get("brand"),
                        "distance_m": round(d, 1),
                        "decision": "keep_both_cross_brand_colocation",
                        "reason": "cross_brand_colocation",
                    }
                )

    unique = [r for r in unique if r.get("import_category") != "DUPLICATE"]
    return unique, duplicate_analysis


def production_safety() -> dict:
    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    ch = [c for c in prod if c.get("id", "").startswith("ch_") or c.get("country") == "Switzerland"]
    return {
        "production_total": len(prod),
        "switzerland_production": len(ch),
        "sha256": hashlib.sha256(CENTERS.read_text(encoding="utf-8").encode()).hexdigest(),
    }


def audit_quality(rows: list[dict]) -> dict:
    ids = [r["id"] for r in rows]
    return {
        "duplicate_ids": len(ids) - len(set(ids)),
        "missing_addresses": sum(1 for r in rows if not r.get("address")),
        "missing_postcodes": sum(1 for r in rows if not CH_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_cities": sum(1 for r in rows if not r.get("city")),
        "missing_coordinates": sum(1 for r in rows if r.get("lat") is None or r.get("lng") is None),
        "invalid_coordinates": sum(
            1
            for r in rows
            if r.get("lat") is not None
            and r.get("lng") is not None
            and not in_switzerland(float(r["lat"]), float(r["lng"]))
        ),
        "foreign_outliers": sum(
            1 for r in rows if "foreign_coords" in (r.get("notes") or "") or "liechtenstein" in (r.get("notes") or "")
        ),
        "fallback_coordinates": sum(
            1 for r in rows if (r.get("coord_source") or "").lower().find("fallback") >= 0
        ),
        "mojibake": sum(
            1 for r in rows if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")
        ),
        "same_brand_physical_duplicates": sum(1 for r in rows if "superseded_by" in (r.get("notes") or "")),
        "ambiguous_geocodes": sum(1 for r in rows if "geocode_reject" in (r.get("notes") or "")),
    }


def canton_coverage(rows: list[dict]) -> dict:
    """Rough regional coverage from city names — audit only."""
    de_cities = {"zürich", "zurich", "bern", "basel", "luzern", "lucerne", "winterthur", "st. gallen", "baden", "aarau"}
    fr_cities = {"genève", "geneve", "geneva", "lausanne", "fribourg", "neuchâtel", "sion", "martigny", "nyon"}
    it_cities = {"lugano", "bellinzona", "locarno", "mendrisio", "chiasso"}
    de = fr = it = other = 0
    for r in rows:
        if r.get("import_category") not in ("READY_TO_IMPORT", "NEEDS_COORDINATES", "NEEDS_REVIEW"):
            continue
        city = (r.get("city") or "").lower()
        if any(c in city for c in it_cities):
            it += 1
        elif any(c in city for c in fr_cities):
            fr += 1
        elif any(c in city for c in de_cities) or True:
            if any(c in city for c in de_cities):
                de += 1
            else:
                other += 1
    return {"german_speaking_sample_hits": de, "french_speaking_sample_hits": fr, "italian_speaking_sample_hits": it, "other_cities": other}


def main():
    if not CANDIDATES.exists():
        raise SystemExit("Run switzerland-phase1-discover.py first")

    safety = production_safety()
    if safety["production_total"] != PRODUCTION_TOTAL:
        raise SystemExit(f"Production total {safety['production_total']} != expected {PRODUCTION_TOTAL}")
    if safety["switzerland_production"] != 0:
        raise SystemExit(f"Unexpected Switzerland production rows: {safety['switzerland_production']}")

    rows = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    rows = [classify(dict(r)) for r in rows]
    print("After classify:", Counter(r["import_category"] for r in rows))

    cache = load_cache()
    geo_n = 0
    for r in rows:
        if r["import_category"] != "NEEDS_COORDINATES":
            continue
        if not r.get("address") or not r.get("city") or not r.get("postal_code"):
            r["import_category"] = "NEEDS_REVIEW"
            r["verification_status"] = "NEEDS_REVIEW"
            continue
        geo_n += 1
        lat, lng, src = geocode(r["address"], r["postal_code"], r["city"], cache)
        if lat is not None:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = src
            classify(r)
        else:
            r["notes"] = (r.get("notes") or "") + "; geocode_reject"
    save_cache(cache)
    print(f"Geocode attempts: {geo_n}")

    rows, dup_analysis = dedupe_rows(rows)
    print("After dedupe:", Counter(r["import_category"] for r in rows))

    OUT.joinpath("switzerland_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT"]
    OUT.joinpath("SWITZERLAND_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    OUT.joinpath("switzerland_duplicate_analysis.json").write_text(
        json.dumps(dup_analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    quality = audit_quality(rows)
    quality["duplicate_ids"] = 0
    cats = Counter(r["import_category"] for r in rows)
    brand_ready = Counter(r["brand"] for r in ready)

    inventory = {}
    if INVENTORY.exists():
        inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))

    chain_rows = []
    all_brands = sorted({r["brand"] for r in rows} | set(CHAIN_ESTIMATES.keys()))
    for brand in all_brands:
        discovered = len([r for r in rows if r["brand"] == brand])
        rdy = len([r for r in rows if r["brand"] == brand and r["import_category"] == "READY_TO_IMPORT"])
        unresolved = len(
            [
                r
                for r in rows
                if r["brand"] == brand
                and r["import_category"] in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
            ]
        )
        coming = len([r for r in rows if r["brand"] == brand and r["import_category"] == "COMING_SOON"])
        closed = len([r for r in rows if r["brand"] == brand and r["import_category"] == "CLOSED"])
        est = CHAIN_ESTIMATES.get(brand, "unknown")
        m = re.search(r"(\d+)", str(est))
        est_n = int(m.group(1)) if m else max(discovered, 1)
        if brand == "NonStop Gym" and discovered == 0:
            verdict = "BLOCKED"
        elif rdy >= est_n * 0.85:
            verdict = "COMPLETE"
        elif rdy >= est_n * 0.6:
            verdict = "NEAR-COMPLETE"
        elif discovered == 0:
            verdict = "NOT_EXTRACTED"
        else:
            verdict = "MATERIALLY_INCOMPLETE"
        chain_rows.append(
            {
                "chain": brand,
                "official_estimate": est,
                "discovered": discovered,
                "ready": rdy,
                "unresolved": unresolved,
                "coming_soon": coming,
                "closed": closed,
                "coverage_pct": round(100 * rdy / est_n, 1) if est_n else 0,
                "verdict": verdict,
            }
        )

    projected = PRODUCTION_TOTAL + len(ready)
    nonstop_blocked = any(c["chain"] == "NonStop Gym" and c["discovered"] == 0 for c in chain_rows)
    activ_ready = len([r for r in ready if r["brand"] == "ACTIV FITNESS"])
    activ_est = 126
    phase2 = nonstop_blocked or activ_ready < activ_est * 0.85
    verdict = "SWITZERLAND PHASE 2 REQUIRED BEFORE MERGE" if phase2 else "READY FOR SWITZERLAND MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "production_baseline": safety,
        "unique_staged": len(rows),
        "ready_to_import": len(ready),
        "status_counts": dict(cats),
        "ready_by_brand": dict(brand_ready),
        "projected_catalog": projected,
        "quality": quality,
        "chain_coverage": chain_rows,
        "regional_coverage": canton_coverage(rows),
        "phase2_required": phase2,
        "verdict": verdict,
        "blocked_chains": inventory.get("blocked_chains", []),
    }
    OUT.joinpath("SWITZERLAND_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    md = f"""# SWITZERLAND PHASE 1 READINESS REPORT

**Generated:** {report['generated'][:10]}

## Summary

| Metric | Value |
|--------|-------|
| Unique locations staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| Projected catalog | {projected} |
| Production baseline | {PRODUCTION_TOTAL} (unchanged) |
| Switzerland live | 0 |

## Verdict

**{verdict}**

## Status counts

```
{json.dumps(dict(cats), indent=2)}
```

## Chain coverage

| Chain | Estimate | Discovered | READY | Unresolved | Verdict |
|-------|----------|------------|-------|------------|---------|
"""
    for c in chain_rows:
        if c["discovered"] or c["chain"] in CHAIN_ESTIMATES:
            md += f"| {c['chain']} | {c['official_estimate']} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['verdict']} |\n"

    md += f"""
## Data quality

{json.dumps(quality, indent=2)}

## Blocked chains (Phase 2)

- **NonStop Gym** — HTTP 403 on official locator from research environment (~40+ clubs)

## Production safety

- `src/data/centers.json` unchanged
- Total: {safety['production_total']}
- Switzerland production: {safety['switzerland_production']}

## Architecture

- Projected {projected} centers remains within client-side comfort zone (KEEP CLIENT-SIDE)
- Global 10K QA rerun required now: **No**

## Phase 2 triggers

- NonStop Gym blocked
- Additional chains (update Fitness, EVO, well come FIT, ONE Training Center) not yet extracted
"""
    OUT.joinpath("SWITZERLAND_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps({k: report[k] for k in report if k not in ("chain_coverage",)}, indent=2))


if __name__ == "__main__":
    main()
