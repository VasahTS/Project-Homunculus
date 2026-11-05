// Homunculus 2 — the opening (D-091): draft C, "Typewriter", that Daniel picked on the canvas on 11/04.
// HOMUNCULUS is typed in the interface face, a flash and a low strike turn it into the display face over the spire, "ars
// narrandi" is typed under it, then everything goes where it lives on Home: the name glides into the hero plate's title,
// the spire shrinks into the Assistant plate, and the plates arrive one by one with the app's own cascade. When the app
// opens somewhere else, the opening fades out instead. A click or any key skips it; Settings → General can skip it always
// or play it without sound. It never plays with motion off, nor in click tests unless a test asks. CLAUDE, 2026-11-04.
import { useLayoutEffect, useRef, useState } from "react";
import spire from "../assets/home/spire.png";
import { openingSound, type OpeningSound } from "../openingSound.ts";
import { openingMode } from "../prefs.ts";
import { motionOff } from "../theme/appearance.ts";
import { CASCADE, EASE_IN_OUT, EASE_OUT } from "./motion.ts";

const NAME = "Homunculus";
const SUBTITLE = "ars narrandi";
/** The spire picture's own size (assets/home/spire.png), for placing it exactly where Home's cover-fit copy sits. */
const SPIRE_W = 1080, SPIRE_H = 1016;
/** When the pieces leave for Home, and how long the trip takes (ms). */
const GO = 2950, TRIP = 850;

interface Box { x: number; y: number; w: number; h: number }
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
/** Where object-fit: cover puts the spire inside a w×h box, at object-position center / `py`. */
function cover(w: number, h: number, py: number) {
  const s = Math.max(w / SPIRE_W, h / SPIRE_H);
  const iw = SPIRE_W * s, ih = SPIRE_H * s;
  return { s, x: (w - iw) / 2, y: (h - ih) * py, iw, ih };
}

/** Whether the opening runs at this start, and with sound. Decided once, before the first paint. */
function startMode(): "play" | "silent" | null {
  const m = openingMode();
  if (m === "skip" || motionOff()) return null;
  return m;
}

/** Decided when this file loads, before the app's own code runs. */
const START = typeof window !== "undefined" ? startMode() : null;
/** Skips the running opening (set by the component; null when none runs). */
let skipNow: (() => void) | null = null;
/** True until the opening has ended (played through or skipped). */
let up = START !== null;
// A key skips the opening and does nothing else (Ctrl+H, Esc… must not reach the app). Listening from here, before the
// app adds its own shortcuts, so this listener runs first and can stop the key for every other one.
if (START) {
  const onKey = (e: KeyboardEvent) => {
    if (!up) { window.removeEventListener("keydown", onKey, true); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    // a modifier alone waits for its key (Ctrl+H skips on the H, so the H can't reach the app afterwards)
    if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;
    skipNow?.();
  };
  window.addEventListener("keydown", onKey, true);
}

export function Opening() {
  const [mode] = useState(() => START);
  const [done, setDone] = useState(mode === null);
  const root = useRef<HTMLDivElement>(null);
  const finish = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !mode) return;
    const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const typed = $(".opening-typed"), caret = $(".opening-caret"), word = $(".opening-word"), line = $(".opening-line");
    const spireWrap = $(".opening-spire"), img = $<HTMLImageElement>(".opening-spire img"), dark = $(".opening-dark"), flash = $(".opening-flash");
    const anims: Animation[] = [];
    const timers: number[] = [];
    const sound: OpeningSound | null = mode === "play" ? openingSound() : null;
    let ended = false;
    const A = (target: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      const a = target.animate(keyframes, { fill: "both", easing: EASE_OUT, ...options });
      anims.push(a);
      return a;
    };
    const at = (ms: number, f: () => void) => { timers.push(window.setTimeout(f, ms)); };
    const S = (name: Exclude<keyof OpeningSound, "hush">, ms: number) => { if (sound) at(ms, () => sound[name]()); };
    const end = (skipped: boolean) => {
      if (ended) return;
      ended = true;
      skipNow = null;
      up = false;
      timers.forEach(clearTimeout);
      // skipped: everything goes back to how the app draws it (the real title and spire show at once)
      if (skipped) { anims.forEach((a) => a.cancel()); sound?.hush(); }
      else window.setTimeout(() => sound?.hush(), 1500);
      setDone(true);
    };
    finish.current = () => end(true);
    skipNow = finish.current;

    // starts once the faces are in and the window is on screen (it is born hidden and appears when the page has loaded,
    // D-091), so the first letters are never typed unseen or in a fallback face; never waits more than a moment
    const ready = (): Promise<void> => {
      const fonts = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 800))]);
      const visible = document.visibilityState === "visible" ? Promise.resolve() : new Promise<void>((r) => {
        const go = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", go); r(); } };
        document.addEventListener("visibilitychange", go);
        setTimeout(() => { document.removeEventListener("visibilitychange", go); r(); }, 3000);
      });
      return Promise.all([fonts, visible]).then(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    };
    const run = () => {
      if (ended) return;

    // the letters are laid out from the start (nothing reflows), and each one settles in on its beat
    const letters = (box: HTMLElement, text: string) => {
      box.replaceChildren(...[...text].map((c) => { const s = document.createElement("span"); s.className = "opening-ch"; s.textContent = c; return s; }));
      return [...box.children] as HTMLElement[];
    };

    // the spire is full-bleed, placed by hand so it can shrink exactly onto Home's copy later; measured at the strike,
    // when the window has had time to open maximized
    let full = cover(window.innerWidth, window.innerHeight, 0.3);
    const fullAt = () => `translate(${full.x}px, ${full.y}px) scale(1)`;

    // 1. the cursor, then HOMUNCULUS typed at a steady pace with a hair of human unevenness, and the bell
    A(caret, [{ opacity: 1 }, { opacity: 0 }], { duration: 420, iterations: Infinity, easing: "steps(1, end)", direction: "alternate" });
    let t = 360;
    const keys = letters(typed, NAME.toUpperCase());
    typed.prepend(caret); // the caret waits where the first letter will land, not after the whole (still hidden) word
    keys.forEach((ch, i) => {
      const ms = t;
      t += 72 + ((i * 37) % 9) - 4;
      A(ch, [{ opacity: 0, transform: "translateY(5px)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { delay: ms, duration: 150 });
      at(ms, () => ch.after(caret));
      S("key", ms);
    });
    S("bell", t + 60);
    // 2. the strike: a flash and a low hit; the name in the display face over the spire
    const strike = 1350;
    S("hit", strike);
    A(flash, [{ opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { delay: strike, duration: 260, easing: "linear" });
    A($(".opening-type"), [{ opacity: 1 }, { opacity: 0 }], { delay: strike + 40, duration: 10 });
    at(strike, () => {
      full = cover(window.innerWidth, window.innerHeight, 0.3);
      Object.assign(img.style, { width: `${full.iw}px`, height: `${full.ih}px`, transform: fullAt() });
      A(spireWrap, [{ opacity: 0 }, { opacity: 1 }], { delay: 40, duration: 900 });
    });
    A(word, [{ opacity: 0, transform: "scale(1.03)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { delay: strike + 40, duration: 600 });
    // 3. the subtitle, typed softly, then held long enough to read
    letters(line, SUBTITLE).forEach((ch, i) => {
      const ms = 1800 + i * 45;
      A(ch, [{ opacity: 0, transform: "translateY(4px)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { delay: ms, duration: 220 });
      if (SUBTITLE[i] !== " ") S("keySoft", ms);
    });

    // 4. everything goes where it lives. Measured at that moment: the window may have been maximized meanwhile.
    at(GO, () => {
      const home = document.querySelector('[data-testid="home"]');
      const title = home?.querySelector(".plate-hero .home-wordmark");
      const art = home?.querySelector(".plate-art-plate .plate-art");
      A(line, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-10px)" }], { duration: 260, fill: "forwards" });
      if (!home || !title || !art) {
        // the app opens somewhere else: the opening simply clears
        A(el, [{ opacity: 1 }, { opacity: 0 }], { delay: 120, duration: 520, fill: "forwards" });
        at(660, () => end(false));
        return;
      }
      S("glide", 0);
      const from = boxOf(word), to = boxOf(title), plate = boxOf(art);
      // the name: a straight glide and shrink onto the title (same face, so only its size changes)
      A(word, [{ transform: "none" }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.h / from.h})` }],
        { duration: TRIP, easing: EASE_IN_OUT, fill: "forwards" });
      // the spire: shrinks onto the Assistant plate's picture, cropped like it, while the frame closes around the plate
      const small = cover(plate.w, plate.h, 0.3), k = small.s / full.s;
      const W = window.innerWidth, H = window.innerHeight;
      A(spireWrap, [{ clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: `inset(${plate.y}px ${W - plate.x - plate.w}px ${H - plate.y - plate.h}px ${plate.x}px)` }],
        { duration: TRIP, easing: EASE_IN_OUT, fill: "forwards" });
      A(img, [{ transform: fullAt(), filter: "brightness(.55)" }, { transform: `translate(${plate.x + small.x}px, ${plate.y + small.y}px) scale(${k})`, filter: "brightness(1)" }],
        { duration: TRIP, easing: EASE_IN_OUT, fill: "forwards" });
      A(dark, [{ opacity: 1 }, { opacity: 0 }], { delay: 120, duration: 600, fill: "forwards" });
      // Home under it: its real title and spire wait for their copies; the rest arrives with the app's cascade
      for (const real of [title, art]) A(real, [{ opacity: 0 }, { opacity: 0 }], { duration: TRIP, fill: "backwards" });
      const hero = home.querySelector(".plate-hero > .plate-art");
      if (hero) A(hero, [{ opacity: 0 }, { opacity: 1 }], { delay: 150, duration: 700, fill: "backwards" });
      const groups: Element[][] = [
        [...home.querySelectorAll(".home-top > *")],
        [...home.querySelectorAll(".home-continue")],
        ...[...home.querySelectorAll(".home-grid > .plate:not(.plate-hero):not(.plate-art-plate)")].map((p) => [...p.children]),
        [...home.querySelectorAll(".plate-art-plate .plate-art-body")],
      ];
      groups.forEach((g, i) => g.forEach((x) => A(x, [{ opacity: 0, transform: `translateY(${CASCADE.y}px)` }, { opacity: 1, transform: "none" }],
        { delay: 250 + i * (CASCADE.stagger ?? 85), duration: CASCADE.duration ?? 900, fill: "backwards" })));
      S("land", TRIP - 60);
      at(TRIP, () => end(false));
    });

    };
    void ready().then(run);

    return () => { ended = true; timers.forEach(clearTimeout); anims.forEach((a) => a.cancel()); sound?.hush(); };
  }, [mode]);


  if (done) return null;
  return (
    <div className="opening" ref={root} data-testid="opening" aria-hidden onPointerDown={(e) => { e.preventDefault(); finish.current(); }}>
      <div className="opening-dark" />
      <div className="opening-spire"><img src={spire} alt="" draggable={false} /></div>
      <div className="opening-type"><span className="opening-typed" /><span className="opening-caret" /></div>
      <div className="opening-center">
        <h2 className="opening-word">{NAME}</h2>
        <div className="opening-line" />
      </div>
      <div className="opening-flash" />
      <div className="opening-skip">Click or press any key to skip</div>
    </div>
  );
}
