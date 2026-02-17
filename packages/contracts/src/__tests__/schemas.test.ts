import { describe, expect, it } from "vitest";
import {
  addFeedRequestSchema,
  aiModeSchema,
  aiProviderSchema,
  annotationColorSchema,
  annotationSchema,
  apiRoutes,
  approveAllTopicsRequestSchema,
  authLogoutRequestSchema,
  authRefreshRequestSchema,
  authTokensSchema,
  classificationStatusSchema,
  clusterCardSchema,
  clusterDetailMemberSchema,
  clusterDetailSchema,
  clusterFeedbackRequestSchema,
  clusterFeedbackTypeSchema,
  createAnnotationRequestSchema,
  createFilterRuleRequestSchema,
  digestEntrySchema,
  digestSchema,
  digestSectionSchema,
  eventSchema,
  eventsBatchRequestSchema,
  feedSchema,
  feedTopicSchema,
  feedWeightSchema,
  filterModeSchema,
  filterRuleSchema,
  filterTypeSchema,
  folderSchema,
  listClustersQuerySchema,
  listClustersResponseSchema,
  loginRequestSchema,
  okResponseSchema,
  opmlFeedSchema,
  opmlImportResponseSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  readingStatsSchema,
  recordDwellRequestSchema,
  recordEventsResponseSchema,
  renameTopicRequestSchema,
  resolveTopicRequestSchema,
  searchQuerySchema,
  searchResponseSchema,
  settingsSchema,
  statsPeriodSchema,
  statsQuerySchema,
  storySortSchema,
  storyStateSchema,
  topicSchema,
  updateFeedRequestSchema,
  updateFilterRuleRequestSchema,
  updateSettingsRequestSchema,
  planIdSchema,
  planSubscriptionStatusSchema,
  searchModeSchema,
  readerModeSchema,
  feedParseFailureStageSchema,
  signupRequestSchema,
  joinAccountRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  requestAccountDeletionSchema,
  accountDeletionStatusSchema,
  accountDataExportStatusSchema,
  accountEntitlementsSchema,
  billingCheckoutRequestSchema,
  billingOverviewSchema,
  privacyConsentSchema,
  updatePrivacyConsentRequestSchema,
  clusterAiSummaryResponseSchema,
  markReadOnScrollSchema,
  aiUsageRecordSchema,
  aiUsageSummarySchema,
  aiBudgetCheckSchema,
  directoryEntrySchema,
  directoryListResponseSchema,
  directoryQuerySchema,
  sponsoredCardSchema,
  memberSchema,
  userRoleSchema,
  memberStatusSchema,
  createMemberInviteRequestSchema,
  memberInviteSchema,
  billingSubscriptionActionRequestSchema,
} from "../index.js";

// Helper constants
const UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const UUID2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const NOW = "2025-01-15T12:00:00Z";

// ============================================================
// Enum schemas
// ============================================================

describe("storyStateSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["unread", "saved", "all"]) {
      expect(storyStateSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => storyStateSchema.parse("deleted")).toThrow();
  });
});

describe("storySortSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["personal", "latest"]) {
      expect(storySortSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => storySortSchema.parse("oldest")).toThrow();
  });
});

describe("clusterFeedbackTypeSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["not_interested", "split_request"]) {
      expect(clusterFeedbackTypeSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => clusterFeedbackTypeSchema.parse("like")).toThrow();
  });
});

describe("filterTypeSchema", () => {
  it("accepts phrase and regex", () => {
    expect(filterTypeSchema.parse("phrase")).toBe("phrase");
    expect(filterTypeSchema.parse("regex")).toBe("regex");
  });
  it("rejects invalid value", () => {
    expect(() => filterTypeSchema.parse("glob")).toThrow();
  });
});

describe("filterModeSchema", () => {
  it("accepts mute, block, and keep", () => {
    expect(filterModeSchema.parse("mute")).toBe("mute");
    expect(filterModeSchema.parse("block")).toBe("block");
    expect(filterModeSchema.parse("keep")).toBe("keep");
  });
  it("rejects invalid value", () => {
    expect(() => filterModeSchema.parse("warn")).toThrow();
  });
});

describe("annotationColorSchema", () => {
  it("accepts all four colors", () => {
    for (const c of ["yellow", "green", "blue", "pink"]) {
      expect(annotationColorSchema.parse(c)).toBe(c);
    }
  });
  it("rejects invalid color", () => {
    expect(() => annotationColorSchema.parse("red")).toThrow();
  });
});

describe("aiModeSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["off", "summaries_digest", "full"]) {
      expect(aiModeSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => aiModeSchema.parse("partial")).toThrow();
  });
});

describe("aiProviderSchema", () => {
  it("accepts valid providers", () => {
    for (const v of ["openai", "anthropic", "local"]) {
      expect(aiProviderSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid provider", () => {
    expect(() => aiProviderSchema.parse("gemini")).toThrow();
  });
});

describe("classificationStatusSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["pending_classification", "classified", "approved"]) {
      expect(classificationStatusSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => classificationStatusSchema.parse("rejected")).toThrow();
  });
});

describe("feedWeightSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["prefer", "neutral", "deprioritize"]) {
      expect(feedWeightSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => feedWeightSchema.parse("boost")).toThrow();
  });
});

describe("digestSectionSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["top_picks", "big_stories", "quick_scan"]) {
      expect(digestSectionSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => digestSectionSchema.parse("headlines")).toThrow();
  });
});

describe("statsPeriodSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["7d", "30d", "all"]) {
      expect(statsPeriodSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => statsPeriodSchema.parse("90d")).toThrow();
  });
});

describe("planIdSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["free", "pro", "pro_ai"]) {
      expect(planIdSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => planIdSchema.parse("enterprise")).toThrow();
  });
});

describe("planSubscriptionStatusSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["active", "trialing", "past_due", "canceled"]) {
      expect(planSubscriptionStatusSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => planSubscriptionStatusSchema.parse("suspended")).toThrow();
  });
});

describe("searchModeSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["title_source", "full_text"]) {
      expect(searchModeSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => searchModeSchema.parse("fuzzy")).toThrow();
  });
});

describe("readerModeSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["feed", "original", "text"]) {
      expect(readerModeSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => readerModeSchema.parse("auto")).toThrow();
  });
});

describe("feedParseFailureStageSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["url_validation", "parse", "http", "network_or_unknown"]) {
      expect(feedParseFailureStageSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => feedParseFailureStageSchema.parse("timeout")).toThrow();
  });
});

describe("markReadOnScrollSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["off", "on_scroll", "on_open"]) {
      expect(markReadOnScrollSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => markReadOnScrollSchema.parse("hover")).toThrow();
  });
});

describe("userRoleSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["owner", "member"]) {
      expect(userRoleSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => userRoleSchema.parse("admin")).toThrow();
  });
});

describe("memberStatusSchema", () => {
  it("accepts valid values", () => {
    for (const v of ["active", "suspended"]) {
      expect(memberStatusSchema.parse(v)).toBe(v);
    }
  });
  it("rejects invalid value", () => {
    expect(() => memberStatusSchema.parse("banned")).toThrow();
  });
});

// ============================================================
// Object schemas
// ============================================================

describe("folderSchema", () => {
  it("parses valid folder", () => {
    const result = folderSchema.parse({ id: UUID, name: "Tech" });
    expect(result).toEqual({ id: UUID, name: "Tech" });
  });
  it("rejects empty name", () => {
    expect(() => folderSchema.parse({ id: UUID, name: "" })).toThrow();
  });
});

describe("topicSchema", () => {
  it("parses valid topic", () => {
    const result = topicSchema.parse({ id: UUID, name: "AI", createdAt: NOW });
    expect(result).toEqual({ id: UUID, name: "AI", createdAt: NOW });
  });
  it("rejects missing createdAt", () => {
    expect(() => topicSchema.parse({ id: UUID, name: "AI" })).toThrow();
  });
  it("rejects non-datetime createdAt", () => {
    expect(() => topicSchema.parse({ id: UUID, name: "AI", createdAt: "not-a-date" })).toThrow();
  });
});

describe("feedTopicSchema", () => {
  const valid = {
    feedId: UUID,
    topicId: UUID2,
    topicName: "Tech",
    status: "pending" as const,
    confidence: 0.85,
    proposedAt: NOW,
    resolvedAt: null,
  };

  it("parses valid feedTopic", () => {
    expect(feedTopicSchema.parse(valid)).toEqual(valid);
  });
  it("accepts resolvedAt as datetime", () => {
    const result = feedTopicSchema.parse({ ...valid, resolvedAt: NOW });
    expect(result.resolvedAt).toBe(NOW);
  });
  it("rejects confidence > 1", () => {
    expect(() => feedTopicSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });
  it("rejects confidence < 0", () => {
    expect(() => feedTopicSchema.parse({ ...valid, confidence: -0.1 })).toThrow();
  });
  it("rejects invalid status", () => {
    expect(() => feedTopicSchema.parse({ ...valid, status: "unknown" })).toThrow();
  });
});

describe("feedSchema", () => {
  const valid = {
    id: UUID,
    url: "https://example.com/feed.xml",
    title: "Example Feed",
    siteUrl: "https://example.com",
    folderId: UUID,
    folderConfidence: 0.9,
    weight: "neutral" as const,
    muted: false,
    trial: false,
    classificationStatus: "classified" as const,
    createdAt: NOW,
    lastPolledAt: null,
    lastParseSuccessAt: null,
    lastParseFailureAt: null,
    lastParseFailureStage: null,
    lastParseFailureError: null,
    defaultReaderMode: null,
  };

  it("parses valid feed", () => {
    expect(feedSchema.parse(valid)).toEqual(valid);
  });
  it("accepts null siteUrl", () => {
    const result = feedSchema.parse({ ...valid, siteUrl: null });
    expect(result.siteUrl).toBeNull();
  });
  it("rejects folderConfidence out of range", () => {
    expect(() => feedSchema.parse({ ...valid, folderConfidence: 2.0 })).toThrow();
  });
  it("rejects invalid weight", () => {
    expect(() => feedSchema.parse({ ...valid, weight: "boost" })).toThrow();
  });
  it("accepts valid parse failure fields", () => {
    const result = feedSchema.parse({
      ...valid,
      lastParseFailureAt: NOW,
      lastParseFailureStage: "http",
      lastParseFailureError: "503 Service Unavailable",
    });
    expect(result.lastParseFailureStage).toBe("http");
  });
  it("accepts valid defaultReaderMode", () => {
    const result = feedSchema.parse({ ...valid, defaultReaderMode: "text" });
    expect(result.defaultReaderMode).toBe("text");
  });
});

describe("clusterCardSchema", () => {
  const valid = {
    id: UUID,
    headline: "Breaking news",
    heroImageUrl: "https://img.example.com/hero.jpg",
    primaryFeedId: UUID,
    primarySource: "Example News",
    primarySourcePublishedAt: NOW,
    outletCount: 3,
    folderId: UUID,
    folderName: "World",
    topicId: null,
    topicName: null,
    summary: "A summary",
    mutedBreakoutReason: null,
    rankingExplainability: null,
    displayMode: "full" as const,
    isRead: false,
    isSaved: false,
  };

  it("parses valid cluster card", () => {
    expect(clusterCardSchema.parse(valid)).toEqual(valid);
  });
  it("defaults displayMode to full", () => {
    const { displayMode, ...noDisplay } = valid;
    const result = clusterCardSchema.parse(noDisplay);
    expect(result.displayMode).toBe("full");
  });
  it("rejects outletCount < 1", () => {
    expect(() => clusterCardSchema.parse({ ...valid, outletCount: 0 })).toThrow();
  });
  it("rejects non-integer outletCount", () => {
    expect(() => clusterCardSchema.parse({ ...valid, outletCount: 1.5 })).toThrow();
  });
  it("accepts null heroImageUrl", () => {
    const result = clusterCardSchema.parse({ ...valid, heroImageUrl: null });
    expect(result.heroImageUrl).toBeNull();
  });
  it("accepts full rankingExplainability object", () => {
    const result = clusterCardSchema.parse({
      ...valid,
      rankingExplainability: {
        finalScore: 2.5,
        recency: 1.0,
        saved: 0.0,
        clusterSize: 0.5,
        sourceWeight: 0.3,
        engagement: 0.2,
        topicAffinity: 0.1,
        folderAffinity: 0.05,
        diversityPenalty: -0.1,
        explorationBoost: 0.0,
      },
    });
    expect(result.rankingExplainability!.finalScore).toBe(2.5);
  });
});

describe("clusterDetailMemberSchema", () => {
  const valid = {
    itemId: UUID,
    title: "Article Title",
    sourceName: "CNN",
    url: "https://cnn.com/article",
    publishedAt: NOW,
  };

  it("parses valid member", () => {
    expect(clusterDetailMemberSchema.parse(valid)).toEqual(valid);
  });
});

describe("clusterDetailSchema", () => {
  const card = {
    id: UUID,
    headline: "Breaking news",
    heroImageUrl: null,
    primaryFeedId: UUID,
    primarySource: "Example",
    primarySourcePublishedAt: NOW,
    outletCount: 1,
    folderId: UUID,
    folderName: "World",
    topicId: null,
    topicName: null,
    summary: null,
    mutedBreakoutReason: null,
    rankingExplainability: null,
    displayMode: "full" as const,
    isRead: false,
    isSaved: false,
  };

  it("parses valid cluster detail", () => {
    const result = clusterDetailSchema.parse({
      cluster: card,
      storySoFar: "The story so far...",
      storyTextSource: "extracted_full_text",
      storyExtractedAt: NOW,
      members: [],
      primaryFeedDefaultReaderMode: null,
    });
    expect(result.members).toEqual([]);
    expect(result.storySoFar).toBe("The story so far...");
  });
  it("accepts null storySoFar", () => {
    const result = clusterDetailSchema.parse({
      cluster: card,
      storySoFar: null,
      storyTextSource: "unavailable",
      storyExtractedAt: null,
      members: [],
      primaryFeedDefaultReaderMode: null,
    });
    expect(result.storySoFar).toBeNull();
  });
});

describe("clusterAiSummaryResponseSchema", () => {
  it("parses valid summary response", () => {
    const result = clusterAiSummaryResponseSchema.parse({
      summary: "AI-generated summary",
      generatedAt: NOW,
    });
    expect(result.summary).toBe("AI-generated summary");
  });
  it("accepts null values", () => {
    const result = clusterAiSummaryResponseSchema.parse({
      summary: null,
      generatedAt: null,
    });
    expect(result.summary).toBeNull();
    expect(result.generatedAt).toBeNull();
  });
});

describe("filterRuleSchema", () => {
  const valid = {
    id: UUID,
    pattern: "bitcoin",
    target: "keyword" as const,
    type: "phrase" as const,
    mode: "mute" as const,
    breakoutEnabled: true,
    feedId: null,
    folderId: null,
    createdAt: NOW,
  };

  it("parses valid filter rule", () => {
    expect(filterRuleSchema.parse(valid)).toEqual(valid);
  });
  it("rejects empty pattern", () => {
    expect(() => filterRuleSchema.parse({ ...valid, pattern: "" })).toThrow();
  });
  it("accepts scoped filter rule", () => {
    const result = filterRuleSchema.parse({ ...valid, feedId: UUID, folderId: UUID2 });
    expect(result.feedId).toBe(UUID);
    expect(result.folderId).toBe(UUID2);
  });
});

describe("annotationSchema", () => {
  const valid = {
    id: UUID,
    clusterId: UUID2,
    highlightedText: "important text",
    note: "my note",
    color: "blue" as const,
    createdAt: NOW,
  };

  it("parses valid annotation", () => {
    expect(annotationSchema.parse(valid)).toEqual(valid);
  });
  it("accepts null note", () => {
    const result = annotationSchema.parse({ ...valid, note: null });
    expect(result.note).toBeNull();
  });
});

describe("createAnnotationRequestSchema", () => {
  it("parses with defaults", () => {
    const result = createAnnotationRequestSchema.parse({ highlightedText: "text" });
    expect(result.color).toBe("yellow");
    expect(result.note).toBeUndefined();
  });
  it("accepts explicit color", () => {
    const result = createAnnotationRequestSchema.parse({ highlightedText: "text", color: "pink" });
    expect(result.color).toBe("pink");
  });
  it("rejects empty highlightedText", () => {
    expect(() => createAnnotationRequestSchema.parse({ highlightedText: "" })).toThrow();
  });
  it("accepts optional note", () => {
    const result = createAnnotationRequestSchema.parse({ highlightedText: "text", note: "a note" });
    expect(result.note).toBe("a note");
  });
});

describe("digestEntrySchema", () => {
  const valid = {
    clusterId: UUID,
    headline: "Big story",
    section: "top_picks" as const,
    oneLiner: "A one-liner",
  };

  it("parses valid entry", () => {
    expect(digestEntrySchema.parse(valid)).toEqual(valid);
  });
  it("accepts null oneLiner", () => {
    expect(digestEntrySchema.parse({ ...valid, oneLiner: null }).oneLiner).toBeNull();
  });
  it("rejects invalid section", () => {
    expect(() => digestEntrySchema.parse({ ...valid, section: "other" })).toThrow();
  });
});

describe("digestSchema", () => {
  const valid = {
    id: UUID,
    createdAt: NOW,
    startTs: NOW,
    endTs: NOW,
    title: "Daily Digest",
    body: "Digest body text",
    entries: [],
  };

  it("parses valid digest", () => {
    expect(digestSchema.parse(valid)).toEqual(valid);
  });
  it("accepts entries array", () => {
    const entry = { clusterId: UUID, headline: "Story", section: "big_stories", oneLiner: null };
    const result = digestSchema.parse({ ...valid, entries: [entry] });
    expect(result.entries).toHaveLength(1);
  });
});

describe("settingsSchema", () => {
  const valid = {
    aiMode: "off" as const,
    aiProvider: "openai" as const,
    monthlyAiCapUsd: 10,
    aiFallbackToLocal: true,
    digestAwayHours: 24,
    digestBacklogThreshold: 50,
    feedPollMinutes: 15,
  };

  it("parses with defaults for optional fields", () => {
    const result = settingsSchema.parse(valid);
    expect(result.openaiApiKey).toBe("");
    expect(result.wallabagUrl).toBe("");
    expect(result.markReadOnScroll).toBe("off");
  });
  it("rejects feedPollMinutes < 5", () => {
    expect(() => settingsSchema.parse({ ...valid, feedPollMinutes: 4 })).toThrow();
  });
  it("rejects digestAwayHours < 1", () => {
    expect(() => settingsSchema.parse({ ...valid, digestAwayHours: 0 })).toThrow();
  });
  it("rejects negative monthlyAiCapUsd", () => {
    expect(() => settingsSchema.parse({ ...valid, monthlyAiCapUsd: -1 })).toThrow();
  });
  it("accepts explicit optional values", () => {
    const result = settingsSchema.parse({
      ...valid,
      openaiApiKey: "sk-abc",
      wallabagUrl: "https://wb.example.com",
    });
    expect(result.openaiApiKey).toBe("sk-abc");
    expect(result.wallabagUrl).toBe("https://wb.example.com");
  });
  it("accepts markReadOnScroll settings", () => {
    const result = settingsSchema.parse({
      ...valid,
      markReadOnScroll: "on_scroll",
      markReadOnScrollListDelayMs: 2000,
      markReadOnScrollListThreshold: 0.8,
    });
    expect(result.markReadOnScroll).toBe("on_scroll");
    expect(result.markReadOnScrollListDelayMs).toBe(2000);
  });
  it("accepts savedSearches", () => {
    const result = settingsSchema.parse({
      ...valid,
      savedSearches: [{
        id: UUID,
        name: "My Search",
        query: "typescript",
        folderId: null,
        feedId: null,
        createdAt: NOW,
      }],
    });
    expect(result.savedSearches).toHaveLength(1);
  });
});

describe("updateSettingsRequestSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateSettingsRequestSchema.parse({});
    // Partial schema still populates defaults from base settingsSchema
    expect(result.openaiApiKey).toBe("");
    expect(result.wallabagUrl).toBe("");
    expect(result.markReadOnScroll).toBe("off");
    // But explicitly set fields should not appear
    expect(result.aiMode).toBeUndefined();
    expect(result.feedPollMinutes).toBeUndefined();
  });
  it("accepts partial fields", () => {
    const result = updateSettingsRequestSchema.parse({ aiMode: "full" });
    expect(result.aiMode).toBe("full");
  });
});

// ============================================================
// Query / request schemas
// ============================================================

describe("listClustersQuerySchema", () => {
  it("applies defaults for limit, state, sort", () => {
    const result = listClustersQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.state).toBe("unread");
    expect(result.sort).toBe("personal");
  });
  it("coerces string limit to number", () => {
    const result = listClustersQuerySchema.parse({ limit: "50" });
    expect(result.limit).toBe(50);
  });
  it("rejects limit > 100", () => {
    expect(() => listClustersQuerySchema.parse({ limit: 101 })).toThrow();
  });
  it("rejects limit < 1", () => {
    expect(() => listClustersQuerySchema.parse({ limit: 0 })).toThrow();
  });
  it("accepts optional folder_id and topic_id", () => {
    const result = listClustersQuerySchema.parse({ folder_id: UUID, topic_id: UUID2 });
    expect(result.folder_id).toBe(UUID);
    expect(result.topic_id).toBe(UUID2);
  });
});

describe("addFeedRequestSchema", () => {
  it("parses valid url", () => {
    const result = addFeedRequestSchema.parse({ url: "https://example.com/rss" });
    expect(result.url).toBe("https://example.com/rss");
  });
  it("rejects missing url", () => {
    expect(() => addFeedRequestSchema.parse({})).toThrow();
  });
});

describe("updateFeedRequestSchema", () => {
  it("accepts empty object", () => {
    const result = updateFeedRequestSchema.parse({});
    expect(result).toEqual({});
  });
  it("accepts partial fields", () => {
    const result = updateFeedRequestSchema.parse({ weight: "prefer", muted: true });
    expect(result.weight).toBe("prefer");
    expect(result.muted).toBe(true);
  });
  it("rejects invalid weight", () => {
    expect(() => updateFeedRequestSchema.parse({ weight: "invalid" })).toThrow();
  });
  it("accepts defaultReaderMode", () => {
    const result = updateFeedRequestSchema.parse({ defaultReaderMode: "text" });
    expect(result.defaultReaderMode).toBe("text");
  });
  it("accepts null defaultReaderMode", () => {
    const result = updateFeedRequestSchema.parse({ defaultReaderMode: null });
    expect(result.defaultReaderMode).toBeNull();
  });
});

describe("createFilterRuleRequestSchema", () => {
  const valid = {
    pattern: "crypto",
    type: "phrase" as const,
    mode: "mute" as const,
  };

  it("applies breakoutEnabled default true", () => {
    const result = createFilterRuleRequestSchema.parse(valid);
    expect(result.breakoutEnabled).toBe(true);
  });
  it("applies target default keyword", () => {
    const result = createFilterRuleRequestSchema.parse(valid);
    expect(result.target).toBe("keyword");
  });
  it("accepts explicit breakoutEnabled false", () => {
    const result = createFilterRuleRequestSchema.parse({ ...valid, breakoutEnabled: false });
    expect(result.breakoutEnabled).toBe(false);
  });
  it("rejects empty pattern", () => {
    expect(() => createFilterRuleRequestSchema.parse({ ...valid, pattern: "" })).toThrow();
  });
  it("accepts scoped filter with feedId and folderId", () => {
    const result = createFilterRuleRequestSchema.parse({
      ...valid,
      feedId: UUID,
      folderId: UUID2,
    });
    expect(result.feedId).toBe(UUID);
    expect(result.folderId).toBe(UUID2);
  });
});

describe("updateFilterRuleRequestSchema", () => {
  it("accepts empty object (all partial)", () => {
    const result = updateFilterRuleRequestSchema.parse({});
    // Partial of createFilterRuleRequestSchema still populates defaults
    expect(result.target).toBe("keyword");
    expect(result.breakoutEnabled).toBe(true);
    expect(result.feedId).toBeNull();
    expect(result.folderId).toBeNull();
    // But explicitly optional fields should not appear
    expect(result.mode).toBeUndefined();
    expect(result.pattern).toBeUndefined();
  });
  it("accepts partial fields", () => {
    const result = updateFilterRuleRequestSchema.parse({ mode: "block" });
    expect(result.mode).toBe("block");
  });
});

describe("clusterFeedbackRequestSchema", () => {
  it("parses valid feedback type", () => {
    const result = clusterFeedbackRequestSchema.parse({ type: "not_interested" });
    expect(result.type).toBe("not_interested");
  });
  it("rejects invalid type", () => {
    expect(() => clusterFeedbackRequestSchema.parse({ type: "like" })).toThrow();
  });
});

describe("eventSchema", () => {
  const valid = {
    idempotencyKey: "abc123",
    ts: NOW,
    type: "click",
  };

  it("parses valid event with payload default", () => {
    const result = eventSchema.parse(valid);
    expect(result.payload).toEqual({});
  });
  it("accepts explicit payload", () => {
    const result = eventSchema.parse({ ...valid, payload: { clusterId: UUID } });
    expect(result.payload).toEqual({ clusterId: UUID });
  });
  it("rejects idempotencyKey shorter than 6", () => {
    expect(() => eventSchema.parse({ ...valid, idempotencyKey: "abc" })).toThrow();
  });
  it("rejects empty type", () => {
    expect(() => eventSchema.parse({ ...valid, type: "" })).toThrow();
  });
});

describe("eventsBatchRequestSchema", () => {
  it("accepts empty events array", () => {
    const result = eventsBatchRequestSchema.parse({ events: [] });
    expect(result.events).toEqual([]);
  });
  it("rejects more than 100 events", () => {
    const event = { idempotencyKey: "abcdef", ts: NOW, type: "x" };
    const events = Array.from({ length: 101 }, () => event);
    expect(() => eventsBatchRequestSchema.parse({ events })).toThrow();
  });
  it("accepts exactly 100 events", () => {
    const event = { idempotencyKey: "abcdef", ts: NOW, type: "x" };
    const events = Array.from({ length: 100 }, () => event);
    const result = eventsBatchRequestSchema.parse({ events });
    expect(result.events).toHaveLength(100);
  });
});

describe("loginRequestSchema", () => {
  it("parses valid login", () => {
    const result = loginRequestSchema.parse({ username: "admin", password: "secret" });
    expect(result.username).toBe("admin");
  });
  it("rejects empty username", () => {
    expect(() => loginRequestSchema.parse({ username: "", password: "secret" })).toThrow();
  });
  it("rejects empty password", () => {
    expect(() => loginRequestSchema.parse({ username: "admin", password: "" })).toThrow();
  });
  it("applies default accountSlug", () => {
    const result = loginRequestSchema.parse({ username: "admin", password: "secret" });
    expect(result.accountSlug).toBe("default");
  });
});

describe("signupRequestSchema", () => {
  const valid = {
    tenantName: "My Org",
    tenantSlug: "my-org",
    email: "user@example.com",
    username: "admin",
    password: "password123",
  };

  it("parses valid signup", () => {
    const result = signupRequestSchema.parse(valid);
    expect(result.email).toBe("user@example.com");
  });
  it("rejects short password", () => {
    expect(() => signupRequestSchema.parse({ ...valid, password: "short" })).toThrow();
  });
  it("rejects invalid email", () => {
    expect(() => signupRequestSchema.parse({ ...valid, email: "not-an-email" })).toThrow();
  });
  it("rejects invalid tenant slug characters", () => {
    expect(() => signupRequestSchema.parse({ ...valid, tenantSlug: "AB!@#" })).toThrow();
  });
});

describe("joinAccountRequestSchema", () => {
  const valid = {
    email: "user@example.com",
    username: "newuser",
    password: "password123",
  };

  it("parses valid join request", () => {
    const result = joinAccountRequestSchema.parse(valid);
    expect(result.username).toBe("newuser");
  });
  it("applies default accountSlug", () => {
    const result = joinAccountRequestSchema.parse(valid);
    expect(result.accountSlug).toBe("default");
  });
  it("rejects short password", () => {
    expect(() => joinAccountRequestSchema.parse({ ...valid, password: "short" })).toThrow();
  });
});

describe("changePasswordRequestSchema", () => {
  it("parses valid request", () => {
    const result = changePasswordRequestSchema.parse({
      currentPassword: "oldpass",
      newPassword: "newpass12",
    });
    expect(result.newPassword).toBe("newpass12");
  });
  it("rejects short new password", () => {
    expect(() =>
      changePasswordRequestSchema.parse({ currentPassword: "old", newPassword: "short" }),
    ).toThrow();
  });
});

describe("forgotPasswordRequestSchema", () => {
  it("parses valid request", () => {
    const result = forgotPasswordRequestSchema.parse({ email: "user@example.com" });
    expect(result.email).toBe("user@example.com");
  });
  it("applies default accountSlug", () => {
    const result = forgotPasswordRequestSchema.parse({ email: "user@example.com" });
    expect(result.accountSlug).toBe("default");
  });
});

describe("resetPasswordRequestSchema", () => {
  it("parses valid request", () => {
    const result = resetPasswordRequestSchema.parse({
      token: "abcdef123456",
      newPassword: "newpass12",
    });
    expect(result.token).toBe("abcdef123456");
  });
  it("rejects short token", () => {
    expect(() =>
      resetPasswordRequestSchema.parse({ token: "short", newPassword: "newpass12" }),
    ).toThrow();
  });
});

describe("resendVerificationRequestSchema", () => {
  it("parses valid request", () => {
    const result = resendVerificationRequestSchema.parse({ email: "user@example.com" });
    expect(result.email).toBe("user@example.com");
  });
});

describe("verifyEmailRequestSchema", () => {
  it("parses valid request", () => {
    const result = verifyEmailRequestSchema.parse({ token: "abcdef123456" });
    expect(result.token).toBe("abcdef123456");
  });
  it("rejects short token", () => {
    expect(() => verifyEmailRequestSchema.parse({ token: "short" })).toThrow();
  });
});

describe("requestAccountDeletionSchema", () => {
  it("parses valid request", () => {
    const result = requestAccountDeletionSchema.parse({
      password: "mypassword",
      confirmText: "DELETE",
    });
    expect(result.confirmText).toBe("DELETE");
  });
  it("rejects wrong confirmText", () => {
    expect(() =>
      requestAccountDeletionSchema.parse({ password: "mypassword", confirmText: "delete" }),
    ).toThrow();
  });
});

describe("accountDeletionStatusSchema", () => {
  it("parses valid status", () => {
    const result = accountDeletionStatusSchema.parse({
      id: UUID,
      status: "pending",
      requestedAt: NOW,
      cancelledAt: null,
      completedAt: null,
    });
    expect(result.status).toBe("pending");
  });
});

describe("accountDataExportStatusSchema", () => {
  it("parses valid status", () => {
    const result = accountDataExportStatusSchema.parse({
      id: UUID,
      status: "completed",
      requestedAt: NOW,
      startedAt: NOW,
      completedAt: NOW,
      failedAt: null,
      errorMessage: null,
      fileSizeBytes: 1024,
    });
    expect(result.fileSizeBytes).toBe(1024);
  });
});

describe("authTokensSchema", () => {
  it("parses valid tokens", () => {
    const result = authTokensSchema.parse({
      accessToken: "at",
      refreshToken: "rt",
      expiresInSeconds: 3600,
    });
    expect(result.expiresInSeconds).toBe(3600);
  });
  it("rejects non-positive expiresInSeconds", () => {
    expect(() =>
      authTokensSchema.parse({ accessToken: "at", refreshToken: "rt", expiresInSeconds: 0 }),
    ).toThrow();
    expect(() =>
      authTokensSchema.parse({ accessToken: "at", refreshToken: "rt", expiresInSeconds: -1 }),
    ).toThrow();
  });
});

describe("authRefreshRequestSchema", () => {
  it("parses valid refresh request", () => {
    expect(authRefreshRequestSchema.parse({ refreshToken: "rt" })).toEqual({ refreshToken: "rt" });
  });
  it("rejects empty refreshToken", () => {
    expect(() => authRefreshRequestSchema.parse({ refreshToken: "" })).toThrow();
  });
});

describe("authLogoutRequestSchema", () => {
  it("accepts with optional refreshToken", () => {
    expect(authLogoutRequestSchema.parse({})).toEqual({});
  });
  it("accepts with refreshToken", () => {
    expect(authLogoutRequestSchema.parse({ refreshToken: "rt" })).toEqual({ refreshToken: "rt" });
  });
});

// ============================================================
// Response schemas
// ============================================================

describe("listClustersResponseSchema", () => {
  it("parses valid response", () => {
    const result = listClustersResponseSchema.parse({ data: [], nextCursor: null });
    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
  it("accepts nextCursor as string", () => {
    const result = listClustersResponseSchema.parse({ data: [], nextCursor: "abc" });
    expect(result.nextCursor).toBe("abc");
  });
});

describe("okResponseSchema", () => {
  it("parses ok response", () => {
    expect(okResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });
  it("rejects ok: false", () => {
    expect(() => okResponseSchema.parse({ ok: false })).toThrow();
  });
});

describe("opmlImportResponseSchema", () => {
  it("parses valid response", () => {
    const result = opmlImportResponseSchema.parse({ ok: true, imported: 5, skipped: 2, total: 7 });
    expect(result.imported).toBe(5);
  });
  it("rejects negative counts", () => {
    expect(() =>
      opmlImportResponseSchema.parse({ ok: true, imported: -1, skipped: 0, total: 0 }),
    ).toThrow();
  });
  it("accepts optional plan-limit fields", () => {
    const result = opmlImportResponseSchema.parse({
      ok: true,
      imported: 5,
      skipped: 2,
      total: 7,
      limitedByPlan: true,
      rejectedCount: 3,
      remainingSlots: 45,
    });
    expect(result.limitedByPlan).toBe(true);
    expect(result.rejectedCount).toBe(3);
  });
});

describe("recordEventsResponseSchema", () => {
  it("parses valid response", () => {
    expect(recordEventsResponseSchema.parse({ accepted: 10, deduped: 2 })).toEqual({
      accepted: 10,
      deduped: 2,
    });
  });
  it("rejects negative values", () => {
    expect(() => recordEventsResponseSchema.parse({ accepted: -1, deduped: 0 })).toThrow();
  });
});

describe("opmlFeedSchema", () => {
  it("parses valid opml feed", () => {
    const result = opmlFeedSchema.parse({
      xmlUrl: "https://example.com/rss",
      title: "Feed",
      htmlUrl: "https://example.com",
      category: "Tech",
    });
    expect(result.title).toBe("Feed");
  });
  it("accepts null htmlUrl and category", () => {
    const result = opmlFeedSchema.parse({
      xmlUrl: "https://example.com/rss",
      title: "Feed",
      htmlUrl: null,
      category: null,
    });
    expect(result.htmlUrl).toBeNull();
    expect(result.category).toBeNull();
  });
});

// ============================================================
// Search schemas
// ============================================================

describe("searchQuerySchema", () => {
  it("applies default limit", () => {
    const result = searchQuerySchema.parse({ q: "test" });
    expect(result.limit).toBe(20);
  });
  it("coerces string limit", () => {
    const result = searchQuerySchema.parse({ q: "test", limit: "50" });
    expect(result.limit).toBe(50);
  });
  it("rejects empty q", () => {
    expect(() => searchQuerySchema.parse({ q: "" })).toThrow();
  });
  it("rejects limit > 100", () => {
    expect(() => searchQuerySchema.parse({ q: "test", limit: 101 })).toThrow();
  });
});

describe("searchResponseSchema", () => {
  it("parses valid response", () => {
    const result = searchResponseSchema.parse({ data: [], nextCursor: null });
    expect(result.data).toEqual([]);
  });
});

// ============================================================
// Push subscription schemas
// ============================================================

describe("pushSubscribeRequestSchema", () => {
  it("parses valid subscription", () => {
    const result = pushSubscribeRequestSchema.parse({
      endpoint: "https://push.example.com/send",
      keys: { p256dh: "key1", auth: "key2" },
    });
    expect(result.endpoint).toBe("https://push.example.com/send");
  });
  it("rejects empty p256dh", () => {
    expect(() =>
      pushSubscribeRequestSchema.parse({
        endpoint: "https://push.example.com",
        keys: { p256dh: "", auth: "k" },
      }),
    ).toThrow();
  });
  it("rejects empty auth", () => {
    expect(() =>
      pushSubscribeRequestSchema.parse({
        endpoint: "https://push.example.com",
        keys: { p256dh: "k", auth: "" },
      }),
    ).toThrow();
  });
});

describe("pushUnsubscribeRequestSchema", () => {
  it("parses valid unsubscribe", () => {
    const result = pushUnsubscribeRequestSchema.parse({
      endpoint: "https://push.example.com/send",
    });
    expect(result.endpoint).toBe("https://push.example.com/send");
  });
});

// ============================================================
// Dwell & stats schemas
// ============================================================

describe("recordDwellRequestSchema", () => {
  it("parses valid dwell", () => {
    expect(recordDwellRequestSchema.parse({ seconds: 60 })).toEqual({ seconds: 60 });
  });
  it("rejects seconds < 1", () => {
    expect(() => recordDwellRequestSchema.parse({ seconds: 0 })).toThrow();
  });
  it("rejects seconds > 86400", () => {
    expect(() => recordDwellRequestSchema.parse({ seconds: 86401 })).toThrow();
  });
  it("rejects non-integer seconds", () => {
    expect(() => recordDwellRequestSchema.parse({ seconds: 1.5 })).toThrow();
  });
});

describe("readingStatsSchema", () => {
  const valid = {
    articlesReadToday: 5,
    articlesReadWeek: 30,
    articlesReadMonth: 100,
    autoReadOnScrollCount: 10,
    autoReadOnOpenCount: 5,
    autoReadTotalCount: 15,
    feedParseSuccessCount: 50,
    feedParseFailureCount: 3,
    feedParseByFormat: { rss: 30, atom: 10, rdf: 5, json: 5 },
    avgDwellSeconds: 45.2,
    folderBreakdown: [{ folderName: "Tech", count: 20 }],
    topSources: [{ feedTitle: "Hacker News", count: 15 }],
    readingStreak: 7,
    peakHours: [{ hour: 9, count: 10 }],
    dailyReads: [{ date: "2025-01-15", count: 5 }],
  };

  it("parses valid stats", () => {
    expect(readingStatsSchema.parse(valid)).toEqual(valid);
  });
  it("rejects peakHours hour > 23", () => {
    expect(() =>
      readingStatsSchema.parse({ ...valid, peakHours: [{ hour: 24, count: 1 }] }),
    ).toThrow();
  });
  it("rejects peakHours hour < 0", () => {
    expect(() =>
      readingStatsSchema.parse({ ...valid, peakHours: [{ hour: -1, count: 1 }] }),
    ).toThrow();
  });
  it("accepts empty arrays", () => {
    const result = readingStatsSchema.parse({
      ...valid,
      folderBreakdown: [],
      topSources: [],
      peakHours: [],
      dailyReads: [],
    });
    expect(result.folderBreakdown).toEqual([]);
  });
});

describe("statsQuerySchema", () => {
  it("applies default period", () => {
    const result = statsQuerySchema.parse({});
    expect(result.period).toBe("7d");
  });
  it("accepts explicit period", () => {
    const result = statsQuerySchema.parse({ period: "30d" });
    expect(result.period).toBe("30d");
  });
});

// ============================================================
// Topic schemas
// ============================================================

describe("resolveTopicRequestSchema", () => {
  it("parses approve action", () => {
    const result = resolveTopicRequestSchema.parse({ topicId: UUID, action: "approve" });
    expect(result.action).toBe("approve");
  });
  it("parses reject action", () => {
    const result = resolveTopicRequestSchema.parse({ topicId: UUID, action: "reject" });
    expect(result.action).toBe("reject");
  });
  it("rejects invalid action", () => {
    expect(() => resolveTopicRequestSchema.parse({ topicId: UUID, action: "delete" })).toThrow();
  });
});

describe("approveAllTopicsRequestSchema", () => {
  it("parses valid request", () => {
    const result = approveAllTopicsRequestSchema.parse({ feedId: UUID });
    expect(result.feedId).toBe(UUID);
  });
});

describe("renameTopicRequestSchema", () => {
  it("parses valid name", () => {
    const result = renameTopicRequestSchema.parse({ name: "New Topic" });
    expect(result.name).toBe("New Topic");
  });
  it("rejects empty name", () => {
    expect(() => renameTopicRequestSchema.parse({ name: "" })).toThrow();
  });
  it("rejects name > 50 chars", () => {
    expect(() => renameTopicRequestSchema.parse({ name: "x".repeat(51) })).toThrow();
  });
  it("accepts exactly 50 chars", () => {
    const result = renameTopicRequestSchema.parse({ name: "x".repeat(50) });
    expect(result.name).toHaveLength(50);
  });
});

// ============================================================
// Entitlements & Billing schemas
// ============================================================

describe("accountEntitlementsSchema", () => {
  it("parses valid entitlements", () => {
    const result = accountEntitlementsSchema.parse({
      planId: "pro",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: NOW,
      feedLimit: null,
      itemsPerDayLimit: null,
      searchMode: "full_text",
      minPollMinutes: 10,
      usage: { date: "2025-01-15", itemsIngested: 100, feeds: 25 },
    });
    expect(result.planId).toBe("pro");
  });
  it("accepts free plan with limits", () => {
    const result = accountEntitlementsSchema.parse({
      planId: "free",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      feedLimit: 50,
      itemsPerDayLimit: 500,
      searchMode: "title_source",
      minPollMinutes: 60,
      usage: { date: "2025-01-15", itemsIngested: 10, feeds: 5 },
    });
    expect(result.feedLimit).toBe(50);
    expect(result.searchMode).toBe("title_source");
  });
});

describe("billingCheckoutRequestSchema", () => {
  it("parses valid checkout", () => {
    const result = billingCheckoutRequestSchema.parse({ planId: "pro" });
    expect(result.interval).toBe("monthly");
  });
  it("accepts annual interval", () => {
    const result = billingCheckoutRequestSchema.parse({ planId: "pro_ai", interval: "annual" });
    expect(result.interval).toBe("annual");
  });
  it("rejects free plan checkout", () => {
    expect(() => billingCheckoutRequestSchema.parse({ planId: "free" })).toThrow();
  });
});

describe("billingSubscriptionActionRequestSchema", () => {
  it("accepts cancel action", () => {
    const result = billingSubscriptionActionRequestSchema.parse({ action: "cancel" });
    expect(result.action).toBe("cancel");
  });
  it("accepts resume action", () => {
    const result = billingSubscriptionActionRequestSchema.parse({ action: "resume" });
    expect(result.action).toBe("resume");
  });
  it("rejects invalid action", () => {
    expect(() => billingSubscriptionActionRequestSchema.parse({ action: "pause" })).toThrow();
  });
});

describe("billingOverviewSchema", () => {
  it("parses valid overview", () => {
    const result = billingOverviewSchema.parse({
      planId: "pro",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: NOW,
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      customerPortalUrl: "https://portal.example.com",
      checkoutEnabled: true,
      checkoutAvailability: {
        pro: { monthly: true, annual: true },
        pro_ai: { monthly: true, annual: true },
      },
    });
    expect(result.checkoutEnabled).toBe(true);
  });
});

// ============================================================
// Privacy consent schemas
// ============================================================

describe("privacyConsentSchema", () => {
  it("parses valid consent", () => {
    const result = privacyConsentSchema.parse({
      necessary: true,
      analytics: false,
      advertising: false,
      functional: true,
      consentCapturedAt: NOW,
      regionCode: "EU",
      requiresExplicitConsent: true,
    });
    expect(result.necessary).toBe(true);
    expect(result.requiresExplicitConsent).toBe(true);
  });
});

describe("updatePrivacyConsentRequestSchema", () => {
  it("parses valid update", () => {
    const result = updatePrivacyConsentRequestSchema.parse({
      analytics: true,
      advertising: false,
      functional: true,
    });
    expect(result.analytics).toBe(true);
  });
});

// ============================================================
// Member schemas
// ============================================================

describe("memberSchema", () => {
  it("parses valid member", () => {
    const result = memberSchema.parse({
      id: UUID,
      username: "admin",
      email: "admin@example.com",
      role: "owner",
      status: "active",
      joinedAt: NOW,
      lastLoginAt: NOW,
    });
    expect(result.role).toBe("owner");
  });
  it("accepts null email and lastLoginAt", () => {
    const result = memberSchema.parse({
      id: UUID,
      username: "user1",
      email: null,
      role: "member",
      status: "active",
      joinedAt: NOW,
      lastLoginAt: null,
    });
    expect(result.email).toBeNull();
  });
});

describe("createMemberInviteRequestSchema", () => {
  it("parses with defaults", () => {
    const result = createMemberInviteRequestSchema.parse({});
    expect(result.expiresInDays).toBe(7);
  });
  it("accepts explicit email", () => {
    const result = createMemberInviteRequestSchema.parse({ email: "user@example.com" });
    expect(result.email).toBe("user@example.com");
  });
});

describe("memberInviteSchema", () => {
  it("parses valid invite", () => {
    const result = memberInviteSchema.parse({
      id: UUID,
      email: "user@example.com",
      status: "pending",
      inviteCode: "abc123",
      inviteUrl: "https://app.example.com/join?code=abc123",
      createdAt: NOW,
      expiresAt: NOW,
      consumedAt: null,
      revokedAt: null,
    });
    expect(result.status).toBe("pending");
  });
});

// ============================================================
// AI usage schemas
// ============================================================

describe("aiUsageRecordSchema", () => {
  it("parses valid record", () => {
    const result = aiUsageRecordSchema.parse({
      id: UUID,
      accountId: UUID2,
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 500,
      outputTokens: 200,
      estimatedCostUsd: 0.015,
      feature: "summary",
      durationMs: 1500,
      createdAt: NOW,
    });
    expect(result.feature).toBe("summary");
  });
  it("rejects negative tokens", () => {
    expect(() =>
      aiUsageRecordSchema.parse({
        id: UUID,
        accountId: UUID2,
        provider: "openai",
        model: "gpt-4o",
        inputTokens: -1,
        outputTokens: 0,
        estimatedCostUsd: 0,
        feature: "summary",
        durationMs: 0,
        createdAt: NOW,
      }),
    ).toThrow();
  });
});

describe("aiUsageSummarySchema", () => {
  it("parses valid summary", () => {
    const result = aiUsageSummarySchema.parse({
      month: "2025-01",
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCalls: 50,
      totalCostUsd: 0.75,
      byProvider: {
        openai: { inputTokens: 10000, outputTokens: 5000, costUsd: 0.75, calls: 50 },
      },
      byFeature: {
        summary: { inputTokens: 5000, outputTokens: 2500, costUsd: 0.35, calls: 25 },
      },
      budgetTokens: null,
      budgetUsedPercent: null,
      budgetCapUsd: 10,
      budgetCostPercent: 7.5,
    });
    expect(result.totalCalls).toBe(50);
  });
});

describe("aiBudgetCheckSchema", () => {
  it("parses valid budget check", () => {
    const result = aiBudgetCheckSchema.parse({
      allowed: true,
      remaining: 5000,
      used: 5000,
      limit: 10000,
      costUsd: 0.5,
      costLimitUsd: 10,
    });
    expect(result.allowed).toBe(true);
  });
  it("accepts null remaining and limits", () => {
    const result = aiBudgetCheckSchema.parse({
      allowed: true,
      remaining: null,
      used: 0,
      limit: null,
      costUsd: 0,
      costLimitUsd: null,
    });
    expect(result.remaining).toBeNull();
  });
});

// ============================================================
// Directory & sponsored schemas
// ============================================================

describe("directoryEntrySchema", () => {
  it("parses valid entry", () => {
    const result = directoryEntrySchema.parse({
      id: UUID,
      feedUrl: "https://example.com/feed.xml",
      title: "Example Feed",
      description: "A great feed",
      category: "tech",
      siteUrl: "https://example.com",
      language: "en",
      popularityRank: 5,
      createdAt: NOW,
    });
    expect(result.category).toBe("tech");
  });
  it("accepts null optional fields", () => {
    const result = directoryEntrySchema.parse({
      id: UUID,
      feedUrl: "https://example.com/feed.xml",
      title: "Example Feed",
      description: null,
      category: "tech",
      siteUrl: null,
      language: null,
      popularityRank: null,
      createdAt: NOW,
    });
    expect(result.description).toBeNull();
  });
});

describe("directoryListResponseSchema", () => {
  it("parses valid response", () => {
    const result = directoryListResponseSchema.parse({ items: [], total: 0 });
    expect(result.items).toEqual([]);
  });
});

describe("directoryQuerySchema", () => {
  it("applies defaults", () => {
    const result = directoryQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });
  it("accepts category filter", () => {
    const result = directoryQuerySchema.parse({ category: "tech", limit: 10 });
    expect(result.category).toBe("tech");
  });
});

describe("sponsoredCardSchema", () => {
  it("parses valid card", () => {
    const result = sponsoredCardSchema.parse({
      id: UUID,
      name: "Promo",
      headline: "Check this out",
      imageUrl: null,
      targetUrl: "https://sponsor.example.com",
      ctaText: "Learn more",
      position: 3,
    });
    expect(result.position).toBe(3);
  });
});

// ============================================================
// apiRoutes constant
// ============================================================

describe("apiRoutes", () => {
  it("has expected route keys", () => {
    expect(apiRoutes.clusters).toBe("/v1/clusters");
    expect(apiRoutes.folders).toBe("/v1/folders");
    expect(apiRoutes.feeds).toBe("/v1/feeds");
    expect(apiRoutes.filters).toBe("/v1/filters");
    expect(apiRoutes.digests).toBe("/v1/digests");
    expect(apiRoutes.events).toBe("/v1/events");
    expect(apiRoutes.settings).toBe("/v1/settings");
    expect(apiRoutes.authLogin).toBe("/v1/auth/login");
    expect(apiRoutes.authSignup).toBe("/v1/auth/signup");
    expect(apiRoutes.authJoin).toBe("/v1/auth/join");
    expect(apiRoutes.authLogout).toBe("/v1/auth/logout");
    expect(apiRoutes.authRefresh).toBe("/v1/auth/refresh");
    expect(apiRoutes.opmlImport).toBe("/v1/opml/import");
    expect(apiRoutes.opmlExport).toBe("/v1/opml/export");
    expect(apiRoutes.search).toBe("/v1/search");
    expect(apiRoutes.pushVapidKey).toBe("/v1/push/vapid-key");
    expect(apiRoutes.pushSubscribe).toBe("/v1/push/subscribe");
    expect(apiRoutes.stats).toBe("/v1/stats");
    expect(apiRoutes.topics).toBe("/v1/topics");
    expect(apiRoutes.feedTopicResolve).toBe("/v1/feeds/:id/topics/resolve");
    expect(apiRoutes.feedTopicApproveAll).toBe("/v1/feeds/:id/topics/approve-all");
    expect(apiRoutes.pendingClassifications).toBe("/v1/feeds/pending");
  });

  it("has billing routes", () => {
    expect(apiRoutes.billingOverview).toBe("/v1/billing");
    expect(apiRoutes.billingCheckout).toBe("/v1/billing/checkout");
    expect(apiRoutes.billingPortal).toBe("/v1/billing/portal");
    expect(apiRoutes.billingSubscriptionAction).toBe("/v1/billing/subscription-action");
    expect(apiRoutes.billingWebhook).toBe("/v1/billing/webhooks/lemon-squeezy");
  });

  it("has account management routes", () => {
    expect(apiRoutes.accountChangePassword).toBe("/v1/account/password");
    expect(apiRoutes.accountDeletionStatus).toBe("/v1/account/deletion");
    expect(apiRoutes.accountDeletionRequest).toBe("/v1/account/deletion/request");
    expect(apiRoutes.accountInvites).toBe("/v1/account/invites");
    expect(apiRoutes.accountEntitlements).toBe("/v1/account/entitlements");
    expect(apiRoutes.accountMembers).toBe("/v1/account/members");
  });

  it("has directory and sponsored routes", () => {
    expect(apiRoutes.directory).toBe("/v1/directory");
    expect(apiRoutes.sponsoredPlacements).toBe("/v1/sponsored-placements");
  });
});
