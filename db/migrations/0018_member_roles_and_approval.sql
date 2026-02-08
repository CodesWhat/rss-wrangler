-- Phase 0 slice: member roles, approval workflow, and membership audit trail.
-- Adds role/status to user_account, membership_policy to tenant, and member_event audit table.

-- ---------- 1. user_account.role ----------
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_account_role_check'
  ) THEN
    ALTER TABLE user_account
      ADD CONSTRAINT user_account_role_check
      CHECK (role IN ('owner', 'member'));
  END IF;
END $$;

-- ---------- 2. user_account.status ----------
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_account_status_check'
  ) THEN
    ALTER TABLE user_account
      ADD CONSTRAINT user_account_status_check
      CHECK (status IN ('active', 'pending_approval', 'suspended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_account_tenant_status_idx
  ON user_account (tenant_id, status);

-- ---------- 3. tenant.membership_policy ----------
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS membership_policy TEXT NOT NULL DEFAULT 'invite_only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_membership_policy_check'
  ) THEN
    ALTER TABLE tenant
      ADD CONSTRAINT tenant_membership_policy_check
      CHECK (membership_policy IN ('open', 'invite_only', 'approval_required'));
  END IF;
END $$;

-- ---------- 4. Backfill: promote first user per tenant to owner ----------
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (tenant_id) id
    FROM user_account
    ORDER BY tenant_id, created_at ASC
  LOOP
    UPDATE user_account
    SET role = 'owner'
    WHERE id = rec.id
      AND role <> 'owner';
  END LOOP;
END $$;

-- ---------- 5. member_event audit table ----------
CREATE TABLE IF NOT EXISTS member_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('approved', 'rejected', 'suspended', 'role_changed', 'removed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_event_tenant_target_created_idx
  ON member_event (tenant_id, target_user_id, created_at DESC);

ALTER TABLE member_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_event FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_event'
      AND policyname = 'member_event_tenant_isolation'
  ) THEN
    CREATE POLICY member_event_tenant_isolation
      ON member_event
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;
