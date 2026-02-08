-- Phase 0 slice: tenant plan entitlements + daily usage counters.
-- Free defaults are enforced in API/worker, with usage state in Postgres.

CREATE TABLE IF NOT EXISTS tenant_plan_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free', 'pro', 'pro_ai')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  trial_ends_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_plan_subscription_tenant_uniq
  ON tenant_plan_subscription (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_plan_subscription_plan_status_idx
  ON tenant_plan_subscription (plan_id, status, created_at DESC);

INSERT INTO tenant_plan_subscription (tenant_id, plan_id, status)
SELECT t.id, 'free', 'active'
FROM tenant t
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE tenant_plan_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_plan_subscription FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_plan_subscription'
      AND policyname = 'tenant_plan_subscription_tenant_isolation'
  ) THEN
    CREATE POLICY tenant_plan_subscription_tenant_isolation
      ON tenant_plan_subscription
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_usage_daily (
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  items_ingested_count INTEGER NOT NULL DEFAULT 0 CHECK (items_ingested_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, usage_date)
);

CREATE INDEX IF NOT EXISTS tenant_usage_daily_tenant_date_idx
  ON tenant_usage_daily (tenant_id, usage_date DESC);

ALTER TABLE tenant_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage_daily FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_usage_daily'
      AND policyname = 'tenant_usage_daily_tenant_isolation'
  ) THEN
    CREATE POLICY tenant_usage_daily_tenant_isolation
      ON tenant_usage_daily
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
