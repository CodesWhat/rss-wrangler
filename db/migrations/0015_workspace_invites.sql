-- Phase 0 slice: workspace invite tokens for hosted member onboarding controls.

CREATE TABLE IF NOT EXISTS workspace_invite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  invite_code_hash TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invite_tenant_code_uniq
  ON workspace_invite (tenant_id, invite_code_hash);

CREATE INDEX IF NOT EXISTS workspace_invite_tenant_status_idx
  ON workspace_invite (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_invite_tenant_email_idx
  ON workspace_invite (tenant_id, lower(email))
  WHERE email IS NOT NULL;

ALTER TABLE workspace_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invite FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workspace_invite'
      AND policyname = 'workspace_invite_tenant_isolation'
  ) THEN
    CREATE POLICY workspace_invite_tenant_isolation
      ON workspace_invite
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
