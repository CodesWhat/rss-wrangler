import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import type {
  AccountDeletionStatus,
  ForgotPasswordRequest,
  RequestAccountDeletion,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest
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
  ): Promise<TokenSet | "email_not_verified" | null> {
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    if (!tenantId) {
      return null;
    }

    // First try DB-backed user lookup
    const rows = await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, username, email, email_verified_at, password_hash
         FROM user_account
         WHERE username = $1
           AND tenant_id = $2`,
        [username, tenantId]
      );
      return result.rows;
    });
    if (rows.length > 0) {
      const user = rows[0] as UserAccountRow;
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
        `INSERT INTO user_account (tenant_id, username, email, password_hash)
         VALUES ($1, $2, $3, crypt($4, gen_salt('bf')))
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

  return {
    login,
    signup,
    resendEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    changePassword,
    getAccountDeletionStatus,
    requestAccountDeletion,
    cancelAccountDeletion,
    refresh,
    logout
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
