#!/usr/bin/env python3
"""Build scripts/out/global/th.flat.json from EN chunks via MyMemory + Thai polish."""
from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

import translators as ts

ROOT = Path(__file__).resolve().parents[1]
EN_FLAT = ROOT / "scripts/out/batch1/en.flat.json"
EN_CHUNK_DIR = ROOT / "scripts/out/global/_en_chunks"
TH_CHUNK_DIR = ROOT / "scripts/out/global/_th_chunks"
OUT_PATH = ROOT / "scripts/out/global/th.flat.json"

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
    "Strava",
    "Instagram",
    "Garmin",
    "Fitbit",
    "Apple",
    "Google",
    "Facebook",
    "GDPR",
    "kg",
    "km",
    "lbs",
}

# Natural Thai mobile fitness copy tweaks (longest first).
GLOSSARY = [
    ("friend request", "คำขอเป็นเพื่อน"),
    ("Friend request", "คำขอเป็นเพื่อน"),
    ("Friend requests", "คำขอเป็นเพื่อน"),
    ("friend requests", "คำขอเป็นเพื่อน"),
    ("check-ins", "เช็คอิน"),
    ("Check-ins", "เช็คอิน"),
    ("check-in", "เช็คอิน"),
    ("Check-in", "เช็คอิน"),
    ("Check in", "เช็คอิน"),
    ("check in", "เช็คอิน"),
    ("leaderboard", "กระดานผู้นำ"),
    ("Leaderboard", "กระดานผู้นำ"),
    ("Leaderboards", "กระดานผู้นำ"),
    ("personal record", "สถิติส่วนตัว"),
    ("Personal record", "สถิติส่วนตัว"),
    ("personal records", "สถิติส่วนตัว"),
    ("Personal Records", "สถิติส่วนตัว"),
    ("workout", "เวิร์กเอาต์"),
    ("Workout", "เวิร์กเอาต์"),
    ("workouts", "เวิร์กเอาต์"),
    ("Workouts", "เวิร์กเอาต์"),
    ("training", "การฝึก"),
    ("Training", "การฝึก"),
    ("badge", "เหรียญ"),
    ("Badge", "เหรียญ"),
    ("badges", "เหรียญ"),
    ("Badges", "เหรียญ"),
    ("streak", "สตรีค"),
    ("Streak", "สตรีค"),
    ("profile", "โปรไฟล์"),
    ("Profile", "โปรไฟล์"),
    ("messages", "ข้อความ"),
    ("Messages", "ข้อความ"),
    ("notifications", "การแจ้งเตือน"),
    ("Notifications", "การแจ้งเตือน"),
    ("settings", "การตั้งค่า"),
    ("Settings", "การตั้งค่า"),
    ("username", "ชื่อผู้ใช้"),
    ("Username", "ชื่อผู้ใช้"),
    ("password", "รหัสผ่าน"),
    ("Password", "รหัสผ่าน"),
    ("Log in", "เข้าสู่ระบบ"),
    ("Log out", "ออกจากระบบ"),
    ("Sign up", "สมัครสมาชิก"),
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
    out = re.sub(r"\{\{\s*(\w+)\s*\}\}", r"{{\1}}", out)
    return out


def polish(en: str, th: str) -> str:
    out = th
    if "Gymly" not in out and "Gymly" in en:
        out = out.replace("ยิมลี่", "Gymly").replace("Gymly", "Gymly")
    for src, dst in GLOSSARY:
        if src in en and src in out:
            out = out.replace(src, dst)
    # Keep OK, PR when alone in EN
    if en.strip() == "OK":
        return "OK"
    return out


def machine_translate(text: str) -> str:
    if not text.strip():
        return text
    if text in ALLOW_IDENTICAL:
        return text
    if text.startswith("🇩🇰") or text.startswith("🇬🇧"):
        return text
    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(
            ts.translate_text,
            text[:4500],
            translator="bing",
            from_language="en",
            to_language="th",
        )
        return fut.result(timeout=45)


def translate_value(en_val: str) -> str:
    if en_val in ALLOW_IDENTICAL:
        return en_val
    if en_val.startswith("🇩🇰") or en_val.startswith("🇬🇧"):
        return en_val
    protected, toks = protect(en_val)
    for attempt in range(12):
        try:
            raw = machine_translate(protected)
            return polish(en_val, restore(raw, toks))
        except (FuturesTimeout, Exception) as e:
            if attempt == 11:
                print(f"    translate fail after retries: {e!r}", flush=True)
            time.sleep(1 + attempt * 2)
    return en_val


def translate_chunk(
    en_chunk: dict[str, str],
    existing: dict[str, str] | None = None,
    th_path: Path | None = None,
) -> dict[str, str]:
    out: dict[str, str] = dict(existing or {})
    keys = list(en_chunk.keys())
    for i, k in enumerate(keys):
        if k in out and (
            out[k] != en_chunk[k] or en_chunk[k] in ALLOW_IDENTICAL
        ):
            continue
        out[k] = translate_value(en_chunk[k])
        if (i + 1) % 10 == 0:
            print(f"    … {i + 1}/{len(keys)}", flush=True)
            if th_path:
                th_path.write_text(
                    json.dumps(out, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
        time.sleep(0.25)
    return out


def main() -> None:
    en_master = json.loads(EN_FLAT.read_text(encoding="utf-8"))
    master_keys = list(en_master.keys())
    TH_CHUNK_DIR.mkdir(parents=True, exist_ok=True)

    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    merged: dict[str, str] = {}
    for n in range(0, start):
        th_path = TH_CHUNK_DIR / f"chunk_{n:02d}.json"
        if th_path.exists():
            merged.update(json.loads(th_path.read_text(encoding="utf-8")))
    for n in range(start, 8):
        en_path = EN_CHUNK_DIR / f"chunk_{n:02d}.json"
        th_path = TH_CHUNK_DIR / f"chunk_{n:02d}.json"
        en_chunk = json.loads(en_path.read_text(encoding="utf-8"))
        partial: dict[str, str] = {}
        if th_path.exists():
            partial = json.loads(th_path.read_text(encoding="utf-8"))
        complete = set(partial.keys()) == set(en_chunk.keys()) and all(
            partial[k] != en_chunk[k] or en_chunk[k] in ALLOW_IDENTICAL
            for k in en_chunk
        )
        if complete:
            print(f"chunk_{n:02d}: resume skip (complete)", flush=True)
            th_chunk = partial
        else:
            print(f"chunk_{n:02d}: translate ({len(partial)} partial)", flush=True)
            th_chunk = translate_chunk(en_chunk, partial, th_path)
        th_path.write_text(
            json.dumps(th_chunk, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        merged.update(th_chunk)
        print(f"chunk_{n:02d}: wrote {len(th_chunk)} keys", flush=True)

    ordered = {k: merged[k] for k in master_keys}
    missing = [k for k in master_keys if k not in merged]
    if missing:
        print(f"Filling {len(missing)} missing from master…", flush=True)
        for k in missing:
            ordered[k] = translate_value(en_master[k])
        merged.update(ordered)

    OUT_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    ph_bad = []
    gymly_bad = []
    for k in master_keys:
        en_ph = sorted(PH.findall(en_master[k]))
        th_ph = sorted(PH.findall(ordered[k]))
        if en_ph != th_ph:
            ph_bad.append(k)
        if "Gymly" in en_master[k] and "Gymly" not in ordered[k]:
            gymly_bad.append(k)

    identical = sum(
        1
        for k in master_keys
        if ordered[k] == en_master[k]
        and en_master[k] not in ALLOW_IDENTICAL
        and len(en_master[k]) > 2
        and not en_master[k].startswith("🇩🇰")
        and not en_master[k].startswith("🇬🇧")
    )
    print(
        f"DONE keys={len(ordered)} missing={len(missing)} "
        f"ph_bad={len(ph_bad)} gymly_bad={len(gymly_bad)} identical={identical}",
        flush=True,
    )
    if len(ordered) != 2077 or list(ordered.keys()) != master_keys:
        raise SystemExit("Key count or order mismatch")
    if ph_bad:
        print("Placeholder mismatches:", ph_bad[:10], flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
