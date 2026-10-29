// Homunculus 2 — updates from GitHub Releases (D-037). Author: CLAUDE, 2026-10-29.
// The installed app asks GitHub, a few seconds after it opens, whether a newer version exists (the
// `latest.json` that the "Publicar versão" workflow uploads). It never updates on its own: a quiet bar
// offers "Update & Restart", and Settings → About has "Check for Updates".
// Off in: the browser preview, `npm run app` (dev), and portable copies (those keep "Atualizar Homunculus.bat").
// Each update is signed; the app only installs files signed with the project's key (pubkey in tauri.conf.json).
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop } from "./db.ts";

export type UpdateState =
  | { kind: "off"; why: "preview" | "dev" | "portable" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; checkedAt: number }
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "restarting"; version: string }
  | { kind: "error"; during: "check" | "install"; message: string; version?: string };

export interface Updates {
  state: UpdateState;
  /** The version running now (from apps/desktop/package.json, kept equal to tauri.conf.json by the release script). */
  current: string;
  /** "Later" closes the bar until the next start or the next "Check for Updates". */
  dismissed: boolean;
  check(): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

/** What the updater plugin hands back, reduced to what the app uses (the fake one for tests has the same shape). */
interface Pending {
  version: string;
  body?: string | null;
  downloadAndInstall(onEvent: (e: DownloadEvent) => void): Promise<void>;
}
type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

/**
 * Click tests and the browser preview: `globalThis.__h2FakeUpdate = { version, notes, fail }` before the page
 * loads makes the app behave as if GitHub had a newer version. Never used by the desktop app.
 */
interface FakeUpdate { version: string; notes?: string; fail?: string }
const fake = (): FakeUpdate | undefined => (globalThis as { __h2FakeUpdate?: FakeUpdate }).__h2FakeUpdate;

const FIRST_CHECK_MS = 4_000;            // let the app finish opening first
const RECHECK_MS = 6 * 60 * 60 * 1_000;  // an app left open all day still hears about a new version

async function whyOff(): Promise<"preview" | "dev" | "portable" | null> {
  if (!isDesktop) return fake() ? null : "preview";
  if (import.meta.env.DEV) return "dev";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const where = await invoke<{ portable: boolean }>("data_location");
    return where.portable ? "portable" : null;
  } catch { return null; }
}

async function findUpdate(): Promise<Pending | null> {
  const f = fake();
  if (!isDesktop && f) return fakePending(f);
  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
}

function fakePending(f: FakeUpdate): Pending {
  return {
    version: f.version,
    body: f.notes ?? "",
    async downloadAndInstall(on) {
      on({ event: "Started", data: { contentLength: 1000 } });
      for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 120)); on({ event: "Progress", data: { chunkLength: 250 } }); }
      if (f.fail) throw new Error(f.fail);
      on({ event: "Finished" });
    },
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "Unknown error";

export function useUpdates(): Updates {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const off = useRef<boolean>(true);

  const check = useCallback(async () => {
    if (off.current || busy.current) return;
    busy.current = true;
    setDismissed(false);
    setState({ kind: "checking" });
    try {
      const u = await findUpdate();
      pending.current = u;
      setState(u ? { kind: "available", version: u.version, notes: (u.body ?? "").trim() } : { kind: "current", checkedAt: Date.now() });
    } catch (e) {
      // no internet, GitHub down…: quiet on the automatic check; Settings → About shows it
      setState({ kind: "error", during: "check", message: message(e) });
    } finally { busy.current = false; }
  }, []);

  const install = useCallback(async () => {
    const u = pending.current;
    if (!u || busy.current) return;
    busy.current = true;
    setState({ kind: "downloading", version: u.version, percent: null });
    let total = 0, got = 0, shown = -1;
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          const pct = total ? Math.min(100, Math.floor((got * 100) / total)) : null;
          if (pct !== shown) { shown = pct ?? -1; setState({ kind: "downloading", version: u.version, percent: pct }); }
        } else setState({ kind: "restarting", version: u.version });
      });
      setState({ kind: "restarting", version: u.version });
      // Windows closes the app by itself while the installer runs and the installer opens it again;
      // elsewhere (and if it is still open) restart it here.
      if (isDesktop) { const { relaunch } = await import("@tauri-apps/plugin-process"); await relaunch(); }
    } catch (e) {
      setState({ kind: "error", during: "install", message: message(e), version: u.version });
    } finally { busy.current = false; }
  }, []);

  useEffect(() => {
    let alive = true;
    let first: ReturnType<typeof setTimeout> | undefined;
    let again: ReturnType<typeof setInterval> | undefined;
    void whyOff().then((why) => {
      if (!alive) return;
      if (why) { setState({ kind: "off", why }); return; }
      off.current = false;
      first = setTimeout(() => void check(), fake() ? 0 : FIRST_CHECK_MS);
      again = setInterval(() => { if (!pending.current) void check(); }, RECHECK_MS);
    });
    return () => { alive = false; clearTimeout(first); clearInterval(again); };
  }, [check]);

  return { state, current: __APP_VERSION__, dismissed, check, install, dismiss: () => setDismissed(true) };
}

/** One line for Settings → About. */
export function updateStatusText(u: Updates): string {
  const s = u.state;
  switch (s.kind) {
    case "off":
      return s.why === "portable" ? "This portable copy updates with “Atualizar Homunculus.bat” in its folder."
        : s.why === "dev" ? "Updates are off while the app runs from the code (Abrir Homunculus.bat)."
        : "Updates work in the installed app.";
    case "idle": return "Not checked yet.";
    case "checking": return "Checking…";
    case "current": return `You have the newest version (checked at ${new Date(s.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).`;
    case "available": return `Homunculus ${s.version} is ready to install.`;
    case "downloading": return `Downloading ${s.version}…${s.percent === null ? "" : ` ${s.percent}%`}`;
    case "restarting": return "Installing… Homunculus will reopen by itself.";
    case "error": return s.during === "check" ? `Could not reach GitHub: ${s.message}` : `Could not install ${s.version ?? "the update"}: ${s.message}`;
  }
}
