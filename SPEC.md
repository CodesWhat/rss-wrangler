# Self-Hosted RSS Reader with Auto Folders, Dedup, and Smart Digests (PWA + Synology + Tailscale)

## 0) Summary

A single-user, self-hosted RSS reader that:

- runs on Synology via Docker
- is accessed over Tailscale (PWA)
- auto-sorts feeds into auto folders (simple categories, not manual folderizing)
- dedups “same story across outlets” into one story card
- supports mute-with-breakout filtering (e.g., “hide Roblox unless it’s a major incident”)
- generates AI summaries + digests and learns ranking from your behavior

## 1) Goals

- Replace Feedly for daily reading.
- Minimal mental overhead: Folders are automatic and simple.
- Collapse duplicates across outlets into one view.
- Fast catch-up: digest mode when you’re away or behind.
- Preference learning: sort what you’ll likely care about higher.
- Maintain good UX: always show headline + hero image + source.

## 2) Non-goals (v1)

- Multi-user accounts
- Push notifications
- Full offline archive of every article body
- Perfect extraction for all paywalled sites

## 3) Deployment constraints

- Host: Synology NAS
- Runtime: Docker Compose
- Network: Tailscale (private access)
- Single user (you), single device priority (iPhone), but works on desktop browser too

### 3.1 Initial stack decisions

- Frontend: Next.js PWA (TypeScript)
- Backend API: Node.js + Fastify (TypeScript)
- Worker: Node.js (TypeScript)
- Queue/jobs: Postgres-backed jobs via `pg-boss` in MVP1 (no Redis required)
- Database: Postgres latest stable major at deployment time
- Vector extension: no `pgvector` in MVP1
- AI default provider: OpenAI

Rationale:

- Use one language across web, API, and worker to reduce maintenance overhead.
- Keep a single repo with clearly separated services and shared contracts/types.

Suggested repository structure:

- `apps/web` (Next.js PWA, TypeScript)
- `apps/api` (Fastify HTTP API, TypeScript)
- `apps/worker` (polling, extraction, clustering, digests; TypeScript)
- `packages/contracts` (shared schemas/types and generated API client)
- `infra` (docker-compose, env templates, deployment scripts)
- `db` (migrations, seed data)

### 3.2 Python adoption gates (deferred path)

Add a Python sidecar only if TypeScript implementation misses quality targets for two consecutive weeks after tuning:

- extraction success rate for priority sources < 90%
- cluster correction rate (manual split requests) > 12%
- worker CPU saturation causes p95 ingest latency to exceed configured target

### 3.3 Backup policy (recommended)

- Nightly Postgres backup (`pg_dump` custom format)
- Retention: 7 daily + 4 weekly snapshots
- Store backups on NAS volume with optional encrypted off-device sync
- Run a restore verification at least monthly

## 4) UX Spec (PWA)

### 4.1 Navigation

- Home (All Stories)
- Folders (Auto folders tabs/list)
- Digest
- Saved
- Sources (manage feeds)
- Settings

### 4.2 Home (primary view)

Infinite scroll list of Story Cards (clusters)

Sort options:

- For You (default: personal score with recency floor)
- Latest (strict reverse chronological)

Card fields:

- headline
- hero image
- primary source name + time
- “+N outlets” (cluster size)
- folder label
- optional AI “1–2 sentence summary”
- optional badge: “Muted topic breakout” (with reason)

Card actions:

- Open (cluster detail)
- Save
- Mark read
- “Not interested”
- “Mute keyword…” (creates a mute rule)
- “Prefer this source” (source weight +)
- “Mute this source”

### 4.3 Cluster detail

Header: headline + hero + primary source

Sections:

- AI “Story so far” summary (optional)
- Outlets list (members): each opens the article view

Actions:

- Save cluster
- Mark read
- Split cluster (escape hatch)
- Mute keyword/topic extracted from title (quick creation)

### 4.4 Article view (in-app)

- Render via reader mode (extracted text) when available
- Fallback: embedded page view
- If embed is blocked by site CSP/X-Frame headers, show a clear "Open original" action

Capture analytics:

- time on article view
- scroll depth
- quick bounce (<10–15s)

### 4.5 Digest view

Trigger banner on Home when conditions met (“You were away… View digest”)

Digest sections:

- Top picks for you
- Big stories (most outlets / high-rep sources)
- Quick scan (one-liners)

Tap entry → cluster detail

### 4.6 Saved

- List of saved clusters
- Sort by saved date; optional folder filter

### 4.7 Sources

List feeds with:

- assigned folder (single)
- “trial” flag (optional)
- weight slider (Prefer / Neutral / Deprioritize)

Actions:

- Add feed URL
- OPML import

On add: prompt “I categorized this as Gaming. Change?”

### 4.8 Settings

AI mode:

- Off
- Summaries + digest
- Full (summaries + auto foldering assist + smart ranking)

Digest triggers (defaults):

- Away ≥ 24h OR backlog ≥ 50 clusters

Retention: see section 10

Filters: manage mute rules

Provider selection: OpenAI / Claude / Local

AI budget cap:

- Monthly cap is configurable (default $20)
- On cap hit: fallback to local model only when local provider is configured
- If local provider is not configured, fallback option is not selectable and hosted AI is paused until reset

Feed polling:

- Poll interval is configurable (default 60 minutes)

## 5) Auto Folders (simple, site-first)

### 5.1 Folder list

Default folders (editable but keep small):

- Tech
- Gaming
- Security
- Business
- Politics
- Sports
- Design
- Local
- World
- Other

### 5.2 Feed → folder assignment (on add)

Inputs:

- feed title/description
- site title/description (if available)
- sample of last 10 titles

Process:

- Rules/keywords classifier (fast)
- If AI enabled, LLM classifier as tie-breaker
- Prompt user with suggestion + dropdown override

Store:

- feed.folder_id
- feed.folder_confidence

### 5.3 Drift detection (optional, weekly)

Weekly job samples last 30 items:

- if >35% classify to a different folder → prompt:
  - “This feed looks more like Tech lately. Move it?”

Actions: Keep / Move / Create folder (rare)

Note: This is the only “ask me if shifts” behavior; no constant reorg.

## 6) Dedup: story clustering across outlets

### 6.1 Definition

A cluster represents one story covered by multiple outlets.

### 6.2 Inputs (per item)

- canonical_url
- title
- summary/excerpt
- extracted snippet (if available)
- published timestamp
- folder inherited from feed (site-first)

### 6.3 Clustering algorithm (v1)

Time-windowed near-duplicate matching (48h window):

Candidate selection: items within 48h, same language

Similarity score:

- title simhash distance
- token Jaccard overlap
- optional embedding cosine (if AI mode full)

Decision:

- if score ≥ threshold → join cluster
- else create new cluster

Representative item selection:

- highest source weight
- else most complete extracted text
- else earliest

### 6.4 Folder assignment for clusters

To keep UI simple:

- cluster folder = representative item’s feed folder

### 6.5 Escape hatch

“Split cluster”:

- creates a new cluster and moves selected members
- logs a correction event (can tune thresholds later)

## 7) Filtering: “Mute with breakout”

### 7.1 Filter types

- Mute (default): hide matches unless breakout triggers
- Hard block: never show (rare)

### 7.2 Matching scope

Pre-filter on title + feed summary

Post-cluster filter on representative’s title + summary + extracted snippet

This prevents leaks from other outlets.

Muted matches are soft-hidden before clustering, not dropped. They still participate in clustering and breakout checks.

### 7.3 Breakout logic

If a mute rule matches, allow through when any of:

- Severity keywords appear (e.g., hack/breach/0day/arrest/DOJ/CISA/state-backed/outage/porn)
- Source is “high reputation” list (user-configurable)
- Cluster size ≥ N outlets within 24h (default N=4)

Cluster size for breakout includes outlets that are muted/hidden by the same rule.

If allowed through:

- badge story as “Muted topic breakout” + reason

### 7.4 Example

Rule: keyword="roblox", mode=mute

Normal Roblox content hidden

“Roblox hacked…” passes due to severity keyword + cluster size

## 8) AI Features (optional but supported)

### 8.1 Provider abstraction (switchable)

Define interface:

- embed(texts[]) -> vectors[]
- summarize(text, style) -> summary
- classify(text, labels[]) -> label/confidence

Implement providers:

- OpenAI
- Anthropic (Claude)
- Local (Ollama / llama.cpp)

Routing:

- embeddings: local or cheapest
- summaries/digest: hosted by default
- classification for folders: hosted only when uncertain

Config:

- AI_PROVIDER=openai|anthropic|local
- optional per-task overrides

### 8.2 Summaries

Generate per cluster:

- 1–2 sentence “card summary”
- longer “story so far” in cluster detail

Cache and regenerate only when cluster materially changes.

Sensitive handling:

- if headline indicates sensitive content, generate a short sanitized summary or skip.

### 8.3 Personalized ranking (v1)

Goal: order clusters by “you’ll likely care”.

Signals:

- recency decay
- folder affinity (learned)
- source weight
- engagement history (opens, dwell, scroll, saves, not interested)
- diversity penalty (avoid same folder/source repeating)

Start with heuristic scoring; later upgrade to a lightweight learned model.

Ranking guardrails:

- Add exploration quota to avoid permanent starvation of low-ranked stories
- Always provide a user-visible sort toggle (`For You` and `Latest`)

## 9) Recommendations: new outlets (optional v2)

- Suggest-only initially (no auto-add)
- Based on folders you read + sources you prefer
- Trial feeds: add 1–3 per week if enabled, easy remove
- Promote/demote based on engagement

## 10) Retention and states

### 10.1 States

- Unread
- Read (hidden)
- Saved (persist)

### 10.2 Policy

- Keep Unread until read or older than max-age (optional default: no max)
- When marked Read:
  - hide from UI immediately
  - keep lightweight record for ranking + dedup memory
  - purge extracted text after N days (default 14–30) to save space
- Saved:
  - keep indefinitely
  - keep metadata + canonical link only (no guaranteed full text retention)

## 11) Hero images + metadata (must-have)

### 11.1 Item-level extraction order

- RSS media fields (media:content, media:thumbnail, enclosure)
- Article HTML meta (og:image, twitter:image)
- Fallback: first large image in extracted content

Store:

- hero_image_url
- optionally hero_image_cached_path (download/cache)

### 11.2 Cluster-level hero

- Use representative item’s hero; fallback to first available among members.

## 12) Data Model (minimum tables)

Core

- folder(id, name)
- feed(id, url, title, site_url, folder_id, folder_confidence, weight, muted, created_at, last_polled_at, etag, last_modified)
- item(id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url, extracted_text, extracted_at)
- cluster(id, rep_item_id, folder_id, created_at, updated_at, size)
- cluster_member(cluster_id, item_id, added_at)
- read_state(cluster_id, read_at, saved_at)

Auth

- user_account(id, username, password_hash, created_at, last_login_at)
- auth_session(id, user_id, refresh_token_hash, created_at, expires_at, last_seen_at, revoked_at)

Filtering

- filter_rule(id, pattern, type=phrase|regex, mode=mute|block, breakout_enabled, created_at)
- filter_event(rule_id, cluster_id, action=hidden|breakout_shown, ts)

Analytics

- event(id, ts, type, payload_json) (batched from PWA)

Digests

- digest(id, created_at, start_ts, end_ts, title, body, entries_json)

### 12.1 Constraints and idempotency requirements

- `feed.url_normalized` unique
- `item` unique on (`feed_id`, `guid`) when guid exists
- fallback uniqueness for guid-less entries: (`feed_id`, `canonical_url`, `published_at`)
- `cluster_member` unique on (`cluster_id`, `item_id`)
- `read_state.cluster_id` is primary key
- `event` accepts client `idempotency_key` to dedupe retries

## 13) Pipeline

### 13.1 Worker stages

- Poll feeds (conditional GET)
- Parse items → upsert
- Canonicalize URL
- Pre-filter soft gate (mute/block) using title+summary
- Selective extraction (policy-based)
- Compute features (simhash; embeddings if enabled)
- Cluster assignment
- Post-cluster filter (mute-with-breakout)
- Summary generation (optional)
- Digest generation (if triggers met)

### 13.2 Reliability policy

- Retries with exponential backoff for poll/extract/AI stages
- Stage timeouts and per-feed circuit breaker
- Dead-letter queue/table for repeated failures
- Structured error logging with feed/item identifiers

### 13.3 Selective extraction policy (default)

Extract if any:

- summary missing or < N chars (e.g., 280)
- title matches generic patterns (“briefing”, “top stories”, “update”)
- item becomes cluster representative
- source weight is high

## 14) Digest triggers

Default triggers:

- Away ≥ 24h OR backlog ≥ 50 unread clusters

Manual “Generate digest now”

Away is defined from `last_active_at`, updated on app foreground and interaction events.

Digest generation:

- rank clusters
- produce multi-section digest
- cache for the session/day

## 15) API (v1)

- GET /v1/clusters?folder_id=&cursor=&limit=&state=unread|saved|all&sort=personal|latest
- GET /v1/clusters/{id}
- POST /v1/clusters/{id}/read
- POST /v1/clusters/{id}/save
- POST /v1/clusters/{id}/split
- POST /v1/clusters/{id}/feedback (not_interested, split_request)
- GET /v1/folders
- GET /v1/feeds
- POST /v1/feeds (add)
- PATCH /v1/feeds/{id} (folder, weight, muted, trial)
- POST /v1/opml/import
- GET /v1/filters
- POST /v1/filters
- PATCH /v1/filters/{id}
- DELETE /v1/filters/{id}
- GET /v1/digests
- POST /v1/events (batch)
- GET /v1/settings
- POST /v1/settings
- POST /v1/auth/login
- POST /v1/auth/logout
- POST /v1/auth/refresh

Auth:

- single-user login (password) with access + refresh tokens

## 16) Docker Compose (components)

- web (Next.js PWA)
- api (Node.js Fastify)
- worker (Node.js polling + processing)
- postgres (recommended)
- optional redis (future caching/rate-limit use, not required for MVP1)

## 17) MVP milestones

MVP1: Replacement

- OPML import + add feed
- Auto folder assignment prompt
- Story clustering
- Home + Cluster detail + Saved
- Login screen + single-user auth session
- Sort toggle: For You / Latest
- Hero images
- Read/hide behavior
- Pre/post filters (mute-with-breakout)

MVP2: Catch-up

- Digest view + triggers
- AI summaries (provider switchable)

MVP3: Your algorithm

- Preference learning ranking improvements
- Recommendations (trial feeds)

## 18) Defaults you asked for (locked)

- Auto folders = site-first, one folder per feed, minimal UI concepts
- Dedup = cluster stories across outlets
- Roblox-like filtering = mute-with-breakout
- Hero image + headline always captured and stored
- Retention = unread persists; read hidden but lightweight history kept; saved persists

## 19) Interview decisions captured

- Chosen stack direction: TypeScript-only (Next.js + Fastify + Node worker)
- Queue recommendation accepted: Postgres-backed jobs first (`pg-boss`)
- DB recommendation accepted: latest stable Postgres major
- `pgvector` deferred
- OpenAI is default provider
- AI monthly budget cap starts at `$20` and is configurable
- Auth model is login screen (single user)
- Ranking default is personal score with sort fallback to latest
- Muted stories still count for breakout conditions
- Polling interval is configurable; default 60 minutes with conditional GET and backoff
- Saved entries retain metadata + canonical link only
- Python is deferred unless quality gates in section 3.2 fail

If you want next, I can output:

- the exact filter rule JSON schema + starter severity keyword list,
- a Postgres schema (DDL),
- and a Synology-friendly docker-compose.yml skeleton.
