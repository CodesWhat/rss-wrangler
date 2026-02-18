## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Deliver a competitive RSS product that is reliable to operate, fast to iterate, and transparent about what has shipped versus what is still gated.
**Current focus:** Phase 1-2 feature gap closure and pipeline hardening.

## Current Position

Phase coverage: Phase 0 + Phase 1 + Phase 2 slices shipped (audit artifacts present).
Status: Self-host on NAS is the deployment target. No hosted Render deploy — cost savings.
Last activity: 2026-02-09 -- self-host OrbStack smoke passing (all 4 feed formats), 341/341 tests green, 0 type errors.

Progress: [████████░░] ~75%

## Performance Metrics

**Delivery Totals (pass-card evidence):**
- Phase 0 slices: 21
- Phase 1 slices: 10
- Phase 2 slices: 15
- Naming cleanup: 1 (cross-cutting)
- Total slices captured: 47

**Phase Audits:**
- Phase 1 audit: completed (`.planning/phases/01-hosted-readiness-platform-hardening/01-phase-audit.md`)
- Phase 2 audit: completed (`.planning/phases/02-core-reading-experience-parity/02-phase-audit.md`)
- Phase 3 audit: completed (`.planning/phases/03-ranking-and-auto-read-personalization/03-phase-audit.md`)

## Accumulated Context

### Decisions

- **Deployment: self-host on NAS only** (2026-02-09). No Render hosted deploy — AI API costs are the only variable; hosting is $0 on NAS.
- Render Blueprint files (`render.yaml`, `render.free.yaml`) kept as reference but not actively used.
- Account model is now fixed to one owner + invited members.
- Join policy is fixed to invite-only in this build.
- Member management and invite management are owner-only surfaces.
- Naming migration complete: all TypeScript-level `tenant*`/`workspace*` references migrated to `account*`/`member*` across API and worker apps. SQL column names (`tenant_id`) and Postgres RLS config (`app.tenant_id`) remain as-is. JWT auth plugin accepts both `accountId` and legacy `tenantId` claims for backward compat.

### Completed Todos (from previous session)

1. ~~Remove deprecated membership-policy paths~~ — no matches found, already clean.
2. ~~Internal naming cleanup~~ — completed across auth-service.ts, postgres-store.ts, auth plugin, fastify.d.ts, v1.ts routes, and entire worker pipeline (db-context, 19 files). 720+ renames, 0 type errors, 324 tests green.
3. ~~Add targeted tests for invite-only + owner-only behavior~~ — already exist and passing (18 + 43 tests respectively).

### Pending Todos

1. Wire worker AI pipeline stages to multi-provider registry (currently hardcoded to OpenAI SDK). Enables Ollama on NAS for $0 AI.
2. Continue feature gap closure from Phase 3+ (ranking, personalization, etc.).

### Blockers / Concerns

- Worker AI stages (enrich-with-ai, classify-feed-topics, generate-digest) use OpenAI SDK directly — not the multi-provider registry from the API. Blocks Ollama/Anthropic in worker pipeline.
- Worktree is intentionally dirty with many in-flight slices; avoid broad cleanup/reset without explicit coordination.

## Session Continuity

Last focused slice: tenant→account naming migration (completed) + feature gap closure.
Resume priority: feature gap closure items in Pending Todos 3-6.

## Agent Tracking

Last agent: claude-code
Last modified: 2026-02-09T23:20:00Z
