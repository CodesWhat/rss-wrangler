import type { Pool, PoolClient } from "pg";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: {
      userId: string;
      tenantId: string;
      role?: string;
    };
    dbClient?: PoolClient;
  }

  interface FastifyInstance {
    verifyAccessToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply
    ) => Promise<void>;
    pg: Pool;
  }
}
