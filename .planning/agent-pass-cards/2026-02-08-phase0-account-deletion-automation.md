# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted account deletion lifecycle automation (grace window + hard purge)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted account management + compliance controls
- Gate impact (Free/Pro/AI/self-host): Hosted compliance automation baseline
- PR / branch: `main` (working tree slice)
- Atomic commits: pending

## Scope

- What changed:
  - Added migration `db/migrations/0017_account_deletion_lifecycle_automation.sql`:
    - due-processing index for pending deletion requests
    - `account_deletion_request.user_id` converted to nullable with `ON DELETE SET NULL`
    - pending-only user presence check constraint
  - Added worker automation module `apps/worker/src/jobs/account-deletion-automation.ts` to:
    - process due deletion requests after a 7-day grace window
    - mark requests completed
    - hard-delete corresponding accounts
    - emit tenant-scoped audit events (`account.deletion.completed`)
    - remove empty tenants after final-user purge
  - Added queue wiring in worker jobs:
    - new queue name `process-account-deletions`
    - cron schedule every 30 minutes
    - per-tenant execution and aggregated worker logging
  - Added unit tests for automation success and rollback paths.
  - Updated coordination docs and hosted account-deletion audit status notes.
- What is explicitly out of scope:
  - User-facing completion notifications (email/in-app) for deletion completion.
  - Account data export lifecycle automation and retention controls.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with hosted compliance backlog from Phase 0 audit | Scoped to deletion lifecycle automation only |
| `backend-dev-agent` | pass | `apps/worker/src/jobs/account-deletion-automation.ts`, `apps/worker/src/jobs/register-jobs.ts`, `apps/worker/src/jobs/job-names.ts` | Grace-window purge automation shipped |
| `frontend-dev-agent` | not_applicable | No frontend files changed in this slice | Deletion UI baseline already existed |
| `data-migration-agent` | pass | `db/migrations/0017_account_deletion_lifecycle_automation.sql` | Lifecycle migration added for automation support |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | Gate suite clean |
| `playwright-qa-agent` | not_applicable | No Playwright suite for deletion lifecycle automation in repo | Follow-up remains |
| `accessibility-qa-agent` | not_applicable | No UI behavior changes in this slice | Existing deletion settings UI unchanged |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt in touched slice files |
| `security-risk-agent` | pass | Password-confirmed request exists upstream; purge runs tenant-scoped with RLS context | Cross-tenant deletion risk reduced |
| `sre-cost-agent` | pass | Reuses pg-boss + Postgres; no new provider | Cost profile unchanged |
| `senior-review-agent` | pass | Architecture/risk pass completed for lifecycle automation path | Approved with notification follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable
- Accessibility impacted flows: not applicable
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): not needed
- Portability impact reviewed (if needed): reviewed (no export contract/schema change in this slice)
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: `approved`
- Blocking items:
  - Add user-facing deletion completion notification channel.
  - Implement account data export worker lifecycle + retention purge automation.
- Sign-off: `senior-review-agent`
