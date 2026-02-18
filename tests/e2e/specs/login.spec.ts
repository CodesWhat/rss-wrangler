import { expect, test } from "@playwright/test";

test.describe("Login flow", () => {
  test("shows login page with form fields", async ({ page }) => {
    await page.goto("/login");

    // Page renders the brand and form
    await expect(page.locator(".brand-name")).toHaveText("RSS_WRANGLER");
    await expect(page.locator("label[for='username']")).toBeVisible();
    await expect(page.locator("label[for='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toHaveText("Sign in");
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#username", "nonexistent-user");
    await page.fill("#password", "wrong-password");
    await page.click("button[type='submit']");

    // The submit button should briefly show "Signing in..." then revert
    await expect(page.locator(".error-text")).toBeVisible({ timeout: 10_000 });
  });

  test("redirects authenticated users away from login", async ({ page }) => {
    // Pre-seed a refresh token so the app considers us logged in
    const apiBase = process.env.E2E_API_URL || "http://localhost:4315";
    const testUser = process.env.E2E_USERNAME || "admin";
    const testPass = process.env.E2E_PASSWORD || "adminadmin";

    const res = await fetch(`${apiBase}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser,
        password: testPass,
        tenantSlug: "default",
      }),
    });

    if (!res.ok) {
      test.skip(true, "Cannot login — API not available or credentials incorrect");
      return;
    }

    const tokens = await res.json();

    // Mock the refresh endpoint so the token isn't rotated/rate-limited
    await page.route("**/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(tokens),
      });
    });

    await page.addInitScript((args) => {
      localStorage.setItem("rss_refresh_token", args.refreshToken);
      localStorage.setItem("rss_logged_in", "1");
    }, tokens);

    await page.goto("/login");

    // Should redirect to home (/) since we are already authenticated
    await expect(page).toHaveURL("/", { timeout: 10_000 });
  });

  test("has links to forgot password and signup", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
    await expect(page.locator('a[href="/signup"]')).toBeVisible();
    await expect(page.locator('a[href="/resend-verification"]')).toBeVisible();
  });
});
