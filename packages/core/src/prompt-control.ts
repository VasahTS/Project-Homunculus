// Scoped preset edits are patches, never hidden preset copies. CODEX, D-042.
import type { Preset, PresetBlockOverride, PresetOverride, SetupLayer } from "@homunculus/schemas";

export function mergePresetOverride(above: PresetOverride | undefined, own: PresetOverride | undefined): PresetOverride {
  const blocks: Record<string, PresetBlockOverride> = Object.assign(Object.create(null), above?.blocks);
  for (const [id, patch] of Object.entries(own?.blocks ?? {})) blocks[id] = { ...blocks[id], ...defined(patch) };
  return { blocks, ...(own?.order !== undefined ? { order: [...own.order] } : above?.order !== undefined ? { order: [...above.order] } : {}) };
}

/** Applies known block patches without modifying the Library preset or losing newly added blocks. */
export function applyPresetOverride(preset: Preset, override: PresetOverride | undefined): Preset {
  if (!override) return preset;
  const blocks = preset.blocks.map((block) => ({ ...block, ...defined(override.blocks?.[block.id] ?? {}) }));
  if (override.order) {
    const ranks = new Map<string, number>();
    for (const id of override.order) if (!ranks.has(id)) ranks.set(id, ranks.size);
    blocks.sort((a, b) => (ranks.get(a.id) ?? ranks.size) - (ranks.get(b.id) ?? ranks.size));
  }
  return { ...preset, blocks };
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Changes only the requested fields; values equal to the layer above resume inheritance. */
export function withPresetBlockOverride(layer: SetupLayer, above: Preset, blockId: string, patch: PresetBlockOverride): SetupLayer {
  const overrides: Record<string, PresetOverride> = Object.assign(Object.create(null), layer.presetOverrides);
  const own = { ...overrides[above.id], blocks: Object.assign(Object.create(null), overrides[above.id]?.blocks) as Record<string, PresetBlockOverride> };
  const block = { ...own.blocks[blockId] };
  const inherited = above.blocks.find((b) => b.id === blockId);
  if (!inherited) return layer;
  for (const [key, value] of Object.entries(patch) as Array<[keyof PresetBlockOverride, never]>) {
    if (value === undefined || value === inherited[key]) delete block[key];
    else block[key] = value;
  }
  if (Object.keys(block).length) own.blocks[blockId] = block; else delete own.blocks[blockId];
  if (!Object.keys(own.blocks).length) delete (own as PresetOverride).blocks;
  if (Object.keys(own).length) overrides[above.id] = own; else delete overrides[above.id];
  const out = { ...layer };
  if (Object.keys(overrides).length) out.presetOverrides = overrides; else delete out.presetOverrides;
  return out;
}

export function withPresetOrderOverride(layer: SetupLayer, above: Preset, order: string[]): SetupLayer {
  const overrides: Record<string, PresetOverride> = Object.assign(Object.create(null), layer.presetOverrides);
  const own = { ...overrides[above.id] };
  if (order.join("\0") === above.blocks.map((b) => b.id).join("\0")) delete own.order; else own.order = order;
  if (Object.keys(own).length) overrides[above.id] = own; else delete overrides[above.id];
  const out = { ...layer };
  if (Object.keys(overrides).length) out.presetOverrides = overrides; else delete out.presetOverrides;
  return out;
}

export function withoutPresetOverride(layer: SetupLayer, presetId: string): SetupLayer {
  const overrides: Record<string, PresetOverride> = Object.assign(Object.create(null), layer.presetOverrides);
  delete overrides[presetId];
  const out = { ...layer };
  if (Object.keys(overrides).length) out.presetOverrides = overrides; else delete out.presetOverrides;
  return out;
}
