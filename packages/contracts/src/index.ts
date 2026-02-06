import { z } from "zod";

export const storyStateSchema = z.enum(["unread", "saved", "all"]);
export type StoryState = z.infer<typeof storyStateSchema>;

export const storySortSchema = z.enum(["personal", "latest"]);
export type StorySort = z.infer<typeof storySortSchema>;

export const clusterFeedbackTypeSchema = z.enum(["not_interested", "split_request"]);
export type ClusterFeedbackType = z.infer<typeof clusterFeedbackTypeSchema>;

export const filterTypeSchema = z.enum(["phrase", "regex"]);
export type FilterType = z.infer<typeof filterTypeSchema>;

export const filterModeSchema = z.enum(["mute", "block"]);
export type FilterMode = z.infer<typeof filterModeSchema>;

export const annotationColorSchema = z.enum(["yellow", "green", "blue", "pink"]);
export type AnnotationColor = z.infer<typeof annotationColorSchema>;

export const aiModeSchema = z.enum(["off", "summaries_digest", "full"]);
export type AiMode = z.infer<typeof aiModeSchema>;

export const aiProviderSchema = z.enum(["openai", "anthropic", "local"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1)
});
export type Folder = z.infer<typeof folderSchema>;

export const feedWeightSchema = z.enum(["prefer", "neutral", "deprioritize"]);
export type FeedWeight = z.infer<typeof feedWeightSchema>;

export const feedSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  title: z.string(),
  siteUrl: z.string().url().nullable(),
  folderId: z.string().uuid(),
  folderConfidence: z.number().min(0).max(1),
  weight: feedWeightSchema,
  muted: z.boolean(),
  trial: z.boolean(),
  createdAt: z.string().datetime(),
  lastPolledAt: z.string().datetime().nullable()
});
export type Feed = z.infer<typeof feedSchema>;

export const clusterCardSchema = z.object({
  id: z.string().uuid(),
  headline: z.string(),
  heroImageUrl: z.string().url().nullable(),
  primarySource: z.string(),
  primarySourcePublishedAt: z.string().datetime(),
  outletCount: z.number().int().min(1),
  folderId: z.string().uuid(),
  folderName: z.string(),
  summary: z.string().nullable(),
  mutedBreakoutReason: z.string().nullable(),
  isRead: z.boolean(),
  isSaved: z.boolean()
});
export type ClusterCard = z.infer<typeof clusterCardSchema>;

export const clusterDetailMemberSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string(),
  sourceName: z.string(),
  url: z.string().url(),
  publishedAt: z.string().datetime()
});
export type ClusterDetailMember = z.infer<typeof clusterDetailMemberSchema>;

export const clusterDetailSchema = z.object({
  cluster: clusterCardSchema,
  storySoFar: z.string().nullable(),
  members: z.array(clusterDetailMemberSchema)
});
export type ClusterDetail = z.infer<typeof clusterDetailSchema>;

export const filterRuleSchema = z.object({
  id: z.string().uuid(),
  pattern: z.string().min(1),
  type: filterTypeSchema,
  mode: filterModeSchema,
  breakoutEnabled: z.boolean(),
  createdAt: z.string().datetime()
});
export type FilterRule = z.infer<typeof filterRuleSchema>;

export const annotationSchema = z.object({
  id: z.string().uuid(),
  clusterId: z.string().uuid(),
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
  clusterId: z.string().uuid(),
  headline: z.string(),
  section: z.enum(["top_picks", "big_stories", "quick_scan"]),
  oneLiner: z.string().nullable()
});
export type DigestEntry = z.infer<typeof digestEntrySchema>;

export const digestSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  startTs: z.string().datetime(),
  endTs: z.string().datetime(),
  title: z.string(),
  body: z.string(),
  entries: z.array(digestEntrySchema)
});
export type Digest = z.infer<typeof digestSchema>;

export const settingsSchema = z.object({
  aiMode: aiModeSchema,
  aiProvider: aiProviderSchema,
  openaiApiKey: z.string().optional().default(""),
  monthlyAiCapUsd: z.number().min(0),
  aiFallbackToLocal: z.boolean(),
  digestAwayHours: z.number().int().min(1),
  digestBacklogThreshold: z.number().int().min(1),
  feedPollMinutes: z.number().int().min(5),
  wallabagUrl: z.string().optional().default("")
});
export type Settings = z.infer<typeof settingsSchema>;

export const listClustersQuerySchema = z.object({
  folder_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: storyStateSchema.default("unread"),
  sort: storySortSchema.default("personal")
});
export type ListClustersQuery = z.infer<typeof listClustersQuerySchema>;

export const addFeedRequestSchema = z.object({
  url: z.string().url()
});
export type AddFeedRequest = z.infer<typeof addFeedRequestSchema>;

export const updateFeedRequestSchema = z.object({
  folderId: z.string().uuid().optional(),
  weight: feedWeightSchema.optional(),
  muted: z.boolean().optional(),
  trial: z.boolean().optional()
});
export type UpdateFeedRequest = z.infer<typeof updateFeedRequestSchema>;

export const createFilterRuleRequestSchema = z.object({
  pattern: z.string().min(1),
  type: filterTypeSchema,
  mode: filterModeSchema,
  breakoutEnabled: z.boolean().default(true)
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
  payload: z.record(z.unknown()).default({})
});
export type Event = z.infer<typeof eventSchema>;

export const eventsBatchRequestSchema = z.object({
  events: z.array(eventSchema).max(100)
});
export type EventsBatchRequest = z.infer<typeof eventsBatchRequestSchema>;

export const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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
  total: z.number().int().min(0)
});
export type OpmlImportResponse = z.infer<typeof opmlImportResponseSchema>;

export const recordEventsResponseSchema = z.object({
  accepted: z.number().int().min(0),
  deduped: z.number().int().min(0)
});
export type RecordEventsResponse = z.infer<typeof recordEventsResponseSchema>;

export const opmlFeedSchema = z.object({
  xmlUrl: z.string().url(),
  title: z.string(),
  htmlUrl: z.string().url().nullable(),
  category: z.string().nullable()
});
export type OpmlFeed = z.infer<typeof opmlFeedSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional()
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResponseSchema = z.object({
  data: z.array(clusterCardSchema),
  nextCursor: z.string().nullable()
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ---------- Push subscription schemas ----------

export const pushSubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});
export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;

export const pushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url()
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

export const apiRoutes = {
  clusters: "/v1/clusters",
  folders: "/v1/folders",
  feeds: "/v1/feeds",
  filters: "/v1/filters",
  digests: "/v1/digests",
  events: "/v1/events",
  settings: "/v1/settings",
  authLogin: "/v1/auth/login",
  authLogout: "/v1/auth/logout",
  authRefresh: "/v1/auth/refresh",
  opmlImport: "/v1/opml/import",
  opmlExport: "/v1/opml/export",
  search: "/v1/search",
  pushVapidKey: "/v1/push/vapid-key",
  pushSubscribe: "/v1/push/subscribe",
  stats: "/v1/stats"
} as const;
