# RSS Wrangler Phased Implementation Playbook

> Created: 2026-02-08
> Purpose: turn roadmap scope into an execution system with explicit agent roles, quality gates, and implementation checklists.

---

## Priority Tracker: Identity Model Alignment (Locked 2026-02-08)

Locked architecture for Phase 0:

- Self-hosted: single instance, one bootstrap admin, many users with isolated feeds/settings.
- Hosted SaaS: one Wrangler product, many direct user accounts (Free/Pro/Pro+AI per user).
- Workspace slug is not a user-facing auth concept in v1 (no workspace field in login/signup/recovery).
- Existing tenant scaffolding may remain internal during transition, but UX and contracts must be workspace-free.

Execution tracker (must complete before net-new Phase 0 feature slices):

- [x] `phase-lead-agent` + `senior-review-agent`: lock architecture decision in planning docs.
- [x] `frontend-dev-agent` + `accessibility-qa-agent`: remove workspace inputs from auth screens and fix auth header alignment issues.
- [x] `backend-dev-agent` + `contracts-agent`: default tenant scope internally (`default`) and remove/soft-deprecate workspace-required auth payloads.
- [ ] `backend-dev-agent` + `sre-cost-agent`: shift entitlements/billing wording + contract surfaces to user-account subscriptions (not workspace-facing plans).
- [ ] `qa-test-agent` + `playwright-qa-agent` + `lint-conformity-agent` + `tech-debt-agent`: run full gates, close regressions, and update pass card evidence.

Done criteria for this tracker:

1. No auth page asks for workspace/tenant input.
2. Signup/login/reset/verification flows succeed in Docker self-host smoke and hosted smoke.
3. Planning docs consistently describe single-product multi-user hosted model.
4. Existing tenant columns are treated as internal implementation detail only.

---

## Why This Exists

`COMPETITIVE_ROADMAP.md` defines what to build.  
`FEATURE_AUDIT.md` defines current state/gaps.  
`MONETIZATION.md` defines what must be gated by tier.

This playbook defines how each phase is executed by an agent team.

---

## Source Of Truth Order

1. `/.planning/FEATURE_AUDIT.md` (reality check; current implementation status)
2. `/.planning/COMPETITIVE_ROADMAP.md` (phase scope and dependencies)
3. `/.planning/MONETIZATION.md` (tier gates and entitlement requirements)
4. `/.planning/DISCOVERY.md` (feed discovery-specific architecture)
5. `/.planning/TEST_COVERAGE_POLICY.md` (coverage thresholds and CI gate rules)

If docs conflict, resolve in this order and update all affected docs in the same PR.

---

## Provider Lock (Hobby / Phase 0)

This is the default provider stack until hosted usage requires paid upgrades.

| Layer | Locked Provider | Hobby Default | Upgrade Trigger |
|---|---|---|---|
| Web/PWA frontend | Render (static site service) | Free tier | Move to paid when build minutes or bandwidth exceed free allocation |
| API + Worker runtime | Render (web service + background worker) | Free tier, then Starter | Move to paid when free resource limits or reliability constraints are hit |
| Primary Postgres | Render Postgres | Free tier | Move to paid when storage, connections, or PITR needs exceed free allowances |
| Object storage | Cloudflare R2 | Free tier (10 GB, free egress) | Move to paid when storage/request usage exceeds free allocation |
| Transactional email | Resend | Free tier (100/day, 3k/month) | Move to Pro ($20/mo) when daily send limits are exceeded |
| Caching/rate-limit store | Skip Redis — use Postgres | $0 | Add Upstash Redis only if multi-instance rate limiting requires it |
| Auth provider | Better Auth (npm library in Fastify) | $0 — runs in API process | N/A — no per-user cost; scales with API compute |
| Payment processor | Lemon Squeezy (Merchant of Record) | 5% + 50¢/txn | N/A — MoR handles tax/VAT/invoicing globally |
| Consent/CMP (hosted) | Necessary-only by default + Google Privacy & messaging when Google ads are enabled for EEA/UK/CH | $0 at launch | Move to a third-party certified CMP only if customization or vendor-scope needs outgrow Google tooling |

Implementation notes:
- Keep queueing on `pg-boss` backed by Postgres to avoid introducing an additional queue vendor in Phase 0.
- All services deploy to Render as separate services: Web (Next.js static/SSR), API (Fastify + Better Auth), Worker (pg-boss jobs), Postgres.
- Better Auth runs inside the Fastify process — no separate auth service. Provides: signup, login, password reset, email verification, MFA (TOTP), and session management. Uses existing Postgres for auth tables.
- Resend handles transactional email (password reset, email verification). Free tier covers early launch.
- Self-hosted mode: keep existing env-based bootstrap (`AUTH_USERNAME`/`AUTH_PASSWORD`) as simple alternative. Better Auth is the hosted auth path.
- Self-hosted distribution: Docker Compose (API + Worker + Postgres + Web in one compose file).
- Payment: Lemon Squeezy as Merchant of Record — handles global sales tax, VAT, invoicing. No tax ID required to start.
- No Redis at launch. Rate limiting via Postgres or in-memory. Re-evaluate if multi-instance scaling demands it.
- Queue: pg-boss (Postgres-backed). No BullMQ/Redis. Handles scheduled polling, retries, dead-letter at RSS scale.
- Search: Postgres FTS (tsvector/tsquery). Already partially implemented. Add dedicated search engine only at scale.
- Observability: Sentry for error tracking + performance. Render built-in for logs/metrics. Add Grafana/Datadog only if custom dashboards needed.
- Ads posture: subscription-first launch (no ads enabled by default). Build sponsored-story primitives behind a feature flag; paid tiers remain ad-free.
- Consent posture: default-deny non-essential scripts. Only load analytics/ad tags after consent and region checks.

---

## Current Status Snapshot (2026-02-08)

- Phase 0 completed slices: auth recovery/verification, onboarding wizard + server persistence, account data-export baseline, invite-token controls, member approval policy/roles, account-deletion automation, hosted load/SLO baseline + calibration, billing foundation baseline, consent/CMP baseline, self-host Docker/OrbStack smoke hardening, and hosted post-deploy smoke verification tooling.
- Phase 0 in progress: identity model alignment (workspace-free auth UX/contracts), entitlements hardening beyond baseline limits, and hosted dogfood rollout readiness.
- Still open for hosted launch: billing polish (cancel/reactivate UX + annual variants + webhook alerting), CMP adapter + script-gating verification, and first hosted dogfood telemetry run.
- Deployment readiness update: Render blueprint profiles now exist (`render.free.yaml` smoke, `render.yaml` dogfood baseline); next action is first live deploy + telemetry validation.

---

## Agent Roles

| Agent | Primary Responsibility | Required Output |
|---|---|---|
| `phase-lead-agent` | Owns scope, sequencing, and merge decisions for a phase | Phase kickoff note + phase closeout note |
| `backend-dev-agent` | API, worker, business logic, auth/entitlement checks | Backend PRs with tests and migration notes |
| `frontend-dev-agent` | UI, interaction flows, accessibility, responsive behavior | Frontend PRs with screenshots and UX notes |
| `data-migration-agent` | Schema design, migrations, indexes, data backfills | Migration PR + rollback notes |
| `ai-pipeline-agent` | Model/provider integration, prompts, token/cost guardrails | AI integration PR + budget/latency report |
| `qa-test-agent` | Test plan, regression coverage, failure-mode checks | Test matrix + pass/fail report |
| `playwright-qa-agent` | End-to-end user-flow verification with Playwright across impacted surfaces | Playwright run report + failure triage list |
| `accessibility-qa-agent` | WCAG 2.2 AA checks: semantics, keyboard/focus flow, contrast, and screen-reader validation for impacted UI | Accessibility report with blocking/non-blocking findings |
| `lint-conformity-agent` | Lint/type/test pass, codebase conventions, DRY/refactor checks | Conformity report + required fixes |
| `tech-debt-agent` | Dead code, duplicate logic, and drift control across touched modules | Debt scan report + debt register update |
| `senior-review-agent` | Architecture review, risk review, tradeoff arbitration | Review summary with approve/block decision |
| `security-risk-agent` | Auth, abuse, scraping/paywall, API surface risk checks | Security checklist + mitigations |
| `sre-cost-agent` | Reliability, observability, cost/usage constraints | Metrics + alerting + cost impact note |
| `api-compat-agent` | Google Reader/Fever adapter behavior and contract checks | Interop test report with client matrix |

---

## Standard Delivery Loop (Per Feature Slice)

1. `phase-lead-agent` creates a feature slice ticket from roadmap + audit.
2. `backend-dev-agent` and `frontend-dev-agent` implement in parallel where possible.
3. `data-migration-agent` ships schema work first when needed.
4. `qa-test-agent` runs unit/integration/regression test matrix on the slice.
5. `playwright-qa-agent` runs end-to-end flows for impacted user journeys.
6. `accessibility-qa-agent` runs WCAG 2.2 AA checks (automated + manual spot checks) for impacted flows.
7. `lint-conformity-agent` enforces lint/type/test and DRY/convention checks.
8. `tech-debt-agent` runs debt scan and records net-new debt items (or confirms none).
9. `senior-review-agent` signs off or blocks with explicit reasons.
10. Update planning docs if scope/status changed during implementation.

No slice merges without steps 4-9 complete.

---

## Agent Pass Card (Required Artifact)

Every feature slice must have an Agent Pass Card at:

`/.planning/agent-pass-cards/YYYY-MM-DD-<phase>-<slice>.md`

Rules:

1. Create the card at slice kickoff from a standard pass-card template.
2. Include every required agent for the phase (see Phase Agent Matrix).
3. Allowed status values: `pass`, `fail`, `not_applicable`.
4. `not_applicable` requires a one-line rationale and `phase-lead-agent` acknowledgment.
5. Any `fail` or missing required-agent status blocks merge.
6. `senior-review-agent` final approve/block decision must reference the card path.
7. If a gate fails, the slice returns to implementation and the same card is updated with rerun evidence.

---

## Global Quality Gates (Every PR)

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes (or impacted test suites with rationale)
- `npm run test:coverage:policy` passes for code changes (see `/.planning/TEST_COVERAGE_POLICY.md`)
- Playwright suite for impacted user flows passes (`playwright-qa-agent`)
- If Playwright fails, status is `changes_requested` and the slice returns to implementation; no merge
- Accessibility checks pass for impacted flows: automated axe baseline + manual keyboard/focus + screen-reader spot checks (`accessibility-qa-agent`)
- If accessibility fails at blocking severity, status is `changes_requested` and the slice returns to implementation; no merge
- Entitlements are enforced for hosted-only gated features
- Any non-essential cookie/storage/script change includes consent gating tests (accept/reject/withdraw + region behavior) with default-deny fallback
- Sponsored/ad feed items, when enabled, are explicitly labeled and excluded from ranking/training signal pipelines
- Hosted account-management flows are validated where impacted (password change/reset, account deletion lifecycle, data download request lifecycle)
- Hosted scale-impacting changes include load-test evidence against declared SLO budgets (p95 latency, error rate, queue lag/job success where relevant)
- API contract changes are reflected in `packages/contracts`
- User-owned data model changes include portability impact review (export schema/version coverage updated when applicable)
- Audit status is updated when a feature moves from missing/partial to implemented
- `npm run debt:scan` output is reviewed; net-new dead code / unused exports / duplicate pathways in touched modules are either fixed or explicitly logged in `/.planning/TECH_DEBT_REGISTER.md`
- Agent Pass Card exists for the slice with all required agents recorded and no unresolved `fail` statuses

### AI Lint Profile

This codebase is AI-managed. Lint policy is tuned for signal over noise:

1. Block on high-signal correctness/suspicious diagnostics that indicate real breakage risk.
2. Do not block on stylistic preferences that produce churn without reliability gain.
3. Keep formatter disabled in gate paths; formatting can be done in dedicated cleanup commits.
4. Ratchet strictness only after debt baseline drops; do not flip broad strict mode mid-phase.

---

## Phase Agent Matrix

| Phase | Required Agents | Optional Agents | Exit Gate |
|---|---|---|---|
| Phase 0: Hosted SaaS Pilot | `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `data-migration-agent`, `sre-cost-agent`, `security-risk-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `ai-pipeline-agent` | Single-product multi-user auth/onboarding + account management/compliance controls + entitlements/limits + load-test/SLO baseline + Lemon Squeezy billing foundation + consent/CMP baseline for non-essential scripts + telemetry dashboards verified |
| Phase 1: Core Reading Experience | `phase-lead-agent`, `frontend-dev-agent`, `backend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `data-migration-agent`, `security-risk-agent` | Reader UX baseline complete, guided onboarding is live, and key gaps from audit top-10 reduced |
| Phase 2: Ranking & Personalization | `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `data-migration-agent`, `ai-pipeline-agent` | Ranking uses intended signals with explainability and regression coverage |
| Phase 3: AI Power Features | `phase-lead-agent`, `ai-pipeline-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `sre-cost-agent`, `security-risk-agent` | Provider abstraction + AI gating + budget controls validated |
| Phase 4: Sources & Feed Management | `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `data-migration-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `security-risk-agent` | Add-source flows, discovery engine, and directory seed are stable |
| Phase 5: Rules & Automation | `phase-lead-agent`, `backend-dev-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `ai-pipeline-agent`, `security-risk-agent` | Rule engine/action flows + auditability + AI wand controls verified |
| Phase 6: Social & Sharing | `phase-lead-agent`, `frontend-dev-agent`, `backend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `security-risk-agent` | Annotation/share UX stable with reliable connector behavior and data portability export bundle validated |
| Phase 7: Pipeline Reliability | `phase-lead-agent`, `backend-dev-agent`, `data-migration-agent`, `sre-cost-agent`, `qa-test-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `playwright-qa-agent`, `security-risk-agent` | Circuit breaker/DLQ/retry/timeout + feed-revive (re-discovery/canonical-swap) observability and alarms complete |
| Phase 8: PWA & Mobile Polish | `phase-lead-agent`, `frontend-dev-agent`, `qa-test-agent`, `playwright-qa-agent`, `accessibility-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `backend-dev-agent` | Mobile/PWA UX pass on target devices with offline sync validation and accessibility checks |
| Phase 9: Client Compatibility | `phase-lead-agent`, `backend-dev-agent`, `api-compat-agent`, `qa-test-agent`, `playwright-qa-agent`, `lint-conformity-agent`, `tech-debt-agent`, `senior-review-agent` | `frontend-dev-agent`, `security-risk-agent` | Compatibility subset validated across chosen client matrix |

---

## PR Sequencing Rules

- Prefer vertical slices over layer-only mega PRs.
- Keep migrations separate from large UI rewrites when possible.
- Commit discipline is mandatory: use atomic commits to keep regression triage and rollback fast.
- Merge order for risky work:
1. contracts and schema
2. backend behavior
3. frontend wiring
4. polish and optimization
- Each PR must name:
1. impacted roadmap feature(s)
2. gate impact (Free/Pro/AI/self-host)
3. audit rows expected to change
4. agent pass card path

### Atomic Commit Rules

1. One behavioral change per commit (no mixed unrelated fixes).
2. Schema migrations are isolated in their own commit with rollback notes.
3. Refactors/chore moves are separate from behavior changes.
4. Tests for a behavior change are in the same commit as that behavior change.
5. Formatting-only changes are separate, and should not be mixed into feature commits.
6. Commit message must identify the slice and intent using `phaseX/slice: intent`; optional emoji prefix is allowed (for example: `phase0/auth-model: remove workspace input from login` or `✨ phase0/auth-model: remove workspace input from login`).

---

## Phase Kickoff Template

Use this at the start of each phase:

1. Confirm phase scope list from `COMPETITIVE_ROADMAP.md`.
2. Mark current status rows in `FEATURE_AUDIT.md`.
3. Define 2-4 feature slices with owners (`backend-dev-agent`, `frontend-dev-agent`, etc.).
4. Confirm gate behavior from `MONETIZATION.md`.
5. Define test plan and rollback criteria.
6. Create pass card stubs for each slice.

---

## Phase Closeout Template

Use this before moving to next phase:

1. Update completed roadmap items and any re-scoped items.
2. Update `FEATURE_AUDIT.md` statuses and summary counts.
3. Verify all new gated features enforce entitlements in API/worker/frontend.
4. Capture regressions, debt, and follow-up issues for next phase.
5. `senior-review-agent` signs final go/no-go for phase close.
6. Verify all phase slice pass cards are present and finalized.
