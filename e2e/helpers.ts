import type { Page } from "@playwright/test";

/**
 * Test credentials — override via E2E_EMAIL / E2E_PASSWORD env vars.
 * Assumes a seeded user exists in the dev database.
 */
export const TEST_USER = {
  email: process.env.E2E_EMAIL ?? "admin@localhost",
  password: process.env.E2E_PASSWORD ?? "admin12345678",
};

/**
 * Log in through the UI login form.
 * After successful login the page navigates to "/".
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/", { timeout: 10_000 });
}

/**
 * Inject auth tokens directly via API so protected pages
 * can be visited without going through the login form every time.
 */
export async function loginViaApi(page: Page): Promise<void> {
  const apiBase = process.env.E2E_API_BASE ?? "http://localhost:4000";

  const response = await page.request.post(`${apiBase}/v1/auth/login`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`API login failed: ${response.status()} ${response.statusText()}`);
  }

  const tokens = await response.json();

  await page.goto("/login");
  await page.evaluate(
    ({ refreshToken }) => {
      localStorage.setItem("rss_refresh_token", refreshToken);
      localStorage.setItem("rss_logged_in", "1");
    },
    { refreshToken: tokens.refreshToken },
  );

  await page.goto("/");
  await page.waitForURL("/", { timeout: 10_000 });
}
