# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted tenant join flow baseline (`/v1/auth/join`)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth + onboarding flow
- Gate impact (Free/Pro/AI/self-host): Hosted account onboarding baseline
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added shared `joinWorkspaceRequestSchema` contract and `authJoin` route constant.
  - Added API endpoint `POST /v1/auth/join` for joining an existing workspace by slug.
  - Added tenant-scoped auth-service join logic with username/email uniqueness checks and verification-email behavior parity.
  - Added frontend `joinWorkspace` client helper.
  - Added `/join` page for member signup into an existing workspace.
  - Updated login/signup pages to expose the join path and carry tenant slug context.
  - Updated feature audit to reflect join flow coverage.
- What is explicitly out of scope:
  - Invite-token generation/acceptance workflow.
  - Tenant-admin approval/restriction controls for membership joins.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice addresses remaining hosted onboarding join gap | Sequenced after onboarding completion persistence |
| `backend-dev-agent` | pass | `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `packages/contracts/src/index.ts` | Tenant join endpoint and logic shipped |
| `frontend-dev-agent` | pass | `apps/web/src/lib/api.ts`, `apps/web/app/join/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx` | Join page and entry links shipped |
| `data-migration-agent` | not_applicable | No schema change required | Uses existing tenant/user tables |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | Regression gates all pass |
| `playwright-qa-agent` | not_applicable | No Playwright auth journey suite currently present | Follow-up remains in QA track |
| `accessibility-qa-agent` | pass | Join form uses labeled inputs and keyboard-submittable controls | Baseline semantics preserved |
| `lint-conformity-agent` | pass | `npm run lint` | Clean |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt rule hits |
| `security-risk-agent` | pass | Tenant slug required; user creation scoped to resolved tenant + uniqueness constraints | Cross-tenant creation prevented by scoped queries/RLS |
| `sre-cost-agent` | pass | No new infrastructure/provider added | Cost profile unchanged |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with invite-token/approval follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (labeled form + keyboard submit)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add invite-token based membership acceptance.
  - Add tenant-admin membership approval/policy controls.
- Sign-off: `senior-review-agent`
