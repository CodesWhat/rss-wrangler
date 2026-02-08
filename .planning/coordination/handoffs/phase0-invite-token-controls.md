# Handoff: phase0-invite-token-controls

## Changed Files

- `db/migrations/0015_workspace_invites.sql`
- `packages/contracts/src/index.ts`
- `apps/api/src/services/auth-service.ts`
- `apps/api/src/routes/v1.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/app/join/page.tsx`
- `apps/web/app/account/invites/page.tsx`
- `apps/web/src/components/nav.tsx`
- `.planning/FEATURE_AUDIT.md`
- `.planning/agent-pass-cards/2026-02-08-phase0-invite-token-controls.md`
- `.planning/coordination/BOARD.md`
- `.planning/coordination/status/agent-a.md`

## Migration / Rollout

- Run migration `0015_workspace_invites.sql` before enabling invite endpoints in hosted environments.
- Join behavior now requires valid invite code for existing workspaces with at least one user.

## Validation

- `npm run lint` pass
- `npm run typecheck` pass
- `npm test` pass
- `npm run test:coverage:policy` pass
- `npm run debt:scan` pass (existing unrelated unused-file notices)
- `npm run build` pass

## Remaining Risks / Follow-ups

- No tenant role model yet; any authenticated workspace member can currently manage invites.
- No invite email delivery automation in this slice.
- No dedicated invite usage audit UI yet.
