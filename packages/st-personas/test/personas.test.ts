// Tests of the SillyTavern persona importer. Author: CLAUDE, 2026-10-28.
// The data is shaped like SillyTavern's "Backup" (public/scripts/personas.js onBackupPersonas).
import { describe, expect, it } from "vitest";
import { importStPersonas } from "../src/index.ts";

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const backup = {
  personas: { "user-default.png": "Daniel", "1700000000.png": "Sir Dan", "x.png": "Ghost" },
  persona_descriptions: {
    "user-default.png": { description: "A traveller.", position: 0, depth: 2, role: 0, lorebook: "", title: "" },
    "1700000000.png": { description: "A knight.", position: 4, depth: 3, role: 1, lorebook: "Realm", title: "Knight" },
    "x.png": { description: "Hidden.", position: 9 },
  },
  default_persona: "user-default.png",
};

describe("SillyTavern personas", () => {
  it("reads a backup: names, descriptions, positions, the default, the pictures and what was kept", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const r = importStPersonas([{ name: "personas_20261028.json", bytes: enc(backup) }, { name: "user-default.png", bytes: png }]);
    expect(r.personas.map((p) => p.persona.name)).toEqual(["Daniel", "Sir Dan", "Ghost"]);
    const [me, knight, ghost] = r.personas;
    expect(me).toMatchObject({ isDefault: true, persona: { description: "A traveller.", placement: { position: "inPrompt" } } });
    expect(me!.avatar).toEqual({ mime: "image/png", base64: "iVBORw==" });
    expect(knight!.persona.placement).toEqual({ position: "atDepth", depth: 3, role: "user" });
    expect(knight!.persona.original).toMatchObject({ avatarId: "1700000000.png", lorebook: "Realm", title: "Knight" });
    expect(ghost!.persona.placement?.position).toBe("none");
    expect(r.warnings.join("\n")).toMatch(/lorebook "Realm"/);
    expect(r.warnings.join("\n")).toMatch(/"1700000000.png" was not among the picked files/);
  });

  it("also reads SillyTavern's whole settings.json, and explains what is wrong with bad files", () => {
    const r = importStPersonas([{ name: "settings.json", bytes: enc({ power_user: backup }) }]);
    expect(r.personas).toHaveLength(3);
    expect(r.warnings.join("\n")).toMatch(/No images were picked/);
    expect(() => importStPersonas([{ name: "a.png", bytes: new Uint8Array([1]) }])).toThrow(/Only images were picked/);
    expect(() => importStPersonas([{ name: "a.json", bytes: enc({ hello: 1 }) }])).toThrow(/No SillyTavern personas/);
  });
});
