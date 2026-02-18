import type { FeedRecommendation } from "@rss-wrangler/contracts";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

interface UserTopic {
  topicName: string;
}

interface UserFeedDomain {
  domain: string;
}

interface DirectoryCandidate {
  id: string;
  feed_url: string;
  title: string;
  description: string | null;
  category: string;
  site_url: string | null;
  popularity_rank: number | null;
}

interface CachedRecommendation {
  id: string;
  feed_directory_id: string;
  score: number;
  reason: string | null;
  created_at: Date;
  dismissed: boolean;
  fd_title: string;
  fd_feed_url: string;
  fd_description: string | null;
  fd_category: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_FEEDS_FOR_RECOMMENDATIONS = 3;
const MAX_RECOMMENDATIONS = 20;

/**
 * Extract the registrable domain from a URL (e.g., "example.com" from "https://blog.example.com/feed").
 * Simple heuristic: take the last two segments of the hostname.
 */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length < 2) return hostname;
    return parts.slice(-2).join(".");
  } catch {
    return null;
  }
}

/**
 * Compute a Jaccard-like similarity between the user's topic set and a category.
 * Because categories are single strings and user topics are a set, we check for
 * substring/case-insensitive containment rather than strict set intersection.
 */
function topicOverlapScore(userTopics: Set<string>, category: string): number {
  const categoryLower = category.toLowerCase();
  let matches = 0;
  for (const topic of userTopics) {
    const topicLower = topic.toLowerCase();
    if (
      categoryLower === topicLower ||
      categoryLower.includes(topicLower) ||
      topicLower.includes(categoryLower)
    ) {
      matches++;
    }
  }
  if (matches === 0) return 0;
  // Jaccard-like: matches / (userTopics.size + 1 - matches)
  return matches / (userTopics.size + 1 - matches);
}

export async function getRecommendations(
  dbClient: Queryable,
  accountId: string,
): Promise<FeedRecommendation[]> {
  // Check if user has enough feeds for recommendations
  const feedCountResult = await dbClient.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM feed
     WHERE tenant_id = $1`,
    [accountId],
  );
  const feedCount = Number.parseInt(feedCountResult.rows[0]?.count ?? "0", 10);
  if (feedCount < MIN_FEEDS_FOR_RECOMMENDATIONS) {
    return [];
  }

  // Check for fresh cached recommendations
  const cachedResult = await dbClient.query<CachedRecommendation>(
    `SELECT
       fr.id, fr.feed_directory_id, fr.score, fr.reason, fr.created_at, fr.dismissed,
       fd.title AS fd_title, fd.feed_url AS fd_feed_url,
       fd.description AS fd_description, fd.category AS fd_category
     FROM feed_recommendation fr
     JOIN feed_directory fd ON fd.id = fr.feed_directory_id
     WHERE fr.tenant_id = $1
       AND fr.dismissed = false
     ORDER BY fr.score DESC
     LIMIT $2`,
    [accountId, MAX_RECOMMENDATIONS],
  );

  // If we have cached results that are fresh, return them
  if (cachedResult.rows.length > 0) {
    const oldest = cachedResult.rows[cachedResult.rows.length - 1];
    if (oldest && Date.now() - new Date(oldest.created_at).getTime() < CACHE_TTL_MS) {
      return cachedResult.rows.map(toFeedRecommendation);
    }
  }

  // Recompute recommendations
  const recommendations = await computeRecommendations(dbClient, accountId);

  // Cache the results: delete old non-dismissed rows, then insert new ones
  await dbClient.query(
    `DELETE FROM feed_recommendation
     WHERE tenant_id = $1
       AND dismissed = false`,
    [accountId],
  );

  for (const rec of recommendations) {
    await dbClient.query(
      `INSERT INTO feed_recommendation (tenant_id, feed_directory_id, score, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, feed_directory_id)
       DO UPDATE SET score = EXCLUDED.score, reason = EXCLUDED.reason, created_at = NOW(), dismissed = false`,
      [accountId, rec.feedDirectoryId, rec.score, rec.reason],
    );
  }

  return recommendations;
}

async function computeRecommendations(
  dbClient: Queryable,
  accountId: string,
): Promise<FeedRecommendation[]> {
  // 1. Get user's subscribed feed topics
  const userTopicsResult = await dbClient.query<UserTopic>(
    `SELECT DISTINCT t.name AS "topicName"
     FROM feed_topic ft
     JOIN topic t ON t.id = ft.topic_id AND t.tenant_id = ft.tenant_id
     WHERE ft.tenant_id = $1
       AND ft.status IN ('pending', 'approved')`,
    [accountId],
  );
  const userTopics = new Set(userTopicsResult.rows.map((r) => r.topicName));

  // 2. Get domains of user's existing subscriptions (for diversity penalty)
  const userDomainsResult = await dbClient.query<UserFeedDomain>(
    `SELECT DISTINCT
       CASE
         WHEN site_url IS NOT NULL AND site_url != '' THEN site_url
         ELSE url
       END AS domain
     FROM feed
     WHERE tenant_id = $1`,
    [accountId],
  );
  const subscribedDomains = new Set<string>();
  for (const row of userDomainsResult.rows) {
    const domain = extractDomain(row.domain);
    if (domain) subscribedDomains.add(domain);
  }

  // 3. Get user's existing feed URLs to exclude
  const existingUrlsResult = await dbClient.query<{ url: string }>(
    `SELECT url FROM feed WHERE tenant_id = $1`,
    [accountId],
  );
  const existingUrls = new Set(existingUrlsResult.rows.map((r) => r.url));

  // 4. Get all directory feeds
  const directoryResult = await dbClient.query<DirectoryCandidate>(
    `SELECT id, feed_url, title, description, category, site_url, popularity_rank
     FROM feed_directory
     ORDER BY popularity_rank DESC NULLS LAST`,
  );

  // 5. Score each candidate
  const scored: Array<FeedRecommendation & { rawScore: number }> = [];

  for (const candidate of directoryResult.rows) {
    // Skip feeds user already subscribes to
    if (existingUrls.has(candidate.feed_url)) continue;

    // Topic overlap score (0-1)
    let score = 0;
    if (userTopics.size > 0) {
      score = topicOverlapScore(userTopics, candidate.category);
    }

    // If no topic overlap at all and user has topics, give a small base score
    // based on popularity to still surface popular feeds
    if (score === 0 && userTopics.size > 0) {
      score = 0.05; // minimal base score
    }

    // Popularity boost (0 to 0.15)
    if (candidate.popularity_rank !== null && candidate.popularity_rank > 0) {
      // Normalize rank: higher rank = more popular. Assume max ~1000.
      const normalizedRank = Math.min(candidate.popularity_rank / 1000, 1);
      score += normalizedRank * 0.15;
    }

    // Source diversity penalty: penalize if same domain is already subscribed
    const candidateDomain = extractDomain(candidate.site_url ?? candidate.feed_url);
    if (candidateDomain && subscribedDomains.has(candidateDomain)) {
      score *= 0.3; // heavy penalty for same-domain suggestions
    }

    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));

    if (score > 0.01) {
      scored.push({
        id: candidate.id,
        feedDirectoryId: candidate.id,
        title: candidate.title,
        feedUrl: candidate.feed_url,
        description: candidate.description,
        category: candidate.category,
        score: Math.round(score * 1000) / 1000,
        reason: generateReason(candidate.category, userTopics, candidateDomain, subscribedDomains),
        rawScore: score,
      });
    }
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.rawScore - a.rawScore);
  return scored.slice(0, MAX_RECOMMENDATIONS).map(({ rawScore: _, ...rest }) => rest);
}

function generateReason(
  category: string,
  userTopics: Set<string>,
  _candidateDomain: string | null,
  _subscribedDomains: Set<string>,
): string {
  const matchingTopics: string[] = [];
  const categoryLower = category.toLowerCase();

  for (const topic of userTopics) {
    if (
      categoryLower === topic.toLowerCase() ||
      categoryLower.includes(topic.toLowerCase()) ||
      topic.toLowerCase().includes(categoryLower)
    ) {
      matchingTopics.push(topic);
    }
  }

  if (matchingTopics.length > 0) {
    return `Matches your interest in ${matchingTopics.join(", ")}`;
  }

  return `Popular in ${category}`;
}

export async function dismissRecommendation(
  dbClient: Queryable,
  accountId: string,
  recommendationId: string,
): Promise<boolean> {
  const result = await dbClient.query<{ id: string }>(
    `UPDATE feed_recommendation
     SET dismissed = true
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id`,
    [recommendationId, accountId],
  );
  return result.rows.length > 0;
}

function toFeedRecommendation(row: CachedRecommendation): FeedRecommendation {
  return {
    id: row.id,
    feedDirectoryId: row.feed_directory_id,
    title: row.fd_title,
    feedUrl: row.fd_feed_url,
    description: row.fd_description,
    category: row.fd_category,
    score: row.score,
    reason: row.reason,
  };
}
