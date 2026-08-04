#!/usr/bin/env python3
"""
Build 2-frame animated GIFs from wrkout/exercises.json JPEG pairs.

Upstream layout: exercises/<folder>/images/0.jpg + 1.jpg
Anatome ext_id → wrkout folder: api/data/wrkoutFolderByExtId.json

Output: api/public/gifs/<ext_id>.gif (served at GET /exerciseGif?id=<ext_id>)

Requires: Python 3.9+, Pillow (`pip install Pillow`)

Usage:
  python3 scripts/generate-exercise-gifs.py              # all exercises
  python3 scripts/generate-exercise-gifs.py --id Air_Bike
  python3 scripts/generate-exercise-gifs.py --limit 10
  python3 scripts/generate-exercise-gifs.py --force
  python3 scripts/generate-exercise-gifs.py --retime
"""

from __future__ import annotations

import argparse
import concurrent.futures
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
EXERCISES_JSON = ROOT / "api" / "data" / "exercises.json"
FOLDER_MAP_JSON = ROOT / "api" / "data" / "wrkoutFolderByExtId.json"
IMG_BASE = "https://raw.githubusercontent.com/wrkout/exercises.json/master/exercises/"
OUT_DIR = ROOT / "api" / "public" / "gifs"
DEFAULT_SIZE = 480
DEFAULT_DELAY_MS = 750
DEFAULT_WORKERS = 12


def fetch_bytes(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "anatome-gif-gen/1.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read()
    except Exception:
        return None


def save_gif(path: Path, frames: list[Image.Image], delay_ms: int) -> None:
    duration_ms = max(50, delay_ms)
    if len(frames) == 1:
        frames[0].save(path, save_all=False, optimize=True, loop=0)
        return
    durations = [duration_ms] * len(frames)
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


def retime_gif(path: Path, delay_ms: int) -> bool:
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
    save_gif(path, frames, delay_ms)
    return True


def wrkout_urls(ext_id: str, images: list[str], folder_map: dict[str, str]) -> list[str]:
    folder = folder_map.get(ext_id, ext_id)
    urls: list[str] = []
    for rel in images[:2]:
        if not rel:
            continue
        file = rel.rsplit("/", 1)[-1]
        # wrkout: exercises/<folder>/images/<file>
        segs = [folder, "images", file]
        urls.append(IMG_BASE + "/".join(urllib.request.quote(s, safe="") for s in segs))
    return urls


def make_gif(
    ex_id: str,
    images: list[str],
    folder_map: dict[str, str],
    size: int,
    delay_ms: int,
) -> tuple[str, bool, str]:
    frames: list[Image.Image] = []
    for url in wrkout_urls(ex_id, images, folder_map):
        raw = fetch_bytes(url)
        if not raw:
            return ex_id, False, f"fetch failed: {url}"
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((size, size), Image.Resampling.LANCZOS)
        frames.append(img)

    if not frames:
        return ex_id, False, "no frames"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    save_gif(OUT_DIR / f"{ex_id}.gif", frames, delay_ms)
    return ex_id, True, ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate exercise GIFs from wrkout JPEGs")
    parser.add_argument("--id", help="Single exercise ext_id only")
    parser.add_argument("--limit", type=int, default=0, help="Max exercises (0 = all)")
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE)
    parser.add_argument("--delay-ms", type=int, default=DEFAULT_DELAY_MS)
    parser.add_argument("--force", action="store_true", help="Rebuild even if .gif already exists")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument(
        "--retime",
        action="store_true",
        help="Only adjust playback speed on existing GIFs (no download)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "_artifacts" / "wrkout-gif-regen-report.json",
        help="Write ok/fail report JSON",
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

    exercises = json.loads(EXERCISES_JSON.read_text())
    folder_map = json.loads(FOLDER_MAP_JSON.read_text())

    if args.id:
        exercises = [e for e in exercises if e.get("ext_id") == args.id]
        if not exercises:
            print(f"No exercise with ext_id={args.id!r}", file=sys.stderr)
            return 1

    jobs = []
    for i, ex in enumerate(exercises):
        if args.limit and i >= args.limit:
            break
        ex_id = ex.get("ext_id")
        images = ex.get("images") or []
        if not ex_id or not images:
            continue
        dest = OUT_DIR / f"{ex_id}.gif"
        if dest.exists() and not args.id and not args.force:
            jobs.append(("skip-exists", ex_id, images))
        else:
            jobs.append(("build", ex_id, images))

    ok_ids: list[str] = []
    fail: list[dict] = []
    skipped = 0

    build_jobs = [(eid, imgs) for kind, eid, imgs in jobs if kind == "build"]
    skipped = sum(1 for kind, _, _ in jobs if kind == "skip-exists")

    def _run(item: tuple[str, list[str]]) -> tuple[str, bool, str]:
        eid, imgs = item
        return make_gif(eid, imgs, folder_map, args.size, args.delay_ms)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futs = [pool.submit(_run, j) for j in build_jobs]
        for fut in concurrent.futures.as_completed(futs):
            eid, success, err = fut.result()
            if success:
                ok_ids.append(eid)
                print(f"✓ {eid}")
            else:
                fail.append({"ext_id": eid, "error": err})
                print(f"✗ {eid}: {err}", file=sys.stderr)

    report = {
        "source": "https://github.com/wrkout/exercises.json",
        "built": sorted(ok_ids),
        "built_count": len(ok_ids),
        "skipped_existing": skipped,
        "failed": fail,
        "failed_count": len(fail),
        "folder_map_entries": len(folder_map),
        "gif_dir": str(OUT_DIR),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Done: {len(ok_ids)} built, {skipped} skipped-existing, {len(fail)} failed → {args.report}"
    )
    return 0 if not fail else 1


if __name__ == "__main__":
    raise SystemExit(main())
