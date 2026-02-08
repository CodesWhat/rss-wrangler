# RSS Wrangler Feature Audit

Audited: 2026-02-07

## Legend
- ✅ IMPLEMENTED - Working as specced
- ⚠️ PARTIAL - Partially built, gaps noted
- 🔲 STUB - UI/API exists but logic is fake or hardcoded
- ❌ MISSING - Not built at all

---

## 1. HOME FEED & STORY CARDS

| Feature | Status | Notes |
|---------|--------|-------|
| Infinite scroll | ✅ | IntersectionObserver + cursor pagination |
| Sort: For You / Latest | ✅ | Toggle works, API supports both |
| Card: Headline | ✅ | All layouts |
| Card: Hero image | ❌ | Data exists in DB, never rendered in UI |
| Card: Source + time | ✅ | All layouts |
| Card: "+N outlets" | ❌ | Data returned by API, not displayed |
| Card: Folder/topic label | ❌ | Data returned by API, not displayed |
| Card: AI summary | ✅ | Compact & card layouts |
| Card: Muted breakout badge | 🔲 | UI exists but `mutedBreakoutReason` always null |
| Action: Open cluster detail | ❌ | No cluster detail page — links to external article |
| Action: Save | ✅ | Full flow |
| Action: Mark read | ✅ | Full flow |
| Action: Not interested | ✅ | Full flow |
| Action: Mute keyword | ❌ | No inline UI |
| Action: Prefer source | ❌ | No inline UI |
| Action: Mute source | ❌ | No inline UI |

## 2. CLUSTER DETAIL & ARTICLE VIEW

| Feature | Status | Notes |
|---------|--------|-------|
| Cluster detail page | ❌ | API ready (`/v1/clusters/:id`), no frontend page |
| AI "Story so far" | ⚠️ | Returns `extracted_text` not AI summary |
| Outlets list | ❌ | API returns members, no UI |
| Split cluster action | ❌ | No endpoint or UI |
| Article reader mode (embedded preview + text/original views) | ❌ | External links only; no in-app reader pane or mode switching |
| Engagement: scroll depth | ❌ | Not tracked |
| Engagement: bounce detection | ❌ | Not tracked |
| Engagement: dwell time | ✅ | IntersectionObserver tracks viewport time |

## 3. PERSONALIZED RANKING

| Feature | Status | Notes |
|---------|--------|-------|
| Recency decay | ✅ | Inverse hour decay |
| Folder/topic affinity | ❌ | Not tracked or used |
| Source weight in ranking | ❌ | DB has `feed.weight` but not in ranking SQL |
| Engagement history | 🔲 | Only "saved" flag used; dwell/click/not-interested ignored |
| Diversity penalty | ⚠️ | Cluster size bonus exists (not true diversity) |
| Exploration quota | ❌ | No low-ranked story surfacing |

## 4. FILTERING (MUTE-WITH-BREAKOUT)

| Feature | Status | Notes |
|---------|--------|-------|
| Filter types: mute/block | ✅ | Both modes work |
| Pre-filter on title+summary | ✅ | Called before clustering |
| Post-filter on rep content | ⚠️ | Missing extracted snippet matching |
| Muted items still cluster | ✅ | Items not dropped |
| Breakout: severity keywords | ✅ | Comprehensive list |
| Breakout: high rep source | ✅ | Checks feed.weight=prefer |
| Breakout: cluster size >= 4 | ✅ | Hardcoded threshold |
| Record filter events | ✅ | Both hidden and breakout logged |
| Badge with breakout reason | 🔲 | UI present but always null from API |
| Filter CRUD UI | ✅ | Full management in Settings |
| AI rule/filter copilot (wand actions: prioritize/tag/block/etc.) | ❌ | No AI-assisted rule suggestions, no impact-preview UX, and no one-click apply flow from filter rows |

## 5. DIGEST

| Feature | Status | Notes |
|---------|--------|-------|
| Trigger: away >= 24h | ❌ | No `last_active_at` tracking |
| Trigger: backlog >= 50 | ✅ | Counts unread clusters |
| Trigger banner on Home | 🔲 | Static banner, not conditional on actual triggers |
| Sections: top/big/scan | ✅ | Three sections with ranking |
| Manual "Generate now" | ❌ | No endpoint or UI button |
| AI-generated digest | ❌ | Just reformats data, no LLM |
| Digest storage/retrieval | ✅ | Full CRUD with history |
| Scheduled generation | ✅ | Daily at 7 AM UTC via pg-boss |

## 6. AI FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| Provider abstraction | ❌ | Hardcoded to OpenAI only |
| Anthropic provider | ❌ | Not implemented |
| Local/Ollama provider | ❌ | Not implemented |
| AI-assisted classification before summarization | ❌ | Pipeline generates summaries directly; no classifier-first routing stage yet |
| Local Llama focus scoring + "likely relevant" labels + auto-tag suggestions | ❌ | No local-Llama/Ollama relevance scorer, no likely-relevant UI label, and no explainable opt-in scoring controls |
| Card summaries (1-2 sentence) | ⚠️ | AI enrichment exists but only when AI mode enabled |
| "Story so far" in detail | ❌ | Returns raw extracted_text, not AI summary |
| Budget cap tracking | ❌ | Setting exists but no usage tracking |
| Feed classification (LLM) | ✅ | OpenAI classifies feeds into topics |
| Topic approval workflow | ✅ | Pending/approved/rejected flow |

## 7. SOURCES MANAGEMENT

| Feature | Status | Notes |
|---------|--------|-------|
| List feeds with metadata | ✅ | Shows folder, weight, trial |
| Custom sidebar tags + icon/emoji picker | ❌ | No tag CRUD model in sidebar and no icon/emoji picker for nav labels |
| Add feed URL | ✅ | Full flow |
| Feed discovery engine (URL → candidates → canonical) | ❌ | Add flow expects direct feed URL; no candidate extraction/scoring UI or `sites`/`feed_candidates` persistence |
| Directory seeding (one-time DB seed from feed-directory.json) | ❌ | Static `feed-directory.json` exists but not imported to Postgres. One-time DB seed needed. |
| On add: article preview + initial pull controls | ❌ | Add flow is URL-only; no sample article preview and no per-feed new-only/backfill selector |
| RSSHub feed ingestion (as normal feed URL) | ✅ | Works through existing add/import flow (no special-case handling required) |
| RSSHub generator in Add Source (for no-RSS sites) | ❌ | No "Generate via RSSHub" assistant UI/endpoint yet |
| OPML import | ✅ | Working endpoint |
| OPML export | ✅ | Added |
| On add: classification prompt | ❌ | No "I categorized this as X. Change?" UI |
| Weight slider (prefer/neutral/depr) | ⚠️ | Dropdown exists but no visual slider |
| Trial flag management | ⚠️ | Exists in DB, not prominent in UI |
| Drift detection (weekly) | ❌ | No weekly job to check category drift |

## 8. SETTINGS

| Feature | Status | Notes |
|---------|--------|-------|
| AI mode (off/summaries/full) | ✅ | Select dropdown |
| AI provider selection | ⚠️ | UI dropdown exists but only OpenAI works |
| AI budget cap | ⚠️ | Setting exists, no usage tracking |
| Digest trigger config | ✅ | Hours and threshold configurable |
| Feed poll interval | ✅ | Configurable |
| Retention settings | ❌ | No retention config |
| Filter management | ✅ | Full CRUD |
| Push notifications | ✅ | Working toggle |

## 9. PWA & AUTH

| Feature | Status | Notes |
|---------|--------|-------|
| Installable PWA | ✅ | Manifest configured |
| Service worker (offline) | 🔲 | SW exists but only handles push, no offline caching |
| Mobile PWA meta tags | ⚠️ | Missing viewport, apple-touch-icon, theme-color |
| Login screen | ✅ | Username/password with bcrypt |
| Access + refresh tokens | ✅ | JWT with rotation |
| Session management | ✅ | DB-tracked sessions with revocation |

## 10. ACCESSIBILITY (WEB/PWA)

| Feature | Status | Notes |
|---------|--------|-------|
| Semantic landmarks + heading structure | ❌ | No documented/verified landmark and heading hierarchy pass across core pages |
| Accessible names + ARIA labeling | ❌ | No audited accessible-name coverage for icon-only buttons, controls, and dynamic regions |
| Keyboard-only navigation parity | ❌ | No end-to-end keyboard interaction pass for core user journeys |
| Focus management (dialogs/drawers/menus) | ❌ | No verified focus trap/restore behavior for overlays and menus |
| Color contrast + visible focus indicators | ❌ | No WCAG contrast audit baseline or enforced focus-visible standard |
| Screen reader validation (NVDA/VoiceOver spot checks) | ❌ | No structured screen-reader QA checklist in delivery flow |

## 11. PIPELINE RELIABILITY

| Feature | Status | Notes |
|---------|--------|-------|
| Retry + exponential backoff | ⚠️ | Relies on pg-boss defaults, no explicit config |
| Stage timeouts | ⚠️ | Poll/fetch have timeouts; AI/clustering don't |
| Per-feed circuit breaker | ❌ | Not implemented |
| Feed revive logic (re-discovery + canonical swap) | ❌ | No repeated-failure revive job that reruns discovery and promotes a new canonical feed candidate |
| Dead-letter queue | ❌ | No handler or table |
| Structured error logging | ✅ | Feed/item IDs logged consistently |
| Selective extraction | ❌ | No extraction stage |

## 12. DATA RETENTION

| Feature | Status | Notes |
|---------|--------|-------|
| Unread max-age enforcement | ❌ | No cleanup job |
| Read items: purge text after 14-30d | ❌ | No cleanup job |
| Saved: keep indefinitely | ✅ | Works but stores more than minimal metadata |

## 13. INTEGRATIONS & CLIENT COMPATIBILITY

| Feature | Status | Notes |
|---------|--------|-------|
| First-party API (Wrangler-native advanced endpoints) | ⚠️ | Core `/v1/*` routes exist (clusters, feedback, events, dwell), but no stable documented contract for explainability payloads and rules/filter audit logs |
| API compatibility layer (Google Reader/Fever-style) | ❌ | Internal `/v1/*` API exists, but no compatibility endpoints or protocol adapters for third-party clients |

## 14. INTEGRATIONS & SEND-TO HOOKS

| Feature | Status | Notes |
|---------|--------|-------|
| Send-to menu (Pocket/Instapaper/Wallabag) | ⚠️ | Basic client-side share links implemented in StoryCard/ShareMenu |
| Webhook dispatch for automation hooks | ❌ | No outbound webhook job/endpoint pipeline yet |
| Connector adapters (Readwise/Notion/Obsidian/Slack/email digest) | ❌ | No first-party connector modules or connector settings UI |

## 15. HOSTED SAAS & COST CONTROLS

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant data model (`tenant_id` + isolation) | ⚠️ | `tenant_id` added across core auth + content tables (feed/item/cluster/cluster_member/read_state/filter/event/digest/topic/feed_topic/annotation/push), tenant-scoped API store queries and worker pipeline writes/reads, DB-level RLS policies enabled/forced, and request/job-level tenant DB context propagation (`app.tenant_id`) added for API protected routes + worker pipeline/digest paths. Remaining gaps: hosted org/team model, tenant-admin tooling, and broader hosted observability around context propagation failures. |
| Hosted auth + onboarding flow | ⚠️ | Tenant-aware auth expanded with hosted signup endpoint (`/v1/auth/signup`), tenant slug + name bootstrap, tenant-scoped login (`tenantSlug`), email verification endpoints (`/v1/auth/verify-email`, resend flow), basic signup page, and first-run onboarding wizard on Home for empty-feed workspaces (add URL/OPML/discover, optional interests starter feeds, AI opt-in preference). Remaining gaps: invite/join flows and persistent server-side onboarding completion state. |
| Hosted account settings: password change/reset | ✅ | Self-serve password change shipped (`/v1/account/password` + Settings UI account section). Password reset flow shipped (forgot/reset endpoints + web forms + email token lifecycle). |
| Hosted account deletion workflow | ⚠️ | Baseline self-serve request/cancel flow shipped (`/v1/account/deletion*` + settings danger-zone UI). Grace window automation, audit notifications, and hard-purge job still missing. |
| Hosted self-serve data download request (GDPR-style) | ❌ | No account-level data-download request flow with async delivery/completion status |
| Entitlements + plan-aware limit enforcement | ❌ | No plan gate middleware or per-user quota checks in API/worker paths |
| Hosted performance/load testing + SLO baselines | ❌ | No scripted multi-tenant load profiles, no launch SLO/error-budget thresholds, and no repeatable perf gate for hosted readiness |
| Billing integration (Lemon Squeezy + pricing/upgrade + plan management UI) | ❌ | No Lemon Squeezy subscription/webhook integration and no hosted pricing/upgrade/plan-management surface |
| Usage metering (feeds/items-day/retention/index size) | ❌ | No usage ledger/rollups for hosted cost calibration |
| Global API rate limiting baseline | ✅ | Fastify global rate limit exists (100 req/min), but not plan-aware |

## 16. DATA PORTABILITY & TRUST

| Feature | Status | Notes |
|---------|--------|-------|
| Full account export bundle (beyond OPML) | ❌ | No one-click export for saved/starred items, annotations, training signals/preferences, filters/rules, and settings metadata |

## 17. ONBOARDING & ACTIVATION

| Feature | Status | Notes |
|---------|--------|-------|
| Guided onboarding wizard (first-run) | ⚠️ | Baseline wizard shipped on Home for empty-feed workspaces with setup paths (add URL, OPML import, discover), optional interests starter feeds, and AI mode opt-in. Remaining gaps: server-side completion tracking and richer topic-to-folder/filter bootstrap logic. |

---

## SUMMARY COUNTS

- ✅ IMPLEMENTED: 36
- ⚠️ PARTIAL: 14
- 🔲 STUB: 6
- ❌ MISSING: 54

## TOP PRIORITY GAPS (from spec)

1. **Hero images not displayed** - data exists, just needs rendering
2. **No cluster detail page** - API ready, frontend missing
3. **No article reader mode** - external links only
4. **Breakout badge always null** - API needs to JOIN filter_event
5. **Ranking ignores most signals** - only uses recency + saved + cluster size
6. **AI provider locked to OpenAI** - Anthropic/Local not wired
7. **No real digest trigger logic** - banner is static
8. **Pipeline has no resilience** - no circuit breaker, dead-letter, or explicit retries
9. **+N outlets and folder labels not shown on cards**
10. **Missing card actions** - mute keyword, prefer/mute source
11. **Hosted onboarding still incomplete** - invite/join flows and persistent completion state needed before hosted public launch
12. **Hosted billing flow not implemented** - Lemon Squeezy + upgrade/plan management required before hosted launch
13. **Feed discovery + directory seeding missing** - need one-time DB seed from feed-directory.json + discovery engine for URL → candidates
14. **Feed revive logic missing** - no automatic rediscovery/canonical swap when feeds repeatedly fail
15. **Accessibility baseline missing** - no explicit WCAG 2.2 AA coverage for semantics, keyboard/focus, contrast, and screen-reader validation
16. **Data portability bundle missing** - no export beyond OPML for saved items, annotations, training signals, and filters/rules
17. **Hosted account management/compliance missing** - account deletion lifecycle automation and GDPR-style data download request flow still missing
18. **Guided onboarding is baseline-only** - wizard exists, but server-side completion state and deeper topic bootstrap are still missing
19. **Hosted load testing missing** - no repeatable multi-tenant performance tests or SLO-based launch gate
