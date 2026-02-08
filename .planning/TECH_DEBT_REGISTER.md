# Tech Debt Register

> Last updated: 2026-02-08
> Owner: `tech-debt-agent`

## Policy

- Goal: prevent net-new debt while paying down baseline debt by phase.
- Source command: `npm run debt:scan`
- Merge rule: for touched modules, fix debt in-slice or add a tracked follow-up row here.

## Baseline Snapshot (2026-02-08, current)

Source: `knip --include files,exports,duplicates,dependencies --reporter compact --no-exit-code`

### Scan result

- No unused files
- No unused dependencies
- No unused exports

### Intentional ignore list

- `apps/web/public/sw.js` (ignored in `knip.json`)  
  Reason: static service worker loaded by browser URL (`/sw.js`) via `navigator.serviceWorker.register`, not via import graph.

## Debt Backlog

| ID | Area | Debt Item | Severity | Status | Target Phase |
|---|---|---|---|---|---|
| TD-001 | Governance | Keep debt scan clean on each phase slice; reject net-new dead files/exports | S | Open | Every phase |
