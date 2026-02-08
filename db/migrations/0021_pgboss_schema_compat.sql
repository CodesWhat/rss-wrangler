-- pg-boss v12 migration paths expect schema version 25+.
-- If an older or partial pgboss schema is present, drop it so worker startup can recreate it.
DO $$
DECLARE
  pgboss_version integer;
  version_table regclass;
  job_common_table regclass;
BEGIN
  version_table := to_regclass('pgboss.version');
  job_common_table := to_regclass('pgboss.job_common');

  IF version_table IS NULL THEN
    RETURN;
  END IF;

  SELECT version
  INTO pgboss_version
  FROM pgboss.version
  ORDER BY version DESC
  LIMIT 1;

  IF pgboss_version IS NULL OR pgboss_version < 25 OR job_common_table IS NULL THEN
    RAISE NOTICE 'dropping incompatible pgboss schema (version=%); worker will recreate latest schema', pgboss_version;
    EXECUTE 'DROP SCHEMA IF EXISTS pgboss CASCADE';
  END IF;
END
$$;
