-- Phase 0 slice: hosted consent/CMP baseline.
-- Stores per-user consent choices for non-essential categories.

CREATE TABLE IF NOT EXISTS user_privacy_consent (
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  analytics_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  advertising_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  functional_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  region_code TEXT,
  consent_version TEXT NOT NULL DEFAULT '2026-02-08',
  source TEXT NOT NULL DEFAULT 'banner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_privacy_consent_region_code_check'
  ) THEN
    ALTER TABLE user_privacy_consent
      ADD CONSTRAINT user_privacy_consent_region_code_check
      CHECK (region_code IS NULL OR region_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_privacy_consent_tenant_updated_idx
  ON user_privacy_consent (tenant_id, updated_at DESC);

ALTER TABLE user_privacy_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_privacy_consent FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_privacy_consent'
      AND policyname = 'user_privacy_consent_tenant_isolation'
  ) THEN
    CREATE POLICY user_privacy_consent_tenant_isolation
      ON user_privacy_consent
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
