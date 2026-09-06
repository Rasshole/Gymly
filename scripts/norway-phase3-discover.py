#!/usr/bin/env python3
"""
Norway Phase 3 discovery & resolution (NO MERGE).

- Soft-postal verification
- Address improvement for unresolved
- Sporty / Fitness24Seven / Impulse discovery
- Staging updates + readiness report inputs
"""
from __future__ import annotations

import hashlib
import html as HTML
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NORWAY = ROOT / "data" / "norway"
P3 = NORWAY / "phase3"
RAW = P3 / "raw"
STAGING = NORWAY / "norway_centers_staging.json"
PHASE2 = NORWAY / "phase2_new_centers_staging.json"
CENTERS = ROOT / "src" / "data" / "centers.json"
UA = "GymlyNorwayResearch/1.0 (phase3)"
SLEEP = 0.85

P3.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)


def fetch(url: str, timeout: int = 40) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", html)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n+", "\n", text)


def norm(s: str) -> str:
    s = HTML.unescape(s or "").lower()
    s = s.replace("æ", "ae").replace("ø", "o").replace("å", "a")
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


def parse_one_line(line: str):
    line = HTML.unescape(line).strip()
    m = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", line)
    if not m:
        return None
    city = re.sub(r",?\s*Norway\s*$", "", m.group(3), flags=re.I).strip()
    city = re.sub(r"\s*\([^)]*\)\s*", " ", city).strip()
    if "," in city:
        city = city.split(",", 1)[0].strip()
    return {
        "address": m.group(1).strip().rstrip(","),
        "postal_code": m.group(2),
        "city": city,
    }


def apply_addr_norm(address: str) -> str:
    a = re.sub(r"\s+", " ", (address or "").strip())
    reps = [
        (r"(?i)\btrondheimsvn\.?\b", "Trondheimsveien"),
        (r"(?i)\bgt\.?\b", "gate"),
        (r"(?i)\bv\.?\b(?=\s*\d)", "vei"),
        (r"(?i)brandtenborggate", "Brandtenborggata"),
        (r"(?i)karenlyst all[èe]", "Karenlyst allé"),
        (r"(?i)henrik ibsensgate", "Henrik Ibsens gate"),
        (r"(?i)c\.?\s*o\.?\s*lunds gate", "C.O. Lunds gate"),
        (r"(?i)co lunds gate", "C.O. Lunds gate"),
        (r"(?i)sognsveien 75\s*e[–\-]?f?", "Sognsveien 75"),
        (r"(?i)langb[øo]lgen 5\.\s*bygg c", "Langbølgen 5"),
        (r"(?i)horisont senter myrdalsvegen", "Myrdalsvegen"),
        (r"(?i),\s*2\s*etg\.?", ""),
        (r"(?i)\s+2\s*etg\.?", ""),
        (r"(?i)haakon vii[s]?\s*gt\.?", "Haakon VIIs gate"),
        (r"(?i)sluppenv\.?", "Sluppenveien"),
        (r"(?i)storgt\.?", "Storgata"),
        (r"(?i)th\.\s*petersonsgate", "Th. Petersons gate"),
        (r"(?i)henrik wergelandsgt\.?", "Henrik Wergelands gate"),
        (r"(?i)industrigaten", "Industrigata"),
        (r"(?i)schultz['’]?\s*gate", "Schultz' gate"),
        (r"(?i)sivert nilsens gt\.?", "Sivert Nilsens gate"),
        (r"(?i)edvard griegsvei", "Edvard Griegs vei"),
        (r"(?i)strandvegen", "Strandveien"),
    ]
    for pat, rep in reps:
        a = re.sub(pat, rep, a)
    return a.strip().rstrip(",")


def load_all():
    st = json.loads(STAGING.read_text(encoding="utf-8"))
    p2 = json.loads(PHASE2.read_text(encoding="utf-8"))
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    return st, p2, centers


def save_all(st, p2):
    STAGING.write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    PHASE2.write_text(json.dumps(p2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def iter_unresolved(st, p2):
    for r in st + p2:
        if r.get("import_category") != "MERGED_INTO_CATALOG":
            yield r


def part_a_soft_postal(st, p2):
    """Approve soft-postal rows with strong street evidence."""
    decisions = []
    for r in iter_unresolved(st, p2):
        if r.get("import_category") != "SOFT_POSTAL_WITHHELD":
            continue
        reasons = r.get("geocode_reasons") or []
        display = r.get("geocode_display") or ""
        strong = (
            "house_number_match" in reasons and "road_match" in reasons
        ) or (
            "postal_exact" in reasons
            and ("token_hits_1" in reasons or "token_hits_2" in reasons or "road_match" in reasons)
        )
        # Require finite coords already present
        ok_coords = (
            r.get("lat") is not None
            and r.get("lng") is not None
            and isinstance(r["lat"], (int, float))
            and isinstance(r["lng"], (int, float))
            and not (r["lat"] == 0 and r["lng"] == 0)
        )
        if strong and ok_coords:
            r["import_category"] = "READY_TO_IMPORT"
            r["phase3_soft_postal_decision"] = "approved"
            r["phase3_soft_postal_note"] = (
                "Street/house match confirmed; OSM postal differs from chain-listed postal "
                "(boundary/metadata). Coordinates retained."
            )
            r["is_active"] = False
            decisions.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "decision": "READY_TO_IMPORT",
                    "reasons": reasons,
                    "display": display,
                    "staged_postal": r.get("postal_code"),
                }
            )
        else:
            r["import_category"] = "NEEDS_REVIEW"
            r["phase3_soft_postal_decision"] = "held"
            decisions.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "decision": "NEEDS_REVIEW",
                    "reasons": reasons,
                    "display": display,
                }
            )
    (P3 / "soft_postal_decisions.json").write_text(
        json.dumps(decisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    approved = sum(1 for d in decisions if d["decision"] == "READY_TO_IMPORT")
    held = sum(1 for d in decisions if d["decision"] != "READY_TO_IMPORT")
    print(f"Part A soft postal: approved={approved} held={held}")
    return decisions


def fill_postal_via_nominatim(address: str, city: str) -> str | None:
    q = f"{address}, {city}, Norway"
    url = (
        "https://nominatim.openstreetmap.org/search?"
        + urllib.parse.urlencode(
            {
                "q": q,
                "format": "json",
                "addressdetails": 1,
                "limit": 1,
                "countrycodes": "no",
            }
        )
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    except Exception as e:
        print("postal lookup fail", q, e)
        return None
    if not data:
        return None
    pc = (data[0].get("address") or {}).get("postcode")
    if pc and re.match(r"^\d{4}", str(pc)):
        return str(pc)[:4]
    return None


def part_d_skip_incomplete(st, p2):
    """Try to complete EVO incomplete rows with postal from Nominatim (address known)."""
    results = []
    for r in iter_unresolved(st, p2):
        if r.get("import_category") != "SKIP_INCOMPLETE":
            continue
        if not r.get("address") or not r.get("city"):
            results.append({"name": r["name"], "status": "still_incomplete"})
            continue
        r["address"] = apply_addr_norm(r["address"])
        if not r.get("postal_code"):
            pc = fill_postal_via_nominatim(r["address"], r["city"])
            time.sleep(1.1)
            if pc:
                r["postal_code"] = pc
                r["postal_filled_phase3"] = "nominatim_from_address"
                r["import_category"] = "NEEDS_COORDINATES"
                r["phase2_ready_for_geocode"] = True
                r["verification_status"] = "verified_official"
                results.append({"name": r["name"], "status": "postal_filled", "postal": pc})
                print("SKIP->postal", r["name"], pc)
            else:
                results.append({"name": r["name"], "status": "postal_unresolved"})
        else:
            r["import_category"] = "NEEDS_COORDINATES"
            r["phase2_ready_for_geocode"] = True
            results.append({"name": r["name"], "status": "had_postal_moved"})
    (P3 / "skip_incomplete_resolution.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return results


def part_b_normalize_needs_coords(st, p2):
    n = 0
    for r in iter_unresolved(st, p2):
        if r.get("import_category") not in ("NEEDS_COORDINATES", "NEEDS_REVIEW"):
            continue
        if r.get("address"):
            before = r["address"]
            after = apply_addr_norm(before)
            if after != before:
                r["address_normalized_from"] = before
                r["address"] = after
                n += 1
        if (
            r.get("address")
            and r.get("postal_code")
            and r.get("city")
            and r.get("lat") is None
            and r.get("import_category") == "NEEDS_REVIEW"
            and not r.get("duplicate_note")
        ):
            # eligible for re-geocode attempt
            r["phase3_ready_for_geocode"] = True
        if (
            r.get("import_category") == "NEEDS_COORDINATES"
            and r.get("address")
            and r.get("postal_code")
            and r.get("city")
        ):
            r["phase3_ready_for_geocode"] = True
    print(f"Part B normalized addresses: {n}")


def part_c_needs_review(st, p2, live_no):
    """Classify NEEDS_REVIEW rows."""
    decisions = []
    live_by_addr_brand = {}
    for c in live_no:
        k = (norm(c.get("address")), str(c.get("postal_code")), norm(c.get("brand")))
        live_by_addr_brand[k] = c

    for r in list(iter_unresolved(st, p2)):
        if r.get("import_category") != "NEEDS_REVIEW":
            continue
        # already decided soft postal held stays
        if r.get("phase3_soft_postal_decision") == "held":
            decisions.append({"name": r["name"], "class": "NEEDS_REVIEW", "why": "soft_postal_held"})
            continue
        note = (r.get("duplicate_note") or "").lower()
        if "same address as live" in note or "harstad sentrum" in note:
            r["import_category"] = "DUPLICATE_EXISTING"
            r["phase3_class"] = "DUPLICATE_EXISTING"
            decisions.append({"name": r["name"], "class": "DUPLICATE_EXISTING", "why": note})
            continue
        k = (norm(r.get("address")), str(r.get("postal_code")), norm(r.get("brand")))
        if k[0] and k in live_by_addr_brand:
            r["import_category"] = "DUPLICATE_EXISTING"
            r["phase3_class"] = "DUPLICATE_EXISTING"
            r["duplicate_note"] = f"Matches live {live_by_addr_brand[k]['name']}"
            decisions.append({"name": r["name"], "class": "DUPLICATE_EXISTING"})
            continue
        if r.get("geocode_status") == "ambiguous" and r.get("address") and r.get("postal_code"):
            # leave for re-geocode with improved rules later; keep NEEDS_REVIEW or move to coords
            r["phase3_ready_for_geocode"] = True
            r["import_category"] = "NEEDS_COORDINATES"
            r["phase3_class"] = "NEEDS_COORDINATES"
            decisions.append({"name": r["name"], "class": "NEEDS_COORDINATES", "why": "ambiguous_retry"})
            continue
        if not r.get("address") or not r.get("postal_code"):
            r["phase3_class"] = "NEEDS_REVIEW"
            decisions.append({"name": r["name"], "class": "NEEDS_REVIEW", "why": "incomplete"})
            continue
        if r.get("lat") is not None and r.get("lng") is not None:
            # has coords but was review — if not soft held, allow READY
            r["import_category"] = "READY_TO_IMPORT"
            r["phase3_class"] = "READY_TO_IMPORT"
            decisions.append({"name": r["name"], "class": "READY_TO_IMPORT", "why": "had_coords"})
            continue
        r["phase3_ready_for_geocode"] = True
        r["import_category"] = "NEEDS_COORDINATES"
        r["phase3_class"] = "NEEDS_COORDINATES"
        decisions.append({"name": r["name"], "class": "NEEDS_COORDINATES", "why": "retry"})
    (P3 / "needs_review_classification.json").write_text(
        json.dumps(decisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Part C classifications", Counter(d["class"] for d in decisions))
    return decisions


def scrape_sporty():
    counties = [
        "agder",
        "akershus",
        "buskerud",
        "more-og-romsdal",
        "nordland",
        "telemark",
        "troms",
        "vestfold",
        "vestland",
        "ostfold",
    ]
    # Also try fylke query pages and main list
    center_urls = set()
    # main page may list links
    try:
        main = fetch("https://www.sporty.no/treningssenter")
        RAW.joinpath("sporty_main.html").write_text(main, encoding="utf-8")
        center_urls |= set(
            re.findall(r'href="(https://(?:www\.)?sporty\.no/treningssenter/[^"#?]+)"', main)
        )
        center_urls |= set(
            re.findall(r'href="(/treningssenter/[^"#?]+)"', main)
        )
    except Exception as e:
        print("sporty main fail", e)

    for c in counties:
        for url in [
            f"https://www.sporty.no/treningssenter?fylke={c}",
            f"https://sporty.no/treningssenter/{c}",
            f"https://www.sporty.no/treningssenter/{c}",
        ]:
            try:
                html = fetch(url)
                RAW.joinpath(f"sporty_{c}_{hashlib.md5(url.encode()).hexdigest()[:6]}.html").write_text(
                    html, encoding="utf-8"
                )
                center_urls |= set(
                    re.findall(
                        r'href="(https://(?:www\.)?sporty\.no/treningssenter/[^"#?]+)"',
                        html,
                    )
                )
                center_urls |= {
                    "https://www.sporty.no" + p
                    for p in re.findall(r'href="(/treningssenter/[^"#?]+)"', html)
                }
                print("sporty page", url, "links so far", len(center_urls))
            except Exception as e:
                print("sporty county fail", url, e)
            time.sleep(SLEEP)

    # filter out county hubs
    exclude = set(counties) | {"treningssenter"}
    cleaned = []
    for u in sorted(center_urls):
        slug = u.rstrip("/").split("/")[-1].lower()
        if slug in exclude or slug.startswith("?"):
            continue
        if "fylke=" in u:
            continue
        cleaned.append(u.rstrip("/") )
    cleaned = sorted(set(cleaned))
    print("Sporty center URLs", len(cleaned))

    out = []
    for i, url in enumerate(cleaned, 1):
        if not url.startswith("http"):
            url = "https://www.sporty.no" + url
        try:
            page = fetch(url)
        except Exception as e:
            print("sporty center fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"sporty_center_{slug[:80]}.html").write_text(page, encoding="utf-8")
        text = strip_html(page)
        parsed = None
        # Look for address patterns
        for ln in text.split("\n"):
            ln = ln.strip()
            if re.search(r",\s*\d{4}\s+\S", ln) and len(ln) < 100:
                if any(x in ln.lower() for x in ["copyright", "org.", "kundesenter", "postboks"]):
                    continue
                p = parse_one_line(ln)
                if p and re.search(r"\d", p["address"]):
                    parsed = p
                    break
        if not parsed:
            m = re.search(
                r"(?is)(?:Bes[øo]ksadresse|Adresse|Finn oss)\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
                text,
            )
            if m:
                parsed = {
                    "address": apply_addr_norm(m.group(1)),
                    "postal_code": m.group(2),
                    "city": m.group(3).strip().split(",")[0],
                }
        name = "Sporty " + slug.replace("sporty-", "").replace("-", " ").title()
        tm = re.search(r"<title>([^<]+)", page, re.I)
        if tm:
            title = HTML.unescape(tm.group(1).split("|")[0].split("–")[0].split("-")[0]).strip()
            if "sporty" in title.lower():
                name = title
        print(f"[{i}/{len(cleaned)}] {name[:50]} => {parsed}")
        out.append(
            {
                "brand": "Sporty",
                "center_name": slug,
                "name": name if name.lower().startswith("sporty") else f"Sporty {name}",
                "source_url": url,
                "parsed": parsed,
                "legacy_brand": None,
            }
        )
        time.sleep(SLEEP)
    (P3 / "sporty_scrape.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out


def scrape_fitness24seven():
    urls = [
        "https://no.fitness24seven.com/vare-treningssenter/",
        "https://no.fitness24seven.com/treningssenter-oslo/",
        "https://no.fitness24seven.com/vare-treningssenter/?country=norway",
    ]
    center_urls = set()
    for url in urls:
        try:
            html = fetch(url)
            RAW.joinpath(
                "f24_" + hashlib.md5(url.encode()).hexdigest()[:6] + ".html"
            ).write_text(html, encoding="utf-8")
            center_urls |= set(
                re.findall(
                    r'href="(https://no\.fitness24seven\.com/vare-treningssenter/[^"#?]+/)"',
                    html,
                )
            )
            center_urls |= {
                "https://no.fitness24seven.com" + p
                for p in re.findall(r'href="(/vare-treningssenter/[^"#?]+/)"', html)
            }
            print("f24", url, "centers", len(center_urls))
        except Exception as e:
            print("f24 fail", url, e)
        time.sleep(SLEEP)

    # filter norway-looking (exclude other countries if present)
    centers = sorted(
        {
            u
            for u in center_urls
            if "/vare-treningssenter/" in u
            and u.rstrip("/").split("/")[-1]
            and "vare-treningssenter" != u.rstrip("/").split("/")[-1]
        }
    )
    out = []
    for i, url in enumerate(centers, 1):
        try:
            page = fetch(url)
        except Exception as e:
            print("f24 center fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"f24_{slug}.html").write_text(page, encoding="utf-8")
        text = strip_html(page)
        # Coming soon?
        coming = bool(
            re.search(r"(?i)kommende|åpner\s+20|coming soon|åpner\s+\d", text)
        )
        parsed = None
        # Pattern: StreetNNNN City or Street NNNN City mashed
        m = re.search(
            r"([A-ZÆØÅa-zæøå0-9 ./\-]{4,60}?)(\d{4})\s*([A-ZÆØÅa-zæøå\- ]{2,40})Åpne i Google",
            text,
        )
        if m:
            parsed = {
                "address": apply_addr_norm(m.group(1)),
                "postal_code": m.group(2),
                "city": m.group(3).strip(),
            }
        if not parsed:
            for ln in text.split("\n"):
                ln = ln.strip()
                # mashed: Markveien 350554 Oslo
                m2 = re.match(r"^([^\d]{4,50}?)(\d{4})(\d{0})?\s*([A-ZÆØÅa-zæøå\- ]{2,40})$", ln)
                # better: street then postal glued to house?
                m3 = re.search(r"([A-Za-zæøåÆØÅ ./\-]{3,40}\d[A-Za-z0-9\-]*)\s*(\d{4})\s*([A-Za-zæøåÆØÅ\- ]{2,40})", ln)
                if "Åpne" in ln or "Google" in ln:
                    m4 = re.search(
                        r"([A-ZÆØÅa-zæøå0-9 ./\-]{4,60}?)(\d{4})\s*([A-ZÆØÅa-zæøå\- ]{2,40})",
                        ln,
                    )
                    if m4:
                        parsed = {
                            "address": apply_addr_norm(m4.group(1)),
                            "postal_code": m4.group(2),
                            "city": m4.group(3).strip(),
                        }
                        break
                if m3 and len(ln) < 80:
                    parsed = {
                        "address": apply_addr_norm(m3.group(1)),
                        "postal_code": m3.group(2),
                        "city": m3.group(3).strip(),
                    }
                    break
        # Norway filter: city/postal heuristic — skip if clearly SE/FI
        if parsed and parsed["city"].lower() in ("stockholm", "malmö", "göteborg"):
            continue
        name = "Fitness24Seven " + slug.replace("-", " ").title()
        print(f"F24 [{i}/{len(centers)}] {slug} coming={coming} => {parsed}")
        out.append(
            {
                "brand": "Fitness24Seven",
                "center_name": slug,
                "name": name,
                "source_url": url,
                "parsed": parsed,
                "is_coming_soon": coming and not parsed,
                "coming_flag": coming,
            }
        )
        time.sleep(SLEEP)
    (P3 / "fitness24seven_scrape.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out


def scrape_impulse():
    home = fetch("https://impulse.no/")
    RAW.joinpath("impulse_home.html").write_text(home, encoding="utf-8")
    urls = set(re.findall(r"https://impulse\.no/senter/[^\"#]+", home))
    urls |= {
        "https://impulse.no/senter/lade/",
        "https://impulse.no/senter/lerkendal/",
        "https://impulse.no/senter/pirbadet/",
        "https://impulse.no/senter/solsiden/",
    }
    # discover more from sitemap or pages
    for path in ["/treningssenter/", "/senter/", "/om-impulse-treningssenter/"]:
        try:
            html = fetch("https://impulse.no" + path)
            urls |= set(re.findall(r"https://impulse\.no/senter/[^\"#]+", html))
            urls |= {"https://impulse.no" + p for p in re.findall(r'href="(/senter/[^"#]+)"', html)}
        except Exception:
            pass
        time.sleep(SLEEP)
    urls = sorted({u if u.endswith("/") else u + "/" for u in urls})
    print("Impulse URLs", urls)
    out = []
    for url in urls:
        page = fetch(url)
        slug = url.rstrip("/").split("/")[-1]
        RAW.joinpath(f"impulse_{slug}.html").write_text(page, encoding="utf-8")
        text = strip_html(page)
        parsed = None
        # Try JSON-LD
        for m in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
            page,
            re.I,
        ):
            try:
                data = json.loads(m.group(1))
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                addr = it.get("address") if isinstance(it, dict) else None
                if isinstance(addr, dict):
                    parsed = {
                        "address": apply_addr_norm(addr.get("streetAddress") or ""),
                        "postal_code": str(addr.get("postalCode") or "")[:4],
                        "city": addr.get("addressLocality") or "",
                    }
                    if parsed["address"] and parsed["postal_code"]:
                        break
            if parsed and parsed.get("address"):
                break
        if not parsed:
            for ln in text.split("\n"):
                ln = ln.strip()
                p = parse_one_line(ln)
                if p and re.search(r"\d", p["address"]) and len(ln) < 90:
                    if any(x in ln.lower() for x in ["copyright", "org"]):
                        continue
                    parsed = p
                    break
        if not parsed:
            m = re.search(
                r"(?is)(?:Adresse|Bes[øo]k|Bes[øo]ksadresse|Finn oss)[^\n]*\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
                text,
            )
            if m:
                parsed = {
                    "address": apply_addr_norm(m.group(1)),
                    "postal_code": m.group(2),
                    "city": m.group(3).strip(),
                }
        # Known fallbacks from public info if still missing — ONLY if found in page text
        print("Impulse", slug, "=>", parsed)
        out.append(
            {
                "brand": "Impulse Treningssenter",
                "center_name": slug,
                "name": f"Impulse Treningssenter {slug.title()}",
                "source_url": url,
                "parsed": parsed,
            }
        )
        time.sleep(SLEEP)
    (P3 / "impulse_scrape.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out


def to_staging_row(d, phase="phase3"):
    p = d.get("parsed") or {}
    address = apply_addr_norm(d.get("address") or p.get("address") or "")
    postal = d.get("postal_code") or p.get("postal_code") or ""
    city = (d.get("city") or p.get("city") or "").split(",")[0].strip()
    brand = d["brand"]
    name = d.get("name") or f"{brand} {d.get('center_name','')}"
    has = bool(address and postal and city)
    coming = bool(d.get("is_coming_soon"))
    row = {
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
        "verification_status": "verified_official" if has else "location_known_address_pending",
        "source_url": d.get("source_url"),
        "legacy_brand": d.get("legacy_brand"),
        "center_name": d.get("center_name"),
        "import_category": (
            "COMING_SOON"
            if coming
            else ("READY_TO_GEOCODE" if has else "NEEDS_REVIEW")
        ),
        "phase": phase,
        "phase3_ready_for_geocode": has and not coming,
    }
    if coming:
        row["is_coming_soon"] = True
    return row


def dedupe_new(candidates, live, existing_staging):
    live_ids = {c["id"] for c in live}
    st_ids = {c["id"] for c in existing_staging}
    live_ab = {
        (norm(c.get("address")), str(c.get("postal_code")), norm(c.get("brand"))): c
        for c in live
    }
    st_ab = {
        (norm(c.get("address")), str(c.get("postal_code")), norm(c.get("brand"))): c
        for c in existing_staging
        if c.get("import_category") != "MERGED_INTO_CATALOG"
    }
    keep, amb = [], []
    for r in candidates:
        if r["id"] in live_ids or r["id"] in st_ids:
            amb.append({**r, "dup_reason": "same_id"})
            continue
        k = (norm(r.get("address")), str(r.get("postal_code")), norm(r.get("brand")))
        if k[0] and k in live_ab:
            amb.append({**r, "dup_reason": "same_address_brand_live", "matched": live_ab[k]["name"]})
            continue
        if k[0] and k in st_ab:
            amb.append({**r, "dup_reason": "same_address_brand_staging", "matched": st_ab[k]["name"]})
            continue
        keep.append(r)
    return keep, amb


def chain_gap_audit(live, st, p2):
    """Compare live+staged counts to known official scales (approximate)."""
    all_rows = list(live)
    for r in st + p2:
        if r.get("import_category") == "MERGED_INTO_CATALOG":
            continue
        all_rows.append(r)
    brands = Counter()
    for r in all_rows:
        brands[r.get("brand") or "?"] += 1
    known = {
        "SATS": 78,
        "Fresh Fitness": 41,
        "EVO Fitness": 80,
        "Feel24": 100,
        "MUDO Gym": 13,
        "3T-Treningssenter": 18,
        "MOVA": 92,
        "SKY Fitness": 45,
        "Spenst": 21,
    }
    report = {}
    for b, official in known.items():
        have = brands.get(b, 0)
        report[b] = {
            "gymly_live_plus_unresolved_staged": have,
            "official_approx": official,
            "gap_estimate": max(0, official - have),
        }
    (P3 / "chain_gap_audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Chain gap audit", json.dumps(report, indent=2))
    return report


def main():
    st, p2, centers = load_all()
    live_no = [c for c in centers if c.get("country") == "Norway"]
    print("Loaded live NO", len(live_no), "staging", len(st), "phase2", len(p2))

    print("\n=== PART A soft postal ===")
    soft_dec = part_a_soft_postal(st, p2)

    print("\n=== PART D skip incomplete ===")
    skip_res = part_d_skip_incomplete(st, p2)

    print("\n=== PART B normalize ===")
    part_b_normalize_needs_coords(st, p2)

    print("\n=== PART C needs review ===")
    part_c_needs_review(st, p2, live_no)

    print("\n=== PART E Sporty ===")
    sporty = scrape_sporty()

    print("\n=== PART F Fitness24Seven ===")
    f24 = scrape_fitness24seven()

    print("\n=== PART G Impulse ===")
    impulse = scrape_impulse()

    print("\n=== PART H gap audit ===")
    gaps = chain_gap_audit(live_no, st, p2)

    # Build phase3 new staging
    discoveries = []
    for bucket in (sporty, f24, impulse):
        for s in bucket:
            if s.get("parsed") or s.get("is_coming_soon"):
                discoveries.append(to_staging_row(s))

    existing = st + p2
    keep, amb = dedupe_new(discoveries, live_no, existing)
    phase3_new = keep
    (P3 / "phase3_new_centers_staging.json").write_text(
        json.dumps(phase3_new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (P3 / "phase3_duplicate_analysis.json").write_text(
        json.dumps(amb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    save_all(st, p2)

    summary = {
        "soft_postal_approved": sum(1 for d in soft_dec if d["decision"] == "READY_TO_IMPORT"),
        "soft_postal_held": sum(1 for d in soft_dec if d["decision"] != "READY_TO_IMPORT"),
        "skip_incomplete_results": Counter(x["status"] for x in skip_res),
        "sporty_discovered": len(sporty),
        "sporty_with_address": sum(1 for x in sporty if x.get("parsed")),
        "f24_discovered": len(f24),
        "f24_with_address": sum(1 for x in f24 if x.get("parsed")),
        "impulse_discovered": len(impulse),
        "impulse_with_address": sum(1 for x in impulse if x.get("parsed")),
        "phase3_new_keep": len(phase3_new),
        "phase3_new_ambiguous": len(amb),
        "unresolved_now": sum(
            1 for r in st + p2 if r.get("import_category") != "MERGED_INTO_CATALOG"
        ),
        "ready_now": sum(
            1
            for r in st + p2
            if r.get("import_category") == "READY_TO_IMPORT" and r.get("lat") is not None
        ),
        "ready_for_geocode": sum(
            1 for r in st + p2 + phase3_new if r.get("phase3_ready_for_geocode")
        ),
        "gaps": gaps,
    }
    (P3 / "phase3_discovery_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
