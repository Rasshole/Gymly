#!/usr/bin/env python3
"""
Translate en.flat.json → {locale}.flat.json with placeholder protection.
Uses deep_translator GoogleTranslator with retries + batching.
"""
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
OUT_DIR = ROOT / "scripts/out/batch1"

PH = re.compile(r"\{\{(\w+)\}\}")


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
    # Ensure Gymly casing
    out = re.sub(r"\bgymly\b", "Gymly", out, flags=re.I)
    return out


def translate_locale(locale: str, target: str, batch_size: int = 40) -> None:
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    out_path = OUT_DIR / f"{locale}.flat.json"
    existing: dict[str, str] = {}
    if out_path.exists():
        existing = json.loads(out_path.read_text())
        print(f"{locale}: resume with {len(existing)} existing")

    translator = GoogleTranslator(source="en", target=target)
    result = dict(existing)

    pending = [k for k in keys if k not in result or not result[k]]
    print(f"{locale}: translating {len(pending)} / {len(keys)}")

    i = 0
    while i < len(pending):
        chunk_keys = pending[i : i + batch_size]
        protected = []
        token_lists = []
        for k in chunk_keys:
            p, toks = protect(en[k])
            # Keep Gymly stable
            p = p.replace("Gymly", "⟦GYMLY⟧")
            protected.append(p)
            token_lists.append(toks)

        for attempt in range(8):
            try:
                translated = translator.translate_batch(protected)
                if not isinstance(translated, list) or len(translated) != len(protected):
                    # fallback one-by-one
                    translated = []
                    for p in protected:
                        translated.append(translator.translate(p))
                        time.sleep(0.15)
                break
            except TooManyRequests:
                wait = 3 + attempt * 2
                print(f"  rate limit, sleep {wait}s")
                time.sleep(wait)
            except Exception as e:
                wait = 2 + attempt
                print(f"  error {e!r}, sleep {wait}s")
                time.sleep(wait)
        else:
            raise RuntimeError(f"Failed batch at {i}")

        for k, raw, toks in zip(chunk_keys, translated, token_lists):
            text = (raw or en[k]).replace("⟦GYMLY⟧", "Gymly").replace("[GYMLY]", "Gymly")
            result[k] = restore(text, toks)

        i += batch_size
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(f"  {locale}: {len(result)}/{len(keys)}")
        time.sleep(0.8)

    # Ensure full key set
    missing = [k for k in keys if k not in result]
    if missing:
        raise SystemExit(f"{locale} missing {len(missing)} keys e.g. {missing[:5]}")
    out_path.write_text(json.dumps({k: result[k] for k in keys}, ensure_ascii=False, indent=2) + "\n")
    print(f"{locale}: DONE {len(keys)}")


def main() -> None:
    # locale_id -> google target code
    mapping = {
        "de": "de",
        "fr": "fr",
        "es": "es",
        "nl": "nl",
        "it": "it",
        "pl": "pl",
        "pt": "pt",
    }
    locales = sys.argv[1:] or list(mapping)
    for loc in locales:
        translate_locale(loc, mapping[loc])


if __name__ == "__main__":
    main()
