import type { AiProviderAdapter } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import { isBudgetExceeded, logAiUsage } from "../services/ai-usage";

const BATCH_SIZE = 20;

interface ProgressiveSettings {
  enabled: boolean;
  freshHours: number;
  agingDays: number;
  aiMode: string;
}

async function getProgressiveSettings(pool: Pool, accountId: string): Promise<ProgressiveSettings> {
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row || !row.data || typeof row.data !== "object") {
    return { enabled: true, freshHours: 6, agingDays: 3, aiMode: "off" };
  }
  const data = row.data as Record<string, unknown>;
  return {
    enabled: (data.progressiveSummarizationEnabled as boolean) ?? true,
    freshHours: (data.progressiveFreshHours as number) ?? 6,
    agingDays: (data.progressiveAgingDays as number) ?? 3,
    aiMode: (data.aiMode as string) ?? "off",
  };
}

/**
 * Finds items that have entered the "aging" window (older than freshHours
 * but younger than agingDays) and don't have an AI summary yet, then
 * generates summaries for up to BATCH_SIZE items per account.
 */
export async function runProgressiveSummary(
  pool: Pool,
  accountId: string,
  aiProvider: AiProviderAdapter | null,
): Promise<{ candidates: number; summarized: number }> {
  const settings = await getProgressiveSettings(pool, accountId);

  if (!settings.enabled || settings.aiMode === "off" || !aiProvider) {
    return { candidates: 0, summarized: 0 };
  }

  // Check budget before making AI calls
  try {
    const overBudget = await isBudgetExceeded(pool, accountId);
    if (overBudget) {
      console.info("[progressive-summary] AI budget exceeded, skipping", { accountId });
      return { candidates: 0, summarized: 0 };
    }
  } catch (err) {
    console.warn("[progressive-summary] budget check failed, proceeding with caution", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const freshCutoff = new Date(Date.now() - settings.freshHours * 60 * 60 * 1000);
  const agingCutoff = new Date(Date.now() - settings.agingDays * 24 * 60 * 60 * 1000);

  // Find items in the aging window that lack a summary
  const candidateResult = await pool.query<{
    id: string;
    title: string;
    summary: string | null;
  }>(
    `SELECT i.id, i.title, i.summary
     FROM item i
     WHERE i.tenant_id = $1
       AND i.published_at < $2
       AND i.published_at >= $3
       AND i.summary IS NULL
     ORDER BY i.published_at DESC
     LIMIT $4`,
    [accountId, freshCutoff.toISOString(), agingCutoff.toISOString(), BATCH_SIZE],
  );

  const candidates = candidateResult.rows;
  if (candidates.length === 0) {
    return { candidates: 0, summarized: 0 };
  }

  console.info("[progressive-summary] generating summaries", {
    accountId,
    candidates: candidates.length,
  });

  let summarized = 0;

  for (const item of candidates) {
    try {
      const response = await aiProvider.complete({
        messages: [
          {
            role: "system",
            content:
              "You are a concise news summarizer. Given an article title, write a 1-2 sentence summary that captures the key point. Be factual and neutral. Return only the summary text, no labels or prefixes.",
          },
          { role: "user", content: `Title: ${item.title}` },
        ],
        maxTokens: 150,
        temperature: 0.3,
      });

      const text = response.text.trim();
      if (text && !text.startsWith("[")) {
        await pool.query(`UPDATE item SET summary = $1 WHERE id = $2 AND tenant_id = $3`, [
          text,
          item.id,
          accountId,
        ]);
        summarized++;
      }

      logAiUsage(pool, accountId, response, "summary").catch((err) => {
        console.warn("[progressive-summary] failed to log AI usage", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err) {
      console.warn("[progressive-summary] summary generation failed for item", {
        itemId: item.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info("[progressive-summary] completed", {
    accountId,
    candidates: candidates.length,
    summarized,
  });

  return { candidates: candidates.length, summarized };
}
