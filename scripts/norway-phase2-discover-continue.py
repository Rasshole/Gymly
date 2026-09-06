#!/usr/bin/env python3
"""Continue Norway Phase 2 discovery after Feel24 (3T, MOVA, Sporty, F24, SKY, Spenst, Impulse)."""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NORWAY = ROOT / "data" / "norway"
RAW = NORWAY / "phase2_raw"
STAGING = NORWAY / "norway_centers_staging.json"
CENTERS = ROOT / "src" / "data" / "centers.json"
UA = "GymlyNorwayResearch/1.0 (phase2; local-dev)"
SLEEP = 0.85


def fetch(url: str, timeout: int = 40) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "text/html,*/*"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", "ignore")


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", html)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n+", "\n", text)


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


def norm(s: str) -> str:
    s = (s or "").lower().replace("æ", "ae").replace("ø", "o").replace("å", "a")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def clean_city(city: str) -> str:
    city = re.sub(r",?\s*Norway\s*$", "", city or "", flags=re.I).strip()
    # "Bodø, Alstad" -> prefer first municipality token before comma if second is suburb
    if "," in city:
        city = city.split(",", 1)[0].strip()
    return city


def apply_common_address_normalization(address: str) -> str:
    a = re.sub(r"\s+", " ", (address or "").strip())
    reps = [
        (r"(?i)\bgt\.?\b", "gate"),
        (r"(?i)\bv\.?\b(?=\s*\d)", "vei"),
        (r"(?i)haakon vii gt\.?", "Haakon VIIs gate"),
        (r"(?i)sluppenv\.?", "Sluppenveien"),
    ]
    for pat, rep in reps:
        a = re.sub(pat, rep, a)
    return a.rstrip(", ").strip()


def staging_row(d, verification="verified_official"):
    parsed = d.get("parsed") or {}
    address = apply_common_address_normalization(d.get("address") or parsed.get("address") or "")
    postal = d.get("postal_code") or parsed.get("postal_code") or ""
    city = clean_city(d.get("city") or parsed.get("city") or "")
    brand = d["brand"]
    name = d.get("name") or f"{brand} {d.get('center_name','')}".strip()
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
        "verification_status": verification if has else "location_known_address_pending",
        "opening_hours_raw": d.get("opening_hours"),
        "source_url": d.get("source_url"),
        "legacy_brand": d.get("legacy_brand"),
        "center_name": d.get("center_name"),
        "import_category": "READY_TO_GEOCODE" if has else "NEEDS_REVIEW",
        "phase": "phase2",
        "phase2_ready_for_geocode": has,
    }


def scrape_3t():
    url = "https://www.3t.no/treningssenter"
    html = fetch(url)
    RAW.joinpath("3t_list.html").write_text(html, encoding="utf-8")
    paths = sorted(set(re.findall(r'href="(/treningssenter/3t-[^"]+)"', html)))
    out = []
    for path in paths:
        page_url = "https://www.3t.no" + path
        page = fetch(page_url)
        slug = path.rsplit("/", 1)[-1]
        RAW.joinpath(f"{slug}.html").write_text(page, encoding="utf-8")
        text = strip_html(page)
        parsed = None
        for m in re.finditer(
            r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{4,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
            text,
        ):
            addr = m.group(1).strip()
            if "kvm" in addr.lower() or "boltre" in addr.lower() or not re.search(r"\d", addr):
                continue
            parsed = {
                "address": apply_common_address_normalization(addr),
                "postal_code": m.group(2),
                "city": clean_city(m.group(3)),
            }
            break
        name = "3T-Treningssenter " + slug.replace("3t-", "").replace("-", " ").title()
        out.append(
            {
                "brand": "3T-Treningssenter",
                "center_name": slug,
                "name": name,
                "source_url": page_url,
                "parsed": parsed,
            }
        )
        print("3T", slug, parsed)
        time.sleep(SLEEP)
    return out


def scrape_mova():
    list_path = RAW / "mova_list.html"
    html = list_path.read_text(encoding="utf-8", errors="ignore")
    if len(html) < 10000:
        html = fetch("https://www.mova.no/treningssenter")
        list_path.write_text(html, encoding="utf-8")
    paths = sorted(set(re.findall(r'href="(/treningssenter/[^"#?]+)"', html)))
    paths = [p for p in paths if p.count("/") >= 2]
    print("MOVA paths", len(paths))
    out = []
    for i, path in enumerate(paths, 1):
        url = "https://www.mova.no" + path
        slug = path.strip("/").replace("/", "__")[:90]
        try:
            page = fetch(url)
            RAW.joinpath(f"mova_{slug}.html").write_text(page, encoding="utf-8")
        except Exception as e:
            print(f"[{i}] FAIL {path}: {e}")
            time.sleep(SLEEP)
            continue
        text = strip_html(page)
        parsed = None
        m = re.search(
            r"(?is)Bes[øo]ksadresse\s*\n([^\n]{4,100})",
            text,
        )
        if m:
            line = m.group(1).strip()
            m2 = re.match(r"(.+?),\s*(\d{4})\s+(.+)$", line)
            if m2:
                parsed = {
                    "address": apply_common_address_normalization(m2.group(1)),
                    "postal_code": m2.group(2),
                    "city": clean_city(m2.group(3)),
                }
            else:
                m3 = re.search(
                    r"(?is)Bes[øo]ksadresse\s*\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
                    text,
                )
                if m3:
                    parsed = {
                        "address": apply_common_address_normalization(m3.group(1)),
                        "postal_code": m3.group(2),
                        "city": clean_city(m3.group(3)),
                    }
        if not parsed:
            for m4 in re.finditer(
                r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
                text,
            ):
                addr = m4.group(1).strip()
                if not re.search(r"\d", addr):
                    continue
                if any(x in addr.lower() for x in ["mova", "cookie", "org.", "postboks", "telefon"]):
                    continue
                parsed = {
                    "address": apply_common_address_normalization(addr),
                    "postal_code": m4.group(2),
                    "city": clean_city(m4.group(3)),
                }
                break
        # JSON fragments
        if not parsed:
            jm = re.search(
                r'"(?:street|address|streetAddress)"\s*:\s*"([^"]+)".{0,240}"(?:postalCode|postal_code|zip|postcode)"\s*:\s*"?(\d{4})"?',
                page,
                re.I | re.S,
            )
            if jm:
                parsed = {
                    "address": apply_common_address_normalization(jm.group(1)),
                    "postal_code": jm.group(2),
                    "city": "",
                }
        center_name = path.strip("/").split("/")[-1].replace("-", " ").title()
        name = f"MOVA {center_name}"
        print(f"[{i}/{len(paths)}] {'OK' if parsed else 'NO'} {name[:42]} => {parsed}")
        out.append(
            {
                "brand": "MOVA",
                "center_name": center_name,
                "name": name,
                "source_url": url,
                "path": path,
                "parsed": parsed,
            }
        )
        time.sleep(SLEEP)
    return out


def try_generic(html, brand, source):
    text = strip_html(html)
    out = []
    for m in re.finditer(
        r"(?m)^([A-ZÆØÅa-zæøå0-9 .&\-]{3,50})\n([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
        text,
    ):
        name, address, postal, city = m.group(1).strip(), m.group(2).strip(), m.group(3), m.group(4).strip()
        if not re.search(r"\d", address):
            continue
        if any(x in name.lower() for x in ["cookie", "meny", "privacy", "footer"]):
            continue
        out.append(
            {
                "brand": brand,
                "name": name if brand.lower() in name.lower() else f"{brand} {name}",
                "center_name": name,
                "address": apply_common_address_normalization(address),
                "postal_code": postal,
                "city": clean_city(city),
                "source_url": source,
                "parsed": {
                    "address": apply_common_address_normalization(address),
                    "postal_code": postal,
                    "city": clean_city(city),
                },
            }
        )
    uniq = {}
    for r in out:
        uniq[(norm(r["address"]), r["postal_code"])] = r
    return list(uniq.values())


def scrape_spenst():
    url = "https://spenst.no/finn-treningssenter/"
    html = fetch(url)
    RAW.joinpath("spenst_list.html").write_text(html, encoding="utf-8")
    text = strip_html(html)
    out = []
    for m in re.finditer(
        r"(?is)(Spenst[^\n]{0,50})\n([^\n]{5,70})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})",
        text,
    ):
        name = re.sub(r"\s+", " ", m.group(1)).strip()
        address = re.sub(r"\s+", " ", m.group(2)).strip()
        if not re.search(r"\d", address):
            continue
        out.append(
            {
                "brand": "Spenst",
                "name": name if name.lower().startswith("spenst") else f"Spenst {name}",
                "center_name": name,
                "source_url": url,
                "parsed": {
                    "address": address,
                    "postal_code": m.group(3),
                    "city": clean_city(m.group(4)),
                },
            }
        )
    # also generic
    out.extend(try_generic(html, "Spenst", url))
    uniq = {}
    for r in out:
        p = r.get("parsed") or r
        uniq[(norm(p.get("address") or r.get("address") or ""), p.get("postal_code") or r.get("postal_code"))] = r
    out = list(uniq.values())
    print("Spenst", len(out))
    for r in out:
        print(" ", r.get("name"), r.get("parsed") or r.get("address"))
    return out


def scrape_others():
    results = {}
    for key, urls, brand in [
        ("sporty", ["https://sporty.no/treningssenter"], "Sporty"),
        (
            "f24",
            [
                "https://no.fitness24seven.com/",
                "https://no.fitness24seven.com/gyms",
                "https://no.fitness24seven.com/nb/find-gym",
            ],
            "Fitness24Seven",
        ),
        ("sky", ["https://skyfitness.no/bli-medlem/", "https://skyfitness.no/"], "SKY Fitness"),
        (
            "impulse",
            ["https://impulse.no/", "https://impulse.no/treningssenter", "https://www.impulse.no/"],
            "Impulse Treningssenter",
        ),
    ]:
        bucket = []
        for url in urls:
            try:
                html = fetch(url)
                RAW.joinpath(f"{key}_{hashlib.md5(url.encode()).hexdigest()[:6]}.html").write_text(
                    html, encoding="utf-8"
                )
                found = try_generic(html, brand, url)
                print(key, url, "->", len(found))
                bucket.extend(found)
                # collect sublinks for a second pass (limited)
                links = re.findall(r'href="(https?://[^"]+)"', html)
                local = [
                    l
                    for l in links
                    if any(x in l.lower() for x in ["senter", "gym", "club", "trening", "center"])
                    and brand.split()[0].lower() in l.lower()
                ]
                print("  candidate links", len(set(local)), list(set(local))[:8])
            except Exception as e:
                print(key, "fail", url, e)
            time.sleep(SLEEP)
        uniq = {}
        for r in bucket:
            uniq[(r["name"], r.get("postal_code"))] = r
        results[key] = list(uniq.values())
    return results


def dedupe(candidates, centers, staging):
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
    for r in candidates:
        if r["id"] in live_ids or r["id"] in st_ids:
            ambiguous.append({**r, "dup_reason": "same_id"})
            continue
        k = key_addr(r)
        if k[0] and k in live_by:
            matches = live_by[k]
            same_brand = [m for m in matches if norm(m.get("brand")) == norm(r.get("brand"))]
            if same_brand:
                ambiguous.append({**r, "dup_reason": "same_address_same_brand_as_live", "matched": same_brand})
                continue
            r["same_address_other_brand"] = [
                {"id": m["id"], "name": m["name"], "brand": m["brand"]} for m in matches
            ]
            r["import_category"] = "POSSIBLE_COLOCATED"
        if k[0] and k in st_by:
            matches = st_by[k]
            same_brand = [m for m in matches if norm(m.get("brand")) == norm(r.get("brand"))]
            if same_brand:
                ambiguous.append(
                    {**r, "dup_reason": "same_address_same_brand_as_staging", "matched": same_brand}
                )
                continue
        keep.append(r)
    return keep, ambiguous


def update_staging_3t(staging, t3):
    for r in staging:
        if r.get("brand") != "3T-Treningssenter" or r.get("import_category") == "MERGED_INTO_CATALOG":
            continue
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
                print("Updated staging 3T", r["name"], p)
                break


def main():
    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))

    # clean Feel24 cities with commas
    for r in staging:
        if r.get("brand") == "Feel24" and r.get("city"):
            r["city"] = clean_city(r["city"])

    print("=== 3T ===")
    t3 = scrape_3t()
    (NORWAY / "phase2_3t_scrape.json").write_text(
        json.dumps(t3, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    update_staging_3t(staging, t3)

    print("=== MOVA ===")
    mova = scrape_mova()
    (NORWAY / "phase2_mova_scrape.json").write_text(
        json.dumps(mova, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print("=== Spenst + others ===")
    spenst = scrape_spenst()
    others = scrape_others()

    feel = json.loads((NORWAY / "phase2_feel24_scrape.json").read_text(encoding="utf-8"))

    discoveries = []
    for s in feel:
        if s.get("parsed"):
            s = {
                **s,
                "parsed": {
                    **s["parsed"],
                    "city": clean_city(s["parsed"].get("city") or ""),
                    "address": apply_common_address_normalization(s["parsed"].get("address") or ""),
                },
            }
            discoveries.append(staging_row(s))
    for s in t3:
        if s.get("parsed"):
            discoveries.append(staging_row(s))
    for s in mova:
        if s.get("parsed"):
            discoveries.append(staging_row(s))
    for s in spenst:
        discoveries.append(staging_row(s))
    for bucket in others.values():
        for s in bucket:
            discoveries.append(staging_row(s))

    # EVO with postal from saved parse
    evo_path = RAW / "evo_parsed.txt"
    if evo_path.exists():
        for line in evo_path.read_text(encoding="utf-8").splitlines():
            if "\t" not in line:
                continue
            name, addr = line.split("\t", 1)
            m = re.match(r"^(.*?),\s*(\d{4})\s+(.+)$", re.sub(r", (Norge|Norway)\s*$", "", addr, flags=re.I))
            if not m:
                continue
            discoveries.append(
                staging_row(
                    {
                        "brand": "EVO Fitness",
                        "center_name": name,
                        "name": f"EVO Fitness {name}",
                        "source_url": "https://evofitness.no/sentre/",
                        "parsed": {
                            "address": apply_common_address_normalization(m.group(1)),
                            "postal_code": m.group(2),
                            "city": clean_city(m.group(3)),
                        },
                    }
                )
            )

    keep, ambiguous = dedupe(discoveries, centers, staging)
    print(f"discoveries {len(discoveries)} keep {len(keep)} ambiguous {len(ambiguous)}")
    (NORWAY / "phase2_new_centers_staging.json").write_text(
        json.dumps(keep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (NORWAY / "phase2_duplicate_analysis.json").write_text(
        json.dumps(ambiguous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    STAGING.write_text(json.dumps(staging, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "3t_with_address": sum(1 for x in t3 if x.get("parsed")),
        "3t_total": len(t3),
        "mova_with_address": sum(1 for x in mova if x.get("parsed")),
        "mova_total": len(mova),
        "spenst": len(spenst),
        "sporty": len(others.get("sporty", [])),
        "fitness24seven": len(others.get("f24", [])),
        "sky": len(others.get("sky", [])),
        "impulse": len(others.get("impulse", [])),
        "feel24_with_address": sum(1 for x in feel if x.get("parsed")),
        "phase2_new_keep": len(keep),
        "phase2_ambiguous": len(ambiguous),
        "staging_ready_for_geocode": sum(1 for r in staging if r.get("phase2_ready_for_geocode")),
    }
    (NORWAY / "phase2_discovery_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
