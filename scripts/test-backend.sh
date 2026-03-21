#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-lucky-seven-backend-test-$$}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16}"
POSTGRES_DB="${POSTGRES_DB:-lucky_seven_test}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run backend integration tests" >&2
  exit 1
fi

cleanup() {
  if [[ "${KEEP_BACKEND_TEST_CONTAINER:-0}" != "1" ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  else
    echo "Keeping container $CONTAINER_NAME for debugging"
  fi
}

trap cleanup EXIT

docker run \
  --rm \
  --detach \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_DB="$POSTGRES_DB" \
  --env POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_IMAGE" \
  -c wal_level=logical \
  >/dev/null

echo "Waiting for Postgres container $CONTAINER_NAME..."
until docker exec "$CONTAINER_NAME" pg_isready -U postgres -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 1
done

run_sql() {
  docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$POSTGRES_DB"
}

echo "Bootstrapping test database..."
run_sql < "$ROOT_DIR/supabase/tests/bootstrap.sql"

echo "Applying migrations..."
while IFS= read -r migration; do
  echo "  - $(basename "$migration")"
  run_sql < "$migration"
done < <(find "$ROOT_DIR/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort)

echo "Loading test helpers..."
run_sql < "$ROOT_DIR/supabase/tests/helpers.sql"

echo "Running backend integration tests..."
while IFS= read -r test_file; do
  echo "  - $(basename "$test_file")"
  run_sql < "$test_file"
done < <(find "$ROOT_DIR/supabase/tests/sql" -maxdepth 1 -type f -name '*.sql' | sort)

echo "Backend integration tests passed."
