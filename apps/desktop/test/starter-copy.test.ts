// Starter copy refresh preserves saved instructions, user edits and deleted examples. CODEX, 2026-11-05.
import { expect, it, vi } from "vitest";
import { newTestStore } from "../../../packages/core/test/helpers.ts";
import { installStarterAgents, STARTER_AGENTS } from "../src/agents.ts";

it("refreshes only original starter descriptions and is idempotent", async () => {
  const { store } = await newTestStore();
  await installStarterAgents(store);
  const polisher = (await store.agentConfigs.get("starter-prose-polisher"))!;
  const saved = await store.saveAgentConfig({
    ...polisher,
    name: "My polisher",
    prompt: "Keep these custom instructions.",
    help: "Rewrites each reply to remove repeated phrases and stock wording. An example; it will be redone later.",
  });
  const choices = (await store.agentConfigs.get("starter-cyoa-choices"))!;
  await store.saveAgentConfig({ ...choices, help: "My own description." });
  const userCopy = (await store.agentConfigs.get("starter-continuity"))!;
  await store.saveAgentConfig({ ...userCopy, source: { kind: "user" } });
  await store.agentConfigs.delete("starter-class-chat");

  const save = vi.spyOn(store, "saveAgentConfig");
  await installStarterAgents(store);
  expect(await store.agentConfigs.get(saved.id)).toEqual({
    ...saved,
    help: STARTER_AGENTS.find((a) => a.id === saved.id)!.help,
  });
  expect((await store.agentConfigs.get(choices.id))!.help).toBe("My own description.");
  expect(await store.agentConfigs.get(userCopy.id)).toEqual({ ...userCopy, source: { kind: "user" } });
  expect(await store.agentConfigs.get("starter-class-chat")).toBeUndefined();
  expect(save).toHaveBeenCalledTimes(1);
  await installStarterAgents(store);
  expect(save).toHaveBeenCalledTimes(1);
});
