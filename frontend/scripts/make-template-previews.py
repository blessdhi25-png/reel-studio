#!/usr/bin/env python3
"""Generates the placeholder template preview loops in public/templates/.

Each clip is a seamless 2.4s, 24fps, 360x640 H.264 loop (an animated plasma with
a drifting soft highlight) plus a JPG poster of its first frame. They exist so
the Templates tab ships with real <video> loops; replace them with real
template previews at the same paths whenever you have them.

Usage:  python3 scripts/make-template-previews.py   (needs ffmpeg with libx264)
"""
import concurrent.futures as cf
import pathlib
import subprocess

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "templates"
W, H, DUR, FPS = 360, 640, 2.4, 24
SCALE_DOWN = 4  # the pattern is smooth, so compute it small and upscale (geq is slow)

# (id, phase offsets for r/g/b, spatial frequencies a/b, highlight strength)
LOOKS = [
    ("tp1", (0.0, 1.2, 2.6), (1.4, 0.9), 70),
    ("tp2", (3.6, 4.9, 0.4), (0.8, 1.6), 55),
    ("tp3", (2.2, 0.3, 4.1), (1.9, 1.1), 85),
    ("tp4", (1.0, 2.9, 5.2), (1.2, 1.7), 90),
    ("tp5", (5.4, 0.6, 2.0), (1.6, 0.7), 60),
    ("tp6", (4.1, 2.2, 0.9), (0.9, 1.3), 50),
    ("tp7", (0.6, 0.2, 1.1), (1.1, 0.8), 95),
    ("tp8", (5.0, 3.3, 1.7), (1.7, 1.4), 80),
    ("tp9", (0.3, 4.4, 3.0), (2.1, 1.0), 75),
    ("tp10", (3.0, 1.5, 4.8), (0.7, 1.9), 55),
    ("tp11", (2.6, 5.6, 0.8), (1.3, 1.2), 65),
    ("tp12", (1.8, 1.7, 1.6), (0.6, 0.9), 40),
]


def expr(phase, freq, glow):
    u, v = "(X/W)", "(Y/H)"
    ph = f"(2*PI*T/{DUR})"  # one full cycle per clip => seamless loop
    a, b = freq
    s = (
        f"(sin(2*PI*({a}*{u}+{b}*{v})+{ph})"
        f"+sin(2*PI*(1.7*hypot({u}-0.5,{v}-0.5))-{ph})"
        f"+sin(2*PI*({b}*{u}-{a}*{v})+2*{ph}))"
    )
    spot = (
        f"{glow}*exp(-(pow(X-W*(0.5+0.22*cos({ph})),2)+pow(Y-H*(0.45+0.16*sin({ph})),2))"
        f"/(2*pow(0.16*W,2)))"
    )
    chans = [f"clip(110+55*sin({s}+{p})+{spot},0,255)" for p in phase]
    return chans


def build(item):
    clip_id, phase, freq, glow = item
    r, g, b = expr(phase, freq, glow)
    mp4 = OUT / f"{clip_id}.mp4"
    jpg = OUT / f"{clip_id}.jpg"
    vf = (
        f"format=gbrp,geq=r='{r}':g='{g}':b='{b}',"
        f"scale={W}:{H}:flags=bicubic,format=yuv420p"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", f"color=c=black:s={W // SCALE_DOWN}x{H // SCALE_DOWN}:r={FPS}:d={DUR}", "-vf", vf,
         "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-an",
         "-movflags", "+faststart", str(mp4)],
        check=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-frames:v", "1", "-q:v", "5", str(jpg)],
        check=True,
    )
    return clip_id, mp4.stat().st_size, jpg.stat().st_size


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for clip_id, mp4_size, jpg_size in pool.map(build, LOOKS):
            print(f"{clip_id}: mp4 {mp4_size/1024:.0f}KB  jpg {jpg_size/1024:.0f}KB")
