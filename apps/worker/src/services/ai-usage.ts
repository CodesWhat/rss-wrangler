import type { AiCompletionResponse } from "@rss-wrangler/contracts";
import { estimateCostUsd } from "@rss-wrangler/contracts";
import type { Pool } from "pg";

export type AiStage = "summary" | "classification" | "digest" | "recommendation";

export async function logAiUsage(
  pool: Pool,
  accountId: string,
  response: AiCompletionResponse,
  stage: AiStage,
): Promise<void> {
  const costUsd = estimateCostUsd(
    response.model,
    response.inputTokens,
    response.outputTokens,
    response.provider,
  );
  await pool.query(
    `INSERT INTO ai_usage (tenant_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, feature, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      accountId,
      response.provider,
      response.model,
      response.inputTokens,
      response.outputTokens,
      costUsd,
      stage,
      response.durationMs,
    ],
  );
}

export async function isBudgetExceeded(pool: Pool, accountId: string): Promise<boolean> {
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;

  const usageResult = await pool.query<{ total_tokens: string; total_cost: string }>(
    `SELECT
       COALESCE(SUM(input_tokens + output_tokens), 0)::text AS total_tokens,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS total_cost
     FROM ai_usage
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [accountId, monthStart],
  );

  const totalTokens = Number.parseInt(usageResult.rows[0]?.total_tokens ?? "0", 10);
  const totalCost = Number.parseFloat(usageResult.rows[0]?.total_cost ?? "0");

  // Check token limit from plan
  const planResult = await pool.query<{ plan_id: string }>(
    `SELECT plan_id FROM tenant_plan_subscription WHERE tenant_id = $1 LIMIT 1`,
    [accountId],
  );
  const planId = planResult.rows[0]?.plan_id ?? "free";
  const tokenLimit = planId === "pro_ai" ? 1_000_000 : planId === "pro" ? 100_000 : 10_000;
  if (totalTokens >= tokenLimit) return true;

  // Check USD cap from settings
  const settingsResult = await pool.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1`,
    [accountId],
  );
  const data = settingsResult.rows[0]?.data;
  if (data && typeof data === "object") {
    const cap = (data as Record<string, unknown>).monthlyAiCapUsd;
    if (typeof cap === "number" && cap > 0 && totalCost >= cap) return true;
  }

  return false;
}
