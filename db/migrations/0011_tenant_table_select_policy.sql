-- Phase 0 slice: allow tenant enumeration for internal worker scheduling.
-- We keep write isolation strict to current tenant context, but SELECT on
-- tenant rows is allowed so the worker can iterate tenants and then switch
-- `app.tenant_id` per job/session.

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant'
      AND policyname = 'tenant_select_all'
  ) THEN
    CREATE POLICY tenant_select_all
      ON tenant
      FOR SELECT
      USING (TRUE);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant'
      AND policyname = 'tenant_insert_isolation'
  ) THEN
    CREATE POLICY tenant_insert_isolation
      ON tenant
      FOR INSERT
      WITH CHECK (
        app.current_tenant_id() = '00000000-0000-0000-0000-000000000001'::uuid
        OR id = app.current_tenant_id()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant'
      AND policyname = 'tenant_update_isolation'
  ) THEN
    CREATE POLICY tenant_update_isolation
      ON tenant
      FOR UPDATE
      USING (id = app.current_tenant_id())
      WITH CHECK (id = app.current_tenant_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant'
      AND policyname = 'tenant_delete_isolation'
  ) THEN
    CREATE POLICY tenant_delete_isolation
      ON tenant
      FOR DELETE
      USING (id = app.current_tenant_id());
  END IF;
END $$;
