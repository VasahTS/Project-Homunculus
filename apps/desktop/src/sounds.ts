// Homunculus 2 — the "reply finished" sound (Settings → General, D-082). Six are made by the app itself with Web Audio
// (no files; tried by Daniel on the canvas on 11/03), one is Daniel's own "pop" file, and the user can pick any file.
// CLAUDE, 2026-11-03.
import popUrl from "./sounds/pop.mp3";
import { getPrefs, type ReplySound } from "./prefs.ts";

export const SOUND_LABELS: Record<Exclude<ReplySound, "off">, string> = {
  chime: "Chime", "soft-click": "Soft Click", bell: "Bell", drop: "Drop", arpeggio: "Arpeggio", "low-gong": "Low Gong", pop: "Pop", custom: "Your File",
};

let ac: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ac ??= new Ctx();
    if (ac.state === "suspended") void ac.resume();
    return ac;
  } catch { return null; }
}

/** One soft note: a quick rise and an exponential fade (no clicks). */
function tone(ctx: AudioContext, volume: number, freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.3, glideTo?: number) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const v = Math.max(0.0002, volume * gain);
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

const SYNTH: Record<string, (ctx: AudioContext, v: number) => void> = {
  chime: (c, v) => { tone(c, v, 880, 0, 0.35); tone(c, v, 1318.5, 0.11, 0.5); },
  "soft-click": (c, v) => { tone(c, v, 1800, 0, 0.05, "triangle", 0.25); tone(c, v, 1200, 0.035, 0.06, "triangle", 0.15); },
  bell: (c, v) => { tone(c, v, 660, 0, 1.4, "sine", 0.3); tone(c, v, 1320, 0, 0.9, "sine", 0.12); tone(c, v, 1980, 0, 0.5, "sine", 0.06); },
  drop: (c, v) => { tone(c, v, 1400, 0, 0.25, "sine", 0.35, 420); },
  arpeggio: (c, v) => { tone(c, v, 659.3, 0, 0.3); tone(c, v, 784, 0.08, 0.3); tone(c, v, 1046.5, 0.16, 0.6); },
  "low-gong": (c, v) => { tone(c, v, 196, 0, 1.6, "sine", 0.4); tone(c, v, 293.7, 0, 1.2, "sine", 0.12); tone(c, v, 392, 0.02, 0.8, "triangle", 0.05); },
};

/** Plays a sound now (Settings → Test, or a reply that finished). Silent when it can't play; never throws. */
export function playSound(sound: ReplySound, volume0to100: number, customUrl = ""): void {
  if (sound === "off") return;
  const volume = Math.min(1, Math.max(0, volume0to100 / 100));
  if (volume === 0) return;
  try {
    if (sound === "pop" || sound === "custom") {
      const src = sound === "pop" ? popUrl : customUrl;
      if (!src) return;
      const el = new Audio(src);
      el.volume = volume;
      void el.play().catch(() => {});
      return;
    }
    const ctx = audio();
    if (ctx) SYNTH[sound]?.(ctx, volume);
  } catch { /* no sound device, or the window can't play yet */ }
}

/** The reply-finished sound, as Settings → General says. */
export function playReplySound(): void {
  const p = getPrefs();
  playSound(p.replySound, p.soundVolume, p.customSound);
}
