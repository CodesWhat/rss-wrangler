-- Phase 0 slice: Lemon Squeezy billing foundation.
-- Adds provider metadata to tenant subscriptions and webhook idempotency/audit tracking.

-- ---------- 1. tenant_plan_subscription billing metadata ----------
ALTER TABLE tenant_plan_subscription
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_plan_subscription_billing_provider_check'
  ) THEN
    ALTER TABLE tenant_plan_subscription
      ADD CONSTRAINT tenant_plan_subscription_billing_provider_check
      CHECK (billing_provider IN ('none', 'lemon_squeezy'));
  END IF;
END $$;

ALTER TABLE tenant_plan_subscription
  ADD COLUMN IF NOT EXISTS lemon_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS lemon_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS lemon_order_id TEXT,
  ADD COLUMN IF NOT EXISTS lemon_variant_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_portal_url TEXT,
  ADD COLUMN IF NOT EXISTS update_payment_method_url TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_plan_subscription_lemon_subscription_uniq
  ON tenant_plan_subscription (lemon_subscription_id)
  WHERE lemon_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_plan_subscription_lemon_customer_idx
  ON tenant_plan_subscription (lemon_customer_id)
  WHERE lemon_customer_id IS NOT NULL;

-- ---------- 2. billing_webhook_event ----------
CREATE TABLE IF NOT EXISTS billing_webhook_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('lemon_squeezy')),
  payload_hash TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tenant_id UUID REFERENCES tenant(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_event_provider_payload_hash_uniq
  ON billing_webhook_event (provider, payload_hash);

CREATE INDEX IF NOT EXISTS billing_webhook_event_received_idx
  ON billing_webhook_event (received_at DESC);

CREATE INDEX IF NOT EXISTS billing_webhook_event_tenant_idx
  ON billing_webhook_event (tenant_id, received_at DESC);
