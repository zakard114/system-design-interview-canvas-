import { expect, test, type Page } from "@playwright/test";

async function waitForWorkspace(page: Page) {
  await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("canvas-surface")).toBeVisible();
}

test("two-session: candidate sticky appears for interviewer", async ({ browser }) => {
  const interviewer = await browser.newContext();
  const candidate = await browser.newContext();
  const pageA = await interviewer.newPage();
  const pageB = await candidate.newPage();

  await pageA.goto("/");
  await pageA.getByTestId("home-display-name").fill("Interviewer");
  await pageA.getByTestId("create-session").click();
  await waitForWorkspace(pageA);

  const joinHref = await pageA.getByTestId("join-link").innerText();
  const match = joinHref.match(/https?:\/\/\S+\/s\/[A-Za-z0-9_-]+/);
  expect(match, `join link not found in: ${joinHref}`).toBeTruthy();
  const joinUrl = match![0];

  await pageB.goto(joinUrl);
  await pageB.getByTestId("join-display-name").fill("Candidate");
  await pageB.getByTestId("enter-canvas").click();
  await waitForWorkspace(pageB);

  await pageB.getByRole("button", { name: "Sticky note" }).click();
  const canvas = pageB.getByTestId("canvas-surface");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.click({
    position: { x: Math.floor(box!.width * 0.45), y: Math.floor(box!.height * 0.4) },
  });

  await expect(pageB.getByTestId("canvas-sticky")).toHaveCount(1, { timeout: 30_000 });
  await expect(pageA.getByTestId("canvas-sticky")).toHaveCount(1, { timeout: 45_000 });

  await interviewer.close();
  await candidate.close();
});
