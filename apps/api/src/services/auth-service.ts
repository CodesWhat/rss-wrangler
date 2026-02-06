import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
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

interface SessionRecord {
  username: string;
  expiresAt: number;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export function createAuthService(app: FastifyInstance, env: ApiEnv) {
  async function issueTokens(username: string): Promise<TokenSet> {
    const sessionId = randomUUID();
    const now = Date.now();
    const refreshTtlSeconds = parseDurationSeconds(env.REFRESH_TOKEN_TTL);
    const accessTtlSeconds = parseDurationSeconds(env.ACCESS_TOKEN_TTL);

    app.refreshSessions.set(sessionId, {
      username,
      expiresAt: now + refreshTtlSeconds * 1000
    });

    const accessToken = await app.jwt.sign(
      {
        sub: username,
        tokenType: "access"
      } satisfies AccessTokenPayload,
      {
        expiresIn: env.ACCESS_TOKEN_TTL
      }
    );

    const refreshToken = await app.jwt.sign(
      {
        sub: username,
        tokenType: "refresh",
        jti: sessionId
      } satisfies RefreshTokenPayload,
      {
        expiresIn: env.REFRESH_TOKEN_TTL
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: accessTtlSeconds
    };
  }

  async function login(username: string, password: string): Promise<TokenSet | null> {
    if (username !== env.AUTH_USERNAME || password !== env.AUTH_PASSWORD) {
      return null;
    }

    return issueTokens(username);
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

    const session = app.refreshSessions.get(payload.jti);
    if (!session) {
      return null;
    }

    if (session.expiresAt < Date.now()) {
      app.refreshSessions.delete(payload.jti);
      return null;
    }

    app.refreshSessions.delete(payload.jti);
    return issueTokens(payload.sub);
  }

  async function logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await app.jwt.verify<RefreshTokenPayload>(refreshToken);
      if (payload.tokenType === "refresh") {
        app.refreshSessions.delete(payload.jti);
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
