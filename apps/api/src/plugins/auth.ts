import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

export const authPlugin = fp(async (app) => {
  app.decorate("verifyAccessToken", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; tenantId?: string; tokenType: string }>();
      if (payload.tokenType !== "access" || !payload.tenantId) {
        return reply.unauthorized("invalid token type");
      }
      request.authContext = {
        userId: payload.sub,
        tenantId: payload.tenantId
      };
    } catch {
      return reply.unauthorized("invalid access token");
    }
  });
});
