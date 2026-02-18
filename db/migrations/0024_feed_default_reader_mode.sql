-- Add default_reader_mode column to feed table
ALTER TABLE feed ADD COLUMN IF NOT EXISTS default_reader_mode TEXT DEFAULT NULL;
