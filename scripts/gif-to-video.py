#!/usr/bin/env python3
"""
Convert 2-frame exercise GIFs to short exercise demo MP4s.

Output: api/public/videos/<ext_id>[<suffix>].mp4

OpenRouter (default Veo 3.1 Lite): AI forward clip + ffmpeg phased loop —
hold start → ~1s transition → hold end → slower return → hold repeat.
Strength: 30% slower return; cardio: even timing. See EXERCISE_PHASE_OVERRIDES.

Backends:
  openrouter  — AI image-to-video via OpenRouter first/last frame (default)
  blend       — local crossfade preview only (blurry, not recommended)
  film        — Google FILM interpolation (FILM_HOME checkout + model)
  rife        — Practical-RIFE interpolation (RIFE_HOME checkout + model)

Usage:
  OPENROUTER_API_KEY=sk-... python3 scripts/gif-to-video.py --id Barbell_Bench_Press_-_Medium_Grip
  python3 scripts/gif-to-video.py --model kwaivgi/kling-v3.0-std --duration 3 --rep-duration 1.25
  python3 scripts/gif-to-video.py --backend blend --id Air_Bike --suffix .blend
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DIST = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
GIF_DIR = ROOT / "api" / "public" / "gifs"
OUT_DIR = ROOT / "api" / "public" / "videos"
EXERCISES_PATH = ROOT / "api" / "data" / "exercises.json"
OPENROUTER_VIDEOS = "https://openrouter.ai/api/v1/videos"
DEFAULT_FPS = 30
DEFAULT_GEN_DURATION = 4
DEFAULT_REP_DURATION = 2.0
DEFAULT_RESOLUTION = "720p"
DEFAULT_OPENROUTER_MODEL = "google/veo-3.1-lite"
LOOP_STRENGTH = "strength"
LOOP_CARDIO = "cardio"
CARDIO_EXT_IDS = frozenset({
    "Air_Bike",
    "Rope_Jumping",
    "Recumbent_Bike",
    "Bicycling",
    "Bicycling_Stationary",
    "Elliptical_Trainer",
    "Jogging_Treadmill",
    "Running_Treadmill",
    "Rowing_Stationary",
    "Walking_Treadmill",
    "Stairmaster",
    "Step_Mill",
})


@dataclass(frozen=True)
class PhaseSpec:
    """One loop: hold start → forward → hold end → return → hold start."""

    hold_start: float
    forward: float
    hold_end: float
    return_mult: float
    hold_repeat: float

    @property
    def return_dur(self) -> float:
        return self.forward * self.return_mult

    @property
    def cycle_duration(self) -> float:
        return self.hold_start + self.forward + self.hold_end + self.return_dur + self.hold_repeat


# Defaults: bench-style strength vs cardio (even return speed).
PHASE_STRENGTH = PhaseSpec(0.4, 1.0, 0.1, 1.3, 0.5)
PHASE_CARDIO = PhaseSpec(0.25, 0.9, 0.1, 1.0, 0.25)
EXERCISE_PHASE_OVERRIDES: dict[str, PhaseSpec] = {
    "Barbell_Bench_Press_-_Medium_Grip": PhaseSpec(0.4, 1.0, 0.1, 1.3, 0.5),
    "Barbell_Deadlift": PhaseSpec(0.45, 1.0, 0.15, 1.35, 0.5),
    "Air_Bike": PhaseSpec(0.2, 0.85, 0.1, 1.0, 0.25),
    "Rope_Jumping": PhaseSpec(0.2, 0.9, 0.1, 1.0, 0.25),
}

MODEL_MIN_DURATION: dict[str, int] = {
    "kwaivgi/kling-v3.0-pro": 3,
    "kwaivgi/kling-v3.0-std": 3,
    "alibaba/wan-2.7": 2,
    "alibaba/wan-2.6": 5,
    "google/veo-3.1-lite": 4,
    "google/veo-3.1-fast": 4,
    "google/veo-3.1": 4,
    "bytedance/seedance-2.0-fast": 4,
    "bytedance/seedance-2.0": 4,
    "bytedance/seedance-1-5-pro": 4,
    "minimax/hailuo-2.3": 6,
    "kwaivgi/kling-video-o1": 5,
}
MODEL_ASPECT_DEFAULT: dict[str, str] = {
    "google/veo-3.1-lite": "16:9",
    "google/veo-3.1-fast": "16:9",
    "google/veo-3.1": "16:9",
    "minimax/hailuo-2.3": "16:9",
    "alibaba/wan-2.7": "4:3",
    "bytedance/seedance-2.0-fast": "4:3",
    "bytedance/seedance-2.0": "4:3",
    "bytedance/seedance-1-5-pro": "4:3",
    "x-ai/grok-imagine-video": "3:2",
}
DEFAULT_ASPECT_RATIO = "3:2"
OPENROUTER_HEADERS = {
    "HTTP-Referer": "https://anatome.dev",
    "X-Title": "Anatome gif-to-video",
}


def fetch_bytes(url: str, timeout: int = 60) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "anatome-gif-to-video/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception:
        return None


def fetch_json(url: str, timeout: int = 60) -> dict | list | None:
    raw = fetch_bytes(url, timeout=timeout)
    if raw is None:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def post_json(url: str, payload: dict, headers: dict[str, str], timeout: int = 120) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            **OPENROUTER_HEADERS,
            **headers,
            "Content-Type": "application/json",
            "User-Agent": "anatome-gif-to-video/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_json(url: str, headers: dict[str, str], timeout: int = 60) -> dict:
    req = urllib.request.Request(
        url,
        headers={**OPENROUTER_HEADERS, **headers, "User-Agent": "anatome-gif-to-video/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found on PATH (brew install ffmpeg)", file=sys.stderr)
        sys.exit(1)
    return ffmpeg


def load_exercises() -> list[dict]:
    if EXERCISES_PATH.exists():
        data = json.loads(EXERCISES_PATH.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    remote = fetch_json(DIST)
    if isinstance(remote, list):
        return remote
    print("Could not load exercises.json", file=sys.stderr)
    sys.exit(1)


def image_url(rel: str) -> str:
    return rel if rel.startswith("http") else f"{IMG_BASE}{rel}"


def extract_gif_frames(gif_path: Path) -> list[Image.Image]:
    im = Image.open(gif_path)
    frames: list[Image.Image] = []
    try:
        while True:
            frames.append(im.copy().convert("RGB"))
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    return frames


def save_png_frames(frames: list[Image.Image], directory: Path) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for i, frame in enumerate(frames):
        path = directory / f"frame_{i:04d}.png"
        frame.save(path, format="PNG", optimize=True)
        paths.append(path)
    return paths


def ping_pong_alpha(frame_index: int, total_frames: int) -> float:
    """Ease-in-out ping-pong blend factor between 0 and 1."""
    if total_frames <= 1:
        return 0.0
    phase = (frame_index / total_frames) * 2.0
    if phase <= 1.0:
        t = phase
    else:
        t = 2.0 - phase
    return 0.5 - 0.5 * math.cos(math.pi * t)


def render_ping_pong_frames(img0: Image.Image, img1: Image.Image, duration: int, fps: int) -> list[Image.Image]:
    total = duration * fps
    size = img0.size
    a = img0.resize(size, Image.Resampling.LANCZOS)
    b = img1.resize(size, Image.Resampling.LANCZOS)
    out: list[Image.Image] = []
    for i in range(total):
        alpha = ping_pong_alpha(i, total)
        out.append(Image.blend(a, b, alpha))
    return out


def encode_png_sequence(frames: list[Image.Image], out_path: Path, fps: int) -> None:
    ffmpeg = require_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="anatome-vid-") as tmp:
        tmp_path = Path(tmp)
        save_png_frames(frames, tmp_path)
        pattern = str(tmp_path / "frame_%04d.png")
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            str(fps),
            "-i",
            pattern,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "ffmpeg failed")


def make_blend_video(img0: Image.Image, img1: Image.Image, out_path: Path, duration: int, fps: int) -> None:
    frames = render_ping_pong_frames(img0, img1, duration, fps)
    encode_png_sequence(frames, out_path, fps)


def encode_video_from_png_dir(png_dir: Path, out_path: Path, fps: int, duration: int) -> None:
    ffmpeg = require_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-framerate",
        str(fps),
        "-pattern_type",
        "glob",
        "-i",
        str(png_dir / "*.png"),
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg failed")


def run_film(img0: Image.Image, img1: Image.Image, out_path: Path, duration: int, fps: int) -> None:
    film_home = os.environ.get("FILM_HOME")
    model_path = os.environ.get("FILM_MODEL_PATH")
    if not film_home or not model_path:
        raise RuntimeError("Set FILM_HOME and FILM_MODEL_PATH (saved_model directory)")
    film_home_path = Path(film_home)
    if not film_home_path.is_dir():
        raise RuntimeError(f"FILM_HOME not found: {film_home}")

    with tempfile.TemporaryDirectory(prefix="anatome-film-") as tmp:
        work = Path(tmp) / "pair"
        work.mkdir()
        img0.save(work / "00.png")
        img1.save(work / "01.png")
        times = max(4, min(7, int(math.log2(duration * fps / 2))))
        cmd = [
            sys.executable,
            "-m",
            "eval.interpolator_cli",
            "--pattern",
            str(work),
            "--model_path",
            model_path,
            f"--times_to_interpolate={times}",
            "--output_video",
        ]
        proc = subprocess.run(cmd, cwd=film_home, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "FILM failed")
        frames_dir = work / "interpolated_frames"
        if not frames_dir.is_dir():
            raise RuntimeError("FILM did not produce interpolated_frames/")
        encode_video_from_png_dir(frames_dir, out_path, fps, duration)


def run_rife(img0: Image.Image, img1: Image.Image, out_path: Path, duration: int, fps: int) -> None:
    rife_home = os.environ.get("RIFE_HOME")
    if not rife_home:
        raise RuntimeError("Set RIFE_HOME to Practical-RIFE checkout")
    rife_home_path = Path(rife_home)
    infer = rife_home_path / "inference_img.py"
    if not infer.is_file():
        raise RuntimeError(f"Missing {infer}")

    with tempfile.TemporaryDirectory(prefix="anatome-rife-") as tmp:
        work = Path(tmp)
        f0 = work / "img0.png"
        f1 = work / "img1.png"
        img0.save(f0)
        img1.save(f1)
        exp = max(4, min(6, int(math.log2(duration * fps / 2))))
        cmd = [sys.executable, str(infer), "--img", str(f0), str(f1), f"--exp={exp}"]
        proc = subprocess.run(cmd, cwd=rife_home, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "RIFE failed")
        output_dir = rife_home_path / "output"
        if not output_dir.is_dir():
            raise RuntimeError("RIFE did not produce output/ png sequence")
        encode_video_from_png_dir(output_dir, out_path, fps, duration)


def probe_video_duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 0.0
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return 0.0
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return 0.0


def run_ffmpeg(args: list[str]) -> None:
    ffmpeg = require_ffmpeg()
    proc = subprocess.run([ffmpeg, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "ffmpeg failed")


def retime_video_to_rep(src: Path, dest: Path, rep_duration: float) -> float:
    """Speed up AI output so one rep plays in rep_duration seconds."""
    ffmpeg = require_ffmpeg()
    src_duration = probe_video_duration(src)
    if src_duration <= 0:
        raise RuntimeError(f"Could not probe duration of {src.name}")
    speed = src_duration / rep_duration
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(src),
            "-an",
            "-filter:v",
            f"setpts=PTS/{speed:.6f}",
            "-t",
            f"{rep_duration:.3f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )
    final = probe_video_duration(dest)
    print(
        f"  … retimed {src_duration:.2f}s → {final:.2f}s ({speed:.2f}x)",
        flush=True,
    )
    return speed


def probe_video_size(path: Path) -> tuple[int, int]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 1280, 720
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return 1280, 720
    parts = proc.stdout.strip().split(",")
    if len(parts) == 2:
        return int(parts[0]), int(parts[1])
    return 1280, 720


def create_image_hold(
    img: Image.Image,
    duration: float,
    width: int,
    height: int,
    out: Path,
    fps: int = DEFAULT_FPS,
) -> None:
    if duration <= 0:
        raise ValueError("hold duration must be positive")
    scale = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"
    )
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        png = Path(tmp.name)
        img.convert("RGB").save(png, format="PNG")
    try:
        run_ffmpeg(
            [
                "-y",
                "-loop",
                "1",
                "-t",
                f"{duration:.3f}",
                "-i",
                str(png),
                "-vf",
                scale,
                "-r",
                str(fps),
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(out),
            ]
        )
    finally:
        png.unlink(missing_ok=True)


def trim_transition(src: Path, duration: float, out: Path) -> None:
    src_duration = probe_video_duration(src)
    if src_duration <= 0:
        raise RuntimeError(f"Could not probe duration of {src.name}")
    speed = src_duration / duration
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(src),
            "-an",
            "-filter:v",
            f"setpts=PTS/{speed:.6f}",
            "-t",
            f"{duration:.3f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
    )


def reverse_transition(src: Path, duration: float, out: Path) -> None:
    src_duration = probe_video_duration(src)
    if src_duration <= 0:
        raise RuntimeError(f"Could not probe duration of {src.name}")
    stretch = duration / src_duration
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(src),
            "-an",
            "-filter:v",
            f"reverse,setpts=PTS*{stretch:.6f}",
            "-t",
            f"{duration:.3f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
    )


def concat_segments(segments: list[Path], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="anatome-phase-") as tmp:
        listing = Path(tmp) / "list.txt"
        listing.write_text(
            "".join(f"file '{p.resolve()}'\n" for p in segments),
            encoding="utf-8",
        )
        run_ffmpeg(
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(listing),
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(dest),
            ]
        )


def resolve_phase_spec(exercise: dict, profile: str) -> PhaseSpec:
    ext_id = exercise.get("ext_id") or exercise.get("id") or ""
    if ext_id in EXERCISE_PHASE_OVERRIDES:
        return EXERCISE_PHASE_OVERRIDES[ext_id]
    if profile == LOOP_CARDIO:
        return PHASE_CARDIO
    return PHASE_STRENGTH


def build_phased_loop(
    raw: Path,
    img_start: Image.Image,
    img_end: Image.Image,
    spec: PhaseSpec,
    dest: Path,
) -> None:
    """
    Assemble: hold(start) → AI forward → hold(end) → reverse return → hold(start).
    """
    width, height = probe_video_size(raw)
    src_duration = probe_video_duration(raw)
    if src_duration <= 0:
        raise RuntimeError(f"Could not probe duration of {raw.name}")

    with tempfile.TemporaryDirectory(prefix="anatome-loop-") as tmp:
        work = Path(tmp)
        hold0 = work / "hold0.mp4"
        hold1 = work / "hold1.mp4"
        hold0b = work / "hold0b.mp4"
        fwd = work / "fwd.mp4"
        ret = work / "ret.mp4"

        create_image_hold(img_start, spec.hold_start, width, height, hold0)
        trim_transition(raw, spec.forward, fwd)
        if spec.hold_end > 0.01:
            create_image_hold(img_end, spec.hold_end, width, height, hold1)
        reverse_transition(fwd, spec.return_dur, ret)
        create_image_hold(img_start, spec.hold_repeat, width, height, hold0b)

        segments = [hold0, fwd]
        if spec.hold_end > 0.01:
            segments.append(hold1)
        segments.extend([ret, hold0b])
        concat_segments(segments, dest)

    final = probe_video_duration(dest)
    if abs(spec.return_mult - 1.0) < 0.01:
        ret_label = "even return"
    else:
        ret_label = f"return {(spec.return_mult - 1) * 100:.0f}% slower"
    print(
        f"  … phased ({ret_label}): "
        f"hold {spec.hold_start}s → {spec.forward}s → hold {spec.hold_end}s → "
        f"{spec.return_dur:.2f}s back → hold {spec.hold_repeat}s → {final:.2f}s total",
        flush=True,
    )


def detect_loop_profile(exercise: dict, override: str | None) -> str:
    if override and override != "auto":
        return override
    ext_id = exercise.get("ext_id") or exercise.get("id") or ""
    if ext_id in CARDIO_EXT_IDS:
        return LOOP_CARDIO
    if (exercise.get("category") or "").lower() == "cardio":
        return LOOP_CARDIO
    return LOOP_STRENGTH


def openrouter_prompt(exercise: dict, loop_profile: str) -> str:
    name = exercise.get("name") or exercise.get("ext_id") or "exercise"
    equipment = exercise.get("equipment") or "bodyweight"
    base = (
        f"Photorealistic gym exercise video: {name} using {equipment}. "
        "Tripod camera, fixed framing, same athlete, clothing, equipment, and background. "
        "No morphing, no ghosting, no crossfade, no text overlays. "
    )
    if loop_profile == LOOP_CARDIO:
        return (
            base
            + "Continuous steady cardio rhythm: move from exact start pose to exact end pose "
            "at constant even speed, then the motion would return at the same even pace. "
            "One direction only in this clip (start to end), uniform velocity throughout."
        )
    return (
        base
        + "One direction only: move from the exact start pose to the exact end pose "
        "at perfectly constant speed for the entire clip. "
        "Do not return to the start pose. Do not rush the finish — same pace from start to end."
    )


def openrouter_frame_urls(exercise: dict) -> tuple[str, str] | None:
    images = exercise.get("images") or []
    if len(images) < 2:
        return None
    return image_url(images[0]), image_url(images[1])


def pick_openrouter_duration(requested: int, model: str) -> int:
    """Snap to model minimums; shorter gen = lower cost."""
    floor = MODEL_MIN_DURATION.get(model, 3)
    return max(floor, requested)


def pick_aspect_ratio(model: str, override: str | None) -> str:
    if override:
        return override
    return MODEL_ASPECT_DEFAULT.get(model, DEFAULT_ASPECT_RATIO)


def submit_openrouter_video(
    api_key: str,
    model: str,
    prompt: str,
    duration: int,
    resolution: str,
    aspect_ratio: str,
    first_url: str,
    last_url: str,
) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "generate_audio": False,
        "frame_images": [
            {"type": "image_url", "image_url": {"url": first_url}, "frame_type": "first_frame"},
            {"type": "image_url", "image_url": {"url": last_url}, "frame_type": "last_frame"},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        resp = post_json(OPENROUTER_VIDEOS, payload, headers)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter submit failed ({exc.code}): {detail}") from exc
    job_id = resp.get("id")
    if not job_id:
        raise RuntimeError(f"OpenRouter response missing job id: {resp}")
    return str(job_id)


def poll_openrouter_video(api_key: str, job_id: str, timeout_sec: int = 900) -> dict:
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.time() + timeout_sec
    last_log = 0.0
    while time.time() < deadline:
        try:
            status = get_json(f"{OPENROUTER_VIDEOS}/{job_id}", headers)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OpenRouter poll failed ({exc.code}): {detail}") from exc
        state = status.get("status")
        now = time.time()
        if now - last_log >= 15:
            print(f"  … status={state}", flush=True)
            last_log = now
        if state == "completed":
            return status
        if state in {"failed", "cancelled", "expired"}:
            raise RuntimeError(f"OpenRouter job {job_id} {state}: {status.get('error')}")
        time.sleep(5)
    raise RuntimeError(f"OpenRouter job {job_id} timed out after {timeout_sec}s")


def download_openrouter_video(api_key: str, job_id: str, out_path: Path, status: dict) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": f"Bearer {api_key}"}
    urls = status.get("unsigned_urls") or []
    if urls:
        raw = fetch_bytes(str(urls[0]), timeout=120)
        if raw:
            out_path.write_bytes(raw)
            return
    req = urllib.request.Request(
        f"{OPENROUTER_VIDEOS}/{job_id}/content",
        headers={**OPENROUTER_HEADERS, **headers, "User-Agent": "anatome-gif-to-video/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out_path.write_bytes(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter download failed ({exc.code}): {detail}") from exc


def verify_openrouter_output(out_path: Path, model: str) -> None:
    """Reject accidental local crossfade output masquerading as AI video."""
    size = out_path.stat().st_size
    if size < 400_000:
        raise RuntimeError(
            f"Downloaded file looks too small ({size} bytes) for {model} — "
            "likely not an AI render; check OpenRouter job status"
        )
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(out_path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return
    parts = proc.stdout.strip().split(",")
    if len(parts) == 2:
        w, h = int(parts[0]), int(parts[1])
        if w <= 480 and h <= 320:
            raise RuntimeError(
                f"Downloaded video is {w}x{h} — looks like local crossfade, not {model}"
            )
        print(f"  … output {w}x{h}, {size // 1024}KB", flush=True)


def make_openrouter_video(
    exercise: dict,
    out_path: Path,
    gen_duration: int,
    rep_duration: float,
    model: str,
    resolution: str,
    aspect_ratio: str | None,
    loop_profile: str,
    use_phased: bool,
    skip_retime: bool,
) -> None:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set OPENROUTER_API_KEY for --backend openrouter")
    frames = openrouter_frame_urls(exercise)
    if not frames:
        raise RuntimeError("Exercise needs at least two source images")
    first_url, last_url = frames
    dur = pick_openrouter_duration(gen_duration, model)
    aspect = pick_aspect_ratio(model, aspect_ratio)
    profile = detect_loop_profile(exercise, loop_profile)
    phase = resolve_phase_spec(exercise, profile)
    prompt = openrouter_prompt(exercise, profile)
    job_id = submit_openrouter_video(
        api_key, model, prompt, dur, resolution, aspect, first_url, last_url
    )
    print(
        f"  … OpenRouter job {job_id} model={model} gen={dur}s {resolution} {aspect} "
        f"profile={profile} cycle≈{phase.cycle_duration:.1f}s",
        flush=True,
    )
    status = poll_openrouter_video(api_key, job_id)
    usage = status.get("usage") or {}
    cost = usage.get("cost")
    if cost is not None:
        print(f"  … gen cost ${cost:.4f}", flush=True)

    with tempfile.TemporaryDirectory(prefix="anatome-or-") as tmp:
        raw_path = Path(tmp) / "raw.mp4"
        download_openrouter_video(api_key, job_id, raw_path, status)
        verify_openrouter_output(raw_path, model)
        if skip_retime:
            shutil.copy2(raw_path, out_path)
        elif use_phased and profile in (LOOP_STRENGTH, LOOP_CARDIO):
            pair = resolve_frames(exercise, exercise.get("ext_id") or exercise.get("id") or "")
            if not pair:
                raise RuntimeError("Need two frames for phased loop")
            build_phased_loop(raw_path, pair[0], pair[1], phase, out_path)
        else:
            retime_video_to_rep(raw_path, out_path, rep_duration)


def output_path(ex_id: str, suffix: str) -> Path:
    stem = f"{ex_id}{suffix}" if suffix else ex_id
    return OUT_DIR / f"{stem}.mp4"


def resolve_frames(exercise: dict, ex_id: str) -> tuple[Image.Image, Image.Image] | None:
    gif_path = GIF_DIR / f"{ex_id}.gif"
    if gif_path.is_file():
        frames = extract_gif_frames(gif_path)
        if len(frames) >= 2:
            return frames[0], frames[1]
    images = exercise.get("images") or []
    loaded: list[Image.Image] = []
    for rel in images[:2]:
        raw = fetch_bytes(image_url(rel))
        if not raw:
            continue
        loaded.append(Image.open(io.BytesIO(raw)).convert("RGB"))
    if len(loaded) >= 2:
        return loaded[0], loaded[1]
    return None


def assemble_phased_from_file(
    exercise: dict,
    raw_path: Path,
    out_path: Path,
    loop_profile: str,
) -> None:
    """Build phased loop from an existing forward AI clip (no OpenRouter call)."""
    profile = detect_loop_profile(exercise, loop_profile)
    phase = resolve_phase_spec(exercise, profile)
    ex_id = str(exercise.get("ext_id") or exercise.get("id") or "")
    pair = resolve_frames(exercise, ex_id)
    if not pair:
        raise RuntimeError("Need two frames for phased loop")
    build_phased_loop(raw_path, pair[0], pair[1], phase, out_path)


def make_video(
    exercise: dict,
    backend: str,
    gen_duration: int,
    rep_duration: float,
    fps: int,
    model: str,
    resolution: str,
    aspect_ratio: str | None,
    loop_profile: str,
    use_phased: bool,
    suffix: str,
    skip_retime: bool,
    assemble_from: Path | None,
) -> Path | None:
    ex_id = exercise.get("ext_id") or exercise.get("id")
    if not ex_id:
        return None
    out_path = output_path(str(ex_id), suffix)

    if assemble_from is not None:
        if not assemble_from.is_file():
            raise RuntimeError(f"--assemble-from not found: {assemble_from}")
        assemble_phased_from_file(exercise, assemble_from, out_path, loop_profile)
        return out_path

    if backend == "openrouter":
        make_openrouter_video(
            exercise,
            out_path,
            gen_duration,
            rep_duration,
            model,
            resolution,
            aspect_ratio,
            loop_profile,
            use_phased,
            skip_retime,
        )
        return out_path

    pair = resolve_frames(exercise, str(ex_id))
    if not pair:
        return None
    img0, img1 = pair
    local_duration = max(1, int(round(rep_duration)))

    if backend == "blend":
        make_blend_video(img0, img1, out_path, local_duration, fps)
    elif backend == "film":
        run_film(img0, img1, out_path, local_duration, fps)
    elif backend == "rife":
        run_rife(img0, img1, out_path, local_duration, fps)
    else:
        raise RuntimeError(f"Unknown backend: {backend}")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert exercise GIFs to short MP4 demos")
    parser.add_argument("--id", help="Single exercise ext_id only")
    parser.add_argument("--limit", type=int, default=0, help="Max exercises (0 = all)")
    parser.add_argument(
        "--backend",
        choices=("openrouter", "blend", "film", "rife"),
        default="openrouter",
        help="Generation backend (default: openrouter / Veo 3.1 Lite)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=DEFAULT_GEN_DURATION,
        help="OpenRouter generation length in seconds (default: 4)",
    )
    parser.add_argument(
        "--rep-duration",
        type=float,
        default=DEFAULT_REP_DURATION,
        help="Legacy simple retime only (--no-phased); phased cycle uses per-exercise timing",
    )
    parser.add_argument(
        "--loop-profile",
        choices=("auto", LOOP_STRENGTH, LOOP_CARDIO),
        default="auto",
        help="Phasing preset: strength (slower return) or cardio (even); auto detects category",
    )
    parser.add_argument(
        "--no-phased",
        action="store_true",
        help="Skip hold/phase assembly; only retime raw AI clip to --rep-duration",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="",
        help="OpenRouter aspect ratio (default: auto per model)",
    )
    parser.add_argument(
        "--resolution",
        choices=("480p", "720p", "1080p"),
        default=DEFAULT_RESOLUTION,
        help="OpenRouter output resolution (default: 720p)",
    )
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS, help="FPS for local backends")
    parser.add_argument(
        "--model",
        default=DEFAULT_OPENROUTER_MODEL,
        help=f"OpenRouter video model (default: {DEFAULT_OPENROUTER_MODEL})",
    )
    parser.add_argument(
        "--suffix",
        default="",
        help="Optional filename suffix before .mp4 (e.g. .openrouter)",
    )
    parser.add_argument(
        "--no-retime",
        action="store_true",
        help="Keep raw OpenRouter length (no ffmpeg speed-up)",
    )
    parser.add_argument("--force", action="store_true", help="Rebuild even if .mp4 exists")
    parser.add_argument(
        "--assemble-from",
        type=Path,
        default=None,
        help="Skip API: build phased loop from existing forward clip (e.g. prior .veo.mp4)",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    exercises = load_exercises()
    if args.id:
        exercises = [e for e in exercises if (e.get("ext_id") or e.get("id")) == args.id]
        if not exercises:
            print(f"No exercise with id={args.id!r}", file=sys.stderr)
            return 1

    aspect = args.aspect_ratio.strip() or None
    ok = skip = 0
    for i, ex in enumerate(exercises):
        if args.limit and i >= args.limit:
            break
        ex_id = ex.get("ext_id") or ex.get("id")
        if not ex_id:
            skip += 1
            continue
        dest = output_path(str(ex_id), args.suffix)
        if dest.exists() and not args.id and not args.force:
            ok += 1
            continue
        try:
            result = make_video(
                ex,
                args.backend,
                args.duration,
                args.rep_duration,
                args.fps,
                args.model,
                args.resolution,
                aspect,
                args.loop_profile,
                not args.no_phased,
                args.suffix,
                args.no_retime,
                args.assemble_from,
            )
            if result:
                ok += 1
                print(f"✓ {ex_id} → {result.name}")
            else:
                skip += 1
                print(f"✗ {ex_id} (no frames)", file=sys.stderr)
        except Exception as exc:
            skip += 1
            print(f"✗ {ex_id} ({exc})", file=sys.stderr)

    print(f"Done: {ok} video(s) in {OUT_DIR}, {skip} skipped/failed")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
