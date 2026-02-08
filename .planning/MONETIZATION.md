# RSS Wrangler Monetization Strategy

> Created: 2026-02-07

---

## Distribution Model

- **Open source** — self-host for free, all features unlocked (like Miniflux, FreshRSS, NewsBlur)
- **Hosted service** — we run it, users bookmark as PWA. Freemium + subscription monetization applies here only.

This is the proven path (Miniflux, GitLab, Plausible, Umami, Ghost). Open source builds trust and community. Hosted service monetizes convenience + managed infrastructure.

---

## Hosted Tier Structure: Freemium + Subscription (+ optional lifetime tier)

Proven model for RSS products. Maps cleanly to account-based entitlements. If native apps are added later, web + iOS + Android can share the same subscription.

---

## Tier Structure

### Free (Hook)

| Limit | Value |
|-------|-------|
| Feeds | 50 |
| Items ingested/day | 500/day |
| Retention window | 30 days |
| Folders/tags | Basic (flat, no subfolders) |
| Search | Title + source name (no full-text article body) |
| Refresh frequency | Every 60 minutes |
| OPML import | **Free** — import allowed, feed count cap enforced (import all, activate up to 50; clear upsell moment) |

### Pro ($7/mo or $70/yr — 2 months free on annual)

| Feature | Description |
|---------|-------------|
| Feeds | Unlimited |
| Items ingested/day | Unlimited |
| Retention | 1 year |
| Folders/tags | Unlimited + subfolders + icon/emoji picker |
| Sidebar personalization | Custom tags in left nav with icon/emoji picker |
| Dedupe controls | Threshold tuning + manual split/merge workflows |
| Refresh | Fast (10 min) |
| Search | Full-text + archived history |
| Sync | Cross-device |
| Rules/filters | Rules engine, auto-tagging |
| Content sources | Newsletters-to-RSS, YouTube-to-RSS, podcast extras |
| Integrations | Read-it-later + hook-based send-to (Readwise/Notion/Obsidian/Slack/email digest), API access, webhooks |
| Offline | Full offline mode (especially mobile) |
| 14-day trial | One-time trial activation from free tier |

### Pro + AI ($14/mo or $140/yr — 2 months free on annual)

Everything in Pro, plus:

| Feature | Description |
|---------|-------------|
| AI summaries / clustering | LLM-powered article summaries and topic clustering |
| AI digest generation | AI-curated daily/weekly digest |
| AI feed classification | LLM topic categorization |
| AI rule/filter copilot | Wand suggestions for prioritize/tag/block |
| AI feed recommendations | Based on reading patterns |
| AI "Story so far" | Cluster-level narrative summary |
| Time-based progressive summarization | Auto-summarize aging stories |

Note: exact AI tier pricing deferred until dogfood pilot measures real token/compute costs. $14/mo is directional.

### Compute Add-ons (future, if needed)

For heavy processing that exceeds standard Pro+AI allocation:

| Add-on | Description |
|--------|-------------|
| High-volume full-text extraction credits | Extra extraction quota for freely accessible pages (never paywalled content) |
| Unlimited archive retention | Beyond 1-year Pro default |
| Priority refresh | Sub-5-min polling |

### Team/Business (Later)

| Feature | Description |
|---------|-------------|
| Shared folders/feeds | Collaborative reading |
| Org billing + admin | Central management |
| SLA + higher limits | Guaranteed uptime, faster refresh |
| Compliance | SOC2 alignment if needed |

### Lifetime (Optional)

- Offer early as cash-flow booster
- Cap availability or raise price over time
- Lifetime can hurt if infra costs grow — be careful

---

## Pricing Guidance

| Tier | Monthly | Annual (2 months free) |
|------|---------|--------|
| Pro | $7 | $70 |
| Pro + AI | $14 | $140 |
| Team | TBD/user | TBD (post-launch) |

Note: AI tier pricing is directional — finalize after dogfood pilot measures real token/compute costs.
Payment processor: **Lemon Squeezy** (Merchant of Record — handles sales tax, VAT, invoicing. No tax ID required.)

Price around value of time saved (search, filters, archive, "never miss updates" reliability).

---

## Architecture: Entitlements System

Design so payment method can change without rewriting everything.

### Core Pattern

```
user_id -> plan -> features -> limits
```

- Internal **Entitlements Service**: single source of truth
- Lemon Squeezy (web payments, MoR) is a **payment provider**, not source of truth
- All clients (web/app) ask API: "What can this user do?"

### App Store Launch Strategy

- Use in-app subscriptions to avoid rejection
- Support "Sign in with Apple/Google" + email login
- Web subscribers log in on mobile, unlock Pro via entitlement sync
- Implement "restore purchases" for platform compliance
- Can offer web + app purchase separately or unified

---

## Ads: Subscription-First, Ad-Ready

- No ads at launch (focus on paid conversion + trust)
- Build ad-ready primitives early so feed architecture does not need a redesign later
- If enabled later: ads are in-feed sponsored stories only (no popups/interstitial/autoplay)
- Free tier only; Pro and Pro+AI remain ad-free
- Hard guardrails: explicit "Sponsored" label, distinct card style, and frequency caps (target max 1 sponsored story per 12-20 organic stories)
- Sponsored stories are excluded from ranking/training signals

---

## Launch Plan

1. Start with **Free + Pro** (single plan, easy to explain)
2. Complete hosted foundation first: **single-product multi-user auth/onboarding + account management/compliance controls + per-user entitlements enforcement**
3. Run an internal **hosted dogfood pilot + synthetic load tests** to measure real cost/user/day and calibrate limits (feeds/items/day/retention/index size)
4. Add **annual billing** early
5. Add **usage-based add-ons** only when cost pressure appears
6. Add **team plan** only after multi-user demand materializes

---

## Implementation Notes

### Current Phase 0 Snapshot (2026-02-08)

- Hosted foundations are in-progress with shipped slices for onboarding wizard, invite-token onboarding guard, password recovery/verification, account-export baseline, account-deletion automation, and load/SLO tooling.
- Identity model alignment is now explicit: hosted and self-host auth UX should be workspace-free (single product, direct user accounts).
- Entitlements are partial: feed/search/ingest gates are live and now sync with Lemon webhook plan changes; broader route coverage + usage UX remain.
- Billing foundation is partial-live: checkout/webhook sync/pricing/portal handoff shipped. Consent baseline is now partial-live; hosted dogfood rollout remains open.
- Deployment bootstrap is in place: Render blueprints exist for free smoke (`render.free.yaml`) and dogfood baseline (`render.yaml`), awaiting first live run.

### What we need to build

- [ ] Entitlements service (user -> plan -> features -> limits) *(partial: baseline service and plan defaults exist)*
- [ ] Free tier enforcement (feed count limit, refresh throttle, search restriction) *(partial: feed/import/search/ingest baseline gates exist)*
- [ ] Limit dimensions model (feeds, items/day, retention, search index bytes) + per-plan defaults *(partial: feeds/items/day/search mode/min poll modeled)*
- [ ] Usage metering pipeline (daily counters + rollups per user) *(partial: daily ingest + feed-count usage baseline exists)*
- [ ] Quota enforcement middleware (soft warning + hard cap behavior) *(partial: hard caps in API/worker baseline, warning UX pending)*
- [ ] Hosted auth via Better Auth (signup/login/password reset/email verify/MFA) with workspace-free UX
- [x] Guided product onboarding wizard (first-run: OPML import / starter directory / add URL + optional topic picks + AI opt-in explanation) *(baseline shipped; deeper bootstrap still pending)*
- [x] Hosted account settings: password change/reset flow (provided by Better Auth)
- [ ] Hosted account deletion workflow (self-serve request, confirmation, grace window, hard purge SLA + worker job) *(partial: request/cancel + worker automation shipped; completion notifications pending)*
- [ ] Hosted self-serve data download request (GDPR-style export request + delivery lifecycle) *(partial: request/status/download baseline shipped; workerization + retention pending)*
- [x] Hosted load-testing harness + SLO budgets (hosted API + worker scenarios, pass/fail thresholds) **(Phase 0 mandatory for hosted launch)**
- [ ] Lemon Squeezy integration (web payments, Merchant of Record) **(Phase 0 mandatory for hosted launch)** *(partial: checkout + signed webhook sync + subscription mapping shipped)*
- [ ] Plan selection UI (pricing page, upgrade flow) **(Phase 0 mandatory for hosted launch)** *(partial: pricing page + upgrade checkout redirects shipped)*
- [ ] Plan management UI (change/cancel/reactivate + billing portal handoff) **(Phase 0 mandatory for hosted launch)** *(partial: billing overview + portal handoff shipped; explicit in-app cancel/reactivate controls pending)*
- [ ] Sponsored-story feed primitives (new `sponsored` item type, mandatory label/style, frequency caps, and feature flag default OFF)
- [ ] Hosted consent baseline for cookies/storage (`necessary` by default + persistent "Privacy settings" reopen + consent withdrawal flow) *(partial: per-user consent persistence + persistent privacy controls shipped)*
- [ ] Region-aware gating for non-essential scripts and CMP adapter (if Google ads target EEA/UK/CH, use Google-certified CMP path) *(partial: region detection + consent metadata shipped; CMP adapter and provider-specific script gating tests pending)*
- [ ] Usage tracking for compute add-ons (token counting, extraction counts)
- [ ] Full account export bundle (beyond OPML): saved/starred items, annotations, training signals, filters/rules, settings metadata
- [ ] Annual billing option **(Phase 0 if pricing model includes annual at launch; otherwise first post-launch billing iteration)**

### What we DON'T need yet

- App Store / Play billing (PWA-first, no native apps planned)
- Team billing (org billing not needed yet)
- Lifetime tier (evaluate after launch)
- Self-host licensing (open source = all features free when self-hosted)

---

## Feature-to-Tier Gate Map

Every feature we build should know its tier. Self-hosted = all unlocked. Hosted = gated per below.

### Free Tier

| Feature | Limit |
|---------|-------|
| Feed subscriptions | Up to X (TBD: 25/50/100) |
| Folders | Manual only, flat (no subfolders) |
| Refresh interval | 30-60 min |
| Search | Title-only, no full-text, no archive |
| Add feed by URL (any valid feed URL, including RSSHub output) | Full |
| Read/unread/save/dismiss | Unlimited |
| Keyboard shortcuts | Full |
| OPML import | Full (feed count cap enforced — imports all, activates up to free limit, clear upsell) |
| OPML export | Full |
| Basic card view (headline, source, time) | Full |
| Mark all as read (global only) | Full |
| On add: source preview + default initial sync policy | Full (preview latest sample; default to new-only/mark-existing-read) |
| Sponsored stories (if enabled) | In-feed only, clearly labeled, capped frequency (target max 1 per 12-20 organic stories) |

### Pro Tier

| Feature | Gate |
|---------|------|
| Unlimited feeds | Pro |
| Subfolders + nested organization | Pro |
| Custom sidebar tags + icon/emoji picker | Pro |
| Advanced dedupe controls (threshold tuning + split/merge tools) | Pro |
| On add: backfill controls (last N items / N days with caps) | Pro |
| Fast refresh (5-10 min) | Pro |
| Full-text search + archive | Pro |
| Rules engine + automation | Pro |
| Advanced content rewrite/scrape rules (per-domain) | Pro |
| Newsletters-to-RSS | Pro |
| Webhooks + first-party API access (Wrangler-native) | Pro |
| Integration hooks + send-to connectors (Readwise/Notion/Obsidian/Slack/email digest) | Pro |
| API compatibility layer (Google Reader/Fever subset) | Pro |
| Offline PWA | Pro |
| Reader mode (full-text extraction) | Pro |
| Saved searches | Pro |
| Per-feed/folder mark-all-read | Pro |
| Mark above/below as read | Pro |
| Feed discovery engine (URL → candidates → canonical) | Pro |
| RSSHub-assisted feed generation (Add Source helper for no-RSS sites) | Pro |
| Feed health monitoring | Pro |
| Gesture navigation | Pro |
| Annotations/highlights | Pro |
| Share to external services | Pro |
| Per-feed notification rules | Pro |
| Data retention controls | Pro |
| Guaranteed ad-free experience (no sponsored stories) | Pro |

### AI Add-on (on top of Pro)

| Feature | Gate |
|---------|------|
| AI folder organization (auto-classify, suggest hierarchy) | AI |
| AI article summaries | AI |
| AI "Story so far" on clusters | AI |
| AI digest generation (LLM-written) | AI |
| AI feed recommendations | AI |
| AI feed classification (LLM topics) | AI |
| AI-assisted classification before summarization | AI (hosted) / self-host BYO local Llama compute |
| AI rule/filter copilot (wand suggestions for prioritize/tag/block/actions) | AI |
| Local Llama focus scoring + "likely relevant" labels + auto-tag suggestions | Self-host only (initial); if launched on hosted later, gate as AI add-on. Opt-in only. |
| AI feed drift detection | AI |
| Semantic search (pgvector, natural language queries) | AI |
| Time-based progressive summarization (auto-summarize aging stories) | AI |
| AI budget tracking | AI (self-managed) |

### Free on All Tiers

| Feature | Why Free |
|---------|----------|
| Hero images on cards | Basic UX |
| Embedded reader preview (feed/original views) | Core reading UX |
| Add-source preview (sample recent items before subscribe) | Core discovery UX |
| Baseline dedupe clustering (simhash + Jaccard) | Core reading quality |
| +N outlets badge | Basic UX |
| Folder/topic labels on cards | Basic UX |
| Breakout badge | Basic UX |
| Accessibility baseline (WCAG 2.2 AA) | Table stakes for a usable web/PWA product; never gated |
| Guided onboarding wizard (first-run setup) | Activation baseline; never gated |
| Hosted account settings (password change/reset) | Compliance + baseline account control |
| Hosted account deletion workflow | Compliance/right-to-erasure baseline |
| Hosted self-serve data download request (GDPR-style) | Compliance + trust/no lock-in baseline |
| Dark/light theme | Basic UX |
| Keyboard shortcuts | Basic UX |
| Push notifications (basic) | Engagement hook |
| OPML export | Trust / no lock-in |
| Full account export bundle (saved/annotations/training/rules/settings) | Trust / no lock-in; open-source selling point |

### Architecture Implication

Every API endpoint and worker job should check entitlements:

```
// Middleware pattern
async function requirePlan(plan: 'free' | 'pro' | 'ai') {
  const user = getUser(request);
  const entitlements = await getEntitlements(user.id);
  if (!entitlements.hasAccess(plan)) {
    return reply.paymentRequired('Upgrade to Pro');
  }
}
```

Self-hosted mode: entitlements always return `true` for everything. No license checks.

---

## Copyright / Content Risk

### Offline Caching
- **On-device only** via service worker + IndexedDB — content never stored on our servers
- Same legal footing as browser cache — no distribution, no hosting of copies
- Works identically for self-hosted and hosted versions

### Full-Text Extraction (Reader Mode)
- Highest risk feature — pulling and rendering full article content from publisher sites
- Gated behind **Pro tier** — gives us control over who uses it + TOS enforcement
- **Per-feed opt-in** — off by default, user explicitly enables per feed
- **Hosted architecture**: extract on request → serve to browser → do NOT persist server-side. On-device cache only (IndexedDB). Same legal footing as user's browser visiting the page directly.
- **Paywalled content**: do NOT extract. If feed serves excerpts only and full article is behind paywall, respect that. Only extract from freely accessible pages.
- **Self-hosted**: user's server, user's choice — full persistence is fine
- **TOS**: "for personal use only, no redistribution"
- **Rate limiting**: extraction requests throttled per user to prevent abuse

### Content Rewrite/Scrape Rules (Advanced)
- Purpose is normalization and repair: tracking URL cleanup, malformed feed cleanup, and extraction fallback for freely accessible pages
- **Paywall guardrail**: rules must not bypass paywalls, authentication, or subscriber-only controls
- **Hosted**: run curated rule packs only (reviewed/allowlisted); no arbitrary user-supplied scraping code
- **Self-hosted**: users may run custom rules at their own risk

### API Compatibility Layer (Google Reader / Fever subset)
- Hosted feature is **Pro-gated** to control sync load from third-party clients
- Scope is a practical compatibility subset first (subscriptions + read/starred state + basic item listing), not full protocol parity on day one
- Wrangler PWA remains the advanced client for clustering, AI, annotations, and explainability
- Apply per-user rate limits and usage monitoring to keep hosted costs predictable

### First-Party API (Wrangler-native)
- Treat Wrangler API as a product contract, not just internal glue for the web app
- Version and document advanced endpoints for clusters, learning signals, explainability payloads, and rules/filter audit logs
- Compatibility adapters (Google Reader/Fever) should translate into this API rather than bypass it
- Hosted access is **Pro-gated** with per-token/user rate limits; self-hosted remains fully unlocked

### Local Llama (Optional, Not Day 1)
- Planned as an optional self-hosted path for AI-assisted classification before summarization
- Planned follow-on: optional local-Llama relevance scoring for Focus mode, "likely relevant" labels, and suggested auto-tags
- Hosted day-1 scope excludes local-Llama endpoint scoring; revisit later under AI add-on if demand justifies it
- Keep day-1 scope lean: ship baseline summaries first, then add classifier-first routing once provider abstraction is stable
- Trust controls: keep this opt-in (global and per-feed/folder), and keep "Why shown" explainability wired to score factors

### RSSHub Upstream Feed Factory
- RSSHub-generated feed URLs are treated as standard feed URLs in normal add/import flows
- Planned Add Source helper: "Generate via RSSHub" for common no-RSS sites using known route templates
- Hosted gating: helper UX is **Pro-gated** with discovery features; direct URL add remains available to all tiers

### Integration Hooks (Non-Core, Planned)
- Integration strategy is hook-first: event/webhook delivery plus lightweight connector adapters
- Prioritized connectors: Readwise, Notion, Obsidian, Slack, and digest-to-email forwarding
- Not a core reading-path dependency; ship incrementally after core reading/ranking reliability work
- Hosted access is **Pro-gated** and rate-limited; self-hosted can extend connectors freely

### Consent / Cookies (Hosted)
- Start with strictly-necessary auth/security storage only by default
- Gate all non-essential analytics/ad storage behind explicit opt-in and allow withdrawal at any time
- If Google ads are enabled for EEA/UK/CH traffic, use a Google-certified CMP; default path is Google Privacy & messaging
- Keep consent state auditable and versioned to support policy changes

### Hosted SaaS Cost Tracking Pilot
- Recommended first step: run your own hosted deployment and use it as a dogfood account to gather real cost baselines
- Track per-user metrics: feeds count, items ingested/day, retained items, search index bytes, and worker/runtime cost
- Use measured p50/p95 usage to set Free/Pro defaults instead of guessing
- Add scripted synthetic load profiles (hosted read/write + ingest pipeline) to validate p95 latency/error budgets before public launch
- Start with soft limits + warnings; move to hard limits once UX and thresholds are stable

### What We Store Server-Side
- RSS feed metadata (title, summary, URL, published date) — this is published for consumption, low risk
- Feed-provided article fields from RSS/Atom/JSON Feed payloads (title/summary/content that the feed itself publishes)
- AI-generated summaries — transformative use, our own content
- **Do NOT store** full-page extraction results server-side on hosted version

### Self-Hosted
- User's server, user's risk — same as running Miniflux/FreshRSS
- No copyright liability for us

---

## Locked Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Auth provider | Better Auth (MIT, npm library in Fastify process, $0 cost) | 2026-02-07 |
| Identity/isolation model (v1) | Single-product multi-user UX. No workspace field in auth screens. Keep `tenant_id` scaffolding internal during transition with default tenant scope. | 2026-02-08 |
| OPML import gating | Free (import allowed, feed count cap enforced, clear upsell moment) | 2026-02-07 |
| AI pricing model | Defer until dogfood pilot. Direction: $7/mo Pro, $14/mo Pro+AI | 2026-02-07 |
| Deployment platform | Render (separate services: web, API, worker, Postgres) | 2026-02-07 |
| API architecture | Keep Fastify separate from Next.js (multi-client support, independent scaling) | 2026-02-07 |
| Transactional email | Resend (free tier: 100/day, 3k/month) | 2026-02-07 |
| Payment processor | Lemon Squeezy (Merchant of Record, handles tax/VAT, no tax ID needed) | 2026-02-07 |
| Database | Render Postgres | 2026-02-07 |
| Object storage | Cloudflare R2 (free egress, 10 GB free) | 2026-02-07 |
| Caching | No Redis — Postgres for rate limiting. Add Upstash only if multi-instance scaling requires it | 2026-02-07 |
| Free tier: feeds | 50 | 2026-02-07 |
| Free tier: items/day | 500 | 2026-02-07 |
| Free tier: retention | 30 days | 2026-02-07 |
| Free tier: refresh | 60 minutes | 2026-02-07 |
| Free tier: search | Title + source name (no full-text body) | 2026-02-07 |
| Pro: refresh | 10 minutes | 2026-02-07 |
| Pro: retention | 1 year | 2026-02-07 |
| Pro: pricing | $7/mo, $70/yr (2 months free on annual) | 2026-02-07 |
| Pro+AI: pricing | $14/mo, $140/yr (directional, finalize after dogfood) | 2026-02-07 |
| Pro trial | 14-day trial (one-time activation from free tier) | 2026-02-07 |
| Annual discount | 2 months free (~17% off) | 2026-02-07 |
| Feed discovery | Sync with timeout (3-5s results, async fallback for slow sites) | 2026-02-07 |
| RSSHub | Both: default public rsshub.app + configurable private URL in settings | 2026-02-07 |
| Directory seeding | One-time DB seed from existing feed-directory.json, organic growth after. No pack builder pipeline. | 2026-02-07 |
| Self-hosted distribution | Docker Compose (API + Worker + Postgres + Web in one compose file) | 2026-02-07 |
| Queue system | pg-boss (Postgres-backed, already working, no Redis needed) | 2026-02-07 |
| Search | Postgres FTS (tsvector/tsquery, already started). Add dedicated search engine only if scale demands. | 2026-02-07 |
| Observability | Sentry (error tracking + perf) + Render built-in logs/metrics | 2026-02-07 |
| Ads strategy | Subscription-first at launch. If enabled later: free-tier-only in-feed sponsored stories, explicit labels, capped frequency, no ranking/training contamination. Paid tiers stay ad-free. | 2026-02-08 |
| Consent/CMP strategy | Hosted baseline: necessary-only by default + consent preferences for non-essential storage. If Google ads are enabled in EEA/UK/CH, use Google-certified CMP (default path: Google Privacy & messaging). | 2026-02-08 |

---

## Open Questions

All major pricing and limits questions resolved. Remaining:

- ~~What's the free tier feed limit?~~ **RESOLVED: 50 feeds**
- ~~What's the free tier items/day limit?~~ **RESOLVED: 500/day**
- ~~What's the free tier retention window?~~ **RESOLVED: 30 days**
- ~~What's the free tier search index size limit?~~ **RESOLVED: N/A — search is title + source name on free, full-text on Pro. Index size not separately metered.**
- ~~What's the free tier refresh interval?~~ **RESOLVED: 60 minutes**
- ~~Do we gate OPML import or keep it free?~~ **RESOLVED: Free with feed cap enforcement**
- ~~Where does AI enrichment fall — Pro base or add-on?~~ **RESOLVED: Separate tier. Pro = $7, Pro+AI = $14. Finalize after dogfood.**
- ~~Do we need a "trial" period for Pro features?~~ **RESOLVED: 14-day one-time trial**
- ~~Do we ship ads at launch?~~ **RESOLVED: No. Keep subscription-first launch and build ad-ready sponsored-story architecture behind flags.**
- ~~What CMP path do we use if ads/trackers are enabled?~~ **RESOLVED: Google-certified CMP path for Google ads in EEA/UK/CH (default: Google Privacy & messaging).**

---

## Context

- RSS Wrangler does feed fetching/reading AND full-text extraction + AI summarization + clustering
- Target is prosumers (power readers, researchers, news junkies)
- **Open source + hosted SaaS** model (like Ghost, Plausible, Umami, Miniflux)
- Self-hosters get everything free, bring their own AI keys
- Hosted users pay for convenience + managed infra + included AI compute
- PWA is the primary mobile experience (bookmark to home screen)

## Identity & Isolation Notes

Product model:

- Self-hosted = single instance, one bootstrap admin, many users.
- Hosted = one Wrangler product, many direct user accounts (Free/Pro/Pro+AI per user).
- Workspace slug is not a user-facing concept in v1 auth UX.

Phase 0 mandatory scope for launch readiness:

- [ ] Workspace-free auth UI/UX (login/signup/recovery/verification)
- [ ] User registration + onboarding via **Better Auth** (signup/login/email verify/MFA) — **LOCKED**
- [ ] Hosted account settings (password change/reset) via **Better Auth** — **LOCKED**
- [ ] Hosted account deletion flow (self-serve request + purge lifecycle)
- [ ] Hosted self-serve data download requests (GDPR-style)
- [ ] Plan/entitlement enforcement middleware (per-user)
- [ ] Shared infrastructure (one worker pool serving all users)
- [ ] Transactional email via **Resend** — **LOCKED**
- [ ] All services on **Render** (web + API + worker + Postgres) — **LOCKED**
