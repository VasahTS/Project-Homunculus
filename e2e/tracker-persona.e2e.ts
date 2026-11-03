// Persona source in the actual tracker request, with synthetic browser data. Author: CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";
import { openLibrary, openSession, send, setTracker } from "./ui.ts";

for (const position of ["inPrompt", "atDepth"] as const) {
  test(`Characters receives the selected persona when placed at ${position}`, async ({ page }) => {
    await page.goto("/");
    await openLibrary(page, "Personas");
    await page.getByRole("button", { name: "New Persona" }).click();
    const editor = page.getByLabel("Persona editor");
    await editor.getByLabel("Name", { exact: true }).fill("Mira");
    await editor.getByLabel("Description").fill("A courier with silver hair and green eyes, 183 cm tall.");
    await editor.getByLabel("Place in the prompt").selectOption(position);
    if (position === "atDepth") await editor.getByLabel("Messages from the end").fill("1");
    await page.getByRole("button", { name: "Create Persona" }).click();
    await expect(page.getByTestId("persona-list")).toContainText("Mira");
    await openSession(page);
    await expect(page.getByTestId("who-button")).toContainText("as Mira");
    await setTracker(page, "Scene: Characters");
    await send(page, "I approach the mill.");
    const run = page.locator('[data-testid="run-log"][data-tracker="scene-characters"]');
    await expect(run.getByTestId("run-status")).toHaveText("✓ updated");
    const prompts = await page.evaluate(async () => {
      // @ts-expect-error In-memory Vite browser services; never the native/personal database.
      const { servicesReady } = await import("/src/core-instance.ts");
      const { store } = await servicesReady;
      const session = (await store.listSessions())[0];
      const roots = await store.childrenOf(session.id, null);
      const path = [roots[0]];
      for (;;) {
        const children = await store.childrenOf(session.id, path.at(-1).id);
        if (!children.length) break;
        path.push(children[0]);
      }
      const reply = path.at(-1);
      return { agent: (await store.listAgentRuns(reply.id)).find((r: { agentId: string }) => r.agentId === "scene-characters")?.prompt,
        main: (await store.getGenerationRecord(reply.id))?.prompt };
    });
    expect(JSON.stringify(prompts.main)).toContain("silver hair and green eyes, 183 cm tall");
    expect(prompts.agent?.at(-1)?.content).toContain("## The user's character (persona)\nMira: A courier with silver hair and green eyes, 183 cm tall.");
    expect(prompts.agent?.at(-1)?.content).toContain("### Lyra");
  });
}
