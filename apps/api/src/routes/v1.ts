import {
  addFeedRequestSchema,
  clusterFeedbackRequestSchema,
  createFilterRuleRequestSchema,
  eventsBatchRequestSchema,
  listClustersQuerySchema,
  loginRequestSchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updateSettingsRequestSchema
} from "@rss-wrangler/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiEnv } from "../config/env";
import { createAuthService } from "../services/auth-service";
import { InMemoryStore } from "../services/store";

const clusterIdParams = z.object({ id: z.string().uuid() });
const feedIdParams = z.object({ id: z.string().uuid() });
const filterIdParams = z.object({ id: z.string().uuid() });

const authRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const authLogoutSchema = z.object({
  refreshToken: z.string().optional()
});

export const v1Routes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const store = new InMemoryStore();
  const auth = createAuthService(app, env);

  app.get("/health", async () => ({ ok: true, service: "api" }));

  app.post("/v1/auth/login", async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);
    const tokens = await auth.login(payload.username, payload.password);

    if (!tokens) {
      return reply.unauthorized("invalid credentials");
    }

    return tokens;
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const payload = authRefreshSchema.parse(request.body);
    const tokens = await auth.refresh(payload.refreshToken);

    if (!tokens) {
      return reply.unauthorized("invalid refresh token");
    }

    return tokens;
  });

  app.post("/v1/auth/logout", async (request) => {
    const payload = authLogoutSchema.parse(request.body ?? {});
    await auth.logout(payload.refreshToken);
    return { ok: true };
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", protectedRoutes.verifyAccessToken);

    protectedRoutes.get("/v1/clusters", async (request) => {
      const query = listClustersQuerySchema.parse(request.query);
      return store.listClusters(query);
    });

    protectedRoutes.get("/v1/clusters/:id", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const cluster = store.getCluster(id);
      if (!cluster) {
        return reply.notFound("cluster not found");
      }
      return cluster;
    });

    protectedRoutes.post("/v1/clusters/:id/read", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!store.markRead(id)) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/save", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!store.saveCluster(id)) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/split", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!store.splitCluster(id)) {
        return reply.notFound("cluster not found");
      }
      return { ok: true, status: "accepted" };
    });

    protectedRoutes.post("/v1/clusters/:id/feedback", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = clusterFeedbackRequestSchema.parse(request.body);
      if (!store.submitFeedback(id, payload)) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/folders", async () => store.listFolders());

    protectedRoutes.get("/v1/feeds", async () => store.listFeeds());

    protectedRoutes.post("/v1/feeds", async (request) => {
      const payload = addFeedRequestSchema.parse(request.body);
      return store.addFeed(payload);
    });

    protectedRoutes.patch("/v1/feeds/:id", async (request, reply) => {
      const { id } = feedIdParams.parse(request.params);
      const payload = updateFeedRequestSchema.parse(request.body);
      const feed = store.updateFeed(id, payload);
      if (!feed) {
        return reply.notFound("feed not found");
      }
      return feed;
    });

    protectedRoutes.post("/v1/opml/import", async () => ({ ok: true, status: "accepted" }));

    protectedRoutes.get("/v1/filters", async () => store.listFilters());

    protectedRoutes.post("/v1/filters", async (request) => {
      const payload = createFilterRuleRequestSchema.parse(request.body);
      return store.createFilter(payload);
    });

    protectedRoutes.patch("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      const payload = updateFilterRuleRequestSchema.parse(request.body);
      const filter = store.updateFilter(id, payload);
      if (!filter) {
        return reply.notFound("filter not found");
      }
      return filter;
    });

    protectedRoutes.delete("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      if (!store.deleteFilter(id)) {
        return reply.notFound("filter not found");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/digests", async () => store.listDigests());

    protectedRoutes.post("/v1/events", async (request) => {
      const payload = eventsBatchRequestSchema.parse(request.body);
      return store.recordEvents(payload.events);
    });

    protectedRoutes.get("/v1/settings", async () => store.getSettings());

    protectedRoutes.post("/v1/settings", async (request) => {
      const payload = updateSettingsRequestSchema.parse(request.body);
      return store.updateSettings(payload);
    });
  });
};
