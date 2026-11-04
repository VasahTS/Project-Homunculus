// Settings → Data: the Trash empties items older than the chosen age; newer and still-used ones stay. CLAUDE, 2026-11-03.
import { expect, it } from "vitest";
import { newTestStore } from "./helpers.ts";

it("deletes only items trashed before the cutoff and keeps what is still in use", async () => {
  const { store } = await newTestStore();
  await store.saveCharacter({ id: "old", name: "Old" });
  await store.saveCharacter({ id: "new", name: "New" });
  await store.moveToTrash("character", "old");
  await store.moveToTrash("character", "new");
  const trash = await store.listTrash();
  const oldAt = trash.find((x) => x.id === "old")!.trashedAt;
  // make "old" older by hand (moveToTrash stamps now)
  await (store as unknown as { db: { execute(sql: string, p: unknown[]): Promise<unknown> } }).db.execute("UPDATE characters SET trashed_at = ? WHERE id = ?", [oldAt - 40 * 86_400_000, "old"]);
  expect(await store.emptyTrashOlderThan(oldAt - 30 * 86_400_000)).toBe(1);
  expect((await store.listTrash()).map((x) => x.id)).toEqual(["new"]);
});
