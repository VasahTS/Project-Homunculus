// Homunculus 2 — module: an offline test AI. Author: CLAUDE, 2026-10-23; agent answers 2026-10-27.
// Lets anyone try the app (and the click tests run) without an API key.
// It does not understand anything; it just streams a short scripted reply.
// Agents (trackers…) get a made-up answer in the shape their prompt asks for.
import type { HomunculusModule, RichTurn, StreamChunk } from "@homunculus/core";

/**
 * The Assistant (D-062) with the offline AI: a tiny script so the screen can be tried and clicked through without a key.
 * "tracker" → guide + create a tracker; "kit" → create a Kit with the added characters; "describe"/"improve" → a change
 * to the first added character; "search the web for …" → web_search (D-067); anything else → a short answer. After a tool result it just says it is done.
 */
async function* offlineAssistant(turns: RichTurn[]): AsyncGenerator<StreamChunk> {
  const last = turns.at(-1)!;
  const text = (t: RichTurn) => (typeof t.content === "string" ? t.content : t.content.map((p) => (p.type === "text" ? p.text : "")).join(" "));
  await new Promise((r) => setTimeout(r, 120));
  const call = (name: string, args: unknown) => ({ toolCalls: [{ id: `off_${Date.now()}`, name, arguments: JSON.stringify(args) }] });
  // D-115: the comic flow, scripted (read → What I Understood → questions → one card + persona)
  if (last.role === "tool" && typeof last.content === "string" && /^Read \d+ (comic )?pages?/.test(last.content)) {
    yield "Here is what I understood — correct anything that's off.";
    yield call("show_understanding", OFFLINE_UNDERSTANDING); return;
  }
  if (last.role === "tool") { yield "Done (offline test AI) — have a look at the card below."; return; }
  const said = text(last);
  const comic = /· \d+ pages? · (manga|western) order/.exec(said);
  if (comic) { yield call("read_comic", { order: comic[1] }); return; }
  if (/^Looks right/.test(said)) {
    yield call("ask", { questions: [
      { question: "Who is {{user}} in this story?", options: [{ label: "Mei", detail: "you play the art student", cast: "A" }, { label: "Ren", detail: "you play the senior", cast: "B" }, { label: "Someone New", detail: "you join as a new person" }, { label: "Only Watching", detail: "the card plays everyone" }] },
      { question: "What should I make?", options: [{ label: "The Card", detail: "one card with the main cast" }, { label: "The Card and a Story", detail: "plus a Kit to start stories from" }] },
      { question: "Where does it start?", options: [{ label: "The Beginning", detail: "the door jams (p. 2)" }, { label: "After the End", detail: "what happens next" }] },
    ] }); return;
  }
  if (/Who is \{\{user\}\}/.test(said)) {
    yield "Here is the card. You play Ren, so he isn't in it; I made him a persona suggestion.";
    yield { toolCalls: [
      { id: `off_c${Date.now()}`, name: "create", arguments: JSON.stringify({ kind: "character", data: { name: "After Hours", description: "## Synopsis\nMei, an art student, is locked in the studio on a rainy night with {{user}}.\n\n## Characters\n### Mei\nShort brown hair, paint-stained apron. Shy; ironic when nervous.\n\n## Minor Characters\nKaho, Mei's roommate.\n\n## Setting\nA university art studio at night.", firstMessages: ["*The handle doesn't move.* \"It's jammed. Of course it's jammed.\""], exampleMessages: "<START>\n{{char}}: \"It's not like I ran away. I just… left fast.\"" }, sources: { description: "p. 1–8", firstMessages: "p. 2", exampleMessages: "p. 3" } }) },
      { id: `off_p${Date.now()}`, name: "create", arguments: JSON.stringify({ kind: "persona", data: { name: "Ren", description: "Tall, glasses, long coat; calm and direct." }, sources: { description: "p. 2, 5" } }) },
    ] };
    return;
  }
  const ask = text(last);
  if (/DRAFT FIRST is on/.test(text(turns[0]!)) && /character/i.test(ask)) {
    const name = /colder|again|change/i.test(ask) ? "Kessa (colder)" : "Kessa";
    const draft = JSON.stringify({ name, description: "A mercenary who travels light and alone; a scar across her knuckles.", personality: "Cynical, loyal to coin.", firstMessages: ["*Kessa counts the coins twice.* \"You're short.\""], tags: ["mercenary", "fantasy"] }, null, 1);
    for (const piece of [`Here's a first draft — tell me what to change.\n\n`, "```homunculus-character\n", draft, "\n```\n\nWant her colder, or with a different first line?"]) { yield piece; await new Promise((r) => setTimeout(r, 40)); }
    return;
  }
  const added = [...ask.matchAll(/\[Added: (\w+):([^ \]]+) · ([^\]]+)\]/g)];
  const web = /search the web for (.+)/i.exec(ask);
  if (web) { yield call("web_search", { query: web[1]!.trim() }); return; }
  if (/tracker/i.test(ask)) { yield call("create", { kind: "tracker", data: { name: "World", help: "Time, weather and place", fields: [{ label: "Time of day", type: "text" }, { label: "Weather", type: "text" }, { label: "Place", type: "text" }] } }); return; }
  if (/\bkit\b/i.test(ask)) {
    const cast = added.filter((m) => m[1] === "character").map((m) => `character:${m[2]}`);
    yield call("create", { kind: "kit", data: { name: `${added.map((m) => m[3]).slice(0, 2).join(" & ") || "Offline"} Kit`, scenario: "Rain over the woods; two old acquaintances meet at the mill.", openings: ["*The mill wheel creaks.* \"Who's there?\""], cast } });
    return;
  }
  const char = added.find((m) => m[1] === "character");
  if (char && /folder|party/i.test(ask)) { yield call("move", { items: added.filter((m) => m[1] !== "chat").map((m) => `${m[1]}:${m[2]}`), folder: "RPG/Offline Party" }); return; }
  if (char && /version/i.test(ask)) { yield call("change", { id: `character:${char[2]}`, changes: { variants: { add: [{ label: "Modern AU", description: `${char[3]} runs a bookshop in the city.` }] } }, summary: "A modern version" }); return; }
  if (char && /describ|improve|better/i.test(ask)) { yield call("change", { id: `character:${char[2]}`, changes: { description: `${char[3]} has kept the northern woods for eleven winters.` }, summary: "A more concrete description" }); return; }
  yield "Offline test AI here: I can't really think, but try “make a world tracker”, or add characters and ask for a Kit.";
}

const OFFLINE_UNDERSTANDING = {
  title: "After Hours", synopsis: "Mei, an art student, gets locked in the studio on a rainy night with Ren, the senior she has avoided since the year-end party.",
  cast: [{ id: "A", name: "Mei", looks: "Short brown hair, paint-stained apron.", personality: "Shy; ironic when nervous.", line: "It's not like I ran away. I just… left fast.", pages: "p. 3" },
    { id: "B", name: "Ren", looks: "Tall, glasses, long coat.", personality: "Calm and direct.", line: "You left your sketchbook. I kept it.", pages: "p. 5" }],
  relationships: "Mei and Ren: awkward → honest → close (p. 6–8).", setting: "A university art studio at night, rain on the skylight.", scenes: "The door jams (p. 2) · the sketchbook (p. 5) · the confession (p. 7)",
  unsure: "The balloon in the last panel of page 6 has no tail; I gave it to Ren.",
};

/** The offline AI as a vision model (D-115): a made-up description, or a made-up reading of the comic pages it got. */
async function* offlineVision(turns: RichTurn[]): AsyncGenerator<StreamChunk> {
  const system = typeof turns[0]?.content === "string" ? turns[0].content : "";
  const user = turns.at(-1)!;
  const parts = Array.isArray(user.content) ? user.content : [];
  const words = parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  await new Promise((r) => setTimeout(r, 150));
  if (system.startsWith("You read comic pages")) {
    const m = /pages (\d+)–(\d+) of/.exec(words);
    const first = Number(m?.[1] ?? 1), last = Number(m?.[2] ?? 1);
    const pages = Array.from({ length: last - first + 1 }, (_, i) => ({ page: first + i, cast: ["A", "B"], panels: [{ action: `Panel on page ${first + i}.`, lines: [{ speaker: "A", kind: "speech", text: `Offline line ${first + i}.` }] }] }));
    yield JSON.stringify({ cast: [{ id: "A", name: "Mei", looks: "short brown hair", notes: "shy" }, { id: "B", name: "Ren", looks: "tall, glasses", notes: "calm" }], pages, summary: `Up to page ${last} (offline test AI).` });
    return;
  }
  yield `(Offline test AI) A picture. ${/It asks you a question/.test(system) ? "It can't really look, but says: nothing to see." : "Made-up description: a dark window with a grey Send button."}`;
}

let calls = 0; // varies the reply on every call, so swipes look different
let agentCalls = 0;

const lines = [
  "*She tilts her head, studying you for a long moment.*",
  "*A crow calls somewhere beyond the mill.*",
  "*The lantern flickers between you.*",
];
const words = ["quiet", "restless", "curious", "guarded", "bright", "heavy"];

/** Fills an example answer with varied values of the same kind (numbers stay numbers). */
function vary(v: unknown, n: number): unknown {
  if (typeof v === "number") return Math.max(0, v + ((n * 7) % 5) - 2);
  if (typeof v === "string") return v === "…" ? words[n % words.length] : v;
  if (Array.isArray(v)) return v.map((x, i) => vary(x, n + i));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x], i) => [k, k === "qty" ? 1 + (n % 3) : vary(x, n + i)]));
  return v;
}

/** What the offline AI answers to an agent's call (its prompt ends with "Answer with ONLY …"). */
function agentAnswer(prompt: string): string {
  const n = agentCalls++;
  const example = /Example answer: (.+)$/m.exec(prompt)?.[1];
  if (example) {
    try { return JSON.stringify(vary(JSON.parse(example), n)); } catch { /* fall through */ }
  }
  if (/"entries": \[\{"title"/.test(prompt)) return JSON.stringify({ entries: [{ title: "Offline fact", keys: ["offline"], content: "Something the offline test AI noticed." }] });
  if (/"posts": \[/.test(prompt)) return JSON.stringify({ posts: [{ name: "kaito_2A", text: "did that just happen??" }, { name: "mio.sage", text: "offline test AI says hi" }] });
  if (/"messages": \[\{"from"/.test(prompt)) return JSON.stringify({ messages: [{ from: "Ayaka", time: "21:04", text: "Where did you go?" }] });
  if (/ONLY a JSON object/.test(prompt)) return "{}";
  if (/ONLY a JSON array/.test(prompt)) return '["Look around", "Say nothing"]';
  if (/"pass"/.test(prompt)) return '{"pass": true, "reason": "Offline test AI does not judge."}';
  return `(Offline test AI: no real answer, call ${n + 1}.)`;
}

export const offlineAiModule: HomunculusModule = {
  manifest: { id: "offline-ai", version: "0.0.2" },
  register(api) {
    api.registerProvider({
      id: "offline-test",
      name: "Offline test AI (no key needed)",
      help: "A fake AI for trying the app. It only repeats a scripted line and what you said. Agents get made-up values.",
      async listModels() {
        return [{ id: "offline", name: "Offline test AI", description: "Repeats scripted lines. For trying the app." }];
      },
      // smart memory recall (D-083): a made-up decision model that likes summaries sharing words with the exchange
      async decide(req) {
        const words = new Set((req.state.toLowerCase().match(/[a-z]{4,}/g) ?? []));
        return { answers: Object.fromEntries(req.questions.map((q, i) => {
          const body = q.instructions.split("\n\n").slice(1).join(" ").toLowerCase();
          const shared = (body.match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length;
          return [q.id, Math.min(0.95, 0.2 + shared * 0.15 + (i === 0 ? 0.35 : 0))];
        })) };
      },
      async *stream(req) {
        if (req.tools?.length && req.rich) { yield* offlineAssistant(req.rich); return; }
        if (req.rich?.some((t) => Array.isArray(t.content) && t.content.some((p) => p.type === "image"))) { yield* offlineVision(req.rich); return; }
        const lastTurn = req.messages.at(-1)?.content ?? "";
        if (/Answer with ONLY/.test(lastTurn)) {
          // a little delay, like a real agent call (click tests can make it longer to watch the "updating" state)
          const delay = (globalThis as { __h2AgentDelayMs?: number }).__h2AgentDelayMs ?? 300;
          await new Promise((r) => setTimeout(r, delay));
          if (req.signal?.aborted) return;
          yield agentAnswer(lastTurn);
          return;
        }
        // memory chapters (D-054)
        // CODEX: Recognize the transcript envelope so offline chapters work with an edited writer prompt.
        if (lastTurn.startsWith("Messages to summarize:\n\n") || lastTurn.startsWith("The chapter before (for continuity, do not repeat it):\n")) {
          yield "Title: Offline chapter\n\nThe offline test AI summarized these messages."; return;
        }
        // the Director (D-092): talks about the story and proposes a note in the shape its setup asks for
        if ((req.messages[0]?.content ?? "").includes("<story_prompt>")) {
          const weight = /^- (\w[\w-]*) \(/m.exec(req.messages[0]!.content)?.[1] ?? "whisper";
          const asked = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
          const answer = /author.?s note/i.test(asked) && req.messages[0]!.content.includes('kind="authorsNote"')
            ? "Offline test AI here: this would change the Author's Note of this chat.\n\n<change kind=\"authorsNote\">Keep the night quiet and slow.</change>"
            : `Offline test AI here: I read the story's prompt, but I can't really judge it. Here is a note you could try:\n\n<note weight="${weight}" lasts="3">Keep the scene calm for a while.</note>`;
          for (const word of answer.split(/(?<= )/)) { if (req.signal?.aborted) return; await new Promise((r) => setTimeout(r, 15)); yield word; }
          return;
        }
        // memory layers (D-083)
        if (/Merge consecutive chapter summaries/.test(req.messages[0]?.content ?? "")) { yield "Title: Offline merged chapters\n\nThe offline test AI merged these summaries."; return; }
        const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const reply = `${lines[calls++ % lines.length]} "You said: ${last.slice(0, 80)}"`;
        // like a thinking model: a little "reasoning" first, which the app keeps apart from the reply
        yield { reasoning: "(Offline test AI: pretending to think about what you said.)" };
        for (const word of reply.split(/(?<= )/)) {
          if (req.signal?.aborted) return;
          // click tests can slow it down to leave the chat while a reply is still being written
          await new Promise((r) => setTimeout(r, (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs ?? 25));
          yield word;
        }
      },
    });
  },
};
