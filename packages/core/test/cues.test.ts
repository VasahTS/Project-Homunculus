// Tests for cues (D-113): the pure engine, a whole turn (values pinned to messages, swipes, branches, the prompt, the
// receipt, Preview Prompt), converting "No AI call" agents, and speed. Author: CLAUDE, 2026-11-10.
import { AgentConfig, Cue, type CueInput } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import {
  countWords, cueFromLoreEntries, cueFromTextAgent, cueNamespace, cueTextsForPrompt, periodOf, runCue, seededSequence, wordPattern,
  type CueMessage, type CueRunInput,
} from "../src/index.ts";
import { LoreEntry } from "@homunculus/schemas";
import { connection, isAgentCall, world } from "./helpers.ts";

const msgs = (...texts: string[]): CueMessage[] => texts.map((text, i) => ({ from: i % 2 === 0 ? "user" : "ai", text }));
const run = (cue: CueInput, over: Partial<CueRunInput> = {}) => runCue({
  cue: Cue.parse(cue), history: [], previous: undefined, state: {}, type: "normal", role: "player",
  random: seededSequence("test"), now: new Date(2026, 10, 10, 15).getTime(), ...over,
});

/** A small "Scene direction" (the shape of yhul's script, D-113 plan §4). */
const sceneDirection: CueInput = {
  id: "scene", name: "Scene direction", namespace: "cue-scene",
  signals: [
    { key: "heat", kind: "words", words: ["kiss", "pins", "wall", "hand on her waist"], last: 4, ignoreNegated: true },
    { key: "after", kind: "words", words: ["afterglow", "catch her breath"], last: 2 },
  ],
  values: [
    { key: "scene", initial: "none", otherwise: "reset", rules: [
      { when: [{ path: "signal.heat", op: "atLeast", value: "3" }], do: "set", value: "active" },
      { when: [{ path: "signal.heat", op: "atLeast", value: "1" }], do: "set", value: "approaching" },
    ] },
    { key: "turns", initial: 0, otherwise: "reset", rules: [{ when: [{ path: "value.scene", op: "equals", value: "active" }], do: "add", value: 1 }] },
  ],
  groups: [{
    key: "directions", pick: "random", noRepeat: 1, wrap: "[Direction: {{text}}]",
    placement: { position: "atDepth", depth: 1, role: "system" },
    items: [
      { id: "a1", title: "Clothing", text: "Notice clothing.", when: [{ path: "value.scene", op: "equals", value: "approaching" }] },
      { id: "b1", title: "Room", text: "The room, turn {{value.turns}}.", when: [{ path: "value.scene", op: "equals", value: "active" }, { path: "value.turns", op: "atMost", value: "2" }] },
      { id: "b2", title: "Sound", text: "Sounds.", when: [{ path: "value.scene", op: "equals", value: "active" }] },
      { id: "c1", title: "Aftermath", text: "Aftermath.", when: [{ path: "signal.after", op: "atLeast", value: "1" }] },
    ],
  }],
};

describe("cue engine: words", () => {
  it("counts whole words and phrases, case and curly quotes do not matter, negations can be ignored", () => {
    const o = { wholeWords: true, caseSensitive: false };
    expect(countWords(["He KISSED her. A kiss, then another kiss."], ["kiss"], o)).toEqual({ total: 2, hits: { kiss: 2 } });
    expect(countWords(["his hand  on her waist"], ["hand on her waist"], o).total).toBe(1);
    expect(countWords(["handle it"], ["hand"], o).total).toBe(0);
    expect(countWords(["handle it"], ["hand"], { ...o, wholeWords: false }).total).toBe(1);
    expect(countWords(["She didn’t kiss him. Then a kiss."], ["kiss"], { ...o, ignoreNegated: true }).total).toBe(1);
    expect(countWords(["Ele não beijou. Um beijo."], ["beijou", "beijo"], { ...o, ignoreNegated: true }).hits).toEqual({ beijo: 1 });
    expect(countWords(["Kiss"], ["kiss"], { ...o, caseSensitive: true }).total).toBe(0);
    // a /regex/ works as in lorebook keys; one that is not a valid regex is read as plain text, as there
    expect(countWords(["she hugs and kisses"], ["/hug|kiss/"], { ...o, wholeWords: false }).total).toBe(2);
    expect(countWords(["a /(odd/ key"], ["/(odd/"], { ...o, wholeWords: false }).total).toBe(1);
    expect(wordPattern("   ", o)).toBeNull();
  });

  it("reads only the last N messages, from whoever was asked", () => {
    const r = run({ id: "w", name: "W", namespace: "cue-w", signals: [
      { key: "mine", kind: "words", words: ["kiss"], last: 3, from: "user" },
      { key: "all", kind: "words", words: ["kiss"], last: 3 },
    ] }, { history: msgs("kiss", "kiss", "kiss", "kiss") }); // user, ai, user, ai → last 3 = ai, user, ai
    expect(r.report.signals).toEqual([
      { key: "mine", value: 1, detail: "kiss" },
      { key: "all", value: 3, detail: "kiss ×3" },
    ]);
  });
});

describe("cue engine: values and texts", () => {
  it("first rule that matches; keep or reset; add counts; texts see the new values and macros", () => {
    const quiet = run(sceneDirection, { history: msgs("hello", "hi") });
    expect(quiet.values).toMatchObject({ scene: "none", turns: 0 });
    expect(quiet.texts).toEqual([]);
    expect(quiet.report.groups[0]!.reason).toBe("nothing matched");

    const hot = run(sceneDirection, { history: msgs("a kiss", "she pins him to the wall"), previous: { scene: "approaching", turns: 0 } });
    expect(hot.report.signals[0]).toEqual({ key: "heat", value: 3, detail: "kiss, pins, wall" });
    expect(hot.values).toMatchObject({ scene: "active", turns: 1 });
    expect(hot.report.values[0]).toEqual({ key: "scene", before: "approaching", after: "active", why: "heat ≥ 3 → set active" });
    expect(hot.report.values[1]).toEqual({ key: "turns", before: 0, after: 1, why: "scene is active → add 1" });
    expect(hot.texts).toHaveLength(1);
    expect(hot.texts[0]!.text).toMatch(/^\[Direction: (The room, turn 1\.|Sounds\.)\]$/);
    expect(hot.texts[0]!.placement).toMatchObject({ position: "atDepth", depth: 1 });

    // three turns later the "turns ≤ 2" text is out; reset when the scene ends
    const later = run(sceneDirection, { history: msgs("kiss pins wall"), previous: { scene: "active", turns: 2 } });
    expect(later.values.turns).toBe(3);
    expect(later.report.groups[0]!.picked).toEqual([{ id: "b2", title: "Sound" }]);
    const over = run(sceneDirection, { history: msgs("bye"), previous: { scene: "active", turns: 3 } });
    expect(over.values).toMatchObject({ scene: "none", turns: 0 });
  });

  it("pick: first, rotate, all; don't repeat; one-of; weights", () => {
    const items = [{ id: "x", text: "X" }, { id: "y", text: "Y" }, { id: "z", text: "Z" }];
    const cue = (pick: "first" | "rotate" | "all" | "random", extra = {}): CueInput => ({ id: "p", name: "P", namespace: "cue-p", groups: [{ key: "g", pick, items, ...extra }] });
    expect(run(cue("first")).texts[0]!.text).toBe("X");
    expect(run(cue("all")).texts[0]!.text).toBe("X\nY\nZ");
    // rotate goes on from the last one used, and wraps around
    expect(run(cue("rotate"), { previous: { _last: { g: ["x"] } } }).texts[0]!.text).toBe("Y");
    expect(run(cue("rotate"), { previous: { _last: { g: ["z"] } } }).texts[0]!.text).toBe("X");
    // don't repeat the last 2: only z is left
    for (let i = 0; i < 10; i++) expect(run(cue("random", { noRepeat: 2 }), { random: seededSequence(`r${i}`), previous: { _last: { g: ["x", "y"] } } }).texts[0]!.text).toBe("Z");
    // remembers what it used
    expect(run(cue("first")).values._last).toEqual({ g: ["x"] });
    // weight 0 never wins while others can
    const weighted: CueInput = { id: "w", name: "W", namespace: "cue-w", groups: [{ key: "g", items: [{ id: "a", text: "A", weight: 0 }, { id: "b", text: "B" }] }] };
    for (let i = 0; i < 10; i++) expect(run(weighted, { random: seededSequence(`w${i}`) }).texts[0]!.text).toBe("B");
    // one of a shared name: a single one of a and b, c always
    const shared: CueInput = { id: "o", name: "O", namespace: "cue-o", groups: [{ key: "g", pick: "all", items: [
      { id: "a", text: "A", oneOf: "mood" }, { id: "b", text: "B", oneOf: "mood" }, { id: "c", text: "C" }] }] };
    const text = run(shared).texts[0]!.text.split("\n");
    expect(text).toHaveLength(2);
    expect(text).toContain("C");
    // as in a lorebook group: the winner rolls its chance; when it loses, the other one does not take its place
    const rolled: CueInput = { id: "r", name: "R", namespace: "cue-r", groups: [{ key: "g", pick: "all", items: [
      { id: "a", text: "A", oneOf: "mood" }, { id: "b", text: "B", oneOf: "mood", chance: 50 }] }] };
    expect(run(rolled, { random: () => 0.99 }).report.groups[0]!.reason).toBe("chance said no");
    expect(run(rolled, { random: () => 0.1 }).texts[0]!.text).toBe("A");
  });

  it("a text's own trigger: words, also needs, but not, chance and messages — no lorebook", () => {
    const cue: CueInput = { id: "t", name: "T", namespace: "cue-t", groups: [{ key: "rules", pick: "all", items: [
      { id: "oral", text: "Oral rule.", words: { keys: ["lick"], also: ["kiss"], not: ["stop"], last: 2 } },
      { id: "late", text: "Late rule.", minMessages: 4 },
      { id: "never", text: "Never.", chance: 0 },
    ] }] };
    expect(run(cue, { history: msgs("lick", "a kiss") }).texts[0]!.text).toBe("Oral rule.");
    expect(run(cue, { history: msgs("lick", "nothing") }).texts).toEqual([]);
    expect(run(cue, { history: msgs("lick", "a kiss, stop") }).texts).toEqual([]);
    expect(run(cue, { history: msgs("a", "b", "lick", "kiss") }).texts[0]!.text).toBe("Oral rule.\nLate rule.");
  });

  it("group chance and cooldown; when it runs; clock and generation signals", () => {
    const cue: CueInput = { id: "e", name: "Event", namespace: "cue-e", groups: [{ key: "g", cooldown: 2, items: [{ id: "a", text: "Event!" }] }] };
    const first = run(cue, { history: msgs("a", "b") });
    expect(first.values._cooldown).toEqual({ g: 2 });
    expect(run(cue, { history: msgs("a", "b", "c"), previous: first.values }).report.groups[0]!.reason).toBe("cooldown: 2 more messages");
    expect(run(cue, { history: msgs("a", "b", "c", "d", "e"), previous: first.values }).texts).toHaveLength(1);
    expect(run({ ...cue, groups: [{ key: "g", chance: 0, items: [{ id: "a", text: "x" }] }] }).report.groups[0]!.reason).toBe("chance (0%) said no");

    expect(run({ ...cue, when: { generationTypes: ["normal"] } }, { type: "impersonate" }).report.skipped).toBe("not on impersonate");
    expect(run({ ...cue, when: { minMessages: 3 } }, { history: msgs("a") }).report.skipped).toBe("starts after 3 messages");

    const sig = run({ id: "s", name: "S", namespace: "cue-s", signals: [
      { key: "part", kind: "clock" }, { key: "hour", kind: "clock", read: "hour" }, { key: "gen", kind: "generation" },
      { key: "loc", kind: "tracker", path: "world.location" }, { key: "n", kind: "messages", count: "user" },
    ] }, { type: "swipe", state: { world: { location: "Tavern" } }, history: msgs("a", "b", "c") });
    expect(Object.fromEntries(sig.report.signals.map((s) => [s.key, s.value]))).toEqual({ part: "afternoon", hour: 15, gen: "swipe", loc: "Tavern", n: 2 });
    expect([periodOf(6), periodOf(13), periodOf(19), periodOf(23), periodOf(2)]).toEqual(["morning", "afternoon", "evening", "night", "night"]);
  });

  it("texts go where they are told: the lorebook's places, the chat, the agents' prompts", () => {
    const out = cueTextsForPrompt([
      { cueId: "c", groupKey: "g", text: "B", placement: { position: "before", depth: 4, role: "system", outletName: "" } },
      { cueId: "c", groupKey: "g", text: "D", placement: { position: "atDepth", depth: 2, role: "user", outletName: "" } },
      { cueId: "c", groupKey: "g", text: "M", placement: { position: "agentPrompts", depth: 4, role: "system", outletName: "" } },
      { cueId: "c", groupKey: "g", text: "O", placement: { position: "outlet", depth: 4, role: "system", outletName: "mood" } },
    ], { before: ["lore"], after: [] });
    expect(out.worldInfo?.before).toEqual(["lore"]);
    expect(out.worldInfo?.cuesBefore).toEqual([{ cueId: "c", text: "B" }]);
    expect(out.worldInfo?.outlets).toEqual({ mood: ["O"] });
    expect(out.injections).toEqual([
      { agentId: "cue:c", text: "D", position: "depth", depth: 2, role: "user" },
      { agentId: "cue:c", text: "M", position: "marker", depth: 4, role: "system" },
    ]);
    expect(cueTextsForPrompt([], undefined)).toEqual({ worldInfo: undefined, injections: [] });
    expect(cueNamespace("Scène Direction!", ["cue-scene-direction"])).toBe("cue-scene-direction-2");
  });

  it("is fast: 10 cues × 500 words × 10 messages well under a few ms each", () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`);
    const history = msgs(...Array.from({ length: 10 }, (_, i) => `Some text with word${i * 7} and a longer sentence to scan through, again and again. `.repeat(8)));
    const cue: CueInput = { id: "big", name: "Big", namespace: "cue-big", signals: [{ key: "n", kind: "words", words, last: 10 }],
      values: [{ key: "v", rules: [{ when: [{ path: "signal.n", op: "atLeast", value: "1" }], do: "add", value: 1 }] }],
      groups: [{ key: "g", items: [{ id: "a", text: "A" }] }] };
    run(cue, { history }); // warm up
    const started = performance.now();
    for (let i = 0; i < 10; i++) run(cue, { history });
    // generous for slow CI machines; locally it is a few ms in total
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("cues in a turn", () => {
  async function setUp(cue: CueInput) {
    const w = await world((m) => (isAgentCall(m) ? "{}" : "She answers."));
    await w.store.saveCue(cue);
    await w.store.setDefaultSetup({ cues: { mode: "add", add: [cue.id], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    return { w, session, first: firstMessage! };
  }

  it("values are pinned to the message answered: a swipe never counts twice, a branch has its own", async () => {
    const counter: CueInput = { id: "count", name: "Counter", namespace: "cue-count",
      values: [{ key: "turns", initial: 0, rules: [{ do: "add", value: 1 }] }],
      groups: [{ key: "g", items: [{ id: "a", text: "Turn {{value.turns}} for {{char}}." }] }] };
    const { w, session, first } = await setUp(counter);
    const one = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(await w.core.state.resolve(session.id, one.userMessage.id)).toMatchObject({ "cue-count": { turns: 1 } });
    await w.chat.generate(session.id, one.userMessage.id, connection); // a swipe
    await w.chat.generate(session.id, one.userMessage.id, connection); // another
    expect((await w.core.state.resolve(session.id, one.userMessage.id))["cue-count"]?.turns).toBe(1);
    const two = await w.chat.send(session.id, one.reply.id, "Again", connection);
    expect((await w.core.state.resolve(session.id, two.reply.id))["cue-count"]?.turns).toBe(2);
    // a different message from the first reply starts its own count
    const branch = await w.chat.send(session.id, one.reply.id, "Other way", connection);
    expect((await w.core.state.resolve(session.id, branch.userMessage.id))["cue-count"]?.turns).toBe(2);
    expect((await w.core.state.resolve(session.id, first.id))["cue-count"]).toBeUndefined();

    // the text reached the prompt (in the chat, 1 back) and the receipt says what happened
    const main = w.ai.prompts.at(-1)!;
    expect(main.some((t) => t.content.includes("Turn 2 for Lyra."))).toBe(true);
    const record = await w.store.getGenerationRecord(two.reply.id);
    expect(record?.prompt.find((p) => p.source === "agent:cue:count")?.content).toBe("Turn 2 for Lyra.");
    expect(record?.cues?.[0]).toMatchObject({ cueId: "count", values: [{ key: "turns", before: 1, after: 2 }], groups: [{ picked: [{ id: "a" }] }] });
  });

  it("same roll on a swipe by default; roll again when the cue says so", async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, text: `Event ${i}.` }));
    const stable: CueInput = { id: "ev", name: "Events", namespace: "cue-ev", groups: [{ key: "g", items }] };
    const { w, session, first } = await setUp(stable);
    const one = await w.chat.send(session.id, first.id, "Hi", connection);
    const picks = [(await w.store.getGenerationRecord(one.reply.id))!.cues![0]!.groups[0]!.picked[0]!.id];
    for (let i = 0; i < 3; i++) {
      const r = await w.chat.generate(session.id, one.userMessage.id, connection);
      picks.push((await w.store.getGenerationRecord(r.id))!.cues![0]!.groups[0]!.picked[0]!.id);
    }
    expect(new Set(picks).size).toBe(1);

    await w.store.saveCue({ ...stable, randomness: "perSwipe" });
    const again: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await w.chat.generate(session.id, one.userMessage.id, connection);
      again.push((await w.store.getGenerationRecord(r.id))!.cues![0]!.groups[0]!.picked[0]!.id);
    }
    expect(new Set(again).size).toBeGreaterThan(1);
  });

  it("agents and lorebook conditions see the cue's new values; Preview Prompt shows them without saving", async () => {
    const mood: CueInput = { id: "mood", name: "Mood", namespace: "cue-mood",
      signals: [{ key: "rain", kind: "words", words: ["rain"], last: 1 }],
      values: [{ key: "weather", initial: "dry", otherwise: "keep", rules: [{ when: [{ path: "signal.rain", op: "atLeast", value: "1" }], do: "set", value: "wet" }] }],
      groups: [{ key: "g", placement: { position: "after" }, items: [{ id: "w", text: "It is {{state.cue-mood.weather}}." }] }] };
    const { w, session, first } = await setUp(mood);
    await w.store.saveLorebook({ id: "book", name: "Book", entries: [{ id: "e", constant: true, content: "Puddles everywhere.", conditions: [{ path: "cue-mood.weather", op: "equals", value: "wet" }] }] });
    await w.store.setDefaultSetup({ cues: { mode: "add", add: ["mood"], remove: [] }, lorebooks: { mode: "add", add: ["book"], remove: [] } });
    const one = await w.chat.send(session.id, first.id, "The rain starts.", connection);
    const record = await w.store.getGenerationRecord(one.reply.id);
    const text = record!.prompt.map((p) => p.content).join("\n");
    expect(text).toContain("It is wet.");
    expect(text).toContain("Puddles everywhere.");
    // a cue's text after the character is its own part, not counted as the lorebook's
    expect(record!.prompt.find((p) => p.source === "agent:cue:mood")?.content).toBe("It is wet.");
    expect(record!.prompt.filter((p) => p.source.startsWith("lore:")).some((p) => p.content.includes("It is wet."))).toBe(false);

    // Preview Prompt on the next turn: the value is kept ("keep"), nothing new is saved at the reply
    const preview = await w.chat.turns.previewPrompt(session.id, one.reply.id, connection, { userText: "Sunny now." });
    expect(preview.parts.map((p) => p.content).join("\n")).toContain("It is wet.");
    expect(preview.cues?.[0]?.name).toBe("Mood");
    expect((await w.core.state.resolve(session.id, one.reply.id))["cue-mood"]?.weather).toBe("wet");
    expect(await w.store.getDelta(one.reply.id)).toBeUndefined();
  });

  it("a cue tied to a character switches on by itself where that character is; a chat can switch it off", async () => {
    const w = await world(() => "ok");
    await w.store.saveCue({ id: "lyra-cue", name: "Lyra's", namespace: "cue-lyra", characterIds: ["lyra"], groups: [{ key: "g", items: [{ id: "a", text: "Lyra's rule." }] }] });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const one = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    expect((await w.store.getGenerationRecord(one.reply.id))!.prompt.some((p) => p.content.includes("Lyra's rule."))).toBe(true);
    await w.store.saveSession({ ...(await w.store.getSession(session.id))!, setup: { cues: { mode: "add", add: [], remove: ["lyra-cue"] } } });
    const two = await w.chat.send(session.id, one.reply.id, "Again", connection);
    expect((await w.store.getGenerationRecord(two.reply.id))!.cues).toBeUndefined();
  });
});

describe("making cues", () => {
  it("a 'No AI call' agent becomes a cue that gives the same prompt", async () => {
    const agent = AgentConfig.parse({
      id: "rain", name: "Rain", runMode: "text", output: "inject", triggers: [{ on: "turn", phase: "before" }],
      prompt: "It keeps raining on {{char}}.", input: { messages: 0 },
      conditions: { keywords: ["umbrella"], minMessages: 1 }, injection: { position: "depth", depth: 2, role: "system" },
    });
    const { cue, notes } = cueFromTextAgent(agent, { id: "cue-rain", namespace: "cue-rain", text: agent.prompt });
    expect(notes).toEqual([]);
    expect(cue).toMatchObject({ source: { kind: "agent", from: "rain" }, when: { minMessages: 1 }, groups: [{ placement: { position: "atDepth", depth: 2 } }] });

    async function promptWith(setUpIt: (w: Awaited<ReturnType<typeof world>>) => Promise<void>, text: string) {
      const w = await world(() => "ok");
      await setUpIt(w);
      const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
      const r = await w.chat.send(session.id, firstMessage!.id, text, connection);
      return (await w.store.getGenerationRecord(r.reply.id))!.prompt.map((p) => ({ role: p.role, content: p.content }));
    }
    const asAgent = (w: Awaited<ReturnType<typeof world>>) => w.store.saveAgentConfig(agent).then(() => w.store.setDefaultSetup({ agents: { mode: "add", add: ["rain"], remove: [] } }));
    const asCue = (w: Awaited<ReturnType<typeof world>>) => w.store.saveCue(cue).then(() => w.store.setDefaultSetup({ cues: { mode: "add", add: ["cue-rain"], remove: [] } }));
    for (const text of ["Take the umbrella.", "No rain gear today."]) {
      expect(await promptWith(asCue, text)).toEqual(await promptWith(asAgent, text));
    }
    expect((await promptWith(asCue, "Take the umbrella.")).some((p) => p.content === "It keeps raining on Lyra.")).toBe(true);
  });

  it("writing-rule lorebook entries become one cue (a group of all that match)", () => {
    const entries = [
      LoreEntry.parse({ id: "1", title: "Plausibility", constant: true, content: "Keep it physical.", order: 1 }),
      LoreEntry.parse({ id: "2", title: "Sexting", keys: ["sext", "texting"], content: "Texting rules.", probability: 70, delay: 3, order: 2 }),
      LoreEntry.parse({ id: "3", title: "Oral", keys: ["lick"], secondaryKeys: ["stop"], logic: "notAny", content: "Oral rules.", group: "acts", order: 3 }),
    ];
    const { cue } = cueFromLoreEntries("Writing rules", entries, { id: "wr", namespace: "cue-wr" });
    expect(cue.groups[0]).toMatchObject({ pick: "all", placement: { position: "before" } });
    expect(cue.groups[0]!.items.map((t) => [t.id, t.words?.keys ?? [], t.words?.not ?? [], t.chance, t.minMessages, t.oneOf])).toEqual([
      ["1", [], [], 100, 0, ""], ["2", ["sext", "texting"], [], 70, 3, ""], ["3", ["lick"], ["stop"], 100, 0, "acts"],
    ]);
    const r = run(cue, { history: msgs("lick it") });
    expect(r.texts[0]!.text).toBe("Keep it physical.\nOral rules.");
  });
});
