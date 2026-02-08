# Hosted Load + SLO Baseline

Phase 0 hosted readiness requires repeatable synthetic load tests with explicit pass/fail SLO checks. This folder contains the baseline profiles and operator runbook.

## Files

- `infra/load/profiles/phase0-hosted-api-baseline.json`: weighted multi-tenant API profile and API SLO thresholds.
- `infra/load/profiles/phase0-worker-slo-baseline.json`: worker queue lag/success thresholds (pg-boss metrics).
- `infra/load/users.example.json`: credential input format for load users.
- `infra/load/results/*.json`: generated run artifacts.

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

## Exit behavior

- Exit code `0`: all configured SLO checks passed.
- Exit code `1`: one or more checks failed.

The gate writes timestamped JSON artifacts to `infra/load/results/` and prints a compact PASS/FAIL summary.

## Notes

- `feed_add` scenarios create unique synthetic feed URLs under `https://loadtest.invalid/...`.
- `cluster_mark_read` and `cluster_save` scenarios require existing clusters; if none exist they are recorded as skipped.
- Worker SLO check reads `pgboss.job` (and `pgboss.archive` when present).
