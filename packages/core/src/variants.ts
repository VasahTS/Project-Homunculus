// Homunculus 2 — variants of characters and personas (BLUEPRINT §2.5). Author: CLAUDE, 2026-10-27.
// A variant stores only what differs from the main version; this gives the version a session uses.
import type { Character, Persona } from "@homunculus/schemas";

/** The character as a session sees it with the chosen variant (null/unknown = main version). */
export function effectiveCharacter(c: Character, variantId: string | null | undefined): Character {
  const v = variantId ? c.variants.find((x) => x.id === variantId) : undefined;
  if (!v) return c;
  const o = Object.fromEntries(Object.entries(v.overrides).filter(([, value]) => value !== undefined));
  return { ...c, ...o };
}

export function effectivePersona(p: Persona, variantId: string | null | undefined): Persona {
  const v = variantId ? p.variants.find((x) => x.id === variantId) : undefined;
  if (!v) return p;
  const o = Object.fromEntries(Object.entries(v.overrides).filter(([, value]) => value !== undefined));
  return { ...p, ...o };
}

/** Where a variant's own picture is stored (avatars are keyed by owner id). */
export const variantAvatarId = (ownerId: string, variantId: string) => `${ownerId}#${variantId}`;

/**
 * Keeps only the overrides that really differ from the main version, so editing the main
 * version later still reaches the fields a variant did not change (BLUEPRINT §2.5).
 */
export function pruneOverrides<T extends object>(main: T, overrides: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(overrides) as Array<[keyof T, T[keyof T] | undefined]>) {
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(main[k])) out[k] = v;
  }
  return out;
}
