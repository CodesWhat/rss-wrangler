# RSS Wrangler — Internal Working Roadmap

> Last updated: 2026-02-18
> Hosted at: https://rsswrangler.codeswhat.com (Hetzner, Docker Compose)
> Philosophy: **One codebase. Hosted and self-hosted are the same thing.** Self-hosted just has all features unlocked via env flag.

---

## Guiding Principles

1. **A working reader first.** Nobody cares about AI summaries if mark-as-read is buggy.
2. **Ship what one person can maintain.** Kill scope that requires ongoing ops work with no clear payoff.
3. **Hosted = self-hosted + billing.** No separate codepaths. Tier enforcement is middleware, not architecture.
4. **Post-launch means post-launch.** Features marked post-launch stay parked. Resist scope creep.

---

## Current State (2026-02-18)

The app works. You can add feeds, read articles, mark read, save, filter, get digests. The 3-pane reader layout is shipped. AI enrichment pipeline (OpenAI/Anthropic/Ollama) is wired. Billing (Lemon Squeezy) is wired end-to-end. Auth (Better Auth) is working. Docker Compose self-host is green.

**What's actually broken or missing for daily use:**
- Pipeline has zero resilience (no circuit breaker, no dead-letter, no retry config)
- Digest banner is static (not conditional on real triggers, no AI generation)
- Engagement signals are incomplete (no scroll depth, no bounce detection)
- Offline PWA is a stub (service worker handles push only)
- Mobile viewport meta tags are incomplete
- Accessibility is not audited (no WCAG pass)
- "Story so far" on cluster detail returns raw text, not AI summary
- AI budget tracking: setting exists but nothing is tracked
- No feed discovery engine (add-source expects direct feed URLs)
- No directory seeded into DB
- Data retention cleanup jobs not wired (settings exist, nothing runs)

---

## >>>>>>> WE ARE HERE <<<<<<<

Phase 1 is the current focus. Everything above is shipped. Everything below is the work.

---

## Phase 1: Core Reader Polish

**Goal:** Fix every paper cut. Make the daily reading experience feel solid. A person should be able to use this as their only RSS reader without hitting broken flows.

### Already Done
- 3-pane reader layout (sidebar + list + reader pane)
- Feed/Original/Text mode toggle on articles
- Per-feed default reader mode (Sources page dropdown)
- Infinite scroll with cursor pagination
- Sort: For You / Latest
- Card: headline, hero image, source + time, +N outlets, folder/topic label, AI summary
- Card actions: save, mark read, not interested, mute keyword, prefer/mute source
- Mark all as read with time filter (all unread / older than 24h / older than 7d)
- Mark as read on scroll (configurable, with per-feed overrides)
- Muted breakout badge with reason
- Keyboard shortcuts (j/k navigation, ?, basic vim set)
- Dark/light theme
- Dwell time tracking
- Full-text search with AND/OR/NOT operators
- Saved searches with one-click apply/delete
- Search within feed/folder scope
- Onboarding wizard (baseline: add URL, OPML import, discover, AI opt-in)

### Missing / Broken -- Fix Now
- [ ] **Pipeline resilience basics** -- per-feed circuit breaker (back off after N failures, auto-recover), explicit retry config per stage, stage timeouts for AI/clustering. Without this, one bad feed can jam the whole pipeline.
- [ ] **Dead-letter queue** -- failed pipeline items routed to DLQ table with error context. Currently failures are logged and lost.
- [ ] **Data retention cleanup jobs** -- wire unread max-age enforcement and read-item purge. Settings exist but nothing actually runs.
- [ ] **Digest trigger logic** -- track `last_active_at`, make banner conditional on real triggers (away >= 24h OR backlog >= 50), not just static.
- [ ] **Cluster detail: AI "Story so far"** -- currently returns raw `extracted_text`. Wire LLM summary generation for cluster detail page.
- [ ] **Mobile viewport/meta fixes** -- add missing viewport, apple-touch-icon, theme-color meta tags. Basic PWA installability should be correct.
- [ ] **Engagement: scroll depth + bounce detection** -- add to implicit signal tracking. Ranking needs these to improve.
- [ ] **Accessibility quick pass** -- semantic landmarks/headings on core pages (home, settings, add source, reader), keyboard-only navigation audit, visible focus styles. Not a full WCAG audit, but catch the worst offenders.
- [ ] **Weight slider UX** -- dropdown exists for prefer/neutral/deprioritize but it's not prominent. Make it easy to train.

### Acceptance Criteria
A new user can: install via Docker Compose, add feeds via URL or OPML import, read articles in the 3-pane reader, mark read/save/dismiss, get a digest after being away, and not hit any broken flows on desktop or mobile. Pipeline recovers gracefully from bad feeds.

---

## Phase 2: Feed Management

**Goal:** Make it easy to find, add, organize, and maintain feeds. OPML import should be bulletproof. Folder management should be intuitive.

### Already Done
- Add feed by URL (full flow)
- OPML import / export (working)
- RSSHub feed ingestion (works as normal feed URL)
- Feed health monitoring (per-feed health badge, last success/failure in Sources)
- Folder/category organization (via topics)
- Feed classification (LLM topics with approval workflow)
- Weight slider (prefer/neutral/deprioritize)
- Trial flag in DB

### Missing -- Build Next
- [ ] **Feed discovery engine** -- paste any URL, extract feed candidates (HTML link tags, common paths, anchor scan), validate, score, present options. Currently expects direct feed URL. This is the #1 friction point for new users.
- [ ] **Directory seeding** -- one-time DB seed from existing `feed-directory.json` (500+ curated feeds). Script exists conceptually, needs to actually run.
- [ ] **Add-source preview** -- show sample recent items before subscribing (headline, source, publish time). Currently it's URL-in, subscribe, hope for the best.
- [ ] **On-add classification prompt** -- "I classified this as X. Change?" UI after adding a feed.
- [ ] **Folder organization modes** -- settings toggle for Manual (user creates all) vs AI (LLM auto-classifies) vs Hybrid (AI suggests, user approves). Currently AI-only topic assignment.
- [ ] **Feed error dashboard** -- admin view of all feeds with error state, retry count, last fetch. Sources page shows health badges but no drill-down.

### Acceptance Criteria
A new user can paste a blog URL (not a feed URL) and RSS Wrangler finds the feed. OPML imports of 200+ feeds complete without errors. Feed errors are visible and actionable. Folder management feels intentional, not accidental.

---

## Phase 3: Search & Filtering

**Goal:** Full-text search works reliably. Filter/mute rules work end-to-end. Power users can tune their noise controls.

### Already Done
- Full-text search (Postgres FTS, tsvector/tsquery)
- Search operators (AND/OR/NOT via websearch_to_tsquery)
- Saved searches (persisted presets)
- Search within feed/folder scope
- Keyword mute/block filters (full CRUD)
- Pre-filter on title+summary
- Muted items still cluster (breakout system)
- Filter CRUD UI in Settings

### Missing -- Build Next
- [ ] **Expand filter types** -- add author, domain, URL pattern as filter conditions. Currently keyword-only.
- [ ] **Keep/allow filter mode** -- in noisy feeds, only let matching items through (inverse of mute). Per-feed or folder scope.
- [ ] **Post-filter on rep content** -- missing extracted snippet matching after full-text fetch.
- [ ] **Expand search index** -- add author, feed domain/title to search_vector. Currently searches article title + body only.
- [ ] **Tunable noise controls** -- expose dedup aggressiveness (Jaccard threshold, currently hardcoded 0.25) and mute strictness (breakout cluster size, currently hardcoded 4) as per-user settings.

### Post-Launch (Park These)
- Regex filter support
- Full rules engine (trigger-condition-action automation)
- Keyword alert monitoring feeds
- Webhook on article match

### Acceptance Criteria
User can mute by keyword, author, or domain. Filters work across all feed content (not just titles). Search returns results from article body, author, and feed name. Hardcoded thresholds are user-configurable.

---

## Phase 4: AI Enrichment

**Goal:** Layer AI features on top of the working base. Summaries, classification, smart digests. Multi-provider is already wired -- make it useful.

### Already Done
- Provider abstraction (AiProviderAdapter interface + AiRegistry)
- OpenAI, Anthropic, Ollama adapters wired
- AI provider selection UI (dropdown + API key management + fallback toggle)
- AI mode toggle (off/summaries/full)
- Card summaries (1-2 sentence, when AI mode enabled)
- Feed classification (LLM topics with approval workflow)
- Topic approval workflow (pending/approved/rejected)
- Digest storage/retrieval (full CRUD with history)
- Scheduled digest generation (daily 7am via pg-boss)

### Missing -- Build Next
- [ ] **AI "Story so far"** -- LLM-generated narrative summary on cluster detail page. Currently returns raw extracted_text.
- [ ] **AI digest generation** -- LLM writes the digest narrative, not just reformatting. Uses engagement preferences to curate what makes the cut.
- [ ] **Manual "generate digest" button** -- on-demand generation. Currently only scheduled.
- [ ] **AI budget tracking** -- track token usage per provider, enforce monthly budget cap. Setting exists but no actual tracking.
- [ ] **Feed drift detection** -- weekly job re-classifies feeds, flags topic changes for review.
- [ ] **Ranking: diversity penalty improvements** -- baseline exists, needs richer cross-topic sequencing controls.
- [ ] **Ranking: exploration quota controls** -- baseline exists (~8% low-signal boost), no user-facing controls.
- [ ] **Explainability: "Why hidden/deduped"** -- "Why shown" baseline exists on cards. Add reasoning for hidden and deduped items.

### Post-Launch (Park These)
- AI-assisted classification before summarization (classifier-first routing)
- Local Llama focus scoring + "likely relevant" labels
- AI feed recommendations ("readers like you also follow")
- Time-based progressive summarization (auto-summarize aging stories)
- AI rule/filter copilot (wand suggestions)
- Semantic search (pgvector embeddings)
- Ask AI / conversational ("chat with your feed")

### Acceptance Criteria
Cluster detail page shows a coherent AI-written summary. Digest page shows AI-generated narrative, not just a reformatted list. Token usage is tracked and visible. Budget cap actually enforces.

---

## Phase 5: Billing & Monetization

**Goal:** Tier enforcement works end-to-end on the hosted instance. Free users hit limits gracefully. Pro users get what they pay for. Self-hosted users see none of this.

### Already Done
- Lemon Squeezy integration (checkout, signed webhook sync, subscription mapping)
- Pricing page with monthly/annual toggle
- Plan management UI (change/cancel/reactivate + billing portal handoff)
- Annual plan variants + webhook failure alerting
- Entitlements service baseline (plan defaults, feed-cap checks, search-mode gating, min-poll enforcement)
- Daily ingest budget reservation/release
- Settings billing UI (feeds, items/day, search mode, poll minimum)
- Global API rate limiting (100 req/min, not plan-aware)

### Missing -- Build Next
- [ ] **Broader entitlement route coverage** -- many API routes don't check entitlements yet. Need `requirePlan()` middleware on all gated endpoints.
- [ ] **Retention/index-size metering** -- daily ingest metering exists, but retention and search index size are not tracked.
- [ ] **Plan-aware rate limiting** -- global limit exists but doesn't differentiate Free vs Pro.
- [ ] **Usage dashboard** -- per-provider token tracking is wired but no UI. Users need "you've used X of Y this month."
- [ ] **Soft warning UX** -- hard caps exist but no soft warnings ("you're at 45/50 feeds, upgrade for unlimited").
- [ ] **14-day Pro trial** -- specced but not implemented. One-time activation from free tier.
- [ ] **Account deletion: completion notification** -- lifecycle automation works, user isn't notified when purge completes.
- [ ] **Data export hardening** -- baseline exists, needs worker queue processing, completion notifications, retention/purge for bundles.
- [ ] **Consent/CMP completion** -- consent persistence + controls shipped, CMP adapter and script-gating verification still pending.

### Self-Hosted Behavior
All entitlements return `true`. No billing UI shown. No limits enforced. Controlled by env flag.

### Acceptance Criteria
Free user hits 50-feed limit and sees clear upgrade prompt. Pro user has unlimited feeds and fast refresh. Usage dashboard shows real numbers. Self-hosted user sees no trace of billing.

---

## Phase 6: Mobile PWA Polish

**Goal:** PWA feels native on mobile. Offline works. Touch interactions are smooth.

### Already Done
- Installable PWA (manifest configured)
- Push notifications (working toggle)
- Mobile responsive layout (hamburger sidebar, stacked layout on small screens)

### Missing -- Build Next
- [ ] **Offline mode** -- service worker + IndexedDB caches articles + images. "Offline saved only" vs "offline everything" toggle. Sync read-state on reconnect.
- [ ] **Gesture navigation** -- swipe left/right for mark-read, save, dismiss. Swipe between articles.
- [ ] **Pull-to-refresh** -- swipe down to refresh from top of list.
- [ ] **Font/density customization** -- user-configurable font family, size, content density.
- [ ] **Mobile accessibility** -- minimum tap target sizes, reduced-motion support, dynamic text scaling, safe-area audits.
- [ ] **Additional themes** -- sepia reading theme, OLED dark theme.

### Acceptance Criteria
User installs PWA on phone, reads articles offline on the train, swipes to mark read, everything syncs when back online. Touch targets are not frustratingly small.

---

## Post-Launch (Parked)

These are real features that real users might want. Build only when someone asks.

| Feature | Why Parked |
|---------|-----------|
| Newsletter ingestion via email | Requires email infra, unique addresses, parsing. Niche use case. |
| YouTube channels as feeds | Already works via RSS URLs. Built-in player is the gap -- heavy lift. |
| Podcast player | Podcast apps exist. Feed subscription already works. |
| Reddit/social feeds | RSS bridges (RSSHub) handle this already. |
| Web feed builder (scrape no-RSS sites) | RSSHub covers common cases. Full scraper is a separate product. |
| Browser extension | Separate codebase. Discovery engine handles the hard part. |
| Full rules engine (trigger-condition-action) | Build incrementally as filter types expand. Don't ship a rules platform. |
| Article annotations/highlights | Real feature, layer on post-launch. |
| API compatibility (Google Reader/Fever) | Third-party client sync. Power user niche. |
| Custom keyboard bindings | Current shortcuts follow conventions. Low demand. |
| Semantic search (pgvector) | Keyword FTS + clustering covers 95% of needs. |
| Ask AI / conversational | Enterprise-tier at competitors. Low demand. |
| Public shared feed (blurblog) | Social reading is a different product. |
| Drag-and-drop feed reorder | Nice UX, not blocking anything. |
| Sponsored story card primitives | Build only if ads become a real revenue path. |
| Integration hooks (Readwise/Notion/Obsidian/Slack) | Webhook substrate first, connectors incrementally. |
| Full data portability export (beyond OPML) | OPML covers feeds. Richer export is post-launch. |
| Per-feed view settings | Nice customization, not blocking. |
| Mute filters with duration (1d/1w/1m) | Feedly-only feature. Low priority. |
| Custom sidebar tags + icon/emoji picker | Pro feature, post-launch polish. |
| Feed revive logic (auto rediscovery on repeated failure) | Nice resilience feature, not needed for launch. |

---

## Killed (Not Building)

| Feature | Why |
|---------|-----|
| Team/enterprise features | Not a collaboration platform. |
| Native mobile apps (iOS/Android) | PWA covers this. |
| SAML/SSO | Overkill for target audience. |
| Text-to-speech | Browser handles this natively. |
| Article translation | Browser handles this natively. |
| Bionic reading | Debatable effectiveness, single-app novelty. |
| Story change tracking / diffs | Storage-heavy niche feature. |
| Custom CSS/JS injection | Creates support burden. |
| Multi-user collaboration (shared folders, @mentions) | Different product. |
| 40M+ source discovery database | Massive crawl infra for marginal benefit. |
| Zapier/IFTTT official apps | Users can connect webhooks themselves. |

---

## Locked Decisions (Reference)

| Decision | Choice |
|----------|--------|
| Hosting | Hetzner VPS, Docker Compose (rsswrangler.codeswhat.com) |
| Self-hosted distribution | Docker Compose (same image as hosted) |
| Feature gating | Env flag unlocks everything for self-host |
| Auth | Better Auth (MIT, in-process, $0) |
| API | Fastify (separate from Next.js) |
| Queue | pg-boss (Postgres-backed, no Redis) |
| Search | Postgres FTS (tsvector/tsquery) |
| Payments | Lemon Squeezy (Merchant of Record) |
| Email | Resend (transactional) |
| AI | Multi-provider: OpenAI, Anthropic, Ollama |
| Database | PostgreSQL 16 |
| Caching | No Redis. Postgres for rate limiting. |

---

*Review after each phase ships. Promote from post-launch to active only with evidence of demand.*
