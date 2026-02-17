-- Add classified_at timestamp to feed for drift detection scheduling
ALTER TABLE feed ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Backfill: set classified_at to created_at for feeds that are already classified
UPDATE feed SET classified_at = created_at WHERE classification_status IN ('classified', 'approved') AND classified_at IS NULL;
