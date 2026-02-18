# Roadmap: RSS Wrangler

## Overview

This document tracks execution status for the active roadmap stream rather than re-listing every candidate feature. Source scope remains `.planning/COMPETITIVE_ROADMAP.md`; this file records where delivery currently stands and what should run next.

## Phase Status (Execution)

| Phase | Scope | Status | Evidence |
|-------|-------|--------|----------|
| Phase 0 | Hosted readiness + self-host operational hardening | In progress | `.planning/phases/01-hosted-readiness-platform-hardening/01-phase-audit.md` |
| Phase 1 | Core reading experience parity | In progress | `.planning/phases/02-core-reading-experience-parity/02-phase-audit.md` |
| Phase 2 | Ranking + auto-read personalization baseline | In progress | `.planning/phases/03-ranking-and-auto-read-personalization/03-phase-audit.md` |

## Shipped Highlights

### Phase 0

- Auth/account lifecycle baseline (signup/join/login/recovery, deletion/export baseline).
- Billing + entitlements baseline shipped and wired.
- Self-host/hosted readiness tooling and smoke scripts present.
- Current model hardening: single owner + invited members, invite-only join policy fixed, owner-only member/invite management.

### Phase 1

- Parser modernization (`feedsmith`) and reader mode baseline/completion.
- Cluster detail page, hero images, outlet badges, card metadata labels.
- Mark-all-read baseline plus search/saved-search and feed health improvements.
- Full-text extraction baseline added to ingest path with fallback behavior retained.

### Phase 2

- Auto-read baseline (scroll/open modes, per-view thresholds/delays, overrides).
- Ranking baseline expansion (source weight, engagement signals, topic/folder affinity).
- Diversity/exploration baseline and explainability UI baseline.
- Retention controls baseline (settings + worker cleanup job).

## Next Slices (Priority Order)

1. Self-host checkpoint rerun and artifact capture:
   - `npm run selfhost:readiness -- --clean-db true --teardown true`
2. Hosted dogfood telemetry gate after self-host pass:
   - `npm run hosted:dogfood`
3. Naming cleanup continuation:
   - Contracts, API routes, billing, AI-usage, and entitlements have been migrated to `member/account` naming with backward-compat aliases.
   - Remaining: auth-service.ts, postgres-store.ts, auth plugin JWT claims, and worker pipeline still use `tenant*` internally.
4. Dead-path cleanup for fixed policy model:
   - Remove deprecated membership-policy and join pending-approval paths where no longer needed.
5. Test hardening:
   - Add API + UI tests for invite-only join and owner-only member-management visibility/permissions.

## Working Rules

- Keep slices atomic and reversible.
- Keep self-host quality bar green while hosted readiness continues.
- Update this file and `.planning/STATE.md` whenever a major slice lands.
