#!/bin/sh
set -e

# Run all SQL migration files in order against the database.
# Expects DATABASE_URL to be set in the environment.

MIGRATIONS_DIR="$(dirname "$0")/migrations"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

echo "Running migrations from $MIGRATIONS_DIR ..."

for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  Applying $(basename "$f") ..."
  psql "$DATABASE_URL" -f "$f"
done

echo "Migrations complete."
