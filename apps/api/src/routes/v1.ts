import {
  accountDataExportStatusSchema,
  accountEntitlementsSchema,
  addFeedRequestSchema,
  aiUsageSummarySchema,
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  billingOverviewSchema,
  billingPortalResponseSchema,
  billingSubscriptionActionRequestSchema,
  billingSubscriptionActionResponseSchema,
  type ClusterCard,
  changePasswordRequestSchema,
  clusterFeedbackRequestSchema,
  createAnnotationRequestSchema,
  createFilterRuleRequestSchema,
  createMemberInviteRequestSchema,
  directoryEntrySchema,
  directoryListResponseSchema,
  directoryQuerySchema,
  eventsBatchRequestSchema,
  forgotPasswordRequestSchema,
  joinAccountRequestSchema,
  listClustersQuerySchema,
  loginRequestSchema,
  markAllReadRequestSchema,
  memberInviteSchema,
  memberSchema,
  opmlImportResponseSchema,
  pollFeedNowRequestSchema,
  privacyConsentSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  recordDwellRequestSchema,
  renameTopicRequestSchema,
  requestAccountDeletionSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  resolveTopicRequestSchema,
  type SearchQuery, 
  searchQuerySchema,
  signupRequestSchema,
  statsQuerySchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updateMemberRequestSchema,
  updatePrivacyConsentRequestSchema,
  updateSettingsRequestSchema,
  clusterAiSummaryResponseSchema
} from "@rss-wrangler/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import type { ApiEnv } from "../config/env";
import { getAccountEntitlements } from "../plugins/entitlements";
import { createAiRegistry } from "@rss-wrangler/contracts";
import { checkBudget, ensureAiUsageTable, getMonthlyUsage, recordAiUsage } from "../services/ai-usage-service";
import { createAuthService } from "../services/auth-service";
import { createBillingService } from "../services/billing-service";
import { parseOpml } from "../services/opml-parser";
import { PostgresStore } from "../services/postgres-store";
import { requiresExplicitConsent, resolveCountryCode } from "../services/privacy-consent-service";
import { validateFeedUrl } from "../services/url-validator";

const DEFAULT_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

const clusterIdParams = z.object({ id: z.string().uuid() });
const feedIdParams = z.object({ id: z.string().uuid() });
const filterIdParams = z.object({ id: z.string().uuid() });
const annotationIdParams = z.object({ id: z.string().uuid() });
const topicIdParams = z.object({ id: z.string().uuid() });
const inviteIdParams = z.object({ id: z.string().uuid() });
const memberIdParams = z.object({ id: z.string().uuid() });

const authRefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const authLogoutSchema = z.object({
  refreshToken: z.string().optional()
});

const verifyEmailQuerySchema = z.object({
  token: z.string().min(12).max(512)
});

const PROCESS_FEED_JOB = "process-feed";
const GENERATE_DIGEST_FOR_ACCOUNT_JOB = "generate-digest-for-account";

export const v1Routes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const auth = createAuthService(app, env, app.pg);
  const billing = createBillingService(env, app.pg, app.log);
  const jobs = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "rss-wrangler-api"
  });

  await jobs.start();
  await jobs.createQueue(PROCESS_FEED_JOB);
  await jobs.createQueue(GENERATE_DIGEST_FOR_ACCOUNT_JOB);
  await ensureAiUsageTable(app.pg);

  app.addHook("onClose", async () => {
    await jobs.stop();
  });

  async function releaseAccountClient(request: { dbClient?: { query: (sql: string, params?: unknown[]) => Promise<unknown>; release: () => void } }) {
    if (!request.dbClient) {
      return;
    }

    const client = request.dbClient;
    request.dbClient = undefined;

    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_ACCOUNT_ID]);
    } catch {
      // Best effort; client is being released either way.
    } finally {
      client.release();
    }
  }

  app.get("/health", async () => ({ ok: true, service: "api" }));

  const aiRegistry = createAiRegistry(env);

  app.get("/v1/ai/status", async () => {
    const available = aiRegistry.listAvailable();
    const defaultProvider = aiRegistry.getProvider();
    return {
      available: available.length > 0,
      providers: available,
      default: defaultProvider?.name ?? null,
    };
  });

  // ---------- Feed directory (public, unauthenticated) ----------

  app.get("/v1/directory", async (request) => {
    const query = directoryQuerySchema.parse(request.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let nextParam = 1;

    if (query.category) {
      conditions.push(`category = $${nextParam}`);
      params.push(query.category);
      nextParam++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await app.pg.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM feed_directory ${whereClause}`,
      params
    );
    const total = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

    const dataParams = [...params, query.limit, query.offset];
    const dataResult = await app.pg.query<{
      id: string;
      feed_url: string;
      title: string;
      description: string | null;
      category: string;
      site_url: string | null;
      language: string | null;
      popularity_rank: number | null;
      created_at: Date;
    }>(
      `SELECT id, feed_url, title, description, category, site_url, language, popularity_rank, created_at
       FROM feed_directory
       ${whereClause}
       ORDER BY popularity_rank DESC NULLS LAST, title ASC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      dataParams
    );

    const items = dataResult.rows.map((row) =>
      directoryEntrySchema.parse({
        id: row.id,
        feedUrl: row.feed_url,
        title: row.title,
        description: row.description,
        category: row.category,
        siteUrl: row.site_url,
        language: row.language,
        popularityRank: row.popularity_rank,
        createdAt: row.created_at.toISOString(),
      })
    );

    return directoryListResponseSchema.parse({ items, total });
  });

  app.post("/v1/billing/webhooks/lemon-squeezy", {
    config: {
      rawBody: true,
      rateLimit: {
        max: 300,
        timeWindow: "1 minute"
      }
    }
  }, async (request, reply) => {
    const signatureHeader = Array.isArray(request.headers["x-signature"])
      ? request.headers["x-signature"][0]
      : request.headers["x-signature"];

    if (typeof request.rawBody !== "string" || request.rawBody.length === 0) {
      return reply.badRequest("missing raw webhook body");
    }

    const result = await billing.processWebhook(request.rawBody, signatureHeader);
    if (!result.ok) {
      if (result.error === "invalid_signature") {
        return reply.unauthorized(result.message);
      }
      if (result.error === "invalid_payload") {
        return reply.badRequest(result.message);
      }
      return reply.code(503).send({ error: result.error, message: result.message });
    }

    return {
      ok: true,
      duplicate: result.duplicate,
      status: result.status,
      eventName: result.eventName
    };
  });

  app.post("/v1/auth/login", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute"
      }
    }
  }, async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);
    const accountSlug = payload.accountSlug ?? payload.tenantSlug;
    const tokens = await auth.login(payload.username, payload.password, accountSlug);

    if (tokens === "email_not_verified") {
      return reply.forbidden("email not verified");
    }
    if (tokens === "suspended") {
      return reply.forbidden("account is suspended");
    }
    if (!tokens) {
      return reply.unauthorized("invalid credentials");
    }

    return tokens;
  });

  app.post("/v1/auth/signup", async (request, reply) => {
    const payload = signupRequestSchema.parse(request.body);
    const result = await auth.signup(payload);

    if (result === "account_slug_taken") {
      return reply.conflict("account slug already taken");
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

  app.post("/v1/auth/join", async (request, reply) => {
    const payload = joinAccountRequestSchema.parse(request.body);
    const result = await auth.joinAccount(payload);

    if (result === "account_not_found") {
      return reply.notFound("account not found");
    }
    if (result === "invite_required") {
      return reply.forbidden("invite code required");
    }
    if (result === "invalid_invite_code") {
      return reply.badRequest("invalid or expired invite code");
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

  // Fire-and-forget helper: update tenant.last_active_at at most once per 5 minutes.
  // Uses the pool directly (not the per-request RLS client) to avoid lifecycle issues.
  function touchLastActive(accountId: string): void {
    app.pg
      .query(
        `UPDATE tenant SET last_active_at = NOW()
         WHERE id = $1
           AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '5 minutes')`,
        [accountId]
      )
      .catch((err) => {
        app.log.warn({ err, accountId }, "touchLastActive failed (non-fatal)");
      });
  }

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", protectedRoutes.verifyAccessToken);
    protectedRoutes.addHook("preHandler", async (request, reply) => {
      const accountId = request.authContext?.accountId;
      if (!accountId) {
        return reply.unauthorized("missing account context");
      }

      const client = await app.pg.connect();
      try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [accountId]);
      } catch (err) {
        client.release();
        throw err;
      }
      request.dbClient = client;

      // Debounced activity tracking (fire-and-forget, doesn't block response)
      touchLastActive(accountId);
    });
    protectedRoutes.addHook("onResponse", async (request) => {
      await releaseAccountClient(request);
    });
    protectedRoutes.addHook("onError", async (request) => {
      await releaseAccountClient(request);
    });

    const storeFor = (request: FastifyRequest) => {
      const accountId = request.authContext?.accountId;
      if (!accountId) {
        throw app.httpErrors.unauthorized("missing account context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }
      return new PostgresStore(request.dbClient, accountId);
    };

    const accountContextFor = (request: FastifyRequest) => {
      const accountId = request.authContext?.accountId;
      if (!accountId) {
        throw app.httpErrors.unauthorized("missing account context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }
      return { accountId, dbClient: request.dbClient };
    };

    const entitlementsFor = async (request: FastifyRequest) => {
      const { accountId, dbClient } = accountContextFor(request);
      return getAccountEntitlements(dbClient, accountId);
    };

    protectedRoutes.get("/v1/clusters", async (request) => {
      const query = listClustersQuerySchema.parse(request.query);
      const store = storeFor(request);
      return store.listClusters(query);
    });

    protectedRoutes.post("/v1/clusters/mark-all-read", async (request) => {
      const payload = markAllReadRequestSchema.parse(request.body ?? {});
      const store = storeFor(request);
      const result = await store.markAllRead(payload);
      return { ok: true, marked: result.count, clusterIds: result.clusterIds };
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

    protectedRoutes.post("/v1/clusters/:id/unread", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const store = storeFor(request);
      if (!(await store.markUnread(id))) {
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

    // ---------- Cluster AI summary ----------

    protectedRoutes.get("/v1/clusters/:id/summary", async (request, reply) => {
      const { id } = clusterIdParams.parse(request.params);
      const { accountId, dbClient } = accountContextFor(request);

      // Check if AI provider is available at all
      const provider = aiRegistry.getProvider();
      if (!provider) {
        return clusterAiSummaryResponseSchema.parse({ summary: null, generatedAt: null });
      }

      // Gate behind plan: on hosted (billing configured), require pro_ai tier
      const isHostedBilling = Boolean(env.LEMON_SQUEEZY_API_KEY);
      if (isHostedBilling) {
        const entitlements = await getAccountEntitlements(dbClient, accountId);
        if (entitlements.planId !== "pro_ai") {
          return clusterAiSummaryResponseSchema.parse({ summary: null, generatedAt: null });
        }
      }

      // Check for cached summary
      const cached = await dbClient.query<{ ai_summary: string | null; ai_summary_generated_at: Date | null }>(
        "SELECT ai_summary, ai_summary_generated_at FROM cluster WHERE id = $1 AND tenant_id = $2",
        [id, accountId]
      );
      if (cached.rows.length === 0) {
        return reply.notFound("cluster not found");
      }
      if (cached.rows[0].ai_summary) {
        return clusterAiSummaryResponseSchema.parse({
          summary: cached.rows[0].ai_summary,
          generatedAt: cached.rows[0].ai_summary_generated_at
            ? cached.rows[0].ai_summary_generated_at.toISOString()
            : null
        });
      }

      // Check token budget
      const budget = await checkBudget(app.pg, accountId);
      if (!budget.allowed) {
        return clusterAiSummaryResponseSchema.parse({ summary: null, generatedAt: null });
      }

      // Gather cluster items for the prompt
      const membersResult = await dbClient.query<{
        title: string;
        source_name: string;
        summary: string | null;
      }>(
        `SELECT
           COALESCE(i.title, 'Untitled') AS title,
           COALESCE(f.title, 'Unknown') AS source_name,
           i.summary
         FROM cluster_member cm
         JOIN item i ON i.id = cm.item_id
         LEFT JOIN feed f ON f.id = i.feed_id
         WHERE cm.cluster_id = $1
           AND cm.tenant_id = $2
         ORDER BY i.published_at DESC
         LIMIT 20`,
        [id, accountId]
      );

      if (membersResult.rows.length === 0) {
        return clusterAiSummaryResponseSchema.parse({ summary: null, generatedAt: null });
      }

      const itemsText = membersResult.rows
        .map((row, i) => `[${i + 1}] ${row.title} (${row.source_name})${row.summary ? `\n${row.summary}` : ""}`)
        .join("\n\n");

      try {
        const completion = await provider.complete({
          messages: [
            {
              role: "system",
              content:
                "You are a concise news analyst. Given multiple news articles about the same story from different outlets, " +
                "write a 2-4 sentence narrative summary that synthesizes the key facts across all sources into a coherent " +
                "\"Story so far\" paragraph. Focus on what happened, who is involved, and why it matters. " +
                "Do not reference the sources by name. Do not editorialize or speculate."
            },
            {
              role: "user",
              content: `Summarize the following ${membersResult.rows.length} articles about the same story:\n\n${itemsText}`
            }
          ],
          maxTokens: 300,
          temperature: 0.3
        });

        const summary = completion.text.trim();

        // Cache the result
        await dbClient.query(
          "UPDATE cluster SET ai_summary = $1, ai_summary_generated_at = NOW() WHERE id = $2 AND tenant_id = $3",
          [summary, id, accountId]
        );

        // Record AI usage
        await recordAiUsage(app.pg, {
          accountId,
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          feature: "story_summary",
          durationMs: completion.durationMs
        });

        return clusterAiSummaryResponseSchema.parse({
          summary,
          generatedAt: new Date().toISOString()
        });
      } catch {
        // If AI call fails, return null gracefully
        return clusterAiSummaryResponseSchema.parse({ summary: null, generatedAt: null });
      }
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

      const entitlements = await entitlementsFor(request);
      if (entitlements.feedLimit !== null && entitlements.usage.feeds >= entitlements.feedLimit) {
        return reply.code(402).send({
          error: "feed_limit_reached",
          message: `Your current plan allows up to ${entitlements.feedLimit} feeds. Upgrade to add more.`,
          limit: entitlements.feedLimit
        });
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

    protectedRoutes.post("/v1/feeds/:id/poll-now", {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute"
        }
      }
    }, async (request, reply) => {
      const { id } = feedIdParams.parse(request.params);
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }
      const body = pollFeedNowRequestSchema.parse(request.body ?? {});
      const backfillSince = typeof body.lookbackDays === "number"
        ? new Date(Date.now() - body.lookbackDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const result = await request.dbClient.query<{
        id: string;
        tenant_id: string;
        url: string;
        title: string;
        site_url: string | null;
        folder_id: string;
        weight: "prefer" | "neutral" | "deprioritize";
        etag: string | null;
        last_modified: string | null;
        classification_status: "pending_classification" | "classified" | "approved";
      }>(
        `SELECT id, tenant_id, url, title, site_url, folder_id, weight, etag, last_modified, classification_status
         FROM feed
         WHERE id = $1
           AND tenant_id = $2
         LIMIT 1`,
        [id, authContext.accountId]
      );

      const feed = result.rows[0];
      if (!feed) {
        return reply.notFound("feed not found");
      }

      try {
        const jobId = await jobs.send(PROCESS_FEED_JOB, {
          id: feed.id,
          accountId: feed.tenant_id,
          // Keep tenantId for worker backward compat
          tenantId: feed.tenant_id,
          url: feed.url,
          title: feed.title,
          siteUrl: feed.site_url,
          folderId: feed.folder_id,
          weight: feed.weight,
          etag: feed.etag,
          lastModified: feed.last_modified,
          // Force immediate poll regardless of the stored last_polled_at.
          lastPolledAt: null,
          classificationStatus: feed.classification_status,
          backfillSince
        });

        if (!jobId) {
          request.log.warn({
            feedId: feed.id,
            accountId: feed.tenant_id
          }, "poll-now queue send returned null");
          return reply.code(503).send({
            error: "queue_unavailable",
            message: "could not queue feed poll job"
          });
        }

        return { ok: true, jobId };
      } catch (error) {
        request.log.error({
          err: error,
          feedId: feed.id,
          accountId: feed.tenant_id
        }, "poll-now queue send failed");
        return reply.code(503).send({
          error: "queue_unavailable",
          message: "could not queue feed poll job"
        });
      }
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

      const entitlements = await entitlementsFor(request);
      let feedsToImport = feeds;

      if (entitlements.feedLimit !== null) {
        const remainingSlots = Math.max(entitlements.feedLimit - entitlements.usage.feeds, 0);
        if (remainingSlots <= 0) {
          return reply.code(402).send({
            error: "feed_limit_reached",
            message: `Your current plan allows up to ${entitlements.feedLimit} feeds. Upgrade to import more.`,
            limit: entitlements.feedLimit
          });
        }
        if (feedsToImport.length > remainingSlots) {
          feedsToImport = feedsToImport.slice(0, remainingSlots);
        }
      }

      const store = storeFor(request);
      const result = await store.importOpml(feedsToImport);
      const rejectedCount = feeds.length - feedsToImport.length;
      const remainingSlots = entitlements.feedLimit === null
        ? undefined
        : Math.max(entitlements.feedLimit - (entitlements.usage.feeds + result.imported), 0);

      return opmlImportResponseSchema.parse({
        ok: true,
        ...result,
        total: feeds.length,
        limitedByPlan: rejectedCount > 0 ? true : undefined,
        rejectedCount: rejectedCount > 0 ? rejectedCount : undefined,
        remainingSlots
      });
    });

    protectedRoutes.get("/v1/filters", async (request) => {
      const store = storeFor(request);
      return store.listFilters();
    });

    protectedRoutes.post("/v1/filters", async (request, reply) => {
      const payload = createFilterRuleRequestSchema.parse(request.body);
      const store = storeFor(request);
      try {
        return await store.createFilter(payload);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 400) {
          return reply.badRequest((err as unknown as Error).message);
        }
        throw err;
      }
    });

    protectedRoutes.patch("/v1/filters/:id", async (request, reply) => {
      const { id } = filterIdParams.parse(request.params);
      const payload = updateFilterRuleRequestSchema.parse(request.body);
      const store = storeFor(request);
      try {
        const filter = await store.updateFilter(id, payload);
        if (!filter) {
          return reply.notFound("filter not found");
        }
        return filter;
      } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 400) {
          return reply.badRequest((err as unknown as Error).message);
        }
        throw err;
      }
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

    protectedRoutes.post("/v1/digest/generate", {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    }, async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      try {
        const jobId = await jobs.send(GENERATE_DIGEST_FOR_ACCOUNT_JOB, {
          accountId: authContext.accountId,
        });

        if (!jobId) {
          return reply.code(503).send({
            error: "queue_unavailable",
            message: "could not queue digest generation job"
          });
        }

        return { ok: true, jobId };
      } catch (error) {
        request.log.error({
          err: error,
          accountId: authContext.accountId
        }, "digest generate queue send failed");
        return reply.code(503).send({
          error: "queue_unavailable",
          message: "could not queue digest generation job"
        });
      }
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
        authContext.accountId,
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
      return auth.getAccountDeletionStatus(authContext.userId, authContext.accountId);
    });

    protectedRoutes.post("/v1/account/deletion/request", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const payload = requestAccountDeletionSchema.parse(request.body);
      const result = await auth.requestAccountDeletion(authContext.userId, authContext.accountId, payload);

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

      const result = await auth.cancelAccountDeletion(authContext.userId, authContext.accountId);
      if (!result) {
        return reply.notFound("no pending deletion request");
      }
      return result;
    });

    protectedRoutes.get("/v1/account/invites", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const invites = await auth.listMemberInvites(authContext.userId, authContext.accountId);
      if (invites === "not_owner") {
        throw app.httpErrors.forbidden("only account owner can perform this action");
      }
      return invites.map((invite) => memberInviteSchema.parse(invite));
    });

    protectedRoutes.post("/v1/account/invites", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const payload = createMemberInviteRequestSchema.parse(request.body);
      const invite = await auth.createMemberInvite(authContext.userId, authContext.accountId, payload);
      if (invite === "not_owner") {
        return reply.forbidden("only account owner can perform this action");
      }
      return memberInviteSchema.parse(invite);
    });

    protectedRoutes.post("/v1/account/invites/:id/revoke", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = inviteIdParams.parse(request.params);
      const invite = await auth.revokeMemberInvite(authContext.userId, authContext.accountId, id);
      if (invite === "not_owner") {
        return reply.forbidden("only account owner can perform this action");
      }
      if (!invite) {
        return reply.notFound("pending invite not found");
      }
      return memberInviteSchema.parse(invite);
    });

    // ---------- Member management ----------

    protectedRoutes.get("/v1/account/members", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const members = await auth.listMembers(authContext.accountId);
      return members.map((m) => memberSchema.parse(m));
    });

    protectedRoutes.patch("/v1/account/members/:id", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const body = updateMemberRequestSchema.parse(request.body);

      if (body.role) {
        if (body.role === "owner") {
          return reply.badRequest("single-owner mode enabled: promoting users to owner is disabled");
        }
        const result = await auth.updateMemberRole(authContext.userId, authContext.accountId, id, body.role);
        if (result === "not_owner") {
          return reply.forbidden("only account owner can perform this action");
        }
        if (result === "user_not_found") {
          return reply.notFound("member not found");
        }
        if (result === "cannot_modify_self") {
          return reply.badRequest("cannot modify your own role/status");
        }
        return memberSchema.parse(result);
      }

      return reply.badRequest("no update fields provided");
    });

    protectedRoutes.post("/v1/account/members/:id/remove", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const result = await auth.removeMember(authContext.userId, authContext.accountId, id);

      if (result === "not_owner") {
        return reply.forbidden("only account owner can perform this action");
      }
      if (result === "user_not_found") {
        return reply.notFound("member not found");
      }
      if (result === "cannot_modify_self") {
        return reply.badRequest("cannot modify your own role/status");
      }
      return { ok: true };
    });

    protectedRoutes.get("/v1/account/data-export", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      return auth.getAccountDataExportStatus(authContext.userId, authContext.accountId);
    });

    protectedRoutes.post("/v1/account/data-export/request", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const status = await auth.requestAccountDataExport(authContext.userId, authContext.accountId);
      return accountDataExportStatusSchema.parse(status);
    });

    protectedRoutes.get("/v1/account/data-export/download", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const download = await auth.getAccountDataExportPayload(authContext.userId, authContext.accountId);
      if (!download) {
        return reply.notFound("no completed account export found");
      }

      const iso = download.completedAt.replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
      const filename = `rss-wrangler-account-export-${iso}.json`;
      const body = JSON.stringify(download.payload, null, 2);

      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(body);
    });

    protectedRoutes.get("/v1/account/entitlements", async (request) => {
      const entitlements = await entitlementsFor(request);
      return accountEntitlementsSchema.parse(entitlements);
    });

    protectedRoutes.get("/v1/billing", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const overview = await billing.getOverview(authContext.accountId);
      return billingOverviewSchema.parse(overview);
    });

    protectedRoutes.post("/v1/billing/checkout", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const payload = billingCheckoutRequestSchema.parse(request.body);
      const result = await billing.createCheckout({
        accountId: authContext.accountId,
        userId: authContext.userId,
        planId: payload.planId,
        interval: payload.interval
      });

      if (!result.ok) {
        if (result.error === "not_configured") {
          return reply.code(503).send({ error: result.error, message: result.message });
        }
        return reply.code(502).send({ error: result.error, message: result.message });
      }

      return billingCheckoutResponseSchema.parse({ url: result.url });
    });

    protectedRoutes.get("/v1/billing/portal", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const result = await billing.getPortal(authContext.accountId);
      if (!result.ok) {
        if (result.error === "not_found") {
          return reply.notFound(result.message);
        }
        if (result.error === "not_configured") {
          return reply.code(503).send({ error: result.error, message: result.message });
        }
        return reply.code(502).send({ error: result.error, message: result.message });
      }

      return billingPortalResponseSchema.parse({ url: result.url });
    });

    protectedRoutes.post("/v1/billing/subscription-action", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const payload = billingSubscriptionActionRequestSchema.parse(request.body);
      const result = await billing.updateSubscription(authContext.accountId, payload.action);
      if (!result.ok) {
        if (result.error === "not_found") {
          return reply.notFound(result.message);
        }
        if (result.error === "not_configured") {
          return reply.code(503).send({ error: result.error, message: result.message });
        }
        return reply.code(502).send({ error: result.error, message: result.message });
      }

      return billingSubscriptionActionResponseSchema.parse({
        subscriptionStatus: result.subscriptionStatus,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEndsAt: result.currentPeriodEndsAt,
        customerPortalUrl: result.customerPortalUrl
      });
    });

    protectedRoutes.get("/v1/privacy/consent", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }

      const countryCode = resolveCountryCode(request.headers);
      const result = await request.dbClient.query<{
        analytics_enabled: boolean;
        advertising_enabled: boolean;
        functional_enabled: boolean;
        region_code: string | null;
        updated_at: Date;
      }>(
        `SELECT analytics_enabled, advertising_enabled, functional_enabled, region_code, updated_at
         FROM user_privacy_consent
         WHERE tenant_id = $1
           AND user_id = $2
         LIMIT 1`,
        [authContext.accountId, authContext.userId]
      );
      const row = result.rows[0];
      const effectiveRegion = row?.region_code ?? countryCode;

      return privacyConsentSchema.parse({
        necessary: true,
        analytics: row?.analytics_enabled ?? false,
        advertising: row?.advertising_enabled ?? false,
        functional: row?.functional_enabled ?? false,
        consentCapturedAt: row?.updated_at?.toISOString() ?? null,
        regionCode: effectiveRegion ?? null,
        requiresExplicitConsent: requiresExplicitConsent(effectiveRegion)
      });
    });

    protectedRoutes.put("/v1/privacy/consent", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }

      const payload = updatePrivacyConsentRequestSchema.parse(request.body);
      const countryCode = resolveCountryCode(request.headers);
      const result = await request.dbClient.query<{
        analytics_enabled: boolean;
        advertising_enabled: boolean;
        functional_enabled: boolean;
        region_code: string | null;
        updated_at: Date;
      }>(
        `INSERT INTO user_privacy_consent (
           tenant_id,
           user_id,
           analytics_enabled,
           advertising_enabled,
           functional_enabled,
           region_code,
           source,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'settings', NOW())
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET
           analytics_enabled = EXCLUDED.analytics_enabled,
           advertising_enabled = EXCLUDED.advertising_enabled,
           functional_enabled = EXCLUDED.functional_enabled,
           region_code = COALESCE(EXCLUDED.region_code, user_privacy_consent.region_code),
           source = EXCLUDED.source,
           updated_at = NOW()
         RETURNING analytics_enabled, advertising_enabled, functional_enabled, region_code, updated_at`,
        [
          authContext.accountId,
          authContext.userId,
          payload.analytics,
          payload.advertising,
          payload.functional,
          countryCode
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw app.httpErrors.internalServerError("failed to persist privacy consent");
      }

      const effectiveRegion = row.region_code ?? countryCode;
      return privacyConsentSchema.parse({
        necessary: true,
        analytics: row.analytics_enabled,
        advertising: row.advertising_enabled,
        functional: row.functional_enabled,
        consentCapturedAt: row.updated_at.toISOString(),
        regionCode: effectiveRegion ?? null,
        requiresExplicitConsent: requiresExplicitConsent(effectiveRegion)
      });
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
      const entitlements = await entitlementsFor(request);
      if (entitlements.searchMode === "title_source") {
        const { accountId, dbClient } = accountContextFor(request);
        return searchClustersTitleAndSource(dbClient, accountId, query);
      }
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

    const aiUsageMonthQuerySchema = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional()
    });

    protectedRoutes.get("/v1/ai/usage", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const query = aiUsageMonthQuerySchema.parse(request.query);
      const summary = await getMonthlyUsage(app.pg, authContext.accountId, query.month);
      return aiUsageSummarySchema.parse(summary);
    });

    // ---------- Sponsored placements ----------

    const placementIdParams = z.object({ id: z.string().uuid() });

    protectedRoutes.get("/v1/sponsored-placements", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }

      const result = await request.dbClient.query<{
        id: string;
        name: string;
        headline: string;
        image_url: string | null;
        target_url: string;
        cta_text: string;
        position: number;
      }>(
        `SELECT id, name, headline, image_url, target_url, cta_text, position
         FROM sponsored_placement
         WHERE tenant_id = $1
           AND active = true
           AND (impression_budget IS NULL OR impressions_served < impression_budget)
           AND (click_budget IS NULL OR clicks_served < click_budget)
         ORDER BY position ASC`,
        [authContext.accountId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        headline: row.headline,
        imageUrl: row.image_url,
        targetUrl: row.target_url,
        ctaText: row.cta_text,
        position: row.position,
      }));
    });

    protectedRoutes.post("/v1/sponsored-placements/:id/impression", async (request, reply) => {
      const { id } = placementIdParams.parse(request.params);
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }

      const updated = await request.dbClient.query(
        `UPDATE sponsored_placement
         SET impressions_served = impressions_served + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, authContext.accountId]
      );

      if ((updated as { rowCount: number }).rowCount === 0) {
        return reply.notFound("placement not found");
      }

      await request.dbClient.query(
        `INSERT INTO sponsored_event (tenant_id, placement_id, event_type)
         VALUES ($1, $2, 'impression')`,
        [authContext.accountId, id]
      );

      return { ok: true };
    });

    protectedRoutes.post("/v1/sponsored-placements/:id/click", async (request, reply) => {
      const { id } = placementIdParams.parse(request.params);
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing account db context");
      }

      const updated = await request.dbClient.query(
        `UPDATE sponsored_placement
         SET clicks_served = clicks_served + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, authContext.accountId]
      );

      if ((updated as { rowCount: number }).rowCount === 0) {
        return reply.notFound("placement not found");
      }

      await request.dbClient.query(
        `INSERT INTO sponsored_event (tenant_id, placement_id, event_type)
         VALUES ($1, $2, 'click')`,
        [authContext.accountId, id]
      );

      return { ok: true };
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

async function searchClustersTitleAndSource(
  dbClient: {
    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  },
  accountId: string,
  query: SearchQuery
): Promise<{ data: ClusterCard[]; nextCursor: string | null }> {
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
  const limit = query.limit;
  const whereConditions: string[] = [
    "c.tenant_id = $2",
    "i.tenant_id = $2",
    "to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(source_feed.title, '')) @@ websearch_to_tsquery('english', $1)"
  ];
  const params: unknown[] = [query.q, accountId];
  let nextParam = 3;

  if (query.folderId) {
    whereConditions.push(`c.folder_id = $${nextParam}`);
    params.push(query.folderId);
    nextParam++;
  }
  if (query.feedId) {
    whereConditions.push(`i.feed_id = $${nextParam}`);
    params.push(query.feedId);
    nextParam++;
  }

  const searchSql = `
      SELECT DISTINCT ON (c.id)
        c.id,
        COALESCE(rep_i.title, 'Untitled') AS headline,
        rep_i.hero_image_url,
        COALESCE(rep_feed.id, '00000000-0000-0000-0000-000000000000') AS primary_feed_id,
        COALESCE(rep_feed.title, 'Unknown') AS primary_source,
        COALESCE(rep_i.published_at, c.created_at) AS primary_source_published_at,
        c.size AS outlet_count,
        c.folder_id,
        COALESCE(fo.name, 'Other') AS folder_name,
        c.topic_id,
        t.name AS topic_name,
        rep_i.summary,
        CASE
          WHEN latest_filter_event.action = 'breakout_shown'
          THEN COALESCE(latest_filter_event.rule_pattern, 'breakout_shown')
          ELSE NULL
        END AS muted_breakout_reason,
        rs.read_at,
        rs.saved_at,
        ts_rank(
          to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(source_feed.title, '')),
          websearch_to_tsquery('english', $1)
        ) AS rank
      FROM item i
      JOIN feed source_feed
        ON source_feed.id = i.feed_id
       AND source_feed.tenant_id = i.tenant_id
      JOIN cluster_member cm
        ON cm.item_id = i.id
       AND cm.tenant_id = i.tenant_id
      JOIN cluster c
        ON c.id = cm.cluster_id
       AND c.tenant_id = cm.tenant_id
      LEFT JOIN item rep_i
        ON rep_i.id = c.rep_item_id
       AND rep_i.tenant_id = c.tenant_id
      LEFT JOIN feed rep_feed
        ON rep_feed.id = rep_i.feed_id
       AND rep_feed.tenant_id = c.tenant_id
      LEFT JOIN folder fo ON fo.id = c.folder_id
      LEFT JOIN topic t
        ON t.id = c.topic_id
       AND t.tenant_id = c.tenant_id
      LEFT JOIN read_state rs
        ON rs.cluster_id = c.id
       AND rs.tenant_id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT fe.action, fr.pattern AS rule_pattern
        FROM filter_event fe
        LEFT JOIN filter_rule fr
          ON fr.id = fe.rule_id
         AND fr.tenant_id = fe.tenant_id
        WHERE fe.cluster_id = c.id
          AND fe.tenant_id = c.tenant_id
        ORDER BY fe.ts DESC
        LIMIT 1
      ) latest_filter_event ON TRUE
      WHERE ${whereConditions.join("\n        AND ")}
      ORDER BY c.id, rank DESC
  `;

  const wrappedSql = `
      SELECT * FROM (${searchSql}) sub
      ORDER BY sub.rank DESC
      OFFSET $${nextParam} LIMIT $${nextParam + 1}
  `;

  params.push(offset, limit + 1);
  const result = await dbClient.query<{
    id: string;
    headline: string;
    hero_image_url: string | null;
    primary_feed_id: string;
    primary_source: string;
    primary_source_published_at: Date;
    outlet_count: number;
    folder_id: string;
    folder_name: string;
    topic_id: string | null;
    topic_name: string | null;
    summary: string | null;
    muted_breakout_reason: string | null;
    read_at: Date | null;
    saved_at: Date | null;
  }>(wrappedSql, params);

  const hasMore = result.rows.length > limit;
  const data: ClusterCard[] = result.rows.slice(0, limit).map((row) => ({
    id: row.id,
    headline: row.headline,
    heroImageUrl: row.hero_image_url,
    primaryFeedId: row.primary_feed_id,
    primarySource: row.primary_source,
    primarySourcePublishedAt: row.primary_source_published_at.toISOString(),
    outletCount: Number(row.outlet_count),
    folderId: row.folder_id,
    folderName: row.folder_name,
    topicId: row.topic_id,
    topicName: row.topic_name,
    summary: row.summary,
    mutedBreakoutReason: row.muted_breakout_reason,
    rankingExplainability: null,
    isRead: row.read_at != null,
    isSaved: row.saved_at != null
  }));

  return {
    data,
    nextCursor: hasMore ? String(offset + limit) : null
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
