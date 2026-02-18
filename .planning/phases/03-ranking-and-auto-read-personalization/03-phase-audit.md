# Phase 3 Audit: Ranking and Auto-Read Personalization

## Completed Slices
- Auto-read analytics baseline (scroll/open telemetry) (2026-02-09-phase2-mark-read-analytics-baseline.md)
slice='Auto-read analytics baseline (scroll/open telemetry)'
- Bulk classification auto-read overrides (2026-02-09-phase2-mark-read-bulk-classification-overrides.md)
slice='Bulk classification auto-read overrides'
- Bulk folder auto-read overrides (2026-02-09-phase2-mark-read-bulk-folder-overrides.md)
slice='Bulk folder auto-read overrides'
- Bulk muted/trial auto-read overrides (2026-02-09-phase2-mark-read-bulk-muted-trial-overrides.md)
slice='Bulk muted/trial auto-read overrides'
- Bulk topic auto-read overrides (2026-02-09-phase2-mark-read-bulk-topic-overrides.md)
slice='Bulk topic auto-read overrides'
- Bulk weight auto-read overrides (2026-02-09-phase2-mark-read-bulk-weight-overrides.md)
slice='Bulk weight auto-read overrides'
- Mark-as-read on open option (2026-02-09-phase2-mark-read-on-open.md)
slice='Mark-as-read on open option'
- Mark-as-read on scroll (configurable baseline) (2026-02-09-phase2-mark-read-on-scroll-baseline.md)
slice='Mark-as-read on scroll (configurable baseline)'
- Mark-read per-feed overrides (2026-02-09-phase2-mark-read-per-feed-overrides.md)
slice='Mark-read per-feed overrides'
- Mark-read per-view delay tuning (2026-02-09-phase2-mark-read-per-view-tuning.md)
slice='Mark-read per-view delay tuning'
- Mark-read per-view threshold tuning (2026-02-09-phase2-mark-read-threshold-tuning.md)
slice='Mark-read per-view threshold tuning'
- Diversity penalty + exploration quota baseline in personal ranking (2026-02-09-phase2-ranking-diversity-exploration-baseline.md)
slice='Diversity penalty + exploration quota baseline in personal ranking'
- Explainability UI baseline for personal ranking factors (2026-02-09-phase2-ranking-explainability-ui-baseline.md)
slice='Explainability UI baseline for personal ranking factors'
- Personal-ranking baseline expansion (source weight + engagement + dismiss suppression) (2026-02-09-phase2-ranking-source-engagement-baseline.md)
slice='Personal-ranking baseline expansion (source weight + engagement + dismiss suppression)'
- Topic/folder affinity weighting baseline in personal ranking (2026-02-09-phase2-ranking-topic-folder-affinity-baseline.md)

## Verification Signals
- `npm run build -w @rss-wrangler/api`
- `npm run build -w @rss-wrangler/contracts`
- `npm run build -w @rss-wrangler/web`
- `npm run lint`
- `npm run typecheck -w @rss-wrangler/api`
- `npm run typecheck -w @rss-wrangler/web`

## Remaining Gaps
- Add "on open" option and per-view tuning (list/compact/card).
- Add analytics for auto-read trigger rates and opt-out reasons.
- Add analytics for auto-read triggers.
- Add bulk override actions (apply to folder/topic).
- Add bulk override by classification status.
- Add bulk override by engagement signal.
- Add bulk override by feed weight.
- Add bulk override by muted state.
- Add bulk overrides by topic.
- Add deterministic integration tests around `/v1/events` + `/v1/stats` aggregation.
- Add deterministic ranking tests with seed data for affinity behavior.
- Add deterministic top-N diversity constraints instead of score-only saturation penalty.
- Add diversity penalty and exploration quota to complete ranking phase targets.
- Add explicit exploration quota controls/tuning in settings and seeded ranking tests.
- Add optional per-feed auto-read analytics breakdown in stats.
- Add per-feed overrides and analytics instrumentation for read triggers.
- Add per-view tuning for read thresholds.
- Add seeded e2e/regression tests for delay handling.
- Add seeded e2e/regression tests for on-open read behavior.
- Add seeded e2e/regression tests for scroll-based auto-read.
- Add seeded e2e/regression tests for threshold handling.
- Add seeded ranking regression tests for signal weights and unread suppression.
- Add seeded regression tests for ranking factor calculation and UI rendering.
- Add topic/folder affinity weights and exploration quota.
- Add visibility threshold tuning and per-feed overrides.
- Expand explainability to include why-hidden/why-deduped and filter/dedupe rationale.
- `npm run test:coverage:policy`: not run (backend query slice)
- `npm run test:coverage:policy`: not run (not configured for this slice)
- `npm test`: not run (no package-level test scripts for API/web in current repo)
- `npm test`: not run (no package-level test scripts for web in current repo)
- `npm test`: not run (no seeded ranking fixtures in repo)
- `npm test`: not run (no slice-specific test harness touched)
- `npm test`: not run (no targeted ranking fixtures/tests in repo)

## Follow-Up Work
1. Convert each remaining gap above into an executable implementation slice with verification.
2. Add targeted automated tests for checks marked not run/not applicable where useful.
3. Re-run build/typecheck/smoke gates after follow-up slices land.
