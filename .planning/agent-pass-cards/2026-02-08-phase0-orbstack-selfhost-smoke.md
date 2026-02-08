# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: OrbStack self-host smoke harness
- Owner: `phase-lead-agent`
- Related roadmap items: self-host validation loop for hosted-first development
- Gate impact (Free/Pro/AI/self-host): self-host/free-user container validation baseline
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added one-command OrbStack smoke script: `scripts/orbstack-smoke.sh`.
  - Added npm helpers:
    - `orbstack:up`
    - `orbstack:down`
    - `orbstack:smoke`
  - Updated docs (`README.md`, `infra/README.md`) to establish OrbStack as default local validation loop.
- What is explicitly out of scope:
  - Hosted Render deployment execution.
  - Synthetic load/SLO runs against hosted infra.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with requested local-first testing workflow | Keeps free/self-host quality high while building hosted-first |
| `backend-dev-agent` | pass | `scripts/orbstack-smoke.sh` | End-to-end health + auth + service checks implemented |
| `frontend-dev-agent` | pass | `README.md` + smoke flow verifies web path | No UI code changes |
| `data-migration-agent` | not_applicable | No schema changes | Existing migration path reused |
| `qa-test-agent` | pass | Repo validation gates run after slice | All required gates passed |
| `playwright-qa-agent` | not_applicable | No browser test harness changes | N/A |
| `accessibility-qa-agent` | not_applicable | No UI surface change | N/A |
| `lint-conformity-agent` | pass | `npm run lint` | Clean |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated warnings unchanged |
| `security-risk-agent` | pass | Script only uses local env + existing auth endpoint | No new external attack surface |
| `sre-cost-agent` | pass | Local container smoke loop reduces noisy hosted cycles | Cost-efficient dev workflow |
| `senior-review-agent` | pass | Workflow and docs reviewed | Approved |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- `npm run build`: pass
- Playwright impacted flows: not applicable
- Accessibility impacted flows: not applicable
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): not needed
- Portability impact reviewed (if needed): not applicable
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - None for this slice.
- Sign-off: `senior-review-agent`
