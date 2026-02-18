# RSS Wrangler

## What This Is

RSS Wrangler is a multi-tenant RSS reader built as a web app, API, and worker pipeline that clusters stories, supports personalization, and runs in hosted or self-hosted environments. It focuses on modern reading workflows with strong operational guardrails and clear entitlement boundaries.

## Core Value

Deliver a competitive RSS product that is reliable to operate, fast to iterate, and transparent about what has shipped versus what is still gated.

## Requirements

### Validated

(None yet -- ship to validate)

### Active

- [ ] Close hosted-readiness slices (auth, onboarding, billing, compliance, SLO checks)
- [ ] Complete core reading experience parity (reader mode, card metadata, bulk read actions)
- [ ] Ship ranking and mark-read personalization baselines with explainability
- [ ] Keep self-host-first workflows healthy while hosted dogfood readiness continues

### Out of Scope

- Team/enterprise collaboration features
- Native mobile apps
- Full third-party protocol parity beyond scoped compatibility goals

## Context

Codebase is a JavaScript/TypeScript monorepo (`apps/api`, `apps/web`, `apps/worker`) with supporting infra under `infra/`. Planning context and competitive scope live in `.planning/COMPETITIVE_ROADMAP.md` and `.planning/PHASED_IMPLEMENTATION_PLAYBOOK.md`. Execution in this cycle is focused on converting existing pass-card work into explicit GSD phase tracking.

## Constraints

- **Self-host-first quality bar**: Docker/OrbStack readiness and smoke coverage remain mandatory.
- **Hosted guardrails**: Billing, consent, entitlements, and load/SLO checks must stay aligned with roadmap notes.
- **Atomicity**: Slices should remain bisectable and traceable via pass cards and phase artifacts.
- **Single-user workflow assumption**: prioritize individual-reader outcomes over team features.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|

---
*Last updated: 2026-02-09 after initialization*
