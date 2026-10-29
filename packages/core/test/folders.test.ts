// Tests of round 3 (D-036): folders (a tree per kind), kits in the Trash, searching chats, exporting a chat.
// Author: CLAUDE, 2026-10-29.
import { describe, expect, it } from "vitest";
import { exportChat } from "../src/index.ts";
import { connection, newTestStore, world } from "./helpers.ts";

describe("folders", () => {
  it("hold items, nest, and give their content to the parent when deleted", async () => {
    const { store } = await newTestStore();
    await store.saveFolder({ id: "fantasy", kind: "character", name: "Fantasy" });
    await store.saveFolder({ id: "elves", kind: "character", name: "Elves", parentId: "fantasy" });
    await store.saveFolder({ id: "monsters", kind: "npc", name: "Monsters" });
    await store.setFolder("character", "lyra", "elves");
    await store.setFolder("character", "kael", "fantasy");
    expect(await store.folderMap("character")).toEqual({ lyra: "elves", kael: "fantasy" });
    expect((await store.listFolders("npc")).map((f) => f.name)).toEqual(["Monsters"]);

    await expect(store.moveFolder("fantasy", "elves")).rejects.toThrow(/inside itself/);
    await store.deleteFolder("elves");
    expect(await store.folderMap("character")).toEqual({ lyra: "fantasy", kael: "fantasy" });
    await store.deleteFolder("fantasy");
    expect(await store.folderMap("character")).toEqual({});
    await store.setFolder("character", "lyra", null);
  });

  it("a kit goes to the Trash and comes back", async () => {
    const { store } = await newTestStore();
    await store.kits.save({ id: "k1", name: "Goblins at the Old Mill", createdAt: 1 });
    await store.moveToTrash("kit", "k1");
    expect(await store.kits.list()).toEqual([]);
    expect((await store.listTrash()).map((t) => t.kind)).toEqual(["kit"]);
    await store.restoreFromTrash("kit", "k1");
    expect((await store.kits.list()).map((k) => k.name)).toEqual(["Goblins at the Old Mill"]);
  });
});

describe("chats", () => {
  it("are searched by their messages, newest first", async () => {
    const { store, chat } = await world(() => "The goblin laughs.");
    const { session } = await chat.createSession({ characterIds: ["lyra"] });
    await chat.send(session.id, (await store.latestMessage(session.id))!.id, "Where is the goblin camp?", connection);
    const found = await store.searchMessages([session.id], "GOBLIN");
    expect(found[session.id]!.count).toBe(2);
    expect(found[session.id]!.hits[0]!.content).toContain("goblin");
    expect(await store.searchMessages([session.id], "dragon")).toEqual({});
    expect(await store.searchMessages([session.id], "50%")).toEqual({});
  });

  it("export as Markdown, text, SillyTavern JSONL and the whole Homunculus chat", async () => {
    const { store, chat } = await world(() => "Arrows ready.");
    const { session } = await chat.createSession({ characterIds: ["lyra"], title: "At the mill" });
    await chat.send(session.id, (await store.latestMessage(session.id))!.id, "Hello", connection);
    const text = (b: Uint8Array) => new TextDecoder().decode(b);

    const md = await exportChat(store, session.id, "markdown");
    expect(md.fileName).toBe("At the mill.md");
    expect(text(md.bytes)).toContain("**Lyra:** *Lyra eyes you.* Who's there?");
    expect(text(md.bytes)).toContain("**User:** Hello");

    const txt = text((await exportChat(store, session.id, "text")).bytes);
    expect(txt).toContain("Lyra: Arrows ready.");

    const lines = text((await exportChat(store, session.id, "jsonl")).bytes).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ user_name: "User", character_name: "Lyra" });
    expect(lines.slice(1).map((l) => [l.name, l.is_user])).toEqual([["Lyra", false], ["User", true], ["Lyra", false]]);

    const all = JSON.parse(text((await exportChat(store, session.id, "homunculus")).bytes));
    expect(all.format).toBe("homunculus-chat");
    expect(all.messages).toHaveLength(3);
  });
});
