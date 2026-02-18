import type { AiProviderAdapter } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import { logAiUsage } from "../../services/ai-usage";

/** Threshold: if more than 35% of new topics differ from current, drift is detected */
const DRIFT_THRESHOLD = 0.35;

interface TopicSuggestion {
  topic: string;
  confidence: number;
}

interface CurrentTopic {
  topicId: string;
  topicName: string;
}

export interface DriftResult {
  feedId: string;
  driftDetected: boolean;
  currentTopics: string[];
  suggestedTopics: string[];
  newTopics: string[];
  removedTopics: string[];
}

/**
 * Compare two sets of topic names and determine if drift occurred.
 * Drift is detected when more than DRIFT_THRESHOLD (35%) of the
 * suggested topics are new (not in the current set).
 */
export function computeDrift(
  currentTopics: string[],
  suggestedTopics: string[],
): {
  driftDetected: boolean;
  newTopics: string[];
  removedTopics: string[];
} {
  const currentSet = new Set(currentTopics.map((t) => t.toLowerCase()));
  const suggestedSet = new Set(suggestedTopics.map((t) => t.toLowerCase()));

  const newTopics = suggestedTopics.filter((t) => !currentSet.has(t.toLowerCase()));
  const removedTopics = currentTopics.filter((t) => !suggestedSet.has(t.toLowerCase()));

  if (suggestedTopics.length === 0) {
    return { driftDetected: false, newTopics: [], removedTopics: [] };
  }

  const driftRatio = newTopics.length / suggestedTopics.length;
  const driftDetected = driftRatio > DRIFT_THRESHOLD;

  return { driftDetected, newTopics, removedTopics };
}

/**
 * Detect topic drift for a single feed. Samples the last 30 items,
 * re-classifies via LLM, and compares against current approved topics.
 *
 * If drift is detected, new feed_topic rows are inserted with status='pending'
 * so the user can approve or reject the re-classification.
 */
export async function detectTopicDrift(
  pool: Pool,
  accountId: string,
  feedId: string,
  provider: AiProviderAdapter | null,
): Promise<DriftResult | null> {
  if (!provider) {
    console.warn("[detect-topic-drift] no AI provider available, skipping", { feedId });
    return null;
  }

  // Fetch last 30 items (per spec: "Weekly job samples last 30 items")
  const articlesResult = await pool.query<{ title: string; summary: string | null }>(
    `SELECT title, summary FROM item
     WHERE feed_id = $1
       AND tenant_id = $2
     ORDER BY published_at DESC
     LIMIT 30`,
    [feedId, accountId],
  );

  if (articlesResult.rows.length === 0) {
    console.info("[detect-topic-drift] no items for feed, skipping", { feedId });
    return null;
  }

  // Fetch current approved topics for this feed
  const currentTopicsResult = await pool.query<CurrentTopic>(
    `SELECT t.id AS "topicId", t.name AS "topicName"
     FROM feed_topic ft
     JOIN topic t ON t.id = ft.topic_id
     WHERE ft.feed_id = $1
       AND ft.tenant_id = $2
       AND ft.status = 'approved'`,
    [feedId, accountId],
  );
  const currentTopics = currentTopicsResult.rows;

  // Fetch all existing topic names for the LLM prompt
  const allTopicsResult = await pool.query<{ name: string }>(
    `SELECT name FROM topic WHERE tenant_id = $1 ORDER BY name`,
    [accountId],
  );
  const existingTopicNames = allTopicsResult.rows.map((r) => r.name);

  const articleLines = articlesResult.rows
    .map((a, i) => `${i + 1}. ${a.title}${a.summary ? ` - ${a.summary.slice(0, 100)}` : ""}`)
    .join("\n");

  const prompt = `You are a topic classifier for an RSS feed reader. Given recent article titles from a single RSS feed, classify this feed into 1-3 topics.

Rules:
- Return 1-3 topic names that best describe this feed's content
- Use short, capitalized topic names (e.g. "Tech", "Security", "AI & ML")
- Prefer reusing existing topics when they fit well
- Only propose new topics when existing ones don't cover the content

Existing topics: ${existingTopicNames.join(", ")}

Articles from this feed:
${articleLines}

Respond ONLY with a JSON object containing a "topics" array: {"topics": [{"topic": "Tech", "confidence": 0.9}]}`;

  let suggestions: TopicSuggestion[];
  try {
    const response = await provider.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
      temperature: 0.3,
    });

    logAiUsage(pool, accountId, response, "classification").catch((err) => {
      console.warn("[detect-topic-drift] failed to log AI usage", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const content = response.text.trim();
    if (!content) {
      console.warn("[detect-topic-drift] empty LLM response", { feedId });
      return null;
    }

    const parsed = JSON.parse(content);
    const rawSuggestions: unknown[] = Array.isArray(parsed) ? parsed : parsed.topics;
    if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0) {
      console.warn("[detect-topic-drift] invalid LLM response format", { feedId, content });
      return null;
    }

    suggestions = rawSuggestions
      .filter(
        (s): s is { topic: string; confidence: number } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).topic === "string" &&
          typeof (s as Record<string, unknown>).confidence === "number",
      )
      .slice(0, 3)
      .map((s) => ({
        topic: s.topic.trim().slice(0, 50),
        confidence: Math.max(0, Math.min(1, s.confidence)),
      }))
      .filter((s) => s.topic.length > 0);

    if (suggestions.length === 0) {
      console.warn("[detect-topic-drift] no valid suggestions from LLM", { feedId, content });
      return null;
    }
  } catch (err) {
    console.error("[detect-topic-drift] LLM call failed", {
      feedId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const currentTopicNames = currentTopics.map((t) => t.topicName);
  const suggestedTopicNames = suggestions.map((s) => s.topic);

  const { driftDetected, newTopics, removedTopics } = computeDrift(
    currentTopicNames,
    suggestedTopicNames,
  );

  const result: DriftResult = {
    feedId,
    driftDetected,
    currentTopics: currentTopicNames,
    suggestedTopics: suggestedTopicNames,
    newTopics,
    removedTopics,
  };

  if (!driftDetected) {
    console.info("[detect-topic-drift] no drift detected", {
      feedId,
      currentTopicNames,
      suggestedTopicNames,
    });
    await pool.query(`UPDATE feed SET classified_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
      feedId,
      accountId,
    ]);
    return result;
  }

  console.info("[detect-topic-drift] drift detected", {
    feedId,
    currentTopicNames,
    suggestedTopicNames,
    newTopics,
    removedTopics,
  });

  // Insert new topic suggestions as pending approvals
  for (const suggestion of suggestions) {
    if (!newTopics.includes(suggestion.topic)) continue;

    await pool.query(
      `INSERT INTO topic (tenant_id, name) VALUES ($1, $2) ON CONFLICT (tenant_id, name) DO NOTHING`,
      [accountId, suggestion.topic],
    );
  }

  // Fetch topic IDs for new topics
  if (newTopics.length > 0) {
    const topicIdsResult = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM topic WHERE name = ANY($1) AND tenant_id = $2`,
      [newTopics, accountId],
    );
    const topicIdMap = new Map(topicIdsResult.rows.map((r) => [r.name, r.id]));

    for (const suggestion of suggestions) {
      if (!newTopics.includes(suggestion.topic)) continue;
      const topicId = topicIdMap.get(suggestion.topic);
      if (!topicId) continue;

      await pool.query(
        `INSERT INTO feed_topic (tenant_id, feed_id, topic_id, status, confidence, proposed_at)
         VALUES ($1, $2, $3, 'pending', $4, NOW())
         ON CONFLICT (feed_id, topic_id) DO UPDATE
         SET status = 'pending', confidence = $4, proposed_at = NOW(), resolved_at = NULL`,
        [accountId, feedId, topicId, suggestion.confidence],
      );
    }
  }

  // Update feed classification timestamp
  await pool.query(
    `UPDATE feed SET classification_status = 'classified', classified_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [feedId, accountId],
  );

  return result;
}
