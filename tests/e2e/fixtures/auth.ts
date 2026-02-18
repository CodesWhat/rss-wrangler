import { test as base, type Page } from "@playwright/test";

const API_BASE = process.env.E2E_API_URL || "http://localhost:4315";
const _WEB_API_BASE = process.env.E2E_WEB_API_URL || "http://localhost:4000";
const TEST_USER = process.env.E2E_USERNAME || "admin";
const TEST_PASS = process.env.E2E_PASSWORD || "adminadmin";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

// Cache tokens across tests — safe because we mock the refresh endpoint
// so the real API never rotates them.
let cachedTokens: AuthTokens | null = null;

async function loginViaAPI(): Promise<AuthTokens> {
  if (cachedTokens) return cachedTokens;

  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: TEST_USER,
      password: TEST_PASS,
      tenantSlug: "default",
    }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  cachedTokens = (await res.json()) as AuthTokens;
  return cachedTokens;
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    const tokens = await loginViaAPI();

    // Mock the refresh endpoint so the browser never hits the real API
    // (which would rotate the token and invalidate it for the next test).
    // Match both the Docker-internal URL and the external test URL.
    await page.route("**/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(tokens),
      });
    });

    // Set tokens in localStorage before navigating — mirrors the keys
    // used by apps/web/src/lib/api.ts (LOGGED_IN_KEY / REFRESH_TOKEN_KEY).
    await page.addInitScript((args) => {
      localStorage.setItem("rss_refresh_token", args.refreshToken);
      localStorage.setItem("rss_logged_in", "1");
    }, tokens);

    // Navigate to home to trigger the token refresh cycle (mocked)
    await page.goto("/");

    // Wait for page content to appear (any of these selectors means auth succeeded)
    await page.waitForSelector(
      '[role="feed"], .banner, .onboarding-wizard, .page-title',
      { timeout: 20_000 },
    );
    await use(page);
  },
});

export { expect } from "@playwright/test";
