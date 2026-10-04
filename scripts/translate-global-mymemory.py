#!/usr/bin/env python3
"""Translate en.flat.json via MyMemory API — global expansion locales."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_DIR = ROOT / "scripts/out/global"
PH = re.compile(r"\{\{(\w+)\}\}")

# Gymly locale id → MyMemory target
TARGETS = {
    "fi": "fi",
    "cs": "cs",
    "ro": "ro",
    "hu": "hu",
    "el": "el",
    "tr": "tr",
    "uk": "uk",
    "ja": "ja",
    "ko": "ko",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-TW",
    "hi": "hi",
    "id": "id",
    "ms": "ms",
    "vi": "vi",
    "th": "th",
    "ar": "ar",
    "he": "he",
}

ALLOW_IDENTICAL = {
    "OK",
    "PR",
    "Gymly",
    "GPS",
    "ID",
    "DM",
    "Email",
    "iOS",
    "Android",
    "Shopify",
    "Cardio",
    "Pilates",
    "Reformer",
    "Biceps",
    "Triceps",
}


def protect(s: str) -> tuple[str, list[str]]:
    toks: list[str] = []

    def repl(m: re.Match) -> str:
        toks.append(m.group(0))
        return f"XXPH{len(toks) - 1}XX"

    s2 = PH.sub(repl, s)
    s2 = s2.replace("Gymly", "XXGYMLYXX")
    return s2, toks


def restore(s: str, toks: list[str]) -> str:
    out = s.replace("XXGYMLYXX", "Gymly").replace("Xxgymlyxx", "Gymly")
    for i, tok in enumerate(toks):
        for variant in (f"XXPH{i}XX", f"xxph{i}xx", f"Xxph{i}xx"):
            out = out.replace(variant, tok)
    return out


def mymemory(text: str, target: str) -> str:
    if not text.strip():
        return text
    if text in ALLOW_IDENTICAL:
        return text
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": text[:450], "langpair": f"en|{target}"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyGlobal/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.load(resp)
    translated = (data.get("responseData") or {}).get("translatedText") or text
    if "MYMEMORY WARNING" in translated.upper() or "QUOTA" in translated.upper():
        raise RuntimeError(translated)
    return translated


def translate_locale(locale: str) -> None:
    target = TARGETS[locale]
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{locale}.flat.json"
    result: dict[str, str] = {}
    if out_path.exists():
        result = json.loads(out_path.read_text())

    pending = [
        k
        for k in keys
        if k not in result
        or (
            result[k] == en[k]
            and en[k] not in ALLOW_IDENTICAL
            and not en[k].startswith("http")
            and len(en[k]) > 2
        )
    ]
    print(f"{locale}: {len(result)} done, {len(pending)} pending → {target}", flush=True)

    for n, k in enumerate(pending):
        src = en[k]
        protected, toks = protect(src)
        for attempt in range(8):
            try:
                raw = mymemory(protected, target)
                result[k] = restore(raw, toks)
                break
            except Exception as e:
                wait = 2 + attempt * 2
                print(f"  retry {locale}/{k}: {e} sleep {wait}", flush=True)
                time.sleep(wait)
        else:
            result[k] = src

        if (n + 1) % 20 == 0:
            out_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2) + "\n"
            )
            print(f"  {locale}: {len(result)}/{len(keys)}", flush=True)
        time.sleep(0.1)

    ordered = {k: result.get(k, en[k]) for k in keys}
    out_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    same = sum(1 for k in keys if ordered[k] == en[k])
    print(f"{locale}: DONE {len(ordered)} identical={same}", flush=True)


def main() -> None:
    locales = sys.argv[1:] or list(TARGETS)
    for loc in locales:
        if loc not in TARGETS:
            raise SystemExit(f"Unknown locale {loc}")
        translate_locale(loc)


if __name__ == "__main__":
    main()
