// D-143: the Assistant looks items up only when the user names or asks for them, or the task needs one — never to
// explore the request's topic in the library (Daniel: it searched "dungeon"/"masmorra" on its own). Author: CLAUDE, 2026-11-17.
import { describe, expect, it } from "vitest";
import { CORE_RULES, BUILTIN_ASSISTANTS } from "./guides.ts";
import { TOOL_SPECS } from "./tools.ts";
import { systemParts } from "./engine.ts";

describe("library lookups (D-143)", () => {
  it("the rules say when to look items up and forbid topic searches", () => {
    expect(CORE_RULES).toContain("The library is the user's own material, not a source of ideas");
    expect(CORE_RULES).toContain("Never search the library by the topic of the request");
    expect(CORE_RULES).toContain("ask in one line");
    const find = TOOL_SPECS.find((t) => t.name === "find")!;
    expect(find.description).toContain("never to look for material on the request's topic");
    expect(find.description).not.toContain("Use a query whenever you know a name or topic");
  });
  it("the library line and the built-in assistants don't invite exploring", () => {
    const b = BUILTIN_ASSISTANTS[0]!;
    const parts = systemParts({ ...b, preset: "" } as unknown as Parameters<typeof systemParts>[0], undefined, "272 items");
    expect(parts.library).toContain("never to explore a topic");
    for (const a of BUILTIN_ASSISTANTS) expect(a.instructions).not.toMatch(/read what exists and avoid/);
  });
});

describe("built-in assistants follow their newer instructions (D-143)", () => {
  it("a saved, never-edited Loremaster gets the new text; an edited one is kept", async () => {
    const { default: initSqlJs } = await import("sql.js");
    const { SqlJsDriver, SqlStore, coreMigrations, migrate } = await import("@homunculus/core");
    const { loadSettings, saveSettings } = await import("./engine.ts");
    const { OLD_BUILTIN_INSTRUCTIONS } = await import("./guides.ts");
    const SQL = await initSqlJs();
    const driver = new SqlJsDriver(new SQL.Database());
    await migrate(driver, coreMigrations);
    const store = new SqlStore(driver);
    const s = await loadSettings(store);
    const old = OLD_BUILTIN_INSTRUCTIONS.loremaster![0]!;
    await saveSettings(store, { ...s, assistants: s.assistants.map((a) => a.id === "loremaster" ? { ...a, instructions: old } : a.id === "story-architect" ? { ...a, instructions: "Mine." } : a) });
    const after = await loadSettings(store);
    expect(after.assistants.find((a) => a.id === "loremaster")!.instructions).toBe(BUILTIN_ASSISTANTS.find((b) => b.id === "loremaster")!.instructions);
    expect(after.assistants.find((a) => a.id === "story-architect")!.instructions).toBe("Mine.");
  });
});
