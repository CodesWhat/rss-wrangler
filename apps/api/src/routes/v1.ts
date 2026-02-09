import {
  addFeedRequestSchema,
  accountEntitlementsSchema,
  clusterFeedbackRequestSchema,
  accountDataExportStatusSchema,
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  billingOverviewSchema,
  billingPortalResponseSchema,
  billingSubscriptionActionRequestSchema,
  billingSubscriptionActionResponseSchema,
  changePasswordRequestSchema,
  createWorkspaceInviteRequestSchema,
  createAnnotationRequestSchema,
  createFilterRuleRequestSchema,
  eventsBatchRequestSchema,
  forgotPasswordRequestSchema,
  joinWorkspaceRequestSchema,
  listClustersQuerySchema,
  loginRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  signupRequestSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  privacyConsentSchema,
  requestAccountDeletionSchema,
  recordDwellRequestSchema,
  renameTopicRequestSchema,
  resolveTopicRequestSchema,
  opmlImportResponseSchema,
  searchQuerySchema,
  statsQuerySchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updatePrivacyConsentRequestSchema,
  updateMemberRequestSchema,
  updateMembershipPolicyRequestSchema,
  updateSettingsRequestSchema,
  workspaceInviteSchema,
  workspaceMemberSchema,
  type ClusterCard,
  type SearchQuery
} from "@rss-wrangler/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiEnv } from "../config/env";
import { getAccountEntitlements } from "../plugins/entitlements";
import { createAuthService } from "../services/auth-service";
import { createBillingService } from "../services/billing-service";
import { parseOpml } from "../services/opml-parser";
import { PostgresStore } from "../services/postgres-store";
import { requiresExplicitConsent, resolveCountryCode } from "../services/privacy-consent-service";
import { validateFeedUrl } from "../services/url-validator";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

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

export const v1Routes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const auth = createAuthService(app, env, app.pg);
  const billing = createBillingService(env, app.pg, app.log);

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
    const tokens = await auth.login(payload.username, payload.password, payload.tenantSlug);

    if (tokens === "email_not_verified") {
      return reply.forbidden("email not verified");
    }
    if (tokens === "pending_approval") {
      return reply.forbidden("account is pending approval");
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

  app.post("/v1/auth/join", async (request, reply) => {
    const payload = joinWorkspaceRequestSchema.parse(request.body);
    const result = await auth.joinWorkspace(payload);

    if (result === "tenant_not_found") {
      return reply.notFound("workspace not found");
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
    if (result === "pending_approval") {
      return reply.code(202).send({ pendingApproval: true });
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

    const tenantContextFor = (request: FastifyRequest) => {
      const tenantId = request.authContext?.tenantId;
      if (!tenantId) {
        throw app.httpErrors.unauthorized("missing tenant context");
      }
      if (!request.dbClient) {
        throw app.httpErrors.internalServerError("missing tenant db context");
      }
      return { tenantId, dbClient: request.dbClient };
    };

    const entitlementsFor = async (request: FastifyRequest) => {
      const { tenantId, dbClient } = tenantContextFor(request);
      return getAccountEntitlements(dbClient, tenantId);
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

    protectedRoutes.get("/v1/account/invites", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const invites = await auth.listWorkspaceInvites(authContext.userId, authContext.tenantId);
      return invites.map((invite) => workspaceInviteSchema.parse(invite));
    });

    protectedRoutes.post("/v1/account/invites", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const payload = createWorkspaceInviteRequestSchema.parse(request.body);
      const invite = await auth.createWorkspaceInvite(authContext.userId, authContext.tenantId, payload);
      if (invite === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      return workspaceInviteSchema.parse(invite);
    });

    protectedRoutes.post("/v1/account/invites/:id/revoke", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = inviteIdParams.parse(request.params);
      const invite = await auth.revokeWorkspaceInvite(authContext.userId, authContext.tenantId, id);
      if (invite === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      if (!invite) {
        return reply.notFound("pending invite not found");
      }
      return workspaceInviteSchema.parse(invite);
    });

    // ---------- Member management ----------

    protectedRoutes.get("/v1/account/members", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const members = await auth.listMembers(authContext.tenantId);
      return members.map((m) => workspaceMemberSchema.parse(m));
    });

    protectedRoutes.patch("/v1/account/members/:id", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const body = updateMemberRequestSchema.parse(request.body);

      if (body.role) {
        const result = await auth.updateMemberRole(authContext.userId, authContext.tenantId, id, body.role);
        if (result === "not_owner") {
          return reply.forbidden("only workspace owner can perform this action");
        }
        if (result === "user_not_found") {
          return reply.notFound("member not found");
        }
        if (result === "cannot_modify_self") {
          return reply.badRequest("cannot modify your own role/status");
        }
        return workspaceMemberSchema.parse(result);
      }

      return reply.badRequest("no update fields provided");
    });

    protectedRoutes.post("/v1/account/members/:id/approve", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const result = await auth.approveMember(authContext.userId, authContext.tenantId, id);

      if (result === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      if (result === "user_not_found") {
        return reply.notFound("member not found");
      }
      if (result === "not_pending") {
        return reply.badRequest("member is not pending approval");
      }
      return workspaceMemberSchema.parse(result);
    });

    protectedRoutes.post("/v1/account/members/:id/reject", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const result = await auth.rejectMember(authContext.userId, authContext.tenantId, id);

      if (result === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      if (result === "user_not_found") {
        return reply.notFound("member not found");
      }
      if (result === "not_pending") {
        return reply.badRequest("member is not pending approval");
      }
      return { ok: true };
    });

    protectedRoutes.post("/v1/account/members/:id/remove", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const { id } = memberIdParams.parse(request.params);
      const result = await auth.removeMember(authContext.userId, authContext.tenantId, id);

      if (result === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      if (result === "user_not_found") {
        return reply.notFound("member not found");
      }
      if (result === "cannot_modify_self") {
        return reply.badRequest("cannot modify your own role/status");
      }
      return { ok: true };
    });

    // ---------- Workspace policy ----------

    protectedRoutes.get("/v1/workspace/policy", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const policy = await auth.getMembershipPolicy(authContext.tenantId);
      return { policy: policy ?? "invite_only" };
    });

    protectedRoutes.put("/v1/workspace/policy", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const body = updateMembershipPolicyRequestSchema.parse(request.body);
      const result = await auth.updateMembershipPolicy(authContext.userId, authContext.tenantId, body.policy);

      if (result === "not_owner") {
        return reply.forbidden("only workspace owner can perform this action");
      }
      return { policy: result };
    });

    protectedRoutes.get("/v1/account/data-export", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      return auth.getAccountDataExportStatus(authContext.userId, authContext.tenantId);
    });

    protectedRoutes.post("/v1/account/data-export/request", async (request) => {
      const authContext = request.authContext;
      if (!authContext) {
        throw app.httpErrors.unauthorized("missing auth context");
      }
      const status = await auth.requestAccountDataExport(authContext.userId, authContext.tenantId);
      return accountDataExportStatusSchema.parse(status);
    });

    protectedRoutes.get("/v1/account/data-export/download", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }

      const download = await auth.getAccountDataExportPayload(authContext.userId, authContext.tenantId);
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
      const overview = await billing.getOverview(authContext.tenantId);
      return billingOverviewSchema.parse(overview);
    });

    protectedRoutes.post("/v1/billing/checkout", async (request, reply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply.unauthorized("missing auth context");
      }
      const payload = billingCheckoutRequestSchema.parse(request.body);
      const result = await billing.createCheckout({
        tenantId: authContext.tenantId,
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

      const result = await billing.getPortal(authContext.tenantId);
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
      const result = await billing.updateSubscription(authContext.tenantId, payload.action);
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
        throw app.httpErrors.internalServerError("missing tenant db context");
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
        [authContext.tenantId, authContext.userId]
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
        throw app.httpErrors.internalServerError("missing tenant db context");
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
          authContext.tenantId,
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
        const { tenantId, dbClient } = tenantContextFor(request);
        return searchClustersTitleAndSource(dbClient, tenantId, query);
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
  tenantId: string,
  query: SearchQuery
): Promise<{ data: ClusterCard[]; nextCursor: string | null }> {
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
  const limit = query.limit;

  const searchSql = `
      SELECT DISTINCT ON (c.id)
        c.id,
        COALESCE(rep_i.title, 'Untitled') AS headline,
        rep_i.hero_image_url,
        COALESCE(rep_feed.title, 'Unknown') AS primary_source,
        COALESCE(rep_i.published_at, c.created_at) AS primary_source_published_at,
        c.size AS outlet_count,
        c.folder_id,
        COALESCE(fo.name, 'Other') AS folder_name,
        c.topic_id,
        t.name AS topic_name,
        rep_i.summary,
        rs.read_at,
        rs.saved_at,
        ts_rank(
          to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(source_feed.title, '')),
          plainto_tsquery('english', $1)
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
      WHERE c.tenant_id = $2
        AND i.tenant_id = $2
        AND to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(source_feed.title, ''))
          @@ plainto_tsquery('english', $1)
      ORDER BY c.id, rank DESC
  `;

  const wrappedSql = `
      SELECT * FROM (${searchSql}) sub
      ORDER BY sub.rank DESC
      OFFSET $3 LIMIT $4
  `;

  const result = await dbClient.query<{
    id: string;
    headline: string;
    hero_image_url: string | null;
    primary_source: string;
    primary_source_published_at: Date;
    outlet_count: number;
    folder_id: string;
    folder_name: string;
    topic_id: string | null;
    topic_name: string | null;
    summary: string | null;
    read_at: Date | null;
    saved_at: Date | null;
  }>(wrappedSql, [query.q, tenantId, offset, limit + 1]);

  const hasMore = result.rows.length > limit;
  const data: ClusterCard[] = result.rows.slice(0, limit).map((row) => ({
    id: row.id,
    headline: row.headline,
    heroImageUrl: row.hero_image_url,
    primarySource: row.primary_source,
    primarySourcePublishedAt: row.primary_source_published_at.toISOString(),
    outletCount: Number(row.outlet_count),
    folderId: row.folder_id,
    folderName: row.folder_name,
    topicId: row.topic_id,
    topicName: row.topic_name,
    summary: row.summary,
    mutedBreakoutReason: null,
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
