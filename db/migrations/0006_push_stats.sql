-- Push notification subscriptions
CREATE TABLE push_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stats: add dwell tracking columns to read_state
ALTER TABLE read_state ADD COLUMN IF NOT EXISTS dwell_seconds INTEGER DEFAULT 0;
ALTER TABLE read_state ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
