# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Hosted auth hardening - email verification + password reset
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth + onboarding flow; Hosted account management + compliance controls
- Gate impact (Free/Pro/AI/self-host): Hosted auth baseline across all hosted plans; no plan gate changes
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added signup email capture and verification flow: verification token issuance, resend endpoint, verify endpoint, and verification email delivery hook (Resend-backed when configured).
  - Added forgot/reset password flow: reset token issuance, forgot/reset endpoints, password update, and active-session revocation.
  - Added migration for `user_account.email`, `user_account.email_verified_at`, and auth token tables (`auth_email_verification_token`, `auth_password_reset_token`).
  - Added web UX for `/forgot-password`, `/reset-password`, `/verify-email`, and `/resend-verification`, plus login/signup wiring updates.
  - Added env/config support for `APP_BASE_URL`, verification/reset TTLs, optional email sender/API key, and `REQUIRE_EMAIL_VERIFICATION`.
  - Updated feature audit status for hosted auth/account controls.
- What is explicitly out of scope:
  - Invite/join flow for multi-user tenants.
  - Guided onboarding wizard after signup.
  - Account deletion grace-window automation and GDPR data-download workflow.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice aligns with remaining Phase 0 auth gaps | Sequenced before billing/entitlements |
| `backend-dev-agent` | pass | `apps/api/src/services/auth-service.ts`, `apps/api/src/routes/v1.ts`, `apps/api/src/config/env.ts`, `apps/api/src/services/email-service.ts`, `packages/contracts/src/index.ts` | Verification/reset token lifecycle and endpoints shipped |
| `frontend-dev-agent` | pass | `apps/web/app/signup/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/forgot-password/page.tsx`, `apps/web/app/reset-password/page.tsx`, `apps/web/app/verify-email/page.tsx`, `apps/web/app/resend-verification/page.tsx`, `apps/web/src/lib/api.ts` | Auth recovery/verification UX shipped |
| `data-migration-agent` | pass | `db/migrations/0013_auth_email_verification_and_password_reset.sql` | New auth columns/tables/indexes added |
| `qa-test-agent` | pass | `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run build` | Regression/build gates pass |
| `playwright-qa-agent` | not_applicable | No Playwright auth/account suite in repo yet | Follow-up remains in Phase 0 QA track |
| `accessibility-qa-agent` | pass | New forms use labels, keyboard submit paths, and inline status text | Baseline WCAG form semantics preserved |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt reported |
| `security-risk-agent` | pass | Token hashing, single-use/expiry semantics, session revocation on reset, optional strict email-verification gate | Reduces takeover/replay risk |
| `sre-cost-agent` | pass | Reuses existing API process + optional Resend API; no new infra service | Cost impact minimal and controllable |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with onboarding/invite follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (labeled inputs, keyboard flow, visible status/errors)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): pass
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add invite/join flow and first-run onboarding wizard to complete hosted auth/onboarding scope.
  - Add account deletion lifecycle automation + data download flow to complete hosted compliance controls.
- Sign-off: `senior-review-agent`
