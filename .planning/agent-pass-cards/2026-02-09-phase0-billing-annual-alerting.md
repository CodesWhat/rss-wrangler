# Agent Pass Card

## Metadata

- Date: 2026-02-09
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Billing annual variants + webhook failure alerting
- Owner: `phase-lead-agent`
- Related roadmap items: Billing foundation (Lemon Squeezy + plan management UX)
- Gate impact (Free/Pro/AI/self-host): Hosted Pro/Pro+AI checkout lifecycle + billing ops visibility
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added billing interval support (`monthly` / `annual`) to shared contracts and checkout payloads.
  - Extended billing overview payload with detected subscription cadence + per-plan checkout availability matrix.
  - Added annual variant env support (`LEMON_SQUEEZY_VARIANT_PRO_ANNUAL`, `LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL`).
  - Updated billing service checkout mapping to select variants by plan + interval.
  - Hardened webhook processing against unknown variant IDs (ignore + alert, no accidental free downgrade).
  - Added optional webhook failure alert sink (`BILLING_ALERT_WEBHOOK_URL`) with alert emission for signature/payload/tenant-resolution/processing failures.
  - Added monthly/annual interval toggles in Settings Billing and Pricing page.
  - Added billing service tests for annual checkout selection, alert webhook emission, and unknown-variant webhook handling.
  - Updated planning docs status to mark billing annual + alerting polish complete.
- What is explicitly out of scope:
  - Lemon webhook replay worker/tooling.
  - Team billing / org-level billing.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with remaining billing polish gap | Closes annual + alerting follow-ups |
| `backend-dev-agent` | pass | `apps/api/src/services/billing-service.ts`, `apps/api/src/routes/v1.ts`, `apps/api/src/config/env.ts` | Interval variants + webhook alerts wired |
| `frontend-dev-agent` | pass | `apps/web/app/settings/page.tsx`, `apps/web/app/pricing/page.tsx`, `apps/web/src/lib/api.ts` | Monthly/annual billing UX shipped |
| `data-migration-agent` | not_applicable | No DB schema changes required | Existing billing metadata schema reused |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | All required gates passed |
| `playwright-qa-agent` | not_applicable | No Playwright billing harness in repo yet | Add when e2e harness lands |
| `accessibility-qa-agent` | pass | Toggle controls use keyboard-operable buttons + labels | No blocking a11y regressions found |
| `lint-conformity-agent` | pass | `npm run lint` | Clean |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated load-script warnings unchanged |
| `security-risk-agent` | pass | Unknown-variant guard + webhook failure alerting added | Prevents accidental entitlement downgrade on bad variant mapping |
| `sre-cost-agent` | pass | Alert sink + availability introspection reduce billing blind spots | Supports hosted launch monitoring |
| `senior-review-agent` | pass | End-to-end flow + failure paths reviewed | Approved |

## Gate Checklist

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (unchanged existing load-script warnings)
- `npm run build`: pass
- Playwright impacted flows: not applicable (no existing Playwright harness)
- Accessibility impacted flows: pass (manual review on interval toggles + billing actions)
- Entitlement checks impacted: pass (unknown variants no longer risk unintended free-plan sync)
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not applicable
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items: none
- Follow-ups:
  - Add webhook replay tooling for failed events if operationally needed.
  - Run first hosted dogfood telemetry pass to validate plan-limit economics.
- Sign-off: `senior-review-agent`
