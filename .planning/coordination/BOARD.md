# Agent Coordination Board

Last updated: 2026-02-08

## Rules

- One slice per agent at a time.
- Update status before and after work.
- Keep commits atomic and slice-scoped.
- Record test gates run per slice.

## Slices

| Slice ID | Owner | Status | Updated At | Notes |
|---|---|---|---|---|
| phase0/invite-token-controls | agent-a | IN_PROGRESS | 2026-02-08T00:00:00Z | Invite-token/member control baseline (API + UI) |
| phase0/account-deletion-automation | agent-b | TODO | - | Grace window + purge workflow |
| phase0/entitlements-limit-middleware | agent-c | TODO | - | Plan gating + limit checks |
| phase0/load-slo-baseline | agent-d | TODO | - | Repeatable load tests + SLO gates |
