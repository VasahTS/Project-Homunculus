// Assistant → tracker editor: filling instructions and story meaning stay in their own text areas. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";
import { openLibrary } from "./ui.ts";

test("Assistant-created Quest retains help and note in the matching tracker editor fields", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Browser preview module; uses synthetic tool calls, never a real provider.
    const { servicesReady } = await import("/src/core-instance.ts");
    const svc = await servicesReady;
    let n = 0;
    svc.core.connections.stream = async function* (_conn: unknown, _messages: unknown, _signal: AbortSignal, req: { rich: Array<{ role: string; content: string }> }) {
      const step = n++;
      if (step === 0) { yield { toolCalls: [{ id: "guide-tracker", name: "guide", arguments: JSON.stringify({ kind: "tracker" }) }] }; return; }
      if (step === 1) {
        const guide = req.rich.find(t => t.role === "tool")?.content ?? "";
        if (!guide.includes('help: "What the AI should write here — and when to leave it empty"') || !guide.includes('note: "What it means in the story"')) throw new Error("Tracker field context missing from model request");
        yield { toolCalls: [{ id: "create-quest", name: "create", arguments: JSON.stringify({ kind: "tracker", data: {
          name: "Quest Context", fields: [{ label: "Quest", type: "text", scope: "global", section: "Adventure", display: "block", icon: "scroll",
            help: "Write the accepted quest and known objectives. Leave empty when no quest is active.",
            note: "The quest is a commitment whose stakes guide the party's choices.",
          },
          { label: "Time", type: "text", scope: "global", section: "Adventure", display: "header", icon: "clock", help: "Current in-world time." },
          { label: "Mood", type: "text", scope: "perCharacter", section: "Adventure", display: "pill", icon: "smile", help: "Current mood, only when known." },
          { label: "Health", type: "meter", scope: "perCharacter", section: "Adventure", display: "tile", icon: "heart", min: 0, max: 100, help: "Known health, 0–100." },
          { label: "Inventory", type: "list", scope: "perCharacter", section: "Adventure", display: "block", icon: "bag", help: "What they carry.", fields: [
            { label: "Item", type: "text", help: "Name of the item." }, { label: "Quantity", type: "number", min: 0, help: "How many." },
          ] }],
        } }) }] }; return;
      }
      yield "Quest Context created.";
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Create a Quest tracker with instructions and story meaning.");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-result")).toContainText("Quest Context");
  await expect(page.getByTestId("assistant-reply")).toContainText("Quest Context created.");
  await page.getByRole("tab", { name: "Play", exact: true }).click();
  await openLibrary(page, "Trackers");
  await page.getByTestId("tracker-list").getByRole("button", { name: /Quest Context/ }).click();
  await page.getByRole("button", { name: "Open All", exact: true }).click();
  await expect(page.getByLabel("Field 1 hint", { exact: true })).toHaveValue("Write the accepted quest and known objectives. Leave empty when no quest is active.");
  await expect(page.getByLabel("Field 1 story note", { exact: true })).toHaveValue("The quest is a commitment whose stakes guide the party's choices.");
  await expect(page.getByRole("radiogroup", { name: "Field 1 show as", exact: true }).getByRole("radio", { name: "Row", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Field 1 icon", { exact: true })).toHaveValue("scroll");
  await expect(page.getByRole("radiogroup", { name: "Field 2 show as", exact: true }).getByRole("radio", { name: "Top strip", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "Field 3 show as", exact: true }).getByRole("radio", { name: "Highlight", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "Field 4 show as", exact: true }).getByRole("radio", { name: "Tile", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Field 5 column 1 name", { exact: true })).toHaveValue("Item");
  await expect(page.getByLabel("Field 5 column 2 hint", { exact: true })).toHaveValue("How many.");
});
