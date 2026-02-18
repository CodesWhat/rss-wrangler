import { randomUUID } from "node:crypto";
import type { AiProviderAdapter } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import type { DueFeed } from "../services/feed-service";
import { FeedService } from "../services/feed-service";
import { sendNewStoriesNotification } from "../services/push-service";
import {
  getPipelineEntitlements,
  incrementDailyIngestionUsage,
  isPollAllowed,
  releaseDailyIngestionBudget,
  reserveDailyIngestionBudget,
} from "./entitlements";
import { classifyFeedTopics } from "./stages/classify-feed-topics";
import { assignClusters } from "./stages/cluster-assignment";
import { enrichWithAi } from "./stages/enrich-with-ai";
import { extractAndPersistFullText } from "./stages/extract-fulltext";
import { postClusterFilter, preFilterSoftGate } from "./stages/filter";
import { maybeGenerateDigest } from "./stages/generate-digest";
import { parseAndUpsert } from "./stages/parse-and-upsert";
import { pollFeed } from "./stages/poll-feed";
import { scoreRelevance } from "./stages/score-relevance";

export interface PushConfig {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidContact?: string;
}

export interface PipelineContext {
  feed: DueFeed;
  pool: Pool;
  aiProvider?: AiProviderAdapter | null;
  pushConfig?: PushConfig;
}

export async function runFeedPipeline({
  feed,
  pool,
  aiProvider,
  pushConfig,
}: PipelineContext): Promise<void> {
  const feedService = new FeedService(pool);

  try {
    await runFeedPipelineInner({ feed, pool, feedService, aiProvider, pushConfig });
    await feedService.recordFeedSuccess(feed.accountId, feed.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await feedService.recordFeedFailure(feed.accountId, feed.id, message);
    throw error;
  }
}

async function runFeedPipelineInner({
  feed,
  pool,
  feedService,
  aiProvider,
  pushConfig,
}: PipelineContext & { feedService: FeedService }): Promise<void> {
  const entitlements = await getPipelineEntitlements(pool, feed.accountId);

  if (!isPollAllowed(feed.lastPolledAt, entitlements.minPollMinutes)) {
    console.info("[pipeline] feed not due for plan poll interval", {
      feedId: feed.id,
      planId: entitlements.planId,
      minPollMinutes: entitlements.minPollMinutes,
    });
    return;
  }

  // Stage 1: Poll feed with conditional GET
  console.info("[pipeline] polling feed", { feedId: feed.id, url: feed.url });
  let pollResult: Awaited<ReturnType<typeof pollFeed>>;
  try {
    pollResult = await pollFeed(feed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordWorkerEvent(pool, feed.accountId, "feed_parse_failure", {
      feedId: feed.id,
      feedUrl: feed.url,
      failureStage: classifyPollFailureStage(message),
      error: message,
    });
    throw error;
  }

  if (!pollResult.notModified && pollResult.format) {
    await recordWorkerEvent(pool, feed.accountId, "feed_parse_success", {
      feedId: feed.id,
      feedUrl: feed.url,
      format: pollResult.format,
      parsedItems: pollResult.items.length,
    });
    console.info("[pipeline] parsed feed", {
      feedId: feed.id,
      format: pollResult.format,
      parsedItems: pollResult.items.length,
    });
  }

  // Update etag/last-modified regardless
  await feedService.updateLastPolled(
    feed.accountId,
    feed.id,
    pollResult.etag,
    pollResult.lastModified,
  );

  if (pollResult.notModified) {
    console.info("[pipeline] feed not modified, skipping", { feedId: feed.id });
    return;
  }

  let fetchedItems = pollResult.items;

  if (feed.backfillSince) {
    const cutoff = feed.backfillSince.getTime();
    if (!Number.isNaN(cutoff)) {
      fetchedItems = pollResult.items.filter((item) => item.publishedAt.getTime() >= cutoff);
      console.info("[pipeline] applied lookback filter", {
        feedId: feed.id,
        originalCount: pollResult.items.length,
        filteredCount: fetchedItems.length,
        backfillSince: feed.backfillSince.toISOString(),
      });
    }
  }

  if (fetchedItems.length === 0) {
    console.info("[pipeline] no items in feed", { feedId: feed.id });
    return;
  }

  let itemsForUpsert = fetchedItems;
  let reservedSlots = 0;
  let hasReservedSlots = false;

  if (entitlements.itemsPerDayLimit !== null) {
    reservedSlots = await reserveDailyIngestionBudget(
      pool,
      feed.accountId,
      entitlements.itemsPerDayLimit,
      fetchedItems.length,
    );
    hasReservedSlots = true;

    if (reservedSlots <= 0) {
      console.info("[pipeline] daily ingestion limit reached, skipping new items", {
        feedId: feed.id,
        accountId: feed.accountId,
        planId: entitlements.planId,
        dailyLimit: entitlements.itemsPerDayLimit,
      });
      return;
    }

    if (reservedSlots < fetchedItems.length) {
      itemsForUpsert = fetchedItems.slice(0, reservedSlots);
      console.info("[pipeline] truncating fetched items to plan budget", {
        feedId: feed.id,
        requested: fetchedItems.length,
        allowed: reservedSlots,
        planId: entitlements.planId,
      });
    }
  }

  console.info("[pipeline] fetched items", { feedId: feed.id, count: itemsForUpsert.length });

  // Stage 2 + 3: Parse, canonicalize URLs, and upsert items
  let upserted: Awaited<ReturnType<typeof parseAndUpsert>>["succeeded"] = [];
  let failed: Awaited<ReturnType<typeof parseAndUpsert>>["failed"] = [];
  try {
    const parseResult = await parseAndUpsert(pool, feed.accountId, feed.id, itemsForUpsert);
    upserted = parseResult.succeeded;
    failed = parseResult.failed;
  } catch (err) {
    if (hasReservedSlots && reservedSlots > 0) {
      await releaseDailyIngestionBudget(pool, feed.accountId, reservedSlots);
    }
    throw err;
  }

  if (failed.length > 0) {
    console.warn("[pipeline] some items failed to upsert", {
      feedId: feed.id,
      failedCount: failed.length,
    });
  }

  const newItems = upserted.filter((i) => i.isNew);

  if (hasReservedSlots) {
    const unusedSlots = Math.max(reservedSlots - newItems.length, 0);
    if (unusedSlots > 0) {
      await releaseDailyIngestionBudget(pool, feed.accountId, unusedSlots);
    }
  } else if (newItems.length > 0) {
    await incrementDailyIngestionUsage(pool, feed.accountId, newItems.length);
  }

  console.info("[pipeline] upserted items", {
    feedId: feed.id,
    total: upserted.length,
    new: newItems.length,
  });

  if (newItems.length === 0) {
    console.info("[pipeline] no new items, skipping downstream stages", { feedId: feed.id });
    return;
  }

  // Stage: Extract full text for reader-mode "text" view
  try {
    const extraction = await extractAndPersistFullText(pool, feed.accountId, newItems);
    console.info("[pipeline] full-text extraction", {
      feedId: feed.id,
      attempted: extraction.attempted,
      extracted: extraction.extracted,
      persisted: extraction.persisted,
    });
  } catch (err) {
    // Reader text-mode already has summary fallback in the UI; extraction is additive.
    console.error("[pipeline] full-text extraction failed (non-fatal)", {
      feedId: feed.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage: Classify feed topics (LLM) -- runs once for newly subscribed feeds
  if (feed.classificationStatus === "pending_classification") {
    try {
      await classifyFeedTopics(pool, feed.accountId, feed.id, aiProvider ?? null);
    } catch (err) {
      console.error("[pipeline] classify-feed-topics failed (non-fatal)", {
        feedId: feed.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Stage 4: Pre-filter soft gate (mute/block/keep check)
  await preFilterSoftGate(
    pool,
    feed.accountId,
    newItems.map((i) => ({
      itemId: i.id,
      title: i.title,
      summary: i.summary,
      author: i.author,
      url: i.url,
      feedId: i.feedId,
      folderId: feed.folderId,
    })),
  );

  // Muted items still participate in clustering (per spec).
  // Only hard-blocked items (mode=block) are truly dropped, but even those
  // have already been recorded in the DB. We pass all newItems to clustering.

  // Stage 6 + 7: Compute features and assign clusters
  // simhash + Jaccard is computed inline during cluster assignment
  await assignClusters(pool, feed.accountId, newItems);

  // Stage: Enrich items with og:image and AI summaries
  try {
    await enrichWithAi(pool, feed.accountId, newItems, aiProvider ?? null);
  } catch (err) {
    // Enrichment is non-critical; log and continue the pipeline
    console.error("[pipeline] enrich-with-ai failed (non-fatal)", {
      feedId: feed.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage: Score relevance (opt-in via settings)
  try {
    await scoreRelevance(pool, feed.accountId, newItems, aiProvider ?? null);
  } catch (err) {
    console.error("[pipeline] score-relevance failed (non-fatal)", {
      feedId: feed.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage 8: Post-cluster filter (mute-with-breakout)
  // Get the cluster IDs for newly clustered items
  const clusterIds = await getClusterIdsForItems(
    pool,
    feed.accountId,
    newItems.map((i) => i.id),
  );
  await postClusterFilter(pool, feed.accountId, clusterIds);

  // Stage 10: Digest generation (if triggers met)
  await maybeGenerateDigest(pool, feed.accountId, aiProvider);

  // Send push notification if new clusters were created
  if (clusterIds.length > 0 && pushConfig?.vapidPublicKey && pushConfig?.vapidPrivateKey) {
    try {
      const topHeadline = newItems[0]?.title ?? "New stories available";
      const result = await sendNewStoriesNotification(
        pool,
        feed.accountId,
        {
          vapidPublicKey: pushConfig.vapidPublicKey,
          vapidPrivateKey: pushConfig.vapidPrivateKey,
          vapidContact: pushConfig.vapidContact ?? "mailto:admin@localhost",
        },
        clusterIds.length,
        topHeadline,
      );
      if (result.sent > 0) {
        console.info("[pipeline] push notifications sent", result);
      }
    } catch (err) {
      console.error("[pipeline] push notification failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info("[pipeline] completed", {
    feedId: feed.id,
    newItems: newItems.length,
    clusters: clusterIds.length,
  });
}

async function getClusterIdsForItems(
  pool: Pool,
  accountId: string,
  itemIds: string[],
): Promise<string[]> {
  if (itemIds.length === 0) return [];

  const result = await pool.query<{ cluster_id: string }>(
    `SELECT DISTINCT cluster_id
     FROM cluster_member
     WHERE item_id = ANY($1)
       AND tenant_id = $2`,
    [itemIds, accountId],
  );

  return result.rows.map((r) => r.cluster_id);
}

async function recordWorkerEvent(
  pool: Pool,
  accountId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const idempotencyKey = `worker:${type}:${Date.now()}:${randomUUID()}`;
  try {
    await pool.query(
      `INSERT INTO event (tenant_id, idempotency_key, ts, type, payload_json)
       VALUES ($1, $2, NOW(), $3, $4::jsonb)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      [accountId, idempotencyKey, type, JSON.stringify(payload)],
    );
  } catch (error) {
    console.warn("[pipeline] failed to record worker event", {
      accountId,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function classifyPollFailureStage(message: string): string {
  if (message.includes("Invalid feed URL") || message.includes("Blocked ")) {
    return "url_validation";
  }
  if (message.includes("failed to parse feed")) {
    return "parse";
  }
  if (message.includes("HTTP ")) {
    return "http";
  }
  return "network_or_unknown";
}
