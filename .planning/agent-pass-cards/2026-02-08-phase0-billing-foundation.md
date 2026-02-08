# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Lemon Squeezy billing foundation (subscription lifecycle, webhook sync, pricing/upgrade, plan-management handoff)
- Owner: `phase-lead-agent`
- Related roadmap items: Billing foundation (Lemon Squeezy + plan management UX), Entitlements + plan-limit middleware baseline
- Gate impact (Free/Pro/AI/self-host): Hosted Free/Pro/Pro+AI billing + entitlement sync
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added migration `db/migrations/0019_lemon_billing_foundation.sql` for subscription provider metadata + webhook idempotency/audit storage.
  - Added API billing env config + `fastify-raw-body` registration for signed webhook verification.
  - Implemented `apps/api/src/services/billing-service.ts` with checkout creation, portal URL resolution, webhook signature validation, idempotency, and subscription->plan sync (`tenant_plan_subscription`).
  - Added API routes:
    - `POST /v1/billing/webhooks/lemon-squeezy`
    - `GET /v1/billing`
    - `POST /v1/billing/checkout`
    - `GET /v1/billing/portal`
  - Extended contracts with billing schemas/types/routes.
  - Added API tests for billing service behaviors including signature rejection, duplicate webhook handling, and downgrade on subscription expiration.
  - Added hosted pricing page (`/pricing`) and settings billing section for upgrade + billing portal handoff.
  - Updated docs/env/planning status to reflect billing foundation now partial-live.
- What is explicitly out of scope:
  - In-app cancel/reactivate actions beyond billing portal handoff.
  - Annual variant lifecycle and pricing experiments.
  - Production webhook alerting/observability integrations.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice matches immediate next Phase 0 gap | Billing foundation moved from missing to partial |
| `backend-dev-agent` | pass | `apps/api/src/services/billing-service.ts`, `apps/api/src/routes/v1.ts` | Checkout/webhook/portal lifecycle implemented |
| `frontend-dev-agent` | pass | `apps/web/app/settings/page.tsx`, `apps/web/app/pricing/page.tsx` | Upgrade + portal handoff UX implemented |
| `data-migration-agent` | pass | `db/migrations/0019_lemon_billing_foundation.sql` | Schema and indexes for billing metadata/idempotency |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | All required gates passed |
| `playwright-qa-agent` | not_applicable | Playwright suite not yet present for these flows | Recommended when e2e harness lands |
| `accessibility-qa-agent` | pass | Responsive controls and semantic labels on billing settings/pricing cards | No blocking a11y issues identified in changed UI |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated load-script warnings unchanged |
| `security-risk-agent` | pass | HMAC webhook verification + idempotency + tenant resolution checks | Signature/path abuse risk reduced |
| `sre-cost-agent` | pass | Plan-sync path + checkout/portal fallbacks are explicit | Error-path observability follow-up still needed |
| `senior-review-agent` | pass | End-to-end lifecycle reviewed and tested | Approved with follow-up items noted |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (unchanged existing load-script warnings)
- `npm run build`: pass
- Playwright impacted flows: not applicable (no existing Playwright harness in repo)
- Accessibility impacted flows: pass (manual review on changed settings/pricing flows)
- Entitlement checks impacted: pass (billing webhook updates `tenant_plan_subscription`)
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not applicable
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add in-app cancel/reactivate controls (or explicit portal status refresh UX).
  - Add annual variants and lifecycle tests.
  - Add production webhook failure alerting + replay tooling.
- Sign-off: `senior-review-agent`
