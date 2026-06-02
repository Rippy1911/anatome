#!/usr/bin/env python3
"""
Build 2-frame animated GIFs from yuhonas/free-exercise-db (CC0) JPEG pairs.

Output: api/public/gifs/<ext_id>.gif (served at GET /exerciseGif?id=<ext_id>)

Requires: Python 3.9+, Pillow (`pip install Pillow`)

Usage:
  python3 scripts/generate-exercise-gifs.py              # all exercises
  python3 scripts/generate-exercise-gifs.py --id Air_Bike
  python3 scripts/generate-exercise-gifs.py --limit 10     # smoke test
  python3 scripts/generate-exercise-gifs.py --retime     # fix speed on existing GIFs
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
# Per-frame hold in ms (Pillow `duration` is milliseconds, not centiseconds).
DEFAULT_DELAY_MS = 900


def fetch_bytes(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return resp.read()
    except Exception:
        return None


def retime_gif(path: Path, delay_ms: int) -> bool:
    """Re-save an existing GIF with a new per-frame duration (no re-download)."""
    try:
        im = Image.open(path)
    except Exception:
        return False
    frames: list[Image.Image] = []
    try:
        while True:
            frames.append(im.copy().convert("RGB"))
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    if not frames:
        return False
    duration_ms = max(50, delay_ms)
    if len(frames) == 1:
        frames[0].save(path, save_all=False, optimize=True, loop=0)
    else:
        frames[0].save(
            path,
            save_all=True,
            append_images=frames[1:],
            duration=duration_ms,
            loop=0,
            optimize=True,
        )
    return True


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
    duration_ms = max(50, delay_ms)
    if len(frames) == 1:
        frames[0].save(out, save_all=False, optimize=True, loop=0)
    else:
        frames[0].save(
            out,
            save_all=True,
            append_images=frames[1:],
            duration=duration_ms,
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
    parser.add_argument("--force", action="store_true", help="Rebuild even if .gif already exists")
    parser.add_argument(
        "--retime",
        action="store_true",
        help="Only adjust playback speed on existing GIFs (no download)",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.retime:
        paths = sorted(OUT_DIR.glob("*.gif"))
        if args.id:
            paths = [p for p in paths if p.stem == args.id]
        if args.limit:
            paths = paths[: args.limit]
        ok = skip = 0
        for path in paths:
            if retime_gif(path, args.delay_ms):
                ok += 1
            else:
                skip += 1
        print(f"Retimed: {ok} gif(s), {skip} failed")
        return 0 if ok else 1

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
        if dest.exists() and not args.id and not args.force:
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
