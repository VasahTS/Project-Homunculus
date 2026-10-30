// Portable field-set definitions and atomic draft transfers. CODEX, D-043.
import { z } from "zod";
import { TrackerSchema, type TrackerField } from "@homunculus/schemas";

export const PortableFieldSet = TrackerSchema.omit({ id: true, trackerId: true }).strict();
export type PortableFieldSet = z.infer<typeof PortableFieldSet>;
export const FieldSetFile = z.object({
  format: z.literal("homunculus-field-sets"),
  version: z.literal(1),
  sets: z.array(PortableFieldSet).min(1),
}).strict();
export type FieldSetFile = z.infer<typeof FieldSetFile>;

/** Validates the whole file before callers append anything. Contains definitions, never live values. */
export function parseFieldSetFile(input: unknown): FieldSetFile {
  const file = FieldSetFile.parse(typeof input === "string" ? JSON.parse(input) : input);
  for (const set of file.sets) {
    if (!set.name.trim()) throw new Error("A field set needs a name.");
    const check = (fields: TrackerField[], path: string) => {
      const seen = new Set<string>();
      for (const f of fields) {
        if (seen.has(f.key)) throw new Error(`${path}: duplicate field key "${f.key}".`);
        seen.add(f.key);
        if (!f.label.trim()) throw new Error(`${path}: field "${f.key}" needs a name.`);
        if (f.type === "status" && (!f.options.length || f.options.some((o) => !o.trim()))) throw new Error(`${path}: status "${f.key}" needs nonempty options.`);
        if (f.min !== undefined && f.max !== undefined && f.min >= f.max) throw new Error(`${path}: "${f.key}" needs a minimum below its maximum.`);
        check(f.fields, `${path}/${f.key}`);
      }
    };
    check(set.fields, set.name);
    if (set.presence) {
      const field = set.fields.find((f) => f.key === set.presence!.field);
      if (!field || field.type !== "status" || field.scope !== "perCharacter" || !field.options.includes(set.presence.value)) {
        throw new Error(`${set.name}: presence must refer to a per-character status field and one of its options.`);
      }
    }
  }
  return file;
}

export function serializeFieldSets(sets: PortableFieldSet[]): string {
  return JSON.stringify(parseFieldSetFile({ format: "homunculus-field-sets", version: 1, sets }), null, 2) + "\n";
}

interface TransferSet { id: string; fields: TrackerField[]; presence?: { field: string; value: string } | undefined }

/** Returns new draft sets together, or throws without touching either input. Stable keys are never renamed. */
export function transferFields<T extends TransferSet>(sets: T[], fromId: string, toId: string, keys: string[], mode: "copy" | "move"): T[] {
  const from = sets.find((s) => s.id === fromId);
  const to = sets.find((s) => s.id === toId);
  if (!from || !to || from === to) throw new Error("Choose a different destination set.");
  const selected = new Set(keys);
  if (!selected.size || [...selected].some((key) => !from.fields.some((f) => f.key === key))) throw new Error("Select existing fields to transfer.");
  const fields = from.fields.filter((f) => selected.has(f.key));
  const collisions = fields.filter((f) => to.fields.some((other) => other.key === f.key));
  if (collisions.length) throw new Error(`Nothing changed. The destination already has these keys: ${collisions.map((f) => f.key).join(", ")}.`);
  if (mode === "move" && fields.length === from.fields.length) throw new Error("Keep at least one field in the source set. Copy all fields instead.");
  const presence = from.presence && selected.has(from.presence.field) ? from.presence : undefined;
  return sets.map((s) => {
    if (s === to) return { ...s, fields: [...s.fields, ...structuredClone(fields)], ...(!s.presence && presence ? { presence: { ...presence } } : {}) };
    if (s === from && mode === "move") {
      const next = { ...s, fields: s.fields.filter((f) => !selected.has(f.key)) };
      if (presence) delete next.presence;
      return next;
    }
    return s;
  });
}
