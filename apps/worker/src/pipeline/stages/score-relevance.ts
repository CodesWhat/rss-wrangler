import { type AiProviderAdapter, stripMarkdownFences } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import { isBudgetExceeded, logAiUsage } from "../../services/ai-usage";
import type { UpsertedItem } from "./parse-and-upsert";

const SCORING_BATCH_SIZE = 10;

interface ScoringSettings {
  aiScoringEnabled: boolean;
}

interface ItemScore {
  itemId: string;
  focusScore: number;
  label: string;
  suggestedTags: string[];
}

async function getScoringSettings(pool: Pool, accountId: string): Promise<ScoringSettings> {
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row || !row.data || typeof row.data !== "object") {
    return { aiScoringEnabled: false };
  }
  const data = row.data as Record<string, unknown>;
  return {
    aiScoringEnabled: data.aiScoringEnabled === true,
  };
}

async function getUserTopicInterests(pool: Pool, accountId: string): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT DISTINCT t.name
     FROM feed_topic ft
     JOIN topic t ON t.id = ft.topic_id AND t.tenant_id = ft.tenant_id
     WHERE ft.tenant_id = $1
       AND ft.status IN ('pending', 'approved')
     ORDER BY t.name
     LIMIT 30`,
    [accountId],
  );
  return result.rows.map((r) => r.name);
}

function buildScoringPrompt(
  items: Array<{ title: string; summary: string | null }>,
  userTopics: string[],
): string {
  const topicsLine =
    userTopics.length > 0
      ? `User's known interests: ${userTopics.join(", ")}`
      : "User has no declared interests yet. Score based on general newsworthiness.";

  const itemLines = items
    .map((item, i) => {
      const text = item.summary ? `${item.title} -- ${item.summary.slice(0, 200)}` : item.title;
      return `${i + 1}. ${text}`;
    })
    .join("\n");

  return `You are a relevance scorer for an RSS reader. Given a user's interests and a batch of articles, score each article's relevance.

${topicsLine}

Articles:
${itemLines}

For each article, respond with a JSON object: {"scores": [{"index": 1, "focusScore": 0.85, "label": "likely relevant", "suggestedTags": ["AI", "Tech"]}]}

Rules:
- focusScore: 0.0 to 1.0 (1.0 = perfect match to user interests)
- label: one of "likely relevant", "explore", "noise"
- suggestedTags: 1-3 short tags describing the article content
- Return one entry per article in the same order`;
}

function parseScores(content: string, itemIds: string[]): ItemScore[] {
  // Strip markdown fences if present (common with Ollama/smaller models)
  const jsonStr = stripMarkdownFences(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn("[score-relevance] failed to parse LLM JSON response");
    return [];
  }

  const rawScores: unknown[] = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>).scores as unknown[]);

  if (!Array.isArray(rawScores)) {
    console.warn("[score-relevance] response missing scores array");
    return [];
  }

  const validLabels = new Set(["likely relevant", "explore", "noise"]);
  const results: ItemScore[] = [];

  for (const raw of rawScores) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;

    const index = typeof entry.index === "number" ? entry.index - 1 : -1;
    const itemId = itemIds[index];
    if (index < 0 || index >= itemIds.length || !itemId) continue;

    const focusScore =
      typeof entry.focusScore === "number" ? Math.max(0, Math.min(1, entry.focusScore)) : 0.5;

    const label =
      typeof entry.label === "string" && validLabels.has(entry.label) ? entry.label : "explore";

    const suggestedTags = Array.isArray(entry.suggestedTags)
      ? (entry.suggestedTags as unknown[])
          .filter((t): t is string => typeof t === "string")
          .slice(0, 3)
          .map((t) => t.trim().slice(0, 50))
          .filter((t) => t.length > 0)
      : [];

    results.push({
      itemId,
      focusScore,
      label,
      suggestedTags,
    });
  }

  return results;
}

async function persistScores(pool: Pool, accountId: string, scores: ItemScore[]): Promise<void> {
  for (const score of scores) {
    await pool.query(
      `UPDATE item
       SET ai_focus_score = $1,
           ai_relevant_label = $2,
           ai_suggested_tags = $3
       WHERE id = $4
         AND tenant_id = $5`,
      [score.focusScore, score.label, score.suggestedTags, score.itemId, accountId],
    );
  }
}

/**
 * Scores items for relevance using an LLM. Opt-in via app_settings.aiScoringEnabled.
 * Runs after enrichment. Gracefully degrades on failure.
 */
export async function scoreRelevance(
  pool: Pool,
  accountId: string,
  items: UpsertedItem[],
  provider: AiProviderAdapter | null,
): Promise<void> {
  if (items.length === 0) return;

  const settings = await getScoringSettings(pool, accountId);
  if (!settings.aiScoringEnabled) {
    return;
  }

  if (!provider) {
    console.warn("[score-relevance] no AI provider available, skipping");
    return;
  }

  try {
    const overBudget = await isBudgetExceeded(pool, accountId);
    if (overBudget) {
      console.warn("[score-relevance] AI budget exceeded, skipping", { accountId });
      return;
    }
  } catch (err) {
    console.warn("[score-relevance] budget check failed, proceeding with caution", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const userTopics = await getUserTopicInterests(pool, accountId);

  console.info("[score-relevance] scoring items", {
    count: items.length,
    provider: provider.name,
    userTopics: userTopics.length,
  });

  let totalScored = 0;

  for (let i = 0; i < items.length; i += SCORING_BATCH_SIZE) {
    const batch = items.slice(i, i + SCORING_BATCH_SIZE);
    const batchItems = batch.map((item) => ({
      title: item.title,
      summary: item.summary,
    }));
    const batchIds = batch.map((item) => item.id);

    try {
      const prompt = buildScoringPrompt(batchItems, userTopics);

      const response = await provider.complete({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 200,
        temperature: 0.1,
      });

      logAiUsage(pool, accountId, response, "recommendation").catch((err) => {
        console.warn("[score-relevance] failed to log AI usage", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const content = response.text.trim();
      if (!content) {
        console.warn("[score-relevance] empty LLM response for batch", { batchStart: i });
        continue;
      }

      const scores = parseScores(content, batchIds);
      if (scores.length > 0) {
        await persistScores(pool, accountId, scores);
        totalScored += scores.length;
      }
    } catch (err) {
      console.warn("[score-relevance] batch scoring failed (non-fatal)", {
        batchStart: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info("[score-relevance] scoring complete", {
    totalItems: items.length,
    totalScored,
  });
}
