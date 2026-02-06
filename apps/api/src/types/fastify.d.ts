import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    verifyAccessToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    pg: Pool;
  }
}
