-- Phase 0 slice: account deletion request tracking (hosted compliance baseline).

CREATE TABLE IF NOT EXISTS account_deletion_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_deletion_request_tenant_user_idx
  ON account_deletion_request (tenant_id, user_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_request_pending_uniq
  ON account_deletion_request (tenant_id, user_id)
  WHERE status = 'pending';

ALTER TABLE account_deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_request FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_deletion_request'
      AND policyname = 'account_deletion_request_tenant_isolation'
  ) THEN
    CREATE POLICY account_deletion_request_tenant_isolation
      ON account_deletion_request
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
