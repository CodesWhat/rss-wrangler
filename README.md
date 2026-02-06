# RSS Wrangler

TypeScript-first monorepo for a single-user self-hosted RSS reader with auto folders, story clustering, mute-with-breakout filters, and digest workflows.

## Workspace layout

- `apps/web`: Next.js PWA UI
- `apps/api`: Fastify HTTP API
- `apps/worker`: Node worker for feed polling and pipeline jobs
- `packages/contracts`: Shared schemas and API types
- `db`: SQL migrations
- `infra`: Docker Compose and deployment assets

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env files:
   ```bash
   cp infra/.env.example infra/.env
   ```
3. Run Postgres + services:
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```

## Development

- Web: `npm run dev:web`
- API: `npm run dev:api`
- Worker: `npm run dev:worker`

## Notes

- Queueing uses Postgres (`pg-boss`) in MVP1.
- Redis is optional and not required for MVP1.
- Python sidecar is deferred unless quality gates in `SPEC.md` require it.
