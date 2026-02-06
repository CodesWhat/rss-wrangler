import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

export const authPlugin = fp(async (app) => {
  app.decorate("verifyAccessToken", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; tokenType: string }>();
      if (payload.tokenType !== "access") {
        return reply.unauthorized("invalid token type");
      }
    } catch {
      return reply.unauthorized("invalid access token");
    }
  });
});
