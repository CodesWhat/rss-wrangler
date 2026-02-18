# Requirements: RSS Wrangler

**Defined:** 2026-02-09
**Core Value:** Deliver a competitive RSS product that is reliable to operate, fast to iterate, and transparent about what has shipped versus what is still gated.

## v1 Requirements

### Hosted Readiness

- [ ] **HOST-01**: Hosted auth/onboarding, tenant membership, and account lifecycle flows remain operational and documented.
- [ ] **HOST-02**: Billing and entitlement controls stay enforceable across API, worker, and settings UX.
- [ ] **HOST-03**: Hosted and self-host smoke/load checks remain runnable from repo automation.

### Core Reading Experience

- [ ] **READ-01**: Reader-mode/full-text path is usable with clear extraction-state behavior.
- [ ] **READ-02**: Cluster and card UI expose source/label context plus bulk read controls without regressions.
- [ ] **READ-03**: Feed ingestion/parser upgrades preserve compatibility with existing source flows.

### Ranking and Auto-Read Personalization

- [ ] **RANK-01**: Auto mark-read behavior supports open/scroll thresholds and scoped overrides.
- [ ] **RANK-02**: Ranking factors incorporate source, engagement, topic/folder affinity, diversity, and exploration baselines.
- [ ] **RANK-03**: Explainability payload/UI baseline exposes why-ranked context for visible stories.

### Delivery Hygiene

- [ ] **OPS-01**: Phase evidence remains summarized in auditable artifacts with clear follow-up gaps.

## v2 Requirements

Deferred to future release.

## Out of Scope

- Team collaboration and enterprise RBAC workflows
- Native iOS/Android clients
- Full social-network ingestion as first-party sources

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOST-01 | 1 | In progress |
| HOST-02 | 1 | In progress |
| HOST-03 | 1 | In progress |
| READ-01 | 2 | In progress |
| READ-02 | 2 | In progress |
| READ-03 | 2 | In progress |
| RANK-01 | 3 | In progress |
| RANK-02 | 3 | In progress |
| RANK-03 | 3 | In progress |
| OPS-01 | 1,2,3 | In progress |
