import type { AiBudgetCheck, AiUsageRecord, AiUsageSummary, PlanId } from "@rss-wrangler/contracts";
import { estimateCostUsd } from "@rss-wrangler/contracts";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

const TOKEN_BUDGET_BY_PLAN: Record<PlanId, number | null> = {
  free: 10_000,
  pro: 100_000,
  pro_ai: 1_000_000,
};

export async function ensureAiUsageTable(pool: Queryable): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      feature TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created
      ON ai_usage (tenant_id, created_at)
  `);
}

function normalizePlanId(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "pro_ai") {
    return raw;
  }
  return "free";
}

async function getAccountPlanId(client: Queryable, accountId: string): Promise<PlanId> {
  const result = await client.query<{ plan_id: string }>(
    `SELECT plan_id
     FROM tenant_plan_subscription
     WHERE tenant_id = $1
     LIMIT 1`,
    [accountId],
  );
  return normalizePlanId(result.rows[0]?.plan_id);
}

function getBudgetForPlan(planId: PlanId): number | null {
  return TOKEN_BUDGET_BY_PLAN[planId] ?? null;
}

async function getMonthlyAiCapUsd(client: Queryable, accountId: string): Promise<number | null> {
  const result = await client.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row?.data || typeof row.data !== "object") return null;
  const data = row.data as Record<string, unknown>;
  const cap = data.monthlyAiCapUsd;
  if (typeof cap === "number" && cap > 0) return cap;
  return null;
}

export async function recordAiUsage(
  pool: Queryable,
  record: Omit<AiUsageRecord, "id" | "createdAt">,
): Promise<void> {
  const costUsd =
    record.estimatedCostUsd ??
    estimateCostUsd(record.model, record.inputTokens, record.outputTokens);
  await pool.query(
    `INSERT INTO ai_usage (tenant_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, feature, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.accountId,
      record.provider,
      record.model,
      record.inputTokens,
      record.outputTokens,
      costUsd,
      record.feature,
      record.durationMs,
    ],
  );
}

export async function getMonthlyUsage(
  pool: Queryable,
  accountId: string,
  month?: string,
): Promise<AiUsageSummary> {
  const monthStart = month ? `${month}-01` : `${new Date().toISOString().slice(0, 7)}-01`;

  const resolvedMonth = month ?? new Date().toISOString().slice(0, 7);

  const totalsResult = await pool.query<{
    total_input: string;
    total_output: string;
    total_calls: string;
    total_cost: string;
  }>(
    `SELECT
       COALESCE(SUM(input_tokens), 0)::text AS total_input,
       COALESCE(SUM(output_tokens), 0)::text AS total_output,
       COUNT(*)::text AS total_calls,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS total_cost
     FROM ai_usage
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [accountId, monthStart],
  );

  const byProviderResult = await pool.query<{
    provider: string;
    input_tokens: string;
    output_tokens: string;
    cost: string;
    calls: string;
  }>(
    `SELECT
       provider,
       COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
       COUNT(*)::text AS calls
     FROM ai_usage
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')
     GROUP BY provider`,
    [accountId, monthStart],
  );

  const byFeatureResult = await pool.query<{
    feature: string;
    input_tokens: string;
    output_tokens: string;
    cost: string;
    calls: string;
  }>(
    `SELECT
       feature,
       COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
       COUNT(*)::text AS calls
     FROM ai_usage
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')
     GROUP BY feature`,
    [accountId, monthStart],
  );

  const planId = await getAccountPlanId(pool, accountId);
  const budgetTokens = getBudgetForPlan(planId);
  const budgetCapUsd = await getMonthlyAiCapUsd(pool, accountId);

  const totals = totalsResult.rows[0];
  const totalInput = Number.parseInt(totals?.total_input ?? "0", 10);
  const totalOutput = Number.parseInt(totals?.total_output ?? "0", 10);
  const totalCalls = Number.parseInt(totals?.total_calls ?? "0", 10);
  const totalCostUsd = Number.parseFloat(totals?.total_cost ?? "0");
  const totalTokens = totalInput + totalOutput;

  const byProvider: AiUsageSummary["byProvider"] = {};
  for (const row of byProviderResult.rows) {
    byProvider[row.provider] = {
      inputTokens: Number.parseInt(row.input_tokens, 10),
      outputTokens: Number.parseInt(row.output_tokens, 10),
      costUsd: Number.parseFloat(row.cost),
      calls: Number.parseInt(row.calls, 10),
    };
  }

  const byFeature: AiUsageSummary["byFeature"] = {};
  for (const row of byFeatureResult.rows) {
    byFeature[row.feature] = {
      inputTokens: Number.parseInt(row.input_tokens, 10),
      outputTokens: Number.parseInt(row.output_tokens, 10),
      costUsd: Number.parseFloat(row.cost),
      calls: Number.parseInt(row.calls, 10),
    };
  }

  return {
    month: resolvedMonth,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCalls,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    byProvider,
    byFeature,
    budgetTokens,
    budgetUsedPercent:
      budgetTokens !== null ? Math.round((totalTokens / budgetTokens) * 10000) / 100 : null,
    budgetCapUsd,
    budgetCostPercent:
      budgetCapUsd !== null && budgetCapUsd > 0
        ? Math.round((totalCostUsd / budgetCapUsd) * 10000) / 100
        : null,
  };
}

export async function checkBudget(pool: Queryable, accountId: string): Promise<AiBudgetCheck> {
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;

  const usageResult = await pool.query<{ total: string; total_cost: string }>(
    `SELECT
       COALESCE(SUM(input_tokens + output_tokens), 0)::text AS total,
       COALESCE(SUM(estimated_cost_usd), 0)::text AS total_cost
     FROM ai_usage
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [accountId, monthStart],
  );

  const planId = await getAccountPlanId(pool, accountId);
  const limit = getBudgetForPlan(planId);
  const used = Number.parseInt(usageResult.rows[0]?.total ?? "0", 10);
  const costUsd = Number.parseFloat(usageResult.rows[0]?.total_cost ?? "0");
  const costLimitUsd = await getMonthlyAiCapUsd(pool, accountId);

  // Budget is exceeded if either token limit OR USD cap is hit
  let allowed = true;
  if (limit !== null && used >= limit) {
    allowed = false;
  }
  if (costLimitUsd !== null && costUsd >= costLimitUsd) {
    allowed = false;
  }

  return {
    allowed,
    remaining: limit !== null ? Math.max(limit - used, 0) : null,
    used,
    limit,
    costUsd: Math.round(costUsd * 100) / 100,
    costLimitUsd,
  };
}
