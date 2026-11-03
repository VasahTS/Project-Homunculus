// Assistant path preservation and context isolation regressions. CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { AssistantChat, AssistantMessage } from "@homunculus/schemas";
import { decodeHistory, encodeHistory, forkAt, pathsOf, selectPath, deleteMessage, versionsOf } from "./history.ts";
import initSqlJs from "sql.js";
import { SqlJsDriver, SqlStore, migrate, coreMigrations } from "@homunculus/core";
import { loadChat, saveChat, updateResult } from "./engine.ts";
const message = (id: string, role: "user" | "assistant", text = id) => AssistantMessage.parse({ id, role, text, createdAt: 1 });
const original = () => AssistantChat.parse({ id: "chat", createdAt: 1, updatedAt: 1, messages: [message("u", "user"), message("a", "assistant")], compact: { uptoId: "u", summary: "old summary", at: 1 }, guides: ["character"] });
describe("Assistant conversation paths", () => {
  it("reads old linear chats without changing their active messages", () => {
    const c = original(); expect(pathsOf(c)).toHaveLength(1); expect(pathsOf(c)[0]!.messages).toEqual(c.messages);
  });
  it("retains the original answer, reasoning and tool records when regenerating", () => {
    const c = original(); c.messages[1]!.reasoning = "reasoning"; c.messages[1]!.steps = [{ id: "t", name: "read", args: "{}", result: "old", label: "Read", error: false }];
    const next = forkAt(c, "u"); next.messages.push(message("a2", "assistant"));
    expect(versionsOf(next, "a2").map(v => v.message.id)).toEqual(["a", "a2"]);
    const old = selectPath(next, "main"); expect(old.messages[1]!.reasoning).toBe("reasoning"); expect(old.messages[1]!.steps[0]!.result).toBe("old");
    expect(selectPath(old, next.activeBranchId!).messages[1]!.id).toBe("a2");
  });
  it("isolates continuations and resets summaries when a path is forked", () => {
    const c = original(); const next = forkAt(c, "u"); expect(next.compact).toBeUndefined(); expect(next.guides).toEqual([]);
    next.messages.push(message("b", "assistant")); next.messages.push(message("u2", "user"));
    expect(selectPath(next, "main").messages.map(m => m.id)).toEqual(["u", "a"]);
    expect(c.messages.map(m => m.id)).toEqual(["u", "a"]);
  });
  it("deletes only the selected path's message and invalidates compacted context", () => {
    const c = forkAt(original(), "a"); const next = deleteMessage(c, "a"); expect(next.messages.map(m => m.id)).toEqual(["u"]); expect(next.compact).toBeUndefined(); expect(next.guides).toEqual([]);
    expect(selectPath(next, "main").messages.map(m => m.id)).toEqual(["u", "a"]);
  });
  it("does not mix unrelated answers or duplicate a shared reply in the version picker", () => {
    const c = forkAt(original(), "a"); c.messages.push(message("u2", "user"), message("a2", "assistant"));
    expect(versionsOf(c, "a")).toHaveLength(1); expect(versionsOf(c, "a2").map(v => v.message.id)).toEqual(["a2"]);
  });
  it("saves preserved paths in SQLite JSON and reloads decisions consistently", async () => {
    const SQL = await initSqlJs(); const driver = new SqlJsDriver(new SQL.Database()); await migrate(driver, coreMigrations); const store = new SqlStore(driver);
    const c = original(); c.messages[1]!.results = [{ type: "created", kind: "character", itemId: "item", name: "Example", detail: "Created", undone: false }];
    const fork = forkAt(c, "a"); await saveChat(store, fork);
    await updateResult(store, fork.id, "a", 0, { type: "created", kind: "character", itemId: "item", name: "Example", detail: "Created", undone: true });
    const loaded = (await loadChat(store, fork.id))!;
    expect(loaded.messages[1]!.results[0]).toMatchObject({ undone: true });
    expect(selectPath(loaded, "main").messages[1]!.results[0]).toMatchObject({ undone: true });
    expect(pathsOf(loaded)).toHaveLength(2);
  });
  it("stores shared attachments once when several paths reuse the same message", async () => {
    const SQL = await initSqlJs(); const driver = new SqlJsDriver(new SQL.Database()); await migrate(driver, coreMigrations); const store = new SqlStore(driver);
    const c = original(); c.messages[0]!.attachments = [{ type: "file", id: "file", name: "example.txt", mime: "text/plain", text: "UNIQUE_ATTACHMENT_PAYLOAD", summary: "Example" }];
    const fork = forkAt(forkAt(c, "a"), "a"); await saveChat(store, fork);
    const raw = await store.getAppSetting(`assistant.chat:${c.id}`);
    expect(JSON.stringify(raw).match(/UNIQUE_ATTACHMENT_PAYLOAD/g)).toHaveLength(1);
    const loaded = (await loadChat(store, c.id))!;
    expect(pathsOf(loaded)).toHaveLength(3); expect(selectPath(loaded, "main").messages[0]!.attachments[0]).toMatchObject({ text: "UNIQUE_ATTACHMENT_PAYLOAD" });
  });
  // CLAUDE, 2026-11-03: one damaged branch must not make the whole chat impossible to open.
  it("opens a chat whose saved branch refers to a missing message, keeping what is there", () => {
    const c = forkAt(original(), "u"); c.messages.push(message("a2", "assistant"));
    const saved = encodeHistory(c);
    const damaged = { ...saved, historyMessages: (saved.historyMessages ?? []).filter(m => m.id !== "a") };
    const opened = decodeHistory(damaged);
    expect(opened.messages.map(m => m.id)).toEqual(["u", "a2"]);
    expect(pathsOf(opened).find(p => p.id === "main")!.messages.map(m => m.id)).toEqual(["u"]);
  });
});
