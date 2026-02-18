-- Add estimated_cost_usd column to the ai_usage table.
-- The table is currently created at runtime via ensureAiUsageTable();
-- this migration adds the cost column so we can track USD spend per call.

-- Ensure the table exists first (matches the runtime schema)
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  feature TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created
  ON ai_usage (tenant_id, created_at);

-- Add cost column
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0;

-- Index for monthly cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_month_cost
  ON ai_usage (tenant_id, created_at, estimated_cost_usd);
