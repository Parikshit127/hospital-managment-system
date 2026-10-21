#!/usr/bin/env bash
# Runs the database-backed access-engine tests against a THROWAWAY Postgres database.
#
#   TEST_DATABASE_URL=postgresql://user@localhost:5432/hospitalos_it?host=/tmp npm run test:integration
#
# SAFETY: the database's public schema is dropped and recreated, so the script refuses any URL whose database
# name does not end in `_it` or `_test` or `_scratch`. Never point it at a shared/dev/production database.
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an EMPTY throwaway database (name must end in _it/_test/_scratch)}"
DBNAME="$(printf '%s' "$TEST_DATABASE_URL" | sed -E 's#^[^/]+//[^/]*/([^?]*).*#\1#')"
case "$DBNAME" in
  *_it|*_test|*_scratch) ;;
  *) echo "Refusing: database '$DBNAME' does not look like a throwaway test database." >&2; exit 2 ;;
esac
export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" JWT_SECRET="${JWT_SECRET:-integration-test-secret}"
# Each test file gets a pristine schema (they share the one throwaway database, so they must not see each other's data).
for f in tests/integration/*.test.ts; do
  echo ">> $f"
  psql "$TEST_DATABASE_URL" -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
  npx prisma db push --skip-generate --accept-data-loss >/dev/null
  npx vitest run "$f"
done
