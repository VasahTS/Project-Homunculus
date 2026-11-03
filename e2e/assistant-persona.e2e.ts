// Persona writes, approvals, draft saves and Open use the real Assistant UI with synthetic services. CODEX.
import { expect, test } from "@playwright/test";
test("Assistant creates a persona, opens its editor, undoes/restores and proposes edits", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error In-memory browser preview.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    let round = 0;
    svc.core.connections.stream = async function* () {
      if (round++ === 0) yield { toolCalls: [{ id: "persona-new", name: "create", arguments: JSON.stringify({ kind: "persona", data: { name: "Audit Rin", description: "An explorer.", placement: { position: "atDepth", depth: 7, role: "user" }, variants: [{ label: "Modern", description: "City explorer." }] } }) }] };
      else yield "Audit Rin is saved.";
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Create the persona."); await page.getByTestId("assistant-send").click();
  const result = page.getByTestId("assistant-result"); await expect(result).toContainText("Audit Rin");
  await expect(page.getByTestId("assistant-stop")).toHaveCount(0);
  await result.getByRole("button", { name: "Open", exact: true }).click();
  const editor = page.getByLabel("Persona editor", { exact: true });
  await expect(editor.getByLabel("Description", { exact: true })).toHaveValue("An explorer.");
  await expect(editor.getByLabel("Messages from the end")).toHaveValue("7");
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await result.getByRole("button", { name: "Undo", exact: true }).click(); await expect(result).toContainText("moved to the Trash");
  await result.getByRole("button", { name: "Restore", exact: true }).click(); await expect(result).toContainText("created");
  await page.evaluate(async () => {
    // @ts-expect-error In-memory browser preview.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    const p = (await svc.store.personas.list()).find((p: { name: string }) => p.name === "Audit Rin"); let round = 0;
    svc.core.connections.stream = async function* () {
      if (!round++) yield { toolCalls: [{ id: "persona-edit", name: "change", arguments: JSON.stringify({ id: `persona:${p.id}`, changes: { variants: { update: [{ label: "Modern", description: "City pilot." }] } } }) }] };
      else yield "Version change awaits approval.";
    };
  });
  await page.getByLabel("Message to the Assistant").fill("Change the Modern version."); await page.getByTestId("assistant-send").click();
  const proposal = page.getByTestId("assistant-result").last();
  await proposal.getByTestId("assistant-see-change").click(); await expect(proposal.locator("del")).toContainText("explorer");
  await proposal.getByTestId("assistant-apply").click(); await expect(proposal).toContainText("Applied");
});
test("persona drafts save through the shared contract", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Synthetic browser service.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    svc.core.connections.stream = async function* () { yield '```homunculus-persona\n{"name":"Draft Rin","description":"A cartographer."}\n```'; };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Draft a persona."); await page.getByTestId("assistant-send").click();
  await page.getByTestId("assistant-save-draft").click();
  await expect(page.getByTestId("assistant-result")).toContainText("Draft Rin");
  expect(await page.evaluate(async () => {
    // @ts-expect-error In-memory browser database.
    const { servicesReady } = await import("/src/core-instance.ts"); const { store } = await servicesReady;
    return (await store.personas.list()).find((p: { name: string }) => p.name === "Draft Rin")?.description;
  })).toBe("A cartographer.");
});
