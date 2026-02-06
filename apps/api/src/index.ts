import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";
import { loadEnv } from "./config/env";
import { authPlugin } from "./plugins/auth";
import { v1Routes } from "./routes/v1";

async function start() {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn"
    }
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: env.API_CORS_ORIGIN === "*" ? true : env.API_CORS_ORIGIN.split(",")
  });
  await app.register(jwt, {
    secret: env.AUTH_JWT_SECRET
  });
  await app.register(authPlugin);
  await app.register(v1Routes, { env });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation failed",
        issues: error.issues,
        route: request.routeOptions.url
      });
    }

    request.log.error({ err: error }, "unhandled error");
    return reply.internalServerError("internal error");
  });

  await app.listen({
    port: env.API_PORT,
    host: env.API_HOST
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
