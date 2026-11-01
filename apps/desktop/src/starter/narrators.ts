// Homunculus 2 — starter narrators (D-058, Daniel 31/10: "the narrators you made are too simple and don't serve much;
// remember the 3 modes of a Story — each should have one — plus extras that add other things"). Author: CLAUDE, 2026-10-31.
// The texts come from Daniel's own Homunculus v1 role presets (Roleplay / Co-author / Director / Game Master and their
// Story, NPCs, Dialogue and Narration blocks), rewritten as narrators. Editable data, installed once; one the user
// deleted is not brought back. `narrators.json` is generated, the app knows no narrator by name.
import type { NarratorInput } from "@homunculus/schemas";
import type { SqlStore } from "@homunculus/core";
import data from "./narrators.json";

export const STARTER_NARRATORS: NarratorInput[] = (data as Array<Omit<NarratorInput, "mayAddNpcs" | "turnInstruction" | "builtin">>).map((n) => ({
  ...n, mayAddNpcs: true, turnInstruction: "", builtin: false,
}));

const KEY = "starterNarrators.v2";

export async function installStarterNarrators(store: SqlStore): Promise<void> {
  const installed = new Set((await store.getAppSetting<string[]>(KEY)) ?? []);
  let changed = false;
  for (const n of STARTER_NARRATORS) {
    if (installed.has(n.id)) continue;
    if (!(await store.narrators.get(n.id))) await store.saveNarrator(n);
    installed.add(n.id);
    changed = true;
  }
  if (changed) await store.setAppSetting(KEY, [...installed]);
}
