#!/usr/bin/env python3
"""Norway Phase 2: resolve unresolved staging + discover missing chains. No merge."""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NORWAY = ROOT / "data" / "norway"
RAW = NORWAY / "phase2_raw"
STAGING = NORWAY / "norway_centers_staging.json"
CENTERS = ROOT / "src" / "data" / "centers.json"
UA = "GymlyNorwayResearch/1.0 (phase2; local-dev)"
SLEEP = 0.9

RAW.mkdir(parents=True, exist_ok=True)


def fetch(url: str, timeout: int = 35) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", "ignore")


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", html)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text


def make_id(brand: str, name: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (name or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
        ]
    )
    return "no_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def normalize_addr_for_match(s: str) -> str:
    s = (s or "").lower()
    s = s.replace("æ", "ae").replace("ø", "o").replace("å", "a")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


ADDRESS_FIXES = {
    # id -> (address, postal, city) partial overrides when confidently known
}


def apply_common_address_normalization(address: str) -> str:
    a = normalize_space(address)
    replacements = [
        (r"(?i)\btrondheimsvn\.?\b", "Trondheimsveien"),
        (r"(?i)\btrondheimsvegen\b", "Trondheimsveien"),
        (r"(?i)\ball[èe]\b", "allé"),
        (r"(?i)\bgate\b", "gate"),
        (r"(?i)\bgt\.?\b", "gate"),
        (r"(?i)\bv\.?\b(?=\s*\d)", "vei"),
        (r"(?i),\s*2\s*etg\.?", ""),
        (r"(?i)\s+2\s*etg\.?", ""),
        (r"(?i)brandtenborggate", "Brandtenborggata"),
        (r"(?i)brandtenborggata", "Brandtenborggata"),
        (r"(?i)karenlyst all[èe]", "Karenlyst allé"),
        (r"(?i)henrik ibsensgate", "Henrik Ibsens gate"),
        (r"(?i)co lunds gate", "C.O. Lunds gate"),
        (r"(?i)c\.?\s*o\.?\s*lunds gate", "C.O. Lunds gate"),
        (r"(?i)erich mogens[øo]ns vei", "Erich Mogensøns vei"),
        (r"(?i)storgt\.?", "Storgata"),
        (r"(?i)th\.\s*petersonsgate", "Th. Petersons gate"),
        (r"(?i)haakon vii gt\.?", "Haakon VIIs gate"),
        (r"(?i)sluppenv\.?", "Sluppenveien"),
        (r"(?i)horisont senter myrdalsvegen", "Myrdalsvegen"),
        (r"(?i)langb[øo]lgen 5\.\s*bygg c", "Langbølgen 5"),
        (r"(?i)henrik wergelandsgt\.?", "Henrik Wergelands gate"),
        (r"(?i)industrigaten", "Industrigata"),
        (r"(?i)sognsveien 75\s*e[–\-]f", "Sognsveien 75"),
        (r"(?i)schultz['’]?\s*gate", "Schultz' gate"),
    ]
    for pat, rep in replacements:
        a = re.sub(pat, rep, a)
    return normalize_space(a)


def parse_feel24_address(html: str) -> dict | None:
    text = strip_html(html)
    m = re.search(
        r"(?is)Bes[øo]ksadresse\n([^\n]{3,80})\n(\d{4})\s+([^\n,]{2,40})",
        text,
    )
    if not m:
        m = re.search(
            r"(?is)Visiting address\n([^\n]{3,80})\n(\d{4})\s+([^\n,]{2,40})",
            text,
        )
    if not m:
        return None
    city = m.group(3).strip()
    city = re.sub(r",?\s*Norway\s*$", "", city, flags=re.I).strip()
    return {
        "address": normalize_space(m.group(1)),
        "postal_code": m.group(2),
        "city": city,
    }


def scrape_feel24(urls: list[str]) -> list[dict]:
    # Leaf pages: .../treningssenter-city/center-slug (depth >= 2 after treningssentre)
    leaf = []
    for u in urls:
        u = u.strip()
        if not u or u.endswith("/treningssentre"):
            continue
        parts = urllib.parse.urlparse(u).path.strip("/").split("/")
        if len(parts) < 3:
            continue
        if "treningssentre" not in parts[0]:
            continue
        leaf.append(u)
    leaf = sorted(set(leaf))
    print(f"Feel24 leaf URLs: {len(leaf)}")
    out = []
    for i, url in enumerate(leaf, 1):
        slug = url.rstrip("/").split("/")[-1]
        region = url.rstrip("/").split("/")[-2]
        try:
            html = fetch(url)
            RAW.joinpath(f"feel24_{slug}.html").write_text(html, encoding="utf-8")
            parsed = parse_feel24_address(html)
        except Exception as e:
            print(f"  [{i}/{len(leaf)}] FAIL {slug}: {e}")
            out.append(
                {
                    "brand": "Feel24",
                    "center_name": slug.replace("-", " ").title(),
                    "name": f"Feel24 {slug.replace('-', ' ').title()}",
                    "source_url": url,
                    "region_slug": region,
                    "error": str(e),
                    "parsed": None,
                }
            )
            time.sleep(SLEEP)
            continue
        name = f"Feel24 {slug.replace('-', ' ').title()}"
        # nicer name from title if available
        tm = re.search(r"<title>([^<]+)", html, re.I)
        if tm:
            title = tm.group(1).split("|")[0].strip()
            if "Feel24" in title:
                name = re.sub(r"\s+", " ", title)
                name = re.sub(r"(?i)\s*[-–|].*$", "", name).strip()
                if not name.startswith("Feel24"):
                    name = "Feel24 " + name
        row = {
            "brand": "Feel24",
            "center_name": slug,
            "name": name,
            "source_url": url,
            "region_slug": region,
            "parsed": parsed,
        }
        status = "OK" if parsed else "NO_ADDR"
        print(f"  [{i}/{len(leaf)}] {status} {name[:50]} => {parsed}")
        out.append(row)
        time.sleep(SLEEP)
    return out


def scrape_3t() -> list[dict]:
    list_html = fetch("https://www.3t.no/treningssenter/")
    RAW.joinpath("3t_list.html").write_text(list_html, encoding="utf-8")
    paths = sorted(set(re.findall(r'href="(/treningssenter/3t-[^"]+)"', list_html)))
    out = []
    for path in paths:
        url = "https://www.3t.no" + path
        html = fetch(url)
        slug = path.rsplit("/", 1)[-1]
        RAW.joinpath(f"{slug}.html").write_text(html, encoding="utf-8")
        text = strip_html(html)
        # Prefer lines that look like street + postal city
        parsed = None
        for m in re.finditer(
            r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{4,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
            text,
        ):
            addr = m.group(1).strip()
            city = m.group(3).strip()
            if "kvm" in addr.lower() or "boltre" in addr.lower():
                continue
            if not re.search(r"\d", addr):
                continue
            parsed = {
                "address": apply_common_address_normalization(addr),
                "postal_code": m.group(2),
                "city": city,
            }
            break
        name = "3T-Treningssenter " + slug.replace("3t-", "").replace("-", " ").title()
        out.append(
            {
                "brand": "3T-Treningssenter",
                "center_name": slug,
                "name": name,
                "source_url": url,
                "parsed": parsed,
            }
        )
        print(f"3T {slug} => {parsed}")
        time.sleep(SLEEP)
    return out


def parse_evo_list() -> list[dict]:
    html = RAW.joinpath("evo_list.html").read_text(encoding="utf-8", errors="ignore")
    if len(html) < 1000:
        html = fetch("https://evofitness.no/sentre/")
        RAW.joinpath("evo_list.html").write_text(html, encoding="utf-8")
    plain = strip_html(html)
    lines = [ln.strip() for ln in plain.split("\n") if ln.strip()]
    centers = []
    for i, ln in enumerate(lines):
        if i + 1 >= len(lines):
            continue
        nxt = lines[i + 1]
        if not re.search(r", (Norge|Norway)\s*$", nxt, re.I):
            continue
        name = ln
        if name.lower() in ("vis på kart", "finnmark", "østfold") or name.startswith("Avstand"):
            continue
        if re.match(r"^\d+$", name):
            continue
        addr_line = re.sub(r", (Norge|Norway)\s*$", "", nxt, flags=re.I).strip()
        # optional leading "EVO Minde,"
        addr_line = re.sub(r"^EVO\s+[^,]+,\s*", "", addr_line)
        m = re.match(r"^(.*?),\s*(\d{4})\s+(.+)$", addr_line)
        if m:
            address, postal, city = m.group(1), m.group(2), m.group(3)
        else:
            # Street, City (no postal)
            m2 = re.match(r"^(.*?),\s*([^,]+)$", addr_line)
            if not m2:
                continue
            address, postal, city = m2.group(1), "", m2.group(2)
        centers.append(
            {
                "brand": "EVO Fitness",
                "center_name": name,
                "name": f"EVO Fitness {name}" if not name.lower().startswith("evo") else name,
                "address": apply_common_address_normalization(address),
                "postal_code": postal,
                "city": city.strip(),
                "source_url": "https://evofitness.no/sentre/",
                "country": "Norway",
            }
        )
    print(f"EVO parsed from list: {len(centers)}")
    return centers


def scrape_spenst() -> list[dict]:
    html = fetch("https://spenst.no/finn-treningssenter/")
    RAW.joinpath("spenst_list.html").write_text(html, encoding="utf-8")
    text = strip_html(html)
    # Look for Name + address patterns with postal
    out = []
    # Common pattern in WP: center cards
    for m in re.finditer(
        r"(?is)(Spenst[^\n]{0,40})\n([^\n]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})",
        text,
    ):
        name = normalize_space(m.group(1))
        address = normalize_space(m.group(2))
        if "finn" in name.lower() and "trening" in name.lower():
            continue
        if not re.search(r"\d", address):
            continue
        out.append(
            {
                "brand": "Spenst",
                "name": name if name.lower().startswith("spenst") else f"Spenst {name}",
                "center_name": name,
                "address": address,
                "postal_code": m.group(3),
                "city": m.group(4).strip(),
                "source_url": "https://spenst.no/finn-treningssenter/",
                "country": "Norway",
            }
        )
    # dedupe by name+postal
    uniq = {}
    for r in out:
        uniq[(r["name"], r["postal_code"])] = r
    out = list(uniq.values())
    print(f"Spenst parsed: {len(out)}")
    for r in out:
        print(" ", r["name"], r["address"], r["postal_code"], r["city"])
    return out


def try_extract_centers_generic(html: str, brand: str, source: str) -> list[dict]:
    text = strip_html(html)
    out = []
    for m in re.finditer(
        r"(?m)^([A-ZÆØÅa-zæøå0-9 .&\-]{3,50})\n([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
        text,
    ):
        name, address, postal, city = (
            m.group(1).strip(),
            m.group(2).strip(),
            m.group(3),
            m.group(4).strip(),
        )
        if not re.search(r"\d", address):
            continue
        if any(x in name.lower() for x in ["cookie", "meny", "footer", "privacy"]):
            continue
        out.append(
            {
                "brand": brand,
                "name": name if brand.lower() in name.lower() else f"{brand} {name}",
                "center_name": name,
                "address": apply_common_address_normalization(address),
                "postal_code": postal,
                "city": city,
                "source_url": source,
                "country": "Norway",
            }
        )
    uniq = {}
    for r in out:
        uniq[(normalize_addr_for_match(r["address"]), r["postal_code"])] = r
    return list(uniq.values())


def scrape_fitness24seven() -> list[dict]:
    urls = [
        "https://no.fitness24seven.com/",
        "https://no.fitness24seven.com/gyms",
        "https://no.fitness24seven.com/nb/gyms",
    ]
    out = []
    for url in urls:
        try:
            html = fetch(url)
            RAW.joinpath("f24_" + hashlib.md5(url.encode()).hexdigest()[:6] + ".html").write_text(
                html, encoding="utf-8"
            )
            found = try_extract_centers_generic(html, "Fitness24Seven", url)
            print(f"F24 {url} -> {len(found)}")
            out.extend(found)
            # also collect gym links
            links = re.findall(r'href="([^"]*gym[^"]*)"', html, flags=re.I)
            print("  gym links sample", links[:10])
        except Exception as e:
            print("F24 fail", url, e)
        time.sleep(SLEEP)
    uniq = {}
    for r in out:
        uniq[(r["name"], r.get("postal_code"))] = r
    return list(uniq.values())


def scrape_sky() -> list[dict]:
    url = "https://skyfitness.no/bli-medlem/"
    html = fetch(url)
    RAW.joinpath("sky_list.html").write_text(html, encoding="utf-8")
    found = try_extract_centers_generic(html, "SKY Fitness", url)
    print(f"SKY generic parse: {len(found)}")
    # Try collect club links
    links = sorted(
        set(
            re.findall(
                r'href="(https://skyfitness\.no/[^"]+)"',
                html,
            )
        )
    )
    clubish = [u for u in links if any(x in u.lower() for x in ["senter", "club", "gym", "trening"])]
    print("SKY clubish links", len(clubish), clubish[:15])
    return found


def scrape_impulse() -> list[dict]:
    urls = ["https://impulse.no/", "https://impulse.no/treningssenter", "https://www.impulse.no/"]
    out = []
    for url in urls:
        try:
            html = fetch(url)
            RAW.joinpath("impulse_" + hashlib.md5(url.encode()).hexdigest()[:6] + ".html").write_text(
                html, encoding="utf-8"
            )
            found = try_extract_centers_generic(html, "Impulse Treningssenter", url)
            print(f"Impulse {url} -> {len(found)}")
            out.extend(found)
            links = re.findall(r'href="([^"]+)"', html)
            print("  links with senter", [l for l in links if "senter" in l.lower()][:20])
        except Exception as e:
            print("Impulse fail", url, e)
        time.sleep(SLEEP)
    uniq = {}
    for r in out:
        uniq[(r["name"], r.get("postal_code"))] = r
    return list(uniq.values())


def scrape_sporty() -> list[dict]:
    url = "https://sporty.no/treningssenter"
    try:
        html = fetch(url)
    except Exception as e:
        print("Sporty fail", e)
        return []
    RAW.joinpath("sporty_list.html").write_text(html, encoding="utf-8")
    found = try_extract_centers_generic(html, "Sporty", url)
    print(f"Sporty generic: {len(found)}")
    # Family Sports Club legacy pages sometimes list clubs
    links = sorted(set(re.findall(r'href="(https?://[^"]+)"', html)))
    print("sporty abs links", len(links))
    return found


def scrape_mova_from_list_links() -> list[dict]:
    """Fetch each MOVA center page and try to find address patterns / JSON."""
    list_path = RAW / "mova_list.html"
    if not list_path.exists() or list_path.stat().st_size < 10000:
        html = fetch("https://www.mova.no/treningssenter")
        list_path.write_text(html, encoding="utf-8")
    else:
        html = list_path.read_text(encoding="utf-8", errors="ignore")
    paths = sorted(
        set(
            re.findall(r'href="(/treningssenter/[^"#?]+)"', html)
        )
    )
    # exclude bare /treningssenter and city hubs without enough depth? keep all with >=2 segments
    paths = [p for p in paths if p.count("/") >= 2]
    print(f"MOVA center paths: {len(paths)}")
    out = []
    for i, path in enumerate(paths, 1):
        url = "https://www.mova.no" + path
        slug = path.strip("/").replace("/", "__")
        try:
            page = fetch(url)
            RAW.joinpath(f"mova_{slug[:80]}.html").write_text(page, encoding="utf-8")
        except Exception as e:
            print(f"  [{i}] FAIL {path}: {e}")
            time.sleep(SLEEP)
            continue
        text = strip_html(page)
        parsed = None
        # Try Besøksadresse
        m = re.search(
            r"(?is)Bes[øo]ksadresse\s*\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
            text,
        )
        if m:
            parsed = {
                "address": normalize_space(m.group(1)),
                "postal_code": m.group(2),
                "city": re.sub(r",.*", "", m.group(3)).strip(),
            }
        if not parsed:
            # street line then postal city nearby
            for m2 in re.finditer(
                r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
                text,
            ):
                addr = m2.group(1).strip()
                if not re.search(r"\d", addr):
                    continue
                if any(x in addr.lower() for x in ["mova", "cookie", "org.", "postboks"]):
                    continue
                parsed = {
                    "address": apply_common_address_normalization(addr),
                    "postal_code": m2.group(2),
                    "city": m2.group(3).strip(),
                }
                break
        # Try embedded lat/lng + address in JS
        if not parsed:
            jm = re.search(
                r'"street"\s*:\s*"([^"]+)".{0,200}"postal(?:Code|_code|code)?"\s*:\s*"?(\d{4})"?',
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
        row = {
            "brand": "MOVA",
            "center_name": center_name,
            "name": name,
            "source_url": url,
            "path": path,
            "parsed": parsed,
        }
        print(f"  [{i}/{len(paths)}] {'OK' if parsed else 'NO'} {name[:40]} => {parsed}")
        out.append(row)
        time.sleep(SLEEP)
    return out


def resolve_phase1_unresolved(staging: list[dict]) -> dict:
    """Normalize addresses / fill postals for unresolved rows. Does not invent coords."""
    stats = Counter()
    for r in staging:
        if r.get("import_category") == "MERGED_INTO_CATALOG":
            continue
        before = (r.get("address"), r.get("postal_code"), r.get("city"))
        if r.get("address"):
            new_addr = apply_common_address_normalization(r["address"])
            if new_addr != r["address"]:
                r["address_normalized_from"] = r["address"]
                r["address"] = new_addr
                stats["address_normalized"] += 1
        # Track for re-geocode eligibility
        if r.get("address") and r.get("postal_code") and r.get("city"):
            if r.get("lat") is None:
                r["phase2_ready_for_geocode"] = True
                stats["ready_for_geocode"] += 1
        elif r.get("address") and r.get("city") and not r.get("postal_code"):
            r["phase2_needs_postal"] = True
            stats["needs_postal"] += 1
        after = (r.get("address"), r.get("postal_code"), r.get("city"))
        if before != after:
            stats["changed"] += 1
    return dict(stats)


def staging_row_from_discovery(d: dict, verification: str = "verified_official") -> dict:
    parsed = d.get("parsed") or {}
    address = d.get("address") or parsed.get("address") or ""
    postal = d.get("postal_code") or parsed.get("postal_code") or ""
    city = d.get("city") or parsed.get("city") or ""
    brand = d["brand"]
    name = d.get("name") or f"{brand} {d.get('center_name','')}".strip()
    rid = make_id(brand, name, address, postal, city)
    has_addr = bool(address and postal and city)
    return {
        "id": rid,
        "name": name,
        "brand": brand,
        "address": address,
        "postal_code": postal,
        "city": city,
        "country": "Norway",
        "lat": None,
        "lng": None,
        "is_active": False,
        "verification_status": verification if has_addr else "location_known_address_pending",
        "opening_hours_raw": d.get("opening_hours"),
        "source_url": d.get("source_url"),
        "legacy_brand": d.get("legacy_brand"),
        "center_name": d.get("center_name"),
        "import_category": "READY_TO_GEOCODE" if has_addr else "NEEDS_REVIEW",
        "phase": "phase2",
        "phase2_ready_for_geocode": has_addr,
    }


def dedupe_against_existing(
    candidates: list[dict], existing_centers: list[dict], existing_staging: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Return (keep, ambiguous_matches)."""
    live_no = [c for c in existing_centers if c.get("country") == "Norway"]
    staging_unresolved = [
        s for s in existing_staging if s.get("import_category") != "MERGED_INTO_CATALOG"
    ]

    def key_addr(r):
        return (
            normalize_addr_for_match(r.get("address") or ""),
            str(r.get("postal_code") or ""),
            normalize_addr_for_match(r.get("city") or ""),
        )

    live_by_addr = defaultdict(list)
    for c in live_no:
        live_by_addr[key_addr(c)].append(c)
    staging_by_addr = defaultdict(list)
    for c in staging_unresolved:
        staging_by_addr[key_addr(c)].append(c)
    live_ids = {c["id"] for c in live_no}
    staging_ids = {c["id"] for c in existing_staging}

    keep = []
    ambiguous = []
    for r in candidates:
        if r["id"] in live_ids or r["id"] in staging_ids:
            ambiguous.append({**r, "dup_reason": "same_id"})
            continue
        k = key_addr(r)
        if k[0] and k in live_by_addr:
            # same address as live — could be co-located different brand
            matches = live_by_addr[k]
            same_brand = [m for m in matches if normalize_addr_for_match(m.get("brand")) == normalize_addr_for_match(r.get("brand"))]
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
        if k[0] and k in staging_by_addr:
            matches = staging_by_addr[k]
            same_brand = [
                m
                for m in matches
                if normalize_addr_for_match(m.get("brand"))
                == normalize_addr_for_match(r.get("brand"))
            ]
            if same_brand:
                # update existing staging instead of new
                ambiguous.append(
                    {
                        **r,
                        "dup_reason": "same_address_same_brand_as_staging",
                        "matched": [
                            {"id": m["id"], "name": m["name"]} for m in same_brand
                        ],
                    }
                )
                continue
        keep.append(r)
    return keep, ambiguous


def main():
    staging = json.loads(STAGING.read_text(encoding="utf-8"))
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    print("Loaded staging", len(staging), "centers", len(centers))

    # --- Part A: normalize unresolved ---
    print("\n=== Part A: resolve/normalize unresolved ===")
    resolve_stats = resolve_phase1_unresolved(staging)
    print(resolve_stats)

    # Fill EVO missing postals from EVO list when address matches
    evo_list = parse_evo_list()
    evo_by_name = {normalize_addr_for_match(e["center_name"]): e for e in evo_list}
    for r in staging:
        if r.get("import_category") == "MERGED_INTO_CATALOG":
            continue
        if r.get("brand") != "EVO Fitness":
            continue
        if r.get("postal_code"):
            continue
        # match by center_name / name suffix
        cn = normalize_addr_for_match(r.get("center_name") or r["name"].replace("EVO Fitness", ""))
        hit = evo_by_name.get(cn)
        if hit and hit.get("postal_code"):
            r["postal_code"] = hit["postal_code"]
            r["postal_filled_from"] = "evo_official_list"
            r["phase2_ready_for_geocode"] = True
            print("Filled postal", r["name"], hit["postal_code"])
        elif hit and not hit.get("postal_code"):
            # official list also lacks postal — keep needs postal but mark address verified
            r["address_verified_official"] = True
            r["phase2_needs_postal"] = True

    # --- Feel24 pending address fill from official pages ---
    print("\n=== Feel24 scrape ===")
    urls = (RAW / "feel24_urls.txt").read_text(encoding="utf-8").splitlines()
    # Focus pending city regions first + all leaves eventually
    feel24 = scrape_feel24(urls)
    (NORWAY / "phase2_feel24_scrape.json").write_text(
        json.dumps(feel24, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Map pending Feel24 staging rows to scraped addresses by slug/name
    pending_feel = [
        r
        for r in staging
        if r.get("brand") == "Feel24" and r.get("import_category") != "MERGED_INTO_CATALOG"
    ]
    scrape_by_slug = {x["center_name"].lower(): x for x in feel24 if x.get("center_name")}

    def match_feel(row, scraped_list):
        blob = normalize_addr_for_match(row["name"] + " " + (row.get("center_name") or ""))
        for s in scraped_list:
            if not s.get("parsed"):
                continue
            slug = normalize_addr_for_match(s.get("center_name") or "")
            name = normalize_addr_for_match(s.get("name") or "")
            if slug and slug in blob:
                return s
            # token overlap
            tokens = [t for t in slug.split() if len(t) > 3]
            if tokens and all(t in blob for t in tokens):
                return s
            if name and name.replace("feel24", "").strip() in blob:
                return s
        return None

    feel_resolved = 0
    for r in pending_feel:
        hit = match_feel(r, feel24)
        if not hit or not hit.get("parsed"):
            continue
        p = hit["parsed"]
        r["address"] = p["address"]
        r["postal_code"] = p["postal_code"]
        r["city"] = p["city"]
        r["source_url"] = hit.get("source_url") or r.get("source_url")
        r["verification_status"] = "verified_official"
        r["phase2_ready_for_geocode"] = True
        r["address_resolved_phase2"] = True
        r["import_category"] = "NEEDS_COORDINATES"
        feel_resolved += 1
        print("Resolved Feel24", r["name"], "->", p)
    print("Feel24 staging resolved", feel_resolved)

    # --- 3T ---
    print("\n=== 3T scrape ===")
    t3 = scrape_3t()
    (NORWAY / "phase2_3t_scrape.json").write_text(
        json.dumps(t3, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    # Update existing 2 staging 3T rows
    for r in staging:
        if r.get("brand") != "3T-Treningssenter":
            continue
        if r.get("import_category") == "MERGED_INTO_CATALOG":
            continue
        blob = normalize_addr_for_match(r["name"])
        for s in t3:
            if not s.get("parsed"):
                continue
            if any(tok in blob for tok in normalize_addr_for_match(s["center_name"]).split() if len(tok) > 3):
                p = s["parsed"]
                r["address"] = p["address"]
                r["postal_code"] = p["postal_code"]
                r["city"] = p["city"]
                r["source_url"] = s["source_url"]
                r["verification_status"] = "verified_official"
                r["phase2_ready_for_geocode"] = True
                r["import_category"] = "NEEDS_COORDINATES"
                print("Updated 3T staging", r["name"], p)
                break

    # --- Other chains ---
    print("\n=== Other chains ===")
    mova = scrape_mova_from_list_links()
    (NORWAY / "phase2_mova_scrape.json").write_text(
        json.dumps(mova, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sporty = scrape_sporty()
    f24 = scrape_fitness24seven()
    sky = scrape_sky()
    spenst = scrape_spenst()
    impulse = scrape_impulse()

    discoveries = []
    # Feel24 new locations (not already in staging/live)
    for s in feel24:
        if not s.get("parsed"):
            continue
        discoveries.append(staging_row_from_discovery(s))
    for s in t3:
        if not s.get("parsed"):
            continue
        discoveries.append(staging_row_from_discovery(s))
    for s in mova:
        if not s.get("parsed"):
            continue
        discoveries.append(staging_row_from_discovery(s))
    for s in evo_list:
        # only those with full address+postal as discovery candidates to fill gaps vs staging
        if not (s.get("address") and s.get("postal_code") and s.get("city")):
            continue
        discoveries.append(
            staging_row_from_discovery(
                {
                    **s,
                    "parsed": {
                        "address": s["address"],
                        "postal_code": s["postal_code"],
                        "city": s["city"],
                    },
                }
            )
        )
    for bucket in (sporty, f24, sky, spenst, impulse):
        for s in bucket:
            if s.get("address") and s.get("postal_code"):
                discoveries.append(staging_row_from_discovery(s))

    keep, ambiguous = dedupe_against_existing(discoveries, centers, staging)
    print(
        f"Discoveries: {len(discoveries)} keep={len(keep)} ambiguous_skip={len(ambiguous)}"
    )

    phase2_new = keep
    (NORWAY / "phase2_new_centers_staging.json").write_text(
        json.dumps(phase2_new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (NORWAY / "phase2_duplicate_analysis.json").write_text(
        json.dumps(ambiguous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Persist updated phase1 staging
    STAGING.write_text(json.dumps(staging, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Summary
    unresolved = [r for r in staging if r.get("import_category") != "MERGED_INTO_CATALOG"]
    ready_geo = [r for r in unresolved if r.get("phase2_ready_for_geocode")]
    summary = {
        "phase1_unresolved_start": 99,
        "phase1_unresolved_now": len(unresolved),
        "phase1_ready_for_geocode": len(ready_geo),
        "resolve_stats": resolve_stats,
        "feel24_scraped": len(feel24),
        "feel24_with_address": sum(1 for x in feel24 if x.get("parsed")),
        "feel24_staging_resolved": feel_resolved,
        "3t_scraped": len(t3),
        "3t_with_address": sum(1 for x in t3 if x.get("parsed")),
        "mova_scraped": len(mova),
        "mova_with_address": sum(1 for x in mova if x.get("parsed")),
        "sporty": len(sporty),
        "fitness24seven": len(f24),
        "sky": len(sky),
        "spenst": len(spenst),
        "impulse": len(impulse),
        "phase2_new_candidates": len(phase2_new),
        "phase2_ambiguous_duplicates": len(ambiguous),
        "note": "Geocode next via import-norway-centers.mjs --geocode-phase2. DO NOT MERGE yet.",
    }
    (NORWAY / "phase2_discovery_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
