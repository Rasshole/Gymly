#!/usr/bin/env python3
"""Croatia Phase 1 discovery — isolated. Does NOT modify centers.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.batch1_phase1_common import (  # noqa: E402
    ROOT,
    base_row,
    clean_text,
    curl_fetch,
    format_hr_postal,
    write_json,
)

OUT = ROOT / "data/croatia"
RAW = OUT / "raw"
PAGES = RAW / "pages"
PHASE1 = OUT / "phase1"
for d in (OUT, RAW, PAGES, PHASE1, OUT / "scrapes"):
    d.mkdir(parents=True, exist_ok=True)

CENTERS = ROOT / "src/data/centers.json"
PRE_SHA = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
EXPECTED_SHA = "de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d"
PRODUCTION_TOTAL = 11921

CITY_CANON = {
    "zagreb": "Zagreb",
    "split": "Split",
    "rijeka": "Rijeka",
    "osijek": "Osijek",
    "zadar": "Zadar",
    "pula": "Pula",
    "varazdin": "Varaždin",
    "varaždin": "Varaždin",
    "slavonski brod": "Slavonski Brod",
    "karlovac": "Karlovac",
    "sibenik": "Šibenik",
    "šibenik": "Šibenik",
    "dubrovnik": "Dubrovnik",
    "sisak": "Sisak",
    "vinkovci": "Vinkovci",
    "vukovar": "Vukovar",
    "cakovec": "Čakovec",
    "čakovec": "Čakovec",
    "koprivnica": "Koprivnica",
    "bjelovar": "Bjelovar",
    "velika gorica": "Velika Gorica",
    "zapresic": "Zaprešić",
    "zaprešić": "Zaprešić",
    "samobor": "Samobor",
    "dugo selo": "Dugo Selo",
    "solin": "Solin",
    "omis": "Omiš",
    "omiš": "Omiš",
    "lucko": "Lučko",
    "lučko": "Lučko",
}


def canon_city(raw: str) -> str:
    s = clean_text(raw)
    key = s.lower().replace("-", " ").strip()
    return CITY_CANON.get(key, s)


def cached(url: str, name: str, timeout: int = 45) -> str:
    path = PAGES / name
    if path.exists() and path.stat().st_size > 500:
        return path.read_text(encoding="utf-8", errors="replace")
    time.sleep(0.35)
    return curl_fetch(url, path, timeout=timeout)


def add(
    rows: list[dict],
    *,
    brand: str,
    name: str,
    address: str,
    city: str,
    postal: str,
    source_url: str,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    excluded: bool = False,
    lat=None,
    lng=None,
    coord_source: str | None = None,
    discovery_class: str = "national_chain",
    import_category: str | None = None,
) -> None:
    row = base_row(
        prefix="hr_",
        country="Croatia",
        brand=brand,
        name=name,
        address=address,
        postal_code=format_hr_postal(postal) or postal,
        city=canon_city(city),
        source_url=source_url,
        lat=lat,
        lng=lng,
        coord_source=coord_source,
        notes=notes,
        coming=coming,
        closed=closed,
        discovery_class=discovery_class,
    )
    if excluded or import_category == "EXCLUDED":
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
    elif coming or import_category == "COMING_SOON":
        row["import_category"] = "COMING_SOON"
        row["is_coming_soon"] = True
        row["is_active"] = False
    elif import_category:
        row["import_category"] = import_category
    rows.append(row)


def infer_city_from_blob(name: str, address: str, city_hint: str = "") -> str:
    blob = f"{city_hint} {name} {address}".lower()
    # Neighborhood → city shortcuts
    if any(x in blob for x in ["spinut", "lovret", "gripe", "trstenik", "visoka", "kampus"]):
        if "velika gorica" not in blob:
            return "Split"
    if any(x in blob for x in ["vrbani", "spansko", "špansko", "stenjevec", "maksimir", "dubec", "siget", "blato", "črnomerec", "crnomerec", "voltino", "remiza", "bundek", "jaruščica", "jaruscica", "knežija", "knezija", "prisavlje", "ravnice", "ozaljska", "sloboština", "slobostina"]):
        return "Zagreb"
    if "srdoči" in blob or "srdoc" in blob or "tower centar rijeka" in blob:
        return "Rijeka"
    if "đurek" in blob or "durek" in blob:
        return "Varaždin"
    if "grabrik" in blob:
        return "Karlovac"
    # Avoid false positives: Samoborska cesta is Zagreb street, not Samobor city
    blob_safe = blob.replace("samoborska", "")
    ordered = [
        "velika gorica",
        "slavonski brod",
        "dugo selo",
        "zaprešić",
        "zapresic",
        "samobor",
        "dubrovnik",
        "varaždin",
        "varazdin",
        "karlovac",
        "šibenik",
        "sibenik",
        "rijeka",
        "osijek",
        "zagreb",
        "split",
        "zadar",
        "pula",
        "solin",
        "omiš",
        "omis",
        "lučko",
        "lucko",
    ]
    for c in ordered:
        hay = blob_safe if c == "samobor" else blob
        if c in hay:
            return canon_city(c)
    return canon_city(city_hint) if city_hint else ""


# ---------------------------------------------------------------------------
# Gyms4you
# ---------------------------------------------------------------------------
def discover_gyms4you(rows: list[dict]) -> None:
    html = cached("https://gyms4you.com/en/locations/", "gyms4you_locations_en.html")
    source = "https://gyms4you.com/en/locations/"
    # Pair location title heading with following Address street line (Elementor)
    blocks = re.findall(
        r'<h[12][^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([^<]+)</h[12]>'
        r"[\s\S]{0,2500}?Address[\s\S]{0,400}?<[^>]+>([^<]{8,160})<",
        html,
        re.I,
    )
    # Coming-soon detection by name / address context in full page
    coming_names = {
        "split visoka",
        "split trstenik",
        "split 3",
        "jurišićeva",
        "jurisiceva",
    }
    # Disambiguate duplicate Varaždin / Osijek / Zadar titles using address
    rename_by_addr = {
        "ulica bana josipa jelačića": "Zadar – Voštarnica",
        "krešimira filića": "Varaždin Đurek",
        "vilka novaka": "Varaždin Istok",
        "trg slobode 6": "Osijek Trg slobode",
        "josipa huttlera": "Osijek Donji Grad",
        "ul. maksimilijana vrhovca": "Karlovac Grabrik",
        "ulica vladimira nazora": "Karlovac Vladimira Nazora",
        "address: sisačka": "Velika Gorica Centar",
        "sisačka ulica": "Velika Gorica Centar",
    }

    seen = set()
    for title, addr_raw in blocks:
        name = clean_text(title.replace("&#8211;", "–"))
        address = clean_text(addr_raw.replace("&#8211;", "–"))
        address = re.sub(r"^Address:\s*", "", address, flags=re.I).strip()
        if not name or not address or len(address) < 6:
            continue
        if "@" in address or address.lower() in {"address", "email"}:
            continue
        # Skip city-filter chip titles without street-like address
        if name in {
            "Locations",
            "All",
            "Coming soon",
            "Language:",
            "Reception working",
        }:
            continue

        al = address.lower()
        for needle, proper in rename_by_addr.items():
            if needle in al:
                name = proper
                break

        coming = name.lower() in coming_names or any(
            x in name.lower() for x in coming_names
        )
        # Also scan nearby HTML for opening markers (use address match window)
        idx = html.lower().find(address[:20].lower())
        if idx > 0:
            window = html[max(0, idx - 800) : idx + 200]
            if re.search(
                r"OPENING|OTVORENJE|proljeće 2026|OPENING SOON|OPENING 2025",
                window,
                re.I,
            ):
                coming = True

        postal = format_hr_postal(address)
        city = infer_city_from_blob(name, address)
        if not city:
            continue

        display = f"Gyms4you {name}" if not name.lower().startswith("gyms4you") else name
        key = (norm := (display.lower(), address.lower(), city.lower()))
        if key in seen:
            continue
        seen.add(key)

        notes = "official_gyms4you_locations"
        thin = (
            len(address) < 12
            or address.lower() in {"rijeka srdoči", "vilka novaka"}
            or re.fullmatch(r"ul\.\s*sedam kaštela", address, re.I)
            or re.fullmatch(r"horvaćanska cesta,?\s*zagreb.*", address, re.I)
            or not re.search(r"\d", address)
        )
        if thin and not coming:
            notes += "; thin_address"
            add(
                rows,
                brand="Gyms4you",
                name=display,
                address=address,
                city=city,
                postal=postal,
                source_url=source,
                notes=notes,
                coming=False,
                import_category="NEEDS_REVIEW",
            )
            continue

        add(
            rows,
            brand="Gyms4you",
            name=display,
            address=address,
            city=city,
            postal=postal,
            source_url=source,
            notes=notes,
            coming=coming,
        )

    # Explicit coming-soon / thin rows not captured with usable address
    add(
        rows,
        brand="Gyms4you",
        name="Gyms4you Heinzelova x Vukovarska",
        address="Heinzelova x Vukovarska (address pending on official locator)",
        city="Zagreb",
        postal="",
        source_url=source,
        notes="official_gyms4you_locations; thin_address_no_street",
        import_category="NEEDS_REVIEW",
    )


# ---------------------------------------------------------------------------
# THE Fitness (includes ex-OrlandoFit / Play)
# ---------------------------------------------------------------------------
THE_FITNESS_CLUBS = [
    # (name, address, city, postal, coming, notes)
    ("THE Fitness Dugo Selo", "Osječka ulica 1", "Dugo Selo", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Samobor STOP SHOP", "Ulica hrvatskih branitelja 4, STOP SHOP Samobor", "Samobor", "", True, "official_thefitness_coming_soon"),
    ("THE Fitness Samobor Centar", "Ulica Ljudevita Šmidhena 2/1", "Samobor", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Velika Gorica", "Kolodvorska ulica 96", "Velika Gorica", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Zavrtnica", "Zavrtnica 17", "Zagreb", "10000", False, "official_thefitness_data_keys"),
    ("THE Fitness Hala", "Slavonska avenija 3B", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Borongaj", "Ulica Marijana Čavića 2c", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Borovje", "Letovanićka ulica 25", "Zagreb", "10000", False, "official_thefitness_data_keys"),
    ("THE Fitness Branimir", "Ulica kneza Branimira 29, Mingle Mall", "Zagreb", "10000", False, "ex_orlandofit_branimir; official_thefitness"),
    ("THE Fitness Črnomerec", "Gradišćanska ulica 36", "Zagreb", "10000", False, "ex_play_fitness; official_thefitness"),
    ("THE Fitness Donje Svetice", "Donje Svetice 24", "Zagreb", "", True, "official_thefitness_coming_soon"),
    ("THE Fitness Dubrava", "Dankovečka ulica 6-8", "Zagreb", "10000", False, "official_thefitness_data_keys"),
    ("THE Fitness Dvorana Vrbani III", "Kuzminečka ulica 10A", "Zagreb", "10000", False, "official_thefitness_data_keys"),
    ("THE Fitness Green Gold", "Radnička cesta 52", "Zagreb", "10000", False, "ex_orlandofit_green_gold; official_thefitness"),
    ("THE Fitness HoB", "Josipa Marohnića 1", "Zagreb", "10000", False, "official_thefitness_data_keys"),
    ("THE Fitness Hotel Novi Zagreb", "Ulica Ive Robića 2", "Zagreb", "", False, "hotel_sited_public_club; official_thefitness"),
    ("THE Fitness Jelkovec", "144. Brigade Hrvatske vojske, Park & Shop Sesvete", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Kaptol", "Nova ves 17", "Zagreb", "10000", False, "ex_orlandofit_kaptol; official_thefitness"),
    ("THE Fitness Lučko", "Ventilatorska cesta 24", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Mamutica", "Božidara Magovca 15", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness Stenjevec", "Stenjevečka ulica 1", "Zagreb", "", False, "official_thefitness_data_keys"),
    ("THE Fitness ZCentar", "Ljubljanska avenija 2b", "Zagreb", "", False, "official_thefitness_home_list"),
    ("THE Fitness Zonar", "Trg Krešimira Ćosića 9", "Zagreb", "10000", False, "hotel_sited_public_club; official_thefitness"),
]


def discover_the_fitness(rows: list[dict]) -> None:
    cached("https://www.thefitness.hr/en/club/", "thefitness_clubs_en.html")
    source = "https://www.thefitness.hr/en/club/"
    for name, address, city, postal, coming, notes in THE_FITNESS_CLUBS:
        add(
            rows,
            brand="THE Fitness",
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=source,
            notes=notes,
            coming=coming,
            discovery_class="national_chain",
        )


# ---------------------------------------------------------------------------
# Gibi Gib
# ---------------------------------------------------------------------------
def discover_gibi_gib(rows: list[dict]) -> None:
    source = "https://gibigib.com/"
    clubs = [
        ("Gibi Gib Zagreb Voltino", "Lazinska ulica 40", "Zagreb", "10000", "https://gibigib.com/zagreb-voltino/"),
        ("Gibi Gib Zagreb Rudeš", "Zagrebačka cesta 143A", "Zagreb", "10000", "https://gibigib.com/zagreb-rudes/"),
        ("Gibi Gib Varaždin Istok", "Podravska ulica 14", "Varaždin", "42000", "https://gibigib.com/varazdin-istok/"),
        ("Gibi Gib Varaždin Centar", "Miroslava Krleže 1a", "Varaždin", "42000", "https://gibigib.com/varazdin-centar/"),
    ]
    for name, address, city, postal, url in clubs:
        cached(url, f"gibigib_{name.split()[-1].lower()}.html")
        add(
            rows,
            brand="Gibi Gib",
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=url,
            notes="official_gibigib_site",
            discovery_class="regional_chain",
        )


# ---------------------------------------------------------------------------
# Fitness Centar Joker
# ---------------------------------------------------------------------------
def discover_joker(rows: list[dict]) -> None:
    html = cached("https://fitnesscentarjoker.hr/lokacije", "joker_lokacije.html")
    source = "https://fitnesscentarjoker.hr/lokacije"
    clubs = [
        ("Fitness Centar Joker Split Brodarice", "Put Brodarice 6", "Split", "21000"),
        ("Fitness Centar Joker Split Mejaši", "Lovrinačka ulica 16", "Split", "21000"),
        ("Fitness Centar Joker Omiš", "Četvrt Ribnjak", "Omiš", "21310"),
        ("Fitness Centar Joker Solin", "Zoranićeva 16", "Solin", "21210"),
    ]
    for name, address, city, postal in clubs:
        add(
            rows,
            brand="Fitness Centar Joker",
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=source,
            notes="official_joker_lokacije",
            discovery_class="regional_chain",
        )


# ---------------------------------------------------------------------------
# Multihealth
# ---------------------------------------------------------------------------
def discover_multihealth(rows: list[dict]) -> None:
    clubs = [
        (
            "Multihealth Samobor",
            "Ulica Bleiburških žrtava 1945/1",
            "Samobor",
            "10430",
            "https://multihealth.hr/lokacije/samobor/",
        ),
        (
            "Multihealth Karlovac",
            "Trg Hrvatskih Redarstvenika 1",
            "Karlovac",
            "",
            "https://multihealth.hr/lokacije/karlovac/",
        ),
        (
            "Multihealth Zagreb Rudeš",
            "Zagrebačka avenija 94",
            "Zagreb",
            "10000",
            "https://multihealth.hr/lokacije/zagreb-rudes/",
        ),
    ]
    for name, address, city, postal, url in clubs:
        cached(url, f"multihealth_{city.lower().replace(' ', '_')}.html")
        add(
            rows,
            brand="Multihealth",
            name=name,
            address=address,
            city=city,
            postal=postal,
            source_url=url,
            notes="official_multihealth_lokacije",
            discovery_class="regional_chain",
        )


# ---------------------------------------------------------------------------
# Market audit exclusions / small operators (staged, not READY)
# ---------------------------------------------------------------------------
def discover_market_audit(rows: list[dict]) -> None:
    audits = [
        ("OrlandoFit", "OrlandoFit (legacy)", "E", "Rebranded into THE Fitness (Benefit Systems); do not stage successor+predecessor"),
        ("Play Fitness", "Play Fitness Zagreb (legacy)", "F", "Zagreb Gradišćanska now THE Fitness Črnomerec"),
        ("XXL Fitness", "XXL Fitness (market audit)", "E", "2 Zagreb Velesajam sites only — below 3+ threshold"),
        ("Sparta Gym", "Sparta Gym (market audit)", "E", "2 Zagreb sites (Medarska/Rotor) — below 3+ threshold"),
        ("Fitness centar Forma", "Fitness centar Forma (market audit)", "E", "≤2 Zagreb sites"),
        ("MoFit", "MoFit (market audit)", "E", "1 conventional gym + adidas studio — too small"),
        ("Jump Fitness", "Jump Fitness (market audit)", "E", "Single Zagreb site"),
        ("Core Gym", "Core Gym (market audit)", "C", "Functional/specialty single site"),
        ("Basic Gym One", "Basic Gym One (market audit)", "C", "Functional/S&C single site"),
        ("Invictus Fitness", "Invictus Fitness (market audit)", "E", "Single Zagreb site"),
        ("Blue Gym", "Blue Gym (market audit)", "E", "2 Rijeka sites only"),
        ("Olympic Fitness", "Olympic Fitness (market audit)", "E", "Single Rijeka site"),
        ("Fitness Studio Energy", "Fitness Studio Energy (market audit)", "F", "Legacy/closed directory listings"),
        ("Anytime Fitness", "Anytime Fitness (market audit)", "D", "No Croatia clubs found"),
        ("clever fit", "clever fit Zagreb Miramarska (market audit)", "E", "Single Zagreb studio"),
        ("FITINN", "FITINN (market audit)", "D", "No Croatia presence"),
        ("McFIT", "McFIT (market audit)", "D", "No Croatia presence"),
        ("JOHN REED", "JOHN REED (market audit)", "D", "No Croatia presence"),
        ("Gold's Gym", "Gold's Gym (market audit)", "D", "No Croatia international franchise"),
        ("World Class", "World Class Croatia (market audit)", "E", "Hotel Westin/Sheraton clubs — hotel fitness, not conventional chain"),
        ("Fitness First", "Fitness First (market audit)", "D", "No Croatia presence"),
        ("MultiSport", "MultiSport (market audit)", "B", "Aggregator/pass network — not a gym chain"),
        ("PassSport", "PassSport (market audit)", "B", "Aggregator/pass network — not a gym chain"),
    ]
    for brand, name, cls, note in audits:
        add(
            rows,
            brand=brand,
            name=name,
            address="(market audit — not imported)",
            city="Zagreb",
            postal="",
            source_url="https://gyms4you.com/en/locations/",
            notes=f"EXCLUDED_OPERATOR class_{cls}; {note}",
            excluded=True,
            discovery_class="market_audit",
            import_category="EXCLUDED",
        )


def discover_border_probes(rows: list[dict]) -> None:
    """Foreign false-positive probes — must never become Croatia READY."""
    probes = [
        ("Slovenia probe Ljubljana", "Ljubljana", "Slovenia", 46.0569, 14.5058, "SI"),
        ("Slovenia probe Koper", "Koper", "Slovenia", 45.5481, 13.7302, "SI"),
        ("Slovenia probe Maribor", "Maribor", "Slovenia", 46.5547, 15.6467, "SI"),
        ("Bosnia probe Mostar", "Mostar", "Bosnia and Herzegovina", 43.3438, 17.8078, "BA"),
        ("Bosnia probe Neum", "Neum", "Bosnia and Herzegovina", 42.9236, 17.6156, "BA"),
        ("Bosnia probe Banja Luka", "Banja Luka", "Bosnia and Herzegovina", 44.7722, 17.1910, "BA"),
        ("Bosnia probe Bosanski Brod", "Bosanski Brod", "Bosnia and Herzegovina", 45.1553, 17.9936, "BA"),
        ("Bosnia probe Trebinje", "Trebinje", "Bosnia and Herzegovina", 42.7120, 18.3444, "BA"),
        ("Serbia probe Novi Sad", "Novi Sad", "Serbia", 45.2671, 19.8335, "RS"),
        ("Serbia probe Sombor", "Sombor", "Serbia", 45.7742, 19.1122, "RS"),
        ("Montenegro probe Herceg Novi", "Herceg Novi", "Montenegro", 42.4531, 18.5375, "ME"),
        ("Montenegro probe Igalo", "Igalo", "Montenegro", 42.4572, 18.5044, "ME"),
        ("Hungary probe southern border", "Barcs", "Hungary", 45.9614, 17.4636, "HU"),
        ("Italy probe Trieste", "Trieste", "Italy", 45.6495, 13.7768, "IT"),
    ]
    for name, city, territory, lat, lng, code in probes:
        row = base_row(
            prefix="hr_",
            country="Croatia",
            brand="Border probe",
            name=name,
            address=f"(foreign probe — {city}, {territory})",
            postal_code="00000",
            city=city,
            source_url="https://gyms4you.com/en/locations/",
            lat=lat,
            lng=lng,
            coord_source="FOREIGN_PROBE",
            notes=f"foreign_probe_{code}; must not import as Croatia",
            discovery_class="border_probe",
        )
        row["import_category"] = "EXCLUDED"
        row["is_active"] = False
        row["verification_status"] = "EXCLUDED"
        row["foreign_probe"] = True
        row["territory"] = territory
        rows.append(row)


def main() -> None:
    assert PRE_SHA == EXPECTED_SHA, f"Unexpected production SHA {PRE_SHA}"
    rows: list[dict] = []
    discover_gyms4you(rows)
    discover_the_fitness(rows)
    discover_gibi_gib(rows)
    discover_joker(rows)
    discover_multihealth(rows)
    discover_market_audit(rows)
    discover_border_probes(rows)

    # Deduplicate by id
    by_id = {}
    for r in rows:
        by_id[r["id"]] = r
    rows = list(by_id.values())

    write_json(OUT / "croatia_phase1_candidates.json", rows)
    write_json(
        PHASE1 / "discovery_summary.json",
        {
            "pre_sha": PRE_SHA,
            "candidate_count": len(rows),
            "by_brand": {
                b: sum(1 for r in rows if r["brand"] == b)
                for b in sorted({r["brand"] for r in rows})
            },
        },
    )
    post = hashlib.sha256(CENTERS.read_bytes()).hexdigest()
    assert post == PRE_SHA, "centers.json mutated during discovery"
    print(f"Croatia Phase 1 discovery: {len(rows)} candidates; SHA unchanged {post[:12]}…")


if __name__ == "__main__":
    main()
