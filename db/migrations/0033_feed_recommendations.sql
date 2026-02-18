-- Feed recommendations: AI-suggested feeds from the directory based on user topic interests

CREATE TABLE IF NOT EXISTS feed_recommendation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  feed_directory_id UUID NOT NULL REFERENCES feed_directory(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, feed_directory_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_recommendation_tenant_score
  ON feed_recommendation (tenant_id, score DESC);
