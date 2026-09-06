#!/usr/bin/env python3
"""
Portugal Phase 1 repair — fix truncated Solinca pages, rebuild Element from
listings, expand Be-Fit from sitemap. Updates portugal_phase1_candidates.json.
Does NOT modify centers.json.
"""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import re
import ssl
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/portugal"
RAW = OUT / "raw"
PAGES = RAW / "pages"

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyPortugalResearch/1.0)",
    "Accept-Language": "pt-PT,pt;q=0.9",
    "Accept-Encoding": "identity",
}
PT_POSTAL_RE = re.compile(r"\b(\d{4}-\d{3})\b")


def fetch(url: str, timeout: int = 60) -> tuple[str, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_html_to_text(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    return clean_text(html)


def make_id(brand: str, address: str, postal: str, city: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip(),
            (city or "").strip().lower(),
            "portugal",
        ]
    )
    return "pt_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def resolve_maps(url: str, cache: dict) -> tuple[float | None, float | None, str]:
    if url in cache and cache[url]:
        hit = cache[url]
        return hit.get("lat"), hit.get("lng"), hit.get("source", "OFFICIAL_MAP_PIN")
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            final = r.geturl()
    except Exception:
        cache[url] = None
        return None, None, ""
    lat = lng = None
    for pat in [
        r"@(-?\d+\.\d+),(-?\d+\.\d+)",
        r"[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)",
        r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)",
    ]:
        m = re.search(pat, final or "")
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            break
    if lat is None:
        m = re.search(r"!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)", final or "")
        if m:
            lng, lat = float(m.group(1)), float(m.group(2))
    if lat is not None:
        cache[url] = {"lat": lat, "lng": lng, "source": "OFFICIAL_MAP_PIN", "final": final}
        return lat, lng, "OFFICIAL_MAP_PIN"
    cache[url] = None
    return None, None, ""


def repair_solinca(rows: list[dict], maps_cache: dict) -> list[dict]:
    print("Repair Solinca…")
    out = [r for r in rows if "Solinca" not in r.get("brand", "")]
    sm = (RAW / "solinca_gym_sitemap.xml").read_text(encoding="utf-8")
    locs = [u for u in re.findall(r"<loc>([^<]+)</loc>", sm) if "/solinca-ginasios/" in u]
    for i, url in enumerate(locs, 1):
        page, final = fetch(url)
        slug = url.rstrip("/").split("/")[-1]
        (PAGES / f"solinca_{slug}.html").write_text(page, encoding="utf-8")
        text = strip_html_to_text(page)
        # Light vs Classic — official naming on page / slug
        is_light = bool(re.search(r"\bSolinca\s+Light\b", text)) or "light" in slug.lower()
        is_classic = "classic" in slug.lower() or bool(re.search(r"\bSolinca\s+Classic\b", text))
        if is_light and not is_classic:
            brand = "Solinca Light"
        elif is_classic and not is_light:
            brand = "Solinca"
        elif is_light:
            brand = "Solinca Light"
        else:
            # Many pages mention both nav brands; prefer slug, else Classic (Solinca)
            brand = "Solinca Light" if "light" in slug.lower() else "Solinca"

        address = postal = city = ""
        m = re.search(
            r"(?:Morada)\s+(.+?),\s*(\d{4}-\d{3})\s*,\s*([A-Za-zÀ-ú \-']+?)(?:\s+Ver|\s+Horário|$)",
            text,
            re.I,
        )
        if not m:
            m = re.search(
                r"((?:Parque|Centro|Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.)[^,]{3,100}),\s*(\d{4}-\d{3})\s*,\s*([A-Za-zÀ-ú \-']+)",
                text,
            )
        if m:
            address = clean_text(m.group(1))
            postal = m.group(2)
            city = clean_text(m.group(3).split("Ver")[0])

        lat = lng = None
        csrc = ""
        map_m = re.search(r"(https://maps\.app\.goo\.gl/[A-Za-z0-9]+)", page)
        if map_m:
            lat, lng, csrc = resolve_maps(map_m.group(1), maps_cache)
            time.sleep(0.3)

        status = ""
        low = text.lower()
        if "em breve" in low or "brevemente" in low:
            status = "COMING_SOON"
        if "encerrado" in low:
            status = "CLOSED"

        name = f"{brand} {slug.replace('-', ' ').title()}"
        rid = make_id(brand, address, postal, city)
        out.append(
            {
                "id": rid,
                "name": name,
                "brand": brand,
                "chain_key": "solinca_light" if brand == "Solinca Light" else "solinca",
                "address": address,
                "postal_code": postal,
                "city": city,
                "country": "Portugal",
                "lat": lat,
                "lng": lng,
                "website": final,
                "source_url": final,
                "coord_source": csrc,
                "notes": "solinca_full_page_repair",
                "import_category": status,
                "discovered_at": rows[0].get("discovered_at") if rows else "",
                "is_active": True,
                "evidence": {"source": "solinca_club_page", "url": final},
            }
        )
        if i % 10 == 0:
            print(f"  … {i}/{len(locs)}")
        time.sleep(0.15)
    print("  Solinca rows", sum(1 for r in out if "Solinca" in r["brand"]))
    return out


def rebuild_element(rows: list[dict]) -> list[dict]:
    print("Rebuild Element from listings…")
    out = [r for r in rows if r.get("brand") != "Element"]
    hits = []
    for page in range(1, 8):
        p = RAW / f"element_ginasio_p{page}.html"
        if not p.exists():
            url = "https://elementgyms.pt/ginasio/" if page == 1 else f"https://elementgyms.pt/ginasio/?sf_paged={page}"
            html, _ = fetch(url)
            p.write_text(html, encoding="utf-8")
        else:
            html = p.read_text(encoding="utf-8", errors="replace")
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<[^>]+>", "\n", text)
        lines = [htmlmod.unescape(l).strip() for l in text.splitlines() if htmlmod.unescape(l).strip()]
        for i, l in enumerate(lines):
            m = re.search(r"^(\d{4}-\d{3})\s+(.+)$", l)
            if not m:
                continue
            postal, city = m.group(1), clean_text(m.group(2).split("Saber")[0])
            street = lines[i - 1] if i else ""
            name = lines[i - 2] if i >= 2 else ""
            if not re.search(r"Rua|Avenida|Av\.|Praça|Estrada|Travessa|R\.|Zona|C\.C\.|Mercado|Edif|Campus|novobanco", street, re.I):
                continue
            # Fix swapped name/street cases
            if re.search(r"Rua|Avenida|Av\.|Praça|Estrada|Zona|C\.C\.|Mercado|Edif|Campus|novobanco", name, re.I):
                # name was actually street continuation — look further up
                name = lines[i - 3] if i >= 3 else street
                # if still street-like, use city as label
                if re.search(r"Rua|Avenida|Av\.|Zona|C\.C\.", name, re.I):
                    name = city
            hits.append((clean_text(name), clean_text(street), postal, city))
    # dedupe by postal+street
    seen = set()
    for name, street, postal, city in hits:
        key = (postal, street.lower())
        if key in seen:
            continue
        seen.add(key)
        brand = "Element"
        rid = make_id(brand, street, postal, city)
        out.append(
            {
                "id": rid,
                "name": f"Element {name}" if not name.lower().startswith("element") else name,
                "brand": brand,
                "chain_key": "element",
                "address": street,
                "postal_code": postal,
                "city": city,
                "country": "Portugal",
                "lat": None,
                "lng": None,
                "website": "https://elementgyms.pt/ginasio/",
                "source_url": "https://elementgyms.pt/ginasio/",
                "coord_source": "",
                "notes": "element_listing_pages",
                "import_category": "",
                "discovered_at": rows[0].get("discovered_at") if rows else "",
                "is_active": True,
                "evidence": {"source": "element_ginasio_listing", "name": name},
            }
        )
    print("  Element rows", sum(1 for r in out if r["brand"] == "Element"))
    return out


def expand_befit(rows: list[dict]) -> list[dict]:
    print("Expand Be-Fit from sitemap…")
    out = [r for r in rows if r.get("brand") != "Be-Fit"]
    sm = (RAW / "befit_sitemap.xml").read_text(encoding="utf-8")
    locs = sorted(set(re.findall(r"<loc>([^<]+/contactos)/?</loc>", sm)))
    print("  contactos urls", len(locs))
    for i, url in enumerate(locs, 1):
        url = url.replace("http://", "https://")
        if not url.endswith("/"):
            # normalize
            pass
        try:
            page, final = fetch(url if url.endswith("contactos") else url)
        except Exception as e:
            print("  fail", url, e)
            continue
        slug = url.rstrip("/").split("/")[-2] if url.rstrip("/").endswith("contactos") else url.rstrip("/").split("/")[-1]
        (PAGES / f"befit_{slug}.html").write_text(page[:300000], encoding="utf-8")
        text = strip_html_to_text(page)
        m = re.search(
            r"((?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Rampa|R\.)[^,]{3,90}?)\s+(\d{4}-\d{3})\s+([A-Za-zÀ-ú \-']+)",
            text,
        )
        if not m:
            continue
        address = clean_text(m.group(1))
        postal = m.group(2)
        city = clean_text(m.group(3).split("Telefones")[0].split("Telefone")[0])
        status = ""
        try:
            club_html, _ = fetch(f"https://be-fit.pt/befit/{slug}")
            if re.search(r"brevemente|em breve", strip_html_to_text(club_html), re.I):
                status = "COMING_SOON"
        except Exception:
            pass
        brand = "Be-Fit"
        rid = make_id(brand, address, postal, city)
        out.append(
            {
                "id": rid,
                "name": f"Be-Fit {slug.replace('-', ' ').title()}",
                "brand": brand,
                "chain_key": "be_fit",
                "address": address,
                "postal_code": postal,
                "city": city,
                "country": "Portugal",
                "lat": None,
                "lng": None,
                "website": final,
                "source_url": final,
                "coord_source": "",
                "notes": "befit_sitemap_contactos",
                "import_category": status,
                "discovered_at": rows[0].get("discovered_at") if rows else "",
                "is_active": True,
                "evidence": {"source": "befit_contactos", "url": final},
            }
        )
        if i % 8 == 0:
            print(f"  … {i}/{len(locs)}")
        time.sleep(0.2)
    print("  Be-Fit rows", sum(1 for r in out if r["brand"] == "Be-Fit"))
    return out


def repair_ff_city_from_page(rows: list[dict]) -> list[dict]:
    """Ensure FF rows have city from page header line above street."""
    print("Repair Fitness Factory city labels…")
    for r in rows:
        if r.get("brand") != "Fitness Factory":
            continue
        slug = (r.get("source_url") or "").rstrip("/").split("/")[-1]
        p = PAGES / f"ff_{slug}.html"
        if not p.exists():
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<[^>]+>", "\n", text)
        lines = [htmlmod.unescape(l).strip() for l in text.splitlines() if htmlmod.unescape(l).strip()]
        for i, l in enumerate(lines):
            if re.search(r"^(?:Rua|Avenida|Av\.|Praça|Estrada|Travessa|Caminho)\b", l, re.I) or re.search(
                r"\b(?:Rua|Avenida|Av\.|Caminho)\b.+\d", l, re.I
            ):
                city_line = lines[i - 1] if i else ""
                if city_line and len(city_line) < 40 and not re.search(r"@|CONSULTA|http|\d{9}", city_line):
                    r["city"] = clean_text(city_line)
                if not r.get("address"):
                    r["address"] = clean_text(l)
                # Recompute id
                r["id"] = make_id(r["brand"], r.get("address") or "", r.get("postal_code") or "", r.get("city") or "")
                break
    return rows


def main():
    path = OUT / "portugal_phase1_candidates.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    maps_cache_path = OUT / "portugal_maps_resolve_cache.json"
    maps_cache = json.loads(maps_cache_path.read_text(encoding="utf-8")) if maps_cache_path.exists() else {}

    rows = repair_solinca(rows, maps_cache)
    rows = rebuild_element(rows)
    rows = expand_befit(rows)
    rows = repair_ff_city_from_page(rows)

    maps_cache_path.write_text(json.dumps(maps_cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    from collections import Counter

    print("TOTAL", len(rows))
    print(Counter(r["brand"] for r in rows))
    print(
        "with postal",
        sum(1 for r in rows if r.get("postal_code")),
        "with addr",
        sum(1 for r in rows if r.get("address")),
        "with coords",
        sum(1 for r in rows if r.get("lat") is not None),
    )


if __name__ == "__main__":
    main()
