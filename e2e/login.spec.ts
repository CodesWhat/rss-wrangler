import { expect, test } from "@playwright/test";
import { login, TEST_USER } from "./helpers";

test.describe("Login flow", () => {
  test("shows login page with branding", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("RSS_WRANGLER")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login", { timeout: 10_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("logs in with valid credentials and redirects to home", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL("/");
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrong_pass_123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator(".error-text")).toBeVisible();
  });
});
