#!/usr/bin/env python3
"""Translate en.flat.json via MyMemory API with resume + placeholder protection."""
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
OUT_DIR = ROOT / "scripts/out/batch1"
PH = re.compile(r"\{\{(\w+)\}\}")

# MyMemory langpair targets
TARGETS = {
    "de": "de",
    "fr": "fr",
    "es": "es",
    "nl": "nl",
    "it": "it",
    "pl": "pl",
    "pt": "pt",
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
    # Skip pure symbols / OK / etc.
    if text in {"OK", "PR", "Gymly", "GPS", "ID"}:
        return text
    q = text
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": q[:450], "langpair": f"en|{target}"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyBatch1/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    translated = (data.get("responseData") or {}).get("translatedText") or text
    # MyMemory sometimes returns QUOTA EXCEEDED message
    if "MYMEMORY WARNING" in translated.upper() or "QUOTA" in translated.upper():
        raise RuntimeError(translated)
    return translated


def translate_locale(locale: str) -> None:
    target = TARGETS[locale]
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
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
            and en[k]
            not in {
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
            }
            and not en[k].startswith("http")
        )
    ]
    print(f"{locale}: {len(result)} done, {len(pending)} pending", flush=True)

    for n, k in enumerate(pending):
        src = en[k]
        protected, toks = protect(src)
        for attempt in range(6):
            try:
                raw = mymemory(protected, target)
                result[k] = restore(raw, toks)
                break
            except Exception as e:
                wait = 2 + attempt * 2
                print(f"  retry {k}: {e} sleep {wait}", flush=True)
                time.sleep(wait)
        else:
            result[k] = src  # last resort keep EN; gate will catch identical flood

        if (n + 1) % 25 == 0:
            out_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2) + "\n"
            )
            print(f"  {locale}: {len(result)}/{len(keys)}", flush=True)
        time.sleep(0.12)

    ordered = {k: result.get(k, en[k]) for k in keys}
    out_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    print(f"{locale}: DONE {len(ordered)}", flush=True)


def main() -> None:
    locales = sys.argv[1:] or list(TARGETS)
    for loc in locales:
        translate_locale(loc)


if __name__ == "__main__":
    main()
