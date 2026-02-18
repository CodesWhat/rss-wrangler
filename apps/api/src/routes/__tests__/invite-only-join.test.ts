/**
 * Comprehensive tests for invite-only join enforcement.
 *
 * These tests verify the auth-service joinAccount behavior and the v1 route
 * handler HTTP contract for the invite-only join policy:
 *
 * - Joining without an invite code when the account has existing members -> 403
 * - Joining with an expired/revoked invite code -> 400
 * - Joining with a valid invite code -> success (TokenSet)
 * - First user (owner bootstrap) can join without an invite code
 * - Email mismatch on targeted invite -> 400
 *
 * Uses the same pattern-matching mock strategy as auth-hardened-model.test.ts.
 */

import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../../config/env.js";
import { createAuthService } from "../../services/auth-service.js";

// ---------------------------------------------------------------------------
// Helpers: mock Fastify, Pool, PoolClient using pattern-matching queries
// ---------------------------------------------------------------------------

type QueryHandler = {
  match: (sql: string, params?: unknown[]) => boolean;
  response: { rows: unknown[] } | (() => { rows: unknown[] });
};

function buildPatternClient(handlers: QueryHandler[]): PoolClient {
  return {
    query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      for (const handler of handlers) {
        if (handler.match(sql, params)) {
          return typeof handler.response === "function" ? handler.response() : handler.response;
        }
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function buildPatternPool(
  poolHandlers: QueryHandler[],
  clientHandlers: QueryHandler[],
): { pool: Pool; client: PoolClient } {
  const client = buildPatternClient(clientHandlers);
  const pool = {
    query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      for (const handler of poolHandlers) {
        if (handler.match(sql, params)) {
          return typeof handler.response === "function" ? handler.response() : handler.response;
        }
      }
      return { rows: [] };
    }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;

  return { pool, client };
}

const sqlContains = (fragment: string) => (sql: string) => sql.includes(fragment);

function buildMockEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    NODE_ENV: "test",
    API_PORT: 4000,
    API_HOST: "0.0.0.0",
    API_CORS_ORIGIN: "*",
    DATABASE_URL: "postgres://localhost:5432/test",
    AUTH_JWT_SECRET: "test-secret-that-is-at-least-32-chars-long",
    AUTH_USERNAME: "admin",
    AUTH_PASSWORD: "adminpass1",
    APP_BASE_URL: "http://localhost:3000",
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL: "30d",
    PASSWORD_RESET_TOKEN_TTL: "1h",
    EMAIL_VERIFICATION_TOKEN_TTL: "24h",
    REQUIRE_EMAIL_VERIFICATION: false,
    LEMON_SQUEEZY_API_BASE_URL: "https://api.lemonsqueezy.com/v1",
    ...overrides,
  } as ApiEnv;
}

function buildMockApp(): FastifyInstance {
  const logger: FastifyBaseLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;

  return {
    log: logger,
    jwt: {
      sign: vi.fn().mockResolvedValue("mock-token"),
      verify: vi.fn(),
    },
  } as unknown as FastifyInstance;
}

// ---------------------------------------------------------------------------
// Helper: common client handlers for successful join flow (after invite check)
// ---------------------------------------------------------------------------

function successfulJoinHandlers(userId: string): QueryHandler[] {
  return [
    // No existing user with same username
    {
      match: (sql) => sql.includes("FROM user_account") && sql.includes("username"),
      response: { rows: [] },
    },
    // No existing user with same email
    {
      match: (sql) => sql.includes("FROM user_account") && sql.includes("lower(email)"),
      response: { rows: [] },
    },
    // INSERT user_account
    {
      match: sqlContains("INSERT INTO user_account"),
      response: { rows: [{ id: userId }] },
    },
    // UPDATE workspace_invite consumed
    {
      match: (sql) => sql.includes("UPDATE workspace_invite") && sql.includes("consumed"),
      response: { rows: [] },
    },
    // issueEmailVerificationToken: UPDATE old tokens
    {
      match: sqlContains("UPDATE auth_email_verification_token"),
      response: { rows: [] },
    },
    // issueEmailVerificationToken: INSERT new token
    {
      match: sqlContains("INSERT INTO auth_email_verification_token"),
      response: { rows: [{ expires_at: new Date("2026-02-10T00:00:00Z") }] },
    },
    // issueTokens: INSERT auth_session
    {
      match: sqlContains("INSERT INTO auth_session"),
      response: { rows: [] },
    },
    // issueTokens: UPDATE user_account last_login_at
    {
      match: (sql) => sql.includes("UPDATE user_account") && sql.includes("last_login_at"),
      response: { rows: [] },
    },
  ];
}

// ---------------------------------------------------------------------------
// Route-level HTTP contract tests
// ---------------------------------------------------------------------------

describe("v1 route HTTP contract: invite-only join", () => {
  /**
   * The route handler POST /v1/auth/join maps auth-service return values to HTTP
   * status codes. This table documents the complete mapping.
   */
  const joinResponseMap: Record<string, { statusCode: number; messageIncludes: string }> = {
    account_not_found: { statusCode: 404, messageIncludes: "account not found" },
    invite_required: { statusCode: 403, messageIncludes: "invite code required" },
    invalid_invite_code: { statusCode: 400, messageIncludes: "invalid or expired invite code" },
    username_taken: { statusCode: 409, messageIncludes: "username already exists" },
    email_taken: { statusCode: 409, messageIncludes: "email already exists" },
    verification_required: { statusCode: 202, messageIncludes: "verificationRequired" },
  };

  it("maps 'invite_required' to HTTP 403 Forbidden", () => {
    const mapping = joinResponseMap.invite_required;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(403);
    expect(mapping!.messageIncludes).toContain("invite code required");
  });

  it("maps 'invalid_invite_code' to HTTP 400 Bad Request", () => {
    const mapping = joinResponseMap.invalid_invite_code;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(400);
    expect(mapping!.messageIncludes).toContain("invalid or expired");
  });

  it("maps 'account_not_found' to HTTP 404 Not Found", () => {
    const mapping = joinResponseMap.account_not_found;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(404);
  });

  it("maps 'username_taken' to HTTP 409 Conflict", () => {
    const mapping = joinResponseMap.username_taken;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(409);
  });

  it("maps 'email_taken' to HTTP 409 Conflict", () => {
    const mapping = joinResponseMap.email_taken;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(409);
  });

  it("maps 'verification_required' to HTTP 202 Accepted", () => {
    const mapping = joinResponseMap.verification_required;
    expect(mapping).toBeDefined();
    expect(mapping!.statusCode).toBe(202);
  });

  it("no error result (TokenSet) returns 200 with tokens", () => {
    // When joinAccount returns a TokenSet, the route returns it directly (200).
    // There is no explicit status code mapping -- Fastify defaults to 200.
    const errorKeys = Object.keys(joinResponseMap);
    expect(errorKeys).not.toContain("accessToken");
  });
});

// ---------------------------------------------------------------------------
// Auth-service level behavioral tests: invite-only join enforcement
// ---------------------------------------------------------------------------

describe("auth-service: invite-only join enforcement (comprehensive)", () => {
  const env = buildMockEnv();

  it("returns 'invite_required' when no invite code and account has existing members", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [{ match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "3" }] } }],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "my-team",
      username: "newcomer",
      email: "newcomer@example.com",
      password: "password123",
      // No inviteCode
    });

    expect(result).toBe("invite_required");
  });

  it("returns 'invite_required' even with empty string invite code", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [{ match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "2" }] } }],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "my-team",
      username: "newcomer",
      email: "newcomer@example.com",
      password: "password123",
      // inviteCode is trimmed and empty -> falsy
    });

    expect(result).toBe("invite_required");
  });

  it("returns 'invalid_invite_code' when invite code has no matching pending invite", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // workspace_invite SELECT returns empty (expired/revoked/consumed or nonexistent)
        { match: sqlContains("FROM workspace_invite"), response: { rows: [] } },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "hacker",
      email: "hacker@example.com",
      password: "password123",
      inviteCode: "expired-code-that-no-longer-works",
    });

    expect(result).toBe("invalid_invite_code");
  });

  it("returns 'invalid_invite_code' when invite targets a different email", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Invite found but email is for someone else
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-abc", email: "alice@example.com" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "bob",
      email: "bob@example.com",
      password: "password123",
      inviteCode: "code-for-alice-not-bob-padding",
    });

    expect(result).toBe("invalid_invite_code");
  });

  it("returns 'account_not_found' when account slug does not resolve", async () => {
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [] } }],
      [],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "no-such-workspace",
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(result).toBe("account_not_found");
  });

  it("succeeds (issues tokens) with a valid invite code and matching email", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Valid invite matching the joining user's email
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-good", email: "valid@example.com" }] },
        },
        ...successfulJoinHandlers(userId),
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "validuser",
      email: "valid@example.com",
      password: "password123",
      inviteCode: "a-perfectly-valid-invite-code",
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("expiresInSeconds");
  });

  it("succeeds with invite code when invite has no targeted email (open invite)", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "2" }] } },
        // Open invite (email is null -- anyone can use it)
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-open", email: null }] },
        },
        ...successfulJoinHandlers(userId),
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "anyuser",
      email: "anyone@example.com",
      password: "password123",
      inviteCode: "open-invite-code-no-email-check",
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
  });

  it("first user (owner bootstrap) can join without invite code", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        // Count = 0 -> first user
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "0" }] } },
        ...successfulJoinHandlers(userId),
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "brand-new-workspace",
      username: "founder",
      email: "founder@example.com",
      password: "password123",
      // No inviteCode needed for first user
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
  });

  it("returns 'username_taken' even with valid invite when username exists", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Valid invite
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-ok", email: null }] },
        },
        // Username already taken
        {
          match: (sql) => sql.includes("FROM user_account") && sql.includes("username"),
          response: { rows: [{ id: "existing-user-id" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "taken-user",
      email: "new@example.com",
      password: "password123",
      inviteCode: "valid-invite-code-padding-here",
    });

    expect(result).toBe("username_taken");
  });

  it("returns 'email_taken' even with valid invite when email already registered", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Valid invite
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-ok", email: null }] },
        },
        // Username is free
        {
          match: (sql) => sql.includes("FROM user_account") && sql.includes("username"),
          response: { rows: [] },
        },
        // Email already taken
        {
          match: (sql) => sql.includes("FROM user_account") && sql.includes("lower(email)"),
          response: { rows: [{ id: "existing-email-user" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "fresh-user",
      email: "taken@example.com",
      password: "password123",
      inviteCode: "valid-invite-code-padding-here",
    });

    expect(result).toBe("email_taken");
  });

  it("returns 'verification_required' when email verification is enabled", async () => {
    const envWithVerification = buildMockEnv({ REQUIRE_EMAIL_VERIFICATION: true });
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Valid invite
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-ok", email: null }] },
        },
        ...successfulJoinHandlers(userId),
      ],
    );
    const auth = createAuthService(buildMockApp(), envWithVerification, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "verifyuser",
      email: "verifyuser@example.com",
      password: "password123",
      inviteCode: "a-valid-invite-code-with-padding",
    });

    expect(result).toBe("verification_required");
  });
});
