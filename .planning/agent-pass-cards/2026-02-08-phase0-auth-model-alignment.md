# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Identity model alignment (workspace-free auth UX + account-facing entitlements/billing surfaces)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth/onboarding, entitlements contract surface, billing wording polish
- Gate impact (Free/Pro/AI/self-host): Hosted auth/account flows + billing/entitlements API surface; self-host Docker smoke path
- PR / branch: `main`
- Atomic commits:
  - `018ea56` `phase0/auth-model: remove workspace inputs from auth UX`
  - `01536ba` `phase0/auth-model: default tenant in auth contracts and API`
  - `01d8745` `phase0/selfhost-docker: host-port overrides and web API build args`
  - `6fba589` `phase0/entitlements: account-facing schema and billing wording`

## Scope

- What changed:
  - Removed workspace inputs from login/signup/forgot/resend/join auth pages and fixed auth header brand alignment.
  - Defaulted tenant scope to `default` in auth contracts/service paths where tenant input was previously required.
  - Reframed entitlements contract naming to account-facing (`accountEntitlementsSchema`) and routed `/v1/account/entitlements` through the updated surface.
  - Updated billing wording to account-facing language where user-visible.
  - Hardened Docker self-host defaults:
    - Host-port override envs for API/web
    - Build-time injection for `NEXT_PUBLIC_API_BASE_URL` in web image
    - OrbStack smoke output includes direct container URLs
- Out of scope:
  - Full removal of internal `tenant_id` scaffolding
  - Workspace/member management endpoint renaming
  - Playwright harness creation

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Identity tracker executed in order | Scope stayed inside locked architecture correction |
| `backend-dev-agent` | pass | `apps/api/src/services/auth-service.ts`, `apps/api/src/plugins/entitlements.ts`, `apps/api/src/routes/v1.ts`, `apps/api/src/services/billing-service.ts` | Contract/service/route naming and default-tenant behavior updated |
| `frontend-dev-agent` | pass | `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`, `apps/web/app/forgot-password/page.tsx`, `apps/web/app/resend-verification/page.tsx`, `apps/web/app/join/page.tsx`, `apps/web/app/globals.css` | Workspace-free auth UX shipped |
| `data-migration-agent` | not_applicable | No schema migration required | Existing schema supports this slice |
| `sre-cost-agent` | pass | Account-facing entitlements/billing wording + Docker smoke hardening | Reduces operator confusion and self-host friction |
| `security-risk-agent` | pass | Auth flows remain token/session based; no new privileged bypasses | Smoke + auth verification passed |
| `qa-test-agent` | pass | Full gate run | lint/typecheck/test/coverage/debt/build all passed |
| `playwright-qa-agent` | not_applicable | No Playwright suite exists in repo yet | Accepted for this slice; follow-up remains to add harness |
| `accessibility-qa-agent` | pass | Auth layout alignment and simplified forms reviewed | No new keyboard/focus regressions introduced |
| `lint-conformity-agent` | pass | `npm run lint`, `npm run typecheck` | Clean |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt in touched modules |
| `senior-review-agent` | pass | Architecture intent preserved, regressions checked | Approved |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass (only pre-existing unused load scripts)
- `npm run build`: pass
- `npm run orbstack:smoke`: pass
- `npm run hosted:smoke -- --base-url http://localhost:4315 --web-url http://localhost:4314 --username admin --password adminadmin --tenant-slug default`: pass
- Playwright impacted flows: not applicable (no harness in repo yet)
- Contracts updated (if needed): pass
- Entitlement checks impacted: pass

## Merge Decision

- Decision: approved
- Blocking items: none for this slice
- Follow-ups:
  - Add Playwright coverage for auth/billing/account-management critical paths.
  - Continue internal tenant/workspace naming simplification in non-auth management surfaces.
- Sign-off: `senior-review-agent`
