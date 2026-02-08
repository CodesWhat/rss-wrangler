-- Phase 0 slice: tenant foundation for hosted SaaS support.
-- This migration establishes tenant primitives for auth/session/settings.

CREATE TABLE IF NOT EXISTS tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenant (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default Tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default Tenant')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE user_account ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE user_account
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE user_account ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE user_account ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_account_tenant_fk'
  ) THEN
    ALTER TABLE user_account
      ADD CONSTRAINT user_account_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE user_account DROP CONSTRAINT IF EXISTS user_account_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_account_tenant_username_uniq
  ON user_account (tenant_id, username);

CREATE INDEX IF NOT EXISTS user_account_tenant_idx
  ON user_account (tenant_id);

ALTER TABLE auth_session ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE auth_session s
SET tenant_id = u.tenant_id
FROM user_account u
WHERE s.user_id = u.id
  AND s.tenant_id IS NULL;

UPDATE auth_session
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

ALTER TABLE auth_session ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE auth_session ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_session_tenant_fk'
  ) THEN
    ALTER TABLE auth_session
      ADD CONSTRAINT auth_session_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS auth_session_tenant_user_idx
  ON auth_session (tenant_id, user_id, expires_at DESC);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE app_settings
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE app_settings ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE app_settings ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_settings_tenant_fk'
  ) THEN
    ALTER TABLE app_settings
      ADD CONSTRAINT app_settings_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_settings_tenant_key_pkey'
  ) THEN
    ALTER TABLE app_settings
      ADD CONSTRAINT app_settings_tenant_key_pkey
      PRIMARY KEY (tenant_id, key);
  END IF;
END $$;
