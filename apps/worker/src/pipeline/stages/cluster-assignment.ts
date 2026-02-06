import type { Pool } from "pg";
import type { UpsertedItem } from "./parse-and-upsert";
import { simhash, hammingDistance, jaccardSimilarity, tokenize } from "./compute-features";
import { classifyItem } from "./classify-folder";

// Thresholds for clustering
const SIMHASH_MAX_DISTANCE = 10; // candidate pre-filter: Hamming distance
const JACCARD_MIN_SIMILARITY = 0.25; // join cluster if Jaccard >= this
const TIME_WINDOW_HOURS = 48;

interface CandidateRow {
  item_id: string;
  cluster_id: string;
  title: string;
  published_at: Date;
  folder_id: string;
}

export async function assignClusters(
  pool: Pool,
  items: UpsertedItem[]
): Promise<void> {
  const newItems = items.filter((i) => i.isNew);
  if (newItems.length === 0) return;

  // Batch check: which items are already clustered?
  const itemIds = newItems.map((i) => i.id);
  const alreadyClustered = await pool.query<{ item_id: string }>(
    `SELECT item_id FROM cluster_member WHERE item_id = ANY($1)`,
    [itemIds]
  );
  const clusteredSet = new Set(alreadyClustered.rows.map((r) => r.item_id));
  const unclustered = newItems.filter((i) => !clusteredSet.has(i.id));
  if (unclustered.length === 0) return;

  // Compute the widest time window across all unclustered items for a single candidate query
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const item of unclustered) {
    const t = item.publishedAt.getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }
  const windowStart = new Date(minTime - TIME_WINDOW_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(maxTime + TIME_WINDOW_HOURS * 60 * 60 * 1000);

  // Fetch all candidates in one query
  const unclusteredIds = unclustered.map((i) => i.id);
  const candidates = await pool.query<CandidateRow>(
    `SELECT i.id AS item_id, cm.cluster_id, i.title, i.published_at, c.folder_id
     FROM item i
     JOIN cluster_member cm ON cm.item_id = i.id
     JOIN cluster c ON c.id = cm.cluster_id
     WHERE i.published_at BETWEEN $1 AND $2
       AND i.id != ALL($3)
     ORDER BY i.published_at DESC
     LIMIT 2000`,
    [windowStart.toISOString(), windowEnd.toISOString(), unclusteredIds]
  );

  // Group candidates by cluster
  const clusterCandidates = new Map<string, CandidateRow[]>();
  for (const c of candidates.rows) {
    const arr = clusterCandidates.get(c.cluster_id) || [];
    arr.push(c);
    clusterCandidates.set(c.cluster_id, arr);
  }

  // Pre-fetch all feed weights we might need for representative selection
  const feedIds = new Set(unclustered.map((i) => i.feedId));
  const feedWeightResult = await pool.query<{ id: string; weight: string }>(
    `SELECT id, weight FROM feed WHERE id = ANY($1)`,
    [Array.from(feedIds)]
  );
  const feedWeights = new Map<string, string>();
  for (const row of feedWeightResult.rows) {
    feedWeights.set(row.id, row.weight);
  }

  // Track batch inserts for new cluster members and cluster size updates
  const addToCluster: { clusterId: string; itemId: string }[] = [];
  const newClusters: { item: UpsertedItem; folderId: string }[] = [];
  const repCandidates: { clusterId: string; item: UpsertedItem }[] = [];

  for (const item of unclustered) {
    const itemTokens = tokenize(item.title + " " + (item.summary || ""));
    const itemHash = simhash(item.title + " " + (item.summary || ""));

    let bestClusterId: string | null = null;
    let bestScore = 0;

    // Per-item time window filtering
    const itemWindowStart = item.publishedAt.getTime() - TIME_WINDOW_HOURS * 60 * 60 * 1000;
    const itemWindowEnd = item.publishedAt.getTime() + TIME_WINDOW_HOURS * 60 * 60 * 1000;

    for (const [clusterId, members] of clusterCandidates) {
      // Use the first (most recent) member as representative sample
      const rep = members[0];
      if (!rep) continue;

      // Check per-item time window
      const repTime = new Date(rep.published_at).getTime();
      if (repTime < itemWindowStart || repTime > itemWindowEnd) continue;

      const repText = rep.title;
      const repHash = simhash(repText);
      const hamDist = hammingDistance(itemHash, repHash);

      // Quick pre-filter by simhash distance
      if (hamDist > SIMHASH_MAX_DISTANCE) continue;

      const repTokens = tokenize(repText);
      const jaccard = jaccardSimilarity(itemTokens, repTokens);

      if (jaccard >= JACCARD_MIN_SIMILARITY && jaccard > bestScore) {
        bestScore = jaccard;
        bestClusterId = clusterId;
      }
    }

    if (bestClusterId) {
      addToCluster.push({ clusterId: bestClusterId, itemId: item.id });
      repCandidates.push({ clusterId: bestClusterId, item });
    } else {
      const classifiedFolderId = classifyItem({ title: item.title, summary: item.summary });
      newClusters.push({ item, folderId: classifiedFolderId });
    }
  }

  // Batch insert cluster members for items joining existing clusters
  if (addToCluster.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < addToCluster.length; i++) {
      const entry = addToCluster[i]!;
      placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
      values.push(entry.clusterId, entry.itemId);
    }
    await pool.query(
      `INSERT INTO cluster_member (cluster_id, item_id)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (cluster_id, item_id) DO NOTHING`,
      values
    );

    // Batch update cluster sizes
    const clusterCountMap = new Map<string, number>();
    for (const entry of addToCluster) {
      clusterCountMap.set(entry.clusterId, (clusterCountMap.get(entry.clusterId) || 0) + 1);
    }
    const clusterUpdateIds: string[] = [];
    const clusterUpdateCounts: number[] = [];
    for (const [cId, count] of clusterCountMap) {
      clusterUpdateIds.push(cId);
      clusterUpdateCounts.push(count);
    }
    await pool.query(
      `UPDATE cluster SET
         size = size + increment.cnt,
         updated_at = NOW()
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS cnt) AS increment
       WHERE cluster.id = increment.id`,
      [clusterUpdateIds, clusterUpdateCounts]
    );
  }

  // Create new clusters for unmatched items
  if (newClusters.length > 0) {
    const clusterValues: unknown[] = [];
    const clusterPlaceholders: string[] = [];
    for (let i = 0; i < newClusters.length; i++) {
      const entry = newClusters[i]!;
      clusterPlaceholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
      clusterValues.push(entry.item.id, entry.folderId);
    }
    const newClusterResult = await pool.query<{ id: string; rep_item_id: string }>(
      `INSERT INTO cluster (rep_item_id, folder_id, size)
       VALUES ${clusterPlaceholders.map((p) => p.replace(/\)$/, ", 1)")).join(", ")}
       RETURNING id, rep_item_id`,
      clusterValues
    );

    // Batch insert cluster_member rows for new clusters
    if (newClusterResult.rows.length > 0) {
      const memberValues: unknown[] = [];
      const memberPlaceholders: string[] = [];
      for (let i = 0; i < newClusterResult.rows.length; i++) {
        const row = newClusterResult.rows[i]!;
        memberPlaceholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        memberValues.push(row.id, row.rep_item_id);
      }
      await pool.query(
        `INSERT INTO cluster_member (cluster_id, item_id)
         VALUES ${memberPlaceholders.join(", ")}`,
        memberValues
      );
    }
  }

  // Batch update representatives where new item's feed has higher weight
  if (repCandidates.length > 0) {
    // Fetch current rep feed weights for affected clusters
    const affectedClusterIds = repCandidates.map((r) => r.clusterId);
    const currentReps = await pool.query<{ cluster_id: string; weight: string }>(
      `SELECT c.id AS cluster_id, COALESCE(f.weight, 'neutral') AS weight
       FROM cluster c
       JOIN item i ON i.id = c.rep_item_id
       JOIN feed f ON f.id = i.feed_id
       WHERE c.id = ANY($1)`,
      [affectedClusterIds]
    );
    const currentRepWeights = new Map<string, string>();
    for (const row of currentReps.rows) {
      currentRepWeights.set(row.cluster_id, row.weight);
    }

    const weightRank: Record<string, number> = {
      prefer: 3,
      neutral: 2,
      deprioritize: 1,
    };

    for (const { clusterId, item } of repCandidates) {
      const currentWeight = currentRepWeights.get(clusterId) || "neutral";
      const newWeight = feedWeights.get(item.feedId) || "neutral";
      if ((weightRank[newWeight] || 0) > (weightRank[currentWeight] || 0)) {
        await pool.query(
          `UPDATE cluster SET rep_item_id = $2, updated_at = NOW() WHERE id = $1`,
          [clusterId, item.id]
        );
        // Update local state so subsequent items see the new rep weight
        currentRepWeights.set(clusterId, newWeight);
      }
    }
  }
}
