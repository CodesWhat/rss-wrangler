# Handoff: phase0-account-deletion-automation

## Changed Files

- `apps/worker/src/jobs/account-deletion-automation.ts`
- `apps/worker/src/jobs/__tests__/account-deletion-automation.test.ts`
- `apps/worker/src/jobs/job-names.ts`
- `apps/worker/src/jobs/register-jobs.ts`
- `db/migrations/0017_account_deletion_lifecycle_automation.sql`
- `.planning/FEATURE_AUDIT.md`
- `.planning/coordination/BOARD.md`
- `.planning/coordination/status/agent-b.md`
- `.planning/agent-pass-cards/2026-02-08-phase0-account-deletion-automation.md`

## Migration / Rollout

- Run `db/migrations/0017_account_deletion_lifecycle_automation.sql`.
- Migration adds due-processing index for pending deletion requests, allows `account_deletion_request.user_id` to become nullable for post-purge audit rows, and enforces that only pending requests require a non-null `user_id`.
- Worker queue `process-account-deletions` runs every 30 minutes and enforces a 7-day grace window before hard purge.

## Validation

- `npm run lint` pass
- `npm run typecheck` pass
- `npm test` pass
- `npm run test:coverage:policy` pass
- `npm run debt:scan` pass (existing unrelated unused-file notices under `scripts/load/*`)
- `npm run build` pass

## Remaining Risks / Follow-ups

- User-facing deletion completion notifications (email/in-app) are not yet implemented.
- Account data export lifecycle automation (queueing/retention/notifications) remains a separate follow-up slice.
