// Macro variables that last (D-146): local ones in the world state ("vars"), swipe-safe; global ones in the app.
import { describe, expect, it } from "vitest";
import { GLOBAL_VARS_KEY, type ChatTurn } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const sentText = (p: ChatTurn[]) => p.map((t) => t.content).join("\n");

async function setup(description: string) {
  const w = await world(() => "ok");
  await w.store.saveCharacter({ id: "lyra", name: "Lyra", description, firstMessages: ["Who's there?"] });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  return { w, session, first: firstMessage! };
}

describe("macro variables across turns", () => {
  it("local variables carry to the next reply; a swipe starts from the same place", async () => {
    const { w, session, first } = await setup("Visit {{incvar::visits}}: {{if .met}}again{{else}}first time{{/if}}{{.met = true}}");
    const { userMessage, reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(sentText(w.ai.prompts[0]!)).toContain("Visit 1: first time");
    expect((await w.core.state.resolve(session.id, userMessage.id)).vars).toEqual({ visits: "1", met: "true" });

    await w.chat.generate(session.id, userMessage.id, connection); // swipe
    expect(sentText(w.ai.prompts[1]!)).toContain("Visit 1: first time");
    expect((await w.core.state.resolve(session.id, userMessage.id)).vars).toEqual({ visits: "1", met: "true" });

    await w.chat.send(session.id, reply.id, "Again", connection);
    expect(sentText(w.ai.prompts[2]!)).toContain("Visit 2: again");
  });

  it("a swipe replaces what the try before it wrote, and a branch keeps its own values", async () => {
    // the global counter goes up on every try (like SillyTavern); only the first try sets "firstOnly"
    const { w, session, first } = await setup("{{incglobalvar::tries}}{{if $tries == 1}}{{setvar::firstOnly::x}}{{/if}}{{setvar::try::{{$tries}}}}");
    const { userMessage } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect((await w.core.state.resolve(session.id, userMessage.id)).vars).toEqual({ firstOnly: "x", try: "1" });
    await w.chat.generate(session.id, userMessage.id, connection);
    expect((await w.core.state.resolve(session.id, userMessage.id)).vars).toEqual({ try: "2" });
    expect(await w.store.getAppSetting(GLOBAL_VARS_KEY)).toEqual({ tries: "2" });

    // another message from the opening: a branch with its own variables, the first branch unchanged
    const other = await w.chat.send(session.id, first.id, "Hello?", connection);
    expect((await w.core.state.resolve(session.id, other.userMessage.id)).vars).toEqual({ try: "3" });
    expect((await w.core.state.resolve(session.id, userMessage.id)).vars).toEqual({ try: "2" });
  });

  it("deleting a variable is kept too, and {{state.vars.x}} reads the same values", async () => {
    const { w, session, first } = await setup("[{{state.vars.flag}}]{{if .flag}}{{deletevar::flag}}{{else}}{{setvar::flag::on}}{{/if}}");
    const one = await w.chat.send(session.id, first.id, "a", connection);
    expect(sentText(w.ai.prompts[0]!)).toContain("[]");
    const two = await w.chat.send(session.id, one.reply.id, "b", connection);
    expect(sentText(w.ai.prompts[1]!)).toContain("[on]");
    expect((await w.core.state.resolve(session.id, two.userMessage.id)).vars).toBeUndefined();
  });

  it("Preview Prompt shows the variables but changes nothing", async () => {
    const { w, session, first } = await setup("Count {{incvar::n}} {{incglobalvar::g}}");
    const preview = await w.chat.turns.previewPrompt(session.id, first.id, connection);
    expect(preview.parts.map((p) => p.content).join("\n")).toContain("Count 1 1");
    expect("variables" in preview).toBe(false);
    expect((await w.core.state.resolve(session.id, first.id)).vars).toBeUndefined();
    expect(await w.store.getAppSetting(GLOBAL_VARS_KEY)).toBeUndefined();
  });
});
