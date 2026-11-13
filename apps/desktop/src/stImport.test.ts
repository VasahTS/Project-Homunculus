// D-128: a whole SillyTavern folder in one run — links by name, chats with branches, groups as Stories, tags, re-import, undo.
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { createSillyTavernCardsModule } from "@homunculus/st-cards";
import { browserFolder, findStUsers, scanSt } from "./stFolder.ts";
import { ST_KINDS, runStImport, undoStImport, type StKind, type StProgress } from "./stImport.ts";

const file = (path: string, text: string) => {
  const f = new File([text], path.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: `default-user/${path}` });
  return f;
};
const J = JSON.stringify;
const jsonl = (...rows: unknown[]) => rows.map((r) => J(r)).join("\n");
const card = (name: string, extensions: Record<string, unknown> = {}) => J({ spec: "chara_card_v2", spec_version: "2.0", data: { name, description: `${name} desc`, personality: "", scenario: "", first_mes: `Hi from ${name}`, mes_example: "", tags: [], extensions } });
const book = (name: string) => J({ name, entries: { 0: { uid: 0, key: ["k"], content: `${name} lore`, comment: "e" } } });
const msg = (name: string, is_user: boolean, mes: string, send_date: string, more: Record<string, unknown> = {}) => ({ name, is_user, is_system: false, send_date, mes, extra: {}, ...more });

function folder(): File[] {
  return [
    file("settings.json", J({
      power_user: { personas: { "daniel.png": "Daniel" }, persona_descriptions: { "daniel.png": { description: "A traveler.", lorebook: "Extra" } }, default_persona: "daniel.png" },
      extension_settings: { regex: [{ id: "r1", scriptName: "Trim", findRegex: "/\\s+$/", replaceString: "", placement: [2] }] },
      tags: [{ id: "t1", name: "fantasy" }, { id: "t2", name: "slow burn" }],
      tag_map: { "Mira.json": ["t1", "t2"] },
      world_info_settings: { world_info: { globalSelect: ["Extra"], charLore: [{ name: "Ivo", extraBooks: ["Extra"] }] } },
      preset_settings_openai: "Dark Fantasy",
    })),
    file("secrets.json", J({ api_key_openai: "sk-never-read" })),
    file("characters/Mira.json", card("Mira", { world: "Old Roads" })),
    file("characters/Ivo.json", card("Ivo")),
    file("worlds/Old Roads.json", book("Old Roads")),
    file("worlds/Extra.json", book("Extra")),
    file("OpenAI Settings/Dark Fantasy.json", J({ prompts: [{ identifier: "main", name: "Main", content: "Write.", role: "system" }], prompt_order: [] })),
    file("QuickReplies/RP Control Panel.json", J({ version: 2, name: "RP Control Panel", qrList: [{ id: 1, label: "Continue", message: "(continue)" }] })),
    file("chats/Mira/Mira - main.jsonl", jsonl(
      { user_name: "Daniel", character_name: "Mira", create_date: "2026-1-5@12h30m10s", chat_metadata: { note_prompt: "Keep it tense.", world_info: "Extra", persona: "daniel.png" } },
      msg("Mira", false, "Hello.", "2026-01-05T15:30:00Z", { swipes: ["Hello.", "Who's there?"], swipe_id: 0 }),
      msg("Daniel", true, "Hi.", "2026-01-05T15:31:00Z"),
      msg("Mira", false, "Sit.", "2026-01-05T15:32:00Z"),
    )),
    file("chats/Mira/Branch #1.jsonl", jsonl(
      { user_name: "Daniel", character_name: "Mira", create_date: "2026-1-6@10h00m00s", chat_metadata: { main_chat: "Mira - main" } },
      msg("Mira", false, "Hello.", "2026-01-05T15:30:00Z"),
      msg("Daniel", true, "Hi.", "2026-01-05T15:31:00Z"),
      msg("Mira", false, "Leave.", "2026-01-06T10:00:00Z"),
    )),
    file("chats/Ghost/old.jsonl", jsonl({ user_name: "Daniel", character_name: "Ghost", chat_metadata: {} }, msg("Ghost", false, "Boo.", "2026-01-01T00:00:00Z"))),
    file("groups/g1.json", J({ id: "g1", name: "Road Party", members: ["Mira.json", "Ivo.json"], disabled_members: ["Ivo.json"], chats: ["2026-2-1@10h00m00s"] })),
    file("group chats/2026-2-1@10h00m00s.jsonl", jsonl(
      { user_name: "Daniel", character_name: "unused", chat_metadata: {} },
      msg("Mira", false, "We ride.", "2026-02-01T10:00:00Z", { original_avatar: "Mira.json" }),
      msg("Ivo", false, "At dawn.", "2026-02-01T10:01:00Z"),
      msg("Daniel", true, "Agreed.", "2026-02-01T10:02:00Z"),
    )),
  ];
}

async function setup() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  await core.loadModules([createSillyTavernCardsModule()]);
  const src = browserFolder(folder());
  const [user] = await findStUsers(src);
  const scan = await scanSt(src, user!);
  return { svc: { core, store }, store, src, scan };
}
const all = Object.fromEntries(ST_KINDS.map((k) => [k, true])) as Record<StKind, boolean>;

describe("importing a whole SillyTavern folder (D-128)", () => {
  it("brings everything in, linked by SillyTavern's names", async () => {
    const { svc, store, src, scan } = await setup();
    const progress: StProgress[] = [];
    const reads: string[] = [];
    const watched = { ...src, read: (p: string) => { reads.push(p); return src.read(p); } };
    const r = await runStImport(svc, watched, scan, { kinds: all }, (p) => progress.push(p));
    expect(reads).not.toContain("secrets.json");
    expect(r.counts).toMatchObject({ characters: 2, lorebooks: 2, personas: 1, presets: 1, regex: 1, quickReplies: 1, tags: 2, chats: 2, groups: 1, branches: 1, swipes: 1, alreadyHere: 0 });
    expect(r.presetInUse).toBe("Dark Fantasy");

    const chars = await store.listCharacters();
    const mira = chars.find((c) => c.name === "Mira")!;
    const ivo = chars.find((c) => c.name === "Ivo")!;
    const books = await store.lorebooks.list();
    const id = (n: string) => books.find((b) => b.name === n)!.id;
    expect(mira.tags).toEqual(expect.arrayContaining(["fantasy", "slow burn"]));
    expect(mira.source).toMatchObject({ site: "sillytavern", id: "Mira.json" });
    expect(mira.lorebookIds).toEqual([id("Old Roads")]); // its world
    expect(ivo.lorebookIds).toEqual([id("Extra")]); // World Info → character lore
    const persona = (await store.personas.list())[0]!;
    expect(persona.lorebookIds).toEqual([id("Extra")]);
    const def = await store.getDefaultSetup();
    expect(def.personaId).toBe(persona.id);
    expect(def.lorebooks?.add).toEqual([id("Extra")]); // global
    expect((await store.getGlobalRegex()).map((x) => x.name)).toEqual(["Trim"]);
    expect((await store.getQuickReplies()).sets.map((s) => s.name)).toEqual(["RP Control Panel"]);

    const sessions = await store.listSessions();
    const solo = sessions.find((s) => s.title === "Mira - main")!;
    expect(solo.cast.map((c) => c.characterId)).toEqual([mira.id]);
    expect(solo.setup.authorsNote?.text).toBe("Keep it tense.");
    expect(solo.setup.lorebooks?.add).toEqual([id("Extra")]);
    expect(solo.setup.personaId).toBe(persona.id);
    expect((await store.listBranches(solo.id)).map((b) => b.name).sort()).toEqual(["Branch #1", "Main"]);
    expect(await store.countMessages(solo.id)).toBe(5); // Hello + its swipe, Hi, Sit, Leave

    const story = (await store.stories.list())[0]!;
    expect(story.name).toBe("Road Party");
    expect(story.cast.map((c) => [c.characterId, c.muted])).toEqual([[mira.id, false], [ivo.id, true]]);
    const groupChat = sessions.find((s) => s.storyId === story.id)!;
    const end = (await store.listBranches(groupChat.id))[0]!.endMessageId!;
    expect((await store.pathTo(end)).map((m) => [m.content, m.speaker.kind === "character" ? m.speaker.characterId : m.speaker.kind])).toEqual([
      ["We ride.", mira.id], ["At dawn.", ivo.id], ["Agreed.", "user"],
    ]);
    expect(r.warnings.some((w) => /belong to cards that are not in the folder/.test(w.text))).toBe(true);
    expect(progress.some((p) => p.stage === "Chats")).toBe(true);
  });

  it("importing again skips what came in; Undo moves it all to the Trash and lets it come back", async () => {
    const { svc, store, src, scan } = await setup();
    const first = await runStImport(svc, src, scan, { kinds: all });
    const again = await runStImport(svc, src, scan, { kinds: all });
    expect(again.counts.characters + again.counts.chats + again.counts.lorebooks + again.counts.personas + again.counts.groups).toBe(0);
    expect(again.counts.alreadyHere).toBeGreaterThanOrEqual(9);
    expect((await store.listCharacters())).toHaveLength(2);

    await undoStImport(svc, first);
    expect(await store.listCharacters()).toEqual([]);
    expect(await store.listSessions()).toEqual([]);
    expect(await store.lorebooks.list()).toEqual([]);
    expect(await store.personas.list()).toEqual([]);
    expect(await store.getGlobalRegex()).toEqual([]);
    expect((await store.getQuickReplies()).sets).toEqual([]);
    expect((await store.getDefaultSetup()).personaId ?? null).toBeNull();
    const third = await runStImport(svc, src, scan, { kinds: all });
    expect(third.counts.characters).toBe(2);
  });

  it("brings only the kinds and characters picked, and stops when cancelled", async () => {
    const { svc, store, src, scan } = await setup();
    const r = await runStImport(svc, src, scan, { kinds: { ...all, groups: false, lorebooks: false, personas: false }, chatsOf: [] });
    expect(r.counts).toMatchObject({ characters: 2, chats: 0, groups: 0, lorebooks: 0 });
    const { svc: svc2, store: store2, src: src2, scan: scan2 } = await setup();
    const cancelled = await runStImport(svc2, src2, scan2, { kinds: all }, () => {}, { paused: false, cancelled: true });
    expect(cancelled.cancelled).toBe(true);
    expect(await store2.listCharacters()).toEqual([]);
    expect(store).toBeTruthy();
  });
});
