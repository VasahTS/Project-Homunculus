// D-145: the Assistant answers the newest message; old questions stay answered (Daniel: it kept answering old ones).
// Author: CLAUDE, 2026-11-17.
import { describe, expect, it } from "vitest";
import { AssistantChat, AssistantSettings, type AssistantMessage } from "@homunculus/schemas";
import { toTurns } from "./engine.ts";
import { CORE_RULES, DRAFT_RULES } from "./guides.ts";

const msg = (id: string, role: "user" | "assistant", text: string, extra: Partial<AssistantMessage> = {}): AssistantMessage =>
  ({ id, role, text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1, ...extra });
const turnsOf = (messages: AssistantMessage[], extra: Partial<AssistantChat> = {}) =>
  toTurns(AssistantChat.parse({ id: "c", messages, createdAt: 1, updatedAt: 1, ...extra }), AssistantSettings.parse({}), "");

describe("answering the newest message (D-145)", () => {
  it("the rules say to answer the newest message and not repeat earlier answers or whole drafts", () => {
    expect(CORE_RULES).toContain("Answer the newest message");
    expect(CORE_RULES).toContain("never answer it again");
    expect(DRAFT_RULES).toContain("the block only");
  });
  it("a stopped or failed reply says the message was not answered and waits for the user", () => {
    const t = turnsOf([msg("u1", "user", "Old question"), msg("a1", "assistant", "", { error: "Stopped" }), msg("u2", "user", "New question")]);
    const old = t.find((x) => x.role === "assistant")!;
    expect(String(old.content)).toContain("stopped by the user — not answered; take it up only if the user asks again");
    const t2 = turnsOf([msg("u1", "user", "Old"), msg("a1", "assistant", "", { error: "Rate limited" }), msg("u2", "user", "New")]);
    expect(String(t2.find((x) => x.role === "assistant")!.content)).toContain("this reply failed: Rate limited — not answered");
  });
  it("a compacted summary is sent as background, not as requests", () => {
    const t = turnsOf([msg("u1", "user", "Make a dungeon"), msg("a1", "assistant", "Done."), msg("u2", "user", "Now a boss")],
      { compact: { uptoId: "a1", summary: "The user asked for a dungeon — made.", at: 1 } });
    expect(String(t[1]!.content)).toContain("everything in it was already handled; do not answer or redo any of it");
  });
});
