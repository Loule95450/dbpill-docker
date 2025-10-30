#!/bin/bash
set -e

# Trap SIGTERM and SIGINT to gracefully shutdown
trap 'echo "Shutting down..."; kill -TERM $DBPILL_PID $POSTGRES_PID 2>/dev/null; wait $DBPILL_PID $POSTGRES_PID; exit 0' SIGTERM SIGINT

# Function to wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if su-exec postgres psql -U "${POSTGRES_USER}" -d postgres -c '\q' 2>/dev/null; then
            echo "PostgreSQL is ready!"
            return 0
        fi
        echo "Waiting for PostgreSQL... ($i/30)"
        sleep 1
    done
    echo "ERROR: PostgreSQL did not become ready in time"
    return 1
}

# Initialize PostgreSQL if data directory is empty
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."
    su-exec postgres initdb -D "$PGDATA" --username="$POSTGRES_USER" --pwfile=<(echo "$POSTGRES_PASSWORD")
    
    # Configure PostgreSQL to listen on all interfaces
    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "listen_addresses='*'" >> "$PGDATA/postgresql.conf"
fi

# Start PostgreSQL in the background
echo "Starting PostgreSQL..."
su-exec postgres postgres -D "$PGDATA" &
POSTGRES_PID=$!

# Wait for PostgreSQL to be ready
wait_for_postgres

# Create database if it doesn't exist
su-exec postgres psql -U "${POSTGRES_USER}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1 || \
    su-exec postgres psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${POSTGRES_DB};"

echo "PostgreSQL is running and ready"

# Build connection string
POSTGRES_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

# Start dbpill application
echo "Starting dbpill application..."
cd /app
npx tsx run.ts "$POSTGRES_URL" --web-port "${WEB_PORT}" --proxy-port "${PROXY_PORT}" &
DBPILL_PID=$!

# Wait for both processes
wait $DBPILL_PID $POSTGRES_PID
