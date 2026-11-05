// Tests of Quick Replies against SillyTavern's quick-reply extension (QuickReplySet.executeWithOptions, ContextMenu.build,
// ButtonUi, index.js loadSets, toJSON). Author: CLAUDE, 2026-11-04 (D-090).
import { describe, expect, it } from "vitest";
import { QuickReplySet, type QuickReplyData, type QuickReplySetInput } from "@homunculus/schemas";
import {
  barReplies, fillInput, importStQuickReplies, quickReplyMenu, runQuickReply, shownSets, toStQuickReplySet, withoutSet,
} from "../src/index.ts";

const set = (over: Partial<QuickReplySetInput> = {}) => QuickReplySet.parse({ id: "s", name: "Set", ...over });
const ST = { send: true, inject: false, before: false, stack: false }; // SillyTavern's defaults, no stacking

describe("a click (SillyTavern executeWithOptions)", () => {
  it("{{input}} is the whole box as it was, any case, every time it appears", () => {
    expect(fillInput("[Author Directions: {{input}}]", "she runs")).toBe("[Author Directions: she runs]");
    expect(fillInput("{{INPUT}} / {{Input}}", " a ")).toBe(" a  /  a ");
    expect(runQuickReply({ ...ST, send: false }, "(OOC: {{input}})", "wait")).toEqual({ text: "(OOC: wait) ", send: false });
  });

  it("without inject the reply replaces the box (with ST's trailing space); sending trims it", () => {
    expect(runQuickReply({ ...ST, send: false }, "Continue.", "my text")).toEqual({ text: "Continue. ", send: false });
    expect(runQuickReply(ST, "Continue.", "my text")).toEqual({ text: "Continue.", send: true });
  });

  it("inject keeps the box text and adds the reply after it, or before it, with a space", () => {
    expect(runQuickReply({ ...ST, inject: true }, "I look around.", "I stand.")).toEqual({ text: "I stand. I look around.", send: true });
    expect(runQuickReply({ ...ST, inject: true, before: true, send: false }, "[OOC]", "I stand.")).toEqual({ text: "[OOC] I stand.", send: false });
    // an empty box: just the reply
    expect(runQuickReply({ ...ST, inject: true, send: false }, "[OOC]", "")).toEqual({ text: "[OOC] ", send: false });
  });

  it("stack (ours): clicks pile up in the box, each on its own line, after or before", () => {
    const put = { ...ST, send: false, stack: true };
    let box = "";
    box = runQuickReply(put, "[Continue the scene.]", box).text;
    box = runQuickReply(put, "OOC: Advance time naturally.", box).text;
    expect(box).toBe("[Continue the scene.]\nOOC: Advance time naturally. ");
    expect(runQuickReply({ ...put, before: true }, "OOC: Director.", "I stand. ").text).toBe("OOC: Director.\nI stand. ");
    // a reply with {{input}} already wraps the box, so it replaces it as usual
    expect(runQuickReply(put, "[Author: {{input}}]", "she runs").text).toBe("[Author: she runs] ");
    // stack does not change sending
    expect(runQuickReply({ ...put, send: true }, "Go.", "typed")).toEqual({ text: "Go.", send: true });
  });
});

describe("which sets show (ButtonUi)", () => {
  const ooc = set({ id: "ooc", name: "OOC", replies: [{ id: "a", label: "OOC" }, { id: "b", label: "Only in menus", hidden: true }] });
  const mine = set({ id: "mine", name: "Mine", replies: [{ id: "c", label: "Intro" }] });
  const data: QuickReplyData = {
    sets: [ooc, mine], global: [{ setId: "ooc", visible: true }, { setId: "gone", visible: true }],
    story: { st: [{ setId: "mine", visible: false }] }, character: { lyra: [{ setId: "mine", visible: true }] }, chat: {},
  };

  it("global, story, character, chat; a set shows once; unknown sets are skipped", () => {
    const shown = shownSets(data, { storyId: "st", characterIds: ["lyra"], chatId: "c1" });
    expect(shown.map((s) => [s.set.id, s.scope, s.link.visible])).toEqual([["ooc", "global", true], ["mine", "story", true]]);
  });

  it("the bar has visible sets' replies that are not hidden", () => {
    expect(barReplies(shownSets(data, { storyId: "st" })).map((b) => b.reply.label)).toEqual(["OOC"]);
  });

  it("removing a set takes its links and menu entries away", () => {
    const d = withoutSet({ ...data, sets: [ooc, set({ ...mine, replies: [{ id: "c", menu: [{ setId: "ooc", chained: false }] }] })] }, "ooc");
    expect(d.global).toEqual([{ setId: "gone", visible: true }]);
    expect(d.sets[0]!.replies[0]!.menu).toEqual([]);
  });
});

describe("the ⋮ menu (ContextMenu.build)", () => {
  const skips = set({ id: "skips", name: "Time skips", replies: [{ id: "h", label: "An hour", message: "An hour later." }, { id: "x", label: "secret", hidden: true }] });
  const panel = set({ id: "panel", name: "Panel", replies: [
    { id: "t", label: "Time Skip", message: "Time skip.", menu: [{ setId: "skips", chained: true }, { setId: "panel", chained: false }] },
    { id: "lib", label: "Lib", hidden: true, icon: "fa-book", message: "%%parent%% says hi" },
  ] });

  it("headers, visible replies, chained text, the own set's hidden replies with an icon, %%parent%%", () => {
    const menu = quickReplyMenu(panel.replies[0]!, [skips, panel]);
    expect(menu.map((i) => (i.kind === "header" ? `# ${i.label}` : `${i.reply.label}: ${i.message}`))).toEqual([
      "# Time skips", "An hour: Time skip.\nAn hour later.", "# Panel", "Lib: Time Skip says hi",
    ]);
  });

  it("a set already on the way is not opened again (no loops)", () => {
    const loop = set({ id: "l", name: "Loop", replies: [{ id: "r", label: "R", message: "r", menu: [{ setId: "l", chained: false }] }] });
    expect(quickReplyMenu(loop.replies[0]!, [loop])).toEqual([{ kind: "header", label: "Loop" }]);
  });
});

describe("SillyTavern files", () => {
  let n = 0;
  const id = () => `id${++n}`;
  // Daniel's "RP Control Panel" as SillyTavern exports it (QuickReplySet.toJSON)
  const panel = {
    version: 2, name: "RP Control Panel", disableSend: true, placeBeforeInput: true, injectInput: false, color: "transparent", onlyBorderColor: false,
    qrList: [
      { id: 1, icon: "", showLabel: false, label: "AuthorS", title: "", message: "[Author Directions: {{input}}]", contextList: [{ set: "Guided user", isChained: true }], isHidden: false, executeOnAi: false },
      { id: 2, icon: "fa-heart", showLabel: false, label: "Continue", title: "", message: "[Continue the scene naturally.]", contextList: [{ set: "Nowhere", isChained: false }], isHidden: false },
    ],
    idIndex: 3,
  };
  const guided = { version: 2, name: "Guided user", disableSend: false, qrList: [{ id: 1, label: "Act", message: "{{input}}" }] };

  it("imports a version 2 set: options, replies, menus by name (in the file, then existing), unknown menus dropped", () => {
    const [s] = importStQuickReplies(JSON.stringify(panel), "panel.json", [set({ id: "g", name: "Guided user" })], id);
    expect(s).toMatchObject({ name: "RP Control Panel", send: false, inject: false, before: true, stack: true, color: "" });
    expect(s!.replies.map((r) => [r.label, r.message, r.icon, r.menu])).toEqual([
      ["AuthorS", "[Author Directions: {{input}}]", "", [{ setId: "g", chained: true }]],
      ["Continue", "[Continue the scene naturally.]", "fa-heart", []],
    ]);
  });

  it("a list or settings.json with several sets links their menus to each other and keeps names unique", () => {
    const sets = importStQuickReplies(JSON.stringify({ quickReplyPresets: [panel, guided] }), "settings.json", [set({ name: "Guided user" })], id);
    expect(sets.map((s) => s.name)).toEqual(["RP Control Panel", "Guided user 2"]);
    expect(sets[0]!.replies[0]!.menu).toEqual([{ setId: sets[1]!.id, chained: true }]);
  });

  it("imports the old v1 format like SillyTavern migrates it", () => {
    const v1 = { name: "Old", quickActionEnabled: true, placeBeforeInputEnabled: false, AutoInputInject: true, quickReplySlots: [{ label: "Hi", mes: "Hello {{input}}", hidden: true, contextMenu: [{ preset: "Old", chain: true }] }] };
    const [s] = importStQuickReplies(JSON.stringify(v1), "old.json", [], id);
    expect(s).toMatchObject({ send: false, inject: true, before: false });
    expect(s!.replies[0]).toMatchObject({ label: "Hi", message: "Hello {{input}}", hidden: true, menu: [{ setId: s!.id, chained: true }] });
  });

  it("export gives SillyTavern's shape back, and it imports again the same", () => {
    const [s] = importStQuickReplies(JSON.stringify(panel), "p.json", [], id);
    const out = toStQuickReplySet(s!, [s!]);
    expect(out).toMatchObject({ version: 2, name: "RP Control Panel", disableSend: true, placeBeforeInput: true, injectInput: false, color: "transparent", idIndex: 3 });
    expect((out.qrList as Array<Record<string, unknown>>)[0]).toMatchObject({ id: 1, label: "AuthorS", message: "[Author Directions: {{input}}]", contextList: [], isHidden: false });
    const [again] = importStQuickReplies(JSON.stringify(out), "p.json", [], id);
    expect(again!.replies.map((r) => r.message)).toEqual(s!.replies.map((r) => r.message));
  });

  it("explains what is wrong with a file", () => {
    expect(() => importStQuickReplies("{", "a.json", [])).toThrow(/not valid JSON/);
    expect(() => importStQuickReplies("{\"x\":1}", "a.json", [])).toThrow(/No SillyTavern Quick Reply set/);
  });
});
