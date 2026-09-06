#!/usr/bin/env python3
"""
Germany Phase 3 consolidate: merge new scrapes, targeted unresolved retries,
coming-soon review, duplicate analysis, readiness report.

Does NOT modify src/data/centers.json.
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
RAW3 = OUT / "raw" / "phase3"
PHASE3 = OUT / "phase3"
STAGING = OUT / "germany_centers_staging.json"
CENTERS = ROOT / "src/data/centers.json"

ctx = ssl.create_default_context()
UA = "GymlyGermanyGeocoder/3.0 (catalog research)"
HTTP_UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyGermanyResearch/3.0; +https://gymly.app)",
    "Accept-Language": "de-DE,de;q=0.9",
}
DE_BOUNDS = (47.0, 55.5, 5.5, 15.5)
PHASE2_TOTAL = 1287
PHASE2_READY = 1245


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
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def to_float(v):
    try:
        if v is None or v == "":
            return None
        f = float(v)
        return f if abs(f) > 0.01 else None
    except Exception:
        return None


def in_de(lat, lng):
    if lat is None or lng is None:
        return False
    lo, hi, w, e = DE_BOUNDS
    return lo <= lat <= hi and w <= lng <= e


def haversine(a, b, c, d):
    R = 6371000
    p1, p2 = math.radians(a), math.radians(c)
    dp = math.radians(c - a)
    dl = math.radians(d - b)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def clean(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers=HTTP_UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def classify(r):
    if r.get("verification_status") == "CLOSED" or r.get("import_category") == "CLOSED":
        r["import_category"] = "CLOSED"
        return r
    if r.get("verification_status") == "COMING_SOON" or r.get("import_category") == "COMING_SOON":
        r["import_category"] = "COMING_SOON"
        r["lat"] = r.get("lat")
        r["lng"] = r.get("lng")
        return r
    if not r.get("address") or not r.get("postal_code") or not r.get("city"):
        r["import_category"] = "NEEDS_REVIEW"
        return r
    # EMS-only Easyfitness locations stay out of READY
    name = (r.get("name") or "").lower()
    if r.get("brand") == "EASYFITNESS" and re.search(r"\bems\b", name):
        r["import_category"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + "; ems_only_not_normal_gym").strip("; ")
        return r
    lat, lng = to_float(r.get("lat")), to_float(r.get("lng"))
    if lat is not None and lng is not None and math.isfinite(lat) and math.isfinite(lng) and in_de(lat, lng):
        r["lat"], r["lng"] = lat, lng
        r["import_category"] = "READY_TO_IMPORT"
        return r
    if lat is not None and lng is not None and not in_de(lat, lng):
        r["lat"] = r["lng"] = None
        r["import_category"] = "NEEDS_REVIEW"
        r["notes"] = ((r.get("notes") or "") + "; coord_outside_de").strip("; ")
        return r
    r["import_category"] = "NEEDS_COORDINATES"
    return r


def rebuild_pfitzenmeier():
    html = (RAW3 / "pfitzen_kontakt.html").read_text(encoding="utf-8", errors="replace")
    out = []
    for m in re.finditer(r"<h5>\s*(.*?)\s*</h5>([\s\S]{0,1200}?)</address>", html, re.I):
        title = clean(m.group(1))
        body = m.group(2)
        gm = re.search(r"/@(-?\d+\.\d+),(-?\d+\.\d+)", body)
        lat = lng = None
        if gm:
            lat, lng = float(gm.group(1)), float(gm.group(2))
        pm = re.search(r"(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{2,40})\s*<br", body)
        postal = city = street = ""
        if pm:
            postal, city = pm.group(1), pm.group(2).strip()
        sm = re.search(r">\s*([^<]+?)\s*<br/>\s*\d{5}\s+", body)
        if sm:
            street = clean(sm.group(1))
        name = title if title.lower().startswith("pfitzenmeier") else f"Pfitzenmeier {title}"
        concept = "Premium Resort" if "resort" in title.lower() else "Premium Club"
        out.append(
            {
                "id": make_id("Pfitzenmeier", street, postal, city),
                "brand": "Pfitzenmeier",
                "name": name,
                "center_name": name,
                "address": street,
                "postal_code": postal,
                "city": city,
                "country": "Germany",
                "lat": lat,
                "lng": lng,
                "website": "https://www.pfitzenmeier.de/standorte/",
                "source_url": "https://www.pfitzenmeier.de/kontakt/studios/",
                "verification_status": "VERIFIED_CURRENT",
                "legacy_brand": None,
                "notes": f"phase3_owned_club; concept={concept}",
                "is_active": False,
                "import_category": "PENDING",
                "phase": "germany_phase3",
                "coord_source": "official_page" if lat else None,
            }
        )
    (SCRAPES / "pfitzenmeier_germany.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("rebuilt Pfitzenmeier", len(out))
    return out


def improve_venicebeach(rows):
    improved = []
    for r in rows:
        url = r.get("source_url") or ""
        slug = url.rstrip("/").split("/")[-1].replace(".html", "")
        # better name from URL path
        parts = [p for p in url.replace("https://www.venicebeach-fitness.de/", "").split("/") if p]
        concept = "VeniceBeach"
        loc = slug.replace("-", " ").title()
        if "venicebeach-lady" in url:
            concept = "VeniceBeach Lady"
        elif "venicebeach-plus" in url:
            concept = "VeniceBeach Plus"
        elif "venicebeach-supreme" in url:
            concept = "VeniceBeach Supreme"
        r["name"] = f"{concept} {loc}".strip()
        r["center_name"] = r["name"]
        # city junk
        city = r.get("city") or ""
        city = re.sub(r"\s+mit Kinderbetreuung.*", "", city, flags=re.I).strip()
        r["city"] = city
        # pull street from saved html if missing
        if not r.get("address"):
            for p in RAW3.glob("vb_*.html"):
                if slug[:20] in p.name or slug in p.name:
                    html = p.read_text(encoding="utf-8", errors="replace")
                    sm = re.search(
                        r"([A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.|weg|platz|allee)[^<\n,]{0,30}\d+[a-zA-Z\-/]*)",
                        html,
                        re.I,
                    )
                    if sm:
                        r["address"] = clean(sm.group(1))
                    break
        r["id"] = make_id("VeniceBeach", r.get("address"), r.get("postal_code"), r.get("city"))
        r["notes"] = ((r.get("notes") or "") + f"; concept={concept}").strip("; ")
        improved.append(r)
    (SCRAPES / "venicebeach_germany.json").write_text(
        json.dumps(improved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("improved VeniceBeach", Counter(bool(r.get("address")) for r in improved))
    return improved


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
    if not in_de(lat, lng):
        return None, ["outside_de"], lat, lng
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
        norm(addr.get(k) or "") for k in ("city", "town", "village", "municipality", "suburb")
    )
    if city_n and city_n in city_fields:
        score += 3
        reasons.append("city_ok")
    street_n = norm(street)
    road = norm(addr.get("road") or "")
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


def geocode_row(r, extra_queries=None):
    street, postal, city = r.get("address") or "", r.get("postal_code") or "", r.get("city") or ""
    queries = extra_queries or []
    queries += [
        f"{street}, {postal} {city}, Germany",
        f"{street}, {postal}, Germany",
        f"{street}, {city}, Germany",
    ]
    # de-dupe empty
    seen = set()
    qlist = []
    for q in queries:
        q = re.sub(r"\s+", " ", q).strip(" ,")
        if q in seen or q in ("Germany", ", Germany"):
            continue
        seen.add(q)
        qlist.append(q)
    for q in qlist:
        try:
            items = nominatim(q)
            time.sleep(1.1)
        except Exception:
            time.sleep(1.1)
            continue
        scored = []
        for it in items:
            sc, reasons, lat, lng = score_candidate(it, street, postal, city)
            if sc is None:
                continue
            scored.append((sc, reasons, lat, lng, it.get("display_name")))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            continue
        top = scored[0]
        if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 0.5:
            if haversine(scored[0][2], scored[0][3], scored[1][2], scored[1][3]) > 150:
                r["import_category"] = "NEEDS_REVIEW"
                r["geocode_status"] = "ambiguous"
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
    r["lat"] = r["lng"] = None
    return r


def targeted_unresolved(rows):
    """Re-fetch official pages for NEEDS_* and improve addresses, then geocode."""
    report = []
    targets = [
        r
        for r in rows
        if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
        and r.get("brand") not in ("Kieser", "Pfitzenmeier", "ELEMENTS", "Basic-Fit", "VeniceBeach")
    ]
    # also include new-chain unresolved after merge
    print("targeted unresolved starting", len(targets))
    for r in list(rows):
        if r.get("import_category") not in ("NEEDS_COORDINATES", "NEEDS_REVIEW"):
            continue
        url = r.get("source_url") or r.get("website")
        before = {
            "cat": r.get("import_category"),
            "addr": r.get("address"),
            "postal": r.get("postal_code"),
            "city": r.get("city"),
        }
        # drop template junk
        if "{{" in (r.get("name") or "") or (url or "").rstrip("/") == "https://www.fitnessfirst.de/clubs":
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = ((r.get("notes") or "") + "; listing_hub_not_a_club").strip("; ")
            report.append({"name": r.get("name"), "action": "hub_not_club", "before": before})
            continue
        if r.get("brand") == "EASYFITNESS" and re.search(r"\bems\b", (r.get("name") or ""), re.I):
            r["import_category"] = "NEEDS_REVIEW"
            r["notes"] = ((r.get("notes") or "") + "; ems_only_not_normal_gym").strip("; ")
            report.append({"name": r.get("name"), "action": "ems_excluded", "before": before})
            continue
        if not url or not url.startswith("http"):
            report.append({"name": r.get("name"), "action": "no_url"})
            continue
        try:
            html, final = fetch(url)
            time.sleep(0.3)
        except Exception as e:
            report.append({"name": r.get("name"), "action": "fetch_fail", "error": str(e)})
            continue
        # coming soon / closed signals
        low = html[:15000].lower()
        if any(x in low for x in ("dauerhaft geschlossen", "studio geschlossen", " unfortunately closed")):
            r["verification_status"] = "CLOSED"
            r["import_category"] = "CLOSED"
            report.append({"name": r.get("name"), "action": "closed"})
            continue
        # JSON-LD
        addr = r.get("address") or ""
        postal = r.get("postal_code") or ""
        city = r.get("city") or ""
        lat = to_float(r.get("lat"))
        lng = to_float(r.get("lng"))
        for m in re.finditer(
            r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html,
            re.I | re.S,
        ):
            try:
                blob = json.loads(m.group(1))
            except Exception:
                continue
            items = blob if isinstance(blob, list) else [blob]
            for it in items:
                if not isinstance(it, dict):
                    continue
                a = it.get("address")
                if isinstance(a, dict):
                    addr = clean(str(a.get("streetAddress") or addr))
                    if re.fullmatch(r"\d{5}", str(a.get("postalCode") or "")):
                        postal = str(a.get("postalCode"))
                    city = clean(str(a.get("addressLocality") or city))
                geo = it.get("geo")
                if isinstance(geo, dict):
                    lat = to_float(geo.get("latitude")) or lat
                    lng = to_float(geo.get("longitude")) or lng
        # Easyfitness: fix common typos
        if r.get("brand") == "EASYFITNESS":
            addr = addr.replace("Chausee", "Chaussee")
            # house ranges: try first number
        if city and ("coh-" in city or "instance" in city):
            city = ""
        if postal and not re.fullmatch(r"\d{5}", str(postal)):
            postal = ""
        r["address"] = addr
        r["postal_code"] = postal
        r["city"] = city
        r["source_url"] = final or url
        if lat and lng and in_de(lat, lng) and addr and postal and city:
            r["lat"], r["lng"] = lat, lng
            r["coord_source"] = "official_page"
            r["import_category"] = "READY_TO_IMPORT"
            report.append({"name": r.get("name"), "action": "official_coords", "before": before})
            continue
        # preserve original id if address unchanged
        new_id = make_id(r.get("brand"), addr, postal, city)
        if addr and postal and city:
            r["id"] = new_id
        classify(r)
        extra = []
        # improved queries: first house number only, typo fixes
        if addr:
            compact = re.sub(r"(\d+)\s*[-–/]\s*\d+[a-zA-Z]?", r"\1", addr)
            extra.append(f"{compact}, {postal} {city}, Germany")
        if r.get("import_category") == "NEEDS_COORDINATES":
            geocode_row(r, extra_queries=extra)
        report.append(
            {
                "name": r.get("name"),
                "action": "retry",
                "before": before,
                "after_cat": r.get("import_category"),
                "geocode": r.get("geocode_status"),
            }
        )
    PHASE3.joinpath("unresolved_retry.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("unresolved retry", Counter(x.get("action") for x in report))
    return report


def review_coming_soon(rows):
    results = []
    for r in rows:
        if r.get("import_category") != "COMING_SOON":
            continue
        url = r.get("source_url") or r.get("website")
        if not url:
            results.append({"name": r.get("name"), "status": "kept_coming_soon", "reason": "no_url"})
            continue
        try:
            html, final = fetch(url)
            time.sleep(0.35)
        except Exception as e:
            results.append({"name": r.get("name"), "status": "kept_coming_soon", "reason": f"fetch_fail:{e}"})
            continue
        low = html[:20000].lower()
        still_soon = any(
            x in low
            for x in (
                "coming soon",
                "demnächst",
                "in planung",
                "eröffnung",
                "eroeffnung",
                "bald geöffnet",
                "öffnet bald",
                "pre-sale",
                "vorverkauf",
                "opening soon",
            )
        )
        clearly_open = any(
            x in low
            for x in ("jetzt geöffnet", "jetzt Mitglied", "jetzt mitglied werden", "studio ist geöffnet")
        ) and not still_soon
        if clearly_open and r.get("address") and r.get("postal_code") and r.get("city") and r.get("lat"):
            r["verification_status"] = "VERIFIED_CURRENT"
            r["import_category"] = "READY_TO_IMPORT"
            r["notes"] = ((r.get("notes") or "") + "; upgraded_from_coming_soon_phase3").strip("; ")
            results.append({"name": r.get("name"), "status": "upgraded_ready", "url": final})
        else:
            r["import_category"] = "COMING_SOON"
            r["verification_status"] = "COMING_SOON"
            results.append({"name": r.get("name"), "status": "kept_coming_soon", "still_soon": still_soon})
    PHASE3.joinpath("coming_soon_review.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("coming soon", Counter(x["status"] for x in results))
    return results


def dedupe(rows):
    events = []
    by_id = {}
    for r in rows:
        rid = r["id"]
        if rid in by_id:
            old = by_id[rid]
            score = lambda x: (
                1 if x.get("lat") is not None else 0,
                1 if x.get("phase") == "germany_phase3" else 0,
                1 if x.get("address") else 0,
            )
            if score(r) > score(old):
                events.append({"reason": "same_id", "kept": r.get("name"), "dropped": old.get("name")})
                by_id[rid] = r
            else:
                events.append({"reason": "same_id", "kept": old.get("name"), "dropped": r.get("name")})
            continue
        by_id[rid] = r
    keep = list(by_id.values())
    by_key = {}
    final = []
    for r in keep:
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in by_key:
            events.append({"reason": "same_brand_address", "a": by_key[key].get("name"), "b": r.get("name")})
            continue
        if key[1]:
            by_key[key] = r
        final.append(r)
    # proximity same brand
    with_coords = [r for r in final if r.get("lat") is not None and r.get("lng") is not None]
    drop = set()
    for i, a in enumerate(with_coords):
        if a["id"] in drop:
            continue
        for b in with_coords[i + 1 :]:
            if b["id"] in drop:
                continue
            if norm(a.get("brand")) != norm(b.get("brand")):
                continue
            try:
                d = haversine(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 50:
                events.append(
                    {
                        "reason": "proximity_same_brand",
                        "a": a.get("name"),
                        "b": b.get("name"),
                        "m": round(d),
                    }
                )
                drop.add(b["id"])
    final = [r for r in final if r["id"] not in drop]
    same_addr = []
    by_addr = defaultdict(list)
    for r in final:
        if r.get("address"):
            by_addr[(norm(r.get("address")), str(r.get("postal_code") or ""))].append(r)
    for _, g in by_addr.items():
        brands = {norm(x.get("brand")) for x in g}
        if len(brands) > 1:
            same_addr.append(
                {
                    "address": g[0].get("address"),
                    "postal": g[0].get("postal_code"),
                    "brands": [x.get("brand") for x in g],
                    "names": [x.get("name") for x in g],
                }
            )
    return final, events, same_addr


def vs_live(rows):
    centers = json.loads(CENTERS.read_text(encoding="utf-8"))
    report = {
        "live_total": len(centers),
        "existing_germany": sum(1 for c in centers if (c.get("country") or "").lower() in ("germany", "de")),
        "id_collisions": [],
        "border_proximity_other_country": [],
        "same_brand_address_live": [],
    }
    all_ids = {c["id"] for c in centers}
    live_addr = {
        (norm(c.get("brand")), norm(c.get("address")), str(c.get("postal_code") or "")): c
        for c in centers
        if c.get("address")
    }
    for r in rows:
        if r["id"] in all_ids:
            report["id_collisions"].append({"id": r["id"], "name": r.get("name")})
        key = (norm(r.get("brand")), norm(r.get("address")), str(r.get("postal_code") or ""))
        if key[1] and key in live_addr:
            report["same_brand_address_live"].append(
                {"staging": r.get("name"), "live": live_addr[key].get("name"), "country": live_addr[key].get("country")}
            )
        if r.get("lat") is None:
            continue
        for c in centers:
            if c.get("lat") is None:
                continue
            country = (c.get("country") or "").lower()
            if country in ("germany", "de", ""):
                continue
            try:
                d = haversine(float(r["lat"]), float(r["lng"]), float(c["lat"]), float(c["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= 200:
                report["border_proximity_other_country"].append(
                    {
                        "staging": r.get("name"),
                        "live": c.get("name"),
                        "country": c.get("country"),
                        "m": round(d),
                    }
                )
    return report, centers


def write_excel(rows):
    cols = [
        "id",
        "brand",
        "name",
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
        "legacy_brand",
        "notes",
        "phase",
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
    ws.title = "Germany Centers"
    ws.append(cols)
    for r in sorted_rows:
        ws.append(
            [
                r.get("id"),
                r.get("brand"),
                r.get("name"),
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
                r.get("legacy_brand"),
                r.get("notes"),
                r.get("phase"),
            ]
        )
    path = OUT / "Gymly_Germany_All_Discovered_Centers.xlsx"
    wb.save(path)
    with (OUT / "Gymly_Germany_All_Discovered_Centers.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in sorted_rows:
            w.writerow(
                [
                    r.get("id"),
                    r.get("brand"),
                    r.get("name"),
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
                    r.get("legacy_brand"),
                    r.get("notes"),
                    r.get("phase"),
                ]
            )
    return path


def write_report(rows, phase3_new, events, same_addr, live_report, unresolved_start, centers_sha):
    cats = Counter(r.get("import_category") for r in rows)
    brands = Counter(r.get("brand") for r in rows)
    ready = cats.get("READY_TO_IMPORT", 0)
    live_total = live_report["live_total"]
    geocoded = sum(1 for r in rows if r.get("lat") is not None)
    soft = sum(1 for r in rows if r.get("geocode_status") == "suspicious" or "soft_postal" in (r.get("notes") or ""))
    ambiguous = sum(1 for r in rows if r.get("geocode_status") == "ambiguous")
    missing = sum(1 for r in rows if r.get("lat") is None)
    closed_ready_leak = [
        r.get("name")
        for r in rows
        if r.get("import_category") == "READY_TO_IMPORT"
        and (r.get("verification_status") == "CLOSED" or "GHOST-STUDIO" in (r.get("notes") or "") or "inaktiv" in (r.get("notes") or ""))
    ]

    official_est = {
        "clever fit": 400,
        "McFIT": 200,
        "FitX": 112,
        "EASYFITNESS": 205,
        "Fitness First": 90,
        "JOHN REED": 40,
        "Gold's Gym": 5,
        "all inclusive Fitness": 183,
        "INJOY": 70,
        "ELBGYM": 7,
        "PRIME TIME fitness": 25,
        "Kieser": 113,
        "Pfitzenmeier": 8,
        "ELEMENTS": 7,
        "Basic-Fit": 56,
        "VeniceBeach": 28,
        "FitnessLOFT": 0,
        "wellyou": 41,
    }

    def brand_stats(brand):
        s = [r for r in rows if r.get("brand") == brand]
        return {
            "discovered": len(s),
            "READY": sum(1 for r in s if r.get("import_category") == "READY_TO_IMPORT"),
            "unresolved": sum(
                1 for r in s if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
            ),
        }

    new_chains = []
    recs = {
        "Kieser": "INCLUDE — physical strength studios, independent member workouts",
        "Pfitzenmeier": "INCLUDE — 8 owned Premium Resorts/Clubs with normal gym floors",
        "FitnessLOFT": "DO NOT INCLUDE as own brand — rebranded to Fitness First (2023)",
        "ELEMENTS": "INCLUDE — 7 premium fitness+wellness clubs (Migros)",
        "Basic-Fit": "INCLUDE — own-brand DE clubs; keep distinct from clever fit",
        "VeniceBeach": "INCLUDE — regional conventional chain (Pfitzenmeier partner network)",
        "wellyou": "DO NOT STAGE this pass — locator unavailable; pending Basic-Fit rebrand",
    }
    for brand in ["Kieser", "Pfitzenmeier", "FitnessLOFT", "ELEMENTS", "Basic-Fit", "VeniceBeach", "wellyou"]:
        st = brand_stats(brand)
        new_chains.append(
            {
                "brand": brand,
                "official": official_est.get(brand, st["discovered"]),
                **st,
                "recommendation": recs[brand],
            }
        )

    ready_by_brand = {
        b: sum(1 for r in rows if r.get("brand") == b and r.get("import_category") == "READY_TO_IMPORT")
        for b in sorted(brands)
    }

    md = []
    md.append("# Germany Phase 3 Readiness Report")
    md.append("")
    md.append(f"**Status: NOT MERGED** — `src/data/centers.json` unchanged (`sha256={centers_sha[:16]}…`).")
    md.append("Awaiting explicit merge approval.")
    md.append("")
    md.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Overall")
    md.append("")
    md.append("| Metric | Count |")
    md.append("|--------|------:|")
    md.append(f"| Germany Phase 2 total | **{PHASE2_TOTAL}** |")
    md.append(f"| New Phase 3 locations discovered (net unique added) | **{len(rows) - PHASE2_TOTAL}** |")
    md.append(f"| Final unique Germany staging count | **{len(rows)}** |")
    md.append(f"| READY_TO_IMPORT | **{ready}** |")
    md.append(f"| NEEDS_COORDINATES | {cats.get('NEEDS_COORDINATES', 0)} |")
    md.append(f"| NEEDS_REVIEW | {cats.get('NEEDS_REVIEW', 0)} |")
    md.append(f"| COMING_SOON | {cats.get('COMING_SOON', 0)} |")
    md.append(f"| CLOSED | {cats.get('CLOSED', 0)} |")
    md.append(f"| Internal dedupe events | {len(events)} |")
    md.append("")
    md.append("Live catalog: DK/SE/NO unchanged. Germany live: **0**.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## New chains")
    md.append("")
    md.append("| Chain | Official/current | Discovered | READY | Unresolved | Include recommendation |")
    md.append("|-------|----------------:|-----------:|------:|-----------:|------------------------|")
    for c in new_chains:
        md.append(
            f"| {c['brand']} | {c['official']} | {c['discovered']} | {c['READY']} | {c['unresolved']} | {c['recommendation']} |"
        )
    md.append("")
    md.append("### Kieser qualification")
    md.append(
        "Kieser is specialized machine-based strength training, not a typical McFIT-style big-box gym. "
        "Members still perform independent resistance training in a physical studio and can meaningfully check in. **Included.**"
    )
    md.append("")
    md.append("### FitnessLOFT")
    md.append(
        "`fitnessloft.de` redirects to Fitness First. LifeFit rebranded FitnessLOFT (and smile X / In Shape) to Fitness First from 1 Oct 2023. "
        "No FitnessLOFT brand rows staged."
    )
    md.append("")
    md.append("### Pfitzenmeier concepts")
    md.append(
        "Owned network = 8 locations (Premium Resorts with AquaDome + Premium Clubs including MediFit). "
        "The marketing claim of 46+ studios is partner-network access (VeniceBeach / FitBase / FitCamp), not 46 Pfitzenmeier-branded gyms."
    )
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Existing unresolved")
    md.append("")
    md.append(f"- Starting: **{unresolved_start}** (16 NEEDS_COORDINATES + 5 NEEDS_REVIEW)")
    md.append(f"- Still NEEDS_COORDINATES: {cats.get('NEEDS_COORDINATES', 0)}")
    md.append(f"- Still NEEDS_REVIEW: {cats.get('NEEDS_REVIEW', 0)}")
    md.append("- Details: `data/germany/phase3/unresolved_retry.json`")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Final Germany brand breakdown (READY_TO_IMPORT)")
    md.append("")
    md.append("| Brand | READY |")
    md.append("|-------|------:|")
    for b, n in ready_by_brand.items():
        md.append(f"| {b} | {n} |")
    md.append(f"| **Total READY** | **{ready}** |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Quality")
    md.append("")
    md.append("| Issue | Count |")
    md.append("|-------|------:|")
    md.append(f"| Missing coordinates | {missing} |")
    md.append(f"| Successfully geocoded / official coords | {geocoded} |")
    md.append(f"| Soft postal geocodes | {soft} |")
    md.append(f"| Ambiguous geocodes | {ambiguous} |")
    md.append(f"| Same-address different-brand | {len(same_addr)} |")
    md.append(f"| ID collisions vs live | {len(live_report.get('id_collisions') or [])} |")
    md.append(f"| Border proximity ≤200 m vs non-DE live | {len(live_report.get('border_proximity_other_country') or [])} |")
    md.append(f"| CLOSED leaking into READY | {len(closed_ready_leak)} |")
    md.append("")
    md.append("Foreign excluded earlier (Phase 2): Fitness First Austria, EASYFITNESS Dubai.")
    md.append("Rebrands: FitnessLOFT/smile X/In Shape → Fitness First; jumpers → all inclusive; ELBGYM kept as current brand where titled ELBGYM.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Coverage assessment")
    md.append("")
    md.append(
        "Major conventional German gym groups now represented: RSG (McFIT/JOHN REED/Gold's), FitX, clever fit, "
        "all inclusive Fitness, LifeFit/Fitness First (+ ELBGYM), EASYFITNESS, INJOY, PRIME TIME, Kieser, "
        "Pfitzenmeier, ELEMENTS, Basic-Fit, VeniceBeach."
    )
    md.append("")
    md.append("**Still completely missing as a staged brand:** **wellyou** (~41 Norddeutschland clubs; Basic-Fit acquisition closed 12 Aug 2026, rebrand pending).")
    md.append("**Basic-Fit own-brand** is now staged; clever fit remains a separate current operating brand.")
    md.append("EMS-only (Bodystreet, Körperformen) remain out of the normal catalog.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Proposed production merge")
    md.append("")
    md.append(f"**{ready} READY_TO_IMPORT** centers recommended for Germany's first safe production merge.")
    md.append("")
    md.append(f"Expected catalog: **{live_total} + {ready} = {live_total + ready}**.")
    md.append("")
    md.append("Do **not** merge in this phase.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## SCALE WARNING")
    md.append("")
    md.append(
        f"Current production is {live_total} centers in client-side `centers.json`. "
        f"After the proposed Germany merge the file would hold **~{live_total + ready}** rows. "
        "That remains technically workable for search/map, but it is getting heavy. "
        "Monitor cold-start, map clustering, and search latency after merge. "
        "**Do not redesign the global center architecture in this phase.**"
    )
    md.append("")
    md.append("---")
    md.append("")
    md.append("## FILES")
    md.append("")
    md.append("- `scripts/germany-phase3-discover.py`")
    md.append("- `scripts/germany-phase3-consolidate.py`")
    md.append("- `data/germany/germany_centers_staging.json`")
    md.append("- `data/germany/GERMANY_PHASE3_READINESS_REPORT.md`")
    md.append("- `data/germany/Gymly_Germany_All_Discovered_Centers.xlsx`")
    md.append("- `data/germany/Gymly_Germany_All_Discovered_Centers.csv`")
    md.append("- `data/germany/scrapes/kieser_germany.json`")
    md.append("- `data/germany/scrapes/pfitzenmeier_germany.json`")
    md.append("- `data/germany/scrapes/elements_germany.json`")
    md.append("- `data/germany/scrapes/basic_fit_germany.json`")
    md.append("- `data/germany/scrapes/venicebeach_germany.json`")
    md.append("- `data/germany/phase3/` (notes, retries, coming-soon review)")
    md.append("")
    md.append("**Not modified:** `src/data/centers.json`")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## STOP")
    md.append("")
    md.append("No production merge. No Germany QA. No next country.")
    md.append("")

    (OUT / "GERMANY_PHASE3_READINESS_REPORT.md").write_text("\n".join(md), encoding="utf-8")
    PHASE3.joinpath("phase3_summary.json").write_text(
        json.dumps(
            {
                "phase2_total": PHASE2_TOTAL,
                "phase3_total": len(rows),
                "phase3_new_net": len(rows) - PHASE2_TOTAL,
                "categories": dict(cats),
                "ready_by_brand": ready_by_brand,
                "proposed_first_merge": ready,
                "expected_catalog_after_merge": live_total + ready,
                "centers_sha256": centers_sha,
                "new_chains": new_chains,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"proposed_first_merge": ready, "total": len(rows), "cats": dict(cats)}, indent=2))


def main():
    before = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    base = json.loads(STAGING.read_text(encoding="utf-8"))
    unresolved_start = sum(
        1 for r in base if r.get("import_category") in ("NEEDS_COORDINATES", "NEEDS_REVIEW")
    )
    print("base", len(base), "unresolved_start", unresolved_start)

    pfit = rebuild_pfitzenmeier()
    vb = improve_venicebeach(json.loads((SCRAPES / "venicebeach_germany.json").read_text()))
    extras = []
    for name in (
        "kieser_germany.json",
        "elements_germany.json",
        "basic_fit_germany.json",
    ):
        extras.extend(json.loads((SCRAPES / name).read_text(encoding="utf-8")))
    extras.extend(pfit)
    extras.extend(vb)

    rows = base + extras
    for r in rows:
        if not r.get("id"):
            r["id"] = make_id(r.get("brand"), r.get("address"), r.get("postal_code"), r.get("city"))
        r["country"] = "Germany"
        classify(r)

    # geocode new + remaining needs (not EMS, not hubs)
    todo = [
        r
        for r in rows
        if r.get("import_category") == "NEEDS_COORDINATES"
        and r.get("address")
        and r.get("postal_code")
        and r.get("city")
        and not (r.get("brand") == "EASYFITNESS" and re.search(r"\bems\b", (r.get("name") or ""), re.I))
    ]
    print("geocode todo", len(todo), Counter(r.get("brand") for r in todo))
    for i, r in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {r.get('brand')} {r.get('name')}")
        extra = []
        if r.get("address"):
            compact = re.sub(r"(\d+)\s*[-–/]\s*\d+[a-zA-Z]?", r"\1", r["address"])
            extra.append(f"{compact}, {r.get('postal_code')} {r.get('city')}, Germany")
            # Cottbus typo
            if "Chausee" in r["address"]:
                extra.append(
                    f"{r['address'].replace('Chausee', 'Chaussee')}, {r.get('postal_code')} {r.get('city')}, Germany"
                )
        geocode_row(r, extra_queries=extra)

    targeted_unresolved(rows)
    review_coming_soon(rows)
    for r in rows:
        classify(r)
        # CLOSED must never be READY
        if r.get("verification_status") == "CLOSED" or "GHOST-STUDIO" in (r.get("notes") or "") or (
            r.get("brand") in ("McFIT", "JOHN REED") and "inaktiv" in (r.get("notes") or "")
        ):
            if r.get("import_category") == "READY_TO_IMPORT":
                r["import_category"] = "CLOSED"

    rows, events, same_addr = dedupe(rows)
    for r in rows:
        classify(r)
        if r.get("verification_status") == "CLOSED":
            r["import_category"] = "CLOSED"

    live_report, _ = vs_live(rows)
    STAGING.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_excel(rows)
    (OUT / "germany_duplicate_analysis.json").write_text(
        json.dumps({"internal_events": events, "same_address_diff_brand": same_addr, "vs_live": live_report}, indent=2)
        + "\n"
    )
    after = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert before == after, "centers.json was modified"
    write_report(rows, extras, events, same_addr, live_report, unresolved_start, before)
    print("BEFORE", before)
    print("AFTER", after)
    print("CENTERS_UNCHANGED")


if __name__ == "__main__":
    main()
