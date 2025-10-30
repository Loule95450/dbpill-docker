#!/bin/sh
set -e

# Trap SIGTERM and SIGINT to gracefully shutdown
trap 'echo "Shutting down..."; kill -TERM $DBPILL_PID $POSTGRES_PID 2>/dev/null || true; wait $DBPILL_PID $POSTGRES_PID 2>/dev/null || true; exit 0' INT TERM

# If PGDATA looks uninitialized but not empty (e.g., leftover from a previous attempt), clear it
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  if [ -d "$PGDATA" ]; then
    # Remove any content except lost+found to let initdb succeed
    find "$PGDATA" -mindepth 1 -maxdepth 1 ! -name 'lost+found' -exec rm -rf {} + 2>/dev/null || true
  fi
  chown -R postgres:postgres "$(dirname "$PGDATA")"
fi

# Start PostgreSQL using the official entrypoint (handles initdb and auth)
echo "Starting PostgreSQL (via official entrypoint) on port ${INTERNAL_POSTGRES_PORT:-5434}..."
/usr/local/bin/docker-entrypoint.sh postgres -p "${INTERNAL_POSTGRES_PORT:-5434}" &
POSTGRES_PID=$!

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
i=0
until pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -h 127.0.0.1 -p "${INTERNAL_POSTGRES_PORT:-5434}" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -gt 60 ]; then
    echo "ERROR: PostgreSQL did not become ready in time"
    exit 1
  fi
  echo "Waiting for PostgreSQL... ($i/60)"
  sleep 1
done
echo "PostgreSQL is running and ready"

# Build connection string
POSTGRES_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${INTERNAL_POSTGRES_PORT:-5434}/${POSTGRES_DB}"

# Start dbpill application
echo "Starting dbpill application on proxy port ${PROXY_PORT} and web port ${WEB_PORT}..."
cd /app
npx tsx run.ts "$POSTGRES_URL" --web-port "${WEB_PORT}" --proxy-port "${PROXY_PORT}" &
DBPILL_PID=$!

# Wait for both processes
wait $DBPILL_PID $POSTGRES_PID
