# Agent Coordination Board

Last updated: 2026-02-08T19:27:53Z

## Rules

- One slice per agent at a time.
- Update status before and after work.
- Keep commits atomic and slice-scoped.
- Record test gates run per slice.

## Slices

| Slice ID | Owner | Status | Updated At | Notes |
|---|---|---|---|---|
| phase0/invite-token-controls | agent-a | IN_REVIEW | 2026-02-08T19:27:00Z | Invite-token/member control baseline (API + UI), awaiting atomic commit |
| phase0/member-approval-policy-roles | agent-a | CLAIMED_NEXT | 2026-02-08T19:27:00Z | Role/policy controls for invite create/revoke and join approval |
| phase0/account-deletion-automation | agent-b | DONE | 2026-02-08T19:23:54Z | Grace window + purge workflow shipped with worker automation + migration |
| phase0/entitlements-limit-middleware | agent-c | DONE | 2026-02-08T19:25:30Z | API feed/search plan gates + worker poll/ingest limits + plan migration |
| phase0/load-slo-baseline | agent-d | DONE | 2026-02-08T19:16:53Z | Repeatable load tests + SLO gates shipped (profiles + scripts + docs) |
| phase0/load-slo-calibration | agent-d | DONE | 2026-02-08T19:25:52Z | Calibration workflow shipped (automated threshold tuning script + policy docs) |
| phase0/load-slo-trend-reporting | agent-d | IN_PROGRESS | 2026-02-08T19:27:53Z | Add repeatable trend reporting for weekly SLO drift tracking |

## Conflict-Avoidance Claims

- Active claim (`agent-a`, `phase0/invite-token-controls`, updated 2026-02-08T19:27:00Z):
  `packages/contracts/src/index.ts`, `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `apps/web/src/lib/api.ts`, `apps/web/app/join/page.tsx`, `apps/web/app/account/invites/page.tsx`, `apps/web/src/components/nav.tsx`, `db/migrations/0015_workspace_invites.sql`, `.planning/FEATURE_AUDIT.md`, `.planning/agent-pass-cards/2026-02-08-phase0-invite-token-controls.md`, `.planning/coordination/status/agent-a.md`, `.planning/coordination/handoffs/phase0-invite-token-controls.md`.
- Reserved next slice (`agent-a`, post-current-slice only):
  `phase0/member-approval-policy-roles` scoped to `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `apps/web/app/account/invites/page.tsx`, `packages/contracts/src/index.ts`, `db/migrations/*member_approval*`.
- Completed claim (`agent-b`, `phase0/account-deletion-automation`, updated 2026-02-08T19:23:54Z):
  `apps/worker/src/jobs/account-deletion-automation.ts`, `apps/worker/src/jobs/register-jobs.ts`, `apps/worker/src/jobs/job-names.ts`, `apps/worker/src/jobs/__tests__/account-deletion-automation.test.ts`, `db/migrations/0017_account_deletion_lifecycle_automation.sql`.
- Completed claim (`agent-c`, `phase0/entitlements-limit-middleware`, updated 2026-02-08T19:25:30Z):
  `apps/api/src/plugins/entitlements.ts`, `apps/api/src/routes/v1.ts`, `apps/api/src/routes/__tests__/entitlements-plugin.test.ts`, `apps/worker/src/pipeline/entitlements.ts`, `apps/worker/src/pipeline/run-feed-pipeline.ts`, `apps/worker/src/pipeline/__tests__/entitlements.test.ts`, `packages/contracts/src/index.ts`, `db/migrations/0016_plan_entitlements.sql`.
- Reserved next slice (`agent-c`, post-current-slice only):
  `phase0/plan-subscription-sync` scoped to `apps/api/src/plugins/*entitlement*`, `apps/api/src/routes/*`, `apps/worker/src/pipeline/*`, `packages/contracts/src/index.ts`, `db/migrations/*plan*`.
- Active claim (`agent-d`, `phase0/load-slo-trend-reporting`, updated 2026-02-08T19:27:53Z):
  `infra/load/*`, `scripts/load/*`, `.planning/*SLO*`, `.planning/coordination/status/agent-d.md`, `.planning/coordination/handoffs/phase0-load-slo-calibration.md`.
- Reserved next slice (`agent-b`, post-current-slice only):
  `phase0/account-data-export-automation` scoped to `apps/worker/src/jobs/*account-data-export*`, `apps/worker/src/jobs/register-jobs.ts`, `db/migrations/*account_data_export*`.
