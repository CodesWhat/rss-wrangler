# Synology deployment notes

1. Copy `infra/.env.example` to `infra/.env` and set secrets.
   - Change `AUTH_JWT_SECRET` to a strong random string (>= 16 chars).
   - Change `AUTH_PASSWORD` to a secure password.
   - Change `POSTGRES_PASSWORD` if exposing the database externally.
2. From repo root:
   ```bash
   docker compose -f infra/docker-compose.yml up --build -d
   ```
3. Access web UI at `http://<tailscale-hostname>:3000`.
4. Keep API private to Tailscale; do not expose to public WAN.

## OrbStack self-host validation (default local loop)

Use this as the primary test path before hosted deploys:

```bash
npm run orbstack:smoke
```

What it does:

- ensures `infra/.env` exists (creates from example if missing)
- builds and boots the Docker Compose stack
- waits for API and web health from inside containers (avoids host port conflicts)
- performs an auth login smoke check (when `AUTH_USERNAME` and `AUTH_PASSWORD` exist)
- verifies `api`, `web`, `worker`, and `postgres` are running

Related commands:

```bash
npm run orbstack:up
npm run orbstack:down
```

## Migrations

Database migrations run automatically on startup via the `migrate` service.
The `migrate` container uses `postgres:16-alpine` (which includes `psql`) and
executes all `.sql` files in `db/migrations/` in alphabetical order.

`migrate` is a one-shot job and is expected to exit after success. In some Docker UIs
it may appear as "stopped" or not green even when migrations completed correctly.

Both `api` and `worker` services depend on `migrate` completing successfully
before they start (via `service_completed_successfully`).

To run migrations manually:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rss_wrangler sh db/run-migrations.sh
```

## Render deployment (Blueprint)

Two Blueprint files are available at repo root:

- `render.free.yaml`: free-tier smoke setup (API + Web + Postgres only; no worker).
- `render.yaml`: dogfood baseline (API + Worker + Web + Postgres on starter plans).

### 1) Free smoke deploy

Use `render.free.yaml` to verify hosted auth, billing, consent, and basic web/API paths.

### 2) Dogfood deploy (recommended next)

Use `render.yaml` for realistic hosted testing and cost tracking.
This is the first point where p95 latency, ingestion, and background job behavior are meaningful.

### Hosted smoke verification (post-deploy)

After deploy, run a fast verification pass before load/SLO gates:

```bash
npm run hosted:smoke -- \
  --base-url https://<api-service>.onrender.com \
  --web-url https://<web-service>.onrender.com \
  --username <smoke-user> \
  --password <smoke-password> \
  --tenant-slug default
```

Report output: `infra/load/results/latest-hosted-smoke.json`

### Notes

- API runs migrations automatically on startup via:
  ```bash
  npm run db:migrate
  ```
- Fill all `sync: false` env vars in Render dashboard after first apply.
- For browser traffic, `NEXT_PUBLIC_API_BASE_URL` and `API_CORS_ORIGIN` are wired from service external URLs.
