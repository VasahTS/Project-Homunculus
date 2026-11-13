// Homunculus 2 — a diagnostic report (D-131). Author: CLAUDE, 2026-11-13.
// Daniel (translated): "wouldn't a kind of diagnostic tool make sense? I could run it here or on any other PC (a friend on
// Linux) and get a report of the app". Settings → About → Diagnostics → Create Report: it measures the app right now and
// writes a plain-text report to copy or save. Only numbers: versions, the system, how much of each thing there is, sizes
// and how long each read takes — never a name, a card's text, a message or a key.
import { bootParts, bootSummary } from "./bootTiming.ts";
import type { AppServices } from "./core-instance.ts";
import { isDesktop } from "./db.ts";
import { getPrefs } from "./prefs.ts";

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const mb = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);
const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${Math.round(x)} ms`);

async function timed<T>(work: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const a = performance.now();
  try { const value = await work(); return { ms: performance.now() - a, value }; }
  catch (e) { return { ms: performance.now() - a, error: e instanceof Error ? e.message : String(e) }; }
}

/** The report, as plain text. `version`: the app's version. `onStep`: what is being measured now. */
export async function createDiagnosticReport(svc: Pick<AppServices, "store">, version: string, onStep: (text: string) => void = () => {}): Promise<string> {
  const lines: string[] = [];
  const section = (title: string) => lines.push("", `## ${title}`);
  const row = (label: string, value: string) => lines.push(`${label.padEnd(30)} ${value}`);

  lines.push(`# Homunculus diagnostic report`, `Made ${new Date().toISOString()} · version ${version}`);
  lines.push("Only numbers: no names, texts, messages or keys.");

  section("System");
  row("app", isDesktop ? "desktop" : "browser preview");
  row("browser engine", navigator.userAgent);
  row("platform", (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "?");
  row("processors", String(navigator.hardwareConcurrency ?? "?"));
  const devMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (devMem) row("memory (approx.)", `${devMem} GB`);
  row("window", `${innerWidth} × ${innerHeight} · pixel ratio ${devicePixelRatio}`);
  if (isDesktop) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const place = await invoke<{ portable: boolean }>("data_location");
      row("data folder", place.portable ? "portable" : "app folder");
    } catch { /* not important */ }
  }
  const p = getPrefs();
  row("interface size", `${p.uiScale}%`);
  row("items per page", p.perPage ? String(p.perPage) : "all");
  row("recent chats", p.recentChats ? String(p.recentChats) : "all");
  row("messages drawn", p.messagesToShow ? String(p.messagesToShow) : "all");
  row("light effects", document.documentElement.dataset.light ?? "?");

  section("This start");
  row("steps", bootSummary() || "—");
  row("slowest reads", bootParts() || "—");

  section("Library (counts and sizes)");
  onStep("Counting…");
  for (const d of await svc.store.diagnostics()) row(d.label, d.label.includes("bytes") ? mb(d.value) : n(d.value));

  section("Reads, measured now (one after another)");
  const reads: Array<[string, () => Promise<unknown>, (v: unknown) => string]> = [
    ["characters (list)", () => svc.store.listCharactersLight(), (v) => `${(v as unknown[]).length} · ${mb(JSON.stringify(v).length)}`],
    ["characters (whole)", () => svc.store.listCharacters(), (v) => `${(v as unknown[]).length} · ${mb(JSON.stringify(v).length)}`],
    ["lorebooks", () => svc.store.lorebooks.list(), (v) => `${(v as unknown[]).length} · ${mb(JSON.stringify(v).length)}`],
    ["chats", () => svc.store.listSessions(), (v) => `${(v as unknown[]).length} · ${mb(JSON.stringify(v).length)}`],
    ["personas", () => svc.store.personas.list(), (v) => `${(v as unknown[]).length}`],
    ["presets", () => svc.store.presets.list(), (v) => `${(v as unknown[]).length}`],
    ["stories", () => svc.store.listStories(), (v) => `${(v as unknown[]).length}`],
    ["trash", () => svc.store.listTrash(), (v) => `${(v as unknown[]).length}`],
    ["chat counts", () => svc.store.messageStats(), (v) => `${(v as Map<string, unknown>).size}`],
    ["latest messages", () => svc.store.latestMessages(), (v) => `${(v as Map<string, unknown>).size}`],
    ["branches", () => svc.store.branchesBySession(), (v) => `${(v as Map<string, unknown>).size}`],
    ["pictures (list)", () => svc.store.avatarVersions(0), (v) => `${(v as { ids: unknown[] }).ids.length}`],
    ["app setting read", () => svc.store.getAppSetting("prefs"), () => "1"],
  ];
  for (const [label, work, what] of reads) {
    onStep(`Reading ${label}…`);
    const r = await timed(work);
    row(label, r.error ? `${ms(r.ms)} · error: ${r.error}` : `${ms(r.ms)} · ${what(r.value)}`);
  }

  section("Screen");
  row("elements on the page", n(document.getElementsByTagName("*").length));
  row("pictures on the page", n(document.images.length));
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (mem) row("script memory", `${mb(mem.usedJSHeapSize)} of ${mb(mem.jsHeapSizeLimit)}`);
  const frame = await new Promise<number>((resolve) => { const a = performance.now(); let k = 0; const tick = () => (++k < 30 ? requestAnimationFrame(tick) : resolve((performance.now() - a) / 30)); requestAnimationFrame(tick); });
  row("frame time (idle)", `${frame.toFixed(1)} ms (${Math.round(1000 / frame)} fps)`);

  onStep("");
  return lines.join("\n");
}
