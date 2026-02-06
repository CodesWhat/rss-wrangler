import type { FastifyReply, FastifyRequest } from "fastify";

interface RefreshSession {
  username: string;
  expiresAt: number;
}

declare module "fastify" {
  interface FastifyInstance {
    verifyAccessToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    refreshSessions: Map<string, RefreshSession>;
  }
}
