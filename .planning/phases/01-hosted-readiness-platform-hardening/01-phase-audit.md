# Phase 1 Audit: Hosted Readiness and Platform Hardening

## Completed Slices
- Hosted account data export baseline (request/status/download) (2026-02-08-phase0-account-data-export-baseline.md)
slice='Hosted account data export baseline (request/status/download)'
- Hosted account deletion lifecycle automation (grace window + hard purge) (2026-02-08-phase0-account-deletion-automation.md)
slice='Hosted account deletion lifecycle automation (grace window + hard purge)'
- Identity model alignment (workspace-free auth UX + account-facing entitlements/billing surfaces) (2026-02-08-phase0-auth-model-alignment.md)
slice='Identity model alignment (workspace-free auth UX + account-facing entitlements/billing surfaces)'
- Hosted auth hardening - email verification + password reset (2026-02-08-phase0-auth-recovery-verification.md)
slice='Hosted auth hardening - email verification + password reset'
- Lemon Squeezy billing foundation (subscription lifecycle, webhook sync, pricing/upgrade, plan-management handoff) (2026-02-08-phase0-billing-foundation.md)
slice='Lemon Squeezy billing foundation (subscription lifecycle, webhook sync, pricing/upgrade, plan-management handoff)'
- Consent + CMP baseline (necessary-only default, persistent privacy controls, region-aware gating metadata) (2026-02-08-phase0-consent-cmp-baseline.md)
slice='Consent + CMP baseline (necessary-only default, persistent privacy controls, region-aware gating metadata)'
- Entitlements visibility in Settings billing (account limits + usage) (2026-02-08-phase0-entitlements-ui-usage.md)
slice='Entitlements visibility in Settings billing (account limits + usage)'
- Guided onboarding wizard baseline (first-run setup) (2026-02-08-phase0-guided-onboarding-wizard.md)
slice='Guided onboarding wizard baseline (first-run setup)'
- Hosted invite-token controls for workspace join (2026-02-08-phase0-invite-token-controls.md)
slice='Hosted invite-token controls for workspace join'
- Hosted performance/load testing + SLO baseline (2026-02-08-phase0-load-slo-baseline.md)
slice='Hosted performance/load testing + SLO baseline'
- Hosted load/SLO calibration workflow (2026-02-08-phase0-load-slo-calibration.md)
slice='Hosted load/SLO calibration workflow'
- Hosted onboarding completion persistence (server-side) (2026-02-08-phase0-onboarding-server-completion-state.md)
slice='Hosted onboarding completion persistence (server-side)'
- OrbStack self-host smoke harness (2026-02-08-phase0-orbstack-selfhost-smoke.md)
slice='OrbStack self-host smoke harness'
- Render blueprint bootstrap (free smoke + dogfood baseline) (2026-02-08-phase0-render-blueprint-bootstrap.md)
slice='Render blueprint bootstrap (free smoke + dogfood baseline)'
- Hosted tenant join flow baseline (`/v1/auth/join`) (2026-02-08-phase0-tenant-join-flow.md)
slice='Hosted tenant join flow baseline (`/v1/auth/join`)'
- Billing annual variants + webhook failure alerting (2026-02-09-phase0-billing-annual-alerting.md)
slice='Billing annual variants + webhook failure alerting'
- Billing plan-management controls (in-app cancel/resume) (2026-02-09-phase0-billing-cancel-resume.md)
slice='Billing plan-management controls (in-app cancel/resume)'
- Coverage policy ratchet baseline (gate unblocking without lowering standards) (2026-02-09-phase0-coverage-policy-ratchet.md)
slice='Coverage policy ratchet baseline (gate unblocking without lowering standards)'
- Hosted dogfood readiness tooling (2026-02-09-phase0-hosted-dogfood-readiness-tooling.md)
slice='Hosted dogfood readiness tooling'
- Self-host-first planning alignment (2026-02-09-phase0-self-host-first-doc-alignment.md)
slice='Self-host-first planning alignment'
- Self-host Docker readiness tooling (2026-02-09-phase0-selfhost-readiness-tooling.md)

## Verification Signals
- `npm run build`
- `npm run debt:scan`
- `npm run hosted:smoke -- --base-url http://localhost:4315 --web-url http://localhost:4314 --username admin --password adminadmin --tenant-slug default`
- `npm run lint`
- `npm run orbstack:smoke`
- `npm run selfhost:readiness -- --clean-db true --teardown true`
- `npm run test:coverage:policy`
- `npm run typecheck`
- `npm test`

## Remaining Gaps
- Add Playwright coverage for auth/billing/account-management critical paths.
- Add webhook replay tooling for failed events if operationally needed.
- After successful self-host checkpoint, run first live hosted telemetry gate via `npm run hosted:dogfood`.
- Continue internal tenant/workspace naming simplification in non-auth management surfaces.
- Execute first live hosted dogfood run with real hosted credentials and DB metrics.
- Execute full Docker checkpoint: `npm run selfhost:readiness -- --clean-db true --teardown true`.
- Execute self-host checkpoint slice and capture artifact links.
- Feed resulting artifact into plan-limit tuning and launch-readiness signoff.
- Keep baseline updates explicit via `npm run test:coverage:baseline`.
- Raise baseline coverage intentionally as test debt is paid down.
- Run first hosted dogfood telemetry pass to validate plan-limit economics.
- Then run first live hosted dogfood telemetry gate with `npm run hosted:dogfood`.
- `npm run test:coverage:policy`: not run (docs-only slice)
- `npm run test:coverage:policy`: not run (tooling-only slice)
- `npm run typecheck`: not run (docs-only slice)
- `npm run typecheck`: not run (tooling-only slice)
- `npm run typecheck`: not run (tooling-only slice; no TypeScript compilation surface changed)
- `npm test`: not run (docs-only slice)
- `npm test`: not run (tooling-only slice)
- `npm test`: not run (tooling-only slice; no existing test suites touched)
- none for this slice

## Follow-Up Work
1. Convert each remaining gap above into an executable implementation slice with verification.
2. Add targeted automated tests for checks marked not run/not applicable where useful.
3. Re-run build/typecheck/smoke gates after follow-up slices land.
