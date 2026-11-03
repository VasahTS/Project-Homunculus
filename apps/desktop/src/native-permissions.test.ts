// Every native command is reachable by exactly the windows meant to use it. Author: CLAUDE, 2026-11-03.
// Since the app has its own permission files, Tauri checks every command against them: a command missing here works
// nowhere (even in the main window), and a site window must never be able to reach the main window's commands.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tauri = join(import.meta.dirname, "..", "src-tauri");
const lib = readFileSync(join(tauri, "src", "lib.rs"), "utf8");
const registered = [...(lib.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/(?:\w+::)?(\w+)/g)].map((m) => m[1]!);
const permissions = new Map<string, string[]>();
for (const file of readdirSync(join(tauri, "permissions")).filter((f) => f.endsWith(".toml"))) {
  for (const block of readFileSync(join(tauri, "permissions", file), "utf8").split("[[permission]]").slice(1)) {
    const id = block.match(/identifier\s*=\s*"([^"]+)"/)?.[1];
    const allow = block.match(/commands\.allow\s*=\s*\[([^\]]*)\]/)?.[1];
    if (id) permissions.set(id, [...(allow ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
  }
}
const capabilities = readdirSync(join(tauri, "capabilities")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(tauri, "capabilities", f), "utf8")) as { windows: string[]; remote?: { urls: string[] }; permissions: string[] });
const allowedFor = (c: (typeof capabilities)[number]) => c.permissions.flatMap((p) => permissions.get(p) ?? []);

describe("native command permissions", () => {
  it("found the registered commands and the permission files", () => {
    expect(registered.length).toBeGreaterThan(10);
    expect(registered).toContain("secret_get");
    expect(permissions.get("allow-main-commands")).toContain("secret_get");
  });
  it("every registered command is allowed for some window", () => {
    const allowed = new Set(capabilities.flatMap(allowedFor));
    expect(registered.filter((c) => !allowed.has(c))).toEqual([]);
  });
  it("remote site windows reach only their own report command", () => {
    for (const c of capabilities.filter((c) => c.remote)) {
      const commands = allowedFor(c);
      expect(commands.every((x) => x.endsWith("_report")), c.windows.join()).toBe(true);
      expect(c.windows).not.toContain("main");
    }
  });
});
