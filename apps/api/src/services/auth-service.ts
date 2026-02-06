import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ApiEnv } from "../config/env";

interface AccessTokenPayload {
  sub: string;
  tokenType: "access";
}

interface RefreshTokenPayload {
  sub: string;
  tokenType: "refresh";
  jti: string;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export function createAuthService(app: FastifyInstance, env: ApiEnv, pool: Pool) {
  async function issueTokens(userId: string, username: string): Promise<TokenSet> {
    const sessionId = randomUUID();
    const refreshTtlSeconds = parseDurationSeconds(env.REFRESH_TOKEN_TTL);
    const accessTtlSeconds = parseDurationSeconds(env.ACCESS_TOKEN_TTL);

    const accessToken = await app.jwt.sign(
      {
        sub: userId,
        tokenType: "access"
      } satisfies AccessTokenPayload,
      {
        expiresIn: env.ACCESS_TOKEN_TTL
      }
    );

    const refreshToken = await app.jwt.sign(
      {
        sub: userId,
        tokenType: "refresh",
        jti: sessionId
      } satisfies RefreshTokenPayload,
      {
        expiresIn: env.REFRESH_TOKEN_TTL
      }
    );

    // Store session in DB
    const tokenHash = hashToken(refreshToken);
    await pool.query(
      `INSERT INTO auth_session (id, user_id, refresh_token_hash, expires_at, last_seen_at)
       VALUES ($1, $2, $3, NOW() + $4::interval, NOW())`,
      [sessionId, userId, tokenHash, `${refreshTtlSeconds} seconds`]
    );

    // Update last_login_at
    await pool.query("UPDATE user_account SET last_login_at = NOW() WHERE id = $1", [userId]);

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: accessTtlSeconds
    };
  }

  async function login(username: string, password: string): Promise<TokenSet | null> {
    // First try DB-backed user lookup
    const { rows } = await pool.query(
      "SELECT id, username, password_hash FROM user_account WHERE username = $1",
      [username]
    );

    if (rows.length > 0) {
      const user = rows[0] as { id: string; username: string; password_hash: string };
      // Verify password using pgcrypto's crypt function
      const verifyResult = await pool.query(
        "SELECT (password_hash = crypt($1, password_hash)) AS valid FROM user_account WHERE id = $2",
        [password, user.id]
      );
      const isValid = (verifyResult.rows[0] as { valid: boolean } | undefined)?.valid === true;
      if (!isValid) {
        return null;
      }
      return issueTokens(user.id, user.username);
    }

    // Fallback to env-based auth for bootstrapping (if no users in DB)
    const countResult = await pool.query("SELECT COUNT(*) AS cnt FROM user_account");
    const userCount = Number((countResult.rows[0] as { cnt: string }).cnt);
    if (
      userCount === 0 &&
      timingSafeEqual(Buffer.from(username), Buffer.from(env.AUTH_USERNAME)) &&
      timingSafeEqual(Buffer.from(password), Buffer.from(env.AUTH_PASSWORD))
    ) {
      // Auto-create the admin user in the DB using pgcrypto
      const insertResult = await pool.query(
        `INSERT INTO user_account (username, password_hash)
         VALUES ($1, crypt($2, gen_salt('bf')))
         RETURNING id, username`,
        [username, password]
      );
      const newUser = insertResult.rows[0] as { id: string; username: string };
      return issueTokens(newUser.id, newUser.username);
    }

    return null;
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
    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, s.refresh_token_hash, u.username
       FROM auth_session s
       JOIN user_account u ON u.id = s.user_id
       WHERE s.id = $1
         AND s.expires_at > NOW()
         AND s.revoked_at IS NULL`,
      [payload.jti]
    );

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0] as { id: string; user_id: string; refresh_token_hash: string; username: string };

    // Verify the refresh token hash matches what was stored at login (timing-safe)
    const presentedHash = hashToken(refreshToken);
    if (!timingSafeEqual(Buffer.from(session.refresh_token_hash), Buffer.from(presentedHash))) {
      // Hash mismatch: possible token theft. Revoke the session.
      await pool.query("UPDATE auth_session SET revoked_at = NOW() WHERE id = $1", [session.id]);
      return null;
    }

    // Revoke old session
    await pool.query("UPDATE auth_session SET revoked_at = NOW() WHERE id = $1", [session.id]);

    // Issue new tokens
    return issueTokens(session.user_id, session.username);
  }

  async function logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await app.jwt.verify<RefreshTokenPayload>(refreshToken);
      if (payload.tokenType === "refresh") {
        await pool.query("UPDATE auth_session SET revoked_at = NOW() WHERE id = $1", [payload.jti]);
      }
    } catch {
      // Best-effort logout; invalid token still treated as logged out.
    }
  }

  return {
    login,
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
