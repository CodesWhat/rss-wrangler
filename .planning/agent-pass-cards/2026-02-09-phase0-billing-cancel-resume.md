# Agent Pass Card

## Metadata

- Date: 2026-02-09
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Billing plan-management controls (in-app cancel/resume)
- Owner: `phase-lead-agent`
- Related roadmap items: Billing foundation (Lemon Squeezy + plan management UX)
- Gate impact (Free/Pro/AI/self-host): Hosted Pro/Pro+AI billing lifecycle UX
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Extended billing contracts with subscription action request/response schemas.
  - Added API route `POST /v1/billing/subscription-action`.
  - Extended billing service with provider-backed subscription state updates (`cancel` / `resume`) using Lemon `PATCH /v1/subscriptions/:id`.
  - Persisted cancellation-state updates back to `tenant_plan_subscription` (status/cancel flag/period-end/portal URL metadata).
  - Added settings billing UI controls for `Cancel at period end` and `Resume auto-renew` with live state updates and success messaging.
  - Added billing service tests for missing-subscription handling, provider patch success path, and idempotent no-op behavior.
  - Updated planning docs status across roadmap/audit/playbook/monetization snapshots.
- What is explicitly out of scope:
  - Annual billing variants and checkout UX for monthly vs annual.
  - Production webhook alerting/replay runbook integrations.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice scoped to explicit remaining billing gap | Closes in-app cancel/resume follow-up |
| `backend-dev-agent` | pass | `apps/api/src/services/billing-service.ts`, `apps/api/src/routes/v1.ts` | Provider-backed cancel/resume + route wired |
| `frontend-dev-agent` | pass | `apps/web/src/lib/api.ts`, `apps/web/app/settings/page.tsx` | Settings billing cancel/resume controls added |
| `data-migration-agent` | not_applicable | No schema change required | Existing billing columns used |
| `qa-test-agent` | pass_with_followup | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | Coverage policy fails at existing repo-global baseline thresholds; all other gates pass |
| `playwright-qa-agent` | not_applicable | No Playwright billing suite in repo yet | Add e2e when harness lands |
| `accessibility-qa-agent` | pass | Existing semantic button controls preserved; labels/action states explicit | Manual a11y spot-check on changed controls |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated load-script warnings unchanged |
| `security-risk-agent` | pass | No secrets/client-side provider keys introduced; auth-protected route only | Provider error paths explicit |
| `sre-cost-agent` | pass | In-app management path reduces support/manual portal dependency | Annual + webhook alerting still open |
| `senior-review-agent` | pass | End-to-end behavior + failure modes reviewed | Approved with follow-up items noted |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: fail (existing repo-wide threshold gap; unchanged by this slice)
- `npm run debt:scan`: pass (unchanged existing load-script warnings)
- `npm run build`: pass
- Playwright impacted flows: not applicable (no existing Playwright harness in repo)
- Accessibility impacted flows: pass (manual review on changed billing actions)
- Entitlement checks impacted: pass (billing state updates remain tenant-scoped)
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not applicable
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved_with_followup
- Blocking items:
  - Add annual plan variants and selection flow.
  - Add webhook failure alerting/replay operational hooks.
  - Raise or phase global coverage-policy thresholds to match current baseline before hard-enforcing.
- Sign-off: `senior-review-agent`
