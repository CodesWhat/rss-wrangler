# RSS Wrangler

Open-source RSS reader with AI-powered story clustering, topic classification, smart digests, and feed discovery. Self-host for free with all features unlocked, or use the hosted service.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, custom CSS (Brutalist Mono design system) |
| API | Fastify 5, PostgreSQL 16, JWT auth (Better Auth for hosted) |
| Worker | pg-boss (Postgres-backed job queue) |
| AI | OpenAI (multi-provider abstraction planned) |
| Search | Postgres FTS (tsvector/tsquery) |
| Shared | TypeScript, Zod schemas (`packages/contracts`) |

## Project Structure

```
apps/
  web/        Next.js 14 PWA (port 3000)
  api/        Fastify 5 REST API (port 4000)
  worker/     Background jobs (feed polling, clustering, AI enrichment, digests)
packages/
  contracts/  Shared TypeScript types and Zod schemas
db/
  migrations/ PostgreSQL migrations (applied in order on startup)
infra/
  docker-compose.yml
  .env.example
```

## Quick Start (Docker Compose)

```bash
git clone <repo-url> && cd rss-wrangler
cp infra/.env.example infra/.env

# Edit infra/.env — you MUST set:
#   AUTH_JWT_SECRET  (random string, 32+ chars)
#   AUTH_PASSWORD    (strong password for admin account)
# Optional hosted auth hardening:
#   REQUIRE_EMAIL_VERIFICATION=true
#   RESEND_API_KEY=...
#   EMAIL_FROM=RSS Wrangler <no-reply@your-domain.com>

docker compose -f infra/docker-compose.yml up --build -d
```

Services started:
- **postgres** — PostgreSQL 16
- **migrate** — one-shot SQL migration runner (exits after success)
- **api** — Fastify API (port 4000)
- **worker** — feed polling, clustering, AI enrichment, digests
- **web** — Next.js frontend (port 3000)

Access the web UI at `http://localhost:3000`. Login with the username/password from your `.env`, or create a workspace account via `/signup`.

## Local Development

Requires Node.js >= 22 and a local PostgreSQL instance.

```bash
npm install

export DATABASE_URL=postgres://postgres:postgres@localhost:5432/rss_wrangler
sh db/run-migrations.sh

# In separate terminals:
npm run dev:api      # Fastify on :4000
npm run dev:worker   # Background jobs
npm run dev:web      # Next.js on :3000
```

## OrbStack Docker smoke test (recommended)

For self-host/free-user validation, run:

```bash
npm run orbstack:smoke
```

This builds and boots the Compose stack, verifies API/web health, checks login, and confirms required services are running.
Health checks run from inside containers, so they are not affected by local processes already using ports 3000/4000.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:web` | Start Next.js dev server |
| `npm run dev:api` | Start Fastify dev server (tsx watch) |
| `npm run dev:worker` | Start worker (tsx watch) |
| `npm run build` | Build all packages |
| `npm test` | Run tests (Vitest) |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:coverage:baseline` | Refresh ratcheted coverage baseline |
| `npm run test:coverage:policy` | Check coverage policy gates |
| `npm run typecheck` | Type-check all packages |
| `npm run lint` | Lint all packages |
| `npm run hosted:smoke -- --base-url <api-url>` | Hosted smoke checks (health/auth/settings) |

## Environment Variables

See `infra/.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `AUTH_USERNAME` | Yes | Admin username |
| `AUTH_PASSWORD` | Yes | Admin password |
| `APP_BASE_URL` | No | Base URL used in verification/reset email links (default: `http://localhost:3000`) |
| `REQUIRE_EMAIL_VERIFICATION` | No | Require verified email before login (`true`/`false`, default: `false`) |
| `RESEND_API_KEY` | No | Resend API key for transactional emails |
| `EMAIL_FROM` | No | Sender for verification/reset emails |
| `LEMON_SQUEEZY_API_KEY` | Hosted only | Lemon Squeezy API key for checkout + portal API calls |
| `LEMON_SQUEEZY_STORE_ID` | Hosted only | Lemon Squeezy store ID used when creating checkouts |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Hosted only | Shared secret used to verify Lemon webhook signatures |
| `LEMON_SQUEEZY_VARIANT_PRO` | Hosted only | Variant ID mapped to hosted `pro` plan |
| `LEMON_SQUEEZY_VARIANT_PRO_AI` | Hosted only | Variant ID mapped to hosted `pro_ai` plan |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `WORKER_POLL_MINUTES` | No | Feed poll interval in minutes (default: 60) |
| `OPENAI_API_KEY` | No | Required for AI features (summaries, topic classification) |

## Features

- Feed polling with conditional GET (ETag + Last-Modified)
- Story clustering and deduplication (simhash + Jaccard similarity)
- Feed-level LLM topic classification with approval workflow
- AI-generated daily digests
- Full-text search (Postgres FTS)
- Mute-with-breakout filter system
- Keyboard shortcuts
- Multiple view layouts (compact, card, list)
- OPML import and export
- Push notifications
- Annotations and highlights
- Privacy consent controls (necessary-only default, hosted non-essential opt-in)
- Feed discovery directory (500+ curated feeds)
- PWA installable
- Reading stats dashboard

## Self-Hosting

All features are unlocked when self-hosted. No license keys, no feature gates, no phone-home.

Docker Compose on any Linux server, NAS (Synology, etc.), or cloud VM. See [Quick Start](#quick-start-docker-compose) above.

## Render Blueprints

- `render.free.yaml` - free-tier smoke profile (API + web + Postgres, no worker)
- `render.yaml` - hosted dogfood baseline (API + worker + web + Postgres on starter plans)

Both profiles are documented in `infra/README.md`.

## Hosted Service (Planned)

| Tier | Price | Highlights |
|------|-------|-----------|
| Free | $0 | 50 feeds, 500 items/day, 30d retention, 60min refresh |
| Pro | $7/mo ($70/yr) | Unlimited feeds, 1yr retention, 10min refresh, full-text search |
| Pro + AI | $14/mo ($140/yr) | AI summaries, topic classification, smart digests |

## Architecture Decisions

Technical decisions are documented in `.planning/`:

- [`MONETIZATION.md`](.planning/MONETIZATION.md) — pricing tiers, locked decisions table, feature gate map
- [`COMPETITIVE_ROADMAP.md`](.planning/COMPETITIVE_ROADMAP.md) — 10-phase implementation roadmap (84 features)
- [`FEATURE_AUDIT.md`](.planning/FEATURE_AUDIT.md) — current implementation status
- [`DISCOVERY.md`](.planning/DISCOVERY.md) — feed discovery engine architecture
- [`PHASED_IMPLEMENTATION_PLAYBOOK.md`](.planning/PHASED_IMPLEMENTATION_PLAYBOOK.md) — provider stack, quality gates

## Testing

Coverage thresholds and CI rules are documented in `.planning/TEST_COVERAGE_POLICY.md`.

```bash
npm test                    # Run all tests
npm run test:coverage       # Generate coverage report
npm run test:coverage:baseline  # Refresh coverage baseline (intentional ratchet)
npm run test:coverage:policy  # Check against policy gates
```

## License

AGPL-3.0-only — see `LICENSE`.
