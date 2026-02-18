-- Sponsored placement cards and event tracking

CREATE TABLE IF NOT EXISTS sponsored_placement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  image_url TEXT,
  target_url TEXT NOT NULL,
  cta_text TEXT NOT NULL DEFAULT 'Learn more',
  position INTEGER NOT NULL DEFAULT 3,
  active BOOLEAN NOT NULL DEFAULT true,
  impression_budget INTEGER,
  click_budget INTEGER,
  impressions_served INTEGER NOT NULL DEFAULT 0,
  clicks_served INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsored_placement_active
  ON sponsored_placement (tenant_id, active, position);

CREATE TABLE IF NOT EXISTS sponsored_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  placement_id UUID NOT NULL REFERENCES sponsored_placement(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsored_event_placement
  ON sponsored_event (placement_id, created_at DESC);
