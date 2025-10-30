# dbpill

This is a PostgreSQL proxy that intercepts all queries & provides a web interface to profile them, sort them, auto-suggest indexes to improve performance, and immediately apply changes & measure improvements, with instant rollback when performance isn't improved. See https://dbpill.com for more info

# Quick run

## Using Docker (Recommended)

**With integrated PostgreSQL:**
```bash
docker-compose -f docker-compose.pg17.yml up
```

**Standalone (requires external PostgreSQL):**
```bash
POSTGRES_URL=postgresql://user:pass@host:5432/dbname docker-compose -f docker-compose.standalone.yml up
```

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
