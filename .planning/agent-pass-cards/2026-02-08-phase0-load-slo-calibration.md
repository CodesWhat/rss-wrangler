# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted load/SLO calibration workflow
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted performance/load testing + SLO baseline
- Gate impact (Free/Pro/AI/self-host): Hosted reliability threshold tuning
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added calibration script `scripts/load/calibrate-slo-thresholds.mjs`.
  - Added calibration workflow docs and command paths in `infra/load/README.md`.
  - Added calibration policy and procedure to `.planning/PHASE0_HOSTED_SLO_BASELINE.md`.
  - Updated Agent D status log with calibration completion evidence.
- What is explicitly out of scope:
  - Running production/staging calibration sweeps and final threshold selection.
  - Alerting/dashboards integration.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice maps directly to `phase0/load-slo-calibration` follow-on | Keeps SLO thresholds evidence-driven |
| `backend-dev-agent` | pass | `scripts/load/calibrate-slo-thresholds.mjs` | Calibration logic + profile update mode implemented |
| `frontend-dev-agent` | not_applicable | No frontend surface changes | Slice is script/docs only |
| `data-migration-agent` | not_applicable | No schema changes | No migration required |
| `qa-test-agent` | pass | Gate suite run and captured in handoff | Full required checks passed |
| `playwright-qa-agent` | not_applicable | No impacted UI flow | Not required for this slice |
| `accessibility-qa-agent` | not_applicable | No UI changes | Accessibility surface unchanged |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Entry-point scripts intentionally standalone |
| `security-risk-agent` | pass | Calibration reads local artifacts; no auth/data model change | Low risk |
| `sre-cost-agent` | pass | Calibration policy + SLO tune workflow documented | Improves reliability operations loop |
| `senior-review-agent` | pass | Script + docs reviewed for deterministic behavior | Approved with run-data quality caution |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass (scoped changed-files override used due parallel unstaged changes)
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable
- Accessibility impacted flows: not applicable
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): not needed
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Apply calibrated thresholds only after collecting enough representative successful runs.
- Sign-off: `senior-review-agent`
