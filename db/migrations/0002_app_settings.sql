CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
