import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../../config/env.js";
import { createAuthService } from "../auth-service.js";

// ---------------------------------------------------------------------------
// Helpers: mock Fastify, Pool, PoolClient using pattern-matching queries
// ---------------------------------------------------------------------------

/**
 * A query handler maps (sql, params) -> response. Handlers are checked in order;
 * the first matching handler's response is returned. This avoids fragile ordered
 * queues that break when withTenantClient's set_config calls shift positions.
 */
type QueryHandler = {
  match: (sql: string, params?: unknown[]) => boolean;
  response: { rows: unknown[] } | (() => { rows: unknown[] });
};

function buildPatternClient(handlers: QueryHandler[]): PoolClient {
  const client = {
    query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      for (const handler of handlers) {
        if (handler.match(sql, params)) {
          return typeof handler.response === "function" ? handler.response() : handler.response;
        }
      }
      // Default: return empty rows for set_config, etc.
      return { rows: [] };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  return client;
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

// ---------------------------------------------------------------------------
// SQL pattern matchers (convenience helpers)
// ---------------------------------------------------------------------------

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
// Test suites
// ---------------------------------------------------------------------------

describe("auth-service: invite-only join enforcement", () => {
  const env = buildMockEnv();

  it("returns 'account_not_found' when account slug does not exist", async () => {
    const { pool } = buildPatternPool(
      // Pool-level: resolveTenantIdBySlug returns no rows
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [] } }],
      [],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "nonexistent",
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(result).toBe("account_not_found");
  });

  it("returns 'invite_required' when joining existing account without invite code", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        // User count > 0 means account has existing users
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "bob",
      email: "bob@example.com",
      password: "password123",
      // No inviteCode provided
    });

    expect(result).toBe("invite_required");
  });

  it("returns 'invalid_invite_code' when invite code does not match any pending invite", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // SELECT from workspace_invite -> no matching invite
        { match: sqlContains("FROM workspace_invite"), response: { rows: [] } },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "charlie",
      email: "charlie@example.com",
      password: "password123",
      inviteCode: "fake-invite-code-that-is-long-enough",
    });

    expect(result).toBe("invalid_invite_code");
  });

  it("returns 'invalid_invite_code' when invite email does not match the joining user email", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Invite found but with different email
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-1", email: "other@example.com" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "dave",
      email: "dave@example.com",
      password: "password123",
      inviteCode: "valid-invite-code-that-is-long-enough",
    });

    expect(result).toBe("invalid_invite_code");
  });

  it("succeeds (issues tokens) when valid invite code is provided and email matches", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        // User count > 0 (not creating owner)
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "1" }] } },
        // Valid invite matching email
        {
          match: (sql) => sql.includes("FROM workspace_invite") && sql.includes("SELECT"),
          response: { rows: [{ id: "invite-1", email: "eve@example.com" }] },
        },
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
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "eve",
      email: "eve@example.com",
      password: "password123",
      inviteCode: "a-valid-invite-code-long-enough",
    });

    // Should return a TokenSet
    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("expiresInSeconds");
  });

  it("allows first user to join without invite code (owner bootstrap)", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [{ match: sqlContains("FROM tenant WHERE slug"), response: { rows: [{ id: accountId }] } }],
      [
        // User count = 0 (first user, becomes owner)
        { match: sqlContains("COUNT(*)"), response: { rows: [{ cnt: "0" }] } },
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
        // INSERT user_account (with role 'owner')
        {
          match: sqlContains("INSERT INTO user_account"),
          response: { rows: [{ id: userId }] },
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
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.joinAccount({
      tenantSlug: "default",
      username: "owner",
      email: "owner@example.com",
      password: "password123",
      // No inviteCode -- first user does not need one
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
  });
});

describe("auth-service: owner-only invite management", () => {
  const env = buildMockEnv();

  it("createMemberInvite returns 'not_owner' when caller is a member", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [],
      [
        // getUserRole -> 'member'
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "member" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.createMemberInvite(memberId, accountId, {
      expiresInDays: 7,
    });

    expect(result).toBe("not_owner");
  });

  it("createMemberInvite succeeds when caller is owner", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const inviteId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const now = new Date("2026-02-09T12:00:00Z");
    const expiresAt = new Date("2026-02-16T12:00:00Z");

    const { pool } = buildPatternPool(
      [],
      [
        // getUserRole -> 'owner'
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
        // Get account slug
        {
          match: (sql) => sql.includes("SELECT slug") && sql.includes("FROM tenant"),
          response: { rows: [{ slug: "my-workspace" }] },
        },
        // INSERT workspace_invite
        {
          match: sqlContains("INSERT INTO workspace_invite"),
          response: {
            rows: [
              {
                id: inviteId,
                email: null,
                status: "pending" as const,
                created_at: now,
                expires_at: expiresAt,
                consumed_at: null,
                revoked_at: null,
              },
            ],
          },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.createMemberInvite(ownerId, accountId, {
      expiresInDays: 7,
    });

    expect(result).not.toBe("not_owner");
    expect(result).toHaveProperty("id", inviteId);
    expect(result).toHaveProperty("status", "pending");
    expect(result).toHaveProperty("inviteCode");
    expect(result).toHaveProperty("inviteUrl");
  });

  it("listMemberInvites returns 'not_owner' when caller is a member", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "member" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.listMemberInvites(memberId, accountId);

    expect(result).toBe("not_owner");
  });

  it("listMemberInvites succeeds when caller is owner", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const now = new Date("2026-02-09T12:00:00Z");
    const expiresAt = new Date("2026-02-16T12:00:00Z");

    const { pool } = buildPatternPool(
      [],
      [
        // getUserRole -> owner
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
        // SELECT workspace_invite (list)
        {
          match: (sql) =>
            sql.includes("SELECT") &&
            sql.includes("FROM workspace_invite") &&
            sql.includes("ORDER BY"),
          response: {
            rows: [
              {
                id: "invite-1",
                email: "test@example.com",
                status: "pending" as const,
                created_at: now,
                expires_at: expiresAt,
                consumed_at: null,
                revoked_at: null,
              },
            ],
          },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.listMemberInvites(ownerId, accountId);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("revokeMemberInvite returns 'not_owner' when caller is a member", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "member" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.revokeMemberInvite(memberId, accountId, "invite-1");

    expect(result).toBe("not_owner");
  });

  it("revokeMemberInvite succeeds when caller is owner", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const now = new Date("2026-02-09T12:00:00Z");
    const expiresAt = new Date("2026-02-16T12:00:00Z");

    const { pool } = buildPatternPool(
      [],
      [
        // getUserRole -> owner
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
        // UPDATE workspace_invite (revoke) RETURNING
        {
          match: (sql) => sql.includes("UPDATE workspace_invite") && sql.includes("revoked"),
          response: {
            rows: [
              {
                id: "invite-1",
                email: null,
                status: "revoked" as const,
                created_at: now,
                expires_at: expiresAt,
                consumed_at: null,
                revoked_at: now,
              },
            ],
          },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.revokeMemberInvite(ownerId, accountId, "invite-1");

    expect(result).not.toBe("not_owner");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("status", "revoked");
  });
});

describe("auth-service: owner-only member management", () => {
  const env = buildMockEnv();

  it("removeMember returns 'not_owner' when caller is a member", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const targetId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "member" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.removeMember(memberId, accountId, targetId);

    expect(result).toBe("not_owner");
  });

  it("updateMemberRole returns 'not_owner' when caller is a member", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const targetId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "member" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.updateMemberRole(memberId, accountId, targetId, "member");

    expect(result).toBe("not_owner");
  });

  it("removeMember returns 'cannot_modify_self' when owner targets themselves", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.removeMember(ownerId, accountId, ownerId);

    expect(result).toBe("cannot_modify_self");
  });

  it("updateMemberRole returns 'cannot_modify_self' when owner targets themselves", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { pool } = buildPatternPool(
      [],
      [
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.updateMemberRole(ownerId, accountId, ownerId, "member");

    expect(result).toBe("cannot_modify_self");
  });

  it("removeMember succeeds when caller is owner and target exists", async () => {
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ownerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const targetId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

    const { pool } = buildPatternPool(
      [],
      [
        // getUserRole -> owner
        {
          match: (sql) => sql.includes("SELECT role") && sql.includes("FROM user_account"),
          response: { rows: [{ role: "owner" }] },
        },
        // SELECT target user exists
        {
          match: (sql) =>
            sql.includes("SELECT") && sql.includes("FROM user_account") && !sql.includes("role"),
          response: { rows: [{ id: targetId }] },
        },
        // INSERT member_event
        {
          match: sqlContains("INSERT INTO member_event"),
          response: { rows: [] },
        },
        // DELETE user_account
        {
          match: sqlContains("DELETE FROM user_account"),
          response: { rows: [] },
        },
      ],
    );
    const auth = createAuthService(buildMockApp(), env, pool);

    const result = await auth.removeMember(ownerId, accountId, targetId);

    expect(result).toBe("ok");
  });
});
