"""Record the pitch film (about 41 s, for the local demo): the app itself, beat by beat, every click shown, frame by
frame on the page's own clock, so every frame is drawn and evenly spaced however busy the computer is.

    python web/scripts/pitch_film.py OUT.mp4 --url http://localhost:3251            the film (1920 x 1080, 30 a second)
    python web/scripts/pitch_film.py OUT_DIR --url http://localhost:3251 --dry      a dry run: no film, one frame per beat

Needs Playwright (the system Python 3.12 has it) and ffmpeg on the path, and a running production build of the app.
The beats are the plan approved on 15 Nov 2026 (the landing as short as before, the rest given time to read):

  1  0.0 to 3.5    the landing: the name and the hook, a click on "See what the map missed"
  2  3.5 to 10.0   the streets step on the official map: the flooded streets appear, 59% outside every zone
  3  10.0 to 15.0  a click on "Our simulation": 76%
  4  15.0 to 22.0  in on Carrer del Sol, Picanya, a tap: its card with every record and the sources
  5  22.0 to 28.0  Next, NISAR: the line dragged across once, 57% against 36%
  6  28.0 to 37.0  Next, where the map said safe: 205 km found outside every official zone, 71% right, chance 23%
  7  37.0 to 39.0  All layers
  8  39.0 to 41.0  back on the landing's name (recorded as its own take and joined)

Clicks are real mouse input (DevTools Input.dispatchMouseEvent) at the cursor; the cursor and a soft ring for each
click are drawn onto the frames afterwards, so nothing is added to the page. The page's clocks follow the recorder
(record_flood.CLOCK): animations, the reveal, the camera and the fades all move one frame at a time. The landing's
monitor film is held still (a <video> plays on the wall clock, which would stutter here).
Written with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import argparse
import base64
import io
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_flood import CLOCK as STORY_CLOCK  # noqa: E402
from record_flood import PUMP, open_browser  # noqa: E402

# the recorder's clock, with one change for the landing: its scroll-driven animations (a scroll timeline, not the
# document's) follow the scroll, so the clock leaves them alone instead of setting a time they refuse
_LOOP = "for (const a of document.getAnimations()) {"
assert STORY_CLOCK.count(_LOOP) == 1
CLOCK = STORY_CLOCK.replace(_LOOP, _LOOP + "\n\t\t\tif (a.timeline && a.timeline !== document.timeline) continue")

W, H = 1920, 1080
# the film street: Carrer del Sol, Picanya (approved), where its card reads every record
STREET = (-0.43687, 39.43779)
STREET_ZOOM = 15.6

# everything the moment shows has arrived: fonts and pictures, and on the map pages the map's tiles and sources
COMPLETE = """() => {
	if (document.fonts && document.fonts.status !== 'loaded') return false
	for (const i of document.images) if (i.loading !== 'lazy' && !i.complete) return false
	const g = window.__guided
	if (g && g.map && g.map()) {
		// as the tour's own ?film check: the street lines in and every tile drawn (map.loaded() would wait on the
		// reveal, which changes the style every frame)
		const m = g.map()
		return m.isStyleLoaded() && (!m.getSource('g-streets') || m.isSourceLoaded('g-streets')) && m.areTilesLoaded()
	}
	const e = window.__explore
	if (e && e.map && e.map()) return e.map().isStyleLoaded() && e.map().areTilesLoaded()
	return true
}"""
# a page of the app is open and laid out (not __guided.ready() or map.loaded(): those wait on any style change, and the
# reveal changes the style every frame)
GUIDED_OPEN = """() => { const g = window.__guided; const m = g && g.map && g.map(); return !!m && m.isStyleLoaded() && !!m.getSource('g-streets') && m.isSourceLoaded('g-streets') }"""
EXPLORE_OPEN = """() => { const e = window.__explore; const m = e && e.map && e.map(); return !!m && m.isStyleLoaded() }"""
# what a frame still waits for, when it waits too long
MISSING = """() => {
	const out = []
	if (document.fonts && document.fonts.status !== 'loaded') out.push('fonts ' + document.fonts.status)
	for (const i of document.images) if (i.loading !== 'lazy' && !i.complete) out.push('img ' + (i.currentSrc || i.src).slice(-50))
	const g = window.__guided
	if (g && g.map && g.map()) {
		const m = g.map()
		if (!m.isStyleLoaded()) out.push('style loading')
		if (m.getSource('g-streets') && !m.isSourceLoaded('g-streets')) out.push('streets loading')
		if (!m.areTilesLoaded()) out.push('tiles loading')
	}
	return out.join(', ') || 'nothing'
}"""
# the landing's monitor: its film held on one frame (a video runs on the wall clock, not the recorder's)
HOLD_MONITOR = """() => {
	for (const v of document.querySelectorAll('video')) { v.pause(); v.removeAttribute('autoplay') }
	return document.querySelectorAll('video').length
}"""
CENTER = """(sel) => {
	const el = typeof sel === 'string' ? document.querySelector(sel) : null
	if (!el) return null
	const r = el.getBoundingClientRect()
	return [r.left + r.width / 2, r.top + r.height / 2]
}"""
# a button by its words, inside a part of the page
BUTTON = """([scope, words]) => {
	const el = [...document.querySelectorAll(scope + ' button, ' + scope + ' a')].find((b) => b.textContent.trim().startsWith(words))
	if (!el) return null
	const r = el.getBoundingClientRect()
	return [r.left + r.width / 2, r.top + r.height / 2]
}"""
STREET_PX = """([lon, lat]) => { const m = window.__guided && window.__guided.map(); if (!m) return null; const p = m.project([lon, lat]); return [p.x, p.y] }"""


def ease(k: float) -> float:
    return k * k * (3 - 2 * k)


class Film:
    """The recorder: a page on the recorder's clock, a cursor, and the frames."""

    def __init__(self, page, cdp, raw: Path | None, fps: int, dry: bool):
        self.page, self.cdp, self.raw, self.fps, self.dry = page, cdp, raw, fps, dry
        self.n = 0
        self.cursor = (W * 0.5, H * 0.62)
        self.rings: list[tuple[int, float, float]] = []  # (frame of the click, x, y)
        self.down = False
        self.late = 0

    # ---------------------------------------------------------------- input
    def mouse(self, kind: str, x: float, y: float):
        ev = {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1}
        if kind == "mouseMoved":
            ev["buttons"] = 1 if self.down else 0
        self.cdp.send("Input.dispatchMouseEvent", ev)

    def where(self, target) -> tuple[float, float]:
        if isinstance(target, tuple) and len(target) == 2 and all(isinstance(v, (int, float)) for v in target):
            return target
        kind, arg = target
        js = {"css": CENTER, "button": BUTTON, "street": STREET_PX}[kind]
        p = self.page.evaluate(js, arg)
        if not p:
            raise RuntimeError(f"nothing to point at: {target}")
        return float(p[0]), float(p[1])

    # ---------------------------------------------------------------- time
    def frame(self):
        """Move the page on by one frame, wait until it is drawn, take it (with the cursor and rings drawn on)."""
        if self.n:
            self.page.evaluate(f"() => window.__clock.step({1000 / self.fps})")
        self.page.evaluate(PUMP)
        until = time.time() + 8
        while not self.page.evaluate(COMPLETE):
            if time.time() > until:
                self.late += 1
                if self.late <= 5:
                    print(f"  frame {self.n + 1}: not everything drawn after 8 s: {self.page.evaluate(MISSING)}", flush=True)
                break
            self.page.wait_for_timeout(10)
            self.page.evaluate(PUMP)
        self.page.evaluate(PUMP)
        self.n += 1
        if self.dry:
            return
        shot = self.cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 96})
        im = Image.open(io.BytesIO(base64.b64decode(shot["data"]))).convert("RGB")
        self.draw(im).save(self.raw / f"{self.n:06d}.jpg", quality=94)

    def hold(self, seconds: float):
        for _ in range(round(seconds * self.fps)):
            self.frame()

    def move(self, target, seconds: float):
        """The cursor glides to a target (a point, a CSS selector, a button by its words, the film street)."""
        x0, y0 = self.cursor
        x1, y1 = self.where(target)
        steps = max(1, round(seconds * self.fps))
        for i in range(1, steps + 1):
            k = ease(i / steps)
            self.cursor = (x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
            self.mouse("mouseMoved", *self.cursor)
            self.frame()

    def click(self):
        x, y = self.cursor
        self.rings.append((self.n, x, y))
        self.mouse("mousePressed", x, y)
        self.mouse("mouseReleased", x, y)
        self.frame()

    def drag(self, to, seconds: float):
        x0, y0 = self.cursor
        x1, y1 = self.where(to)
        self.down = True
        self.mouse("mousePressed", x0, y0)
        steps = max(1, round(seconds * self.fps))
        for i in range(1, steps + 1):
            k = ease(i / steps)
            self.cursor = (x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
            self.mouse("mouseMoved", *self.cursor)
            self.frame()
        self.down = False
        self.mouse("mouseReleased", *self.cursor)

    def js(self, code: str, arg=None):
        return self.page.evaluate(code, arg)

    # ---------------------------------------------------------------- the cursor and the rings, on the frame
    def draw(self, im: Image.Image) -> Image.Image:
        d = ImageDraw.Draw(im, "RGBA")
        for at, x, y in self.rings:
            k = (self.n - at) / (0.55 * self.fps)
            if 0 <= k <= 1:
                r = 14 + 34 * ease(k)
                a = int(200 * (1 - k))
                d.ellipse([x - r, y - r, x + r, y + r], outline=(18, 181, 214, a), width=4)
                d.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45], fill=(127, 224, 240, int(a * 0.45)))
        x, y = self.cursor
        s = 1.25
        arrow = [(0, 0), (0, 26), (6.5, 20), (11, 30.5), (15.5, 28.5), (11, 19), (19, 19)]
        pts = [(x + px * s, y + py * s) for px, py in arrow]
        shadow = [(px + 1.5, py + 2) for px, py in pts]
        d.polygon(shadow, fill=(0, 0, 0, 70))
        d.polygon(pts, fill=(255, 255, 255, 255), outline=(11, 13, 15, 255))
        return im


def take_landing_close(p, base: str, raw: Path, fps: int, seconds: float, dry: bool, start_at: int) -> int:
    """Beat 8: the landing's name, still, as its own take (the map pages carry no name since the navbar fold)."""
    browser, _ = open_browser(p, True)
    ctx = browser.new_context(viewport={"width": W, "height": H})
    page = ctx.new_page()
    page.add_init_script("try { localStorage.setItem('theme', 'light') } catch (e) {}")
    page.add_init_script(CLOCK)
    page.goto(f"{base}/", wait_until="domcontentloaded")
    cdp = ctx.new_cdp_session(page)
    cdp.send("Animation.enable")
    cdp.send("Animation.setPlaybackRate", {"playbackRate": 0})
    film = Film(page, cdp, raw, fps, dry)
    film.n = start_at
    film.cursor = (-100, -100)  # no cursor in the close
    for _ in range(int(fps * 1.2)):  # the hero's entrance plays first, off the film
        page.evaluate(f"() => window.__clock.step({1000 / fps})")
        page.wait_for_timeout(8)
    page.evaluate(HOLD_MONITOR)
    film.hold(seconds)
    n = film.n
    ctx.close()
    browser.close()
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out", help="the film (OUT.mp4), or with --dry a folder for one frame per beat")
    ap.add_argument("--url", default="http://localhost:3251")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--dry", action="store_true", help="run every beat without making a film; one frame per beat for a look")
    args = ap.parse_args()
    out = Path(args.out)
    raw = (out if args.dry else out.with_suffix("")).parent / (out.stem + "_frames")
    shutil.rmtree(raw, ignore_errors=True)
    raw.mkdir(parents=True)
    base = args.url.rstrip("/")
    fps = args.fps
    checks: list[tuple[str, int]] = []
    started = time.time()

    with sync_playwright() as p:
        browser, _ = open_browser(p, True)
        ctx = browser.new_context(viewport={"width": W, "height": H})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script("try { localStorage.setItem('theme', 'light') } catch (e) {}")
        page.add_init_script(CLOCK)
        page.goto(f"{base}/", wait_until="domcontentloaded")
        cdp = ctx.new_cdp_session(page)
        cdp.send("Animation.enable")
        cdp.send("Animation.setPlaybackRate", {"playbackRate": 0})
        film = Film(page, cdp, raw, fps, args.dry)

        def mark(name: str):
            checks.append((name, film.n))
            if args.dry:
                cdp_shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 80})
                im = Image.open(io.BytesIO(base64.b64decode(cdp_shot["data"]))).convert("RGB")
                film.draw(im).save(raw / f"{len(checks):02d}_{name}.jpg", quality=85)
            print(f"  {name}: frame {film.n} ({film.n / fps:.1f} s)", flush=True)

        # the hero's entrance plays off the film, then the monitor is held on its frame
        for _ in range(int(fps * 1.2)):
            page.evaluate(f"() => window.__clock.step({1000 / fps})")
            page.wait_for_timeout(8)
        page.evaluate(HOLD_MONITOR)

        # 1  the landing: the name and the hook, then the click (3.5 s)
        film.hold(1.2)
        film.move(("css", ".hx-cta .btn"), 1.3)
        film.hold(0.3)
        mark("1_landing")
        film.click()
        # the guided map opens (a page change inside the app): the recorder waits for it, the film does not
        until = time.time() + 60
        while not page.evaluate(GUIDED_OPEN):
            if time.time() > until:
                raise RuntimeError("the guided map did not open")
            page.evaluate(f"() => window.__clock.step({1000 / fps})")
            page.wait_for_timeout(15)
        film.hold(3.5 - film.n / fps)

        # 2  the official map: the streets appear, 59% (6.5 s)
        film.hold(6.5)
        mark("2_official")

        # 3  our simulation: 76% (5 s)
        film.move(("button", [".gd-seg", "Our simulation"]), 0.9)
        film.click()
        film.hold(4.07)
        mark("3_simulation")

        # 4  in on Carrer del Sol, a tap: its card (7 s)
        film.js("([c, z]) => window.__guided.map().flyTo({ center: c, zoom: z, duration: 1400, essential: true })", [list(STREET), STREET_ZOOM])
        film.hold(1.6)
        film.move(("street", list(STREET)), 0.8)
        film.click()
        film.hold(4.57)
        mark("4_card")

        # 5  Next, NISAR: the line dragged across once, 57% against 36% (6 s)
        film.move(("button", [".gd-nav", "Next"]), 0.6)
        film.click()
        film.hold(1.9)
        film.move(("css", ".gd-swipe-knob"), 0.5)
        knob = film.where(("css", ".gd-swipe-knob"))
        film.drag((knob[0] - W * 0.16, knob[1]), 0.9)
        film.drag((knob[0] + W * 0.06, knob[1]), 0.8)
        film.hold(1.27)
        mark("5_nisar")

        # 6  where the map said safe: 205 km found outside every official zone, 71% right, chance 23% (9 s)
        film.move(("button", [".gd-nav", "Next"]), 0.5)
        film.click()
        film.hold(8.47)
        mark("6_safe")

        # 7  All layers (2 s)
        film.move(("button", [".gd-card", "All layers"]), 0.5)
        film.click()
        until = time.time() + 60
        while not page.evaluate(EXPLORE_OPEN):
            if time.time() > until:
                raise RuntimeError("All layers did not open")
            page.evaluate(f"() => window.__clock.step({1000 / fps})")
            page.wait_for_timeout(15)
        film.hold(1.47)
        mark("7_all_layers")
        main_frames, late = film.n, film.late
        ctx.close()
        browser.close()

        # 8  the landing's name, as its own take
        n = take_landing_close(p, base, raw, fps, 2.0, args.dry, main_frames)
        checks.append(("8_close", n))

    total = n / fps
    print(f"{n} frames, {total:.1f} s of film at {fps} a second, made in {time.time() - started:.0f} s"
          + (f"; {late} frames taken before everything was drawn" if late else ""))
    if errors:
        print("console errors:", *errors[:10], sep="\n  ")
    if total > 45:
        print("longer than 45 s: shorten the holds of beats 4 and 6 first")
    if args.dry:
        print(f"dry run: no film; one frame per beat in {raw}")
        return 0
    done = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", "%06d.jpg", "-c:v", "libx264", "-preset", "slow",
                           "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out.resolve())], cwd=raw, check=False)
    if done.returncode != 0:
        return 1
    # the single frames are only the film's material (about 350 MB at full HD): gone once the film is made
    shutil.rmtree(raw, ignore_errors=True)
    seconds = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(out)],
                             capture_output=True, text=True, check=False).stdout.strip()
    print(f"film -> {out} ({float(seconds or 0):.2f} s, {out.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
