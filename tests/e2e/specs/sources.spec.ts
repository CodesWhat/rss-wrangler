import { expect, test } from "../fixtures/auth";

test.describe("Sources page", () => {
  test("renders sources page with title", async ({ authedPage: page }) => {
    await page.goto("/sources");
    await expect(page.locator(".page-title")).toHaveText("Sources");
  });

  test("shows feed table or empty state", async ({ authedPage: page }) => {
    await page.goto("/sources");

    // Wait for loading to finish
    await page.waitForSelector('.feed-table, p:has-text("No feeds added yet")', {
      timeout: 15_000,
    });

    const feedTable = page.locator(".feed-table");
    const emptyState = page.getByText("No feeds added yet");

    const hasTable = await feedTable.isVisible();
    const hasEmpty = await emptyState.isVisible();

    expect(hasTable || hasEmpty).toBe(true);
  });

  test("add feed form has URL input and submit button", async ({ authedPage: page }) => {
    await page.goto("/sources");

    const urlInput = page.locator('input[aria-label="Feed URL"]');
    await expect(urlInput).toBeVisible({ timeout: 10_000 });
    await expect(urlInput).toHaveAttribute("placeholder", "https://example.com/feed.xml");
    await expect(urlInput).toHaveAttribute("type", "url");

    const submitBtn = page.locator(".add-feed-form button[type='submit']");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveText("Add & import");
  });

  test("OPML import and export controls exist", async ({ authedPage: page }) => {
    await page.goto("/sources");

    // OPML file input
    const opmlInput = page.locator('input[aria-label="OPML file to import"]');
    await expect(opmlInput).toBeVisible({ timeout: 10_000 });

    // Export OPML button
    const exportBtn = page.getByText("Export OPML");
    await expect(exportBtn).toBeVisible();
  });

  test("initial import window selector is present", async ({ authedPage: page }) => {
    await page.goto("/sources");

    const importWindow = page.locator('[aria-label="Initial import window"]');
    await expect(importWindow).toBeVisible({ timeout: 10_000 });

    // Default should be 7d
    await expect(importWindow).toHaveValue("7d");
  });
});
