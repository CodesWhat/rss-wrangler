import type { Pool } from "pg";
import OpenAI from "openai";

const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

interface ArticleRow {
  title: string;
  summary: string | null;
}

interface TopicSuggestion {
  topic: string;
  confidence: number;
}

async function getOpenAIKey(pool: Pool): Promise<string | undefined> {
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE key = 'main' LIMIT 1`
  );
  const row = result.rows[0];
  if (!row || !row.data || typeof row.data !== "object") return undefined;
  const data = row.data as Record<string, unknown>;
  return (data.openaiApiKey as string) || undefined;
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
  feedId: string,
  openaiApiKey: string | undefined
): Promise<void> {
  // Fetch up to 20 recent items for context
  const articlesResult = await pool.query<ArticleRow>(
    `SELECT title, summary FROM item
     WHERE feed_id = $1
     ORDER BY published_at DESC
     LIMIT 20`,
    [feedId]
  );

  if (articlesResult.rows.length === 0) {
    console.info("[classify-feed-topics] no items for feed, skipping", { feedId });
    return;
  }

  // Fetch existing topic names
  const topicsResult = await pool.query<{ name: string }>(
    `SELECT name FROM topic ORDER BY name`
  );
  const existingTopics = topicsResult.rows.map((r) => r.name);

  // Resolve API key: prefer settings, fall back to parameter/env
  const settingsKey = await getOpenAIKey(pool);
  const effectiveKey = settingsKey || openaiApiKey || process.env.OPENAI_API_KEY;
  if (!effectiveKey) {
    console.warn("[classify-feed-topics] no OpenAI API key available, skipping classification", { feedId });
    return;
  }

  const client = new OpenAI({ apiKey: effectiveKey });

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
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim();
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
    suggestions: suggestions.map((s) => `${s.topic} (${s.confidence})`),
  });

  // Ensure all suggested topics exist in the topic table
  for (const suggestion of suggestions) {
    await pool.query(
      `INSERT INTO topic (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [suggestion.topic]
    );
  }

  // Fetch topic IDs for all suggested names
  const topicNames = suggestions.map((s) => s.topic);
  const topicIdsResult = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM topic WHERE name = ANY($1)`,
    [topicNames]
  );
  const topicIdMap = new Map(topicIdsResult.rows.map((r) => [r.name, r.id]));

  // Insert feed_topic rows
  for (const suggestion of suggestions) {
    const topicId = topicIdMap.get(suggestion.topic);
    if (!topicId) continue;

    await pool.query(
      `INSERT INTO feed_topic (feed_id, topic_id, status, confidence, proposed_at)
       VALUES ($1, $2, 'pending', $3, NOW())
       ON CONFLICT (feed_id, topic_id) DO NOTHING`,
      [feedId, topicId, suggestion.confidence]
    );
  }

  // Update feed classification status
  await pool.query(
    `UPDATE feed SET classification_status = 'classified' WHERE id = $1`,
    [feedId]
  );

  console.info("[classify-feed-topics] feed classified", {
    feedId,
    topicCount: suggestions.length,
  });
}
