#!/usr/bin/env python3
"""Fetch remaining Phase 2 official sources into scrape files (does not touch staging)."""
from __future__ import annotations

import json
import re
import ssl
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/uk"
RAW = OUT / "raw"
SCRAPES = OUT / "scrapes"
PAGES = RAW / "pages"

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}
UK_POSTCODE_RE = re.compile(r"\b([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\b", re.I)


def log(*a):
    print(*a, flush=True)


def fetch(url: str, timeout: int = 35) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "replace")


def fetch_safe(url: str, timeout: int = 35) -> tuple[str, str | None]:
    try:
        return fetch(url, timeout=timeout), None
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


def normalize_postcode(s: str | None) -> str:
    if not s:
        return ""
    m = UK_POSTCODE_RE.search(str(s).upper())
    if not m:
        return ""
    return f"{m.group(1).upper()} {m.group(2).upper()}"


def parse_blob(text: str) -> dict:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text)
    pc = normalize_postcode(text)
    address = ""
    city = ""
    if pc:
        m = UK_POSTCODE_RE.search(text.upper())
        if m:
            before = text[: m.start()].strip(" ,")
            parts = [p.strip() for p in before.split(",") if p.strip()]
            if parts:
                city = parts[-1]
                address = ", ".join(parts[:-1] if len(parts) > 1 else parts)
    return {"address": address, "postal_code": pc, "city": city}


def tgg_east_anglia():
    stg = json.loads((OUT / "uk_centers_staging.json").read_text())
    tgg = [r for r in stg if r.get("brand") == "The Gym Group" and "club_page_http_500" in (r.get("notes") or "")]
    # also any TGG without address
    extra = [r for r in stg if r.get("brand") == "The Gym Group" and not (r.get("address") or "").strip() and r not in tgg]
    rows = tgg + extra
    out = []
    for r in rows:
        src = (r.get("source_url") or "").rstrip("/")
        path = src.replace("https://www.thegymgroup.com", "")
        kiosk = "https://kiosk.thegymgroup.com" + path + "/"
        origin = "https://prod-www-origin.thegymgroup.com" + path + "/"
        html, err = fetch_safe(kiosk)
        used = kiosk
        if not html or not normalize_postcode(html):
            html2, err2 = fetch_safe(origin)
            if html2:
                html, err, used = html2, err2, origin
        parsed = parse_blob(html)
        # JSON-LD
        for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.I | re.S):
            try:
                ld = json.loads(m.group(1), strict=False)
            except Exception:
                continue
            objs = ld if isinstance(ld, list) else [ld]
            for obj in objs:
                if isinstance(obj, dict) and "@graph" in obj:
                    objs.extend(obj["@graph"] if isinstance(obj["@graph"], list) else [obj["@graph"]])
            for obj in objs:
                if not isinstance(obj, dict):
                    continue
                addr = obj.get("address") or {}
                if isinstance(addr, dict):
                    pc = normalize_postcode(addr.get("postalCode") or "")
                    street = addr.get("streetAddress") or ""
                    city = addr.get("addressLocality") or parsed["city"]
                    if pc:
                        parsed = {"address": street, "postal_code": pc, "city": city}
                geo = obj.get("geo") or {}
                if isinstance(geo, dict) and geo.get("latitude"):
                    parsed["lat"] = geo.get("latitude")
                    parsed["lng"] = geo.get("longitude")
        out.append(
            {
                "brand": "The Gym Group",
                "center_name": r.get("name") or r.get("center_name"),
                "address": parsed.get("address") or "",
                "postal_code": parsed.get("postal_code") or "",
                "city": parsed.get("city") or "",
                "lat": parsed.get("lat"),
                "lng": parsed.get("lng"),
                "source_url": src,
                "alt_source_url": used,
                "notes": "kiosk_or_origin_official; phase2_east_anglia",
                "error": err if not parsed.get("postal_code") else None,
            }
        )
        log("TGG", r.get("name"), parsed.get("postal_code"), parsed.get("address")[:60] if parsed.get("address") else err)
        time.sleep(0.2)
    (SCRAPES / "tgg_east_anglia.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    log("wrote tgg_east_anglia", len(out), "with pc", sum(1 for x in out if x.get("postal_code")))


def everlast_jina():
    stg = json.loads((OUT / "uk_centers_staging.json").read_text())
    ev = [r for r in stg if r.get("brand") == "Everlast Gyms"]
    if not ev:
        ev = json.loads((SCRAPES / "everlast_uk.json").read_text())
    out = []
    for r in ev:
        src = r.get("source_url") or ""
        if not src:
            continue
        jina = "https://r.jina.ai/" + src
        html, err = fetch_safe(jina, timeout=45)
        parsed = parse_blob(html)
        # jina often drops address; also try raw storyblok-ish lines
        coming = bool(re.search(r"coming soon|opening soon|now opening", html or "", re.I))
        closed = bool(re.search(r"permanently closed|this gym has closed", html or "", re.I))
        temp = bool(re.search(r"temporarily closed", html or "", re.I))
        status = "COMING_SOON" if coming else "CLOSED" if closed else "VERIFIED_CURRENT"
        out.append(
            {
                "brand": "Everlast Gyms",
                "legacy_brand": "DW Sports Fitness",
                "center_name": r.get("name") or r.get("center_name"),
                "address": parsed.get("address") or "",
                "postal_code": parsed.get("postal_code") or "",
                "city": parsed.get("city") or r.get("city") or "",
                "country": "United Kingdom",
                "lat": None,
                "lng": None,
                "source_url": src,
                "verification_status": status,
                "notes": ("jina_official_page; phase2" + ("; temporarily_closed_for_works" if temp else "")),
                "error": err,
                "has_html": bool(html),
                "html_len": len(html or ""),
            }
        )
        log("Everlast", r.get("name"), parsed.get("postal_code") or err or "no-pc", "html", len(html or ""))
        time.sleep(0.15)
    (SCRAPES / "everlast_uk_phase2.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    log("wrote everlast", len(out), "with pc", sum(1 for x in out if x.get("postal_code")))


if __name__ == "__main__":
    tgg_east_anglia()
    everlast_jina()
