-- Phase 0 slice: account data export requests (hosted compliance baseline).

CREATE TABLE IF NOT EXISTS account_data_export_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  export_payload JSONB
);

CREATE INDEX IF NOT EXISTS account_data_export_request_tenant_user_idx
  ON account_data_export_request (tenant_id, user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS account_data_export_request_tenant_status_idx
  ON account_data_export_request (tenant_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_data_export_request_active_uniq
  ON account_data_export_request (tenant_id, user_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE account_data_export_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_data_export_request FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_data_export_request'
      AND policyname = 'account_data_export_request_tenant_isolation'
  ) THEN
    CREATE POLICY account_data_export_request_tenant_isolation
      ON account_data_export_request
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
