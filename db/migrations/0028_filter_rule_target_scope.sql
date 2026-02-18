-- Add target, feed_id, folder_id columns and expand mode check to include 'keep'
-- These columns are referenced by the worker filter pipeline but were never migrated.

ALTER TABLE filter_rule ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'keyword';
ALTER TABLE filter_rule ADD COLUMN IF NOT EXISTS feed_id UUID REFERENCES feed(id) ON DELETE CASCADE;
ALTER TABLE filter_rule ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folder(id) ON DELETE CASCADE;

-- Expand mode check to include 'keep' (allow-list mode)
ALTER TABLE filter_rule DROP CONSTRAINT IF EXISTS filter_rule_mode_check;
ALTER TABLE filter_rule ADD CONSTRAINT filter_rule_mode_check CHECK (mode IN ('mute', 'block', 'keep'));

CREATE INDEX IF NOT EXISTS filter_rule_feed_idx ON filter_rule (feed_id) WHERE feed_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS filter_rule_folder_idx ON filter_rule (folder_id) WHERE folder_id IS NOT NULL;
