# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted invite-token controls for workspace join
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth + onboarding flow
- Gate impact (Free/Pro/AI/self-host): Hosted onboarding access-control baseline
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added invite contracts (`createWorkspaceInviteRequestSchema`, `workspaceInviteSchema`) and route constants.
  - Added DB migration `0015_workspace_invites.sql` with tenant-scoped RLS.
  - Added auth-service invite flows: create/list/revoke invites and invite-aware join validation/consumption.
  - Added protected invite APIs:
    - `GET /v1/account/invites`
    - `POST /v1/account/invites`
    - `POST /v1/account/invites/:id/revoke`
  - Extended join flow to require valid invite code for existing workspaces.
  - Added invites management page (`/account/invites`) and updated nav.
  - Updated join UI to accept invite codes (including URL prefill).
  - Updated feature audit notes for hosted auth/onboarding.
- What is explicitly out of scope:
  - Tenant role model and member approval workflow.
  - Invite email delivery/notification automation.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with next hosted-auth gap after join flow baseline | Invite-token controls prioritized before entitlements |
| `backend-dev-agent` | pass | `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `db/migrations/0015_workspace_invites.sql`, `packages/contracts/src/index.ts` | Invite persistence + validation + endpoints shipped |
| `frontend-dev-agent` | pass | `apps/web/app/account/invites/page.tsx`, `apps/web/app/join/page.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/components/nav.tsx` | Invite management and join-code UX shipped |
| `data-migration-agent` | pass | `db/migrations/0015_workspace_invites.sql` | Table/index/RLS baseline added |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | Gate suite clean |
| `playwright-qa-agent` | not_applicable | No Playwright auth/account invite suite in repo yet | Follow-up remains in Phase 0 QA track |
| `accessibility-qa-agent` | pass | Labeled form controls and keyboard-operable actions in invite/join pages | Baseline semantics preserved |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt rule hits |
| `security-risk-agent` | pass | Invite code hashing + tenant scoping + consumption on join | Reduces unauthorized workspace joins |
| `sre-cost-agent` | pass | Uses existing Postgres only; no new provider/service | Cost profile unchanged |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with role-based approvals follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (labeled forms, keyboard actions)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add tenant role/approval policy to control who can create/revoke invites.
  - Add invite email delivery and usage audit views.
- Sign-off: `senior-review-agent`
