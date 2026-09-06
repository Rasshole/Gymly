#!/usr/bin/env python3
"""Rebuild Phase 2 candidate staging from all scrapes; update Phase 1 unresolved."""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

UA = "GymlyNorwayResearch/1.0"
RAW = Path("data/norway/phase2_raw")
NORWAY = Path("data/norway")
STAGING = NORWAY / "norway_centers_staging.json"
CENTERS = Path("src/data/centers.json")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "ignore")


def strip(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    t = re.sub(r"<[^>]+>", "\n", html)
    return re.sub(r"\n+", "\n", t)


def norm(s: str) -> str:
    s = (s or "").lower().replace("æ", "ae").replace("ø", "o").replace("å", "a")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def make_id(brand, name, address, postal, city):
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (name or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
        ]
    )
    return "no_" + hashlib.md5(key.encode()).hexdigest()[:10]


def parse_one_line_addr(line: str):
    m = re.match(r"^\s*(.+?),\s*(\d{4})\s+(.+?)\s*$", line.strip())
    if not m:
        return None
    city = re.sub(r",?\s*Norway\s*$", "", m.group(3), flags=re.I).strip()
    if "," in city:
        city = city.split(",", 1)[0].strip()
    return {
        "address": m.group(1).strip().rstrip(","),
        "postal_code": m.group(2),
        "city": city,
    }


def row_from(brand, name, center_name, source_url, parsed, legacy=None, coming_soon=False):
    address = (parsed or {}).get("address") or ""
    postal = (parsed or {}).get("postal_code") or ""
    city = (parsed or {}).get("city") or ""
    has = bool(address and postal and city)
    return {
        "id": make_id(brand, name, address, postal, city),
        "name": name,
        "brand": brand,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Norway",
        "lat": None,
        "lng": None,
        "is_active": False,
        "is_coming_soon": True if coming_soon else None,
        "verification_status": "verified_official" if has else "location_known_address_pending",
        "source_url": source_url,
        "legacy_brand": legacy,
        "center_name": center_name,
        "import_category": "READY_TO_GEOCODE" if has else "NEEDS_REVIEW",
        "phase": "phase2",
        "phase2_ready_for_geocode": has,
    }


def scrape_sky():
    links = set()
    for f in list(RAW.glob("sky_*.html")) + ([RAW / "sky_list.html"] if (RAW / "sky_list.html").exists() else []):
        links |= set(re.findall(r"https://skyfitness\.no/sentere/[^\"#]+", f.read_text(errors="ignore")))
    links = sorted({u.rstrip("/") + "/" for u in links})
    out = []
    coming_note = []
    for i, url in enumerate(links, 1):
        html = fetch(url)
        text = strip(html)
        parsed = None
        for ln in text.split("\n"):
            ln = ln.strip()
            if re.search(r",\s*\d{4}\s+\S", ln) and len(ln) < 90:
                if "copyright" in ln.lower() or "åpner" in ln.lower():
                    if "åpner" in ln.lower():
                        coming_note.append(ln)
                    continue
                p = parse_one_line_addr(ln)
                if p and re.search(r"\d", p["address"]):
                    parsed = p
                    break
        slug = url.rstrip("/").split("/")[-1]
        print(f"SKY [{i}/{len(links)}] {slug} => {parsed}")
        out.append(
            {
                "brand": "SKY Fitness",
                "center_name": slug,
                "name": "SKY Fitness " + slug.replace("-", " ").title(),
                "source_url": url,
                "parsed": parsed,
            }
        )
        time.sleep(0.8)
    return out, coming_note


def scrape_spenst():
    html = fetch("https://spenst.no/finn-treningssenter/")
    RAW.joinpath("spenst_list.html").write_text(html, encoding="utf-8")
    text = strip(html)
    out = []
    coming = []
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    for i, ln in enumerate(lines):
        if "åpner" in ln.lower() and "spenst" in ln.lower():
            coming.append(ln)
        p = parse_one_line_addr(ln)
        if not p:
            continue
        # find nearby name
        name = None
        for back in range(1, 6):
            if i - back < 0:
                break
            cand = lines[i - back]
            if "spenst" in cand.lower() and len(cand) < 60:
                name = cand
                break
        if not name:
            name = f"Spenst {p['city']}"
        if not name.lower().startswith("spenst"):
            name = f"Spenst {name}"
        out.append(
            {
                "brand": "Spenst",
                "center_name": name,
                "name": name,
                "source_url": "https://spenst.no/finn-treningssenter/",
                "parsed": p,
            }
        )
    # dedupe
    uniq = {}
    for r in out:
        uniq[(norm(r["parsed"]["address"]), r["parsed"]["postal_code"])] = r
    out = list(uniq.values())
    print("Spenst", len(out), "coming", coming)
    return out, coming


def main():
    # Fix 3T melhus/rosten
    t3 = json.loads((NORWAY / "phase2_3t_scrape.json").read_text(encoding="utf-8"))
    for s in t3:
        if s["center_name"] == "3t-melhus":
            s["parsed"] = {
                "address": "Melhusvegen 475",
                "postal_code": "7224",
                "city": "Melhus",
            }
        if s["center_name"] == "3t-rosten":
            s["parsed"] = {
                "address": "Vestre Rosten 80",
                "postal_code": "7075",
                "city": "Trondheim",
            }
    (NORWAY / "phase2_3t_scrape.json").write_text(
        json.dumps(t3, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Fix MOVA missing city 5300 / 5951
    mova = json.loads((NORWAY / "phase2_mova_scrape.json").read_text(encoding="utf-8"))
    for s in mova:
        p = s.get("parsed") or {}
        if p.get("postal_code") == "5300" and not p.get("city"):
            p["city"] = "Askøy"
            s["parsed"] = p
        if p.get("postal_code") == "5951" and not p.get("city"):
            p["city"] = "Alver"
            s["parsed"] = p
    (NORWAY / "phase2_mova_scrape.json").write_text(
        json.dumps(mova, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print("=== SKY ===")
    sky, sky_coming = scrape_sky()
    (NORWAY / "phase2_sky_scrape.json").write_text(
        json.dumps({"centers": sky, "coming_notes": sky_coming}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )

    print("=== Spenst ===")
    spenst, spenst_coming = scrape_spenst()
    (NORWAY / "phase2_spenst_scrape.json").write_text(
        json.dumps(
            {"centers": spenst, "coming_notes": spenst_coming},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    feel = json.loads((NORWAY / "phase2_feel24_scrape.json").read_text(encoding="utf-8"))

    # Update phase1 staging 3T + Feel24 cities
    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    for r in staging:
        if r.get("city"):
            r["city"] = r["city"].split(",")[0].strip()
        if r.get("brand") == "3T-Treningssenter" and r.get("import_category") != "MERGED_INTO_CATALOG":
            blob = norm(r["name"])
            for s in t3:
                if not s.get("parsed"):
                    continue
                slug = norm(s["center_name"].replace("3t-", ""))
                if any(tok in blob for tok in slug.split() if len(tok) > 3):
                    p = s["parsed"]
                    r.update(
                        {
                            "address": p["address"],
                            "postal_code": p["postal_code"],
                            "city": p["city"],
                            "source_url": s["source_url"],
                            "verification_status": "verified_official",
                            "phase2_ready_for_geocode": True,
                            "import_category": "NEEDS_COORDINATES",
                        }
                    )
                    print("staging 3T updated", r["name"], p)
                    break

    # Build discoveries
    discoveries = []
    for s in feel:
        if not s.get("parsed"):
            continue
        p = s["parsed"]
        p["address"] = (p.get("address") or "").rstrip(", ").strip()
        p["city"] = (p.get("city") or "").split(",")[0].strip()
        discoveries.append(
            row_from(
                "Feel24",
                s.get("name") or f"Feel24 {s.get('center_name')}",
                s.get("center_name"),
                s.get("source_url"),
                p,
            )
        )
    for s in t3:
        if s.get("parsed"):
            discoveries.append(
                row_from(
                    "3T-Treningssenter",
                    s["name"],
                    s["center_name"],
                    s["source_url"],
                    s["parsed"],
                )
            )
    for s in mova:
        if s.get("parsed") and s["parsed"].get("city"):
            discoveries.append(
                row_from("MOVA", s["name"], s.get("center_name"), s.get("source_url"), s["parsed"])
            )
    for s in sky:
        if s.get("parsed"):
            discoveries.append(
                row_from(
                    "SKY Fitness",
                    s["name"],
                    s["center_name"],
                    s["source_url"],
                    s["parsed"],
                )
            )
    for s in spenst:
        discoveries.append(
            row_from("Spenst", s["name"], s["center_name"], s["source_url"], s["parsed"])
        )

    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    live = [c for c in centers if c.get("country") == "Norway"]
    unresolved = [s for s in staging if s.get("import_category") != "MERGED_INTO_CATALOG"]

    def key_addr(r):
        return (norm(r.get("address") or ""), str(r.get("postal_code") or ""), norm(r.get("city") or ""))

    live_by = defaultdict(list)
    for c in live:
        live_by[key_addr(c)].append(c)
    st_by = defaultdict(list)
    for c in unresolved:
        st_by[key_addr(c)].append(c)
    live_ids = {c["id"] for c in live}
    st_ids = {c["id"] for c in staging}

    keep, ambiguous = [], []
    for r in discoveries:
        if r["id"] in live_ids or r["id"] in st_ids:
            ambiguous.append({**r, "dup_reason": "same_id"})
            continue
        # also skip if same brand+name already live
        k = key_addr(r)
        if k[0] and k in live_by:
            matches = live_by[k]
            same_brand = [m for m in matches if norm(m.get("brand")) == norm(r.get("brand"))]
            if same_brand:
                ambiguous.append(
                    {
                        **r,
                        "dup_reason": "same_address_same_brand_as_live",
                        "matched": [
                            {"id": m["id"], "name": m["name"], "brand": m["brand"]}
                            for m in same_brand
                        ],
                    }
                )
                continue
            r["same_address_other_brand"] = [
                {"id": m["id"], "name": m["name"], "brand": m["brand"]} for m in matches
            ]
            r["import_category"] = "POSSIBLE_COLOCATED"
        if k[0] and k in st_by:
            matches = st_by[k]
            same_brand = [m for m in matches if norm(m.get("brand")) == norm(r.get("brand"))]
            if same_brand:
                # Prefer updating staging rather than duplicating Feel24/3T/EVO
                ambiguous.append(
                    {
                        **r,
                        "dup_reason": "same_address_same_brand_as_staging",
                        "matched": [{"id": m["id"], "name": m["name"]} for m in same_brand],
                    }
                )
                continue
        keep.append(r)

    STAGING.write_text(json.dumps(staging, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (NORWAY / "phase2_new_centers_staging.json").write_text(
        json.dumps(keep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (NORWAY / "phase2_duplicate_analysis.json").write_text(
        json.dumps(ambiguous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    summary = {
        "feel24_with_address": sum(1 for x in feel if x.get("parsed")),
        "3t_with_address": sum(1 for x in t3 if x.get("parsed")),
        "mova_with_city": sum(1 for x in mova if x.get("parsed") and x["parsed"].get("city")),
        "sky_with_address": sum(1 for x in sky if x.get("parsed")),
        "spenst_with_address": len(spenst),
        "phase2_new_keep": len(keep),
        "phase2_ambiguous": len(ambiguous),
        "phase2_new_by_brand": dict(Counter(r["brand"] for r in keep)),
        "staging_ready_for_geocode": sum(1 for r in staging if r.get("phase2_ready_for_geocode")),
        "sky_coming_notes": sky_coming,
        "spenst_coming_notes": spenst_coming,
        "sporty": "JS-rendered; addresses not extractable from static HTML — flagged for manual/API follow-up",
        "fitness24seven": "Static pages lacked address list — flagged for manual follow-up",
        "impulse": "4 center URLs found (Lade, Lerkendal, Pirbadet, Solsiden) but addresses not in static HTML — flagged",
    }
    (NORWAY / "phase2_discovery_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
