// Exporting and importing assistants and presets (D-118). Author: CLAUDE, 2026-11-12.
import { describe, expect, it } from "vitest";
import { AssistantPersona, AssistantPreset, AssistantSettings } from "@homunculus/schemas";
import { assistantFile, importAssistantFile, importSummary } from "./share.ts";

const writer = AssistantPersona.parse({ id: "writer", name: "Writer", instructions: "Write prose.", connectionId: "conn-1", model: "glm-5.3",
  toolHelper: { enabled: true, connectionId: "conn-2", model: "flash", maxSteps: 4 } });
const dark = AssistantPreset.parse({ id: "dark", name: "Dark Fantasy", style: "Grim.", rules: [{ id: "r", text: "No modern words", on: true }],
  memory: [{ id: "m", text: "Likes slow burns", from: "", at: 1 }] });
const text = (f: { bytes: Uint8Array }) => new TextDecoder().decode(f.bytes);
const empty = AssistantSettings.parse({});

describe("assistant files (D-118)", () => {
  it("leaves connections and models out, keeps everything else", () => {
    const f = assistantFile({ assistants: [writer], presets: [dark] });
    expect(f.fileName).toBe("Writer.h2.json");
    const json = JSON.parse(text(f));
    expect(json.assistants[0]).toMatchObject({ id: "writer", instructions: "Write prose.", connectionId: null, model: "", builtin: false });
    expect(json.assistants[0].toolHelper).toMatchObject({ enabled: true, connectionId: null, model: "", maxSteps: 4 });
    expect(json.presets[0].memory[0].text).toBe("Likes slow burns");
  });

  it("imports into another install with the same ids", () => {
    const r = importAssistantFile(empty, text(assistantFile({ assistants: [writer], presets: [dark] })));
    expect(r.settings.assistants.map((a) => a.id)).toEqual(["writer"]);
    expect(r.settings.presets[0]).toEqual(dark);
    expect(importSummary([r])).toBe("Added Writer and Dark Fantasy");
  });

  it("skips what is already here and copies what changed", () => {
    const s = AssistantSettings.parse({ assistants: [writer], presets: [dark] });
    const same = importAssistantFile(s, text(assistantFile({ assistants: [writer], presets: [dark] })));
    expect(same.added).toEqual([]);
    expect(importSummary([same])).toBe("Nothing new · 2 were already here");
    const changed = importAssistantFile(s, text(assistantFile({ presets: [{ ...dark, style: "Bright." }] })), () => "new-id");
    expect(changed.settings.presets.map((p) => [p.id, p.name])).toEqual([["dark", "Dark Fantasy"], ["new-id", "Dark Fantasy (imported)"]]);
    expect(changed.settings.presets[0]!.style).toBe("Grim.");
  });

  it("refuses other files with a plain sentence", () => {
    expect(() => importAssistantFile(empty, "{")).toThrow(/not JSON/);
    expect(() => importAssistantFile(empty, JSON.stringify({ format: "homunculus-bundle" }))).toThrow(/not an assistant or preset file/);
  });
});
