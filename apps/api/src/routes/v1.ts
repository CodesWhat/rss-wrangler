import {
  addFeedRequestSchema,
  clusterFeedbackRequestSchema,
  changePasswordRequestSchema,
  createAnnotationRequestSchema,
  createFilterRuleRequestSchema,
  eventsBatchRequestSchema,
  forgotPasswordRequestSchema,
  listClustersQuerySchema,
  loginRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  signupRequestSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  requestAccountDeletionSchema,
  recordDwellRequestSchema,
  renameTopicRequestSchema,
  resolveTopicRequestSchema,
  searchQuerySchema,
  statsQuerySchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updateSettingsRequestSchema
} from "@rss-wrangler/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiEnv } from "../config/env";
import { createAuthService } from "../services/auth-service";
import { parseOpml } from "../services/opml-parser";
import { PostgresStore } from "../services/postgres-store";
import { validateFeedUrl } from "../services/url-validator";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const clusterIdParams = z.object({ id: z.string().uuid() });
const feedIdParams = z.object({ id: z.string().uuid() });
const filterIdParams = z.object({ id: z.string().uuid() });
const annotationIdParams = z.object({ id: z.string().uuid() });
const topicIdParams = z.object({ id: z.string().uuid() });

const authRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const authLogoutSchema = z.object({
  refreshToken: z.string().optional()
});

const verifyEmailQuerySchema = z.object({
  token: z.string().min(12).max(512)
});

export const v1Routes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const auth = createAuthService(app, env, app.pg);

  async function releaseTenantClient(request: { dbClient?: { query: (sql: string, params?: unknown[]) => Promise<unknown>; release: () => void } }) {
    if (!request.dbClient) {
      return;
    }

    const client = request.dbClient;
    request.dbClient = undefined;

    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_TENANT_ID]);
    } catch {
      // Best effort; client is being released either way.
    } finally {
      client.release();
    }
  }

  app.get("/health", async () => ({ ok: true, service: "api" }));

  app.post("/v1/auth/login", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute"
      }
    }
  }, async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);
    const tokens = await auth.login(payload.username, payload.password, payload.tenantSlug);

    if (tokens === "email_not_verified") {
      return reply.forbidden("email not verified");
    }
    if (!tokens) {
      return reply.unauthorized("invalid credentials");
    }

    return tokens;
  });

  app.post("/v1/auth/signup", async (request, reply) => {
    const payload = signupRequestSchema.parse(request.body);
    const result = await auth.signup(payload);

    if (result === "tenant_slug_taken") {
      return reply.conflict("tenant slug already taken");
    }
    if (result === "username_taken") {
      return reply.conflict("username already exists");
    }
    if (result === "email_taken") {
      return reply.conflict("email already exists");
    }
    if (result === "verification_required") {
      return reply.code(202).send({ verificationRequired: true, expiresInSeconds: null });
    }

    return result;
  });

  app.post("/v1/auth/resend-verification", async (request) => {
    const payload = resendVerificationRequestSchema.parse(request.body);
    const status = await auth.resendEmailVerification(payload);
    return { ok: true, status };
  });

  app.get("/v1/auth/verify-email", async (request, reply) => {
    const query = verifyEmailQuerySchema.parse(request.query);
    const result = await auth.verifyEmail(query.token);
    if (result === "invalid_or_expired_token") {
      return reply.badRequest("invalid or expired token");
    }
    return { ok: true };
  });

  app.post("/v1/auth/forgot-password", async (request) => {
    const payload = forgotPasswordRequestSchema.parse(request.body);
    await auth.requestPasswordReset(payload);
    return { ok: true };
  });

  app.post("/v1/auth/reset-password", async (request, reply) => {
    const payload = resetPasswordRequestSchema.parse(request.body);
    const result = await auth.resetPassword(payload);
    if (result === "invalid_or_expired_token") {
      return reply.badRequest("invalid or expired token");
    }
    return { ok: true };
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
    protectedRoutes.addHook("preHandler", async (request, reply) => {
      const tenantId = request.authContext?.tenantId;
      if (!tenantId) {
        return reply.unauthorized("missing tenant context");
      }

      const client = await app.pg.connect();
      try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
      } catch (err) {
        client.release();
        throw err;
      }
      request.dbClient = client;
    });
    protectedRoutes.addHook("onResponse", async (request) => {
      await releaseTenantClient(request);
    });
    protectedRoutes.addHook("onError", async (request) => {
      await releaseTenantClient(request);
    });

    const storeFor = (request: FastifyRequest) => {
      const tenantId = request.authContext?.tenantId;
      if (!tenantId) {
        throw app.httpErrors.unauthorized("missing tenant context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing tenant db context");
      }
      return new PostgresStore(request.dbClient, tenantId);
    };

    protectedRoutes.get("/v1/clusters", async (request) => {
      const query = listClustersQuerySchema.parse(request.query);
      const store = storeFor(request);
      return store.listClusters(query);
    });

    protectedRoutes.get("/v1/clusters/:id", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      const cluster = await store.getCluster(id);
      if (!cluster) {
        return reply.notFound("cluster not found");
      }
      return cluster;
    });

    protectedRoutes.post("/v1/clusters/:id/read", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.markRead(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/save", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.saveCluster(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/split", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.splitCluster(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true, status: "accepted" };
    });

    protectedRoutes.post("/v1/clusters/:id/feedback", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = clusterFeedbackRequestSchema.parse(request.body);
      const store = storeFor(request);
      if (!(await store.submitFeedback(id, payload))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/annotations", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = createAnnotationRequestSchema.parse(request.body);
      const store = storeFor(request);
      const annotation = await store.createAnnotation(id, payload);
      if (!annotation) {
        return reply.notFound("cluster not found");
      }
      return annotation;
    });

    protectedRoutes.get("/v1/clusters/:id/annotations", async (request) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      return store.listAnnotations(id);
    });

    protectedRoutes.delete("/v1/annotations/:id", async (request, reply) => {
      const { id } = annotationIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.deleteAnnotation(id))) {
        return reply.notFound("annotation not found");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/folders", async (request) => {
      const store = storeFor(request);
      return store.listFolders();
    });

    // ---------- Topics ----------

    protectedRoutes.get("/v1/topics", async (request) => {
      const store = storeFor(request);
      return store.listTopics();
    });

    protectedRoutes.patch("/v1/topics/:id", async (request, reply) => {
      const { id } = topicIdParams.parse(request.params);
      const body = renameTopicRequestSchema.parse(request.body);
      const store = storeFor(request);
      const ok = await store.renameTopic(id, body.name);
      if (!ok) return reply.notFound("topic not found");
      return { ok: true };
    });

    protectedRoutes.delete("/v1/topics/:id", async (request, reply) => {
      const { id } = topicIdParams.parse(request.params);
      const store = storeFor(request);
      const ok = await store.deleteTopic(id);
      if (!ok) return reply.notFound("topic not found or is Uncategorized");
      return { ok: true };
    });

    // ---------- Feeds ----------

    protectedRoutes.get("/v1/feeds", async (request) => {
      const store = storeFor(request);
      return store.listFeeds();
    });

    // Register /v1/feeds/pending BEFORE /v1/feeds/:id routes
    protectedRoutes.get("/v1/feeds/pending", async (request) => {
      const store = storeFor(request);
      return store.listPendingClassifications();
    });

    protectedRoutes.get("/v1/feeds/suggestions", async (request) => {
      const store = storeFor(request);
      const distribution = await store.getFolderDistribution();
      // Map folder names to feed directory categories
      const folderToCategories: Record<string, string[]> = {
        "Tech": ["Tech", "Programming", "Design"],
        "Security": ["Security"],
        "Gaming": ["Gaming"],
        "Business": ["Business"],
        "Science": ["Science"],
        "World News": ["World News"],
        "Other": ["Tech", "Science", "World News"],
      };

      // Find which categories the user is NOT heavily subscribed to
      const subscribedCategories = new Set<string>();
      for (const entry of distribution) {
        const cats = folderToCategories[entry.folderName] ?? [];
        for (const cat of cats) {
          subscribedCategories.add(cat);
        }
      }

      // Suggest categories with low coverage
      const allCategories = ["Tech", "Security", "Gaming", "Business", "Science", "Design", "World News", "Programming"];
      const suggestions = allCategories.filter((cat) => !subscribedCategories.has(cat));

      // If all are covered, suggest the least-covered ones
      if (suggestions.length === 0) {
        return { categories: allCategories.slice(0, 3) };
      }

      return { categories: suggestions };
    });

    protectedRoutes.post("/v1/feeds", async (request, reply) => {
      const payload = addFeedRequestSchema.parse(request.body);
      const urlError = validateFeedUrl(payload.url);
      if (urlError) {
        return reply.badRequest(urlError);
      }
      const store = storeFor(request);
      return store.addFeed(payload);
    });

    protectedRoutes.patch("/v1/feeds/:id", async (request, reply) => {
      const { id } = feedIdParams.parse(request.params);
      const payload = updateFeedRequestSchema.parse(request.body);
      const store = storeFor(request);
      const feed = await store.updateFeed(id, payload);
      if (!feed) {
        return reply.notFound("feed not found");
      }
      return feed;
    });

    protectedRoutes.get("/v1/feeds/:id/topics", async (request) => {
      const { id } = feedIdParams.parse(request.params);
      const store = storeFor(request);
      return store.getFeedTopics(id);
    });

    protectedRoutes.post("/v1/feeds/:id/topics/resolve", async (request) => {
      const { id } = feedIdParams.parse(request.params);
      const body = resolveTopicRequestSchema.parse(request.body);
      const store = storeFor(request);
      const ok = await store.resolveFeedTopic(id, body.topicId, body.action);
      return { ok };
    });

    protectedRoutes.post("/v1/feeds/:id/topics/approve-all", async (request) => {
      const { id } = feedIdParams.parse(request.params);
      const store = storeFor(request);
      const ok = await store.approveAllFeedTopics(id);
      return { ok };
    });

    protectedRoutes.post("/v1/opml/import", async (request, reply) => {
      // Accept OPML as raw XML string in the body, or as { opml: "..." } JSON
      let xml: string;
      if (typeof request.body === "string") {
        xml = request.body;
      } else if (request.body && typeof (request.body as Record<string, unknown>).opml === "string") {
        xml = (request.body as Record<string, unknown>).opml as string;
      } else {
        return reply.badRequest("request body must be an OPML XML string or { opml: \"...\" }");
      }

      const feeds = parseOpml(xml);
      if (feeds.length === 0) {
        return reply.badRequest("no feeds found in OPML");
      }

      const store = storeFor(request);
      const result = await store.importOpml(feeds);
      return { ok: true, ...result, total: feeds.length };
    });

    protectedRoutes.get("/v1/filters", async (request) => {
      const store = storeFor(request);
      return store.listFilters();
    });

    protectedRoutes.post("/v1/filters", async (request) => {
      const payload = createFilterRuleRequestSchema.parse(request.body);
      const store = storeFor(request);
      return store.createFilter(payload);
    });

    protectedRoutes.patch("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      const payload = updateFilterRuleRequestSchema.parse(request.body);
      const store = storeFor(request);
      const filter = await store.updateFilter(id, payload);
      if (!filter) {
        return reply.notFound("filter not found");
      }
      return filter;
    });

    protectedRoutes.delete("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.deleteFilter(id))) {
        return reply.notFound("filter not found");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/digests", async (request) => {
      const store = storeFor(request);
      return store.listDigests();
    });

    protectedRoutes.post("/v1/events", async (request) => {
      const payload = eventsBatchRequestSchema.parse(request.body);
      const store = storeFor(request);
      return store.recordEvents(payload.events);
    });

    protectedRoutes.post("/v1/account/password", async (request, reply) => {
      const payload = changePasswordRequestSchema.parse(request.body);
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const result = await auth.changePassword(
        authContext.userId,
        authContext.tenantId,
        payload.currentPassword,
        payload.newPassword
      );

      if (result === "invalid_current_password") {
        return reply.unauthorized("current password is incorrect");
      }
      if (result === "same_password") {
        return reply.badRequest("new password must be different");
      }
      if (result === "user_not_found") {
        return reply.notFound("account not found");
      }

      return { ok: true };
    });

    protectedRoutes.get("/v1/account/deletion", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      return auth.getAccountDeletionStatus(authContext.userId, authContext.tenantId);
    });

    protectedRoutes.post("/v1/account/deletion/request", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const payload = requestAccountDeletionSchema.parse(request.body);
      const result = await auth.requestAccountDeletion(authContext.userId, authContext.tenantId, payload);

      if (result === "invalid_password") {
        return reply.unauthorized("current password is incorrect");
      }

      return result;
    });

    protectedRoutes.post("/v1/account/deletion/cancel", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const result = await auth.cancelAccountDeletion(authContext.userId, authContext.tenantId);
      if (!result) {
        return reply.notFound("no pending deletion request");
      }
      return result;
    });

    protectedRoutes.get("/v1/settings", async (request) => {
      const store = storeFor(request);
      return store.getSettings();
    });

    protectedRoutes.post("/v1/settings", async (request) => {
      const payload = updateSettingsRequestSchema.parse(request.body);
      const store = storeFor(request);
      return store.updateSettings(payload);
    });

    protectedRoutes.get("/v1/search", async (request) => {
      const query = searchQuerySchema.parse(request.query);
      const store = storeFor(request);
      return store.searchClusters(query);
    });

    // ---------- Push notifications ----------

    protectedRoutes.get("/v1/push/vapid-key", async () => {
      return { publicKey: env.VAPID_PUBLIC_KEY ?? "" };
    });

    protectedRoutes.post("/v1/push/subscribe", async (request) => {
      const payload = pushSubscribeRequestSchema.parse(request.body);
      const store = storeFor(request);
      await store.savePushSubscription(payload.endpoint, payload.keys.p256dh, payload.keys.auth);
      return { ok: true };
    });

    protectedRoutes.delete("/v1/push/subscribe", async (request) => {
      const payload = pushUnsubscribeRequestSchema.parse(request.body);
      const store = storeFor(request);
      await store.deletePushSubscription(payload.endpoint);
      return { ok: true };
    });

    // ---------- Dwell tracking ----------

    protectedRoutes.post("/v1/clusters/:id/dwell", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = recordDwellRequestSchema.parse(request.body);
      const store = storeFor(request);
      if (!(await store.recordDwell(id, payload.seconds))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    // ---------- Stats ----------

    protectedRoutes.get("/v1/stats", async (request) => {
      const query = statsQuerySchema.parse(request.query);
      const store = storeFor(request);
      return store.getReadingStats(query.period);
    });

    protectedRoutes.get("/v1/opml/export", async (request, reply) => {
      const store = storeFor(request);
      const { feeds } = await store.exportOpml();

      // Group feeds by folder
      const grouped = new Map<string, typeof feeds>();
      for (const feed of feeds) {
        const group = grouped.get(feed.folderName) ?? [];
        group.push(feed);
        grouped.set(feed.folderName, group);
      }

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<opml version="2.0">\n';
      xml += '  <head><title>RSS Wrangler Export</title></head>\n';
      xml += '  <body>\n';

      for (const [folderName, folderFeeds] of grouped) {
        xml += `    <outline text="${escapeXml(folderName)}" title="${escapeXml(folderName)}">\n`;
        for (const feed of folderFeeds) {
          xml += `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.xmlUrl)}"`;
          if (feed.htmlUrl) {
            xml += ` htmlUrl="${escapeXml(feed.htmlUrl)}"`;
          }
          xml += ' />\n';
        }
        xml += '    </outline>\n';
      }

      xml += '  </body>\n';
      xml += '</opml>\n';

      return reply
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="rss-wrangler-export.opml"')
        .send(xml);
    });
  });
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
