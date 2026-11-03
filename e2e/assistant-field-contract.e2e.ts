// Assistant field audit: a draft's fence and target kind must agree before anything is written. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";

test("a draft with a mismatched target kind cannot edit a different item sharing the same id", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Synthetic in-memory browser services, never a real provider.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    await svc.store.saveCharacter({ id: "shared-audit", name: "Shared" });
    await svc.store.saveNarrator({ id: "shared-audit", name: "Shared" });
    svc.core.connections.stream = async function* () {
      yield '```homunculus-narrator\n{"id":"character:shared-audit","name":"Wrong target"}\n```';
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Draft an edit.");
  await page.getByTestId("assistant-send").click();
  const draft = page.getByTestId("assistant-draft");
  await draft.getByTestId("assistant-save-draft").click();
  await expect(draft).toContainText("does not match");
  expect(await page.evaluate(async () => {
    // @ts-expect-error Synthetic browser service.
    const { servicesReady } = await import("/src/core-instance.ts"); const { store } = await servicesReady;
    return [(await store.getCharacter("shared-audit")).name, (await store.narrators.get("shared-audit")).name];
  })).toEqual(["Shared", "Shared"]);
});

test("approved Assistant edits preserve narrator, Kit, lorebook and note settings", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error In-memory browser services with synthetic items.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    await svc.store.saveNarrator({ id: "audit-n", name: "Audit narrator", mayAddNpcs: false, turnInstruction: "Do not skip time." });
    await svc.store.saveCharacter({ id: "audit-c", name: "Audit character", characterNote: { text: "Old.", depth: 12, role: "user" }, variants: [{ id: "audit-v", label: "Modern", overrides: { scenario: "City." } }] });
    await svc.store.saveLorebook({ id: "audit-l", name: "Audit lore", entries: [{ id: "audit-e", title: "Gate", keys: ["gate"], content: "Closed.", scan: { scenario: true } }] });
    const cast = [{ characterId: "audit-c", variantId: "audit-v", presence: "offscreen", tracked: false, muted: true, sheet: "Keep this sheet." }];
    await svc.store.kits.save({ id: "audit-k", name: "Audit Kit", createdAt: 1, cast, setup: { lorebooks: { mode: "only", add: [], remove: ["excluded"] } } });
    let n = 0;
    svc.core.connections.stream = async function* () {
      if (n++ === 0) {
        const changes = [
          { id: "narrator:audit-n", changes: { pov: "second person" } },
          { id: "kit:audit-k", changes: { cast, lorebookIds: ["audit-l"] } },
          { id: "lorebook:audit-l", changes: { entries: { update: [{ id: "audit-e", probability: 35, conditions: [{ path: "world.gate", op: "equals", value: "open" }] }] } } },
          { id: "character:audit-c", changes: { characterNote: { text: "New note." } } },
        ];
        yield { toolCalls: changes.map((a, i) => ({ id: `change-${i}`, name: "change", arguments: JSON.stringify(a) })) }; return;
      }
      yield "Four changes are ready for approval.";
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Prepare the four edits.");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-result")).toHaveCount(4);
  await page.getByTestId("assistant-apply-all").click();
  await expect(page.getByTestId("assistant-result").filter({ hasText: "Applied" })).toHaveCount(4);
  const saved = await page.evaluate(async () => {
    // @ts-expect-error Synthetic browser service.
    const { servicesReady } = await import("/src/core-instance.ts"); const { store } = await servicesReady;
    const n = await store.narrators.get("audit-n"), k = await store.kits.get("audit-k");
    const l = await store.lorebooks.get("audit-l"), c = await store.getCharacter("audit-c");
    return { npcPermission: n.mayAddNpcs, lastInstruction: n.turnInstruction, pov: n.style.pov, member: k.cast[0], lore: k.setup.lorebooks, entry: l.entries[0], note: c.characterNote };
  });
  expect(saved).toMatchObject({ npcPermission: false, lastInstruction: "Do not skip time.", pov: "second person", member: { variantId: "audit-v", presence: "offscreen", tracked: false, muted: true, sheet: "Keep this sheet." }, lore: { mode: "only", add: ["audit-l"], remove: ["excluded"] }, entry: { probability: 35, conditions: [{ path: "world.gate", op: "equals", value: "open" }], scan: { scenario: true } }, note: { text: "New note.", depth: 12, role: "user" } });
});
