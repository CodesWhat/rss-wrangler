import type { Pool } from "pg";
import type { DueFeed } from "../services/feed-service";
import { FeedService } from "../services/feed-service";
import { pollFeed } from "./stages/poll-feed";
import { parseAndUpsert } from "./stages/parse-and-upsert";
import { assignClusters } from "./stages/cluster-assignment";
import { enrichWithAi } from "./stages/enrich-with-ai";
import { preFilterSoftGate, postClusterFilter } from "./stages/filter";
import { maybeGenerateDigest } from "./stages/generate-digest";

export interface PipelineContext {
  feed: DueFeed;
  pool: Pool;
  openaiApiKey?: string;
}

export async function runFeedPipeline({ feed, pool, openaiApiKey }: PipelineContext): Promise<void> {
  const feedService = new FeedService(pool);

  // Stage 1: Poll feed with conditional GET
  console.info("[pipeline] polling feed", { feedId: feed.id, url: feed.url });
  const pollResult = await pollFeed(feed);

  // Update etag/last-modified regardless
  await feedService.updateLastPolled(feed.id, pollResult.etag, pollResult.lastModified);

  if (pollResult.notModified) {
    console.info("[pipeline] feed not modified, skipping", { feedId: feed.id });
    return;
  }

  if (pollResult.items.length === 0) {
    console.info("[pipeline] no items in feed", { feedId: feed.id });
    return;
  }

  console.info("[pipeline] fetched items", { feedId: feed.id, count: pollResult.items.length });

  // Stage 2 + 3: Parse, canonicalize URLs, and upsert items
  const { succeeded: upserted, failed } = await parseAndUpsert(pool, feed.id, pollResult.items);

  if (failed.length > 0) {
    console.warn("[pipeline] some items failed to upsert", {
      feedId: feed.id,
      failedCount: failed.length,
    });
  }

  const newItems = upserted.filter((i) => i.isNew);

  console.info("[pipeline] upserted items", {
    feedId: feed.id,
    total: upserted.length,
    new: newItems.length,
  });

  if (newItems.length === 0) {
    console.info("[pipeline] no new items, skipping downstream stages", { feedId: feed.id });
    return;
  }

  // Stage 4: Pre-filter soft gate (mute/block check on title+summary)
  const filterResults = await preFilterSoftGate(
    pool,
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
  await assignClusters(pool, newItems);

  // Stage: Enrich items with og:image and AI summaries
  try {
    await enrichWithAi(pool, newItems, openaiApiKey);
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
    newItems.map((i) => i.id)
  );
  await postClusterFilter(pool, clusterIds);

  // Stage 10: Digest generation (if triggers met)
  await maybeGenerateDigest(pool);

  console.info("[pipeline] completed", {
    feedId: feed.id,
    newItems: newItems.length,
    clusters: clusterIds.length,
  });
}

async function getClusterIdsForItems(pool: Pool, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];

  const result = await pool.query<{ cluster_id: string }>(
    `SELECT DISTINCT cluster_id FROM cluster_member WHERE item_id = ANY($1)`,
    [itemIds]
  );

  return result.rows.map((r) => r.cluster_id);
}
