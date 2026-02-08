import type { PlanId, PlanSubscriptionStatus, SearchMode, TenantEntitlements } from "@rss-wrangler/contracts";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

interface PlanDefaults {
  feedLimit: number | null;
  itemsPerDayLimit: number | null;
  searchMode: SearchMode;
  minPollMinutes: number;
}

const PLAN_DEFAULTS: Record<PlanId, PlanDefaults> = {
  free: {
    feedLimit: 50,
    itemsPerDayLimit: 500,
    searchMode: "title_source",
    minPollMinutes: 60
  },
  pro: {
    feedLimit: null,
    itemsPerDayLimit: null,
    searchMode: "full_text",
    minPollMinutes: 10
  },
  pro_ai: {
    feedLimit: null,
    itemsPerDayLimit: null,
    searchMode: "full_text",
    minPollMinutes: 10
  }
};

function normalizePlanId(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "pro_ai") {
    return raw;
  }
  return "free";
}

function normalizePlanStatus(raw: string | null | undefined): PlanSubscriptionStatus {
  if (raw === "trialing" || raw === "past_due" || raw === "canceled") {
    return raw;
  }
  return "active";
}

export async function getTenantEntitlements(client: Queryable, tenantId: string): Promise<TenantEntitlements> {
  const planResult = await client.query<{
    plan_id: string;
    status: string;
    trial_ends_at: Date | null;
    current_period_ends_at: Date | null;
  }>(
    `SELECT plan_id, status, trial_ends_at, current_period_ends_at
     FROM tenant_plan_subscription
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );

  const feedCountResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM feed
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const usageResult = await client.query<{ usage_date: string; items_ingested_count: number }>(
    `SELECT usage_date::text AS usage_date, items_ingested_count
     FROM tenant_usage_daily
     WHERE tenant_id = $1
       AND usage_date = CURRENT_DATE
     LIMIT 1`,
    [tenantId]
  );

  const usageDateResult = await client.query<{ usage_date: string }>(
    "SELECT CURRENT_DATE::text AS usage_date"
  );

  const planRow = planResult.rows[0];
  const planId = normalizePlanId(planRow?.plan_id);
  const defaults = PLAN_DEFAULTS[planId];
  const usage = usageResult.rows[0];

  return {
    planId,
    subscriptionStatus: normalizePlanStatus(planRow?.status),
    trialEndsAt: planRow?.trial_ends_at ? planRow.trial_ends_at.toISOString() : null,
    currentPeriodEndsAt: planRow?.current_period_ends_at ? planRow.current_period_ends_at.toISOString() : null,
    feedLimit: defaults.feedLimit,
    itemsPerDayLimit: defaults.itemsPerDayLimit,
    searchMode: defaults.searchMode,
    minPollMinutes: defaults.minPollMinutes,
    usage: {
      date: usage?.usage_date ?? usageDateResult.rows[0]?.usage_date ?? new Date().toISOString().slice(0, 10),
      itemsIngested: usage?.items_ingested_count ?? 0,
      feeds: Number.parseInt(feedCountResult.rows[0]?.count ?? "0", 10)
    }
  };
}
