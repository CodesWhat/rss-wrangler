-- Phase 0 slice: strict tenant isolation via PostgreSQL Row-Level Security (RLS).
-- This is defense-in-depth on top of tenant-scoped app queries.
--
-- Policy source of truth:
--   app.current_tenant_id() reads `app.tenant_id` session setting.
--   If unset/invalid, it falls back to the default self-host tenant ID.
--
-- NOTE:
--   With FORCE RLS enabled below, application/service roles must set `app.tenant_id`
--   for non-default tenants before running tenant-scoped queries.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_tenant TEXT;
BEGIN
  raw_tenant := current_setting('app.tenant_id', true);

  IF raw_tenant IS NULL OR btrim(raw_tenant) = '' THEN
    RETURN '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  RETURN raw_tenant::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN '00000000-0000-0000-0000-000000000001'::uuid;
END;
$$;

-- Enable + force RLS across tenant-aware tables.
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'tenant',
    'user_account',
    'auth_session',
    'app_settings',
    'feed',
    'item',
    'cluster',
    'cluster_member',
    'read_state',
    'filter_rule',
    'filter_event',
    'event',
    'digest',
    'topic',
    'feed_topic',
    'annotation',
    'push_subscription'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Tenant table policy: only current tenant row is visible/mutable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation
      ON tenant
      USING (id = app.current_tenant_id())
      WITH CHECK (id = app.current_tenant_id());
  END IF;
END $$;

-- Standard tenant_id policy for tenant-scoped tables.
DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'user_account',
    'auth_session',
    'app_settings',
    'feed',
    'item',
    'cluster',
    'cluster_member',
    'read_state',
    'filter_rule',
    'filter_event',
    'event',
    'digest',
    'topic',
    'feed_topic',
    'annotation',
    'push_subscription'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    policy_name := tbl || '_tenant_isolation';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
        policy_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;
