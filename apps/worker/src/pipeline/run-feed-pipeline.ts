import type { Pool } from "pg";
import type { DueFeed } from "../services/feed-service";
import { FeedService } from "../services/feed-service";
import { pollFeed } from "./stages/poll-feed";
import { parseAndUpsert } from "./stages/parse-and-upsert";
import { assignClusters } from "./stages/cluster-assignment";
import { enrichWithAi } from "./stages/enrich-with-ai";
import { classifyFeedTopics } from "./stages/classify-feed-topics";
import { preFilterSoftGate, postClusterFilter } from "./stages/filter";
import { maybeGenerateDigest } from "./stages/generate-digest";
import { sendNewStoriesNotification } from "../services/push-service";
import {
  getPipelineEntitlements,
  incrementDailyIngestionUsage,
  isPollAllowed,
  releaseDailyIngestionBudget,
  reserveDailyIngestionBudget
} from "./entitlements";

export interface PushConfig {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidContact?: string;
}

export interface PipelineContext {
  feed: DueFeed;
  pool: Pool;
  openaiApiKey?: string;
  pushConfig?: PushConfig;
}

export async function runFeedPipeline({ feed, pool, openaiApiKey, pushConfig }: PipelineContext): Promise<void> {
  const feedService = new FeedService(pool);
  const entitlements = await getPipelineEntitlements(pool, feed.tenantId);

  if (!isPollAllowed(feed.lastPolledAt, entitlements.minPollMinutes)) {
    console.info("[pipeline] feed not due for plan poll interval", {
      feedId: feed.id,
      planId: entitlements.planId,
      minPollMinutes: entitlements.minPollMinutes
    });
    return;
  }

  // Stage 1: Poll feed with conditional GET
  console.info("[pipeline] polling feed", { feedId: feed.id, url: feed.url });
  const pollResult = await pollFeed(feed);

  // Update etag/last-modified regardless
  await feedService.updateLastPolled(feed.tenantId, feed.id, pollResult.etag, pollResult.lastModified);

  if (pollResult.notModified) {
    console.info("[pipeline] feed not modified, skipping", { feedId: feed.id });
    return;
  }

  if (pollResult.items.length === 0) {
    console.info("[pipeline] no items in feed", { feedId: feed.id });
    return;
  }

  let itemsForUpsert = pollResult.items;
  let reservedSlots = 0;
  let hasReservedSlots = false;

  if (entitlements.itemsPerDayLimit !== null) {
    reservedSlots = await reserveDailyIngestionBudget(
      pool,
      feed.tenantId,
      entitlements.itemsPerDayLimit,
      pollResult.items.length
    );
    hasReservedSlots = true;

    if (reservedSlots <= 0) {
      console.info("[pipeline] daily ingestion limit reached, skipping new items", {
        feedId: feed.id,
        tenantId: feed.tenantId,
        planId: entitlements.planId,
        dailyLimit: entitlements.itemsPerDayLimit
      });
      return;
    }

    if (reservedSlots < pollResult.items.length) {
      itemsForUpsert = pollResult.items.slice(0, reservedSlots);
      console.info("[pipeline] truncating fetched items to plan budget", {
        feedId: feed.id,
        requested: pollResult.items.length,
        allowed: reservedSlots,
        planId: entitlements.planId
      });
    }
  }

  console.info("[pipeline] fetched items", { feedId: feed.id, count: itemsForUpsert.length });

  // Stage 2 + 3: Parse, canonicalize URLs, and upsert items
  let upserted: Awaited<ReturnType<typeof parseAndUpsert>>["succeeded"] = [];
  let failed: Awaited<ReturnType<typeof parseAndUpsert>>["failed"] = [];
  try {
    const parseResult = await parseAndUpsert(pool, feed.tenantId, feed.id, itemsForUpsert);
    upserted = parseResult.succeeded;
    failed = parseResult.failed;
  } catch (err) {
    if (hasReservedSlots && reservedSlots > 0) {
      await releaseDailyIngestionBudget(pool, feed.tenantId, reservedSlots);
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
      await releaseDailyIngestionBudget(pool, feed.tenantId, unusedSlots);
    }
  } else if (newItems.length > 0) {
    await incrementDailyIngestionUsage(pool, feed.tenantId, newItems.length);
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

  // Stage: Classify feed topics (LLM) -- runs once for newly subscribed feeds
  if (feed.classificationStatus === "pending_classification") {
    try {
      await classifyFeedTopics(pool, feed.tenantId, feed.id, openaiApiKey);
    } catch (err) {
      console.error("[pipeline] classify-feed-topics failed (non-fatal)", {
        feedId: feed.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Stage 4: Pre-filter soft gate (mute/block check on title+summary)
  await preFilterSoftGate(
    pool,
    feed.tenantId,
    newItems.map((i) => ({
      itemId: i.id,
      title: i.title,
      summary: i.summary,
    }))
  );

  // Muted items still participate in clustering (per spec).
  // Only hard-blocked items (mode=block) are truly dropped, but even those
  // have already been recorded in the DB. We pass all newItems to clustering.

  // Stage 6 + 7: Compute features and assign clusters
  // simhash + Jaccard is computed inline during cluster assignment
  await assignClusters(pool, feed.tenantId, newItems);

  // Stage: Enrich items with og:image and AI summaries
  try {
    await enrichWithAi(pool, feed.tenantId, newItems, openaiApiKey);
  } catch (err) {
    // Enrichment is non-critical; log and continue the pipeline
    console.error("[pipeline] enrich-with-ai failed (non-fatal)", {
      feedId: feed.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stage 8: Post-cluster filter (mute-with-breakout)
  // Get the cluster IDs for newly clustered items
  const clusterIds = await getClusterIdsForItems(
    pool,
    feed.tenantId,
    newItems.map((i) => i.id)
  );
  await postClusterFilter(pool, feed.tenantId, clusterIds);

  // Stage 10: Digest generation (if triggers met)
  await maybeGenerateDigest(pool, feed.tenantId);

  // Send push notification if new clusters were created
  if (clusterIds.length > 0 && pushConfig?.vapidPublicKey && pushConfig?.vapidPrivateKey) {
    try {
      const topHeadline = newItems[0]?.title ?? "New stories available";
      const result = await sendNewStoriesNotification(
        pool,
        feed.tenantId,
        {
          vapidPublicKey: pushConfig.vapidPublicKey,
          vapidPrivateKey: pushConfig.vapidPrivateKey,
          vapidContact: pushConfig.vapidContact ?? "mailto:admin@localhost"
        },
        clusterIds.length,
        topHeadline
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

async function getClusterIdsForItems(pool: Pool, tenantId: string, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];

  const result = await pool.query<{ cluster_id: string }>(
    `SELECT DISTINCT cluster_id
     FROM cluster_member
     WHERE item_id = ANY($1)
       AND tenant_id = $2`,
    [itemIds, tenantId]
  );

  return result.rows.map((r) => r.cluster_id);
}
