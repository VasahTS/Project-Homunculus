// Site pauses: when a site refuses (rate limit, Cloudflare, human check), asking again right away only makes it worse,
// so the refusal is remembered and the site is left alone until the pause ends. Port of Homunculus v1
// src/endpoints/classic-card-browser.js "Site pauses" (VasahTS/Homunculus 0884338a). CLAUDE, 2026-11-02 (T-008).
import type { SiteResponse } from "./types.ts";

export type RefusalKind = "rate" | "cloudflare" | "verify";
const NAMES: Record<string, string> = { chub: "ChubAI", janny: "JannyAI", wyvern: "Wyvern", pygmalion: "Pygmalion", datacat: "DataCat" };
const PAUSE_MS: Record<RefusalKind, number> = { rate: 10 * 60_000, cloudflare: 5 * 60_000, verify: 30 * 60_000 };

/** Something a site did that the screen shows as a notice. `kind` "http" = an ordinary failure (try again). */
export class SiteError extends Error {
  constructor(message: string, readonly site: string, readonly kind: RefusalKind | "http" | "data", readonly retryInMs = 0, readonly status = 0) { super(message); }
  /** The site is pausing us: the screen offers "Open <site>" and "Import a Downloaded File…". */
  get paused() { return this.kind === "rate" || this.kind === "cloudflare" || this.kind === "verify"; }
}

export function siteName(key: string): string { return NAMES[key.split(":")[0]!] ?? "The site"; }

export function refusalKind(r: Pick<SiteResponse, "status" | "cfMitigated" | "text">): RefusalKind | "" {
  if (r.status === 429) return "rate";
  if (r.status !== 403 && r.status !== 503) return "";
  const body = r.text ?? "";
  if (/"turnstile"\s*:/.test(body)) return "verify";
  if (r.cfMitigated || /Just a moment|cf-challenge|challenge-platform|_cf_chl_opt|Attention Required! \| Cloudflare/.test(body)) return "cloudflare";
  return "";
}

export function pauseMessage(key: string, kind: RefusalKind, retryInMs: number): string {
  const name = siteName(key);
  const minutes = Math.max(1, Math.ceil(retryInMs / 60_000));
  if (kind === "rate") return `${name} asked this app to slow down (too many requests). Try again in about ${minutes} min.`;
  const part = key.split(":")[1] ?? "";
  if (part === "search" || part === "page" || part === "") return `${name} is blocking requests from this app right now (Cloudflare). Try again in about ${minutes} min.`;
  if (kind === "verify") return `${name} now asks for a human check before a card can be downloaded, which this app cannot do for you. Open the card on ${name}, download it there, then use Import a Downloaded File.`;
  return `${name} is showing its "checking your browser" page to this app, so the card cannot be downloaded from here right now. Open the card on ${name}, download it there, then use Import a Downloaded File.`;
}

/** Remembered refusals, in memory only (a restart clears them). Keys: "site" or "site:part". */
export class Pauses {
  private readonly map = new Map<string, { until: number; kind: RefusalKind; status: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  /** Throws a SiteError when this site (or this part of it) is paused. */
  check(key: string): void {
    const t = this.now();
    for (const k of new Set([key.split(":")[0]!, key])) {
      const p = this.map.get(k);
      if (!p) continue;
      if (p.until <= t) { this.map.delete(k); continue; }
      throw new SiteError(pauseMessage(k, p.kind, p.until - t), k.split(":")[0]!, p.kind, p.until - t, p.status);
    }
  }
  /** A rate limit pauses the whole site; the other refusals only the part that was refused. Returns the pause length. */
  pause(key: string, kind: RefusalKind, status: number, retryAfterSecs?: number): number {
    const ms = retryAfterSecs && retryAfterSecs > 0 ? Math.min(60 * 60_000, Math.max(30_000, retryAfterSecs * 1000)) : PAUSE_MS[kind];
    this.map.set(kind === "rate" ? key.split(":")[0]! : key, { until: this.now() + ms, kind, status });
    return ms;
  }
  clear(): void { this.map.clear(); }
}

export const pauses = new Pauses();
