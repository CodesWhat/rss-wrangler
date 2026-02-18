import { expect, test } from "../fixtures/auth";

// SearchBar lives in the mobile topbar, hidden at >= 1024px.
// Use a narrow viewport so it's visible.
test.use({ viewport: { width: 768, height: 1024 } });

test.describe("Search", () => {
  test("search input is present in the nav", async ({ authedPage: page }) => {
    const searchInput = page.locator('input[aria-label="Search stories"]');
    await expect(searchInput).toBeVisible();
  });

  test("typing a query shows scope selectors", async ({ authedPage: page }) => {
    const searchInput = page.locator('input[aria-label="Search stories"]');
    await searchInput.click();
    await searchInput.fill("test query");

    // Scope selectors appear when a non-empty query is entered
    const folderScope = page.locator('[aria-label="Search folder scope"]');
    const sourceScope = page.locator('[aria-label="Search source scope"]');

    await expect(folderScope).toBeVisible({ timeout: 5_000 });
    await expect(sourceScope).toBeVisible({ timeout: 5_000 });
  });

  test("search shows results dropdown or no-results message", async ({ authedPage: page }) => {
    const searchInput = page.locator('input[aria-label="Search stories"]');
    await searchInput.click();
    await searchInput.fill("test");

    // Wait for the debounce (300ms) plus network time
    const dropdown = page.locator("#search-results-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });

    // The dropdown should contain either story cards or a "No results" message
    const hasCards = await dropdown.locator(".story-card, article").count();
    const noResults = await dropdown.getByText("No results found.").count();

    expect(hasCards > 0 || noResults > 0).toBe(true);
  });

  test("pressing Escape closes the search dropdown", async ({ authedPage: page }) => {
    const searchInput = page.locator('input[aria-label="Search stories"]');
    await searchInput.click();
    await searchInput.fill("test");

    // Wait for dropdown to appear
    const dropdown = page.locator("#search-results-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(dropdown).not.toBeVisible();
  });
});
