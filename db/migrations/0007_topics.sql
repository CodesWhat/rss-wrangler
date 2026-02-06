-- 1. Create topic table (replaces folder)
CREATE TABLE IF NOT EXISTS topic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Feed-topic junction with approval workflow
CREATE TABLE IF NOT EXISTS feed_topic (
  feed_id UUID NOT NULL REFERENCES feed(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (feed_id, topic_id)
);
CREATE INDEX IF NOT EXISTS feed_topic_feed_idx ON feed_topic (feed_id);
CREATE INDEX IF NOT EXISTS feed_topic_status_idx ON feed_topic (status);

-- 3. Add topic_id to cluster (nullable = Uncategorized)
ALTER TABLE cluster ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topic(id);
CREATE INDEX IF NOT EXISTS cluster_topic_idx ON cluster (topic_id, updated_at DESC);

-- 4. Add classification_status to feed
ALTER TABLE feed ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (classification_status IN ('pending_classification', 'classified', 'approved'));

-- 5. Migrate existing folder data to topics
INSERT INTO topic (id, name, created_at)
SELECT id, name, NOW() FROM folder
ON CONFLICT DO NOTHING;

-- 6. Copy cluster.folder_id -> cluster.topic_id
UPDATE cluster SET topic_id = folder_id WHERE topic_id IS NULL;

-- 7. Migrate existing feed folder assignments as approved feed_topics
INSERT INTO feed_topic (feed_id, topic_id, status, confidence, proposed_at, resolved_at)
SELECT f.id, f.folder_id, 'approved', f.folder_confidence, NOW(), NOW()
FROM feed f
WHERE f.folder_id IS NOT NULL
ON CONFLICT (feed_id, topic_id) DO NOTHING;

-- 8. Create "Uncategorized" topic
INSERT INTO topic (name) VALUES ('Uncategorized')
ON CONFLICT (name) DO NOTHING;
