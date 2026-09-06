#!/usr/bin/env python3
"""Shared utilities for Batch 1 Phase 1 (IE/CZ/HU/GR). Does not touch centers.json."""
from __future__ import annotations

import hashlib
import html as htmlmod
import json
import math
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
CENTERS = ROOT / "src/data/centers.json"
PRODUCTION_TOTAL = len(json.loads(CENTERS.read_text())) if CENTERS.exists() else 11217
MOJIBAKE_RE = re.compile(r"Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº")
FALLBACK_RE = re.compile(
    r"fallback|centroid|city.?center|postcode.?centroid|capital.?fallback", re.I
)

ctx = ssl.create_default_context()
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; GymlyBatch1Phase1/1.0; catalog research)",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en,cs;q=0.9,hu;q=0.8,el;q=0.8,ga;q=0.7",
    "Accept-Encoding": "identity",
}

# Country configs
EIRCODE_RE = re.compile(
    r"^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}$", re.I
)
CZECHIA_POSTAL_RE = re.compile(r"^[1-7]\d{2} \d{2}$")
HUNGARY_POSTAL_RE = re.compile(r"^\d{4}$")
ROMANIA_POSTAL_RE = re.compile(r"^\d{6}$")
GREECE_POSTAL_RE = re.compile(r"^\d{3} \d{2}$")
# Slovakia PSČ first digit 0/8/9 — disjoint from Czechia 1–7; reject 000 xx
SLOVAKIA_POSTAL_RE = re.compile(r"^(?:[89]\d{2}|0[1-9]\d) \d{2}$")
BULGARIA_POSTAL_RE = re.compile(r"^\d{4}$")
CROATIA_POSTAL_RE = re.compile(r"^\d{5}$")
SLOVENIA_POSTAL_RE = re.compile(r"^\d{4}$")
LITHUANIA_POSTAL_RE = re.compile(r"^\d{5}$")
UKRAINE_POSTAL_RE = re.compile(r"^\d{5}$")
BELARUS_POSTAL_RE = re.compile(r"^\d{6}$")
TURKEY_POSTAL_RE = re.compile(r"^\d{5}$")
GE_POSTAL_RE = re.compile(r"^\d{4}$")
AM_POSTAL_RE = re.compile(r"^\d{4}$")
AZ_POSTAL_RE = re.compile(r"^\d{4}$")
RU_POSTAL_RE = re.compile(r"^\d{6}$")
LATVIA_POSTAL_RE = re.compile(r"^\d{4}$")


def format_si_postal(text: str) -> str:
    """Slovenian postcode NNNN as string."""
    m = re.search(r"\b(\d{4})\b", str(text or ""))
    return m.group(1) if m else ""


def in_slovenia(lat: float, lng: float) -> bool:
    """Slovenia mainland bbox — rejects IT / AT / HU / HR cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 45.42 or lat > 46.88 or lng < 13.38 or lng > 16.61:
        return False
    # West: Italian Trieste urban core only (keep all SI mainland + Koper coast)
    if 45.62 <= lat <= 45.72 and 13.76 <= lng <= 13.85:
        return False
    # NW: Austria (Villach / Klagenfurt corridor)
    if lat >= 46.55 and lng <= 14.35:
        return False
    # North: Austria (Graz direction north of Maribor)
    if lat >= 46.72 and lng >= 15.55:
        return False
    # East: Hungary (Lendava / Murska Sobota east)
    if lng >= 16.62 and lat >= 46.45:
        return False
    # SE: Croatia (Zagreb corridor east of SI)
    if lat <= 45.95 and lng >= 15.85:
        return False
    # SE inland: Croatia (Istrian hinterland south)
    if lat <= 45.50 and lng >= 14.8:
        return False
    return True


def format_lt_postal(text: str) -> str:
    """Lithuanian postcode NNNNN as string (strip optional LT- prefix)."""
    s = str(text or "").strip().upper().replace("LT-", "").replace("LT", "").strip()
    m = re.search(r"\b(\d{5})\b", s)
    return m.group(1) if m else ""


def format_ua_postal(text: str) -> str:
    """Ukrainian postcode NNNNN as string (strip optional UA- prefix)."""
    s = str(text or "").strip().upper().replace("UA-", "").replace("UA", "").strip()
    m = re.search(r"\b(\d{5})\b", s)
    return m.group(1) if m else ""


def format_by_postal(text: str) -> str:
    """Belarus postcode NNNNNN as string (strip optional BY- prefix)."""
    s = str(text or "").strip().upper().replace("BY-", "").replace("BY", "").strip()
    m = re.search(r"\b(\d{6})\b", s)
    return m.group(1) if m else ""


def format_tr_postal(text: str) -> str:
    """Turkey postcode NNNNN (5 digits) as string."""
    m = re.search(r"\b(\d{5})\b", str(text or ""))
    return m.group(1) if m else ""


def format_ge_postal(text: str) -> str:
    """Georgian postcode NNNN (4 digits) as string."""
    m = re.search(r"\b(\d{4})\b", str(text or ""))
    return m.group(1) if m else ""


def format_am_postal(text: str) -> str:
    """Armenian postcode NNNN (4 digits) as string."""
    m = re.search(r"\b(\d{4})\b", str(text or ""))
    return m.group(1) if m else ""


def format_az_postal(text: str) -> str:
    """Azerbaijani postcode NNNN (4 digits) as string (strip optional AZ prefix)."""
    s = str(text or "").strip().upper().replace("AZ-", "").replace("AZ", "").strip()
    m = re.search(r"\b(\d{4})\b", s)
    return m.group(1) if m else ""


def format_ru_postal(text: str) -> str:
    """Russian postcode NNNNNN (6 digits) as string (strip optional RU- prefix)."""
    s = str(text or "").strip().upper().replace("RU-", "").replace("RU", "").strip()
    m = re.search(r"\b(\d{6})\b", s)
    return m.group(1) if m else ""


def normalize_russian_search(text: str) -> str:
    """Search/dedup normalization — Cyrillic/Latin transliteration; does not alter stored names."""
    s = (text or "").strip().casefold()
    ru_map = str.maketrans(
        {
            "а": "a",
            "б": "b",
            "в": "v",
            "г": "g",
            "д": "d",
            "е": "e",
            "ё": "e",
            "ж": "zh",
            "з": "z",
            "и": "i",
            "й": "y",
            "к": "k",
            "л": "l",
            "м": "m",
            "н": "n",
            "о": "o",
            "п": "p",
            "р": "r",
            "с": "s",
            "т": "t",
            "у": "u",
            "ф": "f",
            "х": "kh",
            "ц": "ts",
            "ч": "ch",
            "ш": "sh",
            "щ": "shch",
            "ъ": "",
            "ы": "y",
            "ь": "",
            "э": "e",
            "ю": "yu",
            "я": "ya",
            "і": "i",
            "ї": "i",
            "є": "e",
            "ґ": "g",
        }
    )
    s = s.translate(ru_map)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def in_disputed_ukraine_territory(lat: float, lng: float) -> bool:
    """Crimea + Donetsk/Luhansk occupied areas — geographic hold; not Russia catalog territory."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if 44.0 <= lat <= 46.35 and 32.2 <= lng <= 36.8:
        return True
    if 47.0 <= lat <= 49.85 and 36.5 <= lng <= 40.25:
        return True
    return False


def in_russia(lat: float, lng: float) -> bool:
    """Russia footprint incl. Kaliningrad + Far East — rejects FI/EE/LV/LT/BY/UA/GE/AZ/KZ/CN/MN/KP/NO/PL cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if in_disputed_ukraine_territory(lat, lng):
        return False
    # Kaliningrad Oblast
    if 54.30 <= lat <= 54.95 and 19.55 <= lng <= 22.75:
        if lng <= 19.65 and lat <= 54.45:
            return False
        if lng >= 22.55 and lat >= 54.75:
            return False
        return True
    if lat < 41.18 or lat > 77.5 or lng < 27.0 or lng > 169.5:
        return False
    # West: Finland / Norway / Baltic
    if lat >= 69.5 and lng <= 30.5:
        return False
    if lat >= 60.0 and lng <= 28.5:
        return False
    if lat >= 57.8 and lng <= 28.0:
        return False
    if lat >= 56.0 and lng <= 27.8:
        return False
    if lat >= 54.4 and lng <= 26.5:
        return False
    # Belarus
    if 51.25 <= lat <= 56.17 and lng <= 32.8:
        return False
    # Ukraine mainland (non-disputed)
    if 44.18 <= lat <= 52.38 and lng <= 40.23:
        return False
    # Georgia
    if lat <= 43.5 and lng <= 46.8:
        return False
    if lat <= 42.5 and lng <= 47.5:
        return False
    # Azerbaijan / Dagestan border
    if lat <= 42.0 and lng >= 46.0 and lng <= 50.65:
        return False
    # Kazakhstan
    if lat <= 51.0 and lng >= 48.0 and lng <= 87.0:
        return False
    if lat <= 55.0 and lng >= 60.0 and lng <= 75.0:
        return False
    # China / Mongolia
    if lat <= 50.5 and lng >= 87.0:
        return False
    if 50.0 <= lat <= 52.0 and lng >= 85.0:
        return False
    # North Korea / Japan approaches
    if lat <= 43.5 and lng >= 130.5:
        return False
    return True


def normalize_azerbaijani_search(text: str) -> str:
    """Search/dedup normalization — Latin transliteration for Azerbaijani script; does not alter stored names."""
    s = (text or "").strip().casefold()
    az_map = str.maketrans(
        {
            "ə": "e",
            "ı": "i",
            "ö": "o",
            "ü": "u",
            "ş": "s",
            "ç": "c",
            "ğ": "g",
            "а": "a",
            "б": "b",
            "в": "v",
            "г": "g",
            "д": "d",
            "е": "e",
            "ж": "zh",
            "з": "z",
            "и": "i",
            "к": "k",
            "л": "l",
            "м": "m",
            "н": "n",
            "о": "o",
            "п": "p",
            "р": "r",
            "с": "s",
            "т": "t",
            "у": "u",
            "ф": "f",
            "х": "kh",
            "ц": "ts",
            "ч": "ch",
            "ш": "sh",
            "щ": "shch",
            "ы": "y",
            "ь": "",
            "э": "e",
            "ю": "yu",
            "я": "ya",
        }
    )
    s = s.translate(az_map)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_armenian_search(text: str) -> str:
    """Search/dedup normalization — Latin transliteration for Armenian script; does not alter stored names."""
    s = (text or "").strip().casefold()
    s = s.replace("ու", "u")
    hy_map = str.maketrans(
        {
            "ա": "a",
            "բ": "b",
            "գ": "g",
            "դ": "d",
            "ե": "e",
            "զ": "z",
            "ը": "y",
            "թ": "t",
            "ժ": "zh",
            "ի": "i",
            "լ": "l",
            "խ": "kh",
            "ծ": "ts",
            "կ": "k",
            "հ": "h",
            "ձ": "dz",
            "ղ": "gh",
            "ճ": "ch",
            "մ": "m",
            "յ": "y",
            "ն": "n",
            "շ": "sh",
            "ո": "o",
            "չ": "ch",
            "պ": "p",
            "ջ": "j",
            "ռ": "r",
            "ս": "s",
            "վ": "v",
            "տ": "t",
            "ր": "r",
            "ց": "ts",
            "օ": "o",
            "ֆ": "f",
        }
    )
    s = s.translate(hy_map)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_georgian_search(text: str) -> str:
    """Search/dedup normalization — Latin transliteration for Georgian script; does not alter stored names."""
    s = (text or "").strip().casefold()
    ge_map = str.maketrans(
        {
            "ა": "a",
            "ბ": "b",
            "გ": "g",
            "დ": "d",
            "ე": "e",
            "ვ": "v",
            "ზ": "z",
            "თ": "t",
            "ი": "i",
            "კ": "k",
            "ლ": "l",
            "მ": "m",
            "ნ": "n",
            "ო": "o",
            "პ": "p",
            "ჟ": "zh",
            "რ": "r",
            "ს": "s",
            "ტ": "t",
            "უ": "u",
            "ფ": "p",
            "ქ": "k",
            "ღ": "gh",
            "ყ": "q",
            "შ": "sh",
            "ჩ": "ch",
            "ც": "ts",
            "ძ": "dz",
            "წ": "ts",
            "ჭ": "ch",
            "ხ": "kh",
            "ჯ": "j",
            "ჰ": "h",
        }
    )
    s = s.translate(ge_map)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def in_georgia(lat: float, lng: float) -> bool:
    """Georgia mainland footprint — rejects RU/TR/AM/AZ cores; Abkhazia/S.Ossetia geographically inside bbox."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 41.05 or lat > 43.65 or lng < 39.95 or lng > 46.75:
        return False
    # Southwest: Turkey (Artvin / Ardahan corridor)
    if lat <= 41.18 and lng <= 42.85:
        return False
    if lat <= 41.28 and lng <= 41.55:
        return False
    # South: Armenia (Gyumri / Akhalkalaki approach)
    if lat <= 41.18 and lng >= 43.85:
        return False
    if lat <= 41.35 and lng >= 45.05:
        return False
    # East: Azerbaijan (Ganja / Qazakh west)
    if lng >= 46.45 and lat >= 41.45:
        return False
    if lng >= 46.15 and lat <= 41.25:
        return False
    # North: Russia (Sochi / Krasnodar / North Caucasus)
    if lat >= 43.45 and lng <= 40.25:
        return False
    if lat >= 43.25 and lng <= 40.55:
        return False
    if lat >= 42.95 and lng <= 40.05:
        return False
    return True


def in_armenia(lat: float, lng: float) -> bool:
    """Armenia mainland footprint — rejects GE/TR/AZ/IR cores; Artsakh/NKAO inside eastern bbox."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 38.84 or lat > 41.32 or lng < 43.42 or lng > 46.58:
        return False
    # North/NW: Georgia (Tbilisi / Akhalkalaki / Marneuli corridor)
    if lat >= 41.15 and lng <= 44.35:
        return False
    if lat >= 41.05 and lng <= 43.75:
        return False
    # West: Turkey (Kars / Igdir / Ardahan approach)
    if lng <= 43.52 and lat <= 40.85:
        return False
    if lng <= 43.68 and lat <= 40.35:
        return False
    # East: Azerbaijan (Nakhchivan exclave west + northeast border)
    if lng >= 46.35 and lat >= 39.45:
        return False
    if lng >= 46.55:
        return False
    # South: Iran (Tabriz / Julfa corridor)
    if lat <= 38.92 and lng >= 44.85:
        return False
    if lat <= 39.05 and lng >= 45.5:
        return False
    return True


def in_azerbaijan(lat: float, lng: float) -> bool:
    """Azerbaijan footprint — mainland + Nakhchivan exclave; rejects GE/AM/IR/TR/RU cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    # Nakhchivan Autonomous Republic exclave
    if 38.78 <= lat <= 39.62 and 44.72 <= lng <= 46.25:
        if lng <= 44.78 and lat <= 39.35:
            return False
        if lng >= 46.05 and lat >= 39.15:
            return False
        if lat <= 38.85 and lng >= 45.0:
            return False
        return True
    if lat < 38.39 or lat > 41.92 or lng < 44.77 or lng > 50.65:
        return False
    # West/NW: Georgia (Lagodekhi / Zaqatala corridor)
    if lng <= 45.0 and lat >= 41.5:
        return False
    if lng <= 44.85 and lat >= 41.0:
        return False
    if lng <= 45.5 and lat >= 41.75:
        return False
    # West: Armenia (Tovuz / Gazakh / western border)
    if lng <= 45.05 and 40.5 <= lat <= 41.2:
        return False
    if lng <= 45.8 and lat <= 39.5:
        return False
    # Southwest: Armenia (Zangilan / Jabrayil approach)
    if lat <= 39.0 and lng <= 46.8:
        return False
    if lat <= 39.35 and lng <= 47.5:
        return False
    # South: Iran (Astara / Masalli corridor)
    if lat <= 38.45 and lng >= 48.5:
        return False
    if lat <= 38.55 and lng >= 47.0:
        return False
    # North: Russia (Dagestan)
    if lat >= 41.85 and lng <= 48.5:
        return False
    if lat >= 41.75 and lng <= 47.5:
        return False
    return True


def normalize_turkish_search(text: str) -> str:
    """Search/dedup normalization — does not alter stored canonical names."""
    s = (text or "").strip().casefold()
    tr_map = str.maketrans(
        {
            "ı": "i",
            "İ": "i",
            "ş": "s",
            "Ş": "s",
            "ğ": "g",
            "Ğ": "g",
            "ç": "c",
            "Ç": "c",
            "ö": "o",
            "Ö": "o",
            "ü": "u",
            "Ü": "u",
        }
    )
    s = s.translate(tr_map)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def in_turkey(lat: float, lng: float) -> bool:
    """Turkey mainland footprint — rejects GR/BG/GE/AM/AZ/IR/IQ/SY cores and Northern Cyprus."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 35.95 or lat > 42.12 or lng < 25.98 or lng > 44.82:
        return False
    if lat <= 35.75 and lng >= 32.2 and lng <= 34.7:
        return False
    # Northern Cyprus: Kyrenia / Morphou / north Nicosia (lat band only)
    if lat >= 35.19 and lat <= 35.75 and lng <= 33.55:
        return False
    if lat >= 35.08 and lng >= 33.85 and lng <= 34.15:
        return False
    if lng <= 26.02:
        return False
    if lat <= 40.25 and lng <= 26.35:
        return False
    if lat >= 42.02 and lng <= 27.45:
        return False
    if lat >= 41.95 and lng <= 26.9:
        return False
    if lng >= 41.85 and lat >= 41.35:
        return False
    if lng >= 42.15 and lat >= 40.75:
        return False
    if lng >= 43.85 and 40.1 <= lat <= 41.05:
        return False
    if lng >= 44.15 and 39.55 <= lat <= 40.45:
        return False
    if lng >= 44.85 and lat <= 39.55:
        return False
    if lng >= 44.95 and lat >= 41.0:
        return False
    if lng >= 44.55 and lat <= 38.15:
        return False
    if lng >= 44.35 and lat <= 37.25:
        return False
    if lng >= 42.5 and lat <= 37.05:
        return False
    if lng >= 42.35 and lat <= 36.85:
        return False
    return True


def in_belarus(lat: float, lng: float) -> bool:
    """Belarus footprint — rejects PL / LT / LV / UA / RU border cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 51.25 or lat > 56.17 or lng < 23.15 or lng > 32.82:
        return False
    # West: Poland (Białystok / Terespol corridor)
    if lng <= 23.45 and lat >= 52.0:
        return False
    if lng <= 23.35 and lat >= 51.4:
        return False
    # North: Latvia / Lithuania (Daugavpils / Vilnius approach)
    if lat >= 55.45 and lng <= 26.8:
        return False
    if lat >= 55.9 and lng <= 27.5:
        return False
    # South: Ukraine (Chernivtsi / northern UA approach) — keep Brest/Gomel
    if lat <= 51.35 and lng >= 30.8:
        return False
    if lat <= 51.5 and lng >= 31.5:
        return False
    # East: Russia (Smolensk / Bryansk)
    if lng >= 32.55 and lat >= 53.8:
        return False
    if lng >= 32.7 and lat >= 52.5:
        return False
    return True


def in_ukraine(lat: float, lng: float) -> bool:
    """Ukraine mainland footprint — rejects PL / BY / RO / MD / HU / SK / RU cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 44.18 or lat > 52.38 or lng < 22.1 or lng > 40.23:
        return False
    # West: Poland (Przemyśl / Lublin corridor)
    if lng <= 23.5 and lat >= 49.5:
        return False
    if lng <= 23.0 and 49.0 <= lat <= 50.5:
        return False
    # NW: Poland (Bieszczady south)
    if lng <= 22.6 and lat <= 49.0:
        return False
    # SW: Moldova / Romania (Izmail / Galați)
    if lat <= 45.55 and lng >= 28.05:
        return False
    if lat <= 46.0 and lng >= 29.5:
        return False
    # South: Black Sea — keep Odesa coast; reject Romania Constanta east
    if lat <= 45.3 and lng >= 29.0:
        return False
    # East: Russia (Rostov / Belgorod) — conservative inward bias
    if lng >= 40.0 and lat <= 49.0:
        return False
    if lng >= 39.8 and lat >= 50.0:
        return False
    # North: Belarus (Gomel / Brest)
    if lat >= 51.5 and lng <= 30.5:
        return False
    if lat >= 52.0:
        return False
    # Slovakia / Hungary west Zakarpattia edge
    if lng <= 22.15 and 48.0 <= lat <= 48.7:
        return False
    return True


def in_lithuania(lat: float, lng: float) -> bool:
    """Lithuania mainland + Curonian Spit — rejects LV / BY / PL / Kaliningrad cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 53.88 or lat > 56.45 or lng < 20.9 or lng > 26.88:
        return False
    # North: Latvia (Riga / Jelgava corridor)
    if lat >= 56.35 and 23.5 <= lng <= 25.5:
        return False
    # NE: Latvia (Daugavpils corridor)
    if lat >= 55.95 and lng >= 26.2:
        return False
    # West: Kaliningrad urban / inland west of Curonian Spit
    if lng <= 21.0 and 54.55 <= lat <= 55.05:
        return False
    # South: Belarus (Grodno corridor)
    if lat <= 54.0 and 23.5 <= lng <= 25.0:
        return False
    # SW: Poland (Suwałki corridor)
    if lat <= 54.15 and 22.5 <= lng <= 23.4:
        return False
    return True


def format_lv_postal(text: str) -> str:
    """Latvian postcode NNNN as string (strip optional LV- prefix)."""
    s = str(text or "").strip().upper().replace("LV-", "").replace("LV", "").strip()
    m = re.search(r"\b(\d{4})\b", s)
    return m.group(1) if m else ""


def format_ee_postal(text: str) -> str:
    """Estonian postcode NNNNN as string."""
    m = re.search(r"\b(\d{5})\b", str(text or ""))
    return m.group(1) if m else ""


def format_lu_postal(text: str) -> str:
    """Luxembourg postcode NNNN as string (strip optional L- prefix)."""
    s = str(text or "").strip().upper().replace("L-", "").replace("LU-", "").strip()
    m = re.search(r"\b(\d{4})\b", s)
    return m.group(1) if m else ""


def format_mt_postal(text: str) -> str:
    """Malta postcode AAA NNNN (3 letters + 4 digits) as string."""
    s = str(text or "").strip().upper().replace(",", " ")
    m = re.search(r"\b([A-Z]{3})\s*(\d{4})\b", s)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def in_malta(lat: float, lng: float) -> bool:
    """Malta + Gozo + Comino — rejects Sicily / other Mediterranean cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    # Archipelago bbox
    if lat < 35.78 or lat > 36.10 or lng < 14.18 or lng > 14.58:
        return False
    # North: Sicily approaches (keep Gozo ≤ ~36.09)
    if lat >= 36.095 and lng >= 14.40:
        return False
    return True


def format_cy_postal(text: str) -> str:
    """Cyprus (RoC) postcode NNNN as string (strip optional CY-; reject 99xxx TRNC)."""
    s = str(text or "").strip().upper().replace("CY-", "").replace("CY", "").strip()
    m = re.search(r"\b(\d{4})\b", s)
    if not m:
        return ""
    code = m.group(1)
    if code.startswith("99"):
        return ""
    return code


def in_cyprus(lat: float, lng: float) -> bool:
    """Republic of Cyprus government-controlled — rejects Northern Cyprus / TRNC cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 34.55 or lat > 35.22 or lng < 32.25 or lng > 34.65:
        return False
    # Northern Cyprus: Kyrenia / Morphou / north-of-Green-Line Nicosia
    # Keep Republic suburbs (Pallouriotissa ~35.178, Engomi ~35.17) inside.
    if lat >= 35.19 and lng <= 33.55:
        return False
    # Gazimağusa north of Paralimni–Protaras coast
    if lat >= 35.08 and lng >= 33.85 and lng <= 34.15:
        return False
    return True


def format_is_postal(text: str) -> str:
    """Iceland postcode NNN as string (101–999)."""
    s = str(text or "").strip()
    m = re.search(r"\b([1-9]\d{2})\b", s)
    return m.group(1) if m else ""


def in_iceland(lat: float, lng: float) -> bool:
    """Iceland inhabited territory — rejects Greenland / Faroe / UK cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 63.0 or lat > 66.65 or lng < -25.0 or lng > -12.4:
        return False
    if lat >= 66.0 and lng <= -18.5:
        return False
    if lat >= 61.0 and lat <= 62.5 and lng >= -8.5 and lng <= -6.0:
        return False
    if lat < 66.0 and lng >= -8.0:
        return False
    if lat < 62.5 and lng >= -12.5:
        return False
    return True


ICELAND_POSTAL_RE = re.compile(r"^[1-9]\d{2}$")


def format_li_postal(text: str) -> str:
    """Liechtenstein postcode NNNN (9485–9498) as string."""
    s = str(text or "").strip().upper().replace("LI-", "").replace("FL-", "").strip()
    m = re.search(r"\b(94(?:8[5-9]|9[0-8]))\b", s)
    return m.group(1) if m else ""


def in_liechtenstein(lat: float, lng: float) -> bool:
    """Liechtenstein mainland — rejects CH (Buchs/Rheintal) and AT (Feldkirch) cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 47.04 or lat > 47.28 or lng < 9.46 or lng > 9.64:
        return False
    if lng <= 9.48 and lat >= 47.14 and lat <= 47.2:
        return False
    if lat >= 47.22 and lng >= 9.58:
        return False
    if lng >= 9.62 and lat >= 47.08:
        return False
    if lat <= 47.08 and lng <= 9.49:
        return False
    return True


LI_POSTAL_RE = re.compile(r"^94(?:8[5-9]|9[0-8])$")


def format_ad_postal(text: str) -> str:
    """Andorra postcode AD100–AD700."""
    s = str(text or "").strip().upper().replace(" ", "").replace("-", "")
    m = re.search(r"\b(AD[1-7]00)\b", s)
    if m:
        return m.group(1)
    # bare 100–700 sometimes appears
    m2 = re.search(r"\b([1-7]00)\b", s)
    if m2 and "AD" in s:
        return f"AD{m2.group(1)}"
    return ""


def in_andorra(lat: float, lng: float) -> bool:
    """Andorra mainland — rejects ES (La Seu) and FR (L'Hospitalet) cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 42.43 or lat > 42.66 or lng < 1.41 or lng > 1.79:
        return False
    if lat <= 42.45 and lng <= 1.5:
        return False
    if lng >= 1.76 and lat >= 42.55:
        return False
    return True


AD_POSTAL_RE = re.compile(r"^AD[1-7]00$", re.I)


def format_mc_postal(text: str) -> str:
    """Monaco postcode 98000."""
    s = str(text or "").strip().upper().replace(" ", "").replace("-", "")
    s = s.replace("MC", "")
    if s == "98000" or re.search(r"\b98000\b", str(text or "")):
        return "98000"
    return ""


def in_monaco(lat: float, lng: float) -> bool:
    """Monaco mainland — rejects Cap-d'Ail / Beausoleil / Roquebrune cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 43.7245 or lat > 43.7518 or lng < 7.409 or lng > 7.4398:
        return False
    if lng <= 7.411 and lat <= 43.73:
        return False
    if lat >= 43.7505 and lng <= 7.428:
        return False
    return True


MC_POSTAL_RE = re.compile(r"^98000$")


def format_sm_postal(text: str) -> str:
    """San Marino postcodes 47890–47899."""
    s = str(text or "").strip().upper().replace(" ", "").replace("-", "")
    s = s.replace("SM", "").replace("RSM", "")
    m = re.search(r"\b(4789[0-9])\b", str(text or ""))
    if m:
        return m.group(1)
    if re.fullmatch(r"4789[0-9]", s):
        return s
    return ""


def in_san_marino(lat: float, lng: float) -> bool:
    """San Marino mainland — rejects Rimini / Verucchio / Coriano / San Leo cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 43.893 or lat > 43.992 or lng < 12.416 or lng > 12.512:
        return False
    if lng >= 12.508 and lat >= 43.98:
        return False
    if lng <= 12.422 and lat <= 43.91:
        return False
    return True


SM_POSTAL_RE = re.compile(r"^4789[0-9]$")


def format_va_postal(text: str) -> str:
    """Vatican City State postcode 00120 only."""
    s = str(text or "").strip().upper().replace(" ", "").replace("-", "")
    m = re.search(r"\b(00120)\b", str(text or ""))
    if m:
        return m.group(1)
    if re.fullmatch(r"00120", s):
        return s
    return ""


# Inward-biased simplified Leonine Walls + St Peter's Square (lat, lng).
_VATICAN_POLYGON = [
    (41.90735, 12.4472),
    (41.90742, 12.4554),
    (41.9068, 12.4572),
    (41.9048, 12.4582),
    (41.9032, 12.45835),
    (41.90227, 12.4583),
    (41.9014, 12.4575),
    (41.9004, 12.4558),
    (41.90025, 12.4545),
    (41.9005, 12.451),
    (41.9015, 12.4462),
    (41.90197, 12.4458),
    (41.904, 12.4459),
    (41.906, 12.4465),
]


def _point_in_polygon(lat: float, lng: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        j = (i - 1) % n
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > lat) != (yj > lat) and lng < ((xj - xi) * (lat - yi)) / (
            (yj - yi) or 1e-15
        ) + xi:
            inside = not inside
    return inside


def in_vatican_city(lat: float, lng: float) -> bool:
    """Vatican City sovereign territory — rejects Rome Borgo/Prati/Conciliazione fringes."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 41.9001 or lat > 41.90755 or lng < 12.4456 or lng > 12.45845:
        return False
    if lng >= 12.4584:
        return False
    if lat <= 41.9002 and lng >= 12.453:
        return False
    return _point_in_polygon(lat, lng, _VATICAN_POLYGON)


VA_POSTAL_RE = re.compile(r"^00120$")


def format_md_postal(text: str) -> str:
    """Moldova postcodes: MD-NNNN (canonical) or bare 4 digits 2xxx–7xxx."""
    s = str(text or "").strip().upper().replace(" ", "")
    m = re.search(r"\bMD-?([2-7]\d{3})\b", s)
    if m:
        return f"MD-{m.group(1)}"
    m2 = re.search(r"\b([2-7]\d{3})\b", s)
    if m2:
        return f"MD-{m2.group(1)}"
    s2 = s.replace("MD-", "").replace("MD", "")
    if re.fullmatch(r"[2-7]\d{3}", s2):
        return f"MD-{s2}"
    return ""


def in_moldova(lat: float, lng: float) -> bool:
    """Moldova incl. Transnistria footprint — rejects RO Iași/Galați and UA cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 45.45 or lat > 48.5 or lng < 26.6 or lng > 30.15:
        return False
    if lng <= 27.72 and lat >= 46.95 and lat <= 47.4:
        return False
    if lat <= 45.55 and lng >= 27.85 and lng <= 28.15 and lng < 28.05:
        return False
    if lng <= 28.05 and lat >= 46.55 and lat <= 46.8 and lng < 27.9:
        return False
    if lat >= 48.35 and lng <= 27.0:
        return False
    if lat >= 48.35 and lng >= 27.6 and lng <= 28.0:
        return False
    if lng >= 30.05 and lat <= 46.7:
        return False
    return True


MD_POSTAL_RE = re.compile(r"^(MD-)?[2-7]\d{3}$", re.I)


def format_me_postal(text: str) -> str:
    """Montenegro postcodes: 5 digits 81xxx–85xxx (Pošta Crne Gore)."""
    s = str(text or "").strip().upper().replace(" ", "")
    m = re.search(r"\b(8[1-5]\d{3})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"8[1-5]\d{3}", s):
        return s
    return ""


def in_montenegro(lat: float, lng: float) -> bool:
    """Montenegro footprint — rejects HR Dubrovnik, BA Trebinje, AL Shkodër, RS Novi Pazar, XK Pejë."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 41.85 or lat > 43.56 or lng < 18.43 or lng > 20.36:
        return False
    if lng < 18.48 and lat >= 42.35:
        return False
    if lng < 18.48 and lat >= 42.65:
        return False
    if lat >= 42.68 and lng <= 18.52:
        return False
    if lat <= 42.12 and lng >= 19.4 and lng <= 19.65:
        return False
    if lng >= 20.28 and lat >= 43.05:
        return False
    if lng >= 20.2 and lat >= 42.55 and lat <= 42.8:
        return False
    return True


ME_POSTAL_RE = re.compile(r"^8[1-5]\d{3}$")


def format_mk_postal(text: str) -> str:
    """North Macedonia postcodes: 4 digits (Pošta na Severna Makedonija)."""
    s = str(text or "").strip().upper().replace(" ", "").replace("MK-", "")
    m = re.search(r"\b(\d{4})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"\d{4}", s):
        return s
    return ""


def in_north_macedonia(lat: float, lng: float) -> bool:
    """North Macedonia footprint — rejects GR / XK / RS / BG / AL border cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 40.85 or lat > 42.38 or lng < 20.45 or lng > 23.04:
        return False
    # South: Greece Thessaloniki / Kilkis
    if lat <= 41.12 and lng >= 22.35:
        return False
    # Southwest: Greece Florina / Edessa
    if lat <= 41.0 and lng >= 20.9 and lng <= 22.2:
        return False
    # Northwest: Albania Korçë / Pogradec
    if lng <= 20.72 and lat <= 41.15:
        return False
    if lng <= 20.78 and 40.85 <= lat <= 41.05:
        return False
    # North: Kosovo Ferizaj / Gjilan / Pristina
    if lat >= 42.28 and 21.0 <= lng <= 21.6:
        return False
    # Northeast: Serbia Vranje / Preševo
    if lat >= 42.2 and 21.55 <= lng <= 22.1:
        return False
    # East: Bulgaria Kyustendil (~42.28, 22.69) / Blagoevgrad
    if lng >= 22.55 and lat >= 42.15:
        return False
    if lng >= 22.85 and lat >= 41.9:
        return False
    if lng >= 22.95 and lat >= 41.7:
        return False
    return True


MK_POSTAL_RE = re.compile(r"^\d{4}$")


def format_ba_postal(text: str) -> str:
    """Bosnia & Herzegovina postcodes: 5 digits (Pošta BH Pošte)."""
    s = str(text or "").strip().upper().replace(" ", "").replace("BA-", "")
    m = re.search(r"\b([1-8]\d{4})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[1-8]\d{4}", s):
        return s
    return ""


def in_bosnia_herzegovina(lat: float, lng: float) -> bool:
    """BiH footprint — rejects HR Dubrovnik/Slavonski Brod, RS Drina east, ME south."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 42.55 or lat > 45.28 or lng < 15.75 or lng > 19.58:
        return False
    if lat >= 44.0 and lat <= 45.05 and lng >= 15.75 and lng <= 16.15:
        return True
    if lng <= 17.42 and lat >= 42.95 and not (lat >= 42.9 and lat <= 43.08 and lng >= 17.5):
        return False
    if lng <= 15.72:
        return False
    if lng <= 16.55 and lat >= 45.05:
        return False
    if lat >= 45.05 and lng <= 18.12:
        return False
    if lat >= 44.95 and lng <= 17.05:
        return False
    if lat >= 44.85 and lng >= 19.22:
        return False
    if lat >= 44.55 and lng >= 19.42:
        return False
    if lng >= 19.52:
        return False
    if lat <= 42.58 and lng >= 18.68:
        return False
    if lat <= 42.62 and lng >= 19.05:
        return False
    return True


BA_POSTAL_RE = re.compile(r"^\d{5}$")


def format_al_postal(text: str) -> str:
    """Albania postcodes: 4 digits (Posta Shqiptare Kod Postar)."""
    s = str(text or "").strip().replace(" ", "").replace("AL-", "")
    m = re.search(r"\b([1-9]\d{3})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[1-9]\d{3}", s):
        return s
    return ""


def in_albania(lat: float, lng: float) -> bool:
    """Albania footprint — rejects ME, Kosovo, MK, Greece border cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 39.62 or lat > 42.66 or lng < 19.25 or lng > 21.06:
        return False
    if lat >= 41.88 and lng <= 19.38:
        return False
    if lat >= 42.3 and lng <= 19.42:
        return False
    if lat >= 42.58 and lng <= 20.42:
        return False
    if lat >= 42.32 and 20.38 <= lng <= 20.52:
        return False
    if lat >= 42.12 and lng >= 20.68 and lng <= 20.82:
        return False
    if lat >= 42.6 and lng >= 20.95:
        return False
    if 41.95 <= lat <= 42.1 and lng >= 20.9:
        return False
    if lat <= 41.58 and lng >= 20.52:
        return False
    if lat <= 41.28 and 20.64 <= lng <= 20.82:
        return False
    if lat <= 41.22 and lng >= 20.74:
        return False
    if lat <= 40.88 and lng >= 21.28:
        return False
    if lat <= 40.6 and lng >= 21.12:
        return False
    if lat <= 40.15 and lng >= 20.72:
        return False
    if lat <= 39.75 and lng >= 20.78:
        return False
    if lat <= 39.62 and 20.12 <= lng <= 20.38:
        return False
    if lat <= 39.72 and lng <= 20.08:
        return False
    return True


AL_POSTAL_RE = re.compile(r"^[1-9]\d{3}$")


def format_xk_postal(text: str) -> str:
    """Kosovo postcodes: 5 digits (Posta e Kosovës), 10000–79999."""
    s = str(text or "").strip().replace(" ", "").replace("XK-", "")
    m = re.search(r"\b([1-7]\d{4})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[1-7]\d{4}", s):
        return s
    return ""


def in_kosovo(lat: float, lng: float) -> bool:
    """Kosovo footprint — rejects AL, ME, MK, RS border cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 41.85 or lat > 43.27 or lng < 20.05 or lng > 21.85:
        return False
    if lat >= 42.35 and lng <= 20.18:
        return False
    if lat >= 42.05 and lat <= 42.35 and lng <= 20.32:
        return False
    if lat >= 42.78 and lng <= 20.22:
        return False
    if lat >= 42.82 and lng <= 19.98:
        return False
    if lat >= 43.12 and lng >= 20.48:
        return False
    if lat >= 43.0 and lng >= 20.72:
        return False
    if lat >= 42.08 and lng >= 21.68:
        return False
    if lat <= 42.05 and lng >= 21.38:
        return False
    if 41.95 <= lat <= 42.08 and lng >= 20.88:
        return False
    if lat <= 41.92 and lng >= 20.55:
        return False
    if lat <= 42.28 and lng >= 21.68:
        return False
    if lat <= 42.55 and lng >= 21.82:
        return False
    if lat <= 42.45 and lng >= 21.85:
        return False
    return True


XK_POSTAL_RE = re.compile(r"^[1-7]\d{4}$")


def format_rs_postal(text: str) -> str:
    """Serbia postcodes: 5 digits (Pošta Srbije)."""
    s = str(text or "").strip().replace(" ", "").replace("RS-", "")
    m = re.search(r"\b(\d{5})\b", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"\d{5}", s):
        return s
    return ""


def in_serbia(lat: float, lng: float) -> bool:
    """Serbia mainland footprint excluding Kosovo — rejects HU/RO/BG/MK/ME/BA/HR cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 42.23 or lat > 46.19 or lng < 18.81 or lng > 23.01:
        return False
    if in_kosovo(lat, lng):
        return False
    # West: Bosnia — Bijeljina / Drina corridor
    if lng <= 18.88 and lat >= 44.0:
        return False
    if lng <= 19.05 and lat >= 43.4:
        return False
    # West: Croatia — Vukovar / Osijek approach
    if lng <= 18.95 and lat >= 45.05:
        return False
    # Southwest: Montenegro — Prijepolje / Rožaje approach
    if lat <= 43.05 and lng <= 19.38:
        return False
    # South: North Macedonia — Kumanovo / Skopje
    if lat <= 42.28 and lng >= 21.88:
        return False
    if lat <= 42.05 and lng >= 21.45:
        return False
    # Southeast: Bulgaria — Pirot / Dimitrovgrad approach
    if lat <= 43.05 and lng >= 22.58:
        return False
    # East: Romania — Timișoara / Vršac east
    if lng >= 22.45 and lat >= 44.85:
        return False
    # North: Hungary — Subotica north / Szeged
    if lat >= 46.05 and lng <= 20.5:
        return False
    return True


RS_POSTAL_RE = re.compile(r"^\d{5}$")


def in_luxembourg(lat: float, lng: float) -> bool:
    """Luxembourg mainland — rejects BE / FR / DE border cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 49.44 or lat > 50.19 or lng < 5.73 or lng > 6.53:
        return False
    # West: Belgium (Arlon / Athus corridor)
    if lng <= 5.82 and lat <= 49.7:
        return False
    # South: France (Thionville / Longwy approach)
    if lat <= 49.46 and lng >= 5.9 and lng <= 6.2:
        return False
    # East: Germany (Trier / Perl corridor)
    if lng >= 6.48 and lat >= 49.7:
        return False
    return True


def in_estonia(lat: float, lng: float) -> bool:
    """Estonia mainland + major islands — rejects LV / RU / FI cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 57.5 or lat > 59.75 or lng < 21.7 or lng > 28.3:
        return False
    # South: Latvia (Rīga / Valmiera corridor)
    if lat <= 57.8 and 24.0 <= lng <= 26.5:
        return False
    # SE: Latvia (Alūksne) / Russia approach
    if lat <= 57.7 and lng >= 26.8:
        return False
    # East: Russia (Pskov / Ivangorod inland)
    if lng >= 28.0 and lat <= 59.0:
        return False
    # North: Finland Gulf — reject Helsinki side
    if lat >= 59.7 and lng <= 25.5:
        return False
    return True


def in_latvia(lat: float, lng: float) -> bool:
    """Latvia mainland — rejects LT / EE / RU (Pskov) / BY cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 55.55 or lat > 58.15 or lng < 20.9 or lng > 28.35:
        return False
    # South: Lithuania (Vilnius / Kaunas / Šiauliai corridor)
    if lat <= 56.05 and 23.0 <= lng <= 26.0:
        return False
    # SW: Lithuania (Klaipėda / Mažeikiai west coast corridor)
    if lat <= 56.25 and lng <= 22.2:
        return False
    # North: Estonia (Tallinn / Pärnu corridor)
    if lat >= 57.75 and 23.5 <= lng <= 26.5:
        return False
    # NE: Estonia / Russia (Narva / Pskov approach)
    if lat >= 57.7 and lng >= 27.2:
        return False
    # SE: Belarus (Vitebsk corridor south of Daugavpils)
    if lat <= 55.75 and lng >= 26.5:
        return False
    return True


def format_hr_postal(text: str) -> str:
    """Croatian postcode NNNNN as string."""
    m = re.search(r"\b(\d{5})\b", str(text or ""))
    return m.group(1) if m else ""


def in_croatia(lat: float, lng: float) -> bool:
    """Croatia mainland + coast — rejects SI/HU/RS/BA/ME cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 42.3 or lat > 46.55 or lng < 13.4 or lng > 19.5:
        return False
    # NW: Slovenia
    if lat >= 45.75 and lng <= 14.6:
        return False
    # North: Hungary
    if lat >= 46.35 and 16.5 <= lng <= 17.8:
        return False
    # East: Serbia
    if 45.0 <= lat <= 46.2 and lng >= 19.15:
        return False
    # SE inland Bosnia core
    if 43.7 <= lat <= 45.0 and 17.9 <= lng <= 18.6:
        return False
    # South: Montenegro
    if lat <= 42.55 and lng >= 18.7:
        return False
    return True


def clean_text(s: Any) -> str:
    if s is None:
        return ""
    s = htmlmod.unescape(str(s))
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def make_id(prefix: str, brand: str, address: str, postal: str, city: str, country: str) -> str:
    key = "|".join(
        [
            (brand or "").strip().lower(),
            (address or "").strip().lower(),
            (postal or "").strip().upper().replace(" ", ""),
            (city or "").strip().lower(),
            (country or "").strip().lower(),
        ]
    )
    return prefix + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]


def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def norm_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9àáâãäåçèéêëìíîïñòóôõöùúûüýÿěščřžýáíéóúůďťňőűά-ωΑ-Ω]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def fetch(url: str, timeout: int = 45) -> tuple[str, str]:
    """Return (final_url, text). Raises on hard failure."""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.geturl(), r.read().decode("utf-8", "replace")


def fetch_safe(url: str, timeout: int = 45) -> tuple[str | None, str]:
    try:
        return fetch(url, timeout=timeout)
    except Exception as e:
        return None, f"ERR:{type(e).__name__}:{e}"


def curl_fetch(url: str, out_path: Path | None = None, timeout: int = 45) -> str:
    """Use curl for TLS-picky hosts. Returns body text."""
    cmd = [
        "curl",
        "-fsSL",
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "--tlsv1.2",
        "--max-time",
        str(timeout),
        url,
    ]
    try:
        body = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        text = body.decode("utf-8", "replace")
        if out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(text)
        return text
    except Exception as e:
        return f"ERR:{type(e).__name__}:{e}"


def extract_jsonld(html: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            out.extend([x for x in data if isinstance(x, dict)])
        elif isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                out.extend([x for x in data["@graph"] if isinstance(x, dict)])
            else:
                out.append(data)
    return out


def extract_geo_from_html(html: str) -> tuple[float | None, float | None]:
    patterns = [
        r'"latitude"\s*:\s*([-\d.]+)\s*,\s*"longitude"\s*:\s*([-\d.]+)',
        r'"lat"\s*:\s*([-\d.]+)\s*,\s*"lng"\s*:\s*([-\d.]+)',
        r'"lat"\s*:\s*([-\d.]+)\s*,\s*"lon"\s*:\s*([-\d.]+)',
        r"@(-?\d+\.\d+),(-?\d+\.\d+)",
        r"maps\.google\.com/\?q=(-?\d+\.\d+),(-?\d+\.\d+)",
        r"destination=(-?\d+\.\d+)%2C(-?\d+\.\d+)",
        r'data-lat=["\']([-\d.]+)["\'][^>]*data-lng=["\']([-\d.]+)["\']',
        r'data-latitude=["\']([-\d.]+)["\'][^>]*data-longitude=["\']([-\d.]+)["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.I)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except ValueError:
                continue
    for block in extract_jsonld(html):
        geo = block.get("geo") or {}
        if isinstance(geo, dict) and geo.get("latitude") is not None:
            try:
                return float(geo["latitude"]), float(geo["longitude"])
            except (TypeError, ValueError, KeyError):
                pass
    return None, None


def extract_eircode(text: str) -> str:
    m = re.search(
        r"\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4})\b", text, re.I
    )
    if not m:
        return ""
    compact = re.sub(r"\s+", "", m.group(1).upper())
    if len(compact) == 7:
        return f"{compact[:3]} {compact[3:]}"
    return ""


def format_cz_postal(text: str) -> str:
    m = re.search(r"\b([1-7]\d{2})\s*(\d{2})\b", text)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def format_hu_postal(text: str) -> str:
    m = re.search(r"\b(\d{4})\b", text)
    return m.group(1) if m else ""


def format_ro_postal(text: str) -> str:
    """Romanian NNNNNN — preserve leading zeros as string."""
    m = re.search(r"\b(\d{6})\b", str(text or ""))
    return m.group(1) if m else ""


def format_gr_postal(text: str) -> str:
    m = re.search(r"\b(\d{3})\s*(\d{2})\b", text)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def format_sk_postal(text: str) -> str:
    """Slovak PSČ NNN NN — first digit 0/8/9 (not Czech 1–7). Reject 000 xx noise."""
    m = re.search(r"\b([089]\d{2})\s*(\d{2})\b", str(text or ""))
    if not m:
        return ""
    if m.group(1) == "000":
        return ""
    return f"{m.group(1)} {m.group(2)}"


def format_bg_postal(text: str) -> str:
    m = re.search(r"\b(\d{4})\b", str(text or ""))
    return m.group(1) if m else ""


def nominatim_geocode(
    query: str,
    countrycodes: str,
    cache: dict,
    *,
    sleep: float = 1.1,
) -> dict | None:
    key = f"{countrycodes}|{query}".lower().strip()
    if key in cache:
        return cache[key]
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "limit": 1,
            "countrycodes": countrycodes,
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GymlyBatch1Phase1/1.0 (catalog research; contact: gymly)",
            "Accept": "application/json",
        },
    )
    time.sleep(sleep)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]
    if not data:
        cache[key] = None
        return None
    hit = data[0]
    addr = hit.get("address") or {}
    cache[key] = {
        "lat": float(hit["lat"]),
        "lng": float(hit["lon"]),
        "display_name": hit.get("display_name"),
        "importance": hit.get("importance"),
        "postcode": addr.get("postcode") or "",
        "country_code": (addr.get("country_code") or "").lower(),
    }
    return cache[key]


def nominatim_reverse(
    lat: float,
    lng: float,
    cache: dict,
    *,
    sleep: float = 1.1,
) -> dict | None:
    key = f"rev|{round(lat, 6)}|{round(lng, 6)}"
    if key in cache:
        return cache[key]
    params = urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lng,
            "format": "json",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GymlyBatch1Phase1/1.0 (catalog research; contact: gymly)",
            "Accept": "application/json",
        },
    )
    time.sleep(sleep)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            hit = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        cache[key] = {"error": str(e)}
        return cache[key]
    if not hit or hit.get("error"):
        cache[key] = None
        return None
    addr = hit.get("address") or {}
    cache[key] = {
        "lat": float(hit.get("lat") or lat),
        "lng": float(hit.get("lon") or lng),
        "display_name": hit.get("display_name"),
        "postcode": addr.get("postcode") or "",
        "country_code": (addr.get("country_code") or "").lower(),
        "road": addr.get("road") or "",
        "city": addr.get("city") or addr.get("town") or addr.get("province") or "",
    }
    return cache[key]


def in_ireland(lat: float, lng: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 51.35 or lat > 55.45 or lng < -10.7 or lng > -5.9:
        return False
    if 54.02 <= lat <= 55.32 and -7.05 <= lng <= -5.4:
        return False
    if 54.85 <= lat <= 55.25 and -7.45 <= lng <= -6.8:
        return False
    return True


def in_czechia(lat: float, lng: float) -> bool:
    return math.isfinite(lat) and math.isfinite(lng) and 48.55 <= lat <= 51.06 and 12.09 <= lng <= 18.86


def in_hungary(lat: float, lng: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 45.74 or lat > 48.58 or lng < 16.45 or lng > 22.9:
        return False
    if lat >= 48.02 and lng <= 17.35:
        return False
    return True


def in_romania(lat: float, lng: float) -> bool:
    """Romania mainland bbox — rejects HU/BG/MD/UA/RS cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 43.6 or lat > 48.3 or lng < 20.2 or lng > 29.75:
        return False
    # NW: Hungary / Ukraine exclusion
    if lat >= 47.85 and lng <= 22.55:
        return False
    if lat >= 48.0 and lng <= 23.0:
        return False
    # NE: Moldova / Ukraine
    if lat >= 46.5 and lng >= 28.55:
        return False
    if lat >= 45.5 and lng >= 29.0:
        return False
    # South: Bulgaria
    if lat <= 44.0 and lng >= 28.0:
        return False
    # West: Serbia (Belgrade / Novi Sad corridor)
    if lat >= 44.5 and lat <= 46.2 and lng <= 21.05:
        return False
    return True


def in_slovakia(lat: float, lng: float) -> bool:
    """Slovakia mainland bbox — rejects CZ/AT/HU/PL/UA cores."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 47.7 or lat > 49.65 or lng < 16.8 or lng > 22.6:
        return False
    # NW: Czechia
    if lat >= 49.35 and lng <= 18.2:
        return False
    # West: Austria (Vienna)
    if lng <= 16.95 and lat <= 48.35:
        return False
    # South: Hungary
    if lat <= 47.85 and 17.3 <= lng <= 19.5:
        return False
    # North: Poland
    if lat >= 49.5 and 19.0 <= lng <= 21.2:
        return False
    # East: Ukraine
    if lng >= 22.25 and lat >= 48.4:
        return False
    return True


def in_bulgaria(lat: float, lng: float) -> bool:
    """Bulgaria mainland bbox — rejects RO/RS/MK/GR/TR cores; Black Sea west coast OK."""
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if lat < 41.2 or lat > 44.25 or lng < 22.3 or lng > 28.7:
        return False
    # North: Bucharest corridor (Romania)
    if lat >= 44.0 and 25.0 <= lng <= 27.5:
        return False
    # SE: Istanbul / Turkish Thrace
    if lat <= 41.5 and lng >= 27.8:
        return False
    # SW: Thessaloniki / Greek Macedonia
    if lat <= 41.55 and lng <= 23.6:
        return False
    # NW: Belgrade / Serbia corridor
    if lat >= 43.5 and lng <= 22.55:
        return False
    return True


def in_greece(lat: float, lng: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if 39.35 <= lat <= 39.85 and 19.55 <= lng <= 20.2:
        return True
    if 36.0 <= lat <= 41.75 and 19.3 <= lng <= 26.8:
        if lng < 20.7 and lat > 39.9:
            return False
        return True
    if 34.8 <= lat <= 35.75 and 23.4 <= lng <= 26.4:
        return True
    if 35.85 <= lat <= 37.0 and 26.85 <= lng <= 28.3:
        return True
    if 38.1 <= lat <= 39.45 and 25.8 <= lng <= 26.7:
        return True
    return False


def base_row(
    *,
    prefix: str,
    country: str,
    brand: str,
    name: str,
    address: str,
    postal_code: str,
    city: str,
    source_url: str,
    lat=None,
    lng=None,
    website: str = "",
    coord_source: str | None = None,
    notes: str = "",
    coming: bool = False,
    closed: bool = False,
    chain_key: str = "",
    discovery_class: str = "national_chain",
) -> dict:
    address = clean_text(address)
    city = clean_text(city)
    name = clean_text(name)
    brand = clean_text(brand)
    postal_code = clean_text(postal_code)
    rid = make_id(prefix, brand, address, postal_code, city, country)
    lat_f = lng_f = None
    if lat is not None and lng is not None:
        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if lat_f == 0 and lng_f == 0:
                lat_f = lng_f = None
        except (TypeError, ValueError):
            lat_f = lng_f = None
    return {
        "id": rid,
        "name": name or f"{brand} {city}".strip(),
        "brand": brand,
        "chain_key": chain_key or brand.lower().replace(" ", "_"),
        "address": address,
        "postal_code": postal_code,
        "city": city,
        "country": country,
        "lat": lat_f,
        "lng": lng_f,
        "website": website or source_url,
        "source_url": source_url,
        "coord_source": coord_source,
        "notes": notes,
        "import_category": "NEEDS_REVIEW",
        "discovered_at": datetime.now(timezone.utc).date().isoformat(),
        "is_active": not closed and not coming,
        "is_coming_soon": coming,
        "is_closed": closed,
        "discovery_class": discovery_class,
        "verification_status": "PHASE1_CANDIDATE",
        "evidence": {"source_url": source_url},
    }


def load_production() -> list[dict]:
    return json.loads(CENTERS.read_text())


def classify_row(
    r: dict,
    *,
    postal_re: re.Pattern,
    in_country: Callable[[float, float], bool],
    format_postal: Callable[[str], str] | None = None,
) -> str:
    if (
        r.get("verification_status") == "EXCLUDED"
        or r.get("import_category") == "EXCLUDED"
        or str(r.get("notes") or "").startswith("EXCLUDED")
        or str(r.get("discovery_class") or "").startswith("excluded")
        or str(r.get("discovery_class") or "") == "market_audit_exclusion"
    ):
        return "EXCLUDED"
    if r.get("is_closed"):
        return "CLOSED"
    if r.get("is_coming_soon"):
        return "COMING_SOON"
    if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
        return "NEEDS_REVIEW"
    if FALLBACK_RE.search(str(r.get("coord_source") or "")):
        return "NEEDS_REVIEW"
    postal = str(r.get("postal_code") or "")
    if format_postal and postal and not postal_re.match(postal):
        postal = format_postal(postal) or postal
        r["postal_code"] = postal
    missing = not (
        r.get("name")
        and r.get("brand")
        and r.get("address")
        and len(str(r.get("address"))) > 3
        and r.get("city")
        and postal_re.match(str(r.get("postal_code") or ""))
    )
    lat, lng = r.get("lat"), r.get("lng")
    has_coords = (
        isinstance(lat, (int, float))
        and isinstance(lng, (int, float))
        and math.isfinite(lat)
        and math.isfinite(lng)
        and in_country(float(lat), float(lng))
    )
    if missing and not has_coords:
        return "NEEDS_REVIEW"
    if missing:
        return "NEEDS_REVIEW"
    if not has_coords:
        return "NEEDS_COORDINATES"
    return "READY_TO_IMPORT"


def proximity_pairs(rows: list[dict], brand_only: bool = True) -> dict:
    buckets = {"lt25": [], "lt50": [], "lt100": [], "lt200": [], "identical": []}
    for i, a in enumerate(rows):
        if a.get("lat") is None or a.get("lng") is None:
            continue
        for b in rows[i + 1 :]:
            if b.get("lat") is None or b.get("lng") is None:
                continue
            if brand_only and (a.get("brand") or "").lower() != (b.get("brand") or "").lower():
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            item = {
                "a_id": a["id"],
                "b_id": b["id"],
                "brand": a.get("brand"),
                "distance_m": round(d),
                "same_address": norm_addr(a.get("address", "")) == norm_addr(b.get("address", "")),
            }
            if abs(a["lat"] - b["lat"]) < 1e-7 and abs(a["lng"] - b["lng"]) < 1e-7:
                buckets["identical"].append(item)
            if d <= 25:
                buckets["lt25"].append(item)
            elif d <= 50:
                buckets["lt50"].append(item)
            elif d <= 100:
                buckets["lt100"].append(item)
            elif d <= 200:
                buckets["lt200"].append(item)
    return buckets


def production_collisions(ready: list[dict], production: list[dict], max_m: float = 50) -> list[dict]:
    hits = []
    prod_geo = [
        c
        for c in production
        if isinstance(c.get("lat"), (int, float)) and isinstance(c.get("lng"), (int, float))
    ]
    for r in ready:
        if r.get("lat") is None:
            continue
        for c in prod_geo:
            d = haversine(r["lat"], r["lng"], c["lat"], c["lng"])
            if d <= max_m:
                hits.append(
                    {
                        "candidate_id": r["id"],
                        "production_id": c["id"],
                        "production_country": c.get("country"),
                        "distance_m": round(d),
                    }
                )
                break
    return hits


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def dedupe_by_id(rows: list[dict]) -> list[dict]:
    seen = {}
    for r in rows:
        rid = r["id"]
        if rid not in seen:
            seen[rid] = r
            continue
        # Prefer row with coords
        if seen[rid].get("lat") is None and r.get("lat") is not None:
            seen[rid] = r
    return list(seen.values())


def status_counts(rows: list[dict]) -> dict:
    return dict(Counter(r.get("import_category") for r in rows))


def brand_counts(rows: list[dict]) -> dict:
    return dict(Counter(r.get("brand") for r in rows))


def run_phase1_consolidate(
    *,
    country: str,
    prefix: str,
    countrycodes: str,
    out_dir: Path,
    candidates_name: str,
    postal_re: re.Pattern,
    in_country: Callable[[float, float], bool],
    format_postal: Callable[[str], str] | None,
    major_cities: list[str],
    chain_coverage_notes: dict | None = None,
    geocode_limit: int = 80,
) -> dict:
    """Shared Phase 1 consolidate: geocode gaps, classify, write staging/READY/reports."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cand_path = out_dir / candidates_name
    rows = json.loads(cand_path.read_text()) if cand_path.exists() else []
    cache_path = out_dir / f"{country.lower()}_geocode_cache.json"
    # normalize filenames for Czechia etc.
    slug = {
        "Ireland": "ireland",
        "Czechia": "czechia",
        "Hungary": "hungary",
        "Greece": "greece",
        "Romania": "romania",
        "Slovakia": "slovakia",
        "Bulgaria": "bulgaria",
        "Croatia": "croatia",
        "Slovenia": "slovenia",
        "Lithuania": "lithuania",
        "Latvia": "latvia",
        "Estonia": "estonia",
        "Luxembourg": "luxembourg",
        "Malta": "malta",
        "Ukraine": "ukraine",
        "Belarus": "belarus",
        "Turkey": "turkey",
        "Cyprus": "cyprus",
        "Iceland": "iceland",
        "Liechtenstein": "liechtenstein",
        "Andorra": "andorra",
        "Monaco": "monaco",
        "San Marino": "san-marino",
        "Vatican City": "vatican-city",
        "Moldova": "moldova",
        "Montenegro": "montenegro",
    }[country]
    cache_path = out_dir / f"{slug}_geocode_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    # Normalize postal + geocode missing coords when address quality is OK
    geocoded = 0
    for r in rows:
        if format_postal and r.get("postal_code"):
            pc = format_postal(str(r["postal_code"])) or str(r["postal_code"])
            r["postal_code"] = pc
        if r.get("lat") is not None and r.get("lng") is not None:
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if not postal_re.match(str(r.get("postal_code") or "")):
            continue
        if geocoded >= geocode_limit:
            continue
        q = ", ".join(
            x for x in [r["address"], r.get("postal_code"), r["city"], country] if x
        )
        hit = nominatim_geocode(q, countrycodes, cache)
        geocoded += 1
        if hit and hit.get("lat") is not None:
            lat, lng = float(hit["lat"]), float(hit["lng"])
            if in_country(lat, lng):
                r["lat"], r["lng"] = lat, lng
                r["coord_source"] = "STRICT_ADDRESS_GEOCODE"
                r["evidence"] = {
                    **(r.get("evidence") or {}),
                    "geocode_display": hit.get("display_name"),
                }
                # Fill missing postal from Nominatim when format matches
                if not postal_re.match(str(r.get("postal_code") or "")):
                    npc = str(hit.get("postcode") or "")
                    if format_postal:
                        npc = format_postal(npc) or npc
                    if postal_re.match(npc):
                        r["postal_code"] = npc
                        r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"

    write_json(cache_path, cache)

    # Second pass: recover missing/invalid postal via reverse-ish address geocode
    # when coords already official but postal absent (common for IE Dublin-district labels)
    for r in rows:
        if postal_re.match(str(r.get("postal_code") or "")):
            continue
        if r.get("is_closed") or r.get("is_coming_soon"):
            continue
        if not r.get("address") or not r.get("city"):
            continue
        if geocoded >= geocode_limit + 40:
            break
        q = ", ".join(
            x for x in [r["address"], r.get("postal_code"), r["city"], country] if x
        )
        hit = nominatim_geocode(q, countrycodes, cache)
        geocoded += 1
        if not hit:
            continue
        npc = str(hit.get("postcode") or "")
        if format_postal:
            npc = format_postal(npc) or npc
        if postal_re.match(npc):
            r["postal_code"] = npc
            r["notes"] = (r.get("notes") or "") + "; postal_from_geocode"
            if r.get("lat") is None and hit.get("lat") is not None:
                lat, lng = float(hit["lat"]), float(hit["lng"])
                if in_country(lat, lng):
                    r["lat"], r["lng"] = lat, lng
                    r["coord_source"] = "STRICT_ADDRESS_GEOCODE"

    write_json(cache_path, cache)

    # Classify
    for r in rows:
        if r.get("import_category") in ("DUPLICATE", "LEGACY"):
            continue
        cat = classify_row(
            r, postal_re=postal_re, in_country=in_country, format_postal=format_postal
        )
        r["import_category"] = cat
        r["verification_status"] = (
            "VERIFIED_CURRENT" if cat == "READY_TO_IMPORT" else cat
        )
        r["country"] = country
        if not str(r.get("id", "")).startswith(prefix):
            r["id"] = make_id(
                prefix,
                r.get("brand", ""),
                r.get("address", ""),
                r.get("postal_code", ""),
                r.get("city", ""),
                country,
            )

    rows = dedupe_by_id(rows)

    # Same-brand identical normalized address → DUPLICATE (keep best)
    by_addr: dict[str, dict] = {}
    for r in rows:
        if r.get("import_category") in ("CLOSED", "COMING_SOON", "LEGACY"):
            continue
        key = "|".join(
            [
                (r.get("brand") or "").lower(),
                norm_addr(r.get("address") or ""),
                str(r.get("postal_code") or "").upper().replace(" ", ""),
            ]
        )
        if not norm_addr(r.get("address") or ""):
            continue
        if key not in by_addr:
            by_addr[key] = r
            continue
        # Prefer row with eircode/postal + coords
        existing = by_addr[key]
        def score(x):
            return (
                1 if postal_re.match(str(x.get("postal_code") or "")) else 0,
                1 if x.get("lat") is not None else 0,
                len(str(x.get("name") or "")),
            )
        if score(r) > score(existing):
            existing["import_category"] = "DUPLICATE"
            existing["notes"] = (existing.get("notes") or "") + "; same_address_duplicate"
            by_addr[key] = r
        else:
            r["import_category"] = "DUPLICATE"
            r["notes"] = (r.get("notes") or "") + "; same_address_duplicate"

    # Mark identical-coord same-brand as DUPLICATE (keep first READY)
    by_coord: dict[tuple, list] = defaultdict(list)
    for r in rows:
        if r.get("lat") is None:
            continue
        key = (round(float(r["lat"]), 6), round(float(r["lng"]), 6), (r.get("brand") or "").lower())
        by_coord[key].append(r)
    for key, group in by_coord.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda x: 0 if x.get("import_category") == "READY_TO_IMPORT" else 1)
        for dup in group[1:]:
            if dup.get("import_category") == "READY_TO_IMPORT":
                dup["import_category"] = "DUPLICATE"
                dup["notes"] = (dup.get("notes") or "") + "; identical_coords_duplicate"

    production = load_production()
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]
    prox = proximity_pairs(ready)
    collisions = production_collisions(ready, production, max_m=50)

    # Downgrade READY that collide with production within 25m (suspicious)
    for hit in collisions:
        if hit["distance_m"] <= 25:
            if hit["candidate_id"] == hit["production_id"]:
                continue  # same stable id already live — idempotent Phase 1 re-run
            for r in ready:
                if r["id"] == hit["candidate_id"]:
                    r["import_category"] = "NEEDS_REVIEW"
                    r["notes"] = (r.get("notes") or "") + f"; prod_collision_{hit['production_id']}"
                    break
    ready = [r for r in rows if r.get("import_category") == "READY_TO_IMPORT"]

    # DQ checks on READY
    dq = {
        "duplicate_ids": [],
        "invalid_ready_postcodes": [],
        "missing_ready_fields": [],
        "invalid_ready_coords": [],
        "fallback_coords": [],
        "foreign_outliers": [],
        "mojibake": [],
    }
    seen_ids = set()
    for r in ready:
        rid = r["id"]
        if rid in seen_ids:
            dq["duplicate_ids"].append(rid)
        seen_ids.add(rid)
        if not postal_re.match(str(r.get("postal_code") or "")):
            dq["invalid_ready_postcodes"].append(rid)
        if not (r.get("name") and r.get("address") and r.get("city")):
            dq["missing_ready_fields"].append(rid)
        lat, lng = r.get("lat"), r.get("lng")
        if not (
            isinstance(lat, (int, float))
            and isinstance(lng, (int, float))
            and math.isfinite(lat)
            and math.isfinite(lng)
        ):
            dq["invalid_ready_coords"].append(rid)
        elif not in_country(float(lat), float(lng)):
            dq["foreign_outliers"].append(rid)
        if FALLBACK_RE.search(str(r.get("coord_source") or "")):
            dq["fallback_coords"].append(rid)
        if MOJIBAKE_RE.search(f"{r.get('name')} {r.get('address')} {r.get('city')}"):
            dq["mojibake"].append(rid)

    # Coverage
    city_hits = {}
    blob = " ".join(f"{r.get('city')} {r.get('address')} {r.get('name')}" for r in rows).lower()
    for c in major_cities:
        city_hits[c] = c.lower() in blob or any(
            c.lower() in (r.get("city") or "").lower() for r in rows
        )

    statuses = status_counts(rows)
    brands = brand_counts(rows)
    ready_brands = brand_counts(ready)

    inventory_path = out_dir / f"{slug}_chain_inventory.json"
    inventory = json.loads(inventory_path.read_text()) if inventory_path.exists() else {}
    inventory["status_counts"] = statuses
    inventory["ready_by_brand"] = ready_brands
    inventory["city_coverage"] = city_hits
    if chain_coverage_notes:
        inventory["coverage_notes"] = chain_coverage_notes
    write_json(inventory_path, inventory)

    dup_analysis = {
        "proximity": prox,
        "production_collisions": collisions,
        "dq": {k: len(v) for k, v in dq.items()},
        "dq_detail": dq,
    }
    write_json(out_dir / f"{slug}_duplicate_analysis.json", dup_analysis)

    staging_name = f"{slug}_centers_staging.json"
    write_json(out_dir / staging_name, rows)
    ready_name = f"{country.upper()}_PHASE1_READY_TO_IMPORT.json"
    if country == "Czechia":
        ready_name = "CZECHIA_PHASE1_READY_TO_IMPORT.json"
    write_json(out_dir / ready_name, ready)

    # Verdict heuristic
    major_gap = False
    notes = chain_coverage_notes or {}
    for k, v in notes.items():
        if isinstance(v, str) and ("PHASE 2" in v.upper() or "blocked" in v.lower() or "incomplete" in v.lower()):
            major_gap = True
    if len(ready) < 8:
        major_gap = True
    needs_coords = statuses.get("NEEDS_COORDINATES", 0)
    needs_review = statuses.get("NEEDS_REVIEW", 0)
    if needs_coords + needs_review > max(15, len(ready)):
        major_gap = True
    # Clean DQ required for merge-ready
    clean_dq = all(len(v) == 0 for v in dq.values())
    verdict = (
        f"{country.upper()} PHASE 2 REQUIRED BEFORE MERGE"
        if major_gap or not clean_dq
        else f"READY FOR {country.upper()} MERGE"
    )
    # Friendly Ireland casing
    if country == "Ireland":
        verdict = (
            "IRELAND PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR IRELAND MERGE"
        )
    elif country == "Czechia":
        verdict = (
            "CZECHIA PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR CZECHIA MERGE"
        )
    elif country == "Hungary":
        verdict = (
            "HUNGARY PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR HUNGARY MERGE"
        )
    elif country == "Greece":
        verdict = (
            "GREECE PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR GREECE MERGE"
        )
    elif country == "Romania":
        verdict = (
            "ROMANIA PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR ROMANIA MERGE"
        )
    elif country == "Slovenia":
        verdict = (
            "SLOVENIA PHASE 2 REQUIRED BEFORE MERGE"
            if major_gap or not clean_dq
            else "READY FOR SLOVENIA MERGE"
        )

    report = {
        "country": country,
        "prefix": prefix,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_total": PRODUCTION_TOTAL,
        "unique_staged": len(rows),
        "status_counts": statuses,
        "ready_count": len(ready),
        "ready_by_brand": ready_brands,
        "brand_counts": brands,
        "city_coverage": city_hits,
        "data_quality": {k: len(v) for k, v in dq.items()},
        "production_collisions": len(collisions),
        "proximity_summary": {k: len(v) for k, v in prox.items()},
        "projected_catalog_if_merged_alone": PRODUCTION_TOTAL + len(ready),
        "verdict": verdict,
        "coverage_notes": notes,
        "geocoded_this_run": geocoded,
    }
    report_json = out_dir / f"{slug.upper()}_PHASE1_READINESS_REPORT.json"
    if country == "Czechia":
        report_json = out_dir / "CZECHIA_PHASE1_READINESS_REPORT.json"
    elif country == "Ireland":
        report_json = out_dir / "IRELAND_PHASE1_READINESS_REPORT.json"
    elif country == "Hungary":
        report_json = out_dir / "HUNGARY_PHASE1_READINESS_REPORT.json"
    elif country == "Greece":
        report_json = out_dir / "GREECE_PHASE1_READINESS_REPORT.json"
    elif country == "Romania":
        report_json = out_dir / "ROMANIA_PHASE1_READINESS_REPORT.json"
    write_json(report_json, report)

    md = f"""# {country.upper()} PHASE 1 READINESS REPORT

Generated: {report['generated_at']}

## Summary

| Metric | Value |
|--------|-------|
| Unique staged | {len(rows)} |
| READY_TO_IMPORT | {len(ready)} |
| NEEDS_COORDINATES | {statuses.get('NEEDS_COORDINATES', 0)} |
| NEEDS_REVIEW | {statuses.get('NEEDS_REVIEW', 0)} |
| COMING_SOON | {statuses.get('COMING_SOON', 0)} |
| CLOSED | {statuses.get('CLOSED', 0)} |
| DUPLICATE/LEGACY | {statuses.get('DUPLICATE', 0) + statuses.get('LEGACY', 0)} |
| Projected catalog if merged alone | {PRODUCTION_TOTAL + len(ready)} |

## READY by brand

{chr(10).join(f'- {b}: {c}' for b, c in sorted(ready_brands.items(), key=lambda x: -x[1])) or '- (none)'}

## City coverage (keyword)

{chr(10).join(f'- {c}: {"yes" if city_hits.get(c) else "no"}' for c in major_cities)}

## Data quality (READY)

| Check | Count |
|-------|-------|
| Duplicate IDs | {len(dq['duplicate_ids'])} |
| Invalid postcodes | {len(dq['invalid_ready_postcodes'])} |
| Missing fields | {len(dq['missing_ready_fields'])} |
| Invalid coords | {len(dq['invalid_ready_coords'])} |
| Fallback coords | {len(dq['fallback_coords'])} |
| Foreign outliers | {len(dq['foreign_outliers'])} |
| Mojibake | {len(dq['mojibake'])} |

## Production collisions (<=50m)

{len(collisions)}

## Coverage notes

{chr(10).join(f'- **{k}**: {v}' for k, v in (notes or {}).items()) or '- (none)'}

## Verdict

**{verdict}**

Production `centers.json` was not modified.
"""
    report_md = report_json.with_suffix(".md")
    report_md.write_text(md)
    print(f"{country}: staged={len(rows)} ready={len(ready)} verdict={verdict}")
    return report
