// Homunculus 2 — module: an offline test AI. Author: CLAUDE, 2026-10-23; agent answers 2026-10-27.
// Lets anyone try the app (and the click tests run) without an API key.
// It does not understand anything; it just streams a short scripted reply.
// Agents (trackers…) get a made-up answer in the shape their prompt asks for.
import type { HomunculusModule } from "@homunculus/core";

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
  return "(Offline test AI: no real answer.)";
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
      async *stream(req) {
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
        if (/summarize part of an ongoing roleplay/.test(req.messages[0]?.content ?? "")) { yield "Title: Offline chapter\n\nThe offline test AI summarized these messages."; return; }
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
