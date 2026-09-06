#!/usr/bin/env python3
"""Fill MOVA cities, recover 3T, scrape SKY + Impulse."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "GymlyNorwayResearch/1.0 (phase2)"
RAW = Path("data/norway/phase2_raw")
NORWAY = Path("data/norway")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "ignore")


def strip(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<[^>]+>", "\n", html)
    return re.sub(r"\n+", "\n", t)


def main():
    # --- 3T ---
    t3 = []
    list_html = (RAW / "3t_list.html").read_text(errors="ignore") if (RAW / "3t_list.html").exists() else ""
    paths = sorted(set(re.findall(r'href="(/treningssenter/3t-[^"]+)"', list_html)))
    if not paths:
        paths = [f"/treningssenter/{p.stem}" for p in RAW.glob("3t-*.html")]
    overrides = {
        "3t-byasen": ("Selsbakkveien 34", "7027", "Trondheim"),
        "3t-fossegrenda": ("Hornebergvegen 7B", "7038", "Trondheim"),
        "3t-ilsvika": ("Ilsvikvegen 18", "7018", "Trondheim"),
        "3t-lade": ("Haakon VIIs gate 11", "7041", "Trondheim"),
        "3t-leangen": ("Leangenveien 10", "7044", "Trondheim"),
        "3t-levanger": ("Høgskolevegen 5", "7600", "Levanger"),
        "3t-midtbyen": ("Dronningens gate 1a", "7011", "Trondheim"),
        "3t-moholt": ("Vegamot 16", "7048", "Trondheim"),
        "3t-orkanger": ("Grønørveien 20", "7300", "Orkanger"),
        "3t-ranheim": ("Ranheimsvegen 174", "7055", "Ranheim"),
        "3t-sluppen": ("Sluppenveien 12 H", "7037", "Trondheim"),
        "3t-solsiden": ("Dyre Halses gate 1", "7042", "Trondheim"),
        "3t-steinkjer": ("Kongens Gate 43B", "7713", "Steinkjer"),
        "3t-stjordal": ("Ole Rises gate 2", "7500", "Stjørdal"),
        "3t-teknostallen": ("Professor Brochs gate 16", "7030", "Trondheim"),
    }
    for path in paths:
        slug = path.rsplit("/", 1)[-1]
        f = RAW / f"{slug}.html"
        if not f.exists():
            try:
                f.write_text(fetch("https://www.3t.no" + path), encoding="utf-8")
                time.sleep(0.8)
            except Exception as e:
                print("3t fetch fail", slug, e)
        html = f.read_text(errors="ignore") if f.exists() else ""
        text = strip(html)
        parsed = None
        for m in re.finditer(
            r"(?m)^(.{4,70})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$", text
        ):
            addr = m.group(1).strip()
            if not re.search(r"\d", addr):
                continue
            if any(x in addr.lower() for x in ["kvm", "boltre", "norges", "gratis", "parkering"]):
                continue
            if len(addr) > 60:
                continue
            parsed = {
                "address": addr,
                "postal_code": m.group(2),
                "city": m.group(3).strip(),
            }
            break
        if not parsed and slug in overrides:
            a, p, c = overrides[slug]
            parsed = {"address": a, "postal_code": p, "city": c}
        # Melhus / Rosten inspect if still missing
        if not parsed and slug in ("3t-melhus", "3t-rosten"):
            print("--- inspect", slug)
            for ln in text.split("\n"):
                ln = ln.strip()
                if (
                    re.search(r"\d{4}", ln)
                    and re.search(r"[A-Za-zæøå]", ln)
                    and len(ln) < 90
                    and "kvm" not in ln.lower()
                    and not ln.startswith("20")
                ):
                    print(repr(ln))
        name = "3T-Treningssenter " + slug.replace("3t-", "").replace("-", " ").title()
        t3.append(
            {
                "brand": "3T-Treningssenter",
                "center_name": slug,
                "name": name,
                "source_url": "https://www.3t.no" + path,
                "parsed": parsed,
            }
        )
        print(slug, parsed)
    (NORWAY / "phase2_3t_scrape.json").write_text(
        json.dumps(t3, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # --- MOVA cities + names ---
    mova = json.loads((NORWAY / "phase2_mova_scrape.json").read_text(encoding="utf-8"))
    for s in mova:
        path = s.get("path") or ""
        parts = [p for p in path.strip("/").split("/") if p != "treningssenter"]
        if parts:
            nice = " ".join(p.replace("-", " ").title() for p in parts)
            s["name"] = f"MOVA {nice}"
            s["center_name"] = nice
    need = sorted(
        {
            (s.get("parsed") or {}).get("postal_code")
            for s in mova
            if s.get("parsed") and not (s["parsed"].get("city") or "").strip()
        }
    )
    postal_city = {}
    print("postals needing city", len(need))
    for i, pc in enumerate(need, 1):
        if not pc:
            continue
        url = (
            "https://nominatim.openstreetmap.org/search?"
            + urllib.parse.urlencode(
                {
                    "postalcode": pc,
                    "country": "Norway",
                    "format": "json",
                    "addressdetails": 1,
                    "limit": 1,
                }
            )
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
            city = ""
            if data:
                addr = data[0].get("address") or {}
                city = (
                    addr.get("city")
                    or addr.get("town")
                    or addr.get("village")
                    or addr.get("municipality")
                    or ""
                )
            postal_city[pc] = city
            print(f"[{i}/{len(need)}] {pc} -> {city}")
        except Exception as e:
            print("postal fail", pc, e)
            postal_city[pc] = ""
        time.sleep(1.1)
    for s in mova:
        p = s.get("parsed")
        if p and not (p.get("city") or "").strip():
            p["city"] = postal_city.get(p.get("postal_code") or "", "")
    (NORWAY / "phase2_mova_scrape.json").write_text(
        json.dumps(mova, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "mova with city",
        sum(1 for s in mova if s.get("parsed") and s["parsed"].get("city")),
    )

    # --- SKY ---
    sky_links = set()
    for f in list(RAW.glob("sky_*.html")) + [RAW / "sky_list.html"]:
        if not f.exists():
            continue
        sky_links |= set(re.findall(r"https://skyfitness\.no/sentere/[^\"#]+", f.read_text(errors="ignore")))
    sky_links = {u.rstrip("/") + "/" for u in sky_links}
    print("sky links", len(sky_links))
    sky = []
    for i, url in enumerate(sorted(sky_links), 1):
        try:
            html = fetch(url)
        except Exception as e:
            print("sky fail", url, e)
            continue
        text = strip(html)
        parsed = None
        m = re.search(
            r"(?is)(?:Adresse|Bes[øo]ksadresse|Besøk oss)\n([^\n]{4,100})",
            text,
        )
        if m:
            line = m.group(1).strip()
            m2 = re.match(r"(.+?),\s*(\d{4})\s+(.+)$", line)
            if m2:
                parsed = {
                    "address": m2.group(1).strip(),
                    "postal_code": m2.group(2),
                    "city": m2.group(3).strip(),
                }
            else:
                m3 = re.search(
                    r"(?is)(?:Adresse|Bes[øo]ksadresse|Besøk oss)\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
                    text,
                )
                if m3:
                    parsed = {
                        "address": m3.group(1).strip(),
                        "postal_code": m3.group(2),
                        "city": m3.group(3).strip(),
                    }
        if not parsed:
            for m4 in re.finditer(
                r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
                text,
            ):
                if re.search(r"\d", m4.group(1)):
                    parsed = {
                        "address": m4.group(1).strip(),
                        "postal_code": m4.group(2),
                        "city": m4.group(3).strip(),
                    }
                    break
        slug = url.rstrip("/").split("/")[-1]
        print(f"[{i}/{len(sky_links)}] {slug} => {parsed}")
        sky.append(
            {
                "brand": "SKY Fitness",
                "center_name": slug,
                "name": "SKY Fitness " + slug.replace("-", " ").title(),
                "source_url": url,
                "parsed": parsed,
            }
        )
        time.sleep(0.85)
    (NORWAY / "phase2_sky_scrape.json").write_text(
        json.dumps(sky, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # --- Impulse ---
    home = fetch("https://impulse.no/")
    impulse_urls = set(re.findall(r"https://impulse\.no/senter/[^\"#]+", home))
    impulse_urls |= {
        "https://impulse.no/senter/lade/",
        "https://impulse.no/senter/pirbadet/",
    }
    impulse_urls = sorted({u if u.endswith("/") else u + "/" for u in impulse_urls})
    print("impulse urls", impulse_urls)
    impulse = []
    for url in impulse_urls:
        html = fetch(url)
        text = strip(html)
        parsed = None
        m = re.search(
            r"(?is)(?:Adresse|Bes[øo]k)[^\n]*\n([^\n]{4,80})\n(\d{4})\s+([^\n]{2,40})",
            text,
        )
        if m:
            parsed = {
                "address": m.group(1).strip(),
                "postal_code": m.group(2),
                "city": m.group(3).strip(),
            }
        if not parsed:
            for m4 in re.finditer(
                r"(?m)^([A-ZÆØÅa-zæøå0-9 ./\-]{5,60})\n(\d{4})\s+([A-ZÆØÅa-zæøå\- ]{2,40})$",
                text,
            ):
                if re.search(r"\d", m4.group(1)):
                    parsed = {
                        "address": m4.group(1).strip(),
                        "postal_code": m4.group(2),
                        "city": m4.group(3).strip(),
                    }
                    break
        slug = url.rstrip("/").split("/")[-1]
        print("impulse", slug, parsed)
        impulse.append(
            {
                "brand": "Impulse Treningssenter",
                "center_name": slug,
                "name": f"Impulse Treningssenter {slug.title()}",
                "source_url": url,
                "parsed": parsed,
            }
        )
        time.sleep(0.85)
    (NORWAY / "phase2_impulse_scrape.json").write_text(
        json.dumps(impulse, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "done 3t",
        sum(1 for x in t3 if x.get("parsed")),
        "sky",
        sum(1 for x in sky if x.get("parsed")),
        "impulse",
        sum(1 for x in impulse if x.get("parsed")),
    )


if __name__ == "__main__":
    main()
