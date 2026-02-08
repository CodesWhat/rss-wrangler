# Phase 0 Hosted SLO Baseline

Updated: 2026-02-08

This document defines the launch-gate SLO baseline and the repeatable load-test workflow for hosted readiness.

## Scope

- Multi-tenant API traffic (auth, timeline reads, read/save, settings, feed add, event ingest).
- Worker queue health (queue lag and job success for pg-boss queues).

## Source Files

- API profile: `infra/load/profiles/phase0-hosted-api-baseline.json`
- Worker profile: `infra/load/profiles/phase0-worker-slo-baseline.json`
- Gate script: `scripts/load/run-phase0-slo-gate.mjs`
- API runner: `scripts/load/run-hosted-load.mjs`
- Worker checker: `scripts/load/check-worker-slo.mjs`

## Launch SLO Budget

### API (global)

- Minimum measured requests: `>= 1200`
- p95 latency: `<= 700 ms`
- Error rate: `<= 1.5%`

### API (selected endpoint budgets)

- `clusters_unread` p95 `<= 550 ms`, error rate `<= 1%`
- `clusters_latest` p95 `<= 550 ms`, error rate `<= 1%`
- `settings_get` p95 `<= 350 ms`, error rate `<= 1%`
- `feeds_list` p95 `<= 400 ms`, error rate `<= 1%`
- `events_post` p95 `<= 650 ms`, error rate `<= 2%`
- `feed_add` p95 `<= 800 ms`, error rate `<= 3%`

### Worker (global)

- Queue lag p95 (max across tracked queues): `<= 120000 ms`
- Max queued jobs (tracked queues): `<= 2500`
- Terminal job success rate (last 60 minutes): `>= 98%`
- Minimum observed terminal jobs (last 60 minutes): `>= 50`

Tracked queues:
- `poll-feeds`
- `process-feed`
- `generate-digest`

## How To Run

1. Prepare a non-committed credentials file using `infra/load/users.example.json`.
2. Run the full gate:

```bash
node scripts/load/run-phase0-slo-gate.mjs \
  --base-url http://localhost:4000 \
  --users infra/load/users.local.json \
  --database-url "$DATABASE_URL"
```

Optional:
- API-only: `node scripts/load/run-hosted-load.mjs --base-url http://localhost:4000 --users infra/load/users.local.json`
- Worker-only: `node scripts/load/check-worker-slo.mjs --database-url "$DATABASE_URL"`

## Gate Output

- JSON artifacts are written to `infra/load/results/`.
- Gate exits with code `0` only when API + worker SLO checks pass.
- Gate exits with code `1` when any SLO check fails.

## Threshold Calibration Workflow

Calibration is handled by `scripts/load/calibrate-slo-thresholds.mjs`.

Input expectations:
- At least 3 successful `gate-*.json` artifacts in `infra/load/results/`.
- Each gate artifact must reference both API and worker reports.

Default policy:
- Uses the most recent successful runs (up to 10).
- Latency thresholds: `run-p95(95th percentile) * 1.15`.
- Error-rate thresholds: `run-p95(95th percentile) * 1.25 + 0.001` (capped at `0.05`).
- Minimum request/terminal-job floors: `run-p50 * 0.85`.
- Queue lag and queued-jobs thresholds: `run-p95 * 1.2`.
- Success-rate minimums: `run-p05 - 0.005` (floored at `0.90`).

Commands:

```bash
# Dry-run calibration report only
node scripts/load/calibrate-slo-thresholds.mjs --results-dir infra/load/results

# Apply calibrated values to profile files
node scripts/load/calibrate-slo-thresholds.mjs \
  --results-dir infra/load/results \
  --write-profiles true
```

## Operational Notes

- `feed_add` uses unique synthetic URLs under `https://loadtest.invalid/...` so each request is isolated.
- Read/save operations are skipped if no clusters are available for a user.
- Worker checks read `pgboss.job` and `pgboss.archive` (if present).
