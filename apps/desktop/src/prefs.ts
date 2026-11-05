// Homunculus 2 — app preferences from Settings v2 (General, Chat, Appearance, Data). One object in app_settings, shared by
// every screen like messageLook.ts. Defaults keep how the app behaved before Settings v2. CLAUDE, 2026-11-03 (D-082).
import { useSyncExternalStore } from "react";

export type OpenAt = "home" | "last" | "stories" | "characters" | "card-browser";
const OPEN_AT: OpenAt[] = ["home", "last", "stories", "characters", "card-browser"];
/** Browser click tests drive the app from the sidebar, so for them it opens at the last chat as before Home (D-086). */
const automated = typeof navigator !== "undefined" && navigator.webdriver === true;
export type ReplySound = "off" | "chime" | "soft-click" | "bell" | "drop" | "arpeggio" | "low-gong" | "pop" | "custom";
export type ChatWidth = "narrow" | "medium" | "wide" | "full";
export type Thinking = "hidden" | "folded" | "open";
export type AvatarShape = "round" | "square" | "portrait" | "hidden";
export type AvatarSize = "small" | "medium" | "large";
export type CardSize = "s" | "m" | "l";
export type AutoBackup = "off" | "daily" | "weekly";
/** Quick Replies (D-090): a bar of buttons above the box (like SillyTavern), one button that opens a list, or none. */
export type QuickReplyStyle = "bar" | "drawer" | "off";
const QR_STYLES: QuickReplyStyle[] = ["bar", "drawer", "off"];

export interface AppPrefs {
  // General
  openAt: OpenAt;
  replyNotice: boolean;
  replySound: ReplySound;
  /** 0–100. */
  soundVolume: number;
  /** "Choose a File…": the user's own sound, as a data: URL (at most ~2 MB). */
  customSound: string;
  customSoundName: string;
  systemNotify: boolean;
  spoilerFree: boolean;
  // Chat
  showTime: boolean;
  showNumber: boolean;
  showTokens: boolean;
  swipeArrows: boolean;
  gestures: boolean;
  chatWidth: ChatWidth;
  thinking: Thinking;
  smoothText: boolean;
  /** Words per second while Smooth text is on. */
  smoothSpeed: number;
  followReply: boolean;
  autoContinue: boolean;
  continueTimes: number;
  /** How many of the newest messages the chat draws (SillyTavern's "# Msg. to Load"); 0 = all. Older ones wait behind "Show earlier". */
  messagesToShow: number;
  quickReplies: QuickReplyStyle;
  // Appearance
  lineSpacing: number;
  avatarShape: AvatarShape;
  avatarSize: AvatarSize;
  cardSize: CardSize;
  // Data
  autoBackup: AutoBackup;
  keepBackups: number;
  /** 0 = never. */
  emptyTrashDays: number;
  /** Home was offered once as where the app opens (D-086); a setting saved before Home exists has no such key. */
  homeOffered: boolean;
}

export const DEFAULT_PREFS: AppPrefs = {
  openAt: automated ? "last" : "home", replyNotice: true, replySound: "off", soundVolume: 60, customSound: "", customSoundName: "", systemNotify: false, spoilerFree: false,
  showTime: true, showNumber: true, showTokens: true, swipeArrows: true, gestures: false, chatWidth: "medium", thinking: "folded",
  smoothText: false, smoothSpeed: 60, followReply: true, autoContinue: false, continueTimes: 2, messagesToShow: 50, quickReplies: "bar",
  lineSpacing: 1.72, avatarShape: "hidden", avatarSize: "medium", cardSize: "m",
  autoBackup: "off", keepBackups: 10, emptyTrashDays: 0, homeOffered: true,
};

const KEY = "app.prefs";
let prefs: AppPrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();
interface Store { getAppSetting<T>(key: string): Promise<T | undefined>; setAppSetting(key: string, value: unknown): Promise<void> }
let store: Store | null = null;

const WIDTH: Record<ChatWidth, string> = { narrow: "600px", medium: "720px", wide: "940px", full: "100%" };
/** Chat width and line spacing are CSS variables the chat already reads (--story-w, --leading-prose). */
function apply(p: AppPrefs = prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // at their defaults the look's own values stay (a look may set them)
  if (p.chatWidth === DEFAULT_PREFS.chatWidth) root.style.removeProperty("--story-w"); else root.style.setProperty("--story-w", WIDTH[p.chatWidth] ?? WIDTH.medium);
  if (p.lineSpacing === DEFAULT_PREFS.lineSpacing) root.style.removeProperty("--leading-prose"); else root.style.setProperty("--leading-prose", String(p.lineSpacing));
  root.dataset.avatars = p.avatarShape;
  root.dataset.avatarSize = p.avatarSize;
  root.dataset.swipeArrows = p.swipeArrows ? "on" : "off";
}

/** Only known keys with the right type survive (an old or hand-edited setting can't break the app). */
export function cleanPrefs(saved: unknown): AppPrefs {
  const out: AppPrefs = { ...DEFAULT_PREFS };
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!Object.hasOwn(DEFAULT_PREFS, k)) continue;
    const want = typeof DEFAULT_PREFS[k as keyof AppPrefs];
    if (typeof v === want && (want !== "number" || Number.isFinite(v))) (out as unknown as Record<string, unknown>)[k] = v;
  }
  out.soundVolume = Math.min(100, Math.max(0, out.soundVolume));
  out.smoothSpeed = Math.min(200, Math.max(5, out.smoothSpeed));
  out.continueTimes = Math.min(5, Math.max(1, Math.round(out.continueTimes)));
  out.messagesToShow = Math.min(1000, Math.max(0, Math.round(out.messagesToShow)));
  out.lineSpacing = Math.min(2.4, Math.max(1.1, out.lineSpacing));
  out.keepBackups = Math.min(100, Math.max(1, Math.round(out.keepBackups)));
  out.emptyTrashDays = Math.max(0, Math.round(out.emptyTrashDays));
  if (!OPEN_AT.includes(out.openAt)) out.openAt = DEFAULT_PREFS.openAt;
  if (!QR_STYLES.includes(out.quickReplies)) out.quickReplies = DEFAULT_PREFS.quickReplies;
  return out;
}

export async function loadPrefs(s: Store): Promise<AppPrefs> {
  if (store === s) return prefs;
  store = s;
  const saved = await s.getAppSetting(KEY).catch(() => undefined);
  prefs = cleanPrefs(saved);
  // D-086: settings saved before Home said "Last chat" because it was the only default; open on Home once, Settings can change it back
  if (saved && typeof saved === "object" && !("homeOffered" in saved) && !automated) {
    if (prefs.openAt === "last") prefs = { ...prefs, openAt: "home" };
    await s.setAppSetting(KEY, prefs).catch(() => {});
  }
  apply(prefs);
  listeners.forEach((f) => f());
  return prefs;
}

export async function setPrefs(patch: Partial<AppPrefs>): Promise<void> {
  prefs = cleanPrefs({ ...prefs, ...patch });
  apply(prefs);
  listeners.forEach((f) => f());
  await store?.setAppSetting(KEY, prefs);
}

export const getPrefs = (): AppPrefs => prefs;

export function usePrefs(): AppPrefs {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => prefs, () => prefs);
}

if (typeof document !== "undefined") apply(prefs);
