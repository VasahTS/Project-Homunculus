// Homunculus 2 — pictures for any model (D-115). Author: CLAUDE, 2026-11-10.
//
// Daniel uses a main model that can't see pictures (GLM 5.3). A second model, the vision model, looks at each
// picture and writes what it sees; the main model gets that text in the picture's place and can ask again
// (look_at_image). The description is stored on the attachment and cached by picture + model + prompt, so a picture
// is described once, and switching models mid-chat never breaks a chat. Comic reading (comic.ts) is the same engine
// with N pictures.
import type { ConnectionConfig, HomunculusCore, ModelInfo, RichTurn, SqlStore, ToolSpec } from "@homunculus/core";
import type { AssistantSettings } from "@homunculus/schemas";

export interface Picture { name: string; mime: string; base64: string }
/** What the vision model cost in one reply. */
export interface VisionUsage { model: string; calls: number; cached: number; tokensIn: number; tokensOut: number; cost: number; ms: number }
export const emptyVisionUsage = (model = ""): VisionUsage => ({ model, calls: 0, cached: 0, tokensIn: 0, tokensOut: 0, cost: 0, ms: 0 });

// ------------------------------------------------------------------ does a model see pictures?

const KNOWN_KEY = "models.vision";
const KNOWN_MAX = 3000;
/** Provider + address + model: the same model id can mean different things on two services. */
export const modelKey = (c: Pick<ConnectionConfig, "providerId" | "baseUrl" | "model">) =>
  `${c.providerId}|${(c.baseUrl ?? "").trim().replace(/\/+$/, "")}|${c.model.trim()}`;

/** Remembers what a service's model list said about pictures (called whenever the app lists models). */
export async function rememberModels(store: SqlStore, conn: Pick<ConnectionConfig, "providerId" | "baseUrl">, models: ModelInfo[]): Promise<void> {
  const said = models.filter((m) => typeof m.vision === "boolean");
  if (!said.length) return;
  const known = { ...((await store.getAppSetting<Record<string, boolean>>(KNOWN_KEY)) ?? {}) };
  for (const m of said) known[modelKey({ ...conn, model: m.id })] = m.vision!;
  const keys = Object.keys(known);
  for (const k of keys.slice(0, Math.max(0, keys.length - KNOWN_MAX))) delete known[k];
  await store.setAppSetting(KNOWN_KEY, known);
}

/**
 * A guess from the model's name, for services that never say. Only families known to take pictures answer yes;
 * nothing answers no (an unknown model is "not known").
 */
export function guessVision(model: string): boolean | undefined {
  const m = model.toLowerCase();
  if (/(^|[^a-z])(vl|vision|llava|pixtral|moondream|minicpm-v|internvl)([^a-z]|$)|qwen[\d.]*-?vl|glm-[\d.]+v\b|gpt-4o|gpt-4\.1|gpt-5|claude-(3|sonnet|opus|haiku)|gemini|gemma-3|llama-4|grok-4|mistral-(small|medium)-3/.test(m)) return true;
  return undefined;
}

/** true = sees pictures, false = doesn't, undefined = nobody knows. The connection's own switch wins. */
export async function seesPictures(store: SqlStore, conn: ConnectionConfig): Promise<boolean | undefined> {
  if (typeof conn.vision === "boolean") return conn.vision;
  const known = (await store.getAppSetting<Record<string, boolean>>(KNOWN_KEY)) ?? {};
  const said = known[modelKey(conn)];
  return typeof said === "boolean" ? said : guessVision(conn.model);
}

/** The vision connection chosen in Settings → Assistant, or undefined. */
export function visionConnection(s: AssistantSettings, connections: Record<string, ConnectionConfig>): ConnectionConfig | undefined {
  const base = s.vision.connectionId ? connections[s.vision.connectionId] : undefined;
  return base ? { ...base, ...(s.vision.model.trim() ? { model: s.vision.model.trim() } : {}), vision: true } : undefined;
}

/**
 * How pictures reach the main model. "describe": a vision model is set and the main model is not known to see
 * pictures (describing costs one cheap call; sending a picture to a blind model fails the whole reply). "send": as
 * before. "drop": the main model is known blind and no vision model is set — the picture is named, not sent.
 */
export function pictureRoute(sees: boolean | undefined, vision: ConnectionConfig | undefined): "describe" | "send" | "drop" {
  if (vision) return sees === true ? "send" : "describe";
  return sees === false ? "drop" : "send";
}

// ------------------------------------------------------------------ calling the vision model

export const DESCRIBE_PROMPT = `You are the eyes of another AI that cannot see pictures. Describe the picture so it can answer the user as if it had seen it.
- Start with one line saying what the picture is (a screenshot of an app, a photo, a drawing, a comic page…).
- Then everything that matters, most important first: people and characters (looks, clothes, expression, pose), objects, place, colours, art style, mood. For a screenshot: the layout, every button, label, field and its state.
- Copy all readable text exactly, in quotes, in reading order.
- If the user's message asks something about the picture, first describe in full detail what that question needs.
- Say what you are unsure of. Never invent what you cannot see.
Plain text. No greeting, no advice, no opinion — only what is in the picture.`;

export const LOOK_PROMPT = `You are the eyes of another AI that cannot see pictures. It asks you a question about the picture. Answer only from what you see, precisely and completely (copy text exactly, in quotes). If the picture does not show it, say so. Plain text, no greeting.`;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** The cache key: the picture(s), the model and the whole prompt. */
export async function visionKey(pictures: readonly Picture[], model: string, prompt: string): Promise<string> {
  const pics = await Promise.all(pictures.map((p) => sha256(p.base64)));
  return sha256(`${pics.join(",")}\n${model}\n${prompt}`);
}
const cacheKey = (k: string) => `vision.cache:${k}`;
export async function cached<T>(store: SqlStore, key: string): Promise<T | undefined> {
  const v = await store.getAppSetting<{ value: T }>(cacheKey(key));
  return v && typeof v === "object" && "value" in v ? v.value : undefined;
}
export async function keep<T>(store: SqlStore, key: string, value: T): Promise<void> {
  await store.setAppSetting(cacheKey(key), { value, at: Date.now() });
}

/** One call to the vision model with the pictures; returns the text it wrote. Usage is added to `usage`. */
export async function askVision(o: {
  core: HomunculusCore; conn: ConnectionConfig; system: string; text: string; pictures: readonly Picture[];
  usage: VisionUsage; signal?: AbortSignal; maxTokens?: number;
}): Promise<string> {
  const t0 = Date.now();
  const rich: RichTurn[] = [
    { role: "system", content: o.system },
    { role: "user", content: [{ type: "text", text: o.text }, ...o.pictures.map((p) => ({ type: "image" as const, mime: p.mime, base64: p.base64 }))] },
  ];
  const conn: ConnectionConfig = o.maxTokens ? { ...o.conn, params: { ...o.conn.params, maxTokens: o.maxTokens } } : o.conn;
  let text = "";
  try {
    for await (const chunk of o.core.connections.stream(conn, [], o.signal, { rich })) {
      if (typeof chunk === "string") text += chunk;
      else if ("usage" in chunk) { o.usage.tokensIn += chunk.usage.tokensIn ?? 0; o.usage.tokensOut += chunk.usage.tokensOut ?? 0; o.usage.cost += chunk.usage.cost ?? 0; }
    }
  } finally {
    o.usage.calls++;
    o.usage.ms += Date.now() - t0;
  }
  if (!text.trim()) throw new Error(`${o.conn.model || "The vision model"} answered with nothing (it may have refused the picture).`);
  return text.trim();
}

/** Describes one picture for the main model (cached). `question` = the user's message that came with it. */
export async function describePicture(o: { core: HomunculusCore; store: SqlStore; conn: ConnectionConfig; picture: Picture; question?: string; usage: VisionUsage; signal?: AbortSignal }): Promise<string> {
  const text = o.question?.trim() ? `The user's message that came with this picture:\n"""${o.question.trim()}"""\n\nDescribe the picture.` : "Describe the picture.";
  const key = await visionKey([o.picture], o.conn.model, `${DESCRIBE_PROMPT}\n${text}`);
  const hit = await cached<string>(o.store, key);
  if (hit) { o.usage.cached++; return hit; }
  const out = await askVision({ core: o.core, conn: o.conn, system: DESCRIBE_PROMPT, text, pictures: [o.picture], usage: o.usage, signal: o.signal, maxTokens: 1500 });
  await keep(o.store, key, out);
  return out;
}

/** A question about one picture, answered by the vision model (cached). */
export async function lookAtPicture(o: { core: HomunculusCore; store: SqlStore; conn: ConnectionConfig; picture: Picture; question: string; usage: VisionUsage; signal?: AbortSignal }): Promise<string> {
  const key = await visionKey([o.picture], o.conn.model, `${LOOK_PROMPT}\n${o.question.trim()}`);
  const hit = await cached<string>(o.store, key);
  if (hit) { o.usage.cached++; return hit; }
  const out = await askVision({ core: o.core, conn: o.conn, system: LOOK_PROMPT, text: o.question.trim(), pictures: [o.picture], usage: o.usage, signal: o.signal, maxTokens: 1200 });
  await keep(o.store, key, out);
  return out;
}

// ------------------------------------------------------------------ for the main model

export const LOOK_SPEC: ToolSpec = {
  name: "look_at_image",
  description: "Ask the vision model a question about a picture in this chat (you can't see pictures yourself). Use it when the description you have doesn't answer what you need: be precise (\"what does the button under the title say?\", \"what colour is her hair ribbon?\").",
  parameters: { type: "object", properties: { image: { type: "string", description: "The image id from [Image id: …]." }, question: { type: "string" } }, required: ["image", "question"] },
};

export const READ_COMIC_SPEC: ToolSpec = {
  name: "read_comic",
  description: "Read the comic pages attached in this chat with the vision model: the cast with stable ids (A, B…) and looks, what happens panel by panel, and every line word for word, by page. Call about(\"comic\") first. Cached: calling it again (other pages, after a question) is free.",
  parameters: { type: "object", properties: {
    order: { type: "string", enum: ["manga", "western"], description: "manga = right to left; western = left to right. Ask the user when you don't know: scanlated manga and doujinshi keep manga order even in English." },
    images: { type: "array", items: { type: "string" }, description: "Image ids in reading order (optional; default: the comic pages of the chat by file name, else every picture)." },
    skip: { type: "array", items: { type: "string" }, description: "Image ids to leave out (cover, credits, ads)." },
    from: { type: "integer", minimum: 1, description: "Show from this page (optional)." },
    to: { type: "integer", minimum: 1, description: "Show up to this page (optional)." },
  }, required: ["order"] },
};

export const VISION_RULES = `## Pictures
You can't see pictures. A vision model looks at each picture the user attaches and writes what it sees; it reaches you as [Image id: name — what the vision model saw: …]. Treat that as the picture the user showed you: don't say you can't see it. When you need a detail the description doesn't give, call look_at_image with the image id and a precise question; never guess what a picture shows.`;
export const NO_VISION_RULES = `## Pictures
You can't see pictures and no vision model is set, so attached pictures reach you only by name. Say so plainly once, and tell the user they can pick a model that describes pictures in Settings → Assistant → For Pictures, Use.`;

const SHORT = 900;
/** The line that replaces a picture in a request to a main model that can't see it. */
export function pictureText(a: { id: string; name: string; description?: { text: string; edited?: boolean }; comicPage?: boolean }, route: "describe" | "drop", recent: boolean): string {
  if (a.comicPage) return `[Comic page ${a.id}: ${a.name} — read the pages with read_comic]`;
  if (route === "drop") return `[Image ${a.id}: ${a.name} — not sent: this model can't see pictures]`;
  if (!a.description) return `[Image ${a.id}: ${a.name} — not described yet (the vision model failed); look_at_image can try again]`;
  const t = a.description.text.trim();
  const body = recent || t.length <= SHORT ? t : `${t.slice(0, SHORT)} …(shortened; look_at_image for details)`;
  return `[Image ${a.id}: ${a.name} — what the vision model saw${a.description.edited ? " (corrected by the user)" : ""}:\n${body}\n]`;
}
