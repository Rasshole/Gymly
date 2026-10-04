#!/usr/bin/env python3
"""EN→JA flat catalog via MyMemory + glossary polish for Gymly UI."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN_PATH = ROOT / "scripts/out/batch1/en.flat.json"
OUT_PATH = ROOT / "scripts/out/global/ja.flat.json"
LOG_PATH = ROOT / "scripts/out/global/logs/ja.log"

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
    "Wi-Fi",
    "wifi",
    "URL",
    "API",
}

# Post-MT phrase polish for natural mobile fitness JP (apply longest-first).
GLOSSARY = [
    ("friend request", "友達リクエスト"),
    ("Friend request", "友達リクエスト"),
    ("Friend requests", "友達リクエスト"),
    ("friend requests", "友達リクエスト"),
    ("check-ins", "チェックイン"),
    ("Check-ins", "チェックイン"),
    ("check-in", "チェックイン"),
    ("Check-in", "チェックイン"),
    ("Check in", "チェックイン"),
    ("check in", "チェックイン"),
    ("leaderboard", "リーダーボード"),
    ("Leaderboard", "リーダーボード"),
    ("personal record", "自己ベスト"),
    ("Personal record", "自己ベスト"),
    ("personal records", "自己ベスト"),
    ("workout", "ワークアウト"),
    ("Workout", "ワークアウト"),
    ("workouts", "ワークアウト"),
    ("Workouts", "ワークアウト"),
    ("training", "トレーニング"),
    ("Training", "トレーニング"),
    ("badge", "バッジ"),
    ("Badge", "バッジ"),
    ("badges", "バッジ"),
    ("Badges", "バッジ"),
    ("streak", "ストリーク"),
    ("Streak", "ストリーク"),
    ("profile", "プロフィール"),
    ("Profile", "プロフィール"),
    ("messages", "メッセージ"),
    ("Messages", "メッセージ"),
    ("notifications", "通知"),
    ("Notifications", "通知"),
    ("settings", "設定"),
    ("Settings", "設定"),
    ("username", "ユーザー名"),
    ("Username", "ユーザー名"),
    ("password", "パスワード"),
    ("Password", "パスワード"),
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
    out = (
        s.replace("XXGYMLYXX", "Gymly")
        .replace("Xxgymlyxx", "Gymly")
        .replace("xxgymlyxx", "Gymly")
    )
    for i, tok in enumerate(toks):
        for variant in (
            f"XXPH{i}XX",
            f"xxph{i}xx",
            f"Xxph{i}xx",
            f"XXPH{i}xx",
            f"xxPH{i}XX",
        ):
            out = out.replace(variant, tok)
    # Fix spaced placeholders MyMemory sometimes inserts
    out = re.sub(r"\{\{\s*(\w+)\s*\}\}", r"{{\1}}", out)
    return out


def polish(en: str, ja: str) -> str:
    """Light glossary only when EN token survived untranslated in JA."""
    out = ja
    # Prefer keeping Latin brand/tech tokens already correct
    if "Gymly" not in out and "Gymly" in en:
        out = out.replace("ジムリー", "Gymly").replace("ギムリー", "Gymly")
    return out


def mymemory(text: str) -> str:
    if not text.strip():
        return text
    if text in ALLOW_IDENTICAL:
        return text
    # Keep language option labels (emoji + native name)
    if text.startswith("🇩🇰") or text.startswith("🇬🇧"):
        return text
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": text[:450], "langpair": "en|ja"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "GymlyJA/1.1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    translated = (data.get("responseData") or {}).get("translatedText") or text
    if "MYMEMORY WARNING" in translated.upper() or "QUOTA" in translated.upper():
        raise RuntimeError(translated)
    # HTML entity unescape light
    translated = (
        translated.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return translated


def log(msg: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    line = msg + "\n"
    print(msg, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line)


def main() -> None:
    en = json.loads(EN_PATH.read_text(encoding="utf-8"))
    keys = list(en.keys())
    result: dict[str, str] = {}
    if OUT_PATH.exists():
        result = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    pending = [
        k
        for k in keys
        if k not in result
        or (
            result[k] == en[k]
            and en[k] not in ALLOW_IDENTICAL
            and not en[k].startswith("http")
            and not en[k].startswith("🇩🇰")
            and not en[k].startswith("🇬🇧")
            and len(en[k]) > 2
        )
    ]
    log(f"ja: {len(result)} done, {len(pending)} pending / {len(keys)}")

    for n, k in enumerate(pending):
        src = en[k]
        protected, toks = protect(src)
        translated = src
        for attempt in range(10):
            try:
                raw = mymemory(protected)
                translated = polish(src, restore(raw, toks))
                break
            except Exception as e:
                wait = 2 + attempt * 3
                log(f"  retry {k}: {e} sleep {wait}")
                time.sleep(wait)
        else:
            translated = src
            log(f"  FALLBACK keep EN: {k}")

        result[k] = translated

        if (n + 1) % 15 == 0 or (n + 1) == len(pending):
            ordered = {kk: result.get(kk, en[kk]) for kk in keys if kk in result}
            OUT_PATH.write_text(
                json.dumps(ordered, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            log(f"  ja: {len(result)}/{len(keys)}")
        time.sleep(0.15)

    ordered = {k: result.get(k, en[k]) for k in keys}
    OUT_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Validate
    missing = [k for k in keys if k not in ordered]
    extra = [k for k in ordered if k not in en]
    ph_bad = []
    for k in keys:
        en_ph = sorted(PH.findall(en[k]))
        ja_ph = sorted(PH.findall(ordered[k]))
        if en_ph != ja_ph:
            ph_bad.append((k, en_ph, ja_ph, ordered[k]))
    identical = sum(
        1
        for k in keys
        if ordered[k] == en[k] and en[k] not in ALLOW_IDENTICAL and len(en[k]) > 2
    )
    log(
        f"ja: DONE keys={len(ordered)} missing={len(missing)} extra={len(extra)} "
        f"ph_bad={len(ph_bad)} identical_nonallow={identical}"
    )
    if missing or extra or ph_bad:
        for item in ph_bad[:20]:
            log(f"  PH {item}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
