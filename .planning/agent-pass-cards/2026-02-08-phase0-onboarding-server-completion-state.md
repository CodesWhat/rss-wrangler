# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted onboarding completion persistence (server-side)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth + onboarding flow; guided onboarding wizard
- Gate impact (Free/Pro/AI/self-host): Hosted onboarding activation flow baseline
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added `onboardingCompletedAt` to shared settings contract (optional nullable timestamp).
  - Updated Home onboarding gating to read/write completion state via server settings instead of local-only dismissal.
  - Wizard dismiss/finish now persists completion timestamp server-side.
  - "Start setup" action now clears server completion state to rerun onboarding intentionally.
  - Updated feature-audit notes to mark server-side completion tracking as implemented.
- What is explicitly out of scope:
  - Invite/join organization onboarding flow.
  - Advanced topic-to-folder/filter bootstrap automation after onboarding.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice addresses explicit remaining onboarding gap from prior pass card | Sequenced after onboarding baseline |
| `backend-dev-agent` | pass | `packages/contracts/src/index.ts` | Settings contract now supports persistent onboarding completion field |
| `frontend-dev-agent` | pass | `apps/web/app/page.tsx` | Server-backed completion state integrated into onboarding UX |
| `data-migration-agent` | not_applicable | No schema migration needed; stored in existing settings JSON | Uses existing `app_settings` path |
| `qa-test-agent` | pass | `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage:policy`, `npm run build` | No regressions in gate suite |
| `playwright-qa-agent` | not_applicable | No Playwright onboarding suite exists yet | Follow-up remains in QA phase |
| `accessibility-qa-agent` | pass | Existing labeled controls preserved; no keyboard regressions introduced | Interaction model unchanged |
| `lint-conformity-agent` | pass | `npm run lint` | Clean |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt issues |
| `security-risk-agent` | pass | Onboarding completion state is tenant-scoped via authenticated settings endpoint | No new auth surface |
| `sre-cost-agent` | pass | No infra/service additions | Cost profile unchanged |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with invite/bootstrap follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (existing semantics preserved)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add invite/join onboarding path for hosted teams/workspaces.
  - Add richer topic/bootstrap automation during onboarding setup.
- Sign-off: `senior-review-agent`
