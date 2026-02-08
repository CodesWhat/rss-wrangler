# RSS Wrangler Competitive Roadmap

> Synthesized from competitive research on Feedly, Inoreader, NewsBlur, Miniflux, Reeder, Feedbin, The Old Reader, and FreshRSS.
> Generated: 2026-02-07

---

## Part 1: Competitive Feature Matrix

### Feed Management

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| RSS/Atom parsing | Yes | Yes | Yes | Yes (+ JSON Feed) | All | Implemented (rss-parser — unmaintained, swap to feedsmith planned Phase 1) |
| OPML import | Yes | Yes | Yes | Yes | Feedbin, FreshRSS | Implemented |
| OPML export | Yes | Yes | Yes | Yes | Feedbin, FreshRSS | Implemented |
| Feed auto-discovery from URL | Yes | Yes | Yes | Yes | Feedbin, FreshRSS | Implemented |
| Folder/category organization | Yes | Yes (hierarchical) | Yes (nested) | Yes | All | Implemented (via topics) |
| Feed search/discovery | 40M+ sources | 5M+ sources | Autocomplete + embeddings | No | The Old Reader | Missing |
| Feed health monitoring | No | Yes (stale/errored/engagement) | Yes (stats + fetch status) | No | FreshRSS (stats) | Missing |
| Per-feed view settings | Yes | Yes (3 levels) | Yes | No | -- | Missing |
| Drag-and-drop reorder | Yes | Yes | Yes | No | The Old Reader | Missing |
| Newsletter via email | Pro+ | Pro | Yes | No | Feedbin | Missing |
| YouTube channels | Yes | Yes | Yes | Yes (privacy-focused) | Feedbin | Missing |
| Podcast feeds | Yes | Yes (built-in player) | Yes (basic) | Yes (attachments) | Feedbin (Airshow) | Missing |
| Reddit/social feeds | Yes (Reddit, Twitter, Bluesky) | Yes (Reddit, Twitter, Mastodon, Bluesky) | No | No | Feedbin (Mastodon) | Missing |
| Web feed builder (no-RSS sites) | Pro+ (RSS Builder) | Pro (web feeds) | No | CSS selector scraper | FreshRSS (XPath) | Partial (manual RSSHub feed URLs work; no in-app generator flow yet) |
| Boosted/priority polling | No | Yes (10-min intervals) | Pro (5-15 min) | No | -- | Missing |
| Custom feed icons | No | No | Yes (emoji/icons/upload) | Favicon fetch | -- | Missing |

### Reading Experience

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Hero images on cards | Yes | Yes | Yes (Grid view) | No | Feedbin | Missing (data exists) |
| Multiple view layouts | 4 (title/magazine/card/compact) | 5 (list/expanded/card/column/magazine) | 4 (split/list/full/grid) | 1 (list) | FreshRSS (multiple) | Partial (3 layouts) |
| Reader mode / full-text extraction | Yes (Shift+V) | Yes (W key) | Yes (Text view) | Yes (Readability) | Feedbin | Missing |
| Article slider/panel view | Yes | Yes (column view) | Yes (split view) | No | -- | Missing |
| Inline article expand | Yes | Yes (expanded view) | Yes (full view) | Yes | -- | Missing |
| Cluster detail page | No (not applicable) | No | No | No | -- | Missing (API ready) |
| Mark as read on scroll | Yes (configurable) | Yes | Yes (configurable) | Yes | -- | Missing |
| Mark all as read | Yes (Shift+A, with time filter) | Yes (Shift+A) | Yes | Yes | All | Missing (bulk action) |
| Sort: newest/oldest | Yes | Yes | Yes | Yes | All | Implemented (For You / Latest) |
| Dark/light theme | Yes | Yes (+sepia, custom) | Yes | Yes (6 themes) | All | Implemented |
| Font/density customization | No | Yes (font, size, line height) | Yes (font, size, density) | No | FreshRSS (custom CSS) | Missing |
| Bionic reading | No | No | No | No | Reeder only | Skip |
| Text-to-speech | No | Yes (50+ languages) | No | No | -- | Skip |
| Article translation | No | Yes (Pro) | No | No | -- | Skip |
| Story change tracking / diffs | No | No | Yes | No | Feedbin | Skip |

### AI & Smart Features

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| AI article summaries | Pro+ (Leo) | Yes (Intelligence) | No | No | FreshRSS (extension) | Partial (AI mode only) |
| AI priority/topic ranking | Pro+ (Leo) | No | No | No | -- | Partial (recency only) |
| Multi-provider AI | No (proprietary) | No (proprietary) | Yes (model choice) | No | -- | Missing (OpenAI only) |
| Ask AI / conversational | Enterprise | Yes (Intelligence) | Premium Archive | No | -- | Missing |
| AI deduplication | Pro+ (85% threshold) | No | No | No | -- | Implemented (clustering) |
| Like-board / train-by-example | Pro+ | No | No | No | -- | Missing |
| Feed classification | No (manual folders) | No | No | No | -- | Implemented (LLM topics) |
| AI digest generation | Enterprise (newsletters) | Teams (email digests) | No | No | -- | Missing (stub, no LLM) |
| AI budget/cost tracking | N/A (bundled) | N/A (bundled) | N/A | N/A | -- | Missing (setting exists) |
| Keyword spotlights/highlights | No | Yes (all plans) | No | No | -- | Missing |

### Intelligence & Personalization

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Intelligence training system | Leo (topic/event/industry/like-board) | Rules + spotlights | 6-dimension classifier (author/tag/title/text/URL/site) | Regex block/keep | Feedbin (actions) | Missing |
| Source weight/preference | No (implicit via Leo) | No | Yes (like/dislike site) | No | -- | Partial (DB field, not in ranking) |
| Topic/folder affinity | Leo priority | Rules-based | Tag/title classifiers | No | -- | Missing |
| Engagement signals in ranking | Implicit | No | Implicit (training) | No | -- | Stub (only saved flag used) |
| Diversity penalty | No | No | No | No | -- | Partial (cluster size bonus only) |
| Exploration/serendipity quota | No | No | No | No | -- | Missing |
| Mute keyword (inline) | Yes (highlight to mute) | Yes (via rules) | Yes (title classifier) | Yes (regex rules) | -- | Missing (no inline UI) |
| Mute source (inline) | Yes | Yes | Yes (dislike site) | Yes | -- | Missing (no inline UI) |
| Prefer source (inline) | No | No | Yes (like site) | No | -- | Missing (no inline UI) |
| Mute with duration | Yes (1d/1w/1m/forever) | No | No | No | -- | Missing |
| Breakout badge on muted items | N/A | N/A | N/A | N/A | -- | Stub (always null) |

### Filtering & Rules Engine

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Keyword mute/block filters | Yes | Yes (content filters) | Yes (classifiers) | Yes (regex) | Feedbin (actions) | Implemented |
| Rules engine (trigger-condition-action) | No (Leo handles it) | Yes (30 rules, 5 triggers, 20+ actions) | Via classifiers + notifications | Regex block/keep | Feedbin (basic actions) | Missing |
| Duplicate detection/filtering | AI dedup (85%) | Yes (URL-based) | No | No | -- | Implemented (clustering) |
| Regex filter support | No | No | Premium Pro | Yes | -- | Missing |
| Per-feed/folder/global scope | Per-folder or global | Per-feed/folder/global | Per-feed/folder/global | Per-feed or global | -- | Implemented (global) |
| Auto-tag on match | No | Yes | Yes (auto-tag from folder) | No | -- | Missing |
| Auto-mark-read on match | No | Yes | Yes | No | Feedbin | Missing |
| Send notification on match | No | Yes (push + email) | Yes (Focus-only) | No | Feedbin | Missing |
| Webhook on match | No | Yes | No | Yes (HMAC-signed) | -- | Missing |

### Search

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Full-text search | Yes (Power Search) | Yes | Yes (Premium) | Yes (PostgreSQL) | Feedbin, FreshRSS | Implemented |
| Search operators (AND/OR/NOT) | Yes | Yes | No | No | Feedbin | Missing |
| Saved searches | Yes (via URL) | Yes (monitoring feeds) | Yes (virtual feeds) | No | Feedbin, FreshRSS | Missing |
| Search within feed/folder | Yes | Yes | Yes | Yes | -- | Missing |

### Notifications

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Push notifications (browser) | No (community extension) | Yes (via rules) | Yes | No | Feedbin | Implemented |
| Push notifications (mobile) | No | Yes (native app) | Yes (native app) | No | -- | N/A (PWA only) |
| Email notifications | No | Yes (via rules) | Yes | No | -- | Missing |
| Per-feed notification config | No | Via rules | Yes (all/focus) | No | -- | Missing |
| Keyword alert feeds | Yes (boolean AND/OR) | Yes (monitoring feeds) | Via classifiers | No | -- | Missing |

### Keyboard Shortcuts

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| j/k navigation | Yes | Yes | Yes | Yes | All | Implemented |
| Vim-style shortcuts | Yes (25 total) | Yes (57+ total) | Yes (20+) | Yes | -- | Implemented (basic set) |
| Shortcut help overlay (?) | Yes | Yes | Yes | Yes | -- | Implemented |
| Customizable key bindings | No | No | Yes (arrow/space behavior) | No | -- | Missing |

### Digest & Summaries

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Catch-up digest | Via third-party (Zapier) | Yes (email digests, Teams) | No | No | -- | Partial (static banner) |
| AI-generated digest | Enterprise (newsletters) | Teams (Intelligence reports) | No | No | FreshRSS (extension) | Missing (reformats only) |
| Scheduled digest delivery | Via Zapier/IFTTT | Yes (drag-and-drop editor) | No | No | -- | Implemented (daily 7am) |
| Manual "generate now" | No | No | No | No | -- | Missing |
| Away-time trigger | No | No | No | No | -- | Missing (no last_active_at) |

### Card Actions & Inline Controls

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Save / read-later | Yes | Yes | Yes (star) | Yes (star) | All | Implemented |
| Mark as read | Yes | Yes | Yes | Yes | All | Implemented |
| Not interested / dismiss | No | No | Hidden (red) | No | -- | Implemented |
| +N outlets badge | N/A | N/A | N/A | N/A | -- | Missing (data returned) |
| Folder/topic label on card | No | No | No | No | -- | Missing (data returned) |
| Mute keyword from card | Yes (inline highlight) | Via rules | Yes (train title) | No | -- | Missing |
| Prefer/mute source from card | No | No | Yes (like/dislike site) | No | -- | Missing |

### PWA, Mobile & Offline

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Installable PWA | No (native apps) | Yes | No (native apps) | Yes | -- | Implemented |
| Offline reading | Limited | Pro (full) | Yes (configurable) | No | -- | Stub (SW exists, no caching) |
| Gesture navigation | Yes (swipes) | Yes (swipes) | Yes (swipes) | Yes (touch) | Reeder (configurable) | Missing |
| Mobile viewport/meta tags | N/A | N/A | N/A | Yes | -- | Partial (missing some) |

### Pipeline & Reliability

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| WebSub / PubSubHubbub | Unknown | Unknown | Yes | No | FreshRSS | Missing |
| Circuit breaker per feed | Unknown (SaaS) | Unknown (SaaS) | Dynamic frequency adjustment | No | -- | Missing |
| Dead-letter queue | Unknown (SaaS) | Unknown (SaaS) | Unknown | No | -- | Missing |
| Retry with backoff | Unknown (SaaS) | Unknown (SaaS) | Unknown | Unknown | -- | Partial (pg-boss defaults) |
| Data retention controls | Auto (30d read) | 30d default (configurable) | 14-30d by tier | Configurable | -- | Missing |
| Feed error reporting | No | Yes (health status) | Yes (fetcher details) | No | -- | Missing |

### Sharing & Social

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| Share to external services | Yes (Buffer, LinkedIn, etc.) | Yes (Pocket, Evernote, etc.) | Yes (Facebook, Twitter, etc.) | Yes (25+ integrations) | -- | Partial (basic Send-to menu: Pocket/Instapaper/Wallabag only) |
| Public shared feed/blurblog | No | Yes (broadcast feeds) | Yes (blurblogs) | No | Reeder (tag feeds), FreshRSS | Missing |
| Social following/comments | No | Teams only | Yes (core feature) | No | The Old Reader (core) | Skip |
| Article annotations/highlights | Yes (notes + highlights) | Yes (highlights + notes) | No | No | -- | Missing |
| Folder as RSS feed | No | Yes | No | No | FreshRSS | Skip |

### Integrations & API

| Feature | Feedly | Inoreader | NewsBlur | Miniflux | Others | RSS Wrangler Status |
|---------|--------|-----------|----------|----------|--------|---------------------|
| REST API | Yes | Yes | Yes | Yes | Feedbin, FreshRSS | Partial (internal `/v1/*` exists; not yet productized as stable Wrangler-native API contract) |
| Google Reader API compat | No | Yes | No | Yes | FreshRSS | Missing (internal API exists; compatibility layer not implemented) |
| Fever API compat | No | No | No | Yes | FreshRSS | Missing (internal API exists; compatibility layer not implemented) |
| Webhook support | Yes (via API) | Yes (via rules) | No | Yes (HMAC-signed) | -- | Missing |
| Zapier/IFTTT | Yes (both) | Yes (both + n8n) | Yes (both) | No | -- | Skip |
| Browser extension | Yes (Mini) | Yes (v6.0+) | Community | Bookmarklet | -- | Missing |

---

## Part 2: Feature Priority Ranking

### P0 -- Table Stakes

These features exist in every serious RSS reader. Without them, the app feels broken or incomplete.

| # | Feature | Gap Type | Who Has It |
|---|---------|----------|------------|
| 1 | **Hero images on cards** | Missing (data exists, not rendered) | Feedly, Inoreader, NewsBlur, Feedbin |
| 2 | **Cluster detail page** | Missing (API ready, no frontend) | Unique to us -- but the article detail page is universal |
| 3 | **Reader mode / full-text extraction** | Missing | Feedly, Inoreader, NewsBlur, Miniflux, Feedbin |
| 4 | **Mark all as read** (with time filter) | Missing bulk action | Feedly, Inoreader, NewsBlur, Miniflux, all others |
| 5 | **+N outlets badge on cards** | Missing (data returned, not displayed) | Unique to clustering model |
| 6 | **Folder/topic label on cards** | Missing (data returned, not displayed) | Most readers show folder/category |
| 7 | **Mute keyword from card** (inline) | Missing | Feedly, NewsBlur, Inoreader (via rules) |
| 8 | **Prefer/mute source from card** (inline) | Missing | NewsBlur, Feedly |
| 9 | **Breakout badge shows reason** | Stub (always null from API) | Unique to our mute-with-breakout model |
| 10 | **Mark as read on scroll** (configurable) | Missing | Feedly, Inoreader, NewsBlur, Miniflux |

### P1 -- Competitive

Features that 3 or more top readers have. These make us competitive rather than a toy.

| # | Feature | Gap Type | Who Has It |
|---|---------|----------|------------|
| 11 | **Source weight used in ranking** | Partial (DB field ignored) | NewsBlur (like/dislike), Feedly (Leo), Inoreader (rules) |
| 12 | **Engagement signals in ranking** (dwell, click, dismiss) | Stub (only saved used) | Feedly (implicit), NewsBlur (training), Inoreader (rules) |
| 13 | **Topic/folder affinity in ranking** | Missing | Feedly (Leo), NewsBlur (tag classifiers) |
| 14 | **Multi-provider AI** (Anthropic, Ollama/local) | Missing (hardcoded OpenAI) | NewsBlur (model choice); essential for self-hosted |
| 15 | **AI "Story so far" on cluster detail** | Missing (returns raw text) | Feedly (summaries), Inoreader (summaries), NewsBlur (Ask AI) |
| 16 | **Full-text search within feed/folder** | Missing scoped search | Feedly, Inoreader, NewsBlur, Miniflux |
| 17 | **Saved searches** | Missing | Feedly, Inoreader, NewsBlur, Feedbin, FreshRSS |
| 18 | **Newsletter ingestion via email** | Missing | Feedly (Pro+), Inoreader (Pro), NewsBlur, Feedbin |
| 19 | **Feed health monitoring** (stale, errored, last fetch) | Missing | Inoreader, NewsBlur, FreshRSS |
| 20 | **Data retention controls** (unread max-age, read purge) | Missing | Inoreader (30d), NewsBlur (14-365d), Miniflux (configurable) |
| 21 | **Digest trigger: away >= 24h** | Missing (no last_active_at) | Unique to our spec, but catch-up is common |
| 22 | **AI digest with LLM generation** | Missing (reformats only) | Feedly (Enterprise), Inoreader (Teams) |
| 23 | **Offline PWA with service worker caching** | Stub (SW handles push only) | Inoreader (Pro), NewsBlur, Miniflux (PWA) |

### P2 -- Differentiator

Features from 1-2 readers or unique ideas that would make RSS Wrangler stand out.

| # | Feature | Gap Type | Who Has It |
|---|---------|----------|------------|
| 24 | **Diversity penalty in ranking** (true topical diversity) | Partial (cluster size bonus only) | Unique to our design |
| 25 | **Exploration quota** (surface low-ranked stories) | Missing | Unique to our design |
| 26 | **Intelligence training** (like/dislike authors, tags, keywords) | Missing | NewsBlur (6 dimensions), Feedly (Leo) |
| 27 | **Rules engine** (trigger-condition-action automation) | Missing | Inoreader (comprehensive), Feedbin (basic) |
| 28 | **Keyword alert monitoring feeds** | Missing | Feedly (boolean), Inoreader (monitoring feeds) |
| 29 | **AI recommendations** ("readers like you also follow") | Missing | Feedly (40M source suggestions), NewsBlur (embeddings) |
| 30 | **AI budget/cost tracking** | Missing (setting exists, no tracking) | Unique to self-hosted AI model |
| 31 | **Feed drift detection** (weekly topic re-check) | Missing | Unique to our LLM classification model |
| 32 | **Per-feed notification rules** (all / focus-only) | Missing | NewsBlur, Inoreader (via rules) |
| 33 | **Webhook on article match** | Missing | Inoreader (via rules), Miniflux (HMAC-signed) |
| 34 | **Article annotations/highlights** | Missing | Feedly (notes + highlights), Inoreader (highlights + notes) |

### P3 -- Nice to Have

Features that only power users want or that only one app has.

| # | Feature | Gap Type | Who Has It |
|---|---------|----------|------------|
| 35 | **Font/density customization** | Missing | Inoreader, NewsBlur |
| 36 | **Per-feed view settings** | Missing | Feedly, Inoreader, NewsBlur |
| 37 | **Gesture navigation** (swipe actions) | Missing | Feedly, Inoreader, NewsBlur, Reeder |
| 38 | **Web feed builder** (scrape sites without RSS) | Partial (manual RSSHub URLs work; no in-app generator) | Feedly (RSS Builder), Inoreader, FreshRSS (XPath) |
| 39 | **YouTube/podcast as feed source** | Missing | Feedly, Inoreader, NewsBlur, Miniflux |
| 40 | **Browser extension** (subscribe from any page) | Missing | Feedly, Inoreader, NewsBlur (community) |
| 41 | **Public shared feed** (blurblog-style) | Missing | NewsBlur, Inoreader, Reeder |
| 42 | **Customizable keyboard bindings** | Missing | NewsBlur |
| 43 | **Regex filter support** | Missing | NewsBlur (Pro), Miniflux |
| 44 | **Search operators** (AND/OR/NOT, title:, author:) | Missing | Feedly, Inoreader, Feedbin |
| 45 | **Drag-and-drop feed reorder** | Missing | Feedly, Inoreader, NewsBlur, The Old Reader |
| 46 | **Custom CSS injection** | Missing | Miniflux, FreshRSS |
| 47 | **Tracker/pixel removal** | Missing | Miniflux |
| 48 | **Mute filters with duration** (1d/1w/1m) | Missing | Feedly |
| 49 | **Integration hooks + send-to connectors** (Readwise/Notion/Obsidian/Slack/email digest) | Partial (basic send-to exists, hooks/connectors missing) | Feedly, Inoreader, Miniflux (webhooks) |

---

## Part 3: Phased Implementation Roadmap

**Execution model:** Use `/.planning/PHASED_IMPLEMENTATION_PLAYBOOK.md` for role definitions, phase exit gates, locked Phase 0 provider stack, atomic-commit rules (bisectable/revertable slices), and `tech-debt-agent` responsibilities (dead code / duplicate-path control). Playwright gate policy: for impacted user flows, `playwright-qa-agent` must pass; failing runs return the slice to implementation (no merge). Accessibility gate policy: impacted flows must meet WCAG 2.2 AA baseline (keyboard navigation, focus visibility/management, semantic labels, and contrast checks).

### Phase 0 Progress Snapshot (2026-02-08)

| Phase 0 Feature | Current Status | Notes |
|---|---|---|
| Multi-tenant data model + isolation strategy | ⚠️ Partial | Tenant IDs + RLS + tenant DB context are in place; hosted org/admin workflows still pending |
| Hosted auth + onboarding flow | ⚠️ Partial | Signup/login/join, recovery, onboarding wizard, and invite-token join guard are live; role-based member approval still pending |
| Hosted account management + compliance controls | ⚠️ Partial | Password reset/change, account deletion lifecycle automation, and baseline account export are live; completion notifications + export hardening remain |
| Entitlements + plan-limit middleware baseline | ⚠️ Partial | Plan defaults + API/worker feed/search/ingest gates landed; billing sync and broader coverage remain |
| Hosted performance/load testing + SLO baseline | ✅ Implemented | Load harness, SLO policy, and calibration workflow are in repo |
| Billing foundation (Lemon Squeezy + plan management UX) | ❌ Missing | Not started |
| Consent + CMP baseline (hosted) | ❌ Missing | Not started |
| Hosted SaaS offering (dogfood pilot) | ⚠️ Pending | Infra/provider decisions locked; hosted pilot execution still pending |

**Immediate next slice:** Invite/member approval controls (owner/admin policy on invite create/revoke + role model baseline).

### Phase 0: Hosted SaaS Pilot & Cost Model

**Goal:** Validate hosted unit economics and sane plan limits before public SaaS launch.

**Dependencies:** None for self-host track. Required before hosted public launch.
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `data-migration-agent`, `sre-cost-agent`, `security-risk-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Multi-tenant data model + isolation strategy | Introduce tenant-aware schema and query model for hosted operation. Choose and implement isolation strategy (row-level with `tenant_id` + scoped access patterns, or equivalent), and enforce tenant scoping across core tables/APIs/workers. | XL | SaaS baseline pattern (GitLab/Plausible/Ghost style hosted isolation) |
| Hosted auth + onboarding flow | Build hosted-user auth flow distinct from single-user self-host assumptions: sign-up/login/session lifecycle, onboarding bootstrap (initial settings + starter experience), and tenant creation/join path. | L | Feedly/Inoreader hosted account model |
| Hosted account management + compliance controls | Ship mandatory account controls for hosted users: password change/reset, account deletion workflow (self-serve request, confirmation, soft-delete grace window, hard purge SLA), and self-serve data download request (GDPR-style). Include audit logging and background jobs for delete/export completion notifications. | L | SaaS baseline account settings (GitLab/Ghost/Plausible patterns) |
| Entitlements + plan-limit middleware baseline | Enforce plan-aware gates and limits in API and worker paths from day one (feeds count, ingest/day, retention/search caps), with soft warnings + hard cap modes. | L | Inoreader/NewsBlur/Feedly tiered limits model |
| Hosted performance/load testing + SLO baseline | Establish repeatable load profiles for multi-tenant hosted traffic (auth, timeline fetch, mark-read/save actions, add-source, worker ingest pipeline), and set launch SLO/error budgets (p95 latency, error rate, queue lag, job success rate). Use scripted load tests (k6/autocannon equivalent) plus provider metrics; provider graphs alone are not a substitute for controlled load tests. | L | SaaS reliability baseline |
| Billing foundation (Lemon Squeezy + plan management UX) | Implement hosted billing baseline: Lemon Squeezy subscription lifecycle (Merchant of Record — handles tax/VAT), webhook sync into internal entitlements service, pricing page, upgrade flow, and plan-management UI (change plan/cancel/reactivate). Keep API as source of truth for effective entitlements. | L | Feedly/Inoreader subscription model; Lemon Squeezy MoR billing |
| Consent + CMP baseline (hosted) | Implement consent architecture before any non-essential analytics/ads: strictly-necessary cookies by default, persistent "Privacy settings" controls, and region-aware gating for non-essential scripts. If Google ads are enabled in EEA/UK/CH, use a Google-certified CMP (default path: Google Privacy & messaging). | M | SaaS compliance baseline; Google EU consent requirements |
| Hosted SaaS offering (dogfood pilot) | Run internal hosted deployment to measure real cost/user/day and tune limits (feeds count, items/day, retention window, search index size). Validate p50/p95 usage before public launch thresholds are finalized. | L | Inoreader/NewsBlur/Feedly tiered limits model |

**Total: 8 features (1M + 6L + 1XL = foundational-heavy sprint)**

---

### Phase 1: Core Reading Experience

**Goal:** Fix the basics so the app feels complete for daily use.

**Dependencies:** None (foundational work).
**Agents:** `phase-lead-agent`, `frontend-dev-agent`, `backend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Replace rss-parser with feedsmith | Swap unmaintained rss-parser (3yr stale) for feedsmith — adds JSON Feed 1.0/1.1, RDF, better OPML parsing, TypeScript types | M | Miniflux (JSON Feed), Feedsmith ecosystem |
| Hero images on cards | Render `image_url` from DB on story cards in all layouts | S | Feedly, Inoreader, NewsBlur |
| +N outlets badge + inline expand | Display cluster member count on card. Clicking the badge expands a panel inline showing all source outlets (title, source, time) with links to each — no page navigation needed. Collapse to re-hide. Full cluster detail page still available for deep dive. | M | Unique (clustering model), Google News (expand sources inline) |
| Folder/topic label on cards | Show topic tag from feed classification | S | Unique (LLM topic system) |
| Cluster detail page | Frontend page for `/v1/clusters/:id` with member list, timeline, sources | M | Unique (clustering model) |
| Guided onboarding wizard (first-run) | Replace empty-state landing with a guided setup: choose import path (OPML import, browse starter directory, or add feed URL), optionally pick interests/topics to pre-seed folders/filters, and explain AI modes with explicit opt-in controls. Include skip path and a lightweight "getting started" checklist. | M | Feedly/Inoreader first-run activation patterns |
| Embedded reader + full-text fetch | Build an in-app reader experience (not just external links): split/overlay reader pane with 3 modes: Feed view (feed-provided content preview), Original view (publisher page with safe fallback to open-in-new-tab when embedding is blocked), and Text view (readability full-text extraction). Per-feed default view + keyboard shortcut to toggle views. Full-text extraction remains optional per-feed and Pro-gated on hosted. Hosted extraction policy stays: extract on request, serve to browser, do NOT persist full text server-side, and never bypass paywalls. | M | Feedly (Article/Slider views), Inoreader (load full content), NewsBlur (Original/Feed/Story/Text), Nextflux (rich in-app reading UX) |
| Sponsored story card primitives (ad-ready, default off) | Add feed renderer support for `sponsored` stories with mandatory "Sponsored" labeling, distinct visual treatment, strict frequency caps (target max 1 sponsored story per 12-20 organic stories), and a global feature-flag kill switch. Sponsored items must be excluded from ranking/training signals and never shown on paid plans. | M | Feed-style sponsored units; free-tier monetization pattern |
| Expand filter types | Add author, domain, URL pattern as filter types. Regex for power users. New "keep/allow" mode: in noisy feeds, only let matching items through. Per-feed or folder scope for all filter modes. | M | NewsBlur (6 classifier dimensions), Miniflux (keep/block per-feed), Inoreader (content filters) |
| Inline card actions + training | Bidirectional training from cards: mute-keyword / boost-keyword, mute-source / prefer-source, mute-author / prefer-author. Explicit thumbs up/down on story (separate from save/dismiss — feeds ranking model). "More like this" expands to attribute picker: boost this source? this author? this topic? Training signals stored and fed into Phase 2 ranking. | L | NewsBlur (6-dimension classifier with like/dislike), Feedly (Leo like-board training) |
| Breakout badge fix | JOIN filter_event in API to populate `mutedBreakoutReason` | S | Unique (mute-with-breakout model) |
| Read-state completeness | Mark-all-read (global, per-folder, per-feed) with "older than" time filter. Mark above/below as read. Undo mark-read (soft-delete with short TTL or toast undo). | M | Feedly (Shift+A + scope), Inoreader (Shift+A), NewsBlur (per-feed/folder) |
| Expand search index | Add author, feed domain/title to search_vector. Swap `plainto_tsquery` → `websearch_to_tsquery` for AND/OR/NOT operator support. | S | Feedly (Power Search), Inoreader (operators) |
| Accessibility baseline (WCAG 2.2 AA) | Table-stakes accessibility pass for core flows (home feed, settings, add source, reader): semantic landmarks/headings, accurate ARIA/accessible names, keyboard-only navigation, robust focus management for drawers/modals, visible focus styles, color contrast compliance, and screen-reader sanity checks. Include automated axe checks in Playwright plus manual keyboard/screen-reader spot checks. | M | Web/PWA baseline quality standard |

**Total: 14 features (3S + 10M + 1L = moderate-heavy sprint)**

---

### Phase 2: Smart Ranking & Personalization

**Goal:** Make "For You" actually personalized beyond recency.

**Dependencies:** Phase 1 (card actions generate engagement signals).
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Source weight in ranking | Include `feed.weight` (prefer/neutral/deprioritize) in ranking SQL | S | NewsBlur (like/dislike site) |
| Engagement history in ranking | Full implicit signal tracking: dwell time (have), click-through/opens (add), scroll depth (add), saves (have), dismisses (have), mark-read-without-opening (have, treat as negative signal), shares (when Phase 6 lands). All signals persisted per-user per-cluster, weighted and decayed over time, fed into ranking SQL. | M | Feedly (Leo implicit learning), NewsBlur (training) |
| Topic/folder affinity | Weight topics user engages with more heavily in ranking | M | Feedly (Leo topic priority), NewsBlur (tag classifiers) |
| Diversity penalty | Penalize multiple clusters from same topic in top N results | M | Unique design goal |
| Exploration quota | Reserve 5-10% of feed positions for low-ranked serendipity items | S | Unique design goal |
| Mark as read on scroll | Configurable: off, on scroll past, on open | S | Feedly, Inoreader, NewsBlur, Miniflux |
| Digest trigger: away detection | Track `last_active_at`, trigger digest when away >= configurable hours | S | Unique spec requirement |
| Folder organization modes | Settings toggle: Manual (user creates/manages all folders), AI (LLM auto-classifies into topics, suggests subfolder hierarchy), Hybrid (AI suggests, user approves/overrides). Manual mode adds full CRUD for folders + subfolders. AI mode extends current topic system with nested suggestions. Hybrid = current approve/reject flow + manual overrides + drag-and-drop reorg. | M | Unique differentiator — most readers are fully manual or fully AI, never both |
| Tunable noise controls | User-facing sliders/toggles in Settings for: dedup aggressiveness (Jaccard threshold — currently hardcoded 0.25), mute strictness (breakout cluster size threshold — currently hardcoded 4), collapse repeated stories vs show all, Focus-only mode (hide everything below score threshold globally). Surfaces currently-hardcoded constants as per-user preferences. | M | Unique — most readers hide these knobs |
| Explainability UI | "Why shown" / "Why hidden" / "Why deduped" via tooltip on hover (desktop) or tap-to-reveal (mobile). Small info icon on card → hover shows ranking factors (source weight, topic affinity, engagement score, cluster size), filter matches, dedup reasoning. Lightweight — no modal, no page nav. Builds trust and lets users tune training directly from the tooltip. | M | Unique differentiator — no RSS reader explains its ranking |
| Focus / Priority inbox | Third sort mode alongside "For You" and "Latest." Applies score threshold to show only high-signal items. Starts rules-based (source weight + topic + filters). Evolves to learning-based once engagement signals accumulate (weeks 3+). Shares signal model with AI digest — both use same learned preferences for curation. Progressive card detail: top items get full cards (hero image + summary + actions), middle items get compact cards (headline + 1-liner), bottom items get title rows only. | M | NewsBlur (Focus mode — green items only), Feedly (Priority inbox via Leo) |

**Total: 11 features (3S + 7M + 1S = moderate-heavy sprint)**

---

### Phase 3: AI Power Features

**Goal:** Unlock the full AI potential beyond basic summaries.

**Dependencies:** Phase 2 (engagement data improves AI training signals).
**Agents:** `phase-lead-agent`, `ai-pipeline-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Multi-provider AI abstraction | Provider interface supporting OpenAI, Anthropic, Ollama/local models | L | NewsBlur (model choice); critical for self-hosted |
| AI-assisted classification before summarization (Local Llama optional) | Add a lightweight classification step before summary generation to label article intent/topic and route summarization strategy. Optional and not required for day 1. Primary target is self-hosted local models (Llama/Ollama), with hosted fallback to managed providers. | M | Classifier-first NLP pipelines; NewsBlur-style training signals |
| Local Llama endpoint scoring + likely-relevant labels | Add optional self-host local-Llama/Ollama scoring that outputs per-item focus score, likely-relevant label, and suggested tags. Expose score factors in "Why shown" explainability and keep controls opt-in (global + per-feed/folder toggles). Default off until user enables. | M | Feedly Priority Inbox cues, NewsBlur Focus concepts, explainable ranking best practices |
| AI "Story so far" | LLM-generated narrative summary on cluster detail page | M | Feedly (Leo summaries), Inoreader (Intelligence) |
| AI digest generation | LLM writes the digest narrative, not just reformatting. Uses engagement-learned preferences to curate what makes the cut — after learning period, digest reflects what user actually cares about, not just recency/cluster-size. Same signal model as Focus inbox. | M | Feedly (automated newsletters), Inoreader (email digests) |
| Time-based progressive summarization | Stories age gracefully: fresh (< configurable hours) show full content; aging (hours → days) auto-generate AI summary for quick scan; old (> days) collapse to headline-only before retention pruning. Configurable thresholds in settings. Summaries generated lazily on first view or via background job. | M | Unique differentiator — no competitor does this |
| AI budget tracking | Track token usage per provider, enforce monthly budget cap | M | Unique (self-hosted cost control) |
| Manual "generate digest" button | On-demand digest generation endpoint + UI button | S | Unique spec requirement |
| AI feed recommendations | "Based on your reading, you might like..." using topic embeddings | L | Feedly (40M source discovery), NewsBlur (sentence transformers) |

**Total: 9 features (1S + 6M + 2L = heavy sprint)**

---

### Phase 4: Content Sources & Feed Management

**Goal:** Expand what can be ingested and improve feed lifecycle management.

**Dependencies:** Phase 3 (AI classification for new source types).
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `data-migration-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Feed discovery engine | Paste any URL → extract candidates (HTML link tags, common paths, anchor scan) → validate → score → present options → pick canonical. New `sites` + `feed_candidates` tables. See DISCOVERY.md | L | Feedly (40M sources), Inoreader (5M), NewsBlur (auto-discovery) |
| Directory seeding (one-time DB seed) | One-time import of existing `feed-directory.json` (500+ curated feeds) into Postgres via migration/bootstrap script. Directory grows organically as users add feeds. No pack builder pipeline needed. | S | Feed-database bootstrap (simple seed approach) |
| Newsletter ingestion | Unique email address per user; parse email into article items | L | Feedly, Inoreader, NewsBlur, Feedbin |
| Feed health monitoring | Track fetch errors, staleness, last success; surface in UI | M | Inoreader (health indicators), NewsBlur (stats) |
| Feed error dashboard | Admin view of all feeds with error state, retry count, last fetch | M | Inoreader, NewsBlur |
| Data retention controls | Configurable unread max-age and read-item purge with cleanup jobs | M | Inoreader (30d), NewsBlur (configurable), Miniflux |
| Feed drift detection | Weekly job re-classifies feeds, flags topic changes for review | M | Unique (LLM classification model) |
| RSSHub upstream support + generator assist | Treat RSSHub-generated feeds as normal feeds (already works in URL add flow). Add Source enhancement: "Generate via RSSHub" assistant for known no-RSS sites using route templates, then subscribe to generated feed URL. | M | RSSHub ecosystem, Feedly RSS Builder concept (lighter-weight) |
| Add-source preview + initial pull policy | In Add Source flow, show a live preview of recent items before subscribing (headline, source, publish time, sample snippet). Add initial import policy at subscribe time: default "new only / mark existing as read" for baseline cost control, with optional Pro backfill controls (last N items or N days with hard caps). Keep this explicit per-feed and editable later in feed settings. | M | Feedly (source preview in follow/RSS Builder), Miniflux (discover candidates), Inoreader/NewsBlur (quick add APIs; backfill handled as archive capability, not per-add count field) |
| On-add classification prompt | When adding feed, show "classified as X -- change?" UI | S | Unique spec requirement |
| Scoped search (within feed/folder) | Filter search results by current feed or folder context | M | Feedly, Inoreader, NewsBlur, Miniflux |
| Saved searches | Persist search queries as virtual feeds in sidebar | M | Feedly, Inoreader, NewsBlur, Feedbin, FreshRSS |
| Custom sidebar tags + icon/emoji picker | User-defined tags in left nav with CRUD, drag reorder, and visual identity per tag. Linear-style choice: pick from curated icon set or emoji. Use on stories/feeds for quick grouping and filtering. | M | Linear (icon/emoji identity pattern), Inoreader/NewsBlur tag workflows |

**Total: 13 features (1S + 10M + 2L = heavy sprint)**

---

### Phase 5: Rules Engine & Automation

**Goal:** Give power users automated workflows for content processing.

**Dependencies:** Phase 4 (feed health + content sources provide triggers).
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`, `ai-pipeline-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Rules engine core | Trigger-condition-action framework: new article triggers, keyword/author/URL conditions | XL | Inoreader (30 rules, 5 triggers, 20+ actions) |
| Content rewrite/scrape rules (per-domain) | Declarative per-domain rules for URL rewrites, HTML cleanup, and extraction fallback when feeds are broken (tracking links, malformed summaries, paywall stubs). Baseline already exists: global URL canonicalization strips common tracking params; this feature extends to domain-specific rule packs. Guardrails: never bypass paywalls; hosted runs curated rule packs and only extracts freely accessible pages. Self-hosted can run custom rules. | L | Miniflux (rewrite rules), FreshRSS (XPath rules), Inoreader (web feeds) |
| Rule actions: tag, mark-read, save, move folder, send-to-queue | Full action set: auto-tag, auto-star/save, auto-mark-read, move to folder, send to read-later queue. | M | Inoreader (20+ actions), Feedbin (actions), Miniflux |
| AI rule/filter copilot (wand) | Add wand action next to each filter/rule to suggest advanced actions from current pattern and matched stories: prioritize/deprioritize source, auto-tag, block/mute, save, mark-read, move folder. Require one-click confirmation and show "what will change" preview counts before apply. Keep editable as normal rules after generation. | M | Inoreader rule-builder workflows + Wrangler explainability |
| Rule action: push notification | Send browser push when rule matches | S | Inoreader, NewsBlur (Focus-only) |
| Rule action: webhook | HTTP POST to external URL on match (HMAC-signed) | M | Inoreader, Miniflux (HMAC-signed webhooks) |
| Keyword alert monitoring | Create persistent keyword watch that scans new articles across all feeds | M | Feedly (keyword alerts), Inoreader (monitoring feeds) |
| Per-feed notification config | Configure notification level per feed (all / filtered / off) | S | NewsBlur (all/focus per feed) |

**Total: 8 features (2S + 4M + 1L + 1XL = very heavy sprint)**

---

### Phase 6: Social & Sharing

**Goal:** Enable sharing and annotation workflows.

**Dependencies:** Phase 1 (cluster detail page for annotation targets), Phase 2 (training signal model), and Phase 5 (webhook substrate for automation hooks and rules data).
**Agents:** `phase-lead-agent`, `frontend-dev-agent`, `backend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Article annotations | Highlight text passages and attach notes within reader mode | L | Feedly (highlights + notes), Inoreader (highlights + notes) |
| Share to clipboard/email | Copy formatted article link or send via email | S | Feedly, Inoreader, NewsBlur |
| Share to external services | Configurable share targets (Pocket, Instapaper, Readwise, Notion, Obsidian, Slack, etc.). Baseline exists: Pocket/Instapaper/Wallabag from card menu. | M | Feedly, Inoreader, NewsBlur, Miniflux (25+ integrations) |
| Integration hook adapters (non-core) | Hook-based integration layer for outgoing actions: connector adapters for Readwise/Notion/Obsidian/Slack and digest-to-email forwarding, built on the Phase 5 webhook substrate. Positioned as non-core: plan hooks early, ship connectors incrementally. | M | Feedly (integrations), Inoreader (rules + webhooks), Miniflux (webhooks) |
| Data portability export bundle (beyond OPML) | One-click account export package (versioned JSON/JSONL + manifest/checksums) covering subscriptions, saved/starred items, annotations/highlights/notes, training signals/preferences, filters/rules, and key settings metadata. Extends Phase 0 GDPR-style account download into a richer full-data portability bundle. Guarantee export availability on all tiers and self-host. Import can follow in a later slice; export is mandatory for trust/no-lock-in. | M | Open-source trust pattern; Feedbin/FreshRSS-style user data portability |
| Public saved-items feed | Expose saved/tagged items as an RSS feed URL | M | NewsBlur (blurblog RSS), Inoreader (broadcast), Reeder (tag feeds) |
| Annotation search | Search across all highlights and notes | M | Feedly, Inoreader |

**Total: 7 features (1S + 5M + 1L = moderate-heavy sprint)**

---

### Phase 7: Pipeline Reliability

**Goal:** Make the feed ingestion pipeline production-grade.

**Dependencies:** Phase 4 (feed health monitoring provides observability).
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `data-migration-agent`, `sre-cost-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Per-feed circuit breaker | After N consecutive failures, back off exponentially; auto-recover on success | M | NewsBlur (dynamic frequency), standard resilience pattern |
| Dead-letter queue | Failed pipeline items routed to DLQ table with error context for debugging | M | Standard resilience pattern |
| Explicit retry configuration | Configurable retry count and backoff per pipeline stage (poll, fetch, AI, cluster) | M | Standard resilience pattern |
| Feed revive logic (re-discovery + canonical swap) | After repeated feed failures, automatically rerun site discovery against homepage/canonical URL, re-validate candidates, and swap canonical feed when a healthier/higher-confidence candidate exists. Preserve audit trail of swaps and allow manual override in feed settings. | M | Discovery.md revive model; resilient feed readers |
| Stage timeouts for AI/clustering | Add configurable timeouts to AI enrichment and clustering stages | S | Standard resilience pattern |
| Tracker/pixel removal | Strip tracking pixels and utm parameters from article content | M | Miniflux (privacy hardening) |
| Feed error alerting | Notify user when feeds enter persistent error state | S | Inoreader (health status), NewsBlur (fetch status) |

**Total: 7 features (2S + 5M = moderate-heavy sprint)**

---

### Phase 8: PWA & Mobile Polish

**Goal:** Make the PWA feel native on mobile devices.

**Dependencies:** Phase 1 (core reading experience must be solid first).
**Agents:** `phase-lead-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| Offline mode (on-device) | Service worker + IndexedDB caches articles + images on user's device. Storage controls (max MB, auto-evict oldest). Toggle: "offline everything" vs "offline saved only". Sync read-state on reconnect. Offline cache stays on-device; hosted still stores normal feed metadata/content, but not reader-mode full-page extraction results. | L | Inoreader (Pro offline), NewsBlur (configurable sync) |
| Gesture navigation | Swipe left/right for mark-read, save, dismiss; swipe between articles | M | Feedly, Inoreader, NewsBlur, Reeder |
| Mobile viewport/meta fixes | Add missing viewport, apple-touch-icon, theme-color meta tags | S | Standard PWA requirements |
| Font/density customization | User-configurable font family, size, and content density | M | Inoreader, NewsBlur |
| Mobile accessibility polish | PWA/mobile accessibility hardening: minimum tap target sizes, reduced-motion support, dynamic text scaling/reflow checks, and safe-area/focus behavior audits on common breakpoints/devices. | M | Mobile web accessibility baseline |
| Additional themes | Sepia reading theme, OLED dark theme | S | Inoreader (sepia + custom), Miniflux (6 themes) |
| Pull-to-refresh | Swipe down to refresh feed from top of list | S | Feedly, Inoreader, all native apps |

**Total: 7 features (3S + 3M + 1L = moderate-heavy sprint)**

---

### Phase 9: Client Ecosystem Compatibility

**Goal:** Let users connect preferred third-party RSS clients while keeping Wrangler PWA as the advanced client.

**Dependencies:** Phase 1 minimum (core read/save state + auth). Expands as Phase 2 (learning/explainability signals) and Phase 5 (rules/audit trails) land.
**Agents:** `phase-lead-agent`, `backend-dev-agent`, `api-compat-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `senior-review-agent`.

| Feature | Description | Complexity | Inspired By |
|---------|-------------|------------|-------------|
| First-party API (Wrangler-native endpoints) | Define a stable, versioned API contract for Wrangler clients/integrations: cluster primitives, dedup metadata, learning-signal ingest/retrieval, explainability payloads ("why shown/hidden/deduped"), and rules/filter audit logs. Baseline exists today via internal `/v1/*` routes (clusters, feedback, events, dwell), but contract/coverage is incomplete. | L | Feedly API, Inoreader API, NewsBlur API |
| API compatibility layer (Google Reader + Fever subset) | Add compatibility endpoints mapped onto Wrangler's first-party API so clients like Reeder/NetNewsWire/Unread/ReadKit can sync subscriptions and basic read/starred states. Scope is intentional subset, not full protocol parity. Wrangler PWA remains superset client for clustering, AI features, annotations, and explainability UX. Hosted: Pro-gated with request rate limits. Self-hosted: unlocked. | L | Inoreader (Google Reader API), Miniflux (Google Reader + Fever), FreshRSS (both), NewsBlur ecosystem clients |

**Total: 2 features (2L = focused, high-leverage interoperability phase)**

---

### Roadmap Summary

| Phase | Name | Feature Count | Dependencies | Overall Complexity |
|-------|------|--------------|--------------|-------------------|
| 0 | Hosted SaaS Pilot & Cost Model | 8 | None for self-host; required before hosted public launch | Foundational-Heavy |
| 1 | Core Reading Experience | 14 | None | Moderate-Heavy |
| 2 | Smart Ranking & Personalization | 11 | Phase 1 | Moderate-Heavy |
| 3 | AI Power Features | 9 | Phase 2 | Heavy |
| 4 | Content Sources & Management | 13 | Phase 3 | Heavy |
| 5 | Rules Engine & Automation | 8 | Phase 4 | Very Heavy |
| 6 | Social & Sharing | 7 | Phase 1 + 2 + 5 | Moderate-Heavy |
| 7 | Pipeline Reliability | 7 | Phase 4 | Moderate-Heavy |
| 8 | PWA & Mobile Polish | 7 | Phase 1 | Moderate-Heavy |
| 9 | Client Ecosystem Compatibility | 2 | Phase 1 minimum (expands with Phases 2 and 5) | Focused-Heavy |

**Notes on parallelism:** Phase 0 can run in parallel with self-host product work, but hosted public launch should wait for Phase 0 completion (multi-tenancy, hosted auth/onboarding, account management/compliance controls, entitlements/limits, hosted load-test/SLO baseline, billing foundation, consent/CMP baseline, and stable cost telemetry). Phases 6, 7, 8, and 9 can run in parallel once their dependencies are met. Phases 1-5 are largely sequential because each phase builds on signals and infrastructure from the previous one.

**Monetization gates:** Every feature should be built with entitlement awareness. See `.planning/MONETIZATION.md` for the full feature-to-tier map. Key rule: self-hosted = all features unlocked, hosted = gated by plan. AI features = AI add-on tier. Reader mode policy on hosted: per-feed opt-in, no paywalled extraction, and no server-side persistence of full-page extraction results. Dedupe policy on hosted: baseline clustering is available on all tiers; advanced dedupe controls (threshold tuning + split/merge tools) are Pro. Data portability policy: export remains free on all tiers (trust/no-lock-in). Ads policy: subscription-first at launch; if enabled later, only clearly labeled sponsored feed stories on free tier with frequency caps and consent gating, while paid plans stay ad-free. Build the entitlements middleware early (Phase 1 or pre-Phase 1 infra) so every subsequent phase can gate naturally. Pattern: `requirePlan('pro')` middleware on API routes, `entitlements.hasAccess('ai')` checks in worker jobs, frontend checks to show upgrade prompts.

---

## Part 4: What NOT to Build

### Team / Enterprise Features

| Feature | Who Has It | Why Skip |
|---------|-----------|----------|
| Team boards/channels | Feedly (Enterprise), Inoreader (Teams) | RSS Wrangler is a single-user self-hosted app. Multi-user collaboration adds massive complexity (access control, permissions, shared state) for zero benefit in our use case. |
| Team newsletters | Feedly (Enterprise), Inoreader (Teams) | No audience to send to in a single-user reader. |
| Role-based access control | Feedly, Inoreader | Single user. No roles needed. |
| SAML/SSO | Inoreader (Teams) | Single user. Username/password + JWT is sufficient. |
| Shared annotations with @mentions | Feedly, Inoreader | No other users to mention. |

### Native Mobile Apps

| Feature | Who Has It | Why Skip |
|---------|-----------|----------|
| Native iOS app | Feedly, Inoreader, NewsBlur, Reeder | PWA provides 90% of the experience. Native apps require separate codebases, app store maintenance, and review cycles. A polished PWA with offline support (Phase 8) is the right tradeoff for a self-hosted project. |
| Native Android app | Feedly, Inoreader, NewsBlur | Same reasoning as iOS. |
| Home screen widgets | Inoreader, NewsBlur | Requires native app. PWA install provides basic presence. |

### Third-Party API Compatibility (Scope Limits)

| Feature | Who Has It | Why Limit Scope |
|---------|-----------|-----------------|
| Full Google Reader protocol parity (all client quirks) | Inoreader, Miniflux, FreshRSS | We will implement a practical compatibility subset first, not perfect emulation of every edge case/client bug. |
| Full Fever protocol parity (all optional behaviors) | Miniflux, FreshRSS | Same reasoning: subset compatibility first, iterate based on real client demand. |
| Advanced Wrangler features inside third-party clients | -- | Third-party clients get baseline feed/read functionality only. Wrangler PWA remains the advanced client (clustering, AI, annotations, explainability). |

### Content Types Outside RSS

| Feature | Who Has It | Why Skip |
|---------|-----------|----------|
| Social media feeds (Twitter/X, Reddit, Bluesky, Mastodon) | Feedly, Inoreader | These require API keys, OAuth flows, rate limit management, and constant maintenance as platforms change APIs. Most social content is available via RSS bridges (RSSHub, RSS-Bridge) which we already support as standard feeds. Users who need this can use a bridge. |
| Podcast player (built-in audio) | Inoreader, Feedbin (Airshow) | Podcast listening is better served by dedicated podcast apps. Supporting feed subscription is fine; building a player with playlists, progress sync, and background audio is out of scope. |
| Text-to-speech | Inoreader | Niche feature with high infrastructure cost. Browser and OS-level TTS is available to users who need it. |
| Article translation | Inoreader | Niche feature. Users can use browser-level translation. |
| File uploads (PDF to article) | Inoreader | Out of scope for an RSS reader. |

### Heavy Infrastructure Features

| Feature | Who Has It | Why Skip |
|---------|-----------|----------|
| 40M+ source discovery database | Feedly | Requires massive crawl infrastructure. We can link to external directories or use simple URL/search-based discovery instead. |
| RSS Builder (scrape sites without feeds) | Feedly (Pro+), Inoreader, FreshRSS (XPath) | Full custom scraping engine is complex to build and maintain (selectors break, sites change). We are planning the lighter path first: RSSHub-assisted generation in Add Source (Phase 4). |
| Web page change monitoring | Inoreader (Track Changes) | Visual diffing and text monitoring is a separate product category. Out of scope. |
| Zapier/IFTTT integration | Feedly, Inoreader, NewsBlur | Webhook + integration hooks (Phases 5/6) provide the building blocks. Users can connect hooks to Zapier/n8n themselves. Building official first-party Zapier/IFTTT apps requires ongoing maintenance. |

### Novelty/Niche Features

| Feature | Who Has It | Why Skip |
|---------|-----------|----------|
| Bionic reading | Reeder | Single-app feature with debatable effectiveness. Low demand. |
| Story change tracking / diffs | NewsBlur, Feedbin | Interesting but niche. Requires storing multiple versions of every article, significantly increasing storage. |
| iCloud sync | Reeder | Apple-only. We use our own database. |
| Autoscrolling | NewsBlur | Niche accessibility feature. Low priority. |
| Custom CSS/JS injection | Miniflux, FreshRSS | Power-user feature that creates support burden. Our theming system covers the common cases. |
| Blurblog / social following | NewsBlur, The Old Reader | Social reading is a different product. Single-user app has no social graph. |
| Multi-user support | FreshRSS | Single-user by design. Simplifies auth, data model, and privacy. |

---

## Part 5: Future (Post-Launch, If Demand)

Features parked here aren't planned for any phase. Build only if users ask for them.

| Feature | Description | Why Wait |
|---------|-------------|----------|
| Semantic search | pgvector embeddings for natural language queries + "find similar." Hybrid with Postgres FTS. | Keyword FTS + clustering covers 95% of search needs. Embedding every article on ingest burns tokens constantly whether anyone searches or not. Add if users request it. |
| Ask AI (conversational) | Chat with your feed — ask questions about articles, get contextual answers | Enterprise-tier feature at Feedly/Inoreader. Low demand for self-hosted. |
| YouTube/podcast as feed source | Subscribe to YouTube channels and podcasts via RSS | Already works via RSS URLs. Built-in player/transcript extraction is the gap — heavy lift, niche. |
| Browser extension | Subscribe to feeds from any page, one-click add | Nice UX but separate codebase to maintain. Discovery engine (Phase 4) handles the hard part. |
| Web feed builder | Scrape sites without RSS using CSS selectors | Full custom builder waits. Short-term path is RSSHub-assisted generation in Add Source (Phase 4), which covers common no-RSS cases with less maintenance burden. |
| Custom keyboard bindings | Let users remap shortcut keys | Only NewsBlur has this. Current shortcuts follow universal conventions. |

---

*This roadmap should be revisited after each phase to re-prioritize based on actual usage patterns and new competitive developments.*
