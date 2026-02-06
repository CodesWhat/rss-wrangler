-- Performance indexes for common query patterns

-- Speed up cluster_member lookups by item_id (used in N+1 check and pipeline)
CREATE INDEX IF NOT EXISTS cluster_member_item_idx ON cluster_member (item_id);

-- Speed up time-window queries on item.published_at (clustering candidates)
CREATE INDEX IF NOT EXISTS item_published_at_idx ON item (published_at DESC);

-- Speed up saved-items queries (WHERE saved_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS read_state_saved_idx ON read_state (saved_at) WHERE saved_at IS NOT NULL;

-- Speed up unread-items queries (WHERE read_at IS NULL)
CREATE INDEX IF NOT EXISTS read_state_unread_idx ON read_state (read_at) WHERE read_at IS NULL;
