#!/usr/bin/env python3
"""Phase 3 enrich: Sporty (from NEXT_DATA + pages), F24 Norway, Impulse."""
from __future__ import annotations

import hashlib
import html as HTML
import json
import re
import time
import urllib.request
from pathlib import Path

P3 = Path("data/norway/phase3")
RAW = P3 / "raw"
UA = "GymlyNorwayResearch/1.0 (phase3)"
SLEEP = 0.8


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "ignore")


def make_id(brand, name, address, postal, city):
    key = "|".join(
        [
            brand.strip().lower(),
            name.strip().lower(),
            address.strip().lower(),
            postal.strip(),
            city.strip().lower(),
        ]
    )
    return "no_" + hashlib.md5(key.encode()).hexdigest()[:10]


def apply_addr_norm(a: str) -> str:
    a = re.sub(r"\s+", " ", (a or "").strip())
    a = re.sub(r"(?i)\bgt\.?\b", "gate", a)
    return a.strip()


def parse_f24_page(html: str):
    # Adresse block
    m = re.search(
        r"Adresse</h4>\s*<p>\s*([^<]+)<br\s*/?>\s*(\d{4})\s+([^<\n]+)",
        html,
        re.I,
    )
    parsed = None
    if m:
        parsed = {
            "address": apply_addr_norm(HTML.unescape(m.group(1))),
            "postal_code": m.group(2),
            "city": HTML.unescape(m.group(3)).strip(),
        }
    # Official coords from Google Maps query
    lat = lng = None
    gm = re.search(r"query=(-?\d+\.\d+),(-?\d+\.\d+)", html)
    if gm:
        lat, lng = float(gm.group(1)), float(gm.group(2))
    coming = bool(re.search(r"(?i)kommende treningssenter|åpner\s+20", html))
    return parsed, lat, lng, coming


def enrich_f24():
    # Norway-ish slugs already downloaded
    norway_slugs = [
        "drammen-sentrum",
        "oslo-bjerke",
        "oslo-carl-berners-plass",
        "oslo-gruenerlokka",
        "oslo-haugenstua",
        "oslo-mortensrud-torg",
        "oslo-storo",
        "oslo-stortorvet",
        "oslo-veitvet",
    ]
    # Also try fetch any missing + check for more NO pages from list HTML
    list_html = ""
    for f in RAW.glob("f24_*.html"):
        if "vare" in f.name or f.stat().st_size > 100000:
            t = f.read_text(errors="ignore")
            if "oslo-storo" in t:
                list_html = t
                break
    more = re.findall(r"/vare-treningssenter/(oslo-[a-z0-9\-]+|drammen-[a-z0-9\-]+)/", list_html)
    norway_slugs = sorted(set(norway_slugs) | set(more))
    out = []
    for slug in norway_slugs:
        f = RAW / f"f24_{slug}.html"
        if f.exists():
            html = f.read_text(errors="ignore")
        else:
            url = f"https://no.fitness24seven.com/vare-treningssenter/{slug}/"
            try:
                html = fetch(url)
                f.write_text(html, encoding="utf-8")
                time.sleep(SLEEP)
            except Exception as e:
                print("f24 miss", slug, e)
                continue
        parsed, lat, lng, coming = parse_f24_page(html)
        name = "Fitness24Seven " + slug.replace("-", " ").title()
        row = {
            "brand": "Fitness24Seven",
            "center_name": slug,
            "name": name,
            "source_url": f"https://no.fitness24seven.com/vare-treningssenter/{slug}/",
            "parsed": parsed,
            "lat": lat,
            "lng": lng,
            "is_coming_soon": coming and not parsed,
            "coord_source": "official_google_maps_query" if lat is not None else None,
        }
        print("F24", slug, parsed, lat, lng, "coming", coming)
        out.append(row)
    (P3 / "fitness24seven_norway.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out


def enrich_impulse():
    out = []
    for f in sorted(RAW.glob("impulse_*.html")):
        slug = f.stem.replace("impulse_", "")
        html = f.read_text(errors="ignore")
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        # Adresse:<br>Street
        m = re.search(r"(?is)Adresse:</strong><br\s*/?>\s*([^<]+)", html)
        address = apply_addr_norm(HTML.unescape(m.group(1))) if m else None
        # postal somewhere
        postal = city = None
        # maps embed sometimes has coords — do NOT invent; only use if we also have address
        lat = lng = None
        # Try known postal near address in text
        if address:
            # search "NNNN City" near address mention
            plain = re.sub(r"<[^>]+>", "\n", text)
            for ln in plain.split("\n"):
                ln = ln.strip()
                pm = re.match(r"^(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$", ln)
                if pm:
                    postal, city = pm.group(1), pm.group(2).strip()
                    break
        # Manual postal fill ONLY via Nominatim later if missing
        parsed = None
        if address:
            parsed = {"address": address, "postal_code": postal or "", "city": city or ""}
        print("Impulse", slug, parsed)
        out.append(
            {
                "brand": "Impulse Treningssenter",
                "center_name": slug,
                "name": f"Impulse Treningssenter {slug.title()}",
                "source_url": f"https://impulse.no/senter/{slug}/",
                "parsed": parsed,
            }
        )
    # Fill missing postal/city via nominatim for address-only
    import urllib.parse

    for row in out:
        p = row.get("parsed")
        if not p or not p.get("address"):
            continue
        if p.get("postal_code") and p.get("city"):
            continue
        q = f'{p["address"]}, Trondheim, Norway'
        url = (
            "https://nominatim.openstreetmap.org/search?"
            + urllib.parse.urlencode(
                {"q": q, "format": "json", "addressdetails": 1, "limit": 1, "countrycodes": "no"}
            )
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
            if data:
                addr = data[0].get("address") or {}
                pc = str(addr.get("postcode") or "")[:4]
                city = addr.get("city") or addr.get("town") or addr.get("suburb") or "Trondheim"
                if pc:
                    p["postal_code"] = pc
                p["city"] = city
                # Do NOT take lat/lng from this lookup as final gym pin without house match —
                # leave for strict geocoder
                print("Impulse postal fill", row["center_name"], p)
        except Exception as e:
            print("impulse postal fail", e)
        time.sleep(1.1)
    (P3 / "impulse_norway.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out


def enrich_sporty():
    html = (RAW / "sporty_main.html").read_text(errors="ignore")
    # Unique center slugs
    slugs = sorted(
        {
            s
            for s in re.findall(r"(sporty-[a-z0-9\-]+|family-sports-club-[a-z0-9\-]+|family-[a-z0-9\-]+)", html.lower())
            if not re.search(r"\d{6,}|mp$|bakgrunn|appen|apner|akademiet", s)
            and len(s) < 50
        }
    )
    # Prefer path links
    paths = sorted(set(re.findall(r"/treningssenter/([a-z0-9\-]+)", html, flags=re.I)))
    slugs = sorted(set(slugs) | set(paths))
    # Filter junk
    ban = {"treningssenter", "family", "sporty"}
    slugs = [s for s in slugs if s not in ban and not s.endswith("-mp")]
    print("Sporty candidate slugs", len(slugs))

    # Try extract from __NEXT_DATA__
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
    next_centers = []
    if m:
        try:
            data = json.loads(m.group(1))

            def walk(o, path=""):
                if isinstance(o, dict):
                    keys = {k.lower() for k in o.keys()}
                    if ("address" in keys or "street" in keys or "postalcode" in keys or "zip" in keys) and (
                        "name" in keys or "title" in keys or "slug" in keys
                    ):
                        next_centers.append(o)
                    for k, v in o.items():
                        walk(v, path + "." + k)
                elif isinstance(o, list):
                    for i, v in enumerate(o[:500]):
                        walk(v, f"{path}[{i}]")

            walk(data)
            print("NEXT_DATA address-like objects", len(next_centers))
        except Exception as e:
            print("NEXT parse fail", e)

    (P3 / "sporty_next_samples.json").write_text(
        json.dumps(next_centers[:50], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    out = []
    # Scrape each slug page (cap reasonable)
    for i, slug in enumerate(slugs, 1):
        url = f"https://www.sporty.no/treningssenter/{slug}"
        try:
            page = fetch(url)
        except Exception as e:
            print("sporty fail", slug, e)
            continue
        RAW.joinpath(f"sporty_{slug[:80]}.html").write_text(page, encoding="utf-8")
        # skip soft 404
        if "Fant ikke" in page or "404" in page[:500]:
            continue
        text = re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I)
        plain = re.sub(r"<[^>]+>", "\n", text)
        parsed = None
        for ln in plain.split("\n"):
            ln = HTML.unescape(ln).strip()
            m2 = re.match(r"^(.+?),\s*(\d{4})\s+(.+)$", ln)
            if m2 and len(ln) < 100 and re.search(r"\d", m2.group(1)):
                if any(x in ln.lower() for x in ["copyright", "org.", "kundesenter", "postboks"]):
                    continue
                parsed = {
                    "address": apply_addr_norm(m2.group(1)),
                    "postal_code": m2.group(2),
                    "city": m2.group(3).split(",")[0].strip(),
                }
                break
        legacy = None
        brand = "Sporty"
        if slug.startswith("family"):
            legacy = "Family Sports Club"
        name = "Sporty " + slug.replace("sporty-", "").replace("family-sports-club-", "").replace(
            "family-", ""
        ).replace("-", " ").title()
        tm = re.search(r"<title>([^<]+)", page, re.I)
        if tm:
            title = HTML.unescape(tm.group(1).split("|")[0]).strip()
            if len(title) > 3 and "sporty" in title.lower():
                name = re.sub(r"\s*[–\-].*$", "", title).strip()
        print(f"[{i}/{len(slugs)}] {slug} => {parsed}")
        out.append(
            {
                "brand": brand,
                "center_name": slug,
                "name": name if name.lower().startswith("sporty") else f"Sporty {name}",
                "source_url": url,
                "parsed": parsed,
                "legacy_brand": legacy,
            }
        )
        time.sleep(SLEEP)
        # safety cap
        if i >= 200:
            print("Sporty scrape capped at 200")
            break
    (P3 / "sporty_norway.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Sporty with address",
        sum(1 for x in out if x.get("parsed")),
        "/",
        len(out),
    )
    return out


def to_row(d):
    p = d.get("parsed") or {}
    address = apply_addr_norm(d.get("address") or p.get("address") or "")
    postal = d.get("postal_code") or p.get("postal_code") or ""
    city = (d.get("city") or p.get("city") or "").split(",")[0].strip()
    brand = d["brand"]
    name = d["name"]
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
        "lat": d.get("lat"),
        "lng": d.get("lng"),
        "is_active": False,
        "verification_status": "verified_official" if has else "location_known_address_pending",
        "source_url": d.get("source_url"),
        "legacy_brand": d.get("legacy_brand"),
        "center_name": d.get("center_name"),
        "import_category": "COMING_SOON"
        if coming
        else (
            "READY_TO_IMPORT"
            if has and d.get("lat") is not None and d.get("lng") is not None
            else ("READY_TO_GEOCODE" if has else "NEEDS_REVIEW")
        ),
        "phase": "phase3",
        "phase3_ready_for_geocode": has
        and not coming
        and (d.get("lat") is None or d.get("lng") is None),
        "coord_source": d.get("coord_source"),
    }
    if coming:
        row["is_coming_soon"] = True
    if row["lat"] is not None and row["lng"] is not None and has and not coming:
        row["import_category"] = "READY_TO_IMPORT"
        row["geocode_status"] = "ok_official_maps"
        row["geocode_reasons"] = ["official_google_maps_query_on_chain_page"]
    return row


def main():
    f24 = enrich_f24()
    impulse = enrich_impulse()
    sporty = enrich_sporty()

    rows = []
    for bucket in (f24, impulse, sporty):
        for d in bucket:
            if d.get("parsed") or d.get("is_coming_soon") or (d.get("lat") and d.get("parsed")):
                rows.append(to_row(d))

    # dedupe within
    uniq = {}
    for r in rows:
        uniq[r["id"]] = r
    rows = list(uniq.values())
    (P3 / "phase3_new_centers_staging.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "phase3 new rows",
        len(rows),
        "ready",
        sum(1 for r in rows if r["import_category"] == "READY_TO_IMPORT"),
        "geocode",
        sum(1 for r in rows if r.get("phase3_ready_for_geocode")),
    )


if __name__ == "__main__":
    main()
