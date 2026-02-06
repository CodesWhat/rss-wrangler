import {
  addFeedRequestSchema,
  clusterFeedbackRequestSchema,
  createAnnotationRequestSchema,
  createFilterRuleRequestSchema,
  eventsBatchRequestSchema,
  listClustersQuerySchema,
  loginRequestSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  recordDwellRequestSchema,
  searchQuerySchema,
  statsQuerySchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updateSettingsRequestSchema
} from "@rss-wrangler/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiEnv } from "../config/env";
import { createAuthService } from "../services/auth-service";
import { parseOpml } from "../services/opml-parser";
import { PostgresStore } from "../services/postgres-store";
import { validateFeedUrl } from "../services/url-validator";

const clusterIdParams = z.object({ id: z.string().uuid() });
const feedIdParams = z.object({ id: z.string().uuid() });
const filterIdParams = z.object({ id: z.string().uuid() });
const annotationIdParams = z.object({ id: z.string().uuid() });

const authRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const authLogoutSchema = z.object({
  refreshToken: z.string().optional()
});

export const v1Routes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const store = new PostgresStore(app.pg);
  const auth = createAuthService(app, env, app.pg);

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
      const cluster = await store.getCluster(id);
      if (!cluster) {
        return reply.notFound("cluster not found");
      }
      return cluster;
    });

    protectedRoutes.post("/v1/clusters/:id/read", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!(await store.markRead(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/save", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!(await store.saveCluster(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/split", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      if (!(await store.splitCluster(id))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true, status: "accepted" };
    });

    protectedRoutes.post("/v1/clusters/:id/feedback", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = clusterFeedbackRequestSchema.parse(request.body);
      if (!(await store.submitFeedback(id, payload))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/clusters/:id/annotations", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = createAnnotationRequestSchema.parse(request.body);
      const annotation = await store.createAnnotation(id, payload);
      if (!annotation) {
        return reply.notFound("cluster not found");
      }
      return annotation;
    });

    protectedRoutes.get("/v1/clusters/:id/annotations", async (request) => {
      const { id } = clusterIdParams.parse(request.params);
      return store.listAnnotations(id);
    });

    protectedRoutes.delete("/v1/annotations/:id", async (request, reply) => {
      const { id } = annotationIdParams.parse(request.params);
      if (!(await store.deleteAnnotation(id))) {
        return reply.notFound("annotation not found");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/folders", async () => store.listFolders());

    protectedRoutes.get("/v1/feeds", async () => store.listFeeds());

    protectedRoutes.get("/v1/feeds/suggestions", async () => {
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
      return store.addFeed(payload);
    });

    protectedRoutes.patch("/v1/feeds/:id", async (request, reply) => {
      const { id } = feedIdParams.parse(request.params);
      const payload = updateFeedRequestSchema.parse(request.body);
      const feed = await store.updateFeed(id, payload);
      if (!feed) {
        return reply.notFound("feed not found");
      }
      return feed;
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

      const result = await store.importOpml(feeds);
      return { ok: true, ...result, total: feeds.length };
    });

    protectedRoutes.get("/v1/filters", async () => store.listFilters());

    protectedRoutes.post("/v1/filters", async (request) => {
      const payload = createFilterRuleRequestSchema.parse(request.body);
      return store.createFilter(payload);
    });

    protectedRoutes.patch("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      const payload = updateFilterRuleRequestSchema.parse(request.body);
      const filter = await store.updateFilter(id, payload);
      if (!filter) {
        return reply.notFound("filter not found");
      }
      return filter;
    });

    protectedRoutes.delete("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      if (!(await store.deleteFilter(id))) {
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

    protectedRoutes.get("/v1/search", async (request) => {
      const query = searchQuerySchema.parse(request.query);
      return store.searchClusters(query);
    });

    // ---------- Push notifications ----------

    protectedRoutes.get("/v1/push/vapid-key", async () => {
      return { publicKey: env.VAPID_PUBLIC_KEY ?? "" };
    });

    protectedRoutes.post("/v1/push/subscribe", async (request) => {
      const payload = pushSubscribeRequestSchema.parse(request.body);
      await store.savePushSubscription(payload.endpoint, payload.keys.p256dh, payload.keys.auth);
      return { ok: true };
    });

    protectedRoutes.delete("/v1/push/subscribe", async (request) => {
      const payload = pushUnsubscribeRequestSchema.parse(request.body);
      await store.deletePushSubscription(payload.endpoint);
      return { ok: true };
    });

    // ---------- Dwell tracking ----------

    protectedRoutes.post("/v1/clusters/:id/dwell", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const payload = recordDwellRequestSchema.parse(request.body);
      if (!(await store.recordDwell(id, payload.seconds))) {
        return reply.notFound("cluster not found");
      }
      return { ok: true };
    });

    // ---------- Stats ----------

    protectedRoutes.get("/v1/stats", async (request) => {
      const query = statsQuerySchema.parse(request.query);
      return store.getReadingStats(query.period);
    });

    protectedRoutes.get("/v1/opml/export", async (_request, reply) => {
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
