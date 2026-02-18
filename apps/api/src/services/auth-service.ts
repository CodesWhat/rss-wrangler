import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AccountDataExportStatus,
  AccountDeletionStatus,
  CreateMemberInviteRequest,
  ForgotPasswordRequest,
  JoinAccountRequest,
  Member,
  MemberInvite,
  RequestAccountDeletion,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest,
  UserRole,
} from "@rss-wrangler/contracts";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import type { ApiEnv } from "../config/env";
import { createEmailService } from "./email-service";

interface AccessTokenPayload {
  sub: string;
  accountId: string;
  tokenType: "access";
}

interface RefreshTokenPayload {
  sub: string;
  accountId: string;
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

const DEFAULT_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

export function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthService(app: FastifyInstance, env: ApiEnv, pool: Pool) {
  const emailService = createEmailService(env, app.log);

  async function withAccountClient<T>(
    accountId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [accountId]);
      return await fn(client);
    } finally {
      try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_ACCOUNT_ID]);
      } catch {
        // Best effort reset.
      }
      client.release();
    }
  }

  async function resolveAccountIdBySlug(accountSlug: string): Promise<string | null> {
    const normalized = normalizeAccountSlug(accountSlug);
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM tenant WHERE slug = $1 LIMIT 1",
      [normalized],
    );
    return rows[0]?.id ?? null;
  }

  function buildAppUrl(pathWithQuery: string): string {
    return new URL(pathWithQuery, env.APP_BASE_URL).toString();
  }

  async function issueEmailVerificationToken(
    accountId: string,
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const ttlSeconds = parseDurationSeconds(env.EMAIL_VERIFICATION_TOKEN_TTL);

    const result = await withAccountClient(accountId, async (client) => {
      await client.query(
        `UPDATE auth_email_verification_token
         SET consumed_at = NOW()
         WHERE tenant_id = $1
           AND user_id = $2
           AND consumed_at IS NULL`,
        [accountId, userId],
      );

      return client.query<{ expires_at: Date }>(
        `INSERT INTO auth_email_verification_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + $4::interval)
         RETURNING expires_at`,
        [accountId, userId, tokenHash, `${ttlSeconds} seconds`],
      );
    });

    const expiresAt = result.rows[0]?.expires_at;
    if (!expiresAt) {
      throw new Error("failed to issue email verification token");
    }
    return { token, expiresAt };
  }

  async function sendVerificationEmail(
    accountId: string,
    userId: string,
    email: string,
    username: string,
  ): Promise<void> {
    const issued = await issueEmailVerificationToken(accountId, userId);
    const verificationUrl = buildAppUrl(`/verify-email?token=${encodeURIComponent(issued.token)}`);
    const expires = issued.expiresAt.toISOString();

    try {
      await emailService.send({
        to: email,
        subject: "Verify your RSS Wrangler email",
        text: `Hi ${username},\n\nVerify your email by opening this link:\n${verificationUrl}\n\nThis link expires at ${expires}.`,
        html: `<p>Hi ${escapeHtml(username)},</p><p>Verify your email by opening this link:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link expires at ${expires}.</p>`,
      });
    } catch (error) {
      app.log.error({ err: error, accountId, userId, email }, "failed to send verification email");
    }
  }

  async function issuePasswordResetToken(
    accountId: string,
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const ttlSeconds = parseDurationSeconds(env.PASSWORD_RESET_TOKEN_TTL);

    const result = await withAccountClient(accountId, async (client) => {
      await client.query(
        `UPDATE auth_password_reset_token
         SET consumed_at = NOW()
         WHERE tenant_id = $1
           AND user_id = $2
           AND consumed_at IS NULL`,
        [accountId, userId],
      );

      return client.query<{ expires_at: Date }>(
        `INSERT INTO auth_password_reset_token (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + $4::interval)
         RETURNING expires_at`,
        [accountId, userId, tokenHash, `${ttlSeconds} seconds`],
      );
    });

    const expiresAt = result.rows[0]?.expires_at;
    if (!expiresAt) {
      throw new Error("failed to issue password reset token");
    }
    return { token, expiresAt };
  }

  async function sendPasswordResetEmail(
    accountId: string,
    userId: string,
    email: string,
    username: string,
  ): Promise<void> {
    const issued = await issuePasswordResetToken(accountId, userId);
    const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(issued.token)}`);
    const expires = issued.expiresAt.toISOString();

    try {
      await emailService.send({
        to: email,
        subject: "Reset your RSS Wrangler password",
        text: `Hi ${username},\n\nReset your password by opening this link:\n${resetUrl}\n\nThis link expires at ${expires}.`,
        html: `<p>Hi ${escapeHtml(username)},</p><p>Reset your password by opening this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires at ${expires}.</p>`,
      });
    } catch (error) {
      app.log.error(
        { err: error, accountId, userId, email },
        "failed to send password reset email",
      );
    }
  }

  async function issueTokens(
    userId: string,
    _username: string,
    accountId: string,
  ): Promise<TokenSet> {
    const sessionId = randomUUID();
    const refreshTtlSeconds = parseDurationSeconds(env.REFRESH_TOKEN_TTL);
    const accessTtlSeconds = parseDurationSeconds(env.ACCESS_TOKEN_TTL);

    const accessToken = await app.jwt.sign(
      {
        sub: userId,
        accountId,
        tokenType: "access",
      } satisfies AccessTokenPayload,
      {
        expiresIn: env.ACCESS_TOKEN_TTL,
      },
    );

    const refreshToken = await app.jwt.sign(
      {
        sub: userId,
        accountId,
        tokenType: "refresh",
        jti: sessionId,
      } satisfies RefreshTokenPayload,
      {
        expiresIn: env.REFRESH_TOKEN_TTL,
      },
    );

    // Store session in DB
    const tokenHash = hashToken(refreshToken);
    await withAccountClient(accountId, async (client) => {
      await client.query(
        `INSERT INTO auth_session (id, tenant_id, user_id, refresh_token_hash, expires_at, last_seen_at)
         VALUES ($1, $2, $3, $4, NOW() + $5::interval, NOW())`,
        [sessionId, accountId, userId, tokenHash, `${refreshTtlSeconds} seconds`],
      );

      // Update last_login_at
      await client.query(
        "UPDATE user_account SET last_login_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [userId, accountId],
      );
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: accessTtlSeconds,
    };
  }

  async function login(
    username: string,
    password: string,
    accountSlug = "default",
  ): Promise<TokenSet | "email_not_verified" | "suspended" | null> {
    const accountId = await resolveAccountIdBySlug(accountSlug);
    if (!accountId) {
      return null;
    }

    // First try DB-backed user lookup
    const rows = await withAccountClient(accountId, async (client) => {
      const result = await client.query<UserAccountRow & { status: string }>(
        `SELECT id, tenant_id, username, email, email_verified_at, password_hash, status
         FROM user_account
         WHERE username = $1
           AND tenant_id = $2`,
        [username, accountId],
      );
      return result.rows;
    });
    if (rows.length > 0) {
      const user = rows[0] as UserAccountRow & { status: string };
      // Verify password using pgcrypto's crypt function
      const verifyResult = await withAccountClient(accountId, async (client) => {
        return client.query(
          `SELECT (password_hash = crypt($1, password_hash)) AS valid
           FROM user_account
           WHERE id = $2
             AND tenant_id = $3`,
          [password, user.id, accountId],
        );
      });
      const isValid = (verifyResult.rows[0] as { valid: boolean } | undefined)?.valid === true;
      if (!isValid) {
        return null;
      }
      if (user.status === "suspended") {
        return "suspended";
      }
      if (env.REQUIRE_EMAIL_VERIFICATION && user.email && !user.email_verified_at) {
        return "email_not_verified";
      }
      return issueTokens(user.id, user.username, user.tenant_id);
    }

    // Fallback to env-based auth for default-account bootstrapping.
    const countResult = await withAccountClient(accountId, async (client) => {
      return client.query("SELECT COUNT(*) AS cnt FROM user_account WHERE tenant_id = $1", [
        accountId,
      ]);
    });
    const userCount = Number((countResult.rows[0] as { cnt: string } | undefined)?.cnt ?? "0");
    if (
      accountId === DEFAULT_ACCOUNT_ID &&
      userCount === 0 &&
      timingSafeStringEqual(username, env.AUTH_USERNAME) &&
      timingSafeStringEqual(password, env.AUTH_PASSWORD)
    ) {
      // Auto-create the admin user in the DB using pgcrypto
      const insertResult = await withAccountClient(accountId, async (client) => {
        return client.query(
          `INSERT INTO user_account (tenant_id, username, password_hash)
           VALUES ($1, $2, crypt($3, gen_salt('bf')))
           RETURNING id, tenant_id, username`,
          [accountId, username, password],
        );
      });
      const newUser = insertResult.rows[0] as { id: string; tenant_id: string; username: string };
      return issueTokens(newUser.id, newUser.username, newUser.tenant_id);
    }

    return null;
  }

  async function signup(
    payload: SignupRequest,
  ): Promise<
    TokenSet | "account_slug_taken" | "username_taken" | "email_taken" | "verification_required"
  > {
    const accountSlug = normalizeAccountSlug(payload.accountSlug ?? payload.tenantSlug);
    const accountName = (payload.accountName ?? payload.tenantName).trim();
    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();

    const existingAccountId = await resolveAccountIdBySlug(accountSlug);
    if (existingAccountId) {
      return "account_slug_taken";
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_ACCOUNT_ID]);

      const accountInsert = await client.query<{ id: string }>(
        `INSERT INTO tenant (slug, name)
         VALUES ($1, $2)
         RETURNING id`,
        [accountSlug, accountName],
      );
      const accountId = accountInsert.rows[0]?.id;
      if (!accountId) {
        throw new Error("account creation failed");
      }

      await client.query("SELECT set_config('app.tenant_id', $1, false)", [accountId]);

      const existingUser = await client.query(
        `SELECT id
         FROM user_account
         WHERE tenant_id = $1
           AND username = $2
         LIMIT 1`,
        [accountId, username],
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
        [accountId, email],
      );
      if (existingEmail.rows.length > 0) {
        await client.query("ROLLBACK");
        return "email_taken";
      }

      const userInsert = await client.query<{ id: string }>(
        `INSERT INTO user_account (tenant_id, username, email, password_hash, role)
         VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), 'owner')
         RETURNING id`,
        [accountId, username, email, payload.password],
      );

      await client.query("COMMIT");

      const userId = userInsert.rows[0]?.id;
      if (!userId) {
        throw new Error("user creation failed");
      }

      await sendVerificationEmail(accountId, userId, email, username);

      if (env.REQUIRE_EMAIL_VERIFICATION) {
        return "verification_required";
      }

      return issueTokens(userId, username, accountId);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Best effort rollback.
      }
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === "tenant_slug_key") {
        return "account_slug_taken";
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
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_ACCOUNT_ID]);
      } catch {
        // Best effort reset.
      }
      client.release();
    }
  }

  async function joinAccount(
    payload: JoinAccountRequest,
  ): Promise<
    | TokenSet
    | "account_not_found"
    | "invite_required"
    | "invalid_invite_code"
    | "username_taken"
    | "email_taken"
    | "verification_required"
  > {
    const accountId = await resolveAccountIdBySlug(payload.accountSlug ?? "default");
    if (!accountId) {
      return "account_not_found";
    }

    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();
    const inviteCode = payload.inviteCode?.trim();

    try {
      const existingCountResult = await withAccountClient(accountId, async (client) => {
        return client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM user_account
           WHERE tenant_id = $1`,
          [accountId],
        );
      });
      const existingCount = Number.parseInt(existingCountResult.rows[0]?.cnt ?? "0", 10);
      const creatingOwner = existingCount === 0;

      let inviteId: string | null = null;
      if (!creatingOwner) {
        if (!inviteCode) {
          return "invite_required";
        }

        const inviteHash = hashToken(inviteCode);
        const inviteResult = await withAccountClient(accountId, async (client) => {
          // Normalize expired pending invites before lookup.
          await client.query(
            `UPDATE workspace_invite
             SET status = 'expired'
             WHERE tenant_id = $1
               AND status = 'pending'
               AND expires_at <= NOW()`,
            [accountId],
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
            [accountId, inviteHash],
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

      const existingUser = await withAccountClient(accountId, async (client) => {
        return client.query(
          `SELECT id
           FROM user_account
           WHERE tenant_id = $1
             AND username = $2
           LIMIT 1`,
          [accountId, username],
        );
      });
      if (existingUser.rows.length > 0) {
        return "username_taken";
      }

      const existingEmail = await withAccountClient(accountId, async (client) => {
        return client.query(
          `SELECT id
           FROM user_account
           WHERE tenant_id = $1
             AND lower(email) = $2
           LIMIT 1`,
          [accountId, email],
        );
      });
      if (existingEmail.rows.length > 0) {
        return "email_taken";
      }

      const userRole: UserRole = creatingOwner ? "owner" : "member";

      const insert = await withAccountClient(accountId, async (client) => {
        return client.query<{ id: string }>(
          `INSERT INTO user_account (tenant_id, username, email, password_hash, role, status)
           VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), $5, 'active')
           RETURNING id`,
          [accountId, username, email, payload.password, userRole],
        );
      });

      const userId = insert.rows[0]?.id;
      if (!userId) {
        throw new Error("user creation failed");
      }

      if (inviteId) {
        await withAccountClient(accountId, async (client) => {
          await client.query(
            `UPDATE workspace_invite
             SET status = 'consumed',
                 consumed_at = NOW(),
                 consumed_by_user_id = $3
             WHERE id = $1
               AND tenant_id = $2
               AND status = 'pending'
               AND expires_at > NOW()`,
            [inviteId, accountId, userId],
          );
        });
      }

      await sendVerificationEmail(accountId, userId, email, username);

      if (env.REQUIRE_EMAIL_VERIFICATION) {
        return "verification_required";
      }

      return issueTokens(userId, username, accountId);
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

  async function createMemberInvite(
    userId: string,
    accountId: string,
    payload: CreateMemberInviteRequest,
  ): Promise<MemberInvite | "not_owner"> {
    const actorRole = await getUserRole(userId, accountId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    const inviteCode = randomBytes(24).toString("hex");
    const inviteCodeHash = hashToken(inviteCode);
    const invitedEmail = payload.email?.trim().toLowerCase() ?? null;

    const accountResult = await withAccountClient(accountId, async (client) => {
      return client.query<{ slug: string }>(
        `SELECT slug
         FROM tenant
         WHERE id = $1
         LIMIT 1`,
        [accountId],
      );
    });
    const accountSlug = accountResult.rows[0]?.slug;
    if (!accountSlug) {
      throw new Error("account not found for invite");
    }

    const insert = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId, inviteCodeHash, invitedEmail, payload.expiresInDays],
      );
    });

    const row = insert.rows[0];
    if (!row) {
      throw new Error("failed to create member invite");
    }

    const inviteUrl = buildAppUrl(
      `/join?tenant=${encodeURIComponent(accountSlug)}&invite=${encodeURIComponent(inviteCode)}`,
    );

    return toMemberInvite(row, inviteCode, inviteUrl);
  }

  async function listMemberInvites(
    userId: string,
    accountId: string,
  ): Promise<MemberInvite[] | "not_owner"> {
    const actorRole = await getUserRole(userId, accountId);
    if (actorRole !== "owner") {
      return "not_owner";
    }
    const result = await withAccountClient(accountId, async (client) => {
      await client.query(
        `UPDATE workspace_invite
         SET status = 'expired'
         WHERE tenant_id = $1
           AND status = 'pending'
           AND expires_at <= NOW()`,
        [accountId],
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
        [accountId],
      );
    });

    return result.rows.map((row) => toMemberInvite(row));
  }

  async function revokeMemberInvite(
    userId: string,
    accountId: string,
    inviteId: string,
  ): Promise<MemberInvite | "not_owner" | null> {
    const actorRole = await getUserRole(userId, accountId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    const result = await withAccountClient(accountId, async (client) => {
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
        [inviteId, accountId, userId],
      );
    });

    const row = result.rows[0];
    return row ? toMemberInvite(row) : null;
  }

  async function changePassword(
    userId: string,
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<"ok" | "invalid_current_password" | "same_password" | "user_not_found"> {
    if (currentPassword === newPassword) {
      return "same_password";
    }

    const userResult = await withAccountClient(accountId, async (client) => {
      return client.query<{ password_hash: string }>(
        `SELECT password_hash
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, accountId],
      );
    });

    if (userResult.rows.length === 0) {
      return "user_not_found";
    }

    const verifyResult = await withAccountClient(accountId, async (client) => {
      return client.query<{ valid: boolean }>(
        `SELECT (password_hash = crypt($1, password_hash)) AS valid
         FROM user_account
         WHERE id = $2
           AND tenant_id = $3`,
        [currentPassword, userId, accountId],
      );
    });

    const isValid = verifyResult.rows[0]?.valid === true;
    if (!isValid) {
      return "invalid_current_password";
    }

    await withAccountClient(accountId, async (client) => {
      await client.query(
        `UPDATE user_account
         SET password_hash = crypt($1, gen_salt('bf'))
         WHERE id = $2
           AND tenant_id = $3`,
        [newPassword, userId, accountId],
      );

      await client.query(
        `UPDATE auth_session
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND tenant_id = $2
           AND revoked_at IS NULL`,
        [userId, accountId],
      );
    });

    return "ok";
  }

  async function getAccountDeletionStatus(
    userId: string,
    accountId: string,
  ): Promise<AccountDeletionStatus | null> {
    const result = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
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
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }

  async function requestAccountDeletion(
    userId: string,
    accountId: string,
    payload: RequestAccountDeletion,
  ): Promise<"invalid_password" | AccountDeletionStatus> {
    const verifyResult = await withAccountClient(accountId, async (client) => {
      return client.query<{ valid: boolean }>(
        `SELECT (password_hash = crypt($1, password_hash)) AS valid
         FROM user_account
         WHERE id = $2
           AND tenant_id = $3`,
        [payload.password, userId, accountId],
      );
    });

    if (verifyResult.rows[0]?.valid !== true) {
      return "invalid_password";
    }

    const existing = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
      );
    });

    if (existing.rows[0]) {
      const row = existing.rows[0];
      return {
        id: row.id,
        status: row.status,
        requestedAt: row.requested_at.toISOString(),
        cancelledAt: row.cancelled_at?.toISOString() ?? null,
        completedAt: row.completed_at?.toISOString() ?? null,
      };
    }

    const insert = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
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
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }

  async function cancelAccountDeletion(
    userId: string,
    accountId: string,
  ): Promise<AccountDeletionStatus | null> {
    const result = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
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
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }

  async function getAccountDataExportStatus(
    userId: string,
    accountId: string,
  ): Promise<AccountDataExportStatus | null> {
    const result = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
      );
    });

    const row = result.rows[0];
    return row ? toAccountDataExportStatus(row) : null;
  }

  async function requestAccountDataExport(
    userId: string,
    accountId: string,
  ): Promise<AccountDataExportStatus> {
    const active = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
      );
    });

    if (active.rows[0]) {
      return toAccountDataExportStatus(active.rows[0]);
    }

    const insert = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
      );
    });

    const row = insert.rows[0];
    if (!row) {
      throw new Error("failed to create account data export request");
    }

    void processAccountDataExportRequest(accountId, userId, row.id);
    return toAccountDataExportStatus(row);
  }

  async function processAccountDataExportRequest(
    accountId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const claimed = await withAccountClient(accountId, async (client) => {
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
        [requestId, accountId, userId],
      );
    });

    if (!claimed.rows[0]) {
      return;
    }

    try {
      const exportPayload = await buildAccountDataExportPayload(accountId, userId);
      const payloadJson = JSON.stringify(exportPayload);
      const fileSizeBytes = Buffer.byteLength(payloadJson, "utf8");

      await withAccountClient(accountId, async (client) => {
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
          [requestId, accountId, userId, payloadJson, fileSizeBytes],
        );
      });

      app.log.info(
        { accountId, userId, requestId, fileSizeBytes },
        "account data export completed",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await withAccountClient(accountId, async (client) => {
        await client.query(
          `UPDATE account_data_export_request
           SET status = 'failed',
               failed_at = NOW(),
               error_message = $4
           WHERE id = $1
             AND tenant_id = $2
             AND user_id = $3`,
          [requestId, accountId, userId, message.slice(0, 500)],
        );
      });

      app.log.error({ err: error, accountId, userId, requestId }, "account data export failed");
    }
  }

  async function buildAccountDataExportPayload(
    accountId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    return withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
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
        [accountId],
      );

      const folderRows = await client.query<{
        id: string;
        name: string;
        created_at: Date;
      }>(
        `SELECT id, name, created_at
         FROM folder
         ORDER BY name ASC`,
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
        [accountId],
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
        [accountId],
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
        [accountId],
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
        [accountId],
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
        [accountId],
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
        [accountId],
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
        [accountId],
      );

      return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        accountId,
        account: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.created_at.toISOString(),
          emailVerifiedAt: user.email_verified_at?.toISOString() ?? null,
          lastLoginAt: user.last_login_at?.toISOString() ?? null,
        },
        settings: settingsResult.rows[0]?.data ?? {},
        folders: folderRows.rows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at.toISOString(),
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
          lastPolledAt: row.last_polled_at?.toISOString() ?? null,
        })),
        feedTopics: feedTopicRows.rows.map((row) => ({
          feedId: row.feed_id,
          topicId: row.topic_id,
          topicName: row.topic_name,
          status: row.status,
          confidence: Number(row.confidence),
          proposedAt: row.proposed_at.toISOString(),
          resolvedAt: row.resolved_at?.toISOString() ?? null,
        })),
        filters: filterRows.rows.map((row) => ({
          id: row.id,
          pattern: row.pattern,
          type: row.type,
          mode: row.mode,
          breakoutEnabled: row.breakout_enabled,
          createdAt: row.created_at.toISOString(),
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
          sourceUrl: row.source_url,
        })),
        annotations: annotationRows.rows.map((row) => ({
          id: row.id,
          clusterId: row.cluster_id,
          highlightedText: row.highlighted_text,
          note: row.note,
          color: row.color,
          createdAt: row.created_at.toISOString(),
        })),
        events: eventRows.rows.map((row) => ({
          id: row.id,
          idempotencyKey: row.idempotency_key,
          ts: row.ts.toISOString(),
          type: row.type,
          payload: row.payload_json,
        })),
        digests: digestRows.rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at.toISOString(),
          startTs: row.start_ts.toISOString(),
          endTs: row.end_ts.toISOString(),
          title: row.title,
          body: row.body,
          entries: row.entries_json,
        })),
      } satisfies Record<string, unknown>;
    });
  }

  async function getAccountDataExportPayload(
    userId: string,
    accountId: string,
  ): Promise<{ payload: unknown; requestedAt: string; completedAt: string } | null> {
    const result = await withAccountClient(accountId, async (client) => {
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
        [accountId, userId],
      );
    });

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      payload: row.export_payload,
      requestedAt: row.requested_at.toISOString(),
      completedAt: row.completed_at.toISOString(),
    };
  }

  async function resendEmailVerification(
    payload: ResendVerificationRequest,
  ): Promise<"ok" | "already_verified"> {
    const accountId = await resolveAccountIdBySlug(payload.accountSlug ?? "default");
    if (!accountId) {
      return "ok";
    }

    const email = payload.email.trim().toLowerCase();
    const userRows = await withAccountClient(accountId, async (client) => {
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
        [accountId, email],
      );
    });

    const user = userRows.rows[0];
    if (!user || !user.email) {
      return "ok";
    }
    if (user.email_verified_at) {
      return "already_verified";
    }

    await sendVerificationEmail(accountId, user.id, user.email, user.username);
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
      [tokenHash],
    );

    const tokenRow = tokenRows.rows[0];
    if (!tokenRow) {
      return "invalid_or_expired_token";
    }

    const updated = await withAccountClient(tokenRow.tenant_id, async (client) => {
      const consume = await client.query(
        `UPDATE auth_email_verification_token
         SET consumed_at = NOW()
         WHERE token_hash = $1
           AND tenant_id = $2
           AND user_id = $3
           AND consumed_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [tokenHash, tokenRow.tenant_id, tokenRow.user_id],
      );

      if (consume.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE user_account
         SET email_verified_at = COALESCE(email_verified_at, NOW())
         WHERE id = $1
           AND tenant_id = $2`,
        [tokenRow.user_id, tokenRow.tenant_id],
      );

      return true;
    });

    return updated ? "ok" : "invalid_or_expired_token";
  }

  async function requestPasswordReset(payload: ForgotPasswordRequest): Promise<void> {
    const accountId = await resolveAccountIdBySlug(payload.accountSlug ?? "default");
    if (!accountId) {
      return;
    }

    const email = payload.email.trim().toLowerCase();
    const userRows = await withAccountClient(accountId, async (client) => {
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
        [accountId, email],
      );
    });

    const user = userRows.rows[0];
    if (!user || !user.email) {
      return;
    }

    await sendPasswordResetEmail(accountId, user.id, user.email, user.username);
  }

  async function resetPassword(
    payload: ResetPasswordRequest,
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
      [tokenHash],
    );

    const tokenRow = tokenRows.rows[0];
    if (!tokenRow) {
      return "invalid_or_expired_token";
    }

    const updated = await withAccountClient(tokenRow.tenant_id, async (client) => {
      const consume = await client.query(
        `UPDATE auth_password_reset_token
         SET consumed_at = NOW()
         WHERE token_hash = $1
           AND tenant_id = $2
           AND user_id = $3
           AND consumed_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [tokenHash, tokenRow.tenant_id, tokenRow.user_id],
      );

      if (consume.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE user_account
         SET password_hash = crypt($1, gen_salt('bf'))
         WHERE id = $2
           AND tenant_id = $3`,
        [payload.newPassword, tokenRow.user_id, tokenRow.tenant_id],
      );

      await client.query(
        `UPDATE auth_session
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND tenant_id = $2
           AND revoked_at IS NULL`,
        [tokenRow.user_id, tokenRow.tenant_id],
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
    const { rows } = await withAccountClient(payload.accountId, async (client) => {
      return client.query(
        `SELECT s.id, s.tenant_id, s.user_id, s.refresh_token_hash, u.username
         FROM auth_session s
         JOIN user_account u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
         WHERE s.id = $1
           AND s.tenant_id = $2
           AND s.expires_at > NOW()
           AND s.revoked_at IS NULL`,
        [payload.jti, payload.accountId],
      );
    });

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0] as {
      id: string;
      tenant_id: string;
      user_id: string;
      refresh_token_hash: string;
      username: string;
    };

    // Verify the refresh token hash matches what was stored at login (timing-safe)
    const presentedHash = hashToken(refreshToken);
    if (!timingSafeEqual(Buffer.from(session.refresh_token_hash), Buffer.from(presentedHash))) {
      // Hash mismatch: possible token theft. Revoke the session.
      await withAccountClient(payload.accountId, async (client) => {
        await client.query(
          "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [session.id, payload.accountId],
        );
      });
      return null;
    }

    // Revoke old session
    await withAccountClient(payload.accountId, async (client) => {
      await client.query(
        "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [session.id, payload.accountId],
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
        await withAccountClient(payload.accountId, async (client) => {
          await client.query(
            "UPDATE auth_session SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2",
            [payload.jti, payload.accountId],
          );
        });
      }
    } catch {
      // Best-effort logout; invalid token still treated as logged out.
    }
  }

  async function getUserRole(userId: string, accountId: string): Promise<string | null> {
    const result = await withAccountClient(accountId, async (client) => {
      return client.query<{ role: string }>(
        `SELECT role
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, accountId],
      );
    });
    return result.rows[0]?.role ?? null;
  }

  async function getUserRoleAndStatus(
    userId: string,
    accountId: string,
  ): Promise<{ role: string; status: string } | null> {
    const result = await withAccountClient(accountId, async (client) => {
      return client.query<{ role: string; status: string }>(
        `SELECT role, status
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [userId, accountId],
      );
    });
    return result.rows[0] ?? null;
  }

  async function listMembers(accountId: string): Promise<Member[]> {
    const result = await withAccountClient(accountId, async (client) => {
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
        [accountId],
      );
    });

    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      status: row.status as Member["status"],
      joinedAt: row.created_at.toISOString(),
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
    }));
  }

  async function removeMember(
    actorUserId: string,
    accountId: string,
    targetUserId: string,
  ): Promise<"ok" | "not_owner" | "user_not_found" | "cannot_modify_self"> {
    const actorRole = await getUserRole(actorUserId, accountId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    if (actorUserId === targetUserId) {
      return "cannot_modify_self";
    }

    return withAccountClient(accountId, async (client) => {
      const targetResult = await client.query<{ id: string }>(
        `SELECT id
         FROM user_account
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [targetUserId, accountId],
      );

      if (targetResult.rows.length === 0) {
        return "user_not_found";
      }

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'removed', '{}'::jsonb)`,
        [accountId, targetUserId, actorUserId],
      );

      await client.query(
        `DELETE FROM user_account
         WHERE id = $1
           AND tenant_id = $2`,
        [targetUserId, accountId],
      );

      return "ok";
    });
  }

  async function updateMemberRole(
    actorUserId: string,
    accountId: string,
    targetUserId: string,
    newRole: UserRole,
  ): Promise<Member | "not_owner" | "user_not_found" | "cannot_modify_self"> {
    const actorRole = await getUserRole(actorUserId, accountId);
    if (actorRole !== "owner") {
      return "not_owner";
    }

    if (actorUserId === targetUserId) {
      return "cannot_modify_self";
    }

    return withAccountClient(accountId, async (client) => {
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
        [targetUserId, accountId],
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
        [targetUserId, accountId, newRole],
      );

      await client.query(
        `INSERT INTO member_event (tenant_id, target_user_id, actor_user_id, event_type, metadata)
         VALUES ($1, $2, $3, 'role_changed', $4::jsonb)`,
        [accountId, targetUserId, actorUserId, JSON.stringify({ oldRole: target.role, newRole })],
      );

      return {
        id: target.id,
        username: target.username,
        email: target.email,
        role: newRole,
        status: target.status as Member["status"],
        joinedAt: target.created_at.toISOString(),
        lastLoginAt: target.last_login_at?.toISOString() ?? null,
      };
    });
  }

  return {
    login,
    signup,
    joinAccount,
    resendEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    changePassword,
    createMemberInvite,
    listMemberInvites,
    revokeMemberInvite,
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
    removeMember,
    updateMemberRole,
  };
}

function toMemberInvite(
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
  inviteUrl: string | null = null,
): MemberInvite {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    inviteCode,
    inviteUrl,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    consumedAt: row.consumed_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
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
    fileSizeBytes: row.file_size_bytes,
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

function normalizeAccountSlug(input: string): string {
  return input.trim().toLowerCase();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
