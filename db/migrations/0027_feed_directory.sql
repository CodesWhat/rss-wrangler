-- Global feed directory for onboarding / discovery (not per-tenant)

CREATE TABLE IF NOT EXISTS feed_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  site_url TEXT,
  language TEXT DEFAULT 'en',
  popularity_rank INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_directory_category ON feed_directory(category);
