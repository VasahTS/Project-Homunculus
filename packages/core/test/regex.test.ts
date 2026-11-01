// Tests for regex scripts (D-060). Author: CLAUDE, 2026-11-01.
// The engine itself is compared with SillyTavern's code in packages/st-regex/test/st-parity.test.ts;
// these check our wiring: saved replies and user messages, the prompt, display-only, lore, and the order.
import { RegexScript, type RegexScriptInput } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { applyRegexScripts, embeddedStRegexScripts, orderRegexScripts, regexError, regexKey } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const script = (s: Partial<RegexScriptInput>) => RegexScript.parse({ id: crypto.randomUUID(), ...s });
const macros = (t: string, char?: string) => t.replace(/\{\{char\}\}/g, char ?? "Lyra");

describe("regex engine", () => {
  it("replaces with groups, {{match}} and trim strings", () => {
    const s = script({ find: "/\\*(.+?)\\*/g", replace: "<i>$1</i> ({{match}})", trim: ["!"], targets: ["ai"] });
    expect(applyRegexScripts([s], "she *waves!* hi", { target: "ai", mode: "saved" }, { macros })).toBe("she <i>waves</i> (*waves*) hi");
  });

  it("runs only where it belongs: display-only, prompt-only, edits and depth", () => {
    const d = script({ find: "a", replace: "D", targets: ["ai"], displayOnly: true });
    const p = script({ find: "a", replace: "P", targets: ["ai"], promptOnly: true, maxDepth: 1 });
    const n = script({ find: "a", replace: "N", targets: ["ai"], runOnEdit: false });
    expect(applyRegexScripts([d, p, n], "a", { target: "ai", mode: "display" }, { macros })).toBe("D");
    expect(applyRegexScripts([d, p, n], "a", { target: "ai", mode: "prompt", depth: 0 }, { macros })).toBe("P");
    expect(applyRegexScripts([d, p, n], "a", { target: "ai", mode: "prompt", depth: 3 }, { macros })).toBe("a");
    expect(applyRegexScripts([d, p, n], "a", { target: "ai", mode: "saved" }, { macros })).toBe("N");
    expect(applyRegexScripts([d, p, n], "a", { target: "ai", mode: "saved", edit: true }, { macros })).toBe("a");
    expect(applyRegexScripts([d, p, n], "a", { target: "user", mode: "saved" }, { macros })).toBe("a");
  });

  it("orders global → preset → character and drops scripts that are off", () => {
    const g = script({ name: "g", find: "x", replace: "g", targets: ["ai"] });
    const off = script({ name: "off", find: "x", replace: "OFF", targets: ["ai"], on: false });
    const c = script({ name: "c", find: "g", replace: "c", targets: ["ai"] });
    expect(orderRegexScripts({ character: [c], preset: [off], global: [g] }).map((s) => s.name)).toEqual(["g", "c"]);
  });

  it("names a broken pattern and leaves the text alone", () => {
    expect(regexError("/[/")).toMatch(/class|terminated/i);
    expect(regexError("/ok/g")).toBeNull();
    expect(applyRegexScripts([script({ find: "/[/", replace: "!", targets: ["ai"] })], "[x", { target: "ai", mode: "saved" }, { macros })).toBe("[x");
  });

  it("reads scripts embedded in imported SillyTavern presets and cards", () => {
    const st = { scriptName: "Hide", findRegex: "/<x>/g", replaceString: "", placement: [2], markdownOnly: true, runOnEdit: true, substituteRegex: 0 };
    expect(embeddedStRegexScripts({ extensions: { regex_scripts: [st] } })[0]).toMatchObject({ name: "Hide", targets: ["ai"], displayOnly: true });
    expect(embeddedStRegexScripts({ data: { extensions: { regex_scripts: [st] } } })).toHaveLength(1);
    expect(embeddedStRegexScripts({})).toEqual([]);
  });
});

describe("regex scripts in a turn", () => {
  it("changes the saved reply and user message, and the prompt sees prompt-only scripts", async () => {
    const w = await world(() => "She *draws* her bow.");
    await w.store.setGlobalRegex([
      script({ name: "stars", find: "/\\*(.+?)\\*/g", replace: "_$1_", targets: ["ai"] }),
      script({ name: "shout", find: "/hello/gi", replace: "HELLO", targets: ["user"] }),
      script({ name: "secret", find: "/HELLO/g", replace: "[greeting]", targets: ["user"], promptOnly: true }),
      script({ name: "pretty", find: "/_/g", replace: "~", targets: ["ai"], displayOnly: true }),
    ]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { userMessage, reply } = await w.chat.send(session.id, firstMessage!.id, "hello there", connection);
    expect(userMessage.content).toBe("HELLO there");
    expect(reply.content).toBe("She _draws_ her bow.");
    const main = w.ai.prompts.at(-1)!;
    expect(main.some((t) => t.content.includes("[greeting] there"))).toBe(true);
    expect(main.some((t) => t.content.includes("~"))).toBe(false);

    const { scripts, ctx } = await w.chat.turns.regexForSession(session.id);
    expect(applyRegexScripts(scripts, reply.content, { target: "ai", mode: "display", depth: 0 }, ctx)).toBe("She ~draws~ her bow.");
  });
});

describe("regex safety (D-060)", () => {
  it("a card's scripts wait for approval, a chat can switch one off, and the text before regex comes back", async () => {
    const w = await world(() => "She *draws* her bow.");
    const stars = script({ name: "stars", find: "/\\*(.+?)\\*/g", replace: "_$1_", targets: ["ai"] });
    await w.store.saveCharacter({ ...(await w.store.getCharacter("lyra"))!, regexScripts: [stars] });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    expect(firstMessage!.content).toBe("*Lyra eyes you.* Who's there?");
    const waiting = await w.chat.turns.regexWaiting(session.id);
    expect(waiting).toMatchObject([{ owner: "character", ownerName: "Lyra", scripts: [{ name: "stars" }] }]);

    await w.store.approveRegex(waiting[0]!.scripts.map(regexKey));
    expect(await w.chat.turns.regexWaiting(session.id)).toEqual([]);
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "hi", connection);
    expect(reply.content).toBe("She _draws_ her bow.");
    expect(reply.meta.beforeRegex).toBe("She *draws* her bow.");
    await w.chat.undoRegex(reply.id);
    expect((await w.store.getMessage(reply.id))!.content).toBe("She *draws* her bow.");

    // changed script = new approval; a chat switches it off
    await w.store.saveCharacter({ ...(await w.store.getCharacter("lyra"))!, regexScripts: [{ ...stars, replace: "<$1>" }] });
    expect(await w.chat.turns.regexWaiting(session.id)).toHaveLength(1);
    await w.store.saveCharacter({ ...(await w.store.getCharacter("lyra"))!, regexScripts: [stars] });
    await w.store.saveSession({ ...(await w.store.getSession(session.id))!, setup: { regexOff: [stars.id] } });
    expect((await w.chat.turns.regexForSession(session.id)).scripts).toEqual([]);
  });
});
