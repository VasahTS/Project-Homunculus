// D-127: finding the SillyTavern data in a picked folder and counting what is there (nothing imported, secrets never read).
import { describe, expect, it } from "vitest";
import { browserFolder, findStUsers, scanSt, type FolderSource } from "./stFolder.ts";

const file = (path: string, text = "x") => {
  const f = new File([text], path.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
};

const settings = JSON.stringify({
  power_user: { personas: { "daniel.png": "Daniel", "alt.png": "Alt" } },
  extension_settings: { regex: [{ scriptName: "a" }, { scriptName: "b" }, { scriptName: "c" }] },
  tags: [{ id: "1", name: "fantasy" }],
});

function stFolder(prefix: string): File[] {
  const p = (s: string) => `${prefix}/${s}`;
  return [
    file(p("settings.json"), settings),
    file(p("secrets.json"), "{\"api_key_openai\":\"sk-never\"}"),
    file(p("characters/Mira.png")), file(p("characters/Old.json")), file(p("characters/Mira/joy.png")),
    file(p("chats/Mira/Mira - 2026-1-5@12h30m10s.jsonl"), "0123456789"), file(p("chats/Mira/Branch #1.jsonl"), "01234"), file(p("chats/Old/x.jsonl")),
    file(p("groups/1700000000.json")), file(p("group chats/2026-1-1@10h00m00s.jsonl")),
    file(p("worlds/Old Roads.json")), file(p("User Avatars/daniel.png")),
    file(p("OpenAI Settings/Default.json")), file(p("OpenAI Settings/Mine.json")),
    file(p("QuickReplies/RP Control Panel.json")),
    file(p("instruct/ChatML.json")), file(p("TextGen Settings/Deterministic.json")),
    file(p("backgrounds/tavern.jpg")), file(p(".git/HEAD")),
  ];
}

describe("a SillyTavern folder (D-127)", () => {
  it("finds the user folder whether the ST root or the user folder was picked", async () => {
    expect(await findStUsers(browserFolder(stFolder("default-user")))).toEqual([{ dir: "", name: "default-user" }]);
    const root = browserFolder([...stFolder("SillyTavern/data/default-user"), ...stFolder("SillyTavern/data/alice"), file("SillyTavern/server.js")]);
    expect(await findStUsers(root)).toEqual([{ dir: "data/default-user", name: "default-user" }, { dir: "data/alice", name: "alice" }]);
    expect(await findStUsers(browserFolder([file("Photos/a.jpg")]))).toEqual([]);
  });

  it("counts what is there, says what will be skipped, never reads secrets.json", async () => {
    const src = browserFolder(stFolder("default-user"));
    const reads: string[] = [];
    const watched: FolderSource = { ...src, read: (p) => { reads.push(p); return src.read(p); } };
    const [user] = await findStUsers(watched);
    const s = await scanSt(watched, user!);
    expect(s.cards).toEqual(["characters/Mira.png", "characters/Old.json"]); // sprites in characters/Mira/ are not cards
    expect(s.chats).toEqual({ Mira: ["chats/Mira/Branch #1.jsonl", "chats/Mira/Mira - 2026-1-5@12h30m10s.jsonl"], Old: ["chats/Old/x.jsonl"] });
    expect(s.chatCount).toBe(3);
    expect(s.chatBytes).toBe(10 + 5 + 1 + 1);
    expect(s).toMatchObject({ groups: ["groups/1700000000.json"], groupChats: ["group chats/2026-1-1@10h00m00s.jsonl"], lorebooks: ["worlds/Old Roads.json"] });
    expect(s).toMatchObject({ personas: 2, regex: 3, tags: 1, presets: ["OpenAI Settings/Default.json", "OpenAI Settings/Mine.json"], quickReplies: ["QuickReplies/RP Control Panel.json"] });
    expect(s.skipped.map((x) => [x.what, x.count])).toEqual([["Text Completion settings", 2], ["Backgrounds", 1], ["API keys (secrets.json)", 1]]);
    expect(reads).toEqual(["settings.json"]);
  });
});
