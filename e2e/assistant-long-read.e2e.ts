// A large card survives real UI continuations without overlap, lost page bodies or cursor arithmetic. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";

test("a 13k character card reads in three exact pages across user continuations", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Synthetic browser preview services.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    // @ts-expect-error Browser preview module.
    const { loadSettings, saveSettings } = await import("/src/assistant/engine.ts");
    const settings = await loadSettings(svc.store);
    await saveSettings(svc.store, { ...settings, assistants: settings.assistants.map((a: Record<string, unknown>) => ({ ...a, maxSteps: 1 })) });
    await svc.store.saveCharacter({ id: "long-read", name: "Large audit card", description: "x".repeat(13000) });
    svc.core.connections.stream = async function* (_c: unknown, _m: unknown, _s: AbortSignal, req: { rich: Array<{ role: string; content: string }> }) {
      const pages = req.rich.filter(t => t.role === "tool").map(t => JSON.parse(t.content));
      const last = pages.at(-1);
      if (last?._read[0].done) {
        if (pages.map(p => p.description).join("") !== "x".repeat(13000)) throw new Error("Source pages were lost or overlapped");
        yield "Read all 13000 characters in 3 complete pages."; return;
      }
      const args = last?._read[0].next ?? { id: "character:long-read", fields: ["description"], offset: 0 };
      yield { toolCalls: [{ id: crypto.randomUUID(), name: "read", arguments: JSON.stringify(args) }] };
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Message to the Assistant").fill(i ? "Continue." : "Read the large card's description.");
    await page.getByTestId("assistant-send").click();
    await expect(page.getByTestId("assistant-reply")).toHaveCount(i + 1);
    await expect(page.getByTestId("assistant-reply").last()).toContainText(i < 2 ? "Stopped after 1 steps" : "Read all 13000 characters in 3 complete pages.");
    await expect(page.getByTestId("assistant-stop")).toHaveCount(0);
  }
  const saved = await page.evaluate(async () => {
    // @ts-expect-error In-memory browser database only.
    const { servicesReady } = await import("/src/core-instance.ts"); const { store } = await servicesReady;
    // @ts-expect-error Browser preview module.
    const { listChats, loadChat } = await import("/src/assistant/engine.ts");
    const chat = await loadChat(store, (await listChats(store))[0].id);
    return { offsets: chat.messages.flatMap((m: { steps: Array<{ name: string; args: string }> }) => m.steps).filter((s: { name: string }) => s.name === "read").map((s: { args: string }) => JSON.parse(s.args).offset ?? 0), description: (await store.getCharacter("long-read")).description };
  });
  expect(saved.offsets).toEqual([0, 6000, 12000]); expect(saved.description).toBe("x".repeat(13000));
  await expect(page.getByTestId("assistant-result")).toHaveCount(0);
});
