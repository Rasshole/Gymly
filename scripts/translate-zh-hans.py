#!/usr/bin/env python3
"""EN→zh-Hans via MyMemory with placeholder/Gymly protection + glossary polish."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_PATH = ROOT / "scripts/out/global/zh-Hans.flat.json"
CHUNK_DIR = ROOT / "scripts/out/global/_zh_chunks"
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
}

# Phrase-level polish after MT (order matters: longer first)
GLOSSARY = [
    (r"准备好参加今天的课程了吗？", "准备好今天的训练了吗？"),
    (r"准备好今天的课程了吗？", "准备好今天的训练了吗？"),
    (r"课程", "训练"),  # session→课程 is common MT miss in fitness UI
    (r"签到入住", "签到"),
    (r"打卡", "签到"),
    (r"健身房会员", "Gymly 会员"),
    (r"Gymly会员", "Gymly 会员"),
]


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
        for variant in (f"XXPH{i}XX", f"xxph{i}xx", f"Xxph{i}xx", f"XXPH{i}xx"):
            out = out.replace(variant, tok)
    return out


def polish(s: str) -> str:
    out = s
    # Keep Gymly brand
    out = re.sub(r"(?i)\bgymly\b", "Gymly", out)
    for pat, rep in GLOSSARY:
        out = re.sub(pat, rep, out)
    # Re-fix Gymly after glossary
    out = re.sub(r"(?i)\bgymly\b", "Gymly", out)
    return out


def mymemory(text: str) -> str:
    if not text.strip():
        return text
    if text in ALLOW_IDENTICAL:
        return text
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": text[:450], "langpair": "en|zh-CN"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyGlobal/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.load(resp)
    translated = (data.get("responseData") or {}).get("translatedText") or text
    if "MYMEMORY WARNING" in translated.upper() or "QUOTA" in translated.upper():
        raise RuntimeError(translated)
    return translated


def load_overrides() -> dict[str, str]:
    overrides: dict[str, str] = {}
    if CHUNK_DIR.exists():
        for p in sorted(CHUNK_DIR.glob("zh_*.json")):
            overrides.update(json.loads(p.read_text()))
    return overrides


def main() -> None:
    en = json.loads(EN_PATH.read_text())
    keys = list(en.keys())
    overrides = load_overrides()
    result: dict[str, str] = {}
    if OUT_PATH.exists():
        result = json.loads(OUT_PATH.read_text())

    # Prefer curated overrides
    for k, v in overrides.items():
        if k in en:
            result[k] = v

    pending = [
        k
        for k in keys
        if k not in result
        or (
            k not in overrides
            and result[k] == en[k]
            and en[k] not in ALLOW_IDENTICAL
            and not en[k].startswith("http")
            and len(en[k]) > 2
        )
    ]
    print(f"zh-Hans: {len(result)} done, {len(pending)} pending, overrides={len(overrides)}", flush=True)

    for n, k in enumerate(pending):
        src = en[k]
        protected, toks = protect(src)
        for attempt in range(8):
            try:
                raw = mymemory(protected)
                result[k] = polish(restore(raw, toks))
                break
            except Exception as e:
                wait = 2 + attempt * 2
                print(f"  retry {k}: {e} sleep {wait}", flush=True)
                time.sleep(wait)
        else:
            result[k] = src

        if (n + 1) % 20 == 0:
            ordered = {kk: result.get(kk, en[kk]) for kk in keys if kk in result or kk in overrides}
            # write partial progress of what we have
            OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
            OUT_PATH.write_text(
                json.dumps({kk: result[kk] for kk in keys if kk in result}, ensure_ascii=False, indent=2)
                + "\n"
            )
            print(f"  zh-Hans: {len(result)}/{len(keys)}", flush=True)
        time.sleep(0.1)

    ordered = {k: result.get(k, en[k]) for k in keys}
    # Re-apply overrides on top
    for k, v in overrides.items():
        if k in ordered:
            ordered[k] = v
    OUT_PATH.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    same = sum(1 for k in keys if ordered[k] == en[k])
    print(f"zh-Hans: DONE {len(ordered)} identical={same}", flush=True)


if __name__ == "__main__":
    main()
