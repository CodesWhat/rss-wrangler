# Hosted Load + SLO Baseline

Phase 0 hosted readiness requires repeatable synthetic load tests with explicit pass/fail SLO checks. This folder contains the baseline profiles and operator runbook.

## Files

- `infra/load/profiles/phase0-hosted-api-baseline.json`: weighted multi-tenant API profile and API SLO thresholds.
- `infra/load/profiles/phase0-worker-slo-baseline.json`: worker queue lag/success thresholds (pg-boss metrics).
- `infra/load/users.example.json`: credential input format for load users.
- `infra/load/results/*.json`: generated run artifacts.
- `scripts/load/calibrate-slo-thresholds.mjs`: threshold calibration from repeated gate artifacts.

## Preconditions

- API reachable (default `http://localhost:4000`).
- Worker connected to same Postgres instance (for queue SLO check).
- Test users already exist across one or more tenants.

## Run

1. Create a local users file from `infra/load/users.example.json` (do not commit credentials):

```bash
cp infra/load/users.example.json infra/load/users.local.json
```

2. Run the full Phase 0 SLO gate:

```bash
node scripts/load/run-phase0-slo-gate.mjs \
  --base-url http://localhost:4000 \
  --users infra/load/users.local.json \
  --database-url "$DATABASE_URL"
```

3. API-only run (useful for quick smoke on PRs):

```bash
node scripts/load/run-hosted-load.mjs \
  --base-url http://localhost:4000 \
  --users infra/load/users.local.json
```

4. Worker-only queue SLO check:

```bash
node scripts/load/check-worker-slo.mjs \
  --database-url "$DATABASE_URL"
```

5. Run consolidated hosted dogfood readiness checks (smoke + SLO + account telemetry):

```bash
node scripts/load/run-hosted-dogfood-readiness.mjs \
  --base-url http://localhost:4000 \
  --web-url http://localhost:3000 \
  --users infra/load/users.local.json \
  --database-url "$DATABASE_URL" \
  --username "$HOSTED_SMOKE_USERNAME" \
  --password "$HOSTED_SMOKE_PASSWORD" \
  --tenant-slug default
```

Notes:
- Writes consolidated report to `infra/load/results/latest-hosted-dogfood-readiness.json`.
- Add `--require-billing true` to hard-fail if checkout is not configured.
- Add `--require-annual true` to hard-fail if annual variants are unavailable.
- Use `npm run hosted:dogfood -- ...args` as a shorthand.

6. Run self-host readiness gate (Docker-first checkpoint):

```bash
npm run selfhost:readiness -- \
  --clean-db true \
  --teardown true
```

What this runs:
- `npm run lint`
- `docker compose -f infra/docker-compose.yml --env-file infra/.env build`
- `npm run orbstack:smoke`
- optional cleanup via `docker compose ... down --remove-orphans` when `--teardown true`

Report artifact:
- `infra/load/results/latest-selfhost-readiness.json`

7. Calibrate thresholds from historical successful gate runs (dry-run):

```bash
node scripts/load/calibrate-slo-thresholds.mjs \
  --results-dir infra/load/results \
  --min-runs 3 \
  --max-runs 10
```

8. Apply calibrated thresholds directly to profile files:

```bash
node scripts/load/calibrate-slo-thresholds.mjs \
  --results-dir infra/load/results \
  --write-profiles true
```

## Exit behavior

- Exit code `0`: all configured SLO checks passed.
- Exit code `1`: one or more checks failed.

The gate writes timestamped JSON artifacts to `infra/load/results/` and prints a compact PASS/FAIL summary.

## Notes

- `feed_add` scenarios create unique synthetic feed URLs under `https://loadtest.invalid/...`.
- `cluster_mark_read` and `cluster_save` scenarios require existing clusters; if none exist they are recorded as skipped.
- Worker SLO check reads `pgboss.job` (and `pgboss.archive` when present).
- Dogfood readiness runner probes `/v1/account/entitlements`, `/v1/billing`, and `/v1/privacy/consent` to capture rollout telemetry snapshots.
- Self-host readiness runner is local/Docker-focused and intentionally does not depend on Render deployment state.
- Calibration reads `gate-*.json` artifacts and uses only successful runs.
