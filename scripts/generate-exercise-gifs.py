#!/usr/bin/env python3
"""
Build 2-frame animated GIFs from yuhonas/free-exercise-db (CC0) JPEG pairs.

Output: api/public/gifs/<ext_id>.gif (served at GET /exerciseGif?id=<ext_id>)

Requires: Python 3.9+, Pillow (`pip install Pillow`)

Usage:
  python3 scripts/generate-exercise-gifs.py              # all exercises
  python3 scripts/generate-exercise-gifs.py --id Air_Bike
  python3 scripts/generate-exercise-gifs.py --limit 10     # smoke test
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DIST = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
OUT_DIR = ROOT / "api" / "public" / "gifs"
DEFAULT_SIZE = 480
DEFAULT_DELAY_MS = 600


def fetch_bytes(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return resp.read()
    except Exception:
        return None


def make_gif(ex_id: str, images: list[str], size: int, delay_ms: int) -> bool:
    frames: list[Image.Image] = []
    for rel in images[:2]:
        if not rel:
            continue
        url = rel if rel.startswith("http") else f"{IMG_BASE}{rel}"
        raw = fetch_bytes(url)
        if not raw:
            continue
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((size, size), Image.Resampling.LANCZOS)
        frames.append(img)

    if not frames:
        return False

    out = OUT_DIR / f"{ex_id}.gif"
    delay_cs = max(1, delay_ms // 10)
    if len(frames) == 1:
        frames[0].save(out, save_all=False, optimize=True, loop=0)
    else:
        frames[0].save(
            out,
            save_all=True,
            append_images=frames[1:],
            duration=delay_cs,
            loop=0,
            optimize=True,
        )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate exercise GIFs for Anatome API")
    parser.add_argument("--id", help="Single exercise ext_id only")
    parser.add_argument("--limit", type=int, default=0, help="Max exercises (0 = all)")
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE)
    parser.add_argument("--delay-ms", type=int, default=DEFAULT_DELAY_MS)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(DIST, timeout=60) as resp:
        exercises = json.load(resp)

    if args.id:
        exercises = [e for e in exercises if e.get("id") == args.id]
        if not exercises:
            print(f"No exercise with id={args.id!r}", file=sys.stderr)
            return 1

    ok = skip = 0
    for i, ex in enumerate(exercises):
        if args.limit and i >= args.limit:
            break
        ex_id = ex.get("id")
        images = ex.get("images") or []
        if not ex_id or not images:
            skip += 1
            continue
        dest = OUT_DIR / f"{ex_id}.gif"
        if dest.exists() and not args.id:
            ok += 1
            continue
        if make_gif(ex_id, images, args.size, args.delay_ms):
            ok += 1
            print(f"✓ {ex_id}")
        else:
            skip += 1
            print(f"✗ {ex_id} (no frames)", file=sys.stderr)

    print(f"Done: {ok} gif(s) in {OUT_DIR}, {skip} skipped")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
