import type { DueFeed } from "../services/feed-service";

export interface PipelineContext {
  feed: DueFeed;
}

export async function runFeedPipeline({ feed }: PipelineContext): Promise<void> {
  await pollFeed(feed);
  await parseAndUpsert(feed);
  await canonicalizeUrls(feed);
  await preFilterSoftGate(feed);
  await selectiveExtraction(feed);
  await computeFeatures(feed);
  await clusterAssignment(feed);
  await postClusterFilter(feed);
  await maybeGenerateSummaries(feed);
  await maybeGenerateDigest(feed);
}

async function pollFeed(feed: DueFeed): Promise<void> {
  console.info("[pipeline] poll-feed", { feedId: feed.id, url: feed.url });
}

async function parseAndUpsert(feed: DueFeed): Promise<void> {
  console.info("[pipeline] parse-upsert", { feedId: feed.id });
}

async function canonicalizeUrls(feed: DueFeed): Promise<void> {
  console.info("[pipeline] canonicalize-url", { feedId: feed.id });
}

async function preFilterSoftGate(feed: DueFeed): Promise<void> {
  console.info("[pipeline] pre-filter-soft-gate", { feedId: feed.id });
}

async function selectiveExtraction(feed: DueFeed): Promise<void> {
  console.info("[pipeline] selective-extraction", { feedId: feed.id });
}

async function computeFeatures(feed: DueFeed): Promise<void> {
  console.info("[pipeline] compute-features", { feedId: feed.id });
}

async function clusterAssignment(feed: DueFeed): Promise<void> {
  console.info("[pipeline] cluster-assignment", { feedId: feed.id });
}

async function postClusterFilter(feed: DueFeed): Promise<void> {
  console.info("[pipeline] post-cluster-filter", { feedId: feed.id });
}

async function maybeGenerateSummaries(feed: DueFeed): Promise<void> {
  console.info("[pipeline] maybe-generate-summaries", { feedId: feed.id });
}

async function maybeGenerateDigest(feed: DueFeed): Promise<void> {
  console.info("[pipeline] maybe-generate-digest", { feedId: feed.id });
}
