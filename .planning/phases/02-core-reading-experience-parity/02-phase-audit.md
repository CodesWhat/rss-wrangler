# Phase 2 Audit: Core Reading Experience Parity

## Completed Slices
- Breakout badge API wiring (`mutedBreakoutReason` population) (2026-02-09-phase1-breakout-badge-api-fix.md)
slice='Breakout badge API wiring (`mutedBreakoutReason` population)'
- Cluster detail page + card-level story navigation (2026-02-09-phase1-cluster-detail-page.md)
slice='Cluster detail page + card-level story navigation'
- Home feed cards — hero images + outlet count badge (2026-02-09-phase1-home-feed-card-hero-outlets.md)
slice='Home feed cards — hero images + outlet count badge'
- Home feed cards — folder/topic labels across layouts (2026-02-09-phase1-home-feed-card-labels.md)
slice='Home feed cards — folder/topic labels across layouts'
- Mark all read bulk action (with older-than filter) (2026-02-09-phase1-mark-all-read-bulk-action.md)
slice='Mark all read bulk action (with older-than filter)'
- Reader mode baseline on cluster detail (Feed / Original / Text) (2026-02-09-phase1-reader-mode-baseline.md)
slice='Reader mode baseline on cluster detail (Feed / Original / Text)'
- Reader mode completion (extraction state + backfill + smoke proof) (2026-02-09-phase1-reader-mode-complete.md)
slice='Reader mode completion (extraction state + backfill + smoke proof)'
- Replace `rss-parser` with `feedsmith` (2026-02-09-phase1-replace-rss-parser-with-feedsmith.md)

## Verification Signals
- `npm run build -w @rss-wrangler/api`
- `npm run build -w @rss-wrangler/contracts`
- `npm run build -w @rss-wrangler/web`
- `npm run build -w @rss-wrangler/worker`
- `npm run lint`
- `npm run orbstack:smoke`
- `npm run typecheck -w @rss-wrangler/api`
- `npm run typecheck -w @rss-wrangler/contracts`
- `npm run typecheck -w @rss-wrangler/web`
- `npm run typecheck -w @rss-wrangler/worker`
- `npm test -- apps/worker/src/pipeline/stages/__tests__/poll-feed.test.ts`
- `npm test -- apps/worker/src/pipeline/stages/__tests__`

## Remaining Gaps
- Add API route/store tests asserting `mutedBreakoutReason` behavior for hidden vs breakout events.
- Add Playwright coverage for cluster detail reader text-mode state transitions.
- Add a smoke fixture feed for JSON Feed to self-host smoke script to continuously verify parser format coverage.
- Add iframe-block detection hardening and first-party extraction fallback path.
- Add optional DB-level cooldown metadata for extraction failures if retry churn appears in production logs.
- Add optional undo affordance for the bulk-read action.
- Add per-feed reader mode defaults and remember last-used mode.
- Add per-folder/per-topic bulk-read actions in folder/topic pages using the same endpoint scopes.
- Consider parser observability counters by detected format (`rss|atom|rdf|json`) for production telemetry.
- Implement cluster detail page + inline outlet expansion behavior.
- Implement cluster detail page and reader-mode baseline.
- Implement folder/topic label card metadata.
- Implement inline card actions for mute/prefer source/keyword.
- Persist explicit breakout reason payload in `filter_event` to avoid relying on rule pattern fallback.
- Replace raw extracted text in detail view with AI-generated story-so-far summary.
- Ship embedded reader mode (feed/original/text) to close remaining top P0 article-view gap.
- `npm run test:coverage:policy`: not run (UI slice)
- `npm run test:coverage:policy`: not run (UI-only slice)
- `npm run test:coverage:policy`: not run (UI-only slice, no coverage harness updates)
- `npm run test:coverage:policy`: not run (backend query-slice)
- `npm run test:coverage:policy`: not run (feature slice)
- `npm run typecheck`: not run (web build already includes TS check)
- `npm run typecheck`: not run (web build includes TS validation)
- `npm run typecheck`: not run (web build includes TypeScript validation)
- `npm run typecheck`: not run separately (web build includes TypeScript validation)
- `npm test`: not run (no existing frontend unit tests for this surface)
- `npm test`: not run (no focused route/store tests in repo for this path)
- `npm test`: not run (no specific frontend tests for this component)
- `npm test`: not run (no targeted frontend tests for this slice)
- `npm test`: not run (no targeted tests for this flow)
- `npm test`: not run (no targeted tests for this path)
- `npm test`: not run (slice-specific tests not present for these modules)

## Follow-Up Work
1. Convert each remaining gap above into an executable implementation slice with verification.
2. Add targeted automated tests for checks marked not run/not applicable where useful.
3. Re-run build/typecheck/smoke gates after follow-up slices land.
