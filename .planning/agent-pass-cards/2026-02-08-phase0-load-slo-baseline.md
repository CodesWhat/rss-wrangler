# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted performance/load testing + SLO baseline
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted performance/load testing + SLO baseline
- Gate impact (Free/Pro/AI/self-host): Hosted reliability launch gate
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added repeatable API load profiles and worker SLO profiles under `infra/load/profiles/`.
  - Added reusable load-test users template and runbook docs under `infra/load/`.
  - Added API synthetic load runner (`scripts/load/run-hosted-load.mjs`) with weighted scenarios and per-scenario SLO checks.
  - Added worker queue SLO checker (`scripts/load/check-worker-slo.mjs`) using pg-boss queue/terminal metrics.
  - Added combined Phase 0 gate (`scripts/load/run-phase0-slo-gate.mjs`) with pass/fail exit code and artifact output.
  - Added planning baseline doc (`.planning/PHASE0_HOSTED_SLO_BASELINE.md`).
  - Updated hosted SLO audit row in `.planning/FEATURE_AUDIT.md` from missing to implemented.
- What is explicitly out of scope:
  - SLO threshold calibration from production/staging historical runs.
  - Provider dashboard/alert integration automation.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with Phase 0 mandatory hosted launch gate | Hosted SLO baseline completed before public launch |
| `backend-dev-agent` | pass | `scripts/load/run-hosted-load.mjs`, `scripts/load/run-phase0-slo-gate.mjs` | API load scenarios + gate wiring implemented |
| `frontend-dev-agent` | not_applicable | No frontend code path changed | Slice is infra/scripts/planning only |
| `data-migration-agent` | not_applicable | No DB migration in this slice | Uses existing pg-boss tables only |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | All required gates passed |
| `playwright-qa-agent` | not_applicable | No user-flow UI changes | No impacted Playwright flows |
| `accessibility-qa-agent` | not_applicable | No UI changes | Accessibility surface unchanged |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Knip flags load scripts as currently unreferenced entrypoints |
| `security-risk-agent` | pass | Load users file template + local credential usage only | No auth model change |
| `sre-cost-agent` | pass | `infra/load/*`, `.planning/PHASE0_HOSTED_SLO_BASELINE.md` | Explicit p95/error/queue-lag budgets added |
| `senior-review-agent` | pass | End-to-end gate path + artifact output reviewed | Approved with calibration follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (new load scripts listed as unused)
- Playwright impacted flows: not applicable
- Accessibility impacted flows: not applicable
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): not needed
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Calibrate thresholds using repeated hosted/staging runs and tune profile budgets.
- Sign-off: `senior-review-agent`
