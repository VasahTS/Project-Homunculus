// Tests for the Director (D-092): notes by weight in the story's prompt, counted per reply/swipe, kept when expired;
// the Director's own call sees the story's prompt as data and proposes notes. Author: CLAUDE, 2026-11-06.
import { describe, expect, it } from "vitest";
import {
  cleanProfile, countNotes, DEFAULT_DIRECTOR, directorNotesText, directorState, noteLeft, noteStatus, parseChanges, parseProposals, saveDirectorProfiles,
  saveDirectorState, splitProposals, directorForSession, saveDirectorLinks, type DirectorNote,
} from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const note = (x: Partial<DirectorNote> & { id: string; text: string }): DirectorNote => ({ weightId: "whisper", lasts: null, sent: [], createdAt: 1, ...x });

describe("the Director", () => {
  it("groups active notes by weight, each weight with its own instruction; a note can carry its own", () => {
    const text = directorNotesText(DEFAULT_DIRECTOR, [
      note({ id: "a", text: "Lyra stays guarded.", weightId: "whisper", lasts: 3 }),
      note({ id: "b", text: "The floor gives way.", weightId: "turn", lasts: 1 }),
      note({ id: "c", text: "Mira hums.", weightId: "whisper", instruction: "Only once, in passing." }),
      note({ id: "d", text: "Old.", lasts: 1, sent: ["r1"] }),
      note({ id: "e", text: "Off.", off: true }),
    ]);
    expect(text.startsWith(DEFAULT_DIRECTOR.notesHeader)).toBe(true);
    expect(text).toContain("Whisper: Follow quietly.");
    expect(text).toContain("- Lyra stays guarded.");
    expect(text).toContain("Turn: This must happen in the next reply");
    expect(text).toContain("Whisper: Only once, in passing.\n- Mira hums.");
    expect(text).not.toContain("Old.");
    expect(text).not.toContain("Off.");
    expect(directorNotesText(DEFAULT_DIRECTOR, [note({ id: "x", text: "gone", off: true })])).toBe("");
  });

  it("weights are data: renamed, added or removed weights work, and broken data falls back", () => {
    const p = cleanProfile({ weights: [{ id: "lore", name: "Lore fact", instruction: "Treat as true.", lasts: null }], writerLine: "Mine." });
    expect(p.weights.map((w) => w.id)).toEqual(["lore"]);
    expect(p.defaultWeightId).toBe("lore");
    expect(p.writerLine).toBe("Mine.");
    expect(directorNotesText(p, [note({ id: "a", text: "The moon is green.", weightId: "lore" })])).toContain("Lore fact: Treat as true.\n- The moon is green.");
    expect(cleanProfile(null).weights.length).toBe(3);
  });

  it("each turn counts once; an expired note stays, with the replies it went with", () => {
    let notes = [note({ id: "a", text: "x", lasts: 2 }), note({ id: "b", text: "y" })];
    notes = countNotes(notes, "r1", "p1");
    notes = countNotes(notes, "r1", "p1"); // the same reply never counts twice
    notes = countNotes(notes, "r2", "p2");
    notes = countNotes(notes, "r3", "p3");
    expect(notes[0]).toMatchObject({ sent: ["r1", "r2"] });
    expect(noteStatus(notes[0]!)).toBe("expired");
    expect(notes[1]!.sent).toEqual(["r1", "r2", "r3"]);
  });

  it("reads proposed notes, with their weight and length", () => {
    const text = 'Try this.\n<note weight="turn" lasts="1">The bell rings.</note>\nOr softer:\n<note weight="Whisper" lasts="always">Mira is tired.</note>\n<note weight="???">Lyra waits.</note>';
    expect(parseProposals(text, DEFAULT_DIRECTOR)).toEqual([
      { index: 0, text: "The bell rings.", weightId: "turn", lasts: 1 },
      { index: 1, text: "Mira is tired.", weightId: "whisper", lasts: null },
      { index: 2, text: "Lyra waits.", weightId: "whisper", lasts: 3 },
    ]);
    expect(splitProposals(text, DEFAULT_DIRECTOR).map((p) => p.kind)).toEqual(["text", "note", "text", "note", "note"]);
  });

  it("the story's AI gets active notes after the chat; a swipe gets them again without spending a turn", async () => {
    const w = await world(() => "She lowers the bow.");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorState(w.store, session.id, { profileId: "", chat: [], notes: [note({ id: "n1", text: "Lyra stays guarded.", lasts: 2 })] });
    const { userMessage, reply } = await w.chat.send(session.id, firstMessage!.id, "Hello.", connection);
    const record = await w.store.getGenerationRecord(reply.id);
    const parts = record!.prompt;
    expect(parts.find((p) => p.source === "agent:director")?.content).toContain("- Lyra stays guarded.");
    expect(parts.at(-1)?.source).toBe("agent:director"); // depth 0 = after the last message
    const swipe = await w.chat.generate(session.id, userMessage.id, connection);
    let s = await directorState(w.store, session.id);
    expect(s.notes[0]).toMatchObject({ sent: [reply.id, swipe.id] });
    expect(noteLeft(s.notes[0]!)).toBe("1 of 2 left"); // one turn, two versions
    const next = await w.chat.send(session.id, swipe.id, "And?", connection); // the second turn
    s = await directorState(w.store, session.id);
    const at = new Set((await w.store.pathTo(next.reply.id)).map((m) => m.id));
    expect(noteStatus(s.notes[0]!, at)).toBe("expired");
    // spent, but a swipe of that last turn still gets it…
    const again = await w.chat.generate(session.id, next.userMessage.id, connection);
    expect((await w.store.getGenerationRecord(again.id))!.prompt.some((p) => p.source === "agent:director")).toBe(true);
    // …and a new turn goes without it
    const third = await w.chat.send(session.id, again.id, "Then?", connection);
    expect((await w.store.getGenerationRecord(third.reply.id))!.prompt.some((p) => p.source === "agent:director")).toBe(false);
  });

  it("with Swipes use up notes, every reply, swipe and regeneration spends one", async () => {
    const w = await world(() => "She lowers the bow.");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorProfiles(w.store, [cleanProfile({ id: "d", swipesSpend: true })]);
    await saveDirectorState(w.store, session.id, { profileId: "d", chat: [], notes: [note({ id: "n1", text: "Guarded.", lasts: 2 })] });
    const { userMessage } = await w.chat.send(session.id, firstMessage!.id, "Hello.", connection);
    await w.chat.generate(session.id, userMessage.id, connection);
    const third = await w.chat.generate(session.id, userMessage.id, connection);
    expect((await w.store.getGenerationRecord(third.id))!.prompt.some((p) => p.source === "agent:director")).toBe(false);
  });

  it("the Director sees the story's prompt as data, its job and writer line, and what it may not see is left out", async () => {
    const w = await world((m) => (m[0]!.content.includes("<story_prompt>") ? 'It drifts to a fight.\n<note weight="steer">They came to bargain.</note>' : "She lowers the bow."));
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorProfiles(w.store, [cleanProfile({ id: "d1", writerLine: "Never write prose.", sees: { characters: false } })]);
    const profile = cleanProfile({ id: "d1", writerLine: "Never write prose.", sees: { characters: false } });
    const answer = await w.chat.turns.askDirector({ sessionId: session.id, parentId: firstMessage!.id, profile, question: "Why the fight?", chat: [], connection });
    expect(answer).toContain("<note");
    const call = w.ai.prompts.at(-1)!;
    expect(call[0]!.content).toContain("Never write prose.");
    expect(call[0]!.content).toContain("Who's there?"); // the chat
    expect(call[0]!.content).not.toContain("A wary ranger."); // characters switched off
    expect(call.at(-1)).toEqual({ role: "user", content: "Why the fight?" });
    expect(w.ai.prompts.filter((p) => !p[0]!.content.includes("<story_prompt>")).length).toBe(0); // nothing went to the story
  });
});

describe("the Director changes the story, with Undo", () => {
  it("lists what it may change in its prompt, and nothing when every kind is Never", async () => {
    const w = await world(() => "ok");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const ask = cleanProfile({});
    const { system } = await w.chat.turns.directorPrompt(session.id, firstMessage!.id, ask, connection);
    expect(system).toContain('<change kind="authorsNote">');
    expect(system).toContain('<change kind="characterNote" character="NAME">');
    const never = cleanProfile({ may: { notes: "never", tracker: "never", lore: "never", authorsNote: "never", characterNote: "never", chapter: "never" } });
    const p2 = await w.chat.turns.directorPrompt(session.id, firstMessage!.id, never, connection);
    expect(p2.system).not.toContain("<change kind=");
    expect(p2.system).not.toContain("<note weight=");
  });

  it("parses changes and applies/undoes the Author's Note and a Character's Note", async () => {
    const w = await world(() => "ok");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const text = 'Fix:\n<change kind="authorsNote">Night, slow.</change>\n<change kind="characterNote" character="Lyra">Trusts no guide.</change>\n<change kind="bogus">x</change>';
    const changes = parseChanges(text);
    expect(changes.map((c) => c.kind)).toEqual(["authorsNote", "characterNote"]);
    expect(splitProposals(text, DEFAULT_DIRECTOR).map((p) => p.kind)).toEqual(["text", "change", "change", "text"]);
    const t = w.chat.turns;
    const a = await t.directorChange(session.id, null, firstMessage!.id, changes[0]!);
    expect(a).toMatchObject({ title: "Author's Note", before: "", after: "Night, slow." });
    const undoA = await a.apply();
    expect((await w.store.getSession(session.id))!.setup.authorsNote?.text).toBe("Night, slow.");
    const c = await (await t.directorChange(session.id, null, firstMessage!.id, changes[1]!)).apply();
    expect((await w.store.getCharacter("lyra"))!.characterNote?.text).toBe("Trusts no guide.");
    await t.undoDirectorChange(undoA);
    await t.undoDirectorChange(c);
    expect((await w.store.getSession(session.id))!.setup.authorsNote).toBeUndefined();
    expect((await w.store.getCharacter("lyra"))!.characterNote).toBeUndefined();
  });

  it("changes tracker values at the latest message, merging objects, and Undo puts them back", async () => {
    const w = await world((m) => (m.at(-1)?.content.includes("Answer with ONLY") ? '```json\n{"lyra": {"mood": "wary", "place": "gate"}}\n```' : "ok"));
    await w.store.saveAgentConfig({ id: "people", name: "People", triggers: [{ on: "turn", phase: "after" }], output: "state", state: { namespace: "people" } });
    await w.store.setDefaultSetup({ agents: { mode: "add", add: ["people"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    const [c] = parseChanges('<change kind="tracker" target="People">{"lyra": {"place": "cellar"}}</change>');
    const r = await w.chat.turns.directorChange(session.id, null, reply.id, c!);
    expect(JSON.parse(r.after)).toEqual({ lyra: { mood: "wary", place: "cellar" } });
    const undo = await r.apply();
    expect((await w.core.state.resolve(session.id, reply.id)).people).toEqual({ lyra: { mood: "wary", place: "cellar" } });
    await w.chat.turns.undoDirectorChange(undo);
    expect((await w.core.state.resolve(session.id, reply.id)).people).toEqual({ lyra: { mood: "wary", place: "gate" } });
  });

  it("checks replies against notes when asked to, and asks its own question every N replies", async () => {
    const w = await world((m) => {
      const last = m.at(-1)?.content ?? "";
      if (last.includes('"followed" or "ignored"')) return '{"n1": "ignored"}';
      if (m[0]!.content.includes("<story_prompt>")) return "All good.";
      return "She lowers the bow.";
    });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorProfiles(w.store, [cleanProfile({ id: "d", checkReplies: true, autoEvery: 2, autoQuestion: "Anything off?" })]);
    await saveDirectorState(w.store, session.id, { profileId: "d", chat: [], notes: [note({ id: "n1", text: "Lyra stays guarded." })] });
    const errors: string[] = [];
    w.core.events.on("core.error", (e) => { errors.push(e.message); });
    const { userMessage, reply } = await w.chat.send(session.id, firstMessage!.id, "Hello.", connection);
    let s = await directorState(w.store, session.id);
    expect(s.notes[0]!.checks).toEqual({ [reply.id]: "ignored" });
    expect(s.chat).toEqual([]);
    await w.chat.generate(session.id, userMessage.id, connection);
    s = await directorState(w.store, session.id);
    expect(errors).toEqual([]);
    expect(s.chat.map((t) => [t.role, t.text, t.auto])).toEqual([["user", "Anything off?", true], ["director", "All good.", true]]);
  });

  it("edits a lorebook entry (or adds one) and Undo restores the book", async () => {
    const w = await world(() => "ok");
    await w.store.saveLorebook({ id: "lb", name: "Thornwood", entries: [{ id: "e1", title: "The mill", keys: ["mill"], content: "Old." }] });
    await w.store.setDefaultSetup({ lorebooks: { mode: "add", add: ["lb"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const [edit, add] = parseChanges('<change kind="lore" book="Thornwood" entry="The mill">Burned down.</change><change kind="lore" book="Thornwood" entry="The bell" keys="bell, ring">It rings at night.</change>');
    const r = await w.chat.turns.directorChange(session.id, null, firstMessage!.id, edit!);
    expect(r).toMatchObject({ before: "Old.", after: "Burned down." });
    const u1 = await r.apply();
    const u2 = await (await w.chat.turns.directorChange(session.id, null, firstMessage!.id, add!)).apply();
    let book = (await w.store.lorebooksForUse(["lb"]))[0]!;
    expect(book.entries.map((e) => [e.title, e.content])).toEqual([["The mill", "Burned down."], ["The bell", "It rings at night."]]);
    expect(book.entries[1]!.keys).toEqual(["bell", "ring"]);
    await w.chat.turns.undoDirectorChange(u2);
    await w.chat.turns.undoDirectorChange(u1);
    book = (await w.store.lorebooksForUse(["lb"]))[0]!;
    expect(book.entries.map((e) => [e.title, e.content])).toEqual([["The mill", "Old."]]);
  });
});

describe("the Director follows branches and swipes", () => {
  it("counts a note along the path on screen, by turn: swipes of a turn share it, other branches do not", async () => {
    const w = await world(() => "She waits.");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorState(w.store, session.id, { profileId: "", chat: [], notes: [note({ id: "n", text: "Rain.", lasts: 3 })] });
    const a = await w.chat.send(session.id, firstMessage!.id, "One.", connection);   // uses 1 (path: first → One → reply)
    const a2 = await w.chat.generate(session.id, a.userMessage.id, connection);    // a swipe of the same turn: still 1 turn
    // another branch from the first message: its first reply sees no earlier uses
    const b = await w.chat.send(session.id, firstMessage!.id, "Other.", connection);
    const s = await directorState(w.store, session.id);
    const n = s.notes[0]!;
    expect(n.sent).toEqual([a.reply.id, a2.id, b.reply.id]);
    const along = async (id: string) => new Set((await w.store.pathTo(id)).map((m) => m.id));
    expect(noteStatus(n, await along(a2.id))).toBe("active");
    expect(noteLeft(n, await along(a2.id))).toBe("2 of 3 left");
    expect(noteLeft(n, await along(b.reply.id))).toBe("2 of 3 left");
  });

  it("a note made on one branch applies only on paths through where it was made", async () => {
    const w = await world(() => "ok");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const a = await w.chat.send(session.id, firstMessage!.id, "A.", connection);
    await saveDirectorState(w.store, session.id, { profileId: "", chat: [], notes: [note({ id: "n", text: "Only on A.", anchor: a.userMessage.id })] });
    const onA = await w.chat.send(session.id, a.reply.id, "More A.", connection);
    const onB = await w.chat.send(session.id, firstMessage!.id, "B.", connection);
    expect((await w.store.getGenerationRecord(onA.reply.id))!.prompt.some((p) => p.source === "agent:director")).toBe(true);
    expect((await w.store.getGenerationRecord(onB.reply.id))!.prompt.some((p) => p.source === "agent:director")).toBe(false);
    expect(noteStatus((await directorState(w.store, session.id)).notes[0]!, new Set((await w.store.pathTo(onB.reply.id)).map((m) => m.id)))).toBe("elsewhere");
  });

  it("a chat uses its own pick, else its story's Director, else the default", async () => {
    const w = await world(() => "ok");
    await saveDirectorProfiles(w.store, [cleanProfile({ id: "a", name: "A" }), cleanProfile({ id: "b", name: "B" }), cleanProfile({ id: "c", name: "C" })]);
    await saveDirectorLinks(w.store, { defaultId: "b", stories: { s1: "c" } });
    expect((await directorForSession(w.store, { id: "x", storyId: null })).name).toBe("B");
    expect((await directorForSession(w.store, { id: "x", storyId: "s1" })).name).toBe("C");
    await saveDirectorState(w.store, "x", { profileId: "a", chat: [], notes: [] });
    expect((await directorForSession(w.store, { id: "x", storyId: "s1" })).name).toBe("A");
  });
});
