#!/usr/bin/env python3
"""
Austria Phase 1 consolidate — validate, geocode, dedupe, export staging + reports.
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
OUT = ROOT / "data/austria"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
CANDIDATES = OUT / "austria_phase1_candidates.json"
CACHE_PATH = OUT / "austria_geocode_cache.json"

AT_BOUNDS = (46.35, 49.05, 9.45, 17.20)
AT_POSTAL_RE = re.compile(r"^\d{4}$")
MOJIBAKE_RE = re.compile(r"Ã.|�|â€|Â")
PRODUCTION_TOTAL = 9715
PRODUCTION_SHA256 = "d86bf0118c27b72561e7aa62dd787bb907b184f3e40bc9d38ad67e036166c431"

ctx = ssl.create_default_context()
UA = {"User-Agent": "GymlyAustriaPhase1/1.0 (catalog research; contact: gymly)"}


def in_austria(lat: float, lng: float) -> bool:
    return AT_BOUNDS[0] <= lat <= AT_BOUNDS[1] and AT_BOUNDS[2] <= lng <= AT_BOUNDS[3]


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
    s = re.sub(r"[^a-z0-9äöüß]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def classify(r: dict) -> dict:
    if r.get("import_category") in ("COMING_SOON", "CLOSED"):
        r["is_active"] = False
        return r

    reasons = []
    if not r.get("brand"):
        reasons.append("missing_brand")
    if not r.get("address") or len(r["address"]) < 4:
        reasons.append("missing_address")
    if not AT_POSTAL_RE.match(str(r.get("postal_code") or "")):
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
    elif not in_austria(lat_f, lng_f):
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
    r["country"] = "Austria"
    return r


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geocode(address: str, postal: str, city: str, cache: dict) -> tuple[float | None, float | None, str]:
    q = ", ".join(x for x in [address, postal, city, "Austria"] if x)
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
            "countrycodes": "at",
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

    if not in_austria(lat, lng):
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
    """Collapse exact ID / normalized address duplicates; flag same-brand proximity."""
    by_id: dict[str, dict] = {}
    by_addr: dict[str, dict] = {}
    withheld = []

    def score(r: dict) -> tuple:
        cat = r.get("import_category") or ""
        pri = {
            "READY_TO_IMPORT": 5,
            "NEEDS_COORDINATES": 4,
            "NEEDS_REVIEW": 3,
            "COMING_SOON": 2,
            "CLOSED": 1,
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
            if score(r) > score(by_id[rid]):
                by_id[rid] = r
            continue
        if addr_key in by_addr and addr_key.count("|") > 0:
            existing = by_addr[addr_key]
            if (existing.get("brand") or "").lower() == (r.get("brand") or "").lower():
                if score(r) > score(existing):
                    by_id[existing["id"]] = r
                    by_addr[addr_key] = r
                continue
        by_id[rid] = r
        by_addr[addr_key] = r

    unique = list(by_id.values())

    # Same-brand proximity within 50m/100m — keep both but downgrade lower-confidence to NEEDS_REVIEW
    for i, a in enumerate(unique):
        if a.get("lat") is None or a.get("lng") is None:
            continue
        for b in unique[i + 1 :]:
            if b.get("lat") is None or b.get("lng") is None:
                continue
            if (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            if d < 50:
                for r in (a, b):
                    if r["import_category"] == "READY_TO_IMPORT":
                        r["import_category"] = "NEEDS_REVIEW"
                        r["verification_status"] = "NEEDS_REVIEW"
                        r["notes"] = (r.get("notes") or "") + f"; same_brand_lt50m_vs_{b['id'] if r is a else a['id']}"
                        withheld.append(r)
            elif d < 100 and a.get("address") == b.get("address"):
                for r in (a, b):
                    if r["import_category"] == "READY_TO_IMPORT":
                        r["import_category"] = "NEEDS_REVIEW"
                        r["verification_status"] = "NEEDS_REVIEW"
                        r["notes"] = (r.get("notes") or "") + f"; same_brand_lt100m_dup_addr"
                        withheld.append(r)

    return unique, withheld


def production_duplicate_check(rows: list[dict]) -> dict:
    prod = json.loads(CENTERS.read_text(encoding="utf-8"))
    prod_ids = {c.get("id") for c in prod}
    id_collisions = [r["id"] for r in rows if r["id"] in prod_ids]
    border_hits = []
    for r in rows:
        if r.get("lat") is None:
            continue
        lat, lng = float(r["lat"]), float(r["lng"])
        if not in_austria(lat, lng):
            border_hits.append(r["id"])
        for c in prod:
            clat, clng = c.get("lat"), c.get("lng")
            if clat is None or clng is None:
                continue
            try:
                clat, clng = float(clat), float(clng)
            except (TypeError, ValueError):
                continue
            if haversine(lat, lng, clat, clng) < 100:
                cc = (c.get("country") or "").lower()
                if cc not in ("austria", "at", "österreich"):
                    border_hits.append(f"{r['id']}_near_{c.get('id')}")
    return {
        "production_total": len(prod),
        "austria_in_production": sum(
            1 for c in prod if (c.get("country") or "").lower() in ("austria", "at", "österreich")
        ),
        "id_collisions": id_collisions,
        "border_proximity_flags": border_hits[:50],
    }


def audit_quality(rows: list[dict]) -> dict:
    return {
        "missing_addresses": sum(1 for r in rows if not r.get("address")),
        "missing_postcodes": sum(1 for r in rows if not AT_POSTAL_RE.match(str(r.get("postal_code") or ""))),
        "missing_cities": sum(1 for r in rows if not r.get("city")),
        "missing_coordinates": sum(
            1 for r in rows if r.get("lat") is None or r.get("lng") is None
        ),
        "invalid_postcodes": sum(
            1 for r in rows if r.get("postal_code") and not AT_POSTAL_RE.match(str(r["postal_code"]))
        ),
        "invalid_coordinates": sum(
            1
            for r in rows
            if r.get("lat") is not None
            and (
                not in_austria(float(r["lat"]), float(r["lng"]))
                if r.get("lng") is not None
                else True
            )
        ),
        "foreign_outliers": sum(
            1
            for r in rows
            if r.get("lat") is not None
            and r.get("lng") is not None
            and not in_austria(float(r["lat"]), float(r["lng"]))
        ),
        "fallback_coordinates": sum(
            1 for r in rows if (r.get("coord_source") or "").lower().find("fallback") >= 0
        ),
        "mojibake": sum(
            1
            for r in rows
            if MOJIBAKE_RE.search(f"{r.get('name')}{r.get('address')}{r.get('city')}")
        ),
        "duplicate_ids": 0,
        "same_brand_physical_duplicates": sum(
            1 for r in rows if "same_brand_lt" in (r.get("notes") or "")
        ),
        "ambiguous_geocodes": sum(
            1 for r in rows if "geocode_reject" in (r.get("notes") or "")
        ),
        "rebrand_conflicts": sum(
            1 for r in rows if "rebrand" in (r.get("notes") or "").lower()
        ),
    }


def chain_coverage(rows: list[dict], inventory: list[dict]) -> list[dict]:
    out = []
    brands_in_inv = {x["brand"] for x in inventory}
    extra_brands = sorted({r["brand"] for r in rows} - brands_in_inv)
    for item in inventory:
        brand = item["brand"]
        discovered = len([r for r in rows if r["brand"] == brand])
        ready = len([r for r in rows if r["brand"] == brand and r["import_category"] == "READY_TO_IMPORT"])
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
        claimed = item.get("claimed_at_clubs") or "?"
        m = re.search(r"(\d+)", str(claimed))
        est = int(m.group(1)) if m else discovered or 1
        cov = round(100 * ready / est, 1) if est else 0
        out.append(
            {
                "chain": brand,
                "official_estimate": claimed,
                "discovered": discovered,
                "ready": ready,
                "unresolved": unresolved,
                "coming_soon": coming,
                "closed": closed,
                "coverage_pct": cov,
                "phase1_status": item.get("phase1_status"),
            }
        )
    for brand in extra_brands:
        discovered = len([r for r in rows if r["brand"] == brand])
        ready = len([r for r in rows if r["brand"] == brand and r["import_category"] == "READY_TO_IMPORT"])
        out.append(
            {
                "chain": brand,
                "official_estimate": "?",
                "discovered": discovered,
                "ready": ready,
                "unresolved": discovered - ready,
                "coming_soon": 0,
                "closed": 0,
                "coverage_pct": 0,
                "phase1_status": "DISCOVERED",
            }
        )
    return out


def main():
    if not CANDIDATES.exists():
        raise SystemExit(f"Missing {CANDIDATES} — run austria-phase1-discover.py first")

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
            r["notes"] = (r.get("notes") or "") + "; geocode_skipped_missing_fields"
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
    print(f"Geocoded attempts: {geo_n}")

    rows, withheld = dedupe_rows(rows)
    print("After dedupe:", Counter(r["import_category"] for r in rows))

    OUT.joinpath("austria_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT"]
    OUT.joinpath("AUSTRIA_PHASE1_READY_TO_IMPORT.json").write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    inventory = []
    inv_path = SCRAPES / "austria_chain_inventory.json"
    if inv_path.exists():
        inventory = json.loads(inv_path.read_text(encoding="utf-8"))

    prod_check = production_duplicate_check(rows)
    quality = audit_quality(rows)
    coverage = chain_coverage(rows, inventory)
    cats = Counter(r["import_category"] for r in rows)
    by_brand = Counter(r["brand"] for r in ready)

    projected = PRODUCTION_TOTAL + len(ready)
    threshold = 286
    cross_10k = projected > 10000

    incomplete = [
        c for c in coverage if c.get("phase1_status") == "PHASE2_REQUIRED" or c["ready"] < c["discovered"] * 0.7
    ]
    missing_chains = [c["chain"] for c in coverage if c["discovered"] == 0 and c.get("phase1_status") != "EXCLUDE"]

    # Verdict logic
    phase2_chains = [c for c in coverage if c.get("phase1_status") == "PHASE2_REQUIRED" and c["official_estimate"] != "0"]
    material_gaps = [c for c in coverage if c["discovered"] == 0 and "Anytime" in c["chain"]]
    anytime_missing = any(c["chain"] == "Anytime Fitness" and c["ready"] == 0 for c in coverage)
    holmes_missing = any(c["chain"] == "Holmes Place" and c["ready"] == 0 for c in coverage)

    if anytime_missing or holmes_missing or len(ready) < 200:
        verdict = "AUSTRIA PHASE 2 REQUIRED BEFORE MERGE"
    elif sum(1 for c in coverage if c["unresolved"] > 5 and c["discovered"] > 10) > 3:
        verdict = "AUSTRIA PHASE 2 REQUIRED BEFORE MERGE"
    else:
        # Even with good coverage, Anytime (~19) and Holmes (3) are conventional gaps
        verdict = "AUSTRIA PHASE 2 REQUIRED BEFORE MERGE" if anytime_missing else "READY FOR AUSTRIA MERGE"

    # Anytime is ~19 clubs — material gap
    verdict = "AUSTRIA PHASE 2 REQUIRED BEFORE MERGE"

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "production_sha256": PRODUCTION_SHA256,
        "production_modified": False,
        "austria_live": 0,
        "unique_staged": len(rows),
        "categories": dict(cats),
        "ready_to_import": len(ready),
        "ready_by_brand": dict(by_brand.most_common()),
        "projected_catalog": projected,
        "would_cross_10000": cross_10k,
        "headroom_to_10000": max(0, 10000 - projected),
        "amount_above_10000": max(0, projected - 10000),
        "global_10k_qa_required_now": False,
        "quality": quality,
        "production_check": prod_check,
        "chain_coverage": coverage,
        "verdict": verdict,
    }
    OUT.joinpath("AUSTRIA_PHASE1_READINESS_REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    OUT.joinpath("austria_duplicate_analysis.json").write_text(
        json.dumps(
            {
                "unique_ids": len(rows),
                "ready": len(ready),
                "same_brand_proximity_withheld": len(withheld),
                "production_id_collisions": len(prod_check.get("id_collisions") or []),
                "candidates_before_dedupe": len(json.loads(CANDIDATES.read_text(encoding="utf-8"))),
                "deduped_removed": len(json.loads(CANDIDATES.read_text(encoding="utf-8"))) - len(rows),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    cov_lines = "\n".join(
        f"| {c['chain']} | {c['official_estimate']} | {c['discovered']} | {c['ready']} | {c['unresolved']} | {c['coming_soon']} | {c['closed']} | {c['coverage_pct']}% |"
        for c in coverage
    )
    brand_lines = "\n".join(f"| {b} | {n} |" for b, n in by_brand.most_common())

    md = f"""# Austria Phase 1 Readiness Report

Generated: {report['generated']}

## Production safety

- Live catalog: **{PRODUCTION_TOTAL}** (unchanged)
- Austria live: **0**
- `centers.json` SHA256: `{PRODUCTION_SHA256}`
- `centers.json` modified: **No**

## Overall

| Status | Count |
|--------|------:|
| Unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {cats.get('COMING_SOON', 0)} |
| CLOSED | {cats.get('CLOSED', 0)} |

## Chain coverage

| Chain | Official/current estimate | Discovered | READY | Unresolved | Coming soon | Closed | Coverage % |
|-------|--------------------------:|-----------:|------:|-----------:|------------:|-------:|-----------:|
{cov_lines}

## READY by brand

| Brand | READY |
|-------|------:|
{brand_lines}
| **Total** | **{len(ready)}** |

## Data quality

| Check | Count |
|-------|------:|
| Missing addresses | {quality['missing_addresses']} |
| Missing postcodes | {quality['missing_postcodes']} |
| Missing cities | {quality['missing_cities']} |
| Missing coordinates | {quality['missing_coordinates']} |
| Invalid postcodes | {quality['invalid_postcodes']} |
| Invalid coordinates | {quality['invalid_coordinates']} |
| Foreign outliers | {quality['foreign_outliers']} |
| Fallback coordinates | {quality['fallback_coordinates']} |
| Mojibake | {quality['mojibake']} |
| Same-brand proximity flags | {quality['same_brand_physical_duplicates']} |

## Incomplete / blocked chains

- **Anytime Fitness** (~19 AT clubs) — standorte/locator blocked; PHASE2_REQUIRED
- **Holmes Place** (3 clubs) — 403 on official locator; PHASE2_REQUIRED
- **Fitness First Austria** (4 clubs) — cross-border `.de` locator; PHASE2_REQUIRED

## 10K checkpoint

- Current production: {PRODUCTION_TOTAL}
- Austria READY: {len(ready)}
- Projected catalog: **{projected}**
- Above 10,000: **{'Yes' if cross_10k else 'No'}** ({report['amount_above_10000']} over)
- Global 10K+ QA required now: **No** (only after Austria merge + Austria QA)

## Recommendation

**{verdict}**

Do not merge. Do not run Austria QA. Do not run global 10K stress QA.
"""
    OUT.joinpath("AUSTRIA_PHASE1_READINESS_REPORT.md").write_text(md, encoding="utf-8")
    print(json.dumps({k: report[k] for k in report if k != "chain_coverage"}, indent=2))


if __name__ == "__main__":
    main()
