CREATE TABLE annotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  highlighted_text TEXT NOT NULL,
  note TEXT,
  color VARCHAR(20) DEFAULT 'yellow',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_annotation_cluster ON annotation(cluster_id);
