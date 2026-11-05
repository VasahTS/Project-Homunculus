// Homunculus 2 — the opening's sounds (D-091): a typewriter, its bell, a low strike, a breath of air and a soft landing.
// All made with Web Audio, no files. Levels were measured (offline render): the strike, the loudest moment, peaks at about
// −15 dBFS, like the reply chime at the default volume (−14); the keys sit near −24 and the soft keys near −35, so it is
// present without startling. CLAUDE, 2026-11-04.

export interface OpeningSound {
  key(): void;
  keySoft(): void;
  bell(): void;
  hit(): void;
  glide(): void;
  land(): void;
  /** Stops anything still ringing (the opening was skipped). */
  hush(): void;
}

/** The overall level (Daniel: "light, not too low and not too loud, so it doesn't startle"). See the levels above. */
export const OPENING_LEVEL = 0.9;

/** Makes the sounds, or null when this window can't play sound yet (no device, or audio not allowed before a click). */
export function openingSound(level = OPENING_LEVEL): OpeningSound | null {
  let ac: AudioContext;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
    if (ac.state === "suspended") void ac.resume().catch(() => {});
  } catch { return null; }
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  const master = ac.createGain();
  master.gain.value = level;
  master.connect(comp).connect(ac.destination);
  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const live: AudioScheduledSourceNode[] = [];
  const now = () => ac.currentTime;
  const env = (g: GainNode, t: number, peak: number, att: number, dec: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  };
  const osc = (type: OscillatorType, f: number, t: number, peak: number, att: number, dec: number, f2?: number, glide?: number) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide ?? dec));
    env(g, t, peak, att, dec);
    o.connect(g).connect(master); o.start(t); o.stop(t + att + dec + 0.05); live.push(o);
  };
  const nz = (t: number, peak: number, att: number, dec: number, type: BiquadFilterType, f: number, f2?: number, q = 1) => {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + att + dec);
    fl.Q.value = q;
    env(g, t, peak, att, dec);
    s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + att + dec + 0.05); live.push(s);
  };
  const safe = (f: () => void) => () => { try { if (ac.state !== "closed") f(); } catch { /* never let a sound break the opening */ } };
  return {
    // a type bar striking the platen: a short click plus a low thock, a little different each time
    key: safe(() => { const t = now(), r = Math.random(); nz(t, 0.5, 0.001, 0.035, "bandpass", 2600 + r * 1600, undefined, 2.5); osc("sine", 150 + r * 30, t, 0.22, 0.001, 0.05, 90); nz(t + 0.014, 0.12, 0.001, 0.02, "highpass", 5000); }),
    keySoft: safe(() => { const t = now(), r = Math.random(); nz(t, 0.16, 0.001, 0.025, "bandpass", 3500 + r * 1500, undefined, 3); osc("sine", 220, t, 0.06, 0.001, 0.03); }),
    bell: safe(() => { const t = now(); [1, 2.76, 5.4].forEach((m, i) => osc("sine", 1975 * m, t, [0.09, 0.04, 0.02][i]!, 0.002, 1.4 - i * 0.35)); }),
    hit: safe(() => { const t = now(); osc("sine", 95, t, 0.55, 0.004, 0.7, 38, 0.5); nz(t, 0.25, 0.002, 0.35, "lowpass", 900, 120); }),
    glide: safe(() => { const t = now(); nz(t, 0.1, 0.45, 0.4, "bandpass", 1800, 350, 0.8); }),
    land: safe(() => { const t = now(); osc("sine", 220, t, 0.08, 0.12, 0.9, 165); nz(t, 0.05, 0.08, 0.5, "lowpass", 1600, 300); osc("sine", 110, t, 0.12, 0.01, 0.5, 90); }),
    hush: () => {
      for (const n of live.splice(0)) { try { n.stop(); } catch { /* already stopped */ } }
      setTimeout(() => { void ac.close().catch(() => {}); }, 200);
    },
  };
}
