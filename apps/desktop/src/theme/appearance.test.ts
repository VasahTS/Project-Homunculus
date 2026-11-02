// Unit tests of Customize's data rules (D-075). CLAUDE, 2026-11-01.
import { describe, expect, it } from "vitest";
import { cleanLook, inkOn, LOOK_FORMAT, resolvedLook } from "./appearance.ts";

describe("looks read from files", () => {
  it("keeps safe tokens and drops anything that could escape a CSS value", () => {
    const l = cleanLook({ format: LOOK_FORMAT, name: "  Paper ", tokens: { window: "#fff", label: "red; } body { display:none", "Bad Name": "#000", round: "0.5" }, css: "a { color: red }" });
    expect(l.name).toBe("Paper");
    expect(l.tokens).toEqual({ window: "#fff", round: "0.5" });
    expect(l.id).toMatch(/^look-/);
    expect(l.css).toBe("a { color: red }");
  });
  it("refuses other formats, nameless looks and CSS that loads from the internet", () => {
    expect(() => cleanLook({ format: "classic-theme@1", name: "x" })).toThrow(/Unknown format/);
    expect(() => cleanLook({ name: " " })).toThrow(/no name/);
    expect(() => cleanLook({ name: "x", css: "@import url(https://evil.example/x.css);" })).toThrow(/internet/);
    expect(() => cleanLook({ name: "x", css: "a { background: url('https://e.example/p.png') }" })).toThrow(/internet/);
  });
});

describe("tweaks", () => {
  it("text on the accent is black on light colors and white on dark ones", () => {
    expect(inkOn("#f2f2f2")).toBe("#0d0d0d");
    expect(inkOn("#1a2b6d")).toBe("#ffffff");
    expect(inkOn("not a color")).toBe("#0d0d0d");
  });
  it("the default look is Mono with square corners", () => {
    const l = resolvedLook();
    expect(l.id).toBe("mono");
    expect(l.tokens.round).toBe("0");
  });
});
