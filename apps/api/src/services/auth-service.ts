import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import type {
  AccountDataExportStatus,
  AccountDeletionStatus,
  CreateWorkspaceInviteRequest,
  ForgotPasswordRequest,
  JoinWorkspaceRequest,
  MembershipPolicy,
  RequestAccountDeletion,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest,
  UserRole,
  WorkspaceInvite,
  WorkspaceMember
} from "@rss-wrangler/contracts";
import type { ApiEnv } from "../config/env";
import { createEmailService } from "./email-service";

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  tokenType: "access";
}

interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  tokenType: "refresh";
  jti: string;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

interface UserAccountRow {
  id: string;
  tenant_id: string;
  username: string;
  email: string | null;
  email_verified_at: Date | null;
  password_hash: string;
}

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export function createAuthService(app: FastifyInstance, env: ApiEnv, pool: Pool) {
  const emailService = createEmailService(env, app.log);

  async function withTenantClient<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
      return await fn(client);
    } finally {
      try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_TENANT_ID]);
      } catch {
        // Best effort reset.
      }
      client.release();
    }
  }

  async function resolveTenantIdBySlug(tenantSlug: string): Promise<string | null> {
    const normalized = normalizeTenantSlug(tenantSlug);
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM tenant WHERE slug = $1 LIMIT 1",
      [normalized]
    );
    return rows[0]?.id ?? null;
  }

  function buildAppUrl(pathWithQuery: string): string {
    return new URL(pathWithQuery, env.APP_BASE_URL).toString();
  }

  async function issueEmailVerificationToken(
    tenantId: string,
    userId: string
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const ttlSeconds = parseDurationSeconds(env.EMAIL_VERIFICATION_TOKEN_TTL);

    const result = await withTenantClient(tenantId, async (client) => {
      await client.query(
        `UPDATE auth_email_verification_token
         SET consumed_at = NOW()
         WHERE tenant_id = $1
           AND user_id = $2
           AND consumed_at IS NULL`,
        [tenantId, userId]
      );

      return client.query<{ expires_at: Date }>(
        `INSERT INTO auth_email_verification_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + $4::interval)
         RETURNING expires_at`,
        [tenantId, userId, tokenHash, `${ttlSeconds} seconds`]
      );
    });

    const expiresAt = result.rows[0]?.expires_at;
    if (!expiresAt) {
      throw new Error("failed to issue email verification token");
    }
    return { token, expiresAt };
  }

  async function sendVerificationEmail(
    tenantId: string,
    userId: string,
    email: string,
    username: string
  ): Promise<void> {
    const issued = await issueEmailVerificationToken(tenantId, userId);
    const verificationUrl = buildAppUrl(`/verify-email?token=${encodeURIComponent(issued.token)}`);
    const expires = issued.expiresAt.toISOString();

    try {
      await emailService.send({
        to: email,
        subject: "Verify your RSS Wrangler email",
        text: `Hi ${username},\n\nVerify your email by opening this link:\n${verificationUrl}\n\nThis link expires at ${expires}.`,
        html: `<p>Hi ${escapeHtml(username)},</p><p>Verify your email by opening this link:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link expires at ${expires}.</p>`
      });
    } catch (error) {
      app.log.error(
        { err: error, tenantId, userId, email },
        "failed to send verification email"
      );
    }
  }

  async function issuePasswordResetToken(
    tenantId: string,
    userId: string
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const ttlSeconds = parseDurationSeconds(env.PASSWORD_RESET_TOKEN_TTL);

    const result = await withTenantClient(tenantId, async (client) => {
      await client.query(
        `UPDATE auth_password_reset_token
         SET consumed_at = NOW()
         WHERE tenant_id = $1
           AND user_id = $2
           AND consumed_at IS NULL`,
        [tenantId, userId]
      );

      return client.query<{ expires_at: Date }>(
        `INSERT INTO auth_password_reset_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + $4::interval)
         RETURNING expires_at`,
        [tenantId, userId, tokenHash, `${ttlSeconds} seconds`]
      );
    });

    const expiresAt = result.rows[0]?.expires_at;
    if (!expiresAt) {
      throw new Error("failed to issue password reset token");
    }
    return { token, expiresAt };
  }

  async function sendPasswordResetEmail(
    tenantId: string,
    userId: string,
    email: string,
    username: string
  ): Promise<void> {
    const issued = await issuePasswordResetToken(tenantId, userId);
    const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(issued.token)}`);
    const expires = issued.expiresAt.toISOString();

    try {
      await emailService.send({
        to: email,
        subject: "Reset your RSS Wrangler password",
        text: `Hi ${username},\n\nReset your password by opening this link:\n${resetUrl}\n\nThis link expires at ${expires}.`,
        html: `<p>Hi ${escapeHtml(username)},</p><p>Reset your password by opening this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires at ${expires}.</p>`
      });
    } catch (error) {
      app.log.error(
        { err: error, tenantId, userId, email },
        "failed to send password reset email"
      );
    }
  }

  async function issueTokens(userId: string, _username: string, tenantId: string): Promise<TokenSet> {
    const sessionId = randomUUID();
    const refreshTtlSeconds = parseDurationSeconds(env.REFRESH_TOKEN_TTL);
    const accessTtlSeconds = parseDurationSeconds(env.ACCESS_TOKEN_TTL);

    const accessToken = await app.jwt.sign(
      {
        sub: userId,
        tenantId,
        tokenType: "access"
      } satisfies AccessTokenPayload,
      {
        expiresIn: env.ACCESS_TOKEN_TTL
      }
    );

    const refreshToken = await app.jwt.sign(
      {
        sub: userId,
        tenantId,
        tokenType: "refresh",
        jti: sessionId
      } satisfies RefreshTokenPayload,
      {
        expiresIn: env.REFRESH_TOKEN_TTL
      }
    );

    // Store session in DB
    const tokenHash = hashToken(refreshToken);
    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `INSERT INTO auth_session (id, tenant_id, user_id, refresh_token_hash, expires_at, last_seen_at)
         VALUES ($1, $2, $3, $4, NOW() + $5::interval, NOW())`,
        [sessionId, tenantId, userId, tokenHash, `${refreshTtlSeconds} seconds`]
      );

      // Update last_login_at
      await client.query(
        "UPDATE user_account SET last_login_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [userId, tenantId]
      );
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: accessTtlSeconds
    };
  }

  async function login(
    username: string,
    password: string,
    tenantSlug = "default"
  ): Promise<TokenSet | "email_not_verified" | "pending_approval" | "suspended" | null> {
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    if (!tenantId) {
      return null;
    }

    // First try DB-backed user lookup
    const rows = await withTenantClient(tenantId, async (client) => {
      const result = await client.query<UserAccountRow & { status: string }>(
        `SELECT id, tenant_id, username, email, email_verified_at, password_hash, status
         FROM user_account
         WHERE username = $1
           AND tenant_id = $2`,
        [username, tenantId]
      );
      return result.rows;
    });
    if (rows.length > 0) {
      const user = rows[0] as UserAccountRow & { status: string };
      // Verify password using pgcrypto's crypt function
      const verifyResult = await withTenantClient(tenantId, async (client) => {
        return client.query(
          `SELECT (password_hash = crypt($1, password_hash)) AS valid
           FROM user_account
           WHERE id = $2
             AND tenant_id = $3`,
          [password, user.id, tenantId]
        );
      });
      const isValid = (verifyResult.rows[0] as { valid: boolean } | undefined)?.valid === true;
      if (!isValid) {
        return null;
      }
      if (user.status === "pending_approval") {
        return "pending_approval";
      }
      if (user.status === "suspended") {
        return "suspended";
      }
      if (env.REQUIRE_EMAIL_VERIFICATION && user.email && !user.email_verified_at) {
        return "email_not_verified";
      }
      return issueTokens(user.id, user.username, user.tenant_id);
    }

    // Fallback to env-based auth for default-tenant bootstrapping.
    const countResult = await withTenantClient(tenantId, async (client) => {
      return client.query(
        "SELECT COUNT(*) AS cnt FROM user_account WHERE tenant_id = $1",
        [tenantId]
      );
    });
    const userCount = Number((countResult.rows[0] as { cnt: string } | undefined)?.cnt ?? "0");
    if (
      tenantId === DEFAULT_TENANT_ID &&
      userCount === 0 &&
      timingSafeEqual(Buffer.from(username), Buffer.from(env.AUTH_USERNAME)) &&
      timingSafeEqual(Buffer.from(password), Buffer.from(env.AUTH_PASSWORD))
    ) {
      // Auto-create the admin user in the DB using pgcrypto
      const insertResult = await withTenantClient(tenantId, async (client) => {
        return client.query(
          `INSERT INTO user_account (tenant_id, username, password_hash)
           VALUES ($1, $2, crypt($3, gen_salt('bf')))
           RETURNING id, tenant_id, username`,
          [tenantId, username, password]
        );
      });
      const newUser = insertResult.rows[0] as { id: string; tenant_id: string; username: string };
      return issueTokens(newUser.id, newUser.username, newUser.tenant_id);
    }

    return null;
  }

  async function signup(
    payload: SignupRequest
  ): Promise<TokenSet | "tenant_slug_taken" | "username_taken" | "email_taken" | "verification_required"> {
    const tenantSlug = normalizeTenantSlug(payload.tenantSlug);
    const tenantName = payload.tenantName.trim();
    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();

    const existingTenantId = await resolveTenantIdBySlug(tenantSlug);
    if (existingTenantId) {
      return "tenant_slug_taken";
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_TENANT_ID]);

      const tenantInsert = await client.query<{ id: string }>(
        `INSERT INTO tenant (slug, name)
         VALUES ($1, $2)
         RETURNING id`,
        [tenantSlug, tenantName]
      );
      const tenantId = tenantInsert.rows[0]?.id;
      if (!tenantId) {
        throw new Error("tenant creation failed");
      }

      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);

      const existingUser = await client.query(
        `SELECT id
         FROM user_account
         WHERE tenant_id = $1
           AND username = $2
         LIMIT 1`,
        [tenantId, username]
      );
      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return "username_taken";
      }

      const existingEmail = await client.query(
        `SELECT id
         FROM user_account
         WHERE tenant_id = $1
           AND lower(email) = $2
         LIMIT 1`,
        [tenantId, email]
      );
      if (existingEmail.rows.length > 0) {
        await client.query("ROLLBACK");
        return "email_taken";
      }

      const userInsert = await client.query<{ id: string }>(
        `INSERT INTO user_account (tenant_id, username, email, password_hash, role)
         VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), 'owner')
         RETURNING id`,
        [tenantId, username, email, payload.password]
      );

      await client.query("COMMIT");

      const userId = userInsert.rows[0]?.id;
      if (!userId) {
        throw new Error("user creation failed");
      }

      await sendVerificationEmail(tenantId, userId, email, username);

      if (env.REQUIRE_EMAIL_VERIFICATION) {
        return "verification_required";
      }

      return issueTokens(userId, username, tenantId);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Best effort rollback.
      }
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === "tenant_slug_key") {
        return "tenant_slug_taken";
      }
      if (pgErr.code === "23505" && pgErr.constraint === "user_account_tenant_username_uniq") {
        return "username_taken";
      }
      if (pgErr.code === "23505" && pgErr.constraint === "user_account_tenant_email_uniq") {
        return "email_taken";
      }
      throw err;
    } finally {
      try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_TENANT_ID]);
      } catch {
        // Best effort reset.
      }
      client.release();
    }
  }

  async function joinWorkspace(
    payload: JoinWorkspaceRequest
  ): Promise<
    | TokenSet
    | "tenant_not_found"
    | "invite_required"
    | "invalid_invite_code"
    | "username_taken"
    | "email_taken"
    | "verification_required"
    | "pending_approval"
  > {
    const tenantId = await resolveTenantIdBySlug(payload.tenantSlug);
    if (!tenantId) {
      return "tenant_not_found";
    }

    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();
    const inviteCode = payload.inviteCode?.trim();

    try {
      const existingCountResult = await withTenantClient(tenantId, async (client) => {
        return client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM user_account
           WHERE tenant_id = $1`,
          [tenantId]
        );
      });
      const existingCount = Number.parseInt(existingCountResult.rows[0]?.cnt ?? "0", 10);

      let inviteId: string | null = null;
      if (existingCount > 0) {
        if (!inviteCode) {
          return "invite_required";
        }

        const inviteHash = hashToken(inviteCode);
        const inviteResult = await withTenantClient(tenantId, async (client) => {
          // Normalize expired pending invites before lookup.
          await client.query(
            `UPDATE workspace_invite
             SET status = 'expired'
             WHERE tenant_id = $1
               AND status = 'pending'
               AND expires_at <= NOW()`,
            [tenantId]
          );

          return client.query<{
            id: string;
            email: string | null;
          }>(
            `SELECT id, email
             FROM workspace_invite
             WHERE tenant_id = $1
               AND invite_code_hash = $2
               AND status = 'pending'
               AND expires_at > NOW()
             LIMIT 1`,
            [tenantId, inviteHash]
          );
        });

        const invite = inviteResult.rows[0];
        if (!invite) {
          return "invalid_invite_code";
        }

        if (invite.email && invite.email.toLowerCase() !== email) {
          return "invalid_invite_code";
        }

        inviteId = invite.id;
      }

      const existingUser = await withTenantClient(tenantId, async (client) => {
        return client.query(
          `SELECT id
           FROM user_account
           WHERE tenant_id = $1
             AND username = $2
           LIMIT 1`,
          [tenantId, username]
        );
      });
      if (existingUser.rows.length > 0) {
        return "username_taken";
      }

      const existingEmail = await withTenantClient(tenantId, async (client) => {
        return client.query(
          `SELECT id
           FROM user_account
           WHERE tenant_id = $1
             AND lower(email) = $2
           LIMIT 1`,
          [tenantId, email]
        );
      });
      if (existingEmail.rows.length > 0) {
        return "email_taken";
      }

      // Look up membership policy for the tenant
      const policyResult = await withTenantClient(tenantId, async (client) => {
        return client.query<{ membership_policy: string }>(
          `SELECT membership_policy
           FROM tenant
           WHERE id = $1
           LIMIT 1`,
          [tenantId]
        );
      });
      const membershipPolicy = policyResult.rows[0]?.membership_policy ?? "invite_only";

      // Determine initial user status based on policy
      const needsApproval = membershipPolicy === "approval_required";
      const userStatus = needsApproval ? "pending_approval" : "active";

      const insert = await withTenantClient(tenantId, async (client) => {
        return client.query<{ id: string }>(
          `INSERT INTO user_account (tenant_id, username, email, password_hash, role, status)
           VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), 'member', $5)
           RETURNING id`,
          [tenantId, username, email, payload.password, userStatus]
        );
      });

      const userId = insert.rows[0]?.id;
      if (!userId) {
        throw new Error("user creation failed");
      }

      if (inviteId) {
        await withTenantClient(tenantId, async (client) => {
          await client.query(
            `UPDATE workspace_invite
             SET status = 'consumed',
                 consumed_at = NOW(),
                 consumed_by_user_id = $3
             WHERE id = $1
               AND tenant_id = $2
               AND status = 'pending'
               AND expires_at > NOW()`,
            [inviteId, tenantId, userId]
          );
        });
      }

      await sendVerificationEmail(tenantId, userId, email, username);

      if (needsApproval) {
        return "pending_approval";
      }

      if (env.REQUIRE_EMAIL_VERIFICATION) {
        return "verification_required";
      }

      return issueTokens(userId, username, tenantId);
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === "user_account_tenant_username_uniq") {
        return "username_taken";
      }
      if (pgErr.code === "23505" && pgErr.constraint === "user_account_tenant_email_uniq") {
        return "email_taken";
      }
      throw err;
    }
  }

  async function createWorkspaceInvite(
    userId: string,
    tenantId: string,
    payload: CreateWorkspaceInviteRequest
  ): Promise<WorkspaceInvite | "not_owner"> {
    const actorRole = await getUserRole(userId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    const inviteCode = randomBytes(24).toString("hex");
    const inviteCodeHash = hashToken(inviteCode);
    const invitedEmail = payload.email?.trim().toLowerCase() ?? null;

    const tenantResult = await withTenantClient(tenantId, async (client) => {
      return client.query<{ slug: string }>(
        `SELECT slug
         FROM tenant
         WHERE id = $1
         LIMIT 1`,
        [tenantId]
      );
    });
    const tenantSlug = tenantResult.rows[0]?.slug;
    if (!tenantSlug) {
      throw new Error("tenant not found for invite");
    }

    const insert = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        email: string | null;
        status: "pending" | "consumed" | "revoked" | "expired";
        created_at: Date;
        expires_at: Date;
        consumed_at: Date | null;
        revoked_at: Date | null;
      }>(
        `INSERT INTO workspace_invite (
           tenant_id,
           created_by_user_id,
           invite_code_hash,
           email,
           status,
           expires_at
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           'pending',
           NOW() + ($5::text || ' days')::interval
         )
         RETURNING id, email, status, created_at, expires_at, consumed_at, revoked_at`,
        [tenantId, userId, inviteCodeHash, invitedEmail, payload.expiresInDays]
      );
    });

    const row = insert.rows[0];
    if (!row) {
      throw new Error("failed to create workspace invite");
    }

    const inviteUrl = buildAppUrl(
      `/join?tenant=${encodeURIComponent(tenantSlug)}&invite=${encodeURIComponent(inviteCode)}`
    );

    return toWorkspaceInvite(row, inviteCode, inviteUrl);
  }

  async function listWorkspaceInvites(userId: string, tenantId: string): Promise<WorkspaceInvite[]> {
    void userId;
    const result = await withTenantClient(tenantId, async (client) => {
      await client.query(
        `UPDATE workspace_invite
         SET status = 'expired'
         WHERE tenant_id = $1
           AND status = 'pending'
           AND expires_at <= NOW()`,
        [tenantId]
      );

      return client.query<{
        id: string;
        email: string | null;
        status: "pending" | "consumed" | "revoked" | "expired";
        created_at: Date;
        expires_at: Date;
        consumed_at: Date | null;
        revoked_at: Date | null;
      }>(
        `SELECT id, email, status, created_at, expires_at, consumed_at, revoked_at
         FROM workspace_invite
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [tenantId]
      );
    });

    return result.rows.map((row) => toWorkspaceInvite(row));
  }

  async function revokeWorkspaceInvite(
    userId: string,
    tenantId: string,
    inviteId: string
  ): Promise<WorkspaceInvite | "not_owner" | null> {
    const actorRole = await getUserRole(userId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        email: string | null;
        status: "pending" | "consumed" | "revoked" | "expired";
        created_at: Date;
        expires_at: Date;
        consumed_at: Date | null;
        revoked_at: Date | null;
      }>(
        `UPDATE workspace_invite
         SET status = 'revoked',
             revoked_at = NOW(),
             revoked_by_user_id = $3
         WHERE id = $1
           AND tenant_id = $2
           AND status = 'pending'
         RETURNING id, email, status, created_at, expires_at, consumed_at, revoked_at`,
        [inviteId, tenantId, userId]
      );
    });

    const row = result.rows[0];
    return row ? toWorkspaceInvite(row) : null;
  }

  async function changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<"ok" | "invalid_current_password" | "same_password" | "user_not_found"> {
    if (currentPassword === newPassword) {
      return "same_password";
    }

    const userResult = await withTenantClient(tenantId, async (client) => {
      return client.query<{ password_hash: string }>(
        `SELECT password_hash
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, tenantId]
      );
    });

    if (userResult.rows.length === 0) {
      return "user_not_found";
    }

    const verifyResult = await withTenantClient(tenantId, async (client) => {
      return client.query<{ valid: boolean }>(
        `SELECT (password_hash = crypt($1, password_hash)) AS valid
         FROM user_account
         WHERE id = $2
           AND tenant_id = $3`,
        [currentPassword, userId, tenantId]
      );
    });

    const isValid = verifyResult.rows[0]?.valid === true;
    if (!isValid) {
      return "invalid_current_password";
    }

    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `UPDATE user_account
         SET password_hash = crypt($1, gen_salt('bf'))
         WHERE id = $2
           AND tenant_id = $3`,
        [newPassword, userId, tenantId]
      );

      await client.query(
        `UPDATE auth_session
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND tenant_id = $2
           AND revoked_at IS NULL`,
        [userId, tenantId]
      );
    });

    return "ok";
  }

  async function getAccountDeletionStatus(
    userId: string,
    tenantId: string
  ): Promise<AccountDeletionStatus | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "cancelled" | "completed";
        requested_at: Date;
        cancelled_at: Date | null;
        completed_at: Date | null;
      }>(
        `SELECT id, status, requested_at, cancelled_at, completed_at
         FROM account_deletion_request
         WHERE tenant_id = $1
           AND user_id = $2
         ORDER BY requested_at DESC
         LIMIT 1`,
        [tenantId, userId]
      );
    });

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null
    };
  }

  async function requestAccountDeletion(
    userId: string,
    tenantId: string,
    payload: RequestAccountDeletion
  ): Promise<"invalid_password" | AccountDeletionStatus> {
    const verifyResult = await withTenantClient(tenantId, async (client) => {
      return client.query<{ valid: boolean }>(
        `SELECT (password_hash = crypt($1, password_hash)) AS valid
         FROM user_account
         WHERE id = $2
           AND tenant_id = $3`,
        [payload.password, userId, tenantId]
      );
    });

    if (verifyResult.rows[0]?.valid !== true) {
      return "invalid_password";
    }

    const existing = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "cancelled" | "completed";
        requested_at: Date;
        cancelled_at: Date | null;
        completed_at: Date | null;
      }>(
        `SELECT id, status, requested_at, cancelled_at, completed_at
         FROM account_deletion_request
         WHERE tenant_id = $1
           AND user_id = $2
           AND status = 'pending'
         ORDER BY requested_at DESC
         LIMIT 1`,
        [tenantId, userId]
      );
    });

    if (existing.rows[0]) {
      const row = existing.rows[0];
      return {
        id: row.id,
        status: row.status,
        requestedAt: row.requested_at.toISOString(),
        cancelledAt: row.cancelled_at?.toISOString() ?? null,
        completedAt: row.completed_at?.toISOString() ?? null
      };
    }

    const insert = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "cancelled" | "completed";
        requested_at: Date;
        cancelled_at: Date | null;
        completed_at: Date | null;
      }>(
        `INSERT INTO account_deletion_request (tenant_id, user_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING id, status, requested_at, cancelled_at, completed_at`,
        [tenantId, userId]
      );
    });

    const row = insert.rows[0];
    if (!row) {
      throw new Error("failed to create account deletion request");
    }

    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null
    };
  }

  async function cancelAccountDeletion(
    userId: string,
    tenantId: string
  ): Promise<AccountDeletionStatus | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "cancelled" | "completed";
        requested_at: Date;
        cancelled_at: Date | null;
        completed_at: Date | null;
      }>(
        `UPDATE account_deletion_request
         SET status = 'cancelled',
             cancelled_at = NOW()
         WHERE tenant_id = $1
           AND user_id = $2
           AND status = 'pending'
         RETURNING id, status, requested_at, cancelled_at, completed_at`,
        [tenantId, userId]
      );
    });

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null
    };
  }

  async function getAccountDataExportStatus(
    userId: string,
    tenantId: string
  ): Promise<AccountDataExportStatus | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "processing" | "completed" | "failed";
        requested_at: Date;
        started_at: Date | null;
        completed_at: Date | null;
        failed_at: Date | null;
        error_message: string | null;
        file_size_bytes: number | null;
      }>(
        `SELECT id, status, requested_at, started_at, completed_at, failed_at, error_message, file_size_bytes
         FROM account_data_export_request
         WHERE tenant_id = $1
           AND user_id = $2
         ORDER BY requested_at DESC
         LIMIT 1`,
        [tenantId, userId]
      );
    });

    const row = result.rows[0];
    return row ? toAccountDataExportStatus(row) : null;
  }

  async function requestAccountDataExport(
    userId: string,
    tenantId: string
  ): Promise<AccountDataExportStatus> {
    const active = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "processing" | "completed" | "failed";
        requested_at: Date;
        started_at: Date | null;
        completed_at: Date | null;
        failed_at: Date | null;
        error_message: string | null;
        file_size_bytes: number | null;
      }>(
        `SELECT id, status, requested_at, started_at, completed_at, failed_at, error_message, file_size_bytes
         FROM account_data_export_request
         WHERE tenant_id = $1
           AND user_id = $2
           AND status IN ('pending', 'processing')
         ORDER BY requested_at DESC
         LIMIT 1`,
        [tenantId, userId]
      );
    });

    if (active.rows[0]) {
      return toAccountDataExportStatus(active.rows[0]);
    }

    const insert = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        status: "pending" | "processing" | "completed" | "failed";
        requested_at: Date;
        started_at: Date | null;
        completed_at: Date | null;
        failed_at: Date | null;
        error_message: string | null;
        file_size_bytes: number | null;
      }>(
        `INSERT INTO account_data_export_request (tenant_id, user_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING id, status, requested_at, started_at, completed_at, failed_at, error_message, file_size_bytes`,
        [tenantId, userId]
      );
    });

    const row = insert.rows[0];
    if (!row) {
      throw new Error("failed to create account data export request");
    }

    void processAccountDataExportRequest(tenantId, userId, row.id);
    return toAccountDataExportStatus(row);
  }

  async function processAccountDataExportRequest(
    tenantId: string,
    userId: string,
    requestId: string
  ): Promise<void> {
    const claimed = await withTenantClient(tenantId, async (client) => {
      return client.query<{ id: string }>(
        `UPDATE account_data_export_request
         SET status = 'processing',
             started_at = NOW(),
             failed_at = NULL,
             error_message = NULL
         WHERE id = $1
           AND tenant_id = $2
           AND user_id = $3
           AND status = 'pending'
         RETURNING id`,
        [requestId, tenantId, userId]
      );
    });

    if (!claimed.rows[0]) {
      return;
    }

    try {
      const exportPayload = await buildAccountDataExportPayload(tenantId, userId);
      const payloadJson = JSON.stringify(exportPayload);
      const fileSizeBytes = Buffer.byteLength(payloadJson, "utf8");

      await withTenantClient(tenantId, async (client) => {
        await client.query(
          `UPDATE account_data_export_request
           SET status = 'completed',
               completed_at = NOW(),
               failed_at = NULL,
               error_message = NULL,
               export_payload = $4::jsonb,
               file_size_bytes = $5
           WHERE id = $1
             AND tenant_id = $2
             AND user_id = $3`,
          [requestId, tenantId, userId, payloadJson, fileSizeBytes]
        );
      });

      app.log.info(
        { tenantId, userId, requestId, fileSizeBytes },
        "account data export completed"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await withTenantClient(tenantId, async (client) => {
        await client.query(
          `UPDATE account_data_export_request
           SET status = 'failed',
               failed_at = NOW(),
               error_message = $4
           WHERE id = $1
             AND tenant_id = $2
             AND user_id = $3`,
          [requestId, tenantId, userId, message.slice(0, 500)]
        );
      });

      app.log.error(
        { err: error, tenantId, userId, requestId },
        "account data export failed"
      );
    }
  }

  async function buildAccountDataExportPayload(
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    return withTenantClient(tenantId, async (client) => {
      const userResult = await client.query<{
        id: string;
        username: string;
        email: string | null;
        created_at: Date;
        last_login_at: Date | null;
        email_verified_at: Date | null;
      }>(
        `SELECT id, username, email, created_at, last_login_at, email_verified_at
         FROM user_account
         WHERE tenant_id = $1
           AND id = $2
         LIMIT 1`,
        [tenantId, userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error("account not found for export");
      }

      const settingsResult = await client.query<{ data: unknown }>(
        `SELECT data
         FROM app_settings
         WHERE tenant_id = $1
           AND key = 'main'
         LIMIT 1`,
        [tenantId]
      );

      const folderRows = await client.query<{
        id: string;
        name: string;
        created_at: Date;
      }>(
        `SELECT id, name, created_at
         FROM folder
         ORDER BY name ASC`
      );

      const feedRows = await client.query<{
        id: string;
        url: string;
        title: string;
        site_url: string | null;
        folder_id: string;
        weight: "prefer" | "neutral" | "deprioritize";
        classification_status: "pending_classification" | "classified" | "approved";
        created_at: Date;
        last_polled_at: Date | null;
      }>(
        `SELECT id, url, title, site_url, folder_id, weight, classification_status, created_at, last_polled_at
         FROM feed
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      const feedTopicRows = await client.query<{
        feed_id: string;
        topic_id: string;
        topic_name: string;
        status: "pending" | "approved" | "rejected";
        confidence: string;
        proposed_at: Date;
        resolved_at: Date | null;
      }>(
        `SELECT ft.feed_id, ft.topic_id, t.name AS topic_name, ft.status, ft.confidence::text, ft.proposed_at, ft.resolved_at
         FROM feed_topic ft
         JOIN topic t ON t.id = ft.topic_id
         WHERE ft.tenant_id = $1
         ORDER BY ft.proposed_at DESC`,
        [tenantId]
      );

      const filterRows = await client.query<{
        id: string;
        pattern: string;
        type: "phrase" | "regex";
        mode: "mute" | "block";
        breakout_enabled: boolean;
        created_at: Date;
      }>(
        `SELECT id, pattern, type, mode, breakout_enabled, created_at
         FROM filter_rule
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      const savedRows = await client.query<{
        cluster_id: string;
        saved_at: Date;
        title: string | null;
        summary: string | null;
        url: string | null;
        canonical_url: string | null;
        published_at: Date | null;
        source_title: string | null;
        source_url: string | null;
      }>(
        `SELECT
           rs.cluster_id,
           rs.saved_at,
           i.title,
           i.summary,
           i.url,
           i.canonical_url,
           i.published_at,
           f.title AS source_title,
           f.url AS source_url
         FROM read_state rs
         JOIN cluster c
           ON c.id = rs.cluster_id
          AND c.tenant_id = rs.tenant_id
         LEFT JOIN item i
           ON i.id = c.rep_item_id
          AND i.tenant_id = c.tenant_id
         LEFT JOIN feed f
           ON f.id = i.feed_id
          AND f.tenant_id = i.tenant_id
         WHERE rs.tenant_id = $1
           AND rs.saved_at IS NOT NULL
         ORDER BY rs.saved_at DESC`,
        [tenantId]
      );

      const annotationRows = await client.query<{
        id: string;
        cluster_id: string;
        highlighted_text: string;
        note: string | null;
        color: string;
        created_at: Date;
      }>(
        `SELECT id, cluster_id, highlighted_text, note, color, created_at
         FROM annotation
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      const eventRows = await client.query<{
        id: string;
        idempotency_key: string;
        ts: Date;
        type: string;
        payload_json: unknown;
      }>(
        `SELECT id, idempotency_key, ts, type, payload_json
         FROM event
         WHERE tenant_id = $1
         ORDER BY ts DESC`,
        [tenantId]
      );

      const digestRows = await client.query<{
        id: string;
        created_at: Date;
        start_ts: Date;
        end_ts: Date;
        title: string;
        body: string;
        entries_json: unknown;
      }>(
        `SELECT id, created_at, start_ts, end_ts, title, body, entries_json
         FROM digest
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        tenantId,
        account: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.created_at.toISOString(),
          emailVerifiedAt: user.email_verified_at?.toISOString() ?? null,
          lastLoginAt: user.last_login_at?.toISOString() ?? null
        },
        settings: settingsResult.rows[0]?.data ?? {},
        folders: folderRows.rows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString()
        })),
        feeds: feedRows.rows.map((row) => ({
          id: row.id,
          url: row.url,
          title: row.title,
          siteUrl: row.site_url,
          folderId: row.folder_id,
          weight: row.weight,
          classificationStatus: row.classification_status,
          createdAt: row.created_at.toISOString(),
          lastPolledAt: row.last_polled_at?.toISOString() ?? null
        })),
        feedTopics: feedTopicRows.rows.map((row) => ({
          feedId: row.feed_id,
          topicId: row.topic_id,
          topicName: row.topic_name,
          status: row.status,
          confidence: Number(row.confidence),
          proposedAt: row.proposed_at.toISOString(),
          resolvedAt: row.resolved_at?.toISOString() ?? null
        })),
        filters: filterRows.rows.map((row) => ({
          id: row.id,
          pattern: row.pattern,
          type: row.type,
          mode: row.mode,
          breakoutEnabled: row.breakout_enabled,
          createdAt: row.created_at.toISOString()
        })),
        savedItems: savedRows.rows.map((row) => ({
          clusterId: row.cluster_id,
          savedAt: row.saved_at.toISOString(),
          title: row.title,
          summary: row.summary,
          url: row.url,
          canonicalUrl: row.canonical_url,
          publishedAt: row.published_at?.toISOString() ?? null,
          sourceTitle: row.source_title,
          sourceUrl: row.source_url
        })),
        annotations: annotationRows.rows.map((row) => ({
          id: row.id,
          clusterId: row.cluster_id,
          highlightedText: row.highlighted_text,
          note: row.note,
          color: row.color,
          createdAt: row.created_at.toISOString()
        })),
        events: eventRows.rows.map((row) => ({
          id: row.id,
          idempotencyKey: row.idempotency_key,
          ts: row.ts.toISOString(),
          type: row.type,
          payload: row.payload_json
        })),
        digests: digestRows.rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at.toISOString(),
          startTs: row.start_ts.toISOString(),
          endTs: row.end_ts.toISOString(),
          title: row.title,
          body: row.body,
          entries: row.entries_json
        }))
      } satisfies Record<string, unknown>;
    });
  }

  async function getAccountDataExportPayload(
    userId: string,
    tenantId: string
  ): Promise<{ payload: unknown; requestedAt: string; completedAt: string } | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        export_payload: unknown;
        requested_at: Date;
        completed_at: Date;
      }>(
        `SELECT export_payload, requested_at, completed_at
         FROM account_data_export_request
         WHERE tenant_id = $1
           AND user_id = $2
           AND status = 'completed'
           AND export_payload IS NOT NULL
         ORDER BY completed_at DESC NULLS LAST, requested_at DESC
         LIMIT 1`,
        [tenantId, userId]
      );
    });

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      payload: row.export_payload,
      requestedAt: row.requested_at.toISOString(),
      completedAt: row.completed_at.toISOString()
    };
  }

  async function resendEmailVerification(
    payload: ResendVerificationRequest
  ): Promise<"ok" | "already_verified"> {
    const tenantId = await resolveTenantIdBySlug(payload.tenantSlug);
    if (!tenantId) {
      return "ok";
    }

    const email = payload.email.trim().toLowerCase();
    const userRows = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        username: string;
        email: string | null;
        email_verified_at: Date | null;
      }>(
        `SELECT id, username, email, email_verified_at
         FROM user_account
         WHERE tenant_id = $1
           AND lower(email) = $2
         LIMIT 1`,
        [tenantId, email]
      );
    });

    const user = userRows.rows[0];
    if (!user || !user.email) {
      return "ok";
    }
    if (user.email_verified_at) {
      return "already_verified";
    }

    await sendVerificationEmail(tenantId, user.id, user.email, user.username);
    return "ok";
  }

  async function verifyEmail(token: string): Promise<"ok" | "invalid_or_expired_token"> {
    const tokenHash = hashToken(token);

    const tokenRows = await pool.query<{
      tenant_id: string;
      user_id: string;
    }>(
      `SELECT tenant_id, user_id
       FROM auth_email_verification_token
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHash]
    );

    const tokenRow = tokenRows.rows[0];
    if (!tokenRow) {
      return "invalid_or_expired_token";
    }

    const updated = await withTenantClient(tokenRow.tenant_id, async (client) => {
      const consume = await client.query(
        `UPDATE auth_email_verification_token
         SET consumed_at = NOW()
         WHERE token_hash = $1
           AND tenant_id = $2
           AND user_id = $3
           AND consumed_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [tokenHash, tokenRow.tenant_id, tokenRow.user_id]
      );

      if (consume.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE user_account
         SET email_verified_at = COALESCE(email_verified_at, NOW())
         WHERE id = $1
           AND tenant_id = $2`,
        [tokenRow.user_id, tokenRow.tenant_id]
      );

      return true;
    });

    return updated ? "ok" : "invalid_or_expired_token";
  }

  async function requestPasswordReset(payload: ForgotPasswordRequest): Promise<void> {
    const tenantId = await resolveTenantIdBySlug(payload.tenantSlug);
    if (!tenantId) {
      return;
    }

    const email = payload.email.trim().toLowerCase();
    const userRows = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        username: string;
        email: string | null;
      }>(
        `SELECT id, username, email
         FROM user_account
         WHERE tenant_id = $1
           AND lower(email) = $2
         LIMIT 1`,
        [tenantId, email]
      );
    });

    const user = userRows.rows[0];
    if (!user || !user.email) {
      return;
    }

    await sendPasswordResetEmail(tenantId, user.id, user.email, user.username);
  }

  async function resetPassword(
    payload: ResetPasswordRequest
  ): Promise<"ok" | "invalid_or_expired_token"> {
    const tokenHash = hashToken(payload.token);

    const tokenRows = await pool.query<{
      tenant_id: string;
      user_id: string;
    }>(
      `SELECT tenant_id, user_id
       FROM auth_password_reset_token
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHash]
    );

    const tokenRow = tokenRows.rows[0];
    if (!tokenRow) {
      return "invalid_or_expired_token";
    }

    const updated = await withTenantClient(tokenRow.tenant_id, async (client) => {
      const consume = await client.query(
        `UPDATE auth_password_reset_token
         SET consumed_at = NOW()
         WHERE token_hash = $1
           AND tenant_id = $2
           AND user_id = $3
           AND consumed_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [tokenHash, tokenRow.tenant_id, tokenRow.user_id]
      );

      if (consume.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE user_account
         SET password_hash = crypt($1, gen_salt('bf'))
         WHERE id = $2
           AND tenant_id = $3`,
        [payload.newPassword, tokenRow.user_id, tokenRow.tenant_id]
      );

      await client.query(
        `UPDATE auth_session
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND tenant_id = $2
           AND revoked_at IS NULL`,
        [tokenRow.user_id, tokenRow.tenant_id]
      );

      return true;
    });

    return updated ? "ok" : "invalid_or_expired_token";
  }

  async function refresh(refreshToken: string): Promise<TokenSet | null> {
    let payload: RefreshTokenPayload;

    try {
      payload = await app.jwt.verify<RefreshTokenPayload>(refreshToken);
    } catch {
      return null;
    }

    if (payload.tokenType !== "refresh") {
      return null;
    }

    // Check session in DB and verify refresh token hash
    const { rows } = await withTenantClient(payload.tenantId, async (client) => {
      return client.query(
        `SELECT s.id, s.tenant_id, s.user_id, s.refresh_token_hash, u.username
         FROM auth_session s
         JOIN user_account u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
         WHERE s.id = $1
           AND s.tenant_id = $2
           AND s.expires_at > NOW()
           AND s.revoked_at IS NULL`,
        [payload.jti, payload.tenantId]
      );
    });

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0] as { id: string; tenant_id: string; user_id: string; refresh_token_hash: string; username: string };

    // Verify the refresh token hash matches what was stored at login (timing-safe)
    const presentedHash = hashToken(refreshToken);
    if (!timingSafeEqual(Buffer.from(session.refresh_token_hash), Buffer.from(presentedHash))) {
      // Hash mismatch: possible token theft. Revoke the session.
      await withTenantClient(payload.tenantId, async (client) => {
        await client.query(
          "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [session.id, payload.tenantId]
        );
      });
      return null;
    }

    // Revoke old session
    await withTenantClient(payload.tenantId, async (client) => {
      await client.query(
        "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [session.id, payload.tenantId]
      );
    });

    // Issue new tokens
    return issueTokens(session.user_id, session.username, session.tenant_id);
  }

  async function logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await app.jwt.verify<RefreshTokenPayload>(refreshToken);
      if (payload.tokenType === "refresh") {
        await withTenantClient(payload.tenantId, async (client) => {
          await client.query(
            "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
            [payload.jti, payload.tenantId]
          );
        });
      }
    } catch {
      // Best-effort logout; invalid token still treated as logged out.
    }
  }

  async function getUserRole(userId: string, tenantId: string): Promise<string | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{ role: string }>(
        `SELECT role
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, tenantId]
      );
    });
    return result.rows[0]?.role ?? null;
  }

  async function getUserRoleAndStatus(
    userId: string,
    tenantId: string
  ): Promise<{ role: string; status: string } | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{ role: string; status: string }>(
        `SELECT role, status
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, tenantId]
      );
    });
    return result.rows[0] ?? null;
  }

  async function listMembers(tenantId: string): Promise<WorkspaceMember[]> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{
        id: string;
        username: string;
        email: string | null;
        role: string;
        status: string;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `SELECT id, username, email, role, status, created_at, last_login_at
         FROM user_account
         WHERE tenant_id = $1
         ORDER BY created_at ASC`,
        [tenantId]
      );
    });

    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      status: row.status as WorkspaceMember["status"],
      joinedAt: row.created_at.toISOString(),
      lastLoginAt: row.last_login_at?.toISOString() ?? null
    }));
  }

  async function approveMember(
    actorUserId: string,
    tenantId: string,
    targetUserId: string
  ): Promise<WorkspaceMember | "not_owner" | "user_not_found" | "not_pending"> {
    const actorRole = await getUserRole(actorUserId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    return withTenantClient(tenantId, async (client) => {
      const targetResult = await client.query<{
        id: string;
        username: string;
        email: string | null;
        role: string;
        status: string;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `SELECT id, username, email, role, status, created_at, last_login_at
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [targetUserId, tenantId]
      );

      const target = targetResult.rows[0];
      if (!target) {
        return "user_not_found";
      }
      if (target.status !== "pending_approval") {
        return "not_pending";
      }

      await client.query(
        `UPDATE user_account
         SET status = 'active'
         WHERE id = $1
           AND tenant_id = $2`,
        [targetUserId, tenantId]
      );

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'approved', '{}'::jsonb)`,
        [tenantId, targetUserId, actorUserId]
      );

      return {
        id: target.id,
        username: target.username,
        email: target.email,
        role: target.role as UserRole,
        status: "active" as const,
        joinedAt: target.created_at.toISOString(),
        lastLoginAt: target.last_login_at?.toISOString() ?? null
      };
    });
  }

  async function rejectMember(
    actorUserId: string,
    tenantId: string,
    targetUserId: string
  ): Promise<"ok" | "not_owner" | "user_not_found" | "not_pending"> {
    const actorRole = await getUserRole(actorUserId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    return withTenantClient(tenantId, async (client) => {
      const targetResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [targetUserId, tenantId]
      );

      const target = targetResult.rows[0];
      if (!target) {
        return "user_not_found";
      }
      if (target.status !== "pending_approval") {
        return "not_pending";
      }

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'rejected', '{}'::jsonb)`,
        [tenantId, targetUserId, actorUserId]
      );

      await client.query(
        `DELETE FROM user_account
         WHERE id = $1
           AND tenant_id = $2`,
        [targetUserId, tenantId]
      );

      return "ok";
    });
  }

  async function removeMember(
    actorUserId: string,
    tenantId: string,
    targetUserId: string
  ): Promise<"ok" | "not_owner" | "user_not_found" | "cannot_modify_self"> {
    const actorRole = await getUserRole(actorUserId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    if (actorUserId === targetUserId) {
      return "cannot_modify_self";
    }

    return withTenantClient(tenantId, async (client) => {
      const targetResult = await client.query<{ id: string }>(
        `SELECT id
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [targetUserId, tenantId]
      );

      if (targetResult.rows.length === 0) {
        return "user_not_found";
      }

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'removed', '{}'::jsonb)`,
        [tenantId, targetUserId, actorUserId]
      );

      await client.query(
        `DELETE FROM user_account
         WHERE id = $1
           AND tenant_id = $2`,
        [targetUserId, tenantId]
      );

      return "ok";
    });
  }

  async function updateMemberRole(
    actorUserId: string,
    tenantId: string,
    targetUserId: string,
    newRole: UserRole
  ): Promise<WorkspaceMember | "not_owner" | "user_not_found" | "cannot_modify_self"> {
    const actorRole = await getUserRole(actorUserId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    if (actorUserId === targetUserId) {
      return "cannot_modify_self";
    }

    return withTenantClient(tenantId, async (client) => {
      const targetResult = await client.query<{
        id: string;
        username: string;
        email: string | null;
        role: string;
        status: string;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `SELECT id, username, email, role, status, created_at, last_login_at
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [targetUserId, tenantId]
      );

      const target = targetResult.rows[0];
      if (!target) {
        return "user_not_found";
      }

      await client.query(
        `UPDATE user_account
         SET role = $3
         WHERE id = $1
           AND tenant_id = $2`,
        [targetUserId, tenantId, newRole]
      );

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'role_changed', $4::jsonb)`,
        [tenantId, targetUserId, actorUserId, JSON.stringify({ oldRole: target.role, newRole })]
      );

      return {
        id: target.id,
        username: target.username,
        email: target.email,
        role: newRole,
        status: target.status as WorkspaceMember["status"],
        joinedAt: target.created_at.toISOString(),
        lastLoginAt: target.last_login_at?.toISOString() ?? null
      };
    });
  }

  async function getMembershipPolicy(tenantId: string): Promise<MembershipPolicy | null> {
    const result = await withTenantClient(tenantId, async (client) => {
      return client.query<{ membership_policy: string }>(
        `SELECT membership_policy
         FROM tenant
         WHERE id = $1
         LIMIT 1`,
        [tenantId]
      );
    });

    const row = result.rows[0];
    return row ? (row.membership_policy as MembershipPolicy) : null;
  }

  async function updateMembershipPolicy(
    actorUserId: string,
    tenantId: string,
    policy: MembershipPolicy
  ): Promise<MembershipPolicy | "not_owner"> {
    const actorRole = await getUserRole(actorUserId, tenantId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `UPDATE tenant
         SET membership_policy = $2
         WHERE id = $1`,
        [tenantId, policy]
      );
    });

    return policy;
  }

  return {
    login,
    signup,
    joinWorkspace,
    resendEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    changePassword,
    createWorkspaceInvite,
    listWorkspaceInvites,
    revokeWorkspaceInvite,
    getAccountDeletionStatus,
    requestAccountDeletion,
    cancelAccountDeletion,
    getAccountDataExportStatus,
    requestAccountDataExport,
    getAccountDataExportPayload,
    refresh,
    logout,
    getUserRoleAndStatus,
    listMembers,
    approveMember,
    rejectMember,
    removeMember,
    updateMemberRole,
    getMembershipPolicy,
    updateMembershipPolicy
  };
}

function toWorkspaceInvite(
  row: {
    id: string;
    email: string | null;
    status: "pending" | "consumed" | "revoked" | "expired";
    created_at: Date;
    expires_at: Date;
    consumed_at: Date | null;
    revoked_at: Date | null;
  },
  inviteCode: string | null = null,
  inviteUrl: string | null = null
): WorkspaceInvite {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    inviteCode,
    inviteUrl,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    consumedAt: row.consumed_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null
  };
}

function toAccountDataExportStatus(row: {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
  file_size_bytes: number | null;
}): AccountDataExportStatus {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    failedAt: row.failed_at?.toISOString() ?? null,
    errorMessage: row.error_message,
    fileSizeBytes: row.file_size_bytes
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDurationSeconds(input: string): number {
  const match = /^(\d+)([smhd])$/i.exec(input.trim());
  if (!match) {
    return 900;
  }

  const rawValue = match[1] ?? "15";
  const rawUnit = match[2] ?? "m";
  const value = Number.parseInt(rawValue, 10);
  const unit = rawUnit.toLowerCase();

  if (unit === "s") {
    return value;
  }
  if (unit === "m") {
    return value * 60;
  }
  if (unit === "h") {
    return value * 3600;
  }
  return value * 86400;
}

function normalizeTenantSlug(input: string): string {
  return input.trim().toLowerCase();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
