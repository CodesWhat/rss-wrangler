import { z } from "zod";

export type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
} from "./ai-provider.js";

export { createOpenAiProvider } from "./ai-providers/openai.js";
export { createAnthropicProvider } from "./ai-providers/anthropic.js";
export { createOllamaProvider } from "./ai-providers/ollama.js";
export { createAiRegistry } from "./ai-providers/registry.js";
export type { AiRegistry } from "./ai-providers/registry.js";

export const storyStateSchema = z.enum(["unread", "saved", "all"]);
export type StoryState = z.infer<typeof storyStateSchema>;

export const storySortSchema = z.enum(["personal", "latest"]);
export type StorySort = z.infer<typeof storySortSchema>;

export const clusterFeedbackTypeSchema = z.enum(["not_interested", "split_request"]);
export type ClusterFeedbackType = z.infer<typeof clusterFeedbackTypeSchema>;

export const filterTargetSchema = z.enum(["keyword", "author", "domain", "url_pattern"]);
export type FilterTarget = z.infer<typeof filterTargetSchema>;

export const filterTypeSchema = z.enum(["phrase", "regex"]);
export type FilterType = z.infer<typeof filterTypeSchema>;

export const filterModeSchema = z.enum(["mute", "block", "keep"]);
export type FilterMode = z.infer<typeof filterModeSchema>;

export const annotationColorSchema = z.enum(["yellow", "green", "blue", "pink"]);
export type AnnotationColor = z.infer<typeof annotationColorSchema>;

export const aiModeSchema = z.enum(["off", "summaries_digest", "full"]);
export type AiMode = z.infer<typeof aiModeSchema>;

export const aiProviderSchema = z.enum(["openai", "anthropic", "local"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const planIdSchema = z.enum(["free", "pro", "pro_ai"]);
export type PlanId = z.infer<typeof planIdSchema>;

export const planSubscriptionStatusSchema = z.enum(["active", "trialing", "past_due", "canceled"]);
export type PlanSubscriptionStatus = z.infer<typeof planSubscriptionStatusSchema>;

export const searchModeSchema = z.enum(["title_source", "full_text"]);
export type SearchMode = z.infer<typeof searchModeSchema>;

export const folderSchema = z.object({
  id: z.string(),
  name: z.string().min(1)
});
export type Folder = z.infer<typeof folderSchema>;

export const topicSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Topic = z.infer<typeof topicSchema>;

export const feedTopicSchema = z.object({
  feedId: z.string(),
  topicId: z.string(),
  topicName: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  confidence: z.number().min(0).max(1),
  proposedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type FeedTopic = z.infer<typeof feedTopicSchema>;

export const classificationStatusSchema = z.enum(["pending_classification", "classified", "approved"]);
export type ClassificationStatus = z.infer<typeof classificationStatusSchema>;

export const feedWeightSchema = z.enum(["prefer", "neutral", "deprioritize"]);
export type FeedWeight = z.infer<typeof feedWeightSchema>;

export const readerModeSchema = z.enum(["feed", "original", "text"]);
export type ReaderMode = z.infer<typeof readerModeSchema>;

export const feedParseFailureStageSchema = z.enum([
  "url_validation",
  "parse",
  "http",
  "network_or_unknown"
]);
export type FeedParseFailureStage = z.infer<typeof feedParseFailureStageSchema>;

export const feedSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  siteUrl: z.string().nullable(),
  folderId: z.string(),
  folderConfidence: z.number().min(0).max(1),
  weight: feedWeightSchema,
  muted: z.boolean(),
  trial: z.boolean(),
  classificationStatus: classificationStatusSchema,
  createdAt: z.string().datetime(),
  lastPolledAt: z.string().datetime().nullable(),
  lastParseSuccessAt: z.string().datetime().nullable(),
  lastParseFailureAt: z.string().datetime().nullable(),
  lastParseFailureStage: feedParseFailureStageSchema.nullable(),
  lastParseFailureError: z.string().nullable(),
  defaultReaderMode: readerModeSchema.nullable()
});
export type Feed = z.infer<typeof feedSchema>;

export const clusterCardSchema = z.object({
  id: z.string(),
  headline: z.string(),
  heroImageUrl: z.string().nullable(),
  primaryFeedId: z.string(),
  primarySource: z.string(),
  primarySourcePublishedAt: z.string().datetime(),
  outletCount: z.number().int().min(1),
  folderId: z.string(),
  folderName: z.string(),
  topicId: z.string().nullable(),
  topicName: z.string().nullable(),
  summary: z.string().nullable(),
  mutedBreakoutReason: z.string().nullable(),
  rankingExplainability: z.object({
    finalScore: z.number(),
    recency: z.number(),
    saved: z.number(),
    clusterSize: z.number(),
    sourceWeight: z.number(),
    engagement: z.number(),
    topicAffinity: z.number(),
    folderAffinity: z.number(),
    diversityPenalty: z.number(),
    explorationBoost: z.number()
  }).nullable(),
  dedupeReason: z.string().optional(),
  hiddenSignals: z.array(z.object({
    label: z.string(),
    reason: z.string()
  })).optional(),
  isRead: z.boolean(),
  isSaved: z.boolean()
});
export type ClusterCard = z.infer<typeof clusterCardSchema>;

export const clusterDetailMemberSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  sourceName: z.string(),
  url: z.string(),
  publishedAt: z.string().datetime()
});
export type ClusterDetailMember = z.infer<typeof clusterDetailMemberSchema>;

export const clusterStoryTextSourceSchema = z.enum([
  "extracted_full_text",
  "summary_fallback",
  "unavailable"
]);
export type ClusterStoryTextSource = z.infer<typeof clusterStoryTextSourceSchema>;

export const clusterDetailSchema = z.object({
  cluster: clusterCardSchema,
  storySoFar: z.string().nullable(),
  storyTextSource: clusterStoryTextSourceSchema,
  storyExtractedAt: z.string().datetime().nullable(),
  members: z.array(clusterDetailMemberSchema),
  primaryFeedDefaultReaderMode: readerModeSchema.nullable()
});
export type ClusterDetail = z.infer<typeof clusterDetailSchema>;

export const filterRuleSchema = z.object({
  id: z.string(),
  pattern: z.string().min(1),
  target: filterTargetSchema,
  type: filterTypeSchema,
  mode: filterModeSchema,
  breakoutEnabled: z.boolean(),
  feedId: z.string().nullable(),
  folderId: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type FilterRule = z.infer<typeof filterRuleSchema>;

export const annotationSchema = z.object({
  id: z.string(),
  clusterId: z.string(),
  highlightedText: z.string(),
  note: z.string().nullable(),
  color: annotationColorSchema,
  createdAt: z.string().datetime()
});
export type Annotation = z.infer<typeof annotationSchema>;

export const createAnnotationRequestSchema = z.object({
  highlightedText: z.string().min(1),
  note: z.string().optional(),
  color: annotationColorSchema.default("yellow")
});
export type CreateAnnotationRequest = z.infer<typeof createAnnotationRequestSchema>;

export const digestEntrySchema = z.object({
  clusterId: z.string(),
  headline: z.string(),
  section: z.enum(["top_picks", "big_stories", "quick_scan"]),
  oneLiner: z.string().nullable()
});
export type DigestEntry = z.infer<typeof digestEntrySchema>;

export const digestSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  startTs: z.string().datetime(),
  endTs: z.string().datetime(),
  title: z.string(),
  body: z.string(),
  entries: z.array(digestEntrySchema)
});
export type Digest = z.infer<typeof digestSchema>;

export const markReadOnScrollSchema = z.enum(["off", "on_scroll", "on_open"]);
export type MarkReadOnScroll = z.infer<typeof markReadOnScrollSchema>;
export const markReadOnScrollOverrideSchema = z.object({
  mode: markReadOnScrollSchema.optional(),
  delayMs: z.number().int().min(0).max(5000).optional(),
  threshold: z.number().min(0).max(1).optional()
});
export type MarkReadOnScrollOverride = z.infer<typeof markReadOnScrollOverrideSchema>;

export const savedSearchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  query: z.string().min(1),
  folderId: z.string().nullable(),
  feedId: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;

export const settingsSchema = z.object({
  aiMode: aiModeSchema,
  aiProvider: aiProviderSchema,
  openaiApiKey: z.string().optional().default(""),
  monthlyAiCapUsd: z.number().min(0),
  aiFallbackToLocal: z.boolean(),
  digestAwayHours: z.number().int().min(1),
  digestBacklogThreshold: z.number().int().min(1),
  feedPollMinutes: z.number().int().min(5),
  markReadOnScroll: markReadOnScrollSchema.default("off"),
  markReadOnScrollListDelayMs: z.number().int().min(0).max(5000).default(1500),
  markReadOnScrollCompactDelayMs: z.number().int().min(0).max(5000).default(1500),
  markReadOnScrollCardDelayMs: z.number().int().min(0).max(5000).default(1500),
  markReadOnScrollListThreshold: z.number().min(0).max(1).default(0.6),
  markReadOnScrollCompactThreshold: z.number().min(0).max(1).default(0.6),
  markReadOnScrollCardThreshold: z.number().min(0).max(1).default(0.6),
  markReadOnScrollFeedOverrides: z.record(z.string(), markReadOnScrollOverrideSchema).default({}),
  unreadMaxAgeDays: z.number().int().min(1).max(3650).nullable().default(null),
  readPurgeDays: z.number().int().min(1).max(3650).nullable().default(null),
  savedSearches: z.array(savedSearchSchema).max(50).default([]),
  wallabagUrl: z.string().optional().default(""),
  onboardingCompletedAt: z.string().datetime().nullable().optional()
});
export type Settings = z.infer<typeof settingsSchema>;

export const listClustersQuerySchema = z.object({
  folder_id: z.string().optional(),
  topic_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: storyStateSchema.default("unread"),
  sort: storySortSchema.default("personal")
});
export type ListClustersQuery = z.infer<typeof listClustersQuerySchema>;

export const markAllReadRequestSchema = z.object({
  olderThanHours: z.number().int().min(0).max(24 * 365).optional(),
  folderId: z.string().optional(),
  topicId: z.string().optional()
});
export type MarkAllReadRequest = z.infer<typeof markAllReadRequestSchema>;

export const addFeedRequestSchema = z.object({
  url: z.string()
});
export type AddFeedRequest = z.infer<typeof addFeedRequestSchema>;

export const pollFeedNowRequestSchema = z.object({
  lookbackDays: z.number().int().min(1).max(30).optional()
});
export type PollFeedNowRequest = z.infer<typeof pollFeedNowRequestSchema>;

export const updateFeedRequestSchema = z.object({
  folderId: z.string().optional(),
  weight: feedWeightSchema.optional(),
  muted: z.boolean().optional(),
  trial: z.boolean().optional(),
  defaultReaderMode: readerModeSchema.nullable().optional()
});
export type UpdateFeedRequest = z.infer<typeof updateFeedRequestSchema>;

export const createFilterRuleRequestSchema = z.object({
  pattern: z.string().min(1),
  target: filterTargetSchema.default("keyword"),
  type: filterTypeSchema,
  mode: filterModeSchema,
  breakoutEnabled: z.boolean().default(true),
  feedId: z.string().nullable().default(null),
  folderId: z.string().nullable().default(null)
});
export type CreateFilterRuleRequest = z.infer<typeof createFilterRuleRequestSchema>;

export const updateFilterRuleRequestSchema = createFilterRuleRequestSchema.partial();
export type UpdateFilterRuleRequest = z.infer<typeof updateFilterRuleRequestSchema>;

export const clusterFeedbackRequestSchema = z.object({
  type: clusterFeedbackTypeSchema
});
export type ClusterFeedbackRequest = z.infer<typeof clusterFeedbackRequestSchema>;

export const eventSchema = z.object({
  idempotencyKey: z.string().min(6),
  ts: z.string().datetime(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});
export type Event = z.infer<typeof eventSchema>;

export const eventsBatchRequestSchema = z.object({
  events: z.array(eventSchema).max(100)
});
export type EventsBatchRequest = z.infer<typeof eventsBatchRequestSchema>;

const accountSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/);

const accountSlugWithDefaultSchema = accountSlugSchema.optional().default("default");

export const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  accountSlug: accountSlugWithDefaultSchema,
  /** @deprecated Use accountSlug instead */
  tenantSlug: accountSlugWithDefaultSchema
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const signupRequestSchema = z.object({
  /** @deprecated Use accountName instead */
  tenantName: z.string().trim().min(2).max(100),
  /** @deprecated Use accountSlug instead */
  tenantSlug: accountSlugSchema,
  email: z.string().trim().email().max(320),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8),
  /** Preferred field name -- falls back to tenantName */
  accountName: z.string().trim().min(2).max(100).optional(),
  /** Preferred field name -- falls back to tenantSlug */
  accountSlug: accountSlugSchema.optional()
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const joinAccountRequestSchema = z.object({
  accountSlug: accountSlugWithDefaultSchema,
  email: z.string().trim().email().max(320),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8),
  inviteCode: z.string().trim().min(12).max(256).optional(),
  /** @deprecated Use accountSlug instead */
  tenantSlug: accountSlugWithDefaultSchema
});
export type JoinAccountRequest = z.input<typeof joinAccountRequestSchema>;

export const createMemberInviteRequestSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7)
});
export type CreateMemberInviteRequest = z.infer<typeof createMemberInviteRequestSchema>;

export const memberInviteSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  status: z.enum(["pending", "consumed", "revoked", "expired"]),
  inviteCode: z.string().nullable(),
  inviteUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  consumedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable()
});
export type MemberInvite = z.infer<typeof memberInviteSchema>;

export const signupResponseSchema = z.object({
  verificationRequired: z.boolean().default(false),
  expiresInSeconds: z.number().int().positive().nullable().optional()
});
export type SignupResponse = z.infer<typeof signupResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256)
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({
  accountSlug: accountSlugWithDefaultSchema,
  email: z.string().trim().email().max(320),
  /** @deprecated Use accountSlug instead */
  tenantSlug: accountSlugWithDefaultSchema
});
export type ForgotPasswordRequest = z.input<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(12).max(512),
  newPassword: z.string().min(8).max(256)
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resendVerificationRequestSchema = z.object({
  accountSlug: accountSlugWithDefaultSchema,
  email: z.string().trim().email().max(320),
  /** @deprecated Use accountSlug instead */
  tenantSlug: accountSlugWithDefaultSchema
});
export type ResendVerificationRequest = z.input<typeof resendVerificationRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(12).max(512)
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const requestAccountDeletionSchema = z.object({
  password: z.string().min(1),
  confirmText: z.literal("DELETE")
});
export type RequestAccountDeletion = z.infer<typeof requestAccountDeletionSchema>;

export const accountDeletionStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "cancelled", "completed"]),
  requestedAt: z.string().datetime(),
  cancelledAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable()
});
export type AccountDeletionStatus = z.infer<typeof accountDeletionStatusSchema>;

export const accountDataExportStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
  fileSizeBytes: z.number().int().nonnegative().nullable()
});
export type AccountDataExportStatus = z.infer<typeof accountDataExportStatusSchema>;

// ---------- Member approval / roles ----------

export const userRoleSchema = z.enum(["owner", "member"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const memberStatusSchema = z.enum(["active", "suspended"]);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const memberSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email().nullable(),
  role: userRoleSchema,
  status: memberStatusSchema,
  joinedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable()
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberRequestSchema = z.object({
  role: userRoleSchema.optional(),
  status: memberStatusSchema.optional()
});
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const memberEventSchema = z.object({
  id: z.string(),
  targetUserId: z.string(),
  actorUserId: z.string(),
  eventType: z.enum(["suspended", "role_changed", "removed"]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime()
});
export type MemberEvent = z.infer<typeof memberEventSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number().int().positive()
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const updateSettingsRequestSchema = settingsSchema.partial();
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

// ---------- Auth request/response schemas ----------

export const authRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});
export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>;

export const authLogoutRequestSchema = z.object({
  refreshToken: z.string().optional()
});
export type AuthLogoutRequest = z.infer<typeof authLogoutRequestSchema>;

// ---------- API response schemas ----------

export const digestSectionSchema = z.enum(["top_picks", "big_stories", "quick_scan"]);
export type DigestSection = z.infer<typeof digestSectionSchema>;

export const listClustersResponseSchema = z.object({
  data: z.array(clusterCardSchema),
  nextCursor: z.string().nullable()
});
export type ListClustersResponse = z.infer<typeof listClustersResponseSchema>;

export const okResponseSchema = z.object({
  ok: z.literal(true)
});
export type OkResponse = z.infer<typeof okResponseSchema>;

export const opmlImportResponseSchema = z.object({
  ok: z.literal(true),
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
  total: z.number().int().min(0),
  limitedByPlan: z.boolean().optional(),
  rejectedCount: z.number().int().min(0).optional(),
  remainingSlots: z.number().int().min(0).optional()
});
export type OpmlImportResponse = z.infer<typeof opmlImportResponseSchema>;

export const accountEntitlementsSchema = z.object({
  planId: planIdSchema,
  subscriptionStatus: planSubscriptionStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  currentPeriodEndsAt: z.string().datetime().nullable(),
  feedLimit: z.number().int().positive().nullable(),
  itemsPerDayLimit: z.number().int().positive().nullable(),
  searchMode: searchModeSchema,
  minPollMinutes: z.number().int().positive(),
  usage: z.object({
    date: z.string(),
    itemsIngested: z.number().int().min(0),
    feeds: z.number().int().min(0)
  })
});
export type AccountEntitlements = z.infer<typeof accountEntitlementsSchema>;

// ---------- Billing ----------

export const hostedPlanIdSchema = z.enum(["pro", "pro_ai"]);
export type HostedPlanId = z.infer<typeof hostedPlanIdSchema>;

export const billingIntervalSchema = z.enum(["monthly", "annual"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const billingCheckoutRequestSchema = z.object({
  planId: hostedPlanIdSchema,
  interval: billingIntervalSchema.default("monthly")
});
export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;

export const billingCheckoutResponseSchema = z.object({
  url: z.string()
});
export type BillingCheckoutResponse = z.infer<typeof billingCheckoutResponseSchema>;

export const billingPortalResponseSchema = z.object({
  url: z.string()
});
export type BillingPortalResponse = z.infer<typeof billingPortalResponseSchema>;

export const billingSubscriptionActionSchema = z.enum(["cancel", "resume"]);
export type BillingSubscriptionAction = z.infer<typeof billingSubscriptionActionSchema>;

export const billingSubscriptionActionRequestSchema = z.object({
  action: billingSubscriptionActionSchema
});
export type BillingSubscriptionActionRequest = z.infer<typeof billingSubscriptionActionRequestSchema>;

export const billingSubscriptionActionResponseSchema = z.object({
  subscriptionStatus: planSubscriptionStatusSchema,
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEndsAt: z.string().datetime().nullable(),
  customerPortalUrl: z.string().nullable()
});
export type BillingSubscriptionActionResponse = z.infer<typeof billingSubscriptionActionResponseSchema>;

export const billingOverviewSchema = z.object({
  planId: planIdSchema,
  subscriptionStatus: planSubscriptionStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  currentPeriodEndsAt: z.string().datetime().nullable(),
  billingInterval: billingIntervalSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  customerPortalUrl: z.string().nullable(),
  checkoutEnabled: z.boolean(),
  checkoutAvailability: z.object({
    pro: z.object({
      monthly: z.boolean(),
      annual: z.boolean()
    }),
    pro_ai: z.object({
      monthly: z.boolean(),
      annual: z.boolean()
    })
  })
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

// ---------- Privacy consent ----------

export const privacyConsentSchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  advertising: z.boolean(),
  functional: z.boolean(),
  consentCapturedAt: z.string().datetime().nullable(),
  regionCode: z.string().nullable(),
  requiresExplicitConsent: z.boolean()
});
export type PrivacyConsent = z.infer<typeof privacyConsentSchema>;

export const updatePrivacyConsentRequestSchema = z.object({
  analytics: z.boolean(),
  advertising: z.boolean(),
  functional: z.boolean()
});
export type UpdatePrivacyConsentRequest = z.infer<typeof updatePrivacyConsentRequestSchema>;

export const recordEventsResponseSchema = z.object({
  accepted: z.number().int().min(0),
  deduped: z.number().int().min(0)
});
export type RecordEventsResponse = z.infer<typeof recordEventsResponseSchema>;

export const opmlFeedSchema = z.object({
  xmlUrl: z.string(),
  title: z.string(),
  htmlUrl: z.string().nullable(),
  category: z.string().nullable()
});
export type OpmlFeed = z.infer<typeof opmlFeedSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  folderId: z.string().optional(),
  feedId: z.string().optional()
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResponseSchema = z.object({
  data: z.array(clusterCardSchema),
  nextCursor: z.string().nullable()
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ---------- Push subscription schemas ----------

export const pushSubscribeRequestSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});
export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;

export const pushUnsubscribeRequestSchema = z.object({
  endpoint: z.string()
});
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeRequestSchema>;

// ---------- Dwell tracking ----------

export const recordDwellRequestSchema = z.object({
  seconds: z.number().int().min(1).max(86400)
});
export type RecordDwellRequest = z.infer<typeof recordDwellRequestSchema>;

// ---------- Reading stats ----------

export const statsPeriodSchema = z.enum(["7d", "30d", "all"]);
export type StatsPeriod = z.infer<typeof statsPeriodSchema>;

export const readingStatsSchema = z.object({
  articlesReadToday: z.number().int(),
  articlesReadWeek: z.number().int(),
  articlesReadMonth: z.number().int(),
  autoReadOnScrollCount: z.number().int(),
  autoReadOnOpenCount: z.number().int(),
  autoReadTotalCount: z.number().int(),
  feedParseSuccessCount: z.number().int(),
  feedParseFailureCount: z.number().int(),
  feedParseByFormat: z.object({
    rss: z.number().int(),
    atom: z.number().int(),
    rdf: z.number().int(),
    json: z.number().int()
  }),
  avgDwellSeconds: z.number(),
  folderBreakdown: z.array(z.object({
    folderName: z.string(),
    count: z.number().int()
  })),
  topSources: z.array(z.object({
    feedTitle: z.string(),
    count: z.number().int()
  })),
  readingStreak: z.number().int(),
  peakHours: z.array(z.object({
    hour: z.number().int().min(0).max(23),
    count: z.number().int()
  })),
  dailyReads: z.array(z.object({
    date: z.string(),
    count: z.number().int()
  }))
});
export type ReadingStats = z.infer<typeof readingStatsSchema>;

export const statsQuerySchema = z.object({
  period: statsPeriodSchema.default("7d")
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const resolveTopicRequestSchema = z.object({
  topicId: z.string(),
  action: z.enum(["approve", "reject"]),
});
export type ResolveTopicRequest = z.infer<typeof resolveTopicRequestSchema>;

export const approveAllTopicsRequestSchema = z.object({
  feedId: z.string(),
});

export const renameTopicRequestSchema = z.object({
  name: z.string().min(1).max(50),
});
export type RenameTopicRequest = z.infer<typeof renameTopicRequestSchema>;

export const aiFeatureSchema = z.enum(["summary", "digest", "classification", "recommendation"]);
export type AiFeature = z.infer<typeof aiFeatureSchema>;

export const aiUsageRecordSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  feature: aiFeatureSchema,
  durationMs: z.number().int().min(0),
  createdAt: z.string().datetime()
});
export type AiUsageRecord = z.infer<typeof aiUsageRecordSchema>;

/** @deprecated Use accountId field on AiUsageRecord instead */
export type AiUsageRecordLegacy = Omit<AiUsageRecord, "accountId"> & { tenantId: string };

export const aiUsageSummarySchema = z.object({
  month: z.string(),
  totalInputTokens: z.number().int().min(0),
  totalOutputTokens: z.number().int().min(0),
  totalCalls: z.number().int().min(0),
  byProvider: z.record(z.string(), z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    calls: z.number().int().min(0)
  })),
  byFeature: z.record(z.string(), z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    calls: z.number().int().min(0)
  })),
  budgetTokens: z.number().int().min(0).nullable(),
  budgetUsedPercent: z.number().min(0).nullable()
});
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;

export const aiBudgetCheckSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().nullable(),
  used: z.number().int().min(0),
  limit: z.number().int().min(0).nullable()
});
export type AiBudgetCheck = z.infer<typeof aiBudgetCheckSchema>;

// --- Feed directory ---
export const directoryEntrySchema = z.object({
  id: z.string(),
  feedUrl: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  siteUrl: z.string().nullable(),
  language: z.string().nullable(),
  popularityRank: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;

export const directoryListResponseSchema = z.object({
  items: z.array(directoryEntrySchema),
  total: z.number().int().min(0),
});
export type DirectoryListResponse = z.infer<typeof directoryListResponseSchema>;

export const directoryQuerySchema = z.object({
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

// --- Sponsored placements ---
export const sponsoredCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string(),
  imageUrl: z.string().nullable(),
  targetUrl: z.string(),
  ctaText: z.string(),
  position: z.number().int(),
});
export type SponsoredCard = z.infer<typeof sponsoredCardSchema>;

export const apiRoutes = {
  clusters: "/v1/clusters",
  folders: "/v1/folders",
  feeds: "/v1/feeds",
  feedPollNow: "/v1/feeds/:id/poll-now",
  filters: "/v1/filters",
  digests: "/v1/digests",
  events: "/v1/events",
  settings: "/v1/settings",
  authLogin: "/v1/auth/login",
  authSignup: "/v1/auth/signup",
  authJoin: "/v1/auth/join",
  authVerifyEmail: "/v1/auth/verify-email",
  authResendVerification: "/v1/auth/resend-verification",
  authForgotPassword: "/v1/auth/forgot-password",
  authResetPassword: "/v1/auth/reset-password",
  authLogout: "/v1/auth/logout",
  authRefresh: "/v1/auth/refresh",
  accountChangePassword: "/v1/account/password",
  accountDeletionStatus: "/v1/account/deletion",
  accountDeletionRequest: "/v1/account/deletion/request",
  accountDeletionCancel: "/v1/account/deletion/cancel",
  accountInvites: "/v1/account/invites",
  accountInviteRevoke: "/v1/account/invites/:id/revoke",
  accountDataExportStatus: "/v1/account/data-export",
  accountDataExportRequest: "/v1/account/data-export/request",
  accountDataExportDownload: "/v1/account/data-export/download",
  accountEntitlements: "/v1/account/entitlements",
  billingOverview: "/v1/billing",
  billingCheckout: "/v1/billing/checkout",
  billingPortal: "/v1/billing/portal",
  billingSubscriptionAction: "/v1/billing/subscription-action",
  billingWebhook: "/v1/billing/webhooks/lemon-squeezy",
  privacyConsent: "/v1/privacy/consent",
  opmlImport: "/v1/opml/import",
  opmlExport: "/v1/opml/export",
  search: "/v1/search",
  pushVapidKey: "/v1/push/vapid-key",
  pushSubscribe: "/v1/push/subscribe",
  stats: "/v1/stats",
  topics: "/v1/topics",
  feedTopicResolve: "/v1/feeds/:id/topics/resolve",
  feedTopicApproveAll: "/v1/feeds/:id/topics/approve-all",
  pendingClassifications: "/v1/feeds/pending",
  accountMembers: "/v1/account/members",
  accountMemberUpdate: "/v1/account/members/:id",
  accountMemberRemove: "/v1/account/members/:id/remove",
  aiUsage: "/v1/ai/usage",
  sponsoredPlacements: "/v1/sponsored-placements",
  directory: "/v1/directory",
} as const;
