# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted account data export baseline (request/status/download)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted account management + compliance controls; data portability export bundle
- Gate impact (Free/Pro/AI/self-host): Hosted account-control and trust baseline for all hosted plans
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added `account_data_export_request` table + indexes + RLS policy in `db/migrations/0014_account_data_export_requests.sql`.
  - Added contracts for account data export status and API route constants.
  - Added tenant-scoped auth-service flow for export request/status/download, including background processing in API runtime.
  - Added protected API endpoints:
    - `GET /v1/account/data-export`
    - `POST /v1/account/data-export/request`
    - `GET /v1/account/data-export/download`
  - Added frontend API helpers and a protected account export page (`/account/data-export`), plus sidebar navigation entry.
  - Updated feature audit row from missing to partial.
- What is explicitly out of scope:
  - Durable worker-queue processing for export jobs.
  - Completion notifications (email/webhook) for export readiness.
  - Export retention TTL + automated purge workflow.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with remaining Phase 0 compliance gaps after auth/onboarding | Sequenced before billing/entitlements |
| `backend-dev-agent` | pass | `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `db/migrations/0014_account_data_export_requests.sql`, `packages/contracts/src/index.ts` | Tenant-scoped request/status/download API implemented |
| `frontend-dev-agent` | pass | `apps/web/src/lib/api.ts`, `apps/web/app/account/data-export/page.tsx`, `apps/web/src/components/nav.tsx` | Export page + client wiring shipped |
| `data-migration-agent` | pass | `db/migrations/0014_account_data_export_requests.sql` | Table/index/RLS validated |
| `qa-test-agent` | pass | `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage:policy`, `npm run build` | Baseline export flow validated via build/test gate |
| `playwright-qa-agent` | not_applicable | No Playwright suite exists for account export flow yet | Follow-up remains in Phase 0 QA track |
| `accessibility-qa-agent` | pass | Labeled controls, keyboard-operable buttons, status/error text in export page | Baseline semantics preserved |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt violations introduced by slice |
| `security-risk-agent` | pass | Export routes are protected and tenant-scoped; RLS enforced on export table | No cross-tenant export leakage path introduced |
| `sre-cost-agent` | pass | No new provider/service; payload stored in existing Postgres | Cost profile unchanged |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with durable-job/retention follow-ups |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (labels/buttons/status text)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): pass (export bundle includes core account/workspace data)
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Move export processing to durable worker queue with retries.
  - Add completion notification channel and retention/purge automation for export artifacts.
- Sign-off: `senior-review-agent`
