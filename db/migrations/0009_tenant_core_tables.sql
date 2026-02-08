-- Phase 0 slice: tenant scoping for core product tables.
-- Keeps existing IDs and data, then backfills tenant_id from parent records.

-- Shared constant default tenant id from 0008 migration.
-- 00000000-0000-0000-0000-000000000001

-- ---------- feed ----------
ALTER TABLE feed ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE feed
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE feed ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE feed ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_tenant_fk'
  ) THEN
    ALTER TABLE feed
      ADD CONSTRAINT feed_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE feed DROP CONSTRAINT IF EXISTS feed_url_normalized_uniq;
DROP INDEX IF EXISTS feed_url_normalized_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS feed_tenant_url_normalized_uniq
  ON feed (tenant_id, url_normalized);
CREATE INDEX IF NOT EXISTS feed_tenant_idx
  ON feed (tenant_id, created_at DESC);

-- ---------- item ----------
ALTER TABLE item ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE item i
SET tenant_id = f.tenant_id
FROM feed f
WHERE i.feed_id = f.id
  AND i.tenant_id IS NULL;
UPDATE item
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE item ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE item ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_tenant_fk'
  ) THEN
    ALTER TABLE item
      ADD CONSTRAINT item_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS item_feed_guid_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS item_tenant_feed_guid_uniq
  ON item (tenant_id, feed_id, guid)
  WHERE guid IS NOT NULL;

DROP INDEX IF EXISTS item_feed_canonical_published_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS item_tenant_feed_canonical_published_uniq
  ON item (tenant_id, feed_id, canonical_url, published_at)
  WHERE guid IS NULL;

CREATE INDEX IF NOT EXISTS item_tenant_published_idx
  ON item (tenant_id, published_at DESC);

-- ---------- cluster ----------
ALTER TABLE cluster ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE cluster c
SET tenant_id = i.tenant_id
FROM item i
WHERE c.rep_item_id = i.id
  AND c.tenant_id IS NULL;
UPDATE cluster
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE cluster ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE cluster ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cluster_tenant_fk'
  ) THEN
    ALTER TABLE cluster
      ADD CONSTRAINT cluster_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cluster_tenant_updated_idx
  ON cluster (tenant_id, updated_at DESC);

-- ---------- cluster_member ----------
ALTER TABLE cluster_member ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE cluster_member cm
SET tenant_id = c.tenant_id
FROM cluster c
WHERE cm.cluster_id = c.id
  AND cm.tenant_id IS NULL;
UPDATE cluster_member
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE cluster_member ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE cluster_member ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cluster_member_tenant_fk'
  ) THEN
    ALTER TABLE cluster_member
      ADD CONSTRAINT cluster_member_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS cluster_member_item_idx;
CREATE INDEX IF NOT EXISTS cluster_member_tenant_item_idx
  ON cluster_member (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS cluster_member_tenant_cluster_idx
  ON cluster_member (tenant_id, cluster_id);

-- ---------- read_state ----------
ALTER TABLE read_state ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE read_state rs
SET tenant_id = c.tenant_id
FROM cluster c
WHERE rs.cluster_id = c.id
  AND rs.tenant_id IS NULL;
UPDATE read_state
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE read_state ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE read_state ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'read_state_tenant_fk'
  ) THEN
    ALTER TABLE read_state
      ADD CONSTRAINT read_state_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS read_state_saved_idx;
CREATE INDEX IF NOT EXISTS read_state_tenant_saved_idx
  ON read_state (tenant_id, saved_at)
  WHERE saved_at IS NOT NULL;

DROP INDEX IF EXISTS read_state_unread_idx;
CREATE INDEX IF NOT EXISTS read_state_tenant_unread_idx
  ON read_state (tenant_id, read_at)
  WHERE read_at IS NULL;

-- ---------- filter_rule ----------
ALTER TABLE filter_rule ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE filter_rule
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE filter_rule ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE filter_rule ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'filter_rule_tenant_fk'
  ) THEN
    ALTER TABLE filter_rule
      ADD CONSTRAINT filter_rule_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS filter_rule_tenant_idx
  ON filter_rule (tenant_id, created_at DESC);

-- ---------- filter_event ----------
ALTER TABLE filter_event ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE filter_event fe
SET tenant_id = fr.tenant_id
FROM filter_rule fr
WHERE fe.rule_id = fr.id
  AND fe.tenant_id IS NULL;
UPDATE filter_event
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE filter_event ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE filter_event ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'filter_event_tenant_fk'
  ) THEN
    ALTER TABLE filter_event
      ADD CONSTRAINT filter_event_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS filter_event_tenant_cluster_idx
  ON filter_event (tenant_id, cluster_id, ts DESC);

-- ---------- event ----------
ALTER TABLE event ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE event
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE event ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE event ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_tenant_fk'
  ) THEN
    ALTER TABLE event
      ADD CONSTRAINT event_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE event DROP CONSTRAINT IF EXISTS event_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS event_tenant_idempotency_key_uniq
  ON event (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS event_tenant_ts_idx
  ON event (tenant_id, ts DESC);

-- ---------- digest ----------
ALTER TABLE digest ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE digest
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE digest ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE digest ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'digest_tenant_fk'
  ) THEN
    ALTER TABLE digest
      ADD CONSTRAINT digest_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS digest_tenant_created_idx
  ON digest (tenant_id, created_at DESC);

-- ---------- topic ----------
ALTER TABLE topic ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE topic
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE topic ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE topic ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'topic_tenant_fk'
  ) THEN
    ALTER TABLE topic
      ADD CONSTRAINT topic_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE topic DROP CONSTRAINT IF EXISTS topic_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS topic_tenant_name_uniq
  ON topic (tenant_id, name);
CREATE INDEX IF NOT EXISTS topic_tenant_idx
  ON topic (tenant_id, created_at DESC);

-- ---------- feed_topic ----------
ALTER TABLE feed_topic ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE feed_topic ft
SET tenant_id = f.tenant_id
FROM feed f
WHERE ft.feed_id = f.id
  AND ft.tenant_id IS NULL;
UPDATE feed_topic
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE feed_topic ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE feed_topic ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_topic_tenant_fk'
  ) THEN
    ALTER TABLE feed_topic
      ADD CONSTRAINT feed_topic_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS feed_topic_feed_idx;
CREATE INDEX IF NOT EXISTS feed_topic_tenant_feed_idx
  ON feed_topic (tenant_id, feed_id);

DROP INDEX IF EXISTS feed_topic_status_idx;
CREATE INDEX IF NOT EXISTS feed_topic_tenant_status_idx
  ON feed_topic (tenant_id, status);

-- ---------- annotation ----------
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE annotation a
SET tenant_id = c.tenant_id
FROM cluster c
WHERE a.cluster_id = c.id
  AND a.tenant_id IS NULL;
UPDATE annotation
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE annotation ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE annotation ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'annotation_tenant_fk'
  ) THEN
    ALTER TABLE annotation
      ADD CONSTRAINT annotation_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_annotation_cluster;
CREATE INDEX IF NOT EXISTS annotation_tenant_cluster_idx
  ON annotation (tenant_id, cluster_id, created_at DESC);

-- ---------- push_subscription ----------
ALTER TABLE push_subscription ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE push_subscription
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE push_subscription ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE push_subscription ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscription_tenant_fk'
  ) THEN
    ALTER TABLE push_subscription
      ADD CONSTRAINT push_subscription_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE push_subscription DROP CONSTRAINT IF EXISTS push_subscription_endpoint_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_tenant_endpoint_uniq
  ON push_subscription (tenant_id, endpoint);
CREATE INDEX IF NOT EXISTS push_subscription_tenant_idx
  ON push_subscription (tenant_id, created_at DESC);
