# RSS Wrangler Test Coverage Policy

Updated: 2026-02-09

## Goal

Catch regressions with meaningful tests, especially in risky areas, without chasing vanity metrics.

`100%` coverage is not a hard requirement.

## Coverage Targets

### 1. Repository baseline (always enforced)

Coverage gates are ratcheted from `.coverage-policy-baseline.json`:

- Current run must be `>=` the stored baseline (per metric), with a hard floor:
  - Statements: `>= 40%`
  - Branches: `>= 35%`
  - Functions: `>= 30%`
  - Lines: `>= 40%`
- Baseline is updated intentionally via:
  - `npm run test:coverage:baseline`

### 2. Changed source files (enforced in PR checks)

For changed files under `apps/**/src` or `packages/**/src` (excluding tests and `.d.ts`):

- If file exists in baseline: coverage may not regress more than `0.1` percentage points per metric (override with `COVERAGE_REGRESSION_TOLERANCE`).
- If file is new to baseline:
  - Statements: `>= 80%`
  - Branches: `>= 70%`
  - Functions: `>= 80%`
  - Lines: `>= 80%`

If a changed source file has no coverage entry, the check fails.

Changed-file detection rules:

- CI: compare against `origin/main...HEAD` by default (override with `COVERAGE_BASE_REF`)
- Local: evaluate staged source files by default
- Optional override: set `COVERAGE_BASE_REF` or `COVERAGE_CHANGED_FILES`

### 3. Critical changed files (stricter for new files)

When a changed file is *new to baseline* and matches a critical path, it must meet:

- Statements: `>= 90%`
- Branches: `>= 85%`
- Functions: `>= 90%`
- Lines: `>= 90%`

Critical paths:

- `apps/api/src/services/auth-service.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/routes/v1.ts`
- `apps/api/src/services/postgres-store.ts`
- `apps/worker/src/jobs/register-jobs.ts`
- `apps/worker/src/pipeline/run-feed-pipeline.ts`

## CI Rules

Required checks for backend/worker changes:

1. `npm test`
2. `npm run test:coverage:policy`

Required checks for user-facing flow changes:

1. `npm test`
2. `npm run test:coverage:policy`
3. Playwright checks for impacted flows

## Local Commands

- Unit/integration tests: `npm test`
- Coverage report: `npm run test:coverage`
- Refresh baseline (intentional ratchet): `npm run test:coverage:baseline`
- Coverage gate: `npm run test:coverage:policy`
- Compare local branch to main: `COVERAGE_BASE_REF=origin/main npm run test:coverage:policy`

## Exemptions

Allowed only with explicit rationale in PR:

- Temporary exception with follow-up issue and owner
- Dead code pending removal
- Generated code or third-party wrappers where direct unit tests have little value

No silent exemptions.

## Ratchet Rule

Coverage thresholds may only stay flat or increase. Do not lower thresholds without explicit project-level approval.
