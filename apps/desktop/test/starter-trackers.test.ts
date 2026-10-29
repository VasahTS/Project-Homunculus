// The starter trackers on a database made before D-024/D-025 (like Daniel's). Author: CLAUDE, 2026-10-28.
import { describe, expect, it } from "vitest";
import { newTestStore } from "../../../packages/core/test/helpers.ts";
import { installStarterTrackers } from "../src/trackers.ts";
import starter from "../src/starter/trackers.json";

/** Saves the starter sets as an old version did: no display/icon/color, Appearance at the end. */
async function oldInstall(store: Awaited<ReturnType<typeof newTestStore>>["store"]) {
  for (const t of starter.trackers) {
    for (const s of t.sets) {
      const fields = (s.fields as Array<Record<string, unknown>>).map(({ display: _d, icon: _i, color: _c, ...f }) => f);
      const appearance = fields.filter((f) => f.section === "Appearance");
      await store.saveTrackerSchema({ ...(s as never as object), fields: [...fields.filter((f) => !appearance.includes(f)), ...appearance] } as never);
    }
    await store.saveAgentConfig(t.agent as never);
  }
  await store.setAppSetting("starterTrackers", starter.trackers.map((t) => t.agent.id));
}

describe("starter trackers already installed", () => {
  it("get the presentation hints and Appearance first, without touching what the user changed", async () => {
    const { store } = await newTestStore();
    await oldInstall(store);
    const before = (await store.trackerSchemas.get("scene-characters-fantasy"))!;
    // the user changed one field and added one of their own
    await store.saveTrackerSchema({ ...before, fields: [...before.fields.map((f) => (f.key === "age" ? { ...f, display: "line" as const } : f)), { ...before.fields[1]!, key: "mine", label: "Mine", section: "Now" }] });

    await installStarterTrackers(store);
    const after = (await store.trackerSchemas.get("scene-characters-fantasy"))!;
    const by = (k: string) => after.fields.find((f) => f.key === k)!;
    expect(by("mood").display).toBe("pill");
    expect(by("face").display).toBe("block");
    expect(by("age").display).toBe("line"); // the user's choice stays
    const keys = after.fields.map((f) => f.key);
    expect(keys.slice(0, 7)).toEqual(["face", "hair", "eyes", "body", "outfit", "accessories", "marks"]);
    expect(keys).toContain("mine");
    expect(keys.indexOf("mine")).toBe(keys.indexOf("marks") + 1); // a user field stays right after the field it followed
    expect(after.fields).toHaveLength(before.fields.length + 1);

    // runs once: a later reorder by the user is kept
    await store.saveTrackerSchema({ ...after, fields: [...after.fields].reverse() });
    await installStarterTrackers(store);
    expect((await store.trackerSchemas.get("scene-characters-fantasy"))!.fields[0]!.key).toBe(after.fields.at(-1)!.key);
  });
});

describe("Daniel's database (28/10): the fixes were marked done by an app left open", () => {
  it("runs them again: hints and Appearance first", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const file = process.env.H2_REAL_DB;
    if (!file || !existsSync(file)) return; // only with a copy of a real database
    const initSqlJs = (await import("sql.js")).default;
    const { SqlJsDriver, SqlStore, coreMigrations, migrate } = await import("../../../packages/core/src/index.ts");
    const SQL = await initSqlJs();
    const driver = new SqlJsDriver(new SQL.Database(readFileSync(file)));
    await migrate(driver, coreMigrations);
    const store = new SqlStore(driver);
    await installStarterTrackers(store);
    const s = (await store.trackerSchemas.get("scene-characters-fantasy"))!;
    expect(s.fields[0]!.key).toBe("face");
    expect(s.fields.find((f) => f.key === "mood")!.display).toBe("pill");
    expect((await store.trackerSchemas.get("scene-world"))!.fields.find((f) => f.key === "clock")!.display).toBe("header");
  });
});
