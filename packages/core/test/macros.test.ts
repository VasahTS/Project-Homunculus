// Tests of the macro engine with SillyTavern's macro set (D-146). Expected results follow SillyTavern's definitions at the
// commit pinned in docs/reference/pins.json (public/scripts/macros/definitions/, engine/MacroCstWalker.js, variables.js).
import { describe, expect, it } from "vitest";
import { expandMacros, isFalsyMacroValue, type MacroContext } from "../src/index.ts";

const base = (): MacroContext => ({ char: "Lyra", user: "Dan", description: "A ranger.", vars: new Map(), globals: new Map() });
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };

describe("dice and random", () => {
  it("rolls valid formulas and gives nothing for formulas it cannot read", () => {
    const ctx = { ...base(), random: () => 0.999 };
    expect(expandMacros("{{roll::1d20}} {{roll:20}} {{roll::2d6+3}} {{roll::d100}} {{roll::3d6 - 2}}", ctx)).toBe("20 20 15 100 16");
    expect(expandMacros("{{roll 1d20}}", ctx)).toBe("20"); // the new engine's space form
    expect(expandMacros("[{{roll::4d6kh3}}][{{roll::1d20+1d6}}][{{roll::abc}}][{{roll::1d0}}]", ctx)).toBe("[][][][]");
  });

  it("random takes any number of options, in both forms", () => {
    const ctx = { ...base(), random: seq(0, 0.99, 0.5) };
    expect(expandMacros("{{random::a::b::c::d::e}} {{random::x, y, z}} {{random::1::2::3}}", ctx)).toBe("a z 2");
  });
});

describe("variables", () => {
  it("local and global variables, like SillyTavern's", () => {
    const ctx = base();
    const out = expandMacros(
      "{{setvar::hp::10}}{{addvar::hp::5}}{{getvar::hp}} {{incvar::hp}} {{decvar::hp}} {{hasvar::hp}} {{varexists::nope}}"
      + "{{deletevar::hp}} {{hasvar::hp}} {{setglobalvar::gold::3}}{{incglobalvar::gold}} {{getglobalvar::gold}} {{hasglobalvar::gold}}", ctx);
    expect(out).toBe("15 16 15 true false false 4 4 true");
    expect(ctx.vars!.has("hp")).toBe(false);
    expect(ctx.globals!.get("gold")).toBe("4");
  });

  it("addvar appends text and array items; missing numbers start at 0", () => {
    const ctx = base();
    expandMacros("{{addvar::n::3}}{{addvar::s::foo}}{{addvar::s::bar}}{{setvar::list::[\"a\"]}}{{addvar::list::b}}", ctx);
    expect(Object.fromEntries(ctx.vars!)).toEqual({ n: "3", s: "foobar", list: "[\"a\",\"b\"]" });
  });

  it("keys of objects and indexes of arrays", () => {
    const ctx = base();
    const out = expandMacros("{{setvarkey::inv::sword::1}}{{setvarkey::inv::potion::3}}{{getvarkey::inv::potion}} "
      + "{{setvarindex::party::0::Lyra}}{{setvarindex::party::1::Kael}}{{getvarindex::party::1}} {{getvar::party}}", ctx);
    expect(out).toBe("3 Kael [\"Lyra\",\"Kael\"]");
    expect(ctx.vars!.get("inv")).toBe("{\"sword\":\"1\",\"potion\":\"3\"}");
  });

  it("shorthands: .local and $global with operators", () => {
    const ctx = base();
    ctx.vars!.set("hp", "10");
    const out = expandMacros("{{.hp}} {{.hp++}} {{.hp--}} {{.hp += 5}}{{.hp}} {{.hp -= 3}}{{.hp}} {{.hp > 11}} {{.hp >= 12}} {{.hp < 3}} "
      + "{{.mood ?? calm}} {{.mood ??= tense}} {{.mood}} {{.empty = }}{{.empty || none}} {{.empty ?? none}} {{.name = Kael}}{{.name == Kael}} {{.name != Kael}} "
      + "{{$gold = 7}}{{$gold++}}", ctx);
    expect(out).toBe("10 11 10 15 12 true true false calm tense tense none  true false 8");
  });

  it("a default after ?? / || is only read when needed", () => {
    const ctx = base();
    ctx.vars!.set("a", "x");
    expandMacros("{{.a ?? {{incvar::count}}}}{{.b ?? {{incvar::count}}}}", ctx);
    expect(ctx.vars!.get("count")).toBe("1");
  });

  it("variable names can come from other macros", () => {
    const ctx = base();
    expect(expandMacros("{{setvar::{{char}}_mood::wary}}{{getvar::Lyra_mood}}", ctx)).toBe("wary");
  });
});

describe("{{if}}", () => {
  it("scoped blocks with else, inversion, nesting and bare macro names", () => {
    const ctx = { ...base(), personality: "" };
    expect(expandMacros("{{if description}}# Description\n{{description}}{{/if}}", ctx)).toBe("# Description\nA ranger.");
    expect(expandMacros("{{if personality}}has{{else}}none{{/if}}", ctx)).toBe("none");
    expect(expandMacros("{{if !personality}}No personality{{/if}}", ctx)).toBe("No personality");
    expect(expandMacros("A{{if 1}} {{if 0}}x{{else}}{{if yes}}deep{{/if}}{{/if}} {{/if}}B", ctx)).toBe("AdeepB");
    for (const v of ["", "false", "OFF", "0"]) expect(isFalsyMacroValue(v)).toBe(true);
  });

  it("variables and shorthands as conditions; only the chosen branch runs", () => {
    const ctx = base();
    ctx.vars!.set("met", "true");
    expect(expandMacros("{{if .met}}again{{else}}first{{/if}}", ctx)).toBe("again");
    expect(expandMacros("{{if {{getvar::met}}}}yes{{/if}}", ctx)).toBe("yes");
    expect(expandMacros("{{if $flag}}on{{else}}off{{/if}}", ctx)).toBe("off");
    // ours: a comparison straight in the condition is worked out (SillyTavern reads it as text)
    expect(expandMacros("{{if .hp > 5}}x{{else}}y{{/if}} {{if !.hp > 5}}x{{else}}y{{/if}}", { ...ctx, vars: new Map([["hp", "3"]]) })).toBe("y x");
    expandMacros("{{if 0}}{{setvar::touched::1}}{{else}}{{setvar::other::1}}{{/if}}", ctx);
    expect(ctx.vars!.has("touched")).toBe(false);
    expect(ctx.vars!.get("other")).toBe("1");
  });

  it("comparisons through a shorthand macro inside the condition", () => {
    const ctx = base();
    ctx.vars!.set("hp", "3");
    expect(expandMacros("{{if {{.hp < 5}}}}low{{else}}fine{{/if}}", ctx)).toBe("low");
  });

  it("inline form, and an {{if}} with no {{/if}} stays as written", () => {
    expect(expandMacros("{{if description::Has one}}|{{if personality::never}}", { ...base(), personality: "" })).toBe("Has one|");
    expect(expandMacros("{{if description}}open", base())).toBe("{{if description}}open");
  });
});

describe("other SillyTavern macros", () => {
  it("text helpers", () => {
    const ctx = base();
    expect(expandMacros("a{{space}}b{{space::3}}c{{newline::2}}d {{reverse::abc}} {{banned::\"x\"}}{{noop}}", ctx)).toBe("a b   c\n\nd cba ");
  });

  it("card, chat and generation details", () => {
    const ctx: MacroContext = {
      ...base(), card: { systemPrompt: "Main", postHistoryInstructions: "Jail", creatorNotes: "Notes", version: "2.1", firstMessages: ["Hi", "Alt"], depthPrompt: "Deep" },
      group: ["Lyra", "Kael"], maxContext: 32768, maxResponse: 1024, generationType: "swipe", lastMessageId: 7,
    };
    expect(expandMacros("{{charPrompt}}|{{charInstruction}}|{{charJailbreak}}|{{creatorNotes}}|{{charVersion}}|{{version}}|{{greeting}}|{{greeting::1}}|{{greeting::9}}|{{charDepthPrompt}}", ctx))
      .toBe("Main|Jail|Jail|Notes|2.1|2.1|Hi|Alt||Deep");
    expect(expandMacros("{{group}}|{{charIfNotGroup}}|{{notChar}}|{{maxPrompt}}|{{maxResponse}}|{{lastGenerationType}}|{{lastMessageId}}|{{isMobile}}", ctx))
      .toBe("Lyra, Kael|Lyra, Kael|Kael, Dan|32768|1024|swipe|7|false");
    expect(expandMacros("{{group}}", base())).toBe("Lyra");
  });

  it("time formats and offsets", () => {
    const now = new Date(2026, 10, 3, 14, 5, 9); // 3 Nov 2026, 14:05:09 local
    const ctx = { ...base(), now };
    expect(expandMacros("{{datetimeformat::YYYY-MM-DD HH:mm:ss}} {{datetimeformat::D/M/YY h:mm A [at] Do}}", ctx)).toBe("2026-11-03 14:05:09 3/11/26 2:05 PM at 3rd");
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60_000);
    const plus3 = new Date(utc.getTime() + 3 * 3_600_000);
    expect(expandMacros("{{time::UTC+3}}", ctx)).toBe(`${String(plus3.getHours()).padStart(2, "0")}:${String(plus3.getMinutes()).padStart(2, "0")}`);
  });

  it("macros inside a macro's result are read (a card's {{char}} inside {{description}})", () => {
    expect(expandMacros("{{description}}", { ...base(), description: "{{char}} hunts." })).toBe("Lyra hunts.");
  });

  it("odd braces stay readable", () => {
    expect(expandMacros("{{{char}}} {{unknown::{{user}}}} {{unclosed", base())).toBe("{Lyra} {{unknown::Dan}} {{unclosed");
  });
});
