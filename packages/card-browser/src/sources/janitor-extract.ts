// Extracting a JanitorAI card whose creator hides the definition (D-099), adapted from Glaze (hydall/Glaze f1fe39e, AGPL-3.0):
// janitor_webview_proxy.dart `captureGenerateAlpha` / `_enterExtractionMode` / `_restoreProfile`, janitor_extractor.dart
// `extract`, janitor_lorebook_rebuilder.dart (the rebuild prompt), greeting_normalizer.dart.
//
// How it works: JanitorAI assembles the whole prompt (hidden card + the lore its keywords fire) and hands it to the browser
// (/generateAlpha) before the browser sends it to the account's proxy. So, in JanitorAI's own window and the person's own
// account, the run selects a temporary unreachable proxy, opens a chat with the character, sends "." (the card) and then the
// card's own words (to fire lore), keeps the prompts, and puts everything back: chat deleted, persona deleted, proxy
// preset deleted, the previous proxy / model / context length selected again. CLAUDE, 2026-11-08.
import { type CardFile, type CardItem, DEFAULT_TRIGGER, type ExtractOptions, type JanitorBridge, type SiteTransport, type TriggerChoice } from "../types.ts";
import { fieldsOf, fieldsOfMeta, isSaturated, scanInjectedFields, splitTrigger, withoutInjected } from "./janitor-diff.ts";
import { askImage, buildCard, plain, text } from "../build.ts";
import { SiteError } from "../pauses.ts";
import { type AlphaPayload, extractCard, extractExample, extractFirstMessage, extractName, extractScenario, isAlphaPayload, mergeLore, restoreMacros, separate, splitEntries, stripJanitorCredit } from "./janitor-prompt.ts";

type Row = Record<string, unknown>;
export interface ExtractDeps {
  /** Loads the character and its public lorebook entries (janitor.ts). */
  meta(item: CardItem, t: SiteTransport): Promise<Row>;
  publicBook(meta: Row, name: string, t: SiteTransport): Promise<Row[]>;
  avatar(meta: Row, item: CardItem): string;
  tags(meta: Row): string[];
}
export interface Extracted { file: CardFile; closedEntries: number; loreNote: string }

const USER_MACRO = "{{user}}";
const json = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const fail = (message: string) => new SiteError(message, "janitor", "data");

async function call(j: JanitorBridge, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const r = await j.call(method, path, body);
  if (r.status === 401) throw fail("JanitorAI signed you out. Sign In… again, then try once more.");
  if (r.status < 200 || r.status >= 300) throw fail(`JanitorAI refused a step of the extraction (${method} ${path.split("/").slice(0, 3).join("/")}: ${r.status}).`);
  return json(r.text);
}
const quiet = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* clean-up is best effort; the result stands */ } };

// ------------------------------------------------------------------ the account's temporary state
type Snapshot = { selected: unknown; source: unknown; gen: Row | null; dummy: string; hadOwn: boolean };
/** Selects a fresh unreachable proxy preset and context length 0 (so the prompt keeps its tags). Glaze `_enterExtractionMode`. */
async function enterExtractionMode(j: JanitorBridge): Promise<Snapshot> {
  const before = (await call(j, "GET", "/hampter/api-settings")) as Row | null;
  const settings = (before?.settings ?? {}) as Row;
  const gen = settings.generation_settings && typeof settings.generation_settings === "object" ? { ...(settings.generation_settings as Row) } : null;
  const hadOwn = Array.isArray(before?.proxy_configs) && (before!.proxy_configs as unknown[]).length > 0;
  const clientId = crypto.randomUUID();
  await call(j, "POST", "/hampter/api-settings/proxy-configs", {
    api_key: "sk-" + rnd(48), api_url: `http://127.0.0.1:${8001 + Math.floor(Math.random() * 57000)}/v1/chat/completions`,
    model: "gpt-4o", name: rnd(12), prompt_id: null, client_id: clientId,
  });
  const after = (await call(j, "GET", "/hampter/api-settings")) as Row | null;
  const made = (Array.isArray(after?.proxy_configs) ? after!.proxy_configs as Row[] : []).find((p) => p?.client_id === clientId);
  const dummy = made?.id === undefined || made?.id === null ? "" : String(made.id);
  if (!dummy) throw fail("JanitorAI did not keep the temporary proxy preset.");
  const snap: Snapshot = { selected: settings.selected_proxy_config_id ?? null, source: settings.source ?? null, gen, dummy, hadOwn };
  try {
    await call(j, "PATCH", "/hampter/api-settings", { selected_proxy_config_id: dummy });
    await quiet(() => call(j, "PATCH", "/hampter/api-settings", { source: "proxy" }));
    await quiet(() => call(j, "PATCH", "/hampter/api-settings", { generation_settings: { ...(gen ?? {}), context_length: 0 } }));
  } catch (e) { await restoreSettings(j, snap); throw e; }
  return snap;
}
/** Puts the previous selection back (JanitorAI's own model when the account had no presets) and deletes the temporary preset. */
async function restoreSettings(j: JanitorBridge, s: Snapshot): Promise<void> {
  const patch: Row = { selected_proxy_config_id: s.hadOwn ? s.selected : null };
  if (!s.hadOwn) patch.source = "janitor"; else if (s.source !== null) patch.source = s.source;
  patch.generation_settings = s.gen && typeof s.gen.context_length === "number" ? s.gen : { ...(s.gen ?? {}), context_length: 4096 };
  await quiet(() => call(j, "PATCH", "/hampter/api-settings", patch));
  await quiet(() => call(j, "DELETE", `/hampter/api-settings/proxy-configs/${s.dummy}`));
}
/** A profile without a name gets a "set up your profile" window over the first chat; a random name stands in meanwhile. */
async function seedProfileName(j: JanitorBridge): Promise<{ restore?: Row; sentinel?: string; name?: string }> {
  try {
    const p = (await call(j, "GET", "/hampter/profiles/mine")) as Row | null;
    if (!p) return {};
    if (text(p.name)) return { name: text(p.name) };
    const sentinel = rnd(24).toUpperCase();
    await call(j, "PATCH", "/hampter/profiles/mine", { name: sentinel, profile: typeof p.profile === "string" ? p.profile : "" });
    return { restore: { name: "", profile: typeof p.profile === "string" ? p.profile : "" }, sentinel };
  } catch { return {}; }
}
/** A persona literally named {{user}}, so JanitorAI's name substitution leaves the macro in the card. */
async function userPersona(j: JanitorBridge): Promise<{ id: string | null; made: boolean }> {
  try {
    const list = (await call(j, "GET", "/hampter/personas")) as unknown;
    const rows = Array.isArray(list) ? list : Array.isArray((list as Row)?.personas) ? (list as Row).personas as Row[] : Array.isArray((list as Row)?.data) ? (list as Row).data as Row[] : [];
    const found = (rows as Row[]).find((p) => p?.name === USER_MACRO && p.id !== undefined);
    if (found) return { id: String(found.id), made: false };
  } catch { /* try to make one */ }
  try {
    const made = (await call(j, "POST", "/hampter/personas", { appearance: "", avatar: "", groupId: null, name: USER_MACRO, pronouns: null })) as Row | null;
    const id = made?.id ?? (made?.data as Row | undefined)?.id;
    return { id: id === undefined || id === null ? null : String(id), made: true };
  } catch { return { id: null, made: false }; }
}

// ------------------------------------------------------------------ the chat page
async function untilComposer(j: JanitorBridge, ms: number, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    try { if ((json((await j.page("composer")).text) as Row | null)?.ready === true) return; } catch { /* the page is still loading */ }
    await sleep(500);
  }
}
type Sent = { payload: AlphaPayload | null; problem: string };
async function sendAndCapture(j: JanitorBridge, message: string, ms: number, sleep: (ms: number) => Promise<void>): Promise<Sent> {
  await j.page("reset");
  const sent = json((await j.page("send", message)).text) as Row | null;
  let problem = sent?.ok === false ? text(sent.reason) || "The message could not be sent." : sent?.cleared === false ? "The message stayed in JanitorAI's message box." : "";
  for (const end = Date.now() + ms; Date.now() < end;) {
    await sleep(800);
    const a = json((await j.page("alpha")).text) as Row | null;
    if (isAlphaPayload(a?.payload)) return { payload: a!.payload as AlphaPayload, problem: "" };
    // an HTTP error on /generateAlpha is JanitorAI's final answer (e.g. the creator forbids proxies)
    const refused = (Array.isArray(a?.log) ? a!.log as Row[] : []).find((e) => e && e.matched !== true && typeof e.status === "number" && (e.status as number) >= 400);
    if (refused) {
      const body = json(text(refused.body)) as Row | null;
      const why = text(body?.message) || text(body?.error) || text(body?.detail) || text(refused.body).slice(0, 160);
      throw fail(`JanitorAI refused to build this character's prompt (${refused.status}${why ? ": " + why : ""}).`);
    }
  }
  return { payload: null, problem: problem || "JanitorAI never built the prompt (no answer from /generateAlpha)." };
}
/** Greetings of the chat's own copy of the character (a hidden card keeps them out of /characters/{id}). */
function chatGreetings(chat: unknown): string[] {
  const c = ((chat as Row)?.character ?? ((chat as Row)?.data as Row | undefined)?.character) as Row | undefined;
  if (!c) return [];
  const out: string[] = [];
  for (const g of [c.first_message, ...(Array.isArray(c.first_messages) ? c.first_messages : [])]) {
    const v = (typeof g === "string" ? g : g && typeof g === "object" ? text((g as Row).first_message ?? (g as Row).message) : "").trim();
    if (v && /[\p{L}\p{N}]/u.test(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

// ------------------------------------------------------------------ the closed lorebook
export const LORE_PROMPT = `You reconstruct a SillyTavern World Info (lorebook) from raw text.

You are given text extracted from an LLM chat prompt: one or more lorebook entries a
roleplay platform injected because their trigger keywords matched. The character card and
user persona have already been removed; what remains is lorebook entry bodies concatenated
together (often separated by blank lines). You may also be given the character card and a
catalog/world description as CONTEXT — use those ONLY to infer better keys, never output
them as entries.

Your job:
1. Split the text into discrete, self-contained World Info entries. Each coherent block
   about one topic (a person, place, faction, item, rule, lore fact) is one entry. Do NOT
   merge unrelated topics; do NOT split a single topic across entries.
2. For each entry write:
   - "content": the entry body, faithful to the source.
   - "key": array of primary trigger keywords/phrases (names, aliases, places, distinctive
     nouns), inferred from the content and the provided context.
   - "keysecondary": optional array of secondary keywords (else []).
   - "comment": a short title (the topic name).
   - "order": optional integer insertion order; default 100.
3. Output ONLY a JSON object:
   { "entries": [ { "comment": "...", "key": ["..."], "keysecondary": [], "content": "...", "order": 100 }, ... ] }
No markdown, no prose, no code fences — JSON only.`;
export function loreMessages(lore: string, card: string, catalog: string): Array<{ role: "system" | "user"; content: string }> {
  const parts = [card && `CHARACTER CARD (context only):\n${card}`, catalog && `CATALOG (context only):\n${catalog}`, `LOREBOOK TEXT:\n${lore}`].filter(Boolean);
  return [{ role: "system", content: LORE_PROMPT }, { role: "user", content: parts.join("\n\n---\n\n") }];
}
const strings = (v: unknown) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
/** The model's JSON (tolerating fences or prose around it) → card book entries; empty when it can't be read. */
export function parseLoreAnswer(answer: string): Row[] {
  const s = answer.replace(/```(?:json)?/gi, "");
  const from = s.indexOf("{"), to = s.lastIndexOf("}");
  const o = from >= 0 && to > from ? json(s.slice(from, to + 1)) as Row | null : null;
  const rows = Array.isArray(o?.entries) ? o!.entries as Row[] : [];
  return rows.filter((e) => e && text(e.content)).map((e) => ({ comment: text(e.comment), keys: strings(e.key ?? e.keys), secondary_keys: strings(e.keysecondary ?? e.secondary_keys), content: text(e.content), order: typeof e.order === "number" ? e.order : 100 }));
}
function closedEntries(rows: Row[], start: number): Row[] {
  return rows.map((e, i) => {
    const keys = e.keys as string[];
    return { id: start + i, keys, secondary_keys: e.secondary_keys ?? [], comment: ["Closed lore", text(e.comment)].filter(Boolean).join(" · "), content: e.content,
      // without keys an entry would never fire: it stays off until someone gives it some
      constant: false, selective: true, insertion_order: e.order ?? 100, enabled: keys.length > 0, position: "after_char", extensions: { position: 1, depth: 4, probability: 100, useProbability: true, selectiveLogic: 0 } };
  });
}

// ------------------------------------------------------------------ the trigger
const htmlText = (v: unknown) => plain(v).trim();
/** The lorebooks attached to the card, as "- Title: description" lines (Glaze `buildLorebookDescsContext`). */
export function lorebookLines(meta: Row): string {
  return (Array.isArray(meta.scripts) ? meta.scripts as Row[] : []).filter((x) => x && (x.type === "lorebook" || x.type === "advanced"))
    .map((x) => { const t = text(x.title), d = htmlText(x.description); return t || d ? `- ${t}${d ? `: ${d}` : ""}` : ""; }).filter(Boolean).join("\n");
}
/** The catalog page as text: name, tags, description, scenario, attached lorebooks (Glaze `_buildCatalogContext`). */
export function catalogText(meta: Row, tags: string[]): string {
  const desc = htmlText(meta.description), scen = htmlText(meta.scenario), books = lorebookLines(meta);
  return [text(meta.name) && `Name: ${text(meta.name)}`, tags.length && `Tags: ${tags.join(", ")}`, desc && `Catalog description:\n${desc}`,
    scen && `Scenario:\n${scen}`, books && `Lorebooks:\n${books}`].filter(Boolean).join("\n");
}
/** Everything chosen except the card (it exists only inside the prompt the "." probe reveals). */
export function triggerText(meta: Row, tags: string[], c: TriggerChoice): string {
  const greetings = [text(meta.first_message), ...(Array.isArray(meta.first_messages) ? meta.first_messages.map((g) => typeof g === "string" ? g : "") : [])].map((g) => g.trim()).filter(Boolean);
  return [c.catalog ? catalogText(meta, tags) : "", c.scenario ? htmlText(meta.scenario) : "", c.greetings ? [...new Set(greetings)].join("\n\n") : "",
    c.lorebooks ? lorebookLines(meta) : "", c.extra].map((x) => x.trim()).filter(Boolean).join("\n\n");
}

// ------------------------------------------------------------------ the run
/** At most this many follow-up chats after the lore hit JanitorAI's cap (each is the better part of a minute). Glaze. */
const MAX_SPLIT_PASSES = 16;

export async function extractJanitor(item: CardItem, t: SiteTransport, deps: ExtractDeps, opts: ExtractOptions = {}): Promise<Extracted> {
  const j = t.janitor;
  if (!j || !t.janitorAccount) throw fail("Extracting works in the desktop app.");
  const phase = opts.onPhase ?? (() => {});
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const limits = { composer: 60_000, card: 60_000, lore: 120_000, ...opts.limits };
  const choice = opts.trigger ?? DEFAULT_TRIGGER;
  phase("Checking the account");
  if (!(await t.janitorAccount("status")).username) throw fail("Sign In… to JanitorAI first: extracting needs your account.");
  const meta = await deps.meta(item, t);
  if (meta.allow_proxy === false) throw fail("The creator only allows this card on JanitorAI's own model, so it can't be extracted.");
  const publicBook = await deps.publicBook(meta, item.name, t);
  const publicContents = publicBook.map((e) => text(e.content));
  const tags = deps.tags(meta);
  const context = triggerText(meta, tags, choice);

  phase("Preparing your JanitorAI account");
  await j.page("show");
  const snap = await enterExtractionMode(j);
  let profile: { restore?: Row; sentinel?: string; name?: string } = {};
  let persona: { id: string | null; made: boolean } = { id: null, made: false };
  let probe: AlphaPayload | null = null, full: AlphaPayload | null = null, greetings: string[] = [], problem = "";
  const passes: AlphaPayload[] = [];
  /** A chat of its own for each send that must be the only message JanitorAI scans; always deleted after. Glaze `_inFreshChat`. */
  const inFreshChat = async <T>(body: (chatId: string) => Promise<T>): Promise<T> => {
    const chat = (await call(j, "POST", "/hampter/chats", { character_id: item.id, ...(persona.id ? { persona_id: persona.id } : {}) })) as Row | null;
    // JanitorAI answers with a numeric id (Glaze reads it with toString)
    const rawId = chat?.id ?? (chat?.data as Row | undefined)?.id ?? (chat?.chat as Row | undefined)?.id;
    const chatId = typeof rawId === "number" || typeof rawId === "string" ? String(rawId).trim() : "";
    if (!/^[A-Za-z0-9-]{1,64}$/.test(chatId)) throw fail(`JanitorAI did not open a chat (answer: ${JSON.stringify(chat).slice(0, 160)}).`);
    try {
      await j.page("open-chat", chatId);
      // JanitorAI keeps the old proxy in its page state: one reload makes the temporary one take effect (Glaze)
      await untilComposer(j, 20_000, sleep);
      await j.page("reload");
      await untilComposer(j, limits.composer, sleep);
      return await body(chatId);
    } finally { await quiet(() => call(j, "DELETE", `/hampter/chats/${chatId}`)); }
  };
  try {
    profile = await seedProfileName(j);
    persona = await userPersona(j);
    phase("Opening a chat");
    let trigger = ".";
    await inFreshChat(async (chatId) => {
      greetings = chatGreetings(await call(j, "GET", `/hampter/chats/${chatId}`).catch(() => null));
      phase("Reading the card");
      const dot = await sendAndCapture(j, ".", limits.card, sleep);
      probe = dot.payload; problem = dot.problem;
      const card = probe && choice.card ? extractCard(probe) : "";
      trigger = [card, context].filter(Boolean).join("\n\n") || ".";
      phase("Reading the lorebook");
      const more = await sendAndCapture(j, trigger, limits.lore, sleep);
      full = more.payload; problem ||= more.problem;
    });
    // The lore that came back reached JanitorAI's cap, so fired entries were dropped: re-send the trigger in pieces,
    // each in a fresh chat (Glaze `_splitPasses`). Not when the probe alone fills it — those are always-on entries.
    if (full && isSaturated(full, probe) && !(probe && isSaturated(probe))) {
      const queue = splitTrigger(trigger);
      if (queue.length > 1) for (let pass = 1; queue.length && pass <= MAX_SPLIT_PASSES; pass++) {
        const piece = queue.shift()!;
        phase(`Reading the lorebook (part ${pass + 1} of ${pass + 1 + queue.length})`);
        const sent = await inFreshChat(() => sendAndCapture(j, piece, limits.lore, sleep));
        if (!sent.payload) continue; // one lost piece costs only the entries it fires
        passes.push(sent.payload);
        if (isSaturated(sent.payload, probe)) { const halves = splitTrigger(piece); if (halves.length > 1) queue.push(...halves); }
      }
    }
  } finally {
    phase("Putting your account back");
    await quiet(() => j.page("hide"));
    if (persona.id && persona.made) await quiet(() => call(j, "DELETE", `/hampter/personas/${persona.id}`));
    if (profile.restore) await quiet(() => call(j, "PATCH", "/hampter/profiles/mine", profile.restore));
    await restoreSettings(j, snap);
  }
  // the card comes from the "." probe: every entry the trigger fired into a field would otherwise be imported as the character
  const source: AlphaPayload | null = probe ?? full;
  if (!source) throw fail(problem || "JanitorAI never built the prompt.");
  const captures: AlphaPayload[] = [...(full ? [full] : []), ...passes];

  // names back to {{char}} / {{user}}, JanitorAI's credit line out
  const name = extractName(source) || text(meta.name) || item.name;
  const charNames = [name, text(meta.name), text(meta.chat_name)].filter(Boolean);
  // with the {{user}} persona the macro survives; otherwise JanitorAI baked the account's name in
  const userName = profile.sentinel ?? (persona.id ? null : profile.name);
  const macro = (s: string) => restoreMacros(stripJanitorCredit(s), charNames, userName);
  const separated = macro(mergeLore([...captures, ...(probe ? [probe] : [])].map((p) => separate(p, extractCard(source), publicContents))));
  // lore an entry wrote into the card's own fields: the trigger's fields minus the probe's, and (public definition only)
  // the probe's minus the catalog's clean ones
  const clean = text(meta.personality) || text(meta.scenario) ? fieldsOfMeta(meta) : null;
  const injected = scanInjectedFields({
    capture: fieldsOf(captures[0] ?? source, macro), extra: captures.slice(1).map((p) => fieldsOf(p, macro)),
    probe: probe && captures.length ? fieldsOf(probe, macro) : null, clean, publicContents, existing: separated,
  });
  // a card without closed lore leaves only template scraps here; splitEntries drops them, so no empty lorebook is made
  const lore = mergeLore([separated, ...injected.map((b) => b.text)]);
  const card = withoutInjected(macro(extractCard(source)), "persona", injected);
  if (!card) throw fail("JanitorAI's prompt had no character card in it.");
  const all: string[] = [];
  for (const g of [...greetings, text(meta.first_message), ...(Array.isArray(meta.first_messages) ? meta.first_messages : []), extractFirstMessage(source)]) {
    const v = macro(typeof g === "string" ? g.trim() : "");
    if (v && !all.includes(v)) all.push(v);
  }

  let closed: Row[] = [], loreNote = "", rebuilt = 0;
  if (lore.trim()) {
    phase("Rebuilding the lorebook");
    const asText = "it came in as text, switched off until it has keys.";
    if (opts.complete) {
      let answer = "", why = "";
      try { answer = await opts.complete(loreMessages(lore, card, catalogText(meta, tags))); closed = parseLoreAnswer(answer); }
      catch (e) { why = e instanceof Error ? e.message : String(e); }
      rebuilt = closed.length;
      if (!closed.length) {
        // say why, so a too-small reply limit, an empty answer or a refused key can be told apart
        if (!why) why = !answer.trim() ? "the AI's answer was empty" : `the AI's answer was not the expected JSON ("${answer.replace(/\s+/g, " ").trim().slice(0, 120)}…")`;
        loreNote = `The AI could not split the closed lore into entries (${why.slice(0, 220)}); ${asText}`;
      }
    } else loreNote = `No AI connection to rebuild the closed lore: ${asText}`;
    if (!closed.length) closed = splitEntries(lore).map((b, i) => ({ comment: `Entry ${i + 1}`, keys: [], secondary_keys: [], content: b, order: 100 }));
  }
  const entries = [...publicBook.map((e, i) => ({ ...e, id: i })), ...closedEntries(closed, publicBook.length)];
  const file: CardFile = {
    kind: "json",
    card: buildCard({
      name, description: card, personality: "", scenario: withoutInjected(macro(extractScenario(source)) || text(meta.scenario), "scenario", injected),
      first_mes: all[0] ?? "", alternate_greetings: all.slice(1),
      mes_example: withoutInjected(macro(extractExample(source)), "example", injected), creator_notes: plain(meta.description), tags,
      creator: text(meta.creator_name) || item.creator, character_book: entries.length ? { name: `${name} Lorebook`, entries } : undefined,
      extensions: { janitor: { id: item.id, extracted: true } },
    }),
    avatar: await askImage(t, "janitor:avatar", deps.avatar(meta, item)),
  };
  return { file, closedEntries: rebuilt, loreNote };
}
