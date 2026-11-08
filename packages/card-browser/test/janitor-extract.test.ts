// Extraction of hidden JanitorAI cards (D-099): prompt separation, and a whole run against a fake JanitorAI that checks the
// account is put back exactly. CLAUDE, 2026-11-08.
import { beforeEach, expect, it } from "vitest";
import { cardSource, NO_FILTERS, pauses, resetJanitor } from "../src/index.ts";
import { extractCard, extractExample, extractName, extractScenario, mergeLore, restoreMacros, separate, stripJanitorCredit } from "../src/sources/janitor-prompt.ts";
import { loreMessages, parseLoreAnswer } from "../src/sources/janitor-extract.ts";
import type { CardItem, JanitorBridge, SiteResponse, SiteTransport } from "../src/types.ts";

const SYSTEM = [
  "[System note: write well.]",
  "<Mira's Persona>Mira is a lighthouse keeper. Mira talks to Daniel about storms.\ncreated by kit 2026© on janitorai.com</Mira's Persona>",
  "<UserPersona>{{user}} is a sailor.</UserPersona>",
  "<Scenario>A storm hits the coast.</Scenario>",
  "<Example Dialogs>Mira: Hold the rope!</Example Dialogs>",
  "The Old Tower: built in 1800 by Mira's grandfather.",
  "",
  "Public fact that the creator shared openly with everyone.",
  "",
  "Harbor: boats wait here when Mira lights the lamp.",
].join("\n");
const payload = (system: string) => ({ messages: [{ role: "system", content: system }, { role: "assistant", content: "Mira waves." }, { role: "user", content: "." }] });

beforeEach(() => { pauses.clear(); resetJanitor(); });

it("separates card, scenario, examples and closed lore; public lore and the card never leak into the lore", () => {
  const p = payload(SYSTEM);
  expect(extractName(p)).toBe("Mira");
  expect(extractCard(p)).toContain("lighthouse keeper");
  expect(extractScenario(p)).toBe("A storm hits the coast.");
  expect(extractExample(p)).toBe("Mira: Hold the rope!");
  const lore = separate(p, extractCard(p), ["Public fact that the creator shared openly with everyone."]);
  expect(lore).toBe("The Old Tower: built in 1800 by Mira's grandfather.\n\nHarbor: boats wait here when Mira lights the lamp.");
  expect(mergeLore([lore, "Harbor: boats wait here when Mira lights the lamp.\n\nNew: a gull."])).toBe(lore + "\n\nNew: a gull.");
});

it("puts {{char}} / {{user}} back (longest name first, 3+ letters) and drops JanitorAI's credit", () => {
  expect(restoreMacros("Mira Lee and Mira greet Daniel. Al stays.", ["Mira", "Mira Lee", "Al"], "Daniel")).toBe("{{char}} and {{char}} greet {{user}}. Al stays.");
  expect(stripJanitorCredit("Line one.\ncreated by kit 2026© on janitorai.com\nLine two.")).toBe("Line one.\nLine two.");
  expect(stripJanitorCredit("No credit here.")).toBe("No credit here.");
});

it("reads the model's lore answer through fences and prose; junk gives nothing", () => {
  const rows = parseLoreAnswer('Sure!\n```json\n{"entries":[{"comment":"Tower","key":["tower","old tower"],"content":"Built in 1800."},{"key":[],"content":""}]}\n```');
  expect(rows).toEqual([{ comment: "Tower", keys: ["tower", "old tower"], secondary_keys: [], content: "Built in 1800.", order: 100 }]);
  expect(parseLoreAnswer("no json")).toEqual([]);
  const m = loreMessages("lore", "card", "");
  expect(m[0]!.role).toBe("system"); expect(m[1]!.content).toContain("CHARACTER CARD (context only):\ncard");
});

// ------------------------------------------------------------------ a whole run
const ID = "aaaaaaaa-0000-4000-8000-000000000002";
const meta = { id: ID, name: "Mira", creator_name: "kit", description: "<p>A keeper.</p>", avatar: "a.webp", tagIds: [53], showdefinition: false, personality: "", scenario: "", first_message: "Mira waves.",
  scripts: [{ type: "lorebook", id: "bbbbbbbb-0000-4000-8000-000000000001", title: "Public", is_public: true }] };
function fakeJanitor(over: { allowProxy?: false; noPersona?: boolean; refuse?: number; nameless?: boolean; signedOut?: boolean } = {}) {
  const account = { settings: { selected_proxy_config_id: 7, source: "proxy", generation_settings: { context_length: 8000, temperature: 1 } } as Record<string, unknown>, configs: [{ id: 7, client_id: "mine" }] as Record<string, unknown>[], personas: [] as Record<string, unknown>[], chats: [] as string[], profile: { name: over.nameless ? "" : "Daniel", profile: "about" } };
  const calls: string[] = [];
  let alpha: unknown = null, sends = 0, page = "";
  const ok = (v: unknown) => ({ status: 200, text: JSON.stringify(v) });
  const bridge: JanitorBridge = {
    async call(method, path, body) {
      calls.push(`${method} ${path}`);
      const b = body as Record<string, unknown>;
      if (path === "/hampter/api-settings" && method === "GET") return ok({ settings: account.settings, proxy_configs: account.configs });
      if (path === "/hampter/api-settings" && method === "PATCH") { Object.assign(account.settings, b); return ok({}); }
      if (path === "/hampter/api-settings/proxy-configs" && method === "POST") { account.configs.push({ id: 99, client_id: b.client_id }); return ok({}); }
      if (path.startsWith("/hampter/api-settings/proxy-configs/") && method === "DELETE") { account.configs = account.configs.filter((c) => String(c.id) !== path.split("/").pop()); return ok({}); }
      if (path === "/hampter/profiles/mine" && method === "GET") return ok(account.profile);
      if (path === "/hampter/profiles/mine" && method === "PATCH") { Object.assign(account.profile, b); return ok({}); }
      if (path === "/hampter/personas" && method === "GET") return ok(account.personas);
      if (path === "/hampter/personas" && method === "POST") { if (over.noPersona) return { status: 500, text: "{}" }; account.personas.push({ id: "p1", name: b.name }); return ok({ id: "p1" }); }
      if (path.startsWith("/hampter/personas/") && method === "DELETE") { account.personas = account.personas.filter((p) => p.id !== path.split("/").pop()); return ok({}); }
      if (path === "/hampter/chats" && method === "POST") { account.chats.push("c-1"); return ok({ id: "c-1" }); }
      if (path === "/hampter/chats/c-1" && method === "GET") return ok({ character: { first_message: "Mira waves.", first_messages: ["Mira waves.", "Mira frowns at {{user}}."] } });
      if (path === "/hampter/chats/c-1" && method === "DELETE") { account.chats = []; return ok({}); }
      return { status: 404, text: "{}" };
    },
    async page(op, text) {
      calls.push(`page ${op}`);
      if (op === "open-chat") page = String(text);
      if (op === "composer") return ok({ ready: page !== "" });
      if (op === "reset") alpha = null;
      if (op === "send") {
        sends++;
        const user = String(account.settings.selected_proxy_config_id) === "99" ? (account.personas.length ? "{{user}}" : account.profile.name) : "";
        const sys = sends === 1 ? SYSTEM.split("\n").slice(0, 6).join("\n").replace(/Daniel/g, user) : SYSTEM.replace(/Daniel/g, user);
        alpha = over.refuse ? null : payload(sys);
        return ok({ ok: true, cleared: true });
      }
      if (op === "alpha") return ok({ payload: alpha, log: over.refuse ? [{ status: over.refuse, matched: false, body: '{"message":"Proxies are forbidden for this character"}' }] : [] });
      return ok({});
    },
  };
  const png = new Uint8Array([1]);
  const t: SiteTransport = {
    janitor: bridge,
    async janitorAccount() { return { username: over.signedOut ? null : "daniel" }; },
    async request(r): Promise<SiteResponse> {
      calls.push(`GET ${r.url}`);
      const base = { status: 200, finalUrl: r.url, contentType: "application/json", cfMitigated: false };
      if (r.expect === "image") return { ...base, bytes: png, mime: "image/webp" };
      if (r.url.endsWith(`/hampter/characters/${ID}`)) return { ...base, text: JSON.stringify(over.allowProxy === false ? { ...meta, allow_proxy: false } : meta) };
      if (r.url.includes("/hampter/script/")) return { ...base, text: JSON.stringify({ script: JSON.stringify([{ key: ["public"], content: "Public fact that the creator shared openly with everyone." }]) }) };
      return { ...base, status: 404, text: "{}" };
    },
  };
  return { t, account, calls };
}
const item: CardItem = { source: "janitor", id: ID, name: "Mira", creator: "kit", tagline: "", tags: [], thumb: "", nsfw: false, url: "", stats: {} };
const opts = { sleep: async () => {}, limits: { composer: 50, card: 50, lore: 50 } };
const extract = (t: SiteTransport, more = {}) => cardSource("janitor").extract!(item, t, { ...opts, ...more });

it("a whole run: hidden card, greetings, public + rebuilt closed lore; the account ends exactly as it started", async () => {
  const { t, account, calls } = fakeJanitor();
  const before = JSON.stringify(account);
  const seen: unknown[] = [];
  const r = await extract(t, { complete: async (m: unknown) => { seen.push(m); return '{"entries":[{"comment":"Tower","key":["tower"],"content":"The Old Tower: built in 1800."}]}'; } });
  expect(JSON.stringify(account)).toBe(before);
  const data = (r.file.kind === "json" ? r.file.card.data : {}) as Record<string, unknown>;
  expect(data.name).toBe("Mira");
  expect(data.description).toBe("{{char}} is a lighthouse keeper. {{char}} talks to {{user}} about storms.");
  expect(data.scenario).toBe("A storm hits the coast.");
  expect(data.mes_example).toBe("{{char}}: Hold the rope!");
  expect(data.first_mes).toBe("{{char}} waves.");
  expect(data.alternate_greetings).toEqual(["{{char}} frowns at {{user}}."]);
  const book = data.character_book as { entries: Record<string, unknown>[] };
  expect(book.entries.map((e) => e.comment)).toEqual(["Public · Entry 1", "Closed lore · Tower"]);
  expect(book.entries[1]).toMatchObject({ keys: ["tower"], enabled: true });
  expect(r.closedEntries).toBe(1); expect(r.loreNote).toBe("");
  // the closed lore sent to the model has neither the card nor the public entry
  expect(JSON.stringify(seen)).toContain("Harbor: boats wait here");
  expect(JSON.stringify(seen)).not.toContain("Public fact that");
  // nothing written outside the extraction's own temporary things
  const writes = calls.filter((c) => /^(POST|PATCH|DELETE) /.test(c));
  expect(writes).toEqual(["POST /hampter/api-settings/proxy-configs", "PATCH /hampter/api-settings", "PATCH /hampter/api-settings", "PATCH /hampter/api-settings", "POST /hampter/personas",
    "POST /hampter/chats", "DELETE /hampter/chats/c-1", "DELETE /hampter/personas/p1", "PATCH /hampter/api-settings", "DELETE /hampter/api-settings/proxy-configs/99"]);
  expect(calls).toContain("page hide");
});

it("without an AI connection the closed lore comes in as switched-off text entries, with a note", async () => {
  const r = await extract(fakeJanitor().t);
  const book = ((r.file.kind === "json" ? r.file.card.data : {}) as Record<string, unknown>).character_book as { entries: Record<string, unknown>[] };
  expect(book.entries.slice(1).every((e) => e.enabled === false && (e.keys as string[]).length === 0)).toBe(true);
  expect(r.loreNote).toMatch(/No AI connection/);
});

it("no {{user}} persona: the account's name is put back as {{user}}; an empty profile name is seeded and restored", async () => {
  const a = fakeJanitor({ noPersona: true });
  const data = ((await extract(a.t)).file as unknown as { card: { data: Record<string, unknown> } }).card.data;
  expect(data.description).toContain("{{user}}"); expect(data.description).not.toContain("Daniel");
  const b = fakeJanitor({ noPersona: true, nameless: true });
  await extract(b.t);
  expect(b.account.profile).toEqual({ name: "", profile: "about" });
});

it("refusals: signed out, proxies forbidden by the creator, and /generateAlpha errors — the account is still put back", async () => {
  await expect(extract(fakeJanitor({ signedOut: true }).t)).rejects.toThrow(/Sign In/);
  const locked = fakeJanitor({ allowProxy: false });
  await expect(extract(locked.t)).rejects.toThrow(/JanitorAI.s own model/);
  expect(locked.calls.some((c) => c.startsWith("POST"))).toBe(false);
  const refused = fakeJanitor({ refuse: 403 });
  const before = JSON.stringify(refused.account);
  await expect(extract(refused.t)).rejects.toThrow(/Proxies are forbidden/);
  expect(JSON.stringify(refused.account)).toBe(before);
});

it("details: a hidden card offers Extract unless the creator forbids proxies", async () => {
  const s = cardSource("janitor");
  expect((await s.details(item, fakeJanitor().t)).canExtract).toBe(true);
  const d = await s.details(item, fakeJanitor({ allowProxy: false }).t);
  expect(d.canExtract).toBeUndefined(); expect(d.hidden).toMatch(/can't be extracted/);
  void NO_FILTERS;
});
