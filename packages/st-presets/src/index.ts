// Homunculus 2 — module: SillyTavern Chat Completion presets (import and export). Author: CLAUDE, 2026-10-28 (slice 2, D-021).
//
// A SillyTavern preset (default/content/presets/openai/*.json) has `prompts` (each with identifier, name, role,
// content, marker, injection_position 0 = in the list / 1 = in the chat, injection_depth, injection_order,
// injection_trigger, forbid_overrides) and `prompt_order` (per character id; 100001 = the global order used by
// the prompt manager, 100000 = the default), plus samplers and format strings. Only the "border" format is read
// here; the prompt itself is built by the core (presets.ts). The whole file is kept in `original`, so export
// gives back everything we don't use (model choices, other characters' orders, extension settings…).
import type { HomunculusModule } from "@homunculus/core";
import { PromptMarker, type GenerationType, type Preset, type PresetBlockInput, type PresetInput } from "@homunculus/schemas";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined ? undefined : Math.min(hi, Math.max(lo, v)));

const TRIGGERS: Record<string, GenerationType> = {
  normal: "normal", continue: "continue", impersonate: "impersonate", swipe: "swipe", regenerate: "swipe", quiet: "quiet",
};
const OUR_MARKERS = new Set<string>(PromptMarker.options);
/** Ours only: not written into SillyTavern files. */
const HOMUNCULUS_ONLY = new Set(["scene", "agentPrompts"]);

/** SillyTavern's prompt order used by the prompt manager: the global one (100001), else the default (100000). */
function pickOrder(json: Obj): Array<{ identifier: string; enabled: boolean }> | null {
  const orders = Array.isArray(json.prompt_order) ? (json.prompt_order as Obj[]) : [];
  const entry = orders.find((o) => o.character_id === 100001) ?? orders.find((o) => o.character_id === 100000) ?? orders[0];
  if (!entry || !Array.isArray(entry.order)) return null;
  return (entry.order as Obj[]).filter((x) => typeof x.identifier === "string").map((x) => ({ identifier: x.identifier as string, enabled: x.enabled !== false }));
}

export function importStPreset(bytes: Uint8Array, fileName: string): { preset: PresetInput; warnings: string[] } {
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`"${fileName}" is not valid JSON.`); }
  if (!isObj(json) || !Array.isArray(json.prompts)) {
    throw new Error(`"${fileName}" is not a SillyTavern Chat Completion preset (it has no "prompts" list). Text Completion presets are not supported yet.`);
  }
  const warnings: string[] = [];
  const prompts = new Map<string, Obj>();
  for (const p of json.prompts as unknown[]) if (isObj(p) && typeof p.identifier === "string") prompts.set(p.identifier, p);

  const toBlock = (p: Obj, enabled: boolean): PresetBlockInput => {
    const id = p.identifier as string;
    const name = str(p.name, id);
    const isMarker = p.marker === true;
    const ourMarker = isMarker && OUR_MARKERS.has(id) ? (id as PresetBlockInput["marker"]) : undefined;
    if (isMarker && !ourMarker) warnings.push(`"${name}" is filled by a SillyTavern feature Homunculus doesn't have; it stays in the list, empty.`);
    const triggers = Array.isArray(p.injection_trigger) ? [...new Set((p.injection_trigger as unknown[]).map((t) => TRIGGERS[String(t)]).filter((t): t is GenerationType => !!t))] : [];
    const role = p.role === "user" || p.role === "assistant" ? p.role : "system";
    return {
      id, name, enabled, marker: ourMarker, role,
      content: isMarker ? "" : str(p.content),
      position: p.injection_position === 1 ? "depth" : "list",
      depth: Math.max(0, Math.round(num(p.injection_depth) ?? 4)),
      order: Math.round(num(p.injection_order) ?? 100),
      triggers,
      noOverride: p.forbid_overrides === true,
    };
  };

  const order = pickOrder(json);
  const blocks: PresetBlockInput[] = [];
  if (order) {
    for (const o of order) {
      const p = prompts.get(o.identifier);
      if (!p) { warnings.push(`The order lists "${o.identifier}", but the preset has no such prompt; it was skipped.`); continue; }
      blocks.push(toBlock(p, o.enabled));
    }
    // prompts that are not in the order are kept, switched off, at the end
    for (const [id, p] of prompts) if (!order.some((o) => o.identifier === id)) blocks.push(toBlock(p, false));
  } else {
    for (const p of prompts.values()) blocks.push(toBlock(p, true));
    warnings.push("The preset has no prompt order; its prompts are used in the order they appear.");
  }

  const params: NonNullable<PresetInput["params"]> = {};
  const t = clamp(num(json.temperature), 0, 2); if (t !== undefined) params.temperature = t;
  const tp = clamp(num(json.top_p), 0, 1); if (tp !== undefined && tp < 1) params.topP = tp;
  const mt = num(json.openai_max_tokens); if (mt && mt > 0) params.maxTokens = Math.round(mt);
  const fp = clamp(num(json.frequency_penalty), -2, 2); if (fp) params.frequencyPenalty = fp;
  const pp = clamp(num(json.presence_penalty), -2, 2); if (pp) params.presencePenalty = pp;
  const tk = num(json.top_k); if (tk && tk > 0) params.topK = Math.round(tk);
  const mp = clamp(num(json.min_p), 0, 1); if (mp) params.minP = mp;
  const rp = clamp(num(json.repetition_penalty), 0, 3); if (rp && rp !== 1) params.repetitionPenalty = rp;
  if (num(json.top_a)) warnings.push("Top A is not used by Homunculus yet.");
  if (str(json.chat_completion_source) || str(json.openai_model) || str(json.custom_url)) {
    warnings.push("The service and model saved in the preset were not imported: in Homunculus they belong to the connection (Settings → Connections).");
  }
  const ctx = num(json.openai_max_context);

  return {
    preset: {
      id: crypto.randomUUID(),
      name: fileName.replace(/\.json$/i, "").trim() || "SillyTavern preset",
      blocks,
      contextSize: ctx && ctx > 0 ? Math.round(ctx) : undefined,
      params,
      formats: {
        description: "{{description}}",
        personality: str(json.personality_format, "{{personality}}") || "{{personality}}",
        scenario: str(json.scenario_format, "{{scenario}}") || "{{scenario}}",
        persona: "{{persona}}",
        examples: "{{mesExamples}}",
        worldInfo: str(json.wi_format, "{0}") || "{0}",
      },
      prompts: {
        newChat: str(json.new_chat_prompt),
        newExampleChat: str(json.new_example_chat_prompt),
        continueNudge: str(json.continue_nudge_prompt),
        impersonation: str(json.impersonation_prompt),
        prefill: str(json.assistant_prefill),
      },
      squashSystem: json.squash_system_messages === true,
      original: json as never,
    },
    warnings,
  };
}

const REVERSE_TRIGGERS: Partial<Record<GenerationType, string>> = { normal: "normal", continue: "continue", impersonate: "impersonate", swipe: "swipe", quiet: "quiet" };

/** Writes a SillyTavern preset. Starts from the imported original (so nothing we don't use is lost). */
export function exportStPreset(p: Preset): { json: Obj; warnings: string[] } {
  const warnings: string[] = [];
  const out: Obj = isObj(p.original) ? structuredClone(p.original) : {};
  const blocks = p.blocks.filter((b) => !(b.marker && HOMUNCULUS_ONLY.has(b.marker)));
  if (blocks.length !== p.blocks.length) warnings.push("The Current Scene and Agent Prompts blocks are Homunculus-only and were left out.");
  out.prompts = blocks.map((b) => b.marker
    ? { identifier: b.id, name: b.name || b.id, system_prompt: true, marker: true, ...(b.position === "depth" ? { injection_position: 1, injection_depth: b.depth, injection_order: b.order } : {}) }
    : {
      identifier: b.id, name: b.name || b.id, system_prompt: ["main", "nsfw", "jailbreak", "enhanceDefinitions"].includes(b.id), role: b.role, content: b.content,
      marker: false, injection_position: b.position === "depth" ? 1 : 0, injection_depth: b.depth, injection_order: b.order,
      injection_trigger: b.triggers.map((t) => REVERSE_TRIGGERS[t]).filter(Boolean), forbid_overrides: b.noOverride,
    });
  const order = blocks.map((b) => ({ identifier: b.id, enabled: b.enabled }));
  const others = (Array.isArray(out.prompt_order) ? (out.prompt_order as Obj[]) : []).filter((o) => o.character_id !== 100000 && o.character_id !== 100001);
  out.prompt_order = [{ character_id: 100000, order }, { character_id: 100001, order }, ...others];
  const pr = p.params;
  if (pr.temperature !== undefined) out.temperature = pr.temperature;
  if (pr.topP !== undefined) out.top_p = pr.topP;
  if (pr.maxTokens !== undefined) out.openai_max_tokens = pr.maxTokens;
  if (pr.frequencyPenalty !== undefined) out.frequency_penalty = pr.frequencyPenalty;
  if (pr.presencePenalty !== undefined) out.presence_penalty = pr.presencePenalty;
  if (pr.topK !== undefined) out.top_k = pr.topK;
  if (pr.minP !== undefined) out.min_p = pr.minP;
  if (pr.repetitionPenalty !== undefined) out.repetition_penalty = pr.repetitionPenalty;
  if (p.contextSize) out.openai_max_context = p.contextSize;
  out.personality_format = p.formats.personality;
  out.scenario_format = p.formats.scenario;
  out.wi_format = p.formats.worldInfo.replace(/\{\{\s*worldInfo\s*\}\}/gi, "{0}");
  out.new_chat_prompt = p.prompts.newChat;
  out.new_example_chat_prompt = p.prompts.newExampleChat;
  out.continue_nudge_prompt = p.prompts.continueNudge;
  out.impersonation_prompt = p.prompts.impersonation;
  out.assistant_prefill = p.prompts.prefill;
  out.squash_system_messages = p.squashSystem;
  if (p.formats.description !== "{{description}}" || p.formats.persona !== "{{persona}}" || p.formats.examples !== "{{mesExamples}}") {
    warnings.push("SillyTavern has no setting for the description, persona and example formats; they were left out.");
  }
  return { json: out, warnings };
}

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "preset";

export function createSillyTavernPresetsModule(): HomunculusModule {
  return {
    manifest: { id: "st-presets", version: "0.0.1" },
    register(api) {
      api.registerPresetImporter({
        id: "st-cc-preset",
        name: "SillyTavern Chat Completion preset",
        help: "A preset JSON exported from SillyTavern's AI Response Configuration (the left panel), or taken from its folder data/default-user/OpenAI Settings. Its prompts, their order and switches, the samplers and the context size come in; the service and model don't (they belong to a connection here).",
        extensions: [".json"],
        async import(bytes, fileName) { return importStPreset(bytes, fileName); },
      });
      api.registerPresetExporter({
        id: "st-cc-preset",
        name: "SillyTavern preset (JSON)",
        help: "A Chat Completion preset SillyTavern can import. Settings that came in from SillyTavern and Homunculus doesn't use are written back as they were.",
        async export(p) {
          const { json, warnings } = exportStPreset(p);
          return { fileName: `${safeFileName(p.name)}.json`, mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify(json, null, 4)), warnings };
        },
      });
    },
  };
}
