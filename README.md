# dbpill

This is a PostgreSQL proxy that intercepts all queries & provides a web interface to profile them, sort them, auto-suggest indexes to improve performance, and immediately apply changes & measure improvements, with instant rollback when performance isn't improved. See https://dbpill.com for more info

# Quick run

## Using Docker (Recommended)

There are two Compose options:

1) Integrated PostgreSQL (easiest)
- Starts dbpill and an internal PostgreSQL in the same container
- Proxy is exposed on port 5432 and the Web UI on 3000
- The internal PostgreSQL is NOT exposed outside the container

Run:
```bash
docker compose -f docker-compose.pg.yml up --build
```

Connect your apps/tools to the proxy:
- Host: localhost
- Port: 5432
- User: dbpill (default)
- Password: dbpill (default)
- Database: dbpill (default)

Web UI:
- http://localhost:3000

Notes:
- If you already have PostgreSQL listening on your host 5432, change the published port in `docker-compose.pg.yml` (e.g., `6543:5432`) or stop your local Postgres.
- Healthcheck: the container reports healthy when `pg_isready` succeeds through the proxy.

Config via environment variables (override in Compose or your shell):
- POSTGRES_USER (default: dbpill)
- POSTGRES_PASSWORD (default: dbpill)
- POSTGRES_DB (default: dbpill)
- WEB_PORT (default: 3000)
- PROXY_PORT (default: 5432)

2) Standalone (use your own PostgreSQL)
- Requires a PostgreSQL connection string
- Proxy is exposed on port 5432 and the Web UI on 3000

Run:
```bash
POSTGRES_URL=postgresql://user:pass@host:5432/dbname \
	docker compose -f docker-compose.standalone.yml up --build
```

Web UI:
- http://localhost:3000

Proxy:
- Connect your app to `localhost:5432` (or change the published port in the compose file if needed)

See [DOCKER.md](DOCKER.md) for complete Docker documentation.

## Using Node.js

```
npm install
npm run dev postgresql://user:pass@host:5432/dbname
```

There are two main components:

* The PostgreSQL `proxy` that intercepts & logs every query
* The `webapp` which displays, analyzes & optimizes the queries

# Requirements

## Docker
- Docker and Docker Compose

## Node.js
- Node version 22+ is required (for node:sqlite built-in package)
