import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

export const authPlugin = fp(async (app) => {
  app.decorate("verifyAccessToken", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{
        sub: string;
        accountId?: string;
        tenantId?: string;
        tokenType: string;
      }>();
      const accountId = payload.accountId ?? payload.tenantId;
      if (payload.tokenType !== "access" || !accountId) {
        return reply.unauthorized("invalid token type");
      }
      request.authContext = {
        userId: payload.sub,
        accountId,
      };
    } catch {
      return reply.unauthorized("invalid access token");
    }
  });
});
