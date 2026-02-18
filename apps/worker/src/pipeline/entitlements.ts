import type { PlanId } from "@rss-wrangler/contracts";
import type { Pool } from "pg";

interface PipelinePlanDefaults {
  itemsPerDayLimit: number | null;
  minPollMinutes: number;
}

export interface PipelineEntitlements {
  planId: PlanId;
  itemsPerDayLimit: number | null;
  minPollMinutes: number;
}

const PIPELINE_PLAN_DEFAULTS: Record<PlanId, PipelinePlanDefaults> = {
  free: {
    itemsPerDayLimit: 500,
    minPollMinutes: 60,
  },
  pro: {
    itemsPerDayLimit: null,
    minPollMinutes: 10,
  },
  pro_ai: {
    itemsPerDayLimit: null,
    minPollMinutes: 10,
  },
};

function normalizePlanId(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "pro_ai") {
    return raw;
  }
  return "free";
}

export async function getPipelineEntitlements(
  pool: Pool,
  accountId: string,
): Promise<PipelineEntitlements> {
  const result = await pool.query<{ plan_id: string }>(
    `SELECT plan_id
     FROM tenant_plan_subscription
     WHERE tenant_id = $1
     LIMIT 1`,
    [accountId],
  );

  const planId = normalizePlanId(result.rows[0]?.plan_id);
  const defaults = PIPELINE_PLAN_DEFAULTS[planId];

  return {
    planId,
    itemsPerDayLimit: defaults.itemsPerDayLimit,
    minPollMinutes: defaults.minPollMinutes,
  };
}

export function isPollAllowed(
  lastPolledAt: Date | null,
  minPollMinutes: number,
  now = new Date(),
): boolean {
  if (!lastPolledAt) {
    return true;
  }

  const elapsedMs = now.getTime() - lastPolledAt.getTime();
  return elapsedMs >= minPollMinutes * 60 * 1000;
}

export async function reserveDailyIngestionBudget(
  pool: Pool,
  accountId: string,
  dailyLimit: number,
  requested: number,
): Promise<number> {
  if (requested <= 0) {
    return 0;
  }

  // Ensure the daily-usage row exists (separate statement so the UPDATE below
  // always sees it — data-modifying CTEs share the same snapshot).
  await pool.query(
    `INSERT INTO tenant_usage_daily (tenant_id, usage_date, items_ingested_count, updated_at)
     VALUES ($1, CURRENT_DATE, 0, NOW())
     ON CONFLICT (tenant_id, usage_date) DO NOTHING`,
    [accountId],
  );

  // Atomically reserve slots against the daily limit.
  const result = await pool.query<{ allowed: number }>(
    `WITH allocation AS (
       SELECT GREATEST(0, LEAST($3::int, $2::int - items_ingested_count)) AS allowed
       FROM tenant_usage_daily
       WHERE tenant_id = $1 AND usage_date = CURRENT_DATE
       FOR UPDATE
     )
     UPDATE tenant_usage_daily
     SET items_ingested_count = items_ingested_count + allocation.allowed,
         updated_at = NOW()
     FROM allocation
     WHERE tenant_usage_daily.tenant_id = $1
       AND tenant_usage_daily.usage_date = CURRENT_DATE
     RETURNING allocation.allowed`,
    [accountId, dailyLimit, requested],
  );

  return result.rows[0]?.allowed ?? 0;
}

export async function releaseDailyIngestionBudget(
  pool: Pool,
  accountId: string,
  releaseCount: number,
): Promise<void> {
  if (releaseCount <= 0) {
    return;
  }

  await pool.query(
    `UPDATE tenant_usage_daily
     SET items_ingested_count = GREATEST(0, items_ingested_count - $2),
         updated_at = NOW()
     WHERE tenant_id = $1
       AND usage_date = CURRENT_DATE`,
    [accountId, releaseCount],
  );
}

export async function incrementDailyIngestionUsage(
  pool: Pool,
  accountId: string,
  incrementBy: number,
): Promise<void> {
  if (incrementBy <= 0) {
    return;
  }

  await pool.query(
    `INSERT INTO tenant_usage_daily (tenant_id, usage_date, items_ingested_count, updated_at)
     VALUES ($1, CURRENT_DATE, $2, NOW())
     ON CONFLICT (tenant_id, usage_date)
     DO UPDATE SET
       items_ingested_count = tenant_usage_daily.items_ingested_count + EXCLUDED.items_ingested_count,
       updated_at = NOW()`,
    [accountId, incrementBy],
  );
}
