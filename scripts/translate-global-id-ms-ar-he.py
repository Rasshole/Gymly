#!/usr/bin/env python3
"""
Translate EN flat → id/ms/ar/he into scripts/out/global/.
Primary: MyMemory (deep_translator). Fallback: Google.
Unique-value cache. Does NOT activate/mark-ready any locale.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator, MyMemoryTranslator
from deep_translator.exceptions import TooManyRequests

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_DIR = ROOT / "scripts/out/global"

PH = re.compile(r"\{\{(\w+)\}\}")

# locale → (mymemory target, google target)
TARGETS = {
    "id": ("id-ID", "id"),
    "ms": ("ms-MY", "ms"),
    "ar": ("ar-SA", "ar"),
    "he": ("he-IL", "iw"),
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
    out = (s or "").replace("XXGYMLYXX", "Gymly").replace("Xxgymlyxx", "Gymly")
    out = out.replace("xxgymlyxx", "Gymly")
    for i, tok in enumerate(toks):
        for variant in (
            f"XXPH{i}XX",
            f"xxph{i}xx",
            f"Xxph{i}xx",
            f"XXPH{i}xx",
            f"⟦{i}⟧",
            f"[[{i}]]",
            f"[{i}]",
        ):
            out = out.replace(variant, tok)
    out = re.sub(r"\bgymly\b", "Gymly", out, flags=re.I)
    out = re.sub(r"\{\{\s*(\w+)\s*\}\}", r"{{\1}}", out)
    # MyMemory sometimes inserts spaces around hyphen near Gymly
    out = re.sub(r"\s*-\s*Gymly", " Gymly", out)
    out = re.sub(r"Gymly\s*-\s*", "Gymly ", out)
    return out.strip() if s and s.strip() == s.strip() else out


def translate_one(
    text: str,
    mm: MyMemoryTranslator,
    google: GoogleTranslator,
) -> str:
    if not text.strip():
        return text
    if text in ALLOW_IDENTICAL:
        return text
    if text.startswith("http"):
        return text

    protected, toks = protect(text)

    for attempt in range(8):
        try:
            raw = mm.translate(protected)
            if raw and "MYMEMORY WARNING" not in raw.upper() and "QUOTA" not in raw.upper():
                return restore(raw, toks)
            raise RuntimeError(raw or "empty")
        except Exception as e:
            wait = 1.5 + attempt * 1.5
            print(f"    mm err {e!r} sleep {wait}s", flush=True)
            time.sleep(wait)

    for attempt in range(8):
        try:
            raw = google.translate(protected)
            return restore(raw or text, toks)
        except TooManyRequests as e:
            wait = 5 + attempt * 3
            print(f"    google RL sleep {wait}s", flush=True)
            time.sleep(wait)
        except Exception as e:
            wait = 2 + attempt
            print(f"    google err {e!r} sleep {wait}s", flush=True)
            time.sleep(wait)

    print("    FALLBACK EN", flush=True)
    return text


def needs_retranslate(src: str, cur: str) -> bool:
    if not cur:
        return True
    if cur == src:
        if src in ALLOW_IDENTICAL or src.startswith("http") or len(src) <= 2:
            return False
        return True
    return False


def translate_locale(locale: str) -> None:
    mm_target, g_target = TARGETS[locale]
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{locale}.flat.json"
    cache_path = OUT_DIR / f"_{locale}_value_cache.json"

    result: dict[str, str] = {}
    if out_path.exists():
        result = json.loads(out_path.read_text())

    value_cache: dict[str, str] = {}
    if cache_path.exists():
        value_cache = json.loads(cache_path.read_text())

    mm = MyMemoryTranslator(source="en-GB", target=mm_target)
    google = GoogleTranslator(source="en", target=g_target)

    pending_keys = [
        k for k in keys if k not in result or needs_retranslate(en[k], result.get(k, ""))
    ]
    print(
        f"{locale}: {len(result)} present, {len(pending_keys)} pending → {mm_target}",
        flush=True,
    )

    for n, k in enumerate(pending_keys, 1):
        src = en[k]
        if src in value_cache and not needs_retranslate(src, value_cache[src]):
            result[k] = value_cache[src]
        else:
            translated = translate_one(src, mm, google)
            value_cache[src] = translated
            result[k] = translated
            time.sleep(0.12)

        if n % 40 == 0 or n == len(pending_keys):
            out_path.write_text(
                json.dumps({kk: result[kk] for kk in keys if kk in result}, ensure_ascii=False, indent=2)
                + "\n"
            )
            cache_path.write_text(json.dumps(value_cache, ensure_ascii=False, indent=2) + "\n")
            print(f"  {locale}: {n}/{len(pending_keys)} keys={len(result)}", flush=True)

    ordered = {k: result.get(k, en[k]) for k in keys}
    out_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    cache_path.write_text(json.dumps(value_cache, ensure_ascii=False, indent=2) + "\n")
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
