// Addition order survives edits and source timestamps, without a schema migration. Author: CODEX, 2026-11-03.
import { expect, it } from "vitest";
import { newTestStore } from "./helpers.ts";

it("reports stable insertion order and existing history timestamps", async () => {
  const { store } = await newTestStore();
  await store.saveCharacter({ id: "first", name: "First", original: { create_date: "2030-01-01" } });
  await store.saveCharacter({ id: "second", name: "Second", original: { create_date: "2000-01-01" } });
  const before = await store.collectionSortMetadata("characters");
  await store.saveCharacter({ ...(await store.getCharacter("first"))!, name: "Edited first" });
  const after = await store.collectionSortMetadata("characters");
  expect(after.first!.added).toBe(before.first!.added);
  expect(after.first!.created).toBe(before.first!.created);
  expect(after.second!.added).toBeGreaterThan(after.first!.added);
  expect(await store.collectionSortMetadata("untrusted-table-name")).toEqual({});
});
