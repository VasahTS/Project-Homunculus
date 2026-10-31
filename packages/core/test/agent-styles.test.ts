// Agent styles: one agent, several versions (Daniel, 30/10). Author: CLAUDE, 2026-10-30.
import { AgentConfig } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { agentStyle, withStyle } from "../src/index.ts";

const a = AgentConfig.parse({
  id: "feed", name: "Group Chat", triggers: [{ on: "manual" }], output: "note",
  prompt: "Posts by {{style}} Keep it short.",
  styles: [{ id: "a", name: "Classmates", text: "classmates." }, { id: "b", name: "Redditors", text: "redditors." }], styleId: "a",
});

describe("agent styles", () => {
  it("uses the setup's pick, else the default, else the first", () => {
    expect(agentStyle(a)?.name).toBe("Classmates");
    expect(agentStyle(a, { agentOverrides: { feed: { styleId: "b" } } })?.name).toBe("Redditors");
    expect(agentStyle({ ...a, styleId: "gone" })?.name).toBe("Classmates");
  });
  it("writes the style into {{style}}, or at the end, and leaves agents without styles alone", () => {
    expect(withStyle(a, { agentOverrides: { feed: { styleId: "b" } } }).prompt).toBe("Posts by redditors. Keep it short.");
    expect(withStyle({ ...a, prompt: "Posts." }).prompt).toBe("Posts.\n\nStyle: classmates.");
    const plain = { ...a, styles: undefined };
    expect(withStyle(plain)).toBe(plain);
  });
});
