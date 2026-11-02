// Homunculus 2 — Settings → Customize: which look is on, its tweaks, the user's own looks, motion. CLAUDE, 2026-11-01 (D-075).
//
// Saved as one app setting ("appearance"), applied to the whole window at once. A look (theme/themes.ts) is data;
// tweaks are kept per look and never change the look itself; editing a built-in look's colors or CSS makes an
// editable copy first. Motion (on, speed, follow the system's "reduce motion") is read by ui/motion.ts and by CSS
// through data-motion / data-motion-speed on <html>.
import { useSyncExternalStore } from "react";
import { applyProfile, BUILTIN_PROFILES, DEFAULT_PROFILE_ID, type AppearanceProfile } from "./themes.ts";
import { applyMessageLook } from "../messageLook.ts";

export type MotionSpeed = "calm" | "normal" | "quick";
export interface MotionPrefs { on: boolean; speed: MotionSpeed; followSystem: boolean }
export interface LookTweaks { accent?: string; storyFont?: "prose" | "ui"; storySize?: number }
export interface AppearanceState {
  activeId: string;
  tweaks: Record<string, LookTweaks>;
  custom: AppearanceProfile[];
  motion: MotionPrefs;
}

const KEY = "appearance";
export const LOOK_FORMAT = "homunculus-look@1";
const DEFAULT_STATE: AppearanceState = { activeId: DEFAULT_PROFILE_ID, tweaks: {}, custom: [], motion: { on: true, speed: "normal", followSystem: true } };
export const MOTION_FACTOR: Record<MotionSpeed, number> = { calm: 1.35, normal: 1, quick: 0.65 };
/** Accent choices offered for every look (its own accent comes first). */
export const ACCENTS = ["#f2f2f2", "#e8e1d4", "#bdbdbd", "#8bc4b0", "#86b4e6", "#e2474c", "#e6bf7e"];

let state: AppearanceState = DEFAULT_STATE;
/** Ctrl+Shift+0: the look's extra CSS is skipped until the app restarts (a way out of CSS that broke the screen). */
let safeMode = false;
const listeners = new Set<() => void>();
interface Store { getAppSetting<T>(key: string): Promise<T | undefined>; setAppSetting(key: string, value: unknown): Promise<void> }
let store: Store | null = null;

export const allLooks = (s: AppearanceState = state): AppearanceProfile[] => [...BUILTIN_PROFILES, ...s.custom];
export const isBuiltin = (id: string): boolean => BUILTIN_PROFILES.some((p) => p.id === id);
export const activeLook = (s: AppearanceState = state): AppearanceProfile =>
  allLooks(s).find((p) => p.id === s.activeId) ?? BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID) ?? BUILTIN_PROFILES[0]!;

/** Black or white text on a color, whichever reads better (WCAG luminance). */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0d0d0d";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#0d0d0d" : "#ffffff";
}

/** The look with its tweaks folded into its tokens: what is actually applied. */
export function resolvedLook(s: AppearanceState = state): AppearanceProfile {
  const look = activeLook(s);
  const t = s.tweaks[look.id] ?? {};
  const tokens = { ...look.tokens };
  if (t.accent) {
    tokens.accent = t.accent;
    tokens["accent-ink"] = inkOn(t.accent);
    tokens["accent-soft"] = `color-mix(in srgb, ${t.accent} 10%, transparent)`;
    tokens["focus-ring"] = `color-mix(in srgb, ${t.accent} 60%, transparent)`;
  }
  if (t.storyFont === "ui") tokens["font-prose"] = "var(--font-ui)";
  if (t.storySize) tokens["size-prose"] = `${t.storySize}px`;
  return { ...look, tokens, css: safeMode ? "" : look.css };
}

function apply(): void {
  if (typeof document === "undefined") return;
  applyProfile(resolvedLook());
  applyMessageLook();
  const root = document.documentElement;
  root.dataset.motion = motionOff() ? "off" : "on";
  root.dataset.motionSpeed = state.motion.speed;
  root.dataset.followSystem = state.motion.followSystem ? "yes" : "no";
  root.style.setProperty("--motion-k", String(MOTION_FACTOR[state.motion.speed]));
}

const emit = () => listeners.forEach((f) => f());
async function save(next: AppearanceState): Promise<void> {
  state = next;
  apply();
  emit();
  await store?.setAppSetting(KEY, state);
}

/** Reads the saved choice once the database is open (the default look is applied before that). */
export async function loadAppearance(s: Store): Promise<void> {
  if (store === s) return;
  store = s;
  const saved = await s.getAppSetting<Partial<AppearanceState>>(KEY).catch(() => undefined);
  state = { ...DEFAULT_STATE, ...(saved ?? {}), motion: { ...DEFAULT_STATE.motion, ...(saved?.motion ?? {}) } };
  state.custom = (state.custom ?? []).flatMap((p) => { try { return [cleanLook(p)]; } catch { return []; } });
  apply();
  emit();
}
/** Applies the default look before anything is loaded (first paint). */
export function applyDefaultAppearance(): void { apply(); }

export const setActiveLook = (id: string) => save({ ...state, activeId: id });
export const setTweaks = (id: string, patch: LookTweaks) => {
  const next = { ...(state.tweaks[id] ?? {}), ...patch };
  for (const k of Object.keys(next) as Array<keyof LookTweaks>) if (next[k] === undefined) delete next[k];
  return save({ ...state, tweaks: { ...state.tweaks, [id]: next } });
};
export const resetTweaks = (id: string) => { const tweaks = { ...state.tweaks }; delete tweaks[id]; return save({ ...state, tweaks }); };
export const setMotion = (patch: Partial<MotionPrefs>) => save({ ...state, motion: { ...state.motion, ...patch } });

/** Saves a user look (new or changed). */
export const saveLook = (look: AppearanceProfile) =>
  save({ ...state, custom: state.custom.some((p) => p.id === look.id) ? state.custom.map((p) => (p.id === look.id ? look : p)) : [...state.custom, look] });
export const deleteLook = (id: string) =>
  save({ ...state, custom: state.custom.filter((p) => p.id !== id), activeId: state.activeId === id ? DEFAULT_PROFILE_ID : state.activeId });

/** An editable copy of a look (Duplicate, or the first edit of a built-in look), switched on. */
export async function copyLook(from: AppearanceProfile, name = `${from.name} (edited)`): Promise<AppearanceProfile> {
  const copy: AppearanceProfile = { ...structuredClone(from), id: `look-${crypto.randomUUID().slice(0, 8)}`, name, description: from.description };
  const tweaks = state.tweaks[from.id];
  await save({ ...state, custom: [...state.custom, copy], activeId: copy.id, tweaks: tweaks ? { ...state.tweaks, [copy.id]: { ...tweaks } } : state.tweaks });
  return copy;
}

/** The file a look is exported as. */
export const exportLook = (look: AppearanceProfile): string =>
  JSON.stringify({ format: LOOK_FORMAT, name: look.name, description: look.description, layout: look.layout, tokens: look.tokens, css: look.css ?? "", effects: look.effects, tweaks: look.tweaks }, null, 2);

const SAFE_VALUE = /^[^;{}<>]{0,300}$/;
const TOKEN_NAME = /^[a-z][a-z0-9-]{0,40}$/;
/** Checks a look read from a file or from the database; throws a readable error. */
export function cleanLook(raw: unknown): AppearanceProfile {
  if (!raw || typeof raw !== "object") throw new Error("This file is not a look.");
  const r = raw as Record<string, unknown>;
  if (r.format !== undefined && r.format !== LOOK_FORMAT) throw new Error(`Unknown format “${String(r.format)}”. Homunculus reads ${LOOK_FORMAT} files.`);
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : "";
  if (!name) throw new Error("The look has no name.");
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.tokens as Record<string, unknown>) ?? {})) {
    if (TOKEN_NAME.test(k) && typeof v === "string" && SAFE_VALUE.test(v)) tokens[k] = v;
  }
  const css = typeof r.css === "string" ? r.css.slice(0, 20000) : "";
  if (/@import|url\(\s*["']?\s*(https?:|\/\/)/i.test(css)) throw new Error("The look's CSS loads something from the internet; looks can't do that.");
  return {
    id: typeof r.id === "string" && /^look-[a-z0-9-]{1,40}$/.test(r.id) ? r.id : `look-${crypto.randomUUID().slice(0, 8)}`,
    name, description: typeof r.description === "string" ? r.description.slice(0, 200) : "",
    layout: "inspector", effects: [], tweaks: {}, tokens, css,
  };
}
export async function importLook(text: string): Promise<AppearanceProfile> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file is not a look (not JSON)."); }
  const look = cleanLook({ ...(raw as object), id: undefined });
  await save({ ...state, custom: [...state.custom, look], activeId: look.id });
  return look;
}

export function toggleSafeMode(): boolean { safeMode = !safeMode; apply(); emit(); return safeMode; }
export const inSafeMode = () => safeMode;

/** Motion is off: switched off in Customize, or the system asks for less and Customize follows it. */
export function motionOff(): boolean {
  if (!state.motion.on) return true;
  return state.motion.followSystem && typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export const motionFactor = (): number => MOTION_FACTOR[state.motion.speed];

export function useAppearance(): AppearanceState {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => state, () => state);
}
export const useSafeMode = (): boolean => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => safeMode, () => safeMode);
