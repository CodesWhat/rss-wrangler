# RSS Feed Discovery + Directory Backend

> Created: 2026-02-07

---

## Overview

Full feed discovery engine: URL → candidates → canonical feed, backed by a directory database with health checks and search. Directory bootstrapped via one-time DB seed from curated feed list.

**Design:** Self-hosted first, SaaS-ready. Everything core built in-house. Free services only as fallback/bootstrap.

---

## What We Already Have

| Component | Status | Details |
|-----------|--------|---------|
| URL normalization | Partial | Lowercases host, strips trailing slash. Missing: protocol-agnostic, query param sorting |
| SSRF protection | Complete | Blocks localhost, private IPs, non-HTTP(S) |
| Conditional GET | Complete | ETag + Last-Modified on every poll |
| Static feed directory | Working | 500+ curated feeds in JSON, client-side search |
| LLM topic classification | Working | OpenAI classifies feeds on add, approval workflow |
| Feed deduplication | Working | GUID-based + canonical URL fallback |

---

## What We Need to Build

### 1. Feed Discovery Engine

Input: anything (homepage URL, post URL, feed URL, newsletter platform URL)
Output: validated candidate feeds + chosen canonical + metadata

#### Candidate Extraction Methods
- HTML `<link rel="alternate" type="application/rss+xml|application/atom+xml|application/json+feed">`
- HTTP `Link:` headers
- Guess common paths: `/feed`, `/rss`, `/atom`, `/index.xml`, `/feed.xml`, `/rss.xml`, etc.
- Scan page anchors for obvious feed links (`rss`, `atom`, `xml`, `feed`)
- Provider adapters for known no-RSS sites (e.g., generate RSSHub route candidates, then validate output feed URL like any other candidate)

#### Validation
- Fetch candidate feed URL
- Parse to confirm RSS/Atom/JSON Feed
- Extract title/description/siteUrl and sample items

#### Canonical Selection (Scoring)
Store ALL candidates, choose ONE canonical by deterministic scoring:
- Autodiscovery-tag feeds = highest confidence
- Prefer same-domain siteUrl and item links
- Penalize non-main feeds (comments/search/tag/category) unless user requested
- Prefer "main feed" over deep category/tag feeds by default

### 2. Directory Database

New tables (extends existing schema):

#### sites
- `input_url` — what user typed
- `canonical_url` — after redirects
- `domain`
- `title`, `favicon`
- `last_discovered_at`

#### feed_candidates
- `site_id` + `candidate_url` (unique)
- `discovered_from` (html|headers|guess|platform|external)
- `score`
- `validation_status` + `last_error`

#### feeds (extend existing)
Add to current `feed` table:
- `site_id` FK
- `format` (rss/atom/jsonfeed)
- `is_canonical`, `canonical_score`
- `last_success_at`, `last_attempt_at`, `last_http_status`
- `consecutive_failures`, `next_check_at`
- `state` (healthy/degraded/unhealthy/paused)
- `latest_item_published_at`, `avg_update_interval`
- `language`

#### recent_items (optional, light)
- Last N titles + URLs per feed for search relevance and freshness

### 3. Health State Machine

States: healthy / degraded / unhealthy / paused

Driven by:
- Fetch success/failure
- Freshness (latest item date)
- Revive logic on repeated failure

#### Backoff Scheduling
- Healthy: normal cadence (derived from observed update interval)
- Degraded: exponential backoff (minutes → hours)
- Unhealthy: daily → weekly checks
- Paused: manual only

#### Freshness vs Dead
- Feeds can be "healthy" but "stale"
- Stale influences ranking/search, does NOT auto-delete

#### Revive Logic
- On repeated failure or 404/410, re-run discovery on site homepage
- Swap canonical feed if a better/new valid one is found

### 4. Directory Seeding (Bootstrap)

**Simplified approach (locked decision):** One-time DB seed from existing `feed-directory.json` (500+ curated feeds). Directory grows organically as users add feeds. No pack builder pipeline, no signed manifests, no cron sync.

#### Seed Source
- Existing `feed-directory.json` in the repo (curated feeds across categories)
- Import as a migration or bootstrap script (idempotent upsert)
- Do NOT import volatile fetch state (etag, last_modified, next_check) — instance learns health over time

#### Future Expansion (if needed)
- Curated OPML bundles from community sources (awesome-rss-feeds, Feed-RSS, awesome-tech-rss)
- Only build pack infrastructure if organic growth proves insufficient

### 5. Search Over Directory

#### Index Fields
- Feed title, site title, description, language, domain
- Recent item titles (small window)

#### Ranking Signals
- Keyword relevance
- Prefer canonical
- Prefer healthy
- Prefer not-stale

#### Implementation
- Start with Postgres FTS (tsvector/tsquery)
- Add OpenSearch when needed for scale

---

## Worker Jobs

### discover_site(url)
1. Normalize URL
2. Parse HTML autodiscovery tags
3. Guess common feed paths
4. Validate candidates
5. Pick canonical
6. Store candidates + feeds

### refresh_feed(feed_id)
1. Conditional GET with ETag/Last-Modified (already implemented)
2. Parse on 200
3. Update health state and recent items
4. Exponential backoff on failure

### revive_feed(feed_id)
1. Triggered after repeated failures
2. Rerun discovery on site homepage / canonical URL
3. Swap canonical feed if better/new valid one found

---

## SaaS-Ready Design

- Support `tenant_id` fields (NULL for self-hosted)
- Directory data can be global or tenant-scoped
- User data always tenant-scoped
- Pack model works for both: self-hosted downloads packs, SaaS tenants share global directory

### Future SaaS Shapes
- **Shape A:** Full Reader Backend-as-a-Service (discover + directory + managed refresh + webhooks)
- **Shape B:** Directory + Discovery API only (lighter, less I/O)
- **Shape C:** Hybrid + BYO egress (sell signed packs, customers host in their storage)

---

## Implementation Priority

This maps to multiple phases in the roadmap:

1. **Feed health states + backoff** → Phase 7 (Pipeline Reliability) — already planned
2. **Discovery engine** → New work in Phase 4 (Content Sources) — enhance feed adding
3. **Directory seeding** → Phase 4 (Content Sources) — one-time DB seed from feed-directory.json, organic growth after
4. **Sites + candidates tables** → Schema migration, part of discovery engine
5. **Revive logic** → Part of Phase 7 (Pipeline Reliability)

### Roadmap Lock (Decisions)

- **Directory seeding simplified**: One-time DB seed from existing `feed-directory.json`. No pack builder pipeline. Organic growth after seed. (Pack infrastructure only if organic growth proves insufficient.)
- **Feed discovery**: Sync with timeout (3-5s results, async fallback for slow sites). Phase 4 scope.
- **RSSHub**: Both public `rsshub.app` (default) + configurable private base URL in settings.
- **Feed revive logic**: Explicitly Phase 7 — repeated-failure trigger → rediscovery → canonical swap with audit trail.

---

## Open Questions

All major discovery questions resolved. No blocking open items.
