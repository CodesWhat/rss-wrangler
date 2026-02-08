# Agent Pass Card

## Metadata

- Date: 2026-02-08
- Phase: Phase 0 (Hosted SaaS Pilot)
- Slice: Guided onboarding wizard baseline (first-run setup)
- Owner: `phase-lead-agent`
- Related roadmap items: Hosted auth + onboarding flow; Guided onboarding wizard (first-run)
- Gate impact (Free/Pro/AI/self-host): Activation flow for all hosted plans; no entitlement gate changes
- PR / branch: `main` (working tree slice)
- Atomic commits: pending (worktree not committed yet)

## Scope

- What changed:
  - Added a first-run onboarding wizard on Home when a workspace has zero feeds.
  - Wizard setup paths: add feed URL, OPML import, and Discover-directory handoff.
  - Added optional interest selection with starter-feed seeding from curated directory categories.
  - Added AI mode opt-in/save step wired to settings API.
  - Added skip/reopen UX and lightweight checklist progress in wizard.
  - Fixed OPML import client transport to use API-supported JSON payload (`{ opml: xml }`).
  - Updated feature audit statuses/counts for onboarding and hosted onboarding notes.
- What is explicitly out of scope:
  - Server-side onboarding completion state.
  - Invite/join tenant onboarding path.
  - Rich topic-to-folder/filter bootstrap rules.

## Required Agent Status

| Agent | Status | Evidence | Notes |
|---|---|---|---|
| `phase-lead-agent` | pass | Slice matches planned next step after auth hardening | Ordered before billing/entitlements work |
| `backend-dev-agent` | not_applicable | No API/worker changes required for wizard baseline | Existing endpoints reused |
| `frontend-dev-agent` | pass | `apps/web/src/components/onboarding-wizard.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`, `apps/web/src/lib/api.ts` | First-run onboarding UX shipped |
| `data-migration-agent` | not_applicable | No schema migration required | Existing settings/feed APIs sufficient |
| `qa-test-agent` | pass | `npm run typecheck`, `npm test`, `npm run test:coverage:policy`, `npm run build` | Regression/build gates pass |
| `playwright-qa-agent` | not_applicable | No Playwright onboarding suite exists yet | Follow-up remains in Phase 0 QA track |
| `accessibility-qa-agent` | pass | Wizard forms/controls labeled; keyboard paths and status text present | Baseline semantics preserved |
| `lint-conformity-agent` | pass | `npm run lint` | No lint regressions |
| `tech-debt-agent` | pass | `npm run debt:scan` | No net-new debt reported |
| `security-risk-agent` | pass | No new privileged surface; wizard uses existing authenticated APIs | Risk profile unchanged |
| `sre-cost-agent` | pass | Client-side flow only; no new service dependency | Cost impact negligible |
| `senior-review-agent` | pass | Architecture/risk pass completed | Approved with persistence/invite follow-up |

## Gate Checklist

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run test:coverage:policy`: pass
- `npm run debt:scan`: pass
- Playwright impacted flows: not applicable (suite not present yet)
- Accessibility impacted flows: pass (labels, keyboard nav, visible status)
- Entitlement checks impacted: not applicable
- Contracts updated (if needed): not needed
- Portability impact reviewed (if needed): not needed
- Debt register updated (if needed): not needed

## Merge Decision

- Decision: approved
- Blocking items:
  - Add server-side onboarding completion state.
  - Add invite/join flow for hosted tenant onboarding.
  - Add richer topic bootstrap logic (folders/filters) if required by activation metrics.
- Sign-off: `senior-review-agent`
