# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Render blueprint bootstrap (free smoke + dogfood baseline)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted SaaS offering (dogfood pilot), hosted deployment readiness
- Gate impact (Free/Pro/AI/self-host): Hosted deployment workflow across all hosted tiers
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added Render blueprints:
    - `render.free.yaml` (API + Web + Postgres smoke profile)
    - `render.yaml` (API + Worker + Web + Postgres dogfood baseline)
  - Added Node-based migration runner: `scripts/run-migrations.mjs`.
  - Added `db:migrate` npm script and wired API runtime command for Render startup migration.
  - Updated API Docker image to include `db/` and `scripts/` for runtime migration execution.
  - Updated docs (`README.md`, `infra/README.md`) with Render profile guidance and rollout order.
- What is explicitly out of scope:
  - Actual Render account provisioning and first live deploy.
  - Production observability dashboards and dogfood SLO telemetry capture runs.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with hosted dogfood kickoff prerequisite | Blueprint source-of-truth established |
| `backend-dev-agent` | pass | `scripts/run-migrations.mjs`, `apps/api/Dockerfile`, `package.json` | Self-contained startup migration path for hosted deploys |
| `frontend-dev-agent` | pass | `render*.yaml` + docs validate web wiring | Web service env and external URL wiring covered |
| `data-migration-agent` | pass | Runtime migration flow defined | Existing SQL chain remains source of truth |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | All required gates passed |
| `playwright-qa-agent` | not_applicable | No UI flow changes | Deployment/config slice only |
| `accessibility-qa-agent` | not_applicable | No accessibility surface changed | Deployment/config slice only |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated warnings unchanged |
| `security-risk-agent` | pass | No new public endpoints; startup migration script uses existing DB creds path | Risk profile unchanged |
| `sre-cost-agent` | pass | `render.free.yaml` and `render.yaml` separation models smoke vs dogfood cost intent | Prevents unrealistic free-tier assumptions for pilot metrics |
| `senior-review-agent` | pass | Runtime/deploy chain reviewed | Approved with follow-up to execute first deploy |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (unchanged existing load-script warnings)
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
  - Execute first Render free smoke deployment and capture checklist results.
  - Execute first starter-plan dogfood deploy and validate queue/worker health.
- Sign-off: `senior-review-agent`
