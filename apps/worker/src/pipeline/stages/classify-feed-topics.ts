import type { Pool } from "pg";
import type { AiProviderAdapter } from "@rss-wrangler/contracts";

interface ArticleRow {
  title: string;
  summary: string | null;
}

interface TopicSuggestion {
  topic: string;
  confidence: number;
}

/**
 * Classify a feed's topics using an LLM. Runs once when a feed is first
 * subscribed (classification_status = 'pending_classification').
 *
 * 1. Fetches up to 20 recent items from this feed
 * 2. Fetches existing topic names
 * 3. Makes one batched LLM call
 * 4. Parses 1-3 topic suggestions with confidence scores
 * 5. Creates new topics if needed
 * 6. Inserts feed_topic rows with status = 'pending'
 * 7. Updates feed.classification_status to 'classified'
 */
export async function classifyFeedTopics(
  pool: Pool,
  accountId: string,
  feedId: string,
  provider: AiProviderAdapter | null
): Promise<void> {
  // Fetch up to 20 recent items for context
  const articlesResult = await pool.query<ArticleRow>(
    `SELECT title, summary FROM item
     WHERE feed_id = $1
       AND tenant_id = $2
     ORDER BY published_at DESC
     LIMIT 20`,
    [feedId, accountId]
  );

  if (articlesResult.rows.length === 0) {
    console.info("[classify-feed-topics] no items for feed, skipping", { feedId });
    return;
  }

  if (!provider) {
    console.warn("[classify-feed-topics] no AI provider available, skipping classification", { feedId });
    return;
  }

  // Fetch existing topic names
  const topicsResult = await pool.query<{ name: string }>(
    `SELECT name FROM topic WHERE tenant_id = $1 ORDER BY name`,
    [accountId]
  );
  const existingTopics = topicsResult.rows.map((r) => r.name);

  // Build article list for the prompt
  const articleLines = articlesResult.rows
    .map((a, i) => `${i + 1}. ${a.title}${a.summary ? ` - ${a.summary.slice(0, 100)}` : ""}`)
    .join("\n");

  const prompt = `You are a topic classifier for an RSS feed reader. Given recent article titles from a single RSS feed, classify this feed into 1-3 topics.

Rules:
- Return 1-3 topic names that best describe this feed's content
- Use short, capitalized topic names (e.g. "Tech", "Security", "AI & ML")
- Prefer reusing existing topics when they fit well
- Only propose new topics when existing ones don't cover the content

Existing topics: ${existingTopics.join(", ")}

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

    const content = response.text.trim();
    if (!content) {
      console.warn("[classify-feed-topics] empty LLM response", { feedId });
      return;
    }

    const parsed = JSON.parse(content);
    // Handle both { topics: [...] } and raw array [...]
    const rawSuggestions: unknown[] = Array.isArray(parsed) ? parsed : parsed.topics;
    if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0) {
      console.warn("[classify-feed-topics] invalid LLM response format", { feedId, content });
      return;
    }

    suggestions = rawSuggestions
      .filter((s): s is { topic: string; confidence: number } =>
        typeof s === "object" && s !== null &&
        typeof (s as Record<string, unknown>).topic === "string" &&
        typeof (s as Record<string, unknown>).confidence === "number"
      )
      .slice(0, 3)
      .map((s) => ({
        topic: s.topic.trim().slice(0, 50),
        confidence: Math.max(0, Math.min(1, s.confidence)),
      }))
      .filter((s) => s.topic.length > 0);

    if (suggestions.length === 0) {
      console.warn("[classify-feed-topics] no valid suggestions from LLM", { feedId, content });
      return;
    }
  } catch (err) {
    console.error("[classify-feed-topics] LLM call failed, leaving feed pending", {
      feedId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  console.info("[classify-feed-topics] LLM suggested topics", {
    feedId,
    provider: provider.name,
    suggestions: suggestions.map((s) => `${s.topic} (${s.confidence})`),
  });

  // Ensure all suggested topics exist in the topic table
  for (const suggestion of suggestions) {
    await pool.query(
      `INSERT INTO topic (tenant_id, name) VALUES ($1, $2) ON CONFLICT (tenant_id, name) DO NOTHING`,
      [accountId, suggestion.topic]
    );
  }

  // Fetch topic IDs for all suggested names
  const topicNames = suggestions.map((s) => s.topic);
  const topicIdsResult = await pool.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM topic
     WHERE name = ANY($1)
       AND tenant_id = $2`,
    [topicNames, accountId]
  );
  const topicIdMap = new Map(topicIdsResult.rows.map((r) => [r.name, r.id]));

  // Insert feed_topic rows
  for (const suggestion of suggestions) {
    const topicId = topicIdMap.get(suggestion.topic);
    if (!topicId) continue;

    await pool.query(
      `INSERT INTO feed_topic (tenant_id, feed_id, topic_id, status, confidence, proposed_at)
       VALUES ($1, $2, $3, 'pending', $4, NOW())
       ON CONFLICT (feed_id, topic_id) DO NOTHING`,
      [accountId, feedId, topicId, suggestion.confidence]
    );
  }

  // Update feed classification status
  await pool.query(
    `UPDATE feed
     SET classification_status = 'classified'
     WHERE id = $1
       AND tenant_id = $2`,
    [feedId, accountId]
  );

  console.info("[classify-feed-topics] feed classified", {
    feedId,
    topicCount: suggestions.length,
  });
}
