#!/usr/bin/env python3
"""
Consolidate Germany scrapes → staging, geocode NEEDS_COORDINATES (Nominatim countrycodes=de),
duplicate analysis vs live centers.json, Excel export, readiness report.

Does NOT modify centers.json.
"""
from __future__ import annotations

import csv
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

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/germany"
SCRAPES = OUT / "scrapes"
CENTERS = ROOT / "src/data/centers.json"
STAGING = OUT / "germany_centers_staging.json"

ctx = ssl.create_default_context()
UA = "GymlyGermanyGeocoder/1.0 (catalog research)"
DE_BOUNDS = (47.0, 55.5, 5.5, 15.5)


def make_id(brand, address, postal, city):
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().lower(),
            (city or "").strip().lower(),
            "germany",
        ]
    )
    return "de_" + hashlib.md5(key.encode()).hexdigest()[:10]


def norm(s):
    s = (s or "").lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def load_scrapes():
    rows = []
    # base staging from first discovery
    if STAGING.exists():
        rows.extend(json.loads(STAGING.read_text(encoding="utf-8")))
    for name in [
        "easyfitness_germany.json",
        "clever_fit_germany.json",
        "fitness_first_germany.json",
        "injoy_germany.json",
        "elbgym_germany.json",
    ]:
        p = SCRAPES / name
        if p.exists():
            extra = json.loads(p.read_text(encoding="utf-8"))
            print("load", name, len(extra))
            rows.extend(extra)
    # ensure ids
    for r in rows:
        if not r.get("id"):
            r["id"] = make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"))
        r["country"] = "Germany"
    return rows


def dedupe(rows):
    by_id = {}
    amb = []
    for r in rows:
        rid = r["id"]
        if rid in by_id:
            # prefer row with coords / better address
            old = by_id[rid]
            score = lambda x: (
                1 if x.get("lat") is not None else 0,
                1 if x.get("address") else 0,
                1 if x.get("postal_code") else 0,
            )
            if score(r) > score(old):
                amb.append({"reason": "same_id_replaced", "kept": r.get("name"), "dropped": old.get("name")})
                by_id[rid] = r
            else:
                amb.append({"reason": "same_id_kept_existing", "kept": old.get("name"), "dropped": r.get("name")})
            continue
        by_id[rid] = r

    keep = list(by_id.values())
    # brand+address dedupe
    by_key = {}
    final = []
    for r in keep:
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in by_key:
            amb.append(
                {
                    "reason": "same_brand_address",
                    "a": by_key[key].get("name"),
                    "b": r.get("name"),
                }
            )
            continue
        if key[1]:
            by_key[key] = r
        final.append(r)
    return final, amb


def classify(r):
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    if r.get("lat") is not None and r.get("lng") is not None:
        try:
            lat, lng = float(r["lat"]), float(r["lng"])
            if math.isfinite(lat) and math.isfinite(lng) and not (lat == 0 and lng == 0):
                lo, hi, w, e = DE_BOUNDS
                if lo <= lat <= hi and w <= lng <= e:
                    r["import_category"] = "READY_TO_IMPORT"
                    r["lat"], r["lng"] = lat, lng
                    return r
                r["notes"] = ((r.get("notes") or "") + "; coord_outside_de_bbox").strip("; ")
                r["lat"] = r["lng"] = None
        except (TypeError, ValueError):
            r["lat"] = r["lng"] = None
    r["import_category"] = "NEEDS_COORDINATES"
    r["phase1_ready_for_geocode"] = True
    return r


def nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 5,
            "countrycodes": "de",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())


def score_candidate(item, street, postal, city):
    reasons = []
    score = 0
    display = (item.get("display_name") or "").lower()
    addr = item.get("address") or {}
    lat, lng = float(item["lat"]), float(item["lon"])
    lo, hi, w, e = DE_BOUNDS
    if not (lo <= lat <= hi and w <= lng <= e):
        return None, ["outside_de"], lat, lng

    # reject coarse types
    t = (item.get("type") or item.get("class") or "").lower()
    if t in {
        "country",
        "state",
        "county",
        "municipality",
        "city",
        "town",
        "village",
        "administrative",
        "postcode",
    }:
        return None, ["coarse_type:" + t], lat, lng

    pc = str(addr.get("postcode") or "")
    if postal and pc == postal:
        score += 5
        reasons.append("postal_exact")
    elif postal and pc and pc[:3] == postal[:3]:
        score += 1
        reasons.append("postal_soft")

    city_n = norm(city)
    city_fields = " ".join(
        norm(addr.get(k) or "")
        for k in ("city", "town", "village", "municipality", "suburb")
    )
    if city_n and city_n in city_fields:
        score += 3
        reasons.append("city_ok")

    street_n = norm(street)
    road = norm(addr.get("road") or "")
    # Str. / Straße normalization already via norm roughly
    street_core = street_n
    for tok in ["strasse", "str", "weg", "platz", "allee"]:
        street_core = street_core.replace(tok, " ")
    road_core = road
    for tok in ["strasse", "str", "weg", "platz", "allee"]:
        road_core = road_core.replace(tok, " ")
    if road and street_n and (road in street_n or street_n in display):
        score += 4
        reasons.append("road_match")
    hn = str(addr.get("house_number") or "")
    m = re.search(r"\b(\d+[a-z]?)\b", street.lower())
    if hn and m and hn.lower() == m.group(1).lower():
        score += 3
        reasons.append("house_number_match")

    if score < 6:
        return None, reasons + ["score_too_low"], lat, lng
    return score, reasons, lat, lng


def geocode_row(r):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    queries = [
        f"{street}, {postal} {city}, Germany",
        f"{street}, {postal}, Germany",
        f"{street}, {city}, Germany",
    ]
    best = None
    all_rej = []
    for q in queries:
        try:
            items = nominatim(q)
            time.sleep(1.1)
        except Exception as e:
            all_rej.append({"query": q, "error": str(e)})
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
            if sc is None:
                all_rej.append({"query": q, "reject": reasons, "display": it.get("display_name")})
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name")))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        top = scored[0]
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            # ambiguous if far apart
            d = haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3])
            if d > 150:
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
                r["geocode_reasons"] = [top[1], scored[1][1]]
                r["lat"] = r["lng"] = None
                return r
        soft = "postal_soft" in top[1] and "postal_exact" not in top[1]
        r["lat"] = round(top[2], 6)
        r["lng"] = round(top[3], 6)
        r["geocode_status"] = "suspicious" if soft else "ok"
        r["geocode_reasons"] = top[1]
        r["geocode_display"] = top[4]
        r["coord_source"] = "nominatim"
        r["import_category"] = "READY_TO_IMPORT"
        if soft:
            r["notes"] = ((r.get("notes") or "") + "; soft_postal").strip("; ")
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    r["geocode_status"] = "failed"
    r["geocode_rejected"] = all_rej[:5]
    r["lat"] = r["lng"] = None
    return r


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    live = [c for c in centers if c.get("country") == "Germany"]
    # also check all countries for id collision / weird matches
    all_ids = {c["id"] for c in centers}
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers
        if c.get("address")
    }
    report = {
        "existing_germany_in_catalog": len(live),
        "id_collisions": [],
        "same_brand_address_matches": [],
        "proximity_same_brand": [],
    }
    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_matches"].append(
                {"staging": r.get("name"), "live": live_addr[key].get("name"), "id": r["id"]}
            )
        if r.get("lat") is None:
            continue
        for c in centers:
            if c.get("lat") is None or c.get("lng") is None:
                continue
            if norm(c.get("brand")) != norm(r.get("brand")):
                continue
            try:
                d = haversine(float(r["lat"]), float(r["lng"]), float(c["lat"]), float(c["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 50:
                report["proximity_same_brand"].append(
                    {
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "distance_m": round(d),
                        "live_country": c.get("country"),
                    }
                )
    return report, centers


def write_excel(rows):
    cols = [
        "id",
        "brand",
        "name",
        "center_name",
        "address",
        "postal_code",
        "city",
        "country",
        "latitude",
        "longitude",
        "import_category",
        "verification_status",
        "geocode_status",
        "source_url",
        "website",
        "opening_hours",
        "legacy_brand",
        "notes",
    ]
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            (r.get("brand") or "").casefold(),
            (r.get("city") or "").casefold(),
            (r.get("name") or "").casefold(),
        ),
    )
    wb = Workbook()
    ws = wb.active
    ws.title = "Germany Discovered"
    ws.append(cols)
    for r in sorted_rows:
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
                r.get("center_name"),
                r.get("address"),
                r.get("postal_code"),
                r.get("city"),
                r.get("country"),
                r.get("lat"),
                r.get("lng"),
                r.get("import_category"),
                r.get("verification_status"),
                r.get("geocode_status"),
                r.get("source_url"),
                r.get("website"),
                json.dumps(r.get("opening_hours"), ensure_ascii=False)
                if isinstance(r.get("opening_hours"), (dict, list))
                else r.get("opening_hours"),
                r.get("legacy_brand"),
                r.get("notes"),
            ]
        )
    path = OUT / "Gymly_Germany_All_Discovered_Centers.xlsx"
    wb.save(path)
    # CSV twin
    csv_path = OUT / "Gymly_Germany_All_Discovered_Centers.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in sorted_rows:
            w.writerow(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
                    r.get("center_name"),
                    r.get("address"),
                    r.get("postal_code"),
                    r.get("city"),
                    r.get("country"),
                    r.get("lat"),
                    r.get("lng"),
                    r.get("import_category"),
                    r.get("verification_status"),
                    r.get("geocode_status"),
                    r.get("source_url"),
                    r.get("website"),
                    r.get("opening_hours")
                    if not isinstance(r.get("opening_hours"), (dict, list))
                    else json.dumps(r.get("opening_hours"), ensure_ascii=False),
                    r.get("legacy_brand"),
                    r.get("notes"),
                ]
            )
    return path, csv_path


def main():
    before_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    rows = load_scrapes()
    print("loaded raw", len(rows))
    rows, amb = dedupe(rows)
    rows = [classify(r) for r in rows]
    print("deduped", len(rows), Counter(r["import_category"] for r in rows))
    print("brands", Counter(r["brand"] for r in rows))

    # Geocode needs
    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
    ]
    print("geocode todo", len(todo))
    review = []
    for i, r in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {r.get('name')[:50]}")
        geocode_row(r)
        review.append(
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "brand": r.get("brand"),
                "address": r.get("address"),
                "postal_code": r.get("postal_code"),
                "city": r.get("city"),
                "latitude": r.get("lat"),
                "longitude": r.get("lng"),
                "geocode_status": r.get("geocode_status"),
                "import_category": r.get("import_category"),
                "geocode_reasons": r.get("geocode_reasons"),
                "geocode_display": r.get("geocode_display"),
            }
        )

    # Reclassify after geocode
    rows = [classify(r) for r in rows]
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT.joinpath("germany_geocode_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    with (OUT / "germany_geocode_review.csv").open("w", encoding="utf-8", newline="") as f:
        cols = [
            "id",
            "name",
            "brand",
            "address",
            "postal_code",
            "city",
            "latitude",
            "longitude",
            "geocode_status",
            "import_category",
        ]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in review:
            w.writerow(r)

    dup_live, centers = vs_live(rows)
    OUT.joinpath("germany_duplicate_analysis.json").write_text(
        json.dumps({"internal": amb[:200], "vs_live": dup_live}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )

    xlsx, csvp = write_excel(rows)
    after_sha = hashlib.sha256(CENTERS.read_bytes()).hexdigest()

    cats = Counter(r["import_category"] for r in rows)
    brands = Counter(r["brand"] for r in rows)
    ready = [r for r in rows if r["import_category"] == "READY_TO_IMPORT" and r.get("lat") is not None]

    # Official estimates for coverage table
    official_est = {
        "clever fit": 400,
        "McFIT": 200,
        "FitX": 105,
        "EASYFITNESS": 205,
        "Fitness First": 100,
        "JOHN REED": 40,
        "Gold's Gym": 8,
        "all inclusive Fitness": 170,
        "jumpers fitness": 0,  # redirected / absorbed
        "INJOY": 100,
        "ELBGYM": 10,
        "PRIME TIME fitness": 25,
    }

    by_chain = {}
    for brand, est in official_est.items():
        sub = [r for r in rows if r.get("brand") == brand]
        by_chain[brand] = {
            "official_estimated": est,
            "discovered": len(sub),
            "verified_current": sum(
                1 for r in sub if r.get("verification_status") == "VERIFIED_CURRENT"
            ),
            "geocoded": sum(1 for r in sub if r.get("lat") is not None),
            "READY": sum(1 for r in sub if r.get("import_category") == "READY_TO_IMPORT"),
            "unresolved": sum(
                1
                for r in sub
                if r.get("import_category")
                in {"NEEDS_COORDINATES", "NEEDS_REVIEW"}
            ),
            "COMING_SOON": sum(1 for r in sub if r.get("import_category") == "COMING_SOON"),
            "CLOSED": sum(1 for r in sub if r.get("import_category") == "CLOSED"),
            "discovery_status": (
                "COMPLETE_OR_NEAR"
                if est and len(sub) >= est * 0.85
                else ("ABSORBED_OR_UNAVAILABLE" if est == 0 else "DISCOVERY_INCOMPLETE")
            ),
        }

    proposed = len(ready)
    catalog_after = len(centers) + proposed

    report_md = f"""# Germany Phase 1 Readiness Report

**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256={after_sha[:16]}…`).  
Awaiting explicit merge approval.

Generated: {datetime.now(timezone.utc).isoformat()}

---

## Overall

| Metric | Count |
|--------|------:|
| Total German locations discovered | **{len(rows)}** |
| Verified current (status) | {sum(1 for r in rows if r.get('verification_status')=='VERIFIED_CURRENT')} |
| Successfully geocoded / official coords | {sum(1 for r in rows if r.get('lat') is not None)} |
| READY_TO_IMPORT | **{cats.get('READY_TO_IMPORT', 0)}** |
| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {cats.get('COMING_SOON', 0)} |
| CLOSED | {cats.get('CLOSED', 0)} |
| Internal duplicate collapses | {len(amb)} |

Live catalog untouched: DK/SE/NO unchanged. Existing Germany in live catalog: **{dup_live['existing_germany_in_catalog']}**.

---

## By chain

| Chain | Official/est. | Discovered | Verified | Geocoded | READY | Unresolved | Status |
|-------|-------------:|-----------:|---------:|---------:|------:|-----------:|--------|
"""
    for brand, s in by_chain.items():
        report_md += (
            f"| {brand} | {s['official_estimated']} | {s['discovered']} | {s['verified_current']} | "
            f"{s['geocoded']} | {s['READY']} | {s['unresolved']} | {s['discovery_status']} |\n"
        )

    report_md += f"""

### Brand counts in staging
{dict(brands)}

---

## Data quality

| Issue | Count |
|-------|------:|
| Missing address | {sum(1 for r in rows if not r.get('address'))} |
| Missing postal | {sum(1 for r in rows if not r.get('postal_code'))} |
| Missing city | {sum(1 for r in rows if not r.get('city'))} |
| Missing coordinates | {sum(1 for r in rows if r.get('lat') is None)} |
| Soft-postal geocodes | {sum(1 for r in rows if 'soft_postal' in str(r.get('notes') or ''))} |
| Ambiguous geocode | {sum(1 for r in rows if r.get('geocode_status')=='ambiguous')} |

---

## Duplicate analysis

- ID collisions vs live catalog: **{len(dup_live['id_collisions'])}**
- Same brand+address vs live: **{len(dup_live['same_brand_address_matches'])}**
- Same-brand proximity ≤50 m vs live: **{len(dup_live['proximity_same_brand'])}**
- Internal staging dedupe events: {len(amb)}

McFIT / JOHN REED / Gold's Gym kept as **separate brands** (RSG group).

jumpers fitness: official domain redirects to **all inclusive Fitness** — not separately staged.

---

## Coverage notes

- **clever fit**: major franchise (~400 DE). Sitemap-based discovery used when scrape completed.
- **McFIT / JOHN REED / Gold's Gym**: RSG Magicline official API (DE-filtered).
- **FitX**: partial (HTML/sitemap); official ~105 → treat as DISCOVERY_INCOMPLETE if below ~90.
- **EASYFITNESS**: embedded studio directory (~203) + Nominatim geocode.
- **Fitness First**: club pages; may be incomplete vs full LifeFit portfolio.
- **INJOY / ELBGYM**: limited/no reliable extract this phase → DISCOVERY_INCOMPLETE.
- **PRIME TIME**: DE site only (CH excluded).

Do **not** call Germany complete.

---

## Proposed first safe merge

Recommend merging only:

**{proposed} READY_TO_IMPORT** rows with finite DE coordinates.

Expected catalog if approved: **{len(centers)} + {proposed} ≈ {catalog_after}** centers.

Scale check: client-side `centers.json` at ~{catalog_after} rows remains technically workable but is getting heavy; monitor search/map performance after merge. No server migration in this phase.

---

## Files

- `data/germany/germany_centers_staging.json`
- `data/germany/germany_geocode_review.json`
- `data/germany/germany_geocode_review.csv`
- `data/germany/germany_duplicate_analysis.json`
- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`
- `data/germany/Gymly_Germany_All_Discovered_Centers.csv`
- `data/germany/GERMANY_PHASE1_READINESS_REPORT.md`
- `data/germany/raw/` (HTML/API captures)
- `data/germany/scrapes/` (per-chain JSON)
- `scripts/germany-phase1-discover.py`
- `scripts/germany-discover-clever-fit.py`
- `scripts/germany-phase1-consolidate.py`

**Not modified:** `src/data/centers.json`

---

## STOP

No production merge performed. Waiting for explicit approval.
"""
    OUT.joinpath("GERMANY_PHASE1_READINESS_REPORT.md").write_text(report_md, encoding="utf-8")
    summary = {
        "total": len(rows),
        "categories": dict(cats),
        "brands": dict(brands),
        "ready": proposed,
        "by_chain": by_chain,
        "centers_json_unmodified": before_sha == after_sha,
        "xlsx": str(xlsx),
        "proposed_first_merge": proposed,
        "expected_catalog_after_merge": catalog_after,
    }
    OUT.joinpath("germany_phase1_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
