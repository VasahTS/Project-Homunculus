// Homunculus 2 — module: import personas from SillyTavern. Author: CLAUDE, 2026-10-28 (slice 1).
//
// SillyTavern keeps personas in its settings (power_user.personas = { "<image file>": "<name>" } and
// power_user.persona_descriptions = { "<image file>": { description, position, depth, role, lorebook, title } }).
// Its "Backup" button (Persona Management) saves exactly those two maps plus default_persona as JSON
// (public/scripts/personas.js onBackupPersonas). We read that backup, or the whole settings.json, and
// the persona images if the user picks them together (from data/default-user/User Avatars/).
// The SillyTavern data is kept in `original`, so nothing is lost when exporting back later.
import type { HomunculusModule, ImportedPersona } from "@homunculus/core";
import type { Avatar, PersonaInput } from "@homunculus/schemas";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** SillyTavern's persona_description_positions. */
const POSITION = { IN_PROMPT: 0, AFTER_CHAR: 1, TOP_AN: 2, BOTTOM_AN: 3, AT_DEPTH: 4, NONE: 9 } as const;
const ROLES = ["system", "user", "assistant"] as const;

export interface PersonaFile { name: string; bytes: Uint8Array }

/** Finds the persona maps in a backup file or in a whole settings.json. */
export function findPersonaData(json: unknown): { personas: Obj; descriptions: Obj; defaultKey: string | null } | null {
  const candidates = [json, isObj(json) ? json.power_user : undefined];
  for (const c of candidates) {
    if (isObj(c) && isObj(c.personas)) {
      return {
        personas: c.personas,
        descriptions: isObj(c.persona_descriptions) ? c.persona_descriptions : {},
        defaultKey: typeof c.default_persona === "string" ? c.default_persona : null,
      };
    }
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const extOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name;

/** Turns SillyTavern persona data (+ picked images) into Homunculus personas, with plain-language warnings. */
export function importStPersonas(files: PersonaFile[]): { personas: ImportedPersona[]; warnings: string[] } {
  const warnings: string[] = [];
  const images = new Map<string, Avatar>();
  const datas: Array<NonNullable<ReturnType<typeof findPersonaData>>> = [];
  for (const f of files) {
    const ext = extOf(f.name);
    if (MIME[ext]) { images.set(baseName(f.name), { mime: MIME[ext]!, base64: toBase64(f.bytes) }); continue; }
    if (ext !== "json") { warnings.push(`${f.name}: not a JSON file or an image, skipped.`); continue; }
    let json: unknown;
    try { json = JSON.parse(new TextDecoder().decode(f.bytes)); } catch { warnings.push(`${f.name}: this file is not valid JSON.`); continue; }
    const d = findPersonaData(json);
    if (!d) { warnings.push(`${f.name}: no SillyTavern personas inside. Use the "Backup" button in SillyTavern's Persona Management, or its settings.json.`); continue; }
    datas.push(d);
  }
  if (!datas.length) {
    throw new Error(images.size
      ? "Only images were picked. Pick the personas backup JSON (or settings.json) together with the images."
      : "No SillyTavern personas were found in the picked files.");
  }

  const out: ImportedPersona[] = [];
  const seen = new Set<string>();
  for (const d of datas) {
    for (const [key, rawName] of Object.entries(d.personas)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : key.replace(/\.[^.]+$/, "");
      const desc = isObj(d.descriptions[key]) ? (d.descriptions[key] as Obj) : {};
      const position = Number(desc.position ?? POSITION.IN_PROMPT);
      const depth = Number.isInteger(desc.depth) && (desc.depth as number) >= 0 ? (desc.depth as number) : 2;
      const role = ROLES[Number(desc.role ?? 0)] ?? "system";
      let placement: NonNullable<PersonaInput["placement"]>;
      if (position === POSITION.AT_DEPTH) placement = { position: "atDepth", depth, role };
      else if (position === POSITION.NONE) placement = { position: "none", depth, role };
      else {
        placement = { position: "inPrompt", depth, role };
        if (position === POSITION.TOP_AN || position === POSITION.BOTTOM_AN) {
          warnings.push(`${name}: in SillyTavern the description went in the Author's Note. Homunculus has no Author's Note yet, so it goes in the main prompt.`);
        }
      }
      if (typeof desc.lorebook === "string" && desc.lorebook.trim()) {
        warnings.push(`${name}: uses the lorebook "${desc.lorebook}". The link is kept for when lorebooks arrive.`);
      }
      const avatar = images.get(key);
      if (!avatar && images.size) warnings.push(`${name}: its image "${key}" was not among the picked files.`);
      out.push({
        persona: {
          id: crypto.randomUUID(),
          name,
          description: typeof desc.description === "string" ? desc.description : "",
          placement,
          variants: [],
          original: { source: "sillytavern", avatarId: key, name: rawName ?? null, ...desc } as never,
        },
        avatar,
        isDefault: d.defaultKey === key,
      });
    }
  }
  if (!images.size && out.length) {
    warnings.push("No images were picked. To bring the pictures too, pick them with the JSON (SillyTavern folder data/default-user/User Avatars).");
  }
  return { personas: out, warnings };
}

export function createSillyTavernPersonasModule(): HomunculusModule {
  return {
    manifest: { id: "st-personas", version: "0.0.1" },
    register(api) {
      api.registerPersonaImporter({
        id: "st-personas",
        name: "SillyTavern personas",
        help: "Pick the JSON from the \"Backup\" button in SillyTavern's Persona Management (or SillyTavern's settings.json). To bring the pictures too, pick the persona images at the same time (SillyTavern folder data/default-user/User Avatars).",
        extensions: [".json", ".png", ".jpg", ".jpeg", ".webp"],
        async import(files) { return importStPersonas(files); },
      });
    },
  };
}
