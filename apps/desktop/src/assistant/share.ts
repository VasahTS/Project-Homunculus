// Homunculus 2 — exporting and importing the Assistant's assistants and presets (Assistant → Customize). D-118.
// Author: CLAUDE, 2026-11-12. Daniel: "make it possible to export the assistants and the presets".
//
// One small file format ("homunculus-assistant", .h2.json like the other Homunculus files) holding assistants,
// presets or both. Never in the file: connections (another install has its own, and they hold keys) and the model
// picked with them — an imported assistant uses the connection stories use until you pick one. A preset's memory
// comes along: it is part of what the preset knows.
//
// Importing never changes what you already have, like Homunculus files (D-094): an identical item is skipped; an item
// whose id is taken by something different comes in as a copy beside it ("(imported)"); free ids are kept.
import { z } from "zod";
import { AssistantPersona, AssistantPreset, type AssistantSettings } from "@homunculus/schemas";
import type { ExportedFile } from "@homunculus/core";

export const ASSISTANT_FILE_FORMAT = "homunculus-assistant";
export const ASSISTANT_FILE_VERSION = 1;

const AssistantFile = z.object({
  format: z.literal(ASSISTANT_FILE_FORMAT),
  version: z.number().int(),
  exportedAt: z.string().default(""),
  assistants: z.array(AssistantPersona).default([]),
  presets: z.array(AssistantPreset).default([]),
});
export type AssistantFile = z.infer<typeof AssistantFile>;

/** An assistant without anything tied to this install (connection, model, built-in mark). */
function portable(a: AssistantPersona): AssistantPersona {
  return {
    ...structuredClone(a), connectionId: null, model: "", builtin: false,
    ...(a.toolHelper ? { toolHelper: { ...a.toolHelper, connectionId: null, model: "" } } : {}),
  };
}

const fileName = (name: string) =>
  `${name.normalize("NFC").replace(/[^\p{L}\p{N}_ -]+/gu, "-").trim().replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "assistant"}.h2.json`;

/** The file for the picked assistants and presets. */
export function assistantFile(items: { assistants?: AssistantPersona[]; presets?: AssistantPreset[] }, name?: string): ExportedFile {
  const assistants = (items.assistants ?? []).map(portable);
  const presets = (items.presets ?? []).map((p) => structuredClone(p));
  const file: AssistantFile = { format: ASSISTANT_FILE_FORMAT, version: ASSISTANT_FILE_VERSION, exportedAt: new Date().toISOString(), assistants, presets };
  const title = name ?? assistants[0]?.name ?? presets[0]?.name ?? "Assistant";
  return { fileName: fileName(title), mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify(file, null, 2)) };
}

/** True when the text looks like an assistant file (so other Homunculus files can be told apart). */
export function isAssistantFile(json: unknown): boolean {
  return !!json && typeof json === "object" && (json as { format?: unknown }).format === ASSISTANT_FILE_FORMAT;
}

export interface AssistantImport {
  settings: AssistantSettings;
  added: Array<{ kind: "assistant" | "preset"; id: string; name: string }>;
  skipped: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Adds what the file holds to the settings. Throws a plain sentence when the file isn't one of these. */
export function importAssistantFile(s: AssistantSettings, text: string, newId: () => string = () => crypto.randomUUID()): AssistantImport {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("This file is not JSON."); }
  if (!isAssistantFile(json)) throw new Error("This is not an assistant or preset file. Make one with Export in Assistant → Customize.");
  const parsed = AssistantFile.safeParse(json);
  if (!parsed.success) throw new Error("This assistant file is damaged: some of its parts can't be read.");
  if (parsed.data.version > ASSISTANT_FILE_VERSION) throw new Error("This file was made by a newer Homunculus. Update the app to import it.");

  const out: AssistantImport = { settings: { ...s, assistants: [...s.assistants], presets: [...s.presets] }, added: [], skipped: [] };
  const take = <T extends { id: string; name: string }>(list: T[], item: T, kind: "assistant" | "preset", fresh: (x: T) => T) => {
    const here = list.find((x) => x.id === item.id);
    if (here && same(fresh(here), item)) { out.skipped.push(item.name); return list; }
    const copy = here ? { ...item, id: newId(), name: `${item.name} (imported)` } : item;
    out.added.push({ kind, id: copy.id, name: copy.name });
    return [...list, copy];
  };
  for (const a of parsed.data.assistants) out.settings.assistants = take(out.settings.assistants, a, "assistant", portable);
  for (const p of parsed.data.presets) out.settings.presets = take(out.settings.presets, p, "preset", (x) => x);
  return out;
}

/** "Added Writer and Dark Fantasy · 1 was already here" */
export function importSummary(results: AssistantImport[]): string {
  const added = results.flatMap((r) => r.added.map((x) => x.name));
  const skipped = results.reduce((n, r) => n + r.skipped.length, 0);
  const names = added.length > 3 ? `${added.slice(0, 3).join(", ")} and ${added.length - 3} more` : added.join(", ").replace(/, ([^,]*)$/, " and $1");
  const head = added.length ? `Added ${names}` : "Nothing new";
  return skipped ? `${head} · ${skipped} ${skipped === 1 ? "was" : "were"} already here` : head;
}
