# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Consent + CMP baseline (necessary-only default, persistent privacy controls, region-aware gating metadata)
- Owner: `phase-lead-agent`
- Related roadmap items: Consent + CMP baseline (hosted)
- Gate impact (Free/Pro/AI/self-host): Hosted compliance baseline across all hosted plans
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added migration `db/migrations/0020_privacy_consent_baseline.sql` with tenant-scoped consent table, constraints, indexes, and RLS policy.
  - Added privacy consent service for proxy-header country resolution + explicit-consent region checks.
  - Added protected privacy consent endpoints:
    - `GET /v1/privacy/consent`
    - `PUT /v1/privacy/consent`
  - Added contracts + API client methods for privacy consent payloads.
  - Added persistent frontend privacy settings manager with:
    - necessary-only default
    - first-run consent banner
    - floating "Privacy settings" reopen control
    - consent panel with category toggles and save/reject actions
    - region-aware messaging for explicit-consent locales
  - Updated planning docs status to reflect consent baseline now partial-live.
- What is explicitly out of scope:
  - Google-certified CMP adapter integration.
  - Third-party script loader wiring and automated end-to-end consent gating tests.
  - Consent policy-version migration tooling.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice matches immediate next Phase 0 gap after billing foundation | Consent baseline moved from missing to partial |
| `backend-dev-agent` | pass | `apps/api/src/routes/v1.ts`, `apps/api/src/services/privacy-consent-service.ts` | Consent persistence + region-aware metadata implemented |
| `frontend-dev-agent` | pass | `apps/web/src/components/privacy-consent-manager.tsx`, `apps/web/app/layout.tsx` | Persistent controls + reopen path implemented |
| `data-migration-agent` | pass | `db/migrations/0020_privacy_consent_baseline.sql` | Multi-tenant/RLS-safe consent storage |
| `qa-test-agent` | pass | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run debt:scan`, `npm run build` | All required gates passed |
| `playwright-qa-agent` | not_applicable | No Playwright harness currently in repo | Add when e2e suite is available |
| `accessibility-qa-agent` | pass | Banner/panel controls include labels, dialog semantics, keyboard focusable controls | No blocking a11y issues in changed UI |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | Existing unrelated load-script warnings unchanged |
| `security-risk-agent` | pass | Necessary-only defaults + explicit opt-in model + tenant RLS persistence | Baseline compliance risk reduced |
| `sre-cost-agent` | pass | No new always-on external services/scripts | Runtime cost impact minimal |
| `senior-review-agent` | pass | End-to-end slice behavior reviewed | Approved with CMP/test follow-ups |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (unchanged existing load-script warnings)
- `npm run build`: pass
- Playwright impacted flows: not applicable (no existing Playwright harness in repo)
- Accessibility impacted flows: pass (manual review on banner + panel)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not applicable
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add CMP adapter wiring path for Google-certified flow when ads launch in EEA/UK/CH.
  - Add automated consent gating tests for non-essential script categories.
  - Add consent policy-version migration handling.
- Sign-off: `senior-review-agent`
