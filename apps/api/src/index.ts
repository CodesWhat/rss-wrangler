import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import fastifyRawBody from "fastify-raw-body";
import Fastify from "fastify";
import { ZodError } from "zod";
import { loadEnv } from "./config/env";
import { authPlugin } from "./plugins/auth";
import { dbPlugin } from "./plugins/db";
import { v1Routes } from "./routes/v1";

async function start() {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn"
    },
    trustProxy: true
  });

  await app.register(sensible);
  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true
  });
  await app.register(cors, {
    origin: env.API_CORS_ORIGIN === "*" ? true : env.API_CORS_ORIGIN.split(",")
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });
  await app.register(jwt, {
    secret: env.AUTH_JWT_SECRET,
    sign: { algorithm: "HS256" },
    verify: { algorithms: ["HS256"] }
  });
  // Accept text/xml and application/xml bodies as raw strings (for OPML import)
  app.addContentTypeParser(
    ["text/xml", "application/xml"],
    { parseAs: "string" },
    (_req, body, done) => { done(null, body); }
  );

  await app.register(dbPlugin, { databaseUrl: env.DATABASE_URL });
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
