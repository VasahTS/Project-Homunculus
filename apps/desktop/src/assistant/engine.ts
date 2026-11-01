// Homunculus 2 — the Assistant's conversation loop (D-062). Author: CLAUDE, 2026-11-01.
//
// One reply = model call → tools it asked for → model call … until it answers without tools or reaches the step
// limit. Every request is rebuilt from the saved chat, kept small on purpose:
// - the library is never sent: only how many items of each kind exist; the model looks things up with tools;
// - picked items and files go as one line each (the model reads what it needs);
// - pictures are sent only with the newest two user messages (older ones become "[image … sent earlier]");
// - tool results of earlier replies are cut to their first lines (Flint's "microcompaction"): the model can read again.
import { AssistantChat, AssistantPersona, AssistantPreset, AssistantSettings, type AssistantMessage, type AssistantResult } from "@homunculus/schemas";
import type { ConnectionConfig, ContentPart, HomunculusCore, RichTurn, SqlStore, ToolCall } from "@homunculus/core";
import { BUILTIN_ASSISTANTS, CORE_RULES } from "./guides.ts";
import { libraryCounts, runTool, TOOL_SPECS, type ToolContext } from "./tools.ts";

const SETTINGS_KEY = "assistant.settings";
const INDEX_KEY = "assistant.chats";
const chatKey = (id: string) => `assistant.chat:${id}`;
const OLD_RESULT = 400;

export interface ChatRow { id: string; title: string; summary: string; updatedAt: number }

// ------------------------------------------------------------------ storage (app settings: no new tables)

export const builtinAssistant = (id: string): AssistantPersona | undefined => {
  const b = BUILTIN_ASSISTANTS.find((x) => x.id === id);
  return b ? AssistantPersona.parse({ ...b, builtin: true }) : undefined;
};

/**
 * The settings, with the built-in assistants always there and a default preset. Round-1 settings (one set of
 * instructions, rules and memory) are moved once into the default assistant and a "My preferences" preset.
 */
export async function loadSettings(store: SqlStore): Promise<AssistantSettings> {
  const raw = AssistantSettings.parse((await store.getAppSetting(SETTINGS_KEY)) ?? {});
  let changed = false;
  const assistants = [...raw.assistants];
  for (const b of BUILTIN_ASSISTANTS) if (!assistants.some((a) => a.id === b.id)) { assistants.push(builtinAssistant(b.id)!); changed = true; }
  const presets = [...raw.presets];
  if (!presets.length) {
    presets.push(AssistantPreset.parse({ id: "my-preferences", name: "My preferences", description: "How I like things written, and what to always know.", rules: raw.rules ?? [], memory: raw.memory ?? [], memoryOn: raw.memoryOn ?? true }));
    changed = true;
  }
  if (raw.instructions !== undefined || raw.model !== undefined || raw.connectionId !== undefined) {
    const i = assistants.findIndex((a) => a.id === "homunculus");
    if (i >= 0) assistants[i] = { ...assistants[i]!, ...(raw.instructions ? { instructions: raw.instructions } : {}), ...(raw.model ? { model: raw.model } : {}),
      ...(raw.connectionId !== undefined ? { connectionId: raw.connectionId } : {}), ...(raw.effort !== undefined ? { effort: raw.effort } : {}),
      ...(raw.temperature !== undefined ? { temperature: raw.temperature } : {}), ...(raw.maxSteps !== undefined ? { maxSteps: raw.maxSteps } : {}), ...(raw.saveNew !== undefined ? { saveNew: raw.saveNew } : {}) };
    changed = true;
  }
  const out = AssistantSettings.parse({
    assistants, presets,
    defaultAssistantId: assistants.some((a) => a.id === raw.defaultAssistantId) ? raw.defaultAssistantId : "homunculus",
    defaultPresetId: raw.defaultPresetId === "" && raw.presets.length ? "" : presets.some((p) => p.id === raw.defaultPresetId) ? raw.defaultPresetId : presets[0]!.id,
  });
  if (changed) await saveSettings(store, out);
  return out;
}
export async function saveSettings(store: SqlStore, s: AssistantSettings): Promise<void> {
  const { connectionId: _c, model: _m, effort: _e, temperature: _t, maxSteps: _x, saveNew: _s, instructions: _i, rules: _r, memory: _y, memoryOn: _o, ...clean } = s;
  // empty rules and notes are dropped (an empty rule row was saved by mistake in round 1)
  clean.presets = clean.presets.map((p) => ({ ...p, rules: p.rules.filter((r) => r.text.trim()), memory: p.memory.filter((m) => m.text.trim()) }));
  await store.setAppSetting(SETTINGS_KEY, AssistantSettings.parse(clean));
}

/** Who answers a chat and what it knows. */
export function resolveFor(chat: Pick<AssistantChat, "assistantId" | "presetId"> | null, s: AssistantSettings): { assistant: AssistantPersona; preset: AssistantPreset | undefined } {
  const assistant = s.assistants.find((a) => a.id === (chat?.assistantId || s.defaultAssistantId)) ?? s.assistants[0] ?? builtinAssistant("homunculus")!;
  const pid = chat?.presetId === "none" ? "" : chat?.presetId || s.defaultPresetId;
  return { assistant, preset: s.presets.find((p) => p.id === pid) };
}

/** The connection a chat uses: the chat's own pick, else its assistant's, else the stories' one. */
export function connectionFor(chat: Pick<AssistantChat, "connectionId" | "model"> | null, assistant: AssistantPersona, main: ConnectionConfig, connections: Record<string, ConnectionConfig>): ConnectionConfig {
  const id = chat?.connectionId ?? assistant.connectionId;
  const base = (id ? connections[id] : undefined) ?? main;
  const model = chat?.model || (chat?.connectionId ? "" : assistant.model);
  return { ...base, ...(model ? { model } : {}), params: { ...base.params, temperature: assistant.temperature, ...(assistant.effort ? { reasoningEffort: assistant.effort } : {}) } };
}
export async function listChats(store: SqlStore): Promise<ChatRow[]> {
  const v = await store.getAppSetting<ChatRow[]>(INDEX_KEY);
  return (Array.isArray(v) ? v : []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadChat(store: SqlStore, id: string): Promise<AssistantChat | undefined> {
  const v = await store.getAppSetting(chatKey(id));
  return v ? AssistantChat.parse(v) : undefined;
}
export async function saveChat(store: SqlStore, chat: AssistantChat): Promise<void> {
  await store.setAppSetting(chatKey(chat.id), chat);
  const rows = (await listChats(store)).filter((r) => r.id !== chat.id);
  await store.setAppSetting(INDEX_KEY, [{ id: chat.id, title: chat.title, summary: chat.summary, updatedAt: chat.updatedAt }, ...rows]);
}
export async function deleteChat(store: SqlStore, id: string): Promise<void> {
  await store.setAppSetting(chatKey(id), null);
  await store.setAppSetting(INDEX_KEY, (await listChats(store)).filter((r) => r.id !== id));
}

// ------------------------------------------------------------------ the request

/** The system message, in parts (so the composer can show what takes room). */
export function systemParts(assistant: AssistantPersona, preset: AssistantPreset | undefined, counts: string): Record<string, string> {
  const parts: Record<string, string> = { app: CORE_RULES, assistant: assistant.instructions.trim() ? `Your role — ${assistant.name}:\n${assistant.instructions.trim()}` : "", library: `The user's library: ${counts}.` };
  if (preset) {
    const p: string[] = [];
    if (preset.style.trim()) p.push(`How the user likes things written:\n${preset.style.trim()}`);
    const rules = preset.rules.filter((r) => r.on && r.text.trim()).map((r) => `- ${r.text.trim()}`);
    if (rules.length) p.push(`The user's rules (always follow them):\n${rules.join("\n")}`);
    for (const n of preset.notes.filter((x) => x.on && x.text.trim())) p.push(`${n.title.trim() || "Note"}:\n${n.text.trim()}`);
    if (preset.memoryOn && preset.memory.length) p.push(`What you remember about the user:\n${preset.memory.map((m) => `- ${m.text}`).join("\n")}`);
    parts.preset = p.join("\n\n");
  }
  return parts;
}
const systemText = (parts: Record<string, string>) => Object.values(parts).filter(Boolean).join("\n\n");

function userContent(m: AssistantMessage, withImages: boolean): string | ContentPart[] {
  const lines: string[] = [];
  for (const a of m.attachments) {
    if (a.type === "item") lines.push(`[Added: ${a.kind}:${a.id} · ${a.name}]`);
    else if (a.type === "file") lines.push(`[File ${a.id}: ${a.name} — ${a.summary}]`);
    else if (!withImages) lines.push(`[Image ${a.id}: ${a.name} (sent earlier)]`);
    else lines.push(`[Image ${a.id}: ${a.name}]`);
  }
  const text = [lines.join("\n"), m.text].filter(Boolean).join("\n\n");
  const images = withImages ? m.attachments.filter((a): a is Extract<typeof a, { type: "image" }> => a.type === "image") : [];
  if (!images.length) return text;
  return [{ type: "text", text }, ...images.map((i) => ({ type: "image" as const, mime: i.mime, base64: i.base64 }))];
}

/** The saved chat as model turns (exact rounds of tool calls; older tool results shortened). */
export function toTurns(chat: AssistantChat, settings: AssistantSettings, counts: string): RichTurn[] {
  const { assistant, preset } = resolveFor(chat, settings);
  const out: RichTurn[] = [{ role: "system", content: systemText(systemParts(assistant, preset, counts)) }];
  const users = chat.messages.filter((m) => m.role === "user");
  const recentImages = new Set(users.slice(-2).map((m) => m.id));
  const lastUser = users.at(-1)?.id;
  let afterLastUser = false;
  for (const m of chat.messages) {
    if (m.id === lastUser) afterLastUser = true;
    if (m.role === "user") { out.push({ role: "user", content: userContent(m, recentImages.has(m.id)) }); continue; }
    let step = 0;
    for (const round of m.rounds) {
      out.push({ role: "assistant", content: round.text, toolCalls: round.calls });
      for (const c of round.calls) {
        const s = m.steps[step++];
        let res = s?.result ?? "";
        if (!afterLastUser && res.length > OLD_RESULT) res = `${res.slice(0, OLD_RESULT)} …(trimmed; call the tool again if you need it)`;
        out.push({ role: "tool", toolCallId: c.id, content: res });
      }
    }
    if (m.text || m.error) out.push({ role: "assistant", content: m.text || `(failed: ${m.error})` });
  }
  return out;
}

// ------------------------------------------------------------------ one reply

export interface RunCallbacks {
  /** The reply as it is being written (called often). */
  onUpdate(m: AssistantMessage): void;
}

export async function runAssistant(o: {
  core: HomunculusCore; store: SqlStore; chat: AssistantChat; main: ConnectionConfig; connections: Record<string, ConnectionConfig>;
  signal?: AbortSignal; newId?: () => string; now?: () => number;
} & RunCallbacks): Promise<AssistantChat> {
  const newId = o.newId ?? (() => crypto.randomUUID());
  const now = o.now ?? (() => Date.now());
  const settings = await loadSettings(o.store);
  const { assistant, preset } = resolveFor(o.chat, settings);
  const conn = connectionFor(o.chat, assistant, o.main, o.connections);
  const counts = await libraryCounts(o.store);
  const est = (t: string) => Math.ceil(t.length / 3.6);
  const sys = systemParts(assistant, preset, counts);
  const parts: Record<string, number> = { app: est(sys.app ?? ""), assistant: est(sys.assistant ?? ""), preset: est(sys.preset ?? ""), tools: est(JSON.stringify(TOOL_SPECS)) };
  const reply: AssistantMessage = { id: newId(), role: "assistant", text: "", reasoning: "", attachments: [], steps: [], rounds: [], results: [], used: { model: conn.model, guides: [] }, createdAt: now() };
  let chat: AssistantChat = { ...o.chat, messages: [...o.chat.messages, reply] };
  const guides = new Set(o.chat.guides);
  const files = new Map<string, { name: string; text: string; mime: string }>();
  const images = new Map<string, { name: string; mime: string; base64: string }>();
  for (const m of o.chat.messages) for (const a of m.attachments) {
    if (a.type === "file") files.set(a.id, { name: a.name, text: a.text, mime: a.mime });
    if (a.type === "image") images.set(a.id, { name: a.name, mime: a.mime, base64: a.base64 });
  }
  const ctx: ToolContext = {
    store: o.store, saveNew: assistant.saveNew, newId, files, images, results: reply.results, guides,
    remember: async (text) => {
      const s = await loadSettings(o.store);
      const target = preset ? s.presets.find((p) => p.id === preset.id) : undefined;
      if (!target || !target.autoMemory) throw new Error(target ? `Memory is off for the preset “${target.name}”; tell the user to add it there.` : "No preset is in use, so there is nowhere to remember it.");
      await saveSettings(o.store, { ...s, presets: s.presets.map((p) => (p.id === target.id ? { ...p, memory: [...p.memory, { id: newId(), text, from: o.chat.title, at: now() }] } : p)) });
    },
  };
  const push = () => o.onUpdate({ ...reply, steps: [...reply.steps], rounds: [...reply.rounds], results: [...reply.results] });
  const usage = { tokensIn: 0, tokensOut: 0, cost: 0, last: 0 };

  try {
    for (let step = 0; ; step++) {
      const turns = toTurns(chat, settings, counts);
      let text = "";
      let calls: ToolCall[] = [];
      for await (const chunk of o.core.connections.stream(conn, [], o.signal, { tools: TOOL_SPECS, rich: turns })) {
        if (typeof chunk === "string") { text += chunk; reply.text = text; push(); }
        else if ("reasoning" in chunk) { reply.reasoning += chunk.reasoning; push(); }
        else if ("toolCalls" in chunk) calls = calls.concat(chunk.toolCalls);
        else if ("usage" in chunk) { usage.last = chunk.usage.tokensIn ?? usage.last; usage.tokensIn += chunk.usage.tokensIn ?? 0; usage.tokensOut += chunk.usage.tokensOut ?? 0; usage.cost += chunk.usage.cost ?? 0; }
      }
      if (!calls.length) { reply.text = text; break; }
      if (step >= assistant.maxSteps) { reply.text = `${text}\n\n(Stopped after ${assistant.maxSteps} steps — say “go on” to continue.)`.trim(); break; }
      reply.rounds.push({ text, calls: calls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })) });
      reply.text = "";
      for (const c of calls) {
        reply.steps.push({ id: c.id, name: c.name, args: c.arguments, result: "", label: "…", error: false });
        push();
        const out = await runTool(c.name, c.arguments, ctx);
        reply.steps[reply.steps.length - 1] = { id: c.id, name: c.name, args: c.arguments, result: out.result, label: out.label, error: out.error ?? false };
        push();
      }
      chat = { ...chat, messages: [...o.chat.messages, reply] };
    }
  } catch (e) {
    reply.error = e instanceof Error ? e.message : String(e);
  }
  // the chat's share: from the service's count when it gave one, else estimated from the turns themselves
  const sysTotal = parts.app! + parts.assistant! + parts.preset! + parts.tools!;
  parts.chat = usage.last ? Math.max(0, usage.last - sysTotal) : est(JSON.stringify(toTurns({ ...chat, messages: [...o.chat.messages, reply] }, settings, counts).slice(1)));
  reply.used = { model: conn.model, guides: [...guides], assistant: assistant.name, ...(preset ? { preset: preset.name } : {}), parts, ...(usage.last ? { lastPrompt: usage.last } : {}), ...(usage.tokensIn ? { tokensIn: usage.tokensIn } : {}), ...(usage.tokensOut ? { tokensOut: usage.tokensOut } : {}), ...(usage.cost ? { cost: usage.cost } : {}) };
  push();
  const made = reply.results.filter((r) => r.type === "created" || r.type === "change").map((r) => (r as { name: string }).name);
  const first = o.chat.messages.find((m) => m.role === "user");
  const final: AssistantChat = {
    ...o.chat,
    title: o.chat.title === "New chat" && first ? first.text.replace(/\s+/g, " ").slice(0, 48) || "New chat" : o.chat.title,
    summary: made.length ? `Made or changed: ${[...new Set(made)].slice(0, 3).join(", ")}` : o.chat.summary,
    guides: [...guides], messages: [...o.chat.messages, reply], updatedAt: now(),
  };
  await saveChat(o.store, final);
  return final;
}

/** Changes a result card in a saved chat (after Apply / Discard / Undo). */
export async function updateResult(store: SqlStore, chatId: string, messageId: string, index: number, next: AssistantResult): Promise<AssistantChat | undefined> {
  const chat = await loadChat(store, chatId);
  if (!chat) return undefined;
  const messages = chat.messages.map((m) => (m.id === messageId ? { ...m, results: m.results.map((r, i) => (i === index ? next : r)) } : m));
  const out = { ...chat, messages, updatedAt: Date.now() };
  await saveChat(store, out);
  return out;
}
