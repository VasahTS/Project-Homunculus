// Tests for the chat service, with a fake AI. Author: CLAUDE, 2026-10-23.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChatService, HomunculusCore, WorldState, type ChatTurn, type HomunculusModule } from "../src/index.ts";
import { newTestStore } from "./helpers.ts";

const connection = { providerId: "fake", model: "fake-1" };

/** A fake AI that answers with a scripted list of replies and records what it was asked. */
function fakeAi(replies: string[], opts: { failAfter?: number } = {}) {
  const prompts: ChatTurn[][] = [];
  const module: HomunculusModule = {
    manifest: { id: "fake-ai", version: "1" },
    register(api) {
      api.registerProvider({
        id: "fake", name: "Fake", help: "",
        async *stream(req) {
          prompts.push(req.messages);
          const reply = replies.shift() ?? "…";
          const words = reply.split(/(?<= )/);
          for (let i = 0; i < words.length; i++) {
            if (opts.failAfter !== undefined && i === opts.failAfter) throw new Error("connection lost");
            yield words[i]!;
          }
        },
      });
    },
  };
  return { module, prompts };
}

async function setup(replies: string[], extraModules: HomunculusModule[] = [], opts = {}) {
  const { store } = await newTestStore();
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  const ai = fakeAi(replies, opts);
  await core.loadModules([ai.module, ...extraModules]);
  let n = 0;
  const chat = new ChatService(core, store, { newId: () => `id${++n}`, now: () => n });
  await store.saveCharacter({
    id: "lyra", name: "Lyra", description: "A wary ranger.", personality: "Dry humor.", scenario: "", firstMessages: ["*Lyra eyes you.* Who's there?"],
  });
  return { store, core, chat, ai };
}

describe("chat service", () => {
  it("creates a session with the character's greeting as first message", async () => {
    const { chat } = await setup([]);
    const { session, firstMessage } = await chat.createSession({ title: "Mill", characterIds: ["lyra"] });
    expect(session.cast[0]?.characterId).toBe("lyra");
    expect(firstMessage?.content).toBe("*Lyra eyes you.* Who's there?");
    expect(firstMessage?.speaker).toEqual({ kind: "character", characterId: "lyra" });
  });

  it("sends a message, streams the reply and saves both", async () => {
    const { chat, store, ai } = await setup(["A friend. Lower your bow."]);
    const { session, firstMessage } = await chat.createSession({ characterIds: ["lyra"] });
    const pieces: string[] = [];
    const { userMessage, reply } = await chat.send(session.id, firstMessage!.id, "A friend.", connection, { onToken: (p) => pieces.push(p) });

    expect(pieces.join("")).toBe("A friend. Lower your bow.");
    expect(pieces.length).toBeGreaterThan(1); // it really streamed
    expect((await store.pathTo(reply.id)).map((m) => m.content)).toEqual([
      "*Lyra eyes you.* Who's there?", "A friend.", "A friend. Lower your bow.",
    ]);
    expect(userMessage.parentId).toBe(firstMessage!.id);

    const prompt = ai.prompts[0]!;
    expect(prompt[0]?.role).toBe("system");
    expect(prompt[0]?.content).toContain("You are Lyra");
    expect(prompt[0]?.content).toContain("A wary ranger.");
    expect(prompt.slice(1).map((t) => t.role)).toEqual(["assistant", "user"]);
  });

  it("a swipe is a sibling reply; continuing from it ignores the other swipe", async () => {
    const { chat, store, ai } = await setup(["Reply A", "Reply B", "Continued"]);
    const { session, firstMessage } = await chat.createSession({ characterIds: ["lyra"] });
    const { userMessage, reply: a } = await chat.send(session.id, firstMessage!.id, "Hello", connection);
    const b = await chat.generate(session.id, userMessage.id, connection);

    expect((await store.childrenOf(session.id, userMessage.id)).map((m) => m.content)).toEqual(["Reply A", "Reply B"]);
    await chat.send(session.id, b.id, "Go on", connection);
    expect(ai.prompts[2]!.map((t) => t.content)).not.toContain("Reply A");
    expect(ai.prompts[2]!.map((t) => t.content)).toContain("Reply B");
    expect(a.id).not.toBe(b.id);
  });

  it("runs agents after the reply and keeps their state per swipe", async () => {
    let call = 0;
    const clock: HomunculusModule = {
      manifest: { id: "clock", version: "1" },
      register(api) {
        api.registerAgent({
          config: { id: "clock", name: "Clock", triggers: [{ on: "turn", phase: "after" }], output: "state", state: { namespace: "clock" } },
          output: z.object({ time: z.string() }),
          run: async () => ({ time: ++call === 1 ? "18:00" : "23:00" }),
        });
      },
    };
    const { chat, store } = await setup(["A", "B"], [clock]);
    await store.setDefaultSetup({ agents: { mode: "add", add: ["clock"], remove: [] } });
    const { session, firstMessage } = await chat.createSession({ characterIds: ["lyra"] });
    const { userMessage, reply: a } = await chat.send(session.id, firstMessage!.id, "Hi", connection);
    const b = await chat.generate(session.id, userMessage.id, connection);

    const ws = new WorldState(store, store);
    expect(await ws.resolve(session.id, a.id)).toEqual({ clock: { time: "18:00" } });
    expect(await ws.resolve(session.id, b.id)).toEqual({ clock: { time: "23:00" } });
  });

  it("if the connection drops mid-reply, keeps the partial text marked incomplete and reports it", async () => {
    const { chat, store, core } = await setup(["One two three four"], [], { failAfter: 2 });
    const failures: string[] = [];
    core.events.on("generation.failed", (e) => { failures.push(e.reason); });
    const { session, firstMessage } = await chat.createSession({ characterIds: ["lyra"] });
    const user = (await chat.send(session.id, firstMessage!.id, "Hi", connection).catch(() => null));
    expect(user).toBeNull();
    expect(failures).toEqual(["connection lost"]);

    const userMsg = (await store.childrenOf(session.id, firstMessage!.id))[0]!;
    const [partial] = await store.childrenOf(session.id, userMsg.id);
    expect(partial?.content).toBe("One two ");
    expect(partial?.meta).toMatchObject({ incomplete: true, error: "connection lost" });
  });

  it("applies {{char}}/{{user}} and uses card prompts (system, examples, post-history)", async () => {
    const { chat, store, ai } = await setup(["ok"]);
    await store.saveCharacter({
      id: "k", name: "Kael", description: "{{char}} distrusts {{user}}.", firstMessages: ["<BOT> nods at <USER>."],
      systemPrompt: "Write as {{char}} only.", exampleMessages: "<START>\n{{char}}: Hm.", postHistoryInstructions: "Keep it under 3 paragraphs.",
    });
    const { session, firstMessage } = await chat.createSession({ characterIds: ["k"] });
    expect(firstMessage?.content).toBe("<BOT> nods at <USER>."); // stored raw
    await chat.send(session.id, firstMessage!.id, "Hi {{char}}", connection);
    const p = ai.prompts[0]!;
    expect(p[0]!.content).toContain("Write as Kael only.");
    expect(p[0]!.content).toContain("Kael distrusts User.");
    expect(p[0]!.content).toContain("Kael: Hm.");
    expect(p[1]!.content).toBe("Kael nods at User.");
    expect(p[2]!.content).toBe("Hi Kael");
    expect(p.at(-1)).toEqual({ role: "system", content: "Keep it under 3 paragraphs." });
  });

  it("explains a missing provider", async () => {
    const { chat } = await setup([]);
    const { session } = await chat.createSession({ characterIds: ["lyra"] });
    await expect(chat.generate(session.id, null, { providerId: "nope", model: "x" })).rejects.toThrow(/No AI provider "nope"/);
  });
});
