#!/usr/bin/env python3
"""Finish a locale by translating unique pending EN values (cache-aware)."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator
from deep_translator.exceptions import TooManyRequests

try:
    import translators as ts
except Exception:
    ts = None

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_DIR = ROOT / "scripts/out/global"

PH = re.compile(r"\{\{(\w+)\}\}")
ALLOW = {
    "OK", "PR", "Gymly", "GPS", "ID", "DM", "Email", "iOS", "Android",
    "Shopify", "Cardio", "Pilates", "Reformer", "Biceps", "Triceps",
}
GOOGLE_TARGET = {"hi": "hi", "vi": "vi", "th": "th"}


def protect(s: str) -> tuple[str, list[str]]:
    toks: list[str] = []

    def repl(m: re.Match) -> str:
        toks.append(m.group(0))
        return f"XXPH{len(toks) - 1}XX"

    return PH.sub(repl, s).replace("Gymly", "XXGYMLYXX"), toks


def restore(s: str, toks: list[str], src: str) -> str:
    out = (s or src).replace("XXGYMLYXX", "Gymly").replace("Xxgymlyxx", "Gymly")
    for bad in ("जिमली", "जिम्ली", "Gymli", "ยิมลี่", "ยิมลี"):
        out = out.replace(bad, "Gymly")
    for i, tok in enumerate(toks):
        for variant in (f"XXPH{i}XX", f"xxph{i}xx", f"Xxph{i}xx", f"XXPH{i}xx"):
            out = out.replace(variant, tok)
    out = re.sub(r"\bgymly\b", "Gymly", out, flags=re.I)
    out = re.sub(r"\{\{\s*(\w+)\s*\}\}", r"{{\1}}", out)
    if PH.findall(src) != PH.findall(out):
        return src
    if "Gymly" in src and "Gymly" not in out:
        return src
    return out


def is_good(src: str, cur: str | None) -> bool:
    if cur is None or not str(cur).strip():
        return False
    if PH.findall(src) != PH.findall(cur):
        return False
    if "Gymly" in src and "Gymly" not in cur:
        return False
    if cur == src:
        return src in ALLOW or src.startswith("http") or len(src) <= 2
    return True


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        d = json.loads(path.read_text())
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def gather(locale: str, en: dict[str, str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for p in sorted((OUT_DIR / f"_{locale}_chunks").glob("chunk_*.json")):
        for k, v in load(p).items():
            if k in en and is_good(en[k], v):
                result[k] = v
    for k, v in load(OUT_DIR / f"{locale}.flat.json").items():
        if k in en and is_good(en[k], v):
            # prefer non-identical
            if k not in result or result[k] == en[k] and v != en[k]:
                result[k] = v
            elif k not in result:
                result[k] = v
    return result


def translate_value(text: str, target: str, gt: GoogleTranslator) -> str:
    protected, toks = protect(text)
    last: Exception | None = None
    for attempt in range(8):
        try:
            raw = gt.translate(protected)
            return restore(raw, toks, text)
        except TooManyRequests as e:
            last = e
            time.sleep(5 + attempt * 4)
        except Exception as e:
            last = e
            time.sleep(1.5 + attempt)
    if ts is not None:
        for attempt in range(5):
            try:
                raw = ts.translate_text(
                    protected,
                    translator="google",
                    from_language="en",
                    to_language=target,
                )
                return restore(raw, toks, text)
            except Exception as e:
                last = e
                time.sleep(2 + attempt * 2)
    print(f"  FAIL keep EN: {text[:60]!r} ({last!r})", flush=True)
    return text


def finish(locale: str) -> None:
    target = GOOGLE_TARGET[locale]
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    result = gather(locale, en)
    cache_path = OUT_DIR / f"_{locale}_chunks" / ".unique_cache.json"
    cache = load(cache_path)
    # seed cache from good results
    for k, v in result.items():
        if is_good(en[k], v) and v != en[k]:
            cache.setdefault(en[k], v)

    pending_vals: list[str] = []
    seen = set()
    for k in keys:
        src = en[k]
        if src in ALLOW or src.startswith("http") or len(src) <= 2:
            result.setdefault(k, src)
            continue
        if is_good(src, result.get(k)):
            continue
        if src in cache and is_good(src, cache[src]):
            result[k] = cache[src]
            continue
        if src not in seen:
            seen.add(src)
            pending_vals.append(src)

    print(f"{locale}: have_good≈{sum(1 for k in keys if is_good(en[k], result.get(k)))} unique_pending={len(pending_vals)}", flush=True)
    gt = GoogleTranslator(source="en", target=target)

    for n, src in enumerate(pending_vals, 1):
        if src in cache and is_good(src, cache[src]):
            continue
        translated = translate_value(src, target, gt)
        if is_good(src, translated) and translated != src:
            cache[src] = translated
        else:
            cache[src] = translated  # may be EN fallback
        if n % 25 == 0 or n == len(pending_vals):
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")
            # apply cache to result and checkpoint flat
            for k in keys:
                src_k = en[k]
                if not is_good(src_k, result.get(k)) and src_k in cache:
                    result[k] = cache[src_k]
            ordered = {k: result.get(k, en[k]) for k in keys}
            (OUT_DIR / f"{locale}.flat.json").write_text(
                json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"
            )
            good = sum(1 for k in keys if is_good(en[k], ordered[k]) and ordered[k] != en[k])
            print(f"  {locale}: {n}/{len(pending_vals)} good={good}", flush=True)
        time.sleep(0.35)

    for k in keys:
        src = en[k]
        if not is_good(src, result.get(k)):
            result[k] = cache.get(src, result.get(k, src))
        if src in ALLOW or src.startswith("http") or len(src) <= 2:
            result[k] = src

    ordered = {k: result.get(k, en[k]) for k in keys}
    (OUT_DIR / f"{locale}.flat.json").write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"
    )
    # write chunks
    chunk_dir = OUT_DIR / f"_{locale}_chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    for en_path in sorted((OUT_DIR / "_en_chunks").glob("chunk_*.json")):
        en_c = load(en_path)
        (chunk_dir / en_path.name).write_text(
            json.dumps({k: ordered[k] for k in en_c}, ensure_ascii=False, indent=2) + "\n"
        )
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")
    good = sum(1 for k in keys if is_good(en[k], ordered[k]) and ordered[k] != en[k])
    same = sum(1 for k in keys if ordered[k] == en[k])
    ph_bad = sum(1 for k in keys if PH.findall(en[k]) != PH.findall(ordered[k]))
    print(f"{locale}: DONE keys={len(ordered)} good={good} identical={same} ph_bad={ph_bad}", flush=True)


if __name__ == "__main__":
    locs = sys.argv[1:] or ["hi", "th"]
    for loc in locs:
        finish(loc)
