CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS folder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  url_normalized TEXT NOT NULL,
  title TEXT NOT NULL,
  site_url TEXT,
  folder_id UUID NOT NULL REFERENCES folder(id),
  folder_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  weight TEXT NOT NULL DEFAULT 'neutral' CHECK (weight IN ('prefer', 'neutral', 'deprioritize')),
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  trial BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  etag TEXT,
  last_modified TEXT,
  CONSTRAINT feed_url_normalized_uniq UNIQUE (url_normalized)
);

CREATE TABLE IF NOT EXISTS item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES feed(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  author TEXT,
  guid TEXT,
  hero_image_url TEXT,
  extracted_text TEXT,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS item_feed_guid_uniq
  ON item (feed_id, guid)
  WHERE guid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS item_feed_canonical_published_uniq
  ON item (feed_id, canonical_url, published_at)
  WHERE guid IS NULL;

CREATE TABLE IF NOT EXISTS cluster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_item_id UUID REFERENCES item(id) ON DELETE SET NULL,
  folder_id UUID NOT NULL REFERENCES folder(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size INTEGER NOT NULL DEFAULT 1 CHECK (size >= 1)
);

CREATE INDEX IF NOT EXISTS cluster_folder_idx ON cluster (folder_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cluster_member (
  cluster_id UUID NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cluster_id, item_id)
);

CREATE TABLE IF NOT EXISTS read_state (
  cluster_id UUID PRIMARY KEY REFERENCES cluster(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  not_interested_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS filter_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('phrase', 'regex')),
  mode TEXT NOT NULL CHECK (mode IN ('mute', 'block')),
  breakout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS filter_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES filter_rule(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('hidden', 'breakout_shown')),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  ts TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entries_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS user_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth_session (user_id, expires_at DESC);

INSERT INTO folder (id, name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tech'),
  ('22222222-2222-2222-2222-222222222222', 'Gaming'),
  ('33333333-3333-3333-3333-333333333333', 'Security'),
  ('44444444-4444-4444-4444-444444444444', 'Business'),
  ('55555555-5555-5555-5555-555555555555', 'Politics'),
  ('66666666-6666-6666-6666-666666666666', 'Sports'),
  ('77777777-7777-7777-7777-777777777777', 'Design'),
  ('88888888-8888-8888-8888-888888888888', 'Local'),
  ('99999999-9999-9999-9999-999999999999', 'World'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Other')
ON CONFLICT (id) DO NOTHING;
