-- Add last_active_at column to tenant table for digest "away" trigger.
-- Updated by the API on authenticated requests (debounced to every 5 minutes).
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Backfill existing rows so they don't immediately trigger the away digest.
UPDATE tenant SET last_active_at = NOW() WHERE last_active_at IS NULL;
