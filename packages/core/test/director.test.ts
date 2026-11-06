// Tests for the Director (D-092): notes by weight in the story's prompt, counted per reply/swipe, kept when expired;
// the Director's own call sees the story's prompt as data and proposes notes. Author: CLAUDE, 2026-11-06.
import { describe, expect, it } from "vitest";
import {
  cleanProfile, countNotes, DEFAULT_DIRECTOR, directorNotesText, directorState, noteStatus, parseProposals, saveDirectorProfiles,
  saveDirectorState, splitProposals, type DirectorNote,
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

  it("each reply counts once; an expired note stays, with the replies it went with", () => {
    let notes = [note({ id: "a", text: "x", lasts: 2 }), note({ id: "b", text: "y" })];
    notes = countNotes(notes, "r1");
    notes = countNotes(notes, "r1"); // the same reply never counts twice
    notes = countNotes(notes, "r2");
    notes = countNotes(notes, "r3");
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

  it("the story's AI gets active notes after the chat, and every reply and swipe uses them once", async () => {
    const w = await world(() => "She lowers the bow.");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await saveDirectorState(w.store, session.id, { profileId: "", chat: [], notes: [note({ id: "n1", text: "Lyra stays guarded.", lasts: 2 })] });
    const { userMessage, reply } = await w.chat.send(session.id, firstMessage!.id, "Hello.", connection);
    const record = await w.store.getGenerationRecord(reply.id);
    const parts = record!.prompt;
    expect(parts.find((p) => p.source === "agent:director")?.content).toContain("- Lyra stays guarded.");
    expect(parts.at(-1)?.source).toBe("agent:director"); // depth 0 = after the last message
    const swipe = await w.chat.generate(session.id, userMessage.id, connection);
    const s = await directorState(w.store, session.id);
    expect(s.notes[0]).toMatchObject({ sent: [reply.id, swipe.id] });
    expect(noteStatus(s.notes[0]!)).toBe("expired");
    // expired: the next reply goes without it
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
