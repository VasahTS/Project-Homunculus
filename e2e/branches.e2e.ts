// Click tests of branches and the message action bar (D-032, canvas "Homunculus 2 — Branches"). Author: CLAUDE, 2026-10-29.
// v2 (29/10, after Daniel's test): branches are direct, like SillyTavern and Marinara — Branch from here puts you on
// the new branch at once; a branch can be made inside a branch.
import { expect, test, type Page } from "@playwright/test";

async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder(/Write your message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("turn-status")).toHaveCount(0, { timeout: 10_000 });
}

const msgs = (page: Page) => page.getByTestId("message");

async function renameCurrent(page: Page, name: string) {
  await page.getByTestId("branch-button").click();
  const row = page.getByTestId("branch-list").getByTestId("branch-row").first();
  await row.getByRole("button", { name: /^Rename / }).click();
  await page.getByTestId("branch-list").locator(".branch-rename").fill(name);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("branch-button")).toContainText(name);
}

/** Greeting → A1 → reply → A2 → reply, then "Dark path" branched from the first reply with B1 → reply. */
async function twoBranches(page: Page) {
  await page.goto("/");
  await sendMessage(page, "A1");
  await sendMessage(page, "A2");
  await expect(msgs(page)).toHaveCount(5);
  await msgs(page).nth(2).getByRole("button", { name: "Branch from here" }).click();
  // at once: on the new branch, ending at the message it was made from; no form, no banner
  await expect(page.getByTestId("branch-button")).toContainText("Branch 2");
  await expect(msgs(page)).toHaveCount(3);
  await expect(page.getByTestId("branch-pending")).toHaveCount(0);
  await renameCurrent(page, "Dark path");
  await sendMessage(page, "B1");
  await expect(page.getByTestId("branch-button")).toContainText("Dark path");
}

test("Branch from here puts you on the new branch at once, and the marker shows where it splits", async ({ page }) => {
  await twoBranches(page);
  await expect(msgs(page)).toHaveCount(5);
  await expect(msgs(page).nth(3)).toContainText("B1");
  const marker = page.getByTestId("fork-marker");
  await expect(marker).toHaveCount(1);
  await expect(marker).toContainText("The story splits here · 2 branches");

  await marker.click();
  await page.getByRole("region", { name: "Branches from here" }).getByRole("button", { name: "Go" }).click();
  await expect(page.getByTestId("branch-button")).toContainText("Main");
  await expect(msgs(page).nth(3)).toContainText("A2");

  await page.getByTestId("branch-button").click();
  const list = page.getByTestId("branch-list");
  await expect(list.getByTestId("branch-row")).toHaveCount(2);
  await expect(list.getByTestId("branch-row").first()).toContainText("you are here");
  await list.getByTestId("branch-row").filter({ hasText: "Dark path" }).locator(".branch-t").click();
  await expect(msgs(page).nth(3)).toContainText("B1");
});

test("Branch from here on the last message: a new branch right away; what you do next stays in it", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "Status");
  await msgs(page).last().getByRole("button", { name: "Branch from here" }).click();
  await expect(page.getByTestId("branch-button")).toContainText("Branch 2");
  await expect(msgs(page)).toHaveCount(3);
  // a new version here is only this branch's
  await msgs(page).last().getByRole("button", { name: "New Version" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("turn-status")).toHaveCount(0, { timeout: 10_000 });
  await sendMessage(page, "I draw my sword");
  await expect(msgs(page)).toHaveCount(5);
  await expect(page.getByTestId("fork-marker")).toContainText("2 branches");

  await page.getByTestId("branch-button").click();
  await page.getByTestId("branch-list").getByTestId("branch-row").filter({ hasText: "Main" }).locator(".branch-t").click();
  await expect(msgs(page)).toHaveCount(3);
  await expect(page.getByTestId("swipe-counter")).toHaveCount(0); // Branch 2's version is not Main's
  // Main goes on by itself
  await sendMessage(page, "I lower my bow");
  await expect(page.getByTestId("branch-button")).toContainText("Main");
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("branch-row")).toHaveCount(2);
});

test("a branch inside a branch, and from your own message (then Get a Reply)", async ({ page }) => {
  await twoBranches(page);
  // inside Dark path, from B1 (your message)
  await msgs(page).nth(3).getByRole("button", { name: "Branch from here" }).click();
  await expect(page.getByTestId("branch-button")).toContainText("Branch 2"); // the next free name ("Dark path" was Branch 2)
  await expect(msgs(page)).toHaveCount(4);
  await msgs(page).last().getByRole("button", { name: "Get a Reply" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(msgs(page)).toHaveCount(5);
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("branch-row")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fork-marker")).toHaveCount(2);
});

test("New Version keeps you on the same branch (versions are not branches)", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "Question");
  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2", { timeout: 10_000 });
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByTestId("swipe-counter")).toHaveText("1/2");
  await sendMessage(page, "Follow-up on version 1");
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("branch-row")).toHaveCount(1);
});

test("deleting a branch removes only its own messages; the branch on screen can't be deleted", async ({ page }) => {
  await twoBranches(page);
  await page.getByTestId("branch-button").click();
  const list = page.getByTestId("branch-list");
  await expect(list.getByRole("button", { name: "Delete Dark path (switch to another branch first)" })).toBeDisabled();
  await list.getByRole("button", { name: "Delete Main" }).click();
  await expect(page.getByTestId("branch-delete-confirm")).toContainText("Delete Main for good?");
  await expect(page.getByTestId("branch-delete-confirm")).toContainText("Its 2 own messages");
  await page.getByRole("button", { name: "Delete Forever" }).click();
  await expect(list.getByTestId("branch-row")).toHaveCount(1);
  await page.getByTestId("branch-button").click();
  await expect(list).toHaveCount(0);
  await expect(page.getByTestId("fork-marker")).toHaveCount(0);
  await expect(msgs(page).nth(3)).toContainText("B1");
});

test("deleting a message in a branch leaves the other branches' messages alone", async ({ page }) => {
  await twoBranches(page);
  // on Dark path, delete from message 2 (shared with Main): only Dark path's own messages go
  await msgs(page).nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("message-delete-confirm")).toContainText("Other branches keep the messages they use");
  await page.getByRole("button", { name: "Delete Forever" }).click();
  await expect(msgs(page)).toHaveCount(1);
  await page.getByTestId("branch-button").click();
  await page.getByTestId("branch-list").getByTestId("branch-row").filter({ hasText: "Main" }).locator(".branch-t").click();
  await expect(msgs(page)).toHaveCount(5);
  await expect(msgs(page).nth(3)).toContainText("A2");
});

test("the tree shows every branch and goes to a message", async ({ page }) => {
  await twoBranches(page);
  await page.getByTestId("branch-button").click();
  await page.getByTestId("show-tree").click();
  const tree = page.getByTestId("tree-sheet");
  await expect(tree).toContainText("Tree · 2 branches");
  await expect(tree.getByText("splits · 2 branches")).toBeVisible();
  await tree.getByTestId("tree-node").filter({ hasText: /^4 · You/ }).filter({ hasText: "A2" }).click();
  await expect(tree.getByText("Message 4 · Main")).toBeVisible();
  await page.getByTestId("tree-go").click();
  await expect(tree).toHaveCount(0);
  await expect(page.getByTestId("branch-button")).toContainText("Main");
  await expect(msgs(page).nth(3)).toContainText("A2");
});

test("message actions: edit, hide from the AI, delete with what comes after", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "First try");
  await sendMessage(page, "Second");
  await expect(msgs(page)).toHaveCount(5);

  await msgs(page).nth(1).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit the message").fill("First try, edited");
  await page.getByTestId("save-edit").click();
  await expect(msgs(page).nth(1)).toContainText("First try, edited");

  await msgs(page).nth(1).getByRole("button", { name: "Hide from the AI" }).click();
  await expect(msgs(page).nth(1).getByTestId("hidden-tag")).toBeVisible();
  await msgs(page).nth(1).getByRole("button", { name: "Show to the AI" }).click();
  await expect(msgs(page).nth(1).getByTestId("hidden-tag")).toHaveCount(0);

  await msgs(page).nth(3).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("message-delete-confirm")).toContainText("Delete this message and the 1 after it for good?");
  await page.getByRole("button", { name: "Delete Forever" }).click();
  await expect(msgs(page)).toHaveCount(3);
});

test("Make a Separate Chat copies the branch into a new chat", async ({ page }) => {
  await twoBranches(page);
  await page.getByTestId("branch-button").click();
  await page.getByRole("button", { name: "Make a Separate Chat" }).click();
  await expect(page.locator(".title-btn")).toHaveText("Session with Lyra · Dark path");
  await expect(msgs(page)).toHaveCount(5);
  await expect(msgs(page).nth(3)).toContainText("B1");
  await expect(page.getByTestId("fork-marker")).toHaveCount(0);
});

test("the branch list stays inside its edges with long lines", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "A very long message so that the last line of this branch is much wider than the list of branches can show at once");
  await page.getByTestId("branch-button").click();
  const list = page.getByTestId("branch-list");
  const pop = (await list.boundingBox())!;
  for (const row of await list.getByTestId("branch-row").all()) {
    const r = (await row.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(pop.x + pop.width + 0.5);
  }
});
