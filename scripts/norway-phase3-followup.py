#!/usr/bin/env python3
"""Phase 3 follow-up: remaining Impulse centers, address fixes, Fitnesspoint sample staging."""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P3 = ROOT / "data/norway/phase3"
RAW = P3 / "raw"
STAGING = ROOT / "data/norway/norway_centers_staging.json"
P2 = ROOT / "data/norway/phase2_new_centers_staging.json"
P3_NEW = P3 / "phase3_new_centers_staging.json"

ctx = ssl.create_default_context()
UA = {"User-Agent": "GymlyNorwayBot/1.0 (catalog research)"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def make_id(*parts: str) -> str:
    key = "|".join((p or "").strip().lower() for p in parts)
    return "no_" + hashlib.md5(key.encode()).hexdigest()[:10]


def parse_impulse_page(html: str) -> dict | None:
    # Prefer structured address blocks
    patterns = [
        r"Adresse[:\s]*</[^>]+>\s*<[^>]+>([^<]+)</",
        r"Adresse[:\s]*</?[^>]*>\s*([^<\n]+)",
        r"<p[^>]*>\s*([^<\n]*(?:gate|vei|vegen|vei)[^<\n]*\d[^<\n]*)\s*</p>",
        r'"streetAddress"\s*:\s*"([^"]+)"',
    ]
    address = None
    for pat in patterns:
        m = re.search(pat, html, re.I)
        if m:
            address = re.sub(r"\s+", " ", m.group(1)).strip(" ,.")
            if len(address) > 5:
                break
    # postal + city
    postal = city = None
    m = re.search(r"\b(\d{4})\s+([A-ZÆØÅa-zæøå][A-Za-zÆØÅæøå\- ]{1,40})", html)
    # Prefer near address context
    if address:
        idx = html.find(address[:20]) if address else -1
        window = html[max(0, idx) : idx + 400] if idx >= 0 else html
        m2 = re.search(r"\b(\d{4})\s+([A-ZÆØÅ][A-Za-zÆØÅæøå\- ]{1,40})", window)
        if m2:
            postal, city = m2.group(1), m2.group(2).strip()
    if not postal and m:
        postal, city = m.group(1), m.group(2).strip()
    # strip shopping-center fluff from address if postal glued
    if address and postal and postal in address:
        address = address.split(postal)[0].strip(" ,")
    if not address:
        return None
    return {"address": address, "postal_code": postal or "", "city": (city or "").title()}


def scrape_impulse_remaining():
    xml = (RAW / "impulse_center_sitemap.xml").read_text(encoding="utf-8")
    locs = re.findall(r"<loc>([^<]+)</loc>", xml)
    existing = json.loads(P3_NEW.read_text())
    have = {
        (r.get("source_url") or "").rstrip("/")
        for r in existing
        if r.get("brand") == "Impulse Treningssenter"
    }
    new_rows = []
    for url in locs:
        url = url.rstrip("/") + "/"
        if url.rstrip("/") in have or url.rstrip("/") + "/" in {u.rstrip("/") for u in have}:
            # normalize check
            base = url.rstrip("/")
            if any(base == h.rstrip("/") for h in have):
                continue
        slug = url.rstrip("/").split("/")[-1]
        print("Impulse fetch", slug)
        try:
            page = fetch(url)
        except Exception as e:
            print(" fail", e)
            continue
        RAW.joinpath(f"impulse_{slug}.html").write_text(page, encoding="utf-8")
        parsed = parse_impulse_page(page)
        print(" ", parsed)
        if not parsed:
            new_rows.append(
                {
                    "id": make_id("Impulse Treningssenter", slug),
                    "name": f"Impulse Treningssenter {slug.replace('-', ' ').title()}",
                    "brand": "Impulse Treningssenter",
                    "address": "",
                    "postal_code": "",
                    "city": "",
                    "country": "Norway",
                    "lat": None,
                    "lng": None,
                    "is_active": False,
                    "verification_status": "unverified",
                    "source_url": url,
                    "center_name": slug,
                    "import_category": "NEEDS_REVIEW",
                    "phase": "phase3",
                    "phase3_ready_for_geocode": False,
                }
            )
            time.sleep(0.8)
            continue
        # fill postal via nominatim if missing later
        row = {
            "id": make_id(
                "Impulse Treningssenter",
                parsed["address"],
                parsed["postal_code"],
                parsed["city"],
            ),
            "name": f"Impulse Treningssenter {slug.replace('-', ' ').title()}",
            "brand": "Impulse Treningssenter",
            "address": parsed["address"],
            "postal_code": parsed["postal_code"],
            "city": parsed["city"] or "Trondheim",
            "country": "Norway",
            "lat": None,
            "lng": None,
            "is_active": False,
            "verification_status": "verified_official",
            "source_url": url,
            "center_name": slug,
            "import_category": "NEEDS_COORDINATES"
            if parsed["postal_code"]
            else "NEEDS_REVIEW",
            "phase": "phase3",
            "phase3_ready_for_geocode": bool(parsed["address"] and parsed["postal_code"]),
        }
        new_rows.append(row)
        time.sleep(0.8)
    # merge
    by_url = {(r.get("source_url") or "").rstrip("/"): r for r in existing}
    for r in new_rows:
        key = (r.get("source_url") or "").rstrip("/")
        if key not in by_url:
            existing.append(r)
            by_url[key] = r
            print("added", r["name"])
        else:
            print("already have", r["name"])
    P3_NEW.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n")
    (P3 / "impulse_norway.json").write_text(
        json.dumps(
            [r for r in existing if r.get("brand") == "Impulse Treningssenter"],
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    return new_rows


ADDRESS_FIXES = {
    # id or name -> new address fields
    "3T-Treningssenter Sluppen": {
        "address": "Sluppenveien 12 H",
        "note": "fixed typo Sluppenveieneien -> Sluppenveien",
    },
    "Sporty Porsgrunn": {
        "address": "Kulltangveien 70",
        "note": "expanded Kulltangv abbreviation",
    },
    "Sporty Grimstad": {
        "address": "Storgata 90",
        "note": "expanded Storgt. abbreviation",
    },
    "Sporty Askim": {
        "address": "Henstad allé 1 A",
        "note": "normalized alle -> allé",
    },
    "Feel24 Melbu": {
        "address": "Chr. Fredriksens gate 3",
        "note": "removed stray period in gate.",
    },
    "Fitness24Seven Drammen Sentrum": {
        "address": "Torgeir Vraas plass 6",
        "note": "normalized nr -> plass (Drammen naming)",
    },
    "Spenst Kråkerøy": {
        "address": "Selma Nygrens vei 1",
        "note": "house number unknown; leave NEEDS_REVIEW if still fails — try with space",
    },
}


def apply_address_fixes():
    files = [STAGING, P2, P3_NEW]
    applied = []
    for path in files:
        rows = json.loads(path.read_text())
        changed = False
        for r in rows:
            fix = ADDRESS_FIXES.get(r.get("name") or "")
            if not fix:
                continue
            if r.get("address") == fix["address"]:
                continue
            old = r.get("address")
            r["address"] = fix["address"]
            r["phase3_address_fix"] = fix["note"]
            r["phase3_ready_for_geocode"] = bool(r.get("postal_code") and r.get("city"))
            if r.get("import_category") in {
                "NEEDS_COORDINATES",
                "NEEDS_REVIEW",
                "SKIP_INCOMPLETE",
            }:
                if r.get("postal_code") and r.get("city") and r.get("address"):
                    r["import_category"] = "NEEDS_COORDINATES"
                    r["geocode_status"] = "pending_retry"
            changed = True
            applied.append({"file": path.name, "name": r["name"], "old": old, "new": fix["address"]})
        if changed:
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    (P3 / "phase3_address_fixes.json").write_text(
        json.dumps(applied, ensure_ascii=False, indent=2) + "\n"
    )
    print("address fixes", len(applied))
    return applied


def scrape_fitnesspoint_list():
    """Stage Fitnesspoint centers from official list page (addresses only; geocode later)."""
    url = "https://fitnesspoint.no/vare-senter/"
    try:
        html = fetch(url)
    except Exception as e:
        print("fitnesspoint fail", e)
        return []
    RAW.joinpath("fitnesspoint_vare_senter.html").write_text(html, encoding="utf-8")
    # Blocks like: ## Askim ... Dr. Randers gate 11 1830 Askim
    # HTML often: <h2...>Askim</h2> ... address ... postal city
    rows = []
    # Split by h2/h3 headings for center names
    parts = re.split(r"<h[23][^>]*>", html, flags=re.I)
    for part in parts[1:]:
        mname = re.match(r"([^<]+)</h[23]>", part, re.I)
        if not mname:
            continue
        name = re.sub(r"\s+", " ", mname.group(1)).strip()
        if name.lower() in {"finn senter", "kontakt oss", "om fitnesspoint"}:
            continue
        # find first postal in section
        m = re.search(
            r"([A-Za-zÆØÅæøå0-9 .,\-/]{5,80}?)\s*(\d{4})\s+([A-Za-zÆØÅæøå\- ]{2,40})",
            part[:800],
        )
        if not m:
            continue
        address = re.sub(r"\s+", " ", m.group(1)).strip(" ,.")
        # clean leading junk tags
        address = re.sub(r"<[^>]+>", " ", address)
        address = re.sub(r"\s+", " ", address).strip(" ,.")
        if len(address) < 5 or not re.search(r"\d", address):
            continue
        postal = m.group(2)
        city = m.group(3).strip().title()
        row = {
            "id": make_id("Fitnesspoint", address, postal, city),
            "name": f"Fitnesspoint {name}",
            "brand": "Fitnesspoint",
            "address": address,
            "postal_code": postal,
            "city": city,
            "country": "Norway",
            "lat": None,
            "lng": None,
            "is_active": False,
            "verification_status": "verified_official",
            "source_url": url,
            "center_name": name,
            "import_category": "NEEDS_COORDINATES",
            "phase": "phase3",
            "phase3_ready_for_geocode": True,
        }
        rows.append(row)
    # dedupe by id
    by_id = {r["id"]: r for r in rows}
    rows = list(by_id.values())
    (P3 / "fitnesspoint_norway.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    )
    print("Fitnesspoint staged candidates", len(rows))
    # merge into phase3 new if address quality ok
    existing = json.loads(P3_NEW.read_text())
    ex_ids = {r["id"] for r in existing}
    added = 0
    for r in rows:
        if r["id"] in ex_ids:
            continue
        # skip weak addresses (no digit house-ish)
        if not re.search(r"\d", r["address"]):
            r["import_category"] = "NEEDS_REVIEW"
            r["phase3_ready_for_geocode"] = False
        existing.append(r)
        added += 1
    P3_NEW.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n")
    print("Fitnesspoint added to phase3 staging", added)
    return rows


def mark_coming_soon():
    """Document known coming-soon; do not mark active."""
    notes = [
        {
            "chain": "Spenst",
            "name": "Spenst Fredrikstad",
            "note": "Reported opening 2027 — do not import as active",
            "category": "COMING_SOON",
        },
        {
            "chain": "SKY Fitness",
            "name": "SKY Moss / SKY Ski",
            "note": "Reported autumn 2026 openings — verify before import; keep COMING_SOON",
            "category": "COMING_SOON",
        },
    ]
    (P3 / "coming_soon_notes.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    print("=== Impulse remaining ===")
    scrape_impulse_remaining()
    print("=== Address fixes ===")
    apply_address_fixes()
    print("=== Fitnesspoint ===")
    scrape_fitnesspoint_list()
    mark_coming_soon()
    print("done")
