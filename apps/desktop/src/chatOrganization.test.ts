import { describe, expect, it } from "vitest";
import { addFolder, ago, cleanOrganization, deleteFolder, EMPTY_ORGANIZATION, groupChats, moveChat, pinChat } from "./chatOrganization.ts";

const chats = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("chat organization (D-108)", () => {
  it("groups pinned, folders and the rest, keeping the chats' own order", () => {
    let o = addFolder(EMPTY_ORGANIZATION, "f", "Case files");
    o = moveChat(o, "c", "f");
    o = moveChat(o, "a", "f");
    o = pinChat(o, "b", true);
    const g = groupChats(o, chats);
    expect(g.pinned.map((x) => x.id)).toEqual(["b"]);
    expect(g.folders[0]!.chats.map((x) => x.id)).toEqual(["a", "c"]);
    expect(g.rest.map((x) => x.id)).toEqual(["d"]);
  });
  it("a chat is in one place: pinning takes it out of its folder, moving unpins it", () => {
    let o = addFolder(addFolder(EMPTY_ORGANIZATION, "f", "One"), "g", "Two");
    o = moveChat(o, "a", "f");
    o = moveChat(o, "a", "g");
    expect(o.folders.map((f) => f.chatIds)).toEqual([[], ["a"]]);
    o = pinChat(o, "a", true);
    expect(o.folders.map((f) => f.chatIds)).toEqual([[], []]);
    o = moveChat(pinChat(o, "a", false), "a", "f");
    expect(o.pinned).toEqual([]);
    expect(o.folders[0]!.chatIds).toEqual(["a"]);
  });
  it("deleting a folder deletes no chat; chats that are gone are not shown", () => {
    let o = moveChat(addFolder(EMPTY_ORGANIZATION, "f", "X"), "zz", "f");
    expect(groupChats(o, chats).folders[0]!.chats).toEqual([]);
    o = deleteFolder(moveChat(o, "a", "f"), "f");
    expect(groupChats(o, chats).rest.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("cleans a broken setting", () => {
    expect(cleanOrganization({ pinned: ["a", 3, "a"], folders: [{ id: "f", name: " ", chatIds: ["a", "b"] }, { id: "f" }, "x"], folded: ["f", "nope"] }))
      .toEqual({ pinned: ["a"], folders: [{ id: "f", name: "Folder", chatIds: ["b"] }], folded: ["f"] });
    expect(cleanOrganization(null)).toEqual(EMPTY_ORGANIZATION);
  });
  it("says how long ago in a few letters", () => {
    const now = Date.UTC(2026, 10, 10, 12);
    expect(ago(now - 30_000, now)).toBe("now");
    expect(ago(now - 5 * 3600_000, now)).toBe("5h");
    expect(ago(now - 3 * 86400_000, now)).toBe("3d");
    expect(ago(now - 14 * 86400_000, now)).toBe("2w");
  });
});
