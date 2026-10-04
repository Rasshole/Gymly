#!/usr/bin/env python3
"""Translate en.flat.json → scripts/out/global/{locale}.flat.json via Google (deep_translator)."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator
from deep_translator.exceptions import TooManyRequests

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_DIR = ROOT / "scripts/out/global"

PH = re.compile(r"\{\{(\w+)\}\}")

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
    "🇩🇰 Dansk",
    "🇬🇧 English",
}

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


def protect(s: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def repl(m: re.Match) -> str:
        tokens.append(m.group(0))
        return f"⟦{len(tokens) - 1}⟧"

    return PH.sub(repl, s), tokens


def restore(s: str, tokens: list[str]) -> str:
    out = s
    for i, tok in enumerate(tokens):
        for variant in (f"⟦{i}⟧", f"[[{i}]]", f"[{i}]"):
            out = out.replace(variant, tok)
    out = re.sub(r"\bgymly\b", "Gymly", out, flags=re.I)
    return out


def translate_locale(locale: str, target: str, batch_size: int = 25) -> None:
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{locale}.flat.json"
    result: dict[str, str] = {}
    if out_path.exists():
        result = json.loads(out_path.read_text())
        print(f"{locale}: resume with {len(result)} existing", flush=True)

    # Merge any LLM chunk files
    chunk_dir = OUT_DIR / f"_{locale}_chunks"
    if chunk_dir.exists():
        for p in sorted(chunk_dir.glob(f"{locale}_*.json")):
            part = json.loads(p.read_text())
            result.update(part)
            print(f"  merged {p.name} (+{len(part)}) → {len(result)}", flush=True)

    translator = GoogleTranslator(source="en", target=target)
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
    print(f"{locale}: translating {len(pending)} / {len(keys)}", flush=True)

    i = 0
    while i < len(pending):
        chunk_keys = pending[i : i + batch_size]
        protected = []
        token_lists = []
        for k in chunk_keys:
            p, toks = protect(en[k])
            p = p.replace("Gymly", "⟦GYMLY⟧")
            protected.append(p)
            token_lists.append(toks)

        for attempt in range(12):
            try:
                translated = translator.translate_batch(protected)
                if not isinstance(translated, list) or len(translated) != len(protected):
                    translated = []
                    for p in protected:
                        translated.append(translator.translate(p))
                        time.sleep(0.25)
                break
            except TooManyRequests:
                wait = 8 + attempt * 4
                print(f"  rate limit, sleep {wait}s", flush=True)
                time.sleep(wait)
            except Exception as e:
                wait = 3 + attempt * 2
                print(f"  error {e!r}, sleep {wait}s", flush=True)
                time.sleep(wait)
        else:
            # fall back one-by-one with long sleeps
            translated = []
            for p in protected:
                for attempt in range(8):
                    try:
                        translated.append(translator.translate(p))
                        break
                    except Exception as e:
                        wait = 5 + attempt * 3
                        print(f"  single fail {e!r}, sleep {wait}s", flush=True)
                        time.sleep(wait)
                else:
                    translated.append(p)
                time.sleep(0.5)

        for k, raw, toks in zip(chunk_keys, translated, token_lists):
            text = (raw or en[k]).replace("⟦GYMLY⟧", "Gymly").replace("[GYMLY]", "Gymly")
            result[k] = restore(text, toks)

        i += batch_size
        ordered_partial = {k: result[k] for k in keys if k in result}
        out_path.write_text(
            json.dumps(ordered_partial, ensure_ascii=False, indent=2) + "\n"
        )
        print(f"  {locale}: {len(result)}/{len(keys)}", flush=True)
        time.sleep(1.5)

    ordered = {k: result.get(k, en[k]) for k in keys}
    out_path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    same = sum(1 for k in keys if ordered[k] == en[k])
    print(f"{locale}: DONE {len(ordered)} identical={same}", flush=True)


def main() -> None:
    locales = sys.argv[1:] or ["cs"]
    for loc in locales:
        if loc not in TARGETS:
            raise SystemExit(f"Unknown locale {loc}")
        translate_locale(loc, TARGETS[loc])


if __name__ == "__main__":
    main()
