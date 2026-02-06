# Database

- Migrations live in `db/migrations`.
- Apply manually in MVP scaffold:
  ```bash
  psql "$DATABASE_URL" -f db/migrations/0001_init.sql
  ```
- `pg-boss` creates its own schema/tables automatically at worker startup.
