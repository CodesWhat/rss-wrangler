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

## Migrations

Database migrations run automatically on startup via the `migrate` service.
The `migrate` container uses `postgres:16-alpine` (which includes `psql`) and
executes all `.sql` files in `db/migrations/` in alphabetical order.

Both `api` and `worker` services depend on `migrate` completing successfully
before they start (via `service_completed_successfully`).

To run migrations manually:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rss_wrangler sh db/run-migrations.sh
```
