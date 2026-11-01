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
import { BUILTIN_ASSISTANTS, CORE_RULES, DRAFT_RULES, GUIDES, WEB_RULES } from "./guides.ts";
import { libraryCounts, runTool, TOOL_SPECS, webSession, type ToolContext } from "./tools.ts";
import type { WebSession } from "./web.ts";
export { TOOL_SPECS };

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
    toolsOff: raw.toolsOff,
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

/** Tool groups the user can switch off (Details → Tools). Reading tools are always on. */
export const TOOL_GROUPS: Array<{ id: string; label: string; help: string; tools: string[] }> = [
  { id: "read", label: "Read your library", help: "find, read, folders, guides — always on", tools: ["find", "read", "folders", "guide"] },
  { id: "create", label: "Create items", help: "new characters, lorebooks, trackers, Kits, narrators; imports", tools: ["create", "import_file"] },
  { id: "change", label: "Propose changes", help: "changes, pictures and Trash proposals — you approve each", tools: ["change", "set_picture", "propose_trash"] },
  { id: "organize", label: "Organize folders", help: "makes folders and puts items in them — Undo on the card", tools: ["move"] },
  { id: "files", label: "Read attached files", help: "parts of the files you attach", tools: ["read_file"] },
  { id: "memory", label: "Remember", help: "adds to the preset's memory", tools: ["remember"] },
  // D-067: for this group the switch is the default; 🌐 Web in the message box decides per chat (as in Flint)
  { id: "web", label: "Search the web", help: "DuckDuckGo · the default for chats; 🌐 Web in the message box turns it on or off for one chat", tools: ["web_search", "web_fetch"] },
];
/** Tools that save (left out while "Draft first" is on). */
export const SAVING_TOOLS = ["create", "import_file", "change", "set_picture", "propose_trash"];
export const WEB_TOOLS = ["web_search", "web_fetch"];
/** Web search for a chat: its own choice, else the default (Details → Tools). */
export const webOn = (chat: Pick<AssistantChat, "webSearch"> | null | undefined, s: AssistantSettings) => chat?.webSearch ?? !s.toolsOff.includes("web");
export const toolsFor = (s: AssistantSettings, draftFirst = false, web = !s.toolsOff.includes("web")) => TOOL_SPECS.filter((t) =>
  (WEB_TOOLS.includes(t.name) ? web : !TOOL_GROUPS.some((g) => g.id !== "read" && s.toolsOff.includes(g.id) && g.tools.includes(t.name))) && !(draftFirst && SAVING_TOOLS.includes(t.name)));

export interface WebSource { url: string; title: string; read: boolean }
/**
 * The web pages a reply used, from its own steps (Flint's "sources" row): pages read first, then search hits
 * not read; one entry per address; only http(s).
 */
export function webSources(steps: AssistantMessage["steps"]): { sources: WebSource[]; read: number; found: number } {
  const read = new Map<string, string>();
  const found = new Map<string, string>();
  for (const s of steps) {
    if (s.error) continue;
    if (s.name === "web_fetch") {
      const m = /^Page: (.*) — (https?:\/\/\S+) \(characters \d/.exec(s.result);
      if (m && !read.has(m[2]!)) read.set(m[2]!, m[1]!);
    } else if (s.name === "web_search" && s.result.startsWith("Web results for")) {
      for (const m of s.result.matchAll(/^\d+\. (.*)\n {3}(https?:\/\/\S+)$/gm)) if (!found.has(m[2]!)) found.set(m[2]!, m[1]!);
    }
  }
  const sources: WebSource[] = [...read].map(([url, title]) => ({ url, title: title || found.get(url) || "", read: true }));
  for (const [url, title] of found) if (!read.has(url)) sources.push({ url, title, read: false });
  return { sources, read: read.size, found: sources.length - read.size };
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
export function systemParts(assistant: AssistantPersona, preset: AssistantPreset | undefined, counts: string, draftFirst = false, web = false): Record<string, string> {
  const parts: Record<string, string> = { app: `${CORE_RULES}${web ? `\n${WEB_RULES}` : ""}${draftFirst ? `\n\n${DRAFT_RULES}` : ""}`, assistant: assistant.instructions.trim() ? `Your role — ${assistant.name}:\n${assistant.instructions.trim()}` : "", library: `The user's library: ${counts}.` };
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

/** One short current outcome per card, independent of the original tool response. */
function resultLines(m: AssistantMessage): string[] {
  return m.results.flatMap((r) => {
    if (r.type === "memory") return [];
    if (r.type === "moved") return [`[Result: ${r.items.map((i) => `${i.kind}:${i.itemId}`).join(", ")} — move to ${JSON.stringify(r.folder)} ${r.undone ? "undone" : "moved"}]`];
    const ref = `${r.kind}:${"itemId" in r && r.itemId ? r.itemId : "unsaved"}`;
    const status = r.type === "created" ? r.undone ? "undone" : "created" : r.status === "applied" ? "approved/applied" : r.status;
    return [`[Result: ${r.type} ${ref} ${JSON.stringify(r.name)} — ${status}]`];
  });
}

/** The saved chat as model turns (exact rounds of tool calls; older tool results shortened). */
export function toTurns(chat: AssistantChat, settings: AssistantSettings, counts: string): RichTurn[] {
  const { assistant, preset } = resolveFor(chat, settings);
  const out: RichTurn[] = [{ role: "system", content: systemText(systemParts(assistant, preset, counts, chat.draftFirst, webOn(chat, settings))) }];
  const users = chat.messages.filter((m) => m.role === "user");
  const recentImages = new Set(users.slice(-2).map((m) => m.id));
  const lastUser = users.at(-1)?.id;
  let afterLastUser = false;
  // compacted: the older messages go as their summary
  const cut = chat.compact ? chat.messages.findIndex((m) => m.id === chat.compact!.uptoId) : -1;
  if (cut >= 0) out.push({ role: "user", content: `[Summary of the earlier conversation — the messages themselves were compacted]\n${chat.compact!.summary}` }, { role: "assistant", content: "Understood." });
  const earlierResults = chat.messages.slice(0, cut + 1).flatMap(resultLines);
  if (earlierResults.length) out.push({ role: "user", content: earlierResults.join("\n") });
  for (const m of chat.messages.slice(cut + 1)) {
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
    const outcomes = afterLastUser ? [] : resultLines(m);
    if (m.text || m.error || outcomes.length) out.push({ role: "assistant", content: [m.text || (m.error ? `(failed: ${m.error})` : ""), ...outcomes].filter(Boolean).join("\n") });
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
  /** Web access (tests pass a fake; the app uses the shared one). */
  web?: WebSession;
} & RunCallbacks): Promise<AssistantChat> {
  const newId = o.newId ?? (() => crypto.randomUUID());
  const now = o.now ?? (() => Date.now());
  const settings = await loadSettings(o.store);
  const { assistant, preset } = resolveFor(o.chat, settings);
  const conn = connectionFor(o.chat, assistant, o.main, o.connections);
  const counts = await libraryCounts(o.store);
  const est = (t: string) => Math.ceil(t.length / 3.6);
  const web = webOn(o.chat, settings);
  const sys = systemParts(assistant, preset, counts, o.chat.draftFirst, web);
  const tools = toolsFor(settings, o.chat.draftFirst, web);
  const parts: Record<string, number> = { app: est(sys.app ?? ""), assistant: est(sys.assistant ?? ""), preset: est(sys.preset ?? ""), tools: est(JSON.stringify(tools)) };
  const sent = [
    ...(preset ? [...preset.rules.filter((r) => r.on && r.text.trim()).map((r) => r.id), ...preset.notes.filter((n) => n.on && n.text.trim()).map((n) => n.id), ...(preset.memoryOn ? preset.memory.map((m) => m.id) : [])] : []),
    ...o.chat.messages.slice((o.chat.compact ? o.chat.messages.findIndex((m) => m.id === o.chat.compact!.uptoId) : -1) + 1).flatMap((m) => m.attachments.map((a) => a.id)),
  ];
  const t0 = now();
  let thinkMs = 0, writeMs = 0, callsMade = 0;
  const repeats = new Map<string, number>();
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
    store: o.store, saveNew: assistant.saveNew, newId, files, images, results: reply.results, guides, signal: o.signal,
    web: o.web ?? webSession, webBudget: { searches: 0, chars: 0 },
    onStatus: (label) => { const last = reply.steps.at(-1); if (last && !last.result) { last.label = label; push(); } },
    remember: async (text) => {
      const s = await loadSettings(o.store);
      const target = preset ? s.presets.find((p) => p.id === preset.id) : undefined;
      if (!target || !target.autoMemory) throw new Error(target ? `Memory is off for the preset “${target.name}”; tell the user to add it there.` : "No preset is in use, so there is nowhere to remember it.");
      o.signal?.throwIfAborted();
      await saveSettings(o.store, { ...s, presets: s.presets.map((p) => (p.id === target.id ? { ...p, memory: [...p.memory, { id: newId(), text, from: o.chat.title, at: now() }] } : p)) });
    },
  };
  const push = () => o.onUpdate({ ...reply, steps: [...reply.steps], rounds: [...reply.rounds], results: [...reply.results] });
  const usage = { tokensIn: 0, tokensOut: 0, cost: 0, last: 0 };

  try {
    for (let step = 0; ; step++) {
      o.signal?.throwIfAborted();
      const turns = toTurns(chat, settings, counts);
      ctx.availableGuides = new Set(Object.values(GUIDES).filter((g) => turns.some((t) => t.role === "tool" && t.content === g.text)).map((g) => g.kind));
      let text = "";
      let calls: ToolCall[] = [];
      const callStart = now();
      let firstText = 0;
      for await (const chunk of o.core.connections.stream(conn, [], o.signal, { tools, rich: turns })) {
        if (typeof chunk === "string") { if (!firstText) firstText = now(); text += chunk; reply.text = text; push(); }
        else if ("reasoning" in chunk) { reply.reasoning += chunk.reasoning; push(); }
        else if ("toolCalls" in chunk) calls = calls.concat(chunk.toolCalls);
        else if ("usage" in chunk) { usage.last = chunk.usage.tokensIn ?? usage.last; usage.tokensIn += chunk.usage.tokensIn ?? 0; usage.tokensOut += chunk.usage.tokensOut ?? 0; usage.cost += chunk.usage.cost ?? 0; }
      }
      callsMade++;
      if (firstText) { thinkMs += firstText - callStart; writeMs += now() - firstText; } else thinkMs += now() - callStart;
      if (!calls.length) { reply.text = text; break; }
      if (step >= assistant.maxSteps) { reply.text = `${text}\n\n(Stopped after ${assistant.maxSteps} steps — say “go on” to continue.)`.trim(); break; }
      reply.rounds.push({ text, calls: calls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })) });
      reply.text = "";
      let looping = false;
      for (const c of calls) {
        reply.steps.push({ id: c.id, name: c.name, args: c.arguments, result: "", label: "…", error: false });
        push();
        o.signal?.throwIfAborted();
        const key = `${c.name}|${c.arguments}`;
        const seen = (repeats.get(key) ?? 0) + 1;
        repeats.set(key, seen);
        const s0 = now();
        const out = seen >= 3
          ? { result: "You already made this exact call twice. Stop calling tools now and answer the user with what you have.", label: `Stopped a repeated ${c.name}`, error: true }
          : !tools.some((t) => t.name === c.name)
            ? { result: `The tool “${c.name}” is switched off by the user.`, label: `${c.name} is off`, error: true }
            : await runTool(c.name, c.arguments, ctx);
        if (seen >= 3) looping = true;
        reply.steps[reply.steps.length - 1] = { id: c.id, name: c.name, args: c.arguments, result: out.result, label: out.label, error: out.error ?? false, ms: now() - s0 };
        push();
      }
      if (looping && repeats.size && [...repeats.values()].some((n) => n >= 4)) { reply.text = "(Stopped: the same tool call kept repeating.)"; break; }
      chat = { ...chat, messages: [...o.chat.messages, reply] };
    }
  } catch (e) {
    // Keep every requested tool paired, including calls that Stop prevented from starting.
    for (const round of reply.rounds) for (const c of round.calls) {
      const index = reply.steps.findIndex((step) => step.id === c.id);
      if (index >= 0 && reply.steps[index]!.label !== "…") continue;
      const stopped = { id: c.id, name: c.name, args: c.arguments, result: "Stopped before execution.", label: "Stopped", error: true };
      if (index >= 0) reply.steps[index] = stopped; else reply.steps.push(stopped);
    }
    reply.error = e instanceof Error ? e.message : String(e);
  }
  // the chat's share: from the service's count when it gave one, else estimated from the turns themselves
  const sysTotal = parts.app! + parts.assistant! + parts.preset! + parts.tools!;
  parts.chat = usage.last ? Math.max(0, usage.last - sysTotal) : est(JSON.stringify(toTurns({ ...chat, messages: [...o.chat.messages, reply] }, settings, counts).slice(1)));
  reply.used = { model: conn.model, guides: [...guides], assistant: assistant.name, ...(preset ? { preset: preset.name } : {}), parts, sent, ms: now() - t0, thinkMs, writeMs, calls: callsMade, ...(usage.last ? { lastPrompt: usage.last } : {}), ...(usage.tokensIn ? { tokensIn: usage.tokensIn } : {}), ...(usage.tokensOut ? { tokensOut: usage.tokensOut } : {}), ...(usage.cost ? { cost: usage.cost } : {}) };
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

/**
 * Compaction (Flint): the older messages are summed up by the model (no tools) and sent as that summary from then on.
 * Keeps the newest `keep` user turns word for word. Returns the chat unchanged when there is too little to compact.
 */
export async function compactChat(o: { core: HomunculusCore; store: SqlStore; chat: AssistantChat; main: ConnectionConfig; connections: Record<string, ConnectionConfig>; keep?: number; signal?: AbortSignal }): Promise<AssistantChat> {
  const keep = o.keep ?? 2;
  const userIdx = o.chat.messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  if (userIdx.length <= keep) return o.chat;
  const endAt = userIdx[userIdx.length - keep]! - 1; // the last message that gets summed up
  const upto = o.chat.messages[endAt];
  if (!upto) return o.chat;
  const settings = await loadSettings(o.store);
  const { assistant } = resolveFor(o.chat, settings);
  const conn = connectionFor(o.chat, assistant, o.main, o.connections);
  const lines: string[] = [];
  if (o.chat.compact) lines.push(`Earlier summary:\n${o.chat.compact.summary}`);
  const start = o.chat.compact ? o.chat.messages.findIndex((m) => m.id === o.chat.compact!.uptoId) + 1 : 0;
  for (const m of o.chat.messages.slice(start, endAt + 1)) {
    if (m.role === "user") lines.push(`USER: ${m.text}${m.attachments.length ? ` [attached: ${m.attachments.map((a) => (a.type === "item" ? `${a.kind}:${a.id} ${a.name}` : a.name)).join(", ")}]` : ""}`);
    else {
      lines.push(`ASSISTANT: ${m.text}`);
      for (const s of m.steps) lines.push(`  (tool ${s.name}: ${s.label})`);
      for (const r of m.results) if (r.type === "moved") lines.push(`  [moved ${r.items.map((i) => `${i.kind}:${i.itemId}`).join(", ")} to the folder “${r.folder || "(top)"}”${r.undone ? " — undone" : ""}]`);
      else if (r.type !== "memory") lines.push(`  [${r.type} ${r.kind} “${r.name}”${"itemId" in r && r.itemId ? ` ${r.kind}:${r.itemId}` : ""}${"status" in r ? ` — ${r.status}` : ""}]`);
    }
  }
  const out = await o.core.connections.complete(conn, [
    { role: "system", content: "You sum up a conversation between a user and an assistant that builds roleplay material (characters, lorebooks, trackers, Kits, narrators) in an app, so it can continue without the full text. Keep: what the user wants and decided, their preferences, every item made or changed with its kind:id, proposals still waiting, open questions. Plain prose and short lists; no greetings." },
    { role: "user", content: lines.join("\n").slice(-60_000) },
  ], { ...(o.signal ? { signal: o.signal } : {}), maxTokens: 1200 });
  const summary = out.text.trim();
  if (!summary) return o.chat;
  const next: AssistantChat = { ...o.chat, compact: { uptoId: upto.id, summary, at: Date.now(), ...(out.tokensIn ? { before: out.tokensIn } : {}) }, updatedAt: Date.now() };
  await saveChat(o.store, next);
  return next;
}

/** Should this chat compact by itself before the next message? (80% of the model's context, or 60k when unknown.) */
export function needsCompaction(chat: AssistantChat): boolean {
  if (!chat.autoCompact) return false;
  const last = [...chat.messages].reverse().find((m) => m.role === "assistant" && m.used)?.used;
  const used = last?.lastPrompt ?? (last?.parts ? Object.values(last.parts).reduce((a, b) => a + b, 0) : 0);
  return used > 0.8 * (chat.contextLength ?? 75_000);
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
