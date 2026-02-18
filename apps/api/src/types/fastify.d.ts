import type { Pool, PoolClient } from "pg";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: {
      userId: string;
      accountId: string;
      role?: string;
    };
    dbClient?: PoolClient;
    rawBody?: string;
  }

  interface FastifyInstance {
    verifyAccessToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
    pg: Pool;
  }
}
