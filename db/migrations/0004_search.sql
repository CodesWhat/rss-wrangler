-- Full-text search support on item table

-- Add tsvector column for full-text search
ALTER TABLE item ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS item_search_vector_idx ON item USING gin (search_vector);

-- Trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION item_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.summary, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, summary ON item
  FOR EACH ROW
  EXECUTE FUNCTION item_search_vector_update();

-- Backfill existing rows
UPDATE item SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, ''));
