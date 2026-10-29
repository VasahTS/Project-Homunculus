// Tests for lorebooks inside a turn (slice 3, D-027). Author: CLAUDE, 2026-10-28.
// The activation rules themselves are compared with SillyTavern's own code in
// packages/st-lorebooks/test/st-parity.test.ts; these tests cover what is ours: which books apply,
// where entries land in the prompt, timers pinned to messages (swipes, branches), conditions, records.
import { describe, expect, it } from "vitest";
import { LoreEntry, LoreSettings, type LoreEntryInput } from "@homunculus/schemas";
import { DEFAULT_PRESET, loreConditionsHold, scanLorebooks } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const LoreSettingsDefault = LoreSettings.parse({});
const entry = (e: Partial<LoreEntryInput> & { id: string }): LoreEntryInput => ({ keys: [], content: "", ...e });

async function setup(entries: LoreEntryInput[], where: "session" | "character" | "default" = "session") {
  const w = await world(() => "ok");
  await w.store.saveLorebook({ id: "book", name: "Realm", entries });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  if (where === "session") await w.store.saveSession({ ...session, setup: { ...session.setup, lorebooks: { mode: "add", add: ["book"], remove: [] } } });
  if (where === "default") await w.store.setDefaultSetup({ lorebooks: { mode: "add", add: ["book"], remove: [] } });
  if (where === "character") await w.store.saveCharacter({ ...(await w.store.getCharacter("lyra"))!, lorebookIds: ["book"] });
  return { ...w, session, first: firstMessage! };
}

const lastPrompt = (w: Awaited<ReturnType<typeof world>>) => w.ai.prompts.at(-1)!;
const promptText = (w: Awaited<ReturnType<typeof world>>) => lastPrompt(w).map((t) => t.content).join("\n");

describe("lorebooks in a turn", () => {
  it("an entry whose keyword is in the chat goes into the prompt, and the reply's record says why", async () => {
    const w = await setup([entry({ id: "0", title: "Castle", keys: ["castle"], content: "The castle is haunted." }), entry({ id: "1", keys: ["moon"], content: "Two moons." })]);
    const { reply } = await w.chat.send(w.session.id, w.first.id, "We ride to the castle.", connection);
    expect(promptText(w)).toContain("The castle is haunted.");
    expect(promptText(w)).not.toContain("Two moons.");
    const rec = await w.store.getGenerationRecord(reply.id);
    expect(rec?.lore?.activated).toEqual([{ bookId: "book", bookName: "Realm", entryId: "0", title: "Castle", position: "before", reason: "keyword: castle", tokens: 7 }]);
    expect(rec?.prompt.find((p) => p.source === "lore:before")?.content).toBe("The castle is haunted.");
    expect(rec?.lore?.budget).toEqual({ limit: Math.round(0.25 * DEFAULT_PRESET.contextSize!), used: 7, overflowed: false });
  });

  it("reads the books of the session, of the Default setup and of the character", async () => {
    for (const where of ["default", "character"] as const) {
      const w = await setup([entry({ id: "0", keys: ["castle"], content: "Haunted." })], where);
      await w.chat.send(w.session.id, w.first.id, "the castle", connection);
      expect(promptText(w), where).toContain("Haunted.");
    }
  });

  it("a book in the Trash is not read", async () => {
    const w = await setup([entry({ id: "0", constant: true, content: "Always." })]);
    await w.store.moveToTrash("lorebook", "book");
    await w.chat.send(w.session.id, w.first.id, "hi", connection);
    expect(promptText(w)).not.toContain("Always.");
    expect(await w.store.listTrash()).toMatchObject([{ kind: "lorebook", id: "book", name: "Realm" }]);
  });

  it("entries at a depth go inside the chat; example entries join the example dialogue; outlets fill {{outlet::name}}", async () => {
    const w = await setup([
      entry({ id: "0", constant: true, content: "Whisper at the end.", position: "atDepth", depth: 0, role: "user" }),
      entry({ id: "1", constant: true, content: "{{char}}: Hm.", position: "emTop" }),
      entry({ id: "2", constant: true, content: "The secret is {{user}}.", position: "outlet", outletName: "secrets" }),
      entry({ id: "3", constant: true, content: "Near the note.", position: "anTop" }),
    ]);
    await w.store.savePreset({ ...DEFAULT_PRESET, id: "p", name: "P", blocks: DEFAULT_PRESET.blocks.map((b) => (b.id === "main" ? { ...b, content: "Main. {{outlet::secrets}}" } : b)), squashSystem: false });
    const s = (await w.store.getSession(w.session.id))!;
    await w.store.saveSession({ ...s, setup: { ...s.setup, presetId: "p" } });
    const { reply } = await w.chat.send(w.session.id, w.first.id, "hello", connection);
    const rec = (await w.store.getGenerationRecord(reply.id))!;
    const parts = rec.prompt;
    expect(parts[0]!.content).toBe("Main. The secret is User.");
    expect(parts.find((p) => p.source === "lore:examples")?.content).toBe("Example dialogue:\n<START>\nLyra: Hm.");
    // depth 0 = after the last message
    expect(parts.at(-1)).toMatchObject({ role: "user", content: "Whisper at the end.", source: "lore:depth" });
    // around the Author's Note: 4 messages before the end (only 2 messages here, so at the start of the chat)
    const history = parts.findIndex((p) => p.source === "history");
    expect(parts[history - 1]).toMatchObject({ role: "system", content: "Near the note.", source: "lore:note" });
  });

  it("entries placed before/after say so when the preset has no place for them", async () => {
    const w = await setup([entry({ id: "0", constant: true, content: "Lost." })]);
    await w.store.savePreset({ ...DEFAULT_PRESET, id: "p", name: "P", blocks: DEFAULT_PRESET.blocks.filter((b) => b.marker !== "worldInfoBefore") });
    const s = (await w.store.getSession(w.session.id))!;
    await w.store.saveSession({ ...s, setup: { ...s.setup, presetId: "p" } });
    const { reply } = await w.chat.send(w.session.id, w.first.id, "hello", connection);
    expect(promptText(w)).not.toContain("Lost.");
    expect((await w.store.getGenerationRecord(reply.id))?.promptNotes?.join(" ")).toMatch(/1 lorebook entry placed "before" were not sent/);
  });

  it("sticky and cooldown follow the path of messages: swipes and branches never see each other's timers", async () => {
    const w = await setup([
      entry({ id: "s", keys: ["dragon"], content: "STICKY", sticky: 3 }),
      entry({ id: "c", keys: ["storm"], content: "COOLDOWN", cooldown: 5 }),
    ]);
    const has = (t: string) => promptText(w).includes(t);
    // turn 1: both activate by keyword (chat = greeting + user = 2 messages)
    const t1 = await w.chat.send(w.session.id, w.first.id, "a dragon in the storm", connection);
    expect([has("STICKY"), has("COOLDOWN")]).toEqual([true, true]);
    expect((await w.store.getGenerationRecord(t1.reply.id))?.lore?.timers).toEqual({
      sticky: { "book.s": { start: 2, end: 5, protected: false } },
      cooldown: { "book.c": { start: 2, end: 7, protected: false } },
    });
    // turn 2: no keywords; the sticky one stays (4 < 5), the other is cooling down even when named
    const t2 = await w.chat.send(w.session.id, t1.reply.id, "the storm again", connection);
    expect([has("STICKY"), has("COOLDOWN")]).toEqual([true, false]);
    expect((await w.store.getGenerationRecord(t2.reply.id))?.lore?.activated.map((a) => a.reason)).toEqual(["sticky"]);
    // a swipe of turn 2 sees the same timers (those of turn 1's reply)
    await w.chat.generate(w.session.id, t2.userMessage.id, connection);
    expect([has("STICKY"), has("COOLDOWN")]).toEqual([true, false]);
    // turn 3: the sticky time is over (6 ≥ 5)
    await w.chat.send(w.session.id, t2.reply.id, "quiet", connection);
    expect(has("STICKY")).toBe(false);
    // a new version of turn 1's reply starts from no timers: "storm" activates again
    await w.chat.generate(w.session.id, t1.userMessage.id, connection);
    expect([has("STICKY"), has("COOLDOWN")]).toEqual([true, true]);
  });

  it("ours: an entry with conditions only goes in when the world state matches", async () => {
    const w = await setup([
      entry({ id: "0", constant: true, content: "TAVERN LORE", conditions: [{ path: "world.location", op: "equals", value: "the tavern" }] }),
      entry({ id: "1", keys: ["ale"], content: "ALE LORE", conditions: [{ path: "world.hour", op: "greater", value: "18" }] }),
    ]);
    await w.chat.send(w.session.id, w.first.id, "ale please", connection);
    expect(promptText(w)).not.toContain("TAVERN LORE");
    await w.store.setDelta(w.first.id, { world: { location: "The Tavern", hour: 20 } });
    const { reply } = await w.chat.send(w.session.id, w.first.id, "ale please", connection);
    expect(promptText(w)).toContain("TAVERN LORE");
    expect(promptText(w)).toContain("ALE LORE");
    expect((await w.store.getGenerationRecord(reply.id))?.lore?.activated.map((a) => a.entryId)).toEqual(["0", "1"]);
  });

  it("the prompt preview shows the entries without saving timers", async () => {
    const w = await setup([entry({ id: "0", keys: ["castle"], content: "Haunted.", sticky: 5 })]);
    const preview = await w.chat.turns.previewPrompt(w.session.id, w.first.id, connection, { userText: "the castle" });
    expect(preview.parts.some((p) => p.content.includes("Haunted."))).toBe(true);
    expect(preview.lore?.activated.map((a) => a.entryId)).toEqual(["0"]);
    // nothing was saved: the next real turn without the keyword has no sticky entry
    await w.chat.send(w.session.id, w.first.id, "hello", connection);
    expect(promptText(w)).not.toContain("Haunted.");
  });
});

describe("lorebooks of a session (Prompt tab) and Try it", () => {
  it("lists where each book comes from; a session can switch off any of them, even the character's", async () => {
    const w = await setup([entry({ id: "0", constant: true, content: "CHAR BOOK" })], "character");
    await w.store.saveLorebook({ id: "glob", name: "Global", entries: [entry({ id: "0", constant: true, content: "GLOBAL BOOK" })] });
    await w.store.setDefaultSetup({ lorebooks: { mode: "add", add: ["glob"], remove: [] } });
    expect(await w.chat.turns.lorebooksOf(w.session.id)).toEqual([
      { id: "glob", name: "Global", entries: 1, from: "default", on: true },
      { id: "book", name: "Realm", entries: 1, from: "character", on: true },
    ]);
    const s = (await w.store.getSession(w.session.id))!;
    await w.store.saveSession({ ...s, setup: { ...s.setup, lorebooks: { mode: "add", add: [], remove: ["book", "glob"] } } });
    expect((await w.chat.turns.lorebooksOf(w.session.id)).map((b) => b.on)).toEqual([false, false]);
    await w.chat.send(w.session.id, w.first.id, "hi", connection);
    expect(promptText(w)).not.toContain("CHAR BOOK");
    expect(promptText(w)).not.toContain("GLOBAL BOOK");
  });

  it("Try it runs an unsaved book on the session's newest messages, plus typed text, and saves nothing", async () => {
    const w = await setup([]);
    await w.chat.send(w.session.id, w.first.id, "We reach the castle.", connection);
    const book = { id: "draft", name: "Draft", description: "", source: { kind: "user" as const }, entries: [
      LoreEntry.parse({ id: "0", keys: ["castle"], content: "Haunted." }),
      LoreEntry.parse({ id: "1", keys: ["dragon"], content: "Fire." }),
      LoreEntry.parse({ id: "2", keys: ["Lyra"], content: "Ranger.", probability: 0 }),
    ] };
    const r = await w.chat.turns.tryLorebook(book, w.session.id, { text: "And a dragon!" });
    // "castle" is 3 messages back: outside the default 2 messages read
    expect(r.report.activated.map((a) => [a.entryId, a.reason])).toEqual([["1", "keyword: dragon"]]);
    expect(r.report.skipped).toEqual([{ bookId: "draft", entryId: "2", title: "", reason: "lost its 0% chance" }]);
    expect(r.messages.map((m) => [m.who, m.read])).toEqual([["User", false], ["Lyra", true], ["User", true]]);
    expect(await w.store.lorebooks.get("draft")).toBeUndefined();
  });
});

describe("lorebook conditions (ours)", () => {
  const e = (conditions: LoreEntryInput["conditions"], conditionLogic: "all" | "any" = "all") => LoreEntry.parse({ id: "x", conditions, conditionLogic });
  const state = { world: { location: "Old Mill", hp: 12, tags: ["night", "rain"] }, cast: { Lyra: { mood: "wary" } } };
  it("compares text without case, numbers as numbers, and reads nested paths", () => {
    expect(loreConditionsHold(e([{ path: "world.location", op: "equals", value: "old mill" }]), state)).toBe(true);
    expect(loreConditionsHold(e([{ path: "world.hp", op: "less", value: "20" }]), state)).toBe(true);
    expect(loreConditionsHold(e([{ path: "world.hp", op: "greater", value: "20" }]), state)).toBe(false);
    expect(loreConditionsHold(e([{ path: "world.tags", op: "contains", value: "rain" }]), state)).toBe(true);
    expect(loreConditionsHold(e([{ path: "cast.Lyra.mood", op: "notEquals", value: "angry" }]), state)).toBe(true);
    expect(loreConditionsHold(e([{ path: "world.weather", op: "missing" }]), state)).toBe(true);
    expect(loreConditionsHold(e([{ path: "world.weather", op: "exists" }]), state)).toBe(false);
  });
  it("all / any", () => {
    const two: LoreEntryInput["conditions"] = [{ path: "world.hp", op: "greater", value: "100" }, { path: "world.location", op: "contains", value: "mill" }];
    expect(loreConditionsHold(e(two, "all"), state)).toBe(false);
    expect(loreConditionsHold(e(two, "any"), state)).toBe(true);
  });
  it("a sticky entry also stops when its conditions stop holding", () => {
    const book = { id: "b", name: "B", description: "", source: { kind: "user" as const }, entries: [LoreEntry.parse({ id: "0", keys: ["x"], content: "C", sticky: 10, conditions: [{ path: "w.on", op: "equals", value: "yes" }] })] };
    const base = { books: [{ book, scope: "global" as const }], trigger: "normal" as const, settings: { ...LoreSettingsDefault } };
    const a = scanLorebooks({ ...base, chat: ["x"], chatLength: 1, state: { w: { on: "yes" } } });
    expect(a.before).toEqual(["C"]);
    const b = scanLorebooks({ ...base, chat: ["y", "x"], chatLength: 3, state: { w: { on: "no" } }, timers: a.report.timers });
    expect(b.before).toEqual([]);
    expect(b.report.skipped.map((s) => s.reason)).toEqual(["the world state doesn't match its conditions"]);
  });
});
